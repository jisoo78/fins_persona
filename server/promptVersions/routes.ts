import { Router, type NextFunction, type Request, type Response } from 'express';

import type {
  PromptVersionDetail,
  PromptVersionManifest,
} from '../../shared/amyHoodPromptVersion';
import {
  activatePromptVersion,
  createPromptVersion,
  listPromptVersions,
  readActivePromptVersion,
  readPromptVersion,
} from './store';

export type PromptVersionRouteDependencies = {
  list(): Promise<{ manifest: PromptVersionManifest; active: PromptVersionDetail }>;
  read(versionId: string): Promise<PromptVersionDetail>;
  create(input: {
    content: string;
    basedOnVersionId?: string | null;
  }): Promise<PromptVersionDetail>;
  activate(versionId: string): Promise<PromptVersionDetail>;
};

const asyncHandler = (
  handler: (request: Request, response: Response, next: NextFunction) => Promise<void>,
) => (request: Request, response: Response, next: NextFunction) => {
  void handler(request, response, next).catch(next);
};

const errorStatus = (error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  if (
    (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') ||
    /unknown prompt version/.test(message)
  ) {
    return 404;
  }
  return 400;
};

export const createPromptVersionRouter = (
  dependencies: PromptVersionRouteDependencies,
) => {
  const router = Router();
  router.get(
    '/',
    asyncHandler(async (_request, response) => {
      response.json({ ok: true, ...(await dependencies.list()) });
    }),
  );
  router.get(
    '/:id',
    asyncHandler(async (request, response) => {
      response.json({ ok: true, version: await dependencies.read(request.params.id) });
    }),
  );
  router.post(
    '/',
    asyncHandler(async (request, response) => {
      response.status(201).json({
        ok: true,
        version: await dependencies.create(request.body ?? {}),
      });
    }),
  );
  router.post(
    '/:id/activate',
    asyncHandler(async (request, response) => {
      response.json({
        ok: true,
        version: await dependencies.activate(request.params.id),
      });
    }),
  );
  router.use(
    (error: unknown, _request: Request, response: Response, _next: NextFunction) => {
      response.status(errorStatus(error)).json({
        ok: false,
        message: error instanceof Error ? error.message : 'Unknown prompt version error',
      });
    },
  );
  return router;
};

export const createPromptVersionRouteDependencies = (
  root: string,
): PromptVersionRouteDependencies => ({
  list: async () => ({
    manifest: await listPromptVersions(root),
    active: await readActivePromptVersion(root),
  }),
  read: (versionId) => readPromptVersion(root, versionId),
  create: (input) => createPromptVersion(root, input),
  activate: (versionId) => activatePromptVersion(root, versionId),
});
