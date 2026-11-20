import { File, UploadType } from 'expo-file-system';
import type { SendFile } from './authorized-upload';
import { UploadImageError } from './upload-image';

/**
 * Sends a local file as the raw request body with expo-file-system's native upload task (SDK 58).
 *
 * Why this and not `fetch(uri).blob()` plus a JS request: on this SDK the global `fetch` is `expo/fetch`, which has no
 * handling for `file://` or `content://` URIs, and reading a photo into JavaScript memory just to send it is wasteful. The
 * native task streams the file from disk, reports real progress, can be cancelled with an AbortSignal, and (unlike a
 * thrown error) hands back the HTTP status and body of ANY answer, which is what lets the app show the server's reason.
 *
 * Settings that matter, checked against the SDK's native sources:
 * - `UploadType.BINARY_CONTENT`: the file is the body as it is. The caller's `Content-Type` header is kept (Android builds
 *   the body with no content type of its own; iOS only sets one for multipart), which the server needs: it refuses
 *   anything that is not declared as an image.
 * - `sessionType: 'foreground'` (iOS): the member is watching a progress bar, so an ordinary session with ordinary
 *   timeouts is the predictable choice; the default `background` session is for transfers that outlive the app.
 */
export const sendFileWithExpo: SendFile = async ({ url, method, headers, uri, onProgress, signal }) => {
  const file = new File(uri);
  if (!file.exists) throw new UploadImageError('READ_FAILED', 'Could not read that photo. Try choosing it again.');

  const result = await file.upload(url, {
    httpMethod: method,
    uploadType: UploadType.BINARY_CONTENT,
    headers,
    sessionType: 'foreground',
    signal,
    ...(onProgress
      ? {
          onProgress: ({ bytesSent, totalBytes }: { bytesSent: number; totalBytes: number }) => {
            if (totalBytes > 0) onProgress(Math.min(1, bytesSent / totalBytes));
          },
        }
      : {}),
  });
  return { status: result.status, body: result.body };
};
