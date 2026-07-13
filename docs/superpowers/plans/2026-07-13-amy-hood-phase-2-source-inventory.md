# Amy Hood Phase 2 Source Inventory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 Amy Hood 어닝콜·인터뷰 자료와 새로 검증한 공개자료를 재현 가능한 Source Inventory로 만들고 Phase 3의 1차 분석 대상 15~25개를 확정한다.

**Architecture:** Python 표준 라이브러리 기반 빌더가 `archive/`의 어닝콜 48개와 인수 인터뷰 데이터셋 2개를 읽고, 사람이 검증한 웹 자료와 상태 오버라이드를 병합한다. 빌더는 홀드아웃, 중복, 필수 필드, 자료 유형별 selected 수량과 재무 영역 범위를 검증한 뒤 `data/b-track/amy-hood/source-inventory.json`을 결정적으로 생성한다.

**Tech Stack:** Python 3 표준 라이브러리(`argparse`, `csv`, `json`, `pathlib`, `re`, `unittest`), 기존 JSON·CSV archive, 웹 원문 조사

## Global Constraints

- 제품 카테고리는 `인플루언서 페르소나`, 개별 명칭은 `Amy Hood 페르소나`다.
- 조사 범위는 Amy Hood의 CFO 취임 이후 공개된 인터뷰, 발표, 대담과 어닝콜이다.
- 인터뷰, 발표, 대담과 어닝콜은 자료 유형만으로 우선순위를 차등하지 않는다.
- FY2017 Q1부터 FY2019 Q4까지 어닝콜 12개는 `holdout`이며 Main Master Prompt나 학습용 RAG 입력으로 사용할 수 없다.
- `archive/microsoft_amy_hood.json`과 `archive/microsoft_amy_hood.csv`는 인수받은 정식 `primary interview` 데이터다.
- 확인되지 않은 URL, 날짜, 화자와 자료 유형을 추정해 채우지 않는다.
- 원본 `archive/` 파일은 수정하거나 삭제하지 않는다.
- `selected`는 총 15~25개, 인터뷰·발표·대담 10~15개, 어닝콜 5~10개여야 한다.
- `selected`는 5개 재무 영역 중 최소 4개를 포함해야 한다.
- Phase 2에서는 Evidence, Decision Case, Main Master Prompt를 생성하지 않는다.
- Phase 2에서는 기존 정적 RAG 페르소나 UI, API, 생성 함수와 채팅 경로를 수정하지 않는다.
- 새 테스트 파일 상단에는 AGENTS.md 형식의 Test Plan을 두고 Happy Path 1개, Edge Cases 정확히 3개와 현실적인 Failure Path를 명시한다.

## File Structure

- Create: `scripts/amy_hood_source_inventory.py` — 로컬 자료 등록, 중복 통계, curated 병합, 계약 검증과 최종 JSON 생성을 담당한다.
- Create: `tests/test_amy_hood_source_inventory.py` — 로더, 중복, 홀드아웃과 검증 계약을 표준 `unittest`로 검증한다.
- Create: `data/b-track/amy-hood/source-inventory-curated.json` — 검증된 웹 자료와 기존 어닝콜의 수동 선택·도메인 오버라이드를 보관한다.
- Create: `data/b-track/amy-hood/source-inventory.json` — Phase 2의 최종 생성 산출물이다.
- Modify: `package.json` — 인벤토리 테스트와 생성 명령을 등록한다.

---

### Task 1: 로컬 archive 등록기

**Files:**
- Create: `scripts/amy_hood_source_inventory.py`
- Create: `tests/test_amy_hood_source_inventory.py`

**Interfaces:**
- Consumes: `archive/fy*.json`, `archive/microsoft_amy_hood.json`, `archive/microsoft_amy_hood.csv`
- Produces: `normalize_text(value: str) -> str`, `infer_decision_domains(text: str) -> list[str]`, `load_local_inventory(archive_dir: Path) -> list[dict[str, object]]`

- [ ] **Step 1: 테스트 파일 상단에 전체 Test Plan과 첫 실패 테스트 작성**

