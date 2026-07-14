/**
 * Test Plan:
 * 1. Happy Path:
 *    - version 2.0.0의 7/5/3 질문 세트가 근접 오답과 길이·정답 위치 품질 기준을 통과한다.
 *
 * 2. Edge Cases:
 *    - 정답과 오답 평균 길이 차이가 정확히 10%인 경계값을 허용한다.
 *    - 정답 위치별 개수가 2개 또는 4개인 경계값을 허용한다.
 *    - 선택지 순서를 바꾸고 정답·trap intent를 같이 옮기면 의미 연결을 보존한다.
 *
 * 3. Failure Path:
 *    - 긴 정답 누출, 편향된 정답 위치 또는 노골적인 절대 표현이 있으면 질문 로딩 전에 거부한다.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { assertQuestionDifficulty } from '../server/evaluation/questionQuality';
import type {
  EvaluationAnswerKeyFile,
  EvaluationQuestionFile,
} from '../shared/amyHoodEvaluation';

const loadFiles = async () => ({
  questions: JSON.parse(
    await readFile('evaluation/amy_hood_eval_questions.json', 'utf8'),
  ) as EvaluationQuestionFile,
  answers: JSON.parse(
    await readFile('evaluation/amy_hood_eval_answer_key.json', 'utf8'),
  ) as EvaluationAnswerKeyFile,
});

const qualityFixture = (
  positions: Array<1 | 2 | 3 | 4>,
  boundaryQuestionIndex: number | null = null,
) => {
  const questions: EvaluationQuestionFile = {
    dataset: 'amy_hood_blind_evaluation',
    version: '2.0.0',
    subject: 'Amy Hood',
    questions: positions.map((correctChoice, index) => ({
      id: `Q${index + 1}`,
      kpi: 'past_memory_restoration',
      type: 'multiple_choice',
      prompt: `Question ${index + 1}`,
      options: [1, 2, 3, 4].map((position) =>
        '가'.repeat(
          index === boundaryQuestionIndex && position === correctChoice ? 110 : 100,
        ),
      ) as [string, string, string, string],
    })),
  };
  const answers: EvaluationAnswerKeyFile = {
    dataset: 'amy_hood_blind_evaluation_answer_key',
    version: '2.0.0',
    answers: positions.map((correctChoice, index) => ({
      questionId: `Q${index + 1}`,
      correctChoice,
      correctIntent: '근접 판단 중 올바른 순서를 선택한다.',
      trapIntents: {
        '1': correctChoice === 1 ? '정답: 판단 순서' : '선행지표 적용 시점이 다르다.',
        '2': correctChoice === 2 ? '정답: 판단 순서' : '레드라인 적용 시점이 다르다.',
        '3': correctChoice === 3 ? '정답: 판단 순서' : '증거 가중치가 다르다.',
        '4': correctChoice === 4 ? '정답: 판단 순서' : '통합 실행 순서가 다르다.',
      },
      evidenceRefs: [],
    })),
  };
  return { questions, answers };
};

test('happy: version 2 hard questions remove answer-shape leakage', async () => {
  const { questions, answers } = await loadFiles();
  assert.equal(questions.version, '2.0.0');
  assert.equal(answers.version, '2.0.0');
  assert.doesNotThrow(() => assertQuestionDifficulty(questions, answers));
});

test('edge: ten-percent correct-length boundary is accepted', () => {
  const fixture = qualityFixture([1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4], 0);
  assert.doesNotThrow(() =>
    assertQuestionDifficulty(fixture.questions, fixture.answers),
  );
});

test('edge: answer-position counts two and four are accepted', () => {
  const fixture = qualityFixture([1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4]);
  assert.doesNotThrow(() =>
    assertQuestionDifficulty(fixture.questions, fixture.answers),
  );
});

test('edge: moving an answer with its trap intent preserves the contract', async () => {
  const { questions, answers } = await loadFiles();
  const clonedQuestions = structuredClone(questions);
  const clonedAnswers = structuredClone(answers);
  const question = clonedQuestions.questions.find((item) => item.id === 'P1')!;
  const answer = clonedAnswers.answers.find((item) => item.questionId === 'P1')!;
  const previous = answer.correctChoice!;
  const next = (previous % 4 + 1) as 1 | 2 | 3 | 4;
  [question.options![previous - 1], question.options![next - 1]] = [
    question.options![next - 1],
    question.options![previous - 1],
  ];
  const previousKey = String(previous) as '1' | '2' | '3' | '4';
  const nextKey = String(next) as '1' | '2' | '3' | '4';
  [answer.trapIntents![previousKey], answer.trapIntents![nextKey]] = [
    answer.trapIntents![nextKey],
    answer.trapIntents![previousKey],
  ];
  answer.correctChoice = next;
  assert.doesNotThrow(() => assertQuestionDifficulty(clonedQuestions, clonedAnswers));
});

test('failure: answer-shape shortcuts are rejected', () => {
  const base = qualityFixture([1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4]);

  const longCorrect = structuredClone(base.questions);
  longCorrect.questions[0].options![0] += '가'.repeat(30);
  assert.throws(
    () => assertQuestionDifficulty(longCorrect, base.answers),
    /correct option length/,
  );

  const obvious = structuredClone(base.questions);
  obvious.questions[0].options![1] = `무조건 ${obvious.questions[0].options![1]}`;
  assert.throws(
    () => assertQuestionDifficulty(obvious, base.answers),
    /absolute-choice shortcut/,
  );

  const biased = qualityFixture([1, 1, 1, 1, 1, 2, 2, 3, 3, 4, 4, 4]);
  assert.throws(
    () => assertQuestionDifficulty(biased.questions, biased.answers),
    /answer position 1 count/,
  );
});
