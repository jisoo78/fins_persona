import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import type {
  AdvisorSourceRecord,
  CollectionFailureReason,
  CollectionStatus,
} from '../../shared/amyHoodDecisionAdvisor';
import { writeJsonAtomic } from './jsonStore';
import { advisorPaths } from './paths';
import { canonicalizeSourceUrl } from './sourcePolicy';

export type AdvisorSourceRegistry = {
  sources: AdvisorSourceRecord[];
};

const transitions: Record<CollectionStatus, ReadonlySet<CollectionStatus>> = {
  discovered: new Set(['queued', 'review_required', 'failed']),
  queued: new Set(['collected', 'review_required', 'failed']),
  collected: new Set(['normalized', 'review_required', 'failed']),
  normalized: new Set(['review_required', 'failed']),
  review_required: new Set(['approved', 'queued', 'failed']),
  approved: new Set(['queued', 'failed']),
  failed: new Set(['queued', 'review_required', 'failed']),
};

const emptyRegistry = (): AdvisorSourceRegistry => ({ sources: [] });

const registryLocks = new Map<string, Promise<void>>();

const withRegistryMutation = async <T>(root: string, operation: () => Promise<T>) => {
  const key = advisorPaths(root).registry;
  const previous = registryLocks.get(key) ?? Promise.resolve();
  let release = () => undefined;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  registryLocks.set(key, queued);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (registryLocks.get(key) === queued) registryLocks.delete(key);
  }
};

const nullableString = (value: unknown): value is string | null =>
  value === null || typeof value === 'string';

const validStatuses = new Set(Object.keys(transitions));
const validCollectors = new Set([
  'microsoft_ir',
  'microsoft_source',
  'sec_edgar',
  'public_html',
  'transcript_import',
  'manual_import',
]);
const validTiers = new Set([1, 2, 3, 'discovery_only']);
const validTemporalRoles = new Set(['pre_decision', 'decision_time', 'post_outcome']);
const validFailureReasons = new Set([
  'access_denied',
  'paywalled',
  'transcript_missing',
  'speaker_uncertain',
  'duplicate',
  'insufficient_decision_context',
  'post_outcome_only',
  'network_error',
  'invalid_content',
]);

export const resolveAdvisorArtifactPath = (root: string, relativePath: string) => {
  const advisorRoot = advisorPaths(root).root;
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error(`advisor artifact path must be relative: ${relativePath}`);
  }
  const resolved = path.resolve(advisorRoot, relativePath);
  if (!resolved.startsWith(`${advisorRoot}${path.sep}`)) {
    throw new Error(`advisor artifact path escapes advisor root: ${relativePath}`);
  }
  return resolved;
};

const validateRecord = (value: unknown, root: string): AdvisorSourceRecord => {
  if (typeof value !== 'object' || value === null) {
    throw new Error('advisor source registry contains a non-object record');
  }
  const record = value as AdvisorSourceRecord;
  const canonicalUrl = canonicalizeSourceUrl(record.canonicalUrl);
  if (canonicalUrl !== record.canonicalUrl) {
    throw new Error(`advisor source canonical URL is not canonical: ${record.canonicalUrl}`);
  }
  const baseId = sourceIdForUrl(canonicalUrl);
  if (record.id !== baseId && !new RegExp(`^${baseId}-[a-f0-9]{12}$`).test(record.id)) {
    throw new Error(`advisor source ID does not match its canonical hash: ${record.id}`);
  }
  const versionSuffix = record.id === baseId ? null : record.id.slice(-12);
  if (!Array.isArray(record.eventCandidateIds)
    || !record.eventCandidateIds.every((id) => typeof id === 'string')) {
    throw new Error(`advisor source ${record.id} has invalid candidate IDs`);
  }
  if (!validStatuses.has(record.collectionStatus)
    || !validCollectors.has(record.collector)
    || !validTiers.has(record.tier)
    || !validTemporalRoles.has(record.temporalRole)
    || typeof record.approvedPublicHost !== 'boolean'
    || typeof record.title !== 'string'
    || typeof record.publisher !== 'string'
    || typeof record.sourceType !== 'string'
    || typeof record.rightsNote !== 'string'
    || !nullableString(record.publishedAt)
    || !nullableString(record.speaker)
    || !nullableString(record.rawPath)
    || !nullableString(record.normalizedPath)
    || !(record.sha256 === null || /^[a-f0-9]{64}$/.test(record.sha256))
    || !nullableString(record.capturedAt)
    || !(record.failureReason === null || validFailureReasons.has(record.failureReason))
    || (versionSuffix !== null && record.sha256 !== null
      && !record.sha256.startsWith(versionSuffix))) {
    throw new Error(`advisor source ${record.id} has invalid persisted fields`);
  }
  if (record.rawPath) resolveAdvisorArtifactPath(root, record.rawPath);
  if (record.normalizedPath) resolveAdvisorArtifactPath(root, record.normalizedPath);
  return record;
};

