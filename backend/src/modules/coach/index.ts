import type { RequestHandler } from 'express';
import type { Database } from '../../database/transaction.js';
import type { RouteGroup } from '../../shared/http/route.js';
import { GeminiClient } from './infrastructure/gemini-client.js';
import { ChatWithCoachUseCase } from './application/use-cases/chat-with-coach.js';
import { GetCoachInsightsUseCase } from './application/use-cases/get-coach-insights.js';
import { ManageConversationsUseCase } from './application/use-cases/manage-conversations.js';
import { ManageMemoriesUseCase } from './application/use-cases/manage-memories.js';
import { GeminiAiService, type GeminiAiConfig } from './infrastructure/gemini-ai-service.js';
import { PgUserContextRepository } from './infrastructure/pg-user-context-repository.js';
import { PgConversationRepository } from './infrastructure/pg-conversation-repository.js';
import { PgMemoryRepository } from './infrastructure/pg-memory-repository.js';
import { createCoachController, type CoachController } from './interface/coach.controller.js';
import { createCoachRoutes } from './interface/coach.routes.js';

export * from './domain/coach.types.js';
export * from './domain/coach-history.types.js';
export * from './domain/coach-memory.types.js';
export * from './application/ports.js';
export * from './application/use-cases/chat-with-coach.js';
export * from './application/use-cases/get-coach-insights.js';
export * from './application/use-cases/manage-conversations.js';
export * from './application/use-cases/manage-memories.js';
export * from './infrastructure/gemini-client.js';
export * from './infrastructure/gemini-coach-chat-service.js';
export * from './infrastructure/gemini-coach-insights-service.js';
export * from './infrastructure/gemini-ai-service.js';
export * from './infrastructure/pg-user-context-repository.js';
export * from './infrastructure/pg-conversation-repository.js';
export * from './infrastructure/pg-memory-repository.js';
export * from './interface/coach.schemas.js';
export * from './interface/coach.controller.js';
export * from './interface/coach.routes.js';

export interface CoachModule {
  routes: RouteGroup;
  userContextRepo: PgUserContextRepository;
  conversationRepo: PgConversationRepository;
  memoryRepo: PgMemoryRepository;
  geminiClient: GeminiClient;
  geminiService: GeminiAiService;
  useCase: ChatWithCoachUseCase;
  insightsUseCase: GetCoachInsightsUseCase;
  manageConversations: ManageConversationsUseCase;
  manageMemories: ManageMemoriesUseCase;
  controller: CoachController;
}

export interface CreateCoachModuleOptions {
  basePath: string;
  db: Database;
  geminiConfig: GeminiAiConfig;
  rateLimiter?: RequestHandler;
}

export function createCoachModule(options: CreateCoachModuleOptions): CoachModule {
  const userContextRepo = new PgUserContextRepository(options.db);
  const conversationRepo = new PgConversationRepository(options.db);
  const memoryRepo = new PgMemoryRepository(options.db);
  const geminiService = new GeminiAiService(options.geminiConfig);

  const useCase = new ChatWithCoachUseCase(
    userContextRepo,
    geminiService,
    conversationRepo,
    memoryRepo,
  );
  const insightsUseCase = new GetCoachInsightsUseCase(userContextRepo, geminiService);
  const manageConversations = new ManageConversationsUseCase(conversationRepo);
  const manageMemories = new ManageMemoriesUseCase(memoryRepo);

  const controller = createCoachController({
    chatWithCoach: useCase,
    getCoachInsights: insightsUseCase,
    manageConversations,
    manageMemories,
  });
  const routes = createCoachRoutes(options.basePath, controller, options.rateLimiter);

  return {
    routes,
    userContextRepo,
    conversationRepo,
    memoryRepo,
    geminiClient: geminiService.client,
    geminiService,
    useCase,
    insightsUseCase,
    manageConversations,
    manageMemories,
    controller,
  };
}
