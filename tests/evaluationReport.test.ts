/**
 * Test Plan:
 * 1. Happy Path:
 *    - 채점 완료 실행의 단일 리포트와 같은 질문 세트 두 실행의 비교 리포트를 만든다.
 * 2. Edge Cases:
 *    - promptVersionId 없는 실행은 해시 기반 레거시 프롬프트로 표시한다.
 *    - 주관식 미채점 실행은 0점이 아닌 채점 대기로 표시한다.
 *    - 미완료 실행은 완료 답변과 실패 문항을 모두 보존한다.
 * 3. Failure Path:
 *    - 같은 실행, 다른 질문 세트와 누락 답변 비교는 명시적 오류로 차단한다.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildComparisonReport, buildSingleRunReport } from '../src/components/evaluation/evaluationReportViewModel';
import type { EvaluationQuestion, EvaluationRun } from '../shared/amyHoodEvaluation';

const questions: EvaluationQuestion[] = Array.from({ length: 15 }, (_, index) => ({
  id: index < 7 ? `P${index + 1}` : index < 12 ? `H${index - 6}` : `S${index - 11}`,
  kpi: index < 7 ? 'past_memory_restoration' : index < 12 ? 'github_holdout' : 'hypothetical_scenario',
  type: index < 12 ? 'multiple_choice' : 'subjective',
  prompt: `Question ${index + 1}`,
}));

const gradedRun = (
  runId: string,
  scoreOverrides: Partial<EvaluationRun['scores']> = {},
): EvaluationRun => ({
  runId,
  status: 'complete',
  gradingStatus: 'complete',
  provider: 'local',
  model: 'test-model',
  promptVersionId: 'prompt-v1',
  promptHash: 'abcdef123456',
  ragSnapshotId: 'rag-v1',
  questionSetVersion: '1.0.0',
  answers: questions.map((question) => ({
    questionId: question.id,
    status: 'complete',
    choice: question.type === 'multiple_choice' ? 1 : undefined,
    text: question.type === 'subjective' ? 'Subjective answer' : undefined,
    objectiveScore: question.type === 'multiple_choice' ? 1 : undefined,
    elapsedMs: 1,
  })),
  scores: { pastMemory: 7, githubHoldout: 5, subjective: 21, ...scoreOverrides },
  startedAt: '2026-07-14T00:00:00.000Z',
  completedAt: '2026-07-14T00:01:00.000Z',
});

test('happy: builds single and comparison reports with score deltas', () => {
  const single = buildSingleRunReport(gradedRun('left'), questions);
  const comparison = buildComparisonReport(gradedRun('left'), gradedRun('right', { pastMemory: 6 }), questions);
  assert.equal(single.rows.length, 15);
  assert.equal(comparison.scoreDeltas.pastMemory, -1);
});

test('happy: experiment report identifies the Amy Hood plus RAG arm', () => {
  const experiment = gradedRun('experiment');
  experiment.experimentArm = 'persona_rag';
  assert.equal(
    buildSingleRunReport(experiment, questions).experimentLabel,
    'Amy Hood + RAG',
  );
});

test('edge: legacy run shows prompt hash label', () => {
  const legacy = gradedRun('legacy');
  delete legacy.promptVersionId;
  assert.equal(buildSingleRunReport(legacy, questions).promptLabel, '레거시 프롬프트 · abcdef123456');
});

test('edge: pending subjective grade stays null', () => {
  const pending = gradedRun('pending', { subjective: null });
  pending.gradingStatus = 'pending';
  assert.equal(buildSingleRunReport(pending, questions).scores.subjective, null);
});

test('edge: incomplete run retains complete and failed rows', () => {
  const incomplete = gradedRun('incomplete');
  incomplete.status = 'incomplete';
  incomplete.completedAt = null;
  incomplete.answers[1] = { questionId: 'P2', status: 'failed', elapsedMs: 0, error: 'model unavailable' };
  const report = buildSingleRunReport(incomplete, questions);
  assert.equal(report.rows.some((row) => row.answer?.status === 'complete'), true);
  assert.equal(report.rows.some((row) => row.answer?.status === 'failed'), true);
});

test('failure: invalid comparisons explain exact contract violation', () => {
  const left = gradedRun('same');
  assert.throws(() => buildComparisonReport(left, left, questions), /different evaluation runs/);
  const otherVersion = gradedRun('other');
  otherVersion.questionSetVersion = '2.0.0';
  assert.throws(() => buildComparisonReport(left, otherVersion, questions), /same question-set version/);
  const missing = gradedRun('missing');
  missing.answers.pop();
  assert.throws(() => buildComparisonReport(left, missing, questions), /15 answers/);
});
