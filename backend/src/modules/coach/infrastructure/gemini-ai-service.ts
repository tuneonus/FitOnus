import type {
  CoachChatService,
  CoachInsightsService,
  GeminiService,
} from '../application/ports.js';
import type {
  ChatMessageTurn,
  CoachResponse,
  CoachInsightsResponse,
  UserFitnessContext,
} from '../domain/coach.types.js';
import { GeminiClient, type GeminiClientConfig } from '../../../shared/ai/gemini-client.js';
import { GeminiCoachInsightsService } from './gemini-coach-insights-service.js';

export type GeminiAiConfig = GeminiClientConfig;

export interface GeminiAiServiceOptions {
  /** Who generates coach chat replies: the Python AI backend (`PythonCoachChatService`). */
  chatService: CoachChatService;
}

/**
 * Composite AI Service implementing the full GeminiService port.
 * Delegates cleanly to feature-isolated sub-services while sharing a unified Gemini client.
 */
export class GeminiAiService implements GeminiService {
  public readonly client: GeminiClient;
  public readonly chatService: CoachChatService;
  public readonly insightsService: CoachInsightsService;

  constructor(config: GeminiAiConfig, options: GeminiAiServiceOptions) {
    this.client = new GeminiClient(config);
    this.chatService = options.chatService;
    this.insightsService = new GeminiCoachInsightsService(this.client);
  }

  generateCoachResponse(
    message: string,
    context: UserFitnessContext,
    history?: ChatMessageTurn[],
    memories?: string[],
  ): Promise<CoachResponse> {
    return this.chatService.generateCoachResponse(message, context, history, memories);
  }

  generateInsights(
    context: UserFitnessContext,
    lang?: string,
  ): Promise<CoachInsightsResponse> {
    return this.insightsService.generateInsights(context, lang);
  }
}
