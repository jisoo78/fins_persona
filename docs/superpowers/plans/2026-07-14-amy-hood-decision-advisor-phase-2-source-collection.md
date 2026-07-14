# Amy Hood Decision Advisor Phase 2 Source Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a lawful, reproducible, registry-first pipeline that discovers at least 30 candidate Amy Hood decision events and preserves their public source material without mixing later outcomes into decision-time evidence.

**Architecture:** A source registry is the system of record. Automatic collection is restricted to an explicit official-domain allowlist; unsupported pages, PDFs, transcripts, and LinkedIn discoveries enter through a reviewed manual-import path. Raw source writes are content-addressed and atomic, and a failed refresh never destroys the last valid artifact.

**Tech Stack:** TypeScript 5.8, Node.js 22 native `fetch`, Cheerio, SHA-256, JSON/JSONL, `tsx --test`.

## Global Constraints

- Treat LinkedIn as discovery-only; do not automate login, scraping, or access-control bypass.
- Automatically fetch official HTTPS URLs on `microsoft.com`, `news.microsoft.com`, `sec.gov`, and `data.sec.gov`; a Tier 3 public host requires an explicit registry approval before `PublicHtmlCollector` may fetch it.
- Store decision-time evidence separately from post-outcome material.
- Preserve source URL, title, publisher, publication date, speaker, capture time, hash, tier, rights note, and collection status.
- Keep every failed source explicit as `failed` or `review_required`; never silently substitute another document.
- Do not alter the existing B Track corpus or evaluation v2 data.
- Follow the AGENTS.md Test Plan format.

---

### Task 1: Define source, candidate-event, and collection contracts

**Files:**
- Modify: `shared/amyHoodDecisionAdvisor.ts`
- Create: `server/decisionAdvisor/paths.ts`
- Create: `tests/amyHoodAdvisorSourceCollection.test.ts`

**Interfaces:**
- Produces: `SourceTier`, `CollectionStatus`, `CollectionFailureReason`, `EventCandidate`, `AdvisorSourceRecord`, `AdvisorRawSource`, and `advisorPaths(root)`.

- [ ] **Step 1: Write the test plan and failing path/contract test**

Start the test file with:

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - an official Amy Hood source and candidate event resolve to deterministic advisor paths.
 *
 * 2. Edge Cases:
 *    - a discovery-only LinkedIn URL remains metadata-only.
 *    - a duplicate URL resolves to one canonical registry identity.
 *    - a source without an optional speaker remains valid but reviewable.
 *
 * 3. Failure Path:
 *    - disallowed hosts and failed refreshes produce explicit safe states without overwriting valid raw data.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { advisorPaths } from '../server/decisionAdvisor/paths';

test('happy: advisor paths remain isolated from existing B Track data', () => {
  const paths = advisorPaths('/repo');
  assert.equal(paths.root, '/repo/data/b-track/amy-hood/advisor');
  assert.equal(paths.registry, '/repo/data/b-track/amy-hood/advisor/source-registry.json');
  assert.equal(paths.raw, '/repo/data/b-track/amy-hood/advisor/raw');
});
```

- [ ] **Step 2: Run the test and confirm the missing-module failure**

```bash
npx tsx --test tests/amyHoodAdvisorSourceCollection.test.ts
```

Expected: FAIL because `server/decisionAdvisor/paths.ts` is absent.

- [ ] **Step 3: Add the shared source contracts**

Append these declarations to `shared/amyHoodDecisionAdvisor.ts`:

```ts
export type SourceTier = 1 | 2 | 3 | 'discovery_only';
export type CollectionStatus =
  | 'discovered'
  | 'queued'
  | 'collected'
  | 'normalized'
  | 'review_required'
  | 'approved'
  | 'failed';

export type CollectionFailureReason =
  | 'access_denied'
  | 'paywalled'
  | 'transcript_missing'
  | 'speaker_uncertain'
  | 'duplicate'
  | 'insufficient_decision_context'
  | 'post_outcome_only'
  | 'network_error'
  | 'invalid_content';

export type EventCandidate = {
  id: string;
  workingTitle: string;
  domain: DecisionDomain;
  decisionWindowStart: string;
  decisionWindowEnd: string;
  discoveryUrls: string[];
  notes: string;
  status: 'candidate' | 'approved_for_collection' | 'rejected';
};

