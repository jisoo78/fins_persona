# Amy Hood Simplified Persona Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 선택된 Amy Hood 공개자료 18개를 로컬 corpus로 만들고, Gemma 4를 기본값으로 동일 chunk를 분석해 Main Master Prompt를 생성한 뒤, 검증 게이트를 통과한 경우에만 GPT-5 mini 비교 실행과 동일 홀드아웃 평가가 가능하게 한다.

**Architecture:** 기존 Source Inventory를 입력 계약으로 유지하고, 신규 TypeScript CLI가 원문 수집·정규화, llama.cpp tokenizer 기반 구조 보존 chunking, provider별 분석 캐시, 자료별 병합과 프롬프트 합성을 순서대로 수행한다. Gemma 4와 GPT-5 mini는 동일한 raw source, chunk manifest, 분석 프롬프트와 출력 스키마를 사용하며 기존 정적 RAG UI/API 경로와는 연결하지 않는다.

**Tech Stack:** TypeScript 5.8, Node.js 24 내장 `fetch`/`node:test`/`crypto`, `tsx`, `cheerio`, LangChain `ChatOpenAI`, llama.cpp OpenAI-compatible API와 `/tokenize`, JSON/JSONL/Markdown

## Global Constraints

- 입력은 `data/b-track/amy-hood/source-inventory.json`의 `selected` 18개로 고정한다.
- FY2017 Q1~FY2019 Q4 어닝콜 12개는 `holdout`이며 분석, Main Master Prompt 생성과 RAG 입력에서 제외한다.
- 기본 provider는 `local`, 기본 로컬 모델은 `LOCAL_LLM_MODEL`의 Gemma 4다.
- 로컬 모델 전체 컨텍스트는 정확히 `16384`, 원문 chunk 상한은 `10000` tokens다.
- 구조 단위 우선 분할 후에만 토큰 분할하며 인접 chunk overlap 목표는 `500..800` tokens다.
- 두 provider는 한 번 생성한 동일 chunk manifest를 사용한다.
- GPT-5 mini 모델 ID는 `gpt-5-mini`이며 `--provider openai` 없이는 호출하지 않는다.
- Gemma 4 실패 시 GPT-5 mini로 자동 fallback하지 않는다.
- Gemma 4의 모든 chunk 분석, 자료별 병합, 프롬프트 생성과 resume 검증이 끝나기 전에는 OpenAI 호출을 차단한다.
- Evidence, Decision Case, Decision Principle 별도 산출물을 만들지 않는다.
- 기존 `server/agentService.ts`의 정적 Amy Hood RAG 경로와 UI는 수정하지 않는다.
- 새 테스트 파일 맨 위에 Happy Path 1개, Edge Cases 정확히 3개와 현실적인 Failure Paths를 명시한다.
- 유료 OpenAI 실호출은 게이트 결과를 사용자에게 보고하고 명시적인 실행 확인을 받은 뒤에만 수행한다.

---

## File Structure

- Create: `server/personaPipeline/types.ts` — raw source, chunk, 분석, 실행상태와 provider 공통 계약
- Create: `server/personaPipeline/corpus.ts` — selected 검증, 로컬/웹 원문 정규화, 해시와 raw source 저장
- Create: `server/personaPipeline/chunker.ts` — llama.cpp token count와 구조 보존 결정적 chunk 생성
- Create: `server/personaPipeline/modelClient.ts` — Gemma 4/GPT-5 mini 명시적 provider 생성과 응답 메타데이터
- Create: `server/personaPipeline/analyzer.ts` — chunk 분석, JSON 재시도, resume cache와 자료별 병합
- Create: `server/personaPipeline/promptBuilder.ts` — Gemma 게이트와 provider별 Main Master Prompt 생성
- Create: `server/personaPipeline/evaluator.ts` — 동일 15개 문항으로 provider별 페르소나 답변 생성
- Create: `server/runAmyHoodPersonaPipeline.ts` — `analyze`, `check`, `evaluate` CLI orchestration
- Create: `agent_prompts/prompts/amy-hood-source-analysis.md` — 모든 provider가 공유하는 분석 프롬프트
- Create: `agent_prompts/prompts/amy-hood-master-prompt.md` — 모델별 분석을 시스템 프롬프트로 합성하는 지시
- Create: `tests/amyHoodPersonaPipeline.test.ts` — 단일 Test Plan과 파이프라인 TDD
- Modify: `.env.example` — Gemma 4 16K, OpenAI opt-in 환경변수
- Modify: `.gitignore` — provider 분석 cache 제외
- Modify: `package.json` — `cheerio`, 테스트와 persona CLI scripts
- Modify: `package-lock.json` — `npm install cheerio` 결과
- Generate at runtime: `data/b-track/amy-hood/raw-sources/*.json`
- Generate at runtime: `data/b-track/amy-hood/chunks/manifest.json`
- Generate at runtime: `data/b-track/amy-hood/.analysis-cache/<provider>/*.json`
- Generate at runtime: `data/b-track/amy-hood/source-analysis.<provider>.jsonl`
- Generate at runtime: `data/b-track/amy-hood/AMY_HOOD_PERSONA.<provider>.md`
- Generate at runtime: `evaluation/amy-hood-persona-eval.<provider>.json`

---

### Task 1: 공통 계약과 16K 구조 보존 Chunker

**Files:**
- Create: `server/personaPipeline/types.ts`
- Create: `server/personaPipeline/chunker.ts`
- Create: `tests/amyHoodPersonaPipeline.test.ts`

**Interfaces:**
- Produces: `RawSource`, `RawBlock`, `SourceChunk`, `ChunkAnalysis`, `SourceAnalysis`, `ProviderName`, `PipelineRunSummary`
- Produces: `TokenCounter = (text: string) => Promise<number>`
- Produces: `buildChunks(source: RawSource, countTokens: TokenCounter, options?: ChunkOptions): Promise<SourceChunk[]>`