```python
"""
Test Plan:
1. Happy Path:
   - 메타데이터가 완전한 Microsoft 어닝콜 JSON을 올바른 Source Inventory 항목으로 변환한다.

2. Edge Cases:
   - URL과 날짜가 없는 인수 인터뷰 데이터셋을 primary와 needs_enrichment로 유지한다.
   - 하나의 자료가 여러 재무 영역에 해당하면 모든 관련 domain을 보존한다.
   - JSON과 CSV에 중복 발언이 있어도 원본을 변경하지 않고 중복 통계를 기록한다.

3. Failure Path:
   - 손상된 분기 JSON은 전체 처리를 중단하지 않고 review_required 항목이 된다.
   - holdout 어닝콜이 selected이면 검증이 명확한 오류로 실패한다.
"""

import json
import tempfile
import unittest
from pathlib import Path

from scripts.amy_hood_source_inventory import load_local_inventory


class SourceInventoryTests(unittest.TestCase):
    def test_loads_complete_earnings_call(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            archive = Path(temp_dir)
            (archive / "fy2024_q1.json").write_text(
                json.dumps(
                    {
                        "call": {
                            "call_id": "fy2024_q1",
                            "fiscal_year": 2024,
                            "fiscal_quarter": 1,
                            "title": "Microsoft FY2024 Q1 Earnings Call",
                            "source_url": "https://www.microsoft.com/en-us/Investor/earnings/FY-2024-Q1/",
                            "amy_hood_found": True,
                            "parse_status": "parsed"
                        },
                        "speaker_turns": [
                            {
                                "speaker": "Amy Hood",
                                "text": "We balance capital investment with demand and operating leverage."
                            }
                        ]
                    }
                ),
                encoding="utf-8"
            )

            entries = load_local_inventory(archive)

            self.assertEqual(len(entries), 1)
            self.assertEqual(entries[0]["source_id"], "earnings_fy2024_q1")
            self.assertEqual(entries[0]["source_type"], "earnings_call")
            self.assertEqual(entries[0]["source_grade"], "primary")
            self.assertEqual(entries[0]["metadata_status"], "complete")
            self.assertEqual(entries[0]["status"], "available")
```

- [ ] **Step 2: 테스트가 import 오류로 실패하는지 확인**

Run: `python3 -m unittest discover -s tests -p 'test_amy_hood_source_inventory.py' -v`

Expected: `ModuleNotFoundError: No module named 'scripts.amy_hood_source_inventory'`

- [ ] **Step 3: 최소 로컬 archive 로더 구현**

`scripts/amy_hood_source_inventory.py`에 다음 상수와 함수를 구현한다.

```python
from __future__ import annotations

import csv
import json
import re
from pathlib import Path
from typing import Any


HOLDOUT_YEARS = {2017, 2018, 2019}
DOMAIN_KEYWORDS = {
    "capital_allocation": ("capital allocation", "capex", "cash return", "buyback", "dividend"),
    "growth_profitability_balance": ("growth", "profitability", "margin", "operating leverage"),
    "cost_discipline_operating_efficiency": ("cost", "expense", "efficiency", "headcount"),
    "strategic_investment_acquisition": ("investment", "acquisition", "m&a", "partnership"),
    "risk_uncertainty": ("risk", "uncertainty", "constraint", "demand signal", "foreign exchange"),
}


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("\ufeff", "")).strip().casefold()


def infer_decision_domains(text: str) -> list[str]:
    normalized = normalize_text(text)
    return [
        domain
        for domain, keywords in DOMAIN_KEYWORDS.items()
        if any(keyword in normalized for keyword in keywords)
    ]


def _read_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError("top-level JSON must be an object")
    return value


def _earnings_entry(path: Path) -> dict[str, object]:
    parsed = _read_json(path)
    call = parsed.get("call") or {}
    turns = parsed.get("speaker_turns") or []
    call_id = str(call.get("call_id") or path.stem)
    year = int(call["fiscal_year"])
    quarter = int(call["fiscal_quarter"])
    amy_text = " ".join(
        str(turn.get("text") or "")
        for turn in turns
        if "amy hood" in str(turn.get("speaker") or turn.get("speaker_raw") or "").casefold()
    )
    url = call.get("source_url") or None
    return {
        "source_id": f"earnings_{call_id}",
        "title": str(call.get("title") or call_id),
        "source_type": "earnings_call",
        "source_grade": "primary",
        "url": url,
        "local_path": f"archive/{path.name}",
        "published_at": call.get("call_date") or None,
        "speaker": "Amy Hood",
        "decision_domains": infer_decision_domains(amy_text),
        "has_full_text": bool(turns),
        "metadata_status": "complete" if url else "needs_enrichment",
        "selection_reason": "Microsoft 어닝콜 원문을 보유한 정식 자료",
        "status": "holdout" if year in HOLDOUT_YEARS else "available",
        "fiscal_year": year,
        "fiscal_quarter": quarter,
    }


def _interview_entry(path: Path, record_count: int) -> dict[str, object]:
    file_kind = path.suffix.removeprefix(".")
    return {
        "source_id": f"interview_dataset_{path.stem}_{file_kind}",
        "title": f"Inherited Amy Hood interview dataset ({path.name})",
        "source_type": "interview",
        "source_grade": "primary",
        "url": None,
        "local_path": f"archive/{path.name}",
        "published_at": None,
        "speaker": "Amy Hood",
        "decision_domains": [],
        "has_full_text": record_count > 0,
        "metadata_status": "needs_enrichment",
        "selection_reason": "프로젝트 인수 과정에서 Amy Hood 인터뷰 자료로 확인된 정식 데이터셋",
        "status": "selected",
        "record_count": record_count,
    }


def _interview_record_count(path: Path) -> int:
    if path.suffix == ".json":
        parsed = _read_json(path)
        return len(parsed.get("records") or [])
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return sum(1 for row in csv.DictReader(handle) if str(row.get("text") or "").strip())


def load_local_inventory(archive_dir: Path) -> list[dict[str, object]]:
    entries: list[dict[str, object]] = []
    for path in sorted(archive_dir.glob("fy*.json")):
        try:
            entries.append(_earnings_entry(path))
        except (json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
            entries.append({
                "source_id": f"review_{path.stem}",
                "title": path.name,
                "source_type": "earnings_call",
                "source_grade": "primary",
                "url": None,
                "local_path": f"archive/{path.name}",
                "published_at": None,
                "speaker": "Amy Hood",
                "decision_domains": [],
                "has_full_text": False,
                "metadata_status": "review_required",
                "selection_reason": "로컬 어닝콜 파일 파싱 실패",
                "status": "review_required",
                "review_notes": [str(error)],
            })

    for name in ("microsoft_amy_hood.json", "microsoft_amy_hood.csv"):
        path = archive_dir / name
        if path.exists():
            try:
                entries.append(_interview_entry(path, _interview_record_count(path)))
            except (csv.Error, json.JSONDecodeError, TypeError, ValueError) as error:
                entries.append({
                    "source_id": f"review_{path.stem}_{path.suffix.removeprefix('.')}",
                    "title": path.name,
                    "source_type": "interview",
                    "source_grade": "primary",
                    "url": None,
                    "local_path": f"archive/{path.name}",
                    "published_at": None,
                    "speaker": "Amy Hood",
                    "decision_domains": [],
                    "has_full_text": False,
                    "metadata_status": "review_required",
                    "selection_reason": "인수 인터뷰 파일 파싱 실패",
                    "status": "review_required",
                    "review_notes": [str(error)],
                })
    return entries
```