export type AdvisorSourceRecord = {
  id: string;
  canonicalUrl: string;
  eventCandidateIds: string[];
  tier: SourceTier;
  title: string;
  publisher: string;
  publishedAt: string | null;
  speaker: string | null;
  sourceType: string;
  collector: 'microsoft_ir' | 'microsoft_source' | 'sec_edgar' | 'public_html' | 'transcript_import' | 'manual_import';
  temporalRole: 'pre_decision' | 'decision_time' | 'post_outcome';
  rightsNote: string;
  approvedPublicHost: boolean;
  collectionStatus: CollectionStatus;
  rawPath: string | null;
  normalizedPath: string | null;
  sha256: string | null;
  capturedAt: string | null;
  failureReason: CollectionFailureReason | null;
};

export type AdvisorRawSource = {
  sourceId: string;
  canonicalUrl: string;
  title: string;
  mediaType: string;
  bodyBase64: string;
  metadata: Omit<AdvisorSourceRecord, 'rawPath' | 'normalizedPath' | 'failureReason'>;
};
```

- [ ] **Step 4: Implement `advisorPaths` with `node:path.resolve` and rerun the test**

Expected: PASS.

- [ ] **Step 5: Commit the contracts**

```bash
git add shared/amyHoodDecisionAdvisor.ts server/decisionAdvisor/paths.ts tests/amyHoodAdvisorSourceCollection.test.ts
git commit -m "feat: define advisor source collection contracts"
```

### Task 2: Add canonical URL, allowlist, and atomic JSON persistence

**Files:**
- Create: `server/decisionAdvisor/sourcePolicy.ts`
- Create: `server/decisionAdvisor/jsonStore.ts`
- Modify: `tests/amyHoodAdvisorSourceCollection.test.ts`

**Interfaces:**
- Produces: `canonicalizeSourceUrl(url)`, `classifySourceUrl(url)`, `readJsonFile(path, fallback)`, and `writeJsonAtomic(path, value)`.

- [ ] **Step 1: Add failing policy and persistence tests**

```ts
test('edge: canonicalization removes fragments and tracking parameters', () => {
  assert.equal(
    canonicalizeSourceUrl('https://www.microsoft.com/a?utm_source=x&id=7#quote'),
    'https://www.microsoft.com/a?id=7',
  );
});

test('edge: LinkedIn remains discovery-only', () => {
  assert.deepEqual(classifySourceUrl('https://www.linkedin.com/posts/example'), {
    mode: 'discovery_only',
    tier: 'discovery_only',
  });
});

test('failure: automatic collection rejects non-allowlisted hosts', () => {
  assert.throws(() => classifySourceUrl('https://example.com/interview', []), /manual review/);
});
```

Add a temporary-directory test proving `writeJsonAtomic` leaves valid JSON and no `.tmp` file after success.

- [ ] **Step 2: Run the tests and verify failure**

```bash
npx tsx --test tests/amyHoodAdvisorSourceCollection.test.ts
```

- [ ] **Step 3: Implement the policy**

Use an exact host/suffix check rather than substring matching:

```ts
const autoHosts = ['microsoft.com', 'news.microsoft.com', 'sec.gov', 'data.sec.gov'];

const hostMatches = (host: string, allowed: string) =>
  host === allowed || host.endsWith(`.${allowed}`);
