import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadMigrations } from '../../../src/database/migration-runner.js';
import { MIGRATIONS_DIR } from '../../helpers/test-database.js';

/**
 * A migration that is not in git breaks every fresh database, CI run and deploy, and the migration runner
 * refuses to continue on a database that already applied a file the checkout does not have. Migrations 0019
 * and 0020 were once lost because `*.sql` in .gitignore also matched them. These tests keep that from
 * happening silently again.
 */

const BACKEND_DIR = path.dirname(MIGRATIONS_DIR);

/** True when git can answer questions about this directory (false in an exported tarball or image). */
const inGitCheckout =
  spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: BACKEND_DIR }).stdout?.toString().trim() ===
  'true';

/** `git check-ignore` exit codes: 0 = ignored, 1 = not ignored. `--no-index` judges the rules even for tracked files. */
const isIgnoredByGit = (relativePath: string): boolean => {
  const result = spawnSync('git', ['check-ignore', '--no-index', '-q', relativePath], { cwd: BACKEND_DIR });
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`git check-ignore failed: ${result.stderr.toString()}`);
  }
  return result.status === 0;
};

describe('migrations are reproducible from a clean checkout', () => {
  it('versions run 0001..N with no gaps', async () => {
    const versions = (await loadMigrations(MIGRATIONS_DIR)).map((migration) => migration.version);
    expect(versions).toEqual(Array.from({ length: versions.length }, (_unused, index) => index + 1));
  });

  it.skipIf(!inGitCheckout)('git does not ignore any existing migration file', async () => {
    const ignored = (await loadMigrations(MIGRATIONS_DIR))
      .map((migration) => `migrations/${migration.filename}`)
      .filter(isIgnoredByGit);
    expect(ignored).toEqual([]);
  });

  it.skipIf(!inGitCheckout)('git would not ignore the NEXT migration someone adds', () => {
    expect(isIgnoredByGit('migrations/9999_next_change.sql')).toBe(false);
  });

  it.skipIf(!inGitCheckout)(
    'database dumps and backups stay ignored (the reason the .sql rule exists)',
    () => {
      for (const dump of ['dump.sql', 'backups/prod.sql', 'scripts/export.sql', 'db.dump']) {
        expect(isIgnoredByGit(dump), dump).toBe(true);
      }
    },
  );
});
