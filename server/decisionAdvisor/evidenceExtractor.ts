import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  EventCandidate,
  PilotEvidenceGap,
  PilotEvidenceRole,
  PilotEvidenceSpan,
} from '../../shared/amyHoodDecisionAdvisor';
import type { ModelClient } from '../personaPipeline/modelClient';
import { writeJsonAtomic } from './jsonStore';
import { advisorPaths } from './paths';
import type { PilotSourceInput } from './pilotSourceLoader';

export type EvidenceChunk = {
  index: number;
  startChar: number;
  endChar: number;
  text: string;
};

export type PilotEvidenceExtractionInput = PilotSourceInput & {
  root: string;
};

export type PilotEvidenceExtractionResult = {
  spans: PilotEvidenceSpan[];
  gaps: PilotEvidenceGap[];
};

type ProposedSpan = {
  role: PilotEvidenceRole;
  exactQuote: string;
  startChar: number;
  endChar: number;
  speaker: 'Amy Hood' | null;
};

type ExtractorResponse = { spans: ProposedSpan[] };

const promptPath = path.resolve(
  process.cwd(),
  'agent_prompts/prompts/amy-hood-evidence-span-extractor.md',
);

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

const unique = <T>(values: T[]) => [...new Set(values)];

export const buildEvidenceChunks = (
  text: string,
  options: { maxChars: number; overlapChars: number } = {
    maxChars: 12_000,
    overlapChars: 500,
  },
): EvidenceChunk[] => {
  if (options.maxChars <= 0
    || options.overlapChars < 0
    || options.overlapChars >= options.maxChars) {
    throw new Error('invalid evidence chunk options');
  }
  if (!text) return [];
  const chunks: EvidenceChunk[] = [];
  let startChar = 0;
  while (startChar < text.length) {
    const endChar = Math.min(startChar + options.maxChars, text.length);
    chunks.push({
      index: chunks.length,
      startChar,
      endChar,
      text: text.slice(startChar, endChar),
    });
    if (endChar === text.length) break;
    startChar = endChar - options.overlapChars;
  }
  return chunks;
};

const expectedRole = (input: PilotEvidenceExtractionInput): PilotEvidenceRole => {
  if (input.association.role === 'direct_amy') return 'direct_amy';
  if (input.association.role === 'post_outcome'
    || input.association.temporalRelation === 'post_outcome') return 'post_outcome';
  return 'decision_context';
};

const isIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
};

export const validatePilotEvidenceSpan = (
  span: PilotEvidenceSpan,
  input: Pick<PilotEvidenceExtractionInput, 'source' | 'candidate' | 'normalizedText'>,
) => {
  if (span.sourceId !== input.source.id
    || span.eventCandidateId !== input.candidate.id) {
    throw new Error('evidence span identity does not match its source and candidate');
  }
  if (!Number.isInteger(span.startChar)
    || !Number.isInteger(span.endChar)
    || span.startChar < 0
    || span.endChar <= span.startChar
    || span.endChar > input.normalizedText.length
    || input.normalizedText.slice(span.startChar, span.endChar) !== span.exactQuote) {
    throw new Error('quote does not match immutable source');
  }
  if (!isIsoDate(span.publishedAt)) throw new Error('evidence span date is invalid');
  if (span.role === 'direct_amy' && span.speaker !== 'Amy Hood') {
    throw new Error('direct Amy evidence requires Amy Hood speaker identity');
  }
  return span;
};

const jsonText = (value: string) => {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced?.[1] ?? value).trim();
};

const parseResponse = (value: string): ExtractorResponse => {
  const parsed = JSON.parse(jsonText(value)) as unknown;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as ExtractorResponse).spans)) {
    throw new Error('extractor response requires a spans array');
  }
  const spans = (parsed as ExtractorResponse).spans;
  for (const span of spans) {
    if (!span || typeof span !== 'object'
      || !['direct_amy', 'decision_context', 'post_outcome'].includes(span.role)
      || typeof span.exactQuote !== 'string'
      || span.exactQuote.length === 0
      || !Number.isInteger(span.startChar)
      || !Number.isInteger(span.endChar)
      || !(span.speaker === null || span.speaker === 'Amy Hood')) {
      throw new Error('extractor response contains an invalid span');
    }
  }
  return { spans };
};

