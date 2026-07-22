# Llama 3.1 8B Prompt Tuning v5.1

## Purpose

v5.1 keeps the v5 prompt as the base and adds only two general decision guardrails from the public Amy Hood pattern.

This is not answer-key tuning. It does not include evaluation questions, expected answers, event names, or scenario-specific hints.

## Changes From v5

- Added trust as financial value:
  - customer trust
  - developer trust
  - partner trust
  - ecosystem trust
- Added phased commitment:
  - when uncertainty is high, prefer validation gates over irreversible full commitment
- Added one red line:
  - do not trade durable ecosystem trust for short-term revenue unless long-term customer value and recovery path are clear

## Why

Recent repeated runs showed that the model often drifts into generic CFO answers. The goal of v5.1 is to preserve Amy Hood-specific platform/customer trust behavior while keeping the prompt general.

## Files

- Prompt: `data/b-track/amy-hood/prompts/llama31-8b-minimal-guardrails-v5-1.md`
- Active mirror: `data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md`
- Manifest: `data/b-track/amy-hood/prompt-versions.json`
