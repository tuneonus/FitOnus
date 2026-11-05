import type { PaginationMeta } from '../../../../shared/pagination/pagination.js';
import type { AdminAuditLogView, AdminRepository, ListAuditLogsQuery } from '../ports.js';

export class ListAuditLogsUseCase {
  constructor(private readonly deps: { adminRepo: AdminRepository }) {}

  async execute(query: ListAuditLogsQuery): Promise<{ items: AdminAuditLogView[]; meta: PaginationMeta }> {
    return this.deps.adminRepo.listAuditLogs(query);
  }
}
