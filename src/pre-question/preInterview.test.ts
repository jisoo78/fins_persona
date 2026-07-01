/*
Test Plan:
1. Happy Path:
   - 40개 사전 질문과 communication_style을 완료하면 PreInterviewContext v2가 생성된다.

2. Edge Cases:
   - attribute_tradeoff 문항 선택 시 attribute_values와 revealed_preference가 context에 보존된다.
   - option_id 5 직접 입력 선택 시 직접 입력값이 answer와 rationale에 반영된다.
   - 이전 문항으로 돌아가 답변을 수정하면 기존 응답이 중복되지 않고 교체된다.

3. Failure Path:
   - 필수 선택지, rationale, 직접 입력값이 비어 있으면 다음 단계로 진행하지 않고 context를 변경하지 않는다.
*/

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPreInterviewAnswer,
  buildPreInterviewContext,
  getResponseSignal,
  setAnswerAtIndex,
  validatePreQuestionBank,
} from './preInterview';
import type { CommunicationStyleAnswer, PreQuestion, PreQuestionBank } from './types';

const stageSet = ['preference', 'context_shift', 'core_value', 'red_line', 'priority_order'] as const;

const makeQuestion = (id: number, category = '자본 배치 우선순위', stage = stageSet[(id - 1) % 5]): PreQuestion => ({
  pre_question_id: id,
  category,
  decision_dimension: category === '자본 배치 우선순위' ? 'capital_allocation_priority' : 'profit_vs_cash_flow',
  stage,
  question_mode: id === 1 ? 'attribute_tradeoff' : 'single_choice',
  pre_question: `${category} 질문 ${id}`,
  attributes: id === 1
    ? [
        { attribute_id: 'capital_efficiency', label: '자본 효율', value_type: 'ordinal' },
        { attribute_id: 'cash_stability', label: '현금 안정성', value_type: 'ordinal' },
      ]
    : undefined,
  pre_options: [
    {
      option_id: 1,
      option_text: '회사 전체의 자본 효율과 예상 수익률을 먼저 비교한다.',
      revealed_preference: '자본 효율을 우선한다.',
      attribute_values: id === 1 ? { capital_efficiency: 'high', cash_stability: 'medium' } : undefined,
    },
    {
      option_id: 2,
      option_text: '현금 여력과 재무 안정성이 훼손되지 않는지 먼저 확인한다.',
      revealed_preference: '현금 안정성을 우선한다.',
      attribute_values: id === 1 ? { capital_efficiency: 'medium', cash_stability: 'high' } : undefined,
    },
    {
      option_id: 3,
      option_text: '장기 성장성과 전략적 우선순위에 맞는지 먼저 판단한다.',
      revealed_preference: '전략 성장성을 우선한다.',
      attribute_values: id === 1 ? { capital_efficiency: 'medium', cash_stability: 'medium' } : undefined,
    },
    {
      option_id: 4,
      option_text: '실패했을 때 빠르게 축소하거나 중단할 수 있는 구조인지 먼저 본다.',
      revealed_preference: '실행 통제를 우선한다.',
      attribute_values: id === 1 ? { capital_efficiency: 'medium', cash_stability: 'medium' } : undefined,
    },
    {
      option_id: 5,
      option_text: 'E. 기타 (직접입력)',
      revealed_preference: '사용자가 고정 선택지 밖의 판단 기준을 직접 제시한다.',
    },
  ],
});

const makeBank = (): PreQuestionBank => ({
  schema_version: 'pre_question.v2',
  target_role: 'CFO',
  pre_questions: [
    ...stageSet.map((stage, index) => makeQuestion(index + 1, '자본 배치 우선순위', stage)),
    ...stageSet.map((stage, index) => makeQuestion(index + 6, '이익 vs 현금흐름', stage)),
  ],
});

const communicationStyle: CommunicationStyleAnswer = {
  bridge_question_id: 'communication_style',
  selected_option_id: 2,
  answer: '수치 기준, 임계값, 조건문 중심으로 정리한다.',
};

test('buildPreInterviewContext creates PreInterviewContext v2 grouped by category and question number', () => {
  const bank = makeBank();
  const answers = bank.pre_questions.map((question, index) =>
    buildPreInterviewAnswer({
      question,
      selectedOptionId: index === 0 ? 2 : 1,
      rationale: `판단 근거 ${index + 1}`,
      responseTimeMs: 2400 + index,
    }),
  );

  const context = buildPreInterviewContext(answers, communicationStyle, '2026-07-01T00:00:00.000Z');

  assert.equal(context.meta.schema_version, 'pre_interview_context.v2');
  assert.equal(context.meta.target_role, 'CFO');
  assert.equal(context.communication_style.answer, communicationStyle.answer);
  assert.equal(Object.keys(context.categories).length, 2);
  assert.equal(context.categories['자본 배치 우선순위'].question_1.stage, 'preference');
  assert.equal(context.categories['자본 배치 우선순위'].question_5.stage, 'priority_order');
  assert.equal(context.categories['이익 vs 현금흐름'].question_1.source_question_id, 6);
});

