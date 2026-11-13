import { apiClient } from '@/lib/api-client';
import type { ApiResponse } from '@/types';
import type {
  CreateNotificationInput,
  ListDeliveriesQuery,
  ListNotificationsQuery,
  NotificationCampaign,
  NotificationContent,
  NotificationDelivery,
  NotificationPreview,
  SendNotificationInput,
  UpdateNotificationInput,
} from './types';

type Meta = ApiResponse<unknown>['meta'];

function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}

/** Idempotency keys let a double click or a network retry reuse one server-side send instead of creating two. */
const idempotencyHeaders = (key: string | undefined): HeadersInit | undefined =>
  key ? { 'Idempotency-Key': key } : undefined;

export const notificationsApi = {
  async list(params: ListNotificationsQuery = {}): Promise<{ items: NotificationCampaign[]; meta: Meta }> {
    const res = await apiClient<NotificationCampaign[]>(
      `/notifications${queryString({ page: params.page, limit: params.limit, status: params.status })}`,
    );
    return { items: res.data, meta: res.meta };
  },

  async get(id: string): Promise<NotificationCampaign> {
    return (await apiClient<NotificationCampaign>(`/notifications/${id}`)).data;
  },

  async create(input: CreateNotificationInput, idempotencyKey?: string): Promise<NotificationCampaign> {
    const res = await apiClient<NotificationCampaign>('/notifications', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: idempotencyHeaders(idempotencyKey),
    });
    return res.data;
  },

  async update(id: string, input: UpdateNotificationInput): Promise<NotificationCampaign> {
    const res = await apiClient<NotificationCampaign>(`/notifications/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
    return res.data;
  },

  async send(id: string, input: SendNotificationInput, idempotencyKey?: string): Promise<NotificationCampaign> {
    const res = await apiClient<NotificationCampaign>(`/notifications/${id}/send`, {
      method: 'POST',
      body: JSON.stringify(input),
      headers: idempotencyHeaders(idempotencyKey),
    });
    return res.data;
  },

  async cancel(id: string): Promise<NotificationCampaign> {
    return (await apiClient<NotificationCampaign>(`/notifications/${id}/cancel`, { method: 'POST' })).data;
  },

  async preview(content: NotificationContent): Promise<NotificationPreview> {
    const res = await apiClient<NotificationPreview>('/notifications/preview', {
      method: 'POST',
      body: JSON.stringify(content),
    });
    return res.data;
  },

  async listDeliveries(
    id: string,
    params: ListDeliveriesQuery = {},
  ): Promise<{ items: NotificationDelivery[]; meta: Meta }> {
    const res = await apiClient<NotificationDelivery[]>(
      `/notifications/${id}/deliveries${queryString({ page: params.page, limit: params.limit, status: params.status })}`,
    );
    return { items: res.data, meta: res.meta };
  },
};