const saveRun = async (
  input: PilotEvidenceExtractionInput,
  chunk: EvidenceChunk,
  attempt: number,
  response: string,
  elapsedMs: number,
  success: boolean,
) => {
  const requestHash = sha256(JSON.stringify({
    candidateId: input.candidate.id,
    sourceId: input.source.id,
    sourceSha256: input.source.sha256,
    chunkStart: chunk.startChar,
    chunkEnd: chunk.endChar,
  }));
  const file = path.resolve(
    advisorPaths(input.root).pilotExtractionRuns,
    `${input.candidate.id}-${input.source.id}-${chunk.index}-${attempt}-${requestHash.slice(0, 12)}.json`,
  );
  await writeJsonAtomic(file, {
    candidateId: input.candidate.id,
    sourceId: input.source.id,
    chunkIndex: chunk.index,
    attempt,
    requestHash,
    response,
    elapsedMs,
    success,
  });
};

const buildUserPrompt = (
  candidate: EventCandidate,
  input: PilotEvidenceExtractionInput,
  chunk: EvidenceChunk,
) => [
  `EVENT: ${candidate.workingTitle}`,
  `DECISION DATE: ${candidate.decisionWindowEnd}`,
  `SOURCE ID: ${input.source.id}`,
  `EXPECTED ROLE: ${expectedRole(input)}`,
  'SOURCE CHUNK:',
  chunk.text,
].join('\n');

export const extractPilotEvidence = async (
  input: PilotEvidenceExtractionInput,
  model: ModelClient,
): Promise<PilotEvidenceExtractionResult> => {
  const system = await readFile(promptPath, 'utf8');
  const spans: PilotEvidenceSpan[] = [];
  const gaps: PilotEvidenceGap[] = [];
  const role = expectedRole(input);
  const publishedAt = input.association.publishedAt ?? input.source.publishedAt;
  if (!publishedAt) return { spans: [], gaps: ['missing_immutable_artifact'] };

  for (const chunk of buildEvidenceChunks(input.normalizedText)) {
    let parsed: ExtractorResponse | null = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const result = await model.invoke({
        system,
        user: buildUserPrompt(input.candidate, input, chunk),
      });
      try {
        parsed = parseResponse(result.text);
        await saveRun(input, chunk, attempt, result.text, result.elapsedMs, true);
        break;
      } catch {
        await saveRun(input, chunk, attempt, result.text, result.elapsedMs, false);
      }
    }
    if (!parsed) {
      gaps.push('model_response_invalid');
      continue;
    }
    for (const proposed of parsed.spans) {
      if (proposed.role !== role) {
        gaps.push('model_response_invalid');
        continue;
      }
      const startChar = chunk.startChar + proposed.startChar;
      const endChar = chunk.startChar + proposed.endChar;
      const span: PilotEvidenceSpan = {
        id: `span-${sha256(`${input.source.id}:${startChar}:${endChar}:${role}`).slice(0, 16)}`,
        sourceId: input.source.id,
        eventCandidateId: input.candidate.id,
        role,
        exactQuote: proposed.exactQuote,
        startChar,
        endChar,
        publishedAt,
        speaker: proposed.speaker,
      };
      try {
        spans.push(validatePilotEvidenceSpan(span, input));
      } catch {
        gaps.push('invalid_quote_offsets');
      }
    }
  }

  const deduplicated = [...new Map(spans.map((span) => [
    `${span.sourceId}:${span.startChar}:${span.endChar}:${span.role}`,
    span,
  ])).values()];
  return { spans: deduplicated, gaps: unique(gaps) };
};
