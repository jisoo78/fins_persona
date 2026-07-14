# Amy Hood Blind Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 15-question Amy Hood blind evaluation workflow with holdout-safe RAG, resumable file-backed runs, question review, and model/run comparison UI.

**Architecture:** Store questions, answer keys, reviews, and run records as versioned JSON. A focused server evaluation module validates the files, retrieves at most one selected-source chunk for past-memory questions, invokes one question per model call, scores multiple choice answers, and persists every transition atomically. Express exposes thin APIs; React uses those APIs for a separate question-review page and a rewritten evaluation execution/history page.

**Tech Stack:** TypeScript 5.8, Node.js built-in test runner through `tsx --test`, Express 4, React 19, Vite 6, Tailwind CSS, existing `ModelClient` abstraction, local Gemma 4 OpenAI-compatible endpoint, optional OpenAI `gpt-5-mini`.

## Global Constraints

- Use exactly 15 questions: 7 past-memory multiple choice, 5 GitHub holdout multiple choice, and 3 hypothetical subjective.
- Give Gemma 4 one question per call; never inject all 15 questions together.
- Retrieve at most one RAG chunk and only for `past_memory_restoration` questions.
- Never retrieve RAG for `github_holdout` or `hypothetical_scenario` questions.
- Keep FY2017 Q1 through FY2019 Q4 and all GitHub holdout evidence out of Main Master Prompt analysis and RAG retrieval.
- Score multiple choice answers only as 1 or 0; store the 1-2 sentence reason but do not score it.
- Limit subjective answers to 5-8 sentences and grade four dimensions from 0-2, for 8 points per question and 24 total.
- Hide generation provider/model from subjective grader input while retaining them in the run record.
- Keep the UI disclaimer outside persona answers; do not require source citations in model answers.
- Use Gemma 4 by default. Never fall back automatically to paid `gpt-5-mini`.
- Use atomic temporary-file-plus-rename writes for reviews and run records.
- Do not add a database, GraphRAG dependency, UI framework, or new test library.
- Follow repository `AGENTS.md`: tests first, one happy path, exactly three realistic edge cases by default, and safe failure-path coverage.

---

## File Structure

### Create

- `shared/amyHoodEvaluation.ts` — browser/server-safe evaluation types and score helpers.
- `evaluation/amy_hood_eval_questions.json` — model-visible question set without answers.
- `evaluation/amy_hood_eval_answer_key.json` — server-only answers, trap intentions, rubrics, and holdout evidence IDs.
- `evaluation/amy_hood_eval_question_reviews.json` — review state separate from question source.
- `server/evaluation/questionSet.ts` — JSON loading, validation, review updates, and holdout ID collection.
- `server/evaluation/retriever.ts` — selected-manifest validation, snapshot hashing, and one-chunk retrieval.
- `server/evaluation/prompt.ts` — per-question prompt creation and response parsing.
- `server/evaluation/runStore.ts` — atomic run persistence and list/read/update operations.
- `server/evaluation/runner.ts` — sequential execution, retry, scoring, resume, and external subjective grade application.
- `server/evaluation/routes.ts` — Express router for question review and evaluation runs.
- `src/services/evaluationApi.ts` — typed browser API calls.
- `src/components/EvaluationQuestionReviewView.tsx` — review page.
- `src/components/evaluation/EvaluationRunForm.tsx` — run configuration and launch.
- `src/components/evaluation/EvaluationRunSummary.tsx` — KPI totals and progress.
- `src/components/evaluation/EvaluationRunHistory.tsx` — history selection and two-run comparison.
- `src/components/evaluation/evaluationViewModel.ts` — pure filtering and comparison helpers.
- `tests/amyHoodEvaluation.test.ts` — server/domain TDD suite.
- `tests/amyHoodEvaluationUi.test.ts` — browser API/view-model TDD suite without DOM dependencies.

### Modify

- `server/index.ts` — mount the evaluation router and allow `PATCH` in CORS.
- `server/runAmyHoodPersonaPipeline.ts` — point `evaluate` CLI command to the new runner.
- `server/personaPipeline/evaluator.ts` — remove the legacy all-subjective evaluator after callers migrate.
- `src/types.ts` — add the `evaluation-review` tab.
- `src/App.tsx` — restore/persist the new tab and render the review page.
- `src/components/Sidebar.tsx` — add `평가 문항 검토` while keeping `평가 비교`.
- `src/components/EvaluationView.tsx` — replace static included/excluded output with execution/history composition.
- `package.json` — add the evaluation test script and remove obsolete static RAG evaluation scripts.
- `tests/amyHoodPersonaPipeline.test.ts` — remove the legacy evaluator-only fixture/test and update its top Test Plan.
- `docs/b-track-amy-hood-poc/phase-6-evaluate-persona.md` — point Phase 6 at the approved blind-evaluation spec and commands.

### Delete after migration

- `server/generateGeneralRagEvaluation.ts`
- `evaluation/amy_hood_decision_eval_questions_10.json`
- `evaluation/amy_hood_decision_eval_questions_15.json`
- `evaluation/amy_hood_eval_full_2017_2019_included.lock.json`
- `evaluation/amy_hood_eval_full_vs_holdout_summary.json`
- `evaluation/amy_hood_eval_holdout_2017_2019_excluded.lock.json`
- `evaluation/general_rag_result.lock.json`
- `evaluation/keyword_rag_result.lock.json`
- `evaluation/rag_graphrag_output_contract.json`
- `evaluation/rag_graphrag_questions.json`
- `evaluation/rag_graphrag_scorecard.csv`
- `evaluation/vector_rag_bge_m3_result.lock.json`
- `evaluation/vector_rag_bge_m3_train_holdout_2017_2019.lock.json`

---

### Task 1: Versioned Questions, Answer Keys, Reviews, and Validation

**Files:**
- Create: `shared/amyHoodEvaluation.ts`
- Create: `evaluation/amy_hood_eval_questions.json`
- Create: `evaluation/amy_hood_eval_answer_key.json`
- Create: `evaluation/amy_hood_eval_question_reviews.json`
- Create: `server/evaluation/questionSet.ts`
- Create: `tests/amyHoodEvaluation.test.ts`

**Interfaces:**
- Consumes: `data/b-track/amy-hood/source-inventory.json` only for known `selected` and `holdout` IDs.
- Produces: `loadEvaluationBundle(root): Promise<EvaluationBundle>`, `loadQuestionReview(root): Promise<QuestionReviewFile>`, `saveQuestionReview(root, questionId, input): Promise<QuestionReviewFile>`, and shared types used by every later task.

- [ ] **Step 1: Write the domain test file with the required Test Plan and failing bundle tests**

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - 승인된 7/5/3 질문·정답 파일을 읽고 동일 버전의 평가 번들을 만든다.
 *
 * 2. Edge Cases:
 *    - 객관식 이유가 설명 문장과 함께 와도 선택 번호와 이유를 보존한다.
 *    - 중단된 실행을 재개하면 완료 문항은 건너뛴다.
 *    - 빈 승인 메모와 한국어 수정 메모를 각각 원형 보존한다.
 *
 * 3. Failure Path:
 *    - 홀드아웃 오염, 질문/정답 ID 불일치, 모델 실패와 원자적 저장 실패는 완료 상태나 부분 덮어쓰기를 만들지 않는다.
 */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { loadEvaluationBundle, saveQuestionReview } from '../server/evaluation/questionSet';

test('happy: loads one versioned 7/5/3 evaluation bundle without exposing answers', async () => {
  const bundle = await loadEvaluationBundle(process.cwd());
  assert.equal(bundle.questions.version, '1.0.0');
  assert.equal(bundle.questions.questions.filter((q) => q.kpi === 'past_memory_restoration').length, 7);
  assert.equal(bundle.questions.questions.filter((q) => q.kpi === 'github_holdout').length, 5);
  assert.equal(bundle.questions.questions.filter((q) => q.kpi === 'hypothetical_scenario').length, 3);
  assert.equal(bundle.questions.questions.some((q) => 'correctChoice' in q), false);
  assert.deepEqual(
    bundle.questions.questions.map((q) => q.id),
    bundle.answerKey.answers.map((a) => a.questionId),
  );
});

