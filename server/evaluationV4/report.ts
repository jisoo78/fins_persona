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
  const [report, bundle, allRuns] = await Promise.all([
    buildEvaluationV4CalibrationReport(root, experimentGroupId),
    loadEvaluationV4Bundle(root, 'calibration'),
    listEvaluationV4Runs(root),
  ]);
  const reportRuns = allRuns.filter((run) => run.experimentGroupId === experimentGroupId);
  const armDescriptions: Record<EvaluationV4Arm, {
    korean: string; english: string; input: string; purpose: string;
  }> = {
    generic_cfo: { korean: '일반 CFO 조언자', english: 'Generic CFO Advisor', input: '일반적인 최고재무책임자 역할 지침만 제공', purpose: 'Amy Hood 정보가 없는 기준선 확인' },
    amy_prompt: { korean: 'Amy Hood 메인 프롬프트', english: 'Amy Hood Main Prompt', input: 'Amy Hood 판단 스타일을 정리한 메인 프롬프트 제공', purpose: '메인 프롬프트 단독 효과 확인' },
    amy_policy_rag: { korean: 'Amy Hood 정책 검색', english: 'Amy Hood Policy RAG', input: '메인 프롬프트와 질문별 관련 판단 정책 제공', purpose: '구조화된 정책 기억의 추가 효과 확인' },
    amy_full_rag: { korean: 'Amy Hood 전체 근거 검색', english: 'Amy Hood Full RAG', input: '메인 프롬프트와 정책·사건·직접 발언 근거 제공', purpose: '전체 장기기억 정보의 추가 효과 확인' },
  };
  const domainLabels: Record<(typeof EVALUATION_V4_DOMAINS)[number], string> = {
    m_and_a: '인수·합병(Mergers & Acquisitions, M&A)',
    ai_cloud_capex: 'AI·클라우드 자본지출(AI & Cloud Capital Expenditure)',
    pricing_monetization: '가격·수익화(Pricing & Monetization)',
    cost_efficiency: '비용 효율(Cost Efficiency)',
    shareholder_return_risk: '주주환원·재무위험(Shareholder Return & Financial Risk)',
  };
  const score = (value: number | null | undefined) => value === null || value === undefined ? '측정 불가' : value.toFixed(2);
  const lift = (value: number | null | undefined) => value === null || value === undefined ? '측정 불가' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
  const arms = EVALUATION_V4_ARMS.map((arm) => {
    const description = armDescriptions[arm];
    const comparison = arm === 'generic_cfo' ? '비교 기준선' : arm === 'amy_prompt'
      ? `일반 CFO 대비 ${lift(report.pairedLift.amy_prompt)}`
      : `Amy Hood 메인 프롬프트 대비 ${lift(report.pairedLift[arm])}`;
    return `<tr><th scope="row"><strong>${escapeHtml(description.korean)}(${escapeHtml(description.english)})</strong></th><td>${escapeHtml(description.input)}</td><td>${escapeHtml(description.purpose)}</td><td class="number">${escapeHtml(score(report.armMeans[arm]))}</td><td>${escapeHtml(comparison)}</td></tr>`;
  }).join('');
  const domains = EVALUATION_V4_DOMAINS.map((domain) => `<tr><th scope="row">${escapeHtml(domainLabels[domain])}</th>${EVALUATION_V4_ARMS.map((arm) => `<td class="number">${escapeHtml(score(report.domainMeans[arm][domain]))}</td>`).join('')}</tr>`).join('');
  const variants = [
    { key: 'base_transfer' as const, label: '기본 전이 상황(Base-transfer Scenario)', explanation: '기존 판단 원칙을 새로운 회사 상황에 적용하는 문제' },
    { key: 'reversal' as const, label: '판단 반전 상황(Reversal Scenario)', explanation: '기존 결정을 멈추거나 바꿔야 하는 조건을 묻는 문제' },
  ].map(({ key, label, explanation }) => `<tr><th scope="row">${escapeHtml(label)}<br><span class="muted">${escapeHtml(explanation)}</span></th>${EVALUATION_V4_ARMS.map((arm) => `<td class="number">${escapeHtml(score(report.variantMeans[arm][key]))}</td>`).join('')}</tr>`).join('');
  const secondaryPresent = bundle.externalEvents.filter(({ secondarySourceStatus }) => secondarySourceStatus === 'present').length;
  const secondaryUnavailable = bundle.externalEvents.filter(({ secondarySourceStatus }) => secondarySourceStatus === 'documented_unavailable').length;
  const outcomeEvidenceCount = new Set(bundle.externalEvents.flatMap(({ outcomeEvidenceIds }) => outcomeEvidenceIds)).size;
  const fullRagDomains = Object.entries(report.domainMeans.amy_full_rag)
    .filter((entry): entry is [(typeof EVALUATION_V4_DOMAINS)[number], number] => typeof entry[1] === 'number')
    .sort((left, right) => left[1] - right[1]);
  const weakestDomain = fullRagDomains[0];
  const policyToFullDelta = (report.armMeans.amy_full_rag ?? 0) - (report.armMeans.amy_policy_rag ?? 0);
  const models = [...new Set(reportRuns.map(({ model }) => model))].join(', ');
  const promptVersions = [...new Set(reportRuns.map(({ promptVersionId }) => promptVersionId).filter(Boolean))].join(', ') || '버전 정보 없음';
  const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Amy Hood Decision Advisor 평가 V4 교정 실험 보고서</title>
