# Amy Hood M&A Supporting Evidence Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Complete auditable supporting-evidence decisions for Nokia, Mojang, GitHub, and Nuance without allowing mirrors, translations, or post-outcome material to inflate the decision-time evidence gate.

**Architecture:** Add an explicit document-family identity to event associations, then build a supporting-evidence review path parallel to the existing direct-Amy review path. Existing immutable artifacts are reviewed first; only four exact registered gaps are then targeted for collection. The source gate exposes per-candidate coverage so the final report uses the same acceptance logic as the production gate.

**Tech Stack:** TypeScript 5.8, Node.js node:test, tsx, existing atomic JSON and immutable artifact stores, JSON review manifests, standalone HTML.

## Global Constraints

- The batch covers only candidate-nokia-acquisition-2013, candidate-mojang-acquisition-2014, candidate-github-acquisition-2018, and candidate-nuance-acquisition-2021.
- Only pre_decision and decision_time evidence can satisfy core source coverage.
- post_outcome evidence remains available for reflection but cannot satisfy the core source gate.
- Mirrors and language variants of one underlying announcement share one documentFamilyId and count once.
- Supporting review never creates direct_amy evidence or removes directEvidenceGap; the existing direct-evidence review module remains authoritative.
- No URL list, PDF summary, search snippet, or inaccessible page becomes evidence.
- Approved evidence must match immutable raw and normalized artifacts, exact offsets, candidate association, event fingerprint, and temporal role.
- One event failure cannot roll back another event completed decision.
- New test files begin with one happy path, exactly three realistic edge cases, and applicable safe failure paths.
- This plan does not extract policy, regenerate the Main Prompt, rebuild RAG, or evaluate the advisor.

## File Structure

- Modify shared/amyHoodDecisionAdvisor.ts: optional reviewed documentFamilyId on source associations.
- Modify server/runAmyHoodDecisionAdvisor.ts: document-family-aware coverage, non-throwing inspection, and supporting-review CLI commands.
- Create server/decisionAdvisor/supportingEvidenceReview.ts: manifest validation, artifact verification, and idempotent application.
- Modify server/decisionAdvisor/sourceRegistry.ts: reuse reviewed-source approval without changing direct-evidence semantics.
- Create tests/amyHoodAdvisorSupportingEvidenceReview.test.ts: supporting-review TDD suite.
- Modify tests/amyHoodAdvisorSourceCollection.test.ts: duplicate-family and temporal-coverage regressions.
- Modify package.json: supporting evidence check, apply, and batch scripts.
- Create review manifests under data/b-track/amy-hood/advisor/reviews/.
- Modify event-candidates.json and source-registry.json only through tested apply paths.
- Create imports only for successfully recovered full source text.
- Create docs/reports/2026-07-15-amy-hood-ma-supporting-evidence-report.html.

---

### Task 1: Prevent Duplicate Document Families From Passing the Gate

**Files:**
- Modify: shared/amyHoodDecisionAdvisor.ts
- Modify: server/runAmyHoodDecisionAdvisor.ts
- Test: tests/amyHoodAdvisorSourceCollection.test.ts

**Interfaces:**
- Consumes: EventSourceAssociation.sourceType and reviewed artifact matches.
- Produces: EventSourceAssociation.documentFamilyId?: string, CandidateEvidenceCoverage, and inspectSourceInventory.

- [ ] **Step 1: Add the required Test Plan cases before test code**

Extend the existing test-plan comment:

~~~text
Test Plan (M&A supporting evidence family coverage):
1. Happy Path:
   - two reviewed decision-time artifacts from two document families satisfy source coverage.
2. Edge Cases:
   - a press release and its SEC mirror share one family and count once.
   - translated variants of one announcement share one family and count once.
   - a post-outcome artifact is retained but excluded from core family coverage.
3. Failure Path:
   - invalid family identifiers and a one-family candidate fail with explicit deficits.
~~~

- [ ] **Step 2: Write failing family-aware tests**

Use the existing real-artifact fixture pattern:

~~~ts
test('edge: an SEC mirror cannot create a second document family', async () => {
  const item = await sourceGateFixture();
  item.candidate.sourceAssociations[0].documentFamilyId =
    'microsoft-nuance-announcement-2021';
  item.candidate.sourceAssociations[1].documentFamilyId =
    'microsoft-nuance-announcement-2021';
  await item.persist();

  await assert.rejects(
    () => checkSourceInventory(item.root, item.candidates),
    /lacks a reviewed collected second document family/i,
  );
});

