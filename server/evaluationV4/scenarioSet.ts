import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import {
  EVALUATION_V4_DOMAINS,
  type EvaluationV4BundleInput,
  type EvaluationV4FrozenManifest,
  type EvaluationV4Stage,
} from '../../shared/amyHoodEvaluationV4';
import { canonicalJson } from '../decisionAdvisor/canonicalJson';
import { writeJsonAtomic } from '../decisionAdvisor/jsonStore';
import { evaluationV4Paths } from './paths';
import { loadEvaluationV4ExternalSources } from './sourceSet';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const unique = (values: string[]) => new Set(values).size === values.length;
const iso = (value: string) => {
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && date.toISOString() === value;
};

export type ValidatedEvaluationV4Bundle = EvaluationV4BundleInput & {
  scenarios: EvaluationV4BundleInput['scenarioFile']['scenarios'];
  domainCounts: Record<string, number>;
};

const frozenHashes = (input: EvaluationV4BundleInput) => ({
  scenarios: sha256(canonicalJson(input.scenarioFile)),
  reviews: sha256(canonicalJson(input.reviewFile)),
  provenance: sha256(canonicalJson(input.provenance)),
  alignmentKeys: sha256(canonicalJson(input.alignmentKeys)),
  externalSources: input.externalSourceHash,
});

const assertOnePerScenario = (label: string, scenarioIds: string[], values: string[]) => {
  if (values.length !== scenarioIds.length || !unique(values)
    || values.some((id) => !scenarioIds.includes(id))) {
    throw new Error(`Evaluation v4 ${label} must map every scenario exactly once`);
  }
};

export const validateEvaluationV4ScenarioBundle = (
  input: EvaluationV4BundleInput,
): ValidatedEvaluationV4Bundle => {
  if (input.stage !== 'calibration' && input.stage !== 'benchmark') {
    throw new Error('Evaluation v4 stage is invalid');
  }
  if (input.scenarioFile.dataset !== 'amy_hood_action_alignment_scenarios'
    || input.scenarioFile.version !== '4.0.0'
    || input.scenarioFile.stage !== input.stage
    || !iso(input.scenarioFile.frozenAt)) {
    throw new Error('Evaluation v4 scenario file identity is invalid');
  }
  const scenarios = input.scenarioFile.scenarios;
  const expectedCount = input.stage === 'calibration' ? 10 : 30;
  if (scenarios.length !== expectedCount) {
    throw new Error(`Evaluation v4 ${input.stage} requires exactly ${expectedCount === 10 ? 'ten' : 'thirty'} scenarios`);
  }
  const scenarioIds = scenarios.map(({ id }) => id);
  if (!unique(scenarioIds) || scenarios.some(({ id, title, situation, decisionQuestion }) =>
    !id.trim() || !title.trim() || !situation.trim() || !decisionQuestion.trim())) {
    throw new Error('Evaluation v4 scenario identity or text is invalid');
  }
  const domainCounts = Object.fromEntries(EVALUATION_V4_DOMAINS.map((domain) => [domain, 0]));
  const variants = new Map<string, Set<string>>();
  for (const scenario of scenarios) {
    if (!(scenario.domain in domainCounts)) throw new Error(`unknown Evaluation v4 domain: ${scenario.domain}`);
    domainCounts[scenario.domain] += 1;
    const domainVariants = variants.get(scenario.domain) ?? new Set<string>();
    domainVariants.add(scenario.variant);
    variants.set(scenario.domain, domainVariants);
  }
  if (input.stage === 'calibration' && EVALUATION_V4_DOMAINS.some((domain) =>
    domainCounts[domain] !== 2
    || variants.get(domain)?.size !== 2
    || !variants.get(domain)?.has('base_transfer')
    || !variants.get(domain)?.has('reversal'))) {
    throw new Error('Evaluation v4 calibration requires base_transfer and reversal per domain');
  }
  assertOnePerScenario('reviews', scenarioIds, input.reviewFile.reviews.map(({ scenarioId }) => scenarioId));
  if (input.reviewFile.scenarioSetVersion !== '4.0.0'
    || input.reviewFile.reviews.some((review) => review.status !== 'approved'
      || !review.provenanceComplete || !review.alignmentKeyComplete
      || !review.reviewedAt || !iso(review.reviewedAt))) {
    throw new Error('Evaluation v4 scenarios require complete approved reviews');
  }
  assertOnePerScenario('provenance', scenarioIds, input.provenance.map(({ scenarioId }) => scenarioId));
  assertOnePerScenario('alignment keys', scenarioIds, input.alignmentKeys.map(({ scenarioId }) => scenarioId));
  const eventById = new Map(input.externalEvents.map((event) => [event.id, event]));
  if (eventById.size !== input.externalEvents.length || input.externalEvents.length !== scenarios.length) {
    throw new Error('Evaluation v4 external events must be unique and complete');
  }
  if (EVALUATION_V4_DOMAINS.some((domain) => new Set(input.externalEvents
    .filter((event) => event.domain === domain)
    .map(({ organization }) => organization)).size < 2)) {
    throw new Error('Evaluation v4 calibration requires two organizations per domain');
  }
  const executiveCounts = new Map<string, number>();
  for (const { executiveName } of input.externalEvents) {
    executiveCounts.set(executiveName, (executiveCounts.get(executiveName) ?? 0) + 1);
  }
  if ([...executiveCounts.values()].some((count) => count > 2)) {
    throw new Error('Evaluation v4 calibration limits each executive to two events');
  }
  for (const provenance of input.provenance) {
    const scenario = scenarios.find(({ id }) => id === provenance.scenarioId)!;
    const event = eventById.get(provenance.externalEventId);
    if (!event || event.domain !== scenario.domain
      || provenance.actualHistoricalAction !== event.actualHistoricalAction
      || provenance.sourceIds.length === 0
      || !provenance.sourceIds.includes(event.primarySourceId)) {
      throw new Error(`Evaluation v4 provenance is invalid: ${provenance.scenarioId}`);
    }
  }
  for (const key of input.alignmentKeys) {
    const scenario = scenarios.find(({ id }) => id === key.scenarioId)!;
    if (key.scenarioVariant !== scenario.variant || !key.policyId.trim()
      || !key.expectedAction.trim() || key.priorityOrder.length !== 3
      || [key.guardrails, key.reversalSignals, key.acceptableVariants, key.identityConflicts]
        .some((values) => !values.length || values.some((value) => !value.trim()))
      || !key.referenceRationale.trim()) {
      throw new Error(`Evaluation v4 alignment key is invalid: ${key.scenarioId}`);
    }
  }
  const publicText = canonicalJson(input.scenarioFile).toLocaleLowerCase('en-US');
  const forbidden = input.externalEvents.flatMap((event) => [
    event.id, event.executiveName, event.organization, event.actualHistoricalAction,
    event.primarySourceId, ...event.secondarySourceIds, ...event.outcomeEvidenceIds,
  ]).concat(input.alignmentKeys.flatMap((key) => [key.policyId, key.expectedAction]));
  const leaked = forbidden.filter((value) => value.trim().length >= 4)
    .find((value) => publicText.includes(value.toLocaleLowerCase('en-US')));
  if (leaked) throw new Error(`Evaluation v4 public scenario leakage: ${leaked}`);
  if (!/^[a-f0-9]{64}$/.test(input.externalSourceHash)) {
    throw new Error('Evaluation v4 external source hash is invalid');
  }
  if (input.manifest) {
    const hashes = frozenHashes(input);
    if (canonicalJson(input.manifest.hashes) !== canonicalJson(hashes)
      || input.manifest.bundleHash !== sha256(canonicalJson({
        stage: input.stage,
        scenarioIds: [...scenarioIds].sort(),
        hashes,
      }))) {
      throw new Error('Evaluation v4 manifest hash is stale');
    }
  }
  return { ...input, scenarios, domainCounts };
};

