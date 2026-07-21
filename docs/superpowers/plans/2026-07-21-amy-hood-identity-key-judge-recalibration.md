# Amy Hood Evaluation v6 Identity-Key and Judge Recalibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Amy Hood의 근거 기반 판단 순서·조건·반전 경계를 재현한 답변만 높은 점수를 받도록 Evaluation v6의 30문항, Identity Key, blind Judge, 보정 게이트와 실행·보고 체계를 구축한다.

**Architecture:** Evaluation v5의 데이터와 실행 결과는 수정하지 않고 evaluation/v6, server/evaluationV6, shared/amyHoodEvaluationV6.ts에 새 버전을 만든다. 먼저 v5의 30문항을 근거 등급으로 감사하여 부적격 키를 교체하고, 30개가 모두 근거 게이트를 통과한 경우에만 v6를 동결한다. Judge LLM은 Amy Identity Key를 보고 5개 구성요소만 판정하며, 최종 1–10점과 상한은 TypeScript가 결정론적으로 계산한다.

**Tech Stack:** TypeScript 5.8, Node.js test runner, tsx, native fetch, llama-server OpenAI-compatible API, existing atomic JSON store, existing BGE-M3/Hybrid RAG evaluation engine.

## Global Constraints

- Evaluation v5의 evaluation/v5/public, evaluation/v5/sealed, evaluation/v5/sources는 byte-for-byte 변경하지 않는다.
- v6 KPI는 30 scenarios / 15 initial-changed pairs이며 direct_observed, contrast_observed, reviewed bounded_policy_transfer만 허용한다.
- 변경 단계가 pause, termination, postponement, restart, material reversal을 요구하면 same-axis Amy contrast 또는 명시적 Amy reversal statement가 반드시 있어야 한다.
- 외부 CFO 사건은 익명 시나리오 조건에만 사용하고 Amy 정답 키의 근거로 사용하지 않는다.
- Judge packet에는 arm, generating model, provider, run ID, retrieval trace, Policy/Full RAG 표시, 외부 CFO 정체성 및 근거 source ID를 넣지 않는다.
- Judge 구성요소 가중치는 Action 20%, Amy priority order 25%, Boundary conditions 20%, Reversal policy 20%, Identity specificity 15%로 고정한다.
- Generic CFO 답변은 최대 6점, materially different priority order는 최대 7점, 필수 boundary/reversal 누락은 최대 6점, Amy identity conflict는 최대 4점이다.
- 8–10점은 correct action과 Amy-specific priority, boundary, reversal, rationale anchor를 모두 충족해야 한다.
- Judge JSON은 한 번만 보정 요청하며, 두 번째도 잘못되면 해당 배치를 활성화하지 않는다.
- Judge calibration은 aligned ≥ 8, generic ≤ 6, conflict ≤ 4, aligned-generic gap ≥ 2, 전체 평균 gap ≥ 2.5, leakage 0%, Amy pass 100%를 모두 요구한다.
- v6 최종 manifest는 90개 controlled Judge calibration이 동일한 candidate bundle hash로 통과한 뒤에만 생성한다.
- 정식 실행은 30 scenarios × 3 arms × 5 repetitions = 450 answers이며, 그 전에 90개 controlled Judge calibration과 90개 persona calibration을 통과해야 한다.
- 모든 새 테스트 파일은 Happy Path 1개, 현실적인 Edge Cases 정확히 3개, 필요한 Failure Path를 파일 상단 Test Plan 주석에 명시한다.

---

## File Map

- shared/amyHoodEvaluationV6.ts: v6 scenario, audit, Identity Key, Judge, grade, calibration, run, report contracts.
- server/evaluationV6/paths.ts: evaluation/v6 전용 경로.
- server/evaluationV6/audit.ts: 30-item 감사와 replacement ledger 검증.
- server/evaluationV6/scenarioSet.ts: v6 bundle 검증·동결·로딩.
- server/evaluationV6/scoring.ts: 구성요소 가중치와 점수 상한의 순수 함수.
- server/evaluationV6/calibration.ts: 90개 controlled answer 및 Judge 보정 게이트.
- server/evaluationV6/judge.ts: blind packet export, private link, 원자적 grade 활성화.
- server/evaluationV6/localJudge.ts: Gemma Judge 호출, 1회 JSON repair, resume checkpoint.
- server/evaluationV6/context.ts, prompt.ts, retrievalCache.ts, runStore.ts, runner.ts: v6 실행 격리.
- server/evaluationV6/report.ts: identity, retrieval, transition 보고서 JSON/HTML.
- server/runAmyHoodEvaluationV6.ts: v6 CLI.
- evaluation/v6/audit, public, sealed, judge, runs, retrieval-cache, reports: 버전 분리된 산출물.

---

### Task 1: v6 Shared Contracts and Isolated Paths

**Files:**
- Create: shared/amyHoodEvaluationV6.ts
- Create: server/evaluationV6/paths.ts
- Create: tests/amyHoodEvaluationV6Contracts.test.ts
- Modify: package.json

**Interfaces:**
- Produces: EvaluationV6ItemAudit, EvaluationV6IdentityKey, EvaluationV6JudgeAssessment, EvaluationV6Grade, EvaluationV6CalibrationAnswer.
- Produces: evaluationV6Paths(root: string).
- Adds scripts: evaluation:v6:test, evaluation:v6:run.

- [ ] **Step 1: Write the failing contract test**

~~~ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - Expose v6 evidence, audit, identity-key, Judge, and path contracts under an isolated namespace.
 * 2. Edge Cases:
 *    - Preserve all five decision domains.
 *    - Preserve the three persona experiment arms.
 *    - Resolve paths correctly when the repository root contains spaces.
 * 3. Failure Path:
 *    - Reject unsupported evidence classes and out-of-range component ratings at runtime validators.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EVALUATION_V6_ARMS,
  EVALUATION_V6_EVIDENCE_CLASSES,
  assertEvaluationV6ComponentRating,
  assertEvaluationV6EvidenceClass,
} from '../shared/amyHoodEvaluationV6';
import { evaluationV6Paths } from '../server/evaluationV6/paths';

test('happy: exposes the isolated v6 contract', () => {
  assert.equal(EVALUATION_V6_EVIDENCE_CLASSES.length, 6);
  assert.deepEqual(EVALUATION_V6_ARMS, ['amy_prompt', 'amy_policy_rag', 'amy_full_rag']);
  assert.equal(assertEvaluationV6ComponentRating(4), 4);
});
test('edge: preserves all five domains', () => {
  assert.equal(new Set(['m_and_a', 'ai_cloud_capex', 'pricing_monetization', 'cost_efficiency', 'shareholder_return_risk']).size, 5);
});
test('edge: preserves all three arms', () => assert.equal(EVALUATION_V6_ARMS.length, 3));
test('edge: resolves a root containing spaces', () => {
  assert.match(evaluationV6Paths('/tmp/Amy Hood').root, /Amy Hood\/evaluation\/v6$/);
});
test('failure: rejects unknown evidence and invalid ratings', () => {
  assert.throws(() => assertEvaluationV6EvidenceClass('reasonable_cfo'), /evidence class/i);
  assert.throws(() => assertEvaluationV6ComponentRating(5), /component rating/i);
});
~~~

- [ ] **Step 2: Run the test and confirm RED**

~~~bash
npx tsx --test tests/amyHoodEvaluationV6Contracts.test.ts
~~~

Expected: module-not-found failures for the v6 shared contract and path module.

- [ ] **Step 3: Add the shared runtime contracts**

~~~ts
import type { DecisionDomain } from './amyHoodDecisionAdvisor';
import type { EvaluationV5CandidateResponse } from './amyHoodEvaluationV5';
import type { AmyHoodRetrievalTrace } from './amyHoodRag';

export const EVALUATION_V6_ARMS = ['amy_prompt', 'amy_policy_rag', 'amy_full_rag'] as const;
export const EVALUATION_V6_DOMAINS: DecisionDomain[] = [
  'm_and_a', 'ai_cloud_capex', 'pricing_monetization', 'cost_efficiency', 'shareholder_return_risk',
];
export const EVALUATION_V6_EVIDENCE_CLASSES = [
  'direct_observed', 'contrast_observed', 'bounded_policy_transfer',
  'unsupported_reversal', 'generic_only', 'ambiguous_key',
] as const;
export const EVALUATION_V6_COMPONENTS = [
  'action', 'priorityOrder', 'boundaries', 'reversal', 'identitySpecificity',
] as const;
export type EvaluationV6Arm = typeof EVALUATION_V6_ARMS[number];
export type EvaluationV6EvidenceClass = typeof EVALUATION_V6_EVIDENCE_CLASSES[number];
export type EvaluationV6Component = typeof EVALUATION_V6_COMPONENTS[number];
export type EvaluationV6ComponentRating = 0 | 1 | 2 | 3 | 4;

export type EvaluationV6ItemAudit = {
  scenarioId: string;
  domain: DecisionDomain;
  policyId: string;
  decisionAxis: string;
  amyDirectEvidenceIds: string[];
  amySupportingEventIds: string[];
  amyContrastingEventIds: string[];
  explicitReversalEvidenceIds: string[];
  externalMotifEventId: string;
  keyEvidenceClass: EvaluationV6EvidenceClass;
  requiresObservedReversal: boolean;
  identityDiscriminability: 'passed' | 'failed';
  decision: 'retain' | 'replace';
  rationale: string;
  reviewer: 'Codex';
  reviewedAt: string;
};

export type EvaluationV6ReplacementRecord = {
  predecessorScenarioId: string;
  replacementScenarioId: string;
  originalDomain: DecisionDomain;
  replacementDomain: DecisionDomain;
  reason: string;
  amyEvidenceIds: string[];
  externalMotifEventId: string;
  status: 'admitted' | 'research_required';
  reviewer: 'Codex' | null;
  reviewedAt: string | null;
};

export type EvaluationV6GenericCfoFoil = {
  action: string;
  whyReasonable: string;
  whyNotAmy: string;
};

export type EvaluationV6IdentityKey = {
  scenarioId: string;
  policyId: string;
  expectedAction: string;
  amyPriorityOrder: string[];
  amyBoundaryConditions: string[];
  amyReversalRule: string[];
  amySpecificRationale: string;
  acceptableVariants: string[];
  genericCfoFoil: EvaluationV6GenericCfoFoil;
  identityConflicts: string[];
  evidenceClass: Extract<EvaluationV6EvidenceClass, 'direct_observed' | 'contrast_observed' | 'bounded_policy_transfer'>;
  amyEvidenceIds: string[];
  externalMotifEventId: string;
};

export type EvaluationV6JudgeComponents = Record<EvaluationV6Component, EvaluationV6ComponentRating>;
export type EvaluationV6IdentityVerdict = 'amy_aligned' | 'amy_partial' | 'generic_cfo' | 'amy_conflict';
export type EvaluationV6AnchorKind = 'action' | 'priority_order' | 'boundary_condition' | 'reversal_rule' | 'identity_conflict';
export type EvaluationV6JudgeAssessment = {
  rationale: string;
  identityVerdict: EvaluationV6IdentityVerdict;
  components: EvaluationV6JudgeComponents;
  anchorFindings: Record<'action' | 'priority' | 'guardrails' | 'reversal', 'aligned' | 'partial' | 'missing' | 'conflict'>;
  distinguishingAnchor: { kind: EvaluationV6AnchorKind; statement: string };
};

