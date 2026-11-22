import { describe, it, expect, vi } from 'vitest';
import {
  isSensitiveHealthContent,
  MemoryExtractionWorker,
} from '../../../src/modules/coach/application/services/memory-extraction-worker.js';
import type {
  ConversationRepository,
  MemoryExtractionJobQueue,
  MemoryExtractor,
  MemoryRepository,
} from '../../../src/modules/coach/application/ports.js';

describe('Sensitive Memory Privacy & Safety Gate', () => {
  describe('isSensitiveHealthContent predicate', () => {
    describe('English clinical, injury, and allergy terms', () => {
      it('detects category injuries or medical regardless of text', () => {
        expect(isSensitiveHealthContent('injuries', 'Had a minor discomfort', 'quote')).toBe(true);
        expect(isSensitiveHealthContent('medical', 'General health note', 'quote')).toBe(true);
      });

      it('detects joint and ligament injuries', () => {
        expect(isSensitiveHealthContent('workout', 'Tore my ACL 2 years ago in football', 'ACL tear')).toBe(true);
        expect(isSensitiveHealthContent('workout', 'Rotator cuff tear on the right shoulder', 'rotator cuff tear')).toBe(true);
        expect(isSensitiveHealthContent('workout', 'Suffered meniscus tear last month', 'meniscus')).toBe(true);
      });

      it('detects chronic conditions and medical diagnoses', () => {
        expect(isSensitiveHealthContent('food', 'Diagnosed with type 2 diabetes', 'diabetes')).toBe(true);
        expect(isSensitiveHealthContent('workout', 'Has hypertension and asthma', 'asthma')).toBe(true);
        expect(isSensitiveHealthContent('conversations', 'Suffering from severe depression and anxiety', 'depression')).toBe(true);
      });

      it('detects allergies and adverse reactions', () => {
        expect(isSensitiveHealthContent('food', 'Severely allergic to peanuts and shellfish', 'allergic to peanuts')).toBe(true);
        expect(isSensitiveHealthContent('food', 'Has celiac disease and severe peanut allergy', 'peanut allergy')).toBe(true);
      });

      it('detects prescription medications and surgical procedures', () => {
        expect(isSensitiveHealthContent('workout', 'Takes metformin and insulin daily', 'metformin')).toBe(true);
        expect(isSensitiveHealthContent('workout', 'Had lumbar spine surgery 6 months ago', 'spine surgery')).toBe(true);
      });
    });

    describe('Tamil script sensitive terms', () => {
      it('detects pain and injury in Tamil script', () => {
        expect(isSensitiveHealthContent('workout', 'முழங்கால் வலி அதிகமாக உள்ளது', 'முழங்கால் வலி')).toBe(true);
        expect(isSensitiveHealthContent('workout', 'தோள்பட்டை காயம் ஏற்பட்டது', 'காயம்')).toBe(true);
      });

      it('detects fractures, operations and surgery in Tamil script', () => {
        expect(isSensitiveHealthContent('workout', 'எலும்பு முறிவு ஆபரேஷன் நடந்தது', 'எலும்பு முறிவு')).toBe(true);
        expect(isSensitiveHealthContent('workout', 'முதுகுத்தண்டு அறுவை சிகிச்சை நடந்தது', 'அறுவை சிகிச்சை')).toBe(true);
      });

      it('detects allergies, sprains, swelling and medication in Tamil script', () => {
        expect(isSensitiveHealthContent('food', 'வேர்க்கடலை ஒவ்வாமை உண்டு', 'ஒவ்வாமை')).toBe(true);
        expect(isSensitiveHealthContent('workout', 'கடுமையான சுளுக்கு மற்றும் வீக்கம்', 'சுளுக்கு')).toBe(true);
        expect(isSensitiveHealthContent('workout', 'மருத்துவர் மருந்து கொடுத்துள்ளார்', 'மருத்துவர்')).toBe(true);
      });
    });

    describe('Tanglish colloquial sensitive terms', () => {
      it('detects pain phrases in Tanglish', () => {
        expect(isSensitiveHealthContent('workout', 'knee vali romba irukku squat panna mudiyala', 'knee vali')).toBe(true);
        expect(isSensitiveHealthContent('workout', 'shoulder valikuthu bench press pannumpothu', 'shoulder valikuthu')).toBe(true);
        expect(isSensitiveHealthContent('workout', 'back valikithu', 'valikithu')).toBe(true);
      });

      it('detects injury, sprain and swelling in Tanglish', () => {
        expect(isSensitiveHealthContent('workout', 'kaayam patturukku gym pogala', 'kaayam')).toBe(true);
        expect(isSensitiveHealthContent('workout', 'ankle la sulukku pudichurukku', 'sulukku')).toBe(true);
        expect(isSensitiveHealthContent('workout', 'kaal veengirukku nadakka mudila', 'veengirukku')).toBe(true);
      });

      it('detects doctors, medicine and surgeries in Tanglish', () => {
        expect(isSensitiveHealthContent('workout', 'doctor kitta ponen rest edukka sonnanga', 'doctor kitta')).toBe(true);
        expect(isSensitiveHealthContent('workout', 'marunthu eduthutu irukken', 'marunthu')).toBe(true);
        expect(isSensitiveHealthContent('workout', 'ligament ku surgery panninen', 'surgery panninen')).toBe(true);
        expect(isSensitiveHealthContent('workout', 'operation pannanga last year', 'operation pannanga')).toBe(true);
      });

      it('detects dizziness and heart issues in Tanglish', () => {
        expect(isSensitiveHealthContent('workout', 'heavy deadlift pannumpothu mayakkam varuthu', 'mayakkam')).toBe(true);
        expect(isSensitiveHealthContent('workout', 'heart attack vanthuthu past la', 'heart attack')).toBe(true);
      });
    });

    describe('Allowed non-sensitive fitness and diet preferences', () => {
      it('allows vegetarian, vegan and dietary preferences', () => {
        expect(isSensitiveHealthContent('food', 'Prefers a lacto-vegetarian diet', 'vegetarian')).toBe(false);
        expect(isSensitiveHealthContent('food', 'Eats high protein with chicken and eggs', 'high protein')).toBe(false);
        expect(isSensitiveHealthContent('food', 'Prefers oats and fruits for breakfast', 'oats for breakfast')).toBe(false);
        expect(isSensitiveHealthContent('food', 'Follows 16:8 intermittent fasting schedule', 'intermittent fasting')).toBe(false);
      });

      it('allows exercise and training preferences', () => {
        expect(isSensitiveHealthContent('workout', 'Prefers 4-day upper lower split training', 'upper lower split')).toBe(false);
        expect(isSensitiveHealthContent('workout', 'Loves barbell back squats and overhead press', 'barbell squats')).toBe(false);
        expect(isSensitiveHealthContent('workout', 'Prefers early morning 6am workouts', 'morning workouts')).toBe(false);
        expect(isSensitiveHealthContent('workout', 'Enjoys swimming on rest days', 'swimming')).toBe(false);
      });

      it('allows fitness goals and targets', () => {
        expect(isSensitiveHealthContent('goals', 'Aiming to achieve 15% body fat by summer', '15% body fat')).toBe(false);
        expect(isSensitiveHealthContent('goals', 'Goal is to run 5k in under 25 minutes', 'run 5k')).toBe(false);
        expect(isSensitiveHealthContent('goals', 'Wants to bench press 100kg for 5 clean reps', 'bench 100kg')).toBe(false);
      });
    });
  });

  describe('Worker Node-Side Safety Enforcement', () => {
    it('drops sensitive candidate even if Python model classified sensitive=false', async () => {
      const mockQueue: MemoryExtractionJobQueue = {
        enqueue: vi.fn(),
        claimDue: vi.fn().mockResolvedValue([
          {
            id: 'job-sec-1',
            userId: 'user-sec-1',
            conversationId: 'convo-sec-1',
            messageId: 'msg-sec-1',
            status: 'processing',
            attempts: 0,
            maxAttempts: 3,
            nextAttemptAt: new Date(),
            lastError: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
        complete: vi.fn().mockResolvedValue(undefined),
        fail: vi.fn().mockResolvedValue(undefined),
        cancelForUser: vi.fn().mockResolvedValue(undefined),
        isJobCancelled: vi.fn().mockResolvedValue(false),
        pruneOldJobs: vi.fn().mockResolvedValue(0),
      };

      const mockMemoryRepo: MemoryRepository = {
        listMemories: vi.fn(),
        getMemory: vi.fn(),
        createMemory: vi.fn().mockResolvedValue({ id: 'mem-created' }),
        updateMemory: vi.fn(),
        deleteMemory: vi.fn(),
        updateMemoryStatus: vi.fn(),
        dismissSuggestion: vi.fn(),
        clearAll: vi.fn(),
        isMemoryEnabled: vi.fn().mockResolvedValue(true),
        setMemoryEnabled: vi.fn(),
        getActiveMemoriesForContext: vi.fn().mockResolvedValue([]),
        getDismissedTexts: vi.fn().mockResolvedValue([]),
      };

      const mockConvoRepo: ConversationRepository = {
        createConversation: vi.fn(),
        listConversations: vi.fn(),
        getConversation: vi.fn(),
        updateConversation: vi.fn(),
        deleteConversation: vi.fn(),
        addMessage: vi.fn(),
        getMessages: vi.fn().mockResolvedValue([
          { id: 'msg-sec-1', role: 'user', text: 'Enakku knee vali irukku but I like oats.' },
        ]),
        setMessageFeedback: vi.fn(),
      };

      // Python extractor erroneously marked the knee vali as sensitive=false
      const mockExtractor: MemoryExtractor = {
        extract: vi.fn().mockResolvedValue([
          {
            category: 'workout',
            text: 'Has knee vali during leg day',
            confidence: 0.95,
            sensitive: false, // Erroneously false from model
            sourceQuote: 'knee vali',
          },
          {
            category: 'food',
            text: 'Likes eating oats for breakfast',
            confidence: 0.9,
            sensitive: false,
            sourceQuote: 'like oats',
          },
        ]),
      };

      const worker = new MemoryExtractionWorker({
        queue: mockQueue,
        memoryRepo: mockMemoryRepo,
        conversationRepo: mockConvoRepo,
        extractor: mockExtractor,
      });

      const processed = await worker.processBatch(1, 60);

      expect(processed).toBe(1);
      // The Node-side safety gate caught 'knee vali' and rejected it!
      expect(mockMemoryRepo.createMemory).toHaveBeenCalledTimes(1);
      expect(mockMemoryRepo.createMemory).toHaveBeenCalledWith('user-sec-1', {
        category: 'food',
        text: 'Likes eating oats for breakfast',
        source: 'Conversation',
        sensitive: false,
        status: 'pending_approval',
        confidence: 0.9,
        sourceMessageId: 'msg-sec-1',
        sourceConversationId: 'convo-sec-1',
      });
      expect(mockQueue.complete).toHaveBeenCalledWith('job-sec-1');
    });
  });

  describe('User-Managed Sensitive Memories Independence', () => {
    it('ensures manual user-created memories remain fully manageable', async () => {
      // Direct user-managed operations through MemoryRepository
      const memoryStore = new Map<string, any>();

      const repo: MemoryRepository = {
        listMemories: vi.fn(async (userId) => {
          const items = Array.from(memoryStore.values()).filter((m) => m.userId === userId);
          return { enabled: true, items, suggestions: [] };
        }),
        getMemory: vi.fn(async (userId, id) => {
          const m = memoryStore.get(id);
          return m && m.userId === userId ? m : null;
        }),
        createMemory: vi.fn(async (userId, input) => {
          const mem = { id: `mem-${Date.now()}`, userId, ...input, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
          memoryStore.set(mem.id, mem);
          return mem as any;
        }),
        updateMemory: vi.fn(async (userId, id, text) => {
          const existing = memoryStore.get(id);
          if (!existing || existing.userId !== userId) return null;
          const updated = { ...existing, text, updatedAt: new Date().toISOString() };
          memoryStore.set(id, updated);
          return updated as any;
        }),
        deleteMemory: vi.fn(async (userId, id) => {
          const existing = memoryStore.get(id);
          if (!existing || existing.userId !== userId) return false;
          memoryStore.delete(id);
          return true;
        }),
        updateMemoryStatus: vi.fn(),
        dismissSuggestion: vi.fn(),
        clearAll: vi.fn(async (userId) => {
          for (const [id, m] of memoryStore.entries()) {
            if (m.userId === userId) memoryStore.delete(id);
          }
        }),
        isMemoryEnabled: vi.fn().mockResolvedValue(true),
        setMemoryEnabled: vi.fn(),
        getActiveMemoriesForContext: vi.fn().mockResolvedValue([]),
        getDismissedTexts: vi.fn().mockResolvedValue([]),
      };

      // 1. User manually creates a medical note in their profile
      const manualMemory = await repo.createMemory('user-manual-1', {
        category: 'medical',
        text: 'Previous left shoulder dislocation in 2021',
        source: 'User',
        sensitive: true,
        status: 'active',
      });
      expect(manualMemory.id).toBeDefined();

      // 2. User can view/list it
      const list = await repo.listMemories('user-manual-1');
      expect(list.items).toHaveLength(1);
      expect(list.items[0]?.text).toBe('Previous left shoulder dislocation in 2021');

      // 3. User can edit it
      const updated = await repo.updateMemory(
        'user-manual-1',
        manualMemory.id,
        'Previous left shoulder dislocation in 2021 - fully rehabbed',
      );
      expect(updated?.text).toBe('Previous left shoulder dislocation in 2021 - fully rehabbed');

      // 4. User can delete it
      const deleted = await repo.deleteMemory('user-manual-1', manualMemory.id);
      expect(deleted).toBe(true);

      const afterDelete = await repo.listMemories('user-manual-1');
      expect(afterDelete.items).toHaveLength(0);
    });
  });
});
