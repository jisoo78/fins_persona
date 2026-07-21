# Amy Hood Single-Pipeline Evidence and V4 Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the canonical Amy Hood Decision Advisor pipeline to accept reviewed excerpts honestly, release one approved policy in each of five domains, and run a ten-scenario, four-arm E4B Evaluation v4 calibration with blind Codex grading.

**Architecture:** Keep one source registry, event graph, policy store, active release, BGE-M3 index, hybrid retriever, and Advisor/Evaluation runtime. Add `reviewed_excerpt` as a completeness level inside the existing importer, make unavailable public contrast an explicit medium-confidence path, and complete the missing V4 calibration runner, grading, and report flow by reusing V3 pinning and resumability patterns.

**Tech Stack:** TypeScript 5.8, Node test runner through `tsx --test`, LangChain against llama-server E4B on `8080`, BGE-M3 embeddings on `8081`, JSON artifacts with SHA-256, existing atomic JSON and immutable artifact stores.

## Global Constraints

- Keep branch `codex/amy-hood-first-policy-release`; create no second PoC pipeline, memory namespace, index, retriever, or Advisor runtime.
- Preserve Evaluation v3 behavior and `evaluation/v3` paths.
- `reviewed_excerpt` is canonical evidence, but its hash proves the stored snapshot only, not completeness of the external page.
- Never convert summaries, reviewer notes, or another executive's words into direct Amy Hood evidence.
- Exclude every sealed holdout identifier and all post-outcome evidence from policy induction, release, index, retrieval context, and V4 generation.
- Use `LOCAL_LLM_BASE_URL=http://127.0.0.1:8080/v1` and `BGE_M3_BASE_URL=http://127.0.0.1:8081/v1`.
- Every new or significantly modified test begins with one happy path, exactly three realistic edge cases, and relevant failure paths.
- Apply TDD and commit after every independently testable task.

---

## File Map

- Evidence: `shared/amyHoodDecisionAdvisor.ts`, `server/decisionAdvisor/manualSourceImporter.ts`, new `reviewedExcerptImporter.ts` and `webResearchInventory.ts`.
- Policy gate: `reflectionMemory.ts`, `policyMemory.ts`, `memoryReleaseStore.ts`, `evaluationV4/policyCoverage.ts`, and both policy prompts.
- V4 data: `shared/amyHoodEvaluationV4.ts`, `evaluationV4/paths.ts`, new `scenarioSet.ts`, and canonical files under `evaluation/v4/`.
- V4 runtime: new `prompt.ts`, `context.ts`, `retrievalCache.ts`, `runStore.ts`, `runner.ts`, `judge.ts`, `report.ts`, and `runAmyHoodEvaluationV4.ts`.

---

### Task 1: Add Canonical Reviewed-Excerpt Evidence

**Files:**
- Modify: `shared/amyHoodDecisionAdvisor.ts`
- Modify: `server/decisionAdvisor/manualSourceImporter.ts`
- Create: `server/decisionAdvisor/reviewedExcerptImporter.ts`
- Modify: `tests/amyHoodAdvisorManualSourceImport.test.ts`

**Interfaces:**
- Produces: `SourceContentCompleteness = 'full_text' | 'reviewed_excerpt'`.
- Produces: `ReviewedExcerptImport` and `importReviewedExcerpt(input, root, dependencies?)`.
- Preserves: existing `importReviewedSource` and `importTranscript` callers.

- [ ] **Step 1: Write failing tests**

Add this Test Plan and cases to `tests/amyHoodAdvisorManualSourceImport.test.ts`:

```ts
/**
 * Test Plan:
 * 1. Happy Path: Import one reviewed Amy excerpt with computed hash and exact speaker offsets.
 * 2. Edge Cases: Preserve full_text; re-import idempotently; supersede excerpt with full text.
 * 3. Failure Path: Reject absent/duplicate quotes, summary-only direct evidence, and partial writes.
 */
test('imports reviewed excerpt as canonical evidence', async () => {
  const input = reviewedExcerptFixture();
  const source = await importReviewedExcerpt(input, root);
  assert.equal(source.contentCompleteness, 'reviewed_excerpt');
  assert.match(source.sha256!, /^[a-f0-9]{64}$/);
  const raw = await readRawFixture(root, source.rawPath!);
  const start = input.excerptText.indexOf(input.exactQuote);
  assert.deepEqual(raw.speakerSegments, [{
    speaker: 'Amy Hood', startChar: start, endChar: start + input.exactQuote.length,
  }]);
});
```

- [ ] **Step 2: Verify failure**

```bash
npx tsx --test tests/amyHoodAdvisorManualSourceImport.test.ts
```

