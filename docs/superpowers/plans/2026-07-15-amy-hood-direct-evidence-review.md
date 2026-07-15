# Amy Hood Direct Evidence Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an auditable, idempotent approval path for the collected LinkedIn and Activision Blizzard Amy Hood transaction-call evidence and apply two final direct-evidence decisions.

**Architecture:** Extend candidate fingerprints with explicit reviewed aliases, then add a focused review-manifest module that verifies immutable source artifacts, bounded Amy Hood offsets, exact passages, and event discriminators before updating candidates and the source registry. A CLI checks or applies versioned review manifests; application compensates candidate persistence if registry transition fails and never approves fuzzy or distant context.

**Tech Stack:** TypeScript, Node.js `node:test`, existing atomic JSON/artifact stores, existing source registry state machine, `tsx`, JSON review manifests.

## Global Constraints

- Quotes remain verbatim; never rewrite source text to fit a fingerprint.
- Only canonical fingerprint values or explicit reviewed aliases may satisfy an event discriminator.
- `exactRelevancePassage` is one contiguous normalized passage of 20–1,200 characters.
- Direct approval requires one bounded `Amy Hood` speaker segment containing both the exact quote and relevance passage.
- LinkedIn and Activision are approved independently.
- Reapplying an identical manifest is idempotent; a conflicting review ID fails closed.
- Existing reviewed associations and source artifacts survive every failed apply attempt.
- New tests follow the repository Test Plan format: one happy path, exactly three realistic edge cases, and applicable failure paths.
- This plan does not regenerate the Main Prompt, rebuild RAG, or run persona evaluation.

## File Structure

- Modify `shared/amyHoodDecisionAdvisor.ts`: reviewed fingerprint-alias contract.
- Modify `server/runAmyHoodDecisionAdvisor.ts`: alias validation and review CLI commands.
- Create `server/decisionAdvisor/directEvidenceReview.ts`: manifest validation, artifact verification, and atomic application.
- Modify `server/decisionAdvisor/sourceRegistry.ts`: idempotent `approveReviewedSource` seam.
- Create `tests/amyHoodAdvisorDirectEvidenceReview.test.ts`: approval workflow tests.
- Modify `tests/amyHoodAdvisorSourceCollection.test.ts`: candidate/source gate alias regression tests.
- Create two JSON files under `data/b-track/amy-hood/advisor/reviews/`: final review records.
- Modify `event-candidates.json` and `source-registry.json` only by the apply command.
- Modify `package.json`: check/apply scripts.
- Create `docs/reports/2026-07-15-amy-hood-direct-evidence-review-report.html`.

---

### Task 1: Reviewed Event Fingerprint Aliases

**Files:**
- Modify: `shared/amyHoodDecisionAdvisor.ts`
- Modify: `server/runAmyHoodDecisionAdvisor.ts`
- Test: `tests/amyHoodAdvisorSourceCollection.test.ts`

**Interfaces:**
- Consumes: `EventCandidate.eventFingerprint` and locator `eventDiscriminators`.
- Produces: `EventFingerprintAlias` and alias-aware `validateEventCandidates`.

- [ ] **Step 1: Write failing alias tests**

Add one passing-intent case and failure cases for unreviewed or unrelated aliases:

```ts
test('edge: reviewed source wording can satisfy a locator discriminator', () => {
  const candidate = validCandidateMatrix()[0];
  const sourceUrl = candidate.sourceAssociations[0].canonicalUrl;
  candidate.eventFingerprint.aliases = [{
    kind: 'decision_action',
    canonicalValue: candidate.eventFingerprint.decisionAction,
    value: 'agreed to acquire',
    sourceUrl,
    reviewStatus: 'reviewed',
    reviewerNote: 'The primary-source Amy Hood wording identifies the same acquisition action.',
  }];
  const locator = candidate.sourceAssociations[0].evidenceLocator!;
  locator.eventDiscriminators[1].value = 'agreed to acquire';
  locator.exactRelevancePassage = locator.exactRelevancePassage.replace(
    candidate.eventFingerprint.decisionAction,
    'agreed to acquire',
  );
  assert.doesNotThrow(() => validateEventCandidates([candidate], {
    enforceDiscoveryRange: false,
  }));
});

test('failure: aliases must be reviewed and source-bound', () => {
  const candidate = validCandidateMatrix()[0];
  candidate.eventFingerprint.aliases = [{
    kind: 'decision_action',
    canonicalValue: candidate.eventFingerprint.decisionAction,
    value: 'did something',
    sourceUrl: 'https://example.com/unrelated',
    reviewStatus: 'unreviewed' as 'reviewed',
    reviewerNote: 'This deliberately violates the reviewed source-bound contract.',
  }];
  assert.throws(
    () => validateEventCandidates([candidate], { enforceDiscoveryRange: false }),
    /invalid event fingerprint alias/i,
  );
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npx tsx --test --test-name-pattern "source wording|aliases must" tests/amyHoodAdvisorSourceCollection.test.ts
```

