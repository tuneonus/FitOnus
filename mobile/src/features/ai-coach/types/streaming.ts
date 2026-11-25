import type { CoachResponse } from './coach';

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

export type CoachStreamStartEvent = {
  type: 'start';
  traceId: string;
  seq: number;
  model: string;
  mode: CoachStreamMode;
  conversationId?: string | undefined;
  timestamp: string;
};

export type CoachStreamStatusEvent = {
  type: 'status';
  traceId: string;
  seq: number;
  stage: CoachStreamStage;
  message: string;
  toolName?: string | undefined;
  agentRole?: string | undefined;
  timestamp: string;
};

export type CoachStreamDeltaEvent = {
  type: 'delta';
  traceId: string;
  seq: number;
  textDelta: string;
  timestamp: string;
};

export type CoachStreamCompletePayload = CoachResponse;

export type CoachStreamCompleteEvent = {
  type: 'complete';
  traceId: string;
  seq: number;
  response: CoachStreamCompletePayload;
  timestamp: string;
};

export type CoachStreamErrorEvent = {
  type: 'error';
  traceId: string;
  seq: number;
  code: string;
  message: string;
  retryable: boolean;
  timestamp: string;
};

export type CoachStreamHeartbeatEvent = {
  type: 'heartbeat';
  traceId: string;
  seq: number;
  timestamp: string;
};

export type CoachStreamEvent =
  | CoachStreamStartEvent
  | CoachStreamStatusEvent
  | CoachStreamDeltaEvent
  | CoachStreamCompleteEvent
  | CoachStreamErrorEvent
  | CoachStreamHeartbeatEvent;
