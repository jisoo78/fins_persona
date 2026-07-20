/**
 * Test Plan:
 * 1. Happy Path:
 *    - approved non-holdout events become reviewed policies in an immutable active release loadable by Evaluation v3.
 * 2. Edge Cases:
 *    - direct Amy policy evidence plus confirmation in another event and document family qualifies as medium confidence.
 *    - a materially contrasting event narrows policy boundaries and supplies an observable reversal signal.
 *    - rebuilding identical approved content returns the same content-addressed release.
 * 3. Failure Path:
 *    - holdout/post-outcome leakage, unsupported policies, invalid model JSON, stale evidence, tampered hashes, and failed activation preserve the last valid state.
 */
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { loadPolicyMemoryInput } from '../server/decisionAdvisor/policyMemoryInput';

test('happy: input graph selects only approved non-holdout decision evidence', async () => {
  const graph = await loadPolicyMemoryInput(process.cwd());

  assert.deepEqual(graph.events.map(({ id }) => id), [
    'event-activision-acquisition-2022',
    'event-copilot-price-2023',
    'event-linkedin-acquisition-2016',
    'event-openai-expansion-2023',
    'event-workforce-reset-2023',
  ]);
  assert.equal(graph.events.every(({ status }) => status === 'approved'), true);
  assert.equal(graph.references.some(({ id }) => id.includes('github')), false);
  assert.equal(graph.evidenceSpans.some(({ role }) => role === 'post_outcome'), false);
});

const copyPolicyMemoryData = async () => {
  const root = await mkdtemp(join(tmpdir(), 'amy-policy-memory-'));
  await cp(
    join(process.cwd(), 'data/b-track/amy-hood/advisor'),
    join(root, 'data/b-track/amy-hood/advisor'),
    { recursive: true },
  );
  await cp(
    join(process.cwd(), 'evaluation/v3/sealed/holdout-manifest.json'),
    join(root, 'evaluation/v3/sealed/holdout-manifest.json'),
    { recursive: true },
  );
  return root;
};

test('failure: holdout and post-outcome inputs fail before model work', async (context) => {
  const holdoutRoot = await copyPolicyMemoryData();
  const outcomeRoot = await copyPolicyMemoryData();
  context.after(async () => Promise.all([
    rm(holdoutRoot, { recursive: true, force: true }),
    rm(outcomeRoot, { recursive: true, force: true }),
  ]));

  const holdoutPath = join(
    holdoutRoot,
    'data/b-track/amy-hood/advisor/events/pilot/candidate-github-acquisition-2018.json',
  );
  const holdout = JSON.parse(await readFile(holdoutPath, 'utf8'));
  holdout.status = 'approved';
  await writeFile(holdoutPath, `${JSON.stringify(holdout, null, 2)}\n`);
  await assert.rejects(() => loadPolicyMemoryInput(holdoutRoot), /holdout/);

  const outcomePath = join(
    outcomeRoot,
    'data/b-track/amy-hood/advisor/events/pilot/candidate-activision-acquisition-2022.json',
  );
  const outcome = JSON.parse(await readFile(outcomePath, 'utf8'));
  outcome.evidenceSpans[0].role = 'post_outcome';
  await writeFile(outcomePath, `${JSON.stringify(outcome, null, 2)}\n`);
  await assert.rejects(() => loadPolicyMemoryInput(outcomeRoot), /post-outcome/);
});
