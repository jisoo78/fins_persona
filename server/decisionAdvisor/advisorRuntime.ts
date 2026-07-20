import type { AmyHoodRetrievalTrace } from '../../shared/amyHoodRag';
import type { ModelClient } from '../personaPipeline/modelClient';
import { readActivePromptVersion } from '../promptVersions/store';
import { createBgeM3EmbeddingClient } from './embeddingClient';
import { createAmyHoodHybridRetriever } from './hybridRetriever';
import { loadActiveAmyHoodMemoryIndex } from './memoryIndex';
import { buildAmyHoodRagContext } from './ragContext';

type RecentMessage = { sender: 'ai' | 'user'; text: string };
type Retriever = Awaited<ReturnType<typeof createAmyHoodHybridRetriever>>;

export type AdvisorAnswer = {
  reply: string;
  retrieval: AmyHoodRetrievalTrace | null;
  ragFallback: boolean;
  fallbackCode: 'embedding_unavailable' | 'index_stale' | 'index_corrupt' | 'retrieval_error' | null;
  noMatch: boolean;
};

const recentText = (messages: RecentMessage[]) => messages.slice(-8)
  .map(({ sender, text }) => `${sender === 'user' ? 'User' : 'Amy Hood'}: ${text}`)
  .join('\n');

const classify = (error: unknown): AdvisorAnswer['fallbackCode'] => {
  const message = error instanceof Error ? error.message : String(error);
  if (/embedding|BGE-M3/i.test(message)) return 'embedding_unavailable';
  if (/stale|hash mismatch/i.test(message)) return 'index_stale';
  if (/corrupt|artifact hash|vector file/i.test(message)) return 'index_corrupt';
  return 'retrieval_error';
};

export const createAmyHoodAdvisorRuntime = ({
  root,
  createModel,
  createRetriever = () => createAmyHoodHybridRetriever({
    root,
    embeddingClient: createBgeM3EmbeddingClient(),
  }),
  loadPrompt = () => readActivePromptVersion(root),
}: {
  root: string;
  createModel: () => ModelClient;
  createRetriever?: () => Promise<Retriever>;
  loadPrompt?: () => Promise<{ content: string }>;
}) => ({
  answer: async (input: { message: string; recentMessages: RecentMessage[] }): Promise<AdvisorAnswer> => {
    const prompt = await loadPrompt();
    const model = createModel();
    const baseUser = `Recent conversation:\n${recentText(input.recentMessages)}\n\nUser question:\n${input.message}`;
    try {
      const [index, retriever] = await Promise.all([
        loadActiveAmyHoodMemoryIndex(root),
        createRetriever(),
      ]);
      const retrieval = await retriever.retrieve({ query: input.message, indexHash: index.manifest.indexHash });
      const memory = await buildAmyHoodRagContext({
        root,
        retrieval,
        projection: 'full',
        systemPrompt: prompt.content,
        userPrompt: baseUser,
      });
      const result = await model.invoke({ system: prompt.content, user: `${memory.text}\n\n${baseUser}` });
      return { reply: result.text, retrieval: memory.trace, ragFallback: false, fallbackCode: null, noMatch: retrieval.trace.noMatch };
    } catch (error) {
      const result = await model.invoke({ system: prompt.content, user: baseUser });
      return { reply: result.text, retrieval: null, ragFallback: true, fallbackCode: classify(error), noMatch: false };
    }
  },
});
