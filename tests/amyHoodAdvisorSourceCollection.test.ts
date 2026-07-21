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
 *    - direct Amy evidence must be fully contained by an Amy-attributed speaker segment.
 *    - event relevance requires all three reviewed fingerprint fields in one bounded exact passage.
 *    - raw provenance rejects an invented same-host final path that was not in the redirect chain.
 *    - ambiguous grammar cannot attribute another person's quote to Amy Hood.
 *    - association discriminators cannot override the reviewed candidate event fingerprint.
 *    - every fingerprint source URL requires its own reviewed association at that canonical URL.
 *    - a generic Amy quote cannot borrow a distant event-specific passage.
 *    - corrupt or cross-owned review reuse, post-rename failures, and rollback parent swaps fail without trusting or deleting unsafe paths.
 *
 * Test Plan (Task 5 discovery matrix and CLI gates):
 * 1. Happy Path:
 *    - 30–50 candidates spanning all five domains and 100–150 unique HTTPS discoveries pass.
 *
 * 2. Edge Cases:
 *    - duplicate candidate IDs fail with the exact duplicate identified.
 *    - a domain with fewer than four candidates reports its exact count.
 *    - inverted decision windows and outcome-only working titles are rejected.
 *
 * 3. Failure Path:
 *    - candidate counts below 30 or above 50 fail before candidate content is accepted.
 *    - partial source registries report exact URL/document deficits and missing artifacts do not count.
 *    - unknown collection IDs and malformed local import files exit nonzero without network access.
 *
 * Test Plan (M&A supporting evidence family coverage):
 * 1. Happy Path:
 *    - two reviewed decision-time artifacts from two document families satisfy source coverage.
 *
 * 2. Edge Cases:
 *    - a press release and its SEC mirror share one family and count once.
 *    - translated variants of one announcement share one family and count once.
 *    - a post-outcome artifact is retained but excluded from core family coverage.
 *
 * 3. Failure Path:
 *    - invalid family identifiers and a one-family candidate fail with explicit deficits.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
  sourceIdForUrl,
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
  extractSpeakerSegments,
} from '../server/decisionAdvisor/officialSourceCollector';
import { importReviewedSource as importReviewedSourceReal } from '../server/decisionAdvisor/manualSourceImporter';
import {
  importReviewedExcerpt,
  type ReviewedExcerptImport,
} from '../server/decisionAdvisor/reviewedExcerptImporter';
import { importTranscript as importTranscriptReal } from '../server/decisionAdvisor/transcriptImporter';
import type {
  AdvisorSourceRecord,
  EventCandidate,
} from '../shared/amyHoodDecisionAdvisor';

const officialCandidate: EventCandidate = {
  id: 'candidate-fy25-q4-capex',
  workingTitle: 'FY25 Q4 AI infrastructure investment',
  domain: 'ai_cloud_capex',
  decisionWindowStart: '2025-07-30',
  decisionWindowEnd: '2025-07-30',
  discoveryUrls: ['https://www.microsoft.com/en-us/Investor/events/FY-2025'],
  decisionWindowBasis: {
    summary: 'The official event publication date defines the public decision disclosure date.',
    sourceUrls: ['https://www.microsoft.com/en-us/Investor/events/FY-2025'],
    reviewerNote: 'Reviewed against the dated official event page.',
  },
  eventFingerprint: {
    primaryEntity: 'FY25 Q4',
    decisionAction: 'infrastructure investment',
    eventSpecificIdentifier: 'decision evidence',
    sourceUrls: ['https://www.microsoft.com/en-us/Investor/events/FY-2025'],
    reviewStatus: 'reviewed',
    reviewerNote: 'Reviewed against the official event announcement.',
  },
  sourceAssociations: [{
    canonicalUrl: 'https://www.microsoft.com/en-us/Investor/events/FY-2025',
    role: 'direct_amy',
    sourceType: 'investor_relations',
    publishedAt: '2025-07-30',
    temporalRelation: 'decision_time',
    relevanceClaim: 'Amy Hood discusses the named FY25 Q4 infrastructure investment decision.',
    evidenceLocator: {
      exactQuote: 'Amy Hood decision evidence for FY25 Q4 infrastructure investment',
      exactRelevancePassage: 'Amy Hood decision evidence for FY25 Q4 infrastructure investment',
      anchorTerms: ['FY25 Q4', 'infrastructure investment'],
      eventDiscriminators: [
        { value: 'FY25 Q4', kind: 'named_entity' },
        { value: 'infrastructure investment', kind: 'decision_action' },
        { value: 'decision evidence', kind: 'event_specific' },
      ],
      speaker: 'Amy Hood',
    },
    reviewStatus: 'reviewed',
    reviewerNote: 'Exact passage and event terms were reviewed in the collected page.',
  }],
  directEvidenceGap: null,
  phase3Status: 'eligible',
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

const registerReviewedImport = async (
  input: Parameters<typeof importReviewedSourceReal>[0],
  root: string,
) => {
  const candidatePath = path.join(advisorPaths(root).root, 'event-candidates.json');
  let candidates: Array<{
    id: string;
    status: string;
    discoveryUrls: string[];
    sourceAssociations: Array<{ canonicalUrl: string; reviewStatus: string }>;
  }> = [];
  try {
    candidates = JSON.parse(await readFile(candidatePath, 'utf8'));
  } catch {
    await mkdir(path.dirname(candidatePath), { recursive: true });
  }
  for (const candidateId of input.eventCandidateIds) {
    const existing = candidates.find(({ id }) => id === candidateId);
    if (existing) {
      if (!existing.discoveryUrls.includes(input.canonicalUrl)) {
        existing.discoveryUrls.push(input.canonicalUrl);
      }
      if (!existing.sourceAssociations.some(({ canonicalUrl }) =>
        canonicalUrl === input.canonicalUrl)) {
        existing.sourceAssociations.push({
          canonicalUrl: input.canonicalUrl,
          reviewStatus: 'reviewed',
        });
      }
    } else {
      candidates.push({
        id: candidateId,
        status: 'approved_for_collection',
        discoveryUrls: [input.canonicalUrl],
        sourceAssociations: [{
          canonicalUrl: input.canonicalUrl,
          reviewStatus: 'reviewed',
        }],
      });
    }
  }
  await writeFile(candidatePath, `${JSON.stringify(candidates, null, 2)}\n`);
  await upsertDiscoveredSource(collectionRecord({
    id: sourceIdForUrl(input.canonicalUrl),
    canonicalUrl: input.canonicalUrl,
    eventCandidateIds: input.eventCandidateIds,
    title: input.title,
    publisher: input.publisher,
    publishedAt: input.publishedAt,
    speaker: input.speaker,
    sourceType: 'reviewed_transcript',
    collector: 'manual_import',
    temporalRole: 'decision_time',
    tier: input.tier,
    approvedPublicHost: true,
  }), root);
};

const importReviewedSource: typeof importReviewedSourceReal = async (input, root) => {
  await registerReviewedImport(input, root);
  return importReviewedSourceReal(input, root);
};

const importTranscript: typeof importTranscriptReal = async (input, root, dependencies) => {
  await registerReviewedImport(input, root);
  return importTranscriptReal(input, root, dependencies);
};

const reviewedExcerptText = [
  'The company announced a bounded capital allocation decision after reviewing durable demand,',
  'liquidity, strategic investment requirements, and long-term shareholder value.',
  'Amy Hood: These actions reflect a continued commitment to returning cash to our shareholders.',
  'The authorization remains subject to the stated financial guardrails and execution conditions.',
].join(' ');

const reviewedExcerptInput = (
  overrides: Partial<ReviewedExcerptImport> = {},
): ReviewedExcerptImport => ({
  canonicalUrl: 'https://example.com/public/reviewed-amy-excerpt',
  title: 'Reviewed Amy Hood capital allocation excerpt',
  publisher: 'Example Business Review',
  publishedAt: '2013-09-17',
  speaker: 'Amy Hood',
  eventCandidateIds: ['candidate-buyback-2013'],
  tier: 3,
  rightsNote: 'Public source excerpt captured and manually reviewed with attribution.',
  excerptText: reviewedExcerptText,
  exactQuote: 'These actions reflect a continued commitment to returning cash to our shareholders.',
  evidenceUse: 'direct_amy',
  sourceType: 'official_announcement',
  reviewer: 'Codex',
  reviewedAt: '2026-07-21T00:00:00.000Z',
  ...overrides,
});

const registerExcerptImport = async (input: ReviewedExcerptImport, root: string) =>
  registerReviewedImport({
    ...input,
    text: input.excerptText,
    expectedSha256: '0'.repeat(64),
  }, root);

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
    assert.equal(raw.requestedCanonicalUrl, 'https://www.microsoft.com/Investor/redirect-start');
    assert.equal(raw.finalUrl, 'https://investor.microsoft.com/Investor/final');
    assert.deepEqual(raw.redirectChain, [
      'https://www.microsoft.com/Investor/redirect-start',
      'https://investor.microsoft.com/Investor/final',
    ]);
    assert.equal(collected.finalUrl, 'https://investor.microsoft.com/Investor/final');
    assert.deepEqual(collected.redirectChain, raw.redirectChain);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: ambiguous Amy grammar never attributes another speaker quote to Amy', () => {
  const examples = [
    'Amy Hood disagreed with Satya Nadella, who said: “We will acquire Fabrikam today.”',
    'Amy Hood disagreed with Satya Nadella, who said:“We will acquire Fabrikam today.”',
  ];

  for (const text of examples) assert.deepEqual(extractSpeakerSegments(text), []);
});

