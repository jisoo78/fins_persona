/**
 * Test Plan:
 * 1. Happy Path:
 *    - Build a complete four-arm report from forty active grades.
 * 2. Edge Cases:
 *    - Preserve tied means.
 *    - Report zero behavior changes when responses are identical.
 *    - Count retrieval of a non-mapped policy as wrong-domain retrieval.
 * 3. Failure Path:
 *    - Reject incomplete runs and missing active grades.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { exportEvaluationV4JudgePackets, importEvaluationV4Grades } from '../server/evaluationV4/judge';
import { buildEvaluationV4CalibrationReport, writeEvaluationV4HtmlReport } from '../server/evaluationV4/report';
import { writeEvaluationV4Run } from '../server/evaluationV4/runStore';
import { gradesForPackets, installEvaluationV4GradingFixture } from './helpers/evaluationV4GradingFixture';

test('happy: builds complete arm means and behavior diagnostics', async () => {
  const fixture = await installEvaluationV4GradingFixture();
  const packets = await exportEvaluationV4JudgePackets(fixture.root, fixture.groupId);
  const grades = gradesForPackets(packets.packets);
  await importEvaluationV4Grades(fixture.root, fixture.groupId, grades);
  const report = await buildEvaluationV4CalibrationReport(fixture.root, fixture.groupId);
  assert.equal(report.diagnostics.completeAnswers, 40);
  assert.equal(report.armMeans.generic_cfo, 8);
  assert.equal(report.behaviorChangeCount > 0, true);
  const outputPath = path.join(fixture.root, 'report.html');
  await writeEvaluationV4HtmlReport(fixture.root, fixture.groupId, outputPath);
  const html = await readFile(outputPath, 'utf8');
  assert.match(html, /근거 완전성/);
  assert.match(html, /공식 1차 자료.*10/);
  assert.match(html, /영역별 AAS/);
  assert.match(html, /1회 교정 실험/);
  assert.match(html, /1\. 실험 목적/);
  assert.match(html, /2\. 평가 방법/);
  assert.match(html, /3\. 평가 지표/);
  assert.match(html, /행동 정합성 점수\(Action Alignment Score, AAS\)/);
  assert.match(html, /블라인드 채점\(Blind Judging\)/);
  assert.match(html, /검색 증강 생성\(Retrieval-Augmented Generation, RAG\)/);
  assert.match(html, /일반 CFO 조언자\(Generic CFO Advisor\)/);
  assert.match(html, /다음 확대 실험 진행 판정/);
  assert.match(html, /재현 정보/);
});

test('edge: tied grades remain tied', async () => {
  const fixture = await installEvaluationV4GradingFixture();
  const packets = await exportEvaluationV4JudgePackets(fixture.root, fixture.groupId);
  await importEvaluationV4Grades(fixture.root, fixture.groupId, gradesForPackets(packets.packets, 5));
  const report = await buildEvaluationV4CalibrationReport(fixture.root, fixture.groupId);
  assert.equal(new Set(Object.values(report.armMeans)).size, 1);
});

test('edge: identical responses produce zero behavior changes', async () => {
  const fixture = await installEvaluationV4GradingFixture();
  const generic = fixture.runs[0].answers.map(({ response }) => response);
  for (const run of fixture.runs.slice(1)) {
    run.answers = run.answers.map((answer, index) => ({ ...answer, response: generic[index] }));
    await writeEvaluationV4Run(fixture.root, run);
  }
  const packets = await exportEvaluationV4JudgePackets(fixture.root, fixture.groupId);
  await importEvaluationV4Grades(fixture.root, fixture.groupId, gradesForPackets(packets.packets));
  assert.equal((await buildEvaluationV4CalibrationReport(fixture.root, fixture.groupId)).behaviorChangeCount, 0);
});

test('edge: non-mapped retrieval is counted as wrong-domain', async () => {
  const fixture = await installEvaluationV4GradingFixture();
  const packets = await exportEvaluationV4JudgePackets(fixture.root, fixture.groupId);
  await importEvaluationV4Grades(fixture.root, fixture.groupId, gradesForPackets(packets.packets));
  assert.equal((await buildEvaluationV4CalibrationReport(fixture.root, fixture.groupId)).retrieval.wrongDomainRate, 1);
});

test('failure: rejects missing grades and incomplete runs', async () => {
  const fixture = await installEvaluationV4GradingFixture();
  await assert.rejects(buildEvaluationV4CalibrationReport(fixture.root, fixture.groupId), /active grades/i);
  fixture.runs[0].status = 'incomplete';
  await writeEvaluationV4Run(fixture.root, fixture.runs[0]);
  await assert.rejects(exportEvaluationV4JudgePackets(fixture.root, fixture.groupId), /complete runs/i);
});
