import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  AdvisorRawSource,
  AdvisorSourceRecord,
  EventCandidate,
  PilotDecisionEvent,
  PilotEvidenceSpan,
  PilotManifest,
} from '../../shared/amyHoodDecisionAdvisor';
import {
  assertNoEvaluationV3Holdout,
  loadEvaluationV3Holdout,
  type EvaluationV3ArtifactReference,
} from '../evaluationV3/holdout';
import { eventCardPath, validatePilotEventCard } from './eventCard';
import { readJsonFile } from './jsonStore';
import { extractSpeakerSegments } from './officialSourceCollector';
import { advisorPaths } from './paths';
import { validatePilotManifest } from './pilotManifest';
import { loadRegistry, type AdvisorSourceRegistry } from './sourceRegistry';

export type CapacityResourceCandidateSpec = {
  id: string;
  workingTitle: string;
  decisionDate: string;
  fingerprint: {
    primaryEntity: string;
    decisionAction: string;
    eventSpecificIdentifier: string;
  };
};

export type CapacityResourceCardSpec = Pick<
  PilotDecisionEvent,
  | 'title'
  | 'decisionQuestion'
  | 'situation'
  | 'objectives'
  | 'conditions'
  | 'constraints'
  | 'options'
  | 'chosenAction'
  | 'rejectedBenefit'
  | 'observations'
  | 'inferences'
>;

export type CapacityResourceEvidenceSpec = Pick<
  PilotEvidenceSpan,
  'id' | 'role' | 'exactQuote' | 'startChar' | 'endChar' | 'speaker'
>;

export type CapacityResourceEventSpec = {
  candidate: CapacityResourceCandidateSpec;
  sourceId: string;
  publishedAt: string;
  replacePriority: 6 | 7 | 8;
  card: CapacityResourceCardSpec;
  evidence: CapacityResourceEvidenceSpec[];
};

export type CapacityResourcePilotManifest = {
  dataset: 'amy_hood_capacity_resource_pilot';
  version: '1.0.0';
  events: [
    CapacityResourceEventSpec,
    CapacityResourceEventSpec,
    CapacityResourceEventSpec,
  ];
};

export type VerifiedCapacityResourcePilot = {
  candidates: EventCandidate[];
  registry: AdvisorSourceRegistry;
  rawSourceUpdates: Array<{
    record: AdvisorSourceRecord;
    artifact: AdvisorRawSource;
  }>;
  pilotManifest: PilotManifest;
  cards: PilotDecisionEvent[];
};

const allowedActions = new Set([
  'scale_infrastructure_and_people',
  'scale_infrastructure_constrain_opex',
]);

const expectedActions = [
  'scale_infrastructure_and_people',
  'scale_infrastructure_constrain_opex',
  'scale_infrastructure_constrain_opex',
];

const isIsoDate = (value: unknown): value is string =>
  typeof value === 'string'
  && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(`${value}T00:00:00.000Z`));

const nonempty = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const defaultManifestPath = (root: string) => path.resolve(
  root,
  'data/b-track/amy-hood/advisor/imports/amy-hood-capacity-resource-pilot.json',
);

