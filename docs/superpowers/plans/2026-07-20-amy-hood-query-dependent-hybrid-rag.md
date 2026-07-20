# Amy Hood Query-Dependent Hybrid RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Evaluation v3's static memory projection with one query-dependent, evidence-grounded Hybrid RAG engine shared by the Amy Hood Decision Advisor and Evaluation v3.

**Architecture:** Build an immutable hybrid index from the active approved memory release, using `bge-m3-Q8_0.gguf` on port 8081 for dense vectors and a deterministic local BM25 scorer for lexical retrieval. At query time the application retrieves policy roots from question text only, expands approved linked artifacts and actual Amy Hood quotes, assembles a bounded context, and sends that context to E4B on port 8080 without model tool calling.

**Tech Stack:** TypeScript 5.8, Node.js 22, Express, `tsx --test`, local llama.cpp OpenAI-compatible embedding API, local llama.cpp chat API, BGE-M3 1024-dimensional embeddings, JSON/F32 immutable artifacts.

## Global Constraints

- Embedding service: `BGE_M3_BASE_URL=http://127.0.0.1:8081/v1`, model `bge-m3-Q8_0.gguf`, endpoint `POST /v1/embeddings`, dimension `1024`.
- Generation service: `LOCAL_LLM_BASE_URL=http://127.0.0.1:8080/v1`, model `Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf`.
- Gemma 4 receives no tool-calling, filesystem, database, or retrieval capability.
- Retrieval accepts normalized question text only; no question ID, options, answer key, correct intent, category, domain label, or holdout annotation.
- Index only artifacts in the active approved memory release and their reviewed evidence spans.
- Reject holdout candidate, event, source, evidence, alias, raw source, or text leakage before index write and before context return.
- Policy and Full RAG projections for one evaluation question share one persisted retrieval result.
- Maximum RAG context is 6,000 tokens; maximum complete request is 12,000 tokens within the 16,384-token server context.
- Actual Advisor uses explicit prompt-only fallback on dependency failure; Evaluation v3 marks RAG infrastructure failure incomplete and never silently downgrades.
- Preserve historical Evaluation v3 run JSON; new retrieval fields are optional when reading old runs.
- Follow repository TDD rules: one happy path, exactly three realistic edge cases by default, and safe failure-path tests.

---

## File Structure

### New production files

- `shared/amyHoodRag.ts` — persisted index, retrieval result, trace, and context projection types plus runtime assertions.
- `server/decisionAdvisor/embeddingClient.ts` — port 8081 model discovery, health, batch/query embedding, and response validation.
- `server/decisionAdvisor/memoryIndex.ts` — approved-release evidence resolution, deterministic records, atomic index build/load, and hash verification.
- `server/decisionAdvisor/lexicalScorer.ts` — deterministic BM25 tokenizer, corpus statistics, and normalized lexical scoring.
- `server/decisionAdvisor/hybridRetriever.ts` — dense/lexical fusion, threshold gate, root collapse, cache key, and holdout recheck.
- `server/decisionAdvisor/ragContext.ts` — linked-artifact expansion, evidence deduplication, projection, token budgeting, and rendering.
- `server/decisionAdvisor/advisorRuntime.ts` — shared retrieval orchestration and Amy Hood Advisor answer generation/fallback.
- `server/evaluationV3/retrievalCache.ts` — atomic per-experiment/per-query retrieval snapshots shared across RAG arms.
- `server/runAmyHoodMemoryIndex.ts` — index build/check CLI.
- `server/runAmyHoodEvaluationV3.ts` — checked-in local one/five-repetition Evaluation v3 runner.
- `evaluation/retrieval/amy-hood-memory-dev-v1.json` — non-holdout positive and no-match retrieval probes.

### Modified production files

- `shared/amyHoodEvaluationV3.ts` — optional run-level index pins and answer-level retrieval traces.
- `server/decisionAdvisor/paths.ts` — memory-index and retrieval-calibration paths.
- `server/evaluationV3/context.ts` — replace static context projection with active release/index pin verification.
- `server/evaluationV3/prompt.ts` — accept a rendered per-question context instead of static string arrays.
- `server/evaluationV3/runner.ts` — retrieve by `question.prompt`, persist/reuse cache, attach traces, and pin index hashes.
- `server/evaluationV3/routes.ts` — report dynamic-index readiness rather than static snapshot availability.
- `server/index.ts` — add Amy Hood Advisor chat route and keep generic persona chat unchanged.
- `src/components/PersonaDetailModal.tsx` — route Amy Hood messages to the dedicated Advisor endpoint without showing source links.
- `package.json` — add index build/check/test commands.

### New and modified tests

- Create `tests/amyHoodEmbeddingClient.test.ts`.
- Create `tests/amyHoodMemoryIndex.test.ts`.
- Create `tests/amyHoodHybridRetriever.test.ts`.
- Create `tests/amyHoodRagContext.test.ts`.
- Create `tests/amyHoodAdvisorRuntime.test.ts`.
- Create `tests/helpers/amyHoodRagFixture.ts`.
- Modify `tests/amyHoodEvaluationV3Prompt.test.ts`.
- Modify `tests/amyHoodEvaluationV3Runner.test.ts`.
- Modify `tests/amyHoodEvaluationV3Routes.test.ts`.
- Modify `tests/amyHoodEvaluationV3Ui.test.ts` only if the readiness label shape changes.

---

### Task 1: Shared RAG contracts and paths

**Files:**
- Create: `shared/amyHoodRag.ts`
- Modify: `shared/amyHoodEvaluationV3.ts`
- Modify: `server/decisionAdvisor/paths.ts`
- Create: `tests/amyHoodRagContracts.test.ts`

**Interfaces:**
- Produces: `AmyHoodHybridIndexManifest`, `IndexedEvidence`, `AmyHoodMemorySearchRecord`, `AmyHoodRetrievalResult`, `AmyHoodRetrievalTrace`, `AmyHoodRenderedContext`, `assertAmyHoodHybridIndexManifest()`.
- Produces path keys: `memoryIndexes`, `activeMemoryIndex`, and `retrievalCalibration`.
- Later tasks must import these types rather than redeclare them.

- [ ] **Step 1: Write the failing contract tests**

Add the repository-required plan at the top of `tests/amyHoodRagContracts.test.ts` and cover the exact runtime contract:

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - a complete hybrid-index manifest and retrieval trace validate.
 * 2. Edge Cases:
 *    - a historical Evaluation v3 answer without retrieval remains valid.
 *    - no-match permits an empty selected-artifact list.
 *    - Korean evidence and nullable source URL are preserved.
 * 3. Failure Path:
 *    - wrong dimensions, non-finite scores, and evaluation-private request fields fail safely.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertAmyHoodHybridIndexManifest,
  assertAmyHoodRetrievalRequest,
} from '../shared/amyHoodRag';