Expected: FAIL because `aliases` does not exist and alias values are rejected.

- [ ] **Step 3: Add alias types**

Add to `shared/amyHoodDecisionAdvisor.ts`:

```ts
export type EventDiscriminatorKind =
  | 'named_entity'
  | 'decision_action'
  | 'event_specific';

export type EventFingerprintAlias = {
  kind: EventDiscriminatorKind;
  canonicalValue: string;
  value: string;
  sourceUrl: string;
  reviewStatus: 'reviewed';
  reviewerNote: string;
};
```

Add `aliases?: EventFingerprintAlias[]` to the fingerprint and reuse `EventDiscriminatorKind` in locator discriminators.

- [ ] **Step 4: Implement strict alias validation**

In `server/runAmyHoodDecisionAdvisor.ts`, validate canonical binding, source association, minimum value/note lengths, and reviewed status:

```ts
const canonicalFingerprintValue = (
  candidate: EventCandidate,
  kind: EventDiscriminatorKind,
) => ({
  named_entity: candidate.eventFingerprint.primaryEntity,
  decision_action: candidate.eventFingerprint.decisionAction,
  event_specific: candidate.eventFingerprint.eventSpecificIdentifier,
})[kind];

const allowedFingerprintKeys = (candidate: EventCandidate) => {
  const associationUrls = new Set(candidate.sourceAssociations.map(({ canonicalUrl }) =>
    canonicalizeSourceUrl(canonicalUrl)));
  const aliases = candidate.eventFingerprint.aliases ?? [];
  for (const alias of aliases) {
    if (alias.reviewStatus !== 'reviewed'
      || alias.canonicalValue !== canonicalFingerprintValue(candidate, alias.kind)
      || alias.value.trim().length < 4
      || normalizedSearchText(alias.value) === normalizedSearchText(alias.canonicalValue)
      || !associationUrls.has(canonicalizeSourceUrl(alias.sourceUrl))
      || alias.reviewerNote.trim().length < 20) {
      throw new Error(`candidate ${candidate.id} has an invalid event fingerprint alias`);
    }
  }
  return new Set([
    ...fingerprintDiscriminators(candidate).map(discriminatorKey),
    ...aliases.map(({ kind, value }) => discriminatorKey({ kind, value })),
  ]);
};
```

Use this set for locator validation and continue requiring every selected value to occur literally in the relevance passage.

- [ ] **Step 5: Verify GREEN and commit**

```bash
npx tsx --test --test-name-pattern "source wording|aliases must|association discriminators" tests/amyHoodAdvisorSourceCollection.test.ts
git add shared/amyHoodDecisionAdvisor.ts server/runAmyHoodDecisionAdvisor.ts tests/amyHoodAdvisorSourceCollection.test.ts
git commit -m "feat: support reviewed event fingerprint aliases"
```

Expected: selected tests PASS and the commit succeeds.

---

### Task 2: Manifest Contract and Artifact Verification

**Files:**
- Create: `server/decisionAdvisor/directEvidenceReview.ts`
- Create: `tests/amyHoodAdvisorDirectEvidenceReview.test.ts`

**Interfaces:**
- Consumes: `loadRegistry`, `readAdvisorArtifactSecure`, and `normalizeDocument`.
- Produces: `DirectEvidenceReviewManifest`, `validateDirectEvidenceReviewManifest`, `loadDirectEvidenceReviewManifest`, and `verifyDirectEvidenceReview`.

- [ ] **Step 1: Create the test file and failing verification cases**

