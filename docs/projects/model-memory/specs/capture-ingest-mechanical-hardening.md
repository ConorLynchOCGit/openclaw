---
summary: "Planning spec for remaining MMV2 capture and ingest mechanical hardening."
title: "Capture And Ingest Mechanical Hardening"
---

# Capture And Ingest Mechanical Hardening

## Status

This is both the pass plan and the implementation record for the mechanical
hardening work completed so far.

2026-04-23 final hardening follow-up:

- shared ingestion contracts now include explicit executable stage names for
  source intake, fingerprinting, privacy gate, routing, prompt planning,
  provider boundary, extraction/repair, canonicalization, reconciliation,
  admission validation, candidate quarantine, persistence, edge endpoint
  validation, runtime dirty marking, scorecard update, integrity audit,
  projection refresh, closeout reporting, and telemetry
- closeout reports are artifact-safe runtime-state outputs with run/source/job
  ids, attempted/written/deferred/skipped counts, failure-class breakdown,
  provider/model/schema labels, provider scorecard references, integrity audit
  references, dirty-state result, and no-dark-data scan status
- candidate-level quarantine reports include source id/hash, candidate id,
  memory/event/edge ids where available, failure class/stage, validation
  reason, and provider/model/schema labels; they deliberately exclude raw
  prompts, transcripts, raw tool logs, secrets, and unbounded source text
- per-candidate fallback/savepoint behavior remains bounded and idempotent:
  invalid candidates and invalid edges are reported/deferred while valid
  siblings can continue through MMV2-native persistence
- no SQL migration was added; report retention is runtime-state artifact
  rotation/pruning, not durable semantic storage

The first bounded hardening slice already landed in source and runtime:

- safe capture activity events
- ordinary-turn rebuild deferred by default
- try-lock rebuild behavior
- scoped reconciliation summaries
- batched edge endpoint validation
- DB pool env knobs and snapshot stats
- strict-schema preflight support
- prompt-cache telemetry support
- ordinary-turn source-window redaction

Passes 3-5 are now implemented and live-picked-up with no DB migration:

- DB pool lanes and pressure control use priority lane semaphores, safe pool
  snapshots, and `pool_pressure` classification to defer capture/rebuild work
  before statement-timeout cascades.
- Batch persistence writes durable memories, events, and edges in bounded
  batches where safe, preserves idempotency, and reports invalid candidates or
  edges without rolling back valid siblings.
- Provider/schema preflight now exercises actual strict-schema contracts for
  capture routing, extraction, canonicalization, and retrieval interpretation;
  provider scorecards record safe schema/latency/token/cache metrics.

The 2026-04-23 current-runtime MEMMECH proof is clean for the approved live
payload path:

- artifact:
  `.artifacts/model-memory/memmech-proof/2026-04-23-live/memmech-live-proof.json`
- approved durable payload produced `capture_written` and live durable rows
- no-store, privacy, and temp/session-only prompts produced no active durable
  rows
- root `USER.md` / `MEMORY.md` hashes stayed unchanged
- runtime-state jobs/events, dirty state, pool telemetry, strict-schema
  preflight, cache metric proof, and no-raw-turn persistence checks are present
- a historical failed duplicate capture job from the pre-idempotency proof
  rerun is disclosed as non-blocking runtime-state history; already-written
  jobs now return idempotently and are not re-enqueued

Pass 6 is implemented as a real live benchmark/compression pass while keeping
benchmark/eval output out of semantic memory:

- `scripts/model-memory-live-cache-aware-benchmark.mjs` writes reports under
  `.artifacts/model-memory/pass6-live-benchmark/2026-04-23/`
- prompt-cache keys are derived from contract/schema/prompt version plus
  static prefix hash
- static prompt/schema content stays first and source/window text stays in the
  dynamic tail
- mini/nano comparison records latency, token usage, cached-token percentage,
  schema adherence, empty-response rate, repair rate, valid-candidate rate,
  and safe cost estimates
