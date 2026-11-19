/**
 * Audio rules shared by every API endpoint that accepts an audio clip (voice meal, transcription).
 * The Python AI backend applies the same rules again (ai-backend/src/onusfit_ai/core/audio.py).
 */

/** A MIME type is accepted if it contains any of these, so `audio/x-m4a` and `audio/mp4; codecs=…` pass. */
export const SUPPORTED_AUDIO_FORMATS = ['m4a', 'mp4', 'aac', 'wav', 'webm', 'ogg', 'mpeg', '3gpp'] as const;

/** Maximum size, measured on the base64 text (as the voice meal endpoint always did). */
export const MAX_AUDIO_BASE64_CHARS = 15 * 1024 * 1024;

export const isSupportedAudioMime = (mimeType: string): boolean =>
  SUPPORTED_AUDIO_FORMATS.some((format) => mimeType.includes(format));
