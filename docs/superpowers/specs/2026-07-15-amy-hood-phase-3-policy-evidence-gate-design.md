# Amy Hood Phase 3 Policy Evidence Gate Design

**Date:** 2026-07-15  
**Status:** Approved  
**Branch:** `codex/amy-hood-decision-advisor`

## 1. Decision

Phase 3 approval no longer requires Amy Hood to have publicly repeated the exact event terms by the announcement date. A card is validator-ready when it has:

1. an official, event-specific decision-context artifact; and
2. either an event-specific Amy Hood statement or a reviewed Amy Hood policy statement published before the decision; and
3. exact immutable-source offsets, a verified Amy Hood speaker boundary, and no post-outcome evidence in the core card.

This change supports the project goal of reconstructing Amy Hood's decision criteria without falsely attributing another executive's announcement language to her.

## 2. Rejected Alternatives

### Keep the strict event-specific direct-statement gate

This is strongest for attribution but leaves the pilot concentrated in acquisition calls. OpenAI expansion, Copilot pricing, and the workforce reset have useful Amy Hood reasoning around the event, but the exact public announcement was made by another executive or Amy's detailed explanation followed the announcement.

### Relabel generic Amy Hood remarks as event-specific direct evidence

This would reach five cards quickly but would make `direct_amy` semantically false and weaken auditability. The implementation must preserve a distinct `amy_policy` role.

## 3. Minimal Artifact

Create one pilot policy-evidence registry under the Phase 3 pilot directory. Each reviewed record stores:

- candidate ID and source ID;
- exact quote and immutable start/end offsets;
- publication date;
- speaker fixed to `Amy Hood`;
- one or more controlled policy tags;
- an event-link rationale of at least 40 characters;
- reviewer and review timestamp.

Controlled policy tags are limited to:

- `value_based_pricing`
- `capital_allocation_return`
- `investment_consistency`
- `cost_revenue_alignment`
- `resource_reallocation`
- `platform_shift_commitment`
- `risk_and_optionality`

The registry is Phase 3-specific. It does not weaken or rewrite the Phase 2 `direct_amy` review contract.

## 4. Validation

A policy-evidence record is accepted only when:

- the candidate exists in the ten-card pilot manifest;
- the source exists in `source-registry.json` with an immutable normalized artifact;
- the exact quote equals the artifact substring at the stored offsets;
- the source or bounded speaker segment identifies Amy Hood;
- `publishedAt` is strictly earlier than the candidate decision-window start;
- policy tags are controlled values;
- the event-link rationale is explicit and review metadata is complete.

Statements published after the decision remain excluded even if they explain the decision well. Search-result snippets, summaries, and inferred speaker identity are not accepted.

## 5. Card Contract and Approval

Add `amy_policy` to Phase 3 evidence roles and `amyPolicyEvidenceIds` to event cards. Preserve `directAmyEvidenceIds` unchanged.

The approval gate becomes:

```text
(direct Amy event evidence OR reviewed pre-decision Amy policy evidence)
AND official decision context
AND exact offsets
AND no post-outcome leakage
```

`missing_direct_amy` is replaced by the clearer blocking gap `missing_amy_judgment`. Existing cards are migrated during rebuild rather than silently interpreted under the new rule.

The report displays event-specific Amy evidence and policy evidence in separate columns. A policy quote must never be presented as if Amy announced the event terms.

## 6. Initial Application

Apply the revised gate first to the existing priorities:

1. OpenAI partnership expansion, 2023;
2. Copilot pricing, 2023;
3. workforce reset, 2023.

The Copilot candidate may use Amy Hood's April 25, 2023 value-based list-price statement because it predates the July pricing decision. OpenAI and workforce candidates require distinct pre-decision Amy policy passages; post-announcement explanations do not qualify.

If a primary candidate still lacks qualifying policy evidence after official-source review, use the already-approved same-domain fallback order in the Phase 3 implementation plan. Do not weaken the temporal rule to force five cards.

## 7. Testing

The Phase 3 test file retains the repository-required test-plan comment with one happy path, exactly three realistic edge cases, and failure paths.

Required behavior tests:

- a valid pre-decision Amy policy span plus event context is validator-ready;
- event-specific direct Amy evidence remains validator-ready without policy evidence;
- a post-decision Amy policy statement is rejected;
- an exact quote outside Amy's speaker boundary is rejected;
- an unknown policy tag is rejected;
- a card with neither direct nor policy judgment reports `missing_amy_judgment`;
- report output separates direct and policy quotations.

## 8. Completion Criteria

The change is complete when:

- the revised contract and validators pass all focused and regression tests;
- all ten cards are rebuilt under the explicit evidence roles;
- at least five cards are validator-ready without temporal or speaker exceptions;
- the user reviews the regenerated standalone HTML report before approval commands run;
- exactly five reviewed cards are then approved and five remain incomplete.
