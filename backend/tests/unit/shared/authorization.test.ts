import { describe, expect, it } from 'vitest';
import {
  assertPermission,
  assertSelfOrPermission,
  createActor,
  hasPermission,
} from '../../../src/shared/auth/actor.js';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../../../src/shared/auth/permissions.js';
import { AppError } from '../../../src/shared/errors/app-error.js';

const member = createActor({ userId: 'member-id', sessionId: 's1', role: 'member' });
const admin = createActor({ userId: 'admin-id', sessionId: 's2', role: 'admin' });

describe('permissions', () => {
  it('grants only explicitly listed permissions (no implicit admin bypass)', () => {
    for (const permission of PERMISSIONS) {
      expect(hasPermission(admin, permission)).toBe(ROLE_PERMISSIONS.admin.includes(permission));
    }
    // A permission that is not granted must be denied even for "admin".
    expect(admin.permissions.has('nonexistent:permission' as never)).toBe(false);
  });

  it('denies members by default', () => {
    expect(member.permissions.size).toBe(0);
    expect(() => assertPermission(member, 'users:read')).toThrow(AppError);
  });

  it('allows self access or the named permission', () => {
    expect(() => assertSelfOrPermission(member, 'member-id', 'users:read')).not.toThrow();
    expect(() => assertSelfOrPermission(member, 'someone-else', 'users:read')).toThrow(
      expect.objectContaining({ code: 'FORBIDDEN', kind: 'forbidden' }),
    );
    expect(() => assertSelfOrPermission(admin, 'someone-else', 'users:read')).not.toThrow();
  });
});