Expected: FAIL because the new type and importer do not exist.

- [ ] **Step 3: Add types and persistence fields**

Add to `shared/amyHoodDecisionAdvisor.ts`:

```ts
export type SourceContentCompleteness = 'full_text' | 'reviewed_excerpt';
export type DirectAmyEvidenceMode = 'event_specific' | 'domain_principle';
```

Add `contentCompleteness?: SourceContentCompleteness` to `AdvisorSourceRecord` and `directAmyEvidenceMode?: DirectAmyEvidenceMode` to `PilotEvidenceSpan`. Absence reads as `full_text`; old `direct_amy`/`amy_policy` spans read as `event_specific`/`domain_principle`.

Extend `ReviewedSourceImport` with `contentCompleteness?: SourceContentCompleteness` and `sourceType?: string`. Persist both fields and compare them in `reviewMatches`:

```ts
contentCompleteness: input.contentCompleteness ?? 'full_text',
sourceType: input.sourceType ?? options.sourceType,
```

- [ ] **Step 4: Implement the excerpt wrapper**

Create `server/decisionAdvisor/reviewedExcerptImporter.ts`:

```ts
import { createHash } from 'node:crypto';
import type { AdvisorSourceRecord } from '../../shared/amyHoodDecisionAdvisor';
import { importReviewedSource, type ManualImportDependencies, type ReviewedSourceImport } from './manualSourceImporter';

export type ReviewedExcerptImport = Omit<ReviewedSourceImport,
  'text' | 'expectedSha256' | 'speakerSegments' | 'contentCompleteness'> & {
  excerptText: string;
  exactQuote: string;
  evidenceUse: 'direct_amy' | 'decision_context';
};

export const importReviewedExcerpt = async (
  input: ReviewedExcerptImport,
  root: string,
  dependencies: ManualImportDependencies = {},
): Promise<AdvisorSourceRecord> => {
  const start = input.excerptText.indexOf(input.exactQuote);
  if (!input.exactQuote.trim() || start < 0 || start !== input.excerptText.lastIndexOf(input.exactQuote)) {
    throw new Error('reviewed excerpt requires one exact quote occurrence');
  }
  if (input.evidenceUse === 'direct_amy' && input.speaker !== 'Amy Hood') {
    throw new Error('direct reviewed excerpt requires Amy Hood as speaker');
  }
  return importReviewedSource({
    ...input,
    text: input.excerptText,
    expectedSha256: createHash('sha256').update(input.excerptText, 'utf8').digest('hex'),
    contentCompleteness: 'reviewed_excerpt',
    speakerSegments: input.evidenceUse === 'direct_amy'
      ? [{ speaker: 'Amy Hood', startChar: start, endChar: start + input.exactQuote.length }]
      : [],
  }, root, dependencies);
};
```

Keep the 200-character normalized minimum; supply real source-language context, never padding or reviewer prose.

- [ ] **Step 5: Verify and commit**

```bash
npx tsx --test tests/amyHoodAdvisorManualSourceImport.test.ts tests/amyHoodAdvisorEventPilot.test.ts
npm run lint
git add shared/amyHoodDecisionAdvisor.ts server/decisionAdvisor/manualSourceImporter.ts server/decisionAdvisor/reviewedExcerptImporter.ts tests/amyHoodAdvisorManualSourceImport.test.ts
git commit -m "feat: accept reviewed excerpts in canonical evidence"
```

### Task 2: Apply Uploaded Research to the Canonical Graph

**Files:**
- Create: `server/decisionAdvisor/webResearchInventory.ts`
- Modify: `server/runAmyHoodDecisionAdvisor.ts`
- Create: `tests/amyHoodWebResearchInventory.test.ts`
- Create: `data/b-track/amy-hood/advisor/imports/amy-hood-v4-decision-evidence-web-inventory.json`
- Create: `docs/reports/2026-07-20-amy-hood-v4-decision-evidence-web-research.md`
- Modify: `data/b-track/amy-hood/advisor/events/pilot/policy-evidence.json`
- Modify: canonical candidate/registry/raw/normalized artifacts under `data/b-track/amy-hood/advisor/`

**Interfaces:**
- Produces: `loadAmyHoodWebResearchInventory(filePath)`.
- Produces: `verifyAmyHoodWebResearchInventory(root, inventory)` and `applyAmyHoodWebResearchInventory(root, inventory, review)`.
- Consumes: Task 1 importer and the active sealed holdout manifest.

- [ ] **Step 1: Write validation and rollback tests**

