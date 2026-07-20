/**
 * Test Plan:
 * 1. Happy Path:
 *    - Accept a decision-time primary source and independently hashed secondary source for an external event.
 * 2. Edge Cases:
 *    - Accept a reviewed documented-unavailable secondary source.
 *    - Keep post-outcome evidence in a separate role without exposing it to scenario generation.
 *    - Canonicalize harmless UTM and fragment variants before duplicate checks.
 * 3. Failure Path:
 *    - Reject a source URL or source hash already present in Amy memory and reject a normalized-content hash mismatch.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { validateEvaluationV4ExternalSources } from '../server/evaluationV4/sourceSet';
import { externalSourceFixture } from './helpers/evaluationV4Fixture';

test('accepts isolated primary and secondary decision-time sources', () => {
  const fixture = externalSourceFixture();
  const result = validateEvaluationV4ExternalSources(
    fixture.registry,
    [],
    fixture.normalizedContentByPath,
  );
  assert.equal(result.events.length, 1);
});

test('accepts reviewed secondary-source unavailability', () => {
  const fixture = externalSourceFixture({ secondaryUnavailable: true });
  const result = validateEvaluationV4ExternalSources(
    fixture.registry,
    [],
    fixture.normalizedContentByPath,
  );
  assert.equal(result.events[0].secondarySourceStatus, 'documented_unavailable');
});

test('isolates outcome evidence', () => {
  const fixture = externalSourceFixture({ withOutcome: true });
  const result = validateEvaluationV4ExternalSources(
    fixture.registry,
    [],
    fixture.normalizedContentByPath,
  );
  assert.equal(result.generationSourceIds.includes('ext-outcome-1'), false);
});

test('canonicalizes tracking variants', () => {
  const fixture = externalSourceFixture({ withTracking: true });
  const result = validateEvaluationV4ExternalSources(
    fixture.registry,
    [],
    fixture.normalizedContentByPath,
  );
  assert.equal(result.sources[0].canonicalUrl, 'https://example.com/decision');
});

test('rejects Amy collisions and content mismatch', () => {
  const fixture = externalSourceFixture();
  assert.throws(() => validateEvaluationV4ExternalSources(
    fixture.registry,
    [{ canonicalUrl: fixture.registry.sources[0].canonicalUrl, contentHash: 'different' }],
    fixture.normalizedContentByPath,
  ), /external source collides with Amy memory/);

  fixture.registry.sources[0].contentHash = '0'.repeat(64);
  assert.throws(() => validateEvaluationV4ExternalSources(
    fixture.registry,
    [],
    fixture.normalizedContentByPath,
  ), /content hash mismatch/);
});
