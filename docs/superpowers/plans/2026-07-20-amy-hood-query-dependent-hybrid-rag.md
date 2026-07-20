# Amy Hood Query-Dependent Hybrid RAG Remaining Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the already-started Hybrid RAG by measuring retrieval quality, finishing linked-memory rendering, connecting the Advisor and Evaluation v3 to the shared engine, and producing one real 30-question × four-arm E4B report.

**Architecture:** Preserve the checked-in BGE-M3 index, hybrid ranker, and context renderer as the only retrieval implementation. Complete their explicitly documented gaps, then inject the same retriever into Advisor and Evaluation v3; Evaluation persists one ranked result per public question and reuses it across Policy and Full projections before calling E4B.

**Tech Stack:** TypeScript 5.8, Node.js 22, Express, React, `tsx --test`, local llama.cpp BGE-M3 embeddings on port 8081, local llama.cpp E4B chat completions on port 8080, JSON/F32 immutable artifacts.

## Global Constraints

- Work on branch `codex/amy-hood-first-policy-release`; do not create another worktree or branch.
- Embedding service is `BGE_M3_BASE_URL=http://127.0.0.1:8081/v1`, model `bge-m3-Q8_0.gguf`, dimension `1024`.
- Generation service is `LOCAL_LLM_BASE_URL=http://127.0.0.1:8080/v1`, model `Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf`.
- Gemma 4 receives rendered memory text only and receives no tool calling.
- Retrieval accepts normalized question text only; IDs, options, answer keys, intents, categories, domain labels, and holdout annotations are forbidden.
- Policy and Full RAG reuse one persisted ranked result for the same experiment group and question.
- RAG context is at most 6,000 tokens and the complete model request is at most 12,000 tokens within the 16,384-token server context.
- Advisor may explicitly fall back to prompt-only; Evaluation v3 must become incomplete on RAG infrastructure or integrity failure.
- Historical Evaluation v3 JSON remains readable and historical static-context scores are never relabeled as dynamic RAG.
- Follow repository TDD rules: one happy path, exactly three realistic edge cases by default, plus safe failure-path tests.

---

## Frozen Completed Baseline — Do Not Reimplement

The following code is complete and covered by 27 passing RAG tests. Import and
extend it only where a failing test in this plan exposes a named gap.

| State | Unit | Files | Commits |
|---|---|---|---|
| Complete | Shared RAG contracts and paths | `shared/amyHoodRag.ts`, `server/decisionAdvisor/paths.ts` | `562d572` |
| Complete | BGE-M3 client, 512-token-safe chunking, mean pooling | `server/decisionAdvisor/embeddingClient.ts` | `5cb93cd`, `b435f93` |
| Complete | Approved-release evidence resolution, immutable JSON/F32 index, hashes | `server/decisionAdvisor/memoryIndex.ts` | `f1290d3` |
| Complete | Unicode BM25, dense fusion, policy-root collapse, no-match | `server/decisionAdvisor/lexicalScorer.ts`, `server/decisionAdvisor/hybridRetriever.ts` | `b9eb0d1` |
| Partial | Evidence renderer: real quotes, source metadata, dedupe, 6K cap | `server/decisionAdvisor/ragContext.ts` | `a3cb95e` |
| Partial | Index CLI and active index | `server/runAmyHoodMemoryIndex.ts`, `memory-indexes/` | `b435f93` |

The active index at plan-writing time is
`8139f1dcda7813c367df7d8fd90a5507e8401e0bb0971e5df51b7c8e03ba96df`.
Its vectors and evidence are valid, but its manifest calibration values are
provisional defaults rather than measurements. It is not comparison-ready.

## Remaining File Map

### Existing files to modify

- `server/decisionAdvisor/hybridRetriever.ts` — expose pure ranking and measured development-set calibration.
- `server/decisionAdvisor/memoryIndex.ts` — remove provisional metrics and separate candidate persistence from activation.
- `server/decisionAdvisor/ragContext.ts` — load reflection/events/contrast and enforce complete-request budget.
- `server/runAmyHoodMemoryIndex.ts` — calibrate before atomic activation.
- `server/index.ts` — add the dedicated Amy Hood Advisor route before the generic route.
- `src/components/PersonaDetailModal.tsx` — use the dedicated route for Amy Hood only.
- `server/evaluationV3/context.ts` — resolve an active release/index pin instead of static arrays for new runs.
- `server/evaluationV3/prompt.ts` — accept a per-question rendered context.
- `server/evaluationV3/runner.ts` — retrieve/cache/render per question and persist traces.
- `server/evaluationV3/routes.ts` — dynamic-index readiness.
- `shared/amyHoodEvaluationV3.ts` — retrieval failure code and optional pins/traces while preserving old JSON.
- `package.json` — local Evaluation v3 command.