test('edge: approved review accepts an empty note', async () => {
  const root = await createEvaluationFixture();
  const saved = await saveQuestionReview(root, 'P1', { status: 'approved', revisionNote: '' });
  assert.equal(saved.reviews.find((item) => item.questionId === 'P1')?.revisionNote, '');
});

test('edge: revision-required review preserves a Korean instruction', async () => {
  const root = await createEvaluationFixture();
  const note = '2번 선택지를 더 현실적인 단기 매출 방어 논리로 수정해줘.';
  const saved = await saveQuestionReview(root, 'H1', { status: 'revision_required', revisionNote: note });
  assert.equal(saved.reviews.find((item) => item.questionId === 'H1')?.revisionNote, note);
});

test('failure: question and answer IDs must match exactly', async () => {
  const root = await createEvaluationFixture({ omitAnswerId: 'H5' });
  await assert.rejects(loadEvaluationBundle(root), /question and answer IDs must match/);
});
```

Add `createEvaluationFixture()` in the same file. It must copy the three evaluation JSON files into a temporary root and optionally remove one answer-key entry; do not mock validation by returning in-memory objects.

- [ ] **Step 2: Run the new tests to verify they fail**

Run:

```bash
npx tsx --test tests/amyHoodEvaluation.test.ts
```

Expected: FAIL because `shared/amyHoodEvaluation.ts` and `server/evaluation/questionSet.ts` do not exist.

- [ ] **Step 3: Create the shared contracts**

```ts
export type EvaluationKpi =
  | 'past_memory_restoration'
  | 'github_holdout'
  | 'hypothetical_scenario';

export type EvaluationQuestion = {
  id: string;
  kpi: EvaluationKpi;
  type: 'multiple_choice' | 'subjective';
  prompt: string;
  options?: [string, string, string, string];
  retrievalQuery?: string;
};

export type SubjectiveRubric = {
  decision: string;
  reasoning: string;
  tradeoff: string;
  personaConsistency: string;
};

export type EvaluationAnswerKey = {
  questionId: string;
  correctChoice?: 1 | 2 | 3 | 4;
  correctIntent?: string;
  trapIntents?: Record<'1' | '2' | '3' | '4', string>;
  rubric?: SubjectiveRubric;
  evidenceRefs: string[];
};

export type EvaluationQuestionFile = {
  dataset: 'amy_hood_blind_evaluation';
  version: string;
  subject: 'Amy Hood';
  questions: EvaluationQuestion[];
};

export type EvaluationAnswerKeyFile = {
  dataset: 'amy_hood_blind_evaluation_answer_key';
  version: string;
  answers: EvaluationAnswerKey[];
};

export type QuestionReview = {
  questionId: string;
  status: 'unreviewed' | 'approved' | 'revision_required';
  revisionNote: string;
  reviewedAt: string | null;
};

export type QuestionReviewFile = {
  questionSetVersion: string;
  reviews: QuestionReview[];
};

export type EvaluationProvider = 'local' | 'openai';

export type EvaluationBundle = {
  questions: EvaluationQuestionFile;
  answerKey: EvaluationAnswerKeyFile;
};
```

- [ ] **Step 4: Create all 15 model-visible questions**

Write `evaluation/amy_hood_eval_questions.json` with version `1.0.0` and these exact IDs and scenarios:

| ID | Type | Required prompt content | Options / expected response |
|---|---|---|---|
| P1 | MC | Office subscription transition lowers recognized upfront revenue while annuity, billings, and unearned revenue grow. | Correct option: accept timing pressure and judge recurring revenue, retention, billings, and lifetime value. Traps: defend upfront licenses; ignore margins; treat bookings as current revenue. |
| P2 | MC | Phone hardware underperforms after prior investment and requires impairment/restructuring. | Correct: recognize the loss, reset the cost base, preserve only capabilities tied to the core strategy. Traps: continue because of sunk cost; exit every device investment; hide the charge in adjusted metrics. |
| P3 | MC | LinkedIn is a large acquisition with near-term dilution and an identity/network that can be damaged by over-integration. | Correct: finance within capacity, protect member-first independent operation, track engagement and integration milestones. Traps: require immediate standalone EPS; force Dynamics exclusivity; approve without milestones. |
| P4 | MC | COVID creates cloud collaboration demand but weak transactional licensing, hardware supply, and uncertain duration. | Correct: separate observed segment effects, give bounded near-term guidance, avoid extrapolating temporary demand. Traps: withdraw all communication; annualize cloud spike; cut cloud capacity to protect margin. |
| P5 | MC | FY23 growth slows while AI opportunity rises and operating expenses must be reduced. | Correct: remove low-priority work and headcount while protecting AI, cloud, and security investments with operating-leverage targets. Traps: equal cuts; preserve all growth projects; cut future investment first. |
| P6 | MC | Activision integration adds revenue and strategic content but pressures near-term operating margin. | Correct: disclose purchase-accounting/integration effects, track content and distribution economics, demand portfolio-level return. Traps: judge only first-quarter margin; ignore integration cost; force platform exclusivity. |
| P7 | MC | AI demand exceeds capacity and CapEx/depreciation pressure gross margin. | Correct: pace capacity against contracted usage, accept bounded gross-margin pressure, require monetization and utilization checkpoints. Traps: freeze CapEx; build to forecasts without checkpoints; raise price as the only response. |
| H1 | MC | June 2018 board review: $7.5B all-stock GitHub deal, 28M developers, <1% non-GAAP EPS dilution in FY19/FY20, FY20 non-GAAP operating-income accretion, developer distrust. | Use the four complete options from section 4.2 H1 of the approved design; correct choice 3. |
| H2 | MC | Immediately after announcement, migrations to competitors rise and sales proposes Azure-only enterprise benefits for rapid monetization. | Correct: retain language/tool/cloud choice and independent operation; monetize voluntary enterprise value. Traps: Azure exclusivity; abandon deal; promise no commercial integration ever. |
| H3 | MC | FY18 Q4 buybacks were suspended before announcement; the all-stock deal creates dilution while Microsoft retains capital capacity. | Correct: keep pre-close suspension, then use an incremental measured buyback to offset issued stock without compromising strategic investment. Traps: accelerate pre-close buyback; never offset dilution; repurchase the entire consideration immediately. |
| H4 | MC | Pre-close guidance includes purchase accounting, integration and transaction expense; expected dilution is bounded and operating margin can still expand. | Correct: include full known deal effects, preserve strategic investment, communicate assumptions and bounded dilution. Traps: exclude all deal costs; cut GitHub investment to eliminate dilution; remove guidance until accretive. |
| H5 | MC | Early 2019: unlimited free private repos and a unified Enterprise offer expand reach while GitHub cost and standalone revenue visibility remain limited. | Correct: evaluate developer growth, enterprise adoption and Microsoft-wide value while maintaining company operating-margin discipline. Traps: reverse free tier; demand immediate standalone payback; ignore all financial checkpoints. |
| S1 | Subjective | AI capacity +25%, gross margin -1.5pp, 60% demand validated. Decide approve/reduce/stage, conditions and metrics. | Require a 5-8 sentence first-person answer. |
| S2 | Subjective | $12B developer AI platform, small current profit, platform-neutrality risk, mixed stock/cash, 1.5% EPS dilution for two years. | Require acquisition decision, terms, independence boundary, and financial red lines. |
| S3 | Subjective | IT slowdown and 8% operating-expense reduction across AI/cloud/security, mature marketing, duplicate management, and weak regional sales. | Require cuts, protected investments, and separation of facts from assumptions in guidance. |

For P1-P7 add these exact English `retrievalQuery` strings so the English corpus can be retrieved from Korean prompts:

```json
{
  "P1": "Office 365 subscription revenue recognition annuity billings unearned recurring predictable",
  "P2": "phone hardware impairment restructuring charge cost reduction strategic priorities",
  "P3": "LinkedIn acquisition dilution financing member first independent integration engagement",
  "P4": "COVID pandemic guidance cloud demand transactional licensing supply constraints uncertainty",
  "P5": "operating expense reduction headcount AI cloud security investment operating leverage",
  "P6": "Activision acquisition purchase accounting integration expense operating margin gaming content",
  "P7": "AI infrastructure capacity demand capital expenditures depreciation gross margin utilization"
}
```

Each MC option must be 1-2 sentences, name the financial action, and contain only one primary judgment error. Do not include `correctChoice`, `correctIntent`, rubrics, or evidence IDs in this file.

- [ ] **Step 5: Create the answer key and review file**

Write `evaluation/amy_hood_eval_answer_key.json` with matching version `1.0.0`. Use these correct choices:

```json
{
  "P1": 2,
  "P2": 3,
  "P3": 2,
  "P4": 4,
  "P5": 3,
  "P6": 2,
  "P7": 4,
  "H1": 3,
  "H2": 2,
  "H3": 4,
  "H4": 1,
  "H5": 3
}
```

The option ordering in the question file must match this map. For every MC answer, fill `correctIntent` with the correct direction from Step 4 and fill all four `trapIntents`; the correct option's trap text must be `정답: <correctIntent>`. Use these evidence refs:

```json
{
  "P1": ["earnings_fy2013_q4", "earnings_fy2015_q2"],
  "P2": ["earnings_fy2016_q4"],
  "P3": ["web_amy_hood_microsoft_linkedin_conference_call"],
  "P4": ["earnings_fy2020_q3"],
  "P5": ["earnings_fy2023_q2"],
  "P6": ["earnings_fy2024_q4"],
  "P7": ["earnings_fy2025_q2"],
  "H1": ["earnings_fy2018_q4", "github_acquisition_announcement_2018"],
  "H2": ["github_independence_commitment_2018", "contemporary_developer_reaction_2018"],
  "H3": ["earnings_fy2018_q4", "earnings_fy2019_q2"],
  "H4": ["earnings_fy2019_q1", "earnings_fy2019_q2"],
  "H5": ["earnings_fy2019_q2", "github_new_year_2019"],
  "S1": [],
  "S2": [],
  "S3": []
}
```

For S1-S3 repeat this rubric exactly:

```json
{
  "decision": "명확한 결정과 필요한 조건을 제시했는가",
  "reasoning": "시나리오에 주어진 핵심 사실을 판단에 사용했는가",
  "tradeoff": "성장, 마진, 위험과 기회비용을 함께 비교했는가",
  "personaConsistency": "장기 성장 투자와 재무 규율을 동시에 유지하는가"
}
```

Write `evaluation/amy_hood_eval_question_reviews.json` with version `1.0.0` and 15 `unreviewed` entries whose notes are empty and `reviewedAt` values are `null`.

- [ ] **Step 6: Implement strict bundle and review validation**

In `server/evaluation/questionSet.ts`, define exact paths, validate 15 unique IDs, validate the 7/5/3 split, require four options and a 1-4 answer for MC questions, forbid options/answers on subjective questions, require matching versions and ID order, and write review updates atomically.

```ts
export const loadEvaluationBundle = async (root: string): Promise<EvaluationBundle> => {
  const questions = await readJson<EvaluationQuestionFile>(questionsPath(root));
  const answerKey = await readJson<EvaluationAnswerKeyFile>(answerKeyPath(root));
  assertEvaluationBundle(questions, answerKey);
  return { questions, answerKey };
};

