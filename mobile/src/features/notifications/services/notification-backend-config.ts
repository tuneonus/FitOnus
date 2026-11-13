import type { PushBackendConfig } from '../types/push-contract';

/**
 * Device registration endpoints (paths are relative to the API base URL, which already ends in `/api/v1`).
 * The installation id is validated by the backend as `[A-Za-z0-9_-]{8,128}`; it is also encoded here so an
 * unexpected value can never alter the path.
 */
export const PUSH_BACKEND_CONFIG: PushBackendConfig = {
  upsertDevicePath: (installationId) => `/notifications/devices/${encodeURIComponent(installationId)}`,
  deleteDevicePath: (installationId) => `/notifications/devices/${encodeURIComponent(installationId)}`,
};