- [ ] **Step 1: 테스트 파일 상단에 전체 Test Plan과 첫 두 Edge Case 테스트 작성**

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - selected 원문을 수집하고 동일 chunk를 Gemma 4 모의 모델로 분석·병합해 시스템 프롬프트와 평가 답변을 생성한다.
 *
 * 2. Edge Cases:
 *    - 10,000 tokens보다 짧은 자료는 하나의 chunk로 유지한다.
 *    - 한도 근처의 질문·답변 또는 화자 발언은 가능한 한 같은 chunk에 보존한다.
 *    - 재실행하면 완료된 chunk를 재호출하지 않고 미완료 chunk만 처리한다.
 *
 * 3. Failure Path:
 *    - holdout 입력, 원문 수집 실패, 컨텍스트 초과, 반복 JSON 오류와 Gemma 게이트 실패는 안전하게 중단한다.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildChunks } from '../server/personaPipeline/chunker';
import type { RawSource } from '../server/personaPipeline/types';

const wordCounter = async (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

const rawSource = (blocks: RawSource['blocks']): RawSource => ({
  sourceId: 'source_selected_1',
  title: 'Amy Hood interview',
  sourceType: 'interview',
  sourceUrl: 'https://example.test/interview',
  sourcePath: null,
  collectedAt: '2026-07-13T00:00:00.000Z',
  sha256: 'source-hash',
  format: 'normalized_json',
  collectionStatus: 'complete',
  blocks,
});

test('edge: short source remains one chunk', async () => {
  const chunks = await buildChunks(rawSource([{ blockId: 'b1', kind: 'paragraph', text: 'one two three' }]), wordCounter, {
    maxSourceTokens: 10,
    overlapMinTokens: 1,
    overlapMaxTokens: 2,
  });
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].tokenCount, 3);
});

test('edge: speaker block stays intact near boundary', async () => {
  const chunks = await buildChunks(rawSource([
    { blockId: 'b1', kind: 'speaker_turn', speaker: 'Interviewer', text: 'one two three four' },
    { blockId: 'b2', kind: 'speaker_turn', speaker: 'Amy Hood', text: 'five six seven eight' },
    { blockId: 'b3', kind: 'speaker_turn', speaker: 'Interviewer', text: 'nine ten eleven twelve' },
  ]), wordCounter, { maxSourceTokens: 8, overlapMinTokens: 0, overlapMaxTokens: 0 });
  assert.deepEqual(chunks.map((chunk) => chunk.blockIds), [['b1', 'b2'], ['b3']]);
});
```

- [ ] **Step 2: 테스트를 실행해 import 실패를 확인**

Run: `npx tsx --test tests/amyHoodPersonaPipeline.test.ts`

Expected: FAIL with `Cannot find module '../server/personaPipeline/chunker'`.

- [ ] **Step 3: 공통 타입을 구현**

```ts
// server/personaPipeline/types.ts
export type ProviderName = 'local' | 'openai';
export const providerArtifactName = (provider: ProviderName) => provider === 'local' ? 'gemma4' : 'gpt5-mini';
export type BlockKind = 'speaker_turn' | 'qa_pair' | 'paragraph' | 'record';

export interface RawBlock {
  blockId: string;
  kind: BlockKind;
  speaker?: string;
  text: string;
  duplicateOf?: string;
}

export interface RawSource {
  sourceId: string;
  title: string;
  sourceType: string;
  sourceUrl: string | null;
  sourcePath: string | null;
  collectedAt: string;
  sha256: string;
  format: 'normalized_json';
  collectionStatus: 'complete';
  blocks: RawBlock[];
}

export interface SourceChunk {
  chunkId: string;
  sourceId: string;
  index: number;
  blockIds: string[];
  text: string;
  tokenCount: number;
  sha256: string;
}

export interface AnalysisSignal {
  statement: string;
  conditions: string[];
  exceptions: string[];
  sourceLocator: string;
}

export interface ChunkAnalysis {
  sourceId: string;
  chunkId: string;
  provider: ProviderName;
  model: string;
  decisionCriteria: AnalysisSignal[];
  priorities: AnalysisSignal[];
  tradeoffs: AnalysisSignal[];
  riskSignals: AnalysisSignal[];
  communicationPatterns: AnalysisSignal[];
  status: 'complete' | 'failed';
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  elapsedMs: number;
}

export interface SourceAnalysis extends Omit<ChunkAnalysis, 'chunkId' | 'elapsedMs'> {
  chunkIds: string[];
}

export interface PipelineRunSummary {
  provider: ProviderName;
  model: string;
  sourceCount: number;
  chunkCount: number;
  completedChunks: number;
  failedChunks: number;
  reusedChunks: number;
  elapsedMs: number;
  gatePassed: boolean;
}
```

- [ ] **Step 4: 결정적 chunker를 구현**

구조 block 전체를 먼저 채우고, 단일 block만 상한을 넘을 때 문장/단어 경계로 자른다. Chunk ID는 `${sourceId}:${index}:${sha256.slice(0, 12)}`로 만든다.

```ts
// server/personaPipeline/chunker.ts
import { createHash } from 'node:crypto';
import type { RawBlock, RawSource, SourceChunk } from './types';

export type TokenCounter = (text: string) => Promise<number>;
export interface ChunkOptions { maxSourceTokens: number; overlapMinTokens: number; overlapMaxTokens: number }
const defaults: ChunkOptions = { maxSourceTokens: 10_000, overlapMinTokens: 500, overlapMaxTokens: 800 };
const digest = (text: string) => createHash('sha256').update(text).digest('hex');
const render = (blocks: RawBlock[]) => blocks.map((block) => `${block.speaker ? `[${block.speaker}]\n` : ''}${block.text}`).join('\n\n');

async function splitOversizeBlock(block: RawBlock, countTokens: TokenCounter, limit: number): Promise<RawBlock[]> {
  if (await countTokens(render([block])) <= limit) return [block];
  const sentences = block.text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const units = sentences.length > 1 ? sentences : block.text.split(/\s+/).filter(Boolean);
  const parts: RawBlock[] = [];
  let current = '';
  for (const unit of units) {
    const candidate = current ? `${current} ${unit}` : unit;
    if (current && await countTokens(candidate) > limit) {
      parts.push({ ...block, blockId: `${block.blockId}:part-${parts.length + 1}`, text: current });
      current = unit;
    } else current = candidate;
  }
  if (current) parts.push({ ...block, blockId: `${block.blockId}:part-${parts.length + 1}`, text: current });
  for (const part of parts) if (await countTokens(render([part])) > limit) throw new Error(`single token unit exceeds ${limit} tokens: ${part.blockId}`);
  return parts;
}