export type EvaluationV6Grade = EvaluationV6JudgeAssessment & {
  packetId: string;
  packetHash: string;
  score: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  uncappedScore: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  ceilingApplied: string[];
  judgeProvider: 'codex' | 'openai' | 'local';
  judgeModel: string;
  rationalePromptHash: string;
  assessmentPromptHash: string;
  repairApplied: boolean;
  gradedAt: string;
};

export type EvaluationV6CalibrationAnswer = {
  calibrationId: string;
  scenarioId: string;
  answerType: 'amy_aligned' | 'generic_cfo' | 'amy_conflict';
  expectedAnchor: EvaluationV6AnchorKind;
  expectedAnchorTerms: string[];
  candidateResponse: EvaluationV5CandidateResponse;
};

export type EvaluationV6Scenario = {
  id: string;
  predecessorScenarioId: string | null;
  pairId: string;
  domain: DecisionDomain;
  phase: 'initial' | 'changed';
  title: string;
  situation: string;
  decisionQuestion: string;
};

export type EvaluationV6ScenarioFile = {
  dataset: 'amy_hood_identity_action_alignment_scenarios';
  version: '6.0.0';
  stage: 'benchmark';
  frozenAt: string;
  scenarios: EvaluationV6Scenario[];
};

export type EvaluationV6ScenarioReview = {
  scenarioId: string;
  status: 'unreviewed' | 'approved' | 'revision_required';
  evidenceAuditPassed: boolean;
  identityKeyComplete: boolean;
  calibrationPassed: boolean;
  identityMaskingComplete: boolean;
  reviewedAt: string | null;
};

export type EvaluationV6PairKey = {
  pairId: string;
  initialScenarioId: string;
  changedScenarioId: string;
  expectedResponseType: 'guardrail_adjustment' | 'resource_reallocation' | 'pause_or_reverse';
  primaryChangedSignal: string;
  supportingChangedSignal: string | null;
  expectedActionDelta: string;
  invariants: string[];
  gradingAnchors: string[];
};

export type EvaluationV6FrozenManifest = {
  schemaVersion: 1;
  stage: 'benchmark';
  scenarioSetVersion: '6.0.0';
  frozenAt: string;
  predecessorV5BundleHash: string;
  candidateBundleHash: string;
  judgeCalibrationBatchHash: string;
  scenarioIds: string[];
  pairIds: string[];
  hashes: Record<'audit' | 'replacementLedger' | 'scenarios' | 'reviews' | 'provenance' | 'identityKeys' | 'pairKeys' | 'calibrationAnswers', string>;
  bundleHash: string;
};

export type EvaluationV6BundleInput = {
  scenarioFile: EvaluationV6ScenarioFile;
  reviews: EvaluationV6ScenarioReview[];
  audits: EvaluationV6ItemAudit[];
  replacements: EvaluationV6ReplacementRecord[];
  provenance: Array<{
    pairId: string;
    externalMotifEventId: string;
    amyEvidenceIds: string[];
    decisionCutoff: string;
    reviewer: 'Codex';
    reviewedAt: string;
  }>;
  identityKeys: EvaluationV6IdentityKey[];
  pairKeys: EvaluationV6PairKey[];
  calibrationAnswers: EvaluationV6CalibrationAnswer[];
  predecessorV5BundleHash: string;
  manifest: EvaluationV6FrozenManifest | null;
};

export type EvaluationV6JudgePacket = {
  packetId: string;
  packetHash: string;
  scenario: Pick<EvaluationV6Scenario, 'title' | 'situation' | 'decisionQuestion'>;
  candidateResponse: EvaluationV5CandidateResponse;
  identityKey: Omit<EvaluationV6IdentityKey, 'scenarioId' | 'policyId' | 'evidenceClass' | 'amyEvidenceIds' | 'externalMotifEventId'>;
};

export type EvaluationV6PairJudgePacket = {
  packetId: string;
  packetHash: string;
  initialScenario: Pick<EvaluationV6Scenario, 'title' | 'situation' | 'decisionQuestion'>;
  changedScenario: Pick<EvaluationV6Scenario, 'title' | 'situation' | 'decisionQuestion'>;
  initialCandidateResponse: EvaluationV5CandidateResponse;
  changedCandidateResponse: EvaluationV5CandidateResponse;
  initialIdentityKey: EvaluationV6JudgePacket['identityKey'];
  changedIdentityKey: EvaluationV6JudgePacket['identityKey'];
  pairKey: Omit<EvaluationV6PairKey, 'pairId' | 'initialScenarioId' | 'changedScenarioId'>;
};

export type EvaluationV6PairGrade = EvaluationV6Grade & {
  aligned: boolean;
  expectedResponseFinding: 'aligned' | 'partial' | 'conflict';
  changedSignalFinding: 'aligned' | 'partial' | 'conflict';
  invariantFinding: 'aligned' | 'partial' | 'conflict';
};


export type EvaluationV6Run = {
  runId: string;
  version: '6.0.0';
  stage: 'benchmark';
  experimentGroupId: string;
  repetition: 1 | 2 | 3 | 4 | 5;
  orderSeed: string;
  scenarioOrder: string[];
  arm: EvaluationV6Arm;
  provider: 'local';
  model: string;
  scenarioSetHash: string;
  promptVersionId: string;
  promptHash: string;
  memoryReleaseId: string | null;
  memoryReleaseHash: string | null;
  memoryIndexHash: string | null;
  retrievalConfigHash: string | null;
  status: 'queued' | 'running' | 'incomplete' | 'complete';
  answers: Array<{
    scenarioId: string;
    status: 'complete' | 'failed';
    response?: EvaluationV5CandidateResponse;
    elapsedMs: number;
    retrieval?: AmyHoodRetrievalTrace;
    error?: string;
  }>;
  startedAt: string;
  completedAt: string | null;
};

export type EvaluationV6ExperimentReport = {
  experimentGroupId: string;
  evaluationVersion: '6.0.0';
  runMode: 'persona_calibration' | 'formal';
  scenarioSetHash: string;
  judgeCalibration: {
    genericLeakageRate: number;
    conflictLeakageRate: number;
    amyPassRate: number;
    meanIdentityGap: number;
    schemaValidRate: number;
  };
  armMeans: Record<EvaluationV6Arm, number>;
  componentMeans: Record<EvaluationV6Arm, Record<EvaluationV6Component, number>>;
  domainMeans: Record<EvaluationV6Arm, Partial<Record<DecisionDomain, number>>>;
  identityVerdicts: Record<EvaluationV6Arm, Record<EvaluationV6IdentityVerdict, number>>;
  genericLeakageRate: number;
  identityDiscriminationGap: number;
  evidenceCoverage: Record<string, number>;
  transition: Record<EvaluationV6Arm, {
    pairAccuracy: number;
    signalCitationRate: number;
    invariantPreservationRate: number;
  }> | null;
  retrieval: {
    mappedPolicyRate: number;
    wrongDomainRate: number;
    evidenceAttachmentRate: number;
    contextWithinBudgetRate: number;
  };
  judgeDiagnostics: {
    repairCount: number;
    manualDisagreementCount: number;
    manualReviewFindings: Array<{ targetId: string; decision: 'approved' | 'revise'; rationale: string }>;
  };
  itemLedger: {
    excludedV5: EvaluationV6ItemAudit[];
    replacements: EvaluationV6ReplacementRecord[];
  };
};


export const assertEvaluationV6EvidenceClass = (value: unknown): EvaluationV6EvidenceClass => {
  if (!EVALUATION_V6_EVIDENCE_CLASSES.includes(value as EvaluationV6EvidenceClass)) {
    throw new Error('invalid Evaluation v6 evidence class');
  }
  return value as EvaluationV6EvidenceClass;
};
export const assertEvaluationV6ComponentRating = (value: unknown): EvaluationV6ComponentRating => {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 4) {
    throw new Error('invalid Evaluation v6 component rating');
  }
  return value as EvaluationV6ComponentRating;
};
~~~

- [ ] **Step 4: Add isolated paths and package scripts**

~~~ts
import path from 'node:path';
export const evaluationV6Paths = (root: string) => {
  const base = path.resolve(root, 'evaluation/v6');
  return {
    root: base,
    audit: path.join(base, 'audit/v5-item-audit.json'),
    replacementLedger: path.join(base, 'audit/replacement-ledger.json'),
    scenarios: path.join(base, 'public/scenarios.json'),
    reviews: path.join(base, 'public/reviews.json'),
    provenance: path.join(base, 'sealed/event-provenance.json'),
    identityKeys: path.join(base, 'sealed/scenario-keys.json'),
    pairKeys: path.join(base, 'sealed/pair-keys.json'),
    calibrationAnswers: path.join(base, 'sealed/identity-calibration-answers.json'),
    manifest: path.join(base, 'sealed/manifest.json'),
    calibration: path.join(base, 'judge/calibration'),
    calibrationManualReview: path.join(base, 'judge/calibration/manual-review.json'),
    judgePackets: path.join(base, 'judge/packets'),
    localJudgeDrafts: path.join(base, 'judge/local-drafts'),
    grades: path.join(base, 'judge/grades'),
    pairGrades: path.join(base, 'judge/pair-grades'),
    runs: path.join(base, 'runs'),
    retrievalCache: path.join(base, 'retrieval-cache'),
    reports: path.join(base, 'reports'),
  };
};
~~~

Add to package.json:

~~~json
"evaluation:v6:test": "tsx --test tests/amyHoodEvaluationV6*.test.ts",
"evaluation:v6:run": "tsx server/runAmyHoodEvaluationV6.ts"
~~~

- [ ] **Step 5: Run focused tests and type checking**

~~~bash
npx tsx --test tests/amyHoodEvaluationV6Contracts.test.ts
npm run lint
~~~

Expected: the contract test passes and TypeScript exits zero.

- [ ] **Step 6: Commit**

~~~bash
git add shared/amyHoodEvaluationV6.ts server/evaluationV6/paths.ts tests/amyHoodEvaluationV6Contracts.test.ts package.json
git commit -m "feat: define Evaluation v6 contracts"
~~~

### Task 2: Thirty-Item Evidence Audit and Replacement Gate

**Files:**
- Create: server/evaluationV6/audit.ts
- Create: tests/amyHoodEvaluationV6Audit.test.ts
- Create: evaluation/v6/audit/v5-item-audit.json
- Create: evaluation/v6/audit/replacement-ledger.json

**Interfaces:**
- Consumes: loadEvaluationV5Bundle(root) and approved Amy policy/event artifacts.
- Produces: validateEvaluationV6Audit(audits, replacements, v5ScenarioIds).
- Produces: initializeEvaluationV6Audit(root) and assertEvaluationV6AuditReady(result).

- [ ] **Step 1: Write audit tests first**

~~~ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - Accept exactly thirty reviewed audit records when every replaced item has one admitted replacement.
 * 2. Edge Cases:
 *    - Accept reviewed bounded policy transfer with direct Amy evidence.
 *    - Accept domain reallocation when the replacement has qualifying Amy evidence.
 *    - Accept multiple items supported by one Amy event only on distinct decision axes.
 * 3. Failure Path:
 *    - Reject unsupported reversals, missing evidence, duplicate mappings, and research-required replacements.
 */
~~~

The happy fixture contains 30 unique predecessor IDs. Its four known-risk records use decision replace, evidence class unsupported_reversal, and each maps to one admitted replacement.

- [ ] **Step 2: Run and confirm RED**

~~~bash
npx tsx --test tests/amyHoodEvaluationV6Audit.test.ts
~~~

Expected: module-not-found failure for server/evaluationV6/audit.ts.

