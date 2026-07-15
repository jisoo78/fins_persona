# Amy Hood Phase 4 Policy Memory Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert approved, non-holdout Amy Hood event evidence into reviewed conditional policies, publish an immutable structured-memory release, activate it, and complete the first 120-call Evaluation v3 Gemma 4 experiment.

**Architecture:** A deterministic TypeScript pipeline selects approved evidence, uses local Gemma 4 only for strict-JSON reflection and policy proposals, validates and reviews those proposals outside the model, then publishes a content-addressed release. The existing Evaluation v3 runner consumes the release through `evaluation-context.json`; BGE-M3 retrieval remains deferred to Phase 5.

**Tech Stack:** TypeScript 5.8, Node.js test runner through `tsx --test`, LangChain `ChatOpenAI`, local Gemma 4 OpenAI-compatible endpoint at `http://127.0.0.1:8080/v1`, JSON artifacts, SHA-256, Express Evaluation v3 API.

## Global Constraints

- Work in `/Users/hestory/Desktop/fins_persona/.worktrees/amy-hood-decision-advisor` on the current `codex/amy-hood-decision-advisor` branch.
- Follow TDD: add the failing test first, confirm the expected failure, implement the minimum behavior, then rerun tests.
- The new policy-memory test file has one happy path, exactly three realistic edge cases, and grouped failure-path coverage as required by `AGENTS.md`.
- Select only event cards whose status is exactly `approved`.
- Reject sealed holdout and post-outcome references before a model call or derived-artifact write.
- A reflection requires nonempty, disjoint support and materially contrasting event sets.
- A deployable policy requires two approved supporting events, or verified direct Amy Hood policy evidence plus confirmation in another approved event and distinct document family.
- Only medium/high `deployable_policy` artifacts may enter an active release.
- Gemma receives strict JSON prompts and exactly one repair retry.
- Builders never approve their own outputs; Codex review records the approval decision and validation hash.
- Releases are immutable and content-addressed; `active.json` changes only after complete hash and leakage verification.
- Phase 4 emits compact canonical JSON artifacts, not raw source chunks.
- Do not add BGE-M3, GraphRAG, fine-tuning, a new UI, or a final Main Prompt rewrite in this plan.
- Run the real experiment with `repetitions=1`, which creates four runs and at most 120 successful question calls plus parser retries.

---

## File Structure

### Shared contracts

- Modify `shared/amyHoodDecisionAdvisor.ts`: add reflection, policy, review, validation, model-run, and release types.
- Modify `server/decisionAdvisor/paths.ts`: expose all policy-memory and release paths from one root.
- Create `server/decisionAdvisor/canonicalJson.ts`: recursively sort JSON object keys and provide shared SHA-256 helpers.

### Policy-memory pipeline

- Create `server/decisionAdvisor/policyMemoryInput.ts`: load approved cards and verified evidence, construct provenance references, and enforce holdout/post-outcome exclusion.
- Create `server/decisionAdvisor/reflectionMemory.ts`: parse, validate, hash, and build cross-event reflection proposals.
- Create `server/decisionAdvisor/policyMemory.ts`: parse, validate, classify, hash, and build conditional policy proposals.
- Create `server/decisionAdvisor/policyMemoryStore.ts`: persist proposals/model runs, build gate reports, and apply Codex approvals without partial writes.
- Create `server/decisionAdvisor/memoryReleaseStore.ts`: build, verify, and activate immutable structured-memory releases.
- Create `server/decisionAdvisor/policyMemoryCli.ts`: parse and execute Phase 4 commands while leaving the existing large advisor CLI focused on earlier phases.
- Modify `server/decisionAdvisor/pilotPolicyEvidence.ts`: expose validated policy record/span pairs without breaking the existing map loader.

### Prompts and CLI

- Create `agent_prompts/prompts/amy-hood-reflection-builder.md`: evidence-bound contrastive reflection prompt.
- Create `agent_prompts/prompts/amy-hood-policy-inducer.md`: bounded `WHEN → PRIORITIZE → THEN → EXCEPT → REVERSE IF` prompt.
- Modify `server/runAmyHoodDecisionAdvisor.ts`: delegate `memory:*` commands to `policyMemoryCli.ts` before the existing command switch.
- Modify `package.json`: add policy-memory test/build/check/approve/release/activate scripts.

### Evaluation integration

- Modify `server/evaluationV3/context.ts`: verify active manifest and evaluation-context hashes at load time.
- Modify `server/evaluationV3/questionSet.ts`: add an atomic all-30 approval operation.
- Create `tests/helpers/evaluationV3MemoryFixture.ts`: write a self-consistent context, release manifest, and active pointer for Evaluation v3 tests.
- Modify `evaluation/v3/public/reviews.json`: set every reviewed question to `approved` after code verification.
- Create `server/runAmyHoodEvaluationV3.ts`: provide synchronous `approve-all` and `run --repetitions 1` commands for reproducible local execution.
- Modify `package.json`: add Evaluation v3 approval and run scripts.

### Tests and generated artifacts

- Create `tests/amyHoodAdvisorPolicyMemory.test.ts`: all new Phase 4 test cases.
- Modify `tests/amyHoodEvaluationV3QuestionSet.test.ts`: cover atomic bulk approval within its existing happy path, without adding a fourth edge-case category.
- Modify `tests/amyHoodEvaluationV3Runner.test.ts`: ensure manifest tampering fails before execution.
- Generate `data/b-track/amy-hood/advisor/policy-memory/**`: model runs, proposals, approvals, and gate report.
- Generate `data/b-track/amy-hood/advisor/memory-releases/**`: verified release and active pointer.
- Create `docs/reports/2026-07-15-amy-hood-phase-4-gemma-evaluation.md`: evidence gate and first experiment results.

---

### Task 1: Define contracts, paths, and the sealed input graph

**Files:**
- Modify: `shared/amyHoodDecisionAdvisor.ts`
- Modify: `server/decisionAdvisor/paths.ts`
- Create: `server/decisionAdvisor/canonicalJson.ts`
- Modify: `server/decisionAdvisor/pilotPolicyEvidence.ts`
- Create: `server/decisionAdvisor/policyMemoryInput.ts`
- Create: `tests/amyHoodAdvisorPolicyMemory.test.ts`

**Interfaces:**
- Consumes: `PilotDecisionEvent`, `PilotPolicyEvidenceRecord`, `PilotEvidenceSpan`, `AdvisorSourceRecord`, `EvaluationV3ArtifactReference`.
- Produces: `loadPolicyMemoryInput(root: string): Promise<PolicyMemoryInputGraph>`, `canonicalJson(value)`, `sha256(value)`, `ArtifactReview`, `ReflectionMemory`, `PolicyMemory`, `MemoryReleaseManifest`, and deterministic policy-memory paths.

- [ ] **Step 1: Create the test file with its complete test plan and the first failing input-selection assertions**

Put this block at the top of `tests/amyHoodAdvisorPolicyMemory.test.ts` and add fixtures that copy the real sealed holdout manifest into a temporary root:

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - approved non-holdout events become reviewed policies in an immutable active release loadable by Evaluation v3.
 * 2. Edge Cases:
 *    - direct Amy policy evidence plus confirmation in another event and document family qualifies as medium confidence.
 *    - a materially contrasting event narrows policy boundaries and supplies an observable reversal signal.
 *    - rebuilding identical approved content returns the same content-addressed release.
 * 3. Failure Path:
 *    - holdout/post-outcome leakage, unsupported policies, invalid model JSON, stale evidence, tampered hashes, and failed activation preserve the last valid state.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { loadPolicyMemoryInput } from '../server/decisionAdvisor/policyMemoryInput';

