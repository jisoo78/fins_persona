import type {
  DecisionDomain,
  PilotDecisionEvent,
  PolicyMemory,
} from '../../shared/amyHoodDecisionAdvisor';
import { EVALUATION_V4_DOMAINS } from '../../shared/amyHoodEvaluationV4';
import type { EvaluationV4ExternalSource } from '../../server/evaluationV4/sourceSet';

const eventFixture = (
  domain: DecisionDomain,
  suffix: 'support-1' | 'support-2' | 'contrast-1',
): PilotDecisionEvent => {
  const candidateId = `${domain}-${suffix}`;
  const evidenceId = `${candidateId}-quote`;
  return {
    id: candidateId,
    candidateId: `candidate-${candidateId}`,
    title: `${domain} ${suffix}`,
    domain,
    decisionDate: '2025-01-01',
    decisionQuestion: `What action is justified for ${domain}?`,
    situation: 'A reviewed decision-time situation with observable trade-offs.',
    objectives: ['Protect durable value creation.'],
    conditions: ['Demand and economics are observable.'],
    constraints: ['Capital and execution capacity are finite.'],
    options: [
      {
        id: `${candidateId}-selected`,
        description: 'Act within explicit financial and strategic boundaries.',
        expectedBenefit: 'Preserve durable value creation.',
        principalRisk: 'Execution may underperform.',
        selected: true,
      },
      {
        id: `${candidateId}-rejected`,
        description: 'Maximize near-term optics without boundaries.',
        expectedBenefit: 'Improve a short-term metric.',
        principalRisk: 'Damage long-term value.',
        selected: false,
      },
    ],
    chosenAction: suffix.startsWith('support') ? 'Proceed within guardrails.' : 'Defer or reverse.',
    rejectedBenefit: 'Unbounded short-term upside.',
    observations: ['Amy Hood stated a decision principle at decision time.'],
    inferences: ['The action is conditional rather than absolute.'],
    directAmyEvidenceIds: [evidenceId],
    amyPolicyEvidenceIds: [],
    contextEvidenceIds: [],
    postOutcomeEvidenceIds: [],
    sourceIds: [`${candidateId}-source`],
    documentFamilyIds: [`${candidateId}-family-a`, `${candidateId}-family-b`],
    evidenceSpans: [{
      id: evidenceId,
      sourceId: `${candidateId}-source`,
      eventCandidateId: `candidate-${candidateId}`,
      role: 'direct_amy',
      exactQuote: 'We will make the decision against observable demand, return, and execution constraints.',
      startChar: 0,
      endChar: 91,
      publishedAt: '2025-01-01',
      speaker: 'Amy Hood',
    }],
    status: 'approved',
    gaps: [],
    reviewer: 'Codex',
    reviewedAt: '2026-07-20T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
  };
};

const policyFixture = (domain: DecisionDomain): PolicyMemory => ({
  schemaVersion: 2,
  id: `${domain}-policy`,
  domain,
  applicabilityConditions: ['Observable demand and durable economics support action.'],
  priorityOrder: ['Customer value', 'Durable return', 'Execution capacity'],
  recommendedAction: 'Proceed conditionally and preserve the option to reverse.',
  nonApplicabilityConditions: ['Demand or economics no longer support action.'],
  guardrails: ['Do not cross the approved return and execution-capacity boundary.'],
  exceptions: ['Pause when evidence quality is insufficient.'],
  reversalSignals: ['Demand weakens or expected returns fall below the threshold.'],
  reflectionIds: [`${domain}-reflection`],
  supportingEventIds: [`${domain}-support-1`, `${domain}-support-2`],
  contrastingEventIds: [`${domain}-contrast-1`],
  evidenceIds: [
    `${domain}-support-1-quote`,
    `${domain}-support-2-quote`,
    `${domain}-contrast-1-quote`,
  ],
  directPolicyEvidenceIds: [`${domain}-direct-policy-evidence`],
  confidence: 'medium',
  policyKind: 'deployable_policy',
  status: 'approved',
  review: {
    reviewer: 'Codex',
    reviewedAt: '2026-07-20T00:00:00.000Z',
    decision: 'approved',
    rationale: 'Fixture policy satisfies the reviewed support and contrast contract.',
    validationHash: `${domain}-validation-hash`,
  },
});