test('happy: complete manifest validates', () => {
  assert.doesNotThrow(() => assertAmyHoodHybridIndexManifest({
    schemaVersion: 1,
    releaseId: 'v1-aaaaaaaaaaaa',
    releaseManifestHash: 'a'.repeat(64),
    holdoutManifestHash: 'b'.repeat(64),
    embeddingModel: 'bge-m3-Q8_0.gguf',
    embeddingDimension: 1024,
    builderVersion: 'hybrid-v1',
    lexicalVersion: 'bm25-v1',
    retrievalConfig: { vectorWeight: 0.7, lexicalWeight: 0.3, bm25K: 4, minimumScore: 0.5 },
    retrievalConfigHash: 'c'.repeat(64),
    calibrationSetHash: 'd'.repeat(64),
    calibration: { recallAt3: 1, noMatchFalsePositiveRate: 0 },
    recordCount: 4,
    recordHashes: ['e'.repeat(64)],
    vectorsFile: 'vectors.f32',
    vectorsHash: 'f'.repeat(64),
    indexHash: '1'.repeat(64),
    createdAt: '2026-07-20T00:00:00.000Z',
  }));
});

test('failure: private evaluation fields are rejected', () => {
  assert.throws(
    () => assertAmyHoodRetrievalRequest({
      query: '수요 기반 투자?',
      indexHash: 'a'.repeat(64),
      questionId: 'D01',
    }),
    /unknown retrieval request field: questionId/,
  );
});
```

- [ ] **Step 2: Run the contract test and verify red**

Run: `npx tsx --test tests/amyHoodRagContracts.test.ts`  
Expected: FAIL with `Cannot find module '../shared/amyHoodRag'`.

- [ ] **Step 3: Add shared types and assertions**

Create `shared/amyHoodRag.ts` with these public shapes:

```ts
import type { DecisionDomain } from './amyHoodDecisionAdvisor';

export type AmyHoodRetrievalConfig = {
  vectorWeight: number;
  lexicalWeight: number;
  bm25K: number;
  minimumScore: number;
};

export type AmyHoodHybridIndexManifest = {
  schemaVersion: 1;
  releaseId: string;
  releaseManifestHash: string;
  holdoutManifestHash: string;
  embeddingModel: 'bge-m3-Q8_0.gguf';
  embeddingDimension: 1024;
  builderVersion: 'hybrid-v1';
  lexicalVersion: 'bm25-v1';
  retrievalConfig: AmyHoodRetrievalConfig;
  retrievalConfigHash: string;
  calibrationSetHash: string;
  calibration: { recallAt3: number; noMatchFalsePositiveRate: number };
  recordCount: number;
  recordHashes: string[];
  vectorsFile: 'vectors.f32';
  vectorsHash: string;
  indexHash: string;
  createdAt: string;
};

export type AmyHoodRetrievalRequest = {
  query: string;
  indexHash: string;
};

export type IndexedEvidence = {
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

export const assertAmyHoodRetrievalRequest: (
  value: unknown,
) => asserts value is AmyHoodRetrievalRequest = (value) => {
  if (!value || typeof value !== 'object') throw new Error('retrieval request must be an object');
  const record = value as Record<string, unknown>;
  const allowed = new Set(['query', 'indexHash']);
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`unknown retrieval request field: ${unknown}`);
  if (typeof record.query !== 'string' || !record.query.trim()
    || typeof record.indexHash !== 'string' || !/^[a-f0-9]{64}$/.test(record.indexHash)) {
    throw new Error('retrieval request requires query and indexHash');
  }
};