- [ ] **Step 3: Implement the audit rules**

~~~ts
const ADMISSIBLE = new Set(['direct_observed', 'contrast_observed', 'bounded_policy_transfer']);
const unique = (values: string[]) => new Set(values).size === values.length;
const filled = (values: string[]) => values.length > 0 && values.every((value) => value.trim());

export const validateEvaluationV6Audit = (
  audits: EvaluationV6ItemAudit[],
  replacements: EvaluationV6ReplacementRecord[],
  v5ScenarioIds: string[],
) => {
  if (audits.length !== 30 || !unique(audits.map(({ scenarioId }) => scenarioId))
    || audits.some(({ scenarioId }) => !v5ScenarioIds.includes(scenarioId))) {
    throw new Error('Evaluation v6 audit must map all thirty v5 scenarios exactly once');
  }
  for (const audit of audits) {
    if (!audit.rationale.trim() || audit.reviewer !== 'Codex' || Number.isNaN(Date.parse(audit.reviewedAt))) {
      throw new Error('Evaluation v6 audit is not reviewed: ' + audit.scenarioId);
    }
    if (audit.decision === 'retain') {
      if (!ADMISSIBLE.has(audit.keyEvidenceClass) || audit.identityDiscriminability !== 'passed') {
        throw new Error('Evaluation v6 retained item is not admissible: ' + audit.scenarioId);
      }
      if (!filled(audit.amyDirectEvidenceIds)) {
        throw new Error('Evaluation v6 retained item lacks direct Amy evidence: ' + audit.scenarioId);
      }
      if (audit.requiresObservedReversal
        && audit.amyContrastingEventIds.length === 0
        && audit.explicitReversalEvidenceIds.length === 0) {
        throw new Error('Evaluation v6 reversal lacks observed Amy evidence: ' + audit.scenarioId);
      }
    }
  }
  const eventAxes = new Set<string>();
  for (const audit of audits.filter(({ decision }) => decision === 'retain')) {
    if (!audit.decisionAxis.trim()) throw new Error('Evaluation v6 decision axis is empty');
    for (const eventId of [...audit.amySupportingEventIds, ...audit.amyContrastingEventIds]) {
      const usage = eventId + ':' + audit.decisionAxis;
      if (eventAxes.has(usage)) {
        throw new Error('Evaluation v6 repeats one Amy event on the same decision axis: ' + usage);
      }
      eventAxes.add(usage);
    }
  }
  const replaced = audits.filter(({ decision }) => decision === 'replace');
  const admitted = replacements.filter(({ status }) => status === 'admitted');
  if (replacements.length !== replaced.length
    || !unique(replacements.map(({ predecessorScenarioId }) => predecessorScenarioId))
    || !unique(replacements.map(({ replacementScenarioId }) => replacementScenarioId))
    || replaced.some(({ scenarioId }) => !admitted.some(({ predecessorScenarioId }) => predecessorScenarioId === scenarioId))
    || admitted.some(({ amyEvidenceIds, reviewer, reviewedAt }) =>
      !filled(amyEvidenceIds) || reviewer !== 'Codex' || !reviewedAt || Number.isNaN(Date.parse(reviewedAt)))) {
    throw new Error('Evaluation v6 replacement ledger is incomplete');
  }
  return { audits, replacements, retainedCount: 30 - replaced.length, replacedCount: replaced.length, ready: true };
};

export const assertEvaluationV6AuditReady = (
  result: ReturnType<typeof validateEvaluationV6Audit>,
) => {
  if (!result.ready || result.retainedCount + result.replacedCount !== 30) {
    throw new Error('Evaluation v6 evidence audit is not ready');
  }
};

export const checkEvaluationV6Audit = async (root: string) => {
  const paths = evaluationV6Paths(root);
  const [bundle, auditFile, replacementFile] = await Promise.all([
    loadEvaluationV5Bundle(root),
    readJsonFile<{ audits: EvaluationV6ItemAudit[] }>(paths.audit),
    readJsonFile<{ replacements: EvaluationV6ReplacementRecord[] }>(paths.replacementLedger),
  ]);
  const result = validateEvaluationV6Audit(
    auditFile.audits,
    replacementFile.replacements,
    bundle.scenarios.map(({ id }) => id),
  );
  assertEvaluationV6AuditReady(result);
  return result;
};

~~~

- [ ] **Step 4: Generate the audit shell with fail-closed defaults**

~~~ts
const knownRisk = new Map<string, string>([
  ['AAS-V5-MA-01-B', 'Adjustment behavior is inferred and requires same-axis Amy evidence review.'],
  ['AAS-V5-MA-02-A', 'Expected action relies on an unobserved Amy M&A reversal.'],
  ['AAS-V5-MA-02-B', 'Expected changed action relies on an unobserved Amy M&A reversal.'],
  ['AAS-V5-MA-03-B', 'Expected changed action relies on an unobserved Amy M&A reversal.'],
  ['AAS-V5-PM-01-B', 'Adjustment behavior is inferred and requires Amy pricing evidence review.'],
  ['AAS-V5-PM-02-B', 'Adjustment behavior is inferred and requires Amy pricing evidence review.'],
  ['AAS-V5-PM-03-B', 'The postpone action is not demonstrated by reviewed same-axis Amy evidence.'],
]);

const audits = bundle.scenarios.map((scenario): EvaluationV6ItemAudit => ({
  scenarioId: scenario.id,
  domain: scenario.domain,
  policyId: keyById.get(scenario.id)!.policyId,
  decisionAxis: scenario.domain + ':' + scenario.phase + ':' + scenario.id,
  amyDirectEvidenceIds: [],
  amySupportingEventIds: [],
  amyContrastingEventIds: [],
  explicitReversalEvidenceIds: [],
  externalMotifEventId: provenanceByPair.get(scenario.pairId)!.externalEventId,
  keyEvidenceClass: knownRisk.has(scenario.id) ? 'unsupported_reversal' : 'ambiguous_key',
  requiresObservedReversal: scenario.phase === 'changed',
  identityDiscriminability: 'failed',
  decision: 'replace',
  rationale: knownRisk.get(scenario.id) ?? 'Independent Amy identity evidence review has not admitted this v5 key.',
  reviewer: 'Codex',
  reviewedAt: now(),
}));
~~~

Initialize 30 research_required replacement rows. Change a record to retain only after verifying its Amy evidence IDs. Remove that replacement row. Every remaining replace record needs exactly one admitted v6 replacement. audit-check fails until the 30 decisions and replacement mappings are evidence-complete.

- [ ] **Step 5: Run tests and commit**

~~~bash
npx tsx --test tests/amyHoodEvaluationV6Audit.test.ts
git add server/evaluationV6/audit.ts tests/amyHoodEvaluationV6Audit.test.ts evaluation/v6/audit
git commit -m "feat: gate Evaluation v6 items by Amy evidence"
~~~

### Task 3: Evidence-Complete v6 Candidate Dataset and Non-Destructive Freeze Gate

**Files:**
- Create: server/evaluationV6/scenarioSet.ts
- Create: tests/helpers/evaluationV6Fixture.ts
- Create: tests/amyHoodEvaluationV6ScenarioSet.test.ts
- Create: evaluation/v6/public/scenarios.json
- Create: evaluation/v6/public/reviews.json
- Create: evaluation/v6/sealed/scenario-keys.json
- Create: evaluation/v6/sealed/pair-keys.json
- Create: evaluation/v6/sealed/event-provenance.json
- Create: evaluation/v6/sealed/identity-calibration-answers.json
- Create: evaluation/v6/sealed/manifest.json

**Interfaces:**
- Consumes: validateEvaluationV6Audit from Task 2.
- Produces: validateEvaluationV6CandidateBundle, buildEvaluationV6CandidateHash, loadEvaluationV6CandidateBundle.
- Produces: freezeEvaluationV6Bundle only when a matching passing calibration record is supplied.
- Produces: ValidatedEvaluationV6Bundle = EvaluationV6BundleInput plus scenarios, non-null manifest, and auditResult.

- [ ] **Step 1: Create the fixture and failing tests**

~~~ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - Freeze and reload thirty approved v6 scenarios with thirty identity keys and fifteen pair keys.
 * 2. Edge Cases:
 *    - Accept domain reallocation while retaining at least one qualifying pair per evidenced domain.
 *    - Accept multiple acceptable action variants with the same Amy priority and boundary.
 *    - Accept shuffled public, sealed, audit, and replacement records.
 * 3. Failure Path:
 *    - Reject unsupported evidence, weak identity keys, public identity leakage, stale hashes, and any write into v5.
 */
~~~

evaluationV6Fixture() builds 30 unique scenarios, 15 pairs, 30 complete Identity Keys, 90 controlled answers, a ready audit, and admitted replacement records.
Before Judge calibration, every review has status unreviewed, evidenceAuditPassed true, identityKeyComplete true, calibrationPassed false, and identityMaskingComplete true. Final freeze is the only operation that changes status to approved and calibrationPassed to true.

- [ ] **Step 2: Run and confirm RED**

~~~bash
npx tsx --test tests/amyHoodEvaluationV6ScenarioSet.test.ts
~~~

Expected: module-not-found failure for server/evaluationV6/scenarioSet.ts.

- [ ] **Step 3: Implement strict Identity Key validation**

~~~ts
const admissible = new Set(['direct_observed', 'contrast_observed', 'bounded_policy_transfer']);
const genericPhrases = /^(balance growth and profitability|protect customers|maintain flexibility)[.!]?$/i;
for (const key of input.identityKeys) {
  if (!admissible.has(key.evidenceClass)
    || !key.expectedAction.trim() || key.amyPriorityOrder.length < 3
    || !filled(key.amyPriorityOrder) || !filled(key.amyBoundaryConditions)
    || !filled(key.amyReversalRule) || !key.amySpecificRationale.trim()
    || genericPhrases.test(key.amySpecificRationale.trim())
    || !filled(key.acceptableVariants) || !key.genericCfoFoil.action.trim()
    || !key.genericCfoFoil.whyReasonable.trim() || !key.genericCfoFoil.whyNotAmy.trim()
    || !filled(key.identityConflicts) || !filled(key.amyEvidenceIds)
    || !key.externalMotifEventId.trim()) {
    throw new Error('Evaluation v6 identity key is invalid: ' + key.scenarioId);
  }
}
~~~

Also enforce exactly 30 scenarios, 15 A/B pairs, one key/review per scenario, one pair key per pair, no sealed identifier in public JSON, and full predecessor traceability.

- [ ] **Step 4: Make freeze write only the v6 manifest**

~~~ts
export type ValidatedEvaluationV6Bundle = EvaluationV6BundleInput & {
  scenarios: EvaluationV6Scenario[];
  manifest: EvaluationV6FrozenManifest | null;
  auditResult: ReturnType<typeof validateEvaluationV6Audit>;
};

export const buildEvaluationV6CandidateHash = (bundle: ValidatedEvaluationV6Bundle) =>
  sha256(canonicalJson({
    predecessorV5BundleHash: bundle.predecessorV5BundleHash,
    audit: bundle.audits,
    replacements: bundle.replacements,
    scenarios: bundle.scenarioFile,
    reviews: bundle.reviews,
    provenance: bundle.provenance,
    identityKeys: bundle.identityKeys,
    pairKeys: bundle.pairKeys,
    calibrationAnswers: bundle.calibrationAnswers,
  }));
