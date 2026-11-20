import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_AUDIO_BASE64_CHARS } from '../../../src/shared/ai/audio-input.js';
import {
  createTestContext,
  login,
  seedUser,
  type LoggedIn,
  type TestContext,
} from '../../helpers/test-app.js';

/**
 * The three AI routes that carry a photo or an audio clip as base64 inside JSON have their own, bigger body limit,
 * read after authentication. These tests run the real container (real authentication, real routes, real validation)
 * and use requests that fail VALIDATION on purpose, so the answer proves the body was read and parsed without ever
 * reaching the AI service (nothing is sent to Gemini or Python, and no AI quota is charged).
 */

const MB = 1024 * 1024;
const MEAL_PHOTO = '/api/v1/nutrition/meal-photo/analyze';
const VOICE_MEAL = '/api/v1/nutrition/voice-meal/parse';
const TRANSCRIBE = '/api/v1/coach/transcribe';
const base64 = (bytes: number): string => 'A'.repeat(bytes);

describe('route-specific body limits for AI photo and audio (real container + PostgreSQL)', () => {
  let ctx: TestContext;
  let member: LoggedIn;

  const api = () => request(ctx.app);
  const signedIn = (req: request.Test) => req.set(member.auth);

  beforeAll(async () => {
    ctx = await createTestContext();
    member = await login(ctx.app, await seedUser(ctx.db.pool));
  }, 120_000);

  afterAll(async () => {
    await ctx?.close();
  });

  describe('meal photo', () => {
    // An unsupported mime type: valid JSON that fails validation after the body has been read.
    const invalidPhoto = (bytes: number) => ({ image: base64(bytes), mimeType: 'image/gif' });

    it('does not read a big body from someone who is not signed in (401, not 413)', async () => {
      const res = await api()
        .post(MEAL_PHOTO)
        .send(invalidPhoto(2 * MB));
      expect(res.status).toBe(401);
    });

    it('reads a photo-sized body once signed in: it is parsed and validated (400 from validation, not 413)', async () => {
      const res = await signedIn(api().post(MEAL_PHOTO)).send(invalidPhoto(2 * MB));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('reads a body close to the largest photo the use case accepts (10 MiB of base64)', async () => {
      const res = await signedIn(api().post(MEAL_PHOTO)).send(invalidPhoto(10 * MB));
      expect(res.status).toBe(400);
    });

    it('refuses a body over the route limit with a readable 413', async () => {
      const res = await signedIn(api().post(MEAL_PHOTO)).send(invalidPhoto(11 * MB + 512 * 1024));
      expect(res.status).toBe(413);
      expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('voice meal', () => {
    const invalidVoice = (bytes: number) => ({ audio: base64(bytes), lang: 'x'.repeat(51) });

    it('does not read a big body from someone who is not signed in', async () => {
      expect(
        (
          await api()
            .post(VOICE_MEAL)
            .send(invalidVoice(2 * MB))
        ).status,
      ).toBe(401);
    });

    it('reads an audio-sized body once signed in', async () => {
      const res = await signedIn(api().post(VOICE_MEAL)).send(invalidVoice(2 * MB));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('reads a body close to the largest clip (15 MiB of base64) and refuses one over the route limit', async () => {
      expect((await signedIn(api().post(VOICE_MEAL)).send(invalidVoice(MAX_AUDIO_BASE64_CHARS))).status).toBe(
        400,
      );
      expect((await signedIn(api().post(VOICE_MEAL)).send(invalidVoice(16 * MB + 512 * 1024))).status).toBe(
        413,
      );
    });
  });

  describe('coach transcription', () => {
    const invalidClip = (bytes: number) => ({
      audio: { mimeType: 'audio/not-supported', base64: base64(bytes) },
    });

    it('does not read a big body from someone who is not signed in', async () => {
      expect(
        (
          await api()
            .post(TRANSCRIBE)
            .send(invalidClip(2 * MB))
        ).status,
      ).toBe(401);
    });

    it('reads an audio-sized body once signed in', async () => {
      const res = await signedIn(api().post(TRANSCRIBE)).send(invalidClip(2 * MB));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('refuses a body over the route limit with a readable 413', async () => {
      const res = await signedIn(api().post(TRANSCRIBE)).send(invalidClip(16 * MB + 512 * 1024));
      expect(res.status).toBe(413);
    });
  });

  describe('everything else keeps the small global limit', () => {
    it('a normal authenticated route refuses a 150 KB body (413)', async () => {
      const res = await signedIn(api().post('/api/v1/nutrition/meals')).send({
        notes: 'x'.repeat(150 * 1024),
      });
      expect(res.status).toBe(413);
    });

    it('a public route refuses it too, signed in or not (413)', async () => {
      const res = await api()
        .post('/api/v1/auth/login')
        .send({ email: 'a@b.test', password: 'x'.repeat(150 * 1024) });
      expect(res.status).toBe(413);
    });

    it('the coach chat route (text only) keeps the small limit', async () => {
      const res = await signedIn(api().post('/api/v1/coach/chat')).send({ message: 'x'.repeat(150 * 1024) });
      expect(res.status).toBe(413);
    });

    it('a path that only looks like a big route does not inherit its limit (413 before it is even routed)', async () => {
      const res = await signedIn(api().post(`${MEAL_PHOTO}/extra`)).send({ image: base64(2 * MB) });
      expect(res.status).toBe(413);
    });
  });
});
