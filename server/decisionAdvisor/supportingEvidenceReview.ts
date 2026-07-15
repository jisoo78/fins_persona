import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  AdvisorRawSource,
  AdvisorSourceRecord,
  EventCandidate,
  EventDiscriminatorKind,
  EventFingerprintAlias,
} from '../../shared/amyHoodDecisionAdvisor';
import { readAdvisorArtifactSecure } from './artifactStore';
import { writeJsonAtomic } from './jsonStore';
import { normalizeDocument } from './officialSourceCollector';
import { advisorPaths } from './paths';
import { approveReviewedSource, loadRegistry } from './sourceRegistry';
import { canonicalizeSourceUrl } from './sourcePolicy';

export type SupportingEvidenceReviewDecision =
  | 'approved_context'
  | 'approved_counterevidence'
  | 'approved_post_outcome'
  | 'review_required'
  | 'rejected';

export type SupportingEvidenceReviewReason =
  | 'verified_event_context'
  | 'verified_counterevidence'
  | 'verified_post_outcome'
  | 'duplicate_document_family'
  | 'insufficient_decision_context'
  | 'post_outcome_only'
  | 'source_unavailable';

export type SupportingEvidenceReviewManifest = {
  reviewId: string;
  reviewer: string;
  reviewedAt: string;
  decision: SupportingEvidenceReviewDecision;
  reasonCode: SupportingEvidenceReviewReason;
  sourceId: string;
  canonicalUrl: string;
  rawPath: string | null;
  normalizedPath: string | null;
  sha256: string | null;
  candidateId: string;
  sourceType: string;
  documentFamilyId: string;
  sameDocumentCanonicalUrls: string[];
  temporalRelation: 'pre_decision' | 'decision_time' | 'post_outcome';
  role: 'contemporaneous_context' | 'counterevidence' | 'post_outcome';
  quoteStart: number;
  quoteEnd: number;
  passageStart: number;
  passageEnd: number;
  exactQuote: string;
  exactRelevancePassage: string;
  anchorTerms: string[];
  eventDiscriminators: Array<{
    kind: EventDiscriminatorKind;
    value: string;
  }>;
  aliases: EventFingerprintAlias[];
  reviewerRationale: string;
};

export type VerifiedSupportingEvidenceReview = {
  manifest: SupportingEvidenceReviewManifest;
  source: AdvisorSourceRecord;
  candidate: EventCandidate;
  raw: AdvisorRawSource | null;
  normalized: string | null;
};

export type SupportingEvidenceReviewApplyResult = {
  reviewId: string;
  decision: SupportingEvidenceReviewDecision;
  changed: boolean;
  candidateId: string;
  sourceId: string;
};

export type SupportingEvidenceReviewDependencies = {
  validateCandidates(candidates: EventCandidate[]): void;
  persistCandidates(candidates: EventCandidate[], candidatePath: string): Promise<void>;
  approveSource(
    root: string,
    sourceId: string,
    speaker: string | null,
  ): Promise<{ source: AdvisorSourceRecord; changed: boolean }>;
};

const decisions = new Set<SupportingEvidenceReviewDecision>([
  'approved_context',
  'approved_counterevidence',
  'approved_post_outcome',
  'review_required',
  'rejected',
]);
const reasons = new Set<SupportingEvidenceReviewReason>([
  'verified_event_context',
  'verified_counterevidence',
  'verified_post_outcome',
  'duplicate_document_family',
  'insufficient_decision_context',
  'post_outcome_only',
  'source_unavailable',
]);
const temporalRelations = new Set(['pre_decision', 'decision_time', 'post_outcome']);
const roles = new Set(['contemporaneous_context', 'counterevidence', 'post_outcome']);
const discriminatorKinds = new Set<EventDiscriminatorKind>([
  'named_entity',
  'decision_action',
  'event_specific',
]);
const approvedDecisions = new Set<SupportingEvidenceReviewDecision>([
  'approved_context',
  'approved_counterevidence',
  'approved_post_outcome',
]);
const nonblank = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const isoInstant = (value: unknown): value is string =>
  typeof value === 'string'
  && !Number.isNaN(new Date(value).valueOf())
  && new Date(value).toISOString() === value;
const validOffset = (value: unknown) =>
  Number.isInteger(value) && (value as number) >= 0;
const normalizedSearchText = (value: string) =>
  value.replace(/\s+/g, ' ').trim().toLowerCase();
const discriminatorKey = ({ kind, value }: { kind: string; value: string }) =>
  kind + ':' + normalizedSearchText(value);
