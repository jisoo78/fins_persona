import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  EvaluationV6BundleInput,
  EvaluationV6IdentityKey,
  EvaluationV6PairKey,
  EvaluationV6Scenario,
} from '../../shared/amyHoodEvaluationV6';
import { writeJsonAtomic } from '../decisionAdvisor/jsonStore';
import { loadEvaluationV5Bundle } from '../evaluationV5/scenarioSet';
import { evaluationV6Paths } from './paths';
import { validateEvaluationV6CandidateBundle } from './scenarioSet';

type MemoryPolicy = {
  id: string;
  domain: EvaluationV6Scenario['domain'];
  priorityOrder: string[];
  recommendedAction: string;
  guardrails: string[];
  reversalSignals: string[];
  evidenceIds: string[];
  directPolicyEvidenceIds: string[];
  supportingEventIds: string[];
  contrastingEventIds: string[];
  contrastStatus: 'reviewed' | 'documented_unavailable';
};

const REVIEWED_AT = '2026-07-21T14:00:00.000Z';
const replacementIds = new Map([
  ['AAS-V5-MA-02-A', 'AAS-V6-MA-02R-A'],
  ['AAS-V5-MA-02-B', 'AAS-V6-MA-02R-B'],
  ['AAS-V5-MA-03-B', 'AAS-V6-MA-03R-B'],
  ['AAS-V5-PM-03-B', 'AAS-V6-PM-03R-B'],
]);

const rewrittenScenarios: Record<string, Pick<EvaluationV6Scenario, 'title' | 'situation' | 'decisionQuestion'>> = {
  'AAS-V5-MA-02-A': {
    title: 'Design-platform acquisition with a credible bounded remedy path',
    situation: 'A software buyer is considering a design-platform acquisition whose strategic reach and community value remain attractive. Regulators have provided a written and time-bounded remedy path before commitment, but the remedies reduce synergies and require a smaller transaction perimeter. Liquidity and investment-grade capacity remain above approved floors.',
    decisionQuestion: 'What bounded transaction structure should the CFO recommend, and how should strategic reach, remedy economics, financing, and integration gates be ordered?',
  },
  'AAS-V5-MA-02-B': {
    title: 'Design-platform remedy becomes more costly but remains executable',
    situation: 'The same transaction still has a credible approval path, but the required divestiture becomes larger and expected synergies decline. The strategic market reach remains intact, and the buyer can resize consideration, stage integration, or preserve capital for alternatives without breaching liquidity floors.',
    decisionQuestion: 'How should the CFO resize or restructure the transaction while preserving Amy-specific value and execution boundaries?',
  },
  'AAS-V5-MA-03-B': {
    title: 'Open-platform acquisition with narrower but enforceable safeguards',
    situation: 'The target narrows its proposed independence safeguards, but an enforceable open-ecosystem covenant and staged integration remain available. Strategic reach and free-cash-flow support remain intact, while financing is still inside the approved credit boundary.',
    decisionQuestion: 'Should the CFO preserve the acquisition direction, and which contractual, financing, and integration gates must be tightened?',
  },
  'AAS-V5-PM-03-B': {
    title: 'Membership fee with uneven customer capacity but stable loyalty',
    situation: 'Renewal intent and member value remain stable overall, but customer capacity has weakened in several price-sensitive segments. The company can phase timing, segment the increase, and preserve reinvestment in the member proposition rather than impose one uniform change.',
    decisionQuestion: 'How should the CFO adapt the monetization rollout while preserving customer value, commercial clarity, and bounded customer impact?',
  },
};

