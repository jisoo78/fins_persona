import { createHash } from 'node:crypto';

import type { DecisionDomain } from '../../shared/amyHoodDecisionAdvisor';
import type {
  EvaluationV5AlignmentKey,
  EvaluationV5BundleInput,
  EvaluationV5EventProvenance,
  EvaluationV5PairKey,
  EvaluationV5Scenario,
} from '../../shared/amyHoodEvaluationV5';
import { EVALUATION_V5_DOMAINS } from '../../shared/amyHoodEvaluationV5';
import type {
  EvaluationV5ExternalSource,
  EvaluationV5ExternalSourceRegistry,
} from '../../server/evaluationV5/sourceSet';

const domainCode = (domain: DecisionDomain) => ({
  m_and_a: 'MA',
  ai_cloud_capex: 'AI',
  pricing_monetization: 'PM',
  cost_efficiency: 'CE',
  shareholder_return_risk: 'SR',
}[domain]);

export const evaluationV5BundleFixture = (): EvaluationV5BundleInput => {
  const scenarios: EvaluationV5Scenario[] = [];
  const provenance: EvaluationV5EventProvenance[] = [];
  const alignmentKeys: EvaluationV5AlignmentKey[] = [];
  const pairKeys: EvaluationV5PairKey[] = [];
  const externalEvents: EvaluationV5BundleInput['externalEvents'] = [];
  const changeTypes = [
    'guardrail_adjustment',
    'resource_reallocation',
    'pause_or_reverse',
  ] as const;

  for (const domain of EVALUATION_V5_DOMAINS) {
    for (let eventIndex = 1; eventIndex <= 3; eventIndex += 1) {
      const pairId = `AAS-V5-${domainCode(domain)}-${String(eventIndex).padStart(2, '0')}`;
      const eventNumber = externalEvents.length + 1;
      const eventId = `external-v5-event-${eventNumber}`;
      const initialId = `${pairId}-A`;
      const changedId = `${pairId}-B`;
      const pairScenarios: EvaluationV5Scenario[] = [
        {
          id: initialId,
          pairId,
          domain,
          phase: 'initial',
          title: `Anonymous ${domain} decision ${eventIndex}`,
          situation: 'A large enterprise must make a material decision using observable demand, economics, and execution constraints.',
          decisionQuestion: 'What action should the CFO recommend, in what order should evidence be assessed, and what boundaries should govern the decision?',
        },
        {
          id: changedId,
          pairId,
          domain,
          phase: 'changed',
          title: `Anonymous ${domain} decision under changed conditions ${eventIndex}`,
          situation: 'The same enterprise now observes a material change in one decision signal while the remaining financial and strategic facts stay stable.',
          decisionQuestion: 'What action should the CFO now recommend, and which changed signal justifies maintaining, modifying, reallocating, or reversing the prior direction?',
        },
      ];
      scenarios.push(...pairScenarios);
      externalEvents.push({
        id: eventId,
        domain,
        executiveName: `Sealed Executive ${eventNumber}`,
        organization: `Sealed Organization ${eventNumber}`,
        primarySourceId: `ext-v5-source-${eventNumber}`,
        secondarySourceIds: [],
        secondarySourceStatus: 'documented_unavailable',
        secondarySourceRationale: 'A second decision-time source was searched for and recorded as unavailable in this bounded fixture.',
        actualHistoricalAction: `Sealed historical action ${eventNumber}`,
        outcomeEvidenceIds: [],
      });
      provenance.push({
        pairId,
        externalEventId: eventId,
        sourceIds: [`ext-v5-source-${eventNumber}`],
        decisionCutoff: '2024-01-01',
        actualHistoricalAction: `Sealed historical action ${eventNumber}`,
        outcomeEvidenceIds: [],
        initialHistoricalFacts: ['Demand, economics, and execution facts were available at the decision cutoff.'],
        changedCounterfactualFacts: ['One primary decision signal changes after the initial scenario.'],
        reviewer: 'Codex',
        reviewedAt: '2026-07-21T06:00:00.000Z',
      });
      for (const scenario of pairScenarios) {
        alignmentKeys.push({
          scenarioId: scenario.id,
          policyId: `policy-${domain}`,
          phase: scenario.phase,
          expectedAction: `${scenario.phase} bounded action for pair ${eventNumber}`,
          priorityOrder: ['Demand evidence', 'Durable economics', 'Execution capacity'],
          guardrails: ['Preserve an explicit downside and liquidity boundary.'],
          reversalSignals: ['Change course when demand or expected return weakens materially.'],
          acceptableVariants: ['A staged action with the same ordering and boundaries.'],
          identityConflicts: ['An unbounded action based only on strategic narrative.'],
          referenceRationale: 'The mapped Amy policy requires conditional action, ordered evidence, and reversibility.',
        });
      }
      pairKeys.push({
        pairId,
        initialScenarioId: initialId,
        changedScenarioId: changedId,
        expectedResponseType: changeTypes[eventIndex - 1],
        primaryChangedSignal: 'The primary demand or economics signal changes materially.',
        supportingChangedSignal: eventIndex === 2 ? 'Execution capacity also moves toward the binding boundary.' : null,
        expectedActionDelta: `Apply the ${changeTypes[eventIndex - 1]} response without changing unrelated facts.`,
        invariants: ['Organization strategy and available liquidity remain unchanged.'],
        gradingAnchors: ['Connect the changed action to the changed signal.', 'Preserve unchanged facts.'],
      });
    }
  }

  return {
    scenarioFile: {
      dataset: 'amy_hood_paired_behavior_change_scenarios',
      version: '5.0.0',
      stage: 'benchmark',
      frozenAt: '2026-07-21T06:00:00.000Z',
      scenarios,
    },
    reviewFile: {
      scenarioSetVersion: '5.0.0',
      reviews: scenarios.map(({ id }) => ({
        scenarioId: id,
        status: 'approved',
        revisionNote: '',
        provenanceComplete: true,
        alignmentKeyComplete: true,
        pairKeyComplete: true,
        identityMaskingComplete: true,
        reviewedAt: '2026-07-21T06:00:00.000Z',
      })),
    },
    provenance,
    alignmentKeys,
    pairKeys,
    externalEvents,
    externalSourceHash: 'a'.repeat(64),
    manifest: null,
  };
};

