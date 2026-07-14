/**
 * Test Plan:
 * 1. Happy Path:
 *    - 기존 Main Prompt를 초기 버전으로 이관하고 새 버전을 저장·활성화한다.
 *
 * 2. Edge Cases:
 *    - 동일 본문도 서로 다른 버전 ID로 저장한다.
 *    - 과거 버전을 재활성화하면 호환 파일을 되돌린다.
 *    - 호환 파일이 manifest와 다르면 활성 버전 본문으로 복구한다.
 *
 * 3. Failure Path:
 *    - 빈 본문, 필수 heading 누락, 알 수 없는 ID와 원자적 쓰기 실패는 활성 manifest를 바꾸지 않는다.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  activatePromptVersion,
  createPromptVersion,
  ensurePromptVersionStore,
  readActivePromptVersion,
} from '../server/promptVersions/store';

const validPrompt = '# Amy Hood\n## Role\n## Identity\n## Decision Principles\n## Cross-Dimension Rules\n## Red Lines\n## Communication Style\n## Unknown Policy\n## Response Format\n';

const fixture = async () => {
  const root = await mkdtemp(join(tmpdir(), 'prompt-version-'));
  const dir = join(root, 'data/b-track/amy-hood');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'AMY_HOOD_PERSONA.gemma4.md'), validPrompt);
  return root;
};

test('happy: migrates, saves and explicitly activates an immutable prompt version', async () => {
  const root = await fixture();
  const initial = await ensurePromptVersionStore(root, {
    now: () => '2026-07-14T00:00:00.000Z',
    createId: () => 'v1',
  });
  const saved = await createPromptVersion(
    root,
    { content: `${validPrompt}\nNew rule`, basedOnVersionId: 'v1' },
    { now: () => '2026-07-14T01:00:00.000Z', createId: () => 'v2' },
  );
  assert.equal(initial.activeVersionId, 'v1');
  assert.equal(saved.versionId, 'v2');
  assert.equal((await readActivePromptVersion(root)).versionId, 'v1');
  await activatePromptVersion(root, 'v2');
  assert.equal((await readActivePromptVersion(root)).versionId, 'v2');
});

test('edge: identical content creates distinct immutable IDs', async () => {
  const root = await fixture();
  await ensurePromptVersionStore(root, { createId: () => 'v1' });
  const v2 = await createPromptVersion(root, { content: validPrompt }, { createId: () => 'v2' });
  const v3 = await createPromptVersion(root, { content: validPrompt }, { createId: () => 'v3' });
  assert.notEqual(v2.versionId, v3.versionId);
  assert.equal(v2.sha256, v3.sha256);
});

test('edge: reactivating an old version restores compatibility content', async () => {
  const root = await fixture();
  await ensurePromptVersionStore(root, { createId: () => 'v1' });
  await createPromptVersion(
    root,
    { content: `${validPrompt}\nSecond` },
    { createId: () => 'v2' },
  );
  await activatePromptVersion(root, 'v2');
  await activatePromptVersion(root, 'v1');
  assert.equal(
    await readFile(join(root, 'data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md'), 'utf8'),
    validPrompt,
  );
});

test('edge: active read repairs a stale compatibility mirror', async () => {
  const root = await fixture();
  await ensurePromptVersionStore(root, { createId: () => 'v1' });
  await writeFile(join(root, 'data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md'), 'stale');
  assert.equal((await readActivePromptVersion(root)).content, validPrompt);
  assert.equal(
    await readFile(join(root, 'data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md'), 'utf8'),
    validPrompt,
  );
});

test('failure: invalid content and failed writes preserve activeVersionId', async () => {
  const root = await fixture();
  await ensurePromptVersionStore(root, { createId: () => 'v1' });
  await assert.rejects(createPromptVersion(root, { content: '' }), /content is required/);
  await assert.rejects(
    createPromptVersion(root, { content: '## Role' }),
    /missing headings/,
  );
  await assert.rejects(activatePromptVersion(root, 'missing'), /unknown prompt version/);
  await assert.rejects(
    createPromptVersion(
      root,
      { content: validPrompt },
      {
        createId: () => 'v2',
        atomicWrite: async () => {
          throw new Error('disk full');
        },
      },
    ),
    /disk full/,
  );
  assert.equal((await readActivePromptVersion(root)).versionId, 'v1');
});
