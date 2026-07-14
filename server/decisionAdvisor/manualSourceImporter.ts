import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  AdvisorSourceRecord,
  CollectionFailureReason,
} from '../../shared/amyHoodDecisionAdvisor';
import {
  removeAdvisorArtifact,
  writeAdvisorArtifactAtomic,
  type ArtifactWriteHooks,
} from './artifactStore';
import {
  loadRegistry,
  persistReviewedSource,
  prepareAdvisorArtifactPath,
  sourceIdForUrl,
} from './sourceRegistry';
import { withSourceFamilyOperation } from './sourceOperationLock';
import { canonicalizeSourceUrl } from './sourcePolicy';

export type SpeakerSegment = {
  speaker: string;
  startChar: number;
  endChar: number;
};

export type ReviewedSourceImport = {
  canonicalUrl: string;
  title: string;
  publisher: string;
  publishedAt: string | null;
  speaker: string | null;
  eventCandidateIds: string[];
  tier: 1 | 2 | 3;
  rightsNote: string;
  text: string;
  speakerSegments?: SpeakerSegment[];
  expectedSha256: string;
  reviewer: string;
  reviewedAt: string;
};

type ImportOptions = {
  collector: 'manual_import' | 'transcript_import';
  sourceType: string;
  failureReason: CollectionFailureReason | null;
};

export type ManualImportDependencies = {
  artifactHooks?: ArtifactWriteHooks;
  commitRegistry?: typeof persistReviewedSource;
};

type ReviewedRawSource = {
  sourceId: string;
  canonicalUrl: string;
  title: string;
  mediaType: 'text/plain; charset=utf-8';
  bodyBase64: string;
  speakerSegments: SpeakerSegment[];
  reviewer: string;
  reviewedAt: string;
  supersedesRawPath: string | null;
  supersedesNormalizedPath: string | null;
  metadata: Omit<AdvisorSourceRecord, 'rawPath' | 'normalizedPath' | 'failureReason'>;
};

const MIN_NORMALIZED_CHARACTERS = 200;

