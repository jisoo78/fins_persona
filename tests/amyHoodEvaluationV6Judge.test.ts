/**
 * Test Plan:
 * 1. Happy Path:
 *    - Build blind identity packets and atomically activate a complete reproducible grade batch.
 * 2. Edge Cases:
 *    - Remove sealed evidence identifiers while retaining the substantive Amy Identity Key.
 *    - Reject nested generation-condition or retrieval leakage from a purported blind packet.
 *    - Accept shuffled grades when packet IDs and hashes map exactly once.
 * 3. Failure Path:
 *    - Reject partial or stale grade batches without creating or moving active.json.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { EvaluationV6Grade } from '../shared/amyHoodEvaluationV6';
import {
  assertEvaluationV6JudgePacketsBlind,
  buildEvaluationV6JudgePacket,
  importEvaluationV6Grades,
} from '../server/evaluationV6/judge';
import { writeJsonAtomic } from '../server/decisionAdvisor/jsonStore';
import { evaluationV6BundleFixture } from './helpers/evaluationV6Fixture';

const makeGrade = (packet: ReturnType<typeof buildEvaluationV6JudgePacket>): EvaluationV6Grade => ({
  packetId: packet.packetId,
  packetHash: packet.packetHash,
  rationale: '고객 수요를 먼저 확인하고 수익성과 반전 조건을 함께 둔 판단이다.',
  identityVerdict: 'amy_aligned',
  components: { action: 4, priorityOrder: 4, boundaries: 4, reversal: 4, identitySpecificity: 4 },
  anchorFindings: { action: 'aligned', priority: 'aligned', guardrails: 'aligned', reversal: 'aligned' },
  distinguishingAnchor: { kind: 'priority_order', statement: 'customer demand first' },
  score: 10,
  uncappedScore: 10,
  ceilingApplied: [],
  judgeProvider: 'local',
  judgeModel: 'judge.gguf',
  rationalePromptHash: 'a'.repeat(64),
  assessmentPromptHash: 'b'.repeat(64),
  repairApplied: false,
  gradedAt: '2026-07-21T12:00:00.000Z',
});

const twoPackets = () => {
  const fixture = evaluationV6BundleFixture();
  return fixture.scenarioFile.scenarios.slice(0, 2).map((scenario) => buildEvaluationV6JudgePacket(
    scenario,
    fixture.calibrationAnswers.find(({ scenarioId, answerType }) =>
      scenarioId === scenario.id && answerType === 'amy_aligned')!.candidateResponse,
    fixture.identityKeys.find(({ scenarioId }) => scenarioId === scenario.id)!,
    `packet-${scenario.id}`,
  ));
};

test('happy: activates a complete reproducible blind grade batch', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evaluation-v6-judge-'));
  const packets = twoPackets();
  const directory = path.join(root, 'evaluation/v6/judge/packets/group-1');
  await writeJsonAtomic(path.join(directory, 'individual-packets.json'), {
    experimentGroupId: 'group-1', batchHash: 'c'.repeat(64), packets,
  });
  const result = await importEvaluationV6Grades(root, 'group-1', packets.map(makeGrade));
  assert.equal(result.grades.length, 2);
  const active = JSON.parse(await readFile(
    path.join(root, 'evaluation/v6/judge/grades/group-1/active.json'), 'utf8',
  )) as { batchHash: string };
  assert.equal(active.batchHash, result.batchHash);
});

test('edge: packet retains policy substance but strips sealed provenance', () => {
  const [packet] = twoPackets();
  assert.equal(packet.identityKey.amyPriorityOrder[0], 'Customer demand');
  assert.equal('amyEvidenceIds' in packet.identityKey, false);
  assert.equal('policyId' in packet.identityKey, false);
});

test('edge: blind validator rejects nested experimental leakage', () => {
  assert.throws(() => assertEvaluationV6JudgePacketsBlind({ packet: { retrieval: { hits: [] } } }), /leakage.*retrieval/i);
});

test('edge: shuffled grades activate when identities are complete', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evaluation-v6-shuffle-'));
  const packets = twoPackets();
  await writeJsonAtomic(path.join(root, 'evaluation/v6/judge/packets/group-2/individual-packets.json'), {
    experimentGroupId: 'group-2', batchHash: 'd'.repeat(64), packets,
  });
  const result = await importEvaluationV6Grades(root, 'group-2', packets.map(makeGrade).reverse());
  assert.deepEqual(result.grades.map(({ packetId }) => packetId), packets.map(({ packetId }) => packetId).sort());
});

test('failure: stale or partial batches do not activate', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evaluation-v6-stale-'));
  const packets = twoPackets();
  const directory = path.join(root, 'evaluation/v6/judge/packets/group-3');
  await writeJsonAtomic(path.join(directory, 'individual-packets.json'), {
    experimentGroupId: 'group-3', batchHash: 'e'.repeat(64), packets,
  });
  await assert.rejects(() => importEvaluationV6Grades(root, 'group-3', [makeGrade(packets[0])]), /exactly 2/i);
  await assert.rejects(readFile(path.join(root, 'evaluation/v6/judge/grades/group-3/active.json')), /ENOENT/);
  const stale = makeGrade(packets[0]);
  stale.packetHash = 'f'.repeat(64);
  await assert.rejects(() => importEvaluationV6Grades(root, 'group-3', [stale, makeGrade(packets[1])]), /stale/i);
  await assert.rejects(readFile(path.join(root, 'evaluation/v6/judge/grades/group-3/active.json')), /ENOENT/);
});
