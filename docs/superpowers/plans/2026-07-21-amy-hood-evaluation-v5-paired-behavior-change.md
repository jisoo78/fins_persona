# Amy Hood Evaluation V5 Paired Behavior-Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a frozen 30-question benchmark from 15 anonymized public CFO events, run Amy Prompt, Policy RAG, and Full RAG five times each, and measure individual action alignment plus pair-level behavior change.

**Architecture:** Preserve Evaluation V4 and add a versioned `evaluation/v5` data tree with focused TypeScript modules under `server/evaluationV5`. Reuse the active Amy prompt, policy-coverage gate, measured BGE-M3 index, shared hybrid retriever, and RAG renderer, while keeping external benchmark provenance and answer keys outside the Amy memory index and generation prompt. Store 15 run records per experiment group, export blind individual and pair judge packets, and generate machine-readable plus Korean-first HTML reports.

**Tech Stack:** TypeScript 5.8, Node.js test runner through `tsx --test`, local OpenAI-compatible E4B inference on port 8080, BGE-M3 embeddings on port 8081, existing atomic JSON store, existing shared hybrid RAG engine, HTML string rendering.

## Global Constraints

- Preserve all Evaluation V4 source, scenario, run, grade, and report artifacts without modification.
- V5 version is exactly `5.0.0`; it has one benchmark stage and exactly 30 scenarios grouped into 15 pairs.
- Use exactly three arms: `amy_prompt`, `amy_policy_rag`, and `amy_full_rag`; do not create a generic CFO run.
- Use exactly five repetitions, yielding 15 runs and 450 expected answers.
- Keep company, executive, product, exact date, actual historical action, outcome, pair phase, and pair ID out of the generation-model input.
- Keep external benchmark sources, sealed provenance, scenario keys, and pair keys out of the Amy RAG index.
- Use query-dependent retrieval for both RAG arms and never downgrade an empty or failed retrieval to Prompt-only behavior.
- Use no tool calling during generation.
- Follow TDD: every new or significantly modified test file starts with one Happy Path, exactly three realistic Edge Cases by default, and applicable Failure Paths.
- New source facts must be traceable to reviewed web evidence; designed changed-condition facts must be labeled counterfactual rather than historical.
- Generate no V5 success result until the gradeable individual answers and complete pairs have their required grades.

---

## File Structure

### Contracts and validation

- Create `shared/amyHoodEvaluationV5.ts`: V5 constants, public/sealed/run/judge/report types, and strict candidate-response parser.
- Create `server/evaluationV5/paths.ts`: all V5 public, sealed, source, run, cache, judge, grade, and report paths.
- Create `server/evaluationV5/sourceSet.ts`: external-source registry validation and Amy-memory collision checks.
- Create `server/evaluationV5/scenarioSet.ts`: 30-scenario, 15-pair, domain balance, change-type balance, anonymity, approval, mapping, and manifest validation.
- Create `tests/helpers/evaluationV5Fixture.ts`: valid source and bundle fixtures shared by V5 tests.
- Create `tests/amyHoodEvaluationV5Contract.test.ts`, `tests/amyHoodEvaluationV5SourceSet.test.ts`, and `tests/amyHoodEvaluationV5ScenarioSet.test.ts`.

### Frozen benchmark data

- Create `evaluation/v5/public/scenarios.json` and `evaluation/v5/public/reviews.json`.
- Create `evaluation/v5/sealed/event-provenance.json`, `scenario-keys.json`, `pair-keys.json`, and `manifest.json`.
- Create `evaluation/v5/sources/registry.json`, 16 raw capture metadata JSON files, and 16 normalized reviewed excerpts. The Costco event has an official announcement and a separate attributable CFO transcript.
- Reuse content from the ten already reviewed V4 source excerpts by copying it into the independently hashed V5 source tree; add the five reviewed IBM, Amazon, Costco, Disney, and Cisco excerpts.

### Runtime and grading

- Create `server/evaluationV5/context.ts`, `prompt.ts`, `retrievalCache.ts`, `runStore.ts`, and `runner.ts`.
- Create `server/evaluationV5/judge.ts` for individual AAS and pair-level behavior-transition packets and imports.
- Create `server/evaluationV5/report.ts` for metrics, success gates, JSON persistence, and HTML output.
- Create `server/runAmyHoodEvaluationV5.ts` and add `evaluation:v5:test` plus `evaluation:v5:run` scripts to `package.json`.
- Create `tests/amyHoodEvaluationV5Runner.test.ts`, `tests/amyHoodEvaluationV5Judge.test.ts`, `tests/amyHoodEvaluationV5Report.test.ts`, and test helpers for complete runs and grades.