async function overlapTail(blocks: RawBlock[], countTokens: TokenCounter, config: ChunkOptions): Promise<RawBlock[]> {
  if (config.overlapMaxTokens === 0) return [];
  const tail: RawBlock[] = [];
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const candidate = [blocks[index], ...tail];
    if (await countTokens(render(candidate)) > config.overlapMaxTokens) break;
    tail.unshift(blocks[index]);
    if (await countTokens(render(tail)) >= config.overlapMinTokens) break;
  }
  return tail;
}

export async function buildChunks(source: RawSource, countTokens: TokenCounter, options: Partial<ChunkOptions> = {}): Promise<SourceChunk[]> {
  const config = { ...defaults, ...options };
  const usable: RawBlock[] = [];
  for (const block of source.blocks.filter((item) => !item.duplicateOf && item.text.trim())) usable.push(...await splitOversizeBlock(block, countTokens, config.maxSourceTokens));
  const groups: RawBlock[][] = [];
  let current: RawBlock[] = [];
  for (const block of usable) {
    const candidate = [...current, block];
    if (current.length && await countTokens(render(candidate)) > config.maxSourceTokens) {
      groups.push(current);
      const overlap = await overlapTail(current, countTokens, config);
      current = await countTokens(render([...overlap, block])) <= config.maxSourceTokens ? [...overlap, block] : [block];
    } else current = candidate;
  }
  if (current.length) groups.push(current);
  const chunks: SourceChunk[] = [];
  for (const group of groups) {
    const text = render(group);
    const tokenCount = await countTokens(text);
    if (tokenCount > config.maxSourceTokens) throw new Error(`single structure exceeds ${config.maxSourceTokens} tokens: ${group[0].blockId}`);
    const sha256 = digest(text);
    const index = chunks.length;
    chunks.push({ chunkId: `${source.sourceId}:${index}:${sha256.slice(0, 12)}`, sourceId: source.sourceId, index, blockIds: group.map((block) => block.blockId), text, tokenCount, sha256 });
  }
  return chunks;
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx tsx --test tests/amyHoodPersonaPipeline.test.ts`

Expected: `2 tests`, `0 fail`.

- [ ] **Step 6: 커밋**

```bash
git add server/personaPipeline/types.ts server/personaPipeline/chunker.ts tests/amyHoodPersonaPipeline.test.ts
git commit -m "feat: add persona source chunking contracts"
```

---

### Task 2: Selected 원문 Corpus 수집과 Holdout 차단

**Files:**
- Create: `server/personaPipeline/corpus.ts`
- Modify: `tests/amyHoodPersonaPipeline.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `source-inventory.json`, `archive/*.json`, `archive/*.csv`, selected web URLs
- Produces: `collectSelectedCorpus(options: CollectOptions): Promise<RawSource[]>`
- Produces: `assertSelectedInventory(entries: InventoryEntry[]): InventoryEntry[]`

- [ ] **Step 1: HTML 추출 의존성 설치**

Run: `npm install cheerio`

Expected: `cheerio` appears in `dependencies`; no unrelated package removal.

- [ ] **Step 2: holdout 혼입과 수집 실패 테스트 추가**

```ts
import { assertSelectedInventory, collectSelectedCorpus } from '../server/personaPipeline/corpus';
import type { InventoryEntry } from '../server/personaPipeline/corpus';

test('failure: holdout source is rejected before collection', () => {
  const entries: InventoryEntry[] = Array.from({ length: 18 }, (_, index) => ({ source_id: `selected_${index}`, status: 'selected', source_type: 'interview', local_path: `archive/${index}.json`, url: null, title: `source ${index}` }));
  entries[0] = { ...entries[0], source_id: 'earnings_fy2017_q1', source_type: 'earnings_call', fiscal_year: 2017 };
  assert.throws(() => assertSelectedInventory(entries), /holdout/);
});

test('failure: unavailable web source leaves no partial raw file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'amy-corpus-'));
  const entries: InventoryEntry[] = [
    { source_id: 'web_1', status: 'selected', source_type: 'interview', local_path: null, url: 'https://example.test/fail', title: 'web' },
    ...Array.from({ length: 17 }, (_, index) => ({ source_id: `local_${index}`, status: 'selected', source_type: 'interview', local_path: `archive/${index}.json`, url: null, title: `local ${index}` })),
  ];
  await assert.rejects(() => collectSelectedCorpus({ root, entries, fetchImpl: async () => new Response('', { status: 503 }), now: () => '2026-07-13T00:00:00.000Z' }), /503/);
  assert.equal(existsSync(join(root, 'data/b-track/amy-hood/raw-sources/web_1.json')), false);
});
```

테스트 import에 `existsSync`, `mkdtemp`, `tmpdir`, `join`을 추가한다.

- [ ] **Step 3: inventory 검증과 로컬 원문 정규화 구현**

```ts
// server/personaPipeline/corpus.ts 핵심 계약
export interface InventoryEntry {
  source_id: string; title: string; source_type: string; status: string;
  local_path: string | null; url: string | null; fiscal_year?: number;
}
export interface CollectOptions {
  root: string;
  entries: InventoryEntry[];
  fetchImpl?: typeof fetch;
  now?: () => string;
}

export function assertSelectedInventory(entries: InventoryEntry[]): InventoryEntry[] {
  const selected = entries.filter((entry) => entry.status === 'selected');
  if (selected.some((entry) => entry.source_type === 'earnings_call' && entry.fiscal_year && entry.fiscal_year >= 2017 && entry.fiscal_year <= 2019)) throw new Error('holdout source cannot enter persona corpus');
  if (selected.length !== 18) throw new Error(`expected 18 selected sources, got ${selected.length}`);
  return selected;
}
```

로컬 earnings JSON은 `speaker_turns`를 `speaker_turn` block으로, 인터뷰 JSON/CSV의 `text`는 `record` block으로 변환한다. 원본 순서를 유지하고 빈 text는 제외한다.

- [ ] **Step 4: 웹 원문 추출과 원자적 저장 구현**

`cheerio.load(html)` 후 `script, style, nav, header, footer, form, noscript`를 제거하고 `main`, `article`, `[role=main]`, `body` 순서로 첫 유효 본문을 선택한다. 연속 공백을 정규화하고 500자 미만이면 실패한다. 임시 파일에 쓴 뒤 `rename`하여 실패 시 부분 파일이 남지 않게 한다.

```ts
export async function collectSelectedCorpus(options: CollectOptions): Promise<RawSource[]> {
  const selected = assertSelectedInventory(options.entries);
  const seen = new Map<string, string>();
  const results: RawSource[] = [];
  for (const entry of selected) {
    const existing = await readRawSource(rawPath(options.root, entry.source_id)).catch(() => null);
    if (existing && existing.collectionStatus === 'complete' && existing.sourceUrl === entry.url && existing.sourcePath === entry.local_path) {
      results.push(existing);
      for (const block of existing.blocks.filter((item) => !item.duplicateOf)) seen.set(normalizeText(block.text), `${entry.source_id}:${block.blockId}`);
      continue;
    }
    const blocks = entry.local_path
      ? await blocksFromLocalFile(resolve(options.root, entry.local_path), entry.source_type)
      : await blocksFromWeb(entry.url!, options.fetchImpl ?? fetch);
    for (const block of blocks) {
      const key = normalizeText(block.text);
      const canonical = seen.get(key);
      if (canonical) block.duplicateOf = canonical;
      else seen.set(key, `${entry.source_id}:${block.blockId}`);
    }
    const source = makeRawSource(entry, blocks, options.now?.() ?? new Date().toISOString());
    await atomicWriteJson(rawPath(options.root, entry.source_id), source);
    results.push(source);
  }
  return results;
}
```

`makeRawSource`는 `sourceUrl=entry.url`, `sourcePath=entry.local_path`, `collectionStatus='complete'`를 기록하고 정규화된 block 내용으로 SHA-256을 계산한다. 기존 raw 파일이 같은 URL/로컬 경로의 complete 자료이면 network와 원본 파싱을 건너뛰어 재실행 결과를 고정한다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx tsx --test tests/amyHoodPersonaPipeline.test.ts`

Expected: all tests pass; failed fetch creates no raw file.

- [ ] **Step 6: 커밋**

```bash
git add package.json package-lock.json server/personaPipeline/corpus.ts tests/amyHoodPersonaPipeline.test.ts
git commit -m "feat: collect selected Amy Hood source corpus"
```

---

### Task 3: Gemma/OpenAI 모델 Client와 재시작 가능한 분석

**Files:**
- Create: `server/personaPipeline/modelClient.ts`
- Create: `server/personaPipeline/analyzer.ts`
- Create: `agent_prompts/prompts/amy-hood-source-analysis.md`
- Modify: `tests/amyHoodPersonaPipeline.test.ts`

**Interfaces:**
- Produces: `ModelClient { provider, model, invoke(prompt): Promise<ModelResult> }`
- Produces: `createModelClient(provider: ProviderName): ModelClient`
- Produces: `analyzeChunks(options: AnalyzeOptions): Promise<PipelineRunSummary>`
- Produces: `mergeSourceAnalyses(cacheDir, outputPath): Promise<SourceAnalysis[]>`

- [ ] **Step 1: resume Edge Case와 JSON Failure 테스트 추가**

```ts
import { analyzeChunks } from '../server/personaPipeline/analyzer';
import type { ModelClient, ModelResult } from '../server/personaPipeline/modelClient';
import type { SourceChunk } from '../server/personaPipeline/types';

const validAnalysisResult = (): ModelResult => ({
  text: JSON.stringify({
    decisionCriteria: [], priorities: [], tradeoffs: [], riskSignals: [], communicationPatterns: [],
  }),
  elapsedMs: 1,
});
const fakeModel = (handler: (prompt: string) => Promise<ModelResult>): ModelClient => ({ provider: 'local', model: 'gemma4-test', invoke: handler });
const chunk = (chunkId: string): SourceChunk => ({ chunkId, sourceId: 'source-1', index: 0, blockIds: ['b1'], text: 'Amy Hood source text', tokenCount: 4, sha256: `${chunkId}-hash` });

test('edge: resume reuses completed chunks and invokes only missing chunks', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'amy-cache-'));
  const calls: string[] = [];
  const model = fakeModel(async (prompt) => { calls.push(prompt); return validAnalysisResult(); });
  await analyzeChunks({ chunks: [chunk('chunk-1')], provider: 'local', model, cacheDir, prompt: 'analyze {chunk}' });
  calls.length = 0;
  const summary = await analyzeChunks({ chunks: [chunk('chunk-1'), chunk('chunk-2')], provider: 'local', model, cacheDir, prompt: 'analyze {chunk}' });
  assert.equal(summary.reusedChunks, 1);
  assert.equal(summary.completedChunks, 2);
  assert.equal(calls.length, 1);
});

