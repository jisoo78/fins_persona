# Amy Hood Decision Advisor Phase 4 Policy Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive reviewable conditional decision policies from train/development events and publish an immutable three-layer memory release containing events, reflections, and policies.

**Architecture:** Policy induction is evidence-bound and release-gated. Reflections compare supporting and contrasting events; policies encode condition, priority, action, exception, and reversal signal. Structured hybrid retrieval ranks complete artifacts, while the context packer drops low-ranked artifacts instead of truncating their meaning.

**Tech Stack:** TypeScript 5.8, Gemma 4 local endpoint, Python 3, local BGE-M3 embeddings, JSON/JSONL, `tsx --test`.

## Global Constraints

- Build from train and development events only; holdout is forbidden.
- A deployable policy requires two supporting events, or one direct Amy principle plus independent confirmation.
- Every reflection requires at least one supporting event and one contrasting/counterexample event.
- Low-confidence policies remain review-only and cannot enter an active release.
- Store artifact IDs and evidence links in retrieval payloads; never flatten memory into untraceable prose.
- Context packing must fit the 16,384-token Gemma budget without splitting structured artifacts.
- Follow the AGENTS.md Test Plan format.

---

### Task 1: Define reflection, policy, and release contracts

**Files:**
- Modify: `shared/amyHoodDecisionAdvisor.ts`
- Create: `tests/amyHoodAdvisorPolicyMemory.test.ts`

**Interfaces:**
- Produces: `ReflectionMemory`, `PolicyMemory`, `MemoryRelease`, and `MemoryArtifactRef`.

- [ ] **Step 1: Start with the required test plan and a failing type test**

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - approved train/development events produce linked reflections, policies, and an immutable memory release.
 *
 * 2. Edge Cases:
 *    - one direct principle plus independent confirmation can support a medium-confidence policy.
 *    - a counterexample narrows a policy instead of invalidating the entire artifact.
 *    - an oversized retrieval pack drops the lowest-ranked whole artifact.
 *
 * 3. Failure Path:
 *    - holdout leakage, unsupported policy claims, missing contrasts, low-confidence release, or embedding failure blocks activation safely.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { PolicyMemory, ReflectionMemory } from '../shared/amyHoodDecisionAdvisor';

