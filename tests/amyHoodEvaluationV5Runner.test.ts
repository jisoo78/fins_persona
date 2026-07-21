/**
 * Test Plan:
 * 1. Happy Path:
 *    - Execute thirty scenarios across three arms and five repetitions for 450 complete answers.
 * 2. Edge Cases:
 *    - Hide scenario, pair, and phase metadata while sharing one deterministic order across arms per repetition.
 *    - Share each scenario retrieval across both RAG arms and all five repetitions.
 *    - Resume an incomplete run without repeating already completed answers.
 * 3. Failure Path:
 *    - Reject a stale model pin and persist retrieval failure without Prompt-only fallback.
 */
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { AmyHoodRenderedContext, AmyHoodRetrievalResult } from '../shared/amyHoodRag';
import { createEvaluationV5Runner } from '../server/evaluationV5/runner';
import { writeEvaluationV5Run } from '../server/evaluationV5/runStore';
import { evaluationV5BundleFixture } from './helpers/evaluationV5Fixture';

const valid = JSON.stringify({
  action: 'Proceed in bounded stages.',
  priorities: ['Demand', 'Economics', 'Execution'],
  guardrails: ['Keep a downside boundary.'],
  reversalSignals: ['Demand weakens.'],
  rationale: 'The staged action preserves value and reversibility.',
});

const install = async (options: { failRetrieval?: boolean; failModelAt?: number } = {}) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'amy-v5-runner-'));
  const bundle = evaluationV5BundleFixture();
  const retrievalInvocations: string[] = [];
  const modelInputs: Array<{ system: string; user: string }> = [];
  let modelCalls = 0;
  const runner = createEvaluationV5Runner({
    root,
    createModel: () => ({
      provider: 'local',
      model: 'e4b-test',
      cacheKey: 'e4b-test-settings',
      invoke: async (input) => {
        if (typeof input === 'string') throw new Error('expected structured Evaluation v5 model input');
        modelInputs.push(input);
        modelCalls += 1;
        if (modelCalls === options.failModelAt) throw new Error('injected model failure');
        return { text: valid, elapsedMs: 1, inputTokens: 10, outputTokens: 20 };
      },
    }),
    loadBundle: async () => ({
      ...bundle,
      scenarios: bundle.scenarioFile.scenarios,
      pairs: bundle.pairKeys,
      domainCounts: {},
      changeTypeCounts: {},
    }),
    loadPolicyCoverage: async () => ({
      passed: true,
      coveredDomains: [],
      missingDomains: [],
      errors: [],
      policyIdsByDomain: {},
    }),
    loadRagPin: async () => ({
      memoryReleaseId: 'release-v5',
      memoryReleaseHash: 'a'.repeat(64),
      memoryIndexHash: 'b'.repeat(64),
      retrievalConfigHash: 'c'.repeat(64),
    }),
    loadPrompt: async () => ({
      versionId: 'amy-v1',
      hash: 'd'.repeat(64),
      content: 'Amy Hood system prompt.',
    }),
    createRetriever: async () => ({
      retrieve: async ({ query, indexHash }): Promise<AmyHoodRetrievalResult> => {
        retrievalInvocations.push(query);
        if (options.failRetrieval) throw new Error('injected retrieval failure');
        return {
          query,
          matches: [{ id: 'policy-test', kind: 'policy', vectorScore: 0.9, lexicalScore: 0.8, fusedScore: 0.87 }],
          trace: {
            queryHash: 'e'.repeat(64),
            indexHash,
            retrievalConfigHash: 'c'.repeat(64),
            cacheKey: 'f'.repeat(64),
            selectedArtifacts: [],
            noMatch: false,
            noMatchReason: null,
          },
        };
      },
    }),
    buildContext: async ({ retrieval, projection }): Promise<AmyHoodRenderedContext> => ({
      projection,
      text: `[${projection}] approved dynamic memory`,
      trace: {
        ...retrieval.trace,
        expandedArtifactIds: ['policy-test'],
        evidenceIds: ['evidence-test'],
        sourceIds: ['source-test'],
        contextTokens: 20,
        requestTokens: 100,
        tokenCounter: 'conservative_estimator',
        contextHash: '1'.repeat(64),
      },
    }),
    now: () => '2026-07-21T07:00:00.000Z',
  });
  return {
    root,
    runner,
    retrievalInvocations,
    modelInputs,
    get modelCalls() { return modelCalls; },
  };
};

