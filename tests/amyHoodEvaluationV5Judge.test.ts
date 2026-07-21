/**
 * Test Plan:
 * 1. Happy Path:
 *    - Export and import 450 individual grades and 225 pair-level behavior-change grades.
 * 2. Edge Cases:
 *    - Accept shuffled individual and pair grade order with individual scores at 1 and 10.
 *    - Export identical blind packet batches idempotently.
 *    - Keep initial and changed candidate responses paired after packet sorting.
 * 3. Failure Path:
 *    - Reject leaked fields, bad hashes, multiline rationales, and partial grade batches.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertEvaluationV5JudgePacketsBlind,
  exportEvaluationV5JudgePackets,
  exportEvaluationV5PairJudgePackets,
  importEvaluationV5Grades,
  importEvaluationV5PairGrades,
  loadEvaluationV5PairJudgeLinks,
} from '../server/evaluationV5/judge';
import {
  gradesForV5Packets,
  installEvaluationV5GradingFixture,
  pairGradesForV5Packets,
} from './helpers/evaluationV5GradingFixture';

test('happy: exports and imports complete individual and pair batches', async () => {
  const fixture = await installEvaluationV5GradingFixture();
  const individuals = await exportEvaluationV5JudgePackets(fixture.root, fixture.groupId);
  const pairs = await exportEvaluationV5PairJudgePackets(fixture.root, fixture.groupId);
  assert.equal(individuals.packets.length, 450);
  assert.equal(pairs.packets.length, 225);
  assert.equal((await importEvaluationV5Grades(
    fixture.root,
    fixture.groupId,
    gradesForV5Packets(individuals.packets),
  )).grades.length, 450);
  assert.equal((await importEvaluationV5PairGrades(
    fixture.root,
    fixture.groupId,
    pairGradesForV5Packets(pairs.packets),
  )).grades.length, 225);
});

test('edge: accepts shuffled grades and individual score boundaries', async () => {
  const fixture = await installEvaluationV5GradingFixture();
  const individuals = await exportEvaluationV5JudgePackets(fixture.root, fixture.groupId);
  const pairs = await exportEvaluationV5PairJudgePackets(fixture.root, fixture.groupId);
  const grades = gradesForV5Packets(individuals.packets).reverse();
  grades[0].score = 1;
  grades[1].score = 10;
  const pairGrades = pairGradesForV5Packets(pairs.packets).reverse();
  assert.equal((await importEvaluationV5Grades(fixture.root, fixture.groupId, grades)).grades.length, 450);
  assert.equal((await importEvaluationV5PairGrades(fixture.root, fixture.groupId, pairGrades)).grades.length, 225);
});

test('edge: individual and pair exports are idempotent', async () => {
  const fixture = await installEvaluationV5GradingFixture();
  const firstIndividuals = await exportEvaluationV5JudgePackets(fixture.root, fixture.groupId);
  const firstPairs = await exportEvaluationV5PairJudgePackets(fixture.root, fixture.groupId);
  assert.deepEqual(await exportEvaluationV5JudgePackets(fixture.root, fixture.groupId), firstIndividuals);
  assert.deepEqual(await exportEvaluationV5PairJudgePackets(fixture.root, fixture.groupId), firstPairs);
});

test('edge: pair packets retain both candidates after blind sorting', async () => {
  const fixture = await installEvaluationV5GradingFixture();
  const exported = await exportEvaluationV5PairJudgePackets(fixture.root, fixture.groupId);
  const links = await loadEvaluationV5PairJudgeLinks(fixture.root, fixture.groupId);
  assert.equal(links.links.length, exported.packets.length);
  for (const packet of exported.packets) {
    assert.match(packet.initialCandidateResponse.action, /^Initial bounded recommendation/);
    assert.match(packet.changedCandidateResponse.action, /^Changed bounded recommendation/);
    assert.equal(links.links.some(({ packetId }) => packetId === packet.packetId), true);
  }
});

test('failure: rejects leaked judge fields', () => {
  assert.throws(
    () => assertEvaluationV5JudgePacketsBlind([{ arm: 'amy_full_rag' }]),
    /blind packet leakage/i,
  );
  assert.throws(
    () => assertEvaluationV5JudgePacketsBlind([{ scenarioId: 'sealed-id' }]),
    /blind packet leakage/i,
  );
});

test('failure: rejects partial, corrupt, and multiline grade batches', async () => {
  const fixture = await installEvaluationV5GradingFixture();
  const individuals = await exportEvaluationV5JudgePackets(fixture.root, fixture.groupId);
  const pairs = await exportEvaluationV5PairJudgePackets(fixture.root, fixture.groupId);
  await assert.rejects(
    importEvaluationV5Grades(fixture.root, fixture.groupId, gradesForV5Packets(individuals.packets).slice(1)),
    /exactly 450/i,
  );
  const corrupt = pairGradesForV5Packets(pairs.packets);
  corrupt[0].packetHash = '0'.repeat(64);
  await assert.rejects(
    importEvaluationV5PairGrades(fixture.root, fixture.groupId, corrupt),
    /packet hash/i,
  );
  const multiline = gradesForV5Packets(individuals.packets);
  multiline[0].rationale = 'First line\nSecond line';
  await assert.rejects(
    importEvaluationV5Grades(fixture.root, fixture.groupId, multiline),
    /single-line/i,
  );
});