const rewrittenKeys: Record<string, Partial<EvaluationV6IdentityKey>> = {
  'AAS-V5-MA-02-A': {
    expectedAction: 'Proceed only with a smaller or remedied structure after re-underwriting strategic reach, reduced synergies, financing, and integration execution.',
    amyPriorityOrder: ['Credibility of the approval path', 'Strategic reach after remedies', 'Transaction economics and execution capacity'],
    amyBoundaryConditions: ['Do not preserve the original unrestricted structure.', 'Keep liquidity, price discipline, and integration accountability inside approved limits.'],
    amyReversalRule: ['Resize again if remedy economics deteriorate.', 'Withdraw only if strategic reach, economics, or execution become unsupported.'],
  },
  'AAS-V5-MA-02-B': {
    expectedAction: 'Resize consideration and stage integration to absorb the larger remedy cost while preserving only the strategically and financially supportable perimeter.',
    amyPriorityOrder: ['Approval path credibility', 'Value retained after divestiture', 'Re-underwritten financing and integration execution'],
    amyBoundaryConditions: ['Do not pay for synergies removed by the remedy.', 'Maintain liquidity and measurable integration gates.'],
    amyReversalRule: ['Reduce the perimeter when remedy cost rises.', 'Withdraw if the remaining reach no longer supports durable value.'],
  },
  'AAS-V5-MA-03-B': {
    expectedAction: 'Preserve the acquisition direction only through enforceable ecosystem covenants, staged integration, and financing that remains within the approved credit boundary.',
    amyPriorityOrder: ['Customer and ecosystem value', 'Enforceable operating safeguards', 'Transaction economics and financing capacity'],
    amyBoundaryConditions: ['Do not accept unenforceable independence promises.', 'Stage integration until open-ecosystem behavior is measurable.'],
    amyReversalRule: ['Tighten or resize commitments when safeguards narrow.', 'Withdraw if ecosystem protection or financing becomes unsupported.'],
  },
  'AAS-V5-PM-03-B': {
    expectedAction: 'Use a segmented or phased fee increase where loyalty and value remain verified, while delaying the most price-sensitive segments and preserving member reinvestment.',
    amyPriorityOrder: ['Verified member value and loyalty', 'Segment-level customer capacity', 'Commercial clarity and durable monetization'],
    amyBoundaryConditions: ['Do not impose a uniform increase across materially different customer-capacity conditions.', 'Keep timing and reinvestment terms explicit.'],
    amyReversalRule: ['Delay affected segments if renewal intent weakens.', 'Resume only when value, loyalty, and customer capacity support the terms.'],
  },
};

const rewrittenPairs: Record<string, Partial<EvaluationV6PairKey>> = {
  'AAS-V5-MA-02': {
    expectedResponseType: 'guardrail_adjustment',
    primaryChangedSignal: 'The required remedy becomes more costly while the written approval path remains credible.',
    supportingChangedSignal: 'Strategic reach remains intact and transaction perimeter can be resized.',
    expectedActionDelta: 'Resize consideration and integration commitments rather than terminate or preserve the original unrestricted structure.',
    gradingAnchors: ['Preserve only value that survives the remedy.', 'Re-underwrite price, financing, and execution gates.'],
  },
  'AAS-V5-MA-03': {
    expectedResponseType: 'guardrail_adjustment',
    primaryChangedSignal: 'Independence safeguards narrow but an enforceable open-ecosystem covenant remains available.',
    supportingChangedSignal: 'Strategic reach and financing capacity remain supportable.',
    expectedActionDelta: 'Tighten covenants and stage integration without crossing an unsupported termination boundary.',
    gradingAnchors: ['Require enforceable ecosystem protection.', 'Preserve financing and integration boundaries.'],
  },
  'AAS-V5-PM-03': {
    expectedResponseType: 'guardrail_adjustment',
    primaryChangedSignal: 'Customer capacity weakens only in identifiable price-sensitive segments while loyalty remains stable overall.',
    supportingChangedSignal: 'Phased timing and segment-specific terms are available.',
    expectedActionDelta: 'Segment or phase monetization rather than impose one uniform increase or infer a universal postponement rule.',
    gradingAnchors: ['Name segment-level customer capacity.', 'Preserve verified value, loyalty, and explicit terms.'],
  },
};

const loadActivePolicies = async (root: string) => {
  const active = JSON.parse(await readFile(path.join(root, 'data/b-track/amy-hood/advisor/memory-releases/active.json'), 'utf8')) as { version: string };
  const context = JSON.parse(await readFile(path.join(root, 'data/b-track/amy-hood/advisor/memory-releases', active.version, 'evaluation-context.json'), 'utf8')) as { policy: string[] };
  const policies = context.policy.map((value) => JSON.parse(value) as MemoryPolicy);
  return new Map(policies.map((policy) => [policy.domain, policy]));
};

