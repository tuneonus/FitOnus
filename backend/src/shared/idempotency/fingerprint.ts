/**
 * Deterministic JSON: object keys sorted recursively, so semantically equal payloads
 * produce the same fingerprint regardless of key order.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalise(value));
}

function normalise(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
      throw new TypeError(`Cannot fingerprint a value of type ${typeof value}`);
    }
    return value;
  }
  if (Array.isArray(value)) return value.map(normalise);
  if (value instanceof Date) return value.toISOString();

  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const entry = (value as Record<string, unknown>)[key];
    if (entry !== undefined) sorted[key] = normalise(entry);
  }
  return sorted;
}