test('happy: input graph selects only approved non-holdout decision evidence', async (context) => {
  const root = await createPolicyMemoryFixture();
  context.after(() => rm(root, { recursive: true, force: true }));
  const graph = await loadPolicyMemoryInput(root);
  assert.deepEqual(graph.events.map(({ id }) => id), [
    'event-activision-acquisition-2022',
    'event-linkedin-acquisition-2016',
    'event-openai-expansion-2023',
  ]);
  assert.equal(graph.events.every(({ status }) => status === 'approved'), true);
  assert.equal(graph.references.some(({ id }) => id.includes('github')), false);
  assert.equal(graph.evidenceSpans.some(({ role }) => role === 'post_outcome'), false);
});

test('failure: holdout and post-outcome inputs fail before model work', async () => {
  const holdoutRoot = await createPolicyMemoryFixture({ includeHoldoutCard: true });
  await assert.rejects(() => loadPolicyMemoryInput(holdoutRoot), /holdout/);
  const outcomeRoot = await createPolicyMemoryFixture({ injectCorePostOutcome: true });
  await assert.rejects(() => loadPolicyMemoryInput(outcomeRoot), /post-outcome/);
});
```

The fixture uses three approved cards, one incomplete card, real-format source/evidence records, and the repository's four-event holdout manifest. It must not mock `assertNoEvaluationV3Holdout`.

- [ ] **Step 2: Run the test and confirm the missing-module failure**

Run:

```bash
npx tsx --test tests/amyHoodAdvisorPolicyMemory.test.ts
```

Expected: FAIL because `server/decisionAdvisor/policyMemoryInput.ts` does not exist.

- [ ] **Step 3: Add the shared contracts**

Append these exact public contracts to `shared/amyHoodDecisionAdvisor.ts`:

```ts
export type PolicyMemoryStatus = 'review_required' | 'approved' | 'rejected';
export type PolicyMemoryConfidence = 'high' | 'medium' | 'low';

export type ArtifactReview = {
  reviewer: 'Codex';
  reviewedAt: string;
  decision: 'approved' | 'rejected';
  rationale: string;
  validationHash: string;
};

export type ReflectionMemory = {
  id: string;
  domain: DecisionDomain;
  crossEventQuestion: string;
  observation: string;
  invariant: string;
  boundaryConditions: string[];
  unresolvedConflicts: string[];
  supportingEventIds: string[];
  contrastingEventIds: string[];
  evidenceIds: string[];
  confidence: PolicyMemoryConfidence;
  status: PolicyMemoryStatus;
  review: ArtifactReview | null;
};

export type PolicyMemory = {
  id: string;
  domain: DecisionDomain;
  applicabilityConditions: string[];
  priorityOrder: string[];
  recommendedAction: string;
  nonApplicabilityConditions: string[];
  exceptions: string[];
  reversalSignals: string[];
  reflectionIds: string[];
  supportingEventIds: string[];
  contrastingEventIds: string[];
  evidenceIds: string[];
  directPolicyEvidenceIds: string[];
  confidence: PolicyMemoryConfidence;
  policyKind: 'deployable_policy' | 'event_specific_hypothesis';
  status: PolicyMemoryStatus;
  review: ArtifactReview | null;
};

export type PolicyMemoryValidation = {
  passed: boolean;
  errors: string[];
  warnings: string[];
  computedConfidence: PolicyMemoryConfidence;
  references: Array<{
    artifactClass: 'candidate' | 'event' | 'source' | 'evidence' | 'alias' | 'raw_source';
    id: string;
    sourceId?: string;
    candidateId?: string;
  }>;
};

export type PolicyMemoryModelRun = {
  id: string;
  kind: 'reflection' | 'policy';
  promptHash: string;
  inputHashes: Record<string, string>;
  model: string;
  modelCacheKey: string;
  attemptCount: 1 | 2;
  rawResponses: string[];
  parsedArtifactIds: string[];
  status: 'complete' | 'failed';
  error: string | null;
  createdAt: string;
};

export type MemoryArtifactRef = {
  id: string;
  kind: 'event' | 'reflection' | 'policy';
  relativePath: string;
  sha256: string;
};

export type MemoryReleaseManifest = {
  schemaVersion: 1;
  releaseId: string;
  version: string;
  createdAt: string;
  sourceRegistryHash: string;
  pilotManifestHash: string;
  holdoutManifestHash: string;
  artifacts: MemoryArtifactRef[];
  evaluationContextPath: 'evaluation-context.json';
  evaluationContextHash: string;
  reviewLedgerHash: string;
};
```

- [ ] **Step 4: Expose policy-memory paths and validated policy evidence pairs**

Create `canonicalJson.ts` before adding paths:

```ts
import { createHash } from 'node:crypto';

const normalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, normalize(item)]),
    );
  }
  return value;
};

export const canonicalJson = (value: unknown) => JSON.stringify(normalize(value));

export const sha256 = (value: string | Buffer) =>
  createHash('sha256').update(value).digest('hex');
```

Extend `advisorPaths()` with these keys:

```ts
policyMemory: path.resolve(advisorRoot, 'policy-memory'),
reflectionProposals: path.resolve(advisorRoot, 'policy-memory/proposals/reflections'),
policyProposals: path.resolve(advisorRoot, 'policy-memory/proposals/policies'),
policyModelRuns: path.resolve(advisorRoot, 'policy-memory/proposals/model-runs'),
approvedReflections: path.resolve(advisorRoot, 'policy-memory/approved/reflections'),
approvedPolicies: path.resolve(advisorRoot, 'policy-memory/approved/policies'),
policyReviews: path.resolve(advisorRoot, 'policy-memory/reviews'),
policyGateReport: path.resolve(advisorRoot, 'policy-memory/gate-report.json'),
memoryReleases: path.resolve(advisorRoot, 'memory-releases'),
activeMemoryRelease: path.resolve(advisorRoot, 'memory-releases/active.json'),
```

In `pilotPolicyEvidence.ts`, introduce and use this wrapper without changing the output of `loadValidatedPilotPolicyEvidence`:

```ts
export type ValidatedPilotPolicyEvidence = {
  record: PilotPolicyEvidenceRecord;
  span: PilotEvidenceSpan;
  documentFamilyId: string;
};

