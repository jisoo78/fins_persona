/**
 * Test Plan:
 * 1. Happy Path:
 *    - an exact bounded Amy Hood passage verifies against immutable artifacts.
 *
 * 2. Edge Cases:
 *    - canonical wording verifies without aliases.
 *    - one review-required source does not block an independent valid review.
 *    - an identical manifest verifies repeatedly without changing artifacts.
 *
 * 3. Failure Path:
 *    - hash mismatch, another-speaker offsets, distant event context, unreviewed
 *      aliases, overlapping offsets, and malformed manifests fail before writes.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { advisorPaths } from '../server/decisionAdvisor/paths';
import {
  validateDirectEvidenceReviewManifest,
  verifyDirectEvidenceReview,
  type DirectEvidenceReviewManifest,
} from '../server/decisionAdvisor/directEvidenceReview';
import { normalizeDocument } from '../server/decisionAdvisor/officialSourceCollector';
import { sourceIdForUrl } from '../server/decisionAdvisor/sourceRegistry';
import type { AdvisorRawSource, AdvisorSourceRecord, EventCandidate } from '../shared/amyHoodDecisionAdvisor';

const canonicalUrl = 'https://news.microsoft.com/speeches/example-transaction-call/';
const candidateId = 'candidate-example-acquisition-2020';

const fixture = async (canonicalWording = false) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'advisor-direct-review-'));
  const prefix = 'Transaction call introduction and participant information. ';
  const action = canonicalWording ? 'will acquire' : 'agreed to acquire';
  const passage = `Amy Hood explained that we ${action} Contoso for $26 billion and would finance the transaction with new debt while expecting durable revenue growth and cost synergies.`;
  const suffix = ' Closing information and legal notices follow this reviewed statement. '.repeat(3);
  const bodyText = `${prefix}${passage}${suffix}`;
  const normalized = normalizeDocument(bodyText, 'text/plain');
  const body = Buffer.from(bodyText);
  const sha256 = createHash('sha256').update(body).digest('hex');
  const sourceId = sourceIdForUrl(canonicalUrl);
  const speakerSegmentStart = normalized.indexOf(passage);
  const speakerSegmentEnd = speakerSegmentStart + passage.length;
  const quote = `we ${action} Contoso for $26 billion and would finance the transaction with new debt`;
  const quoteStart = normalized.indexOf(quote);
  const rawPath = `raw/${sourceId}-${sha256}.json`;
  const normalizedPath = `normalized/${sourceId}-${sha256}.txt`;
  const source: AdvisorSourceRecord = {
    id: sourceId,
    canonicalUrl,
    finalUrl: canonicalUrl,
    redirectChain: [canonicalUrl],
    eventCandidateIds: [candidateId],
    tier: 1,
    title: 'Example transaction call',
    publisher: 'Microsoft',
    publishedAt: '2020-01-02',
    speaker: null,
    sourceType: 'official_transcript',
    collector: 'microsoft_source',
    temporalRole: 'decision_time',
    rightsNote: 'Public first-party source reviewed for direct evidence.',
    approvedPublicHost: false,
    collectionStatus: 'review_required',
    rawPath,
    normalizedPath,
    sha256,
    capturedAt: '2026-07-15T00:00:00.000Z',
    failureReason: null,
  };
  const candidate: EventCandidate = {
    id: candidateId,
    workingTitle: 'Contoso acquisition decision',
    domain: 'm_and_a',
    decisionWindowStart: '2020-01-02',
    decisionWindowEnd: '2020-01-02',
    discoveryUrls: [canonicalUrl],
    decisionWindowBasis: {
      summary: 'The dated transaction call defines the public decision disclosure date.',
      sourceUrls: [canonicalUrl],
      reviewerNote: 'Reviewed against the official transaction call date.',
    },
    eventFingerprint: {
      primaryEntity: 'Contoso',
      decisionAction: 'will acquire',
      eventSpecificIdentifier: '$26 billion',
      sourceUrls: [canonicalUrl],
      reviewStatus: 'reviewed',
      reviewerNote: 'Reviewed against the official acquisition announcement.',
    },
    sourceAssociations: [{
      canonicalUrl,
      role: 'direct_amy',
      sourceType: 'official_transcript',
      publishedAt: '2020-01-02',
      temporalRelation: 'decision_time',
      relevanceClaim: 'The transaction call contains event-specific Amy Hood financial reasoning.',
      evidenceLocator: null,
      reviewStatus: 'unreviewed',
      reviewerNote: 'The source is collected and awaits exact evidence review.',
    }],
    directEvidenceGap: {
      reviewStatus: 'reviewed',
      reason: 'No exact event-specific Amy Hood locator has been approved yet.',
      reviewerNote: 'The source remains pending strict direct evidence review.',
    },
    phase3Status: 'evidence_gap',
    notes: 'Fixture candidate for direct evidence review.',
    status: 'approved_for_collection',
  };
  const raw: AdvisorRawSource = {
    sourceId,
    canonicalUrl,
    requestedCanonicalUrl: canonicalUrl,
    finalUrl: canonicalUrl,
    redirectChain: [canonicalUrl],
    speakerSegments: [{ speaker: 'Amy Hood', startChar: speakerSegmentStart, endChar: speakerSegmentEnd }],
    title: source.title,
    mediaType: 'text/plain',
    bodyBase64: body.toString('base64'),
    metadata: source,
  };
  const manifest: DirectEvidenceReviewManifest = {
    reviewId: 'review-example-direct-v1',
    reviewer: 'Codex evidence review',
    reviewedAt: '2026-07-15T12:00:00.000Z',
    decision: 'approved_direct',
    sourceId,
    canonicalUrl,
    rawPath,
    normalizedPath,
    sha256,
    candidateId,
    temporalRelation: 'decision_time',
    speaker: 'Amy Hood',
    speakerSegmentStart,
    speakerSegmentEnd,
    quoteStart,
    quoteEnd: quoteStart + quote.length,
    passageStart: speakerSegmentStart,
    passageEnd: speakerSegmentEnd,
    exactQuote: quote,
    exactRelevancePassage: passage,
    anchorTerms: ['Contoso', '$26 billion', 'new debt'],
    eventDiscriminators: [
      { kind: 'named_entity', value: 'Contoso' },
      { kind: 'decision_action', value: action },
      { kind: 'event_specific', value: '$26 billion' },
    ],
    aliases: canonicalWording ? [] : [{
      kind: 'decision_action',
      canonicalValue: 'will acquire',
      value: 'agreed to acquire',
      sourceUrl: canonicalUrl,
      reviewStatus: 'reviewed',
      reviewerNote: 'The exact Amy Hood wording identifies the same acquisition action.',
    }],
    financialSignals: ['new debt financing', 'durable revenue growth', 'cost synergies'],
    reviewerRationale: 'The bounded Amy Hood turn identifies the transaction and explains financing and expected returns.',
  };

  const paths = advisorPaths(root);
  await mkdir(path.dirname(paths.registry), { recursive: true });
  await mkdir(path.join(paths.root, 'raw'), { recursive: true });
  await mkdir(path.join(paths.root, 'normalized'), { recursive: true });
  await writeFile(paths.registry, `${JSON.stringify({ sources: [source] }, null, 2)}\n`);
  await writeFile(path.join(paths.root, 'event-candidates.json'), `${JSON.stringify([candidate], null, 2)}\n`);
  await writeFile(path.join(paths.root, rawPath), `${JSON.stringify(raw, null, 2)}\n`);
  await writeFile(path.join(paths.root, normalizedPath), normalized);
  return { root, manifest, rawPath, normalizedPath };
};

test('happy: exact bounded Amy Hood evidence verifies against immutable artifacts', async () => {
  const item = await fixture();
  try {
    const verified = await verifyDirectEvidenceReview(item.root, item.manifest);
    assert.equal(verified.segment.speaker, 'Amy Hood');
    assert.equal(verified.normalized.slice(item.manifest.quoteStart, item.manifest.quoteEnd), item.manifest.exactQuote);
    assert.equal(verified.normalized.slice(item.manifest.passageStart, item.manifest.passageEnd), item.manifest.exactRelevancePassage);
  } finally {
    await rm(item.root, { recursive: true, force: true });
  }
});

test('edge: canonical event wording verifies without aliases', async () => {
  const item = await fixture(true);
  try {
    assert.equal((await verifyDirectEvidenceReview(item.root, item.manifest)).manifest.aliases.length, 0);
  } finally {
    await rm(item.root, { recursive: true, force: true });
  }
});

test('edge: one review-required source does not block an independent valid review', async () => {
  const item = await fixture();
  try {
    const registryPath = advisorPaths(item.root).registry;
    const registry = JSON.parse(await readFile(registryPath, 'utf8'));
    registry.sources.push({
      ...registry.sources[0],
      id: sourceIdForUrl('https://news.microsoft.com/speeches/other-call/'),
      canonicalUrl: 'https://news.microsoft.com/speeches/other-call/',
      finalUrl: 'https://news.microsoft.com/speeches/other-call/',
      redirectChain: ['https://news.microsoft.com/speeches/other-call/'],
      rawPath: null,
      normalizedPath: null,
      sha256: null,
      capturedAt: null,
    });
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
    assert.equal((await verifyDirectEvidenceReview(item.root, item.manifest)).source.id, item.manifest.sourceId);
  } finally {
    await rm(item.root, { recursive: true, force: true });
  }
});

test('edge: identical manifests verify repeatedly without artifact changes', async () => {
  const item = await fixture();
  try {
    const before = await readFile(path.join(advisorPaths(item.root).root, item.rawPath));
    await verifyDirectEvidenceReview(item.root, item.manifest);
    await verifyDirectEvidenceReview(item.root, structuredClone(item.manifest));
    assert.deepEqual(await readFile(path.join(advisorPaths(item.root).root, item.rawPath)), before);
  } finally {
    await rm(item.root, { recursive: true, force: true });
  }
});

test('failure: invalid manifests and evidence boundaries fail before persistence', async (t) => {
  const cases: Array<[string, (manifest: DirectEvidenceReviewManifest) => void, RegExp]> = [
    ['hash mismatch', (manifest) => { manifest.sha256 = '0'.repeat(64); }, /registry source|hash mismatch/i],
    ['distant context', (manifest) => { manifest.eventDiscriminators[0].value = 'Fabrikam'; }, /discriminator/i],
    ['unreviewed alias', (manifest) => { manifest.aliases[0].reviewStatus = 'unreviewed' as 'reviewed'; }, /alias/i],
    ['overlapping offsets', (manifest) => { manifest.quoteEnd = manifest.passageEnd + 1; }, /offset/i],
  ];
  for (const [name, mutate, pattern] of cases) {
    await t.test(name, async () => {
      const item = await fixture();
      try {
        mutate(item.manifest);
        const before = await readFile(path.join(advisorPaths(item.root).root, item.rawPath));
        await assert.rejects(() => verifyDirectEvidenceReview(item.root, item.manifest), pattern);
        assert.deepEqual(await readFile(path.join(advisorPaths(item.root).root, item.rawPath)), before);
      } finally {
        await rm(item.root, { recursive: true, force: true });
      }
    });
  }
  await t.test('another speaker', async () => {
    const item = await fixture();
    try {
      const rawFile = path.join(advisorPaths(item.root).root, item.rawPath);
      const raw = JSON.parse(await readFile(rawFile, 'utf8'));
      raw.speakerSegments[0].speaker = 'Satya Nadella';
      await writeFile(rawFile, `${JSON.stringify(raw, null, 2)}\n`);
      await assert.rejects(
        () => verifyDirectEvidenceReview(item.root, item.manifest),
        /speaker segment/i,
      );
    } finally {
      await rm(item.root, { recursive: true, force: true });
    }
  });
  assert.throws(
    () => validateDirectEvidenceReviewManifest({ reviewId: '' }),
    /manifest/i,
  );
});
