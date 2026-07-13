import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { ModelClient } from './modelClient';
import { checkGemmaGate, personaPromptPath } from './promptBuilder';
import type { ProviderName } from './types';

interface EvaluationQuestion {
  id: string;
  question: string;
  expected_focus: string[];
  holdout_target?: string;
  grading_notes?: string[];
}

interface EvaluationQuestionsFile {
  dataset?: string;
  subject?: string;
  evaluation_goal?: string;
  questions: EvaluationQuestion[];
}

export interface EvaluationAnswer {
  questionId: string;
  question: string;
  answer: string;
  expectedFocus: string[];
  holdoutTarget?: string;
  gradingNotes?: string[];
  elapsedMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface EvaluationResult {
  provider: ProviderName;
  model: string;
  personaPath: string;
  questionsPath: string;
  dataset?: string;
  subject?: string;
  evaluationGoal?: string;
  answers: EvaluationAnswer[];
}

export interface EvaluateOptions {
  root: string;
  provider: ProviderName;
  model: ModelClient;
}

const atomicWrite = async (path: string, text: string) => {
  await mkdir(resolve(path, '..'), { recursive: true });
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, text, 'utf8');
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
};

export const evaluationOutputPath = (root: string, provider: ProviderName) =>
  resolve(root, 'evaluation', `amy-hood-persona-eval.${provider}.json`);

export const evaluatePersona = async (options: EvaluateOptions): Promise<EvaluationResult> => {
  if (options.model.provider !== options.provider) {
    throw new Error('model provider does not match evaluation provider');
  }
  if (options.provider === 'openai') {
    const gate = await checkGemmaGate(options.root);
    if (!gate.passed) throw new Error(`Gemma gate failed: ${gate.failures.join('; ')}`);
  }
  const promptPath = personaPromptPath(options.root, options.provider);
  const questionsPath = resolve(
    options.root,
    'evaluation/amy_hood_decision_eval_questions_15.json',
  );
  const persona = await readFile(promptPath, 'utf8');
  const questionsFile = JSON.parse(
    await readFile(questionsPath, 'utf8'),
  ) as EvaluationQuestionsFile;
  if (questionsFile.questions.length !== 15) {
    throw new Error(`expected 15 evaluation questions, got ${questionsFile.questions.length}`);
  }

  const answers: EvaluationAnswer[] = [];
  for (const item of questionsFile.questions) {
    const result = await options.model.invoke(
      `[SYSTEM PERSONA]\n${persona}\n\n[USER QUESTION]\n${item.question}\n\n` +
        'Answer as Amy Hood in first person. Give the financial advice directly without source citations. ' +
        'Keep the answer under 500 words.',
    );
    answers.push({
      questionId: item.id,
      question: item.question,
      answer: result.text,
      expectedFocus: item.expected_focus,
      holdoutTarget: item.holdout_target,
      gradingNotes: item.grading_notes,
      elapsedMs: result.elapsedMs,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });
  }
  const evaluation: EvaluationResult = {
    provider: options.provider,
    model: options.model.model,
    personaPath: promptPath,
    questionsPath,
    dataset: questionsFile.dataset,
    subject: questionsFile.subject,
    evaluationGoal: questionsFile.evaluation_goal,
    answers,
  };
  await atomicWrite(
    evaluationOutputPath(options.root, options.provider),
    `${JSON.stringify(evaluation, null, 2)}\n`,
  );
  return evaluation;
};
