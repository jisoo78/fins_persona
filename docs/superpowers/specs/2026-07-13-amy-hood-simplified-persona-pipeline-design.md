# Amy Hood 페르소나 단순화 파이프라인 설계

## 1. 목적

Amy Hood의 공개자료를 로컬에 저장하고 LLM으로 분석해, PoC에서 바로 사용할 수 있는 `Main Master Prompt`를 생성한다.

이 설계는 기존 Phase 1의 제품 범위와 Phase 2의 Source Inventory를 유지한다. 다만 이후 작업은 Evidence, Decision Case, Decision Principle을 각각 별도 Phase와 산출물로 만들지 않고 다음 세 단계로 단순화한다.

1. 공개자료 수집
2. LLM 분석과 시스템 프롬프트 생성
3. 홀드아웃 평가

기존 Phase 3~5 문서는 참고자료로 남기되, 신규 구현은 이 문서를 기준으로 한다.

## 2. 입력 범위

Phase 2의 `data/b-track/amy-hood/source-inventory.json`을 입력 목록으로 사용한다.

- `selected` 18개만 수집과 분석에 사용한다.
- FY2017 Q1부터 FY2019 Q4까지의 어닝콜 12개는 `holdout`으로 유지한다.
- `holdout`은 자료 분석, Main Master Prompt 생성, RAG 색인에 사용하지 않는다.
- 현재 로컬에 있는 어닝콜과 인수 인터뷰 데이터는 다시 내려받지 않고 재사용한다.
- URL만 등록된 인터뷰, 발표, 대담과 게시물은 전체 원문을 로컬에 저장한다.

첫 PoC가 끝나기 전에는 selected 범위를 임의로 확대하지 않는다.

## 3. 전체 흐름

```text
source-inventory.json의 selected 18개
    -> 원문 로컬 저장 및 무결성 기록
    -> 문서 구조 우선 chunk 생성
    -> 모델별 chunk 분석
    -> 자료별 분석 병합
    -> 모델별 Main Master Prompt 생성
    -> 동일 홀드아웃 평가
```

사용자에게 보이는 핵심 산출물은 자료별 분석 결과와 최종 시스템 프롬프트다. Chunk 파일은 재실행과 디버깅을 위한 내부 캐시로만 취급한다.

## 4. 원문 저장

원문은 `data/b-track/amy-hood/raw-sources/` 아래에 `source_id` 기준으로 저장한다.

각 자료에는 다음 정보가 있어야 한다.

- `source_id`
- 원본 URL 또는 기존 로컬 경로
- 수집 시각
- 원문 SHA-256
- 원문 형식
- 수집 성공 여부

웹 페이지의 메뉴나 탐색 문구가 아니라 실제 인터뷰, 대담, 발표, 게시물 또는 transcript 본문만 저장한다. 원문을 확보하지 못한 자료는 내용을 추정해 채우지 않고 실패 상태로 남긴다.

## 5. Chunk 분할 전략

Gemma 4 로컬 모델의 전체 컨텍스트 한도를 16,384 tokens로 본다. 모델 입력은 다음 예산을 사용한다.

| 용도 | 예산 |
|---|---:|
| 시스템 지시와 분석 스키마 | 약 2,000 tokens |
| 원문 chunk | 최대 10,000 tokens |
| 모델 출력 | 약 3,000 tokens |
| 안전 여유 | 약 1,384 tokens |

분할은 고정 길이보다 문서 구조를 먼저 따른다.

- 인터뷰: 질문과 답변 묶음
- 대담과 어닝콜: 화자 발언 묶음
- 발표와 게시물: 문단 또는 섹션
- 구조 단위가 10,000 tokens를 넘을 때만 토큰 기준으로 추가 분할
- 인접 chunk는 500~800 tokens를 겹치되, 같은 분석 결과는 병합 과정에서 중복 제거

Chunk 경계는 한 번만 만들고 Gemma 4와 GPT-5 mini에 동일하게 사용한다. 각 chunk는 `source_id`, 순번과 원문 해시로 결정적인 ID를 가져야 한다.