test('failure: invalid JSON retries once and records failed chunk', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'amy-cache-'));
  let calls = 0;
  const model = fakeModel(async () => { calls += 1; return { text: 'not-json', elapsedMs: 1 }; });
  const summary = await analyzeChunks({ chunks: [chunk('bad')], provider: 'local', model, cacheDir, prompt: 'analyze {chunk}' });
  assert.equal(calls, 2);
  assert.equal(summary.failedChunks, 1);
});
```

- [ ] **Step 2: 공유 분석 프롬프트 작성**

```markdown
<!-- agent_prompts/prompts/amy-hood-source-analysis.md -->
You analyze only Amy Hood's publicly available statements in the supplied source chunk.
Separate observed language from inference. Do not attribute another speaker's statement or a Microsoft-wide decision to Amy Hood personally.
Return one JSON object with exactly these array fields:
decisionCriteria, priorities, tradeoffs, riskSignals, communicationPatterns.
Each item must contain statement, conditions, exceptions, sourceLocator.
Use an empty array when the chunk does not support a field. Do not invent private facts.
```

- [ ] **Step 3: provider client 구현**

```ts
// server/personaPipeline/modelClient.ts
import { ChatOpenAI } from '@langchain/openai';
import type { ProviderName } from './types';

export interface ModelResult { text: string; elapsedMs: number; inputTokens?: number; outputTokens?: number }
export interface ModelClient { provider: ProviderName; model: string; invoke(prompt: string): Promise<ModelResult> }

