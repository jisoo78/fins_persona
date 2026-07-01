/*
Test Plan:
1. Happy Path:
   - Parse a valid JSON response body.

2. Edge Cases:
   - Empty response body returns the provided fallback message.
   - Non-JSON response body returns the provided fallback message.
   - JSON error payload prefers its message field.

3. Failure Path:
   - Non-ok JSON responses throw the server-provided message instead of returning partial data.
*/
import assert from 'node:assert/strict';
import test from 'node:test';
import { readJsonResponse } from './http';

test('parses a valid JSON response body', async () => {
  const response = new Response(JSON.stringify({ ok: true, value: 1 }), { status: 200 });

  const result = await readJsonResponse<{ ok: boolean; value: number }>(response, 'fallback');

  assert.deepEqual(result, { ok: true, value: 1 });
});

test('empty response body returns the fallback message', async () => {
  const response = new Response('', { status: 502 });

  await assert.rejects(
    () => readJsonResponse(response, '로컬 저장 API 응답이 비어 있습니다.'),
    /로컬 저장 API 응답이 비어 있습니다\./,
  );
});

test('non-JSON response body returns the fallback message', async () => {
  const response = new Response('<html>proxy error</html>', { status: 502 });

  await assert.rejects(
    () => readJsonResponse(response, '로컬 저장 API 응답을 해석하지 못했습니다.'),
    /로컬 저장 API 응답을 해석하지 못했습니다\./,
  );
});

test('JSON error payload prefers its message field', async () => {
  const response = new Response(JSON.stringify({ ok: false, message: 'context is required' }), { status: 400 });

  await assert.rejects(
    () => readJsonResponse(response, 'fallback'),
    /context is required/,
  );
});
