/**
 * Test Plan:
 * 1. Happy Path:
 *    - Approve all 30 aligned/generic/conflict triplets when identity and gap gates pass.
 * 2. Edge Cases:
 *    - Accept aligned score 8 and generic score 6 at their exact boundaries.
 *    - Accept one repaired schema-valid Judge response.
 *    - Accept shuffled answers and grades through exact packet-ID mapping.
 * 3. Failure Path:
 *    - Reject incomplete triplets, generic leakage, a weak identity gap, or a wrong Amy anchor.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { EvaluationV6Grade } from '../shared/amyHoodEvaluationV6';
import { validateEvaluationV6Calibration } from '../server/evaluationV6/calibration';
import { evaluationV6BundleFixture } from './helpers/evaluationV6Fixture';

const fixture = evaluationV6BundleFixture();
const gradeFor = (answer: typeof fixture.calibrationAnswers[number]): EvaluationV6Grade => {
  const aligned = answer.answerType === 'amy_aligned';
  const generic = answer.answerType === 'generic_cfo';
  return {
    packetId: answer.calibrationId,
    packetHash: 'a'.repeat(64),
    rationale: `판별 근거는 ${answer.expectedAnchorTerms[0]} 이다.`,
    identityVerdict: aligned ? 'amy_aligned' : generic ? 'generic_cfo' : 'amy_conflict',
    components: { action: aligned ? 4 : 1, priorityOrder: aligned ? 4 : generic ? 2 : 0, boundaries: aligned ? 4 : 1, reversal: aligned ? 4 : 1, identitySpecificity: aligned ? 4 : 1 },
    anchorFindings: { action: aligned ? 'aligned' : 'conflict', priority: aligned ? 'aligned' : 'conflict', guardrails: aligned ? 'aligned' : 'missing', reversal: aligned ? 'aligned' : 'missing' },
    distinguishingAnchor: { kind: answer.expectedAnchor, statement: answer.expectedAnchorTerms[0] },
    score: aligned ? 9 : generic ? 6 : 4,
    uncappedScore: aligned ? 9 : generic ? 6 : 4,
    ceilingApplied: generic ? ['generic_cfo_max_6'] : aligned ? [] : ['identity_conflict_max_4'],
    judgeProvider: 'local',
    judgeModel: 'judge.gguf',
    rationalePromptHash: 'b'.repeat(64),
    assessmentPromptHash: 'c'.repeat(64),
    repairApplied: false,
    gradedAt: '2026-07-21T12:00:00.000Z',
  };
};
const grades = () => fixture.calibrationAnswers.map(gradeFor);

test('happy: passes complete identity-discriminating triplets', () => {
  const result = validateEvaluationV6Calibration(fixture.calibrationAnswers, grades());
  assert.equal(result.passed, true);
  assert.equal(result.metrics.amyPassRate, 1);
  assert.equal(result.metrics.meanIdentityGap, 3);
});

test('edge: accepts exact aligned and generic score boundaries', () => {
  const values = grades();
  values.find(({ packetId }) => packetId.endsWith('-aligned'))!.score = 8;
  assert.equal(validateEvaluationV6Calibration(fixture.calibrationAnswers, values).passed, true);
});

test('edge: accepts a repaired but schema-valid grade', () => {
  const values = grades();
  values[0].repairApplied = true;
  assert.equal(validateEvaluationV6Calibration(fixture.calibrationAnswers, values).metrics.schemaValidRate, 1);
});

test('edge: maps shuffled answers and grades by exact IDs', () => {
  const result = validateEvaluationV6Calibration(
    [...fixture.calibrationAnswers].reverse(),
    grades().sort((left, right) => right.packetId.localeCompare(left.packetId)),
  );
  assert.equal(result.passed, true);
});

test('failure: rejects incomplete, leaked, weak-gap, and wrong-anchor batches', () => {
  assert.throws(() => validateEvaluationV6Calibration(fixture.calibrationAnswers.slice(1), grades()), /exactly ninety/i);
  const leaked = grades();
  leaked.find(({ packetId }) => packetId.endsWith('-generic'))!.score = 7;
  assert.throws(() => validateEvaluationV6Calibration(fixture.calibrationAnswers, leaked), /failed/i);
  const weak = grades().map((grade) => grade.packetId.endsWith('-aligned') ? { ...grade, score: 8 as const } : grade);
  assert.throws(() => validateEvaluationV6Calibration(fixture.calibrationAnswers, weak), /failed/i);
  const wrong = grades();
  wrong[0].distinguishingAnchor.kind = 'action';
  assert.throws(() => validateEvaluationV6Calibration(fixture.calibrationAnswers, wrong), /wrong.*anchor/i);
});
