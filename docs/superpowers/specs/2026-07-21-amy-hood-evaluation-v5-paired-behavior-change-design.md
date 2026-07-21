# Amy Hood Evaluation V5 — Paired Behavior-Change Benchmark Design

**Date:** 2026-07-21

**Status:** Approved design

**Branch:** `codex/amy-hood-first-policy-release`

**Preserves:** Evaluation V4 calibration and all earlier evaluation artifacts

## 1. Decision

Evaluation V5 is a new, versioned benchmark that measures whether the Amy Hood Decision Advisor changes its recommendation appropriately when a material decision signal changes.

The benchmark contains:

- 15 distinct public CFO decision events;
- two anonymized scenarios per event, for 30 questions total;
- three experiment arms, with the generic CFO arm removed;
- five repetitions per arm;
- 15 runs and 450 candidate responses in one formal benchmark;
- blind, reason-first Action Alignment Score grading;
- pair-level measurement of whether the action changed for the right reason.

V4 remains immutable. V5 is separate because both the scenario contract and the experiment-arm contract change. Reinterpreting the four-arm V4 calibration as a three-arm benchmark would damage historical reproducibility.

## 2. Evaluation Question and Claim Boundary

V5 answers one question:

> Under the same Amy Hood Main Prompt, does query-dependent policy or full-memory RAG improve decision alignment and appropriate behavior change when material business conditions change?

V5 does not contain a generic CFO arm. It therefore cannot establish that the Amy advisor is better than a general CFO advisor. The prior V4 calibration remains historical context but its scores are not pooled with V5.

The strongest permitted positive claim is:

> On 15 paired, identity-masked public decision events, an Amy RAG condition produced more policy-aligned actions and more appropriate responses to changed conditions than the Amy Main Prompt alone.

V5 must not be described as proof that Amy Hood's psychology or decisions have been replicated.

## 3. Architecture Choice

Three approaches were considered:

1. Create Evaluation V5 with its own 30-question, three-arm contract.
2. Add stage-dependent arms to V4, retaining four arms for calibration and three for benchmark.
3. Replace the V4 arm list and scenario structure directly.

The approved choice is **Evaluation V5**. It has a slightly larger implementation footprint but keeps the existing V4 bundle, runner, reports, and historical result interpretable without conditional compatibility rules.

## 4. Benchmark Composition

### 4.1 Domain balance

The 15 events are evenly distributed across the five approved Amy decision-policy domains.

| Domain | Distinct events | Questions |
|---|---:|---:|
| M&A | 3 | 6 |
| AI and cloud capital expenditure | 3 | 6 |
| Pricing and monetization | 3 | 6 |
| Cost efficiency and resource allocation | 3 | 6 |
| Shareholder return and financial risk | 3 | 6 |
| **Total** | **15** | **30** |

Ten events come from the approved V4 calibration provenance. Five new events add one non-overlapping organization and decision to each domain.

### 4.2 Paired scenario structure

Each real event produces one pair:

- **Initial decision (`initial`)**: preserves the material facts and constraints available at the historical decision cutoff.
- **Changed condition (`changed`)**: changes one primary decision signal and, only when causally necessary, one supporting signal. Other facts remain stable.

The model receives each scenario as an independent request. Pair identifiers, phase labels, source identities, actual actions, and expected changes are runtime metadata and never enter the model prompt. Scenario order is independently randomized for each repetition.

The 15 changed-condition scenarios are balanced across three expected response types:

| Expected response type | Count | Meaning |
|---|---:|---|
| `guardrail_adjustment` | 5 | Maintain the broad direction but alter scale, pace, sequencing, or safeguards. |
| `resource_reallocation` | 5 | Change which investment, cost, or cash use receives priority. |
| `pause_or_reverse` | 5 | Pause, reduce, terminate, or materially reverse the original direction. |

This balance prevents the model from solving every second scenario by automatically reversing the first answer.

### 4.3 Difficulty principle

The changed scenario is not made difficult by withholding basic facts or adding arbitrary noise. Its difficulty comes from a professionally plausible conflict between priorities. The strongest distractor is an action that would be reasonable for a capable CFO but applies the Amy policy:

- in the wrong sequence;
- without a required guardrail;
- after a reversal signal has appeared; or
- too aggressively when only a bounded adjustment is justified.

## 5. External Event Provenance

### 5.1 Existing events

The ten V4 events remain the starting evidence set:

- Salesforce–Slack acquisition;
- Adobe–Figma transaction termination;
- Alphabet AI infrastructure investment;
- Meta AI capital expenditure increase;
- Netflix paid-sharing monetization;
- Spotify Premium price increase;
- Intel cost reduction and capital reduction;
- Meta efficiency and focused rehiring;
- Apple repurchase authorization and dividend increase;
- Salesforce's first repurchase authorization.

