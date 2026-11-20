import { isPrivateObjectKey } from '../private-media/private-image-policy.js';
import {
  PrivateStorageError,
  type PrivateObjectStore,
  type PrivateStorageOperation,
  type SignedObjectUrl,
} from './private-object-store.js';
import { presignQuery } from './sigv4-presign.js';
import { encodeObjectPath, signRequest } from './sigv4.js';

export interface R2PrivateObjectStoreOptions {
  /** Cloudflare account id: only used to build the S3 endpoint host. */
  accountId: string;
  /** The credentials of the token scoped to the PRIVATE bucket only. Never logged, never returned. */
  accessKeyId: string;
  secretAccessKey: string;
  /** The private bucket (R2_PRIVATE_BUCKET). Not the public one: configuration refuses them being equal. */
  bucket: string;
  timeoutMs: number;
  /** Injected in tests; defaults to the global fetch. */
  fetch?: typeof fetch;
  now?: () => Date;
}

const isTimeout = (error: unknown): boolean =>
  error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');

/**
 * Cloudflare R2 (S3-compatible API) for the PRIVATE member-photo bucket: put, head, delete and signed GET URLs.
 * Path-style addressing (`/<bucket>/<key>`) on the account endpoint, region `auto`.
 *
 * Only keys of the private shape (`members/<owner>/<kind>/<hex>[.thumb].webp`) are accepted; anything else is a bug and
 * throws before a request is built. That, with the bucket being a different one with its own token, means this client
 * cannot address a public object even by mistake. It shares no code path with the public `R2ObjectStore`.
 */
export class R2PrivateObjectStore implements PrivateObjectStore {
  private readonly host: string;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly options: R2PrivateObjectStoreOptions) {
    this.host = `${options.accountId}.r2.cloudflarestorage.com`;
    this.fetchFn = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async put(input: {
    key: string;
    body: Uint8Array;
    contentType: string;
    cacheControl?: string;
  }): Promise<void> {
    const headers: Record<string, string> = { 'content-type': input.contentType };
    if (input.cacheControl) headers['cache-control'] = input.cacheControl;
    const response = await this.request('put', 'PUT', input.key, input.body, headers);
    if (!response.ok) throw new PrivateStorageError('put', 'http', response.status);
  }

  /** True when the object exists, false on 404. Any other answer is an error, never a guess. */
  async exists(key: string): Promise<boolean> {
    const response = await this.request('head', 'HEAD', key, new Uint8Array(0), {});
    if (response.ok) return true;
    if (response.status === 404) return false;
    throw new PrivateStorageError('head', 'http', response.status);
  }

  /** S3 answers 204 for a missing key as well; a 404 is also treated as done, so a retry never gets stuck. */
  async delete(key: string): Promise<void> {
    const response = await this.request('delete', 'DELETE', key, new Uint8Array(0), {});
    if (response.ok || response.status === 404) return;
    throw new PrivateStorageError('delete', 'http', response.status);
  }

  presignGet(key: string, options: { expiresInSeconds: number }): SignedObjectUrl {
    const path = this.pathOf(key);
    const now = this.now();
    const query = presignQuery(
      {
        method: 'GET',
        host: this.host,
        path,
        region: 'auto',
        service: 's3',
        now,
        expiresInSeconds: options.expiresInSeconds,
      },
      { accessKeyId: this.options.accessKeyId, secretAccessKey: this.options.secretAccessKey },
    );
    return {
      url: `https://${this.host}${path}?${query}`,
      expiresAt: new Date(now.getTime() + options.expiresInSeconds * 1000),
    };
  }

  private pathOf(key: string): string {
    if (!isPrivateObjectKey(key))
      throw new Error('Refusing to use a key that is not a private member-photo key');
    return encodeObjectPath(`/${this.options.bucket}/${key}`);
  }

  private async request(
    operation: PrivateStorageOperation,
    method: 'PUT' | 'HEAD' | 'DELETE',
    key: string,
    body: Uint8Array,
    extraHeaders: Record<string, string>,
  ): Promise<Response> {
    const path = this.pathOf(key);
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
      throw new PrivateStorageError(operation, isTimeout(error) ? 'timeout' : 'network', null);
    }
  }
}
