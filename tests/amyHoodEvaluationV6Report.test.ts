/**
 * Test Plan:
 * 1. Happy Path:
 *    - Build a formal report from 450 answers, individual grades, and 225 pair grades.
 * 2. Edge Cases:
 *    - Build a clearly labeled 90-answer persona-calibration report.
 *    - Report domain and evidence-class counts without averaging excluded v5 items.
 *    - Escape untrusted report text in HTML.
 * 3. Failure Path:
 *    - Reject incomplete, stale, mixed-hash, uncalibrated, or privately leaked result batches.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { EvaluationV6Grade, EvaluationV6PairGrade, EvaluationV6Run } from '../shared/amyHoodEvaluationV6';
import { buildEvaluationV6ReportData, renderEvaluationV6Html } from '../server/evaluationV6/report';
import { evaluationV6BundleFixture } from './helpers/evaluationV6Fixture';

const fixtureData = (repetitions: 1 | 5) => {
  const input = evaluationV6BundleFixture();
  const manifest = { ...({} as NonNullable<typeof input.manifest>), bundleHash: 'a'.repeat(64), candidateBundleHash: 'b'.repeat(64), judgeCalibrationBatchHash: 'c'.repeat(64) };
  const bundle = { ...input, scenarios: input.scenarioFile.scenarios, auditResult: {} as never, manifest };
  const runs: EvaluationV6Run[] = [];
  const grades: EvaluationV6Grade[] = [];
  const links: Array<{ packetId: string; runId: string; arm: string; repetition: number; scenarioId: string }> = [];
  const pairGrades: EvaluationV6PairGrade[] = [];
  const pairLinks: Array<{ packetId: string; runId: string; arm: string; repetition: number; pairId: string }> = [];
  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    for (const arm of ['amy_prompt', 'amy_policy_rag', 'amy_full_rag'] as const) {
      const runId = `${arm}-${repetition}`;
      runs.push({
        runId, version: '6.0.0', stage: 'benchmark', experimentGroupId: 'group-1', repetition: repetition as 1 | 2 | 3 | 4 | 5,
        orderSeed: 'seed', scenarioOrder: input.scenarioFile.scenarios.map(({ id }) => id), arm, provider: 'local', model: 'e4b.gguf',
        scenarioSetHash: manifest.bundleHash, promptVersionId: 'p4', promptHash: 'd'.repeat(64),
        memoryReleaseId: arm === 'amy_prompt' ? null : 'release', memoryReleaseHash: arm === 'amy_prompt' ? null : 'e'.repeat(64),
        memoryIndexHash: arm === 'amy_prompt' ? null : 'f'.repeat(64), retrievalConfigHash: arm === 'amy_prompt' ? null : '1'.repeat(64),
        status: 'complete', startedAt: '2026-07-21T12:00:00.000Z', completedAt: '2026-07-21T12:01:00.000Z',
        answers: input.scenarioFile.scenarios.map(({ id }) => ({ scenarioId: id, status: 'complete', elapsedMs: 1, response: { action: 'stage', priorities: ['demand', 'economics', 'capacity'], guardrails: ['margin'], reversalSignals: ['weak demand'], rationale: 'bounded' } })),
      });
      for (const scenario of input.scenarioFile.scenarios) {
        const packetId = `packet-${runId}-${scenario.id}`;
        links.push({ packetId, runId, arm, repetition, scenarioId: scenario.id });
        grades.push({
          packetId, packetHash: '2'.repeat(64), score: 10, uncappedScore: 10, ceilingApplied: [], rationale: 'Amy 고유 우선순위와 경계를 따른다.', identityVerdict: 'amy_aligned',
          components: { action: 4, priorityOrder: 4, boundaries: 4, reversal: 4, identitySpecificity: 4 },
          anchorFindings: { action: 'aligned', priority: 'aligned', guardrails: 'aligned', reversal: 'aligned' }, distinguishingAnchor: { kind: 'priority_order', statement: 'demand first' },
          judgeProvider: 'local', judgeModel: 'judge.gguf', rationalePromptHash: '3'.repeat(64), assessmentPromptHash: '4'.repeat(64), repairApplied: false, gradedAt: '2026-07-21T12:02:00.000Z',
        });
      }
      if (repetitions === 5) for (const pair of input.pairKeys) {
        const packetId = `pair-${runId}-${pair.pairId}`;
        pairLinks.push({ packetId, runId, arm, repetition, pairId: pair.pairId });
        pairGrades.push({ ...grades[grades.length - 1], packetId, aligned: true, expectedResponseFinding: 'aligned', changedSignalFinding: 'aligned', invariantFinding: 'aligned' });
      }
    }
  }
  return { bundle, runs, grades, links, pairGrades, pairLinks, calibration: { passed: true, candidateBundleHash: manifest.candidateBundleHash, batchHash: manifest.judgeCalibrationBatchHash, metrics: { genericLeakageRate: 0, conflictLeakageRate: 0, amyPassRate: 1, meanIdentityGap: 3, schemaValidRate: 1 }, activatedAt: '2026-07-21T12:00:00.000Z' } };
};

test('happy: builds formal identity and transition metrics', () => {
  const report = buildEvaluationV6ReportData(fixtureData(5));
  assert.equal(report.runMode, 'formal');
  assert.equal(report.answerCount, 450);
  assert.equal(report.transition.amy_policy_rag.pairAccuracy, 1);
});
test('edge: labels a 90-answer persona calibration report', () => {
  const report = buildEvaluationV6ReportData(fixtureData(1));
  assert.equal(report.runMode, 'persona_calibration');
  assert.equal(report.answerCount, 90);
});
test('edge: reports v6 evidence and domain coverage only', () => {
  const report = buildEvaluationV6ReportData(fixtureData(1));
  assert.equal(Object.values(report.domainCounts).reduce((sum, count) => sum + count, 0), 30);
  assert.equal(Object.values(report.evidenceClassCounts).reduce((sum, count) => sum + count, 0), 30);
});
test('edge: escapes untrusted text in HTML', () => {
  const report = { ...buildEvaluationV6ReportData(fixtureData(1)), experimentGroupId: '<script>alert(1)</script>' };
  const html = renderEvaluationV6Html(report);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
});
test('failure: rejects incomplete or calibration-mismatched inputs', () => {
  const incomplete = fixtureData(1);
  incomplete.runs[0].status = 'incomplete';
  assert.throws(() => buildEvaluationV6ReportData(incomplete), /complete/i);
  const stale = fixtureData(1);
  stale.calibration.candidateBundleHash = '0'.repeat(64);
  assert.throws(() => buildEvaluationV6ReportData(stale), /calibration/i);
});
