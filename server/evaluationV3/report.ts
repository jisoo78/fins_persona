import {
  EVALUATION_V3_ARMS,
  type EvaluationV3Arm,
  type EvaluationV3ArmAggregate,
  type EvaluationV3CategoryResult,
  type EvaluationV3ExperimentReport,
  type EvaluationV3LiftReport,
  type EvaluationV3Run,
  type EvaluationV3RunReport,
  type EvaluationV3Statistic,
} from '../../shared/amyHoodEvaluationV3';
import type { EvaluationV3HoldoutManifest } from './holdout';

const questionIds = [
  ...Array.from({ length: 10 }, (_, index) => `D${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 10 }, (_, index) => `H${String(index + 1).padStart(2, '0')}`),
  'C01A', 'C01B', 'C02A', 'C02B', 'C03A', 'C03B',
  'T01', 'T02', 'T03', 'T04',
];
const questionIdSet = new Set(questionIds);

const categoryResult = (
  run: EvaluationV3Run,
  prefix: 'D' | 'H' | 'C' | 'T',
  total: number,
): EvaluationV3CategoryResult => ({
  correct: run.answers.filter(({ questionId, correct }) =>
    questionId.startsWith(prefix) && correct).length,
  total,
});

const runReport = (run: EvaluationV3Run): EvaluationV3RunReport => {
  const totalCorrect = run.answers.filter(({ correct }) => correct).length;
  const choices = new Map(run.answers.map(({ questionId, choice }) => [questionId, choice]));
  const pairs = ['C01', 'C02', 'C03']
    .map((pair) => [choices.get(`${pair}A`), choices.get(`${pair}B`)] as const)
    .filter(([left, right]) => left !== undefined && right !== undefined);
  return {
    runId: run.runId,
    status: run.status,
    percent: run.status === 'complete' ? (totalCorrect / 30) * 100 : null,
    categories: {
      discrimination: categoryResult(run, 'D', 10),
      holdout: categoryResult(run, 'H', 10),
      counterfactual: categoryResult(run, 'C', 6),
      transfer: categoryResult(run, 'T', 4),
    },
    pairConsistency: pairs.length === 3
      ? pairs.filter(([left, right]) => left !== right).length / 3
      : null,
  };
};

const lift = (
  left: EvaluationV3RunReport,
  right: EvaluationV3RunReport,
) => left.percent === null || right.percent === null
  ? null
  : left.percent - right.percent;

const liftReport = (
  arms: Record<EvaluationV3Arm, EvaluationV3RunReport>,
): EvaluationV3LiftReport => ({
  amyPromptLift: lift(arms.amy_prompt, arms.generic_cfo),
  policyRagLift: lift(arms.amy_policy_rag, arms.amy_prompt),
  fullRagLift: lift(arms.amy_full_rag, arms.amy_policy_rag),
  fullVsGenericLift: lift(arms.amy_full_rag, arms.generic_cfo),
});

const statistics = (values: number[]): EvaluationV3Statistic | null => {
  if (values.length === 0) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0)
    / values.length;
  return {
    mean,
    min: Math.min(...values),
    max: Math.max(...values),
    populationStdDev: Math.sqrt(variance),
  };
};

const armAggregate = (
  arm: EvaluationV3Arm,
  runs: EvaluationV3Run[],
): EvaluationV3ArmAggregate => {
  const armRuns = runs.filter((run) => run.arm === arm);
  const complete = armRuns.filter((run) => run.status === 'complete');
  const percents = complete.map((run) =>
    (run.answers.filter(({ correct }) => correct).length / 30) * 100);
  const choiceAgreement = Object.fromEntries(questionIds.map((questionId) => {
    const choices = armRuns.flatMap((run) => {
      const answer = run.answers.find((item) =>
        item.questionId === questionId && item.status === 'complete');
      return answer?.choice ? [answer.choice] : [];
    });
    if (choices.length === 0) return [questionId, 0];
    const counts = new Map<number, number>();
    choices.forEach((choice) => counts.set(choice, (counts.get(choice) ?? 0) + 1));
    return [questionId, Math.max(...counts.values()) / choices.length];
  }));
  const agreements = Object.values(choiceAgreement);
  return {
    arm,
    completedRuns: complete.length,
    totalRuns: armRuns.length,
    percent: statistics(percents),
    choiceAgreement,
    overallChoiceAgreement: agreements.length
      ? agreements.reduce((sum, value) => sum + value, 0) / agreements.length
      : null,
  };
};

const validateRuns = (runs: EvaluationV3Run[]) => {
  if (runs.length !== 4 && runs.length !== 20) {
    throw new Error('Evaluation v3 report requires four or twenty runs');
  }
  if (new Set(runs.map(({ experimentGroupId }) => experimentGroupId)).size !== 1) {
    throw new Error('Evaluation v3 report requires one experiment group');
  }
  if (runs.some(({ version, questionSetVersion }) =>
    version !== '3.0.0' || questionSetVersion !== '3.0.0')) {
    throw new Error('Evaluation v3 report requires version 3.0.0');
  }
  for (const run of runs) {
    const ids = run.answers.map(({ questionId }) => questionId);
    if (new Set(ids).size !== ids.length || ids.some((id) => !questionIdSet.has(id))) {
      throw new Error(`invalid answers in Evaluation v3 run: ${run.runId}`);
    }
    if (run.status === 'complete'
      && (run.answers.length !== 30
        || run.answers.some(({ status, choice }) => status !== 'complete' || !choice))) {
      throw new Error(`complete run requires 30 answers: ${run.runId}`);
    }
  }
  const repetitions = new Map<number, Set<EvaluationV3Arm>>();
  for (const run of runs) {
    const arms = repetitions.get(run.repetition) ?? new Set<EvaluationV3Arm>();
    if (arms.has(run.arm)) {
      throw new Error(`duplicate arm in repetition ${run.repetition}: ${run.arm}`);
    }
    arms.add(run.arm);
    repetitions.set(run.repetition, arms);
  }
  if ([...repetitions.values()].some((arms) =>
    EVALUATION_V3_ARMS.some((arm) => !arms.has(arm)))) {
    throw new Error('each Evaluation v3 repetition requires all four arms');
  }
};

export const buildEvaluationV3ExperimentReport = (
  runs: EvaluationV3Run[],
  manifest: EvaluationV3HoldoutManifest,
): EvaluationV3ExperimentReport => {
  validateRuns(runs);
  const repetitions = [...new Set(runs.map(({ repetition }) => repetition))]
    .sort((left, right) => left - right)
    .map((repetition) => {
      const runsForRepetition = runs.filter((run) => run.repetition === repetition);
      const arms = Object.fromEntries(EVALUATION_V3_ARMS.map((arm) => [
        arm,
        runReport(runsForRepetition.find((run) => run.arm === arm)!),
      ])) as Record<EvaluationV3Arm, EvaluationV3RunReport>;
      return {
        repetition,
        arms,
        lifts: liftReport(arms),
        comparisonReady: EVALUATION_V3_ARMS.every((arm) =>
          arms[arm].status === 'complete'),
      };
    });
  const firstCompleteGeneric = [...runs]
    .filter(({ arm, status }) => arm === 'generic_cfo' && status === 'complete')
    .sort((left, right) => left.repetition - right.repetition)[0];
  const firstGenericPercent = firstCompleteGeneric
    ? (firstCompleteGeneric.answers.filter(({ correct }) => correct).length / 30) * 100
    : null;
  const exposureWarnings = manifest.events
    .filter(({ exposureStatus }) => exposureStatus === 'known_prior_exposure')
    .map(({ aliases }) =>
      `known_prior_exposure: ${aliases.find((alias) => /github/i.test(alias)) ?? aliases[0]}`);
  const incompleteCount = runs.filter(({ status }) => status !== 'complete').length;
  const warnings = [
    ...exposureWarnings,
    ...(incompleteCount ? [`${incompleteCount} incomplete run(s); dependent lifts are unavailable`] : []),
  ];
  const allAnswers = runs.flatMap(({ answers }) => answers);
  return {
    experimentGroupId: runs[0].experimentGroupId,
    benchmarkRejected: firstGenericPercent !== null && firstGenericPercent > 80,
    warnings,
    repetitions,
    armAggregates: Object.fromEntries(EVALUATION_V3_ARMS.map((arm) => [
      arm,
      armAggregate(arm, runs),
    ])) as Record<EvaluationV3Arm, EvaluationV3ArmAggregate>,
    diagnostics: {
      inputTokens: allAnswers.reduce((sum, answer) => sum + (answer.inputTokens ?? 0), 0),
      outputTokens: allAnswers.reduce((sum, answer) => sum + (answer.outputTokens ?? 0), 0),
      elapsedMs: allAnswers.reduce((sum, answer) => sum + answer.elapsedMs, 0),
      mismatchCount: allAnswers.filter(({ mismatch }) => mismatch).length,
      failedQuestions: runs.reduce((sum, run) =>
        sum + run.answers.filter(({ status }) => status === 'failed').length
        + Math.max(0, 30 - run.answers.length), 0),
    },
  };
};
