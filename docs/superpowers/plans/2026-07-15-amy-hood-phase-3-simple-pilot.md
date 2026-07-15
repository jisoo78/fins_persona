# Amy Hood Phase 3 Simple Event Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert reviewed public evidence into ten auditable Amy Hood decision-event cards, with five human-approved cards and five incomplete cards spanning all five decision domains.

**Architecture:** Reuse the Phase 2 source registry, immutable normalized artifacts, atomic JSON writer, and existing local Gemma 4 client. The model proposes exact evidence spans and one event card; deterministic validators verify the citations and decision-time boundary; only an explicit human approval command changes an incomplete card to approved. The pilot remains separate from the final twenty-event 12/4/4 release gate.

**Tech Stack:** TypeScript 5.8, Node.js 22, `tsx --test`, LangChain `ChatOpenAI`, local Gemma 4 at `http://127.0.0.1:8080/v1`, JSON persistence, Vite 6.

## Global Constraints

- Keep A Track and `PreInterviewContext` unchanged.
- Keep the Phase 1 evaluation v3 and Phase 2 source collection behavior unchanged.
- Use only immutable normalized artifacts referenced by `source-registry.json` as evidence.
- A discovery URL without a collected artifact is not evidence.
- Use Gemma 4 local with a 16,384-token context; do not call GPT-5-mini in this phase.
- Every approved card requires one exact event-specific Amy Hood statement and one decision-time context span.
- Never use post-outcome evidence as decision-time evidence.
- Keep only two persisted card states: `approved` and `incomplete`.
- Default every model-generated card to `incomplete`; only a human command may approve it.
- Prefer two document families, but report a diversity gap instead of blocking this ten-card pilot.
- Keep the original twenty-approved-event and 12/4/4 final release gate unchanged.
- Follow AGENTS.md TDD: one happy path, exactly three realistic edge cases by default, and safe failure-path coverage.
- Write every artifact atomically and preserve the last valid card when a run fails.

---

## File Structure

| Path | Responsibility |
|---|---|
| `shared/amyHoodDecisionAdvisor.ts` | Shared evidence-span, event-card, and pilot-manifest contracts |
| `server/decisionAdvisor/pilotManifest.ts` | Validate and load the fixed ten-candidate portfolio |
| `server/decisionAdvisor/pilotSourceLoader.ts` | Resolve reviewed registry associations to immutable normalized text |
| `server/decisionAdvisor/evidenceExtractor.ts` | Chunk text, call Gemma 4, parse one retry, validate exact evidence spans |
| `server/decisionAdvisor/eventCard.ts` | Propose, validate, persist, and explicitly approve event cards |
| `server/decisionAdvisor/pilotReport.ts` | Build the ten-card JSON summary and standalone HTML review report |
| `server/runAmyHoodDecisionAdvisor.ts` | Expose `event:build`, `event:approve`, and `event:report` commands |
| `agent_prompts/prompts/amy-hood-evidence-span-extractor.md` | Evidence-span extraction system instruction |
| `agent_prompts/prompts/amy-hood-event-card-builder.md` | Decision-event card proposal system instruction |
| `data/b-track/amy-hood/advisor/events/pilot/pilot-manifest.json` | Fixed ten-candidate portfolio |
| `data/b-track/amy-hood/advisor/events/pilot/candidate-*.json` | One current event card per candidate |
| `data/b-track/amy-hood/advisor/events/pilot/extraction-runs/` | Auditable model-run records |
| `docs/reports/2026-07-15-amy-hood-phase-3-pilot-review.html` | One-pass human review report |
| `tests/amyHoodAdvisorEventPilot.test.ts` | Phase 3 pilot happy, edge, and failure tests |

---

### Task 1: Define the Ten-Event Pilot Contract and Manifest

**Files:**
- Modify: `shared/amyHoodDecisionAdvisor.ts`
- Modify: `server/decisionAdvisor/paths.ts`
- Create: `server/decisionAdvisor/pilotManifest.ts`
- Create: `data/b-track/amy-hood/advisor/events/pilot/pilot-manifest.json`
- Create: `tests/amyHoodAdvisorEventPilot.test.ts`

**Interfaces:**
- Consumes: `DecisionDomain`, `EventCandidate`, `readJsonFile`, `advisorPaths(root)`.
- Produces: `PilotEvidenceSpan`, `PilotDecisionOption`, `PilotDecisionEvent`, `PilotManifest`, `loadPilotManifest(root, candidates)`.

- [ ] **Step 1: Create the test file with the required test plan and failing manifest tests**

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - reviewed artifacts produce a validator-ready card and explicit review approves it.
 *
 * 2. Edge Cases:
 *    - a short source remains one chunk.
 *    - a boundary-crossing Amy statement is deduplicated into one span.
 *    - one context document family remains reviewable with a diversity gap.
 *
 * 3. Failure Path:
 *    - malformed model JSON, invented quotes, missing direct Amy evidence,
 *      post-outcome leakage, and persistence failures cannot approve or corrupt a card.
 */
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { loadPilotManifest, validatePilotManifest } from '../server/decisionAdvisor/pilotManifest';
import type { EventCandidate } from '../shared/amyHoodDecisionAdvisor';

