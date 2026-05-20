---
summary: "Current slice for model-memory."
title: "Model Memory Current Slice"
---

# Current Slice

## 2026-05-16 Runtime Toolification Integration

Current Model Memory planning slice:
`execution-platform-runtime-toolification-integration`.

The next memory-adjacent convergence item is no longer another middleware-ref
proof. It should migrate memory capture, retrieval, context-pack insertion,
compaction, proactivity extraction/adjudication, and Work Queue projection
evidence onto Execution Platform runtime tools through staged memory-specific
tool protocols.

Execution Platform has landed Work Queue Generated Item Lifecycle And Proof
Child Cleanup before the next Product/Spec Planning live proof. Model Memory
toolification should use the same generated-item contract for proactivity
seeds, memory-review follow-ups, and any proof diagnostics so memory evidence
does not create stale active queue rows.

Target state:

- MMV2 remains semantic memory truth.
- runtime jobs remain execution lifecycle truth.
- runtime tools own bounded step traces.
- Work Queue owns projection, readback, and control.
- model-task and DB-operation middleware refs become compatibility facades or
  are retired from production-primary memory evidence.

2026-05-17 priority note:

- Router/front-door tool protocol, validation/QA toolification, and closeout
  finalization now sit before the Product/Spec Planning proof.
- Model Memory toolification sits after Product/Spec unless memory becomes the
  immediate proof objective.
- The Model Memory item should still be maximal when it runs: dense capture,
  retrieval/context, compaction, and proactivity should all be live-wired,
  model-reviewed, Work Queue-visible, and runtime-tool traced.

## 2026-05-09 Runtime Wiring Into Execution Platform

Current runtime slice: `execution-platform-memory-runtime-live-wiring`.

The Model Memory docs source of truth is the repo path
`docs/projects/model-memory`, not the partial workspace mirror.

This pass wired memory policy/readback into the current Execution Platform
runtime paths:

- `execution.submit` records bounded memory-policy decisions.
- route-aware context-pack assembly bounds legacy bootstrap insertion.
- Work Queue memory readback no longer reports ready with unknown expected
  substates.
- capture/proactivity evidence uses model-task and DB-operation refs in the
  memory-runtime proof path.
- rebuilt live gateway plus Tailscale safe-bridge UX soak passed hard no-raw
  storage and no-lifecycle-mutation gates.

Current active queue state:

- Skillifier Runtime Job Migration is complete as active-queue-08. Skillifier
  work now runs as `workflow.skillifier` / `executor.skillifier` through
  `worker.skillifier.runtime`, produces bounded candidate/edit proposal
  artifacts, and appears in Work Queue readback.
- The accepted proof created runtime job
  `active-queue-08-live-skillifier-mp1fr2yn-runtime-job`, model-task job
  `active-queue-08-live-skillifier-mp1fr2yn-model-task`, DB-operation job
  `active-queue-08-live-skillifier-mp1fr2yn-db-operation`, Work Queue item
  `active-queue-08-live-skillifier-mp1fr2yn-work-item`, and candidate
  `skillifier-candidate-26742351f3af276acedc99a59fb1ea5f`.
- Skill-file apply remains review-gated; the runtime creates candidate
  proposals, not invisible skill edits.
- The next Model Memory adjacent target in the active queue is active-queue-09:
  Proactivity Work Queue Quality Soak.

## 2026-05-09 Dense Capture And Context-Pack Hard Shutdown

Current runtime slice status: `completed`.

The latest pass made the memory quality proof stricter and more live:

- A dense owner-style prompt with 15+ likely durable memory candidates ran
  through the live Tailscale UX path on `agent:main:main`.
- Follow-up prompts proved newly captured memory recall and route-aware
  context-policy recall.
- Coding, web research, docs/skills, and QA/test workflow prompts ran through
  live UX/runtime with memory-aware context evidence.
- Model-authored reviewers passed dense capture quality and workflow
  retrieval/context quality using bounded prompt refs, output hashes, selected
  context-pack refs, and suppressed stale refs.
- The legacy-named retrieval overlay
  `src/agents/model-memory/live-runtime/retrieval-context.ts` is now hard-
  disabled outside tests or an explicit compatibility env flag. Production
  memory context exports use `route-aware-context-pack.ts`.
- Work Queue runtime controls are ON for owner-only production after a focused
  runtime-backed smoke.

No raw prompts, raw responses, transcripts, provider logs, tool logs, DB rows,
or secrets were stored in artifacts. Memory still cannot grant authority,
create lifecycle success, deploy, send outbound, promote models, or mutate
Work Queue lifecycle.

## 2026-04-24 Pre-Phase-2 Execution Lane

This slice records the completed pre-Phase-2 execution lane and the
authoritative entry decision that closed it.
The canonical blocker ledger is:

- [Pre-Phase-2 Gate Ledger](/projects/model-memory/pre-phase-2-gate-ledger)

Already landed in the active source tree:

- the shared ingestion funnel is no longer only a taxonomy; it now has
  artifact-safe closeout and candidate/edge quarantine report helpers that can
  consume telemetry, provider scorecards, integrity-audit references,
  dirty-state scheduling results, and capture-job ids without persisting raw
  prompts, transcripts, tool logs, secrets, or unbounded source text
- retrieval telemetry now records explicit empty-retrieval reasons, ranking
  feature summaries, hash-invalid projection exclusions, selected projection
  ids, backing active MMV2 memory ids, and `memory_existed_but_excluded`
  diagnostics while keeping ranking read-time only
