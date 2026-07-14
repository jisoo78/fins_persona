# Phase 7: 현재 앱에 B Track PoC 연결

## 목표

검증을 통과한 Amy Hood Persona를 현재 앱에서 선택하고 대화할 수 있게 한다. 이 단계에서 처음으로 실제 기능 구현을 시작한다.

## 구현 전 확인

다음 파일이 준비되지 않았다면 구현을 시작하지 않는다.

- `poc-scope.md`
- `source-inventory.json`
- `evidence.jsonl`
- `decision-cases.json`
- `decision-principles.json`
- `AMY_HOOD_PERSONA.md`
- `evaluation-set.json`
- `evaluation-report.md`

## 사용자 흐름

```text
Track 선택
  ├─ A Track: 40문항 인터뷰로 내 페르소나 생성
  └─ B Track: 공개 인물 페르소나 선택
                    ↓
             Amy Hood 선택
                    ↓
        공개자료 기반 시뮬레이션 고지
                    ↓
             CFO 의사결정 대화
                    ↓
          답변 근거와 확신 수준 확인
```

## To-Do List

- [ ] A Track과 B Track을 선택하는 화면을 설계한다.
- [ ] B Track의 인물 카드에 이름, 역할, 데이터 기준일을 표시한다.
- [ ] Amy Hood Persona가 공식 대리인이 아니라는 고지를 표시한다.
- [ ] 사용자가 고지를 확인한 뒤 대화를 시작하도록 한다.
- [ ] 검증된 `AMY_HOOD_PERSONA.md`를 시스템 프롬프트로 연결한다.
- [ ] 답변에 판단, 조건, 근거, 확신 수준을 표시한다.
- [ ] Evidence 링크 또는 출처 제목을 열람할 수 있게 한다.
- [ ] 근거가 없는 질문에는 명확한 한계 응답을 보여준다.
- [ ] A Track의 기존 인터뷰와 저장 흐름이 깨지지 않는지 확인한다.
- [ ] Phase 6 평가셋을 앱 연결 후 다시 실행한다.

## 초보자를 위한 구현 순서

한 번에 전체 기능을 만들지 말고 다음 단위로 나눈다.

1. 화면에 A Track/B Track 선택 버튼만 추가한다.
2. B Track을 선택하면 Amy Hood 소개 카드만 보여준다.
3. 소개 카드에 고지 문구를 추가한다.
4. 정적인 샘플 답변으로 대화 화면 모양을 확인한다.
5. 저장된 Persona Markdown을 실제 AI 요청에 연결한다.
6. Evidence와 확신 수준을 답변 화면에 표시한다.
7. 오류와 근거 부족 응답을 처리한다.
8. 전체 흐름을 다시 테스트한다.

각 단계가 동작한 것을 확인한 뒤 다음 단계로 넘어간다.

## 구현 시 테스트 원칙

새 기능은 기존 프로젝트의 `AGENTS.md` 지침에 따라 테스트를 먼저 작성한다.

- Happy Path 1개
- 현실적인 Edge Case 정확히 3개
- 외부 API, 저장, 잘못된 입력과 관련된 Failure Path
- 테스트를 통과시키기 위한 최소 코드부터 구현
- 테스트를 통과시키기 위해 기존 테스트를 삭제하거나 약화하지 않음

## Codex 요청 예시

> `docs/b-track-amy-hood-poc/phase-7-integrate-prototype.md`를 읽고 1단계인 A Track/B Track 선택 UI만 구현해줘. 먼저 Test Plan을 작성하고 테스트를 추가한 뒤 최소 구현을 진행해줘. 다른 단계는 아직 구현하지 마.

## 완료 기준

- 사용자가 A Track과 B Track을 명확히 구분할 수 있다.
- 기존 A Track의 40문항 흐름이 정상 작동한다.
- B Track에서 Amy Hood Persona를 선택할 수 있다.
- 시작 전에 공개자료 기반 시뮬레이션임을 확인할 수 있다.
- 답변에 근거와 확신 수준이 표시된다.
- 근거가 부족하면 추정하지 않는다.
- Phase 6 평가를 연결된 앱에서도 통과한다.