export type AmyHoodMemorySearchRecord = {
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

export type AmyHoodRetrievedArtifact = {
  id: string;
  kind: 'policy' | 'event';
  vectorScore: number;
  lexicalScore: number;
  fusedScore: number;
};

export type AmyHoodRetrievalTrace = {
  queryHash: string;
  indexHash: string;
  retrievalConfigHash: string;
  cacheKey: string;
  selectedArtifacts: AmyHoodRetrievedArtifact[];
  expandedArtifactIds: string[];
  evidenceIds: string[];
  sourceIds: string[];
  noMatch: boolean;
  noMatchReason: 'below_threshold' | null;
  contextTokens: number;
  tokenCounter: 'llama_server' | 'conservative_estimator';
  contextHash: string;
};

export type AmyHoodRetrievalResult = {
  query: string;
  matches: AmyHoodRetrievedArtifact[];
  trace: Omit<AmyHoodRetrievalTrace,
    'expandedArtifactIds' | 'evidenceIds' | 'sourceIds' |
    'contextTokens' | 'tokenCounter' | 'contextHash'>;
};

export type AmyHoodRenderedContext = {
  projection: 'policy' | 'full';
  text: string;
  trace: AmyHoodRetrievalTrace;
};

const isSha256 = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

export const assertAmyHoodHybridIndexManifest: (
  value: unknown,
) => asserts value is AmyHoodHybridIndexManifest = (value) => {
  if (!value || typeof value !== 'object') throw new Error('hybrid index manifest must be an object');
  const manifest = value as Record<string, unknown>;
  const config = manifest.retrievalConfig as Record<string, unknown> | undefined;
  const calibration = manifest.calibration as Record<string, unknown> | undefined;
  if (manifest.schemaVersion !== 1
    || manifest.embeddingModel !== 'bge-m3-Q8_0.gguf'
    || manifest.embeddingDimension !== 1024
    || manifest.builderVersion !== 'hybrid-v1'
    || manifest.lexicalVersion !== 'bm25-v1') {
    throw new Error('unsupported hybrid index identity');
  }
  for (const key of ['releaseManifestHash', 'holdoutManifestHash', 'retrievalConfigHash',
    'calibrationSetHash', 'vectorsHash', 'indexHash']) {
    if (!isSha256(manifest[key])) throw new Error(`invalid SHA-256 field: ${key}`);
  }
  if (!Array.isArray(manifest.recordHashes)
    || manifest.recordHashes.some((hash) => !isSha256(hash))
    || !Number.isInteger(manifest.recordCount)
    || manifest.recordCount !== manifest.recordHashes.length) {
    throw new Error('record count and hashes must agree');
  }
  if (!config
    || !['vectorWeight', 'lexicalWeight', 'bm25K', 'minimumScore']
      .every((key) => typeof config[key] === 'number' && Number.isFinite(config[key]))) {
    throw new Error('retrieval config must contain finite numbers');
  }
  if (!calibration
    || !['recallAt3', 'noMatchFalsePositiveRate']
      .every((key) => typeof calibration[key] === 'number'
        && Number.isFinite(calibration[key])
        && Number(calibration[key]) >= 0
        && Number(calibration[key]) <= 1)) {
    throw new Error('calibration metrics must be in [0, 1]');
  }
  if (manifest.vectorsFile !== 'vectors.f32'
    || typeof manifest.releaseId !== 'string'
    || !manifest.releaseId
    || typeof manifest.createdAt !== 'string'
    || Number.isNaN(Date.parse(manifest.createdAt))) {
    throw new Error('invalid hybrid index metadata');
  }
};
```

Add optional fields to historical-compatible Evaluation v3 types:

```ts
export type EvaluationV3RunAnswer = {
  // existing fields remain unchanged
  retrieval?: AmyHoodRetrievalTrace;
};

export type EvaluationV3Run = {
  // existing fields remain unchanged
  memoryIndexHash?: string | null;
  retrievalConfigHash?: string | null;
};
```

Update `advisorPaths()`:

```ts
memoryIndexes: path.resolve(advisorRoot, 'memory-indexes'),
activeMemoryIndex: path.resolve(advisorRoot, 'memory-indexes/active.json'),
retrievalCalibration: path.resolve(root, 'evaluation/retrieval/amy-hood-memory-dev-v1.json'),
```

- [ ] **Step 4: Run tests and type-check**

Run: `npx tsx --test tests/amyHoodRagContracts.test.ts && npm run lint`  
Expected: all contract tests PASS and `tsc --noEmit` exits 0.

- [ ] **Step 5: Commit**

```bash
git add shared/amyHoodRag.ts shared/amyHoodEvaluationV3.ts server/decisionAdvisor/paths.ts tests/amyHoodRagContracts.test.ts
git commit -m "feat: define Amy Hood hybrid RAG contracts"
```

---

### Task 2: Port 8081 embedding client

**Files:**
- Create: `server/decisionAdvisor/embeddingClient.ts`
- Create: `tests/amyHoodEmbeddingClient.test.ts`

**Interfaces:**
- Produces: `createBgeM3EmbeddingClient(options?)`.
- Produces methods: `preflight(): Promise<EmbeddingServiceIdentity>` and `embed(input: string[]): Promise<number[][]>`.
- Consumes environment defaults from Global Constraints.

Define the exported identity explicitly:

```ts
export type EmbeddingServiceIdentity = {
  model: string;
  dimension: 1024;
};
```

- [ ] **Step 1: Write the failing HTTP-contract test**

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - model discovery and embedding return one finite normalized 1024-vector per input.
 * 2. Edge Cases:
 *    - a single query is sent as a one-item input array.
 *    - Korean and English text remain unchanged in the request body.
 *    - a batch preserves input/output order.
 * 3. Failure Path:
 *    - timeout, wrong model, count mismatch, dimension mismatch, and NaN fail explicitly.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createBgeM3EmbeddingClient } from '../server/decisionAdvisor/embeddingClient';

const unit = Array.from({ length: 1024 }, (_, index) => index === 0 ? 1 : 0);

test('happy: validates model and embeds a batch', async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    if (String(input).endsWith('/models')) return Response.json({ data: [{ id: 'bge-m3-Q8_0.gguf' }] });
    return Response.json({ model: 'bge-m3-Q8_0.gguf', data: [{ embedding: unit }, { embedding: unit }] });
  };
  const client = createBgeM3EmbeddingClient({ fetchImpl });
  await client.preflight();
  assert.equal((await client.embed(['수요 기반 투자', 'capacity urgency'])).length, 2);
  assert.equal(JSON.parse(String(requests[1].init?.body)).input[0], '수요 기반 투자');
});
```

- [ ] **Step 2: Run the test and verify red**

Run: `npx tsx --test tests/amyHoodEmbeddingClient.test.ts`  
Expected: FAIL because `embeddingClient.ts` does not exist.

- [ ] **Step 3: Implement the minimal client**

Use native `fetch`, an `AbortController`, and strict validation:

```ts
const fetchWithTimeout = async (
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const assertEmbedding = (value: unknown, dimension: number) => {
  if (!Array.isArray(value) || value.length !== dimension
    || value.some((item) => typeof item !== 'number' || !Number.isFinite(item))) {
    throw new Error(`BGE-M3 embedding must contain ${dimension} finite numbers`);
  }
  const magnitude = Math.sqrt(value.reduce((sum, item) => sum + item * item, 0));
  if (!magnitude) throw new Error('BGE-M3 embedding magnitude must be positive');
  return value.map((item) => item / magnitude);
};

export const createBgeM3EmbeddingClient = (options: {
  baseUrl?: string;
  model?: string;
  dimension?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
} = {}) => {
  const baseUrl = options.baseUrl ?? process.env.BGE_M3_BASE_URL ?? 'http://127.0.0.1:8081/v1';
  const model = options.model ?? process.env.BGE_M3_MODEL ?? 'bge-m3-Q8_0.gguf';
  const dimension = options.dimension ?? 1024;
  const fetchImpl = options.fetchImpl ?? fetch;

  const embed = async (input: string[]) => {
    if (!input.length || input.some((text) => !text.trim())) throw new Error('embedding input must contain non-empty text');
    const response = await fetchWithTimeout(fetchImpl, `${baseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input }),
    }, options.timeoutMs ?? 30_000);
    const payload = await response.json() as { model?: string; data?: Array<{ embedding?: number[] }> };
    if (!response.ok || payload.model !== model || payload.data?.length !== input.length) {
      throw new Error('BGE-M3 embedding response does not match request');
    }
    return payload.data.map(({ embedding }) => assertEmbedding(embedding, dimension));
  };

  const preflight = async (): Promise<EmbeddingServiceIdentity> => {
    const response = await fetchImpl(`${baseUrl}/models`);
    const payload = await response.json() as { data?: Array<{ id?: string }> };
    if (!response.ok || !payload.data?.some(({ id }) => id === model)) {
      throw new Error(`BGE-M3 model is unavailable: ${model}`);
    }
    await embed(['embedding service preflight']);
    return { model, dimension: 1024 };
  };

  return { model, dimension, preflight, embed };
};
```

Normalize each accepted vector before return and reject zero magnitude, non-finite numbers, or length other than 1024.

- [ ] **Step 4: Run tests**

Run: `npx tsx --test tests/amyHoodEmbeddingClient.test.ts && npm run lint`  
Expected: all embedding tests PASS and type-check exits 0.

- [ ] **Step 5: Commit**

```bash
git add server/decisionAdvisor/embeddingClient.ts tests/amyHoodEmbeddingClient.test.ts
git commit -m "feat: add local BGE-M3 embedding client"
```

---

### Task 3: Evidence-grounded immutable index builder

**Files:**
- Create: `server/decisionAdvisor/memoryIndex.ts`
- Create: `tests/helpers/amyHoodRagFixture.ts`
- Create: `tests/amyHoodMemoryIndex.test.ts`

**Interfaces:**
- Consumes: `EmbeddingClient.embed()`, active release pointer, release manifest, policy/reflection/event artifacts, holdout manifest.
- Produces: `buildAmyHoodMemoryIndex(root, dependencies)`, `loadActiveAmyHoodMemoryIndex(root)`, and an atomic pointer `memory-indexes/active.json`.
- Produces on disk: `manifest.json`, `records.json`, and row-major normalized `vectors.f32`.

- [ ] **Step 1: Create a realistic approved-release fixture and failing builder tests**

The fixture must create one policy, one reflection, two supporting events, one contrasting event, six reviewed Amy Hood evidence spans, the release manifest, active pointer, source registry metadata, and a four-event holdout manifest copied from the repository.

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - an approved release builds four searchable records with six exact Amy Hood quotes and a verified vector file.
 * 2. Edge Cases:
 *    - rebuilding identical inputs reuses the same index hash.
 *    - nullable source URL remains null while title/date/type remain present.
 *    - duplicate evidence IDs across policy and reflection resolve once.
 * 3. Failure Path:
 *    - holdout leakage, unresolved evidence, empty quote, and embedding failure leave no partial index.
 */
test('happy: builds a source-grounded immutable index', async () => {
  const root = await writeAmyHoodRagFixture();
  const built = await buildAmyHoodMemoryIndex(root, {
    embeddingClient: fakeEmbeddingClient(1024),
    now: '2026-07-20T00:00:00.000Z',
  });
  assert.equal(built.manifest.recordCount, 4);
  assert.equal(built.records.flatMap(({ evidenceIds }) => evidenceIds).includes('span-capacity-2023-opex'), true);
  assert.match(built.records[0].searchableText, /disciplined profitability/);
  await verifyAmyHoodMemoryIndex(root, built.manifest.indexHash);
});
```

