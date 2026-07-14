/**
 * Test Plan:
 * 1. Happy Path:
 *    - advisor paths are deterministic and atomic JSON persistence round-trips valid data.
 *    - an approved official HTML source persists exact bytes, normalizes useful text, and reaches review.
 *    - a reviewed transcript import preserves exact text and addressable Amy Hood speaker segments.
 *
 * 2. Edge Cases:
 *    - a LinkedIn URL is classified as discovery-only.
 *    - canonical-equivalent discoveries resolve to the same URL identity.
 *    - fragments and tracking parameters are removed while useful query keys are sorted.
 *    - duplicate canonical URLs merge candidate links without duplicating registry records.
 *    - changed content creates an immutable source version while identical refreshes stay idempotent.
 *    - collector adapters enforce their exact host and explicit public-host approval boundaries.
 *    - a normalized checkpoint resumes safely, and SEC JSON uses its declared user agent.
 *    - approved redirects retain final provenance and non-UTF8 source text decodes correctly.
 *
 * 3. Failure Path:
 *    - non-HTTPS and non-allowlisted sources require safe rejection.
 *    - a non-JSON value cannot overwrite an existing valid file.
 *    - an injected rename failure preserves the destination and removes its temporary file.
 *    - close and remove cleanup failures are reported with the original operation failure.
 *    - invalid state transitions, network refresh failures, oversized/unsupported/short content fail safely.
 *    - redirects, private networks, direct adapter misuse, and tampered registry IDs fail closed.
 *    - concurrent registry discoveries do not lose same-URL candidate links or different URLs.
 *    - invalid manual metadata, blank/short text, hash mismatches, and invalid speaker offsets leave no partial state.
 *    - uncertain transcript attribution remains review_required with speaker_uncertain.
 *    - corrupt review reuse, post-rename failures, and rollback parent swaps fail without trusting or deleting unsafe paths.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { readJsonFile, writeJsonAtomic } from '../server/decisionAdvisor/jsonStore';
import { writeAdvisorArtifactAtomic } from '../server/decisionAdvisor/artifactStore';
import { advisorPaths } from '../server/decisionAdvisor/paths';
import {
  canonicalizeSourceUrl,
  classifySourceUrl,
} from '../server/decisionAdvisor/sourcePolicy';
import {
  loadRegistry,
  transitionSource,
  upsertDiscoveredSource,
} from '../server/decisionAdvisor/sourceRegistry';
import {
  MicrosoftIRCollector,
  MicrosoftSourceCollector,
} from '../server/decisionAdvisor/collectors/microsoftCollectors';
import { PublicHtmlCollector } from '../server/decisionAdvisor/collectors/publicHtmlCollector';
import { SecEdgarCollector } from '../server/decisionAdvisor/collectors/secEdgarCollector';
import {
  collectOfficialSource,
  defaultPinnedTransport,
} from '../server/decisionAdvisor/officialSourceCollector';
import { importReviewedSource } from '../server/decisionAdvisor/manualSourceImporter';
import { importTranscript } from '../server/decisionAdvisor/transcriptImporter';
import type {
  AdvisorSourceRecord,
  EventCandidate,
} from '../shared/amyHoodDecisionAdvisor';

const officialCandidate: EventCandidate = {
  id: 'candidate-fy25-q4-capex',
  workingTitle: 'FY25 Q4 AI infrastructure investment',
  domain: 'ai_cloud_capex',
  decisionWindowStart: '2025-04-01',
  decisionWindowEnd: '2025-06-30',
  discoveryUrls: ['https://www.microsoft.com/en-us/Investor/events/FY-2025'],
  notes: 'Official investor-relations discovery URL.',
  status: 'approved_for_collection',
};

const officialSource: AdvisorSourceRecord = {
  id: 'source-microsoft-fy25-q4',
  canonicalUrl: 'https://www.microsoft.com/en-us/Investor/events/FY-2025',
  eventCandidateIds: [officialCandidate.id],
  tier: 1,
  title: 'FY25 Q4 earnings materials',
  publisher: 'Microsoft',
  publishedAt: '2025-07-30',
  speaker: 'Amy Hood',
  sourceType: 'investor_relations',
  collector: 'microsoft_ir',
  temporalRole: 'decision_time',
  rightsNote: 'Public official source; preserve provenance.',
  approvedPublicHost: true,
  collectionStatus: 'collected',
  rawPath: 'raw/source-microsoft-fy25-q4.json',
  normalizedPath: null,
  sha256: 'abc123',
  capturedAt: '2026-07-14T00:00:00.000Z',
  failureReason: null,
};

const collectionRecord = (
  overrides: Partial<AdvisorSourceRecord> = {},
): AdvisorSourceRecord => ({
  ...officialSource,
  id: 'discovery-placeholder',
  canonicalUrl: 'https://www.microsoft.com/en-us/Investor/events/FY-2025',
  title: '',
  publishedAt: null,
  collectionStatus: 'discovered',
  rawPath: null,
  normalizedPath: null,
  sha256: null,
  capturedAt: null,
  failureReason: null,
  ...overrides,
});

const substantialHtml = (suffix = 'stable') => Buffer.from(`<!doctype html>
<html><head><title>FY25 Q4 earnings materials</title>
<meta property="article:published_time" content="2025-07-30T12:00:00Z"></head>
<body><nav>Navigation must not survive.</nav><main>
Amy Hood described the investment decision and the financial constraints that guide Microsoft.
The company will scale infrastructure capacity in line with customer demand, utilization signals,
and durable revenue opportunity while protecting operating leverage over the planning horizon.
This source provides enough decision context for a reviewer to compare priorities, constraints,
reversal signals, and the timing of management commitments. ${suffix}
</main><script>window.secret = true;</script></body></html>`, 'utf8');

const htmlResponse = (
  bytes: Uint8Array,
  init: { status?: number; contentType?: string; contentLength?: string } = {},
) => new Response(bytes, {
  status: init.status ?? 200,
  headers: {
    'content-type': init.contentType ?? 'text/html; charset=utf-8',
    ...(init.contentLength ? { 'content-length': init.contentLength } : {}),
  },
});

const publicDns = async () => ['93.184.216.34'];

test('happy: advisor paths remain isolated from existing B Track data', () => {
  const paths = advisorPaths('/repo');
  assert.equal(paths.root, '/repo/data/b-track/amy-hood/advisor');
  assert.equal(paths.registry, '/repo/data/b-track/amy-hood/advisor/source-registry.json');
  assert.equal(paths.raw, '/repo/data/b-track/amy-hood/advisor/raw');
  assert.equal(officialCandidate.status, 'approved_for_collection');
  assert.equal(officialSource.tier, 1);
});

test('happy: atomic JSON persistence round-trips data without a temporary file', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-json-store-'));
  const destination = path.join(directory, 'nested', 'registry.json');

  try {
    await writeJsonAtomic(destination, { sources: [officialSource.id] });

    assert.deepEqual(await readJsonFile(destination, { sources: [] }), {
      sources: [officialSource.id],
    });
    assert.deepEqual(await readdir(path.dirname(destination)), ['registry.json']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('happy: concurrent same-process writes use independent temporary files', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-json-concurrent-'));
  const destination = path.join(directory, 'registry.json');

  try {
    await Promise.all([
      writeJsonAtomic(destination, { writer: 'first' }),
      writeJsonAtomic(destination, { writer: 'second' }),
    ]);

    const stored = await readJsonFile(destination, { writer: 'missing' });
    assert.ok(stored.writer === 'first' || stored.writer === 'second');
    assert.deepEqual(await readdir(directory), ['registry.json']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('happy: exact and suffix official hosts are eligible for Tier 1 collection', () => {
  assert.deepEqual(classifySourceUrl('https://microsoft.com/interview'), {
    mode: 'automatic',
    tier: 1,
  });
  assert.deepEqual(classifySourceUrl('https://investor.microsoft.com/interview'), {
    mode: 'automatic',
    tier: 1,
  });
  assert.deepEqual(classifySourceUrl('https://data.sec.gov/submissions/example.json'), {
    mode: 'automatic',
    tier: 1,
  });
});

test('happy: official HTML collection preserves exact bytes and writes normalized review output', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-collector-happy-'));
  const bytes = substantialHtml();
  const observedHeaders: Headers[] = [];

  try {
    const collected = await collectOfficialSource(collectionRecord(), {
      root: directory,
      resolveHost: publicDns,
      now: () => new Date('2026-07-14T01:02:03.000Z'),
      transportImpl: async ({ init }) => {
        observedHeaders.push(new Headers(init?.headers));
        return htmlResponse(bytes);
      },
    });
    const registry = loadRegistry(directory);
    const rawPath = path.resolve(advisorPaths(directory).root, collected.rawPath!);
    const normalizedPath = path.resolve(
      advisorPaths(directory).root,
      collected.normalizedPath!,
    );
    const raw = JSON.parse(await readFile(rawPath, 'utf8'));
    const normalized = await readFile(normalizedPath, 'utf8');

    assert.equal(registry.sources.length, 1);
    assert.equal(collected.collectionStatus, 'review_required');
    assert.equal(collected.title, 'FY25 Q4 earnings materials');
    assert.equal(collected.publishedAt, '2025-07-30');
    assert.equal(raw.bodyBase64, bytes.toString('base64'));
    assert.equal(Buffer.from(raw.bodyBase64, 'base64').equals(bytes), true);
    assert.equal('rawPath' in raw.metadata, false);
    assert.equal('normalizedPath' in raw.metadata, false);
    assert.equal('failureReason' in raw.metadata, false);
    assert.match(collected.sha256!, /^[a-f0-9]{64}$/);
    assert.match(normalized, /Amy Hood described the investment decision/);
    assert.doesNotMatch(normalized, /Navigation must not survive|window\.secret/);
    assert.match(observedHeaders[0].get('user-agent') ?? '', /Fins Persona/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('happy: a source-specific adapter collects through the shared public interface', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-adapter-interface-'));

  try {
    const discovered = await upsertDiscoveredSource(collectionRecord(), directory);
    const collected = await MicrosoftIRCollector.collect(discovered, {
      root: directory,
      resolveHost: publicDns,
      transportImpl: async () => htmlResponse(substantialHtml()),
    });
    assert.equal(collected.collectionStatus, 'review_required');
    assert.equal(loadRegistry(directory).sources[0].id, discovered.id);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('edge: SEC JSON collection accepts the endpoint media type and sends contact identity', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-sec-json-'));
  let userAgent = '';
  const json = Buffer.from(JSON.stringify({
    filing: 'Microsoft annual filing context '.repeat(12),
  }));

  try {
    const record = collectionRecord({
      canonicalUrl: 'https://data.sec.gov/submissions/CIK0000789019.json',
      collector: 'sec_edgar',
      sourceType: 'sec_filing',
    });
    const discovered = await upsertDiscoveredSource(record, directory);
    const collected = await SecEdgarCollector.collect(discovered, {
      root: directory,
      resolveHost: publicDns,
      transportImpl: async ({ init }) => {
        userAgent = new Headers(init?.headers).get('user-agent') ?? '';
        return htmlResponse(json, { contentType: 'application/json' });
      },
    });

    assert.equal(collected.collectionStatus, 'review_required');
    assert.match(userAgent, /contact:/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('edge: a bounded same-policy redirect persists the final URL as raw provenance', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-safe-redirect-'));
  const requested: string[] = [];

  try {
    const collected = await collectOfficialSource(collectionRecord({
      canonicalUrl: 'https://www.microsoft.com/Investor/redirect-start',
    }), {
      root: directory,
      resolveHost: publicDns,
      transportImpl: async ({ url: requestedUrl }) => {
        const url = requestedUrl.toString();
        requested.push(url);
        if (requested.length === 1) {
          return new Response(null, {
            status: 302,
            headers: { location: 'https://investor.microsoft.com/Investor/final' },
          });
        }
        return htmlResponse(substantialHtml());
      },
    });
    const raw = JSON.parse(await readFile(
      path.resolve(advisorPaths(directory).root, collected.rawPath!),
      'utf8',
    ));

    assert.deepEqual(requested, [
      'https://www.microsoft.com/Investor/redirect-start',
      'https://investor.microsoft.com/Investor/final',
    ]);
    assert.equal(raw.canonicalUrl, 'https://investor.microsoft.com/Investor/final');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('edge: windows-1252 HTML normalizes punctuation without changing raw bytes', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-windows-1252-'));
  const utf8 = substantialHtml('Microsoft’s financial discipline remains central.');
  const bytes = Buffer.from(utf8.toString('utf8').replace('’', '\u0092'), 'latin1');

  try {
    const collected = await collectOfficialSource(collectionRecord(), {
      root: directory,
      resolveHost: publicDns,
      transportImpl: async () => htmlResponse(bytes, {
        contentType: 'text/html; charset=windows-1252',
      }),
    });
    const normalized = await readFile(
      path.resolve(advisorPaths(directory).root, collected.normalizedPath!),
      'utf8',
    );
    const raw = JSON.parse(await readFile(
      path.resolve(advisorPaths(directory).root, collected.rawPath!),
      'utf8',
    ));

    assert.match(normalized, /Microsoft’s financial discipline/);
    assert.equal(Buffer.from(raw.bodyBase64, 'base64').equals(bytes), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('edge: canonical-equivalent discoveries merge candidate IDs and collect idempotently', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-collector-duplicate-'));
  const bytes = substantialHtml();

  try {
    const first = await collectOfficialSource(collectionRecord({
      canonicalUrl: 'https://www.microsoft.com/Investor/a?id=7&utm_source=first#quote',
      eventCandidateIds: ['candidate-a'],
    }), { root: directory, resolveHost: publicDns, transportImpl: async () => htmlResponse(bytes) });
    const duplicate = await collectOfficialSource(collectionRecord({
      canonicalUrl: 'https://www.microsoft.com/Investor/a?utm_campaign=repeat&id=7',
      eventCandidateIds: ['candidate-b', 'candidate-a'],
    }), { root: directory, resolveHost: publicDns, transportImpl: async () => htmlResponse(bytes) });
    const registry = loadRegistry(directory);

    assert.equal(registry.sources.length, 1);
    assert.equal(first.id, duplicate.id);
    assert.deepEqual(registry.sources[0].eventCandidateIds, ['candidate-a', 'candidate-b']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('edge: a changed successful refresh creates an immutable content version', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-collector-version-'));

  try {
    const first = await collectOfficialSource(collectionRecord(), {
      root: directory,
      resolveHost: publicDns,
      transportImpl: async () => htmlResponse(substantialHtml('first version')),
    });
    const firstRaw = await readFile(
      path.resolve(advisorPaths(directory).root, first.rawPath!),
      'utf8',
    );
    const refreshed = await collectOfficialSource(first, {
      root: directory,
      resolveHost: publicDns,
      transportImpl: async () => htmlResponse(substantialHtml('changed version')),
    });
    const registry = loadRegistry(directory);

    assert.equal(registry.sources.length, 2);
    assert.notEqual(refreshed.id, first.id);
    assert.notEqual(refreshed.sha256, first.sha256);
    assert.equal(
      await readFile(path.resolve(advisorPaths(directory).root, first.rawPath!), 'utf8'),
      firstRaw,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('edge: collection resumes a realistic normalized checkpoint', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-normalized-resume-'));
  const bytes = substantialHtml();

  try {
    const complete = await collectOfficialSource(collectionRecord(), {
      root: directory,
      resolveHost: publicDns,
      transportImpl: async () => htmlResponse(bytes),
    });
    await writeJsonAtomic(advisorPaths(directory).registry, {
      sources: [{ ...complete, collectionStatus: 'normalized' }],
    });

    const resumed = await collectOfficialSource({
      ...complete,
      collectionStatus: 'normalized',
    }, {
      root: directory,
      resolveHost: publicDns,
      transportImpl: async () => htmlResponse(bytes),
    });
    assert.equal(resumed.collectionStatus, 'review_required');
    assert.equal(loadRegistry(directory).sources.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('edge: collector adapters enforce source-specific host boundaries', () => {
  assert.equal(MicrosoftIRCollector.supports(collectionRecord()), true);
  assert.equal(MicrosoftSourceCollector.supports(collectionRecord()), false);
  assert.equal(MicrosoftSourceCollector.supports(collectionRecord({
    canonicalUrl: 'https://news.microsoft.com/amy-hood-interview',
    collector: 'microsoft_source',
  })), true);
  assert.equal(SecEdgarCollector.supports(collectionRecord({
    canonicalUrl: 'https://www.sec.gov/Archives/example.htm',
    collector: 'sec_edgar',
  })), true);
  assert.equal(PublicHtmlCollector.supports(collectionRecord({
    canonicalUrl: 'https://reports.example.com/interview',
    collector: 'public_html',
    approvedPublicHost: false,
  })), false);
});

test('edge: concurrent registry discoveries preserve same and different URL updates', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-registry-concurrent-'));

  try {
    await Promise.all(Array.from({ length: 12 }, (_, index) =>
      upsertDiscoveredSource(collectionRecord({
        eventCandidateIds: [`same-${index}`],
      }), directory)));
    await Promise.all(Array.from({ length: 12 }, (_, index) =>
      upsertDiscoveredSource(collectionRecord({
        canonicalUrl: `https://www.microsoft.com/Investor/source-${index}`,
        eventCandidateIds: [`different-${index}`],
      }), directory)));

    const registry = loadRegistry(directory);
    const shared = registry.sources.find(({ canonicalUrl }) =>
      canonicalUrl.endsWith('/en-us/Investor/events/FY-2025'))!;
    assert.equal(registry.sources.length, 13);
    assert.deepEqual(shared.eventCandidateIds, Array.from(
      { length: 12 },
      (_, index) => `same-${index}`,
    ));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('edge: concurrent same-URL collections serialize without corrupting state', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-collection-concurrent-'));

  try {
    const results = await Promise.all([
      collectOfficialSource(collectionRecord({ eventCandidateIds: ['candidate-a'] }), {
        root: directory,
        resolveHost: publicDns,
        transportImpl: async () => htmlResponse(substantialHtml()),
      }),
      collectOfficialSource(collectionRecord({ eventCandidateIds: ['candidate-b'] }), {
        root: directory,
        resolveHost: publicDns,
        transportImpl: async () => htmlResponse(substantialHtml()),
      }),
    ]);
    const registry = loadRegistry(directory);
    assert.equal(registry.sources.length, 1);
    assert.deepEqual(registry.sources[0].eventCandidateIds, ['candidate-a', 'candidate-b']);
    assert.equal(registry.sources[0].collectionStatus, 'review_required');
    assert.equal(results[0].id, results[1].id);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('edge: pinned transport consumes the validated address without a second DNS lookup', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-pinned-transport-'));
  let resolutions = 0;
  let pinnedAddresses: string[] = [];

  try {
    await collectOfficialSource(collectionRecord(), {
      root: directory,
      resolveHost: async () => {
        resolutions += 1;
        return resolutions === 1 ? ['93.184.216.34'] : ['127.0.0.1'];
      },
      transportImpl: async ({ validatedAddresses }) => {
        pinnedAddresses = validatedAddresses;
        return htmlResponse(substantialHtml());
      },
    });
    assert.equal(resolutions, 1);
    assert.deepEqual(pinnedAddresses, ['93.184.216.34']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('edge: default pinned HTTPS seam preserves address, SNI, Host, and abort', async () => {
  let options: Record<string, unknown> = {};
  let errorListener: ((error: Error) => void) | undefined;
  let destroyed = false;
  const lowLevelRequest = ((_url: URL, requestOptions: Record<string, unknown>) => {
    options = requestOptions;
    return {
      once: (event: string, listener: (error: Error) => void) => {
        if (event === 'error') errorListener = listener;
      },
      on: () => undefined,
      end: () => undefined,
      destroy: (error: Error) => {
        destroyed = true;
        errorListener?.(error);
      },
    };
  }) as never;
  const controller = new AbortController();
  const pending = defaultPinnedTransport({
    url: new URL('https://www.microsoft.com/Investor/test'),
    validatedAddresses: ['93.184.216.34'],
    init: { signal: controller.signal },
    timeouts: { connectMs: 100, headersMs: 100, bodyMs: 100 },
  }, lowLevelRequest);
  let lookupAddress = '';
  (options.lookup as Function)('www.microsoft.com', {}, (
    _error: Error | null,
    address: string,
  ) => { lookupAddress = address; });
  controller.abort();

  await assert.rejects(() => pending, /aborted/i);
  assert.equal(lookupAddress, '93.184.216.34');
  assert.equal(options.servername, 'www.microsoft.com');
  assert.equal((options.headers as Record<string, string>).Host, 'www.microsoft.com');
  assert.equal(destroyed, true);
});

test('edge: a waiting collector reloads a stale collected snapshot after the family lock', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-stale-snapshot-'));
  const bytes = substantialHtml();
  let releaseFirst = () => undefined;
  const firstStarted = new Promise<void>((resolveStarted) => {
    releaseFirst = resolveStarted;
  });
  let signalFirstStarted = () => undefined;
  const firstEnteredTransport = new Promise<void>((resolve) => {
    signalFirstStarted = resolve;
  });

  try {
    const complete = await collectOfficialSource(collectionRecord(), {
      root: directory,
      resolveHost: publicDns,
      transportImpl: async () => htmlResponse(bytes),
    });
    const first = MicrosoftIRCollector.collect(complete, {
      root: directory,
      resolveHost: publicDns,
      transportImpl: async () => {
        signalFirstStarted();
        await firstStarted;
        return htmlResponse(bytes);
      },
    });
    await firstEnteredTransport;
    const waiting = MicrosoftIRCollector.collect({
      ...complete,
      collectionStatus: 'collected',
    }, {
      root: directory,
      resolveHost: publicDns,
      transportImpl: async () => htmlResponse(bytes),
    });
    releaseFirst();

    const [, reloaded] = await Promise.all([first, waiting]);
    assert.equal(reloaded.collectionStatus, 'review_required');
    assert.equal(loadRegistry(directory).sources[0].collectionStatus, 'review_required');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('edge: original and content-version refreshes share one canonical family lock', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-family-lock-'));
  let inFlight = 0;
  let maximumInFlight = 0;
  const transport = (bytes: Buffer) => async () => {
    inFlight += 1;
    maximumInFlight = Math.max(maximumInFlight, inFlight);
    await new Promise<void>((resolve) => setImmediate(resolve));
    inFlight -= 1;
    return htmlResponse(bytes);
  };

  try {
    const originalBytes = substantialHtml('original family body');
    const versionBytes = substantialHtml('version family body');
    const original = await collectOfficialSource(collectionRecord(), {
      root: directory,
      resolveHost: publicDns,
      transportImpl: transport(originalBytes),
    });
    const version = await collectOfficialSource(original, {
      root: directory,
      resolveHost: publicDns,
      transportImpl: transport(versionBytes),
    });
    maximumInFlight = 0;

    await Promise.all([
      MicrosoftIRCollector.collect(original, {
        root: directory,
        resolveHost: publicDns,
        transportImpl: transport(originalBytes),
      }),
      MicrosoftIRCollector.collect(version, {
        root: directory,
        resolveHost: publicDns,
        transportImpl: transport(versionBytes),
      }),
    ]);
    assert.equal(maximumInFlight, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('edge: LinkedIn remains discovery-only', () => {
  assert.deepEqual(classifySourceUrl('https://www.linkedin.com/posts/example'), {
    mode: 'discovery_only',
    tier: 'discovery_only',
  });
});

test('edge: canonical-equivalent discoveries resolve to one URL identity', () => {
  const first = canonicalizeSourceUrl(
    'https://www.microsoft.com/a?id=7&utm_source=discovery#quote',
  );
  const duplicate = canonicalizeSourceUrl(
    'https://www.microsoft.com/a?utm_campaign=repeat&id=7',
  );

  assert.equal(first, duplicate);
});

test('edge: canonicalization removes fragments and tracking parameters', () => {
  assert.equal(
    canonicalizeSourceUrl(
      'https://www.microsoft.com/a?z=last&utm_source=x&id=7&fbclid=f&gclid=g#quote',
    ),
    'https://www.microsoft.com/a?id=7&z=last',
  );
});

test('failure: automatic collection rejects unsafe source URLs', () => {
  assert.throws(
    () => classifySourceUrl('http://www.microsoft.com/interview'),
    /HTTPS/,
  );
  assert.throws(
    () => classifySourceUrl('https://microsoft.com.example.com/interview'),
    /manual review/,
  );
  assert.throws(
    () => classifySourceUrl('https://example.com/interview', []),
    /manual review/,
  );
  assert.throws(
    () => classifySourceUrl('https://sub.reports.example.com/interview', [
      'reports.example.com',
    ]),
    /manual review/,
  );
  assert.deepEqual(classifySourceUrl('https://reports.example.com/interview', [
    'reports.example.com',
  ]), {
    mode: 'automatic',
    tier: 3,
  });
});

test('failure: registry rejects transitions outside the declared state machine', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-registry-transition-'));

  try {
    const discovered = await upsertDiscoveredSource(collectionRecord(), directory);
    await assert.rejects(
      () => transitionSource(directory, discovered.id, 'approved'),
      /invalid source transition.*discovered.*approved/i,
    );
    await assert.rejects(
      () => transitionSource(directory, discovered.id, 'discovered'),
      /invalid source transition.*discovered.*discovered/i,
    );
    assert.equal(loadRegistry(directory).sources[0].collectionStatus, 'discovered');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: refresh failure preserves the last valid artifact', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-collector-refresh-'));

  try {
    const valid = await collectOfficialSource(collectionRecord(), {
      root: directory,
      resolveHost: publicDns,
      transportImpl: async () => htmlResponse(substantialHtml()),
    });
    const validRawPath = path.resolve(advisorPaths(directory).root, valid.rawPath!);
    const before = await readFile(validRawPath, 'utf8');

    await assert.rejects(() => collectOfficialSource(valid, {
      transportImpl: async () => { throw new Error('network unavailable'); },
      root: directory,
      resolveHost: publicDns,
    }), /network unavailable/);
    assert.equal(await readFile(validRawPath, 'utf8'), before);
    const failed = loadRegistry(directory).sources.find(({ id }) => id === valid.id)!;
    assert.equal(failed.collectionStatus, 'failed');
    assert.equal(failed.rawPath, valid.rawPath);
    assert.equal(failed.normalizedPath, valid.normalizedPath);
    assert.equal(failed.sha256, valid.sha256);
    assert.equal(failed.failureReason, 'network_error');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: an invalid changed body is isolated as a failed immutable version', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-invalid-version-'));

  try {
    const valid = await collectOfficialSource(collectionRecord(), {
      root: directory,
      resolveHost: publicDns,
      transportImpl: async () => htmlResponse(substantialHtml()),
    });
    await assert.rejects(() => collectOfficialSource(valid, {
      root: directory,
      resolveHost: publicDns,
      transportImpl: async () => htmlResponse(Buffer.from('<html><main>changed but short</main></html>')),
    }), /200 characters/i);

    const registry = loadRegistry(directory);
    const preserved = registry.sources.find(({ id }) => id === valid.id)!;
    const failedVersion = registry.sources.find(({ id }) => id !== valid.id)!;
    assert.equal(preserved.collectionStatus, 'review_required');
    assert.equal(preserved.sha256, valid.sha256);
    assert.equal(failedVersion.collectionStatus, 'failed');
    assert.ok(failedVersion.rawPath);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: public HTML collection requires explicit host approval', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-public-approval-'));

  try {
    await assert.rejects(() => collectOfficialSource(collectionRecord({
      canonicalUrl: 'https://reports.example.com/interview',
      collector: 'public_html',
      tier: 3,
      approvedPublicHost: false,
    }), {
      root: directory,
      resolveHost: publicDns,
      transportImpl: async () => htmlResponse(substantialHtml()),
    }), /approved public host/i);
    assert.equal(loadRegistry(directory).sources[0].collectionStatus, 'failed');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: every adapter direct call enforces its supports boundary', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-adapter-boundary-'));
  let fetched = false;
  const dependencies = {
    root: directory,
    resolveHost: publicDns,
    transportImpl: async () => {
      fetched = true;
      return htmlResponse(substantialHtml());
    },
  };

  try {
    const cases = [
      [MicrosoftIRCollector, collectionRecord({ canonicalUrl: 'https://example.com/Investor/x' })],
      [MicrosoftSourceCollector, collectionRecord({ collector: 'microsoft_source', canonicalUrl: 'https://example.com/x' })],
      [SecEdgarCollector, collectionRecord({ collector: 'sec_edgar', canonicalUrl: 'https://example.com/x' })],
      [PublicHtmlCollector, collectionRecord({ collector: 'public_html', canonicalUrl: 'https://reports.example.com/x', approvedPublicHost: false })],
    ] as const;
    for (const [collector, record] of cases) {
      await assert.rejects(() => collector.collect(record, dependencies), /does not support|approved public host/i);
    }
    assert.equal(fetched, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: redirects and DNS resolution reject boundary changes and private networks', async (t) => {
  await t.test('cross-policy redirect', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-cross-redirect-'));
    try {
      await assert.rejects(() => collectOfficialSource(collectionRecord(), {
        root: directory,
        resolveHost: publicDns,
        transportImpl: async () => new Response(null, {
          status: 302,
          headers: { location: 'https://example.com/stolen' },
        }),
      }), /redirect.*collector policy/i);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  await t.test('literal loopback redirect', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-loopback-redirect-'));
    try {
      await assert.rejects(() => collectOfficialSource(collectionRecord(), {
        root: directory,
        resolveHost: publicDns,
        transportImpl: async () => new Response(null, {
          status: 302,
          headers: { location: 'https://127.0.0.1/private' },
        }),
      }), /private|loopback|link-local/i);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  await t.test('IPv4-mapped IPv6 loopback redirect', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-mapped-loopback-'));
    try {
      await assert.rejects(() => collectOfficialSource(collectionRecord(), {
        root: directory,
        resolveHost: publicDns,
        transportImpl: async () => new Response(null, {
          status: 302,
          headers: { location: 'https://[::ffff:7f00:1]/private' },
        }),
      }), /private|loopback|link-local/i);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  await t.test('private DNS answer before fetch', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-private-dns-'));
    let fetched = false;
    try {
      await assert.rejects(() => collectOfficialSource(collectionRecord(), {
        root: directory,
        resolveHost: async () => ['10.0.0.7'],
        transportImpl: async () => {
          fetched = true;
          return htmlResponse(substantialHtml());
        },
      }), /private|loopback|link-local/i);
      assert.equal(fetched, false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

test('failure: a tampered registry source ID cannot escape the advisor root', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-tampered-id-'));
  const outside = path.resolve(directory, 'outside.json');
  const tampered = collectionRecord({
    id: '../../../../outside',
    canonicalUrl: canonicalizeSourceUrl(collectionRecord().canonicalUrl),
  });

  try {
    await writeJsonAtomic(advisorPaths(directory).registry, { sources: [tampered] });
    assert.throws(() => loadRegistry(directory), /source ID|canonical hash/i);
    await assert.rejects(() => collectOfficialSource(tampered, {
      root: directory,
      resolveHost: publicDns,
      transportImpl: async () => htmlResponse(substantialHtml()),
    }), /source ID|canonical hash/i);
    await assert.rejects(() => readFile(outside), { code: 'ENOENT' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: every loaded registry record validates all persisted contract fields', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-invalid-record-'));
  const canonicalUrl = canonicalizeSourceUrl(collectionRecord().canonicalUrl);
  const valid = await upsertDiscoveredSource(collectionRecord(), directory);

  try {
    await writeJsonAtomic(advisorPaths(directory).registry, {
      sources: [{
        ...valid,
        tier: 9,
        sourceType: 42,
        sha256: 'not-a-sha256',
      }],
    });
    assert.equal(valid.canonicalUrl, canonicalUrl);
    assert.throws(() => loadRegistry(directory), /invalid persisted fields/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: a symlinked artifact directory cannot write outside the advisor root', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-symlink-root-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'advisor-symlink-outside-'));
  const rawDirectory = advisorPaths(directory).raw;

  try {
    await mkdir(path.dirname(rawDirectory), { recursive: true });
    await symlink(outside, rawDirectory, 'dir');
    await assert.rejects(() => collectOfficialSource(collectionRecord(), {
      root: directory,
      resolveHost: publicDns,
      transportImpl: async () => htmlResponse(substantialHtml()),
    }), /symlink|advisor root/i);
    assert.deepEqual(await readdir(outside), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('failure: parent swaps around open and rename abort without an outside final artifact', async (t) => {
  for (const hookName of ['beforeTemporaryOpen', 'beforeRename'] as const) {
    await t.test(hookName, async () => {
      const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-parent-swap-'));
      const outside = await mkdtemp(path.join(os.tmpdir(), 'advisor-parent-swap-outside-'));
      const rawDirectory = advisorPaths(directory).raw;
      const movedDirectory = path.join(outside, 'moved-raw');
      let swapped = false;

      try {
        await assert.rejects(() => collectOfficialSource(collectionRecord(), {
          root: directory,
          resolveHost: publicDns,
          transportImpl: async () => htmlResponse(substantialHtml()),
          artifactHooks: {
            [hookName]: async () => {
              if (swapped) return;
              swapped = true;
              await rename(rawDirectory, movedDirectory);
              await symlink(outside, rawDirectory, 'dir');
            },
          },
        }), /parent.*changed|symlink|inode/i);
        const outsideFiles = await readdir(outside);
        assert.equal(outsideFiles.includes('moved-raw'), true);
        assert.deepEqual(await readdir(movedDirectory), []);
        assert.equal(outsideFiles.some((name) => name.endsWith('.json')), false);
      } finally {
        await rm(directory, { recursive: true, force: true });
        await rm(outside, { recursive: true, force: true });
      }
    });
  }
});

test('failure: staging preparation failure closes the anchored parent handle', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-staging-failure-'));
  const stagingPath = path.join(advisorPaths(directory).root, '.artifact-staging');
  let parentHandle: { stat(): Promise<unknown> } | undefined;

  try {
    await mkdir(advisorPaths(directory).root, { recursive: true });
    await writeFile(stagingPath, 'blocks staging directory creation', 'utf8');
    await assert.rejects(() => collectOfficialSource(collectionRecord(), {
      root: directory,
      resolveHost: publicDns,
      transportImpl: async () => htmlResponse(substantialHtml()),
      artifactHooks: {
        afterParentOpen: (handle) => { parentHandle = handle; },
      },
    }), /not a directory|artifact parent/i);
    assert.ok(parentHandle);
    await assert.rejects(() => parentHandle!.stat(), { code: 'EBADF' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: same-SHA refresh rebuilds missing, truncated, and wrong-body raw artifacts', async (t) => {
  for (const corruption of ['missing', 'truncated', 'wrong-body'] as const) {
    await t.test(corruption, async () => {
      const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-raw-repair-'));
      const bytes = substantialHtml();
      try {
        const complete = await collectOfficialSource(collectionRecord(), {
          root: directory,
          resolveHost: publicDns,
          transportImpl: async () => htmlResponse(bytes),
        });
        const rawPath = path.resolve(advisorPaths(directory).root, complete.rawPath!);
        if (corruption === 'missing') await rm(rawPath);
        if (corruption === 'truncated') await writeFile(rawPath, '{', 'utf8');
        if (corruption === 'wrong-body') {
          const raw = JSON.parse(await readFile(rawPath, 'utf8'));
          raw.bodyBase64 = Buffer.from('wrong body').toString('base64');
          await writeFile(rawPath, `${JSON.stringify(raw)}\n`, 'utf8');
        }

        const repaired = await collectOfficialSource(complete, {
          root: directory,
          resolveHost: publicDns,
          transportImpl: async () => htmlResponse(bytes),
        });
        const raw = JSON.parse(await readFile(rawPath, 'utf8'));
        assert.equal(Buffer.from(raw.bodyBase64, 'base64').equals(bytes), true);
        assert.equal(repaired.collectionStatus, 'review_required');
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
});

test('failure: stalled and rejected bodies are cancelled and release the family lock', async (t) => {
  await t.test('stalled body', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-stalled-body-'));
    let cancelled = false;
    try {
      await assert.rejects(() => collectOfficialSource(collectionRecord(), {
        root: directory,
        resolveHost: publicDns,
        timeouts: { connectMs: 20, headersMs: 20, bodyMs: 20 },
        transportImpl: async () => new Response(new ReadableStream({
          cancel: () => { cancelled = true; },
        }), { headers: { 'content-type': 'text/html' } }),
      }), /body.*timeout/i);
      const recovered = await collectOfficialSource(collectionRecord(), {
        root: directory,
        resolveHost: publicDns,
        transportImpl: async () => htmlResponse(substantialHtml()),
      });
      assert.equal(cancelled, true);
      assert.equal(recovered.collectionStatus, 'review_required');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  await t.test('redirect and error bodies', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-cancel-bodies-'));
    let cancelledBodies = 0;
    let call = 0;
    const body = () => new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array([1])); },
      cancel() { cancelledBodies += 1; },
    });
    try {
      await assert.rejects(() => collectOfficialSource(collectionRecord(), {
        root: directory,
        resolveHost: publicDns,
        transportImpl: async () => {
          call += 1;
          if (call === 1) return new Response(body(), {
            status: 302,
            headers: { location: collectionRecord().canonicalUrl },
          });
          return new Response(body(), {
            status: 503,
            headers: { 'content-type': 'text/html' },
          });
        },
      }), /503/);
      const recovered = await collectOfficialSource(collectionRecord(), {
        root: directory,
        resolveHost: publicDns,
        transportImpl: async () => htmlResponse(substantialHtml()),
      });
      assert.equal(cancelledBodies, 2);
      assert.equal(recovered.collectionStatus, 'review_required');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

test('failure: mismatched normalized evidence is rebuilt instead of silently reused', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-normalized-mismatch-'));
  const bytes = substantialHtml();

  try {
    const complete = await collectOfficialSource(collectionRecord(), {
      root: directory,
      resolveHost: publicDns,
      transportImpl: async () => htmlResponse(bytes),
    });
    const normalizedPath = path.resolve(
      advisorPaths(directory).root,
      complete.normalizedPath!,
    );
    await writeFile(normalizedPath, 'tampered normalized evidence\n', 'utf8');

    await collectOfficialSource(complete, {
      root: directory,
      resolveHost: publicDns,
      transportImpl: async () => htmlResponse(bytes),
    });
    const rebuilt = await readFile(normalizedPath, 'utf8');
    assert.match(rebuilt, /Amy Hood described the investment decision/);
    assert.doesNotMatch(rebuilt, /tampered normalized evidence/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: normalized registry state requires coherent raw, hash, and normalized paths', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-state-invariant-'));
  const discovered = await upsertDiscoveredSource(collectionRecord(), directory);

  try {
    await writeJsonAtomic(advisorPaths(directory).registry, {
      sources: [{
        ...discovered,
        collectionStatus: 'normalized',
        normalizedPath: 'normalized/missing.txt',
      }],
    });
    assert.throws(() => loadRegistry(directory), /state|artifact|raw|sha/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: invalid HTTP content is rejected without a collected artifact', async (t) => {
  const cases = [
    { name: 'non-success response', response: htmlResponse(substantialHtml(), { status: 503 }), error: /503/ },
    { name: 'unsupported type', response: htmlResponse(substantialHtml(), { contentType: 'application/pdf' }), error: /content type/i },
    { name: 'declared oversized body', response: htmlResponse(substantialHtml(), { contentLength: String(5 * 1024 * 1024 + 1) }), error: /5 MB/i },
    { name: 'actual oversized body', response: htmlResponse(Buffer.alloc(5 * 1024 * 1024 + 1, 65)), error: /5 MB/i },
    { name: 'short normalized text', response: htmlResponse(Buffer.from('<html><main>Too short.</main></html>')), error: /200 characters/i },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-invalid-content-'));
      try {
        await assert.rejects(() => collectOfficialSource(collectionRecord(), {
          root: directory,
          resolveHost: publicDns,
          transportImpl: async () => testCase.response,
        }), testCase.error);
        const failed = loadRegistry(directory).sources[0];
        assert.equal(failed.collectionStatus, 'failed');
        assert.equal(failed.failureReason, 'invalid_content');
        if (testCase.name === 'short normalized text') {
          assert.ok(failed.rawPath, 'exact raw bytes remain available for review');
        } else {
          assert.equal(failed.rawPath, null);
        }
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
});

test('failure: injected rename failure preserves existing JSON and removes its temp file', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-json-failure-'));
  const destination = path.join(directory, 'registry.json');
  const original = '{"sources":["preserved"]}\n';
  const renameError = new Error('injected rename failure');

  try {
    await writeFile(destination, original, 'utf8');

    await assert.rejects(
      () => writeJsonAtomic(destination, { replacement: true }, {
        rename: async () => {
          throw renameError;
        },
      }),
      (error) => error === renameError,
    );

    assert.equal(await readFile(destination, 'utf8'), original);
    assert.deepEqual(await readdir(directory), ['registry.json']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: cleanup errors are reported with the original operation failure', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-json-cleanup-'));
  const writeError = new Error('injected write failure');
  const closeError = new Error('injected close failure');
  const removeError = new Error('injected remove failure');

  try {
    await assert.rejects(
      () => writeJsonAtomic(path.join(directory, 'registry.json'), { replacement: true }, {
        openTemporaryFile: async () => ({
          writeFile: async () => {
            throw writeError;
          },
          sync: async () => undefined,
          close: async () => {
            throw closeError;
          },
        }),
        remove: async () => {
          throw removeError;
        },
      }),
      (error) => {
        assert.ok(error instanceof AggregateError);
        assert.deepEqual(error.errors, [writeError, closeError, removeError]);
        return true;
      },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: a non-JSON value cannot overwrite existing valid JSON', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-json-invalid-'));
  const destination = path.join(directory, 'registry.json');
  const original = '{"sources":["preserved"]}\n';

  try {
    await writeFile(destination, original, 'utf8');

    await assert.rejects(
      () => writeJsonAtomic(destination, undefined),
      /JSON-serializable/,
    );

    assert.equal(await readFile(destination, 'utf8'), original);
    assert.deepEqual(await readdir(directory), ['registry.json']);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

const reviewedTranscriptText = [
  'Interviewer: How do you decide when infrastructure investment should accelerate?',
  'Amy Hood: We start with durable customer demand and utilization, then compare capacity timing with the revenue opportunity. We preserve the ability to adjust the pace when those signals change.',
  'Interviewer: What protects the downside?',
  'Amy Hood: Operating leverage and disciplined sequencing matter. We fund the highest-confidence capacity first and revisit commitments as demand, supply, and execution evidence develops.',
].join('\n');

const sha256Text = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

const transcriptImport = (overrides: Record<string, unknown> = {}) => {
  const firstStart = reviewedTranscriptText.indexOf('Amy Hood:');
  const firstEnd = reviewedTranscriptText.indexOf('\nInterviewer:', firstStart);
  const secondStart = reviewedTranscriptText.indexOf('Amy Hood:', firstEnd);
  return {
    canonicalUrl: 'https://example.com/public/amy-hood-interview',
    title: 'Public Amy Hood infrastructure interview',
    publisher: 'Example Business Review',
    publishedAt: '2025-03-10',
    speaker: 'Amy Hood',
    eventCandidateIds: ['candidate-fy25-q4-capex'],
    tier: 3 as const,
    rightsNote: 'Lawfully accessed public transcript; imported for review.',
    text: reviewedTranscriptText,
    speakerSegments: [
      { speaker: 'Amy Hood', startChar: firstStart, endChar: firstEnd },
      { speaker: 'Amy Hood', startChar: secondStart, endChar: reviewedTranscriptText.length },
    ],
    expectedSha256: sha256Text(reviewedTranscriptText),
    reviewer: 'Evidence Reviewer',
    reviewedAt: '2026-07-14T04:00:00.000Z',
    ...overrides,
  };
};

test('happy: reviewed transcript import preserves exact text and addressable Amy Hood segments', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-transcript-import-'));
  const originalFetch = globalThis.fetch;
  let fetched = false;
  globalThis.fetch = async () => {
    fetched = true;
    throw new Error('manual import must not fetch');
  };

  try {
    const imported = await importTranscript(transcriptImport(), directory);
    const raw = JSON.parse(await readFile(
      path.resolve(advisorPaths(directory).root, imported.rawPath!),
      'utf8',
    ));
    const normalized = await readFile(
      path.resolve(advisorPaths(directory).root, imported.normalizedPath!),
      'utf8',
    );

    assert.equal(fetched, false);
    assert.equal(imported.collectionStatus, 'review_required');
    assert.equal(imported.failureReason, null);
    assert.equal(imported.collector, 'transcript_import');
    assert.equal(raw.reviewer, 'Evidence Reviewer');
    assert.equal(raw.reviewedAt, '2026-07-14T04:00:00.000Z');
    assert.equal('rawPath' in raw.metadata, false);
    assert.equal('normalizedPath' in raw.metadata, false);
    assert.equal('failureReason' in raw.metadata, false);
    assert.equal(Buffer.from(raw.bodyBase64, 'base64').toString('utf8'), reviewedTranscriptText);
    assert.equal(normalized, reviewedTranscriptText);
    for (const segment of raw.speakerSegments) {
      assert.match(reviewedTranscriptText.slice(segment.startChar, segment.endChar), /^Amy Hood:/);
    }
  } finally {
    globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  }
});

test('edge: reviewed manual import accepts a source without an optional speaker', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-manual-import-'));

  try {
    const input = transcriptImport({
      canonicalUrl: 'https://example.com/public/unsupported-document',
      speaker: null,
      speakerSegments: undefined,
    });
    const imported = await importReviewedSource(input, directory);
    assert.equal(imported.speaker, null);
    assert.equal(imported.collector, 'manual_import');
    assert.equal(imported.collectionStatus, 'review_required');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: invalid reviewed source inputs leave no registry or raw partial write', async (t) => {
  const cases = [
    { name: 'missing reviewer', overrides: { reviewer: '' }, error: /reviewer/i },
    { name: 'blank text', overrides: { text: '', expectedSha256: sha256Text('') }, error: /200 normalized characters/i },
    { name: 'hash mismatch', overrides: { expectedSha256: '0'.repeat(64) }, error: /SHA-256 mismatch/i },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-invalid-import-'));
      try {
        await assert.rejects(
          () => importReviewedSource(transcriptImport(testCase.overrides), directory),
          testCase.error,
        );
        assert.deepEqual(loadRegistry(directory), { sources: [] });
        await assert.rejects(() => readdir(advisorPaths(directory).raw), /ENOENT/);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
});

test('failure: transcript offsets must be bounded and nonoverlapping before any write', async (t) => {
  const first = transcriptImport().speakerSegments[0];
  const cases = [
    {
      name: 'out-of-bounds offset',
      speakerSegments: [{ ...first, endChar: reviewedTranscriptText.length + 1 }],
      error: /speaker segment offsets/i,
    },
    {
      name: 'overlapping offsets',
      speakerSegments: [first, { ...first, startChar: first.startChar + 1 }],
      error: /overlap/i,
    },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-invalid-segments-'));
      try {
        await assert.rejects(
          () => importTranscript(transcriptImport({ speakerSegments: testCase.speakerSegments }), directory),
          testCase.error,
        );
        assert.deepEqual(loadRegistry(directory), { sources: [] });
        await assert.rejects(() => readdir(advisorPaths(directory).raw), /ENOENT/);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
});

test('failure: uncertain transcript attribution stays review_required with speaker_uncertain', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-uncertain-transcript-'));

  try {
    const uncertain = await importTranscript(transcriptImport({
      speaker: null,
      speakerSegments: [{
        speaker: 'Unverified speaker',
        startChar: 0,
        endChar: reviewedTranscriptText.length,
      }],
    }), directory);
    assert.equal(uncertain.collectionStatus, 'review_required');
    assert.equal(uncertain.failureReason, 'speaker_uncertain');
    assert.equal(uncertain.normalizedPath, null);
    assert.equal(loadRegistry(directory).sources[0].collectionStatus, 'review_required');
    await assert.rejects(
      () => transitionSource(directory, uncertain.id, 'approved'),
      /uncertain speaker|normalized state|coherent artifacts/i,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: same-SHA uncertain reimport preserves prior review bytes and invalidates approval evidence', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-same-sha-uncertain-'));

  try {
    const verified = await importTranscript(transcriptImport(), directory);
    const priorRawPath = path.resolve(advisorPaths(directory).root, verified.rawPath!);
    const priorRawBytes = await readFile(priorRawPath);
    const approved = await transitionSource(directory, verified.id, 'approved');

    const uncertain = await importTranscript(transcriptImport({
      reviewer: 'Second Evidence Reviewer',
      reviewedAt: '2026-07-14T05:00:00.000Z',
      speaker: null,
      speakerSegments: [{
        speaker: 'Unverified speaker',
        startChar: 0,
        endChar: reviewedTranscriptText.length,
      }],
    }), directory);

    assert.equal(approved.collectionStatus, 'approved');
    assert.equal(uncertain.sha256, verified.sha256);
    assert.equal(uncertain.collectionStatus, 'review_required');
    assert.equal(uncertain.failureReason, 'speaker_uncertain');
    assert.equal(uncertain.normalizedPath, null);
    assert.notEqual(uncertain.rawPath, verified.rawPath);
    assert.deepEqual(await readFile(priorRawPath), priorRawBytes);
    const uncertainRaw = JSON.parse(await readFile(
      path.resolve(advisorPaths(directory).root, uncertain.rawPath!),
      'utf8',
    ));
    assert.equal(uncertainRaw.supersedesRawPath, verified.rawPath);
    assert.equal(uncertainRaw.supersedesNormalizedPath, verified.normalizedPath);
    await assert.rejects(
      () => transitionSource(directory, uncertain.id, 'approved'),
      /uncertain speaker|normalized state|coherent artifacts/i,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: manual import write and registry failures preserve prior approved state and artifacts', async (t) => {
  for (const failurePoint of ['raw', 'normalized', 'registry'] as const) {
    await t.test(failurePoint, async () => {
      const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-import-rollback-'));
      try {
        const verified = await importTranscript(transcriptImport(), directory);
        await transitionSource(directory, verified.id, 'approved');
        const beforeRegistry = await readFile(advisorPaths(directory).registry);
        const beforeRawFiles = await readdir(advisorPaths(directory).raw);
        const normalizedDirectory = path.resolve(advisorPaths(directory).root, 'normalized');
        const beforeNormalizedFiles = await readdir(normalizedDirectory);
        const beforeRaw = await Promise.all(beforeRawFiles.map((name) =>
          readFile(path.join(advisorPaths(directory).raw, name))));
        const beforeNormalized = await Promise.all(beforeNormalizedFiles.map((name) =>
          readFile(path.join(normalizedDirectory, name))));
        const changedText = `${reviewedTranscriptText}\nAdditional reviewed context changes the exact source bytes.`;
        let writeCount = 0;

        await assert.rejects(() => importTranscript(transcriptImport({
          text: changedText,
          expectedSha256: sha256Text(changedText),
        }), directory, {
          artifactHooks: failurePoint === 'registry' ? undefined : {
            beforeTemporaryOpen: async () => {
              writeCount += 1;
              if ((failurePoint === 'raw' && writeCount === 1)
                || (failurePoint === 'normalized' && writeCount === 2)) {
                throw new Error(`injected ${failurePoint} write failure`);
              }
            },
          },
          commitRegistry: failurePoint === 'registry'
            ? async () => { throw new Error('injected registry transition failure'); }
            : undefined,
        }), new RegExp(`injected ${failurePoint}`));

        assert.deepEqual(await readFile(advisorPaths(directory).registry), beforeRegistry);
        assert.deepEqual(await readdir(advisorPaths(directory).raw), beforeRawFiles);
        assert.deepEqual(await readdir(normalizedDirectory), beforeNormalizedFiles);
        for (const [index, name] of beforeRawFiles.entries()) {
          assert.deepEqual(
            await readFile(path.join(advisorPaths(directory).raw, name)),
            beforeRaw[index],
          );
        }
        for (const [index, name] of beforeNormalizedFiles.entries()) {
          assert.deepEqual(
            await readFile(path.join(normalizedDirectory, name)),
            beforeNormalized[index],
          );
        }
        const preserved = loadRegistry(directory).sources[0];
        assert.equal(preserved.collectionStatus, 'approved');
        assert.notEqual(preserved.collectionStatus, 'queued');
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
});

test('edge: official collection and manual import share one canonical-family operation lock', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-shared-family-lock-'));
  let releaseTransport = () => undefined;
  const transportGate = new Promise<void>((resolve) => { releaseTransport = resolve; });
  let signalTransport = () => undefined;
  const transportEntered = new Promise<void>((resolve) => { signalTransport = resolve; });
  let manualEnteredWriter = false;
  const canonicalUrl = collectionRecord().canonicalUrl;

  try {
    const official = collectOfficialSource(collectionRecord({
      eventCandidateIds: ['official-candidate'],
    }), {
      root: directory,
      resolveHost: publicDns,
      transportImpl: async () => {
        signalTransport();
        await transportGate;
        return htmlResponse(substantialHtml('shared-family-lock'));
      },
    });
    await transportEntered;

    const manual = importTranscript(transcriptImport({
      canonicalUrl,
      eventCandidateIds: ['manual-candidate'],
    }), directory, {
      artifactHooks: {
        beforeTemporaryOpen: () => { manualEnteredWriter = true; },
      },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(manualEnteredWriter, false);
    releaseTransport();

    const [officialResult, manualResult] = await Promise.all([official, manual]);
    const registry = loadRegistry(directory);
    assert.equal(manualEnteredWriter, true);
    assert.equal(registry.sources.length, 2);
    assert.equal(officialResult.collectionStatus, 'review_required');
    assert.equal(manualResult.collectionStatus, 'review_required');
    assert.equal(registry.sources.some(({ collector, collectionStatus }) =>
      collector === 'microsoft_ir' && collectionStatus === 'review_required'), true);
    assert.equal(registry.sources.some(({ collector, collectionStatus }) =>
      collector === 'transcript_import' && collectionStatus === 'review_required'), true);
  } finally {
    releaseTransport();
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: idempotent reviewed import rebuilds missing or corrupted raw review artifacts', async (t) => {
  const cases = [
    {
      name: 'missing',
      corrupt: async (rawPath: string) => rm(rawPath),
    },
    {
      name: 'truncated',
      corrupt: async (rawPath: string) => writeFile(rawPath, '{"sourceId":', 'utf8'),
    },
    {
      name: 'wrong metadata',
      corrupt: async (rawPath: string) => {
        const raw = JSON.parse(await readFile(rawPath, 'utf8'));
        raw.metadata.id = 'source-wrong';
        await writeFile(rawPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
      },
    },
    {
      name: 'wrong review hash bytes',
      corrupt: async (rawPath: string) => {
        await writeFile(rawPath, `${await readFile(rawPath, 'utf8')} `, 'utf8');
      },
    },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, async () => {
      const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-review-rebuild-'));
      try {
        const original = await importTranscript(transcriptImport(), directory);
        const originalRawPath = path.resolve(advisorPaths(directory).root, original.rawPath!);
        await testCase.corrupt(originalRawPath);

        const rebuilt = await importTranscript(transcriptImport(), directory);
        const rebuiltRawPath = path.resolve(advisorPaths(directory).root, rebuilt.rawPath!);
        const rebuiltBytes = await readFile(rebuiltRawPath);
        const rebuiltRaw = JSON.parse(rebuiltBytes.toString('utf8'));
        const reviewHashSuffix = path.basename(rebuiltRawPath).match(/-([a-f0-9]{16})\.json$/)?.[1];

        assert.ok(reviewHashSuffix);
        assert.equal(
          createHash('sha256').update(rebuiltBytes).digest('hex').startsWith(reviewHashSuffix),
          true,
        );
        assert.equal(rebuiltRaw.sourceId, rebuilt.id);
        assert.equal(rebuiltRaw.metadata.id, rebuilt.id);
        assert.equal(rebuiltRaw.metadata.sha256, rebuilt.sha256);
        assert.equal(rebuiltRaw.metadata.capturedAt, rebuilt.capturedAt);
        assert.equal(rebuiltRaw.canonicalUrl, rebuilt.canonicalUrl);
        assert.equal(rebuiltRaw.reviewer, transcriptImport().reviewer);
        assert.deepEqual(rebuiltRaw.speakerSegments, transcriptImport().speakerSegments);
        assert.equal(rebuiltRaw.supersedesRawPath, null);
        assert.equal(rebuiltRaw.invalidatedRawPath, original.rawPath);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
});

test('failure: post-rename artifact failures compensate the promoted destination', async (t) => {
  for (const hookName of ['afterRename', 'beforeDirectorySync'] as const) {
    await t.test(hookName, async () => {
      const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-post-rename-'));
      const relativePath = 'raw/post-rename.json';
      try {
        await assert.rejects(() => writeAdvisorArtifactAtomic(
          directory,
          relativePath,
          '{"complete":true}\n',
          { [hookName]: async () => { throw new Error(`injected ${hookName} failure`); } },
        ), new RegExp(`injected ${hookName}`));
        assert.deepEqual(await readdir(advisorPaths(directory).raw), []);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
});

test('failure: rollback parent swap never removes outside-root content', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-remove-race-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'advisor-remove-race-outside-'));
  const rawDirectory = advisorPaths(directory).raw;
  const movedRawDirectory = path.join(outside, 'moved-raw');
  const sentinel = path.join(outside, 'outside-sentinel.txt');
  let writeCount = 0;
  let swapped = false;

  try {
    await writeFile(sentinel, 'must survive rollback', 'utf8');
    await assert.rejects(() => importTranscript(transcriptImport(), directory, {
      artifactHooks: {
        beforeTemporaryOpen: async () => {
          writeCount += 1;
          if (writeCount === 2) throw new Error('injected normalized write failure');
        },
      },
      artifactRemoveHooks: {
        beforeRemove: async () => {
          if (swapped) return;
          swapped = true;
          await rename(rawDirectory, movedRawDirectory);
          await symlink(outside, rawDirectory, 'dir');
        },
      },
    }), (error) => {
      assert.ok(error instanceof AggregateError);
      assert.match(error.message, /rollback was incomplete/i);
      return true;
    });

    assert.equal(swapped, true);
    assert.equal(await readFile(sentinel, 'utf8'), 'must survive rollback');
    assert.deepEqual(loadRegistry(directory), { sources: [] });
    assert.equal((await readdir(movedRawDirectory)).some((name) => name.endsWith('.json')), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
