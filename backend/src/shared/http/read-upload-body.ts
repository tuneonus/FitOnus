import type { Readable } from 'node:stream';
import { AppError } from '../errors/app-error.js';

/**
 * The Content-Length the client declared, or null when absent or not a plain non-negative integer. Only used to
 * refuse an obviously oversized upload before reading it; the actual byte count is enforced while streaming.
 */
export function parseContentLength(header: string | undefined): number | null {
  return header !== undefined && /^\d{1,15}$/.test(header) ? Number(header) : null;
}

/**
 * Collects body chunks up to a byte limit. Past the limit it keeps counting but holds nothing, so the memory a
 * client can make the server use is bounded by `maxBytes` however much it sends.
 */
export class BoundedBody {
  private chunks: Buffer[] = [];
  private seen = 0;

  constructor(private readonly maxBytes: number) {}

  add(chunk: Buffer): void {
    this.seen += chunk.length;
    if (this.seen > this.maxBytes) {
      this.chunks = []; // release what was held; the body is going to be refused
      return;
    }
    this.chunks.push(chunk);
  }

  get exceeded(): boolean {
    return this.seen > this.maxBytes;
  }

  /** Bytes currently held in memory. Never more than `maxBytes`. */
  get heldBytes(): number {
    return this.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.chunks, this.heldBytes);
  }
}

/**
 * Reads a request body into memory without ever holding more than `maxBytes` of it.
 *
 * Past the limit the rest of the body is read and discarded rather than abandoned, and only then is the request
 * refused. Abandoning it (or destroying the stream) would reset the connection, so the browser would see a network
 * error instead of the explanation. The total time is still bounded by the server's request timeout.
 */
export function readBodyUpTo(stream: Readable, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const body = new BoundedBody(maxBytes);
    let settled = false;

    const settle = (outcome: () => void): void => {
      if (settled) return;
      settled = true;
      stream.off('data', onData);
      stream.off('end', onEnd);
      stream.off('error', onInterrupted);
      stream.off('close', onInterrupted);
      outcome();
    };

    function onData(chunk: Buffer | string): void {
      body.add(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }

    function onEnd(): void {
      settle(() => {
        if (body.exceeded) {
          reject(
            new AppError(
              'payload_too_large',
              'PAYLOAD_TOO_LARGE',
              `The upload is larger than ${maxBytes / (1024 * 1024)} MB.`,
            ),
          );
          return;
        }
        resolve(body.toBuffer());
      });
    }

    function onInterrupted(): void {
      settle(() =>
        reject(new AppError('bad_request', 'BAD_REQUEST', 'The upload was interrupted. Try again.')),
      );
    }

    stream.on('data', onData);
    stream.on('end', onEnd);
    stream.on('error', onInterrupted);
    // `close` after `end` is ignored (already settled); `close` before it means the client went away mid-upload.
    stream.on('close', onInterrupted);
  });
}
