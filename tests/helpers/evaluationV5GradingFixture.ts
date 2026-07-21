import { cp, mkdir, mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  EVALUATION_V5_ARMS,
  type EvaluationV5Grade,
  type EvaluationV5JudgePacket,
  type EvaluationV5PairGrade,
  type EvaluationV5PairJudgePacket,
  type EvaluationV5Run,
} from '../../shared/amyHoodEvaluationV5';
import { writeEvaluationV5Run } from '../../server/evaluationV5/runStore';

export const installEvaluationV5GradingFixture = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'amy-v5-grade-'));
  await mkdir(path.join(root, 'evaluation'), { recursive: true });
  await cp(path.join(process.cwd(), 'evaluation/v5'), path.join(root, 'evaluation/v5'), { recursive: true });
  await mkdir(path.join(root, 'data/b-track/amy-hood/advisor'), { recursive: true });
  await cp(
    path.join(process.cwd(), 'data/b-track/amy-hood/advisor/source-registry.json'),
    path.join(root, 'data/b-track/amy-hood/advisor/source-registry.json'),
  );
  const scenarios = (JSON.parse(await readFile(
    path.join(root, 'evaluation/v5/public/scenarios.json'),
    'utf8',
  )) as { scenarios: Array<{ id: string; phase: 'initial' | 'changed' }> }).scenarios;
  const manifest = JSON.parse(await readFile(
    path.join(root, 'evaluation/v5/sealed/manifest.json'),
    'utf8',
  )) as { bundleHash: string };
  const groupId = 'grade-v5-fixture-group';
  const runs: EvaluationV5Run[] = [];
  let runNumber = 0;
  for (const repetition of [1, 2, 3, 4, 5] as const) {
    for (const arm of EVALUATION_V5_ARMS) {
      runNumber += 1;
      const rag = arm !== 'amy_prompt';
      const runId = `grade-v5-run-${runNumber}`;
      const run: EvaluationV5Run = {
        runId,
        version: '5.0.0',
        stage: 'benchmark',
        scenarioSetVersion: '5.0.0',
        experimentGroupId: groupId,
        repetition,
        orderSeed: `seed-${repetition}`,
        scenarioOrder: scenarios.map(({ id }) => id),
        arm,
        provider: 'local',
        model: 'e4b-test',
        scenarioSetHash: manifest.bundleHash,
        promptVersionId: 'amy-v1',
        promptHash: '1'.repeat(64),
        memoryReleaseId: rag ? 'release-v5' : null,
        memoryReleaseHash: rag ? 'a'.repeat(64) : null,
        memoryIndexHash: rag ? 'b'.repeat(64) : null,
        retrievalConfigHash: rag ? 'c'.repeat(64) : null,
        status: 'complete',
        answers: scenarios.map((scenario, scenarioIndex) => ({
          scenarioId: scenario.id,
          status: 'complete' as const,
          response: {
            action: `${scenario.phase === 'initial' ? 'Initial' : 'Changed'} bounded recommendation ${runNumber}.`,
            priorities: ['Demand', 'Economics', 'Execution'] as [string, string, string],
            guardrails: ['Preserve downside capacity.'],
            reversalSignals: ['Evidence weakens.'],
            rationale: 'The recommendation is conditional on observable evidence.',
          },
          elapsedMs: 1,
          ...(rag ? {
            retrieval: {
              queryHash: `${scenarioIndex}`.padStart(64, '0'),
              indexHash: 'b'.repeat(64),
              retrievalConfigHash: 'c'.repeat(64),
              cacheKey: `${scenarioIndex + 1}`.padStart(64, '0'),
              selectedArtifacts: [{
                id: 'placeholder-policy',
                kind: 'policy' as const,
                vectorScore: 0.9,
                lexicalScore: 0.8,
                fusedScore: 0.87,
              }],
              expandedArtifactIds: ['placeholder-policy'],
              evidenceIds: ['evidence'],
              sourceIds: ['source'],
              noMatch: false,
              noMatchReason: null,
              contextTokens: 100,
              requestTokens: 1000,
              tokenCounter: 'conservative_estimator' as const,
              contextHash: 'd'.repeat(64),
            },
          } : {}),
        })),
        startedAt: '2026-07-21T07:00:00.000Z',
        completedAt: '2026-07-21T07:30:00.000Z',
      };
      runs.push(await writeEvaluationV5Run(root, run));
    }
  }
  return { root, groupId, runs };
};

const provenance = {
  judgeProvider: 'codex' as const,
  judgeModel: 'gpt-5.6-sol',
  rationalePromptHash: 'e'.repeat(64),
  scorePromptHash: 'f'.repeat(64),
  gradedAt: '2026-07-21T08:00:00.000Z',
};

export const gradesForV5Packets = (
  packets: EvaluationV5JudgePacket[],
): EvaluationV5Grade[] => packets.map((packet) => ({
  packetId: packet.packetId,
  packetHash: packet.packetHash,
  rationale: 'The action and decision order match the sealed conditional policy.',
  anchorFindings: { action: 'aligned', priority: 'aligned', guardrails: 'aligned', reversal: 'aligned' },
  score: 8,
  ...provenance,
}));

export const pairGradesForV5Packets = (
  packets: EvaluationV5PairJudgePacket[],
): EvaluationV5PairGrade[] => packets.map((packet) => ({
  packetId: packet.packetId,
  packetHash: packet.packetHash,
  rationale: 'The changed action responds to the changed signal while preserving the invariant.',
  aligned: true,
  expectedResponseFinding: 'aligned',
  changedSignalFinding: 'aligned',
  invariantFinding: 'aligned',
  ...provenance,
}));