export const buildEvaluationV6FrozenManifest = (
  bundle: ValidatedEvaluationV6Bundle,
  calibration: { candidateBundleHash: string; judgeCalibrationBatchHash: string },
  frozenAt = new Date().toISOString(),
): EvaluationV6FrozenManifest => {
  const hashes = {
    audit: sha256(canonicalJson(bundle.audits)),
    replacementLedger: sha256(canonicalJson(bundle.replacements)),
    scenarios: sha256(canonicalJson(bundle.scenarioFile)),
    reviews: sha256(canonicalJson(bundle.reviews)),
    provenance: sha256(canonicalJson(bundle.provenance)),
    identityKeys: sha256(canonicalJson(bundle.identityKeys)),
    pairKeys: sha256(canonicalJson(bundle.pairKeys)),
    calibrationAnswers: sha256(canonicalJson(bundle.calibrationAnswers)),
  };
  const scenarioIds = bundle.scenarios.map(({ id }) => id).sort();
  const pairIds = bundle.pairKeys.map(({ pairId }) => pairId).sort();
  const identity = {
    stage: 'benchmark' as const,
    predecessorV5BundleHash: bundle.predecessorV5BundleHash,
    candidateBundleHash: calibration.candidateBundleHash,
    judgeCalibrationBatchHash: calibration.judgeCalibrationBatchHash,
    scenarioIds,
    pairIds,
    hashes,
  };
  return {
    schemaVersion: 1,
    scenarioSetVersion: '6.0.0',
    frozenAt,
    ...identity,
    bundleHash: sha256(canonicalJson(identity)),
  };
};

~~~

~~~ts
export const freezeEvaluationV6Bundle = async (
  root: string,
  input: EvaluationV6BundleInput,
  calibration: { passed: boolean; candidateBundleHash: string; batchHash: string },
) => {
  const validated = validateEvaluationV6CandidateBundle({ ...input, manifest: null });
  assertEvaluationV6AuditReady(validated.auditResult);
  const candidateBundleHash = buildEvaluationV6CandidateHash(validated);
  if (!calibration.passed || calibration.candidateBundleHash !== candidateBundleHash) {
    throw new Error('Evaluation v6 freeze requires matching passed Judge calibration');
  }
  const reviews = validated.reviews.map((review) => ({
    ...review,
    status: 'approved' as const,
    calibrationPassed: true,
    reviewedAt: review.reviewedAt ?? new Date().toISOString(),
  }));
  const finalBundle = validateEvaluationV6CandidateBundle({ ...input, reviews, manifest: null });
  const manifest = buildEvaluationV6FrozenManifest(finalBundle, {
    candidateBundleHash,
    judgeCalibrationBatchHash: calibration.batchHash,
  });
  await writeJsonAtomic(evaluationV6Paths(root).reviews, { scenarioSetVersion: '6.0.0', reviews });
  await writeJsonAtomic(evaluationV6Paths(root).manifest, manifest);
  return manifest;
};

export const checkEvaluationV6Bundle = async (root: string) => {
  const bundle = await loadEvaluationV6Bundle(root);
  return {
    version: '6.0.0',
    scenarioCount: bundle.scenarios.length,
    pairCount: bundle.pairKeys.length,
    bundleHash: bundle.manifest.bundleHash,
    predecessorV5BundleHash: bundle.manifest.predecessorV5BundleHash,
    evidenceClasses: Object.fromEntries(
      EVALUATION_V6_EVIDENCE_CLASSES.map((evidenceClass) => [
        evidenceClass,
        bundle.identityKeys.filter((key) => key.evidenceClass === evidenceClass).length,
      ]),
    ),
  };
};

export const checkEvaluationV6CandidateBundle = async (root: string) => {
  const bundle = await loadEvaluationV6CandidateBundle(root);
  return {
    scenarioCount: bundle.scenarios.length,
    pairCount: bundle.pairKeys.length,
    candidateBundleHash: buildEvaluationV6CandidateHash(bundle),
  };
};

~~~

The manifest records predecessorV5BundleHash and hashes for audit, replacement ledger, scenarios, reviews, provenance, identity keys, pair keys, and calibration answers. The test snapshots v5 fixture bytes before freeze and asserts equality afterward.
loadEvaluationV6CandidateBundle validates evidence, identity, anonymization, and 90 controlled answers while allowing calibrationPassed false. loadEvaluationV6Bundle additionally requires a non-null current manifest, every review status approved, every calibrationPassed true, and manifest hashes that match current files.


- [ ] **Step 5: Complete the live 30-item evidence checkpoint**

For each v5 scenario:

1. retain only for direct_observed, contrast_observed, or reviewed bounded_policy_transfer without a new inferred reversal.
2. replace every unsupported_reversal, generic_only, or ambiguous_key item.
3. Build each replacement from an anonymous external motif plus an independently established Amy Identity Key.
4. Reallocate a pair to an evidence-rich domain if M&A or pricing cannot supply observed Amy boundaries.
5. Preserve coverage gaps in the ledger instead of weakening admission.
Use one short review action per A/B pair:

- [ ] Audit AAS-V5-MA-01-A/B and record separate initial/changed evidence classes.
- [ ] Audit AAS-V5-MA-02-A/B and reject any unobserved abandon/restart boundary.
- [ ] Audit AAS-V5-MA-03-A/B and verify that changed action is directly bounded by Amy evidence.
- [ ] Audit AAS-V5-AI-01-A/B against the reviewed capacity-demand contrast.
- [ ] Audit AAS-V5-AI-02-A/B against project pacing and infrastructure economics.
- [ ] Audit AAS-V5-AI-03-A/B against capacity urgency and reversible asset boundaries.
- [ ] Audit AAS-V5-PM-01-A/B and distinguish value realization from generic customer caution.
- [ ] Audit AAS-V5-PM-02-A/B and verify an observed pricing adjustment boundary.
- [ ] Audit AAS-V5-PM-03-A/B and exclude the unsupported postponement key.
- [ ] Audit AAS-V5-CE-01-A/B against cost/revenue alignment evidence.
- [ ] Audit AAS-V5-CE-02-A/B against resource reallocation evidence.
- [ ] Audit AAS-V5-CE-03-A/B against the reviewed operating-efficiency contrast.
- [ ] Audit AAS-V5-SR-01-A/B against capital-return timing evidence.
- [ ] Audit AAS-V5-SR-02-A/B against liquidity and reinvestment priority.
- [ ] Audit AAS-V5-SR-03-A/B against the reviewed buyback-deployment contrast.

After these 15 actions, process replacement-ledger.json one row at a time: admit the replacement only after its Amy evidence IDs, external motif ID, decision axis, public scenario, Identity Key, pair key, and controlled answer triplet all validate. Run audit-check after every admitted row so the failing row remains identifiable.


~~~bash
npm run evaluation:v6:run -- audit-check
npm run evaluation:v6:run -- candidate-check
~~~

Expected: 30 audited items, zero research_required replacements, 30 scenario IDs, 15 pair IDs, and a 64-character candidate bundle hash. No final manifest exists yet. If evidence remains insufficient, preserve the explicit failure.

- [ ] **Step 6: Run tests, verify v5, and commit**

~~~bash
npx tsx --test tests/amyHoodEvaluationV6ScenarioSet.test.ts
git diff --exit-code -- evaluation/v5/public evaluation/v5/sealed evaluation/v5/sources
git add server/evaluationV6/scenarioSet.ts tests/helpers/evaluationV6Fixture.ts tests/amyHoodEvaluationV6ScenarioSet.test.ts evaluation/v6/public evaluation/v6/sealed evaluation/v6/audit
git commit -m "feat: add evidence-grounded Evaluation v6 candidate"
~~~

### Task 4: Deterministic Identity Score and Mandatory Ceilings

**Files:**
- Create: server/evaluationV6/scoring.ts
- Create: tests/amyHoodEvaluationV6Scoring.test.ts

**Interfaces:**
- Produces: computeEvaluationV6IdentityScore(assessment).
- The LLM supplies component judgments only; TypeScript supplies final score and ceilings.

- [ ] **Step 1: Write scoring tests first**

~~~ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - Convert five fully aligned component ratings into an uncapped and final score of 10.
 * 2. Edge Cases:
 *    - Cap a fluent generic CFO answer at 6.
 *    - Cap a correct action with materially different priority order at 7.
 *    - Apply the strictest ceiling when missing reversal and identity conflict overlap.
 * 3. Failure Path:
 *    - Reject missing, fractional, negative, and above-four component ratings.
 */
~~~

Assert exact values and exact ceiling names for all five cases.

- [ ] **Step 2: Run and confirm RED**

~~~bash
npx tsx --test tests/amyHoodEvaluationV6Scoring.test.ts
~~~

Expected: module-not-found failure for server/evaluationV6/scoring.ts.

- [ ] **Step 3: Implement the pure scoring function**

~~~ts
import type { EvaluationV6Grade, EvaluationV6JudgeAssessment } from '../../shared/amyHoodEvaluationV6';
import { assertEvaluationV6ComponentRating } from '../../shared/amyHoodEvaluationV6';

const weights = {
  action: 0.20,
  priorityOrder: 0.25,
  boundaries: 0.20,
  reversal: 0.20,
  identitySpecificity: 0.15,
} as const;

export const computeEvaluationV6IdentityScore = (
  assessment: EvaluationV6JudgeAssessment,
): Pick<EvaluationV6Grade, 'score' | 'uncappedScore' | 'ceilingApplied'> => {
  for (const component of Object.keys(weights) as Array<keyof typeof weights>) {
    assertEvaluationV6ComponentRating(assessment.components[component]);
  }
  const weightedFraction = (Object.keys(weights) as Array<keyof typeof weights>)
    .reduce((sum, component) =>
      sum + (assessment.components[component] / 4) * weights[component], 0);
  const uncappedScore = Math.round(1 + 9 * weightedFraction) as EvaluationV6Grade['uncappedScore'];
  const ceilings: Array<{ name: string; max: number }> = [];
  if (assessment.identityVerdict === 'generic_cfo') {
    ceilings.push({ name: 'generic_cfo_max_6', max: 6 });
  }
  if (assessment.components.action >= 3 && assessment.components.priorityOrder <= 1) {
    ceilings.push({ name: 'priority_mismatch_max_7', max: 7 });
  }
  if (assessment.components.boundaries <= 1 || assessment.components.reversal <= 1) {
    ceilings.push({ name: 'missing_boundary_or_reversal_max_6', max: 6 });
  }
  if (assessment.identityVerdict === 'amy_conflict') {
    ceilings.push({ name: 'identity_conflict_max_4', max: 4 });
  }
  const highScoreAnchors = assessment.components.action >= 3
    && assessment.components.priorityOrder >= 3
    && assessment.components.boundaries >= 3
    && assessment.components.reversal >= 3
    && assessment.components.identitySpecificity >= 3;
  if (!highScoreAnchors) {
    ceilings.push({ name: 'high_score_identity_requirements_max_7', max: 7 });
  }
  const ceiling = Math.min(10, ...ceilings.map(({ max }) => max));
  return {
    uncappedScore,
    score: Math.min(uncappedScore, ceiling) as EvaluationV6Grade['score'],
    ceilingApplied: ceilings.filter(({ max }) => max === ceiling).map(({ name }) => name),
  };
};
~~~

- [ ] **Step 4: Run tests and commit**

~~~bash
npx tsx --test tests/amyHoodEvaluationV6Scoring.test.ts
git add server/evaluationV6/scoring.ts tests/amyHoodEvaluationV6Scoring.test.ts
git commit -m "feat: enforce Amy identity score ceilings"
~~~

