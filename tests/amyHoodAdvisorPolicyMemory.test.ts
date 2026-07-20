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

import type { PolicyMemory, ReflectionMemory } from '../shared/amyHoodDecisionAdvisor';
import type { ModelClient } from '../server/personaPipeline/modelClient';
import {
  buildReflectionProposals,
  validateReflectionMemory,
} from '../server/decisionAdvisor/reflectionMemory';
import {
  buildPolicyProposals,
  validatePolicyMemory,
} from '../server/decisionAdvisor/policyMemory';
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

const approveReflectionForFixture = (reflection: ReflectionMemory): ReflectionMemory => ({
  ...reflection,
  status: 'approved',
  review: {
    reviewer: 'Codex',
    reviewedAt: '2026-07-20T09:10:00.000Z',
    decision: 'approved',
    rationale: 'Fixture approval after evidence review.',
    validationHash: 'a'.repeat(64),
  },
});

const repeatedEventPolicyResponse = (reflectionId: string) => JSON.stringify({
  policies: [{
    domain: 'm_and_a',
    applicabilityConditions: [
      'Strategic platform reach is durable and cannot be obtained with a lower-commitment structure.',
    ],
    priorityOrder: [
      'Strategic reach',
      'Durable economics',
      'Integration capacity',
      'Optionality',
    ],
    recommendedAction: 'Use acquisition only after partnership and organic alternatives fail the strategic-reach test.',
    nonApplicabilityConditions: ['A partnership preserves sufficient access and learning.'],
    exceptions: ['Delay commitment when integration capacity or durable economics is unverified.'],
    reversalSignals: [
      'A partnership reaches the same strategic objective with materially lower irreversible commitment.',
    ],
    reflectionIds: [reflectionId],
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
    directPolicyEvidenceIds: [],
  }],
});

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

  const approvedReflection = approveReflectionForFixture(result.artifacts[0]);
  const policyResult = await buildPolicyProposals(
    [approvedReflection],
    graph,
    createFixtureModel(repeatedEventPolicyResponse(approvedReflection.id)),
    { now: '2026-07-20T09:20:00.000Z' },
  );
  assert.equal(policyResult.artifacts.length, 1);
  assert.equal(
    validatePolicyMemory(policyResult.artifacts[0], [approvedReflection], graph).passed,
    true,
  );
  assert.equal(policyResult.artifacts[0].policyKind, 'deployable_policy');
  assert.equal(policyResult.artifacts[0].confidence, 'medium');
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

  const approvedReflection = approveReflectionForFixture(result.artifacts[0]);
  const policy = (await buildPolicyProposals(
    [approvedReflection],
    graph,
    createFixtureModel(repeatedEventPolicyResponse(approvedReflection.id)),
  )).artifacts[0];
  assert.match(policy.reversalSignals[0], /lower irreversible commitment/);
});

