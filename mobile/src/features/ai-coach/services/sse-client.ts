export class SseStreamError extends Error {
  override readonly name = 'SseStreamError';
  readonly code: string;
  readonly status?: number | undefined;
  readonly retryable: boolean;

  constructor(
    code: string,
    message: string,
    options?: {
      status?: number | undefined;
      retryable?: boolean | undefined;
      cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.code = code;
    this.status = options?.status;
    this.retryable = options?.retryable ?? true;
  }
}

export type ParsedSseFrame = {
  event: string;
  data: string;
  id?: string | undefined;
};

const VALID_STAGES = new Set([
  'validating',
  'loading_context',
  'routing',
  'agent_planning',
  'tool_calling',
  'agent_working',
  'synthesizing',
  'finalizing',
]);

export function parseRawSseFrame(block: string): ParsedSseFrame | null {
  const lines = block.split('\n');
  let eventName = 'message';
  let frameId: string | undefined;
  const dataLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line === '' || line.startsWith(':')) continue;
    const colonIdx = line.indexOf(':');
    const field = colonIdx === -1 ? line : line.slice(0, colonIdx);
    let value = colonIdx === -1 ? '' : line.slice(colonIdx + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') eventName = value || 'message';
    else if (field === 'id') frameId = value;
    else if (field === 'data') dataLines.push(value);
  }

  if (dataLines.length === 0 && eventName === 'message') {
    return null;
  }
  return {
    event: eventName,
    data: dataLines.join('\n'),
    ...(frameId !== undefined ? { id: frameId } : {}),
  };
}

export type DecodedSsePayload = Record<string, unknown>;

export function tryParseSseEventJson(frame: ParsedSseFrame): DecodedSsePayload | null {
  if (!frame.data) return null;
  try {
    const parsed: unknown = JSON.parse(frame.data);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    const obj = parsed as DecodedSsePayload;
    const typeVal = typeof obj.type === 'string' ? obj.type : frame.event;
    if (typeVal === 'status' && typeof obj.stage === 'string' && !VALID_STAGES.has(obj.stage)) {
      obj.stage = 'agent_working';
    }
    return { ...obj, type: typeVal };
  } catch {
    return null;
  }
}

/** Stateful incremental SSE frame splitter that safely handles split multi-byte / multi-line chunks. */
export class IncrementalSseParser {
  private buffer = '';

  feed(chunkText: string): ParsedSseFrame[] {
    if (!chunkText) return [];
    this.buffer += chunkText.replace(/\r\n/g, '\n');
    const frames: ParsedSseFrame[] = [];
    let splitIdx = this.buffer.indexOf('\n\n');
    while (splitIdx !== -1) {
      const block = this.buffer.slice(0, splitIdx);
      this.buffer = this.buffer.slice(splitIdx + 2);
      const parsed = parseRawSseFrame(block);
      if (parsed) frames.push(parsed);
      splitIdx = this.buffer.indexOf('\n\n');
    }
    return frames;
  }

  flush(): ParsedSseFrame[] {
    const trimmed = this.buffer.trim();
    this.buffer = '';
    if (!trimmed) return [];
    const parsed = parseRawSseFrame(trimmed);
    return parsed ? [parsed] : [];
  }
}

export type OpenSseStreamParams = {
  url: string;
  body: unknown;
  headers?: Record<string, string> | undefined;
  getToken?: (() => Promise<string | null>) | undefined;
  refreshToken?: (() => Promise<string | null>) | undefined;
  signal?: AbortSignal | undefined;
  timeoutMs?: number | undefined;
  fetchImpl?: typeof fetch | undefined;
  onEvent: (event: DecodedSsePayload) => void;
  onMalformedEvent?: ((frame: ParsedSseFrame) => void) | undefined;
};

