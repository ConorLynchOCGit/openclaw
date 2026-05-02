# Live Gateway Document Ingestion Validation

- Tool: `model_memory_document_ingest`
- Run ID: `live-gateway-ui-doc-20260430T175641911Z`
- Record path: `.artifacts/model-memory/phase2-live-gateway-ui-model-owned-validation/20260430T175641911Z/document-ingestion-record.json`
- Pass 1 model: `openai-codex/gpt-5.4-mini`
- Pass 2 model: `openai-codex/gpt-5.4-mini`
- Request seed: `7`
- Request timeout ms: `180000`
- Max words per window: `1500`
- Chunk size: `2`
- Max concurrency: `1`
- Docs attempted: `2`
- Docs completed: `2`
- Docs failed: `0`
- Captured claims: `1`
- Ignored windows: `1`
- Rejected windows: `0`
- Write decisions: `{"write":7}`

## Invocation

```json
{
  "sources": [
    ".artifacts/model-memory/phase2-live-gateway-ui-model-owned-validation/20260430T175641911Z/fixtures/live-gateway-structured-doc-20260430T175641911Z.md",
    "memory/2026-04-30.md"
  ],
  "runId": "live-gateway-ui-doc-20260430T175641911Z",
  "recordPath": ".artifacts/model-memory/phase2-live-gateway-ui-model-owned-validation/20260430T175641911Z/document-ingestion-record.json",
  "chunkSize": 2,
  "maxConcurrency": 1,
  "resume": false,
  "modelId": "openai-codex/gpt-5.4-mini",
  "candidateModelId": "openai-codex/gpt-5.4-mini",
  "requestTimeoutMs": 180000,
  "requestSeed": 7,
  "maxWordsPerWindow": 1500
}
```

## Sources

| Source                                                                                                                                                  | Status    | Windows | Captured | Decisions     | Rejects |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------: | -------: | ------------- | ------- |
| `.artifacts/model-memory/phase2-live-gateway-ui-model-owned-validation/20260430T175641911Z/fixtures/live-gateway-structured-doc-20260430T175641911Z.md` | completed |       1 |        1 | `{"write":5}` |         |
| `memory/2026-04-30.md`                                                                                                                                  | completed |       1 |        0 | `{"write":2}` |         |

## Manual UI Steps

- Use the OpenClaw operator tool `model_memory_document_ingest`.
- Pass sources [".artifacts/model-memory/phase2-live-gateway-ui-model-owned-validation/20260430T175641911Z/fixtures/live-gateway-structured-doc-20260430T175641911Z.md", "memory/2026-04-30.md"].
- Keep chunkSize=2, maxConcurrency=1, resume=true, modelId=openai-codex/gpt-5.4-mini, candidateModelId=openai-codex/gpt-5.4-mini.
- After the run, inspect .artifacts/model-memory/phase2-live-gateway-ui-model-owned-validation/20260430T175641911Z/document-ingestion-record.json and the model-memory operator evidence surfaces for captured claims and write decisions.
