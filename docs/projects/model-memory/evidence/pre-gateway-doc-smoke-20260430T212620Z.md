# Pre-Gateway Document Ingestion Tool Smoke

- Tool: `model_memory_document_ingest`
- Run ID: `pre-gateway-doc-smoke-20260430T212620Z`
- Record path: `.artifacts/model-memory/pre-gateway-doc-smoke-20260430T212620Z/document-ingestion-record.json`
- Pass 1 model: `openai-codex/gpt-5.4-mini`
- Pass 2 model: `openai-codex/gpt-5.4-mini`
- Request seed: `7`
- Request timeout ms: `180000`
- Max words per window: `1500`
- Inline runtime rebuild: `false`
- Chunk size: `1`
- Max concurrency: `1`
- Docs attempted: `1`
- Docs completed: `1`
- Docs failed: `0`
- Captured claims: `4`
- Ignored windows: `1`
- Rejected windows: `0`
- Write decisions: `{"write":4}`

## Invocation

```json
{
  "sources": [
    ".artifacts/model-memory/phase2-live-gateway-ui-model-owned-validation/20260430T195228049Z/fixtures/live-gateway-structured-doc-20260430T195228049Z.md"
  ],
  "runId": "pre-gateway-doc-smoke-20260430T212620Z",
  "recordPath": ".artifacts/model-memory/pre-gateway-doc-smoke-20260430T212620Z/document-ingestion-record.json",
  "chunkSize": 1,
  "maxConcurrency": 1,
  "resume": false,
  "modelId": "openai-codex/gpt-5.4-mini",
  "candidateModelId": "openai-codex/gpt-5.4-mini",
  "requestTimeoutMs": 180000,
  "requestSeed": 7,
  "maxWordsPerWindow": 1500,
  "rebuildRuntime": false
}
```

## Sources

| Source                                                                                                                                                  | Status    | Windows | Captured | Decisions     | Rejects |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------: | -------: | ------------- | ------- |
| `.artifacts/model-memory/phase2-live-gateway-ui-model-owned-validation/20260430T195228049Z/fixtures/live-gateway-structured-doc-20260430T195228049Z.md` | completed |       1 |        4 | `{"write":4}` |         |

## Manual UI Steps

- Use the OpenClaw operator tool `model_memory_document_ingest`.
- Pass sources [".artifacts/model-memory/phase2-live-gateway-ui-model-owned-validation/20260430T195228049Z/fixtures/live-gateway-structured-doc-20260430T195228049Z.md"].
- Keep chunkSize=1, maxConcurrency=1, resume=true, modelId=openai-codex/gpt-5.4-mini, candidateModelId=openai-codex/gpt-5.4-mini.
- After the run, inspect .artifacts/model-memory/pre-gateway-doc-smoke-20260430T212620Z/document-ingestion-record.json and the model-memory operator evidence surfaces for captured claims and write decisions.
