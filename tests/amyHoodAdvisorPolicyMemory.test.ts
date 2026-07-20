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
import {
  approvePolicyMemoryArtifact,
  buildPolicyMemoryGateReport,
  reviewPolicyMemoryArtifact,
  savePolicyBuild,
  saveReflectionBuild,
} from '../server/decisionAdvisor/policyMemoryStore';
import { advisorPaths } from '../server/decisionAdvisor/paths';
import { writeJsonAtomic } from '../server/decisionAdvisor/jsonStore';
import {
  activateMemoryRelease,
  buildMemoryRelease,
} from '../server/decisionAdvisor/memoryReleaseStore';
import { resolveEvaluationV3ArmContext } from '../server/evaluationV3/context';
import { runPolicyMemoryCommand } from '../server/decisionAdvisor/policyMemoryCli';
import { normalizeDecisionAction } from '../server/decisionAdvisor/decisionAction';

const qualifiedContrast = {
  decisionAxis: {
    decisionObject: 'strategic_resource_allocation',
    decisionQuestion: 'When should resources be expanded versus reduced or reallocated?',
    choiceSet: ['expand', 'reduce_or_reallocate'],
    gatingVariables: ['observable_growth_opportunity', 'resource_productivity'],
  },
  supportPattern: {
    eventIds: ['event-openai-expansion-2023'],
    conditions: ['Substantial opportunity and growth remain observable.'],
    action: 'expand focused investment',
    evidenceIds: ['span-7a8c1662a2c8a94e'],
  },
  contrastPattern: {
    eventIds: ['event-workforce-reset-2023'],
    conditions: ['Resources are not aligned to the highest-priority work.'],
    action: 'reduce or reallocate resources',
    evidenceIds: ['span-f031de15863e849e'],
  },
  conditionDelta: 'Opportunity remains substantial versus resources being below priority.',
  actionDelta: 'Expand focused investment versus reduce or reallocate lower-priority resources.',
};

const investmentContrast = (supportEvidenceId: string) => ({
  decisionAxis: {
    decisionObject: 'strategic_resource_allocation',
    decisionQuestion: 'When should resources fund investment rather than monetization?',
    choiceSet: ['expand', 'price'],
    gatingVariables: ['growth_opportunity', 'customer_value'],
  },
  supportPattern: {
    eventIds: ['event-workforce-reset-2023'],
    conditions: ['Focused investment remains a stated priority.'],
    action: 'expand',
    evidenceIds: [supportEvidenceId],
  },
  contrastPattern: {
    eventIds: ['event-copilot-price-2023'],
    conditions: ['The product adds substantial customer value.'],
    action: 'price',
    evidenceIds: ['span-1baf5181c9f9b527'],
  },
  conditionDelta: 'Focused investment priority versus demonstrated product value.',
  actionDelta: 'Fund focused investment versus set a list price.',
});

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
    decisionAxis: {
      decisionObject: 'strategic_transaction_structure',
      decisionQuestion: 'When should strategic reach use acquisition rather than partnership?',
      choiceSet: ['acquire', 'partner'],
      gatingVariables: ['control_requirement', 'lower_commitment_access'],
    },
    supportPattern: {
      eventIds: [
        'event-linkedin-acquisition-2016',
        'event-activision-acquisition-2022',
      ],
      conditions: ['The selected structure is a complete all-cash acquisition.'],
      action: 'acquire',
      evidenceIds: ['span-0b8c7fcb7c5c77af', 'span-807ee90aa032f320'],
    },
    contrastPattern: {
      eventIds: ['event-openai-expansion-2023'],
      conditions: ['Independent commercialization remains inside a long-term collaboration.'],
      action: 'partner',
      evidenceIds: ['span-d7a1fe8155e1f9ca'],
    },
    conditionDelta: 'Complete transaction ownership versus independent commercialization in collaboration.',
    actionDelta: 'Acquire the company versus deepen a strategic partnership.',
    supportingEventIds: [
      'event-linkedin-acquisition-2016',
      'event-activision-acquisition-2022',
    ],
    contrastingEventIds: ['event-openai-expansion-2023'],
    evidenceIds: [
      'span-0b8c7fcb7c5c77af',
      'span-807ee90aa032f320',
      'span-d7a1fe8155e1f9ca',
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
      'span-d7a1fe8155e1f9ca',
    ],
    directPolicyEvidenceIds: [],
  }],
});

