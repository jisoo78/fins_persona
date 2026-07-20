# Amy Hood Raw Capacity-Resource Contrast Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert three already-collected Amy Hood earnings-call transcripts into verified non-holdout capacity-resource decision events, derive one qualified contrastive policy, and activate a memory release only if the strict gates pass.

**Architecture:** A checked-in extraction manifest declares complete candidates, card fields, exact quotes, and offsets. A focused verifier recomputes speaker ownership from normalized transcripts, checks source/candidate provenance and holdout exclusion, constructs standard `PilotDecisionEvent` cards, and atomically applies the candidate, registry, raw-metadata, pilot-manifest, and card changes. The existing reflection, policy, Codex review, and immutable release pipeline remains the only promotion path.

**Tech Stack:** TypeScript 5.8, Node.js test runner through `tsx --test`, JSON artifacts, SHA-256 source records, existing `PilotDecisionEvent` and Evaluation v3 holdout validators, local Gemma 4 at `http://127.0.0.1:8080/v1`.

## Global Constraints

- Work in `/Users/hestory/Desktop/fins_persona/.worktrees/amy-hood-decision-advisor` on the current `codex/amy-hood-decision-advisor` branch.
- Do not collect new URLs, crawl the web, collect LinkedIn, modify Main Prompt, change Evaluation v3 questions/answers, or change RAG retrieval.
- Preserve every existing candidate and all four sealed holdout events; expand the candidate matrix from 30 to exactly 33.
- Keep the Phase 3 pilot manifest at exactly 10 targets and retain all five decision domains.
- Use only `source-6b843b4b8385078d`, `source-fbb900eb7e249591`, and `source-4f4085f8344669c4` for the three new events.
- Treat `owned_and_external_capacity` as an FY24 execution tactic, not a third top-level choice.
- Top-level actions are exactly `scale_infrastructure_and_people` and `scale_infrastructure_constrain_opex`.
- Every evidence span must match normalized source bytes at the declared offsets and lie inside a recomputed Amy Hood speaker segment.
- Post-outcome evidence and every holdout candidate/source/evidence/alias are forbidden.
- Follow AGENTS.md: one happy-path category, exactly three realistic edge-case categories, and grouped failure paths in each new or significantly modified test file.
- Use TDD for every production behavior: write the test, observe the expected failure, implement the minimum behavior, rerun focused and regression tests.
- Do not approve a reflection merely because deterministic validation passes; Codex must inspect the exact evidence.
- Permit at most two real Gemma reflection builds. If no reflection passes Codex review, preserve artifacts and stop.
- Do not build or activate a release without at least one approved medium/high deployable policy.

---

## File Structure

### Candidate and pilot compatibility

- Modify `server/runAmyHoodDecisionAdvisor.ts`: permit 30–50 candidates instead of exactly 30.
- Modify `tests/amyHoodAdvisorSourceCollection.test.ts`: verify both 30 and 33 candidates pass and 29/51 fail.
- Modify `tests/amyHoodAdvisorEventPilot.test.ts`: replace pilot priorities 6–8 with the three capacity-resource candidates while retaining exactly 10 targets and five domains.

### Capacity-resource extraction boundary

- Create `server/decisionAdvisor/capacityResourcePilot.ts`: load, validate, and atomically apply a capacity-resource manifest.
- Create `tests/amyHoodCapacityResourcePilot.test.ts`: exercise real normalized transcript bytes, speaker attribution, holdout blocking, action consistency, and rollback.
- Modify `server/runAmyHoodDecisionAdvisor.ts`: dispatch `capacity:check` and `capacity:apply`.
- Modify `package.json`: add `advisor:capacity:check`, `advisor:capacity:apply`, and `advisor:capacity:test`.

### Reviewed data

- Create `data/b-track/amy-hood/advisor/imports/amy-hood-capacity-resource-pilot.json`: three complete extraction specifications.
- Modify `data/b-track/amy-hood/advisor/event-candidates.json`: append the verified three candidates.
- Modify `data/b-track/amy-hood/advisor/source-registry.json`: add each new candidate ID to the owning source.
- Modify three existing files under `data/b-track/amy-hood/advisor/raw/`: mirror the candidate ownership in `metadata.eventCandidateIds` without changing `bodyBase64`.
- Modify `data/b-track/amy-hood/advisor/events/pilot/pilot-manifest.json`: replace priorities 6–8.
- Create three cards under `data/b-track/amy-hood/advisor/events/pilot/`.

### Policy memory

- Generate new immutable records under `data/b-track/amy-hood/advisor/policy-memory/**`.
- Generate and activate a release under `data/b-track/amy-hood/advisor/memory-releases/**` only after a deployable policy is approved.

---

### Task 1: Expand the candidate-matrix bound without weakening validation

**Files:**
- Modify: `server/runAmyHoodDecisionAdvisor.ts:181-190`
- Modify: `tests/amyHoodAdvisorSourceCollection.test.ts:2080-2110`

**Interfaces:**
- Consumes: `validateEventCandidates(value, options)` and the existing 30-candidate fixture.
- Produces: the same `CandidateCheck`, accepting inclusive candidate counts 30–50 while retaining five-domain and 100–150 unique-URL checks.

- [ ] **Step 1: Extend the existing happy and grouped failure tests**

In `happy: candidate CLI accepts 30 candidates, five domains, and 100 unique discoveries`, retain the 30-candidate assertion and add a direct 33-candidate validation using three cloned candidates with unique IDs but the existing reviewed URLs:

```ts
const expanded = validCandidateMatrix();
for (const [index, source] of expanded.slice(0, 3).entries()) {
  expanded.push({
    ...structuredClone(source),
    id: `candidate-capacity-resource-${index + 1}`,
    workingTitle: `Capacity resource allocation decision ${index + 1}`,
  });
}
assert.equal(validateEventCandidates(expanded).candidateCount, 33);
```

In the grouped candidate failure test, add:

```ts
assert.throws(
  () => validateEventCandidates(validCandidateMatrix().slice(0, 29)),
  /expected 30-50 candidates; found 29/,
);
const excessive = Array.from({ length: 51 }, (_, index) => ({
  ...structuredClone(validCandidateMatrix()[index % 30]),
  id: `candidate-excess-${index}`,
}));
assert.throws(
  () => validateEventCandidates(excessive, { enforceDiscoveryRange: false }),
  /expected 30-50 candidates; found 51/,
);
```

- [ ] **Step 2: Run the focused candidate tests and confirm RED**

Run:

```bash
npx tsx --test --test-name-pattern='candidate CLI|candidate count' tests/amyHoodAdvisorSourceCollection.test.ts
```

Expected: FAIL because `validateEventCandidates` still requires exactly 30 candidates.

- [ ] **Step 3: Implement the inclusive bound**

Replace the exact-count condition in `validateEventCandidates` with:

```ts
if (value.length < 30 || value.length > 50) {
  throw new Error(`expected 30-50 candidates; found ${value.length}`);
}
```

Do not change domain coverage, association validation, fingerprint validation, or discovery URL range.

- [ ] **Step 4: Verify focused and source-collection tests**

Run:

```bash
npx tsx --test --test-name-pattern='candidate CLI|candidate count' tests/amyHoodAdvisorSourceCollection.test.ts
npx tsx --test tests/amyHoodAdvisorSourceCollection.test.ts
```

Expected: all candidate tests pass; 29 and 51 remain rejected.

- [ ] **Step 5: Commit**

```bash
git add server/runAmyHoodDecisionAdvisor.ts tests/amyHoodAdvisorSourceCollection.test.ts
git commit -m "feat: allow advisor candidate expansion"
```

---

### Task 2: Verify a checked-in capacity-resource extraction manifest

**Files:**
- Create: `server/decisionAdvisor/capacityResourcePilot.ts`
- Create: `tests/amyHoodCapacityResourcePilot.test.ts`

**Interfaces:**
- Consumes: `CapacityResourcePilotManifest`, existing candidates, source registry, raw/normalized sources, pilot manifest, and Evaluation v3 holdout manifest.
- Produces:
  - `loadCapacityResourcePilotManifest(root: string, manifestPath?: string): Promise<CapacityResourcePilotManifest>`
  - `verifyCapacityResourcePilot(root: string, manifest: CapacityResourcePilotManifest): Promise<VerifiedCapacityResourcePilot>`
  - `VerifiedCapacityResourcePilot = { candidates, registry, rawSourceUpdates, pilotManifest, cards }`

- [ ] **Step 1: Create the test file with the required Test Plan**

Start `tests/amyHoodCapacityResourcePilot.test.ts` with:

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - three exact Amy transcript extractions produce validator-ready cards and a 33-candidate, ten-target pilot update.
 * 2. Edge Cases:
 *    - one source remains owned by both its prior candidate and one new capacity candidate.
 *    - FY24 owned/external supply remains a tactic under scale_infrastructure_constrain_opex.
 *    - punctuation and curly apostrophes match normalized source offsets byte-for-byte.
 * 3. Failure Path:
 *    - malformed offsets, wrong speakers, post-date evidence, holdout references, mismatched support actions, and partial writes fail safely.
 */
```

Import the wished-for API:

```ts
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type {
  AdvisorRawSource,
  EventCandidate,
} from '../shared/amyHoodDecisionAdvisor';
import {
  loadCapacityResourcePilotManifest,
  verifyCapacityResourcePilot,
} from '../server/decisionAdvisor/capacityResourcePilot';
import { eventCardPath } from '../server/decisionAdvisor/eventCard';
import { writeJsonAtomic } from '../server/decisionAdvisor/jsonStore';
import type { AdvisorSourceRegistry } from '../server/decisionAdvisor/sourceRegistry';
```

Copy only these real directories/files into a temporary root in test setup:

```ts
const root = await mkdtemp(path.join(tmpdir(), 'amy-capacity-resource-'));
const advisorRoot = path.resolve(root, 'data/b-track/amy-hood/advisor');
const candidatePath = path.resolve(advisorRoot, 'event-candidates.json');
const registryPath = path.resolve(advisorRoot, 'source-registry.json');
const rawPath = path.resolve(advisorRoot, 'raw');
const normalizedPath = path.resolve(advisorRoot, 'normalized');
const pilotPath = path.resolve(advisorRoot, 'events/pilot/pilot-manifest.json');
const holdoutPath = path.resolve(root, 'evaluation/v3/sealed/holdout-manifest.json');
await mkdir(path.dirname(pilotPath), { recursive: true });
await mkdir(path.dirname(holdoutPath), { recursive: true });
await cp('data/b-track/amy-hood/advisor/event-candidates.json', candidatePath, { recursive: false });
await cp('data/b-track/amy-hood/advisor/source-registry.json', registryPath, { recursive: false });
await cp('data/b-track/amy-hood/advisor/raw', rawPath, { recursive: true });
await cp('data/b-track/amy-hood/advisor/normalized', normalizedPath, { recursive: true });
await cp('data/b-track/amy-hood/advisor/events/pilot/pilot-manifest.json', pilotPath, { recursive: false });
await cp('evaluation/v3/sealed/holdout-manifest.json', holdoutPath, { recursive: false });
```

- [ ] **Step 2: Write the happy and three edge-category assertions**

Use a fixture manifest containing the three exact event IDs and assert:

```ts
const input = await loadCapacityResourcePilotManifest(process.cwd());
const verified = await verifyCapacityResourcePilot(root, input);

assert.equal(verified.candidates.length, 33);
assert.equal(verified.cards.length, 3);
assert.equal(verified.pilotManifest.targets.length, 10);
assert.equal(new Set(verified.pilotManifest.targets.map(({ domain }) => domain)).size, 5);
assert.deepEqual(
  verified.cards.map(({ chosenAction }) => chosenAction),
  [
    'scale_infrastructure_and_people',
    'scale_infrastructure_constrain_opex',
    'scale_infrastructure_constrain_opex',
  ],
);
assert.equal(verified.cards.every(({ status }) => status === 'incomplete'), true);

