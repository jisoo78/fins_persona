---
name: persona-prompt-renderer
description: Use when creating a final Markdown persona prompt from PreInterviewContext and DeepInterviewResult for CFO, CEO, CMO, CTO, or other executive decision personas.
---

# Persona Prompt Renderer

이 스킬은 `PreInterviewContext`와 `DeepInterviewResult`를 분석해 최종 `PersonaPromptMarkdown`을 작성할 때 사용한다.

최종 산출물은 JSON 요약이 아니라, 에이전트에 그대로 주입 가능한 Markdown 문서여야 한다. 이 문서는 우리 프로젝트의 DECISION.md급 판단 문서다.

## 입력

반드시 두 입력을 모두 사용하라.

1. `PreInterviewContext v2`
   - 사전 질문 40개 응답
   - `communication_style` 브릿지 질문 1개 응답
   - `stage`, `answer`, `response_time_ms`, `response_signal`

2. `DeepInterviewResult`
   - `identity` 질문/응답/도출 원칙
   - `cross_dimension` 질문/응답/도출 규칙

중간 프로필 없이 두 입력을 직접 분석해 Markdown을 작성한다.

## 절차

1. `PreInterviewContext`에서 카테고리별 5단계 응답을 읽어라.
2. `communication_style`을 확인해 최종 문서의 표현 방식을 정하라.
3. `DeepInterviewResult.identity`에서 페르소나의 자기 인식과 판단 정체성을 추출하라.
4. `DeepInterviewResult.cross_dimension`에서 기준 충돌 시 우선순위 규칙을 추출하라.
5. 사전 질문의 `core_value`, `red_line`, `priority_order` 응답을 근거로 실행 규칙을 작성하라.
6. 각 규칙에는 가능한 한 수치, 조건, 예외, 적용 상황을 포함하라.
7. 중요한 규칙마다 Evidence를 남겨 원본 응답과 연결하라.
8. `references/persona-prompt-template.md` 형식에 맞춰 Markdown을 작성하라.
9. 출력 파싱과 저장 정책이 필요하면 `references/output-handling.md`를 따르라.

## 출력

기본 출력은 Markdown 문서다.

LangChain 등 외부 체인에서 파싱해야 하는 경우에는 Markdown 본문을 `markdown` 필드에 담은 JSON wrapper를 사용할 수 있다. 단, DB나 파일에 저장되는 최종 본문은 Markdown이어야 한다.

## 금지 사항

- 별도 중간 프로필을 요구하지 마라.
- 입력에 없는 성향을 일반론으로 보강하지 마라.
- “공격적”, “보수적”, “미래지향적” 같은 형용사만으로 규칙을 끝내지 마라.
- `slow_response`를 별도 질문 축이나 추가 규칙으로 만들지 마라.
- 근거 없는 의사결정 규칙을 만들지 마라.
- 최종 결과를 JSON 요약으로만 끝내지 마라.
