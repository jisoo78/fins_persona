# Amy Hood Phase 3 Policy Evidence Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept reviewed pre-decision Amy Hood policy evidence without mislabeling it as an event-specific direct statement, then rebuild the ten-card pilot and produce five honest approval candidates.

**Architecture:** Add a Phase 3-only policy-evidence registry and deterministic validator. Materialize validated policy records as `amy_policy` evidence spans, merge them into card construction, and require either `direct_amy` or `amy_policy` plus official event context. Keep Phase 2 direct-evidence contracts unchanged.

**Tech Stack:** TypeScript 5.8, Node.js `node:test`, atomic JSON/artifact stores, existing Gemma 4 card builder, standalone HTML reporting.

## Global Constraints

- Keep branch `codex/amy-hood-decision-advisor` and the current linked worktree.
- Do not weaken or reinterpret Phase 2 `direct_amy` reviews.
- Policy evidence must predate `decisionWindowStart`; same-day and post-decision statements do not qualify.
- Exact quote offsets and Amy Hood speaker identity are deterministic gates.
- Use one happy path, exactly three realistic edge cases by default, and safe failure-path tests.
- Do not approve cards before the regenerated HTML review checkpoint.

---

### Task 1: Add the Phase 3 Policy Evidence Contract and Validator

**Files:**
- Modify: `shared/amyHoodDecisionAdvisor.ts`
- Modify: `server/decisionAdvisor/paths.ts`
- Create: `server/decisionAdvisor/pilotPolicyEvidence.ts`
- Test: `tests/amyHoodAdvisorEventPilot.test.ts`

**Interfaces:**
- Produces: `PilotPolicyTag`, `PilotPolicyEvidenceRecord`, `loadValidatedPilotPolicyEvidence(root, candidates): Promise<Map<string, PilotEvidenceSpan[]>>`.
- Consumes: existing pilot manifest, source registry, secure artifact reader, and candidate decision windows.

- [ ] **Step 1: Extend the test-plan comment and write failing contract tests**

Add tests proving that a pre-decision exact Amy quote is accepted and that three realistic edge cases are covered by the file-level test plan: direct evidence without policy evidence, one policy source reused only by explicitly linked candidates, and a source-level Amy speaker identity without segment metadata. Add failure tests for a post-decision date, an out-of-bound quote, an unknown tag, and a non-Amy speaker boundary.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npx tsx --test --test-name-pattern "policy evidence" tests/amyHoodAdvisorEventPilot.test.ts
```

Expected: FAIL because `pilotPolicyEvidence.ts`, `amy_policy`, and the policy record types do not exist.

- [ ] **Step 3: Implement the minimal contract and validator**

Add:

```ts
export type PilotEvidenceRole =
  | 'direct_amy'
  | 'amy_policy'
  | 'decision_context'
  | 'post_outcome';

export type PilotPolicyTag =
  | 'value_based_pricing'
  | 'capital_allocation_return'
  | 'investment_consistency'
  | 'cost_revenue_alignment'
  | 'resource_reallocation'
  | 'platform_shift_commitment'
  | 'risk_and_optionality';
