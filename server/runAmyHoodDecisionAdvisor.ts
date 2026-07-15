import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  AdvisorRawSource,
  AdvisorSourceRecord,
  DecisionDomain,
  EventCandidate,
  EventDiscriminatorKind,
} from '../shared/amyHoodDecisionAdvisor';
import { readAdvisorArtifactSecure } from './decisionAdvisor/artifactStore';
import {
  applyDirectEvidenceReview,
  loadDirectEvidenceReviewManifest,
  verifyDirectEvidenceReview,
} from './decisionAdvisor/directEvidenceReview';
import {
  applySupportingEvidenceReview,
  loadSupportingEvidenceReviewManifest,
  verifySupportingEvidenceReview,
} from './decisionAdvisor/supportingEvidenceReview';
import {
  loadPdfUrlInventory,
  mergePdfUrlInventory,
} from './decisionAdvisor/pdfUrlInventory';
import { importReviewedSource, type ReviewedSourceImport } from './decisionAdvisor/manualSourceImporter';
import {
  collectOfficialSource,
  extractDeclaredCanonicalUrl,
  extractSpeakerSegments,
  normalizeDocument,
} from './decisionAdvisor/officialSourceCollector';
import {
  loadRegistry,
  loadSourceRecord,
} from './decisionAdvisor/sourceRegistry';
import { canonicalizeSourceUrl } from './decisionAdvisor/sourcePolicy';
import {
  importTranscript,
  type TranscriptImport,
} from './decisionAdvisor/transcriptImporter';
import {
  approvePilotEventCard,
  eventCardPath,
} from './decisionAdvisor/eventCard';
import { loadPilotManifest } from './decisionAdvisor/pilotManifest';
import { loadValidatedPilotPolicyEvidence } from './decisionAdvisor/pilotPolicyEvidence';
import { registrySourceHasEvidenceLink } from './decisionAdvisor/sourceEvidenceLink';
import {
  buildPilotBatch,
  buildPilotEvent,
  buildPilotReport,
} from './decisionAdvisor/pilotReport';
import { readJsonFile } from './decisionAdvisor/jsonStore';
import { createModelClient } from './personaPipeline/modelClient';
import type { PilotDecisionEvent } from '../shared/amyHoodDecisionAdvisor';

const DECISION_DOMAINS: DecisionDomain[] = [
  'm_and_a',
  'ai_cloud_capex',
  'pricing_monetization',
  'cost_efficiency',
  'shareholder_return_risk',
];

const SUPPORTING_EVIDENCE_BATCH_IDS = [
  'candidate-nokia-acquisition-2013',
  'candidate-mojang-acquisition-2014',
  'candidate-github-acquisition-2018',
  'candidate-nuance-acquisition-2021',
] as const;

type CandidateCheck = {
  candidateCount: number;
  uniqueDiscoveryUrlCount: number;
  domainCounts: Record<DecisionDomain, number>;
};

export type SourceCheck = {
  discoveredUrlCount: number;
  validDocumentCount: number;
  postOutcomeUrlCount: number;
  failedCount: number;
  reviewRequiredCount: number;
};

export type CandidateEvidenceCoverage = {
  coreDocumentFamilyCount: number;
  coreSourceIds: string[];
  directAmySourceIds: string[];
  postOutcomeDocumentCount: number;
  deficits: string[];
  outcome: 'passed' | 'partial' | 'blocked';
};

export type SourceInspection = SourceCheck & {
  candidateCoverage: Record<string, CandidateEvidenceCoverage>;
  deficits: string[];
};

const normalizedSearchText = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
const normalizedFingerprintText = (value: string) => value.normalize('NFKD')
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();
const relevanceDiscriminatorKinds = new Set([
  'named_entity',
  'decision_action',
  'event_specific',
]);

const fingerprintDiscriminators = (candidate: EventCandidate) => [
  { kind: 'named_entity', value: candidate.eventFingerprint.primaryEntity },
  { kind: 'decision_action', value: candidate.eventFingerprint.decisionAction },
  { kind: 'event_specific', value: candidate.eventFingerprint.eventSpecificIdentifier },
] as const;

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

const allowedFingerprintKeys = (candidate: EventCandidate) => {
  const associationUrls = new Set(candidate.sourceAssociations.map(({ canonicalUrl }) =>
    canonicalizeSourceUrl(canonicalUrl)));
  const aliases = candidate.eventFingerprint.aliases ?? [];
  for (const alias of aliases) {
    if (alias.reviewStatus !== 'reviewed'
      || !relevanceDiscriminatorKinds.has(alias.kind)
      || alias.canonicalValue !== canonicalFingerprintValue(candidate, alias.kind)
      || alias.value.trim().length < 4
      || normalizedSearchText(alias.value) === normalizedSearchText(alias.canonicalValue)
      || !associationUrls.has(canonicalizeSourceUrl(alias.sourceUrl))
      || alias.reviewerNote.trim().length < 20) {
      throw new Error(`candidate ${candidate.id} has an invalid event fingerprint alias`);
    }
  }
  return new Set([
    ...fingerprintDiscriminators(candidate).map(discriminatorKey),
    ...aliases.map(({ kind, value }) => discriminatorKey({ kind, value })),
  ]);
};

