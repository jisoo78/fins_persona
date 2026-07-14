export type ProviderName = 'local' | 'openai';

export const providerArtifactName = (provider: ProviderName) =>
  provider === 'local' ? 'gemma4' : 'gpt5-mini';

export type BlockKind = 'speaker_turn' | 'qa_pair' | 'paragraph' | 'record';

export interface RawBlock {
  blockId: string;
  kind: BlockKind;
  speaker?: string;
  text: string;
  duplicateOf?: string;
}

export interface RawSource {
  sourceId: string;
  title: string;
  sourceType: string;
  sourceUrl: string | null;
  sourcePath: string | null;
  collectedAt: string;
  sha256: string;
  format: 'normalized_json';
  normalizationVersion: number;
  collectionStatus: 'complete';
  blocks: RawBlock[];
}

export interface SourceChunk {
  chunkId: string;
  sourceId: string;
  index: number;
  blockIds: string[];
  text: string;
  tokenCount: number;
  sha256: string;
}

export interface AnalysisSignal {
  statement: string;
  conditions: string[];
  exceptions: string[];
  sourceLocator: string;
}

export interface ChunkAnalysis {
  sourceId: string;
  chunkId: string;
  provider: ProviderName;
  model: string;
  fingerprint: string;
  decisionCriteria: AnalysisSignal[];
  priorities: AnalysisSignal[];
  tradeoffs: AnalysisSignal[];
  riskSignals: AnalysisSignal[];
  communicationPatterns: AnalysisSignal[];
  status: 'complete' | 'failed';
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  elapsedMs: number;
}

export interface SourceAnalysis {
  sourceId: string;
  chunkIds: string[];
  provider: ProviderName;
  model: string;
  decisionCriteria: AnalysisSignal[];
  priorities: AnalysisSignal[];
  tradeoffs: AnalysisSignal[];
  riskSignals: AnalysisSignal[];
  communicationPatterns: AnalysisSignal[];
  status: 'complete' | 'failed';
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
}

export interface PipelineRunSummary {
  provider: ProviderName;
  model: string;
  sourceCount: number;
  chunkCount: number;
  completedChunks: number;
  failedChunks: number;
  reusedChunks: number;
  elapsedMs: number;
  gatePassed: boolean;
}