export const loadValidatedPilotPolicyEvidenceGraph = async (
  root: string,
  candidates: EventCandidate[],
): Promise<ValidatedPilotPolicyEvidence[]> => {
  const records = await readJsonFile<PilotPolicyEvidenceRecord[]>(
    advisorPaths(root).pilotPolicyEvidence,
    [],
  );
  if (!Array.isArray(records)) throw new Error('pilot policy evidence must be an array');
  const manifest = await loadPilotManifest(root, candidates);
  const targetIds = new Set(manifest.targets.map(({ candidateId }) => candidateId));
  const registry = loadRegistry(root);
  const result: ValidatedPilotPolicyEvidence[] = [];
  const recordIds = new Set<string>();
  for (const record of records) {
    if (recordIds.has(record.id)) throw new Error(`duplicate policy evidence ID: ${record.id}`);
    recordIds.add(record.id);
    if (!targetIds.has(record.candidateId)) {
      throw new Error(`policy evidence candidate is outside the pilot: ${record.candidateId}`);
    }
    const candidate = candidates.find(({ id }) => id === record.candidateId);
    const source = registry.sources.find(({ id }) => id === record.sourceId);
    if (!candidate || !source?.normalizedPath || !source.sha256) {
      throw new Error(`policy evidence source is unavailable: ${record.id}`);
    }
    if (!source.eventCandidateIds.includes(candidate.id)) {
      throw new Error(`policy evidence source is not linked to candidate: ${record.id}`);
    }
    const normalizedText = (
      await readAdvisorArtifactSecure(root, source.normalizedPath)
    ).toString('utf8');
    const span = validatePilotPolicyEvidenceRecord(record, {
      candidate,
      source,
      normalizedText,
      speakerSegments: await loadSpeakerSegments(root, source),
    });
    const association = candidate.sourceAssociations.find(({ canonicalUrl }) =>
      canonicalizeSourceUrl(canonicalUrl) === source.canonicalUrl);
    result.push({
      record,
      span,
      documentFamilyId: association?.documentFamilyId ?? `source:${source.id}`,
    });
  }
  return result.sort((left, right) => left.record.id.localeCompare(right.record.id));
};
```

Refactor `loadValidatedPilotPolicyEvidence` to call the graph loader and group its spans by `record.candidateId`, ensuring existing event-card tests remain unchanged:

```ts
export const loadValidatedPilotPolicyEvidence = async (
  root: string,
  candidates: EventCandidate[],
): Promise<Map<string, PilotEvidenceSpan[]>> => {
  const graph = await loadValidatedPilotPolicyEvidenceGraph(root, candidates);
  const result = new Map<string, PilotEvidenceSpan[]>();
  for (const { record, span } of graph) {
    result.set(record.candidateId, [...(result.get(record.candidateId) ?? []), span]);
  }
  return result;
};
```

- [ ] **Step 5: Implement the input graph and leakage gate**

Create `policyMemoryInput.ts` with these exports and behavior:

```ts
export type PolicyMemoryInputGraph = {
  events: PilotDecisionEvent[];
  candidates: EventCandidate[];
  evidenceSpans: PilotEvidenceSpan[];
  policyEvidence: ValidatedPilotPolicyEvidence[];
  sources: AdvisorSourceRecord[];
  documentFamilyBySourceId: Record<string, string>;
  references: EvaluationV3ArtifactReference[];
  holdoutManifest: EvaluationV3HoldoutManifest;
};

export const loadPolicyMemoryInput = async (
  root: string,
): Promise<PolicyMemoryInputGraph> => {
  const candidates = await readJsonFile<EventCandidate[]>(
    join(advisorPaths(root).root, 'event-candidates.json'),
    [],
  );
  const manifest = await loadPilotManifest(root, candidates);
  const cards = await Promise.all(manifest.targets.map(({ candidateId }) =>
    readJsonFile<PilotDecisionEvent | null>(eventCardPath(root, candidateId), null)));
  const events = cards
    .filter((card): card is PilotDecisionEvent => card?.status === 'approved')
    .sort((left, right) => left.id.localeCompare(right.id));
  if (events.length === 0) throw new Error('policy memory requires an approved event');
  const evidenceSpans = events.flatMap((event) => {
    const allowed = new Set([
      ...event.directAmyEvidenceIds,
      ...event.amyPolicyEvidenceIds,
      ...event.contextEvidenceIds,
    ]);
    return event.evidenceSpans.filter(({ id }) => allowed.has(id));
  });
  if (evidenceSpans.some(({ role }) => role === 'post_outcome')) {
    throw new Error('post-outcome evidence is forbidden in policy build');
  }
  const references = buildPolicyMemoryReferences(events, candidates, evidenceSpans);
  const holdoutManifest = await loadEvaluationV3Holdout(root);
  assertNoEvaluationV3Holdout('policy_build', references, holdoutManifest);
  return assembleResolvedGraph(
    events,
    candidates,
    evidenceSpans,
    references,
    holdoutManifest,
    root,
  );
};
```

`buildPolicyMemoryReferences` must include candidate IDs, event IDs, evidence IDs with source/candidate metadata, source IDs, raw-source IDs, and reviewed candidate aliases. `assembleResolvedGraph` fails if a source/evidence ID cannot be resolved. Reflection and policy validators use `graph.holdoutManifest` to scan both explicit references and normalized artifact text for sealed IDs and aliases.

- [ ] **Step 6: Rerun focused and regression tests**

Run:

```bash
npx tsx --test tests/amyHoodAdvisorPolicyMemory.test.ts
npm run advisor:event:report -- --pilot
npm run persona:test
```

Expected: the new selector tests pass, the pilot report remains readable, and all persona tests pass.

- [ ] **Step 7: Commit the input boundary**

```bash
git add shared/amyHoodDecisionAdvisor.ts server/decisionAdvisor/paths.ts server/decisionAdvisor/canonicalJson.ts server/decisionAdvisor/pilotPolicyEvidence.ts server/decisionAdvisor/policyMemoryInput.ts tests/amyHoodAdvisorPolicyMemory.test.ts
git commit -m "feat: seal policy memory inputs"
```

---

### Task 2: Build and validate contrastive reflections

**Files:**
- Create: `agent_prompts/prompts/amy-hood-reflection-builder.md`
- Create: `server/decisionAdvisor/reflectionMemory.ts`
- Modify: `tests/amyHoodAdvisorPolicyMemory.test.ts`

**Interfaces:**
- Consumes: `PolicyMemoryInputGraph`, `ModelClient`.
- Produces: `buildReflectionProposals(graph, model, options): Promise<ReflectionBuildResult>` and `validateReflectionMemory(reflection, graph): PolicyMemoryValidation`.

- [ ] **Step 1: Add the failing reflection assertions to the existing happy, second edge, and failure tests**

Use a model fixture returning one support/contrast reflection:

```ts
const reflectionResponse = JSON.stringify({
  reflections: [{
    domain: 'm_and_a',
    crossEventQuestion: 'When does platform expansion justify acquisition rather than partnership?',
    observation: 'Approved acquisitions prioritize strategic platform reach while partnership preserves flexibility when control is unnecessary.',
    invariant: 'Choose the transaction form only after strategic reach, integration burden, and optionality are ordered.',
    boundaryConditions: ['The target supplies durable platform reach that cannot be obtained through a lower-commitment structure.'],
    unresolvedConflicts: ['Public evidence does not expose the internal hurdle rate.'],
    supportingEventIds: ['event-linkedin-acquisition-2016', 'event-activision-acquisition-2022'],
    contrastingEventIds: ['event-openai-expansion-2023'],
    evidenceIds: ['span-linkedin-direct', 'span-activision-direct', 'span-openai-policy'],
  }],
});

const result = await buildReflectionProposals(graph, createFixtureModel(reflectionResponse), {
  now: '2026-07-15T09:00:00.000Z',
});
assert.equal(result.artifacts.length, 1);
assert.equal(validateReflectionMemory(result.artifacts[0], graph).passed, true);
assert.equal(result.modelRun.attemptCount, 1);
```

Add failure assertions for overlapping support/contrast IDs, unknown evidence, no contrast, holdout aliases in text, and two invalid JSON responses.

- [ ] **Step 2: Run and confirm the missing reflection builder failure**

```bash
npx tsx --test tests/amyHoodAdvisorPolicyMemory.test.ts
```

Expected: FAIL because `reflectionMemory.ts` and its exports do not exist.

- [ ] **Step 3: Write the reflection prompt**

Create `amy-hood-reflection-builder.md` with this complete instruction structure:

```markdown
# Role
You derive bounded cross-event decision reflections from supplied approved evidence.

# Rules
- Use only supplied event and evidence IDs.
- Compare at least two supporting events with at least one materially contrasting event.
- Explain the observable condition that makes the contrast differ.
- Separate observations from inferences.
- Do not use post-outcome success, private motives, personality adjectives, or universal claims.
- Return JSON only. Do not wrap JSON in Markdown.

