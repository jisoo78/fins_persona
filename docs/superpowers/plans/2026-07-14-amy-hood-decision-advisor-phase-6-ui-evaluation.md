# Amy Hood Decision Advisor Phase 6 UI and Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add B Track operator surfaces for sources, events, policies, memory releases, advisor use, and audit; then execute and report the four-arm, five-repetition evaluation.

**Architecture:** New B Track sections call narrow JSON APIs and keep A Track untouched. Review actions are explicit and versioned. The evaluation runner schedules 20 independent runs, resumes failures, scores against server-only keys, and publishes aggregate metrics plus paired lift without exposing sealed answers to the browser.

**Tech Stack:** React 19, TypeScript 5.8, Vite, Express, Node test runner, existing CSS architecture, JSON persistence, standalone HTML reporting.

## Global Constraints

- Preserve the existing A Track navigation, interview flow, and contracts.
- Keep the fixed unofficial-simulation disclaimer visible on every Advisor screen.
- Do not expose sealed answer keys or holdout event bodies in bundles or API responses.
- Require confirmation for approval, release activation, and superseding actions.
- Run exactly four arms times five repetitions; one failed arm must not stop the remaining queue.
- Report both quality and operational metrics with Before vs After, hypothesis, evidence, and final summary.
- Follow the AGENTS.md Test Plan format.

---

### Task 1: Extend B Track navigation without changing A Track

**Files:**
- Modify: `src/types.ts`
- Modify: `src/navigation/trackNavigation.ts`
- Modify: `tests/trackNavigation.test.ts`

**Interfaces:**
- Adds B Track sections: `source-registry`, `event-review`, `policy-review`, `memory-release`, `advisor`, and `advisor-audit`.

- [ ] **Step 1: Add the Test Plan block if absent and write failing navigation assertions**

Use this plan for the significantly modified test file:

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - B Track exposes the six Decision Advisor sections while A Track remains unchanged.
 *
 * 2. Edge Cases:
 *    - an unknown stored section falls back to the B Track default.
 *    - the existing evaluation/report sections retain their route identities.
 *    - navigation ordering groups data, memory, advisor, and evaluation workflows.
 *
 * 3. Failure Path:
 *    - cross-track section IDs are rejected rather than rendered in the wrong track.
 */
```

Snapshot or deep-compare the current A Track list before changing production code. Assert the six new B Track IDs and their ordering.

- [ ] **Step 2: Run and confirm failure**

```bash
npx tsx --test tests/trackNavigation.test.ts
```

- [ ] **Step 3: Extend only B Track types and configuration**

Group sections in this order:

```text
Data: source-registry, event-review
Memory: policy-review, memory-release, main-prompt
Advisor: advisor, advisor-audit
Evaluation: question-review, evaluation-run, reports
```

- [ ] **Step 4: Verify A Track equality and commit**

```bash
npx tsx --test tests/trackNavigation.test.ts
git add src/types.ts src/navigation/trackNavigation.ts tests/trackNavigation.test.ts
git commit -m "feat: organize advisor B Track navigation"
```

### Task 2: Add typed client services and review/release APIs

**Files:**
- Create: `src/services/decisionAdvisorApi.ts`
- Create: `src/services/evaluationV3Api.ts`
- Create: `server/decisionAdvisor/reviewRoutes.ts`
- Create: `server/evaluationV3/routes.ts`
- Modify: `server/index.ts`
- Create: `tests/amyHoodDecisionAdvisorUi.test.ts`

**Interfaces:**
- Review APIs for sources/events/policies/releases and read-only public evaluation-v3 questions/reviews.

- [ ] **Step 1: Create the UI/API test file with the required plan**

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - operators load, review, version, and activate advisor artifacts through JSON APIs.
 *
 * 2. Edge Cases:
 *    - an empty registry renders a valid zero-state payload.
 *    - a stale artifact hash returns a conflict and preserves the current version.
 *    - a failed fetch surfaces a readable UI error while preserving the last loaded data.
 *
 * 3. Failure Path:
 *    - invalid review transitions, missing confirmations, and dependency errors return JSON without partial writes or secret evaluation data.
 */
```

Add route tests for list/detail/review/activate and a static test that scans client/API payloads for sealed-answer fields.

- [ ] **Step 2: Implement a safe JSON response helper in both services**

Read `response.text()` first. If empty or invalid JSON, throw `Request failed (<status>): empty response` or `invalid JSON response` instead of calling `response.json()` and reproducing `Unexpected end of JSON input`.

