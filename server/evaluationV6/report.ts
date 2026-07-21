import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  EVALUATION_V6_ARMS,
  EVALUATION_V6_COMPONENTS,
  EVALUATION_V6_DOMAINS,
  type EvaluationV6Arm,
  type EvaluationV6Grade,
  type EvaluationV6PairGrade,
  type EvaluationV6Run,
} from '../../shared/amyHoodEvaluationV6';
import type { EvaluationV6CalibrationMetrics } from './calibration';
import { loadActiveEvaluationV6Calibration } from './calibration';
import {
  loadActiveEvaluationV6Grades,
  loadActiveEvaluationV6PairGrades,
  loadEvaluationV6JudgeLinks,
  loadEvaluationV6PairJudgeLinks,
} from './judge';
import { listEvaluationV6Runs } from './runStore';
import { loadEvaluationV6Bundle, type ValidatedEvaluationV6Bundle } from './scenarioSet';

type Link = { packetId: string; runId: string; arm: string; repetition: number; scenarioId: string };
type PairLink = { packetId: string; runId: string; arm: string; repetition: number; pairId: string };
type ReportInput = {
  bundle: ValidatedEvaluationV6Bundle;
  runs: EvaluationV6Run[];
  grades: EvaluationV6Grade[];
  links: Link[];
  pairGrades: EvaluationV6PairGrade[];
  pairLinks: PairLink[];
  calibration: { passed: boolean; candidateBundleHash: string; batchHash: string; metrics: EvaluationV6CalibrationMetrics; activatedAt: string };
};

const mean = (values: number[]) => {
  if (!values.length) throw new Error('cannot calculate an empty Evaluation v6 mean');
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};
const countBy = <T>(values: T[], select: (value: T) => string) => values.reduce<Record<string, number>>((result, value) => {
  const key = select(value);
  result[key] = (result[key] ?? 0) + 1;
  return result;
}, {});