export const saveQuestionReview = async (
  root: string,
  questionId: string,
  input: Pick<QuestionReview, 'status' | 'revisionNote'>,
) => {
  const bundle = await loadEvaluationBundle(root);
  const review = await loadQuestionReview(root);
  if (!bundle.questions.questions.some((question) => question.id === questionId)) {
    throw new Error(`unknown evaluation question: ${questionId}`);
  }
  if (input.status === 'revision_required' && !input.revisionNote.trim()) {
    throw new Error('revision note is required');
  }
  const reviews = review.reviews.map((item) => item.questionId === questionId
    ? { ...item, ...input, revisionNote: input.revisionNote.trim(), reviewedAt: new Date().toISOString() }
    : item);
  const next = { questionSetVersion: review.questionSetVersion, reviews };
  await atomicWrite(reviewPath(root), `${JSON.stringify(next, null, 2)}\n`);
  return next;
};
```

- [ ] **Step 7: Run tests and commit**

Run:

```bash
npx tsx --test tests/amyHoodEvaluation.test.ts
npm run lint
```

Expected: new bundle/review tests PASS; TypeScript exits 0.

Commit:

```bash
git add shared/amyHoodEvaluation.ts evaluation/amy_hood_eval_questions.json evaluation/amy_hood_eval_answer_key.json evaluation/amy_hood_eval_question_reviews.json server/evaluation/questionSet.ts tests/amyHoodEvaluation.test.ts
git commit -m "feat: add Amy Hood blind evaluation set"
```

---

### Task 2: Holdout-Safe Manifest RAG, Prompt Builder, and Parsers

**Files:**
- Create: `server/evaluation/retriever.ts`
- Create: `server/evaluation/prompt.ts`
- Modify: `tests/amyHoodEvaluation.test.ts`

**Interfaces:**
- Consumes: `SourceChunk` from `server/personaPipeline/types.ts`, selected/holdout inventory IDs, `EvaluationQuestion`.
- Produces: `loadSafeEvaluationCorpus(root): Promise<EvaluationCorpus>`, `retrievePastMemoryEvidence(corpus, question): SourceChunk[]`, `buildEvaluationPrompt(persona, question, chunks): string`, `parseEvaluationResponse(question, text): ParsedEvaluationResponse`.

- [ ] **Step 1: Add failing retrieval, prompt-isolation, and parser tests**

```ts
test('happy: past-memory prompt gets one selected chunk and MC instructions', async () => {
  const corpus = await loadSafeEvaluationCorpus(process.cwd());
  const question = (await loadEvaluationBundle(process.cwd())).questions.questions.find((q) => q.id === 'P7')!;
  const chunks = retrievePastMemoryEvidence(corpus, question);
  assert.equal(chunks.length, 1);
  assert.equal(corpus.selectedSourceIds.has(chunks[0].sourceId), true);
  const prompt = buildEvaluationPrompt('PERSONA', question, chunks);
  assert.match(prompt, /"choice"/);
  assert.match(prompt, /1~2문장/);
});

test('edge: fenced JSON with an explanation preserves choice and reason', () => {
  const parsed = parseEvaluationResponse(mcQuestion, '```json\n{"choice":3,"reason":"장기 가치와 희석 한도를 함께 봅니다."}\n```');
  assert.deepEqual(parsed, { choice: 3, reason: '장기 가치와 희석 한도를 함께 봅니다.' });
});

test('failure: holdout source in the manifest rejects before prompt construction', async () => {
  const root = await createEvaluationFixture({ manifestSourceId: 'earnings_fy2018_q4' });
  await assert.rejects(loadSafeEvaluationCorpus(root), /holdout source.*earnings_fy2018_q4/);
});

test('failure: holdout and scenario prompts contain no RAG evidence', async () => {
  const bundle = await loadEvaluationBundle(process.cwd());
  for (const id of ['H1', 'S1']) {
    const question = bundle.questions.questions.find((item) => item.id === id)!;
    assert.doesNotMatch(buildEvaluationPrompt('PERSONA', question, []), /\[RAG EVIDENCE\]/);
  }
});
```

- [ ] **Step 2: Run the focused tests to verify failure**

Run:

```bash
npx tsx --test --test-name-pattern='past-memory|fenced JSON|holdout source|no RAG' tests/amyHoodEvaluation.test.ts
```

Expected: FAIL because retriever and prompt modules do not exist.

- [ ] **Step 3: Implement selected-manifest validation and one-chunk retrieval**

`loadSafeEvaluationCorpus()` must read `source-inventory.json` and `chunks/manifest.json`, require every manifest source to be `selected`, reject every `holdout` ID, require all 18 selected sources to appear, and compute `snapshotId` as SHA-256 of the manifest bytes.

```ts
export type EvaluationCorpus = {
  chunks: SourceChunk[];
  selectedSourceIds: Set<string>;
  holdoutSourceIds: Set<string>;
  snapshotId: string;
};

