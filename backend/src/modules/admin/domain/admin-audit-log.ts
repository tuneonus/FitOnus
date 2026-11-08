export type AuditAction =
  | 'admin.login'
  | 'admin.logout'
  | 'admin.password_change'
  | 'user.suspend'
  | 'user.reactivate'
  | 'user.role_change'
  | 'profile.view_metadata';

export interface AdminAuditLog {
  id: string;
  adminId: string;
  action: AuditAction;
  targetUserId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}