const candidateSpecificLocator = (candidate: EventCandidate, anchorTerms: string[]) => {
  const ignored = new Set([
    'acquisition', 'authorization', 'decision', 'economics', 'investment', 'microsoft',
    'pricing', 'program', 'review', 'return', 'risk', 'under', 'with',
  ]);
  const titleTerms = candidate.workingTitle.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return anchorTerms.some((anchor) => {
    const normalizedAnchor = anchor.toLowerCase();
    return titleTerms.some((term) => term.length >= 4
      && !ignored.has(term)
      && normalizedAnchor.includes(term));
  });
};

const isIsoDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
};

const isOutcomeOnlyTitle = (title: string) => {
  const outcome = /\b(?:completed|closed|result|outcome|success|successful)\b/i.test(title);
  const decision = /\b(?:decision|plan|proposal|review|investment|allocation|acquisition|pricing|cost|return|risk)\b/i.test(title);
  return outcome && !decision;
};

export const validateEventCandidates = (
  value: unknown,
  options: { enforceDiscoveryRange?: boolean } = {},
): CandidateCheck => {
  if (!Array.isArray(value)) throw new Error('event candidates must be a JSON array');
  if (value.length !== 30) throw new Error(`expected exactly 30 candidates; found ${value.length}`);

  const candidates = value as EventCandidate[];
  const ids = new Set<string>();
  const urls = new Set<string>();
  const domainCounts = Object.fromEntries(
    DECISION_DOMAINS.map((domain) => [domain, 0]),
  ) as Record<DecisionDomain, number>;

  for (const [index, candidate] of candidates.entries()) {
    if (!candidate || typeof candidate !== 'object') {
      throw new Error(`candidate at index ${index} must be an object`);
    }
    if (typeof candidate.id !== 'string' || candidate.id.trim() === '') {
      throw new Error(`candidate at index ${index} has an invalid ID`);
    }
    if (ids.has(candidate.id)) throw new Error(`duplicate candidate ID: ${candidate.id}`);
    ids.add(candidate.id);
    if (!DECISION_DOMAINS.includes(candidate.domain)) {
      throw new Error(`candidate ${candidate.id} has an invalid domain: ${candidate.domain}`);
    }
    domainCounts[candidate.domain] += 1;
    if (typeof candidate.workingTitle !== 'string' || candidate.workingTitle.trim() === '') {
      throw new Error(`candidate ${candidate.id} has an empty working title`);
    }
    if (isOutcomeOnlyTitle(candidate.workingTitle)) {
      throw new Error(`candidate ${candidate.id} has an outcome-only working title`);
    }
    if (!isIsoDate(candidate.decisionWindowStart) || !isIsoDate(candidate.decisionWindowEnd)) {
      throw new Error(`candidate ${candidate.id} has an invalid decision window date`);
    }
    if (candidate.decisionWindowStart > candidate.decisionWindowEnd) {
      throw new Error(`candidate ${candidate.id} has an inverted decision window`);
    }
    if (!candidate.decisionWindowBasis
      || typeof candidate.decisionWindowBasis.summary !== 'string'
      || candidate.decisionWindowBasis.summary.trim().length < 20
      || !Array.isArray(candidate.decisionWindowBasis.sourceUrls)
      || candidate.decisionWindowBasis.sourceUrls.length === 0
      || typeof candidate.decisionWindowBasis.reviewerNote !== 'string'
      || candidate.decisionWindowBasis.reviewerNote.trim().length < 10) {
      throw new Error(`candidate ${candidate.id} requires a sourced decision window basis`);
    }
    if (!candidate.eventFingerprint
      || typeof candidate.eventFingerprint.primaryEntity !== 'string'
      || candidate.eventFingerprint.primaryEntity.trim() === ''
      || typeof candidate.eventFingerprint.decisionAction !== 'string'
      || candidate.eventFingerprint.decisionAction.trim() === ''
      || typeof candidate.eventFingerprint.eventSpecificIdentifier !== 'string'
      || candidate.eventFingerprint.eventSpecificIdentifier.trim() === ''
      || !Array.isArray(candidate.eventFingerprint.sourceUrls)
      || candidate.eventFingerprint.sourceUrls.length === 0
      || candidate.eventFingerprint.reviewStatus !== 'reviewed'
      || typeof candidate.eventFingerprint.reviewerNote !== 'string'
      || candidate.eventFingerprint.reviewerNote.trim().length < 10) {
      throw new Error(`candidate ${candidate.id} requires a reviewed event fingerprint`);
    }
    const normalizedTitle = normalizedFingerprintText(candidate.workingTitle);
    if (![candidate.eventFingerprint.primaryEntity, candidate.eventFingerprint.eventSpecificIdentifier]
      .some((value) => normalizedTitle.includes(normalizedFingerprintText(value)))) {
      throw new Error(`candidate ${candidate.id} event fingerprint does not match its working title`);
    }
    if (!Array.isArray(candidate.sourceAssociations) || candidate.sourceAssociations.length === 0) {
      throw new Error(`candidate ${candidate.id} requires a reviewed source association`);
    }
    const allowedDiscriminatorKeys = allowedFingerprintKeys(candidate);
    const reviewedAssociations = candidate.sourceAssociations.filter(
      ({ reviewStatus }) => reviewStatus === 'reviewed',
    );
    if (reviewedAssociations.length === 0) {
      throw new Error(`candidate ${candidate.id} requires a reviewed source association`);
    }
    for (const association of candidate.sourceAssociations) {
      const canonicalUrl = canonicalizeSourceUrl(association.canonicalUrl);
      if (association.documentFamilyId !== undefined
        && !/^[a-z0-9][a-z0-9-]{2,63}$/.test(association.documentFamilyId)) {
        throw new Error(`candidate ${candidate.id} has an invalid document family ID`);
      }
      if (!canonicalUrl.startsWith('https://')) {
        throw new Error(`candidate ${candidate.id} association URL must use HTTPS`);
      }
      if (!['direct_amy', 'contemporaneous_context', 'counterevidence', 'post_outcome']
        .includes(association.role)
        || !['pre_decision', 'decision_time', 'post_outcome'].includes(association.temporalRelation)
        || typeof association.sourceType !== 'string'
        || association.sourceType.trim() === ''
        || !(association.publishedAt === null || isIsoDate(association.publishedAt))
        || typeof association.relevanceClaim !== 'string'
        || association.relevanceClaim.trim().length < 20
        || !['unreviewed', 'reviewed', 'rejected'].includes(association.reviewStatus)
        || typeof association.reviewerNote !== 'string'
        || association.reviewerNote.trim().length < 10) {
        throw new Error(`candidate ${candidate.id} has an invalid source association`);
      }
      const locator = association.evidenceLocator;
      if (association.reviewStatus === 'reviewed'
        && (!isIsoDate(association.publishedAt) || !locator)) {
        throw new Error(`candidate ${candidate.id} reviewed association requires a date and evidence locator`);
      }
      if (locator
        && (typeof locator.exactQuote !== 'string'
          || locator.exactQuote.trim().length < 20
          || typeof locator.exactRelevancePassage !== 'string'
          || locator.exactRelevancePassage.trim().length < 20
          || locator.exactRelevancePassage.length > 1_200
          || !Array.isArray(locator.anchorTerms)
          || locator.anchorTerms.length < 2
          || locator.anchorTerms.every((term) => /^amy hood$/i.test(term.trim()))
          || !Array.isArray(locator.eventDiscriminators)
          || locator.eventDiscriminators.length !== 3
          || locator.eventDiscriminators.some(({ value, kind }) =>
            typeof value !== 'string'
            || value.trim() === ''
            || !relevanceDiscriminatorKinds.has(kind))
          || new Set(locator.eventDiscriminators.map(({ value }) =>
            normalizedSearchText(value))).size !== locator.eventDiscriminators.length
          || new Set(locator.eventDiscriminators.map(discriminatorKey)).size !== 3)) {
        throw new Error(`candidate ${candidate.id} has an invalid source association evidence locator`);
      }
      if (locator) {
        if (locator.eventDiscriminators.some((item) =>
          !allowedDiscriminatorKeys.has(discriminatorKey(item)))) {
          throw new Error(`candidate ${candidate.id} association discriminators do not match its event fingerprint`);
        }
        const relevancePassage = normalizedSearchText(locator.exactRelevancePassage);
        if (!locator.eventDiscriminators.every(({ value }) =>
          relevancePassage.includes(normalizedSearchText(value)))) {
          throw new Error(`candidate ${candidate.id} exact relevance passage does not contain its event fingerprint`);
        }
        if (association.role === 'direct_amy'
          && !relevancePassage.includes(normalizedSearchText(locator.exactQuote))) {
          throw new Error(`candidate ${candidate.id} direct Amy exact quote must be contained by its exact relevance passage`);
        }
        if (association.role === 'direct_amy' && locator.speaker !== 'Amy Hood') {
          throw new Error(`candidate ${candidate.id} direct Amy association requires an exact speaker locator`);
        }
      }
      if (association.publishedAt !== null
        && association.temporalRelation === 'decision_time'
        && (association.publishedAt < candidate.decisionWindowStart
          || association.publishedAt > candidate.decisionWindowEnd)) {
        throw new Error(`candidate ${candidate.id} association contradicts its decision window`);
      }
      if (association.publishedAt !== null
        && association.temporalRelation === 'pre_decision'
        && association.publishedAt >= candidate.decisionWindowStart) {
        throw new Error(`candidate ${candidate.id} association contradicts its pre-decision relation`);
      }
      if (association.publishedAt !== null
        && association.temporalRelation === 'post_outcome'
        && association.publishedAt <= candidate.decisionWindowEnd) {
        throw new Error(`candidate ${candidate.id} association contradicts its post-outcome relation`);
      }
      if (association.reviewStatus === 'reviewed' && association.temporalRelation !== 'post_outcome') {
        urls.add(canonicalUrl);
      }
    }
    const associationUrls = new Set(candidate.sourceAssociations.map(
      ({ canonicalUrl }) => canonicalizeSourceUrl(canonicalUrl),
    ));
    for (const fingerprintUrl of candidate.eventFingerprint.sourceUrls) {
      const canonicalFingerprintUrl = canonicalizeSourceUrl(fingerprintUrl);
      if (!candidate.sourceAssociations.some((association) =>
        association.reviewStatus === 'reviewed'
        && canonicalizeSourceUrl(association.canonicalUrl) === canonicalFingerprintUrl)
        || !candidate.decisionWindowBasis.sourceUrls.some((basisUrl) =>
          canonicalizeSourceUrl(basisUrl) === canonicalFingerprintUrl)) {
        throw new Error(`candidate ${candidate.id} fingerprint source requires a reviewed association and window basis at the same URL`);
      }
    }
    for (const basisUrl of candidate.decisionWindowBasis.sourceUrls) {
      if (!associationUrls.has(canonicalizeSourceUrl(basisUrl))) {
        throw new Error(`candidate ${candidate.id} window-basis source lacks an association`);
      }
    }
    const reviewedDirect = reviewedAssociations.some(({ role }) => role === 'direct_amy');
    if (reviewedDirect === Boolean(candidate.directEvidenceGap)) {
      throw new Error(`candidate ${candidate.id} must record either direct Amy evidence or a reviewed directEvidenceGap`);
    }
    if (candidate.directEvidenceGap) {
      if (candidate.directEvidenceGap.reviewStatus !== 'reviewed'
        || candidate.directEvidenceGap.reason.trim().length < 20
        || candidate.directEvidenceGap.reviewerNote.trim().length < 10
        || candidate.phase3Status !== 'evidence_gap') {
        throw new Error(`candidate ${candidate.id} has an invalid directEvidenceGap`);
      }
    } else if (candidate.phase3Status !== 'eligible') {
      throw new Error(`candidate ${candidate.id} with direct evidence must be Phase 3 eligible`);
    }
    if (!Array.isArray(candidate.discoveryUrls) || candidate.discoveryUrls.length === 0) {
      throw new Error(`candidate ${candidate.id} must include compatibility discovery URLs`);
    }
    for (const sourceUrl of candidate.discoveryUrls) {
      const canonicalUrl = canonicalizeSourceUrl(sourceUrl);
      if (!canonicalUrl.startsWith('https://')) {
        throw new Error(`candidate ${candidate.id} discovery URL must use HTTPS`);
      }
      if (!associationUrls.has(canonicalUrl)) {
        throw new Error(`candidate ${candidate.id} discovery URL lacks a source association`);
      }
    }
    if (typeof candidate.notes !== 'string' || typeof candidate.status !== 'string') {
      throw new Error(`candidate ${candidate.id} has invalid review metadata`);
    }
  }

  for (const domain of DECISION_DOMAINS) {
    if (domainCounts[domain] < 4) {
      throw new Error(`domain ${domain} requires at least 4 candidates; found ${domainCounts[domain]}`);
    }
  }
  if (options.enforceDiscoveryRange !== false && (urls.size < 100 || urls.size > 150)) {
    throw new Error(`expected 100-150 unique discovery URLs; found ${urls.size}`);
  }

  return {
    candidateCount: candidates.length,
    uniqueDiscoveryUrlCount: urls.size,
    domainCounts,
  };
};

