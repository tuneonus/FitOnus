import { AI_ERROR_CATEGORIES } from './ai-observability.js';

export const MAX_LATENCY_SAMPLES = 256;
export const MAX_SERIES_PER_GROUP = 64;
export const OVERFLOW_LABEL = '_other';

const ALLOWED_FEATURES = new Set([
  'coach_chat',
  'coach_insights',
  'coach_memory_extract',
  'coach_agent',
  'coach_multi_agent',
  'voice_meal',
  'meal_photo',
  'multimodal_meal',
  'transcribe',
  'knowledge_embed',
  'workout_generator',
  'workout_planner',
  'rag',
]);

const ALLOWED_ERROR_CATEGORIES: ReadonlySet<string> = new Set<string>(AI_ERROR_CATEGORIES);
const ALLOWED_RAG_MODES = new Set(['vector', 'lexical', 'hybrid', 'reranked', 'grounding']);
const ALLOWED_AGENT_ENGINES = new Set(['native', 'langgraph', 'multi_agent', 'workout_planner']);
const ALLOWED_MODALITIES = new Set(['image', 'audio', 'multimodal']);
const ALLOWED_MEDIA_FAILURE_REASONS = new Set([
  'invalid_mime',
  'oversize',
  'polyglot',
  'pixel_bomb',
  'duration_exceeded',
  'corrupt_decode',
  'empty_payload',
  'other',
]);

function boundClosed(
  value: string | undefined,
  allowed: ReadonlySet<string>,
  fallback = OVERFLOW_LABEL,
): string {
  if (!value) return fallback;
  const norm = value.trim().toLowerCase();
  return allowed.has(norm) ? norm : fallback;
}

function boundDynamicKey<T>(map: Map<string, T>, rawKey: string | undefined, maxSeries: number): string {
  const clean = (rawKey ?? '').trim().slice(0, 64) || OVERFLOW_LABEL;
  if (map.has(clean) || map.size < maxSeries) {
    return clean;
  }
  return OVERFLOW_LABEL;
}

export interface LatencySummary {
  readonly count: number;
  readonly avgMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
}

class LatencyWindow {
  private readonly samples: number[] = [];
  private writeIndex = 0;
  private totalCount = 0;
  private totalSum = 0;
  private maxVal = 0;

  add(valueMs: number): void {
    const safeVal = Number.isFinite(valueMs) ? Math.max(0, valueMs) : 0;
    if (this.samples.length < MAX_LATENCY_SAMPLES) {
      this.samples.push(safeVal);
    } else {
      this.samples[this.writeIndex] = safeVal;
      this.writeIndex = (this.writeIndex + 1) % MAX_LATENCY_SAMPLES;
    }
    this.totalCount += 1;
    this.totalSum += safeVal;
    if (safeVal > this.maxVal) this.maxVal = safeVal;
  }

  summary(): LatencySummary {
    const sorted = [...this.samples].sort((a, b) => a - b);
    const pct = (p: number): number => {
      if (sorted.length === 0) return 0;
      if (sorted.length === 1) return Math.round(sorted[0]! * 1000) / 1000;
      const pos = (p / 100) * (sorted.length - 1);
      const lo = Math.floor(pos);
      const hi = Math.ceil(pos);
      if (lo === hi) return Math.round(sorted[lo]! * 1000) / 1000;
      const val = sorted[lo]! * (1 - (pos - lo)) + sorted[hi]! * (pos - lo);
      return Math.round(val * 1000) / 1000;
    };
    return {
      count: this.totalCount,
      avgMs: this.totalCount > 0 ? Math.round((this.totalSum / this.totalCount) * 1000) / 1000 : 0,
      p50Ms: pct(50),
      p95Ms: pct(95),
      p99Ms: pct(99),
      maxMs: Math.round(this.maxVal * 1000) / 1000,
    };
  }
}

interface FeatureSeries {
  requests: number;
  successes: number;
  failures: number;
  timeouts: number;
  retries: number;
  fallbacks: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  thinkingTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  latency: LatencyWindow;
}

interface RagSeries {
  retrievals: number;
  emptyResults: number;
  rerankedCount: number;
  groundedCount: number;
  failedCount: number;
  candidatesTotal: number;
  returnedTotal: number;
  citationsTotal: number;
  topScoreSum: number;
  topScoreSamples: number;
  avgScoreSum: number;
  avgScoreSamples: number;
  latency: LatencyWindow;
}

