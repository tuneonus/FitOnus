/**
 * Helpers for the few places where SQL text is built dynamically.
 * Values always travel as parameters ($1, $2 …); only these vetted fragments are interpolated.
 */

/** Escapes LIKE/ILIKE wildcards in user input. Pair with `ESCAPE '\'` in the query. */
export const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (char) => `\\${char}`);

const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;

/**
 * Quotes an identifier (table, column, database name) after validating it.
 * Identifiers can never be bound as parameters, so this is the only safe way to interpolate one.
 */
export function quoteIdentifier(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error(`Unsafe SQL identifier: ${JSON.stringify(name)}`);
  return `"${name}"`;
}

/** Maps an API sort key onto a whitelisted column; unknown keys are a programming error. */
export function orderByClause<K extends string>(
  columns: Readonly<Record<K, string>>,
  key: K,
  direction: 'asc' | 'desc',
): string {
  const column = columns[key];
  if (!column) throw new Error(`Unknown sort key: ${key}`);
  const dir = direction === 'asc' ? 'ASC' : 'DESC';
  return `ORDER BY ${quoteIdentifier(column)} ${dir}, "id" ${dir}`;
}
