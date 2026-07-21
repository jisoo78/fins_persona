import { cp, mkdir, mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { EVALUATION_V4_ARMS, type EvaluationV4Grade, type EvaluationV4Run } from '../../shared/amyHoodEvaluationV4';
import { writeEvaluationV4Run } from '../../server/evaluationV4/runStore';

export const installEvaluationV4GradingFixture = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'amy-v4-grade-'));
  await mkdir(path.join(root, 'evaluation'), { recursive: true });
  await cp(path.join(process.cwd(), 'evaluation/v4'), path.join(root, 'evaluation/v4'), { recursive: true });
  await mkdir(path.join(root, 'data/b-track/amy-hood/advisor'), { recursive: true });
  await cp(
    path.join(process.cwd(), 'data/b-track/amy-hood/advisor/source-registry.json'),
    path.join(root, 'data/b-track/amy-hood/advisor/source-registry.json'),
  );
  const scenarios = JSON.parse(await import('node:fs/promises').then(({ readFile }) =>
    readFile(path.join(root, 'evaluation/v4/public/scenarios.json'), 'utf8'))).scenarios;
  const groupId = 'grade-fixture-group';
  const runs: EvaluationV4Run[] = [];
  for (const [index, arm] of EVALUATION_V4_ARMS.entries()) {
    const run: EvaluationV4Run = {
      runId: `grade-run-${index + 1}`, version: '4.0.0', stage: 'calibration', scenarioSetVersion: '4.0.0',
      experimentGroupId: groupId, repetition: 1, orderSeed: `seed-${index + 1}`, arm,
      provider: 'local', model: 'e4b-test',
      scenarioSetHash: 'e7be34622164641c280e0b3a00acef8cd30f62a9f7d92fd894f256c1e4b88e3f',
      promptVersionId: arm === 'generic_cfo' ? null : 'amy-v1', promptHash: `${index + 1}`.repeat(64),
      memoryReleaseId: index >= 2 ? 'release-v4' : null,
      memoryReleaseHash: index >= 2 ? 'a'.repeat(64) : null,
      memoryIndexHash: index >= 2 ? 'b'.repeat(64) : null,
      retrievalConfigHash: index >= 2 ? 'c'.repeat(64) : null,
      status: 'complete',
      answers: scenarios.map((scenario: { id: string }, scenarioIndex: number) => ({
        scenarioId: scenario.id, status: 'complete' as const,
        response: {
          action: index < 2 ? 'Use a conventional bounded CFO action.' : `Use Amy-aligned bounded action ${index}.`,
          priorities: index < 2 ? ['Return', 'Risk', 'Timing'] : ['Demand', 'Economics', 'Execution'],
          guardrails: ['Preserve downside capacity.'], reversalSignals: ['Evidence weakens.'],
          rationale: 'The recommendation is conditional on observable evidence.',
        },
        elapsedMs: 1,
        ...(index >= 2 ? { retrieval: {
          queryHash: `${scenarioIndex}`.padStart(64, '0'), indexHash: 'b'.repeat(64), retrievalConfigHash: 'c'.repeat(64),
          cacheKey: `${scenarioIndex + 1}`.padStart(64, '0'),
          selectedArtifacts: [{ id: 'placeholder-policy', kind: 'policy' as const, vectorScore: 0.9, lexicalScore: 0.8, fusedScore: 0.87 }],
          expandedArtifactIds: ['placeholder-policy'], evidenceIds: ['evidence'], sourceIds: ['source'],
          noMatch: false, noMatchReason: null, contextTokens: 100, requestTokens: 1000,
          tokenCounter: 'conservative_estimator' as const, contextHash: 'd'.repeat(64),
        } } : {}),
      })),
      startedAt: '2026-07-21T03:00:00.000Z', completedAt: '2026-07-21T03:10:00.000Z',
    };
    runs.push(await writeEvaluationV4Run(root, run));
  }
  return { root, groupId, runs };
};

export const gradesForPackets = (
  packets: Array<{ packetId: string; packetHash: string }>,
  score = 8,
): EvaluationV4Grade[] => packets.map((packet) => ({
  packetId: packet.packetId,
  packetHash: packet.packetHash,
  rationale: 'The action and ordering substantially match the sealed conditional policy.',
  anchorFindings: { action: 'aligned', priority: 'aligned', guardrails: 'aligned', reversal: 'aligned' },
  score: score as EvaluationV4Grade['score'], judgeProvider: 'codex', judgeModel: 'gpt-5.6-sol',
  rationalePromptHash: 'e'.repeat(64), scorePromptHash: 'f'.repeat(64),
  gradedAt: '2026-07-21T04:00:00.000Z',
}));