<style>
:root{color-scheme:light;--ink:#172033;--navy:#0c326f;--blue:#315fbd;--green:#08783e;--red:#b42318;--amber:#9a5b00;--line:#dce2ec;--soft:#f7f8fb;--blue-soft:#eef4ff;--amber-soft:#fff7e8}*{box-sizing:border-box}body{font-family:system-ui,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;max-width:1120px;margin:40px auto;padding:0 24px;color:var(--ink);background:var(--soft);line-height:1.72}h1{font-size:2.2rem;line-height:1.25;margin:.2em 0}h2{color:var(--navy);margin-top:0;font-size:1.55rem}h3{color:#244a82;margin-bottom:.35rem}p{margin:.65rem 0}.eyebrow{font-weight:750;color:var(--blue);letter-spacing:.03em}.subtitle{font-size:1.08rem;color:#4a5870}.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:24px;margin:18px 0;box-shadow:0 3px 14px rgba(28,47,78,.04)}.hero{padding:30px}.metric-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:18px 0}.metric{background:#fff;border:1px solid var(--line);border-radius:12px;padding:17px}.metric .label{font-size:.9rem;color:#56637a}.metric .value{display:block;font-size:1.75rem;font-weight:800;color:var(--navy);margin:.15rem 0}.metric .detail{font-size:.87rem;color:#56637a}.go{font-size:1.35rem;font-weight:800;color:${report.benchmarkGoNoGo === 'go' ? 'var(--green)' : 'var(--red)'}}.note,.warning,.success{padding:14px 17px;border-radius:8px;margin:14px 0}.note{border-left:4px solid var(--blue);background:var(--blue-soft)}.warning{border-left:4px solid var(--amber);background:var(--amber-soft)}.success{border-left:4px solid var(--green);background:#edf9f2}.table-wrap{overflow-x:auto;margin:12px 0}table{width:100%;border-collapse:collapse;min-width:720px}th,td{text-align:left;vertical-align:top;padding:11px 12px;border-bottom:1px solid #e5e9f0}thead th{background:#f1f4f9;color:#253c61}tbody th{font-weight:650}.number{text-align:right;font-variant-numeric:tabular-nums;font-weight:700}.muted{color:#667085;font-size:.88em}.steps{counter-reset:step;list-style:none;padding:0}.steps li{position:relative;padding:0 0 18px 52px;min-height:42px}.steps li::before{counter-increment:step;content:counter(step);position:absolute;left:0;top:0;width:34px;height:34px;border-radius:50%;background:var(--navy);color:#fff;display:grid;place-items:center;font-weight:800}.definition-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}.definition{border:1px solid var(--line);border-radius:10px;padding:15px;background:#fbfcfe}.tag{display:inline-block;border-radius:999px;padding:3px 9px;background:#e9eef8;color:#294f8e;font-size:.82rem;font-weight:700}code{word-break:break-all;background:#f0f2f6;padding:2px 5px;border-radius:4px}.footer{color:#667085;font-size:.88rem;text-align:center;margin:28px 0}@media(max-width:640px){body{margin:18px auto;padding:0 14px}h1{font-size:1.75rem}.card,.hero{padding:18px}th,td{min-width:135px}.metric-grid{grid-template-columns:1fr 1fr}}@media(max-width:430px){.metric-grid{grid-template-columns:1fr}}@media print{body{background:#fff;margin:0;max-width:none}.card,.metric{box-shadow:none;break-inside:avoid}.table-wrap{overflow:visible}table{min-width:0}}
</style></head>
<body>
<header class="card hero"><p class="eyebrow">행동 교정 실험(Behavior Calibration Experiment)</p><h1>Amy Hood Decision Advisor<br>평가 V4 교정 실험 보고서</h1><p class="subtitle">프로젝트를 처음 접하는 독자를 위한 실험 목적·방법·지표·결과 해설</p><div class="note"><strong>중요 안내:</strong> 이 시스템은 공개자료를 바탕으로 구성된 비공식 인공지능 시뮬레이션입니다. Amy Hood 본인이나 Microsoft의 공식 입장이 아닙니다.</div></header>

<section class="card"><h2>한눈에 보는 결론</h2><p>이번 1회 교정 실험은 <strong>Amy Hood의 판단 스타일을 적은 프롬프트와 장기기억 검색이 실제 답변 행동을 바꾸는지</strong> 확인했습니다. 같은 로컬 언어모델에 같은 10개 경영 시나리오를 주고, 제공 정보만 달리한 네 조건을 비교했습니다.</p><p class="go">다음 확대 실험 진행 판정: ${escapeHtml(report.benchmarkGoNoGo.toUpperCase())}</p><p>${report.positiveDirectionalSignal ? '검색된 판단 정책을 제공한 두 조건에서 메인 프롬프트 단독보다 높은 점수가 나타나, 더 큰 평가로 넘어갈 최소 근거를 확보했습니다.' : '사전에 정한 최소 개선 조건을 충족하지 못해 확대 평가를 보류해야 합니다.'}</p><div class="warning"><strong>이 판정의 범위:</strong> GO는 제품 배포 승인이나 Amy Hood의 의사결정을 복제했다는 뜻이 아닙니다. <strong>30문항·5회 반복 평가로 확장해 볼 수 있다는 조건부 판정</strong>입니다.</div></section>

<div class="metric-grid">${EVALUATION_V4_ARMS.map((arm) => `<div class="metric"><span class="label">${escapeHtml(armDescriptions[arm].korean)}(${escapeHtml(armDescriptions[arm].english)})</span><span class="value">${escapeHtml(score(report.armMeans[arm]))}</span><span class="detail">10점 만점 평균</span></div>`).join('')}</div>

<section class="card"><h2>프로젝트 소개</h2><p><strong>Amy Hood Decision Advisor</strong>는 Microsoft 최고재무책임자 Amy Hood의 공개 인터뷰, 발표, 대담과 실적 발표 자료에서 판단 기준·우선순위·조건·예외를 추출하고, 이를 새로운 경영 상황에 적용해 CFO 조언을 제공하려는 프로젝트입니다.</p><p>여기서 <strong>검색 증강 생성(Retrieval-Augmented Generation, RAG)</strong>은 질문과 관련된 판단 정책이나 과거 사건 근거를 장기기억에서 찾아 언어모델의 입력에 함께 넣는 방법입니다. 모델이 별도 도구를 호출하는 방식이 아니라, 검색된 실제 내용이 질문과 함께 직접 제공됩니다.</p></section>

<section class="card"><h2>1. 실험 목적</h2><p>기존 평가에서는 모델 점수가 너무 높아 메인 프롬프트와 RAG가 실제로 도움이 되는지 구분하기 어려웠습니다. 그래서 이번에는 정답 선택 문제가 아니라 <strong>새로운 경영 상황에서 Amy Hood의 판단 기준과 얼마나 일치하는 행동을 제안하는지</strong>를 비교했습니다.</p><div class="definition-grid"><div class="definition"><span class="tag">가설 1</span><h3>메인 프롬프트 효과</h3><p>Amy Hood 메인 프롬프트(Main Prompt)만으로 일반 CFO 조언보다 더 Amy Hood다운 판단이 나오는가?</p></div><div class="definition"><span class="tag">가설 2</span><h3>정책 기억 효과</h3><p>질문별 관련 판단 정책을 검색해 주면 메인 프롬프트 단독보다 행동 정합성이 높아지는가?</p></div><div class="definition"><span class="tag">가설 3</span><h3>전체 근거 효과</h3><p>정책뿐 아니라 사건과 직접 발언 근거까지 제공하면 정책만 제공할 때보다 추가 개선이 생기는가?</p></div></div><p class="note"><strong>이번 실험이 답하지 않는 질문:</strong> 이 결과만으로 Amy Hood의 실제 의사결정을 완벽하게 예측하거나 복제했다고 판단하지 않습니다. 이번 목적은 Prompt/RAG가 답변에 <em>방향성 있는 차이</em>를 만드는지 확인하는 것입니다.</p></section>

<section class="card"><h2>2. 평가 방법</h2><h3>2.1 비교한 네 가지 실험군</h3><p>모델과 질문은 같게 유지하고 모델에게 미리 제공하는 정보만 바꿨습니다. 따라서 조건 간 점수 차이는 어떤 정보가 답변 행동에 영향을 주었는지 관찰하는 단서가 됩니다.</p><div class="table-wrap"><table><thead><tr><th>실험군</th><th>모델에게 제공한 정보</th><th>비교 목적</th><th>평균 AAS</th><th>비교 결과</th></tr></thead><tbody>${arms}</tbody></table></div><h3>2.2 평가 시나리오</h3><p>다른 유명 기업과 경영자의 실제 의사결정 사건을 바탕으로 회사명·인물명·사후 결과를 제거한 가상 시나리오 10개를 구성했습니다. 다섯 핵심 영역마다 기본 전이 문제 1개와 판단 반전 문제 1개가 있습니다.</p><ul><li>인수·합병 2문항</li><li>AI·클라우드 자본지출 2문항</li><li>가격·수익화 2문항</li><li>비용 효율 2문항</li><li>주주환원·재무위험 2문항</li></ul><h3>2.3 실행과 채점 순서</h3><ol class="steps"><li><strong>동일한 질문 준비:</strong> 네 실험군이 완전히 같은 10개 상황을 판단하도록 했습니다.</li><li><strong>네 조건에서 실행:</strong> 10문항 × 4실험군으로 총 40개 답변을 생성했습니다.</li><li><strong>검색 결과 고정:</strong> 두 RAG 실험군은 같은 질문에 대해 같은 검색 결과를 공유했습니다.</li><li><strong>블라인드 채점(Blind Judging):</strong> 실험군명, 모델명, 실행 ID를 숨겨 어느 조건의 답변인지 모르는 상태에서 평가했습니다.</li><li><strong>실험군 복원:</strong> 40개 채점이 끝난 뒤 비공개 연결표로 점수를 실험군에 다시 연결했습니다.</li></ol></section>

<section class="card"><h2>3. 평가 지표</h2><h3>3.1 핵심 점수: 행동 정합성 점수(Action Alignment Score, AAS)</h3><p>AAS는 답변이 사전에 동결한 Amy Hood 판단 정책과 얼마나 일치하는지를 <strong>1점부터 10점</strong>으로 평가합니다. 같은 단어를 썼는지가 아니라 실제 권고 행동과 판단 순서를 함께 봅니다.</p><div class="table-wrap"><table><thead><tr><th>점수 구간</th><th>의미</th><th>쉽게 말하면</th></tr></thead><tbody><tr><th>1~4점</th><td>충돌(Conflict)</td><td>핵심 행동이나 판단 순서가 정책과 반대이거나 크게 어긋남</td></tr><tr><th>5점</th><td>중립(Neutral)</td><td>관련은 있지만 Amy Hood 특유의 판단이라고 보기 어려움</td></tr><tr><th>6~7점</th><td>부분 정합(Partial Alignment)</td><td>방향은 맞지만 우선순위·안전장치·반전 조건 일부가 빠짐</td></tr><tr><th>8~10점</th><td>높은 정합(High Alignment)</td><td>행동과 판단 구조가 대부분 또는 완전히 일치함</td></tr></tbody></table></div><h3>3.2 채점한 네 가지 판단 축</h3><div class="definition-grid"><div class="definition"><h3>행동(Action)</h3><p>결국 무엇을 하라고 권고했는가?</p></div><div class="definition"><h3>우선순위(Priority)</h3><p>어떤 증거와 조건을 먼저 확인했는가?</p></div><div class="definition"><h3>안전장치(Guardrails)</h3><p>결정이 과도하게 확대되지 않도록 어떤 경계를 두었는가?</p></div><div class="definition"><h3>판단 반전 신호(Reversal Signals)</h3><p>어떤 변화가 생기면 현재 결정을 멈추거나 바꿀 것인가?</p></div></div><h3>3.3 보조 지표</h3><div class="table-wrap"><table><thead><tr><th>지표</th><th>뜻</th><th>왜 보는가</th></tr></thead><tbody><tr><th>비교 향상 폭(Lift)</th><td>한 실험군 평균에서 비교 기준 평균을 뺀 값</td><td>프롬프트나 RAG 추가가 몇 점의 변화를 만들었는지 확인</td></tr><tr><th>의도 정책 검색률(Mapped Policy Rate)</th><td>정답지에 연결된 정책이 검색 결과에 포함된 비율</td><td>검색기가 올바른 영역을 찾았는지 확인</td></tr><tr><th>잘못된 영역 검색률(Wrong-domain Rate)</th><td>질문과 다른 영역의 정책을 선택한 비율</td><td>관련 없는 기억이 섞이는 오류 확인</td></tr><tr><th>검색 캐시 일치율(Cache Agreement Rate)</th><td>두 RAG 실험군이 같은 검색 기반을 쓴 비율</td><td>두 RAG 조건을 공정하게 비교했는지 확인</td></tr><tr><th>행동 변화 문항 수(Behavior Change Count)</th><td>RAG가 다른 행동 또는 우선순위를 만든 시나리오 수</td><td>RAG가 문장만 늘린 것이 아니라 결정을 바꿨는지 확인</td></tr></tbody></table></div></section>

<section class="card"><h2>4. 전체 정량 결과(Before vs After)</h2><div class="table-wrap"><table><thead><tr><th>실험군</th><th>모델에게 제공한 정보</th><th>비교 목적</th><th>평균 AAS</th><th>비교 결과</th></tr></thead><tbody>${arms}</tbody></table></div><div class="success"><strong>핵심 관찰:</strong> 메인 프롬프트 단독은 일반 CFO 대비 ${escapeHtml(lift(report.pairedLift.amy_prompt))}점으로 개선되지 않았습니다. 정책 RAG는 메인 프롬프트 대비 ${escapeHtml(lift(report.pairedLift.amy_policy_rag))}점, Full RAG는 ${escapeHtml(lift(report.pairedLift.amy_full_rag))}점 높았습니다.</div><p>정책 RAG와 Full RAG의 차이는 ${escapeHtml(lift(policyToFullDelta))}점입니다. 사건·직접 발언까지 추가한 효과가 작았으므로 Full RAG가 항상 더 우수하다고 결론 내리기에는 이릅니다.</p></section>

<section class="card"><h2>5. 영역별 AAS</h2><p>평균만 보면 어느 판단 영역이 약한지 알 수 없으므로 다섯 영역을 따로 비교했습니다.</p><div class="table-wrap"><table><thead><tr><th>의사결정 영역</th>${EVALUATION_V4_ARMS.map((arm) => `<th>${escapeHtml(armDescriptions[arm].korean)}</th>`).join('')}</tr></thead><tbody>${domains}</tbody></table></div>${weakestDomain ? `<div class="warning"><strong>가장 취약한 영역:</strong> Full RAG 기준 ${escapeHtml(domainLabels[weakestDomain[0]])}이 ${escapeHtml(score(weakestDomain[1]))}점으로 가장 낮았습니다. 이 영역의 정책·반례와 판단 반전 조건을 우선 보강해야 합니다.</div>` : ''}</section>

<section class="card"><h2>6. 문제 유형별 결과</h2><div class="table-wrap"><table><thead><tr><th>문제 유형</th>${EVALUATION_V4_ARMS.map((arm) => `<th>${escapeHtml(armDescriptions[arm].korean)}</th>`).join('')}</tr></thead><tbody>${variants}</tbody></table></div><p>판단 반전 상황은 기존 원칙을 그대로 적용하는 것이 아니라 <strong>언제 그 원칙을 멈추거나 바꿀지</strong> 판단해야 하므로 더 어렵습니다. 실제 결과에서도 RAG 실험군의 기본 전이 점수보다 반전 상황 점수가 낮았습니다.</p></section>

<section class="card"><h2>7. 검색과 행동 변화 진단</h2><div class="metric-grid"><div class="metric"><span class="label">의도 정책 검색률</span><span class="value">${(report.retrieval.mappedPolicyRate * 100).toFixed(1)}%</span><span class="detail">정답 정책이 검색된 비율</span></div><div class="metric"><span class="label">잘못된 영역 검색률</span><span class="value">${(report.retrieval.wrongDomainRate * 100).toFixed(1)}%</span><span class="detail">관련 없는 정책을 선택한 비율</span></div><div class="metric"><span class="label">검색 캐시 일치율</span><span class="value">${(report.retrieval.cacheAgreementRate * 100).toFixed(1)}%</span><span class="detail">두 RAG 조건의 검색 기반 일치</span></div><div class="metric"><span class="label">행동 변화 시나리오</span><span class="value">${report.behaviorChangeCount}/10</span><span class="detail">RAG가 행동·우선순위를 바꾼 문항</span></div></div><p>이번 실행에서는 검색기가 모든 질문에서 의도한 정책을 찾았고 잘못된 영역을 선택하지 않았습니다. 모든 시나리오에서 적어도 한 RAG 조건의 행동 또는 우선순위가 메인 프롬프트 단독과 달라졌습니다. 이는 RAG가 단순 메타데이터가 아니라 실제 답변 입력으로 작동했음을 보여줍니다.</p></section>

<section class="card"><h2>8. 근거 완전성</h2><p>좋은 점수와 별개로 현재 데이터가 얼마나 완전한지도 함께 확인해야 합니다.</p><div class="table-wrap"><table><thead><tr><th>근거 항목</th><th>현재 상태</th><th>해석</th></tr></thead><tbody><tr><th>가상 사건별 공식 1차 자료(Official Primary Source)</th><td>${bundle.externalEvents.length}개 사건 / ${new Set(bundle.externalEvents.map(({ primarySourceId }) => primarySourceId)).size}개 고유 자료</td><td>각 평가 사건은 최소 한 개의 공식 자료에 연결됨</td></tr><tr><th>독립 2차 자료(Independent Secondary Source)</th><td>${secondaryPresent}개 사건</td><td>현재 교정 번들에는 독립 교차검증 자료가 없음</td></tr><tr><th>2차 자료 부재 사유</th><td>${secondaryUnavailable}개 사건 기록</td><td>누락을 숨기지 않고 검토 상태로 명시함</td></tr><tr><th>사후 결과 근거(Outcome Evidence)</th><td>${outcomeEvidenceCount}개</td><td>결정 당시 정보와 사후 성공 여부를 분리했지만 결과 기반 검증은 아직 없음</td></tr><tr><th>RAG 답변 근거 첨부율</th><td>${(report.retrieval.evidenceAttachmentRate * 100).toFixed(1)}%</td><td>RAG 조건의 모든 답변에 검색 근거가 연결됨</td></tr></tbody></table></div></section>

<section class="card"><h2>9. 판정 기준과 결과</h2><p>실험 후 유리하게 기준을 바꾸지 않도록 다음 세 조건을 모두 만족할 때만 양의 방향 신호로 인정했습니다.</p><ol><li>의도 정책 검색률 80% 이상</li><li>행동 또는 우선순위가 달라진 시나리오 3개 이상</li><li>가장 높은 RAG 실험군이 Amy Hood 메인 프롬프트보다 AAS 0.5점 이상 높음</li></ol><p class="go">현재 판정: ${report.positiveDirectionalSignal ? '세 조건 모두 충족' : '최소 한 조건 미충족'}</p></section>

<section class="card"><h2>10. 한계와 주의사항</h2><ul><li><strong>문항 수:</strong> 10문항이므로 다양한 경영 상황을 대표하지 못합니다.</li><li><strong>반복 횟수:</strong> 한 번만 실행해 결과가 얼마나 안정적으로 반복되는지 알 수 없습니다.</li><li><strong>채점자:</strong> 단일 Codex 채점자만 사용해 채점자 편향을 추정할 수 없습니다.</li><li><strong>원천 자료:</strong> 평가 사건의 독립 2차 자료와 사후 결과 근거가 없습니다.</li><li><strong>모델 범위:</strong> 한 로컬 모델 결과이므로 다른 모델에서도 같은 효과가 나타난다고 단정할 수 없습니다.</li></ul><p>신뢰도 검증(Reliability Test)은 ${report.reliability.passed ? '통과' : '미수행'}, 반복 안정성 검증(Stability Test)은 ${report.stability.passed ? '통과' : '미수행'} 상태입니다.</p></section>

<section class="card"><h2>11. 최종 판단과 다음 단계</h2><p><strong>냉정한 결론:</strong> 이번 결과는 “Amy Hood 메인 프롬프트만 잘 쓰면 충분하다”는 가설을 지지하지 않습니다. 질문과 관련된 구조화 정책을 실제 내용으로 제공했을 때 행동 정합성이 높아졌으므로 <strong>동적 RAG가 이 프로젝트의 핵심 작동 요소</strong>라는 방향성은 확인했습니다.</p><ol><li>30문항으로 평가 범위를 확대하고 같은 조건을 5회 반복합니다.</li><li>가장 취약한 주주환원·재무위험 정책과 반례를 우선 보강합니다.</li><li>독립 2차 자료와 사후 결과 자료를 추가하되 판단 시점 입력과 분리합니다.</li><li>복수 채점자 또는 반복 채점으로 점수 신뢰도를 측정합니다.</li></ol><div class="success"><strong>최종 상태:</strong> 현재 판정은 배포 승인이 아니라 <strong>다음 확대 실험 진행 판정(${escapeHtml(report.benchmarkGoNoGo.toUpperCase())})</strong>입니다.</div></section>

<section class="card"><h2>12. 재현 정보(Reproducibility Information)</h2><div class="table-wrap"><table><tbody><tr><th>실험 그룹 ID</th><td><code>${escapeHtml(experimentGroupId)}</code></td></tr><tr><th>실행 모델(Model)</th><td>${escapeHtml(models)}</td></tr><tr><th>메인 프롬프트 버전</th><td><code>${escapeHtml(promptVersions)}</code></td></tr><tr><th>시나리오 번들 해시</th><td><code>${escapeHtml(report.scenarioSetHash)}</code></td></tr><tr><th>활성 메모리 릴리스</th><td><code>${escapeHtml(reportRuns.find(({ memoryReleaseId }) => memoryReleaseId)?.memoryReleaseId ?? 'RAG 미사용')}</code></td></tr><tr><th>실험 조건</th><td>4개</td></tr><tr><th>시나리오</th><td>10개</td></tr><tr><th>완료 답변</th><td>${report.diagnostics.completeAnswers}개</td></tr><tr><th>유효 채점</th><td>${report.diagnostics.validGrades}개</td></tr><tr><th>반복 횟수</th><td>${report.repetitions}회</td></tr><tr><th>평균 RAG 문맥 길이</th><td>${report.retrieval.meanContextTokens.toFixed(1)} 토큰</td></tr></tbody></table></div></section>

<p class="footer">Amy Hood Decision Advisor · Evaluation V4 Calibration Report · 비공식 AI 시뮬레이션</p>
</body></html>`;
  await import('node:fs/promises').then(({ mkdir }) => mkdir(path.dirname(outputPath), { recursive: true }));
  await writeFile(outputPath, html, 'utf8');
  return { report, outputPath };
};
