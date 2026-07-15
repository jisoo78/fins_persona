import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  AdvisorRawSource,
  AdvisorSourceRecord,
  EventCandidate,
  EventDiscriminatorKind,
  EventFingerprintAlias,
  EvidenceSpeakerSegment,
} from '../../shared/amyHoodDecisionAdvisor';
import { readAdvisorArtifactSecure } from './artifactStore';
import { writeJsonAtomic } from './jsonStore';
import { normalizeDocument } from './officialSourceCollector';
import { advisorPaths } from './paths';
import { approveReviewedSource, loadRegistry } from './sourceRegistry';
import { canonicalizeSourceUrl } from './sourcePolicy';

export type DirectEvidenceReviewDecision =
  | 'approved_direct'
  | 'approved_context'
  | 'review_required'
  | 'rejected';

export type DirectEvidenceReviewManifest = {
  reviewId: string;
  reviewer: string;
  reviewedAt: string;
  decision: DirectEvidenceReviewDecision;
  sourceId: string;
  canonicalUrl: string;
  rawPath: string;
  normalizedPath: string;
  sha256: string;
  candidateId: string;
  temporalRelation: 'pre_decision' | 'decision_time' | 'post_outcome';
  speaker: 'Amy Hood';
  speakerSegmentStart: number;
  speakerSegmentEnd: number;
  quoteStart: number;
  quoteEnd: number;
  passageStart: number;
  passageEnd: number;
  exactQuote: string;
  exactRelevancePassage: string;
  anchorTerms: string[];
  eventDiscriminators: Array<{ kind: EventDiscriminatorKind; value: string }>;
  aliases: EventFingerprintAlias[];
  financialSignals: string[];
  reviewerRationale: string;
};

export type VerifiedDirectEvidenceReview = {
  manifest: DirectEvidenceReviewManifest;
  source: AdvisorSourceRecord;
  candidate: EventCandidate;
  raw: AdvisorRawSource;
  normalized: string;
  segment: EvidenceSpeakerSegment;
};

export type DirectEvidenceReviewApplyResult = {
  reviewId: string;
  decision: DirectEvidenceReviewDecision;
  changed: boolean;
  candidateId: string;
  sourceId: string;
};

export type DirectEvidenceReviewDependencies = {
  validateCandidates(candidates: EventCandidate[]): void;
  persistCandidates(candidates: EventCandidate[], candidatePath: string): Promise<void>;
  approveSource(
    root: string,
    sourceId: string,
    speaker: string | null,
  ): Promise<{ source: AdvisorSourceRecord; changed: boolean }>;
};

const decisions = new Set<DirectEvidenceReviewDecision>([
  'approved_direct',
  'approved_context',
  'review_required',
  'rejected',
]);
const temporalRelations = new Set(['pre_decision', 'decision_time', 'post_outcome']);
const discriminatorKinds = new Set<EventDiscriminatorKind>([
  'named_entity',
  'decision_action',
  'event_specific',
]);
const nonblank = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const isoInstant = (value: unknown): value is string =>
  typeof value === 'string'
  && !Number.isNaN(new Date(value).valueOf())
  && new Date(value).toISOString() === value;
const normalizedSearchText = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
const discriminatorKey = ({ kind, value }: { kind: string; value: string }) =>
  `${kind}:${normalizedSearchText(value)}`;

const canonicalFingerprintValue = (
  candidate: EventCandidate,
  kind: EventDiscriminatorKind,
) => ({
  named_entity: candidate.eventFingerprint.primaryEntity,
  decision_action: candidate.eventFingerprint.decisionAction,
  event_specific: candidate.eventFingerprint.eventSpecificIdentifier,
})[kind];

const validOffset = (value: unknown) => Number.isInteger(value) && (value as number) >= 0;

