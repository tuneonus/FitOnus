export type AuditAction =
  | 'admin.login'
  | 'admin.logout'
  | 'admin.password_change'
  | 'admin.settings_update'
  | 'admin.gemini_config_update'
  | 'admin.gemini_key_update'
  | 'admin.gemini_key_rollback'
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
