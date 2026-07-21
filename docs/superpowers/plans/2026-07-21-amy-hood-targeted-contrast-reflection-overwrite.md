# Amy Hood Targeted Contrast Reflection Overwrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add and approve three researched opposite-action events, overwrite three existing approved Reflection IDs with real contrasts, synchronize their policies, and activate a validated memory release and index.

**Architecture:** Keep the existing formal pipeline: candidate and source provenance feed approved pilot event cards; approved Reflection and Policy artifacts reference those event and evidence IDs; the immutable memory-release builder snapshots the validated graph; the existing index builder activates query-dependent retrieval. No alternate evaluation-only data path is introduced.

**Tech Stack:** TypeScript, Node test runner, JSON artifact stores, SHA-256 provenance, existing Decision Advisor CLI and BGE-M3 index service.

## Global Constraints

- Work on the current `main` branch; do not create a worktree or branch.
- Preserve Reflection IDs `reflection-bd563b486d9d6f9b`, `reflection-f75c6c30eef7c1e0`, and `reflection-7371bfa747efb778`.
- Add the three opposite-action events; do not replace their supporting events.
- Record source limitations in `unresolvedConflicts`, even though the user approved all three events.
- Do not alter Evaluation v3/v4/v5 question or holdout artifacts.
- Do not activate a release unless all graph, holdout, release, and index checks pass.

---

### Task 1: Lock the Targeted Contrast Contract with a Failing Test

**Files:**
- Create: `tests/amyHoodTargetedContrastReflections.test.ts`
- Read: `server/decisionAdvisor/reflectionMemory.ts`
- Read: `server/decisionAdvisor/policyMemory.ts`

**Interfaces:**
- Consumes: `loadPolicyMemoryInput(root)`, `validateReflectionMemory(reflection, graph)`, and `validatePolicyMemory(policy, reflections, graph)`.
- Produces: a regression contract requiring the three event IDs and preserving the three Reflection and Policy IDs.

- [ ] **Step 1: Write the failing test with the required Test Plan comment**

The test must assert:

```ts
const targets = [
  ['cost_efficiency', 'reflection-bd563b486d9d6f9b', 'policy-20d2c645ab6641c9', 'event-priority-reinvestment-fy2022'],
  ['ai_cloud_capex', 'reflection-f75c6c30eef7c1e0', 'policy-e7eafcda9e4dc2e3', 'event-ai-datacenter-project-pacing-2025'],
  ['shareholder_return_risk', 'reflection-7371bfa747efb778', 'policy-a7972af407a0bf69', 'event-buyback-deployment-slowdown-fy2023'],
] as const;
```

For each target, load the approved Reflection and Policy and verify `contrastStatus === 'reviewed'`, the opposite event appears in `contrastingEventIds`, `contrastPattern` is non-null, the Reflection and Policy validators pass, and at least one source-quality limitation remains in `unresolvedConflicts` for provisional-source events.

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx tsx --test tests/amyHoodTargetedContrastReflections.test.ts
```

Expected: FAIL because the three event cards do not yet exist and the current Reflections have `documented_unavailable` with empty contrasts.

- [ ] **Step 3: Commit the failing test**

```bash
git add tests/amyHoodTargetedContrastReflections.test.ts
git commit -m "test: require targeted Amy Hood contrast events"
```

### Task 2: Add and Approve Three Formal Event Records

**Files:**
- Modify: `data/b-track/amy-hood/advisor/event-candidates.json`
- Modify: `data/b-track/amy-hood/advisor/source-registry.json`
- Modify: `data/b-track/amy-hood/advisor/events/pilot/pilot-manifest.json`
- Create: `data/b-track/amy-hood/advisor/events/pilot/candidate-priority-reinvestment-fy2022.json`
- Create: `data/b-track/amy-hood/advisor/events/pilot/candidate-ai-datacenter-project-pacing-2025.json`
- Create: `data/b-track/amy-hood/advisor/events/pilot/candidate-buyback-deployment-slowdown-fy2023.json`
- Create/modify: corresponding files under `data/b-track/amy-hood/advisor/raw/` and `normalized/`

**Interfaces:**
- Consumes: `EventCandidate`, `AdvisorSourceRecord`, `PilotDecisionEvent`, and `PilotEvidenceSpan` schemas.
- Produces: three approved events visible through `loadPolicyMemoryInput(process.cwd())`.

- [ ] **Step 1: Add candidates and reviewed source associations**

Use these stable IDs and decisions:

```ts
const events = {
  'candidate-priority-reinvestment-fy2022': {
    eventId: 'event-priority-reinvestment-fy2022',
    domain: 'cost_efficiency',
    action: 'expand_high_growth_differentiated_investment',
  },
  'candidate-ai-datacenter-project-pacing-2025': {
    eventId: 'event-ai-datacenter-project-pacing-2025',
    domain: 'ai_cloud_capex',
    action: 'slow_or_pause_early_stage_projects',
  },
  'candidate-buyback-deployment-slowdown-fy2023': {
    eventId: 'event-buyback-deployment-slowdown-fy2023',
    domain: 'shareholder_return_risk',
    action: 'reduce_buyback_deployment_preserve_flexibility',
  },
};
```

Reuse a canonical URL already present in `source-registry.json`; otherwise create one source record with a normalized evidence passage, matching SHA-256, capture timestamp, and raw path. The AI and shareholder events must distinguish event-action evidence from Amy policy evidence.

- [ ] **Step 2: Add approved event cards**

Each card must have exactly one selected option, one rejected option, non-empty conditions and constraints, correctly typed evidence roles, valid offsets into normalized text, `status: "approved"`, and reviewer metadata stating user-approved PoC contrast use.

- [ ] **Step 3: Add all three candidates to the pilot manifest**

Append the three targets with unique priorities after the current maximum. Do not remove current targets.

- [ ] **Step 4: Run event and input checks**

```bash
npm run advisor:candidates:check
npm run advisor:sources:check
npm run advisor:memory:check
```

Expected: candidate/source checks pass; memory check may still report the old Reflection contrast gap until Task 3.

- [ ] **Step 5: Commit formal event data**

```bash
git add data/b-track/amy-hood/advisor/event-candidates.json \
  data/b-track/amy-hood/advisor/source-registry.json \
  data/b-track/amy-hood/advisor/events/pilot \
  data/b-track/amy-hood/advisor/raw \
  data/b-track/amy-hood/advisor/normalized