- legacy/fallback posture is narrower and more explicit:
  plugin loader assumptions, status/doctor/config surfaces, QA/runtime/SDK/docs
  exports, and session-memory continuity are compatibility debt, not normal
  MMV2 truth; `memory_search` / `memory_get` now route to MMV2-native
  compatibility aliases by default and only restore true legacy memory-core
  behavior behind `MODEL_MEMORY_LEGACY_MEMORY_TOOLS_ENABLED=true`
- strict capture/ingest still defaults to `openai-codex/gpt-5.4-mini`; the
  earlier wrong-pipe auth/model regression is fixed, and the remaining work is
  bounded runtime validation on the corrected mini lane rather than fallback to
  another default model
- skill status now reports persisted warm-session skill snapshots when present,
  including current/stale hot-load state; true in-memory state still depends on
  the runner persisting an up-to-date session snapshot
- hash-gated import now emits the same closeout artifact family as the other
  active ingestion paths, and replay wrappers now emit explicit
  `capture_replay_inspection` closeout artifacts instead of relying only on the
  underlying capture/document service path
- retrieval miss classification now distinguishes explicit suppression classes
  such as stale, superseded, conflicted, inactive, hash-invalid, scope-only,
  budget-only, and privacy-only misses instead of collapsing them into generic
  empty retrieval buckets
- per-candidate persistence isolation is now proven across the required
  families: repository core, ordinary-turn entrypoint, tool-result capture,
  document ingest, and imports all preserve valid siblings, defer invalid
  candidates safely, and defer invalid edges without burning the rest of the
  batch
- a shared safe trace-id contract now follows ordinary-turn and tool-result
  work across capture job state, closeout artifacts, runtime-dirty events,
  retrieval request scope, retrieval packs, and retrieval/injection activity
  without persisting raw prompts, raw transcripts, or raw tool output
- the new operator DB-gates report now exposes pre-Phase-2 SLO definitions,
  `pg_stat_statements` query-family baselines, DB lane/pool snapshots, and
  read-only maintenance health for memory-critical tables through
  `scripts/model-memory-phase2-db-gates.ts`
- crash/restart recovery is now hardened for the critical runtime-state
  spools: capture jobs, runtime-dirty state, and provider scorecards now
  tolerate corrupt JSON / truncated JSONL by quarantining bad artifacts
  instead of collapsing the whole subsystem
- post-restore reconcile now classifies memory-critical surfaces as `clean`,
  `replay_required`, `rebuild_required`, `blocked_busy`, or
  `quarantined_corrupt`, with a read-safe operator report at
  `scripts/model-memory-phase2-recovery-gates.ts`
- isolated proof now covers operational backup/restore roundtrip for
  file-backed state plus durable MMV2 DB restore via `pg-mem`
  snapshot/restore without contaminating live semantic truth
- delegated-agent result propagation and long-post expansion are now hardened
  enough for the final pre-Phase-2 validation pack:
  - `sessions_send` now accepts canonical session keys passed through `label`
    and also resolves agent-id-only sends to the canonical main lane
  - completed delegated runs now surface a durable requester-session message
    through `chat.inject` or an explicit classified failure instead of
    silently disappearing
  - `chat.history` now preserves compact tool-result truncation metadata, and
    UI tool cards explicitly say when full content is unavailable instead of
    implying that local expand can recover missing text
- the blocker-clearance rerun lane is now landed:
  - live `runtime_dirty` orphaned rebuild state now reconciles safely through
    `scripts/model-memory-runtime-dirty-reconcile.ts`, and the live recovery
    gate now reports `clean`
  - live PostgreSQL now has `pg_stat_statements` enabled, and the DB gate
    report now exposes real query-family baselines instead of `not_installed`
  - the controlled ordinary-turn seed no longer fails on the old strict-mini
    contract mismatch:
    - session-turn proof now routes MMV2 contracts through the MMV2 raw-JSON
      interpreter path
    - MMV2 atomic extraction now skips model-routed atomic candidates safely if
      repair output remains semantically invalid instead of crashing the whole
      ordinary-turn capture
  - the controlled load retrieval lane no longer deadlocks under rebuild
    pressure:
    - runtime rebuild now reuses the transaction-bound SQL client for canonical
      reads, avoiding self-deadlock on the single rebuild lane
    - the load harness now tests retrieval against the served runtime instead
      of forcing a rebuild inside each retrieval iteration
  - the final pre-Phase-2 entry validation pack rerun is now green at:
    `.artifacts/model-memory/phase2-entry-validation/2026-04-24-rerun-03/`
    - controlled load test: `green`
    - retrieval-quality evals: `11/11`
    - no-dark-data adversarial checks: `4/4`
    - bounded live validation: `green`
    - final decision: `green`
    - Phase 2 is now authorized to begin

## Slice

`phase-2-entry-authorized`

## Goal

Use the accepted `SOAKQUAR-2026-04-21` clean soak, accepted runtime-boundary
proof, committed runtime-hardening landing at `ee0c093c1a`, the
`SOAKLAND-2026-04-22` hardening proof, and the green final entry pack at
`.artifacts/model-memory/phase2-entry-validation/2026-04-24-rerun-03/` as the
current regression baselines. The explicit pre-Phase-2 gate sequence is now
complete. The active lane moves to Phase 2 implementation while preserving the
landed MMV2-native guardrails and without reintroducing semantic forests, fuzzy
write-path correction, root workspace-file write-back, or raw-data capture.

The accepted runtime-boundary proof rooted at
`.artifacts/model-memory/runtime-boundary/2026-04-21-hook-projection-proof/`
is now the baseline for projection materialization and production hook probe
evidence.

