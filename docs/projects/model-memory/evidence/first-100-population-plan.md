# Model Memory First-100 Population Plan

## Summary

- Generated at: 2026-04-14T21:25:38.838Z
- Requested limit: 100
- Selected sources: 100
- Total eligible sources: 221
- Chunk size: 10

## Ordering Notes

- Tier 1 preserves the exact declared single-document pilot order from the ingestion inventory.
- Tier 2 preserves the declared pack priority order: docs/projects/model-memory/specs, docs/help, docs/gateway, docs/reference/templates.
- Tier 2 de-duplicates files already selected in Tier 1 instead of re-ingesting them twice.
- Tier 3 fills the remainder only after Tier 2 is exhausted, using selected production code-and-doc packs from extensions/model-memory first and src/plugin-sdk only if still needed.
- Within each pack, file order is deterministic lexical order to keep chunk membership stable and inspectable.

## Chunks

### Chunk 1

- AGENTS.md
- docs/help/testing.md
- docs/gateway/configuration.md
- docs/gateway/protocol.md
- docs/projects/model-memory/specs/database-schema-v1.md
- docs/projects/model-memory/proof-corpus-plan.md
- docs/projects/model-memory/specs/architecture-overview.md
- docs/projects/model-memory/specs/context-engine.md
- docs/projects/model-memory/specs/identity-dedupe-supersession.md
- docs/projects/model-memory/specs/index.md

### Chunk 2

- docs/projects/model-memory/specs/observability-calibration.md
- docs/projects/model-memory/specs/ontology-schema.md
- docs/projects/model-memory/specs/prompt-contract.md
- docs/projects/model-memory/specs/proof-benchmark.md
- docs/projects/model-memory/specs/retrieval-context-injection.md
- docs/projects/model-memory/specs/review-write-policy.md
- docs/projects/model-memory/specs/runtime-integration-shadow-mode.md
- docs/projects/model-memory/specs/runtime-read-models-and-artifacts.md
- docs/projects/model-memory/specs/source-adapters.md
- docs/projects/model-memory/specs/storage-database.md

### Chunk 3

- docs/projects/model-memory/specs/usage-cache-ledger.md
- docs/projects/model-memory/specs/validation.md
- docs/projects/model-memory/specs/workspace-projections-bootstrap-files.md
- docs/help/debugging.md
- docs/help/environment.md
- docs/help/faq.md
- docs/help/index.md
- docs/help/scripts.md
- docs/help/troubleshooting.md
- docs/gateway/authentication.md

### Chunk 4

- docs/gateway/background-process.md
- docs/gateway/bonjour.md
- docs/gateway/bridge-protocol.md
- docs/gateway/cli-backends.md
- docs/gateway/configuration-examples.md
- docs/gateway/configuration-reference.md
- docs/gateway/discovery.md
- docs/gateway/doctor.md
- docs/gateway/gateway-lock.md
- docs/gateway/health.md

### Chunk 5

- docs/gateway/heartbeat.md
- docs/gateway/index.md
- docs/gateway/local-models.md
- docs/gateway/logging.md
- docs/gateway/multiple-gateways.md
- docs/gateway/network-model.md
- docs/gateway/openai-http-api.md
- docs/gateway/openresponses-http-api.md
- docs/gateway/pairing.md
- docs/gateway/remote-gateway-readme.md

### Chunk 6

- docs/gateway/remote.md
- docs/gateway/sandbox-vs-tool-policy-vs-elevated.md
- docs/gateway/sandboxing.md
- docs/gateway/secrets-plan-contract.md
- docs/gateway/secrets.md
- docs/gateway/security/index.md
- docs/gateway/tailscale.md
- docs/gateway/tools-invoke-http-api.md
- docs/gateway/troubleshooting.md
- docs/gateway/trusted-proxy-auth.md

### Chunk 7

- docs/reference/templates/AGENTS.dev.md
- docs/reference/templates/AGENTS.md
- docs/reference/templates/BOOT.md
- docs/reference/templates/BOOTSTRAP.md
- docs/reference/templates/HEARTBEAT.md
- docs/reference/templates/IDENTITY.dev.md
- docs/reference/templates/IDENTITY.md
- docs/reference/templates/SOUL.dev.md
- docs/reference/templates/SOUL.md
- docs/reference/templates/TOOLS.dev.md

