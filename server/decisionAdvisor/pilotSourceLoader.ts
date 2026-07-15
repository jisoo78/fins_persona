import type {
  AdvisorSourceRecord,
  EventCandidate,
  EventSourceAssociation,
  PilotEvidenceGap,
} from '../../shared/amyHoodDecisionAdvisor';
import { readAdvisorArtifactSecure } from './artifactStore';
import { loadRegistry } from './sourceRegistry';

export type PilotSourceInput = {
  source: AdvisorSourceRecord;
  candidate: EventCandidate;
  association: EventSourceAssociation;
  normalizedText: string;
};

export type PilotSourceLoadResult = {
  core: PilotSourceInput[];
  postOutcome: PilotSourceInput[];
  gaps: PilotEvidenceGap[];
};

const unique = <T>(values: T[]) => [...new Set(values)];

export const loadPilotSourceInputs = async (
  root: string,
  candidate: EventCandidate,
): Promise<PilotSourceLoadResult> => {
  const registry = loadRegistry(root);
  const core: PilotSourceInput[] = [];
  const postOutcome: PilotSourceInput[] = [];
  const gaps: PilotEvidenceGap[] = [];

  for (const association of candidate.sourceAssociations.filter(
    ({ reviewStatus }) => reviewStatus === 'reviewed',
  )) {
    const source = registry.sources.find(({ canonicalUrl, finalUrl }) =>
      canonicalUrl === association.canonicalUrl || finalUrl === association.canonicalUrl);
    if (!source?.normalizedPath || !source.sha256 || source.collectionStatus === 'failed') {
      gaps.push('missing_immutable_artifact');
      continue;
    }
    const normalizedText = (
      await readAdvisorArtifactSecure(root, source.normalizedPath)
    ).toString('utf8');
    const input = { source, candidate, association, normalizedText };
    if (association.role === 'post_outcome'
      || association.temporalRelation === 'post_outcome') {
      postOutcome.push(input);
    } else {
      core.push(input);
    }
  }

  return { core, postOutcome, gaps: unique(gaps) };
};
