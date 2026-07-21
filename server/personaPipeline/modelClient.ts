import { ChatOpenAI } from '@langchain/openai';
import { createHash } from 'node:crypto';

import type { ProviderName } from './types';

export const LOCAL_ANALYSIS_PROMPT_RESERVE_TOKENS = 1_000;
export const LOCAL_CHAT_RESERVE_TOKENS = 384;
export const LOCAL_MAX_OUTPUT_TOKENS = 5_000;

export interface ModelResult {
  text: string;
  elapsedMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface ModelClient {
  provider: ProviderName;
  model: string;
  cacheKey: string;
  invoke(prompt: string): Promise<ModelResult>;
}

export type ModelClientOptions = {
  maxTokens?: number;
};

export const modelRequestSettings = (
  provider: ProviderName,
  modelOverride?: string,
  options: ModelClientOptions = {},
) => ({
  model:
    modelOverride ||
    (provider === 'local'
      ? process.env.LOCAL_LLM_MODEL || 'local-model'
      : process.env.OPENAI_MODEL || 'gpt-5-mini'),
  maxTokens: options.maxTokens ?? LOCAL_MAX_OUTPUT_TOKENS,
  modelKwargs:
    provider === 'local'
      ? {
          reasoning_format: 'none',
          chat_template_kwargs: { enable_thinking: false },
        }
      : undefined,
});

export const modelSettingsFingerprint = (
  provider: ProviderName,
  modelOverride?: string,
  options: ModelClientOptions = {},
) =>
  createHash('sha256')
    .update(JSON.stringify({ provider, ...modelRequestSettings(provider, modelOverride, options) }))
    .digest('hex');

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

export const normalizeModelContent = (content: unknown) =>
  contentToText(content)
    .replace(/^<\|channel>thought\s*<channel\|>\s*/, '')
    .trim();

const usageToken = (usage: unknown, key: 'input_tokens' | 'output_tokens') => {
  if (!usage || typeof usage !== 'object') return undefined;
  const value = (usage as Record<string, unknown>)[key];
  return typeof value === 'number' ? value : undefined;
};

export const createModelClient = (
  provider: ProviderName,
  modelOverride?: string,
  options: ModelClientOptions = {},
): ModelClient => {
  if (provider === 'openai' && !process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for the openai provider');
  }
  const { model, maxTokens, modelKwargs } = modelRequestSettings(provider, modelOverride, options);
  const chat = new ChatOpenAI({
    apiKey:
      provider === 'local'
        ? process.env.LOCAL_LLM_API_KEY || 'local'
        : process.env.OPENAI_API_KEY,
    model,
    maxTokens,
    modelKwargs,
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
    cacheKey: modelSettingsFingerprint(provider, modelOverride, options),
    async invoke(prompt) {
      const started = Date.now();
      const result = await chat.invoke(prompt);
      const text = normalizeModelContent(result.content);
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