```ts
/**
 * Test Plan:
 * 1. Happy Path: Apply selected evidence without duplicate URLs or holdout leakage.
 * 2. Edge Cases: Reuse URL family; store partial evidence as context; preserve inaccessible URL.
 * 3. Failure Path: Reject summary-as-direct, holdout input, and partial persistence.
 */
test('applies selected research and excludes holdouts', async () => {
  const result = await applyAmyHoodWebResearchInventory(root, inventoryFixture(), {
    reviewer: 'Codex', reviewedAt: '2026-07-21T00:00:00.000Z',
  });
  assert.deepEqual(result.excludedHoldoutCandidateIds.sort(), [
    'candidate-buyback-2021', 'candidate-m365-price-2021',
  ]);
  assert.deepEqual(result.directExcerptCandidateIds.sort(), [
    'candidate-buyback-2013', 'candidate-nuance-acquisition-2021',
  ]);
  assert.equal(new Set(result.canonicalUrls).size, result.canonicalUrls.length);
});
```

- [ ] **Step 2: Verify failure**

```bash
npx tsx --test tests/amyHoodWebResearchInventory.test.ts
```

Expected: FAIL because `webResearchInventory.ts` does not exist.

- [ ] **Step 3: Implement strict parse/preflight/apply**

Validate dataset identity, ten unique candidates, event dates, URLs, speakers, exact evidence arrays, and access metadata. The preflight must load the holdout manifest before any write. Apply only these non-holdout candidates:

```ts
export const SELECTED_RESEARCH_CANDIDATES = new Set([
  'candidate-nuance-acquisition-2021', 'candidate-copilot-price-2023',
  'candidate-teams-unbundle-2023', 'candidate-workforce-reset-2023',
  'candidate-phone-restructure-2015', 'candidate-transformation-2026',
  'candidate-buyback-2013', 'candidate-buyback-2024',
]);
```

The apply operation reuses canonical URL families, retrieves an accessible source through the existing public-HTML collector when the inventory contains only a short exact quote, captures a source-language passage of at least 200 normalized characters around that quote, imports exact supporting passages as context, preserves inaccessible URLs without artifacts, and rolls back newly written artifacts plus candidate/registry snapshots on failure. Korean `contextBefore`/`contextAfter` remain reviewer notes.

Create the evidence roles explicitly: Nuance becomes `event_specific` direct Amy evidence linked to its event; Buyback 2013 becomes one `PilotPolicyEvidenceRecord` with `domain_principle` semantics in `policy-evidence.json`, while the board authorization remains decision context. If the Nuance page cannot be collected and the passage cannot be verified, leave Nuance context-only and fail the five-domain release preflight rather than using the Korean summary.

- [ ] **Step 4: Add CLI commands**

```ts
if (command === 'research:check' || command === 'research:apply') {
  const file = optionValue(args, '--file');
  if (!file) throw new Error(`${command} requires --file`);
  const inventory = await loadAmyHoodWebResearchInventory(path.resolve(root, file));
  const result = command === 'research:check'
    ? await verifyAmyHoodWebResearchInventory(root, inventory)
    : await applyAmyHoodWebResearchInventory(root, inventory, {
        reviewer: 'Codex', reviewedAt: new Date().toISOString(),
      });
  console.log(JSON.stringify(result, null, 2));
  return;
}
```

- [ ] **Step 5: Copy, check, apply, verify**

```bash
cp /Users/hestory/Desktop/fins_persona/docs/amy-hood-v4-decision-evidence-web-inventory.json data/b-track/amy-hood/advisor/imports/amy-hood-v4-decision-evidence-web-inventory.json
cp /Users/hestory/Desktop/fins_persona/docs/2026-07-20-amy-hood-v4-decision-evidence-web-research.md docs/reports/2026-07-20-amy-hood-v4-decision-evidence-web-research.md
npx tsx server/runAmyHoodDecisionAdvisor.ts research:check --file data/b-track/amy-hood/advisor/imports/amy-hood-v4-decision-evidence-web-inventory.json
npx tsx server/runAmyHoodDecisionAdvisor.ts research:apply --file data/b-track/amy-hood/advisor/imports/amy-hood-v4-decision-evidence-web-inventory.json
npm run advisor:candidates:check
npx tsx --test tests/amyHoodWebResearchInventory.test.ts tests/amyHoodAdvisorManualSourceImport.test.ts
```

Expected: ten inputs, two holdouts excluded, two direct excerpts eligible, no duplicate canonical URL.

- [ ] **Step 6: Commit**

```bash
git add server/decisionAdvisor/webResearchInventory.ts server/runAmyHoodDecisionAdvisor.ts tests/amyHoodWebResearchInventory.test.ts data/b-track/amy-hood/advisor docs/reports/2026-07-20-amy-hood-v4-decision-evidence-web-research.md
git commit -m "data: import reviewed Amy Hood web evidence"
```

