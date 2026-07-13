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
import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { buildChunks } from '../server/personaPipeline/chunker';
import {
  assertSelectedInventory,
  collectSelectedCorpus,
  type InventoryEntry,
} from '../server/personaPipeline/corpus';
import { analyzeChunks } from '../server/personaPipeline/analyzer';
import type { ModelClient, ModelResult } from '../server/personaPipeline/modelClient';
import type { RawSource, SourceChunk } from '../server/personaPipeline/types';

const wordCounter = async (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

const validAnalysisResult = (): ModelResult => ({
  text: JSON.stringify({
    decisionCriteria: [],
    priorities: [],
    tradeoffs: [],
    riskSignals: [],
    communicationPatterns: [],
  }),
  elapsedMs: 1,
});

const fakeModel = (
  handler: (prompt: string) => Promise<ModelResult>,
  provider: ModelClient['provider'] = 'local',
): ModelClient => ({
  provider,
  model: provider === 'local' ? 'gemma4-test' : 'gpt-5-mini',
  invoke: handler,
});

const sourceChunk = (chunkId: string): SourceChunk => ({
  chunkId,
  sourceId: 'source-1',
  index: 0,
  blockIds: ['b1'],
  text: 'Amy Hood source text',
  tokenCount: 4,
  sha256: `${chunkId}-hash`,
});

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
  const chunks = await buildChunks(
    rawSource([{ blockId: 'b1', kind: 'paragraph', text: 'one two three' }]),
    wordCounter,
    { maxSourceTokens: 10, overlapMinTokens: 1, overlapMaxTokens: 2 },
  );

  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].tokenCount, 3);
});

test('edge: speaker block stays intact near boundary', async () => {
  const chunks = await buildChunks(
    rawSource([
      { blockId: 'b1', kind: 'speaker_turn', speaker: 'Interviewer', text: 'one two three four' },
      { blockId: 'b2', kind: 'speaker_turn', speaker: 'Amy Hood', text: 'five six seven eight' },
      { blockId: 'b3', kind: 'speaker_turn', speaker: 'Interviewer', text: 'nine ten eleven twelve' },
    ]),
    wordCounter,
    { maxSourceTokens: 11, overlapMinTokens: 0, overlapMaxTokens: 0 },
  );

  assert.deepEqual(chunks.map((chunk) => chunk.blockIds), [['b1', 'b2'], ['b3']]);
});

test('failure: holdout earnings source cannot be selected', () => {
  const entries: InventoryEntry[] = Array.from({ length: 18 }, (_, index) => ({
    source_id: `selected_${index}`,
    title: `Source ${index}`,
    source_type: 'interview',
    status: 'selected',
    local_path: `archive/${index}.json`,
    url: null,
  }));
  entries[0] = {
    ...entries[0],
    source_id: 'earnings_fy2017_q1',
    source_type: 'earnings_call',
    fiscal_year: 2017,
  };

  assert.throws(() => assertSelectedInventory(entries), /holdout/);
});

test('failure: unavailable web source leaves no partial raw file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'amy-corpus-'));
  const entries: InventoryEntry[] = [
    {
      source_id: 'web_1',
      title: 'Web source',
      source_type: 'interview',
      status: 'selected',
      local_path: null,
      url: 'https://example.test/fail',
    },
    ...Array.from({ length: 17 }, (_, index) => ({
      source_id: `local_${index}`,
      title: `Local source ${index}`,
      source_type: 'interview',
      status: 'selected',
      local_path: `archive/${index}.json`,
      url: null,
    })),
  ];

  await assert.rejects(
    () =>
      collectSelectedCorpus({
        root,
        entries,
        fetchImpl: async () => new Response('', { status: 503 }),
        now: () => '2026-07-13T00:00:00.000Z',
      }),
    /503/,
  );
  assert.equal(
    existsSync(join(root, 'data/b-track/amy-hood/raw-sources/web_1.json')),
    false,
  );
});

test('edge: resume reuses completed chunks and invokes only missing chunks', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'amy-cache-'));
  const calls: string[] = [];
  const model = fakeModel(async (prompt) => {
    calls.push(prompt);
    return validAnalysisResult();
  });
  const prompt = 'Analyze this chunk:\n{chunk}';

  await analyzeChunks({
    chunks: [sourceChunk('chunk-1')],
    provider: 'local',
    model,
    cacheDir,
    prompt,
  });
  calls.length = 0;
  const summary = await analyzeChunks({
    chunks: [sourceChunk('chunk-1'), sourceChunk('chunk-2')],
    provider: 'local',
    model,
    cacheDir,
    prompt,
  });

  assert.equal(summary.reusedChunks, 1);
  assert.equal(summary.completedChunks, 2);
  assert.equal(calls.length, 1);
});

test('failure: invalid JSON retries once and records failed chunk', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'amy-cache-'));
  let calls = 0;
  const model = fakeModel(async () => {
    calls += 1;
    return { text: 'not-json', elapsedMs: 1 };
  });

  const summary = await analyzeChunks({
    chunks: [sourceChunk('bad')],
    provider: 'local',
    model,
    cacheDir,
    prompt: 'Analyze this chunk:\n{chunk}',
  });

  assert.equal(calls, 2);
  assert.equal(summary.failedChunks, 1);
});
