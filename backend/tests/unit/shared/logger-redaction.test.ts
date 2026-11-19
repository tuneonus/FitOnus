import { describe, expect, it } from 'vitest';
import { LOG_SERVICE_NAME, REDACT_PATHS } from '../../../src/shared/logging/logger.js';
import { createCapturingLogger } from '../../helpers/capture-logger.js';

/**
 * AI events are built from typed metadata, so these paths are the second line of defence: if a future
 * change ever logs user content or a credential, the real logger still censors it.
 */
describe('the application logger', () => {
  it('names the service on every line, so Node and Python lines can be told apart in one log view', () => {
    const { logger, entries } = createCapturingLogger();
    logger.info({ event: 'x' }, 'hello');
    expect(entries()[0]).toMatchObject({
      service: LOG_SERVICE_NAME,
      level: 'info',
      msg: 'hello',
      event: 'x',
    });
    expect(typeof entries()[0]!.time).toBe('string');
  });

  describe('redaction', () => {
    const SECRETS = {
      apiKey: 'sentinel-api-key',
      authorization: 'Bearer sentinel-token',
      serviceSecret: 'sentinel-service-secret',
      prompt: 'sentinel prompt text',
      userMessage: 'sentinel user message',
      fitnessContext: 'sentinel fitness context',
      context: { profile: 'sentinel profile' },
      transcript: 'sentinel transcript',
      base64: 'sentinel-base64',
      imageBase64: 'sentinel-image',
      audioBase64: 'sentinel-audio',
      email: 'sentinel@example.test',
      password: 'sentinel-password',
      refreshToken: 'sentinel-refresh',
      accessToken: 'sentinel-access',
    };

    it('censors every credential and user-content field at the top level', () => {
      const { logger, text, entries } = createCapturingLogger();
      logger.info({ ...SECRETS, requestId: 'keep-me' }, 'top level');

      expect(text()).not.toContain('sentinel');
      expect(entries()[0]).toMatchObject({
        apiKey: '[REDACTED]',
        context: '[REDACTED]',
        email: '[REDACTED]',
        requestId: 'keep-me',
      });
    });

    it('censors them one level down too (for example inside an event or a request wrapper)', () => {
      const { logger, text } = createCapturingLogger();
      logger.info(
        {
          ai: SECRETS,
          req: { headers: { authorization: 'Bearer sentinel-header', cookie: 'sentinel-cookie' } },
        },
        'nested',
      );
      expect(text()).not.toContain('sentinel');
    });

    it('does not censor the metadata operators need', () => {
      const { logger, entries } = createCapturingLogger();
      logger.info(
        {
          event: 'ai.call.completed',
          feature: 'coach_chat',
          model: 'gemini-x',
          totalTokens: 1050,
          inputTokens: 900,
          errorCategory: null,
          correlationId: 'req-12345678',
        },
        'metadata',
      );
      expect(entries()[0]).toMatchObject({
        model: 'gemini-x',
        totalTokens: 1050,
        inputTokens: 900,
        correlationId: 'req-12345678',
        feature: 'coach_chat',
      });
    });

    it('lists the AI paths explicitly', () => {
      for (const path of [
        'apiKey',
        'prompt',
        'context',
        'base64',
        '*.apiKey',
        '*.context',
        '*.imageBase64',
      ]) {
        expect(REDACT_PATHS).toContain(path);
      }
    });
  });
});
