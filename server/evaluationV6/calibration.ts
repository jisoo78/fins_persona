import path from 'node:path';

import type { EvaluationV6CalibrationAnswer, EvaluationV6Grade } from '../../shared/amyHoodEvaluationV6';
import { readJsonFile, writeJsonAtomic } from '../decisionAdvisor/jsonStore';
import { evaluationV6Paths } from './paths';

export type EvaluationV6CalibrationMetrics = {
  genericLeakageRate: number;
  conflictLeakageRate: number;
  amyPassRate: number;
  meanIdentityGap: number;
  schemaValidRate: number;
};

export const validateEvaluationV6Calibration = (
  answers: EvaluationV6CalibrationAnswer[],
  grades: EvaluationV6Grade[],
): { passed: true; metrics: EvaluationV6CalibrationMetrics } => {
  if (answers.length !== 90 || grades.length !== 90) {
    throw new Error('Evaluation v6 calibration requires exactly ninety answers and grades');
  }
  if (new Set(answers.map(({ calibrationId }) => calibrationId)).size !== 90
    || new Set(grades.map(({ packetId }) => packetId)).size !== 90) {
    throw new Error('Evaluation v6 calibration contains duplicate identities');
  }
  const gradeById = new Map(grades.map((grade) => [grade.packetId, grade]));
  const rows = answers.map((answer) => {
    const grade = gradeById.get(answer.calibrationId);
    if (!grade) throw new Error(`missing Evaluation v6 calibration grade: ${answer.calibrationId}`);
    if (answer.expectedAnchorTerms.length === 0 || !grade.distinguishingAnchor.statement.trim()) {
      throw new Error(`Evaluation v6 expected Amy anchor is undocumented: ${answer.scenarioId}`);
    }
    if (answer.answerType === 'amy_aligned') {
      const aligned = new Set(['aligned', 'partial']);
      const anchorPass = answer.expectedAnchor === 'action'
        ? grade.components.action >= 3 && aligned.has(grade.anchorFindings.action)
        : answer.expectedAnchor === 'priority_order'
          ? grade.components.priorityOrder >= 3 && aligned.has(grade.anchorFindings.priority)
          : answer.expectedAnchor === 'boundary_condition'
            ? grade.components.boundaries >= 3 && aligned.has(grade.anchorFindings.guardrails)
            : answer.expectedAnchor === 'reversal_rule'
              ? grade.components.reversal >= 3 && aligned.has(grade.anchorFindings.reversal)
              : false;
      if (!anchorPass) throw new Error(`Evaluation v6 expected Amy anchor is not aligned: ${answer.scenarioId}`);
    } else if (answer.answerType === 'generic_cfo') {
      if (grade.score > 6 || grade.identityVerdict === 'amy_aligned'
        || grade.components.identitySpecificity > 2) {
        throw new Error(`Evaluation v6 generic CFO anchor is not discriminated: ${answer.scenarioId}`);
      }
    } else if (grade.identityVerdict !== 'amy_conflict') {
      throw new Error(`Evaluation v6 identity conflict anchor is not discriminated: ${answer.scenarioId}`);
    }
    return { answer, grade };
  });
  const scenarioIds = [...new Set(answers.map(({ scenarioId }) => scenarioId))];
  if (scenarioIds.length !== 30 || scenarioIds.some((scenarioId) => {
    const types = answers.filter((answer) => answer.scenarioId === scenarioId).map(({ answerType }) => answerType);
    return types.length !== 3 || new Set(types).size !== 3;
  })) {
    throw new Error('Evaluation v6 calibration requires thirty complete triplets');
  }
  const aligned = rows.filter(({ answer }) => answer.answerType === 'amy_aligned');
  const generic = rows.filter(({ answer }) => answer.answerType === 'generic_cfo');
  const conflict = rows.filter(({ answer }) => answer.answerType === 'amy_conflict');
  const scoreByCell = new Map(rows.map(({ answer, grade }) => [`${answer.scenarioId}:${answer.answerType}`, grade.score]));
  const gaps = aligned.map(({ answer, grade }) =>
    grade.score - (scoreByCell.get(`${answer.scenarioId}:generic_cfo`) ?? Number.NaN));
  const metrics: EvaluationV6CalibrationMetrics = {
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
  if (!passed) throw new Error(`Evaluation v6 Judge calibration failed: ${JSON.stringify(metrics)}`);
  return { passed: true, metrics };
};

export type EvaluationV6ManualReview = {
  targetType: 'replacement' | 'calibration_failure';
  targetId: string;
  decision: 'approved' | 'revise';
  reviewer: 'Codex';
  reviewedAt: string;
  rationale: string;
};

export const activateEvaluationV6Calibration = async (
  root: string,
  batch: { batchHash: string; candidateBundleHash: string; metrics: EvaluationV6CalibrationMetrics },
  replacementIds: string[],
  manualReviews: EvaluationV6ManualReview[],
) => {
  if (!/^[a-f0-9]{64}$/.test(batch.batchHash) || !/^[a-f0-9]{64}$/.test(batch.candidateBundleHash)) {
    throw new Error('Evaluation v6 calibration batch identity is invalid');
  }
  if (replacementIds.some((targetId) => !manualReviews.some((review) =>
    review.targetType === 'replacement' && review.targetId === targetId
      && review.decision === 'approved' && review.reviewer === 'Codex'
      && !Number.isNaN(Date.parse(review.reviewedAt)) && review.rationale.trim()))) {
    throw new Error('Evaluation v6 replacement manual review is incomplete');
  }
  const active = { ...batch, passed: true, activatedAt: new Date().toISOString() };
  await writeJsonAtomic(path.join(evaluationV6Paths(root).calibration, 'active.json'), active);
  return active;
};

export const loadActiveEvaluationV6Calibration = async (root: string) => {
  const value = await readJsonFile<{
    batchHash: string;
    candidateBundleHash: string;
    passed: boolean;
    metrics: EvaluationV6CalibrationMetrics;
    activatedAt: string;
  }>(path.join(evaluationV6Paths(root).calibration, 'active.json'), null as never);
  if (!value || !value.passed || !/^[a-f0-9]{64}$/.test(value.batchHash)
    || !/^[a-f0-9]{64}$/.test(value.candidateBundleHash)) {
    throw new Error('Evaluation v6 active Judge calibration is invalid');
  }
  return value;
};