The active slice is no longer the old v1 cutover, five-kind storage, or
packet-only/kind-balance lane. Those records remain useful history, but the
current implementation authority is MMV2-native durable truth.

The 2026-04-22 document ingest was resumed through the canonical MMV2 runner
and is currently stopped for ingestion-funnel hardening, not because the
document corpus should be abandoned.
The checkpoint is
`checkpoints/model-memory/model-memory-deep-pass-2026-04-22b.json` with 200
completed, 79 failed, 24 pending, and one stale `running` source marker after
operator interruption. No runner process is active. The dominant failure
classes are provider missing-text responses, prior OpenRouter 402 credit
exhaustion, extraction/repair validation failures, JSON-boundary failures, and
one DB edge foreign-key failure. This must not be worked around with semantic
forests, topic heuristics, fuzzy write-path correction, or legacy collision
fallback.

Ingestion-funnel hardening is now implemented for provider health preflight,
strict missing-text retry caps, optional alternate model/provider fallback,
adaptive large-source splitting for fresh runs, failed-source quarantine
reports, class-filtered failed-source retry, progress/cost telemetry, and
FK-safe memory-edge deferral. The corpus should still be resumed only after
provider credits are confirmed and the operator intentionally chooses the fixed
failure classes to retry.

The 2026-04-22 hardening landing proof is rooted at
`.artifacts/model-memory/soak-ui-validation/2026-04-22-hardening-land-soak/`.
The first correction attempt hit a live capture DB timeout and is recorded as a
runtime availability caveat. The affected item was rerun in isolation as
`SOAKLAND-2026-04-22-CORRECTION-RERUN`; it created correction memory
`7b3811fb-9613-5443-bc73-dd6799f893f1`, event
`9eb0cc1c-aa6a-54cc-8de4-4e7c8e42cb77`, and supersession edge
`0da10fcc-b5a7-5962-9d69-982d748755d6` to exact target memory
`231bd0a5-2f7c-5f65-af75-397668a2e960`.

The 2026-04-22 current-runtime partial-corpus proof/soak pass intentionally ran
without resuming document ingest. It freed disk first, proved retrieval against
the already-ingested partial corpus, materialized rich projection catalog pages,
and refreshed capture seam/Memory Ops evidence. The final soak is honestly
classified as `not_clean`: the UI prompts completed and no-store/privacy rows
did not leak, but ordinary-turn durable capture did not create new memory rows
because the live capture path hit DB connection/statement timeouts.

The active follow-up slice is mechanical capture/ingest hardening, not a
semantic-quality pass. It addresses the timeout evidence by making live capture
observable as structured jobs, stopping ordinary-turn capture from rebuilding
runtime state synchronously, using scoped reconciliation summaries, hardening
edge endpoint validation, adding DB pool/schema/cache observability knobs, and
redacting ordinary-turn source windows before persistence. Document ingest
remains paused during this work.

The remaining mechanical work is split into passes in
`docs/projects/model-memory/specs/capture-ingest-mechanical-hardening.md`.
Pass 1 durable capture jobs is implemented with no DB migration: ordinary-turn
capture now writes safe file-backed job snapshots/events under the OpenClaw
state dir, uses bounded worker concurrency, schedules bounded retries for
retryable provider/connection/timeout classes, exposes safe activity events,
and keeps replay as inspection-only metadata. Pass 2 durable dirty state and
coalesced rebuild scheduling is implemented in source with no DB migration:
runtime/projection dirty state is stored as safe runtime-state JSON/JSONL under
the OpenClaw state dir, ordinary/tool capture mark dirty instead of rebuilding
synchronously, and rebuild scheduling is coalesced by write count or elapsed
time.

Passes 3-5 are now implemented and live-picked-up without a DB migration:

- DB pool pressure has explicit lane telemetry and priority control so
  retrieval remains highest priority while capture and rebuild can defer under
  pressure.
- live persistence batches durable memories, events, and edges where safe,
  preserves idempotency, defers invalid candidates/edges with safe reports, and
  exposes non-mutating integrity audit output.
- provider/schema preflight now exercises actual strict-schema contracts for
  capture routing, extraction, canonicalization, and retrieval interpretation,
  and provider scorecards record safe schema/latency/token/cache metrics.

The 2026-04-23 live pre-Phase-2 pass completed the previously missing
operator-approved proof and measured Pass 6 with real provider/model calls:

- cache-aware live mini/nano benchmark:
  `.artifacts/model-memory/pass6-live-benchmark/2026-04-23/benchmark-report.json`
  ran 72 real calls, three runs per model/case, with benchmark/eval output
  kept artifact-only and out of the live durable-memory DB
- `openai-codex/gpt-5.4-mini` completed all 36 calls with strict-schema
  adherence `1.0`, p50 latency about `4425ms`, p95 about `7963ms`, no empty
  responses, valid-candidate rate about `0.944`, and no provider failure
  classes; the Codex app-server path did not expose token/cache usage
- configured nano route `openrouter/openai/gpt-5.4-nano` returned
  `provider_json_boundary` for all 36 strict-schema calls in this environment,
  so nano remains blocked until the configured provider route supports the
  required strict structured-output contracts
- large-document compression against
  `docs/projects/model-memory/DECISIONS.md` is recorded at
  `.artifacts/model-memory/large-doc-compression/2026-04-23/large-doc-compression.json`;
  section-map plus candidate hints is the preferred strategy because it
  admitted six source-validated candidates with zero evidence-validation
  failures and lower latency than direct rigid capture