- [ ] **Step 4: 첫 테스트 통과 확인**

Run: `python3 -m unittest discover -s tests -p 'test_amy_hood_source_inventory.py' -v`

Expected: `Ran 1 test` and `OK`

- [ ] **Step 5: 로컬 등록기 커밋**

```bash
git add scripts/amy_hood_source_inventory.py tests/test_amy_hood_source_inventory.py
git commit -m "feat: add Amy Hood source inventory loader"
```

---

### Task 2: 중복 통계, curated 병합과 계약 검증

**Files:**
- Modify: `scripts/amy_hood_source_inventory.py`
- Modify: `tests/test_amy_hood_source_inventory.py`
- Modify: `package.json`

**Interfaces:**
- Consumes: `load_local_inventory()`, curated JSON의 `overrides`와 `web_sources`
- Produces: `interview_duplicate_stats(archive_dir: Path) -> dict[str, int]`, `merge_curated(entries: list[dict], curated: dict) -> list[dict]`, `validate_inventory(entries: list[dict]) -> list[str]`, CLI `main() -> int`

- [ ] **Step 1: Edge Case 3개와 Failure Path 테스트 추가**

`SourceInventoryTests`에 다음 테스트를 추가한다. 테스트 파일의 상단 Test Plan은 Task 1에서 작성한 그대로 유지한다.