export const validateDirectEvidenceReviewManifest = (
  value: unknown,
): DirectEvidenceReviewManifest => {
  if (typeof value !== 'object' || value === null) {
    throw new Error('direct evidence review manifest must be an object');
  }
  const manifest = value as DirectEvidenceReviewManifest;
  if (!nonblank(manifest.reviewId)
    || !/^[a-z0-9][a-z0-9-]+$/i.test(manifest.reviewId)
    || !nonblank(manifest.reviewer)
    || !isoInstant(manifest.reviewedAt)
    || !decisions.has(manifest.decision)
    || !nonblank(manifest.sourceId)
    || !nonblank(manifest.candidateId)
    || !nonblank(manifest.canonicalUrl)
    || canonicalizeSourceUrl(manifest.canonicalUrl) !== manifest.canonicalUrl
    || !nonblank(manifest.rawPath)
    || !nonblank(manifest.normalizedPath)
    || !/^[a-f0-9]{64}$/.test(manifest.sha256)
    || !temporalRelations.has(manifest.temporalRelation)
    || manifest.speaker !== 'Amy Hood'
    || !nonblank(manifest.exactQuote)
    || manifest.exactQuote.length < 20
    || !nonblank(manifest.exactRelevancePassage)
    || manifest.exactRelevancePassage.length < 20
    || manifest.exactRelevancePassage.length > 1_200
    || !Array.isArray(manifest.anchorTerms)
    || manifest.anchorTerms.length < 2
    || manifest.anchorTerms.some((term) => !nonblank(term))
    || !Array.isArray(manifest.financialSignals)
    || manifest.financialSignals.length === 0
    || manifest.financialSignals.some((signal) => !nonblank(signal))
    || !nonblank(manifest.reviewerRationale)
    || manifest.reviewerRationale.trim().length < 40) {
    throw new Error('direct evidence review manifest has invalid identity or review metadata');
  }

  const offsets = [
    manifest.speakerSegmentStart,
    manifest.speakerSegmentEnd,
    manifest.quoteStart,
    manifest.quoteEnd,
    manifest.passageStart,
    manifest.passageEnd,
  ];
  if (offsets.some((offset) => !validOffset(offset))
    || manifest.speakerSegmentStart >= manifest.speakerSegmentEnd
    || manifest.passageStart >= manifest.passageEnd
    || manifest.quoteStart >= manifest.quoteEnd
    || manifest.passageStart < manifest.speakerSegmentStart
    || manifest.passageEnd > manifest.speakerSegmentEnd
    || manifest.quoteStart < manifest.passageStart
    || manifest.quoteEnd > manifest.passageEnd
    || manifest.quoteEnd - manifest.quoteStart !== manifest.exactQuote.length
    || manifest.passageEnd - manifest.passageStart !== manifest.exactRelevancePassage.length) {
    throw new Error('direct evidence review manifest has invalid offsets');
  }

  if (!Array.isArray(manifest.eventDiscriminators)
    || manifest.eventDiscriminators.length !== 3
    || manifest.eventDiscriminators.some(({ kind, value }) =>
      !discriminatorKinds.has(kind) || !nonblank(value))
    || new Set(manifest.eventDiscriminators.map(({ kind }) => kind)).size !== 3
    || new Set(manifest.eventDiscriminators.map(discriminatorKey)).size !== 3) {
    throw new Error('direct evidence review manifest has invalid event discriminators');
  }
  if (!Array.isArray(manifest.aliases)
    || manifest.aliases.some((alias) =>
      !discriminatorKinds.has(alias.kind)
      || !nonblank(alias.canonicalValue)
      || !nonblank(alias.value)
      || alias.value.trim().length < 4
      || canonicalizeSourceUrl(alias.sourceUrl) !== manifest.canonicalUrl
      || alias.reviewStatus !== 'reviewed'
      || !nonblank(alias.reviewerNote)
      || alias.reviewerNote.trim().length < 20)) {
    throw new Error('direct evidence review manifest has an invalid alias');
  }
  return manifest;
};