test('happy: two document families satisfy event coverage', async () => {
  const item = await sourceGateFixture();
  item.candidate.sourceAssociations[0].documentFamilyId =
    'microsoft-nuance-announcement-2021';
  item.candidate.sourceAssociations[1].documentFamilyId =
    'nuance-transaction-call-2021';
  await item.persist();

  const result = await inspectSourceInventory(item.root, item.candidates);
  assert.equal(
    result.candidateCoverage[item.candidate.id].coreDocumentFamilyCount,
    2,
  );
});

test('edge: post-outcome evidence is excluded from core families', async () => {
  const item = await sourceGateFixture({ secondTemporalRole: 'post_outcome' });
  await item.persist();
  const result = await inspectSourceInventory(item.root, item.candidates);
  assert.equal(
    result.candidateCoverage[item.candidate.id].coreDocumentFamilyCount,
    1,
  );
  assert.equal(
    result.candidateCoverage[item.candidate.id].postOutcomeDocumentCount,
    1,
  );
});
~~~

Add validation failures for "Nuance announcement", an empty string, and a 65-character value. The accepted format is /^[a-z0-9][a-z0-9-]{2,63}$/.

- [ ] **Step 3: Verify RED**

~~~bash
npx tsx --test --test-name-pattern "document famil|post-outcome evidence" tests/amyHoodAdvisorSourceCollection.test.ts
~~~

Expected: FAIL because documentFamilyId and inspectSourceInventory do not exist and the old gate counts source types.

- [ ] **Step 4: Add the association field and validation**

Add to EventSourceAssociation:

~~~ts
documentFamilyId?: string;
~~~

Add validation in validateEventCandidates:

~~~ts
if (association.documentFamilyId !== undefined
  && !/^[a-z0-9][a-z0-9-]{2,63}$/.test(association.documentFamilyId)) {
  throw new Error(
    'candidate ' + candidate.id + ' has an invalid document family ID',
  );
}
~~~

Keep it optional for existing reviewed data. Every new supporting approval must set it.

- [ ] **Step 5: Count document families instead of superficial types**

Retain the matched association:

~~~ts
type CandidateEvidenceMatch = {
  source: AdvisorSourceRecord;
  association: EventSourceAssociation;
};

const documentFamilyKey = (match: CandidateEvidenceMatch) =>
  match.association.documentFamilyId
    ?? 'source-type:' + match.source.sourceType;

export type CandidateEvidenceCoverage = {
  coreDocumentFamilyCount: number;
  coreSourceIds: string[];
  directAmySourceIds: string[];
  postOutcomeDocumentCount: number;
  deficits: string[];
};
~~~

Rename the deficit from "second source type" to "second document family". Preserve prior behavior for associations without documentFamilyId by falling back to sourceType.

- [ ] **Step 6: Verify GREEN and commit**

~~~bash
npx tsx --test --test-name-pattern "document famil|post-outcome evidence|source collection incomplete" tests/amyHoodAdvisorSourceCollection.test.ts
git add shared/amyHoodDecisionAdvisor.ts server/runAmyHoodDecisionAdvisor.ts tests/amyHoodAdvisorSourceCollection.test.ts
git commit -m "fix: deduplicate supporting evidence families"
~~~

Expected: focused tests PASS; identical underlying documents count once.

---

### Task 2: Verify and Apply Supporting-Evidence Manifests

**Files:**
- Create: server/decisionAdvisor/supportingEvidenceReview.ts
- Create: tests/amyHoodAdvisorSupportingEvidenceReview.test.ts
- Modify: server/decisionAdvisor/sourceRegistry.ts

**Interfaces:**
- Consumes: readAdvisorArtifactSecure, normalizeDocument, loadRegistry, candidate JSON, and approveReviewedSource.
- Produces: SupportingEvidenceReviewManifest, loadSupportingEvidenceReviewManifest, verifySupportingEvidenceReview, and applySupportingEvidenceReview.

- [ ] **Step 1: Create the test file with the repository Test Plan**

