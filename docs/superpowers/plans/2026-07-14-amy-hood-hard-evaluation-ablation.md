# Amy Hood Hard Evaluation and Three-Arm Ablation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the easy Amy Hood multiple-choice set with plausible near-neighbor traps, then run and display a reproducible three-arm Gemma 4 experiment that separates RAG lift from persona-prompt lift.

**Architecture:** Keep the existing file-backed 7/5/3 evaluation pipeline and add an optional `experimentArm` plus `experimentGroupId` to each run. Build evaluation input as explicit system/user messages, inject one metadata-wrapped raw chunk only for `persona_rag` past-memory questions, and derive grouped three-arm reports from ordinary run files rather than adding a database or experiment store.

**Tech Stack:** TypeScript, Node.js test runner, Express, React, LangChain `ChatOpenAI`, JSON file persistence, local llama.cpp Gemma 4 on `127.0.0.1:8080`.

## Global Constraints

- Work only on branch `codex/harden-amy-hood-evaluation`.
- Preserve the KPI count exactly: 7 past-memory multiple choice, 5 GitHub holdout multiple choice, 3 subjective scenarios.
- Use question, answer-key, and review version `2.0.0`; keep all fifteen reviews `approved` under the user's explicit approval.
- Keep GraphRAG, Vector RAG replacement, Cohere changes, automatic API grading, and a new database out of scope.
- Keep the current deterministic keyword top-1 retriever so question difficulty and retrieval architecture do not change in the same experiment.
- Run the three local arms sequentially in this exact order: `persona_rag`, `persona_no_rag`, `generic_cfo_no_rag`.
- Preserve existing run JSON compatibility when `experimentArm` and `experimentGroupId` are absent.
- Use an actual system-role message for the persona/control prompt and a user-role message for evidence, question, options, and output format.
- Inject source metadata and raw text only for P1-P7 in `persona_rag`; H1-H5 and S1-S3 receive no RAG in every arm.
- Do not stage or overwrite the user's local prompt/runtime files unless a task names the file explicitly: `data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md`, `data/b-track/amy-hood/prompt-versions.json`, `data/b-track/amy-hood/prompts/`, `evaluation/runs/`.
- Follow AGENTS.md: one happy path, exactly three realistic edge cases by default, and safe failure paths; test first and observe RED before production changes.

---

## File Structure

### Create

- `server/evaluation/questionQuality.ts`: deterministic quality checks for option-length leakage, longest-answer leakage, and answer-position balance.
- `agent_prompts/prompts/generic-cfo-control.md`: stable non-Amy CFO system prompt used only by the generic control arm.
- `src/components/evaluation/ExperimentGroupReport.tsx`: three-column group result and lift presentation shared by execution and report screens.
- `tests/amyHoodEvaluationQuestionQuality.test.ts`: data-quality contract with the required Test Plan comment.

### Modify

- `evaluation/amy_hood_eval_questions.json`: version 2.0.0 hard questions and near-neighbor options.
- `evaluation/amy_hood_eval_answer_key.json`: version 2.0.0 answers and precise trap intents.
- `evaluation/amy_hood_eval_question_reviews.json`: version 2.0.0, fifteen approved reviews.
- `shared/amyHoodEvaluation.ts`: experiment arm and group fields.
- `server/personaPipeline/modelClient.ts`: backward-compatible string or system/user model input.
- `server/evaluation/prompt.ts`: structured model input and metadata-wrapped evidence.
- `server/evaluation/retriever.ts`: arm-aware evidence policy.
- `server/evaluation/runner.ts`: arm-specific prompt selection and sequential three-run orchestration.
- `server/evaluation/routes.ts`: `POST /experiments`.
- `src/services/evaluationApi.ts`: experiment creation client.
- `src/components/evaluation/evaluationViewModel.ts`: arm labels and grouped lift calculation.
- `src/components/evaluation/evaluationReportViewModel.ts`: arm label in single-run reports.
- `src/components/evaluation/EvaluationRunForm.tsx`: local three-arm button.
- `src/components/EvaluationView.tsx`: start and poll experiment groups.
- `src/components/EvaluationReportView.tsx`: experiment report mode.
- `tests/amyHoodEvaluation.test.ts`: structured input, arm policy, orchestration, and route tests.
- `tests/amyHoodEvaluationUi.test.ts`: API and grouped view-model tests.
- `tests/evaluationReport.test.ts`: arm label compatibility.
- `package.json`: include the new question-quality test in `evaluation:test`.

---

### Task 1: Enforce and Author the Version 2.0.0 Hard Question Set

**Files:**
- Create: `server/evaluation/questionQuality.ts`
- Create: `tests/amyHoodEvaluationQuestionQuality.test.ts`
- Modify: `server/evaluation/questionSet.ts`
- Modify: `evaluation/amy_hood_eval_questions.json`
- Modify: `evaluation/amy_hood_eval_answer_key.json`
- Modify: `evaluation/amy_hood_eval_question_reviews.json`
- Modify: `tests/amyHoodEvaluation.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `EvaluationQuestionFile` and `EvaluationAnswerKeyFile` from `shared/amyHoodEvaluation.ts`.
- Produces: `assertQuestionDifficulty(questions, answerKey): void`, called by `assertEvaluationBundle` after structural validation.

- [ ] **Step 1: Write the failing question-quality test with the required Test Plan**

Create `tests/amyHoodEvaluationQuestionQuality.test.ts` with this top-level shape:

```ts
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
  questions: JSON.parse(await readFile('evaluation/amy_hood_eval_questions.json', 'utf8')) as EvaluationQuestionFile,
  answers: JSON.parse(await readFile('evaluation/amy_hood_eval_answer_key.json', 'utf8')) as EvaluationAnswerKeyFile,
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
        '가'.repeat(index === boundaryQuestionIndex && position === correctChoice ? 110 : 100),
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
  assert.doesNotThrow(() => assertQuestionDifficulty(fixture.questions, fixture.answers));
});

