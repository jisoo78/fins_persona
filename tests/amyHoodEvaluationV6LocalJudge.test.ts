/**
 * Test Plan:
 * 1. Happy Path:
 *    - Judge a blind packet with rationale-first calls and deterministic host scoring.
 * 2. Edge Cases:
 *    - Accept fenced assessment JSON.
 *    - Resume a matching checkpoint without issuing duplicate model calls.
 *    - Repair one malformed assessment response exactly once.
 * 3. Failure Path:
 *    - Preserve only the draft and reject empty, HTTP-failed, stale, or twice-invalid responses.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildEvaluationV6JudgePacket } from '../server/evaluationV6/judge';
import {
  parseEvaluationV6JudgeAssessment,
  runEvaluationV6LocalPacketBatch,
} from '../server/evaluationV6/localJudge';
import { evaluationV6BundleFixture } from './helpers/evaluationV6Fixture';

const assessment = JSON.stringify({
  identityVerdict: 'amy_aligned',
  components: { action: 4, priorityOrder: 4, boundaries: 4, reversal: 4, identitySpecificity: 4 },
  anchorFindings: { action: 'aligned', priority: 'aligned', guardrails: 'aligned', reversal: 'aligned' },
  distinguishingAnchor: { kind: 'priority_order', statement: 'customer demand first' },
});
const packet = () => {
  const bundle = evaluationV6BundleFixture();
  return buildEvaluationV6JudgePacket(
    bundle.scenarioFile.scenarios[0],
    bundle.calibrationAnswers[0].candidateResponse,
    bundle.identityKeys[0],
    'packet-calibration-1',
  );
};
const response = (content: string, ok = true, status = 200) => ({
  ok, status, json: async () => ({ choices: [{ message: { content } }] }),
}) as Response;
const options = async (fetchImpl: typeof fetch) => ({
  root: await mkdtemp(path.join(os.tmpdir(), 'evaluation-v6-local-')),
  experimentGroupId: 'calibration-1',
  batchKind: 'calibration' as const,
  batchHash: 'a'.repeat(64),
  packets: [packet()],
  baseUrl: 'http://127.0.0.1:8082/v1',
  judgeModel: 'gemma4-v2-Q8_0.gguf',
  fetchImpl,
  now: () => '2026-07-21T12:00:00.000Z',
});

test('happy: makes rationale-first deterministic calls and host-scores the result', async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return response(bodies.length === 1 ? '고객 수요를 우선하고 수익성과 반전 경계를 명시한 판단이다.' : assessment);
  }) as typeof fetch;
  const result = await runEvaluationV6LocalPacketBatch(await options(fetchImpl));
  assert.equal(result.grades[0].score, 10);
  assert.equal(result.grades[0].repairApplied, false);
  assert.equal(bodies.length, 2);
  assert.ok(bodies.every((body) => body.temperature === 0 && body.stream === false));
  assert.ok(bodies.every((body) => (body.chat_template_kwargs as { enable_thinking: boolean }).enable_thinking === false));
  const assessmentMessages = bodies[1].messages as Array<{ role: string; content: string }>;
  assert.match(assessmentMessages[0].content, /"anchorFindings":\{"action":"aligned\|partial\|missing\|conflict"/);
  assert.match(assessmentMessages[0].content, /"distinguishingAnchor":\{"kind":/);
  assert.match(assessmentMessages[0].content, /Do not rewrite, repair, or improve the candidate response/i);
});

test('edge: accepts fenced assessment JSON', () => {
  assert.equal(parseEvaluationV6JudgeAssessment(`\`\`\`json\n${assessment}\n\`\`\``).identityVerdict, 'amy_aligned');
});

test('edge: resumes a matching checkpoint without duplicate calls', async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return response(calls === 1 ? '고객 수요와 반전 경계를 구분한 판단이다.' : assessment);
  }) as typeof fetch;
  const configured = await options(fetchImpl);
  await runEvaluationV6LocalPacketBatch(configured);
  const resumed = await runEvaluationV6LocalPacketBatch({ ...configured, fetchImpl: (async () => {
    throw new Error('must not call');
  }) as typeof fetch });
  assert.equal(resumed.resumedCount, 1);
  assert.equal(resumed.gradedCount, 0);
});

test('edge: repairs malformed assessment exactly once', async () => {
  const values = ['고객 수요를 먼저 보되 반전 기준을 유지한 판단이다.', '{bad', assessment];
  let calls = 0;
  const fetchImpl = (async () => response(values[calls++])) as typeof fetch;
  const result = await runEvaluationV6LocalPacketBatch(await options(fetchImpl));
  assert.equal(result.grades[0].repairApplied, true);
  assert.equal(calls, 3);
});

test('failure: rejects dependency and repeated schema failures without a complete batch', async () => {
  const empty = (async () => response('')) as typeof fetch;
  await assert.rejects(() => options(empty).then(runEvaluationV6LocalPacketBatch), /empty content/i);
  const failed = (async () => response('', false, 503)) as typeof fetch;
  await assert.rejects(() => options(failed).then(runEvaluationV6LocalPacketBatch), /HTTP 503/i);
  const values = ['고객 수요를 구분한 판단이다.', '{bad', '{still-bad'];
  let calls = 0;
  const invalid = (async () => response(values[calls++])) as typeof fetch;
  const invalidOptions = await options(invalid);
  await assert.rejects(() => runEvaluationV6LocalPacketBatch(invalidOptions), /JSON|Unexpected token|property/i);
  const draft = JSON.parse(await readFile(path.join(
    invalidOptions.root,
    'evaluation/v6/judge/local-drafts/calibration-1/calibration.json',
  ), 'utf8')) as { grades: unknown[]; failures: Array<{ packetId: string }> };
  assert.equal(draft.grades.length, 0);
  assert.equal(draft.failures[0].packetId, 'packet-calibration-1');
});