---

### Task 1: Define V5 Contracts and Strict Bundle Validation

**Files:**
- Create: `shared/amyHoodEvaluationV5.ts`
- Create: `server/evaluationV5/paths.ts`
- Create: `server/evaluationV5/sourceSet.ts`
- Create: `server/evaluationV5/scenarioSet.ts`
- Create: `tests/helpers/evaluationV5Fixture.ts`
- Create: `tests/amyHoodEvaluationV5Contract.test.ts`
- Create: `tests/amyHoodEvaluationV5SourceSet.test.ts`
- Create: `tests/amyHoodEvaluationV5ScenarioSet.test.ts`

**Interfaces:**
- Consumes: `DecisionDomain`, `AmyHoodRetrievalTrace`, `canonicalJson`, `writeJsonAtomic`, `canonicalizeSourceUrl`, and the advisor source registry.
- Produces: `EVALUATION_V5_DOMAINS`, `EVALUATION_V5_ARMS`, `EvaluationV5BundleInput`, `EvaluationV5Run`, `parseEvaluationV5CandidateResponse(text: string)`, `validateEvaluationV5ExternalSources(registry, amySources, normalizedContentByPath)`, `validateEvaluationV5ScenarioBundle(input: EvaluationV5BundleInput)`, `freezeEvaluationV5Bundle(root: string, input: EvaluationV5BundleInput)`, and `loadEvaluationV5Bundle(root: string)`.

- [ ] **Step 1: Write contract and validator tests first**

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - Accept version 5.0.0 JSON and one complete 30-scenario, 15-pair benchmark bundle.
 * 2. Edge Cases:
 *    - Accept shuffled public and sealed records.
 *    - Accept one reviewed secondary transcript when an official event source is also present.
 *    - Accept anonymized ratios that preserve materiality without exact famous amounts.
 * 3. Failure Path:
 *    - Reject unknown response fields, identity leakage, pair imbalance, missing mappings, and stale hashes.
 */