- [ ] **Step 2: Run the builder test and verify red**

Run: `npx tsx --test tests/amyHoodMemoryIndex.test.ts`  
Expected: FAIL because `buildAmyHoodMemoryIndex` is not defined.

- [ ] **Step 3: Implement release verification and evidence resolution**

Read only manifest-listed files. Build maps by stable ID and resolve evidence from `PilotDecisionEvent.evidenceSpans`:

```ts
const evidenceById = new Map(events.flatMap((event) =>
  event.evidenceSpans.map((span) => [span.id, { ...span, candidateId: event.candidateId }] as const)));

const resolveEvidence = (id: string) => {
  const span = evidenceById.get(id);
  if (!span || span.speaker !== 'Amy Hood' || !span.exactQuote.trim()) {
    throw new Error(`reviewed Amy Hood evidence is required: ${id}`);
  }
  if (events.some((event) => event.postOutcomeEvidenceIds.includes(id))) {
    throw new Error(`post-outcome evidence is forbidden in memory index: ${id}`);
  }
  return span;
};
```

Join `sourceId` to `source-registry.json` for source type, title, canonical URL, and publication metadata. Build policy and event records with complete semantic search text.

- [ ] **Step 4: Implement atomic index persistence and verification**

Write to `.staging-${randomUUID()}` under `memory-indexes/{releaseId}/`, validate every hash, then rename to `hybrid-v1`. On error, recursively remove staging. Hash deterministic content without `createdAt`; use the existing canonical JSON/hash patterns from `memoryReleaseStore.ts`.

The vector file writer must be explicit:

```ts
const buffer = Buffer.alloc(records.length * 1024 * Float32Array.BYTES_PER_ELEMENT);
vectors.forEach((vector, row) => vector.forEach((value, column) =>
  buffer.writeFloatLE(value, (row * 1024 + column) * 4)));
```

Activate `memory-indexes/active.json` only after `verifyAmyHoodMemoryIndex()` succeeds.

- [ ] **Step 5: Run builder and regression tests**

Run: `npx tsx --test tests/amyHoodMemoryIndex.test.ts tests/amyHoodEvaluationV3Holdout.test.ts && npm run lint`  
Expected: all tests PASS; no staging directory remains after injected failures.

- [ ] **Step 6: Commit**

```bash
git add server/decisionAdvisor/memoryIndex.ts tests/helpers/amyHoodRagFixture.ts tests/amyHoodMemoryIndex.test.ts
git commit -m "feat: build evidence-grounded Amy Hood memory index"
```

---

### Task 4: BM25 scoring, hybrid retrieval, calibration, and no-match gate

**Files:**
- Create: `server/decisionAdvisor/lexicalScorer.ts`
- Create: `server/decisionAdvisor/hybridRetriever.ts`
- Create: `evaluation/retrieval/amy-hood-memory-dev-v1.json`
- Create: `tests/amyHoodHybridRetriever.test.ts`

**Interfaces:**
- Consumes: verified index records/vectors and `EmbeddingClient.embed([query])`.
- Produces: `createAmyHoodHybridRetriever({ root, embeddingClient }).retrieve({ query, indexHash })`.
- Produces: `evaluateAmyHoodRetrievalCalibration(root, retriever)`.

- [ ] **Step 1: Write failing ranking and privacy tests**

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - an AI capacity question retrieves the approved capacity policy through dense and lexical evidence.
 * 2. Edge Cases:
 *    - an unrelated acquisition question returns no-match.
 *    - equal scores use stable artifact-ID ordering.
 *    - repeated normalized queries return the same cache key and result.
 * 3. Failure Path:
 *    - private evaluation fields, stale hashes, malformed vectors, and embedding timeout fail safely.
 */
test('happy: retrieves a policy from question text only', async () => {
  const retriever = await createFixtureRetriever();
  const result = await retriever.retrieve({
    query: '고객 수요가 확인됐지만 AI 설비투자로 원가가 증가할 때 어떤 비용을 통제해야 하나?',
    indexHash: retriever.indexHash,
  });
  assert.equal(result.matches[0].id, 'policy-c4203c075db61d3');
  assert.equal(result.trace.noMatch, false);
});

test('failure: evaluation-private fields never enter retrieval', async () => {
  const retriever = await createFixtureRetriever();
  await assert.rejects(
    () => retriever.retrieve({
      query: '질문',
      indexHash: retriever.indexHash,
      correctIntent: '정답 의도',
    } as never),
    /unknown retrieval request field: correctIntent/,
  );
});
```

- [ ] **Step 2: Run the retrieval test and verify red**

Run: `npx tsx --test tests/amyHoodHybridRetriever.test.ts`  
Expected: FAIL because the scorer and retriever modules do not exist.

- [ ] **Step 3: Implement deterministic BM25 and score normalization**

Use a versioned Unicode tokenizer and standard BM25 with `k1=1.2`, `b=0.75`. Convert scores as specified:

```ts
const normalizedVector = (cosine: number) => (Math.max(-1, Math.min(1, cosine)) + 1) / 2;
const normalizedLexical = (bm25: number, saturation: number) =>
  bm25 <= 0 ? 0 : bm25 / (bm25 + saturation);
const fused = config.vectorWeight * normalizedVector(cosine)
  + config.lexicalWeight * normalizedLexical(bm25, config.bm25K);