const validateManifest = (value: unknown): CapacityResourcePilotManifest => {
  if (!value || typeof value !== 'object') {
    throw new Error('capacity resource manifest must be an object');
  }
  const manifest = value as CapacityResourcePilotManifest;
  if (manifest.dataset !== 'amy_hood_capacity_resource_pilot'
    || manifest.version !== '1.0.0'
    || !Array.isArray(manifest.events)
    || manifest.events.length !== 3) {
    throw new Error('capacity resource manifest identity or event count is invalid');
  }
  const ids = new Set<string>();
  const evidenceIds = new Set<string>();
  for (const [index, event] of manifest.events.entries()) {
    if (!event || typeof event !== 'object'
      || !event.candidate || typeof event.candidate !== 'object'
      || !/^candidate-[a-z0-9-]+$/.test(event.candidate.id)
      || !nonempty(event.candidate.workingTitle)
      || !isIsoDate(event.candidate.decisionDate)
      || !event.candidate.fingerprint
      || Object.values(event.candidate.fingerprint).some((field) => !nonempty(field))
      || !nonempty(event.sourceId)
      || !isIsoDate(event.publishedAt)
      || event.replacePriority !== index + 6
      || !event.card || typeof event.card !== 'object'
      || !Array.isArray(event.evidence) || event.evidence.length < 2) {
      throw new Error(`capacity resource event ${index + 1} is invalid`);
    }
    if (ids.has(event.candidate.id)) {
      throw new Error(`duplicate capacity resource candidate: ${event.candidate.id}`);
    }
    ids.add(event.candidate.id);
    for (const span of event.evidence) {
      if (!span || typeof span !== 'object'
        || !nonempty(span.id)
        || !['direct_amy', 'decision_context'].includes(span.role)
        || !Number.isInteger(span.startChar)
        || !Number.isInteger(span.endChar)
        || span.startChar < 0
        || span.endChar <= span.startChar
        || !nonempty(span.exactQuote)) {
        throw new Error(`capacity resource evidence is invalid: ${span?.id ?? '(missing)'}`);
      }
      if (evidenceIds.has(span.id)) {
        throw new Error(`duplicate capacity resource evidence: ${span.id}`);
      }
      evidenceIds.add(span.id);
    }
  }
  const actions = manifest.events.map(({ card }) => card.chosenAction);
  if (actions[1] !== actions[2]) {
    throw new Error('FY23 and FY24 support actions must match');
  }
  if (actions.some((action) => !allowedActions.has(action))
    || actions.some((action, index) => action !== expectedActions[index])) {
    throw new Error('capacity resource action sequence is invalid');
  }
  return manifest;
};

export const loadCapacityResourcePilotManifest = async (
  root: string,
  manifestPath = defaultManifestPath(root),
) => validateManifest(await readJsonFile<unknown>(path.resolve(manifestPath), null));

const buildCandidate = (
  spec: CapacityResourceEventSpec,
  source: AdvisorSourceRecord,
): EventCandidate => {
  const direct = spec.evidence.find(({ role }) => role === 'direct_amy');
  if (!direct) throw new Error(`capacity resource event lacks direct Amy evidence: ${spec.candidate.id}`);
  return {
    id: spec.candidate.id,
    workingTitle: spec.candidate.workingTitle,
    domain: 'ai_cloud_capex',
    decisionWindowStart: spec.candidate.decisionDate,
    decisionWindowEnd: spec.candidate.decisionDate,
    discoveryUrls: [source.canonicalUrl],
    decisionWindowBasis: {
      summary: 'The official earnings-call publication date defines the public decision disclosure window.',
      sourceUrls: [source.canonicalUrl],
      reviewerNote: 'Codex reviewed the dated official transcript and exact Amy Hood spans.',
    },
    eventFingerprint: {
      ...spec.candidate.fingerprint,
      sourceUrls: [source.canonicalUrl],
      reviewStatus: 'reviewed',
      reviewerNote: 'Codex matched all fingerprint fields to the bounded direct Amy Hood passage.',
    },
    sourceAssociations: [{
      canonicalUrl: source.canonicalUrl,
      role: 'direct_amy',
      sourceType: source.sourceType,
      documentFamilyId: `earnings-call-${spec.publishedAt.slice(0, 4)}`,
      publishedAt: spec.publishedAt,
      temporalRelation: 'decision_time',
      relevanceClaim: 'The official earnings transcript contains a bounded Amy Hood statement about this resource-allocation decision.',
      evidenceLocator: {
        exactQuote: direct.exactQuote,
        exactRelevancePassage: direct.exactQuote,
        anchorTerms: [
          spec.candidate.fingerprint.primaryEntity,
          spec.candidate.fingerprint.decisionAction,
        ],
        eventDiscriminators: [
          { value: spec.candidate.fingerprint.primaryEntity, kind: 'named_entity' },
          { value: spec.candidate.fingerprint.decisionAction, kind: 'decision_action' },
          { value: spec.candidate.fingerprint.eventSpecificIdentifier, kind: 'event_specific' },
        ],
        speaker: 'Amy Hood',
      },
      reviewStatus: 'reviewed',
      reviewerNote: 'Codex verified the exact quote, offsets, speaker ownership, and publication date.',
    }],
    directEvidenceGap: null,
    phase3Status: 'eligible',
    notes: 'Raw-derived capacity-resource event with exact Amy Hood transcript evidence.',
    status: 'approved_for_collection',
  };
};