const isArtifactBackedDocument = (source: AdvisorSourceRecord) => new Set([
  'collected',
  'normalized',
  'review_required',
  'approved',
]).has(source.collectionStatus)
  && source.tier !== 'discovery_only'
  && source.failureReason === null;

const verifySourceArtifact = async (root: string, source: AdvisorSourceRecord) => {
  if (!isArtifactBackedDocument(source)
    || !source.rawPath
    || !source.normalizedPath
    || !source.sha256
    || !source.capturedAt) return null;

  try {
    const rawBytes = await readAdvisorArtifactSecure(root, source.rawPath);
    const raw = JSON.parse(rawBytes.toString('utf8')) as AdvisorRawSource;
    const structuredProvenance = raw.requestedCanonicalUrl !== undefined
      || raw.finalUrl !== undefined
      || raw.redirectChain !== undefined
      || source.finalUrl !== undefined
      || source.redirectChain !== undefined;
    const requestedCanonicalUrl = structuredProvenance
      ? raw.requestedCanonicalUrl
      : raw.metadata?.canonicalUrl;
    const finalUrl = structuredProvenance ? raw.finalUrl : raw.canonicalUrl;
    const redirectChain = structuredProvenance
      ? raw.redirectChain
      : requestedCanonicalUrl === finalUrl
        ? [requestedCanonicalUrl]
        : [requestedCanonicalUrl, finalUrl];
    if (raw.sourceId !== source.id
      || requestedCanonicalUrl !== source.canonicalUrl
      || typeof finalUrl !== 'string'
      || raw.canonicalUrl !== finalUrl
      || !Array.isArray(redirectChain)
      || redirectChain.length < 1
      || redirectChain.length > 6
      || redirectChain[0] !== source.canonicalUrl
      || redirectChain.at(-1) !== finalUrl
      || redirectChain.some((url) => typeof url !== 'string' || !url.startsWith('https://'))
      || (structuredProvenance
        && (source.finalUrl !== finalUrl
          || JSON.stringify(source.redirectChain) !== JSON.stringify(redirectChain)))
      || raw.metadata?.canonicalUrl !== source.canonicalUrl
      || raw.metadata?.id !== source.id
      || raw.metadata?.sha256 !== source.sha256
      || raw.metadata?.capturedAt !== source.capturedAt
      || raw.metadata?.publishedAt !== source.publishedAt
      || raw.metadata?.temporalRole !== source.temporalRole
      || raw.metadata?.sourceType !== source.sourceType
      || JSON.stringify(raw.metadata?.eventCandidateIds) !== JSON.stringify(source.eventCandidateIds)
      || typeof raw.bodyBase64 !== 'string') return null;
    const body = Buffer.from(raw.bodyBase64, 'base64');
    if (body.toString('base64') !== raw.bodyBase64.replace(/\s+/g, '')) return null;
    if (createHash('sha256').update(body).digest('hex') !== source.sha256) return null;
    if (!structuredProvenance
      && requestedCanonicalUrl !== finalUrl
      && extractDeclaredCanonicalUrl(body.toString('utf8'), raw.mediaType) !== finalUrl) return null;
    const normalized = await readAdvisorArtifactSecure(root, source.normalizedPath);
    const normalizedText = normalized.toString('utf8');
    if (normalizedText.replace(/\s+/g, ' ').trim().length < 200) return null;
    if (source.collector === 'manual_import' || source.collector === 'transcript_import') {
      if (createHash('sha256').update(normalized).digest('hex') !== source.sha256) return null;
    } else if (normalizedText !== normalizeDocument(body.toString('utf8'), raw.mediaType)) {
      return null;
    }
    const speakerSegments = Array.isArray(raw.speakerSegments)
      ? raw.speakerSegments
      : extractSpeakerSegments(normalizedText);
    if (speakerSegments.some((segment) =>
      typeof segment?.speaker !== 'string'
      || !Number.isInteger(segment.startChar)
      || !Number.isInteger(segment.endChar)
      || segment.startChar < 0
      || segment.endChar <= segment.startChar
      || segment.endChar > normalizedText.length)) return null;
    return { normalizedText, speakerSegments };
  } catch {
    return null;
  }
};

