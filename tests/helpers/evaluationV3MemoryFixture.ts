import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { MemoryReleaseManifest } from '../../shared/amyHoodDecisionAdvisor';
import type { EvaluationV3ContextPackage } from '../../server/evaluationV3/context';
import type { EvaluationV3ArtifactReference } from '../../server/evaluationV3/holdout';

type Snapshot = Omit<EvaluationV3ContextPackage, 'memoryReleaseId'> & {
  counterexampleStatus: 'reviewed' | 'no_reviewed_counterexample';
  references: EvaluationV3ArtifactReference[];
};

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

export const writeEvaluationV3MemoryFixture = async (
  root: string,
  snapshot: Snapshot,
) => {
  const version = 'v1-aaaaaaaaaaaa';
  const releaseId = version;
  const releaseRoot = join(
    root,
    'data/b-track/amy-hood/advisor/memory-releases',
    version,
  );
  await mkdir(releaseRoot, { recursive: true });
  await mkdir(join(root, 'evaluation/v3/sealed'), { recursive: true });
  await writeFile(
    join(root, 'evaluation/v3/sealed/holdout-manifest.json'),
    readFileSync(
      join(process.cwd(), 'evaluation/v3/sealed/holdout-manifest.json'),
      'utf8',
    ),
  );
  const contextText = JSON.stringify({ releaseId, ...snapshot });
  await writeFile(join(releaseRoot, 'evaluation-context.json'), contextText);
  const manifest: MemoryReleaseManifest = {
    schemaVersion: 1,
    releaseId,
    version,
    createdAt: '2026-07-15T00:00:00.000Z',
    sourceRegistryHash: 'source-registry-hash',
    pilotManifestHash: 'pilot-manifest-hash',
    holdoutManifestHash: 'holdout-manifest-hash',
    artifacts: [{
      id: 'fixture-policy',
      kind: 'policy',
      relativePath: 'policies/fixture-policy.json',
      sha256: 'fixture-artifact-hash',
    }],
    evaluationContextPath: 'evaluation-context.json',
    evaluationContextHash: hash(contextText),
    reviewLedgerHash: 'review-ledger-hash',
  };
  const manifestText = JSON.stringify(manifest);
  await writeFile(join(releaseRoot, 'manifest.json'), manifestText);
  await writeFile(
    join(root, 'data/b-track/amy-hood/advisor/memory-releases/active.json'),
    JSON.stringify({
      releaseId,
      version,
      manifestHash: hash(manifestText),
      activatedAt: '2026-07-15T00:00:00.000Z',
    }),
  );
  return { releaseId, version, releaseRoot };
};
