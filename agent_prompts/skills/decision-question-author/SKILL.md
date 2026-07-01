---
name: decision-question-author
description: Design or review staged pre-interview questions for decision persona cloning. Use when Codex needs to create, rewrite, or critique 8-category x 5-stage question banks, preserve preference/context_shift/core_value/red_line/priority_order structure, decide whether attribute-based trade-off options are warranted, generate role-appropriate options for CFO/CTO/CMO/CEO-style personas, or derive pressure-test follow-ups from selected options.
---

# Decision Question Author

## Purpose

Create natural pre-interview questions that expose decision criteria for a cloneable decision persona. Preserve the fixed structure:

```text
8 categories x 5 stages = 40 pre-interview questions
```

Treat each question as `target_role + category + stage`. Never let a clever option format override the stage purpose.

## Core Rules

- Keep the five stages: `preference`, `context_shift`, `core_value`, `red_line`, `priority_order`.
- Write exactly one question per stage in each category unless the user asks for a different count.
- Use attribute-based trade-off options only when they reveal criteria that a simpler question would hide.
- Prefer natural scenario or direct-choice questions for most items.
- Recommend no more than 2 attribute-based trade-off questions per category.
- Avoid placing attribute-based trade-off questions back-to-back inside one category.
- Do not hard-code finance metrics such as IRR, payback period, or liquidity unless the role and category require them.
- Do not use fixed personality labels across roles. Labels must be question-specific interpretations of the selected option.

## Workflow

1. Identify `target_role`, the 8 categories, and the expected output format.
2. Build or inspect the 40-cell grid: each category must contain the five stages.
3. For each cell, confirm the stage purpose before writing the question.
4. Choose `question_mode`:
   - `direct_choice`
   - `scenario_choice`
   - `attribute_tradeoff`
   - `boundary_check`
   - `priority_order`
5. Use `attribute_tradeoff` only if the warrant rules pass. See `references/attribute-tradeoff-rules.md`.
6. Generate 4 fixed options plus optional direct-input option when the project contract requires it.
7. Add `revealed_preference` for each option: a short behavioral inference tied to that question.
8. Add a pressure-test follow-up only when the selected option has a clear movable condition.
9. Review the full set for fatigue, repetition, role fit, and stage coverage.

## Stage Purposes

Use these as hard constraints:

| stage | Purpose | Good output |
| --- | --- | --- |
| `preference` | Basic decision leaning | The user's default direction under normal constraints |
| `context_shift` | Standard changes under changed conditions | The condition that changes or preserves the user's default |
| `core_value` | Non-negotiable value | The principle the user will not trade away |
| `red_line` | Stop, reject, or defer boundary | A concrete limit or refusal condition |
| `priority_order` | Order under conflict | Which criterion wins when criteria collide |

## Question Modes

Use `references/question-modes.md` when deciding or explaining modes.

Default selection:

- Use `scenario_choice` for most stage questions.
- Use `direct_choice` for simple reporting, preference, or style questions.
- Use `boundary_check` for `red_line`.
- Use `priority_order` for explicit conflict-order questions.
- Use `attribute_tradeoff` sparingly, most often in `preference` or `priority_order`.

## Attribute-Based Options

Attribute-based options are not a universal format. They are high-intensity questions for cases where the user's criteria only appear through trade-offs among multiple attributes.

When using them:

- Define question-local attributes, not global schema fields.
- Choose attributes that match the role and category.
- Keep attributes few enough for the user to compare quickly.
- Make every option plausible.
- Avoid one obviously best or worst option.
- Make each option express a different criterion pattern.
- Store interpretation as `revealed_preference`, not as a global personality type.

Example attribute names must differ by role:

- CFO: runway impact, loss limit, payback period, downside exposure.
- CTO: reliability risk, technical debt, reversibility, delivery speed.
- CMO: brand risk, CAC efficiency, learning value, reach.
- CEO: strategic control, org disruption, market timing, capital intensity.

Load `references/role-examples.md` only when role-specific examples are needed.

## Pressure Tests

Pressure tests are follow-up prompts for deep interviews, not extra pre-interview questions by default.

Use this pattern:

1. Ask why the selected option won.
2. Change exactly one important condition.
3. Ask whether the user would keep or change the decision.
4. Convert the answer into a boundary, exception, or if/then rule.

Do not add a pressure test when the original question is purely direct preference, style, or identity wording.

## Output Shape

When producing questions, prefer this shape:

```json
{
  "category": "category name",
  "stage": "preference",
  "question_mode": "scenario_choice",
  "question": "question text",
  "options": [
    {
      "option_id": 1,
      "option_text": "option text",
      "revealed_preference": "what this option suggests"
    }
  ],
  "authoring_notes": {
    "why_this_mode": "short reason",
    "why_not_attribute_tradeoff": "include when relevant",
    "pressure_test_candidate": "optional follow-up"
  }
}
```

For `attribute_tradeoff`, add:

```json
{
  "attributes": [
    {
      "attribute_id": "delivery_speed",
      "label": "Delivery speed",
      "value_type": "ordinal"
    }
  ],
  "options": [
    {
      "option_id": 1,
      "option_text": "option text",
      "attribute_values": {
        "delivery_speed": "high"
      },
      "revealed_preference": "what this option suggests"
    }
  ]
}
```

## Review Checklist

Before finalizing a question set:

- Confirm all 8 categories have all 5 stages.
- Count attribute-tradeoff questions per category; flag categories above 2.
- Confirm every stage's question actually serves that stage.
- Confirm options do not merely describe socially desirable behavior.
- Confirm role-specific attributes are relevant to the target role.
- Confirm no finance-only assumptions leak into non-finance roles.
- Confirm the set feels answerable without excessive tables.
- Confirm each option can support a later persona rule or exception.