```

The validator must read the immutable artifact, compare the exact substring, require Amy Hood source or speaker-segment identity, require `publishedAt < decisionWindowStart`, validate controlled tags and review metadata, and return `amy_policy` spans grouped by candidate.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the Step 2 command. Expected: all policy-evidence tests pass.

- [ ] **Step 5: Commit**

```bash
git add shared/amyHoodDecisionAdvisor.ts server/decisionAdvisor/paths.ts server/decisionAdvisor/pilotPolicyEvidence.ts tests/amyHoodAdvisorEventPilot.test.ts
git commit -m "feat: validate Phase 3 Amy policy evidence"
```

---

### Task 2: Integrate Policy Evidence into Cards and Reports

**Files:**
- Modify: `server/decisionAdvisor/eventCard.ts`
- Modify: `server/decisionAdvisor/pilotReport.ts`
- Modify: `agent_prompts/prompts/amy-hood-event-card-builder.md`
- Test: `tests/amyHoodAdvisorEventPilot.test.ts`

**Interfaces:**
- Consumes: validated `amy_policy` spans from Task 1.
- Produces: `amyPolicyEvidenceIds`, `missing_amy_judgment`, and separate direct/policy report columns.

- [ ] **Step 1: Write failing card and report tests**

Add tests proving:

```text
direct_amy + decision_context -> validator-ready
amy_policy + decision_context -> validator-ready
decision_context only -> missing_amy_judgment
post-decision amy_policy -> post_outcome_leakage
HTML/JSON report -> directQuote and policyQuote are separate
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npx tsx --test --test-name-pattern "Amy judgment|policy quote" tests/amyHoodAdvisorEventPilot.test.ts
```

Expected: FAIL because cards do not expose policy IDs and still emit `missing_direct_amy`.

- [ ] **Step 3: Implement the minimal card integration**

Add `amyPolicyEvidenceIds` to the card contract. Change the blocking condition to require at least one `direct_amy` or `amy_policy` span and emit `missing_amy_judgment` otherwise. Include policy IDs in leakage checks. Load validated policy spans in `buildPilotEvent`, merge them before card proposal, and render policy quotes separately in JSON and HTML.

- [ ] **Step 4: Run focused and complete pilot tests**

```bash
npx tsx --test tests/amyHoodAdvisorEventPilot.test.ts
```

Expected: all pilot tests pass.

- [ ] **Step 5: Commit**

```bash
git add shared/amyHoodDecisionAdvisor.ts server/decisionAdvisor/eventCard.ts server/decisionAdvisor/pilotReport.ts agent_prompts/prompts/amy-hood-event-card-builder.md tests/amyHoodAdvisorEventPilot.test.ts
git commit -m "feat: admit reviewed Amy policy evidence"
```

---

### Task 3: Collect Reviewed Policy Evidence and Rebuild the Pilot

**Files:**
- Modify: `data/b-track/amy-hood/advisor/source-registry.json`
- Create or modify: `data/b-track/amy-hood/advisor/raw/`
- Create or modify: `data/b-track/amy-hood/advisor/normalized/`
- Create: `data/b-track/amy-hood/advisor/events/pilot/policy-evidence.json`
- Modify: `data/b-track/amy-hood/advisor/events/pilot/candidate-*.json`
- Modify: `data/b-track/amy-hood/advisor/events/pilot/pilot-report.json`
- Modify: `docs/reports/2026-07-15-amy-hood-phase-3-pilot-review.html`

**Interfaces:**
- Consumes: official Microsoft Investor transcripts and Task 1 validator.
- Produces: at least five validator-ready cards and an auditable one-pass report.

- [ ] **Step 1: Register and collect complete official transcripts**

Start with official sources published before each decision. Register canonical URLs, collect complete artifacts through `advisor:source:collect`, and retain access failures explicitly. Do not import search snippets.

- [ ] **Step 2: Create exact reviewed policy records**

For each accepted record, compute exact offsets from the immutable normalized file, verify an Amy Hood speaker boundary, assign controlled policy tags, and write an explicit event-link rationale. Reject same-day or post-decision explanations.

- [ ] **Step 3: Validate and rebuild all ten cards**

```bash
npm run advisor:event:build -- --pilot --root "$PWD"
npm run advisor:event:report -- --pilot --root "$PWD"
```

Expected: ten cards exist, at least five have no blocking gaps, and no card is automatically approved.

- [ ] **Step 4: Run regression verification**

```bash
npx tsx --test tests/amyHoodAdvisorEventPilot.test.ts tests/amyHoodAdvisorDirectEvidenceReview.test.ts tests/amyHoodAdvisorSupportingEvidenceReview.test.ts tests/amyHoodAdvisorSourceCollection.test.ts
npm run evaluation:test
npm run lint
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 5: Present the HTML checkpoint**

Provide `docs/reports/2026-07-15-amy-hood-phase-3-pilot-review.html`. Do not run `event:approve` until the user confirms the five named cards.

- [ ] **Step 6: Commit reviewed artifacts after approval**

```bash
git add data/b-track/amy-hood/advisor/source-registry.json data/b-track/amy-hood/advisor/raw data/b-track/amy-hood/advisor/normalized data/b-track/amy-hood/advisor/events/pilot docs/reports/2026-07-15-amy-hood-phase-3-pilot-review.html
git commit -m "data: add Amy Hood policy evidence pilot"
```