### Chunk 8

- docs/reference/templates/TOOLS.md
- docs/reference/templates/USER.dev.md
- docs/reference/templates/USER.md
- extensions/model-memory/migrations/0001_model_memory_init.sql
- extensions/model-memory/migrations/0002_model_memory_support_items.sql
- extensions/model-memory/package.json
- extensions/model-memory/runtime-api.ts
- extensions/model-memory/src/admin/replay-service.ts
- extensions/model-memory/src/benchmark/benchmark-runner.ts
- extensions/model-memory/src/calibration-report.ts

### Chunk 9

- extensions/model-memory/src/context-engine.ts
- extensions/model-memory/src/daily-continuity-recovery.ts
- extensions/model-memory/src/db/canonical-repository.ts
- extensions/model-memory/src/db/database-memory-object-store.ts
- extensions/model-memory/src/db/database-retrieval-store.ts
- extensions/model-memory/src/db/migrations.ts
- extensions/model-memory/src/db/pg-runtime.ts
- extensions/model-memory/src/db/row-codecs.ts
- extensions/model-memory/src/db/runtime-context-repository.ts
- extensions/model-memory/src/db/sql-client.ts

### Chunk 10

- extensions/model-memory/src/deterministic-uuid.ts
- extensions/model-memory/src/document-ingestion.ts
- extensions/model-memory/src/index.ts
- extensions/model-memory/src/live-daily-continuity-recovery-service.ts
- extensions/model-memory/src/live-document-ingestion-service.ts
- extensions/model-memory/src/live-ordinary-turn-capture-service.ts
- extensions/model-memory/src/live-shadow-adapters.ts
- extensions/model-memory/src/memory-object-store.ts
- extensions/model-memory/src/model-execution.ts
- extensions/model-memory/src/openclaw-runtime-adapters.ts

## Ordered Sources

