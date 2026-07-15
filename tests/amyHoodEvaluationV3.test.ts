/**
 * Test Plan:
 * 1. Happy Path:
 *    - the approved D10/H10/C6/T4 all-MC blueprint and four arms validate.
 * 2. Edge Cases:
 *    - one repetition creates four runs in stable arm order.
 *    - five repetitions create twenty unique repetition-arm entries.
 *    - all five decision domains remain represented.
 * 3. Failure Path:
 *    - subjective slots, invalid counts, malformed pairs, unknown arms, and repetition values other than 1 or 5 fail safely.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EVALUATION_V3_ARMS,
  isEvaluationV3Arm,
  type DecisionDomain,
  type EvaluationV3Blueprint,
} from '../shared/amyHoodDecisionAdvisor';
import {
  assertEvaluationV3Blueprint,
  loadEvaluationV3Blueprint,
} from '../server/evaluationV3/blueprint';
import { createEvaluationV3ExperimentPlan } from '../server/evaluationV3/experimentPlan';

const expectedIds = [
  ...Array.from({ length: 10 }, (_, index) => `D${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 10 }, (_, index) => `H${String(index + 1).padStart(2, '0')}`),
  'C01A', 'C01B', 'C02A', 'C02B', 'C03A', 'C03B',
  'T01', 'T02', 'T03', 'T04',
];

test('happy: approved v3 contract is thirty all-MC slots and four arms', async () => {
  const blueprint = await loadEvaluationV3Blueprint(process.cwd());
  assert.doesNotThrow(() => assertEvaluationV3Blueprint(blueprint));
  assert.deepEqual(blueprint.slots.map(({ id }) => id), expectedIds);
  assert.ok(blueprint.slots.every(({ type }) => type === 'multiple_choice'));
  assert.deepEqual(EVALUATION_V3_ARMS, [
    'generic_cfo',
    'amy_prompt',
    'amy_policy_rag',
    'amy_full_rag',
  ]);
});

test('edge: one repetition creates four runs in stable arm order', () => {
  assert.deepEqual(createEvaluationV3ExperimentPlan(1), [
    { arm: 'generic_cfo', repetition: 1 },
    { arm: 'amy_prompt', repetition: 1 },
    { arm: 'amy_policy_rag', repetition: 1 },
    { arm: 'amy_full_rag', repetition: 1 },
  ]);
});

test('edge: five repetitions create twenty unique repetition-arm entries', () => {
  const plan = createEvaluationV3ExperimentPlan(5);
  assert.equal(plan.length, 20);
  assert.equal(new Set(plan.map(({ arm, repetition }) => `${repetition}:${arm}`)).size, 20);
  assert.deepEqual(plan.slice(4, 8).map(({ repetition }) => repetition), [2, 2, 2, 2]);
});

test('edge: all five decision domains remain represented', async () => {
  const blueprint = await loadEvaluationV3Blueprint(process.cwd());
  const domains: DecisionDomain[] = [
    'm_and_a',
    'ai_cloud_capex',
    'pricing_monetization',
    'cost_efficiency',
    'shareholder_return_risk',
  ];
  assert.deepEqual([...new Set(blueprint.slots.map(({ domain }) => domain))], domains);
});

test('failure: invalid v3 contracts fail before experiment setup', async () => {
  const blueprint = await loadEvaluationV3Blueprint(process.cwd());

  const subjective = structuredClone(blueprint) as EvaluationV3Blueprint;
  (subjective.slots[29] as { type: string }).type = 'subjective';
  assert.throws(() => assertEvaluationV3Blueprint(subjective), /multiple-choice/);

  const short = structuredClone(blueprint) as EvaluationV3Blueprint;
  short.slots.pop();
  assert.throws(() => assertEvaluationV3Blueprint(short), /30/);

  const malformedPair = structuredClone(blueprint) as EvaluationV3Blueprint;
  const pair = malformedPair.slots.find(({ id }) => id === 'C03B');
  assert.ok(pair);
  (pair as { pairId?: string }).pairId = 'C04';
  assert.throws(() => assertEvaluationV3Blueprint(malformedPair), /counterfactual pair/);

  assert.equal(isEvaluationV3Arm('unknown_arm'), false);
  assert.throws(
    () => createEvaluationV3ExperimentPlan(2 as 1),
    /repetitions must be 1 or 5/,
  );
});