Start the test file with the repository-required plan:

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - an exact bounded Amy Hood passage verifies against immutable artifacts.
 * 2. Edge Cases:
 *    - canonical wording verifies without aliases.
 *    - one review-required source does not block an independent valid review.
 *    - an identical manifest verifies repeatedly without changing artifacts.
 * 3. Failure Path:
 *    - hash mismatch, another-speaker offsets, distant event context, unreviewed
 *      aliases, overlapping offsets, and malformed manifests fail before writes.
 */
```

Build a temporary real-format raw artifact, normalized artifact, registry, and candidate. Assert exact slices:

```ts
const verified = await verifyDirectEvidenceReview(root, manifest);
assert.equal(verified.segment.speaker, 'Amy Hood');
assert.equal(verified.normalized.slice(manifest.quoteStart, manifest.quoteEnd), manifest.exactQuote);
assert.equal(
  verified.normalized.slice(manifest.passageStart, manifest.passageEnd),
  manifest.exactRelevancePassage,
);
```

- [ ] **Step 2: Verify RED**

```bash
npx tsx --test tests/amyHoodAdvisorDirectEvidenceReview.test.ts
```

Expected: FAIL with module-not-found for `directEvidenceReview`.

- [ ] **Step 3: Define and validate the manifest**

Create these exports:

```ts
export type DirectEvidenceReviewDecision =
  | 'approved_direct'
  | 'approved_context'
  | 'review_required'
  | 'rejected';

export type DirectEvidenceReviewManifest = {
  reviewId: string;
  reviewer: string;
  reviewedAt: string;
  decision: DirectEvidenceReviewDecision;
  sourceId: string;
  canonicalUrl: string;
  rawPath: string;
  normalizedPath: string;
  sha256: string;
  candidateId: string;
  temporalRelation: 'pre_decision' | 'decision_time' | 'post_outcome';
  speaker: 'Amy Hood';
  speakerSegmentStart: number;
  speakerSegmentEnd: number;
  quoteStart: number;
  quoteEnd: number;
  passageStart: number;
  passageEnd: number;
  exactQuote: string;
  exactRelevancePassage: string;
  anchorTerms: string[];
  eventDiscriminators: Array<{ kind: EventDiscriminatorKind; value: string }>;
  aliases: EventFingerprintAlias[];
  financialSignals: string[];
  reviewerRationale: string;
};
```

Require canonical HTTPS URL, ISO instant, SHA-256, ordered offsets, three unique discriminator kinds, two anchor terms, nonblank signals, passage length 20–1,200, and rationale length at least 40.

- [ ] **Step 4: Verify immutable artifacts and speaker bounds**

Implement the core checks:

```ts
const source = loadRegistry(root).sources.find(({ id }) => id === manifest.sourceId);
if (!source) throw new Error(`unknown reviewed source: ${manifest.sourceId}`);
if (source.canonicalUrl !== manifest.canonicalUrl
  || source.rawPath !== manifest.rawPath
  || source.normalizedPath !== manifest.normalizedPath
  || source.sha256 !== manifest.sha256
  || !source.eventCandidateIds.includes(manifest.candidateId)) {
  throw new Error(`review manifest does not match registry source: ${manifest.reviewId}`);
}
const raw = JSON.parse((await readAdvisorArtifactSecure(root, manifest.rawPath)).toString('utf8'))
  as AdvisorRawSource;