interface AgentSeries {
  executions: number;
  failures: number;
  fallbacks: number;
  limitHits: number;
  toolCalls: number;
  toolFailures: number;
  iterationsTotal: number;
  replansTotal: number;
  latency: LatencyWindow;
}

interface MultimodalSeries {
  requests: number;
  validationFailures: number;
  processingErrors: number;
  totalBytes: number;
  latency: LatencyWindow;
  validationLatency: LatencyWindow;
}

function newFeatureSeries(): FeatureSeries {
  return {
    requests: 0,
    successes: 0,
    failures: 0,
    timeouts: 0,
    retries: 0,
    fallbacks: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedTokens: 0,
    thinkingTokens: 0,
    totalTokens: 0,
    estimatedCostUsd: 0,
    latency: new LatencyWindow(),
  };
}

export interface FeatureMetricsSnapshot {
  readonly requests: number;
  readonly successes: number;
  readonly failures: number;
  readonly failureRate: number;
  readonly timeouts: number;
  readonly retries: number;
  readonly fallbacks: number;
  readonly fallbackRate: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedTokens: number;
  readonly thinkingTokens: number;
  readonly totalTokens: number;
  readonly estimatedCostUsd: number;
  readonly latency: LatencySummary;
}

export interface RagMetricsSnapshot {
  readonly retrievals: number;
  readonly emptyResults: number;
  readonly emptyRate: number;
  readonly rerankedCount: number;
  readonly groundedCount: number;
  readonly failedCount: number;
  readonly avgCandidates: number;
  readonly avgReturned: number;
  readonly citationsTotal: number;
  readonly avgTopScore: number;
  readonly avgScore: number;
  readonly latency: LatencySummary;
}

export interface AgentMetricsSnapshot {
  readonly executions: number;
  readonly failures: number;
  readonly fallbacks: number;
  readonly limitHits: number;
  readonly toolCalls: number;
  readonly toolFailures: number;
  readonly avgIterations: number;
  readonly replansTotal: number;
  readonly latency: LatencySummary;
}

export interface MultimodalMetricsSnapshot {
  readonly requests: number;
  readonly validationFailures: number;
  readonly processingErrors: number;
  readonly totalBytes: number;
  readonly latency: LatencySummary;
  readonly validationLatency: LatencySummary;
}

export interface StreamingMetricsSummary {
  readonly totalStreams: number;
  readonly completedStreams: number;
  readonly cancelledStreams: number;
  readonly errorStreams: number;
  readonly timeoutStreams: number;
  readonly fallbackCount: number;
  readonly malformedEvents: number;
  readonly ttft: LatencySummary;
  readonly duration: LatencySummary;
}

export interface AiMetricsSnapshot {
  readonly ai: {
    readonly totalRequests: number;
    readonly successCount: number;
    readonly failureCount: number;
    readonly successRate: number;
    readonly failureRate: number;
    readonly timeoutCount: number;
    readonly timeoutRate: number;
    readonly retryCount: number;
    readonly fallbackCount: number;
    readonly fallbackRate: number;
    readonly totalTokens: number;
    readonly estimatedCostUsd: number;
    readonly byFeature: Record<string, FeatureMetricsSnapshot>;
    readonly byModel: Record<string, FeatureMetricsSnapshot>;
    readonly errorsByCategory: Record<string, number>;
  };
  readonly rag: Record<string, RagMetricsSnapshot>;
  readonly agent: {
    readonly byEngine: Record<string, AgentMetricsSnapshot>;
    readonly routingDecisions: Record<string, number>;
    readonly limitHitsByType: Record<string, number>;
  };
  readonly multimodal: {
    readonly byModality: Record<string, MultimodalMetricsSnapshot>;
    readonly validationFailuresByReason: Record<string, number>;
  };
  readonly streaming: StreamingMetricsSummary;
  readonly cardinality: {
    readonly features: number;
    readonly models: number;
    readonly maxSeriesPerGroup: number;
  };
}

/**
 * Bounded-cardinality in-memory metrics collector for AI, RAG, Agent, and Multimodal pipelines.
 */