```

Rank dense Top-20 and lexical Top-20, union by ID, collapse event records to their `policyId`, retain maximum component provenance, apply `minimumScore`, return at most two policy roots, and tie-break by ID.

- [ ] **Step 4: Add the non-holdout calibration dataset and evaluator**

Create `evaluation/retrieval/amy-hood-memory-dev-v1.json` with this exact non-holdout development set. These sentences are independent retrieval probes, not copied Evaluation v3 questions:

```json
{
  "dataset": "amy_hood_memory_retrieval_dev",
  "version": "1.0.0",
  "probes": [
    {
      "id": "capacity-demand-cost",
      "query": "생성형 AI 고객 사용량이 빠르게 늘 때 데이터센터 자본투자와 운영비 증가를 어떤 순서로 통제해야 하는가?",
      "expectedArtifactIds": ["policy-c4203c075db61d3"],
      "expectNoMatch": false
    },
    {
      "id": "capacity-external-supply",
      "query": "자체 클라우드 설비의 구축 시간이 수요 증가를 따라가지 못하면 외부 용량을 함께 조달해야 하는가?",
      "expectedArtifactIds": ["policy-c4203c075db61d3"],
      "expectNoMatch": false
    },
    {
      "id": "capacity-margin-pressure",
      "query": "AI 인프라 원가가 매출총이익률을 압박하는 상황에서 성장 투자를 유지하면서 비용 규율을 지키는 방법은 무엇인가?",
      "expectedArtifactIds": ["policy-c4203c075db61d3"],
      "expectNoMatch": false
    },
    {
      "id": "capacity-platform-shift",
      "query": "새로운 컴퓨팅 플랫폼 전환기에 인프라는 확대하되 전 조직의 인력과 경비도 같은 속도로 늘려야 하는가?",
      "expectedArtifactIds": ["policy-c4203c075db61d3"],
      "expectNoMatch": false
    },
    {
      "id": "no-match-acquisition",
      "query": "대형 소프트웨어 기업을 현금으로 인수할 때 부채와 주식 중 어떤 조달 수단을 선택해야 하는가?",
      "expectedArtifactIds": [],
      "expectNoMatch": true
    },
    {
      "id": "no-match-buyback",
      "query": "자사주 매입 권한과 실제 분기별 집행 속도를 어떻게 구분해야 하는가?",
      "expectedArtifactIds": [],
      "expectNoMatch": true
    }
  ]
}
```

The validator must require:

```ts
if (metrics.recallAt3 < 0.80) throw new Error('retrieval Recall@3 gate failed');
if (metrics.noMatchFalsePositiveRate > 0.20) {
  throw new Error('retrieval no-match false-positive gate failed');
}
```

Start with `{ vectorWeight: 0.7, lexicalWeight: 0.3, bm25K: 4, minimumScore: 0.55 }`. If the development gate fails, change only the committed calibration config and document the measured metrics; do not inspect Evaluation v3 answers.

- [ ] **Step 5: Run retrieval tests and calibration fixture tests**

Run: `npx tsx --test tests/amyHoodHybridRetriever.test.ts && npm run lint`  
Expected: tests PASS, including `Recall@3 >= 0.80` and false-positive rate `<= 0.20` with fake deterministic embeddings.

- [ ] **Step 6: Commit**

```bash
git add server/decisionAdvisor/lexicalScorer.ts server/decisionAdvisor/hybridRetriever.ts evaluation/retrieval/amy-hood-memory-dev-v1.json tests/amyHoodHybridRetriever.test.ts
git commit -m "feat: retrieve Amy Hood memory with calibrated hybrid search"
```

---

### Task 5: Linked evidence expansion and bounded context rendering

**Files:**
- Create: `server/decisionAdvisor/ragContext.ts`
- Create: `tests/amyHoodRagContext.test.ts`

**Interfaces:**
- Consumes: `AmyHoodRetrievalResult`, verified index, release artifacts, projection `'policy' | 'full'`.
- Produces: `buildAmyHoodRagContext({ root, retrieval, projection, tokenCounter })` returning `AmyHoodRenderedContext`.

- [ ] **Step 1: Write failing context tests**

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - a policy result renders applicability, action, event context, an exact Amy Hood quote, and source metadata.
 * 2. Edge Cases:
 *    - no-match renders an explicit empty-memory marker.
 *    - a tight budget drops the lowest-value whole bundle without truncating a quote.
 *    - duplicate evidence reached through policy/reflection/event is rendered once.
 * 3. Failure Path:
 *    - a linked artifact outside the release, holdout text, or request above 12,000 tokens fails safely.
 */
test('happy: policy projection includes real evidence text', async () => {
  const context = await buildFixtureContext('policy');
  assert.match(context.text, /Recommended action:/);
  assert.match(context.text, /We expect capital expenditures to have a material sequential increase/);
  assert.match(context.text, /Published: 2023-04-25/);
  assert.equal(context.trace.evidenceIds.includes('span-capacity-2023-ai-capex'), true);
});
```

- [ ] **Step 2: Run context tests and verify red**

Run: `npx tsx --test tests/amyHoodRagContext.test.ts`  
Expected: FAIL because `ragContext.ts` does not exist.

- [ ] **Step 3: Implement deterministic expansion and projections**

Load complete selected policies, their approved reflections, up to two supporting events, one contrasting event, and two evidence spans per included event. Policy projection renders the policy, minimum supporting-event summary, and quotes. Full projection additionally renders decision axis, reflection, supporting-event details, contrast, condition delta, and action delta.

Use stable section labels and IDs:

```ts
const renderEvidence = (span: IndexedEvidence) => [
  'Amy Hood evidence',
  `- Quote: "${span.exactQuote}"`,
  `- Source: ${span.sourceTitle}`,
  `- Type: ${span.sourceType}`,
  `- Published: ${span.publishedAt}`,
  `- Source ID: ${span.sourceId}`,
].join('\n');
```

- [ ] **Step 4: Implement token budgeting without mid-object truncation**

Try `POST http://127.0.0.1:8080/tokenize` through an injected token counter. If unavailable, use a deterministic conservative estimator and record it:

```ts
export const conservativeTokenEstimate = (text: string) =>
  Math.ceil(Buffer.byteLength(text, 'utf8') / 3);
```

Construct whole bundles in descending retrieval score. Stop before RAG context exceeds 6,000 tokens or projected system+user input exceeds 12,000. Never slice a quote or serialized object.

- [ ] **Step 5: Run context and holdout tests**

Run: `npx tsx --test tests/amyHoodRagContext.test.ts tests/amyHoodEvaluationV3Holdout.test.ts && npm run lint`  
Expected: tests PASS; all rendered contexts contain no sealed reference.

- [ ] **Step 6: Commit**

```bash
git add server/decisionAdvisor/ragContext.ts tests/amyHoodRagContext.test.ts
git commit -m "feat: render bounded Amy Hood evidence context"
```

---

### Task 6: Shared Advisor runtime and real chat integration

**Files:**
- Create: `server/decisionAdvisor/advisorRuntime.ts`
- Create: `tests/amyHoodAdvisorRuntime.test.ts`
- Modify: `server/index.ts:1242-1363`
- Modify: `src/components/PersonaDetailModal.tsx:55-90`

