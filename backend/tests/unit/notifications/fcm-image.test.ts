import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { FcmHttpV1Sender } from '../../../src/modules/notifications/infrastructure/fcm-push-sender.js';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const credentials = {
  projectId: 'demo-project',
  clientEmail: 'sender@demo-project.iam.gserviceaccount.com',
  privateKey,
  tokenUri: 'https://oauth2.googleapis.com/token',
};

const urlOf = (input: string | URL | Request): string =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fake FCM: answers the OAuth call and the send call, and records what was sent to FCM itself. */
function fakeFcm() {
  const sends: { url: string; body: Record<string, unknown> }[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = urlOf(input);
    if (url.startsWith('https://oauth2.googleapis.com'))
      return json(200, { access_token: 'oauth-token', expires_in: 3600 });
    sends.push({ url, body: JSON.parse(init?.body as string) as Record<string, unknown> });
    return json(200, { name: 'projects/demo-project/messages/1' });
  });
  const sender = new FcmHttpV1Sender({
    credentials,
    dryRun: false,
    timeoutMs: 5_000,
    fetch: fetchMock as unknown as typeof fetch,
    now: () => 0,
  });
  return { sender, sends };
}

const IMAGE = 'https://media.example.test/notifications/0123456789abcdef0123456789abcdef.png';

const message = {
  token: 'TOKEN_THAT_MUST_NEVER_BE_LOGGED_0123456789',
  title: 'Hello',
  body: 'World',
  data: { notificationId: 'n1', category: 'announcements' },
  channelId: 'remote-updates',
};

describe('FCM payload with an image', () => {
  it('puts the image URL on the Android notification (big picture) and nowhere else', async () => {
    const { sender, sends } = fakeFcm();
    await expect(sender.send({ ...message, imageUrl: IMAGE })).resolves.toMatchObject({ kind: 'accepted' });

    const sent = sends[0]!.body.message as {
      notification: Record<string, string>;
      android: { notification: Record<string, string> };
      data: Record<string, string>;
      apns?: unknown;
    };
    expect(sent.android.notification.image).toBe(IMAGE);
    // Not on the cross-platform block (that would also address iOS, which is out of scope), and not in `data`.
    expect(sent.notification).toEqual({ title: 'Hello', body: 'World' });
    expect(sent.data).toEqual(message.data);
    expect(sent.apns).toBeUndefined();
  });

  it('keeps every other Android setting alongside the image', async () => {
    const { sender, sends } = fakeFcm();
    await sender.send({ ...message, imageUrl: IMAGE });
    const sent = sends[0]!.body.message as { android: Record<string, unknown> };
    expect(sent.android).toEqual({
      priority: 'HIGH',
      ttl: '86400s',
      notification: {
        channel_id: 'remote-updates',
        notification_priority: 'PRIORITY_HIGH',
        sound: 'default',
        image: IMAGE,
      },
    });
  });

  it('sends a text-only message byte-for-byte as it was before images existed', async () => {
    const { sender, sends } = fakeFcm();
    await sender.send(message);
    expect(sends[0]!.body).toEqual({
      validate_only: false,
      message: {
        token: message.token,
        notification: { title: 'Hello', body: 'World' },
        data: message.data,
        android: {
          priority: 'HIGH',
          ttl: '86400s',
          notification: {
            channel_id: 'remote-updates',
            notification_priority: 'PRIORITY_HIGH',
            sound: 'default',
          },
        },
      },
    });
    expect(JSON.stringify(sends[0]!.body)).not.toContain('image');
  });

  it('still validates (not delivers) in dry-run mode, image included', async () => {
    const sends: Record<string, unknown>[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      if (urlOf(input).startsWith('https://oauth2.googleapis.com'))
        return json(200, { access_token: 't', expires_in: 3600 });
      sends.push(JSON.parse(init?.body as string) as Record<string, unknown>);
      return json(200, { name: 'm' });
    });
    const sender = new FcmHttpV1Sender({
      credentials,
      dryRun: true,
      timeoutMs: 5_000,
      fetch: fetchMock as unknown as typeof fetch,
    });
    await sender.send({ ...message, imageUrl: IMAGE });
    expect(sends[0]!.validate_only).toBe(true);
  });
});
