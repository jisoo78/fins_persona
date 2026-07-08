from __future__ import annotations

import csv
import json
import os
from pathlib import Path

import numpy as np
from sentence_transformers import SentenceTransformer


ROOT = Path(__file__).resolve().parents[1]
ARCHIVE_DIR = Path(os.getenv("RAG_ARCHIVE_DIR", ROOT / "archive"))
OUTPUT_DIR = Path(os.getenv("RAG_VECTOR_INDEX_DIR", ROOT / "data" / "vector_index"))
METADATA_PATH = OUTPUT_DIR / "bge_m3_metadata.json"
VECTORS_PATH = OUTPUT_DIR / "bge_m3_vectors.f32"

MODEL_NAME = "BAAI/bge-m3"
CHUNK_SIZE = 1600
CHUNK_OVERLAP = 220
BATCH_SIZE = 16
LOCAL_FILES_ONLY = os.getenv("BGE_M3_LOCAL_ONLY", "true").lower() != "false"


def normalize_text(value: str) -> str:
    return " ".join(value.split()).strip()


def chunk_text(text: str) -> list[str]:
    normalized = normalize_text(text)
    if not normalized:
        return []

    chunks: list[str] = []
    start = 0

    while start < len(normalized):
        end = min(len(normalized), start + CHUNK_SIZE)
        chunks.append(normalized[start:end])
        if end >= len(normalized):
            break
        start = max(0, end - CHUNK_OVERLAP)

    return chunks


def read_single_column_csv(path: Path) -> list[str]:
    with path.open("r", encoding="utf-8-sig", newline="") as file:
        reader = csv.DictReader(file)
        return [row.get("text", "").strip() for row in reader if row.get("text", "").strip()]


def load_documents() -> list[dict]:
    documents: list[dict] = []

    for path in sorted(ARCHIVE_DIR.iterdir()):
        if path.suffix not in {".json", ".csv"}:
            continue

        if path.suffix == ".csv":
            for index, text in enumerate(read_single_column_csv(path)):
                documents.append(
                    {
                        "id": f"{path.name}:row-{index}",
                        "fileName": path.name,
                        "title": "Amy Hood collected interview CSV",
                        "speaker": "Amy Hood",
                        "text": text,
                    }
                )
            continue

        parsed = json.loads(path.read_text(encoding="utf-8"))

        if isinstance(parsed.get("records"), list):
            for index, record in enumerate(parsed["records"]):
                text = str(record.get("text", "")).strip()
                if not text:
                    continue
                documents.append(
                    {
                        "id": f"{path.name}:record-{index}",
                        "fileName": path.name,
                        "title": "Amy Hood collected interview JSON",
                        "speaker": "Amy Hood",
                        "text": text,
                    }
                )
            continue

        call = parsed.get("call") or {}
        for turn in parsed.get("speaker_turns") or []:
            text = str(turn.get("text", "")).strip()
            if not text:
                continue
            turn_index = turn.get("turn_index", len(documents))
            documents.append(
                {
                    "id": f"{path.name}:turn-{turn_index}",
                    "fileName": path.name,
                    "title": call.get("title") or path.stem,
                    "sourceUrl": call.get("source_url"),
                    "fiscalYear": call.get("fiscal_year"),
                    "fiscalQuarter": call.get("fiscal_quarter"),
                    "speaker": turn.get("speaker") or turn.get("speaker_raw"),
                    "section": turn.get("section"),
                    "text": text,
                }
            )

    return documents


def build_chunks() -> list[dict]:
    chunks: list[dict] = []

    for document in load_documents():
        for chunk_index, text in enumerate(chunk_text(document["text"])):
            chunk = {key: value for key, value in document.items() if key != "text"}
            chunk.update(
                {
                    "id": f"{document['id']}:chunk-{chunk_index}",
                    "chunkIndex": chunk_index,
                    "text": text,
                }
            )
            chunks.append(chunk)

    return chunks


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    chunks = build_chunks()
    texts = [chunk["text"] for chunk in chunks]

    print(f"Loading embedding model: {MODEL_NAME}")
    model = SentenceTransformer(MODEL_NAME, local_files_only=LOCAL_FILES_ONLY)
    print(f"Encoding {len(texts)} chunks...")
    embeddings = model.encode(
        texts,
        batch_size=BATCH_SIZE,
        normalize_embeddings=True,
        show_progress_bar=True,
    ).astype("float32")

    metadata = {
        "model": MODEL_NAME,
        "archiveDir": str(ARCHIVE_DIR),
        "dimension": int(embeddings.shape[1]),
        "chunkCount": len(chunks),
        "chunkSize": CHUNK_SIZE,
        "chunkOverlap": CHUNK_OVERLAP,
        "vectorsFile": VECTORS_PATH.name,
        "chunks": chunks,
    }

    METADATA_PATH.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    embeddings.tofile(VECTORS_PATH)
    print(f"Wrote {METADATA_PATH}")
    print(f"Wrote {VECTORS_PATH}")


if __name__ == "__main__":
    main()
