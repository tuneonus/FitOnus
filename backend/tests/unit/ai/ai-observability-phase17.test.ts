/**
 * Phase 17 AI Observability — offline unit tests.
 *
 * Tests W3C traceparent parsing, distributed tracing, bounded-cardinality AI metrics,
 * RAG/Agent/Multimodal event builders, PII redaction, operational health SLO evaluation,
 * and fail-open resilience.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { AiMetricsRegistry, defaultAiMetrics } from '../../../src/shared/ai/ai-metrics.js';
import { defaultAiTracer } from '../../../src/shared/ai/ai-tracing.js';
import { callPythonAi, pythonUsageSchema } from '../../../src/shared/ai/python-ai-call.js';
import { PythonAiClient } from '../../../src/shared/ai/python-ai-client.js';
import { KnowledgeService } from '../../../src/modules/knowledge/application/knowledge-service.js';
import type { KnowledgeRepository } from '../../../src/modules/knowledge/domain/knowledge.types.js';
import {
  createRootTraceContext,
  runWithCorrelationId,
  runWithTraceContext,
} from '../../../src/shared/logging/request-correlation.js';
import { createCapturingLogger } from '../../helpers/capture-logger.js';
import {
  json,
  okCoachReply,
  startFakePythonServer,
} from '../../helpers/fake-python-ai-server.js';

// ---------------------------------------------------------------------------
// 1  W3C `traceparent` Parsing & Formatting
// ---------------------------------------------------------------------------

describe('W3C traceparent', () => {
  it('parses a valid traceparent', async () => {
    const { parseTraceparent } = await import('../../../src/shared/logging/request-correlation.js');
    const ctx = parseTraceparent('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01');
    expect(ctx).toBeDefined();
    expect(ctx!.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
    expect(ctx!.parentSpanId).toBe('b7ad6b7169203331');
    expect(ctx!.traceFlags).toBe('01');
    expect(ctx!.spanId).toHaveLength(16);
  });

  it('rejects undefined/null/empty', async () => {
    const { parseTraceparent } = await import('../../../src/shared/logging/request-correlation.js');
    expect(parseTraceparent(undefined)).toBeUndefined();
    expect(parseTraceparent(null)).toBeUndefined();
    expect(parseTraceparent('')).toBeUndefined();
  });

  it('rejects all-zero trace_id', async () => {
    const { parseTraceparent } = await import('../../../src/shared/logging/request-correlation.js');
    expect(parseTraceparent('00-' + '0'.repeat(32) + '-b7ad6b7169203331-01')).toBeUndefined();
  });

  it('rejects all-zero span_id', async () => {
    const { parseTraceparent } = await import('../../../src/shared/logging/request-correlation.js');
    expect(parseTraceparent('00-0af7651916cd43dd8448eb211c80319c-' + '0'.repeat(16) + '-01')).toBeUndefined();
  });

  it('rejects malformed strings', async () => {
    const { parseTraceparent } = await import('../../../src/shared/logging/request-correlation.js');
    expect(parseTraceparent('not-a-traceparent')).toBeUndefined();
    // version 01 not version 00
    expect(parseTraceparent('01-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01')).toBeUndefined();
  });

  it('formats traceparent correctly', async () => {
    const { formatTraceparent } = await import('../../../src/shared/logging/request-correlation.js');
    const ctx = {
      traceId: 'a'.repeat(32),
      spanId: 'b'.repeat(16),
      traceFlags: '01' as const,
    };
    expect(formatTraceparent(ctx)).toBe(`00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`);
  });
});

// ---------------------------------------------------------------------------
// 2  TraceContext Creation
// ---------------------------------------------------------------------------

describe('TraceContext creation', () => {
  it('createRootTraceContext generates fresh IDs without incoming header', async () => {
    const { createRootTraceContext } = await import('../../../src/shared/logging/request-correlation.js');
    const ctx = createRootTraceContext();
    expect(ctx.traceId).toHaveLength(32);
    expect(ctx.spanId).toHaveLength(16);
    expect(ctx.parentSpanId).toBeUndefined();
  });

  it('createRootTraceContext continues upstream trace', async () => {
    const { createRootTraceContext } = await import('../../../src/shared/logging/request-correlation.js');
    const ctx = createRootTraceContext('00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01');
    expect(ctx.traceId).toBe('0af7651916cd43dd8448eb211c80319c');
    expect(ctx.parentSpanId).toBe('b7ad6b7169203331');
  });

  it('createChildTraceContext inherits traceId', async () => {
    const { createRootTraceContext, createChildTraceContext, runWithTraceContext } = await import(
      '../../../src/shared/logging/request-correlation.js'
    );
    const root = createRootTraceContext();
    const child = runWithTraceContext(root, () => createChildTraceContext());
    expect(child.traceId).toBe(root.traceId);
    expect(child.parentSpanId).toBe(root.spanId);
    expect(child.spanId).not.toBe(root.spanId);
  });

  it('currentTraceContext reads active context', async () => {
    const { createRootTraceContext, runWithTraceContext, currentTraceContext } = await import(
      '../../../src/shared/logging/request-correlation.js'
    );
    const root = createRootTraceContext();
    const inside = runWithTraceContext(root, () => currentTraceContext());
    expect(inside).toBeDefined();
    expect(inside!.traceId).toBe(root.traceId);
  });

  it('currentTraceContext returns undefined outside context', async () => {
    const { currentTraceContext } = await import('../../../src/shared/logging/request-correlation.js');
    expect(currentTraceContext()).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3  AiTracer Bounded Span Buffer
// ---------------------------------------------------------------------------

describe('AiTracer', () => {
  it('evicts oldest spans when capacity exceeded', async () => {
    const { AiTracer } = await import('../../../src/shared/ai/ai-tracing.js');
    const tracer = new AiTracer(3);
    for (let i = 0; i < 5; i++) {
      tracer.record({
        traceId: 't1',
        spanId: `s${i}`,
        service: 'test',
        operation: `op${i}`,
        status: 'ok',
        durationMs: 1,
        attributes: {},
      });
    }
    expect(tracer.count()).toBe(3);
    const spans = tracer.recentSpans();
    expect(spans.map((s) => s.operation)).toEqual(['op2', 'op3', 'op4']);
  });

  it('filters by traceId', async () => {
    const { AiTracer } = await import('../../../src/shared/ai/ai-tracing.js');
    const tracer = new AiTracer();
    for (const tid of ['t1', 't2', 't1']) {
      tracer.record({
        traceId: tid,
        spanId: 's',
        service: 'svc',
        operation: 'op',
        status: 'ok',
        durationMs: 0.5,
        attributes: {},
      });
    }
    expect(tracer.recentSpans('t1')).toHaveLength(2);
    expect(tracer.recentSpans('t2')).toHaveLength(1);
  });

  it('clear() empties the buffer', async () => {
    const { AiTracer } = await import('../../../src/shared/ai/ai-tracing.js');
    const tracer = new AiTracer();
    tracer.record({
      traceId: 't', spanId: 's', service: 'x', operation: 'o',
      status: 'ok', durationMs: 1, attributes: {},
    });
    tracer.clear();
    expect(tracer.count()).toBe(0);
  });

  it('redacts sensitive span attributes', async () => {
    const { AiTracer, withAiSpan } = await import('../../../src/shared/ai/ai-tracing.js');
    const { createRootTraceContext, runWithTraceContext } = await import(
      '../../../src/shared/logging/request-correlation.js'
    );
    const tracer = new AiTracer();
    const root = createRootTraceContext();
    await runWithTraceContext(root, () =>
      withAiSpan('test.span', { tracer, attributes: { prompt: 'secret', model: 'gemini' } }, async (span) => {
        span.setAttribute('email', 'user@example.com');
        return 'done';
      }),
    );
    const spans = tracer.recentSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]!.attributes['prompt']).toBe('[redacted]');
    expect(spans[0]!.attributes['email']).toBe('[redacted]');
    expect(spans[0]!.attributes['model']).toBe('gemini');
  });
});

// ---------------------------------------------------------------------------
// 4  withAiSpan
// ---------------------------------------------------------------------------

describe('withAiSpan', () => {
  it('records spans and captures errors', async () => {
    const { AiTracer, withAiSpan } = await import('../../../src/shared/ai/ai-tracing.js');
    const { createRootTraceContext, runWithTraceContext } = await import(
      '../../../src/shared/logging/request-correlation.js'
    );
    const tracer = new AiTracer();
    const root = createRootTraceContext();
    await expect(
      runWithTraceContext(root, () =>
        withAiSpan('error.op', { tracer }, async () => {
          throw new Error('test error');
        }),
      ),
    ).rejects.toThrow('test error');
    const spans = tracer.recentSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]!.status).toBe('error');
    expect(spans[0]!.errorCategory).toBe('Error');
  });

  it('succeeds and returns value', async () => {
    const { AiTracer, withAiSpan } = await import('../../../src/shared/ai/ai-tracing.js');
    const { createRootTraceContext, runWithTraceContext } = await import(
      '../../../src/shared/logging/request-correlation.js'
    );
    const tracer = new AiTracer();
    const root = createRootTraceContext();
    const result = await runWithTraceContext(root, () =>
      withAiSpan('ok.op', { tracer }, async () => 42),
    );
    expect(result).toBe(42);
    expect(tracer.recentSpans()[0]!.status).toBe('ok');
  });
});

// ---------------------------------------------------------------------------
// 5  buildOutboundTraceHeaders
// ---------------------------------------------------------------------------

describe('buildOutboundTraceHeaders', () => {
  it('includes traceparent and correlation-id when active', async () => {
    const { buildOutboundTraceHeaders } = await import('../../../src/shared/ai/ai-tracing.js');
    const { createRootTraceContext, runWithTraceContext } = await import(
      '../../../src/shared/logging/request-correlation.js'
    );
    const { runWithCorrelationId } = await import('../../../src/shared/logging/request-correlation.js');
    const root = createRootTraceContext();
    const headers = runWithCorrelationId('test-corr-id', () =>
      runWithTraceContext(root, () => buildOutboundTraceHeaders()),
    );
    expect(headers['traceparent']).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/);
    expect(headers['x-correlation-id']).toBe('test-corr-id');
  });

  it('returns empty headers outside context', async () => {
    const { buildOutboundTraceHeaders } = await import('../../../src/shared/ai/ai-tracing.js');
    const headers = buildOutboundTraceHeaders(undefined, undefined);
    expect(headers['traceparent']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 6  AiMetricsRegistry — LLM Calls
// ---------------------------------------------------------------------------

describe('AiMetricsRegistry LLM', () => {
  it('records success and failure counts', () => {
    const m = new AiMetricsRegistry();
    m.recordLlmCall({ feature: 'coach_chat', model: 'gemini-2.5-flash', durationMs: 100, success: true, inputTokens: 50, outputTokens: 20, totalTokens: 70, estimatedCostUsd: 0.0005 });
    m.recordCostUsd('coach_chat', 'gemini-2.5-flash', 0.0005);
    m.recordLlmCall({ feature: 'coach_chat', model: 'gemini-2.5-flash', durationMs: 200, success: false, errorCategory: 'gemini_timeout', timeout: true });
    const snap = m.getSnapshot();
    expect(snap.ai.totalRequests).toBe(2);
    expect(snap.ai.successCount).toBe(1);
    expect(snap.ai.failureCount).toBe(1);
    expect(snap.ai.timeoutCount).toBe(1);
    expect(snap.ai.totalTokens).toBe(70);
    expect(snap.ai.estimatedCostUsd).toBeCloseTo(0.001, 6);
  });

  it('tracks fallback and retry counts', () => {
    const m = new AiMetricsRegistry();
    m.recordLlmCall({ feature: 'coach_insights', model: 'm', durationMs: 300, success: true, isFallback: true, retries: 2 });
    const snap = m.getSnapshot();
    expect(snap.ai.fallbackCount).toBe(1);
    expect(snap.ai.retryCount).toBe(2);
  });

  it('computes latency percentiles', () => {
    const m = new AiMetricsRegistry();
    for (let i = 1; i <= 100; i++) {
      m.recordLlmCall({ feature: 'coach_chat', model: 'm', durationMs: i, success: true });
    }
    const lat = m.getSnapshot().ai.byFeature['coach_chat']!.latency;
    expect(lat.count).toBe(100);
    expect(lat.p50Ms).toBeGreaterThan(0);
    expect(lat.p95Ms).toBeGreaterThan(lat.p50Ms);
    expect(lat.p99Ms).toBeGreaterThanOrEqual(lat.p95Ms);
    expect(lat.maxMs).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// 7  AiMetricsRegistry — Bounded Cardinality
// ---------------------------------------------------------------------------

describe('AiMetricsRegistry cardinality', () => {
  it('unknown feature maps to _other', async () => {
    const { AiMetricsRegistry, OVERFLOW_LABEL } = await import('../../../src/shared/ai/ai-metrics.js');
    const m = new AiMetricsRegistry();
    m.recordLlmCall({ feature: 'totally_unknown', model: 'm', durationMs: 1, success: true });
    const snap = m.getSnapshot();
    expect(snap.ai.byFeature[OVERFLOW_LABEL]).toBeDefined();
  });

  it('caps model cardinality', async () => {
    const { AiMetricsRegistry, OVERFLOW_LABEL } = await import('../../../src/shared/ai/ai-metrics.js');
    const m = new AiMetricsRegistry(4);
    for (let i = 0; i < 10; i++) {
      m.recordLlmCall({ feature: 'coach_chat', model: `model-${i}`, durationMs: 1, success: true });
    }
    const snap = m.getSnapshot();
    expect(Object.keys(snap.ai.byModel).length).toBeLessThanOrEqual(5);
    expect(snap.ai.byModel[OVERFLOW_LABEL]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 8  AiMetricsRegistry — RAG Retrieval
// ---------------------------------------------------------------------------

describe('AiMetricsRegistry RAG', () => {
  it('records retrieval with grounding and reranking', async () => {
    const { AiMetricsRegistry } = await import('../../../src/shared/ai/ai-metrics.js');
    const m = new AiMetricsRegistry();
    m.recordRagRetrieval({
      mode: 'hybrid', durationMs: 50, candidateCount: 20, returnedCount: 5,
      topScore: 0.92, avgScore: 0.78, reranked: true, citationsCount: 3, grounded: true,
    });
    const snap = m.getSnapshot();
    const rag = snap.rag['hybrid']!;
    expect(rag.retrievals).toBe(1);
    expect(rag.rerankedCount).toBe(1);
    expect(rag.groundedCount).toBe(1);
  });

  it('tracks empty results', async () => {
    const { AiMetricsRegistry } = await import('../../../src/shared/ai/ai-metrics.js');
    const m = new AiMetricsRegistry();
    m.recordRagRetrieval({ mode: 'vector', durationMs: 10, returnedCount: 0 });
    expect(m.getSnapshot().rag['vector']!.emptyResults).toBe(1);
  });

  it('failure not counted as empty', async () => {
    const { AiMetricsRegistry } = await import('../../../src/shared/ai/ai-metrics.js');
    const m = new AiMetricsRegistry();
    m.recordRagRetrieval({ mode: 'vector', durationMs: 5, returnedCount: 0, failed: true });
    const rag = m.getSnapshot().rag['vector']!;
    expect(rag.emptyResults).toBe(0);
    expect(rag.failedCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 9  AiMetricsRegistry — Agent Execution
// ---------------------------------------------------------------------------

describe('AiMetricsRegistry Agent', () => {
  it('tracks execution, tools, limits, routing', async () => {
    const { AiMetricsRegistry } = await import('../../../src/shared/ai/ai-metrics.js');
    const m = new AiMetricsRegistry();
    m.recordAgentExecution({
      engine: 'native', routingDecision: 'general_chat', durationMs: 2000,
      toolCalls: 3, toolFailures: 1, iterations: 5, replans: 1,
      limitHit: 'max_iterations', failed: false,
    });
    const snap = m.getSnapshot();
    const eng = snap.agent.byEngine['native']!;
    expect(eng.executions).toBe(1);
    expect(eng.toolCalls).toBe(3);
    expect(eng.toolFailures).toBe(1);
    expect(eng.limitHits).toBe(1);
    expect(snap.agent.routingDecisions['general_chat']).toBe(1);
    expect(snap.agent.limitHitsByType['max_iterations']).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 10  AiMetricsRegistry — Multimodal Processing
// ---------------------------------------------------------------------------

describe('AiMetricsRegistry Multimodal', () => {
  it('tracks processing and validation failures', async () => {
    const { AiMetricsRegistry } = await import('../../../src/shared/ai/ai-metrics.js');
    const m = new AiMetricsRegistry();
    m.recordMultimodalProcessing({
      modality: 'image', durationMs: 500, validationDurationMs: 50, byteSize: 102400,
    });
    m.recordMultimodalProcessing({
      modality: 'image', durationMs: 100, validationFailed: true, validationReason: 'oversize', byteSize: 5_000_000,
    });
    const snap = m.getSnapshot();
    const img = snap.multimodal.byModality['image']!;
    expect(img.requests).toBe(2);
    expect(img.validationFailures).toBe(1);
    expect(img.totalBytes).toBe(5_102_400);
    expect(snap.multimodal.validationFailuresByReason['oversize']).toBe(1);
  });

  it('unknown modality clamped to _other', async () => {
    const { AiMetricsRegistry, OVERFLOW_LABEL } = await import('../../../src/shared/ai/ai-metrics.js');
    const m = new AiMetricsRegistry();
    m.recordMultimodalProcessing({ modality: 'video_3d', durationMs: 10 });
    expect(m.getSnapshot().multimodal.byModality[OVERFLOW_LABEL]).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 11  AiMetricsRegistry — Reset
// ---------------------------------------------------------------------------

describe('AiMetricsRegistry reset', () => {
  it('clears all counters', async () => {
    const { AiMetricsRegistry } = await import('../../../src/shared/ai/ai-metrics.js');
    const m = new AiMetricsRegistry();
    m.recordLlmCall({ feature: 'coach_chat', model: 'm', durationMs: 10, success: true });
    m.reset();
    const snap = m.getSnapshot();
    expect(snap.ai.totalRequests).toBe(0);
    expect(Object.keys(snap.ai.byFeature)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 12  Event Builders: ragRetrievalFields, agentExecutionFields, multimodalProcessingFields
// ---------------------------------------------------------------------------

describe('AI event builders', () => {
  it('ragRetrievalFields includes expected fields', async () => {
    const { ragRetrievalFields, AI_EVENTS } = await import('../../../src/shared/ai/ai-observability.js');
    const fields = ragRetrievalFields({
      mode: 'hybrid', durationMs: 42, candidateCount: 10, returnedCount: 3,
      topScore: 0.91, reranked: true, grounded: true, citationsCount: 2, success: true,
    });
    expect(fields.event).toBe(AI_EVENTS.ragRetrieval);
    expect(fields.feature).toBe('rag');
    expect(fields.mode).toBe('hybrid');
    expect(fields.returnedCount).toBe(3);
    expect(fields.emptyResult).toBe(false);
    expect(fields.reranked).toBe(true);
  });

  it('ragRetrievalFields marks empty result', async () => {
    const { ragRetrievalFields } = await import('../../../src/shared/ai/ai-observability.js');
    const fields = ragRetrievalFields({
      mode: 'vector', durationMs: 10, candidateCount: 5, returnedCount: 0, success: true,
    });
    expect(fields.emptyResult).toBe(true);
  });

  it('ragGroundingFields tracks dropped chunks', async () => {
    const { ragGroundingFields, AI_EVENTS } = await import('../../../src/shared/ai/ai-observability.js');
    const fields = ragGroundingFields({
      inputChunks: 10, keptChunks: 6, citationsCount: 4, totalTokens: 1200,
    });
    expect(fields.event).toBe(AI_EVENTS.ragGrounding);
    expect(fields.droppedChunks).toBe(4);
    expect(fields.grounded).toBe(true);
  });

  it('agentExecutionFields sanitizes routing decision', async () => {
    const { agentExecutionFields, AI_EVENTS } = await import('../../../src/shared/ai/ai-observability.js');
    const fields = agentExecutionFields({
      aiRequestId: 'req-1', engine: 'native', routingDecision: 'general_chat',
      durationMs: 2000, toolCallsCount: 3, toolFailuresCount: 1,
      iterations: 5, replans: 1, limitHit: 'max_iterations',
      fallbackUsed: false, success: true,
    });
    expect(fields.event).toBe(AI_EVENTS.agentExecution);
    expect(fields.engine).toBe('native');
    expect(fields.routingDecision).toBe('general_chat');
    expect(fields.limitHit).toBe('max_iterations');
  });

  it('multimodalProcessingFields includes modality and validation', async () => {
    const { multimodalProcessingFields, AI_EVENTS } = await import('../../../src/shared/ai/ai-observability.js');
    const fields = multimodalProcessingFields({
      aiRequestId: 'req-1', modality: 'image', feature: 'meal_photo',
      model: 'gemini-2.5-flash', durationMs: 500, validationDurationMs: 50,
      validationFailed: false, byteSize: 102400, success: true,
    });
    expect(fields.event).toBe(AI_EVENTS.multimodalProcessing);
    expect(fields.modality).toBe('image');
    expect(fields.byteSize).toBe(102400);
    expect(fields.validationFailed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 13  traceMetadataFields
// ---------------------------------------------------------------------------

describe('traceMetadataFields', () => {
  it('returns IDs when trace context is active', async () => {
    const { traceMetadataFields } = await import('../../../src/shared/ai/ai-observability.js');
    const { createRootTraceContext, runWithTraceContext } = await import(
      '../../../src/shared/logging/request-correlation.js'
    );
    const root = createRootTraceContext();
    const meta = runWithTraceContext(root, () => traceMetadataFields());
    expect(meta.traceId).toBe(root.traceId);
    expect(meta.spanId).toBe(root.spanId);
  });

  it('returns empty object outside context', async () => {
    const { traceMetadataFields } = await import('../../../src/shared/ai/ai-observability.js');
    const meta = traceMetadataFields();
    expect(meta.traceId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 14  PII Redaction — redactSensitiveText & sanitizeErrorText
// ---------------------------------------------------------------------------

describe('PII redaction', () => {
  it('redactSensitiveText masks API keys', async () => {
    const { redactSensitiveText } = await import('../../../src/shared/logging/logger.js');
    const result = redactSensitiveText('key=AIzaSyDFakeKeyHere0123456', 200);
    expect(result).not.toContain('AIzaSy');
    expect(result).toContain('[redacted');
  });

  it('redactSensitiveText masks JWTs', async () => {
    const { redactSensitiveText } = await import('../../../src/shared/logging/logger.js');
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiw.SflKxwRJSMeKKF2QT4fwp';
    const result = redactSensitiveText(jwt, 300);
    expect(result).not.toContain('eyJhbGci');
  });

  it('redactSensitiveText masks emails', async () => {
    const { redactSensitiveText } = await import('../../../src/shared/logging/logger.js');
    const result = redactSensitiveText('user john@example.com', 200);
    expect(result).not.toContain('john@example.com');
  });

  it('sanitizeErrorText redacts sensitive content', async () => {
    const { sanitizeErrorText } = await import('../../../src/shared/logging/logger.js');
    const result = sanitizeErrorText('Error for john@example.com with key AIzaSyDFakeKeyHere0123456789Extra');
    expect(result).not.toContain('john@example.com');
    expect(result).not.toContain('AIzaSy');
  });
});

// ---------------------------------------------------------------------------
// 15  evaluateAiOperationalHealth
// ---------------------------------------------------------------------------

describe('evaluateAiOperationalHealth', () => {
  it('healthy on empty snapshot', async () => {
    const { AiMetricsRegistry } = await import('../../../src/shared/ai/ai-metrics.js');
    const { evaluateAiOperationalHealth } = await import('../../../src/shared/ai/ai-monitoring.js');
    const m = new AiMetricsRegistry();
    const result = evaluateAiOperationalHealth(m.getSnapshot());
    expect(result.status).toBe('healthy');
    expect(result.alerts).toHaveLength(0);
  });

  it('critical on quota exhausted', async () => {
    const { AiMetricsRegistry } = await import('../../../src/shared/ai/ai-metrics.js');
    const { evaluateAiOperationalHealth } = await import('../../../src/shared/ai/ai-monitoring.js');
    const m = new AiMetricsRegistry();
    m.recordLlmCall({
      feature: 'coach_chat', model: 'm', durationMs: 10,
      success: false, errorCategory: 'gemini_quota_exhausted',
    });
    const result = evaluateAiOperationalHealth(m.getSnapshot());
    expect(result.status).toBe('critical');
    expect(result.alerts.some((a) => a.code === 'QUOTA_EXHAUSTED')).toBe(true);
  });

  it('critical on auth failure', async () => {
    const { AiMetricsRegistry } = await import('../../../src/shared/ai/ai-metrics.js');
    const { evaluateAiOperationalHealth } = await import('../../../src/shared/ai/ai-monitoring.js');
    const m = new AiMetricsRegistry();
    m.recordLlmCall({
      feature: 'coach_chat', model: 'm', durationMs: 10,
      success: false, errorCategory: 'auth_failure',
    });
    const result = evaluateAiOperationalHealth(m.getSnapshot());
    expect(result.status).toBe('critical');
    expect(result.alerts.some((a) => a.code === 'AUTH_CONFIGURATION_FAILURE')).toBe(true);
  });

  it('degraded on elevated error rate', async () => {
    const { AiMetricsRegistry } = await import('../../../src/shared/ai/ai-metrics.js');
    const { evaluateAiOperationalHealth, DEFAULT_AI_SLO_THRESHOLDS } = await import('../../../src/shared/ai/ai-monitoring.js');
    const m = new AiMetricsRegistry();
    for (let i = 0; i < 20; i++) {
      m.recordLlmCall({
        feature: 'coach_chat', model: 'm', durationMs: 10,
        success: i < 18,
        errorCategory: i >= 18 ? 'internal_error' : undefined,
      });
    }
    const result = evaluateAiOperationalHealth(m.getSnapshot(), {
      ...DEFAULT_AI_SLO_THRESHOLDS,
      minSamples: 5,
      warnErrorRate: 0.05,
      criticalErrorRate: 0.20,
    });
    expect(result.status).toBe('degraded');
    expect(result.alerts.some((a) => a.code === 'ELEVATED_AI_ERROR_RATE')).toBe(true);
  });

  it('RAG empty rate critical alert', async () => {
    const { AiMetricsRegistry } = await import('../../../src/shared/ai/ai-metrics.js');
    const { evaluateAiOperationalHealth, DEFAULT_AI_SLO_THRESHOLDS } = await import('../../../src/shared/ai/ai-monitoring.js');
    const m = new AiMetricsRegistry();
    for (let i = 0; i < 20; i++) {
      m.recordRagRetrieval({
        mode: 'vector', durationMs: 10,
        candidateCount: 5, returnedCount: i < 15 ? 0 : 3,
      });
    }
    const result = evaluateAiOperationalHealth(m.getSnapshot(), {
      ...DEFAULT_AI_SLO_THRESHOLDS,
      minSamples: 5,
      criticalRagEmptyRate: 0.60,
    });
    expect(result.alerts.some((a) => a.code === 'RAG_EMPTY_RATE_CRITICAL')).toBe(true);
  });

  it('agent limit hit rate alert', async () => {
    const { AiMetricsRegistry } = await import('../../../src/shared/ai/ai-metrics.js');
    const { evaluateAiOperationalHealth, DEFAULT_AI_SLO_THRESHOLDS } = await import('../../../src/shared/ai/ai-monitoring.js');
    const m = new AiMetricsRegistry();
    for (let i = 0; i < 15; i++) {
      m.recordAgentExecution({
        engine: 'native', routingDecision: 'chat', durationMs: 100,
        limitHit: i < 6 ? 'max_iters' : undefined,
      });
    }
    const result = evaluateAiOperationalHealth(m.getSnapshot(), {
      ...DEFAULT_AI_SLO_THRESHOLDS,
      minSamples: 5,
      criticalAgentLimitHitRate: 0.35,
    });
    expect(result.alerts.some((a) => a.code === 'AGENT_LIMIT_HIT_CRITICAL')).toBe(true);
  });

  it('summary includes cost and rates', async () => {
    const { evaluateAiOperationalHealth } = await import('../../../src/shared/ai/ai-monitoring.js');
    const m = new AiMetricsRegistry();
    m.recordLlmCall({ feature: 'coach_chat', model: 'gemini-2.5-flash', durationMs: 100, success: true, inputTokens: 1000, outputTokens: 500, estimatedCostUsd: 0.0025 });
    const result = evaluateAiOperationalHealth(m.getSnapshot());
    expect(result.summary.totalRequests).toBe(1);
    expect(result.summary.estimatedCostUsd).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 16  Fail-Open Resilience
// ---------------------------------------------------------------------------

describe('Fail-open resilience', () => {
  it('AiMetricsRegistry handles NaN/Inf/negative durations', async () => {
    const { AiMetricsRegistry } = await import('../../../src/shared/ai/ai-metrics.js');
    const m = new AiMetricsRegistry();
    m.recordLlmCall({ feature: 'coach_chat', model: 'm', durationMs: NaN, success: true });
    m.recordLlmCall({ feature: 'coach_chat', model: 'm', durationMs: Infinity, success: true });
    m.recordLlmCall({ feature: 'coach_chat', model: 'm', durationMs: -100, success: true });
    expect(m.getSnapshot().ai.totalRequests).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 17  AsyncLocalStorage Concurrency Isolation
// ---------------------------------------------------------------------------

describe('AsyncLocalStorage trace isolation', () => {
  it('concurrent requests do not cross-contaminate', async () => {
    const { createRootTraceContext, runWithTraceContext, currentTraceContext } = await import(
      '../../../src/shared/logging/request-correlation.js'
    );

    const results: Record<string, string> = {};

    const worker = async (name: string) => {
      const root = createRootTraceContext();
      return runWithTraceContext(root, async () => {
        await new Promise((r) => setTimeout(r, 10));
        const ctx = currentTraceContext();
        results[name] = ctx!.traceId;
        return root.traceId;
      });
    };

    const [a, b, c] = await Promise.all([worker('a'), worker('b'), worker('c')]);
    expect(results['a']).toBe(a);
    expect(results['b']).toBe(b);
    expect(results['c']).toBe(c);
    // All trace IDs are unique
    expect(new Set([a, b, c]).size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// 18  Integrated Node AI Observability (traceparent, metrics, RAG, fail-open)
// ---------------------------------------------------------------------------

describe('Integrated Node AI observability', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    defaultAiMetrics.reset();
    defaultAiTracer.clear();
  });

  it('propagates child traceparent header to Python and records span + metrics', async () => {
    const server = await startFakePythonServer((_req, res) => json(res, 200, okCoachReply()));
    const capture = createCapturingLogger();
    const schema = z.object({ outcome: z.string(), usage: pythonUsageSchema });
    const root = createRootTraceContext();

    try {
      await runWithCorrelationId('corr-phase17-1', () =>
        runWithTraceContext(root, () =>
          callPythonAi({
            client: new PythonAiClient({
              baseUrl: server.url,
              serviceSecret: 'unit-test-secret-unit-test-secret-1234',
            }),
            path: '/internal/v1/ai/coach/chat',
            scope: 'ai:coach:chat',
            userId: '11111111-1111-4111-8111-111111111111',
            requestId: 'req-phase17-chat-1',
            timeoutMs: 2_000,
            body: { message: 'hi' },
            schema,
            feature: 'coach_chat',
            logger: capture.logger,
            label: 'Python coach chat',
            unavailableMessage: 'Coach unavailable',
          }),
        ),
      );

      const sentTraceparent = server.requests[0]?.headers['traceparent'];
      expect(sentTraceparent).toBeTypeOf('string');
      expect(String(sentTraceparent)).toContain(`00-${root.traceId}-`);
      expect(String(sentTraceparent)).not.toContain(`-${root.spanId}-`);

      const spans = defaultAiTracer.recentSpans(root.traceId);
      expect(spans.some((s) => s.operation === 'ai.python.call' && s.status === 'ok')).toBe(true);
      const snap = defaultAiMetrics.getSnapshot();
      expect(snap.ai.byFeature['coach_chat']?.requests).toBe(1);
    } finally {
      await server.close();
    }
  });

  it('callPythonAi fails open when metrics collector throws', async () => {
    const server = await startFakePythonServer((_req, res) => json(res, 200, okCoachReply()));
    const capture = createCapturingLogger();
    const schema = z.object({ outcome: z.string(), usage: pythonUsageSchema });
    vi.spyOn(defaultAiMetrics, 'recordLlmCall').mockImplementation(() => {
      throw new Error('metrics failure');
    });

    try {
      const reply = await callPythonAi({
        client: new PythonAiClient({
          baseUrl: server.url,
          serviceSecret: 'unit-test-secret-unit-test-secret-1234',
        }),
        path: '/internal/v1/ai/coach/chat',
        scope: 'ai:coach:chat',
        userId: '11111111-1111-4111-8111-111111111111',
        requestId: 'req-phase17-failopen',
        timeoutMs: 2_000,
        body: { message: 'hi' },
        schema,
        feature: 'coach_chat',
        logger: capture.logger,
        label: 'Python coach chat',
        unavailableMessage: 'Coach unavailable',
      });
      expect(reply.outcome).toBe('ok');
    } finally {
      await server.close();
    }
  });

  it('KnowledgeService records RAG metrics/spans and omits raw query from logs', async () => {
    const capture = createCapturingLogger();
    const repo = {
      findHybridChunks: vi.fn().mockResolvedValue([
        {
          id: 'chunk-1',
          documentId: 'doc-1',
          documentSlug: 'hypertrophy',
          documentTitle: 'Hypertrophy',
          category: 'fitness',
          heading: 'Volume',
          content: 'Sensitive chunk content',
          tokenCount: 12,
          similarity: 0.88,
          textRank: 0.5,
          rrfScore: 0.032,
        },
      ]),
    } as unknown as KnowledgeRepository;
    const pythonAi = {
      embed: vi.fn().mockResolvedValue({
        embeddings: [new Array<number>(768).fill(0.1)],
        usage: { model: 'gemini-embedding-001', inputTokens: 8, totalTokens: 8, durationMs: 12 },
      }),
    } as unknown as PythonAiClient;

    const svc = new KnowledgeService(repo, pythonAi, undefined, capture.logger);
    const root = createRootTraceContext();
    await runWithTraceContext(root, async () => {
      const results = await svc.searchHybrid('my secret knee pain query', { limit: 3 });
      svc.buildRagContext(results);
    });

    const serialized = capture.text();
    expect(serialized).not.toContain('my secret knee pain query');
    expect(serialized).not.toContain('Sensitive chunk content');
    expect(capture.events('ai.rag.retrieval').length).toBeGreaterThanOrEqual(1);
    expect(capture.events('ai.rag.grounding').length).toBeGreaterThanOrEqual(1);
    const snap = defaultAiMetrics.getSnapshot();
    expect(snap.rag['hybrid']?.retrievals).toBe(1);
    expect(snap.rag['hybrid']?.rerankedCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 9  Phase 17 Finalization: Zero Double-Counting & Multimodal Use-Case Telemetry
// ---------------------------------------------------------------------------

describe('Phase 17 Finalization: RAG Single-Counting & Multimodal Telemetry', () => {
  afterEach(() => {
    defaultAiMetrics.reset();
    defaultAiTracer.clear();
  });

  it('CoachContextAssembler + KnowledgeService does not double-count RAG retrievals or logs', async () => {
    defaultAiMetrics.reset();
    defaultAiTracer.clear();

    const { CoachContextAssembler } = await import(
      '../../../src/modules/coach/application/services/context-assembler.js'
    );

    const capture = createCapturingLogger();
    const repo = {
      findHybridChunks: vi.fn().mockResolvedValue([
        {
          id: 'chunk-rag-1',
          documentId: 'doc-rag-1',
          documentSlug: 'protein-timing',
          documentTitle: 'Protein Timing',
          category: 'nutrition',
          heading: 'Daily Protein',
          content: 'Spread daily protein across meals.',
          tokenCount: 10,
          similarity: 0.91,
          textRank: 0.4,
          rrfScore: 0.04,
        },
      ]),
    } as unknown as KnowledgeRepository;
    const pythonAi = {
      embed: vi.fn().mockResolvedValue({
        embeddings: [new Array<number>(768).fill(0.2)],
        usage: { model: 'gemini-embedding-001', inputTokens: 6, totalTokens: 6, durationMs: 8 },
      }),
    } as unknown as PythonAiClient;

    const knowledgeService = new KnowledgeService(repo, pythonAi, undefined, capture.logger);
    const assembler = new CoachContextAssembler({
      userContextRepo: {
        getUserFitnessContext: vi.fn().mockResolvedValue({
          profile: {
            displayName: 'Alex',
            sex: 'male',
            age: 30,
            heightCm: 178,
            currentWeightKg: 76,
            targetWeightKg: 72,
            primaryGoal: 'Fat Loss',
            experienceLevel: 'intermediate',
            preferredWorkoutPlace: 'Gym',
            workoutDaysPerWeek: 4,
            dietType: 'Vegetarian',
            dailyCalorieTarget: 2200,
            dailyProteinGrams: 140,
          },
          todayNutrition: {
            caloriesConsumed: 1200,
            proteinGrams: 75,
            carbsGrams: 130,
            fatGrams: 40,
            waterIntakeMl: 2000,
            calorieTarget: 2200,
            proteinTarget: 140,
          },
          recentWorkouts: [],
          todayPlannedWorkout: null,
          activeGoals: [],
          latestWeightKg: 76,
        }),
      },
      knowledgeService,
      logger: capture.logger,
    });

    const root = createRootTraceContext();
    await runWithTraceContext(root, async () => {
      const assembled = await assembler.assemble({
        userId: 'user-rag-single-1',
        message: 'How much protein should I eat daily for hypertrophy?',
      });
      expect(assembled.knowledge.length).toBeGreaterThanOrEqual(1);
    });

    // KnowledgeService records hybrid + grounding once; CoachContextAssembler must not duplicate.
    const snap = defaultAiMetrics.getSnapshot();
    expect(snap.rag['hybrid']?.retrievals).toBe(1);
    expect(snap.rag['hybrid']?.groundedCount).toBe(1);
    expect(capture.events('ai.rag.retrieval')).toHaveLength(1);
    expect(capture.events('ai.rag.grounding')).toHaveLength(1);
    const spans = defaultAiTracer.recentSpans(root.traceId);
    expect(spans.some((s) => s.operation === 'coach.rag.retrieve')).toBe(true);
    expect(capture.text()).not.toContain('user-rag-single-1');
  });

  it('AnalyzeMealPhotoUseCase records pre-quota multimodal validation failures without double counting', async () => {
    defaultAiMetrics.reset();
    const { AnalyzeMealPhotoUseCase } = await import(
      '../../../src/modules/nutrition/application/use-cases/analyze-meal-photo.js'
    );

    const runSpy = vi.fn();
    const useCase = new AnalyzeMealPhotoUseCase(
      { analyzePhoto: vi.fn() },
      { run: runSpy } as never,
    );

    await expect(
      useCase.execute({
        userId: 'user-photo-val-1',
        imageBase64: Buffer.from('not-an-image').toString('base64'),
        mimeType: 'image/gif' as 'image/jpeg',
      }),
    ).rejects.toThrow(/Unsupported image format/);

    expect(runSpy).not.toHaveBeenCalled();
    const snap = defaultAiMetrics.getSnapshot();
    expect(snap.multimodal.byModality['image']?.requests).toBe(1);
    expect(snap.multimodal.byModality['image']?.validationFailures).toBe(1);
    expect(snap.multimodal.validationFailuresByReason['invalid_mime']).toBe(1);
  });

  it('ParseVoiceMealUseCase records pre-quota audio validation failures without calling gate', async () => {
    defaultAiMetrics.reset();
    const { ParseVoiceMealUseCase } = await import(
      '../../../src/modules/nutrition/application/use-cases/parse-voice-meal.js'
    );

    const runSpy = vi.fn();
    const useCase = new ParseVoiceMealUseCase(
      { parseVoiceMeal: vi.fn() },
      { run: runSpy } as never,
    );

    await expect(
      useCase.execute({
        userId: 'user-voice-val-1',
        audioBase64: Buffer.from('\x00\x01audio').toString('base64'),
        mimeType: 'audio/flac',
      }),
    ).rejects.toThrow(/Unsupported audio format/);

    expect(runSpy).not.toHaveBeenCalled();
    const snap = defaultAiMetrics.getSnapshot();
    expect(snap.multimodal.byModality['audio']?.requests).toBe(1);
    expect(snap.multimodal.byModality['audio']?.validationFailures).toBe(1);
    expect(snap.multimodal.validationFailuresByReason['invalid_mime']).toBe(1);
  });

  it('PythonSpeechTranscriber records completion and error multimodal metrics', async () => {
    defaultAiMetrics.reset();
    const { PythonSpeechTranscriber } = await import(
      '../../../src/modules/coach/infrastructure/python-speech-transcriber.js'
    );

    let failNext = false;
    const capture = createCapturingLogger();
    const server = await startFakePythonServer((_req, res) => {
      if (failNext) {
        return json(res, 503, { error: { code: 'PROVIDER_UNAVAILABLE', message: 'down', dispatched: true } });
      }
      return json(res, 200, {
        outcome: 'ok',
        result: { transcript: 'two eggs for breakfast', detectedLanguage: 'en' },
        usage: {
          model: 'gemini-3.5-flash-lite',
          isFallback: false,
          inputTokens: 120,
          outputTokens: 18,
          cachedTokens: 0,
          thinkingTokens: 0,
          totalTokens: 138,
          durationMs: 42,
        },
        traceId: 'trace-stt-1',
      });
    });

    try {
      const client = new PythonAiClient({
        baseUrl: server.url,
        serviceSecret: 'test-secret-test-secret-test-secret-123',
      });
      const transcriber = new PythonSpeechTranscriber({
        client,
        resolveModels: async () => ({ primary: 'gemini-3.5-flash-lite', fallback: null }),
        pythonTimeoutMs: 5_000,
        logger: capture.logger,
      });

      const result = await transcriber.transcribe('user-stt-1', {
        mimeType: 'audio/m4a',
        base64: Buffer.from('\x00\x01valid-m4a-bytes').toString('base64'),
      });
      expect(result.transcript).toBe('two eggs for breakfast');

      failNext = true;
      await expect(
        transcriber.transcribe('user-stt-1', {
          mimeType: 'audio/m4a',
          base64: Buffer.from('\x00\x01valid-m4a-bytes').toString('base64'),
        }),
      ).rejects.toThrow(/down/);

      const snap = defaultAiMetrics.getSnapshot();
      expect(snap.multimodal.byModality['audio']?.requests).toBe(2);
      expect(snap.multimodal.byModality['audio']?.processingErrors).toBe(1);
    } finally {
      await server.close();
    }
  });
});