### New files

- `server/decisionAdvisor/advisorRuntime.ts` — shared Advisor orchestration and explicit fallback.
- `server/evaluationV3/retrievalCache.ts` — atomic query-result cache shared by RAG arms.
- `server/runAmyHoodEvaluationV3.ts` — reproducible one/five-repetition local runner.
- `tests/amyHoodAdvisorRuntime.test.ts` — Advisor retrieval/fallback contract.
- `tests/amyHoodEvaluationV3RetrievalCache.test.ts` — persisted cache integrity and fairness.
- `docs/reports/2026-07-20-amy-hood-evaluation-v3-query-dependent-rag-report.html` — generated only after a successful live run.

---

### Task 1: Replace Provisional Calibration With a Measured Activation Gate

**Files:**
- Modify: `server/decisionAdvisor/hybridRetriever.ts`
- Modify: `server/decisionAdvisor/memoryIndex.ts`
- Modify: `server/runAmyHoodMemoryIndex.ts`
- Modify: `tests/amyHoodHybridRetriever.test.ts`
- Modify: `tests/amyHoodMemoryIndex.test.ts`
- Modify: `package.json`
- Regenerate: `data/b-track/amy-hood/advisor/memory-indexes/`

**Interfaces:**
- Produces `rankAmyHoodMemory(index, query, queryVector): AmyHoodRetrievalResult`.
- Produces `prepareAmyHoodMemoryIndexCandidate(root, { embeddingClient }): Promise<AmyHoodMemoryIndexCandidate>`.
- Produces `evaluateAmyHoodRetrievalCalibration({ root, candidate, embeddingClient }): Promise<RetrievalCalibrationMetrics>`.
- Produces `activateAmyHoodMemoryIndex(root, indexHash, activatedAt?)`.
- Changes `buildAmyHoodMemoryIndex()` to build an in-memory candidate, call an injected calibration evaluator, persist the final measured manifest, and leave `active.json` unchanged.

Use these exact boundaries:

```ts
export type AmyHoodMemoryIndexCandidate = Omit<LoadedAmyHoodMemoryIndex, 'directory' | 'manifest'> & {
  manifestBase: Omit<AmyHoodHybridIndexManifest, 'calibration' | 'indexHash' | 'createdAt'>;
};

export type MemoryIndexBuildOptions = {
  embeddingClient: EmbeddingClient;
  evaluateCalibration(
    candidate: AmyHoodMemoryIndexCandidate,
  ): Promise<RetrievalCalibrationMetrics>;
  now?: string;
};
```

- [ ] **Step 1: Write failing calibration and activation tests**

Add this Test Plan and cases to the two existing test files:

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - six development probes produce measured Recall@3 and no-match metrics before activation.
 * 2. Edge Cases:
 *    - equal scores remain deterministic.
 *    - rebuilding an identical measured index preserves its hash.
 *    - an existing valid active pointer remains readable during candidate calibration.
 * 3. Failure Path:
 *    - failed quality gates and embedding failures leave active.json byte-for-byte unchanged.
 */
const calibrationEmbeddingClient = (): EmbeddingClient => ({
  ...fakeEmbeddingClient(),
  embed: async (inputs) => inputs.map((text, index) => {
    const vector = Array.from({ length: 1024 }, () => 0);
    const noMatch = /인수|자사주/.test(text);
    vector[noMatch ? 100 : inputs.length === 1 ? 3 : index] = 1;
    return vector;
  }),
});