test('happy: policy points to reflections and concrete supporting events', () => {
  const policy = {
    id: 'pol-001', reflectionIds: ['ref-001'], supportingEventIds: ['evt-001', 'evt-002'],
  } as PolicyMemory;
  const reflection = { id: 'ref-001', supportingEventIds: ['evt-001'] } as ReflectionMemory;
  assert.equal(policy.reflectionIds[0], reflection.id);
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npx tsx --test tests/amyHoodAdvisorPolicyMemory.test.ts
```

- [ ] **Step 3: Add shared contracts**

```ts
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
  evidenceSpanIds: string[];
  confidence: 'high' | 'medium' | 'low';
  status: ArtifactStatus;
  reviewer: string | null;
};

export type PolicyMemory = {
  id: string;
  domain: DecisionDomain;
  condition: string;
  priorityOrder: string[];
  recommendedAction: string;
  nonApplicabilityConditions: string[];
  exceptions: string[];
  reversalSignals: string[];
  reflectionIds: string[];
  supportingEventIds: string[];
  contrastingEventIds: string[];
  evidenceSpanIds: string[];
  confidence: 'high' | 'medium' | 'low';
  policyKind: 'deployable_policy' | 'event_specific_hypothesis';
  status: ArtifactStatus;
  reviewer: string | null;
};

export type MemoryArtifactRef = {
  id: string;
  kind: 'event' | 'reflection' | 'policy';
  sha256: string;
  split: DatasetSplit | 'derived';
};

export type MemoryRelease = {
  id: string;
  version: string;
  createdAt: string;
  datasetManifestHash: string;
  artifacts: MemoryArtifactRef[];
  embeddingModel: string;
  indexHash: string;
  status: 'candidate' | 'active' | 'superseded';
};
```

- [ ] **Step 4: Rerun and commit**

```bash
npx tsx --test tests/amyHoodAdvisorPolicyMemory.test.ts
git add shared/amyHoodDecisionAdvisor.ts tests/amyHoodAdvisorPolicyMemory.test.ts
git commit -m "feat: define advisor policy memory contracts"
```

### Task 2: Build contrastive reflections from approved events

**Files:**
- Create: `agent_prompts/prompts/amy-hood-reflection-builder.md`
- Create: `server/decisionAdvisor/reflectionBuilder.ts`
- Create: `server/decisionAdvisor/reflectionValidator.ts`
- Modify: `tests/amyHoodAdvisorPolicyMemory.test.ts`

**Interfaces:**
- Produces: `buildReflection(eventIds, deps)` and `validateReflection(reflection, events, spans)`.

- [ ] **Step 1: Add failing reflection tests**

Test a valid support/contrast pair, a reversal that narrows boundary conditions, duplicate supporting IDs, missing contrast, unknown evidence IDs, and holdout input. Assert invalid output is stored only as `review_required` proposal.

- [ ] **Step 2: Write the reflection prompt**

Require an observation, invariant, explicit boundary conditions, evidence IDs, and a statement of why the contrasting event differs. Prohibit personality adjectives and universal claims such as “always” unless every supplied event supports them.

- [ ] **Step 3: Implement builder and validator**

Run `assertAllowedSplits('policy_build', events)` before the model call. Permit only approved train/development events. Verify every textual claim has an evidence span ID and both support/contrast sets are nonempty and disjoint.

- [ ] **Step 4: Verify and commit**

```bash
npx tsx --test tests/amyHoodAdvisorPolicyMemory.test.ts
git add agent_prompts/prompts/amy-hood-reflection-builder.md server/decisionAdvisor/reflectionBuilder.ts server/decisionAdvisor/reflectionValidator.ts tests/amyHoodAdvisorPolicyMemory.test.ts
git commit -m "feat: derive contrastive advisor reflections"
```

### Task 3: Induce conditional policies and enforce evidence thresholds

**Files:**
- Create: `agent_prompts/prompts/amy-hood-policy-inducer.md`
- Create: `server/decisionAdvisor/policyBuilder.ts`
- Create: `server/decisionAdvisor/policyValidator.ts`
- Modify: `tests/amyHoodAdvisorPolicyMemory.test.ts`

**Interfaces:**
- Produces: `buildPolicies(reflections, deps)` and `validatePolicy(policy, graph)`.

- [ ] **Step 1: Add failing threshold tests**

Cover: two-event high/medium policy; direct principle plus independent confirmation; narrowed policy with a counterexample; one-event unsupported policy; empty priority order; absent reversal signal; and low-confidence activation.

- [ ] **Step 2: Write the induction prompt**

The output must use this logic shape:

```text
WHEN <observable conditions>
PRIORITIZE <ordered criteria>
THEN <bounded recommendation>
EXCEPT WHEN <conditions>
REVERSE IF <observable signals>
```

Require IDs for every reflection, support event, contrast event, and evidence span.

- [ ] **Step 3: Implement confidence rules**

Set `high` for at least three supporting events across two source types with a direct Amy principle and a reviewed contrast; `medium` for two supporting events, or direct principle plus independent confirmation; otherwise `low`. Low-confidence output is stored as `policyKind='event_specific_hypothesis'`; only high/medium `deployable_policy` artifacts may become `approved`.

- [ ] **Step 4: Run and commit**

```bash
npx tsx --test tests/amyHoodAdvisorPolicyMemory.test.ts
git add agent_prompts/prompts/amy-hood-policy-inducer.md server/decisionAdvisor/policyBuilder.ts server/decisionAdvisor/policyValidator.ts tests/amyHoodAdvisorPolicyMemory.test.ts
git commit -m "feat: induce conditional Amy Hood policies"
```

### Task 4: Build structured hybrid retrieval and bounded context packing

**Files:**
- Create: `scripts/build_decision_memory_index.py`
- Create: `server/decisionAdvisor/structuredRetriever.ts`
- Create: `server/decisionAdvisor/contextPacker.ts`
- Modify: `tests/amyHoodAdvisorPolicyMemory.test.ts`

**Interfaces:**
- Produces: a content-addressed BGE-M3 index, `retrieveDecisionMemory(query, filters, index)`, and `packDecisionContext(items, budget)`.

- [ ] **Step 1: Add failing retrieval tests**

Use a small deterministic vector fixture. Assert domain filters, lexical/vector score fusion, stable tie-breaking by ID, and returned provenance. For the oversized case, assert the lowest-ranked entire artifact is dropped and no remaining JSON artifact is truncated.

- [ ] **Step 2: Implement the index builder**

Follow the existing local BGE-M3 runtime pattern in `scripts/build_bge_m3_index.py`. Index separate fields for condition, priority, action, exception, reversal, and event context. Emit artifact ID, kind, domain, split, confidence, hash, vector, and normalized searchable text. Abort before replacement if embedding fails.

- [ ] **Step 3: Implement hybrid retrieval**

Normalize lexical and cosine scores to `[0,1]`; rank with `0.65 * vector + 0.35 * lexical`, then confidence, then ID. Apply domain/split/status filters before returning results.

- [ ] **Step 4: Implement the 16,384-token packer**

Use these ceilings:

```ts
export const ADVISOR_TOKEN_BUDGET = {
  systemPrompt: 1500,
  scenario: 1500,
  policies: 2000,
  reflections: 2000,
  events: 4000,
  response: 2000,
  reserve: 1384,
} as const;
```

Select at most 2 policies, 2 reflections, 2 supporting events, 1 counterexample, and 2 evidence spans per policy. Estimate tokens consistently, drop the lowest-ranked whole artifact on overflow, and record dropped IDs.

- [ ] **Step 5: Verify and commit**

```bash
python3 -m py_compile scripts/build_decision_memory_index.py
npx tsx --test tests/amyHoodAdvisorPolicyMemory.test.ts
git add scripts/build_decision_memory_index.py server/decisionAdvisor/structuredRetriever.ts server/decisionAdvisor/contextPacker.ts tests/amyHoodAdvisorPolicyMemory.test.ts
git commit -m "feat: retrieve structured advisor memory"
```

### Task 5: Publish immutable memory releases with an active pointer

**Files:**
- Create: `server/decisionAdvisor/memoryReleaseStore.ts`
- Create: `data/b-track/amy-hood/advisor/memory-releases/active.json`
- Modify: `server/runAmyHoodDecisionAdvisor.ts`
- Modify: `package.json`
- Modify: `tests/amyHoodAdvisorPolicyMemory.test.ts`

**Interfaces:**
- CLI: `memory:build --version`, `memory:check --version`, and `memory:activate --version`.

- [ ] **Step 1: Add failing release tests**

Test a valid candidate release, idempotent check, atomic activation, and superseding the old active release. Reject holdout refs, low-confidence policy refs, hash mismatch, incomplete index, and activation of an unreviewed release; assert the old active pointer survives every failure.

- [ ] **Step 2: Implement release build**

Run leakage validation before reading artifacts and again before writing the manifest. Hash every artifact and index. Write an immutable version directory under `memory-releases/<version>/`; refuse divergent overwrite.

- [ ] **Step 3: Implement atomic activation**

Validate all hashes, then atomically replace `active.json` with `{ releaseId, version, manifestHash, activatedAt }`. Update the prior release to `superseded` only after the pointer succeeds.

- [ ] **Step 4: Add scripts and execute the phase gate**

```json
"advisor:memory:build": "tsx server/runAmyHoodDecisionAdvisor.ts memory:build",
"advisor:memory:check": "tsx server/runAmyHoodDecisionAdvisor.ts memory:check",
"advisor:memory:activate": "tsx server/runAmyHoodDecisionAdvisor.ts memory:activate"
```

```bash
npx tsx --test tests/amyHoodAdvisorPolicyMemory.test.ts
npx tsx server/runAmyHoodDecisionAdvisor.ts memory:check --version 1.0.0
npm run advisor:evaluation-v3:test
npm run lint
git diff --check
```

Expected: only reviewed train/development artifacts appear in the release, all hashes validate, and the active pointer resolves to one immutable version.

- [ ] **Step 5: Commit Phase 4**

```bash
git add server/decisionAdvisor/memoryReleaseStore.ts server/runAmyHoodDecisionAdvisor.ts data/b-track/amy-hood/advisor/memory-releases package.json tests/amyHoodAdvisorPolicyMemory.test.ts
git commit -m "feat: publish advisor memory releases"
```
