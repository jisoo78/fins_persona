/**
 * Test Plan:
 * 1. Happy Path:
 *    - advisor paths are deterministic and atomic JSON persistence round-trips valid data.
 *    - an approved official HTML source persists exact bytes, normalizes useful text, and reaches review.
 *
 * 2. Edge Cases:
 *    - a LinkedIn URL is classified as discovery-only.
 *    - canonical-equivalent discoveries resolve to the same URL identity.
 *    - fragments and tracking parameters are removed while useful query keys are sorted.
 *    - duplicate canonical URLs merge candidate links without duplicating registry records.
 *    - changed content creates an immutable source version while identical refreshes stay idempotent.
 *    - collector adapters enforce their exact host and explicit public-host approval boundaries.
 *    - a normalized checkpoint resumes safely, and SEC JSON uses its declared user agent.
 *
 * 3. Failure Path:
 *    - non-HTTPS and non-allowlisted sources require safe rejection.
 *    - a non-JSON value cannot overwrite an existing valid file.
 *    - an injected rename failure preserves the destination and removes its temporary file.
 *    - close and remove cleanup failures are reported with the original operation failure.
 *    - invalid state transitions, network refresh failures, oversized/unsupported/short content fail safely.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { readJsonFile, writeJsonAtomic } from '../server/decisionAdvisor/jsonStore';
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
import { collectOfficialSource } from '../server/decisionAdvisor/officialSourceCollector';
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
      now: () => new Date('2026-07-14T01:02:03.000Z'),
      fetchImpl: async (_input, init) => {
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
      fetchImpl: async () => htmlResponse(substantialHtml()),
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
      fetchImpl: async (_input, init) => {
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

test('edge: canonical-equivalent discoveries merge candidate IDs and collect idempotently', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-collector-duplicate-'));
  const bytes = substantialHtml();

  try {
    const first = await collectOfficialSource(collectionRecord({
      canonicalUrl: 'https://www.microsoft.com/Investor/a?id=7&utm_source=first#quote',
      eventCandidateIds: ['candidate-a'],
    }), { root: directory, fetchImpl: async () => htmlResponse(bytes) });
    const duplicate = await collectOfficialSource(collectionRecord({
      canonicalUrl: 'https://www.microsoft.com/Investor/a?utm_campaign=repeat&id=7',
      eventCandidateIds: ['candidate-b', 'candidate-a'],
    }), { root: directory, fetchImpl: async () => htmlResponse(bytes) });
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
      fetchImpl: async () => htmlResponse(substantialHtml('first version')),
    });
    const firstRaw = await readFile(
      path.resolve(advisorPaths(directory).root, first.rawPath!),
      'utf8',
    );
    const refreshed = await collectOfficialSource(first, {
      root: directory,
      fetchImpl: async () => htmlResponse(substantialHtml('changed version')),
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
      fetchImpl: async () => htmlResponse(bytes),
    });
    await writeJsonAtomic(advisorPaths(directory).registry, {
      sources: [{ ...complete, collectionStatus: 'normalized' }],
    });

    const resumed = await collectOfficialSource({
      ...complete,
      collectionStatus: 'normalized',
    }, {
      root: directory,
      fetchImpl: async () => htmlResponse(bytes),
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
      fetchImpl: async () => htmlResponse(substantialHtml()),
    });
    const validRawPath = path.resolve(advisorPaths(directory).root, valid.rawPath!);
    const before = await readFile(validRawPath, 'utf8');

    await assert.rejects(() => collectOfficialSource(valid, {
      fetchImpl: async () => { throw new Error('network unavailable'); },
      root: directory,
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
      fetchImpl: async () => htmlResponse(substantialHtml()),
    });
    await assert.rejects(() => collectOfficialSource(valid, {
      root: directory,
      fetchImpl: async () => htmlResponse(Buffer.from('<html><main>changed but short</main></html>')),
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
      fetchImpl: async () => htmlResponse(substantialHtml()),
    }), /approved public host/i);
    assert.equal(loadRegistry(directory).sources[0].collectionStatus, 'failed');
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
          fetchImpl: async () => testCase.response,
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
