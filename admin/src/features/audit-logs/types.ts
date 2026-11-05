export interface AuditLogItem {
  id: string;
  adminId: string;
  adminEmail: string | null;
  adminName: string | null;
  action: string;
  targetUserId: string | null;
  targetUserEmail: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface AuditLogsQuery {
  page?: number;
  limit?: number;
  action?: string;
}

