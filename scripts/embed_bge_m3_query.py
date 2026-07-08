from __future__ import annotations

import json
import os
import sys

from sentence_transformers import SentenceTransformer


MODEL_NAME = "BAAI/bge-m3"
LOCAL_FILES_ONLY = os.getenv("BGE_M3_LOCAL_ONLY", "true").lower() != "false"


def main() -> None:
    query = sys.argv[1] if len(sys.argv) > 1 else sys.stdin.read()
    query = query.strip()
    if not query:
        raise SystemExit("Query text is required")

    model = SentenceTransformer(MODEL_NAME, local_files_only=LOCAL_FILES_ONLY)
    embedding = model.encode([query], normalize_embeddings=True)[0]
    print(json.dumps({"model": MODEL_NAME, "embedding": embedding.tolist()}))


if __name__ == "__main__":
    main()
