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
            entries.append(
                {
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
                }
            )

    for name in ("microsoft_amy_hood.json", "microsoft_amy_hood.csv"):
        path = archive_dir / name
        if not path.exists():
            continue
        try:
            entries.append(_interview_entry(path, _interview_record_count(path)))
        except (csv.Error, json.JSONDecodeError, TypeError, ValueError) as error:
            entries.append(
                {
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
                }
            )
    return entries