export function createModelClient(provider: ProviderName): ModelClient {
  if (provider === 'openai' && !process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required');
  const modelName = provider === 'local' ? (process.env.LOCAL_LLM_MODEL || 'local-model') : (process.env.OPENAI_MODEL || 'gpt-5-mini');
  const chat = new ChatOpenAI({
    apiKey: provider === 'local' ? (process.env.LOCAL_LLM_API_KEY || 'local') : process.env.OPENAI_API_KEY,
    model: modelName,
    ...(provider === 'local' ? { temperature: 0.2, configuration: { baseURL: process.env.LOCAL_LLM_BASE_URL || 'http://127.0.0.1:8080/v1' } } : {}),
  });
  return {
    provider,
    model: modelName,
    async invoke(prompt) {
      const started = Date.now();
      const result = await chat.invoke(prompt);
      const text = typeof result.content === 'string' ? result.content : result.content.map((part) => 'text' in part ? part.text : '').join('');
      const usage = result.usage_metadata;
      return { text, elapsedMs: Date.now() - started, inputTokens: usage?.input_tokens, outputTokens: usage?.output_tokens };
    },
  };
}
```

- [ ] **Step 4: 분석 cache, 1회 재시도와 병합 구현**

`extractJsonObject`는 fenced JSON 또는 첫 `{`~마지막 `}`를 파싱하고 5개 배열 필드를 검증한다. 성공 cache만 resume 대상으로 인정한다. 실패 cache는 다음 실행에서 다시 시도한다.

```ts
export async function analyzeChunks(options: AnalyzeOptions): Promise<PipelineRunSummary> {
  let reusedChunks = 0, completedChunks = 0, failedChunks = 0;
  for (const chunk of options.chunks) {
    const path = cachePath(options.cacheDir, options.provider, chunk.chunkId);
    const cached = await readCompleteCache(path);
    if (cached) { reusedChunks += 1; completedChunks += 1; continue; }
    let analysis: ChunkAnalysis | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try { analysis = await analyzeOneChunk(chunk, options.model, options.prompt); break; }
      catch (error) { if (attempt === 1) analysis = failedAnalysis(chunk, options, error); }
    }
    await atomicWriteJson(path, analysis!);
    if (analysis!.status === 'complete') completedChunks += 1; else failedChunks += 1;
  }
  return makeSummary(options, { reusedChunks, completedChunks, failedChunks });
}
```

자료별 병합은 `sourceId`로 묶고 각 signal의 정규화된 `statement|conditions|exceptions` 키로 중복 제거한다. 하나라도 failed chunk가 있으면 최종 JSONL을 쓰지 않는다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx tsx --test tests/amyHoodPersonaPipeline.test.ts`

Expected: resume test invokes one missing chunk; invalid JSON invokes exactly twice; all tests pass.

- [ ] **Step 6: 커밋**

```bash
git add agent_prompts/prompts/amy-hood-source-analysis.md server/personaPipeline/modelClient.ts server/personaPipeline/analyzer.ts tests/amyHoodPersonaPipeline.test.ts
git commit -m "feat: analyze persona sources with resumable providers"
```

---

### Task 4: Gemma 검증 게이트와 모델별 Main Master Prompt

**Files:**
- Create: `server/personaPipeline/promptBuilder.ts`
- Create: `agent_prompts/prompts/amy-hood-master-prompt.md`
- Modify: `tests/amyHoodPersonaPipeline.test.ts`

**Interfaces:**
- Produces: `checkGemmaGate(root: string): Promise<GateResult>`
- Produces: `buildMasterPrompt(options: BuildPromptOptions): Promise<string>`

- [ ] **Step 1: 불완전 Gemma와 유료 provider 차단 테스트 추가**

```ts
const validMarkdown = `# Amy Hood Public-Evidence CFO Persona
## Role
## Identity
## Decision Principles
## Cross-Dimension Rules
## Red Lines
## Communication Style
## Unknown Policy
## Response Format`;

test('failure: OpenAI provider is blocked when Gemma gate is incomplete', async () => {
  const incompleteRoot = await mkdtemp(join(tmpdir(), 'amy-gate-'));
  let calls = 0;
  const openaiModel: ModelClient = { provider: 'openai', model: 'gpt-5-mini', invoke: async () => { calls += 1; return { text: validMarkdown, elapsedMs: 1 }; } };
  const gate = await checkGemmaGate(incompleteRoot);
  assert.equal(gate.passed, false);
  await assert.rejects(() => buildMasterPrompt({ root: incompleteRoot, provider: 'openai', model: openaiModel }), /Gemma gate/);
  assert.equal(calls, 0);
});

test('failure: incomplete analysis cannot write a persona prompt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'amy-prompt-'));
  const localModel: ModelClient = { provider: 'local', model: 'gemma4-test', invoke: async () => ({ text: validMarkdown, elapsedMs: 1 }) };
  await assert.rejects(() => buildMasterPrompt({ root, provider: 'local', model: localModel }), /18 source analyses/);
  assert.equal(existsSync(join(root, 'data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md')), false);
});
```

- [ ] **Step 2: 합성 프롬프트 작성**

```markdown
<!-- agent_prompts/prompts/amy-hood-master-prompt.md -->
Using only the supplied source analyses, create a reusable system prompt for an unofficial Amy Hood public-evidence simulation.
Keep only patterns repeated across sources or explicitly stated as principles. Express conditional judgment, priorities, tradeoffs, risk handling, exceptions, and communication style.
The persona answers in Amy Hood's first person, gives actionable financial advice, and may state assumptions when direct memory is absent.
Never invent private facts, claim sole ownership of Microsoft decisions, or repeat the UI disclaimer in every answer.
Return Markdown with: Role, Identity, Decision Principles, Cross-Dimension Rules, Red Lines, Communication Style, Unknown Policy, Response Format.
Do not include user-facing source citations.
```

- [ ] **Step 3: 7개 Gemma gate 검사 구현**

```ts
export interface GateResult { passed: boolean; failures: string[] }
export async function checkGemmaGate(root: string): Promise<GateResult> {
  const failures: string[] = [];
  const inventory = await readInventory(root).catch(() => []);
  const selectedIds = inventory.filter((entry) => entry.status === 'selected').map((entry) => entry.source_id);
  const holdoutIds = new Set(inventory.filter((entry) => entry.status === 'holdout').map((entry) => entry.source_id));
  const raw = await readRawSources(root).catch(() => []);
  const chunks = await readChunkManifest(root).catch(() => []);
  const analyses = await readSourceAnalyses(root, 'local').catch(() => []);
  if (selectedIds.length !== 18 || raw.length !== 18) failures.push('selected raw source count must be 18');
  if (chunks.some((chunk) => holdoutIds.has(chunk.sourceId))) failures.push('holdout chunk detected');
  if (chunks.some((chunk) => chunk.tokenCount > 10_000)) failures.push('chunk token limit exceeded');
  if (analyses.length !== 18 || analyses.some((analysis) => analysis.status !== 'complete')) failures.push('Gemma source analyses incomplete');
  if (!(await pathExists(promptPath(root, 'local')))) failures.push('Gemma persona prompt missing');
  if (!(await pathExists(resolve(root, 'data/b-track/amy-hood/.analysis-cache/local/resume-proof.json')))) failures.push('resume verification missing');
  return { passed: failures.length === 0, failures };
}
```

로컬 프롬프트를 처음 생성할 때는 `prompt missing`과 `resume verification missing` 검사만 제외한 pre-prompt gate를 사용한다. Resume proof는 같은 입력으로 두 번째 실행했을 때 `reusedChunks === chunkCount`이고 모델 분석 호출이 0회이면 `data/b-track/amy-hood/.analysis-cache/local/resume-proof.json`에 기록한다. OpenAI는 prompt와 resume proof를 모두 포함한 full gate만 사용한다.

- [ ] **Step 4: 원자적 프롬프트 생성 구현**

`provider=openai`이면 먼저 full Gemma gate를 호출한다. source analysis가 정확히 18개이고 모두 complete일 때만 모델을 호출한다. Markdown 필수 heading을 검증한 뒤 임시 파일 rename으로 저장한다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx tsx --test tests/amyHoodPersonaPipeline.test.ts`

