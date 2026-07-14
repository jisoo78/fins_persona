import { createHash, randomUUID } from 'node:crypto';
import { open, rename, rm } from 'node:fs/promises';
import path from 'node:path';

import type {
  AdvisorSourceRecord,
  CollectionFailureReason,
} from '../../shared/amyHoodDecisionAdvisor';
import { writeJsonAtomic } from './jsonStore';
import { advisorPaths } from './paths';
import {
  createContentVersion,
  prepareAdvisorArtifactPath,
  sourceIdForUrl,
  transitionSource,
  upsertDiscoveredSource,
} from './sourceRegistry';

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

type ReviewedRawSource = {
  sourceId: string;
  canonicalUrl: string;
  title: string;
  mediaType: 'text/plain; charset=utf-8';
  bodyBase64: string;
  speakerSegments: SpeakerSegment[];
  reviewer: string;
  reviewedAt: string;
  metadata: Omit<AdvisorSourceRecord, 'rawPath' | 'normalizedPath' | 'failureReason'>;
};

const MIN_NORMALIZED_CHARACTERS = 200;
const importLocks = new Map<string, Promise<void>>();

const withImportLock = async <T>(key: string, operation: () => Promise<T>) => {
  const previous = importLocks.get(key) ?? Promise.resolve();
  let release = () => undefined;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => current);
  importLocks.set(key, queued);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (importLocks.get(key) === queued) importLocks.delete(key);
  }
};

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

const writeTextAtomic = async (root: string, relativePath: string, text: string) => {
  const destination = await prepareAdvisorArtifactPath(root, relativePath);
  const temporaryRelativePath = path.join(
    '.artifact-staging',
    `${path.basename(destination)}.${process.pid}.${randomUUID()}.tmp`,
  );
  const temporaryPath = await prepareAdvisorArtifactPath(root, temporaryRelativePath);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(text, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await prepareAdvisorArtifactPath(root, relativePath);
    await rename(temporaryPath, destination);
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
};

const importReviewedSourceInternal = async (
  input: ReviewedSourceImport,
  root: string,
  options: ImportOptions,
): Promise<AdvisorSourceRecord> => {
  const sha256 = validateReviewedSource(input);
  const lockKey = `${advisorPaths(root).registry}\0${sourceIdForUrl(input.canonicalUrl)}`;

  return withImportLock(lockKey, async () => {
    const candidate: AdvisorSourceRecord = {
      id: sourceIdForUrl(input.canonicalUrl),
      canonicalUrl: input.canonicalUrl,
      eventCandidateIds: input.eventCandidateIds,
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
      collectionStatus: 'discovered',
      rawPath: null,
      normalizedPath: null,
      sha256: null,
      capturedAt: null,
      failureReason: null,
    };
    let target = await upsertDiscoveredSource(candidate, root);
    if (target.sha256 && target.sha256 !== sha256) {
      target = await createContentVersion(root, target, sha256);
    }

    const capturedAt = input.reviewedAt;
    const rawPath = path.join('raw', `${target.id}-${sha256}.json`);
    const normalizedPath = path.join('normalized', `${target.id}-${sha256}.txt`);

    if (target.collectionStatus === 'discovered'
      || target.collectionStatus === 'review_required'
      || target.collectionStatus === 'approved'
      || target.collectionStatus === 'failed') {
      target = await transitionSource(root, target.id, 'queued', {
        title: input.title,
        publisher: input.publisher,
        publishedAt: input.publishedAt,
        speaker: input.speaker,
        rightsNote: input.rightsNote,
        collector: options.collector,
        sourceType: options.sourceType,
        failureReason: null,
      });
    }

    const {
      rawPath: excludedRawPath,
      normalizedPath: excludedNormalizedPath,
      failureReason: excludedFailureReason,
      ...persistedMetadata
    } = target;
    void [excludedRawPath, excludedNormalizedPath, excludedFailureReason];
    const metadata: ReviewedRawSource['metadata'] = {
      ...persistedMetadata,
      title: input.title,
      publisher: input.publisher,
      publishedAt: input.publishedAt,
      speaker: input.speaker,
      rightsNote: input.rightsNote,
      collector: options.collector,
      sourceType: options.sourceType,
      collectionStatus: 'collected',
      sha256,
      capturedAt,
    };
    const rawSource: ReviewedRawSource = {
      sourceId: target.id,
      canonicalUrl: target.canonicalUrl,
      title: input.title,
      mediaType: 'text/plain; charset=utf-8',
      bodyBase64: Buffer.from(input.text, 'utf8').toString('base64'),
      speakerSegments: input.speakerSegments ?? [],
      reviewer: input.reviewer,
      reviewedAt: input.reviewedAt,
      metadata,
    };

    await writeJsonAtomic(
      await prepareAdvisorArtifactPath(root, rawPath),
      rawSource,
    );
    if (options.failureReason === null) {
      await writeTextAtomic(root, normalizedPath, input.text);
    }

    if (target.collectionStatus === 'queued') {
      target = await transitionSource(root, target.id, 'collected', {
        title: input.title,
        publisher: input.publisher,
        publishedAt: input.publishedAt,
        speaker: input.speaker,
        rightsNote: input.rightsNote,
        collector: options.collector,
        sourceType: options.sourceType,
        rawPath,
        sha256,
        capturedAt,
        failureReason: null,
      });
    }
    if (target.collectionStatus === 'collected' && options.failureReason !== null) {
      target = await transitionSource(root, target.id, 'review_required', {
        failureReason: options.failureReason,
      });
    } else if (target.collectionStatus === 'collected') {
      target = await transitionSource(root, target.id, 'normalized', { normalizedPath });
    }
    if (target.collectionStatus === 'normalized') {
      target = await transitionSource(root, target.id, 'review_required', {
        failureReason: options.failureReason,
      });
    }
    return target;
  });
};

export const importReviewedSource = (
  input: ReviewedSourceImport,
  root: string,
): Promise<AdvisorSourceRecord> => importReviewedSourceInternal(input, root, {
  collector: 'manual_import',
  sourceType: 'manual_import',
  failureReason: null,
});

export const importReviewedSourceWithOptions = importReviewedSourceInternal;
