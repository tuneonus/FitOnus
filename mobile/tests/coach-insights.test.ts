import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type {
  CoachInsightItem,
  CoachInsightsResponse,
  InsightCategory,
  InsightPriority,
  InsightSeverity,
} from '../src/features/ai-coach/types/coach';
import type { InsightCardItem } from '../src/features/analytics/components/InsightCard';

describe('AI Coach Insights Mobile Contracts & Integration', () => {
  it('validates CoachInsightItem conforms to structure required by mobile UI', () => {
    const item: CoachInsightItem = {
      id: 'ins-test-1',
      title: 'Chest & Triceps Focus',
      description: 'Scheduled upper body workout. Focus on progressive overload.',
      category: 'workout',
      priority: 'high',
      severity: 'positive',
      action: 'View Workout',
      question: 'What exercises are in this workout?',
      evidence: ['Chest + Triceps scheduled'],
      confidence: 'high',
      requiresDevice: false,
    };

    assert.equal(item.id, 'ins-test-1');
    assert.equal(item.category, 'workout');
    assert.equal(item.priority, 'high');
    assert.equal(item.severity, 'positive');
    assert.equal(item.evidence.length, 1);
    assert.equal(item.requiresDevice, false);
  });

  it('validates CoachInsightsResponse structure for Home and Dashboard', () => {
    const response: CoachInsightsResponse = {
      greeting: 'Good morning Karthik!',
      recommendation: 'Target your protein intake and complete Chest session.',
      insights: [
        {
          id: 'ins-1',
          title: 'Hydration Target',
          description: 'Drink 500ml of water before training.',
          category: 'hydration',
          priority: 'medium',
          severity: 'info',
          action: 'Log Water',
          question: 'How much water should I drink?',
          evidence: ['0 ml logged'],
          confidence: 'high',
          requiresDevice: false,
        },
      ],
      generatedAt: '2026-11-08T03:00:00.000Z',
      hasSufficientData: true,
    };

    assert.equal(response.greeting, 'Good morning Karthik!');
    assert.equal(response.recommendation, 'Target your protein intake and complete Chest session.');
    assert.equal(response.insights.length, 1);
    assert.equal(response.hasSufficientData, true);
  });

  it('validates InsightCardItem polymorphism for Progress Analytics', () => {
    const insightItem: InsightCardItem = {
      id: 'ins-card-1',
      title: 'Workout Consistency',
      description: 'Great job maintaining 4 sessions this week.',
      category: 'workout',
      priority: 'high',
      severity: 'positive',
      action: 'Ask Coach',
      question: 'How do I optimize rest days?',
      evidence: ['4 workouts logged'],
      confidence: 'high',
      requiresDevice: false,
    };

    assert.equal(insightItem.id, 'ins-card-1');
    assert.equal(insightItem.title, 'Workout Consistency');
    assert.equal(insightItem.severity, 'positive');
  });

  it('handles empty state and insufficient data properly', () => {
    const emptyResponse: CoachInsightsResponse = {
      greeting: 'Welcome to FitOnus!',
      recommendation: null,
      insights: [],
      generatedAt: new Date().toISOString(),
      hasSufficientData: false,
    };

    assert.equal(emptyResponse.hasSufficientData, false);
    assert.equal(emptyResponse.insights.length, 0);
    assert.equal(emptyResponse.recommendation, null);
  });
});

