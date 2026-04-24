---
summary: "Canonical pre-Phase-2 gate ledger for model-memory execution."
title: "Pre-Phase-2 Gate Ledger"
---

# Pre-Phase-2 Gate Ledger

This is the canonical blocking ledger for model-memory before Phase 2
graph/capsule/planner work begins.

Phase 2 was blocked until every `must_do` slice below was green.
As of the latest entry-pack rerun on `2026-04-24`, every `must_do` slice below
is green and Phase 2 is authorized.

## Current posture

- MMV2-native SQL remains the live semantic truth.
- Default user-facing memory reads are MMV2-native compatibility aliases.
- The regular agent/session model default remains `openai-codex/gpt-5.4`.
- Strict capture/ingest remains `openai-codex/gpt-5.4-mini`.
- The earlier wrong-pipe auth/model regression is resolved.
- Remaining mini work is bounded runtime validation, not model-lane rollback.

## Must Do Before Phase 2

### Slice 0 - Docs baseline and gate ledger

- align `CURRENT_SLICE`, `STATUS`, and `roadmap` to the actual remaining gates
- keep one canonical ledger for Phase-2 blockers, proof artifacts, and
  acceptance criteria
- remove stale wording that implies strict-mini auth/model is still unresolved

### Slice 1 - Ingestion closeout parity

- make closeout auto-emission mandatory on every active ingestion path
- finish remaining parity on:
  - bootstrap import
  - memory-file import
  - replay/inspection wrapper paths
  - any wrapper that still bypasses the terminal closeout stage

### Slice 2 - Per-candidate persistence isolation

State: `landed 2026-04-24`

- invalid candidates or edges no longer roll back valid siblings in the MMV2
  native persistence path
- proof now exists for:
  - ordinary-turn capture
  - tool-result capture
  - document ingest
  - imports
- repository-level tests also prove candidate-unit rollback and deferred-edge
  handling directly at the native persistence boundary

### Slice 3 - Retrieval miss diagnostics and MMV2-native read cleanup

- lock down `memory_existed_but_excluded`
- lock down `emptyRetrievalReason`
- classify exclusions at minimum for:
  - stale
  - superseded
  - conflicted
  - inactive
  - hash-invalid
- keep default user-facing reads MMV2-native
- keep legacy memory-core behavior compatibility-only

### Slice 4 - Traceability, SLOs, and DB baselines

State: `landed 2026-04-24`

- add one safe trace id across:
  - gateway turn
  - capture seam
  - capture job
  - model contract
  - DB write
  - dirty marker
  - rebuild/projection
  - retrieval pack
  - final context injection
- define SLOs and red/yellow/green thresholds
- add read-only `pg_stat_statements` baselines
- add read-only autovacuum/bloat/ANALYZE freshness checks
- canonical operator runbook:
  - [Pre-Phase-2 Ops Gates](/projects/model-memory/pre-phase-2-ops-gates)
- landed scope:
  - ordinary-turn and tool-result work now use the shared safe
    `memory_trace_*` contract across capture jobs, dirty-state events,
    closeout artifacts, retrieval request scope, retrieval packs, and
    retrieval/injection activity
  - pre-Phase-2 SLO definitions now exist with explicit blocker/warning
    classes and red/yellow/green thresholds
  - `scripts/model-memory-phase2-db-gates.ts` now emits a read-only operator
    report with DB lane/pool snapshots, `pg_stat_statements` query-family
    baselines, and maintenance-health classification for memory-critical
    tables

### Slice 5 - Recovery and restore proof

State: `landed 2026-04-24`

- strengthen crash/restart recovery tests for runtime-state spools
- prove backup/restore and reconcile for:
  - durable DB
  - capture jobs
  - dirty state
  - projection artifacts
  - provider scorecards
- canonical operator runbook:
  - [Pre-Phase-2 Recovery Gates](/projects/model-memory/pre-phase-2-recovery-gates)