~~~ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - a decision-time supporting passage verifies and applies to one event.
 * 2. Edge Cases:
 *    - a same-family mirror applies but does not create new family coverage.
 *    - a post-outcome review persists with role post_outcome.
 *    - reapplying an identical manifest is idempotent.
 * 3. Failure Path:
 *    - hash mismatch, wrong candidate, invalid offsets, temporal mismatch,
 *      direct-Amy role, and conflicting application fail without partial writes.
 */
~~~

Build a temporary raw artifact, normalized artifact, registry, candidate matrix, and manifest.

- [ ] **Step 2: Write the failing public-interface tests**

~~~ts
const verified = await verifySupportingEvidenceReview(root, manifest);
assert.equal(
  verified.normalized.slice(manifest.passageStart, manifest.passageEnd),
  manifest.exactRelevancePassage,
);

const applied = await applySupportingEvidenceReview(root, manifest, {
  validateCandidates: (candidates) => validateEventCandidates(candidates, {
    enforceDiscoveryRange: false,
  }),
});
assert.equal(applied.changed, true);
assert.equal(applied.candidateId, manifest.candidateId);
~~~

Use table-driven failures for wrong SHA, mismatched URL, role direct_amy, decision_time outside the candidate window, and a passage missing one discriminator.

- [ ] **Step 3: Verify RED**

~~~bash
npx tsx --test tests/amyHoodAdvisorSupportingEvidenceReview.test.ts
~~~

Expected: FAIL with module-not-found for supportingEvidenceReview.

- [ ] **Step 4: Define the manifest contract**

~~~ts
export type SupportingEvidenceReviewDecision =
  | 'approved_context'
  | 'approved_counterevidence'
  | 'approved_post_outcome'
  | 'review_required'
  | 'rejected';

export type SupportingEvidenceReviewManifest = {
  reviewId: string;
  reviewer: string;
  reviewedAt: string;
  decision: SupportingEvidenceReviewDecision;
  reasonCode:
    | 'verified_event_context'
    | 'verified_counterevidence'
    | 'verified_post_outcome'
    | 'duplicate_document_family'
    | 'insufficient_decision_context'
    | 'post_outcome_only'
    | 'source_unavailable';
  sourceId: string;
  canonicalUrl: string;
  rawPath: string | null;
  normalizedPath: string | null;
  sha256: string | null;
  candidateId: string;
  sourceType: string;
  documentFamilyId: string;
  sameDocumentCanonicalUrls: string[];
  temporalRelation: 'pre_decision' | 'decision_time' | 'post_outcome';
  role: 'contemporaneous_context' | 'counterevidence' | 'post_outcome';
  quoteStart: number;
  quoteEnd: number;
  passageStart: number;
  passageEnd: number;
  exactQuote: string;
  exactRelevancePassage: string;
  anchorTerms: string[];
  eventDiscriminators: Array<{
    kind: EventDiscriminatorKind;
    value: string;
  }>;
  aliases: EventFingerprintAlias[];
  reviewerRationale: string;
};
~~~

Approved decisions require non-null artifact identity, exact evidence, and three
event discriminators. review_required with source_unavailable requires all three
artifact fields to be null and zero offsets. rejected requires artifact identity
when a collected artifact exists, but may use empty exact evidence with
insufficient_decision_context. Reviewed aliases follow the same canonical-value,
source-URL, reviewer-note, and literal-passage rules as direct evidence review.
sameDocumentCanonicalUrls must contain the manifest URL and may name only
associations on the same candidate. Non-approved decisions never approve a
registry source.

- [ ] **Step 5: Verify immutable artifacts and association identity**

Implement the same secure checks used by direct review:

~~~ts
const source = loadSourceRecord(root, manifest.sourceId);
if (manifest.rawPath === null
  || manifest.normalizedPath === null
  || manifest.sha256 === null) {
  throw new Error(
    'approved supporting review requires immutable artifacts: '
    + manifest.reviewId,
  );
}
if (source.canonicalUrl !== manifest.canonicalUrl
  || source.rawPath !== manifest.rawPath
  || source.normalizedPath !== manifest.normalizedPath
  || source.sha256 !== manifest.sha256
  || source.sourceType !== manifest.sourceType
  || source.temporalRole !== manifest.temporalRelation
  || !source.eventCandidateIds.includes(manifest.candidateId)) {
  throw new Error(
    'supporting review does not match registry source: ' + manifest.reviewId,
  );
}

