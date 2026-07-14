# Amy Hood Decision Advisor Implementation Plan Index

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved Amy Hood Decision Advisor as six independently reviewable implementation phases while preserving the existing v2 evaluation and A Track behavior.

**Architecture:** The work follows a deterministic policy-first pipeline: freeze evaluation v3, collect immutable public sources, build reviewed decision events, induce versioned three-layer memory, run a thin-prompt advisor, then expose review and five-run ablation workflows in B Track. Each phase ends with passing tests and a usable artifact that the next phase consumes through typed contracts.

**Tech Stack:** TypeScript 5.8, Node.js 22, Express 4, React 19, Vite 6, Node test runner via `tsx --test`, Python 3 with local BGE-M3 tooling, JSON/JSONL persistence.

**Approved Design:** [`2026-07-14-amy-hood-decision-advisor-master-design.md`](../specs/2026-07-14-amy-hood-decision-advisor-master-design.md)

## Global Constraints

- Keep A Track and `PreInterviewContext` unchanged.
- Keep the current 15-question v2 evaluation as a regression and smoke test.
- Use Gemma 4 local with a 16,384-token context as the default runtime.
- Call GPT-5-mini only after the Gemma pipeline and data gates pass.
- Do not add GraphRAG, autonomous multi-agent debate, fine-tuning, LinkedIn scraping, access-control bypass, or private Microsoft data.
- Require explicit human approval for sources, events, reflections, and policies.
- Store post-outcome evidence separately and exclude it from policy construction and runtime memory.
- Pin immutable source, event, memory, prompt, retrieval, model, and evaluation versions for every run.
- Follow AGENTS.md TDD: one happy path, exactly three realistic edge cases by default, and safe failure-path coverage.
- Preserve unrelated working-tree changes and never stage generated evaluation runs or prompt versions unless a phase explicitly creates the artifact.

---

## Execution Order

1. [Phase 1 — Evaluation v3 Contracts and Sealed Baseline](./2026-07-14-amy-hood-decision-advisor-phase-1-evaluation-v3.md)
2. [Phase 2 — Registry-First Source Collection](./2026-07-14-amy-hood-decision-advisor-phase-2-source-collection.md)
3. [Phase 3 — Evidence and Twenty-Event Dataset](./2026-07-14-amy-hood-decision-advisor-phase-3-event-dataset.md)
4. [Phase 4 — Reflection, Policy, and Three-Layer Memory](./2026-07-14-amy-hood-decision-advisor-phase-4-policy-memory.md)
5. [Phase 5 — Decision Advisor Runtime](./2026-07-14-amy-hood-decision-advisor-phase-5-advisor-runtime.md)
6. [Phase 6 — B Track Review UI, Five-Run Ablation, and Provider Gate](./2026-07-14-amy-hood-decision-advisor-phase-6-ui-evaluation.md)

## Phase Gates

| Phase | Required evidence before proceeding |
|---|---|
| 1 | Thirty-slot v3 blueprint, scoring contract, four-arm contract, and leakage rules validate; v2 tests still pass |
| 2 | Whitelist collectors are idempotent; failed refresh preserves valid raw source; candidate registry contains 30 reviewed candidates |
| 3 | Exactly 20 approved events satisfy the gate and split 12/4/4; the 30-question sealed bundle is frozen before policy tuning; holdout data cannot enter a build path |
| 4 | Approved memory release contains only train/development artifacts; every deployable policy has counterevidence and required support |
| 5 | Advisor produces a valid DecisionPlan within budget, records fallback, and preserves source-to-answer provenance |
| 6 | B Track exposes review and audit flows; four Gemma arms run five times; report calculates lift, consistency, grounding, tokens, and latency; GPT-5-mini remains blocked until every Gemma gate passes |

## Full Verification After Every Phase

```bash
npm run inventory:test
npm run persona:test
npm run evaluation:test
npm run lint
npm run build
git diff --check
```

Expected: every command exits `0`; no v2 regression fails; only files owned by the active phase are staged for its commit.
