// Expand threadpool before any libuv operations (crypto, DNS, file I/O)
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || '64';

import http from 'node:http';
import { createApp } from './app.js';
import { ConfigError, loadConfig, type AppConfig } from './config/env.js';
import { createContainer } from './container.js';
import { createPool } from './database/pool.js';
import { setupDnsFallback } from './database/dns-fallback.js';
import { createLogger } from './shared/logging/logger.js';

setupDnsFallback();

function loadConfigOrExit(): AppConfig {
  try {
    return loadConfig();
  } catch (error) {
    // The logger needs config, so report on stderr as JSON. Issues name keys only, never values.
    const issues =
      error instanceof ConfigError ? error.issues : ['Unexpected error while reading configuration'];
    process.stderr.write(`${JSON.stringify({ level: 'fatal', msg: 'Invalid configuration', issues })}\n`);
    process.exit(1);
  }
}

function main(): void {
  const config = loadConfigOrExit();
  const logger = createLogger(config.log);
  if (config.isProduction && config.database.ssl === 'disable') {
    logger.warn('DATABASE_SSL=disable in production: only acceptable on a trusted private network');
  }

  const pool = createPool(config.database, logger);
  const container = createContainer(config, pool);
  const app = createApp({ config, logger, container });
  const server = http.createServer(app);
  server.requestTimeout = 30_000;
  server.headersTimeout = 20_000;
  server.keepAliveTimeout = 5_000;

  let stopping = false;
  const shutdown = (reason: string, exitCode = 0): void => {
    if (stopping) return;
    stopping = true;
    container.lifecycle.beginShutdown();
    logger.info({ reason }, 'Shutting down');

    const forceExit = setTimeout(() => {
      logger.error('Graceful shutdown timed out; forcing exit');
      server.closeAllConnections();
      process.exit(1);
    }, config.http.shutdownTimeoutMs);
    forceExit.unref();

    server.close((error) => {
      pool
        .end()
        .catch((poolError: unknown) => logger.error({ err: poolError }, 'Error closing database pool'))
        .finally(() => {
          if (error) logger.error({ err: error }, 'Error closing HTTP server');
          logger.info('Shutdown complete');
          process.exit(error ? 1 : exitCode);
        });
    });
    // Keep-alive sockets with no in-flight request would otherwise hold close() open.
    server.closeIdleConnections();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, 'Unhandled promise rejection');
    shutdown('unhandledRejection', 1);
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    shutdown('uncaughtException', 1);
  });

  server.on('error', (error) => {
    logger.fatal({ err: error }, 'HTTP server failed to start');
    process.exit(1);
  });
  server.listen(config.http.port, config.http.host, () => {
    logger.info({ host: config.http.host, port: config.http.port, env: config.env }, 'Server listening');
    // Pre-warm database connection in background so initial client requests don't suffer cold-start delay
    pool
      .query('SELECT 1')
      .then(() => {
        logger.info('PostgreSQL connection pool pre-warmed and ready');
      })
      .catch((err) => {
        logger.warn({ err }, 'Background PostgreSQL pre-warm failed');
      });
  });
}

main();
