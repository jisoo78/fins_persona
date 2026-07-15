# Amy Hood PDF URL Registry Integration Design

## Goal

Convert the reviewed 31-URL PDF discovery inventory into safe, reproducible advisor registry discoveries without treating PDF summaries, inaccessible checks, or unverified direct-speech claims as approved evidence.

## Decisions

1. The PDF remains a discovery artifact, not a RAG source.
2. URL inventory entries use the advisor's existing evidence roles. Review state is stored separately.
3. Access results distinguish `accessible`, `blocked_by_automation`, `unavailable`, and `not_checked`, and preserve HTTP status and final URL.
4. A source published after the decision window remains temporally post-outcome even when it reconstructs pre-decision activity. `describedEvidencePeriod` records the period described by the document.
5. Newly merged associations are `unreviewed` and may omit an evidence locator. They do not increase Phase 2 reviewed-URL or valid-document counts.
6. Existing reviewed associations are never downgraded or overwritten.
7. Official Microsoft and SEC URLs use the existing hardened automatic collectors. Other publishers enter the registry as manual-review sources.
8. Registry and candidate writes are prevalidated and compensated if the second write fails.

## Inventory Contract

Each entry records canonical and original URLs, PDF page numbers, candidate identity, publisher, source type, evidence role, direct-evidence claim, review state, publication and temporal metadata, access disposition, HTTP status, final URL, and a review note. The inventory root preserves the source PDF SHA-256 and extraction metadata.

`directEvidenceStatus=verified` means only that the PDF research report claimed a first-party source. Registry merge still records the association as `unreviewed`; it becomes reviewed only after collected artifact and speaker-segment validation.

## Merge Flow

```text
validated inventory
  -> build candidate additions in memory
  -> build registry discoveries in memory
  -> validate candidate matrix without completion thresholds
  -> atomically write candidates
  -> atomically upsert registry batch
  -> compensate candidate write if registry persistence fails
  -> collect eligible official records through existing collectors
  -> run Phase 2 gates without relaxing thresholds
```

## Error Handling

- Reject duplicate, non-canonical, unsupported-role, internally inconsistent, or incomplete inventory entries.
- Reject unknown candidate IDs before any write.
- Preserve existing reviewed associations and collected artifacts.
- Never count post-outcome, unreviewed, failed, or locator-free sources as approved evidence.
- Report bot blocking separately from a genuinely unavailable URL.

## Testing

Follow repository TDD rules. The new test section includes one happy path, exactly three realistic edge cases, and failure paths for invalid roles, inconsistent access metadata, unknown candidates, and compensated partial persistence.

## Completion Boundary

This integration completes PDF discovery ingestion and official-source collection. It does not complete Phase 2 unless the unchanged evidence gates pass, and it does not promote any direct Amy evidence without exact passage and speaker verification.
