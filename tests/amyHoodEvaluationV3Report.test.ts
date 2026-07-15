/**
 * Test Plan:
 * 1. Happy Path:
 *    - one complete four-arm group reports category scores, lifts, diagnostics, and holdout warnings.
 *
 * 2. Edge Cases:
 *    - one incomplete arm makes only dependent lifts unavailable.
 *    - one repetition produces zero-variance arm statistics.
 *    - five repetitions with identical choices produce 100 percent agreement.
 *
 * 3. Failure Path:
 *    - duplicate arms, mixed groups or versions, and complete runs with missing answers are rejected.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  EVALUATION_V3_ARMS,
  type EvaluationV3AnswerKeyFile,
  type EvaluationV3Arm,
  type EvaluationV3Run,
  type EvaluationV3RunAnswer,
} from '../shared/amyHoodEvaluationV3';
import type { EvaluationV3HoldoutManifest } from '../server/evaluationV3/holdout';
import { buildEvaluationV3ExperimentReport } from '../server/evaluationV3/report';

const questionIds = [
  ...Array.from({ length: 10 }, (_, index) => `D${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 10 }, (_, index) => `H${String(index + 1).padStart(2, '0')}`),
  'C01A', 'C01B', 'C02A', 'C02B', 'C03A', 'C03B',
  'T01', 'T02', 'T03', 'T04',
];

const manifest = JSON.parse(
  readFileSync('evaluation/v3/sealed/holdout-manifest.json', 'utf8'),
) as EvaluationV3HoldoutManifest;
const answerKey = JSON.parse(
  readFileSync('evaluation/v3/sealed/answer-key.json', 'utf8'),
) as EvaluationV3AnswerKeyFile;

const answers = (correctCount: number, choice = 1): EvaluationV3RunAnswer[] =>
  questionIds.map((questionId, index) => ({
    questionId,
    status: 'complete',
    choice: choice as 1 | 2 | 3 | 4,
    reason: `${choice}번을 선택합니다.`,
    correct: index < correctCount,
    mismatch: false,
    elapsedMs: 10,
    inputTokens: 20,
    outputTokens: 5,
  }));

const run = (
  arm: EvaluationV3Arm,
  repetition: 1 | 2 | 3 | 4 | 5,
  correctCount: number,
  overrides: Partial<EvaluationV3Run> = {},
): EvaluationV3Run => ({
  runId: `${arm}-${repetition}`,
  version: '3.0.0',
  experimentGroupId: 'group-1',
  repetition,
  arm,
  provider: 'local',
  model: 'gemma4-test',
  questionSetVersion: '3.0.0',
  questionSetHash: 'question-hash',
  answerKeyHash: 'answer-hash',
  promptVersionId: arm === 'generic_cfo' ? null : 'prompt-1',
  promptHash: arm === 'generic_cfo' ? 'generic-hash' : 'amy-hash',
  memoryReleaseId: arm.endsWith('_rag') ? 'memory-1' : null,
  memoryReleaseHash: arm.endsWith('_rag') ? 'memory-hash' : null,
  holdoutManifestHash: 'holdout-hash',
  status: 'complete',
  answers: answers(correctCount),
  scores: {
    discrimination: 0,
    holdout: 0,
    counterfactual: 0,
    transfer: 0,
    total: 0,
    percent: 0,
  },
  startedAt: '2026-07-15T00:00:00.000Z',
  completedAt: '2026-07-15T00:01:00.000Z',
  ...overrides,
});

const completeGroup = () => [
  run('generic_cfo', 1, 18),
  run('amy_prompt', 1, 21),
  run('amy_policy_rag', 1, 24),
  run('amy_full_rag', 1, 27),
];

test('happy: complete group reports objective lifts and diagnostics', () => {
  const report = buildEvaluationV3ExperimentReport(completeGroup(), manifest, answerKey);
  assert.equal(report.experimentGroupId, 'group-1');
  assert.deepEqual(report.repetitions[0].lifts, {
    amyPromptLift: 10,
    policyRagLift: 10,
    fullRagLift: 10,
    fullVsGenericLift: 30,
  });
  assert.deepEqual(report.repetitions[0].arms.generic_cfo.categories, {
    discrimination: { correct: 10, total: 10 },
    holdout: { correct: 8, total: 10 },
    counterfactual: { correct: 0, total: 6 },
    transfer: { correct: 0, total: 4 },
  });
  assert.equal(report.diagnostics.inputTokens, 2_400);
  assert.equal(report.diagnostics.outputTokens, 600);
  assert.equal(report.diagnostics.elapsedMs, 1_200);
  assert.equal(report.benchmarkRejected, false);
  assert.equal(report.warnings.some((warning) =>
    /known_prior_exposure.*GitHub/i.test(warning)), true);
  const easyBundle = completeGroup();
  easyBundle[0] = run('generic_cfo', 1, 25);
  assert.equal(
    buildEvaluationV3ExperimentReport(easyBundle, manifest, answerKey).benchmarkRejected,
    true,
  );
});

test('edge: an incomplete arm nulls only lifts that depend on it', () => {
  const runs = completeGroup();
  runs[2] = run('amy_policy_rag', 1, 5, {
    status: 'incomplete',
    answers: answers(5).slice(0, 6),
    completedAt: null,
  });
  const report = buildEvaluationV3ExperimentReport(runs, manifest, answerKey);
  assert.deepEqual(report.repetitions[0].lifts, {
    amyPromptLift: 10,
    policyRagLift: null,
    fullRagLift: null,
    fullVsGenericLift: 30,
  });
  assert.equal(report.repetitions[0].comparisonReady, false);
  assert.equal(report.diagnostics.failedQuestions, 24);
});

test('edge: one repetition has zero-variance arm statistics', () => {
  const report = buildEvaluationV3ExperimentReport(completeGroup(), manifest, answerKey);
  assert.deepEqual(report.armAggregates.generic_cfo.percent, {
    mean: 60,
    min: 60,
    max: 60,
    populationStdDev: 0,
  });
});

test('edge: five identical repetitions produce full per-question agreement', () => {
  const runs = Array.from({ length: 5 }, (_, index) =>
    EVALUATION_V3_ARMS.map((arm) => run(
      arm,
      (index + 1) as 1 | 2 | 3 | 4 | 5,
      15,
      {
        runId: `${arm}-${index + 1}`,
        answers: answers(15, ((index % 1) + 1)),
      },
    ))).flat();
  const report = buildEvaluationV3ExperimentReport(runs, manifest, answerKey);
  assert.equal(report.armAggregates.amy_full_rag.overallChoiceAgreement, 1);
  assert.equal(report.armAggregates.amy_full_rag.choiceAgreement.T04, 1);
  const stableKey = structuredClone(answerKey);
  stableKey.answers
    .filter(({ questionId }) => questionId.startsWith('C01'))
    .forEach((answer) => { answer.expectedPairBehavior = 'stable'; });
  assert.equal(
    buildEvaluationV3ExperimentReport(completeGroup(), manifest, stableKey)
      .repetitions[0].arms.generic_cfo.pairConsistency,
    1 / 3,
  );
});

test('failure: malformed experiment groups are rejected', () => {
  const duplicate = completeGroup();
  duplicate[1] = { ...duplicate[1], arm: 'generic_cfo' };
  assert.throws(
    () => buildEvaluationV3ExperimentReport(duplicate, manifest, answerKey),
    /duplicate arm/,
  );
  const mixedGroup = completeGroup();
  mixedGroup[3] = { ...mixedGroup[3], experimentGroupId: 'group-2' };
  assert.throws(
    () => buildEvaluationV3ExperimentReport(mixedGroup, manifest, answerKey),
    /one experiment group/,
  );
  const mixedVersion = completeGroup();
  mixedVersion[2] = { ...mixedVersion[2], questionSetVersion: '2.0.0' as '3.0.0' };
  assert.throws(
    () => buildEvaluationV3ExperimentReport(mixedVersion, manifest, answerKey),
    /version 3.0.0/,
  );
  const missing = completeGroup();
  missing[0] = { ...missing[0], answers: missing[0].answers.slice(0, 29) };
  assert.throws(
    () => buildEvaluationV3ExperimentReport(missing, manifest, answerKey),
    /complete run requires 30 answers/,
  );
});
