# Amy Hood Direct Evidence Review and Approval Design

## Goal

Review the collected LinkedIn and Activision Blizzard transaction-call artifacts at source-text level, approve only event-specific Amy Hood evidence, and persist reproducible locators and review decisions without weakening the existing Phase 2 evidence gate.

This specification covers the first direct-evidence review batch only. Review of every supporting source across the six M&A events follows after this batch proves the approval workflow.

## Scope

### In scope

- Microsoft and LinkedIn transaction call, 2016-06-13.
- Microsoft and Activision Blizzard transaction call filed with the SEC, 2022-01-18.
- Exact Amy Hood speaker-boundary verification.
- Event-specific locator construction.
- Reviewer decision records and final source/association approval.
- Removal of a candidate's `directEvidenceGap` only when direct evidence is approved.
- Phase 2 candidate and source gate reruns after application.

### Out of scope

- Automatic approval of the remaining PDF discoveries.
- Main Prompt regeneration, policy extraction, RAG indexing, or persona evaluation.
- Using PDF summaries as evidence text.
- Treating a mention of Amy Hood, a nearby statement by another speaker, or a post-outcome interpretation as direct evidence.

## Approval Policy

A direct source is approved only when all conditions pass:

1. The raw artifact is present and its bytes match the registry SHA-256.
2. The normalized artifact is derived from that raw artifact.
3. A bounded speaker segment identifies Amy Hood without crossing into another speaker's turn.
4. `exactQuote` is copied verbatim from that Amy Hood segment.
5. `exactRelevancePassage` contains the quote and the event identity in one passage of at most 1,200 characters.
6. The passage identifies the entity, acquisition action, and transaction-specific identifier.
7. The statement was available at decision time and does not rely on later success.
8. The passage contains decision-useful financial reasoning, such as financing, dilution or accretion, strategic return, synergy, addressable market, or downside conditions.

Failure of conditions 1–7 produces `rejected` or `review_required`, never approval. Condition 8 may classify a valid direct statement as context-only rather than direct decision evidence.

## Event Wording and Aliases

The collected Amy Hood turns use source-authentic wording such as “agreed to acquire” and rounded transaction values, while existing event fingerprints may use “will acquire” and exact announced values. Quotes must never be rewritten to satisfy a fingerprint.

The candidate fingerprint remains canonical. A small reviewed alias list may be added per discriminator when the same event is expressed differently in a primary source. A locator selects the exact discriminator wording found in its passage. Validation requires:

- each selected value equals either the canonical value or a reviewed alias for that discriminator kind;
- all selected values occur in the exact relevance passage;
- aliases are event-specific, non-generic, and recorded with a reviewer note;
- aliases cannot change the entity, transaction, amount magnitude, or decision direction.

This avoids both false rejection of authentic wording and semantic matching broad enough to admit unrelated evidence.

## Review Artifact

Each decision is stored as a versionable JSON review manifest containing:

- review ID, reviewer, and timestamp;
- source ID, canonical URL, raw and normalized paths, and SHA-256;
- candidate ID and decision-window relation;
- exact quote, exact relevance passage, anchor terms, and event discriminators;
- normalized character offsets for the Amy Hood segment and quote;
- extracted financial signals and a concise reviewer rationale;
- decision: `approved_direct`, `approved_context`, `review_required`, or `rejected`.

The manifest records evidence and judgment; it does not duplicate the source body.

## Application Flow

```text
collected source + immutable artifacts
  -> verify registry identity and hashes
  -> locate bounded Amy Hood segment
  -> construct exact quote and relevance passage
  -> validate canonical fingerprint or reviewed aliases
  -> write review manifest
  -> validate candidate and source transition in memory
  -> atomically persist association and registry decision
  -> compensate the first write if the second write fails
  -> rerun candidate and source gates
```

For `approved_direct`, the association becomes `role=direct_amy` and `reviewStatus=reviewed`, the locator is stored, the registry source becomes `approved`, and `directEvidenceGap` is removed. Other decisions never remove the gap.

## Review Execution

Codex performs both evidence inspection and final approval under the strict policy. The implementation must still produce the review manifest and deterministic validation output so the decision is auditable and repeatable; approval must not exist only as an unrecorded file edit.

LinkedIn and Activision are evaluated independently. One may be approved while the other remains blocked. No batch-level all-or-nothing assumption is allowed.

## Error Handling

- Hash, path, source-ID, candidate-ID, or canonical-URL mismatch stops before writes.
- Missing or overlapping speaker offsets stop direct approval.
- A passage containing the event only outside Amy Hood's bounded turn is rejected as direct evidence.
- A rounded or alternate phrase requires a reviewed alias; silent fuzzy matching is forbidden.
- Existing approved artifacts and reviewed associations remain unchanged on persistence failure.
- Reapplying the same manifest is idempotent; a conflicting manifest requires a new review ID.

## Testing

Follow the repository TDD contract.

- Happy path: a source-authentic Amy Hood turn with reviewed event aliases is approved and removes the direct-evidence gap.
- Edge case 1: canonical event wording approves without aliases.
- Edge case 2: one source approves while the other remains review-required.
- Edge case 3: reapplying an identical manifest makes no data changes.
- Failure paths: another speaker, distant event context, unreviewed alias, artifact hash mismatch, overlapping offsets, and compensated cross-file persistence.

Existing candidate/source gates, collection tests, evaluation tests, persona tests, type checking, and production build remain regression requirements.

## Completion Boundary

This work is complete when both sources have explicit recorded decisions, every approved locator passes the unchanged strict event-relevance checks extended only by reviewed aliases, approval writes are reproducible and idempotent, and all regression tests pass.

It does not mean Phase 2 is complete. The remaining M&A supporting sources and the broader 30-event dataset must still satisfy the existing URL, document, source-type, and direct-evidence coverage thresholds.
