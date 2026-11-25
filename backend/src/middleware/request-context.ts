import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { pinoHttp } from 'pino-http';
import type { Logger } from '../shared/logging/logger.js';
import {
  createRootTraceContext,
  isSafeCorrelationId,
  runWithCorrelationId,
  runWithTraceContext,
} from '../shared/logging/request-correlation.js';

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Assigns a request id (reusing a well-formed incoming X-Request-Id), echoes it back,
 * attaches `req.log`, and logs one line per request with status and duration.
 */
export function requestContext(logger: Logger): RequestHandler {
  return pinoHttp({
    logger,
    genReqId: (req, res) => {
      const incoming = req.headers[REQUEST_ID_HEADER];
      const id = isSafeCorrelationId(incoming) ? incoming : randomUUID();
      res.setHeader('X-Request-Id', id);
      return id;
    },
    customLogLevel: (_req, res, error) => {
      if (error || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    serializers: {
      // Path only: query strings can carry search terms or tokens.
      req: (req: { id: unknown; method: string; url?: string }) => ({
        id: req.id,
        method: req.method,
        path: req.url?.split('?')[0],
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
    autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false },
  });
}

/**
 * Makes the request id available to deep code (the Python AI client) through AsyncLocalStorage.
 *
 * Registered AFTER `express.json()` as a precaution: body parsers resume the request from stream
 * callbacks, and AsyncLocalStorage context does not always survive that on every Node/body-parser
 * combination. (Measured on this stack - Node 22, Express 5 - either order works; binding after body
 * parsing is the order that cannot depend on that detail.) Covered through the real middleware stack by
 * tests/unit/ai/request-correlation.test.ts.
 */
export const bindRequestCorrelation: RequestHandler = (req, _res, next) => {
  const id: unknown = req.id;
  const traceCtx = createRootTraceContext(req.headers['traceparent']);
  if (typeof id === 'string' || typeof id === 'number') {
    runWithCorrelationId(String(id), () => runWithTraceContext(traceCtx, next));
    return;
  }
  runWithTraceContext(traceCtx, next);
};
