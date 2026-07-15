# Amy Hood Decision Advisor Phase 3 Simple Pilot Design

**Date:** 2026-07-15  
**Status:** Approved design  
**Branch:** `codex/amy-hood-decision-advisor`

## 1. Goal

Build the smallest useful Phase 3 pipeline that converts reviewed public evidence into ten auditable Amy Hood decision-event cards.

The pilot succeeds when:

- ten target events have event-card JSON artifacts;
- five cards are human-approved and five remain incomplete with explicit evidence gaps;
- the ten cards collectively cover all five decision domains;
- only approved cards may enter a Phase 4 policy prototype;
- the existing final-release requirement of twenty approved events and a 12/4/4 split remains unchanged.

This pilot proves the extraction and review workflow. It does not claim that the Amy Hood Decision Advisor is complete.

## 2. Scope

### Included

1. A minimal decision-event card contract.
2. Gemma 4 extraction from immutable source artifacts.
3. Deterministic verification of quotes, speaker identity, timing, and evidence references.
4. Human approval of complete cards.
5. JSON persistence and one concise progress report.
6. Targeted source collection for the ten selected events.

### Excluded

- A multi-step review state machine.
- A separate provisional artifact type.
- A Phase 3 operations UI.
- Policy induction, three-layer RAG, or Main Prompt generation.
- Automatic approval by an LLM.
- Weakening the final twenty-event dataset gate.
- Using post-outcome success or failure as decision-time evidence.

## 3. Pilot Event Portfolio

The portfolio favors evidence availability while preventing an M&A-only dataset.

| Target | Event | Domain | Initial expectation |
|---:|---|---|---|
| 1 | LinkedIn acquisition, 2016 | M&A | approved candidate |
| 2 | Activision Blizzard acquisition, 2022 | M&A | approved candidate |
| 3 | OpenAI partnership expansion, 2023 | AI and cloud CapEx | collect direct Amy evidence |
| 4 | Copilot pricing, 2023 | Pricing and monetization | collect direct Amy evidence |
| 5 | Workforce reset, 2023 | Cost efficiency | collect direct Amy evidence |
| 6 | GitHub acquisition, 2018 | M&A | incomplete until direct transcript is verified |
| 7 | Nuance acquisition, 2021 | M&A | incomplete until direct transcript is verified |
| 8 | AI datacenter investment plan, 2025 | AI and cloud CapEx | incomplete until decision-time context is strengthened |
| 9 | Microsoft 365 pricing change, 2021 | Pricing and monetization | incomplete until direct Amy reasoning is found |
| 10 | Share repurchase decision, 2021 | Shareholder return and risk | incomplete until direct Amy reasoning is found |

The initial expectation is a collection priority, not a predetermined review result. A card becomes approved only when its evidence passes validation and a human approves it. If another candidate in the same domain has materially stronger public evidence, it may replace a target before the pilot manifest is frozen; the replacement and reason must be recorded.

## 4. Minimal Data Model

### 4.1 Evidence span

Each cited span stores:

- source ID and event-candidate ID;
- evidence role: `direct_amy`, `decision_context`, or `post_outcome`;
- exact quote;
- start and end character offsets in the immutable normalized artifact;
- publication date;
- speaker, when known.

The quote must equal the referenced artifact substring exactly. The extractor may propose a span but cannot approve or repair a mismatched quote.

### 4.2 Decision-event card

Each card stores only the information required to reconstruct the decision:

- event ID, candidate ID, title, domain, and decision date;
- decision question and situation;
- objectives, conditions, and constraints;
- at least two concrete options;
- one selected option and the chosen action;
- the principal benefit rejected by that choice;
- direct Amy evidence references;
- decision-context evidence references;
- observations separated from model inferences;
- status: `approved` or `incomplete`;
- explicit evidence gaps;
- reviewer identity and review time for an approved card.

`incomplete` is the default. Only a human review can change a card to `approved`.

## 5. Pipeline

```text
Reviewed source registry and immutable artifacts
  -> bounded Gemma 4 extraction
  -> exact evidence-span validation
  -> decision-event card proposal
  -> deterministic card validation
  -> human approval or incomplete with gaps
  -> JSON card and one pilot progress report
```

### 5.1 Source input

The pipeline reads only collected artifacts referenced by `source-registry.json`. A discovery URL without an immutable artifact is not evidence. Post-outcome artifacts remain available for later evaluation but are passed separately and cannot support the reconstructed decision.

### 5.2 Gemma 4 extraction

