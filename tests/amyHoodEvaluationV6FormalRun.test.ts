/**
 * Test Plan:
 * 1. Happy Path:
 *    - Complete answers, five individual Judge repetitions, formal activation, pair Judge, and report in order.
 * 2. Edge Cases:
 *    - Resume after answers complete without regenerating candidate answers.
 *    - Resume after two Judge repetitions without regrading completed packets.
 *    - Reuse an explicitly selected existing experiment group instead of creating a new group.
 * 3. Failure Path:
 *    - Reject changed service identity while preserving the last valid checkpoint.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  runEvaluationV6FormalWorkflow,
  type EvaluationV6FormalCheckpoint,
  type EvaluationV6FormalWorkflowDeps,
} from '../server/evaluationV6/formalRun';

const identity = {
  candidate: { baseUrl: 'http://127.0.0.1:8080/v1', model: 'candidate.gguf' },
  embedding: { baseUrl: 'http://127.0.0.1:8081/v1', model: 'bge-m3-Q8_0.gguf' },
  judge: { baseUrl: 'http://127.0.0.1:8082/v1', model: 'judge.gguf' },
};

const setup = (checkpoint: EvaluationV6FormalCheckpoint | null = null) => {
  const calls: string[] = [];
  let saved = checkpoint;
  const deps: EvaluationV6FormalWorkflowDeps = {
    preflight: async () => { calls.push('preflight'); return identity; },
    loadCheckpoint: async () => saved,
    saveCheckpoint: async (value) => { saved = value; calls.push(`save:${value.stage}`); },
    createExperiment: async () => { calls.push('create'); return 'group-new'; },
    validateExistingGroup: async (group) => { calls.push(`validate:${group}`); },
    executeAnswers: async (group) => { calls.push(`answers:${group}`); },
    judgeRepetition: async (_group, repetition) => { calls.push(`judge:${repetition}`); },
    activateIndividualGrades: async () => { calls.push('activate'); },
    judgePairs: async () => { calls.push('pairs'); },
    writeReport: async () => { calls.push('report'); return '/tmp/report.html'; },
    now: () => '2026-07-22T12:00:00.000Z',
  };
  return { deps, calls, checkpoint: () => saved };
};

const checkpoint = (
  stage: EvaluationV6FormalCheckpoint['stage'],
  completedRepetitions: Array<1 | 2 | 3 | 4 | 5> = [],
): EvaluationV6FormalCheckpoint => ({
  schemaVersion: 1,
  experimentGroupId: 'group-existing',
  identities: identity,
  stage,
  completedRepetitions,
  htmlPath: 'docs/reports/formal.html',
  createdAt: '2026-07-22T11:00:00.000Z',
  updatedAt: '2026-07-22T11:00:00.000Z',
});

const options = { htmlPath: 'docs/reports/formal.html' };

test('happy: completes the resumable formal workflow in order', async () => {
  const state = setup();
  const result = await runEvaluationV6FormalWorkflow(options, state.deps);
  assert.equal(result.experimentGroupId, 'group-new');
  assert.deepEqual(state.calls.filter((value) => value.startsWith('judge:')), ['judge:1', 'judge:2', 'judge:3', 'judge:4', 'judge:5']);
  assert.ok(state.calls.indexOf('activate') < state.calls.indexOf('pairs'));
  assert.ok(state.calls.indexOf('pairs') < state.calls.indexOf('report'));
  assert.equal(state.checkpoint()?.stage, 'complete');
});

test('edge: resumes after answers without regenerating them', async () => {
  const state = setup(checkpoint('answers_complete'));
  await runEvaluationV6FormalWorkflow(options, state.deps);
  assert.equal(state.calls.some((value) => value.startsWith('answers:')), false);
  assert.equal(state.calls.includes('judge:1'), true);
});

test('edge: resumes after two Judge repetitions', async () => {
  const state = setup(checkpoint('individual_judging', [1, 2]));
  await runEvaluationV6FormalWorkflow(options, state.deps);
  assert.deepEqual(state.calls.filter((value) => value.startsWith('judge:')), ['judge:3', 'judge:4', 'judge:5']);
});

test('edge: reuses an explicitly selected group', async () => {
  const state = setup();
  await runEvaluationV6FormalWorkflow({ ...options, experimentGroupId: 'group-selected' }, state.deps);
  assert.equal(state.calls.includes('validate:group-selected'), true);
  assert.equal(state.calls.includes('create'), false);
});

test('failure: changed service identity preserves checkpoint', async () => {
  const original = checkpoint('individual_judging', [1]);
  const state = setup(original);
  state.deps.preflight = async () => ({
    ...identity,
    judge: { ...identity.judge, model: 'changed-judge.gguf' },
  });
  await assert.rejects(() => runEvaluationV6FormalWorkflow(options, state.deps), /service identity|stale/i);
  assert.deepEqual(state.checkpoint(), original);
  assert.equal(state.calls.some((value) => value.startsWith('judge:')), false);
});
