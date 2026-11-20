import express, { type Express } from 'express';
import supertest from 'supertest';
import { Database, PgUnitOfWork } from '../../src/database/transaction.js';
import { errorHandler, notFoundHandler } from '../../src/middleware/error-handler.js';
import { createAuthenticate } from '../../src/middleware/authenticate.js';
import { requestContext } from '../../src/middleware/request-context.js';
import { createProfileModule } from '../../src/modules/profile/index.js';
import { createProgressModule } from '../../src/modules/progress/index.js';
import { createActor } from '../../src/shared/auth/actor.js';
import { unauthorized } from '../../src/shared/errors/app-error.js';
import { buildRouter, type RouteGroup } from '../../src/shared/http/route.js';
import { ImageProcessor } from '../../src/shared/images/image-processor.js';
import { LibheifDecoder } from '../../src/shared/images/libheif-decoder.js';
import { createLogger } from '../../src/shared/logging/logger.js';
import { createPrivateMedia, type PrivateMedia } from '../../src/shared/private-media/index.js';
import { FakePrivateObjectStore } from './fake-private-store.js';
import { createTestDatabase, type TestDatabase } from './test-database.js';

/**
 * A small application made of the REAL member-photo route groups (profile avatar, progress photos), a REAL migrated
 * PostgreSQL and the REAL image pipeline, with the in-memory fake in place of the private bucket. It deliberately
 * does not use the container, so it tests the features themselves and nothing else.
 *
 * Authentication is a test stand-in: the bearer token IS the user id (`Authorization: Bearer <user id>`), which lets a
 * test act as several members. An unknown id is a 401, exactly like an invalid token.
 */
export interface PrivateMediaTestContext {
  app: Express;
  db: TestDatabase;
  database: Database;
  store: FakePrivateObjectStore;
  media: PrivateMedia;
  clock: { now: Date };
  /** Moves both the app's clock and the fake store's clock. */
  setNow(date: Date): void;
  /** A supertest agent acting as this user. */
  as(userId: string): ReturnType<typeof agentFor>;
  seedUser(name?: string): Promise<{ id: string; email: string }>;
  close(): Promise<void>;
}

const agentFor = (app: Express, userId: string) => ({
  get: (path: string) => supertest(app).get(path).set('Authorization', `Bearer ${userId}`),
  put: (path: string) => supertest(app).put(path).set('Authorization', `Bearer ${userId}`),
  post: (path: string) => supertest(app).post(path).set('Authorization', `Bearer ${userId}`),
  delete: (path: string) => supertest(app).delete(path).set('Authorization', `Bearer ${userId}`),
});

let seeded = 0;

export async function createPrivateMediaTestContext(
  options: { privateMedia?: 'configured' | 'off'; limiters?: boolean | express.RequestHandler } = {},
): Promise<PrivateMediaTestContext> {
  const db = await createTestDatabase();
  try {
    const database = new Database(db.pool);
    const uow = new PgUnitOfWork(database);
    const store = new FakePrivateObjectStore();
    const clock = { now: new Date('2026-11-20T12:00:00Z') };
    store.now = () => clock.now;
    const logger = createLogger({ level: 'silent', pretty: false });

    const media = createPrivateMedia({
      config: null,
      db: database,
      intake: new ImageProcessor({ heic: new LibheifDecoder() }),
      store,
      urlTtlSeconds: 900,
      logger,
    })!;
    const privateMedia = options.privateMedia === 'off' ? null : media;

    const knownUsers = new Set<string>();
    const authenticate = createAuthenticate(async (token) => {
      if (!knownUsers.has(token)) throw unauthorized('INVALID_TOKEN', 'The access token is invalid.');
      return createActor({ userId: token, sessionId: 'test-session', role: 'member' });
    });

    const limiter: express.RequestHandler | undefined =
      options.limiters === true
        ? (_req, _res, next) => next()
        : typeof options.limiters === 'function'
          ? options.limiters
          : undefined;
    const limiters = limiter ? { memberImageUploads: limiter } : undefined;
    const profile = createProfileModule({
      basePath: '/api/v1/profile',
      db: database,
      uow,
      privateMedia,
      ...(limiters ? { limiters } : {}),
      logger,
    });
    const progress = createProgressModule({
      basePath: '/api/v1/progress',
      db: database,
      privateMedia,
      ...(limiters ? { limiters } : {}),
      logger,
      now: () => clock.now,
    });
    const groups: RouteGroup[] = [profile.routes, progress.routes];

    const app = express();
    app.use(requestContext(logger));
    app.use(express.json({ limit: '100kb', strict: true }));
    for (const group of groups) app.use(group.basePath, buildRouter(group.routes, { authenticate }));
    app.use(notFoundHandler);
    app.use(errorHandler);

    return {
      app,
      db,
      database,
      store,
      media,
      clock,
      setNow: (date) => {
        clock.now = date;
      },
      as: (userId) => agentFor(app, userId),
      seedUser: async (name) => {
        seeded += 1;
        const email = `member${seeded}-${Date.now()}@example.test`;
        const { rows } = await db.pool.query<{ id: string }>(
          `INSERT INTO users (email, display_name, password_hash) VALUES ($1, $2, 'not-a-real-hash') RETURNING id`,
          [email, name ?? `Member ${seeded}`],
        );
        knownUsers.add(rows[0]!.id);
        return { id: rows[0]!.id, email };
      },
      close: async () => {
        await media.purger.stop();
        await db.drop();
      },
    };
  } catch (error) {
    await db.drop();
    throw error;
  }
}
