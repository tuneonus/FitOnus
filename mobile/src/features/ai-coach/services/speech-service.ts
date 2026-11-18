/**
 * Strips markdown markup, links, and formatting symbols so device TTS reads natural prose.
 */
export function stripMarkdownForSpeech(raw: string): string {
  if (!raw) return '';

  return (
    raw
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, '')
      // Remove inline code
      .replace(/`([^`]+)`/g, '$1')
      // Remove images and markdown links [text](url) -> text
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      // Remove headers (### Header)
      .replace(/^#{1,6}\s+/gm, '')
      // Remove bold and italics (**text**, *text*, __text__, _text_)
      .replace(/(\*\*|__)(.*?)\1/g, '$2')
      .replace(/(\*|_)(.*?)\1/g, '$2')
      // Remove bullet points / list markers
      .replace(/^[\s]*[-*+]\s+/gm, '')
      .replace(/^[\s]*\d+\.\s+/gm, '')
      // Remove blockquotes
      .replace(/^>\s+/gm, '')
      // Collapse repeated whitespace and trim
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * Detects if the text contains Tamil Unicode script.
 */
export function detectLanguageHint(text: string): 'ta-IN' | 'en-IN' | 'en-US' {
  const tamilRegex = /[\u0B80-\u0BFF]/;
  if (tamilRegex.test(text)) {
    return 'ta-IN';
  }
  // For Tanglish or Indian English contexts, prefer en-IN when available
  return 'en-IN';
}

type SpeechModule = typeof import('expo-speech');
let cachedSpeech: SpeechModule | null = null;

async function getSpeech(): Promise<SpeechModule> {
  if (!cachedSpeech) {
    cachedSpeech = await import('expo-speech');
  }
  return cachedSpeech;
}

class SpeechService {
  private activeMessageId: string | null = null;
  private isSpeakingActive = false;

  getActiveMessageId(): string | null {
    return this.activeMessageId;
  }

  isSpeaking(): boolean {
    return this.isSpeakingActive;
  }

  async stop(): Promise<void> {
    try {
      this.activeMessageId = null;
      this.isSpeakingActive = false;
      const speech = await getSpeech();
      await speech.stop();
    } catch {
      // Ignored if stop fails or is uninitialized
    }
  }

  async speak(
    messageId: string,
    rawText: string,
    callbacks?: {
      onStart?: () => void;
      onDone?: () => void;
      onError?: (error: Error) => void;
    },
  ): Promise<void> {
    const cleanText = stripMarkdownForSpeech(rawText);
    if (!cleanText) {
      callbacks?.onDone?.();
      return;
    }

    // Stop any existing speech first
    await this.stop();

    this.activeMessageId = messageId;
    this.isSpeakingActive = true;
    callbacks?.onStart?.();

    const lang = detectLanguageHint(cleanText);

    try {
      const speech = await getSpeech();
      speech.speak(cleanText, {
        language: lang,
        pitch: 1.0,
        rate: 0.95,
        onDone: () => {
          if (this.activeMessageId === messageId) {
            this.activeMessageId = null;
            this.isSpeakingActive = false;
          }
          callbacks?.onDone?.();
        },
        onStopped: () => {
          if (this.activeMessageId === messageId) {
            this.activeMessageId = null;
            this.isSpeakingActive = false;
          }
          callbacks?.onDone?.();
        },
        onError: (err) => {
          if (this.activeMessageId === messageId) {
            this.activeMessageId = null;
            this.isSpeakingActive = false;
          }
          callbacks?.onError?.(new Error(String(err)));
        },
      });
    } catch (err: unknown) {
      this.activeMessageId = null;
      this.isSpeakingActive = false;
      const error = err instanceof Error ? err : new Error(String(err));
      callbacks?.onError?.(error);
    }
  }
}

export const speechService = new SpeechService();
