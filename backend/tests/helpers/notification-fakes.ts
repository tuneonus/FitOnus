import type {
  NotificationImageStore,
  PushMessage,
  PushSender,
  PushSendResult,
} from '../../src/modules/notifications/application/ports.js';

/** In-memory stand-in for R2: nothing in these tests can reach real storage. */
export class FakeImageStore implements NotificationImageStore {
  objects = new Map<string, { body: Uint8Array; contentType: string; cacheControl: string | undefined }>();
  puts = 0;
  failPut = false;
  failExists = false;
  /** Fails only the writes whose key matches (e.g. the canonical WebP after its JPEG was written). */
  failPutWhen: ((key: string) => boolean) | null = null;

  async put(object: {
    key: string;
    body: Uint8Array;
    contentType: string;
    cacheControl?: string;
  }): Promise<void> {
    this.puts += 1;
    if (this.failPut || this.failPutWhen?.(object.key)) throw new Error('R2 put failed (http HTTP 500)');
    this.objects.set(object.key, {
      body: object.body,
      contentType: object.contentType,
      cacheControl: object.cacheControl,
    });
  }

  async exists(key: string): Promise<boolean> {
    if (this.failExists) throw new Error('R2 head failed (network)');
    return this.objects.has(key);
  }
}

/** Push provider fake: records every message. Nothing here can send a real push. */
export class FakeSender implements PushSender {
  dryRun = false;
  sent: PushMessage[] = [];
  async send(message: PushMessage): Promise<PushSendResult> {
    this.sent.push(message);
    return { kind: 'accepted', messageId: `msg-${this.sent.length}` };
  }
}
