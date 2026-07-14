# Amy Hood Decision Advisor Phase 5 Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a two-pass Amy Hood Decision Advisor runtime that converts a new management situation into a traceable decision plan and then a concise first-person CFO recommendation.

**Architecture:** The runtime pins one prompt version, memory release, retrieval configuration, model, and temperature per run. Pass 1 generates a structured `DecisionPlan`; deterministic validation checks policy/evidence coverage. Pass 2 renders the user answer without normal-response citations, while the audit record retains every artifact ID and fallback decision.

**Tech Stack:** TypeScript 5.8, Express, Gemma 4 local OpenAI-compatible API, JSON persistence, `tsx --test`.

## Global Constraints

- Gemma 4 on port 8080 is the default pipeline model; GPT-5-mini is opt-in only after the Gemma gate passes.
- Keep the main prompt thin: role, decision procedure, output contract, boundaries, and uncertainty behavior.
- Retrieve structured policy/reflection/event artifacts, not the old 30 raw chunks.
- Render as Amy Hood in first person; keep the unofficial-simulation disclaimer permanently in UI, not repeated in every answer.
- Do not show citations in the normal answer; retain evidence IDs and source metadata in audit data.
- Never invent a persona-specific principle when retrieved support is weak; label and use a generic CFO fallback.
- Follow the AGENTS.md Test Plan format.

---

### Task 1: Define advisor request, plan, answer, and run contracts

**Files:**
- Modify: `shared/amyHoodDecisionAdvisor.ts`
- Create: `tests/amyHoodDecisionAdvisor.test.ts`

**Interfaces:**
- Produces: `DecisionContext`, `DecisionPlan`, `DecisionAdvisorAnswer`, `AdvisorRunRecord`, and `AdvisorRunStatus`.

- [ ] **Step 1: Write the test plan and failing contract test**

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - a concrete management scenario produces a validated plan, first-person answer, and auditable pinned run.
 *
 * 2. Edge Cases:
 *    - weak Amy-specific evidence produces an explicit generic CFO fallback.
 *    - an optional user constraint narrows the recommendation without changing stored memory.
 *    - a successful retry resumes the same run ID after malformed first-pass JSON.
 *
 * 3. Failure Path:
 *    - empty scenarios, unavailable releases, repeated malformed output, or model failure leave a resumable failed run without a partial answer.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { AdvisorRunRecord, DecisionContext } from '../shared/amyHoodDecisionAdvisor';

test('happy: advisor run pins every reproducibility input', () => {
  const context = { scenario: 'Choose whether to accelerate AI capacity investment.' } as DecisionContext;
  const run = {
    scenario: context.scenario,
    promptVersion: '1.0.0', memoryReleaseVersion: '1.0.0',
    model: 'gemma-4', temperature: 0.2,
  } as AdvisorRunRecord;
  assert.equal(run.scenario, context.scenario);
});
```

- [ ] **Step 2: Run and confirm missing types**

```bash
npx tsx --test tests/amyHoodDecisionAdvisor.test.ts
```

- [ ] **Step 3: Add the runtime contracts**

```ts
export type DecisionContext = {
  scenario: string;
  domain?: DecisionDomain;
  requiredDecision?: string;
  objectives?: string[];
  options?: string[];
  constraints?: string[];
  timeHorizon?: string;
  knownMetrics?: Record<string, string | number>;
  unknowns?: string[];
  riskTolerance?: string;
  requestedOutput?: string;
};

export type DecisionPlan = {
  decisionFrame: string;
  criteriaInPriorityOrder: string[];
  optionAssessments: Array<{ option: string; benefit: string; risk: string; policyFit: string }>;
  recommendation: string;
  mainTradeoff: string;
  risks: string[];
  conditions: string[];
  reversalSignals: string[];
  actions: string[];
  policyIds: string[];
  reflectionIds: string[];
  eventIds: string[];
  counterexampleEventIds: string[];
  evidenceSpanIds: string[];
  evidenceCoverage: 'high' | 'medium' | 'low';
  genericFallbackUsed: boolean;
};

export type DecisionAdvisorAnswer = {
  answer: string;
  decisionPlan: DecisionPlan;
};

