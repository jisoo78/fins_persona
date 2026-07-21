import type {
  EvaluationV6ItemAudit,
  EvaluationV6ReplacementRecord,
} from '../../shared/amyHoodEvaluationV6';
import { readJsonFile, writeJsonAtomic } from '../decisionAdvisor/jsonStore';
import { loadEvaluationV5Bundle } from '../evaluationV5/scenarioSet';
import { evaluationV6Paths } from './paths';

const ADMISSIBLE = new Set(['direct_observed', 'contrast_observed', 'bounded_policy_transfer']);
const unique = (values: string[]) => new Set(values).size === values.length;
const filled = (values: string[]) => values.length > 0
  && values.every((value) => typeof value === 'string' && value.trim());

export type EvaluationV6AuditResult = {
  audits: EvaluationV6ItemAudit[];
  replacements: EvaluationV6ReplacementRecord[];
  retainedCount: number;
  replacedCount: number;
  ready: boolean;
};

export const validateEvaluationV6Audit = (
  audits: EvaluationV6ItemAudit[],
  replacements: EvaluationV6ReplacementRecord[],
  v5ScenarioIds: string[],
): EvaluationV6AuditResult => {
  if (v5ScenarioIds.length !== 30 || !unique(v5ScenarioIds)
    || audits.length !== 30 || !unique(audits.map(({ scenarioId }) => scenarioId))
    || audits.some(({ scenarioId }) => !v5ScenarioIds.includes(scenarioId))) {
    throw new Error('Evaluation v6 audit must map all thirty v5 scenarios exactly once');
  }
  for (const audit of audits) {
    if (!audit.policyId.trim() || !audit.decisionAxis.trim() || !audit.externalMotifEventId.trim()
      || !audit.rationale.trim() || audit.reviewer !== 'Codex'
      || Number.isNaN(Date.parse(audit.reviewedAt))) {
      throw new Error(`Evaluation v6 audit is not reviewed: ${audit.scenarioId}`);
    }
    if (audit.decision === 'retain') {
      if (!ADMISSIBLE.has(audit.keyEvidenceClass) || audit.identityDiscriminability !== 'passed') {
        throw new Error(`Evaluation v6 retained item is not admissible: ${audit.scenarioId}`);
      }
      if (!filled(audit.amyDirectEvidenceIds)) {
        throw new Error(`Evaluation v6 retained item lacks direct Amy evidence: ${audit.scenarioId}`);
      }
      if (audit.requiresObservedReversal
        && audit.amyContrastingEventIds.length === 0
        && audit.explicitReversalEvidenceIds.length === 0) {
        throw new Error(`Evaluation v6 reversal lacks observed Amy evidence: ${audit.scenarioId}`);
      }
    }
  }
  const eventAxes = new Map<string, Set<string>>();
  for (const audit of audits.filter(({ decision }) => decision === 'retain')) {
    for (const eventId of new Set([
      ...audit.amySupportingEventIds,
      ...audit.amyContrastingEventIds,
    ])) {
      const axes = eventAxes.get(eventId) ?? new Set<string>();
      if (axes.has(audit.decisionAxis)) {
        throw new Error(`Evaluation v6 repeats one Amy event on the same decision axis: ${eventId}`);
      }
      axes.add(audit.decisionAxis);
      eventAxes.set(eventId, axes);
    }
  }
  const replaced = audits.filter(({ decision }) => decision === 'replace');
  const admitted = replacements.filter(({ status }) => status === 'admitted');
  if (replacements.length !== replaced.length
    || admitted.length !== replaced.length
    || !unique(replacements.map(({ predecessorScenarioId }) => predecessorScenarioId))
    || !unique(replacements.map(({ replacementScenarioId }) => replacementScenarioId))
    || replaced.some(({ scenarioId }) => !admitted.some(
      ({ predecessorScenarioId }) => predecessorScenarioId === scenarioId,
    ))
    || admitted.some(({ amyEvidenceIds, externalMotifEventId, reason, reviewer, reviewedAt }) =>
      !filled(amyEvidenceIds) || !externalMotifEventId.trim() || !reason.trim()
      || reviewer !== 'Codex' || !reviewedAt || Number.isNaN(Date.parse(reviewedAt)))) {
    throw new Error('Evaluation v6 replacement ledger is incomplete');
  }
  return {
    audits,
    replacements,
    retainedCount: 30 - replaced.length,
    replacedCount: replaced.length,
    ready: true,
  };
};

