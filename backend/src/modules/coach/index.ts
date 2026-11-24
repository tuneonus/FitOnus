import type { RequestHandler } from 'express';
import type { Database } from '../../database/transaction.js';
import type { AiUsageGate } from '../../shared/ai/ai-usage.js';
import type { RouteGroup } from '../../shared/http/route.js';
import type { Logger } from '../../shared/logging/logger.js';
import type { IExerciseRepository, IPersonalRecordRepository, IWorkoutSessionRepository } from '../workouts/index.js';
import type { IMealRepository, IUserProfileTargetPort, IWaterRepository } from '../nutrition/index.js';
import type { IWeightRepository } from '../progress/index.js';
import type { KnowledgeService } from '../knowledge/index.js';
import type { ProfileWithIdentity } from '../profile/index.js';
import type {
  CoachChatService,
  CoachInsightsService,
  GeminiService,
  MemoryExtractor,
  SpeechTranscriber,
} from './application/ports.js';
import { ChatWithCoachUseCase } from './application/use-cases/chat-with-coach.js';
import { GetCoachInsightsUseCase } from './application/use-cases/get-coach-insights.js';
import { ManageConversationsUseCase } from './application/use-cases/manage-conversations.js';
import { ManageMemoriesUseCase } from './application/use-cases/manage-memories.js';
import { MemoryExtractionWorker } from './application/services/memory-extraction-worker.js';
import { PgUserContextRepository } from './infrastructure/pg-user-context-repository.js';
import { PgConversationRepository } from './infrastructure/pg-conversation-repository.js';
import { PgMemoryRepository } from './infrastructure/pg-memory-repository.js';
import { PgMemoryExtractionJobQueue } from './infrastructure/pg-memory-job-queue.js';
import { createCoachController, type CoachController } from './interface/coach.controller.js';
import { createCoachRoutes } from './interface/coach.routes.js';
import { createInternalToolsController, type InternalToolsController } from './interface/internal-tools.controller.js';
import { createInternalToolsRoutes } from './interface/internal-tools.routes.js';

export * from './domain/coach.types.js';
export * from './domain/coach-history.types.js';
export * from './domain/coach-memory.types.js';
export * from './domain/history-budget.js';
export * from './domain/extraction-job.types.js';
export * from './domain/intent-router.js';
export * from './domain/context-deduplicator.js';
export * from './domain/context-budget.js';
export * from './application/services/context-assembler.js';
export * from './application/ports.js';
export * from './application/use-cases/chat-with-coach.js';
export * from './application/use-cases/get-coach-insights.js';
export * from './application/use-cases/manage-conversations.js';
export * from './application/use-cases/manage-memories.js';
export * from './application/services/memory-extraction-worker.js';
export * from './domain/coach-insights.js';
export * from './infrastructure/python-coach-insights-service.js';
export * from './infrastructure/python-coach-chat-service.js';
export * from './infrastructure/python-memory-extractor.js';
export * from './infrastructure/python-speech-transcriber.js';
export * from './infrastructure/pg-user-context-repository.js';
export * from './infrastructure/pg-conversation-repository.js';
export * from './infrastructure/pg-memory-repository.js';
export * from './infrastructure/pg-memory-job-queue.js';
export * from './interface/coach.schemas.js';
export * from './interface/coach.controller.js';
export * from './interface/coach.routes.js';
export * from './interface/internal-tools.schemas.js';
export * from './interface/internal-tools.controller.js';
export * from './interface/internal-tools.routes.js';

export interface CoachModule {
  routes: RouteGroup;
  internalToolsRoutes?: RouteGroup;
  userContextRepo: PgUserContextRepository;
  conversationRepo: PgConversationRepository;
  memoryRepo: PgMemoryRepository;
  memoryJobQueue?: PgMemoryExtractionJobQueue;
  memoryWorker?: MemoryExtractionWorker;
  /** Chat and insights generation behind one port (both served by the Python AI backend). */
  aiService: GeminiService;
  useCase: ChatWithCoachUseCase;
  insightsUseCase: GetCoachInsightsUseCase;
  manageConversations: ManageConversationsUseCase;
  manageMemories: ManageMemoriesUseCase;
  controller: CoachController;
  internalToolsController?: InternalToolsController;
}