### Task 3: Add the Formal No-Public-Contrast Policy Path

**Files:**
- Modify: `shared/amyHoodDecisionAdvisor.ts`
- Modify: `server/decisionAdvisor/reflectionMemory.ts`
- Modify: `server/decisionAdvisor/policyMemory.ts`
- Modify: `server/decisionAdvisor/memoryReleaseStore.ts`
- Modify: `server/evaluationV4/policyCoverage.ts`
- Modify: `agent_prompts/prompts/amy-hood-reflection-builder.md`
- Modify: `agent_prompts/prompts/amy-hood-policy-inducer.md`
- Modify: `tests/amyHoodAdvisorPolicyMemory.test.ts`
- Modify: `tests/amyHoodEvaluationV4PolicyCoverage.test.ts`

**Interfaces:**
- Produces: `ContrastStatus = 'reviewed' | 'documented_unavailable'`.
- Preserves legacy reviewed-contrast policies and schema-v2 releases.
- Changes V4 coverage from per-event direct speech to domain-level direct Amy evidence plus event context.

- [ ] **Step 1: Write failing gate tests**

```ts
test('accepts medium policy when public contrast is documented unavailable', () => {
  const { graph, reflection, policy } = noPublicContrastFixture();
  assert.equal(validateReflectionMemory(reflection, graph).passed, true);
  const validation = validatePolicyMemory(policy, [reflection], graph);
  assert.equal(validation.passed, true);
  assert.equal(validation.computedConfidence, 'medium');
});
```

The modified Test Plans contain one happy path, exactly three edges (legacy contrast, direct-principle confirmation, deterministic missing domains), and failures for missing reversal, low confidence, and holdout leakage.

- [ ] **Step 2: Verify failure**

```bash
npx tsx --test tests/amyHoodAdvisorPolicyMemory.test.ts tests/amyHoodEvaluationV4PolicyCoverage.test.ts
```

Expected: FAIL on required contrasting event/contrast.

- [ ] **Step 3: Add types and validator branches**

Add `contrastStatus?: ContrastStatus` to `ReflectionMemory` and `PolicyMemory`; absence means `reviewed`. Allow `contrastPattern: ReflectionEvidencePattern | null`. Implement:

```ts
const contrastStatus = reflection.contrastStatus ?? 'reviewed';
if (contrastStatus === 'reviewed') {
  if (contrast.size === 0) errors.push('reflection requires a contrasting event');
  if (!validPattern(reflection.contrastPattern)) errors.push('reflection requires contrast pattern');
} else {
  if (contrast.size || reflection.contrastPattern !== null) {
    errors.push('documented unavailable contrast must not reference an event');
  }
  if (support.size < 2 || reflection.unresolvedConflicts.every((item) => item.length < 40)) {
    errors.push('documented unavailable contrast requires two supports and a reviewed evidence gap');
  }
}
```

A `documented_unavailable` policy requires two supports, one direct policy evidence ID, guardrails, reversal signals, and a matching approved reflection. Cap its confidence at `medium`; low confidence remains unreleasable.

- [ ] **Step 4: Update V4 coverage and prompts**

Require reviewed context on referenced events. Accept direct identity through `directPolicyEvidenceIds` or at least one referenced event's direct/policy evidence; do not require direct speech on every event. Prompts may emit unavailable contrast only when the input graph has no reviewed opposite action and must never invent an event. Include `contrastStatus` in release projections/hashes.

- [ ] **Step 5: Verify and commit**

```bash
npx tsx --test tests/amyHoodAdvisorPolicyMemory.test.ts tests/amyHoodEvaluationV4PolicyCoverage.test.ts
npm run advisor:index:test
npm run lint
git add shared/amyHoodDecisionAdvisor.ts server/decisionAdvisor/reflectionMemory.ts server/decisionAdvisor/policyMemory.ts server/decisionAdvisor/memoryReleaseStore.ts server/evaluationV4/policyCoverage.ts agent_prompts/prompts/amy-hood-reflection-builder.md agent_prompts/prompts/amy-hood-policy-inducer.md tests/amyHoodAdvisorPolicyMemory.test.ts tests/amyHoodEvaluationV4PolicyCoverage.test.ts
git commit -m "feat: support reviewed policies without public contrast"
```

### Task 4: Build and Activate the Five-Domain Release

**Files:**
- Modify: selected canonical event cards and policy-memory artifacts under `data/b-track/amy-hood/advisor/`
- Create: one content-addressed memory release and index
- Modify: `memory-releases/active.json` and `memory-indexes/active.json`

