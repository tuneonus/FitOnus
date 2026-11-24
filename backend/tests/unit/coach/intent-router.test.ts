import { describe, expect, it } from 'vitest';
import {
  classifyCoachQueryIntent,
  routeCoachQueryIntent,
} from '../../../src/modules/coach/domain/intent-router.js';

describe('AI Coach Intent Router (English, Tamil, Tanglish)', () => {
  describe('classifyCoachQueryIntent', () => {
    it('classifies English greetings and pleasantries', () => {
      expect(classifyCoachQueryIntent('hi')).toBe('greeting');
      expect(classifyCoachQueryIntent('Hello coach!')).toBe('greeting');
      expect(classifyCoachQueryIntent('Good morning')).toBe('greeting');
      expect(classifyCoachQueryIntent('Thanks so much!')).toBe('greeting');
      expect(classifyCoachQueryIntent('okay, bye')).toBe('greeting');
    });

    it('classifies Tamil script greetings and pleasantries', () => {
      expect(classifyCoachQueryIntent('வணக்கம்')).toBe('greeting');
      expect(classifyCoachQueryIntent('நன்றி')).toBe('greeting');
      expect(classifyCoachQueryIntent('காலை வணக்கம்')).toBe('greeting');
      expect(classifyCoachQueryIntent('சரி')).toBe('greeting');
    });

    it('classifies Tanglish greetings and pleasantries', () => {
      expect(classifyCoachQueryIntent('vanakkam coach')).toBe('greeting');
      expect(classifyCoachQueryIntent('romba nanri')).toBe('greeting');
      expect(classifyCoachQueryIntent('kaalai vanakkam')).toBe('greeting');
      expect(classifyCoachQueryIntent('super coach')).toBe('greeting');
    });

    it('does not classify compound queries starting with a greeting as pure greeting', () => {
      // Must classify as exercise/nutrition, not pure greeting!
      expect(classifyCoachQueryIntent('Hi coach, how do I do romanian deadlifts?')).toBe(
        'exercise_coaching',
      );
      expect(classifyCoachQueryIntent('Vanakkam, innaiku leg workout panna mudiyuma?')).toBe(
        'exercise_coaching',
      );
      expect(classifyCoachQueryIntent('Hello! Is 200g chicken enough for my protein?')).toBe(
        'nutrition_coaching',
      );
    });

    it('classifies personal metric lookups in English, Tamil, and Tanglish', () => {
      expect(classifyCoachQueryIntent('How much water did I drink today?')).toBe('metric_lookup');
      expect(classifyCoachQueryIntent('What is my calorie target?')).toBe('metric_lookup');
      expect(classifyCoachQueryIntent('தண்ணீர் அளவு எவ்வளவு?')).toBe('metric_lookup');
      expect(classifyCoachQueryIntent('innaiku evlo thanni kudichen?')).toBe('metric_lookup');
      expect(classifyCoachQueryIntent('target weight enna?')).toBe('metric_lookup');
    });

    it('classifies exercise and movement inquiries in English, Tamil, and Tanglish', () => {
      expect(classifyCoachQueryIntent('Shoulder pain during bench press')).toBe(
        'exercise_coaching',
      );
      expect(classifyCoachQueryIntent('How many sets of squats should I do for hypertrophy?')).toBe(
        'exercise_coaching',
      );
      expect(classifyCoachQueryIntent('எனக்கு முழங்கால் வலி இருக்கிறது')).toBe(
        'exercise_coaching',
      );
      expect(classifyCoachQueryIntent('tholpattai valikuthu, workout panna mudiyuma?')).toBe(
        'exercise_coaching',
      );
    });

    it('classifies nutrition and diet inquiries in English, Tamil, and Tanglish', () => {
      expect(classifyCoachQueryIntent('How much protein should I eat on rest days?')).toBe(
        'nutrition_coaching',
      );
      expect(classifyCoachQueryIntent('Is intermittent fasting good for fat loss?')).toBe(
        'nutrition_coaching',
      );
      expect(classifyCoachQueryIntent('முட்டை சாப்பிட்டால் கொழுப்பு கூடுமா?')).toBe(
        'nutrition_coaching',
      );
      expect(classifyCoachQueryIntent('night saapadu la protein evlo irukanum?')).toBe(
        'nutrition_coaching',
      );
    });

    it('defaults to general for ambiguous or multi-topic questions', () => {
      expect(classifyCoachQueryIntent('Tell me a philosophy of life')).toBe('general');
      expect(classifyCoachQueryIntent('')).toBe('general');
    });
  });

  describe('routeCoachQueryIntent', () => {
    it('skips RAG and memories for pure greetings', () => {
      const decision = routeCoachQueryIntent('Hello coach!');
      expect(decision.intent).toBe('greeting');
      expect(decision.shouldRetrieveRag).toBe(false);
      expect(decision.shouldRetrieveMemories).toBe(false);
    });

    it('skips RAG but allows memories for metric lookups', () => {
      const decision = routeCoachQueryIntent('How much water did I drink today?');
      expect(decision.intent).toBe('metric_lookup');
      expect(decision.shouldRetrieveRag).toBe(false);
      expect(decision.shouldRetrieveMemories).toBe(true);
    });

    it('enables RAG and boosts injuries category for pain-related exercise queries', () => {
      const decision = routeCoachQueryIntent('Sharp knee pain when squatting');
      expect(decision.intent).toBe('exercise_coaching');
      expect(decision.shouldRetrieveRag).toBe(true);
      expect(decision.shouldRetrieveMemories).toBe(true);
      expect(decision.categoryBoost).toBe('injuries');
    });

    it('enables RAG and boosts food category for nutrition queries', () => {
      const decision = routeCoachQueryIntent('What are good vegetarian protein sources?');
      expect(decision.intent).toBe('nutrition_coaching');
      expect(decision.shouldRetrieveRag).toBe(true);
      expect(decision.shouldRetrieveMemories).toBe(true);
      expect(decision.categoryBoost).toBe('food');
    });
  });
});
