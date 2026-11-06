import { describe, expect, it } from 'vitest';
import { BodyMeasurement } from '../../../src/modules/progress/domain/body-measurement.js';
import { AppError } from '../../../src/shared/errors/app-error.js';

describe('BodyMeasurement Domain Entity', () => {
  const validProps = {
    id: '33333333-3333-4333-8333-333333333333',
    userId: '22222222-2222-4222-8222-222222222222',
    loggedAt: new Date('2026-10-09T08:30:00Z'),
    waistCm: 82.5,
    chestCm: 101.0,
    bodyFatPct: 15.5,
    source: 'manual' as const,
    notes: 'Morning measurement',
    clientId: 'meas-client-1',
  };

  it('creates a valid BodyMeasurement with partial metrics', () => {
    const meas = new BodyMeasurement(validProps);

    expect(meas.id).toBe(validProps.id);
    expect(meas.userId).toBe(validProps.userId);
    expect(meas.waistCm).toBe(82.5);
    expect(meas.chestCm).toBe(101.0);
    expect(meas.bodyFatPct).toBe(15.5);
    expect(meas.hipCm).toBeNull();
    expect(meas.armCm).toBeNull();
    expect(meas.isDeleted()).toBe(false);
  });

  it('rejects creation when all measurement metrics are undefined or null', () => {
    expect(
      () =>
        new BodyMeasurement({
          id: validProps.id,
          userId: validProps.userId,
          loggedAt: validProps.loggedAt,
        }),
    ).toThrow(AppError);

    try {
      new BodyMeasurement({
        id: validProps.id,
        userId: validProps.userId,
        loggedAt: validProps.loggedAt,
        waistCm: null,
      });
    } catch (e: any) {
      expect(e.kind).toBe('validation');
      expect(e.message).toContain('At least one body measurement metric must be provided');
    }
  });

  it('validates physiological ranges for circumferences and percentages', () => {
    // Waist below min
    expect(() => new BodyMeasurement({ ...validProps, waistCm: 25.0 })).toThrow(AppError);
    // Waist above max
    expect(() => new BodyMeasurement({ ...validProps, waistCm: 260.0 })).toThrow(AppError);

    // Body fat pct below min
    expect(() => new BodyMeasurement({ ...validProps, bodyFatPct: 2.0 })).toThrow(AppError);
    // Body fat pct above max
    expect(() => new BodyMeasurement({ ...validProps, bodyFatPct: 65.0 })).toThrow(AppError);

    // Arm below min
    expect(() => new BodyMeasurement({ ...validProps, armCm: 5.0 })).toThrow(AppError);
    // Neck above max
    expect(() => new BodyMeasurement({ ...validProps, neckCm: 85.0 })).toThrow(AppError);
  });

  it('trims notes and client ID and identifies deleted state', () => {
    const meas = new BodyMeasurement({
      ...validProps,
      notes: '  tape check  ',
      clientId: '  meas-99  ',
      deletedAt: new Date(),
    });

    expect(meas.notes).toBe('tape check');
    expect(meas.clientId).toBe('meas-99');
    expect(meas.isDeleted()).toBe(true);
  });
});
