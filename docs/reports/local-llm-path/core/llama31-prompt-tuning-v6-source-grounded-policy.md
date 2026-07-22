# Llama 3.1 8B Prompt Tuning v6

## Status

This version was tested and then excluded from the active prompt.

The active prompt was reverted to `llama31-8b-minimal-guardrails-v5` because the v6 A Track Copy run scored lower (`6.52 / 10`) than the v5-based run (`7.36 / 10`).

## Purpose

v6 is not tuned from the evaluation answer key.

The goal is to improve how the persona uses source/RAG context without turning the prompt into an answer sheet. The prompt keeps the original Amy Hood identity and decision principles, then adds source-grounding rules based on public-source decision behavior.

## Changed From v5

- Added stronger source-grounding rules.
- Added portfolio discipline across growth, margin, operating leverage, cash flow timing, integration risk, and reversibility.
- Clarified demand-driven CapEx as tied to contract delivery, usage, capacity needs, and committed customer demand.
- Added rules to prevent unrelated RAG context from overriding the core decision principles.
- Added conservative handling for conflicting or incomplete context.
- Added M&A vs. build and scale vs. control decision rules.

## What This Is Not

- It does not include evaluation questions.
- It does not include answer keys.
- It does not include event-specific labels such as "GitHub-like" or "LinkedIn-like".
- It does not hard-code the expected answer for any evaluation item.

## Expected Effect

The expected improvement is modest.

The intended benefit is not to memorize the benchmark, but to reduce answer drift when RAG context is noisy or too broad. If the score improves, it should be interpreted as better source handling and decision consistency, not answer-key tuning.

## Files

- Versioned prompt: `data/b-track/amy-hood/prompts/llama31-8b-source-grounded-policy-v6.md`
- Current active compatibility prompt: `data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md` now mirrors v5, not v6.
- Version manifest: `data/b-track/amy-hood/prompt-versions.json`

## Verification

- `npm run evaluation:test`
- Result: 56 passed, 0 failed
