import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { EvaluationQuestion } from '../../shared/amyHoodEvaluation';
import type { SourceChunk } from '../personaPipeline/types';

type InventoryEntry = {
  source_id: string;
  status: string;
};

export type EvaluationCorpus = {
  chunks: SourceChunk[];
  selectedSourceIds: Set<string>;
  holdoutSourceIds: Set<string>;
  snapshotId: string;
};

const tokenize = (text: string) =>
  text.toLowerCase().match(/[a-z0-9가-힣]+/g)?.filter((term) => term.length >= 3) ?? [];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const scoreText = (text: string, terms: string[]) => {
  const normalized = text.toLowerCase();
  let score = 0;
  for (const term of new Set(terms)) {
    const matches = normalized.match(new RegExp(escapeRegExp(term), 'g'));
    score += Math.min(matches?.length ?? 0, 6);
  }
  return score;
};

export const loadSafeEvaluationCorpus = async (
  root: string,
): Promise<EvaluationCorpus> => {
  const inventoryPath = resolve(root, 'data/b-track/amy-hood/source-inventory.json');
  const manifestPath = resolve(root, 'data/b-track/amy-hood/chunks/manifest.json');
  const inventory = JSON.parse(await readFile(inventoryPath, 'utf8')) as InventoryEntry[];
  const manifestText = await readFile(manifestPath, 'utf8');
  const chunks = JSON.parse(manifestText) as SourceChunk[];
  const selectedSourceIds = new Set(
    inventory.filter((item) => item.status === 'selected').map((item) => item.source_id),
  );
  const holdoutSourceIds = new Set(
    inventory.filter((item) => item.status === 'holdout').map((item) => item.source_id),
  );
  const manifestSourceIds = new Set(chunks.map((chunk) => chunk.sourceId));

  for (const sourceId of manifestSourceIds) {
    if (holdoutSourceIds.has(sourceId)) {
      throw new Error(`holdout source found in evaluation manifest: ${sourceId}`);
    }
    if (!selectedSourceIds.has(sourceId)) {
      throw new Error(`non-selected source found in evaluation manifest: ${sourceId}`);
    }
  }
  if (selectedSourceIds.size !== 18) {
    throw new Error(`expected 18 selected evaluation sources, got ${selectedSourceIds.size}`);
  }
  for (const sourceId of selectedSourceIds) {
    if (!manifestSourceIds.has(sourceId)) {
      throw new Error(`selected source missing from evaluation manifest: ${sourceId}`);
    }
  }

  return {
    chunks,
    selectedSourceIds,
    holdoutSourceIds,
    snapshotId: createHash('sha256').update(manifestText).digest('hex'),
  };
};

export const retrievePastMemoryEvidence = (
  corpus: EvaluationCorpus,
  question: EvaluationQuestion,
): SourceChunk[] => {
  if (question.kpi !== 'past_memory_restoration') return [];
  const terms = tokenize(question.retrievalQuery ?? question.prompt);
  const selected = corpus.chunks
    .map((chunk) => ({ chunk, score: scoreText(chunk.text, terms) }))
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.chunk.chunkId.localeCompare(right.chunk.chunkId),
    )
    .slice(0, 1)
    .map(({ chunk }) => chunk);
  if (!selected.length) throw new Error(`no RAG evidence found for ${question.id}`);
  return selected;
};
