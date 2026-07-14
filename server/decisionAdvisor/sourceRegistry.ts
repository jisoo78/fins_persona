import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

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
    return value as AdvisorSourceRegistry;
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
): Promise<AdvisorSourceRecord> => {
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
  registry.sources.push(discovered);
  await saveRegistry(root, registry);
  return discovered;
};

export const transitionSource = async (
  root: string,
  sourceId: string,
  nextStatus: CollectionStatus,
  patch: Partial<AdvisorSourceRecord> = {},
): Promise<AdvisorSourceRecord> => {
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
  registry.sources[index] = updated;
  await saveRegistry(root, registry);
  return updated;
};

export const createContentVersion = async (
  root: string,
  previous: AdvisorSourceRecord,
  contentSha256: string,
): Promise<AdvisorSourceRecord> => {
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
  registry.sources.push(version);
  await saveRegistry(root, registry);
  return version;
};

export const markCollectionFailure = async (
  root: string,
  sourceId: string,
  failureReason: CollectionFailureReason,
): Promise<AdvisorSourceRecord> => transitionSource(root, sourceId, 'failed', {
  failureReason,
});