export const retrievePastMemoryEvidence = (
  corpus: EvaluationCorpus,
  question: EvaluationQuestion,
): SourceChunk[] => {
  if (question.kpi !== 'past_memory_restoration') return [];
  const terms = tokenize(question.retrievalQuery ?? question.prompt);
  return corpus.chunks
    .map((chunk) => ({ chunk, score: scoreText(chunk.text, terms) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.chunk.chunkId.localeCompare(right.chunk.chunkId))
    .slice(0, 1)
    .map(({ chunk }) => chunk);
};
```

Use lowercase alphanumeric/Korean tokens of length 3 or more and count each distinct term at most six times. Throw `no RAG evidence found for <questionId>` instead of sending an empty past-memory prompt.

- [ ] **Step 4: Implement compact per-question prompts and strict parsers**

```ts
export const buildEvaluationPrompt = (
  persona: string,
  question: EvaluationQuestion,
  chunks: SourceChunk[],
) => {
  const evidence = question.kpi === 'past_memory_restoration'
    ? `\n\n[RAG EVIDENCE]\n${chunks.map((chunk) => chunk.text).join('\n\n')}`
    : '';
  const task = question.type === 'multiple_choice'
    ? `${question.options!.map((option, index) => `${index + 1}. ${option}`).join('\n')}\n\nJSON만 출력하세요: {"choice":1,"reason":"1~2문장 이유"}`
    : 'Amy Hood의 1인칭으로 5~8문장 안에서 결정, 조건, 상충관계와 위험을 직접 설명하세요.';
  return `[SYSTEM PERSONA]\n${persona}${evidence}\n\n[QUESTION]\n${question.prompt}\n\n${task}`;
};
```

`parseEvaluationResponse()` must strip one Markdown fence, extract the first JSON object for MC responses, require integer choice 1-4 and a non-empty reason, and return trimmed text for subjective responses. It must never infer a choice from prose.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
npx tsx --test tests/amyHoodEvaluation.test.ts
npm run lint
```

Expected: PASS with zero failures.

Commit:

```bash
git add server/evaluation/retriever.ts server/evaluation/prompt.ts tests/amyHoodEvaluation.test.ts
git commit -m "feat: add holdout-safe evaluation retrieval"
```

---

### Task 3: Atomic Run Store, Sequential Runner, Resume, and External Grades

**Files:**
- Modify: `shared/amyHoodEvaluation.ts`
- Create: `server/evaluation/runStore.ts`
- Create: `server/evaluation/runner.ts`
- Modify: `tests/amyHoodEvaluation.test.ts`

**Interfaces:**
- Consumes: `ModelClient`, `EvaluationProvider`, evaluation bundle, safe corpus, prompt/parser functions.
- Produces: `createEvaluationRun(input): Promise<EvaluationRun>`, `executeEvaluationRun(runId): Promise<EvaluationRun>`, `resumeEvaluationRun(runId): Promise<EvaluationRun>`, `applySubjectiveGrades(runId, grades): Promise<EvaluationRun>`.

- [ ] **Step 1: Add run types and failing execution tests**

Add these types to `shared/amyHoodEvaluation.ts`:

```ts
export type SubjectiveGrade = {
  questionId: string;
  decision: 0 | 1 | 2;
  reasoning: 0 | 1 | 2;
  tradeoff: 0 | 1 | 2;
  personaConsistency: 0 | 1 | 2;
  score: number;
  summary: string;
};

export type EvaluationRunAnswer = {
  questionId: string;
  status: 'complete' | 'failed';
  choice?: 1 | 2 | 3 | 4;
  reason?: string;
  text?: string;
  correct?: boolean;
  objectiveScore?: 0 | 1;
  grade?: SubjectiveGrade;
  elapsedMs: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
};

export type EvaluationRun = {
  runId: string;
  status: 'queued' | 'running' | 'incomplete' | 'complete';
  gradingStatus: 'pending' | 'complete';
  provider: EvaluationProvider;
  model: string;
  promptHash: string;
  ragSnapshotId: string;
  questionSetVersion: string;
  answers: EvaluationRunAnswer[];
  scores: { pastMemory: number; githubHoldout: number; subjective: number | null };
  startedAt: string;
  completedAt: string | null;
};
```

Add tests proving: a fake local model is called 15 times in ID order; a malformed MC response is retried once; a failed second call creates `incomplete` with the first answer preserved; resume skips that first answer; external grades must total their four dimensions and contain no provider/model fields.

- [ ] **Step 2: Run runner tests to verify failure**

Run:

```bash
npx tsx --test --test-name-pattern='run|retry|resume|grade' tests/amyHoodEvaluation.test.ts
```

Expected: FAIL because run store and runner do not exist.

- [ ] **Step 3: Implement atomic run storage**

```ts
export const runPath = (root: string, runId: string) =>
  resolve(root, 'evaluation', 'runs', `${runId}.json`);

export const writeRun = async (root: string, run: EvaluationRun) => {
  await atomicWrite(runPath(root, run.runId), `${JSON.stringify(run, null, 2)}\n`);
  return run;
};

export const listRuns = async (root: string) => {
  const directory = resolve(root, 'evaluation', 'runs');
  await mkdir(directory, { recursive: true });
  const names = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort().reverse();
  return Promise.all(names.map((name) => readRun(root, basename(name, '.json'))));
};
```

Reject path separators in `runId`. `updateRun()` must read the current file, apply a pure updater, then atomically replace it.

- [ ] **Step 4: Implement the runner**

`createEvaluationRunner()` receives dependencies so tests never call the real model:

```ts
export const createEvaluationRunner = (options: {
  root: string;
  createModel: (provider: EvaluationProvider) => ModelClient;
}) => ({
  createEvaluationRun,
  executeEvaluationRun,
  resumeEvaluationRun,
  applySubjectiveGrades,
});
```

Creation must load the prompt for the selected provider, hash it, validate the bundle and corpus, enforce the existing Gemma gate before an OpenAI run, and write `queued` before invocation. Execution must set `running`, iterate unanswered IDs, retrieve evidence only for P1-P7, invoke once, retry exactly once only for an invalid MC shape, append the answer atomically, and stop at the first dependency failure with `incomplete`.

Objective scores come only from `correctChoice`. A generated run becomes `complete` after all 15 answers exist, but `gradingStatus` remains `pending` until S1-S3 grades exist. `applySubjectiveGrades()` must reject missing/duplicate subjective IDs, dimension values outside 0-2, a `score` unequal to the four-dimension sum, and any unknown object keys such as `provider` or `model`.

- [ ] **Step 5: Run tests and commit**

Run:

```bash
npx tsx --test tests/amyHoodEvaluation.test.ts
npm run lint
```

Expected: PASS; failure tests show no corrupted or falsely complete run.

Commit:

```bash
git add shared/amyHoodEvaluation.ts server/evaluation/runStore.ts server/evaluation/runner.ts tests/amyHoodEvaluation.test.ts
git commit -m "feat: persist resumable persona evaluations"
```

---

### Task 4: Express Evaluation API and CLI Migration

**Files:**
- Create: `server/evaluation/routes.ts`
- Modify: `server/index.ts`
- Modify: `server/runAmyHoodPersonaPipeline.ts`
- Modify: `server/personaPipeline/evaluator.ts`
- Modify: `tests/amyHoodEvaluation.test.ts`

**Interfaces:**
- Consumes: question/review functions, runner, run store, `createModelClient`.
- Produces: seven HTTP operations and a CLI `evaluate` command using the same runner.

- [ ] **Step 1: Add failing router contract tests using a temporary Express server**

Start `express()` on port `0` inside the test and mount `createEvaluationRouter(dependencies)`. Verify:

```text
GET    /questions                    -> sanitized questions + answer intentions + reviews for local author UI
PATCH  /questions/:id/review         -> persisted review
GET    /runs                         -> run list
GET    /runs/:id                     -> one run
POST   /runs                         -> 202 + queued run, then background execution
POST   /runs/:id/resume              -> 202 + resumed run
POST   /runs/:id/subjective-grades   -> validated external/Codex grades
```

The review response may contain answer intentions because it is an author UI endpoint. The run-creation path must never return the answer key to the model prompt.

- [ ] **Step 2: Run the route tests to verify failure**

Run:

```bash
npx tsx --test --test-name-pattern='router' tests/amyHoodEvaluation.test.ts
```

Expected: FAIL because `createEvaluationRouter` does not exist.

- [ ] **Step 3: Implement the router with injected dependencies**

```ts
export const createEvaluationRouter = (dependencies: EvaluationRouteDependencies) => {
  const router = Router();
  router.get('/questions', asyncHandler(async (_req, res) => {
    const bundle = await dependencies.loadBundle();
    const reviews = await dependencies.loadReviews();
    res.json({ ok: true, ...bundle, reviews });
  }));
  router.patch('/questions/:id/review', asyncHandler(async (req, res) => {
    const reviews = await dependencies.saveReview(req.params.id, req.body);
    res.json({ ok: true, reviews });
  }));
  router.post('/runs', asyncHandler(async (req, res) => {
    const run = await dependencies.runner.createEvaluationRun(req.body);
    res.status(202).json({ ok: true, run });
    void dependencies.runner.executeEvaluationRun(run.runId).catch((error) =>
      console.error('evaluation run failed', error));
  }));
  return router;
};
```

Implement the remaining routes with the exact status codes above. Return `400` for validation errors, `404` for unknown IDs, and `500` without stack traces for unexpected errors.

- [ ] **Step 4: Mount routes and migrate the CLI**

In `server/index.ts`:

```ts
app.use((_, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
  next();
});

app.use('/api/evaluation', createEvaluationRouter(createEvaluationRouteDependencies(process.cwd())));
```

In `runAmyHoodPersonaPipeline.ts`, replace the legacy `evaluatePersona()` call with runner creation, `createEvaluationRun({ provider })`, and awaited `executeEvaluationRun(runId)`. Print `runId`, provider, model, status, and 15-answer count. Remove the legacy implementation from `server/personaPipeline/evaluator.ts` after no imports remain; delete the file if it becomes empty.

- [ ] **Step 5: Run tests, CLI type-check, and commit**

Run:

```bash
npx tsx --test tests/amyHoodEvaluation.test.ts
npm run lint
```

Expected: all tests PASS and TypeScript exits 0.

Commit:

```bash
git add server/evaluation/routes.ts server/index.ts server/runAmyHoodPersonaPipeline.ts server/personaPipeline/evaluator.ts tests/amyHoodEvaluation.test.ts
git commit -m "feat: expose blind evaluation API"
```

If `server/personaPipeline/evaluator.ts` was deleted, use `git add -A server/personaPipeline/evaluator.ts`.

---

### Task 5: Question Review Navigation and UI

**Files:**
- Create: `src/services/evaluationApi.ts`
- Create: `src/components/evaluation/evaluationViewModel.ts`
- Create: `src/components/EvaluationQuestionReviewView.tsx`
- Create: `tests/amyHoodEvaluationUi.test.ts`
- Modify: `src/types.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/Sidebar.tsx`

**Interfaces:**
- Consumes: `/api/evaluation/questions`, review `PATCH`, shared types.
- Produces: `fetchEvaluationQuestions()`, `saveEvaluationQuestionReview()`, `filterQuestionCards()`, and the new `evaluation-review` tab.

- [ ] **Step 1: Write the UI helper test file with its own required Test Plan**

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - 질문·정답·검토 응답을 KPI별 검토 카드와 15문항 요약으로 변환한다.
 *
 * 2. Edge Cases:
 *    - 필터가 없는 경우 15문항을 유지한다.
 *    - 승인 메모가 비어 있어도 승인 상태를 표시한다.
 *    - 한국어 수정 메모를 API 요청에서 보존한다.
 *
 * 3. Failure Path:
 *    - 비정상 HTTP 응답은 서버 메시지를 포함한 오류로 변환하고 성공 상태를 만들지 않는다.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { filterQuestionCards, summarizeQuestionReviews } from '../src/components/evaluation/evaluationViewModel';
import { saveEvaluationQuestionReview } from '../src/services/evaluationApi';

test('happy: summarizes the 7/5/3 review queue', () => {
  const summary = summarizeQuestionReviews(questionCardsFixture);
  assert.deepEqual(summary.kpis, { past_memory_restoration: 7, github_holdout: 5, hypothetical_scenario: 3 });
  assert.equal(summary.total, 15);
});

test('edge: no filters keeps every question', () => {
  assert.equal(filterQuestionCards(questionCardsFixture, { kpi: 'all', status: 'all' }).length, 15);
});

test('failure: review API propagates a safe server error', async () => {
  const fetchImpl: typeof fetch = async () => new Response(JSON.stringify({ message: 'revision note is required' }), { status: 400 });
  await assert.rejects(
    saveEvaluationQuestionReview('H1', { status: 'revision_required', revisionNote: '' }, fetchImpl),
    /revision note is required/,
  );
});
```

- [ ] **Step 2: Run UI helper tests to verify failure**

Run:

```bash
npx tsx --test tests/amyHoodEvaluationUi.test.ts
```

Expected: FAIL because the API and view-model modules do not exist.

- [ ] **Step 3: Implement typed API calls and pure view-model helpers**

```ts
const readJson = async <T>(response: Response): Promise<T> => {
  const payload = await response.json() as T & { message?: string };
  if (!response.ok) throw new Error(payload.message ?? `request failed with ${response.status}`);
  return payload;
};

export const saveEvaluationQuestionReview = (
  questionId: string,
  input: Pick<QuestionReview, 'status' | 'revisionNote'>,
  fetchImpl: typeof fetch = fetch,
) => readJson(fetchImpl(`/api/evaluation/questions/${questionId}/review`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(input),
}));
```

`summarizeQuestionReviews()` must compute total, KPI counts, and review-status counts. `filterQuestionCards()` must apply both filters without mutating input.

- [ ] **Step 4: Add navigation and the review page**

Add `'evaluation-review'` to `TabType`, `validTabs`, and `App` rendering. Add this sidebar item immediately before `평가 비교`:

```tsx
{ id: 'evaluation-review', label: '평가 문항 검토', icon: <ListChecks className="w-4 h-4" /> },
```

`EvaluationQuestionReviewView` must fetch on mount, show five summary cards, expose KPI/status filters, and render all details from the author endpoint. Each card must show question ID, KPI, prompt, four options, correct choice/intention, trap intentions or subjective rubric, `승인`, `수정 필요`, a revision textarea, and per-card save state. Disable save when `revision_required` has no trimmed note.

- [ ] **Step 5: Run tests, build, and commit**

Run:

```bash
npx tsx --test tests/amyHoodEvaluationUi.test.ts
npm run lint
npm run build
```

Expected: UI helper tests PASS; TypeScript and Vite exit 0.

Commit:

```bash
git add src/services/evaluationApi.ts src/components/evaluation/evaluationViewModel.ts src/components/EvaluationQuestionReviewView.tsx tests/amyHoodEvaluationUi.test.ts src/types.ts src/App.tsx src/components/Sidebar.tsx
git commit -m "feat: add evaluation question review UI"
```

---

### Task 6: Evaluation Execution, Progress, History, Comparison, and Grades UI

**Files:**
- Create: `src/components/evaluation/EvaluationRunForm.tsx`
- Create: `src/components/evaluation/EvaluationRunSummary.tsx`
- Create: `src/components/evaluation/EvaluationRunHistory.tsx`
- Modify: `src/components/evaluation/evaluationViewModel.ts`
- Modify: `src/services/evaluationApi.ts`
- Modify: `src/components/EvaluationView.tsx`
- Modify: `tests/amyHoodEvaluationUi.test.ts`

**Interfaces:**
- Consumes: run list/create/read/resume/grade endpoints.
- Produces: run launch, two-second active-run polling, incomplete-run resume, KPI display, two-run comparison, and external/Codex subjective grade submission.

- [ ] **Step 1: Add failing comparison and polling-state helper tests**

```ts
test('happy: compares two complete runs without hiding their model metadata from the user', () => {
  const rows = compareEvaluationRuns(gemmaRun, openAiRun);
  assert.equal(rows[0].left.model, 'gemma-4');
  assert.equal(rows[0].right.model, 'gpt-5-mini');
  assert.equal(rows.length, 15);
});

test('edge: incomplete run summary keeps generated scores but is not comparison-ready', () => {
  const summary = summarizeRun(incompleteRun);
  assert.equal(summary.comparisonReady, false);
  assert.equal(summary.completedQuestions, incompleteRun.answers.length);
});

test('failure: a subjective grade with a mismatched total is rejected before fetch', async () => {
  await assert.rejects(
    submitSubjectiveGrades('run-1', [{ ...gradeFixture, score: 8, decision: 1 }], failIfCalledFetch),
    /grade total does not match dimensions/,
  );
});
```

- [ ] **Step 2: Run UI tests to verify failure**

Run:

```bash
npx tsx --test tests/amyHoodEvaluationUi.test.ts
```

Expected: FAIL because comparison helpers and run APIs do not exist.

- [ ] **Step 3: Add run API methods and view-model helpers**

Implement:

```ts
export const listEvaluationRuns = (fetchImpl: typeof fetch = fetch) =>
  request<{ ok: true; runs: EvaluationRun[] }>('/api/evaluation/runs', {}, fetchImpl);

export const createEvaluationRun = (provider: EvaluationProvider, fetchImpl: typeof fetch = fetch) =>
  request<{ ok: true; run: EvaluationRun }>('/api/evaluation/runs', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider }),
  }, fetchImpl);

