import { z } from 'zod';
import {
  isSupportedAudioMime,
  MAX_AUDIO_BASE64_CHARS,
  SUPPORTED_AUDIO_FORMATS,
} from '../../../shared/ai/audio-input.js';

export const chatRequestSchema = z.object({
  message: z.string().trim().min(1, 'Message is required').max(1000, 'Message cannot exceed 1000 characters'),
  timezone: z.string().max(100).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        text: z.string().max(1000),
      }),
    )
    .max(10)
    .optional(),
  conversationId: z.string().uuid().optional(),
  clientMessageId: z.string().max(100).optional(),
});

export const coachResponseSchema = z.object({
  text: z.string(),
  blocks: z.array(z.record(z.string(), z.any())).optional(),
  followUps: z.array(z.string()).optional(),
  sources: z.array(z.string()).optional(),
  toolCalls: z.array(z.string()).optional(),
  medicalNote: z.boolean().optional(),
  memoryUsed: z.string().optional(),
  conversationId: z.string().optional(),
});

export const getInsightsQuerySchema = z.object({
  timezone: z.string().max(100).optional(),
  lang: z.enum(['en', 'ta', 'tanglish']).optional(),
  refresh: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const coachInsightItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.enum(['workout', 'nutrition', 'hydration', 'goal', 'recovery']),
  priority: z.enum(['high', 'medium', 'low']),
  severity: z.enum(['positive', 'watch', 'info']),
  action: z.string(),
  question: z.string(),
  evidence: z.array(z.string()),
  confidence: z.enum(['high', 'medium', 'low']),
  requiresDevice: z.boolean(),
});

export const coachInsightsResponseSchema = z.object({
  greeting: z.string(),
  recommendation: z.string().nullable(),
  insights: z.array(coachInsightItemSchema),
  generatedAt: z.string(),
  hasSufficientData: z.boolean(),
});

// Conversation History Schemas
export const listConversationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const conversationSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  preview: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const listConversationsResponseSchema = z.object({
  conversations: z.array(conversationSummarySchema),
  total: z.number(),
  page: z.number(),
  limit: z.number(),
});

export const storedChatMessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  role: z.enum(['user', 'assistant', 'system']),
  text: z.string(),
  blocks: z.array(z.record(z.string(), z.any())).optional(),
  sources: z.array(z.string()).optional(),
  followUps: z.array(z.string()).optional(),
  feedback: z.enum(['like', 'dislike', 'none']).nullable().optional(),
  createdAt: z.string(),
});

export const conversationDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  preview: z.string(),
  messages: z.array(storedChatMessageSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createConversationSchema = z.object({
  title: z.string().max(100).optional(),
});

export const renameConversationSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(100),
});

// Memory Schemas
export const memoryCategorySchema = z.enum([
  'goals',
  'injuries',
  'food',
  'workout',
  'medical',
  'supplements',
  'progress',
  'conversations',
]);

export const memoryStatusSchema = z.enum([
  'active',
  'pending_approval',
  'dismissed',
  'archived',
  'superseded',
]);

export const memoryItemSchema = z.object({
  id: z.string(),
  category: memoryCategorySchema,
  text: z.string(),
  source: z.string(),
  sensitive: z.boolean(),
  status: memoryStatusSchema,
  confidence: z.number().optional(),
  sourceMessageId: z.string().nullable().optional(),
  sourceConversationId: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  supersededById: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const memoryListResponseSchema = z.object({
  enabled: z.boolean(),
  items: z.array(memoryItemSchema),
  suggestions: z.array(memoryItemSchema),
});

export const createMemoryRequestSchema = z.object({
  category: memoryCategorySchema,
  text: z.string().trim().min(1, 'Text is required').max(1000),
  source: z.string().max(100).optional(),
  sensitive: z.boolean().optional(),
  status: memoryStatusSchema.optional(),
});

export const updateMemoryRequestSchema = z.object({
  text: z.string().trim().min(1, 'Text is required').max(1000),
});

export const setMemorySettingsSchema = z.object({
  enabled: z.boolean(),
});

export const setMessageFeedbackSchema = z.object({
  feedback: z.enum(['like', 'dislike', 'none']),
});

export const transcribeAudioSchema = z.object({
  audio: z.object({
    mimeType: z
      .string()
      .min(1, 'Audio mimeType is required')
      .max(100)
      .refine(
        isSupportedAudioMime,
        `Unsupported audio format. Supported formats: ${SUPPORTED_AUDIO_FORMATS.join(', ')}`,
      ),
    base64: z
      .string()
      .min(1, 'Audio base64 data is required')
      .max(MAX_AUDIO_BASE64_CHARS, 'Audio size exceeds the 15MB limit.'),
  }),
});

export const transcribeResponseSchema = z.object({
  transcript: z.string(),
  detectedLanguage: z.string(),
});

export type ChatRequestDto = z.infer<typeof chatRequestSchema>;
export type CoachResponseDto = z.infer<typeof coachResponseSchema>;
export type GetInsightsQueryDto = z.infer<typeof getInsightsQuerySchema>;
export type CoachInsightsResponseDto = z.infer<typeof coachInsightsResponseSchema>;
export type SetMessageFeedbackDto = z.infer<typeof setMessageFeedbackSchema>;
export type TranscribeAudioDto = z.infer<typeof transcribeAudioSchema>;
export type TranscribeResponseDto = z.infer<typeof transcribeResponseSchema>;