```python
from scripts.amy_hood_source_inventory import (
    infer_decision_domains,
    interview_duplicate_stats,
    merge_curated,
    validate_inventory,
)


def test_inherited_interview_keeps_missing_metadata(self) -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        archive = Path(temp_dir)
        (archive / "microsoft_amy_hood.json").write_text(
            json.dumps({"records": [{"text": "Capital allocation interview answer"}]}),
            encoding="utf-8"
        )
        entries = load_local_inventory(archive)
        self.assertEqual(entries[0]["source_grade"], "primary")
        self.assertIsNone(entries[0]["url"])
        self.assertIsNone(entries[0]["published_at"])
        self.assertEqual(entries[0]["metadata_status"], "needs_enrichment")


def test_infers_multiple_decision_domains(self) -> None:
    domains = infer_decision_domains(
        "We balance CapEx investment, margin efficiency, growth and uncertainty."
    )
    self.assertIn("capital_allocation", domains)
    self.assertIn("growth_profitability_balance", domains)
    self.assertIn("cost_discipline_operating_efficiency", domains)
    self.assertIn("strategic_investment_acquisition", domains)
    self.assertIn("risk_uncertainty", domains)


def test_counts_cross_file_duplicates_without_mutating_sources(self) -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        archive = Path(temp_dir)
        json_path = archive / "microsoft_amy_hood.json"
        csv_path = archive / "microsoft_amy_hood.csv"
        json_path.write_text(
            json.dumps({"records": [{"text": "Same Amy Hood answer"}]}),
            encoding="utf-8"
        )
        csv_path.write_text('text\n"Same   Amy Hood answer"\n', encoding="utf-8")
        before_json = json_path.read_bytes()
        before_csv = csv_path.read_bytes()
        stats = interview_duplicate_stats(archive)
        self.assertEqual(stats["cross_file_duplicate_count"], 1)
        self.assertEqual(json_path.read_bytes(), before_json)
        self.assertEqual(csv_path.read_bytes(), before_csv)


def test_malformed_json_becomes_review_required(self) -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        archive = Path(temp_dir)
        (archive / "fy2024_q1.json").write_text("{broken", encoding="utf-8")
        entries = load_local_inventory(archive)
        self.assertEqual(entries[0]["status"], "review_required")
        self.assertTrue(entries[0]["review_notes"])


def test_malformed_interview_json_becomes_review_required(self) -> None:
    with tempfile.TemporaryDirectory() as temp_dir:
        archive = Path(temp_dir)
        (archive / "microsoft_amy_hood.json").write_text("{broken", encoding="utf-8")
        entries = load_local_inventory(archive)
        self.assertEqual(entries[0]["source_type"], "interview")
        self.assertEqual(entries[0]["status"], "review_required")
        self.assertTrue(entries[0]["review_notes"])


def test_validation_rejects_selected_holdout(self) -> None:
    errors = validate_inventory([
        {
            "source_id": "earnings_fy2018_q2",
            "source_type": "earnings_call",
            "source_grade": "primary",
            "url": "https://example.test/fy2018-q2",
            "local_path": "archive/fy2018_q2.json",
            "published_at": None,
            "speaker": "Amy Hood",
            "decision_domains": ["capital_allocation"],
            "has_full_text": True,
            "metadata_status": "complete",
            "selection_reason": "invalid fixture",
            "status": "selected",
            "fiscal_year": 2018,
            "fiscal_quarter": 2,
            "title": "FY2018 Q2"
        }
    ])
    self.assertIn("holdout earnings call cannot be selected: earnings_fy2018_q2", errors)
```

- [ ] **Step 2: 새 테스트가 정의되지 않은 함수로 실패하는지 확인**

Run: `python3 -m unittest discover -s tests -p 'test_amy_hood_source_inventory.py' -v`

Expected: import errors for `interview_duplicate_stats`, `merge_curated`, or `validate_inventory`

- [ ] **Step 3: 중복·병합·검증 함수와 CLI 구현**

`scripts/amy_hood_source_inventory.py`에 다음 구현을 추가한다.

