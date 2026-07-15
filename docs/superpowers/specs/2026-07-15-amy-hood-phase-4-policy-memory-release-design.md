# Amy Hood Decision Advisor Phase 4 Policy Memory Release Design

**Date:** 2026-07-15

**Status:** Written for user review

**Track:** B Track — Public-Evidence Persona

**Runtime:** Local Gemma 4, OpenAI-compatible endpoint, 16,384-token context

**Depends on:** Approved pilot decision events, verified policy evidence, Evaluation v3 holdout manifest

**Produces:** Reviewed reflection and policy artifacts, immutable structured-memory release, active release pointer

## 1. Objective

Phase 4 converts approved, non-holdout Amy Hood decision events into a small set of evidence-bound decision policies and publishes them as the active structured memory used by Evaluation v3 RAG arms.

The phase answers one question:

> Can the current public evidence support explicit, conditional Amy Hood decision policies that are safe to inject into Gemma 4 and auditable back to approved events and immutable source evidence?

This phase does not claim to reproduce Amy Hood's private thinking. It derives bounded policies from her publicly observable decisions and statements.

## 2. Scope

### 2.1 Included

1. Load only approved, non-holdout pilot event cards and verified direct-policy evidence.
2. Ask local Gemma 4 to propose cross-event reflections.
3. Ask local Gemma 4 to propose conditional decision policies.
4. Validate every proposal deterministically against source, event, evidence, split, and support rules.
5. Let Codex review and approve only artifacts that pass those rules; the user has delegated this review for the PoC.
6. Publish approved events, reflections, policies, and contrasts as an immutable release.
7. Atomically activate one release through `active.json`.
8. Produce the exact `evaluation-context.json` contract already consumed by Evaluation v3.
9. After activation, approve the 30 Evaluation v3 question reviews and run the first real four-arm Gemma 4 experiment.

### 2.2 Deferred

- BGE-M3 embeddings, hybrid retrieval, reranking, and query-dependent context selection.
- The production Decision Advisor runtime and `DecisionPlan` renderer.
- Main Prompt rewrite into the final thin policy controller.
- Policy/release management UI.
- Five-repetition final benchmark and GPT-5-mini comparison.

Those belong to Phases 5 and 6. Phase 4 emits a compact deterministic context snapshot so the existing Evaluation v3 runner can be exercised immediately.

### 2.3 Explicitly excluded

- GraphRAG.
- Raw-source chunk stuffing into Evaluation v3.
- Automatic approval immediately after an LLM response.
- Training on sealed holdout events, aliases, source IDs, evidence IDs, or post-outcome evidence.
- Fabricating a contrast, exception, reversal signal, or independent confirmation to make a policy pass.

## 3. Current Input Baseline

At design time the pilot contains five approved event cards:

- LinkedIn acquisition, 2016.
- Activision acquisition, 2022.
- OpenAI partnership expansion, 2023.
- Copilot pricing, 2023.
- Workforce resource reset, 2023.

It also contains three reviewed Amy Hood policy-evidence records concerning continued investment, value-based Copilot pricing, and workforce reallocation.

This is enough to run the pipeline and potentially approve a small number of medium-confidence policies. It is not evidence that every domain can produce a deployable policy. GitHub and the other sealed historical holdout artifacts remain forbidden even if they would make a policy easier to support.

## 4. Architecture

```text
Approved non-holdout event cards + verified policy evidence
  -> deterministic input selector and leakage gate
  -> Gemma reflection proposal
  -> reflection validator
  -> Codex reflection review
  -> Gemma policy proposal
  -> policy validator
  -> Codex policy review
  -> immutable release builder
  -> release verifier
  -> atomic active.json switch
  -> Evaluation v3 context loader
```

Gemma performs bounded natural-language synthesis. TypeScript owns authorization, ID resolution, evidence thresholds, status transitions, hashing, persistence, and holdout enforcement. The LLM cannot approve its own output or change referenced artifacts.

## 5. Components and Responsibilities

### 5.1 Input selector

