import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  AdvisorSourceRecord,
  EventCandidate,
  EventSourceAssociation,
} from '../../shared/amyHoodDecisionAdvisor';
import { writeJsonAtomic } from './jsonStore';
import { advisorPaths } from './paths';
import {
  sourceIdForUrl,
  upsertDiscoveredSources,
} from './sourceRegistry';
import { canonicalizeSourceUrl } from './sourcePolicy';

export type PdfInventoryAccessStatus =
  | 'accessible'
  | 'blocked_by_automation'
  | 'unavailable'
  | 'not_checked';

export type PdfInventoryEntry = {
  canonicalUrl: string;
  originalUrls: string[];
  pageNumbers: number[];
  eventId: string;
  eventName: string;
  publisher: string;
  domain: string;
  sourceType: string;
  evidenceRole: EventSourceAssociation['role'];
  directEvidenceStatus: 'verified' | 'review_required' | 'missing' | 'not_applicable';
  reviewStatus: 'unreviewed' | 'review_required';
  publishedAt: string | null;
  temporalRelation: EventSourceAssociation['temporalRelation'];
  describedEvidencePeriod: EventSourceAssociation['temporalRelation'];
  registryStatus: 'existing' | 'new';
  accessStatus: PdfInventoryAccessStatus;
  httpStatus: number | null;
  finalUrl: string | null;
  checkedAt: string | null;
  reviewNote: string;
};

export type AmyHoodPdfUrlInventory = {
  inventoryId: string;
  sourcePdf: string;
  sourcePdfSha256: string;
  sourcePageCount: number;
  extractedAt: string;
  purpose: string;
  canonicalization: Record<string, string>;
  comparisonFiles: string[];
  accessCheck: {
    checkedAt: string;
    method: string;
    interpretation: string;
  };
  summary: {
    canonicalUrlCount: number;
    existingCount: number;
    newCount: number;
    accessibleCount: number;
    blockedByAutomationCount: number;
    unavailableCount: number;
    notCheckedCount: number;
  };
  urls: PdfInventoryEntry[];
};

export type PdfInventoryMergeResult = {
  inventoryUrlCount: number;
  addedCandidateAssociations: number;
  updatedCandidateAssociations: number;
  addedRegistrySources: number;
  updatedRegistrySources: number;
  preservedReviewedAssociations: number;
};

export type PdfInventoryMergeDependencies = {
  validateCandidates(candidates: EventCandidate[]): void;
  persistCandidates(candidates: EventCandidate[], candidatePath: string): Promise<void>;
  upsertSources(
    sources: AdvisorSourceRecord[],
    root: string,
  ): Promise<{ sources: AdvisorSourceRecord[]; addedCount: number; updatedCount: number }>;
};

const allowedRoles = new Set<EventSourceAssociation['role']>([
  'direct_amy',
  'contemporaneous_context',
  'counterevidence',
  'post_outcome',
]);
const allowedTemporalRelations = new Set<EventSourceAssociation['temporalRelation']>([
  'pre_decision',
  'decision_time',
  'post_outcome',
]);
const allowedDirectStatuses = new Set([
  'verified',
  'review_required',
  'missing',
  'not_applicable',
]);
const allowedReviewStatuses = new Set(['unreviewed', 'review_required']);
const allowedRegistryStatuses = new Set(['existing', 'new']);
const allowedAccessStatuses = new Set<PdfInventoryAccessStatus>([
  'accessible',
  'blocked_by_automation',
  'unavailable',
  'not_checked',
]);

const isNonemptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const isIsoDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
};
const isIsoInstant = (value: unknown): value is string =>
  typeof value === 'string'
  && !Number.isNaN(new Date(value).valueOf())
  && new Date(value).toISOString() === value;

const equivalentInventoryUrl = (first: string, second: string) => {
  const normalizeTrailingSlash = (value: string) => {
    const parsed = new URL(canonicalizeSourceUrl(value));
    if (parsed.pathname !== '/') parsed.pathname = parsed.pathname.replace(/\/$/, '');
    return parsed.toString();
  };
  return normalizeTrailingSlash(first) === normalizeTrailingSlash(second);
};