const temporalRoleMatches = (source: AdvisorSourceRecord, candidates: EventCandidate[]) => {
  if (!source.publishedAt || !/^\d{4}-\d{2}-\d{2}$/.test(source.publishedAt)) return false;
  return candidates.every((candidate) => {
    if (source.temporalRole === 'decision_time') {
      return source.publishedAt! >= candidate.decisionWindowStart
        && source.publishedAt! <= candidate.decisionWindowEnd;
    }
    if (source.temporalRole === 'pre_decision') {
      return source.publishedAt! < candidate.decisionWindowStart;
    }
    return source.publishedAt! > candidate.decisionWindowEnd;
  });
};

export const inspectSourceInventory = async (
  root: string,
  candidates: EventCandidate[],
): Promise<SourceInspection> => {
  const registry = loadRegistry(root);
  const policyEvidence = await loadValidatedPilotPolicyEvidence(root, candidates);
  const policySourceIds = new Set(
    [...policyEvidence.values()].flat().map(({ sourceId }) => sourceId),
  );
  const candidateIds = new Set(candidates.map(({ id }) => id));
  const associationsByUrl = new Map<string, Array<{
    candidate: EventCandidate;
    association: EventCandidate['sourceAssociations'][number];
  }>>();
  for (const candidate of candidates) {
    for (const association of candidate.sourceAssociations) {
      const canonicalUrl = canonicalizeSourceUrl(association.canonicalUrl);
      associationsByUrl.set(canonicalUrl, [
        ...(associationsByUrl.get(canonicalUrl) ?? []),
        { candidate, association },
      ]);
    }
  }
  const reviewedCoreUrls = new Set<string>();
  const reviewedPostOutcomeUrls = new Set<string>();
  for (const [canonicalUrl, links] of associationsByUrl) {
    if (links.some(({ association }) => association.reviewStatus === 'reviewed'
      && association.temporalRelation !== 'post_outcome')) reviewedCoreUrls.add(canonicalUrl);
    if (links.some(({ association }) => association.reviewStatus === 'reviewed'
      && association.temporalRelation === 'post_outcome')) reviewedPostOutcomeUrls.add(canonicalUrl);
  }
  const matchedByCandidate = new Map<string, Array<{
    source: AdvisorSourceRecord;
    role: EventCandidate['sourceAssociations'][number]['role'];
    association: EventCandidate['sourceAssociations'][number];
  }>>();
  const postOutcomeSourceIdsByCandidate = new Map<string, Set<string>>();
  const validSourceIds = new Set<string>();
  const registryUrls = new Set(registry.sources.map(({ canonicalUrl }) => canonicalUrl));
  const candidateAssociationUrls = new Set(associationsByUrl.keys());

  for (const source of registry.sources) {
    const associationLinks = associationsByUrl.get(source.canonicalUrl) ?? [];
    if (!registrySourceHasEvidenceLink(
      source.canonicalUrl,
      source.id,
      candidateAssociationUrls,
      policySourceIds,
    )) {
      throw new Error(`registry source is not linked from the candidate matrix: ${source.id}`);
    }
    if (source.eventCandidateIds.length === 0
      || source.eventCandidateIds.some((id) => !candidateIds.has(id))) {
      throw new Error(`registry source has an unknown candidate link: ${source.id}`);
    }
    const artifact = await verifySourceArtifact(root, source);
    if (!artifact) continue;
    for (const { candidate, association } of associationLinks) {
      if (source.eventCandidateIds.includes(candidate.id)
        && association.reviewStatus === 'reviewed'
        && association.temporalRelation === 'post_outcome'
        && association.sourceType === source.sourceType
        && association.publishedAt === source.publishedAt
        && association.temporalRelation === source.temporalRole
        && temporalRoleMatches(source, [candidate])) {
        const sourceIds = postOutcomeSourceIdsByCandidate.get(candidate.id) ?? new Set<string>();
        sourceIds.add(source.id);
        postOutcomeSourceIdsByCandidate.set(candidate.id, sourceIds);
      }
      if (!source.eventCandidateIds.includes(candidate.id)
        || association.reviewStatus !== 'reviewed'
        || !association.evidenceLocator
        || association.temporalRelation === 'post_outcome'
        || association.sourceType !== source.sourceType
        || association.publishedAt !== source.publishedAt
        || association.temporalRelation !== source.temporalRole
        || !temporalRoleMatches(source, [candidate])
        || !candidateSpecificLocator(candidate, association.evidenceLocator.anchorTerms)) continue;
      const searchable = normalizedSearchText(artifact.normalizedText);
      const exactQuote = normalizedSearchText(association.evidenceLocator.exactQuote);
      const quoteIndex = searchable.indexOf(exactQuote);
      if (quoteIndex < 0) continue;
      const exactRelevancePassage = normalizedSearchText(
        association.evidenceLocator.exactRelevancePassage,
      );
      const relevanceIndex = searchable.indexOf(exactRelevancePassage);
      if (relevanceIndex < 0) continue;
      const locatorWindow = exactRelevancePassage;
      if (!association.evidenceLocator.eventDiscriminators.every(({ value }) =>
        locatorWindow.includes(normalizedSearchText(value)))) continue;
      if (association.role === 'direct_amy') {
        const originalQuote = association.evidenceLocator.exactQuote.trim();
        const originalQuoteStart = artifact.normalizedText.toLocaleLowerCase()
          .indexOf(originalQuote.toLocaleLowerCase());
        const originalRelevancePassage = association.evidenceLocator.exactRelevancePassage.trim();
        const originalRelevanceStart = artifact.normalizedText.toLocaleLowerCase()
          .indexOf(originalRelevancePassage.toLocaleLowerCase());
        if (association.evidenceLocator.speaker !== 'Amy Hood'
          || source.speaker !== 'Amy Hood'
          || originalQuoteStart < 0
          || originalRelevanceStart < 0
          || !artifact.speakerSegments.some((segment) =>
            segment.speaker.toLocaleLowerCase() === 'amy hood'
            && segment.startChar <= originalRelevanceStart
            && segment.endChar >= originalRelevanceStart + originalRelevancePassage.length)) continue;
      }
      validSourceIds.add(source.id);
      matchedByCandidate.set(candidate.id, [
        ...(matchedByCandidate.get(candidate.id) ?? []),
        { source, role: association.role, association },
      ]);
    }
  }

  const result: SourceCheck = {
    discoveredUrlCount: [...reviewedCoreUrls].filter((url) => registryUrls.has(url)).length,
    validDocumentCount: validSourceIds.size,
    postOutcomeUrlCount: [...reviewedPostOutcomeUrls].filter((url) => registryUrls.has(url)).length,
    failedCount: registry.sources.filter(({ collectionStatus }) => collectionStatus === 'failed').length,
    reviewRequiredCount: registry.sources.filter(
      ({ collectionStatus }) => collectionStatus === 'review_required',
    ).length,
  };
  const deficits: string[] = [];
  const candidateCoverage: Record<string, CandidateEvidenceCoverage> = {};
  for (const candidate of candidates) {
    const matched = matchedByCandidate.get(candidate.id) ?? [];
    const familyCount = new Set(matched.map(({ source, association }) =>
      association.documentFamilyId ?? `source-type:${source.sourceType}`)).size;
    const directAmySourceIds = matched
      .filter(({ role }) => role === 'direct_amy')
      .map(({ source }) => source.id);
    const candidateDeficits: string[] = [];
    if (matched.length === 0) {
      const message = `${candidate.id} lacks a reviewed event-relevant artifact`;
      deficits.push(message);
      candidateDeficits.push(message);
    }
    if (familyCount < 2) {
      const message = `${candidate.id} lacks a reviewed collected second document family`;
      deficits.push(message);
      candidateDeficits.push(message);
    }
    if (!candidate.directEvidenceGap
      && directAmySourceIds.length === 0) {
      const message = `${candidate.id} lacks a verified candidate-specific direct Amy locator`;
      deficits.push(message);
      candidateDeficits.push(message);
    }
    if (directAmySourceIds.length === 0) {
      candidateDeficits.push(`${candidate.id} has no verified direct Amy evidence`);
    }
    candidateCoverage[candidate.id] = {
      coreDocumentFamilyCount: familyCount,
      coreSourceIds: [...new Set(matched.map(({ source }) => source.id))],
      directAmySourceIds,
      postOutcomeDocumentCount: postOutcomeSourceIdsByCandidate.get(candidate.id)?.size ?? 0,
      deficits: [...new Set(candidateDeficits)],
      outcome: familyCount >= 2 && directAmySourceIds.length > 0
        ? 'passed'
        : matched.length > 0
          ? 'partial'
          : 'blocked',
    };
  }
  if (result.discoveredUrlCount < 100) {
    const deficit = 100 - result.discoveredUrlCount;
    deficits.push(`${deficit} discovered URL${deficit === 1 ? '' : 's'} below minimum`);
  }
  if (result.discoveredUrlCount > 150) {
    deficits.push(`${result.discoveredUrlCount - 150} discovered URLs above maximum`);
  }
  if (result.postOutcomeUrlCount > 25) {
    deficits.push(`${result.postOutcomeUrlCount - 25} post-outcome URLs above maximum`);
  }
  if (result.validDocumentCount < 50) {
    deficits.push(`${50 - result.validDocumentCount} valid documents below minimum`);
  }
  if (result.validDocumentCount > 80) {
    deficits.push(`${result.validDocumentCount - 80} valid documents above maximum`);
  }
  return { ...result, candidateCoverage, deficits };
};

