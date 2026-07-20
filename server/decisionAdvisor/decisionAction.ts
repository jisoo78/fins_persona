const normalizedText = (value: string) => value
  .normalize('NFKC')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .replace(/^_+|_+$/g, '');

const aliases: Array<[RegExp, string]> = [
  [/^(?:expand|increase|invest_more|expand_focused_investment|increase_investment)$/, 'expand'],
  [/^(?:maintain|hold|continue_current_level)$/, 'maintain'],
  [
    /^(?:reduce|reallocate|reduce_or_reallocate|reduce_or_reallocate_resources)$/,
    'reduce_or_reallocate',
  ],
  [/^(?:acquire|acquisition|buy)$/, 'acquire'],
  [/^(?:partner|partnership|strategic_partnership)$/, 'partner'],
  [/^(?:build|organic_build|build_internally)$/, 'build'],
  [/^(?:price|list_price|charge)$/, 'price'],
  [/^(?:bundle|include_without_separate_price)$/, 'bundle'],
];

export const normalizeDecisionAction = (value: string) => {
  const normalized = normalizedText(value);
  return aliases.find(([expression]) => expression.test(normalized))?.[1] ?? normalized;
};
