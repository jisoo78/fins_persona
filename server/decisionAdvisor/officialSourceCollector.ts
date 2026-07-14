import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { readFile } from 'node:fs/promises';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';
import path from 'node:path';
import { Readable } from 'node:stream';
import { load } from 'cheerio';

import type {
  AdvisorRawSource,
  AdvisorSourceRecord,
  CollectionFailureReason,
  EvidenceSpeakerSegment,
} from '../../shared/amyHoodDecisionAdvisor';
import { writeAdvisorArtifactAtomic } from './artifactStore';
import {
  createContentVersion,
  loadSourceRecord,
  markCollectionFailure,
  prepareAdvisorArtifactPath,
  transitionSource,
  upsertDiscoveredSource,
} from './sourceRegistry';
import { withSourceFamilyOperation } from './sourceOperationLock';
import { MicrosoftIRCollector, MicrosoftSourceCollector } from './collectors/microsoftCollectors';
import { PublicHtmlCollector } from './collectors/publicHtmlCollector';
import { SecEdgarCollector } from './collectors/secEdgarCollector';
import type {
  CollectorDependencies,
  SourceCollector,
} from './collectors/types';

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MIN_NORMALIZED_CHARACTERS = 200;
const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUTS = {
  connectMs: 10_000,
  headersMs: 15_000,
  bodyMs: 15_000,
};
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

const extractDocumentMetadata = (html: string) => {
  const $ = load(html);
  const title = $('title').first().text().replace(/\s+/g, ' ').trim();
  const published = $('meta[property="article:published_time"]').attr('content')
    ?? $('meta[name="date"]').attr('content')
    ?? $('time[datetime]').first().attr('datetime');
  const publishedAt = published?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
  return { title, publishedAt, $ };
};

export const normalizeDocument = (contentText: string, mediaType: string): string => {
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

export const extractSpeakerSegments = (text: string): EvidenceSpeakerSegment[] => {
  const segments: EvidenceSpeakerSegment[] = [];
  const attributedQuotePatterns = [
    /[“"]([^”"]{20,})[”"]\s*,?\s*(?:said|says)\s+Amy Hood\b/giu,
    /\bAmy Hood\b[^“"]{0,80}(?:said|says|stated)\s*:?[“"]([^”"]{20,})[”"]/giu,
  ];
  for (const pattern of attributedQuotePatterns) {
    for (const match of text.matchAll(pattern)) {
      const quote = match[1];
      const relativeStart = match[0].indexOf(quote);
      const startChar = match.index + relativeStart;
      segments.push({ speaker: 'Amy Hood', startChar, endChar: startChar + quote.length });
    }
  }
  const transcriptPattern = /(?:^|\n)Amy Hood:\s*([^\n]+(?:\n(?![^:\n]{1,80}:)[^\n]+)*)/giu;
  for (const match of text.matchAll(transcriptPattern)) {
    const spoken = match[1];
    const relativeStart = match[0].indexOf(spoken);
    const startChar = match.index + relativeStart;
    segments.push({ speaker: 'Amy Hood', startChar, endChar: startChar + spoken.length });
  }
  return segments.sort((left, right) => left.startChar - right.startChar);
};

export const extractDeclaredCanonicalUrl = (text: string, mediaType: string): string | null => {
  if (mediaType !== 'text/html' && mediaType !== 'application/xhtml+xml') return null;
  const href = load(text)('link[rel="canonical"]').first().attr('href');
  if (!href) return null;
  try {
    const url = new URL(href);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
};

const decodeSourceText = (bytes: Buffer, declaredCharset: string | null) => {
  let charset = declaredCharset?.trim().replace(/^['"]|['"]$/g, '').toLowerCase()
    || 'utf-8';
  if (bytes.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))) charset = 'utf-8';
  else if (bytes.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))) charset = 'utf-16le';
  else if (bytes.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))) charset = 'utf-16be';
  if (charset === 'windows-1252' || charset === 'cp1252') {
    const replacements = [
      0x20ac, 0x81, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
      0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8d, 0x017d, 0x8f,
      0x90, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
      0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x9d, 0x017e, 0x0178,
    ];
    return [...bytes].map((byte) => String.fromCodePoint(
      byte >= 0x80 && byte <= 0x9f ? replacements[byte - 0x80] : byte,
    )).join('');
  }
  try {
    return new TextDecoder(charset, { fatal: true }).decode(bytes);
  } catch (error) {
    throw new CollectionError(`unsupported or invalid source charset: ${charset}`, 'invalid_content', {
      cause: error,
    });
  }
};

