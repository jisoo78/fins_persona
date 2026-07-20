import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  DecisionDomain,
  PilotEvidenceSpan,
  PolicyMemoryModelRun,
  PolicyMemoryValidation,
  ReflectionMemory,
} from '../../shared/amyHoodDecisionAdvisor';
import { assertNoEvaluationV3Holdout, type EvaluationV3ArtifactReference } from '../evaluationV3/holdout';
import type { ModelClient } from '../personaPipeline/modelClient';
import { canonicalJson, sha256 } from './canonicalJson';
import type { PolicyMemoryInputGraph } from './policyMemoryInput';

type ReflectionProposal = Omit<
  ReflectionMemory,
  'id' | 'confidence' | 'status' | 'review'
>;

export type ReflectionBuildResult = {
  artifacts: ReflectionMemory[];
  modelRun: PolicyMemoryModelRun;
};

type ReflectionBuildOptions = {
  now?: string;
};

const promptPath = path.resolve(
  process.cwd(),
  'agent_prompts/prompts/amy-hood-reflection-builder.md',
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

const parseReflectionResponse = (text: string): ReflectionProposal[] => {
  const parsed = JSON.parse(text.trim()) as { reflections?: unknown };
  if (!parsed || typeof parsed !== 'object'
    || !Array.isArray(parsed.reflections)
    || parsed.reflections.length === 0) {
    throw new Error('reflection response requires a nonempty reflections array');
  }
  return parsed.reflections.map((value, index) => {
    if (!value || typeof value !== 'object') {
      throw new Error(`reflection ${index} must be an object`);
    }
    const item = value as Partial<ReflectionProposal>;
    if (!decisionDomains.has(item.domain as DecisionDomain)
      || typeof item.crossEventQuestion !== 'string' || !item.crossEventQuestion.trim()
      || typeof item.observation !== 'string' || !item.observation.trim()
      || typeof item.invariant !== 'string' || !item.invariant.trim()
      || !nonemptyStrings(item.boundaryConditions)
      || !Array.isArray(item.unresolvedConflicts)
      || item.unresolvedConflicts.some((entry) => typeof entry !== 'string' || !entry.trim())
      || !nonemptyStrings(item.supportingEventIds)
      || !nonemptyStrings(item.contrastingEventIds)
      || !nonemptyStrings(item.evidenceIds)) {
      throw new Error(`reflection ${index} has an invalid schema`);
    }
    return item as ReflectionProposal;
  });
};

const pushUnknownTextLeakage = (
  reflection: ReflectionMemory,
  graph: PolicyMemoryInputGraph,
  errors: string[],
) => {
  const content = canonicalJson(reflection).toLocaleLowerCase('en-US');
  for (const event of graph.holdoutManifest.events) {
    const forbidden = [
      event.candidateId,
      event.eventId,
      ...event.sourceIds,
      ...event.evidenceIds,
      ...event.aliases,
    ].map((value) => value.toLocaleLowerCase('en-US'));
    const leaked = forbidden.find((value) => content.includes(value));
    if (leaked) {
      errors.push(`reflection contains holdout text: ${leaked}`);
      return;
    }
  }
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

export const validateReflectionMemory = (
  reflection: ReflectionMemory,
  graph: PolicyMemoryInputGraph,
): PolicyMemoryValidation => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const support = new Set(reflection.supportingEventIds);
  const contrast = new Set(reflection.contrastingEventIds);
  if (support.size === 0) errors.push('reflection requires supporting events');
  if (contrast.size === 0) errors.push('reflection requires a contrasting event');
  if ([...support].some((id) => contrast.has(id))) {
    errors.push('reflection support and contrast must be disjoint');
  }
  if (!nonemptyStrings(reflection.boundaryConditions)) {
    errors.push('reflection requires a boundary condition');
  }

  const eventIds = new Set(graph.events.map(({ id }) => id));
  const referencedEventIds = new Set([...support, ...contrast]);
  for (const eventId of referencedEventIds) {
    if (!eventIds.has(eventId)) errors.push(`reflection references unknown event: ${eventId}`);
  }
  const supportingEvents = graph.events.filter(({ id }) => support.has(id));
  if (supportingEvents.some(({ domain }) => domain !== reflection.domain)) {
    errors.push('reflection supporting events must match its domain');
  }

  const evidenceById = new Map(graph.evidenceSpans.map((span) => [span.id, span]));
  const references: EvaluationV3ArtifactReference[] = [];
  for (const eventId of referencedEventIds) {
    const event = graph.events.find(({ id }) => id === eventId);
    if (!event) continue;
    references.push(
      { artifactClass: 'event', id: event.id },
      { artifactClass: 'candidate', id: event.candidateId },
    );
  }
  for (const evidenceId of new Set(reflection.evidenceIds)) {
    const span = evidenceById.get(evidenceId);
    if (!span) {
      errors.push(`reflection references unknown evidence: ${evidenceId}`);
      continue;
    }
    const event = graph.events.find(({ candidateId }) => candidateId === span.eventCandidateId);
    if (!event || !referencedEventIds.has(event.id)) {
      errors.push(`reflection evidence is outside its support and contrast events: ${evidenceId}`);
      continue;
    }
    references.push(evidenceReference(span, graph));
  }
  if (new Set(reflection.evidenceIds).size !== reflection.evidenceIds.length) {
    errors.push('reflection evidence IDs must be unique');
  }
  pushUnknownTextLeakage(reflection, graph, errors);
  try {
    assertNoEvaluationV3Holdout('policy_build', references, graph.holdoutManifest);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'reflection contains holdout evidence');
  }
  const computedConfidence = support.size >= 3 ? 'high' : support.size >= 2 ? 'medium' : 'low';
  if (computedConfidence === 'low') warnings.push('reflection has only one supporting event');
  return {
    passed: errors.length === 0,
    errors,
    warnings,
    computedConfidence,
    references,
  };
};