const buildCard = (
  spec: CapacityResourceEventSpec,
  spans: PilotEvidenceSpan[],
): PilotDecisionEvent => {
  const directAmyEvidenceIds = spans
    .filter(({ role }) => role === 'direct_amy')
    .map(({ id }) => id);
  const contextEvidenceIds = spans
    .filter(({ role }) => role === 'decision_context')
    .map(({ id }) => id);
  const card: PilotDecisionEvent = {
    id: `event-${spec.candidate.id.slice('candidate-'.length)}`,
    candidateId: spec.candidate.id,
    domain: 'ai_cloud_capex',
    decisionDate: spec.candidate.decisionDate,
    ...structuredClone(spec.card),
    directAmyEvidenceIds,
    amyPolicyEvidenceIds: [],
    contextEvidenceIds,
    postOutcomeEvidenceIds: [],
    sourceIds: [spec.sourceId],
    documentFamilyIds: [`earnings-call-${spec.publishedAt.slice(0, 4)}`],
    evidenceSpans: spans,
    status: 'incomplete',
    gaps: ['single_document_family'],
    reviewer: null,
    reviewedAt: null,
    updatedAt: '2026-07-20T00:00:00.000Z',
  };
  const validation = validatePilotEventCard(card);
  if (validation.blockingGaps.length > 0) {
    throw new Error(`capacity resource card is blocked: ${validation.blockingGaps.join(', ')}`);
  }
  return card;
};

const holdoutReferences = (event: CapacityResourceEventSpec): EvaluationV3ArtifactReference[] => [
  { artifactClass: 'candidate', id: event.candidate.id },
  { artifactClass: 'event', id: `event-${event.candidate.id.slice('candidate-'.length)}` },
  { artifactClass: 'source', id: event.sourceId },
  { artifactClass: 'raw_source', id: event.sourceId, candidateId: event.candidate.id },
  ...event.evidence.map(({ id }) => ({
    artifactClass: 'evidence' as const,
    id,
    sourceId: event.sourceId,
    candidateId: event.candidate.id,
  })),
];