- `openai-codex/gpt-5.4-mini` passed the strict-schema benchmark; the
  configured nano route failed every strict-schema call with
  `provider_json_boundary`
- large-document compression is evaluated against the real
  `docs/projects/model-memory/DECISIONS.md` source as projection/cache only;
  admitted candidates must validate against original source spans, and
  section-map plus candidate hints is the current recommendation

2026-04-23 operational follow-up:

- runtime-dirty state persistence was failing because the runtime-state spool
  was host-owned by root while the gateway runs as UID `1000`; the approved
  fix is a narrow ownership/ACL repair on
  `$OPENCLAW_STATE_DIR/model-memory/runtime-dirty/`, never a broad chmod or DB
  mutation
- dirty-state write/permission failures now map to
  `runtime_dirty_persistence` or `permission`, with capture-job stage
  `runtime_dirty` where applicable
- strict capture/ingest defaults now resolve to
  `openai-codex/gpt-5.4-mini`; nano is retained only behind explicit
  low-risk/benchmark overrides until strict-schema and evidence-quality parity
  is proven
- strict mini route proof now records provider, requested model, resolved
  model, native Codex responses transport, request URL, and auth lane; the
  earlier wrong-pipe OpenAI chat-completions route is no longer valid evidence
  for mini readiness
- clean live mini validation is still blocked on the corrected native route:
  prior proof returned provider-boundary `403` HTML and later bounded retries
  timed out before returning a strict-schema response, so the remaining issue
  is provider/auth-lane readiness rather than MMV2 schema wiring
- large-document ingest strategy selection now defaults to `auto`: small docs
  use direct rigid capture, while docs above
  `MODEL_MEMORY_DOCUMENT_INGEST_LARGE_DOC_WORD_THRESHOLD` use
  `section_map_candidate_hints`
- section-map candidate hints are non-canonical projection/cache artifacts;
  only original-source-validated hints may narrow rigid MMV2 admission
- a five-doc artifact-only section-map audit on 2026-04-23 showed zero
  evidence failures on three docs and two failures each on `STATUS.md` and the
  host-operator topology spec; unsupported hints must remain quarantined and
  adaptive stricter-evidence retry is required before broad default-safe use

## Guardrails

- MMV2 durable SQL remains semantic truth.
- Runtime read models, projections, jobs, scorecards, and benchmarks are
  operational state or derived views, not semantic truth.
- Do not add DB migrations unless explicitly approved before implementation.
- Do not resume document ingest in these passes unless the pass explicitly says
  to do so and preconditions pass.
- Do not write proof, file-pack, benchmark, or eval output into the live
  durable-memory DB.
- Do not persist raw prompts, full transcripts, raw tool logs, secrets, or
  private phrases.
- Do not reintroduce semantic forests, fuzzy write-path correction, fuzzy
  supersession, semantic-family fallback, or topic-specific parsers.
- Ranking, RRF, boosts, projection-digest preference, and miss diagnostics stay
  read-time only.

## Mechanical Findings

The remaining work is driven by these mechanical findings:

- live capture was effectively fire-and-forget; UI turns could complete while
  capture failed later with warning logs only
- ordinary-turn capture previously requested runtime rebuild for each capture
- ordinary-turn reconciliation previously loaded all durable memories before
  capture
- runtime rebuilds were serialized behind blocking advisory locks and rewrote
  active runtime tables row by row
- the DB pool was small and shared across interactive retrieval, capture, and
  rebuild work
- live-batch persistence still has sequential write amplification beyond the
  batched edge endpoint lookup already landed
- provider preflight support exists, but every live startup/runner path does
  not yet prove each actual strict schema/model contract before work begins
- ordinary-turn source windows now redact full turn text, but this policy must
  be preserved in future capture/job/retry/replay surfaces

Read-only DB timing showed table size was not the primary cause. The evidence
points to contention, rebuild coupling, pool pressure, write amplification, and
provider/schema mechanics.

