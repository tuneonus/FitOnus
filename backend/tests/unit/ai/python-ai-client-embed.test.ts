import { jwtVerify } from 'jose';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PYTHON_AI_TOKEN_AUDIENCE,
  PYTHON_AI_TOKEN_ISSUER,
  PythonAiClient,
  PythonAiError,
} from '../../../src/shared/ai/python-ai-client.js';
import {
  json,
  okEmbedReply,
  startFakePythonServer,
  type FakePythonServer,
} from '../../helpers/fake-python-ai-server.js';

const SECRET = 'unit-test-secret-unit-test-secret-1234';
const USER = '11111111-1111-4111-8111-111111111111';

describe('PythonAiClient.embed', () => {
  let server: FakePythonServer;
  let client: PythonAiClient;

  beforeEach(async () => {
    server = await startFakePythonServer((_req, res) => json(res, 200, okEmbedReply()));
    client = new PythonAiClient({ baseUrl: server.url, serviceSecret: SECRET });
  });

  afterEach(async () => {
    await server.close();
  });

  it('calls POST /internal/v1/ai/embed with scope ai:embed and default 768 dimensions', async () => {
    const res = await client.embed({
      userId: USER,
      requestId: 'req-embed-1',
      texts: ['How to do barbell bench press with proper form?'],
    });

    expect(res.outcome).toBe('ok');
    expect(res.embeddings).toHaveLength(1);
    expect(res.embeddings[0]).toHaveLength(768);
    expect(res.dimensions).toBe(768);
    expect(res.usage.model).toBe('gemini-embedding-001');

    const sent = server.requests[0]!;
    expect(sent.method).toBe('POST');
    expect(sent.url).toBe('/internal/v1/ai/embed');
    expect(sent.body).toEqual({
      texts: ['How to do barbell bench press with proper form?'],
      dimensions: 768,
    });

    const token = String(sent.headers.authorization).replace('Bearer ', '');
    const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET), {
      issuer: PYTHON_AI_TOKEN_ISSUER,
      audience: PYTHON_AI_TOKEN_AUDIENCE,
    });
    expect(payload.sub).toBe(USER);
    expect(payload.scope).toBe('ai:embed');
    expect(payload.rid).toBe('req-embed-1');
  });

  it('passes optional taskType, title, dimensions, and correlationId', async () => {
    await client.embed({
      userId: USER,
      requestId: 'req-embed-2',
      texts: ['Barbell bench press instruction'],
      taskType: 'RETRIEVAL_DOCUMENT',
      title: 'Bench Press Technique',
      dimensions: 768,
      correlationId: 'client-req-999',
    });

    const sent = server.requests[0]!;
    expect(sent.headers['x-correlation-id']).toBe('client-req-999');
    expect(sent.body).toEqual({
      texts: ['Barbell bench press instruction'],
      taskType: 'RETRIEVAL_DOCUMENT',
      title: 'Bench Press Technique',
      dimensions: 768,
    });
  });

  it('throws invalid_response when payload does not conform to embed schema', async () => {
    server.respond((_req, res) => json(res, 200, { outcome: 'ok', broken: true }));

    await expect(
      client.embed({
        userId: USER,
        requestId: 'req-embed-bad',
        texts: ['test'],
      }),
    ).rejects.toThrow(PythonAiError);
  });
});
