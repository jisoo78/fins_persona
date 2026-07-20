# Amy Hood Query-Dependent Hybrid RAG Design

**Date:** 2026-07-20  
**Status:** Approved; implementation baseline frozen; remaining scope pending final review
**Target branch:** `codex/amy-hood-first-policy-release`

## 0. Frozen Implementation Baseline

This document remains the single design authority. Do not create a separate
"remaining implementation" design and do not reimplement completed units.
The baseline below was verified against branch
`codex/amy-hood-first-policy-release` on 2026-07-20.

### 0.1 Completed and protected from reimplementation

| Unit | Implementation | Commit | Verified state |
|---|---|---|---|
| Shared contracts and paths | `shared/amyHoodRag.ts`, optional Evaluation v3 retrieval fields, index paths | `562d572` | Contract tests pass |
| BGE-M3 HTTP client | `server/decisionAdvisor/embeddingClient.ts` | `5cb93cd`, corrected by `b435f93` | Port 8081 model identity and 1024 dimensions verified; inputs above the server's 512-token physical batch are split and mean-pooled |
| Immutable evidence index | `server/decisionAdvisor/memoryIndex.ts` | `f1290d3` | Active approved release only; four records and six reviewed Amy Hood quotes; atomic staging and hash checks |
| Hybrid candidate retrieval | `server/decisionAdvisor/lexicalScorer.ts`, `server/decisionAdvisor/hybridRetriever.ts` | `b9eb0d1` | BGE-M3 cosine plus BM25, policy-root collapse, deterministic ordering, no-match threshold, private-field rejection |
| Bounded evidence rendering | `server/decisionAdvisor/ragContext.ts` | `a3cb95e` | Actual quotes and source metadata, deduplication, conservative token cap, index-hash rejection |
| Index CLI and first index | `server/runAmyHoodMemoryIndex.ts`, `advisor:index:*`, `memory-indexes/` | `b435f93` | Build/check succeeds against live BGE-M3 on 8081; active index `8139f1dcda7813c367df7d8fd90a5507e8401e0bb0971e5df51b7c8e03ba96df` |

These units may be changed only by a failing regression test that demonstrates
a requirement gap. Consumer integration must import them instead of creating a
second retriever, context builder, embedding client, index format, or cache key.

### 0.2 Partially implemented; completion is mandatory

1. **Retrieval calibration:** the six-probe development dataset exists, but no
   evaluator currently computes Recall@3 or no-match false-positive rate. The
   active manifest contains provisional metrics supplied by the builder. They
   are not measured results and must not be used in a report.
2. **Full projection:** the renderer supplies complete policy fields and real
   evidence, but it does not yet load and render the linked reflection,
   supporting events, contrasting event, condition delta, and action delta.
3. **Request budgeting:** the RAG block is capped, but the consumer must verify
   the complete system-plus-user request remains at or below 12,000 tokens.

### 0.3 Not implemented

- `server/decisionAdvisor/advisorRuntime.ts` and the dedicated Advisor route/UI
  routing do not exist.
- `server/evaluationV3/retrievalCache.ts` does not exist.
- Evaluation v3 still uses static `EvaluationV3ContextPackage` projection.
- Evaluation v3 run creation does not pin the active index/config hashes and
  answers do not yet persist dynamic retrieval traces.
- `server/runAmyHoodEvaluationV3.ts` does not exist.
- No 30-question × four-arm E4B run has used this dynamic index, and no dynamic
  RAG report exists.

### 0.4 Frozen remaining delivery order

Work must continue in this exact order:

1. Replace provisional calibration with measured development-set metrics and
   refuse index activation when either quality gate fails.
2. Complete linked reflection/event/contrast expansion and total-request
   budgeting in the existing context builder.
3. Connect the actual Amy Hood Advisor chat to the existing retriever and
   context builder, with explicit prompt-only fallback on dependency failure.
4. Add one atomic Evaluation v3 retrieval cache and make Policy/Full arms reuse
   the same ranked roots for each public question prompt.
5. Replace static context on new Evaluation v3 executions, pin hashes, and
   persist traces. Preserve historical static-run readers.
6. Run all non-model gates, then one 30-question × four-arm experiment using
   E4B on 8080 and BGE-M3 on 8081.
7. Correctly label earlier reports as static-context baselines and generate a
   new developer report from the dynamic-run JSON.