test('edge: answer-position counts two and four are accepted', () => {
  const fixture = qualityFixture([1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4]);
  assert.doesNotThrow(() => assertQuestionDifficulty(fixture.questions, fixture.answers));
});

test('edge: moving an answer with its trap intent preserves the contract', async () => {
  const { questions, answers } = await loadFiles();
  const clonedQuestions = structuredClone(questions);
  const clonedAnswers = structuredClone(answers);
  const question = clonedQuestions.questions.find((item) => item.id === 'P1')!;
  const answer = clonedAnswers.answers.find((item) => item.questionId === 'P1')!;
  [question.options![0], question.options![1]] = [question.options![1], question.options![0]];
  answer.correctChoice = answer.correctChoice === 1 ? 2 : answer.correctChoice === 2 ? 1 : answer.correctChoice;
  [answer.trapIntents!['1'], answer.trapIntents!['2']] = [answer.trapIntents!['2'], answer.trapIntents!['1']];
  assert.doesNotThrow(() => assertQuestionDifficulty(clonedQuestions, clonedAnswers));
});

test('failure: answer-shape shortcuts are rejected', async () => {
  const { questions, answers } = await loadFiles();
  const longCorrect = structuredClone(questions);
  const answer = answers.answers.find((item) => item.questionId === 'P1')!;
  longCorrect.questions.find((item) => item.id === 'P1')!.options![answer.correctChoice! - 1] += ' 정답만 비정상적으로 길게 만든다.';
  assert.throws(() => assertQuestionDifficulty(longCorrect, answers), /correct option length/);
});
```

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
npx tsx --test tests/amyHoodEvaluationQuestionQuality.test.ts
```

Expected: FAIL because `server/evaluation/questionQuality.ts` does not exist and the committed dataset is still version `1.0.0`.

- [ ] **Step 3: Implement the deterministic quality validator**

Create `server/evaluation/questionQuality.ts` with these exact rules:

```ts
import type {
  EvaluationAnswerKeyFile,
  EvaluationQuestionFile,
} from '../../shared/amyHoodEvaluation';

const obviousShortcut = /모든|무조건|영구적으로|한도를 두지 않고|전액을 한 분기에/;

export const assertQuestionDifficulty = (
  questions: EvaluationQuestionFile,
  answerKey: EvaluationAnswerKeyFile,
) => {
  const multipleChoice = questions.questions.filter((question) => question.type === 'multiple_choice');
  const keys = new Map(answerKey.answers.map((answer) => [answer.questionId, answer]));
  const positions = new Map<number, number>([[1, 0], [2, 0], [3, 0], [4, 0]]);
  let uniqueLongestCorrect = 0;

  for (const question of multipleChoice) {
    const answer = keys.get(question.id)!;
    const correctIndex = answer.correctChoice! - 1;
    const lengths = question.options!.map((option) => [...option].length);
    const distractorLengths = lengths.filter((_, index) => index !== correctIndex);
    const distractorMean = distractorLengths.reduce((sum, value) => sum + value, 0) / distractorLengths.length;
    const deviation = Math.abs(lengths[correctIndex] - distractorMean) / distractorMean;
    if (deviation > 0.10) throw new Error(`${question.id} correct option length leaks the answer`);
    if (lengths[correctIndex] === Math.max(...lengths) && lengths.filter((value) => value === lengths[correctIndex]).length === 1) {
      uniqueLongestCorrect += 1;
    }
    if (question.options!.some((option) => obviousShortcut.test(option))) {
      throw new Error(`${question.id} contains an obvious absolute-choice shortcut`);
    }
    positions.set(answer.correctChoice!, positions.get(answer.correctChoice!)! + 1);
  }

  if (uniqueLongestCorrect > 3) throw new Error('too many uniquely longest correct options');
  for (const [position, count] of positions) {
    if (count < 2 || count > 4) throw new Error(`answer position ${position} count must be from 2 to 4`);
  }
};
```

Import and call it at the end of `assertEvaluationBundle` in `server/evaluation/questionSet.ts`.

- [ ] **Step 4: Rewrite the question, key, and review data to version 2.0.0**

Use `apply_patch` and preserve IDs and KPI ordering. Use this exact answer-position and near-neighbor matrix:

| ID | Correct | Correct judgment order | Trap 1 | Trap 2 | Trap 3 |
|---|---:|---|---|---|---|
| P1 | 3 | accept accounting dilution, then validate seats/retention/billings/unearned revenue/LTV together | reported revenue gate before acceleration | billings gate before retention proof | margin recovery gate before customer quality |
| P2 | 1 | recognize impairment, resize, then selectively redeploy reusable capabilities | redeploy broadly before unit economics review | preserve scale until cash loss stabilizes | sell assets before checking portfolio reuse |
| P3 | 4 | fix member-first independence and financing limits before phased synergy | EPS accretion gate before network protection | cross-sell milestone before independence covenant | engagement growth before integration-cost ceiling |
| P4 | 2 | separate observed segment effects, publish assumptions, avoid annualizing temporary usage | narrow guidance to consolidated margin first | annualize cloud demand but haircut ads | delay guidance until supply-chain variance closes |
| P5 | 4 | remove low-priority duplication, protect core growth, require operating leverage milestones now | protect growth portfolio and defer leverage gate | apply equal productivity hurdle across mature and growth work | preserve customer-facing spend before technical capacity |
| P6 | 1 | separate purchase accounting, then track engagement/distribution/cash and portfolio return | require standalone margin recovery before distribution | prioritize ecosystem distribution before integration cost ceiling | prioritize cash synergy before engagement durability |
| P7 | 3 | stage capacity by contracted usage, utilization, conversion, depreciation and margin milestones | build against weighted pipeline before contracts | wait for utilization before reserving long-lead supply | approve full long-lead supply but gate accelerators later |
| H1 | 2 | approve within dilution range after independence and neutrality are transaction conditions | approve with independence reviewed after close | approve with cross-sell covenant before neutrality | approve with buyback plan as the primary dilution control |
| H2 | 3 | protect choice and independent operation first, then voluntary Enterprise monetization | launch neutral cross-sell before trust metrics stabilize | use pricing incentives first while retaining multi-cloud support | delay commercial integration until standalone margin target |
| H3 | 4 | pause pre-close buybacks, then offset dilution over time without harming investment capacity | resume buybacks at close using a fixed annual amount | offset half at close and gate the rest on GitHub margin | resume only after GitHub standalone cash flow turns positive |
| H4 | 1 | include estimable costs now and update ranges as purchase accounting changes | hold a wider EPS range until allocation is complete | exclude transaction costs but include recurring integration costs | preserve prior guidance and add a qualitative sensitivity only |
| H5 | 2 | lead with developer retention/adoption, then enterprise and ecosystem contribution under company margin discipline | lead with Enterprise conversion before free-user retention | lead with Microsoft cloud attach while preserving neutrality | lead with standalone contribution margin before ecosystem value |

