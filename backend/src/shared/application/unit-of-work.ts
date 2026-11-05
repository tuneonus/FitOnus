/**
 * Transaction boundary owned by application use cases.
 *
 * Every repository call made inside `run` joins the same database transaction;
 * the work commits when it resolves and rolls back when it throws. Nested calls
 * join the outer transaction instead of opening a second connection.
 * Keep slow external work (hashing, HTTP calls) outside `run`.
 */
export interface UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T>;
}
