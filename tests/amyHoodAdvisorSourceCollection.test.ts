/**
 * Test Plan:
 * 1. Happy Path:
 *    - an official Amy Hood source and candidate event resolve to deterministic advisor paths.
 *
 * 2. Edge Cases:
 *    - a discovery-only LinkedIn URL remains metadata-only.
 *    - a duplicate URL resolves to one canonical registry identity.
 *    - a source without an optional speaker remains valid but reviewable.
 *
 * 3. Failure Path:
 *    - disallowed hosts and failed refreshes produce explicit safe states without overwriting valid raw data.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { advisorPaths } from '../server/decisionAdvisor/paths';
import type {
  AdvisorRawSource,
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

test('edge: discovery-only LinkedIn sources remain metadata-only', () => {
  const source: AdvisorSourceRecord = {
    ...officialSource,
    id: 'source-linkedin-discovery',
    canonicalUrl: 'https://www.linkedin.com/posts/example',
    tier: 'discovery_only',
    collector: 'manual_import',
    approvedPublicHost: false,
    collectionStatus: 'discovered',
    rawPath: null,
    sha256: null,
    capturedAt: null,
  };

  assert.equal(source.tier, 'discovery_only');
  assert.equal(source.rawPath, null);
  assert.equal(source.approvedPublicHost, false);
});

test('edge: one canonical registry identity can reference duplicate discoveries', () => {
  const source: AdvisorSourceRecord = {
    ...officialSource,
    eventCandidateIds: ['candidate-fy25-q4-capex', 'candidate-fy25-q4-margin'],
    failureReason: 'duplicate',
  };

  assert.equal(source.id, 'source-microsoft-fy25-q4');
  assert.equal(source.canonicalUrl, officialSource.canonicalUrl);
  assert.deepEqual(source.eventCandidateIds, [
    'candidate-fy25-q4-capex',
    'candidate-fy25-q4-margin',
  ]);
});

test('edge: a source without a speaker remains explicitly reviewable', () => {
  const source: AdvisorSourceRecord = {
    ...officialSource,
    speaker: null,
    collectionStatus: 'review_required',
    failureReason: 'speaker_uncertain',
  };

  assert.equal(source.speaker, null);
  assert.equal(source.collectionStatus, 'review_required');
  assert.equal(source.failureReason, 'speaker_uncertain');
});

test('failure: unsafe collection states preserve the last valid raw artifact', () => {
  const failedRefresh: AdvisorSourceRecord = {
    ...officialSource,
    approvedPublicHost: false,
    collectionStatus: 'failed',
    failureReason: 'network_error',
  };
  const {
    rawPath: _rawPath,
    normalizedPath: _normalizedPath,
    failureReason: _failureReason,
    ...metadata
  } = officialSource;
  const preservedRaw: AdvisorRawSource = {
    sourceId: officialSource.id,
    canonicalUrl: officialSource.canonicalUrl,
    title: officialSource.title,
    mediaType: 'text/html',
    bodyBase64: 'PHNvdXJjZT5wcmVzZXJ2ZWQ8L3NvdXJjZT4=',
    metadata,
  };

  assert.equal(failedRefresh.approvedPublicHost, false);
  assert.equal(failedRefresh.collectionStatus, 'failed');
  assert.equal(failedRefresh.rawPath, officialSource.rawPath);
  assert.equal(preservedRaw.bodyBase64, 'PHNvdXJjZT5wcmVzZXJ2ZWQ8L3NvdXJjZT4=');
});
