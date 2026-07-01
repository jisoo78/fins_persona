/*
Test Plan:
1. Happy Path:
   - Save a PreInterviewContext JSON file, list it, and load the same context back.

2. Edge Cases:
   - Blank profile names fall back to a stable local-test label.
   - Multiple saved files are listed newest first.
   - Missing storage directory returns an empty list instead of failing.

3. Failure Path:
   - Path traversal-like ids are rejected and cannot read files outside the storage directory.
*/
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { PreInterviewContext } from '../src/pre-question/types';
import {
  listPreInterviewContexts,
  loadPreInterviewContext,
  savePreInterviewContext,
} from './preInterviewContextStore';

const createContext = (createdAt = '2026-07-01T00:00:00.000Z'): PreInterviewContext => ({
  meta: {
    schema_version: 'pre_interview_context.v2',
    target_role: 'CFO',
    completed_at: createdAt,
  },
  communication_style: {
    bridge_question_id: 'communication_style',
    selected_option_id: 1,
    answer: '결론 우선',
  },
  categories: {
    Capital: {
      question_1: {
        source_question_id: 1,
        question: '자본 효율과 현금 안정성 중 무엇을 우선하나요?',
        stage: 'preference',
        answer: '현금 안정성',
        selected_option_id: 2,
        response_time_ms: 1200,
        response_signal: 'considered_preference',
      },
    },
  },
});

test('saves, lists, and loads a PreInterviewContext JSON file', async () => {
  const storageDir = await mkdtemp(path.join(tmpdir(), 'preinterview-store-'));

  try {
    const saved = await savePreInterviewContext({
      context: createContext(),
      profileName: '김도현',
      storageDir,
      now: new Date('2026-07-01T00:00:00.000Z'),
    });
    const contexts = await listPreInterviewContexts(storageDir);
    const loaded = await loadPreInterviewContext(saved.id, storageDir);

    assert.equal(saved.label, '김도현 사전 질문 응답지');
    assert.equal(contexts.length, 1);
    assert.equal(contexts[0].id, saved.id);
    assert.deepEqual(loaded.context, createContext());
  } finally {
    await rm(storageDir, { recursive: true, force: true });
  }
});

test('blank profile names fall back to a local-test label', async () => {
  const storageDir = await mkdtemp(path.join(tmpdir(), 'preinterview-store-'));

  try {
    const saved = await savePreInterviewContext({
      context: createContext(),
      profileName: '   ',
      storageDir,
      now: new Date('2026-07-01T00:00:00.000Z'),
    });

    assert.equal(saved.label, '로컬 테스트 사전 질문 응답지');
  } finally {
    await rm(storageDir, { recursive: true, force: true });
  }
});

test('lists saved contexts newest first', async () => {
  const storageDir = await mkdtemp(path.join(tmpdir(), 'preinterview-store-'));

  try {
    const older = await savePreInterviewContext({
      context: createContext('2026-07-01T00:00:00.000Z'),
      profileName: 'older',
      storageDir,
      now: new Date('2026-07-01T00:00:00.000Z'),
    });
    const newer = await savePreInterviewContext({
      context: createContext('2026-07-01T00:01:00.000Z'),
      profileName: 'newer',
      storageDir,
      now: new Date('2026-07-01T00:01:00.000Z'),
    });

    const contexts = await listPreInterviewContexts(storageDir);

    assert.deepEqual(contexts.map((context) => context.id), [newer.id, older.id]);
  } finally {
    await rm(storageDir, { recursive: true, force: true });
  }
});

test('missing storage directory returns an empty list', async () => {
  const storageDir = path.join(tmpdir(), `preinterview-missing-${Date.now()}`);

  const contexts = await listPreInterviewContexts(storageDir);

  assert.deepEqual(contexts, []);
});

test('rejects path traversal ids when loading local context files', async () => {
  const storageDir = await mkdtemp(path.join(tmpdir(), 'preinterview-store-'));
  const outsideFile = path.join(storageDir, '..', 'outside.json');

  try {
    await writeFile(outsideFile, JSON.stringify({ ok: false }), 'utf8');

    await assert.rejects(
      () => loadPreInterviewContext('../outside', storageDir),
      /Invalid pre-interview context id/,
    );
  } finally {
    await rm(storageDir, { recursive: true, force: true });
    await rm(outsideFile, { force: true });
  }
});
