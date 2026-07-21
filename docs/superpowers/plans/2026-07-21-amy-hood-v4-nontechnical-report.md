# Amy Hood Evaluation V4 비전문가용 상세 보고서 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evaluation V4 결과를 개발 경험이 없는 한국인 독자가 실험 목적, 방법, 지표, 결과와 한계를 순서대로 이해할 수 있는 영·한 병기 HTML 보고서로 생성한다.

**Architecture:** 기존 `buildEvaluationV4CalibrationReport`의 정량 계산과 저장 형식은 유지하고 `writeEvaluationV4HtmlReport`의 표현 계층만 확장한다. 보고서의 모든 수치는 정식 보고 JSON과 동결 번들에서 동적으로 읽고, HTML 생성 테스트가 필수 섹션과 용어 설명을 고정한다.

**Tech Stack:** TypeScript, Node.js test runner, 정적 HTML/CSS, 기존 Evaluation V4 JSON 아티팩트

## Global Constraints

- 대상 독자는 개발 경험이 없는 한국인 의사결정자다.
- 한국어를 기본으로 하고 영어 전문 용어는 한글을 먼저 쓴 뒤 괄호 안에 병기한다.
- `GO`는 제품 배포 승인이 아니라 30문항·5회 반복 확대 실험 진행 판정으로 설명한다.
- 기존 실험 수치와 해시는 수동 복사하지 않고 정식 JSON 산출물에서 읽는다.
- 새로운 런타임 의존성을 추가하지 않는다.

---

### Task 1: 비전문가용 보고서 계약과 HTML 생성기 개정

**Files:**
- Modify: `tests/amyHoodEvaluationV4Report.test.ts`
- Modify: `server/evaluationV4/report.ts`

**Interfaces:**
- Consumes: `writeEvaluationV4HtmlReport(root: string, experimentGroupId: string, outputPath: string)`와 `EvaluationV4ExperimentReport`.
- Produces: 동일한 함수 시그니처로 목적·방법·지표·결과·한계·재현 정보를 포함한 HTML 파일.

- [ ] **Step 1: 필수 설명 섹션을 고정하는 실패 테스트 작성**

기존 happy-path 테스트의 HTML 검증에 다음 계약을 추가한다.

```ts
assert.match(html, /1\. 실험 목적/);
assert.match(html, /2\. 평가 방법/);
assert.match(html, /3\. 평가 지표/);
assert.match(html, /행동 정합성 점수\(Action Alignment Score, AAS\)/);
assert.match(html, /블라인드 채점\(Blind Judging\)/);
assert.match(html, /검색 증강 생성\(Retrieval-Augmented Generation, RAG\)/);
assert.match(html, /일반 CFO 조언자\(Generic CFO Advisor\)/);
assert.match(html, /다음 확대 실험 진행 판정/);
assert.match(html, /재현 정보/);
```

- [ ] **Step 2: 테스트가 기존 간략 보고서에서 실패하는지 확인**

Run: `npm run evaluation:v4:test -- --test-name-pattern='builds complete arm means'`

Expected: `1. 실험 목적` 또는 `행동 정합성 점수(Action Alignment Score, AAS)`가 없어 FAIL.

- [ ] **Step 3: HTML 생성기를 비전문가용 서술 구조로 개정**

`writeEvaluationV4HtmlReport`가 아래 순서와 내용을 생성하도록 수정한다.

```ts
const armDescriptions: Record<EvaluationV4Arm, { korean: string; english: string; input: string; purpose: string }> = {
  generic_cfo: {
    korean: '일반 CFO 조언자', english: 'Generic CFO Advisor',
    input: '일반적인 CFO 역할 지침만 제공',
    purpose: 'Amy Hood 정보가 없는 기준선',
  },
  amy_prompt: {
    korean: 'Amy Hood 메인 프롬프트', english: 'Amy Hood Main Prompt',
    input: 'Amy Hood 판단 스타일을 정리한 메인 프롬프트 제공',
    purpose: '메인 프롬프트 단독 효과 확인',
  },
  amy_policy_rag: {
    korean: 'Amy Hood 정책 검색', english: 'Amy Hood Policy RAG',
    input: '메인 프롬프트와 질문별 관련 판단 정책 제공',
    purpose: '구조화 정책 검색의 추가 효과 확인',
  },
  amy_full_rag: {
    korean: 'Amy Hood 전체 근거 검색', english: 'Amy Hood Full RAG',
    input: '메인 프롬프트와 정책·사건·직접 발언 근거 제공',
    purpose: '전체 장기기억 정보의 추가 효과 확인',
  },
};
```