- active capture seams are proven at
  `.artifacts/model-memory/capture-seams/2026-04-23/capture-seams-live-proof.json`
  for `message:preprocessed`, `ContextEngine.ingest`,
  `ContextEngine.ingestBatch`, `tool_result_persist`, `after_tool_call`,
  `ContextEngine.afterTurn`, `agent_end`, `agent:bootstrap`, and
  `memory_file_import`; `message:received` and `message:transcribed` remain
  fallback-only
- hash-gated bootstrap/memory-file import is implemented as a no-migration
  runtime-state import surface with changed-hash import, unchanged-hash skip,
  safe provenance, and no raw generated root write-back
- all ten projection types have rich materialized renderers and live
  projection-backed behavior proof at
  `.artifacts/model-memory/projection-live-behavior/2026-04-23/projection-live-behavior-proof.json`
- Memory Ops Safe Level 1 auto-fixes now run as operational artifact/job/state
  actions through `scripts/run-memory-ops-closed-loop.mjs`; semantic truth
  mutations still produce operator approval tickets instead of auto-fix
- live `MEMMECH-LIVE-2026-04-23` proof is rooted at
  `.artifacts/model-memory/memmech-proof/2026-04-23-live/` and includes a
  `capture_written` event plus durable rows for the single operator-approved
  long-term workspace project fact

The approved live proof reused only the operator-approved durable payload.
It did not write benchmark/eval/proof/file-pack artifacts to the live
durable-memory DB. A historical duplicate failed capture job from the
pre-idempotency proof rerun remains disclosed in the MEMMECH artifact as
non-blocking runtime-state history; the capture job runner now returns an
already-written job idempotently instead of regressing it to queued/failed.

The 2026-04-23 Main UX audit follow-up is an operational hardening slice on top
of that proof:

- the runtime-dirty spool ownership was narrowed so gateway UID `1000` can
  write `$OPENCLAW_STATE_DIR/model-memory/runtime-dirty/` again; the fix did
  not touch durable memory tables or root memory files
- dirty-state persistence/permission failures are classified as
  `runtime_dirty_persistence` or `permission` instead of generic `other`, with
  safe `runtime_dirty` failure-stage metadata on capture jobs
- ordinary-turn routing/extraction now admits general operational preferences
  and directives about assistant blocker handling, tool/schema discovery,
  continuation, and safe escalation without exact prompt/topic parsing
- bounded tool-result proof capture now preserves operational blocker facts
  such as host-operator schema failures, read-only paths, dirty-state EACCES,
  and pool pressure as safe summaries only
- strict MMV2 capture/ingest now defaults to
  `openai-codex/gpt-5.4-mini`; nano remains explicit opt-in for low-risk,
  non-admission or benchmark lanes
- large document ingest strategy selection defaults to `auto`: direct rigid
  capture for small docs and `section_map_candidate_hints` above the large-doc
  threshold, with hint output treated as non-canonical and original-source
  validation required before rigid MMV2 admission
- a five-document artifact-only section-map benchmark is recorded at
  `.artifacts/model-memory/large-doc-section-map/2026-04-23-live-audit/summary.json`;
  it found useful validated candidates but had evidence-validation failures on
  two sources, so section-map remains controlled/validated large-doc mode and
  is not yet declared broadly default-safe
- skill-vetting reports default to the writable operator workspace reports
  tree instead of the read-only product import mirror

The next remaining pre-Phase-2 blocker is now:

- Slice 6 Phase-2 entry validation pack
- host-operator skill install validation is more discoverable, supports
  validate-only, and gateway tool-failure logging redacts raw parameter values
  and skill content
- `openclaw agents skills-status --agent <id> --json` now distinguishes
  installed/discovered skills from unavailable warm-session loaded-state
  introspection

## Current Outcome

- MMV2-native SQL storage is live semantic truth:
  - `model_memory.ingest_sources`
  - `model_memory.ingest_segments`
  - `model_memory.durable_memories`
  - `model_memory.memory_events`
  - `model_memory.memory_edges`
- active live write hot paths now persist MMV2 live memory batches by default
- active runtime rebuild paths now consume MMV2 durable truth through native
  runtime records by default
- `SOAKQUAR-2026-04-21` is accepted as the first clean MMV2
  retrieval-runtime soak baseline
- the accepted artifact root is
  `.artifacts/model-memory/soak-ui-validation/2026-04-21-semantic-quarantine-soak/`
- accepted durable proof includes:
  - preference memory `992ee8e3-ce78-518f-87fa-defcb9457404`
  - directive memory `9f681bb4-0524-5972-8f2f-2e247b46d8b4`
  - project fact memory `4720dede-c33d-5c5e-835e-7e1be6d3445d`
  - structural correction memory `e64c1528-d6c2-52b3-8674-38172dc4604a`
  - supersession edge `fa9a259f-330b-5f06-bf11-79f62a0ffe47`
- accepted fresh recall proof includes retrieval request
  `c9d9c67c-410a-5729-a02e-e5cf0a761b8e` and retrieval-pack evidence that
  selected fresh soak MMV2 ids rather than same-session transcript or root
  workspace files
- rollback image tag for the accepted baseline:
  `openclaw:rollback-memory-soak-20260421T175907Z`
- Memory Ops latest report stayed observe/report-only with auto-fix disabled
  and no raw prompt/transcript/tool-log/private phrase leakage
- root `USER.md` and root `MEMORY.md` stayed unchanged during ordinary UI
  soak prompts
- accepted runtime-boundary proof:
  - projection artifacts materialize under
    `/root/.openclaw/workspace/.openclaw/model-memory/projections/`
  - runtime projection versions and physical artifacts match by content hash
  - root write-back remains disabled for `USER.md` and `MEMORY.md`
  - production-verified hook evidence exists for `message:preprocessed`,
    `ContextEngine.assemble`, `tool_result_persist`, `after_tool_call`,
    `agent_end`, and `ContextEngine.afterTurn`
  - `ContextEngine.ingest` and `ContextEngine.ingestBatch` were previously
    synthetic-only and need real production verification before capture wiring
