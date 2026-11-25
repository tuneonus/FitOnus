/**
 * How long a spoken meal may be. A meal description is a sentence or two, so one minute is generous; the limit also
 * keeps the upload small (about 1 MB of audio) and stops a recorder left running from sending minutes of silence to
 * the AI. The recorder stops by itself at the limit, and a recording shorter than the minimum (an accidental tap) is
 * never sent.
 */
export const VOICE_MAX_SECONDS = 60;
export const VOICE_MIN_SECONDS = 1;
/** The longest typed or transcribed meal text the backend accepts. */
export const VOICE_TRANSCRIPT_MAX_LENGTH = 2000;
/** Shared audio base64 limit matching backend shared/ai/audio-input.ts. */
export const VOICE_MAX_AUDIO_BASE64_CHARS = 15 * 1024 * 1024;

export const VOICE_TOO_SHORT_MESSAGE =
  'That was too short to understand. Tap the mic, then say what you ate.';
export const VOICE_LIMIT_NOTICE = `Recording stopped at ${VOICE_MAX_SECONDS} seconds.`;
export const VOICE_TEXT_TOO_LONG_MESSAGE = `Please keep it under ${VOICE_TRANSCRIPT_MAX_LENGTH} characters.`;
export const VOICE_AUDIO_TOO_LARGE_MESSAGE =
  'That voice recording is too large to upload. Keep recordings under 60 seconds.';

export type RecordingVerdict = 'ok' | 'too_short';

export function judgeRecording(durationMs: number): RecordingVerdict {
  return durationMs >= VOICE_MIN_SECONDS * 1000 ? 'ok' : 'too_short';
}

export function hasReachedRecordingLimit(durationMs: number): boolean {
  return durationMs >= VOICE_MAX_SECONDS * 1000;
}

export function isAudioPayloadWithinLimit(base64: string): boolean {
  const trimmed = base64.trim();
  return trimmed.length > 0 && trimmed.length <= VOICE_MAX_AUDIO_BASE64_CHARS;
}

/** 7_400 -> "0:07"; never past the limit, so a late status update cannot show 1:02. */
export function formatRecordingClock(durationMs: number): string {
  const total = Math.min(VOICE_MAX_SECONDS, Math.max(0, Math.floor(durationMs / 1000)));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
