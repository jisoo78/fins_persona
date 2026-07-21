import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  DecisionDomain,
  PilotEvidenceSpan,
  PolicyMemory,
  PolicyMemoryConfidence,
  PolicyMemoryModelRun,
  PolicyMemoryValidation,
  ReflectionMemory,
} from '../../shared/amyHoodDecisionAdvisor';
import { assertNoEvaluationV3Holdout, type EvaluationV3ArtifactReference } from '../evaluationV3/holdout';
import type { ModelClient } from '../personaPipeline/modelClient';
import { canonicalJson, sha256 } from './canonicalJson';
import type { PolicyMemoryInputGraph } from './policyMemoryInput';

type PolicyProposal = Omit<
  PolicyMemory,
  'id' | 'confidence' | 'policyKind' | 'status' | 'review'
>;

export type PolicyBuildResult = {
  artifacts: PolicyMemory[];
  modelRun: PolicyMemoryModelRun;
};

type PolicyBuildOptions = {
  now?: string;
};

const promptPath = path.resolve(
  process.cwd(),
  'agent_prompts/prompts/amy-hood-policy-inducer.md',
);

const decisionDomains = new Set<DecisionDomain>([
  'm_and_a',
  'ai_cloud_capex',
  'pricing_monetization',
  'cost_efficiency',
  'shareholder_return_risk',
]);

const nonemptyStrings = (value: unknown): value is string[] =>
  Array.isArray(value)
  && value.length > 0
  && value.every((item) => typeof item === 'string' && item.trim().length > 0);

const optionalStrings = (value: unknown): value is string[] =>
  Array.isArray(value)
  && value.every((item) => typeof item === 'string' && item.trim().length > 0);

const parsePolicyResponse = (text: string): PolicyProposal[] => {
  const parsed = JSON.parse(text.trim()) as { policies?: unknown };
  if (!parsed || typeof parsed !== 'object'
    || !Array.isArray(parsed.policies)
    || parsed.policies.length === 0) {
    throw new Error('policy response requires a nonempty policies array');
  }
  return parsed.policies.map((value, index) => {
    if (!value || typeof value !== 'object') {
      throw new Error(`policy ${index} must be an object`);
    }
    const item = value as Partial<PolicyProposal>;
    const contrastStatus = item.contrastStatus ?? 'reviewed';
    if (!decisionDomains.has(item.domain as DecisionDomain)
      || !nonemptyStrings(item.applicabilityConditions)
      || !nonemptyStrings(item.priorityOrder)
      || typeof item.recommendedAction !== 'string' || !item.recommendedAction.trim()
      || !optionalStrings(item.nonApplicabilityConditions)
      || !nonemptyStrings(item.guardrails)
      || !optionalStrings(item.exceptions)
      || !nonemptyStrings(item.reversalSignals)
      || !nonemptyStrings(item.reflectionIds)
      || !nonemptyStrings(item.supportingEventIds)
      || !optionalStrings(item.contrastingEventIds)
      || !nonemptyStrings(item.evidenceIds)
      || !optionalStrings(item.directPolicyEvidenceIds)
      || !['reviewed', 'documented_unavailable'].includes(contrastStatus)
      || (contrastStatus === 'reviewed' && !nonemptyStrings(item.contrastingEventIds))
      || (contrastStatus === 'documented_unavailable' && item.contrastingEventIds.length !== 0)) {
      throw new Error(`policy ${index} has an invalid schema`);
    }
    return item as PolicyProposal;
  });
};

const evidenceReference = (
  span: PilotEvidenceSpan,
  graph: PolicyMemoryInputGraph,
): EvaluationV3ArtifactReference => {
  const policyRecord = graph.policyEvidence.find(({ span: item }) => item.id === span.id)?.record;
  return {
    artifactClass: 'evidence',
    id: policyRecord?.id ?? span.id,
    sourceId: span.sourceId,
    candidateId: span.eventCandidateId,
  };
};

const pushTextLeakage = (
  policy: PolicyMemory,
  graph: PolicyMemoryInputGraph,
  errors: string[],
) => {
  const content = canonicalJson(policy).toLocaleLowerCase('en-US');
  for (const event of graph.holdoutManifest.events) {
    const leaked = [
      event.candidateId,
      event.eventId,
      ...event.sourceIds,
      ...event.evidenceIds,
      ...event.aliases,
    ]
      .map((value) => value.toLocaleLowerCase('en-US'))
      .find((value) => content.includes(value));
    if (leaked) {
      errors.push(`policy contains holdout text: ${leaked}`);
      return;
    }
  }
};

