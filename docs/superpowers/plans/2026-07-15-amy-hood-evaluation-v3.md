# Amy Hood Evaluation v3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a separately versioned, all-multiple-choice 30-question Evaluation v3 with four Gemma experiment arms, one-or-five repetitions, fail-closed historical holdout isolation, objective scoring, diagnostics, and v2-compatible UI.

**Architecture:** Keep the existing v2 implementation under `server/evaluation/` unchanged and build v3 under `server/evaluationV3/` with its own types, artifacts, run store, routes, and view models. Public questions and human reviews are separated from sealed answer and holdout artifacts; only the scorer may load the answer key, while prompt, policy, memory, and RAG builders share one fail-closed leakage guard.

**Tech Stack:** TypeScript 5.8, Node.js test runner through `tsx --test`, Express 4, React 19, Vite 6, immutable JSON artifacts, local Gemma 4 through the existing `ModelClient` interface.

## Global Constraints

- Preserve Evaluation v2 data, API behavior, stored runs, reports, and regression tests.
- Evaluation v3 contains exactly 30 four-option multiple-choice questions in the fixed distribution `D10/H10/C6/T4`.
- Historical holdout events are GitHub acquisition 2018, AI datacenter investment 2025, Microsoft 365 price increase 2021, and share repurchase authorization 2021.
- GitHub must be labeled `known_prior_exposure`; it is not a pristine never-seen holdout.
- Experiment arms are exactly `generic_cfo`, `amy_prompt`, `amy_policy_rag`, and `amy_full_rag`.
- Launch repetitions are exactly `1` or `5`; the runner creates four runs per repetition in stable repetition-then-arm order.
- Objective choice is scored; the required reason is preserved for audit and deterministic choice-reason mismatch detection only.
- The generation model never receives answer keys, trap intents, holdout grading metadata, or post-outcome evidence.
- Any prohibited holdout reference fails before persistence and produces no partial artifact.
- Gemma 4 local remains the default; GPT-5-mini is not enabled for v3 until the local gate passes.
- GraphRAG, subjective grading, autonomous evaluator debate, encryption, and v2 run migration are out of scope.
- New or significantly modified tests follow the repository Test Plan comment and include one Happy Path, exactly three realistic Edge Cases by default, and safe Failure Paths.

---

### Task 1: Replace the provisional v3 blueprint with the approved all-MC contract

**Files:**
- Create: `shared/amyHoodEvaluationV3.ts`
- Modify: `shared/amyHoodDecisionAdvisor.ts:17-116`
- Modify: `evaluation/v3/amy_hood_advisor_blueprint.json`
- Modify: `server/evaluationV3/blueprint.ts`
- Modify: `server/evaluationV3/experimentPlan.ts`
- Delete: `server/evaluationV3/scoring.ts`
- Modify: `tests/amyHoodEvaluationV3.test.ts`

**Interfaces:**
- Consumes: existing `DecisionDomain` and `DatasetSplit` from `shared/amyHoodDecisionAdvisor.ts`.
- Produces: `EvaluationV3Category`, `EvaluationV3Arm`, `EvaluationV3Question`, `EvaluationV3Answer`, `EvaluationV3Review`, `EvaluationV3Run`, `EvaluationV3ExperimentLaunch`, `EVALUATION_V3_ARMS`, `assertEvaluationV3Blueprint()`, and `createEvaluationV3ExperimentPlan(repetitions)`.

- [ ] **Step 1: Rewrite the test plan and add failing all-MC and repetition tests**

Replace the obsolete subjective-slot expectation in `tests/amyHoodEvaluationV3.test.ts` with this test-plan header and focused assertions:

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - the approved D10/H10/C6/T4 all-MC blueprint and four arms validate.
 * 2. Edge Cases:
 *    - one repetition creates four runs in stable arm order.
 *    - five repetitions create twenty unique repetition-arm entries.
 *    - all five decision domains remain represented.
 * 3. Failure Path:
 *    - subjective slots, invalid counts, malformed pairs, and repetition values other than 1 or 5 fail safely.
 */