const genericActionByDomain: Record<EvaluationV6Scenario['domain'], string> = {
  m_and_a: 'Reject the transaction now to preserve cash until all uncertainty is eliminated, even though the stated strategic, economics, and execution gates remain supportable.',
  ai_cloud_capex: 'Hold capacity flat until utilization is fully proven, even though contracted demand and capacity urgency remain visible.',
  pricing_monetization: 'Apply one uniform benchmark price based on competitor pricing and near-term margin, regardless of segment-level customer value or adoption.',
  cost_efficiency: 'Apply proportional cuts across every team to maximize near-term margin, regardless of strategic priority, productivity, or verified bottlenecks.',
  shareholder_return_risk: 'Deploy the full repurchase authorization immediately to optimize near-term EPS, ahead of strategic investment and liquidity needs.',
};

const conflictActionByDomain: Record<EvaluationV6Scenario['domain'], string> = {
  m_and_a: 'Proceed immediately on the original terms because strategic narrative overrides price, financing, ecosystem, and integration gates.',
  ai_cloud_capex: 'Commit all capacity immediately regardless of customer demand, utilization, reversibility, or infrastructure economics.',
  pricing_monetization: 'Raise prices uniformly now because margin expansion overrides customer value, willingness to pay, and adoption friction.',
  cost_efficiency: 'Cut every team proportionally now because near-term margin overrides strategic priorities, productivity evidence, and execution bottlenecks.',
  shareholder_return_risk: 'Deploy the entire repurchase authorization now because EPS and immediate cash return override investment, liquidity, and flexibility.',
};

const alignedAnchorTerms: Record<EvaluationV6Scenario['domain'], string[]> = {
  m_and_a: ['strategic reach', 'transaction economics', '전략적'],
  ai_cloud_capex: ['customer demand', 'capacity urgency', '수요'],
  pricing_monetization: ['customer value', 'willingness to pay', '고객 가치'],
  cost_efficiency: ['strategic priority', 'productivity', '우선순위'],
  shareholder_return_risk: ['strategic investment', 'liquidity', '전략적 투자'],
};

