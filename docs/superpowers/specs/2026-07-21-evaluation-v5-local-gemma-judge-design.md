# Evaluation v5 Local Gemma Judge Design

**Date:** 2026-07-21

**Status:** Approved for implementation
**Scope:** Score the completed repetition-1 Evaluation v5 responses with Gemma 4 12B on port 8082.

## Goal

Add a first-class local LLM Judge path to Evaluation v5. The judge must score the 90 completed responses without seeing the experiment arm, generation model, RAG trace, Policy RAG content, run ID, or historical identity. The existing five-repetition 450-response benchmark remains unchanged and can use the same path later.

## Command

```bash
npm run evaluation:v5:run -- judge-local \
  --group <experiment-group-id> \
  --repetition 1 \
  --base-url http://127.0.0.1:8082/v1
```

The command discovers and pins the model ID from `/v1/models`. It accepts exactly one completed repetition, which means three arms and 90 complete responses.

## Blindness Boundary

The local judge receives only:

- the anonymized scenario;
- the candidate response;
- the frozen alignment key;
- the action, priority, guardrail, and reversal checklist.

The existing private packet links retain arm, run, repetition, and scenario IDs. They are never included in the model request. The blind-packet leakage validator remains mandatory before any request.

## Two-pass Grading

Each response is graded with two sequential calls:

1. **Rationale pass:** produce one Korean sentence explaining identity alignment or conflict without a numeric score.
2. **Score pass:** receive the frozen packet plus the rationale and return strict JSON containing a 1–10 AAS score and four anchor findings.

The score pass may be repaired once when JSON or schema validation fails. Temperature is zero for both passes.

## Persistence and Resume

Every validated grade is written immediately to a draft checkpoint keyed by experiment group, repetition, model ID, packet hash, and judge-prompt hashes. A rerun skips matching completed packets. Stale packet, model, or prompt hashes fail closed instead of silently reusing grades.

Only after all 90 packets pass validation is the batch imported through the normal Evaluation v5 grade store and made active for that packet batch. An unavailable endpoint or interrupted run leaves the active pointer unchanged and preserves the resumable draft.

## Existing Contract Changes

- Packet export accepts an optional repetition filter. Without it, the existing 15-run/450-response contract is unchanged.
- Grade import validates against the exported packet count rather than a hard-coded 450. The formal report still requires 450 linked grades, so a 90-grade batch cannot masquerade as a full benchmark.
- Judge provenance adds `local` while retaining the model ID, rationale prompt hash, score prompt hash, and timestamp.

## Error Handling

- `/v1/models` unavailable or ambiguous: stop before grading.
- Missing or incomplete repetition: stop before packet export.
- Blind-field leakage: stop before network calls.
- Invalid rationale: retry once, then stop with checkpoint preserved.
- Invalid score JSON: one repair call, then stop with checkpoint preserved.
- Packet/model/prompt drift during resume: fail closed.

## Test Plan

1. Happy path: three completed runs export 90 blind packets and produce an importable local grade batch.
2. Edge cases: fenced JSON parsing, checkpoint resume without duplicate calls, and existing 450 export compatibility.
3. Failure path: endpoint or schema failure preserves completed draft grades and does not update the active grade pointer.

## Deliberate Exclusions

- Pair-transition judging is not included in this first 90-response smoke test.
- No Policy RAG or retrieval content is exposed to the judge.
- No automatic 450-response execution is started.
- No dedicated UI is added.
