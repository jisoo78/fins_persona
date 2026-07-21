/**
 * Test Plan:
 * 1. Happy Path:
 *    - Accept thirty approved anonymous scenarios in fifteen balanced event pairs.
 * 2. Edge Cases:
 *    - Accept shuffled public and sealed records.
 *    - Accept all three balanced changed-response types.
 *    - Accept materiality-preserving ratios without exact historical amounts.
 * 3. Failure Path:
 *    - Reject identity leakage, missing pair mappings, pair imbalance, and a stale manifest.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildEvaluationV5FrozenManifest,
  validateEvaluationV5ScenarioBundle,
} from '../server/evaluationV5/scenarioSet';
import { evaluationV5BundleFixture } from './helpers/evaluationV5Fixture';

test('happy: accepts thirty scenarios in fifteen pairs', () => {
  const result = validateEvaluationV5ScenarioBundle(evaluationV5BundleFixture());
  assert.equal(result.scenarios.length, 30);
  assert.equal(result.pairs.length, 15);
  assert.deepEqual(Object.values(result.domainCounts), [6, 6, 6, 6, 6]);
});

test('edge: accepts shuffled public and sealed records', () => {
  const fixture = evaluationV5BundleFixture();
  fixture.scenarioFile.scenarios.reverse();
  fixture.reviewFile.reviews.reverse();
  fixture.provenance.reverse();
  fixture.alignmentKeys.reverse();
  fixture.pairKeys.reverse();
  assert.equal(validateEvaluationV5ScenarioBundle(fixture).pairs.length, 15);
});

test('edge: accepts exactly five pairs per changed-response type', () => {
  const result = validateEvaluationV5ScenarioBundle(evaluationV5BundleFixture());
  assert.deepEqual(result.changeTypeCounts, {
    guardrail_adjustment: 5,
    resource_reallocation: 5,
    pause_or_reverse: 5,
  });
});

test('edge: accepts anonymized materiality-preserving ratios', () => {
  const fixture = evaluationV5BundleFixture();
  fixture.scenarioFile.scenarios[0].situation = 'The proposed transaction equals a material share of annual revenue and uses both available cash and new debt.';
  assert.equal(validateEvaluationV5ScenarioBundle(fixture).scenarios.length, 30);
});

test('failure: rejects leakage, incomplete pairs, imbalance, and stale hashes', () => {
  const leaked = evaluationV5BundleFixture();
  leaked.scenarioFile.scenarios[0].situation += ' Sealed Organization 1.';
  assert.throws(() => validateEvaluationV5ScenarioBundle(leaked), /public scenario leakage/i);

  const missingPair = evaluationV5BundleFixture();
  missingPair.pairKeys.pop();
  assert.throws(() => validateEvaluationV5ScenarioBundle(missingPair), /pair keys/i);

  const imbalanced = evaluationV5BundleFixture();
  imbalanced.pairKeys[0].expectedResponseType = 'pause_or_reverse';
  assert.throws(() => validateEvaluationV5ScenarioBundle(imbalanced), /five pairs per change type/i);

  const stale = evaluationV5BundleFixture();
  stale.manifest = buildEvaluationV5FrozenManifest(
    validateEvaluationV5ScenarioBundle(stale),
    '2026-07-21T06:30:00.000Z',
  );
  stale.scenarioFile.scenarios[0].title = 'Changed after freezing';
  assert.throws(() => validateEvaluationV5ScenarioBundle(stale), /manifest hash is stale/i);
});