**Interfaces:**
- Produces one verified active schema-v2 release with exactly one deployable policy per domain.
- Produces one calibrated BGE-M3 index used by Advisor, V3, and V4.

- [ ] **Step 1: Rebuild only the thirteen selected cards**

Run the exact selected set; do not add M365 2021 or Buyback 2021:

```bash
for id in candidate-linkedin-acquisition-2016 candidate-activision-acquisition-2022 candidate-nuance-acquisition-2021 candidate-cloud-capacity-scale-2022 candidate-ai-capacity-opex-pivot-2023 candidate-ai-capacity-sourcing-2024 candidate-copilot-price-2023 candidate-teams-unbundle-2023 candidate-workforce-reset-2023 candidate-phone-restructure-2015 candidate-transformation-2026 candidate-buyback-2013 candidate-buyback-2024; do
  npm run advisor:event:build -- --id "$id" --refresh-approved || exit 1
done
```

- [ ] **Step 2: Review and approve eligible cards**

For each selected card, inspect quotes, roles, chosen action, observations/inferences, temporal role, and holdout references, then run the exact selected set:

```bash
for id in candidate-linkedin-acquisition-2016 candidate-activision-acquisition-2022 candidate-nuance-acquisition-2021 candidate-cloud-capacity-scale-2022 candidate-ai-capacity-opex-pivot-2023 candidate-ai-capacity-sourcing-2024 candidate-copilot-price-2023 candidate-teams-unbundle-2023 candidate-workforce-reset-2023 candidate-phone-restructure-2015 candidate-transformation-2026 candidate-buyback-2013 candidate-buyback-2024; do
  npm run advisor:event:approve -- --id "$id" --reviewer Codex || exit 1
done
npm run advisor:event:report -- --pilot
```

Expected: at least two approved events per domain and no holdout among policy inputs.

- [ ] **Step 3: Build and approve five reflections and five policies**

```bash
npm run advisor:memory:build -- --kind reflection
npm run advisor:memory:check
npm run advisor:memory:approve -- --kind reflection --all-passing --review-confirmed --reviewer Codex --rationale "Reviewed support evidence, decision axes, public contrast availability, boundaries, and holdout exclusion."
npm run advisor:memory:build -- --kind policy
npm run advisor:memory:check
npm run advisor:memory:approve -- --kind policy --all-passing --review-confirmed --reviewer Codex --rationale "Reviewed priorities, guardrails, reversal signals, evidence completeness, and holdout isolation."
```

Reject extra proposals using `memory:review --decision rejected`; retain exactly one deployable policy per domain.

- [ ] **Step 4: Build and activate release/index**

```bash
npm run advisor:memory:release -- --profile evaluation-v4
npm run advisor:memory:activate -- --latest
BGE_M3_BASE_URL=http://127.0.0.1:8081/v1 npm run advisor:index:build
BGE_M3_BASE_URL=http://127.0.0.1:8081/v1 npm run advisor:index:check
```

Expected: five covered domains, recall@3 at least `0.8`, and no-match false-positive rate at most `0.2`.

- [ ] **Step 5: Regress and commit**

```bash
npm run advisor:policy-memory:test
npm run advisor:index:test
npm run evaluation:v3:test
git add data/b-track/amy-hood/advisor
git commit -m "data: activate five-domain Amy Hood memory release"
```

### Task 5: Freeze the Ten-Scenario V4 Calibration Bundle

**Files:**
- Modify: `shared/amyHoodEvaluationV4.ts`
- Modify: `server/evaluationV4/paths.ts`
- Create: `server/evaluationV4/scenarioSet.ts`
- Create: `tests/amyHoodEvaluationV4ScenarioSet.test.ts`
- Create: canonical public/sealed/source files under `evaluation/v4/`

**Interfaces:**
- Produces: `EvaluationV4Stage = 'calibration' | 'benchmark'`.
- Produces: `loadEvaluationV4Bundle(root, 'calibration')` and `freezeEvaluationV4Bundle(root, bundle)`.
- Consumes active five-domain policy coverage and `validateEvaluationV4ExternalSources`.

- [ ] **Step 1: Write matrix and leakage tests**

```ts
/**
 * Test Plan:
 * 1. Happy Path: Accept ten approved scenarios with two per domain and sealed mappings.
 * 2. Edge Cases: Accept shuffled order; documented secondary absence; neutral business wording.
 * 3. Failure Path: Reject wrong counts, identity/outcome leakage, and stale hashes.
 */
test('accepts ten calibration scenarios with two per domain', () => {
  const result = validateEvaluationV4ScenarioBundle(calibrationScenarioFixture());
  assert.equal(result.scenarios.length, 10);
  assert.deepEqual(result.domainCounts, Object.fromEntries(
    EVALUATION_V4_DOMAINS.map((domain) => [domain, 2]),
  ));
});
```