const fy23Source = verified.registry.sources.find(({ id }) => id === 'source-fbb900eb7e249591');
assert.deepEqual(fy23Source?.eventCandidateIds.sort(), [
  'candidate-ai-capacity-opex-pivot-2023',
  'candidate-copilot-price-2023',
]);
assert.match(verified.cards[2].conditions.join('\n'), /third-party capacity/);
assert.equal(verified.cards[2].chosenAction, 'scale_infrastructure_constrain_opex');
assert.equal(
  verified.cards.flatMap(({ evidenceSpans }) => evidenceSpans)
    .some(({ exactQuote }) => exactQuote.includes('we’ve also used third-party capacity')),
  true,
);
```

- [ ] **Step 3: Write grouped failure assertions**

Clone the fixture manifest for each realistic failure:

```ts
const wrongOffset = structuredClone(input);
wrongOffset.events[0].evidence[0].startChar += 1;
await assert.rejects(() => verifyCapacityResourcePilot(root, wrongOffset), /exact quote offset mismatch/);

const wrongSpeaker = structuredClone(input);
wrongSpeaker.events[1].evidence[0].speaker = 'Satya Nadella';
await assert.rejects(() => verifyCapacityResourcePilot(root, wrongSpeaker), /Amy Hood speaker ownership/);

const postDate = structuredClone(input);
postDate.events[0].publishedAt = '2022-04-27';
await assert.rejects(() => verifyCapacityResourcePilot(root, postDate), /post-outcome evidence/);

const leaked = structuredClone(input);
leaked.events[0].evidence[0].sourceId = 'source-7f4b2d38f70ad433';
await assert.rejects(() => verifyCapacityResourcePilot(root, leaked), /holdout/);

const mismatchedActions = structuredClone(input);
mismatchedActions.events[2].card.chosenAction = 'scale_owned_and_external_capacity';
await assert.rejects(
  () => verifyCapacityResourcePilot(root, mismatchedActions),
  /FY23 and FY24 support actions must match/,
);
```

- [ ] **Step 4: Run the new test and confirm RED**

Run:

```bash
npx tsx --test tests/amyHoodCapacityResourcePilot.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `capacityResourcePilot.ts`.

- [ ] **Step 5: Implement manifest types and loading**

Create `server/decisionAdvisor/capacityResourcePilot.ts` with these public contracts:

```ts
import type {
  AdvisorRawSource,
  AdvisorSourceRecord,
  EventCandidate,
  PilotDecisionEvent,
  PilotEvidenceSpan,
  PilotManifest,
} from '../../shared/amyHoodDecisionAdvisor';
import type { AdvisorSourceRegistry } from './sourceRegistry';

export type CapacityResourceCandidateSpec = {
  id: string;
  workingTitle: string;
  decisionDate: string;
  fingerprint: {
    primaryEntity: string;
    decisionAction: string;
    eventSpecificIdentifier: string;
  };
};

export type CapacityResourceCardSpec = Pick<
  PilotDecisionEvent,
  | 'title'
  | 'decisionQuestion'
  | 'situation'
  | 'objectives'
  | 'conditions'
  | 'constraints'
  | 'options'
  | 'chosenAction'
  | 'rejectedBenefit'
  | 'observations'
  | 'inferences'
>;

export type CapacityResourceEvidenceSpec = Pick<
  PilotEvidenceSpan,
  'id' | 'role' | 'exactQuote' | 'startChar' | 'endChar' | 'speaker'
>;

export type CapacityResourceEventSpec = {
  candidate: CapacityResourceCandidateSpec;
  sourceId: string;
  publishedAt: string;
  replacePriority: 6 | 7 | 8;
  card: CapacityResourceCardSpec;
  evidence: CapacityResourceEvidenceSpec[];
};

export type CapacityResourcePilotManifest = {
  dataset: 'amy_hood_capacity_resource_pilot';
  version: '1.0.0';
  events: [
    CapacityResourceEventSpec,
    CapacityResourceEventSpec,
    CapacityResourceEventSpec,
  ];
};

export type VerifiedCapacityResourcePilot = {
  candidates: EventCandidate[];
  registry: AdvisorSourceRegistry;
  rawSourceUpdates: Array<{
    record: AdvisorSourceRecord;
    artifact: AdvisorRawSource;
  }>;
  pilotManifest: PilotManifest;
  cards: PilotDecisionEvent[];
};
```

The default manifest path is:

```ts
const defaultManifestPath = (root: string) => path.resolve(
  root,
  'data/b-track/amy-hood/advisor/imports/amy-hood-capacity-resource-pilot.json',
);
```

Validate dataset/version, exactly three unique event IDs, priorities exactly 6/7/8, all domains `ai_cloud_capex`, candidate counts, and the exact action sequence shown in Step 2.

- [ ] **Step 6: Implement exact-source and speaker verification**

First derive the standard evidence fields that are intentionally not duplicated in the manifest:

```ts
const evidenceSpans: PilotEvidenceSpan[] = spec.evidence.map((span) => ({
  ...span,
  sourceId: spec.sourceId,
  eventCandidateId: spec.candidate.id,
  publishedAt: spec.publishedAt,
}));
```

Then verify each member of `evidenceSpans`:

```ts
if (!source.normalizedPath || !source.rawPath || !source.publishedAt) {
  throw new Error(`source is not a collected decision-time artifact: ${source.id}`);
}
const normalized = await readFile(path.resolve(advisorPaths(root).root, source.normalizedPath), 'utf8');
if (normalized.slice(span.startChar, span.endChar) !== span.exactQuote) {
  throw new Error(`exact quote offset mismatch: ${span.id}`);
}
const amySegments = extractSpeakerSegments(normalized)
  .filter(({ speaker }) => speaker === 'Amy Hood');
if (span.speaker !== 'Amy Hood'
  || !amySegments.some(({ startChar, endChar }) =>
    startChar <= span.startChar && endChar >= span.endChar)) {
  throw new Error(`Amy Hood speaker ownership is invalid: ${span.id}`);
}
if (span.publishedAt !== source.publishedAt
  || span.publishedAt > spec.candidate.decisionDate) {
  throw new Error(`post-outcome evidence is forbidden: ${span.id}`);
}
```