- [ ] **Step 3: Implement review routes with optimistic concurrency**

Require `{ expectedSha256, action, reviewer, note }`; return 409 on stale hash. Validate transition and write a new artifact version atomically. Release activation additionally requires `{ confirmed: true }`.

- [ ] **Step 4: Mount evaluation-v3 public routes**

Expose questions and review statuses only. Load the sealed answer key inside server scoring dependencies, never inside route responses.

- [ ] **Step 5: Run and commit**

```bash
npx tsx --test tests/amyHoodDecisionAdvisorUi.test.ts
git add src/services/decisionAdvisorApi.ts src/services/evaluationV3Api.ts server/decisionAdvisor/reviewRoutes.ts server/evaluationV3/routes.ts server/index.ts tests/amyHoodDecisionAdvisorUi.test.ts
git commit -m "feat: add advisor review APIs"
```

### Task 3: Build source, event, policy, and release operator screens

**Files:**
- Create: `src/components/SourceRegistryView.tsx`
- Create: `src/components/DecisionEventReviewView.tsx`
- Create: `src/components/DecisionPolicyReviewView.tsx`
- Create: `src/components/MemoryReleaseView.tsx`
- Modify: `src/components/BTrackView.tsx`
- Modify: `tests/amyHoodDecisionAdvisorUi.test.ts`

**Interfaces:**
- Consumes typed services from Task 2 and emits explicit review/version/activation actions.

- [ ] **Step 1: Add failing render/source inspections**

Using the repo's existing component-test convention, verify zero state, loaded table/card state, review-required badge, source metadata, evidence links, version history, stale-update message, and activation confirmation.

- [ ] **Step 2: Implement `SourceRegistryView`**

Show counts by collection status, domain, tier, source URL, date, speaker, hash, event candidates, and failure reason. Provide refresh/import guidance but do not automate LinkedIn collection.

- [ ] **Step 3: Implement event and policy review**

Event cards show question, conditions, options, selected action, rejected benefit, constraints, evidence spans, confidence, split only when operator-authorized, and revision history. Policy cards show condition, ordered criteria, action, exceptions, reversal signals, support/contrast IDs, and confidence.

- [ ] **Step 4: Implement memory releases**

Show immutable version, artifact counts, dataset/index hashes, active state, and diff from active. Require a confirmation dialog before activation.

- [ ] **Step 5: Verify and commit**

```bash
npx tsx --test tests/amyHoodDecisionAdvisorUi.test.ts
npm run build
git add src/components/SourceRegistryView.tsx src/components/DecisionEventReviewView.tsx src/components/DecisionPolicyReviewView.tsx src/components/MemoryReleaseView.tsx src/components/BTrackView.tsx tests/amyHoodDecisionAdvisorUi.test.ts
git commit -m "feat: add advisor data and memory review screens"
```

### Task 4: Build the Advisor and audit screens

**Files:**
- Create: `src/components/DecisionAdvisorView.tsx`
- Create: `src/components/AdvisorAuditView.tsx`
- Modify: `src/components/BTrackView.tsx`
- Modify: `tests/amyHoodDecisionAdvisorUi.test.ts`

**Interfaces:**
- Creates/renders/resumes Advisor runs and separates normal answers from developer audit data.

- [ ] **Step 1: Add failing UI assertions**

Verify scenario submission, constraints, pending states, completed first-person answer, generic fallback indicator, failed-run resume, run-ID copy control in both list/detail locations, and pinned audit metadata.

- [ ] **Step 2: Implement the Advisor screen**

Keep this disclaimer permanently visible:

```text
공개자료를 바탕으로 구성된 비공식 AI 시뮬레이션이며, Amy Hood 본인이나 Microsoft의 공식 입장이 아닙니다.
```

Show the answer first, then recommendation conditions, actions, reversal signals, and a compact evidence-coverage label. Do not show source links in this user-facing answer area.

- [ ] **Step 3: Implement the audit screen**

Show and copy run ID; show prompt version, memory release, model, temperature, retrieval hash, retrieved/packed/dropped IDs, coverage, fallback flag, timings, and errors. Source metadata can be expanded here for developers.

- [ ] **Step 4: Verify and commit**