- [ ] **Step 2: Verify failure**

```bash
npx tsx --test tests/amyHoodEvaluationV4ScenarioSet.test.ts
```

Expected: FAIL because calibration contracts and `scenarioSet.ts` do not exist.

- [ ] **Step 3: Implement stage and bundle validation**

Add `stage` and `scenarioSetVersion` to scenario/run/report contracts. Calibration requires exactly ten unique scenarios, two per domain, one `base_transfer` and one `reversal` per domain, ten approved reviews, ten provenance mappings, and ten alignment keys. Public files must not expose executive/company identity, historical action, outcomes, policy IDs, or source IDs.

Expose:

```ts
export const loadEvaluationV4Bundle = async (
  root: string,
  stage: EvaluationV4Stage,
): Promise<ValidatedEvaluationV4Bundle> => {
  const paths = evaluationV4Paths(root);
  const [scenarios, reviews, provenance, alignmentKeys, manifest] = await Promise.all([
    readJsonFile(paths.scenarios, null), readJsonFile(paths.reviews, null),
    readJsonFile(paths.externalEventMap, null), readJsonFile(paths.alignmentKey, null),
    readJsonFile(paths.manifest, null),
  ]);
  return validateEvaluationV4ScenarioBundle({
    stage, scenarios, reviews, provenance, alignmentKeys, manifest,
  });
};

export const freezeEvaluationV4Bundle = async (
  root: string,
  input: EvaluationV4BundleInput,
): Promise<EvaluationV4FrozenManifest> => {
  const validated = validateEvaluationV4ScenarioBundle(input);
  const manifest = buildEvaluationV4FrozenManifest(validated);
  await writeJsonAtomic(evaluationV4Paths(root).manifest, manifest);
  return manifest;
};
```

- [ ] **Step 4: Research and archive ten external decisions**

Use decision-time earnings calls, filings, official interviews, and company announcements. Use two non-Microsoft events per domain, at least two organizations per domain, and no executive more than twice. Store eventual outcomes only as `post_outcome`. Capture source text and hashes through `sourceSet.ts`; reuse no Amy URL or content hash.

- [ ] **Step 5: Author and freeze scenarios**

Use IDs `AAS-CAL-MA-01..02`, `AAS-CAL-AI-01..02`, `AAS-CAL-PM-01..02`, `AAS-CAL-CE-01..02`, and `AAS-CAL-SR-01..02`. Each sealed key maps one approved policy and contains expected action, exactly three ordered priorities, guardrails, reversal signals, acceptable variants, identity conflicts, and rationale.

```bash
npx tsx server/runAmyHoodEvaluationV4.ts check --stage calibration
npx tsx --test tests/amyHoodEvaluationV4Contract.test.ts tests/amyHoodEvaluationV4PolicyCoverage.test.ts tests/amyHoodEvaluationV4SourceSet.test.ts tests/amyHoodEvaluationV4ScenarioSet.test.ts
```

Expected: ten approved scenarios, five domains, no source collision/leakage, valid frozen hashes.

- [ ] **Step 6: Commit**

```bash
git add shared/amyHoodEvaluationV4.ts server/evaluationV4/paths.ts server/evaluationV4/scenarioSet.ts tests/amyHoodEvaluationV4ScenarioSet.test.ts evaluation/v4
git commit -m "data: freeze Evaluation v4 calibration bundle"
```

### Task 6: Implement the Four-Arm Resumable V4 Runner

**Files:**
- Create: `server/evaluationV4/prompt.ts`
- Create: `server/evaluationV4/runStore.ts`
- Create: `server/evaluationV4/context.ts`
- Create: `server/evaluationV4/retrievalCache.ts`
- Create: `server/evaluationV4/runner.ts`
- Create: `server/runAmyHoodEvaluationV4.ts`
- Modify: `package.json`
- Create: `tests/amyHoodEvaluationV4Runner.test.ts`

**Interfaces:**
- Produces: `createEvaluationV4Runner(...)` with `createExperiment`, `executeExperiment`, `executeRun`, and `resumeRun`.
- Produces CLI commands `create`, `execute`, and `resume`.
- Consumes frozen bundle, active prompt/release/index, hybrid retriever, and `buildAmyHoodRagContext`.

- [ ] **Step 1: Write runner tests**