const body = Buffer.from(raw.bodyBase64, 'base64');
if (createHash('sha256').update(body).digest('hex') !== manifest.sha256) {
  throw new Error(
    'supporting review source body hash mismatch: ' + manifest.reviewId,
  );
}
if (savedNormalized !== normalizeDocument(body.toString('utf8'), raw.mediaType)) {
  throw new Error(
    'supporting review normalized artifact mismatch: ' + manifest.reviewId,
  );
}
~~~

Require exact slices, reviewed fingerprint values or aliases from the manifest,
candidate-specific anchors, correct role/decision pairing, and valid temporal
relation. Merge only verified aliases into candidate.eventFingerprint.aliases.
Manifest validation must reject direct_amy.

- [ ] **Step 6: Apply safely without changing direct evidence**

For approved decisions:

~~~ts
association.reviewStatus = 'reviewed';
association.role = {
  approved_context: 'contemporaneous_context',
  approved_counterevidence: 'counterevidence',
  approved_post_outcome: 'post_outcome',
}[manifest.decision];
association.documentFamilyId = manifest.documentFamilyId;
association.evidenceLocator = {
  exactQuote: manifest.exactQuote,
  exactRelevancePassage: manifest.exactRelevancePassage,
  anchorTerms: manifest.anchorTerms,
  eventDiscriminators: manifest.eventDiscriminators,
  speaker: null,
};
association.reviewerNote = manifest.reviewerRationale;

for (const canonicalUrl of manifest.sameDocumentCanonicalUrls) {
  const sameDocument = candidate.sourceAssociations.find(
    (item) => canonicalizeSourceUrl(item.canonicalUrl) === canonicalUrl,
  );
  if (!sameDocument) {
    throw new Error('same-document URL is not associated with the candidate');
  }
  sameDocument.documentFamilyId = manifest.documentFamilyId;
}
~~~

For rejected, set only reviewStatus and reviewerNote. For review_required, make no transition. Never modify directEvidenceGap or phase3Status. Copy the compensated candidate/registry persistence pattern from directEvidenceReview.ts and preserve idempotency.

- [ ] **Step 7: Verify GREEN and commit**

~~~bash
npx tsx --test tests/amyHoodAdvisorSupportingEvidenceReview.test.ts
git add server/decisionAdvisor/supportingEvidenceReview.ts server/decisionAdvisor/sourceRegistry.ts tests/amyHoodAdvisorSupportingEvidenceReview.test.ts
git commit -m "feat: review M&A supporting evidence"
~~~

Expected: all supporting-review tests PASS.

---

### Task 3: Add CLI Commands and Shared Batch Coverage

**Files:**
- Modify: server/runAmyHoodDecisionAdvisor.ts
- Modify: tests/amyHoodAdvisorSupportingEvidenceReview.test.ts
- Modify: package.json

**Interfaces:**
- Consumes: Task 1 coverage and Task 2 review functions.
- Produces: inspectSourceInventory, support:check, support:apply, and support:batch.

- [ ] **Step 1: Add failing CLI and batch tests**

~~~ts
test('happy: support CLI checks and applies one valid manifest', async () => {
  const item = await supportingFixture({ fullCandidateMatrix: true });
  const manifestPath = await item.writeManifest();
  assert.equal(
    runAdvisorCli(item.root, 'support:check', '--file', manifestPath).status,
    0,
  );
  assert.equal(
    runAdvisorCli(item.root, 'support:apply', '--file', manifestPath).status,
    0,
  );
});

test('edge: batch outcomes remain independent', async () => {
  const item = await fourEventBatchFixture();
  const result = await inspectSourceInventory(item.root, item.candidates);
  assert.deepEqual(
    Object.values(result.candidateCoverage).map((item) => item.outcome),
    ['blocked', 'partial', 'passed', 'partial'],
  );
});
~~~

Add failures for missing --file, malformed JSON, and unknown command.

- [ ] **Step 2: Verify RED**

~~~bash
npx tsx --test --test-name-pattern "support CLI|batch outcomes|missing --file" tests/amyHoodAdvisorSupportingEvidenceReview.test.ts
~~~

Expected: FAIL because the commands and outcomes do not exist.