export const resumeEvaluationRun = (runId: string, fetchImpl: typeof fetch = fetch) =>
  request<{ ok: true; run: EvaluationRun }>(`/api/evaluation/runs/${runId}/resume`, { method: 'POST' }, fetchImpl);
```

Add read and subjective-grade methods. `compareEvaluationRuns()` must require two complete generated runs with the same question-set version and produce 15 rows keyed by question ID. `summarizeRun()` must return completed count, past `/7`, holdout `/5`, subjective `/24` or `null`, and comparison readiness.

- [ ] **Step 4: Replace `EvaluationView` with the composed execution/history page**

`EvaluationRunForm` exposes only `Gemma 4 (local)` and `GPT-5-mini (OpenAI)`; default to local and show that OpenAI is paid and never automatic. `EvaluationView` starts a run, polls `GET /runs/:id` every two seconds only while `queued` or `running`, stops polling on unmount or terminal state, and refreshes history.

`EvaluationRunSummary` shows provider/model, prompt hash prefix, RAG snapshot prefix, version, completed `/15`, past `/7`, holdout `/5`, subjective `/24` or `채점 대기`, elapsed time, and failed count. Show `미완료 문항부터 재개` only for `incomplete`.

`EvaluationRunHistory` allows selecting two compatible complete runs. Show question, both answers, objective correctness, subjective grades, and generation metadata. The metadata is visible to the user because blindness applies only to the grader input.

For each ungraded S1-S3 answer, provide four 0-2 number selects and a summary textarea. Submit all three together through the external/Codex grade endpoint. Do not send provider/model fields in that request.

- [ ] **Step 5: Run tests, build, and commit**

Run:

```bash
npx tsx --test tests/amyHoodEvaluationUi.test.ts
npm run lint
npm run build
```

Expected: PASS; Vite no longer imports `amy_hood_eval_full_vs_holdout_summary.json`.

Commit:

```bash
git add src/components/evaluation/EvaluationRunForm.tsx src/components/evaluation/EvaluationRunSummary.tsx src/components/evaluation/EvaluationRunHistory.tsx src/components/evaluation/evaluationViewModel.ts src/services/evaluationApi.ts src/components/EvaluationView.tsx tests/amyHoodEvaluationUi.test.ts
git commit -m "feat: add evaluation execution and history UI"
```

---

### Task 7: Remove Legacy GraphRAG Evaluation Path and Finish Documentation

**Files:**
- Delete: legacy files listed in the File Structure section.
- Modify: `package.json`
- Modify: `tests/amyHoodPersonaPipeline.test.ts`
- Modify: `docs/b-track-amy-hood-poc/phase-6-evaluate-persona.md`

**Interfaces:**
- Consumes: new `evaluation:test`, `persona:evaluate`, API and UI paths.
- Produces: one supported RAG-only blind evaluation path with no GraphRAG/static-summary dependencies.

- [ ] **Step 1: Add a failing repository-contract test**

In `tests/amyHoodEvaluation.test.ts`, add:

```ts
test('failure: supported evaluation code contains no GraphRAG contract or static summary dependency', async () => {
  const forbidden = [
    'evaluation/rag_graphrag_questions.json',
    'evaluation/rag_graphrag_output_contract.json',
    'evaluation/amy_hood_eval_full_vs_holdout_summary.json',
    'server/generateGeneralRagEvaluation.ts',
  ];
  assert.deepEqual(forbidden.filter((path) => existsSync(join(process.cwd(), path))), []);
  assert.doesNotMatch(await readFile(join(process.cwd(), 'src/components/EvaluationView.tsx'), 'utf8'), /GraphRAG|full_vs_holdout_summary/);
});
```

- [ ] **Step 2: Run the contract test to verify failure**

Run:

```bash
npx tsx --test --test-name-pattern='GraphRAG contract' tests/amyHoodEvaluation.test.ts
```

Expected: FAIL because legacy files still exist.

- [ ] **Step 3: Delete obsolete artifacts and scripts**

Delete every path under `Delete after migration`. Do not delete `server/ragService.ts`, `server/vectorRagService.ts`, `scripts/build_bge_m3_index.py`, or the new selected-manifest retriever.

In `package.json`, remove `rag:evaluate:keyword`, `rag:evaluate:vector`, and `rag:evaluate:vector:train`. Add:

```json
"evaluation:test": "tsx --test tests/amyHoodEvaluation.test.ts tests/amyHoodEvaluationUi.test.ts"
```

Remove the legacy evaluator import/test from `tests/amyHoodPersonaPipeline.test.ts` and change its top Happy Path wording from `시스템 프롬프트와 평가 답변을 생성한다` to `시스템 프롬프트를 생성한다`. Do not weaken its pipeline, holdout, context, or Gemma gate tests.

- [ ] **Step 4: Update Phase 6 documentation with exact operation commands**

Replace the old GraphRAG/evidence-linking workflow with:

```bash
# automated domain and UI-helper tests
npm run evaluation:test

