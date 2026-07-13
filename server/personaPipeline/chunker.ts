import { createHash } from 'node:crypto';

import type { RawBlock, RawSource, SourceChunk } from './types';

export type TokenCounter = (text: string) => Promise<number>;

export interface ChunkOptions {
  maxSourceTokens: number;
  overlapMinTokens: number;
  overlapMaxTokens: number;
}

const defaultOptions: ChunkOptions = {
  maxSourceTokens: 10_000,
  overlapMinTokens: 500,
  overlapMaxTokens: 800,
};

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

const renderBlocks = (blocks: RawBlock[]) =>
  blocks
    .map((block) => `${block.speaker ? `[${block.speaker}]\n` : ''}${block.text}`)
    .join('\n\n');

const splitWords = async (
  block: RawBlock,
  text: string,
  countTokens: TokenCounter,
  limit: number,
  offset: number,
) => {
  const parts: RawBlock[] = [];
  let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && (await countTokens(candidate)) > limit) {
      parts.push({ ...block, blockId: `${block.blockId}:part-${offset + parts.length + 1}`, text: current });
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) {
    parts.push({ ...block, blockId: `${block.blockId}:part-${offset + parts.length + 1}`, text: current });
  }
  for (const part of parts) {
    if ((await countTokens(renderBlocks([part]))) > limit) {
      throw new Error(`single token unit exceeds ${limit} tokens: ${part.blockId}`);
    }
  }
  return parts;
};

const splitOversizeBlock = async (
  block: RawBlock,
  countTokens: TokenCounter,
  limit: number,
): Promise<RawBlock[]> => {
  if ((await countTokens(renderBlocks([block]))) <= limit) return [block];

  const sentences = block.text.split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length < 2) return splitWords(block, block.text, countTokens, limit, 0);

  const parts: RawBlock[] = [];
  let current = '';
  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (current && (await countTokens(candidate)) > limit) {
      parts.push(...(await splitWords(block, current, countTokens, limit, parts.length)));
      current = sentence;
    } else {
      current = candidate;
    }
  }
  if (current) parts.push(...(await splitWords(block, current, countTokens, limit, parts.length)));
  return parts;
};

const overlapTail = async (
  blocks: RawBlock[],
  countTokens: TokenCounter,
  options: ChunkOptions,
) => {
  if (options.overlapMaxTokens === 0) return [];
  const tail: RawBlock[] = [];
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const candidate = [blocks[index], ...tail];
    if ((await countTokens(renderBlocks(candidate))) > options.overlapMaxTokens) break;
    tail.unshift(blocks[index]);
    if ((await countTokens(renderBlocks(tail))) >= options.overlapMinTokens) break;
  }
  return tail;
};

export const buildChunks = async (
  source: RawSource,
  countTokens: TokenCounter,
  options: Partial<ChunkOptions> = {},
): Promise<SourceChunk[]> => {
  const config = { ...defaultOptions, ...options };
  if (config.maxSourceTokens <= 0) throw new Error('maxSourceTokens must be positive');
  if (config.overlapMinTokens < 0 || config.overlapMaxTokens < config.overlapMinTokens) {
    throw new Error('invalid overlap token range');
  }

  const usable: RawBlock[] = [];
  for (const block of source.blocks.filter((item) => !item.duplicateOf && item.text.trim())) {
    usable.push(...(await splitOversizeBlock(block, countTokens, config.maxSourceTokens)));
  }

  const groups: RawBlock[][] = [];
  let current: RawBlock[] = [];
  for (const block of usable) {
    const candidate = [...current, block];
    if (current.length && (await countTokens(renderBlocks(candidate))) > config.maxSourceTokens) {
      groups.push(current);
      const overlap = await overlapTail(current, countTokens, config);
      current =
        (await countTokens(renderBlocks([...overlap, block]))) <= config.maxSourceTokens
          ? [...overlap, block]
          : [block];
    } else {
      current = candidate;
    }
  }
  if (current.length) groups.push(current);

  const chunks: SourceChunk[] = [];
  for (const group of groups) {
    const text = renderBlocks(group);
    const tokenCount = await countTokens(text);
    if (tokenCount > config.maxSourceTokens) {
      throw new Error(`chunk exceeds ${config.maxSourceTokens} tokens`);
    }
    const hash = sha256(text);
    const index = chunks.length;
    chunks.push({
      chunkId: `${source.sourceId}:${index}:${hash.slice(0, 12)}`,
      sourceId: source.sourceId,
      index,
      blockIds: group.map((block) => block.blockId),
      text,
      tokenCount,
      sha256: hash,
    });
  }
  return chunks;
};