The selector reads the pilot manifest, event cards, source registry, policy-evidence records, and sealed Evaluation v3 holdout manifest.

It must:

- select event cards whose status is exactly `approved`;
- reject post-outcome evidence from reflection and policy inputs;
- resolve every referenced source and evidence span;
- build explicit artifact references for the existing holdout checker;
- call the holdout checker before any model request or derived-artifact write;
- sort inputs by stable artifact ID so identical inputs produce identical prompts.

Incomplete or `review_required` events remain visible in a gate report but never enter generation.

### 5.2 Reflection builder

A reflection compares decisions instead of summarizing one event. Its LLM prompt receives only the selected event/evidence bundle and requests strict JSON. The model gets exactly one repair retry if the first response is invalid JSON or violates the schema.

Each `ReflectionMemory` contains:

```ts
type ReflectionMemory = {
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
  confidence: 'high' | 'medium' | 'low';
  status: 'review_required' | 'approved' | 'rejected';
  review: ArtifactReview | null;
};
```

A valid reflection needs at least one supporting event and one materially contrasting event. The two sets must be nonempty, disjoint, approved, and non-holdout. The reflection must state why the contrast changes applicability instead of merely saying the events are different.

Similarity alone is not a policy. If no defensible contrast exists, the proposal stays `review_required` with `missing_contrast`; the validator does not invent one.

### 5.3 Policy builder

The policy builder receives only validated reflections and their approved evidence graph. Its result uses the operational form:

```text
WHEN <observable conditions>
PRIORITIZE <ordered criteria>
THEN <bounded recommendation>
EXCEPT WHEN <conditions>
REVERSE IF <observable signals>
```

Each `PolicyMemory` contains:

```ts
type PolicyMemory = {
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
  confidence: 'high' | 'medium' | 'low';
  policyKind: 'deployable_policy' | 'event_specific_hypothesis';
  status: 'review_required' | 'approved' | 'rejected';
  review: ArtifactReview | null;
};
```

A deployable policy must meet one of these support paths:

1. The same bounded rule is supported by at least two approved events; or
2. A verified direct Amy Hood principle is confirmed in another approved event and distinct document family.

The independent confirmation cannot be the same quote restated, the same event, the same document family, a post-outcome source, or a holdout artifact.

Confidence is deterministic:

- **High:** at least three supporting events, verified direct policy evidence, more than one document family, and a reviewed contrast that establishes a boundary.
- **Medium:** at least two supporting events; or one verified direct principle plus qualifying independent confirmation. A reviewed contrast is still required.
- **Low:** anything below those thresholds.

Only high- or medium-confidence `deployable_policy` artifacts may be approved. A low-confidence result is persisted as an `event_specific_hypothesis` and cannot enter an active release.

### 5.4 Deterministic validators

Validators treat model text as untrusted input and enforce:

- schema and nonempty-field requirements;
- known, unique, correctly typed artifact IDs;
- approved event status;
- source and evidence existence;
- quote byte/offset consistency where direct evidence is used;
- support/contrast disjointness;
- the minimum support path and deterministic confidence;
- at least one observable exception or non-applicability condition;
- at least one observable reversal signal;
- exclusion of post-outcome artifacts;
- exclusion of every sealed holdout reference class;
- no policy claim that lacks a referenced reflection and concrete evidence.

Validator output is a structured result with `passed`, `errors`, `warnings`, resolved references, and computed confidence. Validation failure never partially updates an approved artifact or active release.

### 5.5 Review and approval

Generated artifacts start as `review_required`. Codex may approve them only after:

1. deterministic validation passes;
2. the cited evidence is inspected in context;
3. support and contrast actually justify the boundary;
4. policy wording does not generalize beyond the evidence;
5. exceptions and reversal signals are observable rather than vague;
6. no holdout or post-outcome information is present.

Approval records:

```ts
type ArtifactReview = {
  reviewer: 'Codex';
  reviewedAt: string;
  decision: 'approved' | 'rejected';
  rationale: string;
  validationHash: string;
};
```