function parseHttpErrorBody(
  status: number,
  rawText: string,
): { code: string; message: string; retryable: boolean } {
  let code = status === 429 ? 'RATE_LIMITED' : status === 422 ? 'FEATURE_DISABLED' : 'STREAM_HTTP_ERROR';
  let message = `Streaming request failed (${status})`;
  try {
    const json = JSON.parse(rawText) as {
      error?: { code?: unknown; message?: unknown };
      message?: unknown;
    };
    if (typeof json.error?.code === 'string') code = json.error.code;
    if (typeof json.error?.message === 'string') message = json.error.message;
    else if (typeof json.message === 'string') message = json.message;
  } catch {
    // Plain text error body; keep generic safe message.
  }
  const retryable = status === 429 || status >= 500 || status === 408;
  return { code, message, retryable };
}

function streamViaXhr(params: {
  url: string;
  bodyJson: string;
  headers: Record<string, string>;
  signal?: AbortSignal | undefined;
  timeoutMs: number;
  parser: IncrementalSseParser;
  onEvent: (event: DecodedSsePayload) => void;
  onMalformedEvent?: ((frame: ParsedSseFrame) => void) | undefined;
}): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const XhrCtor = (globalThis as { XMLHttpRequest?: typeof XMLHttpRequest }).XMLHttpRequest;
    if (!XhrCtor) {
      reject(new SseStreamError('STREAM_UNSUPPORTED', 'Streaming transport is unavailable.', { retryable: false }));
      return;
    }

    const xhr = new XhrCtor();
    let seenIndex = 0;
    let settled = false;

    const cleanup = (): void => {
      params.signal?.removeEventListener('abort', onAbort);
    };

    const fail = (err: SseStreamError): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    };

    const complete = (): void => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    const onAbort = (): void => {
      xhr.abort();
      fail(new SseStreamError('STREAM_CANCELLED', 'Generation stopped.', { retryable: false }));
    };

    if (params.signal?.aborted) {
      fail(new SseStreamError('STREAM_CANCELLED', 'Generation stopped.', { retryable: false }));
      return;
    }
    params.signal?.addEventListener('abort', onAbort, { once: true });

    const drainResponseText = (): void => {
      const text = xhr.responseText || '';
      if (text.length <= seenIndex) return;
      const delta = text.slice(seenIndex);
      seenIndex = text.length;
      if (xhr.status >= 200 && xhr.status < 300) {
        const frames = params.parser.feed(delta);
        for (const frame of frames) {
          const decoded = tryParseSseEventJson(frame);
          if (decoded) params.onEvent(decoded);
          else params.onMalformedEvent?.(frame);
        }
      }
    };

    xhr.open('POST', params.url, true);
    xhr.timeout = params.timeoutMs;
    for (const [k, v] of Object.entries(params.headers)) {
      xhr.setRequestHeader(k, v);
    }

    xhr.onprogress = () => {
      drainResponseText();
    };

    xhr.onload = () => {
      drainResponseText();
      if (xhr.status < 200 || xhr.status >= 300) {
        const parsedErr = parseHttpErrorBody(xhr.status, xhr.responseText || '');
        fail(
          new SseStreamError(parsedErr.code, parsedErr.message, {
            status: xhr.status,
            retryable: parsedErr.retryable,
          }),
        );
        return;
      }
      for (const frame of params.parser.flush()) {
        const decoded = tryParseSseEventJson(frame);
        if (decoded) params.onEvent(decoded);
        else params.onMalformedEvent?.(frame);
      }
      complete();
    };

    xhr.onerror = () => {
      fail(new SseStreamError('STREAM_INTERRUPTED', 'Network error during streaming.', { retryable: true }));
    };

    xhr.ontimeout = () => {
      fail(new SseStreamError('PROVIDER_TIMEOUT', 'AI request timed out. Please try again.', { retryable: true }));
    };

    xhr.onabort = () => {
      fail(new SseStreamError('STREAM_CANCELLED', 'Generation stopped.', { retryable: false }));
    };

    xhr.send(params.bodyJson);
  });
}