const loadRealCandidates = async () => JSON.parse(await readFile(
  new URL('../data/b-track/amy-hood/advisor/event-candidates.json', import.meta.url),
  'utf8',
)) as EventCandidate[];

const validManifest = {
  dataset: 'amy_hood_phase_3_pilot',
  version: '1.0.0',
  targets: [
    ['candidate-linkedin-acquisition-2016', 'm_and_a'],
    ['candidate-activision-acquisition-2022', 'm_and_a'],
    ['candidate-openai-expansion-2023', 'ai_cloud_capex'],
    ['candidate-copilot-price-2023', 'pricing_monetization'],
    ['candidate-workforce-reset-2023', 'cost_efficiency'],
    ['candidate-github-acquisition-2018', 'm_and_a'],
    ['candidate-nuance-acquisition-2021', 'm_and_a'],
    ['candidate-ai-datacenter-plan-2025', 'ai_cloud_capex'],
    ['candidate-m365-price-2021', 'pricing_monetization'],
    ['candidate-buyback-2021', 'shareholder_return_risk'],
  ].map(([candidateId, domain], index) => ({ candidateId, domain, priority: index + 1 })),
};

test('happy: pilot manifest fixes ten candidates across all five domains', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'amy-pilot-'));
  const candidates = await loadRealCandidates();
  const file = path.join(root, 'data/b-track/amy-hood/advisor/events/pilot/pilot-manifest.json');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(validManifest, null, 2) + '\n');
  const manifest = await loadPilotManifest(root, candidates);
  assert.equal(manifest.targets.length, 10);
  assert.equal(new Set(manifest.targets.map(({ domain }) => domain)).size, 5);
});

test('failure: pilot manifest rejects duplicate, unknown, or domain-mismatched candidates', async () => {
  const candidates = await loadRealCandidates();
  await assert.rejects(
    async () => validatePilotManifest({ ...validManifest, targets: [
      validManifest.targets[0],
      validManifest.targets[0],
      ...validManifest.targets.slice(2),
    ] }, candidates),
    /duplicate pilot candidate/,
  );
});
```

- [ ] **Step 2: Run the focused test and verify the missing module failure**

Run:

```bash
npx tsx --test tests/amyHoodAdvisorEventPilot.test.ts
```

Expected: FAIL with `Cannot find module '../server/decisionAdvisor/pilotManifest'`.

- [ ] **Step 3: Add the shared pilot contracts**

Append these exact contracts to `shared/amyHoodDecisionAdvisor.ts`:

```ts
export type PilotEvidenceRole = 'direct_amy' | 'decision_context' | 'post_outcome';

export type PilotEvidenceSpan = {
  id: string;
  sourceId: string;
  eventCandidateId: string;
  role: PilotEvidenceRole;
  exactQuote: string;
  startChar: number;
  endChar: number;
  publishedAt: string;
  speaker: 'Amy Hood' | null;
};

export type PilotDecisionOption = {
  id: string;
  description: string;
  expectedBenefit: string;
  principalRisk: string;
  selected: boolean;
};

export type PilotEvidenceGap =
  | 'missing_direct_amy'
  | 'missing_decision_context'
  | 'missing_immutable_artifact'
  | 'invalid_quote_offsets'
  | 'post_outcome_leakage'
  | 'single_document_family'
  | 'model_response_invalid';

export type PilotDecisionEvent = {
  id: string;
  candidateId: string;
  title: string;
  domain: DecisionDomain;
  decisionDate: string;
  decisionQuestion: string;
  situation: string;
  objectives: string[];
  conditions: string[];
  constraints: string[];
  options: PilotDecisionOption[];
  chosenAction: string;
  rejectedBenefit: string;
  observations: string[];
  inferences: string[];
  directAmyEvidenceIds: string[];
  contextEvidenceIds: string[];
  postOutcomeEvidenceIds: string[];
  sourceIds: string[];
  documentFamilyIds: string[];
  evidenceSpans: PilotEvidenceSpan[];
  status: 'approved' | 'incomplete';
  gaps: PilotEvidenceGap[];
  reviewer: string | null;
  reviewedAt: string | null;
  updatedAt: string;
};

export type PilotManifestTarget = {
  candidateId: string;
  domain: DecisionDomain;
  priority: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  replacementReason?: string;
};

export type PilotManifest = {
  dataset: 'amy_hood_phase_3_pilot';
  version: '1.0.0';
  targets: PilotManifestTarget[];
};
```

- [ ] **Step 4: Add paths, manifest validation, and the exact pilot manifest**

Extend `advisorPaths(root)` with:

```ts
eventsPilot: path.resolve(advisorRoot, 'events/pilot'),
pilotManifest: path.resolve(advisorRoot, 'events/pilot/pilot-manifest.json'),
pilotExtractionRuns: path.resolve(advisorRoot, 'events/pilot/extraction-runs'),
```

Implement `server/decisionAdvisor/pilotManifest.ts` with this public behavior:

```ts
import type { EventCandidate, PilotManifest } from '../../shared/amyHoodDecisionAdvisor';
import { readJsonFile } from './jsonStore';
import { advisorPaths } from './paths';