export const loadRegistry = (root: string): AdvisorSourceRegistry => {
  try {
    const value = JSON.parse(readFileSync(advisorPaths(root).registry, 'utf8')) as unknown;
    if (
      typeof value !== 'object'
      || value === null
      || !Array.isArray((value as AdvisorSourceRegistry).sources)
    ) {
      throw new Error('advisor source registry must contain a sources array');
    }
    const registry = value as AdvisorSourceRegistry;
    const sources = registry.sources.map((source) => validateRecord(source, root));
    if (new Set(sources.map(({ id }) => id)).size !== sources.length) {
      throw new Error('advisor source registry contains duplicate source IDs');
    }
    return { sources };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return emptyRegistry();
    throw error;
  }
};

const saveRegistry = (root: string, registry: AdvisorSourceRegistry) =>
  writeJsonAtomic(advisorPaths(root).registry, registry);

export const sourceIdForUrl = (sourceUrl: string): string => {
  const canonicalUrl = canonicalizeSourceUrl(sourceUrl);
  return `source-${createHash('sha256').update(canonicalUrl).digest('hex').slice(0, 16)}`;
};

const mergedCandidateIds = (first: string[], second: string[]) =>
  [...new Set([...first, ...second])];

export const upsertDiscoveredSource = async (
  candidate: AdvisorSourceRecord,
  root: string,
): Promise<AdvisorSourceRecord> => withRegistryMutation(root, async () => {
  const registry = loadRegistry(root);
  const canonicalUrl = canonicalizeSourceUrl(candidate.canonicalUrl);
  const exact = registry.sources.find(({ id }) => id === candidate.id);
  const existing = exact?.canonicalUrl === canonicalUrl
    ? exact
    : [...registry.sources].reverse().find((source) => source.canonicalUrl === canonicalUrl);

  if (existing) {
    const merged = {
      ...existing,
      eventCandidateIds: mergedCandidateIds(
        existing.eventCandidateIds,
        candidate.eventCandidateIds,
      ),
    };
    registry.sources[registry.sources.indexOf(existing)] = merged;
    await saveRegistry(root, registry);
    return merged;
  }

  const discovered: AdvisorSourceRecord = {
    ...candidate,
    id: sourceIdForUrl(canonicalUrl),
    canonicalUrl,
    eventCandidateIds: mergedCandidateIds([], candidate.eventCandidateIds),
    collectionStatus: 'discovered',
    rawPath: null,
    normalizedPath: null,
    sha256: null,
    capturedAt: null,
    failureReason: null,
  };
  registry.sources.push(validateRecord(discovered, root));
  await saveRegistry(root, registry);
  return discovered;
});

export const transitionSource = async (
  root: string,
  sourceId: string,
  nextStatus: CollectionStatus,
  patch: Partial<AdvisorSourceRecord> = {},
): Promise<AdvisorSourceRecord> => withRegistryMutation(root, async () => {
  const registry = loadRegistry(root);
  const index = registry.sources.findIndex(({ id }) => id === sourceId);
  if (index < 0) throw new Error(`unknown advisor source: ${sourceId}`);

  const current = registry.sources[index];
  if (!transitions[current.collectionStatus].has(nextStatus)) {
    throw new Error(
      `invalid source transition: ${current.collectionStatus} -> ${nextStatus}`,
    );
  }

  const updated: AdvisorSourceRecord = {
    ...current,
    ...patch,
    id: current.id,
    canonicalUrl: current.canonicalUrl,
    collectionStatus: nextStatus,
  };
  registry.sources[index] = validateRecord(updated, root);
  await saveRegistry(root, registry);
  return updated;
});

export const createContentVersion = async (
  root: string,
  previous: AdvisorSourceRecord,
  contentSha256: string,
): Promise<AdvisorSourceRecord> => withRegistryMutation(root, async () => {
  const registry = loadRegistry(root);
  const id = `${sourceIdForUrl(previous.canonicalUrl)}-${contentSha256.slice(0, 12)}`;
  const existing = registry.sources.find((source) => source.id === id);
  if (existing) return existing;

  const version: AdvisorSourceRecord = {
    ...previous,
    id,
    collectionStatus: 'queued',
    rawPath: null,
    normalizedPath: null,
    sha256: null,
    capturedAt: null,
    failureReason: null,
  };
  registry.sources.push(validateRecord(version, root));
  await saveRegistry(root, registry);
  return version;
});

export const markCollectionFailure = async (
  root: string,
  sourceId: string,
  failureReason: CollectionFailureReason,
): Promise<AdvisorSourceRecord> => transitionSource(root, sourceId, 'failed', {
  failureReason,
});