### Task 5: Blind v6 Judge Packets and Atomic Grade Activation

**Files:**
- Create: server/evaluationV6/judge.ts
- Create: tests/amyHoodEvaluationV6Judge.test.ts

**Interfaces:**
- Produces: buildEvaluationV6JudgePacket(scenario, response, identityKey).
- Produces: assertEvaluationV6JudgePacketsBlind(value).
- Produces: exportEvaluationV6JudgePackets(root, groupId, options).
- Produces: importEvaluationV6Grades(root, groupId, payload).
- Produces: exportEvaluationV6PairJudgePackets(root, groupId) and importEvaluationV6PairGrades(root, groupId, payload).

- [ ] **Step 1: Write blind packet tests first**

~~~ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - Export 90 blind v6 packets for one repetition and 225 formal pair packets, then atomically activate valid grades.
 * 2. Edge Cases:
 *    - Preserve the 450-packet formal export when repetition is omitted.
 *    - Remove evidence IDs while retaining the substantive Amy Identity Key.
 *    - Accept shuffled grades when packet IDs and hashes map exactly once.
 * 3. Failure Path:
 *    - Reject arm/model/retrieval/external-identity leakage, stale hashes, duplicates, and partial batches without moving active.json.
 */
~~~

- [ ] **Step 2: Run and confirm RED**

~~~bash
npx tsx --test tests/amyHoodEvaluationV6Judge.test.ts
~~~

Expected: module-not-found failure for server/evaluationV6/judge.ts.

- [ ] **Step 3: Implement the private/public packet split**

~~~ts
const judgeIdentityKey = (key: EvaluationV6IdentityKey) => ({
  expectedAction: key.expectedAction,
  amyPriorityOrder: key.amyPriorityOrder,
  amyBoundaryConditions: key.amyBoundaryConditions,
  amyReversalRule: key.amyReversalRule,
  amySpecificRationale: key.amySpecificRationale,
  acceptableVariants: key.acceptableVariants,
  genericCfoFoil: key.genericCfoFoil,
  identityConflicts: key.identityConflicts,
});

const forbiddenKeys = new Set([
  'arm', 'model', 'provider', 'runId', 'retrieval', 'policyId', 'scenarioId',
  'pairId', 'phase', 'predecessorScenarioId', 'evidenceClass', 'amyEvidenceIds',
  'externalMotifEventId', 'externalEventId', 'executiveName', 'organization',
  'sourceIds', 'primarySourceId', 'secondarySourceIds', 'actualHistoricalAction',
]);

export const assertEvaluationV6JudgePacketsBlind = (value: unknown) => {
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) return item.forEach(visit);
    if (!item || typeof item !== 'object') return;
    for (const [key, child] of Object.entries(item as Record<string, unknown>)) {
      if (forbiddenKeys.has(key)) throw new Error('Evaluation v6 blind packet leakage: ' + key);
      visit(child);
    }
  };
  visit(value);
};
~~~

Private links retain packetId, experimentGroupId, runId, arm, repetition, and scenarioId only in judge/packets/group-id/individual-private-links.json. Public hashes exclude private links.

- [ ] **Step 4: Activate only a complete reproducible grade batch**

~~~ts
for (const grade of payload.grades) {
  const packet = packetById.get(grade.packetId);
  if (!packet || packet.packetHash !== grade.packetHash) {
    throw new Error('Evaluation v6 grade packet identity is stale: ' + grade.packetId);
  }
  const recomputed = computeEvaluationV6IdentityScore(grade);
  if (grade.score !== recomputed.score
    || grade.uncappedScore !== recomputed.uncappedScore
    || canonicalJson(grade.ceilingApplied) !== canonicalJson(recomputed.ceilingApplied)) {
    throw new Error('Evaluation v6 grade score is not reproducible: ' + grade.packetId);
  }
}
await writeJsonAtomic(immutableBatchPath, payload);
await writeJsonAtomic(activePointerPath, { batchHash: payload.batchHash, activatedAt: now() });
~~~

Validate exactly the packet count stored in the export. No validation failure may create or move active.json.

- [ ] **Step 5: Run tests and commit**

~~~bash
npx tsx --test tests/amyHoodEvaluationV6Judge.test.ts tests/amyHoodEvaluationV6Scoring.test.ts
git add server/evaluationV6/judge.ts tests/amyHoodEvaluationV6Judge.test.ts
git commit -m "feat: add blind Evaluation v6 judge packets"
~~~

### Task 6: Identity-Aware Local Gemma Judge and Calibration Gate

**Files:**
- Create: server/evaluationV6/localJudge.ts
- Create: server/evaluationV6/calibration.ts
- Create: evaluation/v6/judge/calibration/manual-review.json
- Create: tests/amyHoodEvaluationV6LocalJudge.test.ts
- Create: tests/amyHoodEvaluationV6Calibration.test.ts

**Interfaces:**
- Produces: runEvaluationV6LocalJudge(options).
- Produces: runEvaluationV6LocalPairJudge(options) for 225 formal A/B packets.
- Produces: runEvaluationV6LocalCalibration(options).
- Produces: validateEvaluationV6Calibration(answers, grades).

- [ ] **Step 1: Write local Judge tests first**

~~~ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - Judge 90 packets with rationale-first assessment, deterministic scores, and resumable checkpoints.
 * 2. Edge Cases:
 *    - Accept fenced assessment JSON.
 *    - Resume a matching model/prompt/batch checkpoint without duplicate calls.
 *    - Repair one malformed JSON response exactly once.
 * 3. Failure Path:
 *    - Preserve the draft and refuse activation on empty content, HTTP failure, stale identity, or a second invalid response.
 */
~~~

The fetch fixture asserts temperature 0, stream false, and chat_template_kwargs.enable_thinking false on every chat request.

- [ ] **Step 2: Write calibration tests first**

~~~ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - Approve 30 triplets when aligned, generic, conflict, anchor, leakage, and mean-gap gates all pass.
 * 2. Edge Cases:
 *    - Accept aligned score 8 and generic score 6 at exact boundaries.
 *    - Accept one repaired JSON response while preserving schema-valid rate 100%.
 *    - Accept shuffled triplets and grades with exact ID mapping.
 * 3. Failure Path:
 *    - Reject leakage, an allowed Amy variant below 8, gap below 2.5, wrong anchor, incomplete manual review, duplicates, and incomplete triplets.
 */
~~~

- [ ] **Step 3: Run both tests and confirm RED**

~~~bash
npx tsx --test tests/amyHoodEvaluationV6LocalJudge.test.ts tests/amyHoodEvaluationV6Calibration.test.ts
~~~

Expected: module-not-found failures for both modules.

- [ ] **Step 4: Implement rationale-first Gemma calls**

~~~ts
export const IDENTITY_RATIONALE_SYSTEM = [
  'You are a blind evaluator of Amy Hood decision-policy fidelity, not general CFO answer quality.',
  'Use only the anonymous scenario, candidate response, and frozen Amy Identity Key.',
  'First identify one Amy-specific priority, boundary, reversal, or conflict that distinguishes the candidate from a generic CFO answer.',
  'Fluency, detail, confidence, and generic financial prudence do not increase fidelity.',
  'Return exactly one Korean sentence and no numeric score.',
].join(' ');

export const IDENTITY_ASSESSMENT_SYSTEM = [
  'Evaluate Amy Hood identity fidelity only.',
  'Return JSON with identityVerdict, components, anchorFindings, and distinguishingAnchor.',
  'Each component action, priorityOrder, boundaries, reversal, identitySpecificity is an integer 0 through 4.',
  'identityVerdict is amy_aligned, amy_partial, generic_cfo, or amy_conflict.',
  'Do not return score, uncappedScore, or ceilingApplied; the host calculates them.',
].join(' ');

const requestBody = {
  model,
  temperature: 0,
  stream: false,
  max_tokens: 420,
  chat_template_kwargs: { enable_thinking: false },
  messages: [
    { role: 'system', content: system },
    { role: 'user', content: canonicalJson(userPayload) },
  ],
};
~~~
Validate both local responses before scoring:

~~~ts
const assertIdentityRationale = (value: string) => {
  const normalized = value.trim();
  if (!normalized || normalized.length > 500 || /[\r\n]/.test(normalized) || /\b\d{1,2}\s*점\b/.test(normalized)) {
    throw new Error('Evaluation v6 Judge rationale must be one non-numeric sentence');
  }
  return normalized;
};

export const parseEvaluationV6JudgeAssessment = (text: string): Omit<EvaluationV6JudgeAssessment, 'rationale'> => {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const value = JSON.parse(cleaned) as Record<string, unknown>;
  const allowedKeys = ['identityVerdict', 'components', 'anchorFindings', 'distinguishingAnchor'];
  if (Object.keys(value).length !== allowedKeys.length
    || Object.keys(value).some((key) => !allowedKeys.includes(key))) {
    throw new Error('Evaluation v6 Judge assessment has unknown or missing fields');
  }
  const components = value.components as Record<string, unknown>;
  if (!components || Object.keys(components).length !== EVALUATION_V6_COMPONENTS.length) {
    throw new Error('Evaluation v6 Judge components are invalid');
  }
  for (const component of EVALUATION_V6_COMPONENTS) {
    assertEvaluationV6ComponentRating(components[component]);
  }
  const verdicts = new Set(['amy_aligned', 'amy_partial', 'generic_cfo', 'amy_conflict']);
  if (!verdicts.has(String(value.identityVerdict))) {
    throw new Error('Evaluation v6 Judge identity verdict is invalid');
  }
  const anchors = value.anchorFindings as Record<string, unknown>;
  const anchorNames = ['action', 'priority', 'guardrails', 'reversal'];
  const findings = new Set(['aligned', 'partial', 'missing', 'conflict']);
  if (!anchors || Object.keys(anchors).length !== 4
    || anchorNames.some((name) => !findings.has(String(anchors[name])))) {
    throw new Error('Evaluation v6 Judge anchor findings are invalid');
  }
  const distinguishing = value.distinguishingAnchor as Record<string, unknown>;
  const kinds = new Set(['action', 'priority_order', 'boundary_condition', 'reversal_rule', 'identity_conflict']);
  if (!distinguishing || !kinds.has(String(distinguishing.kind))
    || typeof distinguishing.statement !== 'string' || !distinguishing.statement.trim()) {
    throw new Error('Evaluation v6 Judge distinguishing anchor is invalid');
  }
  return value as Omit<EvaluationV6JudgeAssessment, 'rationale'>;
};
~~~


~~~ts
const assessPacket = async (packet: EvaluationV6JudgePacket) => {
  const rationale = assertIdentityRationale(await invoke({
    system: IDENTITY_RATIONALE_SYSTEM,
    userPayload: packet,
    maxTokens: 300,
  }));
  const payload = { packet, rationale };
  const firstText = await invoke({
    system: IDENTITY_ASSESSMENT_SYSTEM,
    userPayload: payload,
    maxTokens: 420,
  });
  try {
    return { rationale, ...parseEvaluationV6JudgeAssessment(firstText), repaired: false };
  } catch (firstError) {
    const repairedText = await invoke({
      system: IDENTITY_ASSESSMENT_SYSTEM
        + ' The previous response failed validation. Return corrected JSON only.',
      userPayload: { ...payload, invalidResponse: firstText },
      maxTokens: 420,
    });
    try {
      return { rationale, ...parseEvaluationV6JudgeAssessment(repairedText), repaired: true };
    } catch {
      throw firstError;
    }
  }
};
~~~

