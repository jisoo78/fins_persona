# Amy Hood M&A Supporting Evidence Completion Design

## Goal

Improve the Phase 2 evidence gate by completing decision-time supporting evidence for the four M&A events that remain incomplete: Nokia, Mojang, GitHub, and Nuance. Reuse collected artifacts first, collect only evidence that fills a concrete gap, and keep missing Amy Hood evidence explicit rather than weakening the gate.

LinkedIn and Activision Blizzard are outside this batch because they already have approved direct Amy Hood evidence and at least two qualifying decision-time source types.

## Approaches Considered

### Selected: artifact-first review with targeted collection

Inspect existing raw and normalized artifacts, approve qualifying sources, then search or import only the missing source type or direct Amy Hood evidence. This produces the fastest measurable gate improvement while preserving provenance.

### Rejected: recollect all four events from the web

Recollection could make the bundles more uniform, but it duplicates valid artifacts, increases access failures, and delays review without improving the acceptance standard.

### Rejected: use post-outcome sources to fill decision-time gaps

Later earnings releases and annual reports are useful for reflection and outcome analysis, but allowing them to satisfy the core evidence gate would leak hindsight into the decision policy.

## Event Scope and Intended Action

### Nokia

- Validate the collected Microsoft transaction conference-call event artifact.
- Approve it as a second decision-time source type only if the artifact contains event-specific substantive material.
- Keep the later earnings release as outcome or reflection evidence only.
- Search for direct Amy Hood evidence only if none exists in the verified event material.

### Mojang

- Do not count the English and Spanish Microsoft announcements as two source types.
- Recover or collect a different decision-time source type, preferably an interview, transcript, regulatory record, or independent contemporaneous report containing attributable decision information.
- Keep the failed annual-report artifact and inaccessible URLs visible in review output.

### GitHub

- Collect a decision-time source of a different type from the official announcement.
- Prioritize a transcript, interview, regulatory record, or attributable Amy Hood statement explaining financial discipline, strategic return, integration risk, or transaction structure.
- Treat FY2023 earnings evidence as outcome or reflection evidence only.

### Nuance

- Validate the collected SEC press release as the second decision-time source type.
- Inspect the pre-decision Nuance filing for contextual risk and economics without misclassifying it as Amy Hood direct evidence.
- Search separately for a bounded Amy Hood statement; retain `directEvidenceGap` if one cannot be verified.

## Evidence Classification

Each reviewed source receives one temporal class:

- `pre_decision`: available before the public decision and relevant to its constraints;
- `decision_time`: announcement, transaction call, filing, or contemporaneous record of the decision;
- `post_outcome`: later performance, integration, impairment, or retrospective commentary.

Only `pre_decision` and `decision_time` evidence can satisfy core source-type coverage. `post_outcome` evidence is stored separately for reflection and counterfactual evaluation.

Two language variants or mirrors of the same underlying announcement count as one source type. A secondary article counts only when its artifact is preserved and its substantive claims can be traced to identifiable speakers or primary records.

## Direct Amy Hood Policy

A source counts as direct Amy Hood evidence only when a bounded speaker passage or authored post:

1. identifies Amy Hood as the speaker or author;
2. is linked to the exact event through the existing fingerprint or reviewed aliases;
3. contains decision-useful judgment rather than a ceremonial mention;
4. passes artifact identity, locator, and quote verification.

Failure to find such a passage leaves `directEvidenceGap` unchanged. Supporting evidence may improve source-type coverage without satisfying direct evidence coverage.

## Data Flow

```text
four incomplete M&A candidates
  -> inspect existing registry associations and immutable artifacts
  -> classify artifact by time, source type, and evidentiary role
  -> approve qualifying existing evidence
  -> create targeted collection requests for remaining gaps
  -> normalize and register newly collected artifacts
  -> apply reviewed association decisions
  -> rerun source and candidate gates
  -> report per-event and aggregate deltas
```

No source is approved directly from a URL list, PDF summary, search snippet, or inaccessible page.

## Review Outcomes

Each event receives exactly one batch outcome:

- `passed`: two qualifying source types and verified direct Amy Hood evidence;
- `partial`: source-type coverage improved, but direct evidence or another required element remains missing;
- `blocked`: no new qualifying evidence could be verified.

The report records before/after source types, direct-evidence status, approved and rejected source IDs, remaining gaps, and the effect on Phase 2 aggregate thresholds.

## Error Handling

- Artifact path, hash, source ID, candidate ID, or URL mismatch stops approval before writes.
- Inaccessible URLs remain discoveries and never become evidence documents.
- Duplicate announcements, mirrors, and translations cannot inflate source-type coverage.
- A post-outcome source cannot be relabeled to pass a decision-time gate.
- Approval of one event is independent from failures in the other three.
- Existing approved evidence remains unchanged if a new review or persistence operation fails.

## Testing

Follow the repository TDD contract.

- Happy path: an artifact-backed second decision-time source is approved and improves the correct event's source-type coverage.
- Edge case 1: two language variants of one announcement remain one effective source type.
- Edge case 2: post-outcome evidence is retained but excluded from the core gate.
- Edge case 3: one event can remain blocked while other event decisions persist successfully.
- Failure paths: inaccessible source, artifact hash mismatch, incorrect event association, unbounded speaker attribution, and conflicting review application fail safely without partial mutation.

Existing source registry, candidate, direct-evidence, evaluation, persona, type-check, lint, and build tests remain regression requirements.

## Completion Boundary

This batch is complete when Nokia, Mojang, GitHub, and Nuance each have an auditable `passed`, `partial`, or `blocked` decision; every approval references immutable artifacts and verified locators; the source and candidate gates have been rerun; and a before/after report explains the remaining Phase 2 shortfall.

Completion does not imply that the 30-event Phase 2 gate is satisfied or that policy extraction, Main Prompt generation, RAG indexing, or advisor evaluation can begin.