const domains = new Set([
  'm_and_a',
  'ai_cloud_capex',
  'pricing_monetization',
  'cost_efficiency',
  'shareholder_return_risk',
]);

export const validatePilotManifest = (
  value: unknown,
  candidates: EventCandidate[],
): PilotManifest => {
  if (!value || typeof value !== 'object') throw new Error('pilot manifest must be an object');
  const manifest = value as PilotManifest;
  if (manifest.dataset !== 'amy_hood_phase_3_pilot' || manifest.version !== '1.0.0') {
    throw new Error('pilot manifest identity is invalid');
  }
  if (!Array.isArray(manifest.targets) || manifest.targets.length !== 10) {
    throw new Error(`pilot manifest requires exactly 10 targets; found ${manifest.targets?.length ?? 0}`);
  }
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const ids = new Set<string>();
  const priorities = new Set<number>();
  const coveredDomains = new Set<string>();
  for (const target of manifest.targets) {
    if (ids.has(target.candidateId)) throw new Error(`duplicate pilot candidate: ${target.candidateId}`);
    if (priorities.has(target.priority)) throw new Error(`duplicate pilot priority: ${target.priority}`);
    const candidate = candidateById.get(target.candidateId);
    if (!candidate) throw new Error(`unknown pilot candidate: ${target.candidateId}`);
    if (candidate.domain !== target.domain || !domains.has(target.domain)) {
      throw new Error(`pilot domain mismatch: ${target.candidateId}`);
    }
    if (target.replacementReason !== undefined && target.replacementReason.trim().length < 20) {
      throw new Error(`pilot replacement reason is too short: ${target.candidateId}`);
    }
    ids.add(target.candidateId);
    priorities.add(target.priority);
    coveredDomains.add(target.domain);
  }
  if (coveredDomains.size !== 5) throw new Error('pilot manifest must cover all five domains');
  return manifest;
};

export const loadPilotManifest = async (root: string, candidates: EventCandidate[]) =>
  validatePilotManifest(
    await readJsonFile<unknown>(advisorPaths(root).pilotManifest, null),
    candidates,
  );
```

Create `pilot-manifest.json`:

```json
{
  "dataset": "amy_hood_phase_3_pilot",
  "version": "1.0.0",
  "targets": [
    { "candidateId": "candidate-linkedin-acquisition-2016", "domain": "m_and_a", "priority": 1 },
    { "candidateId": "candidate-activision-acquisition-2022", "domain": "m_and_a", "priority": 2 },
    { "candidateId": "candidate-openai-expansion-2023", "domain": "ai_cloud_capex", "priority": 3 },
    { "candidateId": "candidate-copilot-price-2023", "domain": "pricing_monetization", "priority": 4 },
    { "candidateId": "candidate-workforce-reset-2023", "domain": "cost_efficiency", "priority": 5 },
    { "candidateId": "candidate-github-acquisition-2018", "domain": "m_and_a", "priority": 6 },
    { "candidateId": "candidate-nuance-acquisition-2021", "domain": "m_and_a", "priority": 7 },
    { "candidateId": "candidate-ai-datacenter-plan-2025", "domain": "ai_cloud_capex", "priority": 8 },
    { "candidateId": "candidate-m365-price-2021", "domain": "pricing_monetization", "priority": 9 },
    { "candidateId": "candidate-buyback-2021", "domain": "shareholder_return_risk", "priority": 10 }
  ]
}
```

- [ ] **Step 5: Run focused tests and commit**

Run:

```bash
npx tsx --test tests/amyHoodAdvisorEventPilot.test.ts
npm run lint
```

Expected: all Phase 3 pilot tests pass and TypeScript exits `0`.

Commit:

```bash
git add shared/amyHoodDecisionAdvisor.ts server/decisionAdvisor/paths.ts server/decisionAdvisor/pilotManifest.ts data/b-track/amy-hood/advisor/events/pilot/pilot-manifest.json tests/amyHoodAdvisorEventPilot.test.ts
git commit -m "feat: define simple advisor event pilot"
```

---

### Task 2: Extract Exact Evidence Spans with Gemma 4

**Files:**
- Create: `server/decisionAdvisor/pilotSourceLoader.ts`
- Create: `server/decisionAdvisor/evidenceExtractor.ts`
- Create: `agent_prompts/prompts/amy-hood-evidence-span-extractor.md`
- Modify: `tests/amyHoodAdvisorEventPilot.test.ts`

**Interfaces:**
- Consumes: `AdvisorSourceRecord`, `EventCandidate`, `ModelClient`, `readAdvisorArtifactSecure`, reviewed candidate associations.
- Produces: `loadPilotSourceInputs(root, candidate)`, `buildEvidenceChunks(text, options)`, `extractPilotEvidence(input, model)`, `validatePilotEvidenceSpan(span, source)`.

- [ ] **Step 1: Add failing extraction tests**

Add tests that assert:

```ts
test('edge: short source remains one chunk', () => {
  assert.deepEqual(buildEvidenceChunks('Amy Hood decision text.'), [{
    index: 0,
    startChar: 0,
    endChar: 24,
    text: 'Amy Hood decision text.',
  }]);
});

