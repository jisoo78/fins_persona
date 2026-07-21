/**
 * Test Plan:
 * 1. Happy Path:
 *    - Export 90 blind packets for one complete repetition and import 90 local grades.
 * 2. Edge Cases:
 *    - Preserve the existing 450-packet export when no repetition is supplied.
 *    - Accept fenced score JSON through the local judge parser.
 *    - Resume a matching checkpoint without calling the judge again.
 * 3. Failure Path:
 *    - Preserve the draft and active pointer when model invocation or score validation fails.
 */
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import {
  assertEvaluationV5JudgePacketsBlind,
  exportEvaluationV5JudgePackets,
  loadEvaluationV5JudgeLinks,
} from '../server/evaluationV5/judge';
import {
  localJudgeDraftPath,
  parseLocalJudgeScore,
  runEvaluationV5LocalJudge,
} from '../server/evaluationV5/localJudge';
import { evaluationV5Paths } from '../server/evaluationV5/paths';
import { installEvaluationV5GradingFixture } from './helpers/evaluationV5GradingFixture';

const jsonResponse = (value: unknown, status = 200) => new Response(
  JSON.stringify(value),
  { status, headers: { 'content-type': 'application/json' } },
);

const createJudgeFetch = () => {
  let modelCalls = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.endsWith('/models')) {
      return jsonResponse({ data: [{ id: 'gemma4-v2-Q8_0.gguf' }] });
    }
    modelCalls += 1;
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
    const system = body.messages[0]?.content ?? '';
    return jsonResponse({
      choices: [{
        message: {
          content: system.includes('no numeric score')
            ? '후보 행동은 동결된 판단 기준의 행동과 조건을 일관되게 반영한다.'
            : JSON.stringify({
              score: 8,
              anchorFindings: {
                action: 'aligned',
                priority: 'aligned',
                guardrails: 'partial',
                reversal: 'aligned',
              },
            }),
        },
      }],
    });
  };
  return { fetchImpl, calls: () => modelCalls };
};

test('happy: exports and locally judges one complete 90-answer repetition', async () => {
  const fixture = await installEvaluationV5GradingFixture();
  const exported = await exportEvaluationV5JudgePackets(fixture.root, fixture.groupId, { repetition: 1 });
  const links = await loadEvaluationV5JudgeLinks(fixture.root, fixture.groupId);
  assert.equal(exported.packets.length, 90);
  assert.equal(links.links.length, 90);
  assert.equal(links.links.every(({ repetition }) => repetition === 1), true);
  assert.doesNotThrow(() => assertEvaluationV5JudgePacketsBlind(exported.packets));

  const local = createJudgeFetch();
  const result = await runEvaluationV5LocalJudge({
    root: fixture.root,
    experimentGroupId: fixture.groupId,
    repetition: 1,
    baseUrl: 'http://127.0.0.1:8082/v1',
    fetchImpl: local.fetchImpl,
    now: () => '2026-07-21T10:00:00.000Z',
  });
  assert.equal(result.packetCount, 90);
  assert.equal(result.gradedCount, 90);
  assert.equal(result.resumedCount, 0);
  assert.equal(result.meanAas, 8);
  assert.equal(local.calls(), 180);
  const active = JSON.parse(await readFile(
    path.join(evaluationV5Paths(fixture.root).grades, fixture.groupId, 'active.json'),
    'utf8',
  )) as { batchHash: string };
  assert.equal(active.batchHash, result.batchHash);
});

test('edge: unfiltered export preserves the formal 450-packet contract', async () => {
  const fixture = await installEvaluationV5GradingFixture();
  assert.equal((await exportEvaluationV5JudgePackets(fixture.root, fixture.groupId)).packets.length, 450);
});

test('edge: fenced local score JSON is accepted', () => {
  assert.deepEqual(parseLocalJudgeScore(`\`\`\`json
{"score":9,"anchorFindings":{"action":"aligned","priority":"aligned","guardrails":"partial","reversal":"aligned"}}
\`\`\``), {
    score: 9,
    anchorFindings: {
      action: 'aligned',
      priority: 'aligned',
      guardrails: 'partial',
      reversal: 'aligned',
    },
  });
});

test('edge: matching checkpoint resumes without duplicate judge calls', async () => {
  const fixture = await installEvaluationV5GradingFixture();
  const first = createJudgeFetch();
  await runEvaluationV5LocalJudge({
    root: fixture.root,
    experimentGroupId: fixture.groupId,
    repetition: 1,
    baseUrl: 'http://127.0.0.1:8082/v1',
    fetchImpl: first.fetchImpl,
  });
  const second = createJudgeFetch();
  const result = await runEvaluationV5LocalJudge({
    root: fixture.root,
    experimentGroupId: fixture.groupId,
    repetition: 1,
    baseUrl: 'http://127.0.0.1:8082/v1',
    fetchImpl: second.fetchImpl,
  });
  assert.equal(result.resumedCount, 90);
  assert.equal(result.gradedCount, 0);
  assert.equal(second.calls(), 0);
});

test('failure: interrupted judging preserves the draft without activating a partial batch', async () => {
  const fixture = await installEvaluationV5GradingFixture();
  let postCalls = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    if (String(input).endsWith('/models')) {
      return jsonResponse({ data: [{ id: 'gemma4-v2-Q8_0.gguf' }] });
    }
    postCalls += 1;
    if (postCalls === 3) throw new Error('judge unavailable');
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
    const rationale = (body.messages[0]?.content ?? '').includes('no numeric score');
    return jsonResponse({ choices: [{ message: { content: rationale
      ? '첫 패킷은 판단 기준과 대체로 일치한다.'
      : '{"score":8,"anchorFindings":{"action":"aligned","priority":"aligned","guardrails":"partial","reversal":"aligned"}}' } }] });
  };
  await assert.rejects(
    runEvaluationV5LocalJudge({
      root: fixture.root,
      experimentGroupId: fixture.groupId,
      repetition: 1,
      baseUrl: 'http://127.0.0.1:8082/v1',
      fetchImpl,
    }),
    /judge unavailable/i,
  );
  const draft = JSON.parse(await readFile(
    localJudgeDraftPath(fixture.root, fixture.groupId, 1),
    'utf8',
  )) as { grades: unknown[] };
  assert.equal(draft.grades.length, 1);
  await assert.rejects(
    access(path.join(evaluationV5Paths(fixture.root).grades, fixture.groupId, 'active.json')),
  );
});
