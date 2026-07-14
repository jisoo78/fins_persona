import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';

import type {
  AdvisorRawSource,
  AdvisorSourceRecord,
  CollectionFailureReason,
} from '../../shared/amyHoodDecisionAdvisor';
import { writeJsonAtomic } from './jsonStore';
import { advisorPaths } from './paths';
import {
  createContentVersion,
  markCollectionFailure,
  transitionSource,
  upsertDiscoveredSource,
} from './sourceRegistry';
import { MicrosoftIRCollector, MicrosoftSourceCollector } from './collectors/microsoftCollectors';
import { PublicHtmlCollector } from './collectors/publicHtmlCollector';
import { SecEdgarCollector } from './collectors/secEdgarCollector';
import type {
  CollectorDependencies,
  SourceCollector,
} from './collectors/types';

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MIN_NORMALIZED_CHARACTERS = 200;
const supportedMediaTypes = new Set([
  'text/html',
  'application/xhtml+xml',
  'application/json',
  'text/plain',
]);

class CollectionError extends Error {
  constructor(
    message: string,
    readonly failureReason: CollectionFailureReason,
    options?: ErrorOptions,
    readonly sourceId?: string,
  ) {
    super(message, options);
    this.name = 'CollectionError';
  }
}

const collectors: SourceCollector[] = [
  MicrosoftIRCollector,
  MicrosoftSourceCollector,
  SecEdgarCollector,
  PublicHtmlCollector,
];

const writeTextAtomic = async (destination: string, text: string) => {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporaryPath = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporaryPath, 'wx');
    await handle.writeFile(text, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, destination);
  } catch (error) {
    if (handle) await handle.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
};

const extractDocumentMetadata = (html: string) => {
  const $ = load(html);
  const title = $('title').first().text().replace(/\s+/g, ' ').trim();
  const published = $('meta[property="article:published_time"]').attr('content')
    ?? $('meta[name="date"]').attr('content')
    ?? $('time[datetime]').first().attr('datetime');
  const publishedAt = published?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
  return { title, publishedAt, $ };
};

const normalizeDocument = (contentText: string, mediaType: string): string => {
  if (mediaType === 'application/json') {
    let normalized: string;
    try {
      normalized = JSON.stringify(JSON.parse(contentText)).replace(/\s+/g, ' ').trim();
    } catch (error) {
      throw new CollectionError('source response contains invalid JSON', 'invalid_content', {
        cause: error,
      });
    }
    if (normalized.length < MIN_NORMALIZED_CHARACTERS) {
      throw new CollectionError(
        `normalized source text must contain at least ${MIN_NORMALIZED_CHARACTERS} characters`,
        'invalid_content',
      );
    }
    return `${normalized}\n`;
  }

  if (mediaType === 'text/plain') {
    const normalized = contentText.replace(/\s+/g, ' ').trim();
    if (normalized.length < MIN_NORMALIZED_CHARACTERS) {
      throw new CollectionError(
        `normalized source text must contain at least ${MIN_NORMALIZED_CHARACTERS} characters`,
        'invalid_content',
      );
    }
    return `${normalized}\n`;
  }

  const html = contentText;
  const { $ } = extractDocumentMetadata(html);
  $('script, style, nav, header, footer, form, noscript, aside').remove();
  const content = $('main').first().length
    ? $('main').first()
    : $('article').first().length
      ? $('article').first()
      : $('[role="main"]').first().length
        ? $('[role="main"]').first()
        : $('body').first();
  const normalized = content.text().replace(/\s+/g, ' ').trim();
  if (normalized.length < MIN_NORMALIZED_CHARACTERS) {
    throw new CollectionError(
      `normalized source text must contain at least ${MIN_NORMALIZED_CHARACTERS} characters`,
      'invalid_content',
    );
  }
  return `${normalized}\n`;
};

const fetchExactBytes = async (
  record: AdvisorSourceRecord,
  deps: CollectorDependencies,
  userAgent: string,
) => {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  let response: Response;
  try {
    response = await fetchImpl(record.canonicalUrl, {
      headers: {
        Accept: 'text/html, application/xhtml+xml, application/json, text/plain;q=0.9',
        'User-Agent': userAgent,
      },
      redirect: 'follow',
    });
  } catch (error) {
    throw new CollectionError(
      error instanceof Error ? error.message : 'source request failed',
      'network_error',
      { cause: error },
    );
  }

  if (!response.ok) {
    throw new CollectionError(
      `source request failed with HTTP ${response.status}`,
      response.status === 401 || response.status === 403
        ? 'access_denied'
        : 'invalid_content',
    );
  }

  const mediaType = response.headers.get('content-type')?.split(';', 1)[0]
    .trim().toLowerCase() ?? '';
  if (!supportedMediaTypes.has(mediaType)) {
    throw new CollectionError(`unsupported source content type: ${mediaType || 'missing'}`, 'invalid_content');
  }

  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    throw new CollectionError('source response exceeds the 5 MB limit', 'invalid_content');
  }

  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  const reader = response.body?.getReader();
  if (!reader) {
    throw new CollectionError('source response body is unavailable', 'invalid_content');
  }
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    receivedBytes += value.byteLength;
    if (receivedBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new CollectionError('source response exceeds the 5 MB limit', 'invalid_content');
    }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks, receivedBytes);
  return { bytes, mediaType };
};