export const loadDirectEvidenceReviewManifest = async (filePath: string) => {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(`invalid direct evidence review manifest JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return validateDirectEvidenceReviewManifest(value);
};

const loadCandidate = async (root: string, candidateId: string) => {
  const candidatePath = path.join(advisorPaths(root).root, 'event-candidates.json');
  const candidates = JSON.parse(await readFile(candidatePath, 'utf8')) as EventCandidate[];
  const candidate = candidates.find(({ id }) => id === candidateId);
  if (!candidate) throw new Error(`unknown reviewed candidate: ${candidateId}`);
  return candidate;
};

const verifyManifestAliases = (
  manifest: DirectEvidenceReviewManifest,
  candidate: EventCandidate,
) => {
  for (const alias of manifest.aliases) {
    if (alias.canonicalValue !== canonicalFingerprintValue(candidate, alias.kind)
      || alias.sourceUrl !== manifest.canonicalUrl
      || alias.reviewStatus !== 'reviewed') {
      throw new Error(`review manifest has an invalid event alias: ${manifest.reviewId}`);
    }
  }
  const allowed = new Set([
    discriminatorKey({ kind: 'named_entity', value: candidate.eventFingerprint.primaryEntity }),
    discriminatorKey({ kind: 'decision_action', value: candidate.eventFingerprint.decisionAction }),
    discriminatorKey({ kind: 'event_specific', value: candidate.eventFingerprint.eventSpecificIdentifier }),
    ...manifest.aliases.map(discriminatorKey),
  ]);
  if (manifest.eventDiscriminators.some((item) => !allowed.has(discriminatorKey(item)))) {
    throw new Error(`review manifest contains an unsupported event discriminator: ${manifest.reviewId}`);
  }
};

export const verifyDirectEvidenceReview = async (
  root: string,
  input: DirectEvidenceReviewManifest,
): Promise<VerifiedDirectEvidenceReview> => {
  const manifest = validateDirectEvidenceReviewManifest(input);
  const source = loadRegistry(root).sources.find(({ id }) => id === manifest.sourceId);
  if (!source) throw new Error(`unknown reviewed source: ${manifest.sourceId}`);
  if (source.canonicalUrl !== manifest.canonicalUrl
    || source.rawPath !== manifest.rawPath
    || source.normalizedPath !== manifest.normalizedPath
    || source.sha256 !== manifest.sha256
    || !source.eventCandidateIds.includes(manifest.candidateId)) {
    throw new Error(`review manifest does not match registry source: ${manifest.reviewId}`);
  }

  const raw = JSON.parse(
    (await readAdvisorArtifactSecure(root, manifest.rawPath)).toString('utf8'),
  ) as AdvisorRawSource;
  if (raw.sourceId !== manifest.sourceId
    || raw.requestedCanonicalUrl !== manifest.canonicalUrl
    || raw.metadata.id !== manifest.sourceId
    || raw.metadata.sha256 !== manifest.sha256
    || typeof raw.bodyBase64 !== 'string') {
    throw new Error(`review raw artifact metadata mismatch: ${manifest.reviewId}`);
  }
  const body = Buffer.from(raw.bodyBase64, 'base64');
  if (body.toString('base64') !== raw.bodyBase64.replace(/\s+/g, '')
    || createHash('sha256').update(body).digest('hex') !== manifest.sha256) {
    throw new Error(`review source body hash mismatch: ${manifest.reviewId}`);
  }
  const normalized = normalizeDocument(body.toString('utf8'), raw.mediaType);
  const saved = (await readAdvisorArtifactSecure(root, manifest.normalizedPath)).toString('utf8');
  if (saved !== normalized) {
    throw new Error(`review normalized artifact mismatch: ${manifest.reviewId}`);
  }

  const segment = raw.speakerSegments.find(({ speaker, startChar, endChar }) =>
    speaker === manifest.speaker
    && startChar === manifest.speakerSegmentStart
    && endChar === manifest.speakerSegmentEnd);
  if (!segment) throw new Error(`review manifest has no matching Amy Hood speaker segment: ${manifest.reviewId}`);
  if (normalized.slice(manifest.quoteStart, manifest.quoteEnd) !== manifest.exactQuote
    || normalized.slice(manifest.passageStart, manifest.passageEnd) !== manifest.exactRelevancePassage) {
    throw new Error(`review manifest exact evidence does not match normalized offsets: ${manifest.reviewId}`);
  }

  const candidate = await loadCandidate(root, manifest.candidateId);
  const association = candidate.sourceAssociations.find(({ canonicalUrl }) =>
    canonicalizeSourceUrl(canonicalUrl) === manifest.canonicalUrl);
  if (!association || association.temporalRelation !== manifest.temporalRelation) {
    throw new Error(`review manifest does not match candidate association: ${manifest.reviewId}`);
  }
  verifyManifestAliases(manifest, candidate);
  const normalizedPassage = normalizedSearchText(manifest.exactRelevancePassage);
  if (manifest.eventDiscriminators.some(({ value }) =>
    !normalizedPassage.includes(normalizedSearchText(value)))) {
    throw new Error(`review passage does not contain every event discriminator: ${manifest.reviewId}`);
  }
  if (!normalizedSearchText(manifest.exactRelevancePassage)
    .includes(normalizedSearchText(manifest.exactQuote))) {
    throw new Error(`review passage does not contain the exact Amy Hood quote: ${manifest.reviewId}`);
  }

  return { manifest, source, candidate, raw, normalized, segment };
};

const aliasKey = ({ kind, value, sourceUrl }: EventFingerprintAlias) =>
  `${kind}:${normalizedSearchText(value)}:${sourceUrl}`;

const defaultApplyDependencies: DirectEvidenceReviewDependencies = {
  validateCandidates: () => undefined,
  persistCandidates: (candidates, candidatePath) => writeJsonAtomic(candidatePath, candidates),
  approveSource: approveReviewedSource,
};

export const applyDirectEvidenceReview = async (
  root: string,
  input: DirectEvidenceReviewManifest,
  injectedDependencies: Partial<DirectEvidenceReviewDependencies> = {},
): Promise<DirectEvidenceReviewApplyResult> => {
  const verified = await verifyDirectEvidenceReview(root, input);
  const { manifest } = verified;
  const result = (changed: boolean): DirectEvidenceReviewApplyResult => ({
    reviewId: manifest.reviewId,
    decision: manifest.decision,
    changed,
    candidateId: manifest.candidateId,
    sourceId: manifest.sourceId,
  });
  if (manifest.decision === 'review_required' || manifest.decision === 'rejected') {
    return result(false);
  }

  const candidatePath = path.join(advisorPaths(root).root, 'event-candidates.json');
  const originalCandidateBytes = await readFile(candidatePath, 'utf8');
  const candidates = JSON.parse(originalCandidateBytes) as EventCandidate[];
  const candidate = candidates.find(({ id }) => id === manifest.candidateId);
  if (!candidate) throw new Error(`unknown reviewed candidate: ${manifest.candidateId}`);
  const associationIndex = candidate.sourceAssociations.findIndex(({ canonicalUrl }) =>
    canonicalizeSourceUrl(canonicalUrl) === manifest.canonicalUrl);
  if (associationIndex < 0) {
    throw new Error(`review manifest does not match candidate association: ${manifest.reviewId}`);
  }
  const association = candidate.sourceAssociations[associationIndex];
  const recordedReview = association.reviewerNote.match(/^review:([^\s]+)/)?.[1];
  if (recordedReview && recordedReview !== manifest.reviewId) {
    throw new Error(`conflicting direct evidence review: ${recordedReview}`);
  }

  const locator = {
    exactQuote: manifest.exactQuote,
    exactRelevancePassage: manifest.exactRelevancePassage,
    anchorTerms: manifest.anchorTerms,
    eventDiscriminators: manifest.eventDiscriminators,
    speaker: manifest.speaker,
  };
  const expectedAssociation = {
    ...association,
    role: manifest.decision === 'approved_direct' ? 'direct_amy' as const : 'contemporaneous_context' as const,
    relevanceClaim: manifest.reviewerRationale,
    evidenceLocator: locator,
    reviewStatus: 'reviewed' as const,
    reviewerNote: `review:${manifest.reviewId} ${manifest.reviewerRationale}`,
  };
  const aliases = [...(candidate.eventFingerprint.aliases ?? [])];
  const existingAliasKeys = new Set(aliases.map(aliasKey));
  for (const alias of manifest.aliases) {
    if (!existingAliasKeys.has(aliasKey(alias))) {
      aliases.push(alias);
      existingAliasKeys.add(aliasKey(alias));
    }
  }

  const expectedSourceSpeaker = manifest.decision === 'approved_direct' ? manifest.speaker : null;
  const sourceAlreadyApproved = verified.source.collectionStatus === 'approved'
    && verified.source.speaker === expectedSourceSpeaker;
  const associationAlreadyApplied = JSON.stringify(association) === JSON.stringify(expectedAssociation);
  const aliasesAlreadyApplied = JSON.stringify(candidate.eventFingerprint.aliases ?? [])
    === JSON.stringify(aliases);
  const gapAlreadyApplied = manifest.decision === 'approved_direct'
    ? candidate.directEvidenceGap === null && candidate.phase3Status === 'eligible'
    : true;
  if (sourceAlreadyApproved && associationAlreadyApplied && aliasesAlreadyApplied && gapAlreadyApplied) {
    return result(false);
  }

  candidate.sourceAssociations[associationIndex] = expectedAssociation;
  candidate.eventFingerprint.aliases = aliases;
  if (manifest.decision === 'approved_direct') {
    candidate.directEvidenceGap = null;
    candidate.phase3Status = 'eligible';
  }

  const dependencies = { ...defaultApplyDependencies, ...injectedDependencies };
  dependencies.validateCandidates(candidates);
  await dependencies.persistCandidates(candidates, candidatePath);
  try {
    await dependencies.approveSource(root, manifest.sourceId, expectedSourceSpeaker);
  } catch (error) {
    try {
      await writeJsonAtomic(candidatePath, JSON.parse(originalCandidateBytes) as unknown);
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        'direct evidence approval failed and candidate compensation was incomplete',
      );
    }
    throw error;
  }
  return result(true);
};