본문에는 다음 내용을 포함한다.

- 프로젝트 소개와 비공식 AI 시뮬레이션 고지
- `1. 실험 목적`, 세 가지 검증 가설과 이번 실험이 복제 증명이 아니라는 범위
- `2. 평가 방법`, 5개 영역 × 2문항 × 4조건 = 40답변과 블라인드 채점 절차
- `3. 평가 지표`, AAS 1~10 구간과 행동·우선순위·안전장치·판단 반전 신호 네 축
- 네 실험군의 한글명·영문명·입력 정보·비교 목적 표
- 전체/영역/시나리오 유형별 수치와 쉬운 해설
- RAG 검색 정확도와 행동 변화 수치의 의미
- 잘된 점, 취약점, 근거 완전성, 통계적 한계
- 조건부 GO와 다음 단계
- 모델명, 실험 그룹, 해시, 응답·채점 수를 담은 재현 정보

CSS에는 숫자 카드, 설명 상자, 반응형 표 래퍼와 인쇄 스타일을 추가한다.

```css
.metric-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.metric{background:#fff;border:1px solid #dce2ec;border-radius:12px;padding:16px}
.table-wrap{overflow-x:auto}
.note{border-left:4px solid #3b6fd8;background:#eef4ff;padding:14px 16px}
@media(max-width:640px){body{margin:20px auto;padding:0 14px}th,td{min-width:130px}}
@media print{body{background:#fff}.card,.metric{break-inside:avoid}}
```

- [ ] **Step 4: 보고서 생성 테스트 통과 확인**

Run: `npm run evaluation:v4:test -- --test-name-pattern='builds complete arm means'`

Expected: 해당 테스트 PASS.

- [ ] **Step 5: 전체 V4 테스트 통과 확인**

Run: `npm run evaluation:v4:test`

Expected: 39 tests, 39 pass, 0 fail.

- [ ] **Step 6: 생성기와 테스트 커밋**

```bash
git add server/evaluationV4/report.ts tests/amyHoodEvaluationV4Report.test.ts
git commit -m "feat: expand v4 report for nontechnical readers"
```

### Task 2: 실제 보고서 재생성 및 검증

**Files:**
- Modify: `docs/reports/2026-07-21-amy-hood-evaluation-v4-calibration.html`

**Interfaces:**
- Consumes: 실험 그룹 `f3a9d5fc-410a-4fa2-bc63-914f1c16c121`의 40개 답변, 40개 활성 채점과 정식 보고 JSON.
- Produces: 동일 경로의 상세 비전문가용 HTML 보고서.

- [ ] **Step 1: 기존 실험 결과로 HTML 재생성**

Run:

```bash
npx tsx server/runAmyHoodEvaluationV4.ts report \
  --group f3a9d5fc-410a-4fa2-bc63-914f1c16c121 \
  --html docs/reports/2026-07-21-amy-hood-evaluation-v4-calibration.html
```

Expected: `outputPath`가 대상 HTML 경로이고 `benchmarkGoNoGo`가 `go`.

- [ ] **Step 2: 핵심 내용과 수치 검증**

Run:

```bash
rg -n '실험 목적|평가 방법|평가 지표|Action Alignment Score|Blind Judging|Retrieval-Augmented Generation|6.30|6.20|7.40|7.60|재현 정보' docs/reports/2026-07-21-amy-hood-evaluation-v4-calibration.html
```

Expected: 모든 용어와 네 실험군 점수가 검색됨.

- [ ] **Step 3: 전체 회귀·정적 검증 실행**

Run:

```bash
npm run evaluation:v4:test
npm run lint
npm run build
git diff --check
```

Expected: 모든 명령 exit 0. 빌드의 기존 대형 청크 경고는 허용하되 오류는 없어야 한다.

- [ ] **Step 4: 보고서 커밋**

```bash
git add docs/reports/2026-07-21-amy-hood-evaluation-v4-calibration.html
git commit -m "docs: publish detailed v4 calibration report"
```
