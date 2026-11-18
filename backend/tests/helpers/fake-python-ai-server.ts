import { createServer, type IncomingHttpHeaders, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface CapturedRequest {
  method: string | undefined;
  url: string | undefined;
  headers: IncomingHttpHeaders;
  body: unknown;
}

export type FakeHandler = (request: CapturedRequest, response: ServerResponse) => void | Promise<void>;

export interface FakePythonServer {
  url: string;
  requests: CapturedRequest[];
  /** Replace the behavior for subsequent requests. */
  respond(handler: FakeHandler): void;
  close(): Promise<void>;
}

export const json = (response: ServerResponse, status: number, body: unknown): void => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
};

/** A successful reply in the exact shape of ai-backend/contracts/coach_chat.py `CoachChatResponse`. */
export const okCoachReply = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  outcome: 'ok',
  result: {
    text: 'Great consistency! Add 20 g of protein at dinner.',
    followUps: ['What should I eat?'],
    sources: ['Profile', "Today's Nutrition"],
    medicalNote: false,
    blocks: null,
  },
  usage: {
    model: 'gemini-3.5-flash-lite',
    isFallback: false,
    inputTokens: 900,
    outputTokens: 120,
    cachedTokens: 0,
    thinkingTokens: 30,
    totalTokens: 1050,
    durationMs: 1234,
  },
  traceId: 'trace-1',
  ...overrides,
});

export const pythonError = (code: string, message: string, extra: Record<string, unknown> = {}) => ({
  error: { code, message, dispatched: true, ...extra },
});

/** A real HTTP server on an ephemeral localhost port that records every request it receives. */
export async function startFakePythonServer(initial?: FakeHandler): Promise<FakePythonServer> {
  const requests: CapturedRequest[] = [];
  let handler: FakeHandler = initial ?? ((_req, res) => json(res, 200, okCoachReply()));

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      let body: unknown = text;
      try {
        body = JSON.parse(text);
      } catch {
        /* keep raw text */
      }
      const captured: CapturedRequest = { method: req.method, url: req.url, headers: req.headers, body };
      requests.push(captured);
      void Promise.resolve(handler(captured, res));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    respond: (next) => {
      handler = next;
    },
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** A localhost URL where nothing is listening (connection refused). */
export async function closedPortUrl(): Promise<string> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return `http://127.0.0.1:${port}`;
}