export const collectHtmlSource = async (
  record: AdvisorSourceRecord,
  deps: CollectorDependencies,
  userAgent: string,
): Promise<AdvisorSourceRecord> => {
  const { bytes, mediaType } = await fetchExactBytes(record, deps, userAgent);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const html = bytes.toString('utf8');
  const documentMetadata = extractDocumentMetadata(html);
  const capturedAt = (deps.now?.() ?? new Date()).toISOString();
  let target = record;

  if (record.sha256 && record.sha256 !== sha256) {
    target = await createContentVersion(deps.root, record, sha256);
  }
  if (target.collectionStatus === 'discovered'
    || target.collectionStatus === 'review_required'
    || target.collectionStatus === 'approved'
    || target.collectionStatus === 'failed') {
    target = await transitionSource(deps.root, target.id, 'queued', {
      failureReason: null,
    });
  }

  try {
    const title = target.title || documentMetadata.title;
    const publishedAt = target.publishedAt ?? documentMetadata.publishedAt;
    const advisorRoot = advisorPaths(deps.root).root;
    const rawPath = target.sha256 === sha256 && target.rawPath
      ? target.rawPath
      : path.join('raw', `${target.id}-${sha256}.json`);

    if (!(target.sha256 === sha256 && target.rawPath)) {
      const {
        rawPath: excludedRawPath,
        normalizedPath: excludedNormalizedPath,
        failureReason: excludedFailureReason,
        ...metadata
      } = target;
      void [excludedRawPath, excludedNormalizedPath, excludedFailureReason];
      const rawSource: AdvisorRawSource = {
        sourceId: target.id,
        canonicalUrl: target.canonicalUrl,
        title,
        mediaType,
        bodyBase64: bytes.toString('base64'),
        metadata: {
          ...metadata,
          title,
          publishedAt,
          collectionStatus: 'collected',
          sha256,
          capturedAt,
        },
      };
      await writeJsonAtomic(path.resolve(advisorRoot, rawPath), rawSource);
    }

    if (target.collectionStatus === 'queued') {
      target = await transitionSource(deps.root, target.id, 'collected', {
        title,
        publishedAt,
        rawPath,
        sha256,
        capturedAt,
        failureReason: null,
      });
    }

    const normalized = normalizeDocument(html, mediaType);
    const normalizedPath = target.normalizedPath
      ?? path.join('normalized', `${target.id}-${sha256}.txt`);
    if (!target.normalizedPath) {
      await writeTextAtomic(path.resolve(advisorRoot, normalizedPath), normalized);
    }
    if (target.collectionStatus !== 'normalized') {
      target = await transitionSource(deps.root, target.id, 'normalized', {
        normalizedPath,
      });
    }
    return transitionSource(deps.root, target.id, 'review_required');
  } catch (error) {
    if (error instanceof CollectionError) {
      throw new CollectionError(error.message, error.failureReason, { cause: error }, target.id);
    }
    throw new CollectionError(
      error instanceof Error ? error.message : 'source persistence failed',
      'invalid_content',
      { cause: error },
      target.id,
    );
  }
};

export const collectOfficialSource = async (
  candidate: AdvisorSourceRecord,
  dependencies: CollectorDependencies,
): Promise<AdvisorSourceRecord> => {
  let record = await upsertDiscoveredSource(candidate, dependencies.root);
  try {
    const collector = collectors.find(({ name }) => name === record.collector);
    if (!collector) throw new CollectionError(`unsupported collector: ${record.collector}`, 'invalid_content');
    if (!collector.supports(record)) {
      const message = record.collector === 'public_html'
        ? 'public HTML collection requires an explicitly approved public host'
        : `${record.collector} does not support source host ${new URL(record.canonicalUrl).hostname}`;
      throw new CollectionError(message, 'invalid_content');
    }

    return await collector.collect(record, {
      ...dependencies,
      collectHtml: collectHtmlSource,
    });
  } catch (error) {
    const reason = error instanceof CollectionError ? error.failureReason : 'invalid_content';
    const sourceId = error instanceof CollectionError && error.sourceId
      ? error.sourceId
      : record.id;
    await markCollectionFailure(dependencies.root, sourceId, reason);
    throw error;
  }
};
