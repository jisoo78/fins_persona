export type EmbeddingServiceIdentity = {
  model: string;
  dimension: 1024;
};

export type EmbeddingClient = {
  model: string;
  dimension: 1024;
  preflight: () => Promise<EmbeddingServiceIdentity>;
  embed: (input: string[]) => Promise<number[][]>;
};

type EmbeddingClientOptions = {
  baseUrl?: string;
  model?: string;
  dimension?: 1024;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

const fetchWithTimeout = async (
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`BGE-M3 request timed out after ${timeoutMs}ms`);
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const parseJson = async (response: Response) => {
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    throw new Error(`BGE-M3 returned invalid JSON (${response.status})`);
  }
};

const normalizeEmbedding = (value: unknown, dimension: number) => {
  if (
    !Array.isArray(value)
    || value.length !== dimension
    || value.some((item) => typeof item !== 'number' || !Number.isFinite(item))
  ) {
    throw new Error(`BGE-M3 embedding must contain ${dimension} finite numbers`);
  }
  const numbers = value as number[];
  const magnitude = Math.sqrt(numbers.reduce((sum, item) => sum + item * item, 0));
  if (!magnitude) throw new Error('BGE-M3 embedding magnitude must be positive');
  return numbers.map((item) => item / magnitude);
};

export const createBgeM3EmbeddingClient = (
  options: EmbeddingClientOptions = {},
): EmbeddingClient => {
  const baseUrl = (
    options.baseUrl
    ?? process.env.BGE_M3_BASE_URL
    ?? 'http://127.0.0.1:8081/v1'
  ).replace(/\/$/, '');
  const model = options.model ?? process.env.BGE_M3_MODEL ?? 'bge-m3-Q8_0.gguf';
  const dimension = options.dimension ?? 1024;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const fetchImpl = options.fetchImpl ?? fetch;

  const embed = async (input: string[]) => {
    if (!input.length || input.some((text) => typeof text !== 'string' || !text.trim())) {
      throw new Error('embedding input must contain non-empty text');
    }
    const response = await fetchWithTimeout(fetchImpl, `${baseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input }),
    }, timeoutMs);
    const payload = await parseJson(response) as {
      model?: string;
      data?: Array<{ index?: number; embedding?: unknown }>;
    };
    if (!response.ok) throw new Error(`BGE-M3 embedding request failed (${response.status})`);
    if (payload.model !== model) throw new Error(`BGE-M3 model identity mismatch: ${String(payload.model)}`);
    if (!Array.isArray(payload.data) || payload.data.length !== input.length) {
      throw new Error('BGE-M3 embedding count does not match request');
    }
    const ordered = [...payload.data].sort((left, right) =>
      Number(left.index ?? 0) - Number(right.index ?? 0));
    if (ordered.some((item, index) => item.index !== undefined && item.index !== index)) {
      throw new Error('BGE-M3 embedding response indices are invalid');
    }
    return ordered.map(({ embedding }) => normalizeEmbedding(embedding, dimension));
  };

  const preflight = async (): Promise<EmbeddingServiceIdentity> => {
    const response = await fetchWithTimeout(fetchImpl, `${baseUrl}/models`, {}, timeoutMs);
    const payload = await parseJson(response) as { data?: Array<{ id?: string }> };
    if (!response.ok || !payload.data?.some(({ id }) => id === model)) {
      throw new Error(`BGE-M3 model is unavailable: ${model}`);
    }
    await embed(['embedding service preflight']);
    return { model, dimension };
  };

  return { model, dimension, preflight, embed };
};
