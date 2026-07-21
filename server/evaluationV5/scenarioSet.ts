import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  EVALUATION_V5_CHANGE_TYPES,
  EVALUATION_V5_DOMAINS,
  type EvaluationV5BundleInput,
  type EvaluationV5FrozenManifest,
} from '../../shared/amyHoodEvaluationV5';
import { canonicalJson } from '../decisionAdvisor/canonicalJson';
import { writeJsonAtomic } from '../decisionAdvisor/jsonStore';
import { evaluationV5Paths } from './paths';
import { loadEvaluationV5ExternalSources } from './sourceSet';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const unique = (values: string[]) => new Set(values).size === values.length;
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const containsSealedIdentifier = (publicText: string, value: string) => {
  const escaped = escapeRegExp(value.trim().toLocaleLowerCase('en-US'));
  return escaped.length >= 4
    && new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'u').test(publicText);
};
const iso = (value: string) => {
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date.toISOString() === value;
};
const filled = (values: string[]) => values.length > 0 && values.every((value) => value.trim());

export type ValidatedEvaluationV5Bundle = EvaluationV5BundleInput & {
  scenarios: EvaluationV5BundleInput['scenarioFile']['scenarios'];
  pairs: EvaluationV5BundleInput['pairKeys'];
  domainCounts: Record<string, number>;
  changeTypeCounts: Record<string, number>;
};

const frozenHashes = (input: EvaluationV5BundleInput) => ({
  scenarios: sha256(canonicalJson(input.scenarioFile)),
  reviews: sha256(canonicalJson(input.reviewFile)),
  provenance: sha256(canonicalJson(input.provenance)),
  alignmentKeys: sha256(canonicalJson(input.alignmentKeys)),
  pairKeys: sha256(canonicalJson(input.pairKeys)),
  externalSources: input.externalSourceHash,
});

const assertOnePerId = (label: string, expectedIds: string[], actualIds: string[]) => {
  if (actualIds.length !== expectedIds.length || !unique(actualIds)
    || actualIds.some((id) => !expectedIds.includes(id))) {
    throw new Error(`Evaluation v5 ${label} must map every expected ID exactly once`);
  }
};

