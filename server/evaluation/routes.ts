import { randomUUID } from 'node:crypto';

import { Router, type NextFunction, type Request, type Response } from 'express';

import type {
  EvaluationBundle,
  EvaluationRunInput,
  EvaluationProvider,
  EvaluationRun,
  QuestionReview,
  QuestionReviewFile,
  SubjectiveGrade,
} from '../../shared/amyHoodEvaluation';
import { EVALUATION_MODEL_OPTIONS } from '../../shared/amyHoodEvaluation';
import { createModelClient } from '../personaPipeline/modelClient';
import {
  executeEventMatchingEvaluation,
  listEventMatchingRuns,
  loadEventMatchingEvaluation,
  readEventMatchingRun,
} from './eventMatchingRunner';
import {
  executeATrackCopyExperiment,
  listATrackCopyExperimentRuns,
  readATrackCopyExperimentRun,
} from './aTrackCopyExperimentRunner';
import { createEvaluationRunner } from './runner';
import { loadEvaluationBundle, loadQuestionReview, saveQuestionReview } from './questionSet';
import { listRuns, readRun } from './runStore';
import type {
  AmyHoodEventMatchingEvaluationFile,
  AmyHoodEventMatchingRun,
} from '../../shared/amyHoodEventMatchingEvaluation';
import type { AmyHoodATrackCopyExperimentRun } from '../../shared/amyHoodATrackCopyExperiment';

type EvaluationRunnerContract = {
  createEvaluationRun(input: EvaluationRunInput): Promise<EvaluationRun>;
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
  loadEventMatchingEvaluation?(): Promise<AmyHoodEventMatchingEvaluationFile>;
  listEventMatchingRuns?(): Promise<AmyHoodEventMatchingRun[]>;
  readEventMatchingRun?(runId: string): Promise<AmyHoodEventMatchingRun>;
  executeEventMatchingRun?(input: EvaluationRunInput & { runId?: string }): Promise<AmyHoodEventMatchingRun>;
  listATrackCopyExperimentRuns?(): Promise<AmyHoodATrackCopyExperimentRun[]>;
  readATrackCopyExperimentRun?(runId: string): Promise<AmyHoodATrackCopyExperimentRun>;
  executeATrackCopyExperiment?(input: EvaluationRunInput & { repetitions?: number; skipEvaluation?: boolean; runId?: string }): Promise<AmyHoodATrackCopyExperimentRun>;
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

const parseRunInput = (body: unknown): EvaluationRunInput => {
  const provider = body && typeof body === 'object' && 'provider' in body
    ? (body as { provider?: unknown }).provider
    : undefined;
  const model = body && typeof body === 'object' && 'model' in body
    ? (body as { model?: unknown }).model
    : undefined;
  if (provider !== 'local' && provider !== 'openai') {
    throw new Error('provider must be local or openai');
  }
  if (model !== undefined && typeof model !== 'string') {
    throw new Error('model must be a string');
  }
  const option = EVALUATION_MODEL_OPTIONS.find(
    (item) => item.provider === provider && (!model || item.model === model),
  );
  if (!option) throw new Error('unsupported evaluation model');
  return { provider, model: option.model };
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

  router.get(
    '/event-matching/questions',
    asyncHandler(async (_request, response) => {
      if (!dependencies.loadEventMatchingEvaluation) throw new Error('event matching evaluation is not configured');
      response.json({ ok: true, evaluation: await dependencies.loadEventMatchingEvaluation() });
    }),
  );

  router.get(
    '/event-matching/runs',
    asyncHandler(async (_request, response) => {
      if (!dependencies.listEventMatchingRuns) throw new Error('event matching runs are not configured');
      response.json({ ok: true, runs: await dependencies.listEventMatchingRuns() });
    }),
  );

  router.get(
    '/event-matching/runs/:id',
    asyncHandler(async (request, response) => {
      if (!dependencies.readEventMatchingRun) throw new Error('event matching runs are not configured');
      response.json({ ok: true, run: await dependencies.readEventMatchingRun(request.params.id) });
    }),
  );

  router.post(
    '/event-matching/runs',
    asyncHandler(async (request, response) => {
      if (!dependencies.executeEventMatchingRun) throw new Error('event matching runner is not configured');
      const input = parseRunInput(request.body);
      const pendingRunId = randomUUID();
      response.status(202).json({ ok: true, runId: pendingRunId });
      void dependencies.executeEventMatchingRun({ ...input, runId: pendingRunId }).catch((error) => {
        console.error('event matching evaluation failed', error);
      });
    }),
  );

  router.get(
    '/a-track-copy/runs',
    asyncHandler(async (_request, response) => {
      if (!dependencies.listATrackCopyExperimentRuns) throw new Error('A Track copy experiment is not configured');
      response.json({ ok: true, runs: await dependencies.listATrackCopyExperimentRuns() });
    }),
  );

  router.get(
    '/a-track-copy/runs/:id',
    asyncHandler(async (request, response) => {
      if (!dependencies.readATrackCopyExperimentRun) throw new Error('A Track copy experiment is not configured');
      response.json({ ok: true, run: await dependencies.readATrackCopyExperimentRun(request.params.id) });
    }),
  );

  router.post(
    '/a-track-copy/runs',
    asyncHandler(async (request, response) => {
      if (!dependencies.executeATrackCopyExperiment) throw new Error('A Track copy experiment runner is not configured');
      const input = parseRunInput(request.body);
      const repetitions = Number(request.body?.repetitions ?? 5);
      const skipEvaluation = Boolean(request.body?.skipEvaluation);
      const pendingRunId = randomUUID();
      response.status(202).json({ ok: true, runId: pendingRunId });
      void dependencies.executeATrackCopyExperiment({
        ...input,
        repetitions,
        skipEvaluation,
        runId: pendingRunId,
      }).catch((error) => {
        console.error('A Track copy experiment failed', error);
      });
    }),
  );

  router.post(
    '/runs',
    asyncHandler(async (request, response) => {
      const run = await dependencies.runner.createEvaluationRun(parseRunInput(request.body));
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
    loadEventMatchingEvaluation: () => loadEventMatchingEvaluation(root),
    listEventMatchingRuns: () => listEventMatchingRuns(root),
    readEventMatchingRun: (runId) => readEventMatchingRun(runId, root),
    executeEventMatchingRun: (input) => executeEventMatchingEvaluation(input, root),
    listATrackCopyExperimentRuns: () => listATrackCopyExperimentRuns(root),
    readATrackCopyExperimentRun: (runId) => readATrackCopyExperimentRun(runId, root),
    executeATrackCopyExperiment: (input) => executeATrackCopyExperiment(input, root),
    runner,
  };
};