Expected: OpenAI fake model is never invoked while the Gemma gate fails; no partial Markdown file exists.

- [ ] **Step 6: 커밋**

```bash
git add agent_prompts/prompts/amy-hood-master-prompt.md server/personaPipeline/promptBuilder.ts tests/amyHoodPersonaPipeline.test.ts
git commit -m "feat: gate paid persona prompt generation"
```

---

### Task 5: 단순 CLI Orchestration과 통합 Happy Path

**Files:**
- Create: `server/runAmyHoodPersonaPipeline.ts`
- Modify: `.env.example`
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `tests/amyHoodPersonaPipeline.test.ts`

**Interfaces:**
- Produces: `runPersonaPipeline(options: RunOptions): Promise<PipelineRunSummary>`
- CLI: `analyze [--provider local|openai]`, `check`

- [ ] **Step 1: 단일 통합 Happy Path 테스트 추가**

```ts
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { runPersonaPipeline } from '../server/runAmyHoodPersonaPipeline';

const readJsonl = (path: string) => readFileSync(path, 'utf8').trim().split('\n').map(JSON.parse);
const createSelected18Fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), 'amy-pipeline-'));
  await mkdir(join(root, 'archive'), { recursive: true });
  await mkdir(join(root, 'data/b-track/amy-hood'), { recursive: true });
  await mkdir(join(root, 'agent_prompts/prompts'), { recursive: true });
  const entries: InventoryEntry[] = [];
  for (let index = 0; index < 18; index += 1) {
    const localPath = `archive/source-${index}.json`;
    entries.push({ source_id: `source_${index}`, title: `Source ${index}`, source_type: 'interview', status: 'selected', local_path: localPath, url: null });
    await writeFile(join(root, localPath), JSON.stringify({ records: [{ text: `Amy Hood statement ${index} about demand, investment, margin and risk.` }] }));
  }
  await writeFile(join(root, 'data/b-track/amy-hood/source-inventory.json'), JSON.stringify(entries));
  await writeFile(join(root, 'agent_prompts/prompts/amy-hood-source-analysis.md'), 'Return JSON for {chunk}');
  await writeFile(join(root, 'agent_prompts/prompts/amy-hood-master-prompt.md'), 'Return Markdown from {analyses}');
  return {
    root,
    analysisPath: join(root, 'data/b-track/amy-hood/source-analysis.gemma4.jsonl'),
    promptPath: join(root, 'data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md'),
  };
};

test('happy: selected corpus becomes Gemma analyses and a persona prompt', async () => {
  const fixture = await createSelected18Fixture();
  const model = fakeModel(async (prompt) => prompt.includes('Return Markdown') ? { text: validMarkdown, elapsedMs: 1 } : validAnalysisResult());
  const result = await runPersonaPipeline({ root: fixture.root, provider: 'local', model, tokenCounter: wordCounter });
  assert.equal(result.sourceCount, 18);
  assert.equal(result.failedChunks, 0);
  assert.equal(readJsonl(fixture.analysisPath).length, 18);
  assert.match(readFileSync(fixture.promptPath, 'utf8'), /## Decision Principles/);
});
```

- [ ] **Step 2: llama.cpp `/tokenize` client 구현**

`LOCAL_LLM_BASE_URL=http://127.0.0.1:8080/v1`에서 `/v1`을 제거해 `/tokenize`를 호출한다.

```ts
export const createLocalTokenCounter = (baseUrl = process.env.LOCAL_LLM_BASE_URL || 'http://127.0.0.1:8080/v1'): TokenCounter => async (text) => {
  const endpoint = `${baseUrl.replace(/\/v1\/?$/, '')}/tokenize`;
  const response = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: text, add_special: false }) });
  if (!response.ok) throw new Error(`tokenize failed: ${response.status}`);
  const payload = await response.json() as { tokens?: unknown[] };
  if (!Array.isArray(payload.tokens)) throw new Error('tokenize response missing tokens');
  return payload.tokens.length;
};
```

- [ ] **Step 3: `runPersonaPipeline`과 CLI 구현**

실행 순서는 inventory 읽기 → corpus 보장 → 공통 chunk manifest 생성/재사용 → provider model 분석 → source JSONL 병합 → provider prompt 생성 → summary 출력이다. `check`는 network와 model을 호출하지 않고 파일/게이트만 읽는다.

```ts
const provider = readProviderFlag(process.argv) ?? 'local';
const command = process.argv[2] ?? 'analyze';
if (command === 'check') console.log(JSON.stringify(await checkGemmaGate(process.cwd()), null, 2));
else if (command === 'analyze') console.log(JSON.stringify(await runPersonaPipeline({ root: process.cwd(), provider }), null, 2));
else throw new Error(`unknown command: ${command}`);
```