- [ ] **Step 3: Split inspection from strict threshold enforcement**

~~~ts
export type SourceInspection = SourceCheck & {
  candidateCoverage: Record<string, CandidateEvidenceCoverage & {
    outcome: 'passed' | 'partial' | 'blocked';
  }>;
  deficits: string[];
};

export const checkSourceInventory = async (
  root: string,
  candidates: EventCandidate[],
) => {
  const inspection = await inspectSourceInventory(root, candidates);
  if (inspection.deficits.length > 0) {
    throw new Error(
      'Source collection incomplete: '
      + inspection.discoveredUrlCount
      + ' discovered URLs, '
      + inspection.validDocumentCount
      + ' valid documents; '
      + inspection.deficits.join('; ')
      + '.',
    );
  }
  return inspection;
};
~~~

Move existing artifact verification into inspectSourceInventory unchanged. passed requires two core document families and verified direct Amy evidence. partial requires at least one valid core artifact but still lacks a family or direct evidence. Otherwise blocked.

- [ ] **Step 4: Add supporting CLI routes**

~~~ts
if (command === 'support:check' || command === 'support:apply') {
  const reviewPath = optionValue(args, '--file');
  if (!reviewPath) throw new Error(command + ' requires --file');
  const manifest = await loadSupportingEvidenceReviewManifest(
    path.resolve(root, reviewPath),
  );
  if (command === 'support:check') {
    await verifySupportingEvidenceReview(root, manifest);
    console.log(
      'Supporting review valid: '
      + manifest.reviewId
      + ', '
      + manifest.decision
      + '.',
    );
    return;
  }
  const result = await applySupportingEvidenceReview(root, manifest, {
    validateCandidates: (candidates) => validateEventCandidates(candidates, {
      enforceDiscoveryRange: false,
    }),
  });
  console.log(
    'Supporting review '
    + (result.changed ? 'applied' : 'unchanged')
    + ': '
    + result.reviewId
    + '.',
  );
  return;
}
~~~

support:batch prints JSON for exactly the four scoped candidate IDs.

- [ ] **Step 5: Add package scripts**

Merge these entries into scripts:

~~~json
{
  "advisor:support:check": "tsx server/runAmyHoodDecisionAdvisor.ts support:check",
  "advisor:support:apply": "tsx server/runAmyHoodDecisionAdvisor.ts support:apply",
  "advisor:support:batch": "tsx server/runAmyHoodDecisionAdvisor.ts support:batch"
}
~~~

- [ ] **Step 6: Verify GREEN and commit**

~~~bash
npx tsx --test tests/amyHoodAdvisorSupportingEvidenceReview.test.ts tests/amyHoodAdvisorSourceCollection.test.ts
npm run advisor:support:batch -- --root "$PWD"
git add server/runAmyHoodDecisionAdvisor.ts tests/amyHoodAdvisorSupportingEvidenceReview.test.ts package.json
git commit -m "feat: expose supporting evidence batch status"
~~~

Expected: tests PASS and batch output contains exactly four scoped candidates.

---

### Task 4: Review Existing Artifacts and Target Four Gaps

**Files:**
- Create: data/b-track/amy-hood/advisor/reviews/2026-07-15-nokia-event-page-support.json
- Create: data/b-track/amy-hood/advisor/reviews/2026-07-15-mojang-english-announcement-support.json
- Create: data/b-track/amy-hood/advisor/reviews/2026-07-15-github-post-outcome-support.json
- Create: data/b-track/amy-hood/advisor/reviews/2026-07-15-nuance-sec-announcement-support.json
- Create only after full-text recovery: reviewed imports and matching review manifests.
- Modify through CLI only: event-candidates.json and source-registry.json

**Interfaces:**
- Consumes: supporting/direct review CLIs and registered discovery URLs.
- Produces: four explicit artifact-first decisions plus verified imports or explicit unresolved gaps.

- [ ] **Step 1: Record these exact artifact-first decisions**

