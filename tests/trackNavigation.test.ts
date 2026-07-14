/**
 * Test Plan:
 * 1. Happy Path:
 *    - 공통 진입점과 A/B Track 내부 섹션 상태를 독립적으로 정규화한다.
 * 2. Edge Cases:
 *    - 유효한 저장 상태는 새로고침 후에도 그대로 유지한다.
 *    - 알 수 없는 내부 섹션은 각 Track의 기본 섹션으로 복구한다.
 *    - 기존 평면 탭 값을 대응하는 Track과 내부 섹션으로 이관한다.
 * 3. Failure Path:
 *    - null, 배열, 문자열처럼 잘못된 저장 값은 안전한 기본 상태로 복구한다.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { migrateLegacyTab, normalizeTrackNavigation } from '../src/navigation/trackNavigation';

test('happy: normalizes the common entry and independent A/B Track sections', () => {
  assert.deepEqual(
    normalizeTrackNavigation({ activeTab: 'b-track', aTrack: 'personas', bTrack: 'reports' }),
    { activeTab: 'b-track', aTrack: 'personas', bTrack: 'reports' },
  );
});

test('edge: preserves a valid stored navigation state', () => {
  assert.deepEqual(
    normalizeTrackNavigation({ activeTab: 'a-track', aTrack: 'deep-interview', bTrack: 'evaluation-run' }),
    { activeTab: 'a-track', aTrack: 'deep-interview', bTrack: 'evaluation-run' },
  );
});

test('edge: falls back only invalid Track sections', () => {
  assert.deepEqual(
    normalizeTrackNavigation({ activeTab: 'b-track', aTrack: 'wrong', bTrack: 'wrong' }),
    { activeTab: 'b-track', aTrack: 'pre-interview', bTrack: 'main-prompt' },
  );
});

test('edge: migrates a legacy flat tab to its Track destination', () => {
  assert.deepEqual(migrateLegacyTab('evaluation-review'), {
    activeTab: 'b-track',
    bTrack: 'question-review',
  });
});

test('failure: malformed stored values recover to safe defaults', () => {
  const expected = { activeTab: 'dashboard', aTrack: 'pre-interview', bTrack: 'main-prompt' };
  assert.deepEqual(normalizeTrackNavigation(null), expected);
  assert.deepEqual(normalizeTrackNavigation([]), expected);
  assert.deepEqual(normalizeTrackNavigation('b-track'), expected);
});