const restrictedAddresses = new BlockList();
restrictedAddresses.addSubnet('0.0.0.0', 8, 'ipv4');
restrictedAddresses.addSubnet('10.0.0.0', 8, 'ipv4');
restrictedAddresses.addSubnet('100.64.0.0', 10, 'ipv4');
restrictedAddresses.addSubnet('127.0.0.0', 8, 'ipv4');
restrictedAddresses.addSubnet('169.254.0.0', 16, 'ipv4');
restrictedAddresses.addSubnet('172.16.0.0', 12, 'ipv4');
restrictedAddresses.addSubnet('192.168.0.0', 16, 'ipv4');
restrictedAddresses.addAddress('::', 'ipv6');
restrictedAddresses.addAddress('::1', 'ipv6');
restrictedAddresses.addSubnet('fc00::', 7, 'ipv6');
restrictedAddresses.addSubnet('fe80::', 10, 'ipv6');

const isRestrictedAddress = (rawAddress: string) => {
  const address = rawAddress.replace(/^\[|\]$/g, '').toLowerCase();
  const family = isIP(address);
  if (family === 0) return true;
  return restrictedAddresses.check(address, family === 4 ? 'ipv4' : 'ipv6');
};

const defaultResolveHost = async (hostname: string) =>
  (await lookup(hostname, { all: true, verbatim: true })).map(({ address }) => address);

export const defaultPinnedTransport = (
  {
    url,
    init,
    validatedAddresses,
    timeouts,
  }: Parameters<NonNullable<CollectorDependencies['transportImpl']>>[0],
  requestImpl: typeof httpsRequest = httpsRequest,
) => new Promise<Response>((resolve, reject) => {
  const address = validatedAddresses[0];
  const family = isIP(address);
  const headers = Object.fromEntries(new Headers(init.headers));
  let settled = false;
  let connectTimer: ReturnType<typeof setTimeout> | undefined;
  let headersTimer: ReturnType<typeof setTimeout> | undefined;
  const clearTimers = () => {
    if (connectTimer) clearTimeout(connectTimer);
    if (headersTimer) clearTimeout(headersTimer);
  };
  const request = requestImpl(url, {
    method: init.method ?? 'GET',
    headers: { ...headers, Host: url.host },
    servername: url.hostname,
    family,
    lookup: (_hostname, _options, callback) => callback(null, address, family),
  }, (incoming) => {
    if (settled) {
      incoming.destroy();
      return;
    }
    settled = true;
    clearTimers();
    init.signal?.removeEventListener('abort', abortRequest);
    const responseHeaders = new Headers();
    for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
      responseHeaders.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1]);
    }
    resolve(new Response(Readable.toWeb(incoming) as ReadableStream<Uint8Array>, {
      status: incoming.statusCode ?? 500,
      statusText: incoming.statusMessage,
      headers: responseHeaders,
    }));
  });
  const abortRequest = () => request.destroy(new Error('source request aborted'));
  connectTimer = setTimeout(
    () => request.destroy(new Error('source connect timeout')),
    timeouts.connectMs,
  );
  headersTimer = setTimeout(
    () => request.destroy(new Error('source headers timeout')),
    timeouts.headersMs,
  );
  request.on('socket', (socket) => {
    if (socket.connecting) {
      socket.once('secureConnect', () => {
        if (connectTimer) clearTimeout(connectTimer);
      });
    } else if (connectTimer) {
      clearTimeout(connectTimer);
    }
  });
  request.once('error', (error) => {
    if (settled) return;
    settled = true;
    clearTimers();
    init.signal?.removeEventListener('abort', abortRequest);
    reject(error);
  });
  init.signal?.addEventListener('abort', abortRequest, { once: true });
  if (init.signal?.aborted) abortRequest();
  request.end();
});