const body = Buffer.from(raw.bodyBase64, 'base64');
if (createHash('sha256').update(body).digest('hex') !== manifest.sha256) {
  throw new Error(`review source body hash mismatch: ${manifest.reviewId}`);
}
const normalized = normalizeDocument(body.toString('utf8'), raw.mediaType);
const saved = (await readAdvisorArtifactSecure(root, manifest.normalizedPath)).toString('utf8');
if (saved !== normalized) throw new Error(`review normalized artifact mismatch: ${manifest.reviewId}`);
```

Require exactly one matching raw Amy segment; quote and passage offsets must lie inside it; both slices must equal the manifest; all discriminator values must occur in the passage.

- [ ] **Step 5: Verify GREEN and commit**

```bash
npx tsx --test tests/amyHoodAdvisorDirectEvidenceReview.test.ts
git add server/decisionAdvisor/directEvidenceReview.ts tests/amyHoodAdvisorDirectEvidenceReview.test.ts
git commit -m "feat: verify direct evidence review manifests"
```

Expected: manifest tests PASS.

---

### Task 3: Idempotent and Compensated Approval

**Files:**
- Modify: `server/decisionAdvisor/directEvidenceReview.ts`
- Modify: `server/decisionAdvisor/sourceRegistry.ts`
- Modify: `tests/amyHoodAdvisorDirectEvidenceReview.test.ts`

**Interfaces:**
- Consumes: `verifyDirectEvidenceReview` and an injected candidate validator.
- Produces: `approveReviewedSource(root, sourceId)` and `applyDirectEvidenceReview(root, manifest, dependencies?)`.

- [ ] **Step 1: Add failing approval tests**

Test approval, independent decisions, idempotency, and compensation:

```ts
const result = await applyDirectEvidenceReview(root, manifest, {
  validateCandidates: (candidates) => validateEventCandidates(candidates, {
    enforceDiscoveryRange: false,
  }),
});
assert.equal(result.changed, true);
const candidate = (await loadCandidates(root)).find(({ id }) => id === manifest.candidateId)!;
const association = candidate.sourceAssociations.find(
  ({ canonicalUrl }) => canonicalUrl === manifest.canonicalUrl,
)!;
assert.equal(association.reviewStatus, 'reviewed');
assert.equal(association.evidenceLocator?.exactQuote, manifest.exactQuote);
assert.equal(candidate.directEvidenceGap, undefined);
assert.equal(loadSourceRecord(root, manifest.sourceId).collectionStatus, 'approved');
assert.equal((await applyDirectEvidenceReview(root, manifest)).changed, false);
```

Inject an `approveSource` rejection and assert byte-for-byte candidate restoration and no registry approval.

- [ ] **Step 2: Verify RED**

```bash
npx tsx --test --test-name-pattern "approval|independent|idempotent|compensat" tests/amyHoodAdvisorDirectEvidenceReview.test.ts
```

Expected: FAIL because application is absent.

- [ ] **Step 3: Implement the application result and dependency seam**

```ts
export type DirectEvidenceReviewApplyResult = {
  reviewId: string;
  decision: DirectEvidenceReviewDecision;
  changed: boolean;
  candidateId: string;
  sourceId: string;
};