export class AiMetricsRegistry {
  private readonly maxSeries: number;
  private features = new Map<string, FeatureSeries>();
  private models = new Map<string, FeatureSeries>();
  private errorsByCategory = new Map<string, number>();
  private ragModes = new Map<string, RagSeries>();
  private agentEngines = new Map<string, AgentSeries>();
  private agentRouting = new Map<string, number>();
  private agentLimits = new Map<string, number>();
  private multimodal = new Map<string, MultimodalSeries>();
  private multimodalFailureReasons = new Map<string, number>();
  private streamStats = {
    totalStreams: 0,
    completedStreams: 0,
    cancelledStreams: 0,
    errorStreams: 0,
    timeoutStreams: 0,
    fallbackCount: 0,
    malformedEvents: 0,
    ttft: new LatencyWindow(),
    duration: new LatencyWindow(),
  };

  constructor(maxSeries = MAX_SERIES_PER_GROUP) {
    this.maxSeries = Math.max(4, maxSeries);
  }

  reset(): void {
    this.features.clear();
    this.models.clear();
    this.errorsByCategory.clear();
    this.ragModes.clear();
    this.agentEngines.clear();
    this.agentRouting.clear();
    this.agentLimits.clear();
    this.multimodal.clear();
    this.multimodalFailureReasons.clear();
    this.streamStats = {
      totalStreams: 0,
      completedStreams: 0,
      cancelledStreams: 0,
      errorStreams: 0,
      timeoutStreams: 0,
      fallbackCount: 0,
      malformedEvents: 0,
      ttft: new LatencyWindow(),
      duration: new LatencyWindow(),
    };
  }

  recordLlmCall(input: {
    feature: string;
    model?: string | undefined;
    durationMs: number;
    success: boolean;
    inputTokens?: number | undefined;
    outputTokens?: number | undefined;
    cachedTokens?: number | undefined;
    thinkingTokens?: number | undefined;
    totalTokens?: number | undefined;
    isFallback?: boolean | undefined;
    retries?: number | undefined;
    errorCategory?: string | null | undefined;
    timeout?: boolean | undefined;
    estimatedCostUsd?: number | undefined;
  }): void {
    const featKey = boundClosed(input.feature, ALLOWED_FEATURES);
    let featSeries = this.features.get(featKey);
    if (!featSeries) {
      featSeries = newFeatureSeries();
      this.features.set(featKey, featSeries);
    }

    const targets: FeatureSeries[] = [featSeries];
    if (input.model) {
      const modelKey = boundDynamicKey(this.models, input.model, this.maxSeries);
      let modelSeries = this.models.get(modelKey);
      if (!modelSeries) {
        modelSeries = newFeatureSeries();
        this.models.set(modelKey, modelSeries);
      }
      targets.push(modelSeries);
    }

    const cat = input.errorCategory ? boundClosed(input.errorCategory, ALLOWED_ERROR_CATEGORIES) : undefined;
    const isTimeout = Boolean(input.timeout || cat === 'gemini_timeout' || cat === 'python_timeout');
    const cost = input.estimatedCostUsd ?? 0;

    for (const s of targets) {
      s.requests += 1;
      if (input.success) s.successes += 1;
      else s.failures += 1;
      if (isTimeout) s.timeouts += 1;
      s.retries += Math.max(0, input.retries ?? 0);
      if (input.isFallback) s.fallbacks += 1;
      s.inputTokens += Math.max(0, input.inputTokens ?? 0);
      s.outputTokens += Math.max(0, input.outputTokens ?? 0);
      s.cachedTokens += Math.max(0, input.cachedTokens ?? 0);
      s.thinkingTokens += Math.max(0, input.thinkingTokens ?? 0);
      s.totalTokens += Math.max(0, input.totalTokens ?? 0);
      s.estimatedCostUsd = Math.round((s.estimatedCostUsd + Math.max(0, cost)) * 1_000_000) / 1_000_000;
      s.latency.add(input.durationMs);
    }

    if (cat) {
      this.errorsByCategory.set(cat, (this.errorsByCategory.get(cat) ?? 0) + 1);
    }
  }

