import path from 'node:path';

import type {
  AdvisorSourceRecord,
  EventCandidate,
  PilotDecisionEvent,
  PilotEvidenceSpan,
} from '../../shared/amyHoodDecisionAdvisor';
import {
  assertNoEvaluationV3Holdout,
  loadEvaluationV3Holdout,
  type EvaluationV3ArtifactReference,
  type EvaluationV3HoldoutManifest,
} from '../evaluationV3/holdout';
import { eventCardPath, validatePilotEventCard } from './eventCard';
import { readJsonFile } from './jsonStore';
import { loadPilotManifest } from './pilotManifest';
import {
  loadValidatedPilotPolicyEvidenceGraph,
  type ValidatedPilotPolicyEvidence,
} from './pilotPolicyEvidence';
import { advisorPaths } from './paths';
import { loadRegistry } from './sourceRegistry';
import { canonicalizeSourceUrl } from './sourcePolicy';

export type PolicyMemoryInputGraph = {
  events: PilotDecisionEvent[];
  candidates: EventCandidate[];
  evidenceSpans: PilotEvidenceSpan[];
  policyEvidence: ValidatedPilotPolicyEvidence[];
  sources: AdvisorSourceRecord[];
  documentFamilyBySourceId: Record<string, string>;
  references: EvaluationV3ArtifactReference[];
  holdoutManifest: EvaluationV3HoldoutManifest;
};

const uniqueBy = <T>(values: T[], key: (value: T) => string) => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const id = key(value);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
};

const selectedEvidence = (event: PilotDecisionEvent) => {
  const allowed = new Set([
    ...event.directAmyEvidenceIds,
    ...event.amyPolicyEvidenceIds,
    ...event.contextEvidenceIds,
  ]);
  return event.evidenceSpans.filter(({ id }) => allowed.has(id));
};

const candidateForEvent = (
  event: PilotDecisionEvent,
  candidates: EventCandidate[],
) => {
  const candidate = candidates.find(({ id }) => id === event.candidateId);
  if (!candidate) throw new Error(`policy memory event has unknown candidate: ${event.candidateId}`);
  return candidate;
};

const documentFamilyMap = (
  candidates: EventCandidate[],
  sources: AdvisorSourceRecord[],
  policyEvidence: ValidatedPilotPolicyEvidence[],
) => {
  const result: Record<string, string> = {};
  for (const source of sources) {
    const associatedFamilies = new Set(candidates
      .flatMap(({ sourceAssociations }) => sourceAssociations)
      .filter(({ canonicalUrl }) => canonicalizeSourceUrl(canonicalUrl) === source.canonicalUrl)
      .map(({ documentFamilyId }) => documentFamilyId)
      .filter((family): family is string => Boolean(family)));
    if (associatedFamilies.size > 1) {
      throw new Error(`advisor source has conflicting document families: ${source.id}`);
    }
    const policyFamilies = new Set(policyEvidence
      .filter(({ record }) => record.sourceId === source.id)
      .map(({ documentFamilyId }) => documentFamilyId));
    if (associatedFamilies.size === 0 && policyFamilies.size > 1) {
      throw new Error(`policy evidence source has conflicting document families: ${source.id}`);
    }
    result[source.id] = [...associatedFamilies][0]
      ?? [...policyFamilies][0]
      ?? `source:${source.id}`;
  }
  return result;
};

