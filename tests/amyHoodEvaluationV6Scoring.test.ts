/**
 * Test Plan:
 * 1. Happy Path:
 *    - Convert five fully aligned component ratings into an uncapped and final score of 10.
 * 2. Edge Cases:
 *    - Cap a fluent generic CFO answer at 6.
 *    - Cap a correct action with materially different priority order at 7.
 *    - Apply the strictest ceiling when missing reversal and identity conflict overlap.
 * 3. Failure Path:
 *    - Reject missing, fractional, negative, and above-four component ratings.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { EvaluationV6JudgeAssessment } from '../shared/amyHoodEvaluationV6';
import { computeEvaluationV6IdentityScore } from '../server/evaluationV6/scoring';

const assessment = (overrides: Partial<EvaluationV6JudgeAssessment> = {}): EvaluationV6JudgeAssessment => ({
  rationale: '고객 수요를 먼저 확인하고 경제성과 반전 경계를 보존했다.',
  identityVerdict: 'amy_aligned',
  components: { action: 4, priorityOrder: 4, boundaries: 4, reversal: 4, identitySpecificity: 4 },
  anchorFindings: { action: 'aligned', priority: 'aligned', guardrails: 'aligned', reversal: 'aligned' },
  distinguishingAnchor: { kind: 'priority_order', statement: 'Customer demand comes first.' },
  ...overrides,
});

test('happy: fully aligned Amy components score ten', () => {
  assert.deepEqual(computeEvaluationV6IdentityScore(assessment()), {
    score: 10,
    uncappedScore: 10,
    ceilingApplied: [],
  });
});

test('edge: generic CFO answer is capped at six', () => {
  const result = computeEvaluationV6IdentityScore(assessment({ identityVerdict: 'generic_cfo' }));
  assert.equal(result.score, 6);
  assert.deepEqual(result.ceilingApplied, ['generic_cfo_max_6']);
});

test('edge: correct action with materially different priority is capped at seven', () => {
  const result = computeEvaluationV6IdentityScore(assessment({
    components: { action: 4, priorityOrder: 1, boundaries: 4, reversal: 4, identitySpecificity: 3 },
  }));
  assert.equal(result.score, 7);
  assert.equal(result.ceilingApplied.includes('priority_mismatch_max_7'), true);
});

test('edge: identity conflict applies the strictest overlapping ceiling', () => {
  const result = computeEvaluationV6IdentityScore(assessment({
    identityVerdict: 'amy_conflict',
    components: { action: 4, priorityOrder: 4, boundaries: 4, reversal: 0, identitySpecificity: 4 },
  }));
  assert.equal(result.score, 4);
  assert.deepEqual(result.ceilingApplied, ['identity_conflict_max_4']);
});

test('failure: invalid component ratings fail safely', () => {
  const components = assessment().components as Record<string, unknown>;
  for (const invalid of [-1, 1.5, 5, undefined]) {
    const value = assessment({ components: { ...components, action: invalid } as never });
    assert.throws(() => computeEvaluationV6IdentityScore(value), /component rating/i);
  }
});