For every option, write 2 sentences or 1 compound sentence containing: action, protected value, accepted cost/risk, and next checkpoint. After editing, calculate each correct-length deviation and adjust wording without changing the matrix semantics until all constraints pass.

For `trapIntents`, describe the precise timing or weighting error; never use labels such as merely `단기적이다` or `틀린 답`.

Rewrite S1-S3 prompts so they provide facts and uncertainty but do not enumerate the expected verbs `승인·축소·단계화`. Keep the existing rubric unchanged.

Capture one value with `date -u +%Y-%m-%dT%H:%M:%SZ`. Set every review to `status: "approved"`, `revisionNote: ""`, and that same captured value in `reviewedAt`.

- [ ] **Step 5: Update version assertions and the evaluation test script**

Change hard-coded question versions in `tests/amyHoodEvaluation.test.ts` from `1.0.0` to `2.0.0`. Add `tests/amyHoodEvaluationQuestionQuality.test.ts` to `package.json` `evaluation:test` immediately after `tests/amyHoodEvaluation.test.ts`.

- [ ] **Step 6: Run focused and full evaluation tests and verify GREEN**

Run:

```bash
npx tsx --test tests/amyHoodEvaluationQuestionQuality.test.ts tests/amyHoodEvaluation.test.ts
npm run evaluation:test
```

Expected: all tests pass, the bundle reports 7/5/3 at version 2.0.0, and no quality validator error appears.

- [ ] **Step 7: Commit only the question-quality task**

```bash
git add server/evaluation/questionQuality.ts server/evaluation/questionSet.ts tests/amyHoodEvaluationQuestionQuality.test.ts tests/amyHoodEvaluation.test.ts evaluation/amy_hood_eval_questions.json evaluation/amy_hood_eval_answer_key.json evaluation/amy_hood_eval_question_reviews.json package.json
git commit -m "test: harden Amy Hood evaluation questions"
```

---

### Task 2: Send Real System Messages and Metadata-Wrapped Evidence

**Files:**
- Modify: `shared/amyHoodEvaluation.ts`
- Modify: `server/personaPipeline/modelClient.ts`
- Modify: `server/evaluation/prompt.ts`
- Modify: `server/evaluation/retriever.ts`
- Modify: `tests/amyHoodEvaluation.test.ts`
- Modify: `tests/amyHoodPersonaPipeline.test.ts`

**Interfaces:**
- Produces: `EvaluationExperimentArm` and optional experiment fields on `EvaluationRun` for arm-aware prompt construction.
- Produces: `ModelInput = string | { system: string; user: string }` and `toLangChainInput(input)`.
- Produces: `buildEvaluationInput(systemPrompt, question, chunks, arm): { system: string; user: string }`.
- Produces: `retrieveEvaluationEvidence(corpus, question, arm): SourceChunk[]`.

- [ ] **Step 1: Update the test plan and write failing structured-input tests**

Keep the `tests/amyHoodEvaluation.test.ts` header at exactly three edge cases by replacing its edge list with:

```text
- legacy 실행은 experiment 필드 없이도 활성 프롬프트를 읽는다.
- RAG 없는 두 실험군은 모든 KPI에서 빈 증거를 유지한다.
- 선택지 응답의 fenced JSON과 한국어 이유를 보존한다.
```

Change the past-memory prompt test to assert:

```ts
const input = buildEvaluationInput('PERSONA', question, chunks, 'persona_rag');
assert.equal(input.system, 'PERSONA');
assert.match(input.user, /\[RAG EVIDENCE\]/);
assert.match(input.user, new RegExp(`source_id: ${chunks[0].sourceId}`));
assert.match(input.user, new RegExp(`chunk_id: ${chunks[0].chunkId}`));
assert.match(input.user, /block_ids:/);
assert.doesNotMatch(input.system, /RAG EVIDENCE/);
```

Add assertions that `persona_no_rag` and `generic_cfo_no_rag` return no chunks for P1, H1, and S1, and that `buildEvaluationInput` rejects non-empty chunks for no-RAG arms.

In `tests/amyHoodPersonaPipeline.test.ts`, add a focused test for `toLangChainInput` proving the first message has system role and the second has human role while a string remains a string.

- [ ] **Step 2: Run tests and verify RED**

```bash
npx tsx --test tests/amyHoodEvaluation.test.ts tests/amyHoodPersonaPipeline.test.ts
```

