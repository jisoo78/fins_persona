import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

import { load } from 'cheerio';

import type { RawBlock, RawSource } from './types';

export const CORPUS_NORMALIZATION_VERSION = 2;

export interface InventoryEntry {
  source_id: string;
  title: string;
  source_type: string;
  status: string;
  local_path: string | null;
  url: string | null;
  fiscal_year?: number;
}

export interface CollectOptions {
  root: string;
  entries: InventoryEntry[];
  fetchImpl?: typeof fetch;
  now?: () => string;
}

const normalizeText = (value: string) => value.replace(/\ufeff/g, '').replace(/\s+/g, ' ').trim();
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

const rawSourcePath = (root: string, sourceId: string) =>
  resolve(root, 'data/b-track/amy-hood/raw-sources', `${sourceId}.json`);

const readRawSource = async (path: string) =>
  JSON.parse(await readFile(path, 'utf8')) as RawSource;

const atomicWriteJson = async (path: string, value: unknown) => {
  await mkdir(resolve(path, '..'), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
};

export const assertSelectedInventory = (entries: InventoryEntry[]) => {
  const selected = entries.filter((entry) => entry.status === 'selected');
  if (
    selected.some(
      (entry) =>
        entry.source_type === 'earnings_call' &&
        entry.fiscal_year !== undefined &&
        entry.fiscal_year >= 2017 &&
        entry.fiscal_year <= 2019,
    )
  ) {
    throw new Error('holdout earnings source cannot enter persona corpus');
  }
  if (selected.length !== 18) {
    throw new Error(`expected 18 selected sources, got ${selected.length}`);
  }
  return selected;
};

const parseCsv = (input: string) => {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  if (quoted) throw new Error('unterminated quoted CSV field');
  return rows;
};

const blocksFromCsv = (text: string): RawBlock[] => {
  const rows = parseCsv(text.replace(/^\ufeff/, ''));
  const header = rows.shift() ?? [];
  const textIndex = header.indexOf('text');
  if (textIndex < 0) throw new Error('CSV is missing text column');
  return rows
    .map((row, index) => ({
      blockId: `record-${index + 1}`,
      kind: 'record' as const,
      speaker: 'Amy Hood',
      text: normalizeText(row[textIndex] ?? ''),
    }))
    .filter((block) => block.text);
};

const blocksFromJson = (text: string): RawBlock[] => {
  const parsed = JSON.parse(text) as {
    speaker_turns?: Array<{ speaker?: unknown; speaker_raw?: unknown; text?: unknown; section?: unknown }>;
    records?: Array<{ text?: unknown }>;
  };
  if (Array.isArray(parsed.speaker_turns)) {
    return parsed.speaker_turns
      .map((turn, index) => ({
        blockId: `turn-${index + 1}`,
        kind: 'speaker_turn' as const,
        speaker: normalizeText(String(turn.speaker ?? turn.speaker_raw ?? 'Unknown')),
        text: normalizeText(String(turn.text ?? '')),
      }))
      .filter((block) => block.text);
  }
  if (Array.isArray(parsed.records)) {
    return parsed.records
      .map((record, index) => ({
        blockId: `record-${index + 1}`,
        kind: 'record' as const,
        speaker: 'Amy Hood',
        text: normalizeText(String(record.text ?? '')),
      }))
      .filter((block) => block.text);
  }
  throw new Error('unsupported local JSON source');
};

const blocksFromLocalFile = async (path: string) => {
  const text = await readFile(path, 'utf8');
  const extension = extname(path).toLowerCase();
  if (extension === '.json') return blocksFromJson(text);
  if (extension === '.csv') return blocksFromCsv(text);
  throw new Error(`unsupported local source extension: ${extension}`);
};

const speakerPrefix = /^([A-Za-z][A-Za-z .'-]{1,50}):\s*(.*)$/;
const isAmyHood = (speaker: string) => /^(amy(?: e\.)? hood|amy)$/i.test(speaker.trim());

export const extractAmyWebBlocks = (paragraphs: string[]): RawBlock[] => {
  let currentSpeaker = '';
  const blocks: RawBlock[] = [];
  for (const [index, paragraph] of paragraphs.entries()) {
    const match = paragraph.match(speakerPrefix);
    const text = normalizeText(match?.[2] ?? paragraph);
    if (match) currentSpeaker = normalizeText(match[1]);
    if (!text || !isAmyHood(currentSpeaker)) continue;
    blocks.push({
      blockId: `paragraph-${index + 1}`,
      kind: 'speaker_turn',
      speaker: 'Amy Hood',
      text,
    });
  }
  return blocks;
};

const blocksFromWeb = async (url: string, fetchImpl: typeof fetch): Promise<RawBlock[]> => {
  const response = await fetchImpl(url, { headers: { 'user-agent': 'fins-persona-poc/1.0' } });
  if (!response.ok) throw new Error(`web source request failed with ${response.status}: ${url}`);
  const html = await response.text();
  const $ = load(html);
  $('script, style, nav, header, footer, form, noscript, svg').remove();
  const container = $('main').first().length
    ? $('main').first()
    : $('article').first().length
      ? $('article').first()
      : $('[role="main"]').first().length
        ? $('[role="main"]').first()
        : $('body').first();
  const paragraphs = container
    .find('h1, h2, h3, h4, p, li')
    .toArray()
    .map((element) => normalizeText($(element).text()))
    .filter(Boolean);
  const unique = paragraphs.filter((paragraph, index) => paragraph !== paragraphs[index - 1]);
  const blocks = extractAmyWebBlocks(unique.length ? unique : [normalizeText(container.text())]);
  if (blocks.reduce((total, block) => total + block.text.length, 0) < 500) {
    throw new Error(`web source body is too short: ${url}`);
  }
  return blocks;
};

const makeRawSource = (
  entry: InventoryEntry,
  blocks: RawBlock[],
  collectedAt: string,
): RawSource => {
  const content = JSON.stringify(blocks.map(({ duplicateOf: _duplicateOf, ...block }) => block));
  return {
    sourceId: entry.source_id,
    title: entry.title,
    sourceType: entry.source_type,
    sourceUrl: entry.url,
    sourcePath: entry.local_path,
    collectedAt,
    sha256: digest(content),
    format: 'normalized_json',
    normalizationVersion: CORPUS_NORMALIZATION_VERSION,
    collectionStatus: 'complete',
    blocks,
  };
};

export const collectSelectedCorpus = async (options: CollectOptions): Promise<RawSource[]> => {
  const selected = assertSelectedInventory(options.entries);
  const seen = new Map<string, string>();
  const sources: RawSource[] = [];
  for (const entry of selected) {
    const outputPath = rawSourcePath(options.root, entry.source_id);
    const existing = await readRawSource(outputPath).catch(() => null);
    if (
      !entry.local_path &&
      existing?.collectionStatus === 'complete' &&
      existing.normalizationVersion === CORPUS_NORMALIZATION_VERSION &&
      existing.sourceUrl === entry.url &&
      existing.sourcePath === entry.local_path
    ) {
      sources.push(existing);
      for (const block of existing.blocks.filter((item) => !item.duplicateOf)) {
        seen.set(normalizeText(block.text).toLocaleLowerCase(), `${entry.source_id}:${block.blockId}`);
      }
      continue;
    }

    if (!entry.local_path && !entry.url) throw new Error(`source has no local path or URL: ${entry.source_id}`);
    const blocks = entry.local_path
      ? await blocksFromLocalFile(resolve(options.root, entry.local_path))
      : await blocksFromWeb(entry.url!, options.fetchImpl ?? fetch);
    for (const block of blocks) {
      const key = normalizeText(block.text).toLocaleLowerCase();
      const duplicateOf = seen.get(key);
      if (duplicateOf) block.duplicateOf = duplicateOf;
      else seen.set(key, `${entry.source_id}:${block.blockId}`);
    }
    const source = makeRawSource(
      entry,
      blocks,
      options.now?.() ?? new Date().toISOString(),
    );
    await atomicWriteJson(outputPath, source);
    sources.push(source);
  }
  return sources;
};

export const loadCollectedCorpus = async (root: string, entries: InventoryEntry[]) => {
  const selected = assertSelectedInventory(entries);
  const sources: RawSource[] = [];
  for (const entry of selected) {
    const source = await readRawSource(rawSourcePath(root, entry.source_id)).catch(() => null);
    if (!source || source.collectionStatus !== 'complete') {
      throw new Error(`collected raw source is missing: ${entry.source_id}`);
    }
    if (source.sourceId !== entry.source_id) {
      throw new Error(`raw source ID mismatch: ${entry.source_id}`);
    }
    sources.push(source);
  }
  return sources;
};
