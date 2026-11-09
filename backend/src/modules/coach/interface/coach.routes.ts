import type { RequestHandler } from 'express';
import { z } from 'zod';
import { defineRoute, type RouteGroup } from '../../../shared/http/route.js';
import type { CoachController } from './coach.controller.js';
import {
  chatRequestSchema,
  coachInsightsResponseSchema,
  coachResponseSchema,
  conversationDetailSchema,
  conversationSummarySchema,
  createConversationSchema,
  createMemoryRequestSchema,
  getInsightsQuerySchema,
  listConversationsQuerySchema,
  listConversationsResponseSchema,
  memoryItemSchema,
  memoryListResponseSchema,
  renameConversationSchema,
  setMemorySettingsSchema,
  updateMemoryRequestSchema,
} from './coach.schemas.js';

export function createCoachRoutes(
  basePath: string,
  controller: CoachController,
  rateLimiter?: RequestHandler,
): RouteGroup {
  const authMiddleware = rateLimiter ? [rateLimiter] : [];

  return {
    basePath,
    routes: [
      // 1. Coach Chat
      defineRoute({
        method: 'post',
        path: '/chat',
        summary: 'Send message to personal AI fitness coach',
        description: 'Receives user inquiry, retrieves personal fitness context, and generates grounded guidance.',
        tags: ['Coach'],
        access: { kind: 'authenticated' },
        middleware: authMiddleware,
        request: { body: chatRequestSchema },
        response: {
          status: 200,
          description: 'Grounded AI coach response',
          message: 'Coach response generated successfully',
          schema: coachResponseSchema,
        },
        handler: (req) => controller.chat(req),
      }),

      // 2. Coach Insights
      defineRoute({
        method: 'get',
        path: '/insights',
        summary: 'Get real-time personalized AI fitness insights',
        description: 'Analyzes user workout, nutrition, hydration and goal trends with per-user caching.',
        tags: ['Coach'],
        access: { kind: 'authenticated' },
        middleware: authMiddleware,
        request: { query: getInsightsQuerySchema },
        response: {
          status: 200,
          description: 'Personalized AI fitness insights',
          message: 'Personalized coach insights generated successfully',
          schema: coachInsightsResponseSchema,
        },
        handler: (req) => controller.getInsights(req),
      }),

      // 3. List Conversations
      defineRoute({
        method: 'get',
        path: '/conversations',
        summary: 'List user coach conversations',
        description: 'Returns paginated previous conversations for the authenticated user.',
        tags: ['Coach'],
        access: { kind: 'authenticated' },
        request: { query: listConversationsQuerySchema },
        response: {
          status: 200,
          description: 'User conversations list',
          message: 'Conversations retrieved successfully',
          schema: listConversationsResponseSchema,
        },
        handler: (req) => controller.listConversations(req),
      }),

      // 4. Create Conversation
      defineRoute({
        method: 'post',
        path: '/conversations',
        summary: 'Create a new conversation session',
        description: 'Starts a new conversation thread for the authenticated user.',
        tags: ['Coach'],
        access: { kind: 'authenticated' },
        request: { body: createConversationSchema },
        response: {
          status: 201,
          description: 'Created conversation summary',
          message: 'Conversation created successfully',
          schema: conversationSummarySchema,
        },
        handler: (req) => controller.createConversation(req),
      }),

      // 5. Get Conversation Detail with Messages
      defineRoute({
        method: 'get',
        path: '/conversations/:id',
        summary: 'Get a conversation and its messages',
        description: 'Returns full conversation history including user messages and AI blocks.',
        tags: ['Coach'],
        access: { kind: 'authenticated' },
        request: { params: z.object({ id: z.string().uuid() }) },
        response: {
          status: 200,
          description: 'Conversation detail with messages',
          message: 'Conversation retrieved successfully',
          schema: conversationDetailSchema,
        },
        handler: (req) => controller.getConversation(req),
      }),

      // 6. Rename Conversation
      defineRoute({
        method: 'patch',
        path: '/conversations/:id',
        summary: 'Rename a conversation',
        description: 'Updates the title of an existing conversation thread.',
        tags: ['Coach'],
        access: { kind: 'authenticated' },
        request: {
          params: z.object({ id: z.string().uuid() }),
          body: renameConversationSchema,
        },
        response: {
          status: 200,
          description: 'Updated conversation summary',
          message: 'Conversation renamed successfully',
          schema: conversationSummarySchema,
        },
        handler: (req) => controller.renameConversation(req),
      }),

      // 7. Delete Conversation
      defineRoute({
        method: 'delete',
        path: '/conversations/:id',
        summary: 'Delete a conversation',
        description: 'Permanently removes a conversation thread and all its messages.',
        tags: ['Coach'],
        access: { kind: 'authenticated' },
        request: { params: z.object({ id: z.string().uuid() }) },
        response: {
          status: 200,
          description: 'Deletion confirmation',
          message: 'Conversation deleted successfully',
          schema: z.object({ success: z.boolean() }),
        },
        handler: (req) => controller.deleteConversation(req),
      }),

      // 8. List Memories & Suggestions
      defineRoute({
        method: 'get',
        path: '/memory',
        summary: 'List user AI memories and suggestions',
        description: 'Returns approved memories and pending suggestions with memory enabled status.',
        tags: ['Coach'],
        access: { kind: 'authenticated' },
        response: {
          status: 200,
          description: 'Memories and suggestions',
          message: 'Memories retrieved successfully',
          schema: memoryListResponseSchema,
        },
        handler: (req) => controller.listMemories(req),
      }),

      // 9. Create Memory
      defineRoute({
        method: 'post',
        path: '/memory',
        summary: 'Add an AI memory',
        description: 'Stores a user-approved fitness memory or preference.',
        tags: ['Coach'],
        access: { kind: 'authenticated' },
        request: { body: createMemoryRequestSchema },
        response: {
          status: 201,
          description: 'Created memory item',
          message: 'Memory created successfully',
          schema: memoryItemSchema,
        },
        handler: (req) => controller.createMemory(req),
      }),

      // 10. Update Memory Settings (toggle enabled)
      defineRoute({
        method: 'patch',
        path: '/memory/settings',
        summary: 'Toggle AI memory enabled status',
        description: 'Enables or pauses AI memory reading and saving across conversations.',
        tags: ['Coach'],
        access: { kind: 'authenticated' },
        request: { body: setMemorySettingsSchema },
        response: {
          status: 200,
          description: 'Updated memory settings',
          message: 'Memory settings updated successfully',
          schema: z.object({ enabled: z.boolean() }),
        },
        handler: (req) => controller.setMemorySettings(req),
      }),

      // 11. Update Memory
      defineRoute({
        method: 'patch',
        path: '/memory/:id',
        summary: 'Edit memory text',
        description: 'Updates the text of an existing approved memory.',
        tags: ['Coach'],
        access: { kind: 'authenticated' },
        request: {
          params: z.object({ id: z.string().uuid() }),
          body: updateMemoryRequestSchema,
        },
        response: {
          status: 200,
          description: 'Updated memory item',
          message: 'Memory updated successfully',
          schema: memoryItemSchema,
        },
        handler: (req) => controller.updateMemory(req),
      }),

      // 12. Delete Memory
      defineRoute({
        method: 'delete',
        path: '/memory/:id',
        summary: 'Delete a single memory item',
        description: 'Permanently removes a memory item for the authenticated user.',
        tags: ['Coach'],
        access: { kind: 'authenticated' },
        request: { params: z.object({ id: z.string().uuid() }) },
        response: {
          status: 200,
          description: 'Deletion confirmation',
          message: 'Memory deleted successfully',
          schema: z.object({ success: z.boolean() }),
        },
        handler: (req) => controller.deleteMemory(req),
      }),

      // 13. Approve Suggestion
      defineRoute({
        method: 'post',
        path: '/memory/:id/approve',
        summary: 'Approve a pending memory suggestion',
        description: 'Marks a pending suggestion as active in user memory.',
        tags: ['Coach'],
        access: { kind: 'authenticated' },
        request: { params: z.object({ id: z.string().uuid() }) },
        response: {
          status: 200,
          description: 'Approved memory item',
          message: 'Memory suggestion approved',
          schema: memoryItemSchema,
        },
        handler: (req) => controller.approveMemorySuggestion(req),
      }),

      // 14. Dismiss Suggestion
      defineRoute({
        method: 'post',
        path: '/memory/:id/dismiss',
        summary: 'Dismiss a pending memory suggestion',
        description: 'Discards a memory suggestion without saving it.',
        tags: ['Coach'],
        access: { kind: 'authenticated' },
        request: { params: z.object({ id: z.string().uuid() }) },
        response: {
          status: 200,
          description: 'Dismissal confirmation',
          message: 'Memory suggestion dismissed',
          schema: z.object({ success: z.boolean() }),
        },
        handler: (req) => controller.dismissMemorySuggestion(req),
      }),

      // 15. Clear All Memories
      defineRoute({
        method: 'delete',
        path: '/memory',
        summary: 'Clear all AI memories',
        description: 'Permanently removes all saved memories and suggestions for the user.',
        tags: ['Coach'],
        access: { kind: 'authenticated' },
        response: {
          status: 200,
          description: 'Clear all confirmation',
          message: 'All memories cleared successfully',
          schema: z.object({ success: z.boolean() }),
        },
        handler: (req) => controller.clearAllMemories(req),
      }),
    ],
  };
}