## Pass Overview

| Pass | Name                                                     | Primary Outcome                                                                |
| ---- | -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 0    | Preflight and design gates                               | Confirm live state, DB/schema constraints, and whether migrations are approved |
| 1    | Durable capture jobs                                     | Capture becomes inspectable, retryable, replayable, and safe across restarts   |
| 2    | Durable dirty state and rebuild scheduler                | Rebuilds are coalesced and never block ordinary capture                        |
| 3    | DB pool lanes and pressure control                       | Retrieval is protected from capture/rebuild starvation                         |
| 4    | Batch persistence and candidate savepoints               | Live writes are bounded, idempotent, and partial-failure tolerant              |
| 5    | Provider/schema preflight and scorecards                 | Actual contracts are tested before runs and tracked by provider/model          |
| 6    | Cache-aware benchmark and large-doc compression research | Mini/nano and summarization choices are measured after mechanics are stable    |
| 7    | MEMMECH proof and current-runtime soak                   | Runtime proof and soak verify the complete mechanical path                     |

## Pass 0 - Preflight And Design Gates

Goal:

- prevent another partial implementation from silently leaving ambiguous
  architecture debt

Required work:

- inspect git state, runtime health, recent gateway logs, root hashes, DB
  counts, current pool settings, and active ingest runners
- produce a live DB timing snapshot for summary reads, runtime artifact reads,
  and active `pg_stat_activity`
- decide storage posture for durable jobs and dirty markers:
  - preferred long-term: SQL runtime tables in a non-semantic operational
    schema
  - migration-free interim: existing runtime artifact surface or host-runtime
    JSONL/SQLite spool outside the durable-memory truth DB
  - if a new SQL table is required, stop and request migration approval with
    schema, rollback, and data-retention plan
- define rollback flags for each runtime behavior change
- define exact safe proof payload strategy before any live durable proof write

Acceptance:

- implementation pass starts with explicit storage decision and rollback plan
- no DB migration happens without approval
- no proof/eval content is written to the live durable-memory DB by accident

## Pass 1 - Durable Capture Jobs

Goal:

- make capture observable and durable as a job, not only activity events

Slices:

1. Job contract and storage decision
2. Enqueue path from completed UI turn and capture seams
3. Worker path with bounded concurrency
4. Failure classification and retry policy
5. Replay/admin inspection surface
6. Activity/timeline integration
7. No-dark-data validation
8. Tests and narrow runtime pickup proof

Required work:

- define `MemoryCaptureJob`:
  - job id
  - session id/key
  - agent id
  - source id
  - source fingerprint/hash
  - source kind
  - status
  - failure class
  - retry count
  - next attempt time
  - created/started/finished timestamps
  - model/provider labels
  - safe ids for source, segment, memory, event, edge
- define `MemoryCaptureJobEvent`:
  - `capture_queued`
  - `capture_started`
  - `capture_skipped`
  - `capture_failed`
  - `capture_written`
  - `capture_retry_scheduled`
  - `capture_replay_requested`
- ensure job payloads never persist raw prompt text, full user turn, full
  assistant turn, full transcript, raw tool logs, secrets, or private phrases
- classify failures using the shared ingestion taxonomy
- retry only retryable provider/connection/pool-pressure classes
- do not retry no-store, privacy, deterministic routing skips, or schema
  unsupported failures
- expose safe job status to activity feed/run timeline
- add replay only for safe stored fingerprints and bounded evidence, not raw
  turn replay

Acceptance:

- UI turns remain non-blocking
- capture failures are durable, inspectable, and classed
- a gateway restart does not lose queued/failed capture job state
- replay cannot resurrect raw prompt/transcript/tool-log content

Implementation status, 2026-04-22:

- implemented with no DB migration
- storage is a runtime-state file spool outside the semantic durable-memory DB:
  `$OPENCLAW_STATE_DIR/model-memory/capture-jobs/`