- [ ] **Step 4: 환경변수와 npm scripts 수정**

`.env.example`의 llama-server 예시를 `-c 16384`로 바꾸고 다음을 추가한다.

```dotenv
LLM_PROVIDER="local"
LOCAL_LLM_CONTEXT_SIZE="16384"
LOCAL_LLM_CHUNK_TOKENS="10000"
OPENAI_API_KEY=""
OPENAI_MODEL="gpt-5-mini"
```

`package.json` scripts에 다음을 추가한다.

```json
"persona:test": "tsx --test tests/amyHoodPersonaPipeline.test.ts",
"persona:analyze": "tsx server/runAmyHoodPersonaPipeline.ts analyze",
"persona:check": "tsx server/runAmyHoodPersonaPipeline.ts check"
```

`.gitignore`에는 다음 한 줄을 추가한다.

```gitignore
data/b-track/amy-hood/.analysis-cache/
```

- [ ] **Step 5: 전체 TDD와 정적 검사 실행**

Run: `npm run persona:test && npm run lint`

Expected: Test Plan의 1 Happy Path, 정확히 3 Edge Cases와 모든 Failure Paths pass; TypeScript errors `0`.

- [ ] **Step 6: 커밋**

```bash
git add .env.example .gitignore package.json server/runAmyHoodPersonaPipeline.ts tests/amyHoodPersonaPipeline.test.ts
git commit -m "feat: add Amy Hood persona pipeline CLI"
```

---

### Task 6: 동일 홀드아웃 문항 평가 출력

**Files:**
- Create: `server/personaPipeline/evaluator.ts`
- Modify: `server/runAmyHoodPersonaPipeline.ts`
- Modify: `package.json`
- Modify: `tests/amyHoodPersonaPipeline.test.ts`

**Interfaces:**
- Consumes: `evaluation/amy_hood_decision_eval_questions_15.json`, provider별 persona Markdown
- Produces: `evaluatePersona(options: EvaluateOptions): Promise<EvaluationResult>`
- Generates: `evaluation/amy-hood-persona-eval.<provider>.json`

- [ ] **Step 1: holdout 본문이 모델 입력에 들어가지 않는 Failure 테스트 추가**

```ts
test('failure: evaluator sends questions but never holdout transcript text', async () => {
  const root = await mkdtemp(join(tmpdir(), 'amy-eval-'));
  const secretHoldoutTranscriptSentence = 'SECRET HOLDOUT AMY HOOD TRANSCRIPT';
  await mkdir(join(root, 'data/b-track/amy-hood'), { recursive: true });
  await mkdir(join(root, 'evaluation'), { recursive: true });
  await mkdir(join(root, 'archive'), { recursive: true });
  await writeFile(join(root, 'data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md'), validMarkdown);
  await writeFile(join(root, 'evaluation/amy_hood_decision_eval_questions_15.json'), JSON.stringify({ questions: Array.from({ length: 15 }, (_, index) => ({ id: `q${index}`, question: `Question ${index}`, expected_focus: [], grading_notes: [] })) }));
  await writeFile(join(root, 'archive/fy2017_q1.json'), JSON.stringify({ transcript: secretHoldoutTranscriptSentence }));
  const prompts: string[] = [];
  const model = fakeModel(async (prompt) => { prompts.push(prompt); return { text: '판단 답변', elapsedMs: 1 }; });
  await evaluatePersona({ root, provider: 'local', model });
  assert.equal(prompts.length, 15);
  assert.equal(prompts.some((prompt) => prompt.includes(secretHoldoutTranscriptSentence)), false);
});
```

- [ ] **Step 2: evaluator 구현**

각 호출의 system 영역에는 해당 provider의 persona Markdown만, user 영역에는 `question`과 “출처를 표시하지 말고 Amy Hood 1인칭 조언으로 답하라”는 지시만 넣는다. 정답 힌트 누출을 막기 위해 `expected_focus`, `holdout_target`, `grading_notes`는 모델 입력이 아니라 결과 메타데이터에만 보존한다.

```ts
export interface EvaluationAnswer { questionId: string; question: string; answer: string; expectedFocus: string[]; holdoutTarget?: string; gradingNotes?: string[]; elapsedMs: number }
export interface EvaluationResult { provider: ProviderName; model: string; personaPath: string; questionsPath: string; answers: EvaluationAnswer[] }

export async function evaluatePersona(options: EvaluateOptions): Promise<EvaluationResult> {
  const persona = await readFile(promptPath(options.root, options.provider), 'utf8');
  const questions = await readQuestions(options.root);
  const answers: EvaluationAnswer[] = [];
  for (const item of questions.questions) {
    const result = await options.model.invoke(`${persona}\n\n[USER QUESTION]\n${item.question}\n\nAnswer as Amy Hood in first person without source citations.`);
    answers.push({ questionId: item.id, question: item.question, answer: result.text, expectedFocus: item.expected_focus, holdoutTarget: item.holdout_target, gradingNotes: item.grading_notes, elapsedMs: result.elapsedMs });
  }
  return atomicWriteEvaluation(options, answers);
}
```

- [ ] **Step 3: CLI와 script 연결**

`evaluate [--provider local|openai]` command를 추가하고 `package.json`에 다음을 추가한다.

```json
"persona:evaluate": "tsx server/runAmyHoodPersonaPipeline.ts evaluate"
```

`provider=openai`은 full Gemma gate와 존재하는 `AMY_HOOD_PERSONA.gpt5-mini.md`를 모두 확인한 뒤 호출한다.

- [ ] **Step 4: 테스트, lint와 build 실행**

Run: `npm run persona:test && npm run lint && npm run build`

Expected: all tests pass; TypeScript errors `0`; Vite build exits `0`.

- [ ] **Step 5: 커밋**

```bash
git add package.json server/personaPipeline/evaluator.ts server/runAmyHoodPersonaPipeline.ts tests/amyHoodPersonaPipeline.test.ts
git commit -m "feat: evaluate generated Amy Hood persona prompts"
```

---

### Task 7: 실제 18개 자료와 Gemma 4 검증

