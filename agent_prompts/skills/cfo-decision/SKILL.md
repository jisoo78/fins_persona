---
name: cfo-decision
description: CFO, finance leader, head of finance, founder-CFO, or finance decision-maker deep interview skill. Use when generating CFO-specific identity and cross-dimension deep interview questions from PreInterviewContext.
---

# CFO Decision Skill

이 스킬은 사용자의 역할, 목표 페르소나, 인터뷰 맥락이 CFO, 재무 리더, Head of Finance, Founder-CFO, 또는 자본·현금·리스크·수익성·재무 보고를 책임지는 의사결정자일 때 사용하라.

이 스킬은 단독 시스템 프롬프트가 아니다. 항상 `src/decision-engine/prompts/deep-interview-prompt.md`의 공통 심층 인터뷰 원칙과 함께 사용하라.

## 목적

사용자의 재무 의사결정 방식을 추출하라.

목표는 CFO 인터뷰를 진행하는 것이 아니라, 사용자의 판단 기준을 정량화하고 재사용 가능한 도플갱어 페르소나의 재무 판단 규칙으로 변환하는 것이다.

## 입력

`PreInterviewContext`를 입력으로 사용하라.

카테고리별 `question_1`부터 `question_5`까지의 질문·응답 쌍을 읽고, CFO 관점에서 의미 있는 반복 관점, 긴장 관계, 누락된 정량 기준을 찾으라.

## 사용 절차

1. `PreInterviewContext`에서 CFO 관련 카테고리를 식별하라.
2. 각 카테고리에서 사용자가 보호하려는 가치와 감수하려는 위험을 구분하라.
3. 응답 간 긴장 관계를 찾으라. 예: 성장 투자 선호 vs. 현금흐름 보호.
4. 추상적인 표현을 정량 기준으로 좁히라. 예: 충분한 투자, 빠른 판단, 감당 가능한 손실.
5. 필요한 경우 `references/cfo-domain-thresholds.md`를 읽고 CFO 도메인별 정량화 후보와 질문 패턴을 사용하라.
6. 한 번에 하나의 심층 질문만 생성하라.
7. 각 질문은 보기 4개와 `E. 기타 - 직접 입력`을 포함하라.
8. 최종적으로 `DeepInterviewResult.identity`와 `DeepInterviewResult.cross_dimension`에 연결될 수 있는 질문, 답변, 도출 원칙의 근거를 남기라.

## 질문 생성 기준

좋은 CFO 심층 질문은 사용자의 추상적 선호를 실행 가능한 재무 판단 기준으로 바꾼다.

다음 중 최소 하나를 확인하라.

- 매출 또는 영업이익 대비 투자 한도
- 현금 런웨이 또는 비상 현금 기준
- ROI, IRR, 회수 기간
- 최대 허용 손실
- 부채, 이자보상, 차환 리스크 기준
- 예산 또는 인력 제약
- 보고 또는 이사회 에스컬레이션 기준
- 재검토 주기 또는 중단 조건

## 금지 사항

사용자의 답변보다 CFO 일반론을 우선하지 마라.

사전 응답에 이미 있는 선택 이유를 그대로 다시 묻지 마라.

모든 질문을 숫자로만 몰아가지 마라. 행동 가능한 경계선이 더 중요할 때는 예외 조건이나 중단 기준을 물어라.

한 개의 약한 신호만으로 안정적인 재무 규칙을 확정하지 마라. 신호가 약하면 심층 인터뷰에서 `identity` 또는 `cross_dimension` 질문으로 확인하라.

## 출력 기대

이 스킬이 기여한 CFO 규칙은 AI 페르소나가 실제 의사결정에서 적용할 수 있을 만큼 구체적이어야 한다.

좋은 출력:

```text
시장 진입 투자안은 첫 90일 안에 최소 2개의 수요 검증 신호가 있고, 누적 손실이 연간 영업이익의 25% 이하일 때만 다음 단계 투자를 승인한다.
```

나쁜 출력:

```text
성장을 지원하되 리스크를 관리한다.
```

중요한 규칙마다 어떤 `PreInterviewContext` 응답과 어떤 심층 인터뷰 답변에서 나온 것인지 근거를 남기라. 최종 Markdown 렌더링은 `persona-prompt-renderer` 스킬이 수행한다.
