from __future__ import annotations

import argparse
import csv
import json
import re
from collections import Counter
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
VALID_DOMAINS = set(DOMAIN_KEYWORDS)
SELECTED_NON_EARNINGS_TYPES = {"interview", "presentation", "conversation"}


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
    overrides = curated.get("overrides", [])
    web_sources = curated.get("web_sources", [])
    if not isinstance(overrides, list) or not isinstance(web_sources, list):
        raise ValueError("curated overrides and web_sources must be arrays")

    for override in overrides:
        if not isinstance(override, dict):
            raise ValueError("curated override must be an object")
        source_id = str(override["source_id"])
        if source_id not in by_id:
            raise ValueError(f"unknown override source_id: {source_id}")
        by_id[source_id].update(override)
    for source in web_sources:
        if not isinstance(source, dict):
            raise ValueError("curated web source must be an object")
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
        "source_id",
        "title",
        "source_type",
        "source_grade",
        "url",
        "local_path",
        "published_at",
        "speaker",
        "decision_domains",
        "has_full_text",
        "metadata_status",
        "selection_reason",
        "status",
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
        errors.append(
            "selected interview/presentation/conversation count must be "
            f"10..15, got {len(selected_non_earnings)}"
        )
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
            encoding="utf-8",
        )
    print(f"inventory entries: {len(entries)}")
    print(f"selected: {sum(entry['status'] == 'selected' for entry in entries)}")
    print(f"holdout: {sum(entry['status'] == 'holdout' for entry in entries)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