# local Gemma 4 CLI evaluation
npm run persona:evaluate

# explicit paid comparison only after the Gemma gate passes
npm run persona:evaluate -- --provider openai

# UI and API
npm run api
npm run dev
```

Document that `평가 문항 검토` stores approvals/revision notes, `평가 비교` runs and compares history, MC reasons are diagnostic only, subjective grades can initially be supplied by Codex through the four-dimension contract, and GraphRAG is out of scope.

- [ ] **Step 5: Run full verification**

Run:

```bash
npm run inventory:test
npm run persona:test
npm run evaluation:test
npm run lint
npm run build
git diff --check
rg -n "GraphRAG|rag_graphrag|full_vs_holdout_summary" src server package.json docs/b-track-amy-hood-poc/phase-6-evaluate-persona.md evaluation -g '*.{ts,tsx,json,md,csv}'
```

Expected:

- inventory tests PASS.
- persona tests PASS.
- evaluation tests PASS.
- TypeScript and Vite exit 0.
- `git diff --check` prints nothing.
- final `rg` prints nothing in supported runtime, UI, Phase 6, package scripts, and evaluation artifacts.

- [ ] **Step 6: Manual API smoke test without paid OpenAI calls**

With `npm run api` running on port 4000:

```bash
curl -s http://localhost:4000/api/evaluation/questions | jq '.questions.questions | length'
curl -s http://localhost:4000/api/evaluation/runs | jq '.runs | length'
curl -s -o /dev/null -w '%{http_code}\n' -X PATCH http://localhost:4000/api/evaluation/questions/UNKNOWN/review \
  -H 'content-type: application/json' \
  -d '{"status":"approved","revisionNote":""}'
