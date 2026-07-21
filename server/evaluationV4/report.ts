import type {
  EvaluationV4Arm,
  EvaluationV4ExperimentReport,
  EvaluationV4Grade,
  EvaluationV4Run,
} from '../../shared/amyHoodEvaluationV4';
import { EVALUATION_V4_ARMS, EVALUATION_V4_DOMAINS } from '../../shared/amyHoodEvaluationV4';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { writeJsonAtomic } from '../decisionAdvisor/jsonStore';
import { evaluationV4Paths } from './paths';
import { loadActiveEvaluationV4Grades, loadEvaluationV4JudgeLinks } from './judge';
import { listEvaluationV4Runs } from './runStore';
import { loadEvaluationV4Bundle } from './scenarioSet';

const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const sameBehavior = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

export const buildEvaluationV4CalibrationReport = async (
  root: string,
  experimentGroupId: string,
): Promise<EvaluationV4ExperimentReport> => {
  const [bundle, allRuns, gradeBatch, privateLinks] = await Promise.all([
    loadEvaluationV4Bundle(root, 'calibration'), listEvaluationV4Runs(root),
    loadActiveEvaluationV4Grades(root, experimentGroupId),
    loadEvaluationV4JudgeLinks(root, experimentGroupId),
  ]);
  const runs = allRuns.filter((run) => run.experimentGroupId === experimentGroupId);
  if (runs.length !== 4 || runs.some(({ status, answers }) => status !== 'complete' || answers.length !== 10)) {
    throw new Error('Evaluation v4 report requires four complete runs');
  }
  if (gradeBatch.grades.length !== 40 || privateLinks.links.length !== 40) {
    throw new Error('Evaluation v4 report requires forty active grades');
  }
  const runById = new Map(runs.map((run) => [run.runId, run]));
  const gradeByPacket = new Map(gradeBatch.grades.map((grade) => [grade.packetId, grade]));
  const scored = privateLinks.links.map((link) => ({
    link, run: runById.get(link.runId)!, grade: gradeByPacket.get(link.packetId)!,
  }));
  if (scored.some(({ run, grade }) => !run || !grade)) throw new Error('Evaluation v4 grade links are unresolved');
  const armGrades = Object.fromEntries(EVALUATION_V4_ARMS.map((arm) => [arm, scored
    .filter(({ run }) => run.arm === arm).map(({ grade }) => grade.score)])) as Record<EvaluationV4Arm, number[]>;
  const armMeans = Object.fromEntries(EVALUATION_V4_ARMS.map((arm) => [arm, mean(armGrades[arm])])) as EvaluationV4ExperimentReport['armMeans'];
  const generic = armMeans.generic_cfo;
  const pairedLift = {
    amy_prompt: generic === null || armMeans.amy_prompt === null ? null : armMeans.amy_prompt - generic,
    amy_policy_rag: armMeans.amy_prompt === null || armMeans.amy_policy_rag === null ? null : armMeans.amy_policy_rag - armMeans.amy_prompt,
    amy_full_rag: armMeans.amy_prompt === null || armMeans.amy_full_rag === null ? null : armMeans.amy_full_rag - armMeans.amy_prompt,
  };
  const scenarioById = new Map(bundle.scenarios.map((scenario) => [scenario.id, scenario]));
  const domainMeans = Object.fromEntries(EVALUATION_V4_ARMS.map((arm) => [arm, Object.fromEntries(
    bundle.scenarios.map(({ domain }) => domain).filter((domain, index, all) => all.indexOf(domain) === index)
      .map((domain) => [domain, mean(scored.filter(({ run, link }) => run.arm === arm && scenarioById.get(link.scenarioId)?.domain === domain).map(({ grade }) => grade.score))]),
  )])) as EvaluationV4ExperimentReport['domainMeans'];
  const variantMeans = Object.fromEntries(EVALUATION_V4_ARMS.map((arm) => [arm, Object.fromEntries(
    ['base_transfer', 'reversal'].map((variant) => [variant, mean(scored.filter(({ run, link }) => run.arm === arm && scenarioById.get(link.scenarioId)?.variant === variant).map(({ grade }) => grade.score))]),
  )])) as EvaluationV4ExperimentReport['variantMeans'];
  const scoreBands = Object.fromEntries(EVALUATION_V4_ARMS.map((arm) => {
    const values = armGrades[arm];
    return [arm, {
      high8To10Rate: values.filter((value) => value >= 8).length / values.length,
      neutral5Rate: values.filter((value) => value === 5).length / values.length,
      conflict1To4Rate: values.filter((value) => value <= 4).length / values.length,
    }];
  })) as EvaluationV4ExperimentReport['scoreBands'];
  const keyById = new Map(bundle.alignmentKeys.map((key) => [key.scenarioId, key]));
  const ragAnswers = runs.filter(({ arm }) => arm.endsWith('_rag')).flatMap((run) =>
    run.answers.map((answer) => ({ run, answer })));
  const mapped = ragAnswers.filter(({ answer }) => answer.retrieval?.selectedArtifacts
    .some(({ id }) => id === keyById.get(answer.scenarioId)?.policyId)).length;
  const noMatch = ragAnswers.filter(({ answer }) => answer.retrieval?.noMatch).length;
  const wrong = ragAnswers.filter(({ answer }) => !answer.retrieval?.noMatch
    && !answer.retrieval?.selectedArtifacts.some(({ id }) => id === keyById.get(answer.scenarioId)?.policyId)).length;
  const pairs = bundle.scenarios.map(({ id }) => runs.filter(({ arm }) => arm.endsWith('_rag'))
    .map((run) => run.answers.find(({ scenarioId }) => scenarioId === id)?.retrieval));
  const cacheAgreement = pairs.filter(([left, right]) => left && right
    && left.queryHash === right.queryHash && left.indexHash === right.indexHash).length;
  const retrieval = {
    mappedPolicyRate: mapped / ragAnswers.length,
    noMatchRate: noMatch / ragAnswers.length,
    wrongDomainRate: wrong / ragAnswers.length,
    cacheAgreementRate: cacheAgreement / pairs.length,
    evidenceAttachmentRate: ragAnswers.filter(({ answer }) => (answer.retrieval?.evidenceIds.length ?? 0) > 0).length / ragAnswers.length,
    contextWithinBudgetRate: ragAnswers.filter(({ answer }) => (answer.retrieval?.contextTokens ?? Infinity) <= 6000
      && (answer.retrieval?.requestTokens ?? Infinity) <= 12000).length / ragAnswers.length,
    meanContextTokens: mean(ragAnswers.map(({ answer }) => answer.retrieval?.contextTokens ?? 0)) ?? 0,
  };
  const amyPrompt = runs.find(({ arm }) => arm === 'amy_prompt')!;
  const ragRuns = runs.filter(({ arm }) => arm.endsWith('_rag'));
  const behaviorChangeCount = bundle.scenarios.filter(({ id }) => {
    const baseline = amyPrompt.answers.find(({ scenarioId }) => scenarioId === id)?.response;
    return ragRuns.some((run) => {
      const response = run.answers.find(({ scenarioId }) => scenarioId === id)?.response;
      return !sameBehavior(
        { action: baseline?.action, priorities: baseline?.priorities },
        { action: response?.action, priorities: response?.priorities },
      );
    });
  }).length;
  const bestRag = Math.max(armMeans.amy_policy_rag ?? -Infinity, armMeans.amy_full_rag ?? -Infinity);
  const positiveDirectionalSignal = retrieval.mappedPolicyRate >= 0.8
    && behaviorChangeCount >= 3
    && armMeans.amy_prompt !== null
    && bestRag - armMeans.amy_prompt >= 0.5;
  const report: EvaluationV4ExperimentReport = {
    experimentGroupId,
    scenarioSetHash: runs[0].scenarioSetHash,
    repetitions: 1,
    benchmarkRejected: false,
    rejectionReasons: [],
    personaEvidencePassed: positiveDirectionalSignal,
    armMeans, pairedLift, domainMeans, variantMeans, scoreBands, retrieval,
    reliability: { sampleSize: 0, withinOneRate: 0, meanAbsoluteDifference: 0, passed: false },
    stability: { withinScenarioStdDev: null, perScenarioStdDev: {}, passed: false },
    diagnostics: { completeAnswers: 40, failedAnswers: 0, validGrades: 40 },
    behaviorChangeCount,
    positiveDirectionalSignal,
    benchmarkGoNoGo: positiveDirectionalSignal ? 'go' : 'no_go',
  };
  await writeJsonAtomic(
    path.join(evaluationV4Paths(root).reports, experimentGroupId, 'report.json'),
    report,
  );
  return report;
};