```bash
npx tsx --test tests/amyHoodDecisionAdvisorUi.test.ts
npm run build
git add src/components/DecisionAdvisorView.tsx src/components/AdvisorAuditView.tsx src/components/BTrackView.tsx tests/amyHoodDecisionAdvisorUi.test.ts
git commit -m "feat: add advisor and audit screens"
```

### Task 5: Implement the four-arm, five-repetition evaluation runner

**Files:**
- Create: `server/evaluationV3/runner.ts`
- Create: `server/evaluationV3/runStore.ts`
- Create: `server/evaluationV3/scorer.ts`
- Create: `tests/amyHoodEvaluationV3Runner.test.ts`
- Modify: `server/evaluationV3/routes.ts`

**Interfaces:**
- Produces evaluation run creation, progress, resume, scoring, and aggregate APIs.

- [ ] **Step 1: Create the runner test plan and failing tests**

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - four arms complete five repetitions each and produce objective, subjective, retrieval, and lift metrics.
 *
 * 2. Edge Cases:
 *    - one failed arm/repetition does not block the other nineteen runs.
 *    - resuming a failed experiment schedules only incomplete cells.
 *    - repeated outputs retain per-run variance instead of being overwritten by an average.
 *
 * 3. Failure Path:
 *    - unavailable models, malformed answers, scorer failure, or sealed-key mismatch leaves explicit resumable cells and no fabricated score.
 */