Load the sealed holdout and call `assertNoEvaluationV3Holdout('policy_build', references, holdout)` for every new candidate, source, and evidence ID before constructing cards.

Build cards by mapping `direct_amy` and `decision_context` IDs, with `amyPolicyEvidenceIds` and `postOutcomeEvidenceIds` empty. Run `validateEventCandidates`, `validatePilotManifest`, and `validatePilotEventCard` before returning.

- [ ] **Step 7: Run focused tests and commit**

Run:

```bash
npx tsx --test tests/amyHoodCapacityResourcePilot.test.ts
npm run lint
git diff --check
```

Expected: all new tests pass and TypeScript reports no errors.

Commit:

```bash
git add server/decisionAdvisor/capacityResourcePilot.ts tests/amyHoodCapacityResourcePilot.test.ts
git commit -m "feat: verify capacity resource evidence"
```

---

### Task 3: Atomically apply the verified pilot and expose CLI commands

**Files:**
- Modify: `server/decisionAdvisor/capacityResourcePilot.ts`
- Modify: `server/runAmyHoodDecisionAdvisor.ts`
- Modify: `package.json`
- Modify: `tests/amyHoodCapacityResourcePilot.test.ts`

**Interfaces:**
- Consumes: `VerifiedCapacityResourcePilot` from Task 2.
- Produces:
  - `applyCapacityResourcePilot(root, manifest, dependencies?): Promise<VerifiedCapacityResourcePilot>`
  - CLI `capacity:check --file <path>` and `capacity:apply --file <path>`
  - scripts `advisor:capacity:check`, `advisor:capacity:apply`, `advisor:capacity:test`

- [ ] **Step 1: Add happy-path persistence assertions**

After verifying a temporary root, call the wished-for apply API and assert:

```ts
const originalCandidates = JSON.parse(
  await readFile(candidatePath, 'utf8'),
) as EventCandidate[];
const originalRegistry = JSON.parse(
  await readFile(registryPath, 'utf8'),
) as AdvisorSourceRegistry;
const originalHoldout = await readFile(holdoutPath);
const originalRaw = new Map(await Promise.all([
  'source-6b843b4b8385078d',
  'source-fbb900eb7e249591',
  'source-4f4085f8344669c4',
].map(async (sourceId) => {
  const source = originalRegistry.sources.find(({ id }) => id === sourceId)!;
  return [sourceId, await readFile(path.resolve(advisorRoot, source.rawPath!))] as const;
})));

const applied = await applyCapacityResourcePilot(root, input);
assert.equal(applied.cards.length, 3);
const storedCandidates = JSON.parse(await readFile(candidatePath, 'utf8')) as EventCandidate[];
assert.equal(storedCandidates.length, 33);
assert.deepEqual(storedCandidates.slice(0, originalCandidates.length), originalCandidates);
assert.deepEqual(await readFile(holdoutPath), originalHoldout);
for (const [sourceId, originalBody] of originalRaw) {
  const source = applied.registry.sources.find(({ id }) => id === sourceId)!;
  const stored = JSON.parse(
    await readFile(path.resolve(advisorRoot, source.rawPath!), 'utf8'),
  ) as AdvisorRawSource;
  const original = JSON.parse(originalBody.toString('utf8')) as AdvisorRawSource;
  assert.equal(stored.bodyBase64, original.bodyBase64);
}
for (const candidateId of [
  'candidate-cloud-capacity-scale-2022',
  'candidate-ai-capacity-opex-pivot-2023',
  'candidate-ai-capacity-sourcing-2024',
]) {
  const card = JSON.parse(await readFile(eventCardPath(root, candidateId), 'utf8'));
  assert.equal(card.candidateId, candidateId);
  assert.equal(card.status, 'incomplete');
}
```

- [ ] **Step 2: Add idempotence and rollback assertions to existing edge/failure categories**

```ts
const snapshotPaths = async (files: string[]) => Promise.all(files.map(async (file) => {
  try {
    return [file, await readFile(file)] as const;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [file, null] as const;
    throw error;
  }
}));

const appliedDestinations = [
  candidatePath,
  registryPath,
  pilotPath,
  ...applied.rawSourceUpdates.map(({ record }) => path.resolve(advisorRoot, record.rawPath!)),
  ...applied.cards.map(({ candidateId }) => eventCardPath(root, candidateId)),
];
const before = await snapshotPaths(appliedDestinations);
await applyCapacityResourcePilot(root, input);
const after = await snapshotPaths(appliedDestinations);
assert.deepEqual(after, before);

const rollback = await createCapacityFixtureRoot();
const rollbackInput = await loadCapacityResourcePilotManifest(process.cwd());
const rollbackVerified = await verifyCapacityResourcePilot(rollback.root, rollbackInput);
const rollbackDestinations = [
  rollback.candidatePath,
  rollback.registryPath,
  rollback.pilotPath,
  ...rollbackVerified.rawSourceUpdates.map(({ record }) =>
    path.resolve(rollback.advisorRoot, record.rawPath!)),
  ...rollbackVerified.cards.map(({ candidateId }) =>
    eventCardPath(rollback.root, candidateId)),
];
const rollbackBefore = await snapshotPaths(rollbackDestinations);
let writes = 0;
await assert.rejects(() => applyCapacityResourcePilot(rollback.root, rollbackInput, {
  write: async (filePath, value) => {
    writes += 1;
    if (writes === 4) throw new Error('injected capacity apply failure');
    await writeJsonAtomic(filePath, value);
  },
}), /injected capacity apply failure/);
const rollbackAfter = await snapshotPaths(rollbackDestinations);
assert.deepEqual(rollbackAfter, rollbackBefore);
```

Extract the setup shown in Task 2 Step 1 into `createCapacityFixtureRoot()` and return `root`, `advisorRoot`, `candidatePath`, `registryPath`, `pilotPath`, and `holdoutPath`. This makes the second root above a real pre-apply fixture and proves no partial candidate, registry, raw metadata, manifest, or card remains.

