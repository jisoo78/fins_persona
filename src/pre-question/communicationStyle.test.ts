/*
Test Plan:
1. Happy Path:
   - The 41st bridge question uses the CFO answer-format wording.

2. Edge Cases:
   - The wording keeps the reporting/communication scope explicit.
   - The wording keeps preferred format explicit.
   - The wording keeps preferred tone explicit.

3. Failure Path:
   - The wording does not drift back to deep-interview result summary wording.
*/
import assert from 'node:assert/strict';
import test from 'node:test';
import { communicationStyleQuestion } from './communicationStyle';

test('uses the CFO answer-format wording for the 41st bridge question', () => {
  assert.equal(communicationStyleQuestion, 'CFO로써 답변형식: 보고·소통에서 선호하는 형식과 톤');
});

test('keeps reporting and communication scope explicit', () => {
  assert.match(communicationStyleQuestion, /보고·소통/);
});

test('keeps preferred format explicit', () => {
  assert.match(communicationStyleQuestion, /형식/);
});

test('keeps preferred tone explicit', () => {
  assert.match(communicationStyleQuestion, /톤/);
});

test('does not use deep-interview result summary wording', () => {
  assert.doesNotMatch(communicationStyleQuestion, /심층 인터뷰 결과/);
});
