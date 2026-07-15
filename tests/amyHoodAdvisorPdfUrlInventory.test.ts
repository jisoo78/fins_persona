/**
 * Test Plan:
 * 1. Happy Path:
 *    - a valid 31-URL inventory merges locator-free unreviewed associations and registry discoveries.
 *
 * 2. Edge Cases:
 *    - canonical-equivalent original URLs and bot-blocked access metadata remain auditable.
 *    - an idempotent rerun preserves an existing reviewed association and collected registry artifact.
 *    - a post-publication SEC reconstruction keeps context role while recording post-outcome publication time.
 *
 * 3. Failure Path:
 *    - duplicate URLs, unsupported roles, and inconsistent access metadata fail before persistence.
 *    - an unknown candidate leaves candidate and registry files unchanged.
 *    - registry persistence failure compensates the candidate-file write.
 */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { advisorPaths } from '../server/decisionAdvisor/paths';
import {
  mergePdfUrlInventory,
  validatePdfUrlInventory,
  type AmyHoodPdfUrlInventory,
  type PdfInventoryMergeDependencies,
} from '../server/decisionAdvisor/pdfUrlInventory';
import { loadRegistry } from '../server/decisionAdvisor/sourceRegistry';
import type { EventCandidate } from '../shared/amyHoodDecisionAdvisor';

const candidateUrl = 'https://news.microsoft.com/source/2016/06/13/microsoft-to-acquire-linkedin/';

const candidate = (): EventCandidate => ({
  id: 'candidate-linkedin-acquisition-2016',
  workingTitle: 'LinkedIn acquisition 2016',
  domain: 'm_and_a',
  decisionWindowStart: '2016-06-13',
  decisionWindowEnd: '2016-06-13',
  discoveryUrls: [candidateUrl],
  decisionWindowBasis: {
    summary: 'The dated official announcement defines the public decision disclosure window.',
    sourceUrls: [candidateUrl],
    reviewerNote: 'Reviewed against the official announcement date.',
  },
  eventFingerprint: {
    primaryEntity: 'LinkedIn',
    decisionAction: 'will acquire',
    eventSpecificIdentifier: '$26.2 billion',
    sourceUrls: [candidateUrl],
    reviewStatus: 'reviewed',
    reviewerNote: 'Reviewed against the official transaction announcement.',
  },
  sourceAssociations: [{
    canonicalUrl: candidateUrl,
    role: 'contemporaneous_context',
    sourceType: 'official_announcement',
    publishedAt: '2016-06-13',
    temporalRelation: 'decision_time',
    relevanceClaim: 'The announcement identifies the LinkedIn acquisition and transaction price.',
    evidenceLocator: {
      exactQuote: 'Microsoft will acquire LinkedIn for a transaction valued at $26.2 billion.',
      exactRelevancePassage: 'Microsoft will acquire LinkedIn for a transaction valued at $26.2 billion.',
      anchorTerms: ['LinkedIn', '$26.2 billion'],
      eventDiscriminators: [
        { kind: 'named_entity', value: 'LinkedIn' },
        { kind: 'decision_action', value: 'will acquire' },
        { kind: 'event_specific', value: '$26.2 billion' },
      ],
      speaker: null,
    },
    reviewStatus: 'reviewed',
    reviewerNote: 'Exact transaction wording was reviewed in the official source.',
  }],
  directEvidenceGap: {
    reviewStatus: 'reviewed',
    reason: 'No event-specific Amy Hood passage has been verified for this candidate yet.',
    reviewerNote: 'Direct evidence remains blocked pending artifact review.',
  },
  phase3Status: 'evidence_gap',
  notes: 'Fixture candidate.',
  status: 'approved_for_collection',
});

const inventoryEntry = (index: number) => ({
  canonicalUrl: index === 0
    ? 'https://news.microsoft.com/speeches/linkedin-transaction-call/'
    : `https://news.microsoft.com/source/2016/06/13/linkedin-context-${index}/`,
  originalUrls: index === 0
    ? [
      'https://news.microsoft.com/speeches/linkedin-transaction-call/?utm_source=chatgpt.com',
      'https://news.microsoft.com/speeches/linkedin-transaction-call/',
    ]
    : [`https://news.microsoft.com/source/2016/06/13/linkedin-context-${index}/`],
  pageNumbers: [5, 6],
  eventId: 'candidate-linkedin-acquisition-2016',
  eventName: 'LinkedIn acquisition',
  publisher: 'Microsoft',
  domain: 'news.microsoft.com',
  sourceType: index === 0 ? 'official_transcript' : 'official_announcement',
  evidenceRole: index === 0 ? 'direct_amy' as const : 'contemporaneous_context' as const,
  directEvidenceStatus: index === 0 ? 'verified' as const : 'not_applicable' as const,
  reviewStatus: index === 0 ? 'review_required' as const : 'unreviewed' as const,
  publishedAt: '2016-06-13',
  temporalRelation: 'decision_time' as const,
  describedEvidencePeriod: 'decision_time' as const,
  registryStatus: 'new' as const,
  accessStatus: 'accessible' as const,
  httpStatus: 200,
  finalUrl: index === 0
    ? 'https://news.microsoft.com/speeches/linkedin-transaction-call/'
    : `https://news.microsoft.com/source/2016/06/13/linkedin-context-${index}/`,
  checkedAt: '2026-07-15T00:00:00.000Z',
  reviewNote: 'Discovery metadata only; exact source passage requires artifact review.',
});