# Output
{"reflections":[{"domain":"m_and_a","crossEventQuestion":"When does platform expansion justify acquisition rather than partnership?","observation":"Approved acquisitions prioritize durable platform reach while partnership preserves optionality when control is unnecessary.","invariant":"Choose transaction form after ordering strategic reach, durable economics, integration capacity, and optionality.","boundaryConditions":["Acquisition is applicable only when lower-commitment structures cannot deliver the required strategic reach."],"unresolvedConflicts":["Public evidence does not expose the internal hurdle rate."],"supportingEventIds":["event-linkedin-acquisition-2016","event-activision-acquisition-2022"],"contrastingEventIds":["event-openai-expansion-2023"],"evidenceIds":["span-linkedin-direct","span-activision-direct","span-openai-policy"]}]}
```

- [ ] **Step 4: Implement strict parsing, deterministic identity, confidence, and validation**

In `reflectionMemory.ts`:

```ts
export type ReflectionBuildResult = {
  artifacts: ReflectionMemory[];
  modelRun: PolicyMemoryModelRun;
};

export const validateReflectionMemory = (
  reflection: ReflectionMemory,
  graph: PolicyMemoryInputGraph,
): PolicyMemoryValidation => {
  const errors: string[] = [];
  const support = new Set(reflection.supportingEventIds);
  const contrast = new Set(reflection.contrastingEventIds);
  if (support.size === 0) errors.push('reflection requires supporting events');
  if (contrast.size === 0) errors.push('reflection requires a contrasting event');
  if ([...support].some((id) => contrast.has(id))) {
    errors.push('reflection support and contrast must be disjoint');
  }
  resolveReflectionReferencesOrAppendErrors(reflection, graph, errors);
  const references = referencesForReflection(reflection, graph);
  assertNoHoldoutOrAppendError('policy_build', references, graph, errors);
  const computedConfidence = support.size >= 3 ? 'high' : support.size >= 2 ? 'medium' : 'low';
  return { passed: errors.length === 0, errors, warnings: [], computedConfidence, references };
};
```

`buildReflectionProposals` reads the prompt, serializes only the sealed graph fields, calls `model.invoke({system,user})`, retries once after a parse/schema failure, assigns `reflection-${sha256(canonical fields).slice(0,16)}`, computes confidence through the validator, and returns `status='review_required'`, `review=null`. A failed second attempt returns no artifact and a failed `PolicyMemoryModelRun` to the caller; it never writes a proposal.

For both successful and failed parse attempts, assign the run ID as `model-run-${sha256(canonicalJson({kind:'reflection', promptHash, inputHashes, rawResponses})).slice(0,16)}`. A transport failure throws before a model-run object exists and therefore writes no Phase 4 artifact.

- [ ] **Step 5: Verify reflection behavior**

```bash
npx tsx --test tests/amyHoodAdvisorPolicyMemory.test.ts
npm run evaluation:v3:test
```

Expected: policy-memory reflection cases and all Evaluation v3 leakage regressions pass.

- [ ] **Step 6: Commit reflections**

```bash
git add agent_prompts/prompts/amy-hood-reflection-builder.md server/decisionAdvisor/reflectionMemory.ts tests/amyHoodAdvisorPolicyMemory.test.ts
git commit -m "feat: derive contrastive decision reflections"
```

---

### Task 3: Induce conditional policies with evidence thresholds

**Files:**
- Create: `agent_prompts/prompts/amy-hood-policy-inducer.md`
- Create: `server/decisionAdvisor/policyMemory.ts`
- Modify: `tests/amyHoodAdvisorPolicyMemory.test.ts`

**Interfaces:**
- Consumes: approved `ReflectionMemory[]`, `PolicyMemoryInputGraph`, `ModelClient`.
- Produces: `buildPolicyProposals(reflections, graph, model, options): Promise<PolicyBuildResult>` and `validatePolicyMemory(policy, reflections, graph): PolicyMemoryValidation`.

- [ ] **Step 1: Add failing policy tests to the existing happy path and first two edge cases**

The happy path uses two acquisition events and an OpenAI partnership contrast. The first edge uses one direct Amy policy record plus confirmation from another event and a distinct document family. The second edge confirms that the contrast narrows applicability and supplies `REVERSE IF` rather than deleting the rule.

```ts
const policyResponse = JSON.stringify({
  policies: [{
    domain: 'm_and_a',
    applicabilityConditions: ['Strategic platform reach is durable and cannot be obtained with a lower-commitment structure.'],
    priorityOrder: ['Strategic reach', 'Durable economics', 'Integration capacity', 'Optionality'],
    recommendedAction: 'Use acquisition only after partnership and organic alternatives fail the strategic-reach test.',
    nonApplicabilityConditions: ['A partnership preserves sufficient access and learning.'],
    exceptions: ['Delay commitment when integration capacity or durable economics is unverified.'],
    reversalSignals: ['A partnership reaches the same strategic objective with materially lower irreversible commitment.'],
    reflectionIds: [reflection.id],
    supportingEventIds: ['event-linkedin-acquisition-2016', 'event-activision-acquisition-2022'],
    contrastingEventIds: ['event-openai-expansion-2023'],
    evidenceIds: ['span-linkedin-direct', 'span-activision-direct', 'span-openai-policy'],
    directPolicyEvidenceIds: [],
  }],
});
```

Failure assertions cover a one-event generalization, same-document “independent” confirmation, missing exception, missing reversal signal, unknown reflection, and holdout text/reference leakage.

- [ ] **Step 2: Confirm the policy module is missing**

```bash
npx tsx --test tests/amyHoodAdvisorPolicyMemory.test.ts
```

Expected: FAIL because `policyMemory.ts` does not exist.

- [ ] **Step 3: Write the policy induction prompt**

Create `amy-hood-policy-inducer.md`:

```markdown
# Role
Convert approved cross-event reflections into bounded CFO decision policies.

# Required logic
WHEN observable applicability conditions hold,
PRIORITIZE criteria in the supplied order,
THEN recommend a bounded action,
EXCEPT WHEN a named boundary applies,
REVERSE IF an observable signal changes the recommendation.

# Evidence rules
- Cite only supplied reflection, event, evidence, and direct-policy-evidence IDs.
- A general policy needs two supporting events, or one direct Amy principle confirmed by another event and document family.
- Preserve the contrasting event as a boundary, exception, or reversal signal.
- Do not use post-outcome success, private motives, personality adjectives, or facts absent from the input.
- Return JSON only with a top-level `policies` array.
```

- [ ] **Step 4: Implement deterministic policy classification**

Use this public shape in `policyMemory.ts`:

```ts
export type PolicyBuildResult = {
  artifacts: PolicyMemory[];
  modelRun: PolicyMemoryModelRun;
};

