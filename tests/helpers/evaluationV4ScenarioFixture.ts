import type {
  EvaluationV4AlignmentKey,
  EvaluationV4BundleInput,
  EvaluationV4Provenance,
  EvaluationV4Scenario,
} from '../../shared/amyHoodEvaluationV4';
import { EVALUATION_V4_DOMAINS } from '../../shared/amyHoodEvaluationV4';

export const evaluationV4BundleFixture = (): EvaluationV4BundleInput => {
  const scenarios: EvaluationV4Scenario[] = EVALUATION_V4_DOMAINS.flatMap((domain, index) => [
    {
      id: `AAS-CAL-${['MA', 'AI', 'PM', 'CE', 'SR'][index]}-01`,
      domain,
      variant: 'base_transfer',
      title: `Neutral decision ${index + 1}A`,
      situation: 'A large public company faces a material resource-allocation decision with incomplete demand and execution signals.',
      decisionQuestion: 'What action should the finance leader recommend, and which conditions should govern it?',
    },
    {
      id: `AAS-CAL-${['MA', 'AI', 'PM', 'CE', 'SR'][index]}-02`,
      domain,
      variant: 'reversal',
      title: `Neutral decision ${index + 1}B`,
      situation: 'The original investment thesis has weakened while irreversible commitment and customer impact have increased.',
      decisionQuestion: 'Should the prior course continue, pause, or reverse, and why?',
    },
  ]);
  const externalEvents = scenarios.map((scenario, index) => ({
    id: `external-event-${index + 1}`,
    domain: scenario.domain,
    executiveName: `Executive ${index + 1}`,
    organization: `Organization ${index + 1}`,
    primarySourceId: `ext-source-${index + 1}`,
    secondarySourceIds: [],
    secondarySourceStatus: 'documented_unavailable' as const,
    secondarySourceRationale: 'A second independent decision-time source was not available in the bounded reviewed public record.',
    actualHistoricalAction: `Historical action ${index + 1}`,
    outcomeEvidenceIds: [],
  }));
  const provenance: EvaluationV4Provenance[] = scenarios.map((scenario, index) => ({
    scenarioId: scenario.id,
    externalEventId: externalEvents[index].id,
    sourceIds: [externalEvents[index].primarySourceId],
    decisionCutoff: '2024-01-01',
    actualHistoricalAction: externalEvents[index].actualHistoricalAction,
    outcomeEvidenceIds: [],
  }));
  const alignmentKeys: EvaluationV4AlignmentKey[] = scenarios.map((scenario, index) => ({
    scenarioId: scenario.id,
    policyId: `policy-${scenario.domain}`,
    scenarioVariant: scenario.variant,
    expectedAction: `Expected bounded action ${index + 1}`,
    priorityOrder: ['Demand evidence', 'Financial boundary', 'Execution capacity'],
    guardrails: ['Preserve an explicit downside boundary.'],
    reversalSignals: ['Reverse if the primary demand or economics signal weakens.'],
    acceptableVariants: ['A staged commitment with the same boundaries.'],
    identityConflicts: ['Unbounded commitment based only on strategic narrative.'],
    referenceRationale: 'The mapped policy prioritizes verified demand, bounded economics, and execution capacity.',
  }));
  return {
    stage: 'calibration',
    scenarioFile: {
      dataset: 'amy_hood_action_alignment_scenarios',
      version: '4.0.0',
      stage: 'calibration',
      frozenAt: '2026-07-21T02:00:00.000Z',
      scenarios,
    },
    reviewFile: {
      scenarioSetVersion: '4.0.0',
      reviews: scenarios.map(({ id }) => ({
        scenarioId: id,
        status: 'approved',
        revisionNote: '',
        provenanceComplete: true,
        alignmentKeyComplete: true,
        reviewedAt: '2026-07-21T02:00:00.000Z',
      })),
    },
    provenance,
    alignmentKeys,
    externalEvents,
    externalSourceHash: 'a'.repeat(64),
    manifest: null,
  };
};