export const evaluationV5ExternalSourceFixture = (options: {
  secondaryTranscript?: boolean;
  withOutcome?: boolean;
} = {}) => {
  const primaryText = 'The official decision record preserves the decision-time financial rationale and action.';
  const secondaryText = 'The attributable CFO transcript explains timing, customer impact, and guardrails.';
  const outcomeText = 'The later outcome remains isolated from scenario generation and grading.';
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  const sources: EvaluationV5ExternalSource[] = [{
    id: 'ext-v5-primary-1',
    eventId: 'external-v5-event-1',
    canonicalUrl: 'https://example.org/official-decision',
    sourceType: 'company_announcement',
    sourceQuality: 'official_primary',
    role: 'decision_time_primary',
    publishedAt: '2024-01-10',
    decisionCutoff: '2024-01-10',
    rawPath: 'evaluation/v5/sources/raw/ext-v5-primary-1.json',
    normalizedPath: 'evaluation/v5/sources/normalized/ext-v5-primary-1.txt',
    contentHash: hash(primaryText),
    reviewer: 'Codex',
    reviewedAt: '2026-07-21T06:00:00.000Z',
  }];
  if (options.secondaryTranscript) {
    sources.push({
      id: 'ext-v5-secondary-1',
      eventId: 'external-v5-event-1',
      canonicalUrl: 'https://example.net/attributable-cfo-transcript',
      sourceType: 'earnings_call',
      sourceQuality: 'attributable_secondary_transcript',
      role: 'decision_time_secondary',
      publishedAt: '2024-01-10',
      decisionCutoff: '2024-01-10',
      rawPath: 'evaluation/v5/sources/raw/ext-v5-secondary-1.json',
      normalizedPath: 'evaluation/v5/sources/normalized/ext-v5-secondary-1.txt',
      contentHash: hash(secondaryText),
      reviewer: 'Codex',
      reviewedAt: '2026-07-21T06:00:00.000Z',
    });
  }
  if (options.withOutcome) {
    sources.push({
      id: 'ext-v5-outcome-1',
      eventId: 'external-v5-event-1',
      canonicalUrl: 'https://example.com/later-outcome',
      sourceType: 'company_announcement',
      sourceQuality: 'official_primary',
      role: 'post_outcome',
      publishedAt: '2025-01-10',
      decisionCutoff: '2024-01-10',
      rawPath: 'evaluation/v5/sources/raw/ext-v5-outcome-1.json',
      normalizedPath: 'evaluation/v5/sources/normalized/ext-v5-outcome-1.txt',
      contentHash: hash(outcomeText),
      reviewer: 'Codex',
      reviewedAt: '2026-07-21T06:00:00.000Z',
    });
  }
  const registry: EvaluationV5ExternalSourceRegistry = {
    dataset: 'evaluation_v5_external_cfo_sources',
    version: '5.0.0',
    sources,
    events: [{
      id: 'external-v5-event-1',
      domain: 'm_and_a',
      executiveName: 'Sealed External CFO',
      organization: 'Sealed External Corporation',
      primarySourceId: 'ext-v5-primary-1',
      secondarySourceIds: options.secondaryTranscript ? ['ext-v5-secondary-1'] : [],
      secondarySourceStatus: options.secondaryTranscript ? 'present' : 'documented_unavailable',
      secondarySourceRationale: options.secondaryTranscript
        ? 'An attributable CFO transcript supplements the official event announcement.'
        : 'A second decision-time source was searched for and documented as unavailable after reviewer verification.',
      actualHistoricalAction: 'Approve the bounded transaction under the documented conditions.',
      outcomeEvidenceIds: options.withOutcome ? ['ext-v5-outcome-1'] : [],
    }],
  };
  return {
    registry,
    normalizedContentByPath: {
      'evaluation/v5/sources/normalized/ext-v5-primary-1.txt': primaryText,
      ...(options.secondaryTranscript
        ? { 'evaluation/v5/sources/normalized/ext-v5-secondary-1.txt': secondaryText }
        : {}),
      ...(options.withOutcome
        ? { 'evaluation/v5/sources/normalized/ext-v5-outcome-1.txt': outcomeText }
        : {}),
    },
  };
};
