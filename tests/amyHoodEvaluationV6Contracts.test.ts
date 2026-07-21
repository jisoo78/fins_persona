/**
 * Test Plan:
 * 1. Happy Path:
 *    - Expose v6 evidence, audit, identity-key, Judge, and path contracts under an isolated namespace.
 * 2. Edge Cases:
 *    - Preserve all five decision domains.
 *    - Preserve the three persona experiment arms.
 *    - Resolve paths correctly when the repository root contains spaces.
 * 3. Failure Path:
 *    - Reject unsupported evidence classes and out-of-range component ratings at runtime validators.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  EVALUATION_V6_ARMS,
  EVALUATION_V6_DOMAINS,
  EVALUATION_V6_EVIDENCE_CLASSES,
  assertEvaluationV6ComponentRating,
  assertEvaluationV6EvidenceClass,
} from '../shared/amyHoodEvaluationV6';
import { evaluationV6Paths } from '../server/evaluationV6/paths';
import { runAmyHoodEvaluationV6Command } from '../server/runAmyHoodEvaluationV6';

test('happy: exposes the isolated v6 contract', () => {
  assert.equal(EVALUATION_V6_EVIDENCE_CLASSES.length, 6);
  assert.deepEqual(EVALUATION_V6_ARMS, ['amy_prompt', 'amy_policy_rag', 'amy_full_rag']);
  assert.equal(assertEvaluationV6ComponentRating(4), 4);
});

test('edge: preserves all five domains', () => {
  assert.equal(EVALUATION_V6_DOMAINS.length, 5);
  assert.equal(new Set(EVALUATION_V6_DOMAINS).size, 5);
});

test('edge: preserves all three arms', () => {
  assert.equal(EVALUATION_V6_ARMS.length, 3);
});

test('edge: resolves a root containing spaces', () => {
  assert.match(evaluationV6Paths('/tmp/Amy Hood').root, /Amy Hood\/evaluation\/v6$/);
});

test('failure: rejects unknown evidence, invalid ratings, and unsafe CLI requests', async () => {
  assert.throws(() => assertEvaluationV6EvidenceClass('reasonable_cfo'), /evidence class/i);
  assert.throws(() => assertEvaluationV6ComponentRating(5), /component rating/i);
  assert.throws(() => assertEvaluationV6ComponentRating(1.5), /component rating/i);
  await assert.rejects(runAmyHoodEvaluationV6Command(['calibrate-local']), /--base-url/i);
  await assert.rejects(runAmyHoodEvaluationV6Command(['create', '--repetitions', '2']), /1 or 5/i);
  await assert.rejects(runAmyHoodEvaluationV6Command(['judge-local', '--group', 'g']), /--repetition.*--base-url/i);
  await assert.rejects(runAmyHoodEvaluationV6Command(['formal-run']), /--candidate-base-url.*--embedding-base-url.*--judge-base-url.*--html/i);
  await assert.rejects(runAmyHoodEvaluationV6Command(['unknown']), /audit-init.*report/i);
});
