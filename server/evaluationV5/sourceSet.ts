import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { AdvisorSourceRecord } from '../../shared/amyHoodDecisionAdvisor';
import type { EvaluationV5ExternalEventIdentity } from '../../shared/amyHoodEvaluationV5';
import { advisorPaths } from '../decisionAdvisor/paths';
import { canonicalizeSourceUrl } from '../decisionAdvisor/sourcePolicy';
import { evaluationV5Paths } from './paths';

export type EvaluationV5ExternalSource = {
  id: string;
  eventId: string;
  canonicalUrl: string;
  sourceType: 'earnings_call' | 'investor_day' | 'filing' | 'official_interview' | 'company_announcement';
  sourceQuality: 'official_primary' | 'official_secondary' | 'attributable_secondary_transcript';
  role: 'decision_time_primary' | 'decision_time_secondary' | 'post_outcome';
  publishedAt: string;
  decisionCutoff: string;
  rawPath: string;
  normalizedPath: string;
  contentHash: string;
  reviewer: 'Codex';
  reviewedAt: string;
};

export type EvaluationV5ExternalSourceRegistry = {
  dataset: 'evaluation_v5_external_cfo_sources';
  version: '5.0.0';
  sources: EvaluationV5ExternalSource[];
  events: EvaluationV5ExternalEventIdentity[];
};

type AmySourceIdentity = {
  canonicalUrl: string;
  contentHash?: string | null;
  sha256?: string | null;
};

export type ValidatedEvaluationV5ExternalSources = {
  sources: EvaluationV5ExternalSource[];
  events: EvaluationV5ExternalEventIdentity[];
  generationSourceIds: string[];
};

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const requireDate = (value: string, label: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)
    || Number.isNaN(new Date(`${value}T00:00:00.000Z`).valueOf())) {
    throw new Error(`${label} must be an ISO date`);
  }
};

export const validateEvaluationV5ExternalSources = (
  registry: EvaluationV5ExternalSourceRegistry,
  amySources: AmySourceIdentity[],
  normalizedContentByPath: Record<string, string>,
): ValidatedEvaluationV5ExternalSources => {
  if (registry.dataset !== 'evaluation_v5_external_cfo_sources'
    || registry.version !== '5.0.0'
    || !Array.isArray(registry.sources) || !Array.isArray(registry.events)) {
    throw new Error('Evaluation v5 external source registry identity is invalid');
  }
  const amyUrls = new Set(amySources.map(({ canonicalUrl }) => canonicalizeSourceUrl(canonicalUrl)));
  const amyHashes = new Set(amySources
    .map(({ contentHash, sha256: legacyHash }) => contentHash ?? legacyHash)
    .filter((value): value is string => Boolean(value)));
  const ids = new Set<string>();
  const urls = new Set<string>();
  const sources = registry.sources.map((source) => {
    if (!/^ext-[a-z0-9-]+$/.test(source.id) || ids.has(source.id)) {
      throw new Error(`external source ID is invalid or duplicated: ${source.id}`);
    }
    ids.add(source.id);
    requireDate(source.publishedAt, `source ${source.id} publishedAt`);
    requireDate(source.decisionCutoff, `source ${source.id} decisionCutoff`);
    const reviewedAt = new Date(source.reviewedAt);
    if (source.reviewer !== 'Codex' || Number.isNaN(reviewedAt.valueOf())
      || reviewedAt.toISOString() !== source.reviewedAt) {
      throw new Error(`external source is not reviewed: ${source.id}`);
    }
    const canonicalUrl = canonicalizeSourceUrl(source.canonicalUrl).replace(/\/$/, '');
    if (urls.has(canonicalUrl)) throw new Error(`duplicate external source URL: ${canonicalUrl}`);
    urls.add(canonicalUrl);
    const normalized = normalizedContentByPath[source.normalizedPath];
    if (typeof normalized !== 'string' || sha256(normalized) !== source.contentHash) {
      throw new Error(`external source content hash mismatch: ${source.id}`);
    }
    if (amyUrls.has(canonicalUrl) || amyHashes.has(source.contentHash)) {
      throw new Error(`external source collides with Amy memory: ${source.id}`);
    }
    if (source.role !== 'post_outcome' && source.publishedAt > source.decisionCutoff) {
      throw new Error(`decision-time source exceeds cutoff: ${source.id}`);
    }
    if (source.role === 'decision_time_primary' && source.sourceQuality !== 'official_primary') {
      throw new Error(`external event requires an official primary source: ${source.id}`);
    }
    if (source.sourceQuality === 'attributable_secondary_transcript'
      && source.role !== 'decision_time_secondary') {
      throw new Error(`attributable transcript must remain secondary: ${source.id}`);
    }
    return { ...source, canonicalUrl };
  });

  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const eventIds = new Set<string>();
  for (const event of registry.events) {
    if (!event.id.trim() || eventIds.has(event.id)) {
      throw new Error(`external event ID is invalid or duplicated: ${event.id}`);
    }
    eventIds.add(event.id);
    const primary = sourceById.get(event.primarySourceId);
    if (!primary || primary.eventId !== event.id || primary.role !== 'decision_time_primary') {
      throw new Error(`external event requires one decision-time primary source: ${event.id}`);
    }
    const secondaries = event.secondarySourceIds.map((id) => sourceById.get(id));
    if (secondaries.some((source) => !source || source.eventId !== event.id
      || source.role !== 'decision_time_secondary')) {
      throw new Error(`external event has invalid secondary evidence: ${event.id}`);
    }
    if (event.secondarySourceStatus === 'present' && secondaries.length === 0) {
      throw new Error(`external event requires secondary evidence: ${event.id}`);
    }
    if (event.secondarySourceStatus === 'documented_unavailable'
      && (secondaries.length > 0 || event.secondarySourceRationale.trim().length < 40)) {
      throw new Error(`external event requires reviewed secondary unavailability: ${event.id}`);
    }
    if (!event.actualHistoricalAction.trim()) {
      throw new Error(`external event requires an actual historical action: ${event.id}`);
    }
    for (const outcomeId of event.outcomeEvidenceIds) {
      const outcome = sourceById.get(outcomeId);
      if (!outcome || outcome.eventId !== event.id || outcome.role !== 'post_outcome') {
        throw new Error(`external event has invalid outcome evidence: ${event.id}`);
      }
    }
  }
  for (const source of sources) {
    if (!eventIds.has(source.eventId)) throw new Error(`external source has unresolved event: ${source.id}`);
  }
  return {
    sources,
    events: structuredClone(registry.events),
    generationSourceIds: sources.filter(({ role }) => role !== 'post_outcome')
      .map(({ id }) => id).sort(),
  };
};

export const loadEvaluationV5ExternalSources = async (
  root: string,
): Promise<ValidatedEvaluationV5ExternalSources> => {
  const paths = evaluationV5Paths(root);
  const registry = JSON.parse(await readFile(paths.sourceRegistry, 'utf8')) as EvaluationV5ExternalSourceRegistry;
  const amyRegistry = JSON.parse(await readFile(advisorPaths(root).registry, 'utf8')) as { sources: AdvisorSourceRecord[] };
  const normalizedContentByPath: Record<string, string> = {};
  for (const source of registry.sources) {
    const filePath = path.resolve(root, source.normalizedPath);
    const relative = path.relative(paths.sourceNormalized, filePath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`external normalized source path is invalid: ${source.id}`);
    }
    normalizedContentByPath[source.normalizedPath] = await readFile(filePath, 'utf8');
  }
  return validateEvaluationV5ExternalSources(registry, amyRegistry.sources, normalizedContentByPath);
};