  /** Attributes computed USD cost from `GeminiRuntimeService.calculateCostUsd` without inflating request count. */
  recordCostUsd(feature: string, model: string, costUsd: number): void {
    if (!Number.isFinite(costUsd) || costUsd <= 0) return;
    const featKey = boundClosed(feature, ALLOWED_FEATURES);
    const featSeries = this.features.get(featKey);
    if (featSeries) {
      featSeries.estimatedCostUsd =
        Math.round((featSeries.estimatedCostUsd + costUsd) * 1_000_000) / 1_000_000;
    }
    const modelKey = boundDynamicKey(this.models, model, this.maxSeries);
    const modelSeries = this.models.get(modelKey);
    if (modelSeries) {
      modelSeries.estimatedCostUsd =
        Math.round((modelSeries.estimatedCostUsd + costUsd) * 1_000_000) / 1_000_000;
    }
  }

  recordRagRetrieval(input: {
    mode: string;
    durationMs: number;
    candidateCount?: number | undefined;
    returnedCount?: number | undefined;
    topScore?: number | undefined;
    avgScore?: number | undefined;
    reranked?: boolean | undefined;
    citationsCount?: number | undefined;
    grounded?: boolean | undefined;
    emptyResult?: boolean | undefined;
    failed?: boolean | undefined;
  }): void {
    const modeKey = boundClosed(input.mode, ALLOWED_RAG_MODES);
    let series = this.ragModes.get(modeKey);
    if (!series) {
      series = {
        retrievals: 0,
        emptyResults: 0,
        rerankedCount: 0,
        groundedCount: 0,
        failedCount: 0,
        candidatesTotal: 0,
        returnedTotal: 0,
        citationsTotal: 0,
        topScoreSum: 0,
        topScoreSamples: 0,
        avgScoreSum: 0,
        avgScoreSamples: 0,
        latency: new LatencyWindow(),
      };
      this.ragModes.set(modeKey, series);
    }
    const returned = Math.max(0, input.returnedCount ?? 0);
    const failed = Boolean(input.failed);
    const isEmpty = input.emptyResult ?? (returned === 0 && !failed);
    series.retrievals += 1;
    if (failed) series.failedCount += 1;
    if (isEmpty && !failed) series.emptyResults += 1;
    if (input.reranked) series.rerankedCount += 1;
    if ((input.grounded ?? true) && returned > 0) series.groundedCount += 1;
    series.candidatesTotal += Math.max(0, input.candidateCount ?? returned);
    series.returnedTotal += returned;
    series.citationsTotal += Math.max(0, input.citationsCount ?? 0);
    if (input.topScore !== undefined && Number.isFinite(input.topScore)) {
      series.topScoreSum += input.topScore;
      series.topScoreSamples += 1;
    }
    if (input.avgScore !== undefined && Number.isFinite(input.avgScore)) {
      series.avgScoreSum += input.avgScore;
      series.avgScoreSamples += 1;
    }
    series.latency.add(input.durationMs);
  }

  recordAgentExecution(input: {
    engine: string;
    routingDecision: string;
    durationMs: number;
    toolCalls?: number | undefined;
    toolFailures?: number | undefined;
    iterations?: number | undefined;
    replans?: number | undefined;
    limitHit?: string | undefined;
    failed?: boolean | undefined;
    fallbackUsed?: boolean | undefined;
  }): void {
    const engineKey = boundClosed(input.engine, ALLOWED_AGENT_ENGINES);
    let series = this.agentEngines.get(engineKey);
    if (!series) {
      series = {
        executions: 0,
        failures: 0,
        fallbacks: 0,
        limitHits: 0,
        toolCalls: 0,
        toolFailures: 0,
        iterationsTotal: 0,
        replansTotal: 0,
        latency: new LatencyWindow(),
      };
      this.agentEngines.set(engineKey, series);
    }
    series.executions += 1;
    if (input.failed) series.failures += 1;
    if (input.fallbackUsed) series.fallbacks += 1;
    if (input.limitHit) {
      series.limitHits += 1;
      const limKey = boundDynamicKey(this.agentLimits, input.limitHit, this.maxSeries);
      this.agentLimits.set(limKey, (this.agentLimits.get(limKey) ?? 0) + 1);
    }
    series.toolCalls += Math.max(0, input.toolCalls ?? 0);
    series.toolFailures += Math.max(0, input.toolFailures ?? 0);
    series.iterationsTotal += Math.max(0, input.iterations ?? 0);
    series.replansTotal += Math.max(0, input.replans ?? 0);
    series.latency.add(input.durationMs);

    const routeKey = boundDynamicKey(this.agentRouting, input.routingDecision, this.maxSeries);
    this.agentRouting.set(routeKey, (this.agentRouting.get(routeKey) ?? 0) + 1);
  }