| Event | Source | Decision | Document family | Reason |
|---|---|---|---|---|
| Nokia | source-44ded251a652daf1 | rejected | microsoft-nokia-transaction-call-event-2013 | The 693-character page lists participants but lacks transaction action, board authorization, and financial reasoning. |
| Mojang | source-9d580b28f713a039 | approved_context | microsoft-mojang-announcement-2014 | Useful English context, but the same underlying announcement as the reviewed Spanish variant. |
| GitHub | source-ad9a23176d9cf21d | rejected | microsoft-github-outcome-earnings-2022 | FY2023 Q1 contains no bounded GitHub acquisition passage and cannot support the 2018 event. |
| Nuance | source-f7fd232d93262a85 | approved_context | microsoft-nuance-announcement-2021 | The SEC exhibit is the same Microsoft/Nuance announcement and does not create a second family. |

The Mojang manifest supplies reviewed English aliases for adquirirá and 2 mil
quinientos millones. Its sameDocumentCanonicalUrls also assigns
microsoft-mojang-announcement-2014 to the reviewed Spanish announcement. The
Nuance manifest similarly assigns microsoft-nuance-announcement-2021 to the
reviewed Microsoft announcement and the SEC exhibit. These are provenance
corrections, not new evidence.

- [ ] **Step 2: Validate and apply each manifest independently**

~~~bash
for file in \
  data/b-track/amy-hood/advisor/reviews/2026-07-15-nokia-event-page-support.json \
  data/b-track/amy-hood/advisor/reviews/2026-07-15-mojang-english-announcement-support.json \
  data/b-track/amy-hood/advisor/reviews/2026-07-15-github-post-outcome-support.json \
  data/b-track/amy-hood/advisor/reviews/2026-07-15-nuance-sec-announcement-support.json
do
  npm run advisor:support:check -- --file "$file" --root "$PWD"
  npm run advisor:support:apply -- --file "$file" --root "$PWD"
done
~~~

Expected: each reports valid and then applied or unchanged. None falsely creates a second core family.

- [ ] **Step 3: Attempt only these registered sources in priority order**

1. GitHub direct transcript: source-988d52f913373551, https://stockanalysis.com/stocks/msft/transcripts/62670-m-a-announcement/
2. Nuance direct transcript: source-af06e755c0777f19, https://stockanalysis.com/stocks/msft/transcripts/12504-m-a-announcement/
3. Mojang: source-33ff6cc931a617fa Reuters; use source-8dfe8681c6f17c40 WIRED only if Reuters cannot be preserved.
4. Nokia: source-344b5f212e415c61 Reuters.

For each accessible source, preserve the complete relevant article or transcript in one of these exact files:

~~~text
data/b-track/amy-hood/advisor/imports/source-988d52f913373551-reviewed-import.json
data/b-track/amy-hood/advisor/imports/source-af06e755c0777f19-reviewed-import.json
data/b-track/amy-hood/advisor/imports/source-33ff6cc931a617fa-reviewed-import.json
data/b-track/amy-hood/advisor/imports/source-8dfe8681c6f17c40-reviewed-import.json
data/b-track/amy-hood/advisor/imports/source-344b5f212e415c61-reviewed-import.json
~~~

Use the real full text, real SHA-256, real publication date, reviewer identity, and review instant. Then run:

~~~bash
for file in \
  data/b-track/amy-hood/advisor/imports/source-988d52f913373551-reviewed-import.json \
  data/b-track/amy-hood/advisor/imports/source-af06e755c0777f19-reviewed-import.json \
  data/b-track/amy-hood/advisor/imports/source-33ff6cc931a617fa-reviewed-import.json \
  data/b-track/amy-hood/advisor/imports/source-8dfe8681c6f17c40-reviewed-import.json \
  data/b-track/amy-hood/advisor/imports/source-344b5f212e415c61-reviewed-import.json
do
  test -f "$file" || continue
  npm run advisor:source:import -- --file "$file" --root "$PWD"
done
~~~

Expected successful output: source ID followed by review_required. If blocked, truncated, paywalled, or missing a full attributable body, create no import and retain source_unavailable as an explicit gap.

- [ ] **Step 4: Keep direct and supporting review paths separate**

For recovered GitHub or Nuance transcripts, use the existing direct evidence commands only when a bounded Amy Hood segment contains the exact event fingerprint and decision-useful financial judgment:

The only permitted direct-review filenames in this batch are
2026-07-15-github-direct-evidence.json and
2026-07-15-nuance-direct-evidence.json. Apply whichever verified manifests
exist:

~~~bash
for file in \
  data/b-track/amy-hood/advisor/reviews/2026-07-15-github-direct-evidence.json \
  data/b-track/amy-hood/advisor/reviews/2026-07-15-nuance-direct-evidence.json
do
  test -f "$file" || continue
  npm run advisor:evidence:check -- --file "$file" --root "$PWD"
  npm run advisor:evidence:apply -- --file "$file" --root "$PWD"
done
~~~

For Mojang or Nokia reporting, use supporting review only. The article must preserve attributable primary decision information and all event discriminators in one contiguous passage. Otherwise record rejected with insufficient_decision_context.

- [ ] **Step 5: Rerun status and commit decisions**

~~~bash
npm run advisor:support:batch -- --root "$PWD"
npm run advisor:candidates:check -- --root "$PWD"
git add data/b-track/amy-hood/advisor/reviews data/b-track/amy-hood/advisor/imports data/b-track/amy-hood/advisor/event-candidates.json data/b-track/amy-hood/advisor/source-registry.json
git commit -m "data: review incomplete M&A evidence"
~~~

Expected: candidate validation passes. partial or blocked is valid; passed is allowed only with two core families and verified direct Amy evidence.

---

### Task 5: Report Before/After and Run Full Verification

**Files:**
- Create: docs/reports/2026-07-15-amy-hood-ma-supporting-evidence-report.html
- Test: all affected and full regression suites.

**Interfaces:**
- Consumes: batch JSON, final registry, candidate matrix, review manifests, and git diff.
- Produces: standalone developer-facing HTML report and verified branch state.

- [ ] **Step 1: Record the approved baseline**

~~~json
{
  "reviewedDiscoveryUrls": 32,
  "validDocuments": 31,
  "phase3EligibleCandidates": 2,
  "scopedEvents": {
    "candidate-nokia-acquisition-2013": "evidence_gap",
    "candidate-mojang-acquisition-2014": "evidence_gap",
    "candidate-github-acquisition-2018": "evidence_gap",
    "candidate-nuance-acquisition-2021": "evidence_gap"
  }
}
~~~

Capture after state:

~~~bash
npm run advisor:support:batch -- --root "$PWD" > /tmp/amy-hood-ma-supporting-after.json
~~~

- [ ] **Step 2: Create the standalone HTML report**

Include:

- objective and evidence rules;
- quantitative Before vs After table;
- one row per event with approved, rejected, unavailable, direct evidence, family count, and outcome;
- duplicate-family finding for Mojang and Nuance;
- temporal-leakage finding for GitHub and Nokia outcome sources;
- exact test commands and results;
- final gate decision and remaining gaps.

Use passed, partial, and blocked exactly as emitted. Do not describe the data gate as successful merely because the software pipeline works.

- [ ] **Step 3: Run focused and full verification**

~~~bash
npx tsx --test tests/amyHoodAdvisorSupportingEvidenceReview.test.ts tests/amyHoodAdvisorDirectEvidenceReview.test.ts tests/amyHoodAdvisorSourceCollection.test.ts tests/amyHoodAdvisorPdfUrlInventory.test.ts
npm run advisor:evaluation-v3:test
npm run evaluation:test
npm run persona:test
npm run lint
npm run build
git diff --check
~~~

Expected: every command exits 0, TypeScript reports no errors, Vite succeeds, and diff check prints nothing. advisor:sources:check may exit nonzero only with documented Phase 2 deficits; record them instead of weakening thresholds.

- [ ] **Step 4: Commit the report**

~~~bash
git add docs/reports/2026-07-15-amy-hood-ma-supporting-evidence-report.html
git commit -m "docs: report M&A supporting evidence completion"
~~~

Expected: commit succeeds and the working tree is clean.

## Completion Criteria

- The source gate counts underlying document families, not superficial source-type labels.
- All four scoped existing artifacts have explicit review decisions.
- Targeted collection is limited to the registered GitHub transcript, Nuance transcript, Mojang report, and Nokia report.
- Every recovered source has immutable artifacts and a review manifest; unavailable sources remain explicit gaps.
- Direct Amy evidence remains exclusive to the existing direct review workflow.
- The report states per-event passed, partial, or blocked and the Phase 2 deficit.
- Full regressions pass without weakening the 30-event, 100-URL, 50-document, two-family, direct-evidence, or temporal-leakage gates.