test('failure: invented quotation fails exact source validation', () => {
  const source = { sourceId: 'source-1', text: 'The exact source sentence.' };
  assert.throws(
    () => validatePilotEvidenceSpan({
      id: 'span-1',
      sourceId: 'source-1',
      eventCandidateId: 'candidate-1',
      role: 'direct_amy',
      exactQuote: 'An invented sentence.',
      startChar: 0,
      endChar: 21,
      publishedAt: '2023-01-01',
      speaker: 'Amy Hood',
    }, source),
    /quote does not match immutable source/,
  );
});

test('failure: malformed model output retries once and returns an incomplete extraction', async () => {
  let calls = 0;
  const model = fakeModel(async () => {
    calls += 1;
    return { text: 'not-json', elapsedMs: 1 };
  });
  const result = await extractPilotEvidence(validExtractionInput, model);
  assert.equal(calls, 2);
  assert.deepEqual(result.spans, []);
  assert.deepEqual(result.gaps, ['model_response_invalid']);
});
```

- [ ] **Step 2: Run the focused test and verify missing export failures**

Run:

```bash
npx tsx --test tests/amyHoodAdvisorEventPilot.test.ts
```

Expected: FAIL because `buildEvidenceChunks`, `validatePilotEvidenceSpan`, and `extractPilotEvidence` do not exist.

- [ ] **Step 3: Implement immutable source loading**

`loadPilotSourceInputs(root, candidate)` must:

1. read `source-registry.json`;
2. keep associations with `reviewStatus === 'reviewed'`;
3. match registry records by canonical URL;
4. require `normalizedPath`, `sha256`, and a non-failed collection status;
5. read normalized text through `readAdvisorArtifactSecure`;
6. return separate `core` and `postOutcome` arrays;
7. return `missing_immutable_artifact` when a reviewed association has no valid artifact.

Use this exact result type:

```ts
export type PilotSourceInput = {
  source: AdvisorSourceRecord;
  candidate: EventCandidate;
  association: EventSourceAssociation;
  normalizedText: string;
};

export type PilotSourceLoadResult = {
  core: PilotSourceInput[];
  postOutcome: PilotSourceInput[];
  gaps: PilotEvidenceGap[];
};
```

- [ ] **Step 4: Implement bounded character chunks and exact span validation**

Use 12,000 characters with 500-character overlap:

```ts
export type EvidenceChunk = {
  index: number;
  startChar: number;
  endChar: number;
  text: string;
};

export const buildEvidenceChunks = (
  text: string,
  options: { maxChars: number; overlapChars: number } = {
    maxChars: 12_000,
    overlapChars: 500,
  },
): EvidenceChunk[] => {
  if (options.maxChars <= 0 || options.overlapChars < 0 || options.overlapChars >= options.maxChars) {
    throw new Error('invalid evidence chunk options');
  }
  if (!text) return [];
  const chunks: EvidenceChunk[] = [];
  let startChar = 0;
  while (startChar < text.length) {
    const endChar = Math.min(startChar + options.maxChars, text.length);
    chunks.push({
      index: chunks.length,
      startChar,
      endChar,
      text: text.slice(startChar, endChar),
    });
    if (endChar === text.length) break;
    startChar = endChar - options.overlapChars;
  }
  return chunks;
};
```

`validatePilotEvidenceSpan` must verify integer offsets, exact substring equality, source ID, candidate ID, ISO publication date, `speaker === 'Amy Hood'` for `direct_amy`, and `speaker === null` for context unless the source records another identified speaker. Convert chunk-local offsets to source-global offsets before validation. Deduplicate by `sourceId:startChar:endChar:role`.

- [ ] **Step 5: Write the extraction prompt and one-retry parser**

Create `amy-hood-evidence-span-extractor.md` with these exact instructions:

```markdown
You extract evidence from one immutable public-source chunk for one decision event.

Return one JSON object with a `spans` array. Each span must contain `role`,
`exactQuote`, `startChar`, `endChar`, and `speaker`. Offsets are relative to the
provided chunk. Copy quotes verbatim. Use `direct_amy` only for words explicitly
attributed to Amy Hood. Use `decision_context` only for information available no
later than the supplied decision date. Return an empty array when the chunk does
not support the event. Never infer a quote, repair wording, or use post-outcome
success as decision-time evidence. Return JSON only.
```

Call the existing `ModelClient` from `server/personaPipeline/modelClient.ts`. Parse plain JSON or one fenced JSON block. Retry the same chunk once when parsing or schema validation fails. Save each request hash, response text, elapsed time, and success state under `pilotExtractionRuns` using `writeJsonAtomic`.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
npx tsx --test tests/amyHoodAdvisorEventPilot.test.ts
npm run persona:test
npm run lint
```

