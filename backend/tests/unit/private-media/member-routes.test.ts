import { describe, expect, it } from 'vitest';
import { createProfileModule } from '../../../src/modules/profile/index.js';
import { createProgressModule } from '../../../src/modules/progress/index.js';
import { buildOpenApiDocument } from '../../../src/shared/http/openapi.js';
import type { RouteGroup } from '../../../src/shared/http/route.js';

/** Routes are built from specs only; no query runs, so a database that throws proves nothing is touched at build time. */
const noDb = { query: async () => Promise.reject(new Error('no database in this test')) };
const noUow = { run: async <T>(work: () => Promise<T>) => work() };

const profile = createProfileModule({ basePath: '/api/v1/profile', db: noDb as never, uow: noUow }).routes;
const progress = createProgressModule({ basePath: '/api/v1/progress', db: noDb as never }).routes;

const find = (group: RouteGroup, method: string, path: string) =>
  group.routes.find((route) => route.method === method && route.path === path);

describe('member photo routes', () => {
  const expected: [RouteGroup, string, string][] = [
    [profile, 'get', '/avatar'],
    [profile, 'put', '/avatar'],
    [profile, 'delete', '/avatar'],
    [progress, 'get', '/photos'],
    [progress, 'post', '/photos'],
    [progress, 'get', '/photos/:id'],
    [progress, 'delete', '/photos/:id'],
  ];

  it.each(
    expected.map(
      ([group, method, path]) =>
        [method.toUpperCase(), `${group.basePath}${path}`, group, method, path] as const,
    ),
  )(
    '%s %s needs a signed-in member and nothing else (no member id, key or admin permission)',
    (_m, _p, group, method, path) => {
      const route = find(group, method, path);
      expect(route, 'route exists').toBeDefined();
      expect(route!.access).toEqual({ kind: 'authenticated' });
    },
  );

  it('only the two upload routes take a body, and they take the raw image, so neither declares a JSON body schema', () => {
    for (const [group, path] of [
      [profile, '/avatar'],
      [progress, '/photos'],
    ] as const) {
      const route = find(group, path === '/avatar' ? 'put' : 'post', path)!;
      expect(route.request?.body).toBeUndefined();
      expect(route.bodyLimit).toBeUndefined(); // not a JSON route: the shared JSON limit is not raised for it
    }
  });

  it('takes no member id from the path or query anywhere: the owner is always the session', () => {
    const all = [...profile.routes, ...progress.routes].filter((r) =>
      ['/avatar', '/photos', '/photos/:id'].includes(r.path),
    );
    for (const route of all) {
      expect(route.path).not.toMatch(/:userId|:memberId|:ownerId/);
    }
    // The only parameters: a photo's own id (checked against the session's owner in one query) and the upload's date and tag.
    const upload = find(progress, 'post', '/photos')!;
    expect(Object.keys((upload.request!.query as unknown as { shape: object }).shape).sort()).toEqual([
      'tag',
      'takenOn',
    ]);
  });

  it('runs the upload limiter before authentication when one is supplied', () => {
    const limiter = ((_req: unknown, _res: unknown, next: () => void) => next()) as never;
    const withLimiter = createProfileModule({
      basePath: '/api/v1/profile',
      db: noDb as never,
      uow: noUow,
      limiters: { memberImageUploads: limiter },
    }).routes;
    expect(find(withLimiter, 'put', '/avatar')!.middleware).toEqual([limiter]);
    expect(find(withLimiter, 'get', '/avatar')!.middleware ?? []).toEqual([]);
  });

  it('is documented in OpenAPI as bearer-protected, with the photo statuses', () => {
    const doc = buildOpenApiDocument([profile, progress], { title: 't', version: '1' }) as {
      paths: Record<string, Record<string, { security?: unknown[]; responses: Record<string, unknown> }>>;
    };
    for (const [group, method, path] of expected) {
      const operation = doc.paths[`${group.basePath}${path}`.replace(/:(\w+)/g, '{$1}')]?.[method];
      expect(operation, `${method} ${path}`).toBeDefined();
      expect(operation!.security).toEqual([{ bearerAuth: [] }]);
    }
    const add = doc.paths['/api/v1/progress/photos']!['post']!;
    for (const status of ['201', '401', '409', '413', '415', '422', '429', '503'])
      expect(add.responses[status], status).toBeDefined();
  });
});
