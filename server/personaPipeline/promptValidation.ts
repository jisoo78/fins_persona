export const REQUIRED_PERSONA_PROMPT_HEADINGS = [
  '## Role',
  '## Identity',
  '## Decision Principles',
  '## Cross-Dimension Rules',
  '## Red Lines',
  '## Communication Style',
  '## Unknown Policy',
  '## Response Format',
];

export const assertValidPersonaPrompt = (content: string) => {
  if (!content.trim()) throw new Error('persona prompt content is required');
  const missing = REQUIRED_PERSONA_PROMPT_HEADINGS.filter(
    (heading) => !content.includes(heading),
  );
  if (missing.length) {
    throw new Error(`persona prompt missing headings: ${missing.join(', ')}`);
  }
};
