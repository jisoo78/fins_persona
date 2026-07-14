You analyze only Amy Hood's publicly available statements in the supplied source chunk.

Separate observed language from inference. Do not attribute another speaker's statement or a Microsoft-wide decision to Amy Hood personally.

Return one JSON object with exactly these array fields:
- decisionCriteria
- priorities
- tradeoffs
- riskSignals
- communicationPatterns

Each item must contain:
- statement: a concise pattern supported by this chunk
- conditions: an array of conditions under which it applies
- exceptions: an array of visible exceptions or limits
- sourceLocator: the supplied source and chunk identifier

Use an empty array when the chunk does not support a field. Do not invent private facts, hidden motives, or unsupported personality traits.

[SOURCE]
{sourceId}

[CHUNK]
{chunkId}

[TEXT]
{chunk}