const directPrincipleHasIndependentConfirmation = (
  policy: PolicyMemory,
  graph: PolicyMemoryInputGraph,
) => policy.directPolicyEvidenceIds.some((directId) => {
  const direct = graph.policyEvidence.find(({ record }) => record.id === directId);
  if (!direct) return false;
  const confirmingCandidateIds = new Set(
    policy.supportingEventIds
      .map((eventId) => graph.events.find(({ id }) => id === eventId))
      .filter((event) => event && event.candidateId !== direct.record.candidateId)
      .map((event) => event!.candidateId),
  );
  return policy.evidenceIds.some((evidenceId) => {
    const span = graph.evidenceSpans.find(({ id }) => id === evidenceId);
    return Boolean(span
      && confirmingCandidateIds.has(span.eventCandidateId)
      && graph.documentFamilyBySourceId[span.sourceId]
        !== graph.documentFamilyBySourceId[direct.record.sourceId]);
  });
});

const policyEvidenceFamilies = (
  policy: PolicyMemory,
  graph: PolicyMemoryInputGraph,
) => new Set([
  ...policy.evidenceIds
    .map((id) => graph.evidenceSpans.find((span) => span.id === id))
    .filter((span): span is PilotEvidenceSpan => Boolean(span))
    .map((span) => graph.documentFamilyBySourceId[span.sourceId]),
  ...policy.directPolicyEvidenceIds
    .map((id) => graph.policyEvidence.find(({ record }) => record.id === id)?.record.sourceId)
    .map((sourceId) => sourceId ? graph.documentFamilyBySourceId[sourceId] : undefined)
    .filter((family): family is string => Boolean(family)),
]);

const computePolicyConfidence = (
  policy: PolicyMemory,
  graph: PolicyMemoryInputGraph,
): PolicyMemoryConfidence => {
  const contrastStatus = policy.contrastStatus ?? 'reviewed';
  const supportCount = new Set(policy.supportingEventIds).size;
  const repeatedEventPath = supportCount >= 2;
  const directPrinciplePath = directPrincipleHasIndependentConfirmation(policy, graph);
  if (contrastStatus === 'reviewed'
    && supportCount >= 3
    && policy.directPolicyEvidenceIds.length > 0
    && policyEvidenceFamilies(policy, graph).size > 1
    && policy.contrastingEventIds.length > 0) return 'high';
  if (repeatedEventPath || directPrinciplePath) return 'medium';
  return 'low';
};

