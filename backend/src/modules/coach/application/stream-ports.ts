import type { CoachStreamEvent } from '../domain/coach-stream.types.js';
import type {
  ChatMessageTurn,
  KnowledgeContextPayloadItem,
  UserFitnessContext,
} from '../domain/coach.types.js';

export interface CoachChatStreamRequest {
  readonly requestId: string;
  readonly userId: string;
  readonly message: string;
  readonly history: readonly ChatMessageTurn[];
  readonly context: UserFitnessContext;
  readonly memories?: readonly string[] | undefined;
  readonly knowledge?: readonly KnowledgeContextPayloadItem[] | undefined;
  readonly conversationId?: string | undefined;
  readonly clientMessageId?: string | undefined;
  readonly idempotencyKey?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface CoachChatStreamService {
  streamReply(
    request: CoachChatStreamRequest,
    onEvent: (event: CoachStreamEvent) => Promise<void>,
  ): Promise<void>;
}