  recordMultimodalProcessing(input: {
    modality: string;
    durationMs: number;
    validationDurationMs?: number | undefined;
    validationFailed?: boolean | undefined;
    validationReason?: string | undefined;
    processingError?: boolean | undefined;
    byteSize?: number | undefined;
  }): void {
    const modKey = boundClosed(input.modality, ALLOWED_MODALITIES);
    let series = this.multimodal.get(modKey);
    if (!series) {
      series = {
        requests: 0,
        validationFailures: 0,
        processingErrors: 0,
        totalBytes: 0,
        latency: new LatencyWindow(),
        validationLatency: new LatencyWindow(),
      };
      this.multimodal.set(modKey, series);
    }
    series.requests += 1;
    if (input.validationFailed) {
      series.validationFailures += 1;
      const reasonKey = boundClosed(input.validationReason, ALLOWED_MEDIA_FAILURE_REASONS, 'other');
      this.multimodalFailureReasons.set(reasonKey, (this.multimodalFailureReasons.get(reasonKey) ?? 0) + 1);
    }
    if (input.processingError) series.processingErrors += 1;
    series.totalBytes += Math.max(0, input.byteSize ?? 0);
    series.latency.add(input.durationMs);
    if (input.validationDurationMs !== undefined && input.validationDurationMs > 0) {
      series.validationLatency.add(input.validationDurationMs);
    }
  }

  recordStreamStart(): void {
    this.streamStats.totalStreams += 1;
  }

  recordStreamTtft(ttftMs: number): void {
    this.streamStats.ttft.add(ttftMs);
  }

  recordStreamMalformedEvent(): void {
    this.streamStats.malformedEvents += 1;
  }

  recordStreamFallback(): void {
    this.streamStats.fallbackCount += 1;
  }

  recordStreamFinish(
    outcome: 'completed' | 'cancelled' | 'error' | 'timeout' | 'fallback',
    durationMs: number,
  ): void {
    this.streamStats.duration.add(durationMs);
    if (outcome === 'completed') this.streamStats.completedStreams += 1;
    else if (outcome === 'cancelled') this.streamStats.cancelledStreams += 1;
    else if (outcome === 'timeout') this.streamStats.timeoutStreams += 1;
    else if (outcome === 'fallback') this.streamStats.fallbackCount += 1;
    else this.streamStats.errorStreams += 1;
  }