The CLI separates `build`, `check`, and `approve`. This preserves an auditable review boundary even though the user delegated the final PoC review to Codex.

## 6. Storage Layout

Working artifacts remain mutable proposals; releases are immutable.

```text
data/b-track/amy-hood/advisor/
  policy-memory/
    proposals/
      reflections/*.json
      policies/*.json
      model-runs/*.json
    approved/
      reflections/*.json
      policies/*.json
    reviews/*.json
    gate-report.json
  memory-releases/
    active.json
    v1-<content-hash>/
      manifest.json
      review-ledger.json
      events/*.json
      reflections/*.json
      policies/*.json
      evaluation-context.json
```

`model-runs` stores prompt hash, input artifact hashes, model identifier, generation parameters, raw response, retry count, and parsed result. It does not make raw model output eligible for runtime use.

## 7. Immutable Release Contract

The release builder accepts only approved events, approved reflections, and approved deployable policies. It copies canonical JSON into a temporary directory, computes hashes, validates the complete directory, then renames it into its content-addressed final directory.

```ts
type MemoryArtifactRef = {
  id: string;
  kind: 'event' | 'reflection' | 'policy';
  relativePath: string;
  sha256: string;
};

type MemoryReleaseManifest = {
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

`releaseId` and `version` include the canonical content hash, for example `v1-a1b2c3d4e5f6`. Rebuilding identical canonical inputs returns the same release instead of creating a duplicate.

The external pointer matches the existing Evaluation v3 loader:

```ts
type ActiveMemoryRelease = {
  releaseId: string;
  version: string;
  manifestHash: string;
  activatedAt: string;
};
```

Activation verifies every file hash and the holdout gate before atomically replacing `active.json`. A failed build or activation leaves the previous active pointer unchanged.

## 8. Evaluation Context Contract

`evaluation-context.json` is a compact, deterministic projection of the release:

```ts
type EvaluationContextSnapshot = {
  releaseId: string;
  policy: string[];
  reflections: string[];
  events: string[];
  counterexamples: string[];
  counterexampleStatus: 'reviewed' | 'no_reviewed_counterexample';
  references: EvaluationV3ArtifactReference[];
};
```

Each string is canonical compact JSON for one complete artifact, not free-floating prose and not a raw source chunk. It includes the artifact ID and only the fields Gemma needs to reason: conditions, ordered priorities, action, boundaries, reversal signals, event context, and evidence IDs. Artifacts are never truncated mid-object.

The `references` array is mandatory and enumerates all candidate, event, source, evidence, alias, and raw-source references needed by the holdout checker. The release builder also scans rendered text for inferred holdout aliases and IDs.

Although the existing schema retains `no_reviewed_counterexample` for compatibility, a release built by this design uses `counterexampleStatus='reviewed'`: every approved reflection already requires a reviewed contrasting event, and that contrast is projected into `counterexamples`.

For the current PoC the full context is injected statically into the two RAG arms:

- `amy_policy_rag`: approved policy objects only.
- `amy_full_rag`: approved policies, reflections, supporting events, and reviewed contrasts.

Phase 5 replaces this static snapshot selection with query-dependent hybrid retrieval without changing the release artifacts.

## 9. CLI and Operator Flow

The existing advisor CLI gains:

```text
npm run advisor:memory:build
npm run advisor:memory:check
npm run advisor:memory:approve -- --kind reflection --id <id>
npm run advisor:memory:approve -- --kind policy --id <id>
npm run advisor:memory:release
npm run advisor:memory:activate -- --version <version>
```

The first executable sequence is:

1. Build reflection proposals with local Gemma 4.
2. Check and review reflections; approve only passing artifacts.
3. Build policy proposals from approved reflections.
4. Check and review policies; approve only passing artifacts.
5. Build and verify an immutable release.
6. Activate the verified release.
7. Confirm Evaluation v3 readiness.
8. Change all 30 Evaluation v3 question reviews from `unreviewed` to `approved`, as explicitly authorized by the user.
9. Run one repetition across four arms: 30 questions × 4 arms = 120 Gemma calls.
10. Persist the execution IDs, pinned hashes, category scores, arm lifts, failures, and interpretation in the evaluation report.

The 30 review updates are a benchmark administration action, not evidence used to build memory.

## 10. Failure Handling

| Failure | Required behavior |
|---|---|
| Gemma endpoint unavailable | Persist no derived artifact; report resumable model failure. |
| Invalid JSON | Retry once with the schema error; then persist the raw failed run only. |
| Unknown or duplicate artifact ID | Mark proposal invalid; do not approve. |
| Missing support or contrast | Keep as `review_required`/hypothesis with exact deficit. |
| Holdout or post-outcome reference | Fail before model call when in inputs, or before write when in output. |
| Direct quote mismatch | Reject the evidence path and policy proposal. |
| Hash mismatch in release | Reject release verification and preserve prior active pointer. |
| No deployable policy | Do not create or activate an empty release; report the evidence gap. |
| Evaluation interruption | Preserve completed item results and resume through the existing v3 run store. |

The data gate is intentionally honest: Phase 4 implementation can complete even if the present evidence cannot produce an active release, but the real RAG evaluation cannot begin until at least one policy, one reflection, and one event satisfy the existing Evaluation v3 context requirements.

## 11. Test Strategy

Tests are written before implementation and follow `AGENTS.md`.

### 11.1 Happy path

- Approved non-holdout events produce a validated reflection, a medium/high deployable policy, an immutable release, and a loadable Evaluation v3 context.

### 11.2 Exactly three primary edge cases

1. A direct Amy principle plus independent confirmation in another event/document family qualifies as medium confidence.
2. A real contrasting event narrows the policy boundary and produces a reversal signal rather than invalidating the entire policy.
3. Rebuilding identical approved artifacts is idempotent and returns the same content-addressed release.

### 11.3 Failure paths

- Holdout or post-outcome leakage fails before a derived artifact or release is written.
- One-event generalization remains a hypothesis and cannot be approved or released.
- Missing contrast, unknown evidence, quote mismatch, invalid model JSON after one retry, release hash tampering, or activation failure leaves the last valid state intact.

### 11.4 Regression verification

- Phase 4 policy-memory tests.
- Evaluation v3 tests, including context and holdout tests.
- Existing advisor source/event tests.
- Persona and v2 evaluation regression tests.
- TypeScript lint and production build.

## 12. Acceptance Criteria

Phase 4 is complete when all of the following are true:

1. Reflection, policy, review, release, and active-pointer contracts are implemented and tested.
2. Only approved non-holdout, non-post-outcome evidence reaches builders.
3. Every approved policy has a valid support path, reviewed contrast, explicit boundary, and reversal signal.
4. Unsupported output remains reviewable but cannot enter a release.
5. At least one immutable release passes complete hash and leakage verification, or the pipeline produces a precise evidence-gap report proving why no safe release can be built.
6. If a release is available, `active.json` activates it atomically and both Evaluation v3 RAG arms load it without contract errors.
7. The 30 Evaluation v3 questions are approved and the first 120-call four-arm Gemma run is either completed or stopped with a resumable external-runtime error.
8. The run report pins model, prompt, question, holdout, and memory-release hashes.
9. If generic CFO scores above 80%, the benchmark is flagged as insufficiently discriminative rather than presented as Amy-specific success.

## 13. Resulting Deliverables

- Typed policy-memory and release contracts.
- Gemma reflection and policy proposal prompts.
- Deterministic builders and validators.
- Codex review records and gate report.
- Approved reflection and policy artifacts supported by current evidence, if thresholds are met.
- Immutable, content-addressed structured-memory release and atomic active pointer.
- Evaluation v3-compatible structured context snapshot with explicit artifact references.
- Updated Evaluation v3 review state and first real four-arm Gemma evaluation report after activation.

The principal product of Phase 4 is not more prose in the Main Prompt. It is a small, versioned, evidence-auditable policy memory that the Main Prompt and Evaluation v3 can consume without reinterpreting all raw source material on every call.
