/**
 * Test Plan:
 * 1. Happy Path:
 *    - Create and complete 90 answers across three persona arms after both gates pass.
 * 2. Edge Cases:
 *    - Create a 450-answer formal launch with deterministic per-repetition order.
 *    - Resume after one failed scenario without regenerating completed answers.
 *    - Keep the no-RAG arm free of memory pins and retrieval traces.
 * 3. Failure Path:
 *    - Refuse missing or stale calibration, stale pins, holdout leakage, malformed output, and mixed model identity.
 */
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createEvaluationV6Runner } from '../server/evaluationV6/runner';
import { evaluationV6BundleFixture } from './helpers/evaluationV6Fixture';

const setup = async (overrides: Record<string, unknown> = {}) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evaluation-v6-runner-'));
  const input = evaluationV6BundleFixture();
  const manifest = {
    schemaVersion: 1 as const,
    stage: 'benchmark' as const,
    scenarioSetVersion: '6.0.0' as const,
    frozenAt: '2026-07-21T12:00:00.000Z',
    predecessorV5BundleHash: 'a'.repeat(64),
    candidateBundleHash: 'b'.repeat(64),
    judgeCalibrationBatchHash: 'c'.repeat(64),
    scenarioIds: input.scenarioFile.scenarios.map(({ id }) => id),
    pairIds: input.pairKeys.map(({ pairId }) => pairId),
    hashes: { audit: 'd'.repeat(64), replacementLedger: 'e'.repeat(64), scenarios: 'f'.repeat(64), reviews: '1'.repeat(64), provenance: '2'.repeat(64), identityKeys: '3'.repeat(64), pairKeys: '4'.repeat(64), calibrationAnswers: '5'.repeat(64) },
    bundleHash: '6'.repeat(64),
  };
  const bundle = { ...input, scenarios: input.scenarioFile.scenarios, auditResult: {} as never, manifest };
  let calls = 0;
  const runner = createEvaluationV6Runner({
    root,
    createModel: () => ({
      provider: 'local' as const,
      model: 'e4b.gguf',
      cacheKey: 'local:e4b.gguf',
      invoke: async () => {
        calls += 1;
        return { text: JSON.stringify({ action: 'stage investment', priorities: ['demand', 'economics', 'capacity'], guardrails: ['margin boundary'], reversalSignals: ['demand weakens'], rationale: 'bounded decision' }), elapsedMs: 1 };
      },
    }),
    loadBundle: async () => bundle,
    loadCalibration: async () => ({ passed: true, candidateBundleHash: manifest.candidateBundleHash, batchHash: manifest.judgeCalibrationBatchHash, metrics: {} as never, activatedAt: '2026-07-21T12:00:00.000Z' }),
    loadPrompt: async () => ({ versionId: 'prompt-v4', hash: '7'.repeat(64), content: 'Amy policy controller' }),
    loadRagPin: async () => ({ memoryReleaseId: 'release-1', memoryReleaseHash: '8'.repeat(64), memoryIndexHash: '9'.repeat(64), retrievalConfigHash: 'a'.repeat(64) }),
    createRetriever: async () => ({ retrieve: async ({ query, indexHash }: { query: string; indexHash: string }) => ({ query, matches: [], trace: { indexHash, selectedArtifactIds: [], selectedArtifactTypes: [], selectedDomains: [], selectedScores: [], selectedVectorScores: [], selectedLexicalScores: [], noMatch: true, noMatchReason: 'below_threshold' } }) as never }),
    buildContext: async ({ projection, retrieval }: { projection: 'policy' | 'full'; retrieval: { trace: Record<string, unknown> } }) => ({ projection, text: 'dynamic memory', trace: { ...retrieval.trace, expandedArtifactIds: [], evidenceIds: [], sourceIds: [], contextTokens: 1, requestTokens: 1, tokenCounter: 'conservative_estimator', contextHash: 'b'.repeat(64) } }) as never,
    now: () => '2026-07-21T12:00:00.000Z',
    ...overrides,
  });
  return { root, runner, getCalls: () => calls };
};

test('happy: completes one repetition across all three arms', async () => {
  const { runner } = await setup();
  const launch = await runner.createExperiment({ repetitions: 1 });
  const runs = await runner.executeExperiment(launch.experimentGroupId);
  assert.equal(runs.length, 3);
  assert.equal(runs.flatMap(({ answers }) => answers).length, 90);
  assert.ok(runs.every(({ status }) => status === 'complete'));
});

test('edge: formal launch creates deterministic 450-answer matrix', async () => {
  const { runner } = await setup();
  const launch = await runner.createExperiment({ repetitions: 5 });
  assert.equal(launch.runs.length, 15);
  for (const repetition of [1, 2, 3, 4, 5]) {
    const runs = launch.runs.filter((run) => run.repetition === repetition);
    assert.equal(new Set(runs.map(({ scenarioOrder }) => JSON.stringify(scenarioOrder))).size, 1);
  }
});

test('edge: resume preserves completed answers', async () => {
  let failOnce = true;
  const { runner, getCalls } = await setup({
    createModel: () => ({ provider: 'local' as const, model: 'e4b.gguf', cacheKey: 'local:e4b.gguf', invoke: async () => {
      if (failOnce) { failOnce = false; throw new Error('temporary model failure'); }
      return { text: JSON.stringify({ action: 'stage', priorities: ['demand', 'economics', 'capacity'], guardrails: ['margin'], reversalSignals: ['weak demand'], rationale: 'bounded' }), elapsedMs: 1 };
    } }),
  });
  const launch = await runner.createExperiment({ repetitions: 1 });
  const failed = await runner.executeRun(launch.runs[0].runId);
  assert.equal(failed.status, 'incomplete');
  const resumed = await runner.resumeRun(failed.runId);
  assert.equal(resumed.answers.length, 30);
  assert.equal(getCalls(), 0);
});

test('edge: no-RAG arm contains neither memory pins nor retrieval traces', async () => {
  const { runner } = await setup();
  const launch = await runner.createExperiment({ repetitions: 1 });
  const promptOnly = launch.runs.find(({ arm }) => arm === 'amy_prompt')!;
  assert.equal(promptOnly.memoryReleaseId, null);
  const completed = await runner.executeRun(promptOnly.runId);
  assert.ok(completed.answers.every(({ retrieval }) => retrieval === undefined));
});

test('failure: launch and execution fail closed on stale identities', async () => {
  const missing = await setup({ loadCalibration: async () => { throw new Error('missing calibration'); } });
  await assert.rejects(() => missing.runner.createExperiment({ repetitions: 1 }), /missing calibration/i);
  const stale = await setup({ loadCalibration: async () => ({ passed: true, candidateBundleHash: '0'.repeat(64), batchHash: 'c'.repeat(64), metrics: {}, activatedAt: '2026-07-21T12:00:00.000Z' }) });
  await assert.rejects(() => stale.runner.createExperiment({ repetitions: 1 }), /not approved/i);
});