```

Assert exactly 20 unique cells and the three edge cases. Use fake models/scorers; no paid API call in tests.

- [ ] **Step 2: Implement arm configurations**

```text
generic_cfo: generic CFO prompt, no Amy memory
amy_prompt: thin Amy prompt, no RAG
amy_policy_rag: thin Amy prompt plus policy/reflection retrieval
amy_full_rag: thin Amy prompt plus policy/reflection/event retrieval
```

Pin question version, prompt versions, memory release, model, temperature, and seed where supported for every cell.

- [ ] **Step 3: Implement independent queue and resume**

Persist before and after each question. Catch errors per cell, continue the queue, and resume only failed/incomplete cells with the same pins.

- [ ] **Step 4: Implement scoring**

For objective questions, score choice accuracy and trap-intent distribution. Grade the explanation separately; when choice and reason conflict, retry the answering model exactly once and record both attempts. For subjective questions, call a versioned rubric scorer with decision, criterion order, conditional transfer, evidence bounding, and actionability. Blind the scorer to arm, model, prompt, expected system ranking, and run labels. Store raw judge output, parsed score, and parse errors. Compute Recall@5/nDCG@5 for retrieval arms and faithfulness against packed evidence.

- [ ] **Step 5: Add API tests and commit**

```bash
npx tsx --test tests/amyHoodEvaluationV3Runner.test.ts
git add server/evaluationV3/runner.ts server/evaluationV3/runStore.ts server/evaluationV3/scorer.ts server/evaluationV3/routes.ts tests/amyHoodEvaluationV3Runner.test.ts
git commit -m "feat: run advisor ablation evaluation"
```

### Task 6: Add evaluation UI and developer HTML report

**Files:**
- Create: `src/components/EvaluationV3View.tsx`
- Create: `src/components/EvaluationV3ReportView.tsx`
- Modify: `src/components/BTrackView.tsx`
- Create: `server/evaluationV3/report.ts`
- Create: `docs/reports/2026-07-14-amy-hood-decision-advisor-evaluation-v3.html`
- Modify: `tests/amyHoodDecisionAdvisorUi.test.ts`
- Modify: `tests/amyHoodEvaluationV3Runner.test.ts`

**Interfaces:**
- Shows execution/progress/history separately from question review and produces one self-contained developer report.

- [ ] **Step 1: Add failing report tests**

Assert the report includes sample counts, failures, means, standard deviations, 95% intervals or clearly labeled descriptive bounds, per-category scores, paired lifts, retrieval metrics, fallback rate, latency/tokens, hypotheses, limitations, and no sealed answers.

- [ ] **Step 2: Implement evaluation execution UI**

Show 20-cell progress, retry/resume, run IDs with copy controls, model/prompt/memory pins, failure reasons, and cost/token estimates. Keep evaluation question review as its own existing/new section.

- [ ] **Step 3: Implement aggregate metrics**

Report:

```text
choice accuracy by category/domain
subjective rubric dimensions
counterfactual pair consistency
Recall@5 and nDCG@5
context relevance and faithfulness
generic fallback rate
persona lift = amy_prompt - generic_cfo
policy RAG lift = amy_policy_rag - amy_prompt
full RAG lift = amy_full_rag - amy_policy_rag
selection agreement across repetitions
tokens and latency
```

- [ ] **Step 4: Apply acceptance gates from the master design**

Apply the fixed numerical gates: Generic CFO score `<=70`; Amy Main Prompt lift `>=15`; three-layer RAG lift over Amy Main Prompt `>=5`; five-run decision consistency `>=85%`; choice-reason mismatch after retry `0`; holdout leakage `0`; evidence faithfulness `>=90%`. If Generic CFO scores `>=80`, reject the question set as insufficiently discriminative regardless of other scores. Do not claim “Amy Hood decision replication”; report bounded similarity and uncertainty.

- [ ] **Step 5: Generate the standalone report**

Use the required order: objective/quantitative setup, Before vs After, hypotheses and evidence logic, limitations, and final summary. Include links to local run IDs/artifact versions, but not secrets or sealed answers.

- [ ] **Step 6: Run complete verification**

```bash
npx tsx --test tests/amyHoodEvaluationV3Runner.test.ts
npx tsx --test tests/amyHoodDecisionAdvisorUi.test.ts
npm run advisor:evaluation-v3:test
npm run advisor:runtime:test
npm run evaluation:test
npm run inventory:test
npm run persona:test
npm run lint
npm run build
git diff --check
```

Expected: all tests and build pass; 20-cell orchestration is resumable; report contains no sealed keys.

- [ ] **Step 7: Commit Phase 6**

```bash
git add src/components/EvaluationV3View.tsx src/components/EvaluationV3ReportView.tsx src/components/BTrackView.tsx server/evaluationV3/report.ts docs/reports/2026-07-14-amy-hood-decision-advisor-evaluation-v3.html tests/amyHoodDecisionAdvisorUi.test.ts tests/amyHoodEvaluationV3Runner.test.ts
git commit -m "feat: report advisor evaluation v3"
```

### Task 7: Gate and run the GPT-5-mini comparison

**Files:**
- Create: `server/evaluationV3/providerGate.ts`
- Modify: `server/evaluationV3/runner.ts`
- Modify: `server/evaluationV3/report.ts`
- Modify: `tests/amyHoodEvaluationV3Runner.test.ts`

**Interfaces:**
- Produces: `assertPaidProviderGate(gemmaReport)` and an explicit `--provider openai --model gpt-5-mini` evaluation option.

- [ ] **Step 1: Add failing provider-gate tests**

Test a passing Gemma report, a report missing one acceptance metric, a failed leakage gate, and a generic-CFO score of 80. Assert rejected gates make zero provider calls.

- [ ] **Step 2: Implement the exact gate**

Require a complete Gemma 20-cell report, zero leakage, zero post-retry mismatch, faithfulness at least 90%, and no rejected-question-set condition before constructing the paid provider client. Return every failed criterion in one error.

- [ ] **Step 3: Add explicit paid-provider configuration**

Require `OPENAI_API_KEY`, provider `openai`, and model exactly `gpt-5-mini`. Reuse the frozen bundle, four arms, five repetitions, temperature, grader contract, and run store. Never silently fall back from GPT-5-mini to Gemma or another OpenAI model.

- [ ] **Step 4: Extend the report comparison**

Show Gemma vs GPT-5-mini quality, variance, tokens, latency, fallback rate, and cost estimate by arm. Clearly separate provider effects from persona and RAG lifts.

- [ ] **Step 5: Verify without making a paid call**

```bash
npx tsx --test tests/amyHoodEvaluationV3Runner.test.ts
npm run lint
git diff --check
```

Expected: fake-provider tests prove the gate and 20-cell schedule; no network call occurs in automated tests.

- [ ] **Step 6: Run GPT-5-mini only after a real Gemma report passes**

```bash
npx tsx server/runAmyHoodDecisionAdvisor.ts evaluation:v3 --provider openai --model gpt-5-mini --repetitions 5
```

Expected: command refuses to start if any Gemma gate or credential is missing; otherwise it creates a separately pinned 20-cell comparison run.

- [ ] **Step 7: Commit the provider gate**

```bash
git add server/evaluationV3/providerGate.ts server/evaluationV3/runner.ts server/evaluationV3/report.ts tests/amyHoodEvaluationV3Runner.test.ts
git commit -m "feat: gate GPT-5-mini advisor comparison"
```
