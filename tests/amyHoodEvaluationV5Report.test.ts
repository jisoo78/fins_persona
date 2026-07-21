/**
 * Test Plan:
 * 1. Happy Path:
 *    - Compute three arm means, paired lifts, transition metrics, retrieval diagnostics, stability, and a passing formal gate.
 * 2. Edge Cases:
 *    - Label a positive lift whose 95% confidence interval contains zero as directional evidence only.
 *    - Preserve zero-valued transition metrics instead of converting them to missing values.
 *    - Render Korean-first labels with English terms and no generic CFO condition.
 * 3. Failure Path:
 *    - Reject reports with missing pair grades or mixed scenario bundle hashes.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { EVALUATION_V5_ARMS, type EvaluationV5Grade } from '../shared/amyHoodEvaluationV5';
import {
  exportEvaluationV5JudgePackets,
  exportEvaluationV5PairJudgePackets,
  importEvaluationV5Grades,
  importEvaluationV5PairGrades,
  loadEvaluationV5JudgeLinks,
} from '../server/evaluationV5/judge';
import { buildEvaluationV5Report, writeEvaluationV5HtmlReport } from '../server/evaluationV5/report';
import { writeEvaluationV5Run } from '../server/evaluationV5/runStore';
import {
  gradesForV5Packets,
  installEvaluationV5GradingFixture,
  pairGradesForV5Packets,
} from './helpers/evaluationV5GradingFixture';

const installGrades = async (
  fixture: Awaited<ReturnType<typeof installEvaluationV5GradingFixture>>,
  scoreForArm: Record<(typeof EVALUATION_V5_ARMS)[number], number> = {
    amy_prompt: 6,
    amy_policy_rag: 8,
    amy_full_rag: 9,
  },
) => {
  const individualPackets = await exportEvaluationV5JudgePackets(fixture.root, fixture.groupId);
  const pairPackets = await exportEvaluationV5PairJudgePackets(fixture.root, fixture.groupId);
  const links = await loadEvaluationV5JudgeLinks(fixture.root, fixture.groupId);
  const armByPacket = new Map(links.links.map(({ packetId, arm }) => [packetId, arm]));
  const grades = gradesForV5Packets(individualPackets.packets);
  for (const grade of grades) {
    grade.score = scoreForArm[armByPacket.get(grade.packetId)! as keyof typeof scoreForArm] as EvaluationV5Grade['score'];
  }
  await importEvaluationV5Grades(fixture.root, fixture.groupId, grades);
  const pairGrades = pairGradesForV5Packets(pairPackets.packets);
  await importEvaluationV5PairGrades(fixture.root, fixture.groupId, pairGrades);
  return { individualPackets, pairPackets, grades, pairGrades, armByPacket };
};

test('happy: computes V5 metrics and a passing gate without a generic CFO arm', async () => {
  const fixture = await installEvaluationV5GradingFixture();
  await installGrades(fixture);
  const report = await buildEvaluationV5Report(fixture.root, fixture.groupId);
  assert.deepEqual(Object.keys(report.armMeans).sort(), [...EVALUATION_V5_ARMS].sort());
  assert.equal('generic_cfo' in report.armMeans, false);
  assert.equal(report.diagnostics.expectedAnswers, 450);
  assert.equal(report.diagnostics.expectedPairs, 225);
  assert.equal(report.armMeans.amy_prompt, 6);
  assert.equal(report.pairedLift.amy_policy_rag, 2);
  assert.equal(report.transition.amy_full_rag.pairAccuracy, 1);
  assert.equal(report.retrieval.wrongDomainRate, 0);
  assert.equal(report.formalGate.passed, true);
});

test('edge: positive lift with a confidence interval crossing zero is directional only', async () => {
  const fixture = await installEvaluationV5GradingFixture();
  const installed = await installGrades(fixture, { amy_prompt: 7, amy_policy_rag: 7, amy_full_rag: 7 });
  const policyPackets = installed.grades.filter((grade) =>
    installed.armByPacket.get(grade.packetId) === 'amy_policy_rag');
  policyPackets[0].score = 8;
  await importEvaluationV5Grades(fixture.root, fixture.groupId, installed.grades);
  const report = await buildEvaluationV5Report(fixture.root, fixture.groupId);
  assert.equal(report.confidenceIntervals.amy_policy_rag.lower95 <= 0, true);
  assert.equal(report.confidenceIntervals.amy_policy_rag.upper95 >= 0, true);
  assert.equal(report.confidenceIntervals.amy_policy_rag.inference, 'directional_only');
});

test('edge: preserves zero transition rates', async () => {
  const fixture = await installEvaluationV5GradingFixture();
  const installed = await installGrades(fixture);
  for (const grade of installed.pairGrades) {
    grade.aligned = false;
    grade.expectedResponseFinding = 'conflict';
    grade.changedSignalFinding = 'conflict';
    grade.invariantFinding = 'conflict';
  }
  await importEvaluationV5PairGrades(fixture.root, fixture.groupId, installed.pairGrades);
  const report = await buildEvaluationV5Report(fixture.root, fixture.groupId);
  assert.equal(report.transition.amy_prompt.pairAccuracy, 0);
  assert.equal(report.transition.amy_prompt.signalCitationRate, 0);
  assert.equal(report.transition.amy_prompt.invariantPreservationRate, 0);
});

test('edge: renders a Korean-first HTML report without a generic CFO column', async () => {
  const fixture = await installEvaluationV5GradingFixture();
  await installGrades(fixture);
  const outputPath = path.join(fixture.root, 'evaluation-v5-report.html');
  await writeEvaluationV5HtmlReport(fixture.root, fixture.groupId, outputPath);
  const html = await readFile(outputPath, 'utf8');
  assert.match(html, /실험 목적/);
  assert.match(html, /행동 정합성 점수\(Action Alignment Score, AAS\)/);
  assert.match(html, /행동 변화 정합성\(Behavior-Transition Alignment\)/);
  assert.match(html, /5회 반복/);
  assert.match(html, /30문항/);
  assert.doesNotMatch(html, /Generic CFO|일반 CFO/);
});

test('failure: rejects missing pair grades and mixed bundle hashes', async () => {
  const missing = await installEvaluationV5GradingFixture();
  const packets = await exportEvaluationV5JudgePackets(missing.root, missing.groupId);
  await importEvaluationV5Grades(missing.root, missing.groupId, gradesForV5Packets(packets.packets));
  await assert.rejects(buildEvaluationV5Report(missing.root, missing.groupId), /active pair grades/i);

  const mixed = await installEvaluationV5GradingFixture();
  await installGrades(mixed);
  mixed.runs[0].scenarioSetHash = '0'.repeat(64);
  await writeEvaluationV5Run(mixed.root, mixed.runs[0]);
  await assert.rejects(buildEvaluationV5Report(mixed.root, mixed.groupId), /scenario bundle hash/i);
});
