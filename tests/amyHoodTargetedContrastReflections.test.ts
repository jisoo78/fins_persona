/**
 * Test Plan:
 * 1. Happy Path:
 *    - three user-approved opposite-action events validate through their existing Reflection and Policy IDs.
 * 2. Edge Cases:
 *    - overwriting contrasts preserves the previously approved supporting event sets.
 *    - provisional-source events retain explicit provenance limitations after approval.
 *    - canonical source URLs remain unique after the targeted evidence merge.
 * 3. Failure Path:
 *    - a Policy whose opposite event diverges from its approved Reflection fails validation safely.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import type { PolicyMemory, ReflectionMemory } from '../shared/amyHoodDecisionAdvisor';
import { validatePolicyMemory } from '../server/decisionAdvisor/policyMemory';
import { loadPolicyMemoryInput } from '../server/decisionAdvisor/policyMemoryInput';
import { validateReflectionMemory } from '../server/decisionAdvisor/reflectionMemory';

const advisorRoot = path.resolve('data/b-track/amy-hood/advisor');

const targets = [
  {
    domain: 'cost_efficiency',
    reflectionId: 'reflection-bd563b486d9d6f9b',
    policyId: 'policy-20d2c645ab6641c9',
    eventId: 'event-priority-reinvestment-fy2022',
    supportingEventIds: ['event-transformation-2026', 'event-workforce-reset-2023'],
    requiresSourceLimitation: false,
  },
  {
    domain: 'ai_cloud_capex',
    reflectionId: 'reflection-f75c6c30eef7c1e0',
    policyId: 'policy-e7eafcda9e4dc2e3',
    eventId: 'event-ai-datacenter-project-pacing-2025',
    supportingEventIds: ['event-ai-capacity-opex-pivot-2023', 'event-ai-capacity-sourcing-2024'],
    requiresSourceLimitation: true,
  },
  {
    domain: 'shareholder_return_risk',
    reflectionId: 'reflection-7371bfa747efb778',
    policyId: 'policy-a7972af407a0bf69',
    eventId: 'event-buyback-deployment-slowdown-fy2023',
    supportingEventIds: ['event-buyback-2013', 'event-buyback-2024'],
    requiresSourceLimitation: true,
  },
] as const;

const readJson = async <T>(relativePath: string): Promise<T> =>
  JSON.parse(await readFile(path.resolve(advisorRoot, relativePath), 'utf8')) as T;

const loadTargetArtifacts = async (target: typeof targets[number]) => ({
  reflection: await readJson<ReflectionMemory>(
    `policy-memory/approved/reflections/${target.reflectionId}.json`,
  ),
  policy: await readJson<PolicyMemory>(
    `policy-memory/approved/policies/${target.policyId}.json`,
  ),
});

test('happy: approved opposite-action events validate through preserved Reflection and Policy IDs', async () => {
  const graph = await loadPolicyMemoryInput(process.cwd());
  const graphEventIds = new Set(graph.events.map(({ id }) => id));

  for (const target of targets) {
    const { reflection, policy } = await loadTargetArtifacts(target);
    assert.equal(reflection.id, target.reflectionId);
    assert.equal(policy.id, target.policyId);
    assert.equal(reflection.domain, target.domain);
    assert.equal(policy.domain, target.domain);
    assert.equal(graphEventIds.has(target.eventId), true, `${target.eventId} is missing`);
    assert.equal(reflection.contrastStatus, 'reviewed');
    assert.deepEqual(reflection.contrastingEventIds, [target.eventId]);
    assert.deepEqual(policy.contrastingEventIds, [target.eventId]);
    assert.ok(reflection.contrastPattern);
    assert.equal(validateReflectionMemory(reflection, graph).passed, true);
    assert.equal(validatePolicyMemory(policy, [reflection], graph).passed, true);
  }
});

test('edge: contrast overwrite preserves every approved supporting event', async () => {
  for (const target of targets) {
    const { reflection, policy } = await loadTargetArtifacts(target);
    assert.deepEqual([...reflection.supportingEventIds].sort(), [...target.supportingEventIds].sort());
    assert.deepEqual([...policy.supportingEventIds].sort(), [...target.supportingEventIds].sort());
  }
});

test('edge: provisional-source approvals retain explicit evidence limitations', async () => {
  for (const target of targets.filter(({ requiresSourceLimitation }) => requiresSourceLimitation)) {
    const { reflection } = await loadTargetArtifacts(target);
    assert.equal(reflection.unresolvedConflicts.length > 0, true);
    assert.match(reflection.unresolvedConflicts.join(' '), /Amy Hood|동시점|causal|event-specific/i);
  }
});

test('edge: targeted merge does not duplicate canonical source URLs', async () => {
  const registry = await readJson<{ sources: Array<{ canonicalUrl: string }> }>('source-registry.json');
  const urls = registry.sources.map(({ canonicalUrl }) => canonicalUrl);
  const targetedUrls = [
    'https://news.microsoft.com/wp-content/uploads/prod/2021/07/TranscriptFY21Q4.pdf',
    'https://www.sec.gov/Archives/edgar/data/789019/000156459022026876/msft-10k_20220630.htm',
    'https://www.microsoft.com/en-us/Investor/events/FY-2024/earnings-fy-2024-q4.aspx',
    'https://www.linkedin.com/posts/jamesthorn_noelle-has-stated-this-better-than-i-ever-activity-7315549305656823808-0Fe0',
    'https://apnews.com/article/4d987fe8446fc9e6cda31d919f938911',
    'https://www.sec.gov/Archives/edgar/data/789019/000095017023035122/msft-20230630.htm',
    'https://www.microsoft.com/en-us/investor/events/fy-2026/2025-annual-shareholder-meeting',
  ];
  for (const url of targetedUrls) {
    assert.equal(urls.filter((candidate) => candidate === url).length <= 1, true, url);
  }
});

test('failure: policy and Reflection contrast divergence fails validation', async () => {
  const graph = await loadPolicyMemoryInput(process.cwd());
  const target = targets[0];
  const { reflection, policy } = await loadTargetArtifacts(target);
  const invalid = {
    ...policy,
    contrastingEventIds: ['event-ai-datacenter-project-pacing-2025'],
  };
  const validation = validatePolicyMemory(invalid, [reflection], graph);
  assert.equal(validation.passed, false);
  assert.match(validation.errors.join('\n'), /contrast exceeds its reflections/i);
});