- job snapshots live under `jobs/<capture_job_id>.json`
- append-only safe job events live in `events.jsonl`
- ordinary-turn capture now routes through the job abstraction before live
  capture execution
- the worker path is bounded by `MODEL_MEMORY_CAPTURE_JOB_CONCURRENCY`
  (default `1`)
- bounded retry is controlled by `MODEL_MEMORY_CAPTURE_JOB_MAX_RETRIES` and
  `MODEL_MEMORY_CAPTURE_JOB_RETRY_DELAY_MS`
- retryable classes are currently:
  - `provider_empty_response`
  - `provider_connection`
  - `timeout`
- non-retry classes include no-store/privacy/temp skips,
  `provider_json_boundary`, validation/semantic contract failures, and other
  deterministic failures
- replay is an admin inspection marker only; it cannot resurrect raw
  prompt/transcript/tool-log payload because only safe hashes, ids, labels, and
  classes are persisted
- activity integration emits:
  - `capture_queued`
  - `capture_started`
  - `capture_skipped`
  - `capture_failed`
  - `capture_written`
  - `capture_retry_scheduled`
  - `capture_replay_requested`
- tests cover persistence across store reload, success/failure events,
  retry scheduling, non-retry skips, replay safety, activity redaction, and
  ordinary-turn skipped-job routing

## Pass 2 - Durable Dirty State And Rebuild Scheduler

Goal:

- coalesce runtime/projection rebuild work and prevent rebuild contention from
  blocking capture or retrieval

Slices:

1. Dirty marker contract
2. Rebuild scheduler policy
3. Rebuild worker lane
4. Try-lock integration
5. Projection/runtime target scoping
6. Activity events and tests

Required work:

- define durable or semi-durable dirty state:
  - dirty id
  - dirty reason
  - affected memory ids
  - affected source/event/edge ids when known
  - affected projection targets when known
  - marked_at
  - last_attempt_at
  - last_rebuild_at
  - failure class
- coalesce rebuild after N writes or N seconds
- maintain one active rebuild per scope/runtime target
- if rebuild is already active, mark dirty and emit skipped-lock-busy event
- keep rollback flag for blocking lock behavior
- ensure retrieval can read canonical evidence while projections are dirty

Acceptance:

- ordinary capture never performs a full synchronous rebuild by default
- rebuilds are coalesced and observable
- lock contention does not hold DB connections until statement timeout

Implementation status, 2026-04-22:

- implemented and live-picked-up with no DB migration
- storage is a runtime-state file spool outside the semantic durable-memory DB:
  `$OPENCLAW_STATE_DIR/model-memory/runtime-dirty/`
- snapshot path:
  `$OPENCLAW_STATE_DIR/model-memory/runtime-dirty/state.json`
- append-only event path:
  `$OPENCLAW_STATE_DIR/model-memory/runtime-dirty/events.jsonl`
- ordinary-turn and bounded tool-result capture mark dirty after writes instead
  of synchronously rebuilding derived runtime/projection state
- dirty state stores only safe ids, counts, status, failure classes, scheduler
  generation, timestamps, and no-dark-data flags
- no raw prompt text, full transcript, assistant turn text, raw tool log,
  secrets, private phrases, proof output, or generated projection content is
  stored in dirty state/events
- dirty events now include:
  - `runtime_dirty_marked`
  - `runtime_rebuild_scheduled`
  - `runtime_rebuild_started`
  - `runtime_rebuild_completed`
  - `runtime_rebuild_failed`
  - `runtime_rebuild_skipped_lock_busy`
  - `runtime_rebuild_coalesced`
  - `runtime_dirty_cleared`
  - `runtime_rebuild_admin_requested`
- activity/timeline events additionally surface `runtime_rebuild_deferred` for
  dirty-but-not-yet-scheduled and rebuild-disabled states
