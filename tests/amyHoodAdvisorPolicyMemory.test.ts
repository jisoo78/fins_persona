/**
 * Test Plan:
 * 1. Happy Path:
 *    - approved non-holdout events become reviewed policies in an immutable active release loadable by Evaluation v3.
 * 2. Edge Cases:
 *    - direct Amy policy evidence plus confirmation in another event and document family qualifies as medium confidence.
 *    - a materially contrasting event narrows policy boundaries and supplies an observable reversal signal.
 *    - rebuilding identical approved content returns the same content-addressed release.
 * 3. Failure Path:
 *    - holdout/post-outcome leakage, unsupported policies, invalid model JSON, stale evidence, tampered hashes, and failed activation preserve the last valid state.
 */
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { ReflectionMemory } from '../shared/amyHoodDecisionAdvisor';
import type { ModelClient } from '../server/personaPipeline/modelClient';
import {
  buildReflectionProposals,
  validateReflectionMemory,
} from '../server/decisionAdvisor/reflectionMemory';
import { loadPolicyMemoryInput } from '../server/decisionAdvisor/policyMemoryInput';

const reflectionResponse = JSON.stringify({
  reflections: [{
    domain: 'm_and_a',
    crossEventQuestion: 'When does platform expansion justify acquisition rather than partnership?',
    observation: 'Approved acquisitions prioritize strategic platform reach while partnership preserves flexibility when control is unnecessary.',
    invariant: 'Choose the transaction form only after strategic reach, integration burden, and optionality are ordered.',
    boundaryConditions: [
      'The target supplies durable platform reach that cannot be obtained through a lower-commitment structure.',
    ],
    unresolvedConflicts: ['Public evidence does not expose the internal hurdle rate.'],
    supportingEventIds: [
      'event-linkedin-acquisition-2016',
      'event-activision-acquisition-2022',
    ],
    contrastingEventIds: ['event-openai-expansion-2023'],
    evidenceIds: [
      'span-0b8c7fcb7c5c77af',
      'span-807ee90aa032f320',
      'span-7a8c1662a2c8a94e',
    ],
  }],
});

const createFixtureModel = (...responses: string[]): ModelClient => {
  let index = 0;
  return {
    provider: 'local',
    model: 'fixture-gemma4',
    cacheKey: 'fixture-cache-key',
    async invoke() {
      const text = responses[Math.min(index, responses.length - 1)];
      index += 1;
      return { text, elapsedMs: 1 };
    },
  };
};

test('happy: input graph selects only approved non-holdout decision evidence', async () => {
  const graph = await loadPolicyMemoryInput(process.cwd());

  assert.deepEqual(graph.events.map(({ id }) => id), [
    'event-activision-acquisition-2022',
    'event-copilot-price-2023',
    'event-linkedin-acquisition-2016',
    'event-openai-expansion-2023',
    'event-workforce-reset-2023',
  ]);
  assert.equal(graph.events.every(({ status }) => status === 'approved'), true);
  assert.equal(graph.references.some(({ id }) => id.includes('github')), false);
  assert.equal(graph.evidenceSpans.some(({ role }) => role === 'post_outcome'), false);

  const result = await buildReflectionProposals(
    graph,
    createFixtureModel(reflectionResponse),
    { now: '2026-07-20T09:00:00.000Z' },
  );
  assert.equal(result.artifacts.length, 1);
  assert.equal(validateReflectionMemory(result.artifacts[0], graph).passed, true);
  assert.equal(result.modelRun.attemptCount, 1);
});

test('edge: a material contrast narrows the reflection boundary', async () => {
  const graph = await loadPolicyMemoryInput(process.cwd());
  const result = await buildReflectionProposals(
    graph,
    createFixtureModel(reflectionResponse),
    { now: '2026-07-20T09:00:00.000Z' },
  );

  assert.deepEqual(result.artifacts[0].contrastingEventIds, ['event-openai-expansion-2023']);
  assert.match(result.artifacts[0].boundaryConditions[0], /lower-commitment structure/);
});

const copyPolicyMemoryData = async () => {
  const root = await mkdtemp(join(tmpdir(), 'amy-policy-memory-'));
  await cp(
    join(process.cwd(), 'data/b-track/amy-hood/advisor'),
    join(root, 'data/b-track/amy-hood/advisor'),
    { recursive: true },
  );
  await cp(
    join(process.cwd(), 'evaluation/v3/sealed/holdout-manifest.json'),
    join(root, 'evaluation/v3/sealed/holdout-manifest.json'),
    { recursive: true },
  );
  return root;
};

test('failure: holdout and post-outcome inputs fail before model work', async (context) => {
  const holdoutRoot = await copyPolicyMemoryData();
  const outcomeRoot = await copyPolicyMemoryData();
  context.after(async () => Promise.all([
    rm(holdoutRoot, { recursive: true, force: true }),
    rm(outcomeRoot, { recursive: true, force: true }),
  ]));

  const holdoutPath = join(
    holdoutRoot,
    'data/b-track/amy-hood/advisor/events/pilot/candidate-github-acquisition-2018.json',
  );
  const holdout = JSON.parse(await readFile(holdoutPath, 'utf8'));
  holdout.status = 'approved';
  await writeFile(holdoutPath, `${JSON.stringify(holdout, null, 2)}\n`);
  await assert.rejects(() => loadPolicyMemoryInput(holdoutRoot), /holdout/);

  const outcomePath = join(
    outcomeRoot,
    'data/b-track/amy-hood/advisor/events/pilot/candidate-activision-acquisition-2022.json',
  );
  const outcome = JSON.parse(await readFile(outcomePath, 'utf8'));
  outcome.evidenceSpans[0].role = 'post_outcome';
  await writeFile(outcomePath, `${JSON.stringify(outcome, null, 2)}\n`);
  await assert.rejects(() => loadPolicyMemoryInput(outcomeRoot), /post-outcome/);
});

test('failure: invalid or unsupported reflections never validate as memory', async () => {
  const graph = await loadPolicyMemoryInput(process.cwd());
  const valid = (await buildReflectionProposals(
    graph,
    createFixtureModel(reflectionResponse),
    { now: '2026-07-20T09:00:00.000Z' },
  )).artifacts[0];

  const missingContrast: ReflectionMemory = { ...valid, contrastingEventIds: [] };
  assert.equal(validateReflectionMemory(missingContrast, graph).passed, false);
  const overlap: ReflectionMemory = {
    ...valid,
    contrastingEventIds: [valid.supportingEventIds[0]],
  };
  assert.equal(validateReflectionMemory(overlap, graph).passed, false);
  const unknownEvidence: ReflectionMemory = { ...valid, evidenceIds: ['span-unknown'] };
  assert.equal(validateReflectionMemory(unknownEvidence, graph).passed, false);
  const leakedText: ReflectionMemory = {
    ...valid,
    invariant: 'GitHub acquisition 2018 proves this rule.',
  };
  assert.equal(validateReflectionMemory(leakedText, graph).passed, false);

  const failed = await buildReflectionProposals(
    graph,
    createFixtureModel('{bad json', '{still bad'),
    { now: '2026-07-20T09:00:00.000Z' },
  );
  assert.equal(failed.artifacts.length, 0);
  assert.equal(failed.modelRun.status, 'failed');
  assert.equal(failed.modelRun.attemptCount, 2);

  const empty = await buildReflectionProposals(
    graph,
    createFixtureModel('{"reflections":[]}', '{"reflections":[]}'),
    { now: '2026-07-20T09:00:00.000Z' },
  );
  assert.equal(empty.modelRun.status, 'failed');
  assert.equal(empty.artifacts.length, 0);
});