export type DirectEvidenceReviewDependencies = {
  validateCandidates(candidates: EventCandidate[]): void;
  persistCandidates(candidates: EventCandidate[], candidatePath: string): Promise<void>;
  approveSource(root: string, sourceId: string): Promise<AdvisorSourceRecord>;
};
```

Add the registry seam with an explicit idempotency result:

```ts
export const approveReviewedSource = async (
  root: string,
  sourceId: string,
): Promise<{ source: AdvisorSourceRecord; changed: boolean }> => {
  const current = loadSourceRecord(root, sourceId);
  if (current.collectionStatus === 'approved') return { source: current, changed: false };
  return {
    source: await transitionSource(root, sourceId, 'approved', { failureReason: null }),
    changed: true,
  };
};
```

For `approved_direct`, add unique aliases, replace the matching association with a reviewed `direct_amy` locator, set `reviewerNote` to `review:<reviewId> <reviewerRationale>`, and delete `directEvidenceGap`. For `approved_context`, retain the gap. `review_required` and `rejected` never approve a source or remove the gap.

- [ ] **Step 4: Add idempotency and compensation**

Detect an exact applied association, aliases, missing gap, and approved source before writing. If the association reviewer note starts with another `review:` ID, fail with `conflicting direct evidence review`. Otherwise write candidates first and compensate on registry failure:

```ts
const originalCandidateBytes = await readFile(candidatePath, 'utf8');
await dependencies.persistCandidates(candidates, candidatePath);
try {
  await dependencies.approveSource(root, manifest.sourceId);
} catch (error) {
  try {
    await writeJsonAtomic(candidatePath, JSON.parse(originalCandidateBytes));
  } catch (rollbackError) {
    throw new AggregateError(
      [error, rollbackError],
      'direct evidence approval failed and candidate compensation was incomplete',
    );
  }
  throw error;
}
```

- [ ] **Step 5: Verify GREEN and commit**

```bash
npx tsx --test tests/amyHoodAdvisorDirectEvidenceReview.test.ts
git add server/decisionAdvisor/directEvidenceReview.ts server/decisionAdvisor/sourceRegistry.ts tests/amyHoodAdvisorDirectEvidenceReview.test.ts
git commit -m "feat: apply direct evidence approvals atomically"
```

Expected: all review tests PASS.

---

### Task 4: CLI and Final Review Manifests

**Files:**
- Modify: `server/runAmyHoodDecisionAdvisor.ts`
- Modify: `package.json`
- Create: `data/b-track/amy-hood/advisor/reviews/2026-07-15-linkedin-direct-evidence.json`
- Create: `data/b-track/amy-hood/advisor/reviews/2026-07-15-activision-direct-evidence.json`
- Modify by command: `data/b-track/amy-hood/advisor/event-candidates.json`
- Modify by command: `data/b-track/amy-hood/advisor/source-registry.json`
- Test: `tests/amyHoodAdvisorDirectEvidenceReview.test.ts`

**Interfaces:**
- Consumes: review load, verify, and apply functions.
- Produces: `evidence:check --file` and `evidence:apply --file`.

- [ ] **Step 1: Add failing CLI tests**

```ts
assert.match(runAdvisorCli(root, 'evidence:check', '--file', manifestPath).stdout, /review valid/i);
assert.match(runAdvisorCli(root, 'evidence:apply', '--file', manifestPath).stdout, /applied/i);
assert.match(runAdvisorCli(root, 'evidence:apply', '--file', manifestPath).stdout, /unchanged/i);
assert.match(runAdvisorCli(root, 'evidence:check').stderr, /requires --file/i);
```

Run the focused test and expect RED:

```bash
npx tsx --test --test-name-pattern "evidence:check|evidence:apply" tests/amyHoodAdvisorDirectEvidenceReview.test.ts
```

- [ ] **Step 2: Wire commands and scripts**

Add:

```json
"advisor:evidence:check": "tsx server/runAmyHoodDecisionAdvisor.ts evidence:check",
"advisor:evidence:apply": "tsx server/runAmyHoodDecisionAdvisor.ts evidence:apply"
```

Resolve `--file`, verify/apply, and print review ID, candidate ID, decision, and `applied`/`unchanged` without printing source text.

- [ ] **Step 3: Create the LinkedIn manifest from committed text**

Use:

```json
{
  "reviewId": "review-linkedin-direct-2026-07-15-v1",
  "reviewer": "Codex evidence review",
  "reviewedAt": "2026-07-15T12:00:00.000Z",
  "decision": "approved_direct",
  "sourceId": "source-f14d371fe2c97c5f-4ff774501d12",
  "candidateId": "candidate-linkedin-acquisition-2016",
  "speakerSegmentStart": 20122,
  "speakerSegmentEnd": 23466,
  "passageStart": 20473,
  "passageEnd": 21625,
  "quoteStart": 21193,
  "quoteEnd": 21625,
  "eventDiscriminators": [
    { "kind": "named_entity", "value": "LinkedIn" },
    { "kind": "decision_action", "value": "agreed to acquire" },
    { "kind": "event_specific", "value": "$26 billion" }
  ],
  "financialSignals": [
    "opportunistic debt financing",
    "top-line growth across LinkedIn, Office 365, and Dynamics",
    "at least $150 million annual cost synergies"
  ]
}
```

Copy `exactRelevancePassage` from normalized `[20473,21625)` and `exactQuote` from `[21193,21625)`. Add reviewed aliases `will acquire -> agreed to acquire` and `$26.2 billion -> $26 billion`, bound to the transcript URL. Use anchors `LinkedIn`, `$26 billion`, `new debt`, `$150 million`.

- [ ] **Step 4: Create the Activision manifest from committed text**

Use:

```json
{
  "reviewId": "review-activision-direct-2026-07-15-v1",
  "reviewer": "Codex evidence review",
  "reviewedAt": "2026-07-15T12:05:00.000Z",
  "decision": "approved_direct",
  "sourceId": "source-3d87da3c9879cf67",
  "candidateId": "candidate-activision-acquisition-2022",
  "speakerSegmentStart": 19618,
  "speakerSegmentEnd": 22270,
  "passageStart": 20294,
  "passageEnd": 21399,
  "quoteStart": 20294,
  "quoteEnd": 20712,
  "eventDiscriminators": [
    { "kind": "named_entity", "value": "Activision Blizzard" },
    { "kind": "decision_action", "value": "agreed to acquire" },
    { "kind": "event_specific", "value": "$68.7 billion" }
  ],
  "financialSignals": [
    "accelerated portfolio revenue growth",
    "engagement and monetization across Xbox",
    "Game Pass subscriber growth",
    "EPS accretion upon close"
  ]
}
```

Copy passage `[20294,21399)` and quote `[20294,20712)`. Add reviewed alias `will acquire -> agreed to acquire`, bound to the SEC transcript URL. Use anchors `Activision Blizzard`, `$68.7 billion`, `revenue growth`, `accretive to EPS`.

- [ ] **Step 5: Check, apply, and prove idempotency**

```bash
npm run advisor:evidence:check -- --file data/b-track/amy-hood/advisor/reviews/2026-07-15-linkedin-direct-evidence.json
npm run advisor:evidence:check -- --file data/b-track/amy-hood/advisor/reviews/2026-07-15-activision-direct-evidence.json
npm run advisor:evidence:apply -- --file data/b-track/amy-hood/advisor/reviews/2026-07-15-linkedin-direct-evidence.json
npm run advisor:evidence:apply -- --file data/b-track/amy-hood/advisor/reviews/2026-07-15-activision-direct-evidence.json
npm run advisor:evidence:apply -- --file data/b-track/amy-hood/advisor/reviews/2026-07-15-linkedin-direct-evidence.json
npm run advisor:evidence:apply -- --file data/b-track/amy-hood/advisor/reviews/2026-07-15-activision-direct-evidence.json
```

Expected: checks valid; first applies `applied`; second applies `unchanged`.

- [ ] **Step 6: Commit Task 4**

```bash
git add package.json server/runAmyHoodDecisionAdvisor.ts tests/amyHoodAdvisorDirectEvidenceReview.test.ts data/b-track/amy-hood/advisor/reviews data/b-track/amy-hood/advisor/event-candidates.json data/b-track/amy-hood/advisor/source-registry.json
git commit -m "data: approve LinkedIn and Activision Amy evidence"
```

---

### Task 5: Gate Reassessment, Report, and Verification

**Files:**
- Create: `docs/reports/2026-07-15-amy-hood-direct-evidence-review-report.html`

**Interfaces:**
- Consumes: final manifests, candidates, registry, and gate output.
- Produces: standalone developer report and verified branch state.

- [ ] **Step 1: Re-run unchanged gates**

```bash
npm run advisor:candidates:check
npm run advisor:sources:check
```

Expected: LinkedIn and Activision direct-evidence deficits disappear. Overall Phase 2 can remain blocked by the 100 reviewed URL, 50 valid document, remaining event, and second-source-type requirements.

- [ ] **Step 2: Write the HTML report**

Include source IDs/hashes, speaker/passage bounds, exact quotes, alias mappings, financial signals, Before vs After direct coverage, exact gate output, and a statement that approval is not Main Prompt/RAG/persona completion.

- [ ] **Step 3: Run full regression verification**

```bash
npx tsx --test tests/amyHoodAdvisorDirectEvidenceReview.test.ts tests/amyHoodAdvisorSourceCollection.test.ts tests/amyHoodAdvisorPdfUrlInventory.test.ts
npm run advisor:evaluation-v3:test
npm run evaluation:test
npm run persona:test
npm run lint
npm run build
git diff --check
```

Expected: all checks PASS; the existing Vite chunk-size warning is non-failing.

- [ ] **Step 4: Verify final data directly**

```bash
jq '[.[] | select(.id=="candidate-linkedin-acquisition-2016" or .id=="candidate-activision-acquisition-2022") | {id,directEvidenceGap,direct:[.sourceAssociations[]|select(.role=="direct_amy")|{canonicalUrl,reviewStatus,evidenceLocator}]}]' data/b-track/amy-hood/advisor/event-candidates.json
jq '[.sources[] | select(.id=="source-f14d371fe2c97c5f-4ff774501d12" or .id=="source-3d87da3c9879cf67") | {id,collectionStatus,sha256}]' data/b-track/amy-hood/advisor/source-registry.json
```

Expected: no direct gaps, reviewed non-null locators, approved sources, unchanged hashes.

- [ ] **Step 5: Commit report and confirm clean state**

```bash
git add docs/reports/2026-07-15-amy-hood-direct-evidence-review-report.html
git commit -m "docs: report direct Amy evidence approvals"
git status --short
git log -5 --oneline
```

Expected: empty status and task commits at branch HEAD. Report the two direct approvals and remaining Phase 2 deficits without claiming persona generation.