**Files:**
- Generate: `data/b-track/amy-hood/raw-sources/*.json`
- Generate: `data/b-track/amy-hood/chunks/manifest.json`
- Generate: `data/b-track/amy-hood/.analysis-cache/local/*.json`
- Generate: `data/b-track/amy-hood/source-analysis.gemma4.jsonl`
- Generate: `data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md`
- Generate: `evaluation/amy-hood-persona-eval.local.json`

**Interfaces:**
- Consumes: running Gemma 4 llama.cpp server with `-c 16384`
- Produces: full Gemma gate `passed: true`

- [ ] **Step 1: 로컬 서버 사전 점검**

Run: `curl -fsS http://127.0.0.1:8080/v1/models`

Expected: configured `LOCAL_LLM_MODEL` appears. If unavailable, stop without switching provider and report the exact connection error.

- [ ] **Step 2: 전체 테스트와 inventory 계약 재검증**

Run: `npm run inventory:test && npm run inventory:build -- --check && npm run persona:test`

Expected: inventory `58`, selected `18`, holdout `12`; all persona tests pass.

- [ ] **Step 3: Gemma 4 전체 파이프라인 실행**

Run: `npm run persona:analyze`

Expected: `provider=local`, `sourceCount=18`, `failedChunks=0`; Gemma analysis JSONL and persona Markdown exist.

- [ ] **Step 4: resume 동작을 실제로 재검증**

Run: `npm run persona:analyze`

Expected: `reusedChunks` equals `chunkCount`; model 분석 call count is `0`; prompt hash is unchanged when inputs are unchanged. 이 결과를 resume proof 파일에 기록한다.

- [ ] **Step 5: gate와 홀드아웃 평가 실행**

Run: `npm run persona:check && npm run persona:evaluate`

Expected: gate `passed: true`; 15 answers in `evaluation/amy-hood-persona-eval.local.json`.

- [ ] **Step 6: 생성물과 원본 비변경 검사**

Run:

```bash
git diff --exit-code 5b5f96b..HEAD -- archive server/agentService.ts server/ragService.ts server/vectorRagService.ts src/App.tsx src/components/PersonasView.tsx
git diff --check
```

Expected: command exits `0`; archive and legacy RAG/UI paths are unchanged.

- [ ] **Step 7: 재현 가능한 생성물만 커밋**

`.analysis-cache`는 커밋하지 않는다. 설계에서 합의한 normalized raw source, chunk manifest, source analysis, persona Markdown과 local evaluation만 stage한다.

```bash
git add data/b-track/amy-hood/raw-sources data/b-track/amy-hood/chunks/manifest.json data/b-track/amy-hood/source-analysis.gemma4.jsonl data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md evaluation/amy-hood-persona-eval.local.json
git diff --cached --check
git commit -m "data: generate Gemma Amy Hood persona prompt"
```

---

### Task 8: 유료 GPT-5 mini 비교 실행 게이트

**Files:**
- Generate after explicit confirmation: `data/b-track/amy-hood/source-analysis.gpt5-mini.jsonl`
- Generate after explicit confirmation: `data/b-track/amy-hood/AMY_HOOD_PERSONA.gpt5-mini.md`
- Generate after explicit confirmation: `evaluation/amy-hood-persona-eval.openai.json`

**Interfaces:**
- Consumes: full Gemma gate `passed: true`, explicit user confirmation, `OPENAI_API_KEY`
- Produces: same-chunk GPT-5 mini comparison artifacts

- [ ] **Step 1: 사용자에게 Gemma gate 결과와 예상 호출 범위를 보고**

보고에는 source 수, chunk 수, Gemma 성공/실패, resume proof, 생성된 prompt 경로를 포함한다. 이 시점에는 OpenAI API를 호출하지 않는다.

- [ ] **Step 2: 명시적 승인과 key 존재 확인**

Run after approval: `test -n "$OPENAI_API_KEY"`

Expected: exit `0`. 실패하면 유료 호출 없이 중단한다.

- [ ] **Step 3: GPT-5 mini 분석과 프롬프트 생성**

Run after approval: `npm run persona:analyze -- --provider openai`

Expected: `provider=openai`, model `gpt-5-mini`, 동일 `chunkCount`, `failedChunks=0`.

- [ ] **Step 4: 동일 문항 평가**

Run after approval: `npm run persona:evaluate -- --provider openai`

Expected: local 결과와 동일한 15 question IDs를 가진 OpenAI 평가 파일 생성.

- [ ] **Step 5: 모델 독립성과 비교 계약 검사**

Run:

```bash
node -e "const fs=require('fs'); const l=JSON.parse(fs.readFileSync('data/b-track/amy-hood/chunks/manifest.json')); const a=fs.readFileSync('data/b-track/amy-hood/source-analysis.gpt5-mini.jsonl','utf8').trim().split('\n').map(JSON.parse); if(l.length===0||a.length!==18) process.exit(1); console.log({chunks:l.length,openaiSources:a.length})"
```

Expected: common chunks greater than `0`, OpenAI sources `18`; OpenAI analysis records identify only `provider=openai`, `model=gpt-5-mini`.

- [ ] **Step 6: 비교 산출물 커밋**

```bash
git add data/b-track/amy-hood/source-analysis.gpt5-mini.jsonl data/b-track/amy-hood/AMY_HOOD_PERSONA.gpt5-mini.md evaluation/amy-hood-persona-eval.openai.json
git diff --cached --check
git commit -m "data: compare GPT-5 mini Amy Hood persona"
```

---

## Final Verification

Run fresh after all authorized tasks:

```bash
npm run inventory:test
npm run inventory:build -- --check
npm run persona:test
npm run persona:check
npm run lint
npm run build
git diff --check
git status --short
```

Expected:

- Inventory tests: `7` tests, failures `0`
- Inventory: entries `58`, selected `18`, holdout `12`
- Persona tests: Happy Path `1`, Edge Cases `3`, all Failure Paths pass
- Gemma gate: `passed: true`
- TypeScript errors: `0`
- Vite build: exit `0`
- Worktree has no unexpected or unstaged files

## Implementation Boundary

이 계획은 raw source 수집, 두 provider가 공유하는 chunk, 모델별 분석·Main Master Prompt와 동일 문항 평가까지만 구현한다. 새 RAG 색인, 질문별 장기 기억 검색, 기존 정적 RAG UI/API 제거와 사용자 화면 연결은 이 계획이 끝난 뒤 별도 설계와 계획으로 진행한다.