export const validatePolicyMemory = (
  policy: PolicyMemory,
  reflections: ReflectionMemory[],
  graph: PolicyMemoryInputGraph,
): PolicyMemoryValidation => {
  const errors: string[] = [];
  validateNonemptyPolicyFields(policy, errors);
  resolvePolicyReferencesOrAppendErrors(policy, reflections, graph, errors);
  const repeatedEventPath = new Set(policy.supportingEventIds).size >= 2;
  const directPrinciplePath = hasIndependentDirectConfirmation(policy, graph);
  if (!repeatedEventPath && !directPrinciplePath) {
    errors.push('policy requires two supporting events or direct principle plus independent confirmation');
  }
  if (policy.contrastingEventIds.length === 0) errors.push('policy requires a reviewed contrast');
  if (policy.exceptions.length + policy.nonApplicabilityConditions.length === 0) {
    errors.push('policy requires an exception or non-applicability condition');
  }
  if (policy.reversalSignals.length === 0) errors.push('policy requires a reversal signal');
  const computedConfidence = computePolicyConfidence(policy, graph);
  const references = referencesForPolicy(policy, graph);
  assertNoHoldoutOrAppendError('policy_build', references, graph, errors);
  return { passed: errors.length === 0, errors, warnings: [], computedConfidence, references };
};
```

`computePolicyConfidence` implements the spec exactly. The builder overrides model-supplied classification: medium/high passing output becomes `deployable_policy`; all other output becomes low-confidence `event_specific_hypothesis`. IDs are `policy-${sha256(canonical fields).slice(0,16)}`.

Assign the policy model-run ID as `model-run-${sha256(canonicalJson({kind:'policy', promptHash, inputHashes, rawResponses})).slice(0,16)}` so persistence accepts the same validated ID format as reflection runs.

- [ ] **Step 5: Verify policy thresholds and all existing event tests**

```bash
npx tsx --test tests/amyHoodAdvisorPolicyMemory.test.ts
npx tsx --test tests/amyHoodAdvisorEventPilot.test.ts
npm run persona:test
```

Expected: all tests pass, including the existing Phase 3 event-card suite.

- [ ] **Step 6: Commit policies**

```bash
git add agent_prompts/prompts/amy-hood-policy-inducer.md server/decisionAdvisor/policyMemory.ts tests/amyHoodAdvisorPolicyMemory.test.ts
git commit -m "feat: induce evidence-bound decision policies"
```

---

### Task 4: Persist proposals and apply auditable Codex review

**Files:**
- Create: `server/decisionAdvisor/policyMemoryStore.ts`
- Modify: `tests/amyHoodAdvisorPolicyMemory.test.ts`

**Interfaces:**
- Consumes: reflection/policy build results and current `PolicyMemoryInputGraph`.
- Produces: `saveReflectionBuild`, `savePolicyBuild`, `buildPolicyMemoryGateReport`, `approvePolicyMemoryArtifact`.

- [ ] **Step 1: Add failing persistence and approval assertions**

Extend the happy path to assert:

```ts
await saveReflectionBuild(root, reflectionBuild);
await savePolicyBuild(root, policyBuild);
const report = await buildPolicyMemoryGateReport(root, graph);
assert.deepEqual(report.passing.reflections, [reflection.id]);
assert.deepEqual(report.passing.policies, [policy.id]);
const approved = await approvePolicyMemoryArtifact(root, {
  kind: 'policy',
  id: policy.id,
  reviewer: 'Codex',
  reviewedAt: '2026-07-15T09:30:00.000Z',
  rationale: 'The cited events support the ordering, and the partnership contrast bounds acquisition use.',
}, graph);
assert.equal(approved.status, 'approved');
assert.match(approved.review!.validationHash, /^[a-f0-9]{64}$/);
```

The grouped failure test asserts that a stale evidence graph, failing validation, blank rationale, invalid timestamp, or injected write failure creates no approved artifact and does not overwrite an existing approval.

- [ ] **Step 2: Confirm the store module is missing**

```bash
npx tsx --test tests/amyHoodAdvisorPolicyMemory.test.ts
```

Expected: FAIL because `policyMemoryStore.ts` does not exist.

- [ ] **Step 3: Implement proposal/model-run persistence and the gate report**

Use one JSON file per artifact and one per model run. File names are the already validated artifact/run IDs plus `.json`; reject IDs that do not match `/^(reflection|policy|model-run)-[a-f0-9]{16}$/` before resolving a path.

```ts
export type PolicyMemoryGateReport = {
  generatedAt: string;
  inputEventIds: string[];
  passing: { reflections: string[]; policies: string[] };
  reviewRequired: Array<{ kind: 'reflection' | 'policy'; id: string; errors: string[] }>;
  blocked: string[];
};

export const saveReflectionBuild = async (root: string, result: ReflectionBuildResult) => {
  await writeJsonAtomic(modelRunPath(root, result.modelRun.id), result.modelRun);
  if (result.modelRun.status === 'failed') return;
  for (const artifact of result.artifacts) {
    await writeJsonAtomic(reflectionProposalPath(root, artifact.id), artifact);
  }
};
```

Add this policy writer and a gate report that revalidates proposals against the current graph, sorted by ID:

```ts
export const savePolicyBuild = async (root: string, result: PolicyBuildResult) => {
  await writeJsonAtomic(modelRunPath(root, result.modelRun.id), result.modelRun);
  if (result.modelRun.status === 'failed') return;
  for (const artifact of result.artifacts) {
    await writeJsonAtomic(policyProposalPath(root, artifact.id), artifact);
  }
};

export const buildPolicyMemoryGateReport = async (
  root: string,
  graph: PolicyMemoryInputGraph,
): Promise<PolicyMemoryGateReport> => {
  const reflections = await loadReflectionProposals(root);
  const policies = await loadPolicyProposals(root);
  const reflectionResults = reflections.map((artifact) => ({
    artifact,
    validation: validateReflectionMemory(artifact, graph),
  }));
  const policyResults = policies.map((artifact) => ({
    artifact,
    validation: validatePolicyMemory(artifact, reflections, graph),
  }));
  const report = gateReportFromResults(graph.events, reflectionResults, policyResults);
  await writeJsonAtomic(advisorPaths(root).policyGateReport, report);
  return report;
};
```

- [ ] **Step 4: Implement approval as revalidation plus copy-on-approve**

```ts
export type PolicyMemoryApprovalInput = {
  kind: 'reflection' | 'policy';
  id: string;
  reviewer: 'Codex';
  reviewedAt: string;
  rationale: string;
};

export const approvePolicyMemoryArtifact = async (
  root: string,
  input: PolicyMemoryApprovalInput,
  graph: PolicyMemoryInputGraph,
): Promise<ReflectionMemory | PolicyMemory> => {
  assertApprovalInput(input);
  const proposal = await readProposal(root, input.kind, input.id);
  const validation = revalidateProposal(proposal, graph);
  if (!validation.passed) throw new Error(`cannot approve ${input.id}: ${validation.errors.join('; ')}`);
  if (input.kind === 'policy'
    && (proposal.policyKind !== 'deployable_policy' || validation.computedConfidence === 'low')) {
    throw new Error(`cannot approve nondeployable policy: ${input.id}`);
  }
  const validationHash = sha256(canonicalJson(validation));
  const approved = { ...proposal, confidence: validation.computedConfidence, status: 'approved', review: {
    reviewer: 'Codex', reviewedAt: input.reviewedAt, decision: 'approved',
    rationale: input.rationale.trim(), validationHash,
  }};
  await commitApprovalPairWithRollback(
    approvedArtifactPath(root, input.kind, input.id),
    approved,
    reviewPath(root, input.kind, input.id),
    approved.review,
  );
  return approved;
};
```

`commitApprovalPairWithRollback` snapshots any prior destination bytes, writes both through `writeJsonAtomic`, and restores or removes both destinations if either write fails. If compensation itself fails, throw an `AggregateError` containing the original and compensation errors. The failure test compares both destination bytes before and after the injected second-write failure.

- [ ] **Step 5: Run policy-memory tests**

```bash
npx tsx --test tests/amyHoodAdvisorPolicyMemory.test.ts
```

Expected: proposal, gate-report, approval, and safe-failure assertions pass.

- [ ] **Step 6: Commit the review boundary**

```bash
git add server/decisionAdvisor/policyMemoryStore.ts tests/amyHoodAdvisorPolicyMemory.test.ts
git commit -m "feat: review and approve policy memory"
```

---

### Task 5: Build, verify, activate, and load immutable releases

**Files:**
- Create: `server/decisionAdvisor/memoryReleaseStore.ts`
- Modify: `server/evaluationV3/context.ts`
- Create: `tests/helpers/evaluationV3MemoryFixture.ts`
- Modify: `tests/amyHoodAdvisorPolicyMemory.test.ts`
- Modify: `tests/amyHoodEvaluationV3Prompt.test.ts`
- Modify: `tests/amyHoodEvaluationV3Runner.test.ts`

**Interfaces:**
- Consumes: current input graph and approved reflections/policies.
- Produces: `buildMemoryRelease`, `verifyMemoryRelease`, `activateMemoryRelease`, and a manifest-verified Evaluation v3 context.

- [ ] **Step 1: Complete the happy path, third edge case, and tamper failure tests**

Add these assertions:

```ts
const first = await buildMemoryRelease(root, {
  graph,
  now: '2026-07-15T10:00:00.000Z',
});
const second = await buildMemoryRelease(root, {
  graph,
  now: '2026-07-15T10:05:00.000Z',
});
assert.equal(second.manifest.releaseId, first.manifest.releaseId);
assert.equal(second.created, false);
await activateMemoryRelease(root, first.manifest.version, '2026-07-15T10:10:00.000Z');
const policyContext = await resolveEvaluationV3ArmContext(root, 'amy_policy_rag');
const fullContext = await resolveEvaluationV3ArmContext(root, 'amy_full_rag');
assert.equal(policyContext.context.memoryReleaseId, first.manifest.releaseId);
assert.equal(fullContext.context.counterexamples.length > 0, true);
```

Tamper with `evaluation-context.json` after activation and assert that `resolveEvaluationV3ArmContext` rejects with a hash mismatch before any Gemma call. Inject a rename failure during activation and assert the previous `active.json` bytes remain identical.

- [ ] **Step 2: Confirm release behavior is not implemented**

```bash
npx tsx --test tests/amyHoodAdvisorPolicyMemory.test.ts tests/amyHoodEvaluationV3Runner.test.ts
```

Expected: FAIL on missing release exports or absent manifest verification.

- [ ] **Step 3: Implement canonical release projection**

In `memoryReleaseStore.ts`, export:

```ts
export type BuiltMemoryRelease = {
  manifest: MemoryReleaseManifest;
  directory: string;
  created: boolean;
};