- post-soak hardening has started:
  - default Retrieval Runtime/read-model code now has a static regression test
    proving it does not import legacy semantic-family/collision modules
  - the projection registry now enumerates the full v1 projection catalog:
    `user_profile_page`, `project_page`, `procedure_page`, `source_page`,
    `decision_log`, `timeline_page`, `entity_page`, `dashboard`,
    `agent_digest`, and `projection_digest`
  - projection digests now carry active source memory ids, source event ids
    when available, content hashes, freshness, stale markers, conflict
    markers, and artifact paths without writing generated output to root
    `USER.md` or `MEMORY.md`
  - retrieval packs now emit selected ids, excluded ids, exclusion reasons,
    stale/superseded/conflict filtering counts, empty-retrieval state, and
    token estimates through structured pack/run telemetry
- hook capture eligibility is now based on production runtime evidence, not
  static registration or synthetic canaries
- bounded tool-result proof/capture and capture seam infrastructure are landed
  and must remain bounded to artifact paths, file counts, command status,
  docs/runbooks, URLs, and non-sensitive error classes
- bounded live memory activity feed has been added behind
  `MODEL_MEMORY_ACTIVITY_FEED_ENABLED`; when enabled it mirrors retrieval and
  capture lifecycle ids/counts into the main feed without raw prompt,
  transcript, or tool-log content
- 2026-04-22 hardening landing proof:
  - gateway was rebuilt/recreated for activity-feed pickup and returned
    healthy
  - fallback captured-object writes are explicit-fallback-only by default
  - an additional document-ingest collision fallback import was quarantined
    behind the same explicit rollback flag
  - tool-result dedupe was fixed so non-durable tool turns do not also create
    duplicate ordinary-turn memories
  - structural correction passed on rerun with exact memory-id targeting
  - latest projection versions include the fresh correction, directive, and
    project-fact ids as source ids
  - recall proof has projection-backed evidence for the fresh ids; one recall
    turn also logged a retrieval-context timeout, so future work should keep
    improving live retrieval availability/diagnostics instead of treating file
    context alone as proof
  - Memory Ops observe-only scan stayed clean, auto-fix disabled, with no
    raw prompt/transcript/tool-log/private phrase leakage
- post-landing verification for `POSTLAND-2026-04-22` is recorded under
  `.artifacts/model-memory/post-landing/2026-04-22-verification-baseline/`
- the fresh curated deep-ingest corpus for `2026-04-22` contains 304 sources
  and is recorded under
  `.artifacts/model-memory/document-ingest/2026-04-22-corpus/`
- the MMV2 deep-ingest operator skill is installed in both repo-local OpenClaw
  skills and Codex global skills as `model-memory-deep-ingest`
- 2026-04-22 QoL/runtime work is active in the live gateway:
  - long assistant responses keep full text separate from compact preview
  - the feed exposes full/open/copy/export actions for long responses
  - queued prompts remain visible inline and transition to running
  - memory activity is rendered as bounded metadata/timeline chips instead of
    ordinary assistant transcript bubbles
  - `resolve_openclaw_path` is available to prevent duplicate canonical-path
    mistakes
  - host-operator remains a scoped/audited design posture, not blanket Main
    host access
- legacy compatibility remains only as soak-window fallback:
  - legacy-shaped captured-object write compatibility
  - legacy-style read projection compatibility at edges where still needed
  - storage engine fallback for rollback posture
- old v1 spec closure material is historical authority only
- MMV2 proof/file-pack artifacts remain evaluation-only and do not write to the
  live durable-memory DB
- 2026-04-22 shared ingestion-funnel hardening pass has started:
  - shared failure taxonomy and telemetry contracts now cover document ingest,
    ordinary-turn capture, tool-result capture, daily recovery, bootstrap
    import, and future heartbeat/proactive capture
  - document-ingest runner failure classification now delegates to the shared
    taxonomy instead of carrying a runner-only class list
  - live document, ordinary-turn, daily-recovery, and tool-result capture
    surfaces now return bounded ingestion telemetry with ids/counts only
  - provider JSON execution traces now hash prompt message content and record
    bounded usage/finish metadata instead of raw prompt bodies
  - capture routing now deterministically routes temp/no-store/privacy signals
    before model routing and skips capture safely when routing repair output is
    malformed
  - memory-edge endpoint validation now uses the shared persistence boundary
    helper before writing FK-backed edges
- 2026-04-22 follow-on memory architecture pass:
  - fixed the scripted proof-runner canonical-candidate blocker by preserving
    single-batch extraction candidate ids and reserving batch prefixes for
    true multi-batch collision protection
  - expanded ordinary-turn proof coverage from 7 to 11 adjudicated cases:
    preference, directive, project fact, structural correction, temp/privacy
    rejects, workspace scope, duplicate prevention, source-ref merge, scoped
    conflict, and near-source-ref conflict/no-fuzzy regression
  - hardened capture-seam tests so every declared seam remains
    default-disabled behind global plus seam-specific kill switches
  - refreshed the failed-source quarantine report in report-only mode without
    resuming ingest
