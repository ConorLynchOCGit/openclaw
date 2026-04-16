# Roadmap Document Ingestion Tool Smoke 2

- Tool: `model_memory_document_ingest`
- Run ID: `model-memory-roadmap-ui-smoke-2`
- Record path: `checkpoints/model-memory/model-memory-roadmap-ui-smoke-2.json`
- Pass 1 model: `openrouter/openai/gpt-5.4-nano`
- Pass 2 model: `openrouter/openai/gpt-5.4-nano`
- Request seed: `7`
- Request timeout ms: `180000`
- Max words per window: `1500`
- Chunk size: `1`
- Max concurrency: `1`
- Docs attempted: `1`
- Docs completed: `1`
- Docs failed: `0`
- Captured claims: `6`
- Ignored windows: `0`
- Rejected windows: `0`
- Write decisions: `{"write":6}`

## Invocation

```json
{
  "sources": ["docs/projects/model-memory/roadmap.md"],
  "runId": "model-memory-roadmap-ui-smoke-2",
  "recordPath": "checkpoints/model-memory/model-memory-roadmap-ui-smoke-2.json",
  "chunkSize": 1,
  "maxConcurrency": 1,
  "resume": true,
  "modelId": "openrouter/openai/gpt-5.4-nano",
  "candidateModelId": "openrouter/openai/gpt-5.4-nano",
  "requestTimeoutMs": 180000,
  "requestSeed": 7,
  "maxWordsPerWindow": 1500
}
```

## Sources

| Source                                  | Status    | Windows | Captured | Decisions     | Rejects |
| --------------------------------------- | --------- | ------: | -------: | ------------- | ------- |
| `docs/projects/model-memory/roadmap.md` | completed |       1 |        6 | `{"write":6}` |         |

## Manual UI Steps

- Use the OpenClaw operator tool `model_memory_document_ingest`.
- Pass sources ["docs/projects/model-memory/roadmap.md"].
- Keep chunkSize=1, maxConcurrency=1, resume=true, modelId=openrouter/openai/gpt-5.4-nano, candidateModelId=openrouter/openai/gpt-5.4-nano.
- After the run, inspect checkpoints/model-memory/model-memory-roadmap-ui-smoke-2.json and the model-memory operator evidence surfaces for captured claims and write decisions.