export const buildPolicyMemoryReferences = (
  events: PilotDecisionEvent[],
  candidates: EventCandidate[],
  evidenceSpans: PilotEvidenceSpan[],
  policyEvidence: ValidatedPilotPolicyEvidence[],
  holdoutManifest: EvaluationV3HoldoutManifest,
): EvaluationV3ArtifactReference[] => {
  const selectedCandidateIds = new Set(events.map(({ candidateId }) => candidateId));
  const sharedSourceIds = new Set(
    holdoutManifest.sharedSourceRules.map(({ sourceId }) => sourceId),
  );
  const policyBySpanId = new Map(
    policyEvidence.map(({ record, span }) => [span.id, record]),
  );
  const references: EvaluationV3ArtifactReference[] = [];

  for (const event of events) {
    references.push(
      { artifactClass: 'candidate', id: event.candidateId },
      { artifactClass: 'event', id: event.id },
    );
  }
  for (const candidate of candidates.filter(({ id }) => selectedCandidateIds.has(id))) {
    for (const alias of candidate.eventFingerprint.aliases ?? []) {
      references.push({ artifactClass: 'alias', id: alias.value });
    }
  }
  for (const span of evidenceSpans) {
    const policyRecord = policyBySpanId.get(span.id);
    references.push({
      artifactClass: 'evidence',
      id: policyRecord?.id ?? span.id,
      sourceId: span.sourceId,
      candidateId: span.eventCandidateId,
    });
  }

  const sourceCandidateIds = new Map<string, Set<string>>();
  for (const span of evidenceSpans) {
    const candidateIds = sourceCandidateIds.get(span.sourceId) ?? new Set<string>();
    candidateIds.add(span.eventCandidateId);
    sourceCandidateIds.set(span.sourceId, candidateIds);
  }
  for (const [sourceId, candidateIds] of sourceCandidateIds) {
    if (sharedSourceIds.has(sourceId)) continue;
    references.push({ artifactClass: 'source', id: sourceId });
    for (const candidateId of candidateIds) {
      references.push({ artifactClass: 'raw_source', id: sourceId, candidateId });
    }
  }

  return uniqueBy(references, (reference) => [
    reference.artifactClass,
    reference.id,
    reference.sourceId ?? '',
    reference.candidateId ?? '',
  ].join(':')).sort((left, right) =>
    `${left.artifactClass}:${left.id}`.localeCompare(`${right.artifactClass}:${right.id}`));
};

export const loadPolicyMemoryInput = async (
  root: string,
): Promise<PolicyMemoryInputGraph> => {
  const candidates = await readJsonFile<EventCandidate[]>(
    path.resolve(advisorPaths(root).root, 'event-candidates.json'),
    [],
  );
  const manifest = await loadPilotManifest(root, candidates);
  const cards = await Promise.all(manifest.targets.map(({ candidateId }) =>
    readJsonFile<PilotDecisionEvent | null>(eventCardPath(root, candidateId), null)));
  const events = cards
    .filter((card): card is PilotDecisionEvent => card?.status === 'approved')
    .sort((left, right) => left.id.localeCompare(right.id));
  if (events.length === 0) throw new Error('policy memory requires an approved event');
  events.forEach(validatePilotEventCard);

  const evidenceSpans = uniqueBy(events.flatMap(selectedEvidence), ({ id }) => id)
    .sort((left, right) => left.id.localeCompare(right.id));
  if (evidenceSpans.some(({ role }) => role === 'post_outcome')) {
    throw new Error('post-outcome evidence is forbidden in policy build');
  }
  const selectedCandidateIds = new Set(events.map(({ candidateId }) => candidateId));
  const policyEvidence = (await loadValidatedPilotPolicyEvidenceGraph(root, candidates))
    .filter(({ record }) => selectedCandidateIds.has(record.candidateId));
  const registry = loadRegistry(root);
  const sourceIds = new Set(evidenceSpans.map(({ sourceId }) => sourceId));
  const sources = [...sourceIds]
    .map((sourceId) => {
      const source = registry.sources.find(({ id }) => id === sourceId);
      if (!source) throw new Error(`policy memory evidence has unknown source: ${sourceId}`);
      return source;
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const event of events) candidateForEvent(event, candidates);

  const holdoutManifest = await loadEvaluationV3Holdout(root);
  const references = buildPolicyMemoryReferences(
    events,
    candidates,
    evidenceSpans,
    policyEvidence,
    holdoutManifest,
  );
  assertNoEvaluationV3Holdout('policy_build', references, holdoutManifest);

  return {
    events,
    candidates: candidates
      .filter(({ id }) => selectedCandidateIds.has(id))
      .sort((left, right) => left.id.localeCompare(right.id)),
    evidenceSpans,
    policyEvidence,
    sources,
    documentFamilyBySourceId: documentFamilyMap(candidates, sources, policyEvidence),
    references,
    holdoutManifest,
  };
};