```ts
/**
 * Test Plan:
 * 1. Happy Path: Execute 10 scenarios across four arms with 40 complete answers.
 * 2. Edge Cases: Retry fenced JSON; share RAG cache; resume one failed answer.
 * 3. Failure Path: Reject stale pins/model and fail RAG without prompt-only fallback.
 */
test('executes one four-arm calibration', async () => {
  const fixture = await installEvaluationV4RuntimeFixture();
  const launch = await fixture.runner.createExperiment({ stage: 'calibration' });
  const runs = await fixture.runner.executeExperiment(launch.runs.map(({ runId }) => runId));
  assert.equal(runs.length, 4);
  assert.equal(runs.every(({ status, answers }) =>
    status === 'complete' && answers.length === 10), true);
  assert.equal(fixture.retrievalInvocations.length, 10);
  assert.equal(runs.flatMap(({ answers }) => answers).length, 40);
});
```

- [ ] **Step 2: Verify failure**

```bash
npx tsx --test tests/amyHoodEvaluationV4Runner.test.ts
```

Expected: FAIL because V4 runtime modules do not exist.

- [ ] **Step 3: Implement prompt, store, and pinning**

`buildEvaluationV4Input(systemPrompt, scenario, context, arm)` rejects context on no-RAG arms, requires matching `policy`/`full` projection on RAG arms, and requests only the five public response fields. `runStore.ts` writes every transition atomically.

`context.ts` resolves the active schema-v2 release/index and calls `loadEvaluationV4PolicyCoverage`; experiment creation fails unless five domains pass. Pin scenario hash, prompt ID/hash, model, release/index/config hashes, and deterministic order seed.

- [ ] **Step 4: Implement shared retrieval and sequential execution**

Query with `title + situation + decisionQuestion`. Both RAG arms share one cache entry per scenario and render different projections. Run sequentially because llama-server uses `--parallel 1`. Retry malformed JSON once. On retrieval/model failure persist a failed answer and mark the run incomplete; never call E4B without required RAG context. Resume skips completed answers.

- [ ] **Step 5: Add CLI and scripts**

Add to `package.json`:

```json
"evaluation:v4:test": "tsx --test tests/amyHoodEvaluationV4*.test.ts",
"evaluation:v4:run": "tsx server/runAmyHoodEvaluationV4.ts"
```

The CLI returns untruncated JSON IDs.

- [ ] **Step 6: Verify and commit**

```bash
npx tsx --test tests/amyHoodEvaluationV4Runner.test.ts
npm run evaluation:v4:test
npm run evaluation:v3:test
npm run lint
git add server/evaluationV4 server/runAmyHoodEvaluationV4.ts tests/amyHoodEvaluationV4Runner.test.ts package.json shared/amyHoodEvaluationV4.ts
git commit -m "feat: run Evaluation v4 calibration"
```

### Task 7: Add Blind Grade Import and Calibration Reporting

**Files:**
- Create: `server/evaluationV4/judge.ts`
- Create: `server/evaluationV4/report.ts`
- Modify: `server/runAmyHoodEvaluationV4.ts`
- Create: `tests/amyHoodEvaluationV4Judge.test.ts`
- Create: `tests/amyHoodEvaluationV4Report.test.ts`

**Interfaces:**
- Produces: `exportEvaluationV4JudgePackets(root, groupId)` plus private links.
- Produces: `importEvaluationV4Grades(root, groupId, grades)`.
- Produces: `buildEvaluationV4CalibrationReport(root, groupId)`.

- [ ] **Step 1: Write judge/report tests**

Judge Test Plan: one complete 40-grade batch; exactly three edges for shuffled order, score boundaries, and idempotent export; failures for leaked fields, bad hashes, multiline rationale, and partial batch. Report Test Plan: one complete report; exactly three edges for tied means, no behavior change, and wrong-domain retrieval; failures for incomplete runs and missing grades.

- [ ] **Step 2: Verify failure**

```bash
npx tsx --test tests/amyHoodEvaluationV4Judge.test.ts tests/amyHoodEvaluationV4Report.test.ts
```

Expected: FAIL because judge/report modules do not exist.

- [ ] **Step 3: Implement blind export and immutable grade import**

Judge packets contain only packet ID/hash, public scenario, response, sealed alignment key, and anchor checklist. Private links map packet to group/run/arm/repetition. Reject `arm`, `model`, `runId`, `retrieval`, `externalEventId`, `actualHistoricalAction`, and `outcomeEvidenceIds` at any depth of public packets.

Require exactly forty grades, matching hashes, a single-line 1–500 character rationale, four anchor findings, score 1–10, judge identity, prompt hashes, and ISO time. Write `grades/${batchHash}/grades.json` before updating the active pointer; never activate partial grades.

