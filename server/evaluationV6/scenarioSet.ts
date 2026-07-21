import type {
  EvaluationV6BundleInput,
  EvaluationV6FrozenManifest,
  EvaluationV6Scenario,
} from '../../shared/amyHoodEvaluationV6';
import { EVALUATION_V6_DOMAINS, EVALUATION_V6_EVIDENCE_CLASSES } from '../../shared/amyHoodEvaluationV6';
import { canonicalJson, sha256 } from '../decisionAdvisor/canonicalJson';
import { readJsonFile, writeJsonAtomic } from '../decisionAdvisor/jsonStore';
import { loadEvaluationV5Bundle } from '../evaluationV5/scenarioSet';
import { assertEvaluationV6AuditReady, validateEvaluationV6Audit } from './audit';
import { evaluationV6Paths } from './paths';

const unique = (values: string[]) => new Set(values).size === values.length;
const filled = (values: string[]) => values.length > 0
  && values.every((value) => typeof value === 'string' && value.trim());
const iso = (value: string) => {
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date.toISOString() === value;
};
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const containsIdentifier = (text: string, value: string) => {
  const normalized = value.trim().toLocaleLowerCase('en-US');
  if (normalized.length < 4) return false;
  return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(normalized)}(?:$|[^a-z0-9])`, 'u').test(text);
};

export type ValidatedEvaluationV6Bundle = EvaluationV6BundleInput & {
  scenarios: EvaluationV6Scenario[];
  auditResult: ReturnType<typeof validateEvaluationV6Audit>;
};

const validateMappings = (input: EvaluationV6BundleInput, scenarios: EvaluationV6Scenario[]) => {
  const scenarioIds = scenarios.map(({ id }) => id);
  const pairIds = [...new Set(scenarios.map(({ pairId }) => pairId))];
  const onePerScenario = (label: string, ids: string[]) => {
    if (ids.length !== 30 || !unique(ids) || ids.some((id) => !scenarioIds.includes(id))) {
      throw new Error(`Evaluation v6 ${label} must map every scenario exactly once`);
    }
  };
  onePerScenario('reviews', input.reviews.map(({ scenarioId }) => scenarioId));
  onePerScenario('identity keys', input.identityKeys.map(({ scenarioId }) => scenarioId));
  if (input.pairKeys.length !== 15 || !unique(input.pairKeys.map(({ pairId }) => pairId))
    || input.pairKeys.some(({ pairId }) => !pairIds.includes(pairId))) {
    throw new Error('Evaluation v6 pair keys must map every pair exactly once');
  }
};

export const validateEvaluationV6CandidateBundle = (
  input: EvaluationV6BundleInput,
): ValidatedEvaluationV6Bundle => {
  if (input.scenarioFile.dataset !== 'amy_hood_identity_action_alignment_scenarios'
    || input.scenarioFile.version !== '6.0.0' || input.scenarioFile.stage !== 'benchmark'
    || !iso(input.scenarioFile.frozenAt)) {
    throw new Error('Evaluation v6 scenario file identity is invalid');
  }
  const scenarios = input.scenarioFile.scenarios;
  if (scenarios.length !== 30 || !unique(scenarios.map(({ id }) => id))) {
    throw new Error('Evaluation v6 requires exactly thirty unique scenarios');
  }
  if (scenarios.some(({ id, predecessorScenarioId, pairId, title, situation, decisionQuestion }) =>
    !id.trim() || !predecessorScenarioId?.trim() || !pairId.trim() || !title.trim()
    || !situation.trim() || !decisionQuestion.trim())) {
    throw new Error('Evaluation v6 scenario identity or text is invalid');
  }
  const pairIds = [...new Set(scenarios.map(({ pairId }) => pairId))];
  if (pairIds.length !== 15) throw new Error('Evaluation v6 requires exactly fifteen pairs');
  for (const pairId of pairIds) {
    const members = scenarios.filter((scenario) => scenario.pairId === pairId);
    if (members.length !== 2 || !members.some(({ phase }) => phase === 'initial')
      || !members.some(({ phase }) => phase === 'changed')
      || new Set(members.map(({ domain }) => domain)).size !== 1) {
      throw new Error(`Evaluation v6 pair is invalid: ${pairId}`);
    }
  }
  validateMappings(input, scenarios);
  const predecessorIds = scenarios.map(({ predecessorScenarioId }) => predecessorScenarioId!);
  if (!unique(predecessorIds)) throw new Error('Evaluation v6 predecessor mapping is not unique');
  const auditResult = validateEvaluationV6Audit(input.audits, input.replacements, predecessorIds);
  assertEvaluationV6AuditReady(auditResult);
  const replacementByPredecessor = new Map(input.replacements.map((item) => [item.predecessorScenarioId, item]));
  for (const scenario of scenarios) {
    const audit = input.audits.find(({ scenarioId }) => scenarioId === scenario.predecessorScenarioId)!;
    const replacement = replacementByPredecessor.get(scenario.predecessorScenarioId!);
    if (audit.decision === 'replace' && replacement?.replacementScenarioId !== scenario.id) {
      throw new Error(`Evaluation v6 replacement trace is invalid: ${scenario.id}`);
    }
    if (audit.decision === 'retain' && replacement) {
      throw new Error(`Evaluation v6 retained item has a replacement: ${scenario.id}`);
    }
  }
  for (const review of input.reviews) {
    if (!review.evidenceAuditPassed || !review.identityKeyComplete || !review.identityMaskingComplete
      || (review.reviewedAt !== null && !iso(review.reviewedAt))) {
      throw new Error(`Evaluation v6 review is invalid: ${review.scenarioId}`);
    }
  }
  const admissible = new Set(['direct_observed', 'contrast_observed', 'bounded_policy_transfer']);
  const genericPhrases = /^(balance growth and profitability|protect customers|maintain flexibility)[.!]?$/i;
  for (const key of input.identityKeys) {
    if (!admissible.has(key.evidenceClass) || !key.policyId.trim() || !key.expectedAction.trim()
      || key.amyPriorityOrder.length < 3 || !filled(key.amyPriorityOrder)
      || !filled(key.amyBoundaryConditions) || !filled(key.amyReversalRule)
      || !key.amySpecificRationale.trim() || genericPhrases.test(key.amySpecificRationale.trim())
      || !filled(key.acceptableVariants) || !key.genericCfoFoil.action.trim()
      || !key.genericCfoFoil.whyReasonable.trim() || !key.genericCfoFoil.whyNotAmy.trim()
      || !filled(key.identityConflicts) || !filled(key.amyEvidenceIds)
      || !key.externalMotifEventId.trim()) {
      throw new Error(`Evaluation v6 identity key is invalid: ${key.scenarioId}`);
    }
  }
  for (const key of input.pairKeys) {
    const members = scenarios.filter(({ pairId }) => pairId === key.pairId);
    const initial = members.find(({ phase }) => phase === 'initial');
    const changed = members.find(({ phase }) => phase === 'changed');
    if (!initial || !changed || key.initialScenarioId !== initial.id || key.changedScenarioId !== changed.id
      || !key.primaryChangedSignal.trim() || !key.expectedActionDelta.trim()
      || !filled(key.invariants) || !filled(key.gradingAnchors)
      || (key.supportingChangedSignal !== null && !key.supportingChangedSignal.trim())) {
      throw new Error(`Evaluation v6 pair key is invalid: ${key.pairId}`);
    }
  }
  if (input.provenance.length !== 15 || !unique(input.provenance.map(({ pairId }) => pairId))) {
    throw new Error('Evaluation v6 provenance must map every pair exactly once');
  }
  for (const item of input.provenance) {
    if (!pairIds.includes(item.pairId) || !item.externalMotifEventId.trim()
      || !filled(item.amyEvidenceIds) || !item.decisionCutoff.trim()
      || item.reviewer !== 'Codex' || !iso(item.reviewedAt)) {
      throw new Error(`Evaluation v6 provenance is invalid: ${item.pairId}`);
    }
  }
  if (input.calibrationAnswers.length !== 90
    || !unique(input.calibrationAnswers.map(({ calibrationId }) => calibrationId))) {
    throw new Error('Evaluation v6 requires ninety unique calibration answers');
  }
  for (const scenario of scenarios) {
    const answers = input.calibrationAnswers.filter(({ scenarioId }) => scenarioId === scenario.id);
    if (answers.length !== 3
      || new Set(answers.map(({ answerType }) => answerType)).size !== 3
      || answers.some(({ expectedAnchorTerms }) => !filled(expectedAnchorTerms))) {
      throw new Error(`Evaluation v6 calibration triplet is invalid: ${scenario.id}`);
    }
  }
  if (!/^[a-f0-9]{64}$/.test(input.predecessorV5BundleHash)) {
    throw new Error('Evaluation v6 predecessor bundle hash is invalid');
  }
  const publicText = canonicalJson(input.scenarioFile).toLocaleLowerCase('en-US');
  const forbidden = input.identityKeys.flatMap((key) => [
    key.policyId,
    ...key.amyEvidenceIds,
    key.externalMotifEventId,
  ]);
  const leaked = forbidden.find((value) => containsIdentifier(publicText, value));
  if (leaked) throw new Error(`Evaluation v6 public scenario leakage: ${leaked}`);
  return { ...input, scenarios, auditResult };
};

export const buildEvaluationV6CandidateHash = (bundle: ValidatedEvaluationV6Bundle) =>
  sha256(canonicalJson({
    predecessorV5BundleHash: bundle.predecessorV5BundleHash,
    audit: bundle.audits,
    replacements: bundle.replacements,
    scenarios: bundle.scenarioFile,
    reviews: bundle.reviews,
    provenance: bundle.provenance,
    identityKeys: bundle.identityKeys,
    pairKeys: bundle.pairKeys,
    calibrationAnswers: bundle.calibrationAnswers,
  }));

const buildHashes = (bundle: ValidatedEvaluationV6Bundle) => ({
  audit: sha256(canonicalJson(bundle.audits)),
  replacementLedger: sha256(canonicalJson(bundle.replacements)),
  scenarios: sha256(canonicalJson(bundle.scenarioFile)),
  reviews: sha256(canonicalJson(bundle.reviews)),
  provenance: sha256(canonicalJson(bundle.provenance)),
  identityKeys: sha256(canonicalJson(bundle.identityKeys)),
  pairKeys: sha256(canonicalJson(bundle.pairKeys)),
  calibrationAnswers: sha256(canonicalJson(bundle.calibrationAnswers)),
});

export const buildEvaluationV6FrozenManifest = (
  bundle: ValidatedEvaluationV6Bundle,
  calibration: { candidateBundleHash: string; judgeCalibrationBatchHash: string },
  frozenAt = new Date().toISOString(),
): EvaluationV6FrozenManifest => {
  if (!iso(frozenAt)) throw new Error('Evaluation v6 freeze time is invalid');
  const hashes = buildHashes(bundle);
  const scenarioIds = bundle.scenarios.map(({ id }) => id).sort();
  const pairIds = bundle.pairKeys.map(({ pairId }) => pairId).sort();
  const identity = {
    stage: 'benchmark' as const,
    predecessorV5BundleHash: bundle.predecessorV5BundleHash,
    candidateBundleHash: calibration.candidateBundleHash,
    judgeCalibrationBatchHash: calibration.judgeCalibrationBatchHash,
    scenarioIds,
    pairIds,
    hashes,
  };
  return {
    schemaVersion: 1,
    scenarioSetVersion: '6.0.0',
    frozenAt,
    ...identity,
    bundleHash: sha256(canonicalJson(identity)),
  };
};

export const freezeEvaluationV6Bundle = async (
  root: string,
  input: EvaluationV6BundleInput,
  calibration: { passed: boolean; candidateBundleHash: string; batchHash: string },
  frozenAt = new Date().toISOString(),
) => {
  const validated = validateEvaluationV6CandidateBundle({ ...input, manifest: null });
  const candidateBundleHash = buildEvaluationV6CandidateHash(validated);
  if (!calibration.passed || calibration.candidateBundleHash !== candidateBundleHash
    || !/^[a-f0-9]{64}$/.test(calibration.batchHash)) {
    throw new Error('Evaluation v6 freeze requires matching passed Judge calibration');
  }
  const reviews = validated.reviews.map((review) => ({
    ...review,
    status: 'approved' as const,
    calibrationPassed: true,
    reviewedAt: review.reviewedAt ?? frozenAt,
  }));
  const finalBundle = validateEvaluationV6CandidateBundle({ ...input, reviews, manifest: null });
  const manifest = buildEvaluationV6FrozenManifest(finalBundle, {
    candidateBundleHash,
    judgeCalibrationBatchHash: calibration.batchHash,
  }, frozenAt);
  const paths = evaluationV6Paths(root);
  await writeJsonAtomic(paths.reviews, { scenarioSetVersion: '6.0.0', reviews });
  await writeJsonAtomic(paths.manifest, manifest);
  return manifest;
};

export const validateEvaluationV6FrozenBundle = (input: EvaluationV6BundleInput) => {
  const bundle = validateEvaluationV6CandidateBundle(input);
  const manifest = input.manifest;
  if (!manifest || input.reviews.some((review) => review.status !== 'approved'
    || !review.calibrationPassed || !review.reviewedAt)) {
    throw new Error('Evaluation v6 frozen reviews are incomplete');
  }
  const hashes = buildHashes(bundle);
  const identity = {
    stage: 'benchmark' as const,
    predecessorV5BundleHash: bundle.predecessorV5BundleHash,
    candidateBundleHash: manifest.candidateBundleHash,
    judgeCalibrationBatchHash: manifest.judgeCalibrationBatchHash,
    scenarioIds: bundle.scenarios.map(({ id }) => id).sort(),
    pairIds: bundle.pairKeys.map(({ pairId }) => pairId).sort(),
    hashes,
  };
  if (canonicalJson(manifest.hashes) !== canonicalJson(hashes)
    || canonicalJson(manifest.scenarioIds) !== canonicalJson(identity.scenarioIds)
    || canonicalJson(manifest.pairIds) !== canonicalJson(identity.pairIds)
    || manifest.bundleHash !== sha256(canonicalJson(identity))) {
    throw new Error('Evaluation v6 manifest hash is stale');
  }
  return bundle;
};

export const loadEvaluationV6CandidateInput = async (root: string): Promise<EvaluationV6BundleInput> => {
  const paths = evaluationV6Paths(root);
  const [scenarioFile, reviewFile, auditFile, replacementFile, provenanceFile,
    keyFile, pairFile, calibrationFile, manifest] = await Promise.all([
    readJsonFile<EvaluationV6BundleInput['scenarioFile']>(paths.scenarios, null as never),
    readJsonFile<{ reviews: EvaluationV6BundleInput['reviews'] }>(paths.reviews, { reviews: [] }),
    readJsonFile<{ audits: EvaluationV6BundleInput['audits'] }>(paths.audit, { audits: [] }),
    readJsonFile<{ replacements: EvaluationV6BundleInput['replacements'] }>(
      paths.replacementLedger,
      { replacements: [] },
    ),
    readJsonFile<{ provenance: EvaluationV6BundleInput['provenance'] }>(paths.provenance, { provenance: [] }),
    readJsonFile<{ identityKeys: EvaluationV6BundleInput['identityKeys'] }>(paths.identityKeys, { identityKeys: [] }),
    readJsonFile<{ pairKeys: EvaluationV6BundleInput['pairKeys'] }>(paths.pairKeys, { pairKeys: [] }),
    readJsonFile<{ calibrationAnswers: EvaluationV6BundleInput['calibrationAnswers'] }>(
      paths.calibrationAnswers,
      { calibrationAnswers: [] },
    ),
    readJsonFile<EvaluationV6FrozenManifest | null>(paths.manifest, null),
  ]);
  if (!scenarioFile) throw new Error('Evaluation v6 scenarios are missing');
  const predecessorV5BundleHash = manifest?.predecessorV5BundleHash
    ?? (await loadEvaluationV5Bundle(root)).manifest?.bundleHash
    ?? '';
  return {
    scenarioFile,
    reviews: reviewFile.reviews,
    audits: auditFile.audits,
    replacements: replacementFile.replacements,
    provenance: provenanceFile.provenance,
    identityKeys: keyFile.identityKeys,
    pairKeys: pairFile.pairKeys,
    calibrationAnswers: calibrationFile.calibrationAnswers,
    predecessorV5BundleHash,
    manifest,
  };
};

export const loadEvaluationV6CandidateBundle = async (root: string) =>
  validateEvaluationV6CandidateBundle(await loadEvaluationV6CandidateInput(root));

export const loadEvaluationV6Bundle = async (root: string) =>
  validateEvaluationV6FrozenBundle(await loadEvaluationV6CandidateInput(root));

export const checkEvaluationV6CandidateBundle = async (root: string) => {
  const bundle = await loadEvaluationV6CandidateBundle(root);
  return {
    scenarioCount: bundle.scenarios.length,
    pairCount: bundle.pairKeys.length,
    candidateBundleHash: buildEvaluationV6CandidateHash(bundle),
  };
};

export const checkEvaluationV6Bundle = async (root: string) => {
  const bundle = await loadEvaluationV6Bundle(root);
  return {
    version: '6.0.0',
    scenarioCount: bundle.scenarios.length,
    pairCount: bundle.pairKeys.length,
    bundleHash: bundle.manifest!.bundleHash,
    predecessorV5BundleHash: bundle.manifest!.predecessorV5BundleHash,
    evidenceClasses: Object.fromEntries(EVALUATION_V6_EVIDENCE_CLASSES.map((evidenceClass) => [
      evidenceClass,
      bundle.identityKeys.filter((key) => key.evidenceClass === evidenceClass).length,
    ])),
    domains: Object.fromEntries(EVALUATION_V6_DOMAINS.map((domain) => [
      domain,
      bundle.scenarios.filter((scenario) => scenario.domain === domain).length,
    ])),
  };
};
