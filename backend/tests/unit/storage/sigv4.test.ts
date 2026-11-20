import { describe, expect, it } from 'vitest';
import { encodeObjectPath, signRequest } from '../../../src/shared/storage/sigv4.js';

/**
 * The credentials and expected signatures below are the worked examples published by AWS
 * ("Signature Calculations for the Authorization Header: Transferring Payload in a Single Chunk"). The keys are
 * AWS's public documentation placeholders, not real credentials. Matching them proves the canonical request,
 * string-to-sign and key derivation are byte-for-byte what S3-compatible servers (R2) expect.
 */
const credentials = {
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
};
const now = new Date('2013-05-24T00:00:00Z');

describe('signRequest (AWS SigV4 documentation vectors)', () => {
  it('signs the documented GET Object example (with a signed Range header)', () => {
    const headers = signRequest(
      {
        method: 'GET',
        host: 'examplebucket.s3.amazonaws.com',
        path: '/test.txt',
        headers: { range: 'bytes=0-9' },
        payload: '',
        region: 'us-east-1',
        service: 's3',
        now,
      },
      credentials,
    );
    expect(headers.Authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
        'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ' +
        'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
    expect(headers['x-amz-date']).toBe('20130524T000000Z');
    expect(headers['x-amz-content-sha256']).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('signs the documented PUT Object example (encoded path, signed Date and storage class)', () => {
    const headers = signRequest(
      {
        method: 'PUT',
        host: 'examplebucket.s3.amazonaws.com',
        path: encodeObjectPath('/test$file.text'),
        headers: { date: 'Fri, 24 May 2013 00:00:00 GMT', 'x-amz-storage-class': 'REDUCED_REDUNDANCY' },
        payload: 'Welcome to Amazon S3.',
        region: 'us-east-1',
        service: 's3',
        now,
      },
      credentials,
    );
    expect(headers.Authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
        'SignedHeaders=date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class, ' +
        'Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd',
    );
  });
});

describe('signRequest (R2 shape: region "auto")', () => {
  it('matches a signature computed by a separate, independent implementation (Python hmac/hashlib)', () => {
    // Both AWS vectors above use us-east-1; Cloudflare R2 signs with region "auto", so pin that too. The expected
    // values were produced by a from-scratch Python implementation of the specification, not by this code.
    const headers = signRequest(
      {
        method: 'PUT',
        host: '0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com',
        path: '/fitonus-media/notifications/0123456789abcdef0123456789abcdef.png',
        headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=31536000, immutable' },
        payload: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]),
        region: 'auto',
        service: 's3',
        now: new Date('2026-11-19T12:00:00Z'),
      },
      {
        accessKeyId: 'TESTACCESSKEYID000000',
        secretAccessKey: 'TEST-SECRET-ACCESS-KEY-THAT-MUST-NEVER-LEAK',
      },
    );
    expect(headers['x-amz-content-sha256']).toBe(
      'cdf3cefe7ec6253d1cb4828ab654da6beb8a4727daac0c49dbf26bedf5887f79',
    );
    expect(headers.Authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=TESTACCESSKEYID000000/20261119/auto/s3/aws4_request, ' +
        'SignedHeaders=cache-control;content-type;host;x-amz-content-sha256;x-amz-date, ' +
        'Signature=34d31b92564e29dcfd88e787c9fa21beabc2634dacf3cbdb5355b9c6f9e6e3be',
    );
  });
});

describe('signRequest', () => {
  const base = {
    method: 'PUT',
    host: 'abc.r2.cloudflarestorage.com',
    path: '/bucket/notifications/key.png',
    payload: new Uint8Array([1, 2, 3]),
    region: 'auto',
    service: 's3',
    now,
  };

  it('changes the signature when the body, the path or the secret changes', () => {
    const original = signRequest(base, credentials).Authorization;
    expect(signRequest({ ...base, payload: new Uint8Array([1, 2, 4]) }, credentials).Authorization).not.toBe(
      original,
    );
    expect(
      signRequest({ ...base, path: '/bucket/notifications/other.png' }, credentials).Authorization,
    ).not.toBe(original);
    expect(
      signRequest(base, { ...credentials, secretAccessKey: 'a-different-secret-key' }).Authorization,
    ).not.toBe(original);
  });

  it('never includes the secret key in what it returns', () => {
    const headers = signRequest(base, credentials);
    expect(JSON.stringify(headers)).not.toContain(credentials.secretAccessKey);
  });

  it('does not return a Host header (fetch derives it from the URL)', () => {
    expect(Object.keys(signRequest(base, credentials)).map((name) => name.toLowerCase())).not.toContain(
      'host',
    );
  });
});

describe('encodeObjectPath', () => {
  it('keeps slashes and unreserved characters and encodes the rest exactly once', () => {
    expect(encodeObjectPath('/bucket/notifications/0a1b.png')).toBe('/bucket/notifications/0a1b.png');
    expect(encodeObjectPath('/a b/c$d/e(1)')).toBe('/a%20b/c%24d/e%281%29');
  });
});
