import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  EVALUATION_V5_ARMS,
  EVALUATION_V5_CHANGE_TYPES,
  EVALUATION_V5_DOMAINS,
  type EvaluationV5Arm,
  type EvaluationV5ConfidenceInterval,
  type EvaluationV5ExperimentReport,
} from '../../shared/amyHoodEvaluationV5';
import { writeJsonAtomic } from '../decisionAdvisor/jsonStore';
import {
  loadActiveEvaluationV5Grades,
  loadActiveEvaluationV5PairGrades,
  loadEvaluationV5JudgeLinks,
  loadEvaluationV5PairJudgeLinks,
} from './judge';
import { evaluationV5Paths } from './paths';
import { listEvaluationV5Runs } from './runStore';
import { loadEvaluationV5Bundle } from './scenarioSet';

const mean = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const standardDeviation = (values: number[]) => {
  if (values.length <= 1) return 0;
  const average = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + ((value - average) ** 2), 0) / values.length);
};
const confidenceInterval = (differences: number[]): EvaluationV5ConfidenceInterval => {
  const meanDifference = mean(differences);
  const sampleVariance = differences.length <= 1 ? 0 : differences
    .reduce((sum, value) => sum + ((value - meanDifference) ** 2), 0) / (differences.length - 1);
  const margin = 1.96 * Math.sqrt(sampleVariance / differences.length);
  const lower95 = meanDifference - margin;
  const upper95 = meanDifference + margin;
  return {
    meanDifference,
    lower95,
    upper95,
    sampleSize: differences.length,
    inference: lower95 > 0
      ? 'positive_supported'
      : meanDifference > 0
        ? 'directional_only'
        : 'no_positive_signal',
  };
};