After parsing the assessment, attach the rationale, call computeEvaluationV6IdentityScore, and save the draft after each packet. A checkpoint is reusable only if batch hash, model, base URL, both prompt hashes, and scoring-config hash all match.
runEvaluationV6LocalCalibration loads the candidate bundle, calculates buildEvaluationV6CandidateHash, creates exactly 90 blind controlled packets, and stores that candidateBundleHash in the active calibration record. It never requires or creates the final v6 manifest.
For formal transition grading, runEvaluationV6LocalPairJudge receives all 225 A/B packets. It uses this additional prompt and passes the returned components through the same deterministic score function:

~~~ts
export const IDENTITY_PAIR_ASSESSMENT_SYSTEM = [
  IDENTITY_ASSESSMENT_SYSTEM,
  'Compare the initial and changed answers against both Amy Identity Keys and the frozen pair transition key.',
  'Also return aligned, expectedResponseFinding, changedSignalFinding, and invariantFinding.',
  'A fluent transition that crosses an unsupported Amy reversal boundary is amy_conflict.',
].join(' ');
~~~

A complete pair batch is activated only after all 225 packet hashes and recomputed scores validate. Persona calibration does not require pair grades; the formal report does.

Before activation, manual-review.json must contain one approved record for every replacementScenarioId. Each record has targetType replacement, targetId, decision approved or revise, reviewer Codex, reviewedAt, and a non-empty rationale. Any failed calibration triplet is appended as targetType calibration_failure and decision revise; the failed batch remains immutable and inactive. A new batch may be activated only after the item/key/Judge revision passes and the reviewer records the resolution.


- [ ] **Step 5: Implement the 90-answer calibration gate**

~~~ts
export const validateEvaluationV6Calibration = (
  answers: EvaluationV6CalibrationAnswer[],
  grades: EvaluationV6Grade[],
) => {
  if (answers.length !== 90 || grades.length !== 90) {
    throw new Error('Evaluation v6 calibration requires exactly ninety answers and grades');
  }
  const gradeById = new Map(grades.map((grade) => [grade.packetId, grade]));
  if (gradeById.size !== 90) throw new Error('Evaluation v6 calibration grades contain duplicates');
  const rows = answers.map((answer) => {
    const grade = gradeById.get(answer.calibrationId);
    if (!grade) throw new Error('missing Evaluation v6 calibration grade: ' + answer.calibrationId);
    if (grade.distinguishingAnchor.kind !== answer.expectedAnchor) {
      throw new Error('wrong Evaluation v6 distinguishing anchor: ' + answer.scenarioId);
    }
    const anchorText = (grade.rationale + ' ' + grade.distinguishingAnchor.statement).toLocaleLowerCase('ko-KR');
    if (answer.expectedAnchorTerms.length === 0
      || !answer.expectedAnchorTerms.some((term) => anchorText.includes(term.toLocaleLowerCase('ko-KR')))) {
      throw new Error('Evaluation v6 rationale does not name the expected Amy anchor: ' + answer.scenarioId);
    }
    return { answer, grade };
  });
  const aligned = rows.filter(({ answer }) => answer.answerType === 'amy_aligned');
  const generic = rows.filter(({ answer }) => answer.answerType === 'generic_cfo');
  const conflict = rows.filter(({ answer }) => answer.answerType === 'amy_conflict');
  const scoreByCell = new Map(rows.map(({ answer, grade }) => [
    answer.scenarioId + ':' + answer.answerType, grade.score,
  ]));
  const gaps = aligned.map(({ answer, grade }) =>
    grade.score - scoreByCell.get(answer.scenarioId + ':generic_cfo')!);
  const metrics = {
    genericLeakageRate: generic.filter(({ grade }) => grade.score > 6).length / 30,
    conflictLeakageRate: conflict.filter(({ grade }) => grade.score > 4).length / 30,
    amyPassRate: aligned.filter(({ grade }) => grade.score >= 8).length / 30,
    meanIdentityGap: gaps.reduce((sum, value) => sum + value, 0) / gaps.length,
    schemaValidRate: grades.length / answers.length,
  };
  const passed = metrics.genericLeakageRate === 0
    && metrics.conflictLeakageRate === 0
    && metrics.amyPassRate === 1
    && metrics.meanIdentityGap >= 2.5
    && metrics.schemaValidRate === 1
    && gaps.every((value) => value >= 2);
  if (!passed) throw new Error('Evaluation v6 Judge calibration failed: ' + JSON.stringify(metrics));
  return { passed, metrics };
};

export const activateEvaluationV6Calibration = async (
  root: string,
  batch: {
    batchHash: string;
    candidateBundleHash: string;
    metrics: ReturnType<typeof validateEvaluationV6Calibration>['metrics'];
  },
  replacementIds: string[],
  manualReviews: Array<{
    targetType: 'replacement' | 'calibration_failure';
    targetId: string;
    decision: 'approved' | 'revise';
    reviewer: 'Codex';
    reviewedAt: string;
    rationale: string;
  }>,
) => {
  if (replacementIds.some((targetId) => !manualReviews.some((review) =>
    review.targetType === 'replacement' && review.targetId === targetId
    && review.decision === 'approved' && review.reviewer === 'Codex'
    && !Number.isNaN(Date.parse(review.reviewedAt)) && review.rationale.trim()))) {
    throw new Error('Evaluation v6 replacement manual review is incomplete');
  }
  await writeJsonAtomic(
    path.join(evaluationV6Paths(root).calibration, 'active.json'),
    { ...batch, passed: true, activatedAt: new Date().toISOString() },
  );
};

export const loadActiveEvaluationV6Calibration = async (root: string) => {
  const value = await readJsonFile<{
    batchHash: string;
    candidateBundleHash: string;
    passed: boolean;
    metrics: ReturnType<typeof validateEvaluationV6Calibration>['metrics'];
    activatedAt: string;
  }>(path.join(evaluationV6Paths(root).calibration, 'active.json'));
  if (!value.passed || !/^[a-f0-9]{64}$/.test(value.batchHash)
    || !/^[a-f0-9]{64}$/.test(value.candidateBundleHash)) {
    throw new Error('Evaluation v6 active Judge calibration is invalid');
  }
  return value;
};

~~~

- [ ] **Step 6: Run tests and commit**

~~~bash
npx tsx --test tests/amyHoodEvaluationV6LocalJudge.test.ts tests/amyHoodEvaluationV6Calibration.test.ts
git add server/evaluationV6/localJudge.ts server/evaluationV6/calibration.ts tests/amyHoodEvaluationV6LocalJudge.test.ts tests/amyHoodEvaluationV6Calibration.test.ts
git commit -m "feat: calibrate identity-aware Gemma judge"
~~~

### Task 7: v6 Generation Runner and Calibration-First Launch Gate

**Files:**
- Create: server/evaluationV6/context.ts
- Create: server/evaluationV6/prompt.ts
- Create: server/evaluationV6/retrievalCache.ts
- Create: server/evaluationV6/runStore.ts
- Create: server/evaluationV6/runner.ts
- Create: tests/amyHoodEvaluationV6Runner.test.ts

**Interfaces:**
- Produces: createEvaluationV6Runner(options).
- createExperiment({ repetitions: 1 | 5 }) refuses launch without a frozen dataset and active passing calibration.
- Reuses the active Main Prompt, memory release, BGE-M3 index, hybrid retriever, and RAG context builder without changing persona code.
- Produces: EvaluationV6RagPin with memoryReleaseId, memoryReleaseHash, memoryIndexHash, and retrievalConfigHash strings.

- [ ] **Step 1: Write runner tests first**

~~~ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - Create and complete a 90-answer one-repetition run across three persona arms after both gates pass.
 * 2. Edge Cases:
 *    - Create a formal 450-answer launch with deterministic per-repetition order.
 *    - Resume after one failed scenario without regenerating completed answers.
 *    - Keep no-RAG answers free of memory pins and retrieval traces.
 * 3. Failure Path:
 *    - Refuse stale pins, missing calibration, external-motif retrieval leakage, malformed output, and mixed model identity.
 */
~~~

- [ ] **Step 2: Run and confirm RED**

~~~bash
npx tsx --test tests/amyHoodEvaluationV6Runner.test.ts
~~~

Expected: module-not-found failure for server/evaluationV6/runner.ts.

- [ ] **Step 3: Add v6 stores and prompt builder**

All writes use evaluationV6Paths. Keep the existing candidate response schema:

~~~ts
export const buildEvaluationV6Input = (
  systemPrompt: string,
  scenario: EvaluationV6Scenario,
  context: AmyHoodRenderedContext | null,
  arm: EvaluationV6Arm,
) => ({
  system: systemPrompt,
  user: [
    context ? context.context : '',
    'Scenario title: ' + scenario.title,
    'Situation: ' + scenario.situation,
    'Decision question: ' + scenario.decisionQuestion,
    'Return JSON only with action, exactly three priorities, guardrails, reversalSignals, and rationale.',
  ].filter(Boolean).join('\n\n'),
  metadata: { evaluationVersion: '6.0.0', arm },
});
~~~

context.ts pins active memory release, memory index, and retrieval config hashes. retrievalCache.ts keys records by query hash and index hash. runStore.ts validates IDs and uses writeJsonAtomic.

- [ ] **Step 4: Implement the launch gate and run matrix**

~~~ts
const buildRun = (input: {
  experimentGroupId: string;
  repetition: 1 | 2 | 3 | 4 | 5;
  arm: EvaluationV6Arm;
  scenarioOrder: string[];
  orderSeed: string;
  bundle: ValidatedEvaluationV6Bundle;
  prompt: { versionId: string; hash: string };
  ragPin: EvaluationV6RagPin;
}): EvaluationV6Run => {
  const ragEnabled = input.arm !== 'amy_prompt';
  return {
    runId: randomUUID(),
    version: '6.0.0',
    stage: 'benchmark',
    experimentGroupId: input.experimentGroupId,
    repetition: input.repetition,
    orderSeed: input.orderSeed,
    scenarioOrder: input.scenarioOrder,
    arm: input.arm,
    provider: 'local',
    model: options.createModel().model,
    scenarioSetHash: input.bundle.manifest.bundleHash,
    promptVersionId: input.prompt.versionId,
    promptHash: input.prompt.hash,
    memoryReleaseId: ragEnabled ? input.ragPin.memoryReleaseId : null,
    memoryReleaseHash: ragEnabled ? input.ragPin.memoryReleaseHash : null,
    memoryIndexHash: ragEnabled ? input.ragPin.memoryIndexHash : null,
    retrievalConfigHash: ragEnabled ? input.ragPin.retrievalConfigHash : null,
    status: 'queued',
    answers: [],
    startedAt: now(),
    completedAt: null,
  };
};
~~~

~~~ts
const createExperiment = async ({ repetitions }: { repetitions: 1 | 5 }) => {
  const [bundle, calibration, prompt, ragPin] = await Promise.all([
    loadEvaluationV6Bundle(options.root),
    loadActiveEvaluationV6Calibration(options.root),
    loadPrompt(),
    loadRagPin(),
  ]);
  if (!calibration.passed
    || bundle.manifest.candidateBundleHash !== calibration.candidateBundleHash
    || bundle.manifest.judgeCalibrationBatchHash !== calibration.batchHash) {
    throw new Error('Evaluation v6 Judge calibration is not approved for this bundle');
  }
  const repetitionValues = repetitions === 1 ? [1] as const : [1, 2, 3, 4, 5] as const;
  const experimentGroupId = randomUUID();
  const runs: EvaluationV6Run[] = [];
  for (const repetition of repetitionValues) {
    const orderSeed = sha256(experimentGroupId + ':' + repetition).slice(0, 16);
    const scenarioOrder = shuffledScenarioIds(bundle.scenarios.map(({ id }) => id), orderSeed);
    for (const arm of EVALUATION_V6_ARMS) {
      runs.push(await writeEvaluationV6Run(options.root, buildRun({
        experimentGroupId, repetition, arm, scenarioOrder, orderSeed, bundle, prompt, ragPin,
      })));
    }
  }
  return { experimentGroupId, repetitions, runs };
};
~~~

