# Document Ingestion Tool Smoke

- Tool: `model_memory_document_ingest`
- Run ID: `probe-doc-1024`
- Record path: `.artifacts/tmp/probe-doc-1024.json`
- Pass 1 model: `openai-codex/gpt-5.4-mini`
- Pass 2 model: `openai-codex/gpt-5.4-mini`
- Request seed: `7`
- Request timeout ms: `180000`
- Max words per window: `1500`
- Chunk size: `2`
- Max concurrency: `1`
- Docs attempted: `1`
- Docs completed: `0`
- Docs failed: `1`
- Captured claims: `0`
- Ignored windows: `0`
- Rejected windows: `0`
- Write decisions: `{}`

## Invocation

```json
{
  "sources": [
    ".artifacts/model-memory/phase2-live-gateway-ui-model-owned-validation/20260430T163211654Z/fixtures/live-gateway-structured-doc-20260430T163211654Z.md"
  ],
  "runId": "probe-doc-1024",
  "recordPath": ".artifacts/tmp/probe-doc-1024.json",
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

| Source                                                                                                                                                  | Status | Windows | Captured | Decisions | Rejects |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------: | -------: | --------- | ------- |
| `.artifacts/model-memory/phase2-live-gateway-ui-model-owned-validation/20260430T163211654Z/fixtures/live-gateway-structured-doc-20260430T163211654Z.md` | failed |       0 |        0 | `{}`      |         |

## Manual UI Steps

- Use the OpenClaw operator tool `model_memory_document_ingest`.
- Pass sources [".artifacts/model-memory/phase2-live-gateway-ui-model-owned-validation/20260430T163211654Z/fixtures/live-gateway-structured-doc-20260430T163211654Z.md"].
- Keep chunkSize=2, maxConcurrency=1, resume=true, modelId=openai-codex/gpt-5.4-mini, candidateModelId=openai-codex/gpt-5.4-mini.
- After the run, inspect .artifacts/tmp/probe-doc-1024.json and the model-memory operator evidence surfaces for captured claims and write decisions.
