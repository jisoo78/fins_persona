# Amy Hood Evaluation v6 Identity-Key and Judge Recalibration Design

**Date:** 2026-07-21

**Status:** Approved design

**Scope:** Evaluation dataset and LLM Judge only

**Preservation rule:** Evaluation v5 remains frozen and reproducible; all revised scenarios, keys, packets, grades, and reports are created as Evaluation v6 artifacts.

## 1. Objective

Evaluation v6 must answer one question:

> Does the generated advice reproduce Amy Hood's evidenced decision priorities, conditions, exceptions, and reversal boundaries—not merely produce advice that a Judge LLM considers financially reasonable?

The evaluation is not a general CFO capability test. A polished, prudent, or internally coherent answer must not receive a high score unless it reproduces Amy Hood's evidenced decision policy for the scenario.

This design makes two coordinated changes:

1. Audit and rebuild all answer keys so every KPI answer is grounded in Amy Hood evidence.
2. Replace generic answer-quality judging with identity-aware judging that explicitly caps generic CFO answers.

## 2. Current-State Findings

Evaluation v5 contains 30 scenarios organized as 15 two-phase pairs across five domains. Each pair is inspired by a real decision made by another CFO or company, while its frozen answer key is mapped to one of five Amy Hood policies.

The current policy evidence is uneven:

| Domain | Active policy | Same-axis contrast status |
|---|---|---|
| AI and cloud CapEx | `policy-e7eafcda9e4dc2e3` | Reviewed contrast available |
| Cost efficiency | `policy-20d2c645ab6641c9` | Reviewed contrast available |
| Shareholder return and risk | `policy-a7972af407a0bf69` | Reviewed contrast available |
| M&A | `policy-ccd7e455daf31f5f` | Documented unavailable |
| Pricing and monetization | `policy-e0bfae61c424868c` | Documented unavailable |

At least four v5 scenarios currently require replacement because the expected action relies on an unobserved Amy Hood reversal:

- `AAS-V5-MA-02-A`
- `AAS-V5-MA-02-B`
- `AAS-V5-MA-03-B`
- `AAS-V5-PM-03-B`

`MA-01-B`, `PM-01-B`, and `PM-02-B` also require evidence review because their adjustment behavior is inferred rather than observed. The final replacement count is fixed only after the 30-item audit and is expected to be between four and seven.

The current local Judge prompt asks for decision alignment but does not require Amy-specific reasoning, does not distinguish a generic CFO answer, and does not enforce score ceilings. It can therefore reward generic financial competence as persona fidelity.

## 3. Versioning and Non-Destructive Migration

Evaluation v5 artifacts are not edited. Evaluation v6 is created under a separate namespace:

```text
evaluation/v6/
  audit/
    v5-item-audit.json
    replacement-ledger.json
  public/
    scenarios.json
    reviews.json
  sealed/
    scenario-keys.json
    pair-keys.json
    identity-calibration-answers.json
  judge/
    packets/
    grades/
    calibration/
  runs/
  reports/
```

Every v6 item records its v5 predecessor when applicable. Replaced v5 items remain traceable but are not counted in v6 KPI metrics.

## 4. Thirty-Item Evidence Audit

Every v5 scenario receives an audit record with the following fields:

```json
{
  "scenarioId": "AAS-V5-PM-03-B",
  "domain": "pricing_monetization",
  "policyId": "policy-e0bfae61c424868c",
  "amyDirectEvidenceIds": [],
  "amySupportingEventIds": [],
  "amyContrastingEventIds": [],
  "externalMotifEventId": "external-costco-membership-fee-2024",
  "keyEvidenceClass": "unsupported_reversal",
  "identityDiscriminability": "failed",
  "decision": "replace",
  "rationale": "The frozen postpone action is not demonstrated by a reviewed same-axis Amy Hood event."
}
```

### 4.1 Evidence classes

- `direct_observed`: Amy directly described or executed the expected action under comparable conditions.
- `contrast_observed`: a reviewed same-axis Amy event demonstrates the reversal or adjustment boundary.
- `bounded_policy_transfer`: the action is not identical to an Amy event, but all priority, boundary, and action steps follow a reviewed policy without adding a new reversal.
- `unsupported_reversal`: the key requires a pause, termination, deferral, or restart not observed in Amy evidence.
- `generic_only`: the answer is reasonable but cannot be distinguished from a generic CFO answer using Amy evidence.
- `ambiguous_key`: two materially different actions are equally compatible with the current evidence.

### 4.2 KPI admission rule

Only `direct_observed`, `contrast_observed`, and reviewed `bounded_policy_transfer` items may enter the v6 KPI set.

A changed-phase scenario that expects a pause, termination, postponement, restart, or material reversal must have either:

- a reviewed same-axis Amy Hood contrast event, or
- an explicit Amy Hood statement naming the reversal condition and resulting action.