export const verifyCapacityResourcePilot = async (
  root: string,
  value: CapacityResourcePilotManifest,
): Promise<VerifiedCapacityResourcePilot> => {
  const manifest = validateManifest(value);
  const holdout = await loadEvaluationV3Holdout(root);
  for (const event of manifest.events) {
    assertNoEvaluationV3Holdout('policy_build', holdoutReferences(event), holdout);
  }

  const candidates = await readJsonFile<EventCandidate[]>(
    path.resolve(advisorPaths(root).root, 'event-candidates.json'),
    [],
  );
  if (candidates.length < 30 || candidates.length > 47) {
    throw new Error(`capacity resource pilot requires 30-47 existing candidates; found ${candidates.length}`);
  }
  const registry = structuredClone(loadRegistry(root));
  const rawSourceUpdates: VerifiedCapacityResourcePilot['rawSourceUpdates'] = [];
  const cards: PilotDecisionEvent[] = [];
  const additions: EventCandidate[] = [];

  for (const spec of manifest.events) {
    if (candidates.some(({ id }) => id === spec.candidate.id)) {
      throw new Error(`capacity resource candidate already exists: ${spec.candidate.id}`);
    }
    const source = registry.sources.find(({ id }) => id === spec.sourceId);
    if (!source || !source.rawPath || !source.normalizedPath || !source.sha256) {
      throw new Error(`capacity resource source is not fully collected: ${spec.sourceId}`);
    }
    if (source.publishedAt !== spec.publishedAt
      || spec.publishedAt > spec.candidate.decisionDate) {
      throw new Error(`post-outcome evidence is forbidden: ${spec.candidate.id}`);
    }
    const normalized = await readFile(
      path.resolve(advisorPaths(root).root, source.normalizedPath),
      'utf8',
    );
    const amySegments = extractSpeakerSegments(normalized)
      .filter(({ speaker }) => speaker === 'Amy Hood');
    const spans: PilotEvidenceSpan[] = spec.evidence.map((span) => ({
      ...span,
      sourceId: spec.sourceId,
      eventCandidateId: spec.candidate.id,
      publishedAt: spec.publishedAt,
    }));
    for (const span of spans) {
      if (normalized.slice(span.startChar, span.endChar) !== span.exactQuote) {
        throw new Error(`exact quote offset mismatch: ${span.id}`);
      }
      if (span.speaker !== 'Amy Hood'
        || !amySegments.some(({ startChar, endChar }) =>
          startChar <= span.startChar && endChar >= span.endChar)) {
        throw new Error(`Amy Hood speaker ownership is invalid: ${span.id}`);
      }
    }

    const artifactPath = path.resolve(advisorPaths(root).root, source.rawPath);
    const artifact = await readJsonFile<AdvisorRawSource | null>(artifactPath, null);
    if (!artifact || artifact.sourceId !== source.id) {
      throw new Error(`raw source ownership mismatch: ${source.id}`);
    }
    const bodyHash = createHash('sha256')
      .update(Buffer.from(artifact.bodyBase64, 'base64'))
      .digest('hex');
    if (bodyHash !== source.sha256) {
      throw new Error(`raw source hash mismatch: ${source.id}`);
    }

    const eventCandidateIds = [...new Set([
      ...source.eventCandidateIds,
      spec.candidate.id,
    ])].sort();
    source.eventCandidateIds = eventCandidateIds;
    artifact.metadata.eventCandidateIds = eventCandidateIds;
    rawSourceUpdates.push({ record: structuredClone(source), artifact });
    additions.push(buildCandidate(spec, source));
    cards.push(buildCard(spec, spans));
  }

  const nextCandidates = [...candidates, ...additions];
  if (new Set(nextCandidates.map(({ id }) => id)).size !== nextCandidates.length) {
    throw new Error('capacity resource candidates contain duplicate IDs');
  }
  const currentPilot = await readJsonFile<PilotManifest>(advisorPaths(root).pilotManifest, {
    dataset: 'amy_hood_phase_3_pilot',
    version: '1.0.0',
    targets: [],
  });
  const replacementTargets = manifest.events.map((event) => ({
    candidateId: event.candidate.id,
    domain: 'ai_cloud_capex' as const,
    priority: event.replacePriority,
    replacementReason: event.replacePriority === 7
      ? 'Replace an incomplete M&A target with direct Amy resource-allocation evidence.'
      : 'Replace a sealed holdout target with reviewed non-holdout capacity evidence.',
  }));
  const nextPilot = validatePilotManifest({
    ...currentPilot,
    targets: [
      ...currentPilot.targets.filter(({ priority }) => ![6, 7, 8].includes(priority)),
      ...replacementTargets,
    ].sort((left, right) => left.priority - right.priority),
  }, nextCandidates);

  return {
    candidates: nextCandidates,
    registry,
    rawSourceUpdates,
    pilotManifest: nextPilot,
    cards,
  };
};

export { eventCardPath };