No model comparison may start before steps 1–5 pass. A dependency failure in a
RAG evaluation arm marks the run incomplete; it must never silently become a
prompt-only run.

## 1. Objective

Implement one production-shaped, query-dependent RAG engine shared by the Amy Hood Decision Advisor and Evaluation v3. The engine must retrieve approved decision memory and the actual Amy Hood evidence text connected to that memory before invoking Gemma 4.

The model receives a read-only evidence package. It receives no filesystem, database, retrieval, or tool-calling capability.

The completed feature must make this flow true:

```text
user question text
  -> local hybrid retrieval
  -> relevant approved policy candidates
  -> linked reflections, events, contrasts, and evidence spans
  -> source-grounded context within the 16,384-token model limit
  -> Gemma 4 answer
```

Evaluation v3 must call the same retrieval engine with the public question text. It must not select evidence by question ID, answer key, expected intent, sealed event, or evaluation-only mapping.

## 2. Why the Current Implementation Is Insufficient

Phase 4 intentionally implemented static memory-release projection as a temporary PoC boundary. The phase design deferred BGE-M3 embeddings, hybrid retrieval, reranking, and query-dependent context selection to Phase 5.

The current Evaluation v3 implementation therefore does this:

```text
active release
  -> load every approved policy in the release
  -> inject the same policy array into every RAG question
```

`amy_policy_rag` receives policy JSON strings only. `amy_full_rag` receives the same policies plus all projected reflections, events, and contrasts. The model cannot dereference `evidenceIds`, and no evidence text is loaded at query time. `releaseId`, `eventIds`, `evidenceIds`, and source IDs are inert strings to Gemma 4.

This behavior is a fixed policy-context ablation, not query-dependent RAG. The prior Evaluation v3 runs remain valid records of that ablation but are not evidence that Gemma 4 accessed long-term memory.

## 3. Scope

### In scope

- A versioned index derived only from the active approved memory release.
- Resolution of every indexed evidence ID to the exact reviewed Amy Hood text and source metadata.
- Local BGE-M3 dense retrieval plus local lexical retrieval.
- An OpenAI-compatible BGE-M3 embedding service dedicated to port 8081.
- Query-dependent selection using the question text only.
- Policy-first graph expansion through explicit artifact IDs; this is deterministic relation traversal, not GraphRAG.
- One shared retriever for the real Advisor and Evaluation v3.
- A bounded, source-grounded model context.
- Retrieval traces and pinned hashes in evaluation run records.
- Holdout scanning at index-build time and query-result time.
- Explicit no-match and dependency-failure behavior.
- Retrieval calibration on a non-holdout development set.

### Out of scope

- Gemma 4 tool calling.
- Evaluation-specific evidence mappings.
- Answer-key-aware retrieval or reranking.
- External embedding, reranking, or search APIs.
- Cohere reranking.
- Python subprocess embedding in the live Advisor or Evaluation path.
- GraphRAG, knowledge-graph inference, or autonomous multi-hop agents.
- Indexing every unreviewed raw document.
- Replacing the approved-memory review gate.
- Changing Evaluation v3 questions or answer keys in the same implementation cycle.

## 4. Architecture

```text
Active Memory Release
        |
        v
AmyHoodMemoryIndexBuilder
  - verifies release and artifact hashes
  - resolves evidence IDs to reviewed spans
  - rejects holdout leakage
  - creates lexical records and BGE-M3 vectors
        |
        v
Versioned Hybrid Index
  - manifest.json
  - records.json
  - vectors.f32
        |
        v
AmyHoodMemoryRetriever
  - accepts query text only
  - dense + lexical candidate generation
  - calibrated score fusion and no-match gate
  - deterministic linked-artifact expansion
        |
        v
AmyHoodEvidenceContextAssembler
  - policy projection or full projection
  - evidence deduplication
  - whole-artifact token budgeting
  - rendered context + retrieval trace
       / \
      v   v
Advisor  Evaluation v3
```

The two local model services have separate responsibilities:

```text
127.0.0.1:8081/v1
  model: bge-m3-Q8_0.gguf
  endpoint: POST /v1/embeddings
  dimension: 1024
  purpose: index and query embeddings only

127.0.0.1:8080/v1
  model: Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf
  endpoint: POST /v1/chat/completions
  purpose: final CFO reasoning and answer generation only
```

