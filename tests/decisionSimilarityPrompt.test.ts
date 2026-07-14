/**
 * Test Plan:
 * 1. Happy Path:
 *    - 활성 Prompt 버전의 ID, 해시와 본문을 평가 입력으로 반환한다.
 * 2. Edge Cases:
 *    - 호환 Markdown만 있으면 초기 불변 버전으로 이관한다.
 *    - 과거 버전을 재활성화하면 해당 본문을 반환한다.
 *    - 한국어가 포함된 유효한 Prompt 본문을 원형 보존한다.
 * 3. Failure Path:
 *    - Prompt 저장소와 유효한 호환 파일이 없으면 환경변수 경로로 우회하지 않고 실패한다.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { resolveDecisionSimilarityPrompt } from '../server/evaluation/decisionSimilarityPrompt';
import {
  activatePromptVersion,
  createPromptVersion,
  ensurePromptVersionStore,
} from '../server/promptVersions/store';

const validPrompt = (suffix = '') => `## Role
Role${suffix}
## Identity
Identity
## Decision Principles
Principles
## Cross-Dimension Rules
Rules
## Red Lines
Lines
## Communication Style
Style
## Unknown Policy
Unknown
## Response Format
Format
`;

const fixture = async (content = validPrompt()) => {
  const root = await mkdtemp(join(tmpdir(), 'decision-similarity-prompt-'));
  const dataDir = join(root, 'data/b-track/amy-hood');
  await mkdir(dataDir, { recursive: true });
  await writeFile(join(dataDir, 'AMY_HOOD_PERSONA.gemma4.md'), content);
  return root;
};

test('happy: returns the active immutable prompt ID, hash and content', async () => {
  const root = await fixture();
  await ensurePromptVersionStore(root, { createId: () => 'v1' });
  const v2 = await createPromptVersion(root, { content: validPrompt(' v2'), basedOnVersionId: 'v1' }, { createId: () => 'v2' });
  await activatePromptVersion(root, 'v2');

  assert.deepEqual(await resolveDecisionSimilarityPrompt(root), {
    promptVersionId: 'v2',
    promptHash: v2.sha256,
    systemPrompt: validPrompt(' v2'),
  });
});

test('edge: migrates a compatibility Markdown file into the immutable store', async () => {
  const root = await fixture();
  const resolved = await resolveDecisionSimilarityPrompt(root);
  assert.equal(resolved.systemPrompt, validPrompt());
  assert.match(resolved.promptVersionId, /^[0-9a-f-]{36}$/);
});

test('edge: reactivating an older version changes the resolved prompt', async () => {
  const root = await fixture();
  await ensurePromptVersionStore(root, { createId: () => 'v1' });
  await createPromptVersion(root, { content: validPrompt(' v2'), basedOnVersionId: 'v1' }, { createId: () => 'v2' });
  await activatePromptVersion(root, 'v2');
  await activatePromptVersion(root, 'v1');
  assert.equal((await resolveDecisionSimilarityPrompt(root)).systemPrompt, validPrompt());
});

test('edge: preserves Korean prompt content exactly', async () => {
  const korean = validPrompt('\n장기 성장과 재무 규율을 함께 판단합니다.');
  const root = await fixture(korean);
  assert.equal((await resolveDecisionSimilarityPrompt(root)).systemPrompt, korean);
});

test('failure: missing prompt store never falls back to an environment path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'decision-similarity-missing-'));
  const fallback = join(root, 'fallback.md');
  await writeFile(fallback, validPrompt(' fallback'));
  const previous = process.env.RAG_EVAL_SYSTEM_PROMPT_PATH;
  process.env.RAG_EVAL_SYSTEM_PROMPT_PATH = fallback;
  try {
    await assert.rejects(resolveDecisionSimilarityPrompt(root), /ENOENT/);
  } finally {
    if (previous === undefined) delete process.env.RAG_EVAL_SYSTEM_PROMPT_PATH;
    else process.env.RAG_EVAL_SYSTEM_PROMPT_PATH = previous;
  }
});
