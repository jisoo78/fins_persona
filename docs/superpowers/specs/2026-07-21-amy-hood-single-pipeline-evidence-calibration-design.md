# Amy Hood Decision Advisor — Single-Pipeline Evidence and V4 Calibration Design

**Date:** 2026-07-21  
**Status:** Approved design  
**Branch:** `codex/amy-hood-first-policy-release`

## 1. Objective

Complete one production-shaped Amy Hood Decision Advisor pipeline quickly enough to run a meaningful model comparison. The immediate experiment measures whether the Amy Main Prompt and query-dependent RAG change E4B's decision behavior. It does not claim that the system has replicated Amy Hood's real decision-making.

This design does not create a provisional pipeline, a second memory release namespace, or a separate search implementation. Newly researched evidence continues through the existing canonical flow:

`source registry → event cards → policies → active memory release → active index → Advisor and Evaluation v4`

The project will focus on five deployable domain policies and a ten-scenario V4 calibration run before expanding to the full thirty-scenario benchmark.

## 2. Current State and Constraint

The current implementation has already proven that query-dependent BGE-M3 retrieval and E4B context injection work end to end. Evaluation v3 completed 120 model answers and 60 RAG traces, but did not discriminate between the Generic CFO, Amy Prompt, and Policy RAG conditions. The active memory release contains one approved AI and cloud CapEx policy, so it cannot represent five-domain Amy Hood decision behavior.

Evaluation v4 currently implements its public contracts, five-domain policy coverage check, and external-source isolation. Its scenario bundle, runner, judge packet flow, and report path are not yet complete. Relaxing evidence ingestion alone will therefore not make V4 executable; the focused runtime slice in this design is also required.

The existing evidence gate requires full source text, an immutable hash, normalized text, and a speaker segment covering the entire relevance passage. That standard is useful for high-confidence research, but it blocks reviewed, exact Amy Hood excerpts that are sufficient for the current behavioral calibration.

## 3. Design Principles

1. **One canonical pipeline:** Advisor and Evaluation use the same source registry, policies, release, index, and retriever.
2. **Truthful evidence representation:** A captured excerpt is never labeled as a full source document.
3. **Evidence maturity without parallel tracks:** Full text and reviewed excerpts are two completeness levels within the same schema.
4. **No invented Amy evidence:** A summary or another executive's statement cannot become direct Amy Hood evidence.
5. **Holdout isolation remains strict:** Sealed holdouts never enter event training, policy induction, memory release, or RAG.
6. **Selection over breadth:** Build exactly the evidence needed for one policy in each of five domains before collecting more events.
7. **Calibration before scale:** Run ten scenarios once before authoring and executing the full thirty-scenario benchmark.

## 4. Canonical Evidence Model

### 4.1 Source completeness

Every source artifact declares one of two completeness values:

- `full_text`: the stored artifact contains the complete collected source text.
- `reviewed_excerpt`: the stored artifact contains a manually reviewed, source-attributed excerpt rather than the complete page or transcript.

Both are canonical evidence records. `reviewed_excerpt` is not a temporary data path and can later be superseded by a `full_text` artifact without changing the source or event identity.

### 4.2 Reviewed excerpt requirements

A reviewed excerpt is accepted only when it contains:

- canonical URL;
- source title, publisher, and publication date when available;
- exact captured excerpt;
- speaker label when used as direct Amy Hood evidence;
- event or domain relevance statement;
- temporal role;
- reviewer and ISO review timestamp;
- a rights and capture note explaining how the excerpt was obtained.

The importer creates an immutable excerpt snapshot, normalizes that snapshot, calculates its SHA-256, and calculates speaker offsets within the stored snapshot. These values prove the integrity of the captured excerpt, not the completeness or immutability of the external webpage. The artifact metadata must preserve this distinction.

If an excerpt is used as direct Amy evidence, the exact quote and relevance passage must both be contained inside the stored Amy Hood speaker segment. If this cannot be established, the evidence is stored as context only.

### 4.3 Evidence roles

Direct Amy evidence gains an explicit mode:

- `event_specific`: Amy Hood directly describes the named decision event.
- `domain_principle`: Amy Hood states a decision principle that applies to the policy domain, while separate decision-time sources establish the event action.

Other evidence roles remain decision-time context, counterevidence, and post-outcome. Post-outcome evidence can support retrospective reporting but cannot participate in policy induction or RAG used by the evaluation.