Their provenance must be revalidated for V5 pair construction; approval in V4 does not authorize invention of changed-condition facts.

### 5.2 Five new, non-overlapping events

The following researched events are approved as V5 candidates. They do not duplicate any V4 company or decision event.

| Domain | Event | Decision-time basis |
|---|---|---|
| M&A | IBM acquisition of Red Hat, 2018–2019 | Strategic hybrid-cloud expansion, a large cash purchase funded with cash and debt, credit discipline, suspended repurchases, and preservation of Red Hat's independence. |
| AI/cloud CapEx | Amazon 2024 AWS and generative-AI capital expansion | Strong demand, larger and longer customer commitments, upfront infrastructure spending, depreciation, monetization signals, and concurrent cost discipline. |
| Pricing/monetization | Costco 2024 membership-fee increase | A delayed increase after COVID and inflation pressure, member value, renewal behavior, and reinvestment in prices, wages, and experience. |
| Cost efficiency | Disney 2023 cost and content restructuring | A $5.5 billion cost target, severance, content removal and impairment, lower content volume, and protection of differentiated content. |
| Shareholder return/risk | Cisco FY2022 dividend increase and added repurchase authorization | Confidence in ongoing cash flow, a $15 billion added authorization, discretionary deployment, and continued organic and inorganic investment. |

Candidate source set:

- [IBM completes the Red Hat acquisition](https://www.ibm.com/investor/news/ibm-completes-acquisition-of-red-hat)
- [IBM 2019 fourth-quarter results with CFO commentary](https://www.ibm.com/investor/att/pdf/IBM-4Q19-Earnings-Press-Release.pdf)
- [Amazon Q1 2024 official earnings-call transcript](https://s2.q4cdn.com/299287126/files/doc_financials/2024/q1/Q124-Amazon-Transcript-FINAL.pdf)
- [Costco official membership-fee announcement](https://investor.costco.com/news/news-details/2024/Costco-Wholesale-Corporation-Reports-June-Sales-Results-and-Announces-Quarterly-Cash-Dividend-and-Plans-for-Membership-Fee-Increase/default.aspx)
- [Costco Q4 2024 attributable CFO call transcript](https://www.fool.com/earnings/call-transcripts/2024/09/26/costco-wholesale-cost-q4-2024-earnings-call-transc/)
- [Disney Q2 FY2023 official earnings-call transcript](https://investors.thewaltdisneycompany.com/files/doc_events/2023/05/q2-fy23-earnings-transcript.pdf)
- [Cisco Q2 FY2022 official results and CFO statement](https://investor.cisco.com/news/news-details/2022/Cisco-Reports-Second-Quarter-Earnings-2c5e20c5b/default.aspx)

Costco's decision announcement is primary, while the currently identified CFO transcript is attributable secondary evidence. That limitation must remain visible in provenance metadata rather than being silently upgraded to a primary source.

### 5.3 Anti-hallucination requirements

Every event requires a sealed provenance record containing:

- canonical source URLs and source quality;
- actual organization, CFO or finance leader, and event identity;
- decision cutoff;
- attributable CFO statement or finance-leadership rationale;
- actual historical action;
- the decision-time facts used in the initial scenario;
- the exact facts intentionally changed in the second scenario;
- a distinction between source fact and author inference;
- reviewer identity and review timestamp.

The later outcome may be retained for audit but never enters scenario authoring, RAG retrieval, model input, or the judge packet. A missing fact is not completed from memory. It is either sourced, explicitly labeled as a designed counterfactual, or the event fails review.

## 6. Identity Masking

Public scenarios remove or generalize:

- company, executive, product, and target names;
- exact dates;
- distinctive quotation language;
- famous transaction amounts or combinations of facts that immediately identify an event.

Decision-relevant economics remain intact:

- transaction scale relative to revenue, cash, or debt capacity;
- financing mix and credit constraints;
- demand, utilization, renewal, and pipeline direction;
- capital intensity, depreciation, and cash-flow timing;
- customer impact, integration requirements, regulatory feasibility, and liquidity needs.

An exact dollar amount may be replaced by a ratio or bounded description only when the financial materiality is preserved. The sealed record retains the original amount and documents the transformation.

The public dataset may store `pairId` for analysis, but the runner sends only `title`, `situation`, and `decisionQuestion` to the generation model. The judge receives pair metadata only for the separate pair-level assessment, after individual blind grades are complete.

## 7. Data Contracts and Artifact Boundaries

V5 uses version `5.0.0` and a benchmark-only stage. Proposed artifact layout:

```text
evaluation/v5/
  public/
    scenarios.json
    reviews.json
  sealed/
    event-provenance.json
    scenario-keys.json
    pair-keys.json
    manifest.json
  runs/
    <experiment-group-id>/
      <run-id>.json
  judge/
    packets/
    grades/
    pair-grades/
  reports/
    <experiment-group-id>.json
```

### 7.1 Public scenario

```json
{
  "id": "AAS-V5-AI-03-B",
  "pairId": "AAS-V5-AI-03",
  "domain": "ai_cloud_capex",
  "phase": "changed",
  "title": "Anonymous infrastructure capacity decision",
  "situation": "Decision-time facts only",
  "decisionQuestion": "Concrete CFO recommendation request"
}
```

`phase` and `pairId` are stored for validation and reporting but are not rendered into model input.

### 7.2 Sealed alignment key

Each scenario key contains:

- mapped approved Amy policy ID;
- expected action and acceptable variants;
- ordered top-three priorities;
- required guardrails;
- reversal signals;
- identity conflicts;
- reference rationale.

Each pair key additionally contains:

- initial and changed scenario IDs;
- expected response type;
- primary and optional supporting changed signals;
- expected action delta;
- invariants that should not change;
- pair-level grading anchors.

### 7.3 Freeze contract

The manifest hashes the public scenarios, reviews, provenance, scenario keys, pair keys, active Main Prompt, active memory release, measured index, and retrieval configuration. Any mismatch blocks launch or resume. A corrected dataset receives a new version and manifest; the frozen V5 result is never overwritten.

## 8. Experiment Arms and Runtime

V5 has exactly three arms:

1. `amy_prompt` — Amy Main Prompt and scenario only;
2. `amy_policy_rag` — Main Prompt plus query-dependent approved policy context;
3. `amy_full_rag` — Main Prompt plus query-dependent policy, event, and reflection context.

The generic CFO arm is not created, queued, rendered, or included in V5 report calculations.

All arms use the same:

- Gemma 4 E4B generation endpoint on port 8080;
- BGE-M3 embedding endpoint on port 8081 for RAG arms;
- model sampling configuration and structured response contract;
- scenario wording;
- prompt version;
- memory release and measured index;
- maximum context budget.

There is no tool calling. The shared retrieval engine resolves relevant context before inference and injects the actual retrieved content. External benchmark-event sources, provenance, actual historical actions, and sealed keys are never indexed in Amy memory.

Five repetitions create 15 runs and 450 expected answers:

```text
30 scenarios × 3 arms × 5 repetitions = 450 answers
```

Each request is stateless. Every repetition uses a pinned random-order seed, contains each scenario exactly once per arm, and changes the order between repetitions.

## 9. Generation Response Contract

Each candidate returns structured JSON:

```json
{
  "action": "one concrete decision",
  "priorities": ["first", "second", "third"],
  "guardrails": ["financial or strategic boundary"],
  "reversalSignals": ["observable condition that would change the action"],
  "rationale": "brief causal explanation"
}
```

The schema is identical across arms. Invalid structured output is retained as raw diagnostic evidence but is not silently converted into a successful answer.

## 10. Blind Grading

### 10.1 Individual Action Alignment Score

The judge receives only:

1. the anonymized scenario;
2. the candidate response;
3. the sealed Amy alignment key;
4. the fixed rubric.

It does not see the arm, model, run order, retrieval trace, external event identity, actual historical action, outcome, or other answers.

The judge first writes exactly one sentence identifying the strongest alignment or conflict. It then assigns an integer **Action Alignment Score (AAS)** from 1 to 10 using four anchors:

- concrete action;
- priority order;
- guardrails;
- reversal signals.

### 10.2 Pair-level behavior change

After both individual grades are fixed, a separate blind pair grader receives the two anonymized scenarios, their two responses, and the sealed pair key. **Behavioral Transition Accuracy** is successful only when:

- the changed response moves in the expected direction;
- its rationale connects the movement to the deliberately changed signal;
- facts marked as invariant are not invented or distorted;
- the response does not overreact with a full reversal when only a bounded change is warranted;
- the response does not mechanically preserve the initial action after a material reversal signal.

The pair grader stores a one-sentence rationale before the binary result. Individual AAS and pair accuracy remain separate metrics.

## 11. Metrics and Success Gates

### 11.1 Primary metrics

- mean AAS by arm;
- paired AAS lift for Policy RAG minus Amy Prompt;
- paired AAS lift for Full RAG minus Amy Prompt;
- Full RAG minus Policy RAG as an exploratory comparison;
- Behavioral Transition Accuracy by arm;
- changed-signal citation rate;
- domain and expected-response-type results;
- per-scenario and per-arm variance across five repetitions.

Paired AAS differences use the same scenario and repetition. The report includes a 95% confidence interval for each primary lift. A confidence interval containing zero is reported as directional evidence, not a stable advantage.

### 11.2 Retrieval diagnostics

- mapped-policy retrieval rate;
- no-match rate;
- wrong-domain policy rate;
- Policy/Full shared-cache agreement;
- evidence attachment rate;
- retrieval-context token count.

### 11.3 Formal success gate

V5 passes only when all of the following hold:

- at least one RAG arm has mean AAS of 7.0 or higher;
- that RAG arm improves over Amy Prompt by at least 0.5 AAS;
- its Behavioral Transition Accuracy is at least 75%;
- its changed-signal citation rate is at least 80%;
- wrong-domain policy retrieval is no greater than 5%;
- at least 98% of the 450 expected answers complete successfully;
- the arm-level standard deviation across five repetition means is no greater than 1.0 AAS.

Passing the numeric gate authorizes a stronger evidence review or product-oriented pilot. It does not authorize a replication claim or unattended deployment.

## 12. Execution Flow

1. Revalidate the ten V4 event records for paired authoring.
2. Register and normalize the five researched external event records.
3. Author and identity-mask 15 initial scenarios.
4. Author 15 controlled changed-condition scenarios and pair keys.
5. Review provenance, transformations, alignment keys, response-type balance, and identity leakage.
6. Freeze the V5 public and sealed bundle.
7. Resolve and pin the E4B model, BGE-M3 model, Main Prompt, memory release, index, retrieval configuration, and judge versions.
8. Launch 15 runs and generate 450 answers.
9. Build and blind individual judge packets, then grade AAS.
10. Build and blind pair packets, then grade behavior change.
11. Compute metrics, confidence intervals, retrieval diagnostics, and the formal gate.
12. Generate machine-readable results and a Korean-first, English/Korean-term HTML report.

The benchmark runs all five repetitions directly. It does not introduce a separate one-repetition calibration track.

## 13. Failure Handling and Resumption

- A stale bundle or runtime hash blocks launch and resume.
- Missing approval, provenance, scenario key, or pair key blocks freezing.
- A RAG arm with empty retrieval context fails explicitly; it is not downgraded to the Prompt arm.
- Endpoint failures mark the run `incomplete` and retain completed answers.
- Retry addresses only missing or failed scenario keys and never overwrites a valid answer.
- Invalid model JSON preserves raw output and a parse error but produces no gradeable candidate.
- An experiment with fewer than 441 valid answers fails the 98% completion gate.
- Formal success is not calculated until every gradeable answer has an individual grade and every complete pair has a pair grade.
- Reports distinguish generation failure, retrieval failure, parse failure, missing grade, and benchmark failure.

## 14. TDD and Verification

New or significantly modified V5 test files begin with the required Test Plan comment.

### Happy Path — exactly one

1. A frozen 30-question bundle launches three arms over five repetitions, produces 15 runs and 450 complete structured answers, then generates individual and pair metrics.

### Edge Cases — exactly three by default

1. Public identity-masked scenarios load correctly while sealed real-event identities remain unavailable to the generation path.
2. Different repetition seeds change scenario order while each run still contains every scenario exactly once.
3. Prompt runs contain no retrieval context, while Policy and Full runs receive query-dependent context from the shared retrieval engine with the correct layer limits.

### Failure Paths

- reject stale manifests and runtime artifacts;
- reject unapproved scenarios, missing provenance, missing scenario keys, and missing pair keys;
- fail a RAG answer safely when the embedding or retrieval endpoint fails;
- retain raw output and reject grading when model JSON is invalid;
- prevent partial or duplicated writes during targeted resume.

Implementation completion requires focused V5 tests, the full relevant test suite, lint, and production build to pass. Live benchmark completion additionally requires all runs, grades, metrics, and the HTML report to be reproducible from frozen hashes.

## 15. Deliverables

- a new V5 shared schema and validators;
- a reviewed 15-event provenance set;
- a frozen 30-question public scenario bundle;
- sealed scenario and pair keys;
- a three-arm, five-repetition runner using the shared dynamic RAG engine;
- blind individual and pair grading workflows;
- machine-readable experiment and diagnostic results;
- a detailed nontechnical HTML benchmark report;
- tests covering the approved happy path, three realistic edge cases, and failure paths.

## 16. Explicit Non-goals

- no generic CFO arm in V5;
- no modification or deletion of V4 data, runs, or reports;
- no external benchmark source in Amy's RAG index;
- no outcome leakage;
- no tool calling;
- no new UI page unless separately designed;
- no automatic claim that high alignment equals Amy Hood replication.
