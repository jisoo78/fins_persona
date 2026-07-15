/**
 * Test Plan:
 * 1. Happy Path:
 *    - reviewed artifacts produce a validator-ready card and explicit review approves it.
 *
 * 2. Edge Cases:
 *    - a short source remains one chunk.
 *    - a boundary-crossing Amy statement is deduplicated into one span.
 *    - one context document family remains reviewable with a diversity gap.
 *
 * 3. Failure Path:
 *    - invalid manifests, malformed model JSON, invented quotes, missing direct
 *      Amy evidence, post-outcome leakage, and persistence failures cannot
 *      approve or corrupt a card.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildEvidenceChunks,
  extractPilotEvidence,
  validatePilotEvidenceSpan,
  type PilotEvidenceExtractionInput,
} from '../server/decisionAdvisor/evidenceExtractor';
import {
  approvePilotEventCard,
  eventCardPath,
  proposePilotEventCard,
  savePilotEventCard,
  validatePilotEventCard,
} from '../server/decisionAdvisor/eventCard';
import {
  loadPilotManifest,
  validatePilotManifest,
} from '../server/decisionAdvisor/pilotManifest';
import type {
  ModelClient,
  ModelInput,
  ModelResult,
} from '../server/personaPipeline/modelClient';
import type {
  AdvisorSourceRecord,
  EventCandidate,
  EventSourceAssociation,
  PilotDecisionEvent,
  PilotEvidenceSpan,
  PilotManifest,
} from '../shared/amyHoodDecisionAdvisor';

const candidatePath = new URL(
  '../data/b-track/amy-hood/advisor/event-candidates.json',
  import.meta.url,
);

const loadRealCandidates = async () => JSON.parse(
  await readFile(candidatePath, 'utf8'),
) as EventCandidate[];

const validManifest: PilotManifest = {
  dataset: 'amy_hood_phase_3_pilot',
  version: '1.0.0',
  targets: [
    { candidateId: 'candidate-linkedin-acquisition-2016', domain: 'm_and_a', priority: 1 },
    { candidateId: 'candidate-activision-acquisition-2022', domain: 'm_and_a', priority: 2 },
    { candidateId: 'candidate-openai-expansion-2023', domain: 'ai_cloud_capex', priority: 3 },
    { candidateId: 'candidate-copilot-price-2023', domain: 'pricing_monetization', priority: 4 },
    { candidateId: 'candidate-workforce-reset-2023', domain: 'cost_efficiency', priority: 5 },
    { candidateId: 'candidate-github-acquisition-2018', domain: 'm_and_a', priority: 6 },
    { candidateId: 'candidate-nuance-acquisition-2021', domain: 'm_and_a', priority: 7 },
    { candidateId: 'candidate-ai-datacenter-plan-2025', domain: 'ai_cloud_capex', priority: 8 },
    { candidateId: 'candidate-m365-price-2021', domain: 'pricing_monetization', priority: 9 },
    { candidateId: 'candidate-buyback-2021', domain: 'shareholder_return_risk', priority: 10 },
  ],
};

const fakeModel = (
  handler: (input: ModelInput) => Promise<ModelResult>,
): ModelClient => ({
  provider: 'local',
  model: 'fake-gemma-4',
  cacheKey: 'fake-gemma-4-v1',
  invoke: handler,
});

const extractionFixture = async (
  normalizedText: string,
  role: 'direct_amy' | 'contemporaneous_context' = 'direct_amy',
): Promise<PilotEvidenceExtractionInput> => {
  const candidate = (await loadRealCandidates()).find(
    ({ id }) => id === 'candidate-linkedin-acquisition-2016',
  );
  assert(candidate);
  const association: EventSourceAssociation = {
    canonicalUrl: 'https://example.com/amy-event',
    role,
    sourceType: role === 'direct_amy' ? 'official_transcript' : 'official_announcement',
    publishedAt: '2016-06-13',
    temporalRelation: 'decision_time',
    relevanceClaim: 'Fixture association for exact decision evidence extraction.',
    evidenceLocator: null,
    reviewStatus: 'reviewed',
    reviewerNote: 'Fixture reviewed for the Phase 3 extraction test.',
  };
  const source: AdvisorSourceRecord = {
    id: 'source-fixture',
    canonicalUrl: association.canonicalUrl,
    eventCandidateIds: [candidate.id],
    tier: 1,
    title: 'Fixture Amy Hood transcript',
    publisher: 'Microsoft',
    publishedAt: association.publishedAt,
    speaker: role === 'direct_amy' ? 'Amy Hood' : null,
    sourceType: association.sourceType,
    collector: 'manual_import',
    temporalRole: 'decision_time',
    rightsNote: 'Test fixture.',
    approvedPublicHost: true,
    collectionStatus: 'approved',
    rawPath: 'raw/source-fixture.json',
    normalizedPath: 'normalized/source-fixture.txt',
    sha256: 'a'.repeat(64),
    capturedAt: '2026-07-15T00:00:00.000Z',
    failureReason: null,
  };
  return {
    root: await mkdtemp(path.join(os.tmpdir(), 'amy-pilot-extract-')),
    candidate,
    source,
    association,
    normalizedText,
  };
};

const eventCardFixture = async () => {
  const candidate = (await loadRealCandidates()).find(
    ({ id }) => id === 'candidate-linkedin-acquisition-2016',
  );
  assert(candidate);
  const direct: PilotEvidenceSpan = {
    id: 'span-direct',
    sourceId: 'source-direct',
    eventCandidateId: candidate.id,
    role: 'direct_amy',
    exactQuote: 'We will finance this transaction primarily through new debt issued prior to close.',
    startChar: 20,
    endChar: 101,
    publishedAt: '2016-06-13',
    speaker: 'Amy Hood',
  };
  const context: PilotEvidenceSpan = {
    id: 'span-context',
    sourceId: 'source-context',
    eventCandidateId: candidate.id,
    role: 'decision_context',
    exactQuote: 'Microsoft will acquire LinkedIn for $196 per share in an all-cash transaction.',
    startChar: 10,
    endChar: 89,
    publishedAt: '2016-06-13',
    speaker: null,
  };
  const response = {
    title: 'LinkedIn acquisition financing and growth decision',
    decisionQuestion: 'Should Microsoft acquire LinkedIn and finance the transaction with new debt?',
    situation: 'Microsoft evaluated an all-cash acquisition to accelerate cloud and professional-network growth.',
    objectives: ['Accelerate revenue growth across LinkedIn, Office 365, and Dynamics.'],
    conditions: ['Debt markets offered favorable issuance windows.'],
    constraints: ['The transaction required regulatory and shareholder approvals.'],
    options: [{
      id: 'option-acquire',
      description: 'Acquire LinkedIn and issue debt before close.',
      expectedBenefit: 'Accelerate growth and capture operating synergies.',
      principalRisk: 'Assume integration and financing risk.',
      selected: true,
    }, {
      id: 'option-remain-independent',
      description: 'Do not acquire LinkedIn.',
      expectedBenefit: 'Preserve capital and avoid integration risk.',
      principalRisk: 'Forgo cross-product growth and network effects.',
      selected: false,
    }],
    chosenAction: 'Acquire LinkedIn in an all-cash transaction financed primarily with new debt.',
    rejectedBenefit: 'Preserving capital and avoiding integration execution risk.',
    observations: ['Amy Hood identified favorable debt-market windows and cross-product growth.'],
    inferences: ['The financing choice preserved existing cash while acting on a strategic growth opportunity.'],
  };
  return {
    candidate,
    spans: [direct, context],
    model: fakeModel(async () => ({ text: JSON.stringify(response), elapsedMs: 1 })),
  };
};

test('happy: pilot manifest fixes ten candidates across all five domains', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'amy-pilot-manifest-'));
  const candidates = await loadRealCandidates();
  const file = path.join(
    root,
    'data/b-track/amy-hood/advisor/events/pilot/pilot-manifest.json',
  );
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(validManifest, null, 2)}\n`);

  const manifest = await loadPilotManifest(root, candidates);

  assert.equal(manifest.targets.length, 10);
  assert.equal(new Set(manifest.targets.map(({ domain }) => domain)).size, 5);
});

test('failure: pilot manifest rejects duplicate, unknown, and domain-mismatched targets', async () => {
  const candidates = await loadRealCandidates();
  const duplicate = structuredClone(validManifest);
  duplicate.targets[1] = { ...duplicate.targets[0], priority: 2 };
  assert.throws(
    () => validatePilotManifest(duplicate, candidates),
    /duplicate pilot candidate/,
  );

  const unknown = structuredClone(validManifest);
  unknown.targets[0].candidateId = 'candidate-does-not-exist';
  assert.throws(
    () => validatePilotManifest(unknown, candidates),
    /unknown pilot candidate/,
  );

  const mismatch = structuredClone(validManifest);
  mismatch.targets[0].domain = 'cost_efficiency';
  assert.throws(
    () => validatePilotManifest(mismatch, candidates),
    /pilot domain mismatch/,
  );
});

test('edge: a short source remains one chunk', () => {
  const text = 'Amy Hood decision text.';
  assert.deepEqual(buildEvidenceChunks(text), [{
    index: 0,
    startChar: 0,
    endChar: text.length,
    text,
  }]);
});

test('edge: a boundary-crossing Amy statement is deduplicated into one span', async () => {
  const quote = 'Amy Hood chose a bounded investment after demand evidence was visible.';
  const normalizedText = `${'x'.repeat(11_970)}${quote}${'y'.repeat(900)}`;
  const input = await extractionFixture(normalizedText);
  const model = fakeModel(async (modelInput) => {
    const user = typeof modelInput === 'string' ? modelInput : modelInput.user;
    const marker = 'SOURCE CHUNK:\n';
    const chunk = user.slice(user.indexOf(marker) + marker.length);
    const startChar = chunk.indexOf(quote);
    return {
      text: JSON.stringify({
        spans: startChar < 0 ? [] : [{
          role: 'direct_amy',
          exactQuote: quote,
          startChar,
          endChar: startChar + quote.length,
          speaker: 'Amy Hood',
        }],
      }),
      elapsedMs: 1,
    };
  });

  const result = await extractPilotEvidence(input, model);

  assert.equal(result.spans.length, 1);
  assert.equal(result.spans[0].startChar, 11_970);
});

test('failure: an invented quotation fails exact source validation', async () => {
  const input = await extractionFixture('The exact source sentence.');
  assert.throws(
    () => validatePilotEvidenceSpan({
      id: 'span-1',
      sourceId: input.source.id,
      eventCandidateId: input.candidate.id,
      role: 'direct_amy',
      exactQuote: 'An invented sentence.',
      startChar: 0,
      endChar: 21,
      publishedAt: '2016-06-13',
      speaker: 'Amy Hood',
    }, input),
    /quote does not match immutable source/,
  );
});

test('failure: malformed model output retries once and records an incomplete extraction', async () => {
  const input = await extractionFixture('Amy Hood discussed the LinkedIn acquisition financing.');
  let calls = 0;
  const model = fakeModel(async () => {
    calls += 1;
    return { text: 'not-json', elapsedMs: 1 };
  });

  const result = await extractPilotEvidence(input, model);

  assert.equal(calls, 2);
  assert.deepEqual(result.spans, []);
  assert.deepEqual(result.gaps, ['model_response_invalid']);
});

test('happy: a validator-ready proposal becomes approved only after explicit review', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'amy-pilot-event-'));
  const { candidate, spans, model } = await eventCardFixture();
  const proposed = await proposePilotEventCard(candidate, spans, model, {
    documentFamilyIds: ['linkedin-call-2016', 'linkedin-announcement-2016'],
    now: '2026-07-15T10:00:00.000Z',
  });
  assert.equal(proposed.status, 'incomplete');
  assert.deepEqual(validatePilotEventCard(proposed).blockingGaps, []);
  await savePilotEventCard(root, proposed);

  const approved = await approvePilotEventCard(root, proposed.candidateId, {
    reviewer: 'Codex evidence review',
    reviewedAt: '2026-07-15T12:00:00.000Z',
  });

  assert.equal(approved.status, 'approved');
  assert.equal(approved.reviewer, 'Codex evidence review');
});

test('edge: one document family remains reviewable with a diversity gap', async () => {
  const { candidate, spans, model } = await eventCardFixture();
  const proposed = await proposePilotEventCard(candidate, spans, model, {
    documentFamilyIds: ['linkedin-transaction-2016'],
    now: '2026-07-15T10:00:00.000Z',
  });

  const validation = validatePilotEventCard(proposed);

  assert.deepEqual(validation.blockingGaps, []);
  assert.deepEqual(validation.advisoryGaps, ['single_document_family']);
});

test('failure: missing direct evidence and outcome leakage cannot be approved', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'amy-pilot-invalid-event-'));
  const { candidate, spans, model } = await eventCardFixture();
  const proposed = await proposePilotEventCard(candidate, spans.slice(1), model, {
    documentFamilyIds: ['linkedin-announcement-2016'],
    now: '2026-07-15T10:00:00.000Z',
  });
  await savePilotEventCard(root, proposed);
  await assert.rejects(
    () => approvePilotEventCard(root, proposed.candidateId, {
      reviewer: 'Codex evidence review',
      reviewedAt: '2026-07-15T12:00:00.000Z',
    }),
    /missing_direct_amy/,
  );

  const leaked: PilotDecisionEvent = {
    ...proposed,
    evidenceSpans: [{
      ...spans[0],
      id: 'span-outcome',
      role: 'post_outcome',
      publishedAt: '2021-01-01',
    }, spans[1]],
    directAmyEvidenceIds: ['span-outcome'],
    postOutcomeEvidenceIds: ['span-outcome'],
  };
  assert.deepEqual(
    validatePilotEventCard(leaked).blockingGaps,
    ['missing_direct_amy', 'post_outcome_leakage'],
  );
});

test('failure: invalid option selection and failed persistence preserve the prior card', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'amy-pilot-write-failure-'));
  const { candidate, spans, model } = await eventCardFixture();
  const proposed = await proposePilotEventCard(candidate, spans, model, {
    documentFamilyIds: ['family-a', 'family-b'],
    now: '2026-07-15T10:00:00.000Z',
  });
  const invalid = {
    ...proposed,
    options: proposed.options.map((option) => ({ ...option, selected: true })),
  };
  assert.throws(() => validatePilotEventCard(invalid), /invalid decision options/);

  await savePilotEventCard(root, proposed);
  const before = await readFile(eventCardPath(root, proposed.candidateId), 'utf8');
  await assert.rejects(
    () => savePilotEventCard(root, { ...proposed, title: 'Changed title' }, {
      write: async () => { throw new Error('injected write failure'); },
    }),
    /injected write failure/,
  );
  assert.equal(
    await readFile(eventCardPath(root, proposed.candidateId), 'utf8'),
    before,
  );
});
