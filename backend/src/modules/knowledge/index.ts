import type { RequestHandler } from 'express';
import type { Database } from '../../database/transaction.js';
import type { PythonAiClient } from '../../shared/ai/python-ai-client.js';
import type { RouteGroup } from '../../shared/http/route.js';
import { KnowledgeService } from './application/knowledge-service.js';
import { SemanticChunker } from './domain/semantic-chunker.js';
import { PgKnowledgeRepository } from './infrastructure/pg-knowledge-repository.js';
import {
  createKnowledgeAdminController,
  type KnowledgeAdminController,
} from './interface/knowledge-admin.controller.js';
import { createKnowledgeAdminRoutes } from './interface/knowledge-admin.routes.js';

export * from './domain/knowledge.types.js';
export * from './domain/semantic-chunker.js';
export * from './domain/reciprocal-rank-fusion.js';
export * from './domain/rag-context-builder.js';
export * from './infrastructure/pg-knowledge-repository.js';
export * from './application/knowledge-service.js';
export * from './interface/text-extractor.js';
export * from './interface/knowledge-admin.schemas.js';
export * from './interface/knowledge-admin.controller.js';
export * from './interface/knowledge-admin.routes.js';

export interface KnowledgeModule {
  repository: PgKnowledgeRepository;
  service: KnowledgeService;
  chunker: SemanticChunker;
  adminController?: KnowledgeAdminController | undefined;
  adminRoutes?: RouteGroup | undefined;
}

export interface CreateKnowledgeModuleOptions {
  adminBasePath?: string | undefined;
  uploadLimiter?: RequestHandler | undefined;
}

export function createKnowledgeModule(
  db: Database,
  pythonAi: PythonAiClient,
  options?: CreateKnowledgeModuleOptions,
): KnowledgeModule {
  const repository = new PgKnowledgeRepository(db);
  const chunker = new SemanticChunker();
  const service = new KnowledgeService(repository, pythonAi, chunker);

  const adminController = createKnowledgeAdminController(service);
  const adminRoutes = options?.adminBasePath
    ? createKnowledgeAdminRoutes(options.adminBasePath, adminController, {
        uploadLimiter: options.uploadLimiter,
      })
    : undefined;

  return {
    repository,
    service,
    chunker,
    adminController,
    adminRoutes,
  };
}
