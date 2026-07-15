/**
 * Test Plan:
 * 1. Happy Path:
 *    - a public question and valid full-memory context produce one bounded model input and a parsed choice-reason response.
 *
 * 2. Edge Cases:
 *    - fenced JSON is accepted.
 *    - a Korean reason is preserved exactly.
 *    - no-RAG arms load and require an empty context without an active memory release.
 *
 * 3. Failure Path:
 *    - answer-key fields, invalid responses, context in no-RAG arms, and missing or incomplete memory releases fail safely.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import type { EvaluationV3Question } from '../shared/amyHoodEvaluationV3';
import {
  buildEvaluationV3Input,
  parseEvaluationV3Response,
} from '../server/evaluationV3/prompt';
import {
  emptyEvaluationV3Context,
  loadEvaluationV3ArmContext,
  type EvaluationV3ContextPackage,
} from '../server/evaluationV3/context';

const question: EvaluationV3Question = {
  id: 'T01',
  category: 'new_advisory_transfer',
  type: 'multiple_choice',
  domain: 'ai_cloud_capex',
  requiredSplit: 'none',
  prompt: '검증된 수요보다 설비투자가 앞설 때 어떤 순서로 판단해야 합니까?',
  options: [
    '수요 검증과 단계별 용량 투자를 연결한다.',
    '시장 점유율을 위해 즉시 최대 용량을 확보한다.',
    '단기 마진이 회복될 때까지 모든 투자를 중단한다.',
    '경쟁사의 투자액과 같은 규모를 집행한다.',
  ],
};

const fullContext: EvaluationV3ContextPackage = {
  memoryReleaseId: 'memory-1.0.0',
  policy: ['수요 신호에 맞춰 투자를 단계화한다.'],
  reflections: ['확신보다 검증 가능한 이정표를 먼저 둔다.'],
  events: ['수요와 용량의 시차를 관리한 비홀드아웃 사건'],
  counterexamples: ['수요가 약할 때 투자를 늦춘 반례'],
};

const createMemoryFixture = async (
  context: Omit<EvaluationV3ContextPackage, 'memoryReleaseId'>,
  counterexampleStatus: 'reviewed' | 'no_reviewed_counterexample' = 'reviewed',
) => {
  const root = await mkdtemp(join(tmpdir(), 'evaluation-v3-memory-'));
  const releaseRoot = join(
    root,
    'data/b-track/amy-hood/advisor/memory-releases/1.0.0',
  );
  await mkdir(releaseRoot, { recursive: true });
  await writeFile(
    join(root, 'data/b-track/amy-hood/advisor/memory-releases/active.json'),
    JSON.stringify({
      releaseId: 'memory-1.0.0',
      version: '1.0.0',
      manifestHash: 'manifest-hash',
      activatedAt: '2026-07-15T00:00:00.000Z',
    }),
  );
  await writeFile(
    join(releaseRoot, 'evaluation-context.json'),
    JSON.stringify({
      releaseId: 'memory-1.0.0',
      counterexampleStatus,
      ...context,
    }),
  );
  return root;
};

test('happy: full RAG input contains only public question data and structured memory', () => {
  const input = buildEvaluationV3Input('SYSTEM', question, fullContext, 'amy_full_rag');
  assert.equal(input.system, 'SYSTEM');
  assert.match(input.user, /검증된 수요보다 설비투자가/);
  assert.match(input.user, /수요 신호에 맞춰 투자를 단계화/);
  assert.doesNotMatch(input.user, /correctChoice|trapIntent|answer-key/);
  assert.deepEqual(
    parseEvaluationV3Response(question, '{"choice":1,"reason":"수요 검증을 우선합니다."}'),
    { choice: 1, reason: '수요 검증을 우선합니다.' },
  );
});

test('edge: fenced JSON response is accepted', () => {
  assert.deepEqual(
    parseEvaluationV3Response(
      question,
      '```json\n{"choice":2,"reason":"두 번째 판단을 택합니다."}\n```',
    ),
    { choice: 2, reason: '두 번째 판단을 택합니다.' },
  );
});

test('edge: Korean reason is preserved exactly', () => {
  const reason = '단기 마진보다 검증된 고객 수요와 단계적 집행을 우선합니다.';
  assert.equal(
    parseEvaluationV3Response(question, JSON.stringify({ choice: 1, reason })).reason,
    reason,
  );
});

test('edge: no-RAG arms stay empty without an active release', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evaluation-v3-no-memory-'));
  assert.deepEqual(
    await loadEvaluationV3ArmContext(root, 'generic_cfo'),
    emptyEvaluationV3Context(),
  );
  assert.deepEqual(
    await loadEvaluationV3ArmContext(root, 'amy_prompt'),
    emptyEvaluationV3Context(),
  );
});

test('failure: private answer fields and no-RAG context are rejected', () => {
  assert.throws(
    () => buildEvaluationV3Input(
      'SYSTEM',
      { ...question, correctChoice: 2 } as never,
      emptyEvaluationV3Context(),
      'amy_prompt',
    ),
    /unknown public question field: correctChoice/,
  );
  assert.throws(
    () => buildEvaluationV3Input('SYSTEM', question, fullContext, 'generic_cfo'),
    /generic_cfo context must be empty/,
  );
});

test('failure: invalid choice and missing reason are rejected', () => {
  assert.throws(
    () => parseEvaluationV3Response(question, '{"choice":5,"reason":"범위 밖"}'),
    /choice must be an integer from 1 to 4/,
  );
  assert.throws(
    () => parseEvaluationV3Response(question, '{"choice":1,"reason":"  "}'),
    /reason is required/,
  );
});

test('failure: RAG arms require the correct structured memory layers', async () => {
  const missingRoot = await mkdtemp(join(tmpdir(), 'evaluation-v3-missing-memory-'));
  await assert.rejects(
    () => loadEvaluationV3ArmContext(missingRoot, 'amy_policy_rag'),
    /active memory release is required/,
  );

  const incompleteRoot = await createMemoryFixture({
    policy: ['정책'],
    reflections: ['성찰'],
    events: ['사건'],
    counterexamples: [],
  });
  await assert.rejects(
    () => loadEvaluationV3ArmContext(incompleteRoot, 'amy_full_rag'),
    /reviewed counterexample or explicit absence marker is required/,
  );

  const markedRoot = await createMemoryFixture(
    { policy: ['정책'], reflections: ['성찰'], events: ['사건'], counterexamples: [] },
    'no_reviewed_counterexample',
  );
  assert.deepEqual(
    await loadEvaluationV3ArmContext(markedRoot, 'amy_full_rag'),
    {
      memoryReleaseId: 'memory-1.0.0',
      policy: ['정책'],
      reflections: ['성찰'],
      events: ['사건'],
      counterexamples: [],
    },
  );
});
