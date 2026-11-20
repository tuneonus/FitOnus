/**
 * Configuration of the private member-media bucket, read from environment variables ONLY (never from a file in the
 * repository, never sent to a client, never logged).
 *
 * | Variable                        | Meaning                                                              |
 * | ------------------------------- | -------------------------------------------------------------------- |
 * | `R2_ACCOUNT_ID`                 | the Cloudflare account (shared with the public bucket's settings)     |
 * | `R2_PRIVATE_BUCKET`             | the private bucket, e.g. `tuneonus-private` (DEV) or a PROD bucket    |
 * | `R2_PRIVATE_ACCESS_KEY_ID`      | S3 key of a token scoped to that bucket only (SECRET)                 |
 * | `R2_PRIVATE_SECRET_ACCESS_KEY`  | its secret (SECRET)                                                   |
 * | `PRIVATE_MEDIA_URL_TTL_SECONDS` | lifetime of a signed picture URL, 60 to 3600, default 900 (15 min)    |
 * | `PRIVATE_MEDIA_PURGE_ENABLED`   | run the deletion worker in this process, default true                 |
 *
 * The three `R2_PRIVATE_*` values are all-or-none: none set turns private media off (avatar and progress-photo routes
 * answer 503 and nothing else is affected). There is deliberately NO public-URL variable: a private bucket has no
 * public domain, and setting `R2_PRIVATE_PUBLIC_BASE_URL` is refused so nobody wires one up by habit.
 *
 * Each environment (DEV, PROD) sets its own `R2_PRIVATE_BUCKET` and token; the code has no environment-specific names.
 * Parsing is a pure function of the raw values so it can be tested without touching `process.env`.
 */

export interface PrivateMediaConfig {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  timeoutMs: number;
  urlTtlSeconds: number;
  purgeEnabled: boolean;
}

export type RawPrivateMediaEnv = Readonly<Record<string, string | undefined>>;

export interface PublicBucketSettings {
  bucket: string;
  accessKeyId: string;
}

export const PRIVATE_MEDIA_URL_TTL_DEFAULT_SECONDS = 900;
export const PRIVATE_MEDIA_URL_TTL_MIN_SECONDS = 60;
export const PRIVATE_MEDIA_URL_TTL_MAX_SECONDS = 3600;

const PRIVATE_KEYS = [
  'R2_PRIVATE_BUCKET',
  'R2_PRIVATE_ACCESS_KEY_ID',
  'R2_PRIVATE_SECRET_ACCESS_KEY',
] as const;

export interface ParsedPrivateMediaConfig {
  /** Null when private media is not configured (feature off). */
  config: PrivateMediaConfig | null;
  /** Human-readable problems; never contain a secret value. */
  issues: string[];
}

export function parsePrivateMediaConfig(
  raw: RawPrivateMediaEnv,
  context: { timeoutMs: number; publicBucket?: PublicBucketSettings | null },
): ParsedPrivateMediaConfig {
  const value = (key: string): string => raw[key]?.trim() ?? '';
  const issues: string[] = [];

  if (value('R2_PRIVATE_PUBLIC_BASE_URL')) {
    issues.push(
      'R2_PRIVATE_PUBLIC_BASE_URL: a private bucket has no public address by design; remove it ' +
        '(pictures are read through short-lived signed URLs issued by the backend)',
    );
  }

  const present = PRIVATE_KEYS.filter((key) => value(key));
  if (present.length === 0) return { config: null, issues };

  for (const key of PRIVATE_KEYS) {
    if (!value(key))
      issues.push(`${key}: required when any R2_PRIVATE_* variable is set (set all three together, or none)`);
  }
  if (!value('R2_ACCOUNT_ID')) issues.push('R2_ACCOUNT_ID: required for private media');
  else if (!/^[0-9a-f]{32}$/i.test(value('R2_ACCOUNT_ID'))) {
    issues.push('R2_ACCOUNT_ID: must be the 32-character Cloudflare account id');
  }

  const bucket = value('R2_PRIVATE_BUCKET');
  if (bucket && !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) {
    issues.push('R2_PRIVATE_BUCKET: must be a bucket name (3-63 lowercase letters, digits or hyphens)');
  }
  const publicBucket = context.publicBucket;
  if (publicBucket && bucket && bucket === publicBucket.bucket) {
    issues.push(
      'R2_PRIVATE_BUCKET: must not be the public media bucket (R2_BUCKET); member photos never go there',
    );
  }
  const accessKeyId = value('R2_PRIVATE_ACCESS_KEY_ID');
  if (publicBucket && accessKeyId && accessKeyId === publicBucket.accessKeyId) {
    issues.push(
      'R2_PRIVATE_ACCESS_KEY_ID: must not reuse the public bucket token; create one scoped to the private bucket only',
    );
  }

  let urlTtlSeconds = PRIVATE_MEDIA_URL_TTL_DEFAULT_SECONDS;
  const ttlRaw = value('PRIVATE_MEDIA_URL_TTL_SECONDS');
  if (ttlRaw) {
    const ttl = Number(ttlRaw);
    if (
      !/^\d+$/.test(ttlRaw) ||
      ttl < PRIVATE_MEDIA_URL_TTL_MIN_SECONDS ||
      ttl > PRIVATE_MEDIA_URL_TTL_MAX_SECONDS
    ) {
      issues.push(
        `PRIVATE_MEDIA_URL_TTL_SECONDS: must be a whole number from ${PRIVATE_MEDIA_URL_TTL_MIN_SECONDS} to ` +
          `${PRIVATE_MEDIA_URL_TTL_MAX_SECONDS}`,
      );
    } else urlTtlSeconds = ttl;
  }

  let purgeEnabled = true;
  const purgeRaw = value('PRIVATE_MEDIA_PURGE_ENABLED').toLowerCase();
  if (purgeRaw) {
    if (purgeRaw !== 'true' && purgeRaw !== 'false')
      issues.push('PRIVATE_MEDIA_PURGE_ENABLED: must be true or false');
    else purgeEnabled = purgeRaw === 'true';
  }

  if (issues.length > 0) return { config: null, issues };
  return {
    config: {
      accountId: value('R2_ACCOUNT_ID'),
      bucket,
      accessKeyId,
      secretAccessKey: value('R2_PRIVATE_SECRET_ACCESS_KEY'),
      timeoutMs: context.timeoutMs,
      urlTtlSeconds,
      purgeEnabled,
    },
    issues,
  };
}
