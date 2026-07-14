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
import { importReviewedSource, type ReviewedSourceImport } from './decisionAdvisor/manualSourceImporter';
import { collectOfficialSource } from './decisionAdvisor/officialSourceCollector';
import {
  loadRegistry,
  loadSourceRecord,
  resolveAdvisorArtifactPath,
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
  failedCount: number;
  reviewRequiredCount: number;
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

export const validateEventCandidates = (value: unknown): CandidateCheck => {
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
    if (!Array.isArray(candidate.discoveryUrls) || candidate.discoveryUrls.length === 0) {
      throw new Error(`candidate ${candidate.id} must include discovery URLs`);
    }
    for (const sourceUrl of candidate.discoveryUrls) {
      const canonicalUrl = canonicalizeSourceUrl(sourceUrl);
      if (!canonicalUrl.startsWith('https://')) {
        throw new Error(`candidate ${candidate.id} discovery URL must use HTTPS`);
      }
      urls.add(canonicalUrl);
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
  if (urls.size < 100 || urls.size > 150) {
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
    || !source.capturedAt) return false;

  try {
    const rawBytes = await readFile(resolveAdvisorArtifactPath(root, source.rawPath));
    const raw = JSON.parse(rawBytes.toString('utf8')) as AdvisorRawSource;
    if (raw.sourceId !== source.id
      || raw.canonicalUrl !== source.canonicalUrl
      || raw.metadata?.id !== source.id
      || raw.metadata?.sha256 !== source.sha256
      || raw.metadata?.capturedAt !== source.capturedAt
      || typeof raw.bodyBase64 !== 'string') return false;
    const body = Buffer.from(raw.bodyBase64, 'base64');
    if (body.toString('base64') !== raw.bodyBase64.replace(/\s+/g, '')) return false;
    if (createHash('sha256').update(body).digest('hex') !== source.sha256) return false;
    const normalized = await readFile(resolveAdvisorArtifactPath(root, source.normalizedPath));
    return normalized.toString('utf8').replace(/\s+/g, ' ').trim().length >= 200;
  } catch {
    return false;
  }
};

export const checkSourceInventory = async (
  root: string,
  candidates: EventCandidate[],
): Promise<SourceCheck> => {
  const registry = loadRegistry(root);
  const candidateIds = new Set(candidates.map(({ id }) => id));
  const candidateUrls = new Set(
    candidates.flatMap(({ discoveryUrls }) => discoveryUrls.map(canonicalizeSourceUrl)),
  );
  const canonicalUrls = new Set<string>();
  const sourcesByCandidate = new Map<string, AdvisorSourceRecord[]>();
  let validDocumentCount = 0;

  for (const source of registry.sources) {
    canonicalUrls.add(source.canonicalUrl);
    if (!candidateUrls.has(source.canonicalUrl)) {
      throw new Error(`registry source is not linked from the candidate matrix: ${source.id}`);
    }
    if (source.eventCandidateIds.length === 0
      || source.eventCandidateIds.some((id) => !candidateIds.has(id))) {
      throw new Error(`registry source has an unknown candidate link: ${source.id}`);
    }
    for (const candidateId of source.eventCandidateIds) {
      sourcesByCandidate.set(candidateId, [
        ...(sourcesByCandidate.get(candidateId) ?? []),
        source,
      ]);
    }
    if (await verifySourceArtifact(root, source)) validDocumentCount += 1;
  }

  const result: SourceCheck = {
    discoveredUrlCount: canonicalUrls.size,
    validDocumentCount,
    failedCount: registry.sources.filter(({ collectionStatus }) => collectionStatus === 'failed').length,
    reviewRequiredCount: registry.sources.filter(
      ({ collectionStatus }) => collectionStatus === 'review_required',
    ).length,
  };
  const deficits: string[] = [];
  for (const candidate of candidates) {
    const linked = sourcesByCandidate.get(candidate.id) ?? [];
    const directLead = linked.find((source) => source.tier === 1 && source.speaker === 'Amy Hood');
    if (!directLead) deficits.push(`${candidate.id} lacks a likely direct Amy lead`);
    if (new Set(linked.map(({ sourceType }) => sourceType)).size < 2) {
      deficits.push(`${candidate.id} lacks a second source-type lead`);
    }
  }
  if (result.discoveredUrlCount < 100) {
    const deficit = 100 - result.discoveredUrlCount;
    deficits.push(`${deficit} discovered URL${deficit === 1 ? '' : 's'} below minimum`);
  }
  if (result.discoveredUrlCount > 150) {
    deficits.push(`${result.discoveredUrlCount - 150} discovered URLs above maximum`);
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
    validateEventCandidates(candidates);
    const result = await checkSourceInventory(root, candidates);
    console.log(
      `Source registry valid: ${result.discoveredUrlCount} discovered URLs, ${result.validDocumentCount} valid documents, ${result.reviewRequiredCount} review required, ${result.failedCount} failed.`,
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
