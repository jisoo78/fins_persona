# Pre-Question Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent `사전 질문` sidebar section that renders `src/data/pre_question.json`, supports `attribute_tradeoff` table questions, and produces a `PreInterviewContext v2` for deep interview.

**Architecture:** Move pre-question domain logic into focused pure functions under `src/pre-question/`, then build a dedicated `PreQuestionView` that owns the 40+1 pre-interview flow. `App` stores the completed `PreInterviewContext` and passes it to `InterviewView`, which then starts only the deep interview phase.

**Tech Stack:** React 19, Vite 6, TypeScript, Tailwind CSS classes, lucide-react icons, Node test runner with `tsx`, local JSON import via `resolveJsonModule`.

---

## File Structure

- Create `src/pre-question/types.ts`
  - Defines the question-bank, answer, and `PreInterviewContext` types used by the UI and tests.
- Create `src/pre-question/preInterview.ts`
  - Validates the question bank, calculates response signals, converts selected answers into `PreInterviewAnswer`, updates answer arrays immutably, and builds `PreInterviewContext v2`.
- Create `src/pre-question/preInterview.test.ts`
  - Uses `node --import tsx --test` and follows the requested TDD test-plan block.
- Create `src/components/PreQuestionView.tsx`
  - Dedicated UI for 40 pre-questions plus the `communication_style` bridge question.
- Modify `package.json`
  - Adds a `test` script using the existing `tsx` dependency.
- Modify `src/types.ts`
  - Adds the `pre-question` tab and exports the shared `PreInterviewContext` type.
- Modify `src/components/Sidebar.tsx`
  - Adds the `사전 질문` menu item above `인터뷰`.
- Modify `src/App.tsx`
  - Stores completed `PreInterviewContext`, renders `PreQuestionView`, and passes context into `InterviewView`.
- Modify `src/components/InterviewView.tsx`
  - Removes direct pre-question JSON dependency from the deep interview flow and starts deep interview only when `PreInterviewContext` exists.

## Task 1: Pre-Question Domain Types, Validation, and Context Builder

**Files:**
- Create: `src/pre-question/types.ts`
- Create: `src/pre-question/preInterview.ts`
- Create: `src/pre-question/preInterview.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Add the test script to `package.json`**

Modify the `scripts` object so it contains this exact `test` entry:

```json
{
  "scripts": {
    "dev": "vite --port=3000 --host=0.0.0.0",
    "api": "tsx server/index.ts",
    "build": "vite build",
    "preview": "vite preview",
    "clean": "rm -rf dist server.js",
    "lint": "tsc --noEmit",
    "test": "node --import tsx --test \"src/**/*.test.ts\""
  }
}
```

- [ ] **Step 2: Write the failing tests in `src/pre-question/preInterview.test.ts`**

Create `src/pre-question/preInterview.test.ts` with this content:

```ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
npm test
```

Expected: FAIL with module resolution errors for `./preInterview` and `./types`, because those files do not exist yet.

- [ ] **Step 4: Create `src/pre-question/types.ts`**

```ts
export type PreQuestionStage = 'preference' | 'context_shift' | 'core_value' | 'red_line' | 'priority_order';

export type QuestionMode = 'single_choice' | 'attribute_tradeoff' | string;

export type ResponseSignal = 'strong_preference' | 'considered_preference' | 'slow_response';

export interface PreQuestionAttribute {
  attribute_id: string;
  label: string;
  value_type: string;
}

export interface PreQuestionOption {
  option_id: number;
  option_text: string;
  revealed_preference?: string;
  attribute_values?: Record<string, string>;
}

export interface PreQuestion {
  pre_question_id: number;
  category: string;
  decision_dimension: string;
  stage: PreQuestionStage;
  question_mode?: QuestionMode;
  pre_question: string;
  attributes?: PreQuestionAttribute[];
  pre_options: PreQuestionOption[];
}

export interface PreQuestionBank {
  schema_version?: string;
  target_role?: string;
  pre_questions: PreQuestion[];
}

export interface PreInterviewAnswer {
  source_question_id: number;
  category: string;
  decision_dimension: string;
  stage: PreQuestionStage;
  question: string;
  selected_option_id: number;
  answer: string;
  rationale: string;
  response_time_ms: number;
  response_signal: ResponseSignal;
  question_mode?: 'attribute_tradeoff';
  revealed_preference?: string;
  attribute_values?: Record<string, string>;
}

export interface CommunicationStyleAnswer {
  bridge_question_id: 'communication_style';
  selected_option_id: number;
  answer: string;
}

export interface PreInterviewContextQuestion {
  stage: PreQuestionStage;
  source_question_id: number;
  question: string;
  selected_option_id: number;
  answer: string;
  rationale: string;
  response_time_ms: number;
  response_signal: ResponseSignal;
  question_mode?: 'attribute_tradeoff';
  revealed_preference?: string;
  attribute_values?: Record<string, string>;
}

