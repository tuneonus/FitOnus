import type {
  Audience,
  CampaignStatus,
  DeliveryCounts,
  ServerCategory,
} from '../domain/notification-policy.js';
import type { CampaignRecord } from './ports.js';

export interface CampaignView {
  id: string;
  title: string;
  body: string;
  category: ServerCategory;
  destination: string | null;
  audience: Audience;
  status: CampaignStatus;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  targetCount: number;
  skippedCount: number;
  lastError: string | null;
  deliveries: DeliveryCounts | null;
  version: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export const toCampaignView = (
  campaign: CampaignRecord,
  deliveries: DeliveryCounts | null = null,
): CampaignView => ({
  id: campaign.id,
  title: campaign.title,
  body: campaign.body,
  category: campaign.category,
  destination: campaign.destination,
  audience: campaign.audience,
  status: campaign.status,
  scheduledAt: campaign.scheduledAt?.toISOString() ?? null,
  startedAt: campaign.startedAt?.toISOString() ?? null,
  completedAt: campaign.completedAt?.toISOString() ?? null,
  cancelledAt: campaign.cancelledAt?.toISOString() ?? null,
  targetCount: campaign.targetCount,
  skippedCount: campaign.skippedCount,
  lastError: campaign.lastError,
  deliveries,
  version: campaign.version,
  createdBy: campaign.createdBy,
  createdAt: campaign.createdAt.toISOString(),
  updatedAt: campaign.updatedAt.toISOString(),
});