## 6. LLM 분석

각 chunk에서 다음 항목만 구조화된 JSON으로 추출한다.

- Amy Hood의 판단 기준
- 우선순위
- 트레이드오프
- 위험 신호와 불확실성 처리
- 말투와 설명 방식
- 적용 조건과 예외
- 분석을 뒷받침하는 짧은 원문 위치

Chunk 분석은 자료 단위로 병합한다. LLM이 원문에 없는 성격, 사적 가치관이나 개인의 단독 의사결정을 만들어내지 않도록 지시한다.

모델별 자료 분석 결과는 다음 파일에 저장한다.

- `data/b-track/amy-hood/source-analysis.gemma4.jsonl`
- `data/b-track/amy-hood/source-analysis.gpt5-mini.jsonl`

JSON 출력이 유효하지 않으면 같은 chunk를 한 번 다시 호출한다. 재시도 후에도 실패하면 해당 chunk만 실패로 기록하고 전체 실행 상태를 미완료로 둔다.

## 7. 모델 운영 방식

### 기본 모델: Gemma 4 로컬

파이프라인 개발과 정상 동작 검증은 Gemma 4를 기본값으로 수행한다.

- OpenAI 호환 로컬 endpoint를 사용한다.
- endpoint와 정확한 모델 이름은 `LOCAL_LLM_BASE_URL`, `LOCAL_LLM_MODEL`로 설정한다.
- 기본 컨텍스트 한도는 16,384 tokens다.
- 완료된 chunk 결과는 다시 호출하지 않고 이어서 실행한다.

### 비교 모델: OpenAI GPT-5 mini

유료 API는 명시적인 provider 옵션이 있을 때만 호출한다.

- 모델 ID: `gpt-5-mini`
- API 키: `OPENAI_API_KEY`
- 모델 설정: `OPENAI_MODEL=gpt-5-mini`
- Gemma 4 실패 시 GPT-5 mini로 자동 전환하지 않는다.
- Gemma 4의 분석 결과를 GPT-5 mini 입력으로 사용하지 않는다.

두 모델은 동일한 원문, chunk, 분석 프롬프트, 출력 스키마와 홀드아웃 문항을 사용한다.

## 8. GPT-5 mini 실행 게이트

다음 조건을 모두 통과한 뒤에만 GPT-5 mini를 실행한다.

1. selected 18개의 원문이 로컬에 저장되어 있다.
2. holdout 12개가 분석 입력에서 제외되어 있다.
3. 모든 chunk가 16,384 컨텍스트 예산을 지킨다.
4. Gemma 4가 모든 chunk에서 유효한 분석 JSON을 생성했다.
5. 자료별 분석 병합이 완료됐다.
6. `AMY_HOOD_PERSONA.gemma4.md`가 생성됐다.
7. 중단 후 재실행해도 완료된 chunk를 재호출하지 않고 이어서 처리한다.

게이트가 실패하면 유료 모델 실행을 명확한 오류로 중단한다. 자동 우회 옵션은 두지 않는다.

## 9. Main Master Prompt 생성

자료별 분석 결과 전체를 같은 provider의 모델로 한 번 통합해 최종 시스템 프롬프트를 만든다.

- Gemma 4 분석은 Gemma 4가 통합한다.
- GPT-5 mini 분석은 GPT-5 mini가 통합한다.
- 한 모델의 결과를 다른 모델의 프롬프트 생성에 섞지 않는다.

최종 산출물은 다음과 같다.

- `data/b-track/amy-hood/AMY_HOOD_PERSONA.gemma4.md`
- `data/b-track/amy-hood/AMY_HOOD_PERSONA.gpt5-mini.md`

프롬프트에는 Amy Hood 1인칭 역할, 반복되는 재무 판단 기준, 우선순위, 트레이드오프, 위험 처리, 조언 방식과 공개자료 밖 사실을 만들지 않는 규칙을 포함한다. UI에 상시 표시하는 비공식 시뮬레이션 고지는 답변마다 반복하도록 지시하지 않는다.

## 10. RAG와의 관계