const inventory = (): AmyHoodPdfUrlInventory => ({
  inventoryId: 'amy-hood-ma-pdf-url-inventory',
  sourcePdf: 'data/amy-hood-url.pdf',
  sourcePdfSha256: 'a'.repeat(64),
  sourcePageCount: 14,
  extractedAt: '2026-07-15T00:00:00.000Z',
  purpose: 'Discovery inventory only. PDF text is not evidence.',
  canonicalization: {
    schemeAndHostname: 'lowercase',
    schemePreference: 'https',
    fragment: 'removed',
    trackingParameters: 'removed, including utm_*',
    meaningfulQueryParameters: 'preserved',
    trailingSlash: 'normalized only for equivalent annotations',
  },
  comparisonFiles: [
    'data/b-track/amy-hood/advisor/event-candidates.json',
    'data/b-track/amy-hood/advisor/source-registry.json',
  ],
  accessCheck: {
    checkedAt: '2026-07-15T00:00:00.000Z',
    method: 'HTTP GET with redirects and host-appropriate research user agents.',
    interpretation: 'HTTP status and bot blocking remain distinct.',
  },
  summary: {
    canonicalUrlCount: 31,
    existingCount: 0,
    newCount: 31,
    accessibleCount: 31,
    blockedByAutomationCount: 0,
    unavailableCount: 0,
    notCheckedCount: 0,
  },
  urls: Array.from({ length: 31 }, (_, index) => inventoryEntry(index)),
});

