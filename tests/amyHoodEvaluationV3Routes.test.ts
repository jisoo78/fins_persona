/**
 * Test Plan:
 * 1. Happy Path:
 *    - v3 questions, runs, experiment, resume, and report routes work without changing v2 paths.
 *
 * 2. Edge Cases:
 *    - Korean review text is preserved by the typed client and route.
 *    - one repetition is accepted and launches four runs.
 *    - five repetitions are accepted and launch twenty runs.
 *
 * 3. Failure Path:
 *    - invalid repetitions, non-local providers, missing IDs, and empty or non-JSON responses fail safely.
 */
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import test from 'node:test';

import {
  EVALUATION_V3_ARMS,
  type EvaluationV3ExperimentLaunch,
  type EvaluationV3Repetitions,
  type EvaluationV3ReviewFile,
  type EvaluationV3Run,
} from '../shared/amyHoodEvaluationV3';
import { createEvaluationV3Router } from '../server/evaluationV3/routes';
import { loadEvaluationV3Bundle } from '../server/evaluationV3/questionSet';
import {
  createEvaluationV3Experiment,
  fetchEvaluationV3Questions,
  fetchEvaluationV3Report,
  saveEvaluationV3QuestionReview,
} from '../src/services/evaluationApi';

const makeRun = (
  arm: EvaluationV3Run['arm'],
  repetition: EvaluationV3Run['repetition'],
): EvaluationV3Run => ({
  runId: `${arm}-${repetition}`,
  version: '3.0.0',
  experimentGroupId: 'group-1',
  repetition,
  arm,
  provider: 'local',
  model: 'gemma4-test',
  questionSetVersion: '3.0.0',
  answerKeyHash: 'answer-hash',
  promptVersionId: arm === 'generic_cfo' ? null : 'prompt-1',
  promptHash: 'prompt-hash',
  memoryReleaseId: arm.endsWith('_rag') ? 'memory-1' : null,
  memoryReleaseHash: arm.endsWith('_rag') ? 'memory-hash' : null,
  holdoutManifestHash: 'holdout-hash',
  status: 'queued',
  answers: [],
  scores: {
    discrimination: 0,
    holdout: 0,
    counterfactual: 0,
    transfer: 0,
    total: 0,
    percent: 0,
  },
  startedAt: '2026-07-15T00:00:00.000Z',
  completedAt: null,
});

const launch = (repetitions: EvaluationV3Repetitions): EvaluationV3ExperimentLaunch => ({
  experimentGroupId: 'group-1',
  repetitions,
  runs: Array.from({ length: repetitions }, (_, index) =>
    EVALUATION_V3_ARMS.map((arm) =>
      makeRun(arm, (index + 1) as EvaluationV3Run['repetition']))).flat(),
});

const createFixture = async () => {
  const bundle = await loadEvaluationV3Bundle(process.cwd());
  let reviews: EvaluationV3ReviewFile = {
    questionSetVersion: '3.0.0',
    reviews: bundle.questions.questions.map(({ id }) => ({
      questionId: id,
      status: 'approved',
      revisionNote: '',
      reviewedAt: '2026-07-15T00:00:00.000Z',
    })),
  };
  const executions: string[][] = [];
  const dependencies = {
    loadBundle: async () => bundle,
    loadReviews: async () => reviews,
    loadReadiness: async () => ({
      allApproved: true,
      structuredMemoryAvailable: true,
    }),
    saveReview: async (
      questionId: string,
      input: { status: 'unreviewed' | 'approved' | 'revision_required'; revisionNote: string },
    ) => {
      reviews = {
        ...reviews,
        reviews: reviews.reviews.map((review) => review.questionId === questionId
          ? { ...review, ...input, reviewedAt: '2026-07-15T01:00:00.000Z' }
          : review),
      };
      return reviews;
    },
    listRuns: async () => launch(1).runs,
    readRun: async (runId: string) => {
      const found = launch(1).runs.find((run) => run.runId === runId);
      if (!found) throw new Error(`unknown Evaluation v3 run: ${runId}`);
      return found;
    },
    loadReport: async (groupId: string) => {
      if (groupId !== 'group-1') throw new Error(`unknown Evaluation v3 group: ${groupId}`);
      return { experimentGroupId: groupId, benchmarkRejected: false } as never;
    },
    runner: {
      createExperiment: async ({ repetitions }: { repetitions: EvaluationV3Repetitions }) =>
        launch(repetitions),
      executeExperiment: async (runIds: string[]) => {
        executions.push(runIds);
        return launch(runIds.length === 4 ? 1 : 5).runs;
      },
      resumeRun: async (runId: string) => ({
        ...(await dependencies.readRun(runId)),
        status: 'complete' as const,
      }),
    },
  };
  const app = express();
  app.use(express.json());
  app.use('/api/evaluation/v3', createEvaluationV3Router(dependencies));
  const server = app.listen(0);
  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const prefixedFetch: typeof fetch = (input, init) =>
    fetch(`${baseUrl}${String(input)}`, init);
  return { server, baseUrl, prefixedFetch, executions };
};