Expected: pilot extraction tests, the existing 15 persona tests, and TypeScript all pass.

Commit:

```bash
git add server/decisionAdvisor/pilotSourceLoader.ts server/decisionAdvisor/evidenceExtractor.ts agent_prompts/prompts/amy-hood-evidence-span-extractor.md tests/amyHoodAdvisorEventPilot.test.ts
git commit -m "feat: extract exact advisor event evidence"
```

---

### Task 3: Build, Validate, Persist, and Approve Event Cards

**Files:**
- Create: `server/decisionAdvisor/eventCard.ts`
- Create: `agent_prompts/prompts/amy-hood-event-card-builder.md`
- Modify: `tests/amyHoodAdvisorEventPilot.test.ts`

**Interfaces:**
- Consumes: `EventCandidate`, validated `PilotEvidenceSpan[]`, `ModelClient`, `writeJsonAtomic`.
- Produces: `proposePilotEventCard`, `validatePilotEventCard`, `savePilotEventCard`, `approvePilotEventCard`, `eventCardPath`.

- [ ] **Step 1: Add failing event-card tests**

The happy test must prove the complete transition:

```ts
test('happy: validator-ready proposal becomes approved only after explicit review', async () => {
  const proposed = await proposePilotEventCard(candidate, validSpans, validModel);
  assert.equal(proposed.status, 'incomplete');
  assert.deepEqual(validatePilotEventCard(proposed).blockingGaps, []);
  await savePilotEventCard(root, proposed);
  const approved = await approvePilotEventCard(root, proposed.id, {
    reviewer: 'Codex evidence review',
    reviewedAt: '2026-07-15T12:00:00.000Z',
  });
  assert.equal(approved.status, 'approved');
  assert.equal(approved.reviewer, 'Codex evidence review');
});
```

Add failure tests for no direct Amy span, a post-outcome span referenced as core evidence, two selected options, and an injected atomic-write failure that preserves the prior card bytes.

- [ ] **Step 2: Run tests and verify the missing module failure**

Run:

```bash
npx tsx --test tests/amyHoodAdvisorEventPilot.test.ts
```

Expected: FAIL because `eventCard.ts` is missing.

- [ ] **Step 3: Write the event-card prompt**

Create `amy-hood-event-card-builder.md`:

```markdown
Build one decision-event card using only the supplied validated evidence spans.

Return JSON with title, decisionQuestion, situation, objectives, conditions,
constraints, options, chosenAction, rejectedBenefit, observations, and inferences.
Provide at least two concrete options and mark exactly one selected. Observations
must be directly supported by evidence. Put interpretation only in `inferences`.
Do not mention later success, failure, or outcomes. Do not create citations or
facts that are absent from the supplied spans. Return JSON only.
```

- [ ] **Step 4: Implement proposal normalization and deterministic validation**

`proposePilotEventCard` always sets:

```ts
status: 'incomplete',
reviewer: null,
reviewedAt: null,
decisionDate: candidate.decisionWindowEnd,
candidateId: candidate.id,
domain: candidate.domain,
```

`validatePilotEventCard(card)` returns:

```ts
export type PilotEventValidation = {
  blockingGaps: PilotEvidenceGap[];
  advisoryGaps: PilotEvidenceGap[];
};
```

Blocking rules:

- no exact `direct_amy` evidence -> `missing_direct_amy`;
- no exact `decision_context` evidence -> `missing_decision_context`;
- any core evidence published after `decisionDate` -> `post_outcome_leakage`;
- any post-outcome evidence ID in direct or context IDs -> `post_outcome_leakage`;
- invalid source offsets -> `invalid_quote_offsets`;
- fewer than two options or selected count other than one -> throw `invalid decision options`;
- empty chosen action, constraints, or rejected benefit -> throw the precise field error.

One document family produces the nonblocking advisory gap `single_document_family`.

- [ ] **Step 5: Implement atomic persistence and explicit approval**

Use paths and behavior:

```ts
export const eventCardPath = (root: string, candidateId: string) =>
  path.resolve(advisorPaths(root).eventsPilot, `${candidateId}.json`);

export const savePilotEventCard = async (
  root: string,
  card: PilotDecisionEvent,
  dependencies: { write: typeof writeJsonAtomic } = { write: writeJsonAtomic },
) => {
  await dependencies.write(eventCardPath(root, card.candidateId), card);
};
```