export interface CreateCoachModuleOptions {
  basePath: string;
  internalToolsBasePath?: string;
  serviceSecret?: string;
  db: Database;
  /** Coach chat text generation (the Python AI backend, `PythonCoachChatService`). */
  chatService: CoachChatService;
  /** Coach insights generation (the Python AI backend, `PythonCoachInsightsService`). */
  insightsService: CoachInsightsService;
  /** Speech transcription for `POST /coach/transcribe` (the Python AI backend). */
  speechTranscriber: SpeechTranscriber;
  /** Optional memory extractor for background extraction pipeline */
  extractor?: MemoryExtractor;
  /** Required: chat and insights must never reach Gemini without the feature flag / quota gate. */
  aiUsageGate: AiUsageGate;
  rateLimiter?: RequestHandler;
  /** Observability only (cache events for coach insights and RAG fallback warnings). */
  logger?: Pick<Logger, 'info' | 'warn'>;
  sessionRepo?: IWorkoutSessionRepository;
  personalRecordRepo?: IPersonalRecordRepository;
  exerciseRepo?: IExerciseRepository;
  mealRepo?: IMealRepository;
  waterRepo?: IWaterRepository;
  targetAdapter?: IUserProfileTargetPort;
  weightRepo?: IWeightRepository;
  /** Optional knowledge service for RAG grounding */
  knowledgeService?: KnowledgeService;
  profileRepo?: {
    ensureProfile(userId: string): Promise<ProfileWithIdentity>;
  };
}

export function createCoachModule(options: CreateCoachModuleOptions): CoachModule {
  const userContextRepo = new PgUserContextRepository(options.db);
  const conversationRepo = new PgConversationRepository(options.db);
  const memoryRepo = new PgMemoryRepository(options.db);
  const memoryJobQueue = new PgMemoryExtractionJobQueue(options.db);
  const aiService: GeminiService = {
    generateCoachResponse: (message, context, history, memories, knowledge) =>
      options.chatService.generateCoachResponse(message, context, history, memories, knowledge),
    generateInsights: (context, lang) => options.insightsService.generateInsights(context, lang),
  };

  const memoryWorker = options.extractor
    ? new MemoryExtractionWorker({
        queue: memoryJobQueue,
        memoryRepo,
        conversationRepo,
        extractor: options.extractor,
        ...(options.logger ? { logger: options.logger } : {}),
      })
    : undefined;

  const useCase = new ChatWithCoachUseCase(
    userContextRepo,
    aiService,
    options.aiUsageGate,
    conversationRepo,
    memoryRepo,
    options.knowledgeService,
    options.logger,
    memoryJobQueue,
    () => memoryWorker?.kick(),
  );
  const insightsUseCase = new GetCoachInsightsUseCase(userContextRepo, aiService, options.aiUsageGate, options.logger);
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

  let internalToolsRoutes: RouteGroup | undefined;
  let internalToolsController: InternalToolsController | undefined;

  if (
    options.internalToolsBasePath &&
    options.serviceSecret &&
    options.sessionRepo &&
    options.personalRecordRepo &&
    options.exerciseRepo &&
    options.mealRepo &&
    options.waterRepo &&
    options.targetAdapter &&
    options.weightRepo
  ) {
    internalToolsController = createInternalToolsController({
      sessionRepo: options.sessionRepo,
      personalRecordRepo: options.personalRecordRepo,
      exerciseRepo: options.exerciseRepo,
      mealRepo: options.mealRepo,
      waterRepo: options.waterRepo,
      targetAdapter: options.targetAdapter,
      weightRepo: options.weightRepo,
      ...(options.knowledgeService ? { knowledgeService: options.knowledgeService } : {}),
      ...(options.profileRepo ? { profileRepo: options.profileRepo } : {}),
    });
    internalToolsRoutes = createInternalToolsRoutes(
      options.internalToolsBasePath,
      internalToolsController,
      { serviceSecret: options.serviceSecret, limiter: options.rateLimiter },
    );
  }

  return {
    routes,
    internalToolsRoutes,
    userContextRepo,
    conversationRepo,
    memoryRepo,
    memoryJobQueue,
    memoryWorker,
    aiService,
    useCase,
    insightsUseCase,
    manageConversations,
    manageMemories,
    controller,
    internalToolsController,
  };
}