Gemma 4 does not call the embedding service. The application calls port 8081, selects and verifies the memory package, and then calls port 8080.

Each component has a narrow contract:

- The builder converts an immutable release into an immutable index.
- The retriever ranks records and returns artifact IDs and scores. It does not render prompts.
- The assembler loads the selected objects and renders a bounded evidence package. It does not rank.
- The consumers provide a question and decide whether dependency failure permits fallback.

## 5. Index Construction

### 5.1 Index location

Derived indexes live outside immutable memory-release directories:

```text
data/b-track/amy-hood/advisor/memory-indexes/
  <release-id>/
    hybrid-v1/
      manifest.json
      records.json
      vectors.f32
```

The index must not mutate an activated release. Rebuilding identical inputs and configuration must produce identical content hashes.

### 5.2 Source boundary

Only artifacts listed in the active release manifest are eligible. The builder must not scan rejected proposals, unreviewed candidates, the generic archive, or unrelated raw sources.

The corpus contains:

- approved policies;
- approved reflections;
- supporting events;
- reviewed contrasting events;
- evidence spans explicitly referenced by those artifacts;
- source metadata required to identify the evidence.

### 5.3 Evidence resolution

Each `evidenceId` must resolve to a reviewed evidence object containing at minimum:

```ts
type IndexedEvidence = {
  id: string;
  exactQuote: string;
  speaker: 'Amy Hood';
  sourceId: string;
  sourceType: string;
  sourceTitle: string;
  publishedAt: string;
  sourceUrl: string | null;
  candidateId: string;
  temporalRelation: 'pre_decision' | 'at_decision' | 'post_decision';
};
```

Existing approved event artifacts already contain reviewed evidence spans for the current capacity pilot. The builder resolves those first. If an evidence ID cannot resolve to non-empty reviewed text, the build fails before writing any index file.

Post-outcome evidence remains excluded from policy reasoning records. It may not be silently promoted because it is connected to the same candidate.

### 5.4 Search records

One search record is created per approved policy and per event. Reflection and evidence text enrich the parent record rather than becoming free-floating top-level results.

```ts
type AmyHoodMemorySearchRecord = {
  id: string;
  kind: 'policy' | 'event';
  domain: DecisionDomain;
  title: string;
  searchableText: string;
  policyId: string | null;
  reflectionIds: string[];
  supportingEventIds: string[];
  contrastingEventIds: string[];
  evidenceIds: string[];
  sourceIds: string[];
};
```

`searchableText` contains decision semantics, not only metadata: situation, objectives, constraints, applicability conditions, priority order, chosen or recommended action, non-applicability conditions, exceptions, reversal signals, decision-axis question, and evidence quotes.

### 5.5 Index manifest

The manifest pins:

- release ID and release manifest hash;
- holdout manifest hash;
- index schema version;
- BGE-M3 model identifier and dimension;
- builder version;
- lexical tokenizer version;
- retrieval configuration and its hash;
- record count and ordered record hashes;
- vector-file hash;
- calibration-set hash and calibration metrics;
- build timestamp, excluded from the deterministic index hash.

The active release and index hashes must agree before retrieval.

### 5.6 Embedding service contract

Both index construction and query retrieval use the same OpenAI-compatible HTTP contract:

```http
POST http://127.0.0.1:8081/v1/embeddings
Content-Type: application/json

{
  "model": "bge-m3-Q8_0.gguf",
  "input": ["text to embed"]
}
```

The verified service returns a 1024-dimensional vector. Runtime configuration is explicit:

```text
BGE_M3_BASE_URL=http://127.0.0.1:8081/v1
BGE_M3_MODEL=bge-m3-Q8_0.gguf
LOCAL_LLM_BASE_URL=http://127.0.0.1:8080/v1
LOCAL_LLM_MODEL=Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf
```

The builder may batch multiple record strings in one embedding request. Query retrieval sends one normalized query per request. Responses must contain the requested number of finite, normalized 1024-dimensional vectors. Count mismatch, dimension mismatch, NaN, infinity, empty data, wrong model identity, HTTP failure, or timeout is an embedding dependency failure.

The index manifest pins the embedding model ID, dimension, and normalized vector content hash. It does not include the host URL in the deterministic index hash because the URL is deployment configuration rather than model content.

