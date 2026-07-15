import { createHash } from 'node:crypto';

import type {
  AdvisorRawSource,
  AdvisorSourceRecord,
  EventCandidate,
  EvidenceSpeakerSegment,
  PilotEvidenceSpan,
  PilotPolicyEvidenceRecord,
  PilotPolicyTag,
} from '../../shared/amyHoodDecisionAdvisor';
import { readAdvisorArtifactSecure } from './artifactStore';
import { readJsonFile } from './jsonStore';
import { loadPilotManifest } from './pilotManifest';
import { advisorPaths } from './paths';
import { loadRegistry } from './sourceRegistry';

const policyTags = new Set<PilotPolicyTag>([
  'value_based_pricing',
  'capital_allocation_return',
  'investment_consistency',
  'cost_revenue_alignment',
  'resource_reallocation',
  'platform_shift_commitment',
  'risk_and_optionality',
]);

type PolicyEvidenceValidationInput = {
  candidate: EventCandidate;
  source: AdvisorSourceRecord;
  normalizedText: string;
  speakerSegments: EvidenceSpeakerSegment[];
};

const isIsoTimestamp = (value: string) => {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
};

const quoteIsInsideAmyBoundary = (
  record: PilotPolicyEvidenceRecord,
  source: AdvisorSourceRecord,
  segments: EvidenceSpeakerSegment[],
) => source.speaker === 'Amy Hood' || segments.some((segment) =>
  segment.speaker === 'Amy Hood'
  && segment.startChar <= record.startChar
  && segment.endChar >= record.endChar);

export const validatePilotPolicyEvidenceRecord = (
  record: PilotPolicyEvidenceRecord,
  input: PolicyEvidenceValidationInput,
): PilotEvidenceSpan => {
  if (!/^policy-[a-z0-9-]+$/.test(record.id)
    || record.candidateId !== input.candidate.id
    || record.sourceId !== input.source.id) {
    throw new Error('policy evidence identity is invalid');
  }
  if (!Number.isInteger(record.startChar)
    || !Number.isInteger(record.endChar)
    || record.startChar < 0
    || record.endChar <= record.startChar
    || record.endChar > input.normalizedText.length
    || input.normalizedText.slice(record.startChar, record.endChar) !== record.exactQuote) {
    throw new Error('policy evidence quote does not match immutable source');
  }
  if (record.publishedAt !== input.source.publishedAt) {
    throw new Error('policy evidence date does not match its source');
  }
  if (record.publishedAt >= input.candidate.decisionWindowStart) {
    throw new Error('policy evidence must predate the decision window');
  }
  if (record.speaker !== 'Amy Hood'
    || !quoteIsInsideAmyBoundary(record, input.source, input.speakerSegments)) {
    throw new Error('policy evidence requires an Amy Hood speaker boundary');
  }
  if (!Array.isArray(record.policyTags)
    || record.policyTags.length === 0
    || record.policyTags.some((tag) => !policyTags.has(tag))) {
    throw new Error('policy evidence contains an invalid policy tag');
  }
  if (record.eventLinkRationale.trim().length < 40
    || record.reviewer.trim().length === 0
    || !isIsoTimestamp(record.reviewedAt)) {
    throw new Error('policy evidence review metadata is invalid');
  }
  return {
    id: `span-${createHash('sha256').update(record.id).digest('hex').slice(0, 16)}`,
    sourceId: record.sourceId,
    eventCandidateId: record.candidateId,
    role: 'amy_policy',
    exactQuote: record.exactQuote,
    startChar: record.startChar,
    endChar: record.endChar,
    publishedAt: record.publishedAt,
    speaker: 'Amy Hood',
  };
};

const loadSpeakerSegments = async (
  root: string,
  source: AdvisorSourceRecord,
): Promise<EvidenceSpeakerSegment[]> => {
  if (!source.rawPath) return [];
  const raw = JSON.parse(
    (await readAdvisorArtifactSecure(root, source.rawPath)).toString('utf8'),
  ) as AdvisorRawSource;
  return raw.speakerSegments ?? [];
};

export const loadValidatedPilotPolicyEvidence = async (
  root: string,
  candidates: EventCandidate[],
): Promise<Map<string, PilotEvidenceSpan[]>> => {
  const records = await readJsonFile<PilotPolicyEvidenceRecord[]>(
    advisorPaths(root).pilotPolicyEvidence,
    [],
  );
  if (!Array.isArray(records)) throw new Error('pilot policy evidence must be an array');
  if (records.length === 0) return new Map();
  const manifest = await loadPilotManifest(root, candidates);
  const targetIds = new Set(manifest.targets.map(({ candidateId }) => candidateId));
  const registry = loadRegistry(root);
  const result = new Map<string, PilotEvidenceSpan[]>();
  const recordIds = new Set<string>();

  for (const record of records) {
    if (recordIds.has(record.id)) throw new Error(`duplicate policy evidence ID: ${record.id}`);
    recordIds.add(record.id);
    if (!targetIds.has(record.candidateId)) {
      throw new Error(`policy evidence candidate is outside the pilot: ${record.candidateId}`);
    }
    const candidate = candidates.find(({ id }) => id === record.candidateId);
    const source = registry.sources.find(({ id }) => id === record.sourceId);
    if (!candidate || !source?.normalizedPath || !source.sha256) {
      throw new Error(`policy evidence source is unavailable: ${record.id}`);
    }
    if (!source.eventCandidateIds.includes(candidate.id)) {
      throw new Error(`policy evidence source is not linked to candidate: ${record.id}`);
    }
    const normalizedText = (
      await readAdvisorArtifactSecure(root, source.normalizedPath)
    ).toString('utf8');
    const span = validatePilotPolicyEvidenceRecord(record, {
      candidate,
      source,
      normalizedText,
      speakerSegments: await loadSpeakerSegments(root, source),
    });
    result.set(candidate.id, [...(result.get(candidate.id) ?? []), span]);
  }
  return result;
};