```

Reject non-HTTPS URLs. Remove `utm_*`, `fbclid`, `gclid`, and fragments, sort remaining query keys, and map LinkedIn to `discovery_only`. Return tier `1` for Microsoft/SEC official sources. Accept a Tier 3 host only when its exact canonical host appears in the registry's `approvedPublicHosts` list; otherwise require manual review.

- [ ] **Step 4: Implement atomic JSON writes**

Write to `${path}.${process.pid}.tmp`, `fsync`, then `rename`. On failure, delete only the temporary file; do not touch the prior destination.

- [ ] **Step 5: Rerun tests and commit**

```bash
npx tsx --test tests/amyHoodAdvisorSourceCollection.test.ts
git add server/decisionAdvisor/sourcePolicy.ts server/decisionAdvisor/jsonStore.ts tests/amyHoodAdvisorSourceCollection.test.ts
git commit -m "feat: protect advisor source persistence"
```

### Task 3: Implement the registry and idempotent official-source collector

**Files:**
- Create: `server/decisionAdvisor/sourceRegistry.ts`
- Create: `server/decisionAdvisor/collectors/types.ts`
- Create: `server/decisionAdvisor/collectors/microsoftCollectors.ts`
- Create: `server/decisionAdvisor/collectors/secEdgarCollector.ts`
- Create: `server/decisionAdvisor/collectors/publicHtmlCollector.ts`
- Create: `server/decisionAdvisor/officialSourceCollector.ts`
- Modify: `tests/amyHoodAdvisorSourceCollection.test.ts`

**Interfaces:**
- Produces: `SourceCollector.collect(record, deps)`, `upsertDiscoveredSource`, `markCollectionFailure`, `MicrosoftIRCollector`, `MicrosoftSourceCollector`, `SecEdgarCollector`, `PublicHtmlCollector`, and injected `fetchImpl` for deterministic tests.

- [ ] **Step 1: Add failing happy, duplicate, and dependency-failure tests**

Use a fake HTML response containing `<title>`, `<main>`, and a publication date. Assert one collected record, normalized text, SHA-256, and raw JSON. Then collect the canonical-equivalent URL twice and assert the registry still has one record.

Add this failure assertion:

```ts
test('failure: refresh failure preserves the last valid artifact', async () => {
  const before = await readFile(validRawPath, 'utf8');
  await assert.rejects(() => collectOfficialSource(record, {
    fetchImpl: async () => { throw new Error('network unavailable'); },
    root,
  }), /network unavailable/);
  assert.equal(await readFile(validRawPath, 'utf8'), before);
  assert.equal(loadRegistry(root).sources[0].collectionStatus, 'failed');
});
```

- [ ] **Step 2: Run tests and verify missing implementations**

- [ ] **Step 3: Implement registry transitions**

Allow only:

```text
discovered -> queued | review_required | failed
queued -> collected | review_required | failed
collected -> normalized | review_required | failed
normalized -> review_required | failed
review_required -> approved | queued | failed
approved -> queued | failed
failed -> queued | review_required | failed
```

Compute source IDs from the canonical URL hash. Merge candidate IDs without duplicates. Keep the last valid `rawPath`, `normalizedPath`, and `sha256` when a refresh fails. If a successful refresh changes the hash, create a new immutable source version instead of replacing the earlier body.

- [ ] **Step 4: Implement official HTML collection**

Send a descriptive `User-Agent`, require `response.ok`, cap response bytes at 5 MB, and reject unsupported content. Persist the exact response bytes as base64 before updating the registry to `collected`; do not rewrite raw bodies with an LLM. In a separate normalization write, remove script/style/navigation text with Cheerio, normalize whitespace, require at least 200 characters, write `normalizedPath`, and transition to `normalized` then `review_required`.

Implement one shared interface and thin source-specific adapters:

```ts
export type SourceCollector = {
  name: AdvisorSourceRecord['collector'];
  supports(record: AdvisorSourceRecord): boolean;
  collect(record: AdvisorSourceRecord, deps: CollectorDependencies): Promise<AdvisorSourceRecord>;
};
```

`MicrosoftIRCollector` handles Microsoft investor-relations pages, `MicrosoftSourceCollector` handles other official Microsoft pages, `SecEdgarCollector` uses the SEC endpoint and required user-agent, and `PublicHtmlCollector` refuses any host without `approvedPublicHost=true`.

- [ ] **Step 5: Run and commit**

```bash
npx tsx --test tests/amyHoodAdvisorSourceCollection.test.ts
git add server/decisionAdvisor/sourceRegistry.ts server/decisionAdvisor/collectors server/decisionAdvisor/officialSourceCollector.ts tests/amyHoodAdvisorSourceCollection.test.ts
git commit -m "feat: collect official advisor sources"
```

### Task 4: Add reviewed manual import for transcripts and unsupported formats

**Files:**
- Create: `server/decisionAdvisor/manualSourceImporter.ts`
- Create: `server/decisionAdvisor/transcriptImporter.ts`
- Create: `data/b-track/amy-hood/advisor/manual-import/README.md`
- Modify: `tests/amyHoodAdvisorSourceCollection.test.ts`

**Interfaces:**
- Produces: `importReviewedSource(input, root)` and `importTranscript(input, root)` requiring source metadata, extracted text, speaker segments, reviewer, and review timestamp.

- [ ] **Step 1: Add failing tests**

Test a valid interview transcript import whose Amy Hood speaker segments remain addressable. Use the three edge cases already declared in the Test Plan across the file. Add failure tests for missing reviewer, blank text, uncertain speaker, and a hash mismatch; assert no registry or raw partial write.

- [ ] **Step 2: Implement validation and import**

The input contract must include:

```ts
type ReviewedSourceImport = {
  canonicalUrl: string;
  title: string;
  publisher: string;
  publishedAt: string | null;
  speaker: string | null;
  eventCandidateIds: string[];
  tier: 1 | 2 | 3;
  rightsNote: string;
  text: string;
  speakerSegments?: Array<{ speaker: string; startChar: number; endChar: number }>;
  expectedSha256: string;
  reviewer: string;
  reviewedAt: string;
};
```

Require at least 200 normalized characters and an exact hash match. Store reviewer metadata in the raw artifact. Do not fetch the URL during manual import.

`TranscriptImporter` additionally validates nonoverlapping offsets and requires at least one verified `Amy Hood` segment. Uncertain attribution transitions to `review_required` with `speaker_uncertain` and cannot become approved.

- [ ] **Step 3: Document the operator procedure**

Explain how to save lawful text, calculate SHA-256, fill metadata, run import, and verify registry state. State that LinkedIn may supply discovery URLs but not copied private/login-gated text.

- [ ] **Step 4: Verify and commit**

```bash
npx tsx --test tests/amyHoodAdvisorSourceCollection.test.ts
git add server/decisionAdvisor/manualSourceImporter.ts server/decisionAdvisor/transcriptImporter.ts data/b-track/amy-hood/advisor/manual-import/README.md tests/amyHoodAdvisorSourceCollection.test.ts
git commit -m "feat: add reviewed advisor source imports"
```

### Task 5: Seed 30 event candidates and expose collection CLI commands

**Files:**
- Create: `data/b-track/amy-hood/advisor/event-candidates.json`
- Create: `data/b-track/amy-hood/advisor/source-registry.json`
- Create: `server/runAmyHoodDecisionAdvisor.ts`
- Modify: `package.json`
- Modify: `tests/amyHoodAdvisorSourceCollection.test.ts`

**Interfaces:**
- CLI: `candidates:check`, `sources:check`, `source:collect --id`, and `source:import --file`.

- [ ] **Step 1: Add candidate-matrix validation tests**

Assert exactly 30 unique candidate IDs, all five domains, at least four candidates per domain, valid decision windows, nonempty discovery URLs, and no candidate whose working title is only a later outcome. The registry gate reports progress toward 100–150 discovered URLs and 50–80 collected primary/context documents; it must not mark Phase 2 complete below 100 discovered URLs or 50 valid documents.

- [ ] **Step 2: Create the reviewed discovery matrix**

Research and record 30 candidates spanning M&A, AI/cloud CapEx, pricing/monetization, cost efficiency, and shareholder return/risk. Register 100–150 discovery URLs across those candidates and collect 50–80 valid primary/context documents. For each candidate, include at least one likely direct-Amy source URL and a second independent source-type lead where available. Mark uncertain dates or speaker attribution in `notes`, never as invented certainty.

- [ ] **Step 3: Implement CLI validation and collection commands**

Parse arguments without triggering network calls during import/check commands. Exit nonzero with a concise error on unknown IDs, invalid files, or registry failures.

- [ ] **Step 4: Add scripts**

```json
"advisor:candidates:check": "tsx server/runAmyHoodDecisionAdvisor.ts candidates:check",
"advisor:sources:check": "tsx server/runAmyHoodDecisionAdvisor.ts sources:check",
"advisor:source:collect": "tsx server/runAmyHoodDecisionAdvisor.ts source:collect",
"advisor:source:import": "tsx server/runAmyHoodDecisionAdvisor.ts source:import"
```

- [ ] **Step 5: Verify the phase**

```bash
npm run advisor:candidates:check
npm run advisor:sources:check
npx tsx --test tests/amyHoodAdvisorSourceCollection.test.ts
npm run lint
git diff --check
```

Expected: 30 candidates, 100–150 discoveries, and 50–80 valid documents meet the collection gate; partial registries report exact deficits and fail the completion command; all tests pass.

- [ ] **Step 6: Commit Phase 2**

```bash
git add data/b-track/amy-hood/advisor/event-candidates.json data/b-track/amy-hood/advisor/source-registry.json server/runAmyHoodDecisionAdvisor.ts package.json tests/amyHoodAdvisorSourceCollection.test.ts
git commit -m "feat: seed advisor source collection workflow"
```
