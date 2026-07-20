/**
 * Test Plan:
 * 1. Happy Path:
 *    - reviewed artifacts produce a validator-ready card and explicit review approves it.
 *
 * 2. Edge Cases:
 *    - a short source remains one chunk.
 *    - a boundary-crossing Amy statement is deduplicated into one span.
 *    - source-level Amy identity is accepted when speaker segments are absent.
 *
 * 3. Failure Path:
 *    - invalid manifests, malformed model JSON, invented quotes, missing Amy
 *      judgment evidence, post-outcome leakage, and persistence failures cannot
 *      approve or corrupt a card.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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
import {
  validatePilotPolicyEvidenceRecord,
} from '../server/decisionAdvisor/pilotPolicyEvidence';
import { registrySourceHasEvidenceLink } from '../server/decisionAdvisor/sourceEvidenceLink';
import {
  buildPilotBatch,
  buildPilotReport,
  retainedExtractionGaps,
} from '../server/decisionAdvisor/pilotReport';
import type {
  ModelClient,
  ModelInput,
  ModelResult,
} from '../server/personaPipeline/modelClient';
import { modelRequestSettings } from '../server/personaPipeline/modelClient';
import type {
  AdvisorSourceRecord,
  EventCandidate,
  EventSourceAssociation,
  PilotDecisionEvent,
  PilotEvidenceSpan,
  PilotManifest,
  PilotPolicyEvidenceRecord,
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
    {
      candidateId: 'candidate-cloud-capacity-scale-2022',
      domain: 'ai_cloud_capex',
      priority: 6,
      replacementReason: 'Replace a sealed holdout target with reviewed non-holdout capacity evidence.',
    },
    {
      candidateId: 'candidate-ai-capacity-opex-pivot-2023',
      domain: 'ai_cloud_capex',
      priority: 7,
      replacementReason: 'Replace an incomplete M&A target with direct Amy resource-allocation evidence.',
    },
    {
      candidateId: 'candidate-ai-capacity-sourcing-2024',
      domain: 'ai_cloud_capex',
      priority: 8,
      replacementReason: 'Replace a sealed holdout target with demand-led capacity-sourcing evidence.',
    },
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
    response,
    model: fakeModel(async () => ({ text: JSON.stringify(response), elapsedMs: 1 })),
  };
};

const reportCard = (
  target: PilotManifest['targets'][number],
  status: 'approved' | 'incomplete',
): PilotDecisionEvent => ({
  id: `event-${target.candidateId.slice('candidate-'.length)}`,
  candidateId: target.candidateId,
  title: target.candidateId,
  domain: target.domain,
  decisionDate: '2023-01-01',
  decisionQuestion: `What should Microsoft do for ${target.candidateId}?`,
  situation: 'A bounded public-evidence decision situation.',
  objectives: ['Allocate capital against observed demand.'],
  conditions: ['Demand evidence is visible.'],
  constraints: ['Capital and execution capacity are finite.'],
  options: [{
    id: 'act',
    description: 'Act with bounded investment.',
    expectedBenefit: 'Capture verified demand.',
    principalRisk: 'Execution risk.',
    selected: true,
  }, {
    id: 'wait',
    description: 'Wait for more evidence.',
    expectedBenefit: 'Preserve capital.',
    principalRisk: 'Lose timing advantage.',
    selected: false,
  }],
  chosenAction: 'Act with bounded investment.',
  rejectedBenefit: 'Preserve all capital.',
  observations: ['Demand evidence is visible.'],
  inferences: ['The action balances growth and proof.'],
  directAmyEvidenceIds: [],
  amyPolicyEvidenceIds: [],
  contextEvidenceIds: [],
  postOutcomeEvidenceIds: [],
  sourceIds: [],
  documentFamilyIds: [],
  evidenceSpans: [],
  status,
  gaps: status === 'approved' ? [] : ['missing_amy_judgment'],
  reviewer: status === 'approved' ? 'Codex evidence review' : null,
  reviewedAt: status === 'approved' ? '2026-07-15T12:00:00.000Z' : null,
  updatedAt: '2026-07-15T12:00:00.000Z',
});

const policyEvidenceFixture = async () => {
  const candidate = (await loadRealCandidates()).find(
    ({ id }) => id === 'candidate-copilot-price-2023',
  );
  assert(candidate);
  const quote = 'When we believe we are adding a lot of value, you can expect that we will have a list price for those copilots.';
  const normalizedText = `Question. AMY HOOD: ${quote} Next question.`;
  const startChar = normalizedText.indexOf(quote);
  const source: AdvisorSourceRecord = {
    id: 'source-policy-fixture',
    canonicalUrl: 'https://www.microsoft.com/en-us/investor/events/fy-2023/earnings-fy-2023-q3',
    eventCandidateIds: [candidate.id],
    tier: 1,
    title: 'Microsoft FY23 Q3 earnings call',
    publisher: 'Microsoft Investor Relations',
    publishedAt: '2023-04-25',
    speaker: null,
    sourceType: 'official_transcript',
    collector: 'microsoft_ir',
    temporalRole: 'pre_decision',
    rightsNote: 'Official public transcript fixture.',
    approvedPublicHost: true,
    collectionStatus: 'approved',
    rawPath: 'raw/source-policy-fixture.json',
    normalizedPath: 'normalized/source-policy-fixture.txt',
    sha256: 'b'.repeat(64),
    capturedAt: '2026-07-15T00:00:00.000Z',
    failureReason: null,
  };
  const record: PilotPolicyEvidenceRecord = {
    id: 'policy-copilot-value-pricing-2023',
    candidateId: candidate.id,
    sourceId: source.id,
    exactQuote: quote,
    startChar,
    endChar: startChar + quote.length,
    publishedAt: '2023-04-25',
    speaker: 'Amy Hood',
    policyTags: ['value_based_pricing'],
    eventLinkRationale: 'This pre-decision statement defines the value-based list-price rule later applied to commercial Copilot pricing.',
    reviewer: 'Codex evidence review',
    reviewedAt: '2026-07-15T12:00:00.000Z',
  };
  return {
    candidate,
    source,
    record,
    normalizedText,
    speakerSegments: [{
      speaker: 'Amy Hood',
      startChar: normalizedText.indexOf('AMY HOOD:'),
      endChar: normalizedText.length,
    }],
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

test('happy: reviewed pre-decision Amy policy evidence validates as a distinct role', async () => {
  const fixture = await policyEvidenceFixture();

  const span = validatePilotPolicyEvidenceRecord(fixture.record, fixture);

  assert.equal(span.role, 'amy_policy');
  assert.equal(span.speaker, 'Amy Hood');
  assert.equal(span.exactQuote, fixture.record.exactQuote);
});

test('edge: source-level Amy identity accepts policy evidence without speaker segments', async () => {
  const fixture = await policyEvidenceFixture();
  const source = { ...fixture.source, speaker: 'Amy Hood' };

  const span = validatePilotPolicyEvidenceRecord(fixture.record, {
    ...fixture,
    source,
    speakerSegments: [],
  });

  assert.equal(span.role, 'amy_policy');
});

test('failure: policy evidence rejects temporal, quote, tag, and speaker violations', async () => {
  const fixture = await policyEvidenceFixture();

  assert.throws(
    () => validatePilotPolicyEvidenceRecord({
      ...fixture.record,
      publishedAt: fixture.candidate.decisionWindowStart,
    }, {
      ...fixture,
      source: {
        ...fixture.source,
        publishedAt: fixture.candidate.decisionWindowStart,
      },
    }),
    /must predate the decision window/,
  );
  assert.throws(
    () => validatePilotPolicyEvidenceRecord({
      ...fixture.record,
      startChar: fixture.record.startChar + 1,
      endChar: fixture.record.endChar + 1,
    }, fixture),
    /quote does not match immutable source/,
  );
  assert.throws(
    () => validatePilotPolicyEvidenceRecord({
      ...fixture.record,
      policyTags: ['unknown_policy_tag' as never],
    }, fixture),
    /invalid policy tag/,
  );
  assert.throws(
    () => validatePilotPolicyEvidenceRecord(fixture.record, {
      ...fixture,
      speakerSegments: [{
        speaker: 'Satya Nadella',
        startChar: 0,
        endChar: fixture.normalizedText.length,
      }],
    }),
    /Amy Hood speaker boundary/,
  );
});

test('happy: a Phase 3 policy source is linked without becoming Phase 2 event evidence', () => {
  assert.equal(registrySourceHasEvidenceLink(
    'https://www.microsoft.com/en-us/investor/events/fy-2023/earnings-fy-2023-q3',
    'source-policy',
    new Set(),
    new Set(['source-policy']),
  ), true);
  assert.equal(registrySourceHasEvidenceLink(
    'https://example.com/orphan',
    'source-orphan',
    new Set(),
    new Set(['source-policy']),
  ), false);
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

test('failure: organizational context speaker is normalized without discarding exact evidence', async () => {
  const quote = 'Microsoft will finance the transaction primarily through new indebtedness.';
  const input = await extractionFixture(quote, 'contemporaneous_context');
  const model = fakeModel(async () => ({
    text: JSON.stringify({
      spans: [{
        role: 'decision_context',
        exactQuote: quote,
        startChar: 0,
        endChar: quote.length,
        speaker: 'Microsoft',
      }],
    }),
    elapsedMs: 1,
  }));

  const result = await extractPilotEvidence(input, model);

  assert.equal(result.spans.length, 1);
  assert.equal(result.spans[0].speaker, null);
  assert.deepEqual(result.gaps, []);
});

test('failure: exact unique quote uses deterministic offsets while duplicate text stays rejected', async () => {
  const quote = 'Amy Hood tied investment timing to visible demand.';
  const input = await extractionFixture(`Prefix. ${quote} Suffix.`);
  const wrongOffsetsModel = fakeModel(async () => ({
    text: JSON.stringify({
      spans: [{
        role: 'direct_amy',
        exactQuote: quote,
        startChar: 1,
        endChar: 2,
        speaker: 'Amy Hood',
      }],
    }),
    elapsedMs: 1,
  }));

  const corrected = await extractPilotEvidence(input, wrongOffsetsModel);

  assert.equal(corrected.spans.length, 1);
  assert.equal(corrected.spans[0].startChar, 8);
  assert.equal(corrected.spans[0].endChar, 8 + quote.length);

  const duplicated = await extractionFixture(`${quote} Other text. ${quote}`);
  const ambiguous = await extractPilotEvidence(duplicated, wrongOffsetsModel);
  assert.deepEqual(ambiguous.spans, []);
  assert.deepEqual(ambiguous.gaps, ['invalid_quote_offsets']);
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

test('happy: Amy policy evidence plus decision context is validator-ready', async () => {
  const { candidate, spans, model } = await eventCardFixture();
  const policy: PilotEvidenceSpan = {
    ...spans[0],
    id: 'span-policy',
    role: 'amy_policy',
    publishedAt: '2016-05-10',
    exactQuote: 'We invest consistently when customer value and long-term return are visible.',
    endChar: 93,
  };

  const proposed = await proposePilotEventCard(candidate, [policy, spans[1]], model, {
    documentFamilyIds: ['amy-policy-2016', 'linkedin-announcement-2016'],
    now: '2026-07-15T10:00:00.000Z',
  });

  assert.deepEqual(proposed.directAmyEvidenceIds, []);
  assert.deepEqual(proposed.amyPolicyEvidenceIds, ['span-policy']);
  assert.deepEqual(validatePilotEventCard(proposed).blockingGaps, []);
});

test('failure: decision context without Amy judgment uses the explicit gap', async () => {
  const { candidate, spans, model } = await eventCardFixture();
  const proposed = await proposePilotEventCard(candidate, spans.slice(1), model, {
    documentFamilyIds: ['linkedin-announcement-2016'],
    now: '2026-07-15T10:00:00.000Z',
  });

  assert.deepEqual(
    validatePilotEventCard(proposed).blockingGaps,
    ['missing_amy_judgment'],
  );
});

test('failure: post-decision Amy policy evidence is outcome leakage', async () => {
  const { candidate, spans, model } = await eventCardFixture();
  const policy: PilotEvidenceSpan = {
    ...spans[0],
    id: 'span-policy-late',
    role: 'amy_policy',
    publishedAt: '2016-06-14',
  };
  const proposed = await proposePilotEventCard(candidate, [policy, spans[1]], model, {
    documentFamilyIds: ['amy-policy-2016', 'linkedin-announcement-2016'],
    now: '2026-07-15T10:00:00.000Z',
  });

  assert.deepEqual(
    validatePilotEventCard(proposed).blockingGaps,
    ['post_outcome_leakage'],
  );
});

test('happy: one document family remains reviewable with a diversity advisory', async () => {
  const { candidate, spans, model } = await eventCardFixture();
  const proposed = await proposePilotEventCard(candidate, spans, model, {
    documentFamilyIds: ['linkedin-transaction-2016'],
    now: '2026-07-15T10:00:00.000Z',
  });

  const validation = validatePilotEventCard(proposed);

  assert.deepEqual(validation.blockingGaps, []);
  assert.deepEqual(validation.advisoryGaps, ['single_document_family']);
});

test('failure: missing Amy judgment and outcome leakage cannot be approved', async () => {
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
    /missing_amy_judgment/,
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
    amyPolicyEvidenceIds: [],
    postOutcomeEvidenceIds: ['span-outcome'],
  };
  assert.deepEqual(
    validatePilotEventCard(leaked).blockingGaps,
    ['missing_amy_judgment', 'post_outcome_leakage'],
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

test('happy: pilot report summarizes ten cards and all five domains', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'amy-pilot-report-'));
  const cards = validManifest.targets.map((target, index) =>
    reportCard(target, index < 5 ? 'approved' : 'incomplete'));

  const report = await buildPilotReport(root, validManifest, cards);

  assert.deepEqual(report.counts, { approved: 5, incomplete: 5, total: 10 });
  assert.equal(Object.keys(report.domainCounts).length, 5);
  assert.equal(report.rows.length, 10);
  assert.match(
    await readFile(
      path.join(root, 'docs/reports/2026-07-15-amy-hood-phase-3-pilot-review.html'),
      'utf8',
    ),
    /비공식 AI 시뮬레이션/,
  );
});

test('happy: pilot report separates an Amy policy quote from direct event evidence', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'amy-pilot-policy-report-'));
  const target = validManifest.targets[3];
  const card = reportCard(target, 'incomplete');
  const policy: PilotEvidenceSpan = {
    id: 'span-policy-report',
    sourceId: 'source-policy-report',
    eventCandidateId: target.candidateId,
    role: 'amy_policy',
    exactQuote: 'When we add substantial customer value, we establish a separate list price.',
    startChar: 10,
    endChar: 84,
    publishedAt: '2023-04-25',
    speaker: 'Amy Hood',
  };
  card.evidenceSpans = [policy];
  card.amyPolicyEvidenceIds = [policy.id];
  card.sourceIds = [policy.sourceId];

  const report = await buildPilotReport(root, validManifest, [card]);
  const row = report.rows.find(({ candidateId }) => candidateId === target.candidateId);
  assert(row);
  assert.equal(row.directQuote, '없음');
  assert.equal(row.policyQuote, policy.exactQuote);
  assert.match(
    await readFile(
      path.join(root, 'docs/reports/2026-07-15-amy-hood-phase-3-pilot-review.html'),
      'utf8',
    ),
    /Amy policy:/,
  );
});

test('failure: pilot batch continues after one event build failure', async () => {
  const failedId = validManifest.targets[2].candidateId;
  const result = await buildPilotBatch('/tmp/unused-pilot-root', validManifest, {
    build: async (candidateId) => {
      if (candidateId === failedId) throw new Error('model unavailable');
      const target = validManifest.targets.find((item) => item.candidateId === candidateId);
      assert(target);
      return reportCard(target, 'incomplete');
    },
  });

  assert.equal(result.results.length, 9);
  assert.deepEqual(result.failures, [{ candidateId: failedId, message: 'model unavailable' }]);
});

test('failure: event CLI rejects missing IDs and blank reviewers', () => {
  const runner = path.resolve('server/runAmyHoodDecisionAdvisor.ts');
  const missingId = spawnSync(process.execPath, [
    '--import', 'tsx', runner, 'event:approve', '--reviewer', 'Codex evidence review',
  ], { encoding: 'utf8' });
  assert.equal(missingId.status, 1);
  assert.match(missingId.stderr, /event:approve requires --id/);

  const blankReviewer = spawnSync(process.execPath, [
    '--import', 'tsx', runner, 'event:approve', '--id',
    'candidate-linkedin-acquisition-2016', '--reviewer', '   ',
  ], { encoding: 'utf8' });
  assert.equal(blankReviewer.status, 1);
  assert.match(blankReviewer.stderr, /event:approve requires a nonblank --reviewer/);
});

test('failure: pilot model settings cap output without changing the persona default', () => {
  assert.equal(modelRequestSettings('local').maxTokens, 5_000);
  assert.equal(modelRequestSettings('local', { maxTokens: 700 }).maxTokens, 700);
});

test('failure: event-card prompt requests the exact compact option contract', async () => {
  const prompt = await readFile(
    new URL('../agent_prompts/prompts/amy-hood-event-card-builder.md', import.meta.url),
    'utf8',
  );
  assert.match(prompt, /exactly two options/i);
  assert.match(prompt, /id, description,\s*expectedBenefit, principalRisk, and selected/);
  assert.match(prompt, /one concise item/i);
});

test('failure: event-card proposal retries one invalid response and accepts the second', async () => {
  const { candidate, spans, response } = await eventCardFixture();
  let calls = 0;
  const model = fakeModel(async () => {
    calls += 1;
    return {
      text: calls === 1 ? '{"options":[]}' : JSON.stringify(response),
      elapsedMs: 1,
    };
  });

  const card = await proposePilotEventCard(candidate, spans, model, {
    documentFamilyIds: ['family-a', 'family-b'],
    now: '2026-07-15T10:00:00.000Z',
  });

  assert.equal(calls, 2);
  assert.equal(card.title, response.title);
});

test('failure: discarded span errors do not block a card with validated evidence', () => {
  const validSpan: PilotEvidenceSpan = {
    id: 'valid-span',
    sourceId: 'source-valid',
    eventCandidateId: 'candidate-linkedin-acquisition-2016',
    role: 'direct_amy',
    exactQuote: 'A validated Amy Hood statement.',
    startChar: 10,
    endChar: 42,
    publishedAt: '2016-06-13',
    speaker: 'Amy Hood',
  };
  assert.deepEqual(
    retainedExtractionGaps(
      [validSpan],
      ['invalid_quote_offsets', 'model_response_invalid'],
    ),
    [],
  );
  assert.deepEqual(
    retainedExtractionGaps([], ['invalid_quote_offsets']),
    ['invalid_quote_offsets'],
  );
});