- 2026-04-22 current-runtime partial-corpus pass:
  - aggressively cleaned disk while preserving DB volumes, current gateway
    image, accepted rollback images, live runtime state, root workspace memory
    files, and the repo worktree
  - Docker build cache was reduced from about `222.8GB` to `0B`; root disk
    usage dropped from about `274GB used` to about `89GB used`
  - partial-corpus retrieval/projection proof is recorded at
    `.artifacts/model-memory/current-runtime-partial-corpus/2026-04-22/partial-corpus-retrieval-proof.json`
    and selected all five expected durable MMV2 document memories using an
    in-memory retrieval run with query hashes rather than raw query text
  - rich projection catalog materialization proof is recorded at
    `.artifacts/model-memory/current-runtime-partial-corpus/2026-04-22/rich-projection-materialization-proof.json`
    and materialized all ten projection types under the projection artifact
    directory only
  - fresh capture seam proof is recorded at
    `.artifacts/model-memory/current-runtime-partial-corpus/2026-04-22/capture-seam-runtime-proof.json`
    and confirms production-runtime evidence for `message:preprocessed`,
    `ContextEngine.assemble`, `tool_result_persist`, `after_tool_call`,
    `ContextEngine.afterTurn`, `ContextEngine.ingestBatch`,
    `ContextEngine.ingest`, and `agent_end`
  - storage compatibility now derives fallback identity structurally from the
    MMV2 durable record instead of importing legacy `semantic-identity.ts`
  - final current-runtime partial-corpus soak evidence is recorded at
    `.artifacts/model-memory/final-current-runtime-soak/2026-04-22-partial-corpus/soak-report.json`
    and is `not_clean` because durable ordinary-turn capture produced no new
    DB rows during the soak
- 2026-04-22 mechanical capture/ingest hardening pass:
  - Pass 1 durable capture jobs now persist safe job snapshots and JSONL events
    under `$OPENCLAW_STATE_DIR/model-memory/capture-jobs/` outside the semantic
    durable-memory DB; no migration was added
  - ordinary-turn completed-turn capture routes through a `MemoryCaptureJob`
    abstraction with safe hashes, ids, status, failure class, retry count,
    model/provider labels, and timestamps only
  - the capture job worker is bounded by `MODEL_MEMORY_CAPTURE_JOB_CONCURRENCY`
    and retries only `provider_empty_response`, `provider_connection`, and
    `timeout` within `MODEL_MEMORY_CAPTURE_JOB_MAX_RETRIES`
  - replay requests are durable inspection events only and cannot replay raw
    prompts, transcripts, assistant turns, or raw tool logs
  - activity feed support now includes `capture_retry_scheduled` and
    `capture_replay_requested`
  - ordinary-turn live capture emits safe structured job events:
    `capture_queued`, `capture_started`, `capture_skipped`,
    `capture_written`, `capture_failed`, `capture_retry_scheduled`,
    `capture_replay_requested`, `runtime_dirty_marked`,
    `runtime_rebuild_deferred`, `runtime_rebuild_scheduled`,
    `runtime_rebuild_started`, `runtime_rebuild_completed`,
    `runtime_rebuild_failed`, `runtime_rebuild_skipped_lock_busy`,
    `runtime_rebuild_coalesced`, `runtime_dirty_cleared`, and
    `runtime_rebuild_admin_requested`
  - user-visible turns remain non-blocking, but capture failures are now
    classed through the shared ingestion taxonomy instead of only warning logs
  - ordinary-turn and bounded tool-result capture no longer request synchronous
    runtime rebuild by default; they mark durable/semi-durable dirty state for
    deferred or coalesced rebuild
  - dirty snapshots/events live outside semantic durable memory at
    `$OPENCLAW_STATE_DIR/model-memory/runtime-dirty/state.json` and
    `$OPENCLAW_STATE_DIR/model-memory/runtime-dirty/events.jsonl`
  - rebuild scheduling is controlled by
    `MODEL_MEMORY_RUNTIME_REBUILD_ENABLED`,
    `MODEL_MEMORY_RUNTIME_REBUILD_COALESCE_WRITES`,
    `MODEL_MEMORY_RUNTIME_REBUILD_COALESCE_MS`,
    `MODEL_MEMORY_RUNTIME_REBUILD_MAX_CONCURRENCY`,
    `MODEL_MEMORY_RUNTIME_REBUILD_RETRY_DELAY_MS`, and
    `MODEL_MEMORY_RUNTIME_REBUILD_MAX_RETRIES`
  - rebuild locking defaults to `pg_try_advisory_xact_lock` and can be rolled
    back to blocking lock behavior with
    `MODEL_MEMORY_REBUILD_BLOCKING_LOCK_ENABLED=true`
  - reconciliation neighbors for ordinary capture use scoped projected
    summaries by default instead of decoding all durable memory rows
  - live batch edge endpoint validation now uses one batched endpoint lookup
    before FK-backed edge writes
  - DB pool sizing/timeouts are configurable through
    `MODEL_MEMORY_DB_POOL_MAX`,
    `MODEL_MEMORY_DB_POOL_CONNECTION_TIMEOUT_MS`, and
    `MODEL_MEMORY_DB_POOL_IDLE_TIMEOUT_MS`
  - provider preflight now has an exact-contract strict-schema path in
    addition to generic JSON health checks
  - model-call traces include safe prompt-cache metadata, prefix/schema hashes,
    token usage, and cached token counts when providers return them
  - ordinary-turn source windows are redacted before source/segment
    persistence; durable memories may still carry bounded evidence quotes, but
    full prompt/assistant turn text is not persisted as segment content

## Current Risks

- soak-window fallback code still exists and must be removed or further
  quarantined in small reversible slices
- ordinary-turn MMV2 evaluation coverage is stronger but still not a full
  live UI capture soak matrix