const assertAccessMetadata = (entry: PdfInventoryEntry) => {
  const hasValidStatus = Number.isInteger(entry.httpStatus)
    && (entry.httpStatus ?? 0) >= 100
    && (entry.httpStatus ?? 0) <= 599;
  if (entry.accessStatus === 'accessible'
    && (entry.httpStatus !== 200 || !entry.finalUrl || !entry.checkedAt)) {
    throw new Error(`access metadata is inconsistent for ${entry.canonicalUrl}`);
  }
  if (entry.accessStatus === 'blocked_by_automation'
    && (!hasValidStatus
      || ![401, 403, 429].includes(entry.httpStatus ?? 0)
      || !entry.finalUrl
      || !entry.checkedAt)) {
    throw new Error(`access metadata is inconsistent for ${entry.canonicalUrl}`);
  }
  if (entry.accessStatus === 'unavailable'
    && (entry.httpStatus !== null && !hasValidStatus)) {
    throw new Error(`access metadata is inconsistent for ${entry.canonicalUrl}`);
  }
  if (entry.accessStatus === 'not_checked'
    && (entry.httpStatus !== null || entry.finalUrl !== null || entry.checkedAt !== null)) {
    throw new Error(`access metadata is inconsistent for ${entry.canonicalUrl}`);
  }
  if (entry.finalUrl !== null) canonicalizeSourceUrl(entry.finalUrl);
  if (entry.checkedAt !== null && !isIsoInstant(entry.checkedAt)) {
    throw new Error(`access metadata is inconsistent for ${entry.canonicalUrl}`);
  }
};

const assertEntry = (value: unknown, index: number): PdfInventoryEntry => {
  if (typeof value !== 'object' || value === null) {
    throw new Error(`inventory URL at index ${index} must be an object`);
  }
  const entry = value as PdfInventoryEntry;
  if (!isNonemptyString(entry.canonicalUrl)
    || canonicalizeSourceUrl(entry.canonicalUrl) !== entry.canonicalUrl) {
    throw new Error(`inventory URL at index ${index} is not canonical`);
  }
  if (!Array.isArray(entry.originalUrls)
    || entry.originalUrls.length === 0
    || entry.originalUrls.some((url) =>
      !isNonemptyString(url)
      || !equivalentInventoryUrl(url, entry.canonicalUrl))) {
    throw new Error(`inventory URL ${entry.canonicalUrl} has invalid original URLs`);
  }
  if (!Array.isArray(entry.pageNumbers)
    || entry.pageNumbers.length === 0
    || entry.pageNumbers.some((page) => !Number.isInteger(page) || page < 1 || page > 14)) {
    throw new Error(`inventory URL ${entry.canonicalUrl} has invalid PDF pages`);
  }
  if (!isNonemptyString(entry.eventId)
    || !isNonemptyString(entry.eventName)
    || !isNonemptyString(entry.publisher)
    || !isNonemptyString(entry.domain)
    || new URL(entry.canonicalUrl).hostname !== entry.domain.toLowerCase()
    || !isNonemptyString(entry.sourceType)
    || !allowedRoles.has(entry.evidenceRole)) {
    throw new Error(`inventory URL ${entry.canonicalUrl} has an invalid evidence role or identity`);
  }
  if (!allowedDirectStatuses.has(entry.directEvidenceStatus)
    || !allowedReviewStatuses.has(entry.reviewStatus)
    || !allowedRegistryStatuses.has(entry.registryStatus)
    || !allowedAccessStatuses.has(entry.accessStatus)
    || !allowedTemporalRelations.has(entry.temporalRelation)
    || !allowedTemporalRelations.has(entry.describedEvidencePeriod)
    || !(entry.publishedAt === null || isIsoDate(entry.publishedAt))
    || !isNonemptyString(entry.reviewNote)) {
    throw new Error(`inventory URL ${entry.canonicalUrl} has invalid review metadata`);
  }
  if (entry.evidenceRole === 'post_outcome' && entry.temporalRelation !== 'post_outcome') {
    throw new Error(`post-outcome URL ${entry.canonicalUrl} has invalid temporal metadata`);
  }
  assertAccessMetadata(entry);
  return entry;
};

