# MEMORY.md

## Standing Context

- The project is the clean-room `model-memory` effort, and the Model Memory Spec Index is the source of truth for project specs before implementation code is written.
- V1 safety rule: similarity search and thresholds must not become merge authority on the live write path. No embedding-only merge, no similarity-threshold merge, no “close enough” merge logic, and no rendered-text-first merge authority.
- Collision adjudication outcomes are constrained to four values: `attach_support`, `supersedes`, `distinct`, and `conflict_hold`.
- The storage model depends on strict identity and uniqueness constraints: `model_memory.sources` is unique on `(source_kind, source_fingerprint)`; `model_memory.source_windows` is unique on `(source_id, window_index)`; `model_memory.memory_objects` is unique on `identity_key`; and `model_memory.memory_support_items` is unique on `(memory_object_id, support_fingerprint)`.
- Runtime behavior is intended to stay uniform across supported source types after source adaptation; only the source envelope, chunking policy, and write-policy constraints should differ.
- Observability is a first-class requirement. The observability layer must capture operational metrics including capture/ignore/duplicate/supersession behavior, audited false-positive rate, retrieval volume and candidate-set size, retrieval hit rate against audited cases, retrieval packing size, and distributions over canonical class, kind, confidence, review mode, contract name/version, and model version.
- Required output artifacts include benchmark reports by prompt version and by model id, sampled write traces with provenance, shadow-mode comparison reports when shadow mode exists, and usage/cache ledger reports by stable, semi-stable, and volatile segment hashes.
- Keep explanations high level by default unless the current task asks for deeper implementation detail.

## Current Priorities

- Preserve live-write safety and determinism: rely on explicit identity/adjudication rules rather than similarity-based merge authority.
- Maintain replay-versus-live parity focus; the known remaining divergence is localized to `trace_match`.
- Keep `model-memory` as the active memory authority trajectory, consistent with the Phase 7 end state where legacy memory plugins, runtime hooks, docs, and deployed legacy state are removed after any needed export/snapshot.
- Retain and expose evidence for measured safety work: after Slice 23, core-claim/delta safety is implemented, with the measured-safe deterministic attach shape characterized by one dominant core-claim candidate with `packaging_only_drift`.
- Support operationalization of ingestion as a first-class surface; the Document Ingestion Runner Service is intended to promote batch document ingestion from proof-script behavior into a clean-room operational service.

## Active Procedures

- **HEARTBEAT startup check**
  - Check whether `/home/node/.openclaw/workspace/HEARTBEAT.md` exists.
  - If it exists, read that exact file and follow its instructions strictly.
  - Do not read `docs/heartbeat.md` instead, and do not infer or repeat old tasks from prior chats when HEARTBEAT is present.
- **No-attention response rule**
  - If `HEARTBEAT.md` indicates that nothing needs attention, reply exactly `HEARTBEAT_OK`.
- **Document-arbitration telemetry handling**
  - For document access instrumentation, record arbitration outcome, document identity fingerprint, whether cache bytes were reused, and whether ingest was skipped and why, including whether memory projection was emitted and why.
  - When available from `docs/projects/<id>/...`, the read tool writes `details.documentArbitration` fields including outcome, workspace-relative path, fingerprint, triggers, ingest status, run id, record path, and project id.
- **When producing reports or validating runs**
  - Ensure required telemetry and required artifacts are present, since benchmarking, provenance traces, shadow comparisons, and usage/cache ledgers are expected deliverables rather than optional extras.