git commit -m "data: approve targeted Amy Hood contrast events"
```

### Task 3: Overwrite the Existing Reflections and Synchronize Policies

**Files:**
- Modify: `data/b-track/amy-hood/advisor/policy-memory/approved/reflections/reflection-bd563b486d9d6f9b.json`
- Modify: `data/b-track/amy-hood/advisor/policy-memory/approved/reflections/reflection-f75c6c30eef7c1e0.json`
- Modify: `data/b-track/amy-hood/advisor/policy-memory/approved/reflections/reflection-7371bfa747efb778.json`
- Modify: the same IDs under `policy-memory/proposals/reflections/`
- Modify: the matching Reflection review files under `policy-memory/reviews/`
- Modify: `policy-20d2c645ab6641c9.json`, `policy-e7eafcda9e4dc2e3.json`, and `policy-a7972af407a0bf69.json` under approved/proposals plus their review files.

**Interfaces:**
- Consumes: the three approved event IDs and their evidence span IDs from Task 2.
- Produces: three validated reviewed contrasts and three policies whose contrast sets match their Reflection.

- [ ] **Step 1: Overwrite Reflection contrast fields while preserving IDs and support patterns**

For each Reflection:

```ts
reflection.contrastStatus = 'reviewed';
reflection.contrastingEventIds = [oppositeEventId];
reflection.contrastPattern = {
  eventIds: [oppositeEventId],
  conditions: observedOppositeConditions,
  action: oppositeAction,
  evidenceIds: oppositeEvidenceIds,
};
reflection.evidenceIds = [
  ...reflection.supportPattern.evidenceIds,
  ...reflection.contrastPattern.evidenceIds,
];
```

Rewrite `observation`, `invariant`, `boundaryConditions`, `decisionAxis`, `conditionDelta`, and `actionDelta`. Keep source limitations in `unresolvedConflicts`.

- [ ] **Step 2: Update reviews without changing artifact IDs**

Set the decision to approved and record that the user authorized PoC contrast use while provenance limitations remain explicit. Recompute validation hashes through the existing approval command or store function; do not invent hashes.

- [ ] **Step 3: Synchronize policies**

Set `contrastStatus: "reviewed"`, reference the same opposite event, expand `evidenceIds`, retain the current default `recommendedAction`, and add an explicit alternate action to `exceptions` plus concrete `reversalSignals`. Policy support and contrast sets must be subsets of their Reflection sets.

- [ ] **Step 4: Run the targeted test and full policy-memory tests**

```bash
npx tsx --test tests/amyHoodTargetedContrastReflections.test.ts
npm run advisor:policy-memory:test
```

Expected: PASS with three reviewed contrasts and no unknown-event/evidence errors.

- [ ] **Step 5: Commit Reflection and Policy artifacts**

```bash
git add data/b-track/amy-hood/advisor/policy-memory tests/amyHoodTargetedContrastReflections.test.ts
git commit -m "feat: overwrite Amy Hood reflections with real contrasts"
```

### Task 4: Build, Activate, and Verify the Memory Release and Index

**Files:**
- Create: a new version directory under `data/b-track/amy-hood/advisor/memory-releases/`
- Modify: `data/b-track/amy-hood/advisor/memory-releases/active.json`
- Create: a matching directory under `data/b-track/amy-hood/advisor/memory-indexes/`
- Modify: `data/b-track/amy-hood/advisor/memory-indexes/active.json`

**Interfaces:**
- Consumes: the validated approved events, Reflections, and Policies.
- Produces: active immutable release and active BGE-M3 retrieval index.

- [ ] **Step 1: Build the immutable release**

```bash
npm run advisor:memory:release
```

Expected: a new `v1-<hash>` release containing all three opposite events and overwritten Reflection IDs.

- [ ] **Step 2: Validate and activate the release**

```bash
npm run advisor:memory:check
npm run advisor:memory:activate -- <release-id>
```

Expected: activation succeeds only after manifest hashes and holdout boundaries pass.

- [ ] **Step 3: Rebuild and check the query-dependent index**

```bash
npm run advisor:index:build
npm run advisor:index:check
```

Expected: the active index points to the new release and embeds events, Reflections, and Policies. If BGE-M3 on port 8081 is unavailable, leave the previous active index unchanged and report the precise blocker.

- [ ] **Step 4: Run final verification**

```bash
npx tsx --test tests/amyHoodTargetedContrastReflections.test.ts
npm run advisor:policy-memory:test
npm run advisor:index:test
npm run lint
git diff --check
```

Expected: all tests and checks pass with no whitespace errors.

- [ ] **Step 5: Commit release and index artifacts**

```bash
git add data/b-track/amy-hood/advisor/memory-releases \
  data/b-track/amy-hood/advisor/memory-indexes
git commit -m "data: activate contrastive Amy Hood memory release"
```