Expected: FAIL because `buildEvaluationInput`, `retrieveEvaluationEvidence`, `ModelInput`, and `toLangChainInput` do not exist.

- [ ] **Step 3: Add the backward-compatible model input contract**

First add the arm type and optional run fields to `shared/amyHoodEvaluation.ts` so the prompt and retriever can compile:

```ts
export type EvaluationExperimentArm =
  | 'persona_rag'
  | 'persona_no_rag'
  | 'generic_cfo_no_rag';
```

Add `experimentGroupId?: string` and `experimentArm?: EvaluationExperimentArm` to `EvaluationRun`.

In `server/personaPipeline/modelClient.ts`, import `HumanMessage` and `SystemMessage` from `@langchain/core/messages` and implement:

```ts
export type ModelInput = string | { system: string; user: string };

export const toLangChainInput = (input: ModelInput) =>
  typeof input === 'string'
    ? input
    : [new SystemMessage(input.system), new HumanMessage(input.user)];

export interface ModelClient {
  provider: ProviderName;
  model: string;
  cacheKey: string;
  invoke(input: ModelInput): Promise<ModelResult>;
}
```

Change only `chat.invoke(prompt)` to `chat.invoke(toLangChainInput(input))`. Preserve analyzer and prompt-builder string calls unchanged.

- [ ] **Step 4: Make retrieval arm-aware without changing ranking**

In `server/evaluation/retriever.ts` replace `retrievePastMemoryEvidence` with:

```ts
export const retrieveEvaluationEvidence = (
  corpus: EvaluationCorpus,
  question: EvaluationQuestion,
  arm: EvaluationExperimentArm,
): SourceChunk[] => {
  if (arm !== 'persona_rag' || question.kpi !== 'past_memory_restoration') return [];
  // Keep the existing tokenize -> scoreText -> sort -> slice(0, 1) implementation exactly.
};
```

Do not introduce embeddings, reranking, multiple chunks, or new source data.

- [ ] **Step 5: Build system/user evaluation input and minimal metadata**

In `server/evaluation/prompt.ts`, implement:

```ts
const evidenceText = (chunk: SourceChunk) => [
  '[RAG EVIDENCE]',
  `source_id: ${chunk.sourceId}`,
  `chunk_id: ${chunk.chunkId}`,
  `chunk_index: ${chunk.index}`,
  `block_ids: ${JSON.stringify(chunk.blockIds)}`,
  '',
  chunk.text,
].join('\n');

export const buildEvaluationInput = (
  systemPrompt: string,
  question: EvaluationQuestion,
  chunks: SourceChunk[],
  arm: EvaluationExperimentArm,
): { system: string; user: string } => {
  const expectsEvidence = arm === 'persona_rag' && question.kpi === 'past_memory_restoration';
  if (expectsEvidence && chunks.length !== 1) throw new Error(`${question.id} requires exactly one RAG evidence chunk`);
  if (!expectsEvidence && chunks.length !== 0) throw new Error(`${arm} must not receive RAG evidence for ${question.id}`);
  const task = question.type === 'multiple_choice'
    ? `${question.options!.map((option, index) => `${index + 1}. ${option}`).join('\n')}\n\nJSON만 출력하세요: {"choice":1,"reason":"1~2문장 이유"}`
    : 'CFO 자문가의 1인칭으로 5~8문장 안에서 결정, 조건, 상충관계와 위험을 직접 설명하세요.';
  return {
    system: systemPrompt,
    user: [expectsEvidence ? evidenceText(chunks[0]) : '', '[QUESTION]', question.prompt, '', task]
      .filter(Boolean)
      .join('\n\n'),
  };
};
```

- [ ] **Step 6: Update runner call sites and fake model fixtures**

Temporarily default every existing runner call to `run.experimentArm ?? 'persona_rag'`. Change fake model handlers in tests from `(prompt: string)` to `(input: ModelInput)` and derive searchable text with:

```ts
const inputText = (input: ModelInput) =>
  typeof input === 'string' ? input : `${input.system}\n${input.user}`;
```

- [ ] **Step 7: Run focused tests and commit**

```bash
npx tsx --test tests/amyHoodEvaluation.test.ts tests/amyHoodPersonaPipeline.test.ts
npm run evaluation:test
git add shared/amyHoodEvaluation.ts server/personaPipeline/modelClient.ts server/evaluation/prompt.ts server/evaluation/retriever.ts server/evaluation/runner.ts tests/amyHoodEvaluation.test.ts tests/amyHoodPersonaPipeline.test.ts
git commit -m "feat: separate evaluation system and evidence messages"
```

Expected: all focused and evaluation tests pass; string-based persona analysis remains compatible.

---

### Task 3: Add Arm-Specific Prompts and Sequential Experiment Runs

**Files:**
- Create: `agent_prompts/prompts/generic-cfo-control.md`
- Modify: `shared/amyHoodEvaluation.ts`
- Modify: `server/evaluation/runner.ts`
- Modify: `tests/amyHoodEvaluation.test.ts`

**Interfaces:**
- Consumes: `EvaluationExperimentArm` and the optional `EvaluationRun` experiment fields from Task 2.
- Produces: `EvaluationExperimentLaunch`.
- Produces runner methods `createEvaluationExperiment({ provider })` and `executeEvaluationExperiment(runIds)`.

- [ ] **Step 1: Write failing runner tests**

Add one happy test that creates an experiment and asserts:

```ts
assert.equal(launch.runs.length, 3);
assert.deepEqual(
  launch.runs.map((run) => run.experimentArm),
  ['persona_rag', 'persona_no_rag', 'generic_cfo_no_rag'],
);
assert.equal(new Set(launch.runs.map((run) => run.experimentGroupId)).size, 1);
assert.equal(new Set(launch.runs.map((run) => run.questionSetVersion)).size, 1);
assert.equal(new Set(launch.runs.map((run) => run.model)).size, 1);
```