`approvePilotEventCard` must reload the persisted card, validate it, reject any blocking gap, require a nonblank reviewer and valid ISO timestamp, preserve advisory gaps, set `status: 'approved'`, and atomically overwrite the card. Reapproval of identical reviewer and timestamp is idempotent. Model code never calls this function.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
npx tsx --test tests/amyHoodAdvisorEventPilot.test.ts
npx tsx --test tests/amyHoodAdvisorDirectEvidenceReview.test.ts tests/amyHoodAdvisorSupportingEvidenceReview.test.ts
npm run lint
```

Expected: all focused Phase 2 and Phase 3 tests pass with zero failures.

Commit:

```bash
git add server/decisionAdvisor/eventCard.ts agent_prompts/prompts/amy-hood-event-card-builder.md tests/amyHoodAdvisorEventPilot.test.ts
git commit -m "feat: build auditable advisor event cards"
```

---

### Task 4: Expose the Minimal CLI and One-Pass Report

**Files:**
- Create: `server/decisionAdvisor/pilotReport.ts`
- Modify: `server/runAmyHoodDecisionAdvisor.ts`
- Modify: `package.json`
- Modify: `tests/amyHoodAdvisorEventPilot.test.ts`

**Interfaces:**
- Consumes: pilot manifest, source loader, evidence extractor, event-card functions.
- Produces: `buildPilotEvent`, `buildPilotBatch`, `buildPilotReport`, and CLI commands `event:build`, `event:approve`, `event:report`.

- [ ] **Step 1: Add failing CLI and report tests**

Add subprocess tests that verify:

```ts
test('happy: event report summarizes ten cards and all five domains', async () => {
  const report = await buildPilotReport(root, manifest, cards);
  assert.deepEqual(report.counts, { approved: 5, incomplete: 5, total: 10 });
  assert.equal(Object.keys(report.domainCounts).length, 5);
});

test('failure: batch continues after one model failure', async () => {
  const result = await buildPilotBatch(root, manifest, {
    build: async (candidateId) => {
      if (candidateId === manifest.targets[2].candidateId) throw new Error('model unavailable');
      return incompleteCard(candidateId);
    },
  });
  assert.equal(result.results.length, 9);
  assert.deepEqual(result.failures, [{
    candidateId: manifest.targets[2].candidateId,
    message: 'model unavailable',
  }]);
});
```

CLI failure tests must reject missing `--id`, simultaneous `--id` and `--pilot`, blank reviewer, unknown candidate, and approval of a card with blocking gaps.

- [ ] **Step 2: Run the tests and verify missing report exports**

Run:

```bash
npx tsx --test tests/amyHoodAdvisorEventPilot.test.ts
```

Expected: FAIL because `pilotReport.ts` and the new commands do not exist.

- [ ] **Step 3: Implement single and batch building**

`buildPilotEvent(root, candidateId, model)` must load the candidate and manifest, reject non-pilot IDs, load immutable inputs, extract spans, propose a card when possible, merge loader and extraction gaps, preserve an existing approved card unless `--refresh-approved` is explicitly passed, and save an incomplete card on recoverable evidence gaps.

`buildPilotBatch` processes targets in priority order and returns:

```ts
export type PilotBatchResult = {
  results: PilotDecisionEvent[];
  failures: Array<{ candidateId: string; message: string }>;
};
```

A failure for one target must not abort later targets.

- [ ] **Step 4: Implement JSON summary and standalone HTML report**

`buildPilotReport` returns counts, domain counts, and one row per manifest target. Each row includes status, decision question, chosen action, direct quote, context quote, blocking gaps, and advisory gaps. Escape every interpolated HTML string with a local `escapeHtml` helper before writing `docs/reports/2026-07-15-amy-hood-phase-3-pilot-review.html`.

The HTML header must state:

```text
공개자료를 바탕으로 구성된 비공식 AI 시뮬레이션이며, Amy Hood 본인이나 Microsoft의 공식 입장이 아니다.
```

- [ ] **Step 5: Add the three CLI commands and package scripts**

Commands:

```bash
npx tsx server/runAmyHoodDecisionAdvisor.ts event:build --id candidate-linkedin-acquisition-2016 --root "$PWD"
npx tsx server/runAmyHoodDecisionAdvisor.ts event:build --pilot --root "$PWD"
npx tsx server/runAmyHoodDecisionAdvisor.ts event:approve --id candidate-linkedin-acquisition-2016 --reviewer "Codex evidence review" --root "$PWD"
npx tsx server/runAmyHoodDecisionAdvisor.ts event:report --pilot --root "$PWD"
```

Package scripts:

```json
"advisor:event:build": "tsx server/runAmyHoodDecisionAdvisor.ts event:build",
"advisor:event:approve": "tsx server/runAmyHoodDecisionAdvisor.ts event:approve",
"advisor:event:report": "tsx server/runAmyHoodDecisionAdvisor.ts event:report"
```

The approval command generates `reviewedAt` once with `new Date().toISOString()`. It must not accept a client-provided timestamp.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
npx tsx --test tests/amyHoodAdvisorEventPilot.test.ts
npm run evaluation:test
npm run lint
```

Expected: pilot, evaluation regression, and TypeScript checks pass.

Commit:

```bash
git add server/decisionAdvisor/pilotReport.ts server/runAmyHoodDecisionAdvisor.ts package.json tests/amyHoodAdvisorEventPilot.test.ts
git commit -m "feat: expose simple advisor event pilot"
```

---

### Task 5: Expand Evidence and Materialize the Ten Pilot Cards

