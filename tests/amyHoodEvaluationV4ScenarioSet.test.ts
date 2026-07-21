/**
 * Test Plan:
 * 1. Happy Path:
 *    - Accept ten approved calibration scenarios with two variants per domain and sealed mappings.
 *
 * 2. Edge Cases:
 *    - Accept shuffled scenario and sealed-file order.
 *    - Accept a reviewed declaration that secondary evidence is unavailable.
 *    - Accept neutral public business wording that contains no historical identity or answer.
 *
 * 3. Failure Path:
 *    - Reject wrong counts, public identity/action leakage, duplicate mappings, and stale hashes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { EVALUATION_V4_DOMAINS } from '../shared/amyHoodEvaluationV4';
import {
  buildEvaluationV4FrozenManifest,
  validateEvaluationV4ScenarioBundle,
} from '../server/evaluationV4/scenarioSet';
import { evaluationV4BundleFixture } from './helpers/evaluationV4ScenarioFixture';

test('happy: accepts ten calibration scenarios with two per domain', () => {
  const result = validateEvaluationV4ScenarioBundle(evaluationV4BundleFixture());
  assert.equal(result.scenarios.length, 10);
  assert.deepEqual(result.domainCounts, Object.fromEntries(
    EVALUATION_V4_DOMAINS.map((domain) => [domain, 2]),
  ));
});

test('edge: accepts shuffled scenario and sealed mapping order', () => {
  const fixture = evaluationV4BundleFixture();
  fixture.scenarioFile.scenarios.reverse();
  fixture.provenance.reverse();
  fixture.alignmentKeys.reverse();
  assert.equal(validateEvaluationV4ScenarioBundle(fixture).scenarios.length, 10);
});

test('edge: accepts documented secondary-source absence', () => {
  const fixture = evaluationV4BundleFixture();
  assert.equal(fixture.externalEvents[0].secondarySourceStatus, 'documented_unavailable');
  assert.equal(validateEvaluationV4ScenarioBundle(fixture).externalEvents.length, 10);
});

test('edge: accepts neutral business wording', () => {
  const fixture = evaluationV4BundleFixture();
  fixture.scenarioFile.scenarios[0].situation = 'A software company must choose a bounded transaction structure under regulatory uncertainty.';
  assert.equal(validateEvaluationV4ScenarioBundle(fixture).scenarios.length, 10);
});

test('failure: rejects wrong scenario counts and domain balance', () => {
  const fixture = evaluationV4BundleFixture();
  fixture.scenarioFile.scenarios.pop();
  assert.throws(() => validateEvaluationV4ScenarioBundle(fixture), /exactly ten/i);

  const repeatedOrganization = evaluationV4BundleFixture();
  repeatedOrganization.externalEvents[1].organization = repeatedOrganization.externalEvents[0].organization;
  assert.throws(
    () => validateEvaluationV4ScenarioBundle(repeatedOrganization),
    /two organizations per domain/i,
  );
});

test('failure: rejects identity and historical-action leakage', () => {
  const fixture = evaluationV4BundleFixture();
  fixture.scenarioFile.scenarios[0].situation += ' Organization 1 selected Historical action 1.';
  assert.throws(() => validateEvaluationV4ScenarioBundle(fixture), /public scenario leakage/i);
});

test('failure: rejects duplicate sealed mappings', () => {
  const fixture = evaluationV4BundleFixture();
  fixture.provenance[1].scenarioId = fixture.provenance[0].scenarioId;
  assert.throws(() => validateEvaluationV4ScenarioBundle(fixture), /provenance/i);
});

test('failure: rejects a stale frozen hash', () => {
  const fixture = evaluationV4BundleFixture();
  fixture.manifest = buildEvaluationV4FrozenManifest(
    validateEvaluationV4ScenarioBundle(fixture),
    '2026-07-21T02:00:00.000Z',
  );
  fixture.scenarioFile.scenarios[0].title = 'Changed after freeze';
  assert.throws(() => validateEvaluationV4ScenarioBundle(fixture), /manifest hash/i);
});
