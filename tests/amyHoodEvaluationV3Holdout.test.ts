/**
 * Test Plan:
 * 1. Happy Path:
 *    - evaluation scope reads four sealed events while build scopes accept only non-holdout references.
 * 2. Edge Cases:
 *    - a shared source permits an explicitly approved non-holdout span.
 *    - duplicate references report one deterministic identifier.
 *    - an empty training selection remains valid.
 * 3. Failure Path:
 *    - candidate, source, evidence, alias, and raw shared-source leakage fail before a downstream write.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertNoEvaluationV3Holdout,
  loadEvaluationV3Holdout,
  type EvaluationV3ArtifactReference,
} from '../server/evaluationV3/holdout';

test('happy: evaluation reads four sealed events and clean build references pass', async () => {
  const manifest = await loadEvaluationV3Holdout(process.cwd());
  assert.equal(manifest.events.length, 4);
  assert.doesNotThrow(() => assertNoEvaluationV3Holdout(
    'evaluation_authoring',
    manifest.events.map(({ candidateId }) => ({ artifactClass: 'candidate', id: candidateId })),
    manifest,
  ));
  assert.doesNotThrow(() => assertNoEvaluationV3Holdout(
    'policy_build',
    [{ artifactClass: 'candidate', id: 'candidate-openai-expansion-2023' }],
    manifest,
  ));
});

test('edge: shared source permits an approved non-holdout span', async () => {
  const manifest = await loadEvaluationV3Holdout(process.cwd());
  assert.doesNotThrow(() => assertNoEvaluationV3Holdout('policy_build', [{
    artifactClass: 'evidence',
    id: 'policy-openai-investment-consistency-2022',
    sourceId: 'source-ad9a23176d9cf21d-25fb51a81eef',
    candidateId: 'candidate-openai-expansion-2023',
  }], manifest));
});

test('edge: duplicate leaks report one deterministic identifier', async () => {
  const manifest = await loadEvaluationV3Holdout(process.cwd());
  const duplicate: EvaluationV3ArtifactReference = {
    artifactClass: 'source',
    id: 'source-d89c20fc175fe37c',
  };
  assert.throws(
    () => assertNoEvaluationV3Holdout('runtime_index', [duplicate, duplicate], manifest),
    /holdout source source-d89c20fc175fe37c is forbidden in runtime_index/,
  );
});

test('edge: empty training selection remains valid', async () => {
  const manifest = await loadEvaluationV3Holdout(process.cwd());
  assert.doesNotThrow(() => assertNoEvaluationV3Holdout('main_prompt', [], manifest));
});

test('failure: every holdout reference class fails before downstream write', async () => {
  const manifest = await loadEvaluationV3Holdout(process.cwd());
  const leaks: EvaluationV3ArtifactReference[] = [
    { artifactClass: 'candidate', id: 'candidate-github-acquisition-2018' },
    { artifactClass: 'source', id: 'source-7f4b2d38f70ad433' },
    { artifactClass: 'evidence', id: 'span-1da6c275337bdf80' },
    { artifactClass: 'alias', id: 'Microsoft 365 price increase 2021' },
    {
      artifactClass: 'raw_source',
      id: 'source-ad9a23176d9cf21d-25fb51a81eef',
      candidateId: 'candidate-github-acquisition-2018',
    },
  ];
  for (const leak of leaks) {
    let writeCalled = false;
    assert.throws(() => {
      assertNoEvaluationV3Holdout('memory_release', [leak], manifest);
      writeCalled = true;
    }, /holdout/);
    assert.equal(writeCalled, false);
  }
});