- [ ] **Step 4: Implement report rules**

Calculate arm means, Amy arms versus Generic CFO, each RAG arm versus Amy Prompt, domain means, intended-domain/no-match/wrong-domain retrieval, cache agreement, context budget, and action/priority changes. Set `positiveDirectionalSignal` only when intended-domain retrieval is at least `0.8`, at least three scenarios change action or priority, and the best RAG arm exceeds Amy Prompt by at least `0.5` AAS.

- [ ] **Step 5: Add CLI, verify, commit**

```bash
npx tsx --test tests/amyHoodEvaluationV4Judge.test.ts tests/amyHoodEvaluationV4Report.test.ts
npm run evaluation:v4:test
git add server/evaluationV4/judge.ts server/evaluationV4/report.ts server/runAmyHoodEvaluationV4.ts tests/amyHoodEvaluationV4Judge.test.ts tests/amyHoodEvaluationV4Report.test.ts
git commit -m "feat: grade and report V4 calibration"
```

### Task 8: Execute Live E4B Calibration and Publish Report

**Files:**
- Create: immutable run/cache/packet/grade/report artifacts under `evaluation/v4/`
- Create: `docs/reports/2026-07-21-amy-hood-evaluation-v4-calibration.html`

**Interfaces:**
- Consumes E4B `8080`, BGE-M3 `8081`, frozen bundle, active release/index.
- Produces forty answers, forty Codex grades, one report, and a 30-scenario go/no-go.

- [ ] **Step 1: Preflight services and gates**

```bash
curl -fsS http://127.0.0.1:8080/v1/models | jq .
curl -fsS http://127.0.0.1:8081/v1/models | jq .
npm run advisor:memory:check
BGE_M3_BASE_URL=http://127.0.0.1:8081/v1 npm run advisor:index:check
npx tsx server/runAmyHoodEvaluationV4.ts check --stage calibration
```

Expected: model identities visible; five domains, index calibration, and ten frozen scenarios pass.

- [ ] **Step 2: Create and execute**

```bash
export LOCAL_LLM_BASE_URL=http://127.0.0.1:8080/v1
export BGE_M3_BASE_URL=http://127.0.0.1:8081/v1
npx tsx server/runAmyHoodEvaluationV4.ts create --stage calibration > /tmp/amy-v4-launch.json
GROUP_ID=$(jq -er '.experimentGroupId' /tmp/amy-v4-launch.json)
npx tsx server/runAmyHoodEvaluationV4.ts execute --group "$GROUP_ID"
```

Expected: four complete runs, forty complete answers, ten shared retrieval entries, no fallback.

- [ ] **Step 3: Export and grade with Codex**

```bash
npx tsx server/runAmyHoodEvaluationV4.ts export-judge --group "$GROUP_ID" > /tmp/amy-v4-packets.json
```

Read only that packet file. Produce one single-sentence rationale, four anchor findings, and one integer AAS per packet; save all forty grades to `/tmp/amy-v4-grades.json` and import:

```bash
npx tsx server/runAmyHoodEvaluationV4.ts import-grades --group "$GROUP_ID" --file /tmp/amy-v4-grades.json
```

- [ ] **Step 4: Generate the objective HTML report**

```bash
npx tsx server/runAmyHoodEvaluationV4.ts report --group "$GROUP_ID" --html docs/reports/2026-07-21-amy-hood-evaluation-v4-calibration.html
```

Include quantitative results, four-arm comparison, retrieval, behavior changes, evidence-completeness counts, hypotheses, reasoning, limitations, and go/no-go. State that this is behavioral calibration, not proof of Amy Hood replication.

- [ ] **Step 5: Final verification and commit**

```bash
npm run evaluation:v4:test
npm run evaluation:v3:test
npm run advisor:policy-memory:test
npm run advisor:index:test
npm run lint
npm run build
git diff --check
git add evaluation/v4 docs/reports/2026-07-21-amy-hood-evaluation-v4-calibration.html
git commit -m "eval: report E4B V4 calibration"
```

## Completion Gate

- Uploaded research is preserved and selected evidence is canonical without duplicate URL identities.
- Excerpt hash/offset integrity is reported separately from full-source completeness.
- Exactly five approved deployable policies exist in one active formal release.
- One calibrated active BGE-M3 index serves Advisor and both evaluation versions.
- No holdout/post-outcome reference appears in policy, release, index, or V4 generation.
- Four E4B runs contain forty complete answers and ten shared RAG retrievals.
- Forty blind Codex grades are active.
- The HTML report gives an explicit 30-scenario benchmark go/no-go.
