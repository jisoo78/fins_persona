/**
 * Test Plan:
 * 1. Happy Path:
 *    - Accept one reviewed deployable policy per domain with two support events, one contrast, and direct Amy evidence on every event.
 * 2. Edge Cases:
 *    - Accept more than one passing policy in a domain while counting the domain once.
 *    - Accept multiple direct Amy evidence spans on one reviewed event.
 *    - Report every missing domain in deterministic order.
 * 3. Failure Path:
 *    - Reject a release with missing direct Amy evidence without activating anything.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertEvaluationV4PolicyCoverage,
  evaluatePolicyCoverage,
} from '../server/evaluationV4/policyCoverage';
import { fiveDomainPolicyFixture } from './helpers/evaluationV4Fixture';

test('accepts complete five-domain policy coverage', () => {
  const report = evaluatePolicyCoverage(fiveDomainPolicyFixture());
  assert.equal(report.passed, true);
  assert.deepEqual(report.coveredDomains, [
    'm_and_a',
    'ai_cloud_capex',
    'pricing_monetization',
    'cost_efficiency',
    'shareholder_return_risk',
  ]);
});

test('counts duplicate passing policies once', () => {
  const input = fiveDomainPolicyFixture();
  input.policies.push({ ...structuredClone(input.policies[0]), id: 'second-m-and-a-policy' });
  assert.equal(evaluatePolicyCoverage(input).coveredDomains.length, 5);
});

test('accepts multiple direct evidence spans on one event', () => {
  const input = fiveDomainPolicyFixture();
  input.events[0].directAmyEvidenceIds = ['quote-1', 'quote-2'];
  assert.equal(evaluatePolicyCoverage(input).passed, true);
});

test('reports missing domains in canonical order', () => {
  const input = fiveDomainPolicyFixture();
  input.policies = input.policies.filter(({ domain }) => domain === 'ai_cloud_capex');
  assert.deepEqual(evaluatePolicyCoverage(input).missingDomains, [
    'm_and_a',
    'pricing_monetization',
    'cost_efficiency',
    'shareholder_return_risk',
  ]);
});

test('fails closed on unsupported release content', () => {
  const input = fiveDomainPolicyFixture();
  input.events[0].directAmyEvidenceIds = [];
  const report = evaluatePolicyCoverage(input);
  assert.throws(() => assertEvaluationV4PolicyCoverage(report), /direct Amy evidence/);
});