Execute the experiment with a fake model, capture all 45 inputs, and assert only the first seven `persona_rag` inputs contain `[RAG EVIDENCE]`.

Add a failure test where the first arm returns an incomplete run and assert the second and third arms still complete. Add an assertion that `createEvaluationExperiment({ provider: 'openai' })` rejects before model creation.

Extend `createRunnerFixture` to create `agent_prompts/prompts/` under the temporary root and write the fixed string `You are a general corporate CFO advisor. Use only supplied facts.` to `generic-cfo-control.md`. This keeps generic prompt hashing inside the isolated fixture without depending on a production asset during RED.

- [ ] **Step 2: Run the runner test and verify RED**

```bash
npx tsx --test tests/amyHoodEvaluation.test.ts
```

Expected: FAIL because experiment types and methods do not exist.

- [ ] **Step 3: Add the shared experiment launch type**

In `shared/amyHoodEvaluation.ts` add:

```ts
export type EvaluationExperimentLaunch = {
  experimentGroupId: string;
  runs: EvaluationRun[];
};
```

- [ ] **Step 4: Create the fixed generic CFO control prompt**

Create `agent_prompts/prompts/generic-cfo-control.md` with this exact content:

```markdown
You are a general corporate CFO advisor. Do not simulate Amy Hood or any named executive.

Use only facts supplied in the user message. Compare the financial and strategic benefits, costs, risks, and timing of the available choices. State a clear recommendation and identify the condition or observable metric that would change it. Do not use remembered Microsoft history, private information, or assumed outcomes.

Answer in Korean. For multiple-choice tasks, follow the requested JSON format exactly. For subjective tasks, respond directly and concisely without citations or hidden chain-of-thought.
```

- [ ] **Step 5: Implement prompt pinning and experiment creation**

In `server/evaluation/runner.ts`:

1. Keep public `createEvaluationRun` input as `{ provider }`; use the internal `persistQueuedRun` input for experiment fields.
2. Default a missing internal arm to `persona_rag` without writing experiment fields for ordinary legacy-compatible single runs.
3. For `generic_cfo_no_rag`, read `agent_prompts/prompts/generic-cfo-control.md`, compute SHA-256, omit `promptVersionId`, and store the control hash in `promptHash`.
4. For both persona arms, pin the same active immutable prompt ID and hash.
5. Keep the corpus snapshot ID in all arms even when RAG is disabled so experiment provenance remains comparable.

Extract one internal context loader so the experiment does not read the active prompt or question files three separate times:

Add `createHash` to the existing `node:crypto` import, add `resolve` from `node:path`, and import the `EvaluationBundle`, `EvaluationCorpus`, and experiment types used below.

```ts
type EvaluationRunContext = {
  bundle: EvaluationBundle;
  corpus: EvaluationCorpus;
  model: ModelClient;
  activePrompt: Awaited<ReturnType<typeof readActivePromptVersion>>;
  genericPrompt: { content: string; sha256: string };
};

const prepareRunContext = async (provider: EvaluationProvider): Promise<EvaluationRunContext> => {
  const [bundle, review, corpus, activePrompt, genericContent] = await Promise.all([
    loadEvaluationBundle(options.root),
    loadQuestionReview(options.root),
    loadSafeEvaluationCorpus(options.root),
    readActivePromptVersion(options.root),
    readFile(resolve(options.root, 'agent_prompts/prompts/generic-cfo-control.md'), 'utf8'),
  ]);
  if (review.reviews.some((item) => item.status !== 'approved')) {
    throw new Error('all evaluation questions must be approved before creating a run');
  }
  const model = options.createModel(provider);
  return {
    bundle,
    corpus,
    model,
    activePrompt,
    genericPrompt: {
      content: genericContent,
      sha256: createHash('sha256').update(genericContent).digest('hex'),
    },
  };
};
```

Implement `persistQueuedRun(context, { provider, experimentArm?, experimentGroupId? })` as the only constructor of run JSON:

```ts
type PersistRunInput = {
  provider: EvaluationProvider;
  experimentArm?: EvaluationExperimentArm;
  experimentGroupId?: string;
};

const persistQueuedRun = async (
  context: EvaluationRunContext,
  input: PersistRunInput,
) => {
  const arm = input.experimentArm ?? 'persona_rag';
  const generic = arm === 'generic_cfo_no_rag';
  const run: EvaluationRun = {
    runId: randomUUID(),
    status: 'queued',
    gradingStatus: 'pending',
    provider: input.provider,
    model: context.model.model,
    ...(generic ? {} : { promptVersionId: context.activePrompt.versionId }),
    promptHash: generic ? context.genericPrompt.sha256 : context.activePrompt.sha256,
    ragSnapshotId: context.corpus.snapshotId,
    questionSetVersion: context.bundle.questions.version,
    ...(input.experimentArm ? { experimentArm: input.experimentArm } : {}),
    ...(input.experimentGroupId ? { experimentGroupId: input.experimentGroupId } : {}),
    answers: [],
    scores: { pastMemory: 0, githubHoldout: 0, subjective: null },
    startedAt: new Date().toISOString(),
    completedAt: null,
  };
  return writeRun(options.root, run);
};

const createEvaluationRun = async (input: { provider: EvaluationProvider }) =>
  persistQueuedRun(await prepareRunContext(input.provider), input);
```

Add an arm-aware prompt reader and use it in `executeEvaluationRun`:

```ts
const readRunSystemPrompt = async (root: string, run: EvaluationRun) => {
  if (run.experimentArm === 'generic_cfo_no_rag') {
    const content = await readFile(resolve(root, 'agent_prompts/prompts/generic-cfo-control.md'), 'utf8');
    const sha256 = createHash('sha256').update(content).digest('hex');
    if (sha256 !== run.promptHash) throw new Error('generic CFO prompt hash is stale');
    return content;
  }
  if (!run.promptVersionId) return readFile(personaPromptPath(root, run.provider), 'utf8');
  const version = await readPromptVersion(root, run.promptVersionId);
  if (version.sha256 !== run.promptHash) throw new Error('run prompt version hash is stale');
  return version.content;
};
```

Ordinary `createEvaluationRun` prepares one context and persists one run. `createEvaluationExperiment` prepares one context and passes it to all three `persistQueuedRun` calls, guaranteeing identical prompt version, question version, RAG snapshot, and model settings. In the question loop, call `retrieveEvaluationEvidence(corpus, question, run.experimentArm ?? 'persona_rag')`, then `buildEvaluationInput(systemPrompt, question, chunks, run.experimentArm ?? 'persona_rag')`.

Implement:

```ts
const experimentArms: EvaluationExperimentArm[] = [
  'persona_rag',
  'persona_no_rag',
  'generic_cfo_no_rag',
];

const createEvaluationExperiment = async (
  input: { provider: EvaluationProvider },
): Promise<EvaluationExperimentLaunch> => {
  if (input.provider !== 'local') throw new Error('three-arm experiments require the local provider');
  const experimentGroupId = randomUUID();
  const context = await prepareRunContext('local');
  const runs: EvaluationRun[] = [];
  for (const experimentArm of experimentArms) {
    runs.push(await persistQueuedRun(context, { provider: 'local', experimentArm, experimentGroupId }));
  }
  return { experimentGroupId, runs };
};

const executeEvaluationExperiment = async (runIds: string[]) => {
  const completed: EvaluationRun[] = [];
  for (const runId of runIds) {
    try {
      completed.push(await executeEvaluationRun(runId));
    } catch (error) {
      const current = await readRun(options.root, runId);
      completed.push(await writeRun(options.root, { ...current, status: 'incomplete' }));
    }
  }
  return completed;
};
```

Before execution, validate that run IDs resolve to one group containing each arm exactly once. Reject duplicates or unknown arms before the first model invocation.

- [ ] **Step 6: Run tests and commit**

```bash
npx tsx --test tests/amyHoodEvaluation.test.ts
npm run evaluation:test
git add agent_prompts/prompts/generic-cfo-control.md shared/amyHoodEvaluation.ts server/evaluation/runner.ts tests/amyHoodEvaluation.test.ts
git commit -m "feat: add three-arm persona ablation runner"
```

---

### Task 4: Expose the Experiment API and Client

**Files:**
- Modify: `server/evaluation/routes.ts`
- Modify: `src/services/evaluationApi.ts`
- Modify: `tests/amyHoodEvaluation.test.ts`
- Modify: `tests/amyHoodEvaluationUi.test.ts`

**Interfaces:**
- Produces: `POST /api/evaluation/experiments`.
- Produces: `createEvaluationExperiment(fetchImpl?)` client function.

- [ ] **Step 1: Write failing route and client tests**

Extend the router fixture with:

```ts
createEvaluationExperiment(input: { provider: EvaluationProvider }): Promise<EvaluationExperimentLaunch>;
executeEvaluationExperiment(runIds: string[]): Promise<EvaluationRun[]>;
```

Assert a local POST returns `202`, one group ID, and three run IDs, then yields to the event loop and confirms sequential execution started. Assert an OpenAI POST returns `400` and never calls either experiment method.

In `tests/amyHoodEvaluationUi.test.ts`, update the Test Plan to exactly these three edge cases:

```text
- experiment 필드 없는 legacy 실행을 일반 단일 실행으로 표시한다.
- 진행 중인 세 실행의 부분 점수를 유지한다.
- 한국어 검토 메모와 외부 채점 합계를 원형 보존한다.
```

Add a fetch fixture asserting `createEvaluationExperiment()` posts `{ "provider": "local" }` to `/api/evaluation/experiments`.

- [ ] **Step 2: Run tests and verify RED**

```bash
npx tsx --test tests/amyHoodEvaluation.test.ts tests/amyHoodEvaluationUi.test.ts
```

Expected: FAIL because the route and client function do not exist.

- [ ] **Step 3: Add the route**

In `server/evaluation/routes.ts` add:

```ts
router.post(
  '/experiments',
  asyncHandler(async (request, response) => {
    if (request.body?.provider !== 'local') {
      throw new Error('three-arm experiments require the local provider');
    }
    const launch = await dependencies.runner.createEvaluationExperiment({ provider: 'local' });
    response.status(202).json({ ok: true, ...launch });
    void dependencies.runner
      .executeEvaluationExperiment(launch.runs.map((run) => run.runId))
      .catch((error) => console.error('evaluation experiment failed', error));
  }),
);
```

Keep the ordinary `/runs` endpoint unchanged.

- [ ] **Step 4: Add the browser API client**

In `src/services/evaluationApi.ts` implement:

```ts
export const createEvaluationExperiment = (fetchImpl: typeof fetch = fetch) =>
  request<{ ok: true } & EvaluationExperimentLaunch>(
    '/api/evaluation/experiments',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'local' }),
    },
    fetchImpl,
  );
```

- [ ] **Step 5: Run tests and commit**

```bash
npx tsx --test tests/amyHoodEvaluation.test.ts tests/amyHoodEvaluationUi.test.ts
npm run evaluation:test
git add server/evaluation/routes.ts src/services/evaluationApi.ts tests/amyHoodEvaluation.test.ts tests/amyHoodEvaluationUi.test.ts
git commit -m "feat: expose local evaluation experiments"
```

---

### Task 5: Display Three-Arm Groups and Lift in the Existing UI

