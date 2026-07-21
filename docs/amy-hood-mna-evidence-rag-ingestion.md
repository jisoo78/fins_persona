# Amy Hood M&A Evidence RAG Ingestion

## 목적

Amy Hood CFO Advisor가 M&A 상황을 판단할 때 기존 어닝콜 중심 근거만 보지 않도록, Microsoft 주요 인수 사건의 공식 발표와 SEC 거래 자료를 RAG 지식에 추가했다.

## 추가 파일

- `archive/microsoft_mna_decision_evidence.json`

이 파일은 일반 RAG가 읽는 `archive/` 경로에 들어가며, 기존 `speaker_turns` 형식과 동일하게 로드된다.

## 포함 사건

- Nokia Devices and Services acquisition, 2013
- Mojang / Minecraft acquisition, 2014
- LinkedIn acquisition, 2016
- GitHub acquisition, 2018
- Nuance acquisition, 2021
- Activision Blizzard acquisition, 2022 announcement / 2023 close

## 직접 Amy Hood 근거 상태

| 사건 | 상태 | 메모 |
|---|---|---|
| Nokia | missing | 공식 발표 맥락만 확보 |
| Mojang | missing | 공식 발표 맥락만 확보 |
| LinkedIn | verified | Amy Hood investor call 발언 및 SEC cost synergy 논의 기록 확인 |
| GitHub | missing | 공식 발표 맥락만 확보 |
| Nuance | review_required | webcast 참여 기록은 있으나 직접 발언 transcript 미확보 |
| Activision Blizzard | verified | SEC DEFA14A에 investor call transcript 및 Amy Hood 참여 확인 |

## 주입 원칙

- 직접 Amy Hood 발언과 공식 Microsoft 맥락 자료를 구분한다.
- SEC proxy에 이름이 있어도 발언이 아니면 직접 발언으로 처리하지 않는다.
- 사후 결과는 당시 의사결정 근거와 분리한다.
- 직접 발언이 없는 사건은 모델이 발언을 지어내지 않도록 `missing`으로 남긴다.

## 코드 변경

`server/ragService.ts`의 키워드 점수에 M&A 관련 용어를 추가했다.

추가된 검색 신호:

- acquisition
- merger / M&A
- LinkedIn
- GitHub
- Activision
- Nuance
- Nokia
- Mojang / Minecraft
- synergy
- dilutive / accretive

이 변경으로 인수, 시너지, 희석, accretion 관련 질문에서 새 M&A 근거 청크가 검색될 가능성이 높아진다.