const withRoot = async (run: (root: string) => Promise<void>) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'advisor-pdf-inventory-'));
  try {
    const paths = advisorPaths(root);
    await mkdir(paths.root, { recursive: true });
    await writeFile(path.join(paths.root, 'event-candidates.json'), `${JSON.stringify([candidate()], null, 2)}\n`);
    await writeFile(paths.registry, '{"sources":[]}\n');
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

test('happy: a valid PDF inventory merges unreviewed discoveries without approving evidence', async () => {
  await withRoot(async (root) => {
    const result = await mergePdfUrlInventory(root, validatePdfUrlInventory(inventory()));

    assert.deepEqual(result, {
      inventoryUrlCount: 31,
      addedCandidateAssociations: 31,
      updatedCandidateAssociations: 0,
      addedRegistrySources: 31,
      updatedRegistrySources: 0,
      preservedReviewedAssociations: 0,
    });
    const candidates = JSON.parse(await readFile(
      path.join(advisorPaths(root).root, 'event-candidates.json'),
      'utf8',
    )) as EventCandidate[];
    const added = candidates[0].sourceAssociations.filter(({ reviewStatus }) => reviewStatus === 'unreviewed');
    assert.equal(added.length, 31);
    assert.ok(added.every(({ evidenceLocator }) => evidenceLocator === null));
    assert.equal(loadRegistry(root).sources.length, 31);
  });
});

test('edge: canonical originals and bot-block metadata remain auditable', () => {
  const value = inventory();
  value.urls[0] = {
    ...value.urls[0],
    originalUrls: [
      value.urls[0].canonicalUrl,
      value.urls[0].canonicalUrl.slice(0, -1),
    ],
    accessStatus: 'blocked_by_automation',
    httpStatus: 403,
    finalUrl: value.urls[0].canonicalUrl,
  };
  value.summary.accessibleCount = 30;
  value.summary.blockedByAutomationCount = 1;

  const checked = validatePdfUrlInventory(value);

  assert.equal(checked.urls[0].originalUrls.length, 2);
  assert.equal(checked.urls[0].accessStatus, 'blocked_by_automation');
  assert.equal(checked.urls[0].httpStatus, 403);
});

test('edge: idempotent merge preserves reviewed evidence and collected artifacts', async () => {
  await withRoot(async (root) => {
    const value = inventory();
    value.urls[0] = {
      ...value.urls[0],
      canonicalUrl: candidateUrl,
      originalUrls: [candidateUrl],
      registryStatus: 'existing',
      finalUrl: candidateUrl,
    };
    value.summary.existingCount = 1;
    value.summary.newCount = 30;
    await mergePdfUrlInventory(root, validatePdfUrlInventory(value));
    value.urls[1] = {
      ...value.urls[1],
      sourceType: 'official_transcript',
      publishedAt: '2016-06-12',
      temporalRelation: 'pre_decision',
      describedEvidencePeriod: 'pre_decision',
    };
    const first = await mergePdfUrlInventory(root, validatePdfUrlInventory(value));
    const candidates = JSON.parse(await readFile(
      path.join(advisorPaths(root).root, 'event-candidates.json'),
      'utf8',
    )) as EventCandidate[];

    assert.equal(first.addedCandidateAssociations, 0);
    assert.equal(first.updatedCandidateAssociations, 1);
    assert.equal(first.updatedRegistrySources, 1);
    assert.equal(candidates[0].sourceAssociations[0].reviewStatus, 'reviewed');
    assert.notEqual(candidates[0].sourceAssociations[0].evidenceLocator, null);
    assert.equal(candidates[0].sourceAssociations.filter(({ canonicalUrl }) => canonicalUrl === candidateUrl).length, 1);
    const correctedAssociation = candidates[0].sourceAssociations.find(
      ({ canonicalUrl }) => canonicalUrl === value.urls[1].canonicalUrl,
    );
    assert.equal(correctedAssociation?.sourceType, 'official_transcript');
    assert.equal(correctedAssociation?.publishedAt, '2016-06-12');
    const correctedSource = loadRegistry(root).sources.find(
      ({ canonicalUrl }) => canonicalUrl === value.urls[1].canonicalUrl,
    );
    assert.equal(correctedSource?.sourceType, 'official_transcript');
    assert.equal(correctedSource?.publishedAt, '2016-06-12');
  });
});

test('edge: post-publication SEC reconstruction preserves both publication and described periods', () => {
  const value = inventory();
  value.urls[0] = {
    ...value.urls[0],
    canonicalUrl: 'https://www.sec.gov/Archives/edgar/data/1271024/example.htm',
    originalUrls: ['https://www.sec.gov/Archives/edgar/data/1271024/example.htm'],
    domain: 'www.sec.gov',
    publisher: 'LinkedIn / SEC',
    sourceType: 'sec_proxy_statement',
    evidenceRole: 'contemporaneous_context',
    directEvidenceStatus: 'not_applicable',
    reviewStatus: 'unreviewed',
    publishedAt: '2016-07-01',
    temporalRelation: 'post_outcome',
    describedEvidencePeriod: 'pre_decision',
    finalUrl: 'https://www.sec.gov/Archives/edgar/data/1271024/example.htm',
  };

  const checked = validatePdfUrlInventory(value);

  assert.equal(checked.urls[0].evidenceRole, 'contemporaneous_context');
  assert.equal(checked.urls[0].temporalRelation, 'post_outcome');
  assert.equal(checked.urls[0].describedEvidencePeriod, 'pre_decision');
});

test('failure: invalid inventory contracts fail before persistence', async (t) => {
  await t.test('duplicate canonical URL', () => {
    const value = inventory();
    value.urls[1].canonicalUrl = value.urls[0].canonicalUrl;
    value.urls[1].originalUrls = [value.urls[0].canonicalUrl];
    value.urls[1].finalUrl = value.urls[0].canonicalUrl;
    assert.throws(() => validatePdfUrlInventory(value), /duplicate canonical URL/i);
  });
  await t.test('unsupported evidence role', () => {
    const value = inventory() as unknown as { urls: Array<{ evidenceRole: string }> };
    value.urls[0].evidenceRole = 'review_required';
    assert.throws(() => validatePdfUrlInventory(value), /evidence role/i);
  });
  await t.test('accessible without HTTP 200', () => {
    const value = inventory();
    value.urls[0].httpStatus = 403;
    assert.throws(() => validatePdfUrlInventory(value), /access metadata/i);
  });
});

test('failure: unknown candidates and registry failures leave no partial candidate write', async (t) => {
  await t.test('unknown candidate', async () => {
    await withRoot(async (root) => {
      const value = inventory();
      value.urls[0].eventId = 'candidate-unknown';
      const candidatePath = path.join(advisorPaths(root).root, 'event-candidates.json');
      const beforeCandidates = await readFile(candidatePath, 'utf8');
      const beforeRegistry = await readFile(advisorPaths(root).registry, 'utf8');

      await assert.rejects(mergePdfUrlInventory(root, validatePdfUrlInventory(value)), /unknown candidate/i);
      assert.equal(await readFile(candidatePath, 'utf8'), beforeCandidates);
      assert.equal(await readFile(advisorPaths(root).registry, 'utf8'), beforeRegistry);
    });
  });
  await t.test('registry failure compensation', async () => {
    await withRoot(async (root) => {
      const candidatePath = path.join(advisorPaths(root).root, 'event-candidates.json');
      const beforeCandidates = await readFile(candidatePath, 'utf8');
      const dependencies: Partial<PdfInventoryMergeDependencies> = {
        upsertSources: async () => {
          throw new Error('injected registry persistence failure');
        },
      };

      await assert.rejects(
        mergePdfUrlInventory(root, validatePdfUrlInventory(inventory()), dependencies),
        /registry persistence failure/i,
      );
      assert.equal(await readFile(candidatePath, 'utf8'), beforeCandidates);
      assert.equal(loadRegistry(root).sources.length, 0);
    });
  });
});