- [ ] **Step 3: Run and confirm RED**

Run:

```bash
npx tsx --test tests/amyHoodCapacityResourcePilot.test.ts
```

Expected: FAIL because `applyCapacityResourcePilot` does not exist.

- [ ] **Step 4: Implement atomic multi-file application**

Add this dependency boundary:

```ts
type CapacityApplyDependencies = {
  write(filePath: string, value: unknown): Promise<void>;
};
```

The destination set must contain exactly:

```ts
[
  path.resolve(advisorPaths(root).root, 'event-candidates.json'),
  advisorPaths(root).registry,
  advisorPaths(root).pilotManifest,
  ...verified.rawSourceUpdates.map(({ record }) => path.resolve(
    advisorPaths(root).root,
    record.rawPath!,
  )),
  ...verified.cards.map(({ candidateId }) => eventCardPath(root, candidateId)),
]
```

Snapshot every prior JSON value before writing. On any write failure, restore existing values and remove newly created card files. If compensation also fails, throw an `AggregateError` containing the original and compensation errors.

Same-manifest reapplication must write canonical-equivalent data and return successfully without duplicating IDs.

- [ ] **Step 5: Add CLI dispatch and scripts**

In `server/runAmyHoodDecisionAdvisor.ts`, before the unknown-command branch:

```ts
if (command === 'capacity:check' || command === 'capacity:apply') {
  const manifestPath = optionValue(args, '--file');
  const manifest = await loadCapacityResourcePilotManifest(root, manifestPath);
  const result = command === 'capacity:apply'
    ? await applyCapacityResourcePilot(root, manifest)
    : await verifyCapacityResourcePilot(root, manifest);
  console.log(JSON.stringify({
    candidateCount: result.candidates.length,
    cardIds: result.cards.map(({ id }) => id),
    pilotTargetIds: result.pilotManifest.targets.map(({ candidateId }) => candidateId),
  }, null, 2));
  return;
}
```

Add package scripts:

```json
"advisor:capacity:test": "tsx --test tests/amyHoodCapacityResourcePilot.test.ts",
"advisor:capacity:check": "tsx server/runAmyHoodDecisionAdvisor.ts capacity:check",
"advisor:capacity:apply": "tsx server/runAmyHoodDecisionAdvisor.ts capacity:apply"
```

- [ ] **Step 6: Verify and commit**

Run:

```bash
npm run advisor:capacity:test
npm run lint
git diff --check
```

Expected: verifier, idempotence, rollback, and CLI tests pass.

Commit:

```bash
git add server/decisionAdvisor/capacityResourcePilot.ts server/runAmyHoodDecisionAdvisor.ts package.json tests/amyHoodCapacityResourcePilot.test.ts
git commit -m "feat: apply capacity resource pilot atomically"
```

---

### Task 4: Check in and approve the three real raw-derived events

**Files:**
- Create: `data/b-track/amy-hood/advisor/imports/amy-hood-capacity-resource-pilot.json`
- Generate/modify through CLI: candidate matrix, source registry, three raw metadata files, pilot manifest, and three event cards.
- Modify: `tests/amyHoodAdvisorEventPilot.test.ts`
- Modify: `tests/amyHoodAdvisorSourceCollection.test.ts`

**Interfaces:**
- Consumes: `capacity:check`, `capacity:apply`, and the exact normalized offsets below.
- Produces: three approved standard `PilotDecisionEvent` cards visible to `loadPolicyMemoryInput`.

- [ ] **Step 1: Write the real manifest with exact evidence spans**

Create the JSON manifest with dataset `amy_hood_capacity_resource_pilot`, version `1.0.0`, and an `events` array. For index `0..2`, store one object composed exactly as follows: `candidate` is candidate literal `index`, `sourceId` and `publishedAt` come from evidence block `index`, `replacePriority` is `6 + index`, `card` is card literal `index`, and `evidence` is evidence block `index`. The `candidateId` and `chosenAction` keys shown in each evidence block are cross-check labels only: do not store them as duplicate event fields; require them to equal `candidate.id` and `card.chosenAction` while assembling the JSON.

Use these exact evidence blocks:

```json
[
  {
    "candidateId": "candidate-cloud-capacity-scale-2022",
    "sourceId": "source-6b843b4b8385078d",
    "publishedAt": "2022-04-26",
    "chosenAction": "scale_infrastructure_and_people",
    "evidence": [
      {
        "id": "span-capacity-2022-headcount",
        "role": "decision_context",
        "startChar": 19999,
        "endChar": 20240,
        "speaker": "Amy Hood",
        "exactQuote": "At a total company level, headcount grew 20% year-over-year as we continue to invest in key areas such as cloud engineering, customer deployment, LinkedIn, and sales, and included approximately 4 points of growth from the addition of Nuance."
      },
      {
        "id": "span-capacity-2022-capex",
        "role": "direct_amy",
        "startChar": 29207,
        "endChar": 29357,
        "speaker": "Amy Hood",
        "exactQuote": "Capital expenditures, we expect a sequential increase on a dollar basis as we continue to invest to meet growing global demand for our cloud services."
      }
    ]
  },
  {
    "candidateId": "candidate-ai-capacity-opex-pivot-2023",
    "sourceId": "source-fbb900eb7e249591",
    "publishedAt": "2023-04-25",
    "chosenAction": "scale_infrastructure_constrain_opex",
    "evidence": [
      {
        "id": "span-capacity-2023-ai-capex",
        "role": "decision_context",
        "startChar": 28256,
        "endChar": 28393,
        "speaker": "Amy Hood",
        "exactQuote": "We expect capital expenditures to have a material sequential increase on a dollar basis driven by investments in Azure AI infrastructure."
      },
      {
        "id": "span-capacity-2023-opex",
        "role": "direct_amy",
        "startChar": 33082,
        "endChar": 33313,
        "speaker": "Amy Hood",
        "exactQuote": "As always, we remain committed to aligning costs and revenue growth to deliver disciplined profitability. Therefore, while the scaled capex investments will impact COGS growth, we expect FY24 operating expense growth to remain low."
      }
    ]
  },
  {
    "candidateId": "candidate-ai-capacity-sourcing-2024",
    "sourceId": "source-4f4085f8344669c4",
    "publishedAt": "2024-01-30",
    "chosenAction": "scale_infrastructure_constrain_opex",
    "evidence": [
      {
        "id": "span-capacity-2024-demand-discipline",
        "role": "direct_amy",
        "startChar": 33141,
        "endChar": 33424,
        "speaker": "Amy Hood",
        "exactQuote": "Our commitment to scaling our cloud and AI investment is guided by customer demand and the substantial market opportunity. As we scale these investments, we remain focused on driving efficiencies across every layer of our tech stack and disciplined cost management across every team."
      },
      {
        "id": "span-capacity-2024-external-supply",
        "role": "decision_context",
        "startChar": 43617,
        "endChar": 44010,
        "speaker": "Amy Hood",
        "exactQuote": "I feel like primarily, obviously, this is being built by us, but we’ve also used third-party capacity to help when we could have that help us, in terms of meeting customer demand. And I tend to think, looking forward, you’ll tend to see, and I guided toward it, accelerating capital expense to continue to be able to add capacity in the coming quarters, given what we see in terms of pipeline."
      }
    ]
  }
]
```

