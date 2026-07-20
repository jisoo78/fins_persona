/**
 * Test Plan:
 * 1. Happy Path:
 *    - three exact Amy transcript extractions produce validator-ready cards and a 33-candidate, ten-target pilot update.
 *
 * 2. Edge Cases:
 *    - one source remains owned by both its prior candidate and one new capacity candidate.
 *    - FY24 owned/external supply remains a tactic under scale_infrastructure_constrain_opex.
 *    - punctuation and curly apostrophes match normalized source offsets byte-for-byte.
 *
 * 3. Failure Path:
 *    - malformed offsets, wrong speakers, post-date evidence, holdout references, and mismatched support actions fail safely.
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  applyCapacityResourcePilot,
  loadCapacityResourcePilotManifest,
  type CapacityResourcePilotManifest,
  verifyCapacityResourcePilot,
} from '../server/decisionAdvisor/capacityResourcePilot';
import { approvePilotEventCard, eventCardPath } from '../server/decisionAdvisor/eventCard';
import { writeJsonAtomic } from '../server/decisionAdvisor/jsonStore';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

const runAdvisorCli = (root: string, ...args: string[]) => spawnSync(
  process.execPath,
  ['--import', 'tsx', 'server/runAmyHoodDecisionAdvisor.ts', ...args, '--root', root],
  { cwd: repositoryRoot, encoding: 'utf8' },
);

const candidateSpecs = [
  {
    id: 'candidate-cloud-capacity-scale-2022',
    workingTitle: 'Cloud services sequential increase under global demand decision',
    decisionDate: '2022-04-26',
    fingerprint: {
      primaryEntity: 'cloud services',
      decisionAction: 'sequential increase',
      eventSpecificIdentifier: 'global demand',
    },
  },
  {
    id: 'candidate-ai-capacity-opex-pivot-2023',
    workingTitle: 'Azure AI infrastructure material sequential increase decision',
    decisionDate: '2023-04-25',
    fingerprint: {
      primaryEntity: 'Azure AI infrastructure',
      decisionAction: 'material sequential increase',
      eventSpecificIdentifier: 'capital expenditures',
    },
  },
  {
    id: 'candidate-ai-capacity-sourcing-2024',
    workingTitle: 'Cloud and AI investment disciplined cost management decision',
    decisionDate: '2024-01-30',
    fingerprint: {
      primaryEntity: 'cloud and AI investment',
      decisionAction: 'scaling',
      eventSpecificIdentifier: 'disciplined cost management',
    },
  },
] as const;

const selectedOptions = (chosenAction: string) => [
  {
    id: 'scale_infrastructure_and_people',
    description: 'Scale infrastructure and operating headcount together.',
    expectedBenefit: 'Adds physical and organizational capacity together.',
    principalRisk: 'Raises both capital intensity and recurring operating expense.',
    selected: chosenAction === 'scale_infrastructure_and_people',
  },
  {
    id: 'scale_infrastructure_constrain_opex',
    description: 'Scale infrastructure while constraining operating-resource growth.',
    expectedBenefit: 'Funds capacity while preserving operating discipline.',
    principalRisk: 'Requires aggressive prioritization and may create execution bottlenecks.',
    selected: chosenAction === 'scale_infrastructure_constrain_opex',
  },
];

const card = (
  chosenAction: 'scale_infrastructure_and_people' | 'scale_infrastructure_constrain_opex',
  conditions: string[],
) => ({
  title: `Capacity resource choice: ${chosenAction}`,
  decisionQuestion: 'How should Microsoft scale infrastructure and operating resources as demand and profitability constraints change?',
  situation: 'Microsoft needed to match cloud and AI capacity with observable customer demand.',
  objectives: ['Meet customer demand', 'Preserve disciplined profitability'],
  conditions,
  constraints: ['Infrastructure has a delivery lead time', 'Operating resources create recurring cost'],
  options: selectedOptions(chosenAction),
  chosenAction,
  rejectedBenefit: 'The rejected resource mix could improve either near-term leverage or execution capacity.',
  observations: ['Amy Hood disclosed the resource allocation and its demand condition.'],
  inferences: ['The selected mix reflects the disclosed demand and profitability constraints.'],
});

const validManifest = (): CapacityResourcePilotManifest => ({
  dataset: 'amy_hood_capacity_resource_pilot',
  version: '1.0.0',
  events: [
    {
      candidate: structuredClone(candidateSpecs[0]),
      sourceId: 'source-6b843b4b8385078d',
      publishedAt: '2022-04-26',
      replacePriority: 6,
      card: card('scale_infrastructure_and_people', [
        'Global cloud-services demand was growing.',
        'Investment needs spanned infrastructure and multiple operating teams.',
      ]),
      evidence: [
        {
          id: 'span-capacity-2022-headcount',
          role: 'decision_context',
          startChar: 19999,
          endChar: 20240,
          speaker: 'Amy Hood',
          exactQuote: 'At a total company level, headcount grew 20% year-over-year as we continue to invest in key areas such as cloud engineering, customer deployment, LinkedIn, and sales, and included approximately 4 points of growth from the addition of Nuance.',
        },
        {
          id: 'span-capacity-2022-capex',
          role: 'direct_amy',
          startChar: 29207,
          endChar: 29357,
          speaker: 'Amy Hood',
          exactQuote: 'Capital expenditures, we expect a sequential increase on a dollar basis as we continue to invest to meet growing global demand for our cloud services.',
        },
      ],
    },
    {
      candidate: structuredClone(candidateSpecs[1]),
      sourceId: 'source-fbb900eb7e249591',
      publishedAt: '2023-04-25',
      replacePriority: 7,
      card: card('scale_infrastructure_constrain_opex', [
        'Azure AI infrastructure required material sequential investment.',
        'Scaled capital investment would increase COGS.',
      ]),
      evidence: [
        {
          id: 'span-capacity-2023-ai-capex',
          role: 'decision_context',
          startChar: 28256,
          endChar: 28393,
          speaker: 'Amy Hood',
          exactQuote: 'We expect capital expenditures to have a material sequential increase on a dollar basis driven by investments in Azure AI infrastructure.',
        },
        {
          id: 'span-capacity-2023-opex',
          role: 'direct_amy',
          startChar: 33082,
          endChar: 33313,
          speaker: 'Amy Hood',
          exactQuote: 'As always, we remain committed to aligning costs and revenue growth to deliver disciplined profitability. Therefore, while the scaled capex investments will impact COGS growth, we expect FY24 operating expense growth to remain low.',
        },
      ],
    },
    {
      candidate: structuredClone(candidateSpecs[2]),
      sourceId: 'source-4f4085f8344669c4',
      publishedAt: '2024-01-30',
      replacePriority: 8,
      card: card('scale_infrastructure_constrain_opex', [
        'Customer demand guided cloud and AI investment.',
        'Third-party capacity supplemented owned capacity when lead time required it.',
      ]),
      evidence: [
        {
          id: 'span-capacity-2024-demand-discipline',
          role: 'direct_amy',
          startChar: 33141,
          endChar: 33424,
          speaker: 'Amy Hood',
          exactQuote: 'Our commitment to scaling our cloud and AI investment is guided by customer demand and the substantial market opportunity. As we scale these investments, we remain focused on driving efficiencies across every layer of our tech stack and disciplined cost management across every team.',
        },
        {
          id: 'span-capacity-2024-external-supply',
          role: 'decision_context',
          startChar: 43617,
          endChar: 44010,
          speaker: 'Amy Hood',
          exactQuote: 'I feel like primarily, obviously, this is being built by us, but we’ve also used third-party capacity to help when we could have that help us, in terms of meeting customer demand. And I tend to think, looking forward, you’ll tend to see, and I guided toward it, accelerating capital expense to continue to be able to add capacity in the coming quarters, given what we see in terms of pipeline.',
        },
      ],
    },
  ],
});

const createFixtureRoot = async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'amy-capacity-resource-'));
  const advisorRoot = path.resolve(root, 'data/b-track/amy-hood/advisor');
  await mkdir(path.resolve(advisorRoot, 'events/pilot'), { recursive: true });
  await mkdir(path.resolve(root, 'evaluation/v3/sealed'), { recursive: true });
  for (const relative of [
    'event-candidates.json',
    'source-registry.json',
    'events/pilot/pilot-manifest.json',
  ]) {
    await cp(
      path.resolve(repositoryRoot, 'data/b-track/amy-hood/advisor', relative),
      path.resolve(advisorRoot, relative),
    );
  }
  await cp(
    path.resolve(repositoryRoot, 'data/b-track/amy-hood/advisor/raw'),
    path.resolve(advisorRoot, 'raw'),
    { recursive: true },
  );
  await cp(
    path.resolve(repositoryRoot, 'data/b-track/amy-hood/advisor/normalized'),
    path.resolve(advisorRoot, 'normalized'),
    { recursive: true },
  );
  await cp(
    path.resolve(repositoryRoot, 'evaluation/v3/sealed/holdout-manifest.json'),
    path.resolve(root, 'evaluation/v3/sealed/holdout-manifest.json'),
  );
  return root;
};

test('happy: exact raw spans produce three validator-ready capacity resource events', async () => {
  const root = await createFixtureRoot();
  try {
    const manifestPath = path.resolve(root, 'capacity-resource.json');
    await writeFile(manifestPath, `${JSON.stringify(validManifest(), null, 2)}\n`);
    const input = await loadCapacityResourcePilotManifest(root, manifestPath);
    const verified = await verifyCapacityResourcePilot(root, input);

    assert.equal(verified.candidates.length, 33);
    assert.equal(verified.cards.length, 3);
    assert.equal(verified.pilotManifest.targets.length, 10);
    assert.equal(new Set(verified.pilotManifest.targets.map(({ domain }) => domain)).size, 5);
    assert.deepEqual(verified.cards.map(({ chosenAction }) => chosenAction), [
      'scale_infrastructure_and_people',
      'scale_infrastructure_constrain_opex',
      'scale_infrastructure_constrain_opex',
    ]);
    assert.equal(verified.cards.every(({ status }) => status === 'incomplete'), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('edge: a reused transcript preserves prior and new candidate ownership', async () => {
  const root = await createFixtureRoot();
  try {
    const verified = await verifyCapacityResourcePilot(root, validManifest());
    const source = verified.registry.sources.find(({ id }) => id === 'source-fbb900eb7e249591');
    assert.deepEqual(source?.eventCandidateIds.sort(), [
      'candidate-ai-capacity-opex-pivot-2023',
      'candidate-copilot-price-2023',
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('edge: owned and external supply remains a tactic under the constrained-Opex action', async () => {
  const root = await createFixtureRoot();
  try {
    const verified = await verifyCapacityResourcePilot(root, validManifest());
    assert.match(verified.cards[2].conditions.join('\n'), /Third-party capacity/);
    assert.equal(verified.cards[2].chosenAction, 'scale_infrastructure_constrain_opex');
    assert.equal(verified.cards[2].options.some(({ id }) => id === 'owned_and_external_capacity'), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('edge: normalized curly apostrophe evidence matches the declared FY24 byte range', async () => {
  const root = await createFixtureRoot();
  try {
    const verified = await verifyCapacityResourcePilot(root, validManifest());
    assert.equal(
      verified.cards[2].evidenceSpans.some(({ exactQuote }) =>
        exactQuote.includes('we’ve also used third-party capacity')),
      true,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('failure: invalid provenance or action contrast is rejected before any write', async (t) => {
  const root = await createFixtureRoot();
  try {
    await t.test('offset mismatch', async () => {
      const input = validManifest();
      input.events[0].evidence[0].startChar += 1;
      await assert.rejects(() => verifyCapacityResourcePilot(root, input), /exact quote offset mismatch/);
    });
    await t.test('wrong speaker', async () => {
      const input = validManifest();
      input.events[1].evidence[0].speaker = 'Satya Nadella' as 'Amy Hood';
      await assert.rejects(() => verifyCapacityResourcePilot(root, input), /Amy Hood speaker ownership/);
    });
    await t.test('post-date evidence', async () => {
      const input = validManifest();
      input.events[0].publishedAt = '2022-04-27';
      await assert.rejects(() => verifyCapacityResourcePilot(root, input), /post-outcome evidence/);
    });
    await t.test('holdout source', async () => {
      const input = validManifest();
      input.events[0].sourceId = 'source-7f4b2d38f70ad433';
      await assert.rejects(() => verifyCapacityResourcePilot(root, input), /holdout/);
    });
    await t.test('mismatched support action', async () => {
      const input = validManifest();
      input.events[2].card.chosenAction = 'scale_infrastructure_and_people';
      await assert.rejects(
        () => verifyCapacityResourcePilot(root, input),
        /FY23 and FY24 support actions must match/,
      );
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

const snapshotPaths = async (files: string[]) => Promise.all(files.map(async (file) => {
  try {
    return [file, await readFile(file)] as const;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [file, null] as const;
    throw error;
  }
}));

test('happy: atomic apply appends events while preserving original candidates and holdout bytes', async () => {
  const root = await createFixtureRoot();
  try {
    const advisorRoot = path.resolve(root, 'data/b-track/amy-hood/advisor');
    const candidatePath = path.resolve(advisorRoot, 'event-candidates.json');
    const holdoutPath = path.resolve(root, 'evaluation/v3/sealed/holdout-manifest.json');
    const originalCandidates = JSON.parse(await readFile(candidatePath, 'utf8')) as unknown[];
    const originalHoldout = await readFile(holdoutPath);
    const originalRawBodies = new Map<string, string>();
    const verified = await verifyCapacityResourcePilot(root, validManifest());
    for (const { record } of verified.rawSourceUpdates) {
      const raw = JSON.parse(
        await readFile(path.resolve(advisorRoot, record.rawPath!), 'utf8'),
      ) as { bodyBase64: string };
      originalRawBodies.set(record.id, raw.bodyBase64);
    }

    const applied = await applyCapacityResourcePilot(root, validManifest());

    const storedCandidates = JSON.parse(await readFile(candidatePath, 'utf8')) as unknown[];
    assert.equal(storedCandidates.length, 33);
    assert.deepEqual(storedCandidates.slice(0, originalCandidates.length), originalCandidates);
    assert.deepEqual(await readFile(holdoutPath), originalHoldout);
    for (const { record } of applied.rawSourceUpdates) {
      const raw = JSON.parse(
        await readFile(path.resolve(advisorRoot, record.rawPath!), 'utf8'),
      ) as { bodyBase64: string };
      assert.equal(raw.bodyBase64, originalRawBodies.get(record.id));
    }
    for (const card of applied.cards) {
      const stored = JSON.parse(await readFile(eventCardPath(root, card.candidateId), 'utf8')) as {
        candidateId: string;
        status: string;
      };
      assert.equal(stored.candidateId, card.candidateId);
      assert.equal(stored.status, 'incomplete');
    }

    const destinations = [
      candidatePath,
      path.resolve(advisorRoot, 'source-registry.json'),
      path.resolve(advisorRoot, 'events/pilot/pilot-manifest.json'),
      ...applied.rawSourceUpdates.map(({ record }) => path.resolve(advisorRoot, record.rawPath!)),
      ...applied.cards.map(({ candidateId }) => eventCardPath(root, candidateId)),
    ];
    const beforeSecondApply = await snapshotPaths(destinations);
    await applyCapacityResourcePilot(root, validManifest());
    assert.deepEqual(await snapshotPaths(destinations), beforeSecondApply);

    const reviewedCandidateId = applied.cards[0].candidateId;
    await approvePilotEventCard(root, reviewedCandidateId, {
      reviewer: 'Codex exact-span review',
      reviewedAt: '2026-07-20T12:00:00.000Z',
    });
    await applyCapacityResourcePilot(root, validManifest());
    const reviewedCard = JSON.parse(
      await readFile(eventCardPath(root, reviewedCandidateId), 'utf8'),
    ) as { status: string; reviewer: string | null };
    assert.deepEqual(reviewedCard, {
      ...reviewedCard,
      status: 'approved',
      reviewer: 'Codex exact-span review',
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('failure: injected multi-file write failure restores every prior artifact', async () => {
  const root = await createFixtureRoot();
  try {
    const advisorRoot = path.resolve(root, 'data/b-track/amy-hood/advisor');
    const verified = await verifyCapacityResourcePilot(root, validManifest());
    const destinations = [
      path.resolve(advisorRoot, 'event-candidates.json'),
      path.resolve(advisorRoot, 'source-registry.json'),
      path.resolve(advisorRoot, 'events/pilot/pilot-manifest.json'),
      ...verified.rawSourceUpdates.map(({ record }) => path.resolve(advisorRoot, record.rawPath!)),
      ...verified.cards.map(({ candidateId }) => eventCardPath(root, candidateId)),
    ];
    const before = await snapshotPaths(destinations);
    let writes = 0;

    await assert.rejects(() => applyCapacityResourcePilot(root, validManifest(), {
      write: async (filePath, value) => {
        writes += 1;
        if (writes === 4) throw new Error('injected capacity apply failure');
        await writeJsonAtomic(filePath, value);
      },
    }), /injected capacity apply failure/);

    assert.deepEqual(await snapshotPaths(destinations), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('happy: capacity CLI verifies and applies a reviewed manifest', async () => {
  const root = await createFixtureRoot();
  try {
    const manifestPath = path.resolve(root, 'capacity-resource.json');
    await writeFile(manifestPath, `${JSON.stringify(validManifest(), null, 2)}\n`);

    const checked = runAdvisorCli(root, 'capacity:check', '--file', manifestPath);
    assert.equal(checked.status, 0, checked.stderr);
    assert.match(checked.stdout, /"candidateCount": 33/);
    assert.match(checked.stdout, /candidate-cloud-capacity-scale-2022/);

    const applied = runAdvisorCli(root, 'capacity:apply', '--file', manifestPath);
    assert.equal(applied.status, 0, applied.stderr);
    assert.match(applied.stdout, /"cardCount": 3/);
    assert.equal(
      JSON.parse(await readFile(
        path.resolve(root, 'data/b-track/amy-hood/advisor/event-candidates.json'),
        'utf8',
      )).length,
      33,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