const aliasKey = ({ kind, value, sourceUrl }: EventFingerprintAlias) =>
  kind + ':' + normalizedSearchText(value) + ':' + sourceUrl;

const canonicalFingerprintValue = (
  candidate: EventCandidate,
  kind: EventDiscriminatorKind,
) => ({
  named_entity: candidate.eventFingerprint.primaryEntity,
  decision_action: candidate.eventFingerprint.decisionAction,
  event_specific: candidate.eventFingerprint.eventSpecificIdentifier,
})[kind];

const roleForDecision = (
  decision: SupportingEvidenceReviewDecision,
): SupportingEvidenceReviewManifest['role'] | null => ({
  approved_context: 'contemporaneous_context' as const,
  approved_counterevidence: 'counterevidence' as const,
  approved_post_outcome: 'post_outcome' as const,
  review_required: null,
  rejected: null,
})[decision];

const hasArtifactIdentity = (
  manifest: SupportingEvidenceReviewManifest,
): manifest is SupportingEvidenceReviewManifest & {
  rawPath: string;
  normalizedPath: string;
  sha256: string;
} => nonblank(manifest.rawPath)
  && nonblank(manifest.normalizedPath)
  && typeof manifest.sha256 === 'string'
  && /^[a-f0-9]{64}$/.test(manifest.sha256);

export const validateSupportingEvidenceReviewManifest = (
  value: unknown,
): SupportingEvidenceReviewManifest => {
  if (typeof value !== 'object' || value === null) {
    throw new Error('supporting evidence review manifest must be an object');
  }
  const manifest = value as SupportingEvidenceReviewManifest;
  if (!roles.has(manifest.role)) {
    throw new Error('supporting evidence review manifest has an invalid supporting role');
  }
  if (!nonblank(manifest.reviewId)
    || !/^[a-z0-9][a-z0-9-]+$/i.test(manifest.reviewId)
    || !nonblank(manifest.reviewer)
    || !isoInstant(manifest.reviewedAt)
    || !decisions.has(manifest.decision)
    || !reasons.has(manifest.reasonCode)
    || !nonblank(manifest.sourceId)
    || !nonblank(manifest.candidateId)
    || !nonblank(manifest.canonicalUrl)
    || canonicalizeSourceUrl(manifest.canonicalUrl) !== manifest.canonicalUrl
    || !nonblank(manifest.sourceType)
    || !/^[a-z0-9][a-z0-9-]{2,63}$/.test(manifest.documentFamilyId)
    || !temporalRelations.has(manifest.temporalRelation)
    || !nonblank(manifest.reviewerRationale)
    || manifest.reviewerRationale.trim().length < 40) {
    throw new Error('supporting evidence review manifest has invalid identity or review metadata');
  }

  if (!Array.isArray(manifest.sameDocumentCanonicalUrls)
    || manifest.sameDocumentCanonicalUrls.length === 0
    || !manifest.sameDocumentCanonicalUrls.includes(manifest.canonicalUrl)
    || new Set(manifest.sameDocumentCanonicalUrls).size
      !== manifest.sameDocumentCanonicalUrls.length
    || manifest.sameDocumentCanonicalUrls.some((url) =>
      !nonblank(url) || canonicalizeSourceUrl(url) !== url)) {
    throw new Error('supporting evidence review manifest has invalid same-document URLs');
  }

  const expectedRole = roleForDecision(manifest.decision);
  if (expectedRole !== null && manifest.role !== expectedRole) {
    throw new Error('supporting evidence review manifest has an invalid role for its decision');
  }
  if (manifest.decision === 'approved_post_outcome'
    && manifest.temporalRelation !== 'post_outcome') {
    throw new Error('approved post-outcome evidence requires post_outcome temporal relation');
  }
  if ((manifest.decision === 'approved_context'
      || manifest.decision === 'approved_counterevidence')
    && manifest.temporalRelation === 'post_outcome') {
    throw new Error('core supporting evidence cannot use post_outcome temporal relation');
  }

  const artifactFields = [manifest.rawPath, manifest.normalizedPath, manifest.sha256];
  const isUnavailable = manifest.decision === 'review_required'
    && manifest.reasonCode === 'source_unavailable';
  if (isUnavailable) {
    if (artifactFields.some((field) => field !== null)
      || [manifest.quoteStart, manifest.quoteEnd, manifest.passageStart, manifest.passageEnd]
        .some((offset) => offset !== 0)
      || manifest.exactQuote !== ''
      || manifest.exactRelevancePassage !== '') {
      throw new Error('unavailable supporting source must not claim artifacts or exact evidence');
    }
  } else if (!hasArtifactIdentity(manifest)) {
    throw new Error('supporting evidence review requires immutable artifact identity');
  }

  const exactEvidenceRequired = approvedDecisions.has(manifest.decision);
  if (exactEvidenceRequired) {
    if (!nonblank(manifest.exactQuote)
      || manifest.exactQuote.length < 20
      || !nonblank(manifest.exactRelevancePassage)
      || manifest.exactRelevancePassage.length < 20
      || manifest.exactRelevancePassage.length > 1_200
      || !Array.isArray(manifest.anchorTerms)
      || manifest.anchorTerms.length < 2
      || manifest.anchorTerms.some((term) => !nonblank(term))
      || !Array.isArray(manifest.eventDiscriminators)
      || manifest.eventDiscriminators.length !== 3
      || manifest.eventDiscriminators.some(({ kind, value }) =>
        !discriminatorKinds.has(kind) || !nonblank(value))
      || new Set(manifest.eventDiscriminators.map(({ kind }) => kind)).size !== 3) {
      throw new Error('supporting evidence review manifest has invalid exact evidence');
    }
    const offsets = [
      manifest.quoteStart,
      manifest.quoteEnd,
      manifest.passageStart,
      manifest.passageEnd,
    ];
    if (offsets.some((offset) => !validOffset(offset))
      || manifest.quoteStart >= manifest.quoteEnd
      || manifest.passageStart >= manifest.passageEnd
      || manifest.quoteStart < manifest.passageStart
      || manifest.quoteEnd > manifest.passageEnd
      || manifest.quoteEnd - manifest.quoteStart !== manifest.exactQuote.length
      || manifest.passageEnd - manifest.passageStart
        !== manifest.exactRelevancePassage.length) {
      throw new Error('supporting evidence review manifest has invalid offsets');
    }
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
    throw new Error('supporting evidence review manifest has an invalid alias');
  }
  return manifest;
};

