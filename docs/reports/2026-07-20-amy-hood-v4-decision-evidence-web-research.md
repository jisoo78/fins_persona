# Amy Hood v4 의사결정 증거 웹 리서치

- 조사일: 2026-07-20T18:00:49+09:00
- 조사 대상: 10개
- 판정: **qualified 2 / partial 8 / not_found 0**
- 적격 사건: `candidate-nuance-acquisition-2021`, `candidate-buyback-2013`
- 주의: 요청된 macOS 작업 경로와 `evaluation/v3/sealed/holdout-manifest.json`은 현재 실행 환경에 마운트되어 있지 않았다. 따라서 홀드아웃 충돌을 검증할 수 없어 대체 사건은 제안하지 않았다.

## 1. 사건별 적격 여부

| candidateId | 영역 | 결정일 | 판정 | Amy 직접 증거 | 지원 자료 |
|---|---|---:|---|---:|---:|
| `candidate-nuance-acquisition-2021` | m_and_a | 2021-04-12 | **qualified** | 1 | 2 |
| `candidate-m365-price-2021` | pricing_monetization | 2021-08-19 | **partial** | 0 | 1 |
| `candidate-copilot-price-2023` | pricing_monetization | 2023-07-18 | **partial** | 0 | 1 |
| `candidate-teams-unbundle-2023` | pricing_monetization | 2023-08-31 | **partial** | 0 | 2 |
| `candidate-workforce-reset-2023` | cost_efficiency | 2023-01-18 | **partial** | 0 | 2 |
| `candidate-phone-restructure-2015` | cost_efficiency | 2015-07-08 | **partial** | 0 | 2 |
| `candidate-transformation-2026` | cost_efficiency | 2026-07-06 | **partial** | 0 | 2 |
| `candidate-buyback-2013` | shareholder_return_risk | 2013-09-17 | **qualified** | 1 | 0 |
| `candidate-buyback-2021` | shareholder_return_risk | 2021-09-14 | **partial** | 0 | 1 |
| `candidate-buyback-2024` | shareholder_return_risk | 2024-09-16 | **partial** | 0 | 2 |

판정 원칙은 보수적으로 적용했다. 공식 결정 문서가 있어도 결정일 이전 또는 당일의 사건특정 Amy Hood 직접 발언이 없으면 `qualified`가 아니라 `partial`로 분류했다.

## 2. 적격 직접 증거

### candidate-nuance-acquisition-2021 — qualified

