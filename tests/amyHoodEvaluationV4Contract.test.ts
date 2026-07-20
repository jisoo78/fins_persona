/**
 * Test Plan:
 * 1. Happy Path:
 *    - Parse a complete candidate response and resolve every V4 directory under evaluation/v4.
 *
 * 2. Edge Cases:
 *    - Accept a fenced JSON response from the local model.
 *    - Trim string fields without changing priority order.
 *    - Accept multiple non-empty guardrails and reversal signals.
 *
 * 3. Failure Path:
 *    - Reject unknown fields, empty arrays, and priorities whose length is not exactly three.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseEvaluationV4CandidateResponse } from '../shared/amyHoodEvaluationV4';
import { evaluationV4Paths } from '../server/evaluationV4/paths';

const valid = {
  action: 'Stage the investment behind verified contracted demand.',
  priorities: ['verified demand', 'liquidity capacity', 'integration milestones'],
  guardrails: ['keep minimum liquidity intact'],
  reversalSignals: ['pipeline conversion falls below the approved threshold'],
  rationale: 'The sequence protects strategic capacity while preserving reversibility.',
};

test('happy: parses the public response contract and keeps V4 isolated', () => {
  assert.deepEqual(parseEvaluationV4CandidateResponse(JSON.stringify(valid)), valid);
  const paths = evaluationV4Paths('/repo');
  assert.equal(paths.root, '/repo/evaluation/v4');
  assert.equal(paths.scenarios, '/repo/evaluation/v4/public/scenarios.json');
  assert.equal(paths.alignmentKey, '/repo/evaluation/v4/sealed/scenario-key.json');
});

test('edge: accepts fenced JSON', () => {
  const fenced = ['```json', JSON.stringify(valid), '```'].join('\n');
  assert.deepEqual(parseEvaluationV4CandidateResponse(fenced), valid);
});

test('edge: normalizes whitespace without reordering priorities', () => {
  const result = parseEvaluationV4CandidateResponse(JSON.stringify({
    ...valid,
    action: `  ${valid.action}  `,
    priorities: valid.priorities.map((value) => ` ${value} `),
  }));
  assert.equal(result.action, valid.action);
  assert.deepEqual(result.priorities, valid.priorities);
});

test('edge: preserves multiple guardrails and reversal signals', () => {
  const result = parseEvaluationV4CandidateResponse(JSON.stringify({
    ...valid,
    guardrails: ['liquidity floor', 'milestone review'],
    reversalSignals: ['demand weakens', 'economics change'],
  }));
  assert.equal(result.guardrails.length, 2);
  assert.equal(result.reversalSignals.length, 2);
});

test('failure: rejects malformed or expanded public output', () => {
  assert.throws(() => parseEvaluationV4CandidateResponse(JSON.stringify({
    ...valid,
    priorities: ['only', 'two'],
  })), /priorities requires exactly 3 values/);
  assert.throws(() => parseEvaluationV4CandidateResponse(JSON.stringify({
    ...valid,
    score: 10,
  })), /unknown candidate response field: score/);
  assert.throws(() => parseEvaluationV4CandidateResponse(JSON.stringify({
    ...valid,
    guardrails: [],
  })), /guardrails requires non-empty strings/);
});
