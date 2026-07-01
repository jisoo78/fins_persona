# Attribute Trade-Off Rules

Attribute-based trade-off options are high-intensity questions. They are useful only when the user's decision criteria are hidden in how they compare multiple dimensions.

## Warrant Test

Use `attribute_tradeoff` only when at least 2 of these are true:

- A single direct answer would be too vague.
- The real decision involves multiple competing criteria.
- The role has domain-specific judgment dimensions for this category.
- A later deep interview can pressure-test one changed condition.
- Simple wording would invite socially desirable answers.
- The stage is `preference` or `priority_order`.

If fewer than 2 are true, choose `scenario_choice`, `boundary_check`, or `priority_order`.

## Fatigue Guardrails

- Recommend no more than 2 attribute-tradeoff questions per category.
- Prefer 4 to 5 attributes per attribute-tradeoff question.
- Do not use a table when a natural sentence is enough.
- Do not use consecutive attribute-tradeoff questions in one category.
- Make options scannable; avoid long nested descriptions.

## Attribute Design

Attributes are local to the question. Do not define a global metric schema unless the user explicitly asks for one.

Good attributes:

- Match the target role.
- Are comparable across all options.
- Have clear value types such as number, percent, ordinal, category, duration, or boolean.
- Represent real trade-offs, not decorative details.

Bad attributes:

- Are irrelevant to the role.
- Make one option obviously best.
- Repeat the same idea with different labels.
- Require specialized external knowledge the user may not have.

## Option Design

Each option should reveal a different criterion pattern.

Use:

- A concise `option_text` for display.
- `attribute_values` for structured comparison.
- `revealed_preference` for interpretation.

Do not use universal labels such as "risk avoider" across all roles. Write labels that fit the question:

- CFO investment question: "limits downside before pursuing upside"
- CTO launch question: "protects reliability before speed"
- CMO campaign question: "prioritizes brand protection over short-term reach"
- CEO operating question: "keeps strategic control even if growth slows"

## Pressure-Test Candidate

Only add a pressure-test candidate when one attribute can be moved cleanly.

Good:

- "If reliability risk moved from medium to high, would you keep the same launch choice?"
- "If the payback period increased from 18 to 28 months, would this remain acceptable?"

Bad:

- Changing three conditions at once.
- Asking a generic "why" without a changed condition.
- Adding a pressure test to every question.
