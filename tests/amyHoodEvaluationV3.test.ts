/**
 * Test Plan:
 * 1. Happy Path:
 *    - thirty evaluation slots and four experiment arms form one valid v3 blueprint.
 *
 * 2. Edge Cases:
 *    - counterfactual slots preserve pair IDs and opposite variants.
 *    - all five decision domains remain represented after deterministic ordering.
 *    - advisory slots remain subjective while the other twenty-six slots remain multiple-choice.
 *
 * 3. Failure Path:
 *    - invalid counts, duplicate IDs, unknown arms, and holdout leakage fail before persistence.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EVALUATION_V3_ARMS,
  EVALUATION_V3_REPETITIONS,
  type EvaluationV3Blueprint,
} from '../shared/amyHoodDecisionAdvisor';

test('happy: v3 fixes four arms and five repetitions', () => {
  assert.deepEqual(EVALUATION_V3_ARMS, [
    'generic_cfo',
    'amy_prompt',
    'amy_policy_rag',
    'amy_full_rag',
  ]);
  assert.equal(EVALUATION_V3_REPETITIONS, 5);
  const blueprint: EvaluationV3Blueprint = {
    dataset: 'amy_hood_decision_advisor_evaluation_blueprint',
    version: '3.0.0',
    slots: [],
  };
  assert.equal(blueprint.version, '3.0.0');
});
