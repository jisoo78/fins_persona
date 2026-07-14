# Reviewed manual source import

Use this path for lawfully obtained public transcripts and formats that the automatic collectors do not support. Manual import reads local text only. It does not fetch `canonicalUrl`.

## 1. Save lawful text

Save the exact public text as UTF-8 without editing it after the hash is calculated. Keep the source URL and rights basis with the review record. Do not bypass access controls or import private, licensed, or login-gated material without permission.

LinkedIn may provide a discovery URL. It must not be used as a source of copied private or login-gated text.

## 2. Calculate the exact SHA-256

On macOS:

```bash
shasum -a 256 /absolute/path/to/transcript.txt
```

On systems with GNU coreutils:

```bash
sha256sum /absolute/path/to/transcript.txt
```

Copy the 64-character lowercase hash into `expectedSha256`. The importer hashes the exact UTF-8 bytes represented by `text`; whitespace changes cause a mismatch.

## 3. Fill reviewed metadata

Create a local JSON payload outside committed data if it contains licensed text:

```json
{
  "canonicalUrl": "https://publisher.example/public-interview",
  "title": "Public Amy Hood interview",
  "publisher": "Publisher name",
  "publishedAt": "2025-03-10",
  "speaker": "Amy Hood",
  "eventCandidateIds": ["candidate-fy25-q4-capex"],
  "tier": 3,
  "rightsNote": "Public transcript reviewed for lawful project use.",
  "text": "Exact UTF-8 transcript text...",
  "speakerSegments": [
    { "speaker": "Amy Hood", "startChar": 120, "endChar": 480 }
  ],
  "expectedSha256": "<64 lowercase hexadecimal characters>",
  "reviewer": "Reviewer name",
  "reviewedAt": "2026-07-14T04:00:00.000Z"
}
```

Offsets are zero-based JavaScript character offsets into the exact `text` value. Transcript segments must stay within the text and must not overlap. At least one segment labeled exactly `Amy Hood` is needed for verified attribution. Otherwise the preserved source remains `review_required` with `speaker_uncertain` and must not be approved.

The normalized text must contain at least 200 characters after whitespace normalization. `reviewer`, `reviewedAt`, source metadata, and the exact hash are mandatory.

## 4. Run the import

Run from the repository root. Use `importTranscript` for speaker-attributed transcripts or `importReviewedSource` for other unsupported public formats:

```bash
PAYLOAD=/absolute/path/to/import.json npx tsx -e "import { readFile } from 'node:fs/promises'; import { importTranscript } from './server/decisionAdvisor/transcriptImporter.ts'; (async () => { const input = JSON.parse(await readFile(process.env.PAYLOAD, 'utf8')); console.log(await importTranscript(input, process.cwd())); })();"
```

For a non-transcript source, replace the import and call with:

```ts
import { importReviewedSource } from './server/decisionAdvisor/manualSourceImporter.ts';
await importReviewedSource(input, process.cwd());
```

## 5. Verify persisted review state

Inspect `data/b-track/amy-hood/advisor/source-registry.json` and confirm:

- `collector` is `transcript_import` or `manual_import`;
- `collectionStatus` is `review_required`, never silently `approved`;
- `sha256`, `rawPath`, and `capturedAt` are populated;
- verified imports have a populated `normalizedPath`;
- uncertain transcript attribution has `failureReason: "speaker_uncertain"` and `normalizedPath: null`, so registry approval fails closed.

Then open the content-addressed raw JSON at `rawPath`. Confirm its `reviewer`, `reviewedAt`, `speakerSegments`, and decoded `bodyBase64` match the reviewed input. A changed review of the same text creates a new immutable raw review artifact; `supersedesRawPath` and `supersedesNormalizedPath` retain the audit chain without overwriting prior review bytes. For a verified import, confirm the file at `normalizedPath` contains the exact imported text. A validation error must be corrected at the payload; do not manually patch registry state or partial artifacts. Failed imports compensate any newly promoted artifacts and leave the prior registry state intact.