export const buildEvaluationV6ReportData = (input: ReportInput) => {
  const { bundle, runs, grades, links, pairGrades, pairLinks, calibration } = input;
  if (!bundle.manifest || !calibration.passed
    || calibration.candidateBundleHash !== bundle.manifest.candidateBundleHash
    || calibration.batchHash !== bundle.manifest.judgeCalibrationBatchHash) {
    throw new Error('Evaluation v6 report calibration does not match the frozen bundle');
  }
  if (![3, 15].includes(runs.length) || runs.some(({ status, answers, scenarioSetHash }) =>
    status !== 'complete' || answers.length !== 30 || scenarioSetHash !== bundle.manifest!.bundleHash)) {
    throw new Error('Evaluation v6 report requires complete consistently pinned runs');
  }
  const expectedAnswers = runs.length * 30;
  if (grades.length !== expectedAnswers || links.length !== expectedAnswers
    || new Set(grades.map(({ packetId }) => packetId)).size !== expectedAnswers
    || new Set(links.map(({ packetId }) => packetId)).size !== expectedAnswers) {
    throw new Error('Evaluation v6 report individual grade batch is incomplete');
  }
  const gradeById = new Map(grades.map((grade) => [grade.packetId, grade]));
  const runById = new Map(runs.map((run) => [run.runId, run]));
  const scenarioById = new Map(bundle.scenarios.map((scenario) => [scenario.id, scenario]));
  const scored = links.map((link) => {
    const grade = gradeById.get(link.packetId);
    const run = runById.get(link.runId);
    if (!grade || !run || run.arm !== link.arm || !scenarioById.has(link.scenarioId)) {
      throw new Error(`Evaluation v6 report contains a stale private link: ${link.packetId}`);
    }
    return { arm: run.arm, scenarioId: link.scenarioId, grade };
  });
  const runMode = runs.length === 3 ? 'persona_calibration' as const : 'formal' as const;
  if (runMode === 'formal' && (pairGrades.length !== 225 || pairLinks.length !== 225)) {
    throw new Error('Evaluation v6 formal report requires 225 transition grades');
  }
  const pairGradeById = new Map(pairGrades.map((grade) => [grade.packetId, grade]));
  const pairRows = pairLinks.map((link) => {
    const grade = pairGradeById.get(link.packetId);
    const run = runById.get(link.runId);
    if (!grade || !run || run.arm !== link.arm) throw new Error(`Evaluation v6 pair link is stale: ${link.packetId}`);
    return { arm: run.arm, grade };
  });
  const armMeans = Object.fromEntries(EVALUATION_V6_ARMS.map((arm) => [arm,
    mean(scored.filter((row) => row.arm === arm).map(({ grade }) => grade.score)),
  ])) as Record<EvaluationV6Arm, number>;
  const componentMeans = Object.fromEntries(EVALUATION_V6_ARMS.map((arm) => [arm,
    Object.fromEntries(EVALUATION_V6_COMPONENTS.map((component) => [component,
      mean(scored.filter((row) => row.arm === arm).map(({ grade }) => grade.components[component])),
    ])),
  ]));
  const domainMeans = Object.fromEntries(EVALUATION_V6_ARMS.map((arm) => [arm,
    Object.fromEntries(EVALUATION_V6_DOMAINS.map((domain) => [domain, mean(scored.filter((row) =>
      row.arm === arm && scenarioById.get(row.scenarioId)?.domain === domain).map(({ grade }) => grade.score))])),
  ]));
  const identityVerdicts = Object.fromEntries(EVALUATION_V6_ARMS.map((arm) => {
    const armRows = scored.filter((row) => row.arm === arm);
    return [arm, Object.fromEntries(['amy_aligned', 'amy_partial', 'generic_cfo', 'amy_conflict'].map((verdict) => [
      verdict, armRows.filter(({ grade }) => grade.identityVerdict === verdict).length / armRows.length,
    ]))];
  }));
  const transition = Object.fromEntries(EVALUATION_V6_ARMS.map((arm) => {
    const rows = pairRows.filter((row) => row.arm === arm);
    return [arm, {
      sampleCount: rows.length,
      pairAccuracy: rows.length ? rows.filter(({ grade }) => grade.aligned).length / rows.length : null,
      signalCitationRate: rows.length ? rows.filter(({ grade }) => grade.changedSignalFinding === 'aligned').length / rows.length : null,
      invariantPreservationRate: rows.length ? rows.filter(({ grade }) => grade.invariantFinding === 'aligned').length / rows.length : null,
    }];
  })) as Record<EvaluationV6Arm, { sampleCount: number; pairAccuracy: number | null; signalCitationRate: number | null; invariantPreservationRate: number | null }>;
  const ragAnswers = runs.filter(({ arm }) => arm !== 'amy_prompt').flatMap((run) => run.answers);
  const retrieval = {
    sampleCount: ragAnswers.length,
    evidenceAttachmentRate: ragAnswers.length ? ragAnswers.filter(({ retrieval: trace }) => (trace?.evidenceIds.length ?? 0) > 0).length / ragAnswers.length : 0,
    contextWithinBudgetRate: ragAnswers.length ? ragAnswers.filter(({ retrieval: trace }) =>
      (trace?.contextTokens ?? Infinity) <= 6_000 && (trace?.requestTokens ?? Infinity) <= 12_000).length / ragAnswers.length : 0,
  };
  return {
    experimentGroupId: runs[0].experimentGroupId,
    evaluationVersion: '6.0.0' as const,
    runMode,
    runCount: runs.length,
    answerCount: expectedAnswers,
    scenarioSetHash: bundle.manifest.bundleHash,
    judgeCalibration: calibration.metrics,
    armMeans,
    componentMeans,
    domainMeans,
    identityVerdicts,
    transition,
    retrieval,
    domainCounts: countBy(bundle.scenarios, ({ domain }) => domain),
    evidenceClassCounts: countBy(bundle.identityKeys, ({ evidenceClass }) => evidenceClass),
    replacements: bundle.replacements,
    exclusions: bundle.audits.filter(({ decision }) => decision === 'replace').map(({ scenarioId, rationale }) => ({ scenarioId, rationale })),
    generatedAt: new Date().toISOString(),
  };
};