const validateNetworkTarget = async (
  url: URL,
  record: AdvisorSourceRecord,
  collector: SourceCollector,
  deps: CollectorDependencies,
  redirect: boolean,
) => {
  if (url.protocol !== 'https:') {
    throw new CollectionError('source and redirect URLs must use HTTPS', 'access_denied');
  }
  const literal = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(literal) && isRestrictedAddress(literal)) {
    throw new CollectionError(
      `source destination resolves to a private, loopback, or link-local address: ${url.hostname}`,
      'access_denied',
    );
  }
  const redirectedRecord = { ...record, canonicalUrl: url.toString() };
  const originalHost = new URL(record.canonicalUrl).hostname;
  const publicHostChanged = collector.name === 'public_html' && url.hostname !== originalHost;
  if (publicHostChanged || !collector.supports(redirectedRecord)) {
    throw new CollectionError(
      `${redirect ? 'redirect' : 'source'} destination violates collector policy: ${url.hostname}`,
      'access_denied',
    );
  }
  let addresses: string[];
  try {
    addresses = isIP(literal)
      ? [literal]
      : await (deps.resolveHost ?? defaultResolveHost)(url.hostname);
  } catch (error) {
    throw new CollectionError(`failed to resolve source host: ${url.hostname}`, 'network_error', {
      cause: error,
    });
  }
  if (addresses.length === 0 || addresses.some(isRestrictedAddress)) {
    throw new CollectionError(
      `source destination resolves to a private, loopback, or link-local address: ${url.hostname}`,
      'access_denied',
    );
  }
  return addresses;
};

const fetchExactBytes = async (
  record: AdvisorSourceRecord,
  deps: CollectorDependencies,
  userAgent: string,
  collector: SourceCollector,
) => {
  const timeouts = { ...DEFAULT_TIMEOUTS, ...deps.timeouts };
  const transportImpl = deps.transportImpl ?? defaultPinnedTransport;
  let response: Response;
  let currentUrl = new URL(record.canonicalUrl);
  const redirectChain = [record.canonicalUrl];
  for (let redirects = 0; ; redirects += 1) {
    const validatedAddresses = await validateNetworkTarget(
      currentUrl,
      record,
      collector,
      deps,
      redirects > 0,
    );
    const controller = new AbortController();
    let headersTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      response = await Promise.race([
        transportImpl({
          url: currentUrl,
          validatedAddresses,
          timeouts,
          init: {
            signal: controller.signal,
            headers: {
              Accept: 'text/html, application/xhtml+xml, application/json, text/plain;q=0.9',
              'User-Agent': userAgent,
            },
            redirect: 'manual',
          },
        }),
        new Promise<never>((_resolve, reject) => {
          headersTimer = setTimeout(() => {
            controller.abort();
            reject(new Error('source headers timeout'));
          }, timeouts.connectMs + timeouts.headersMs);
        }),
      ]);
    } catch (error) {
      throw new CollectionError(
        error instanceof Error ? error.message : 'source request failed',
        'network_error',
        { cause: error },
      );
    } finally {
      if (headersTimer) clearTimeout(headersTimer);
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    await response.body?.cancel().catch(() => undefined);
    if (redirects >= MAX_REDIRECTS) {
      throw new CollectionError(`source exceeded ${MAX_REDIRECTS} redirects`, 'access_denied');
    }
    const location = response.headers.get('location');
    if (!location) throw new CollectionError('redirect response is missing Location', 'invalid_content');
    currentUrl = new URL(location, currentUrl);
    redirectChain.push(currentUrl.toString());
  }

  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new CollectionError(
      `source request failed with HTTP ${response.status}`,
      response.status === 401 || response.status === 403
        ? 'access_denied'
        : 'invalid_content',
    );
  }

  const contentType = response.headers.get('content-type') ?? '';
  const mediaType = contentType.split(';', 1)[0]
    .trim().toLowerCase() ?? '';
  if (!supportedMediaTypes.has(mediaType)) {
    await response.body?.cancel().catch(() => undefined);
    throw new CollectionError(`unsupported source content type: ${mediaType || 'missing'}`, 'invalid_content');
  }

  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new CollectionError('source response exceeds the 5 MB limit', 'invalid_content');
  }

  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  const reader = response.body?.getReader();
  if (!reader) {
    throw new CollectionError('source response body is unavailable', 'invalid_content');
  }
  while (true) {
    let bodyTimer: ReturnType<typeof setTimeout> | undefined;
    let result: ReadableStreamReadResult<Uint8Array>;
    try {
      result = await Promise.race([
        reader.read(),
        new Promise<never>((_resolve, reject) => {
          bodyTimer = setTimeout(
            () => reject(new Error('source body timeout')),
            timeouts.bodyMs,
          );
        }),
      ]);
    } catch (error) {
      await reader.cancel().catch(() => undefined);
      throw new CollectionError(
        error instanceof Error ? error.message : 'source body read failed',
        'network_error',
        { cause: error },
      );
    } finally {
      if (bodyTimer) clearTimeout(bodyTimer);
    }
    const { done, value } = result;
    if (done) break;
    receivedBytes += value.byteLength;
    if (receivedBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new CollectionError('source response exceeds the 5 MB limit', 'invalid_content');
    }
    chunks.push(value);
  }
  const bytes = Buffer.concat(chunks, receivedBytes);
  const charset = contentType.match(/(?:^|;)\s*charset\s*=\s*([^;]+)/i)?.[1] ?? null;
  return { bytes, mediaType, charset, finalUrl: currentUrl.toString(), redirectChain };
};