export const buildMemoryRelease = async (
  root: string,
  input: { graph: PolicyMemoryInputGraph; now?: string },
): Promise<BuiltMemoryRelease> => {
  const approved = await loadApprovedMemory(root);
  assertReleaseableGraph(approved, input.graph);
  const evaluationContext = buildEvaluationContext(approved, input.graph);
  assertNoEvaluationV3Holdout('memory_release', evaluationContext.references, await loadEvaluationV3Holdout(root));
  const hashes = await hashReleasePayload(approved, evaluationContext, root);
  const version = `v1-${hashes.contentHash.slice(0, 12)}`;
  const existing = await verifyExistingOrNull(root, version);
  if (existing) return { manifest: existing, directory: releasePath(root, version), created: false };
  return stageValidateAndRenameRelease(root, version, approved, evaluationContext, hashes, input.now);
};
```

`buildEvaluationContext` serializes complete compact JSON objects sorted by ID. `counterexamples` contains the contrasting event projection for every approved reflection, and `counterexampleStatus` is always `reviewed` for a Phase 4 release.

`hashReleasePayload` hashes canonical approved artifacts, exact evaluation-context bytes, review-ledger bytes, source-registry bytes, pilot-manifest bytes, and holdout-manifest bytes. It excludes `createdAt`, temporary paths, and activation timestamps so identical content produces the same version on rebuild.

- [ ] **Step 4: Implement complete verification and atomic activation**

```ts
export const verifyMemoryRelease = async (
  root: string,
  version: string,
): Promise<MemoryReleaseManifest> => {
  const manifestBytes = await readFile(join(releasePath(root, version), 'manifest.json'));
  const manifest = JSON.parse(manifestBytes.toString('utf8')) as MemoryReleaseManifest;
  assertManifestIdentity(manifest, version);
  await verifyEveryArtifactHash(root, version, manifest);
  await verifyContextAndReviewHashes(root, version, manifest);
  await assertReleaseHasNoHoldout(root, version, manifest);
  return manifest;
};

export const activateMemoryRelease = async (
  root: string,
  version: string,
  activatedAt = new Date().toISOString(),
) => {
  const manifest = await verifyMemoryRelease(root, version);
  const manifestText = await readFile(join(releasePath(root, version), 'manifest.json'), 'utf8');
  const pointer = {
    releaseId: manifest.releaseId,
    version: manifest.version,
    manifestHash: sha256(manifestText),
    activatedAt,
  };
  await writeJsonAtomic(advisorPaths(root).activeMemoryRelease, pointer);
  return pointer;
};
```

Create the release staging path with:

```ts
join(advisorPaths(root).memoryReleases, `.staging-${randomUUID()}`)
```

Rename is the only publication step. Clean staging on error; never delete or rewrite a prior release.

- [ ] **Step 5: Harden the Evaluation v3 context loader**

Before reading `evaluation-context.json`, `context.ts` must:

1. read `join(memoryReleaseRoot(root), active.version, 'manifest.json')` as text;
2. verify its SHA-256 equals `active.manifestHash`;
3. verify manifest `releaseId` and `version` match the pointer;
4. hash the exact context text and compare with `manifest.evaluationContextHash`;
5. retain the existing context schema and holdout checks.

The returned `memoryReleaseHash` remains the exact evaluation-context file hash, preserving current runner pinning.

Create `tests/helpers/evaluationV3MemoryFixture.ts` with this helper, then replace the hand-written pointers in `amyHoodEvaluationV3Prompt.test.ts` and `amyHoodEvaluationV3Runner.test.ts` so their fixtures satisfy the production contract:

```ts
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { MemoryReleaseManifest } from '../../shared/amyHoodDecisionAdvisor';
import type { EvaluationV3ContextPackage } from '../../server/evaluationV3/context';
import type { EvaluationV3ArtifactReference } from '../../server/evaluationV3/holdout';

const digest = (text: string) => createHash('sha256').update(text).digest('hex');