export const loadSupportingEvidenceReviewManifest = async (filePath: string) => {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
  } catch (error) {
    throw new Error(
      'invalid supporting evidence review manifest JSON: '
      + (error instanceof Error ? error.message : String(error)),
    );
  }
  return validateSupportingEvidenceReviewManifest(value);
};

const loadCandidates = async (root: string) => {
  const candidatePath = path.join(advisorPaths(root).root, 'event-candidates.json');
  const candidates = JSON.parse(await readFile(candidatePath, 'utf8')) as EventCandidate[];
  return { candidatePath, candidates };
};

const verifyAliases = (
  manifest: SupportingEvidenceReviewManifest,
  candidate: EventCandidate,
) => {
  for (const alias of manifest.aliases) {
    if (alias.canonicalValue !== canonicalFingerprintValue(candidate, alias.kind)
      || alias.sourceUrl !== manifest.canonicalUrl
      || alias.reviewStatus !== 'reviewed') {
      throw new Error(
        'supporting review has an invalid event alias: ' + manifest.reviewId,
      );
    }
  }
  const allowed = new Set([
    discriminatorKey({
      kind: 'named_entity',
      value: candidate.eventFingerprint.primaryEntity,
    }),
    discriminatorKey({
      kind: 'decision_action',
      value: candidate.eventFingerprint.decisionAction,
    }),
    discriminatorKey({
      kind: 'event_specific',
      value: candidate.eventFingerprint.eventSpecificIdentifier,
    }),
    ...manifest.aliases.map(discriminatorKey),
  ]);
  if (manifest.eventDiscriminators.some((item) =>
    !allowed.has(discriminatorKey(item)))) {
    throw new Error(
      'supporting review contains an unsupported event discriminator: '
      + manifest.reviewId,
    );
  }
};

const temporalRelationMatches = (
  manifest: SupportingEvidenceReviewManifest,
  source: AdvisorSourceRecord,
  candidate: EventCandidate,
) => {
  if (!source.publishedAt) return false;
  if (manifest.temporalRelation === 'decision_time') {
    return source.publishedAt >= candidate.decisionWindowStart
      && source.publishedAt <= candidate.decisionWindowEnd;
  }
  if (manifest.temporalRelation === 'pre_decision') {
    return source.publishedAt < candidate.decisionWindowStart;
  }
  return source.publishedAt > candidate.decisionWindowEnd;
};