test('attribute_tradeoff answers preserve revealed_preference and attribute_values', () => {
  const question = makeQuestion(1);

  const answer = buildPreInterviewAnswer({
    question,
    selectedOptionId: 2,
    rationale: '현금 안정성을 먼저 보는 기준이 맞다.',
    responseTimeMs: 3200,
  });

  const context = buildPreInterviewContext([answer], communicationStyle, '2026-07-01T00:00:00.000Z');
  const saved = context.categories['자본 배치 우선순위'].question_1;

  assert.equal(saved.question_mode, 'attribute_tradeoff');
  assert.equal(saved.revealed_preference, '현금 안정성을 우선한다.');
  assert.deepEqual(saved.attribute_values, { capital_efficiency: 'medium', cash_stability: 'high' });
  assert.equal(saved.response_signal, 'considered_preference');
});

test('direct input option stores custom answer and rationale without attribute_values', () => {
  const question = makeQuestion(1);

  const answer = buildPreInterviewAnswer({
    question,
    selectedOptionId: 5,
    directAnswer: '현금 안정성을 보되 고객 신뢰 훼손 가능성을 함께 본다.',
    rationale: '재무 안정성만 보면 장기 매출 기반을 놓칠 수 있다.',
    responseTimeMs: 12000,
  });

  const context = buildPreInterviewContext([answer], communicationStyle, '2026-07-01T00:00:00.000Z');
  const saved = context.categories['자본 배치 우선순위'].question_1;

  assert.equal(saved.selected_option_id, 5);
  assert.equal(saved.answer, '현금 안정성을 보되 고객 신뢰 훼손 가능성을 함께 본다.');
  assert.equal(saved.rationale, '재무 안정성만 보면 장기 매출 기반을 놓칠 수 있다.');
  assert.equal(saved.response_signal, 'slow_response');
  assert.equal('attribute_values' in saved, false);
});

test('setAnswerAtIndex replaces an existing answer instead of duplicating it', () => {
  const first = buildPreInterviewAnswer({
    question: makeQuestion(1),
    selectedOptionId: 1,
    rationale: '처음 선택한 근거',
    responseTimeMs: 2000,
  });
  const replacement = buildPreInterviewAnswer({
    question: makeQuestion(1),
    selectedOptionId: 2,
    rationale: '수정한 근거',
    responseTimeMs: 4500,
  });

  const answers = setAnswerAtIndex([first], 0, replacement);

  assert.equal(answers.length, 1);
  assert.equal(answers[0].selected_option_id, 2);
  assert.equal(answers[0].rationale, '수정한 근거');
});

test('buildPreInterviewAnswer fails safely for missing selection, rationale, and direct input', () => {
  const question = makeQuestion(1);

  assert.throws(
    () => buildPreInterviewAnswer({ question, selectedOptionId: 0, rationale: '근거', responseTimeMs: 1000 }),
    /선택지를 선택해주세요/,
  );
  assert.throws(
    () => buildPreInterviewAnswer({ question, selectedOptionId: 1, rationale: '   ', responseTimeMs: 1000 }),
    /판단 근거를 입력해주세요/,
  );
  assert.throws(
    () => buildPreInterviewAnswer({ question, selectedOptionId: 5, directAnswer: '', rationale: '근거', responseTimeMs: 1000 }),
    /직접 입력값을 입력해주세요/,
  );
});

test('validatePreQuestionBank rejects duplicate ids and malformed attribute tradeoff rows', () => {
  const duplicateBank = makeBank();
  duplicateBank.pre_questions[1] = { ...duplicateBank.pre_questions[1], pre_question_id: 1 };

  assert.throws(() => validatePreQuestionBank(duplicateBank), /pre_question_id 중복/);

  const invalidTradeoffBank = makeBank();
  invalidTradeoffBank.pre_questions[0] = {
    ...invalidTradeoffBank.pre_questions[0],
    pre_options: invalidTradeoffBank.pre_questions[0].pre_options.map((option) =>
      option.option_id === 2 ? { ...option, attribute_values: undefined } : option,
    ),
  };

  assert.throws(() => validatePreQuestionBank(invalidTradeoffBank), /attribute_values/);
});

test('getResponseSignal maps response time boundaries', () => {
  assert.equal(getResponseSignal(2999), 'strong_preference');
  assert.equal(getResponseSignal(3000), 'considered_preference');
  assert.equal(getResponseSignal(10000), 'considered_preference');
  assert.equal(getResponseSignal(10001), 'slow_response');
});
