/**
 * Test Plan:
 * 1. Happy Path:
 *    - a decision-time supporting passage verifies and applies to one event.
 *
 * 2. Edge Cases:
 *    - a same-family mirror applies without creating another family identity.
 *    - a post-outcome review persists with role post_outcome.
 *    - reapplying an identical manifest is idempotent.
 *
 * 3. Failure Path:
 *    - hash mismatch, wrong candidate, invalid offsets, temporal mismatch,
 *      direct-Amy role, and registry failure fail without partial writes.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { advisorPaths } from '../server/decisionAdvisor/paths';
import {
  applySupportingEvidenceReview,
  verifySupportingEvidenceReview,
  type SupportingEvidenceReviewManifest,
} from '../server/decisionAdvisor/supportingEvidenceReview';
import { normalizeDocument } from '../server/decisionAdvisor/officialSourceCollector';
import { sourceIdForUrl } from '../server/decisionAdvisor/sourceRegistry';
import type {
  AdvisorRawSource,
  AdvisorSourceRecord,
  EventCandidate,
} from '../shared/amyHoodDecisionAdvisor';

const canonicalUrl = 'https://www.sec.gov/Archives/example/exhibit-99.htm';
const sameDocumentUrl = 'https://news.microsoft.com/source/example-acquisition/';

const fixture = async (
  options: {
    temporalRelation?: 'decision_time' | 'post_outcome';
    fullCandidateMatrix?: boolean;
  } = {},
) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'advisor-support-review-'));
  const temporalRelation = options.temporalRelation ?? 'decision_time';
  const publishedAt = temporalRelation === 'post_outcome' ? '2021-04-15' : '2021-04-12';
  const candidateId = 'candidate-nuance-acquisition-2021';
  const passage = 'Microsoft will acquire Nuance in an all-cash transaction valued at $19.7 billion, inclusive of net debt, while expecting less than one percent dilution before earnings accretion.';
  const prefix = 'Reviewed transaction exhibit. ';
  const suffix = ' Additional public transaction conditions and risk factors.'.repeat(5);
  const bodyText = prefix + passage + suffix;
  const normalized = normalizeDocument(bodyText, 'text/plain');
  const body = Buffer.from(bodyText);
  const sha256 = createHash('sha256').update(body).digest('hex');
  const sourceId = sourceIdForUrl(canonicalUrl);
  const passageStart = normalized.indexOf(passage);
  const quote = 'Microsoft will acquire Nuance in an all-cash transaction valued at $19.7 billion';
  const quoteStart = normalized.indexOf(quote);
  const rawPath = 'raw/' + sourceId + '-' + sha256 + '.json';
  const normalizedPath = 'normalized/' + sourceId + '-' + sha256 + '.txt';

  const source: AdvisorSourceRecord = {
    id: sourceId,
    canonicalUrl,
    finalUrl: canonicalUrl,
    redirectChain: [canonicalUrl],
    eventCandidateIds: [candidateId],
    tier: 1,
    title: 'Nuance transaction exhibit',
    publisher: 'Microsoft / Nuance / SEC',
    publishedAt,
    speaker: null,
    sourceType: 'sec_press_release',
    collector: 'sec_edgar',
    temporalRole: temporalRelation,
    rightsNote: 'Public SEC exhibit reviewed for event context.',
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
    workingTitle: 'Nuance healthcare cloud acquisition for 19.7 billion dollars',
    domain: 'm_and_a',
    decisionWindowStart: '2021-04-12',
    decisionWindowEnd: '2021-04-12',
    discoveryUrls: [sameDocumentUrl, canonicalUrl],
    decisionWindowBasis: {
      summary: 'The official announcement defines the public transaction decision date.',
      sourceUrls: [sameDocumentUrl],
      reviewerNote: 'Reviewed against the dated Microsoft announcement.',
    },
    eventFingerprint: {
      primaryEntity: 'Nuance',
      decisionAction: 'will acquire',
      eventSpecificIdentifier: '$19.7 billion',
      sourceUrls: [sameDocumentUrl],
      reviewStatus: 'reviewed',
      reviewerNote: 'Reviewed against the official acquisition announcement.',
    },
    sourceAssociations: [{
      canonicalUrl: sameDocumentUrl,
      role: 'contemporaneous_context',
      sourceType: 'official_announcement',
      publishedAt: '2021-04-12',
      temporalRelation: 'decision_time',
      relevanceClaim: 'The official announcement identifies the Nuance transaction.',
      evidenceLocator: {
        exactQuote: 'Microsoft will acquire Nuance for $19.7 billion.',
        exactRelevancePassage: 'Microsoft will acquire Nuance for $19.7 billion.',
        anchorTerms: ['Nuance', '$19.7 billion'],
        eventDiscriminators: [
          { kind: 'named_entity', value: 'Nuance' },
          { kind: 'decision_action', value: 'will acquire' },
          { kind: 'event_specific', value: '$19.7 billion' },
        ],
        speaker: null,
      },
      reviewStatus: 'reviewed',
      reviewerNote: 'The official source passage was reviewed.',
    }, {
      canonicalUrl,
      role: temporalRelation === 'post_outcome'
        ? 'post_outcome'
        : 'contemporaneous_context',
      sourceType: 'sec_press_release',
      publishedAt,
      temporalRelation,
      relevanceClaim: 'The collected SEC exhibit awaits supporting review.',
      evidenceLocator: null,
      reviewStatus: 'unreviewed',
      reviewerNote: 'The artifact requires exact review.',
    }],
    directEvidenceGap: {
      reviewStatus: 'reviewed',
      reason: 'No event-specific Amy Hood passage has been approved for this event.',
      reviewerNote: 'Direct evidence remains a separate review requirement.',
    },
    phase3Status: 'evidence_gap',
    notes: 'Supporting evidence fixture.',
    status: 'approved_for_collection',
  };
  const raw: AdvisorRawSource = {
    sourceId,
    canonicalUrl,
    requestedCanonicalUrl: canonicalUrl,
    finalUrl: canonicalUrl,
    redirectChain: [canonicalUrl],
    speakerSegments: [],
    title: source.title,
    mediaType: 'text/plain',
    bodyBase64: body.toString('base64'),
    metadata: source,
  };
  const decision = temporalRelation === 'post_outcome'
    ? 'approved_post_outcome'
    : 'approved_context';
  const manifest: SupportingEvidenceReviewManifest = {
    reviewId: 'review-nuance-support-v1',
    reviewer: 'Codex evidence review',
    reviewedAt: '2026-07-15T12:00:00.000Z',
    decision,
    reasonCode: temporalRelation === 'post_outcome'
      ? 'verified_post_outcome'
      : 'duplicate_document_family',
    sourceId,
    canonicalUrl,
    rawPath,
    normalizedPath,
    sha256,
    candidateId,
    sourceType: source.sourceType,
    documentFamilyId: temporalRelation === 'post_outcome'
      ? 'microsoft-nuance-outcome-2021'
      : 'microsoft-nuance-announcement-2021',
    sameDocumentCanonicalUrls: temporalRelation === 'post_outcome'
      ? [canonicalUrl]
      : [sameDocumentUrl, canonicalUrl],
    temporalRelation,
    role: temporalRelation === 'post_outcome'
      ? 'post_outcome'
      : 'contemporaneous_context',
    quoteStart,
    quoteEnd: quoteStart + quote.length,
    passageStart,
    passageEnd: passageStart + passage.length,
    exactQuote: quote,
    exactRelevancePassage: passage,
    anchorTerms: ['Nuance', '$19.7 billion', 'all-cash'],
    eventDiscriminators: [
      { kind: 'named_entity', value: 'Nuance' },
      { kind: 'decision_action', value: 'will acquire' },
      { kind: 'event_specific', value: '$19.7 billion' },
    ],
    aliases: [],
    reviewerRationale: 'The immutable SEC exhibit contains the exact event identity, transaction value, financing form, and expected dilution profile.',
  };

  const paths = advisorPaths(root);
  await mkdir(path.join(paths.root, 'raw'), { recursive: true });
  await mkdir(path.join(paths.root, 'normalized'), { recursive: true });
  await writeFile(paths.registry, JSON.stringify({ sources: [source] }, null, 2) + '\n');
  const candidates = [candidate];
  if (options.fullCandidateMatrix) {
    const scopedIds = [
      'candidate-nokia-acquisition-2013',
      'candidate-mojang-acquisition-2014',
      'candidate-github-acquisition-2018',
    ];
    const domains = [
      'm_and_a',
      'ai_cloud_capex',
      'pricing_monetization',
      'cost_efficiency',
      'shareholder_return_risk',
    ] as const;
    for (let index = 1; index < 30; index += 1) {
      const number = index + 1;
      const url = `https://news.microsoft.com/source/2020/01/02/project-batch-${number}/`;
      candidates.push({
        ...structuredClone(candidate),
        id: scopedIds[index - 1] ?? `candidate-batch-${number}`,
        workingTitle: `Project Batch ${number} authorization decision`,
        domain: domains[index % domains.length],
        discoveryUrls: [url],
        decisionWindowStart: '2020-01-02',
        decisionWindowEnd: '2020-01-02',
        decisionWindowBasis: {
          summary: `The Project Batch ${number} announcement defines the public decision date.`,
          sourceUrls: [url],
          reviewerNote: 'Reviewed against the dated official announcement.',
        },
        eventFingerprint: {
          primaryEntity: `Project Batch ${number}`,
          decisionAction: 'authorization',
          eventSpecificIdentifier: `Batch-${number} approval`,
          sourceUrls: [url],
          reviewStatus: 'reviewed',
          reviewerNote: 'Reviewed against the official authorization announcement.',
        },
        sourceAssociations: [{
          canonicalUrl: url,
          role: 'contemporaneous_context',
          sourceType: 'official_announcement',
          publishedAt: '2020-01-02',
          temporalRelation: 'decision_time',
          relevanceClaim: `The source identifies Project Batch ${number} authorization.`,
          evidenceLocator: {
            exactQuote: `Project Batch ${number} authorization under Batch-${number} approval.`,
            exactRelevancePassage: `Project Batch ${number} authorization under Batch-${number} approval.`,
            anchorTerms: [`Project Batch ${number}`, `Batch-${number} approval`],
            eventDiscriminators: [
              { kind: 'named_entity', value: `Project Batch ${number}` },
              { kind: 'decision_action', value: 'authorization' },
              { kind: 'event_specific', value: `Batch-${number} approval` },
            ],
            speaker: null,
          },
          reviewStatus: 'reviewed',
          reviewerNote: 'The exact official passage was reviewed.',
        }],
        directEvidenceGap: {
          reviewStatus: 'reviewed',
          reason: 'No event-specific Amy Hood passage has been collected for this candidate.',
          reviewerNote: 'The candidate remains pending direct evidence review.',
        },
        phase3Status: 'evidence_gap',
      });
    }
  }
  await writeFile(
    path.join(paths.root, 'event-candidates.json'),
    JSON.stringify(candidates, null, 2) + '\n',
  );
  await writeFile(path.join(paths.root, rawPath), JSON.stringify(raw, null, 2) + '\n');
  await writeFile(path.join(paths.root, normalizedPath), normalized);
  return { root, manifest, candidateId, sourceId };
};

const runAdvisorCli = (root: string, ...args: string[]) => spawnSync(
  process.execPath,
  ['--import', 'tsx', 'server/runAmyHoodDecisionAdvisor.ts', ...args, '--root', root],
  { cwd: path.resolve(import.meta.dirname, '..'), encoding: 'utf8' },
);

test('happy: decision-time supporting evidence verifies and applies', async () => {
  const item = await fixture();
  try {
    const verified = await verifySupportingEvidenceReview(item.root, item.manifest);
    assert.equal(
      verified.normalized.slice(item.manifest.passageStart, item.manifest.passageEnd),
      item.manifest.exactRelevancePassage,
    );

    const result = await applySupportingEvidenceReview(item.root, item.manifest, {
      validateCandidates: () => undefined,
    });
    assert.equal(result.changed, true);
    const candidates = JSON.parse(await readFile(
      path.join(advisorPaths(item.root).root, 'event-candidates.json'),
      'utf8',
    )) as EventCandidate[];
    const candidate = candidates[0];
    const association = candidate.sourceAssociations[1];
    assert.equal(association.reviewStatus, 'reviewed');
    assert.equal(association.documentFamilyId, 'microsoft-nuance-announcement-2021');
    assert.equal(candidate.directEvidenceGap?.reviewStatus, 'reviewed');
    assert.equal(candidate.phase3Status, 'evidence_gap');
  } finally {
    await rm(item.root, { recursive: true, force: true });
  }
});

test('edge: same-family mirror applies one family identity to both associations', async () => {
  const item = await fixture();
  try {
    await applySupportingEvidenceReview(item.root, item.manifest, {
      validateCandidates: () => undefined,
    });
    const [candidate] = JSON.parse(await readFile(
      path.join(advisorPaths(item.root).root, 'event-candidates.json'),
      'utf8',
    )) as EventCandidate[];
    assert.deepEqual(
      candidate.sourceAssociations.map((association) => association.documentFamilyId),
      ['microsoft-nuance-announcement-2021', 'microsoft-nuance-announcement-2021'],
    );
  } finally {
    await rm(item.root, { recursive: true, force: true });
  }
});

test('edge: post-outcome review persists only as post-outcome evidence', async () => {
  const item = await fixture({ temporalRelation: 'post_outcome' });
  try {
    await applySupportingEvidenceReview(item.root, item.manifest, {
      validateCandidates: () => undefined,
    });
    const [candidate] = JSON.parse(await readFile(
      path.join(advisorPaths(item.root).root, 'event-candidates.json'),
      'utf8',
    )) as EventCandidate[];
    assert.equal(candidate.sourceAssociations[1].role, 'post_outcome');
    assert.equal(candidate.sourceAssociations[1].temporalRelation, 'post_outcome');
    assert.equal(candidate.directEvidenceGap?.reviewStatus, 'reviewed');
  } finally {
    await rm(item.root, { recursive: true, force: true });
  }
});

test('edge: identical supporting review is idempotent', async () => {
  const item = await fixture();
  try {
    await applySupportingEvidenceReview(item.root, item.manifest, {
      validateCandidates: () => undefined,
    });
    const candidatesBefore = await readFile(
      path.join(advisorPaths(item.root).root, 'event-candidates.json'),
    );
    const registryBefore = await readFile(advisorPaths(item.root).registry);
    const result = await applySupportingEvidenceReview(
      item.root,
      structuredClone(item.manifest),
      { validateCandidates: () => undefined },
    );
    assert.equal(result.changed, false);
    assert.deepEqual(await readFile(
      path.join(advisorPaths(item.root).root, 'event-candidates.json'),
    ), candidatesBefore);
    assert.deepEqual(await readFile(advisorPaths(item.root).registry), registryBefore);
  } finally {
    await rm(item.root, { recursive: true, force: true });
  }
});

test('failure: invalid review identity and evidence fail before writes', async (t) => {
  const cases: Array<[
    string,
    (manifest: SupportingEvidenceReviewManifest) => void,
    RegExp,
  ]> = [
    ['hash mismatch', (manifest) => { manifest.sha256 = '0'.repeat(64); }, /registry source|hash mismatch/i],
    ['wrong candidate', (manifest) => { manifest.candidateId = 'candidate-other'; }, /registry source|candidate/i],
    ['invalid offsets', (manifest) => { manifest.quoteEnd = manifest.passageEnd + 1; }, /offset/i],
    ['temporal mismatch', (manifest) => { manifest.temporalRelation = 'pre_decision'; }, /temporal|registry source/i],
    ['direct role', (manifest) => {
      manifest.role = 'direct_amy' as SupportingEvidenceReviewManifest['role'];
    }, /role|direct/i],
  ];

  for (const [name, mutate, pattern] of cases) {
    await t.test(name, async () => {
      const item = await fixture();
      try {
        const candidatesBefore = await readFile(
          path.join(advisorPaths(item.root).root, 'event-candidates.json'),
        );
        mutate(item.manifest);
        await assert.rejects(
          () => verifySupportingEvidenceReview(item.root, item.manifest),
          pattern,
        );
        assert.deepEqual(await readFile(
          path.join(advisorPaths(item.root).root, 'event-candidates.json'),
        ), candidatesBefore);
      } finally {
        await rm(item.root, { recursive: true, force: true });
      }
    });
  }

  await t.test('registry failure compensates candidate state', async () => {
    const item = await fixture();
    try {
      const candidatePath = path.join(advisorPaths(item.root).root, 'event-candidates.json');
      const candidatesBefore = await readFile(candidatePath);
      const registryBefore = await readFile(advisorPaths(item.root).registry);
      await assert.rejects(
        () => applySupportingEvidenceReview(item.root, item.manifest, {
          validateCandidates: () => undefined,
          approveSource: async () => { throw new Error('injected registry failure'); },
        }),
        /injected registry failure/i,
      );
      assert.deepEqual(await readFile(candidatePath), candidatesBefore);
      assert.deepEqual(await readFile(advisorPaths(item.root).registry), registryBefore);
    } finally {
      await rm(item.root, { recursive: true, force: true });
    }
  });
});

test('happy: support CLI checks and applies one valid manifest', async () => {
  const item = await fixture({ fullCandidateMatrix: true });
  try {
    const manifestPath = path.join(item.root, 'support-review.json');
    await writeFile(manifestPath, JSON.stringify(item.manifest, null, 2) + '\n');

    const checked = runAdvisorCli(item.root, 'support:check', '--file', manifestPath);
    assert.equal(checked.status, 0, checked.stderr);
    assert.match(checked.stdout, /supporting review valid/i);

    const applied = runAdvisorCli(item.root, 'support:apply', '--file', manifestPath);
    assert.equal(applied.status, 0, applied.stderr);
    assert.match(applied.stdout, /supporting review applied/i);

    const batch = runAdvisorCli(item.root, 'support:batch');
    assert.equal(batch.status, 0, batch.stderr);
    const output = JSON.parse(batch.stdout) as Record<string, { outcome: string }>;
    assert.deepEqual(Object.keys(output).sort(), [
      'candidate-github-acquisition-2018',
      'candidate-mojang-acquisition-2014',
      'candidate-nokia-acquisition-2013',
      'candidate-nuance-acquisition-2021',
    ]);
    assert.equal(output['candidate-nuance-acquisition-2021'].outcome, 'partial');
    assert.equal(output['candidate-github-acquisition-2018'].outcome, 'blocked');
  } finally {
    await rm(item.root, { recursive: true, force: true });
  }
});

test('failure: support CLI rejects missing and malformed manifests', async () => {
  const item = await fixture({ fullCandidateMatrix: true });
  try {
    const missing = runAdvisorCli(item.root, 'support:check');
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /requires --file/i);

    const malformedPath = path.join(item.root, 'malformed-support.json');
    await writeFile(malformedPath, '{ invalid JSON');
    const malformed = runAdvisorCli(
      item.root,
      'support:check',
      '--file',
      malformedPath,
    );
    assert.equal(malformed.status, 1);
    assert.match(malformed.stderr, /invalid supporting evidence review manifest JSON/i);
  } finally {
    await rm(item.root, { recursive: true, force: true });
  }
});