export type EvaluationV6Report = ReturnType<typeof buildEvaluationV6ReportData>;

export const buildEvaluationV6Report = async (root: string, experimentGroupId: string) => {
  const [bundle, calibration, allRuns, gradeBatch, links] = await Promise.all([
    loadEvaluationV6Bundle(root),
    loadActiveEvaluationV6Calibration(root),
    listEvaluationV6Runs(root),
    loadActiveEvaluationV6Grades(root, experimentGroupId),
    loadEvaluationV6JudgeLinks(root, experimentGroupId),
  ]);
  const runs = allRuns.filter((run) => run.experimentGroupId === experimentGroupId);
  let pairGrades: EvaluationV6PairGrade[] = [];
  let pairLinks: PairLink[] = [];
  if (runs.length === 15) {
    const [batch, linksFile] = await Promise.all([
      loadActiveEvaluationV6PairGrades(root, experimentGroupId),
      loadEvaluationV6PairJudgeLinks(root, experimentGroupId),
    ]);
    pairGrades = batch.grades;
    pairLinks = linksFile.links;
  }
  return buildEvaluationV6ReportData({
    bundle, calibration, runs, grades: gradeBatch.grades, links: links.links, pairGrades, pairLinks,
  });
};

const escapeHtml = (value: unknown) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]!));

export const renderEvaluationV6Html = (report: EvaluationV6Report) => `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Amy Hood Evaluation v6</title><style>body{font-family:system-ui,sans-serif;max-width:1100px;margin:40px auto;padding:0 24px;color:#172033}table{border-collapse:collapse;width:100%;margin:16px 0}th,td{border:1px solid #d8deea;padding:10px;text-align:left}th{background:#f3f6fb}.card{border:1px solid #d8deea;border-radius:12px;padding:18px;margin:18px 0}.num{font-size:1.5rem;font-weight:700}</style></head>
<body><h1>Amy Hood 정체성 정합 평가 / Identity Alignment Evaluation v6</h1>
<p>실험 ID / Experiment ID: ${escapeHtml(report.experimentGroupId)}</p>
<div class="card"><strong>실행 모드 / Run mode</strong><div class="num">${escapeHtml(report.runMode)}</div><p>${report.answerCount} answers · ${report.runCount} runs</p></div>
<h2>조건별 평균 / Mean by arm</h2><table><thead><tr><th>조건 / Arm</th><th>평균 점수 / Mean</th></tr></thead><tbody>${EVALUATION_V6_ARMS.map((arm) => `<tr><td>${escapeHtml(arm)}</td><td>${report.armMeans[arm].toFixed(2)}</td></tr>`).join('')}</tbody></table>
<h2>전환 정합 / Transition alignment</h2><table><thead><tr><th>조건</th><th>표본</th><th>쌍 정합률</th></tr></thead><tbody>${EVALUATION_V6_ARMS.map((arm) => `<tr><td>${escapeHtml(arm)}</td><td>${report.transition[arm].sampleCount}</td><td>${report.transition[arm].pairAccuracy === null ? 'N/A' : (report.transition[arm].pairAccuracy! * 100).toFixed(1) + '%'}</td></tr>`).join('')}</tbody></table>
<p>이 평가는 일반 CFO 답변 품질이 아니라 공개 근거로 고정된 Amy Hood 판단 순서·경계·반전 규칙과의 정합성을 측정합니다.</p></body></html>`;

export const writeEvaluationV6HtmlReport = async (root: string, experimentGroupId: string, outputPath: string) => {
  const report = await buildEvaluationV6Report(root, experimentGroupId);
  const resolved = path.resolve(root, outputPath);
  await mkdir(path.dirname(resolved), { recursive: true });
  await writeFile(resolved, renderEvaluationV6Html(report), 'utf8');
  return { outputPath: resolved, report };
};

