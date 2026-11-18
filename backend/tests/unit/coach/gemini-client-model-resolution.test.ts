import { describe, it, expect, vi } from 'vitest';
import { GeminiClient } from '../../../src/shared/ai/gemini-client.js';

describe('GeminiClient Model Resolution & Configuration', () => {
  it('1. correctly retains gemini-3.5-flash-lite without forcing redirection to flash', () => {
    const client = new GeminiClient({
      model: 'gemini-3.5-flash-lite',
      apiKey: 'AIzaSyFakeKeyForTesting12345',
    });

    expect(client.modelName).toBe('gemini-3.5-flash-lite');
  });

  it('2. correctly retains gemini-3.5-flash as specified', () => {
    const client = new GeminiClient({
      model: 'gemini-3.5-flash',
      apiKey: 'AIzaSyFakeKeyForTesting12345',
    });

    expect(client.modelName).toBe('gemini-3.5-flash');
  });

  it('3. defaults modelName to gemini-3.5-flash when no model is provided', () => {
    const client = new GeminiClient({
      apiKey: 'AIzaSyFakeKeyForTesting12345',
    });

    expect(client.modelName).toBe('gemini-3.5-flash');
  });

  it('4. uses runtimeService target model when runtimeService is provided', async () => {
    const mockRuntimeService = {
      executeWithTelemetry: vi.fn().mockResolvedValue({
        text: 'Hello from Flash Lite',
        tokens: { input: 10, output: 5, cached: 0 },
        latencyMs: 120,
        model: 'gemini-3.5-flash-lite',
      }),
    };

    const client = new GeminiClient({
      model: 'gemini-3.5-flash', // client fallback default
      apiKey: 'AIzaSyFakeKeyForTesting12345',
      runtimeService: mockRuntimeService as any,
    });

    const response = await client.generateText('How to build muscle?');

    expect(mockRuntimeService.executeWithTelemetry).toHaveBeenCalledTimes(1);
    expect(mockRuntimeService.executeWithTelemetry).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: 'coach_chat',
      }),
    );
    expect(response).toBe('Hello from Flash Lite');
  });
});