/**
 * Opens an authenticated POST SSE stream compatible with Expo React Native runtimes
 * (`fetch` ReadableStream where supported, falling back to `XMLHttpRequest.onprogress` when
 * `body.getReader` is unavailable), handling 401 token refresh, malformed frames, and abort.
 */
export async function openCoachSseStream(params: OpenSseStreamParams): Promise<void> {
  const fetchImpl = params.fetchImpl ?? fetch;
  const timeoutMs = params.timeoutMs ?? 30_000;
  const bodyJson = JSON.stringify(params.body);

  let token = params.getToken ? await params.getToken() : null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (params.signal?.aborted) {
      throw new SseStreamError('STREAM_CANCELLED', 'Generation stopped.', { retryable: false });
    }

    const requestHeaders: Record<string, string> = {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
      ...(params.headers ?? {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    const onParentAbort = (): void => {
      controller.abort();
    };
    params.signal?.addEventListener('abort', onParentAbort, { once: true });

    try {
      const response = await fetchImpl(params.url, {
        method: 'POST',
        headers: requestHeaders,
        body: bodyJson,
        signal: controller.signal,
      });

      if (response.status === 401 && attempt === 0 && params.refreshToken) {
        const refreshed = await params.refreshToken();
        if (refreshed) {
          token = refreshed;
          continue;
        }
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const parsedErr = parseHttpErrorBody(response.status, text);
        throw new SseStreamError(parsedErr.code, parsedErr.message, {
          status: response.status,
          retryable: parsedErr.retryable,
        });
      }

      const parser = new IncrementalSseParser();
      const emitFrames = (frames: ParsedSseFrame[]): void => {
        for (const frame of frames) {
          const decoded = tryParseSseEventJson(frame);
          if (decoded) params.onEvent(decoded);
          else params.onMalformedEvent?.(frame);
        }
      };

      const body = response.body;
      if (body && typeof body.getReader === 'function') {
        const reader = body.getReader();
        const decoder = new TextDecoder('utf-8');
        try {
          while (true) {
            if (params.signal?.aborted) {
              throw new SseStreamError('STREAM_CANCELLED', 'Generation stopped.', { retryable: false });
            }
            const { value, done } = await reader.read();
            if (done) {
              const tailText = decoder.decode();
              if (tailText) emitFrames(parser.feed(tailText));
              emitFrames(parser.flush());
              return;
            }
            if (value) {
              const chunkText = decoder.decode(value, { stream: true });
              emitFrames(parser.feed(chunkText));
            }
          }
        } finally {
          await reader.cancel().catch(() => undefined);
        }
      }

      if (typeof (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest === 'function') {
        clearTimeout(timer);
        params.signal?.removeEventListener('abort', onParentAbort);
        await streamViaXhr({
          url: params.url,
          bodyJson,
          headers: requestHeaders,
          signal: params.signal,
          timeoutMs,
          parser,
          onEvent: params.onEvent,
          onMalformedEvent: params.onMalformedEvent,
        });
        return;
      }

      const fullText = await response.text();
      emitFrames(parser.feed(fullText));
      emitFrames(parser.flush());
      return;
    } catch (err) {
      if (err instanceof SseStreamError) throw err;
      if (params.signal?.aborted) {
        throw new SseStreamError('STREAM_CANCELLED', 'Generation stopped.', {
          retryable: false,
          cause: err,
        });
      }
      if (timedOut) {
        throw new SseStreamError('PROVIDER_TIMEOUT', 'AI request timed out. Please try again.', {
          retryable: true,
          cause: err,
        });
      }
      throw new SseStreamError('STREAM_INTERRUPTED', 'Connection interrupted before completion.', {
        retryable: true,
        cause: err,
      });
    } finally {
      clearTimeout(timer);
      params.signal?.removeEventListener('abort', onParentAbort);
    }
  }
}
