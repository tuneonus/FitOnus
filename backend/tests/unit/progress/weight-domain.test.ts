import { describe, expect, it } from 'vitest';
import { WeightLog } from '../../../src/modules/progress/domain/weight-log.js';
import { AppError } from '../../../src/shared/errors/app-error.js';

describe('WeightLog Domain Entity', () => {
  const validProps = {
    id: '11111111-1111-4111-8111-111111111111',
    userId: '22222222-2222-4222-8222-222222222222',
    weightKg: 78.45,
    loggedAt: new Date('2026-10-09T08:30:00Z'),
    source: 'manual' as const,
    notes: 'Morning weigh-in',
    clientId: 'client-uuid-1',
  };

  it('creates a valid WeightLog and rounds weight to 2 decimal places', () => {
    const log = new WeightLog({
      ...validProps,
      weightKg: 78.456,
    });

    expect(log.id).toBe(validProps.id);
    expect(log.userId).toBe(validProps.userId);
    expect(log.weightKg).toBe(78.46);
    expect(log.source).toBe('manual');
    expect(log.notes).toBe('Morning weigh-in');
    expect(log.clientId).toBe('client-uuid-1');
    expect(log.isDeleted()).toBe(false);
  });

  it('defaults source to manual if omitted', () => {
    const log = new WeightLog({
      id: validProps.id,
      userId: validProps.userId,
      weightKg: 75.0,
      loggedAt: validProps.loggedAt,
    });

    expect(log.source).toBe('manual');
  });

  it('trims notes and clientId', () => {
    const log = new WeightLog({
      ...validProps,
      notes: '   trimmed note   ',
      clientId: '   client-123   ',
    });

    expect(log.notes).toBe('trimmed note');
    expect(log.clientId).toBe('client-123');
  });

  it('rejects weightKg less than 25 kg', () => {
    expect(() => new WeightLog({ ...validProps, weightKg: 24.9 })).toThrow(AppError);
    try {
      new WeightLog({ ...validProps, weightKg: 24.9 });
    } catch (e: any) {
      expect(e.kind).toBe('validation');
      expect(e.code).toBe('VALIDATION_FAILED');
      expect(e.message).toContain('between 25.0 kg and 450.0 kg');
    }
  });

  it('rejects weightKg greater than 450 kg', () => {
    expect(() => new WeightLog({ ...validProps, weightKg: 450.1 })).toThrow(AppError);
  });

  it('rejects invalid or missing IDs', () => {
    expect(() => new WeightLog({ ...validProps, id: '' })).toThrow(AppError);
    expect(() => new WeightLog({ ...validProps, userId: '' })).toThrow(AppError);
  });

  it('rejects invalid loggedAt dates', () => {
    expect(() => new WeightLog({ ...validProps, loggedAt: new Date('invalid') })).toThrow(AppError);
  });

  it('identifies soft-deleted logs correctly', () => {
    const log = new WeightLog({
      ...validProps,
      deletedAt: new Date(),
    });
    expect(log.isDeleted()).toBe(true);
  });
});
