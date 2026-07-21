/**
 * Test Plan:
 * 1. Happy Path:
 *    - Parse the exact V5 public response contract and expose only the three approved experiment arms.
 * 2. Edge Cases:
 *    - Accept one JSON response wrapped in a markdown fence.
 *    - Normalize surrounding whitespace without changing priority order.
 *    - Preserve multiple non-empty guardrails and reversal signals.
 * 3. Failure Path:
 *    - Reject malformed JSON, unknown fields, empty arrays, and the removed generic CFO arm.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EVALUATION_V5_ARMS,
  parseEvaluationV5CandidateResponse,
} from '../shared/amyHoodEvaluationV5';

const valid = {
  action: 'Proceed in bounded stages.',
  priorities: ['Demand', 'Economics', 'Execution'],
  guardrails: ['Keep liquidity above the approved floor.'],
  reversalSignals: ['Pause when demand weakens materially.'],
  rationale: 'The action follows observable demand and preserves reversibility.',
};

test('happy: parses the public response and exposes three Amy arms', () => {
  assert.deepEqual(parseEvaluationV5CandidateResponse(JSON.stringify(valid)), valid);
  assert.deepEqual(EVALUATION_V5_ARMS, ['amy_prompt', 'amy_policy_rag', 'amy_full_rag']);
  assert.equal(EVALUATION_V5_ARMS.includes('generic_cfo' as never), false);
});

test('edge: accepts fenced JSON', () => {
  assert.deepEqual(
    parseEvaluationV5CandidateResponse(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``),
    valid,
  );
});

test('edge: trims values without changing priority order', () => {
  const parsed = parseEvaluationV5CandidateResponse(JSON.stringify({
    ...valid,
    action: '  Proceed in bounded stages.  ',
    priorities: [' Demand ', ' Economics ', ' Execution '],
  }));
  assert.equal(parsed.action, valid.action);
  assert.deepEqual(parsed.priorities, valid.priorities);
});

test('edge: preserves multiple guardrails and reversal signals', () => {
  const parsed = parseEvaluationV5CandidateResponse(JSON.stringify({
    ...valid,
    guardrails: ['Liquidity floor', 'Return threshold'],
    reversalSignals: ['Demand weakens', 'Unit economics deteriorate'],
  }));
  assert.deepEqual(parsed.guardrails, ['Liquidity floor', 'Return threshold']);
  assert.deepEqual(parsed.reversalSignals, ['Demand weakens', 'Unit economics deteriorate']);
});

test('failure: rejects malformed and expanded response contracts', () => {
  assert.throws(() => parseEvaluationV5CandidateResponse('not-json'), /valid JSON/i);
  assert.throws(() => parseEvaluationV5CandidateResponse(JSON.stringify({ ...valid, hiddenPolicyId: 'p1' })), /unknown/i);
  assert.throws(() => parseEvaluationV5CandidateResponse(JSON.stringify({ ...valid, guardrails: [] })), /non-empty/i);
  assert.throws(() => parseEvaluationV5CandidateResponse(JSON.stringify({ ...valid, priorities: ['one', 'two'] })), /exactly 3/i);
});