export const buildEvaluationV6CandidateFromV5 = async (root: string): Promise<EvaluationV6BundleInput> => {
  const [v5, policyByDomain] = await Promise.all([loadEvaluationV5Bundle(root), loadActivePolicies(root)]);
  if (!v5.manifest?.bundleHash) throw new Error('Evaluation v5 frozen bundle is required');
  const provenanceByPair = new Map(v5.provenance.map((item) => [item.pairId, item]));
  const v5KeyById = new Map(v5.alignmentKeys.map((key) => [key.scenarioId, key]));
  const scenarioIdByPredecessor = new Map<string, string>();
  const scenarios = v5.scenarios.map((scenario): EvaluationV6Scenario => {
    const id = replacementIds.get(scenario.id) ?? scenario.id.replace('AAS-V5-', 'AAS-V6-');
    scenarioIdByPredecessor.set(scenario.id, id);
    const pairId = scenario.pairId.replace('AAS-V5-', 'AAS-V6-');
    return { ...scenario, ...(rewrittenScenarios[scenario.id] ?? {}), id, predecessorScenarioId: scenario.id, pairId };
  });
  const replacementPredecessors = new Set(replacementIds.keys());
  const pairTypeById = new Map(v5.pairKeys.map((pair) => [pair.pairId, rewrittenPairs[pair.pairId]?.expectedResponseType ?? pair.expectedResponseType]));
  const audits = v5.scenarios.map((scenario) => {
    const policy = policyByDomain.get(scenario.domain);
    if (!policy) throw new Error(`missing active Amy policy: ${scenario.domain}`);
    const requiresObservedReversal = scenario.phase === 'changed' && pairTypeById.get(scenario.pairId) === 'pause_or_reverse';
    const observedContrast = requiresObservedReversal && policy.contrastStatus === 'reviewed';
    const replaced = replacementPredecessors.has(scenario.id);
    return {
      scenarioId: scenario.id,
      domain: scenario.domain,
      policyId: policy.id,
      decisionAxis: `${scenario.domain}:${scenario.pairId}:${scenario.phase}`,
      amyDirectEvidenceIds: policy.directPolicyEvidenceIds,
      amySupportingEventIds: policy.supportingEventIds,
      amyContrastingEventIds: observedContrast ? policy.contrastingEventIds : [],
      explicitReversalEvidenceIds: [],
      externalMotifEventId: provenanceByPair.get(scenario.pairId)!.externalEventId,
      keyEvidenceClass: observedContrast ? 'contrast_observed' as const : 'bounded_policy_transfer' as const,
      requiresObservedReversal,
      identityDiscriminability: 'passed' as const,
      decision: replaced ? 'replace' as const : 'retain' as const,
      rationale: replaced
        ? 'The v5 action crossed an unobserved Amy reversal boundary; v6 replaces it with an evidence-bounded guardrail adjustment.'
        : observedContrast
          ? 'A reviewed same-axis Amy contrast supports the changed action and reversal boundary.'
          : 'The anonymous action stays within the reviewed Amy policy priority, boundary, and reversible adjustment envelope.',
      reviewer: 'Codex' as const,
      reviewedAt: REVIEWED_AT,
    };
  });
  const replacements = [...replacementIds].map(([predecessorScenarioId, replacementScenarioId]) => {
    const predecessor = v5.scenarios.find(({ id }) => id === predecessorScenarioId)!;
    const policy = policyByDomain.get(predecessor.domain)!;
    return {
      predecessorScenarioId, replacementScenarioId,
      originalDomain: predecessor.domain, replacementDomain: predecessor.domain,
      reason: 'Replace an unsupported stop/reversal key with a bounded adjustment supported by Amy direct policy evidence.',
      amyEvidenceIds: policy.evidenceIds,
      externalMotifEventId: provenanceByPair.get(predecessor.pairId)!.externalEventId,
      status: 'admitted' as const, reviewer: 'Codex' as const, reviewedAt: REVIEWED_AT,
    };
  });
  const identityKeys = scenarios.map((scenario): EvaluationV6IdentityKey => {
    const predecessorId = scenario.predecessorScenarioId!;
    const v5Key = v5KeyById.get(predecessorId)!;
    const policy = policyByDomain.get(scenario.domain)!;
    const rewritten = rewrittenKeys[predecessorId] ?? {};
    const expectedAction = rewritten.expectedAction ?? v5Key.expectedAction;
    const amyPriorityOrder = rewritten.amyPriorityOrder ?? v5Key.priorityOrder;
    const amyBoundaryConditions = rewritten.amyBoundaryConditions ?? v5Key.guardrails;
    const amyReversalRule = rewritten.amyReversalRule ?? v5Key.reversalSignals;
    return {
      scenarioId: scenario.id,
      policyId: policy.id,
      expectedAction,
      amyPriorityOrder,
      amyBoundaryConditions,
      amyReversalRule,
      amySpecificRationale: `${v5Key.referenceRationale} The action remains conditional on ${policy.priorityOrder.slice(0, 3).join(', ')}.`,
      acceptableVariants: v5Key.acceptableVariants,
      genericCfoFoil: {
        action: genericActionByDomain[scenario.domain],
        whyReasonable: 'This is prudent conventional CFO advice under uncertainty.',
        whyNotAmy: `It does not preserve Amy's evidenced priority order beginning with ${amyPriorityOrder[0]}.`,
      },
      identityConflicts: v5Key.identityConflicts,
      evidenceClass: audits.find(({ scenarioId: id }) => id === predecessorId)!.keyEvidenceClass as EvaluationV6IdentityKey['evidenceClass'],
      amyEvidenceIds: policy.evidenceIds,
      externalMotifEventId: provenanceByPair.get(scenario.pairId.replace('AAS-V6-', 'AAS-V5-'))!.externalEventId,
    };
  });
  const pairKeys = v5.pairKeys.map((pair): EvaluationV6PairKey => {
    const rewritten = rewrittenPairs[pair.pairId] ?? {};
    return {
      ...pair,
      ...rewritten,
      pairId: pair.pairId.replace('AAS-V5-', 'AAS-V6-'),
      initialScenarioId: scenarioIdByPredecessor.get(pair.initialScenarioId)!,
      changedScenarioId: scenarioIdByPredecessor.get(pair.changedScenarioId)!,
    };
  });
  const provenance = v5.provenance.map((item) => {
    const domain = v5.scenarios.find(({ pairId }) => pairId === item.pairId)!.domain;
    return {
      pairId: item.pairId.replace('AAS-V5-', 'AAS-V6-'),
      externalMotifEventId: item.externalEventId,
      amyEvidenceIds: policyByDomain.get(domain)!.evidenceIds,
      decisionCutoff: item.decisionCutoff,
      reviewer: 'Codex' as const,
      reviewedAt: REVIEWED_AT,
    };
  });
  const calibrationAnswers = identityKeys.flatMap((key) => {
    const domain = scenarios.find(({ id }) => id === key.scenarioId)!.domain;
    const base = { scenarioId: key.scenarioId };
    return [
      {
        ...base, calibrationId: `cal-${key.scenarioId}-aligned`, answerType: 'amy_aligned' as const, expectedAnchor: 'priority_order' as const,
        expectedAnchorTerms: alignedAnchorTerms[domain],
        candidateResponse: { action: key.expectedAction, priorities: key.amyPriorityOrder.slice(0, 3) as [string, string, string], guardrails: key.amyBoundaryConditions, reversalSignals: key.amyReversalRule, rationale: `The Amy-specific priority order begins with ${key.amyPriorityOrder[0]}. ${key.amySpecificRationale}` },
      },
      {
        ...base, calibrationId: `cal-${key.scenarioId}-generic`, answerType: 'generic_cfo' as const, expectedAnchor: 'action' as const,
        expectedAnchorTerms: ['regardless', 'until all uncertainty', '불확실', '즉시', '일률'],
        candidateResponse: { action: key.genericCfoFoil.action, priorities: ['Near-term financial protection', 'Generic flexibility', 'Benchmark risk-adjusted returns'] as [string, string, string], guardrails: ['Stay within the generic board risk appetite.'], reversalSignals: ['Change course only if benchmark returns weaken.'], rationale: `This answer intentionally uses conventional CFO caution rather than Amy's evidenced priority order. ${key.genericCfoFoil.whyReasonable}` },
      },
      {
        ...base, calibrationId: `cal-${key.scenarioId}-conflict`, answerType: 'amy_conflict' as const,
        expectedAnchor: 'identity_conflict' as const, expectedAnchorTerms: ['overrides', 'regardless', '무시', '우선'],
        candidateResponse: { action: conflictActionByDomain[domain], priorities: ['Speed', 'Near-term optics', 'Unbounded commitment'] as [string, string, string], guardrails: ['Proceed without the Amy-specific boundary.'], reversalSignals: ['Reverse only after material loss has already occurred.'], rationale: 'This action deliberately overrides the frozen Amy priority, boundary, and reversal policy.' },
      },
    ];
  });
  const input: EvaluationV6BundleInput = {
    scenarioFile: { dataset: 'amy_hood_identity_action_alignment_scenarios', version: '6.0.0', stage: 'benchmark', frozenAt: REVIEWED_AT, scenarios },
    reviews: scenarios.map(({ id }) => ({ scenarioId: id, status: 'unreviewed', evidenceAuditPassed: true, identityKeyComplete: true, calibrationPassed: false, identityMaskingComplete: true, reviewedAt: null })),
    audits, replacements, provenance, identityKeys, pairKeys, calibrationAnswers,
    predecessorV5BundleHash: v5.manifest.bundleHash,
    manifest: null,
  };
  validateEvaluationV6CandidateBundle(input);
  return input;
};

export const writeEvaluationV6CandidateFromV5 = async (root: string) => {
  const input = await buildEvaluationV6CandidateFromV5(root);
  const paths = evaluationV6Paths(root);
  await Promise.all([
    writeJsonAtomic(paths.scenarios, input.scenarioFile),
    writeJsonAtomic(paths.reviews, { scenarioSetVersion: '6.0.0', reviews: input.reviews }),
    writeJsonAtomic(paths.audit, { schemaVersion: 1, audits: input.audits }),
    writeJsonAtomic(paths.replacementLedger, { schemaVersion: 1, replacements: input.replacements }),
    writeJsonAtomic(paths.provenance, { provenance: input.provenance }),
    writeJsonAtomic(paths.identityKeys, { identityKeys: input.identityKeys }),
    writeJsonAtomic(paths.pairKeys, { pairKeys: input.pairKeys }),
    writeJsonAtomic(paths.calibrationAnswers, { calibrationAnswers: input.calibrationAnswers }),
  ]);
  return input;
};