test('happy: validates thirty scenarios in fifteen pairs', () => {
  const validated = validateEvaluationV5ScenarioBundle(evaluationV5BundleFixture());
  assert.equal(validated.scenarios.length, 30);
  assert.equal(validated.pairs.length, 15);
  assert.deepEqual(validated.changeTypeCounts, {
    guardrail_adjustment: 5,
    resource_reallocation: 5,
    pause_or_reverse: 5,
  });
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npx tsx --test tests/amyHoodEvaluationV5Contract.test.ts tests/amyHoodEvaluationV5SourceSet.test.ts tests/amyHoodEvaluationV5ScenarioSet.test.ts
```

Expected: FAIL because `shared/amyHoodEvaluationV5.ts` and `server/evaluationV5/*` do not exist.

- [ ] **Step 3: Implement exact V5 constants and public/sealed contracts**

```ts
export const EVALUATION_V5_ARMS = [
  'amy_prompt', 'amy_policy_rag', 'amy_full_rag',
] as const;
export const EVALUATION_V5_PHASES = ['initial', 'changed'] as const;
export const EVALUATION_V5_CHANGE_TYPES = [
  'guardrail_adjustment', 'resource_reallocation', 'pause_or_reverse',
] as const;

export type EvaluationV5Scenario = {
  id: string;
  pairId: string;
  domain: DecisionDomain;
  phase: 'initial' | 'changed';
  title: string;
  situation: string;
  decisionQuestion: string;
};

export type EvaluationV5PairKey = {
  pairId: string;
  initialScenarioId: string;
  changedScenarioId: string;
  expectedResponseType: 'guardrail_adjustment' | 'resource_reallocation' | 'pause_or_reverse';
  primaryChangedSignal: string;
  supportingChangedSignal: string | null;
  expectedActionDelta: string;
  invariants: string[];
  gradingAnchors: string[];
};
```

The candidate parser must allow exactly `action`, `priorities`, `guardrails`, `reversalSignals`, and `rationale`; priorities contain exactly three non-empty strings, and both boundary arrays contain at least one non-empty string.

- [ ] **Step 4: Implement source and bundle validators**

```ts
if (scenarios.length !== 30 || new Set(scenarios.map(({ id }) => id)).size !== 30) {
  throw new Error('Evaluation v5 requires exactly thirty unique scenarios');
}
if (pairs.length !== 15 || new Set(pairs.map(({ pairId }) => pairId)).size !== 15) {
  throw new Error('Evaluation v5 requires exactly fifteen unique pairs');
}
for (const domain of EVALUATION_V5_DOMAINS) {
  if (scenarios.filter((scenario) => scenario.domain === domain).length !== 6) {
    throw new Error(`Evaluation v5 domain requires six scenarios: ${domain}`);
  }
}
const expectedChangeCounts = Object.fromEntries(
  EVALUATION_V5_CHANGE_TYPES.map((type) => [type, 5]),
);
if (canonicalJson(changeTypeCounts) !== canonicalJson(expectedChangeCounts)) {
  throw new Error('Evaluation v5 requires five pairs per change type');
}
```

Validate exactly one `initial` and one `changed` scenario per pair, one event per pair, 15 unique events, one scenario key per scenario, one pair key per pair, complete approved reviews, source hashes, no Amy-memory URL/hash collision, and no public occurrence of sealed executive, organization, event, policy, action, source, or outcome identifiers.

- [ ] **Step 5: Run tests and verify GREEN**

Run:

```bash
npx tsx --test tests/amyHoodEvaluationV5Contract.test.ts tests/amyHoodEvaluationV5SourceSet.test.ts tests/amyHoodEvaluationV5ScenarioSet.test.ts
```

Expected: all V5 contract, source, and scenario tests pass.

- [ ] **Step 6: Commit Task 1**

```bash
git add shared/amyHoodEvaluationV5.ts server/evaluationV5/paths.ts server/evaluationV5/sourceSet.ts server/evaluationV5/scenarioSet.ts tests/helpers/evaluationV5Fixture.ts tests/amyHoodEvaluationV5Contract.test.ts tests/amyHoodEvaluationV5SourceSet.test.ts tests/amyHoodEvaluationV5ScenarioSet.test.ts
git commit -m "feat: add evaluation v5 bundle contracts"
```

### Task 2: Author and Freeze the 15-Event, 30-Scenario Dataset

**Files:**
- Create: `evaluation/v5/public/scenarios.json`
- Create: `evaluation/v5/public/reviews.json`
- Create: `evaluation/v5/sealed/event-provenance.json`
- Create: `evaluation/v5/sealed/scenario-keys.json`
- Create: `evaluation/v5/sealed/pair-keys.json`
- Create: `evaluation/v5/sealed/manifest.json`
- Create: `evaluation/v5/sources/registry.json`
- Create: `evaluation/v5/sources/raw/ext-salesforce-slack-2020.json`, `ext-adobe-figma-termination-2023.json`, `ext-alphabet-ai-capex-2024.json`, `ext-meta-ai-capex-2024.json`, `ext-netflix-paid-sharing-2024.json`, `ext-spotify-premium-price-2023.json`, `ext-intel-cost-reduction-2024.json`, `ext-meta-efficiency-2023.json`, `ext-apple-buyback-2024.json`, and `ext-salesforce-buyback-2022.json`
- Create: `evaluation/v5/sources/raw/ext-ibm-red-hat-2018.json`, `ext-amazon-ai-capex-2024.json`, `ext-costco-membership-fee-2024.json`, `ext-costco-membership-fee-cfo-2024.json`, `ext-disney-cost-reset-2023.json`, and `ext-cisco-capital-return-2022.json`
- Create: the matching 16 `.txt` files under `evaluation/v5/sources/normalized/`
- Test: `tests/amyHoodEvaluationV5ScenarioSet.test.ts`
- Test: `tests/amyHoodEvaluationV5SourceSet.test.ts`

**Interfaces:**
- Consumes: Task 1 validators and the active five approved Amy policy IDs already used in V4.
- Produces: one loadable, frozen V5 bundle with bundle hash and no generation-path identity leakage.

- [ ] **Step 1: Add a failing repository-data test**

```ts
test('happy: repository v5 bundle is frozen and loadable', async () => {
  const bundle = await loadEvaluationV5Bundle(process.cwd());
  assert.equal(bundle.scenarios.length, 30);
  assert.equal(bundle.pairs.length, 15);
  assert.match(bundle.manifest.bundleHash, /^[a-f0-9]{64}$/);
});
```

- [ ] **Step 2: Run the data test and verify RED**

Run:

```bash
npx tsx --test tests/amyHoodEvaluationV5ScenarioSet.test.ts
```

Expected: FAIL with a missing `evaluation/v5` artifact error.

- [ ] **Step 3: Create the exact pair inventory and response-type balance**

```text
AAS-V5-MA-01 Salesforce–Slack       guardrail_adjustment
AAS-V5-MA-02 Adobe–Figma            resource_reallocation
AAS-V5-MA-03 IBM–Red Hat            pause_or_reverse
AAS-V5-AI-01 Alphabet AI CapEx      guardrail_adjustment
AAS-V5-AI-02 Meta AI CapEx          resource_reallocation
AAS-V5-AI-03 Amazon AWS AI CapEx    pause_or_reverse
AAS-V5-PM-01 Netflix paid sharing   guardrail_adjustment
AAS-V5-PM-02 Spotify pricing        resource_reallocation
AAS-V5-PM-03 Costco membership fee  pause_or_reverse
AAS-V5-CE-01 Intel cost reset       guardrail_adjustment
AAS-V5-CE-02 Meta efficiency        resource_reallocation
AAS-V5-CE-03 Disney cost/content    pause_or_reverse
AAS-V5-SR-01 Apple capital return   guardrail_adjustment
AAS-V5-SR-02 Salesforce buyback     resource_reallocation
AAS-V5-SR-03 Cisco capital return   pause_or_reverse
```

For every pair, create IDs ending in `-A` and `-B`. A preserves decision-cutoff facts. B changes one primary signal and at most one supporting signal. Store those changes only in the sealed pair key; do not label A or B in the rendered model prompt.

- [ ] **Step 4: Add reviewed source capture metadata and normalized evidence**

Every raw capture file has this exact shape:

```json
{
  "captureMode": "reviewed_excerpt",
  "canonicalUrl": "https://www.ibm.com/investor/news/ibm-completes-acquisition-of-red-hat",
  "capturedAt": "2026-07-21T06:00:00.000Z",
  "sourceQuality": "official_primary"
}
```

Use `official_primary` for official company/IR material and `attributable_secondary_transcript` only for the Costco CFO transcript. The Costco event also retains its official announcement as primary evidence. Normalize source text as reviewed decision-time paraphrase with any direct quotation kept short and attributable.

- [ ] **Step 5: Build and write the frozen manifest through the validator**

Run:

```bash
npx tsx server/runAmyHoodEvaluationV5.ts freeze
npx tsx server/runAmyHoodEvaluationV5.ts check
```

Expected: `check` prints `scenarioCount: 30`, `pairCount: 15`, three event pairs per domain, five pairs per response-change type, and a 64-character bundle hash.

- [ ] **Step 6: Run source and scenario tests**

Run:

```bash
npx tsx --test tests/amyHoodEvaluationV5SourceSet.test.ts tests/amyHoodEvaluationV5ScenarioSet.test.ts
```

Expected: all tests pass, including public identity-leak checks and stale-manifest rejection.

- [ ] **Step 7: Commit Task 2**

```bash
git add evaluation/v5 tests/amyHoodEvaluationV5ScenarioSet.test.ts tests/amyHoodEvaluationV5SourceSet.test.ts
git commit -m "data: freeze evaluation v5 paired scenarios"
```

### Task 3: Implement Three-Arm, Five-Repetition Dynamic-RAG Execution

**Files:**
- Create: `server/evaluationV5/context.ts`
- Create: `server/evaluationV5/prompt.ts`
- Create: `server/evaluationV5/retrievalCache.ts`
- Create: `server/evaluationV5/runStore.ts`
- Create: `server/evaluationV5/runner.ts`
- Create: `tests/amyHoodEvaluationV5Runner.test.ts`

**Interfaces:**
- Consumes: `loadEvaluationV5Bundle`, `resolveEvaluationV4RagPin`, `readActivePromptVersion`, `createAmyHoodHybridRetriever`, `buildAmyHoodRagContext`, and `ModelClient`.
- Produces: `createEvaluationV5Runner(options)` with `createExperiment()`, `executeExperiment(runIds)`, `executeRun(runId)`, and `resumeRun(runId)`.

- [ ] **Step 1: Write runner tests first**

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - Execute 30 scenarios across three arms and five repetitions for 450 complete answers.
 * 2. Edge Cases:
 *    - Hide pair metadata while varying deterministic order by repetition.
 *    - Share each scenario retrieval across Policy and Full arms and all repetitions.
 *    - Resume an incomplete run without repeating complete answers.
 * 3. Failure Path:
 *    - Reject stale pins and persist retrieval/model/JSON failures without Prompt fallback or partial overwrite.
 */
test('happy: creates fifteen runs and four hundred fifty answers', async () => {
  const fixture = await installEvaluationV5RunnerFixture();
  const launch = await fixture.runner.createExperiment();
  assert.equal(launch.runs.length, 15);
  const runs = await fixture.runner.executeExperiment(launch.runs.map(({ runId }) => runId));
  assert.equal(runs.flatMap(({ answers }) => answers).length, 450);
});
```

- [ ] **Step 2: Run the runner test and verify RED**

Run:

```bash
npx tsx --test tests/amyHoodEvaluationV5Runner.test.ts
```

Expected: FAIL because the V5 runner modules do not exist.

- [ ] **Step 3: Implement model input that omits pair metadata**

```ts
const publicScenario = [
  `Title: ${scenario.title}`,
  `Situation: ${scenario.situation}`,
  `Decision question: ${scenario.decisionQuestion}`,
].join('\n');
```

Do not render scenario ID, pair ID, phase, source identity, or expected response type. Require a dynamic context for both RAG arms and verify its projection is `policy` or `full` as appropriate.

- [ ] **Step 4: Implement 15 pinned runs and deterministic shuffled order**

```ts
for (const repetition of [1, 2, 3, 4, 5] as const) {
  for (const arm of EVALUATION_V5_ARMS) {
    const orderSeed = sha256(`${experimentGroupId}:${repetition}`);
    runs.push(await writeEvaluationV5Run(root, createPinnedRun({ arm, repetition, orderSeed })));
  }
}
```

All three arms in one repetition use the same order. Different repetitions use different pinned orders. Validate 15 unique run IDs, one group, all three arms per repetition, and repetitions 1–5 before experiment execution.

- [ ] **Step 5: Implement shared query-dependent retrieval and safe resume**

Cache by normalized scenario query plus pinned index hash under the experiment group. Both RAG projections reuse the retrieved matches, while `buildAmyHoodRagContext` renders projection-specific context. An empty context, retrieval error, model error, or failed repair returns an `incomplete` run with a failed answer; retry replaces only that failed scenario record.

- [ ] **Step 6: Run the runner tests and verify GREEN**

Run:

```bash
npx tsx --test tests/amyHoodEvaluationV5Runner.test.ts
```

Expected: all runner tests pass; the fixture performs 450 model calls and only 30 retrieval calls.

- [ ] **Step 7: Commit Task 3**

```bash
git add server/evaluationV5/context.ts server/evaluationV5/prompt.ts server/evaluationV5/retrievalCache.ts server/evaluationV5/runStore.ts server/evaluationV5/runner.ts tests/amyHoodEvaluationV5Runner.test.ts
git commit -m "feat: run evaluation v5 paired benchmark"
```

### Task 4: Add Blind Individual and Pair Grading

**Files:**
- Create: `server/evaluationV5/judge.ts`
- Create: `tests/helpers/evaluationV5GradingFixture.ts`
- Create: `tests/amyHoodEvaluationV5Judge.test.ts`

**Interfaces:**
- Consumes: complete V5 runs, frozen scenario keys, frozen pair keys, and V5 paths.
- Produces: `exportEvaluationV5JudgePackets`, `importEvaluationV5Grades`, `exportEvaluationV5PairJudgePackets`, `importEvaluationV5PairGrades`, `loadActiveEvaluationV5Grades`, and `loadActiveEvaluationV5PairGrades`.

- [ ] **Step 1: Write judge tests first**

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - Export and import 450 individual grades and 225 pair grades.
 * 2. Edge Cases:
 *    - Accept shuffled grade order with scores at 1 and 10.
 *    - Export identical blind packets idempotently.
 *    - Keep independent candidate responses paired after packet randomization.
 * 3. Failure Path:
 *    - Reject leaked arm/run/model/source fields, bad hashes, multiline rationales, and partial grade batches.
 */
test('happy: exports complete blind individual and pair batches', async () => {
  const fixture = await installEvaluationV5GradingFixture();
  const individuals = await exportEvaluationV5JudgePackets(fixture.root, fixture.groupId);
  const pairs = await exportEvaluationV5PairJudgePackets(fixture.root, fixture.groupId);
  assert.equal(individuals.packets.length, 450);
  assert.equal(pairs.packets.length, 225);
});
```

- [ ] **Step 2: Run the judge test and verify RED**

Run:

```bash
npx tsx --test tests/amyHoodEvaluationV5Judge.test.ts
```

Expected: FAIL because `server/evaluationV5/judge.ts` does not exist.

- [ ] **Step 3: Implement blind packet exports**

Individual packets contain only scenario text, candidate response, alignment key, and the four anchors. Pair packets contain the two anonymized scenarios, two frozen candidate responses, pair key, and transition anchors. Private link files retain run, arm, repetition, scenario, and pair identity outside exported packet payloads.

```ts
const forbiddenKeys = new Set([
  'arm', 'model', 'runId', 'retrieval', 'externalEventId',
  'actualHistoricalAction', 'outcomeEvidenceIds', 'organization', 'executiveName',
]);
```

- [ ] **Step 4: Implement atomic grade imports**

Require exactly 450 unique individual packet grades and 225 unique pair packet grades. Validate packet hashes, one-line rationales of 1–500 characters, AAS integer range 1–10, four anchor findings, pair `aligned` boolean, changed-signal finding, invariant finding, and judge provenance hashes. Write versioned immutable grade batches before updating `active.json`.

- [ ] **Step 5: Run judge tests and verify GREEN**

Run:

```bash
npx tsx --test tests/amyHoodEvaluationV5Judge.test.ts
```

Expected: all judge tests pass.

- [ ] **Step 6: Commit Task 4**

```bash
git add server/evaluationV5/judge.ts tests/helpers/evaluationV5GradingFixture.ts tests/amyHoodEvaluationV5Judge.test.ts
git commit -m "feat: add evaluation v5 paired grading"
```

### Task 5: Compute V5 Metrics, Success Gates, and HTML Report

**Files:**
- Create: `server/evaluationV5/report.ts`
- Create: `tests/amyHoodEvaluationV5Report.test.ts`

**Interfaces:**
- Consumes: complete V5 runs, active individual grades, active pair grades, private links, bundle, and retrieval traces.
- Produces: `buildEvaluationV5Report(root, groupId)` and `writeEvaluationV5HtmlReport(root, groupId, outputPath)`.

- [ ] **Step 1: Write report tests first**

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - Compute three arm means, paired lifts, pair accuracy, signal citation, stability, retrieval diagnostics, and a passing formal gate.
 * 2. Edge Cases:
 *    - Report a confidence interval containing zero as directional evidence only.
 *    - Preserve zero-valued metrics instead of converting them to missing values.
 *    - Render Korean-first labels with English terms and no generic CFO column.
 * 3. Failure Path:
 *    - Reject incomplete links/grades, mixed bundle hashes, and reports created before pair grading completes.
 */
test('happy: computes v5 metrics without a generic CFO arm', async () => {
  const report = await buildEvaluationV5Report(fixture.root, fixture.groupId);
  assert.deepEqual(Object.keys(report.armMeans).sort(), [...EVALUATION_V5_ARMS].sort());
  assert.equal('generic_cfo' in report.armMeans, false);
  assert.equal(report.diagnostics.expectedAnswers, 450);
  assert.equal(report.diagnostics.expectedPairs, 225);
});
```

- [ ] **Step 2: Run the report test and verify RED**

Run:

```bash
npx tsx --test tests/amyHoodEvaluationV5Report.test.ts
```

Expected: FAIL because the V5 report module does not exist.

- [ ] **Step 3: Implement the primary metrics and formal gate**

```ts
const formalGatePassed = bestRagMean >= 7
  && bestRagLift >= 0.5
  && bestRagTransitionAccuracy >= 0.75
  && bestRagSignalCitationRate >= 0.8
  && retrieval.wrongDomainRate <= 0.05
  && diagnostics.completeAnswers / 450 >= 0.98
  && stability.armMeanStdDev <= 1.0;
```

Compute paired differences using the same scenario and repetition. Calculate the 95% confidence interval from those differences, domain means, response-type means, pair accuracy, changed-signal citation, invariant preservation, completion, wrong-domain retrieval, no-match, evidence attachment, cache agreement, and arm-mean standard deviation.

- [ ] **Step 4: Implement the Korean-first HTML report**

The report includes experiment purpose, 30-question construction, three arms, 450-answer flow, AAS and behavior-transition definitions, Before-vs-After arm table using Amy Prompt as baseline, domain and change-type tables, confidence intervals, retrieval diagnostics, failure counts, success-gate checklist, evidence limitations, and reproducibility hashes. English technical terms appear beside their Korean labels. No generic CFO column or claim appears.

- [ ] **Step 5: Run report tests and verify GREEN**

Run:

```bash
npx tsx --test tests/amyHoodEvaluationV5Report.test.ts
```

Expected: report JSON and HTML tests pass.

- [ ] **Step 6: Commit Task 5**

```bash
git add server/evaluationV5/report.ts tests/amyHoodEvaluationV5Report.test.ts
git commit -m "feat: report evaluation v5 behavior change"
```

### Task 6: Add CLI, Package Scripts, and End-to-End Verification

**Files:**
- Create: `server/runAmyHoodEvaluationV5.ts`
- Modify: `package.json`
- Test: `tests/amyHoodEvaluationV5Contract.test.ts`

**Interfaces:**
- Consumes: V5 bundle, runner, judge, and report public functions.
- Produces: `npm run evaluation:v5:test` and `npm run evaluation:v5:run -- <command>`.

- [ ] **Step 1: Add a failing CLI contract test**

```ts
test('edge: v5 CLI rejects unsupported commands and exposes the formal workflow', async () => {
  await assert.rejects(
    runAmyHoodEvaluationV5Command(['unknown'], fixtureRoot),
    /expected freeze, check, create, execute, resume, export-judge, import-grades, export-pair-judge, import-pair-grades, or report/i,
  );
});
```

- [ ] **Step 2: Implement the CLI commands and package scripts**

```json
{
  "evaluation:v5:test": "tsx --test tests/amyHoodEvaluationV5*.test.ts",
  "evaluation:v5:run": "tsx server/runAmyHoodEvaluationV5.ts"
}
```

The CLI implements `freeze`, `check`, `create`, `execute --group`, `resume --run`, `export-judge --group`, `import-grades --group --file`, `export-pair-judge --group`, `import-pair-grades --group --file`, and `report --group [--html path]`. `create` always creates five repetitions; there is no repetition option.

- [ ] **Step 3: Run the full V5 test suite**

Run:

```bash
npm run evaluation:v5:test
```

Expected: all V5 tests pass.

- [ ] **Step 4: Run regression, type, and production checks**

Run:

```bash
npm run evaluation:v4:test
npm run advisor:index:test
npm run lint
npm run build
```

Expected: V4 and shared RAG regressions pass, TypeScript reports no errors, and Vite production build succeeds.

- [ ] **Step 5: Validate the repository bundle and live-service readiness**

Run:

```bash
npm run evaluation:v5:run -- check
curl -fsS http://127.0.0.1:8080/v1/models
curl -fsS http://127.0.0.1:8081/v1/models
```

Expected: the bundle reports 30 scenarios and 15 pairs; port 8080 exposes the E4B generation model and port 8081 exposes BGE-M3. These checks establish readiness but do not launch the 450-response benchmark without an explicit live execution checkpoint.

- [ ] **Step 6: Commit Task 6**

```bash
git add server/runAmyHoodEvaluationV5.ts package.json tests/amyHoodEvaluationV5Contract.test.ts
git commit -m "feat: expose evaluation v5 workflow"
```

## Final Verification Checklist

- [ ] `git status --short` contains no unexpected files.
- [ ] `npm run evaluation:v5:test` passes.
- [ ] `npm run evaluation:v4:test` passes unchanged.
- [ ] `npm run advisor:index:test` passes.
- [ ] `npm run lint` passes.
- [ ] `npm run build` passes.
- [ ] `npm run evaluation:v5:run -- check` reports 30 scenarios, 15 pairs, three arms, five repetitions, and a current bundle hash.
- [ ] The public generation prompt contains no scenario ID, pair ID, phase, company, executive, source, historical action, or expected response type.
- [ ] V5 contains no `generic_cfo` run or report arm.
- [ ] V4 tracked files have no diff.
