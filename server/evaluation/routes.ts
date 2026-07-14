import { Router, type NextFunction, type Request, type Response } from 'express';

import type {
  EvaluationBundle,
  EvaluationProvider,
  EvaluationRun,
  QuestionReview,
  QuestionReviewFile,
  SubjectiveGrade,
} from '../../shared/amyHoodEvaluation';
import { createModelClient } from '../personaPipeline/modelClient';
import { createEvaluationRunner } from './runner';
import { loadEvaluationBundle, loadQuestionReview, saveQuestionReview } from './questionSet';
import { listRuns, readRun } from './runStore';

type EvaluationRunnerContract = {
  createEvaluationRun(input: { provider: EvaluationProvider }): Promise<EvaluationRun>;
  executeEvaluationRun(runId: string): Promise<EvaluationRun>;
  resumeEvaluationRun(runId: string): Promise<EvaluationRun>;
  applySubjectiveGrades(
    runId: string,
    grades: SubjectiveGrade[],
  ): Promise<EvaluationRun>;
};

export type EvaluationRouteDependencies = {
  loadBundle(): Promise<EvaluationBundle>;
  loadReviews(): Promise<QuestionReviewFile>;
  saveReview(
    questionId: string,
    input: Pick<QuestionReview, 'status' | 'revisionNote'>,
  ): Promise<QuestionReviewFile>;
  listRuns(): Promise<EvaluationRun[]>;
  readRun(runId: string): Promise<EvaluationRun>;
  runner: EvaluationRunnerContract;
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
    /unknown evaluation question|evaluation run ID/.test(message)
  ) {
    return 404;
  }
  return 400;
};

export const createEvaluationRouter = (
  dependencies: EvaluationRouteDependencies,
) => {
  const router = Router();

  router.get(
    '/questions',
    asyncHandler(async (_request, response) => {
      const bundle = await dependencies.loadBundle();
      const reviews = await dependencies.loadReviews();
      response.json({ ok: true, ...bundle, reviews });
    }),
  );

  router.patch(
    '/questions/:id/review',
    asyncHandler(async (request, response) => {
      const reviews = await dependencies.saveReview(request.params.id, request.body);
      response.json({ ok: true, reviews });
    }),
  );

  router.get(
    '/runs',
    asyncHandler(async (_request, response) => {
      response.json({ ok: true, runs: await dependencies.listRuns() });
    }),
  );

  router.get(
    '/runs/:id',
    asyncHandler(async (request, response) => {
      response.json({ ok: true, run: await dependencies.readRun(request.params.id) });
    }),
  );

  router.post(
    '/runs',
    asyncHandler(async (request, response) => {
      const provider = request.body?.provider;
      if (provider !== 'local' && provider !== 'openai') {
        throw new Error('provider must be local or openai');
      }
      const run = await dependencies.runner.createEvaluationRun({ provider });
      response.status(202).json({ ok: true, run });
      void dependencies.runner
        .executeEvaluationRun(run.runId)
        .catch((error) => console.error('evaluation run failed', error));
    }),
  );

  router.post(
    '/runs/:id/resume',
    asyncHandler(async (request, response) => {
      const run = await dependencies.readRun(request.params.id);
      response.status(202).json({ ok: true, run: { ...run, status: 'queued' } });
      void dependencies.runner
        .resumeEvaluationRun(request.params.id)
        .catch((error) => console.error('evaluation resume failed', error));
    }),
  );

  router.post(
    '/runs/:id/subjective-grades',
    asyncHandler(async (request, response) => {
      if (!Array.isArray(request.body?.grades)) {
        throw new Error('grades array is required');
      }
      const run = await dependencies.runner.applySubjectiveGrades(
        request.params.id,
        request.body.grades,
      );
      response.json({ ok: true, run });
    }),
  );

  router.use(
    (error: unknown, _request: Request, response: Response, _next: NextFunction) => {
      response.status(errorStatus(error)).json({
        ok: false,
        message: error instanceof Error ? error.message : 'Unknown evaluation error',
      });
    },
  );
  return router;
};

export const createEvaluationRouteDependencies = (
  root: string,
): EvaluationRouteDependencies => {
  const runner = createEvaluationRunner({ root, createModel: createModelClient });
  return {
    loadBundle: () => loadEvaluationBundle(root),
    loadReviews: () => loadQuestionReview(root),
    saveReview: (questionId, input) => saveQuestionReview(root, questionId, input),
    listRuns: () => listRuns(root),
    readRun: (runId) => readRun(root, runId),
    runner,
  };
};
