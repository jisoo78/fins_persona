# Origin Main RAG Integration Design

## 목표

`origin/main@ea63853`의 Cohere reranker, Vector RAG 개선, 의사결정 유사도 평가 자료를 현재 `prompt/fins_persona` 브랜치에 통합한다. 현재 B Track의 Main Prompt 불변 버전 관리, 동적 평가 실행·채점·리포트 구조와 사용자 실행 데이터는 유지한다.

## 확정된 병합 원칙

1. `data/b-track/amy-hood/prompt-versions.json`과 `prompts/<version-id>.md`를 Main Prompt의 단일 원본으로 유지한다.
2. 원격의 `agent_prompts/prompts/amy-hood-main-system-prompt.md`는 평가 당시 참고 아티팩트로만 보존하고 런타임 원본으로 사용하지 않는다.
3. 원격의 `server/generateGeneralRagEvaluation.ts` 기능은 `server/evaluation/decisionSimilarityBaseline.ts`로 격리한다.
4. 삭제된 `server/generateGeneralRagEvaluation.ts`와 구형 `rag:evaluate:keyword`, `rag:evaluate:vector`, `rag:evaluate:vector:train` 명령은 복원하지 않는다.
5. 격리된 의사결정 유사도 평가기는 `RAG_EVAL_SYSTEM_PROMPT_PATH`가 아니라 활성 Prompt 버전의 ID, SHA-256, 본문을 읽는다.
6. `src/components/EvaluationView.tsx`는 현재 동적 실행·Codex 채점 화면을 유지한다. 원격의 정적 비교 UI로 덮어쓰지 않는다.
7. 원격의 정적 평가 JSON·CSV·문서는 기준선 아티팩트로 보존하고, 다른 개발자 컴퓨터의 절대 경로는 활성 Prompt 버전 정보로 정규화한다.
8. `.env.example`의 로컬/OpenAI 설정과 원격 Cohere/Judge 설정을 모두 보존한다.
9. `evaluation/amy_hood_eval_question_reviews.json`, `evaluation/runs/`, 로컬 Prompt 버전 데이터는 병합 커밋에 포함하지 않는다.

## 구조

```text
prompt version store
  -> readActivePromptVersion(root)
  -> decisionSimilarityPrompt adapter
  -> decisionSimilarityBaseline CLI
  -> generateRagEvaluationAnswer(systemPrompt + reranked evidence)

existing B Track UI
  -> EvaluationView: 실행·재개·Codex 채점
  -> EvaluationReportView: 단일·비교 리포트

remote baseline artifacts
  -> evaluation/*decision_similarity*
  -> docs/*evaluation*
  -> 런타임 UI와 분리된 재현 자료
```

## 오류 처리

- 활성 Prompt 버전이 없거나 필수 heading 검증을 통과하지 못하면 의사결정 유사도 평가를 시작하지 않는다.
- 환경변수에 과거 정적 Prompt 경로가 남아 있어도 fallback으로 사용하지 않는다.
- Cohere 호출 실패 시 원격 구현의 Vector 순위 fallback을 유지한다.
- 병합 후 지원 코드에 `server/generateGeneralRagEvaluation.ts`가 다시 생기면 회귀 테스트를 실패시킨다.

## 테스트

- 활성 버전 ID·해시·본문 전달 정상 경로 1개
- 현실적인 Edge Case 정확히 3개: 초기 호환 파일 이관, 재활성화 반영, 한국어 본문 보존
- Failure Path: Prompt 저장소가 없거나 유효하지 않으면 정적 경로 fallback 없이 안전하게 실패
- 기존 GraphRAG/정적 평가 제거 계약, B Track 평가 50개, Persona 14개, Inventory 7개 회귀 테스트
- TypeScript 검사, Vite build, `git diff --check`

## 보고서

병합이 완료되면 `docs/reports/2026-07-14-origin-main-rag-integration-report.html`에 다음을 기록한다.

- 병합 기준 SHA와 결과 SHA
- 충돌 세 파일의 해결 방식
- 격리한 기능
- 제거 상태를 유지한 기능
- 변경한 Prompt 데이터 흐름
- 수용한 원격 RAG/Cohere 기능
- 테스트와 빌드 결과
- 커밋에서 제외한 사용자 런타임 데이터
