import { Router, type NextFunction, type Request, type Response } from 'express';

import type {
  EvaluationV3ExperimentLaunch,
  EvaluationV3ExperimentReport,
  EvaluationV3Repetitions,
  EvaluationV3Review,
  EvaluationV3ReviewFile,
  EvaluationV3Run,
} from '../../shared/amyHoodEvaluationV3';
import { createModelClient } from '../personaPipeline/modelClient';
import { resolveEvaluationV3ArmContext } from './context';
import { loadEvaluationV3Holdout } from './holdout';
import { loadEvaluationV3Bundle, loadEvaluationV3Reviews, saveEvaluationV3Review } from './questionSet';
import { buildEvaluationV3ExperimentReport } from './report';
import { createEvaluationV3Runner } from './runner';
import { listEvaluationV3Runs, readEvaluationV3Run } from './runStore';

type EvaluationV3RunnerContract = {
  createExperiment(input: {
    repetitions: EvaluationV3Repetitions;
  }): Promise<EvaluationV3ExperimentLaunch>;
  executeExperiment(runIds: string[]): Promise<EvaluationV3Run[]>;
  resumeRun(runId: string): Promise<EvaluationV3Run>;
};

export type EvaluationV3RouteDependencies = {
  loadBundle(): ReturnType<typeof loadEvaluationV3Bundle>;
  loadReviews(): Promise<EvaluationV3ReviewFile>;
  loadReadiness(): Promise<{
    allApproved: boolean;
    structuredMemoryAvailable: boolean;
  }>;
  saveReview(
    questionId: string,
    input: Pick<EvaluationV3Review, 'status' | 'revisionNote'>,
  ): Promise<EvaluationV3ReviewFile>;
  listRuns(): Promise<EvaluationV3Run[]>;
  readRun(runId: string): Promise<EvaluationV3Run>;
  loadReport(groupId: string): Promise<EvaluationV3ExperimentReport>;
  runner: EvaluationV3RunnerContract;
};

const asyncHandler = (
  handler: (request: Request, response: Response, next: NextFunction) => Promise<void>,
) => (request: Request, response: Response, next: NextFunction) => {
  void handler(request, response, next).catch(next);
};

const errorStatus = (error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  if ((error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')
    || /unknown Evaluation v3 (?:run|group|question)|invalid Evaluation v3 run ID/.test(message)) {
    return 404;
  }
  return 400;
};

export const createEvaluationV3Router = (
  dependencies: EvaluationV3RouteDependencies,
) => {
  const router = Router();

  router.get('/questions', asyncHandler(async (_request, response) => {
    const [bundle, reviews, readiness] = await Promise.all([
      dependencies.loadBundle(),
      dependencies.loadReviews(),
      dependencies.loadReadiness(),
    ]);
    response.json({ ok: true, ...bundle, reviews, readiness });
  }));

  router.patch('/questions/:id/review', asyncHandler(async (request, response) => {
    const reviews = await dependencies.saveReview(request.params.id, request.body);
    response.json({ ok: true, reviews });
  }));

  router.get('/runs', asyncHandler(async (_request, response) => {
    response.json({ ok: true, runs: await dependencies.listRuns() });
  }));

  router.get('/runs/:id', asyncHandler(async (request, response) => {
    response.json({ ok: true, run: await dependencies.readRun(request.params.id) });
  }));

  router.post('/experiments', asyncHandler(async (request, response) => {
    if (request.body?.provider !== 'local') {
      throw new Error('Evaluation v3 experiments require the local provider');
    }
    const repetitions = request.body?.repetitions;
    if (repetitions !== 1 && repetitions !== 5) {
      throw new Error('evaluation v3 repetitions must be 1 or 5');
    }
    const launch = await dependencies.runner.createExperiment({ repetitions });
    response.status(202).json({ ok: true, ...launch });
    void dependencies.runner
      .executeExperiment(launch.runs.map(({ runId }) => runId))
      .catch((error) => console.error('Evaluation v3 experiment failed', error));
  }));

  router.post('/runs/:id/resume', asyncHandler(async (request, response) => {
    const run = await dependencies.readRun(request.params.id);
    response.status(202).json({ ok: true, run: { ...run, status: 'queued' } });
    void dependencies.runner
      .resumeRun(request.params.id)
      .catch((error) => console.error('Evaluation v3 resume failed', error));
  }));

  router.get('/reports/:groupId', asyncHandler(async (request, response) => {
    response.json({
      ok: true,
      report: await dependencies.loadReport(request.params.groupId),
    });
  }));

  router.use((
    error: unknown,
    _request: Request,
    response: Response,
    _next: NextFunction,
  ) => {
    response.status(errorStatus(error)).json({
      ok: false,
      message: error instanceof Error ? error.message : 'Unknown Evaluation v3 error',
    });
  });

  return router;
};

export const createEvaluationV3RouteDependencies = (
  root: string,
): EvaluationV3RouteDependencies => {
  const runner = createEvaluationV3Runner({
    root,
    createModel: () => createModelClient('local'),
  });
  return {
    loadBundle: () => loadEvaluationV3Bundle(root),
    loadReviews: () => loadEvaluationV3Reviews(root),
    loadReadiness: async () => {
      const reviews = await loadEvaluationV3Reviews(root);
      let structuredMemoryAvailable = false;
      try {
        await Promise.all([
          resolveEvaluationV3ArmContext(root, 'amy_policy_rag'),
          resolveEvaluationV3ArmContext(root, 'amy_full_rag'),
        ]);
        structuredMemoryAvailable = true;
      } catch {
        structuredMemoryAvailable = false;
      }
      return {
        allApproved: reviews.reviews.length === 30
          && reviews.reviews.every(({ status }) => status === 'approved'),
        structuredMemoryAvailable,
      };
    },
    saveReview: (questionId, input) => saveEvaluationV3Review(root, questionId, input),
    listRuns: () => listEvaluationV3Runs(root),
    readRun: (runId) => readEvaluationV3Run(root, runId),
    loadReport: async (groupId) => {
      const runs = (await listEvaluationV3Runs(root))
        .filter(({ experimentGroupId }) => experimentGroupId === groupId);
      if (runs.length === 0) throw new Error(`unknown Evaluation v3 group: ${groupId}`);
      return buildEvaluationV3ExperimentReport(
        runs,
        await loadEvaluationV3Holdout(root),
      );
    },
    runner,
  };
};
