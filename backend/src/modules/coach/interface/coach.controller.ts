import type { Request, Response } from 'express';
import { requireActor } from '../../../middleware/authenticate.js';
import { getValidated } from '../../../middleware/validate.js';
import type { RouteResult } from '../../../shared/http/route.js';
import { idempotencyHeadersSchema } from '../../../shared/http/schemas.js';
import { AppError } from '../../../shared/errors/app-error.js';
import type { SpeechTranscriber } from '../application/ports.js';
import type { ChatWithCoachUseCase } from '../application/use-cases/chat-with-coach.js';
import type { StreamCoachChatUseCase } from '../application/use-cases/stream-coach-chat.js';
import { formatSseEvent } from '../domain/coach-stream.types.js';
import type { GetCoachInsightsUseCase } from '../application/use-cases/get-coach-insights.js';
import type { ManageConversationsUseCase } from '../application/use-cases/manage-conversations.js';
import type { ManageMemoriesUseCase } from '../application/use-cases/manage-memories.js';
import {
  chatRequestSchema,
  createConversationSchema,
  createMemoryRequestSchema,
  getInsightsQuerySchema,
  listConversationsQuerySchema,
  renameConversationSchema,
  setMessageFeedbackSchema,
  setMemorySettingsSchema,
  transcribeAudioSchema,
  updateMemoryRequestSchema,
  type CoachInsightsResponseDto,
  type CoachResponseDto,
  type TranscribeResponseDto,
} from './coach.schemas.js';
import type { ConversationDetail, ConversationSummary } from '../domain/coach-history.types.js';
import type { MemoryItem, MemoryListResponse } from '../domain/coach-memory.types.js';

export interface CoachController {
  chat(req: Request): Promise<RouteResult<CoachResponseDto>>;
  streamChat(req: Request, res: Response): Promise<RouteResult<{ streamed: boolean }>>;
  getInsights(req: Request): Promise<RouteResult<CoachInsightsResponseDto>>;
  listConversations(
    req: Request,
  ): Promise<
    RouteResult<{ conversations: ConversationSummary[]; total: number; page: number; limit: number }>
  >;
  createConversation(req: Request): Promise<RouteResult<ConversationSummary>>;
  getConversation(req: Request): Promise<RouteResult<ConversationDetail>>;
  renameConversation(req: Request): Promise<RouteResult<ConversationSummary>>;
  deleteConversation(req: Request): Promise<RouteResult<{ success: boolean }>>;
  setMessageFeedback(req: Request): Promise<RouteResult<{ success: boolean }>>;
  transcribeAudio(req: Request): Promise<RouteResult<TranscribeResponseDto>>;
  listMemories(req: Request): Promise<RouteResult<MemoryListResponse>>;
  createMemory(req: Request): Promise<RouteResult<MemoryItem>>;
  updateMemory(req: Request): Promise<RouteResult<MemoryItem>>;
  deleteMemory(req: Request): Promise<RouteResult<{ success: boolean }>>;
  approveMemorySuggestion(req: Request): Promise<RouteResult<MemoryItem>>;
  dismissMemorySuggestion(req: Request): Promise<RouteResult<{ success: boolean }>>;
  clearAllMemories(req: Request): Promise<RouteResult<{ success: boolean }>>;
  setMemorySettings(req: Request): Promise<RouteResult<{ enabled: boolean }>>;
}

