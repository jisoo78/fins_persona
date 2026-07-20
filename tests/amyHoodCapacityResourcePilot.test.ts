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
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  loadCapacityResourcePilotManifest,
  type CapacityResourcePilotManifest,
  verifyCapacityResourcePilot,
} from '../server/decisionAdvisor/capacityResourcePilot';

const repositoryRoot = path.resolve(import.meta.dirname, '..');

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
