# CFO Domain Thresholds

이 파일은 CFO Decision Skill의 상세 도메인 지식이다. CFO 관련 심층 질문을 만들 때, 어떤 기준을 정량화해야 하는지 확인하기 위해 읽어라.

## 목차

1. 자본 배치
2. 이익 vs 현금흐름
3. 부채와 자본구조
4. 투자 의사결정
5. 유동성과 현금 관리
6. 비용·수익성 관리
7. 재무 리스크 관리
8. 거버넌스·보고·이해관계자
9. 질문 패턴
10. 감지할 Anti-Patterns

## 1. 자본 배치

제한된 자본을 어디에 먼저 배분하는지 확인하라.

정량화 후보:

- 단일 initiative에 투입 가능한 최대 예산 비율
- 전략 적합성의 최소 기준
- 최소 기대 수익률
- 기회비용이 과도하다고 판단하는 기준
- CFO가 veto할 수 있는 권한 경계
- 예산 재배분 trigger

긴장 관계:

- 성장 기회 vs. 재무 안정성
- CEO 확신 vs. CFO 거부권
- 장기 전략 vs. 단기 runway
- 집중 베팅 vs. 분산 투자

## 2. 이익 vs 현금흐름

회계상 이익과 실제 현금 전환이 충돌할 때 무엇을 우선하는지 확인하라.

정량화 후보:

- 최소 현금 runway
- 허용 가능한 매출채권 회수 지연 기간
- 운전자본 경고 기준
- Cash conversion cycle 한도
- 최소 운영 현금 buffer
- 현금 스트레스 보고 trigger

긴장 관계:

- 매출 성장 vs. 현금 회수
- 마진 개선 vs. 유동성 보호
- 투자자에게 보이는 실적 vs. 실제 운영 현금
- 단기 이익 vs. 생존 가능성

## 3. 부채와 자본구조

부채, 지분 희석, 금융 유연성 사이의 선택 기준을 확인하라.

정량화 후보:

- Debt-to-EBITDA 한도
- 이자보상배율 기준
- 최대 지분 희석 허용치
- 차환 리스크 경계
- Covenant breach 경고 수준
- 외부 조달 승인 threshold

긴장 관계:

- 지분 희석 vs. 상환 리스크
- 저비용 부채 vs. 전략적 유연성
- 성장 자금 확보 vs. 신용 안정성
- 유리한 조건 vs. 미래 차환 의존도

## 4. 투자 의사결정

투자를 승인, 확대, 보류, 중단하는 기준을 확인하라.

정량화 후보:

- 매출 또는 영업이익 대비 최대 투자 한도
- 최소 ROI 또는 IRR
- 회수 기간
- 최대 허용 손실
- 파일럿 기간
- 시장 검증 기준
- 후속 투자 조건

긴장 관계:

- 시장 선점 vs. 단계적 검증
- 초기 대규모 투자 vs. 손실 통제
- 전략적 가치 vs. 측정 가능한 수익
- Founder 또는 CEO 확신 vs. 재무 증거

## 5. 유동성과 현금 관리

성장을 지원하면서도 현금을 어떻게 보호하는지 확인하라.

정량화 후보:

- 최소 runway 개월 수
- 비상 현금 보유 기준
- 현금 사용 한도
- 유동성 위기 trigger
- 최소 unrestricted cash balance
- 자회사 또는 해외법인 현금 회수 기준

긴장 관계:

- 유휴 현금 vs. 성장 투자
- 현지 자율성 vs. 본사 중앙 통제
- 수익률 추구형 현금 운용 vs. 즉시 유동성
- 예정된 투자 vs. 차입금 상환

## 6. 비용·수익성 관리

비용 통제와 성장 역량 사이의 균형을 확인하라.

정량화 후보:

- 최소 gross margin
- operating margin 목표
- 비용 절감 목표
- 채용 동결 trigger
- CAC 또는 payback 기준
- burn multiple 한도

긴장 관계:

- 비용 절감 vs. 미래 역량
- 수익성 목표 vs. 시장 점유율
- 일괄 삭감 vs. 전략적 우선순위
- 단기 절감 vs. 고객 신뢰

## 7. 재무 리스크 관리

하방 위험, 변동성, 노출 한도를 어떻게 관리하는지 확인하라.

정량화 후보:

- 최대 손실 노출
- hedge threshold
- 환율·금리 노출 한도
- 리스크 검토 주기
- stop-loss trigger
- contingency buffer

긴장 관계:

- upside capture vs. capped downside
- 낮은 확률의 치명적 위험 vs. 기대수익
- 분산된 위험 감수 vs. 중앙 통제
- 리스크 투명성 vs. 경영진 confidence

## 8. 거버넌스·보고·이해관계자

CEO, 이사회, 투자자, 팀에게 재무 판단을 어떻게 전달하는지 확인하라.

정량화 후보:

- 보고 cadence
- materiality threshold
- 설명이 필요한 variance threshold
- 이사회 escalation trigger
- forecast confidence threshold
- 보상 지표 weighting

긴장 관계:

- 명확한 추천안 vs. 중립적 분석
- 낙관적 narrative vs. 보수적 disclosure
- 주주환원 vs. 재투자
- 임원 보상 alignment vs. 장기 기업가치

## 9. 질문 패턴

`PreInterviewContext`의 실제 입력 필드는 다음과 같다.

```json
{
  "카테고리명": {
    "question_1": {
      "question": "사전 질문 내용",
      "answer": "사용자가 선택한 응답"
    }
  }
}
```

질문을 만들 때는 먼저 실제 필드에서 아래 값을 추출하라.

- `category_name`: 최상위 key. 예: `투자 의사결정 기준`
- `question_key`: 질문 key. 예: `question_1`, `question_2`
- `question_number`: `question_key`에서 추출한 번호. 예: `question_1` -> `Q1`
- `question_text`: `question` 필드 값
- `answer_text`: `answer` 필드 값

그 다음 `question_text`와 `answer_text`를 읽고 아래 파생값을 직접 작성하라.

- `preference_summary`: 사용자가 선택한 방향을 한 문장으로 요약한 값
- `constraint_summary`: 같은 카테고리 안에서 발견되는 방어선, 중단 조건, 제한 조건
- `missing_threshold`: 아직 숫자나 조건으로 확정되지 않은 기준

`preference_summary`, `constraint_summary`, `missing_threshold`는 입력 JSON에 존재하는 필드가 아니다. 반드시 `question`과 `answer`를 근거로 추론해서 작성하라.

최종 질문에는 `[선호 A]`, `[제약 B]` 같은 placeholder를 남기지 말고, 실제 파생값으로 치환하라.

사용할 구조:

```text
사전 질문 [question_number 목록]에서 사용자는 [preference_summary]를 선택했습니다.
다만 같은 카테고리의 [question_number 목록]에서는 [constraint_summary]도 함께 드러났습니다.

[missing_threshold]를 CFO 관점의 수치 또는 조건으로 확인하는 질문을 생성하라.
```

예시:

입력:

```json
{
  "투자 의사결정 기준": {
    "question_1": {
      "question": "[투자 의사결정 기준] 신규 투자안을 검토할 때 CFO가 가장 중요하게 수행해야 할 역할은 무엇입니까?",
      "answer": "불확실성을 감수하더라도 미래 성장 기회를 지원하는 역할"
    },
    "question_3": {
      "question": "[투자 의사결정 기준] 경영진의 기대가 큰 투자라도 중단하거나 전면 재검토해야 한다고 판단하는 상황은 무엇입니까?",
      "answer": "사업 성장은 이어지고 있지만 기존 핵심 사업의 자금과 인력을 지속적으로 잠식하는 경우"
    }
  }
}
```

파생값:

```text
category_name: 투자 의사결정 기준
question_number: Q1, Q3
preference_summary: 불확실성이 있어도 미래 성장 기회를 지원하려는 성향
constraint_summary: 기존 핵심 사업의 자금과 인력이 지속적으로 잠식되면 재검토해야 한다는 방어선
missing_threshold: 성장 투자가 핵심 사업을 침범한다고 판단하는 손실 또는 자원 사용 한도
```

생성 질문:

```text
사전 질문 Q1에서는 불확실성이 있어도 미래 성장 기회를 지원하는 역할을 선택했고, Q3에서는 기존 핵심 사업의 자금과 인력이 지속적으로 잠식되면 투자를 재검토해야 한다고 답했습니다.

연 매출 10억, 영업이익 2억 규모의 회사라면, 신규 시장 진입 투자에서 어느 수준의 연간 손실부터 투자를 축소하거나 중단하시겠습니까?

A. 영업이익의 10% 이내까지만 허용하며, 핵심 수익성 보호를 우선한다.
B. 영업이익의 25% 이내까지 허용하되, 고객 검증 신호가 개선되어야 한다.
C. 영업이익의 50% 이내까지 허용하며, 카테고리 선점 가능성이 높으면 감수한다.
D. 외부 조달 가능성이 열려 있고 속도가 중요하다면 영업이익을 초과한 손실도 감수한다.
F. 기타 - 직접 입력
```

## 10. 감지할 Anti-Patterns

다음 징후가 보이면 비난하지 말고 경계선을 묻는 질문으로 전환하라.

- 명확한 kill criteria 없이 성장 투자를 계속 확대함
- 회계상 이익을 현금 건강성으로 착각함
- 운전자본 스트레스를 과소평가함
- 차환 리스크나 covenant 리스크를 과소평가함
- sunk cost 때문에 투자를 계속함
- 단기 margin 개선을 위해 전략 역량을 훼손함
- 재무 책임성을 피하기 위해 모호한 전략 가치를 반복함
- 이사회 보고에서 불확실성을 과도하게 확신처럼 표현함