const rawArtifactMatches = async (
  root: string,
  rawPath: string,
  record: AdvisorSourceRecord,
  finalUrl: string,
  redirectChain: string[],
  speakerSegments: EvidenceSpeakerSegment[],
  expectedBytes: Buffer,
  expectedSha256: string,
) => {
  try {
    const destination = await prepareAdvisorArtifactPath(root, rawPath);
    const parsed = JSON.parse(await readFile(destination, 'utf8')) as AdvisorRawSource;
    if (parsed.sourceId !== record.id
      || parsed.canonicalUrl !== finalUrl
      || parsed.requestedCanonicalUrl !== record.canonicalUrl
      || parsed.finalUrl !== finalUrl
      || JSON.stringify(parsed.redirectChain) !== JSON.stringify(redirectChain)
      || JSON.stringify(parsed.speakerSegments ?? []) !== JSON.stringify(speakerSegments)
      || parsed.metadata?.id !== record.id
      || parsed.metadata?.sha256 !== expectedSha256
      || typeof parsed.bodyBase64 !== 'string') return false;
    const decoded = Buffer.from(parsed.bodyBase64, 'base64');
    const canonicalBase64 = decoded.toString('base64');
    if (canonicalBase64 !== parsed.bodyBase64.replace(/\s+/g, '')) return false;
    return decoded.equals(expectedBytes)
      && createHash('sha256').update(decoded).digest('hex') === expectedSha256;
  } catch {
    return false;
  }
};

