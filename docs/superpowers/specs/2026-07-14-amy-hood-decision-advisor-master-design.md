# Amy Hood Decision Advisor Master Design

**Date:** 2026-07-14  
**Status:** Approved for implementation planning  
**Track:** B Track — Public-Evidence Persona  
**Primary runtime:** Gemma 4 local, 16,384-token context  
**Comparison runtime:** GPT-5-mini after the local pipeline passes its gate

## 1. Objective

Build an **Amy Hood Decision Advisor** that derives publicly observable decision criteria, priority order, conditions, exceptions, and reversal signals from Amy Hood's public record, then applies that decision policy to new financial and strategic situations as actionable CFO advice.

The system is not an identity replica and must not claim access to Amy Hood's private thoughts or undisclosed Microsoft decisions. Its defensible target is:

> Reproduce Amy Hood's publicly observable decision process within bounded CFO domains, and demonstrate that this process produces advice measurably different from a generic CFO baseline.

The product surface is a CFO advisor. Behavioral prediction is an evaluation method, not the product's primary purpose.

## 2. Success Definition

The project succeeds only when all of the following are true:

1. Public sources are converted into reviewed decision events with direct Amy Hood evidence and contemporaneous context.
2. Cross-event reflections produce conditional policies with explicit boundaries and counterexamples.
3. The online advisor retrieves and applies relevant policies, events, and counterexamples without exceeding Gemma 4's context budget.
4. A sealed evaluation shows Amy-specific improvement over a generic CFO prompt.
5. Every answer remains traceable internally to immutable source, event, policy, prompt, memory, model, and evaluation versions.

### 2.1 Engineering acceptance targets

- Generic CFO evaluation v3 score: **70 or lower**.
- Amy Main Prompt lift over generic CFO: **+15 points or more**.
- Three-layer RAG lift over Amy Main Prompt: **+5 points or more**.
- Five-run decision consistency: **85% or higher**.
- Choice-reason mismatch: **0 cases**.
- Holdout leakage: **0 cases**.
- Evidence faithfulness: **90% or higher**.
- If the generic CFO scores 80 or higher, reject the question set as insufficiently discriminative.

These are project acceptance targets, not universal thresholds claimed by the cited research.

## 3. Research Basis

The design adopts the following findings without overstating them:

1. **Rich qualitative evidence is more useful than shallow persona descriptors.** Park et al. used qualitative interview transcripts to simulate 1,052 individuals and reported 85% of participants' own two-week test-retest accuracy on the General Social Survey. The result supports rich individual evidence and a behavioral baseline; it does not imply 85% replication of a whole person.  
   Source: [Generative Agent Simulations of 1,000 People](https://arxiv.org/abs/2411.10109)

2. **Memory, reflection, and planning are separable and jointly important.** Generative Agents stores observations, synthesizes higher-level reflections, and retrieves them for planning; the paper's ablation found each component contributed to believable behavior.  
   Source: [Generative Agents: Interactive Simulacra of Human Behavior](https://arxiv.org/abs/2304.03442)

3. **Persona wording alone is not a reliable performance mechanism.** A systematic study across 162 roles, four model families, and 2,410 factual questions found that persona system prompts did not consistently improve objective performance.  
   Source: [When "A Helpful Assistant" Is Not Really Helpful](https://arxiv.org/abs/2311.10054)

4. **Selecting discriminative examples matters.** PICLe uses a likelihood-ratio-based example selection method to elicit target persona behavior, supporting selective retrieval over indiscriminate context stuffing.  
   Source: [PICLe](https://proceedings.mlr.press/v235/choi24e.html)

5. **Persona memory use should be diagnosed in stages.** Memory-Driven Role-Playing evaluates Anchoring, Selecting, Bounding, and Enacting, and reports that a structured memory prompt can allow a small model to approach much larger models on its benchmark.  
   Source: [Memory-Driven Role-Playing](https://aclanthology.org/2026.findings-acl.1175/)

6. **RAG evaluation must separate retrieval and generation failures.** ARES evaluates context relevance, answer faithfulness, and answer relevance. RAGAS similarly separates focused retrieval, faithful use, and generation quality.  
   Sources: [ARES](https://aclanthology.org/2024.naacl-long.20/), [RAGAS](https://aclanthology.org/2024.eacl-demo.16/)

7. **Persona evaluation must cover diverse, persona-relevant situations.** PersonaGym uses dynamic, decision-theoretic evaluation and reports that larger or newer models do not automatically achieve better persona fidelity.  
   Source: [PersonaGym](https://aclanthology.org/2025.findings-emnlp.368/)

## 4. Architectural Decision

Use a **policy-first hybrid architecture** implemented as a deterministic, role-separated workflow orchestrator.

```text
Public sources
  -> evidence spans
  -> reviewed decision events
  -> cross-event reflections
  -> conditional decision policies
  -> versioned three-layer memory
  -> thin Main Prompt + selective RAG
  -> Amy Hood-style CFO advice
  -> evidence and policy audit
```

### 4.1 Rejected primary approaches

#### Raw-source RAG first

This is easy to implement but forces the model to reinterpret long source text on every question. The current deterministic keyword top-1 evaluation retrieved an average of more than 11K input tokens for past-memory questions and produced a negative RAG lift. Raw sources remain provenance, not the primary runtime memory representation.

#### Fine-tuning first

Twenty to fifty reviewed events are insufficient for safe identity-specific fine-tuning. Errors would become difficult to inspect and update. Fine-tuning or distillation may be tested after at least 100 reviewed events and after the policy-first system establishes a stable benchmark.

## 5. Orchestration Model

The architecture has multi-agent-like role separation but does not use autonomous agent debate for the PoC.

```text
Source Collector
  -> Event Extractor
  -> Evidence Verifier
  -> Policy Inducer
  -> Memory Indexer
  -> Decision Advisor
  -> Evaluation Judge
```

Each worker receives a typed input and must produce a validated JSON result. Workers cannot negotiate freely, modify prior artifacts, or decide which holdout data they may access. The orchestrator owns sequencing, permissions, retries, persistence, and version pinning.

### 5.1 Reasons for deterministic orchestration

- Lower Gemma 4 context and latency cost.
- Reproducible outputs and resumable jobs.
- Clear localization of source, extraction, policy, retrieval, generation, and judging failures.
- Enforceable holdout boundaries.
- No propagation of one worker's unsupported inference as another worker's fact.

### 5.2 Artifact lifecycle

```text
candidate -> review_required -> approved -> indexed -> superseded
```

No artifact silently transitions to `approved`. Approval requires automated validation and a recorded human review.

## 6. Independent Workflows

### 6.1 Offline policy-building workflow

```text
Source discovery
  -> allowed collection
  -> immutable raw source
  -> normalization and speaker segmentation
  -> evidence span extraction
  -> decision event extraction
  -> evidence review
  -> cross-event reflection
  -> counterexample search
  -> policy induction
  -> human approval
  -> immutable memory release
```

### 6.2 Online advisor workflow

```text
User situation
  -> DecisionContext normalization
  -> policy retrieval
  -> reflection retrieval
  -> supporting event retrieval
  -> counterexample retrieval
  -> option comparison
  -> DecisionPlan
  -> first-person CFO advice
  -> internal provenance audit
```

### 6.3 Sealed evaluation workflow

```text
Evaluation v3 bundle
  -> four experiment arms
  -> five repetitions per arm
  -> objective and blinded subjective grading
  -> lift, consistency, grounding, and failure analysis
```

Evaluation data never enters the offline policy-building or online retrieval indexes.

## 7. Evaluation-First Contract

The existing 15-question v2 set remains a regression and pipeline smoke test. It cannot support future Amy-specific fidelity claims because the generic CFO baseline achieved the maximum objective score.

Evaluation v3 becomes the official behavioral benchmark and its schema, arms, scoring, leakage rules, and rejection thresholds are fixed before the 20-event dataset is used for development.

### 7.1 Twenty-event split

| Split | Events | Permitted use |
|---|---:|---|
| Train | 12 | Event reflection, policy induction, Main Prompt generation, runtime index |
| Development | 4 | Prompt, retrieval, reranking, and error-analysis tuning |
| Holdout | 4 | Sealed evaluation only |

The split is stratified across:

- M&A.
- AI and cloud CapEx.
- Pricing and monetization.
- Cost efficiency.
- Shareholder return and risk management.

Holdout source IDs, event IDs, raw documents, cards, answers, and post-outcome evidence live under a separate root. Prompt builders, policy builders, and runtime indexers fail if any holdout ID is observed.

### 7.2 Evaluation v3 composition

| Category | Type | Count | Purpose |
|---|---|---:|---|
| Amy-specific discrimination | Multiple choice | 10 | Distinguish Amy's ordering from generic CFO quality |
| Temporal event holdout | Multiple choice | 10 | Predict unseen historical decisions without outcome leakage |
| Counterfactual condition pairs | Multiple choice | 6 | Verify that a material condition can reverse the decision |
| New CFO advisory scenarios | Subjective | 4 | Test policy transfer and actionable advice |

All multiple-choice options must be financially plausible. Distractors differ through applicability, priority order, boundary conditions, or reversal signals rather than obvious factual errors.

### 7.3 Score dimensions

- Decision selection: 40 points.
- Criteria and priority alignment: 20 points.
- Condition-change sensitivity: 15 points.
- Evidence faithfulness and bounding: 15 points.
- Actionability of CFO advice: 10 points.

Choice and explanation are graded separately. A reason-choice mismatch cannot receive full credit and triggers a single model retry during execution.

### 7.4 Experiment arms

1. Generic CFO Prompt.
2. Amy Main Prompt.
3. Amy Main Prompt + policy RAG.
4. Amy Main Prompt + policy, reflection, event, and counterexample RAG.

All arms pin the same model build, temperature, question bundle, grader contract, and repetition count. Each arm runs five times.

## 8. Source Collection Design

Use registry-first, event-directed collection over whitelisted and manually approved sources. Do not crawl the general web or allow an LLM to select unrestricted URLs.

### 8.1 Collection targets

- Initial event candidates: approximately 30.
- Discovered URLs: approximately 100 to 150.
- Collected primary and contextual documents: approximately 50 to 80.
- Approved direct Amy Hood evidence spans: at least 40.
- Approved decision events: exactly 20 for the first release.
- Minimum source-event links: two per approved event.
- Minimum direct Amy Hood statement: one per approved event.

### 8.2 Source tiers

| Tier | Source | Use |
|---|---|---|
| 1 | Direct Amy Hood interview, presentation, earnings-call turn, official speech | Policy evidence |
| 2 | Microsoft IR, SEC filing, official acquisition or financial document | Contemporaneous constraints and facts |
| 3 | Reputable independent reporting or interview | Context, criticism, and counterevidence |
| Discovery only | LinkedIn repost, search result, secondary index | Find the original source; never stand alone as Amy evidence |

LinkedIn automation and scraping are out of scope. Public LinkedIn results may be registered manually as discovery links, then replaced by the original interview, article, video, or Microsoft source. Paywalls, authentication, robots restrictions, and access controls are not bypassed.

### 8.3 Collectors

```text
MicrosoftIRCollector
MicrosoftSourceCollector
SecEdgarCollector
PublicHtmlCollector
TranscriptImporter
ManualSourceImporter
```

All collectors produce the same immutable `RawSource` contract. The raw body is stored without LLM rewriting. SHA-256 identifies content, supports idempotent resume, and creates a new source version when content changes.

### 8.4 Collection states and failure reasons

```text
discovered -> queued -> collected -> normalized -> review_required -> approved
```

Explicit non-success states:

- `access_denied`.
- `paywalled`.
- `transcript_missing`.
- `speaker_uncertain`.
- `duplicate`.
- `insufficient_decision_context`.
- `post_outcome_only`.

Failures remain in the registry. A failed refresh never overwrites a previously valid raw source.

## 9. Evidence and Decision Data Contracts

### 9.1 RawSource

```json
{
  "source_id": "msft-fy2018-q4-call",
  "url": "https://example.invalid",
  "title": "",
  "publisher": "Microsoft Investor Relations",
  "published_at": "2018-07-19",
  "source_type": "earnings_call",
  "source_tier": 1,
  "collector": "microsoft_ir",
  "temporal_role": "pre_decision",
  "content_sha256": "",
  "raw_path": "",
  "collection_status": "complete"
}
```

### 9.2 EvidenceSpan

```json
{
  "evidence_id": "ev-001",
  "source_id": "msft-fy2018-q4-call",
  "speaker": "Amy Hood",
  "text": "",
  "block_ids": [],
  "evidence_type": "direct_statement",
  "decision_phase": "pre_decision",
  "supports": [],
  "contradicts": []
}
```

Allowed evidence types:

- `direct_statement`.
- `official_context`.
- `independent_context`.
- `post_outcome`.

`post_outcome` is stored separately and excluded from training, reflection, policy induction, and runtime memory.

### 9.3 DecisionEvent

```json
{
  "event_id": "github-acquisition-2018",
  "title": "GitHub acquisition",
  "domain": "m_and_a",
  "decision_date": "2018-06-04",
  "dataset_split": "holdout",
  "situation": "",
  "options": [],
  "constraints": [],
  "objectives": [],
  "selected_action": "",
  "rejected_benefits": [],
  "decision_changing_signals": [],
  "amy_direct_evidence_ids": [],
  "context_evidence_ids": [],
  "counter_evidence_ids": [],
  "post_outcome_evidence_ids": [],
  "review_status": "review_required"
}
```

### 9.4 Event approval gate

An event requires:

- At least one verified direct Amy Hood statement.
- At least one official or independent contextual source.
- Verified speaker and publication date.
- Separation of decision-time information and post-outcome evidence.
- At least two realistic options or alternatives.
- A visible constraint and rejected benefit.
- Separation of observation and inference.
- Recorded human approval.

## 10. Three-Layer Long-Term Memory

### 10.1 Event memory

Preserves each approved situation, options, constraints, selected action, rejected benefits, decision-changing signals, evidence IDs, and temporal cutoff.

### 10.2 Reflection memory

Compares at least two events and records:

- The cross-event question.
- Observed pattern.
- Supporting events.
- Contrasting events.
- Boundary conditions.
- Unresolved conflicts.
- Confidence.

Every reflection must search for contrasting events. Similarity alone cannot establish a policy.

### 10.3 Policy memory

Converts approved reflections into operational rules with:

- Domain.
- Ordered criteria.
- Recommendation rule.
- Applicability conditions.
- Non-applicability conditions.
- Exceptions.
- Reversal signals.
- Supporting reflections.
- Confidence.

A policy requires either:

1. Repetition across at least two approved events, or
2. A directly stated principle and confirmation in another independent context.

A single-event inference is stored as `event_specific_hypothesis` and cannot enter the runtime policy index.

### 10.4 Policy confidence

- **High:** Three or more events, direct evidence, and reviewed counterexample.
- **Medium:** Two events, or a directly stated principle plus independent confirmation.
- **Low:** Single-event inference; not deployable.

## 11. Retrieval and Context Packaging

### 11.1 Query planning

Normalize the user scenario into a `DecisionContext` containing:

- Decision domain.
- Required decision.
- Objectives.
- Options.
- Constraints.
- Time horizon.
- Known metrics.
- Unknowns.
- Risk tolerance.

### 11.2 Retrieval sequence

1. Retrieve policy candidates.
2. Retrieve cross-event reflections.
3. Retrieve supporting events.
4. Retrieve counterexample events.
5. Retrieve only the minimal evidence spans required for audit.

The retriever uses hybrid lexical and embedding search, metadata filters, then a reranker. Retrieval candidates are broader than the final prompt context.

### 11.3 Final context limits

- Policies: top 2.
- Reflections: top 2.
- Supporting events: top 2.
- Counterexample events: top 1.
- Evidence spans: maximum 2 per policy.

### 11.4 Gemma 4 token budget

| Component | Target |
|---|---:|
| Thin Main Prompt | 1,200 to 1,500 |
| User scenario | Up to 1,500 |
| Policy memory | Up to 2,000 |
| Reflection memory | Up to 2,000 |
| Events and counterexample | Up to 4,000 |
| Reserved output | At least 2,000 |
| Safety margin | Remaining tokens |

The orchestrator rejects a package that exceeds the configured budget. It reduces lower-ranked evidence before truncating a structured artifact.

## 12. Thin Main Prompt

The Main Prompt contains behavior control, not the Amy Hood memory corpus.

It instructs the model to:

1. Normalize the situation and options.
2. Check each retrieved policy's applicability and confidence.
3. Compare supporting and contrasting events.
4. Evaluate all plausible options using the same ordered criteria.
5. Avoid extending a policy beyond its stated boundary.
6. Produce a recommendation, tradeoff, risk, and reversal signal.

Amy-specific behavior must come from approved runtime memory. Repeatedly adding generic CFO virtues to the system prompt is not a valid improvement strategy.

## 13. Advisor Output Design

### 13.1 Internal DecisionPlan

```json
{
  "recommendation": "",
  "applicable_policy_ids": [],
  "supporting_event_ids": [],
  "counterexample_event_ids": [],
  "criteria_in_priority_order": [],
  "option_assessments": [],
  "main_tradeoff": "",
  "risks": [],
  "decision_changing_signals": [],
  "evidence_coverage": "medium",
  "generic_fallback_used": false
}
```

This is a concise, auditable decision result, not hidden chain-of-thought.

### 13.2 User-facing response

The advisor speaks in Amy Hood's first-person presentation style. The UI permanently displays the unofficial-simulation disclaimer, so the answer does not repeat it.

Response order:

1. Decision.
2. Most important criteria.
3. Option comparison.
4. Main risk.
5. Decision-changing signal.
6. Next action.

Normal answers do not show source links, artifact IDs, or evaluation labels. Developer audit mode retains all provenance.

### 13.3 Evidence coverage and fallback

- **High:** Approved policy, at least two supporting events, and reviewed counterexample.
- **Medium:** Approved policy and at least one supporting event.
- **Low:** Similar event or generic CFO reasoning without an applicable approved policy.

The advisor does not refuse ordinary advice solely because coverage is low. It searches adjacent policies and events, then gives conditional general CFO advice if necessary. The internal plan records `generic_fallback_used=true`. Low-coverage or fallback responses do not count as Amy-specific successes in evaluation.

## 14. Versioning and Reproducibility

Every collection, build, memory release, advice response, and evaluation run records immutable identifiers for:

- Source registry version.
- Raw-source content hashes.
- Event dataset version.
- Reflection and policy memory release.
- Main Prompt version and hash.
- Retrieval configuration version.
- Evaluation bundle version.
- Model name and build.
- Temperature and context budget.

An execution pins these values at start. Activation of a newer prompt or memory release does not change an in-progress run.

## 15. B Track Management UI

The B Track workspace contains:

1. **Source Registry:** URLs, source tiers, collection states, hashes, and raw-source preview.
2. **Decision Event Review:** Event card beside linked direct and contextual evidence; approve or request revision.
3. **Decision Policy Review:** Policy, supporting events, counterexamples, confidence, and release status.
4. **Memory Release:** Build and activate immutable event, reflection, and policy releases.
5. **Main Prompt:** Existing immutable Prompt editing and active-version selection.
6. **Evaluation v3:** Four arms, five repetitions, execution IDs, scores, lift, consistency, and failure analysis.
7. **Advisor Audit:** DecisionPlan, retrieved artifacts, coverage, and fallback status for each answer.

A Track remains independent. B Track does not reuse A Track's `PreInterviewContext` collection contract.

## 16. Failure Safety

- Collection failure preserves the last valid raw source and records an explicit failure.
- Uncertain speaker or date becomes `review_required`.
- Any holdout artifact observed by a builder or runtime index fails the operation before writing.
- Insufficiently supported policy remains `hypothesis` and cannot be released.
- Empty retrieval triggers adjacent retrieval and recorded fallback.
- Conflicting policies produce a conditional conclusion and reversal signals.
- Invalid model JSON receives exactly one retry, then persists a resumable failure.
- Evaluation preserves complete responses and resumes from the failed item.
- All multi-file releases write to a temporary location, validate, then atomically activate.

## 17. Testing Strategy

All new or significantly modified test files follow the repository's AGENTS.md contract:

```text
Test Plan:
1. Happy Path: one normal successful case
2. Edge Cases: exactly three realistic cases by default
3. Failure Path: safe failure with no partial or corrupted state
```

### 17.1 Required automated coverage

- Collector idempotency and failed-refresh preservation.
- Duplicate and changed-content hash handling.
- Speaker, date, and evidence-type validation.
- Event approval gate.
- Post-outcome exclusion.
- Train, development, and holdout isolation.
- Reflection minimum-event and counterexample requirements.
- Policy confidence and release gates.
- Hybrid retrieval and metadata filters.
- Counterexample inclusion.
- Context token-budget enforcement.
- Main Prompt and memory role separation.
- DecisionPlan schema and one-retry behavior.
- Generic fallback accounting.
- Immutable version pinning.
- Evaluation choice-reason consistency.
- Five-run grouping and lift calculation.
- v2 regression compatibility.
- v3 sealed answer non-exposure.

### 17.2 Evaluation diagnostics

Report at least:

- Choice accuracy by category.
- Criteria and priority alignment.
- Counterfactual pair consistency.
- Retrieval Recall@5 and nDCG@5 against annotated relevant artifacts.
- Context relevance.
- Answer faithfulness.
- Generic fallback rate.
- Persona and RAG lift.
- Five-run selection agreement.
- Mean input tokens and latency.

## 18. Implementation Sequence

The implementation plan must preserve this order:

1. Freeze evaluation v3 contracts, scoring, experiment arms, and leakage gates.
2. Build the event-candidate and source registries.
3. Implement whitelisted collectors and immutable raw-source storage.
4. Extract and review evidence spans and 20 decision events.
5. Enforce 12/4/4 dataset isolation.
6. Build reflection and policy induction with counterexample review.
7. Release versioned three-layer memory.
8. Replace raw top-1 evaluation retrieval with hybrid structured retrieval and reranking.
9. Rewrite the Main Prompt as a thin policy controller.
10. Implement DecisionContext, DecisionPlan, answer rendering, coverage, and fallback.
11. Add B Track review, release, evaluation, and audit UI.
12. Run the four-arm, five-repetition Gemma 4 evaluation.
13. Use GPT-5-mini only after the Gemma pipeline and data gates pass.

## 19. Scope Boundaries

The first implementation does not include:

- LinkedIn scraping or access-control bypass.
- GraphRAG.
- Autonomous multi-agent debate.
- Fine-tuning.
- Private or undisclosed Microsoft data.
- Claims of full personal or psychological replication.
- Automatic approval of sources, events, reflections, or policies.

## 20. Final Deliverables

1. Evaluation v3 question, answer, rubric, review, and sealed-run contracts.
2. Event-candidate and source registries.
3. Immutable raw-source corpus with provenance.
4. Twenty reviewed decision-event cards with 12/4/4 isolation.
5. Reviewed reflection and conditional policy cards.
6. Versioned three-layer memory release.
7. Thin Amy Hood Main Prompt.
8. Hybrid structured retriever and context packer.
9. Decision Advisor runtime with auditable DecisionPlan.
10. B Track management and evaluation UI.
11. Four-arm, five-repetition evaluation report.

This design is complete when an implementation plan can map every deliverable to concrete files, tests, commands, and acceptance evidence without inventing additional product or data-policy decisions.