- scheduling knobs:
  - `MODEL_MEMORY_RUNTIME_REBUILD_ENABLED` defaults to enabled
  - `MODEL_MEMORY_RUNTIME_REBUILD_COALESCE_WRITES` defaults to `5`
  - `MODEL_MEMORY_RUNTIME_REBUILD_COALESCE_MS` defaults to `30000`
  - `MODEL_MEMORY_RUNTIME_REBUILD_MAX_CONCURRENCY` defaults to `1`
  - `MODEL_MEMORY_RUNTIME_REBUILD_RETRY_DELAY_MS` defaults to `30000`
  - `MODEL_MEMORY_RUNTIME_REBUILD_MAX_RETRIES` defaults to `1`
- fail-fast try-lock behavior remains the rebuild-lock default, with
  `MODEL_MEMORY_REBUILD_BLOCKING_LOCK_ENABLED=true` retained only as rollback
- successful rebuild clears dirty state unless new dirty writes arrived during
  the rebuild; lock-busy or failed rebuilds keep dirty state and record safe
  failure metadata
- tests cover persistence across reloads, JSONL event append, no-dark-data
  fields, write-count and age coalescing, disabled rebuilds, one active rebuild
  at a time, lock-busy behavior, successful clear, failed rebuild metadata,
  admin rebuild request, activity rendering, and existing try-lock behavior

## Pass 3 - DB Pool Lanes And Pressure Control

Goal:

- protect interactive retrieval and context assembly from background capture
  and rebuild pressure

Slices:

1. Pool telemetry hardening
2. Lane selection design
3. Read/write/rebuild pool split or semaphore fallback
4. Circuit breaker
5. Tests under simulated pool starvation

Required work:

- decide whether the current deployment can support separate pools:
  - retrieval/read pool
  - capture/write pool
  - rebuild/projection pool
- if separate pools are too expensive, implement semaphores:
  - retrieval high priority
  - capture lower priority
  - rebuild lowest priority
- expose pool stats:
  - total
  - idle
  - waiting
  - acquire latency
  - transaction/query latency
  - timeout count
- add pool-pressure circuit breaker:
  - pause capture jobs
  - defer rebuilds
  - keep retrieval online
  - emit safe activity/ops signals

Acceptance:

- rebuild/capture pressure cannot starve user-facing retrieval
- pool pressure is visible before statement timeout cascades

Implementation status, 2026-04-22:

- implemented and live-picked-up with no DB migration
- deployment uses priority semaphores/queue lanes rather than extra physical
  pools so the existing DB connection budget is not multiplied
- lane kinds:
  - `retrieval`
  - `capture`
  - `rebuild`
  - `admin`
  - `default`
- retrieval/admin lanes remain eligible under pressure; capture/rebuild/default
  lanes defer when pressure thresholds are exceeded
- preserved base pool knobs:
  - `MODEL_MEMORY_DB_POOL_MAX`
  - `MODEL_MEMORY_DB_POOL_CONNECTION_TIMEOUT_MS`
  - `MODEL_MEMORY_DB_POOL_IDLE_TIMEOUT_MS`
- added lane/pressure knobs:
  - `MODEL_MEMORY_DB_RETRIEVAL_LANE_CONCURRENCY`
  - `MODEL_MEMORY_DB_CAPTURE_LANE_CONCURRENCY`
  - `MODEL_MEMORY_DB_REBUILD_LANE_CONCURRENCY`
  - `MODEL_MEMORY_DB_ADMIN_LANE_CONCURRENCY`
  - `MODEL_MEMORY_DB_DEFAULT_LANE_CONCURRENCY`
  - `MODEL_MEMORY_DB_POOL_PRESSURE_WAITING_THRESHOLD`
  - `MODEL_MEMORY_DB_POOL_PRESSURE_ACQUIRE_LATENCY_MS`
  - `MODEL_MEMORY_DB_POOL_PRESSURE_TIMEOUT_COUNT_THRESHOLD`
