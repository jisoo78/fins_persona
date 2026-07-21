/**
 * Test Plan:
 * 1. Happy Path:
 *    - Execute ten scenarios across four arms with forty complete answers and ten shared retrievals.
 *
 * 2. Edge Cases:
 *    - Retry one malformed fenced-JSON response once.
 *    - Reuse one retrieval-cache entry across both RAG arms.
 *    - Resume one incomplete run without repeating completed answers.
 *
 * 3. Failure Path:
 *    - Reject stale pins or model identity and persist a failed RAG answer without prompt-only fallback.
 */
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { AmyHoodRenderedContext, AmyHoodRetrievalResult } from '../shared/amyHoodRag';
import { createEvaluationV4Runner } from '../server/evaluationV4/runner';
import { writeEvaluationV4Run } from '../server/evaluationV4/runStore';
import { evaluationV4BundleFixture } from './helpers/evaluationV4ScenarioFixture';

const valid = JSON.stringify({
  action: 'Proceed in bounded stages.',
  priorities: ['Demand', 'Economics', 'Execution'],
  guardrails: ['Keep a downside boundary.'],
  reversalSignals: ['Demand weakens.'],
  rationale: 'The staged action preserves value and reversibility.',
});

const install = async (options: { failRetrieval?: boolean; failModelOnce?: boolean; malformedOnce?: boolean } = {}) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'amy-v4-runner-'));
  const bundle = evaluationV4BundleFixture();
  const retrievalInvocations: string[] = [];
  const modelInputs: Array<{ system: string; user: string }> = [];
  let modelCalls = 0;
  let failedOnce = false;
  const runner = createEvaluationV4Runner({
    root,
    createModel: () => ({
      provider: 'local',
      model: 'e4b-test',
      cacheKey: 'e4b-test-settings',
      invoke: async (input) => {
        if (typeof input === 'string') throw new Error('expected structured Evaluation v4 model input');
        modelInputs.push(input);
        modelCalls += 1;
        if (options.failModelOnce && !failedOnce) {
          failedOnce = true;
          throw new Error('injected model failure');
        }
        if (options.malformedOnce && !failedOnce) {
          failedOnce = true;
          return { text: 'not-json', elapsedMs: 1 };
        }
        return { text: options.malformedOnce ? `\`\`\`json\n${valid}\n\`\`\`` : valid, elapsedMs: 1, inputTokens: 10, outputTokens: 20 };
      },
    }),
    loadBundle: async () => ({ ...bundle, scenarios: bundle.scenarioFile.scenarios, domainCounts: {} }),
    loadPolicyCoverage: async () => ({ passed: true, coveredDomains: [], missingDomains: [], errors: [], policyIdsByDomain: {} }),
    loadRagPin: async () => ({
      memoryReleaseId: 'release-v4',
      memoryReleaseHash: 'a'.repeat(64),
      memoryIndexHash: 'b'.repeat(64),
      retrievalConfigHash: 'c'.repeat(64),
    }),
    loadPromptArms: async () => ({
      generic: { versionId: null, hash: 'd'.repeat(64), content: 'Generic CFO system prompt.' },
      amy: { versionId: 'amy-v1', hash: 'e'.repeat(64), content: 'Amy Hood system prompt.' },
    }),
    createRetriever: async () => ({
      retrieve: async ({ query, indexHash }): Promise<AmyHoodRetrievalResult> => {
        retrievalInvocations.push(query);
        if (options.failRetrieval) throw new Error('injected retrieval failure');
        return {
          query,
          matches: [{ id: 'policy-test', kind: 'policy', vectorScore: 0.9, lexicalScore: 0.8, fusedScore: 0.87 }],
          trace: {
            queryHash: 'f'.repeat(64), indexHash, retrievalConfigHash: 'c'.repeat(64),
            cacheKey: '0'.repeat(64), selectedArtifacts: [], noMatch: false, noMatchReason: null,
          },
        };
      },
    }),
    buildContext: async ({ retrieval, projection }): Promise<AmyHoodRenderedContext> => ({
      projection,
      text: `[${projection}] approved dynamic memory`,
      trace: {
        ...retrieval.trace,
        expandedArtifactIds: ['policy-test'], evidenceIds: ['evidence-test'], sourceIds: ['source-test'],
        contextTokens: 20, requestTokens: 100, tokenCounter: 'conservative_estimator', contextHash: '1'.repeat(64),
      },
    }),
    now: () => '2026-07-21T03:00:00.000Z',
  });
  return { root, runner, retrievalInvocations, modelInputs, get modelCalls() { return modelCalls; } };
};

test('happy: executes one four-arm calibration', async () => {
  const fixture = await install();
  const launch = await fixture.runner.createExperiment({ stage: 'calibration' });
  const runs = await fixture.runner.executeExperiment(launch.runs.map(({ runId }) => runId));
  assert.equal(runs.length, 4);
  assert.equal(runs.every(({ status, answers }) => status === 'complete' && answers.length === 10), true);
  assert.equal(fixture.retrievalInvocations.length, 10);
  assert.equal(runs.flatMap(({ answers }) => answers).length, 40);
});

test('edge: candidate response parser retry completes the answer', async () => {
  const fixture = await install({ malformedOnce: true });
  const launch = await fixture.runner.createExperiment({ stage: 'calibration' });
  assert.equal((await fixture.runner.executeRun(launch.runs[0].runId)).status, 'complete');
  assert.match(fixture.modelInputs[1].user, /previous response failed validation/i);
  assert.match(fixture.modelInputs[1].user, /exactly 3 priorities/i);
});

test('edge: both RAG arms share retrieval cache entries', async () => {
  const fixture = await install();
  const launch = await fixture.runner.createExperiment({ stage: 'calibration' });
  await fixture.runner.executeRun(launch.runs[2].runId);
  await fixture.runner.executeRun(launch.runs[3].runId);
  assert.equal(fixture.retrievalInvocations.length, 10);
});

test('edge: resumes an incomplete run without repeating completed answers', async () => {
  const fixture = await install({ failModelOnce: true });
  const launch = await fixture.runner.createExperiment({ stage: 'calibration' });
  const first = await fixture.runner.executeRun(launch.runs[0].runId);
  assert.equal(first.status, 'incomplete');
  const resumed = await fixture.runner.resumeRun(first.runId);
  assert.equal(resumed.status, 'complete');
  assert.equal(resumed.answers.length, 10);
});

test('failure: RAG failure is persisted without model fallback', async () => {
  const fixture = await install({ failRetrieval: true });
  const launch = await fixture.runner.createExperiment({ stage: 'calibration' });
  const run = await fixture.runner.executeRun(launch.runs[2].runId);
  assert.equal(run.status, 'incomplete');
  assert.match(run.answers[0].error ?? '', /retrieval failure/);
  assert.equal(fixture.modelCalls, 0);
});

test('failure: rejects a stale pinned model identity', async () => {
  const fixture = await install();
  const launch = await fixture.runner.createExperiment({ stage: 'calibration' });
  const stale = { ...launch.runs[0], model: 'different-model' };
  await writeEvaluationV4Run(fixture.root, stale);
  await assert.rejects(fixture.runner.executeRun(stale.runId), /model configuration is stale/i);
});
