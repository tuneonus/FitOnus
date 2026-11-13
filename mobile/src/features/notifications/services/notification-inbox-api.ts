/** Server categories a user can switch on or off (reminder categories are scheduled on the device). */
export const SERVER_CATEGORIES = ['announcements', 'challenges', 'coach_insights', 'goal_updates'] as const;
export type ServerCategory = (typeof SERVER_CATEGORIES)[number];

export interface RemoteNotification {
  id: string;
  category: ServerCategory;
  title: string;
  body: string;
  /** Allow-listed destination key (never a route or URL), or null. */
  destination: string | null;
  read: boolean;
  createdAt: string;
}

export interface InboxPage {
  items: RemoteNotification[];
  unreadCount: number;
  page: number;
  totalPages: number;
}

export type ServerCategoryPreferences = Record<ServerCategory, boolean>;

export interface PreferenceSnapshot {
  pushEnabled: boolean;
  categories: ServerCategoryPreferences;
}

/** The slice of axios the inbox needs. Responses use the backend envelope `{ success, data, meta? }`. */
export interface InboxHttpClient {
  get: (url: string, config?: { params?: Record<string, unknown> }) => Promise<{ data: unknown }>;
  post: (url: string, body?: unknown) => Promise<{ data: unknown }>;
  put: (url: string, body?: unknown) => Promise<{ data: unknown }>;
  delete: (url: string) => Promise<{ data: unknown }>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isNotificationId = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

const isServerCategory = (value: unknown): value is ServerCategory =>
  typeof value === 'string' && (SERVER_CATEGORIES as readonly string[]).includes(value);

/** Unwrap `{ data }`. A malformed envelope is an error rather than silently becoming an empty list. */
function envelope(response: { data: unknown }): { data: unknown; meta: Record<string, unknown> | null } {
  const body = response.data;
  if (!isRecord(body) || !('data' in body)) throw new Error('Unexpected notifications response.');
  return { data: body.data, meta: isRecord(body.meta) ? body.meta : null };
}

/** Defensive: one malformed row is dropped instead of failing the whole inbox. */
export function parseRemoteNotification(raw: unknown): RemoteNotification | null {
  if (!isRecord(raw)) return null;
  const { id, category, title, body, destination, read, createdAt } = raw;
  if (!isNotificationId(id) || !isServerCategory(category)) return null;
  if (typeof title !== 'string' || typeof body !== 'string' || typeof createdAt !== 'string') return null;
  if (Number.isNaN(Date.parse(createdAt))) return null;
  return {
    id,
    category,
    title,
    body,
    destination: typeof destination === 'string' ? destination : null,
    read: read === true,
    createdAt,
  };
}

export function parsePreferences(raw: unknown): PreferenceSnapshot {
  if (!isRecord(raw)) throw new Error('Unexpected preferences response.');
  const categoriesRaw = isRecord(raw.categories) ? raw.categories : {};
  // Anything not explicitly switched off counts as on, matching the server.
  const categories = Object.fromEntries(
    SERVER_CATEGORIES.map((key) => [key, categoriesRaw[key] !== false]),
  ) as ServerCategoryPreferences;
  return { pushEnabled: raw.pushEnabled !== false, categories };
}

export interface InboxApi {
  list: (query?: { page?: number; limit?: number; unreadOnly?: boolean }) => Promise<InboxPage>;
  unreadCount: () => Promise<number>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Tells the server this push reached the device (moves the delivery from "accepted" to "received"). */
  confirmReceived: (id: string) => Promise<void>;
  getPreferences: () => Promise<PreferenceSnapshot>;
  updatePreferences: (patch: {
    pushEnabled?: boolean;
    categories?: Partial<ServerCategoryPreferences>;
  }) => Promise<PreferenceSnapshot>;
}

const assertId = (id: string): string => {
  // Ids come from the server, but they end up in a URL path: refuse anything that is not a UUID.
  if (!isNotificationId(id)) throw new Error('Invalid notification id.');
  return id;
};

export function createInboxApi(http: InboxHttpClient): InboxApi {
  return {
    async list(query = {}) {
      const response = await http.get('/notifications', {
        params: { page: query.page ?? 1, limit: query.limit ?? 30, unreadOnly: query.unreadOnly ?? false },
      });
      const { data, meta } = envelope(response);
      if (!isRecord(data) || !Array.isArray(data.items)) throw new Error('Unexpected notifications response.');
      return {
        items: data.items.map(parseRemoteNotification).filter((n): n is RemoteNotification => n !== null),
        unreadCount: typeof data.unreadCount === 'number' ? data.unreadCount : 0,
        page: typeof meta?.page === 'number' ? meta.page : 1,
        totalPages: typeof meta?.totalPages === 'number' ? meta.totalPages : 1,
      };
    },
    async unreadCount() {
      const { data } = envelope(await http.get('/notifications/unread-count'));
      return isRecord(data) && typeof data.unreadCount === 'number' ? data.unreadCount : 0;
    },
    async markRead(id) {
      await http.post(`/notifications/${assertId(id)}/read`);
    },
    async markAllRead() {
      await http.post('/notifications/read-all');
    },
    async remove(id) {
      await http.delete(`/notifications/${assertId(id)}`);
    },
    async confirmReceived(id) {
      await http.post(`/notifications/${assertId(id)}/received`);
    },
    async getPreferences() {
      return parsePreferences(envelope(await http.get('/notifications/preferences')).data);
    },
    async updatePreferences(patch) {
      return parsePreferences(envelope(await http.put('/notifications/preferences', patch)).data);
    },
  };
}