| Order | Chunk | Tier                             | Pack                             | Classification                         | Source                                                                    |
| ----- | ----- | -------------------------------- | -------------------------------- | -------------------------------------- | ------------------------------------------------------------------------- |
| 1     | 1     | tier1_single_document_pilot      | tier1                            | bootstrap_preservation_sensitive_input | AGENTS.md                                                                 |
| 2     | 1     | tier1_single_document_pilot      | tier1                            | primary_large_source_proof_input       | docs/help/testing.md                                                      |
| 3     | 1     | tier1_single_document_pilot      | tier1                            | primary_large_source_proof_input       | docs/gateway/configuration.md                                             |
| 4     | 1     | tier1_single_document_pilot      | tier1                            | primary_large_source_proof_input       | docs/gateway/protocol.md                                                  |
| 5     | 1     | tier1_single_document_pilot      | tier1                            | primary_large_source_proof_input       | docs/projects/model-memory/specs/database-schema-v1.md                    |
| 6     | 1     | tier1_single_document_pilot      | tier1                            | primary_large_source_proof_input       | docs/projects/model-memory/proof-corpus-plan.md                           |
| 7     | 1     | tier2_curated_repo_pack          | docs/projects/model-memory/specs | primary_large_source_proof_input       | docs/projects/model-memory/specs/architecture-overview.md                 |
| 8     | 1     | tier2_curated_repo_pack          | docs/projects/model-memory/specs | primary_large_source_proof_input       | docs/projects/model-memory/specs/context-engine.md                        |
| 9     | 1     | tier2_curated_repo_pack          | docs/projects/model-memory/specs | primary_large_source_proof_input       | docs/projects/model-memory/specs/identity-dedupe-supersession.md          |
| 10    | 1     | tier2_curated_repo_pack          | docs/projects/model-memory/specs | primary_large_source_proof_input       | docs/projects/model-memory/specs/index.md                                 |
| 11    | 2     | tier2_curated_repo_pack          | docs/projects/model-memory/specs | primary_large_source_proof_input       | docs/projects/model-memory/specs/observability-calibration.md             |
| 12    | 2     | tier2_curated_repo_pack          | docs/projects/model-memory/specs | primary_large_source_proof_input       | docs/projects/model-memory/specs/ontology-schema.md                       |
| 13    | 2     | tier2_curated_repo_pack          | docs/projects/model-memory/specs | primary_large_source_proof_input       | docs/projects/model-memory/specs/prompt-contract.md                       |
| 14    | 2     | tier2_curated_repo_pack          | docs/projects/model-memory/specs | primary_large_source_proof_input       | docs/projects/model-memory/specs/proof-benchmark.md                       |
| 15    | 2     | tier2_curated_repo_pack          | docs/projects/model-memory/specs | primary_large_source_proof_input       | docs/projects/model-memory/specs/retrieval-context-injection.md           |
| 16    | 2     | tier2_curated_repo_pack          | docs/projects/model-memory/specs | primary_large_source_proof_input       | docs/projects/model-memory/specs/review-write-policy.md                   |
| 17    | 2     | tier2_curated_repo_pack          | docs/projects/model-memory/specs | primary_large_source_proof_input       | docs/projects/model-memory/specs/runtime-integration-shadow-mode.md       |
| 18    | 2     | tier2_curated_repo_pack          | docs/projects/model-memory/specs | primary_large_source_proof_input       | docs/projects/model-memory/specs/runtime-read-models-and-artifacts.md     |
| 19    | 2     | tier2_curated_repo_pack          | docs/projects/model-memory/specs | primary_large_source_proof_input       | docs/projects/model-memory/specs/source-adapters.md                       |
| 20    | 2     | tier2_curated_repo_pack          | docs/projects/model-memory/specs | primary_large_source_proof_input       | docs/projects/model-memory/specs/storage-database.md                      |
| 21    | 3     | tier2_curated_repo_pack          | docs/projects/model-memory/specs | primary_large_source_proof_input       | docs/projects/model-memory/specs/usage-cache-ledger.md                    |
| 22    | 3     | tier2_curated_repo_pack          | docs/projects/model-memory/specs | primary_large_source_proof_input       | docs/projects/model-memory/specs/validation.md                            |
| 23    | 3     | tier2_curated_repo_pack          | docs/projects/model-memory/specs | primary_large_source_proof_input       | docs/projects/model-memory/specs/workspace-projections-bootstrap-files.md |
| 24    | 3     | tier2_curated_repo_pack          | docs/help                        | primary_large_source_proof_input       | docs/help/debugging.md                                                    |
| 25    | 3     | tier2_curated_repo_pack          | docs/help                        | primary_large_source_proof_input       | docs/help/environment.md                                                  |
| 26    | 3     | tier2_curated_repo_pack          | docs/help                        | primary_large_source_proof_input       | docs/help/faq.md                                                          |
| 27    | 3     | tier2_curated_repo_pack          | docs/help                        | primary_large_source_proof_input       | docs/help/index.md                                                        |
| 28    | 3     | tier2_curated_repo_pack          | docs/help                        | primary_large_source_proof_input       | docs/help/scripts.md                                                      |
| 29    | 3     | tier2_curated_repo_pack          | docs/help                        | primary_large_source_proof_input       | docs/help/troubleshooting.md                                              |
| 30    | 3     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/authentication.md                                            |
| 31    | 4     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/background-process.md                                        |
| 32    | 4     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/bonjour.md                                                   |
| 33    | 4     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/bridge-protocol.md                                           |
| 34    | 4     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/cli-backends.md                                              |
| 35    | 4     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/configuration-examples.md                                    |
| 36    | 4     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/configuration-reference.md                                   |
| 37    | 4     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/discovery.md                                                 |
| 38    | 4     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/doctor.md                                                    |
| 39    | 4     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/gateway-lock.md                                              |
| 40    | 4     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/health.md                                                    |
| 41    | 5     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/heartbeat.md                                                 |
| 42    | 5     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/index.md                                                     |
| 43    | 5     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/local-models.md                                              |
| 44    | 5     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/logging.md                                                   |
| 45    | 5     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/multiple-gateways.md                                         |
| 46    | 5     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/network-model.md                                             |
| 47    | 5     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/openai-http-api.md                                           |
| 48    | 5     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/openresponses-http-api.md                                    |
| 49    | 5     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/pairing.md                                                   |
| 50    | 5     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/remote-gateway-readme.md                                     |
| 51    | 6     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/remote.md                                                    |
| 52    | 6     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/sandbox-vs-tool-policy-vs-elevated.md                        |
| 53    | 6     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/sandboxing.md                                                |
| 54    | 6     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/secrets-plan-contract.md                                     |
| 55    | 6     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/secrets.md                                                   |
| 56    | 6     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/security/index.md                                            |
| 57    | 6     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/tailscale.md                                                 |
| 58    | 6     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/tools-invoke-http-api.md                                     |
| 59    | 6     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/troubleshooting.md                                           |
| 60    | 6     | tier2_curated_repo_pack          | docs/gateway                     | primary_large_source_proof_input       | docs/gateway/trusted-proxy-auth.md                                        |
| 61    | 7     | tier2_curated_repo_pack          | docs/reference/templates         | bootstrap_preservation_sensitive_input | docs/reference/templates/AGENTS.dev.md                                    |
| 62    | 7     | tier2_curated_repo_pack          | docs/reference/templates         | bootstrap_preservation_sensitive_input | docs/reference/templates/AGENTS.md                                        |
| 63    | 7     | tier2_curated_repo_pack          | docs/reference/templates         | bootstrap_preservation_sensitive_input | docs/reference/templates/BOOT.md                                          |
| 64    | 7     | tier2_curated_repo_pack          | docs/reference/templates         | bootstrap_preservation_sensitive_input | docs/reference/templates/BOOTSTRAP.md                                     |
| 65    | 7     | tier2_curated_repo_pack          | docs/reference/templates         | bootstrap_preservation_sensitive_input | docs/reference/templates/HEARTBEAT.md                                     |
| 66    | 7     | tier2_curated_repo_pack          | docs/reference/templates         | bootstrap_preservation_sensitive_input | docs/reference/templates/IDENTITY.dev.md                                  |
| 67    | 7     | tier2_curated_repo_pack          | docs/reference/templates         | bootstrap_preservation_sensitive_input | docs/reference/templates/IDENTITY.md                                      |
| 68    | 7     | tier2_curated_repo_pack          | docs/reference/templates         | bootstrap_preservation_sensitive_input | docs/reference/templates/SOUL.dev.md                                      |
| 69    | 7     | tier2_curated_repo_pack          | docs/reference/templates         | bootstrap_preservation_sensitive_input | docs/reference/templates/SOUL.md                                          |
| 70    | 7     | tier2_curated_repo_pack          | docs/reference/templates         | bootstrap_preservation_sensitive_input | docs/reference/templates/TOOLS.dev.md                                     |
| 71    | 8     | tier2_curated_repo_pack          | docs/reference/templates         | bootstrap_preservation_sensitive_input | docs/reference/templates/TOOLS.md                                         |
| 72    | 8     | tier2_curated_repo_pack          | docs/reference/templates         | bootstrap_preservation_sensitive_input | docs/reference/templates/USER.dev.md                                      |
| 73    | 8     | tier2_curated_repo_pack          | docs/reference/templates         | bootstrap_preservation_sensitive_input | docs/reference/templates/USER.md                                          |
| 74    | 8     | tier3_selected_code_and_doc_pack | extensions/model-memory          | primary_large_source_proof_input       | extensions/model-memory/migrations/0001_model_memory_init.sql             |
| 75    | 8     | tier3_selected_code_and_doc_pack | extensions/model-memory          | primary_large_source_proof_input       | extensions/model-memory/migrations/0002_model_memory_support_items.sql    |
| 76    | 8     | tier3_selected_code_and_doc_pack | extensions/model-memory          | primary_large_source_proof_input       | extensions/model-memory/package.json                                      |
| 77    | 8     | tier3_selected_code_and_doc_pack | extensions/model-memory          | primary_large_source_proof_input       | extensions/model-memory/runtime-api.ts                                    |
| 78    | 8     | tier3_selected_code_and_doc_pack | extensions/model-memory          | primary_large_source_proof_input       | extensions/model-memory/src/admin/replay-service.ts                       |
| 79    | 8     | tier3_selected_code_and_doc_pack | extensions/model-memory          | primary_large_source_proof_input       | extensions/model-memory/src/benchmark/benchmark-runner.ts                 |
| 80    | 8     | tier3_selected_code_and_doc_pack | extensions/model-memory          | primary_large_source_proof_input       | extensions/model-memory/src/calibration-report.ts                         |
| 81    | 9     | tier3_selected_code_and_doc_pack | extensions/model-memory          | primary_large_source_proof_input       | extensions/model-memory/src/context-engine.ts                             |
| 82    | 9     | tier3_selected_code_and_doc_pack | extensions/model-memory          | primary_large_source_proof_input       | extensions/model-memory/src/daily-continuity-recovery.ts                  |
| 83    | 9     | tier3_selected_code_and_doc_pack | extensions/model-memory          | primary_large_source_proof_input       | extensions/model-memory/src/db/canonical-repository.ts                    |
| 84    | 9     | tier3_selected_code_and_doc_pack | extensions/model-memory          | primary_large_source_proof_input       | extensions/model-memory/src/db/database-memory-object-store.ts            |
| 85    | 9     | tier3_selected_code_and_doc_pack | extensions/model-memory          | primary_large_source_proof_input       | extensions/model-memory/src/db/database-retrieval-store.ts                |
| 86    | 9     | tier3_selected_code_and_doc_pack | extensions/model-memory          | primary_large_source_proof_input       | extensions/model-memory/src/db/migrations.ts                              |
| 87    | 9     | tier3_selected_code_and_doc_pack | extensions/model-memory          | primary_large_source_proof_input       | extensions/model-memory/src/db/pg-runtime.ts                              |
| 88    | 9     | tier3_selected_code_and_doc_pack | extensions/model-memory          | primary_large_source_proof_input       | extensions/model-memory/src/db/row-codecs.ts                              |
| 89    | 9     | tier3_selected_code_and_doc_pack | extensions/model-memory          | primary_large_source_proof_input       | extensions/model-memory/src/db/runtime-context-repository.ts              |
| 90    | 9     | tier3_selected_code_and_doc_pack | extensions/model-memory          | primary_large_source_proof_input       | extensions/model-memory/src/db/sql-client.ts                              |
| 91    | 10    | tier3_selected_code_and_doc_pack | extensions/model-memory          | primary_large_source_proof_input       | extensions/model-memory/src/deterministic-uuid.ts                         |
| 92    | 10    | tier3_selected_code_and_doc_pack | extensions/model-memory          | primary_large_source_proof_input       | extensions/model-memory/src/document-ingestion.ts                         |
| 93    | 10    | tier3_selected_code_and_doc_pack | extensions/model-memory          | primary_large_source_proof_input       | extensions/model-memory/src/index.ts                                      |
| 94    | 10    | tier3_selected_code_and_doc_pack | extensions/model-memory          | primary_large_source_proof_input       | extensions/model-memory/src/live-daily-continuity-recovery-service.ts     |
| 95    | 10    | tier3_selected_code_and_doc_pack | extensions/model-memory          | primary_large_source_proof_input       | extensions/model-memory/src/live-document-ingestion-service.ts            |
| 96    | 10    | tier3_selected_code_and_doc_pack | extensions/model-memory          | primary_large_source_proof_input       | extensions/model-memory/src/live-ordinary-turn-capture-service.ts         |
| 97    | 10    | tier3_selected_code_and_doc_pack | extensions/model-memory          | primary_large_source_proof_input       | extensions/model-memory/src/live-shadow-adapters.ts                       |
| 98    | 10    | tier3_selected_code_and_doc_pack | extensions/model-memory          | primary_large_source_proof_input       | extensions/model-memory/src/memory-object-store.ts                        |
| 99    | 10    | tier3_selected_code_and_doc_pack | extensions/model-memory          | primary_large_source_proof_input       | extensions/model-memory/src/model-execution.ts                            |
| 100   | 10    | tier3_selected_code_and_doc_pack | extensions/model-memory          | primary_large_source_proof_input       | extensions/model-memory/src/openclaw-runtime-adapters.ts                  |
