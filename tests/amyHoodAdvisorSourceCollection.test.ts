/**
 * Test Plan:
 * 1. Happy Path:
 *    - advisor paths are deterministic and atomic JSON persistence round-trips valid data.
 *
 * 2. Edge Cases:
 *    - a LinkedIn URL is classified as discovery-only.
 *    - canonical-equivalent discoveries resolve to the same URL identity.
 *    - fragments and tracking parameters are removed while useful query keys are sorted.
 *
 * 3. Failure Path:
 *    - non-HTTPS and non-allowlisted sources require safe rejection.
 *    - a non-JSON value cannot overwrite an existing valid file.
 *    - a failed atomic replacement preserves the destination and removes its temporary file.
 */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { readJsonFile, writeJsonAtomic } from '../server/decisionAdvisor/jsonStore';
import { advisorPaths } from '../server/decisionAdvisor/paths';
import {
  canonicalizeSourceUrl,
  classifySourceUrl,
} from '../server/decisionAdvisor/sourcePolicy';
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

test('failure: failed atomic replacement preserves the destination and removes its temp file', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'advisor-json-failure-'));
  const destination = path.join(directory, 'registry.json');
  const marker = path.join(destination, 'preserved.json');

  try {
    await mkdir(destination);
    await writeFile(marker, '{"preserved":true}\n', 'utf8');

    await assert.rejects(
      () => writeJsonAtomic(destination, { replacement: true }),
      (error: NodeJS.ErrnoException) => {
        assert.ok(
          ['EISDIR', 'EEXIST', 'ENOTDIR'].includes(error.code ?? ''),
          `expected a filesystem replacement error, received ${error.message}`,
        );
        return true;
      },
    );

    assert.equal(await readFile(marker, 'utf8'), '{"preserved":true}\n');
    assert.deepEqual(await readdir(directory), ['registry.json']);
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
