# Amy Hood PDF URL Registry Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate and safely merge the 31-URL PDF inventory into advisor candidates and the source registry, then collect eligible official sources and reassess Phase 2.

**Architecture:** A focused inventory module validates staging metadata and produces unreviewed candidate associations plus registry discoveries. Existing atomic persistence, URL policy, and hardened collectors remain authoritative. The merge is idempotent, preserves reviewed state, and compensates cross-file failure.

**Tech Stack:** TypeScript, Node test runner, existing advisor source registry/collector modules, JSON data files.

## Global Constraints

- Do not ingest PDF prose as evidence.
- Do not relax the 100 reviewed URL or 50 valid document gates.
- Do not downgrade existing reviewed associations or overwrite collected artifacts.
- Follow the repository Test Plan format: one happy path, exactly three realistic edge cases, and applicable failure paths.

---

### Task 1: Define and validate the discovery inventory

**Files:**
- Create: `server/decisionAdvisor/pdfUrlInventory.ts`
- Modify: `shared/amyHoodDecisionAdvisor.ts`
- Test: `tests/amyHoodAdvisorPdfUrlInventory.test.ts`
- Modify: `data/b-track/amy-hood/advisor/imports/amy-hood-ma-pdf-url-inventory.json`

**Interfaces:**
- Produces: `validatePdfUrlInventory(value: unknown): AmyHoodPdfUrlInventory`
- Produces: `loadPdfUrlInventory(filePath: string): AmyHoodPdfUrlInventory`

- [ ] Write failing tests for a valid 31-entry inventory, canonical-equivalent originals, bot-block access, post-publication reconstruction, invalid roles, inconsistent HTTP metadata, and duplicate canonical URLs.
- [ ] Run `npx tsx --test tests/amyHoodAdvisorPdfUrlInventory.test.ts` and confirm RED failures for missing contracts.
- [ ] Implement strict types and validation, including PDF SHA-256 provenance and access-state consistency.
- [ ] Correct the JSON access results, role/review separation, temporal metadata, and provenance.
- [ ] Run the focused test and confirm GREEN.

### Task 2: Implement idempotent candidate and registry merge

**Files:**
- Modify: `server/decisionAdvisor/pdfUrlInventory.ts`
- Modify: `server/decisionAdvisor/sourceRegistry.ts`
- Modify: `server/runAmyHoodDecisionAdvisor.ts`
- Modify: `package.json`
- Test: `tests/amyHoodAdvisorPdfUrlInventory.test.ts`

**Interfaces:**
- Produces: `mergePdfUrlInventory(root: string, inventory: AmyHoodPdfUrlInventory): Promise<MergeResult>`
- Produces: `upsertDiscoveredSources(records: AdvisorSourceRecord[], root: string): Promise<AdvisorSourceRecord[]>`
- CLI: `advisor:inventory:check`
- CLI: `advisor:inventory:merge`

- [ ] Write failing tests for happy merge, idempotent rerun, preserved reviewed association, post-outcome retention, unknown candidate failure, and compensated registry-write failure.
- [ ] Run the focused test and confirm RED.
- [ ] Allow locator-free evidence only for unreviewed/rejected associations; keep reviewed validation unchanged.
- [ ] Implement batch registry upsert and compensated cross-file merge.
- [ ] Add CLI commands and scripts.
- [ ] Run focused and existing source tests and confirm GREEN.

### Task 3: Execute merge, collect official sources, and report status

**Files:**
- Modify: `data/b-track/amy-hood/advisor/event-candidates.json`
- Modify: `data/b-track/amy-hood/advisor/source-registry.json`
- Create/Modify: `data/b-track/amy-hood/advisor/raw/*`
- Create/Modify: `data/b-track/amy-hood/advisor/normalized/*`
- Modify: `docs/reports/2026-07-15-amy-hood-ma-pdf-url-inventory.md`
- Create: `docs/reports/2026-07-15-amy-hood-pdf-registry-integration-report.md`

- [ ] Run `npm run advisor:inventory:check` and require 31 valid entries.
- [ ] Run `npm run advisor:inventory:merge` twice and verify the second run is idempotent.
- [ ] Collect newly registered Microsoft and SEC sources through `source:collect`; preserve explicit failures.
- [ ] Run candidate and source gates and record exact remaining deficits without weakening thresholds.
- [ ] Run source, v3, v2, inventory, persona, lint, build, and diff verification.
- [ ] Write the pipeline completion report with before/after counts, remaining blockers, and the exact Phase 2/3 boundary.
