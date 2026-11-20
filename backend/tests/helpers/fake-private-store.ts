import { createHash } from 'node:crypto';
import {
  PrivateStorageError,
  type PrivateObjectStore,
  type PrivateStorageOperation,
  type SignedObjectUrl,
} from '../../src/shared/storage/private-object-store.js';
import { isPrivateObjectKey } from '../../src/shared/private-media/private-image-policy.js';

export interface StoredFake {
  body: Uint8Array;
  contentType: string;
  cacheControl: string | undefined;
}

/** What a client following a signed URL would get back. */
export interface FakeFetchResult {
  status: 200 | 403 | 404;
  body?: Uint8Array;
  /** Why it was refused, for assertions. */
  reason?: 'expired' | 'bad_signature' | 'missing';
}

const FAKE_HOST = 'https://private-fake.test';
const FAKE_SECRET = 'fake-private-store-signing-secret';

/**
 * An in-memory stand-in for the private bucket, so no test can ever reach real storage.
 *
 * - it refuses a key that is not a private member-photo key, exactly like the real adapter, so a test cannot pass by
 *   storing something the production store would have refused;
 * - signed URLs are real enough to test the rules that matter: they carry an expiry and a signature over (key,
 *   expiry), and `fetchSigned` answers 403 for an expired or tampered URL and 404 for an object that is gone;
 * - `failNext` injects a storage outage for the next calls of an operation.
 */
export class FakePrivateObjectStore implements PrivateObjectStore {
  readonly objects = new Map<string, StoredFake>();
  readonly calls: { operation: PrivateStorageOperation | 'sign'; key: string }[] = [];
  /** The fake's clock: tests move it to expire URLs. */
  now: () => Date = () => new Date();

  private readonly failures: {
    operation: PrivateStorageOperation;
    times: number;
    match: (key: string) => boolean;
  }[] = [];

  /** Makes the next `times` calls of `operation` (for keys that `match`) fail like an outage. */
  failNext(
    operation: PrivateStorageOperation,
    times = 1,
    match: (key: string) => boolean = () => true,
  ): void {
    this.failures.push({ operation, times, match });
  }

  /** Storage is back: forget every injected outage. */
  clearFailures(): void {
    this.failures.length = 0;
  }

  get keys(): string[] {
    return [...this.objects.keys()].sort();
  }

  count(operation: PrivateStorageOperation | 'sign', key?: string): number {
    return this.calls.filter((c) => c.operation === operation && (key === undefined || c.key === key)).length;
  }

  private guard(operation: PrivateStorageOperation, key: string): void {
    if (!isPrivateObjectKey(key))
      throw new Error('Refusing to use a key that is not a private member-photo key');
    this.calls.push({ operation, key });
    const failure = this.failures.find((f) => f.operation === operation && f.times > 0 && f.match(key));
    if (failure) {
      failure.times -= 1;
      throw new PrivateStorageError(operation, 'http', 503);
    }
  }

  async put(object: {
    key: string;
    body: Uint8Array;
    contentType: string;
    cacheControl?: string;
  }): Promise<void> {
    this.guard('put', object.key);
    this.objects.set(object.key, {
      body: new Uint8Array(object.body),
      contentType: object.contentType,
      cacheControl: object.cacheControl,
    });
  }

  async exists(key: string): Promise<boolean> {
    this.guard('head', key);
    return this.objects.has(key);
  }

  async delete(key: string): Promise<void> {
    this.guard('delete', key);
    this.objects.delete(key); // idempotent, like S3
  }

  presignGet(key: string, options: { expiresInSeconds: number }): SignedObjectUrl {
    if (!isPrivateObjectKey(key))
      throw new Error('Refusing to use a key that is not a private member-photo key');
    this.calls.push({ operation: 'sign', key });
    const expiresAt = new Date(this.now().getTime() + options.expiresInSeconds * 1000);
    const exp = Math.floor(expiresAt.getTime() / 1000);
    return { url: `${FAKE_HOST}/${key}?exp=${exp}&sig=${this.signature(key, exp)}`, expiresAt };
  }

  private signature(key: string, exp: number): string {
    return createHash('sha256').update(`${FAKE_SECRET}|${key}|${exp}`).digest('hex').slice(0, 32);
  }

  /** What GETting a signed URL would answer, at the fake clock's current time. */
  fetchSigned(url: string): FakeFetchResult {
    const parsed = new URL(url);
    const key = decodeURIComponent(parsed.pathname.slice(1));
    const exp = Number(parsed.searchParams.get('exp'));
    if (parsed.origin !== FAKE_HOST || !isPrivateObjectKey(key))
      return { status: 403, reason: 'bad_signature' };
    if (parsed.searchParams.get('sig') !== this.signature(key, exp))
      return { status: 403, reason: 'bad_signature' };
    if (this.now().getTime() >= exp * 1000) return { status: 403, reason: 'expired' };
    const stored = this.objects.get(key);
    return stored ? { status: 200, body: stored.body } : { status: 404, reason: 'missing' };
  }
}

/** The key a signed fake URL points at. */
export const keyOfFakeUrl = (url: string): string => decodeURIComponent(new URL(url).pathname.slice(1));