**Interfaces:**
- Consumes: active prompt, common retriever, context assembler, `ModelClient`.
- Produces: `createAmyHoodAdvisorRuntime({ root, createModel, retriever }).answer(input)`.
- Produces endpoint: `POST /api/b-track/amy-hood/advisor/chat`.
- Keeps `/api/agent/persona-chat` unchanged for non-Amy personas.

- [ ] **Step 1: Write failing shared-runtime tests**

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - a free-form Advisor question retrieves memory, injects a quote, and returns a Korean CFO answer.
 * 2. Edge Cases:
 *    - a semantic no-match uses the active Master Prompt without evidence.
 *    - recent conversation is included without entering the retrieval query.
 *    - a source URL remains internal and is omitted from the user reply.
 * 3. Failure Path:
 *    - embedding/index failure produces prompt-only fallback with an internal error code and no corrupted state.
 */
test('happy: actual Advisor uses the common retriever', async () => {
  const observed: string[] = [];
  const runtime = createFixtureAdvisorRuntime({ observed });
  const result = await runtime.answer({
    message: 'AI 인프라를 늘리면서 비용을 어떻게 통제해야 할까요?',
    recentMessages: [],
  });
  assert.deepEqual(observed, ['AI 인프라를 늘리면서 비용을 어떻게 통제해야 할까요?']);
  assert.equal(result.ragFallback, false);
  assert.match(result.modelInput.user, /Amy Hood evidence/);
  assert.doesNotMatch(result.reply, /https?:\/\//);
});
```

- [ ] **Step 2: Run Advisor tests and verify red**

Run: `npx tsx --test tests/amyHoodAdvisorRuntime.test.ts`  
Expected: FAIL because `advisorRuntime.ts` does not exist.

- [ ] **Step 3: Implement the shared runtime**

Retrieve with the current message only, then assemble full context. Recent messages belong in the answer prompt but never in the retrieval request:

```ts
const activeIndex = await loadActiveAmyHoodMemoryIndex(root);
const retrieval = await retriever.retrieve({
  query: input.message,
  indexHash: activeIndex.manifest.indexHash,
});
const memory = await buildAmyHoodRagContext({ root, retrieval, projection: 'full', tokenCounter });
const modelInput = {
  system: activePrompt.content,
  user: `${memory.text}\n\nRecent conversation:\n${renderRecent(input.recentMessages)}\n\nUser question:\n${input.message}`,
};
```

Return `{ reply, retrieval: memory.trace, ragFallback, fallbackCode, modelInput }` internally. The route response exposes `reply`, `chatSessionId`, `ragFallback`, and `noMatch`; it does not expose quotes or source URLs.

On dependency failure, call E4B with the active prompt and no memory context. Record one of `embedding_unavailable`, `index_stale`, `index_corrupt`, or `retrieval_error`.

- [ ] **Step 4: Add the dedicated route and UI routing**

Add `/api/b-track/amy-hood/advisor/chat` before the generic route. In `PersonaDetailModal`, select it only when `persona.name.trim().toLocaleLowerCase('en-US') === 'amy hood'`; every other persona continues to use `/api/agent/persona-chat`.

Do not render evidence links. Preserve the existing fixed unofficial-simulation UI notice.

- [ ] **Step 5: Run Advisor, UI, type, and build tests**

Run: `npx tsx --test tests/amyHoodAdvisorRuntime.test.ts tests/trackNavigation.test.ts && npm run lint && npm run build`  
Expected: all tests PASS and production build exits 0.

- [ ] **Step 6: Commit**

```bash
git add server/decisionAdvisor/advisorRuntime.ts tests/amyHoodAdvisorRuntime.test.ts server/index.ts src/components/PersonaDetailModal.tsx
git commit -m "feat: use hybrid memory in Amy Hood advisor chat"
```

---

### Task 7: Evaluation v3 dynamic retrieval cache and trace integration

**Files:**
- Create: `server/evaluationV3/retrievalCache.ts`
- Modify: `server/evaluationV3/context.ts`
- Modify: `server/evaluationV3/prompt.ts`
- Modify: `server/evaluationV3/runner.ts`
- Modify: `server/evaluationV3/routes.ts`
- Create: `server/runAmyHoodEvaluationV3.ts`
- Modify: `tests/amyHoodEvaluationV3Prompt.test.ts`
- Modify: `tests/amyHoodEvaluationV3Runner.test.ts`
- Modify: `tests/amyHoodEvaluationV3Routes.test.ts`

**Interfaces:**
- Produces: `readOrCreateEvaluationRetrieval({ root, experimentGroupId, query, indexHash, retriever })`.
- Replaces static `EvaluationV3ContextPackage` input with per-question `AmyHoodRenderedContext | null`.
- Pins `memoryIndexHash` and `retrievalConfigHash` in RAG runs.

- [ ] **Step 1: Rewrite prompt tests first and verify red**

Change the happy test so a policy context contains an actual quote and trace. Keep exactly three edge categories in the Test Plan: fenced response, Korean reason, and no-RAG empty context. Add failures for private fields and invalid RAG trace.

```ts
const retrieved: AmyHoodRenderedContext = {
  projection: 'policy',
  text: '[Retrieved Memory 1]\nAmy Hood evidence\n- Quote: "Customer demand will guide our investment."',
  trace: validTrace,
};
const input = buildEvaluationV3Input('SYSTEM', question, retrieved, 'amy_policy_rag');
assert.match(input.user, /Customer demand will guide our investment/);
assert.doesNotMatch(input.user, /correctChoice|correctIntent|questionId/);
```

Run: `npx tsx --test tests/amyHoodEvaluationV3Prompt.test.ts`  
Expected: FAIL because the old prompt API expects `EvaluationV3ContextPackage`.

- [ ] **Step 2: Write runner/cache tests before implementation**

Update the runner Test Plan while retaining one happy path, exactly three existing edge cases, and failure paths. The happy path must assert 60 retrieval-consuming calls are backed by only 30 cache creations:

```ts
assert.equal(retrievalCalls.length, 30);
assert.equal(completed[2].answers.every(({ retrieval }) => Boolean(retrieval)), true);
assert.deepEqual(
  completed[2].answers.map(({ retrieval }) => retrieval?.cacheKey),
  completed[3].answers.map(({ retrieval }) => retrieval?.cacheKey),
);
assert.equal(retrievalCalls.some((query) => /D01|correctIntent|correctChoice/.test(query)), false);
```

Failure assertions must cover stale index, embedding failure, corrupt cache, and no silent prompt-only downgrade.

- [ ] **Step 3: Implement atomic persisted retrieval cache**

Use:

```text
evaluation/v3/retrieval-cache/{experimentGroupId}/{queryHash}.json
```

The cache payload stores normalized query, query hash, index/config hashes, ranked result, and context-independent selected roots. Write with a same-directory temporary file and rename. On read, verify every hash and the expected normalized query.

- [ ] **Step 4: Replace static Evaluation v3 context resolution**

`context.ts` becomes an index-pin resolver for RAG arms. No-RAG arms still work without a release/index. RAG arms verify active release and active index and return:

```ts
type EvaluationV3RagPin = {
  memoryReleaseId: string;
  memoryReleaseHash: string;
  memoryIndexHash: string;
  retrievalConfigHash: string;
};
```

Remove static policy/reflection/event arrays from new execution paths, but retain a compatibility reader if historical tests or stored runs require it.

- [ ] **Step 5: Retrieve per question and project from one cached result**

Inject the retriever into `createEvaluationV3Runner` so tests never call port 8081. During a RAG answer:

```ts
const ranked = await readOrCreateEvaluationRetrieval({
  root: options.root,
  experimentGroupId: run.experimentGroupId,
  query: question.prompt,
  indexHash: run.memoryIndexHash!,
  retriever: options.retriever,
});
const projection = run.arm === 'amy_policy_rag' ? 'policy' : 'full';
const context = await options.buildContext({ retrieval: ranked, projection });
const input = buildEvaluationV3Input(systemPrompt, question, context, run.arm);
```

Store `context.trace` on `EvaluationV3RunAnswer`. A valid no-match remains complete. A dependency/integrity error records a failed answer and makes the run incomplete.

- [ ] **Step 6: Update readiness and routes**

`structuredMemoryAvailable` becomes true only when active release, active hybrid index, matching hashes, and port 8081 preflight pass. Return an additional internal readiness reason without exposing answer keys.

- [ ] **Step 7: Add a checked-in live Evaluation v3 runner**

Create `server/runAmyHoodEvaluationV3.ts` so real runs do not depend on ad-hoc `tsx -e` commands:

```ts
import { createEvaluationV3RouteDependencies } from './evaluationV3/routes';

const main = async () => {
  const repetitions = process.argv.includes('--repetitions=5') ? 5 : 1;
  const runner = createEvaluationV3RouteDependencies(process.cwd()).runner;
  const launch = await runner.createExperiment({ repetitions });
  console.log(JSON.stringify({
    event: 'EXPERIMENT_CREATED',
    experimentGroupId: launch.experimentGroupId,
    runs: launch.runs.map(({ runId, arm, model }) => ({ runId, arm, model })),
  }));
  const completed = await runner.executeExperiment(launch.runs.map(({ runId }) => runId));
  console.log(JSON.stringify({
    event: 'EXPERIMENT_COMPLETED',
    experimentGroupId: launch.experimentGroupId,
    runs: completed.map(({ runId, arm, status, scores }) => ({ runId, arm, status, scores })),
  }));
};

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
```

- [ ] **Step 8: Run Evaluation v3 suites**

Run: `npm run evaluation:v3:test && npm run lint`  
Expected: all Evaluation v3 tests PASS; the mock one-repetition runner makes 120 model calls, 30 retrieval calls, and records 60 traces.

- [ ] **Step 9: Commit**

```bash
git add shared/amyHoodEvaluationV3.ts server/evaluationV3/context.ts server/evaluationV3/prompt.ts server/evaluationV3/retrievalCache.ts server/evaluationV3/runner.ts server/evaluationV3/routes.ts server/runAmyHoodEvaluationV3.ts tests/amyHoodEvaluationV3Prompt.test.ts tests/amyHoodEvaluationV3Runner.test.ts tests/amyHoodEvaluationV3Routes.test.ts
git commit -m "feat: evaluate query-dependent Amy Hood RAG"
```

---

### Task 8: Index CLI, live calibration, and first active index

**Files:**
- Create: `server/runAmyHoodMemoryIndex.ts`
- Modify: `package.json`
- Generate: `data/b-track/amy-hood/advisor/memory-indexes/v1-262d69135ca0/hybrid-v1/manifest.json`
- Generate: `data/b-track/amy-hood/advisor/memory-indexes/v1-262d69135ca0/hybrid-v1/records.json`
- Generate: `data/b-track/amy-hood/advisor/memory-indexes/v1-262d69135ca0/hybrid-v1/vectors.f32`
- Generate: `data/b-track/amy-hood/advisor/memory-indexes/active.json`

**Interfaces:**
- Produces commands: `advisor:index:build`, `advisor:index:check`, `advisor:index:test`.
- Consumes the live 8081 service only during build/check commands, not unit tests.

- [ ] **Step 1: Add CLI contract tests to the memory-index test file**

Add these tests to `tests/amyHoodMemoryIndex.test.ts`; export `runAmyHoodMemoryIndexCommand(args, dependencies)` from the CLI module so unit tests do not spawn a process or call port 8081:

```ts
test('happy: build performs preflight and activates only a verified index', async () => {
  const root = await writeAmyHoodRagFixture();
  const calls: string[] = [];
  await runAmyHoodMemoryIndexCommand(['build'], cliFixture({ root, calls }));
  assert.deepEqual(calls.slice(0, 3), ['preflight', 'build', 'calibrate']);
  const pointer = JSON.parse(await readFile(advisorPaths(root).activeMemoryIndex, 'utf8'));
  assert.equal(pointer.indexHash.length, 64);
});

test('edge: check verifies the active index without mutating its pointer', async () => {
  const fixture = await builtCliFixture();
  const pointerPath = advisorPaths(fixture.root).activeMemoryIndex;
  const before = await readFile(pointerPath, 'utf8');
  await runAmyHoodMemoryIndexCommand(['check'], fixture.dependencies);
  assert.equal(await readFile(pointerPath, 'utf8'), before);
});

test('edge: repeated build preserves the deterministic index hash', async () => {
  const fixture = await builtCliFixture();
  const first = await loadActiveAmyHoodMemoryIndex(fixture.root);
  await runAmyHoodMemoryIndexCommand(['build'], fixture.dependencies);
  const second = await loadActiveAmyHoodMemoryIndex(fixture.root);
  assert.equal(second.manifest.indexHash, first.manifest.indexHash);
});

test('edge: check accepts reviewed source metadata with a null URL', async () => {
  const fixture = await builtCliFixture({ nullableSourceUrl: true });
  await assert.doesNotReject(runAmyHoodMemoryIndexCommand(['check'], fixture.dependencies));
});

test('failure: unknown command and failed calibration do not replace active.json', async () => {
  const fixture = await builtCliFixture();
  const pointerPath = advisorPaths(fixture.root).activeMemoryIndex;
  const before = await readFile(pointerPath, 'utf8');
  await assert.rejects(
    runAmyHoodMemoryIndexCommand(['publish'], fixture.dependencies),
    /expected build or check/,
  );
  await assert.rejects(
    runAmyHoodMemoryIndexCommand(['build'], cliFixture({
      root: fixture.root,
      calibration: { recallAt3: 0.5, noMatchFalsePositiveRate: 0.5 },
    })),
    /retrieval .* gate failed/,
  );
  assert.equal(await readFile(pointerPath, 'utf8'), before);
});
```

- [ ] **Step 2: Implement the CLI and scripts**

Add scripts:

```json
{
  "advisor:index:test": "tsx --test tests/amyHoodRagContracts.test.ts tests/amyHoodEmbeddingClient.test.ts tests/amyHoodMemoryIndex.test.ts tests/amyHoodHybridRetriever.test.ts tests/amyHoodRagContext.test.ts tests/amyHoodAdvisorRuntime.test.ts",
  "advisor:index:build": "tsx server/runAmyHoodMemoryIndex.ts build",
  "advisor:index:check": "tsx server/runAmyHoodMemoryIndex.ts check",
  "evaluation:v3:run:local": "tsx server/runAmyHoodEvaluationV3.ts"
}
```

`build` performs: 8081 preflight → release verification → holdout scan → record embedding → index verification → live calibration → atomic active-pointer update. `check` performs all read-only verification and calibration queries without writing timestamps.

- [ ] **Step 3: Verify both services before real artifact generation**

Run:

```bash
curl -fsS http://127.0.0.1:8081/health
curl -fsS http://127.0.0.1:8081/v1/models
curl -fsS http://127.0.0.1:8080/v1/models
```

Expected: 8081 reports `status=ok` and `bge-m3-Q8_0.gguf`; 8080 reports `Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf`.

- [ ] **Step 4: Build and inspect the first real index**

Run:

```bash
BGE_M3_BASE_URL=http://127.0.0.1:8081/v1 \
BGE_M3_MODEL=bge-m3-Q8_0.gguf \
npm run advisor:index:build
```

Expected for the current release: one policy root, three event records, six unique reviewed evidence spans, four normalized 1024-dimensional vectors, passing holdout scan, and a new active index pointer. If actual verified counts differ, stop and inspect the release; do not weaken the assertions.

- [ ] **Step 5: Run the real read-only quality check**

Run:

```bash
BGE_M3_BASE_URL=http://127.0.0.1:8081/v1 \
BGE_M3_MODEL=bge-m3-Q8_0.gguf \
npm run advisor:index:check
```

Expected: Recall@3 >= 0.80, no-match false-positive rate <= 0.20, all hashes valid, zero holdout leaks.

- [ ] **Step 6: Run index tests and commit generated artifacts**

Run: `npm run advisor:index:test && npm run lint && git diff --check`  
Expected: all tests PASS and no whitespace errors.

```bash
git add server/runAmyHoodMemoryIndex.ts package.json evaluation/retrieval/amy-hood-memory-dev-v1.json data/b-track/amy-hood/advisor/memory-indexes
git commit -m "data: activate first query-dependent Amy Hood memory index"
```

---

### Task 9: End-to-end verification, smoke evaluation, and corrected report

**Files:**
- Modify: `docs/reports/2026-07-20-amy-hood-evaluation-v3-first-live-run.html`
- Modify: `docs/reports/2026-07-20-amy-hood-evaluation-v3-e4b-model-comparison.html`
- Create after successful run: `docs/reports/2026-07-20-amy-hood-evaluation-v3-query-dependent-rag-report.html`
- Generate after successful run: four new files under `evaluation/v3/runs/`

**Interfaces:**
- Consumes: active verified index, 8081 embeddings, 8080 E4B generation, Evaluation v3 dynamic runner.
- Produces: one reproducible 30-question × four-arm smoke experiment and a developer report.

- [ ] **Step 1: Label prior reports accurately before rerunning**

Add a visible correction banner to both prior reports:

```text
Historical implementation note: the RAG-labeled conditions in this report used static release-context injection. They did not perform query-dependent retrieval and did not give Gemma 4 memory tools. These runs remain static-context ablation baselines.
```

Do not change historical scores or run JSON.

- [ ] **Step 2: Run the full automated verification gate**

Run:

```bash
npm run advisor:index:test
npm run advisor:policy-memory:test
npm run evaluation:v3:test
npm run evaluation:test
npm run lint
npm run build
git diff --check
```

Expected: every test command has zero failures, type-check exits 0, Vite build exits 0, and diff check is clean.

- [ ] **Step 3: Inspect retrieval without invoking Gemma 4**

For every Evaluation v3 public question, run retrieval with `question.prompt` only and save a temporary audit summary containing question ID outside the retriever boundary. Verify:

- RAG trace query hashes correspond to prompt text only.
- M&A/shareholder-return questions may validly produce no-match with the current one-policy index.
- AI CapEx matches contain actual quotes and not just evidence IDs.
- no rendered context exceeds 6,000 tokens.
- no sealed identifiers appear.

If the retrieval gate fails, stop before model evaluation and report the exact failed query and rule.

- [ ] **Step 4: Run one E4B four-arm smoke experiment**

Use the same direct runner entry point as prior live experiments with:

```bash
BGE_M3_BASE_URL=http://127.0.0.1:8081/v1 \
BGE_M3_MODEL=bge-m3-Q8_0.gguf \
LOCAL_LLM_BASE_URL=http://127.0.0.1:8080/v1 \
LOCAL_LLM_MODEL=Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf \
npm run evaluation:v3:run:local -- --repetitions=1
```

Expected: four complete runs, 120 complete answers, zero parse failures, 30 persisted retrieval-cache records, 60 RAG traces, matching cache keys between policy/full arms, and no context/hash mismatch.

- [ ] **Step 5: Write the new developer report from actual run JSON**

Include:

- four-arm total and category scores;
- dynamic RAG lift and model-input token cost;
- retrieval hit/no-match counts by evaluation category;
- selected-policy frequency and score distribution;
- evidence-quote inclusion rate;
- cache reuse and hash verification;
- before/after versus the two static-context experiments;
- hypotheses, evidence, limitations, benchmark-rejection status, and final go/no-go;
- one full sanitized input example showing actual quote text and retrieval scores.

Do not claim Amy Hood replication from one repetition or from a benchmark whose generic CFO arm exceeds 80%.

- [ ] **Step 6: Verify report values and HTML**

Parse the four run JSON files and assert every displayed score, token total, run ID, index hash, hit count, and context count. Parse the HTML with `parse5` and require zero parse errors.

- [ ] **Step 7: Commit final evidence**

```bash
git add docs/reports evaluation/v3/runs evaluation/v3/retrieval-cache
git commit -m "test: evaluate query-dependent Amy Hood hybrid RAG"
```

---

## Final Verification Checklist

- [ ] `git status --short --branch` shows only intended files before each commit and is clean at handoff.
- [ ] Port 8081 identity is `bge-m3-Q8_0.gguf`, dimension 1024.
- [ ] Port 8080 identity is the configured E4B model.
- [ ] Index contains actual reviewed Amy Hood quotes and source metadata.
- [ ] Retrieval request type physically cannot accept Evaluation v3 private fields.
- [ ] Retrieval quality gate passes before Gemma 4 runs.
- [ ] Advisor and Evaluation v3 share the same retriever implementation.
- [ ] Policy and Full RAG share persisted query results.
- [ ] Semantic no-match is distinct from infrastructure fallback.
- [ ] Holdout and stale-hash failures are fail-closed.
- [ ] All automated tests, type-check, build, and HTML verification pass.
