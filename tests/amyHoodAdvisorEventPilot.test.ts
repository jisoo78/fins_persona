/**
 * Test Plan:
 * 1. Happy Path:
 *    - reviewed artifacts produce a validator-ready card and explicit review approves it.
 *
 * 2. Edge Cases:
 *    - a short source remains one chunk.
 *    - a boundary-crossing Amy statement is deduplicated into one span.
 *    - one context document family remains reviewable with a diversity gap.
 *
 * 3. Failure Path:
 *    - invalid manifests, malformed model JSON, invented quotes, missing direct
 *      Amy evidence, post-outcome leakage, and persistence failures cannot
 *      approve or corrupt a card.
 */
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  loadPilotManifest,
  validatePilotManifest,
} from '../server/decisionAdvisor/pilotManifest';
import type {
  EventCandidate,
  PilotManifest,
} from '../shared/amyHoodDecisionAdvisor';

const candidatePath = new URL(
  '../data/b-track/amy-hood/advisor/event-candidates.json',
  import.meta.url,
);

const loadRealCandidates = async () => JSON.parse(
  await readFile(candidatePath, 'utf8'),
) as EventCandidate[];

const validManifest: PilotManifest = {
  dataset: 'amy_hood_phase_3_pilot',
  version: '1.0.0',
  targets: [
    { candidateId: 'candidate-linkedin-acquisition-2016', domain: 'm_and_a', priority: 1 },
    { candidateId: 'candidate-activision-acquisition-2022', domain: 'm_and_a', priority: 2 },
    { candidateId: 'candidate-openai-expansion-2023', domain: 'ai_cloud_capex', priority: 3 },
    { candidateId: 'candidate-copilot-price-2023', domain: 'pricing_monetization', priority: 4 },
    { candidateId: 'candidate-workforce-reset-2023', domain: 'cost_efficiency', priority: 5 },
    { candidateId: 'candidate-github-acquisition-2018', domain: 'm_and_a', priority: 6 },
    { candidateId: 'candidate-nuance-acquisition-2021', domain: 'm_and_a', priority: 7 },
    { candidateId: 'candidate-ai-datacenter-plan-2025', domain: 'ai_cloud_capex', priority: 8 },
    { candidateId: 'candidate-m365-price-2021', domain: 'pricing_monetization', priority: 9 },
    { candidateId: 'candidate-buyback-2021', domain: 'shareholder_return_risk', priority: 10 },
  ],
};

test('happy: pilot manifest fixes ten candidates across all five domains', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'amy-pilot-manifest-'));
  const candidates = await loadRealCandidates();
  const file = path.join(
    root,
    'data/b-track/amy-hood/advisor/events/pilot/pilot-manifest.json',
  );
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(validManifest, null, 2)}\n`);

  const manifest = await loadPilotManifest(root, candidates);

  assert.equal(manifest.targets.length, 10);
  assert.equal(new Set(manifest.targets.map(({ domain }) => domain)).size, 5);
});

test('failure: pilot manifest rejects duplicate, unknown, and domain-mismatched targets', async () => {
  const candidates = await loadRealCandidates();
  const duplicate = structuredClone(validManifest);
  duplicate.targets[1] = { ...duplicate.targets[0], priority: 2 };
  assert.throws(
    () => validatePilotManifest(duplicate, candidates),
    /duplicate pilot candidate/,
  );

  const unknown = structuredClone(validManifest);
  unknown.targets[0].candidateId = 'candidate-does-not-exist';
  assert.throws(
    () => validatePilotManifest(unknown, candidates),
    /unknown pilot candidate/,
  );

  const mismatch = structuredClone(validManifest);
  mismatch.targets[0].domain = 'cost_efficiency';
  assert.throws(
    () => validatePilotManifest(mismatch, candidates),
    /pilot domain mismatch/,
  );
});