export interface PreInterviewContext {
  meta: {
    schema_version: 'pre_interview_context.v2';
    target_role: 'CFO';
    completed_at: string;
  };
  communication_style: CommunicationStyleAnswer;
  categories: Record<string, Record<string, PreInterviewContextQuestion>>;
}
```

- [ ] **Step 5: Create `src/pre-question/preInterview.ts`**

```ts
import type {
  CommunicationStyleAnswer,
  PreInterviewAnswer,
  PreInterviewContext,
  PreQuestion,
  PreQuestionBank,
  PreQuestionStage,
  ResponseSignal,
} from './types';

const requiredStages: PreQuestionStage[] = ['preference', 'context_shift', 'core_value', 'red_line', 'priority_order'];

export const getResponseSignal = (responseTimeMs: number): ResponseSignal => {
  if (responseTimeMs < 3000) return 'strong_preference';
  if (responseTimeMs <= 10000) return 'considered_preference';
  return 'slow_response';
};

const assertNonEmpty = (value: unknown, message: string): asserts value is string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(message);
  }
};

export const validatePreQuestionBank = (bank: PreQuestionBank): void => {
  if (!Array.isArray(bank.pre_questions) || bank.pre_questions.length === 0) {
    throw new Error('pre_questions가 비어 있습니다.');
  }

  const seenIds = new Set<number>();
  const stagesByCategory = new Map<string, Set<PreQuestionStage>>();

  bank.pre_questions.forEach((question) => {
    if (seenIds.has(question.pre_question_id)) {
      throw new Error(`pre_question_id 중복: ${question.pre_question_id}`);
    }
    seenIds.add(question.pre_question_id);

    assertNonEmpty(question.category, 'category가 비어 있습니다.');
    assertNonEmpty(question.decision_dimension, 'decision_dimension이 비어 있습니다.');
    assertNonEmpty(question.stage, 'stage가 비어 있습니다.');
    assertNonEmpty(question.pre_question, 'pre_question이 비어 있습니다.');

    if (!requiredStages.includes(question.stage)) {
      throw new Error(`허용되지 않는 stage: ${question.stage}`);
    }

    if (!Array.isArray(question.pre_options) || question.pre_options.length < 5) {
      throw new Error(`${question.pre_question_id}번 문항의 pre_options가 부족합니다.`);
    }

    const directOption = question.pre_options.find((option) => option.option_id === 5);
    if (!directOption || directOption.option_text !== 'E. 기타 (직접입력)') {
      throw new Error(`${question.pre_question_id}번 문항에 E. 기타 (직접입력) 선택지가 없습니다.`);
    }

    const categoryStages = stagesByCategory.get(question.category) ?? new Set<PreQuestionStage>();
    categoryStages.add(question.stage);
    stagesByCategory.set(question.category, categoryStages);

    if (question.question_mode === 'attribute_tradeoff') {
      if (!Array.isArray(question.attributes) || question.attributes.length === 0) {
        throw new Error(`${question.pre_question_id}번 attribute_tradeoff 문항에 attributes가 없습니다.`);
      }

      question.pre_options
        .filter((option) => option.option_id >= 1 && option.option_id <= 4)
        .forEach((option) => {
          if (!option.attribute_values) {
            throw new Error(`${question.pre_question_id}번 ${option.option_id}번 선택지에 attribute_values가 없습니다.`);
          }

          question.attributes?.forEach((attribute) => {
            if (!option.attribute_values?.[attribute.attribute_id]) {
              throw new Error(`${question.pre_question_id}번 ${option.option_id}번 선택지에 ${attribute.attribute_id} attribute_values가 없습니다.`);
            }
          });
        });
    }
  });

  stagesByCategory.forEach((stages, category) => {
    requiredStages.forEach((stage) => {
      if (!stages.has(stage)) {
        throw new Error(`${category} 카테고리에 ${stage} stage가 없습니다.`);
      }
    });
  });
};

export const buildPreInterviewAnswer = ({
  question,
  selectedOptionId,
  directAnswer = '',
  rationale,
  responseTimeMs,
}: {
  question: PreQuestion;
  selectedOptionId: number;
  directAnswer?: string;
  rationale: string;
  responseTimeMs: number;
}): PreInterviewAnswer => {
  if (!selectedOptionId) {
    throw new Error('선택지를 선택해주세요.');
  }

  assertNonEmpty(rationale, '판단 근거를 입력해주세요.');

  const selectedOption = question.pre_options.find((option) => option.option_id === selectedOptionId);
  if (!selectedOption) {
    throw new Error('선택한 보기를 찾을 수 없습니다.');
  }

  const isDirectInput = selectedOptionId === 5;
  if (isDirectInput) {
    assertNonEmpty(directAnswer, '직접 입력값을 입력해주세요.');
  }

  const answer: PreInterviewAnswer = {
    source_question_id: question.pre_question_id,
    category: question.category,
    decision_dimension: question.decision_dimension,
    stage: question.stage,
    question: question.pre_question,
    selected_option_id: selectedOptionId,
    answer: isDirectInput ? directAnswer.trim() : selectedOption.option_text,
    rationale: rationale.trim(),
    response_time_ms: responseTimeMs,
    response_signal: getResponseSignal(responseTimeMs),
  };

  if (question.question_mode === 'attribute_tradeoff') {
    answer.question_mode = 'attribute_tradeoff';
    answer.revealed_preference = selectedOption.revealed_preference;
    if (selectedOption.attribute_values) {
      answer.attribute_values = selectedOption.attribute_values;
    }
  }

  return answer;
};

