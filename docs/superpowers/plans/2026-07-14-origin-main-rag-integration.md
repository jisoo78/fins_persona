# Origin Main RAG Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `origin/main@ea63853`의 RAG·Cohere 기준선 기능을 현재 B Track 아키텍처에 충돌 없이 통합하고 HTML 병합 보고서를 만든다.

**Architecture:** 원격 의사결정 유사도 평가기를 `server/evaluation` 아래 독립 CLI로 격리하고, 작은 Prompt adapter가 현재 활성 불변 Prompt 버전을 제공한다. 현재 동적 Evaluation UI와 레거시 제거 계약은 유지하며 원격 정적 결과는 실행 코드가 아닌 기준선 아티팩트로 보존한다.

**Tech Stack:** Git merge-tree/merge, TypeScript 5.8, Node test runner via `tsx --test`, React 19, Vite 6, file-based Prompt version store

## Global Constraints

- 현재 `prompt/fins_persona` 브랜치에서 병합한다.
- `evaluation/amy_hood_eval_question_reviews.json`, `evaluation/runs/`, `data/b-track/amy-hood/prompt-versions.json`, `data/b-track/amy-hood/prompts/`를 stage하지 않는다.
- 새 테스트 파일 상단에 Happy Path 1개, 현실적인 Edge Case 정확히 3개, 필요한 Failure Path를 명시한다.
- Main Prompt 저장소가 단일 런타임 원본이다.
- 삭제된 GraphRAG 및 구형 정적 평가 진입점을 복원하지 않는다.

---

### Task 1: 병합 전 설계와 데이터 보호

**Files:**
- Create: `docs/superpowers/specs/2026-07-14-origin-main-rag-integration-design.md`
- Create: `docs/superpowers/plans/2026-07-14-origin-main-rag-integration.md`

**Interfaces:**
- Consumes: 승인된 권장 병합안과 `origin/main@ea63853`
- Produces: 충돌 해결 기준과 실행 체크리스트

- [ ] **Step 1: 사용자 데이터 경로와 원격 변경 경로의 비충돌을 재확인한다.**

Run: `git status --short && git merge-tree --write-tree HEAD origin/main`

Expected: 사용자 데이터 경로 충돌 없음, 코드 충돌은 `package.json`, `server/generateGeneralRagEvaluation.ts`, `src/components/EvaluationView.tsx` 세 개.

- [ ] **Step 2: 설계와 계획 문서를 커밋한다.**

```bash
git add docs/superpowers/specs/2026-07-14-origin-main-rag-integration-design.md docs/superpowers/plans/2026-07-14-origin-main-rag-integration.md
git commit -m "docs: plan origin main RAG integration"
```

### Task 2: 활성 Prompt adapter TDD

**Files:**
- Create: `tests/decisionSimilarityPrompt.test.ts`
- Create: `server/evaluation/decisionSimilarityPrompt.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `readActivePromptVersion(root)`
- Produces: `resolveDecisionSimilarityPrompt(root): Promise<{ promptVersionId: string; promptHash: string; systemPrompt: string }>`

- [ ] **Step 1: 다음 계약의 실패 테스트를 먼저 작성한다.**

```ts
/**
 * Test Plan:
 * 1. Happy Path:
 *    - 활성 Prompt 버전의 ID, 해시와 본문을 평가 입력으로 반환한다.
 * 2. Edge Cases:
 *    - 호환 Markdown만 있으면 초기 불변 버전으로 이관한다.
 *    - 과거 버전을 재활성화하면 해당 본문을 반환한다.
 *    - 한국어가 포함된 유효한 Prompt 본문을 원형 보존한다.
 * 3. Failure Path:
 *    - Prompt 저장소와 유효한 호환 파일이 없으면 환경변수 경로로 우회하지 않고 실패한다.
 */
```

Run: `npx tsx --test tests/decisionSimilarityPrompt.test.ts`

Expected: `Cannot find module '../server/evaluation/decisionSimilarityPrompt'`로 RED.

- [ ] **Step 2: 최소 adapter를 구현한다.**

```ts
import { readActivePromptVersion } from '../promptVersions/store';