test('happy: calibration measures the committed development probes', async () => {
  const root = await writeAmyHoodRagFixture();
  const embeddingClient = calibrationEmbeddingClient();
  const candidate = await prepareAmyHoodMemoryIndexCandidate(root, { embeddingClient });
  const metrics = await evaluateAmyHoodRetrievalCalibration({
    root,
    candidate,
    embeddingClient,
  });
  assert.equal(metrics.probeCount, 6);
  assert.ok(metrics.recallAt3 >= 0.80);
  assert.ok(metrics.noMatchFalsePositiveRate <= 0.20);
});

test('failure: failed calibration cannot replace active.json', async () => {
  const root = await writeAmyHoodRagFixture();
  const embeddingClient = calibrationEmbeddingClient();
  const existing = await buildAmyHoodMemoryIndex(root, {
    embeddingClient,
    evaluateCalibration: async () => ({
      probeCount: 6,
      positiveProbeCount: 4,
      noMatchProbeCount: 2,
      recallAt3: 1,
      noMatchFalsePositiveRate: 0,
    }),
  });
  await activateAmyHoodMemoryIndex(root, existing.manifest.indexHash);
  const before = await readFile(advisorPaths(root).activeMemoryIndex, 'utf8');
  await assert.rejects(
    runAmyHoodMemoryIndexCommand(['build'], {
      root,
      embeddingClient,
      evaluateCalibration: async () => ({
        probeCount: 6,
        positiveProbeCount: 4,
        noMatchProbeCount: 2,
        recallAt3: 0.5,
        noMatchFalsePositiveRate: 0.5,
      }),
    }),
    /retrieval .* gate failed/,
  );
  assert.equal(await readFile(advisorPaths(root).activeMemoryIndex, 'utf8'), before);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npx tsx --test tests/amyHoodHybridRetriever.test.ts tests/amyHoodMemoryIndex.test.ts`
Expected: FAIL because the calibration evaluator and deferred activation API do not exist.

- [ ] **Step 3: Extract pure ranking and implement the measured evaluator**

Use the existing normalization, fusion, threshold, and policy collapse unchanged.
The evaluator reads `advisorPaths(root).retrievalCalibration` and computes:

```ts
export type RetrievalCalibrationMetrics = {
  probeCount: number;
  positiveProbeCount: number;
  noMatchProbeCount: number;
  recallAt3: number;
  noMatchFalsePositiveRate: number;
};

const recallAt3 = positives.reduce((sum, probe) => {
  const returned = new Set(results.get(probe.id)!.matches.slice(0, 3).map(({ id }) => id));
  return sum + probe.expectedArtifactIds.filter((id) => returned.has(id)).length
    / probe.expectedArtifactIds.length;
}, 0) / positives.length;

const noMatchFalsePositiveRate = noMatches.filter((probe) =>
  !results.get(probe.id)!.trace.noMatch).length / noMatches.length;
```

Reject any calibration file that has a holdout identifier, fewer than one
positive probe, fewer than one no-match probe, duplicate IDs, or an empty query.

- [ ] **Step 4: Defer activation and remove fabricated defaults**

Delete these fallbacks from `memoryIndex.ts`:

```ts
sha256('unconfigured-calibration')
{ recallAt3: 1, noMatchFalsePositiveRate: 0 }
```

Candidate construction computes records, evidence, vectors, and the calibration
set hash in memory. `buildAmyHoodMemoryIndex` passes that candidate to
`options.evaluateCalibration`, validates the returned metrics, finalizes the
manifest/index hash, and persists it without writing `active.json`. The CLI then
reloads and verifies the final directory before it calls:

```ts
await activateAmyHoodMemoryIndex(root, verified.manifest.indexHash);
```

`activateAmyHoodMemoryIndex` re-verifies release hash, holdout hash, vector hash,
record hashes, calibration-set hash, `recallAt3 >= 0.80`, and
`noMatchFalsePositiveRate <= 0.20` immediately before atomic pointer replacement.

- [ ] **Step 5: Run unit and live gates**

Run:

```bash
npm run advisor:index:test
BGE_M3_BASE_URL=http://127.0.0.1:8081/v1 BGE_M3_MODEL=bge-m3-Q8_0.gguf npm run advisor:index:build
npm run advisor:index:check
```

Expected: all tests PASS; output reports six measured probes and passing metrics;
the active manifest contains those exact metrics and no provisional marker.

- [ ] **Step 6: Commit**

```bash
git add server/decisionAdvisor/hybridRetriever.ts server/decisionAdvisor/memoryIndex.ts server/runAmyHoodMemoryIndex.ts tests/amyHoodHybridRetriever.test.ts tests/amyHoodMemoryIndex.test.ts package.json data/b-track/amy-hood/advisor/memory-indexes
git commit -m "feat: gate Amy Hood index activation on measured retrieval"
```

---

### Task 2: Complete Full Linked-Memory Projection and Total Request Budget

**Files:**
- Modify: `server/decisionAdvisor/ragContext.ts`
- Modify: `tests/amyHoodRagContext.test.ts`
- Modify: `shared/amyHoodRag.ts`

**Interfaces:**
- Keeps `buildAmyHoodRagContext(...)` as the only renderer.
- Adds `systemPrompt`, `userPrompt`, and `maxRequestTokens?: 12000` to its input.
- Returns `requestTokens` in `AmyHoodRetrievalTrace`.

Add the field exactly as:

```ts
export type AmyHoodRetrievalTrace = {
  // existing fields remain unchanged
  requestTokens: number;
};
```

- [ ] **Step 1: Write failing linked-expansion tests**

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - Full projection renders the approved reflection, two supporting events, one contrast, and quotes.
 * 2. Edge Cases:
 *    - Policy projection renders minimum event support without full reflection prose.
 *    - duplicate evidence reached by three paths appears once.
 *    - a tight budget drops a whole lowest-score bundle without slicing a quote.
 * 3. Failure Path:
 *    - unresolved links, holdout text, or a request above 12,000 tokens fail closed.
 */
test('happy: full projection expands the complete linked decision memory', async () => {
  const { root, retrieval } = await fixture('customer demand capacity urgency');
  const context = await buildAmyHoodRagContext({
    root,
    retrieval,
    projection: 'full',
    systemPrompt: 'Amy Hood system prompt',
    userPrompt: 'AI 인프라와 운영비를 어떤 순서로 관리합니까?',
  });
  assert.match(context.text, /Decision axis:/);
  assert.match(context.text, /Condition delta:/);
  assert.match(context.text, /event-ai-capacity-opex-pivot-2023/);
  assert.match(context.text, /event-cloud-capacity-scale-2022/);
  assert.equal(context.trace.evidenceIds.length, 6);
  assert.ok(context.trace.requestTokens <= 12_000);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npx tsx --test tests/amyHoodRagContext.test.ts`
Expected: FAIL because reflection/event sections and `requestTokens` are absent.

- [ ] **Step 3: Load only manifest-listed linked artifacts**

For each selected policy, resolve its approved reflection IDs, at most two
supporting event IDs, one contrasting event ID, and at most two evidence spans
per event. Render stable labels:

```ts
const fullSections = [
  `Decision axis: ${reflection.decisionAxis.decisionQuestion}`,
  `Invariant: ${reflection.invariant}`,
  `Condition delta: ${reflection.conditionDelta}`,
  `Action delta: ${reflection.actionDelta}`,
  ...supportingEvents.map(renderEvent),
  `Contrasting event:\n${renderEvent(contrast)}`,
];
```

Reject any ID not listed in the pinned release manifest. Re-run the existing
holdout scanner against the final rendered text.

- [ ] **Step 4: Enforce the complete-request cap**

Count `systemPrompt + userPrompt + rendered memory` with the injected tokenizer,
or `conservativeTokenEstimate` when `/tokenize` is unavailable. Add whole bundles
in ranked order and require both limits:

```ts
if (memoryTokens > 6_000) throw new Error('RAG context exceeds 6000 tokens');
if (requestTokens > 12_000) throw new Error('complete model request exceeds 12000 tokens');
```

- [ ] **Step 5: Verify and commit**

Run: `npx tsx --test tests/amyHoodRagContext.test.ts tests/amyHoodEvaluationV3Holdout.test.ts && npm run lint`

```bash
git add shared/amyHoodRag.ts server/decisionAdvisor/ragContext.ts tests/amyHoodRagContext.test.ts
git commit -m "feat: expand full Amy Hood memory context"
```

---

### Task 3: Connect the Actual Amy Hood Advisor to the Shared Retriever

**Files:**
- Create: `server/decisionAdvisor/advisorRuntime.ts`
- Create: `tests/amyHoodAdvisorRuntime.test.ts`
- Modify: `server/index.ts:1242-1363`
- Modify: `src/components/PersonaDetailModal.tsx:55-90`

**Interfaces:**
- Produces `createAmyHoodAdvisorRuntime({ root, createModel, createRetriever })`.
- Produces `answer({ message, recentMessages }): Promise<AdvisorAnswer>`.
- Produces `POST /api/b-track/amy-hood/advisor/chat`.

```ts
export type AdvisorAnswer = {
  reply: string;
  retrieval: AmyHoodRetrievalTrace | null;
  ragFallback: boolean;
  fallbackCode: 'embedding_unavailable' | 'index_stale' | 'index_corrupt' | 'retrieval_error' | null;
  noMatch: boolean;
};
```

- [ ] **Step 1: Write failing runtime tests**

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - a free-form question retrieves memory and sends an actual quote to E4B.
 * 2. Edge Cases:
 *    - semantic no-match uses the active prompt without invented evidence.
 *    - recent conversation enters answer generation but not retrieval.
 *    - source URLs remain internal and are omitted from the reply.
 * 3. Failure Path:
 *    - embedding/index failure produces explicit prompt-only fallback without partial writes.
 */
test('happy: Advisor uses the shared retriever', async () => {
  const result = await runtime.answer({
    message: 'AI 인프라와 운영비를 어떤 순서로 관리해야 합니까?',
    recentMessages: [],
  });
  assert.deepEqual(observedQueries, ['AI 인프라와 운영비를 어떤 순서로 관리해야 합니까?']);
  assert.match(observedModelInput.user, /Amy Hood evidence/);
  assert.equal(result.ragFallback, false);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npx tsx --test tests/amyHoodAdvisorRuntime.test.ts`
Expected: FAIL because `advisorRuntime.ts` does not exist.

- [ ] **Step 3: Implement retrieval, generation, and explicit fallback**

```ts
const retrieval = await retriever.retrieve({
  query: input.message,
  indexHash: activeIndex.manifest.indexHash,
});
const memory = await buildAmyHoodRagContext({
  root,
  retrieval,
  projection: 'full',
  systemPrompt: prompt.content,
  userPrompt: renderAdvisorQuestion(input),
});
const generated = await model.invoke({
  system: prompt.content,
  user: `${memory.text}\n\n${renderRecent(input.recentMessages)}\n\n질문: ${input.message}`,
});
```

Return internal trace data, but expose only `{ reply, chatSessionId,
ragFallback, noMatch }` from the route. On dependency failure call E4B once
without memory and set `fallbackCode` to `embedding_unavailable`, `index_stale`,
`index_corrupt`, or `retrieval_error`.

- [ ] **Step 4: Add route and Amy-only UI routing**

Register the dedicated route before `/api/agent/persona-chat`. In the modal:

```ts
const endpoint = persona.name.trim().toLocaleLowerCase('en-US') === 'amy hood'
  ? '/api/b-track/amy-hood/advisor/chat'
  : '/api/agent/persona-chat';
```

Keep the fixed unofficial-simulation notice and the generic route unchanged.

- [ ] **Step 5: Verify and commit**

Run: `npx tsx --test tests/amyHoodAdvisorRuntime.test.ts tests/trackNavigation.test.ts && npm run lint && npm run build`

```bash
git add server/decisionAdvisor/advisorRuntime.ts tests/amyHoodAdvisorRuntime.test.ts server/index.ts src/components/PersonaDetailModal.tsx
git commit -m "feat: connect Amy Hood advisor to hybrid memory"
```

---

### Task 4: Add One Atomic Evaluation Retrieval Cache and Dynamic Prompt Input

**Files:**
- Create: `server/evaluationV3/retrievalCache.ts`
- Create: `tests/amyHoodEvaluationV3RetrievalCache.test.ts`
- Modify: `server/evaluationV3/prompt.ts`
- Modify: `tests/amyHoodEvaluationV3Prompt.test.ts`

**Interfaces:**
- Produces `readOrCreateEvaluationRetrieval({ root, experimentGroupId, query, indexHash, retriever })`.
- Changes `buildEvaluationV3Input` context argument to `AmyHoodRenderedContext | null`.

- [ ] **Step 1: Write failing cache tests**

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - one public question creates one verified cache record reused by both RAG arms.
 * 2. Edge Cases:
 *    - normalized whitespace maps to one query hash.
 *    - concurrent reads produce one valid atomic record.
 *    - historical no-RAG prompt input remains valid with null context.
 * 3. Failure Path:
 *    - corrupt payload, stale index/config hash, and private retrieval fields fail closed.
 */
const retrievalResultFixture = ({ query, indexHash }: AmyHoodRetrievalRequest): AmyHoodRetrievalResult => {
  const normalized = query.normalize('NFKC').trim().replace(/\s+/g, ' ');
  const queryHash = createHash('sha256').update(normalized).digest('hex');
  const retrievalConfigHash = 'b'.repeat(64);
  return {
    query: normalized,
    matches: [],
    trace: {
      queryHash,
      indexHash,
      retrievalConfigHash,
      cacheKey: createHash('sha256')
        .update(JSON.stringify({ query: normalized, indexHash, retrievalConfigHash }))
        .digest('hex'),
      selectedArtifacts: [],
      noMatch: true,
      noMatchReason: 'below_threshold',
    },
  };
};

test('happy: Policy and Full arms reuse one ranked result', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evaluation-v3-cache-'));
  let retrievalCalls = 0;
  const countingRetriever = {
    retrieve: async ({ query, indexHash }: AmyHoodRetrievalRequest) => {
      retrievalCalls += 1;
      return retrievalResultFixture({ query, indexHash });
    },
  };
  const input = {
    root,
    experimentGroupId: 'group-1',
    query: '고객 수요가 확인될 때 인프라 투자를 어떻게 결정합니까?',
    indexHash: 'a'.repeat(64),
    retriever: countingRetriever,
  };
  const first = await readOrCreateEvaluationRetrieval(input);
  const second = await readOrCreateEvaluationRetrieval(input);
  assert.equal(retrievalCalls, 1);
  assert.equal(first.trace.cacheKey, second.trace.cacheKey);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `npx tsx --test tests/amyHoodEvaluationV3RetrievalCache.test.ts tests/amyHoodEvaluationV3Prompt.test.ts`
Expected: FAIL because the cache module and dynamic prompt signature are absent.

- [ ] **Step 3: Implement verified atomic cache**

Persist at:

```text
evaluation/v3/retrieval-cache/{experimentGroupId}/{queryHash}.json
```

The payload contains normalized query, query hash, index hash, retrieval-config
hash, cache key, selected roots, component scores, and no-match state. Write a
same-directory temporary file and rename. On every read recompute all hashes.

- [ ] **Step 4: Replace static prompt projection**

No-RAG arms require `null`. RAG arms require `AmyHoodRenderedContext`, and the
prompt uses `context.text` verbatim. `assertPublicQuestion` remains the boundary
that rejects answer-key fields. Do not serialize the trace into the model prompt.

- [ ] **Step 5: Verify and commit**

Run: `npx tsx --test tests/amyHoodEvaluationV3RetrievalCache.test.ts tests/amyHoodEvaluationV3Prompt.test.ts && npm run lint`

```bash
git add server/evaluationV3/retrievalCache.ts tests/amyHoodEvaluationV3RetrievalCache.test.ts server/evaluationV3/prompt.ts tests/amyHoodEvaluationV3Prompt.test.ts
git commit -m "feat: cache Evaluation v3 dynamic retrieval"
```

---

### Task 5: Replace New Evaluation v3 Runs With Dynamic RAG

**Files:**
- Modify: `server/evaluationV3/context.ts`
- Modify: `server/evaluationV3/runner.ts`
- Modify: `server/evaluationV3/routes.ts`
- Modify: `shared/amyHoodEvaluationV3.ts`
- Modify: `tests/helpers/evaluationV3MemoryFixture.ts`
- Modify: `tests/amyHoodEvaluationV3Runner.test.ts`
- Modify: `tests/amyHoodEvaluationV3Routes.test.ts`
- Create: `server/runAmyHoodEvaluationV3.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `EvaluationV3RagPin` with release, index, and config hashes.
- Injects `retriever` and `buildContext` into `createEvaluationV3Runner`.
- Adds `evaluation:v3:run:local`.

- [ ] **Step 1: Rewrite runner tests before production code**

Keep the repository Test Plan categories and replace the static-memory happy
assertions with:

```ts
assert.equal(modelCalls, 120);
assert.equal(retrievalCalls, 30);
assert.equal(completed[2].answers.every(({ retrieval }) => Boolean(retrieval)), true);
assert.deepEqual(
  completed[2].answers.map(({ retrieval }) => retrieval?.cacheKey),
  completed[3].answers.map(({ retrieval }) => retrieval?.cacheKey),
);
assert.equal(observedQueries.some((query) => /D01|correctChoice|correctIntent/.test(query)), false);
assert.equal(completed[0].memoryIndexHash, null);
assert.equal(completed[2].memoryIndexHash, activeIndexHash);
```

Failure tests must assert that embedding timeout, corrupt cache, stale index, and
request-budget overflow leave the RAG run `incomplete`, record a failed answer,
and never invoke the model with prompt-only content.

- [ ] **Step 2: Run and verify RED**

Run: `npm run evaluation:v3:test`
Expected: FAIL because the runner still passes static `EvaluationV3ContextPackage`.

- [ ] **Step 3: Resolve and pin the active dynamic index**

Replace new-run static context resolution with:

```ts
export type EvaluationV3RagPin = {
  memoryReleaseId: string;
  memoryReleaseHash: string;
  memoryIndexHash: string;
  retrievalConfigHash: string;
};
```

Generic and Amy Prompt arms use null pins. RAG arms must pin the same verified
active release and index. Keep the old static snapshot reader only for reading
historical run files; never call it from new execution.

- [ ] **Step 4: Retrieve once and project twice**

For each RAG answer:

```ts
const ranked = await readOrCreateEvaluationRetrieval({
  root: options.root,
  experimentGroupId: run.experimentGroupId,
  query: question.prompt,
  indexHash: run.memoryIndexHash!,
  retriever: options.retriever,
});
const projection = run.arm === 'amy_policy_rag' ? 'policy' : 'full';
const context = await options.buildContext({
  root: options.root,
  retrieval: ranked,
  projection,
  systemPrompt,
  userPrompt: renderPublicQuestion(question),
});
```

Persist `context.trace` on the answer. A semantic no-match is a complete answer;
an infrastructure or integrity exception is a failed answer and incomplete run.

- [ ] **Step 5: Update readiness and add the checked-in runner**

Readiness is true only when 30 questions are approved, active release and index
hashes agree, measured calibration passes, and port 8081 preflight succeeds.

`server/runAmyHoodEvaluationV3.ts` must wrap async execution and set a nonzero
exit code on failure:

```ts
const main = async () => {
  const repetitions = process.argv.includes('--repetitions=5') ? 5 : 1;
  const { runner } = createEvaluationV3RouteDependencies(process.cwd());
  const launch = await runner.createExperiment({ repetitions });
  console.log(JSON.stringify({ event: 'EXPERIMENT_CREATED', experimentGroupId: launch.experimentGroupId }));
  const runs = await runner.executeExperiment(launch.runs.map(({ runId }) => runId));
  console.log(JSON.stringify({ event: 'EXPERIMENT_COMPLETED', runs }));
};
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
```

Add: `"evaluation:v3:run:local": "tsx server/runAmyHoodEvaluationV3.ts"`.

- [ ] **Step 6: Verify and commit**

Run: `npm run evaluation:v3:test && npm run lint && npm run build`

```bash
git add shared/amyHoodEvaluationV3.ts server/evaluationV3/context.ts server/evaluationV3/runner.ts server/evaluationV3/routes.ts server/runAmyHoodEvaluationV3.ts tests/helpers/evaluationV3MemoryFixture.ts tests/amyHoodEvaluationV3Runner.test.ts tests/amyHoodEvaluationV3Routes.test.ts package.json
git commit -m "feat: run Evaluation v3 with dynamic Amy Hood RAG"
```

---

### Task 6: Run the Real Four-Arm E4B Experiment and Write the Report

**Files:**
- Modify: `docs/reports/2026-07-20-amy-hood-evaluation-v3-first-live-run.html`
- Modify: `docs/reports/2026-07-20-amy-hood-evaluation-v3-e4b-model-comparison.html`
- Create: `docs/reports/2026-07-20-amy-hood-evaluation-v3-query-dependent-rag-report.html`
- Generate: four run JSON files under `evaluation/v3/runs/`
- Generate: 30 cache JSON files under `evaluation/v3/retrieval-cache/{experimentGroupId}/`

**Interfaces:**
- Consumes the measured active index, port 8081 BGE-M3, and port 8080 E4B.
- Produces one reproducible 120-answer experiment and a developer-facing HTML report.

- [ ] **Step 1: Mark old reports as static-context baselines**

Add this visible banner without changing historical scores:

```text
Historical implementation note: the RAG-labeled conditions in this report used static release-context injection. They did not perform query-dependent retrieval and did not give Gemma 4 memory tools. These runs remain static-context ablation baselines.
```

- [ ] **Step 2: Run all non-model gates**

```bash
npm run advisor:index:test
npm run advisor:index:check
npm run advisor:policy-memory:test
npm run evaluation:v3:test
npm run evaluation:test
npm run lint
npm run build
git diff --check
```

Expected: zero failures; active manifest contains measured metrics; no provisional
calibration value remains.

- [ ] **Step 3: Audit all 30 retrievals before E4B**

Use public `question.prompt` only. Require 30 cache candidates, no sealed IDs,
real quotes on relevant AI-capacity hits, valid no-match on unsupported domains,
context ≤6,000 tokens, and total request ≤12,000 tokens. Stop before E4B on any
failure and record the exact public question and violated rule.

- [ ] **Step 4: Run one real experiment**

```bash
BGE_M3_BASE_URL=http://127.0.0.1:8081/v1 \
BGE_M3_MODEL=bge-m3-Q8_0.gguf \
LOCAL_LLM_BASE_URL=http://127.0.0.1:8080/v1 \
LOCAL_LLM_MODEL=Gemma-4-E4B-Uncensored-HauhauCS-Aggressive-Q4_K_M.gguf \
npm run evaluation:v3:run:local -- --repetitions=1
```

Expected: four complete runs, 120 complete answers, zero parse failures, 30
retrieval records, 60 RAG traces, and identical cache keys between Policy and
Full arms for each question.

- [ ] **Step 5: Generate and verify the developer report**

The report must calculate from run/cache JSON:

- four-arm total and category scores;
- dynamic RAG lift and input-token cost;
- hit/no-match counts and selected-policy score distribution;
- evidence-quote inclusion rate;
- cache reuse, pinned hashes, and dependency identities;
- Before vs After against both static-context reports;
- hypotheses, evidence, limitations, benchmark-rejection status, and go/no-go.

Include one sanitized model-input example containing actual quote text and
retrieval scores. Do not claim Amy Hood replication from one repetition or when
the generic CFO arm exceeds 80%.

Parse all displayed values back against JSON and parse the HTML using `parse5`;
require zero mismatches and zero HTML parse errors.

- [ ] **Step 6: Final verification and commit**

Run:

```bash
npm run advisor:index:test
npm run evaluation:v3:test
npm run evaluation:test
npm run lint
npm run build
git diff --check
git status --short --branch
```

```bash
git add docs/reports evaluation/v3/runs evaluation/v3/retrieval-cache
git commit -m "test: evaluate query-dependent Amy Hood hybrid RAG"
```

---

## Completion Gate

- [ ] Active index calibration values are measured from six committed probes.
- [ ] Full projection contains policy, reflection, supporting events, contrast, and actual quotes.
- [ ] Advisor and Evaluation import the same hybrid retriever and renderer.
- [ ] Retrieval input contains only the normalized user/public question.
- [ ] Policy and Full Evaluation arms share one persisted ranked result per question.
- [ ] Every RAG answer records selected artifacts, scores, evidence IDs, hashes, and token counts.
- [ ] Semantic no-match is distinct from infrastructure failure.
- [ ] Holdout, stale hash, corrupt cache, and budget failures fail closed.
- [ ] 8081 is BGE-M3 and 8080 is E4B at live-run time.
- [ ] One 30-question × four-arm dynamic-RAG experiment and verified HTML report exist.
- [ ] Earlier static-context reports are visibly and accurately labeled.