**Files:**
- Modify: `data/b-track/amy-hood/advisor/source-registry.json`
- Modify: `data/b-track/amy-hood/advisor/event-candidates.json`
- Create or modify: `data/b-track/amy-hood/advisor/raw/`
- Create or modify: `data/b-track/amy-hood/advisor/normalized/`
- Create: `data/b-track/amy-hood/advisor/reviews/2026-07-15-openai-expansion-2023-direct-evidence.json`
- Create: `data/b-track/amy-hood/advisor/reviews/2026-07-15-openai-expansion-2023-context-evidence.json`
- Create: `data/b-track/amy-hood/advisor/reviews/2026-07-15-copilot-price-2023-direct-evidence.json`
- Create: `data/b-track/amy-hood/advisor/reviews/2026-07-15-copilot-price-2023-context-evidence.json`
- Create: `data/b-track/amy-hood/advisor/reviews/2026-07-15-workforce-reset-2023-direct-evidence.json`
- Create: `data/b-track/amy-hood/advisor/reviews/2026-07-15-workforce-reset-2023-context-evidence.json`
- Create: `data/b-track/amy-hood/advisor/events/pilot/candidate-*.json`
- Create: `docs/reports/2026-07-15-amy-hood-phase-3-pilot-review.html`

**Interfaces:**
- Consumes: Phase 2 `source:collect`, `source:import`, `evidence:check/apply`, `support:check/apply`; Phase 3 `event:build/report`.
- Produces: five validator-ready cards, five incomplete cards with exact gaps, and the review report.

- [ ] **Step 1: Generate the initial ten-card gap baseline**

Run:

```bash
npm run advisor:event:build -- --pilot --root "$PWD"
npm run advisor:event:report -- --pilot --root "$PWD"
```

Expected: ten card files exist or the batch report names a precise per-candidate model/source failure; LinkedIn and Activision are validator-ready; no card is automatically approved.

- [ ] **Step 2: Collect evidence for the three primary completion targets**

Work in this exact order:

1. `candidate-openai-expansion-2023`
2. `candidate-copilot-price-2023`
3. `candidate-workforce-reset-2023`

For each candidate, search only for:

- an official Microsoft Investor, Microsoft Source, SEC, or event transcript containing an event-specific Amy Hood statement available by the decision date;
- one decision-time contextual artifact defining the action, constraints, or economics.

Register canonical URLs before collection. Use `source:collect` for supported official hosts. Use `source:import` only for a complete, publicly reviewable artifact with exact speaker boundaries. Do not copy search snippets, PDF summaries, or inaccessible article fragments into evidence.

After each artifact is stored, create the named review manifests with exact offsets and run this loop:

```bash
for slug in openai-expansion-2023 copilot-price-2023 workforce-reset-2023; do
  direct="data/b-track/amy-hood/advisor/reviews/2026-07-15-${slug}-direct-evidence.json"
  context="data/b-track/amy-hood/advisor/reviews/2026-07-15-${slug}-context-evidence.json"
  candidate_id="candidate-${slug}"
  npm run advisor:evidence:check -- --file "$direct" --root "$PWD"
  npm run advisor:evidence:apply -- --file "$direct" --root "$PWD"
  npm run advisor:support:check -- --file "$context" --root "$PWD"
  npm run advisor:support:apply -- --file "$context" --root "$PWD"
  npm run advisor:event:build -- --id "$candidate_id" --root "$PWD"
done
```

A source blocked by access control remains `review_required` or `failed`; do not bypass access control.

- [ ] **Step 3: Use same-domain fallback only when a primary target remains blocked**

After official-source and complete-public-artifact searches are exhausted, choose the first candidate in this fixed fallback order whose evidence passes the same validator:

```text
AI and cloud CapEx: candidate-openai-partnership-2019, candidate-gpt3-license-2020
Pricing and monetization: candidate-copilot-ga-price-2023, candidate-teams-unbundle-2023
Cost efficiency: candidate-one-microsoft-2013, candidate-phone-streamline-2016
```

Replace only within the same domain. Update `pilot-manifest.json`, preserve ten unique priorities, and add a `replacementReason` of at least 20 characters to the affected target. Add the corresponding manifest edge test before changing the data.

- [ ] **Step 4: Rebuild all ten cards and preserve five explicit incompletes**

Run:

```bash
npm run advisor:event:build -- --pilot --root "$PWD"
npm run advisor:event:report -- --pilot --root "$PWD"
```

Expected before human approval:

- ten current card files;
- at least five validator-ready cards;
- GitHub and Nuance remain incomplete unless complete direct transcripts were independently verified;
- every non-ready card contains at least one machine-readable blocking gap;
- all five domains remain represented.

If more than five cards become validator-ready, keep the five highest-priority validator-ready cards for the approval checkpoint and leave the others incomplete; do not delete their evidence.

- [ ] **Step 5: Present the one-pass HTML report for human review**

Open or provide:

```text
docs/reports/2026-07-15-amy-hood-phase-3-pilot-review.html
```

The reviewer confirms exactly five named cards. Do not run approval commands before this checkpoint.

- [ ] **Step 6: Apply the five explicit approvals and regenerate the report**

