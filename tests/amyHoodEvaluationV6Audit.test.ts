/**
 * Test Plan:
 * 1. Happy Path:
 *    - Accept exactly thirty reviewed audit records when every replaced item has one admitted replacement.
 * 2. Edge Cases:
 *    - Accept reviewed bounded policy transfer with direct Amy evidence.
 *    - Accept domain reallocation when the replacement has qualifying Amy evidence.
 *    - Accept one Amy event across distinct decision axes.
 * 3. Failure Path:
 *    - Reject unsupported reversals, missing evidence, duplicate mappings, same-axis reuse, and research-required replacements.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  EvaluationV6ItemAudit,
  EvaluationV6ReplacementRecord,
} from '../shared/amyHoodEvaluationV6';
import {
  assertEvaluationV6AuditReady,
  validateEvaluationV6Audit,
} from '../server/evaluationV6/audit';

const scenarioIds = Array.from({ length: 30 }, (_, index) => `AAS-V5-T-${index + 1}`);
const fixture = () => {
  const audits: EvaluationV6ItemAudit[] = scenarioIds.map((scenarioId, index) => ({
    scenarioId,
    domain: index % 2 === 0 ? 'ai_cloud_capex' : 'cost_efficiency',
    policyId: `policy-${index}`,
    decisionAxis: `axis-${index}`,
    amyDirectEvidenceIds: [`evidence-${index}`],
    amySupportingEventIds: [`event-${index}`],
    amyContrastingEventIds: index % 2 === 0 ? [`contrast-${index}`] : [],
    explicitReversalEvidenceIds: index % 2 === 0 ? [] : [`reversal-${index}`],
    externalMotifEventId: `external-${index}`,
    keyEvidenceClass: index % 2 === 0 ? 'contrast_observed' : 'bounded_policy_transfer',
    requiresObservedReversal: true,
    identityDiscriminability: 'passed',
    decision: 'retain',
    rationale: 'Amy evidence establishes the action and boundary.',
    reviewer: 'Codex',
    reviewedAt: '2026-07-21T12:00:00.000Z',
  }));
  for (const index of [1, 3, 5, 7]) {
    audits[index] = {
      ...audits[index],
      amyDirectEvidenceIds: [],
      keyEvidenceClass: 'unsupported_reversal',
      identityDiscriminability: 'failed',
      decision: 'replace',
    };
  }
  const replacements: EvaluationV6ReplacementRecord[] = [1, 3, 5, 7].map((index) => ({
    predecessorScenarioId: scenarioIds[index],
    replacementScenarioId: `AAS-V6-R-${index}`,
    originalDomain: audits[index].domain,
    replacementDomain: index === 7 ? 'shareholder_return_risk' : audits[index].domain,
    reason: 'Replace unsupported reversal with an observed Amy boundary.',
    amyEvidenceIds: [`replacement-evidence-${index}`],
    externalMotifEventId: `external-replacement-${index}`,
    status: 'admitted',
    reviewer: 'Codex',
    reviewedAt: '2026-07-21T12:10:00.000Z',
  }));
  return { audits, replacements };
};

test('happy: accepts thirty reviewed audit records with complete replacements', () => {
  const input = fixture();
  const result = validateEvaluationV6Audit(input.audits, input.replacements, scenarioIds);
  assert.equal(result.retainedCount, 26);
  assert.equal(result.replacedCount, 4);
  assert.doesNotThrow(() => assertEvaluationV6AuditReady(result));
});

test('edge: accepts a reviewed bounded policy transfer with direct Amy evidence', () => {
  const input = fixture();
  input.audits[0].keyEvidenceClass = 'bounded_policy_transfer';
  assert.equal(validateEvaluationV6Audit(input.audits, input.replacements, scenarioIds).ready, true);
});

test('edge: accepts an admitted domain reallocation', () => {
  const input = fixture();
  assert.notEqual(input.replacements[3].originalDomain, input.replacements[3].replacementDomain);
  assert.equal(validateEvaluationV6Audit(input.audits, input.replacements, scenarioIds).ready, true);
});

test('edge: accepts one Amy event across distinct decision axes', () => {
  const input = fixture();
  input.audits[0].amySupportingEventIds = ['shared-event'];
  input.audits[2].amySupportingEventIds = ['shared-event'];
  input.audits[0].decisionAxis = 'capacity-scale';
  input.audits[2].decisionAxis = 'project-pacing';
  assert.equal(validateEvaluationV6Audit(input.audits, input.replacements, scenarioIds).ready, true);
});

test('failure: rejects unsafe or incomplete audit states', () => {
  const unsupported = fixture();
  unsupported.audits[0].keyEvidenceClass = 'unsupported_reversal';
  assert.throws(
    () => validateEvaluationV6Audit(unsupported.audits, unsupported.replacements, scenarioIds),
    /not admissible/i,
  );

  const missingEvidence = fixture();
  missingEvidence.audits[0].amyDirectEvidenceIds = [];
  assert.throws(
    () => validateEvaluationV6Audit(missingEvidence.audits, missingEvidence.replacements, scenarioIds),
    /direct Amy evidence/i,
  );

  const noReversal = fixture();
  noReversal.audits[0].amyContrastingEventIds = [];
  noReversal.audits[0].explicitReversalEvidenceIds = [];
  assert.throws(
    () => validateEvaluationV6Audit(noReversal.audits, noReversal.replacements, scenarioIds),
    /observed Amy evidence/i,
  );

  const duplicate = fixture();
  duplicate.replacements[1].replacementScenarioId = duplicate.replacements[0].replacementScenarioId;
  assert.throws(
    () => validateEvaluationV6Audit(duplicate.audits, duplicate.replacements, scenarioIds),
    /replacement ledger/i,
  );

  const sameAxis = fixture();
  sameAxis.audits[0].amySupportingEventIds = ['shared-event'];
  sameAxis.audits[2].amySupportingEventIds = ['shared-event'];
  sameAxis.audits[0].decisionAxis = 'same-axis';
  sameAxis.audits[2].decisionAxis = 'same-axis';
  assert.throws(
    () => validateEvaluationV6Audit(sameAxis.audits, sameAxis.replacements, scenarioIds),
    /same decision axis/i,
  );

  const pending = fixture();
  pending.replacements[0].status = 'research_required';
  pending.replacements[0].reviewer = null;
  pending.replacements[0].reviewedAt = null;
  assert.throws(
    () => validateEvaluationV6Audit(pending.audits, pending.replacements, scenarioIds),
    /replacement ledger/i,
  );
});