export const resolveDecisionSimilarityPrompt = async (root: string) => {
  const active = await readActivePromptVersion(root);
  return {
    promptVersionId: active.versionId,
    promptHash: active.sha256,
    systemPrompt: active.content,
  };
};
```

- [ ] **Step 3: GREEN을 확인한다.**

Run: `npx tsx --test tests/decisionSimilarityPrompt.test.ts`

Expected: 5개 테스트 PASS.

### Task 3: 원격 main 병합과 세 충돌 해결

**Files:**
- Merge: `origin/main`
- Create: `server/evaluation/decisionSimilarityBaseline.ts`
- Modify: `package.json`
- Modify: `server/agentService.ts`
- Modify: `src/components/EvaluationView.tsx`
- Preserve deletion: `server/generateGeneralRagEvaluation.ts`

**Interfaces:**
- Consumes: Task 2 `resolveDecisionSimilarityPrompt`
- Produces: `npm run rag:evaluate:decision-similarity`, `npm run rag:score:decision-similarity`

- [ ] **Step 1: 커밋하지 않는 병합을 시작한다.**

Run: `git merge --no-commit --no-ff origin/main`

Expected: 세 파일 충돌, 사용자 데이터는 unstaged 상태 유지.

- [ ] **Step 2: 원격 평가기를 독립 파일로 이관한다.**

원격 stage-3의 `server/generateGeneralRagEvaluation.ts`를 `server/evaluation/decisionSimilarityBaseline.ts`로 옮기고 상대 import를 조정한다. `RAG_EVAL_SYSTEM_PROMPT_PATH` 읽기를 제거하고 `main()` 시작 시 다음을 사용한다.

```ts
const prompt = await resolveDecisionSimilarityPrompt(process.cwd());
```

LLM 호출에는 `prompt.systemPrompt`를 전달하고 출력 metadata에는 `prompt_version_id`, `prompt_hash`를 기록한다.

- [ ] **Step 3: package 스크립트를 통합한다.**

현재 inventory/persona/evaluation 명령과 `cheerio` 의존성을 유지하고 다음 원격 명령만 추가한다.

```json
"rag:evaluate:decision-similarity": "RAG_RETRIEVAL=vector RAG_EVAL_QUESTIONS_PATH=evaluation/amy_hood_decision_similarity_answer_key_15.json RAG_EVAL_OUTPUT_PATH=evaluation/amy_hood_decision_similarity_general_rag_answers.lock.json tsx server/evaluation/decisionSimilarityBaseline.ts",
"rag:score:decision-similarity": "tsx server/scoreAmyHoodDecisionEvaluation.ts"
```

`evaluation:test`에는 `tests/decisionSimilarityPrompt.test.ts`를 추가한다.

- [ ] **Step 4: UI 충돌은 현재 동적 EvaluationView로 해결한다.**

원격 정적 결과 import와 기존 삭제된 summary import를 넣지 않는다. 원격 JSON·CSV·문서는 기준선 아티팩트로만 보존한다.

- [ ] **Step 5: 충돌이 모두 해소됐는지 확인한다.**

Run: `git diff --name-only --diff-filter=U`

Expected: 출력 없음.

### Task 4: 원격 아티팩트 정규화와 문서 정합성

**Files:**
- Modify: `evaluation/amy_hood_decision_similarity_main_prompt_answers.lock.json`
- Modify: `evaluation/amy_hood_decision_similarity_main_prompt_scored.json`
- Modify: `docs/amy-hood-main-prompt-rag-evaluation-result.md`

**Interfaces:**
- Consumes: 원격 정적 평가 결과
- Produces: 개발자 로컬 절대 경로가 없는 재현 가능한 metadata

- [ ] **Step 1: `/Users/choijisoo/Downloads/decision` 절대 경로를 제거한다.**

결과 metadata에는 상대 파일 경로 대신 평가 당시 Prompt SHA 또는 `legacy_static_artifact` 표기를 사용한다. 런타임 CLI는 새 실행부터 실제 활성 `prompt_version_id`와 `prompt_hash`를 기록한다.

- [ ] **Step 2: 문서의 실행 명령과 단일 원본 설명을 새 격리 모듈에 맞춘다.**

Run: `rg -n 'generateGeneralRagEvaluation|RAG_EVAL_SYSTEM_PROMPT_PATH|/Users/choijisoo' docs evaluation package.json server`

Expected: 지원 코드·문서·metadata에 금지된 경로와 구형 진입점 없음.

### Task 5: HTML 병합 보고서와 전체 검증

**Files:**
- Create: `docs/reports/2026-07-14-origin-main-rag-integration-report.html`

**Interfaces:**
- Consumes: 병합 결과와 검증 로그
- Produces: 브라우저에서 독립적으로 열 수 있는 한국어 HTML 보고서

- [ ] **Step 1: 격리·제거·변경·수용 내용을 HTML로 기록한다.**

보고서는 외부 자산 없이 동작하고 다음 표를 포함한다: 충돌 해결, 격리 기능, 제거 유지 기능, Prompt 데이터 흐름 변경, 원격 수용 기능, 검증 결과, 커밋 제외 데이터.

- [ ] **Step 2: 전체 검증을 실행한다.**

```bash
npm run inventory:test
npm run persona:test
npm run evaluation:test
npm run lint
npm run build
git diff --check
git diff --name-only --diff-filter=U
```

Expected: Inventory 7개, Persona 14개 이상, 평가 전체 PASS, TypeScript 오류 0, Vite build 성공, whitespace·미해결 충돌 0.

- [ ] **Step 3: 사용자 데이터 제외 상태로 병합 커밋한다.**

`evaluation/amy_hood_eval_question_reviews.json`, `evaluation/runs/`, 로컬 Prompt 버전 파일이 staged 목록에 없는지 확인한 뒤 병합 커밋을 만든다.
