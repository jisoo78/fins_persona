# Amy Hood Evaluation v3 Design

**Date:** 2026-07-15  
**Status:** Pending written-spec review  
**Track:** B Track — Amy Hood Decision Advisor  
**Primary runtime:** Gemma 4 local, 16,384-token context  
**Compatibility rule:** Evaluation v2 data, APIs, runs, and reports remain readable and unchanged

## 1. Objective

Build a sealed Evaluation v3 benchmark that distinguishes Amy Hood-style decision ordering from generally competent CFO reasoning. The first PoC must run quickly with one repetition per arm, then run the same immutable contract five times per arm after the local pipeline passes.

Evaluation v3 measures a bounded public-evidence decision advisor. It does not measure or claim complete replication of Amy Hood as a person.

## 2. Fixed Question Contract

Evaluation v3 contains exactly 30 questions. Every question is four-option multiple choice.

| IDs | Count | Purpose |
| --- | ---: | --- |
| `D1`–`D10` | 10 | Distinguish Amy-specific criteria and priority ordering from a generic CFO baseline |
| `H1`–`H10` | 10 | Predict decisions across four sealed historical events without outcome leakage |
| `C1`–`C6` | 6 | Test whether a material condition reverses or preserves the recommendation |
| `T1`–`T4` | 4 | Transfer the learned policy to new CFO advisory situations |

Each question has exactly four financially plausible options and exactly one keyed best answer. The model must return both a choice and a concise reason. The choice is scored automatically; the reason is retained for audit and mismatch analysis but does not change the objective score in the PoC.

### 2.1 Distractor construction rules

No option may be obviously reckless, factually absurd, or stylistically shorter or less specific than the keyed answer. Each distractor must differ from the keyed answer through at least one recorded trap mechanism:

- Correct principle applied in the wrong priority order.
- Correct action taken before its required condition is satisfied.
- Financially sound action with one material boundary condition omitted.
- Excessive preference for short-term EPS, margin, or cash optics.
- Strategically sound action with the wrong execution sequence.
- Valid event-specific rule generalized beyond its evidence boundary.
- Reversal signal applied too early or too late.

The answer key stores a `correctIntent` and one `trapIntent` per option. The public question file never exposes these fields to the generation model.

### 2.2 Question-quality gates

The bundle is rejected unless all conditions hold:

- Exactly 30 unique IDs with the fixed `10/10/6/4` distribution.
- Every question has four non-empty, unique options of comparable specificity.
- Correct-answer positions are balanced: each position appears between six and nine times across the 30 questions.
- No option contains answer labels such as `정답`, `오답`, `권장`, or answer-key language.
- Each wrong option has a non-empty trap intent using an allowed mechanism.
- Counterfactual questions form three explicit pairs. Each pair changes one material condition and records whether the keyed choice should reverse or remain stable.
- No question prompt or option refers to post-outcome success as a reason available at decision time.

## 3. Sealed Historical Holdout

The historical holdout is fixed to four major events:

1. GitHub acquisition, 2018.
2. AI datacenter investment, 2025.
3. Microsoft 365 price increase, 2021.
4. Share repurchase authorization, 2021.

The sealed manifest records candidate IDs, event IDs, source IDs, aliases, and temporal cutoffs. These identifiers may appear in Evaluation v3 question and grading artifacts only. They must not enter Main Prompt generation, reflection or policy induction, runtime memory releases, or RAG indexing.

### 3.1 PoC isolation strategy

Existing immutable sources and registries remain in place to avoid a risky migration. Isolation is enforced twice:

1. Training and memory selectors exclude every sealed candidate, event, and source ID.
2. Prompt, policy, memory-release, and RAG builders run a final fail-closed scan and reject any sealed identifier before writing an artifact.

The final gate reports the exact leaked identifier and artifact class. A rejected build performs no partial write. Post-outcome sources for the four events are grading-only and are never exposed to the generation model.

## 4. Artifact Layout

Evaluation v3 is independent of the existing v2 files.

```text
evaluation/v3/
  public/
    questions.json
    reviews.json
  sealed/
    answer-key.json
    holdout-manifest.json
  runs/
    <run-id>.json
```

Server implementation lives under `server/evaluationV3/`. Shared v3 types live in `shared/amyHoodEvaluationV3.ts`. V2 contracts and run files are not rewritten or migrated.

The human review UI may display answer keys and trap intents because it is an authoring and approval surface. The model input builder receives the public question object only and rejects unknown fields.

## 5. Experiment Contract

Evaluation v3 has exactly four arms:

1. `generic_cfo`: generic CFO prompt, no Amy memory.
2. `amy_prompt`: Amy Main Prompt, no RAG.
3. `amy_policy_rag`: Amy Main Prompt plus policy memory.
4. `amy_full_rag`: Amy Main Prompt plus policy, reflection, event, and counterexample memory.

All arms in one experiment pin the same:

- Evaluation v3 question and answer-key version.
- Model provider, model name, and model configuration.
- Active Amy prompt version and hash where applicable.
- Generic CFO prompt hash where applicable.
- Memory release IDs and hashes.
- Temperature and token limits.
- Repetition number.

