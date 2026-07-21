# Evaluation v5 Local Gemma Judge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Score one completed Evaluation v5 repetition—90 anonymized responses—with the Gemma 4 12B OpenAI-compatible server on port 8082.

**Architecture:** Generalize the existing blind packet exporter and grade importer without weakening the 450-response report gate. Add a focused local judge that performs rationale-first and score-second calls, validates strict JSON, checkpoints each grade, and resumes safely. Expose the workflow through one `judge-local` CLI command.

**Tech Stack:** TypeScript, Node test runner, native `fetch`, llama-server OpenAI-compatible API, existing canonical JSON and atomic JSON stores.

## Global Constraints

- The judge receives no arm, provider, model, run, RAG, retrieval, Policy, source, executive, or historical identity metadata.
- The first smoke test scores repetition 1 only: three complete runs and 90 individual responses.
- The existing unfiltered export still requires 15 complete runs and produces 450 packets.
- The formal Evaluation v5 report still requires 450 individual and 225 pair grades.
- Temperature is `0`; malformed score JSON receives at most one repair call.
- Draft checkpoints are resumable, but stale packet, model, or prompt hashes fail closed.

---

### Task 1: Partial Blind Packet and Grade Batch Contracts

**Files:**
- Modify: `shared/amyHoodEvaluationV5.ts`
- Modify: `server/evaluationV5/judge.ts`
- Test: `tests/amyHoodEvaluationV5LocalJudge.test.ts`

**Interfaces:**
- Produces: `exportEvaluationV5JudgePackets(root, groupId, { repetition?: number })`
- Produces: `EvaluationV5JudgeProvenance.judgeProvider = 'codex' | 'openai' | 'local'`
- Changes: `importEvaluationV5Grades` requires exactly the exported packet count.

- [ ] **Step 1: Write the failing contract tests**

Add a test file beginning with this exact plan:

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - Export 90 blind packets for one complete repetition and import 90 local grades.
 * 2. Edge Cases:
 *    - Preserve the existing 450-packet export when no repetition is supplied.
 *    - Accept fenced score JSON through the local judge parser.
 *    - Resume a matching checkpoint without calling the judge again.
 * 3. Failure Path:
 *    - Preserve the draft and active pointer when model invocation or score validation fails.
 */
```

Assert that repetition `1` exports 90 packets, every private link has repetition `1`, `assertEvaluationV5JudgePacketsBlind` passes, and 90 `judgeProvider: 'local'` grades import successfully.

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
npx tsx --test tests/amyHoodEvaluationV5LocalJudge.test.ts
```

Expected: compilation or assertion failure because repetition export and local provenance are unsupported.

- [ ] **Step 3: Generalize run selection and import count**

Implement an optional filter while retaining the existing default:

```ts
type JudgeExportOptions = { repetition?: 1 | 2 | 3 | 4 | 5 };

const loadCompleteRuns = async (root: string, groupId: string, options: JudgeExportOptions = {}) => {
  const all = (await listEvaluationV5Runs(root)).filter((run) => run.experimentGroupId === groupId);
  const runs = options.repetition === undefined
    ? all
    : all.filter((run) => run.repetition === options.repetition);
  const expectedRuns = options.repetition === undefined ? 15 : 3;
  if (runs.length !== expectedRuns || runs.some(({ status, answers }) =>
    status !== 'complete' || answers.length !== 30)) {
    throw new Error(`Evaluation v5 judge export requires ${expectedRuns} complete runs`);
  }
  return runs.sort((left, right) => left.runId.localeCompare(right.runId));
};
```

Pass the options into individual export. In `importGrades`, read the packet file first and use `packets.length` as `expectedCount`; keep pair import behavior symmetrical. Add `'local'` to shared provenance and runtime validation.

- [ ] **Step 4: Run contract and existing judge tests**

```bash
npx tsx --test tests/amyHoodEvaluationV5LocalJudge.test.ts tests/amyHoodEvaluationV5Judge.test.ts
```

Expected: partial export tests pass and existing 450/225 tests remain green.

- [ ] **Step 5: Commit the contract**

```bash
git add shared/amyHoodEvaluationV5.ts server/evaluationV5/judge.ts tests/amyHoodEvaluationV5LocalJudge.test.ts
git commit -m "feat: support partial Evaluation v5 judge batches"
```

### Task 2: Rationale-first Local Judge with Resume

**Files:**
- Create: `server/evaluationV5/localJudge.ts`
- Modify: `server/evaluationV5/paths.ts`
- Test: `tests/amyHoodEvaluationV5LocalJudge.test.ts`

**Interfaces:**
- Produces: `runEvaluationV5LocalJudge(options): Promise<LocalJudgeResult>`
- Consumes: 90 `EvaluationV5JudgePacket` objects from Task 1.

