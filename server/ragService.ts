import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

interface ArchiveCall {
  call?: {
    call_id?: string;
    fiscal_year?: number;
    fiscal_quarter?: number;
    title?: string;
    source_url?: string;
  };
  speaker_turns?: {
    turn_index?: number;
    speaker?: string;
    speaker_raw?: string;
    text?: string;
    section?: string;
  }[];
}

interface AmyHoodArchive {
  records?: {
    text?: string;
  }[];
}

export interface RagDocument {
  id: string;
  fileName: string;
  title: string;
  sourceUrl?: string;
  fiscalYear?: number;
  fiscalQuarter?: number;
  speaker?: string;
  section?: string;
  text: string;
}

export interface RagChunk extends RagDocument {
  chunkIndex: number;
  score?: number;
  vectorScore?: number;
  rerankScore?: number;
}

const archiveDir = resolve(process.cwd(), process.env.RAG_ARCHIVE_DIR ?? 'archive');
const archiveChunkSize = Number(process.env.RAG_CHUNK_SIZE ?? 1600);
const archiveChunkOverlap = Number(process.env.RAG_CHUNK_OVERLAP ?? 220);
const archiveRetrievalLimit = Number(process.env.RAG_RETRIEVAL_LIMIT ?? 14);

const safeJsonParse = <T>(text: string): T | null => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
};

const parseSingleColumnCsv = (csvText: string) => {
  const normalized = csvText.replace(/^\uFEFF/, '');
  const rows: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === '"' && next === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      const value = current.trim();
      if (value && value !== 'text') rows.push(value);
      current = '';
      continue;
    }

    current += char;
  }

  const value = current.trim();
  if (value && value !== 'text') rows.push(value);
  return rows;
};

const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim();

export const chunkArchiveDocument = (
  document: RagDocument,
  chunkSize = archiveChunkSize,
  overlap = archiveChunkOverlap,
): RagChunk[] => {
  const text = normalizeText(document.text);
  if (!text) return [];

  const chunks: RagChunk[] = [];
  let start = 0;
  let chunkIndex = 0;

  while (start < text.length) {
    const end = Math.min(text.length, start + chunkSize);
    chunks.push({
      ...document,
      id: `${document.id}:chunk-${chunkIndex}`,
      text: text.slice(start, end),
      chunkIndex,
    });

    if (end >= text.length) break;
    start = Math.max(0, end - overlap);
    chunkIndex += 1;
  }

  return chunks;
};

const tokenize = (text: string) => {
  const stopwords = new Set([
    'the',
    'and',
    'for',
    'that',
    'with',
    'this',
    'from',
    'our',
    'are',
    'was',
    'were',
    'you',
    'your',
    'but',
    'about',
    'into',
    'have',
    'has',
    'will',
    '하는',
    '있는',
    '그리고',
    '기준',
  ]);

  return text
    .toLowerCase()
    .match(/[a-z0-9가-힣]+/g)
    ?.filter((token) => token.length > 2 && !stopwords.has(token)) ?? [];
};

const scoreChunk = (chunk: RagChunk, queryTokens: string[]) => {
  const chunkTextLower = `${chunk.title} ${chunk.speaker ?? ''} ${chunk.section ?? ''} ${chunk.text}`.toLowerCase();
  const uniqueTokens = new Set(queryTokens);
  let score = 0;

  uniqueTokens.forEach((token) => {
    const matches = chunkTextLower.match(new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'));
    if (matches?.length) score += Math.min(matches.length, 6);
  });

  if (/amy hood/i.test(chunk.speaker ?? '')) score += 4;
  if (
    /capex|capital expenditures|free cash flow|operating margin|gross margin|rpo|azure|ai|capacity/i.test(chunk.text)
  ) {
    score += 2;
  }
  if (
    /acquisition|m&a|merger|linkedin|github|activision|nuance|nokia|mojang|minecraft|synergy|dilutive|accretive/i.test(
      `${chunk.title} ${chunk.section ?? ''} ${chunk.text}`,
    )
  ) {
    score += 2;
  }

  return score;
};

export const loadArchiveDocuments = (): RagDocument[] => {
  if (!existsSync(archiveDir)) return [];

  const files = readdirSync(archiveDir).filter((file) => file.endsWith('.json') || file.endsWith('.csv')).sort();
  const documents: RagDocument[] = [];

  files.forEach((fileName) => {
    const filePath = join(archiveDir, fileName);
    const raw = readFileSync(filePath, 'utf8');

    if (fileName.endsWith('.csv')) {
      parseSingleColumnCsv(raw).forEach((text, index) => {
        documents.push({
          id: `${fileName}:row-${index}`,
          fileName,
          title: 'Amy Hood collected interview CSV',
          speaker: 'Amy Hood',
          text,
        });
      });
      return;
    }

    const parsed = safeJsonParse<ArchiveCall & AmyHoodArchive>(raw);
    if (!parsed) return;

    if (Array.isArray(parsed.records)) {
      parsed.records.forEach((record, index) => {
        if (!record.text?.trim()) return;
        documents.push({
          id: `${fileName}:record-${index}`,
          fileName,
          title: 'Amy Hood collected interview JSON',
          speaker: 'Amy Hood',
          text: record.text,
        });
      });
      return;
    }

    if (Array.isArray(parsed.speaker_turns)) {
      parsed.speaker_turns.forEach((turn) => {
        if (!turn.text?.trim()) return;
        documents.push({
          id: `${fileName}:turn-${turn.turn_index ?? documents.length}`,
          fileName,
          title: parsed.call?.title || basename(fileName, '.json'),
          sourceUrl: parsed.call?.source_url,
          fiscalYear: parsed.call?.fiscal_year,
          fiscalQuarter: parsed.call?.fiscal_quarter,
          speaker: turn.speaker || turn.speaker_raw,
          section: turn.section,
          text: turn.text,
        });
      });
    }
  });

  return documents;
};

export const retrieveArchiveEvidence = (query: string, limit = archiveRetrievalLimit) => {
  const documents = loadArchiveDocuments();
  const chunks = documents.flatMap((document) => chunkArchiveDocument(document));
  const queryTokens = tokenize(query);
  const scoredChunks = chunks
    .map((chunk) => ({ ...chunk, score: scoreChunk(chunk, queryTokens) }))
    .filter((chunk) => (chunk.score ?? 0) > 0)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, limit);

  const evidenceText = scoredChunks
    .map((chunk, index) => {
      const source = [
        chunk.title,
        chunk.speaker ? `speaker=${chunk.speaker}` : '',
        chunk.fiscalYear && chunk.fiscalQuarter ? `FY${chunk.fiscalYear} Q${chunk.fiscalQuarter}` : '',
        chunk.section ? `section=${chunk.section}` : '',
        `file=${chunk.fileName}`,
      ]
        .filter(Boolean)
        .join(' | ');

      return `[Evidence ${index + 1}] ${source}\n${chunk.text}`;
    })
    .join('\n\n---\n\n');

  return {
    documents,
    chunks,
    selectedChunks: scoredChunks,
    evidenceText,
  };
};