export const validatePolicyMemory = (
  policy: PolicyMemory,
  reflections: ReflectionMemory[],
  graph: PolicyMemoryInputGraph,
): PolicyMemoryValidation => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const support = new Set(policy.supportingEventIds);
  const contrast = new Set(policy.contrastingEventIds);
  const contrastStatus = policy.contrastStatus ?? 'reviewed';
  if (!nonemptyStrings(policy.applicabilityConditions)) {
    errors.push('policy requires applicability conditions');
  }
  if (!nonemptyStrings(policy.priorityOrder)) errors.push('policy requires a priority order');
  if (!policy.recommendedAction.trim()) errors.push('policy requires a recommended action');
  if (policy.schemaVersion === 2 && !nonemptyStrings(policy.guardrails)) {
    errors.push('policy schema v2 requires guardrails');
  }
  if (policy.exceptions.length + policy.nonApplicabilityConditions.length === 0) {
    errors.push('policy requires an exception or non-applicability condition');
  }
  if (!nonemptyStrings(policy.reversalSignals)) errors.push('policy requires a reversal signal');
  if (support.size === 0) errors.push('policy requires supporting events');
  if (!['reviewed', 'documented_unavailable'].includes(contrastStatus)) {
    errors.push('policy has an invalid contrast status');
  } else if (contrastStatus === 'reviewed') {
    if (contrast.size === 0) errors.push('policy requires a reviewed contrast');
  } else {
    if (contrast.size > 0) {
      errors.push('documented unavailable contrast must not reference an event');
    }
    if (support.size < 2) {
      errors.push('documented unavailable contrast requires two supporting events');
    }
    if (!nonemptyStrings(policy.directPolicyEvidenceIds)) {
      errors.push('documented unavailable contrast requires direct policy evidence');
    }
    warnings.push('public contrast is documented unavailable; confidence is capped at medium');
  }
  if ([...support].some((id) => contrast.has(id))) {
    errors.push('policy support and contrast must be disjoint');
  }

  const referencedReflections = policy.reflectionIds.map((id) =>
    reflections.find((reflection) => reflection.id === id));
  if (referencedReflections.some((reflection) => !reflection)) {
    errors.push('policy references an unknown reflection');
  }
  if (referencedReflections.some((reflection) =>
    reflection && (reflection.status !== 'approved' || !reflection.review))) {
    errors.push('policy requires approved reflections');
  }
  if (referencedReflections.some((reflection) =>
    reflection && reflection.domain !== policy.domain)) {
    errors.push('policy and reflection domains must match');
  }
  if (referencedReflections.some((reflection) =>
    reflection && (reflection.contrastStatus ?? 'reviewed') !== contrastStatus)) {
    errors.push('policy contrast status must match its approved reflections');
  }
  const reflectedSupport = new Set(
    referencedReflections.flatMap((reflection) => reflection?.supportingEventIds ?? []),
  );
  const reflectedContrast = new Set(
    referencedReflections.flatMap((reflection) => reflection?.contrastingEventIds ?? []),
  );
  if ([...support].some((id) => !reflectedSupport.has(id))) {
    errors.push('policy support exceeds its reflections');
  }
  if ([...contrast].some((id) => !reflectedContrast.has(id))) {
    errors.push('policy contrast exceeds its reflections');
  }

  const eventById = new Map(graph.events.map((event) => [event.id, event]));
  const referencedEventIds = new Set([...support, ...contrast]);
  for (const eventId of referencedEventIds) {
    if (!eventById.has(eventId)) errors.push(`policy references unknown event: ${eventId}`);
  }
  const evidenceById = new Map(graph.evidenceSpans.map((span) => [span.id, span]));
  const references: EvaluationV3ArtifactReference[] = [];
  for (const eventId of referencedEventIds) {
    const event = eventById.get(eventId);
    if (!event) continue;
    references.push(
      { artifactClass: 'event', id: event.id },
      { artifactClass: 'candidate', id: event.candidateId },
    );
  }
  for (const evidenceId of new Set(policy.evidenceIds)) {
    const span = evidenceById.get(evidenceId);
    if (!span) {
      errors.push(`policy references unknown evidence: ${evidenceId}`);
      continue;
    }
    const event = graph.events.find(({ candidateId }) => candidateId === span.eventCandidateId);
    if (!event || !referencedEventIds.has(event.id)) {
      errors.push(`policy evidence is outside its support and contrast events: ${evidenceId}`);
      continue;
    }
    references.push(evidenceReference(span, graph));
  }
  for (const directId of new Set(policy.directPolicyEvidenceIds)) {
    const direct = graph.policyEvidence.find(({ record }) => record.id === directId);
    if (!direct) {
      errors.push(`policy references unknown direct principle: ${directId}`);
      continue;
    }
    references.push({
      artifactClass: 'evidence',
      id: direct.record.id,
      sourceId: direct.record.sourceId,
      candidateId: direct.record.candidateId,
    });
  }

  const repeatedEventPath = support.size >= 2;
  const directPrinciplePath = directPrincipleHasIndependentConfirmation(policy, graph);
  if (!repeatedEventPath && !directPrinciplePath) {
    errors.push('policy requires two supporting events or direct principle plus independent confirmation');
  }
  pushTextLeakage(policy, graph, errors);
  try {
    assertNoEvaluationV3Holdout('policy_build', references, graph.holdoutManifest);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'policy contains holdout evidence');
  }
  const computedConfidence = computePolicyConfidence(policy, graph);
  if (computedConfidence === 'low') warnings.push('policy remains an event-specific hypothesis');
  return {
    passed: errors.length === 0,
    errors,
    warnings,
    computedConfidence,
    references,
  };
};

const toPolicyMemory = (
  proposal: PolicyProposal,
  reflections: ReflectionMemory[],
  graph: PolicyMemoryInputGraph,
) => {
  const canonical = {
    ...proposal,
    schemaVersion: 2 as const,
    contrastStatus: proposal.contrastStatus ?? 'reviewed',
    applicabilityConditions: [...new Set(proposal.applicabilityConditions)],
    priorityOrder: [...new Set(proposal.priorityOrder)],
    nonApplicabilityConditions: [...new Set(proposal.nonApplicabilityConditions)],
    guardrails: [...new Set(proposal.guardrails ?? [])],
    exceptions: [...new Set(proposal.exceptions)],
    reversalSignals: [...new Set(proposal.reversalSignals)],
    reflectionIds: [...new Set(proposal.reflectionIds)].sort(),
    supportingEventIds: [...new Set(proposal.supportingEventIds)].sort(),
    contrastingEventIds: [...new Set(proposal.contrastingEventIds)].sort(),
    evidenceIds: [...new Set(proposal.evidenceIds)].sort(),
    directPolicyEvidenceIds: [...new Set(proposal.directPolicyEvidenceIds)].sort(),
  };
  const draft: PolicyMemory = {
    id: `policy-${sha256(canonicalJson(canonical)).slice(0, 16)}`,
    ...canonical,
    confidence: 'low',
    policyKind: 'event_specific_hypothesis',
    status: 'review_required',
    review: null,
  };
  const validation = validatePolicyMemory(draft, reflections, graph);
  return {
    ...draft,
    confidence: validation.computedConfidence,
    policyKind: validation.passed && validation.computedConfidence !== 'low'
      ? 'deployable_policy' as const
      : 'event_specific_hypothesis' as const,
  };
};