export const setAnswerAtIndex = (
  answers: PreInterviewAnswer[],
  index: number,
  nextAnswer: PreInterviewAnswer,
): PreInterviewAnswer[] => {
  const nextAnswers = [...answers];
  nextAnswers[index] = nextAnswer;
  return nextAnswers;
};

export const buildPreInterviewContext = (
  answers: PreInterviewAnswer[],
  communicationStyle: CommunicationStyleAnswer,
  completedAt = new Date().toISOString(),
): PreInterviewContext => {
  const categories = answers.reduce<PreInterviewContext['categories']>((context, answer) => {
    const existingCategory = context[answer.category] ?? {};
    const nextIndex = Object.keys(existingCategory).length + 1;
    const contextQuestion: PreInterviewContext['categories'][string][string] = {
      stage: answer.stage,
      source_question_id: answer.source_question_id,
      question: answer.question,
      selected_option_id: answer.selected_option_id,
      answer: answer.answer,
      rationale: answer.rationale,
      response_time_ms: answer.response_time_ms,
      response_signal: answer.response_signal,
    };

    if (answer.question_mode === 'attribute_tradeoff') {
      contextQuestion.question_mode = 'attribute_tradeoff';
      contextQuestion.revealed_preference = answer.revealed_preference;
      if (answer.attribute_values) {
        contextQuestion.attribute_values = answer.attribute_values;
      }
    }

    return {
      ...context,
      [answer.category]: {
        ...existingCategory,
        [`question_${nextIndex}`]: contextQuestion,
      },
    };
  }, {});

  return {
    meta: {
      schema_version: 'pre_interview_context.v2',
      target_role: 'CFO',
      completed_at: completedAt,
    },
    communication_style: communicationStyle,
    categories,
  };
};
```

- [ ] **Step 6: Run tests and verify Task 1 passes**

Run:

```bash
npm test
```

Expected: PASS for all tests in `src/pre-question/preInterview.test.ts`.

- [ ] **Step 7: Run type check**

Run:

```bash
npm run lint
```

Expected: PASS with no TypeScript errors.

- [ ] **Step 8: Commit Task 1**

```bash
git add package.json src/pre-question/types.ts src/pre-question/preInterview.ts src/pre-question/preInterview.test.ts
git commit -m "feat: add pre-question context builder"
```

## Task 2: Add Navigation State for the Independent Pre-Question Section

**Files:**
- Modify: `src/types.ts`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Update `TabType` and shared context export in `src/types.ts`**

Replace the `TabType` line with:

```ts
export type TabType = 'dashboard' | 'pre-question' | 'interview' | 'personas' | 'persona-detail' | 'history' | 'settings';
```

Add this import and export at the top of `src/types.ts`:

```ts
import type { PreInterviewContext } from './pre-question/types';

export type { PreInterviewContext };
```

- [ ] **Step 2: Update `src/components/Sidebar.tsx` imports**

Add `ClipboardList` to the lucide import list:

```ts
import {
  LayoutDashboard,
  ClipboardList,
  MessageSquareText,
  Users,
  History,
  Settings,
  BrainCircuit,
  ChevronRight
} from 'lucide-react';
```

- [ ] **Step 3: Add `사전 질문` above `인터뷰` in `src/components/Sidebar.tsx`**

Replace the `navItems` array with:

```ts
const navItems: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: 'dashboard', label: '대시보드', icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: 'pre-question', label: '사전 질문', icon: <ClipboardList className="w-4 h-4" /> },
  { id: 'interview', label: '인터뷰', icon: <MessageSquareText className="w-4 h-4" /> },
  { id: 'personas', label: '페르소나', icon: <Users className="w-4 h-4" /> },
  { id: 'history', label: '히스토리', icon: <History className="w-4 h-4" /> },
  { id: 'settings', label: '설정', icon: <Settings className="w-4 h-4" /> },
];
```

- [ ] **Step 4: Update valid tabs in `src/App.tsx`**

Replace the `validTabs` line with:

```ts
const validTabs: TabType[] = ['dashboard', 'pre-question', 'interview', 'personas', 'persona-detail', 'history', 'settings'];
```

- [ ] **Step 5: Add context state in `src/App.tsx`**

Change the import from `./types` to include `PreInterviewContext`:

```ts
import { TabType, Persona, ChatMessage, DecisionRecord, UserSettings, PreInterviewContext } from './types';
```

Add this state below `selectedDecisionId`:

```ts
const [preInterviewContext, setPreInterviewContext] = useState<PreInterviewContext | null>(null);
```

- [ ] **Step 6: Run type check**

Run:

```bash
npm run lint
```

Expected: FAIL because `pre-question` has no rendered view yet and `PreQuestionView` is not created. This is acceptable for this step.

- [ ] **Step 7: Commit Task 2 after Task 3 passes**

Do not commit this task until Task 3 adds the missing screen and `npm run lint` passes.

## Task 3: Build `PreQuestionView` with General and Attribute Tradeoff Rendering

**Files:**
- Create: `src/components/PreQuestionView.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create `src/components/PreQuestionView.tsx`**