```python
import argparse
from collections import Counter


VALID_DOMAINS = set(DOMAIN_KEYWORDS)
SELECTED_NON_EARNINGS_TYPES = {"interview", "presentation", "conversation"}


def _interview_texts(path: Path) -> list[str]:
    if path.suffix == ".json":
        parsed = _read_json(path)
        return [str(row.get("text") or "") for row in parsed.get("records") or []]
    with path.open(encoding="utf-8-sig", newline="") as handle:
        return [str(row.get("text") or "") for row in csv.DictReader(handle)]


def interview_duplicate_stats(archive_dir: Path) -> dict[str, int]:
    json_texts = {
        normalize_text(text)
        for text in _interview_texts(archive_dir / "microsoft_amy_hood.json")
        if normalize_text(text)
    }
    csv_texts = {
        normalize_text(text)
        for text in _interview_texts(archive_dir / "microsoft_amy_hood.csv")
        if normalize_text(text)
    }
    return {
        "json_unique_count": len(json_texts),
        "csv_unique_count": len(csv_texts),
        "cross_file_duplicate_count": len(json_texts & csv_texts),
    }


def merge_curated(
    entries: list[dict[str, object]],
    curated: dict[str, object],
) -> list[dict[str, object]]:
    by_id = {str(entry["source_id"]): dict(entry) for entry in entries}
    for override in curated.get("overrides", []):
        source_id = str(override["source_id"])
        if source_id not in by_id:
            raise ValueError(f"unknown override source_id: {source_id}")
        by_id[source_id].update(override)
    for source in curated.get("web_sources", []):
        source_id = str(source["source_id"])
        if source_id in by_id:
            raise ValueError(f"duplicate source_id: {source_id}")
        by_id[source_id] = dict(source)
    return [by_id[source_id] for source_id in sorted(by_id)]


def validate_inventory(entries: list[dict[str, object]]) -> list[str]:
    errors: list[str] = []
    ids = [str(entry.get("source_id") or "") for entry in entries]
    for source_id, count in Counter(ids).items():
        if not source_id:
            errors.append("source_id is required")
        elif count > 1:
            errors.append(f"duplicate source_id: {source_id}")

    required = {
        "source_id", "title", "source_type", "source_grade", "url", "local_path",
        "published_at", "speaker", "decision_domains", "has_full_text",
        "metadata_status", "selection_reason", "status",
    }
    for entry in entries:
        source_id = str(entry.get("source_id") or "missing-source-id")
        missing = sorted(required - set(entry))
        if missing:
            errors.append(f"missing fields for {source_id}: {', '.join(missing)}")
        domains = set(entry.get("decision_domains") or [])
        unknown_domains = sorted(domains - VALID_DOMAINS)
        if unknown_domains:
            errors.append(f"unknown domains for {source_id}: {', '.join(unknown_domains)}")
        if (
            entry.get("source_type") == "earnings_call"
            and entry.get("fiscal_year") in HOLDOUT_YEARS
            and entry.get("status") == "selected"
        ):
            errors.append(f"holdout earnings call cannot be selected: {source_id}")

    selected = [entry for entry in entries if entry.get("status") == "selected"]
    selected_earnings = [entry for entry in selected if entry.get("source_type") == "earnings_call"]
    selected_non_earnings = [
        entry for entry in selected if entry.get("source_type") in SELECTED_NON_EARNINGS_TYPES
    ]
    covered_domains = {
        str(domain)
        for entry in selected
        for domain in entry.get("decision_domains") or []
    }
    if entries and not 15 <= len(selected) <= 25:
        errors.append(f"selected count must be 15..25, got {len(selected)}")
    if entries and not 5 <= len(selected_earnings) <= 10:
        errors.append(f"selected earnings count must be 5..10, got {len(selected_earnings)}")
    if entries and not 10 <= len(selected_non_earnings) <= 15:
        errors.append(f"selected interview/presentation/conversation count must be 10..15, got {len(selected_non_earnings)}")
    if entries and len(covered_domains) < 4:
        errors.append(f"selected sources must cover at least 4 domains, got {len(covered_domains)}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", type=Path, default=Path.cwd())
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    root = args.project_root.resolve()
    archive_dir = root / "archive"
    curated_path = root / "data/b-track/amy-hood/source-inventory-curated.json"
    output_path = root / "data/b-track/amy-hood/source-inventory.json"

    curated = _read_json(curated_path)
    entries = merge_curated(load_local_inventory(archive_dir), curated)
    errors = validate_inventory(entries)
    if errors:
        for error in errors:
            print(f"ERROR: {error}")
        return 1
    if not args.check:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(entries, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8"
        )
    print(f"inventory entries: {len(entries)}")
    print(f"selected: {sum(entry['status'] == 'selected' for entry in entries)}")
    print(f"holdout: {sum(entry['status'] == 'holdout' for entry in entries)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 4: 전체 단위 테스트 통과 확인**

Run: `python3 -m unittest discover -s tests -p 'test_amy_hood_source_inventory.py' -v`

Expected: `Ran 7 tests` and `OK`

- [ ] **Step 5: package 명령 등록**

`package.json`의 `scripts`에 다음 두 항목을 추가한다.

```json
"inventory:test": "python3 -m unittest discover -s tests -p 'test_amy_hood_source_inventory.py' -v",
"inventory:build": "python3 scripts/amy_hood_source_inventory.py"
```

- [ ] **Step 6: package 명령으로 테스트 재검증**

Run: `npm run inventory:test`

Expected: `Ran 7 tests` and `OK`

- [ ] **Step 7: 검증기 커밋**

```bash
git add scripts/amy_hood_source_inventory.py tests/test_amy_hood_source_inventory.py package.json
git commit -m "feat: validate Amy Hood source inventory"
```

---

### Task 3: 기존 자료 분석과 curated 오버라이드 작성

**Files:**
- Create: `data/b-track/amy-hood/source-inventory-curated.json`

**Interfaces:**
- Consumes: `archive/`의 48개 분기 JSON, 인수 인터뷰 JSON·CSV, Phase 1의 5개 domain
- Produces: 최상위 배열 필드 `overrides`와 `web_sources`를 가진 사람이 검토 가능한 JSON 입력

- [ ] **Step 1: 실제 로컬 자료 수와 중복 통계 확인**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
from scripts.amy_hood_source_inventory import interview_duplicate_stats, load_local_inventory

root = Path.cwd()
entries = load_local_inventory(root / "archive")
print("local entries:", len(entries))
print("earnings:", sum(item["source_type"] == "earnings_call" for item in entries))
print("holdout:", sum(item["status"] == "holdout" for item in entries))
print("interview datasets:", sum(item["source_type"] == "interview" for item in entries))
print("duplicates:", interview_duplicate_stats(root / "archive"))
PY
```