export const writeEvaluationV3MemoryFixture = async (
  root: string,
  snapshot: Omit<EvaluationV3ContextPackage, 'memoryReleaseId'> & {
    counterexampleStatus: 'reviewed' | 'no_reviewed_counterexample';
    references: EvaluationV3ArtifactReference[];
  },
) => {
  const version = '1.0.0';
  const releaseId = 'memory-1.0.0';
  const directory = join(root, 'data/b-track/amy-hood/advisor/memory-releases', version);
  await mkdir(directory, { recursive: true });
  const contextText = `${JSON.stringify({
    ...snapshot,
    releaseId,
  })}\n`;
  await writeFile(join(directory, 'evaluation-context.json'), contextText);
  const manifest: MemoryReleaseManifest = {
    schemaVersion: 1,
    releaseId,
    version,
    createdAt: '2026-07-15T00:00:00.000Z',
    sourceRegistryHash: 'a'.repeat(64),
    pilotManifestHash: 'b'.repeat(64),
    holdoutManifestHash: 'c'.repeat(64),
    artifacts: [],
    evaluationContextPath: 'evaluation-context.json',
    evaluationContextHash: digest(contextText),
    reviewLedgerHash: 'd'.repeat(64),
  };
  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  await writeFile(join(directory, 'manifest.json'), manifestText);
  await writeFile(
    join(root, 'data/b-track/amy-hood/advisor/memory-releases/active.json'),
    `${JSON.stringify({
      releaseId,
      version,
      manifestHash: digest(manifestText),
      activatedAt: '2026-07-15T00:00:00.000Z',
    })}\n`,
  );
};
```

- [ ] **Step 6: Run release, runner, and holdout tests**

```bash
npx tsx --test tests/amyHoodAdvisorPolicyMemory.test.ts tests/amyHoodEvaluationV3Runner.test.ts tests/amyHoodEvaluationV3Holdout.test.ts
```

Expected: happy release, idempotence, hash tamper, activation rollback, and holdout cases pass.

- [ ] **Step 7: Commit immutable releases**

```bash
git add server/decisionAdvisor/memoryReleaseStore.ts server/evaluationV3/context.ts tests/helpers/evaluationV3MemoryFixture.ts tests/amyHoodAdvisorPolicyMemory.test.ts tests/amyHoodEvaluationV3Prompt.test.ts tests/amyHoodEvaluationV3Runner.test.ts
git commit -m "feat: publish immutable advisor memory releases"
```

---

### Task 6: Expose the Phase 4 CLI and complete code-level verification

**Files:**
- Create: `server/decisionAdvisor/policyMemoryCli.ts`
- Modify: `server/runAmyHoodDecisionAdvisor.ts`
- Modify: `package.json`
- Modify: `tests/amyHoodAdvisorPolicyMemory.test.ts`

**Interfaces:**
- Consumes: Task 1–5 public functions.
- Produces: `runPolicyMemoryCommand(root, args): Promise<boolean>` and npm operator commands.

- [ ] **Step 1: Add failing command-dispatch assertions without spawning subprocesses**

Test the exported command function with injected model/time dependencies:

```ts
assert.equal(await runPolicyMemoryCommand(root, ['memory:build', '--kind', 'reflection'], deps), true);
assert.equal(await runPolicyMemoryCommand(root, ['memory:check'], deps), true);
assert.equal(await runPolicyMemoryCommand(root, ['not-a-memory-command'], deps), false);
await assert.rejects(
  () => runPolicyMemoryCommand(root, ['memory:approve', '--kind', 'policy', '--all-passing'], deps),
  /review evidence before approving/,
);
```

The approval command requires `--review-confirmed`, `--reviewer Codex`, and a nonblank `--rationale`. This flag records the delegated Codex review; it is not used by builders.

- [ ] **Step 2: Confirm CLI tests fail**

```bash
npx tsx --test tests/amyHoodAdvisorPolicyMemory.test.ts
```

Expected: FAIL because `policyMemoryCli.ts` does not exist.

- [ ] **Step 3: Implement focused command dispatch**

Create this public boundary:

```ts
export type PolicyMemoryCliDependencies = {
  createModel(): ModelClient;
  now(): string;
  log(value: string): void;
};

