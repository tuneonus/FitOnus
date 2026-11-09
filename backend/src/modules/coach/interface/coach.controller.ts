import type { Request } from 'express';
import { requireActor } from '../../../middleware/authenticate.js';
import { getValidated } from '../../../middleware/validate.js';
import type { RouteResult } from '../../../shared/http/route.js';
import { AppError } from '../../../shared/errors/app-error.js';
import type { ChatWithCoachUseCase } from '../application/use-cases/chat-with-coach.js';
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
  setMemorySettingsSchema,
  updateMemoryRequestSchema,
  type CoachInsightsResponseDto,
  type CoachResponseDto,
} from './coach.schemas.js';
import type {
  ConversationDetail,
  ConversationSummary,
} from '../domain/coach-history.types.js';
import type {
  MemoryItem,
  MemoryListResponse,
} from '../domain/coach-memory.types.js';

export interface CoachController {
  chat(req: Request): Promise<RouteResult<CoachResponseDto>>;
  getInsights(req: Request): Promise<RouteResult<CoachInsightsResponseDto>>;
  listConversations(req: Request): Promise<RouteResult<{ conversations: ConversationSummary[]; total: number; page: number; limit: number }>>;
  createConversation(req: Request): Promise<RouteResult<ConversationSummary>>;
  getConversation(req: Request): Promise<RouteResult<ConversationDetail>>;
  renameConversation(req: Request): Promise<RouteResult<ConversationSummary>>;
  deleteConversation(req: Request): Promise<RouteResult<{ success: boolean }>>;
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
  getCoachInsights: GetCoachInsightsUseCase;
  manageConversations?: ManageConversationsUseCase;
  manageMemories?: ManageMemoriesUseCase;
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