- pool snapshots include safe counts and timings only:
  - total/idle/waiting count
  - lane active/queued/acquire counts
  - acquire/query/transaction latency maxima
  - timeout count and pressure reasons
- `pool_pressure` is now a shared ingestion failure class with retry/backoff
  posture; it is not treated as semantic/source failure
- ordinary capture checks capture-lane pressure before DB writes and rebuild
  pressure before scheduling rebuild work; capture jobs may retry/defer safely
- tests cover env config, pressure snapshots, retrieval priority, capture
  backoff, rebuild deferral, and redacted telemetry

## Pass 4 - Batch Persistence And Candidate Savepoints

Goal:

- make live persistence bounded, idempotent, and tolerant of invalid
  candidates/edges

Slices:

1. Current write-path inventory
2. Multi-row memory/event/edge writes where safe
3. Candidate-level savepoints or per-candidate transactions
4. Deferred invalid candidate/edge reports
5. Statement/latency telemetry
6. Integrity audit command

Required work:

- batch memory writes where idempotent
- batch event writes where idempotent
- batch edge writes after endpoint validation
- keep endpoint lookup as one batched query
- isolate invalid candidate/edge failures so valid siblings persist
- emit deferred invalid edge/candidate reports with safe ids and reasons
- add statement-count or operation-count telemetry where practical
- add non-mutating integrity audit:
  - memories without events
  - events without source refs
  - edges without endpoints
  - stale projection references
  - orphan source/segment checks

Acceptance:

- one invalid edge/candidate does not roll back an entire valid capture batch
- idempotent retry does not duplicate memories/events/edges
- persistence telemetry can explain slow or failed live writes

Implementation status, 2026-04-22:

- implemented and live-picked-up with no DB migration
- durable memory upserts, memory event inserts, and memory edge upserts use
  multi-row batch operations where safe
- existing batched edge endpoint validation is preserved
- batch writes fall back through savepoints/per-record persistence where the
  SQL backend supports savepoints; test backends without savepoint support use
  per-record fallback directly
- candidates without required event evidence are deferred with safe ids and
  failure stage rather than rolling back sibling candidates
- invalid edges are deferred with safe edge ids, endpoint ids, type, and reason
  while valid memories/events continue
- persistence returns `LiveMemoryPersistenceResult` with:
  - written memory/event/edge ids
  - deferred candidate/edge reports
  - rows attempted/written/deferred
  - transaction latency
  - operation count
- capture jobs can classify persistence pressure/failures without persisting
  raw source text, prompt text, transcripts, or raw tool logs
- non-mutating integrity audit reports:
  - memories without events
  - events without source refs
  - edges without endpoints
  - stale projection references
  - orphan source/segment records
- tests cover sibling persistence under invalid candidates/edges, idempotent
  retry, deferred reports, batched endpoint lookup, telemetry, and non-mutating
  audit behavior

## Pass 5 - Provider Schema Preflight And Scorecards

Goal:

- prove actual model/schema contracts before expensive or live capture work

Slices:

1. Contract inventory
2. Startup/admin preflight wiring
3. Runner preflight wiring
4. Provider/model scorecard
5. Cache telemetry closeout report

Required contracts:

- capture routing
- extraction
- extraction repair
- canonicalization
- reconciliation/correction targeting if model-assisted
- retrieval interpretation
- summarization/compression if enabled

Required work:

- preflight actual strict `json_schema` contract per model/provider
- require OpenRouter `provider.require_parameters` when strict schema is
  required
- classify unsupported schema as provider boundary failure, not document/source
  failure
- record provider/model scorecard:
  - schema success rate
  - empty response rate
  - JSON syntax failure rate
  - schema failure rate
  - repair rate
  - p50/p95 latency
  - prompt/output/cached tokens
  - cache hit rate
- integrate scorecard into document runner and live capture diagnostics

Acceptance:

- corpus or soak work does not start against an unverified schema/model route
- provider failures are classed before they become source failures

Implementation status, 2026-04-22:

