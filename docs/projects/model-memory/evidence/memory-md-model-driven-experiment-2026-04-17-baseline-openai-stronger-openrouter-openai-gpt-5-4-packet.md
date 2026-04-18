# MEMORY.md

## Standing Context

- Default response style: keep answers terse, usually as short bullet points, and keep explanations high level unless deeper detail is requested.
- On a new session, use any runtime startup context first, then greet in the configured persona in 1–3 sentences and ask what the user wants to do.
- On session startup, read startup files in this order before responding: `SOUL.md`, then `USER.md`, then the dated memory file for today and yesterday (currently `memory/2026-04-17.md`).
- Semantic truth is anchored only in canonical memory objects; other layers are derived, operational, or observational.
- Build identity keys from normalized structured payloads rather than rendered statements. Normalization should include trimming, casefolding, whitespace collapse, Unicode normalization, and stable URL canonicalization where applicable.
- Build the new system in parallel while keeping runtime truth object-native.
- Treat broader workspace-refactor analysis as context only, not as an automatic mandate for structural churn.
- For weekly maintenance guard behavior, prefer canonical repo-owned control docs over legacy workspace-only copies.

## Current Priorities

- HEARTBEAT handling is operator-critical. Use the exact workspace file path `/home/node/.openclaw/workspace/HEARTBEAT.md` if it exists, follow it strictly, and do not read `docs/heartbeat.md`.
- When HEARTBEAT instructions are being followed, do not infer or repeat old tasks from prior chats.
- If HEARTBEAT indicates that nothing needs attention, reply exactly `HEARTBEAT_OK`.
- For the model-memory project, the Model Memory Spec Index defines the clean-room project specs before implementation code is written.
- Default evidence-lane model posture for model-memory is `openrouter/openai/gpt-5.4-nano` for both pass 1 and pass 2.
- In V1 live write paths, similarity search or thresholds must not become merge authority. No embedding-only merge, no similarity-threshold merge, no “close enough” merge logic, and no rendered-text-first merge authority.
- Allowed collision adjudication outcomes are: `attach_support`, `supersedes`, `distinct`, and `conflict_hold`.
- Required observability telemetry includes capture rate, ignore rate, audited false-positive rate, duplicate rate, supersession rate, retrieval request volume, retrieval candidate-set size, retrieval hit rate against audited cases, retrieval packing size, and distributions for canonical class, kind, confidence, review mode, contract name/version, and model version.
- Required artifacts include benchmark reports by prompt version and by model id; sampled write traces with provenance; shadow-mode comparison reports when shadow mode exists; and usage/cache ledger reports segmented by stable, semi-stable, and volatile hashes.

## Active Procedures

- HEARTBEAT procedure:
  - Check whether `/home/node/.openclaw/workspace/HEARTBEAT.md` exists.
  - If it exists, read it and follow its instructions strictly.
  - Use that exact path and exact case.
  - Do not read `docs/heartbeat.md`.
  - Do not infer or revive tasks from prior chats while handling HEARTBEAT.
  - If the file indicates nothing needs attention, reply exactly `HEARTBEAT_OK`.
- Session-start procedure:
  - Before the first normal response in a new session, read `SOUL.md`, then `USER.md`, then the dated memory file for today and yesterday.
  - Use any runtime-provided startup context first.
  - Then greet briefly in persona and ask what the user wants to do.
- Memory-system procedure guidance:
  - Treat canonical memory objects as the sole semantic source of truth.
  - Construct identity keys from normalized structured payloads, not rendered text.
  - Keep runtime truth object-native while building new system components in parallel.
- Maintenance/control-doc procedure:
  - When weekly maintenance guard logic depends on control documents, use the canonical repo-owned documents rather than legacy workspace-only copies.