- landed scope:
  - tolerant runtime-state readers now quarantine corrupt JSON/JSONL instead of
    collapsing capture jobs, runtime-dirty state, or provider scorecards
  - post-restore reconcile now classifies surfaces as `clean`,
    `replay_required`, `rebuild_required`, `blocked_busy`, or
    `quarantined_corrupt`
  - `scripts/model-memory-phase2-recovery-gates.ts` now emits a read-safe
    operator report for the memory-critical state inventory
  - isolated proof now covers operational backup/restore roundtrip and durable
    MMV2 DB restore via `pg-mem` snapshot/restore

### Slice 6 - Delegated-result propagation and post expansion integrity

State: `landed 2026-04-24`

- inserted after live operator evidence showed delegation/reporting trust was
  still not good enough for the final validation pack
- delegated-agent completion now has an explicit parent-session contract:
  - auto-surface the delegated result into the requester/main transcript, or
  - emit an explicit classified failure instead of silence
- `sessions_send` now accepts canonical session keys passed through `label`
  and resolves agent-id-only sends to canonical main-lane targets
- `chat.history` now preserves compact truncation metadata for tool-result
  messages
- UI tool-card expand/sidebar surfaces now distinguish:
  - truncated at source
  - truncated in history/transport
  - full content unavailable

### Slice 7 - Phase-2 entry validation pack

State: `landed green 2026-04-24`

- historical roots:
  - initial red pack:
    `.artifacts/model-memory/phase2-entry-validation/2026-04-24/`
  - intermediate reruns:
    `.artifacts/model-memory/phase2-entry-validation/2026-04-24-rerun-01/`
    `.artifacts/model-memory/phase2-entry-validation/2026-04-24-rerun-02/`
- latest authoritative green root:
  `.artifacts/model-memory/phase2-entry-validation/2026-04-24-rerun-03/`
- delivered proof surfaces:
  - controlled Phase-2 entry load test
  - retrieval quality evals independent of capture
  - no-dark-data adversarial checks
  - bounded live runtime validation
  - final operator decision report
- canonical operator runbook:
  - [Pre-Phase-2 Entry Validation](/projects/model-memory/pre-phase-2-entry-validation)
- blocker-clearance work that made the slice green:
  - reconciled orphaned live `runtime_dirty` state and proved recovery gates
    `clean`
  - enabled live `pg_stat_statements`
  - fixed MMV2 session-turn proof contract routing for the strict-mini
    ordinary-turn seed
  - hardened MMV2 atomic extraction to skip irreparable model-routed atomic
    repair output safely
  - fixed rebuild-lane self-deadlock during runtime rebuild
  - fixed the controlled-load retrieval harness
  - widened the projection live-behavior proof timeout so the full live pack
    could complete honestly
- latest decision: `green`
- latest supporting evidence:
  - baseline DB gates: `green`
  - baseline recovery gates: `green`
  - controlled load test: `green`
  - retrieval evals: `11/11`
  - no-dark-data adversarial pack: `4/4`
  - bounded live validation: `green`
- result:
  - no remaining pre-Phase-2 blocker slice remains
  - Phase 2 is authorized to begin

## Deferred To Phase 2

These are intentionally deferred unless a narrow subset is required to make a
blocking pre-Phase-2 slice trustworthy:

- prompt-cache optimization pass
- full contract registry hardening
- golden eval corpus
- provider scorecard gating as a full route policy system
- projection lifecycle hardening beyond the P0 proof bar
- runtime pack budget governance
- memory inspector UX/API
- broader correction workflow hardening
- formal retention-policy program
- broad CI guardrail expansion

## Phase-2 entry rule

Graph, capsule, hierarchical retrieval, planner, synthesis, and cache-policy
implementation were blocked until:

1. every `must_do` slice above is green
2. the proof artifacts are present and linked
3. the docs match the landed truth
4. remaining work is explicitly recorded as Phase-2 scope, not hidden debt

Current state:

- satisfied on `2026-04-24` by the green entry-pack rerun at
  `.artifacts/model-memory/phase2-entry-validation/2026-04-24-rerun-03/`