export const validateEvaluationV5ScenarioBundle = (
  input: EvaluationV5BundleInput,
): ValidatedEvaluationV5Bundle => {
  if (input.scenarioFile.dataset !== 'amy_hood_paired_behavior_change_scenarios'
    || input.scenarioFile.version !== '5.0.0' || input.scenarioFile.stage !== 'benchmark'
    || !iso(input.scenarioFile.frozenAt)) {
    throw new Error('Evaluation v5 scenario file identity is invalid');
  }
  const scenarios = input.scenarioFile.scenarios;
  if (scenarios.length !== 30 || !unique(scenarios.map(({ id }) => id))) {
    throw new Error('Evaluation v5 requires exactly thirty unique scenarios');
  }
  if (scenarios.some(({ id, pairId, title, situation, decisionQuestion }) =>
    !id.trim() || !pairId.trim() || !title.trim() || !situation.trim() || !decisionQuestion.trim())) {
    throw new Error('Evaluation v5 scenario identity or text is invalid');
  }
  const scenarioIds = scenarios.map(({ id }) => id);
  const pairIds = [...new Set(scenarios.map(({ pairId }) => pairId))];
  if (pairIds.length !== 15) throw new Error('Evaluation v5 requires exactly fifteen unique pairs');
  const domainCounts = Object.fromEntries(EVALUATION_V5_DOMAINS.map((domain) => [domain, 0]));
  for (const scenario of scenarios) {
    if (!(scenario.domain in domainCounts)) throw new Error(`unknown Evaluation v5 domain: ${scenario.domain}`);
    domainCounts[scenario.domain] += 1;
  }
  if (EVALUATION_V5_DOMAINS.some((domain) => domainCounts[domain] !== 6)) {
    throw new Error('Evaluation v5 requires six scenarios per domain');
  }
  for (const pairId of pairIds) {
    const members = scenarios.filter((scenario) => scenario.pairId === pairId);
    if (members.length !== 2 || new Set(members.map(({ phase }) => phase)).size !== 2
      || !members.some(({ phase }) => phase === 'initial')
      || !members.some(({ phase }) => phase === 'changed')
      || new Set(members.map(({ domain }) => domain)).size !== 1) {
      throw new Error(`Evaluation v5 pair requires one initial and one changed scenario: ${pairId}`);
    }
  }

  assertOnePerId('reviews', scenarioIds, input.reviewFile.reviews.map(({ scenarioId }) => scenarioId));
  if (input.reviewFile.scenarioSetVersion !== '5.0.0'
    || input.reviewFile.reviews.some((review) => review.status !== 'approved'
      || !review.provenanceComplete || !review.alignmentKeyComplete
      || !review.pairKeyComplete || !review.identityMaskingComplete
      || !review.reviewedAt || !iso(review.reviewedAt))) {
    throw new Error('Evaluation v5 scenarios require complete approved reviews');
  }
  assertOnePerId('provenance', pairIds, input.provenance.map(({ pairId }) => pairId));
  assertOnePerId('alignment keys', scenarioIds, input.alignmentKeys.map(({ scenarioId }) => scenarioId));
  assertOnePerId('pair keys', pairIds, input.pairKeys.map(({ pairId }) => pairId));

  const eventById = new Map(input.externalEvents.map((event) => [event.id, event]));
  if (eventById.size !== 15 || input.externalEvents.length !== 15) {
    throw new Error('Evaluation v5 requires fifteen unique external events');
  }
  for (const provenance of input.provenance) {
    const event = eventById.get(provenance.externalEventId);
    const pairDomain = scenarios.find(({ pairId }) => pairId === provenance.pairId)?.domain;
    if (!event || event.domain !== pairDomain
      || provenance.actualHistoricalAction !== event.actualHistoricalAction
      || provenance.sourceIds.length === 0 || !provenance.sourceIds.includes(event.primarySourceId)
      || !filled(provenance.initialHistoricalFacts) || !filled(provenance.changedCounterfactualFacts)
      || provenance.reviewer !== 'Codex' || !iso(provenance.reviewedAt)) {
      throw new Error(`Evaluation v5 provenance is invalid: ${provenance.pairId}`);
    }
  }
  for (const key of input.alignmentKeys) {
    const scenario = scenarios.find(({ id }) => id === key.scenarioId)!;
    if (key.phase !== scenario.phase || !key.policyId.trim() || !key.expectedAction.trim()
      || key.priorityOrder.length !== 3 || !filled(key.priorityOrder)
      || [key.guardrails, key.reversalSignals, key.acceptableVariants, key.identityConflicts]
        .some((values) => !filled(values)) || !key.referenceRationale.trim()) {
      throw new Error(`Evaluation v5 alignment key is invalid: ${key.scenarioId}`);
    }
  }
  const changeTypeCounts = Object.fromEntries(EVALUATION_V5_CHANGE_TYPES.map((type) => [type, 0]));
  for (const key of input.pairKeys) {
    const members = scenarios.filter(({ pairId }) => pairId === key.pairId);
    const initial = members.find(({ phase }) => phase === 'initial');
    const changed = members.find(({ phase }) => phase === 'changed');
    if (!initial || !changed || key.initialScenarioId !== initial.id || key.changedScenarioId !== changed.id
      || !(key.expectedResponseType in changeTypeCounts) || !key.primaryChangedSignal.trim()
      || (key.supportingChangedSignal !== null && !key.supportingChangedSignal.trim())
      || !key.expectedActionDelta.trim() || !filled(key.invariants) || !filled(key.gradingAnchors)) {
      throw new Error(`Evaluation v5 pair key is invalid: ${key.pairId}`);
    }
    changeTypeCounts[key.expectedResponseType] += 1;
  }
  if (EVALUATION_V5_CHANGE_TYPES.some((type) => changeTypeCounts[type] !== 5)) {
    throw new Error('Evaluation v5 requires five pairs per change type');
  }

  const publicText = canonicalJson(input.scenarioFile).toLocaleLowerCase('en-US');
  const forbidden = input.externalEvents.flatMap((event) => [
    event.id, event.executiveName, event.organization, event.actualHistoricalAction,
    event.primarySourceId, ...event.secondarySourceIds, ...event.outcomeEvidenceIds,
  ]).concat(input.alignmentKeys.flatMap((key) => [key.policyId, key.expectedAction]));
  const leaked = forbidden.find((value) => containsSealedIdentifier(publicText, value));
  if (leaked) throw new Error(`Evaluation v5 public scenario leakage: ${leaked}`);
  if (!/^[a-f0-9]{64}$/.test(input.externalSourceHash)) {
    throw new Error('Evaluation v5 external source hash is invalid');
  }
  if (input.manifest) {
    const hashes = frozenHashes(input);
    const sortedScenarioIds = [...scenarioIds].sort();
    const sortedPairIds = [...pairIds].sort();
    const bundleHash = sha256(canonicalJson({
      stage: 'benchmark', scenarioIds: sortedScenarioIds, pairIds: sortedPairIds, hashes,
    }));
    if (canonicalJson(input.manifest.hashes) !== canonicalJson(hashes)
      || canonicalJson(input.manifest.scenarioIds) !== canonicalJson(sortedScenarioIds)
      || canonicalJson(input.manifest.pairIds) !== canonicalJson(sortedPairIds)
      || input.manifest.bundleHash !== bundleHash) {
      throw new Error('Evaluation v5 manifest hash is stale');
    }
  }
  return { ...input, scenarios, pairs: input.pairKeys, domainCounts, changeTypeCounts };
};

