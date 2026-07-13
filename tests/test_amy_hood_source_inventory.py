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


if __name__ == "__main__":
    unittest.main()