test('happy: input graph selects only approved non-holdout decision evidence', async (context) => {
  const graph = await loadPolicyMemoryInput(process.cwd());

  assert.deepEqual(graph.events.map(({ id }) => id), [
    'event-activision-acquisition-2022',
    'event-ai-capacity-opex-pivot-2023',
    'event-ai-capacity-sourcing-2024',
    'event-cloud-capacity-scale-2022',
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

  const crossDomain = {
    ...approveReflectionForFixture(result.artifacts[0]),
    id: 'reflection-cross-domain-fixture',
    domain: 'ai_cloud_capex' as const,
    supportingEventIds: qualifiedContrast.supportPattern.eventIds,
    contrastingEventIds: qualifiedContrast.contrastPattern.eventIds,
    evidenceIds: [
      ...qualifiedContrast.supportPattern.evidenceIds,
      ...qualifiedContrast.contrastPattern.evidenceIds,
    ],
    ...qualifiedContrast,
  };
  assert.equal(validateReflectionMemory(crossDomain, graph).passed, true);

  const fixtureApprovedReflection = approveReflectionForFixture(result.artifacts[0]);
  const policyResult = await buildPolicyProposals(
    [fixtureApprovedReflection],
    graph,
    createFixtureModel(repeatedEventPolicyResponse(fixtureApprovedReflection.id)),
    { now: '2026-07-20T09:20:00.000Z' },
  );
  assert.equal(policyResult.artifacts.length, 1);
  assert.equal(
    validatePolicyMemory(policyResult.artifacts[0], [fixtureApprovedReflection], graph).passed,
    true,
  );
  assert.equal(policyResult.artifacts[0].policyKind, 'deployable_policy');
  assert.equal(policyResult.artifacts[0].confidence, 'medium');

  const storeRoot = await copyPolicyMemoryData();
  context.after(() => rm(storeRoot, { recursive: true, force: true }));
  await saveReflectionBuild(storeRoot, result);
  const reflectionGate = await buildPolicyMemoryGateReport(storeRoot, graph, {
    now: '2026-07-20T09:25:00.000Z',
  });
  assert.deepEqual(reflectionGate.passing.reflections, [result.artifacts[0].id]);
  const approvedReflection = await reviewPolicyMemoryArtifact(storeRoot, {
    kind: 'reflection',
    id: result.artifacts[0].id,
    reviewer: 'Codex',
    reviewedAt: '2026-07-20T09:30:00.000Z',
    decision: 'approved',
    rationale: 'The cited conditions, actions, and evidence form one qualified decision axis.',
  }, graph) as ReflectionMemory;
  assert.equal(approvedReflection.status, 'approved');

  const storedPolicyBuild = await buildPolicyProposals(
    [approvedReflection],
    graph,
    createFixtureModel(repeatedEventPolicyResponse(approvedReflection.id)),
    { now: '2026-07-20T09:35:00.000Z' },
  );
  await savePolicyBuild(storeRoot, storedPolicyBuild);
  const policyGate = await buildPolicyMemoryGateReport(storeRoot, graph, {
    now: '2026-07-20T09:40:00.000Z',
  });
  assert.deepEqual(policyGate.passing.policies, [storedPolicyBuild.artifacts[0].id]);
  const approvedPolicy = await approvePolicyMemoryArtifact(storeRoot, {
    kind: 'policy',
    id: storedPolicyBuild.artifacts[0].id,
    reviewer: 'Codex',
    reviewedAt: '2026-07-20T09:45:00.000Z',
    rationale: 'The policy preserves the cited ordering, contrast, exception, and reversal signal.',
  }, graph) as PolicyMemory;
  assert.equal(approvedPolicy.status, 'approved');
  assert.match(approvedPolicy.review!.validationHash, /^[a-f0-9]{64}$/);

  const release = await buildMemoryRelease(storeRoot, {
    graph,
    now: '2026-07-20T09:50:00.000Z',
  });
  await activateMemoryRelease(
    storeRoot,
    release.manifest.version,
    '2026-07-20T09:55:00.000Z',
  );
  const policyContext = await resolveEvaluationV3ArmContext(storeRoot, 'amy_policy_rag');
  const fullContext = await resolveEvaluationV3ArmContext(storeRoot, 'amy_full_rag');
  assert.equal(policyContext.context.memoryReleaseId, release.manifest.releaseId);
  assert.equal(policyContext.context.policy.length, 1);
  assert.equal(fullContext.context.reflections.length, 1);
  assert.match(fullContext.context.reflections[0], /"decisionAxis"/);
  assert.match(fullContext.context.reflections[0], /"conditionDelta"/);
  assert.equal(fullContext.context.events.length > 0, true);
  assert.equal(fullContext.context.counterexamples.length > 0, true);

  const logs: string[] = [];
  const cliDependencies = {
    createModel: () => createFixtureModel(reflectionResponse),
    now: () => '2026-07-20T10:00:00.000Z',
    log: (value: string) => logs.push(value),
  };
  assert.equal(await runPolicyMemoryCommand(
    storeRoot,
    ['memory:build', '--kind', 'reflection'],
    cliDependencies,
  ), true);
  assert.equal(await runPolicyMemoryCommand(
    storeRoot,
    ['memory:check'],
    cliDependencies,
  ), true);
  assert.equal(await runPolicyMemoryCommand(
    storeRoot,
    ['not-a-memory-command'],
    cliDependencies,
  ), false);
  assert.equal(logs.length >= 2, true);
});

test('edge: a material contrast narrows the reflection boundary', async () => {
  const graph = await loadPolicyMemoryInput(process.cwd());
  const builderPrompt = await readFile(join(
    process.cwd(),
    'agent_prompts/prompts/amy-hood-reflection-builder.md',
  ), 'utf8');
  assert.match(builderPrompt, /at least two support events/i);
  assert.match(builderPrompt, /support events.*same canonical action/i);
  assert.match(builderPrompt, /copy.*chosenAction/i);
  assert.match(builderPrompt, /Unobserved, unspecified, or unknown is not an action/i);
  assert.match(builderPrompt, /`boundaryConditions`.*JSON array/i);
  const policyPrompt = await readFile(join(
    process.cwd(),
    'agent_prompts/prompts/amy-hood-policy-inducer.md',
  ), 'utf8');
  assert.match(policyPrompt, /recommendedAction.*only.*cited.*action.*tactic/i);
  assert.match(policyPrompt, /nonApplicabilityConditions.*positive.*contrastPattern/i);
  assert.match(policyPrompt, /do not negate or invert/i);
  assert.match(policyPrompt, /priorityOrder.*decision criteria.*not.*action/i);
  assert.match(policyPrompt, /reversalSignals.*observable changes.*applicability/i);
  const result = await buildReflectionProposals(
    graph,
    createFixtureModel(reflectionResponse),
    { now: '2026-07-20T09:00:00.000Z' },
  );

  assert.deepEqual(result.artifacts[0].contrastingEventIds, ['event-openai-expansion-2023']);
  assert.match(result.artifacts[0].boundaryConditions[0], /lower-commitment structure/);
  assert.equal(validateReflectionMemory(result.artifacts[0], graph).passed, true);
  assert.equal(result.artifacts[0].supportPattern.action, 'acquire');
  assert.equal(result.artifacts[0].contrastPattern.action, 'partner');

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
  assert.equal(normalizeDecisionAction('expand focused investment'), 'expand');
  assert.equal(normalizeDecisionAction('increase investment'), 'expand');
  assert.equal(
    normalizeDecisionAction('reduce or reallocate resources'),
    'reduce_or_reallocate',
  );
  const reflection: ReflectionMemory = approveReflectionForFixture({
    id: 'reflection-investment-priority',
    domain: 'ai_cloud_capex',
    crossEventQuestion: 'When should investment continue during an efficiency reset?',
    observation: 'Long-term opportunity investment can continue while lower-priority resources are reduced.',
    invariant: 'Protect focused secular-growth investment while reallocating resources from lower priorities.',
    boundaryConditions: ['Demand and strategic opportunity remain substantial and observable.'],
    unresolvedConflicts: ['The public record does not disclose a numeric hurdle rate.'],
    ...investmentContrast('span-7f9dde341a496596'),
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
    {
      recursive: true,
      filter: (source) => ![
        advisorPaths(process.cwd()).policyMemory,
        advisorPaths(process.cwd()).memoryReleases,
      ].includes(source),
    },
  );
  await cp(
    join(process.cwd(), 'evaluation/v3/sealed/holdout-manifest.json'),
    join(root, 'evaluation/v3/sealed/holdout-manifest.json'),
    { recursive: true },
  );
  return root;
};

const createApprovedMemoryFixture = async () => {
  const root = await copyPolicyMemoryData();
  const graph = await loadPolicyMemoryInput(root);
  const reflectionBuild = await buildReflectionProposals(
    graph,
    createFixtureModel(reflectionResponse),
    { now: '2026-07-20T11:00:00.000Z' },
  );
  await saveReflectionBuild(root, reflectionBuild);
  const reflection = await approvePolicyMemoryArtifact(root, {
    kind: 'reflection',
    id: reflectionBuild.artifacts[0].id,
    reviewer: 'Codex',
    reviewedAt: '2026-07-20T11:05:00.000Z',
    rationale: 'Fixture reflection approved after checking evidence and contrast.',
  }, graph) as ReflectionMemory;
  const policyBuild = await buildPolicyProposals(
    [reflection],
    graph,
    createFixtureModel(repeatedEventPolicyResponse(reflection.id)),
    { now: '2026-07-20T11:10:00.000Z' },
  );
  await savePolicyBuild(root, policyBuild);
  await approvePolicyMemoryArtifact(root, {
    kind: 'policy',
    id: policyBuild.artifacts[0].id,
    reviewer: 'Codex',
    reviewedAt: '2026-07-20T11:15:00.000Z',
    rationale: 'Fixture policy approved after checking thresholds and reversal conditions.',
  }, graph);
  return { root, graph };
};

test('edge: rebuilding identical approved content returns the same release', async (context) => {
  const fixture = await createApprovedMemoryFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));

  const reversedPayload = JSON.parse(reflectionResponse) as {
    reflections: Array<{
      supportPattern: { eventIds: string[]; evidenceIds: string[] };
      contrastPattern: { eventIds: string[]; evidenceIds: string[] };
    }>;
  };
  reversedPayload.reflections[0].supportPattern.eventIds.reverse();
  reversedPayload.reflections[0].supportPattern.evidenceIds.reverse();
  reversedPayload.reflections[0].contrastPattern.eventIds.reverse();
  reversedPayload.reflections[0].contrastPattern.evidenceIds.reverse();
  const reordered = await buildReflectionProposals(
    fixture.graph,
    createFixtureModel(JSON.stringify(reversedPayload)),
  );
  const original = await buildReflectionProposals(
    fixture.graph,
    createFixtureModel(reflectionResponse),
  );
  assert.equal(reordered.artifacts[0].id, original.artifacts[0].id);

  const first = await buildMemoryRelease(fixture.root, {
    graph: fixture.graph,
    now: '2026-07-20T11:20:00.000Z',
  });
  const second = await buildMemoryRelease(fixture.root, {
    graph: fixture.graph,
    now: '2026-07-20T11:25:00.000Z',
  });
  assert.equal(second.manifest.releaseId, first.manifest.releaseId);
  assert.equal(second.manifest.version, first.manifest.version);
  assert.equal(second.created, false);
});

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
  const holdoutPilotPath = join(
    holdoutRoot,
    'data/b-track/amy-hood/advisor/events/pilot/pilot-manifest.json',
  );
  const holdoutPilot = JSON.parse(await readFile(holdoutPilotPath, 'utf8'));
  holdoutPilot.targets[5] = {
    candidateId: 'candidate-github-acquisition-2018',
    domain: 'm_and_a',
    priority: 6,
    replacementReason: 'Deliberately restore a sealed holdout to prove policy-build leakage rejection.',
  };
  await writeFile(holdoutPilotPath, `${JSON.stringify(holdoutPilot, null, 2)}\n`);
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

  const crossDomain = {
    ...valid,
    id: 'reflection-cross-domain-fixture',
    domain: 'ai_cloud_capex' as const,
    supportingEventIds: qualifiedContrast.supportPattern.eventIds,
    contrastingEventIds: qualifiedContrast.contrastPattern.eventIds,
    evidenceIds: [
      ...qualifiedContrast.supportPattern.evidenceIds,
      ...qualifiedContrast.contrastPattern.evidenceIds,
    ],
    ...qualifiedContrast,
  };
  const sameAction = structuredClone(crossDomain);
  sameAction.contrastPattern.action = 'increase investment';
  assert.match(
    validateReflectionMemory(sameAction, graph).errors.join('\n'),
    /support and contrast actions must differ/,
  );
  const wrongOwner = structuredClone(crossDomain);
  wrongOwner.contrastPattern.evidenceIds = ['span-7a8c1662a2c8a94e'];
  assert.match(
    validateReflectionMemory(wrongOwner, graph).errors.join('\n'),
    /contrast evidence does not belong to its event/,
  );
  const missingCondition = structuredClone(crossDomain);
  missingCondition.supportPattern.conditions = [];
  assert.match(
    validateReflectionMemory(missingCondition, graph).errors.join('\n'),
    /support pattern requires conditions/,
  );
  const mismatchedEvidence = structuredClone(crossDomain);
  mismatchedEvidence.evidenceIds = ['span-7a8c1662a2c8a94e'];
  assert.match(
    validateReflectionMemory(mismatchedEvidence, graph).errors.join('\n'),
    /pattern evidence must equal reflection evidence/,
  );

  const legacyPayload = JSON.parse(reflectionResponse) as {
    reflections: Array<Record<string, unknown>>;
  };
  for (const reflection of legacyPayload.reflections) {
    delete reflection.decisionAxis;
    delete reflection.supportPattern;
    delete reflection.contrastPattern;
    delete reflection.conditionDelta;
    delete reflection.actionDelta;
  }
  const legacyResponse = JSON.stringify(legacyPayload);
  const legacy = await buildReflectionProposals(
    graph,
    createFixtureModel(legacyResponse, legacyResponse),
  );
  assert.equal(legacy.modelRun.status, 'failed');
  assert.equal(legacy.modelRun.attemptCount, 2);
  assert.equal(legacy.artifacts.length, 0);

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
    ...investmentContrast('span-f031de15863e849e'),
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

test('failure: stale or interrupted approval leaves no partial approved state', async (context) => {
  const graph = await loadPolicyMemoryInput(process.cwd());
  const reflectionBuild = await buildReflectionProposals(
    graph,
    createFixtureModel(reflectionResponse),
    { now: '2026-07-20T10:00:00.000Z' },
  );
  const root = await copyPolicyMemoryData();
  context.after(() => rm(root, { recursive: true, force: true }));
  await saveReflectionBuild(root, reflectionBuild);
  const id = reflectionBuild.artifacts[0].id;

  const approvedRoot = await copyPolicyMemoryData();
  context.after(() => rm(approvedRoot, { recursive: true, force: true }));
  await saveReflectionBuild(approvedRoot, reflectionBuild);
  await approvePolicyMemoryArtifact(approvedRoot, {
    kind: 'reflection',
    id,
    reviewer: 'Codex',
    reviewedAt: '2026-07-20T10:01:00.000Z',
    rationale: 'The evidence supports one qualified decision axis.',
  }, graph);
  await assert.rejects(() => reviewPolicyMemoryArtifact(approvedRoot, {
    kind: 'reflection',
    id,
    reviewer: 'Codex',
    reviewedAt: '2026-07-20T10:02:00.000Z',
    decision: 'rejected',
    rationale: 'Attempt to reverse the terminal approval decision.',
  }, graph), /already approved/);

  await assert.rejects(() => approvePolicyMemoryArtifact(root, {
    kind: 'reflection',
    id,
    reviewer: 'Codex',
    reviewedAt: 'not-a-timestamp',
    rationale: 'Evidence reviewed.',
  }, graph), /timestamp/);
  await assert.rejects(() => approvePolicyMemoryArtifact(root, {
    kind: 'reflection',
    id,
    reviewer: 'Codex',
    reviewedAt: '2026-07-20T10:05:00.000Z',
    rationale: '  ',
  }, graph), /rationale/);

  const staleGraph = {
    ...graph,
    events: graph.events.filter(({ id: eventId }) =>
      eventId !== 'event-activision-acquisition-2022'),
  };
  await assert.rejects(() => approvePolicyMemoryArtifact(root, {
    kind: 'reflection',
    id,
    reviewer: 'Codex',
    reviewedAt: '2026-07-20T10:05:00.000Z',
    rationale: 'Evidence reviewed against the stale graph.',
  }, staleGraph), /cannot approve/);

  let writeCount = 0;
  await assert.rejects(() => approvePolicyMemoryArtifact(root, {
    kind: 'reflection',
    id,
    reviewer: 'Codex',
    reviewedAt: '2026-07-20T10:10:00.000Z',
    rationale: 'Evidence reviewed before the injected persistence failure.',
  }, graph, {
    write: async (filePath, value) => {
      writeCount += 1;
      if (writeCount === 2) throw new Error('injected second write failure');
      await writeJsonAtomic(filePath, value);
    },
  }), /injected second write failure/);

  const approvedPath = join(advisorPaths(root).approvedReflections, `${id}.json`);
  const reviewPath = join(advisorPaths(root).policyReviews, `reflection-${id}.json`);
  await assert.rejects(() => readFile(approvedPath), /ENOENT/);
  await assert.rejects(() => readFile(reviewPath), /ENOENT/);

  const rejected = await reviewPolicyMemoryArtifact(root, {
    kind: 'reflection',
    id,
    reviewer: 'Codex',
    reviewedAt: '2026-07-20T10:06:00.000Z',
    decision: 'rejected',
    rationale: 'The cited events are complementary rather than contrastive.',
  }, graph) as ReflectionMemory;
  assert.equal(rejected.status, 'rejected');
  assert.equal(rejected.review?.decision, 'rejected');
  const rejectedReport = await buildPolicyMemoryGateReport(root, graph);
  assert.equal(rejectedReport.passing.reflections.includes(id), false);
  assert.deepEqual(rejectedReport.reviewed.rejected.reflections, [id]);
  assert.match(rejectedReport.safeStop!.reason, /approved reflection count = 0/);
  assert.equal(rejectedReport.activeReleaseVersion, null);
  await assert.rejects(() => reviewPolicyMemoryArtifact(root, {
    kind: 'reflection',
    id,
    reviewer: 'Codex',
    reviewedAt: '2026-07-20T10:06:30.000Z',
    decision: 'approved',
    rationale: 'Attempt to reverse the terminal rejection decision.',
  }, graph), /already rejected/);

  const cliDependencies = {
    createModel: () => createFixtureModel(reflectionResponse),
    now: () => '2026-07-20T10:07:00.000Z',
    log: () => undefined,
  };
  assert.equal(await runPolicyMemoryCommand(root, [
    'memory:review', '--kind', 'reflection', '--id', id,
    '--decision', 'rejected', '--reviewer', 'Codex',
    '--rationale', 'The evidence does not establish a qualified contrast.',
  ], cliDependencies), true);
  await assert.rejects(
    () => runPolicyMemoryCommand(root, [
      'memory:review', '--kind', 'reflection', '--id', id,
      '--decision', 'approved', '--reviewer', 'Codex', '--rationale', ' ',
    ], cliDependencies),
    /nonblank --rationale/,
  );

  await assert.rejects(
    () => runPolicyMemoryCommand(
      root,
      ['memory:approve', '--kind', 'reflection', '--all-passing'],
      {
        createModel: () => createFixtureModel(reflectionResponse),
        now: () => '2026-07-20T10:15:00.000Z',
        log: () => undefined,
      },
    ),
    /review evidence before approving/,
  );
});

test('failure: release tampering and activation failure preserve the last active pointer', async (context) => {
  const fixture = await createApprovedMemoryFixture();
  context.after(() => rm(fixture.root, { recursive: true, force: true }));
  const release = await buildMemoryRelease(fixture.root, {
    graph: fixture.graph,
    now: '2026-07-20T12:00:00.000Z',
  });
  await activateMemoryRelease(
    fixture.root,
    release.manifest.version,
    '2026-07-20T12:05:00.000Z',
  );
  const activePath = advisorPaths(fixture.root).activeMemoryRelease;
  const activeBefore = await readFile(activePath);

  await assert.rejects(() => activateMemoryRelease(
    fixture.root,
    release.manifest.version,
    '2026-07-20T12:10:00.000Z',
    { write: async () => { throw new Error('injected activation failure'); } },
  ), /injected activation failure/);
  assert.deepEqual(await readFile(activePath), activeBefore);

  const contextPath = join(
    advisorPaths(fixture.root).memoryReleases,
    release.manifest.version,
    'evaluation-context.json',
  );
  await writeFile(contextPath, `${await readFile(contextPath, 'utf8')} `);
  await assert.rejects(
    () => resolveEvaluationV3ArmContext(fixture.root, 'amy_full_rag'),
    /hash mismatch/,
  );
});