test('edge: direct Amy principle plus independent confirmation qualifies as medium', async () => {
  const graph = await loadPolicyMemoryInput(process.cwd());
  const reflection: ReflectionMemory = approveReflectionForFixture({
    id: 'reflection-investment-priority',
    domain: 'ai_cloud_capex',
    crossEventQuestion: 'When should investment continue during an efficiency reset?',
    observation: 'Long-term opportunity investment can continue while lower-priority resources are reduced.',
    invariant: 'Protect focused secular-growth investment while reallocating resources from lower priorities.',
    boundaryConditions: ['Demand and strategic opportunity remain substantial and observable.'],
    unresolvedConflicts: ['The public record does not disclose a numeric hurdle rate.'],
    supportingEventIds: ['event-workforce-reset-2023'],
    contrastingEventIds: ['event-copilot-price-2023'],
    evidenceIds: ['span-7f9dde341a496596', 'span-1baf5181c9f9b527'],
    confidence: 'low',
    status: 'review_required',
    review: null,
  });
  const response = JSON.stringify({
    policies: [{
      domain: 'ai_cloud_capex',
      applicabilityConditions: ['A substantial long-term platform opportunity remains observable.'],
      priorityOrder: ['Secular growth opportunity', 'Customer demand', 'Resource productivity'],
      recommendedAction: 'Continue focused investment while reallocating lower-priority resources.',
      nonApplicabilityConditions: ['Demand evidence no longer supports the platform opportunity.'],
      exceptions: ['Pause expansion if leading demand signals materially weaken.'],
      reversalSignals: ['Sustained demand deterioration removes the substantial-growth premise.'],
      reflectionIds: [reflection.id],
      supportingEventIds: ['event-workforce-reset-2023'],
      contrastingEventIds: ['event-copilot-price-2023'],
      evidenceIds: ['span-7f9dde341a496596', 'span-1baf5181c9f9b527'],
      directPolicyEvidenceIds: ['policy-openai-investment-consistency-2022'],
    }],
  });

  const policy = (await buildPolicyProposals(
    [reflection],
    graph,
    createFixtureModel(response),
  )).artifacts[0];
  assert.equal(validatePolicyMemory(policy, [reflection], graph).passed, true);
  assert.equal(policy.confidence, 'medium');
  assert.equal(policy.policyKind, 'deployable_policy');
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

test('failure: unsupported or unbounded policies remain nondeployable', async () => {
  const graph = await loadPolicyMemoryInput(process.cwd());
  const reflection = approveReflectionForFixture((await buildReflectionProposals(
    graph,
    createFixtureModel(reflectionResponse),
  )).artifacts[0]);
  const valid = (await buildPolicyProposals(
    [reflection],
    graph,
    createFixtureModel(repeatedEventPolicyResponse(reflection.id)),
  )).artifacts[0];

  const oneEvent: PolicyMemory = {
    ...valid,
    supportingEventIds: ['event-linkedin-acquisition-2016'],
  };
  assert.equal(validatePolicyMemory(oneEvent, [reflection], graph).passed, false);
  const noBoundary: PolicyMemory = {
    ...valid,
    exceptions: [],
    nonApplicabilityConditions: [],
  };
  assert.equal(validatePolicyMemory(noBoundary, [reflection], graph).passed, false);
  const noReversal: PolicyMemory = { ...valid, reversalSignals: [] };
  assert.equal(validatePolicyMemory(noReversal, [reflection], graph).passed, false);
  const unknownReflection: PolicyMemory = { ...valid, reflectionIds: ['reflection-unknown'] };
  assert.equal(validatePolicyMemory(unknownReflection, [reflection], graph).passed, false);
  const leaked: PolicyMemory = {
    ...valid,
    recommendedAction: 'Repeat the GitHub acquisition 2018 decision.',
  };
  assert.equal(validatePolicyMemory(leaked, [reflection], graph).passed, false);

  const sameDocumentReflection = approveReflectionForFixture({
    id: 'reflection-same-document',
    domain: 'ai_cloud_capex',
    crossEventQuestion: 'Does one transcript independently confirm its own investment rule?',
    observation: 'The same transcript cannot count as independent confirmation.',
    invariant: 'Require another decision context and document family.',
    boundaryConditions: ['The confirming event must use evidence from a distinct document family.'],
    unresolvedConflicts: [],
    supportingEventIds: ['event-workforce-reset-2023'],
    contrastingEventIds: ['event-copilot-price-2023'],
    evidenceIds: ['span-f031de15863e849e', 'span-1baf5181c9f9b527'],
    confidence: 'low',
    status: 'review_required',
    review: null,
  });
  const sameDocumentPolicy: PolicyMemory = {
    id: 'policy-same-document',
    domain: 'ai_cloud_capex',
    applicabilityConditions: ['A substantial platform opportunity remains visible.'],
    priorityOrder: ['Opportunity', 'Demand', 'Productivity'],
    recommendedAction: 'Continue focused investment.',
    nonApplicabilityConditions: ['Demand weakens materially.'],
    exceptions: ['Pause when demand is unverified.'],
    reversalSignals: ['Sustained demand deterioration.'],
    reflectionIds: [sameDocumentReflection.id],
    supportingEventIds: ['event-workforce-reset-2023'],
    contrastingEventIds: ['event-copilot-price-2023'],
    evidenceIds: ['span-f031de15863e849e', 'span-1baf5181c9f9b527'],
    directPolicyEvidenceIds: ['policy-openai-investment-consistency-2022'],
    confidence: 'medium',
    policyKind: 'deployable_policy',
    status: 'review_required',
    review: null,
  };
  const sameDocumentValidation = validatePolicyMemory(
    sameDocumentPolicy,
    [sameDocumentReflection],
    graph,
  );
  assert.equal(sameDocumentValidation.passed, false);
  assert.match(sameDocumentValidation.errors.join('\n'), /independent confirmation/);

  const failed = await buildPolicyProposals(
    [reflection],
    graph,
    createFixtureModel('{bad json', '{still bad'),
  );
  assert.equal(failed.modelRun.status, 'failed');
  assert.equal(failed.modelRun.attemptCount, 2);
  assert.equal(failed.artifacts.length, 0);
});
