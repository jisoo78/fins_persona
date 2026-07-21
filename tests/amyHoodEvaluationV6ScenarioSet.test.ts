/**
 * Test Plan:
 * 1. Happy Path:
 *    - Freeze and validate thirty approved v6 scenarios with thirty identity keys and fifteen pair keys.
 * 2. Edge Cases:
 *    - Accept domain reallocation while retaining at least one qualifying pair per evidenced domain.
 *    - Accept multiple action variants with the same Amy priority and boundary.
 *    - Accept shuffled public, sealed, audit, and replacement records.
 * 3. Failure Path:
 *    - Reject unsupported evidence, weak identity keys, public identity leakage, stale hashes, and unmatched calibration.
 */
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildEvaluationV6CandidateHash,
  freezeEvaluationV6Bundle,
  validateEvaluationV6CandidateBundle,
  validateEvaluationV6FrozenBundle,
} from '../server/evaluationV6/scenarioSet';
import { evaluationV6Paths } from '../server/evaluationV6/paths';
import { evaluationV6BundleFixture } from './helpers/evaluationV6Fixture';

test('happy: freezes thirty scenarios after a matching calibration', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'evaluation-v6-'));
  const fixture = evaluationV6BundleFixture();
  const candidate = validateEvaluationV6CandidateBundle(fixture);
  const candidateBundleHash = buildEvaluationV6CandidateHash(candidate);
  const manifest = await freezeEvaluationV6Bundle(root, fixture, {
    passed: true,
    candidateBundleHash,
    batchHash: 'b'.repeat(64),
  }, '2026-07-21T13:00:00.000Z');
  assert.equal(manifest.scenarioIds.length, 30);
  assert.equal(manifest.pairIds.length, 15);
  assert.equal(manifest.candidateBundleHash, candidateBundleHash);
  const stored = JSON.parse(await readFile(evaluationV6Paths(root).manifest, 'utf8'));
  assert.equal(stored.bundleHash, manifest.bundleHash);
  const finalInput = {
    ...fixture,
    reviews: fixture.reviews.map((review) => ({
      ...review,
      status: 'approved' as const,
      calibrationPassed: true,
      reviewedAt: '2026-07-21T13:00:00.000Z',
    })),
    manifest,
  };
  assert.equal(validateEvaluationV6FrozenBundle(finalInput).scenarios.length, 30);
});

test('edge: accepts domain reallocation represented in the ledger', () => {
  const fixture = evaluationV6BundleFixture();
  fixture.audits[0].decision = 'replace';
  fixture.audits[0].identityDiscriminability = 'failed';
  fixture.audits[0].keyEvidenceClass = 'ambiguous_key';
  fixture.replacements.push({
    predecessorScenarioId: fixture.audits[0].scenarioId,
    replacementScenarioId: fixture.scenarioFile.scenarios[0].id,
    originalDomain: 'm_and_a',
    replacementDomain: 'ai_cloud_capex',
    reason: 'Reallocate to an evidence-rich decision axis.',
    amyEvidenceIds: ['amy-reallocation-evidence'],
    externalMotifEventId: 'external-motif-reallocated',
    status: 'admitted',
    reviewer: 'Codex',
    reviewedAt: '2026-07-21T12:30:00.000Z',
  });
  assert.equal(validateEvaluationV6CandidateBundle(fixture).scenarios.length, 30);
});

test('edge: accepts multiple action variants under the same identity boundaries', () => {
  const fixture = evaluationV6BundleFixture();
  fixture.identityKeys[0].acceptableVariants.push('Sequence the same commitment in two reversible tranches.');
  assert.equal(validateEvaluationV6CandidateBundle(fixture).identityKeys[0].acceptableVariants.length, 2);
});

test('edge: accepts shuffled records', () => {
  const fixture = evaluationV6BundleFixture();
  fixture.scenarioFile.scenarios.reverse();
  fixture.reviews.reverse();
  fixture.audits.reverse();
  fixture.identityKeys.reverse();
  fixture.pairKeys.reverse();
  fixture.calibrationAnswers.reverse();
  assert.equal(validateEvaluationV6CandidateBundle(fixture).scenarios.length, 30);
});

test('failure: rejects unsafe candidate and frozen states', async () => {
  const unsupported = evaluationV6BundleFixture();
  unsupported.audits[0].keyEvidenceClass = 'unsupported_reversal';
  assert.throws(() => validateEvaluationV6CandidateBundle(unsupported), /not admissible/i);

  const weak = evaluationV6BundleFixture();
  weak.identityKeys[0].amyPriorityOrder = ['Only one'];
  assert.throws(() => validateEvaluationV6CandidateBundle(weak), /identity key/i);

  const leaked = evaluationV6BundleFixture();
  leaked.scenarioFile.scenarios[0].situation += ` ${leaked.identityKeys[0].policyId}`;
  assert.throws(() => validateEvaluationV6CandidateBundle(leaked), /public scenario leakage/i);

  const stale = evaluationV6BundleFixture();
  const validated = validateEvaluationV6CandidateBundle(stale);
  const hash = buildEvaluationV6CandidateHash(validated);
  const root = await mkdtemp(path.join(os.tmpdir(), 'evaluation-v6-'));
  await assert.rejects(
    freezeEvaluationV6Bundle(root, stale, {
      passed: true,
      candidateBundleHash: 'f'.repeat(64),
      batchHash: 'b'.repeat(64),
    }),
    /matching passed Judge calibration/i,
  );
  assert.match(hash, /^[a-f0-9]{64}$/);
});