export const buildEvaluationV5Report = async (
  root: string,
  experimentGroupId: string,
): Promise<EvaluationV5ExperimentReport> => {
  const [bundle, allRuns, individualBatch, pairBatch, individualLinks, pairLinks] = await Promise.all([
    loadEvaluationV5Bundle(root),
    listEvaluationV5Runs(root),
    loadActiveEvaluationV5Grades(root, experimentGroupId),
    loadActiveEvaluationV5PairGrades(root, experimentGroupId),
    loadEvaluationV5JudgeLinks(root, experimentGroupId),
    loadEvaluationV5PairJudgeLinks(root, experimentGroupId),
  ]);
  const runs = allRuns.filter((run) => run.experimentGroupId === experimentGroupId);
  if (runs.length !== 15
    || runs.some(({ status, answers }) => status !== 'complete' || answers.length !== 30)) {
    throw new Error('Evaluation v5 report requires fifteen complete runs');
  }
  const currentScenarioHash = bundle.manifest?.bundleHash;
  if (!currentScenarioHash || new Set(runs.map(({ scenarioSetHash }) => scenarioSetHash)).size !== 1
    || runs.some(({ scenarioSetHash }) => scenarioSetHash !== currentScenarioHash)) {
    throw new Error('Evaluation v5 report contains a mixed or stale scenario bundle hash');
  }
  if (individualBatch.grades.length !== 450 || individualLinks.links.length !== 450) {
    throw new Error('Evaluation v5 report requires 450 linked individual grades');
  }
  if (pairBatch.grades.length !== 225 || pairLinks.links.length !== 225) {
    throw new Error('Evaluation v5 report requires 225 linked pair grades');
  }

  const runById = new Map(runs.map((run) => [run.runId, run]));
  const individualGradeByPacket = new Map(individualBatch.grades.map((grade) => [grade.packetId, grade]));
  const scored = individualLinks.links.map((link) => ({
    link,
    run: runById.get(link.runId),
    grade: individualGradeByPacket.get(link.packetId),
  }));
  if (scored.some(({ run, grade }) => !run || !grade)) {
    throw new Error('Evaluation v5 individual grade links are unresolved');
  }
  const pairGradeByPacket = new Map(pairBatch.grades.map((grade) => [grade.packetId, grade]));
  const pairScored = pairLinks.links.map((link) => ({
    link,
    run: runById.get(link.runId),
    grade: pairGradeByPacket.get(link.packetId),
  }));
  if (pairScored.some(({ run, grade }) => !run || !grade)) {
    throw new Error('Evaluation v5 pair grade links are unresolved');
  }

  const armScores = Object.fromEntries(EVALUATION_V5_ARMS.map((arm) => [arm, scored
    .filter(({ run }) => run!.arm === arm)
    .map(({ grade }) => grade!.score)])) as Record<EvaluationV5Arm, number[]>;
  const armMeans = Object.fromEntries(EVALUATION_V5_ARMS.map((arm) => [
    arm,
    mean(armScores[arm]),
  ])) as EvaluationV5ExperimentReport['armMeans'];
  const pairedLift = {
    amy_policy_rag: armMeans.amy_policy_rag - armMeans.amy_prompt,
    amy_full_rag: armMeans.amy_full_rag - armMeans.amy_prompt,
  };
  const scoreByCell = new Map(scored.map(({ link, run, grade }) => [
    `${run!.arm}:${run!.repetition}:${link.scenarioId}`,
    grade!.score,
  ]));
  const differences = (arm: 'amy_policy_rag' | 'amy_full_rag') => {
    const values: number[] = [];
    for (const repetition of [1, 2, 3, 4, 5] as const) {
      for (const scenario of bundle.scenarios) {
        values.push(
          scoreByCell.get(`${arm}:${repetition}:${scenario.id}`)!
          - scoreByCell.get(`amy_prompt:${repetition}:${scenario.id}`)!,
        );
      }
    }
    return values;
  };
  const confidenceIntervals = {
    amy_policy_rag: confidenceInterval(differences('amy_policy_rag')),
    amy_full_rag: confidenceInterval(differences('amy_full_rag')),
  };
  const scenarioById = new Map(bundle.scenarios.map((scenario) => [scenario.id, scenario]));
  const domainMeans = Object.fromEntries(EVALUATION_V5_ARMS.map((arm) => [arm, Object.fromEntries(
    EVALUATION_V5_DOMAINS.map((domain) => [domain, mean(scored
      .filter(({ run, link }) => run!.arm === arm && scenarioById.get(link.scenarioId)?.domain === domain)
      .map(({ grade }) => grade!.score))]),
  )])) as EvaluationV5ExperimentReport['domainMeans'];

  const pairKeyById = new Map(bundle.pairKeys.map((key) => [key.pairId, key]));
  const transition = Object.fromEntries(EVALUATION_V5_ARMS.map((arm) => {
    const grades = pairScored.filter(({ run }) => run!.arm === arm).map(({ grade }) => grade!);
    return [arm, {
      pairAccuracy: grades.filter(({ aligned }) => aligned).length / grades.length,
      signalCitationRate: grades.filter(({ changedSignalFinding }) => changedSignalFinding === 'aligned').length / grades.length,
      invariantPreservationRate: grades.filter(({ invariantFinding }) => invariantFinding === 'aligned').length / grades.length,
    }];
  })) as EvaluationV5ExperimentReport['transition'];
  const changeTypeAccuracy = Object.fromEntries(EVALUATION_V5_ARMS.map((arm) => [arm, Object.fromEntries(
    EVALUATION_V5_CHANGE_TYPES.map((changeType) => {
      const grades = pairScored.filter(({ run, link }) => run!.arm === arm
        && pairKeyById.get(link.pairId)?.expectedResponseType === changeType).map(({ grade }) => grade!);
      return [changeType, grades.filter(({ aligned }) => aligned).length / grades.length];
    }),
  )])) as EvaluationV5ExperimentReport['changeTypeAccuracy'];

  const keyByScenario = new Map(bundle.alignmentKeys.map((key) => [key.scenarioId, key]));
  const ragAnswers = runs.filter(({ arm }) => arm.endsWith('_rag')).flatMap((run) =>
    run.answers.map((answer) => ({ run, answer })));
  const mapped = ragAnswers.filter(({ answer }) => answer.retrieval?.selectedArtifacts
    .some(({ id }) => id === keyByScenario.get(answer.scenarioId)?.policyId)).length;
  const noMatch = ragAnswers.filter(({ answer }) => answer.retrieval?.noMatch).length;
  const wrongDomain = ragAnswers.filter(({ answer }) => !answer.retrieval?.noMatch
    && !answer.retrieval?.selectedArtifacts
      .some(({ id }) => id === keyByScenario.get(answer.scenarioId)?.policyId)).length;
  const cachePairs = [1, 2, 3, 4, 5].flatMap((repetition) => bundle.scenarios.map((scenario) => {
    const policy = runs.find((run) => run.repetition === repetition && run.arm === 'amy_policy_rag')!
      .answers.find(({ scenarioId }) => scenarioId === scenario.id)?.retrieval;
    const full = runs.find((run) => run.repetition === repetition && run.arm === 'amy_full_rag')!
      .answers.find(({ scenarioId }) => scenarioId === scenario.id)?.retrieval;
    return [policy, full] as const;
  }));
  const cacheAgreement = cachePairs.filter(([left, right]) => left && right
    && left.queryHash === right.queryHash && left.indexHash === right.indexHash
    && left.cacheKey === right.cacheKey).length;
  const retrieval = {
    mappedPolicyRate: mapped / ragAnswers.length,
    noMatchRate: noMatch / ragAnswers.length,
    wrongDomainRate: wrongDomain / ragAnswers.length,
    cacheAgreementRate: cacheAgreement / cachePairs.length,
    evidenceAttachmentRate: ragAnswers.filter(({ answer }) =>
      (answer.retrieval?.evidenceIds.length ?? 0) > 0).length / ragAnswers.length,
    contextWithinBudgetRate: ragAnswers.filter(({ answer }) =>
      (answer.retrieval?.contextTokens ?? Infinity) <= 6_000
      && (answer.retrieval?.requestTokens ?? Infinity) <= 12_000).length / ragAnswers.length,
    meanContextTokens: mean(ragAnswers.map(({ answer }) => answer.retrieval?.contextTokens ?? 0)),
  };

  const repetitionMeans = Object.fromEntries(EVALUATION_V5_ARMS.map((arm) => [arm,
    [1, 2, 3, 4, 5].map((repetition) => mean(scored
      .filter(({ run }) => run!.arm === arm && run!.repetition === repetition)
      .map(({ grade }) => grade!.score))),
  ])) as Record<EvaluationV5Arm, number[]>;
  const stabilityByArm = Object.fromEntries(EVALUATION_V5_ARMS.map((arm) => [
    arm,
    standardDeviation(repetitionMeans[arm]),
  ])) as Record<EvaluationV5Arm, number>;
  const stability = {
    armMeanStdDev: Math.max(...Object.values(stabilityByArm)),
    byArm: stabilityByArm,
  };

  const bestRagArm = armMeans.amy_full_rag >= armMeans.amy_policy_rag
    ? 'amy_full_rag' as const
    : 'amy_policy_rag' as const;
  const checks = {
    ragMean: armMeans[bestRagArm] >= 7,
    ragLift: pairedLift[bestRagArm] >= 0.5,
    transitionAccuracy: transition[bestRagArm].pairAccuracy >= 0.75,
    signalCitation: transition[bestRagArm].signalCitationRate >= 0.8,
    retrievalPrecision: retrieval.wrongDomainRate <= 0.05,
    completion: runs.flatMap(({ answers }) => answers)
      .filter(({ status }) => status === 'complete').length / 450 >= 0.98,
    stability: stability.armMeanStdDev <= 1,
  };
  const completeAnswers = runs.flatMap(({ answers }) => answers)
    .filter(({ status }) => status === 'complete').length;
  const report: EvaluationV5ExperimentReport = {
    experimentGroupId,
    scenarioSetHash: currentScenarioHash,
    promptHash: runs[0].promptHash,
    memoryReleaseHash: runs.find(({ memoryReleaseHash }) => memoryReleaseHash)?.memoryReleaseHash ?? '',
    repetitions: 5,
    armMeans,
    pairedLift,
    confidenceIntervals,
    domainMeans,
    changeTypeAccuracy,
    transition,
    retrieval,
    stability,
    diagnostics: {
      expectedAnswers: 450,
      completeAnswers,
      failedAnswers: 450 - completeAnswers,
      validIndividualGrades: individualBatch.grades.length,
      expectedPairs: 225,
      completePairs: pairLinks.links.length,
      validPairGrades: pairBatch.grades.length,
      completionRate: completeAnswers / 450,
    },
    formalGate: {
      passed: Object.values(checks).every(Boolean),
      bestRagArm,
      checks,
    },
  };
  await writeJsonAtomic(
    path.join(evaluationV5Paths(root).reports, experimentGroupId, 'report.json'),
    report,
  );
  return report;
};