const escapeHtml = (value: unknown) => String(value)
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

export const writeEvaluationV4HtmlReport = async (
  root: string,
  experimentGroupId: string,
  outputPath: string,
) => {
  const [report, bundle] = await Promise.all([
    buildEvaluationV4CalibrationReport(root, experimentGroupId),
    loadEvaluationV4Bundle(root, 'calibration'),
  ]);
  const arms = EVALUATION_V4_ARMS.map((arm) => `<tr><td>${escapeHtml(arm)}</td><td>${escapeHtml(report.armMeans[arm]?.toFixed(2) ?? 'N/A')}</td><td>${escapeHtml(arm === 'generic_cfo' ? 'baseline' : report.pairedLift[arm as keyof typeof report.pairedLift]?.toFixed(2) ?? 'N/A')}</td></tr>`).join('');
  const domains = EVALUATION_V4_DOMAINS.map((domain) => `<tr><td>${escapeHtml(domain)}</td>${EVALUATION_V4_ARMS.map((arm) => `<td>${escapeHtml(report.domainMeans[arm][domain]?.toFixed(2) ?? 'N/A')}</td>`).join('')}</tr>`).join('');
  const secondaryPresent = bundle.externalEvents.filter(({ secondarySourceStatus }) => secondarySourceStatus === 'present').length;
  const secondaryUnavailable = bundle.externalEvents.filter(({ secondarySourceStatus }) => secondarySourceStatus === 'documented_unavailable').length;
  const outcomeEvidenceCount = new Set(bundle.externalEvents.flatMap(({ outcomeEvidenceIds }) => outcomeEvidenceIds)).size;
  const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Amy Hood Evaluation V4 Calibration</title>
<style>body{font-family:system-ui,-apple-system,sans-serif;max-width:1080px;margin:40px auto;padding:0 24px;color:#172033;background:#f7f8fb}h1,h2{color:#0c326f}.card{background:#fff;border:1px solid #dce2ec;border-radius:12px;padding:20px;margin:16px 0}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px;border-bottom:1px solid #e5e9f0}.go{font-size:1.4rem;font-weight:700;color:${report.benchmarkGoNoGo === 'go' ? '#08783e' : '#b42318'}}code{word-break:break-all}</style></head>
<body><h1>Amy Hood Decision Advisor — Evaluation V4 Calibration</h1>
<div class="card"><p class="go">30문항 벤치마크 진행 판정: ${escapeHtml(report.benchmarkGoNoGo.toUpperCase())}</p><p>이 1회 교정 실험은 Prompt/RAG가 답변 행동에 유의미한 차이를 만드는지 보는 행동 교정 실험이며, Amy Hood 본인의 의사결정을 복제했다는 증명이 아닙니다.</p></div>
<div class="card"><h2>Before vs After 정량 결과</h2><table><thead><tr><th>실험군</th><th>평균 AAS</th><th>비교 리프트</th></tr></thead><tbody>${arms}</tbody></table><p>Amy Prompt는 일반 CFO 대비, 두 RAG 실험군은 Amy Prompt 대비 리프트입니다.</p></div>
<div class="card"><h2>영역별 AAS</h2><table><thead><tr><th>영역</th>${EVALUATION_V4_ARMS.map((arm) => `<th>${escapeHtml(arm)}</th>`).join('')}</tr></thead><tbody>${domains}</tbody></table></div>
<div class="card"><h2>검색 및 행동 진단</h2><ul><li>의도 정책 검색률: ${(report.retrieval.mappedPolicyRate * 100).toFixed(1)}%</li><li>잘못된 영역 검색률: ${(report.retrieval.wrongDomainRate * 100).toFixed(1)}%</li><li>캐시 일치율: ${(report.retrieval.cacheAgreementRate * 100).toFixed(1)}%</li><li>행동/우선순위 변화 시나리오: ${report.behaviorChangeCount}/10</li></ul></div>
<div class="card"><h2>근거 완전성</h2><ul><li>가상 사건에 연결된 공식 1차 자료: ${bundle.externalEvents.length}개 사건 / ${new Set(bundle.externalEvents.map(({ primarySourceId }) => primarySourceId)).size}개 고유 자료</li><li>독립 2차 자료 확보: ${secondaryPresent}개 사건</li><li>2차 자료 부재 사유 기록: ${secondaryUnavailable}개 사건</li><li>사후 결과 근거(판단 시점 입력과 분리): ${outcomeEvidenceCount}개</li><li>RAG 응답의 근거 첨부율: ${(report.retrieval.evidenceAttachmentRate * 100).toFixed(1)}%</li></ul></div>
<div class="card"><h2>가설과 판정 논리</h2><p>양의 방향 신호는 의도 정책 검색률 80% 이상, 행동 또는 우선순위 변화 3개 이상, 최상 RAG군의 Amy Prompt 대비 AAS +0.5 이상을 동시에 만족할 때만 인정합니다.</p><p>현재 판정: <strong>${report.positiveDirectionalSignal ? '충족' : '미충족'}</strong></p></div>
<div class="card"><h2>최종 요약과 제약</h2><p>공개자료의 완전성, 단일 채점자, 1회 반복, 10개 교정 문항 때문에 일반화 오차와 채점자 편향을 추정할 수 없습니다. 신뢰도 검증: ${report.reliability.passed ? '통과' : '미수행'}, 반복 안정성: ${report.stability.passed ? '통과' : '미수행'}입니다. GO는 30문항·5회 반복으로 확대할 실험적 근거일 뿐 배포 승인이 아닙니다.</p><p>실험 그룹: <code>${escapeHtml(experimentGroupId)}</code></p></div></body></html>`;
  await import('node:fs/promises').then(({ mkdir }) => mkdir(path.dirname(outputPath), { recursive: true }));
  await writeFile(outputPath, html, 'utf8');
  return { report, outputPath };
};