No automatic fallback to `scripts/embed_bge_m3_query.py` is allowed. Silent backend changes would invalidate model comparisons. An operator may choose a different embedding backend only by building a new versioned index and retrieval configuration with distinct hashes.

## 6. Query-Dependent Hybrid Retrieval

### 6.1 Input contract

The public API is intentionally narrow:

```ts
retrieveAmyHoodMemory({
  query: string,
  indexHash: string,
}): Promise<RetrievalResult>
```

It accepts no question ID, answer key, correct intent, correct choice, sealed-event alias, evaluation category, or evaluation-only domain label.

The same API serves free-form Advisor questions and Evaluation v3 question prompts.

### 6.2 Candidate generation

For each non-empty query:

1. Generate a normalized BGE-M3 query embedding.
2. Rank all release records by cosine similarity and retain dense Top-20.
3. Score all records with the versioned local lexical scorer and retain lexical Top-20.
4. Union candidates by record ID.
5. Convert cosine similarity to `(cosine + 1) / 2`; convert BM25 with the committed saturation constant `k` to `bm25 / (bm25 + k)`.
6. Compute `fusedScore = 0.70 * vectorScore + 0.30 * lexicalScore`.
7. Apply the calibrated minimum-score gate.
8. Collapse an event match to its linked approved policy root and retain the best score provenance.
9. Return at most two policy roots, with deterministic tie-breaking by record ID.

The 70/30 weights are the starting configuration, not a result chosen from Evaluation v3. They are accepted only if the non-holdout retrieval calibration gate passes.

An event without a linked approved policy cannot become a policy or full RAG root in this release. It remains unavailable until the review pipeline approves a policy that references it. This prevents unreviewed event interpretation from bypassing the policy gate.

Before an index build or Evaluation v3 RAG run, preflight verifies both local services independently:

- `8081/health` and `8081/v1/models` must expose `bge-m3-Q8_0.gguf` for retrieval.
- `8080/v1/models` must expose the configured E4B model for answer generation.

The real Advisor may start when only port 8080 is available, but every answer must record RAG fallback until port 8081 and a compatible active index are available. Evaluation v3 RAG arms require both services.

### 6.3 Calibration

A small development set uses approved, non-holdout memory only. Each probe contains a natural-language CFO situation and expected eligible artifact IDs. It contains positive and no-match cases.

The configuration passes when:

- relevant policy or event Recall@3 is at least 0.80;
- no-match false-positive rate is at most 0.20;
- no holdout identifier occurs in queries, expectations, index records, or outputs.

The selected threshold, weights, development-set hash, and metrics are committed in the index manifest. Evaluation v3 results must not be used to retune them.

### 6.4 No-match behavior

If no candidate passes the score gate, retrieval returns:

```json
{
  "matches": [],
  "noMatch": true,
  "reason": "below_threshold"
}
```

The engine must not return the only available policy merely because the index is small. This prevents the current `ai_cloud_capex` policy from contaminating M&A, pricing, workforce, and shareholder-return questions.

### 6.5 Cache and fairness

The deterministic cache key is:

```text
SHA256(indexHash + retrievalConfigHash + normalizedQuery)
```

For one Evaluation v3 question, retrieval executes once. `amy_policy_rag` and `amy_full_rag` receive two projections from the same cached result. This prevents search variance from being mistaken for context-layer effects.

## 7. Linked-Artifact Expansion

Ranking chooses roots; explicit approved IDs expand each root.

For a selected policy:

1. Load the complete policy.
2. Load its approved reflection.
3. Load up to two highest-relevance supporting events referenced by the policy.
4. Load at most one reviewed contrasting event on the same decision axis.
5. Resolve up to two evidence spans per included event.
6. Deduplicate evidence and sources by stable ID.

Expansion never follows an ID outside the pinned release and never invents a relation. This is deterministic artifact traversal, not semantic graph search.

## 8. Context Projections

### 8.1 Policy RAG

`amy_policy_rag` receives:

- retrieval reason and scores;
- complete selected policy fields;
- the minimum supporting-event summary needed to interpret applicability;
- linked Amy Hood evidence quotes with source metadata.

It does not receive the full reflection or contrasting event object.

### 8.2 Full RAG

`amy_full_rag` receives the same selected roots and evidence plus:

- complete reflection and decision axis;
- supporting-event details;
- reviewed contrasting event;
- condition delta, action delta, exceptions, and reversal signals.

