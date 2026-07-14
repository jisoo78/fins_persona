"""
Test Plan:
1. Happy Path:
   - 메타데이터가 완전한 Microsoft 어닝콜 JSON을 올바른 Source Inventory 항목으로 변환한다.

2. Edge Cases:
   - URL과 날짜가 없는 인수 인터뷰 데이터셋을 primary와 needs_enrichment로 유지한다.
   - 하나의 자료가 여러 재무 영역에 해당하면 모든 관련 domain을 보존한다.
   - JSON과 CSV에 중복 발언이 있어도 원본을 변경하지 않고 중복 통계를 기록한다.

3. Failure Path:
   - 손상된 분기 또는 인터뷰 JSON은 전체 처리를 중단하지 않고 review_required 항목이 된다.
   - holdout 어닝콜이 selected이면 검증이 명확한 오류로 실패한다.
"""

import json
import tempfile
import unittest
from pathlib import Path

from scripts.amy_hood_source_inventory import (
    infer_decision_domains,
    interview_duplicate_stats,
    load_local_inventory,
    validate_inventory,
)


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
                            "parse_status": "parsed",
                        },
                        "speaker_turns": [
                            {
                                "speaker": "Amy Hood",
                                "text": "We balance capital investment with demand and operating leverage.",
                            }
                        ],
                    }
                ),
                encoding="utf-8",
            )

            entries = load_local_inventory(archive)

            self.assertEqual(len(entries), 1)
            self.assertEqual(entries[0]["source_id"], "earnings_fy2024_q1")
            self.assertEqual(entries[0]["source_type"], "earnings_call")
            self.assertEqual(entries[0]["source_grade"], "primary")
            self.assertEqual(entries[0]["metadata_status"], "complete")
            self.assertEqual(entries[0]["status"], "available")

    def test_inherited_interview_keeps_missing_metadata(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            archive = Path(temp_dir)
            (archive / "microsoft_amy_hood.json").write_text(
                json.dumps({"records": [{"text": "Capital allocation interview answer"}]}),
                encoding="utf-8",
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
                encoding="utf-8",
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
        errors = validate_inventory(
            [
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
                    "title": "FY2018 Q2",
                }
            ]
        )

        self.assertIn("holdout earnings call cannot be selected: earnings_fy2018_q2", errors)


if __name__ == "__main__":
    unittest.main()