The PoC launch accepts only `repetitions: 1` or `repetitions: 5`. One repetition creates four runs and 120 model answers. Five repetitions create twenty runs and 600 model answers. Runs execute in stable arm and repetition order to avoid overloading the local Gemma server.

## 6. Scoring and Diagnostics

Each correct choice is worth one point. The raw objective score is therefore `0–30` and the percentage score is `correct / 30 * 100`.

Reports include:

- Overall score and category scores for `D`, `H`, `C`, and `T`.
- Per-arm mean, minimum, maximum, and standard deviation when five repetitions exist.
- Pair consistency for the three counterfactual pairs.
- Five-run choice agreement per question and per arm.
- Amy Prompt lift over Generic CFO.
- Policy RAG lift over Amy Prompt.
- Full RAG lift over Policy RAG and Generic CFO.
- Choice-reason mismatch count.
- Input tokens, output tokens, elapsed time, and failed-question count.

A reason-choice mismatch is diagnostic rather than score-changing. The PoC records it only when a deterministic response validator finds that the returned choice label conflicts with the choice explicitly named in the reason. Semantic reason grading is excluded from this implementation to avoid adding a paid or variable judge to the first Gemma experiment.

### 6.1 Benchmark rejection gates

- If Generic CFO scores above 80% in the first complete repetition, the bundle is rejected as insufficiently discriminative.
- If any holdout leakage is detected, the affected experiment is invalid regardless of score.
- If an arm has an incomplete run, cross-arm lift for that repetition remains unavailable.
- A four-arm comparison requires exactly one run per arm for the same group and repetition.

## 7. Runtime Flow

```text
Load and validate public questions
  -> verify all human reviews are approved
  -> load sealed key in grader boundary only
  -> verify holdout manifest and artifact isolation
  -> pin prompts, model, and memory releases
  -> create four runs per repetition
  -> send one public question per Gemma call
  -> parse choice and reason
  -> persist each answer atomically
  -> score choices outside the model call
  -> aggregate arm, lift, consistency, and leakage diagnostics
```

The runner can resume an incomplete run without regenerating completed answers. A failed arm does not prevent later arms from running, but the affected repetition is not comparison-ready.

## 8. UI Scope

The existing B Track evaluation screens gain a version selector with `v2` and `v3`.

For v3:

- Question Review displays all 30 questions, keyed answers, and trap intents to the human reviewer.
- Evaluation Run displays the four arm labels and a `1회 빠른 실험 / 5회 정식 실험` selector.
- Evaluation Report groups runs by experiment group and repetition and displays scores, lift, consistency, mismatch, latency, and failures.
- Existing v2 runs remain visible through the v2 selector and retain their current three-arm interpretation.

## 9. Error Handling

- Invalid question counts, IDs, answer positions, trap metadata, or pair metadata fail before run creation.
- Unapproved questions fail before model creation.
- Unknown experiment arms or repetition counts fail before persistence.
- A sealed identifier in a training, prompt, policy, memory, or RAG artifact fails before writing and names the leaked identifier.
- Answer keys and trap intents passed to the model-input builder are rejected as unknown fields.
- Malformed model output receives one retry. A second failure persists one failed answer and leaves the run resumable.
- Run writes remain atomic; failures do not corrupt completed answers or sibling-arm runs.

## 10. Test Strategy

New or significantly modified test files begin with the repository-required test-plan comment.

### Happy path

- One approved 30-question bundle launches four pinned local runs, completes one repetition, and produces objective and lift metrics.

### Exactly three default edge cases

1. Five repetitions preserve stable arm ordering and independent run IDs.
2. A resumed run preserves completed answers and continues at the first failed question.
3. Balanced but uncommon correct-answer positions at the six and nine occurrence boundaries remain valid.

### Failure paths

- Invalid question distribution, duplicate IDs, weak or missing trap intents, and malformed counterfactual pairs fail before persistence.
- Any sealed candidate, event, or source ID in a prohibited artifact fails closed without a partial write.
- Answer-key fields cannot enter a model request.
- Incomplete or mixed-version experiment groups cannot produce lift metrics.
- Existing v2 evaluation tests remain green.

## 11. Acceptance Criteria

- A separately versioned 30-question, all-multiple-choice v3 bundle exists and passes all quality gates.
- All 30 questions and answer metadata are human-reviewable without exposing keys to the generation model.
- The four historical events are sealed and blocked from prompt, policy, memory, and RAG inputs.
- A local one-repetition experiment creates exactly four runs and can complete 120 question calls.
- A five-repetition experiment creates exactly twenty runs and can complete 600 question calls.
- Four-arm reports calculate category scores, lift, consistency, mismatches, usage, latency, and failures.
- V2 data, APIs, reports, and tests remain operational.

## 12. Explicit Non-Goals

- No subjective questions or subjective LLM grading in Evaluation v3.
- No GPT-5-mini execution before the Gemma 4 gate passes.
- No GraphRAG.
- No autonomous evaluator-agent debate.
- No encryption or external secret store for the sealed PoC files.
- No migration or deletion of existing v2 runs.