export const checkSourceInventory = async (
  root: string,
  candidates: EventCandidate[],
): Promise<SourceInspection> => {
  const inspection = await inspectSourceInventory(root, candidates);
  if (inspection.deficits.length > 0) {
    throw new Error(
      `Source collection incomplete: ${inspection.discoveredUrlCount} discovered URLs, ${inspection.validDocumentCount} valid documents; ${inspection.deficits.join('; ')}.`,
    );
  }
  return inspection;
};

const optionValue = (args: string[], option: string) => {
  const index = args.indexOf(option);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`);
  return value;
};

const hasTranscriptSegments = (input: ReviewedSourceImport): input is TranscriptImport =>
  Object.hasOwn(input, 'speakerSegments');

const assertImportRegistered = (
  root: string,
  input: ReviewedSourceImport,
  candidates: EventCandidate[],
) => {
  const canonicalUrl = canonicalizeSourceUrl(input.canonicalUrl);
  const registrySource = loadRegistry(root).sources.find((source) =>
    source.canonicalUrl === canonicalUrl);
  if (!registrySource) throw new Error('import canonical URL is not registered');
  const candidateIds = new Set(candidates.map(({ id }) => id));
  if (!Array.isArray(input.eventCandidateIds)
    || input.eventCandidateIds.length === 0
    || input.eventCandidateIds.some((id) =>
      !candidateIds.has(id) || !registrySource.eventCandidateIds.includes(id))) {
    throw new Error('import contains an unknown or unapproved candidate ID');
  }
};

const run = async () => {
  const args = process.argv.slice(2);
  const command = args[0];
  const root = path.resolve(optionValue(args, '--root') ?? process.cwd());

  if (command === 'candidates:check') {
    const candidatePath = path.resolve(
      root,
      'data/b-track/amy-hood/advisor/event-candidates.json',
    );
    const result = validateEventCandidates(JSON.parse(readFileSync(candidatePath, 'utf8')));
    console.log(
      `Candidate matrix valid: ${result.candidateCount} candidates, ${result.uniqueDiscoveryUrlCount} unique discovery URLs.`,
    );
    return;
  }

  if (command === 'sources:check') {
    const candidatePath = path.resolve(
      root,
      'data/b-track/amy-hood/advisor/event-candidates.json',
    );
    const candidates = JSON.parse(readFileSync(candidatePath, 'utf8')) as EventCandidate[];
    validateEventCandidates(candidates, { enforceDiscoveryRange: false });
    const result = await checkSourceInventory(root, candidates);
    console.log(
      `Source registry valid: ${result.discoveredUrlCount} discovered URLs, ${result.validDocumentCount} valid documents, ${result.postOutcomeUrlCount} post-outcome URLs, ${result.reviewRequiredCount} review required, ${result.failedCount} failed.`,
    );
    return;
  }

  if (command === 'inventory:check') {
    const inventoryPath = path.resolve(
      root,
      optionValue(args, '--file')
        ?? 'data/b-track/amy-hood/advisor/imports/amy-hood-ma-pdf-url-inventory.json',
    );
    const inventory = await loadPdfUrlInventory(inventoryPath);
    console.log(
      `PDF URL inventory valid: ${inventory.summary.canonicalUrlCount} canonical URLs, ${inventory.summary.accessibleCount} accessible, ${inventory.summary.blockedByAutomationCount} blocked, ${inventory.summary.unavailableCount} unavailable.`,
    );
    return;
  }

  if (command === 'inventory:merge') {
    const inventoryPath = path.resolve(
      root,
      optionValue(args, '--file')
        ?? 'data/b-track/amy-hood/advisor/imports/amy-hood-ma-pdf-url-inventory.json',
    );
    const inventory = await loadPdfUrlInventory(inventoryPath);
    const result = await mergePdfUrlInventory(root, inventory, {
      validateCandidates: (candidates) => {
        validateEventCandidates(candidates, { enforceDiscoveryRange: false });
      },
    });
    console.log(
      `PDF URL inventory merged: ${result.inventoryUrlCount} URLs, ${result.addedCandidateAssociations} candidate associations added, ${result.updatedCandidateAssociations} candidate associations updated, ${result.addedRegistrySources} registry sources added, ${result.updatedRegistrySources} registry sources updated, ${result.preservedReviewedAssociations} reviewed associations preserved.`,
    );
    return;
  }

  if (command === 'evidence:check' || command === 'evidence:apply') {
    const reviewPath = optionValue(args, '--file');
    if (!reviewPath) throw new Error(`${command} requires --file`);
    const manifest = await loadDirectEvidenceReviewManifest(path.resolve(root, reviewPath));
    if (command === 'evidence:check') {
      await verifyDirectEvidenceReview(root, manifest);
      console.log(
        `Review valid: ${manifest.reviewId}, ${manifest.candidateId}, ${manifest.decision}.`,
      );
      return;
    }
    const result = await applyDirectEvidenceReview(root, manifest, {
      validateCandidates: (candidates) => {
        validateEventCandidates(candidates, { enforceDiscoveryRange: false });
      },
    });
    console.log(
      `Review ${result.changed ? 'applied' : 'unchanged'}: ${result.reviewId}, ${result.candidateId}, ${result.decision}.`,
    );
    return;
  }

  if (command === 'support:check' || command === 'support:apply') {
    const reviewPath = optionValue(args, '--file');
    if (!reviewPath) throw new Error(`${command} requires --file`);
    const manifest = await loadSupportingEvidenceReviewManifest(
      path.resolve(root, reviewPath),
    );
    if (command === 'support:check') {
      await verifySupportingEvidenceReview(root, manifest);
      console.log(
        `Supporting review valid: ${manifest.reviewId}, ${manifest.candidateId}, ${manifest.decision}.`,
      );
      return;
    }
    const result = await applySupportingEvidenceReview(root, manifest, {
      validateCandidates: (candidates) => {
        validateEventCandidates(candidates, { enforceDiscoveryRange: false });
      },
    });
    console.log(
      `Supporting review ${result.changed ? 'applied' : 'unchanged'}: ${result.reviewId}, ${result.candidateId}, ${result.decision}.`,
    );
    return;
  }

  if (command === 'support:batch') {
    const candidatePath = path.resolve(
      root,
      'data/b-track/amy-hood/advisor/event-candidates.json',
    );
    const candidates = JSON.parse(readFileSync(candidatePath, 'utf8')) as EventCandidate[];
    validateEventCandidates(candidates, { enforceDiscoveryRange: false });
    const inspection = await inspectSourceInventory(root, candidates);
    const batch = Object.fromEntries(SUPPORTING_EVIDENCE_BATCH_IDS.map((candidateId) => [
      candidateId,
      inspection.candidateCoverage[candidateId] ?? {
        coreDocumentFamilyCount: 0,
        coreSourceIds: [],
        directAmySourceIds: [],
        postOutcomeDocumentCount: 0,
        deficits: [`${candidateId} is missing from the candidate matrix`],
        outcome: 'blocked',
      },
    ]));
    console.log(JSON.stringify(batch, null, 2));
    return;
  }

  if (command === 'event:build') {
    const candidateId = optionValue(args, '--id');
    const pilot = args.includes('--pilot');
    if (Boolean(candidateId) === pilot) {
      throw new Error('event:build requires exactly one of --id or --pilot');
    }
    const model = createModelClient('local', { maxTokens: 700 });
    if (candidateId) {
      const card = await buildPilotEvent(root, candidateId, model, {
        refreshApproved: args.includes('--refresh-approved'),
      });
      console.log(JSON.stringify(card, null, 2));
      return;
    }
    const candidatePath = path.resolve(
      root,
      'data/b-track/amy-hood/advisor/event-candidates.json',
    );
    const candidates = JSON.parse(readFileSync(candidatePath, 'utf8')) as EventCandidate[];
    const manifest = await loadPilotManifest(root, candidates);
    const batch = await buildPilotBatch(root, manifest, {
      build: (id) => buildPilotEvent(root, id, model),
    });
    console.log(JSON.stringify(batch, null, 2));
    return;
  }

  if (command === 'event:approve') {
    const candidateId = optionValue(args, '--id');
    if (!candidateId) throw new Error('event:approve requires --id');
    const reviewer = optionValue(args, '--reviewer');
    if (!reviewer?.trim()) throw new Error('event:approve requires a nonblank --reviewer');
    const card = await approvePilotEventCard(root, candidateId, {
      reviewer,
      reviewedAt: new Date().toISOString(),
    });
    console.log(JSON.stringify(card, null, 2));
    return;
  }

  if (command === 'event:report') {
    if (!args.includes('--pilot')) throw new Error('event:report requires --pilot');
    const candidatePath = path.resolve(
      root,
      'data/b-track/amy-hood/advisor/event-candidates.json',
    );
    const candidates = JSON.parse(readFileSync(candidatePath, 'utf8')) as EventCandidate[];
    const manifest = await loadPilotManifest(root, candidates);
    const cards = (await Promise.all(manifest.targets.map(({ candidateId }) =>
      readJsonFile<PilotDecisionEvent | null>(eventCardPath(root, candidateId), null))))
      .filter((card): card is PilotDecisionEvent => card !== null);
    const report = await buildPilotReport(root, manifest, cards);
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (command === 'source:collect') {
    const sourceId = optionValue(args, '--id');
    if (!sourceId) throw new Error('source:collect requires --id');
    const source = loadSourceRecord(root, sourceId);
    const collected = await collectOfficialSource(source, { root });
    console.log(`${collected.id}: ${collected.collectionStatus}`);
    return;
  }

  if (command === 'source:import') {
    const importPath = optionValue(args, '--file');
    if (!importPath) throw new Error('source:import requires --file');
    let input: ReviewedSourceImport;
    try {
      input = JSON.parse(await readFile(path.resolve(importPath), 'utf8')) as ReviewedSourceImport;
    } catch (error) {
      throw new Error(`invalid import JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    const candidatePath = path.resolve(
      root,
      'data/b-track/amy-hood/advisor/event-candidates.json',
    );
    const candidates = JSON.parse(readFileSync(candidatePath, 'utf8')) as EventCandidate[];
    validateEventCandidates(candidates);
    assertImportRegistered(root, input, candidates);
    const imported = hasTranscriptSegments(input)
      ? await importTranscript(input, root)
      : await importReviewedSource(input, root);
    console.log(`${imported.id}: ${imported.collectionStatus}`);
    return;
  }

  throw new Error(`unknown advisor command: ${command ?? '(missing)'}`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
