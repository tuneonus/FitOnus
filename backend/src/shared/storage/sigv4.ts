import { createHash, createHmac } from 'node:crypto';

/**
 * AWS Signature Version 4 for S3-compatible object stores (Cloudflare R2 speaks it).
 *
 * Why this is written out instead of pulling in the AWS SDK: the SDK is several megabytes of dependencies for the
 * two calls this backend makes (PUT and HEAD of one object), and the project's other provider adapter (FCM) is
 * likewise a small `fetch` client. The function is pure and takes the clock as an argument, so it is verified
 * against the example published in AWS's documentation (see tests/unit/storage/sigv4.test.ts).
 *
 * Reference: https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
 */

export interface SigV4Credentials {
  accessKeyId: string;
  /** Never logged, never returned, never part of an error message. */
  secretAccessKey: string;
}

export interface SigV4Request {
  method: string;
  /** Host header value, e.g. `<account>.r2.cloudflarestorage.com`. Signed, but left for `fetch` to send. */
  host: string;
  /** Absolute path, already URI-encoded per segment (see `encodeObjectPath`). */
  path: string;
  /** Canonical query string, or empty. */
  query?: string;
  /** Extra headers to sign, e.g. content-type. Names are lower-cased here. */
  headers?: Readonly<Record<string, string>>;
  payload: Uint8Array | string;
  region: string;
  service: string;
  now: Date;
}

const sha256Hex = (data: Uint8Array | string): string => createHash('sha256').update(data).digest('hex');
const hmac = (key: Buffer | string, data: string): Buffer => createHmac('sha256', key).update(data).digest();

/** RFC 3986 unreserved characters stay as they are; S3 does not double-encode, so this runs exactly once. */
const encodeSegment = (segment: string): string =>
  encodeURIComponent(segment).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

export const encodeObjectPath = (path: string): string => path.split('/').map(encodeSegment).join('/');

/** `20130524T000000Z`: ISO-8601 basic format, no separators or milliseconds. */
const toAmzDate = (date: Date): string => date.toISOString().replace(/[:-]|\.\d{3}/g, '');

/**
 * Returns the headers to send besides `Host` (which `fetch` derives from the URL and which must equal
 * `request.host`): `Authorization`, `x-amz-date`, `x-amz-content-sha256`, plus the extra headers that were signed.
 */
export function signRequest(request: SigV4Request, credentials: SigV4Credentials): Record<string, string> {
  const amzDate = toAmzDate(request.now);
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(request.payload);

  const extra = Object.fromEntries(
    Object.entries(request.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]),
  );
  const toSign: Record<string, string> = {
    ...extra,
    host: request.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };

  const names = Object.keys(toSign).sort();
  // Header values are trimmed and inner whitespace collapsed, as the specification requires.
  const canonicalHeaders = names
    .map((name) => `${name}:${toSign[name]!.trim().replace(/\s+/g, ' ')}\n`)
    .join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = [
    request.method.toUpperCase(),
    request.path,
    request.query ?? '',
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const scope = `${dateStamp}/${request.region}/${request.service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');

  const signingKey = [dateStamp, request.region, request.service, 'aws4_request'].reduce<Buffer | string>(
    (key, part) => hmac(key, part),
    `AWS4${credentials.secretAccessKey}`,
  );
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  return {
    ...extra,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    Authorization:
      `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
