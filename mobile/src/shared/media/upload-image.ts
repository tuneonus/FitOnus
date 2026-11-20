/**
 * Uploads one picture as the raw request body (the backend's contract for avatar and progress-photo uploads): the file
 * itself with `Content-Type: image/jpeg|png|webp|heic`, any metadata in the query string. Reports progress, can be
 * cancelled, and turns every failure into a message a person can act on.
 *
 * This file is pure: how bytes reach the network is a `UploadTransport` (see `authorized-upload.ts` for the signed-in
 * one and `expo-file-sender.ts` for the native upload underneath), so everything here is tested without a phone.
 */

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;

/** The server refuses more than this (10 MiB); checking first saves the upload. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface PickedImage {
  /** A local file URI from the picker. */
  uri: string;
  /** From the picker, when it knows. */
  mimeType?: string | null | undefined;
  fileSize?: number | null | undefined;
}

export type UploadErrorCode =
  | 'UNSUPPORTED_TYPE'
  | 'TOO_LARGE'
  | 'CANCELLED'
  | 'READ_FAILED'
  | 'BAD_RESPONSE'
  | 'TIMEOUT';

export class UploadImageError extends Error {
  override readonly name = 'UploadImageError';
  constructor(
    readonly code: UploadErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/**
 * The server answered, but not with success. Shaped like an axios error (`response.status`, `response.data`) so the rest of
 * the app's error handling reads it the same way.
 */
export class UploadHttpError extends Error {
  override readonly name = 'UploadHttpError';
  readonly response: { status: number; data: unknown };
  constructor(status: number, data: unknown) {
    super(`Upload failed with HTTP ${status}`);
    this.response = { status, data };
  }
}

export interface UploadRequest {
  method: 'PUT' | 'POST';
  /** Path relative to the API base, e.g. `/profile/avatar`. */
  path: string;
  /** Sent in the query string. Empty or absent means none. */
  query?: Record<string, string> | undefined;
  /** The local file to send as the body. */
  uri: string;
  contentType: string;
  /** 0 to 1. */
  onProgress?: ((fraction: number) => void) | undefined;
  signal?: AbortSignal | undefined;
}

/** What came back, for ANY HTTP status (a refusal is an answer, not an exception). Rejects only when nothing was answered. */
export interface UploadResponse {
  status: number;
  body: string;
}

export type UploadTransport = (request: UploadRequest) => Promise<UploadResponse>;

const EXTENSION_TYPES: Record<string, (typeof ACCEPTED_IMAGE_TYPES)[number]> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

/** The Content-Type to send: the picker's, else the file extension's, else JPEG (the camera's default). */
export function resolveImageType(image: PickedImage): (typeof ACCEPTED_IMAGE_TYPES)[number] {
  const declared = (image.mimeType ?? '').toLowerCase().split(';')[0]!.trim();
  if (declared) {
    const match = ACCEPTED_IMAGE_TYPES.find((type) => type === declared);
    if (match) return match;
    throw new UploadImageError('UNSUPPORTED_TYPE', 'Use a JPEG, PNG, WebP or HEIC photo.');
  }
  const extension = /\.([A-Za-z0-9]+)(?:[?#].*)?$/.exec(image.uri)?.[1]?.toLowerCase();
  return (extension && EXTENSION_TYPES[extension]) || 'image/jpeg';
}

export interface UploadImageArgs {
  transport: UploadTransport;
  method: 'PUT' | 'POST';
  path: string;
  /** Entries that are `undefined` are left out. */
  query?: Record<string, string | undefined>;
  image: PickedImage;
  /** 0 to 1. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

const compact = (query: Record<string, string | undefined> | undefined): Record<string, string> | undefined => {
  if (!query) return undefined;
  const entries = Object.entries(query).filter((entry): entry is [string, string] => entry[1] !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
};

const isAbort = (error: unknown): boolean => {
  const e = error as { name?: string; code?: string } | null;
  return e?.name === 'AbortError' || e?.code === 'ERR_CANCELED';
};

const parseJson = (text: string): unknown => {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
};

/**
 * Uploads and returns the response's `data`.
 *
 * - throws `UploadImageError` for what is wrong on this side (type, size, cancelled);
 * - throws `UploadHttpError` when the server refused (its error code and message are in `response.data`);
 * - anything else thrown by the transport (no connection, timed out) is passed on as it is.
 */
export async function uploadImage<T>(args: UploadImageArgs): Promise<T> {
  const { transport, method, path, image, onProgress, signal } = args;
  if (typeof image.fileSize === 'number' && image.fileSize > MAX_UPLOAD_BYTES) {
    throw new UploadImageError('TOO_LARGE', 'That photo is larger than 10 MB. Choose a smaller one.');
  }
  const contentType = resolveImageType(image);
  if (signal?.aborted) throw new UploadImageError('CANCELLED', 'Upload cancelled.');

  const query = compact(args.query);
  let response: UploadResponse;
  try {
    response = await transport({
      method,
      path,
      ...(query ? { query } : {}),
      uri: image.uri,
      contentType,
      onProgress,
      signal,
    });
  } catch (error) {
    if (isAbort(error)) throw new UploadImageError('CANCELLED', 'Upload cancelled.');
    throw error;
  }

  const parsed = parseJson(response.body);
  if (response.status < 200 || response.status >= 300) throw new UploadHttpError(response.status, parsed);
  const data = (parsed as { data?: T } | null)?.data;
  if (data === undefined || data === null) {
    throw new UploadImageError('BAD_RESPONSE', 'The server sent an unexpected answer. Try again in a moment.');
  }
  onProgress?.(1);
  return data;
}

interface ApiErrorShape {
  response?: { status?: number; data?: { error?: { code?: string; message?: string } } };
  message?: string;
  code?: string;
  name?: string;
}

/**
 * A message for a failed upload, from what the server said (codes are stable; messages are written for members) or
 * what went wrong on the phone. Never exposes anything technical.
 */
export function describeUploadError(error: unknown): { message: string; code: string | null; retryable: boolean } {
  if (error instanceof UploadImageError) {
    const retryable = error.code === 'READ_FAILED' || error.code === 'BAD_RESPONSE' || error.code === 'TIMEOUT';
    return { message: error.message, code: error.code, retryable };
  }
  const e = (error ?? {}) as ApiErrorShape;
  // The session errors the API client throws carry a message written for people.
  if (e.name === 'SessionExpiredError' || e.name === 'SessionChangedError') {
    return { message: e.message ?? 'Your session changed. Please sign in again.', code: e.name, retryable: false };
  }
  const status = e.response?.status;
  const code = e.response?.data?.error?.code ?? null;
  const serverMessage = e.response?.data?.error?.message;

  switch (code) {
    case 'PHOTO_LIMIT_REACHED':
      return { message: serverMessage ?? 'You have reached the photo limit. Delete one to add another.', code, retryable: false };
    case 'PAYLOAD_TOO_LARGE':
      return { message: 'That photo is larger than 10 MB. Choose a smaller one.', code, retryable: false };
    case 'UNSUPPORTED_MEDIA_TYPE':
    case 'INVALID_IMAGE':
      return { message: serverMessage ?? 'That photo cannot be used. Try another one.', code, retryable: false };
    case 'PRIVATE_STORAGE_NOT_CONFIGURED':
      return { message: 'Photo storage is not available right now.', code, retryable: false };
    case 'PRIVATE_STORAGE_UNAVAILABLE':
      return { message: 'The photo could not be saved right now. Try again in a moment.', code, retryable: true };
    default:
      break;
  }
  if (status === 429) return { message: 'Too many uploads. Please wait a few minutes and try again.', code, retryable: true };
  if (status === 401) return { message: 'Your session has expired. Please sign in again.', code, retryable: false };
  if (status && status >= 500) return { message: 'Something went wrong on our side. Try again in a moment.', code, retryable: true };
  if (e.code === 'ERR_CANCELED' || e.name === 'CanceledError' || e.name === 'AbortError') {
    return { message: 'Upload cancelled.', code: 'CANCELLED', retryable: false };
  }
  if (!status) return { message: 'Could not reach the server. Check your connection and try again.', code, retryable: true };
  return { message: serverMessage ?? 'The photo could not be uploaded.', code, retryable: false };
}