const collectHtmlSourceUnlocked = async (
  record: AdvisorSourceRecord,
  deps: CollectorDependencies,
  userAgent: string,
): Promise<AdvisorSourceRecord> => {
  const collector = collectors.find(({ name }) => name === record.collector);
  if (!collector || !collector.supports(record)) {
    throw new CollectionError(`${record.collector} does not support this source URL`, 'access_denied');
  }
  const { bytes, mediaType, charset, finalUrl, redirectChain } = await fetchExactBytes(
    record,
    deps,
    userAgent,
    collector,
  );
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const html = decodeSourceText(bytes, charset);
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
    const rawPath = target.sha256 === sha256 && target.rawPath
      ? target.rawPath
      : path.join('raw', `${target.id}-${sha256}.json`);
    const rawSourceFor = (speakerSegments: EvidenceSpeakerSegment[]): AdvisorRawSource => {
      const {
        rawPath: excludedRawPath,
        normalizedPath: excludedNormalizedPath,
        failureReason: excludedFailureReason,
        ...metadata
      } = target;
      void [excludedRawPath, excludedNormalizedPath, excludedFailureReason];
      return {
        sourceId: target.id,
        canonicalUrl: finalUrl,
        requestedCanonicalUrl: target.canonicalUrl,
        finalUrl,
        redirectChain,
        speakerSegments,
        title,
        mediaType,
        bodyBase64: bytes.toString('base64'),
        metadata: {
          ...metadata,
          title,
          publishedAt,
          collectionStatus: 'collected',
          finalUrl,
          redirectChain,
          sha256,
          capturedAt,
        },
      };
    };
    if (target.sha256 !== sha256 || target.rawPath === null) {
      await writeAdvisorArtifactAtomic(
        deps.root,
        rawPath,
        `${JSON.stringify(rawSourceFor([]), null, 2)}\n`,
        deps.artifactHooks,
      );
    }
    if (target.collectionStatus === 'queued') {
      target = await transitionSource(deps.root, target.id, 'collected', {
        title,
        publishedAt,
        rawPath,
        sha256,
        capturedAt,
        finalUrl,
        redirectChain,
        failureReason: null,
      });
    }

    const normalized = normalizeDocument(html, mediaType);
    const speakerSegments = extractSpeakerSegments(normalized);
    const validExistingRaw = target.sha256 === sha256
      && target.rawPath !== null
      && await rawArtifactMatches(
        deps.root,
        rawPath,
        target,
        finalUrl,
        redirectChain,
        speakerSegments,
        bytes,
        sha256,
      );

    if (!validExistingRaw) {
      await writeAdvisorArtifactAtomic(
        deps.root,
        rawPath,
        `${JSON.stringify(rawSourceFor(speakerSegments), null, 2)}\n`,
        deps.artifactHooks,
      );
    }

    const normalizedPath = target.normalizedPath
      ?? path.join('normalized', `${target.id}-${sha256}.txt`);
    await writeAdvisorArtifactAtomic(
      deps.root,
      normalizedPath,
      normalized,
      deps.artifactHooks,
    );
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

export const collectHtmlSource = (
  record: AdvisorSourceRecord,
  deps: CollectorDependencies,
  userAgent: string,
) => withSourceFamilyOperation(
  deps.root,
  record.canonicalUrl,
  () => collectHtmlSourceUnlocked(loadSourceRecord(deps.root, record.id), deps, userAgent),
);

export const collectOfficialSource = (
  candidate: AdvisorSourceRecord,
  dependencies: CollectorDependencies,
): Promise<AdvisorSourceRecord> => withSourceFamilyOperation(
    dependencies.root,
    candidate.canonicalUrl,
    async () => {
      const record = await upsertDiscoveredSource(candidate, dependencies.root);
      const currentRecord = loadSourceRecord(dependencies.root, record.id);
      try {
        const collector = collectors.find(({ name }) => name === currentRecord.collector);
        if (!collector) throw new CollectionError(`unsupported collector: ${currentRecord.collector}`, 'invalid_content');
        if (!collector.supports(currentRecord)) {
          const message = currentRecord.collector === 'public_html'
            ? 'public HTML collection requires an explicitly approved public host'
            : `${currentRecord.collector} does not support source host ${new URL(currentRecord.canonicalUrl).hostname}`;
          throw new CollectionError(message, 'invalid_content');
        }

        return await collector.collect(currentRecord, {
          ...dependencies,
          collectHtml: collectHtmlSourceUnlocked,
        });
      } catch (error) {
        const reason = error instanceof CollectionError ? error.failureReason : 'invalid_content';
        const sourceId = error instanceof CollectionError && error.sourceId
          ? error.sourceId
          : currentRecord.id;
        await markCollectionFailure(dependencies.root, sourceId, reason);
        throw error;
      }
    },
  );