### 8.3 Rendered format

The model sees source-grounded text, not opaque IDs alone:

```text
[Retrieved Memory 1]
match_score: 0.705
domain: ai_cloud_capex

Policy
- Applies when: ...
- Priority order: ...
- Recommended action: ...
- Does not apply when: ...
- Reversal signals: ...

Supporting event
- Date: 2024-01-30
- Situation: ...
- Chosen action: ...

Amy Hood evidence
- Quote: "..."
- Source: FY2024 Q2 earnings call
- Published: 2024-01-30
- Source ID: source-...
```

The source ID is retained for reproducibility, but the actual quote and context carry the semantic content.

## 9. Context Budget

The llama-server context is 16,384 tokens. The assembler enforces:

- maximum RAG context: 6,000 tokens;
- maximum complete request before response: 12,000 tokens;
- policy roots: at most two;
- supporting events: at most two per policy;
- evidence spans: at most two per included event;
- contrasting events: at most one per decision axis.

Items are removed in ascending retrieval value when the budget is exceeded. A policy, event, or quote is either included whole or excluded whole. The assembler never truncates inside an evidence quote or JSON object.

The token-counting adapter uses llama-server tokenization when available. A conservative deterministic estimator is the fallback. Evaluation records which counter was used.

## 10. Consumer Integration

### 10.1 Decision Advisor

The real Advisor invokes the retriever before Gemma 4. If retrieval returns `noMatch`, it answers from the Master Prompt and records the no-match trace. If the retrieval dependency fails, it uses the same prompt-only fallback and records `ragFallback=true` with an error code.

The user-facing answer remains source-link-free under the existing product decision. Internal traces retain source metadata for audit and evaluation.

### 10.2 Evaluation v3

The two no-RAG arms remain unchanged.

- `generic_cfo`: generic CFO prompt, no retrieval.
- `amy_prompt`: Amy Master Prompt, no retrieval.
- `amy_policy_rag`: shared dynamic retrieval, policy projection.
- `amy_full_rag`: the same cached retrieval, full projection.

Evaluation retrieval receives only `question.prompt`. It does not receive `question.id`, options, answer keys, trap metadata, category, domain, pair behavior, or holdout annotations.

Each RAG answer stores its retrieval trace. An infrastructure or integrity failure marks the run incomplete. Evaluation must never silently downgrade a RAG arm to prompt-only. A valid semantic no-match is not an infrastructure failure and remains a completed answer with `noMatch=true`.

## 11. Retrieval Trace

Every retrieval result records:

```ts
type AmyHoodRetrievalTrace = {
  queryHash: string;
  indexHash: string;
  retrievalConfigHash: string;
  cacheKey: string;
  selectedArtifacts: Array<{
    id: string;
    kind: 'policy' | 'event';
    vectorScore: number;
    lexicalScore: number;
    fusedScore: number;
  }>;
  expandedArtifactIds: string[];
  evidenceIds: string[];
  sourceIds: string[];
  noMatch: boolean;
  noMatchReason: 'below_threshold' | null;
  contextTokens: number;
  tokenCounter: 'llama_server' | 'conservative_estimator';
  contextHash: string;
};
```

The trace contains no answer key and no hidden evaluation information.

## 12. Holdout and Integrity Gates

The existing sealed holdout manifest remains authoritative.

The builder scans:

- release artifacts;
- resolved evidence text and metadata;
- index records;
- calibration queries and expected IDs;
- rendered retrieval contexts.

A matched sealed candidate, event, source, evidence, alias, or disallowed temporal artifact aborts the operation and names the leaked identifier. Index creation uses a temporary directory followed by atomic rename, so a failed build leaves no partial index.

At query time, the retriever verifies the active release hash, index manifest hash, vector hash, and holdout manifest hash before returning results.

## 13. Failure Behavior

| Condition | Advisor | Evaluation v3 |
|---|---|---|
| Valid semantic no-match | Prompt-only answer; record `noMatch` | Complete answer; record `noMatch` |
| Missing or stale index | Prompt-only fallback; record error | Run becomes incomplete |
| BGE-M3 query failure | Prompt-only fallback; record error | Run becomes incomplete |
| Port 8081 unavailable or wrong embedding model | Prompt-only fallback; record dependency error | Experiment preflight or run fails safely |
| Port 8080 unavailable or wrong E4B model | Answer generation fails explicitly | Experiment preflight or run fails safely |
| Corrupt vector or manifest hash | Prompt-only fallback; record integrity error | Run becomes incomplete |
| Unresolved or empty evidence at build | No index written | Evaluation cannot start with that index |
| Holdout leak | No index written | Evaluation cannot start |
| Context budget exhaustion | Deterministic whole-item reduction | Same deterministic reduction |

