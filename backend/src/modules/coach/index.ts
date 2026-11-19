import type { RequestHandler } from 'express';
import type { Database } from '../../database/transaction.js';
import type { AiUsageGate } from '../../shared/ai/ai-usage.js';
import type { RouteGroup } from '../../shared/http/route.js';
import type { CoachChatService, CoachInsightsService, GeminiService, SpeechTranscriber } from './application/ports.js';
import { ChatWithCoachUseCase } from './application/use-cases/chat-with-coach.js';
import { GetCoachInsightsUseCase } from './application/use-cases/get-coach-insights.js';
import { ManageConversationsUseCase } from './application/use-cases/manage-conversations.js';
import { ManageMemoriesUseCase } from './application/use-cases/manage-memories.js';
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
export * from './domain/coach-insights.js';
export * from './infrastructure/python-coach-insights-service.js';
export * from './infrastructure/python-coach-chat-service.js';
export * from './infrastructure/python-speech-transcriber.js';
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
  /** Chat and insights generation behind one port (both served by the Python AI backend). */
  aiService: GeminiService;
  useCase: ChatWithCoachUseCase;
  insightsUseCase: GetCoachInsightsUseCase;
  manageConversations: ManageConversationsUseCase;
  manageMemories: ManageMemoriesUseCase;
  controller: CoachController;
}

export interface CreateCoachModuleOptions {
  basePath: string;
  db: Database;
  /** Coach chat text generation (the Python AI backend, `PythonCoachChatService`). */
  chatService: CoachChatService;
  /** Coach insights generation (the Python AI backend, `PythonCoachInsightsService`). */
  insightsService: CoachInsightsService;
  /** Speech transcription for `POST /coach/transcribe` (the Python AI backend). */
  speechTranscriber: SpeechTranscriber;
  /** Required: chat and insights must never reach Gemini without the feature flag / quota gate. */
  aiUsageGate: AiUsageGate;
  rateLimiter?: RequestHandler;
}

export function createCoachModule(options: CreateCoachModuleOptions): CoachModule {
  const userContextRepo = new PgUserContextRepository(options.db);
  const conversationRepo = new PgConversationRepository(options.db);
  const memoryRepo = new PgMemoryRepository(options.db);
  const aiService: GeminiService = {
    generateCoachResponse: (message, context, history, memories) =>
      options.chatService.generateCoachResponse(message, context, history, memories),
    generateInsights: (context, lang) => options.insightsService.generateInsights(context, lang),
  };

  const useCase = new ChatWithCoachUseCase(
    userContextRepo,
    aiService,
    options.aiUsageGate,
    conversationRepo,
    memoryRepo,
  );
  const insightsUseCase = new GetCoachInsightsUseCase(userContextRepo, aiService, options.aiUsageGate);
  const manageConversations = new ManageConversationsUseCase(conversationRepo);
  const manageMemories = new ManageMemoriesUseCase(memoryRepo);

  const controller = createCoachController({
    chatWithCoach: useCase,
    getCoachInsights: insightsUseCase,
    manageConversations,
    manageMemories,
    speechTranscriber: options.speechTranscriber,
  });
  const routes = createCoachRoutes(options.basePath, controller, options.rateLimiter);

  return {
    routes,
    userContextRepo,
    conversationRepo,
    memoryRepo,
    aiService,
    useCase,
    insightsUseCase,
    manageConversations,
    manageMemories,
    controller,
  };
}