export const validatePdfUrlInventory = (value: unknown): AmyHoodPdfUrlInventory => {
  if (typeof value !== 'object' || value === null) {
    throw new Error('PDF URL inventory must be an object');
  }
  const inventory = value as AmyHoodPdfUrlInventory;
  if (!isNonemptyString(inventory.inventoryId)
    || !isNonemptyString(inventory.sourcePdf)
    || !/^[a-f0-9]{64}$/.test(inventory.sourcePdfSha256)
    || inventory.sourcePageCount !== 14
    || !isIsoInstant(inventory.extractedAt)
    || !isNonemptyString(inventory.purpose)
    || typeof inventory.canonicalization !== 'object'
    || inventory.canonicalization === null
    || !Array.isArray(inventory.comparisonFiles)
    || inventory.comparisonFiles.length !== 2
    || !inventory.accessCheck
    || !isIsoInstant(inventory.accessCheck.checkedAt)
    || !isNonemptyString(inventory.accessCheck.method)
    || !isNonemptyString(inventory.accessCheck.interpretation)
    || !inventory.summary
    || !Array.isArray(inventory.urls)) {
    throw new Error('PDF URL inventory header is invalid');
  }

  const urls = inventory.urls.map(assertEntry);
  const canonicalUrls = urls.map(({ canonicalUrl }) => canonicalUrl);
  if (new Set(canonicalUrls).size !== canonicalUrls.length) {
    throw new Error('PDF URL inventory contains a duplicate canonical URL');
  }
  const count = (predicate: (entry: PdfInventoryEntry) => boolean) =>
    urls.filter(predicate).length;
  const expected = {
    canonicalUrlCount: urls.length,
    existingCount: count(({ registryStatus }) => registryStatus === 'existing'),
    newCount: count(({ registryStatus }) => registryStatus === 'new'),
    accessibleCount: count(({ accessStatus }) => accessStatus === 'accessible'),
    blockedByAutomationCount: count(({ accessStatus }) => accessStatus === 'blocked_by_automation'),
    unavailableCount: count(({ accessStatus }) => accessStatus === 'unavailable'),
    notCheckedCount: count(({ accessStatus }) => accessStatus === 'not_checked'),
  };
  if (JSON.stringify(inventory.summary) !== JSON.stringify(expected)) {
    throw new Error('PDF URL inventory summary does not match its entries');
  }
  return { ...inventory, urls };
};

export const loadPdfUrlInventory = async (filePath: string) =>
  validatePdfUrlInventory(JSON.parse(await readFile(filePath, 'utf8')) as unknown);

const collectorFor = (entry: PdfInventoryEntry): AdvisorSourceRecord['collector'] => {
  const url = new URL(entry.canonicalUrl);
  if (url.hostname === 'sec.gov' || url.hostname.endsWith('.sec.gov')) return 'sec_edgar';
  if ((url.hostname === 'microsoft.com' || url.hostname.endsWith('.microsoft.com'))
    && /(^|\/)investor(\/|$)/i.test(url.pathname)) return 'microsoft_ir';
  if (url.hostname === 'microsoft.com' || url.hostname.endsWith('.microsoft.com')) {
    return 'microsoft_source';
  }
  return 'manual_import';
};

