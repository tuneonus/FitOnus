import { MAX_AUDIO_BASE64_CHARS } from './audio-input.js';

/**
 * Request body limits for the AI routes that carry a photo or an audio clip as base64 text inside a JSON body.
 *
 * Every other route keeps the small application-wide `BODY_LIMIT`. These routes get a bigger one only for themselves
 * (see `bodyLimit` in shared/http/route.ts), read after authentication. Each limit is derived from the cap the use
 * case really enforces, so a cap cannot grow without its limit following (a test pins that), and the limit is never
 * more than that cap plus a small JSON envelope.
 */

const MIB = 1024 * 1024;

/** Largest base64 text a meal photo may carry (enforced by AnalyzeMealPhotoUseCase and by the Python service). */
export const MAX_IMAGE_BASE64_CHARS = 10 * MIB;

/** Room for everything else in the body (mime type, meal type, notes, language, JSON punctuation and escapes). */
export const JSON_ENVELOPE_BYTES = 1 * MIB;

/** `"11mb"`-style limit for a body holding up to `maxBase64Chars` of base64 plus the JSON envelope. */
export const bodyLimitFor = (maxBase64Chars: number): string =>
  `${Math.ceil((maxBase64Chars + JSON_ENVELOPE_BYTES) / MIB)}mb`;

/** POST /nutrition/meal-photo/analyze: base64 photo, at most 10 MiB of text. */
export const MEAL_PHOTO_BODY_LIMIT = bodyLimitFor(MAX_IMAGE_BASE64_CHARS);

/** POST /nutrition/voice-meal/parse and POST /coach/transcribe: base64 audio, at most 15 MiB of text. */
export const AUDIO_BODY_LIMIT = bodyLimitFor(MAX_AUDIO_BASE64_CHARS);

/** POST /nutrition/multimodal/analyze: optional 10 MiB photo + optional 15 MiB audio + JSON envelope. */
export const MULTIMODAL_MEAL_BODY_LIMIT = bodyLimitFor(MAX_IMAGE_BASE64_CHARS + MAX_AUDIO_BASE64_CHARS);