Expected: `local entries: 50`, `earnings: 48`, `holdout: 12`, `interview datasets: 2`. 중복 수치는 실제 파일을 읽은 결과를 그대로 기록한다.

- [ ] **Step 2: holdout 밖의 어닝콜을 5개 domain으로 검토해 5~10개 선택**

각 후보에서 Amy Hood의 직접 발언만 읽고 다음 기준을 적용한다.

- 선택 상황 또는 명시적 trade-off가 있다.
- 판단 이유, 수요 신호, 손실·마진·현금흐름 영향 중 하나 이상을 설명한다.
- 다른 selected 어닝콜과 같은 판단 사례를 반복하지 않는다.
- FY2017-FY2019는 선택 대상에서 제외한다.

선택한 어닝콜은 `overrides`에 다음 완전한 형태로 기록한다.

```json
{
  "source_id": "earnings_fy2024_q1",
  "decision_domains": ["capital_allocation", "growth_profitability_balance", "risk_uncertainty"],
  "selection_reason": "Amy Hood가 클라우드·AI 수요 신호와 CapEx, 마진 영향을 함께 설명한 직접 발언을 포함함",
  "status": "selected"
}
```

선택하지 않은 36개 비홀드아웃 자료는 자동 생성된 `available` 상태를 유지한다.

- [ ] **Step 3: 인수 인터뷰 두 항목의 domain과 중복 통계 오버라이드 작성**

두 항목 모두 정식 `selected`를 유지한다. 실제 텍스트에서 확인한 domain만 기록하고 Task 3 Step 1에서 얻은 중복 통계를 `review_notes`에 남긴다.

```json
{
  "source_id": "interview_dataset_microsoft_amy_hood_json",
  "decision_domains": [
    "capital_allocation",
    "growth_profitability_balance",
    "cost_discipline_operating_efficiency",
    "strategic_investment_acquisition",
    "risk_uncertainty"
  ],
  "selection_reason": "프로젝트 인수 과정에서 Amy Hood 인터뷰 자료로 확인된 정식 데이터셋이며 다수의 재무 판단 발언을 포함함",
  "status": "selected",
  "review_notes": ["URL과 공개일 메타데이터 보강 필요", "JSON·CSV 교차 중복 수는 로컬 검사 결과를 사용"]
}
```

- [ ] **Step 4: curated 파일을 유효한 빈 웹 목록과 함께 저장**

```json
{
  "overrides": [],
  "web_sources": []
}
```

위 골격의 `overrides`를 Step 2와 Step 3에서 검토한 실제 항목으로 채운다. `web_sources`는 다음 Task의 검증된 자료만 받는다.

- [ ] **Step 5: JSON 문법 검증**

Run: `python3 -m json.tool data/b-track/amy-hood/source-inventory-curated.json >/dev/null`

Expected: exit code `0`

- [ ] **Step 6: 기존 자료 오버라이드 커밋**

```bash
git add data/b-track/amy-hood/source-inventory-curated.json
git commit -m "data: classify existing Amy Hood sources"
```

---

### Task 4: 부족 영역 웹 조사와 공개자료 선별

**Files:**
- Modify: `data/b-track/amy-hood/source-inventory-curated.json`

**Interfaces:**
- Consumes: Task 3의 domain 분포와 `selected` 수량
- Produces: 검증된 인터뷰·발표·대담 `web_sources` 8~13개. 인수 인터뷰 2개와 합쳐 비어닝콜 selected가 10~15개가 된다.

- [ ] **Step 1: domain별 부족 수량 계산**

Task 3의 curated 파일과 로컬 항목을 병합하되 selected 수량 검증 전의 분포를 출력하는 짧은 읽기 전용 명령을 실행한다.

