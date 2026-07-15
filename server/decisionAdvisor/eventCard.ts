import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  EventCandidate,
  PilotDecisionEvent,
  PilotDecisionOption,
  PilotEvidenceGap,
  PilotEvidenceSpan,
} from '../../shared/amyHoodDecisionAdvisor';
import type { ModelClient } from '../personaPipeline/modelClient';
import { readJsonFile, writeJsonAtomic } from './jsonStore';
import { advisorPaths } from './paths';

type ProposedEventFields = {
  title: string;
  decisionQuestion: string;
  situation: string;
  objectives: string[];
  conditions: string[];
  constraints: string[];
  options: PilotDecisionOption[];
  chosenAction: string;
  rejectedBenefit: string;
  observations: string[];
  inferences: string[];
};

export type PilotEventValidation = {
  blockingGaps: PilotEvidenceGap[];
  advisoryGaps: PilotEvidenceGap[];
};

type ProposalOptions = {
  documentFamilyIds?: string[];
  now?: string;
};

type EventCardWriteDependencies = {
  write: typeof writeJsonAtomic;
};

const promptPath = path.resolve(
  process.cwd(),
  'agent_prompts/prompts/amy-hood-event-card-builder.md',
);

const unique = <T>(values: T[]) => [...new Set(values)];

const jsonText = (value: string) => {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? value).trim();
};

const nonemptyStringArray = (value: unknown): value is string[] =>
  Array.isArray(value)
  && value.length > 0
  && value.every((item) => typeof item === 'string' && item.trim().length > 0);

const parseProposal = (text: string): ProposedEventFields => {
  const parsed = JSON.parse(jsonText(text)) as Partial<ProposedEventFields>;
  const stringFields = [
    'title',
    'decisionQuestion',
    'situation',
    'chosenAction',
    'rejectedBenefit',
  ] as const;
  if (!parsed || typeof parsed !== 'object'
    || stringFields.some((field) =>
      typeof parsed[field] !== 'string' || parsed[field].trim().length === 0)
    || !nonemptyStringArray(parsed.objectives)
    || !nonemptyStringArray(parsed.conditions)
    || !nonemptyStringArray(parsed.constraints)
    || !nonemptyStringArray(parsed.observations)
    || !nonemptyStringArray(parsed.inferences)
    || !Array.isArray(parsed.options)
    || parsed.options.length < 2) {
    throw new Error('event card model response is invalid');
  }
  for (const option of parsed.options) {
    if (!option || typeof option !== 'object'
      || typeof option.id !== 'string' || option.id.trim().length === 0
      || typeof option.description !== 'string' || option.description.trim().length === 0
      || typeof option.expectedBenefit !== 'string' || option.expectedBenefit.trim().length === 0
      || typeof option.principalRisk !== 'string' || option.principalRisk.trim().length === 0
      || typeof option.selected !== 'boolean') {
      throw new Error('event card model response contains an invalid option');
    }
  }
  return parsed as ProposedEventFields;
};

const selectedCount = (options: PilotDecisionOption[]) =>
  options.filter(({ selected }) => selected).length;

const hasValidIsoTimestamp = (value: string) => {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString() === value;
};

export const validatePilotEventCard = (
  card: PilotDecisionEvent,
): PilotEventValidation => {
  if (!card || typeof card !== 'object') throw new Error('event card must be an object');
  if (!/^candidate-[a-z0-9-]+$/.test(card.candidateId)) {
    throw new Error('event card candidate ID is invalid');
  }
  if (!Array.isArray(card.options)
    || card.options.length < 2
    || selectedCount(card.options) !== 1) {
    throw new Error('invalid decision options');
  }
  if (!nonemptyStringArray(card.constraints)) {
    throw new Error('event card constraints are required');
  }
  if (typeof card.chosenAction !== 'string' || card.chosenAction.trim().length === 0) {
    throw new Error('event card chosen action is required');
  }
  if (typeof card.rejectedBenefit !== 'string' || card.rejectedBenefit.trim().length === 0) {
    throw new Error('event card rejected benefit is required');
  }
  if (!Array.isArray(card.evidenceSpans)
    || !Array.isArray(card.directAmyEvidenceIds)
    || !Array.isArray(card.contextEvidenceIds)
    || !Array.isArray(card.postOutcomeEvidenceIds)) {
    throw new Error('event card evidence references are invalid');
  }

  const blockingGaps = card.gaps.filter((gap) => gap !== 'single_document_family');
  const spanById = new Map(card.evidenceSpans.map((span) => [span.id, span]));
  const direct = card.directAmyEvidenceIds
    .map((id) => spanById.get(id))
    .filter((span): span is PilotEvidenceSpan => span?.role === 'direct_amy');
  const context = card.contextEvidenceIds
    .map((id) => spanById.get(id))
    .filter((span): span is PilotEvidenceSpan => span?.role === 'decision_context');

  if (direct.length === 0) blockingGaps.push('missing_direct_amy');
  if (context.length === 0) blockingGaps.push('missing_decision_context');

  const coreIds = new Set([
    ...card.directAmyEvidenceIds,
    ...card.contextEvidenceIds,
  ]);
  const postOutcomeIds = new Set(card.postOutcomeEvidenceIds);
  const hasLeakage = [...coreIds].some((id) => {
    const span = spanById.get(id);
    return postOutcomeIds.has(id)
      || span?.role === 'post_outcome'
      || Boolean(span && span.publishedAt > card.decisionDate);
  });
  if (hasLeakage) blockingGaps.push('post_outcome_leakage');

  const malformedOffsets = card.evidenceSpans.some((span) =>
    !Number.isInteger(span.startChar)
    || !Number.isInteger(span.endChar)
    || span.startChar < 0
    || span.endChar <= span.startChar
    || span.exactQuote.length === 0);
  if (malformedOffsets) blockingGaps.push('invalid_quote_offsets');

  const advisoryGaps: PilotEvidenceGap[] = [];
  if (new Set(card.documentFamilyIds).size < 2) {
    advisoryGaps.push('single_document_family');
  }
  return {
    blockingGaps: unique(blockingGaps),
    advisoryGaps,
  };
};