test('happy: separate v3 router exposes questions, runs, resume, and report', async () => {
  const fixture = await createFixture();
  try {
    const questions = await fetchEvaluationV3Questions(fixture.prefixedFetch);
    assert.equal(questions.questions.questions.length, 30);
    assert.equal((await fetch(`${fixture.baseUrl}/api/evaluation/v3/runs`)).status, 200);
    assert.equal(
      (await fetch(`${fixture.baseUrl}/api/evaluation/v3/runs/generic_cfo-1`)).status,
      200,
    );
    assert.equal(
      (await fetch(`${fixture.baseUrl}/api/evaluation/v3/runs/generic_cfo-1/resume`, {
        method: 'POST',
      })).status,
      202,
    );
    const report = await fetchEvaluationV3Report('group-1', fixture.prefixedFetch);
    assert.equal(report.report.experimentGroupId, 'group-1');
    assert.equal((await fetch(`${fixture.baseUrl}/api/evaluation/questions`)).status, 404);
  } finally {
    fixture.server.close();
  }
});

test('edge: Korean review text survives the typed client and route', async () => {
  const fixture = await createFixture();
  try {
    const note = '정책 적용 전 수요 검증 조건을 더 구체화합니다.';
    const response = await saveEvaluationV3QuestionReview(
      'D01',
      { status: 'revision_required', revisionNote: note },
      fixture.prefixedFetch,
    );
    assert.equal(
      response.reviews.reviews.find(({ questionId }) => questionId === 'D01')?.revisionNote,
      note,
    );
  } finally {
    fixture.server.close();
  }
});

test('edge: one repetition launches four runs', async () => {
  const fixture = await createFixture();
  try {
    const response = await createEvaluationV3Experiment(1, fixture.prefixedFetch);
    assert.equal(response.runs.length, 4);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fixture.executions[0].length, 4);
  } finally {
    fixture.server.close();
  }
});

test('edge: five repetitions launch twenty stable runs', async () => {
  const fixture = await createFixture();
  try {
    const response = await createEvaluationV3Experiment(5, fixture.prefixedFetch);
    assert.equal(response.runs.length, 20);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fixture.executions[0].length, 20);
  } finally {
    fixture.server.close();
  }
});

test('failure: invalid requests and malformed proxy responses fail safely', async () => {
  const fixture = await createFixture();
  try {
    const invalidRepetitions = await fetch(`${fixture.baseUrl}/api/evaluation/v3/experiments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'local', repetitions: 2 }),
    });
    assert.equal(invalidRepetitions.status, 400);
    const invalidProvider = await fetch(`${fixture.baseUrl}/api/evaluation/v3/experiments`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'openai', repetitions: 1 }),
    });
    assert.equal(invalidProvider.status, 400);
    assert.equal(
      (await fetch(`${fixture.baseUrl}/api/evaluation/v3/runs/missing`)).status,
      404,
    );
    assert.equal(
      (await fetch(`${fixture.baseUrl}/api/evaluation/v3/reports/missing`)).status,
      404,
    );
    await assert.rejects(
      () => fetchEvaluationV3Questions(async () =>
        new Response('', { status: 502 }) as never),
      /empty response/,
    );
    await assert.rejects(
      () => fetchEvaluationV3Questions(async () =>
        new Response('gateway failure', { status: 502 }) as never),
      /gateway failure/,
    );
  } finally {
    fixture.server.close();
  }
});