Use these exact candidate literals inside the three event specs:

```json
[
  {
    "id": "candidate-cloud-capacity-scale-2022",
    "workingTitle": "FY22 cloud capacity and broad resource scaling decision",
    "decisionDate": "2022-04-26",
    "fingerprint": {
      "primaryEntity": "Microsoft cloud capacity",
      "decisionAction": "scale infrastructure and people",
      "eventSpecificIdentifier": "FY22 Q3 sequential capital expenditure increase"
    }
  },
  {
    "id": "candidate-ai-capacity-opex-pivot-2023",
    "workingTitle": "FY23 AI infrastructure scaling with operating expense discipline",
    "decisionDate": "2023-04-25",
    "fingerprint": {
      "primaryEntity": "Azure AI infrastructure",
      "decisionAction": "scale infrastructure while constraining operating expense",
      "eventSpecificIdentifier": "FY23 Q3 material sequential capital expenditure increase"
    }
  },
  {
    "id": "candidate-ai-capacity-sourcing-2024",
    "workingTitle": "FY24 demand-led AI capacity and supply mix decision",
    "decisionDate": "2024-01-30",
    "fingerprint": {
      "primaryEntity": "Microsoft cloud and AI capacity",
      "decisionAction": "scale infrastructure while constraining operating expense",
      "eventSpecificIdentifier": "FY24 Q2 owned and third-party capacity acceleration"
    }
  }
]
```

Use these exact card literals, in the same order:

```json
[
  {
    "title": "Scale cloud infrastructure and people under broad demand",
    "decisionQuestion": "Should Microsoft scale both cloud infrastructure and operating headcount as broad cloud demand grows?",
    "situation": "Global cloud demand was growing and Microsoft was continuing broad investment across cloud engineering, deployment, LinkedIn, and sales.",
    "objectives": ["Meet growing global cloud demand", "Expand operating capacity across strategic growth areas"],
    "conditions": ["Global cloud-services demand was growing", "Investment needs spanned infrastructure and multiple operating teams"],
    "constraints": ["Capital timing varies by quarter", "Broad headcount growth increases the operating-cost base"],
    "options": [
      {"id":"scale_infrastructure_and_people","description":"Increase cloud capital expenditure and expand headcount in key operating areas.","expectedBenefit":"Adds physical and organizational capacity together.","principalRisk":"Raises both capital intensity and recurring operating expense.","selected":true},
      {"id":"scale_infrastructure_constrain_opex","description":"Increase infrastructure while holding operating-resource growth low.","expectedBenefit":"Protects profitability and workforce productivity.","principalRisk":"Insufficient deployment and sales capacity may constrain broad growth.","selected":false}
    ],
    "chosenAction": "scale_infrastructure_and_people",
    "rejectedBenefit": "Constraining operating-resource growth would preserve near-term expense leverage.",
    "observations": ["Amy Hood expected sequential capital-expenditure growth to meet global cloud demand.", "Company headcount grew 20 percent year over year across several investment areas."],
    "inferences": ["The disclosed resource mix expanded both infrastructure and people under broad demand."]
  },
  {
    "title": "Scale Azure AI infrastructure while constraining operating expense",
    "decisionQuestion": "Should Microsoft protect AI infrastructure investment while limiting operating-expense growth?",
    "situation": "Azure AI infrastructure required a material capacity increase while Microsoft was aligning costs with revenue growth and protecting profitability.",
    "objectives": ["Lead the AI platform wave", "Maintain healthy profitability while scaling capacity"],
    "conditions": ["Azure AI infrastructure required material sequential investment", "Scaled capital investment would increase COGS"],
    "constraints": ["FY24 operating-expense growth was expected to remain low", "Capacity buildout timing varies by quarter"],
    "options": [
      {"id":"scale_infrastructure_and_people","description":"Scale AI infrastructure and operating resources together.","expectedBenefit":"Maximizes organizational capacity around the platform shift.","principalRisk":"Weakens operating leverage while infrastructure COGS is rising.","selected":false},
      {"id":"scale_infrastructure_constrain_opex","description":"Increase Azure AI infrastructure capital while keeping operating-expense growth low.","expectedBenefit":"Funds urgent capacity while preserving disciplined profitability.","principalRisk":"Requires aggressive internal resource prioritization.","selected":true}
    ],
    "chosenAction": "scale_infrastructure_constrain_opex",
    "rejectedBenefit": "Expanding people with infrastructure could reduce execution bottlenecks.",
    "observations": ["Amy Hood expected a material sequential CapEx increase for Azure AI infrastructure.", "Amy Hood paired scaled CapEx with low expected operating-expense growth."],
    "inferences": ["Infrastructure capacity was protected while operating resources were constrained under profitability pressure."]
  },
  {
    "title": "Accelerate demand-led AI capacity with disciplined cost and mixed supply",
    "decisionQuestion": "Should Microsoft accelerate AI capacity using owned and external supply while maintaining cost discipline?",
    "situation": "Customer demand and pipeline required faster cloud and AI capacity additions than owned buildout alone could always deliver.",
    "objectives": ["Add capacity in time to serve visible customer demand", "Preserve operating-margin discipline while scaling AI investment"],
    "conditions": ["Customer demand and market opportunity guided investment", "Internal capacity lead time made third-party capacity useful"],
    "constraints": ["AI capital investment increases COGS", "Every team remained subject to disciplined cost management"],
    "options": [
      {"id":"scale_infrastructure_and_people","description":"Scale owned infrastructure and operating headcount together.","expectedBenefit":"Keeps execution resources under direct organizational control.","principalRisk":"Adds recurring operating cost while capital intensity is rising.","selected":false},
      {"id":"scale_infrastructure_constrain_opex","description":"Accelerate infrastructure, mix owned and third-party supply, and retain operating-cost discipline.","expectedBenefit":"Responds faster to pipeline without matching CapEx growth with broad OpEx growth.","principalRisk":"External capacity may have different economics or control characteristics.","selected":true}
    ],
    "chosenAction": "scale_infrastructure_constrain_opex",
    "rejectedBenefit": "Scaling people alongside owned capacity could increase direct control and reduce external dependency.",
    "observations": ["Amy Hood said customer demand guided cloud and AI investment.", "Microsoft used both owned and third-party capacity and expected accelerating capital expense."],
    "inferences": ["External supply was an execution tactic inside a capital-first, cost-disciplined resource policy."]
  }
]
```