```

Add assertions that the final IDs are `D01`–`D10`, `H01`–`H10`, `C01A/C01B` through `C03A/C03B`, and `T01`–`T04`; every slot must have `type: 'multiple_choice'`. Assert:

```ts
assert.equal(createEvaluationV3ExperimentPlan(1).length, 4);
assert.equal(createEvaluationV3ExperimentPlan(5).length, 20);
assert.throws(() => createEvaluationV3ExperimentPlan(2 as 1), /repetitions must be 1 or 5/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm run advisor:evaluation-v3:test`

Expected: FAIL because the blueprint still contains four subjective `S` slots and the experiment planner does not accept a repetition argument.

- [ ] **Step 3: Create the dedicated v3 types and compatibility re-export**

Create `shared/amyHoodEvaluationV3.ts` with the approved categories and immutable run shape:

```ts
import type { DatasetSplit, DecisionDomain } from './amyHoodDecisionAdvisor';

export type EvaluationV3Category =
  | 'amy_specific_discrimination'
  | 'temporal_holdout'
  | 'counterfactual_pair'
  | 'new_advisory_transfer';
export type EvaluationV3Arm =
  | 'generic_cfo'
  | 'amy_prompt'
  | 'amy_policy_rag'
  | 'amy_full_rag';
export const EVALUATION_V3_ARMS: readonly EvaluationV3Arm[] = [
  'generic_cfo', 'amy_prompt', 'amy_policy_rag', 'amy_full_rag',
];
export type EvaluationV3Repetitions = 1 | 5;
export type EvaluationV3BlueprintSlot = {
  id: string;
  category: EvaluationV3Category;
  type: 'multiple_choice';
  domain: DecisionDomain;
  pairId?: 'C01' | 'C02' | 'C03';
  pairVariant?: 'a' | 'b';
  requiredSplit: DatasetSplit | 'none';
};
export type EvaluationV3Question = EvaluationV3BlueprintSlot & {
  prompt: string;
  options: [string, string, string, string];
};
export type EvaluationV3TrapMechanism =
  | 'wrong_priority_order'
  | 'premature_application'
  | 'missing_boundary_condition'
  | 'short_term_financial_optics'
  | 'wrong_execution_sequence'
  | 'overgeneralized_rule'
  | 'miscalibrated_reversal_signal';
export type EvaluationV3Answer = {
  questionId: string;
  correctChoice: 1 | 2 | 3 | 4;
  correctIntent: string;
  trapIntents: Record<'1' | '2' | '3' | '4', string>;
  trapMechanisms: Partial<Record<'1' | '2' | '3' | '4', EvaluationV3TrapMechanism>>;
  evidenceRefs: string[];
  sealedEventIds: string[];
  expectedPairBehavior?: 'reverse' | 'stable';
};
export type EvaluationV3Review = {
  questionId: string;
  status: 'unreviewed' | 'approved' | 'revision_required';
  revisionNote: string;
  reviewedAt: string | null;
};
export type EvaluationV3QuestionFile = {
  dataset: 'amy_hood_decision_advisor_evaluation';
  version: '3.0.0';
  frozenAt: string;
  questions: EvaluationV3Question[];
};
export type EvaluationV3AnswerKeyFile = {
  dataset: 'amy_hood_decision_advisor_evaluation_answer_key';
  version: '3.0.0';
  answers: EvaluationV3Answer[];
};
export type EvaluationV3ReviewFile = {
  questionSetVersion: '3.0.0';
  reviews: EvaluationV3Review[];
};
export type EvaluationV3RunAnswer = {
  questionId: string;
  status: 'complete' | 'failed';
  choice?: 1 | 2 | 3 | 4;
  reason?: string;
  correct?: boolean;
  mismatch?: boolean;
  elapsedMs: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
};
export type EvaluationV3RunScores = {
  discrimination: number;
  holdout: number;
  counterfactual: number;
  transfer: number;
  total: number;
  percent: number;
};
export type EvaluationV3Run = {
  runId: string;
  version: '3.0.0';
  experimentGroupId: string;
  repetition: 1 | 2 | 3 | 4 | 5;
  arm: EvaluationV3Arm;
  provider: 'local';
  model: string;
  questionSetVersion: '3.0.0';
  answerKeyHash: string;
  promptVersionId: string | null;
  promptHash: string;
  memoryReleaseId: string | null;
  memoryReleaseHash: string | null;
  holdoutManifestHash: string;
  status: 'queued' | 'running' | 'incomplete' | 'complete';
  answers: EvaluationV3RunAnswer[];
  scores: EvaluationV3RunScores;
  startedAt: string;
  completedAt: string | null;
};
export type EvaluationV3ExperimentLaunch = {
  experimentGroupId: string;
  repetitions: EvaluationV3Repetitions;
  runs: EvaluationV3Run[];
};
```

Move the existing v3 exports out of `shared/amyHoodDecisionAdvisor.ts` and add `export * from './amyHoodEvaluationV3';` so existing imports continue to compile during migration.

Remove the provisional weighted `EvaluationV3Score` contract and `server/evaluationV3/scoring.ts`. The approved all-MC benchmark uses `0–30` objective scoring; weighted subjective dimensions are no longer part of v3.

- [ ] **Step 4: Update the blueprint and experiment planner**

Change the final four slots to `T01`–`T04`, category `new_advisory_transfer`, and `type: multiple_choice`. Implement:

```ts
export const createEvaluationV3ExperimentPlan = (
  repetitions: EvaluationV3Repetitions,
) => {
  if (repetitions !== 1 && repetitions !== 5) {
    throw new Error('evaluation v3 repetitions must be 1 or 5');
  }
  return Array.from({ length: repetitions }, (_, index) => index + 1)
    .flatMap((repetition) => EVALUATION_V3_ARMS.map((arm) => ({ arm, repetition })));
};
```

Update `assertEvaluationV3Blueprint()` to require all 30 slots to be multiple-choice, the exact ID families, ten temporal slots with `requiredSplit: holdout`, and three complete counterfactual pairs.

- [ ] **Step 5: Run tests and type checking**

Run: `npm run advisor:evaluation-v3:test && npm run lint`

Expected: all v3 blueprint tests PASS and TypeScript reports no errors.

- [ ] **Step 6: Commit Task 1**

```bash
git add shared/amyHoodEvaluationV3.ts shared/amyHoodDecisionAdvisor.ts evaluation/v3/amy_hood_advisor_blueprint.json server/evaluationV3/blueprint.ts server/evaluationV3/experimentPlan.ts server/evaluationV3/scoring.ts tests/amyHoodEvaluationV3.test.ts
git commit -m "feat: freeze Evaluation v3 contract"
```

### Task 2: Author and validate the sealed 30-question bundle

**Files:**
- Create: `evaluation/v3/public/questions.json`
- Create: `evaluation/v3/public/reviews.json`
- Create: `evaluation/v3/sealed/answer-key.json`
- Create: `server/evaluationV3/questionQuality.ts`
- Create: `server/evaluationV3/questionSet.ts`
- Create: `tests/amyHoodEvaluationV3QuestionSet.test.ts`
- Modify: `evaluation/v3/amy_hood_advisor_blueprint.json`

**Interfaces:**
- Consumes: v3 question, answer, review, blueprint, and trap mechanism types from Task 1.
- Produces: `loadEvaluationV3Bundle(root)`, `loadEvaluationV3Reviews(root)`, `saveEvaluationV3Review(root, questionId, input)`, and `assertEvaluationV3Bundle(questions, answerKey)`.

Use this fixed authoring matrix. It prevents vague “write difficult questions” work during execution:

| IDs | Scenario allocation | Required trap emphasis |
| --- | --- | --- |
| D01/D06 | M&A platform independence, integration sequence | short-term EPS first; synergy before trust; independent margin before ecosystem |
| D02/D07 | AI and cloud CapEx | forecast before contracted demand; utilization too late; margin recovery before capacity |
| D03/D08 | value-based pricing | cost-plus price; broad rollout before usage proof; discount before value segmentation |
| D04/D09 | cost efficiency | uniform cuts; protect all growth labels; delay operating leverage |
| D05/D10 | shareholder return and risk | fixed buyback promise; immediate dilution offset; cash preservation without strategic optionality |
| H01–H03 | GitHub acquisition 2018 | financial ceiling vs platform neutrality; trust before monetization; measured integration |
| H04–H06 | AI datacenter investment 2025 | contracted demand; long-lead capacity; depreciation and margin recovery checkpoints |
| H07/H08 | Microsoft 365 price increase 2021 | demonstrated customer value; packaging sequence; retention and usage boundaries |
| H09/H10 | share repurchase 2021 | investment headroom; flexible pacing; dilution and cash-flow constraints |
| C01A/C01B | AI capacity with 80% verified demand vs 35% forecast-only demand | same options, keyed action reverses |
| C02A/C02B | Copilot pricing with proven time savings vs weak adoption and high churn | same options, keyed rollout reverses |
| C03A/C03B | developer-platform acquisition with stable neutrality vs forced cloud exclusivity | same options, keyed transaction stance reverses |
| T01 | cybersecurity platform investment under margin pressure | protect strategic capability with measurable milestones |
| T02 | vertical AI acquisition with uncertain integration | conditional approval and staged integration |
| T03 | usage-based cloud price redesign | customer value and transition protection before monetization |
| T04 | recession resource allocation | selective reallocation, transparent guidance, reversal signals |

Use the exact correct-position schedule below, which yields counts `1:7, 2:8, 3:7, 4:8`:

```text
D01..D10 = 2,4,1,3,2,1,4,3,2,4
H01..H10 = 3,1,4,2,3,1,4,2,3,1
C01A,C01B,C02A,C02B,C03A,C03B = 4,2,1,3,4,2
T01..T04 = 1,3,2,4
```

- [ ] **Step 1: Write failing bundle and review-store tests**

Start `tests/amyHoodEvaluationV3QuestionSet.test.ts` with:

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - one approved D10/H10/C6/T4 bundle validates and round-trips a review.
 * 2. Edge Cases:
 *    - correct-position counts at the six and nine boundaries are accepted.
 *    - a Korean revision note is preserved exactly.
 *    - counterfactual pairs can explicitly remain stable or reverse.
 * 3. Failure Path:
 *    - duplicate IDs, weak options, missing trap metadata, leaked labels, and malformed pairs fail before persistence.
 */
```

Test the real JSON files and assert 30 questions, four unique options each, no subjective fields, exact answer/review ordering, and no answer-key fields in the public file.

- [ ] **Step 2: Run the new test and verify RED**

Run: `npx tsx --test tests/amyHoodEvaluationV3QuestionSet.test.ts`

Expected: FAIL because `server/evaluationV3/questionSet.ts` and the three final bundle files do not exist.

- [ ] **Step 3: Implement the quality validator**

`assertEvaluationV3Bundle()` must enforce:

```ts
const expectedPrefixes = { D: 10, H: 10, C: 6, T: 4 } as const;
const forbiddenLabels = /(?:정답|오답|권장\s*답|correct\s*answer)/i;
const MIN_OPTION_LENGTH_RATIO = 0.7;
const MAX_OPTION_LENGTH_RATIO = 1.3;
```

For each question, require exactly four trimmed unique options, one answer, non-empty `correctIntent`, three wrong-option trap mechanisms, no trap metadata in the public file, and option lengths within 70%–130% of the per-question mean. Require each correct position to occur six through nine times. For each counterfactual pair, require variants `a/b`, one documented material-condition change, and `expectedPairBehavior` on both answer records.

- [ ] **Step 4: Implement atomic bundle and review loading**

Follow the v2 atomic write pattern but use v3 paths. `saveEvaluationV3Review()` validates the full bundle before writing, requires a note for `revision_required`, and writes only `evaluation/v3/public/reviews.json` through a random temporary sibling followed by `rename()`.

- [ ] **Step 5: Author the 30 Korean questions and sealed key**

Write concrete decision-time facts, financial constraints, and four similarly detailed options for every row in the authoring matrix. Initialize all 30 reviews to `unreviewed`; do not silently approve newly authored questions. Each H question references only one of the four sealed events and excludes post-outcome success. Each wrong option receives one allowed trap mechanism and a precise Korean trap explanation.

- [ ] **Step 6: Run focused and regression tests**

Run: `npx tsx --test tests/amyHoodEvaluationV3QuestionSet.test.ts tests/amyHoodEvaluationV3.test.ts && npm run evaluation:test`

Expected: v3 bundle tests PASS and all 68 existing v2 evaluation tests remain green.

- [ ] **Step 7: Commit Task 2**

```bash
git add evaluation/v3 server/evaluationV3/questionQuality.ts server/evaluationV3/questionSet.ts tests/amyHoodEvaluationV3QuestionSet.test.ts
git commit -m "data: add sealed Evaluation v3 question set"
```

### Task 3: Add the four-event holdout manifest and fail-closed leakage gate

**Files:**
- Create: `evaluation/v3/sealed/holdout-manifest.json`
- Create: `server/evaluationV3/holdout.ts`
- Create: `tests/amyHoodEvaluationV3Holdout.test.ts`
- Modify: `server/decisionAdvisor/leakageGuard.ts`
- Modify: `server/personaPipeline/promptBuilder.ts`

**Interfaces:**
- Consumes: current candidate, source, evidence, prompt-analysis, and artifact split IDs.
- Produces: `loadEvaluationV3Holdout(root)`, `assertNoEvaluationV3Holdout(scope, references, manifest)`, and `filterEvaluationV3TrainingReferences(references, manifest)`.

The manifest must include these primary sealed references:

```json
{
  "candidate-github-acquisition-2018": ["source-d89c20fc175fe37c", "source-3f83bbdf64a6f397", "source-988d52f913373551", "source-ff654340bdfcc0b6", "source-ad9a23176d9cf21d"],
  "candidate-ai-datacenter-plan-2025": ["source-7f4b2d38f70ad433"],
  "candidate-m365-price-2021": ["source-19bc03d4ebf333f9"],
  "candidate-buyback-2021": ["source-d25d732db767b7c0"]
}
```

Mark GitHub `known_prior_exposure`. Do not seal the shared FY23 Q1 source version `source-ad9a23176d9cf21d-25fb51a81eef` wholesale because approved OpenAI and workforce policy spans use it. Instead, forbid its GitHub candidate association and all GitHub-specific evidence spans while allowing only explicitly approved non-GitHub span IDs. Runtime v3 RAG must never retrieve the full raw shared source.

- [ ] **Step 1: Write failing holdout tests**

Use this header:

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - evaluation scope reads four sealed events while build scopes accept only non-holdout references.
 * 2. Edge Cases:
 *    - a shared source permits an explicitly approved non-holdout span.
 *    - duplicate references report one deterministic identifier.
 *    - an empty training selection remains valid.
 * 3. Failure Path:
 *    - candidate, source, evidence, alias, and raw shared-source leakage fail before the write callback runs.
 */
```

Use a `writeCalled` boolean to prove that the guarded writer is not called after a leak.

- [ ] **Step 2: Run the test and verify RED**

Run: `npx tsx --test tests/amyHoodEvaluationV3Holdout.test.ts`

Expected: FAIL because the manifest loader and identifier-level guard do not exist.

- [ ] **Step 3: Implement the manifest and guard**

Normalize references to:

```ts
export type EvaluationV3ArtifactReference = {
  artifactClass: 'candidate' | 'event' | 'source' | 'evidence' | 'alias' | 'raw_source';
  id: string;
  candidateId?: string;
};
```

The guard returns no partial result. It throws `holdout <artifactClass> <id> is forbidden in <scope>` on the first stable-sorted match. `evaluation_authoring` and `evaluation_grading` may read sealed artifacts; `main_prompt`, `policy_build`, `memory_release`, and `runtime_index` may not.

- [ ] **Step 4: Integrate the final gate into the existing prompt builder**

Before `promptBuilder.ts` writes a Gemma prompt, convert selected analyses and source references to `EvaluationV3ArtifactReference[]`, load the manifest, and call `assertNoEvaluationV3Holdout('main_prompt', references, manifest)`. Keep the pre-existing incomplete-analysis and atomic-write behavior unchanged.

- [ ] **Step 5: Run holdout, persona, and v3 tests**

Run: `npx tsx --test tests/amyHoodEvaluationV3Holdout.test.ts tests/amyHoodPersonaPipeline.test.ts tests/amyHoodEvaluationV3.test.ts`

Expected: all tests PASS; an injected holdout source prevents the persona prompt write.

- [ ] **Step 6: Commit Task 3**

```bash
git add evaluation/v3/sealed/holdout-manifest.json server/evaluationV3/holdout.ts server/decisionAdvisor/leakageGuard.ts server/personaPipeline/promptBuilder.ts tests/amyHoodEvaluationV3Holdout.test.ts tests/amyHoodPersonaPipeline.test.ts
git commit -m "feat: seal Evaluation v3 holdout events"
```

### Task 4: Build the v3 model-input boundary and four-arm context contract

**Files:**
- Create: `server/evaluationV3/prompt.ts`
- Create: `server/evaluationV3/context.ts`
- Create: `tests/amyHoodEvaluationV3Prompt.test.ts`

**Interfaces:**
- Consumes: public `EvaluationV3Question`, `EvaluationV3Arm`, active prompt content, generic CFO prompt content, and a versioned structured memory snapshot.
- Produces: `buildEvaluationV3Input(systemPrompt, question, context, arm)`, `parseEvaluationV3Response(question, text)`, and `loadEvaluationV3ArmContext(root, arm)`.

- [ ] **Step 1: Write failing prompt-boundary tests**

Use one happy path, exactly three edges (fenced JSON, Korean reason preservation, empty context for no-RAG arms), and failure paths for answer-key fields, invalid choice, missing reason, policy context in the generic arm, and missing required memory release.

The central leakage assertion must be:

```ts
assert.throws(
  () => buildEvaluationV3Input(prompt, { ...question, correctChoice: 2 } as never, [], 'amy_prompt'),
  /unknown public question field: correctChoice/,
);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx tsx --test tests/amyHoodEvaluationV3Prompt.test.ts`

Expected: FAIL because the v3 prompt and context modules do not exist.

- [ ] **Step 3: Implement strict public-question projection and response parsing**

Allow only `id`, `category`, `type`, `domain`, `pairId`, `pairVariant`, `requiredSplit`, `prompt`, and `options`. Always request:

```text
JSON만 출력하세요: {"choice":1,"reason":"선택한 판단 기준과 우선순위를 1~2문장으로 설명"}
```

Parse one integer choice `1..4` and a non-empty reason. Preserve the existing single retry policy in the runner rather than retrying inside the parser.

- [ ] **Step 4: Implement arm-specific context rules**

Use a typed context package:

```ts
export type EvaluationV3ContextPackage = {
  memoryReleaseId: string | null;
  policy: string[];
  reflections: string[];
  events: string[];
  counterexamples: string[];
};
```

`generic_cfo` and `amy_prompt` require all arrays empty. `amy_policy_rag` requires at least one policy and forbids the other arrays. `amy_full_rag` requires at least one policy, one reflection, and one event; counterexamples may be empty only when the release records `no_reviewed_counterexample`. Missing structured memory must fail rather than silently make two arms identical.

- [ ] **Step 5: Run prompt tests and type checking**

Run: `npx tsx --test tests/amyHoodEvaluationV3Prompt.test.ts && npm run lint`

Expected: all prompt-boundary tests PASS.

- [ ] **Step 6: Commit Task 4**

```bash
git add server/evaluationV3/prompt.ts server/evaluationV3/context.ts tests/amyHoodEvaluationV3Prompt.test.ts
git commit -m "feat: add Evaluation v3 prompt boundary"
```

### Task 5: Implement atomic v3 runs, four-arm experiments, repetitions, and resume

**Files:**
- Create: `server/evaluationV3/runStore.ts`
- Create: `server/evaluationV3/runner.ts`
- Create: `tests/amyHoodEvaluationV3Runner.test.ts`
- Modify: `shared/amyHoodEvaluationV3.ts`

**Interfaces:**
- Consumes: `ModelClient`, public bundle loader, sealed scorer loader, active prompt store, context loader, prompt builder, and holdout gate.
- Produces: `createEvaluationV3Runner(options)` with `createExperiment({ repetitions })`, `executeExperiment(runIds)`, `executeRun(runId)`, and `resumeRun(runId)`.

- [ ] **Step 1: Write failing runner tests**

Use this test plan:

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - one repetition creates and completes four pinned runs with thirty scored choices each.
 * 2. Edge Cases:
 *    - five repetitions preserve repetition-then-arm order and unique IDs.
 *    - resume keeps completed answers and starts at the first failed question.
 *    - a failed arm does not block later arms in the same repetition.
 * 3. Failure Path:
 *    - unapproved bundles, stale versions, invalid arm groups, missing memory, leakage, and repeated malformed output fail safely without corrupting sibling runs.
 */
```

Inject a deterministic fake `ModelClient` and an in-memory context loader. Assert exactly 120 model calls for one complete repetition and 600 for five repetitions.

- [ ] **Step 2: Run the runner test and verify RED**

Run: `npx tsx --test tests/amyHoodEvaluationV3Runner.test.ts`

Expected: FAIL because v3 run storage and runner do not exist.

- [ ] **Step 3: Define and persist immutable run metadata**

Add these required fields to `EvaluationV3Run`:

```ts
{
  version: '3.0.0';
  experimentGroupId: string;
  repetition: 1 | 2 | 3 | 4 | 5;
  arm: EvaluationV3Arm;
  provider: 'local';
  model: string;
  questionSetVersion: '3.0.0';
  answerKeyHash: string;
  promptVersionId: string | null;
  promptHash: string;
  memoryReleaseId: string | null;
  memoryReleaseHash: string | null;
  holdoutManifestHash: string;
  status: 'queued' | 'running' | 'incomplete' | 'complete';
  answers: EvaluationV3RunAnswer[];
  scores: EvaluationV3RunScores;
  startedAt: string;
  completedAt: string | null;
}
```

Store v3 runs only under `evaluation/v3/runs/`. Reuse the v2 random temporary sibling plus rename pattern; reject unsafe run IDs.

- [ ] **Step 4: Implement experiment creation and sequential execution**

Validate all 30 reviews before model creation. Create exactly four or twenty queued runs using `createEvaluationV3ExperimentPlan()`. Execute in repetition-then-arm order and invoke one question at a time. Retry malformed model JSON once, persist every completed answer atomically, and preserve completed answers during resume.

Score choices outside the model call. Detect a deterministic mismatch only when the reason explicitly contains a different option label such as `2번을 선택` while `choice` is `3`.

- [ ] **Step 5: Run runner and v2 regression tests**

Run: `npx tsx --test tests/amyHoodEvaluationV3Runner.test.ts tests/amyHoodEvaluationV3Prompt.test.ts && npm run evaluation:test`

Expected: v3 runner tests PASS and all v2 tests remain green.

- [ ] **Step 6: Commit Task 5**

```bash
git add shared/amyHoodEvaluationV3.ts server/evaluationV3/runStore.ts server/evaluationV3/runner.ts tests/amyHoodEvaluationV3Runner.test.ts
git commit -m "feat: run four-arm Evaluation v3 experiments"
```

### Task 6: Add v3 aggregation, lift, consistency, and benchmark rejection diagnostics

**Files:**
- Create: `server/evaluationV3/report.ts`
- Create: `tests/amyHoodEvaluationV3Report.test.ts`
- Modify: `shared/amyHoodEvaluationV3.ts`

**Interfaces:**
- Consumes: complete or partial v3 runs from one experiment group.
- Produces: `buildEvaluationV3ExperimentReport(runs, manifest)` returning repetition reports, arm aggregates, category scores, lifts, agreement, mismatch, latency, token totals, and validity warnings.

- [ ] **Step 1: Write failing report tests**

Use one complete four-arm report as the happy path; exactly three edges are one incomplete arm, one-repetition statistics, and five identical choices producing 100% agreement. Failure paths cover duplicate arms, mixed versions, mixed groups, and missing answers.

- [ ] **Step 2: Run the report test and verify RED**

Run: `npx tsx --test tests/amyHoodEvaluationV3Report.test.ts`

Expected: FAIL because `buildEvaluationV3ExperimentReport()` does not exist.

- [ ] **Step 3: Implement objective aggregation**

Compute `D/10`, `H/10`, `C/6`, `T/4`, `total/30`, and percentage. For five repetitions compute mean, min, max, population standard deviation, and per-question choice agreement. Compute:

```ts
amyPromptLift = amy_prompt.percent - generic_cfo.percent;
policyRagLift = amy_policy_rag.percent - amy_prompt.percent;
fullRagLift = amy_full_rag.percent - amy_policy_rag.percent;
fullVsGenericLift = amy_full_rag.percent - generic_cfo.percent;
```

Return `null` for a lift when either arm is incomplete. Mark `benchmarkRejected: true` when the first complete `generic_cfo` repetition exceeds 80%. Always include `known_prior_exposure` for GitHub in warnings.

- [ ] **Step 4: Run report and full v3 tests**

Run: `npx tsx --test tests/amyHoodEvaluationV3Report.test.ts tests/amyHoodEvaluationV3Runner.test.ts tests/amyHoodEvaluationV3.test.ts`

Expected: all report and v3 tests PASS.

- [ ] **Step 5: Commit Task 6**

```bash
git add shared/amyHoodEvaluationV3.ts server/evaluationV3/report.ts tests/amyHoodEvaluationV3Report.test.ts
git commit -m "feat: report Evaluation v3 diagnostics"
```

### Task 7: Expose a separate v3 API without changing v2 routes

**Files:**
- Create: `server/evaluationV3/routes.ts`
- Create: `tests/amyHoodEvaluationV3Routes.test.ts`
- Modify: `server/index.ts:18-25,780-800`
- Modify: `src/services/evaluationApi.ts`

**Interfaces:**
- Consumes: v3 question store, run store, runner, and report builder.
- Produces: `/api/evaluation/v3/questions`, review, experiment, run, resume, and report endpoints plus typed client functions.

- [ ] **Step 1: Write failing route and client tests**

Cover one successful public question/review/experiment/report flow; exactly three edge cases for Korean review text, repetitions `1`, and repetitions `5`; failure paths for invalid repetitions, non-local providers, missing IDs, and empty/non-JSON proxy responses.

- [ ] **Step 2: Run the route test and verify RED**

Run: `npx tsx --test tests/amyHoodEvaluationV3Routes.test.ts`

Expected: FAIL because no v3 router or service functions exist.

- [ ] **Step 3: Implement the v3 router**

Expose:

```text
GET   /api/evaluation/v3/questions
PATCH /api/evaluation/v3/questions/:id/review
GET   /api/evaluation/v3/runs
GET   /api/evaluation/v3/runs/:id
POST  /api/evaluation/v3/experiments        body { provider: "local", repetitions: 1|5 }
POST  /api/evaluation/v3/runs/:id/resume
GET   /api/evaluation/v3/reports/:groupId
```

Mount it separately in `server/index.ts`. Do not modify `/api/evaluation/*` v2 semantics.

- [ ] **Step 4: Add typed v3 API clients**

Keep the common safe JSON `request()` helper and add `fetchEvaluationV3Questions`, `saveEvaluationV3QuestionReview`, `createEvaluationV3Experiment(repetitions)`, `listEvaluationV3Runs`, `getEvaluationV3Run`, `resumeEvaluationV3Run`, and `getEvaluationV3Report`.

- [ ] **Step 5: Run route, client, and lint tests**

Run: `npx tsx --test tests/amyHoodEvaluationV3Routes.test.ts tests/amyHoodEvaluationUi.test.ts && npm run lint`

Expected: v3 route tests and existing v2 API tests PASS.

- [ ] **Step 6: Commit Task 7**

```bash
git add server/evaluationV3/routes.ts server/index.ts src/services/evaluationApi.ts tests/amyHoodEvaluationV3Routes.test.ts tests/amyHoodEvaluationUi.test.ts
git commit -m "feat: expose Evaluation v3 API"
```

### Task 8: Add v2/v3 selection and v3 question, execution, and report UI

**Files:**
- Create: `src/components/evaluationV3/EvaluationV3QuestionReview.tsx`
- Create: `src/components/evaluationV3/EvaluationV3RunPanel.tsx`
- Create: `src/components/evaluationV3/EvaluationV3ReportPanel.tsx`
- Create: `src/components/evaluationV3/evaluationV3ViewModel.ts`
- Create: `tests/amyHoodEvaluationV3Ui.test.ts`
- Modify: `src/components/EvaluationQuestionReviewView.tsx`
- Modify: `src/components/EvaluationView.tsx`
- Modify: `src/components/EvaluationReportView.tsx`

**Interfaces:**
- Consumes: v2 views unchanged and v3 API clients from Task 7.
- Produces: a reusable `EvaluationVersion = 'v2' | 'v3'` selector and v3 human review, experiment launch, progress, and report surfaces.

- [ ] **Step 1: Write failing UI view-model tests**

Use one 30-card approved bundle and four-arm report as the happy path. Exactly three edges cover all filters, one incomplete repetition, and `known_prior_exposure` warning display. Failure paths cover missing answer/review records and mixed experiment versions.

- [ ] **Step 2: Run the UI test and verify RED**

Run: `npx tsx --test tests/amyHoodEvaluationV3Ui.test.ts`

Expected: FAIL because the v3 view model and components do not exist.

- [ ] **Step 3: Implement the v3 view model**

Return category summaries `{ D: 10, H: 10, C: 6, T: 4 }`, review summaries, four fixed arm labels, repetition grouping, lift labels, and exposure warnings. Throw on incomplete authoring records rather than rendering a misleading partial key.

- [ ] **Step 4: Implement the version selector and v3 panels**

Default new sessions to `v3` while preserving a visible `v2` option. V3 Question Review shows all four options, keyed answer, trap intent, and trap mechanism to the human only. V3 Run offers `1회 빠른 실험` and `5회 정식 실험`; disable launch until all 30 reviews are approved and structured memory is available for both RAG arms. V3 Report shows four arm cards, category scores, lifts, agreement, mismatch, tokens, latency, failures, benchmark rejection, and prior-exposure warning.

- [ ] **Step 5: Run UI, v2 regression, and build tests**

Run: `npx tsx --test tests/amyHoodEvaluationV3Ui.test.ts tests/amyHoodEvaluationUi.test.ts tests/evaluationReport.test.ts && npm run build`

Expected: v3 UI tests PASS, v2 UI/report tests PASS, and Vite build succeeds.

- [ ] **Step 6: Commit Task 8**

```bash
git add src/components/EvaluationQuestionReviewView.tsx src/components/EvaluationView.tsx src/components/EvaluationReportView.tsx src/components/evaluationV3 tests/amyHoodEvaluationV3Ui.test.ts
git commit -m "feat: add Evaluation v3 workspace"
```

### Task 9: Verify the full PoC contract and document the execution gate

**Files:**
- Modify: `package.json`
- Modify: `docs/b-track-amy-hood-poc/phase-6-evaluate-persona.md`
- Create: `docs/reports/2026-07-15-amy-hood-evaluation-v3-readiness.md`

**Interfaces:**
- Consumes: all v3 tests, routes, UI, artifacts, and existing v2 suite.
- Produces: one `evaluation:v3:test` command and a readiness report that distinguishes implemented benchmark infrastructure from model-ready memory dependencies.

- [ ] **Step 1: Add the aggregate verification command**

Set:

```json
"evaluation:v3:test": "tsx --test tests/amyHoodEvaluationV3.test.ts tests/amyHoodEvaluationV3QuestionSet.test.ts tests/amyHoodEvaluationV3Holdout.test.ts tests/amyHoodEvaluationV3Prompt.test.ts tests/amyHoodEvaluationV3Runner.test.ts tests/amyHoodEvaluationV3Report.test.ts tests/amyHoodEvaluationV3Routes.test.ts tests/amyHoodEvaluationV3Ui.test.ts"
```

- [ ] **Step 2: Update the Phase 6 operating guide**

Document the 30 all-MC questions, four arms, 1/5 repetitions, v2/v3 selector, human approval gate, holdout warning, and the explicit rule that `amy_policy_rag` and `amy_full_rag` cannot run until a structured memory release exists.

- [ ] **Step 3: Run complete verification**

Run:

```bash
npm run evaluation:v3:test
npm run evaluation:test
npm run persona:test
npm run lint
npm run build
git diff --check
```

Expected: every command exits 0. The readiness report records exact passing test counts from this run rather than estimates.

- [ ] **Step 4: Perform an API smoke check without spending model tokens**

With `npm run api` running, request `GET /api/evaluation/v3/questions` and verify 30 questions plus 30 reviews. Submit an invalid `repetitions: 2` experiment request and verify HTTP 400 with `evaluation v3 repetitions must be 1 or 5`. Do not launch Gemma until reviews and structured memory gates pass.

- [ ] **Step 5: Commit Task 9**

```bash
git add package.json docs/b-track-amy-hood-poc/phase-6-evaluate-persona.md docs/reports/2026-07-15-amy-hood-evaluation-v3-readiness.md
git commit -m "docs: verify Evaluation v3 readiness"
```

## Execution Checkpoints

1. **After Task 3:** Review the 30-question quality report and the exact four-event holdout manifest before building the runner.
2. **After Task 6:** Review four-arm scoring, benchmark rejection, prior-exposure disclosure, and one/five-repetition behavior.
3. **After Task 9:** Review full verification evidence and decide whether to approve all 30 questions or request revisions.

## Model-Evaluation Readiness After This Plan

Completing this plan freezes and implements Evaluation v3, but a meaningful four-arm live comparison still depends on the next Decision Advisor data stages:

- At least two approved cross-event reflections.
- At least one approved deployable policy.
- One immutable structured memory release containing policy, reflection, event, and counterexample layers.
- A newly generated thin Amy Main Prompt that excludes all holdout references.

Until these exist, the UI and API correctly block the two RAG arms instead of running indistinguishable empty-context controls. The `generic_cfo` and `amy_prompt` input contracts can be tested with fakes, but the first real 120-call Gemma experiment starts only after the structured memory gate passes.
