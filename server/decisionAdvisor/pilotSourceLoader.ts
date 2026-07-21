import { createHash } from 'node:crypto';

import type {
  AdvisorSourceRecord,
  EventCandidate,
  EventSourceAssociation,
  PilotEvidenceGap,
  PilotEvidenceSpan,
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

export const reviewedDecisionContextSpan = (
  input: PilotSourceInput,
): PilotEvidenceSpan | null => {
  const { association, candidate, normalizedText, source } = input;
  if (association.reviewStatus !== 'reviewed'
    || association.role !== 'contemporaneous_context'
    || !association.evidenceLocator
    || !association.publishedAt) return null;
  const exactQuote = association.evidenceLocator.exactRelevancePassage;
  const startChar = normalizedText.indexOf(exactQuote);
  if (startChar < 0 || startChar !== normalizedText.lastIndexOf(exactQuote)) {
    throw new Error(`reviewed locator does not uniquely match immutable source: ${candidate.id}`);
  }
  const endChar = startChar + exactQuote.length;
  const id = createHash('sha256')
    .update([source.id, candidate.id, 'decision_context', startChar, endChar].join(':'))
    .digest('hex')
    .slice(0, 16);
  return {
    id: `span-${id}`,
    sourceId: source.id,
    eventCandidateId: candidate.id,
    role: 'decision_context',
    exactQuote,
    startChar,
    endChar,
    publishedAt: association.publishedAt,
    speaker: null,
  };
};

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