```tsx
import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, ClipboardList, RotateCcw } from 'lucide-react';
import preQuestionData from '../data/pre_question.json';
import {
  buildPreInterviewAnswer,
  buildPreInterviewContext,
  setAnswerAtIndex,
  validatePreQuestionBank,
} from '../pre-question/preInterview';
import type {
  CommunicationStyleAnswer,
  PreInterviewAnswer,
  PreInterviewContext,
  PreQuestion,
  PreQuestionBank,
} from '../pre-question/types';

interface PreQuestionViewProps {
  completedContext: PreInterviewContext | null;
  onComplete: (context: PreInterviewContext) => void;
  onStartDeepInterview: () => void;
}

const questionBank = preQuestionData as PreQuestionBank;

const communicationOptions = [
  { option_id: 1, option_text: '핵심 결론을 먼저 요약하고 세부 근거를 뒤에 제시한다.' },
  { option_id: 2, option_text: '수치 기준, 임계값, 조건문 중심으로 정리한다.' },
  { option_id: 3, option_text: '기준·낙관·비관 시나리오를 비교해 제시한다.' },
  { option_id: 4, option_text: '리스크, 예외 조건, 중단 기준을 먼저 제시한다.' },
  { option_id: 5, option_text: '실행 체크리스트와 다음 액션 중심으로 정리한다.' },
];

const getQuestionLabel = (question: PreQuestion) => `${question.category} · ${question.stage}`;

export const PreQuestionView: React.FC<PreQuestionViewProps> = ({
  completedContext,
  onComplete,
  onStartDeepInterview,
}) => {
  const validationError = useMemo(() => {
    try {
      validatePreQuestionBank(questionBank);
      return '';
    } catch (error) {
      return error instanceof Error ? error.message : '사전 질문 데이터 검증에 실패했습니다.';
    }
  }, []);

  const questions = questionBank.pre_questions;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<PreInterviewAnswer[]>([]);
  const [selectedOptionId, setSelectedOptionId] = useState<number>(0);
  const [directAnswer, setDirectAnswer] = useState('');
  const [rationale, setRationale] = useState('');
  const [communicationStyle, setCommunicationStyle] = useState<CommunicationStyleAnswer | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const questionStartedAtRef = useRef(Date.now());

  const currentQuestion = questions[currentIndex];
  const isBridgeStep = currentIndex >= questions.length;
  const progressPercent = completedContext ? 100 : Math.round((Math.min(currentIndex, questions.length) / (questions.length + 1)) * 100);

  const resetInputs = () => {
    setSelectedOptionId(0);
    setDirectAnswer('');
    setRationale('');
    setErrorMessage('');
    questionStartedAtRef.current = Date.now();
  };

  const loadAnswer = (index: number) => {
    const savedAnswer = answers[index];
    if (!savedAnswer) {
      resetInputs();
      return;
    }

    setSelectedOptionId(savedAnswer.selected_option_id);
    setDirectAnswer(savedAnswer.selected_option_id === 5 ? savedAnswer.answer : '');
    setRationale(savedAnswer.rationale);
    setErrorMessage('');
    questionStartedAtRef.current = Date.now();
  };

  const goPrevious = () => {
    if (isBridgeStep) {
      setCurrentIndex(questions.length - 1);
      loadAnswer(questions.length - 1);
      return;
    }

    if (currentIndex === 0) return;
    const nextIndex = currentIndex - 1;
    setCurrentIndex(nextIndex);
    loadAnswer(nextIndex);
  };

  const saveCurrentAnswer = () => {
    if (!currentQuestion) return;

    try {
      const nextAnswer = buildPreInterviewAnswer({
        question: currentQuestion,
        selectedOptionId,
        directAnswer,
        rationale,
        responseTimeMs: Date.now() - questionStartedAtRef.current,
      });
      const nextAnswers = setAnswerAtIndex(answers, currentIndex, nextAnswer);
      setAnswers(nextAnswers);

      if (currentIndex + 1 >= questions.length) {
        setCurrentIndex(questions.length);
        resetInputs();
        return;
      }

      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      const savedNextAnswer = nextAnswers[nextIndex];
      if (savedNextAnswer) {
        setSelectedOptionId(savedNextAnswer.selected_option_id);
        setDirectAnswer(savedNextAnswer.selected_option_id === 5 ? savedNextAnswer.answer : '');
        setRationale(savedNextAnswer.rationale);
        setErrorMessage('');
        questionStartedAtRef.current = Date.now();
      } else {
        resetInputs();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '사전 질문 응답 저장에 실패했습니다.');
    }
  };

  const completeBridge = () => {
    if (!communicationStyle) {
      setErrorMessage('보고 형식을 선택해주세요.');
      return;
    }

    const context = buildPreInterviewContext(answers, communicationStyle);
    onComplete(context);
    setErrorMessage('');
  };

  const resetAll = () => {
    setCurrentIndex(0);
    setAnswers([]);
    setCommunicationStyle(null);
    resetInputs();
  };

  if (validationError) {
    return (
      <div className="max-w-5xl mx-auto p-8">
        <div className="rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 p-5 text-sm text-rose-700 dark:text-rose-300">
          사전 질문 데이터 오류: {validationError}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6 px-8 space-y-6 animate-fade-in">
      <header className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400">PreInterviewContext v2</p>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">사전 질문</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                40개 사전 질문과 보고 형식 1개를 완료하면 심층 인터뷰 입력값이 생성됩니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={resetAll}
            className="h-10 inline-flex items-center gap-2 px-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold"
          >
            <RotateCcw className="w-4 h-4" />
            초기화
          </button>
        </div>
        <div className="mt-5">
          <div className="flex justify-between text-xs font-bold mb-1">
            <span className="text-indigo-600 dark:text-indigo-400">진행률</span>
            <span className="text-slate-700 dark:text-slate-300">{progressPercent}%</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </header>

      {completedContext && (
        <section className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4" />
                사전 질문 완료
              </div>
              <p className="text-sm text-emerald-800 dark:text-emerald-200 mt-2">
                {Object.keys(completedContext.categories).length}개 카테고리의 응답이 PreInterviewContext로 저장되었습니다.
              </p>
            </div>
            <button
              type="button"
              onClick={onStartDeepInterview}
              className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/20"
            >
              심층 인터뷰로 이동
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}

      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-5">
        {!isBridgeStep && currentQuestion && (
          <>
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 text-[11px] font-bold">
                  {currentIndex + 1} / {questions.length + 1}
                </span>
                <span className="text-xs font-bold text-slate-500">{getQuestionLabel(currentQuestion)}</span>
                {currentQuestion.question_mode === 'attribute_tradeoff' && (
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">테이블형 선택</span>
                )}
              </div>
              <h3 className="text-base font-black text-slate-900 dark:text-white leading-relaxed">{currentQuestion.pre_question}</h3>
            </div>

            {currentQuestion.question_mode === 'attribute_tradeoff' ? (
              <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                <table className="w-full min-w-[760px] text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="text-left p-3 w-[38%]">선택지</th>
                      {currentQuestion.attributes?.map((attribute) => (
                        <th key={attribute.attribute_id} className="p-3 text-center">{attribute.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {currentQuestion.pre_options.map((option) => {
                      const isSelected = selectedOptionId === option.option_id;
                      return (
                        <tr
                          key={option.option_id}
                          onClick={() => setSelectedOptionId(option.option_id)}
                          className={`cursor-pointer border-t border-slate-200 dark:border-slate-800 transition-colors ${
                            isSelected ? 'bg-indigo-50 dark:bg-indigo-950/40' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          <td className="p-3 font-semibold text-slate-800 dark:text-slate-100">
                            <span className="mr-2">{isSelected ? '●' : '○'}</span>
                            {option.option_text}
                          </td>
                          {currentQuestion.attributes?.map((attribute) => (
                            <td key={attribute.attribute_id} className="p-3 text-center font-bold text-slate-600 dark:text-slate-300">
                              {option.attribute_values?.[attribute.attribute_id] ?? '-'}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {currentQuestion.pre_options.map((option) => (
                  <button
                    key={option.option_id}
                    type="button"
                    onClick={() => setSelectedOptionId(option.option_id)}
                    className={`text-left p-4 rounded-2xl border text-xs font-semibold transition-all ${
                      selectedOptionId === option.option_id
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 text-slate-700 dark:text-slate-200 hover:border-indigo-300'
                    }`}
                  >
                    {option.option_text}
                  </button>
                ))}
              </div>
            )}

            {selectedOptionId === 5 && (
              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">직접 입력</span>
                <input
                  type="text"
                  value={directAnswer}
                  onChange={(event) => setDirectAnswer(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 px-3 py-2.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </label>
            )}

            <label className="block space-y-1.5">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">판단 근거</span>
              <textarea
                value={rationale}
                onChange={(event) => setRationale(event.target.value)}
                rows={3}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 px-3 py-2.5 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                placeholder="이 선택지가 본인의 판단 기준에 맞는 이유를 한 문장 이상 입력하세요."
              />
            </label>
          </>
        )}

        {isBridgeStep && (
          <div className="space-y-4">
            <div>
              <span className="px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 text-[11px] font-bold">
                {questions.length + 1} / {questions.length + 1}
              </span>
              <h3 className="text-base font-black text-slate-900 dark:text-white mt-3">심층 인터뷰 결과를 정리할 때 어떤 형식을 가장 선호합니까?</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {communicationOptions.map((option) => (
                <button
                  key={option.option_id}
                  type="button"
                  onClick={() => {
                    setCommunicationStyle({
                      bridge_question_id: 'communication_style',
                      selected_option_id: option.option_id,
                      answer: option.option_text,
                    });
                    setErrorMessage('');
                  }}
                  className={`text-left p-4 rounded-2xl border text-xs font-semibold transition-all ${
                    communicationStyle?.selected_option_id === option.option_id
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 text-slate-700 dark:text-slate-200 hover:border-indigo-300'
                  }`}
                >
                  {option.option_text}
                </button>
              ))}
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/30 p-3 text-xs text-rose-700 dark:text-rose-300">
            {errorMessage}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={goPrevious}
            disabled={currentIndex === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 text-slate-700 dark:text-slate-200 text-xs font-bold"
          >
            <ArrowLeft className="w-4 h-4" />
            이전
          </button>
          <button
            type="button"
            onClick={isBridgeStep ? completeBridge : saveCurrentAnswer}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-lg shadow-indigo-500/20"
          >
            {isBridgeStep ? 'PreInterviewContext 생성' : '다음'}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </section>
    </div>
  );
};
```

- [ ] **Step 2: Import `PreQuestionView` in `src/App.tsx`**

Add this import with the other component imports:

```ts
import { PreQuestionView } from './components/PreQuestionView';
```

- [ ] **Step 3: Render `PreQuestionView` in `src/App.tsx`**

Add this block before the `activeTab === 'interview'` block:

```tsx
{activeTab === 'pre-question' && (
  <PreQuestionView
    completedContext={preInterviewContext}
    onComplete={(context) => setPreInterviewContext(context)}
    onStartDeepInterview={() => setActiveTab('interview')}
  />
)}
```

- [ ] **Step 4: Run tests and type check**

Run:

```bash
npm test
npm run lint
```

Expected: `npm test` passes. `npm run lint` may fail only because `InterviewView` does not yet accept `preInterviewContext`; fix that in Task 4 before committing.

## Task 4: Wire Completed Context into Deep Interview and Remove Pre-Question Responsibility from `InterviewView`

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/InterviewView.tsx`

- [ ] **Step 1: Pass pre-interview context props in `src/App.tsx`**

In the `InterviewView` render block, add these props:

```tsx
<InterviewView
  messages={chatMessages}
  setMessages={setChatMessages}
  decisions={decisions}
  preInterviewContext={preInterviewContext}
  onGoToPreQuestion={() => setActiveTab('pre-question')}
  onCreatePersona={handleAddPersona}
  onAddHistoryRecord={handleAddDecision}
  onGoToPersonas={() => setActiveTab('personas')}
/>
```

- [ ] **Step 2: Update `InterviewView` imports**

Remove this import:

```ts
import preQuestionData from '../../pre_question.json';
```

Add `PreInterviewContext` to the type import:

```ts
import { ChatMessage, DecisionRecord, InterviewQuestion, Persona, RoleType, PreInterviewContext } from '../types';
```

- [ ] **Step 3: Remove local pre-question-only interfaces from `src/components/InterviewView.tsx`**

Delete these local interfaces because Task 1 now owns the contract type:

```ts
interface PreInterviewAnswer {
  source_question_id: number;
  category: string;
  decision_dimension: string;
  stage: string;
  question: string;
  selected_option_id: number;
  answer: string;
  rationale: string;
  response_time_ms: number;
  response_signal: 'strong_preference' | 'considered_preference' | 'slow_response';
}

interface CommunicationStyleAnswer {
  bridge_question_id: 'communication_style';
  selected_option_id: number;
  answer: string;
}

interface PreInterviewContext {
  meta: {
    schema_version: 'pre_interview_context.v2';
    target_role: 'CFO';
    completed_at: string;
  };
  communication_style: CommunicationStyleAnswer;
  categories: Record<string, Record<string, {
    stage: string;
    source_question_id: number;
    question: string;
    selected_option_id: number;
    answer: string;
    rationale: string;
    response_time_ms: number;
    response_signal: PreInterviewAnswer['response_signal'];
  }>>;
}
```

- [ ] **Step 4: Remove pre-question data helpers from `InterviewView`**

Delete these declarations:

```ts
interface PreQuestionOption {
  option_id: number;
  option_text: string;
}

interface PreQuestion {
  pre_question_id: number;
  category: string;
  decision_dimension: string;
  stage: string;
  pre_question: string;
  pre_options: PreQuestionOption[];
}

interface PreInterviewData {
  pre_questions: PreQuestion[];
}

const preInterviewData = preQuestionData as PreInterviewData;

const createPreInterviewQuestions = (): InterviewQuestion[] =>
  preInterviewData.pre_questions.map((question) => ({
    id: question.pre_question_id,
    type: '객관식',
    category: question.category,
    subtitle: question.stage,
    question: question.pre_question,
    options: question.pre_options.map((option) => `${option.option_id}. ${option.option_text}`),
  }));

const getResponseSignal = (responseTimeMs: number): PreInterviewAnswer['response_signal'] => {
  if (responseTimeMs < 3000) return 'strong_preference';
  if (responseTimeMs <= 10000) return 'considered_preference';
  return 'slow_response';
};

const createPreInterviewContext = (
  answers: PreInterviewAnswer[],
  communicationStyle: CommunicationStyleAnswer,
): PreInterviewContext => {
  const categories = answers.reduce<PreInterviewContext['categories']>((context, answer) => {
    const categoryAnswers = context[answer.category] ?? {};
    const nextIndex = Object.keys(categoryAnswers).length + 1;

    return {
      ...context,
      [answer.category]: {
        ...categoryAnswers,
        [`question_${nextIndex}`]: {
          stage: answer.stage,
          source_question_id: answer.source_question_id,
          question: answer.question,
          selected_option_id: answer.selected_option_id,
          answer: answer.answer,
          rationale: answer.rationale,
          response_time_ms: answer.response_time_ms,
          response_signal: answer.response_signal,
        },
      },
    };
  }, {});

  return {
    meta: {
      schema_version: 'pre_interview_context.v2',
      target_role: 'CFO',
      completed_at: new Date().toISOString(),
    },
    communication_style: communicationStyle,
    categories,
  };
};
```

- [ ] **Step 5: Update `InterviewViewProps`**

Replace the props interface with:

```ts
interface InterviewViewProps {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  decisions: DecisionRecord[];
  preInterviewContext: PreInterviewContext | null;
  onGoToPreQuestion: () => void;
  onCreatePersona: (persona: Persona) => void | Promise<void>;
  onAddHistoryRecord: (record: DecisionRecord) => void;
  onGoToPersonas: () => void;
}
```

Update the component parameter destructuring:

```ts
export const InterviewView: React.FC<InterviewViewProps> = ({
  messages,
  setMessages,
  decisions,
  preInterviewContext: completedPreInterviewContext,
  onGoToPreQuestion,
  onCreatePersona,
  onAddHistoryRecord,
  onGoToPersonas,
}) => {
```

- [ ] **Step 6: Simplify phase state defaults**

Replace these initial states:

```ts
const [interviewPhase, setInterviewPhase] = useState<InterviewPhase>('pre');
const [activeQuestions, setActiveQuestions] = useState<InterviewQuestion[]>(() => createPreInterviewQuestions());
const [preInterviewAnswers, setPreInterviewAnswers] = useState<PreInterviewAnswer[]>([]);
const [preInterviewContext, setPreInterviewContext] = useState<PreInterviewContext | null>(null);
const [communicationStyle, setCommunicationStyle] = useState<CommunicationStyleAnswer | null>(null);
const [pendingPreAnswer, setPendingPreAnswer] = useState<string | null>(null);
```

With:

```ts
const [interviewPhase, setInterviewPhase] = useState<InterviewPhase>('deep');
const [activeQuestions, setActiveQuestions] = useState<InterviewQuestion[]>([]);
const [preInterviewContext, setPreInterviewContext] = useState<PreInterviewContext | null>(completedPreInterviewContext);
```

Delete every remaining `preInterviewAnswers`, `communicationStyle`, and `pendingPreAnswer` state usage.

- [ ] **Step 7: Add sync effect for completed context**

Add this effect after the existing profile draft effect:

```ts
useEffect(() => {
  setPreInterviewContext(completedPreInterviewContext);
}, [completedPreInterviewContext]);
```

- [ ] **Step 8: Change `startDataCollection` to generate deep questions from completed context**

Replace the body of `startDataCollection` with:

```ts
const startDataCollection = async () => {
  if (!completedPreInterviewContext) {
    setSaveStatus('failed');
    setSaveError('사전 질문을 먼저 완료해주세요.');
    return;
  }

  setIsCollecting(true);
  setSaveStatus('idle');
  setSaveError('');

  try {
    const snapshot = await discoverPublicData();
    const deepQuestions = await generateAgentDeepQuestions(completedPreInterviewContext);
    const prompt = createBrainstormerPrompt(profile, deepQuestions.length, snapshot, completedPreInterviewContext);

    await saveProfileIntake(snapshot, deepQuestions, prompt);

    setPublicData(snapshot);
    setActiveQuestions(deepQuestions);
    setMessages(buildInitialMessages(deepQuestions, prompt, 'deep'));
    setCurrentQIndex(0);
    setInterviewPhase('deep');
    setPreInterviewContext(completedPreInterviewContext);
    setIsComplete(false);
    setFinalOutput(null);
    setStep('interview');
    questionStartedAtRef.current = Date.now();
  } catch (error) {
    setSaveStatus('failed');
    setSaveError(error instanceof Error ? error.message : 'DB 저장 중 알 수 없는 오류가 발생했습니다.');
  } finally {
    setIsCollecting(false);
  }
};
```

- [ ] **Step 9: Remove pre and communication branches from `handleSendAnswer` and `handleOptionAnswer`**

Replace `handleSendAnswer` with:

```ts
const handleSendAnswer = (answerText: string) => {
  if (!answerText.trim() || isThinking || isDemoRunning || isComplete || step !== 'interview') return;
  const displayAnswer = answerText;

  const userMsg: ChatMessage = {
    id: `u-${Date.now()}`,
    sender: 'user',
    text: displayAnswer,
    timestamp: formatTime(),
  };
  const nextAnswers = [...userAnswers, displayAnswer];

  setMessages((prev) => [...prev, userMsg]);
  setInputText('');
  setIsThinking(true);

  window.setTimeout(async () => {
    const nextIndex = currentQIndex + 1;

    if (nextIndex < totalQuestions) {
      setCurrentQIndex(nextIndex);
      const nextQ = activeQuestions[nextIndex];
      questionStartedAtRef.current = Date.now();
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: `답변을 기록했습니다.\n\n${nextQ.question}`,
          timestamp: formatTime(),
          questionType: nextQ.type,
          options: nextQ.options,
        },
      ]);
    } else {
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-complete-${Date.now()}`,
          sender: 'ai',
          text: '인터뷰가 완료되었습니다. 1차 결과로 의사 결정 기준 요약과 AI 참모 핵심 지침을 생성했습니다.',
          timestamp: formatTime(),
        },
      ]);
      void completeInterview(nextAnswers);
    }
    setIsThinking(false);
  }, 500);
};
```

Replace `handleOptionAnswer` with:

```ts
const handleOptionAnswer = (answerText: string) => {
  handleSendAnswer(answerText);
};
```

- [ ] **Step 10: Update empty-state UI in `InterviewView`**

Inside the `step === 'profile'` section, add this block above the profile form:

```tsx
{!completedPreInterviewContext && (
  <div className="rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm text-amber-800 dark:text-amber-200">
    심층 인터뷰를 시작하려면 사전 질문을 먼저 완료해야 합니다.
    <button
      type="button"
      onClick={onGoToPreQuestion}
      className="ml-3 inline-flex items-center px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold"
    >
      사전 질문으로 이동
    </button>
  </div>
)}
```

Change the start button label to:

```tsx
DB 저장 + Sherlock SNS 탐색 후 심층 인터뷰 시작
```

Change the start button `disabled` prop to:

```tsx
disabled={isCollecting || !completedPreInterviewContext}
```

- [ ] **Step 11: Update input placeholder and disabled logic**

Replace the input `placeholder` expression at the bottom with:

```tsx
placeholder="E. 기타를 선택했다면 한 문장으로 직접 입력"
```

Replace the input `disabled` prop with:

```tsx
disabled={isComplete}
```

- [ ] **Step 12: Keep demo flow compiling with completed context**

In `runDemoFlow`, replace the demo pre-answer/context construction with:

```ts
if (!completedPreInterviewContext) {
  setSaveStatus('failed');
  setSaveError('데모 실행 전에 사전 질문을 완료해주세요.');
  return;
}

