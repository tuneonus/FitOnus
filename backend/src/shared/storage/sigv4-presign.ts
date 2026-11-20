import { createHash, createHmac } from 'node:crypto';
import type { SigV4Credentials } from './sigv4.js';

/**
 * AWS Signature Version 4, query-string flavour ("presigned URL"): the signature travels in the URL, so whoever holds
 * the URL can perform exactly that one request until it expires, and nothing else.
 *
 * Kept apart from `sigv4.ts` (header signing for the public bucket) so that the public storage code is untouched.
 * Pure, with the clock as an argument, and verified against the example in AWS's documentation
 * (tests/unit/storage/sigv4-presign.test.ts).
 *
 * Reference: https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
 */

export interface PresignRequest {
  method: 'GET';
  /** Host the URL will be used against, e.g. `<account>.r2.cloudflarestorage.com`. Signed. */
  host: string;
  /** Absolute path, already URI-encoded per segment (see `encodeObjectPath`). */
  path: string;
  region: string;
  service: string;
  now: Date;
  /** 1 to 604800 (seven days), the limit of SigV4. */
  expiresInSeconds: number;
}

const MAX_EXPIRY_SECONDS = 604_800;

const sha256Hex = (data: string): string => createHash('sha256').update(data).digest('hex');
const hmac = (key: Buffer | string, data: string): Buffer => createHmac('sha256', key).update(data).digest();

/** RFC 3986 unreserved characters stay as they are; everything else (including `/`) is percent-encoded. */
const encodeQueryComponent = (value: string): string =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

const toAmzDate = (date: Date): string => date.toISOString().replace(/[:-]|\.\d{3}/g, '');

/** The full query string to append (without `?`), ending with the signature. */
export function presignQuery(request: PresignRequest, credentials: SigV4Credentials): string {
  if (
    !Number.isInteger(request.expiresInSeconds) ||
    request.expiresInSeconds < 1 ||
    request.expiresInSeconds > MAX_EXPIRY_SECONDS
  ) {
    throw new RangeError(`A presigned URL must expire in 1 to ${MAX_EXPIRY_SECONDS} seconds`);
  }
  const amzDate = toAmzDate(request.now);
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${request.region}/${request.service}/aws4_request`;

  const params: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${credentials.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(request.expiresInSeconds),
    'X-Amz-SignedHeaders': 'host',
  };
  const canonicalQuery = Object.keys(params)
    .sort()
    .map((name) => `${encodeQueryComponent(name)}=${encodeQueryComponent(params[name]!)}`)
    .join('&');

  const canonicalRequest = [
    request.method,
    request.path,
    canonicalQuery,
    `host:${request.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');

  const signingKey = [dateStamp, request.region, request.service, 'aws4_request'].reduce<Buffer | string>(
    (key, part) => hmac(key, part),
    `AWS4${credentials.secretAccessKey}`,
  );
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
  return `${canonicalQuery}&X-Amz-Signature=${signature}`;
}
