/**
 * Backend contract for device push registration (implemented in `backend/src/modules/notifications`).
 *
 * Identity model: the app generates a stable random `installationId` once per install and persists it. The
 * backend upserts one device row per (userId, installationId), so token rotation updates the row instead of
 * orphaning it, and a token never appears in a URL (URLs get logged). The user is always taken from the access
 * token, never from the body.
 *
 * The token is the native FCM registration token. The backend sends to it through FCM HTTP v1; there is no Expo
 * push service involved, so no Expo push token is ever created.
 */

export type PushPlatform = 'android' | 'ios';

/** Body of the idempotent "upsert device" request (`PUT /notifications/devices/:installationId`). */
export interface PushDeviceRegistrationRequest {
  installationId: string;
  pushToken: string;
  platform: PushPlatform;
  appVersion: string | null;
  /** IANA timezone of the device. */
  timeZone: string;
}

/** Response the mobile adapter tolerates; every field is optional on purpose. */
export interface PushDeviceRegistrationResponse {
  id?: string;
  installationId?: string;
  lastRegisteredAt?: string;
}

export interface PushBackendConfig {
  upsertDevicePath: (installationId: string) => string;
  deleteDevicePath: (installationId: string) => string;
}

export type RegistrationFailureKind =
  | 'network'
  | 'server'
  | 'rate-limited'
  | 'auth'
  | 'endpoint-missing'
  | 'rejected'
  | 'unknown';