Research summaries such as Korean `contextBefore` or `contextAfter` fields are reviewer notes. They are not exact source passages and cannot be promoted to direct evidence.

## 5. Policy Release Gate

The release gate evaluates the quality of each policy rather than requiring event-specific Amy speech on every supporting event.

A policy is deployable when it has:

1. one reviewed direct Amy evidence span in the same domain, using either `event_specific` or `domain_principle` mode;
2. at least two reviewed decision-time event records supporting the policy conditions and action;
3. explicit priority order, conditions, guardrails, and reversal signals;
4. a Codex approval record with rationale and timestamp;
5. no sealed holdout or post-outcome evidence in its induction evidence;
6. internally resolvable evidence and event identifiers.

A contrasting event remains desirable but is no longer a universal release blocker. When no reviewed contrasting event exists, the policy must have explicit reversal signals and cannot receive `high` confidence. This prevents the system from manufacturing private rejection decisions merely to satisfy a structural gate.

Confidence is assigned as follows:

- `high`: full-text direct evidence, multiple supporting events, and reviewed contrasting evidence;
- `medium`: reviewed direct evidence, at least two supporting events, and explicit guardrails and reversal signals;
- `low`: insufficient for release and retained for review only.

The active release must contain at least one `medium` or `high` policy in every required domain.

## 6. Focused Five-Domain Dataset

The first complete release uses the following selected events.

| Domain | Selected events | Intended evidence use |
|---|---|---|
| M&A | LinkedIn 2016, Activision Blizzard 2022, Nuance 2021 | acquisition selection, value creation, financing and dilution guardrails |
| AI and cloud CapEx | Cloud capacity scale 2022, AI capacity and Opex pivot 2023, AI capacity sourcing 2024 | demand-led capacity investment with operating-cost discipline |
| Pricing and monetization | Copilot pricing 2023, Teams unbundling 2023 | value-based monetization constrained by adoption and regulatory conditions |
| Cost efficiency | Workforce reset 2023, Phone restructure 2015, Transformation 2026 | reallocation toward priorities, structural reduction, impairment and exit boundaries |
| Shareholder return and risk | Buyback 2013, Buyback 2024 | durable shareholder return constrained by liquidity and strategic investment needs |

The uploaded web research contributes the Nuance and Buyback 2013 Amy Hood excerpts and decision-time context for the remaining selected events. Existing canonical sources are reused rather than duplicated.

The following sealed holdouts remain excluded from the release and index:

- Microsoft 365 pricing 2021;
- Buyback 2021;
- every other candidate listed in the active sealed holdout manifest.

Holdout exclusion is enforced by identifier and source association before policy approval and again before release activation.

## 7. Memory Release and Retrieval

There is one active formal memory release. It contains the approved events, five domain policies, their supporting evidence references, and any approved reflections that meet the release gate.

There is one active BGE-M3 index built from that release at port `8081`. Advisor chat and Evaluation v4 use the same hybrid retriever and context renderer. The two RAG evaluation arms share the same query result and differ only in projection:

- Policy RAG renders the matched policy, priorities, conditions, guardrails, reversal signals, and compact evidence excerpts.
- Full RAG additionally renders the linked event and approved reflection context.

The E4B model at port `8080` receives the rendered context directly in its prompt. No memory tool calling is introduced.

If the active release or index cannot be verified, retrieval fails, or the pinned query result is invalid, a RAG answer is marked incomplete. The runner must not silently fall back to prompt-only generation.

## 8. Evaluation V4 Calibration

### 8.1 One evaluation pipeline, two stages

Evaluation v4 supports two execution stages in the same schema, runner, storage, grading, and report flow:

- `calibration`: ten reviewed scenarios, two per domain;
- `benchmark`: thirty reviewed scenarios, six per domain.

The calibration bundle is versioned and frozen before execution. Expanding to thirty scenarios creates a new dataset version in the same V4 namespace; it does not create another evaluation track.

### 8.2 Calibration matrix

The ten scenarios are anonymized transfers from non-Microsoft executive decisions. Each domain contains:

- one base or boundary scenario;
- one reversal or adverse-condition scenario.

Each scenario runs once in all four arms:

1. `generic_cfo`;
2. `amy_prompt`;
3. `amy_policy_rag`;
4. `amy_full_rag`.

The first live run therefore produces forty E4B answers. The model, temperature, prompt version, release, index, retrieval configuration, scenario order, and dataset version are pinned in the run manifest.

### 8.3 Public answer contract

Every answer uses the existing V4 structured contract:

- chosen action;
- ordered decision priorities;
- guardrails;
- reversal signals;
- concise rationale.

The public prompt does not reveal the historical executive, company, actual outcome, correct alignment key, experimental arm, or retrieved source identifiers.

### 8.4 Blind grading

Codex receives only a blind grading packet containing the scenario, the candidate answer, and the sealed Amy policy alignment key. It does not receive the arm, model, run order, retrieval trace, or external executive identity.

For each answer, Codex first writes one sentence explaining identity alignment or conflict and then assigns an integer Action Alignment Score from 1 to 10. The forty imported grades are validated and reconciled into one calibration report.

## 9. Calibration Decision Rules

The calibration run is operationally complete only when:

- all forty answers complete without prompt-only fallback;
- all forty blind grades are valid;
- the two RAG arms share one verified retrieval result per scenario;
- no holdout source or post-outcome evidence appears in a generated context.

The run provides a positive directional signal when:

- at least eight of ten queries retrieve a policy from the intended domain;
- RAG materially changes the chosen action or priority order in at least three scenarios;
- the best RAG arm exceeds `amy_prompt` by at least 0.5 mean AAS.

These thresholds decide whether to invest in the full thirty-scenario benchmark. They do not establish statistical significance or Amy Hood replication. Failure is reported as no observed RAG benefit, retrieval mismatch, or context interference rather than being hidden by additional prompt tuning.

## 10. Error Handling and Auditability

- Invalid or incomplete reviewed excerpts remain context-only and cannot satisfy direct Amy evidence.
- Duplicate canonical URLs reuse or supersede an existing source record; they never create parallel identities.
- A holdout collision blocks policy approval and release activation.
- A low-confidence policy cannot satisfy five-domain release coverage.
- A source, release, index, prompt, or scenario hash mismatch blocks the run.
- Model and retrieval failures produce resumable incomplete records; completed answers are not overwritten.
- Partial grading batches cannot become active results.

Every report states the number of `full_text` and `reviewed_excerpt` sources used and explicitly distinguishes excerpt integrity from full-source preservation.

## 11. Testing Strategy

New or significantly modified tests follow the repository TDD rules and include a Test Plan comment before test code.

The focused test set covers:

1. **Happy path:** import reviewed excerpts, approve five policies, activate one release and index, and complete the forty-answer calibration fixture.
2. **Edge case 1:** upgrade a reviewed excerpt to full text without changing source and event identity.
3. **Edge case 2:** accept a domain-principle Amy quote with separate event-specific context evidence.
4. **Edge case 3:** allow a medium-confidence policy without a contrasting event when explicit reversal signals exist.
5. **Failure paths:** reject summaries as direct quotes, reject holdout and post-outcome leakage, reject unresolved evidence, and mark retrieval or model failures incomplete without fallback.

Existing Evaluation v3 outputs and contracts remain unchanged.

## 12. Delivery Sequence

1. Extend the canonical evidence schema and importer for reviewed excerpts and direct-evidence modes.
2. Import and review the selected uploaded research records while reusing existing sources.
3. Rebuild and approve the selected event cards.
4. Generate, validate, and approve exactly five domain policies.
5. Create and activate one verified memory release and BGE-M3 index.
6. Complete the V4 ten-scenario calibration bundle, runner, blind packet, grade import, and report path.
7. Execute forty E4B answers, grade them with Codex, and publish the calibration report.
8. Expand to the frozen thirty-scenario benchmark only if the calibration produces a positive directional signal or reveals a clearly correctable retrieval defect.

## 13. Acceptance Criteria

The scope is complete when all of the following are true:

- the uploaded research has been incorporated into the canonical source and event pipeline without duplicate source identities;
- one approved policy exists for each of the five required domains;
- the active formal release and active BGE-M3 index both cover those five policies;
- the sealed holdouts and post-outcome evidence are absent from policy induction and indexed evaluation context;
- Evaluation v4 calibration produces forty complete E4B answers across the four arms;
- Codex blind grades all forty answers and the project publishes an objective comparison report;
- the report clearly labels the result as behavioral calibration rather than proof of Amy Hood decision replication.

## 14. Out of Scope

- collecting every available Amy Hood source before the calibration run;
- claiming statistical significance from one ten-scenario repetition;
- automatic API-based judge orchestration beyond the validated grade import contract;
- tool calling for memory access;
- replacing or deleting Evaluation v3;
- creating a second PoC memory, index, retriever, or advisor runtime.