const demoContext = completedPreInterviewContext;
const demoQuestions = await generateAgentDeepQuestions(demoContext);
```

Delete the local `demoPreAnswers` and `demoCommunicationStyle` variables and remove calls to `setPreInterviewAnswers` and `setCommunicationStyle`.

- [ ] **Step 13: Run tests, type check, and build**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all commands pass.

- [ ] **Step 14: Commit Tasks 2-4 together**

```bash
git add src/types.ts src/components/Sidebar.tsx src/App.tsx src/components/PreQuestionView.tsx src/components/InterviewView.tsx
git commit -m "feat: add independent pre-question flow"
```

## Task 5: Final Verification and Manual UI Smoke Test

**Files:**
- No source files should change unless verification exposes a defect.

- [ ] **Step 1: Run full verification**

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected:

- `npm test`: all Node tests pass.
- `npm run lint`: TypeScript reports no errors.
- `npm run build`: Vite production build succeeds.
- `git diff --check`: no whitespace errors.

- [ ] **Step 2: Start the dev server**

```bash
npm run dev
```

Expected: Vite prints a local URL, normally `http://localhost:3000/`.

- [ ] **Step 3: Manual smoke test in browser**

Open the Vite URL and verify this exact flow:

1. Sidebar shows `사전 질문` above `인터뷰`.
2. Click `사전 질문`.
3. First question renders as a table because its `question_mode` is `attribute_tradeoff`.
4. Select a table row, enter 판단 근거, and click `다음`.
5. Click `이전`, change the answer, and click `다음`; the UI should not duplicate the answer.
6. Choose `E. 기타 (직접입력)` on a question, leave direct input blank, and click `다음`; an error message appears and progress does not advance.
7. Complete the remaining questions.
8. Select a `communication_style`.
9. Click `PreInterviewContext 생성`.
10. Completion summary appears and the `심층 인터뷰로 이동` button opens `인터뷰`.
11. In `인터뷰`, the start button is enabled and starts deep interview using the completed context.

- [ ] **Step 4: Stop the dev server**

Press `Ctrl+C` in the terminal running Vite.

- [ ] **Step 5: Commit verification fixes if any were needed**

If Step 3 found a defect and you changed source code:

```bash
git add src package.json
git commit -m "fix: polish pre-question flow"
```

If no source changes were needed, do not create an empty commit.

## Self-Review Notes

- Spec coverage: The plan covers the sidebar item, independent `PreQuestionView`, normal choice rendering, `attribute_tradeoff` table rendering, `PreInterviewContext v2` generation, answer replacement, failure-path validation, and build verification.
- Scope boundaries: The plan does not add DB migrations, server persistence changes, role-specific non-CFO banks, or final summary editing, matching the approved exclusions.
- Type consistency: `PreInterviewContext`, `PreInterviewAnswer`, `CommunicationStyleAnswer`, `question_mode`, `revealed_preference`, and `attribute_values` are defined once in `src/pre-question/types.ts` and reused by UI and tests.
