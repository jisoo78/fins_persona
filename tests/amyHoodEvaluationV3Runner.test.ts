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
import { readFileSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { EvaluationV3ReviewFile } from '../shared/amyHoodEvaluationV3';
import type {
  ModelClient,
  ModelInput,
} from '../server/personaPipeline/modelClient';
import { createEvaluationV3Runner } from '../server/evaluationV3/runner';
import { readEvaluationV3Run } from '../server/evaluationV3/runStore';

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
  const releaseRoot = join(
    root,
    'data/b-track/amy-hood/advisor/memory-releases/1.0.0',
  );
  await mkdir(releaseRoot, { recursive: true });
  await writeFile(
    join(root, 'data/b-track/amy-hood/advisor/memory-releases/active.json'),
    JSON.stringify({
      releaseId: 'memory-1.0.0',
      version: '1.0.0',
      manifestHash: 'memory-manifest-hash',
      activatedAt: '2026-07-15T00:00:00.000Z',
    }),
  );
  await writeFile(
    join(releaseRoot, 'evaluation-context.json'),
    JSON.stringify({
      releaseId: 'memory-1.0.0',
      counterexampleStatus: 'reviewed',
      policy: ['검증된 수요에 맞춰 투자를 단계화한다.'],
      reflections: ['판단 순서와 반전 신호를 함께 본다.'],
      events: ['비홀드아웃 승인 사건'],
      counterexamples: ['수요가 약해 집행을 늦춘 반례'],
    }),
  );
  return root;
};

test('happy: one repetition completes four pinned and objectively scored runs', async () => {
  const root = await createRunnerFixture();
  let calls = 0;
  const model = createModel(async () => {
    calls += 1;
    return '{"choice":1,"reason":"1번을 선택하며 검증된 수요를 우선합니다."}';
  });
  const runner = createEvaluationV3Runner({ root, createModel: () => model });
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
  assert.equal(completed.every(({ status, answers }) =>
    status === 'complete' && answers.length === 30), true);
  assert.equal(completed.every(({ scores }) =>
    scores.total === 7 && scores.percent === (7 / 30) * 100), true);
  assert.equal(completed[0].promptVersionId, null);
  assert.equal(completed[1].memoryReleaseId, null);
  assert.equal(completed[2].memoryReleaseId, 'memory-1.0.0');
});

test('edge: five repetitions keep stable order and make exactly 600 calls', async () => {
  const root = await createRunnerFixture();
  let calls = 0;
  const model = createModel(async () => {
    calls += 1;
    return '{"choice":2,"reason":"판단 기준상 2번을 선택합니다."}';
  });
  const runner = createEvaluationV3Runner({ root, createModel: () => model });
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
  const runner = createEvaluationV3Runner({ root, createModel: () => model });
  const launch = await runner.createExperiment({ repetitions: 1 });
  const target = launch.runs[0];
  const incomplete = await runner.executeRun(target.runId);
  assert.equal(incomplete.status, 'incomplete');
  assert.equal(incomplete.answers.filter(({ status }) => status === 'complete').length, 2);
  const preserved = incomplete.answers.slice(0, 2);

  recover = true;
  const completed = await runner.resumeRun(target.runId);
  assert.equal(completed.status, 'complete');
  assert.deepEqual(completed.answers.slice(0, 2), preserved);
  assert.equal(calls, 32);
});

test('edge: one failed arm does not block later arms', async () => {
  const root = await createRunnerFixture();
  const model = createModel(async (input) => {
    const text = inputText(input);
    if (/판단 정책:/.test(text) && !/성찰:/.test(text)) return 'malformed';
    return '{"choice":1,"reason":"우선순위에 따라 선택"}';
  });
  const runner = createEvaluationV3Runner({ root, createModel: () => model });
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
  const unapprovedRunner = createEvaluationV3Runner({
    root: unapprovedRoot,
    createModel: () => model,
  });
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
    /active memory release is required/,
  );

  const staleRoot = await createRunnerFixture();
  const staleRunner = createEvaluationV3Runner({ root: staleRoot, createModel: () => model });
  const launch = await staleRunner.createExperiment({ repetitions: 1 });
  await writeFile(
    join(staleRoot, 'agent_prompts/prompts/generic-cfo-control.md'),
    'changed generic prompt',
  );
  await assert.rejects(
    () => staleRunner.executeRun(launch.runs[0].runId),
    /generic CFO prompt hash is stale/,
  );
  assert.equal((await readEvaluationV3Run(staleRoot, launch.runs[0].runId)).status, 'queued');
  await assert.rejects(
    () => readEvaluationV3Run(staleRoot, '../unsafe'),
    /invalid Evaluation v3 run ID/,
  );
});