export const buildEvaluationV4FrozenManifest = (
  validated: ValidatedEvaluationV4Bundle,
  frozenAt = new Date().toISOString(),
): EvaluationV4FrozenManifest => {
  if (!iso(frozenAt)) throw new Error('Evaluation v4 freeze time is invalid');
  const hashes = frozenHashes(validated);
  const scenarioIds = validated.scenarios.map(({ id }) => id).sort();
  return {
    schemaVersion: 1,
    stage: validated.stage,
    scenarioSetVersion: '4.0.0',
    frozenAt,
    scenarioIds,
    hashes,
    bundleHash: sha256(canonicalJson({ stage: validated.stage, scenarioIds, hashes })),
  };
};

export const freezeEvaluationV4Bundle = async (
  root: string,
  input: EvaluationV4BundleInput,
) => {
  const validated = validateEvaluationV4ScenarioBundle({ ...input, manifest: null });
  const manifest = buildEvaluationV4FrozenManifest(validated);
  await writeJsonAtomic(evaluationV4Paths(root).manifest, manifest);
  return manifest;
};

const readJson = async <T>(filePath: string): Promise<T> =>
  JSON.parse(await readFile(filePath, 'utf8')) as T;

export const loadEvaluationV4Bundle = async (
  root: string,
  stage: EvaluationV4Stage,
): Promise<ValidatedEvaluationV4Bundle> => {
  const paths = evaluationV4Paths(root);
  const [scenarioFile, reviewFile, provenanceFile, alignmentFile, manifest, external] = await Promise.all([
    readJson<EvaluationV4BundleInput['scenarioFile']>(paths.scenarios),
    readJson<EvaluationV4BundleInput['reviewFile']>(paths.reviews),
    readJson<{ mappings: EvaluationV4BundleInput['provenance'] }>(paths.externalEventMap),
    readJson<{ alignmentKeys: EvaluationV4BundleInput['alignmentKeys'] }>(paths.alignmentKey),
    readJson<EvaluationV4FrozenManifest>(paths.manifest),
    loadEvaluationV4ExternalSources(root),
  ]);
  return validateEvaluationV4ScenarioBundle({
    stage,
    scenarioFile,
    reviewFile,
    provenance: provenanceFile.mappings,
    alignmentKeys: alignmentFile.alignmentKeys,
    externalEvents: external.events,
    externalSourceHash: sha256(canonicalJson({ sources: external.sources, events: external.events })),
    manifest,
  });
};