const requireNonblank = (value: unknown, field: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} is required`);
  }
  return value;
};

const validateReviewedSource = (input: ReviewedSourceImport) => {
  requireNonblank(input.canonicalUrl, 'canonicalUrl');
  requireNonblank(input.title, 'title');
  requireNonblank(input.publisher, 'publisher');
  requireNonblank(input.rightsNote, 'rightsNote');
  requireNonblank(input.reviewer, 'reviewer');
  requireNonblank(input.reviewedAt, 'reviewedAt');

  if (Number.isNaN(Date.parse(input.reviewedAt))) {
    throw new Error('reviewedAt must be a valid timestamp');
  }
  if (input.publishedAt !== null && !/^\d{4}-\d{2}-\d{2}$/.test(input.publishedAt)) {
    throw new Error('publishedAt must be YYYY-MM-DD or null');
  }
  if (input.speaker !== null && typeof input.speaker !== 'string') {
    throw new Error('speaker must be a string or null');
  }
  if (!Array.isArray(input.eventCandidateIds)
    || !input.eventCandidateIds.every((id) => typeof id === 'string' && id.trim() !== '')) {
    throw new Error('eventCandidateIds must contain nonblank strings');
  }
  if (![1, 2, 3].includes(input.tier)) throw new Error('tier must be 1, 2, or 3');
  if (typeof input.text !== 'string'
    || input.text.replace(/\s+/g, ' ').trim().length < MIN_NORMALIZED_CHARACTERS) {
    throw new Error('reviewed source must contain at least 200 normalized characters');
  }
  if (!/^[a-f0-9]{64}$/.test(input.expectedSha256)) {
    throw new Error('expectedSha256 must be a lowercase SHA-256 hash');
  }

  const actualSha256 = createHash('sha256').update(input.text, 'utf8').digest('hex');
  if (actualSha256 !== input.expectedSha256) {
    throw new Error(`SHA-256 mismatch: expected ${input.expectedSha256}, received ${actualSha256}`);
  }

  if (input.speakerSegments !== undefined && !Array.isArray(input.speakerSegments)) {
    throw new Error('speakerSegments must be an array when provided');
  }
  return actualSha256;
};

const reviewMatches = (
  raw: unknown,
  input: ReviewedSourceImport,
  options: ImportOptions,
) => {
  if (typeof raw !== 'object' || raw === null) return false;
  const artifact = raw as Partial<ReviewedRawSource>;
  return artifact.bodyBase64 === Buffer.from(input.text, 'utf8').toString('base64')
    && artifact.canonicalUrl === canonicalizeSourceUrl(input.canonicalUrl)
    && artifact.title === input.title
    && artifact.reviewer === input.reviewer
    && artifact.reviewedAt === input.reviewedAt
    && JSON.stringify(artifact.speakerSegments ?? [])
      === JSON.stringify(input.speakerSegments ?? [])
    && artifact.metadata?.collector === options.collector
    && artifact.metadata?.sourceType === options.sourceType
    && artifact.metadata?.publisher === input.publisher
    && artifact.metadata?.publishedAt === input.publishedAt
    && artifact.metadata?.speaker === input.speaker
    && artifact.metadata?.tier === input.tier
    && artifact.metadata?.rightsNote === input.rightsNote
    && JSON.stringify(artifact.metadata?.eventCandidateIds ?? [])
      === JSON.stringify(input.eventCandidateIds);
};

const readExistingReview = async (
  root: string,
  relativePath: string | null,
  input: ReviewedSourceImport,
  options: ImportOptions,
) => {
  if (!relativePath) return false;
  try {
    const artifactPath = await prepareAdvisorArtifactPath(root, relativePath);
    return reviewMatches(JSON.parse(await readFile(artifactPath, 'utf8')), input, options);
  } catch {
    return false;
  }
};

const writeImmutableArtifact = async (
  root: string,
  relativePath: string,
  text: string,
  hooks?: ArtifactWriteHooks,
) => {
  const artifactPath = await prepareAdvisorArtifactPath(root, relativePath);
  try {
    const existing = await readFile(artifactPath, 'utf8');
    if (existing !== text) throw new Error(`immutable advisor artifact collision: ${relativePath}`);
    return false;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await writeAdvisorArtifactAtomic(root, relativePath, text, hooks);
  return true;
};

const rollbackArtifacts = async (root: string, createdPaths: string[], cause: unknown) => {
  const cleanupErrors: unknown[] = [];
  for (const relativePath of [...createdPaths].reverse()) {
    try {
      await removeAdvisorArtifact(root, relativePath);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(
      [cause, ...cleanupErrors],
      'reviewed import failed and artifact rollback was incomplete',
    );
  }
  throw cause;
};

const importReviewedSourceInternal = async (
  input: ReviewedSourceImport,
  root: string,
  options: ImportOptions,
  dependencies: ManualImportDependencies = {},
): Promise<AdvisorSourceRecord> => {
  const sha256 = validateReviewedSource(input);
  const canonicalUrl = canonicalizeSourceUrl(input.canonicalUrl);

  return withSourceFamilyOperation(root, canonicalUrl, async () => {
    const registry = loadRegistry(root);
    const family = registry.sources.filter((source) => source.canonicalUrl === canonicalUrl);
    const latest = family.at(-1) ?? null;
    const baseId = sourceIdForUrl(canonicalUrl);
    const sourceId = latest?.sha256 === sha256
      ? latest.id
      : `${baseId}-${sha256.slice(0, 12)}`;
    const previous = family.find(({ id }) => id === sourceId) ?? null;
    const effectiveCandidateIds = [...new Set([
      ...(previous?.eventCandidateIds ?? []),
      ...input.eventCandidateIds,
    ])];
    const effectiveInput = { ...input, eventCandidateIds: effectiveCandidateIds };
    const sameReview = await readExistingReview(
      root,
      previous?.rawPath ?? null,
      effectiveInput,
      options,
    );
    const normalizedPath = options.failureReason === null
      ? path.join('normalized', `${sourceId}-${sha256}.txt`)
      : null;
    const baseRecord: AdvisorSourceRecord = {
      id: sourceId,
      canonicalUrl,
      eventCandidateIds: effectiveCandidateIds,
      tier: input.tier,
      title: input.title,
      publisher: input.publisher,
      publishedAt: input.publishedAt,
      speaker: input.speaker,
      sourceType: options.sourceType,
      collector: options.collector,
      temporalRole: 'decision_time',
      rightsNote: input.rightsNote,
      approvedPublicHost: false,
      collectionStatus: 'review_required',
      rawPath: null,
      normalizedPath,
      sha256,
      capturedAt: input.reviewedAt,
      failureReason: options.failureReason,
    };
    const {
      rawPath: excludedRawPath,
      normalizedPath: excludedNormalizedPath,
      failureReason: excludedFailureReason,
      ...metadata
    } = baseRecord;
    void [excludedRawPath, excludedNormalizedPath, excludedFailureReason];
    const rawSource: ReviewedRawSource = {
      sourceId,
      canonicalUrl,
      title: input.title,
      mediaType: 'text/plain; charset=utf-8',
      bodyBase64: Buffer.from(input.text, 'utf8').toString('base64'),
      speakerSegments: input.speakerSegments ?? [],
      reviewer: input.reviewer,
      reviewedAt: input.reviewedAt,
      supersedesRawPath: sameReview ? null : previous?.rawPath ?? latest?.rawPath ?? null,
      supersedesNormalizedPath: sameReview
        ? null
        : previous?.normalizedPath ?? latest?.normalizedPath ?? null,
      metadata: {
        ...metadata,
        collectionStatus: 'collected',
      },
    };
    const rawText = `${JSON.stringify(rawSource, null, 2)}\n`;
    const reviewSha256 = createHash('sha256').update(rawText, 'utf8').digest('hex');
    const rawPath = sameReview && previous?.rawPath
      ? previous.rawPath
      : path.join('raw', `${sourceId}-${sha256}-${reviewSha256.slice(0, 16)}.json`);
    const finalRecord: AdvisorSourceRecord = { ...baseRecord, rawPath };
    const createdPaths: string[] = [];

    try {
      if (!sameReview && await writeImmutableArtifact(
        root,
        rawPath,
        rawText,
        dependencies.artifactHooks,
      )) createdPaths.push(rawPath);
      if (normalizedPath && await writeImmutableArtifact(
        root,
        normalizedPath,
        input.text,
        dependencies.artifactHooks,
      )) createdPaths.push(normalizedPath);
      return await (dependencies.commitRegistry ?? persistReviewedSource)(
        root,
        finalRecord,
        previous?.rawPath ?? null,
      );
    } catch (error) {
      return rollbackArtifacts(root, createdPaths, error);
    }
  });
};

export const importReviewedSource = (
  input: ReviewedSourceImport,
  root: string,
  dependencies: ManualImportDependencies = {},
): Promise<AdvisorSourceRecord> => importReviewedSourceInternal(input, root, {
  collector: 'manual_import',
  sourceType: 'manual_import',
  failureReason: null,
}, dependencies);

export const importReviewedSourceWithOptions = importReviewedSourceInternal;