export const verifySupportingEvidenceReview = async (
  root: string,
  input: SupportingEvidenceReviewManifest,
): Promise<VerifiedSupportingEvidenceReview> => {
  const manifest = validateSupportingEvidenceReviewManifest(input);
  const source = loadRegistry(root).sources.find(({ id }) => id === manifest.sourceId);
  if (!source) throw new Error('unknown supporting source: ' + manifest.sourceId);
  if (source.canonicalUrl !== manifest.canonicalUrl
    || source.rawPath !== manifest.rawPath
    || source.normalizedPath !== manifest.normalizedPath
    || source.sha256 !== manifest.sha256
    || source.sourceType !== manifest.sourceType
    || source.temporalRole !== manifest.temporalRelation
    || !source.eventCandidateIds.includes(manifest.candidateId)) {
    throw new Error(
      'supporting review does not match registry source: ' + manifest.reviewId,
    );
  }

  const { candidates } = await loadCandidates(root);
  const candidate = candidates.find(({ id }) => id === manifest.candidateId);
  if (!candidate) {
    throw new Error('unknown supporting review candidate: ' + manifest.candidateId);
  }
  const association = candidate.sourceAssociations.find(({ canonicalUrl: url }) =>
    canonicalizeSourceUrl(url) === manifest.canonicalUrl);
  if (!association
    || association.sourceType !== manifest.sourceType
    || association.temporalRelation !== manifest.temporalRelation
    || association.publishedAt !== source.publishedAt
    || !temporalRelationMatches(manifest, source, candidate)) {
    throw new Error(
      'supporting review does not match candidate temporal association: '
      + manifest.reviewId,
    );
  }
  for (const canonicalUrl of manifest.sameDocumentCanonicalUrls) {
    if (!candidate.sourceAssociations.some(({ canonicalUrl: url }) =>
      canonicalizeSourceUrl(url) === canonicalUrl)) {
      throw new Error(
        'same-document URL is not associated with the candidate: ' + canonicalUrl,
      );
    }
  }

  if (!hasArtifactIdentity(manifest)) {
    return { manifest, source, candidate, raw: null, normalized: null };
  }

  const raw = JSON.parse(
    (await readAdvisorArtifactSecure(root, manifest.rawPath)).toString('utf8'),
  ) as AdvisorRawSource;
  if (raw.sourceId !== manifest.sourceId
    || raw.requestedCanonicalUrl !== manifest.canonicalUrl
    || raw.metadata.id !== manifest.sourceId
    || raw.metadata.sha256 !== manifest.sha256
    || typeof raw.bodyBase64 !== 'string') {
    throw new Error(
      'supporting review raw artifact metadata mismatch: ' + manifest.reviewId,
    );
  }
  const body = Buffer.from(raw.bodyBase64, 'base64');
  if (body.toString('base64') !== raw.bodyBase64.replace(/\s+/g, '')
    || createHash('sha256').update(body).digest('hex') !== manifest.sha256) {
    throw new Error(
      'supporting review source body hash mismatch: ' + manifest.reviewId,
    );
  }
  const normalized = normalizeDocument(body.toString('utf8'), raw.mediaType);
  const saved = (
    await readAdvisorArtifactSecure(root, manifest.normalizedPath)
  ).toString('utf8');
  if (saved !== normalized) {
    throw new Error(
      'supporting review normalized artifact mismatch: ' + manifest.reviewId,
    );
  }

  if (approvedDecisions.has(manifest.decision)) {
    if (normalized.slice(manifest.quoteStart, manifest.quoteEnd)
        !== manifest.exactQuote
      || normalized.slice(manifest.passageStart, manifest.passageEnd)
        !== manifest.exactRelevancePassage) {
      throw new Error(
        'supporting review exact evidence does not match normalized offsets: '
        + manifest.reviewId,
      );
    }
    verifyAliases(manifest, candidate);
    const passage = normalizedSearchText(manifest.exactRelevancePassage);
    if (manifest.eventDiscriminators.some(({ value }) =>
      !passage.includes(normalizedSearchText(value)))) {
      throw new Error(
        'supporting review passage lacks an event discriminator: '
        + manifest.reviewId,
      );
    }
    if (!passage.includes(normalizedSearchText(manifest.exactQuote))) {
      throw new Error(
        'supporting review passage does not contain the exact quote: '
        + manifest.reviewId,
      );
    }
  }

  return { manifest, source, candidate, raw, normalized };
};

const defaultDependencies: SupportingEvidenceReviewDependencies = {
  validateCandidates: () => undefined,
  persistCandidates: (candidates, candidatePath) =>
    writeJsonAtomic(candidatePath, candidates),
  approveSource: approveReviewedSource,
};

