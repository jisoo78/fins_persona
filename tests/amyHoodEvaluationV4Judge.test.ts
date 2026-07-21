/**
 * Test Plan:
 * 1. Happy Path:
 *    - Export and import one complete blind batch of forty grades.
 * 2. Edge Cases:
 *    - Accept shuffled grade order.
 *    - Accept score boundaries one and ten.
 *    - Export the same complete experiment idempotently.
 * 3. Failure Path:
 *    - Reject leaked packet fields, bad hashes, multiline rationale, and partial grade batches.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertEvaluationV4JudgePacketsBlind,
  exportEvaluationV4JudgePackets,
  importEvaluationV4Grades,
} from '../server/evaluationV4/judge';
import { gradesForPackets, installEvaluationV4GradingFixture } from './helpers/evaluationV4GradingFixture';

test('happy: exports and imports forty blind grades', async () => {
  const fixture = await installEvaluationV4GradingFixture();
  const exported = await exportEvaluationV4JudgePackets(fixture.root, fixture.groupId);
  assert.equal(exported.packets.length, 40);
  const imported = await importEvaluationV4Grades(fixture.root, fixture.groupId, gradesForPackets(exported.packets));
  assert.equal(imported.grades.length, 40);
});

test('edge: accepts shuffled grades and score boundaries', async () => {
  const fixture = await installEvaluationV4GradingFixture();
  const exported = await exportEvaluationV4JudgePackets(fixture.root, fixture.groupId);
  const grades = gradesForPackets(exported.packets).reverse();
  grades[0].score = 1;
  grades[1].score = 10;
  assert.equal((await importEvaluationV4Grades(fixture.root, fixture.groupId, grades)).grades.length, 40);
});

test('edge: packet export is idempotent', async () => {
  const fixture = await installEvaluationV4GradingFixture();
  const first = await exportEvaluationV4JudgePackets(fixture.root, fixture.groupId);
  const second = await exportEvaluationV4JudgePackets(fixture.root, fixture.groupId);
  assert.deepEqual(second, first);
});

test('failure: rejects leaked judge fields', () => {
  assert.throws(() => assertEvaluationV4JudgePacketsBlind([{ arm: 'amy_full_rag' }]), /blind packet leakage/i);
});

test('failure: rejects partial, corrupt, and multiline grade batches', async () => {
  const fixture = await installEvaluationV4GradingFixture();
  const exported = await exportEvaluationV4JudgePackets(fixture.root, fixture.groupId);
  const partial = gradesForPackets(exported.packets).slice(1);
  await assert.rejects(importEvaluationV4Grades(fixture.root, fixture.groupId, partial), /exactly forty/i);
  const corrupt = gradesForPackets(exported.packets);
  corrupt[0].packetHash = '0'.repeat(64);
  await assert.rejects(importEvaluationV4Grades(fixture.root, fixture.groupId, corrupt), /packet hash/i);
  const multiline = gradesForPackets(exported.packets);
  multiline[0].rationale = 'First line\nSecond line';
  await assert.rejects(importEvaluationV4Grades(fixture.root, fixture.groupId, multiline), /single-line/i);
});