- retrieval relevance is acceptable for the clean soak but not yet globally
  optimized; future misses must stay observable through retrieval telemetry
- live retrieval/context lookup can still transiently time out under UI proof
  load; this should be treated as a runtime availability/diagnostics issue, not
  a reason to add topical write-path heuristics
- live ordinary-turn durable capture now surfaces capture jobs and durable
  dirty-state snapshots/events while avoiding synchronous rebuild. Gateway
  pickup for the Pass 2 mechanical hardening image completed and health is
  green. The current partial soak remains `not_clean` until a fresh runtime
  proof shows durable rows, capture job status, dirty-state events, rebuild
  coalescing, root no-write, and no-dark-data evidence under gateway load.
  This pass did not write artificial proof/eval memories into the live durable
  DB.
- file-pack/provider variance still needs seeded stabilization and reporting
- capture seam wiring remains limited to production-verified/no-dark-data
  surfaces behind kill switches; unverified seams stay blocked
- closed-loop operational signals must avoid dark data and must not become
  parallel raw capture
- the shared ingestion funnel is not yet fully wired as a single executable
  pipeline across every path; this pass landed shared contracts and selected
  adapters, but candidate-level quarantine/persistence still needs a deeper
  implementation slice
- document ingest remains blocked from safe resume by checkpoint state and
  provider/funnel preconditions: the report-only failed-source quarantine has
  79 failed, 200 completed, 25 pending, `runStatus=running`, and a hard
  `provider_credit` no-retry class
- downstream docs workflows now stay same-repo and no longer block on an
  external `openclaw/docs` credential

## Current Work Queue

2026-05-09 memory/runtime maximality update:

- The Execution Platform memory-runtime closure pass completed all 13 hook
  migrations with production middleware/runtime evidence and live UX/workflow
  evidence.
- Old direct hook paths are compatibility-only; model-task and DB-operation
  middleware are the primary runtime evidence path for capture, retrieval,
  context-pack, skillifier/proactivity, opportunity, heartbeat, and compaction
  surfaces.
- Controlled automatic compaction now has a passed over-budget
  live-equivalent proof.
- Work Queue tracker/readback should treat Slices 41-47 as completed against
  `.artifacts/execution-platform/memory-runtime-13-hook-hard-gate-proof.json`
  and `.artifacts/execution-platform/model-memory-runtime-live-proof-summary.json`.
- The follow-up memory-quality/context-pack pass uses model-authored quality
  reviews for capture and retrieval/context usefulness. Deterministic code is
  limited to schema, bounds, refs, safety flags, and callsite classification.
- Current projection validation found no inactive `agents-md` source refs; the
  earlier projection warning is stale doc/artifact drift.
- The remaining memory compatibility debt is explicit: the legacy bootstrap
  retrieval overlay at `src/agents/model-memory/live-runtime/retrieval-context.ts`
  is compatibility-only until the hard-shutdown slice removes or fully
  disables it.

Next convergence targets:

1. Proactivity Work Queue Quality Soak.
2. Memory Curator Workflow.
3. Skill Curator Workflow.
4. Coding/research/docs/QA/architecture memory-aware workflow quality soak.
5. Model Memory Compatibility Hard Shutdown.
6. Final platform coherence audit and owner UX production soak.

7. Keep the same-repo docs bundle workflows artifact-only until a real owned
   downstream docs host is chosen; do not restore the old `openclaw/docs`
   publish assumption or the old cross-repo locale-dispatch path.
8. Keep `message:preprocessed` routing/telemetry-only until dedupe and
   no-raw-prompt guarantees are proven.
9. Treat `ContextEngine.ingest` and `ContextEngine.ingestBatch` hook evidence
   as production evidence only when it comes from real UI/gateway turns; do not
   fake production verification from direct internal calls.
10. Do not resume the curated 304-source document-ingest corpus until provider
    health/credit preflight passes. Resume
    from checkpoint `checkpoints/model-memory/model-memory-deep-pass-2026-04-22b.json`
    only with provider credits restored, bounded class-filtered failed-source
    retry, the runner failure circuit breaker enabled, and the failed-source
    quarantine report reviewed.
11. Rerun a narrow `MEMMECH-2026-04-22` proof for durable ordinary-turn
    capture, capture job events, deferred rebuild state, DB pool telemetry,
    strict-schema preflight, cache metrics, and no raw ordinary-turn
    source-window persistence. Runtime pickup is already complete; do not write
    synthetic proof/eval content into the live durable DB.
12. Complete Pass 6 cache-aware mini/nano and large-document compression
    benchmarking, or explicitly decide to defer it before rerunning MEMMECH
    proof.
13. Finish the next shared ingestion-funnel slice:
    - executable pipeline stage orchestration across all capture paths
    - candidate-level quarantine artifacts/reports
    - wider per-candidate persistence/savepoint coverage where safe
    - closeout reports that consume the new integrity audit and provider
      scorecard outputs
14. Continue hardening Retrieval Runtime relevance and telemetry without
    mutating truth:
    - prefer fresh projection digests backed by active MMV2 ids
    - record stale/superseded/deleted/conflicted/inactive exclusions
    - emit `memory_existed_but_excluded` diagnostics when candidates are found
      but not selected
    - emit empty-retrieval telemetry
    - keep lexical/RRF/vector-style ranking read-time only
15. Continue remaining evaluation coverage for:
    - tool-result proof capture
    - projection-backed recall
    - stale/superseded exclusion
    - no raw-data persistence
    - root `USER.md` / `MEMORY.md` no-write
16. Inventory and quarantine remaining fallback compatibility in small
    reversible slices:

- no broad deletion without tests
- no legacy semantic-family/collision behavior in default MMV2 hot paths
- only explicit fallback flags with tests

11. Harden ordinary-turn MMV2 evaluation coverage:
    - durable preference
    - durable directive
    - durable project fact
    - structural correction target
    - temp/session-only reject
    - privacy/no-store reject
    - scope and evidence grounding
    - no topic parser or fuzzy write-path supersession regression
12. Run seeded file-pack/provider variance comparisons and separate:

- deterministic regression
- provider/model variance
- JSON-boundary failure
- comparator strictness issue
- real semantic regression

13. Implement the remaining capture seam expansion described in
    [Memory Capture Seams](/projects/model-memory/specs/memory-capture-seams).
    Live feed visibility is separate from capture wiring and must remain
    bounded operational telemetry only.
14. Implement the closed-loop ops instrumentation described in
    [Memory Ops Closed Loop](/projects/model-memory/specs/memory-ops-closed-loop).
15. Proceed to Phase 2 derived features in order:

- graph runtime
- `project_state` capsules
- hierarchical retrieval
- proactive planner
- skill/tool synthesis
- cache/projection policy
- second-pass privacy and prompt-injection enforcement

## Post-Clean-Soak Parallel Lanes

After the accepted retrieval-runtime soak, safe parallel lanes are:

- Regression monitoring:
  - review Memory Ops reports for real signal vs fixture/demo noise
  - verify retrieval telemetry proves recall rather than same-session context
  - keep auto-fix disabled
- Hook verification:
  - prove `tool_result_persist`, `after_tool_call`, `agent_end`,
    `ContextEngine.afterTurn()`, compaction, and `session_end` with safe
    canaries before production capture wiring
- Ordinary-turn MMV2 evaluation:
  - add evaluation-only coverage for preferences, durable directives, project
    facts, corrections, and temporary/session-only rejects
- File-pack/provider variance stabilization:
  - improve seeded artifact comparison/reporting
  - separate provider variance from deterministic regressions
- Compatibility-removal prep:
  - inventory remaining fallback adapters
  - write the removal checklist and tests
  - do not remove fallback until one retrieval-runtime soak cycle is clean
- Primary capture seam design prep:
  - prepare implementation plans/tests for `message:preprocessed`,
    ContextEngine catchall, tool-result proof, `agent_end` / `afterTurn`, and
    bootstrap/memory-file hash import
  - hold production wiring until hook-health evidence is production-verified

## Compatibility-Removal Prep Checklist

Do not remove these during the retrieval-runtime soak. The purpose of this
checklist is to make the post-soak removal pass bounded and testable.

| Surface                                                                  | Current caller/posture                                                    | Removal prerequisite                                                                  | Test before removal                                                                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `extensions/model-memory/src/db/mmv2-memory-object-store.ts`             | fallback captured-object adapter plus MMV2 batch store compatibility      | one clean soak cycle and proof that active writers use native MMV2 recording directly | live document/ordinary/replay writer tests prove no normal-path `writeCapturedObjects` use   |
| `extensions/model-memory/src/db/default-memory-store.ts`                 | storage bridge for rollback/fallback selection                            | storage selector no longer needs legacy fallback for rollback window                  | storage selector tests prove MMV2 repository construction is explicit                        |
| `extensions/model-memory/src/mmv2/storage-compatibility.ts`              | temporary shape conversions at legacy edges                               | read/write consumers stop importing legacy storage types for normal behavior          | TypeScript import inventory plus adapter-specific unit tests removed or marked fallback-only |
| `extensions/model-memory/src/storage-database-contract.ts`               | legacy type authority for fallback-compatible surfaces                    | all live services depend on MMV2-native repository/recording interfaces               | `rg` inventory shows legacy contract imports are test/fallback-only                          |
| `extensions/model-memory/src/document-ingestion.ts`                      | legacy document ingest path retained for rollback                         | document-ingest selector soak is clean and rollback window is closed                  | document ingest tests cover MMV2-only default with no v1 write path assertions               |
| `extensions/model-memory/src/admin/replay-service.ts`                    | operator replay still carries compatibility seams                         | replay drives shared live MMV2 capture core without legacy object semantics           | replay service tests assert native MMV2 recording/events                                     |
| `extensions/model-memory/src/admin/document-ingestion-runner-service.ts` | runner can still accept compatibility store shapes                        | runner persists through explicit MMV2 live writer                                     | runner tests assert no `DatabaseMemoryObjectStore` normal-path dependency                    |
| `extensions/model-memory/src/runtime-rebuild-orchestrator.ts`            | read side has compatibility transforms at edges                           | rebuild consumes MMV2 durable truth directly everywhere                               | rebuild tests use MMV2 durable records/events/edges only                                     |
| `extensions/model-memory/src/retrieval.ts`                               | retrieval still accepts legacy-compatible in-memory records at some edges | retrieval scoring/filtering operates on MMV2 runtime read records directly            | retrieval tests cover active/superseded/conflicted/quarantined MMV2 states                   |

Post-soak removal rule:

- remove or further quarantine only one compatibility surface at a time
- keep the rollback procedure explicit until the agreed soak window closes
- do not reintroduce dual active truth
- do not weaken conflict/composite durability to make removal easier

## Current Judgment

`mmv2_clean_soak_accepted_post_soak_hardening`

The system has crossed the storage, write hot-path, retrieval telemetry, and
clean-soak acceptance boundary. The next useful work is small-slice hardening:
fallback quarantine, ordinary-turn eval coverage, retrieval relevance metrics,
seeded file-pack/provider variance, production-safe hook canaries, and only then
verified primary capture seam expansion.
