import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const configPath = require.resolve('../src/constants/config');
const originalApiUrl = process.env.EXPO_PUBLIC_API_URL;
const originalDev = Object.getOwnPropertyDescriptor(globalThis, '__DEV__');

function loadConfig(dev: boolean | undefined, apiUrl?: string) {
  delete require.cache[configPath];
  if (dev === undefined) delete (globalThis as any).__DEV__;
  else (globalThis as any).__DEV__ = dev;
  if (apiUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
  else process.env.EXPO_PUBLIC_API_URL = apiUrl;
  return require(configPath).Config;
}

afterEach(() => {
  delete require.cache[configPath];
  if (originalDev) Object.defineProperty(globalThis, '__DEV__', originalDev);
  else delete (globalThis as any).__DEV__;
  if (originalApiUrl === undefined) delete process.env.EXPO_PUBLIC_API_URL;
  else process.env.EXPO_PUBLIC_API_URL = originalApiUrl;
});

describe('API selection across development and release environments', () => {
  it('uses the production API and disables development logging in a release without an override', () => {
    const config = loadConfig(false);
    assert.equal(config.API_BASE_URL, 'https://fitonus-api.onrender.com/api/v1');
    assert.equal(config.IS_DEV, false);
  });

  it('does not assume development when the native development flag is unavailable', () => {
    const config = loadConfig(undefined);
    assert.equal(config.API_BASE_URL, 'https://fitonus-api.onrender.com/api/v1');
    assert.equal(config.IS_DEV, false);
  });

  it('keeps Expo Go and development builds on the existing DEV default', () => {
    const config = loadConfig(true);
    assert.equal(config.API_BASE_URL, 'https://fitonus-api-dev.onrender.com/api/v1');
    assert.equal(config.IS_DEV, true);
  });

  it('respects explicit profile overrides and normalizes trailing slashes', () => {
    assert.equal(
      loadConfig(false, 'https://fitonus-api-dev.onrender.com/api/v1///').API_BASE_URL,
      'https://fitonus-api-dev.onrender.com/api/v1',
    );
    assert.equal(
      loadConfig(true, 'https://fitonus-api.onrender.com/api/v1/').API_BASE_URL,
      'https://fitonus-api.onrender.com/api/v1',
    );
  });
});
