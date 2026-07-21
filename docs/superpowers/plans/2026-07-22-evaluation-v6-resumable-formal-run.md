# Evaluation v6 Resumable Formal Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete a resumable 30-scenario × 3-arm × 5-repetition Evaluation v6 workflow that activates 450 individual grades, 225 pair grades, and an HTML report.

**Architecture:** Preserve the current run files as answer-level checkpoints, split local individual Judge drafts by repetition, then add a deterministic aggregation step that validates and activates all 450 grades. A small formal-run orchestrator records one experiment group and resumes each stage in order using candidate port 8080, embedding port 8081, and Judge port 8082.

**Tech Stack:** TypeScript 5.8, Node test runner, tsx, llama.cpp OpenAI-compatible APIs, existing atomic JSON stores.

## Global Constraints

- Keep Evaluation v6 scenarios, keys, scoring, memory content, and all v5 files unchanged.
- Preserve all existing completed answers and grades when resuming.
- Fail closed when model IDs or pinned hashes change.
- Do not modify unrelated dirty prompt, report, run, or retrieval-cache files.
- Follow the repository Test Plan format: one happy path, exactly three realistic edge cases, and safe failure paths.

---

### Task 1: Repetition-scoped individual Judge checkpoints

**Files:**
- Modify: `server/evaluationV6/localJudge.ts`
- Test: `tests/amyHoodEvaluationV6LocalJudge.test.ts`

**Interfaces:**
- Consumes: `runEvaluationV6LocalJudge({ root, experimentGroupId, repetition, baseUrl })`
- Produces: a separate draft for each repetition and a returned 90-grade result without activating a partial formal batch.

- [ ] **Step 1: Write the failing test**

Add a test that invokes repetition 1 and repetition 2 for one group and verifies their draft paths do not collide. The test must fail against the current shared `individual.json` checkpoint.

- [ ] **Step 2: Run test to verify RED**

Run: `npx tsx --test tests/amyHoodEvaluationV6LocalJudge.test.ts`

Expected: FAIL because repetition 2 sees a stale packet batch or overwrites the first active batch.

- [ ] **Step 3: Implement the minimal checkpoint change**

Add the repetition to the individual draft identity and path, for example `individual-repetition-1.json`. Keep calibration and pair checkpoint paths unchanged.

- [ ] **Step 4: Run test to verify GREEN**

Run: `npx tsx --test tests/amyHoodEvaluationV6LocalJudge.test.ts`

Expected: all tests pass.

### Task 2: Deterministic 450-grade aggregation

**Files:**
- Modify: `server/evaluationV6/judge.ts`
- Modify: `server/evaluationV6/localJudge.ts`
- Test: `tests/amyHoodEvaluationV6Judge.test.ts`
- Test: `tests/amyHoodEvaluationV6LocalJudge.test.ts`

**Interfaces:**
- Produces: `activateEvaluationV6FormalIndividualGrades(root, experimentGroupId, repetitionGrades)`.
- Guarantees: exactly 450 unique grades, exact packet hashes, one 450-packet batch hash, and atomic active-pointer update.

- [ ] **Step 1: Write failing aggregation tests**

Cover the happy path plus exactly these three edge cases: repetitions supplied out of order, duplicate packet IDs, and one missing 90-grade repetition. Verify duplicate and incomplete inputs do not replace the current active pointer.

- [ ] **Step 2: Run tests to verify RED**

Run: `npx tsx --test tests/amyHoodEvaluationV6Judge.test.ts tests/amyHoodEvaluationV6LocalJudge.test.ts`

Expected: FAIL because no formal aggregation interface exists.

- [ ] **Step 3: Implement aggregation**

Export all 450 blind packets, merge the five 90-grade drafts by packet ID, validate every score and packet hash through the existing import validation, and activate only the complete merged batch. Change `runEvaluationV6LocalJudge` so a single repetition saves its checkpoint without activating a 90-grade batch when the group contains 15 runs.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `npx tsx --test tests/amyHoodEvaluationV6Judge.test.ts tests/amyHoodEvaluationV6LocalJudge.test.ts`

Expected: all tests pass.

### Task 3: Formal-run orchestration and service pinning

**Files:**
- Create: `server/evaluationV6/formalRun.ts`
- Modify: `server/personaPipeline/modelClient.ts`
- Modify: `server/runAmyHoodEvaluationV6.ts`
- Modify: `package.json`
- Create: `tests/amyHoodEvaluationV6FormalRun.test.ts`

**Interfaces:**
- Produces: `runEvaluationV6Formal(options)` with candidate, embedding, Judge URLs, optional group ID, and HTML path.
- CLI: `evaluation:v6:formal -- --candidate-base-url ... --embedding-base-url ... --judge-base-url ... --html ... [--group ...]`.

- [ ] **Step 1: Write the failing orchestration test**

The Test Plan must verify a complete workflow, resume after a partial answer stage, resume after partial Judge work, reuse an explicit group ID, and fail safely on stale service/model identity.

- [ ] **Step 2: Run test to verify RED**

Run: `npx tsx --test tests/amyHoodEvaluationV6FormalRun.test.ts`

Expected: FAIL because the formal orchestrator and CLI command do not exist.

- [ ] **Step 3: Add explicit local model URL support**

Extend `createModelClient` options with an optional `baseUrl` and model override so formal execution can pin the response server without mutating global environment variables.

- [ ] **Step 4: Implement the formal orchestrator and CLI**

Create or load the group, complete 15 runs, Judge repetitions 1 through 5, aggregate 450 grades, Judge 225 pairs, and write the HTML report. Persist a formal checkpoint containing the group ID and all service/model identities; validate it on every resume.

- [ ] **Step 5: Run test to verify GREEN**

Run: `npx tsx --test tests/amyHoodEvaluationV6FormalRun.test.ts`

Expected: all tests pass.

### Task 4: Full verification and live preflight

**Files:**
- Modify only if verification exposes an in-scope defect.

**Interfaces:**
- Verifies all Evaluation v6 and adjacent policy-memory contracts.

- [ ] **Step 1: Run static and targeted verification**

Run:

```bash
npm run lint
npm run evaluation:v6:test
npm run advisor:policy-memory:test
npm run build
```

Expected: all commands exit 0; Vite may emit only its existing large-chunk warning.

- [ ] **Step 2: Preflight the three services**

Run read-only `/models` checks for ports 8080, 8081, and 8082. Verify BGE-M3 embedding dimension through the existing client preflight.

- [ ] **Step 3: Start or resume the formal run**

Run:

```bash
npm run evaluation:v6:formal -- \
  --candidate-base-url http://127.0.0.1:8080/v1 \
  --embedding-base-url http://127.0.0.1:8081/v1 \
  --judge-base-url http://127.0.0.1:8082/v1 \
  --html docs/reports/2026-07-22-amy-hood-evaluation-v6-formal.html
```

Expected: the command reports the experiment group and current/completed stage. If the long live run is interrupted, the same command resumes it.

