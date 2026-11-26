import { performance } from 'node:perf_hooks';
import { defaultAiMetrics, type AiMetricsRegistry } from './ai-metrics.js';
import type { Logger } from '../logging/logger.js';

export type StreamOutcome = 'completed' | 'cancelled' | 'error' | 'timeout' | 'fallback';

export interface StreamMetricSnapshot {
  readonly totalStreams: number;
  readonly activeStreams: number;
  readonly completedStreams: number;
  readonly cancelledStreams: number;
  readonly errorStreams: number;
  readonly timeoutStreams: number;
  readonly fallbackCount: number;
  readonly malformedEvents: number;
  readonly avgTtftMs: number | null;
  readonly p95TtftMs: number | null;
  readonly avgDurationMs: number | null;
  readonly cancellationRate: number;
  readonly failureRate: number;
}

const MAX_SAMPLES = 500;

function appendSample(target: number[], value: number): void {
  if (!Number.isFinite(value) || value < 0) return;
  target.push(Math.round(value * 100) / 100);
  if (target.length > MAX_SAMPLES) {
    target.shift();
  }
}

function average(samples: readonly number[]): number | null {
  if (samples.length === 0) return null;
  const total = samples.reduce((acc, item) => acc + item, 0);
  return Math.round((total / samples.length) * 100) / 100;
}

function percentile(samples: readonly number[], p: number): number | null {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx] ?? null;
}

/**
 * SSE streaming metrics collector for Node.js gateway telemetry.
 * Records TTFT, latency, cancellation rate, and failure rates and optionally
 * forwards aggregate stream telemetry into the shared Phase 17 `AiMetricsRegistry`.
 */
export class NodeStreamMetricsCollector {
  private totalStreams = 0;
  private activeStreams = 0;
  private completedStreams = 0;
  private cancelledStreams = 0;
  private errorStreams = 0;
  private timeoutStreams = 0;
  private fallbackCount = 0;
  private malformedEvents = 0;
  private readonly ttftSamples: number[] = [];
  private readonly durationSamples: number[] = [];

  constructor(private readonly aiMetrics?: AiMetricsRegistry) {}

  recordStart(): void {
    this.totalStreams += 1;
    this.activeStreams += 1;
    try {
      this.aiMetrics?.recordStreamStart();
    } catch {
      // Fail-open observability
    }
  }

  recordTtft(ttftMs: number): void {
    appendSample(this.ttftSamples, ttftMs);
    try {
      this.aiMetrics?.recordStreamTtft(ttftMs);
    } catch {
      // Fail-open observability
    }
  }

  recordMalformedEvent(): void {
    this.malformedEvents += 1;
    try {
      this.aiMetrics?.recordStreamMalformedEvent();
    } catch {
      // Fail-open observability
    }
  }

  recordFallback(): void {
    this.fallbackCount += 1;
    try {
      this.aiMetrics?.recordStreamFallback();
    } catch {
      // Fail-open observability
    }
  }

  recordFinish(outcome: StreamOutcome, durationMs: number): void {
    this.activeStreams = Math.max(0, this.activeStreams - 1);
    appendSample(this.durationSamples, durationMs);
    if (outcome === 'completed') this.completedStreams += 1;
    else if (outcome === 'cancelled') this.cancelledStreams += 1;
    else if (outcome === 'timeout') this.timeoutStreams += 1;
    else if (outcome === 'fallback') this.fallbackCount += 1;
    else this.errorStreams += 1;
    try {
      this.aiMetrics?.recordStreamFinish(outcome, durationMs);
    } catch {
      // Fail-open observability
    }
  }

  snapshot(): StreamMetricSnapshot {
    const finished = this.completedStreams + this.cancelledStreams + this.errorStreams + this.timeoutStreams;
    const failures = this.errorStreams + this.timeoutStreams;
    return {
      totalStreams: this.totalStreams,
      activeStreams: this.activeStreams,
      completedStreams: this.completedStreams,
      cancelledStreams: this.cancelledStreams,
      errorStreams: this.errorStreams,
      timeoutStreams: this.timeoutStreams,
      fallbackCount: this.fallbackCount,
      malformedEvents: this.malformedEvents,
      avgTtftMs: average(this.ttftSamples),
      p95TtftMs: percentile(this.ttftSamples, 95),
      avgDurationMs: average(this.durationSamples),
      cancellationRate: finished > 0 ? Math.round((this.cancelledStreams / finished) * 10_000) / 10_000 : 0,
      failureRate: finished > 0 ? Math.round((failures / finished) * 10_000) / 10_000 : 0,
    };
  }
}

export const nodeStreamMetrics = new NodeStreamMetricsCollector(defaultAiMetrics);

export interface StreamTrackerOptions {
  readonly requestId: string;
  readonly traceId: string;
  readonly userId: string;
  readonly feature: string;
  readonly metrics?: NodeStreamMetricsCollector;
  readonly logger?: Pick<Logger, 'info' | 'warn'>;
}

/** Per-request privacy-safe lifecycle tracker for Node.js SSE Coach streams. */
export class NodeStreamTracker {
  private readonly startedAt = performance.now();
  private ttftMs: number | null = null;
  private chunkCount = 0;
  private charCount = 0;
  private finished = false;
  private readonly metrics: NodeStreamMetricsCollector;

  constructor(private readonly options: StreamTrackerOptions) {
    this.metrics = options.metrics ?? nodeStreamMetrics;
    this.metrics.recordStart();
    this.options.logger?.info(
      {
        event: 'ai.stream.started',
        requestId: this.options.requestId,
        traceId: this.options.traceId,
        userId: this.options.userId,
        feature: this.options.feature,
      },
      'ai coach stream started',
    );
  }

  markDelta(deltaLength: number): void {
    this.chunkCount += 1;
    this.charCount += Math.max(0, deltaLength);
    if (this.ttftMs === null) {
      this.ttftMs = Math.round((performance.now() - this.startedAt) * 100) / 100;
      this.metrics.recordTtft(this.ttftMs);
      this.options.logger?.info(
        {
          event: 'ai.stream.first_token',
          requestId: this.options.requestId,
          traceId: this.options.traceId,
          feature: this.options.feature,
          ttftMs: this.ttftMs,
        },
        'ai coach stream first token received',
      );
    }
  }

  markMalformedEvent(): void {
    this.metrics.recordMalformedEvent();
  }

  finish(outcome: StreamOutcome, errorCode?: string): { ttftMs: number | null; durationMs: number } {
    const durationMs = Math.round((performance.now() - this.startedAt) * 100) / 100;
    if (this.finished) {
      return { ttftMs: this.ttftMs, durationMs };
    }
    this.finished = true;
    this.metrics.recordFinish(outcome, durationMs);
    const payload = {
      event:
        outcome === 'completed'
          ? 'ai.stream.completed'
          : outcome === 'cancelled'
            ? 'ai.stream.cancelled'
            : 'ai.stream.failed',
      requestId: this.options.requestId,
      traceId: this.options.traceId,
      userId: this.options.userId,
      feature: this.options.feature,
      outcome,
      ttftMs: this.ttftMs,
      durationMs,
      chunkCount: this.chunkCount,
      charCount: this.charCount,
      ...(errorCode ? { errorCode } : {}),
    };
    if (outcome === 'error' || outcome === 'timeout') {
      this.options.logger?.warn(payload, 'ai coach stream ended with error');
    } else {
      this.options.logger?.info(payload, 'ai coach stream finished');
    }
    return { ttftMs: this.ttftMs, durationMs };
  }
}