export const buildEvaluationV5FrozenManifest = (
  validated: ValidatedEvaluationV5Bundle,
  frozenAt = new Date().toISOString(),
): EvaluationV5FrozenManifest => {
  if (!iso(frozenAt)) throw new Error('Evaluation v5 freeze time is invalid');
  const hashes = frozenHashes(validated);
  const scenarioIds = validated.scenarios.map(({ id }) => id).sort();
  const pairIds = validated.pairs.map(({ pairId }) => pairId).sort();
  return {
    schemaVersion: 1,
    stage: 'benchmark',
    scenarioSetVersion: '5.0.0',
    frozenAt,
    scenarioIds,
    pairIds,
    hashes,
    bundleHash: sha256(canonicalJson({ stage: 'benchmark', scenarioIds, pairIds, hashes })),
  };
};

export const freezeEvaluationV5Bundle = async (root: string, input: EvaluationV5BundleInput) => {
  const validated = validateEvaluationV5ScenarioBundle({ ...input, manifest: null });
  const manifest = buildEvaluationV5FrozenManifest(validated);
  await writeJsonAtomic(evaluationV5Paths(root).manifest, manifest);
  return manifest;
};

const readJson = async <T>(filePath: string): Promise<T> =>
  JSON.parse(await readFile(filePath, 'utf8')) as T;

export const loadEvaluationV5Bundle = async (root: string): Promise<ValidatedEvaluationV5Bundle> => {
  const paths = evaluationV5Paths(root);
  const [scenarioFile, reviewFile, provenanceFile, alignmentFile, pairFile, manifest, external] = await Promise.all([
    readJson<EvaluationV5BundleInput['scenarioFile']>(paths.scenarios),
    readJson<EvaluationV5BundleInput['reviewFile']>(paths.reviews),
    readJson<{ provenance: EvaluationV5BundleInput['provenance'] }>(paths.provenance),
    readJson<{ alignmentKeys: EvaluationV5BundleInput['alignmentKeys'] }>(paths.alignmentKeys),
    readJson<{ pairKeys: EvaluationV5BundleInput['pairKeys'] }>(paths.pairKeys),
    readJson<EvaluationV5FrozenManifest>(paths.manifest),
    loadEvaluationV5ExternalSources(root),
  ]);
  return validateEvaluationV5ScenarioBundle({
    scenarioFile,
    reviewFile,
    provenance: provenanceFile.provenance,
    alignmentKeys: alignmentFile.alignmentKeys,
    pairKeys: pairFile.pairKeys,
    externalEvents: external.events,
    externalSourceHash: sha256(canonicalJson({ sources: external.sources, events: external.events })),
    manifest,
  });
};