The verifier derives each full `EventCandidate` from the candidate literal plus its registry source. It uses the source URL as the only discovery URL and a reviewed direct-Amy association, sets `directEvidenceGap` to `null`, `phase3Status` to `eligible`, and `status` to `approved_for_collection`. It derives decision-window and fingerprint source URLs from the same canonical source, so the manifest does not duplicate registry metadata.

- [ ] **Step 2: Update real-data expectations before application and confirm RED**

Change the real candidate CLI test name and assertion to expect 33 candidates while keeping 100 unique URLs:

```ts
assert.match(result.stdout, /33 candidates/i);
assert.match(result.stdout, /100 unique discovery URLs/i);
```

Update `validManifest` priorities 6–8 in `tests/amyHoodAdvisorEventPilot.test.ts`:

```ts
{
  candidateId: 'candidate-cloud-capacity-scale-2022',
  domain: 'ai_cloud_capex',
  priority: 6,
  replacementReason: 'Replace a sealed holdout target with reviewed non-holdout capacity evidence.',
},
{
  candidateId: 'candidate-ai-capacity-opex-pivot-2023',
  domain: 'ai_cloud_capex',
  priority: 7,
  replacementReason: 'Replace an incomplete M&A target with direct Amy resource-allocation evidence.',
},
{
  candidateId: 'candidate-ai-capacity-sourcing-2024',
  domain: 'ai_cloud_capex',
  priority: 8,
  replacementReason: 'Replace a sealed holdout target with demand-led capacity-sourcing evidence.',
},
```

Run:

```bash
npx tsx --test --test-name-pattern='candidate CLI|pilot manifest' tests/amyHoodAdvisorSourceCollection.test.ts tests/amyHoodAdvisorEventPilot.test.ts
```

Expected: FAIL because the real candidate and pilot data have not been applied.

- [ ] **Step 3: Verify and atomically apply real data**

Run:

```bash
npm run advisor:capacity:check -- --file data/b-track/amy-hood/advisor/imports/amy-hood-capacity-resource-pilot.json
npm run advisor:capacity:apply -- --file data/b-track/amy-hood/advisor/imports/amy-hood-capacity-resource-pilot.json
npm run advisor:candidates:check
```

Expected: 33 candidates, three generated incomplete cards, 10 pilot targets, five domains, and no holdout reference.

- [ ] **Step 4: Inspect and approve each card individually**

Inspect exact evidence first:

```bash
for id in \
  candidate-cloud-capacity-scale-2022 \
  candidate-ai-capacity-opex-pivot-2023 \
  candidate-ai-capacity-sourcing-2024; do
  jq '.' "data/b-track/amy-hood/advisor/events/pilot/${id}.json"
done
```

Approve only after confirming the action and both quotes:

```bash
for id in \
  candidate-cloud-capacity-scale-2022 \
  candidate-ai-capacity-opex-pivot-2023 \
  candidate-ai-capacity-sourcing-2024; do
  npx tsx server/runAmyHoodDecisionAdvisor.ts event:approve \
    --id "$id" \
    --reviewer "Codex exact-span review"
done
```

Expected: all three cards become `approved`; `single_document_family` may remain advisory but no blocking gap remains.

- [ ] **Step 5: Verify policy input and regression tests**

Run:

```bash
npx tsx -e "import { loadPolicyMemoryInput } from './server/decisionAdvisor/policyMemoryInput.ts'; void (async()=>{ const graph=await loadPolicyMemoryInput(process.cwd()); console.log(JSON.stringify({events:graph.events.map(x=>x.id), references:graph.references},null,2)); })();"
npm run advisor:capacity:test
npx tsx --test tests/amyHoodAdvisorEventPilot.test.ts
npx tsx --test tests/amyHoodAdvisorSourceCollection.test.ts
npm run advisor:policy-memory:test
npm run evaluation:v3:test
npm run lint
git diff --check
```

Expected: the three new events appear; no holdout ID/source/evidence appears; all tests pass.

- [ ] **Step 6: Commit reviewed real event data**

```bash
git add \
  data/b-track/amy-hood/advisor/imports/amy-hood-capacity-resource-pilot.json \
  data/b-track/amy-hood/advisor/event-candidates.json \
  data/b-track/amy-hood/advisor/source-registry.json \
  data/b-track/amy-hood/advisor/raw \
  data/b-track/amy-hood/advisor/events/pilot \
  tests/amyHoodAdvisorSourceCollection.test.ts \
  tests/amyHoodAdvisorEventPilot.test.ts
git commit -m "data: add reviewed capacity resource events"
```

