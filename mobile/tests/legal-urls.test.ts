import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { LEGAL_URLS } from '../src/shared/constants/legalUrls';

describe('OnusFit legal URL constants', () => {
  it('every URL starts with https://', () => {
    for (const [key, url] of Object.entries(LEGAL_URLS)) {
      assert.ok(
        url.startsWith('https://'),
        `LEGAL_URLS.${key} must start with https://; got: ${url}`,
      );
    }
  });

  it('every URL contains the official tuneonus.com domain', () => {
    for (const [key, url] of Object.entries(LEGAL_URLS)) {
      assert.ok(
        url.includes('tuneonus.com'),
        `LEGAL_URLS.${key} must be on tuneonus.com; got: ${url}`,
      );
    }
  });

  it('privacy URL follows the /privacy/onusfit convention', () => {
    assert.equal(LEGAL_URLS.privacy, 'https://www.tuneonus.com/privacy/onusfit');
  });

  it('terms URL follows /onusfit/terms', () => {
    assert.equal(LEGAL_URLS.terms, 'https://www.tuneonus.com/onusfit/terms');
  });

  it('support URL follows /onusfit/support', () => {
    assert.equal(LEGAL_URLS.support, 'https://www.tuneonus.com/onusfit/support');
  });

  it('deleteAccount URL follows /onusfit/delete-account', () => {
    assert.equal(LEGAL_URLS.deleteAccount, 'https://www.tuneonus.com/onusfit/delete-account');
  });

  it('appWebsite URL follows /apps/onusfit', () => {
    assert.equal(LEGAL_URLS.appWebsite, 'https://www.tuneonus.com/apps/onusfit');
  });
});

describe('configService legal URLs match LEGAL_URLS constants', () => {
  it('DEFAULT_PUBLIC_APP_CONFIG privacyPolicyUrl matches LEGAL_URLS.privacy', async () => {
    const { DEFAULT_PUBLIC_APP_CONFIG } = await import('../src/services/configService');
    assert.equal(DEFAULT_PUBLIC_APP_CONFIG.legal.privacyPolicyUrl, LEGAL_URLS.privacy);
  });

  it('DEFAULT_PUBLIC_APP_CONFIG termsOfServiceUrl matches LEGAL_URLS.terms', async () => {
    const { DEFAULT_PUBLIC_APP_CONFIG } = await import('../src/services/configService');
    assert.equal(DEFAULT_PUBLIC_APP_CONFIG.legal.termsOfServiceUrl, LEGAL_URLS.terms);
  });

  it('DEFAULT_PUBLIC_APP_CONFIG support.website matches LEGAL_URLS.support', async () => {
    const { DEFAULT_PUBLIC_APP_CONFIG } = await import('../src/services/configService');
    assert.equal(DEFAULT_PUBLIC_APP_CONFIG.support.website, LEGAL_URLS.support);
  });

  it('DEFAULT_PUBLIC_APP_CONFIG support.email is the official TuneOnus address', async () => {
    const { DEFAULT_PUBLIC_APP_CONFIG } = await import('../src/services/configService');
    assert.equal(DEFAULT_PUBLIC_APP_CONFIG.support.email, 'support@tuneonus.com');
  });
});

