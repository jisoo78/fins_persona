/**
 * Test Plan:
 * 1. Happy Path:
 *    - an approved 30-card bundle and four-arm report become complete operator view models.
 *
 * 2. Edge Cases:
 *    - all filters preserve the complete card set.
 *    - one incomplete repetition is visibly not comparison-ready.
 *    - the known-prior-exposure warning remains visible.
 *
 * 3. Failure Path:
 *    - missing answer or review records and mixed experiment versions are rejected.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type {
  EvaluationV3ExperimentReport,
  EvaluationV3ReviewFile,
  EvaluationV3Run,
} from '../shared/amyHoodEvaluationV3';
import {
  buildEvaluationV3QuestionCards,
  buildEvaluationV3ReportView,
  filterEvaluationV3QuestionCards,
  summarizeEvaluationV3Questions,
} from '../src/components/evaluationV3/evaluationV3ViewModel';

const questions = JSON.parse(
  readFileSync('evaluation/v3/public/questions.json', 'utf8'),
);
const answerKey = JSON.parse(
  readFileSync('evaluation/v3/sealed/answer-key.json', 'utf8'),
);
const reviews = JSON.parse(
  readFileSync('evaluation/v3/public/reviews.json', 'utf8'),
) as EvaluationV3ReviewFile;
const approvedReviews: EvaluationV3ReviewFile = {
  ...reviews,
  reviews: reviews.reviews.map((review) => ({
    ...review,
    status: 'approved',
    reviewedAt: '2026-07-15T00:00:00.000Z',
  })),
};

const report: EvaluationV3ExperimentReport = {
  experimentGroupId: 'group-1',
  benchmarkRejected: false,
  warnings: ['known_prior_exposure: GitHub acquisition 2018'],
  repetitions: [{
    repetition: 1,
    comparisonReady: true,
    arms: Object.fromEntries([
      'generic_cfo', 'amy_prompt', 'amy_policy_rag', 'amy_full_rag',
    ].map((arm) => [arm, {
      runId: `${arm}-1`,
      status: 'complete',
      percent: 70,
      categories: {
        discrimination: { correct: 7, total: 10 },
        holdout: { correct: 7, total: 10 },
        counterfactual: { correct: 4, total: 6 },
        transfer: { correct: 3, total: 4 },
      },
      pairConsistency: 1,
    }])),
    lifts: {
      amyPromptLift: 5,
      policyRagLift: 5,
      fullRagLift: 5,
      fullVsGenericLift: 15,
    },
  }],
  armAggregates: Object.fromEntries([
    'generic_cfo', 'amy_prompt', 'amy_policy_rag', 'amy_full_rag',
  ].map((arm) => [arm, {
    arm,
    completedRuns: 1,
    totalRuns: 1,
    percent: { mean: 70, min: 70, max: 70, populationStdDev: 0 },
    choiceAgreement: { D01: 1 },
    overallChoiceAgreement: 1,
  }])),
  diagnostics: {
    inputTokens: 1_200,
    outputTokens: 600,
    elapsedMs: 12_000,
    mismatchCount: 0,
    failedQuestions: 0,
  },
} as unknown as EvaluationV3ExperimentReport;

const runs = (status: EvaluationV3Run['status'] = 'complete') =>
  ['generic_cfo', 'amy_prompt', 'amy_policy_rag', 'amy_full_rag'].map((arm) => ({
    runId: `${arm}-1`,
    version: '3.0.0',
    experimentGroupId: 'group-1',
    repetition: 1,
    arm,
    status,
  })) as EvaluationV3Run[];

test('happy: complete authoring and report data become operator summaries', () => {
  const cards = buildEvaluationV3QuestionCards({ questions, answerKey, reviews: approvedReviews });
  assert.equal(cards.length, 30);
  assert.deepEqual(summarizeEvaluationV3Questions(cards), {
    total: 30,
    categories: { D: 10, H: 10, C: 6, T: 4 },
    statuses: { unreviewed: 0, approved: 30, revision_required: 0 },
    allApproved: true,
  });
  const view = buildEvaluationV3ReportView(report, runs());
  assert.deepEqual(view.armCards.map(({ label }) => label), [
    '일반 CFO',
    'Amy Main Prompt',
    'Amy 정책 RAG',
    'Amy 전체 RAG',
  ]);
  assert.equal(view.liftLabels.fullVsGenericLift, '전체 RAG vs 일반 CFO');
});

test('edge: all filters preserve the complete card set', () => {
  const cards = buildEvaluationV3QuestionCards({ questions, answerKey, reviews: approvedReviews });
  assert.equal(filterEvaluationV3QuestionCards(cards, {
    category: 'all',
    status: 'all',
  }).length, 30);
});

test('edge: incomplete repetition is visibly not comparison-ready', () => {
  const partialReport = {
    ...report,
    repetitions: [{ ...report.repetitions[0], comparisonReady: false }],
  };
  const view = buildEvaluationV3ReportView(partialReport, runs('incomplete'));
  assert.equal(view.repetitions[0].comparisonReady, false);
  assert.equal(view.allComplete, false);
});

test('edge: known prior exposure remains an operator warning', () => {
  const view = buildEvaluationV3ReportView(report, runs());
  assert.deepEqual(view.exposureWarnings, ['known_prior_exposure: GitHub acquisition 2018']);
});

test('failure: incomplete authoring records and mixed versions are rejected', () => {
  assert.throws(
    () => buildEvaluationV3QuestionCards({
      questions,
      answerKey: { ...answerKey, answers: answerKey.answers.slice(1) },
      reviews: approvedReviews,
    }),
    /missing answer record: D01/,
  );
  assert.throws(
    () => buildEvaluationV3QuestionCards({
      questions,
      answerKey,
      reviews: { ...approvedReviews, reviews: approvedReviews.reviews.slice(1) },
    }),
    /missing review record: D01/,
  );
  const mixed = runs();
  mixed[3] = { ...mixed[3], version: '2.0.0' as '3.0.0' };
  assert.throws(
    () => buildEvaluationV3ReportView(report, mixed),
    /mixed Evaluation versions/,
  );
});