const toReflectionMemory = (
  proposal: ReflectionProposal,
  graph: PolicyMemoryInputGraph,
) => {
  const canonical = {
    ...proposal,
    boundaryConditions: [...new Set(proposal.boundaryConditions)],
    unresolvedConflicts: [...new Set(proposal.unresolvedConflicts)],
    supportingEventIds: [...new Set(proposal.supportingEventIds)].sort(),
    contrastingEventIds: [...new Set(proposal.contrastingEventIds)].sort(),
    evidenceIds: [...new Set(proposal.evidenceIds)].sort(),
  };
  const draft: ReflectionMemory = {
    id: `reflection-${sha256(canonicalJson(canonical)).slice(0, 16)}`,
    ...canonical,
    confidence: 'low',
    status: 'review_required',
    review: null,
  };
  return {
    ...draft,
    confidence: validateReflectionMemory(draft, graph).computedConfidence,
  };
};

const inputPayload = (graph: PolicyMemoryInputGraph) => ({
  events: graph.events.map((event) => ({
    id: event.id,
    candidateId: event.candidateId,
    title: event.title,
    domain: event.domain,
    situation: event.situation,
    objectives: event.objectives,
    conditions: event.conditions,
    constraints: event.constraints,
    chosenAction: event.chosenAction,
    rejectedBenefit: event.rejectedBenefit,
    observations: event.observations,
    inferences: event.inferences,
  })),
  evidenceSpans: graph.evidenceSpans.map((span) => ({
    id: span.id,
    eventCandidateId: span.eventCandidateId,
    role: span.role,
    exactQuote: span.exactQuote,
    speaker: span.speaker,
  })),
});

export const buildReflectionProposals = async (
  graph: PolicyMemoryInputGraph,
  model: ModelClient,
  options: ReflectionBuildOptions = {},
): Promise<ReflectionBuildResult> => {
  const system = await readFile(promptPath, 'utf8');
  const payload = inputPayload(graph);
  const promptHash = sha256(system);
  const inputHashes = {
    events: sha256(canonicalJson(payload.events)),
    evidence: sha256(canonicalJson(payload.evidenceSpans)),
  };
  const rawResponses: string[] = [];
  let proposals: ReflectionProposal[] | null = null;
  let errorMessage = 'reflection model response is invalid';

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const result = await model.invoke({
      system,
      user: [
        JSON.stringify(payload),
        attempt === 2
          ? `The previous response was invalid: ${errorMessage}. Return one valid JSON object only.`
          : 'Derive bounded cross-event reflections and return one valid JSON object only.',
      ].join('\n\n'),
    });
    rawResponses.push(result.text);
    try {
      proposals = parseReflectionResponse(result.text);
      break;
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'reflection model response is invalid';
    }
  }

  const artifacts = proposals?.map((proposal) => toReflectionMemory(proposal, graph)) ?? [];
  const runIdentity = canonicalJson({
    kind: 'reflection',
    promptHash,
    inputHashes,
    rawResponses,
  });
  const modelRun: PolicyMemoryModelRun = {
    id: `model-run-${sha256(runIdentity).slice(0, 16)}`,
    kind: 'reflection',
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
