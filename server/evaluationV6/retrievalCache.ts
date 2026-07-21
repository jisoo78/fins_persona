import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { AmyHoodRetrievalRequest, AmyHoodRetrievalResult } from '../../shared/amyHoodRag';
import { canonicalJson, sha256 } from '../decisionAdvisor/canonicalJson';
import { writeJsonAtomic } from '../decisionAdvisor/jsonStore';
import { evaluationV6Paths } from './paths';

type Retriever = { retrieve(request: AmyHoodRetrievalRequest): Promise<AmyHoodRetrievalResult> };
const normalize = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ');

export const readOrCreateEvaluationV6Retrieval = async ({
  root, experimentGroupId, query, indexHash, retriever,
}: {
  root: string; experimentGroupId: string; query: string; indexHash: string; retriever: Retriever;
}) => {
  if (!/^[a-zA-Z0-9-]+$/.test(experimentGroupId)) throw new Error('invalid Evaluation v6 group ID');
  const normalizedQuery = normalize(query);
  const queryHash = sha256(normalizedQuery);
  const filePath = path.join(evaluationV6Paths(root).retrievalCache, experimentGroupId, `${queryHash}.json`);
  try {
    const payload = JSON.parse(await readFile(filePath, 'utf8')) as { query: string; queryHash: string; indexHash: string; result: AmyHoodRetrievalResult; payloadHash: string };
    const base = { query: payload.query, queryHash: payload.queryHash, indexHash: payload.indexHash, result: payload.result };
    if (payload.payloadHash !== sha256(canonicalJson(base)) || payload.query !== normalizedQuery
      || payload.queryHash !== queryHash) throw new Error('Evaluation v6 retrieval cache is corrupt');
    if (payload.indexHash !== indexHash || payload.result.trace.indexHash !== indexHash) {
      throw new Error('Evaluation v6 retrieval cache index hash is stale');
    }
    return payload.result;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      if (error instanceof SyntaxError) throw new Error('Evaluation v6 retrieval cache is corrupt');
      throw error;
    }
  }
  const result = await retriever.retrieve({ query: normalizedQuery, indexHash });
  if (result.query !== normalizedQuery || result.trace.indexHash !== indexHash) {
    throw new Error('Evaluation v6 retrieval result is stale');
  }
  const base = { query: normalizedQuery, queryHash, indexHash, result };
  await writeJsonAtomic(filePath, { ...base, payloadHash: sha256(canonicalJson(base)) });
  return result;
};