## 14. TDD Test Plan

New or significantly changed test files begin with the repository-required Test Plan comment.

### Happy Path

- A natural-language CFO question retrieves the eligible approved policy, expands linked events, resolves at least one actual Amy Hood quote, renders a bounded context, and produces the same retrieval result for Advisor and Evaluation consumers.

### Edge Cases — exactly three by default

1. A realistic unrelated CFO question returns `noMatch=true` and no policy context.
2. A result exceeding the token budget drops the lowest-value complete artifact without cutting an object or quote.
3. Duplicate evidence reached through multiple artifacts is included once, and policy/full evaluation projections share one cached retrieval result.

### Failure Paths

- A holdout reference or alias causes a pre-write build failure and leaves no partial index.
- An unresolved evidence ID or empty reviewed quote causes a pre-write build failure.
- A stale release, index, vector, retrieval-config, or holdout hash causes a safe integrity failure.
- A BGE-M3 HTTP timeout or malformed embedding triggers Advisor fallback and Evaluation incomplete behavior.
- Port 8081 model discovery and `/v1/embeddings` response count, dimension, and finite-number validation fail safely.
- Port 8080 and 8081 cannot be swapped: an embedding response is never accepted as a generation response and vice versa.
- Any attempt to pass a question ID, answer key, correct choice, correct intent, or evaluation-only metadata to the retriever fails its API or contract test.

### Retrieval quality tests

- The committed non-holdout probe set meets Recall@3 >= 0.80.
- No-match false-positive rate is <= 0.20.
- Calibration artifacts contain no holdout identifiers.

### Regression tests

- Existing memory-release, prompt-version, holdout, and Evaluation v3 suites remain green.
- The generic CFO and Amy Prompt arms never invoke retrieval.
- Existing historical run JSON remains readable; new retrieval-trace fields are versioned or optional for old runs.

## 15. Acceptance Criteria

The implementation is complete only when all conditions are true:

1. One command builds a versioned hybrid index from the active approved release.
2. Index and query embeddings are served by `bge-m3-Q8_0.gguf` on port 8081 through `/v1/embeddings`.
3. Every indexed evidence ID resolves to reviewed Amy Hood text and source metadata.
4. A free-form Advisor question and an Evaluation v3 question use the same retriever API.
5. Retrieval input is question text only.
6. At least one relevant test question receives an actual evidence quote.
7. At least one unrelated question returns a genuine no-match.
8. Policy and Full RAG projections share the same cached ranked roots.
9. Each RAG evaluation answer records scores, selected artifacts, evidence IDs, hashes, and context tokens.
10. The 16,384-token limit cannot be exceeded by the constructed request.
11. Holdout leakage and stale indexes fail closed.
12. The non-holdout retrieval quality gate passes before any model comparison is run.
13. A new Gemma 4 smoke comparison uses the dynamic index and the report labels earlier runs as static-context ablations.

## 16. Delivery Sequence

1. Define retrieval schemas and immutable index layout.
2. Implement evidence resolution and atomic index building.
3. Implement the non-holdout calibration fixture and quality gate.
4. Implement local BGE-M3 and lexical candidate generation with deterministic fusion.
5. Implement linked-artifact expansion, budgeting, context rendering, and traces.
6. Integrate the shared engine into the real Advisor.
7. Integrate cached retrieval and traces into Evaluation v3.
8. Build the first index, run retrieval quality checks, and inspect contexts without invoking Gemma 4.
9. Only after retrieval approval, run one 30-question × four-arm Gemma 4 comparison and write a new report.

## 17. Final Design Decision

The project will replace static memory projection in live and future evaluation paths with application-side, query-dependent local hybrid retrieval. Gemma 4 will not call tools. The application will retrieve and verify approved policy memory, resolve actual Amy Hood evidence, assemble a bounded context, and give the model only the selected evidence package.

Earlier Evaluation v3 runs are retained as reproducible static-context baselines. They are not relabeled as real RAG runs.
