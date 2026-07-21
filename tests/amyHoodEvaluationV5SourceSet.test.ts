/**
 * Test Plan:
 * 1. Happy Path:
 *    - Accept one reviewed official decision-time source with matching normalized content.
 * 2. Edge Cases:
 *    - Accept an attributable secondary CFO transcript beside an official primary source.
 *    - Isolate a post-outcome source from generation evidence.
 *    - Canonicalize tracking parameters without changing the reviewed source identity.
 * 3. Failure Path:
 *    - Reject Amy-memory collisions, content mismatch, unsupported quality, and a secondary transcript used as primary evidence.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { validateEvaluationV5ExternalSources } from '../server/evaluationV5/sourceSet';
import { evaluationV5ExternalSourceFixture } from './helpers/evaluationV5Fixture';

test('happy: accepts an official decision-time source', () => {
  const fixture = evaluationV5ExternalSourceFixture();
  const result = validateEvaluationV5ExternalSources(
    fixture.registry,
    [],
    fixture.normalizedContentByPath,
  );
  assert.deepEqual(result.generationSourceIds, ['ext-v5-primary-1']);
});

test('edge: accepts an attributable secondary CFO transcript', () => {
  const fixture = evaluationV5ExternalSourceFixture({ secondaryTranscript: true });
  const result = validateEvaluationV5ExternalSources(fixture.registry, [], fixture.normalizedContentByPath);
  assert.equal(result.sources.length, 2);
  assert.equal(result.events[0].secondarySourceStatus, 'present');
});

test('edge: isolates post-outcome evidence from generation', () => {
  const fixture = evaluationV5ExternalSourceFixture({ withOutcome: true });
  const result = validateEvaluationV5ExternalSources(fixture.registry, [], fixture.normalizedContentByPath);
  assert.deepEqual(result.generationSourceIds, ['ext-v5-primary-1']);
});

test('edge: canonicalizes a reviewed tracking URL', () => {
  const fixture = evaluationV5ExternalSourceFixture();
  fixture.registry.sources[0].canonicalUrl += '?utm_source=test#section';
  const result = validateEvaluationV5ExternalSources(fixture.registry, [], fixture.normalizedContentByPath);
  assert.equal(result.sources[0].canonicalUrl, 'https://example.org/official-decision');
});

test('failure: rejects unsafe source evidence', () => {
  const collision = evaluationV5ExternalSourceFixture();
  assert.throws(() => validateEvaluationV5ExternalSources(
    collision.registry,
    [{ canonicalUrl: 'https://example.org/official-decision' }],
    collision.normalizedContentByPath,
  ), /collides with Amy memory/i);

  const mismatch = evaluationV5ExternalSourceFixture();
  mismatch.normalizedContentByPath[mismatch.registry.sources[0].normalizedPath] = 'changed';
  assert.throws(() => validateEvaluationV5ExternalSources(
    mismatch.registry, [], mismatch.normalizedContentByPath,
  ), /content hash mismatch/i);

  const invalid = evaluationV5ExternalSourceFixture({ secondaryTranscript: true });
  invalid.registry.sources[0].sourceQuality = 'attributable_secondary_transcript';
  assert.throws(() => validateEvaluationV5ExternalSources(
    invalid.registry, [], invalid.normalizedContentByPath,
  ), /official primary/i);
});
