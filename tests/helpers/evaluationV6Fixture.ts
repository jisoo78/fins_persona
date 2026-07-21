import type {
  EvaluationV6BundleInput,
  EvaluationV6CalibrationAnswer,
  EvaluationV6IdentityKey,
  EvaluationV6Scenario,
} from '../../shared/amyHoodEvaluationV6';
import { EVALUATION_V6_DOMAINS } from '../../shared/amyHoodEvaluationV6';

const domainCode = (domain: string) => ({
  m_and_a: 'MA',
  ai_cloud_capex: 'AI',
  pricing_monetization: 'PM',
  cost_efficiency: 'CE',
  shareholder_return_risk: 'SR',
}[domain] ?? 'XX');

const response = (prefix: string) => ({
  action: `${prefix} action`,
  priorities: [`${prefix} demand`, `${prefix} economics`, `${prefix} execution`] as [string, string, string],
  guardrails: [`${prefix} downside boundary`],
  reversalSignals: [`${prefix} reversal threshold`],
  rationale: `${prefix} rationale follows the evidenced decision order.`,
});

export const evaluationV6BundleFixture = (): EvaluationV6BundleInput => {
  const scenarios: EvaluationV6Scenario[] = [];
  const audits: EvaluationV6BundleInput['audits'] = [];
  const identityKeys: EvaluationV6IdentityKey[] = [];
  const pairKeys: EvaluationV6BundleInput['pairKeys'] = [];
  const provenance: EvaluationV6BundleInput['provenance'] = [];
  const calibrationAnswers: EvaluationV6CalibrationAnswer[] = [];
  for (const domain of EVALUATION_V6_DOMAINS) {
    for (let pairIndex = 1; pairIndex <= 3; pairIndex += 1) {
      const pairId = `AAS-V6-${domainCode(domain)}-${String(pairIndex).padStart(2, '0')}`;
      const initialId = `${pairId}-A`;
      const changedId = `${pairId}-B`;
      const members: EvaluationV6Scenario[] = [
        {
          id: initialId,
          predecessorScenarioId: initialId.replace('V6', 'V5'),
          pairId,
          domain,
          phase: 'initial',
          title: `Anonymous ${domain} initial decision ${pairIndex}`,
          situation: 'An anonymous enterprise must choose a bounded action using demand, economics, and execution evidence.',
          decisionQuestion: 'What action, priority order, boundaries, and reversal conditions should the CFO recommend?',
        },
        {
          id: changedId,
          predecessorScenarioId: changedId.replace('V6', 'V5'),
          pairId,
          domain,
          phase: 'changed',
          title: `Anonymous ${domain} changed decision ${pairIndex}`,
          situation: 'The same enterprise observes a material change in the primary decision signal while unrelated facts stay fixed.',
          decisionQuestion: 'How should the action change while preserving Amy-specific priorities and boundaries?',
        },
      ];
      scenarios.push(...members);
      provenance.push({
        pairId,
        externalMotifEventId: `external-motif-${domain}-${pairIndex}`,
        amyEvidenceIds: [`amy-evidence-${domain}-${pairIndex}`],
        decisionCutoff: '2024-01-01',
        reviewer: 'Codex',
        reviewedAt: '2026-07-21T12:00:00.000Z',
      });
      pairKeys.push({
        pairId,
        initialScenarioId: initialId,
        changedScenarioId: changedId,
        expectedResponseType: pairIndex === 1
          ? 'guardrail_adjustment'
          : pairIndex === 2 ? 'resource_reallocation' : 'pause_or_reverse',
        primaryChangedSignal: 'The primary demand or economics signal changes materially.',
        supportingChangedSignal: pairIndex === 2 ? 'Execution capacity also becomes binding.' : null,
        expectedActionDelta: 'Change only the action justified by the changed signal.',
        invariants: ['Liquidity and unrelated strategic facts remain fixed.'],
        gradingAnchors: ['Name the changed signal.', 'Preserve unchanged Amy boundaries.'],
      });
      for (const scenario of members) {
        const predecessor = scenario.predecessorScenarioId!;
        const policyId = `policy-${domain}`;
        const evidenceId = `amy-evidence-${scenario.id}`;
        audits.push({
          scenarioId: predecessor,
          domain,
          policyId,
          decisionAxis: `${domain}:${scenario.phase}:${pairIndex}`,
          amyDirectEvidenceIds: [evidenceId],
          amySupportingEventIds: [`amy-event-${scenario.id}`],
          amyContrastingEventIds: scenario.phase === 'changed' ? [`amy-contrast-${scenario.id}`] : [],
          explicitReversalEvidenceIds: scenario.phase === 'initial' ? [`amy-reversal-${scenario.id}`] : [],
          externalMotifEventId: `external-motif-${domain}-${pairIndex}`,
          keyEvidenceClass: scenario.phase === 'changed' ? 'contrast_observed' : 'direct_observed',
          requiresObservedReversal: scenario.phase === 'changed',
          identityDiscriminability: 'passed',
          decision: 'retain',
          rationale: 'Direct Amy evidence establishes the priority and boundary.',
          reviewer: 'Codex',
          reviewedAt: '2026-07-21T12:00:00.000Z',
        });
        const key: EvaluationV6IdentityKey = {
          scenarioId: scenario.id,
          policyId,
          expectedAction: `Take the bounded ${scenario.phase} action after demand evidence.`,
          amyPriorityOrder: ['Customer demand', 'Durable economics', 'Execution capacity'],
          amyBoundaryConditions: ['Proceed only while demand and economics remain supportable.'],
          amyReversalRule: ['Change direction when demand or economics materially weakens.'],
          amySpecificRationale: 'Customer evidence precedes scaling, with profitability and reversibility retained as explicit constraints.',
          acceptableVariants: ['Stage the same action with identical priority and reversal boundaries.'],
          genericCfoFoil: {
            action: 'Preserve maximum flexibility until every uncertainty is resolved.',
            whyReasonable: 'It limits near-term downside and protects liquidity.',
            whyNotAmy: 'It does not put evidenced customer demand ahead of generic caution.',
          },
          identityConflicts: ['Commit without a demand or economics boundary.'],
          evidenceClass: scenario.phase === 'changed' ? 'contrast_observed' : 'direct_observed',
          amyEvidenceIds: [evidenceId],
          externalMotifEventId: `external-motif-${domain}-${pairIndex}`,
        };
        identityKeys.push(key);
        calibrationAnswers.push(
          {
            calibrationId: `cal-${scenario.id}-aligned`,
            scenarioId: scenario.id,
            answerType: 'amy_aligned',
            expectedAnchor: 'priority_order',
            expectedAnchorTerms: ['customer demand'],
            candidateResponse: response('customer demand first'),
          },
          {
            calibrationId: `cal-${scenario.id}-generic`,
            scenarioId: scenario.id,
            answerType: 'generic_cfo',
            expectedAnchor: 'priority_order',
            expectedAnchorTerms: ['generic caution'],
            candidateResponse: response('generic caution'),
          },
          {
            calibrationId: `cal-${scenario.id}-conflict`,
            scenarioId: scenario.id,
            answerType: 'amy_conflict',
            expectedAnchor: 'identity_conflict',
            expectedAnchorTerms: ['commit without'],
            candidateResponse: response('commit without boundaries'),
          },
        );
      }
    }
  }
  return {
    scenarioFile: {
      dataset: 'amy_hood_identity_action_alignment_scenarios',
      version: '6.0.0',
      stage: 'benchmark',
      frozenAt: '2026-07-21T12:00:00.000Z',
      scenarios,
    },
    reviews: scenarios.map(({ id }) => ({
      scenarioId: id,
      status: 'unreviewed',
      evidenceAuditPassed: true,
      identityKeyComplete: true,
      calibrationPassed: false,
      identityMaskingComplete: true,
      reviewedAt: null,
    })),
    audits,
    replacements: [],
    provenance,
    identityKeys,
    pairKeys,
    calibrationAnswers,
    predecessorV5BundleHash: 'a'.repeat(64),
    manifest: null,
  };
};
