import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  AI_COACH_STREAMING_ENABLED,
  isAiCoachStreamingEnabled,
  setAiCoachStreamingEnabledForTests,
} from '../src/shared/constants/featureFlags';
import {
  IncrementalSseParser,
  openCoachSseStream,
  SseStreamError,
} from '../src/features/ai-coach/services/sse-client';
import { CoachApi } from '../src/features/ai-coach/services/coach-api';
import { useCoachStore } from '../src/features/ai-coach/store/coachStore';
import { useHealthStore } from '../src/features/health-integration/store/healthStore';
import type { CoachStreamEvent } from '../src/features/ai-coach/types/streaming';

const origSendMessage = CoachApi.sendMessage;
const origStreamMessage = CoachApi.streamMessage;

describe('Phase 14: Mobile Streaming AI Coach (SSE)', () => {
  beforeEach(() => {
    useHealthStore.setState({ status: 'connected' });
    useCoachStore.getState().newConversation();
    setAiCoachStreamingEnabledForTests(null);
  });

  afterEach(() => {
    CoachApi.sendMessage = origSendMessage;
    CoachApi.streamMessage = origStreamMessage;
    setAiCoachStreamingEnabledForTests(null);
    useCoachStore.getState().newConversation();
  });

  it('1. streaming feature flag defaults to false and uses existing non-streaming CoachApi.sendMessage', async () => {
    assert.equal(AI_COACH_STREAMING_ENABLED, false);
    assert.equal(isAiCoachStreamingEnabled(), false);

    let sendCalls = 0;
    let streamCalls = 0;
    CoachApi.sendMessage = async () => {
      sendCalls += 1;
      return {
        text: 'Non-streaming reply',
        followUps: ['More?'],
        sources: ['History'],
        conversationId: 'conv-nonstream-1',
      };
    };
    CoachApi.streamMessage = async () => {
      streamCalls += 1;
    };

    useCoachStore.getState().send('How was my sleep?');
    await new Promise((r) => setTimeout(r, 15));

    const state = useCoachStore.getState();
    assert.equal(sendCalls, 1);
    assert.equal(streamCalls, 0);
    assert.equal(state.busy, false);
    assert.equal(state.streaming, false);
    assert.equal(state.messages[1]?.status, 'done');
    assert.equal(state.messages[1]?.text, 'Non-streaming reply');
  });

  it('2. IncrementalSseParser handles split chunks, CRLF line endings, multi-line data, and keepalives', () => {
    const parser = new IncrementalSseParser();
    const f1 = parser.feed(': heartbeat comment\r\n\r\nid: 1\r\nevent: delta\r\ndata: {"type":"delta",');
    assert.equal(f1.length, 0);

    const f2 = parser.feed('"textDelta":"Hello "}\r\n\r\nevent: complete\ndata: {"ok":true}\n\n');
    assert.equal(f2.length, 2);
    assert.equal(f2[0]?.event, 'delta');
    assert.equal(f2[0]?.id, '1');
    assert.equal(f2[0]?.data, '{"type":"delta","textDelta":"Hello "}');
    assert.equal(f2[1]?.event, 'complete');
  });

  it('3. openCoachSseStream skips malformed JSON events cleanly without aborting stream', async () => {
    const encoder = new TextEncoder();
    const events: Record<string, unknown>[] = [];
    const malformed: string[] = [];

    const fetchImpl: typeof fetch = async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('event: delta\ndata: {bad json\n\n'));
            controller.enqueue(
              encoder.encode('event: delta\ndata: {"type":"delta","textDelta":"Valid chunk"}\n\n'),
            );
            controller.close();
          },
        }),
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      );

    await openCoachSseStream({
      url: 'http://localhost/api/v1/coach/chat/stream',
      body: { message: 'test' },
      fetchImpl,
      onEvent: (evt) => events.push(evt),
      onMalformedEvent: (frame) => malformed.push(frame.data),
    });

    assert.equal(malformed.length, 1);
    assert.equal(events.length, 1);
    assert.equal(events[0]?.textDelta, 'Valid chunk');
  });

  it('4. openCoachSseStream refreshes expired token once on 401 and completes stream', async () => {
    const encoder = new TextEncoder();
    const authHeaders: string[] = [];
    let attempt = 0;

    const fetchImpl: typeof fetch = async (_url, init) => {
      attempt += 1;
      const hdrs = init?.headers as Record<string, string>;
      authHeaders.push(hdrs.Authorization ?? '');
      if (attempt === 1) {
        return new Response(JSON.stringify({ error: { code: 'TOKEN_EXPIRED', message: 'Expired' } }), {
          status: 401,
        });
      }
      return new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(
              encoder.encode('event: complete\ndata: {"type":"complete","response":{"text":"Refreshed"}}\n\n'),
            );
            c.close();
          },
        }),
        { status: 200 },
      );
    };

    const received: Record<string, unknown>[] = [];
    await openCoachSseStream({
      url: 'http://localhost/stream',
      body: { message: 'hello' },
      getToken: async () => 'old-jwt',
      refreshToken: async () => 'new-jwt',
      fetchImpl,
      onEvent: (evt) => received.push(evt),
    });

    assert.equal(attempt, 2);
    assert.deepEqual(authHeaders, ['Bearer old-jwt', 'Bearer new-jwt']);
    assert.equal(received.length, 1);
  });

  it('5. openCoachSseStream uses XMLHttpRequest incremental fallback when ReadableStream body is unavailable', async () => {
    const originalXhr = (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest;
    class FakeXhr {
      status = 200;
      timeout = 0;
      responseText = '';
      onprogress: (() => void) | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      ontimeout: (() => void) | null = null;
      onabort: (() => void) | null = null;
      open() {}
      setRequestHeader() {}
      abort() {
        this.onabort?.();
      }
      send() {
        this.responseText = 'event: delta\ndata: {"type":"delta","textDelta":"Chunk1 "}\n\n';
        this.onprogress?.();
        this.responseText += 'event: delta\ndata: {"type":"delta","textDelta":"Chunk2"}\n\n';
        this.onload?.();
      }
    }

    (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = FakeXhr;
    try {
      const fetchImpl: typeof fetch = async () => ({ ok: true, status: 200, body: null }) as unknown as Response;
      const received: Record<string, unknown>[] = [];
      await openCoachSseStream({
        url: 'http://localhost/stream',
        body: { message: 'xhr' },
        fetchImpl,
        onEvent: (evt) => received.push(evt),
      });
      assert.equal(received.length, 2);
      assert.equal(received[0]?.textDelta, 'Chunk1 ');
      assert.equal(received[1]?.textDelta, 'Chunk2');
    } finally {
      (globalThis as { XMLHttpRequest?: unknown }).XMLHttpRequest = originalXhr;
    }
  });

  it('6. store renders incremental deltas, safe status messages, and completes with final metadata', async () => {
    setAiCoachStreamingEnabledForTests(true);
    const observedStatuses: { status?: string; text?: string; statusMessage?: string }[] = [];
    const unsubscribe = useCoachStore.subscribe((s) => {
      const m = s.messages[1];
      if (m) observedStatuses.push({ status: m.status, text: m.text, statusMessage: m.statusMessage });
    });

    CoachApi.streamMessage = async ({ onEvent }) => {
      const emit = (e: CoachStreamEvent) => onEvent(e);
      emit({
        type: 'start',
        traceId: 'tr-1',
        seq: 1,
        model: 'gemini-3.5-flash-lite',
        mode: 'agent_langgraph',
        conversationId: 'conv-stream-1',
        timestamp: '2026-11-25T10:00:00Z',
      });
      emit({
        type: 'status',
        traceId: 'tr-1',
        seq: 2,
        stage: 'tool_calling',
        message: 'Checking your recent workouts...',
        timestamp: '2026-11-25T10:00:01Z',
      });
      emit({
        type: 'delta',
        traceId: 'tr-1',
        seq: 3,
        textDelta: 'You lifted ',
        timestamp: '2026-11-25T10:00:02Z',
      });
      emit({
        type: 'delta',
        traceId: 'tr-1',
        seq: 4,
        textDelta: '3 times this week.',
        timestamp: '2026-11-25T10:00:03Z',
      });
      emit({
        type: 'complete',
        traceId: 'tr-1',
        seq: 5,
        response: {
          text: 'You lifted 3 times this week.',
          followUps: ['Plan next session'],
          sources: ['Workouts'],
          conversationId: 'conv-stream-1',
        },
        timestamp: '2026-11-25T10:00:04Z',
      });
    };

    useCoachStore.getState().send('Weekly summary');
    await new Promise((r) => setTimeout(r, 15));
    unsubscribe();

    const finalState = useCoachStore.getState();
    assert.ok(observedStatuses.some((x) => x.statusMessage === 'Checking your recent workouts...'));
    assert.ok(observedStatuses.some((x) => x.status === 'streaming' && x.text === 'You lifted '));
    assert.equal(finalState.busy, false);
    assert.equal(finalState.streaming, false);
    assert.equal(finalState.conversationId, 'conv-stream-1');
    assert.equal(finalState.messages[1]?.status, 'done');
    assert.equal(finalState.messages[1]?.text, 'You lifted 3 times this week.');
    assert.deepEqual(finalState.messages[1]?.followUps, ['Plan next session']);
  });

  it('7. stopGeneration preserves streamed partial response cleanly with isPartial=true', async () => {
    setAiCoachStreamingEnabledForTests(true);
    let fallbackCalled = false;
    CoachApi.sendMessage = async () => {
      fallbackCalled = true;
      return { text: 'should not run' };
    };
    CoachApi.streamMessage = async ({ signal, onEvent }) => {
      onEvent({
        type: 'delta',
        traceId: 'tr-stop',
        seq: 1,
        textDelta: 'Partial warm-up advice ',
        timestamp: '2026-11-25T10:00:00Z',
      });
      await new Promise<void>((resolve) => {
        signal?.addEventListener('abort', () => resolve(), { once: true });
      });
    };

    useCoachStore.getState().send('Warmup');
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(useCoachStore.getState().streaming, true);
    useCoachStore.getState().stopGeneration();
    await new Promise((r) => setTimeout(r, 15));

    const msg = useCoachStore.getState().messages[1];
    assert.equal(fallbackCalled, false);
    assert.equal(useCoachStore.getState().busy, false);
    assert.equal(useCoachStore.getState().streaming, false);
    assert.equal(msg?.status, 'done');
    assert.equal(msg?.isPartial, true);
    assert.equal(msg?.text, 'Partial warm-up advice ');
  });

  it('8. stopGeneration before first token settles gracefully without stuck spinner', async () => {
    setAiCoachStreamingEnabledForTests(true);
    CoachApi.streamMessage = async ({ signal }) => {
      await new Promise<void>((resolve) => {
        signal?.addEventListener('abort', () => resolve(), { once: true });
      });
    };

    useCoachStore.getState().send('Quick question');
    await new Promise((r) => setTimeout(r, 10));
    useCoachStore.getState().stopGeneration();
    await new Promise((r) => setTimeout(r, 15));

    const msg = useCoachStore.getState().messages[1];
    assert.equal(useCoachStore.getState().busy, false);
    assert.equal(msg?.status, 'error');
    assert.equal(msg?.text, 'Generation stopped.');
  });

  it('9. guards against duplicate concurrent sends while busy', async () => {
    setAiCoachStreamingEnabledForTests(true);
    let release!: () => void;
    let streamCalls = 0;
    CoachApi.streamMessage = async () => {
      streamCalls += 1;
      await new Promise<void>((r) => {
        release = r;
      });
    };

    useCoachStore.getState().send('First send');
    useCoachStore.getState().send('Duplicate send');
    assert.equal(useCoachStore.getState().messages.length, 2);
    release?.();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(streamCalls, 1);
  });

  it('10. automatically falls back to non-streaming sendMessage when stream returns pre-delta 422/503', async () => {
    setAiCoachStreamingEnabledForTests(true);
    let fallbackCalls = 0;
    CoachApi.streamMessage = async () => {
      throw new SseStreamError('FEATURE_DISABLED', 'Streaming disabled on server', { status: 422 });
    };
    CoachApi.sendMessage = async () => {
      fallbackCalls += 1;
      return { text: 'Recovered via standard chat', conversationId: 'conv-fb-1' };
    };

    useCoachStore.getState().send('Fallback test');
    await new Promise((r) => setTimeout(r, 15));

    const state = useCoachStore.getState();
    assert.equal(fallbackCalls, 1);
    assert.equal(state.messages[1]?.status, 'done');
    assert.equal(state.messages[1]?.text, 'Recovered via standard chat');
  });

  it('11. does NOT silently fallback on quota errors or after partial deltas; preserves partial + offers retry', async () => {
    setAiCoachStreamingEnabledForTests(true);
    let fallbackCalls = 0;
    CoachApi.sendMessage = async () => {
      fallbackCalls += 1;
      return { text: 'unexpected fallback' };
    };
    CoachApi.streamMessage = async ({ onEvent }) => {
      onEvent({
        type: 'delta',
        traceId: 'tr-err',
        seq: 1,
        textDelta: 'First half streamed. ',
        timestamp: '2026-11-25T10:00:00Z',
      });
      onEvent({
        type: 'error',
        traceId: 'tr-err',
        seq: 2,
        code: 'STREAM_INTERRUPTED',
        message: 'Connection interrupted before completion.',
        retryable: true,
        timestamp: '2026-11-25T10:00:01Z',
      });
    };

    useCoachStore.getState().send('Partial failure test');
    await new Promise((r) => setTimeout(r, 15));

    const msg = useCoachStore.getState().messages[1];
    assert.equal(fallbackCalls, 0);
    assert.equal(msg?.status, 'error');
    assert.equal(msg?.isPartial, true);
    assert.equal(msg?.text, 'First half streamed. ');
    assert.equal(msg?.statusMessage, 'Connection interrupted before completion.');
  });

  it('12. starting newConversation aborts in-flight stream and prevents late delta leakage', async () => {
    setAiCoachStreamingEnabledForTests(true);
    let emitLate!: () => void;
    CoachApi.streamMessage = async ({ signal, onEvent }) => {
      emitLate = () => {
        if (!signal?.aborted) {
          onEvent({
            type: 'delta',
            traceId: 'old',
            seq: 1,
            textDelta: 'Stale delta',
            timestamp: '2026-11-25T10:00:00Z',
          });
        }
      };
      await new Promise((r) => setTimeout(r, 25));
      onEvent({
        type: 'delta',
        traceId: 'old',
        seq: 2,
        textDelta: 'Very late delta',
        timestamp: '2026-11-25T10:00:01Z',
      });
    };

    useCoachStore.getState().send('Old prompt');
    useCoachStore.getState().newConversation();
    await new Promise((r) => setTimeout(r, 35));

    emitLate?.();
    assert.equal(useCoachStore.getState().messages.length, 0);
    assert.equal(useCoachStore.getState().streaming, false);
  });
});
