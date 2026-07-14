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
 *    - unknown experiment arms are rejected at runtime before experiment setup.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EVALUATION_V3_ARMS,
  EVALUATION_V3_REPETITIONS,
  isEvaluationV3Arm,
  type EvaluationV3Blueprint,
  type EvaluationV3BlueprintSlot,
  type DecisionDomain,
} from '../shared/amyHoodDecisionAdvisor';

const DOMAIN_ORDER: DecisionDomain[] = [
  'm_and_a',
  'ai_cloud_capex',
  'pricing_monetization',
  'cost_efficiency',
  'shareholder_return_risk',
];

const slot = (
  id: string,
  values: Omit<EvaluationV3BlueprintSlot, 'id' | 'domain' | 'scoreDimensions'>,
  index: number,
): EvaluationV3BlueprintSlot => ({
  id,
  domain: DOMAIN_ORDER[index % DOMAIN_ORDER.length],
  scoreDimensions: ['decisionSelection'],
  ...values,
});

const blueprint: EvaluationV3Blueprint = {
  dataset: 'amy_hood_decision_advisor_evaluation_blueprint',
  version: '3.0.0',
  slots: [
    ...Array.from({ length: 10 }, (_, index) =>
      slot(
        `amy-specific-${index + 1}`,
        {
          category: 'amy_specific_discrimination',
          type: 'multiple_choice',
          requiredSplit: 'train',
        },
        index,
      ),
    ),
    ...Array.from({ length: 10 }, (_, index) =>
      slot(
        `temporal-holdout-${index + 1}`,
        {
          category: 'temporal_holdout',
          type: 'multiple_choice',
          requiredSplit: 'holdout',
        },
        index,
      ),
    ),
    ...Array.from({ length: 6 }, (_, index) =>
      slot(
        `counterfactual-${index + 1}`,
        {
          category: 'counterfactual_pair',
          type: 'multiple_choice',
          pairId: `counterfactual-pair-${Math.floor(index / 2) + 1}`,
          pairVariant: index % 2 === 0 ? 'a' : 'b',
          requiredSplit: 'none',
        },
        index,
      ),
    ),
    ...Array.from({ length: 4 }, (_, index) =>
      slot(
        `advisory-${index + 1}`,
        {
          category: 'new_advisory_scenario',
          type: 'subjective',
          requiredSplit: 'development',
        },
        index + 1,
      ),
    ),
  ],
};

test('happy: v3 fixes thirty slots, four arms, and five repetitions', () => {
  assert.deepEqual(EVALUATION_V3_ARMS, [
    'generic_cfo',
    'amy_prompt',
    'amy_policy_rag',
    'amy_full_rag',
  ]);
  assert.equal(EVALUATION_V3_REPETITIONS, 5);
  assert.equal(blueprint.version, '3.0.0');
  assert.equal(blueprint.slots.length, 30);
  assert.deepEqual(
    Object.fromEntries(
      ['amy_specific_discrimination', 'temporal_holdout', 'counterfactual_pair', 'new_advisory_scenario'].map(
        (category) => [category, blueprint.slots.filter((candidate) => candidate.category === category).length],
      ),
    ),
    {
      amy_specific_discrimination: 10,
      temporal_holdout: 10,
      counterfactual_pair: 6,
      new_advisory_scenario: 4,
    },
  );
});

test('edge: counterfactual slots preserve pair IDs and opposite variants', () => {
  const pairShape = blueprint.slots
    .filter((candidate) => candidate.category === 'counterfactual_pair')
    .map((candidate) => [candidate.pairId, candidate.pairVariant]);

  assert.deepEqual(
    pairShape,
    [
      ['counterfactual-pair-1', 'a'],
      ['counterfactual-pair-1', 'b'],
      ['counterfactual-pair-2', 'a'],
      ['counterfactual-pair-2', 'b'],
      ['counterfactual-pair-3', 'a'],
      ['counterfactual-pair-3', 'b'],
    ],
  );
});

test('edge: deterministic ordering retains all five decision domains', () => {
  assert.deepEqual([...new Set(blueprint.slots.map((candidate) => candidate.domain))], DOMAIN_ORDER);
  assert.deepEqual(
    DOMAIN_ORDER.map((domain) => blueprint.slots.filter((candidate) => candidate.domain === domain).length),
    [6, 6, 6, 6, 6],
  );
});

test('edge: four advisory slots are subjective and the remaining slots are multiple-choice', () => {
  const subjective = blueprint.slots.filter((candidate) => candidate.type === 'subjective');
  const multipleChoice = blueprint.slots.filter((candidate) => candidate.type === 'multiple_choice');

  assert.equal(subjective.length, 4);
  assert.ok(subjective.every((candidate) => candidate.category === 'new_advisory_scenario'));
  assert.equal(multipleChoice.length, 26);
});

test('failure: rejects an unknown experiment arm before experiment setup', () => {
  assert.equal(isEvaluationV3Arm('amy_full_rag'), true);
  assert.equal(isEvaluationV3Arm('unknown_arm'), false);
});