During execution, retrieve only for amy_policy_rag and amy_full_rag. Use policy projection for Policy RAG and full projection for Full RAG. The external motif event and frozen Identity Key never enter the generation prompt.
Use this execution loop after validating scenario, prompt, model, and RAG pins:

~~~ts
const executeRun = async (runId: string) => {
  let run = await readEvaluationV6Run(options.root, runId);
  if (run.status === 'complete') return run;
  const { bundle, prompt, ragPin } = await resolvePinnedInputs(run);
  const model = options.createModel();
  if (model.provider !== run.provider || model.model !== run.model) {
    throw new Error('Evaluation v6 model configuration is stale');
  }
  const retriever = ragPin ? await createRetriever() : null;
  const scenarioById = new Map(bundle.scenarios.map((scenario) => [scenario.id, scenario]));
  run = await writeEvaluationV6Run(options.root, { ...run, status: 'running' });
  for (const scenarioId of run.scenarioOrder) {
    if (run.answers.some((answer) => answer.scenarioId === scenarioId && answer.status === 'complete')) continue;
    const scenario = scenarioById.get(scenarioId)!;
    try {
      let context: AmyHoodRenderedContext | null = null;
      if (ragPin && retriever) {
        const query = [scenario.title, scenario.situation, scenario.decisionQuestion].join('\n');
        const retrieval = await readOrCreateEvaluationV6Retrieval({
          root: options.root,
          experimentGroupId: run.experimentGroupId,
          query,
          indexHash: ragPin.memoryIndexHash,
          retriever,
        });
        const externalMotifIds = new Set(
          bundle.provenance.map(({ externalMotifEventId }) => externalMotifEventId),
        );
        if (retrieval.selectedArtifacts.some(({ id }) => externalMotifIds.has(id))) {
          throw new Error('Evaluation v6 holdout leakage: external motif entered persona retrieval');
        }
        context = await buildAmyHoodRagContext({
          root: options.root,
          retrieval,
          projection: run.arm === 'amy_policy_rag' ? 'policy' : 'full',
          systemPrompt: prompt.content,
          userPrompt: query,
        });
      }
      const input = buildEvaluationV6Input(prompt.content, scenario, context, run.arm);
      const first = await model.invoke(input);
      let result = first;
      let response: EvaluationV5CandidateResponse;
      try {
        response = parseEvaluationV5CandidateResponse(first.text);
      } catch (error) {
        const repaired = await model.invoke({
          ...input,
          user: input.user + '\n\nThe previous response failed validation: '
            + (error instanceof Error ? error.message : 'invalid JSON')
            + '\nReturn corrected JSON only with the exact required fields.',
        });
        result = {
          ...repaired,
          elapsedMs: first.elapsedMs + repaired.elapsedMs,
          inputTokens: (first.inputTokens ?? 0) + (repaired.inputTokens ?? 0) || undefined,
          outputTokens: (first.outputTokens ?? 0) + (repaired.outputTokens ?? 0) || undefined,
        };
        response = parseEvaluationV5CandidateResponse(repaired.text);
      }
      run = await writeEvaluationV6Run(options.root, {
        ...run,
        answers: replaceEvaluationV6Answer(run.answers, {
          scenarioId,
          status: 'complete',
          response,
          elapsedMs: result.elapsedMs,
          ...(context ? { retrieval: context.trace } : {}),
        }),
      });
    } catch (error) {
      return writeEvaluationV6Run(options.root, {
        ...run,
        status: 'incomplete',
        answers: replaceEvaluationV6Answer(run.answers, {
          scenarioId,
          status: 'failed',
          elapsedMs: 0,
          error: error instanceof Error ? error.message : 'unknown Evaluation v6 error',
        }),
      });
    }
  }
  return writeEvaluationV6Run(options.root, {
    ...run,
    status: 'complete',
    completedAt: now(),
  });
};
~~~


- [ ] **Step 5: Run tests and commit**

~~~bash
npx tsx --test tests/amyHoodEvaluationV6Runner.test.ts
git add server/evaluationV6/context.ts server/evaluationV6/prompt.ts server/evaluationV6/retrievalCache.ts server/evaluationV6/runStore.ts server/evaluationV6/runner.ts tests/amyHoodEvaluationV6Runner.test.ts
git commit -m "feat: add calibration-gated Evaluation v6 runner"
~~~

### Task 8: CLI Workflow and Fail-Closed Commands

**Files:**
- Create: server/runAmyHoodEvaluationV6.ts
- Modify: tests/amyHoodEvaluationV6Contracts.test.ts

**Interfaces:**
- Adds commands: audit-init, audit-check, candidate-check, calibrate-local, freeze, check, create, execute, resume, judge-local, judge-pairs-local, report.

- [ ] **Step 1: Add failing CLI contract tests**

~~~ts
await assert.rejects(runAmyHoodEvaluationV6Command(['calibrate-local']), /--base-url/i);
await assert.rejects(runAmyHoodEvaluationV6Command(['create', '--repetitions', '2']), /1 or 5/i);
await assert.rejects(
  runAmyHoodEvaluationV6Command(['judge-local', '--group', 'g']),
  /--repetition.*--base-url/i,
);
await assert.rejects(runAmyHoodEvaluationV6Command(['unknown']), /audit-init.*report/i);
~~~

These assertions extend the Task 1 Test Plan; keep its one Happy Path, exactly three Edge Cases, and Failure Path sections unchanged.

- [ ] **Step 2: Run and confirm RED**

~~~bash
npx tsx --test tests/amyHoodEvaluationV6Contracts.test.ts
~~~

Expected: module-not-found failure for server/runAmyHoodEvaluationV6.ts.

- [ ] **Step 3: Implement command routing**

~~~ts
const option = (args: string[], name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const requiredOption = (args: string[], name: string) => {
  const value = option(args, name);
  if (!value) throw new Error('missing required option ' + name);
  return value;
};
const parseRepetitions = (value: string): 1 | 5 => {
  const parsed = Number(value);
  if (parsed !== 1 && parsed !== 5) throw new Error('repetitions must be 1 or 5');
  return parsed;
};
const parseRepetition = (value: string): 1 | 2 | 3 | 4 | 5 => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 5) {
    throw new Error('repetition must be 1 through 5');
  }
  return parsed as 1 | 2 | 3 | 4 | 5;
};

const loadUnfrozenEvaluationV6Input = async (root: string): Promise<EvaluationV6BundleInput> => {
  const paths = evaluationV6Paths(root);
  const [scenarioFile, reviewFile, auditFile, replacementFile, provenanceFile, keyFile, pairFile, calibrationFile, v5] = await Promise.all([
    readJsonFile<EvaluationV6ScenarioFile>(paths.scenarios),
    readJsonFile<{ reviews: EvaluationV6ScenarioReview[] }>(paths.reviews),
    readJsonFile<{ audits: EvaluationV6ItemAudit[] }>(paths.audit),
    readJsonFile<{ replacements: EvaluationV6ReplacementRecord[] }>(paths.replacementLedger),
    readJsonFile<{ provenance: EvaluationV6BundleInput['provenance'] }>(paths.provenance),
    readJsonFile<{ identityKeys: EvaluationV6IdentityKey[] }>(paths.identityKeys),
    readJsonFile<{ pairKeys: EvaluationV6PairKey[] }>(paths.pairKeys),
    readJsonFile<{ calibrationAnswers: EvaluationV6CalibrationAnswer[] }>(paths.calibrationAnswers),
    loadEvaluationV5Bundle(root),
  ]);
  return {
    scenarioFile,
    reviews: reviewFile.reviews,
    audits: auditFile.audits,
    replacements: replacementFile.replacements,
    provenance: provenanceFile.provenance,
    identityKeys: keyFile.identityKeys,
    pairKeys: pairFile.pairKeys,
    calibrationAnswers: calibrationFile.calibrationAnswers,
    predecessorV5BundleHash: v5.manifest!.bundleHash,
    manifest: null,
  };
};
~~~

~~~ts
if (command === 'audit-init') return initializeEvaluationV6Audit(root);
if (command === 'audit-check') return checkEvaluationV6Audit(root);
if (command === 'candidate-check') return checkEvaluationV6CandidateBundle(root);
if (command === 'freeze') return freezeEvaluationV6Bundle(
  root,
  await loadUnfrozenEvaluationV6Input(root),
  await loadActiveEvaluationV6Calibration(root),
);
if (command === 'check') return checkEvaluationV6Bundle(root);
if (command === 'calibrate-local') {
  return runEvaluationV6LocalCalibration({
    root,
    baseUrl: requiredOption(args, '--base-url').replace(/\/+$/, ''),
  });
}
if (command === 'create') {
  return runner.createExperiment({
    repetitions: parseRepetitions(requiredOption(args, '--repetitions')),
  });
}
if (command === 'execute') {
  return runner.executeExperiment(requiredOption(args, '--group'));
}
if (command === 'resume') {
  return runner.resumeRun(requiredOption(args, '--run'));
}
if (command === 'judge-local') {
  return runEvaluationV6LocalJudge({
    root,
    experimentGroupId: requiredOption(args, '--group'),
    repetition: parseRepetition(requiredOption(args, '--repetition')),
    baseUrl: requiredOption(args, '--base-url').replace(/\/+$/, ''),
  });
}
if (command === 'judge-pairs-local') {
  return runEvaluationV6LocalPairJudge({
    root,
    experimentGroupId: requiredOption(args, '--group'),
    baseUrl: requiredOption(args, '--base-url').replace(/\/+$/, ''),
  });
}
if (command === 'report') {
  return writeEvaluationV6HtmlReport(
    root,
    requiredOption(args, '--group'),
    requiredOption(args, '--html'),
  );
}
throw new Error(
  'expected audit-init, audit-check, candidate-check, calibrate-local, freeze, check, create, execute, resume, judge-local, judge-pairs-local, or report',
);
~~~

Do not expose a force or skip-calibration option.

- [ ] **Step 4: Run tests, type check, and commit**

~~~bash
npx tsx --test tests/amyHoodEvaluationV6Contracts.test.ts
npm run lint
git add server/runAmyHoodEvaluationV6.ts tests/amyHoodEvaluationV6Contracts.test.ts
git commit -m "feat: expose fail-closed Evaluation v6 CLI"
~~~

### Task 9: Identity Report, Live Calibration, and Formal Readiness

**Files:**
- Create: server/evaluationV6/report.ts
- Create: tests/amyHoodEvaluationV6Report.test.ts

**Interfaces:**
- Produces: buildEvaluationV6Report(root, groupId).
- Produces: writeEvaluationV6HtmlReport(root, groupId, outputPath).
- Reports KPI-only means, evidence coverage, component means, leakage, identity gaps, transition, retrieval, exclusions, replacements, and manual-review findings.

- [ ] **Step 1: Write report tests first**

