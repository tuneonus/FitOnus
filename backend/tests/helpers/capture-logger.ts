import { Writable } from 'node:stream';
import { createLogger } from '../../src/shared/logging/logger.js';

/**
 * The REAL application logger (same redaction, same base fields) writing its JSON lines into memory,
 * so tests assert on exactly what Render would receive.
 */
export function createCapturingLogger(level = 'debug') {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer | string, _encoding, done) {
      lines.push(String(chunk).trimEnd());
      done();
    },
  });
  const logger = createLogger({ level, pretty: false }, destination);
  const entries = (): Array<Record<string, unknown>> =>
    lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  return {
    logger,
    lines,
    entries,
    /** Entries whose `event` field equals `name`. */
    events: (name: string) => entries().filter((entry) => entry.event === name),
    /** Everything written so far as one string, for "this must never appear" assertions. */
    text: () => lines.join('\n'),
  };
}