export type AdvisorRunStatus = 'queued' | 'retrieving' | 'planning' | 'rendering' | 'completed' | 'failed';

export type AdvisorRunRecord = {
  id: string;
  status: AdvisorRunStatus;
  scenario: string;
  sourceRegistryVersion: string;
  eventDatasetVersion: string;
  promptVersion: string;
  memoryReleaseVersion: string;
  evaluationBundleVersion: string | null;
  retrievalConfigHash: string;
  model: string;
  modelBuild: string;
  temperature: number;
  contextBudget: number;
  retrievedArtifactIds: string[];
  packedArtifactIds: string[];
  droppedArtifactIds: string[];
  decisionPlan: DecisionPlan | null;
  answer: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};
```

- [ ] **Step 4: Rerun and commit**

```bash
npx tsx --test tests/amyHoodDecisionAdvisor.test.ts
git add shared/amyHoodDecisionAdvisor.ts tests/amyHoodDecisionAdvisor.test.ts
git commit -m "feat: define advisor runtime contracts"
```

### Task 2: Validate scenarios and build the thin versioned main prompt

**Files:**
- Create: `agent_prompts/prompts/amy-hood-decision-advisor.md`
- Create: `server/decisionAdvisor/decisionContext.ts`
- Create: `server/decisionAdvisor/advisorPrompt.ts`
- Modify: `tests/amyHoodDecisionAdvisor.test.ts`

**Interfaces:**
- Produces: `validateDecisionContext(context)` and `buildAdvisorMessages(context, packedMemory, prompt)`.

- [ ] **Step 1: Add failing context and prompt tests**

Assert a normal scenario, a valid optional constraint, and deterministic message sections. Reject blank/whitespace scenarios and over-budget scenario text with clear errors.

- [ ] **Step 2: Write the main prompt**

Keep it under the 1,500-token budget and include only:

```text
role and first-person voice
condition -> priority -> action -> exception -> reversal procedure
Amy-specific evidence threshold and generic CFO fallback
structured DecisionPlan output contract
no normal-answer citations
no claim of official Microsoft representation
```

Do not embed biographies, full events, quotations, or fixed answers in the prompt.

- [ ] **Step 3: Implement deterministic message construction**

Use separate system messages for the main prompt and memory contract, then one user message for scenario/constraints. Serialize memory with explicit `POLICIES`, `REFLECTIONS`, `EVENTS`, and `COUNTEREXAMPLE` headings and artifact IDs.

- [ ] **Step 4: Verify and commit**

```bash
npx tsx --test tests/amyHoodDecisionAdvisor.test.ts
git add agent_prompts/prompts/amy-hood-decision-advisor.md server/decisionAdvisor/decisionContext.ts server/decisionAdvisor/advisorPrompt.ts tests/amyHoodDecisionAdvisor.test.ts
git commit -m "feat: add thin advisor main prompt"
```

### Task 3: Implement the two-pass runner and evidence-coverage fallback

**Files:**
- Create: `server/decisionAdvisor/advisorRunner.ts`
- Create: `server/decisionAdvisor/decisionPlanValidator.ts`
- Modify: `tests/amyHoodDecisionAdvisor.test.ts`

**Interfaces:**
- Produces: `runDecisionAdvisor(context, config, deps)` with injected retriever and model client.

- [ ] **Step 1: Add failing runner tests**

Test a full evidence-backed run, low-coverage fallback, user constraint, one malformed plan followed by valid retry, two malformed plans, and model transport failure. Assert Pass 2 is never called when Pass 1 cannot be validated.

- [ ] **Step 2: Implement coverage rules**

Set `high` when the recommendation cites an approved policy, reflection, two supporting events, and a counterexample; `medium` with an approved policy and one supporting event; otherwise `low`. On empty or low-specificity retrieval, perform one adjacent-domain retrieval before fallback. If coverage remains low, force `genericFallbackUsed: true`, remove unsupported Amy-specific claims, and state the recommendation as general CFO judgment in the plan.

- [ ] **Step 3: Implement Pass 1**

Retrieve and pack memory, request JSON, validate every returned ID against the pack, require ordered criteria and reversal signals, then retry once with validation errors. Do not silently repair unsupported IDs. When applicable policies conflict, require `mainTradeoff` to explain the conflict and `conditions`/`reversalSignals` to state which recommendation applies under each boundary.

- [ ] **Step 4: Implement Pass 2**

Render a concise first-person answer from the validated plan. Require a clear recommendation, reasoning in criterion order, key conditions, next actions, and reversal signals. Keep source URLs and evidence IDs out of the normal answer.

- [ ] **Step 5: Run and commit**

```bash
npx tsx --test tests/amyHoodDecisionAdvisor.test.ts
git add server/decisionAdvisor/advisorRunner.ts server/decisionAdvisor/decisionPlanValidator.ts tests/amyHoodDecisionAdvisor.test.ts
git commit -m "feat: run two-pass Amy Hood advisor"
```

### Task 4: Persist resumable runs and pin all runtime inputs

**Files:**
- Create: `server/decisionAdvisor/advisorRunStore.ts`
- Modify: `server/decisionAdvisor/advisorRunner.ts`
- Modify: `tests/amyHoodDecisionAdvisor.test.ts`

**Interfaces:**
- Produces: `createRun`, `transitionRun`, `loadRun`, `listRuns`, and `resumeRun`.

- [ ] **Step 1: Add failing state-machine tests**

Assert the normal state sequence, immutable pin fields, same-ID resume, and newest-first listing. Reject invalid transitions, mutation of prompt/release/model settings after creation, resume of a completed run, and partial answers on failure.

- [ ] **Step 2: Implement atomic state persistence**

Allowed transitions:

```text
queued -> retrieving -> planning -> rendering -> completed
retrieving | planning | rendering -> failed
failed -> retrieving
```

Persist after each transition. On any exception, set `status=failed`, preserve audit IDs gathered so far, set `answer=null`, and store a sanitized error.

- [ ] **Step 3: Pin reproducibility inputs**

At creation, resolve the source registry, event dataset, active prompt, memory release, and optional evaluation bundle once. Hash retrieval weights/top-k/token-budget configuration. Store exact model name/build, temperature, and context budget; resume must reuse these values.

- [ ] **Step 4: Verify and commit**

```bash
npx tsx --test tests/amyHoodDecisionAdvisor.test.ts
git add server/decisionAdvisor/advisorRunStore.ts server/decisionAdvisor/advisorRunner.ts tests/amyHoodDecisionAdvisor.test.ts
git commit -m "feat: persist resumable advisor runs"
```

### Task 5: Expose server-only advisor APIs

**Files:**
- Create: `server/decisionAdvisor/advisorRoutes.ts`
- Modify: `server/index.ts`
- Modify: `package.json`
- Modify: `tests/amyHoodDecisionAdvisor.test.ts`

**Interfaces:**
- API: `POST /api/decision-advisor/runs`, `GET /api/decision-advisor/runs`, `GET /api/decision-advisor/runs/:id`, and `POST /api/decision-advisor/runs/:id/resume`.

- [ ] **Step 1: Add failing route tests**

Start an isolated Express app. Assert create/get/list/resume responses, 400 for invalid input, 404 for unknown run, 409 for completed-run resume, and 503 when active prompt or memory release is unavailable. Verify responses never include raw answer keys or holdout event bodies.

- [ ] **Step 2: Implement routes and mount them**

Return JSON for every route, including failures. Keep evaluation secrets outside route dependency objects. Use async error handling so rejected promises do not produce empty responses.

- [ ] **Step 3: Add the runtime test script**

```json
"advisor:runtime:test": "tsx --test tests/amyHoodDecisionAdvisor.test.ts"
```

- [ ] **Step 4: Run Phase 5 verification**

```bash
npm run advisor:runtime:test
npx tsx --test tests/amyHoodAdvisorPolicyMemory.test.ts
npm run evaluation:test
npm run lint
git diff --check
```

Expected: all runtime and regression tests pass; an unavailable dependency returns JSON and leaves a resumable run.

- [ ] **Step 5: Commit Phase 5**

```bash
git add server/decisionAdvisor/advisorRoutes.ts server/index.ts package.json tests/amyHoodDecisionAdvisor.test.ts
git commit -m "feat: expose Amy Hood decision advisor API"
```
