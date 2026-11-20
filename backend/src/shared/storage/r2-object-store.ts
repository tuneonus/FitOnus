import { encodeObjectPath, signRequest } from './sigv4.js';

export interface R2ObjectStoreOptions {
  /** Cloudflare account id: only used to build the S3 endpoint host. */
  accountId: string;
  accessKeyId: string;
  /** Never logged, never returned, never part of an error message. */
  secretAccessKey: string;
  bucket: string;
  timeoutMs: number;
  /** Injected in tests; defaults to the global fetch. */
  fetch?: typeof fetch;
  now?: () => Date;
}

export interface PutObjectInput {
  key: string;
  body: Uint8Array;
  contentType: string;
  /** Sent as the object's Cache-Control, so the CDN and browsers know how long they may keep it. */
  cacheControl?: string;
}

export type R2Operation = 'put' | 'head';
export type R2FailureReason = 'http' | 'timeout' | 'network';

/**
 * A storage call failed. Carries only the operation, the HTTP status and a coarse reason: the response body,
 * the request URL and every header are deliberately left out, so an error can be logged without leaking
 * anything about credentials or the bucket layout.
 */
export class R2StorageError extends Error {
  override readonly name = 'R2StorageError';
  constructor(
    readonly operation: R2Operation,
    readonly reason: R2FailureReason,
    readonly status: number | null,
  ) {
    super(`R2 ${operation} failed (${reason}${status === null ? '' : ` HTTP ${status}`})`);
  }
}

/** Object keys this backend writes are plain `a/b/c.ext` paths. Anything else is a bug, not user input. */
const SAFE_KEY = /^[A-Za-z0-9][A-Za-z0-9._\-/]*$/;

const isTimeout = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');

/**
 * Minimal Cloudflare R2 client over its S3-compatible API: write one object and check that one exists.
 * Path-style addressing (`/<bucket>/<key>`) on the account endpoint, region `auto`.
 */
export class R2ObjectStore {
  private readonly host: string;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly options: R2ObjectStoreOptions) {
    this.host = `${options.accountId}.r2.cloudflarestorage.com`;
    this.fetchFn = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async put(input: PutObjectInput): Promise<void> {
    const headers: Record<string, string> = { 'content-type': input.contentType };
    if (input.cacheControl) headers['cache-control'] = input.cacheControl;
    const response = await this.request('put', 'PUT', input.key, input.body, headers);
    if (!response.ok) throw new R2StorageError('put', 'http', response.status);
  }

  /** True when the object exists, false on 404. Any other answer is an error, never a guess. */
  async exists(key: string): Promise<boolean> {
    const response = await this.request('head', 'HEAD', key, new Uint8Array(0), {});
    if (response.ok) return true;
    if (response.status === 404) return false;
    throw new R2StorageError('head', 'http', response.status);
  }

  private async request(
    operation: R2Operation,
    method: 'PUT' | 'HEAD',
    key: string,
    body: Uint8Array,
    extraHeaders: Record<string, string>,
  ): Promise<Response> {
    if (!SAFE_KEY.test(key) || key.includes('..') || key.includes('//')) {
      throw new Error('Refusing to use an unsafe object key');
    }
    const path = encodeObjectPath(`/${this.options.bucket}/${key}`);
    const headers = signRequest(
      {
        method,
        host: this.host,
        path,
        headers: extraHeaders,
        payload: body,
        region: 'auto',
        service: 's3',
        now: this.now(),
      },
      { accessKeyId: this.options.accessKeyId, secretAccessKey: this.options.secretAccessKey },
    );
    try {
      return await this.fetchFn(`https://${this.host}${path}`, {
        method,
        headers,
        ...(method === 'PUT' ? { body } : {}),
        // The signed request must only ever reach the endpoint it was signed for.
        redirect: 'error',
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (error) {
      throw new R2StorageError(operation, isTimeout(error) ? 'timeout' : 'network', null);
    }
  }
}