const escapeHtml = (value: unknown) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');
const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
const score = (value: number) => value.toFixed(2);
const signed = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;

export const writeEvaluationV5HtmlReport = async (
  root: string,
  experimentGroupId: string,
  outputPath: string,
) => {
  const [report, bundle, allRuns] = await Promise.all([
    buildEvaluationV5Report(root, experimentGroupId),
    loadEvaluationV5Bundle(root),
    listEvaluationV5Runs(root),
  ]);
  const runs = allRuns.filter((run) => run.experimentGroupId === experimentGroupId);
  const armLabels: Record<EvaluationV5Arm, string> = {
    amy_prompt: 'Amy Hood 메인 프롬프트(Main Prompt)',
    amy_policy_rag: '정책 검색 증강(Policy RAG)',
    amy_full_rag: '전체 근거 검색 증강(Full RAG)',
  };
  const domainLabels = {
    m_and_a: '인수·합병(Mergers & Acquisitions)',
    ai_cloud_capex: 'AI·클라우드 자본지출(AI & Cloud CapEx)',
    pricing_monetization: '가격·수익화(Pricing & Monetization)',
    cost_efficiency: '비용 효율(Cost Efficiency)',
    shareholder_return_risk: '주주환원·위험(Shareholder Return & Risk)',
  };
  const changeLabels = {
    guardrail_adjustment: '안전장치 조정(Guardrail Adjustment)',
    resource_reallocation: '자원 재배분(Resource Reallocation)',
    pause_or_reverse: '중단·반전(Pause or Reverse)',
  };
  const armRows = EVALUATION_V5_ARMS.map((arm) => `<tr><th>${escapeHtml(armLabels[arm])}</th><td>${score(report.armMeans[arm])}</td><td>${arm === 'amy_prompt' ? '비교 기준(Baseline)' : signed(report.pairedLift[arm])}</td><td>${percent(report.transition[arm].pairAccuracy)}</td><td>${percent(report.transition[arm].signalCitationRate)}</td></tr>`).join('');
  const domainRows = EVALUATION_V5_DOMAINS.map((domain) => `<tr><th>${escapeHtml(domainLabels[domain])}</th>${EVALUATION_V5_ARMS.map((arm) => `<td>${score(report.domainMeans[arm][domain]!)}</td>`).join('')}</tr>`).join('');
  const changeRows = EVALUATION_V5_CHANGE_TYPES.map((type) => `<tr><th>${escapeHtml(changeLabels[type])}</th>${EVALUATION_V5_ARMS.map((arm) => `<td>${percent(report.changeTypeAccuracy[arm][type])}</td>`).join('')}</tr>`).join('');
  const ciRows = (['amy_policy_rag', 'amy_full_rag'] as const).map((arm) => {
    const ci = report.confidenceIntervals[arm];
    const inference = ci.inference === 'positive_supported'
      ? '통계적으로 양의 방향 지지(Positive Supported)'
      : ci.inference === 'directional_only'
        ? '방향성 증거만 있음(Directional Evidence Only)'
        : '양의 신호 없음(No Positive Signal)';
    return `<tr><th>${escapeHtml(armLabels[arm])}</th><td>${signed(ci.meanDifference)}</td><td>[${ci.lower95.toFixed(2)}, ${ci.upper95.toFixed(2)}]</td><td>${ci.sampleSize}</td><td>${escapeHtml(inference)}</td></tr>`;
  }).join('');
  const gateLabels: Record<keyof typeof report.formalGate.checks, string> = {
    ragMean: '최고 RAG 평균 7점 이상',
    ragLift: '메인 프롬프트 대비 +0.5점 이상',
    transitionAccuracy: '행동 변화 정합률 75% 이상',
    signalCitation: '변화 신호 반영률 80% 이상',
    retrievalPrecision: '잘못된 정책 검색률 5% 이하',
    completion: '답변 완료율 98% 이상',
    stability: '반복 평균 표준편차 1.0 이하',
  };
  const gateRows = Object.entries(report.formalGate.checks)
    .map(([key, passed]) => `<tr><th>${escapeHtml(gateLabels[key as keyof typeof gateLabels])}</th><td>${passed ? '통과(Pass)' : '미통과(Fail)'}</td></tr>`).join('');
  const models = [...new Set(runs.map(({ model }) => model))].join(', ');
  const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Amy Hood Decision Advisor 평가 V5 보고서</title>
<style>:root{--ink:#172033;--navy:#123b70;--line:#dce3ed;--soft:#f5f7fa;--good:#08783e;--bad:#b42318}*{box-sizing:border-box}body{max-width:1120px;margin:40px auto;padding:0 24px;font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif;color:var(--ink);background:var(--soft);line-height:1.7}h1{line-height:1.25}h2{color:var(--navy)}.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:24px;margin:18px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.metric{padding:16px;background:#eef4ff;border-radius:10px}.value{display:block;font-size:1.6rem;font-weight:800}.table{overflow:auto}table{border-collapse:collapse;width:100%;min-width:720px}th,td{padding:11px;border-bottom:1px solid var(--line);text-align:left}thead{background:#eef4ff}.note{padding:14px;border-left:4px solid #d89a22;background:#fff8e8}.pass{color:var(--good);font-weight:800}.fail{color:var(--bad);font-weight:800}code{word-break:break-all}</style></head><body>
<section class="card"><p><strong>Evaluation V5 · 15개 실제 사건 기반 · 30문항 · 5회 반복</strong></p><h1>Amy Hood Decision Advisor 행동 변화 평가</h1><p>메인 프롬프트와 동적 RAG가 새로운 CFO 상황의 권고 행동과 조건 변화 대응을 실제로 개선하는지 검증합니다.</p></section>
<section class="card"><h2>1. 실험 목적</h2><p>이 실험은 Amy Hood를 그대로 복제했다고 증명하는 시험이 아닙니다. 공개 자료에서 추출한 판단 정책을 새로운 익명 경영 상황에 적용했을 때, 메인 프롬프트만 사용한 답변보다 정책 또는 전체 근거를 검색해 제공한 답변이 더 정합적인지 확인합니다.</p><p class="note">핵심 질문: 검색된 기억이 문장을 길게 만드는 데 그치지 않고, 조건이 바뀌었을 때 권고 행동·안전장치·반전 기준을 적절히 바꾸는가?</p></section>
<section class="card"><h2>2. 평가 방법</h2><p>서로 중복되지 않는 15개 공개 CFO 의사결정 사건을 익명화하고, 각 사건을 최초 조건과 변화 조건의 2단계로 구성해 30문항을 만들었습니다. 세 실험군은 같은 문항 순서를 공유하며 5회 반복되어 총 450개 답변과 225개 전후 쌍을 생성합니다.</p><ol><li>Amy Hood 메인 프롬프트만 제공</li><li>문항별 관련 판단 정책을 동적으로 검색해 제공</li><li>정책·성찰·사건·근거를 동적으로 검색해 제공</li></ol><p>채점 시 실험군, 모델, 런, 실제 기업과 인물 정보를 숨기는 블라인드 채점(Blind Judging)을 사용합니다.</p></section>
<section class="card"><h2>3. 평가 지표</h2><h3>행동 정합성 점수(Action Alignment Score, AAS)</h3><p>개별 답변의 행동, 우선순위, 안전장치, 반전 신호를 1~10점으로 평가합니다.</p><h3>행동 변화 정합성(Behavior-Transition Alignment)</h3><p>같은 사건의 조건이 달라졌을 때 예상한 변화 유형으로 행동을 조정했는지, 핵심 변화 신호를 근거로 사용했는지, 바뀌지 않은 조건을 보존했는지 평가합니다.</p><h3>검색 및 안정성 지표</h3><p>의도 정책 검색률, 잘못된 정책 검색률, 캐시 일치율, 근거 첨부율, 문맥 예산 준수율과 5회 반복 평균의 표준편차를 함께 봅니다.</p></section>
<section class="card"><h2>4. Before vs After 정량 결과</h2><div class="table"><table><thead><tr><th>실험군</th><th>평균 AAS</th><th>프롬프트 대비 변화</th><th>행동 변화 정합률</th><th>변화 신호 반영률</th></tr></thead><tbody>${armRows}</tbody></table></div></section>
<section class="card"><h2>5. 영역별 결과</h2><div class="table"><table><thead><tr><th>영역</th>${EVALUATION_V5_ARMS.map((arm) => `<th>${escapeHtml(armLabels[arm])}</th>`).join('')}</tr></thead><tbody>${domainRows}</tbody></table></div></section>
<section class="card"><h2>6. 변화 유형별 결과</h2><div class="table"><table><thead><tr><th>변화 유형</th>${EVALUATION_V5_ARMS.map((arm) => `<th>${escapeHtml(armLabels[arm])}</th>`).join('')}</tr></thead><tbody>${changeRows}</tbody></table></div></section>
<section class="card"><h2>7. 비교 향상 폭과 신뢰구간(Lift & 95% Confidence Interval)</h2><div class="table"><table><thead><tr><th>RAG 실험군</th><th>평균 차이</th><th>95% 신뢰구간</th><th>쌍 비교 수</th><th>해석</th></tr></thead><tbody>${ciRows}</tbody></table></div><p>신뢰구간이 0을 포함하면 개선 방향은 관측되었더라도 정식 양의 효과로 단정하지 않고 방향성 증거로만 기록합니다.</p></section>
<section class="card"><h2>8. 검색 진단</h2><div class="grid"><div class="metric">의도 정책 검색률<span class="value">${percent(report.retrieval.mappedPolicyRate)}</span></div><div class="metric">잘못된 정책 검색률<span class="value">${percent(report.retrieval.wrongDomainRate)}</span></div><div class="metric">검색 캐시 일치율<span class="value">${percent(report.retrieval.cacheAgreementRate)}</span></div><div class="metric">근거 첨부율<span class="value">${percent(report.retrieval.evidenceAttachmentRate)}</span></div><div class="metric">문맥 예산 준수율<span class="value">${percent(report.retrieval.contextWithinBudgetRate)}</span></div><div class="metric">반복 표준편차<span class="value">${report.stability.armMeanStdDev.toFixed(3)}</span></div></div></section>
<section class="card"><h2>9. 완료와 실패 현황</h2><p>예상 답변 ${report.diagnostics.expectedAnswers}개 중 ${report.diagnostics.completeAnswers}개 완료, ${report.diagnostics.failedAnswers}개 실패. 예상 전후 쌍 ${report.diagnostics.expectedPairs}개 중 ${report.diagnostics.completePairs}개가 채점되었습니다.</p></section>
<section class="card"><h2>10. 정식 성공 게이트(Formal Success Gate)</h2><div class="table"><table><tbody>${gateRows}</tbody></table></div><p class="${report.formalGate.passed ? 'pass' : 'fail'}">최종 게이트: ${report.formalGate.passed ? '통과(Pass)' : '미통과(Fail)'}</p></section>
<section class="card"><h2>11. 근거 한계와 해석 주의</h2><ul><li>15개 사건은 실제 CFO 의사결정 전체를 대표하지 않습니다.</li><li>일부 사건은 결정 시점의 독립 2차 자료가 없어 부재 사유를 명시했습니다.</li><li>변화 조건은 역사적 사실이 아니라 정책 민감도를 검증하기 위한 명시적 반사실(Counterfactual)입니다.</li><li>단일 모델과 단일 채점 계열의 결과는 다른 모델·채점자에게 자동 일반화되지 않습니다.</li></ul></section>
<section class="card"><h2>12. 재현 정보(Reproducibility)</h2><div class="table"><table><tbody><tr><th>실험 그룹</th><td><code>${escapeHtml(experimentGroupId)}</code></td></tr><tr><th>모델</th><td>${escapeHtml(models)}</td></tr><tr><th>시나리오 번들 해시</th><td><code>${escapeHtml(report.scenarioSetHash)}</code></td></tr><tr><th>프롬프트 해시</th><td><code>${escapeHtml(report.promptHash)}</code></td></tr><tr><th>메모리 릴리스 해시</th><td><code>${escapeHtml(report.memoryReleaseHash)}</code></td></tr><tr><th>외부 사건 수</th><td>${bundle.externalEvents.length}</td></tr><tr><th>반복</th><td>5회 반복</td></tr><tr><th>문항</th><td>30문항</td></tr></tbody></table></div></section>
</body></html>`;
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, 'utf8');
  return { report, outputPath };
};
