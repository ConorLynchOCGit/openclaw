# Document Ingestion Tool Smoke

- Tool: `model_memory_document_ingest`
- Run ID: `model-memory-tool-smoke`
- Record path: `checkpoints/model-memory/model-memory-tool-smoke.json`
- Pass 1 model: `openrouter/openai/gpt-5.4-nano`
- Pass 2 model: `openrouter/openai/gpt-5.4-nano`
- Request seed: `7`
- Request timeout ms: `180000`
- Max words per window: `1500`
- Chunk size: `2`
- Max concurrency: `1`
- Docs attempted: `2`
- Docs completed: `2`
- Docs failed: `0`
- Captured claims: `20`
- Ignored windows: `0`
- Rejected windows: `0`
- Write decisions: `{"write":20}`

## Sources

| Source                 | Status    | Windows | Captured | Decisions      |
| ---------------------- | --------- | ------: | -------: | -------------- |
| `AGENTS.md`            | completed |       3 |       14 | `{"write":14}` |
| `docs/help/testing.md` | completed |       2 |        6 | `{"write":6}`  |

## Notes

- The tool was resolved through the OpenClaw plugin registry and delegated to the clean-room document-ingestion runner/service.
- The stale `plugins.entries.memory-middleware` warning still surfaced during the smoke run. That remains explicit retirement debt and was not silently removed in this sprint.