---

### Task 5: Generate, review, and release the constrained policy memory

**Files:**
- Generate: `data/b-track/amy-hood/advisor/policy-memory/**`
- Generate on success: `data/b-track/amy-hood/advisor/memory-releases/**`

**Interfaces:**
- Consumes: approved FY22/FY23/FY24 capacity-resource cards, strict reflection builder, local Gemma 4, and terminal Codex review storage.
- Produces: one approved qualified reflection, one approved deployable policy, and one active immutable memory release, or a durable safe-stop report.

- [ ] **Step 1: Verify Gemma and the pre-run active pointer**

```bash
curl --fail --silent http://127.0.0.1:8080/v1/models | jq -r '.data[0].id'
if test -f data/b-track/amy-hood/advisor/memory-releases/active.json; then
  shasum -a 256 data/b-track/amy-hood/advisor/memory-releases/active.json
else
  echo NO_ACTIVE_RELEASE
fi
```

Expected model: `gemma4-v2-Q8_0.gguf`. Record the pointer hash or absence before writes.

- [ ] **Step 2: Run at most two reflection builds**

First build:

```bash
LOCAL_LLM_MODEL=gemma4-v2-Q8_0.gguf npm run advisor:memory:build -- --kind reflection
npm run advisor:memory:check
jq '.passing.reflections, .reviewRequired, .blocked' data/b-track/amy-hood/advisor/policy-memory/gate-report.json
```

Inspect every passing proposal and each cited span. Approve only a reflection whose support is FY23+FY24, contrast is FY22, decision object is `capacity_resource_mix`, and actions are the two exact canonical actions.

If none qualifies, run the same build command once more. Do not run a third build.

- [ ] **Step 3: Record individual reflection decisions**

For a qualifying reflection:

```bash
npx tsx server/runAmyHoodDecisionAdvisor.ts memory:review \
  --kind reflection \
  --id "$reflection_id" \
  --decision approved \
  --reviewer Codex \
  --rationale "Approved after exact-span review: FY23 and FY24 preserve infrastructure scaling while constraining operating expense, FY22 expands infrastructure and people under broader demand, and both condition and action deltas use one capacity-resource decision axis."
```

For any nonqualifying passing proposal, record `--decision rejected` with the exact mismatch. If approved reflection count remains zero after the second build, run `advisor:memory:check`, commit the model runs/reviews/gate report, and stop without policy or release.

- [ ] **Step 4: Build and review policies only after reflection approval**

```bash
LOCAL_LLM_MODEL=gemma4-v2-Q8_0.gguf npm run advisor:memory:build -- --kind policy
npm run advisor:memory:check
jq '.passing.policies, .reviewRequired, .blocked' data/b-track/amy-hood/advisor/policy-memory/gate-report.json
```

Approve only a medium/high `deployable_policy` that preserves:

```text
applicability: urgent, observable AI/cloud demand plus profitability or productivity constraint
priority: demand evidence -> capacity urgency -> profitability -> workforce productivity -> supply lead time
action: scale infrastructure while constraining OpEx; mix owned/external supply when lead time requires it
non-applicability: broad demand and low productivity pressure can justify scaling people and infrastructure together
reversal: demand/pipeline weakens or infrastructure economics cease to support capacity growth
```

Record approval with:

```bash
npx tsx server/runAmyHoodDecisionAdvisor.ts memory:review \
  --kind policy \
  --id "$policy_id" \
  --decision approved \
  --reviewer Codex \
  --rationale "Approved after checking demand gating, capacity urgency, operating-expense discipline, external-supply exception, reversal signal, exact evidence, and holdout exclusion."
```

- [ ] **Step 5: Build and activate the release only on success**

```bash
npm run advisor:memory:release
npm run advisor:memory:activate -- --latest
npm run advisor:memory:check
jq '.' data/b-track/amy-hood/advisor/memory-releases/active.json
npx tsx -e "import { resolveEvaluationV3ArmContext } from './server/evaluationV3/context.ts'; void (async()=>{ const root=process.cwd(); for (const arm of ['amy_policy_rag','amy_full_rag'] as const) console.log(arm, await resolveEvaluationV3ArmContext(root, arm)); })();"
```

Expected: both RAG arms resolve the same non-null release; policy context is nonempty; full RAG adds reflections/events/counterexamples; holdout leakage is zero.

- [ ] **Step 6: Full verification and final artifact commit**

Run:

```bash
npm run advisor:capacity:test
npm run advisor:policy-memory:test
npm run evaluation:v3:test
npm run lint
npm run build
git diff --check
git status --short
```

Expected: all tests, type checks, and production build pass. The existing Vite large-chunk warning is non-blocking; no test or type error is allowed.

Commit success artifacts:

```bash
git add data/b-track/amy-hood/advisor/policy-memory data/b-track/amy-hood/advisor/memory-releases
git commit -m "data: publish capacity resource policy memory"
```

If the strict gate stops instead, commit only traceability artifacts:

```bash
git add data/b-track/amy-hood/advisor/policy-memory
git commit -m "data: record capacity resource gate result"
```

---

## Final Acceptance Checklist

- [ ] Existing 30 candidates and all four holdouts remain byte-semantically present; three candidates are appended.
- [ ] Candidate validation accepts 33 and rejects counts outside 30–50.
- [ ] Pilot manifest contains exactly 10 targets and all five domains.
- [ ] All six exact quotes match normalized bytes and recomputed Amy speaker segments.
- [ ] New cards use actions `scale_infrastructure_and_people`, `scale_infrastructure_constrain_opex`, `scale_infrastructure_constrain_opex` in chronological order.
- [ ] No post-outcome or holdout reference reaches policy input.
- [ ] Atomic application leaves no partial state under injected write failure.
- [ ] Codex individually reviews every promoted reflection and policy.
- [ ] A release is activated only if a medium/high deployable policy is approved.
- [ ] Capacity, policy-memory, Evaluation v3, lint, and build verification pass.