test('happy: creates fifteen runs and four hundred fifty complete answers', async () => {
  const fixture = await install();
  const launch = await fixture.runner.createExperiment();
  assert.equal(launch.runs.length, 15);
  const runs = await fixture.runner.executeExperiment(launch.runs.map(({ runId }) => runId));
  assert.equal(runs.every(({ status, answers }) => status === 'complete' && answers.length === 30), true);
  assert.equal(runs.flatMap(({ answers }) => answers).length, 450);
  assert.equal(fixture.retrievalInvocations.length, 30);
});

test('edge: hides metadata and pins one order per repetition', async () => {
  const fixture = await install();
  const launch = await fixture.runner.createExperiment();
  for (const repetition of [1, 2, 3, 4, 5] as const) {
    const runs = launch.runs.filter((run) => run.repetition === repetition);
    assert.equal(new Set(runs.map(({ orderSeed }) => orderSeed)).size, 1);
    assert.equal(new Set(runs.map(({ scenarioOrder }) => JSON.stringify(scenarioOrder))).size, 1);
  }
  assert.equal(new Set(launch.runs.map(({ orderSeed }) => orderSeed)).size, 5);
  await fixture.runner.executeRun(launch.runs[0].runId);
  const publicScenario = evaluationV5BundleFixture().scenarioFile.scenarios
    .find(({ id }) => id === launch.runs[0].scenarioOrder[0])!;
  assert.doesNotMatch(fixture.modelInputs[0].user, new RegExp(publicScenario.id));
  assert.doesNotMatch(fixture.modelInputs[0].user, new RegExp(publicScenario.pairId));
  assert.doesNotMatch(fixture.modelInputs[0].user, /Scenario ID|Pair ID|Phase:/i);
});

test('edge: shares retrievals across RAG arms and all repetitions', async () => {
  const fixture = await install();
  const launch = await fixture.runner.createExperiment();
  const ragRuns = launch.runs.filter(({ arm }) => arm !== 'amy_prompt');
  for (const run of ragRuns) await fixture.runner.executeRun(run.runId);
  assert.equal(fixture.retrievalInvocations.length, 30);
});

test('edge: resumes without repeating completed answers', async () => {
  const fixture = await install({ failModelAt: 5 });
  const launch = await fixture.runner.createExperiment();
  const first = await fixture.runner.executeRun(launch.runs[0].runId);
  assert.equal(first.status, 'incomplete');
  assert.equal(first.answers.filter(({ status }) => status === 'complete').length, 4);
  const resumed = await fixture.runner.resumeRun(first.runId);
  assert.equal(resumed.status, 'complete');
  assert.equal(resumed.answers.length, 30);
  assert.equal(fixture.modelCalls, 31);
});

test('failure: retrieval failure is persisted without model fallback', async () => {
  const fixture = await install({ failRetrieval: true });
  const launch = await fixture.runner.createExperiment();
  const ragRun = launch.runs.find(({ arm }) => arm === 'amy_policy_rag')!;
  const run = await fixture.runner.executeRun(ragRun.runId);
  assert.equal(run.status, 'incomplete');
  assert.match(run.answers[0].error ?? '', /retrieval failure/);
  assert.equal(fixture.modelCalls, 0);
});

test('failure: stale model pin is rejected and recorded', async () => {
  const fixture = await install();
  const launch = await fixture.runner.createExperiment();
  const stale = { ...launch.runs[0], model: 'different-model' };
  await writeEvaluationV5Run(fixture.root, stale);
  await assert.rejects(fixture.runner.executeRun(stale.runId), /model configuration is stale/i);
});