  getSnapshot(): AiMetricsSnapshot {
    let totalRequests = 0;
    let successCount = 0;
    let failureCount = 0;
    let timeoutCount = 0;
    let retryCount = 0;
    let fallbackCount = 0;
    let totalTokens = 0;
    let estimatedCostUsd = 0;

    const serializeSeries = (s: FeatureSeries): FeatureMetricsSnapshot => ({
      requests: s.requests,
      successes: s.successes,
      failures: s.failures,
      failureRate: s.requests > 0 ? Math.round((s.failures / s.requests) * 10_000) / 10_000 : 0,
      timeouts: s.timeouts,
      retries: s.retries,
      fallbacks: s.fallbacks,
      fallbackRate: s.requests > 0 ? Math.round((s.fallbacks / s.requests) * 10_000) / 10_000 : 0,
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
      cachedTokens: s.cachedTokens,
      thinkingTokens: s.thinkingTokens,
      totalTokens: s.totalTokens,
      estimatedCostUsd: s.estimatedCostUsd,
      latency: s.latency.summary(),
    });

    const byFeature: Record<string, FeatureMetricsSnapshot> = {};
    for (const [k, s] of this.features.entries()) {
      totalRequests += s.requests;
      successCount += s.successes;
      failureCount += s.failures;
      timeoutCount += s.timeouts;
      retryCount += s.retries;
      fallbackCount += s.fallbacks;
      totalTokens += s.totalTokens;
      estimatedCostUsd += s.estimatedCostUsd;
      byFeature[k] = serializeSeries(s);
    }

    const byModel: Record<string, FeatureMetricsSnapshot> = {};
    for (const [k, s] of this.models.entries()) {
      byModel[k] = serializeSeries(s);
    }

    const rag: Record<string, RagMetricsSnapshot> = {};
    for (const [mode, s] of this.ragModes.entries()) {
      rag[mode] = {
        retrievals: s.retrievals,
        emptyResults: s.emptyResults,
        emptyRate: s.retrievals > 0 ? Math.round((s.emptyResults / s.retrievals) * 10_000) / 10_000 : 0,
        rerankedCount: s.rerankedCount,
        groundedCount: s.groundedCount,
        failedCount: s.failedCount,
        avgCandidates: s.retrievals > 0 ? Math.round((s.candidatesTotal / s.retrievals) * 100) / 100 : 0,
        avgReturned: s.retrievals > 0 ? Math.round((s.returnedTotal / s.retrievals) * 100) / 100 : 0,
        citationsTotal: s.citationsTotal,
        avgTopScore:
          s.topScoreSamples > 0 ? Math.round((s.topScoreSum / s.topScoreSamples) * 10_000) / 10_000 : 0,
        avgScore:
          s.avgScoreSamples > 0 ? Math.round((s.avgScoreSum / s.avgScoreSamples) * 10_000) / 10_000 : 0,
        latency: s.latency.summary(),
      };
    }

    const byEngine: Record<string, AgentMetricsSnapshot> = {};
    for (const [engine, s] of this.agentEngines.entries()) {
      byEngine[engine] = {
        executions: s.executions,
        failures: s.failures,
        fallbacks: s.fallbacks,
        limitHits: s.limitHits,
        toolCalls: s.toolCalls,
        toolFailures: s.toolFailures,
        avgIterations: s.executions > 0 ? Math.round((s.iterationsTotal / s.executions) * 100) / 100 : 0,
        replansTotal: s.replansTotal,
        latency: s.latency.summary(),
      };
    }

    const byModality: Record<string, MultimodalMetricsSnapshot> = {};
    for (const [mod, s] of this.multimodal.entries()) {
      byModality[mod] = {
        requests: s.requests,
        validationFailures: s.validationFailures,
        processingErrors: s.processingErrors,
        totalBytes: s.totalBytes,
        latency: s.latency.summary(),
        validationLatency: s.validationLatency.summary(),
      };
    }

    return {
      ai: {
        totalRequests,
        successCount,
        failureCount,
        successRate: totalRequests > 0 ? Math.round((successCount / totalRequests) * 10_000) / 10_000 : 0,
        failureRate: totalRequests > 0 ? Math.round((failureCount / totalRequests) * 10_000) / 10_000 : 0,
        timeoutCount,
        timeoutRate: totalRequests > 0 ? Math.round((timeoutCount / totalRequests) * 10_000) / 10_000 : 0,
        retryCount,
        fallbackCount,
        fallbackRate: totalRequests > 0 ? Math.round((fallbackCount / totalRequests) * 10_000) / 10_000 : 0,
        totalTokens,
        estimatedCostUsd: Math.round(estimatedCostUsd * 1_000_000) / 1_000_000,
        byFeature,
        byModel,
        errorsByCategory: Object.fromEntries(this.errorsByCategory.entries()),
      },
      rag,
      agent: {
        byEngine,
        routingDecisions: Object.fromEntries(this.agentRouting.entries()),
        limitHitsByType: Object.fromEntries(this.agentLimits.entries()),
      },
      multimodal: {
        byModality,
        validationFailuresByReason: Object.fromEntries(this.multimodalFailureReasons.entries()),
      },
      streaming: {
        totalStreams: this.streamStats.totalStreams,
        completedStreams: this.streamStats.completedStreams,
        cancelledStreams: this.streamStats.cancelledStreams,
        errorStreams: this.streamStats.errorStreams,
        timeoutStreams: this.streamStats.timeoutStreams,
        fallbackCount: this.streamStats.fallbackCount,
        malformedEvents: this.streamStats.malformedEvents,
        ttft: this.streamStats.ttft.summary(),
        duration: this.streamStats.duration.summary(),
      },
      cardinality: {
        features: this.features.size,
        models: this.models.size,
        maxSeriesPerGroup: this.maxSeries,
      },
    };
  }
}

export const defaultAiMetrics = new AiMetricsRegistry();