export function createCoachController(deps: {
  chatWithCoach: ChatWithCoachUseCase;
  streamCoachChat?: StreamCoachChatUseCase;
  getCoachInsights: GetCoachInsightsUseCase;
  manageConversations?: ManageConversationsUseCase;
  manageMemories?: ManageMemoriesUseCase;
  speechTranscriber?: SpeechTranscriber;
}): CoachController {
  const getConvoUseCase = () => {
    if (!deps.manageConversations) {
      throw new AppError('unavailable', 'SERVICE_UNAVAILABLE', 'Conversation service is not available.');
    }
    return deps.manageConversations;
  };

  const getMemoryUseCase = () => {
    if (!deps.manageMemories) {
      throw new AppError('unavailable', 'SERVICE_UNAVAILABLE', 'Memory service is not available.');
    }
    return deps.manageMemories;
  };

  return {
    async chat(req: Request): Promise<RouteResult<CoachResponseDto>> {
      const actor = requireActor(req);
      const { body } = getValidated(req, { body: chatRequestSchema });
      const data = await deps.chatWithCoach.execute({
        userId: actor.userId,
        message: body.message,
        timezone: body.timezone,
        history: body.history,
        conversationId: body.conversationId,
        clientMessageId: body.clientMessageId,
      });

      return {
        status: 200,
        message: 'Coach response generated successfully',
        data,
      };
    },

    async streamChat(req: Request, res: Response): Promise<RouteResult<{ streamed: boolean }>> {
      const actor = requireActor(req);
      if (!deps.streamCoachChat) {
        throw new AppError('unprocessable', 'FEATURE_DISABLED', 'Streaming AI Coach is currently disabled.');
      }
      const { body, headers } = getValidated(req, {
        body: chatRequestSchema,
        headers: idempotencyHeadersSchema,
      });

      const abortController = new AbortController();
      const onClose = (): void => {
        if (!res.writableFinished) {
          abortController.abort(new Error('CLIENT_DISCONNECTED'));
        }
      };
      res.on('close', onClose);

      let headersFlushed = false;
      const openSseStream = (): void => {
        if (headersFlushed || res.headersSent) return;
        headersFlushed = true;
        res.status(200);
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();
      };

      const writeChunkWithBackpressure = async (chunk: string): Promise<void> => {
        if (res.writableEnded || res.destroyed || abortController.signal.aborted) return;
        const canContinue = res.write(chunk);
        if (!canContinue) {
          await new Promise<void>((resolve) => {
            const cleanup = (): void => {
              res.off('drain', onDrain);
              res.off('close', onSocketClose);
            };
            const onDrain = (): void => {
              cleanup();
              resolve();
            };
            const onSocketClose = (): void => {
              cleanup();
              resolve();
            };
            res.once('drain', onDrain);
            res.once('close', onSocketClose);
          });
        }
      };

      try {
        await deps.streamCoachChat.execute(
          {
            userId: actor.userId,
            message: body.message,
            timezone: body.timezone,
            history: body.history,
            conversationId: body.conversationId,
            clientMessageId: body.clientMessageId,
            idempotencyKey: headers['idempotency-key'],
            signal: abortController.signal,
          },
          {
            onStreamReady: openSseStream,
            onEvent: async (event) => {
              openSseStream();
              await writeChunkWithBackpressure(formatSseEvent(event));
            },
          },
        );
      } finally {
        res.off('close', onClose);
        if (headersFlushed && !res.writableEnded && !res.destroyed) {
          res.end();
        }
      }

      return {
        status: 200,
        message: 'Coach stream completed',
        data: { streamed: true },
      };
    },

    async getInsights(req: Request): Promise<RouteResult<CoachInsightsResponseDto>> {
      const actor = requireActor(req);
      const { query } = getValidated(req, { query: getInsightsQuerySchema });
      const data = await deps.getCoachInsights.execute({
        userId: actor.userId,
        timezone: query.timezone,
        lang: query.lang,
        forceRefresh: query.refresh,
      });

      return {
        status: 200,
        message: 'Personalized coach insights generated successfully',
        data,
      };
    },

    async listConversations(req: Request) {
      const actor = requireActor(req);
      const { query } = getValidated(req, { query: listConversationsQuerySchema });
      const data = await getConvoUseCase().list(actor.userId, query.page, query.limit);
      return {
        status: 200,
        message: 'Conversations retrieved successfully',
        data,
      };
    },

    async createConversation(req: Request) {
      const actor = requireActor(req);
      const { body } = getValidated(req, { body: createConversationSchema });
      const data = await getConvoUseCase().create(actor.userId, body.title);
      return {
        status: 201,
        message: 'Conversation created successfully',
        data,
      };
    },

    async getConversation(req: Request) {
      const actor = requireActor(req);
      const id = String(req.params.id);
      const data = await getConvoUseCase().get(actor.userId, id);
      return {
        status: 200,
        message: 'Conversation retrieved successfully',
        data,
      };
    },

    async renameConversation(req: Request) {
      const actor = requireActor(req);
      const id = String(req.params.id);
      const { body } = getValidated(req, { body: renameConversationSchema });
      const data = await getConvoUseCase().rename(actor.userId, id, body.title);
      return {
        status: 200,
        message: 'Conversation renamed successfully',
        data,
      };
    },

    async deleteConversation(req: Request) {
      const actor = requireActor(req);
      const id = String(req.params.id);
      await getConvoUseCase().delete(actor.userId, id);
      return {
        status: 200,
        message: 'Conversation deleted successfully',
        data: { success: true },
      };
    },

    async setMessageFeedback(req: Request) {
      const actor = requireActor(req);
      const messageId = String(req.params.messageId || req.params.id);
      const { body } = getValidated(req, { body: setMessageFeedbackSchema });
      await getConvoUseCase().setFeedback(actor.userId, messageId, body.feedback);
      return {
        status: 200,
        message: 'Feedback updated successfully',
        data: { success: true },
      };
    },

    async transcribeAudio(req: Request) {
      const actor = requireActor(req);
      if (!deps.speechTranscriber) {
        throw new AppError('unavailable', 'SERVICE_UNAVAILABLE', 'AI audio transcription is not configured.');
      }
      const { body } = getValidated(req, { body: transcribeAudioSchema });
      const data = await deps.speechTranscriber.transcribe(actor.userId, body.audio);
      return {
        status: 200,
        message: 'Audio transcribed successfully',
        data,
      };
    },

    async listMemories(req: Request) {
      const actor = requireActor(req);
      const data = await getMemoryUseCase().list(actor.userId);
      return {
        status: 200,
        message: 'Memories retrieved successfully',
        data,
      };
    },

    async createMemory(req: Request) {
      const actor = requireActor(req);
      const { body } = getValidated(req, { body: createMemoryRequestSchema });
      const data = await getMemoryUseCase().create(actor.userId, body);
      return {
        status: 201,
        message: 'Memory created successfully',
        data,
      };
    },

    async updateMemory(req: Request) {
      const actor = requireActor(req);
      const id = String(req.params.id);
      const { body } = getValidated(req, { body: updateMemoryRequestSchema });
      const data = await getMemoryUseCase().update(actor.userId, id, body.text);
      return {
        status: 200,
        message: 'Memory updated successfully',
        data,
      };
    },

    async deleteMemory(req: Request) {
      const actor = requireActor(req);
      const id = String(req.params.id);
      await getMemoryUseCase().delete(actor.userId, id);
      return {
        status: 200,
        message: 'Memory deleted successfully',
        data: { success: true },
      };
    },

    async approveMemorySuggestion(req: Request) {
      const actor = requireActor(req);
      const id = String(req.params.id);
      const data = await getMemoryUseCase().approveSuggestion(actor.userId, id);
      return {
        status: 200,
        message: 'Memory suggestion approved',
        data,
      };
    },

    async dismissMemorySuggestion(req: Request) {
      const actor = requireActor(req);
      const id = String(req.params.id);
      await getMemoryUseCase().dismissSuggestion(actor.userId, id);
      return {
        status: 200,
        message: 'Memory suggestion dismissed',
        data: { success: true },
      };
    },

    async clearAllMemories(req: Request) {
      const actor = requireActor(req);
      await getMemoryUseCase().clearAll(actor.userId);
      return {
        status: 200,
        message: 'All memories cleared successfully',
        data: { success: true },
      };
    },

    async setMemorySettings(req: Request) {
      const actor = requireActor(req);
      const { body } = getValidated(req, { body: setMemorySettingsSchema });
      const data = await getMemoryUseCase().setMemoryEnabled(actor.userId, body.enabled);
      return {
        status: 200,
        message: 'Memory settings updated successfully',
        data,
      };
    },
  };
}