export const applySupportingEvidenceReview = async (
  root: string,
  input: SupportingEvidenceReviewManifest,
  injectedDependencies: Partial<SupportingEvidenceReviewDependencies> = {},
): Promise<SupportingEvidenceReviewApplyResult> => {
  const verified = await verifySupportingEvidenceReview(root, input);
  const { manifest } = verified;
  const result = (changed: boolean): SupportingEvidenceReviewApplyResult => ({
    reviewId: manifest.reviewId,
    decision: manifest.decision,
    changed,
    candidateId: manifest.candidateId,
    sourceId: manifest.sourceId,
  });
  if (manifest.decision === 'review_required') return result(false);

  const { candidatePath, candidates } = await loadCandidates(root);
  const originalCandidateBytes = await readFile(candidatePath, 'utf8');
  const candidate = candidates.find(({ id }) => id === manifest.candidateId);
  if (!candidate) {
    throw new Error('unknown supporting review candidate: ' + manifest.candidateId);
  }
  const association = candidate.sourceAssociations.find(({ canonicalUrl: url }) =>
    canonicalizeSourceUrl(url) === manifest.canonicalUrl);
  if (!association) {
    throw new Error(
      'supporting review does not match candidate association: ' + manifest.reviewId,
    );
  }
  const recordedReview = association.reviewerNote.match(/^review:([^\s]+)/)?.[1];
  if (recordedReview && recordedReview !== manifest.reviewId) {
    throw new Error('conflicting supporting evidence review: ' + recordedReview);
  }

  const originalDirectGap = JSON.stringify(candidate.directEvidenceGap);
  const originalPhase3Status = candidate.phase3Status;
  if (manifest.decision === 'rejected') {
    const expectedNote = 'review:' + manifest.reviewId + ' ' + manifest.reviewerRationale;
    if (association.reviewStatus === 'rejected'
      && association.reviewerNote === expectedNote) {
      return result(false);
    }
    association.reviewStatus = 'rejected';
    association.reviewerNote = expectedNote;
  } else {
    const expectedRole = roleForDecision(manifest.decision);
    if (expectedRole === null) {
      throw new Error('approved supporting review requires a supporting role');
    }
    association.role = expectedRole;
    association.relevanceClaim = manifest.reviewerRationale;
    association.documentFamilyId = manifest.documentFamilyId;
    association.evidenceLocator = {
      exactQuote: manifest.exactQuote,
      exactRelevancePassage: manifest.exactRelevancePassage,
      anchorTerms: manifest.anchorTerms,
      eventDiscriminators: manifest.eventDiscriminators,
      speaker: null,
    };
    association.reviewStatus = 'reviewed';
    association.reviewerNote =
      'review:' + manifest.reviewId + ' ' + manifest.reviewerRationale;

    for (const canonicalUrl of manifest.sameDocumentCanonicalUrls) {
      const sameDocument = candidate.sourceAssociations.find(({ canonicalUrl: url }) =>
        canonicalizeSourceUrl(url) === canonicalUrl);
      if (!sameDocument) {
        throw new Error(
          'same-document URL is not associated with the candidate: ' + canonicalUrl,
        );
      }
      sameDocument.documentFamilyId = manifest.documentFamilyId;
    }

    const aliases = [...(candidate.eventFingerprint.aliases ?? [])];
    const keys = new Set(aliases.map(aliasKey));
    for (const alias of manifest.aliases) {
      if (!keys.has(aliasKey(alias))) {
        aliases.push(alias);
        keys.add(aliasKey(alias));
      }
    }
    candidate.eventFingerprint.aliases = aliases;
  }

  if (JSON.stringify(candidate.directEvidenceGap) !== originalDirectGap
    || candidate.phase3Status !== originalPhase3Status) {
    throw new Error('supporting evidence review cannot change direct evidence state');
  }

  const sourceNeedsApproval = approvedDecisions.has(manifest.decision)
    && verified.source.collectionStatus !== 'approved';
  const serializedCandidates = JSON.stringify(candidates, null, 2) + '\n';
  if (serializedCandidates === originalCandidateBytes && !sourceNeedsApproval) {
    return result(false);
  }

  const dependencies = { ...defaultDependencies, ...injectedDependencies };
  dependencies.validateCandidates(candidates);
  await dependencies.persistCandidates(candidates, candidatePath);
  if (!approvedDecisions.has(manifest.decision)) return result(true);

  try {
    await dependencies.approveSource(root, manifest.sourceId, null);
  } catch (error) {
    try {
      await writeJsonAtomic(
        candidatePath,
        JSON.parse(originalCandidateBytes) as unknown,
      );
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        'supporting evidence approval failed and candidate compensation was incomplete',
      );
    }
    throw error;
  }
  return result(true);
};