export const fiveDomainPolicyFixture = (): {
  policies: PolicyMemory[];
  events: PilotDecisionEvent[];
} => ({
  policies: EVALUATION_V4_DOMAINS.map(policyFixture),
  events: EVALUATION_V4_DOMAINS.flatMap((domain) => [
    eventFixture(domain, 'support-1'),
    eventFixture(domain, 'support-2'),
    eventFixture(domain, 'contrast-1'),
  ]),
});

export const externalSourceFixture = (options: {
  secondaryUnavailable?: boolean;
  withOutcome?: boolean;
  withTracking?: boolean;
} = {}) => {
  const decisionText = 'The CFO approved a bounded investment after testing demand and return thresholds.';
  const secondaryText = 'The filing independently confirms the decision terms available at the cutoff.';
  const outcomeText = 'Later results are retained only for provenance and never scenario generation.';
  const hash = (value: string) => createHash('sha256').update(value).digest('hex');
  const primaryUrl = options.withTracking
    ? 'https://example.com/decision?utm_source=test#section'
    : 'https://example.com/decision';
  const sources: EvaluationV4ExternalSource[] = [{
    id: 'ext-primary-1',
    eventId: 'external-event-1',
    canonicalUrl: primaryUrl,
    sourceType: 'official_interview' as const,
    role: 'decision_time_primary' as const,
    publishedAt: '2024-01-10',
    decisionCutoff: '2024-01-10',
    rawPath: 'evaluation/v4/sources/raw/ext-primary-1.json',
    normalizedPath: 'evaluation/v4/sources/normalized/ext-primary-1.txt',
    contentHash: hash(decisionText),
    reviewer: 'Codex' as const,
    reviewedAt: '2026-07-20T00:00:00.000Z',
  }];
  if (!options.secondaryUnavailable) {
    sources.push({
      id: 'ext-secondary-1',
      eventId: 'external-event-1',
      canonicalUrl: 'https://example.org/filing',
      sourceType: 'filing',
      role: 'decision_time_secondary',
      publishedAt: '2024-01-10',
      decisionCutoff: '2024-01-10',
      rawPath: 'evaluation/v4/sources/raw/ext-secondary-1.json',
      normalizedPath: 'evaluation/v4/sources/normalized/ext-secondary-1.txt',
      contentHash: hash(secondaryText),
      reviewer: 'Codex',
      reviewedAt: '2026-07-20T00:00:00.000Z',
    });
  }
  if (options.withOutcome) {
    sources.push({
      id: 'ext-outcome-1',
      eventId: 'external-event-1',
      canonicalUrl: 'https://example.net/outcome',
      sourceType: 'company_announcement',
      role: 'post_outcome',
      publishedAt: '2025-01-10',
      decisionCutoff: '2024-01-10',
      rawPath: 'evaluation/v4/sources/raw/ext-outcome-1.json',
      normalizedPath: 'evaluation/v4/sources/normalized/ext-outcome-1.txt',
      contentHash: hash(outcomeText),
      reviewer: 'Codex',
      reviewedAt: '2026-07-20T00:00:00.000Z',
    });
  }
  return {
    registry: {
      dataset: 'evaluation_v4_external_cfo_sources' as const,
      version: '4.0.0' as const,
      sources,
      events: [{
        id: 'external-event-1',
        domain: 'm_and_a' as const,
        executiveName: 'External CFO',
        organization: 'Example Corporation',
        primarySourceId: 'ext-primary-1',
        secondarySourceIds: options.secondaryUnavailable ? [] : ['ext-secondary-1'],
        secondarySourceStatus: options.secondaryUnavailable
          ? 'documented_unavailable' as const
          : 'present' as const,
        secondarySourceRationale: options.secondaryUnavailable
          ? 'A second decision-time source was searched for and documented as unavailable after reviewer verification.'
          : 'An independent decision-time filing confirms the primary source.',
        actualHistoricalAction: 'Approve the bounded investment.',
        outcomeEvidenceIds: options.withOutcome ? ['ext-outcome-1'] : [],
      }],
    },
    normalizedContentByPath: {
      'evaluation/v4/sources/normalized/ext-primary-1.txt': decisionText,
      ...(!options.secondaryUnavailable
        ? { 'evaluation/v4/sources/normalized/ext-secondary-1.txt': secondaryText }
        : {}),
      ...(options.withOutcome
        ? { 'evaluation/v4/sources/normalized/ext-outcome-1.txt': outcomeText }
        : {}),
    },
  };
};
import { createHash } from 'node:crypto';