**Files:**
- Create: `src/components/evaluation/ExperimentGroupReport.tsx`
- Modify: `src/components/evaluation/evaluationViewModel.ts`
- Modify: `src/components/evaluation/evaluationReportViewModel.ts`
- Modify: `src/components/evaluation/EvaluationRunForm.tsx`
- Modify: `src/components/EvaluationView.tsx`
- Modify: `src/components/EvaluationReportView.tsx`
- Modify: `src/components/evaluation/EvaluationRunHistory.tsx`
- Modify: `tests/amyHoodEvaluationUi.test.ts`
- Modify: `tests/evaluationReport.test.ts`

**Interfaces:**
- Produces: `experimentArmLabel(arm)` and `buildExperimentGroups(runs)`.
- Produces: `ExperimentGroupReport` React component.

- [ ] **Step 1: Write failing grouped-view-model tests**

Create three run fixtures sharing `experimentGroupId: 'group-1'` and arms in shuffled order. Assert:

```ts
const [group] = buildExperimentGroups(runs);
assert.deepEqual(group.runs.map((item) => item.arm), [
  'persona_rag',
  'persona_no_rag',
  'generic_cfo_no_rag',
]);
assert.equal(group.ragLift, group.byArm.persona_rag.scores.pastMemory - group.byArm.persona_no_rag.scores.pastMemory);
assert.equal(group.personaLift, group.byArm.persona_no_rag.scores.githubHoldout - group.byArm.generic_cfo_no_rag.scores.githubHoldout);
```

Use exactly three edge cases across the updated UI test file as specified in Task 4. The failure case must assert duplicate arms in one group throw `duplicate experiment arm` and missing arms keep lift `null` rather than inventing zero.

In `tests/evaluationReport.test.ts`, assert an experiment run shows `Amy Hood + RAG`, while a run without arm fields preserves the existing prompt-version label.

- [ ] **Step 2: Run UI tests and verify RED**

```bash
npx tsx --test tests/amyHoodEvaluationUi.test.ts tests/evaluationReport.test.ts
```

Expected: FAIL because grouped view-model functions and labels do not exist.

- [ ] **Step 3: Implement the group view model**

In `src/components/evaluation/evaluationViewModel.ts` add:

```ts
export const experimentArmLabel = (arm?: EvaluationExperimentArm) => {
  if (!arm) return '일반 평가';
  return {
    persona_rag: 'Amy Hood + RAG',
    persona_no_rag: 'Amy Hood / RAG 없음',
    generic_cfo_no_rag: '일반 CFO / RAG 없음',
  }[arm];
};

export const buildExperimentGroups = (runs: EvaluationRun[]) => {
  const order: EvaluationExperimentArm[] = ['persona_rag', 'persona_no_rag', 'generic_cfo_no_rag'];
  const grouped = new Map<string, EvaluationRun[]>();
  for (const run of runs) {
    if (!run.experimentGroupId || !run.experimentArm) continue;
    grouped.set(run.experimentGroupId, [...(grouped.get(run.experimentGroupId) ?? []), run]);
  }
  return [...grouped.entries()].map(([experimentGroupId, members]) => {
    const byArm: Partial<Record<EvaluationExperimentArm, EvaluationRun>> = {};
    for (const run of members) {
      if (byArm[run.experimentArm!]) throw new Error(`duplicate experiment arm: ${run.experimentArm}`);
      byArm[run.experimentArm!] = run;
    }
    const personaRag = byArm.persona_rag;
    const personaNoRag = byArm.persona_no_rag;
    const generic = byArm.generic_cfo_no_rag;
    const objectiveReady = (left?: EvaluationRun, right?: EvaluationRun) =>
      left?.status === 'complete' && right?.status === 'complete';
    return {
      experimentGroupId,
      runs: order.flatMap((arm) => byArm[arm] ? [{ arm, run: byArm[arm]! }] : []),
      byArm,
      ragLift: objectiveReady(personaRag, personaNoRag)
        ? personaRag!.scores.pastMemory - personaNoRag!.scores.pastMemory
        : null,
      personaLift: objectiveReady(personaNoRag, generic)
        ? personaNoRag!.scores.githubHoldout - generic!.scores.githubHoldout
        : null,
    };
  });
};
```

In `evaluationReportViewModel.ts`, add `experimentLabel` to `SingleRunReportModel` and use `experimentArmLabel(run.experimentArm)` only when an arm is present.

- [ ] **Step 4: Implement the experiment report component**

Create `ExperimentGroupReport.tsx` that accepts `{ runs: EvaluationRun[] }`, calls `buildExperimentGroups`, and renders:

- group ID and three copyable run IDs;
- fixed arm labels;
- status, past-memory `/7`, holdout `/5`, subjective `/24` or `채점 대기`;
- `RAG lift` and `Persona lift`, using `계산 대기` when null.

Use existing Tailwind card conventions and `CopyRunIdButton`; do not add charts or dependencies.

- [ ] **Step 5: Add launch and polling to the execution screen**

Add `onStartExperiment(): Promise<void>` to `EvaluationRunForm` and render a second button labeled `3조건 실험 실행`. Disable it under the existing busy/running rule and make the label explicit that it always uses local Gemma 4.

In `EvaluationView.tsx`:

```ts
const startExperiment = async () => {
  setBusy(true);
  setError(null);
  try {
    const launch = await createEvaluationExperiment();
    setRuns((current) => [...launch.runs, ...current]);
    setActive(launch.runs[0] ?? null);
  } catch (caught) {
    setError(caught instanceof Error ? caught.message : '3조건 실험을 시작하지 못했습니다.');
  } finally {
    setBusy(false);
  }
};
```

While any run in the newest experiment group is `queued` or `running`, poll `listEvaluationRuns()` every two seconds. Stop after all three are `complete` or `incomplete`. Render `ExperimentGroupReport` above run history.