export const proposePilotEventCard = async (
  candidate: EventCandidate,
  spans: PilotEvidenceSpan[],
  model: ModelClient,
  options: ProposalOptions = {},
): Promise<PilotDecisionEvent> => {
  const system = await readFile(promptPath, 'utf8');
  const result = await model.invoke({
    system,
    user: JSON.stringify({
      candidate: {
        id: candidate.id,
        title: candidate.workingTitle,
        domain: candidate.domain,
        decisionDate: candidate.decisionWindowEnd,
      },
      evidenceSpans: spans,
    }),
  });
  const proposal = parseProposal(result.text);
  const directAmyEvidenceIds = spans
    .filter(({ role }) => role === 'direct_amy')
    .map(({ id }) => id);
  const contextEvidenceIds = spans
    .filter(({ role }) => role === 'decision_context')
    .map(({ id }) => id);
  const postOutcomeEvidenceIds = spans
    .filter(({ role }) => role === 'post_outcome')
    .map(({ id }) => id);
  const now = options.now ?? new Date().toISOString();
  const card: PilotDecisionEvent = {
    id: `event-${candidate.id.slice('candidate-'.length)}`,
    candidateId: candidate.id,
    title: proposal.title,
    domain: candidate.domain,
    decisionDate: candidate.decisionWindowEnd,
    decisionQuestion: proposal.decisionQuestion,
    situation: proposal.situation,
    objectives: proposal.objectives,
    conditions: proposal.conditions,
    constraints: proposal.constraints,
    options: proposal.options,
    chosenAction: proposal.chosenAction,
    rejectedBenefit: proposal.rejectedBenefit,
    observations: proposal.observations,
    inferences: proposal.inferences,
    directAmyEvidenceIds,
    contextEvidenceIds,
    postOutcomeEvidenceIds,
    sourceIds: unique(spans.map(({ sourceId }) => sourceId)),
    documentFamilyIds: unique(
      options.documentFamilyIds ?? spans.map(({ sourceId }) => sourceId),
    ),
    evidenceSpans: spans,
    status: 'incomplete',
    gaps: [],
    reviewer: null,
    reviewedAt: null,
    updatedAt: now,
  };
  const validation = validatePilotEventCard(card);
  card.gaps = unique([...validation.blockingGaps, ...validation.advisoryGaps]);
  return card;
};

export const eventCardPath = (root: string, candidateId: string) => {
  if (!/^candidate-[a-z0-9-]+$/.test(candidateId)) {
    throw new Error('event card candidate ID is invalid');
  }
  return path.resolve(advisorPaths(root).eventsPilot, `${candidateId}.json`);
};

export const savePilotEventCard = async (
  root: string,
  card: PilotDecisionEvent,
  dependencies: EventCardWriteDependencies = { write: writeJsonAtomic },
) => {
  validatePilotEventCard(card);
  await dependencies.write(eventCardPath(root, card.candidateId), card);
};

export const approvePilotEventCard = async (
  root: string,
  candidateId: string,
  review: { reviewer: string; reviewedAt: string },
  dependencies: EventCardWriteDependencies = { write: writeJsonAtomic },
) => {
  if (!review.reviewer.trim()) throw new Error('event approval requires a reviewer');
  if (!hasValidIsoTimestamp(review.reviewedAt)) {
    throw new Error('event approval timestamp is invalid');
  }
  const card = await readJsonFile<PilotDecisionEvent | null>(
    eventCardPath(root, candidateId),
    null,
  );
  if (!card) throw new Error(`unknown pilot event card: ${candidateId}`);
  const validation = validatePilotEventCard(card);
  if (validation.blockingGaps.length > 0) {
    throw new Error(`cannot approve event card: ${validation.blockingGaps.join(', ')}`);
  }
  const approved: PilotDecisionEvent = {
    ...card,
    status: 'approved',
    gaps: validation.advisoryGaps,
    reviewer: review.reviewer,
    reviewedAt: review.reviewedAt,
    updatedAt: review.reviewedAt,
  };
  await dependencies.write(eventCardPath(root, candidateId), approved);
  return approved;
};
