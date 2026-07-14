import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  AdvisorRawSource,
  AdvisorSourceRecord,
  DecisionDomain,
  EventCandidate,
} from '../shared/amyHoodDecisionAdvisor';
import { readAdvisorArtifactSecure } from './decisionAdvisor/artifactStore';
import { importReviewedSource, type ReviewedSourceImport } from './decisionAdvisor/manualSourceImporter';
import {
  collectOfficialSource,
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

const DECISION_DOMAINS: DecisionDomain[] = [
  'm_and_a',
  'ai_cloud_capex',
  'pricing_monetization',
  'cost_efficiency',
  'shareholder_return_risk',
];

type CandidateCheck = {
  candidateCount: number;
  uniqueDiscoveryUrlCount: number;
  domainCounts: Record<DecisionDomain, number>;
};

type SourceCheck = {
  discoveredUrlCount: number;
  validDocumentCount: number;
  postOutcomeUrlCount: number;
  failedCount: number;
  reviewRequiredCount: number;
};

const normalizedSearchText = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();

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
    if (!Array.isArray(candidate.sourceAssociations) || candidate.sourceAssociations.length === 0) {
      throw new Error(`candidate ${candidate.id} requires a reviewed source association`);
    }
    const reviewedAssociations = candidate.sourceAssociations.filter(
      ({ reviewStatus }) => reviewStatus === 'reviewed',
    );
    if (reviewedAssociations.length === 0) {
      throw new Error(`candidate ${candidate.id} requires a reviewed source association`);
    }
    for (const association of candidate.sourceAssociations) {
      const canonicalUrl = canonicalizeSourceUrl(association.canonicalUrl);
      if (!canonicalUrl.startsWith('https://')) {
        throw new Error(`candidate ${candidate.id} association URL must use HTTPS`);
      }
      if (!['direct_amy', 'contemporaneous_context', 'counterevidence', 'post_outcome']
        .includes(association.role)
        || !['pre_decision', 'decision_time', 'post_outcome'].includes(association.temporalRelation)
        || typeof association.sourceType !== 'string'
        || association.sourceType.trim() === ''
        || !isIsoDate(association.publishedAt)
        || typeof association.relevanceClaim !== 'string'
        || association.relevanceClaim.trim().length < 20
        || !association.evidenceLocator
        || typeof association.evidenceLocator.exactQuote !== 'string'
        || association.evidenceLocator.exactQuote.trim().length < 20
        || !Array.isArray(association.evidenceLocator.anchorTerms)
        || association.evidenceLocator.anchorTerms.length < 2
        || association.evidenceLocator.anchorTerms.every((term) => /^amy hood$/i.test(term.trim()))
        || !['unreviewed', 'reviewed', 'rejected'].includes(association.reviewStatus)
        || typeof association.reviewerNote !== 'string'
        || association.reviewerNote.trim().length < 10) {
        throw new Error(`candidate ${candidate.id} has an invalid source association`);
      }
      if (association.role === 'direct_amy' && association.evidenceLocator.speaker !== 'Amy Hood') {
        throw new Error(`candidate ${candidate.id} direct Amy association requires an exact speaker locator`);
      }
      if (association.temporalRelation === 'decision_time'
        && (association.publishedAt < candidate.decisionWindowStart
          || association.publishedAt > candidate.decisionWindowEnd)) {
        throw new Error(`candidate ${candidate.id} association contradicts its decision window`);
      }
      if (association.temporalRelation === 'pre_decision'
        && association.publishedAt >= candidate.decisionWindowStart) {
        throw new Error(`candidate ${candidate.id} association contradicts its pre-decision relation`);
      }
      if (association.temporalRelation === 'post_outcome'
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

const isCountableDocument = (source: AdvisorSourceRecord) => new Set([
  'collected',
  'normalized',
  'review_required',
  'approved',
]).has(source.collectionStatus)
  && source.tier !== 'discovery_only'
  && source.temporalRole !== 'post_outcome'
  && source.failureReason === null;

const verifySourceArtifact = async (root: string, source: AdvisorSourceRecord) => {
  if (!isCountableDocument(source)
    || !source.rawPath
    || !source.normalizedPath
    || !source.sha256
    || !source.capturedAt) return null;

  try {
    const rawBytes = await readAdvisorArtifactSecure(root, source.rawPath);
    const raw = JSON.parse(rawBytes.toString('utf8')) as AdvisorRawSource;
    if (raw.sourceId !== source.id
      || typeof raw.canonicalUrl !== 'string'
      || new URL(raw.canonicalUrl).hostname !== new URL(source.canonicalUrl).hostname
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
    const normalized = await readAdvisorArtifactSecure(root, source.normalizedPath);
    const normalizedText = normalized.toString('utf8');
    if (normalizedText.replace(/\s+/g, ' ').trim().length < 200) return null;
    if (source.collector === 'manual_import' || source.collector === 'transcript_import') {
      if (createHash('sha256').update(normalized).digest('hex') !== source.sha256) return null;
    } else if (normalizedText !== normalizeDocument(body.toString('utf8'), raw.mediaType)) {
      return null;
    }
    return { normalizedText, raw: raw as AdvisorRawSource & { speakerSegments?: unknown[] } };
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

export const checkSourceInventory = async (
  root: string,
  candidates: EventCandidate[],
): Promise<SourceCheck> => {
  const registry = loadRegistry(root);
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
  }>>();
  const validSourceIds = new Set<string>();
  const registryUrls = new Set(registry.sources.map(({ canonicalUrl }) => canonicalUrl));

  for (const source of registry.sources) {
    const associationLinks = associationsByUrl.get(source.canonicalUrl) ?? [];
    if (associationLinks.length === 0) {
      throw new Error(`registry source is not linked from the candidate matrix: ${source.id}`);
    }
    if (source.eventCandidateIds.length === 0
      || source.eventCandidateIds.some((id) => !candidateIds.has(id))) {
      throw new Error(`registry source has an unknown candidate link: ${source.id}`);
    }
    const artifact = await verifySourceArtifact(root, source);
    if (!artifact) continue;
    for (const { candidate, association } of associationLinks) {
      if (!source.eventCandidateIds.includes(candidate.id)
        || association.reviewStatus !== 'reviewed'
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
      const locatorWindow = searchable.slice(
        Math.max(0, quoteIndex - 1500),
        quoteIndex + exactQuote.length + 1500,
      );
      if (!association.evidenceLocator.anchorTerms.every((term) =>
        locatorWindow.includes(normalizedSearchText(term)))) continue;
      if (association.role === 'direct_amy') {
        if (association.evidenceLocator.speaker !== 'Amy Hood'
          || source.speaker !== 'Amy Hood'
          || !locatorWindow.includes('amy hood')) continue;
      }
      validSourceIds.add(source.id);
      matchedByCandidate.set(candidate.id, [
        ...(matchedByCandidate.get(candidate.id) ?? []),
        { source, role: association.role },
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
  for (const candidate of candidates) {
    const matched = matchedByCandidate.get(candidate.id) ?? [];
    if (matched.length === 0) {
      deficits.push(`${candidate.id} lacks a reviewed event-relevant artifact`);
    }
    if (new Set(matched.map(({ source }) => source.sourceType)).size < 2) {
      deficits.push(`${candidate.id} lacks a reviewed collected second source type`);
    }
    if (!candidate.directEvidenceGap
      && !matched.some(({ role }) => role === 'direct_amy')) {
      deficits.push(`${candidate.id} lacks a verified candidate-specific direct Amy locator`);
    }
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
  if (deficits.length > 0) {
    throw new Error(
      `Source collection incomplete: ${result.discoveredUrlCount} discovered URLs, ${result.validDocumentCount} valid documents; ${deficits.join('; ')}.`,
    );
  }
  return result;
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