```

Expected: `15`, a non-negative run count, and HTTP `404` for the unknown question without changing the review file.

- [ ] **Step 7: Commit cleanup and documentation**

```bash
git add package.json tests/amyHoodPersonaPipeline.test.ts tests/amyHoodEvaluation.test.ts docs/b-track-amy-hood-poc/phase-6-evaluate-persona.md
git add -u server evaluation
git commit -m "chore: retire legacy GraphRAG evaluation"
```

---

## Final Acceptance Checklist

- [ ] Question source contains exactly 7 P, 5 H, and 3 S questions and no answers.
- [ ] Answer key has the same version and exact ordered IDs.
- [ ] All 15 questions are approved or explicitly marked for revision before a production comparison run.
- [ ] Selected manifest contains all 18 selected sources and zero holdout sources.
- [ ] P questions retrieve at most one manifest chunk; H/S questions retrieve none.
- [ ] Gemma 4 receives one question per call and no answer-key fields.
- [ ] MC output is scored 1/0; reason is saved but not scored.
- [ ] Subjective grade input contains question, rubric, and answer but no generation metadata.
- [ ] Interrupted runs preserve completed answers and resume from the first missing question.
- [ ] Review and run writes are atomic.
- [ ] Review UI and evaluation/history UI are separate navigation entries.
- [ ] OpenAI is explicit-only and guarded by the existing Gemma gate.
- [ ] Supported runtime, UI, scripts, and Phase 6 docs contain no GraphRAG dependency.
- [ ] All tests, type-check, build, diff check, and API smoke checks pass.

---

## Appendix A: Exact Question Text and Options

Task 1 must transcribe this appendix verbatim into `evaluation/amy_hood_eval_questions.json`. The JSON field `prompt` contains each quoted question. MC `options` preserve the displayed order.

### P1 — Office Subscription Transition

> Microsoft가 Office 영구 라이선스 고객을 Office 365 구독으로 전환하고 있다. 기존 라이선스는 판매 시점에 매출 대부분을 인식했지만 구독 매출은 계약기간에 걸쳐 나뉘어 인식되므로, 전환 초기에는 보고 매출이 약해 보일 수 있다. 반면 구독 좌석, annuity mix, billings와 unearned revenue는 성장하고 있다. CFO로서 이 전환의 성과를 어떻게 판단하겠는가?

1. 분기 보고 매출과 EPS가 낮아지는 동안에는 구독 전환을 늦추고 선불 영구 라이선스 판매를 우선한다.
2. 단기 매출 인식의 희석을 감수하되 구독 좌석, 유지율, billings, unearned revenue와 고객 생애가치가 함께 개선되는지 확인한다.
3. 전략적으로 중요한 전환이므로 gross margin과 고객 유지율은 보지 않고 구독 매출 성장률만으로 성공을 판단한다.
4. 계약된 billings와 unearned revenue를 모두 현재 분기 매출과 동일하게 간주해 전환에 따른 실적 차이를 제거한다.

### P2 — Phone Impairment and Restructuring

> Microsoft의 휴대폰 하드웨어 사업이 인수 당시 기대한 시장점유율과 수익성을 달성하지 못하고 있으며, 추가 손상차손과 구조조정 비용을 인식해야 한다. 일부 기술과 인력은 Windows 생태계와 다른 제품에 활용할 수 있지만 기존 사업을 유지하려면 추가 자본이 필요하다. CFO로서 어떤 조치를 권고하겠는가?

1. 이미 큰 인수가격을 지급했으므로 손실을 회복할 때까지 기존 규모의 투자를 유지한다.
2. 하드웨어 사업이 실패했으므로 Surface를 포함한 모든 자체 디바이스 투자도 동시에 중단한다.
3. 손상차손과 구조조정 비용을 투명하게 인식하고 비용 기반을 축소하되, 핵심 전략에 재사용할 수 있는 기술과 인력만 선별해 재배치한다.
4. 구조조정은 진행하되 투자자 혼란을 막기 위해 손상차손과 현금비용을 모두 비GAAP 지표에서만 설명한다.

### P3 — LinkedIn Acquisition

> Microsoft가 LinkedIn을 대규모 거래로 인수하려 한다. LinkedIn의 회원 네트워크와 참여도가 핵심 가치지만 인수 직후에는 EPS 희석, 이자비용과 통합비용이 발생할 수 있다. Dynamics와 Office의 시너지도 예상되지만 과도한 통합은 LinkedIn 회원 경험을 훼손할 수 있다. CFO로서 가장 적절한 승인 조건은 무엇인가?

1. LinkedIn이 인수 첫해에 독립적으로 Microsoft EPS를 증가시키는 경우에만 거래를 승인한다.
2. Microsoft의 재무 여력 안에서 자금을 조달하고 member-first 독립 운영을 보호하며, 참여도·매출 성장·통합비용과 단계별 시너지 지표를 함께 검증한다.
3. 인수가격을 빠르게 회수하기 위해 LinkedIn의 핵심 영업상품을 Dynamics 전용으로 전환하고 타사 CRM 연동을 중단한다.
4. 전문 네트워크는 전략적으로 중요하므로 EPS 희석 한도나 통합 이정표 없이 거래를 승인한다.

### P4 — COVID-19 Guidance

> 2020년 초 코로나19로 Teams와 Azure 사용량은 급증했지만, 중소기업의 거래성 라이선스 수요와 광고·검색 매출은 약화되고 Surface 공급망에도 차질이 발생했다. 이러한 변화가 얼마나 지속될지는 알 수 없다. 다음 실적 가이던스에서 어떤 접근을 취하겠는가?

1. 불확실성이 크므로 관찰된 사업부 실적과 다음 분기 범위까지 포함해 모든 가이던스를 철회한다.
2. Teams와 Azure의 급증한 사용량을 새로운 정상 수준으로 보고 다음 회계연도 성장률에 그대로 연율화한다.
3. 공급망과 거래성 매출 약화를 상쇄하기 위해 클라우드 capacity 투자를 즉시 줄여 회사 gross margin을 방어한다.
4. 사업부별로 확인된 수요·공급 영향을 분리하고 다음 분기에 대한 범위와 가정을 공개하되, 일시적 사용량을 장기 성장으로 단정하지 않는다.

### P5 — FY23 Cost Discipline and AI Investment

> FY23에 고객의 클라우드 지출 최적화로 성장률이 둔화되고 Microsoft는 운영비와 인력을 줄여야 한다. 동시에 생성형 AI, Azure, 보안은 장기 성장 기회로 평가되며 경쟁 우위를 위해 지속적인 투자가 필요하다. CFO로서 예산을 어떻게 조정하겠는가?

1. 조직 간 형평성을 위해 모든 사업부와 연구개발 프로그램의 예산을 같은 비율로 줄인다.
2. 장기 성장 분야라는 설명이 있는 모든 프로젝트를 보호하고, 영업이익 감소는 시장 회복 때까지 허용한다.
3. 우선순위가 낮거나 중복된 업무와 인력을 먼저 줄이고 AI·Azure·보안의 핵심 투자는 보호하되, 회사 전체 운영 레버리지와 투자별 이정표를 요구한다.
4. 현재 매출 기여가 작은 AI 연구와 인프라부터 줄이고 성숙 제품의 기존 판매·마케팅 예산을 유지한다.

### P6 — Activision Blizzard Integration

> Microsoft가 Activision Blizzard 인수를 완료했다. 인수는 게임 콘텐츠와 유통 경쟁력을 확대하지만 구매회계, 통합비용과 사업 믹스 변화로 단기 영업마진을 압박할 수 있다. 초기 분기의 매출 증가만으로 장기 자본수익을 판단하기도 어렵다. CFO로서 통합 성과를 어떻게 관리하겠는가?

1. 첫 분기 Microsoft 전체 영업마진이 하락하면 전략적 가치와 관계없이 인수 실패로 판단한다.
2. 구매회계와 통합비용을 별도로 투명하게 설명하고 콘텐츠 참여도·유통 확대·현금창출과 포트폴리오 자본수익을 단계별로 검증한다.
3. 전략적 콘텐츠를 확보했으므로 통합비용과 추가 투자에는 한도를 두지 않고 매출 성장만 추적한다.
4. 시너지를 빠르게 만들기 위해 모든 주요 게임을 Microsoft 기기와 서비스에서만 제공한다.

### P7 — AI Capacity and Margin

> Azure AI 수요가 공급 가능한 capacity를 초과하고 있으며 추가 데이터센터와 가속기 투자가 필요하다. 투자를 확대하면 향후 매출 기회를 확보할 수 있지만 CapEx와 감가상각 증가로 gross margin이 하락할 수 있고, 고객의 수요 전망 중 일부는 아직 계약이나 실제 사용량으로 확인되지 않았다. CFO로서 어떤 투자 원칙을 적용하겠는가?

1. gross margin이 현재 수준으로 회복될 때까지 신규 AI capacity 투자를 동결한다.
2. AI 시장이 빠르게 성장하므로 고객 전망을 모두 확정 수요로 보고 가능한 capacity를 한 번에 구축한다.
3. 마진 압박은 가격 문제이므로 capacity 계획은 유지하고 모든 고객 가격을 동일한 비율로 인상한다.
4. 계약, 실제 사용량과 공급 제약으로 확인된 수요에 맞춰 capacity를 단계적으로 늘리고, utilization·매출 전환·감가상각과 마진 회복 이정표를 함께 관리한다.

### H1 — GitHub Acquisition Approval

> 2018년 6월, Microsoft 이사회가 GitHub 인수를 최종 검토하고 있다. 거래 가격은 Microsoft 주식 75억 달러이며, GitHub는 2,800만 명 이상의 개발자와 150만 개 이상의 조직이 사용하는 플랫폼이다. 경영진은 FY19·FY20 비GAAP EPS 희석이 1% 미만이고 FY20 비GAAP 영업이익에는 기여할 것으로 예상하지만, GitHub 자체의 단기 재무 기여는 Microsoft 전체 규모에 비해 제한적이다. 일부 개발자는 Microsoft가 GitHub를 Azure와 자사 개발도구에 종속시킬 것을 우려하고 있다. CFO로서 이사회에 어떤 권고를 하겠는가?

1. 단기 재무 기여가 인수가격을 뒷받침하지 못하므로 GitHub가 독립적으로 EPS에 기여할 때까지 거래를 보류한다.
2. 인수를 승인하되 2년 안에 GitHub Enterprise를 Azure 중심 상품으로 전환하고 빠른 교차판매로 인수가격을 회수한다.
3. 공개한 희석 범위 안에서 인수를 승인하되 GitHub의 독립성과 플랫폼 중립성을 보호한다. 개발자 유지, 기업 채택과 Microsoft 전체 생태계 기여를 단계별로 검증하고 통합비용과 희석 영향을 지속해서 공개한다.
4. 개발자 네트워크는 대체할 수 없는 자산이므로 단기 희석이나 통합비용에 별도 한도를 두지 않고 인수를 승인한다.

### H2 — Developer Backlash and Monetization

> GitHub 인수 발표 직후 일부 개발자가 Microsoft의 과거 폐쇄적 전략을 우려하며 경쟁 서비스로 저장소를 이전하고 있다. Microsoft 영업조직은 빠른 인수 시너지를 입증하기 위해 GitHub Enterprise의 고급 기능과 가격 혜택을 Azure 고객에게만 제공하자고 제안한다. CFO로서 어떤 방침을 선택하겠는가?

1. 기업 매출 시너지가 인수가격을 정당화해야 하므로 Azure 전용 혜택을 즉시 도입하고 개발자 이탈은 단기 반발로 본다.
2. 언어·도구·운영체제·클라우드 선택권과 GitHub의 독립 운영을 먼저 보호하고, 모든 고객이 자발적으로 선택할 수 있는 Enterprise 기능과 Microsoft 판매망을 통해 수익화를 확장한다.
3. 개발자 반발이 발생했으므로 규제 승인 전에 인수를 철회하고 GitHub와의 제품 제휴만 유지한다.
4. 신뢰 보호를 위해 GitHub와 Microsoft 사이의 모든 상업적 통합과 기업 공동판매를 영구적으로 금지한다.

### H3 — Buyback and Dilution

> FY18 Q4에 Microsoft는 GitHub 인수 발표를 앞두고 자사주 매입 활동을 일시 중단했다. 거래는 Microsoft 주식으로 지급되므로 기존 주주 희석이 발생하지만, 회사는 클라우드와 AI 투자를 지속할 재무 여력도 유지해야 한다. 거래 종결 전후의 자사주 매입 정책으로 무엇이 가장 적절한가?

1. 거래 발표 전 낮은 가격에 더 많은 주식을 확보하도록 자사주 매입을 평소보다 가속한다.
2. 전략적 인수에서 발생한 희석은 장기 가치로 상쇄되므로 추가 자사주 매입 계획을 세우지 않는다.
3. 희석을 즉시 제거하기 위해 거래 종결과 동시에 인수 대가 75억 달러 전액에 해당하는 주식을 한 분기에 매입한다.
4. 거래 전 매입 중단을 유지하고 종결 후 전략 투자와 현금흐름을 해치지 않는 기간에 추가 매입을 실시해 발행 주식의 희석을 계획적으로 상쇄한다.

### H4 — Guidance Before Close

> 2018년 10월 GitHub 인수 종결을 앞두고 Microsoft는 구매회계, 통합비용과 거래비용의 정확한 분기 배분을 추정해야 한다. 경영진은 FY19·FY20 비GAAP EPS 희석이 제한적이고 FY20 비GAAP 영업이익에는 기여할 것으로 보며, GitHub 투자까지 포함해도 회사 영업마진을 소폭 개선할 수 있다고 판단한다. CFO의 가이던스 방식으로 무엇이 가장 적절한가?

1. 현재 합리적으로 추정할 수 있는 구매회계·통합·거래비용을 가이던스에 포함하고, 희석 범위와 가정의 변화를 공개하면서 전략 투자를 유지한다.
2. GitHub의 장기 전략 가치를 강조하기 위해 모든 인수 관련 비용을 비경상 항목으로 제외하고 기존 가이던스만 반복한다.
3. EPS 희석을 완전히 제거할 때까지 GitHub 제품과 인력에 대한 신규 투자를 동결한다.
4. 인수가 영업이익에 기여하는 분기가 확인될 때까지 회사 전체 매출과 이익 가이던스를 제공하지 않는다.

### H5 — Early Integration Economics

> 2019년 초 GitHub는 무료 비공개 저장소의 범위를 확대하고 Enterprise 상품을 단순화했다. 이 조치는 개발자 접근성과 기업 채택을 높일 수 있지만 단기적으로 무료 사용량과 제품 투자가 늘며, Microsoft 공시에서는 GitHub의 독립 매출과 이익 기여가 충분히 분리되어 보이지 않는다. CFO로서 초기 통합 성과를 어떻게 평가하겠는가?

1. 무료 사용이 직접 매출로 전환되지 않으면 무료 비공개 저장소 확대를 다음 분기에 되돌린다.
2. 인수가격을 정당화하려면 GitHub가 즉시 독립적인 목표 수익률을 달성해야 하므로 Microsoft 생태계 기여는 평가에서 제외한다.
3. 개발자 증가, 유지, Enterprise 채택과 Microsoft 전체 개발자 도구·클라우드 기여를 함께 추적하되, 회사 전체 운영비와 영업마진 규율 안에서 투자 속도를 관리한다.
4. GitHub는 장기 플랫폼 자산이므로 사용자와 기업 채택이 늘기만 하면 비용, 수익화와 마진 지표는 평가하지 않는다.

### S1 — AI Infrastructure Investment

> Azure AI 수요가 공급을 초과하고 있다. 추가 데이터센터 투자로 향후 12개월의 공급능력을 25% 늘릴 수 있지만, 선행 CapEx와 감가상각 때문에 회사 gross margin이 약 1.5%p 하락할 전망이다. 현재 수요의 60%는 장기 계약 또는 실제 사용량으로 확인되지만 나머지는 고객의 수요 전망에 의존한다. 투자를 승인·축소·단계화할지 결정하고, 그 이유와 승인 조건, 이후 확인할 지표를 설명하라.

### S2 — Developer AI Platform Acquisition

> Microsoft가 빠르게 성장하는 개발자 AI 플랫폼을 120억 달러에 인수할 기회를 얻었다. 현재 매출과 영업이익은 인수가격에 비해 작지만 개발자 네트워크와 데이터 자산의 전략적 가치는 높다. Microsoft 제품에 빠르게 통합하면 단기 매출 시너지가 예상되지만, 플랫폼 중립성을 잃으면 개발자 이탈 가능성이 있다. 거래는 주식과 현금을 함께 사용하며 첫 2년간 EPS를 약 1.5% 희석할 전망이다. 인수 여부와 거래 조건, 독립 운영 범위, 재무적 레드라인을 제시하라.

### S3 — Selective Cost Reduction

> 기업 IT 지출 둔화로 신규 계약과 사용량 증가율이 동시에 낮아지고 있다. 경영진은 다음 회계연도 운영비를 8% 줄여야 한다. AI 인프라, 보안, 핵심 클라우드 연구개발은 장기 성장에 중요하지만 현재 비용이 빠르게 늘고 있다. 성숙 제품의 마케팅, 중복 관리조직, 저성과 지역 영업조직에도 비용이 배정되어 있다. 어떤 비용을 먼저 줄이고 어떤 투자를 보호할지 결정하라. 투자자 가이던스에서 확정된 사실과 불확실한 가정을 어떻게 구분할지도 설명하라.
