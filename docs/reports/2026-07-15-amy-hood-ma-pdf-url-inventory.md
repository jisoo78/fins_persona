# Amy Hood M&A PDF URL inventory review

## 결과

PDF 14페이지의 본문과 hyperlink annotation을 전수 확인해 canonical URL 31개를 정리했다. 현재 advisor 데이터와 exact canonical URL로 비교한 결과는 **기존 4개, 신규 27개**다.

- 입력 PDF: `data/에이후드_URL.pdf`
- JSON 인벤토리: `data/b-track/amy-hood/advisor/imports/amy-hood-ma-pdf-url-inventory.json`
- 비교 파일: `event-candidates.json`, `source-registry.json`
- 사건별 수: Nokia 5, Mojang 5, LinkedIn 5, GitHub 5, Nuance 5, Activision Blizzard 6
- 접근 점검: accessible 24, blocked_by_automation 5, unavailable 2

접근 상태는 2026-07-15 재검증 결과다. Microsoft와 SEC에는 각각의 수집 정책에 맞는 User-Agent를 사용했다. HTTP 401/403은 `blocked_by_automation`, StockAnalysis의 HTTP 400은 `unavailable`로 분리했으며 URL은 삭제하거나 대체하지 않았다.

- PDF SHA-256: `36075a25483044b01407e358a86f29af3e4530335fe21ad5c621c58df18becd3`
- 직접 발언의 `verified`는 PDF 조사 결과를 보존한 discovery claim이다. 원문 artifact와 Amy Hood speaker segment가 검증되기 전까지 registry association은 `unreviewed`로 유지한다.

## 추출 및 canonicalization

1. PDF hyperlink annotation의 실제 `/URI`를 우선 추출했다.
2. 렌더링한 14페이지 전체에서 링크의 사건과 문맥을 대조했다.
3. 화면에서 줄바꿈된 표시 URL은 canonical URL 생성에 사용하지 않았다.
4. scheme과 hostname을 소문자화하고 HTTPS를 사용했다.
5. fragment와 `utm_*` 추적 파라미터를 제거하고 의미 있는 query parameter는 보존하도록 했다. 이번 결과에는 보존할 의미 있는 query parameter가 없었다.
6. 동일 canonical URL의 annotation 원문과 페이지 번호를 합쳤다.
7. WIRED slash/non-slash annotation 2개는 trailing slash가 있는 canonical URL 1개로 합쳤다.

## 기존 URL 4개

| 사건 | canonical URL |
|---|---|
| Nokia | `https://news.microsoft.com/source/2013/09/03/microsoft-to-acquire-nokias-devices-services-business-license-nokias-patents-and-mapping-services/` |
| LinkedIn | `https://news.microsoft.com/source/2016/06/13/microsoft-to-acquire-linkedin/` |
| GitHub | `https://news.microsoft.com/source/2018/06/04/microsoft-to-acquire-github-for-7-5-billion/` |
| Activision Blizzard | `https://news.microsoft.com/source/2022/01/18/microsoft-to-acquire-activision-blizzard-to-bring-the-joy-and-community-of-gaming-to-everyone-across-every-device/` |

Mojang의 PDF 영문 URL은 현재 advisor 파일의 스페인어 URL과 달라 신규다. Nuance의 PDF annotation에는 현재 advisor 파일의 Microsoft Source URL이 없어 PDF에서 추출된 Nuance 5개는 모두 신규다.

## 직접 증거 상태

| 사건 | direct source | 상태 |
|---|---|---|
| Nokia | Microsoft conference-call event page | `missing` - 역할은 `contemporaneous_context`, 검토 상태는 `review_required` |
| Mojang | 없음 | 해당 URL 항목 없음 |
| LinkedIn | Microsoft official transcript | `verified` |
| GitHub | StockAnalysis transcript mirror | `review_required` |
| Nuance | StockAnalysis transcript mirror | `review_required` |
| Activision Blizzard | SEC-filed transaction transcript | `verified` |

PDF는 discovery inventory로만 사용했다. PDF 요약문이나 인용문은 JSON에 증거 원문으로 복사하지 않았다. 상태 필드는 PDF가 제시한 분류를 보존한 것이며 인벤토리가 원문 증거 저장소를 대체하지 않는다.

## 검토 주의사항

- `post_outcome` 자료는 사후 결과 확인용이며 당시 판단 근거로 역투영하면 안 된다.
- 발표 뒤 제출된 SEC proxy는 내용 역할을 `contemporaneous_context`, 문서 공개 시점을 `temporalRelation: post_outcome`, 복원 대상 기간을 `describedEvidencePeriod: pre_decision`으로 분리했다.
- Activision Blizzard preliminary proxy는 annotation에 있지만 본문에서 별도 자료로 설명되지 않아 definitive proxy와 함께 검토하도록 note를 남겼다.
- 최초 인벤토리 생성 뒤 annotation 순서에 의존한 메타데이터 결합 오류를 발견했다. URL을 키로 다시 대조해 Nokia 3건, Nuance 2건, Activision Blizzard 3건 등 총 8건의 미검토 메타데이터를 교정했다.
- 이후 `source-registry.json`과 `event-candidates.json`에 자동 병합했다. 검토 완료 association 4건은 보존하고, PDF discovery 항목은 locator가 없는 `unreviewed` 상태로만 추가했다.

## 검증 항목

- canonical URL 수 31
- 기존/신규 4/27
- 모든 항목에 사건, evidence role, page number 포함
- canonical URL에 `utm_*` 또는 fragment 없음
- canonical URL 중복 없음
- JSON 파싱
- 자동 병합 1차: candidate association 8건 교정, registry source 8건 교정, reviewed association 4건 보존
- 자동 병합 2차: 추가 0건, 교정 0건으로 멱등성 확인
- `git diff --check`
