import type { CoachResponse } from './coach.types.js';

export type CoachStreamResponse = CoachResponse & {
  readonly conversationId?: string | undefined;
};

export type CoachStreamEventType =
  | 'start'
  | 'status'
  | 'delta'
  | 'complete'
  | 'error'
  | 'heartbeat';

export type CoachStreamStage =
  | 'validating'
  | 'loading_context'
  | 'routing'
  | 'agent_planning'
  | 'tool_calling'
  | 'agent_working'
  | 'synthesizing'
  | 'finalizing';

export type CoachStreamMode = 'direct' | 'agent_native' | 'agent_langgraph' | 'multi_agent';

export interface PythonStreamUsage {
  readonly model: string;
  readonly isFallback: boolean;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedTokens: number;
  readonly thinkingTokens: number;
  readonly totalTokens: number;
  readonly durationMs: number;
  readonly finishReason?: string | undefined;
}

export interface CoachStreamStartEvent {
  readonly type: 'start';
  readonly traceId: string;
  readonly seq: number;
  readonly model: string;
  readonly mode: CoachStreamMode;
  readonly conversationId?: string | undefined;
  readonly timestamp: string;
}

export interface CoachStreamStatusEvent {
  readonly type: 'status';
  readonly traceId: string;
  readonly seq: number;
  readonly stage: CoachStreamStage;
  readonly message: string;
  readonly toolName?: string | undefined;
  readonly agentRole?: string | undefined;
  readonly timestamp: string;
}

export interface CoachStreamDeltaEvent {
  readonly type: 'delta';
  readonly traceId: string;
  readonly seq: number;
  readonly textDelta: string;
  readonly timestamp: string;
}

export interface CoachStreamCompleteEvent {
  readonly type: 'complete';
  readonly traceId: string;
  readonly seq: number;
  readonly response: CoachStreamResponse;
  readonly usage?: PythonStreamUsage | undefined;
  readonly timestamp: string;
}

export interface CoachStreamErrorEvent {
  readonly type: 'error';
  readonly traceId: string;
  readonly seq: number;
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly timestamp: string;
}

export interface CoachStreamHeartbeatEvent {
  readonly type: 'heartbeat';
  readonly traceId: string;
  readonly seq: number;
  readonly timestamp: string;
}

export type CoachStreamEvent =
  | CoachStreamStartEvent
  | CoachStreamStatusEvent
  | CoachStreamDeltaEvent
  | CoachStreamCompleteEvent
  | CoachStreamErrorEvent
  | CoachStreamHeartbeatEvent;

const SAFE_ERROR_MESSAGE_BY_CODE: Readonly<Record<string, string>> = {
  FEATURE_DISABLED: 'Streaming AI Coach is currently disabled.',
  RATE_LIMITED: 'Too many requests. Please slow down and try again shortly.',
  AI_QUOTA_EXCEEDED: 'Daily AI Coach limit reached. Please try again tomorrow.',
  PROVIDER_RATE_LIMITED: 'The AI Coach is experiencing high demand right now. Please wait a moment and try again.',
  PROVIDER_QUOTA_EXHAUSTED: 'Daily AI Coach capacity has been reached. Please check back tomorrow.',
  PROVIDER_TIMEOUT: 'AI request timed out. Please try again.',
  DEADLINE_EXCEEDED: 'AI request timed out. Please try again.',
  PROVIDER_UNAVAILABLE: 'The AI Coach is temporarily unavailable. Please try again shortly.',
  AI_UNAVAILABLE: 'The AI Coach is experiencing high demand right now. Please wait a moment and try again.',
  SERVICE_UNAVAILABLE: 'The AI Coach is temporarily unavailable. Please try again shortly.',
  PROVIDER_AUTH_ERROR: 'AI service configuration error. Please try again later.',
  PROVIDER_NOT_CONFIGURED: 'AI service is not configured.',
  PROVIDER_ERROR: 'Unable to complete your coaching response right now. Please try again.',
  SAFETY_BLOCKED: 'Coach response was blocked by safety policies.',
  MAX_TOKENS: 'Coach response reached the maximum length limit.',
  INVALID_REQUEST: 'Invalid coaching request.',
  VALIDATION_FAILED: 'Invalid coaching request.',
  STREAM_CANCELLED: 'Generation stopped.',
  STREAM_INTERRUPTED: 'Connection interrupted before completion.',
  INTERNAL_ERROR: 'An unexpected error occurred while streaming. Please try again.',
};

const RETRYABLE_ERROR_CODES = new Set([
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_TIMEOUT',
  'DEADLINE_EXCEEDED',
  'PROVIDER_UNAVAILABLE',
  'AI_UNAVAILABLE',
  'SERVICE_UNAVAILABLE',
  'STREAM_INTERRUPTED',
  'RATE_LIMITED',
]);

const RE_GOOGLE_KEY = /AIza[0-9A-Za-z_-]{20,}/g;
const RE_SK_KEY = /\bsk-[A-Za-z0-9_-]{16,}\b/g;
const RE_BEARER = /\bbearer\s+[A-Za-z0-9._~+/=-]+/gi;
const RE_JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g;
const RE_INTERNAL_URL =
  /https?:\/\/(?:127\.0\.0\.1|localhost|0\.0\.0\.0|10\.\d+\.\d+\.\d+|172\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)[^\s'"]*/gi;
const RE_INTERNAL_IP = /\b(?:127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})(?::\d+)?\b/g;
const RE_BREAKOUT_TAGS =
  /<\/?(?:retrieved_knowledge|knowledge_source|system|context_manifest|thought|thinking)[^>]*>/gi;

/** Defense-in-depth redaction for streamed text deltas before forwarding or persisting. */
export function redactUnsafeStreamText(delta: string): string {
  if (!delta) return '';
  return delta
    .replace(RE_GOOGLE_KEY, '[redacted]')
    .replace(RE_SK_KEY, '[redacted]')
    .replace(RE_BEARER, '[redacted]')
    .replace(RE_JWT, '[redacted]')
    .replace(RE_INTERNAL_URL, '[redacted-url]')
    .replace(RE_INTERNAL_IP, '[redacted-host]')
    .replace(RE_BREAKOUT_TAGS, '');
}

/** Maps an upstream or internal error code to a closed, sanitized client error payload. */
export function sanitizeStreamError(
  rawCode: string,
  _rawMessage?: string,
): { readonly code: string; readonly message: string; readonly retryable: boolean } {
  const normalized = (rawCode || 'INTERNAL_ERROR').trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  const code = normalized in SAFE_ERROR_MESSAGE_BY_CODE ? normalized : 'INTERNAL_ERROR';
  const message =
    SAFE_ERROR_MESSAGE_BY_CODE[code] ?? 'An unexpected error occurred while streaming. Please try again.';
  return {
    code,
    message,
    retryable: RETRYABLE_ERROR_CODES.has(code),
  };
}

/** Encodes a typed Coach stream event into standard RFC 8895 SSE wire format. */
export function formatSseEvent(event: CoachStreamEvent): string {
  const payload = JSON.stringify(event);
  return `id: ${event.seq}\nevent: ${event.type}\ndata: ${payload}\n\n`;
}
