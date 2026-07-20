# Amy Hood Evaluation v4 — Action Alignment Design

**Date:** 2026-07-20  
**Status:** Proposed for user review  
**Branch:** `codex/amy-hood-first-policy-release`  
**Supersedes:** nothing; Evaluation v3 remains immutable  

## 1. Decision

Evaluation v4 measures one construct only:

> When a new decision situation is presented, does the advisor choose an action, priority order, financial guardrails, and reversal conditions that align with Amy Hood's approved decision policies?

The primary metric is **Action Alignment Score (AAS)** on a 1–10 scale. A general CFO competency score is explicitly out of scope. Evaluation v3 questions, answer key, holdout manifest, runs, caches, and reports remain unchanged and readable.

V4 uses 30 open-ended, identity-masked scenarios derived from public decision events involving other prominent CFOs. The historical event supplies realistic facts and constraints; the other CFO's actual action is provenance, not the Amy-correct answer. The sealed scoring key is derived from approved Amy Hood policy memory.

## 2. Why v4 Is Necessary

The first query-dependent v3 run produced the same 90% score for the generic CFO, Amy Prompt, and Policy RAG arms. This rejects v3 as a persona-discrimination benchmark even though the dynamic RAG pipeline itself worked.

The CGMA framework describes broad finance competence across technical, business, people, leadership, and digital skills. Those capabilities are useful professional prerequisites but do not distinguish Amy Hood from another capable CFO. V4 therefore does not reward generic professionalism by itself. See the [AICPA & CIMA CGMA Competency Framework](https://www.aicpa-cima.com/membership/landing/chartered-global-management-accountant-cgma-designation) and [IFAC's CFO role paper](https://www.ifac.org/knowledge-gateway/professional-accountants-business-paib/publications/role-and-expectations-cfo-global-debate-preparing-accountants-finance-leadership).

Open-ended grading introduces judge variance. Research on LLM evaluation supports explicit rubrics and structured form filling, while also warning that uncalibrated judges can be inconsistent. V4 adopts an anchor checklist, blind packets, cached judgments, and a reliability audit. See [G-Eval](https://arxiv.org/abs/2303.16634), [LLM-Rubric](https://aclanthology.org/2024.acl-long.745/), and [CheckEval](https://aclanthology.org/2025.emnlp-main.796/).

## 3. Scope and Non-goals

### In scope

- Expand approved Amy policy memory from one policy to at least five, covering all five decision domains.
- Preserve a reviewed counterexample or policy-reversal case for every policy.
- Build and freeze 30 external-event scenarios, six per domain.
- Generate open-ended answers for four experimental arms and five repetitions.
- Grade every answer with a blind, anchored Codex/API judge.
- Produce domain, scenario, arm, lift, stability, retrieval, and judge-reliability reports.
- Add a separate v4 review and results surface without changing v3 behavior.

### Out of scope

- Testing general accounting knowledge, arithmetic, reporting standards, or generic CFO quality.
- Treating another CFO's actual action as the Amy Hood answer.
- Adding external CFO sources to Amy's RAG index.
- Modifying or deleting v3 artifacts.
- Claiming that a high score proves psychological or personal replication of Amy Hood.

## 4. Policy Coverage Gate

Scenario authoring cannot be frozen until a new active memory release contains at least one approved policy in each domain:

| Domain | Target decision-policy hypothesis | Status at design time |
|---|---|---|
| `m_and_a` | Sequence affordability, strategic asset protection, integration, and monetization under deal uncertainty | Evidence review required |
| `ai_cloud_capex` | Scale capacity against verified demand and urgency while constraining operating expense; reverse on weakening demand or changed economics | Approved policy exists |
| `pricing_monetization` | Expand price and packaging after measured customer value and usage; narrow or delay when adoption evidence weakens | Evidence review required |
| `cost_efficiency` | Protect high-priority growth capacity while removing duplicate or low-return expense and enforcing milestones | Evidence review required |
| `shareholder_return_risk` | Preserve strategic investment and liquidity capacity, sustain the dividend, and keep buybacks conditional | Evidence review required |

These are hypotheses, not pre-approved conclusions. Each additional policy must pass the existing evidence, reflection, policy, review, release, holdout, and measured-index gates.

Each policy requires:

- at least two supporting Amy Hood decision events;
- at least one material contrasting or reversal event on the same decision axis;
- at least one direct Amy Hood quotation per event;
- decision-time evidence separated from post-outcome evidence;
- explicit applicability, non-applicability, priority order, guardrails, action, exceptions, and reversal signals;
- human/Codex review that rejects unsupported claims rather than repairing them silently.

Existing raw and normalized sources are used first. Web collection is permitted only for a missing domain or missing contrast and must enter through the existing source registry and evidence gates.

## 5. External CFO Scenario Dataset

### 5.1 Composition

V4 contains 30 scenarios: five domains × six scenarios.

Within each domain:

- two **base-transfer** scenarios preserve the approved policy's applicability conditions;
- two **boundary** scenarios change one gating variable while keeping the remaining facts plausible;
- two **reversal** scenarios activate a policy reversal signal or a material counterexample.

This creates difficult situations without answer-choice tricks. The trap is a professionally defensible action that applies the right principle at the wrong time, in the wrong order, without a guardrail, or after a reversal signal has appeared.

### 5.2 Source standard

Every scenario maps to a real, public event involving a CFO or finance leader outside Microsoft. Candidate sources include earnings calls, investor-day presentations, regulatory filings, official interviews, and company announcements.

Required provenance:

- one primary decision-time source containing the CFO's statement or attributable finance-leadership rationale;
- a second source for material facts when available;
- a decision cutoff that excludes later success or failure;
- the actual historical action retained only in the sealed provenance map;
- no source reused as Amy policy training evidence.

No individual CFO supplies more than two scenarios, and each domain uses at least three different organizations. This prevents v4 from becoming a test of one external executive's style.

### 5.3 Identity masking and syntheticization

The public scenario removes person, company, product, exact date, and distinctive quoted language. Financial ratios, capacity states, regulatory constraints, and decision boundaries are preserved. Exact dollar values may be rescaled only when all dependent ratios remain equivalent and a reviewer confirms that the expected Amy action does not change.

The scenario must describe only information available at the decision cutoff. Neither the generation model nor the judge receives the external CFO's identity, actual action, or eventual outcome.

### 5.4 Public response contract

Each scenario asks the model to return structured JSON:

```json
{
  "action": "one concrete decision",
  "priorities": ["first", "second", "third"],
  "guardrails": ["financial or strategic boundary"],
  "reversalSignals": ["observable condition that would change the action"],
  "rationale": "brief causal explanation"
}
```

The prompt does not mention the mapped Amy policy, its canonical vocabulary, the source event, or the expected answer.

## 6. Sealed Scenario Key

Every public scenario has two sealed records.

### Provenance record

```json
{
  "scenarioId": "AAS-MA-01",
  "externalEventId": "external-event-hash",
  "sourceIds": ["source-hash-1", "source-hash-2"],
  "decisionCutoff": "YYYY-MM-DD",
  "actualHistoricalAction": "provenance only",
  "outcomeEvidenceIds": []
}
```

### Amy alignment key

```json
{
  "scenarioId": "AAS-MA-01",
  "policyId": "approved-policy-id",
  "scenarioVariant": "base_transfer",
  "expectedAction": "Amy-policy-consistent action under these facts",
  "priorityOrder": ["first", "second", "third"],
  "guardrails": ["must preserve"],
  "reversalSignals": ["must monitor"],
  "acceptableVariants": ["equivalent action wording"],
  "identityConflicts": ["actions that contradict the mapped policy"],
  "referenceRationale": "why the policy transfers to this event"
}
```

The external historical action never enters the judge packet. It is retained to audit scenario realism, not to bias the Amy alignment score.

## 7. Action Alignment Judge

### 7.1 Blind input

The judge sees only:

1. the anonymized scenario;
2. the candidate response;
3. the sealed Amy alignment key;
4. the fixed scoring rubric.

It does not see the experimental arm, model name, run order, retrieval trace, external CFO identity, external historical action, or other candidates' responses.

### 7.2 Reason-first protocol

The canonical judge operation is a mandatory two-stage reason-first process:

1. The rationale stage receives no numeric score scale and generates exactly one sentence explaining the strongest alignment or conflict.
2. The scoring stage receives the frozen rationale plus the same scenario, candidate response, alignment key, anchor checklist, and numeric bands, then assigns an integer from 1 to 10.

For the initial Codex workflow the two stages are performed in order and stored as one atomic grade record with `rationale` before `score`. The API implementation uses two calls with separate prompt hashes. Cached rationales and grades are immutable and pinned to judge prompt and model hashes.

### 7.3 Anchor checklist

The judge checks four components before selecting a band:

- **Action:** is the concrete decision consistent with `expectedAction` or an acceptable variant?
- **Priority:** does the response preserve the policy's decision sequence?
- **Guardrails:** does it protect the required financial and strategic boundaries?
- **Reversal:** does it identify observable conditions that would change the action?

The final output remains one AAS, not four public sub-scores.

| AAS | Operational anchor |
|---:|---|
| 10 | Action, priority order, guardrails, and reversal signals all align. |
| 8–9 | Core action and order align; one secondary boundary or reversal detail is missing. |
| 6–7 | Directionally compatible but generic, weakly ordered, or missing material constraints. |
| 5 | Neutral or insufficient to establish alignment or conflict. |
| 3–4 | Professionally plausible but conflicts with Amy's priority, boundary, or timing. |
| 1–2 | Directly contradicts the policy's core action or applies it after a clear reversal signal. |

A grade is invalid if the rationale is empty, mentions an arm/model identity, uses outcome knowledge, or contradicts the numeric band.

## 8. Experimental Design

The four arms remain:

1. Generic CFO prompt, no RAG
2. Amy Main Prompt, no RAG
3. Amy Main Prompt + Policy RAG
4. Amy Main Prompt + Full RAG

Each arm answers 30 scenarios in five repetitions: 600 candidate answers total. All arms in a repetition share one deterministic scenario order; the order changes by a pinned seed between repetitions. Temperature, model, prompt version, memory release, index, retrieval configuration, scenario set, and judge version are pinned in every run.

The economical execution sequence is:

1. run 30 × 4 × 1 and grade 120 answers;
2. apply the discrimination gate without editing the frozen run;
3. if the benchmark is viable, execute the remaining four repetitions;
4. if rejected, version a new scenario set rather than overwriting v4.0.0.

## 9. Metrics and Decision Gates

### Primary metrics

- mean AAS by arm;
- paired AAS lift for Amy Prompt, Policy RAG, and Full RAG;
- per-domain AAS and lift;
- base/boundary/reversal AAS;
- within-scenario five-run standard deviation;
- percentage of answers scoring 8–10, 5, and 1–4.

### Retrieval diagnostics

- correct mapped-policy retrieval rate;
- no-match rate;
- wrong-domain policy injection rate;
- Policy/Full cache-key agreement;
- evidence and context-token rates.

### Judge reliability audit

A stratified 10% sample is regraded blind after packet reordering. The audit must achieve:

- at least 85% agreement within one AAS point;
- mean absolute score difference no greater than 1.0;
- no systematic arm-label effect, because labels are absent from packets.

Disagreements greater than two points require Codex adjudication and a recorded rubric finding; historical grades are not silently replaced.

### Benchmark viability gate

After one repetition, the benchmark is rejected when any condition holds:

- generic CFO mean AAS is 8.0 or higher;
- Amy Prompt, Policy RAG, and Full RAG all differ from generic CFO by less than 0.5 AAS;
- more than 30% of scenarios show a ceiling in all four arms;
- a domain has fewer than four valid scenarios after grading;
- judge reliability fails.

### Persona evidence gate after five repetitions

The PoC may claim measurable Amy-policy alignment only when:

- the best Amy arm has mean AAS at least 8.0;
- its paired lift over generic CFO is at least 1.0 AAS;
- every domain mean is at least 7.0;
- no domain has negative lift;
- scenario-level stability and judge reliability gates pass.

The permitted claim is “the advisor shows measurable alignment with the approved public-evidence Amy Hood policies on this benchmark.” It is never “Amy Hood's decisions have been perfectly replicated.”

## 10. Data and Runtime Boundaries

New artifacts live under a versioned tree:

```text
evaluation/v4/
  public/
    scenarios.json
    reviews.json
  sealed/
    scenario-key.json
    external-event-map.json
    judge-rubric.json
  sources/
    registry.json
    raw/
    normalized/
  runs/
  retrieval-cache/
  judge-packets/
  grades/
  reports/
```

The Amy memory index builder may read only the active Amy memory release and Amy source registry. It must reject paths under `evaluation/v4/sources`, `sealed`, `judge-packets`, and `grades`. Evaluation generation reads public scenarios only. Scoring reads sealed keys only after candidate generation is complete.

V3 routes and artifacts remain available. V4 receives distinct API routes, storage validators, UI labels, and report types.

## 11. UI Design

The existing B Track evaluation area adds separate v3 and v4 entries.

The v4 review page shows anonymized scenario text, domain, variant, review status, source-provenance completion, and alignment-key completion. It never renders sealed expected actions or external identities in the generation view.

The v4 result page shows arm means, paired lifts, domain/variant breakdown, stability, judge reliability, retrieval correctness, and benchmark rejection reasons. It includes run-ID copying and links to immutable run and report artifacts.

## 12. Error Handling

- Fewer than five approved domain policies stops v4 scenario freezing.
- Missing direct evidence, contrast, decision cutoff, or source mapping blocks the affected policy or scenario.
- A sealed identifier in a public scenario fails the build.
- A stale prompt, policy, release, index, scenario, judge, or rubric hash marks the run incomplete.
- RAG errors never fall back to prompt-only within a RAG arm.
- A malformed model answer is retried once, then recorded as failed.
- A malformed or rationale-free grade is retried once, then excluded and marks the experiment incomplete.
- No partial run, grade batch, or report is activated.

## 13. Test Strategy

New and significantly modified test files follow the repository TDD contract: one happy path, exactly three realistic edge cases by default, and failure-path coverage.

Required suites:

- **Policy coverage:** five domains, support/contrast evidence, holdout exclusion, safe release activation.
- **Scenario contract:** 30 reviewed scenarios, 6 per domain, 2 per variant, identity masking, valid sealed mapping.
- **Leakage boundary:** public generation input contains neither provenance nor Amy answer anchors.
- **Judge:** reason-first schema, anchor-band consistency, blind packet construction, stale hash rejection.
- **Runner:** 4 arms × 1/5 repetitions, deterministic ordering, dynamic RAG, resumability, no fallback.
- **Metrics:** paired lift, domain/variant aggregation, ceiling detection, reliability audit, rejection gates.
- **UI/report:** v3 preservation, v4 separation, exact JSON-to-report reconciliation, valid HTML.

Before a five-repetition live run, all unit and integration tests, source gates, policy-memory gates, index calibration, 30-scenario leakage audit, judge calibration sample, type checking, and production build must pass.

## 14. Delivery Sequence

1. Audit the remaining Amy raw events by domain and select the minimum support/contrast set.
2. Generate, validate, review, release, and index five approved policies.
3. Collect external CFO events in the isolated v4 source registry.
4. Author and review 30 anonymized scenarios and sealed mappings.
5. Implement the blind AAS judge packet, grade import, reliability audit, and metrics.
6. Implement v4 runner, API/UI separation, and report reconciliation.
7. Run one-repetition discrimination calibration.
8. If viable, run the remaining four repetitions and issue the final report.

This order prevents scenario keys from defining the Amy policies after the fact and prevents external CFO evidence from contaminating long-term memory.
