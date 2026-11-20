import { describe, expect, it } from 'vitest';
import { presignQuery } from '../../../src/shared/storage/sigv4-presign.js';

/**
 * Known-answer test: the example in AWS's documentation ("Authenticating Requests: Using Query Parameters").
 * https://docs.aws.amazon.com/AmazonS3/latest/API/sigv4-query-string-auth.html
 * The credentials are the published example ones and authenticate nowhere.
 */
const AWS_EXAMPLE = {
  credentials: {
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  },
  request: {
    method: 'GET' as const,
    host: 'examplebucket.s3.amazonaws.com',
    path: '/test.txt',
    region: 'us-east-1',
    service: 's3',
    now: new Date('2013-05-24T00:00:00Z'),
    expiresInSeconds: 86_400,
  },
};

describe('presignQuery', () => {
  it('reproduces the signature published in the AWS documentation', () => {
    const query = presignQuery(AWS_EXAMPLE.request, AWS_EXAMPLE.credentials);
    expect(query).toBe(
      'X-Amz-Algorithm=AWS4-HMAC-SHA256' +
        '&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request' +
        '&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host' +
        '&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    );
  });

  it('signs the host, the path and the expiry: changing any of them changes the signature', () => {
    const signature = (query: string) => /X-Amz-Signature=([0-9a-f]{64})$/.exec(query)![1];
    const base = signature(presignQuery(AWS_EXAMPLE.request, AWS_EXAMPLE.credentials));
    const variants = [
      { ...AWS_EXAMPLE.request, host: 'other.s3.amazonaws.com' },
      { ...AWS_EXAMPLE.request, path: '/other.txt' },
      { ...AWS_EXAMPLE.request, expiresInSeconds: 900 },
      { ...AWS_EXAMPLE.request, now: new Date('2013-05-24T00:00:01Z') },
    ];
    for (const variant of variants) {
      expect(signature(presignQuery(variant, AWS_EXAMPLE.credentials))).not.toBe(base);
    }
  });

  it('never puts the secret in the query', () => {
    expect(presignQuery(AWS_EXAMPLE.request, AWS_EXAMPLE.credentials)).not.toContain('wJalrXUtnFEMI');
  });

  it.each([0, -1, 1.5, 604_801, Number.NaN])('refuses an expiry of %s seconds', (expiresInSeconds) => {
    expect(() => presignQuery({ ...AWS_EXAMPLE.request, expiresInSeconds }, AWS_EXAMPLE.credentials)).toThrow(
      RangeError,
    );
  });
});
