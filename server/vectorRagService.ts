import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import type { RagChunk } from './ragService';
import { rerankChunksWithCohere, shouldUseCohereReranker } from './rerankerService';

const execFileAsync = promisify(execFile);

interface VectorIndexMetadata {
  model: string;
  dimension: number;
  chunkCount: number;
  vectorsFile: string;
  chunks: RagChunk[];
}

interface VectorSearchResult {
  documents: unknown[];
  chunks: RagChunk[];
  selectedChunks: RagChunk[];
  evidenceText: string;
  index: {
    model: string;
    dimension: number;
    chunkCount: number;
  };
}

const indexDir = resolve(process.cwd(), process.env.RAG_VECTOR_INDEX_DIR ?? 'data/vector_index');
const metadataPath = resolve(indexDir, 'bge_m3_metadata.json');

let cachedMetadata: VectorIndexMetadata | null = null;
let cachedVectors: Float32Array | null = null;

const loadVectorIndex = () => {
  if (!existsSync(metadataPath)) return null;

  if (cachedMetadata && cachedVectors) {
    return {
      metadata: cachedMetadata,
      vectors: cachedVectors,
    };
  }

  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as VectorIndexMetadata;
  const vectorsPath = resolve(indexDir, metadata.vectorsFile);
  if (!existsSync(vectorsPath)) return null;

  const buffer = readFileSync(vectorsPath);
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const vectors = new Float32Array(arrayBuffer);

  cachedMetadata = metadata;
  cachedVectors = vectors;

  return { metadata, vectors };
};

const embedQuery = async (query: string) => {
  const pythonPath = process.env.BGE_M3_PYTHON || resolve(process.cwd(), '.venv/bin/python');
  const scriptPath = resolve(process.cwd(), 'scripts/embed_bge_m3_query.py');
  const { stdout } = await execFileAsync(pythonPath, [scriptPath, query], {
    maxBuffer: 1024 * 1024 * 16,
    timeout: Number(process.env.BGE_M3_QUERY_TIMEOUT_MS ?? 120000),
  });
  const parsed = JSON.parse(stdout) as { embedding: number[] };
  return parsed.embedding;
};

const buildEvidenceText = (chunks: RagChunk[]) =>
  chunks
    .map((chunk, index) => {
      const source = [
        chunk.title,
        chunk.speaker ? `speaker=${chunk.speaker}` : '',
        chunk.fiscalYear && chunk.fiscalQuarter ? `FY${chunk.fiscalYear} Q${chunk.fiscalQuarter}` : '',
        chunk.section ? `section=${chunk.section}` : '',
        `file=${chunk.fileName}`,
        chunk.score != null ? `score=${chunk.score.toFixed(4)}` : '',
        chunk.vectorScore != null ? `vectorScore=${chunk.vectorScore.toFixed(4)}` : '',
        chunk.rerankScore != null ? `rerankScore=${chunk.rerankScore.toFixed(4)}` : '',
      ]
        .filter(Boolean)
        .join(' | ');

      return `[Evidence ${index + 1}] ${source}\n${chunk.text}`;
    })
    .join('\n\n---\n\n');

export const retrieveVectorArchiveEvidence = async (
  query: string,
  limit = 14,
): Promise<VectorSearchResult | null> => {
  const index = loadVectorIndex();
  if (!index) return null;

  const queryEmbedding = await embedQuery(query);
  const { metadata, vectors } = index;
  const scores = metadata.chunks.map((chunk, chunkIndex) => {
    let score = 0;
    const offset = chunkIndex * metadata.dimension;

    for (let dim = 0; dim < metadata.dimension; dim += 1) {
      score += vectors[offset + dim] * queryEmbedding[dim];
    }

    return {
      ...chunk,
      score,
    };
  });

  const sortedChunks = scores.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const candidateLimit = shouldUseCohereReranker()
    ? Math.max(limit, Number(process.env.COHERE_RERANK_CANDIDATE_LIMIT ?? Math.max(limit * 5, 40)))
    : limit;
  const candidateChunks = sortedChunks.slice(0, candidateLimit);
  let selectedChunks: RagChunk[] = candidateChunks.slice(0, limit);

  try {
    const rerankedChunks = await rerankChunksWithCohere(query, candidateChunks, limit);
    if (rerankedChunks?.length) selectedChunks = rerankedChunks;
  } catch (error) {
    console.warn('Cohere rerank fallback to vector ranking', error);
  }

  const uniqueDocumentIds = new Set(metadata.chunks.map((chunk) => `${chunk.fileName}:${chunk.id.split(':chunk-')[0]}`));

  return {
    documents: Array.from(uniqueDocumentIds).map((id) => ({ id })),
    chunks: metadata.chunks,
    selectedChunks,
    evidenceText: buildEvidenceText(selectedChunks),
    index: {
      model: metadata.model,
      dimension: metadata.dimension,
      chunkCount: metadata.chunkCount,
    },
  };
};

export const hasVectorArchiveIndex = () => Boolean(loadVectorIndex());
