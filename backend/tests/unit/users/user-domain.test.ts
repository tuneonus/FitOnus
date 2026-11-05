import { describe, expect, it } from 'vitest';
import {
  assertStatusTransition,
  normalizeDisplayName,
  normalizeEmail,
  type User,
} from '../../../src/modules/users/domain/user.js';

const user = (overrides: Partial<User> = {}): User => ({
  id: 'u1',
  email: 'a@b.co',
  displayName: 'A',
  passwordHash: 'x',
  role: 'member',
  status: 'active',
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
  disabledAt: null,
  ...overrides,
});

describe('user domain rules', () => {
  it('normalises e-mail to trimmed lower case', () => {
    expect(normalizeEmail('  Alice@Example.ORG ')).toBe('alice@example.org');
    expect(() => normalizeEmail('not-an-email')).toThrow(
      expect.objectContaining({ code: 'VALIDATION_FAILED' }),
    );
  });

  it('collapses whitespace in display names and rejects control characters', () => {
    expect(normalizeDisplayName('  Ada \t  Lovelace ')).toBe('Ada Lovelace');
    expect(() => normalizeDisplayName('   ')).toThrow();
    expect(() => normalizeDisplayName('bad\u0007name')).toThrow();
    expect(() => normalizeDisplayName('x'.repeat(101))).toThrow();
  });

  it('forbids changing your own status and no-op transitions', () => {
    expect(() => assertStatusTransition('u1', user(), 'disabled')).toThrow(
      expect.objectContaining({ code: 'CANNOT_CHANGE_OWN_STATUS' }),
    );
    expect(() => assertStatusTransition('admin', user({ status: 'disabled' }), 'disabled')).toThrow(
      expect.objectContaining({ code: 'INVALID_STATE_TRANSITION' }),
    );
    expect(() => assertStatusTransition('admin', user(), 'disabled')).not.toThrow();
  });
});
