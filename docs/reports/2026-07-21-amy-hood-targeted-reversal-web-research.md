# Amy Hood 반대 사건 표적 웹 조사 보고서

- 조사일: 2026-07-21
- 목적: 이미 확보된 지지 사례를 반복 수집하지 않고, 정책의 중단·반전 경계를 설명할 수 있는 부족 영역만 보강
- 데이터 파일: `data/b-track/amy-hood/advisor/imports/amy-hood-targeted-reversal-web-inventory.json`

## 1. 조사 범위

현재 승인 정책에는 `contrastingEventIds`가 없으므로, 다음 세 영역을 우선 조사했다.

1. `ai_cloud_capex`: 대규모 AI 인프라 확대를 실제로 늦추거나 보류한 사건
2. `cost_efficiency`: 비용 절감보다 성장 투자를 우선해 인력·운영비를 다시 늘린 사건
3. `shareholder_return_risk`: 자사주 매입보다 내부 투자·유동성을 우선한 사건

M&A와 가격·수익화는 기존 인벤토리에 Nokia 감액·구조조정과 Teams 분리·가격 조정 후보가 남아 있어 이번 검색에서 제외했다.

## 2. 승인 기준

정식 대조 사건은 다음 두 조건을 모두 만족해야 한다.

- 사건 시점의 실제 행동이 Microsoft 공식 자료 또는 공시로 확인될 것
- Amy Hood가 해당 사건 또는 동일 판단 축의 조건을 직접 설명했을 것

후대의 정책 설명이나 다른 Microsoft 임원의 발언만 있는 경우에는 후보를 보존하되 `provisional`로 분류했다.

## 3. 조사 결과

| 영역 | 후보 | 판정 | 즉시 정책·성찰 사용 |
|---|---|---:|---:|
| 비용 효율 | FY22 고성장 영역 재투자와 12% 이상 인력 증가 계획 | `qualified` | 가능 |
| AI·클라우드 CapEx | 2025년 일부 초기 데이터센터 프로젝트 보류·감속 | `provisional` | 보류 |
| 주주환원 | FY23 자사주 매입 집행 감소 | `provisional` | 보류 |

### 3.1 비용 효율: 절감보다 선택적 재투자

FY21 Q4 실적 발표에서 Amy Hood는 운영비 판단의 핵심을 총액이 아니라 고성장·차별화 영역에 배치되는지로 설명했고, FY22 인력 증가율이 12%를 넘을 것이라고 밝혔다. FY2022 10-K는 연구개발비가 18% 증가했고 그 원인에 클라우드 엔지니어링 투자가 포함됐음을 확인한다.

이 사건은 다음 조건부 정책을 지지한다.

> 비용 규율은 일률적 삭감이 아니다. 고객이 중요하게 여기는 차별성과 고성장 기회가 검증되면 절감분을 다시 투입하되, 배치와 실행 성과로 통제한다.

Amy Hood의 동시점 직접 발언과 실제 다음 연도 집행이 연결되므로, 세 후보 중 유일하게 즉시 대조형 Reflection 생성에 사용할 수 있다.

### 3.2 AI·클라우드 CapEx: 전체 철회가 아닌 선택적 보류

Microsoft Cloud Operations 책임자 Noelle Walsh는 2025년 일부 초기 단계 데이터센터 프로젝트를 늦추거나 보류한다고 밝혔다. AP는 Ohio의 10억 달러 계획을 포함한 보류를 독립적으로 확인했다. Amy Hood는 그보다 앞선 FY24 Q4 실적 발표에서 CapEx가 수요 신호와 채택에 따라 연중 조정된다는 원칙을 설명했다.

이는 `용량 확대`와 `투자 철회`의 단순 양자택일이 아니라 다음과 같은 반전 패턴을 보여준다.

- 전체 전략과 핵심 용량 투자는 유지한다.
- 아직 매몰비용이 낮은 초기 단계·장기 자산부터 조정한다.
- 지역별 수요와 고객 채택에 맞춰 시점과 위치를 바꾼다.

다만 보류 사건을 Amy Hood가 직접 설명하지 않았으므로 정식 승인에는 사용할 수 없다.

### 3.3 주주환원: 배당은 약속, 자사주 매입은 유연 수단

FY2023 10-K에 따르면 Microsoft의 자사주 매입액은 FY2022 280억 달러에서 FY2023 184억 달러로 줄었다. Amy Hood는 2025년 주주총회에서 자본배분 우선순위를 내부 장기 성장 투자, 배당, 기회적 자사주 매입 순으로 설명했다.

이 조합은 자사주 매입이 고정 의무가 아니라 조정 가능한 수단이라는 정책 가설을 강하게 지지한다. 그러나 2025년의 일반 정책 설명을 FY2023 집행 감소의 직접 원인으로 소급해서는 안 된다. 당시 Amy Hood가 매입 감속의 이유를 직접 설명한 자료를 추가로 찾아야 한다.

## 4. 데이터 적용 판단

이번 결과를 기존 정식 레지스트리에 자동 병합하지 않았다. 권장 적용 순서는 다음과 같다.

1. 비용 효율 후보 1건만 검토 승인 후 실제 대조형 Reflection으로 생성한다.
2. AI CapEx 후보는 Amy Hood의 사건별 직접 설명이 발견될 때까지 검색 보조 데이터로만 유지한다.
3. 주주환원 후보는 FY2022~FY2024 실적 발표·컨퍼런스 발언에서 자사주 매입 속도와 투자 우선순위를 연결한 동시점 발언을 추가 탐색한다.
4. 두 provisional 후보를 평가 정답의 단독 근거로 사용하지 않는다.

## 5. 결론

기존 자료가 완전히 고갈된 것은 아니다. 표적 검색으로 세 영역 모두 실제 반대 행동 후보를 확보했고, 그중 비용 효율 영역 1건은 정식 대조 데이터로 승격 가능한 수준이다. 나머지 두 건은 행동 자체는 명확하지만 Amy Hood의 사건별 인과 설명이 부족하다. 따라서 현재 가장 빠르고 정직한 개선은 **qualified 1건을 먼저 정책 v3에 반영하고, provisional 2건은 직접 발언을 찾는 좁은 후속 조사 큐로 유지하는 것**이다.

## 6. 주요 출처

- Microsoft FY21 Q4 Earnings Transcript: <https://news.microsoft.com/wp-content/uploads/prod/2021/07/TranscriptFY21Q4.pdf>
- Microsoft FY2022 Form 10-K: <https://www.sec.gov/Archives/edgar/data/789019/000156459022026876/msft-10k_20220630.htm>
- Microsoft FY24 Q4 Earnings Call: <https://www.microsoft.com/en-us/Investor/events/FY-2024/earnings-fy-2024-q4.aspx>
- Noelle Walsh statement repost: <https://www.linkedin.com/posts/jamesthorn_noelle-has-stated-this-better-than-i-ever-activity-7315549305656823808-0Fe0>
- AP data-center pacing report: <https://apnews.com/article/4d987fe8446fc9e6cda31d919f938911>
- Microsoft FY2023 Form 10-K: <https://www.sec.gov/Archives/edgar/data/789019/000095017023035122/msft-20230630.htm>
- Microsoft 2025 Annual Shareholder Meeting: <https://www.microsoft.com/en-us/investor/events/fy-2026/2025-annual-shareholder-meeting>