An inferred reversal without either form of evidence is excluded.

## 5. Replacement Strategy

The v6 KPI set remains 30 scenarios arranged as 15 two-phase pairs.

Replacement proceeds in this order:

1. Search for an Amy Hood event in the same domain and decision axis.
2. Require at least one direct Amy statement or attributable decision-time policy statement.
3. For changed-phase items, require an observed contrast or explicit reversal statement.
4. Convert a different CFO's real event into an anonymous scenario only after the Amy answer policy is independently established.
5. If the same domain lacks qualifying Amy evidence, reallocate the pair to a domain with stronger evidence rather than invent a key.

The external CFO event supplies only the scenario conditions. It must never supply the Amy answer key.

Domain balance is a reporting dimension, not a reason to admit weak evidence. Each domain must retain at least one qualifying pair when evidence permits. Any unevaluable domain is explicitly reported as a coverage gap. Remaining pairs are allocated to evidence-rich domains.

The same Amy event may support more than one item only when the items test distinct decision axes. Paraphrased duplicates are prohibited.

## 6. Amy Identity Key

Each v6 scenario key extends the current key with explicit identity fields:

```json
{
  "scenarioId": "AAS-V6-EXAMPLE-A",
  "policyId": "policy-example",
  "expectedAction": "...",
  "amyPriorityOrder": ["..."],
  "amyBoundaryConditions": ["..."],
  "amyReversalRule": ["..."],
  "amySpecificRationale": "...",
  "acceptableVariants": ["..."],
  "genericCfoFoil": {
    "action": "...",
    "whyReasonable": "...",
    "whyNotAmy": "..."
  },
  "identityConflicts": ["..."],
  "evidenceClass": "contrast_observed",
  "amyEvidenceIds": ["..."],
  "externalMotifEventId": "..."
}
```

The key must describe what makes the expected response Amy-specific. Phrases such as “balance growth and profitability,” “protect customers,” and “maintain flexibility” are insufficient unless they are tied to an evidenced priority order or boundary.

## 7. Identity-Aware Judge

The Judge remains blind to the experiment arm and generating model. It receives only:

- the anonymous scenario,
- the candidate response,
- the frozen Amy Identity Key,
- the scoring rubric.

It must not receive Policy RAG retrieval traces, source labels, or the condition name.

### 7.1 Component score

The 1–10 Identity Action Alignment Score is derived from five components:

| Component | Weight | Question |
|---|---:|---|
| Action | 20% | Did the response choose an acceptable action? |
| Amy priority order | 25% | Did it evaluate evidence in Amy's evidenced order? |
| Boundary conditions | 20% | Did it preserve Amy's proceed/hold constraints? |
| Reversal policy | 20% | Did it change direction only at Amy's evidenced boundary? |
| Identity specificity | 15% | Is the reasoning distinguishable from a generic CFO answer? |

Each component is rated from 0 to 4. The uncapped score is calculated as `round(1 + 9 × weighted_component_fraction)`, where `weighted_component_fraction` is the weighted sum after each component is divided by 4. The applicable ceiling is then applied. This makes the component calculation deterministic while preserving the 1–10 report scale.

### 7.2 Mandatory score ceilings

- Generic good-CFO answer with no Amy-specific anchors: maximum 6.
- Correct action but materially different priority order: maximum 7.
- Missing a required Amy reversal or boundary: maximum 6.
- Direct conflict with an Amy identity rule: maximum 4.
- Scores 8–10 require correct action plus Amy-specific priority, boundary, and rationale evidence.

The Judge output includes the applied ceiling and the identity distinction:

```json
{
  "score": 6,
  "uncappedScore": 7,
  "identityVerdict": "generic_cfo",
  "components": {
    "action": 4,
    "priorityOrder": 2,
    "boundaries": 3,
    "reversal": 3,
    "identitySpecificity": 0
  },
  "ceilingApplied": "generic_cfo_max_6",
  "anchorFindings": {
    "action": "aligned",
    "priority": "partial",
    "guardrails": "partial",
    "reversal": "partial"
  }
}
```

The one-sentence rationale must first state the Amy-specific point of agreement or conflict. Fluency, detail, confidence, or generic prudence are not positive scoring factors.

## 8. Item-Level Discrimination Gate

Before a scenario is frozen, it is calibrated with three controlled answers:

1. `amy_aligned`: reproduces the evidenced Amy action, priority, boundaries, and reversal rule.
2. `generic_cfo`: financially reasonable and well written but follows a different or non-specific decision order.
3. `amy_conflict`: explicitly violates an Amy boundary or reversal rule.

An item passes only when the configured Judge produces all of the following:

- `amy_aligned` score is at least 8.
- `generic_cfo` score is at most 6.
- `amy_conflict` score is at most 4.
- `amy_aligned - generic_cfo` is at least 2 points.
- the rationale names the correct Amy-specific distinguishing anchor.

Failure means the item, key, or Judge prompt must be revised. It cannot be marked reviewed or enter the KPI set.

## 9. Judge-Level Calibration Gate

The Judge configuration is approved only when it passes all 30 item-level calibration triplets.

Required metrics:

- Generic Leakage Rate: 0% of generic foils score above 6.
- Conflict Leakage Rate: 0% of identity-conflict answers score above 4.
- Amy Pass Rate: 100% of aligned answers score at least 8.
- Mean Identity Discrimination Gap: at least 2.5 points.
- Schema-valid output rate: 100% after one repair attempt.

At least one independent manual review checks every replacement item and all Judge calibration failures. The local Gemma Judge may execute the full batch, but it cannot approve its own failed calibration item.

## 10. Retrieval and Holdout Boundaries

The external event used to create a scenario remains outside the persona memory and is not retrieved during answer generation. This prevents memorizing the other CFO's historical action.

The Amy policy and approved Amy evidence may be available to Policy RAG and Full RAG according to the experiment arm. Prompt-only receives no RAG.

The Judge packet contains the frozen identity key but no arm label, model label, retrieval metadata, or external CFO identity.

Replacement source research must not modify an already frozen v5 artifact. New sources, events, policies, and scenarios receive v6 provenance and review records.

## 11. Evaluation Arms and Execution Sequence

The three existing persona arms are retained:

1. Main Prompt only

2. Main Prompt + Policy RAG

3. Main Prompt + Full RAG

Execution proceeds in two stages:

1. Judge calibration: 30 scenarios × 3 controlled answer types = 90 controlled answers.
2. Persona calibration run: 30 scenarios × 3 arms × 1 repetition = 90 generated answers and 90 blind grades.
3. Formal run: only after all item and Judge gates pass, 30 scenarios × 3 arms × 5 repetitions = 450 generated answers.

Pair-transition judging is retained for the formal run and receives the same Amy-specific ceiling rules.

## 12. Metrics and Reporting

The primary KPI is Identity Action Alignment Score, not generic answer quality.

The report includes:

- mean identity score by arm and domain,
- Amy priority-order alignment,
- boundary and reversal alignment,
- strict A/B pair alignment,
- Generic Leakage Rate,
- Identity Discrimination Gap,
- item evidence class and coverage,
- excluded and replaced item ledger,
- Judge disagreement and manual-review findings.

Scores from evidence-weak or exploratory items are never combined with the KPI mean.

## 13. Failure Handling

- Missing direct or contrast evidence: exclude and replace; do not infer a gold reversal.
- Two equally valid Amy actions: broaden `acceptableVariants` or replace the item if it loses discriminability.
- Judge rewards a generic foil: fail calibration and revise the rubric or key.
- Judge misreads an explicitly allowed variant: fail the item, preserve the raw response, and require manual review.
- Same-domain replacement shortage: reallocate to an evidence-rich domain and report the coverage gap.
- Invalid Judge JSON: one constrained repair attempt; otherwise fail safely without activating the grade batch.

## 14. Test and Verification Requirements

Implementation follows the repository TDD rules. New or substantially modified test files include one happy path, exactly three realistic edge cases by default, and dependency failure paths.

Required automated coverage includes:

- rejecting unsupported-reversal items from KPI freeze,
- accepting reviewed bounded policy transfers,
- preserving v5 artifacts unchanged,
- enforcing generic, priority, reversal, and conflict score ceilings,
- rejecting a calibration set with insufficient discrimination gap,
- keeping arm and retrieval metadata out of Judge packets,
- atomically activating grades only after a complete valid batch.

## 15. Acceptance Criteria

The design is complete when:

- all 30 v5 scenarios have an evidence-audit decision,
- every excluded KPI item has a replacement ledger entry,
- v6 contains exactly 30 reviewed KPI scenarios in 15 pairs,
- every v6 key has Amy-specific priority, boundary, reversal, foil, and evidence fields,
- no unsupported reversal enters the KPI set,
- all 90 controlled Judge-calibration answers pass their item gates,
- all 90 one-repetition persona answers and 90 individual blind grades complete,
- every item passes the three-answer discrimination gate,
- Generic Leakage Rate and Conflict Leakage Rate are both 0%,
- the v6 report clearly separates Amy identity fidelity from general CFO answer quality,
- Evaluation v5 remains byte-for-byte reproducible.

## 16. Explicit Non-Goals

- Measuring general CFO expertise or prose quality.
- Rewarding long or confident answers.
- Treating the external CFO's actual action as the Amy Hood answer.
- Preserving domain balance by admitting evidence-weak items.
- Claiming Amy Hood identity replication from a single repetition.