- 직접 원문: [Acquisition call transcript](https://earningscalls.dev/transcripts/microsoft-corporation_msft_earnings_call_transcript_2021-04-12)
- 공식 거래 발표: [Microsoft Source](https://news.microsoft.com/source/2021/04/12/microsoft-accelerates-industry-cloud-strategy-for-healthcare-with-the-acquisition-of-nuance/)
- SEC: [Microsoft Form 8-K](https://www.sec.gov/Archives/edgar/data/789019/000119312521112687/d171120d8k.htm)
- Amy Hood 발언 핵심 원문: “TAM-expansive opportunities in high-growth markets”
- 추출 가능한 판단 기준:
  - TAM을 확장하는 고성장 시장인가
  - Microsoft가 사용자·생태계에 고유한 가치를 더할 수 있는가
  - 거래 가격이 장기 주주가치를 지지하는가
  - FY22 희석 1% 미만, FY23 증가 기여라는 재무 경계가 지켜지는가
  - 인수 후 Nuance 매출과 Azure·Teams·Dynamics 365 채택이 가속되는가
- 선택: 주당 56달러, 순부채 포함 197억 달러 전액 현금 인수
- 대안: 기존 제휴 유지·유기적 확장이 비교 가능한 대안이지만 공식 기각안은 공개되지 않았다.
- 접근성: 전체 화자 구분 HTML 전사 다운로드 가능. Microsoft 공식 webcast 별칭은 현재 전사 원문을 제공하지 않아 inaccessible로 기록했다.

### candidate-buyback-2013 — qualified

- 직접 원문: [Microsoft Source announcement](https://news.microsoft.com/source/2013/09/17/microsoft-announces-quarterly-dividend-increase-and-share-repurchase-program-3/)
- Amy Hood 직접 발언: “These actions reflect a continued commitment to returning cash to our shareholders.”
- 추출 가능한 판단 기준:
  - 배당과 자사주 매입을 일회성 조치가 아니라 지속적 현금 환원 정책으로 본다.
  - 만료 예정 프로그램을 끊지 않고 새 400억 달러 한도로 교체한다.
  - 주주환원 확대와 현금 유연성·성장 투자 사이의 기회비용을 관리해야 한다.
- 선택: 최대 400억 달러 신규 프로그램과 분기 배당 22% 인상
- 대안: 기존 프로그램을 만료시키고 갱신하지 않는 선택
- 날짜 주의: 공식 발표일은 2013-09-17이고 후속 연차보고서는 이사회 승인일을 2013-09-16으로 기록한다.

## 3. partial 사건별 결과

### candidate-m365-price-2021

- 공식 원문: [New pricing for Microsoft 365](https://www.microsoft.com/en-us/microsoft-365/blog/2021/08/19/new-pricing-for-microsoft-365/)
- 확인된 선택: 2022-03-01부터 상업용 SKU를 월 1~3달러 인상
- 판단 문맥: 10년간 통신·협업, 보안·컴플라이언스, AI·자동화 가치가 누적됐다는 논리
- 결손: 발표 저자는 Jared Spataro이며 Amy Hood의 사건특정 직접 발언이 없다. 가격 탄력성, 이탈 허용치, SKU별 산식도 공개되지 않았다.

### candidate-copilot-price-2023

- 공식 원문: [Microsoft 365 Copilot pricing announcement](https://www.microsoft.com/en-us/microsoft-365/blog/2023/07/18/introducing-bing-chat-enterprise-microsoft-365-copilot-pricing-and-microsoft-sales-copilot/)
- 사전 정책 원문: [AI discussion with Amy Hood and Kevin Scott](https://www.microsoft.com/en-us/investor/events/fy-2023/ai-discussion-with-amy-hood-evp-and-cfo-and-kevin-scott-evp-of-ai-and-cto)
- 확인된 선택: 사용자당 월 30달러
- Amy 정책 신호: AI를 기술·플랫폼·비즈니스 모델 혁신의 결합으로 본다.
- 결손: 30달러라는 숫자, 대안 가격, 인프라 비용·채택률 경계를 Amy Hood가 직접 설명하지 않았다.
- 사후 격리: [FY23 Q4 earnings call](https://www.microsoft.com/en-us/investor/events/fy-2023/earnings-fy-2023-q4)은 가격 발표 7일 후 자료이므로 직접 근거에서 제외했다.

### candidate-teams-unbundle-2023

- 공식 원문: [Microsoft EU Policy Blog](https://blogs.microsoft.com/eupolicy/2023/08/31/european-competition-teams-office-microsoft-365/)
- 규제 배경: [European Commission opening of proceedings](https://ec.europa.eu/competition/antitrust/cases1/202330/AT_40721_9314556_2360_3.pdf)
- 확인된 선택: EEA·스위스에서 Teams 없는 제품군을 월 2유로 낮게 판매하고 Teams 단품을 월 5유로에 판매
- 결손: 공식 발표 화자는 Nanna-Louise Linde이며 Amy Hood 직접 발언이 없다. 내부 가격 산식과 조사 대응 대안 비교가 공개되지 않았다.

### candidate-workforce-reset-2023

- 공식 원문: [Satya Nadella employee memo](https://blogs.microsoft.com/blog/2023/01/18/subject-focusing-on-our-short-and-long-term-opportunity/)
- SEC: [Form 8-K](https://www.sec.gov/Archives/edgar/data/789019/000119312523009934/d447690d8k.htm)
- 확인된 선택: 1만 명 감원, 하드웨어 포트폴리오 변경, 임대 사무실 통합, 약 12억 달러 비용
- 판단 문맥: 매출과 고객 수요에 비용 구조를 맞추되 AI·세속적 성장 분야에는 계속 투자
- 사후 격리: [FY23 Q2 earnings call](https://www.microsoft.com/en-us/investor/events/fy-2023/earnings-fy-2023-q2)의 Amy Hood 설명은 결정 6일 뒤이므로 직접 근거에서 제외했다.
- 결손: 결정 당시 부문별 감축 기준과 대안별 비용 비교를 Amy Hood가 설명한 사전 원문이 없다.

### candidate-phone-restructure-2015

- 공식 원문: [Phone Hardware restructuring announcement](https://news.microsoft.com/source/2015/07/08/microsoft-announces-restructuring-of-phone-hardware-business/)
- SEC: [Form 8-K](https://www.sec.gov/Archives/edgar/data/789019/000119312515247530/d54167d8k.htm)
- 확인된 선택: 최대 7,800명 감원, 약 76억 달러 손상차손, 7.5억~8.5억 달러 구조조정 비용
- 조건: 판매량·매출 목표 미달, 낮은 마진 제품 조합, 경쟁 환경과 회사 우선순위 변화
- 결손: 결정일 이전·당일 Amy Hood 직접 발언이 없다. 공식 인용 화자는 Satya Nadella다.
- 사후 격리: 2015년 10-K의 상세 손상 판단은 결정 후 문서로 분리했다.

### candidate-transformation-2026

- 공식 Xbox 원문: [Resetting XBOX](https://news.xbox.com/en-us/2026/07/06/resetting-xbox/)
- 전사 규모 보조 자료: [Reuters](https://www.reuters.com/business/world-at-work/microsoft-joins-ai-driven-tech-layoff-wave-with-4800-job-cuts-2026-07-06/)
- 확인된 선택: 전사 약 4,800개 역할 감축, Xbox 약 3,200개(FY27) 및 당일 약 1,600개, 스튜디오 분리·매각
- 조건: Xbox의 낮은 마진, Game Pass·멀티플랫폼·콘텐츠 투자의 기대 이하 성장, Commercial 고객 배포 모델 변화
- 결손: Chief People Officer **Amy Coleman**의 발언은 CFO **Amy Hood**의 발언이 아니므로 제외했다. 전사 공지 원문 전체와 Amy Hood 직접 설명을 찾지 못했다.

### candidate-buyback-2021

- 공식 원문: [2021 repurchase announcement](https://news.microsoft.com/source/2021/09/14/microsoft-announces-quarterly-dividend-increase-and-new-share-repurchase-program-2/)
- 확인된 선택: 최대 600억 달러, 만료일 없음, 언제든 종료 가능, 배당 11% 인상
- 결손: Amy Hood는 주주총회 호스트로만 언급되고 판단 발언은 없다. 한도 산정, 주가 기준, 투자 대비 우선순위가 공개되지 않았다.
- 사후 격리: 2024 연차보고서의 잔여 한도와 실제 사용 내역은 학습 입력에서 제외했다.

### candidate-buyback-2024

- 공식 원문: [2024 repurchase announcement](https://news.microsoft.com/source/2024/09/16/microsoft-announces-quarterly-dividend-increase-and-new-share-repurchase-program-3/)
- 결정 직전 배경: [Microsoft 2024 Annual Report](https://www.microsoft.com/investor/reports/ar24/)
- 확인된 선택: 최대 600억 달러, 배당 10% 인상
- 조건: 기존 2021년 프로그램 잔여 한도가 2024-06-30 기준 103억 달러로 감소한 상태
- 결손: Amy Hood 직접 발언이 없고, AI 자본지출과 주주환원 사이의 최소 현금·수익률 경계가 공개되지 않았다.

## 4. 직접 자료와 지원 자료의 구분

- **직접 Amy 자료**: 화자가 Amy Hood로 구분되고, 원문 전체와 날짜가 확인되며, 사건의 행동 또는 판단 기준을 직접 설명한다.
- **지원 자료**: 거래 금액, 가격, 감원 규모, 규제 조건, 승인 절차 등 사건의 사실관계를 확인하지만 Amy Hood 발언은 아니다.
- **정책 자료**: Amy Hood의 일반 원칙은 포함하지만 특정 가격·구조조정·자사주 승인에 직접 연결되지 않는다.
- **사후 자료**: 결정 후 성과·설명·집행 내역으로 별도 배열에 격리했다.

## 5. 사후 자료 격리 결과

다음 유형을 `directAmyEvidence`에서 제외했다.

1. Copilot 가격 발표 7일 뒤의 FY23 Q4 가이던스
2. 2023년 감원 6일 뒤의 Amy Hood 비용 구조 설명
3. 2015 Phone Hardware 결정 후 10-K 손상검사 상세
4. 2013·2021 자사주 프로그램의 후속 연차보고서 실행 내역
5. Teams 사건 이후 EU의 예비 판단·후속 시정 절차

## 6. 대체 사건 추천

대체 사건 수는 **0개**다. 이유는 `evaluation/v3/sealed/holdout-manifest.json`이 현재 실행 환경에 존재하지 않아 `holdoutCollisionChecked: true`를 정직하게 보장할 수 없기 때문이다. 후보를 억지로 제시하면 사용자가 금지한 홀드아웃 충돌 가능성이 생기므로 보수적으로 제외했다.

## 7. 영역별 최종 직접 증거 커버리지

| 영역 | 대상 사건 | qualified | 직접 증거 커버리지 |
|---|---:|---:|---:|
| m_and_a | 1 | 1 | 100% |
| pricing_monetization | 3 | 0 | 0% |
| cost_efficiency | 3 | 0 | 0% |
| shareholder_return_risk | 3 | 1 | 33.3% |
| **합계** | **10** | **2** | **20%** |

## 8. 가장 중요한 데이터 결손

1. 가격 결정 3건 모두 Amy Hood의 사건특정 사전 발언이 없다. 제품 가치 설명은 있지만 가격 산식·탄력성·채택 경계가 공개되지 않았다.
2. 비용 구조조정 3건은 공식 조치 문서가 충분하지만 Amy Hood의 설명은 사후이거나 존재하지 않는다.
3. 2021·2024 자사주 승인 문서는 Amy Hood 이름을 행사 호스트로만 적고 자본배분 논리를 인용하지 않는다.
4. 홀드아웃 manifest 부재로 대체 사건 충돌 검증을 완료할 수 없다.
5. Nuance는 공식 webcast 원본 전사가 검색되지 않아 신뢰 가능한 전체 화자 전사본을 사용했다.

## 9. 후속 수집 우선순위

1. **가격**: 비공개 투자자 컨퍼런스의 공개 전사, Bernstein/Goldman/Credit Suisse 행사, Microsoft Investor Relations Q&A에서 가격·ARPU·E5/Copilot 수익화 질문을 집중 탐색
2. **비용**: 각 결정 직전 분기 어닝콜의 수요 신호·opex 가드레일과 결정 후 첫 콜을 짝지어, 사전 원칙과 사후 사건 설명을 분리 저장
3. **주주환원**: 연례 주주총회 Q&A에서 재투자·배당·매입 우선순위를 묻는 질문을 수집하되 사건특정 여부를 별도 판정
4. **홀드아웃 확인**: manifest가 접근 가능한 환경에서 대체 후보를 다시 생성하고 충돌 검증
5. **Nuance 원본**: Microsoft IR의 당시 webcast/슬라이드 아카이브 또는 Web Archive에서 공식 화자 전사 원본 복구

## 10. 파일·저장소 작업 범위

- 현재 환경에서 요청된 `/Users/hestory/Desktop/fins_persona/.worktrees/main-policy-design`은 접근할 수 없었다.
- 따라서 기존 registry, event card, policy-memory, 코드 파일은 열거나 수정하지 않았다.
- Git staging, commit, push는 수행하지 않았다.
- 산출물은 현재 실행 환경의 별도 `/mnt/data/main-policy-design` 트리에만 생성했다.