const inputPayload = (
  reflections: ReflectionMemory[],
  graph: PolicyMemoryInputGraph,
) => ({
  reflections: reflections.map((reflection) => ({
    id: reflection.id,
    domain: reflection.domain,
    crossEventQuestion: reflection.crossEventQuestion,
    observation: reflection.observation,
    invariant: reflection.invariant,
    boundaryConditions: reflection.boundaryConditions,
    unresolvedConflicts: reflection.unresolvedConflicts,
    decisionAxis: reflection.decisionAxis,
    supportPattern: reflection.supportPattern,
    contrastPattern: reflection.contrastPattern,
    contrastStatus: reflection.contrastStatus ?? 'reviewed',
    conditionDelta: reflection.conditionDelta,
    actionDelta: reflection.actionDelta,
    supportingEventIds: reflection.supportingEventIds,
    contrastingEventIds: reflection.contrastingEventIds,
    evidenceIds: reflection.evidenceIds,
  })),
  events: graph.events.map((event) => ({
    id: event.id,
    candidateId: event.candidateId,
    domain: event.domain,
    situation: event.situation,
    conditions: event.conditions,
    constraints: event.constraints,
    chosenAction: event.chosenAction,
    rejectedBenefit: event.rejectedBenefit,
  })),
  policyEvidence: graph.policyEvidence.map(({ record, documentFamilyId }) => ({
    id: record.id,
    candidateId: record.candidateId,
    exactQuote: record.exactQuote,
    policyTags: record.policyTags,
    eventLinkRationale: record.eventLinkRationale,
    documentFamilyId,
  })),
  evidenceSpans: graph.evidenceSpans.map((span) => ({
    id: span.id,
    eventCandidateId: span.eventCandidateId,
    role: span.role,
    exactQuote: span.exactQuote,
  })),
});

export const buildPolicyProposals = async (
  reflections: ReflectionMemory[],
  graph: PolicyMemoryInputGraph,
  model: ModelClient,
  options: PolicyBuildOptions = {},
): Promise<PolicyBuildResult> => {
  if (reflections.length === 0
    || reflections.some(({ status, review }) => status !== 'approved' || !review)) {
    throw new Error('policy build requires approved reflections');
  }
  const system = await readFile(promptPath, 'utf8');
  const payload = inputPayload(reflections, graph);
  const promptHash = sha256(system);
  const inputHashes = {
    reflections: sha256(canonicalJson(payload.reflections)),
    events: sha256(canonicalJson(payload.events)),
    evidence: sha256(canonicalJson({
      policyEvidence: payload.policyEvidence,
      evidenceSpans: payload.evidenceSpans,
    })),
  };
  const rawResponses: string[] = [];
  let proposals: PolicyProposal[] | null = null;
  let errorMessage = 'policy model response is invalid';
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await model.invoke({
      system,
      user: [
        JSON.stringify(payload),
        attempt === 2
          ? `The previous response was invalid: ${errorMessage}. Return one valid JSON object only.`
          : 'Induce bounded conditional policies and return one valid JSON object only.',
      ].join('\n\n'),
    });
    rawResponses.push(result.text);
    try {
      proposals = parsePolicyResponse(result.text);
      break;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'policy model response is invalid';
    }
  }

  const artifacts = proposals?.map((proposal) =>
    toPolicyMemory(proposal, reflections, graph)) ?? [];
  const runIdentity = canonicalJson({
    kind: 'policy',
    promptHash,
    inputHashes,
    rawResponses,
  });
  const modelRun: PolicyMemoryModelRun = {
    id: `model-run-${sha256(runIdentity).slice(0, 16)}`,
    kind: 'policy',
    promptHash,
    inputHashes,
    model: model.model,
    modelCacheKey: model.cacheKey,
    attemptCount: rawResponses.length as 1 | 2,
    rawResponses,
    parsedArtifactIds: artifacts.map(({ id }) => id),
    status: proposals ? 'complete' : 'failed',
    error: proposals ? null : errorMessage,
    createdAt: options.now ?? new Date().toISOString(),
  };
  return { artifacts, modelRun };
};
