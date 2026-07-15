import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export type EvaluationV3ArtifactReference = {
  artifactClass: 'candidate' | 'event' | 'source' | 'evidence' | 'alias' | 'raw_source';
  id: string;
  sourceId?: string;
  candidateId?: string;
};

export type EvaluationV3HoldoutManifest = {
  dataset: 'amy_hood_evaluation_v3_holdout';
  version: '3.0.0';
  events: Array<{
    eventId: string;
    candidateId: string;
    aliases: string[];
    temporalCutoff: string;
    exposureStatus: 'known_prior_exposure' | 'repository_observed';
    sourceIds: string[];
    evidenceIds: string[];
  }>;
  sharedSourceRules: Array<{
    sourceId: string;
    forbiddenCandidateIds: string[];
    allowedEvidenceIds: string[];
  }>;
};

export type EvaluationV3LeakageScope =
  | 'evaluation_authoring'
  | 'evaluation_grading'
  | 'main_prompt'
  | 'policy_build'
  | 'memory_release'
  | 'runtime_index';

export const loadEvaluationV3Holdout = async (
  root: string,
): Promise<EvaluationV3HoldoutManifest> => {
  const manifest = JSON.parse(await readFile(
    resolve(root, 'evaluation/v3/sealed/holdout-manifest.json'),
    'utf8',
  )) as EvaluationV3HoldoutManifest;
  const candidateIds = manifest.events?.map(({ candidateId }) => candidateId) ?? [];
  const eventIds = manifest.events?.map(({ eventId }) => eventId) ?? [];
  const sourceIds = manifest.events?.flatMap(({ sourceIds: values }) => values) ?? [];
  const evidenceIds = manifest.events?.flatMap(({ evidenceIds: values }) => values) ?? [];
  if (manifest.dataset !== 'amy_hood_evaluation_v3_holdout'
    || manifest.version !== '3.0.0'
    || !Array.isArray(manifest.events)
    || manifest.events.length !== 4
    || new Set(candidateIds).size !== 4
    || new Set(eventIds).size !== 4
    || new Set(sourceIds).size !== sourceIds.length
    || new Set(evidenceIds).size !== evidenceIds.length
    || manifest.events.some((event) =>
      !event.eventId || !event.candidateId
      || !Array.isArray(event.aliases) || event.aliases.length === 0
      || !Array.isArray(event.sourceIds) || event.sourceIds.length === 0
      || !Array.isArray(event.evidenceIds) || event.evidenceIds.length === 0
      || Number.isNaN(Date.parse(event.temporalCutoff))
      || !['known_prior_exposure', 'repository_observed'].includes(event.exposureStatus))
    || !Array.isArray(manifest.sharedSourceRules)
    || manifest.sharedSourceRules.some((rule) =>
      !rule.sourceId
      || !Array.isArray(rule.forbiddenCandidateIds)
      || rule.forbiddenCandidateIds.length === 0
      || !Array.isArray(rule.allowedEvidenceIds)
      || rule.allowedEvidenceIds.length === 0)) {
    throw new Error('invalid evaluation v3 holdout manifest');
  }
  return manifest;
};

const normalizedAlias = (value: string) => value.trim().toLocaleLowerCase('en-US');

export const assertNoEvaluationV3Holdout = (
  scope: EvaluationV3LeakageScope,
  references: EvaluationV3ArtifactReference[],
  manifest: EvaluationV3HoldoutManifest,
) => {
  if (scope === 'evaluation_authoring' || scope === 'evaluation_grading') return;
  const candidates = new Set(manifest.events.map(({ candidateId }) => candidateId));
  const events = new Set(manifest.events.map(({ eventId }) => eventId));
  const sources = new Set(manifest.events.flatMap(({ sourceIds }) => sourceIds));
  const evidence = new Set(manifest.events.flatMap(({ evidenceIds }) => evidenceIds));
  const aliases = new Set(manifest.events.flatMap(({ aliases: values }) => values.map(normalizedAlias)));
  const sharedRules = new Map(manifest.sharedSourceRules.map((rule) => [rule.sourceId, rule]));

  const leaked = [...references]
    .sort((left, right) => `${left.artifactClass}:${left.id}`.localeCompare(`${right.artifactClass}:${right.id}`))
    .find((reference) => {
      if (reference.artifactClass === 'candidate') return candidates.has(reference.id);
      if (reference.artifactClass === 'event') return events.has(reference.id);
      if (reference.artifactClass === 'source') return sources.has(reference.id);
      if (reference.artifactClass === 'alias') return aliases.has(normalizedAlias(reference.id));
      if (reference.artifactClass === 'evidence') {
        if (evidence.has(reference.id)) return true;
        const rule = reference.sourceId ? sharedRules.get(reference.sourceId) : undefined;
        if (!rule) return false;
        return !rule.allowedEvidenceIds.includes(reference.id)
          || Boolean(reference.candidateId && rule.forbiddenCandidateIds.includes(reference.candidateId));
      }
      if (reference.artifactClass === 'raw_source') {
        return sources.has(reference.id) || sharedRules.has(reference.id)
          || Boolean(reference.candidateId && candidates.has(reference.candidateId));
      }
      return false;
    });
  if (leaked) {
    throw new Error(`holdout ${leaked.artifactClass} ${leaked.id} is forbidden in ${scope}`);
  }
};

export const filterEvaluationV3TrainingReferences = (
  references: EvaluationV3ArtifactReference[],
  manifest: EvaluationV3HoldoutManifest,
) => references.filter((reference) => {
  try {
    assertNoEvaluationV3Holdout('runtime_index', [reference], manifest);
    return true;
  } catch {
    return false;
  }
});