```bash
python3 - <<'PY'
import json
from collections import Counter
from pathlib import Path
from scripts.amy_hood_source_inventory import load_local_inventory, merge_curated

root = Path.cwd()
curated = json.loads((root / "data/b-track/amy-hood/source-inventory-curated.json").read_text())
entries = merge_curated(load_local_inventory(root / "archive"), curated)
selected = [item for item in entries if item["status"] == "selected"]
print(Counter(domain for item in selected for domain in item["decision_domains"]))
PY
```

Expected: 현재 selected domain별 실제 건수를 출력한다. 5개 중 빈약한 영역부터 조사한다.

- [ ] **Step 2: 정확한 검색 묶음으로 후보 탐색**

다음 검색문을 사용하고 Microsoft 공식 원문을 우선한다.

```text
site:microsoft.com "Amy Hood" interview capital allocation
site:microsoft.com/en-us/Investor "Amy Hood" fireside chat
site:microsoft.com "Amy Hood" growth profitability efficiency
"Amy Hood" CFO conference transcript acquisition risk
```

각 후보는 원문 URL, 공개일, Amy Hood 직접 발언, 전체 transcript 또는 분석 가능한 본문을 확인한다. 검색결과 페이지 URL이나 요약문은 원문 URL로 사용하지 않는다.

- [ ] **Step 3: 후보를 inclusion 기준으로 검토**

다음 5개 중 최소 2개가 참인 자료만 등록한다.

1. Amy Hood가 직접 말한다.
2. 실제 재무 문제나 선택 상황이 등장한다.
3. 선택 이유나 고려한 위험을 설명한다.
4. 당시 상황과 날짜를 확인할 수 있다.
5. 원문, 전체 영상 또는 transcript를 확인할 수 있다.

단순 약력, 실적 요약, 다른 화자의 해석과 동일 원문 복제본은 `selected`에 넣지 않는다.

- [ ] **Step 4: 검증된 웹 자료를 완전한 항목으로 추가**

각 항목에는 데이터 계약의 13개 필드를 모두 작성한다. `source_id`는 `web_amy_hood_` 뒤에 원문 제목을 소문자 snake_case로 정규화해 만든다. 예를 들어 원문 제목이 `Microsoft AI Investor Discussion`이면 `web_amy_hood_microsoft_ai_investor_discussion`을 사용한다.

- `title`, `url`, `published_at`: 원문 페이지에 표시된 실제 값을 복사한다.
- `source_type`: 실제 형식에 따라 `interview`, `presentation`, `conversation` 중 하나를 사용한다.
- `source_grade`: Microsoft 공식 원문이나 Amy Hood 직접 발언 원문은 `primary`, 신뢰할 수 있는 매체의 직접 인용은 `secondary`로 기록한다.
- `local_path`: 로컬 사본을 만들지 않으므로 `null`로 기록한다.
- `speaker`: 직접 발언을 확인한 경우에만 `Amy Hood`로 기록한다.
- `decision_domains`: 원문에서 확인한 Phase 1 domain만 기록한다.
- `has_full_text`: 전체 transcript나 분석 가능한 본문이 있으면 `true`로 기록한다.
- `metadata_status`: URL과 날짜가 확인되면 `complete`, 날짜가 없으면 `needs_enrichment`로 기록한다.
- `selection_reason`: 원문에서 확인한 선택 상황과 판단 이유를 한 문장으로 쓴다.
- `status`: inclusion 기준을 만족한 1차 분석 대상은 `selected`로 기록한다.

확인되지 않은 날짜는 `null`로 두며 추정 날짜를 쓰지 않는다. `source_id`, URL과 제목은 파일 안에서 중복될 수 없다.

- [ ] **Step 5: selected 구성의 사전 검증**

Run: `npm run inventory:build`

Expected: 웹 자료가 아직 부족하면 `selected interview/presentation/conversation count must be 10..15` 또는 domain coverage 오류로 실패한다. 자료를 무관한 항목으로 채우지 말고 검증된 자료를 추가한 뒤 다시 실행한다.

- [ ] **Step 6: 웹 자료가 포함된 curated 파일 커밋**

```bash
git add data/b-track/amy-hood/source-inventory-curated.json
git commit -m "data: add verified Amy Hood public sources"
```

---

### Task 5: 최종 Source Inventory 생성과 검증