test('edge: normalized single-line transcripts retain the bounded Amy Hood speaker turn', () => {
  const text = 'PHIL SPENCER: I will hand it over to Amy. AMY HOOD: Our approach to mergers and acquisitions is to focus on TAM-expansive opportunities. SATYA NADELLA: Thank you, Amy.';

  const segments = extractSpeakerSegments(text);

  assert.equal(segments.length, 1);
  assert.equal(
    text.slice(segments[0].startChar, segments[0].endChar),
    'Our approach to mergers and acquisitions is to focus on TAM-expansive opportunities.',
  );
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
  const originalAddEventListener = controller.signal.addEventListener.bind(controller.signal);
  let abortListenerAdds = 0;
  controller.signal.addEventListener = ((...args: Parameters<AbortSignal['addEventListener']>) => {
    if (args[0] === 'abort') abortListenerAdds += 1;
    return originalAddEventListener(...args);
  }) as AbortSignal['addEventListener'];
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
  assert.equal(abortListenerAdds, 1);
});

test('edge: pooled TLS sockets do not accumulate secureConnect listeners across a batch', async () => {
  let secureConnectAdds = 0;
  let errorListener: ((error: Error) => void) | undefined;
  const pooledSocket = {
    connecting: false,
    once: (event: string) => {
      if (event === 'secureConnect') secureConnectAdds += 1;
    },
  };
  const requestImpl = (() => ({
    once: (event: string, listener: (error: Error) => void) => {
      if (event === 'error') errorListener = listener;
    },
    on: (event: string, listener: (socket: typeof pooledSocket) => void) => {
      if (event === 'socket') listener(pooledSocket);
    },
    end: () => undefined,
    destroy: (error: Error) => errorListener?.(error),
  })) as never;

  for (let index = 0; index < 12; index += 1) {
    const controller = new AbortController();
    const pending = defaultPinnedTransport({
      url: new URL('https://www.microsoft.com/Investor/test'),
      validatedAddresses: ['93.184.216.34'],
      init: { signal: controller.signal },
      timeouts: { connectMs: 100, headersMs: 100, bodyMs: 100 },
    }, requestImpl);
    controller.abort();
    await assert.rejects(() => pending, /aborted/i);
  }

  assert.equal(secureConnectAdds, 0);
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

/**
 * Test Plan (canonical reviewed excerpts):
 * 1. Happy Path:
 *    - import one reviewed Amy excerpt with a computed hash and exact speaker offsets.
 * 2. Edge Cases:
 *    - preserve existing reviewed source imports as full_text.
 *    - re-import the same excerpt idempotently.
 *    - import decision context without an Amy speaker segment.
 * 3. Failure Path:
 *    - reject absent or repeated quotes and direct evidence without Amy attribution before writes.
 */
test('happy: reviewed excerpt import computes integrity and Amy speaker offsets', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-reviewed-excerpt-'));
  try {
    const input = reviewedExcerptInput();
    await registerExcerptImport(input, directory);
    const source = await importReviewedExcerpt(input, directory);
    assert.equal(source.contentCompleteness, 'reviewed_excerpt');
    assert.match(source.sha256!, /^[a-f0-9]{64}$/);
    const raw = JSON.parse(await readFile(
      path.resolve(advisorPaths(directory).root, source.rawPath!),
      'utf8',
    ));
    const start = input.excerptText.indexOf(input.exactQuote);
    assert.deepEqual(raw.speakerSegments, [{
      speaker: 'Amy Hood',
      startChar: start,
      endChar: start + input.exactQuote.length,
    }]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('edge: existing reviewed source imports default to full text', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-full-text-default-'));
  try {
    const source = await importReviewedSource(transcriptImport({
      canonicalUrl: 'https://example.com/public/full-text-default',
    }), directory);
    assert.equal(source.contentCompleteness, 'full_text');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('edge: identical reviewed excerpt import is idempotent', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-excerpt-idempotent-'));
  try {
    const input = reviewedExcerptInput();
    await registerExcerptImport(input, directory);
    const first = await importReviewedExcerpt(input, directory);
    const second = await importReviewedExcerpt(input, directory);
    assert.equal(second.id, first.id);
    assert.equal(second.rawPath, first.rawPath);
    assert.equal(loadRegistry(directory).sources.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('edge: reviewed context excerpt does not invent a speaker segment', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-context-excerpt-'));
  try {
    const input = reviewedExcerptInput({
      canonicalUrl: 'https://example.com/public/context-excerpt',
      speaker: null,
      evidenceUse: 'decision_context',
    });
    await registerExcerptImport(input, directory);
    const source = await importReviewedExcerpt(input, directory);
    const raw = JSON.parse(await readFile(
      path.resolve(advisorPaths(directory).root, source.rawPath!),
      'utf8',
    ));
    assert.deepEqual(raw.speakerSegments, []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: invalid reviewed excerpts leave no canonical write', async (t) => {
  const cases: Array<{ name: string; input: ReviewedExcerptImport; error: RegExp }> = [
    {
      name: 'quote absent',
      input: reviewedExcerptInput({ exactQuote: 'This quote is not in the captured excerpt.' }),
      error: /one exact quote occurrence/,
    },
    {
      name: 'quote repeated',
      input: reviewedExcerptInput({
        excerptText: `${reviewedExcerptText} ${reviewedExcerptInput().exactQuote}`,
      }),
      error: /one exact quote occurrence/,
    },
    {
      name: 'direct evidence without Amy attribution',
      input: reviewedExcerptInput({ speaker: null }),
      error: /requires Amy Hood/,
    },
  ];
  for (const item of cases) {
    await t.test(item.name, async () => {
      const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-invalid-excerpt-'));
      try {
        await registerExcerptImport(item.input, directory);
        await assert.rejects(() => importReviewedExcerpt(item.input, directory), item.error);
        assert.equal(loadRegistry(directory).sources[0].rawPath, null);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    });
  }
});

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

test('failure: direct reviewed import fails closed when the candidate matrix is missing', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-import-no-matrix-'));

  try {
    await assert.rejects(
      () => importReviewedSourceReal(transcriptImport(), directory),
      /event candidate matrix.*required/i,
    );
    assert.deepEqual(loadRegistry(directory), { sources: [] });
    await assert.rejects(() => readdir(advisorPaths(directory).raw), /ENOENT/);
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
          () => importReviewedSourceReal(transcriptImport(testCase.overrides), directory),
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
          () => importTranscriptReal(transcriptImport({ speakerSegments: testCase.speakerSegments }), directory),
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
    assert.equal(loadRegistry(directory).sources.length, 1);
    assert.equal(loadRegistry(directory).sources[0].collectionStatus, 'discovered');
    assert.equal((await readdir(movedRawDirectory)).some((name) => name.endsWith('.json')), true);
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});

test('failure: cross-version raw pointer is not trusted as an owned audit predecessor', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-cross-version-owner-'));
  const changedText = `${reviewedTranscriptText}\nVersion B adds distinct reviewed source content.`;

  try {
    const versionAInput = transcriptImport();
    const versionA = await importTranscript(versionAInput, directory);
    const versionB = await importTranscript(transcriptImport({
      text: changedText,
      expectedSha256: sha256Text(changedText),
      reviewer: 'Version B Reviewer',
      reviewedAt: '2026-07-14T06:00:00.000Z',
    }), directory);
    const versionBRawBytes = await readFile(
      path.resolve(advisorPaths(directory).root, versionB.rawPath!),
    );
    const registry = loadRegistry(directory);
    await writeJsonAtomic(advisorPaths(directory).registry, {
      sources: registry.sources.map((source) => source.id === versionA.id
        ? {
          ...source,
          rawPath: versionB.rawPath,
          normalizedPath: versionB.normalizedPath,
        }
        : source),
    });

    const rebuiltA = await importTranscript(versionAInput, directory);
    const rebuiltRaw = JSON.parse(await readFile(
      path.resolve(advisorPaths(directory).root, rebuiltA.rawPath!),
      'utf8',
    ));

    assert.equal(rebuiltA.id, versionA.id);
    assert.equal(rebuiltA.sha256, versionA.sha256);
    assert.notEqual(rebuiltA.rawPath, versionB.rawPath);
    assert.notEqual(rebuiltA.normalizedPath, versionB.normalizedPath);
    assert.equal(rebuiltRaw.metadata.id, versionA.id);
    assert.equal(rebuiltRaw.metadata.sha256, versionA.sha256);
    assert.equal(rebuiltRaw.metadata.capturedAt, versionA.capturedAt);
    assert.equal(rebuiltRaw.supersedesRawPath, null);
    assert.equal(rebuiltRaw.supersedesNormalizedPath, null);
    assert.equal(rebuiltRaw.invalidatedRawPath, versionB.rawPath);
    assert.deepEqual(
      await readFile(path.resolve(advisorPaths(directory).root, versionB.rawPath!)),
      versionBRawBytes,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

const advisorDomains = [
  'm_and_a',
  'ai_cloud_capex',
  'pricing_monetization',
  'cost_efficiency',
  'shareholder_return_risk',
] as const;

const validCandidateMatrix = (): EventCandidate[] => Array.from({ length: 30 }, (_, index) => {
  const id = `candidate-${String(index + 1).padStart(2, '0')}`;
  const publishedAt = `20${String(10 + Math.floor(index / 4)).padStart(2, '0')}-01-01`;
  const discoveryUrls = Array.from(
    { length: index < 10 ? 4 : 3 },
    (_, urlIndex) => `https://www.microsoft.com/advisor-source/${index + 1}/${urlIndex + 1}`,
  );
  return {
    id,
    workingTitle: `Project Falcon ${index + 1} authorization decision`,
    domain: advisorDomains[index % advisorDomains.length],
    decisionWindowStart: publishedAt,
    decisionWindowEnd: `20${String(10 + Math.floor(index / 4)).padStart(2, '0')}-03-31`,
    discoveryUrls,
    decisionWindowBasis: {
      summary: `The dated authorization notice for ${id} defines the public decision window.`,
      sourceUrls: [discoveryUrls[0]],
      reviewerNote: 'Reviewed against the event-specific authorization date.',
    },
    eventFingerprint: {
      primaryEntity: `Project Falcon ${index + 1}`,
      decisionAction: 'authorization',
      eventSpecificIdentifier: `Falcon-${index + 1} approval`,
      sourceUrls: [discoveryUrls[0]],
      reviewStatus: 'reviewed' as const,
      reviewerNote: 'Reviewed against the official event announcement.',
    },
    sourceAssociations: discoveryUrls.map((canonicalUrl, urlIndex) => ({
      canonicalUrl,
      role: urlIndex === 0 ? 'direct_amy' as const : 'contemporaneous_context' as const,
      sourceType: urlIndex === 0 ? 'earnings_webcast' : `event_filing_${urlIndex}`,
      publishedAt,
      temporalRelation: 'decision_time' as const,
      relevanceClaim: `This source identifies the authorization and economics of Project Falcon ${index + 1}.`,
      evidenceLocator: {
        exactQuote: `${urlIndex === 0 ? 'Amy Hood ' : ''}decision evidence for Project Falcon ${index + 1} authorization decision and Falcon-${index + 1} approval`,
        exactRelevancePassage: `${urlIndex === 0 ? 'Amy Hood ' : ''}decision evidence for Project Falcon ${index + 1} authorization decision and Falcon-${index + 1} approval`,
        anchorTerms: [`Project Falcon ${index + 1}`, 'authorization'],
        eventDiscriminators: [
          { value: `Project Falcon ${index + 1}`, kind: 'named_entity' as const },
          { value: 'authorization', kind: 'decision_action' as const },
          { value: `Falcon-${index + 1} approval`, kind: 'event_specific' as const },
        ],
        speaker: urlIndex === 0 ? 'Amy Hood' as const : null,
      },
      reviewStatus: 'reviewed' as const,
      reviewerNote: `Reviewer verified the ${id} locator in this collected source.`,
    })),
    directEvidenceGap: null,
    phase3Status: 'eligible',
    notes: 'The authorization date and event-specific locator were reviewed in primary material.',
    status: 'approved_for_collection',
  };
});

const runAdvisorCli = (root: string, ...args: string[]) => spawnSync(
  process.execPath,
  ['--import', 'tsx', 'server/runAmyHoodDecisionAdvisor.ts', ...args, '--root', root],
  { cwd: path.resolve(import.meta.dirname, '..'), encoding: 'utf8' },
);

test('happy: candidate CLI accepts 30 and 33 candidates across five domains', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-candidates-happy-'));
  const candidatePath = path.join(directory, 'data/b-track/amy-hood/advisor/event-candidates.json');

  try {
    await mkdir(path.dirname(candidatePath), { recursive: true });
    await writeFile(candidatePath, `${JSON.stringify(validCandidateMatrix(), null, 2)}\n`);

    const result = runAdvisorCli(directory, 'candidates:check');

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /30 candidates/i);
    assert.match(result.stdout, /100 unique discovery URLs/i);

    const expanded = validCandidateMatrix();
    for (const [index, source] of expanded.slice(0, 3).entries()) {
      expanded.push({
        ...structuredClone(source),
        id: `candidate-capacity-resource-${index + 1}`,
      });
    }
    await writeFile(candidatePath, `${JSON.stringify(expanded, null, 2)}\n`);

    const expandedResult = runAdvisorCli(directory, 'candidates:check');

    assert.equal(expandedResult.status, 0, expandedResult.stderr);
    assert.match(expandedResult.stdout, /33 candidates/i);
    assert.match(expandedResult.stdout, /100 unique discovery URLs/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: candidate CLI rejects counts outside the inclusive 30–50 range', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-candidate-count-'));
  const candidatePath = path.join(directory, 'data/b-track/amy-hood/advisor/event-candidates.json');

  try {
    await mkdir(path.dirname(candidatePath), { recursive: true });
    await writeFile(
      candidatePath,
      `${JSON.stringify(validCandidateMatrix().slice(0, 29), null, 2)}\n`,
    );
    const tooFew = runAdvisorCli(directory, 'candidates:check');
    assert.equal(tooFew.status, 1);
    assert.match(tooFew.stderr, /expected 30-50 candidates; found 29/i);

    const excessive = Array.from({ length: 51 }, (_, index) => ({
      ...structuredClone(validCandidateMatrix()[index % 30]),
      id: `candidate-excess-${index}`,
    }));
    await writeFile(candidatePath, `${JSON.stringify(excessive, null, 2)}\n`);
    const tooMany = runAdvisorCli(directory, 'candidates:check');
    assert.equal(tooMany.status, 1);
    assert.match(tooMany.stderr, /expected 30-50 candidates; found 51/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: candidate CLI requires reviewed structured associations and a sourced window basis', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-candidates-associations-'));
  const candidatePath = path.join(directory, 'data/b-track/amy-hood/advisor/event-candidates.json');
  const candidates = validCandidateMatrix() as Array<EventCandidate & {
    sourceAssociations?: unknown[];
    decisionWindowBasis?: unknown;
  }>;
  candidates[0].sourceAssociations = [];
  candidates[0].decisionWindowBasis = {
    summary: 'same quarter as an earnings call',
    sourceUrls: [],
    reviewerNote: '',
  };

  try {
    await mkdir(path.dirname(candidatePath), { recursive: true });
    await writeFile(candidatePath, `${JSON.stringify(candidates, null, 2)}\n`);
    const result = runAdvisorCli(directory, 'candidates:check');

    assert.equal(result.status, 1);
    assert.match(result.stderr, /reviewed source association|decision window basis/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: association discriminators cannot override a reviewed candidate fingerprint', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-fingerprint-override-'));
  const candidatePath = path.join(directory, 'data/b-track/amy-hood/advisor/event-candidates.json');
  const candidates = validCandidateMatrix();
  const candidate = candidates[0];
  candidate.sourceAssociations[0].evidenceLocator.eventDiscriminators = [
    { value: 'Fabrikam', kind: 'named_entity' },
    { value: 'acquisition', kind: 'decision_action' },
    { value: 'Fabrikam transaction', kind: 'event_specific' },
  ];

  try {
    await mkdir(path.dirname(candidatePath), { recursive: true });
    await writeFile(candidatePath, `${JSON.stringify(candidates, null, 2)}\n`);
    const result = runAdvisorCli(directory, 'candidates:check');

    assert.equal(result.status, 1);
    assert.match(result.stderr, /event fingerprint|discriminator/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('edge: reviewed source wording can satisfy a locator discriminator', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-fingerprint-alias-'));
  const candidatePath = path.join(directory, 'data/b-track/amy-hood/advisor/event-candidates.json');
  const candidates = validCandidateMatrix();
  const candidate = candidates[0];
  const sourceUrl = candidate.sourceAssociations[0].canonicalUrl;
  candidate.eventFingerprint.aliases = [{
    kind: 'decision_action',
    canonicalValue: candidate.eventFingerprint.decisionAction,
    value: 'approved the authorization',
    sourceUrl,
    reviewStatus: 'reviewed',
    reviewerNote: 'The primary-source Amy Hood wording identifies the same authorization action.',
  }];
  const locator = candidate.sourceAssociations[0].evidenceLocator!;
  locator.eventDiscriminators[1].value = 'approved the authorization';
  locator.exactQuote = locator.exactQuote.replace('authorization', 'approved the authorization');
  locator.exactRelevancePassage = locator.exactRelevancePassage.replace(
    'authorization',
    'approved the authorization',
  );

  try {
    await mkdir(path.dirname(candidatePath), { recursive: true });
    await writeFile(candidatePath, `${JSON.stringify(candidates, null, 2)}\n`);
    const result = runAdvisorCli(directory, 'candidates:check');

    assert.equal(result.status, 0, result.stderr);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: aliases must be reviewed and source-bound', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-fingerprint-alias-invalid-'));
  const candidatePath = path.join(directory, 'data/b-track/amy-hood/advisor/event-candidates.json');
  const candidates = validCandidateMatrix();
  const candidate = candidates[0];
  candidate.eventFingerprint.aliases = [{
    kind: 'decision_action',
    canonicalValue: candidate.eventFingerprint.decisionAction,
    value: 'did something',
    sourceUrl: 'https://example.com/unrelated',
    reviewStatus: 'unreviewed' as 'reviewed',
    reviewerNote: 'This deliberately violates the reviewed source-bound alias contract.',
  }];

  try {
    await mkdir(path.dirname(candidatePath), { recursive: true });
    await writeFile(candidatePath, `${JSON.stringify(candidates, null, 2)}\n`);
    const result = runAdvisorCli(directory, 'candidates:check');

    assert.equal(result.status, 1);
    assert.match(result.stderr, /invalid event fingerprint alias/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: every fingerprint source URL requires a reviewed association at that URL', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-fingerprint-review-'));
  const candidatePath = path.join(directory, 'data/b-track/amy-hood/advisor/event-candidates.json');
  const candidates = validCandidateMatrix();
  const candidate = candidates[0];
  candidate.sourceAssociations[0].reviewStatus = 'unreviewed';
  candidate.sourceAssociations[1].role = 'direct_amy';
  candidate.sourceAssociations[1].evidenceLocator.speaker = 'Amy Hood';
  const replacementUrl = 'https://www.microsoft.com/advisor-source/1/replacement-reviewed';
  candidate.discoveryUrls.push(replacementUrl);
  candidate.sourceAssociations.push({
    ...structuredClone(candidate.sourceAssociations[1]),
    canonicalUrl: replacementUrl,
    role: 'contemporaneous_context',
    evidenceLocator: {
      ...structuredClone(candidate.sourceAssociations[1].evidenceLocator),
      speaker: null,
    },
  });

  try {
    await mkdir(path.dirname(candidatePath), { recursive: true });
    await writeFile(candidatePath, `${JSON.stringify(candidates, null, 2)}\n`);
    const result = runAdvisorCli(directory, 'candidates:check');

    assert.equal(result.status, 1);
    assert.match(result.stderr, /fingerprint source.*reviewed association/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: an overly broad relevance passage cannot stand in for a strict event passage', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-broad-relevance-'));
  const candidatePath = path.join(directory, 'data/b-track/amy-hood/advisor/event-candidates.json');
  const candidates = validCandidateMatrix();
  candidates[0].sourceAssociations[0].evidenceLocator.exactRelevancePassage =
    `Project Falcon 1 authorization Falcon-1 approval ${'general context '.repeat(100)}`;

  try {
    await mkdir(path.dirname(candidatePath), { recursive: true });
    await writeFile(candidatePath, `${JSON.stringify(candidates, null, 2)}\n`);
    const result = runAdvisorCli(directory, 'candidates:check');

    assert.equal(result.status, 1);
    assert.match(result.stderr, /invalid source association|relevance passage/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('edge: candidate CLI identifies a duplicate candidate ID', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-candidates-duplicate-'));
  const candidatePath = path.join(directory, 'data/b-track/amy-hood/advisor/event-candidates.json');
  const candidates = validCandidateMatrix();
  candidates[1].id = candidates[0].id;

  try {
    await mkdir(path.dirname(candidatePath), { recursive: true });
    await writeFile(candidatePath, `${JSON.stringify(candidates, null, 2)}\n`);
    const result = runAdvisorCli(directory, 'candidates:check');

    assert.equal(result.status, 1);
    assert.match(result.stderr, /duplicate candidate ID: candidate-01/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('edge: candidate CLI reports a domain below the four-candidate floor', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-candidates-domain-'));
  const candidatePath = path.join(directory, 'data/b-track/amy-hood/advisor/event-candidates.json');
  const candidates = validCandidateMatrix();
  for (const index of [0, 5, 10]) candidates[index].domain = 'ai_cloud_capex';

  try {
    await mkdir(path.dirname(candidatePath), { recursive: true });
    await writeFile(candidatePath, `${JSON.stringify(candidates, null, 2)}\n`);
    const result = runAdvisorCli(directory, 'candidates:check');

    assert.equal(result.status, 1);
    assert.match(result.stderr, /domain m_and_a requires at least 4 candidates; found 3/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('edge: candidate CLI rejects inverted windows and outcome-only titles', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-candidates-window-'));
  const candidatePath = path.join(directory, 'data/b-track/amy-hood/advisor/event-candidates.json');

  try {
    await mkdir(path.dirname(candidatePath), { recursive: true });
    const inverted = validCandidateMatrix();
    inverted[0].decisionWindowStart = '2020-04-01';
    inverted[0].decisionWindowEnd = '2020-03-31';
    await writeFile(candidatePath, `${JSON.stringify(inverted, null, 2)}\n`);
    assert.match(runAdvisorCli(directory, 'candidates:check').stderr, /inverted decision window/i);

    const outcomeOnly = validCandidateMatrix();
    outcomeOnly[0].workingTitle = 'Completed successfully';
    await writeFile(candidatePath, `${JSON.stringify(outcomeOnly, null, 2)}\n`);
    assert.match(runAdvisorCli(directory, 'candidates:check').stderr, /outcome-only working title/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

const writeRegistryFixture = async (
  root: string,
  options: {
    discoveries: number;
    validDocuments: number;
    separateDirectQuoteFromRelevance?: boolean;
  },
  fixtureCandidates = validCandidateMatrix(),
) => {
  const advisorRoot = path.join(root, 'data/b-track/amy-hood/advisor');
  const rawDirectory = path.join(advisorRoot, 'raw');
  const normalizedDirectory = path.join(advisorRoot, 'normalized');
  await mkdir(rawDirectory, { recursive: true });
  await mkdir(normalizedDirectory, { recursive: true });
  const sources: AdvisorSourceRecord[] = [];
  const discoveryUrls = fixtureCandidates
    .flatMap((candidate) => candidate.discoveryUrls)
    .sort((left, right) => Number(left.split('/').at(-1)) - Number(right.split('/').at(-1)));
  const candidateForUrl = new Map(
    fixtureCandidates.flatMap((candidate) => candidate.sourceAssociations.map((association, urlIndex) => [
      association.canonicalUrl,
      { candidateId: candidate.id, direct: urlIndex === 0, association },
    ] as const)),
  );

  for (let index = 0; index < options.discoveries; index += 1) {
    const canonicalUrl = discoveryUrls[index];
    const sourceRole = candidateForUrl.get(canonicalUrl)!;
    const linkedCandidate = fixtureCandidates.find(({ id }) => id === sourceRole.candidateId)!;
    const id = sourceIdForUrl(canonicalUrl);
    const directSeparator = sourceRole.direct && options.separateDirectQuoteFromRelevance
      ? ` ${'Unrelated public source context. '.repeat(100)}`
      : ' ';
    const text = `${sourceRole.association.evidenceLocator.exactQuote}.${directSeparator}${sourceRole.association.evidenceLocator.exactRelevancePassage}. ${'Public Microsoft source context. '.repeat(12)}`;
    const sha256 = createHash('sha256').update(text).digest('hex');
    const valid = index < options.validDocuments;
    const rawPath = valid ? `raw/${id}.json` : null;
    const normalizedPath = valid ? `normalized/${id}.txt` : null;
    const record: AdvisorSourceRecord = {
      id,
      canonicalUrl,
      finalUrl: canonicalUrl,
      redirectChain: [canonicalUrl],
      eventCandidateIds: [sourceRole.candidateId],
      tier: sourceRole.direct ? 1 : 2,
      title: `Public source ${index + 1}`,
      publisher: 'Microsoft',
      publishedAt: sourceRole.association.publishedAt,
      speaker: sourceRole.direct ? 'Amy Hood' : null,
      sourceType: sourceRole.association.sourceType,
      collector: 'microsoft_ir',
      temporalRole: sourceRole.association.temporalRelation,
      rightsNote: 'Public official source preserved with provenance.',
      approvedPublicHost: true,
      collectionStatus: valid ? 'review_required' : 'discovered',
      rawPath,
      normalizedPath,
      sha256: valid ? sha256 : null,
      capturedAt: valid ? '2026-07-14T00:00:00.000Z' : null,
      failureReason: null,
    };
    sources.push(record);
    if (valid) {
      const { rawPath: ignoredRaw, normalizedPath: ignoredNormalized, failureReason, ...metadata } = record;
      void [ignoredRaw, ignoredNormalized, failureReason];
      await writeFile(path.join(advisorRoot, rawPath!), `${JSON.stringify({
        sourceId: id,
        canonicalUrl,
        requestedCanonicalUrl: canonicalUrl,
        finalUrl: canonicalUrl,
        redirectChain: [canonicalUrl],
        speakerSegments: sourceRole.direct ? [{
          speaker: 'Amy Hood',
          startChar: 0,
          endChar: sourceRole.association.evidenceLocator.exactQuote.length,
        }] : [],
        title: record.title,
        mediaType: 'text/plain',
        bodyBase64: Buffer.from(text).toString('base64'),
        metadata: { ...metadata, collectionStatus: 'collected' },
      }, null, 2)}\n`);
      await writeFile(path.join(advisorRoot, normalizedPath!), `${text.trim()}\n`);
    }
  }

  await writeFile(path.join(advisorRoot, 'source-registry.json'), `${JSON.stringify({ sources }, null, 2)}\n`);
};

test('happy: source CLI verifies 100 discoveries and 50 artifact-backed documents', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-sources-happy-'));
  const candidatePath = path.join(directory, 'data/b-track/amy-hood/advisor/event-candidates.json');

  try {
    await mkdir(path.dirname(candidatePath), { recursive: true });
    await writeFile(candidatePath, `${JSON.stringify(validCandidateMatrix(), null, 2)}\n`);
    await writeRegistryFixture(directory, { discoveries: 100, validDocuments: 60 });
    const result = runAdvisorCli(directory, 'sources:check');

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /100 discovered URLs/i);
    assert.match(result.stdout, /60 valid documents/i);

    const registry = JSON.parse(await readFile(
      path.join(directory, 'data/b-track/amy-hood/advisor/source-registry.json'),
      'utf8',
    )) as { sources: AdvisorSourceRecord[] };
    const normalizedPath = path.join(
      directory,
      'data/b-track/amy-hood/advisor',
      registry.sources[0].normalizedPath!,
    );
    const originalNormalized = await readFile(normalizedPath);
    const rawPath = path.join(
      directory,
      'data/b-track/amy-hood/advisor',
      registry.sources[0].rawPath!,
    );
    const originalRaw = await readFile(rawPath, 'utf8');
    const inventedRedirect = JSON.parse(originalRaw);
    inventedRedirect.canonicalUrl = 'https://www.microsoft.com/unrelated-same-host-path';
    await writeFile(rawPath, `${JSON.stringify(inventedRedirect, null, 2)}\n`);
    const inventedRedirectResult = runAdvisorCli(directory, 'sources:check');
    assert.equal(inventedRedirectResult.status, 1);
    assert.match(inventedRedirectResult.stderr, /59 valid documents/i);
    await writeFile(rawPath, originalRaw);

    await writeFile(
      normalizedPath,
      'Long but unrelated tampered normalized content. '.repeat(20),
    );
    const tampered = runAdvisorCli(directory, 'sources:check');
    assert.equal(tampered.status, 1);
    assert.match(tampered.stderr, /59 valid documents/i);

    const externalArtifact = path.join(directory, 'external-normalized.txt');
    await writeFile(externalArtifact, originalNormalized);
    await rm(normalizedPath);
    await symlink(externalArtifact, normalizedPath);
    const linked = runAdvisorCli(directory, 'sources:check');
    assert.equal(linked.status, 1);
    assert.match(linked.stderr, /59 valid documents/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('happy: two reviewed document families satisfy source coverage', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-source-families-happy-'));
  const candidatePath = path.join(directory, 'data/b-track/amy-hood/advisor/event-candidates.json');
  const candidates = validCandidateMatrix();
  for (const candidate of candidates) {
    candidate.sourceAssociations.forEach((association, index) => {
      association.documentFamilyId = `${candidate.id}-family-${index + 1}`;
    });
  }

  try {
    await mkdir(path.dirname(candidatePath), { recursive: true });
    await writeFile(candidatePath, `${JSON.stringify(candidates, null, 2)}\n`);
    await writeRegistryFixture(directory, { discoveries: 100, validDocuments: 60 }, candidates);

    const result = runAdvisorCli(directory, 'sources:check');
    assert.equal(result.status, 0, result.stderr);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('edge: an SEC mirror cannot create a second document family', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-source-family-mirror-'));
  const candidatePath = path.join(directory, 'data/b-track/amy-hood/advisor/event-candidates.json');
  const candidates = validCandidateMatrix();
  const candidate = candidates[0];
  candidate.sourceAssociations[0].documentFamilyId = 'microsoft-nuance-announcement-2021';
  candidate.sourceAssociations[1].documentFamilyId = 'microsoft-nuance-announcement-2021';

  try {
    await mkdir(path.dirname(candidatePath), { recursive: true });
    await writeFile(candidatePath, `${JSON.stringify(candidates, null, 2)}\n`);
    await writeRegistryFixture(directory, { discoveries: 100, validDocuments: 60 }, candidates);

    const result = runAdvisorCli(directory, 'sources:check');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /candidate-01 lacks a reviewed collected second document family/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('edge: translated variants of one announcement count as one family', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-source-family-translation-'));
  const candidatePath = path.join(directory, 'data/b-track/amy-hood/advisor/event-candidates.json');
  const candidates = validCandidateMatrix();
  const candidate = candidates[1];
  candidate.sourceAssociations[0].sourceType = 'official_announcement_es';
  candidate.sourceAssociations[1].sourceType = 'official_announcement_en';
  candidate.sourceAssociations[0].documentFamilyId = 'microsoft-mojang-announcement-2014';
  candidate.sourceAssociations[1].documentFamilyId = 'microsoft-mojang-announcement-2014';

  try {
    await mkdir(path.dirname(candidatePath), { recursive: true });
    await writeFile(candidatePath, `${JSON.stringify(candidates, null, 2)}\n`);
    await writeRegistryFixture(directory, { discoveries: 100, validDocuments: 60 }, candidates);

    const result = runAdvisorCli(directory, 'sources:check');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /candidate-02 lacks a reviewed collected second document family/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('edge: post-outcome evidence is retained but excluded from core families', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-source-family-outcome-'));
  const candidatePath = path.join(directory, 'data/b-track/amy-hood/advisor/event-candidates.json');
  const candidates = validCandidateMatrix();
  const candidate = candidates[2];
  candidate.sourceAssociations[0].documentFamilyId = 'project-falcon-3-decision';
  candidate.sourceAssociations[1].documentFamilyId = 'project-falcon-3-outcome';
  candidate.sourceAssociations[1].role = 'post_outcome';
  candidate.sourceAssociations[1].temporalRelation = 'post_outcome';
  candidate.sourceAssociations[1].publishedAt = '2099-01-01';

  try {
    await mkdir(path.dirname(candidatePath), { recursive: true });
    await writeFile(candidatePath, `${JSON.stringify(candidates, null, 2)}\n`);
    await writeRegistryFixture(directory, { discoveries: 100, validDocuments: 60 }, candidates);

    const result = runAdvisorCli(directory, 'sources:check');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /candidate-03 lacks a reviewed collected second document family/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: invalid document family identifiers fail candidate validation', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-source-family-invalid-'));
  const candidatePath = path.join(directory, 'data/b-track/amy-hood/advisor/event-candidates.json');
  const invalidIds = ['Nuance announcement', '', `a${'b'.repeat(64)}`];

  try {
    await mkdir(path.dirname(candidatePath), { recursive: true });
    for (const documentFamilyId of invalidIds) {
      const candidates = validCandidateMatrix();
      candidates[0].sourceAssociations[0].documentFamilyId = documentFamilyId;
      await writeFile(candidatePath, `${JSON.stringify(candidates, null, 2)}\n`);
      const result = runAdvisorCli(directory, 'candidates:check');
      assert.equal(result.status, 1);
      assert.match(result.stderr, /invalid document family ID/i);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: legacy raw provenance cannot invent an unobserved same-host redirect', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-legacy-redirect-'));
  const candidatePath = path.join(directory, 'data/b-track/amy-hood/advisor/event-candidates.json');

  try {
    await mkdir(path.dirname(candidatePath), { recursive: true });
    await writeFile(candidatePath, `${JSON.stringify(validCandidateMatrix(), null, 2)}\n`);
    await writeRegistryFixture(directory, { discoveries: 100, validDocuments: 60 });
    const registryPath = path.join(directory, 'data/b-track/amy-hood/advisor/source-registry.json');
    const registry = JSON.parse(await readFile(registryPath, 'utf8')) as {
      sources: AdvisorSourceRecord[];
    };
    const source = registry.sources[0];
    delete source.finalUrl;
    delete source.redirectChain;
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
    const rawPath = path.join(directory, 'data/b-track/amy-hood/advisor', source.rawPath!);
    const raw = JSON.parse(await readFile(rawPath, 'utf8'));
    delete raw.requestedCanonicalUrl;
    delete raw.finalUrl;
    delete raw.redirectChain;
    raw.canonicalUrl = 'https://www.microsoft.com/unobserved-legacy-path';
    await writeFile(rawPath, `${JSON.stringify(raw, null, 2)}\n`);

    const result = runAdvisorCli(directory, 'sources:check');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /59 valid documents/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: GitHub cannot be covered by unrelated earnings and SEC artifacts', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-unrelated-github-'));
  const candidatePath = path.join(directory, 'data/b-track/amy-hood/advisor/event-candidates.json');

  try {
    const candidates = validCandidateMatrix();
    candidates[0].workingTitle = 'GitHub acquisition authorization and transaction economics';
    candidates[0].eventFingerprint = {
      primaryEntity: 'GitHub',
      decisionAction: 'will acquire',
      eventSpecificIdentifier: '$7.5 billion',
      sourceUrls: [candidates[0].discoveryUrls[0]],
      reviewStatus: 'reviewed',
      reviewerNote: 'Reviewed against the official GitHub transaction announcement.',
    };
    for (const association of candidates[0].sourceAssociations) {
      association.relevanceClaim = 'This artifact is asserted to support the GitHub acquisition economics.';
      association.evidenceLocator.exactQuote = 'Microsoft will acquire GitHub for 7.5 billion dollars in stock';
      association.evidenceLocator.exactRelevancePassage =
        'Microsoft will acquire GitHub for 7.5 billion dollars in stock in a transaction valued at $7.5 billion';
      association.evidenceLocator.anchorTerms = ['GitHub', '7.5 billion'];
      association.evidenceLocator.eventDiscriminators = [
        { value: 'GitHub', kind: 'named_entity' },
        { value: 'will acquire', kind: 'decision_action' },
        { value: '$7.5 billion', kind: 'event_specific' },
      ];
    }
    await mkdir(path.dirname(candidatePath), { recursive: true });
    await writeFile(candidatePath, `${JSON.stringify(candidates, null, 2)}\n`);
    await writeRegistryFixture(directory, { discoveries: 100, validDocuments: 60 });

    const result = runAdvisorCli(directory, 'sources:check');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /candidate-01 lacks a reviewed event-relevant artifact/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: a generic Amy Hood mention is not a candidate-specific direct locator', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-generic-amy-'));
  const candidatePath = path.join(directory, 'data/b-track/amy-hood/advisor/event-candidates.json');

  try {
    const candidates = validCandidateMatrix();
    const direct = candidates[0].sourceAssociations[0];
    direct.relevanceClaim = 'Amy Hood is named, without a located GitHub transaction passage.';
    direct.evidenceLocator.exactQuote = 'Amy Hood decision evidence for Project Falcon 1 authorization decision and Falcon-1 approval';
    direct.evidenceLocator.anchorTerms = ['Amy Hood', 'decision evidence'];
    await mkdir(path.dirname(candidatePath), { recursive: true });
    await writeFile(candidatePath, `${JSON.stringify(candidates, null, 2)}\n`);
    await writeRegistryFixture(directory, { discoveries: 100, validDocuments: 60 });

    const result = runAdvisorCli(directory, 'sources:check');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /candidate-specific locator|direct Amy/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: another speaker quote near Amy Hood is not direct Amy evidence', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-wrong-speaker-'));
  const candidatePath = path.join(directory, 'data/b-track/amy-hood/advisor/event-candidates.json');

  try {
    const candidates = validCandidateMatrix();
    await mkdir(path.dirname(candidatePath), { recursive: true });
    await writeFile(candidatePath, `${JSON.stringify(candidates, null, 2)}\n`);
    await writeRegistryFixture(directory, { discoveries: 100, validDocuments: 60 });
    const registryPath = path.join(directory, 'data/b-track/amy-hood/advisor/source-registry.json');
    const registry = JSON.parse(await readFile(registryPath, 'utf8')) as {
      sources: AdvisorSourceRecord[];
    };
    const source = registry.sources.find(({ eventCandidateIds }) =>
      eventCandidateIds.includes('candidate-01'))!;
    const rawPath = path.join(directory, 'data/b-track/amy-hood/advisor', source.rawPath!);
    const raw = JSON.parse(await readFile(rawPath, 'utf8'));
    const text = Buffer.from(raw.bodyBase64, 'base64').toString('utf8');
    const quote = candidates[0].sourceAssociations[0].evidenceLocator.exactQuote;
    const quoteStart = text.indexOf(quote);
    raw.speakerSegments = [
      { speaker: 'Satya Nadella', startChar: quoteStart, endChar: quoteStart + quote.length },
      { speaker: 'Amy Hood', startChar: 0, endChar: 'Amy Hood'.length },
    ];
    await writeFile(rawPath, `${JSON.stringify(raw, null, 2)}\n`);

    const result = runAdvisorCli(directory, 'sources:check');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /candidate-specific direct Amy locator/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: a generic Amy quote cannot borrow a distant event-specific passage', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-distant-direct-'));
  const candidatePath = path.join(directory, 'data/b-track/amy-hood/advisor/event-candidates.json');
  const candidates = validCandidateMatrix();
  candidates[0].sourceAssociations[0].evidenceLocator.exactQuote =
    'Amy Hood expects disciplined execution and balanced growth';

  try {
    await mkdir(path.dirname(candidatePath), { recursive: true });
    await writeFile(candidatePath, `${JSON.stringify(candidates, null, 2)}\n`);
    await writeRegistryFixture(
      directory,
      { discoveries: 100, validDocuments: 60, separateDirectQuoteFromRelevance: true },
      candidates,
    );

    const result = runAdvisorCli(directory, 'sources:check');
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /direct Amy exact quote must be contained by its exact relevance passage|candidate-01 lacks a verified candidate-specific direct Amy locator/i,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: a casual GitHub mention beside an unrelated acquisition is not event relevance', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-github-casual-'));
  const candidatePath = path.join(directory, 'data/b-track/amy-hood/advisor/event-candidates.json');

  try {
    const candidates = validCandidateMatrix();
    candidates[0].workingTitle = 'GitHub acquisition authorization and transaction economics';
    candidates[0].eventFingerprint = {
      primaryEntity: 'GitHub',
      decisionAction: 'will acquire',
      eventSpecificIdentifier: '$7.5 billion',
      sourceUrls: [candidates[0].discoveryUrls[0]],
      reviewStatus: 'reviewed',
      reviewerNote: 'Reviewed against the official GitHub transaction announcement.',
    };
    const artifactCandidates = structuredClone(candidates);
    artifactCandidates[0].workingTitle = 'GitHub mention before the Fabrikam acquisition authorization';
    for (const [associationIndex, association] of candidates[0].sourceAssociations.entries()) {
      const unrelatedQuote = `${associationIndex === 0 ? 'Amy Hood ' : ''}decision evidence for ${artifactCandidates[0].workingTitle}`;
      association.relevanceClaim = 'The reviewed locator must distinguish the GitHub transaction from other acquisition news.';
      association.evidenceLocator.exactQuote = unrelatedQuote;
      association.evidenceLocator.exactRelevancePassage =
        `${unrelatedQuote}. Microsoft will acquire GitHub for $7.5 billion`;
      association.evidenceLocator.anchorTerms = ['GitHub', 'acquisition'];
      (association.evidenceLocator as typeof association.evidenceLocator & {
        eventDiscriminators: Array<{ value: string; kind: string }>;
      }).eventDiscriminators = [
        { value: 'GitHub', kind: 'named_entity' },
        { value: 'will acquire', kind: 'decision_action' },
        { value: '$7.5 billion', kind: 'event_specific' },
      ];
    }
    for (const [associationIndex, association] of artifactCandidates[0].sourceAssociations.entries()) {
      const unrelatedQuote = `${associationIndex === 0 ? 'Amy Hood ' : ''}decision evidence for ${artifactCandidates[0].workingTitle}`;
      association.evidenceLocator.exactQuote = unrelatedQuote;
      association.evidenceLocator.exactRelevancePassage = unrelatedQuote;
      association.evidenceLocator.anchorTerms = ['GitHub', 'acquisition'];
    }
    await mkdir(path.dirname(candidatePath), { recursive: true });
    await writeFile(candidatePath, `${JSON.stringify(candidates, null, 2)}\n`);
    await writeRegistryFixture(
      directory,
      { discoveries: 100, validDocuments: 60 },
      artifactCandidates,
    );

    const result = runAdvisorCli(directory, 'sources:check');
    assert.equal(result.status, 1);
    assert.match(result.stderr, /candidate-01 lacks a reviewed event-relevant artifact/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('failure: source CLI reports exact deficits and rejects unsafe command inputs', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-sources-failure-'));
  const candidatePath = path.join(directory, 'data/b-track/amy-hood/advisor/event-candidates.json');
  const invalidImport = path.join(directory, 'invalid-import.json');
  const unregisteredImport = path.join(directory, 'unregistered-import.json');

  try {
    await mkdir(path.dirname(candidatePath), { recursive: true });
    await writeFile(candidatePath, `${JSON.stringify(validCandidateMatrix(), null, 2)}\n`);
    await writeRegistryFixture(directory, { discoveries: 99, validDocuments: 0 });
    await writeFile(invalidImport, '{ invalid JSON');
    const importText = `Amy Hood: ${'Reviewed public decision context. '.repeat(12)}`;
    const unregisteredPayload = {
      canonicalUrl: 'https://www.microsoft.com/unregistered-decision-source',
      title: 'Unregistered public source',
      publisher: 'Microsoft',
      publishedAt: '2010-01-01',
      speaker: 'Amy Hood',
      eventCandidateIds: ['candidate-01'],
      tier: 1 as const,
      rightsNote: 'Public source reviewed for lawful project use.',
      text: importText,
      expectedSha256: createHash('sha256').update(importText).digest('hex'),
      reviewer: 'Test Reviewer',
      reviewedAt: '2026-07-14T00:00:00.000Z',
    };
    await writeFile(unregisteredImport, JSON.stringify(unregisteredPayload));
    const registryPath = path.join(directory, 'data/b-track/amy-hood/advisor/source-registry.json');
    const registry = JSON.parse(await readFile(registryPath, 'utf8')) as { sources: AdvisorSourceRecord[] };
    registry.sources = registry.sources.map((source) => source.eventCandidateIds.includes('candidate-01')
      ? { ...source, speaker: null }
      : source);
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

    const check = runAdvisorCli(directory, 'sources:check');
    assert.equal(check.status, 1);
    assert.match(check.stderr, /1 discovered URL below minimum/i);
    assert.match(check.stderr, /50 valid documents below minimum/i);
    assert.match(check.stderr, /candidate-01 lacks a verified candidate-specific direct Amy locator/i);

    const collect = runAdvisorCli(directory, 'source:collect', '--id', 'source-missing');
    assert.equal(collect.status, 1);
    assert.match(collect.stderr, /unknown advisor source: source-missing/i);

    const importResult = runAdvisorCli(directory, 'source:import', '--file', invalidImport);
    assert.equal(importResult.status, 1);
    assert.match(importResult.stderr, /invalid import JSON/i);

    const beforeRegistry = await readFile(registryPath, 'utf8');
    const unregistered = runAdvisorCli(directory, 'source:import', '--file', unregisteredImport);
    assert.equal(unregistered.status, 1);
    assert.match(unregistered.stderr, /canonical URL is not registered/i);
    assert.equal(await readFile(registryPath, 'utf8'), beforeRegistry);
    assert.deepEqual(await readdir(path.join(directory, 'data/b-track/amy-hood/advisor/raw')), []);

    await assert.rejects(
      () => importReviewedSourceReal(unregisteredPayload, directory),
      /canonical URL is not registered/i,
    );
    assert.equal(await readFile(registryPath, 'utf8'), beforeRegistry);
    assert.deepEqual(await readdir(path.join(directory, 'data/b-track/amy-hood/advisor/raw')), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
