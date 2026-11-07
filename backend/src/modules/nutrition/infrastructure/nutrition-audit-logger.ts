import type { SqlExecutor } from '../../../database/transaction.js';
import type { INutritionAuditLogger } from '../application/ports.js';

export class PgNutritionAuditLogger implements INutritionAuditLogger {
  constructor(private readonly db: SqlExecutor) {}

  async logAction(
    adminId: string,
    action: string,
    details: Record<string, unknown>,
    targetUserId: string | null = null,
    ipAddress: string | null = null,
    userAgent: string | null = null,
  ): Promise<void> {
    await this.db.query(
      `
      INSERT INTO admin_audit_logs (
        admin_id, action, target_user_id, details, ip_address, user_agent, created_at
      )
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, NOW())
      `,
      [adminId, action, targetUserId, JSON.stringify(details), ipAddress, userAgent],
    );
  }
}