~~~ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - Build a report from 450 answers and grades with arm/domain/component identity metrics.
 * 2. Edge Cases:
 *    - Build a clearly labeled 90-answer persona-calibration report.
 *    - Report domain reallocation and evidence-class counts without averaging excluded v5 items.
 *    - Escape scenario and rationale text in HTML.
 * 3. Failure Path:
 *    - Reject incomplete, stale, mixed-hash, uncalibrated, or privately leaked result batches.
 */
~~~

- [ ] **Step 2: Run and confirm RED**

~~~bash
npx tsx --test tests/amyHoodEvaluationV6Report.test.ts
~~~

Expected: module-not-found failure for server/evaluationV6/report.ts.

- [ ] **Step 3: Implement the report contract**

~~~ts
type ScoredRow = {
  arm: EvaluationV6Arm;
  scenarioId: string;
  grade: EvaluationV6Grade;
};
type PairScoredRow = {
  arm: EvaluationV6Arm;
  aligned: boolean;
  changedSignalFinding: 'aligned' | 'partial' | 'conflict';
  invariantFinding: 'aligned' | 'partial' | 'conflict';
};

const mean = (values: number[]) => {
  if (values.length === 0) throw new Error('cannot calculate an empty Evaluation v6 mean');
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};
const meanByArm = (rows: ScoredRow[]) => Object.fromEntries(
  EVALUATION_V6_ARMS.map((arm) => [
    arm,
    mean(rows.filter((row) => row.arm === arm).map(({ grade }) => grade.score)),
  ]),
) as Record<EvaluationV6Arm, number>;
const componentMeansByArm = (rows: ScoredRow[]) => Object.fromEntries(
  EVALUATION_V6_ARMS.map((arm) => [
    arm,
    Object.fromEntries(EVALUATION_V6_COMPONENTS.map((component) => [
      component,
      mean(rows.filter((row) => row.arm === arm).map(({ grade }) => grade.components[component])),
    ])),
  ]),
) as EvaluationV6ExperimentReport['componentMeans'];
const domainMeansByArm = (
  rows: ScoredRow[],
  scenarioById: Map<string, EvaluationV6Scenario>,
) => Object.fromEntries(EVALUATION_V6_ARMS.map((arm) => [
  arm,
  Object.fromEntries(EVALUATION_V6_DOMAINS.map((domain) => {
    const scores = rows.filter((row) =>
      row.arm === arm && scenarioById.get(row.scenarioId)?.domain === domain)
      .map(({ grade }) => grade.score);
    return [domain, scores.length === 0 ? undefined : mean(scores)];
  }).filter((entry) => entry[1] !== undefined)),
])) as EvaluationV6ExperimentReport['domainMeans'];
const verdictRatesByArm = (rows: ScoredRow[]) => Object.fromEntries(
  EVALUATION_V6_ARMS.map((arm) => {
    const armRows = rows.filter((row) => row.arm === arm);
    return [arm, Object.fromEntries(
      ['amy_aligned', 'amy_partial', 'generic_cfo', 'amy_conflict'].map((verdict) => [
        verdict,
        armRows.filter(({ grade }) => grade.identityVerdict === verdict).length / armRows.length,
      ]),
    )];
  }),
) as EvaluationV6ExperimentReport['identityVerdicts'];
const countBy = <T>(values: T[], select: (value: T) => string) =>
  values.reduce<Record<string, number>>((counts, value) => {
    const key = select(value);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
const transitionMetrics = (rows: PairScoredRow[]) => Object.fromEntries(
  EVALUATION_V6_ARMS.map((arm) => {
    const armRows = rows.filter((row) => row.arm === arm);
    return [arm, {
      pairAccuracy: armRows.filter(({ aligned }) => aligned).length / armRows.length,
      signalCitationRate: armRows.filter(({ changedSignalFinding }) => changedSignalFinding === 'aligned').length / armRows.length,
      invariantPreservationRate: armRows.filter(({ invariantFinding }) => invariantFinding === 'aligned').length / armRows.length,
    }];
  }),
) as EvaluationV6ExperimentReport['transition'];
const retrievalMetrics = (
  runs: EvaluationV6Run[],
  keys: EvaluationV6IdentityKey[],
): EvaluationV6ExperimentReport['retrieval'] => {
  const keyByScenario = new Map(keys.map((key) => [key.scenarioId, key]));
  const ragAnswers = runs.filter(({ arm }) => arm !== 'amy_prompt')
    .flatMap((run) => run.answers.map((answer) => ({ run, answer })));
  const mapped = ragAnswers.filter(({ answer }) => answer.retrieval?.selectedArtifacts
    .some(({ id }) => id === keyByScenario.get(answer.scenarioId)?.policyId)).length;
  const wrong = ragAnswers.filter(({ answer }) => !answer.retrieval?.noMatch
    && !answer.retrieval?.selectedArtifacts
      .some(({ id }) => id === keyByScenario.get(answer.scenarioId)?.policyId)).length;
  return {
    mappedPolicyRate: mapped / ragAnswers.length,
    wrongDomainRate: wrong / ragAnswers.length,
    evidenceAttachmentRate: ragAnswers.filter(({ answer }) =>
      (answer.retrieval?.evidenceIds.length ?? 0) > 0).length / ragAnswers.length,
    contextWithinBudgetRate: ragAnswers.filter(({ answer }) =>
      (answer.retrieval?.contextTokens ?? Infinity) <= 6_000
      && (answer.retrieval?.requestTokens ?? Infinity) <= 12_000).length / ragAnswers.length,
  };
};
~~~

~~~ts
const report: EvaluationV6ExperimentReport = {
  experimentGroupId,
  evaluationVersion: '6.0.0',
  runMode: repetitions === 1 ? 'persona_calibration' : 'formal',
  scenarioSetHash: bundle.manifest.bundleHash,
  judgeCalibration: calibration.metrics,
  armMeans: meanByArm(scored),
  componentMeans: componentMeansByArm(scored),
  domainMeans: domainMeansByArm(scored, scenarioById),
  identityVerdicts: verdictRatesByArm(scored),
  genericLeakageRate: calibration.metrics.genericLeakageRate,
  identityDiscriminationGap: calibration.metrics.meanIdentityGap,
  evidenceCoverage: countBy(bundle.identityKeys, ({ evidenceClass }) => evidenceClass),
  transition: repetitions === 1 ? null : transitionMetrics(pairScored),
  retrieval: retrievalMetrics(runs, bundle.identityKeys),
  judgeDiagnostics: {
    repairCount: scored.filter(({ grade }) => grade.repairApplied).length,
    manualDisagreementCount: manualReviews.filter(({ decision }) => decision === 'revise').length,
    manualReviewFindings: manualReviews.map(({ targetId, decision, rationale }) => ({
      targetId, decision, rationale,
    })),
  },
  itemLedger: {
    excludedV5: audit.audits.filter(({ decision }) => decision === 'replace'),
    replacements: audit.replacements,
  },
};
~~~

The HTML introduction states in Korean and English that the test measures Amy Hood identity fidelity, not general CFO competence. Show the five weights and mandatory ceilings in a visible table. Escape every dynamic string.

- [ ] **Step 4: Run all automated verification**

~~~bash
npx tsx --test tests/amyHoodEvaluationV6Report.test.ts
npm run evaluation:v6:test
npm run evaluation:v5:test
npm run lint
git diff --check
git diff --exit-code -- evaluation/v5/public evaluation/v5/sealed evaluation/v5/sources server/evaluationV5 shared/amyHoodEvaluationV5.ts
~~~

Expected: both v5 and v6 suites pass, TypeScript exits zero, whitespace is clean, and no tracked v5 implementation or artifact differs.

- [ ] **Step 5: Execute and freeze the 90-controlled Judge calibration**

With BGE-M3 on 8081, answer model on 8080, and Gemma Judge on 8082:

~~~bash
npm run evaluation:v6:run -- audit-check
npm run evaluation:v6:run -- candidate-check
npm run evaluation:v6:run -- calibrate-local --base-url http://127.0.0.1:8082/v1
npm run evaluation:v6:run -- freeze
npm run evaluation:v6:run -- check
git add evaluation/v6/public/reviews.json evaluation/v6/sealed/manifest.json evaluation/v6/judge/calibration
git commit -m "data: freeze calibrated Evaluation v6 benchmark"
~~~

Expected: Generic Leakage 0%, Conflict Leakage 0%, Amy Pass 100%, mean gap at least 2.5, followed by a final manifest pinned to the candidate and calibration batch hashes.

- [ ] **Step 6: Execute the 90-generated persona calibration**

~~~bash
PERSONA_JSON="$(npm run --silent evaluation:v6:run -- create --repetitions 1)"
PERSONA_GROUP="$(printf '%s' "$PERSONA_JSON" | jq -r '.experimentGroupId')"
npm run evaluation:v6:run -- execute --group "$PERSONA_GROUP"
npm run evaluation:v6:run -- judge-local --group "$PERSONA_GROUP" --repetition 1 --base-url http://127.0.0.1:8082/v1
npm run evaluation:v6:run -- report --group "$PERSONA_GROUP" --html docs/reports/2026-07-21-amy-hood-evaluation-v6-persona-calibration.html
~~~

Expected: 90 generated answers and 90 identity grades complete. Review this report before formal launch.

- [ ] **Step 7: Execute the formal 450-answer sequence after approval**

~~~bash
FORMAL_JSON="$(npm run --silent evaluation:v6:run -- create --repetitions 5)"
FORMAL_GROUP="$(printf '%s' "$FORMAL_JSON" | jq -r '.experimentGroupId')"
npm run evaluation:v6:run -- execute --group "$FORMAL_GROUP"
for repetition in 1 2 3 4 5; do
  npm run evaluation:v6:run -- judge-local \
    --group "$FORMAL_GROUP" \
    --repetition "$repetition" \
    --base-url http://127.0.0.1:8082/v1
done
npm run evaluation:v6:run -- judge-pairs-local \
  --group "$FORMAL_GROUP" \
  --base-url http://127.0.0.1:8082/v1
npm run evaluation:v6:run -- report \
  --group "$FORMAL_GROUP" \
  --html docs/reports/2026-07-21-amy-hood-evaluation-v6-formal.html
~~~

Expected: 450 complete answers and 450 reproducible identity grades. Pair-transition grading uses Amy-specific boundaries and never admits the external CFO action as an Amy key.

- [ ] **Step 8: Commit the report implementation**

~~~bash
git add server/evaluationV6/report.ts tests/amyHoodEvaluationV6Report.test.ts evaluation/v6/reports docs/reports/2026-07-21-amy-hood-evaluation-v6-persona-calibration.html docs/reports/2026-07-21-amy-hood-evaluation-v6-formal.html
git commit -m "feat: report Evaluation v6 identity fidelity"
~~~

---

## Final Verification Checklist

- [ ] npm run evaluation:v6:test passes.
- [ ] npm run evaluation:v5:test passes unchanged.
- [ ] npm run lint passes.
- [ ] git diff --check reports no whitespace errors.
- [ ] The v5 immutability diff command prints nothing.
- [ ] The live audit reports exactly 30 reviewed v5 items and no research_required replacement.
- [ ] The v6 manifest contains 30 scenarios, 15 pairs, and the predecessor v5 bundle hash.
- [ ] Blind-packet tests cover arm, model, provider, retrieval, external identity, and source IDs.
- [ ] The 90 controlled answers satisfy all Judge calibration thresholds.
- [ ] A 90-answer persona calibration completes before formal launch.
- [ ] The formal report averages only v6 KPI-admitted items and lists every excluded/replaced v5 item separately.