const sourceRecordFor = (entry: PdfInventoryEntry): AdvisorSourceRecord => {
  const collector = collectorFor(entry);
  return {
    id: sourceIdForUrl(entry.canonicalUrl),
    canonicalUrl: entry.canonicalUrl,
    eventCandidateIds: [entry.eventId],
    tier: collector === 'manual_import' ? 3 : 1,
    title: `PDF discovery: ${entry.eventName}`,
    publisher: entry.publisher,
    publishedAt: entry.publishedAt,
    speaker: null,
    sourceType: entry.sourceType,
    collector,
    temporalRole: entry.temporalRelation,
    rightsNote: 'Public discovery URL; collect and review the original before evidence use.',
    approvedPublicHost: false,
    collectionStatus: 'discovered',
    rawPath: null,
    normalizedPath: null,
    sha256: null,
    capturedAt: null,
    failureReason: null,
  };
};

const associationFor = (entry: PdfInventoryEntry): EventSourceAssociation => ({
  canonicalUrl: entry.canonicalUrl,
  role: entry.evidenceRole,
  sourceType: entry.sourceType,
  publishedAt: entry.publishedAt,
  temporalRelation: entry.temporalRelation,
  relevanceClaim: entry.reviewNote,
  evidenceLocator: null,
  reviewStatus: 'unreviewed',
  reviewerNote: `${entry.reviewStatus}: ${entry.reviewNote}`,
});

const defaultDependencies: PdfInventoryMergeDependencies = {
  validateCandidates: () => undefined,
  persistCandidates: (candidates, candidatePath) => writeJsonAtomic(candidatePath, candidates),
  upsertSources: upsertDiscoveredSources,
};

export const mergePdfUrlInventory = async (
  root: string,
  inventory: AmyHoodPdfUrlInventory,
  injectedDependencies: Partial<PdfInventoryMergeDependencies> = {},
): Promise<PdfInventoryMergeResult> => {
  const checked = validatePdfUrlInventory(inventory);
  const candidatePath = path.join(advisorPaths(root).root, 'event-candidates.json');
  const originalCandidateBytes = await readFile(candidatePath, 'utf8');
  const candidates = JSON.parse(originalCandidateBytes) as EventCandidate[];
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  for (const entry of checked.urls) {
    if (!candidatesById.has(entry.eventId)) {
      throw new Error(`inventory URL references an unknown candidate: ${entry.eventId}`);
    }
  }

  let addedCandidateAssociations = 0;
  let updatedCandidateAssociations = 0;
  let preservedReviewedAssociations = 0;
  for (const entry of checked.urls) {
    const candidate = candidatesById.get(entry.eventId)!;
    const existing = candidate.sourceAssociations.find(({ canonicalUrl }) =>
      canonicalizeSourceUrl(canonicalUrl) === entry.canonicalUrl);
    if (existing) {
      if (existing.reviewStatus === 'reviewed') {
        preservedReviewedAssociations += 1;
      } else {
        const corrected = associationFor(entry);
        if (JSON.stringify(existing) !== JSON.stringify(corrected)) {
          candidate.sourceAssociations[candidate.sourceAssociations.indexOf(existing)] = corrected;
          updatedCandidateAssociations += 1;
        }
      }
    } else {
      candidate.sourceAssociations.push(associationFor(entry));
      addedCandidateAssociations += 1;
    }
    if (!candidate.discoveryUrls.some((url) => canonicalizeSourceUrl(url) === entry.canonicalUrl)) {
      candidate.discoveryUrls.push(entry.canonicalUrl);
    }
  }

  const dependencies = { ...defaultDependencies, ...injectedDependencies };
  dependencies.validateCandidates(candidates);
  await dependencies.persistCandidates(candidates, candidatePath);
  try {
    const registryResult = await dependencies.upsertSources(
      checked.urls.map(sourceRecordFor),
      root,
    );
    return {
      inventoryUrlCount: checked.urls.length,
      addedCandidateAssociations,
      updatedCandidateAssociations,
      addedRegistrySources: registryResult.addedCount,
      updatedRegistrySources: registryResult.updatedCount,
      preservedReviewedAssociations,
    };
  } catch (error) {
    try {
      await writeJsonAtomic(candidatePath, JSON.parse(originalCandidateBytes) as unknown);
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        'registry merge failed and candidate compensation was incomplete',
      );
    }
    throw error;
  }
};
