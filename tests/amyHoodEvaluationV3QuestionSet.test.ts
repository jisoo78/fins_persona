/**
 * Test Plan:
 * 1. Happy Path:
 *    - one D10/H10/C6/T4 bundle validates and round-trips a review.
 * 2. Edge Cases:
 *    - correct-position counts at the six and nine boundaries are accepted.
 *    - a Korean revision note is preserved exactly.
 *    - counterfactual pairs can explicitly remain stable or reverse.
 * 3. Failure Path:
 *    - duplicate IDs, weak options, missing trap metadata, leaked labels, and malformed pairs fail before persistence.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type {
  EvaluationV3AnswerKeyFile,
  EvaluationV3QuestionFile,
} from '../shared/amyHoodEvaluationV3';
import {
  assertEvaluationV3Bundle,
  loadEvaluationV3Bundle,
  loadEvaluationV3Reviews,
  saveEvaluationV3Review,
} from '../server/evaluationV3/questionSet';

test('happy: real v3 bundle validates with thirty review records', async () => {
  const bundle = await loadEvaluationV3Bundle(process.cwd());
  const reviews = await loadEvaluationV3Reviews(process.cwd());
  assert.equal(bundle.questions.questions.length, 30);
  assert.equal(bundle.answerKey.answers.length, 30);
  assert.equal(reviews.reviews.length, 30);
  assert.doesNotThrow(() => assertEvaluationV3Bundle(bundle.questions, bundle.answerKey));
});

test('edge: correct positions at six and nine occurrence boundaries are accepted', async () => {
  const bundle = await loadEvaluationV3Bundle(process.cwd());
  const key = structuredClone(bundle.answerKey);
  const positions = [
    ...Array(9).fill(1),
    ...Array(9).fill(2),
    ...Array(6).fill(3),
    ...Array(6).fill(4),
  ] as Array<1 | 2 | 3 | 4>;
  key.answers.forEach((answer, index) => {
    answer.correctChoice = positions[index];
    answer.trapMechanisms = Object.fromEntries(
      ([1, 2, 3, 4] as const)
        .filter((choice) => choice !== answer.correctChoice)
        .map((choice) => [String(choice), 'wrong_priority_order']),
    );
  });
  assert.doesNotThrow(() => assertEvaluationV3Bundle(bundle.questions, key));
});

test('edge: Korean revision note is preserved exactly', async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evaluation-v3-review-'));
  context.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(process.cwd(), 'evaluation/v3');
  for (const relative of [
    'public/questions.json',
    'public/reviews.json',
    'sealed/answer-key.json',
  ]) {
    const destination = path.join(root, 'evaluation/v3', relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, await readFile(path.join(source, relative), 'utf8'));
  }
  const note = '가격 인상 전에 고객 가치 검증 조건을 더 구체적으로 작성해줘.';
  const saved = await saveEvaluationV3Review(root, 'D03', {
    status: 'revision_required',
    revisionNote: note,
  });
  assert.equal(saved.reviews.find(({ questionId }) => questionId === 'D03')?.revisionNote, note);
});

test('edge: counterfactual pairs explicitly preserve reverse and stable behavior', async () => {
  const bundle = await loadEvaluationV3Bundle(process.cwd());
  const pairAnswers = bundle.answerKey.answers.filter(({ questionId }) => questionId.startsWith('C'));
  assert.equal(pairAnswers.length, 6);
  assert.ok(pairAnswers.every(({ expectedPairBehavior }) => expectedPairBehavior === 'reverse'));
  const stable = structuredClone(bundle.answerKey);
  stable.answers
    .filter(({ questionId }) => questionId.startsWith('C03'))
    .forEach((answer) => { answer.expectedPairBehavior = 'stable'; });
  assert.doesNotThrow(() => assertEvaluationV3Bundle(bundle.questions, stable));
});

test('failure: invalid authoring metadata fails before persistence', async () => {
  const bundle = await loadEvaluationV3Bundle(process.cwd());
  const questions = structuredClone(bundle.questions) as EvaluationV3QuestionFile;
  const key = structuredClone(bundle.answerKey) as EvaluationV3AnswerKeyFile;

  questions.questions[1].id = questions.questions[0].id;
  assert.throws(() => assertEvaluationV3Bundle(questions, key), /unique/);

  const weak = structuredClone(bundle.questions) as EvaluationV3QuestionFile;
  weak.questions[0].options[3] = '즉시 승인';
  assert.throws(() => assertEvaluationV3Bundle(weak, bundle.answerKey), /comparable specificity/);

  const missingTrap = structuredClone(bundle.answerKey) as EvaluationV3AnswerKeyFile;
  missingTrap.answers[0].trapMechanisms = {};
  assert.throws(() => assertEvaluationV3Bundle(bundle.questions, missingTrap), /trap mechanisms/);

  const leaked = structuredClone(bundle.questions) as EvaluationV3QuestionFile;
  leaked.questions[0].options[0] = `정답: ${leaked.questions[0].options[0]}`;
  assert.throws(() => assertEvaluationV3Bundle(leaked, bundle.answerKey), /answer label/);

  const malformedPair = structuredClone(bundle.questions) as EvaluationV3QuestionFile;
  malformedPair.questions.find(({ id }) => id === 'C01B')!.pairId = 'C02';
  assert.throws(() => assertEvaluationV3Bundle(malformedPair, bundle.answerKey), /counterfactual pair/);
});
