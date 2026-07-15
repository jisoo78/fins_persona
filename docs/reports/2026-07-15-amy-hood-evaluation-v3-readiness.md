# Amy Hood Evaluation v3 준비도 보고서

- 작성일: 2026-07-15
- 작업 브랜치: `codex/amy-hood-decision-advisor`
- 대상: Amy Hood Decision Advisor Evaluation v3 PoC
- 판정: **벤치마크 인프라 구현 완료 / 실제 Gemma 실험은 데이터 게이트 대기**

## 1. 구현 결과

Evaluation v3는 기존 Evaluation v2와 별도 경로로 구현됐다.

| 항목 | 구현 상태 | 검증 결과 |
| --- | --- | --- |
| 30개 4지선다형 문항 | 완료 | D10/H10/C6/T4 및 정확한 ID 순서 검증 |
| 고난도 함정 메타데이터 | 완료 | 오답마다 함정 의도와 메커니즘 검증 |
| 봉인된 정답 키 | 완료 | 모델 입력 경계가 정답·함정 필드를 거부 |
| 4대 역사적 홀드아웃 | 완료 | 후보·사건·자료·증거·별칭·원문 참조 차단 |
| 네 실험군 | 완료 | `generic_cfo`, `amy_prompt`, `amy_policy_rag`, `amy_full_rag` |
| 1회/5회 반복 | 완료 | 4개/20개 실행, 120/600 모의 모델 호출 검증 |
| 원자적 저장과 재개 | 완료 | 완료 답변 보존, 최초 실패 문항부터 재개 |
| 정량 리포트 | 완료 | D/H/C/T, 네 리프트, 반복 통계, 일치도, 비용·지연 진단 |
| 변별력 거부 기준 | 완료 | 첫 완료 `generic_cfo`가 80% 초과 시 `benchmarkRejected` |
| v3 API | 완료 | `/api/evaluation/v3/*`로 v2와 격리 |
| v2/v3 Web UI | 완료 | 새 세션 기본 v3, 화면별 v2 전환 유지 |

## 2. 홀드아웃 통제

봉인된 사건은 GitHub 인수 2018, AI 데이터센터 투자 2025, Microsoft 365 가격 인상 2021, 자사주 매입 승인 2021이다.

GitHub 인수는 이전 저장소 작업에서 노출된 적이 있으므로 `known_prior_exposure`로 명시했다. 깨끗한 미노출 홀드아웃으로 과장하지 않는다. 봉인 매니페스트는 Main Prompt, 정책 빌드, 메모리 릴리스, 런타임 인덱스에서 해당 참조를 fail-closed 방식으로 차단한다. 실제 페르소나 생성 통합 테스트에서도 홀드아웃 source ID가 발견되면 Main Prompt 모델 호출과 파일 쓰기 전에 중단됐다.

## 3. 정량 검증 결과

2026-07-15 최종 통합 명령의 실제 결과다.

| 명령 | 통과 | 실패 | 판정 |
| --- | ---: | ---: | --- |
| `npm run evaluation:v3:test` | 42 | 0 | PASS |
| `npm run evaluation:test` | 68 | 0 | PASS |
| `npm run persona:test` | 16 | 0 | PASS |
| 합계 | **126** | **0** | **PASS** |
| `npm run lint` | TypeScript 오류 0 | - | PASS |
| `npm run build` | Vite production build 성공 | - | PASS |
| `git diff --check` | 공백 오류 0 | - | PASS |

5회 반복 테스트는 모의 Gemma 클라이언트에 정확히 600회 호출하고, 반복-실험군 순서와 20개 고유 실행 ID를 확인했다. 이는 실행기의 제어 흐름 검증이며 실제 Gemma 품질 점수는 아니다.

프로덕션 빌드에는 500 kB 이상 청크 경고가 남아 있지만 빌드는 성공했다. 이 경고는 Evaluation v3 기능 정확성의 차단 조건은 아니며 이후 코드 분할 최적화 대상으로 분리한다.

## 4. API smoke test

모델 토큰을 소비하지 않도록 로컬 API를 임시 포트 `4057`에서 실행하고 다음 두 요청만 확인했다.

### 질문 및 준비도 조회

`GET /api/evaluation/v3/questions`

```json
{
  "ok": true,
  "questionCount": 30,
  "reviewCount": 30,
  "readiness": {
    "allApproved": false,
    "structuredMemoryAvailable": false
  }
}
```

### 잘못된 반복 수 차단

`POST /api/evaluation/v3/experiments`

```json
{
  "provider": "local",
  "repetitions": 2
}
```

결과는 HTTP `400`과 다음 메시지였다.

```text
evaluation v3 repetitions must be 1 or 5
```

실제 Gemma 실험 요청은 전송하지 않았다.

## 5. 현재 실행 게이트

현재 `readiness`는 다음 두 이유로 닫혀 있다.

1. 신규 v3 검토 기록 30개가 아직 모두 `approved`가 아니다.
2. 정책, 성찰, 사건 및 검토된 반례를 포함하는 활성 구조화 메모리 릴리스가 없다.

이는 구현 실패가 아니라 실험 조건을 보호하는 정상 상태다. 특히 구조화 메모리가 없는 상태에서 `amy_policy_rag`와 `amy_full_rag`를 실행하면 두 조건의 차이가 사라져 리프트 해석이 무효가 된다.

## 6. 실제 모델 평가 전 남은 작업

1. Web UI에서 30문항의 정답과 함정 의도·메커니즘을 검토하고 모두 승인한다.
2. 홀드아웃을 제외한 승인 사건으로 최소 2개 교차 사건 성찰을 만든다.
3. 최소 1개 승인 가능한 조건부 판단 정책을 만든다.
4. 정책·성찰·사건·반례 계층을 가진 불변 메모리 릴리스를 생성하고 활성화한다.
5. 얇은 Amy Main Prompt에 홀드아웃 참조가 없는지 다시 검사한다.
6. `1회 빠른 실험` 120호출을 먼저 실행한다.
7. 일반 CFO가 80%를 넘으면 모델 성능을 해석하지 않고 문항 판별력을 재수정한다.
8. 1회 결과가 유효할 때만 `5회 정식 실험` 600호출로 절제(ablation) 결과의 반복 안정성을 확인한다.

## 7. 최종 판단

Evaluation v3의 코드, 데이터 계약, 안전 경계, 실행기, API, UI와 정량 리포트는 PoC 실험을 수행할 수 있는 수준으로 구현됐다. 기존 v2 회귀도 모두 통과했다.

그러나 **Amy Hood Decision Advisor의 품질 평가는 아직 수행되지 않았다.** 현재 확인된 것은 “평가 장치가 올바르게 동작한다”는 사실이다. “Amy Hood의 판단을 정교하게 재현한다”는 주장은 구조화 메모리 릴리스 생성, 30문항 승인, 실제 Gemma 1회 및 5회 실험 이후에만 정량적으로 판단할 수 있다.