- implemented in source with no DB migration
- strict-schema preflight requests are now built for:
  - `mmv2-capture-routing-v1`
  - `mmv2-atomic-extraction-v1`
  - `mmv2-canonicalization-v1`
  - `retrieval_request_interpretation` v2
- strict-schema OpenRouter requests include `provider.require_parameters`
- generic JSON-object health checks no longer satisfy strict contract proof for
  document-ingest runner preflight
- document ingestion runner primary/fallback model preflight now exercises the
  actual strict-schema contract set before corpus work
- unsupported schema or malformed structured output is classified as
  `provider_json_boundary`, not a source/document semantic failure
- provider scorecards are runtime-state artifacts, not semantic memory:
  `$OPENCLAW_STATE_DIR/model-memory/provider-scorecards/`
- scorecard events/summaries include only safe metadata:
  - provider/model/resolved model labels
  - contract/schema names and versions
  - success/failure class
  - latency
  - prompt/output/cached tokens
  - cache hit rate and call counts
- scorecards do not store prompt text, source text, transcripts, raw tool logs,
  secrets, or private phrases
- tests cover strict-schema preflight failure, OpenRouter
  `require_parameters`, scorecard token/cache metrics, and redacted reports

## Pass 6 - Cache-Aware Benchmark And Large-Doc Compression Research

Goal:

- choose mini/nano/summarization behavior from measurements, not assumptions

Precondition:

- passes 1-5 must be stable enough that model latency and quality are not
  confounded by DB contention or rebuild blocking

Mini/nano benchmark:

- compare `openai-codex/gpt-5.4-mini` and the configured nano route
- run identical fixtures, prompt/schema versions, and randomized order
- use at least three runs per case
- disable live DB writes or isolate them outside the durable-memory DB
- measure:
  - p50/p95 latency
  - cached tokens
  - uncached tokens
  - output tokens
  - schema adherence
  - empty response rate
  - repair rate
  - valid candidate rate
  - false positive rate
  - missed durable fact rate

Large-doc compression:

- treat summaries as source-preserving cache/projection artifacts, not truth
- compare:
  - direct rigid capture
  - source-preserving summary then rigid capture
  - section-map plus candidate-hints
- every admitted memory must validate against original source spans
- report cost, latency, failure rate, missed facts, and unsupported candidates

Acceptance:

- model routing and summarization recommendations are backed by measured
  quality, latency, cache, and failure behavior

## Pass 7 - MEMMECH Proof And Current-Runtime Soak

Goal:

- prove the full mechanical path in the live runtime or clearly classify the
  remaining blocker

Required proof:

- capture job id emitted
- capture job persists across restart or storage reload
- durable ordinary-turn capture creates expected durable row only for an
  operator-approved durable payload
- no-store/privacy/temp payloads create no active durable memory
- dirty marker and coalesced rebuild behavior are visible
- pool telemetry is available
- strict-schema preflight records actual contract status
- cache metrics appear where provider returns usage
- ordinary-turn source-window persistence contains no raw prompt/full turn
- root `USER.md` / `MEMORY.md` hashes unchanged

Proof payload rule:

- do not invent artificial proof/eval durable memory in the live DB
- either use a real operator-approved durable preference/fact that should
  remain long-term, or run against an isolated/staging DB

Acceptance:

- current-runtime soak can be called clean only after durable capture,
  no-store/privacy, retrieval/projection, hook/capture, root no-write, and
  no-dark-data gates pass

## First Major Pass

The first major pass should be Pass 1: Durable Capture Jobs.

Reasoning:

- it makes failures durable and inspectable before deeper worker/pool changes
- it establishes the retry/replay contract needed by rebuild scheduling and
  pool-pressure backoff
- it forces the storage/migration decision early
- it gives the UI and Memory Ops surfaces stable safe IDs for every downstream
  hardening pass

Pass 1 must stop before implementation if a new SQL table or migration is
required and migration approval has not been granted.
