import { ChatOpenAI } from '@langchain/openai';

import type { ProviderName } from './types';

export interface ModelResult {
  text: string;
  elapsedMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ModelClient {
  provider: ProviderName;
  model: string;
  invoke(prompt: string): Promise<ModelResult>;
}

const contentToText = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return String(content ?? '');
  return content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part) {
        return String((part as { text?: unknown }).text ?? '');
      }
      return '';
    })
    .join('');
};

const usageToken = (usage: unknown, key: 'input_tokens' | 'output_tokens') => {
  if (!usage || typeof usage !== 'object') return undefined;
  const value = (usage as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : undefined;
};

export const createModelClient = (provider: ProviderName): ModelClient => {
  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for the openai provider');
  }
  const model =
    provider === 'local'
      ? process.env.LOCAL_LLM_MODEL || 'local-model'
      : process.env.OPENAI_MODEL || 'gpt-5-mini';
  const chat = new ChatOpenAI({
    apiKey:
      provider === 'local'
        ? process.env.LOCAL_LLM_API_KEY || 'local'
        : process.env.OPENAI_API_KEY,
    model,
    ...(provider === 'local'
      ? {
          temperature: 0.2,
          configuration: {
            baseURL: process.env.LOCAL_LLM_BASE_URL || 'http://127.0.0.1:8080/v1',
          },
        }
      : {}),
  });

  return {
    provider,
    model,
    async invoke(prompt) {
      const started = Date.now();
      const result = await chat.invoke(prompt);
      const text = contentToText(result.content).trim();
      if (!text) throw new Error(`${provider} model returned empty content`);
      return {
        text,
        elapsedMs: Date.now() - started,
        inputTokens: usageToken(result.usage_metadata, 'input_tokens'),
        outputTokens: usageToken(result.usage_metadata, 'output_tokens'),
      };
    },
  };
};