Gemma 4 runs against the local OpenAI-compatible endpoint on port 8080. Long artifacts are split into bounded chunks so the system instruction, evidence text, and JSON response fit inside the 16,384-token context. Stable chunk IDs allow reruns to reuse completed results.

The model performs two bounded tasks:

1. propose verbatim evidence spans;
2. propose a structured decision-event card from validated spans.

It does not determine approval.

### 5.3 Deterministic validation

A card is eligible for human approval only when all of the following are true:

- at least one exact, event-specific Amy Hood statement is present;
- at least one decision-time context span is present;
- every citation matches an immutable artifact and exact offsets;
- all core evidence was published no later than the decision date;
- post-outcome evidence is absent from core evidence;
- at least two options exist and exactly one is selected;
- the chosen action, constraints, and rejected benefit are nonempty;
- observations are evidence-backed and inferences are labeled.

Two distinct document families remain preferred and are reported as a gap when missing, but they do not block this ten-card pilot. The final twenty-event release may retain the stricter diversity gate.

### 5.4 Human review

The operator is initially Codex through the local CLI. The user reviews the resulting ten-card report once, rather than operating a multi-stage workflow.

For each card the report shows:

- reconstructed decision;
- direct Amy quote;
- context quote;
- options and chosen action;
- evidence gaps;
- validator result.

The user either approves the card or leaves it incomplete. No separate Phase 3 UI is required for the pilot.

## 6. Targeted Data Expansion

Collection is driven by missing fields in the ten target cards, not by indiscriminate URL volume.

For each incomplete target:

1. identify the single blocking gap, such as a missing direct statement or context source;
2. search official Microsoft Investor, Microsoft Source, SEC filings, official event transcripts, and reputable interviews first;
3. preserve an immutable raw and normalized artifact;
4. record speaker boundaries and exact event-specific locators;
5. rerun extraction only for the affected event.

Blocked or unavailable URLs remain recorded but never count as evidence. A mirror of the same underlying announcement does not create a new document family.

The PDF-derived M&A inventory remains useful discovery input. Its URL count is not treated as equivalent to approved evidence, and the four non-M&A domains require targeted collection outside that PDF.

## 7. Commands and Outputs

Keep the CLI surface small:

- `event:build --id <candidate-id>` builds or refreshes one card;
- `event:build --pilot` processes the ten-card manifest and continues after individual failures;
- `event:approve --id <event-id> --reviewer <name>` approves a validator-ready card;
- `event:report --pilot` writes the concise ten-card status report.

Artifacts live under:

```text
data/b-track/amy-hood/advisor/events/pilot/
  pilot-manifest.json
  <event-id>.json
  extraction-runs/
```

The human-facing report is written under `docs/reports/` as a standalone HTML file.

## 8. Failure Handling

- Malformed model JSON receives one bounded retry. A second failure leaves the card incomplete.
- A quote or offset mismatch is rejected; the pipeline never silently rewrites it.
- Missing direct Amy evidence leaves the card incomplete with `missing_direct_amy`.
- Post-outcome leakage leaves the card incomplete with `post_outcome_leakage`.
- Missing or inaccessible artifacts leave the card incomplete with the precise source gap.
- A failure in one event does not stop the remaining nine events.
- Atomic writes prevent a failed run from replacing a previously valid card.

## 9. Testing

The new Phase 3 test file begins with the repository-required test plan.

### Happy path

- Reviewed artifacts produce a valid incomplete proposal, and explicit human review produces an approved card.

### Exactly three default edge cases

1. A short source remains one chunk.
2. An Amy Hood statement crossing a chunk boundary is deduplicated into one verified span.
3. A card with only one context document family remains reviewable and reports the diversity gap.

### Failure paths

- Two malformed model responses produce no approved artifact.
- Invented or shifted quotations fail exact-offset validation.
- Missing direct Amy evidence cannot be approved.
- Post-outcome evidence cannot enter the decision-time evidence set.
- Persistence failure preserves the previous valid card and leaves no partial write.

Existing Phase 1, Phase 2, evaluation, persona, lint, and build checks remain regression gates.

## 10. Completion Criteria

The pilot is complete when:

1. all Phase 3 code and regression tests pass;
2. ten event-card files and one pilot manifest exist;
3. exactly five cards are human-approved;
4. exactly five cards remain incomplete with machine-readable gap reasons;
5. all five decision domains appear in the ten-card portfolio;
6. no approved card contains post-outcome leakage;
7. the standalone report allows the user to review all ten cards in one pass.

After this pilot, Phase 4 may prototype policy extraction using only the five approved cards. A production-like memory release and formal evaluation remain blocked until the original twenty-approved-event and 12/4/4 dataset gate passes.