**Files:**
- Create: `data/b-track/amy-hood/source-inventory.json`
- Verify only: `archive/`
- Verify only: `server/ragService.ts`, `server/vectorRagService.ts`, `server/agentService.ts`, `server/index.ts`, `src/components/PersonasView.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: 로컬 archive 50개 항목과 검증된 curated 파일
- Produces: Phase 3가 직접 읽을 수 있는 결정적 `source-inventory.json`

- [ ] **Step 1: 전체 단위 테스트 실행**

Run: `npm run inventory:test`

Expected: `Ran 7 tests` and `OK`

- [ ] **Step 2: 최종 인벤토리 생성**

Run: `npm run inventory:build`

Expected: exit code `0`. 출력된 `inventory entries`는 로컬 항목 50개와 검증된 `web_sources` 수의 합이고 최소 58개다. `selected`는 15~25, `holdout`은 정확히 12로 출력된다.

- [ ] **Step 3: 출력 JSON 문법과 결정성 검증**

Run:

```bash
python3 -m json.tool data/b-track/amy-hood/source-inventory.json >/dev/null
cp data/b-track/amy-hood/source-inventory.json /tmp/source-inventory.first.json
npm run inventory:build
cmp /tmp/source-inventory.first.json data/b-track/amy-hood/source-inventory.json
```

Expected: 모든 명령 exit code `0`; 두 번 생성한 파일이 byte-for-byte 동일함

- [ ] **Step 4: 실제 저장소 계약 검증**

Run:

```bash
python3 - <<'PY'
import json
from collections import Counter
from pathlib import Path

path = Path("data/b-track/amy-hood/source-inventory.json")
items = json.loads(path.read_text())
statuses = Counter(item["status"] for item in items)
types = Counter(item["source_type"] for item in items if item["status"] == "selected")
domains = Counter(domain for item in items if item["status"] == "selected" for domain in item["decision_domains"])
earnings = [item for item in items if item["source_type"] == "earnings_call"]
holdout = [item for item in earnings if item["status"] == "holdout"]
selected_earnings = [item for item in earnings if item["status"] == "selected"]
selected_non_earnings = [
    item for item in items
    if item["status"] == "selected"
    and item["source_type"] in {"interview", "presentation", "conversation"}
]
assert len(earnings) == 48, len(earnings)
assert len(holdout) == 12, len(holdout)
assert 15 <= statuses["selected"] <= 25, statuses
assert 5 <= len(selected_earnings) <= 10, len(selected_earnings)
assert 10 <= len(selected_non_earnings) <= 15, len(selected_non_earnings)
assert len(domains) >= 4, domains
assert all(not (item.get("fiscal_year") in {2017, 2018, 2019} and item["status"] == "selected") for item in earnings)
print("statuses", statuses)
print("selected types", types)
print("selected domains", domains)
PY
```

Expected: assertions pass and actual status, type and domain counts print

- [ ] **Step 5: 원본 archive와 기존 RAG 경로가 변경되지 않았는지 확인**

Run:

```bash
git diff --exit-code HEAD -- archive server/ragService.ts server/vectorRagService.ts server/agentService.ts server/index.ts src/components/PersonasView.tsx src/App.tsx
```

Expected: exit code `0`

- [ ] **Step 6: 전체 프로젝트 정적 검증**

Run:

```bash
npm run lint
npm run build
git diff --check
```

Expected: TypeScript check와 Vite build 성공, whitespace error 없음

- [ ] **Step 7: 최종 산출물 커밋**

```bash
git add data/b-track/amy-hood/source-inventory.json
git commit -m "data: build Amy Hood source inventory"
```

## 실제 구현 산출물

이 계획을 실행하면 다음 파일이 생성되거나 수정된다.

1. `data/b-track/amy-hood/source-inventory.json`
   - Phase 2의 핵심 산출물
   - 어닝콜 48개, 인수 인터뷰 데이터셋 2개와 검증된 웹 자료를 포함
   - `selected`, `available`, `holdout`, `rejected`, `review_required` 상태를 명시

2. `data/b-track/amy-hood/source-inventory-curated.json`
   - 사람이 검토한 어닝콜 선택·domain 오버라이드와 검증된 웹 자료
   - 자동 생성 결과와 수동 조사 판단을 분리해 재검토 가능하게 함

3. `scripts/amy_hood_source_inventory.py`
   - 기존 archive 등록, 중복 통계, curated 병합, 계약 검증과 최종 JSON 생성

4. `tests/test_amy_hood_source_inventory.py`
   - Happy Path 1개, Edge Cases 정확히 3개와 Failure Path 검증

5. `package.json`
   - `npm run inventory:test`
   - `npm run inventory:build`

이번 계획은 Main Master Prompt, Evidence Dataset, RAG 색인, 질문별 장기 기억 검색, 기존 RAG 사용자 경로 제거 또는 UI 구현을 산출하지 않는다. 이 작업들은 Phase 3 이후 별도 설계와 계획이 필요하다.
