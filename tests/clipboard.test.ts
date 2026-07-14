/**
 * Test Plan:
 * 1. Happy Path:
 *    - 전체 UUID를 Clipboard API에 그대로 전달한다.
 * 2. Edge Cases:
 *    - Clipboard API가 없으면 fallback을 사용한다.
 *    - Clipboard API가 거부되면 fallback을 사용한다.
 *    - 빈 실행 ID는 어떤 복사 경로도 호출하지 않는다.
 * 3. Failure Path:
 *    - 기본 경로와 fallback이 모두 실패하면 예외 없이 false를 반환한다.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { copyTextToClipboard } from '../src/utils/clipboard';

test('happy: copies the complete run UUID', async () => {
  const copied: string[] = [];
  assert.equal(await copyTextToClipboard('33d7c552-5427-42c1-9d0c-89985473929b', {
    writeText: async (text) => { copied.push(text); },
    fallbackCopy: () => false,
  }), true);
  assert.deepEqual(copied, ['33d7c552-5427-42c1-9d0c-89985473929b']);
});

test('edge: missing clipboard uses fallback', async () => {
  const copied: string[] = [];
  const result = await copyTextToClipboard('run-full-id', {
    fallbackCopy: (text) => { copied.push(text); return true; },
  });
  assert.equal(result, true);
  assert.deepEqual(copied, ['run-full-id']);
});

test('edge: rejected clipboard uses fallback', async () => {
  const result = await copyTextToClipboard('run-full-id', {
    writeText: async () => { throw new Error('denied'); },
    fallbackCopy: () => true,
  });
  assert.equal(result, true);
});

test('edge: empty ID invokes neither adapter', async () => {
  let calls = 0;
  const result = await copyTextToClipboard('', {
    writeText: async () => { calls += 1; },
    fallbackCopy: () => { calls += 1; return true; },
  });
  assert.equal(result, false);
  assert.equal(calls, 0);
});

test('failure: both copy paths fail safely', async () => {
  const result = await copyTextToClipboard('run-full-id', {
    writeText: async () => { throw new Error('denied'); },
    fallbackCopy: () => { throw new Error('blocked'); },
  });
  assert.equal(result, false);
});
