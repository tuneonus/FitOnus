import { Config } from '@/constants/config';
import { refreshAccessToken } from '@/services/api-client';
import { SecureStorageService } from '@/services/secure-storage';
import { captureUserSession } from '@/services/user-session';
import { createAuthorizedUploadTransport } from './authorized-upload';
import { sendFileWithExpo } from './expo-file-sender';

/** The key `services/api-client.ts` keeps the access token under (it is not exported there). */
const ACCESS_TOKEN_KEY = 'auth.access_token';

/**
 * The signed-in upload transport the avatar and progress-photo APIs use: the app's API base URL, the member's token (and
 * the API client's own single-flight refresh), and the native upload underneath.
 */
export const apiUploadTransport = createAuthorizedUploadTransport({
  baseUrl: () => Config.API_BASE_URL,
  getAccessToken: () => SecureStorageService.getItem(ACCESS_TOKEN_KEY),
  refreshAccessToken,
  captureSession: captureUserSession,
  sendFile: sendFileWithExpo,
});
