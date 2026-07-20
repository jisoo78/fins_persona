/**
 * Test Plan:
 * 1. Happy Path:
 *    - one repetition creates and completes four pinned runs with thirty scored choices each.
 *
 * 2. Edge Cases:
 *    - five repetitions preserve repetition-then-arm order, unique IDs, and 600 model calls.
 *    - resume keeps completed answers and starts at the first failed question.
 *    - a failed arm does not block later arms in the same repetition.
 *
 * 3. Failure Path:
 *    - unapproved bundles, stale prompts, missing memory, unsafe IDs, and repeated malformed output fail without corrupting sibling runs.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { EvaluationV3ReviewFile } from '../shared/amyHoodEvaluationV3';
import type { AmyHoodRetrievalResult } from '../shared/amyHoodRag';
import type {
  ModelClient,
  ModelInput,
} from '../server/personaPipeline/modelClient';
import { createEvaluationV3Runner } from '../server/evaluationV3/runner';
import {
  listEvaluationV3Runs,
  readEvaluationV3Run,
  writeEvaluationV3Run,
} from '../server/evaluationV3/runStore';
import { writeEvaluationV3MemoryFixture } from './helpers/evaluationV3MemoryFixture';

const validPersonaPrompt = `# Amy Hood Public-Evidence CFO Persona
## Role
## Identity
## Decision Principles
## Cross-Dimension Rules
## Red Lines
## Communication Style
## Unknown Policy
## Response Format`;

const inputText = (input: ModelInput) =>
  typeof input === 'string' ? input : `${input.system}\n${input.user}`;

const createModel = (
  handler: (input: ModelInput) => Promise<string>,
): ModelClient => ({
  provider: 'local',
  model: 'gemma4-evaluation-v3-test',
  cacheKey: 'evaluation-v3-test-v1',
  invoke: async (input) => ({
    text: await handler(input),
    elapsedMs: 2,
    inputTokens: 10,
    outputTokens: 5,
  }),
});

const copyJson = async (root: string, relativePath: string) => {
  const destination = join(root, relativePath);
  await mkdir(join(destination, '..'), { recursive: true });
  await writeFile(destination, readFileSync(join(process.cwd(), relativePath), 'utf8'));
};

const createRunnerFixture = async (approved = true) => {
  const root = await mkdtemp(join(tmpdir(), 'evaluation-v3-runner-'));
  for (const path of [
    'evaluation/v3/public/questions.json',
    'evaluation/v3/sealed/answer-key.json',
    'evaluation/v3/sealed/holdout-manifest.json',
  ]) {
    await copyJson(root, path);
  }
  const reviews = JSON.parse(
    readFileSync(join(process.cwd(), 'evaluation/v3/public/reviews.json'), 'utf8'),
  ) as EvaluationV3ReviewFile;
  if (approved) {
    reviews.reviews = reviews.reviews.map((review) => ({
      ...review,
      status: 'approved',
      reviewedAt: '2026-07-15T00:00:00.000Z',
    }));
  } else {
    reviews.reviews = reviews.reviews.map((review, index) => index === 0
      ? {
          ...review,
          status: 'unreviewed',
          reviewedAt: null,
        }
      : review);
  }
  await mkdir(join(root, 'evaluation/v3/public'), { recursive: true });
  await writeFile(
    join(root, 'evaluation/v3/public/reviews.json'),
    JSON.stringify(reviews),
  );
  await mkdir(join(root, 'data/b-track/amy-hood'), { recursive: true });
  await writeFile(
    join(root, 'data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md'),
    validPersonaPrompt,
  );
  await mkdir(join(root, 'agent_prompts/prompts'), { recursive: true });
  await writeFile(
    join(root, 'agent_prompts/prompts/generic-cfo-control.md'),
    'You are a general CFO advisor.',
  );
  await writeEvaluationV3MemoryFixture(root, {
    counterexampleStatus: 'reviewed',
    references: [{ artifactClass: 'candidate', id: 'candidate-openai-expansion-2023' }],
    policy: ['검증된 수요에 맞춰 투자를 단계화한다.'],
    reflections: ['판단 순서와 반전 신호를 함께 본다.'],
    events: ['비홀드아웃 승인 사건'],
    counterexamples: ['수요가 약해 집행을 늦춘 반례'],
  });
  return root;
};

const activeIndexHash = 'a'.repeat(64);
const retrievalConfigHash = 'b'.repeat(64);

const createTestRunner = ({
  root,
  model,
  onQuery = () => undefined,
  loadRagPin,
  retrievalError,
  contextError,
}: {
  root: string;
  model: ModelClient;
  onQuery?: (query: string) => void;
  loadRagPin?: () => Promise<{
    memoryReleaseId: string;
    memoryReleaseHash: string;
    memoryIndexHash: string;
    retrievalConfigHash: string;
  }>;
  retrievalError?: string;
  contextError?: string;
}) => createEvaluationV3Runner({
  root,
  createModel: () => model,
  loadRagPin: loadRagPin ?? (async () => ({
    memoryReleaseId: 'v1-aaaaaaaaaaaa',
    memoryReleaseHash: 'c'.repeat(64),
    memoryIndexHash: activeIndexHash,
    retrievalConfigHash,
  })),
  createRetriever: async () => ({
    retrieve: async ({ query, indexHash }) => {
      onQuery(query);
      if (retrievalError) throw new Error(retrievalError);
      const result: AmyHoodRetrievalResult = {
        query,
        matches: [{
          id: 'policy-fixture',
          kind: 'policy',
          vectorScore: 0.8,
          lexicalScore: 0.4,
          fusedScore: 0.68,
        }],
        trace: {
          queryHash: createHash('sha256').update(query).digest('hex'),
          indexHash,
          retrievalConfigHash,
          cacheKey: `cache-${Buffer.from(query).toString('base64url')}`,
          selectedArtifacts: [],
          noMatch: false,
          noMatchReason: null,
        },
      };
      return result;
    },
  }),
  buildContext: async ({ retrieval, projection }) => ({
    ...(() => {
      if (contextError) throw new Error(contextError);
      return {};
    })(),
    projection,
    text: projection === 'policy'
      ? '[Retrieved Policy: policy-fixture]\nPriority order: demand > urgency'
      : '[Retrieved Policy: policy-fixture]\nPriority order: demand > urgency\nDecision axis: capacity',
    trace: {
      ...retrieval.trace,
      expandedArtifactIds: ['policy-fixture'],
      evidenceIds: ['evidence-fixture'],
      sourceIds: ['source-fixture'],
      contextTokens: 120,
      requestTokens: 800,
      tokenCounter: 'conservative_estimator',
      contextHash: 'e'.repeat(64),
    },
  }),
});

test('happy: one repetition completes four pinned and objectively scored runs', async () => {
  const root = await createRunnerFixture();
  let calls = 0;
  const queries: string[] = [];
  const model = createModel(async () => {
    calls += 1;
    return '{"choice":1,"reason":"1번을 선택하며 검증된 수요를 우선합니다."}';
  });
  const runner = createTestRunner({ root, model, onQuery: (query) => queries.push(query) });
  const launch = await runner.createExperiment({ repetitions: 1 });
  assert.deepEqual(launch.runs.map(({ arm }) => arm), [
    'generic_cfo',
    'amy_prompt',
    'amy_policy_rag',
    'amy_full_rag',
  ]);

  const completed = await runner.executeExperiment(
    launch.runs.map(({ runId }) => runId),
  );
  assert.equal(calls, 120);
  assert.equal(queries.length, 30);
  assert.equal(completed.every(({ status, answers }) =>
    status === 'complete' && answers.length === 30), true);
  assert.equal(completed.every(({ scores }) =>
    scores.total === 7 && scores.percent === (7 / 30) * 100), true);
  assert.equal(completed[0].promptVersionId, null);
  assert.equal(completed[1].memoryReleaseId, null);
  assert.equal(completed[2].memoryReleaseId, 'v1-aaaaaaaaaaaa');
  assert.equal(completed[0].memoryIndexHash, null);
  assert.equal(completed[2].memoryIndexHash, activeIndexHash);
  assert.equal(completed[2].answers.every(({ retrieval }) => Boolean(retrieval)), true);
  assert.deepEqual(
    completed[2].answers.map(({ retrieval }) => retrieval?.cacheKey),
    completed[3].answers.map(({ retrieval }) => retrieval?.cacheKey),
  );
  assert.equal(queries.some((query) => /D01|correctChoice|correctIntent/.test(query)), false);
});

test('edge: five repetitions keep stable order and make exactly 600 calls', async () => {
  const root = await createRunnerFixture();
  let calls = 0;
  const model = createModel(async () => {
    calls += 1;
    return '{"choice":2,"reason":"판단 기준상 2번을 선택합니다."}';
  });
  const runner = createTestRunner({ root, model });
  const launch = await runner.createExperiment({ repetitions: 5 });
  assert.equal(launch.runs.length, 20);
  assert.equal(new Set(launch.runs.map(({ runId }) => runId)).size, 20);
  assert.deepEqual(
    launch.runs.slice(4, 8).map(({ repetition, arm }) => [repetition, arm]),
    [
      [2, 'generic_cfo'],
      [2, 'amy_prompt'],
      [2, 'amy_policy_rag'],
      [2, 'amy_full_rag'],
    ],
  );
  await runner.executeExperiment(launch.runs.map(({ runId }) => runId));
  assert.equal(calls, 600);
  await writeEvaluationV3Run(root, {
    ...launch.runs[0],
    startedAt: '2030-01-01T00:00:00.000Z',
  });
  assert.equal((await listEvaluationV3Runs(root))[0].runId, launch.runs[0].runId);
});

test('edge: resume preserves completed answers and restarts at the failed question', async () => {
  const root = await createRunnerFixture();
  let calls = 0;
  let recover = false;
  const model = createModel(async () => {
    calls += 1;
    if (!recover && calls >= 3) return 'malformed';
    return '{"choice":1,"reason":"완료된 판단"}';
  });
  const runner = createTestRunner({ root, model });
  const launch = await runner.createExperiment({ repetitions: 1 });
  const target = launch.runs[0];
  const incomplete = await runner.executeRun(target.runId);
  assert.equal(incomplete.status, 'incomplete');
  assert.equal(incomplete.answers.filter(({ status }) => status === 'complete').length, 2);
  const preserved = incomplete.answers.slice(0, 2);

  recover = true;
  const attempts = await Promise.allSettled([
    runner.resumeRun(target.runId),
    runner.resumeRun(target.runId),
  ]);
  const completed = attempts.find((attempt) => attempt.status === 'fulfilled');
  const rejected = attempts.find((attempt) => attempt.status === 'rejected');
  assert.ok(completed && completed.status === 'fulfilled');
  assert.ok(rejected && rejected.status === 'rejected');
  assert.match(String(rejected.reason), /already executing|only incomplete/);
  assert.equal(completed.value.status, 'complete');
  assert.deepEqual(completed.value.answers.slice(0, 2), preserved);
  assert.equal(calls, 32);
});

test('edge: one failed arm does not block later arms', async () => {
  const root = await createRunnerFixture();
  const model = createModel(async (input) => {
    const text = inputText(input);
    if (/\[Retrieved Policy:/.test(text) && !/Decision axis:/.test(text)) return 'malformed';
    return '{"choice":1,"reason":"우선순위에 따라 선택"}';
  });
  const runner = createTestRunner({ root, model });
  const launch = await runner.createExperiment({ repetitions: 1 });
  const runs = await runner.executeExperiment(launch.runs.map(({ runId }) => runId));
  assert.deepEqual(runs.map(({ status }) => status), [
    'complete',
    'complete',
    'incomplete',
    'complete',
  ]);
});

test('failure: preflight and pinned-artifact failures leave safe run state', async () => {
  const unapprovedRoot = await createRunnerFixture(false);
  const model = createModel(async () => '{"choice":1,"reason":"선택"}');
  const unapprovedRunner = createTestRunner({ root: unapprovedRoot, model });
  await assert.rejects(
    () => unapprovedRunner.createExperiment({ repetitions: 1 }),
    /all Evaluation v3 questions must be approved/,
  );

  const missingMemoryRoot = await createRunnerFixture();
  await rm(
    join(missingMemoryRoot, 'data/b-track/amy-hood/advisor/memory-releases/active.json'),
  );
  await assert.rejects(
    () => createEvaluationV3Runner({ root: missingMemoryRoot, createModel: () => model })
      .createExperiment({ repetitions: 1 }),
    /active Amy Hood memory index|active memory release/,
  );

  const staleRoot = await createRunnerFixture();
  let staleIndexHash = activeIndexHash;
  const staleRunner = createTestRunner({
    root: staleRoot,
    model,
    loadRagPin: async () => ({
      memoryReleaseId: 'v1-aaaaaaaaaaaa',
      memoryReleaseHash: 'c'.repeat(64),
      memoryIndexHash: staleIndexHash,
      retrievalConfigHash,
    }),
  });
  const launch = await staleRunner.createExperiment({ repetitions: 1 });
  await writeFile(
    join(staleRoot, 'agent_prompts/prompts/generic-cfo-control.md'),
    'changed generic prompt',
  );
  await assert.rejects(
    () => staleRunner.executeRun(launch.runs[0].runId),
    /generic CFO prompt hash is stale/,
  );
  const stalePromptRun = await readEvaluationV3Run(staleRoot, launch.runs[0].runId);
  assert.equal(stalePromptRun.status, 'incomplete');
  assert.equal(stalePromptRun.runError?.code, 'artifact_stale');
  assert.equal(stalePromptRun.runError?.retryable, false);

  staleIndexHash = 'f'.repeat(64);
  await assert.rejects(
    () => staleRunner.executeRun(launch.runs[2].runId),
    /dynamic memory index is stale/,
  );

  const questionRoot = await createRunnerFixture();
  const questionRunner = createTestRunner({ root: questionRoot, model });
  const questionLaunch = await questionRunner.createExperiment({ repetitions: 1 });
  const questionPath = join(questionRoot, 'evaluation/v3/public/questions.json');
  const questionFile = JSON.parse(readFileSync(questionPath, 'utf8')) as {
    questions: Array<{ prompt: string }>;
  };
  questionFile.questions[0].prompt += ' 변경';
  await writeFile(questionPath, JSON.stringify(questionFile));
  await assert.rejects(
    () => questionRunner.executeRun(questionLaunch.runs[0].runId),
    /question set hash is stale/,
  );
  const invalidated = await questionRunner.executeExperiment(
    questionLaunch.runs.map(({ runId }) => runId),
  );
  assert.equal(invalidated[0].runError?.code, 'artifact_stale');
  assert.equal(invalidated[0].runError?.retryable, false);
  await assert.rejects(
    () => readEvaluationV3Run(staleRoot, '../unsafe'),
    /invalid Evaluation v3 run ID/,
  );
});

test('failure: retrieval and request-budget errors never degrade a RAG arm to prompt-only', async () => {
  for (const failure of [
    { retrievalError: 'BGE-M3 request timed out after 30000ms' },
    { contextError: 'complete model request exceeds 12000 tokens' },
  ]) {
    const root = await createRunnerFixture();
    let modelCalls = 0;
    const model = createModel(async () => {
      modelCalls += 1;
      return '{"choice":1,"reason":"should not run"}';
    });
    const runner = createTestRunner({ root, model, ...failure });
    const launch = await runner.createExperiment({ repetitions: 1 });
    const run = await runner.executeRun(launch.runs[2].runId);
    assert.equal(run.status, 'incomplete');
    assert.equal(run.answers[0].status, 'failed');
    assert.match(run.answers[0].error ?? '', /timed out|12000 tokens/);
    assert.equal(modelCalls, 0);
  }
});