Main Master Prompt 생성과 RAG 구축을 하나의 작업으로 묶지 않는다.

- Main Master Prompt는 안정적인 판단 방식과 말투를 담당한다.
- RAG는 구체적인 사건, 발언, 수치와 맥락을 질문별로 제공한다.
- 수집한 raw source와 결정적으로 생성한 chunk를 이후 RAG 입력으로 재사용한다.
- holdout 자료는 RAG에서도 제외한다.

PoC의 첫 완료 기준은 시스템 프롬프트 생성과 홀드아웃 비교이며, RAG 사용자 경로 교체는 그 다음 구현 범위다.

## 11. 실행 인터페이스

목표 명령은 다음과 같다.

```bash
# 기본 Gemma 4 실행
npm run persona:analyze

# 자료, chunk와 게이트 상태만 검사
npm run persona:check

# Gemma 4 검증 후 명시적으로 GPT-5 mini 실행
npm run persona:analyze -- --provider openai
```

실행 결과에는 provider, 모델 이름, 성공/실패 chunk 수, 처리 시간과 재사용한 캐시 수를 기록한다. API 비용은 OpenAI 응답에서 사용량을 얻을 수 있을 때만 기록하고 추정값을 만들지 않는다.

## 12. 오류 처리

- 원문 수집 실패: 해당 자료를 실패로 남기고 분석하지 않는다.
- holdout 혼입: 실행을 즉시 실패시킨다.
- 컨텍스트 초과: 모델을 호출하지 않고 chunk 분할 오류로 실패시킨다.
- JSON 파싱 실패: 한 번 재시도한 뒤 해당 chunk 실패로 남긴다.
- 실행 중단: 완료된 chunk 캐시를 유지하고 다음 실행에서 이어서 처리한다.
- GPT-5 mini 게이트 실패: API를 호출하지 않는다.

## 13. 테스트 전략

새 테스트 파일 상단에는 프로젝트 `AGENTS.md` 형식의 Test Plan을 둔다.

### Happy Path 1개

- selected 자료를 구조 단위로 나누고 Gemma 4 모의 응답을 병합해 자료 분석과 시스템 프롬프트를 생성한다.

### Edge Cases 정확히 3개

1. 10,000 tokens보다 짧은 자료는 불필요하게 분할하지 않는다.
2. 한도 근처의 질문·답변 또는 화자 발언은 가능한 한 같은 chunk에 보존한다.
3. 중단 후 재실행하면 완료된 chunk는 건너뛰고 실패하거나 미완료인 chunk만 처리한다.

### Failure Paths

- holdout 자료가 입력에 포함되면 모델 호출 전에 실패한다.
- 원문 수집 실패나 컨텍스트 초과가 있으면 불완전한 최종 프롬프트를 생성하지 않는다.
- 잘못된 JSON이 재시도 후에도 복구되지 않으면 실패 상태를 보존한다.
- Gemma 4 검증 게이트가 통과하지 않으면 GPT-5 mini를 호출하지 않는다.

## 14. PoC 완료 기준

- selected 18개 원문이 로컬에 재현 가능하게 저장된다.
- Gemma 4 기본 파이프라인이 중단과 재실행을 포함해 끝까지 동작한다.
- 두 모델이 동일 chunk와 동일 분석 계약을 사용한다.
- 모델별 자료 분석 JSONL과 Main Master Prompt가 분리되어 생성된다.
- GPT-5 mini는 명시적인 실행과 검증 게이트를 거쳐서만 호출된다.
- holdout 12개가 학습과 RAG 입력에서 제외된다.
- 두 프롬프트를 동일 홀드아웃 문항으로 비교할 수 있다.

## 15. 제외 범위

- Evidence, Decision Case, Decision Principle 별도 산출물
- 모든 공개자료를 처음부터 수집하는 작업
- 모델 자동 선택 또는 자동 유료 API fallback
- 기존 정적 Amy Hood RAG UI 교체
- 사용자 답변에 근거 출처 표시
- 프로덕션 수준의 비용 최적화와 분산 처리
