import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type {
  CoachResponse,
  CoachMessage,
  Block,
  ConversationSummary,
  ConversationDetail,
} from '../src/features/ai-coach/types/coach';
import type {
  SendCoachMessageParams,
  MemoryListApiResponse,
} from '../src/features/ai-coach/services/coach-api';

describe('AI Coach Chat Mobile Contracts & Integration', () => {
  it('validates SendCoachMessageParams structure with conversationId and clientMessageId', () => {
    const params: SendCoachMessageParams = {
      message: 'Can I eat biryani tonight?',
      timezone: 'Asia/Kolkata',
      conversationId: '123e4567-e89b-12d3-a456-426614174000',
      clientMessageId: 'msg-client-1',
      history: [
        { role: 'user', text: 'Hello' },
        { role: 'assistant', text: 'Hello! How can I help you today?' },
      ],
    };

    assert.equal(params.message, 'Can I eat biryani tonight?');
    assert.equal(params.timezone, 'Asia/Kolkata');
    assert.equal(params.conversationId, '123e4567-e89b-12d3-a456-426614174000');
    assert.equal(params.clientMessageId, 'msg-client-1');
    assert.equal(params.history?.length, 2);
    assert.equal(params.history?.[0]?.role, 'user');
  });

  it('validates CoachResponse conforms to Magic Patterns block rendering contract and returns conversationId', () => {
    const mockResponse: CoachResponse = {
      text: 'Great workout today! You burned 350 kcal.',
      conversationId: '123e4567-e89b-12d3-a456-426614174000',
      blocks: [
        {
          type: 'metrics',
          title: "Today's stats",
          items: [
            {
              label: 'Calories',
              value: '350',
              unit: 'kcal',
              source: { kind: 'synced', label: 'Workout Session' },
            },
          ],
        },
      ],
      followUps: ['What should I eat post-workout?', 'Show my weekly volume'],
      sources: ['FitOnus Workouts', 'AI Memory'],
      medicalNote: false,
    };

    assert.ok(mockResponse.text);
    assert.equal(mockResponse.conversationId, '123e4567-e89b-12d3-a456-426614174000');
    assert.equal(mockResponse.blocks?.length, 1);
    assert.equal(mockResponse.blocks?.[0]?.type, 'metrics');
    assert.equal(mockResponse.followUps?.length, 2);
    assert.equal(mockResponse.sources?.[0], 'FitOnus Workouts');
  });

  it('validates CoachMessage handles thinking, done, and error states', () => {
    const thinkingMsg: CoachMessage = {
      id: 'msg-1',
      role: 'assistant',
      status: 'thinking',
    };
    assert.equal(thinkingMsg.status, 'thinking');

    const doneMsg: CoachMessage = {
      id: 'msg-2',
      role: 'assistant',
      status: 'done',
      text: 'You have 800 kcal left today.',
      followUps: ['What can I eat?'],
    };
    assert.equal(doneMsg.status, 'done');
    assert.equal(doneMsg.text, 'You have 800 kcal left today.');

    const errorMsg: CoachMessage = {
      id: 'msg-3',
      role: 'assistant',
      status: 'error',
      text: 'The AI coach is currently busy due to high traffic. Please wait a moment and try again.',
    };
    assert.equal(errorMsg.status, 'error');
    assert.ok(errorMsg.text?.includes('busy'));
  });

  it('validates action block structure adheres to user-confirmation safeguards', () => {
    const actionBlock: Block = {
      type: 'action',
      id: 'act-1',
      title: 'Log Workout',
      summary: [{ label: 'Chest Press', value: '3 sets' }],
      payload: {
        kind: 'logWorkout',
        exercise: 'Bench Press',
        sets: [{ weight: 60, reps: 10 }],
      },
      status: 'pending',
    };

    assert.equal(actionBlock.type, 'action');
    assert.equal(actionBlock.status, 'pending');
    assert.equal(actionBlock.payload.kind, 'logWorkout');
  });

  it('validates ConversationSummary and ConversationDetail contracts', () => {
    const summary: ConversationSummary = {
      id: 'convo-1',
      title: 'Leg day advice',
      preview: 'Ensure adequate warm-up before squats',
      createdAt: '2026-11-09T00:00:00.000Z',
      updatedAt: '2026-11-09T00:05:00.000Z',
    };

    assert.equal(summary.id, 'convo-1');
    assert.equal(summary.title, 'Leg day advice');

    const detail: ConversationDetail = {
      ...summary,
      messages: [
        {
          id: 'msg-1',
          conversationId: 'convo-1',
          role: 'user',
          text: 'What should I do for warm-up?',
          createdAt: '2026-11-09T00:00:00.000Z',
        },
        {
          id: 'msg-2',
          conversationId: 'convo-1',
          role: 'assistant',
          text: '5 minutes cycling plus dynamic hip openers.',
          createdAt: '2026-11-09T00:01:00.000Z',
        },
      ],
    };

    assert.equal(detail.messages.length, 2);
    assert.equal(detail.messages[0]?.role, 'user');
    assert.equal(detail.messages[1]?.role, 'assistant');
  });

  it('validates MemoryListApiResponse contract', () => {
    const memoryResponse: MemoryListApiResponse = {
      enabled: true,
      items: [
        {
          id: 'mem-1',
          category: 'food',
          text: 'Eggetarian — eats eggs and dairy',
          source: 'Onboarding',
          savedOn: 'Nov 8',
          sensitive: false,
        },
      ],
      suggestions: [
        {
          id: 'sug-1',
          category: 'workout',
          text: 'Prefers barbell compounds',
          from: 'Chat · Today',
          sensitive: false,
        },
      ],
    };

    assert.equal(memoryResponse.enabled, true);
    assert.equal(memoryResponse.items.length, 1);
    assert.equal(memoryResponse.suggestions.length, 1);
    assert.equal(memoryResponse.items[0]?.category, 'food');
  });
});
