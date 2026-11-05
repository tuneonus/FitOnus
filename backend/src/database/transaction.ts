import { AsyncLocalStorage } from 'node:async_hooks';
import type pg from 'pg';
import type { UnitOfWork } from '../shared/application/unit-of-work.js';

export type QueryResultRow = pg.QueryResultRow;

/** The only query surface repositories receive. */
export interface SqlExecutor {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<pg.QueryResult<R>>;
}

/**
 * Pool wrapper that routes queries to the active transaction client, if any.
 *
 * Repositories never pick a connection themselves, so code running inside
 * `transaction()` cannot accidentally use a second connection outside it.
 */
interface TransactionContext {
  client: pg.PoolClient;
  /** Tail of the per-transaction query chain; one connection runs one query at a time. */
  tail: Promise<unknown>;
}

export class Database implements SqlExecutor {
  private readonly context = new AsyncLocalStorage<TransactionContext>();

  constructor(private readonly pool: pg.Pool) {}

  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<pg.QueryResult<R>> {
    const transaction = this.context.getStore();
    if (!transaction) return this.pool.query<R>(text, [...values]);

    // Concurrent calls inside a transaction (e.g. Promise.all) are queued, not interleaved.
    const result = transaction.tail.then(() => transaction.client.query<R>(text, [...values]));
    transaction.tail = result.catch(() => undefined);
    return result;
  }

  get inTransaction(): boolean {
    return this.context.getStore() !== undefined;
  }

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.context.getStore()) return work();

    const client = await this.pool.connect();
    const context: TransactionContext = { client, tail: Promise.resolve() };
    let discardClient = false;
    try {
      await client.query('BEGIN');
      const result = await this.context.run(context, work);
      await context.tail;
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await context.tail; // let queued queries settle before ROLLBACK uses the connection
        await client.query('ROLLBACK');
      } catch {
        // The connection is in an unknown state; destroy it instead of returning it to the pool.
        discardClient = true;
      }
      throw error;
    } finally {
      client.release(discardClient);
    }
  }

  /** Readiness probe: resolves when the database answers within `timeoutMs`. */
  async ping(timeoutMs: number): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Database ping timed out')), timeoutMs);
    });
    try {
      await Promise.race([this.pool.query('SELECT 1'), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}

export class PgUnitOfWork implements UnitOfWork {
  constructor(private readonly database: Database) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.database.transaction(work);
  }
}