- [ ] **Step 1: Add failing happy, edge, and failure tests**

Use dependency injection for `fetch`, `now`, and packet export. Test model discovery, a one-sentence rationale response, fenced JSON score response, checkpoint resume, and a second-packet failure that leaves the first grade in the draft without creating an active grade batch.

- [ ] **Step 2: Run the focused test and confirm RED**

```bash
npx tsx --test tests/amyHoodEvaluationV5LocalJudge.test.ts
```

Expected: module-not-found failure for `server/evaluationV5/localJudge.ts`.

- [ ] **Step 3: Implement strict response parsing**

Create:

```ts
export const parseLocalJudgeScore = (text: string) => {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const value = JSON.parse(cleaned) as Record<string, unknown>;
  const anchors = ['action', 'priority', 'guardrails', 'reversal'] as const;
  const allowed = new Set(['aligned', 'partial', 'missing', 'conflict']);
  if (!Number.isInteger(value.score) || Number(value.score) < 1 || Number(value.score) > 10
    || !value.anchorFindings || typeof value.anchorFindings !== 'object'
    || anchors.some((anchor) => !allowed.has(
      String((value.anchorFindings as Record<string, unknown>)[anchor]),
    ))) throw new Error('local judge score response is invalid');
  return value as Pick<EvaluationV5Grade, 'score' | 'anchorFindings'>;
};
```

- [ ] **Step 4: Implement model discovery, two calls, repair, and checkpoint**

`GET {baseUrl}/models` must resolve exactly one non-empty ID. Each packet receives:

```ts
const rationaleSystem = 'You are an independent blind CFO decision-alignment evaluator. Do not infer the generating system. Return one Korean sentence and no numeric score.';
const scoreSystem = 'Score only from the frozen packet and prior rationale. Return JSON only with score and anchorFindings for action, priority, guardrails, reversal.';
```

POST to `{baseUrl}/chat/completions` with `temperature: 0`, `stream: false`, and `max_tokens: 300` for rationale or `220` for score. Hash both prompts. Atomically save after each grade to `evaluation/v5/judge/local-drafts/<group>/repetition-<n>.json`. Reuse only entries with matching packet, model, and prompt hashes.

- [ ] **Step 5: Import only a complete 90-grade batch**

After all packets pass, call `importEvaluationV5Grades`. Return group, repetition, model, packet count, resumed count, graded count, batch hash, and mean AAS. Never import from a partial draft.

- [ ] **Step 6: Run local judge tests**

```bash
npx tsx --test tests/amyHoodEvaluationV5LocalJudge.test.ts
```

Expected: 5 tests pass—one happy path, exactly three edge cases, and one failure path.

- [ ] **Step 7: Commit the local judge**

```bash
git add server/evaluationV5/localJudge.ts server/evaluationV5/paths.ts tests/amyHoodEvaluationV5LocalJudge.test.ts
git commit -m "feat: add resumable local Gemma judge"
```

### Task 3: CLI Wiring and Regression Verification

**Files:**
- Modify: `server/runAmyHoodEvaluationV5.ts`
- Modify: `tests/amyHoodEvaluationV5Contract.test.ts`

**Interfaces:**
- Adds command: `judge-local --group <id> --repetition 1 --base-url http://127.0.0.1:8082/v1`

- [ ] **Step 1: Write a failing CLI contract test**

Assert missing group, invalid repetition, and missing base URL fail clearly; assert valid input forwards normalized options to the local judge dependency.

- [ ] **Step 2: Run the CLI test and confirm RED**

```bash
npx tsx --test tests/amyHoodEvaluationV5Contract.test.ts
```

Expected: `judge-local` is rejected as an unknown command.

- [ ] **Step 3: Wire the command**

Parse `--repetition` as an integer from 1 through 5, normalize the base URL by removing a trailing slash, and call `runEvaluationV5LocalJudge`. Update the unknown-command help text to include `judge-local`.

- [ ] **Step 4: Run all Evaluation v5 tests and type checking**

```bash
npm run evaluation:v5:test
npm run lint
git diff --check
```

Expected: all tests pass, TypeScript exits zero, and no whitespace errors are reported.

- [ ] **Step 5: Verify the live 8082 contract without starting grading**

```bash
curl -fsS http://127.0.0.1:8082/v1/models
```

Expected: exactly one model with a non-empty ID matching the served Gemma 4 12B artifact. If unavailable, report the exact command the user can rerun after starting the server; do not fake a grade batch.

- [ ] **Step 6: Commit the CLI**

```bash
git add server/runAmyHoodEvaluationV5.ts tests/amyHoodEvaluationV5Contract.test.ts
git commit -m "feat: expose local Evaluation v5 judge CLI"
```