export const runPolicyMemoryCommand = async (
  root: string,
  args: string[],
  dependencies: PolicyMemoryCliDependencies = defaultDependencies,
): Promise<boolean> => {
  const command = args[0];
  if (!command?.startsWith('memory:')) return false;
  if (command === 'memory:build') return runBuild(root, args, dependencies);
  if (command === 'memory:check') return runCheck(root, dependencies);
  if (command === 'memory:approve') return runApprove(root, args, dependencies);
  if (command === 'memory:release') return runRelease(root, dependencies);
  if (command === 'memory:activate') return runActivate(root, args, dependencies);
  throw new Error(`unknown policy memory command: ${command}`);
};
```

`memory:build --kind reflection` builds and saves reflections. `--kind policy` loads approved reflections first. `memory:approve --kind reflection|policy --all-passing --review-confirmed --reviewer Codex --rationale "Approved after evidence-context inspection."` revalidates every passing ID and approves them in stable ID order. `memory:activate --latest` selects the verified release with the newest manifest `createdAt`, breaking ties by version.

- [ ] **Step 4: Delegate from the existing CLI and add scripts**

At the start of `run()` in `runAmyHoodDecisionAdvisor.ts`, after resolving `root`:

```ts
if (await runPolicyMemoryCommand(root, args)) return;
```

Add these scripts to `package.json`:

```json
"advisor:policy-memory:test": "tsx --test tests/amyHoodAdvisorPolicyMemory.test.ts",
"advisor:memory:build": "tsx server/runAmyHoodDecisionAdvisor.ts memory:build",
"advisor:memory:check": "tsx server/runAmyHoodDecisionAdvisor.ts memory:check",
"advisor:memory:approve": "tsx server/runAmyHoodDecisionAdvisor.ts memory:approve",
"advisor:memory:release": "tsx server/runAmyHoodDecisionAdvisor.ts memory:release",
"advisor:memory:activate": "tsx server/runAmyHoodDecisionAdvisor.ts memory:activate"
```

- [ ] **Step 5: Run complete code-level verification**

```bash
npm run advisor:policy-memory:test
npm run evaluation:v3:test
npm run evaluation:test
npm run persona:test
npm run lint
npm run build
git diff --check
```

Expected: all tests, TypeScript checking, and production build pass; `git diff --check` prints no output. The Vite chunk-size warning is nonblocking if the build exits 0.

- [ ] **Step 6: Commit the CLI**

```bash
git add server/decisionAdvisor/policyMemoryCli.ts server/runAmyHoodDecisionAdvisor.ts package.json tests/amyHoodAdvisorPolicyMemory.test.ts
git commit -m "feat: operate Phase 4 policy memory"
```

---

### Task 7: Run the real current-data policy build and approve only supported artifacts

**Files:**
- Generate: `data/b-track/amy-hood/advisor/policy-memory/proposals/reflections/*.json`
- Generate: `data/b-track/amy-hood/advisor/policy-memory/proposals/policies/*.json`
- Generate: `data/b-track/amy-hood/advisor/policy-memory/proposals/model-runs/*.json`
- Generate: `data/b-track/amy-hood/advisor/policy-memory/approved/reflections/*.json`
- Generate: `data/b-track/amy-hood/advisor/policy-memory/approved/policies/*.json`
- Generate: `data/b-track/amy-hood/advisor/policy-memory/reviews/*.json`
- Generate: `data/b-track/amy-hood/advisor/policy-memory/gate-report.json`
- Generate: `data/b-track/amy-hood/advisor/memory-releases/v1-*/**`
- Generate: `data/b-track/amy-hood/advisor/memory-releases/active.json`

**Interfaces:**
- Consumes: the real five approved events, three verified policy-evidence records, and local Gemma 4.
- Produces: an active release or an exact evidence-gap report that blocks RAG evaluation safely.

- [ ] **Step 1: Verify the local Gemma endpoint before writing proposals**

Run:

```bash
curl --fail --silent http://127.0.0.1:8080/v1/models
```

Expected: HTTP 200 and a JSON model list containing the configured Gemma model. If unavailable, stop this task without changing policy-memory artifacts.

- [ ] **Step 2: Build and inspect real reflections**

```bash
npm run advisor:memory:build -- --kind reflection
npm run advisor:memory:check
```

Open every passing reflection and its cited event/evidence spans. Confirm support and contrast are semantically material, not merely different domains. If none pass, retain the gate report and stop before approval.

- [ ] **Step 3: Approve passing reflections after Codex evidence review**

```bash
npm run advisor:memory:approve -- --kind reflection --all-passing --review-confirmed --reviewer Codex --rationale "Approved after checking cited event evidence, material contrast, bounded invariant, and holdout exclusion."
```

Expected: only the IDs listed under `passing.reflections` are copied to `approved/reflections` with review records.

- [ ] **Step 4: Build, inspect, and approve real policies**

```bash
npm run advisor:memory:build -- --kind policy
npm run advisor:memory:check
```

Inspect each passing policy against its reflections and evidence. Reject a policy if its priority ordering, exception, or reversal signal is not entailed by public evidence even when deterministic validation passes. After review:

```bash
npm run advisor:memory:approve -- --kind policy --all-passing --review-confirmed --reviewer Codex --rationale "Approved after checking support threshold, priority ordering, boundary, exception, reversal signal, and independent evidence."
```

- [ ] **Step 5: Build, verify, and activate the release**

```bash
npm run advisor:memory:release
npm run advisor:memory:activate -- --latest
npm run advisor:memory:check
```

Expected: the gate report identifies one active verified release; both policy and full context are nonempty. If no deployable policy exists, the release command must fail with `no deployable policy` and leave `active.json` unchanged.

- [ ] **Step 6: Verify repository artifacts and commit the reviewed memory release**

```bash
npm run advisor:policy-memory:test
npm run evaluation:v3:test
git diff --check
git status --short
git add data/b-track/amy-hood/advisor/policy-memory data/b-track/amy-hood/advisor/memory-releases
git commit -m "data: publish reviewed Amy Hood policy memory"
```

Expected: generated proposals retain raw model traceability; only reviewed deployable artifacts appear in the active release.

---

### Task 8: Approve the 30-question benchmark and run the first real four-arm evaluation

**Files:**
- Modify: `server/evaluationV3/questionSet.ts`
- Modify: `tests/amyHoodEvaluationV3QuestionSet.test.ts`
- Create: `server/runAmyHoodEvaluationV3.ts`
- Modify: `package.json`
- Modify: `evaluation/v3/public/reviews.json`
- Create: `docs/reports/2026-07-15-amy-hood-phase-4-gemma-evaluation.md`
- Generate: `evaluation/v3/runs/*.json`

**Interfaces:**
- Consumes: active prompt version, active memory release, approved question bundle, and local Gemma 4.
- Produces: `approveAllEvaluationV3Reviews(root, reviewedAt)`, a synchronous Evaluation v3 CLI, four completed run IDs, and a quantitative report.

- [ ] **Step 1: Add the failing atomic bulk-approval assertion inside the existing question-set happy path**

Do not add a fourth edge case to the existing test plan. Extend the happy-path family with:

```ts
const approved = await approveAllEvaluationV3Reviews(
  root,
  '2026-07-15T11:00:00.000Z',
);
assert.equal(approved.reviews.length, 30);
assert.equal(approved.reviews.every(({ status, revisionNote, reviewedAt }) =>
  status === 'approved'
  && revisionNote === ''
  && reviewedAt === '2026-07-15T11:00:00.000Z'), true);
```

Add one failure assertion to the existing failure test: an invalid timestamp must reject without changing review-file bytes.

- [ ] **Step 2: Confirm the new export is absent**

```bash
npx tsx --test tests/amyHoodEvaluationV3QuestionSet.test.ts
```

Expected: FAIL because `approveAllEvaluationV3Reviews` is not exported.

- [ ] **Step 3: Implement atomic all-question approval**

Add to `questionSet.ts`:

```ts
export const approveAllEvaluationV3Reviews = async (
  root: string,
  reviewedAt = new Date().toISOString(),
) => {
  if (new Date(reviewedAt).toISOString() !== reviewedAt) {
    throw new Error('Evaluation v3 review timestamp is invalid');
  }
  const reviews = await loadEvaluationV3Reviews(root);
  if (reviews.reviews.length !== 30) {
    throw new Error('Evaluation v3 requires exactly 30 reviews');
  }
  const next: EvaluationV3ReviewFile = {
    ...reviews,
    reviews: reviews.reviews.map((review) => ({
      ...review,
      status: 'approved',
      revisionNote: '',
      reviewedAt,
    })),
  };
  await writeJsonAtomic(paths(root).reviews, next);
  return next;
};
```

- [ ] **Step 4: Create the synchronous Evaluation v3 CLI**

`server/runAmyHoodEvaluationV3.ts` supports only these commands:

```ts
// approve-all
await approveAllEvaluationV3Reviews(root);

// run --repetitions 1
const runner = createEvaluationV3Runner({
  root,
  createModel: () => createModelClient('local'),
});
const launch = await runner.createExperiment({ repetitions: 1 });
const runs = await runner.executeExperiment(launch.runs.map(({ runId }) => runId));
console.log(JSON.stringify({ experimentGroupId: launch.experimentGroupId, runs }, null, 2));
if (runs.some(({ status }) => status !== 'complete')) process.exitCode = 1;
```

Reject other repetition values and providers. Add scripts:

```json
"advisor:evaluation-v3:approve-all": "tsx server/runAmyHoodEvaluationV3.ts approve-all",
"advisor:evaluation-v3:run": "tsx server/runAmyHoodEvaluationV3.ts run"
```

- [ ] **Step 5: Verify readiness, then change all 30 persisted reviews**

```bash
npm run advisor:evaluation-v3:approve-all
npm run evaluation:v3:test
```

Then verify:

```bash
jq '[.reviews[] | select(.status == "approved")] | length' evaluation/v3/public/reviews.json
```

Expected: `30`.

- [ ] **Step 6: Execute one real four-arm experiment synchronously**

```bash
npm run advisor:evaluation-v3:run -- --repetitions 1
```

Expected: one experiment group with four run IDs, 30 complete answers per run, and no stale-artifact or holdout error. If Gemma fails mid-run, preserve run state and resume through the existing runner/API rather than deleting results.

- [ ] **Step 7: Write the evaluation report from stored runs**

Create `docs/reports/2026-07-15-amy-hood-phase-4-gemma-evaluation.md` with these fixed sections and values calculated from the run store:

```markdown
# Amy Hood Phase 4 Gemma 4 Evaluation Report

## 1. Execution identity
- Experiment group ID
- Four run IDs
- Model name
- Prompt hashes
- Question and answer-key hashes
- Holdout-manifest hash
- Active memory release ID and hash

## 2. Data and policy gate
- Approved input event count
- Approved reflection count
- Approved deployable policy count
- Reviewed contrast count
- Rejected/hypothesis counts and reasons
- Holdout leakage count

## 3. Four-arm results
| Arm | D / 10 | H / 10 | C / 6 | T / 4 | Total / 30 | Percent |

## 4. Ablation lift
- Amy Prompt minus Generic CFO
- Policy RAG minus Amy Prompt
- Full RAG minus Policy RAG
- Full RAG minus Generic CFO

## 5. Integrity and failures
- Choice-reason mismatch count
- Failed question count
- Input/output tokens
- Elapsed time
- Benchmark rejection check: Generic CFO above 80%

## 6. Final judgment
- Whether the current result supports pipeline functionality
- Whether it supports an Amy-specific decision-style claim
- Concrete evidence or evaluation changes required next
```

Do not call a high absolute score persona replication. If Generic CFO exceeds 80%, state that Evaluation v3 lacks sufficient discrimination and reject the benchmark claim.

- [ ] **Step 8: Run final verification and commit evaluation evidence**

```bash
npm run advisor:policy-memory:test
npm run evaluation:v3:test
npm run evaluation:test
npm run persona:test
npm run lint
npm run build
git diff --check
git status --short
git add server/evaluationV3/questionSet.ts server/runAmyHoodEvaluationV3.ts tests/amyHoodEvaluationV3QuestionSet.test.ts package.json evaluation/v3/public/reviews.json evaluation/v3/runs docs/reports/2026-07-15-amy-hood-phase-4-gemma-evaluation.md
git commit -m "test: run Phase 4 Gemma evaluation"
```

Expected: all verification commands exit 0. The report, review file, and four immutable run records are committed as the reproducible evidence for this PoC experiment.

---

## Completion Gate

Do not declare Phase 4 complete until every statement below is evidenced:

- The policy-memory test file passes with one happy path, exactly three edge cases, and grouped realistic failure coverage.
- Existing Evaluation v3, v2 evaluation, persona, TypeScript, and build checks pass.
- Every approved policy has two-event support or qualifying direct-principle confirmation, plus a reviewed contrast and reversal signal.
- The active pointer and every release/context hash verify from disk.
- Holdout leakage count is zero.
- All 30 Evaluation v3 questions are approved.
- The first four-arm run is complete, or its external Gemma failure is persisted and resumable without artifact corruption.
- The report distinguishes pipeline readiness from Amy Hood decision-style fidelity.