export const assertEvaluationV6AuditReady = (result: EvaluationV6AuditResult) => {
  if (!result.ready || result.retainedCount + result.replacedCount !== 30) {
    throw new Error('Evaluation v6 evidence audit is not ready');
  }
};

const knownRisk = new Map<string, string>([
  ['AAS-V5-MA-01-B', 'Adjustment behavior is inferred and requires same-axis Amy evidence review.'],
  ['AAS-V5-MA-02-A', 'Expected action relies on an unobserved Amy M&A reversal.'],
  ['AAS-V5-MA-02-B', 'Expected changed action relies on an unobserved Amy M&A reversal.'],
  ['AAS-V5-MA-03-B', 'Expected changed action relies on an unobserved Amy M&A reversal.'],
  ['AAS-V5-PM-01-B', 'Adjustment behavior is inferred and requires Amy pricing evidence review.'],
  ['AAS-V5-PM-02-B', 'Adjustment behavior is inferred and requires Amy pricing evidence review.'],
  ['AAS-V5-PM-03-B', 'The postpone action is not demonstrated by reviewed same-axis Amy evidence.'],
]);

export const initializeEvaluationV6Audit = async (
  root: string,
  now = () => new Date().toISOString(),
) => {
  const bundle = await loadEvaluationV5Bundle(root);
  const keyById = new Map(bundle.alignmentKeys.map((key) => [key.scenarioId, key]));
  const provenanceByPair = new Map(bundle.provenance.map((item) => [item.pairId, item]));
  const audits = bundle.scenarios.map((scenario): EvaluationV6ItemAudit => ({
    scenarioId: scenario.id,
    domain: scenario.domain,
    policyId: keyById.get(scenario.id)!.policyId,
    decisionAxis: `${scenario.domain}:${scenario.phase}:${scenario.id}`,
    amyDirectEvidenceIds: [],
    amySupportingEventIds: [],
    amyContrastingEventIds: [],
    explicitReversalEvidenceIds: [],
    externalMotifEventId: provenanceByPair.get(scenario.pairId)!.externalEventId,
    keyEvidenceClass: knownRisk.has(scenario.id) ? 'unsupported_reversal' : 'ambiguous_key',
    requiresObservedReversal: scenario.phase === 'changed',
    identityDiscriminability: 'failed',
    decision: 'replace',
    rationale: knownRisk.get(scenario.id)
      ?? 'Independent Amy identity evidence review has not admitted this v5 key.',
    reviewer: 'Codex',
    reviewedAt: now(),
  }));
  const replacements = bundle.scenarios.map((scenario, index): EvaluationV6ReplacementRecord => ({
    predecessorScenarioId: scenario.id,
    replacementScenarioId: `AAS-V6-RESEARCH-${String(index + 1).padStart(2, '0')}`,
    originalDomain: scenario.domain,
    replacementDomain: scenario.domain,
    reason: 'Amy identity evidence review is required before replacement admission.',
    amyEvidenceIds: [],
    externalMotifEventId: provenanceByPair.get(scenario.pairId)!.externalEventId,
    status: 'research_required',
    reviewer: null,
    reviewedAt: null,
  }));
  const paths = evaluationV6Paths(root);
  await Promise.all([
    writeJsonAtomic(paths.audit, { schemaVersion: 1, audits }),
    writeJsonAtomic(paths.replacementLedger, { schemaVersion: 1, replacements }),
  ]);
  return { audits, replacements };
};

export const checkEvaluationV6Audit = async (root: string) => {
  const paths = evaluationV6Paths(root);
  const [bundle, auditFile, replacementFile] = await Promise.all([
    loadEvaluationV5Bundle(root),
    readJsonFile<{ audits: EvaluationV6ItemAudit[] }>(paths.audit, { audits: [] }),
    readJsonFile<{ replacements: EvaluationV6ReplacementRecord[] }>(
      paths.replacementLedger,
      { replacements: [] },
    ),
  ]);
  const result = validateEvaluationV6Audit(
    auditFile.audits,
    replacementFile.replacements,
    bundle.scenarios.map(({ id }) => id),
  );
  assertEvaluationV6AuditReady(result);
  return result;
};