- [ ] **Step 6: Add experiment mode to the report screen**

Extend `ReportMode` to `'single' | 'comparison' | 'experiment'`, add a `3조건 실험` tab, and render `ExperimentGroupReport` with all loaded runs. Keep single and pairwise report behavior unchanged.

Show arm labels in run history and select options so three identical `local-model` rows remain distinguishable.

- [ ] **Step 7: Run UI, type, and build verification and commit**

```bash
npx tsx --test tests/amyHoodEvaluationUi.test.ts tests/evaluationReport.test.ts
npm run evaluation:test
npm run lint
npm run build
git add src/components/evaluation/ExperimentGroupReport.tsx src/components/evaluation/evaluationViewModel.ts src/components/evaluation/evaluationReportViewModel.ts src/components/evaluation/EvaluationRunForm.tsx src/components/EvaluationView.tsx src/components/EvaluationReportView.tsx src/components/evaluation/EvaluationRunHistory.tsx tests/amyHoodEvaluationUi.test.ts tests/evaluationReport.test.ts
git commit -m "feat: compare three-arm evaluation experiments"
```

Expected: tests, TypeScript, and Vite build pass. The existing large-bundle warning is acceptable; new TypeScript or runtime errors are not.

---

### Task 6: Full Verification and Real Gemma 4 Experiment

**Files:**
- Runtime output only: `evaluation/runs/{runId}.json`
- No source files should change during execution.

**Interfaces:**
- Consumes: `POST /api/evaluation/experiments` and `POST /api/evaluation/runs/:id/subjective-grades`.
- Produces: three completed and graded run JSON files sharing one experiment group ID.

- [ ] **Step 1: Run fresh full repository verification**

```bash
npm run inventory:test
npm run persona:test
npm run evaluation:test
npm run lint
npm run build
git diff --check
```

Expected: inventory 7/7, persona tests all pass, evaluation tests all pass, TypeScript and Vite build succeed, and `git diff --check` is empty.

- [ ] **Step 2: Verify the local Gemma runtime and API process**

```bash
lsof -nP -iTCP:8080 -sTCP:LISTEN
ps -p "$(lsof -tiTCP:8080 -sTCP:LISTEN)" -o command=
lsof -nP -iTCP:4000 -sTCP:LISTEN
```

Expected: llama-server uses `gemma4-v2-Q8_0.gguf`, context size 16384, and the API server is listening on 4000. Restart `npm run api` only if the current process does not contain the branch changes.

- [ ] **Step 3: Launch the three-arm experiment**

```bash
curl --fail-with-body --silent --show-error \
  -X POST http://127.0.0.1:4000/api/evaluation/experiments \
  -H 'Content-Type: application/json' \
  --data '{"provider":"local"}' | tee /tmp/amy-hood-experiment-launch.json | jq .
```

Expected: HTTP 202 payload with one `experimentGroupId` and three run objects in the fixed arm order.

- [ ] **Step 4: Poll without starting duplicate experiments**

Read run IDs from `/tmp/amy-hood-experiment-launch.json`. Poll `GET /api/evaluation/runs` at intervals no shorter than five seconds until every matching run is `complete` or `incomplete`. Do not issue a second POST if one arm is slow.

If one arm is `incomplete`, inspect its saved error and use the existing `/runs/:id/resume` endpoint only for that run.

- [ ] **Step 5: Prepare and score blinded subjective answers**

Extract only `questionId` and `text` for S1-S3 from the three run files into a temporary packet. Label responses `A`, `B`, and `C` without provider, model, arm, prompt hash, objective score, or expected ranking. Apply the same four 0-2 dimensions to all nine answers.

For each run, POST exactly three grades with fields:

```json
{
  "questionId": "S1",
  "decision": 0,
  "reasoning": 0,
  "tradeoff": 0,
  "personaConsistency": 0,
  "score": 0,
  "summary": "실제 답변 논리에 근거한 한두 문장 평가"
}
```

Replace every zero and summary with the actual blind assessment; ensure `score` equals the four dimensions before POSTing to `/api/evaluation/runs/:id/subjective-grades`.

- [ ] **Step 6: Verify persisted experiment results and interpret lifts**

For the three run files, verify:

```bash
jq -r '.runs[].runId' /tmp/amy-hood-experiment-launch.json | while read -r run_id; do
  jq '{runId,experimentGroupId,experimentArm,status,gradingStatus,scores,promptHash,ragSnapshotId,questionSetVersion}' "evaluation/runs/${run_id}.json"
done
```

Confirm one shared group ID, question version 2.0.0, identical model and RAG snapshot, complete grading, and expected arm-specific prompt hashes.

Report:

- each arm's `/7`, `/5`, and `/24` scores;
- RAG lift and Persona lift;
- which wrong choices attracted each control arm;
- whether generic CFO performance remains too high;
- whether another question revision is warranted.

- [ ] **Step 7: Final source-tree verification and handoff**

```bash
git status --short
git log --oneline --decorate -6
```

Do not commit generated run files or the user's active prompt-version data unless the user explicitly requests an artifact commit. Report source commits separately from local experimental outputs.

---

## Completion Checklist

- [ ] Version 2.0.0 data passes structural and question-quality validation.
- [ ] All twelve objective questions use plausible near-neighbor traps and balanced answer positions.
- [ ] Persona/control prompt is a real system-role message.
- [ ] Only `persona_rag` P1-P7 receives one metadata-wrapped raw chunk.
- [ ] Three local arms share one group ID and execute sequentially.
- [ ] Existing run files and ordinary single execution remain compatible.
- [ ] Existing evaluation UI displays group status, scores, run IDs, and both lifts.
- [ ] Full tests, TypeScript, build, and diff checks pass.
- [ ] Real Gemma 4 runs are completed, blindly graded, persisted, and interpreted.