The reviewer confirms the validator-ready cards occupying priorities 1 through 5. If a primary target was replaced, the replacement keeps the original priority. Apply those five approvals with:

```bash
for priority in 1 2 3 4 5; do
  candidate_id="$(node -e "const m=require('./data/b-track/amy-hood/advisor/events/pilot/pilot-manifest.json'); const p=Number(process.argv[1]); process.stdout.write(m.targets.find((x)=>x.priority===p).candidateId)" "$priority")"
  npm run advisor:event:approve -- --id "$candidate_id" --reviewer "Codex evidence review" --root "$PWD"
done
```

Then run:

```bash
npm run advisor:event:report -- --pilot --root "$PWD"
```

Expected: report totals are exactly `approved: 5`, `incomplete: 5`, `total: 10`.

- [ ] **Step 7: Verify data integrity and commit**

Run:

```bash
npm run advisor:event:report -- --pilot --root "$PWD"
npm run advisor:support:batch -- --root "$PWD"
npx tsx --test tests/amyHoodAdvisorEventPilot.test.ts tests/amyHoodAdvisorDirectEvidenceReview.test.ts tests/amyHoodAdvisorSupportingEvidenceReview.test.ts tests/amyHoodAdvisorSourceCollection.test.ts
git diff --check
```

Expected: the pilot report is 5/5, the support batch truthfully retains remaining deficits, all focused tests pass, and `git diff --check` exits `0`.

Commit only reviewed source artifacts, candidate/registry updates, event cards, manifests, and the report. Do not commit model caches unrelated to the ten targets.

```bash
git add data/b-track/amy-hood/advisor/source-registry.json data/b-track/amy-hood/advisor/event-candidates.json data/b-track/amy-hood/advisor/raw data/b-track/amy-hood/advisor/normalized data/b-track/amy-hood/advisor/reviews data/b-track/amy-hood/advisor/events/pilot docs/reports/2026-07-15-amy-hood-phase-3-pilot-review.html
git commit -m "data: build Amy Hood Phase 3 event pilot"
```

---

### Task 6: Run the Full Phase Gate and Record the Honest Project State

**Files:**
- Modify: `docs/reports/2026-07-15-amy-hood-phase-3-pilot-review.html`

**Interfaces:**
- Consumes: all Phase 3 implementation and data artifacts.
- Produces: final verification evidence and an explicit statement that the pilot does not satisfy the twenty-event release gate.

- [ ] **Step 1: Run all relevant tests and build checks**

Run:

```bash
npx tsx --test tests/amyHoodAdvisorEventPilot.test.ts tests/amyHoodAdvisorDirectEvidenceReview.test.ts tests/amyHoodAdvisorSupportingEvidenceReview.test.ts tests/amyHoodAdvisorSourceCollection.test.ts tests/amyHoodAdvisorPdfUrlInventory.test.ts
npm run advisor:evaluation-v3:test
npm run evaluation:test
npm run persona:test
npm run inventory:test
npm run lint
npm run build
git diff --check
```

Expected: every command exits `0`. The Vite large-chunk warning is acceptable only when the build exits `0` and must be recorded as a separate frontend optimization item.

- [ ] **Step 2: Run the strict final-release checks without weakening them**

Run:

```bash
npm run advisor:candidates:check -- --root "$PWD"
npm run advisor:sources:check -- --root "$PWD"
```

Expected at this pilot stage: either command may exit nonzero because the 100-URL, 50-document, twenty-approved-event, or 12/4/4 final release requirements remain incomplete. Record the exact current counts in the report; do not change validators to force a pass.

- [ ] **Step 3: Add the final report summary**

The report footer must state all four facts:

```text
Phase 3 pilot: complete or incomplete based on the 5/5 card result.
Approved event cards: 5 of 10 pilot targets.
Final twenty-event release gate: not passed.
Phase 4 policy prototype may use only the five approved cards; production-like policy release remains blocked.
```

Also record test counts, lint status, build status, discovered URL count, valid document count, and current eligible-event count from the fresh commands.

- [ ] **Step 4: Verify and commit the final report update**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors and only the intended report change is unstaged.

Commit:

```bash
git add docs/reports/2026-07-15-amy-hood-phase-3-pilot-review.html
git commit -m "docs: report Phase 3 event pilot results"
```

---

## Completion Checklist

- [ ] Ten manifest targets span all five decision domains.
- [ ] Ten current event-card JSON files exist.
- [ ] Exactly five cards are human-approved.
- [ ] Exactly five cards remain incomplete with explicit gaps.
- [ ] Every approved card has exact Amy Hood and decision-context evidence.
- [ ] No approved card contains post-outcome leakage.
- [ ] Gemma 4 extraction uses one bounded retry and never auto-approves.
- [ ] One event failure does not abort the ten-event batch.
- [ ] The standalone HTML report supports one-pass human review.
- [ ] Existing Phase 1, Phase 2, evaluation, persona, inventory, lint, and build checks pass.
- [ ] The strict twenty-event final release gate remains unchanged and its current failure is reported honestly.
