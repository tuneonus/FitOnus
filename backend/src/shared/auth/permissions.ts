/**
 * Roles and permissions are code, reviewed like code. Authorization checks only
 * ever ask "does the actor hold permission X?"; no role name grants implicit access.
 */
export const ROLES = ['admin', 'member'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'users:read',
  'users:create',
  'users:update',
  'users:manage-status',
  'users:assign-role',
  'admin:access',
  'admin:audit',
  'admin:stats',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  admin: [
    'users:read',
    'users:create',
    'users:update',
    'users:manage-status',
    'users:assign-role',
    'admin:access',
    'admin:audit',
    'admin:stats',
  ],
  member: [],
};

export const isRole = (value: string): value is Role => (ROLES as readonly string[]).includes(value);

export const permissionsForRole = (role: Role): readonly Permission[] => ROLE_PERMISSIONS[role];
