---
summary: "Stable decisions for the model-memory clean-room project."
title: "Model Memory Decisions"
---

# Model Memory Decisions

## 2026-04-25 - Comprehensive Phase 2 eval gates planner and proactive behavior

Decision:

- insert a retrieval integration/proof harness slice after the hierarchical
  retrieval substrate and before the comprehensive eval slice
- the integration harness should exercise object retrieval, projection digests,
  capsule shadow, gated capsule context, and hierarchical shadow in one
  structured runtime trace without promoting default behavior
- insert a comprehensive Phase 2 integration eval and no-dark-data proof slice
  before planner/proactivity
- the comprehensive eval must include structured capture/retrieval prompts and
  non-user-prompt ingestion sources: curated docs, repo docs, manual notes,
  tool-result capture, researcher report artifacts, cited assistant answers,
  daily continuity, raw prompt/transcript/tool-log rejection or
  `inspection_only`, and secret/private phrase hard reject

Reasoning:

- testing isolated substrates again is lower value until a single proof path can
  invoke the built retrieval, projection, capsule, context, and hierarchical
  surfaces together
- planner and proactive behavior should not depend on Phase 2 memory outputs
  until authority propagation, provenance, lifecycle exclusion, and no-dark-data
  behavior are proven across capture and retrieval

## 2026-04-25 - Projections and capsules share derived-artifact mechanics but keep separate roles

Decision:

- projections remain workspace/bootstrap/read-model artifacts
- capsules are the generation/context artifact family
- Phase 2 should add a shared derived-artifact core for provenance,
  deterministic ids/hashes, source refs, authority metadata, freshness,
  lifecycle exclusion, conflict markers, artifact writing, and read-only stores
- `project_state` capsule owns rich project-state generation/context
  compilation
- `project_page` projection must not remain a second independent project-state
  compiler; it is either an operator/report projection or a thin renderer over
  a fresh `project_state` capsule or capsule digest

Reasoning:

- projection and capsule code currently need many of the same safety mechanics,
  but they serve different product roles
- consolidating shared mechanics avoids divergent freshness, provenance,
  lifecycle, and no-dark-data behavior
- making `project_state` the rich project-state compiler prevents two parallel
  implementations from drifting or disagreeing

## 2026-04-25 - Phase 2 bucket set is locked

Decision:

- Phase 2 includes soft-source authority, corpus system, Memory Maintenance
  Loop, hybrid retrieval, graph knowledge, project-state capsules, proactivity
  and planner surfacing, skills/tools, gated self-improvement, operator
  UX/observability, and privacy/prompt-injection hardening
- broad capsule families, ungated global self-improvement, aggressive privacy
  enforcement, and automatic third-party installation remain out of the first
  Phase 2 implementation pass

Reasoning:

- the locked set covers the high-leverage behavior needed after MMV2 storage
  cutover while keeping the first derived-feature pass inspectable, reversible,
  and no-dark-data compliant

## 2026-04-25 - Soft-source authority admits useful non-user knowledge without promoting it to user truth

Decision:

- source authority tiers are `user_authoritative`, `curated_authoritative`,
  `tool_grounded`, `cited_soft`, and `inspection_only`
- explicit user turns and curated corpus inputs may admit durable facts,
  references, procedures, rules, and preferences according to their source
  profile
- researcher reports, cited assistant answers, daily continuity, and
  tool-grounded summaries may create usable lower-authority memories only with
  provenance and source profile metadata
- raw transcripts, raw prompts, raw tool logs, secrets, and private phrases are
  rejected or kept inspection-only according to safety policy
- authority promotion requires explicit user approval or replacement by a
  higher-authority source; corroboration may raise confidence but not authority

Reasoning:

- useful facts often arrive through agents, tools, and cited summaries, but
  treating them as equivalent to explicit user memory would collapse trust and
  make conflict handling unsafe

## 2026-04-25 - Memory Maintenance Loop owns derived maintenance cadence

Decision:

- the user-facing product term is Memory Maintenance Loop, not dreaming
- cadence is event-driven plus heartbeat plus daily review
- maintenance may consolidate derived and soft-source artifacts, surface
  candidates, report stale/conflict/cache issues, and propose planner or
  self-improvement actions
- maintenance must not mutate canonical MMV2 durable truth without an explicit
  approved write path
- maintenance candidates stay active for 30 days, archived for 90 days, and may
  be pinned

Reasoning:

- the system needs background consolidation and hygiene, but framing it as
  maintenance keeps behavior inspectable and separates derived work from
  semantic authority

## 2026-04-25 - Phase 2 retrieval, graph, capsules, planner, and self-improvement stay authority-aware and gated

Decision:

- deterministic retrieval runs before bounded hybrid expansion
- lower-authority soft sources are limited to research/reference,
  project-state, and conflict packs unless explicitly approved
- graph knowledge is derived `runtime_graph` state; inferred probationary edges
  are read-time only until promoted through an approved source path
- Phase 2 capsules start with `project_state` only, including labeled soft and
  conflict sections
- planner/proactivity surfaces maintenance and opportunity candidates through
  contextual one-liners, heartbeat, and artifacts
- skills/tools require three similar successful traces or one explicit ask plus
  one successful manual run; repo-local/workspace-local proposals come first,
  and global Codex skill promotion requires a second approval

Reasoning:

- Phase 2 should increase retrieval quality and useful proactivity without
  silently changing behavior, installing automation, or elevating lower-trust
  evidence into operational directives

## 2026-04-23 - Closeout reports and retrieval miss telemetry are operational artifacts, not truth

Decision:

- shared ingestion closeout/quarantine reports are runtime-state/artifact
  outputs, not SQL semantic truth
- retrieval/projection miss diagnostics and ranking-feature telemetry remain
  read-time only
- hash-invalid, stale, conflicted, inactive, deleted, and superseded records
  are excluded from normal runtime packs unless explicitly requested for
  inspection

Reasoning:

- operators need to know whether memory existed but was excluded, which stage
  failed, and which provider/model/schema was involved
- writing these diagnostics into durable semantic tables would create a second
  truth layer and invite auto-fix pressure
- artifact-safe reports can be rotated/pruned without touching canonical MMV2
  memory rows

## 2026-04-23 - Mini remains strict capture default while the corrected Codex lane remains externally blocked

Decision:

- `openai-codex/gpt-5.4-mini` remains the strict MMV2 capture/ingest default
- nano remains explicit low-risk/benchmark-only until strict-schema and
  evidence-quality parity is proven
- current live validation evidence must record the actual provider/auth lane
  and be classified as externally blocked when the corrected native Codex
  route fails at the provider boundary (`403`) or does not complete inside the
  bounded live retry window

Reasoning:

- prior measured runs showed mini succeeds strict-schema capture while nano
  route quality remains unresolved for strict admission
- the earlier `429` evidence came from the wrong OpenAI chat-completions pipe;
  routing that traffic through the native Codex responses route is now fixed,
  so further failures must be judged against the corrected lane rather than the
  old wrong-pipe artifact
- a provider-route or auth-lane failure is not a source failure, not a
  model-quality result, and not permission to fake benchmark success

## 2026-04-23 - Warm skill-load state is session-snapshot truth

Decision:

- skill-status may report installed and discovered skills from the workspace
  and managed skill directories
- loaded/current/stale state is reported only from persisted session skill
  snapshots
- if no persisted snapshot exists, the diagnostic must say `not_available`
  with the exact reason

Reasoning:

- claiming warm-session loaded state without runtime evidence creates false
  operator confidence
- persisted session snapshots are the narrow truthful surface currently
  available without adding a live in-memory agent-inspection channel

## 2026-04-23 - Strict MMV2 admission defaults to mini after live nano boundary failures

Decision:

- default strict MMV2 capture/ingest model routing now resolves to
  `openai-codex/gpt-5.4-mini`
- keep explicit rollback/override through `MODEL_MEMORY_STRICT_CAPTURE_MODEL_ID`
  and document-ingest-specific model env controls
- retain nano only for explicit low-risk/high-volume lanes such as
  deterministic classification, ranking/filtering, benchmark comparison, or
  other non-admission first-pass work
- do not let nano silently become the default strict canonical admission route
  unless it later passes strict-schema and evidence-quality gates

Reasoning:

- the measured configured nano route repeatedly failed strict structured-output
  contracts at the provider boundary
- mini was materially slower but passed the strict-schema capture/ingest
  quality bar; correctness is the higher-priority gate for canonical memory
  admission

Rollback:

- set `MODEL_MEMORY_STRICT_CAPTURE_MODEL_ID` or
  `MODEL_MEMORY_DOCUMENT_INGEST_MODEL_ID` to the intended explicit route for a
  controlled run
- keep benchmark model routing independent so nano experiments do not alter
  live strict admission defaults

## 2026-04-23 - Main UX audit fixes are operational hardening, not semantic redesign

Decision:

- repair runtime-dirty filesystem ownership narrowly for gateway UID `1000`
- classify dirty-state permission/write failures as operational persistence
  failures instead of generic `other`
- capture durable operational preferences/directives about safe blocker
  handling through the general ordinary-turn directive/preference path
- capture tool-result operational blockers as bounded facts with no raw tool
  log persistence
- keep skill-vetting reports in the writable operator workspace report tree
  and keep host-operator skill installation explicit, audited, and redacted

Reasoning:

- the audited UX failures were mechanical capability and observability gaps:
  permission denial, poor tool-shape discoverability, weak operational fact
  capture, and unsafe log verbosity
- these fixes improve live operations without changing MMV2 semantic truth or
  adding a migration

Rollback:

- disable affected capture seams with their existing capture-seam/env kill
  switches
- restore prior model routes only through explicit env overrides
- disable host-operator writes with `OPENCLAW_HOST_OPERATOR_WRITE_ENABLED=false`
  if canonical skill/doc writes need to be paused

## 2026-04-23 - Live pre-Phase-2 gates use approved durable proof plus artifact-only benchmarks

Decision:

- run Pass 6 benchmarks with real provider/model calls, but keep all
  benchmark/eval output artifact-only
- use `openai-codex/gpt-5.4-mini` for strict-schema benchmark/capture routes
  until the configured nano route proves strict structured-output support
- treat `provider_json_boundary` from the configured nano route as an external
  route capability blocker, not a source/document failure
- use `reasoning_effort=none` for direct API benchmark calls and
  `reasoning_effort=low` for Codex app-server calls; do not force a paid
  priority/fast service tier unless explicitly configured
- prefer section-map plus candidate-hints for large documents after the
  measured `DECISIONS.md` run because it preserved original-source validation
  better than direct rigid capture
- allow exactly the operator-approved `MEMMECH-LIVE-2026-04-23` project fact
  to enter live durable memory as long-term workspace state
- keep all other proof, soak, benchmark, and projection artifacts out of the
  live durable-memory DB
- make capture job execution idempotent once a job is `written`; duplicate
  proof reruns must not regress job state to queued/failed
- keep generated projections under the projection artifact root and ignore
  repo-local `.openclaw/` artifacts in git

Reasoning:

- the mechanical path needed real latency/schema/failure evidence, but that
  evidence is operational telemetry, not semantic memory
- the approved durable payload is legitimate long-term project state, so it is
  the only safe live row proof payload for the clean MEMMECH soak
- strict-schema conformance matters more than raw latency for capture and
  retrieval-interpretation correctness
- Codex app-server currently exposes less token/cache telemetry than direct
  API routes, so cache-health reports should distinguish "zero reported
  cached tokens" from "provider definitely did not cache"

Rollback:

- disable capture seams globally with `MODEL_MEMORY_CAPTURE_SEAMS_ENABLED=false`
- disable Safe Level 1 execution with its global/per-action kill switches
- ignore/regenerate `.artifacts/model-memory/pass6-live-benchmark/`,
  `.artifacts/model-memory/large-doc-compression/`,
  `.artifacts/model-memory/projection-live-behavior/`, and
  `.artifacts/model-memory/memmech-proof/`
- keep the approved durable project fact as normal workspace state unless the
  operator explicitly asks for a semantic correction through the normal MMV2
  correction path

## 2026-04-22 - Pre-Phase-2 gates prefer artifact-safe proof over fake live DB writes

Decision:

- finish Pass 6 as a cache-aware benchmark/compression harness plus safe
  artifact reports, not as benchmark/eval durable memories
- materialize the full rich projection catalog from live MMV2 records into the
  projection artifact root only
- activate capture seams by policy only when the seam has production evidence,
  dedupe/no-dark-data tests, and global plus seam-specific kill switches
- keep `message:received` and `message:transcribed` fallback-only unless the
  primary `message:preprocessed` seam is unavailable
- enable Safe Level 1 Memory Ops auto-fix planning only for operational
  artifact/job/runtime-state actions
- keep semantic auto-fix, memory deletion, auto-supersession, semantic
  candidate repair, and fuzzy correction disabled
- treat the MEMMECH proof as mechanically clean only for artifact-safe gates;
  live durable ordinary-turn row proof needs an operator-approved durable
  payload or isolated/staging DB

Reasoning:

- benchmark/proof output is evaluation data, not durable semantic truth
- projections are derived context views; writing them under the projection
  artifact root is safe, writing them to root `USER.md` or `MEMORY.md` is not
- safe operational auto-fixes can reduce toil without mutating MMV2 semantic
  truth
- removing all legacy public exports would currently break the plugin SDK and
  older admin/proof scripts, so the correct near-term posture is quarantine
  plus default-hot-path import tests

Rollback:

- disable all capture seams with `MODEL_MEMORY_CAPTURE_SEAMS_ENABLED=false`
- disable individual seams with their `MODEL_MEMORY_CAPTURE_SEAM_*_ENABLED`
  env switches
- ignore or remove `.artifacts/model-memory/pass6-cache-aware-benchmark/` and
  `.artifacts/model-memory/memmech-proof/` if reports need regeneration
- remove or ignore `$OPENCLAW_STATE_DIR/model-memory/runtime-dirty/` and
  `$OPENCLAW_STATE_DIR/model-memory/capture-jobs/` to reset operational state
- keep semantic-truth auto-fix disabled; semantic changes require operator
  approval tickets

## 2026-04-22 - Pool, persistence, and provider telemetry stay operational

Decision:

- implement Passes 3-5 without a SQL migration
- use priority semaphores/queue lanes over separate physical DB pools for the
  first live hardening pass
- keep operational scorecards and pressure telemetry outside MMV2 semantic
  truth as runtime-state artifacts or in-memory snapshots
- classify `pool_pressure` as a retryable shared ingestion failure class
- allow capture/rebuild to defer under pressure while retrieval remains the
  highest-priority DB lane
- batch persistence where idempotency is already deterministic, and defer
  invalid candidates/edges with safe ids and reasons rather than rolling back
  valid siblings
- run document-ingest preflight against actual strict-schema contracts before
  corpus work; generic JSON-object provider health is not sufficient proof

Reasoning:

- multiplying physical pools would risk increasing total DB connection pressure
  before the live workload proves that separate pools are necessary
- the immediate availability problem is starvation and write amplification, so
  priority lanes plus circuit-breaker style deferral are lower risk and require
  no migration
- invalid candidates and bad edges are data-quality or persistence-boundary
  events; they should be inspectable without causing source-wide failure
- provider/model reliability needs scorecards, but scorecards are operational
  telemetry, not semantic memory

Rollback:

- reduce lane concurrency through the `MODEL_MEMORY_DB_*_LANE_CONCURRENCY`
  knobs
- raise or disable pressure sensitivity by adjusting
  `MODEL_MEMORY_DB_POOL_PRESSURE_*` thresholds
- keep document ingest paused if strict-schema preflight fails for any required
  contract
- ignore or delete runtime-state provider scorecard artifacts if operational
  telemetry needs a clean reset

## 2026-04-22 - Durable capture jobs use runtime-state spool, not MMV2 DB tables

Decision:

- implement Pass 1 durable capture jobs without a DB migration
- persist safe job snapshots and append-only job events under
  `$OPENCLAW_STATE_DIR/model-memory/capture-jobs/`
- keep the semantic durable-memory DB reserved for MMV2 truth, not job queue
  bookkeeping
- store only safe metadata:
  - capture job id
  - session id/key
  - agent id
  - source kind
  - source hash/fingerprint
  - status
  - failure class/stage
  - retry count and next attempt time
  - timestamps
  - model/provider labels
  - safe related source/segment/memory/event/projection ids
- keep raw user turns, assistant turns, transcripts, and tool logs out of the
  durable job store
- make replay an inspection marker only unless a future approved design adds a
  source-preserving replay substrate with no raw-payload storage

Reasoning:

- this satisfies the storage gate without hiding an unapproved migration
- capture outcomes now survive process restarts for inspection/replay planning
  while raw turn payloads remain in-memory only during the immediate capture
  execution/retry
- later dirty-state scheduling, pool backoff, and MEMMECH proof can depend on
  stable capture job ids without coupling job state to MMV2 semantic truth

Rollback:

- remove or ignore the runtime-state capture job spool
- disable or reduce capture retries with `MODEL_MEMORY_CAPTURE_JOB_MAX_RETRIES`
- set `MODEL_MEMORY_CAPTURE_JOB_CONCURRENCY=1` for the current conservative
  default worker behavior

## 2026-04-22 - Runtime dirty state uses the runtime-state spool, not MMV2 SQL

Decision:

- implement Pass 2 dirty state and rebuild scheduling without a DB migration
- store dirty snapshots/events under
  `$OPENCLAW_STATE_DIR/model-memory/runtime-dirty/`
- keep runtime dirty state operational only; MMV2 SQL remains semantic truth
- make ordinary-turn and bounded tool-result capture mark dirty and schedule or
  defer rebuilds instead of synchronously rebuilding runtime/projection tables
- coalesce rebuilds by write count or elapsed dirty age using:
  - `MODEL_MEMORY_RUNTIME_REBUILD_ENABLED`
  - `MODEL_MEMORY_RUNTIME_REBUILD_COALESCE_WRITES`
  - `MODEL_MEMORY_RUNTIME_REBUILD_COALESCE_MS`
  - `MODEL_MEMORY_RUNTIME_REBUILD_MAX_CONCURRENCY`
  - `MODEL_MEMORY_RUNTIME_REBUILD_RETRY_DELAY_MS`
  - `MODEL_MEMORY_RUNTIME_REBUILD_MAX_RETRIES`
- preserve `MODEL_MEMORY_REBUILD_BLOCKING_LOCK_ENABLED=true` as the explicit
  rollback flag for blocking advisory-lock behavior, while the default remains
  fail-fast try-lock behavior

Reasoning:

- dirty/rebuild status must survive process reloads better than an in-process
  marker, but it is operational scheduler state and does not belong in
  semantic durable memory
- capture jobs should not fail just because rebuild work is deferred, coalesced,
  disabled, or lock-busy
- runtime projections/read models are derived artifacts; delayed rebuilds must
  not mutate canonical truth or write generated projections back to root
  `USER.md` / `MEMORY.md`

Rollback:

- set `MODEL_MEMORY_RUNTIME_REBUILD_ENABLED=false` to keep marking dirty while
  preventing automatic rebuild scheduling
- remove or ignore `$OPENCLAW_STATE_DIR/model-memory/runtime-dirty/` if the
  runtime-state spool needs a clean scheduler reset
- set `MODEL_MEMORY_REBUILD_BLOCKING_LOCK_ENABLED=true` only as a temporary
  compatibility rollback for older rebuild-lock behavior

## 2026-04-22 - Remaining capture/ingest mechanical repair is split into passes

Decision:

- treat the bounded capture hardening already landed as groundwork, not the
  full repair
- complete the remaining mechanical work in this order, with Pass 1 now
  complete and Pass 2 implemented in source:
  - durable capture job queue/retry/replay (completed with runtime-state spool)
  - durable dirty marker and coalesced rebuild scheduler (implemented with
    runtime-state spool)
  - DB pool lanes or priority semaphores with pool-pressure circuit breaker
  - batch persistence and candidate savepoints/deferred invalid reports
  - provider strict-schema preflight wiring and provider/model scorecards
  - cache-aware mini/nano and large-document compression benchmarks
  - final MEMMECH proof and current-runtime soak
- make durable capture jobs the first major implementation pass because later
  scheduling, pool backoff, replay, and proof surfaces need stable job ids and
  durable status first
- stop before implementation if durable job or dirty-state storage requires a
  SQL migration that has not been explicitly approved

Reasoning:

- live capture failures must be durable and inspectable before retry,
  scheduling, or pool-pressure behavior can be trusted
- rebuild coalescing and pool lanes need capture jobs as backpressure inputs
- batching/savepoints need durable failure records so valid/invalid candidate
  outcomes can be audited without raw source replay
- model benchmarks should wait until DB/rebuild mechanics stop dominating the
  observed latency/failure signal

## 2026-04-22 - Capture performance hardening is mechanical, not semantic

Decision:

- treat the failed current-runtime partial-corpus soak as a mechanical
  capture/ingest availability failure, not a reason to change MMV2 semantic
  truth
- keep user-facing turns non-blocking, but make background capture observable
  through safe job events and shared failure classes
- disable ordinary-turn synchronous runtime rebuild by default; capture writes
  mark runtime/projection state dirty and explicit admin/proof paths can still
  request rebuild
- prefer try-lock/fail-fast rebuild behavior over blocking
  `pg_advisory_xact_lock`, with
  `MODEL_MEMORY_REBUILD_BLOCKING_LOCK_ENABLED=true` as rollback
- bound reconciliation by scope and projected columns for ordinary capture
  rather than decoding all durable memories on every turn
- validate edge endpoints with one batched lookup before FK-backed edge writes
- make DB pool sizing/timeouts configurable without a migration
- preflight actual strict-schema contracts, not only generic JSON-object
  provider health
- record prompt-cache keys, prefix/schema hashes, token usage, cached token
  counts, model/provider, and latency as bounded telemetry only
- redact ordinary-turn source-window content before persistence; keep only
  hashes, counts, safe metadata, and bounded evidence quotes used by admitted
  memory records

Reasoning:

- read-only DB timing shows the live DB is small enough that table size alone
  is not the root cause
- timeout logs point to contention, rebuild coupling, pool pressure, and
  provider/schema mechanics
- fixing this by semantic heuristics, fuzzy correction, or broader legacy
  fallback would make the memory system less trustworthy
- the durable repair is to decouple capture writes from rebuilds, make capture
  outcomes inspectable, reduce DB round trips, and prevent raw ordinary-turn
  text from becoming durable source data

## 2026-04-22 - Partial-corpus proof can proceed before full ingest completes

Decision:

- allow retrieval/projection proof against the already-ingested partial corpus
  while the full document ingest remains paused
- label that proof as partial-corpus/current-runtime evidence, not full
  post-ingest proof
- allow projection catalog materialization as artifact-only output under the
  projection artifact root, never as root `USER.md` or `MEMORY.md` write-back
- treat a final current-runtime soak as not clean if ordinary-turn durable
  capture does not produce durable rows, even when the UI prompt run itself
  completes

Reasoning:

- the paused corpus already has enough MMV2 source/segment/memory/event
  evidence to test retrieval and projection behavior without spending more
  provider credits
- partial proof is useful only if it is honestly labeled and cannot be
  explained by same-session transcript or root workspace memory files
- soak credibility depends on durable capture evidence, no-store rejection,
  retrieval/projection proof, and root no-write proof; a DB timeout in the
  async capture lane is a real blocker, not a cosmetic warning

## 2026-04-22 - Storage compatibility identity is structural only

Decision:

- keep `extensions/model-memory/src/mmv2/storage-compatibility.ts` as a
  temporary compatibility bridge only
- remove its dependency on legacy `semantic-identity.ts`
- derive compatibility identity keys only from MMV2 durable record fields:
  canonical class, kind, artifact type, scope, payload, canonical text, and
  source refs
- preserve rollback/read-shape compatibility without allowing legacy
  semantic-family identity to re-enter default MMV2 hot paths

Reasoning:

- storage compatibility still has transitional value for fallback/read-shape
  consumers
- legacy semantic identity is not acceptable write-path authority for MMV2
  truth
- a structural projection keeps the fallback slice reversible and testable
  without fuzzy collision/family behavior

## 2026-04-22 - Proof-runner candidate identity stays stable for single batches

Decision:

- preserve extraction candidate ids when document or ordinary-turn extraction
  uses a single atomic or composite batch
- reserve `atomic-<batch>:` / `composite-<batch>:` prefixes for true
  multi-batch collision protection only
- treat prefixed single-batch ids as a structural bug because admission,
  reconciliation-neighbor lookup, scripted proof fixtures, and operator
  evidence all use candidate ids as phase-to-phase correlation keys
- expand ordinary-turn proof coverage by reusing existing adjudicated MMV2
  proof cases rather than adding topic-specific parser fixtures

Reasoning:

- the proof-runner project-fact failures came from candidate-id rewriting, not
  from missing project-fact semantics
- fixing the structural id flow keeps MMV2 canonicalization/admission general
  and avoids semantic forests, fuzzy supersession, and marker/topic-specific
  shortcuts
- ordinary-turn coverage should fail if duplicate prevention, source-ref merge,
  scoped conflict, no-store/temp rejection, workspace scoping, or no-fuzzy
  behavior regresses

## 2026-04-22 - Shared ingestion funnel starts as contracts plus safe adapters

Decision:

- define one shared ingestion-funnel contract and failure taxonomy for
  document ingest, ordinary-turn capture, tool-result capture, daily recovery,
  bootstrap import, and future heartbeat/proactive capture
- make provider-boundary failures, prompt planning, retry decisions,
  candidate validation, persistence endpoint validation, and no-dark-data
  telemetry reusable instead of runner-only behavior
- route malformed capture-routing repair output to a safe skipped batch rather
  than failing the whole source/turn
- keep extraction/canonicalization truth semantics unchanged until the next
  deeper candidate-level quarantine slice can be implemented with proof-runner
  compatibility
- do not resume deep document ingest until the shared funnel has enough
  candidate-level quarantine/persistence coverage and provider credits pass
  preflight

Reasoning:

- the paused ingest failures repeat across memory paths, so a runner-only fix
  is insufficient
- the first safe slice is shared contracts, telemetry, provider boundaries,
  and persistence endpoint validation; a broad rewrite of extraction,
  admission, or reconciliation would risk silently changing MMV2 truth
- malformed repair output must be classified or quarantined, not retried in an
  unbounded loop
- the remaining proof-runner project-fact blocker should be fixed directly in
  the scripted MMV2 path; it must not be worked around with topic parsers,
  semantic forests, or fuzzy supersession

## 2026-04-22 - Docs sync auth requires a write-scoped external credential (historical, superseded)

Historical provenance only. Do not use this decision as the current downstream
operator path.

Decision:

- keep `.github/workflows/docs-sync-publish.yml` using
  `OPENCLAW_DOCS_SYNC_TOKEN` for publishing to `openclaw/docs`
- fail fast when the token is missing or cannot read/push the publish repo
- do not echo token-bearing remotes; configure the token as a local Git extra
  header inside the runner
- preferred credential is a GitHub App installation token scoped to
  `openclaw/docs` with Contents read/write
- acceptable fallback is a fine-grained PAT stored as
  `OPENCLAW_DOCS_SYNC_TOKEN` on the canonical downstream repo
  `ConorLynchOCGit/openclaw-platform`, scoped only to `openclaw/docs`,
  Contents read/write, with explicit expiration/rotation

Reasoning:

- the workflow reached the publish push step and failed because GitHub rejected
  credentials for `https://github.com/openclaw/docs.git/`
- the current source repo has no Actions secret and the current operator
  account only has READ permission on `openclaw/docs`
- workflow logic can be hardened locally, but successful publishing requires a
  credential owned by the organization/repo with write access to the docs repo

Superseded by the 2026-04-24 downstream same-repo docs bundle posture, which
also retires the old cross-repo locale-dispatch path.

## 2026-04-22 - Deep ingest failures require funnel hardening before resume

Decision:

- do not resume the paused 2026-04-22 deep-ingest corpus until provider
  health/credit preflight succeeds
- keep the runner failure circuit breaker enabled by default
- retry failed sources only by explicit failure class after the matching code
  path is fixed
- treat malformed repair output and provider JSON-boundary output as quarantine
  classes, not reasons to repeatedly re-query the provider
- validate MMV2 memory-edge endpoints before writing `memory_edges`; defer
  invalid edges into bounded event metadata rather than causing FK failures or
  mutating target state
- use progress/cost telemetry to stop expensive runs early when failure rate or
  circuit-breaker reason says the funnel is unhealthy

Reasoning:

- the paused run showed systemic provider/funnel failures, not isolated bad
  documents
- blindly retrying the failed set burns credits and hides true failure classes
- the right repair is better preflight, retry boundaries, quarantine reports,
  endpoint validation, and operator telemetry while preserving MMV2 truth
  semantics
- none of these hardening changes justify semantic forests, topic parsers,
  fuzzy write-path correction, or legacy collision fallback

## 2026-04-22 - Hardening landing accepted with explicit correction rerun evidence

Decision:

- treat `.artifacts/model-memory/soak-ui-validation/2026-04-22-hardening-land-soak/`
  as the hardening landing proof root for the current runtime
- accept the correction gate only from the targeted rerun:
  - correction memory `7b3811fb-9613-5443-bc73-dd6799f893f1`
  - event `9eb0cc1c-aa6a-54cc-8de4-4e7c8e42cb77`
  - supersession edge `0da10fcc-b5a7-5962-9d69-982d748755d6`
  - exact target memory `231bd0a5-2f7c-5f65-af75-397668a2e960`
- record the original correction attempt as a live capture timeout, not a
  semantic/reconciliation failure
- accept projection-backed recall evidence only when projection versions list
  the fresh active MMV2 ids as sources; do not count root `USER.md` /
  `MEMORY.md`, same-session transcript, or raw workspace-file context as proof
- keep retrieval timeout evidence visible as runtime availability debt; do not
  patch it with topic parsers, semantic forests, or fuzzy write-path matching
- document ingest remains paused and must be resumed later from the checkpoint
  with the `model-memory-deep-ingest` skill/runbook

Reasoning:

- the correction rerun proved the intended structural target behavior without
  inventing a topical match
- the first failed correction attempt exposed runtime DB/connectivity
  fragility, so the durable lesson is to improve availability/diagnostics, not
  to weaken memory semantics
- the hardening patchset can be landed as substrate progress while preserving
  the honest caveat that global recall quality and prompt-specific live
  retrieval availability are not solved

## 2026-04-22 - Live memory activity feed is telemetry, not capture

Decision:

- add a bounded main-feed memory activity mirror behind
  `MODEL_MEMORY_ACTIVITY_FEED_ENABLED`
- activity-feed messages may show retrieval request/result/pack ids, selected
  memory ids, projection ids, capture source/event ids, counts, and bounded
  status labels
- activity-feed messages must not contain raw prompt text, full transcripts,
  raw tool logs, secrets, or private phrases
- activity feed does not change MMV2 truth, capture admission, reconciliation,
  or retrieval ranking
- the 2026-04-22 deep ingest remains paused for overnight continuation from
  checkpoint `checkpoints/model-memory/model-memory-deep-pass-2026-04-22b.json`
- install `model-memory-deep-ingest` as both a repo-local OpenClaw skill and a
  Codex global skill so future deep-ingest pickup starts from the MMV2 runbook
  and checkpoint workflow rather than exploratory source spelunking

Reasoning:

- the older semantic-forest path made memory actions visible through tool
  calls; MMV2 moved memory work into internal runtime paths, which made normal
  turns opaque to the operator
- the scalable fix is explicit bounded telemetry in the live feed, not raw
  prompt/tool-log capture or semantic write-path heuristics
- ingestion failures from the paused corpus are provider/extraction/
  canonicalization work items and must not drive topic-specific parsers or
  fuzzy semantic fallbacks

## 2026-04-22 - Post-landing substrate hardening proceeds without semantic forests

Decision:

- the landed runtime-hardening state at `ee0c093c1a` is the baseline for the
  next memory pathway push
- bounded tool-result proof/capture is treated as landed, not future work, but
  remains constrained to bounded tool evidence and kill switches
- the next fallback quarantine slice is legacy captured-object write
  compatibility:
  - default MMV2 live paths must not silently construct legacy
    `DatabaseMemoryObjectStore`
  - rollback/fallback requires an explicit flag
  - tests must keep default write/retrieval hot paths away from legacy
    semantic-family and collision modules
- the 2026-04-22 deep-ingest substrate pass uses a curated 304-source corpus
  rooted at `.artifacts/model-memory/document-ingest/2026-04-22-corpus/`
- retrieval/projection quality hardening must stay read-time only:
  projection-digest preference, lexical/source-lineage/recency ranking,
  exclusion telemetry, and miss diagnostics cannot mutate canonical truth
- ordinary-turn eval hardening must fail if topic-specific parsers, fuzzy
  write-path supersession, duplicate capture, raw-data persistence, or root
  workspace-memory write-back returns

Reasoning:

- the user accepted the clean soak and runtime-boundary proof; the project now
  needs substrate depth and regression protection, not another narrow soak
  workaround
- fallback quarantine must be small and reversible because legacy
  compatibility still carries rollback value
- document ingestion is intentional durable memory ingestion when the corpus is
  curated docs/runbooks/specs/status material; proof artifacts, raw prompts,
  transcripts, raw tool logs, and Memory Ops JSONL remain excluded
- the scalable fix for retrieval misses is observable read-time diagnostics,
  not semantic forests or marker/topic heuristics

## 2026-04-21 - Runtime-boundary projection and hook-probe baseline accepted

Decision:

- the runtime-boundary proof rooted at
  `.artifacts/model-memory/runtime-boundary/2026-04-21-hook-projection-proof/`
  is accepted as the post-clean-soak baseline for projection materialization
  and production hook probe evidence
- projection materialization is artifact-only under
  `/root/.openclaw/workspace/.openclaw/model-memory/projections/`
  and does not write generated content into root `USER.md` or root
  `MEMORY.md`
- runtime projection versions and materialized projection files must continue
  to match by content hash
- production hook evidence is distinct from synthetic/static registration:
  only hooks observed during real UI/gateway turns are eligible for capture
  seam wiring
- `message:preprocessed` remains routing/telemetry-only for now because it
  overlaps ordinary-turn capture and carries raw-prompt risk
- the first semantic capture expansion should be bounded tool-result
  proof/capture through `tool_result_persist` and `after_tool_call`, behind
  kill switches and with no raw tool-log persistence

Accepted evidence:

- projection validation:
  `.artifacts/model-memory/runtime-boundary/2026-04-21-hook-projection-proof/projection-db-validation-final.json`
- hook discovery:
  `.artifacts/model-memory/runtime-boundary/2026-04-21-hook-projection-proof/hook-discovery-final.json`
- hook/capture runtime evidence:
  `.artifacts/model-memory/runtime-boundary/2026-04-21-hook-projection-proof/hook-and-seam-evidence-rerun3.json`
- Memory Ops leakage scan:
  `.artifacts/model-memory/runtime-boundary/2026-04-21-hook-projection-proof/memory-ops-leakage-scan-final.json`
- root file hash proof:
  `.artifacts/model-memory/runtime-boundary/2026-04-21-hook-projection-proof/root-hashes-before-rerun3.txt`
  and
  `.artifacts/model-memory/runtime-boundary/2026-04-21-hook-projection-proof/root-hashes-after-rerun3.txt`
- rollback image tag remains
  `openclaw:rollback-memory-soak-20260421T175907Z`

Reasoning:

- this separates projection artifact availability from canonical truth:
  MMV2 SQL remains truth, projections remain compiled views, and retrieval
  may use projection digests only when backed by active MMV2 ids
- this separates hook-health proof from capture wiring:
  production-observed hooks can be wired behind kill switches, synthetic-only
  hooks stay blocked
- bounded tool-result capture is safer than raw prompt capture because it can
  store artifact paths, file counts, command status, URLs, docs/runbooks, and
  error classes without persisting prompts, transcripts, or raw tool logs

## 2026-04-21 - SOAKQUAR accepted as clean MMV2 retrieval-runtime soak baseline

Decision:

- `SOAKQUAR-2026-04-21` is accepted as the first clean MMV2
  retrieval-runtime soak baseline
- the accepted artifact root is
  `.artifacts/model-memory/soak-ui-validation/2026-04-21-semantic-quarantine-soak/`
- the rollback image tag preserved for this baseline is
  `openclaw:rollback-memory-soak-20260421T175907Z`
- future memory-lane regressions should compare against this baseline rather
  than the earlier failed preflight/partial soak artifacts
- post-soak work may proceed in this order:
  - fallback compatibility removal/quarantine in small reversible slices
  - ordinary-turn MMV2 eval hardening
  - retrieval-runtime relevance/telemetry hardening
  - seeded file-pack/provider variance reporting
  - production-safe hook canaries
  - verified primary capture seam expansion behind kill switches

Accepted evidence:

- preference memory `992ee8e3-ce78-518f-87fa-defcb9457404` with event
  `e4feb0f6-d9bb-5561-a807-34c41509990f`
- directive memory `9f681bb4-0524-5972-8f2f-2e247b46d8b4` with event
  `83feef07-5548-547d-9e3c-c096c93f35bb`
- project fact memory `4720dede-c33d-5c5e-835e-7e1be6d3445d` with event
  `5da8d9ae-883e-5b6d-8d84-79d225c04b88`
- structural correction memory `e64c1528-d6c2-52b3-8674-38172dc4604a`
  with event `f31dcea6-5bc8-53d5-8743-2c19143b1f47`
- structural supersession edge
  `fa9a259f-330b-5f06-bf11-79f62a0ffe47` from the correction memory to
  the targeted preference memory
- fresh recall retrieval request
  `c9d9c67c-410a-5729-a02e-e5cf0a761b8e` selected fresh soak memory ids
  through direct retrieval telemetry/retrieval-pack evidence
- Memory Ops latest report
  `.openclaw-memory-ops/reports/latest.md` remained observe/report-only with
  auto-fix disabled and no raw prompt/transcript/tool-log/private phrase
  leakage
- root `USER.md` and root `MEMORY.md` did not mutate during ordinary UI
  soak prompts

Reasoning:

- the accepted bar is not perfect global recall quality
- the accepted bar is observable, bounded MMV2 behavior:
  canonical durable rows/events/edges, structural correction, relevant
  retrieval telemetry, no dark-data leakage, and no legacy semantic-family
  write-path inference
- this prevents the project from being trapped in endless optimization loops or
  solving soak failures through brittle semantic forests

## 2026-04-21 - Semantic forest quarantine before clean-soak acceptance

Decision:

- MMV2 live write paths must not use legacy fuzzy semantic-family collision,
  family recall, or same-source-family scoring by default
- correction and supersession are structural:
  - `memory_id` targets may supersede exactly the targeted active memory
  - unresolved or unsupported targets become inspectable unresolved-target
    correction records rather than inferred topical supersession
- explicit project-fact and correction prompts are temporary command-shaped
  capture contracts, not topic parsers
- retrieval relevance may use read-time ranking over lexical, fielded,
  recency, source-lineage, and projection-digest evidence, but retrieval never
  mutates canonical truth
- the clean soak acceptance bar is realistic:
  - capture/event evidence for preference, directive, and project fact
  - structural correction behavior or honest unresolved-target classification
  - temp/privacy no active durable memory
  - fresh recall backed by retrieval telemetry selecting relevant MMV2 ids or
    a projection digest backed by those ids
  - no raw prompt/transcript/tool-log leakage

Reasoning:

- the previous soak blockers were tempting to solve with narrow topic-specific
  patches
- those patches would recreate the old semantic forest and make the system
  brittle
- structural write-path rules and observable read-time ranking let the project
  move through soak without pretending recall quality is globally perfect

## 2026-04-21 - Memory Retrieval Runtime now blocks fallback removal and capture expansion

Decision:

- the next memory layer is a Memory Retrieval Runtime between canonical MMV2
  storage and OpenClaw context assembly
- canonical MMV2 durable records/events/edges remain semantic truth
- projections are compiled views, not write authority
- memory packs are runtime bundles, not durable memory records
- the first implementation should use existing `runtime_context`
  retrieval/context/projection tables and artifacts; do not add a DB migration
  for the first retrieval-runtime pass
- direct retrieval telemetry is required for clean-soak recall acceptance
- projection-backed recall is acceptable only when the retrieval runtime
  selects a fresh MMV2-derived projection/digest with active source memory ids
- root `USER.md`, root `MEMORY.md`, daily notes, and session transcript context
  cannot satisfy MMV2 recall proof by themselves
- compatibility fallback removal and primary capture seam expansion are blocked
  until the retrieval-runtime soak is clean

Reasoning:

- the MMV2-active soak proved capture/storage but failed the recall bar:
  fresh-session recall could be explained by projection/context artifacts and
  did not record direct retrieval requests
- the old V0 retrieval path is too flat: it lacks retrieval planning, pack
  typing, source weighting, conflict/supersession exclusion, projection digest
  selection, and reliable telemetry
- removing fallback or expanding capture before fixing recall would increase
  memory volume without proving the system can retrieve the right active truth
- projections can be faster and more robust than raw DB retrieval for some
  project/entity views, but only when they remain source-linked, fresh, and
  subordinate to canonical MMV2 state

## 2026-04-21 - MMV2 hot paths are native by default and legacy compatibility is soak-window fallback only

Decision:

- active live write paths should persist MMV2 live memory batches into
  MMV2-native durable SQL by default
- active runtime rebuild and the V0 read path should read MMV2 durable truth
  through native runtime records by default
- this decision is superseded for roadmap ordering by the Memory Retrieval
  Runtime decision above
- legacy-shaped captured-object and legacy-style read compatibility should
  remain present only as soak-window fallback/quarantine
- the next roadmap sequence is:
  - implement Memory Retrieval Runtime
  - rerun the clean retrieval-runtime soak
  - remove or further quarantine compatibility after that soak
  - add ordinary-turn MMV2 evaluation coverage
  - stabilize file-pack/provider variance
  - implement primary capture seam expansion
  - implement closed-loop memory ops instrumentation
  - then proceed to graph, capsules, hierarchical retrieval, planner, synthesis,
    and cache/projection policy

Reasoning:

- the storage cutover already made MMV2-native SQL the live semantic authority
- the post-cutover cleanup moved active write/read seams onto MMV2-native
  contracts
- keeping old compatibility on the normal path would preserve the wrong mental
  model and delay Phase 2 derived features
- capture and operational safety need to be complete before graph/capsule work
  consumes the live memory substrate more aggressively

## 2026-04-21 - MMV2-native durable storage is now the live semantic authority with archive-only legacy retention

Decision:

- live semantic truth for `model-memory` now lives in MMV2-native durable SQL
  tables:
  - `model_memory.ingest_sources`
  - `model_memory.ingest_segments`
  - `model_memory.durable_memories`
  - `model_memory.memory_events`
  - `model_memory.memory_edges`
- the old five-kind canonical tables are no longer live semantic authority
- the first-pass storage posture is:
  - MMV2-native durable write truth
  - temporary write-side compatibility adapter for non-MMV2 upstream seams
  - temporary read-side compatibility projection for rebuild/retrieval/runtime
    consumers
- the live reset is destructive by design:
  - no legacy row migration into MMV2
  - full DB backup first
  - archive-only preservation of legacy DB state
- rollback for the first soak cycle is operational, not a code revert:
  - restore the full DB backup
  - set `MODEL_MEMORY_STORAGE_ENGINE=legacy` if needed
  - restart `openclaw-gateway`

Reasoning:

- the old five-kind schema had become mostly heavy-ingest residue and was no
  longer the desired semantic truth contract
- MMV2 already carried the richer durable contract needed for first-class
  composites, conflicts, lineage, and scoped truth
- a destructive reset with explicit backup and one-soak fallback is cleaner
  than attempting lossy legacy-row migration into a new semantic contract
- temporary compatibility layers are acceptable only as a bounded bridge while
  the remaining upstream/read seams are rewired to MMV2 directly

## 2026-04-17 - Phase 2 uses kind-primary semantics, project-state capsules first, and operator-visible review surfacing

Decision:

- Phase 2 should treat `kind` as the preferred primary semantic axis
- `canonicalClass` should be treated as a secondary or derived facet
- the first capsule flavor should be `project_state`
- planner and synthesis review items must surface through ordinary OpenClaw
  workflow:
  - relevant turns
  - heartbeat
  - daily operator review
- surfacing should use three lanes:
  - `must_surface`
  - `context_surface`
  - `background_only`
- third-party skill recommendations should resolve to:
  - `install`
  - `inspire`
  - `reject`
- approved `install` means real install under the current unrestricted-skills
  posture

Reasoning:

- observed runtime behavior shows `kind` is more stable than `canonicalClass`
- project-state capsules are easier to verify than a generic subject capsule
- hidden review queues are operationally weak; surfacing must occur in the
  operator channels the user already consumes
- ClawHub evaluation needs a clear recommendation contract and explicit review
  before adoption

## 2026-04-15 - production cutover flip executed with native no-memory rollback

Decision:

- production now runs with:
  - `plugins.entries.model-memory.config.live.enabled = true`
  - `plugins.slots.memory = "none"`
  - `agents.defaults.memorySearch.enabled = false`
- the gateway/runtime was rebuilt and restarted on the live Docker Compose
  path
- rollback remains:
  - disable `model-memory`
  - keep legacy slot off
  - keep legacy search off
  - continue in native no-memory mode

Reasoning:

- the repo already had the required live-runtime seams
- the live cutover was blocked only by operational execution
- the remaining risks are better handled by a 72-hour watch and sampled review
  than by another pre-cutover duplicate-tuning sprint

## 2026-04-15 - aggressive cutover execution uses direct live runtime seams, not the legacy memory slot

Decision:

- the repo now executes cutover by wiring `model-memory` directly into the
  live runtime path
- `model-memory` live mode is controlled explicitly through:
  - `plugins.entries.model-memory.config.live.enabled`
  - optional env override `MODEL_MEMORY_LIVE_ENABLED`
- rollback does not restore the legacy memory stack
- the production cutover posture remains:
  - `plugins.slots.memory = "none"`
  - `agents.defaults.memorySearch.enabled = false`

Reasoning:

- the previous repo state still treated `model-memory` as an operator/proof
  surface instead of the active runtime path
- a cutover-ready repo needs real seams for:
  - bootstrap/context injection
  - live assistant-turn capture
  - startup warmup
  - operator visibility
  - explicit disablement
- forcing `model-memory` through the old `memory-core` slot would preserve the
  legacy authority surface instead of retiring it

## 2026-04-15 - fallback candidate admission may tolerate structural drift, but final routing must stay local

Decision:

- for `raw_text_fallback` candidate admission only, exact:
  - `canonicalClass`
  - `kind`
  - `scopeKey`
    are no longer mandatory pre-adjudication filters
- those structural fields must instead travel into bounded adjudication as
  advisory features
- final write authority remains local and conservative
- when bounded adjudication selects a fallback candidate as
  `sameCoreMemory = yes` but meaningful structural drift remains, local routing
  should contain that case instead of auto-attaching support

Reasoning:

- the isolated `AGENTS.md` trace showed the earlier bottleneck clearly:
  every zero-candidate case did enter fallback, but all `24 / 24` ended with
  `adjudicationCandidateCount = 0` because structurally drifted neighbors were
  being excluded before adjudication
- after relaxing fallback admission, the same isolated AGENTS surface moved to:
  - `24` fallback cases total
  - `12` fallback cases with `adjudicationCandidateCount > 0`
  - `12` fallback cases with `adjudicationBatchAdmitted = true`
- admitted fallback candidates were often still structurally drifted:
  - different class = `9`
  - different scope = `12`
- local safety therefore still matters:
  - structurally drifted `sameCoreMemory=yes` matches now route to local
    `conflict_hold`
  - the remaining blocker is no longer silent under-admission
  - it is now post-adjudication conversion on drifted same-claim candidates

## 2026-04-15 - unresolved duplicate cases should use one bounded adjudication lane

Decision:

- unresolved duplicate cases should no longer split into:
  - one path for retained structural candidates
  - a separate special-case path for zero-candidate fallback
- instead, the write path should use one bounded adjudication contract after
  deterministic local logic fails to resolve a case confidently
- candidate-source priority is explicit:
  - retained structural candidates first
  - raw-text fallback candidates only when retained candidates are empty
- final write authority remains local:
  - `yes + non_additive => attach_support`
  - `yes + additive => local supersede/distinct`
  - `ambiguous => local conflict_hold`
  - `no => distinct`

Reasoning:

- the split zero-candidate lane had become a special box even though the real
  live blocker also included retained-candidate conversion failures
- one bounded contract is easier to inspect, measure, and keep conservative
- the unified lane proved technically clean on the labeled basket:
  - `overallConversionRate = 1.0`
  - `falseMergeRate = 0`
  - `ambiguousRate = 0`
- but the current-corpus reruns also showed the architectural cleanup is not
  the same thing as cutover readiness:
  - AGENTS still ended at `zero_candidate_skips = 24`
  - gateway/configuration retained cases mostly routed to `direct_distinct`
  - long-horizon proof still ended `not_ready`

## 2026-04-15 - zero-candidate recovery may use raw text search only as a bounded recovery substrate

Decision:

- when the normal write path retains zero candidates, `model-memory` may run a
  bounded zero-candidate recovery lane
- that lane may search prior objects by raw normalized-search-text similarity
- raw text search remains recovery substrate only:
  - it is not merge authority
  - it does not replace the normal path
- final routing still remains local and structural:
  - `sameCoreMemory = yes` and `deltaType = non_additive` may attach support
  - `sameCoreMemory = yes` and `deltaType = additive` must stay in local
    supersede-versus-distinct logic
  - `ambiguous` stays locally contained
  - `no` stays distinct

Reasoning:

- the zero-candidate text-search diagnostic showed that the reviewed
  same-claim neighbor was still top-ranked under raw text search on the tested
  basket
- the new labeled-basket recovery evaluation then showed the lane is locally
  useful:
  - `recoveryRate = 1.0`
  - `falseMergeRate = 0`
  - `ambiguousRate = 0.0625`
- that means the system can let the model answer a tiny sameness question only
  after the strict deterministic path already failed, without turning broad
  text similarity into write authority

## 2026-04-15 - zero-candidate recovery helps locally but does not clear the cutover bar

Decision:

- the zero-candidate recovery lane earns its keep as a bounded repair for
  reviewed zero-candidate misses
- it does not clear cutover readiness by itself
- cutover remains blocked while:
  - long-horizon reruns still create too many fresh active objects
  - the shared preserved-corpus review basket still contains six clear
    should-attach misses
  - the aligned benchmark still reports
    `attachSupportMissRateOnReruns = 0.3571`
  - dense rule sources such as `AGENTS.md` still show deterministic gate loss

Reasoning:

- the lane is clearly useful on the labeled basket and in some targeted traces:
  - `docs/gateway/configuration.md` improved to `attach_support = 5`,
    `conflict_hold = 0`
- but the preserved-corpus proof still ends `not_ready` because long-horizon
  duplicate pressure remains above bar:
  - `startingActiveObjects = 492`
  - `endingActiveObjects = 534`
  - `duplicateActiveObjectCount = 28`
- that means the remaining decision is no longer “does the lane work at all?”
  but “does it move enough real write-path volume to clear cutover?” and the
  current answer is still no

## 2026-04-15 - cutover-facing replay parity must use direct case identity

Decision:

- replay-versus-live parity must not rely on fuzzy token or summary matching as
  its primary comparison method
- cutover-facing parity must compare cases by a direct shared case identity
  emitted by both:
  - the live targeted trace surface
  - the replay-side audit surface
- when direct identity still fails to line up cases, the result must be
  reported as localized trace-identity drift rather than silently treated as
  close parity

Reasoning:

- the earlier parity lane mostly measured fuzzy trace matching rather than true
  write-path parity
- after switching to direct identity, the remaining divergence became more
  honest:
  - `close = 0`
  - `diverged = 6`
  - all divergence localized to `trace_match`
- that means the next parity question is no longer “did the fuzzy scorer pick
  the right trace row?” but “why do live and replay lanes still emit different
  case identities for the same reviewed source area?”

## 2026-04-15 - gateway-style fact same-value subject drift may count as packaging-only

Decision:

- for fact memories only, strong same-value agreement plus subject-only drift
  may classify as `packaging_only_drift` when:
  - class, kind, and scope already match
  - no broader-wrapper containment relationship exists between the values
  - no rival same-value candidate remains
- this remains a candidate-preference refinement, not broader merge authority

Reasoning:

- the latest focused pass showed that gateway-configuration fact cases improved
  materially when narrow same-value wrapper drift stopped blocking same-claim
  handling:
  - `attach_support = 0 -> 4`
  - `conflict_hold = 8 -> 1`
- the change stayed narrow:
  - no global threshold lowering
  - no broad value-similarity merge rule
  - no document-specific heuristic

## 2026-04-15 - cutover remains blocked while shared-basket misses and long-horizon pressure stay above bar

Decision:

- `model-memory` remains `not_ready_for_cutover` while all of the following are
  still true on the preserved current corpus:
  - the shared duplicate review basket still contains more than rare,
    explainable should-attach misses
  - the aligned benchmark still shows meaningfully non-trivial attach-support
    miss rates with wide uncertainty
  - long-horizon saturation reruns still create materially excessive fresh
    active objects
  - replay-versus-live parity is not yet proven close enough or localized to an
    operationally acceptable seam

Reasoning:

- the latest preserved-corpus evidence after the duplicate-conversion pass
  still shows:
  - review:
    - `clear_duplicate_should_attach = 6` out of `16`
  - aligned benchmark:
    - `attachSupportMissRateOnReruns = 0.3077`
    - interval lower/upper = `0.1268` / `0.5763`
  - proof:
    - active objects = `492`
    - duplicate active-object candidates = `17`
- support-only stability and retrieval/context boundedness are no longer the
  blocker, but those green lanes do not outweigh persistent duplicate-quality
  failures
- one more focused pass is justified only if it directly targets:
  - exact live-versus-replay case replay
  - conversion of recovered same-claim candidates in the batch lane
- broader complexity beyond that point is likely diminishing-return debt

## 2026-04-15 - same-claim eligibility must separate core claim fields from packaging drift

Decision:

- same-claim eligibility must be anchored first on core claim fields
- packaging or framing fields must not block support by themselves when:
  - class, kind, and normalized scope already match
  - core claim agreement is strong
  - the remaining structural delta is only `packaging_only_drift`
- `subject` remains lower-authority by default rather than globally decisive
  or globally irrelevant
- structural delta classification stays narrow and may only classify:
  - `packaging_only_drift`
  - `additive_operational_delta`
  - `unresolved`

Reasoning:

- the measured core-claim/delta pass showed that the safe expansion shape is
  real but narrow:
  - `2` clear should-attach misses were blocked by packaging fields
  - `0` legit-distinct controls became risky under the same
    core-claim-only-plus-packaging-only rule
- the same measurement also showed that most rerun escapes are not packaging
  drift at all; they are true core-claim disagreement or additive deltas
- that means the system should widen deterministic attach only for the
  packaging-only shape, not by globally demoting more fields

## 2026-04-15 - duplicate review and benchmark must share one stratified basket

Decision:

- qualitative duplicate review and duplicate benchmark must draw from the same
  sampled population
- that shared basket must report its composition explicitly by:
  - source family
  - kind
  - replay path
  - miss class
  - delta class
  - packaging drift type
- benchmark uncertainty must stay explicit through interval reporting rather
  than single-point cleanliness claims

Reasoning:

- earlier review and benchmark artifacts were talking about different baskets,
  which made disagreement harder to interpret
- after aligning them, the disagreement became clearer and more honest:
  - review still found `2` clear should-attach misses
  - the aligned benchmark also showed `attachSupportMissRateOnReruns = 0.25`
- shared sampling does not solve duplicate quality by itself, but it does stop
  the evidence surfaces from talking past each other

## 2026-04-15 - family recall must stay anti-ontology

Decision:

- family-level recall is allowed before object-level choice
- it must be derived from decisive-field text already present on the object
- it may use deterministic field-local fingerprints, decisive-field bundle
  fingerprints, and same-source neighborhoods
- it must not introduce a controlled vocabulary of tools, operation targets, or
  constraint classes
- it must not create a semantic router

Kind rollout:

- `rule = yes_now`
- `fact = yes_now`
- `procedure = yes_now`
- `preference = yes_now`
- `reference = yes_later`

Reasoning:

- the system needs better same-family recall, especially for dense rule
  restatements, but the earlier memory system failed by letting hand-written
  semantic categories quietly become truth
- decisive-field fingerprints preserve object-native semantics and scale better
  than a maintained catalog
- same-source neighborhoods are a bounded recall aid, not a new merge
  authority

## 2026-04-15 - proof-phase support-only churn must not fall back to mixed reruns

Decision:

- the proof runner must not reuse an arbitrary saturation source as a fake
  support-only probe when no true support-only source was observed
- proof artifacts must state the executed probe class explicitly
- if no true support-only source exists, the proof must report
  `support_only_probe_blocked_no_true_support_only_source`
- stable-surface churn claims must then be interpreted as:
  - true pure-attach support evidence
  - mixed same-source rerun evidence
  - whole-source reingest evidence
  - or transient retrieval-pack artifact growth

Reasoning:

- the earlier proof artifact could simultaneously say `Support-only source:
none observed` and still claim support-only churn
- that was a measurement bug, not trustworthy evidence of a pure attach-support
  problem
- proof honesty has to come before stable-surface diagnosis

## 2026-04-15 - proof may use deterministic synthetic existing-object replay for true support-only validation

Decision:

- when the preserved current corpus does not naturally produce a pure
  support-only source during the proof run, the proof may synthesize one by
  replaying a known active object with existing support
- that synthetic replay must:
  - use a deterministic source fingerprint and window identity
  - write through the real write path
  - exist only to exercise a true `pure_attach_support` probe
- the proof artifact must record the selected target object and mark the probe
  as synthetic existing-object replay

Reasoning:

- blocking forever on “no natural support-only source happened this run” is
  weaker than proving the support-only contract directly
- the earlier isolated diff already showed pure support-only stability; the
  broader proof lane now needs the same honest probe class
- deterministic synthetic replay keeps the probe reproducible without broad
  corpus mutation

## 2026-04-15 - duplicate evidence must separate preserved proof DBs from scratch trace DBs

Decision:

- clean-room proof runners must declare an explicit database mode
- full-corpus readiness evidence must run on `full_corpus_proof_db`
- targeted hinge traces and other disposable live probes must run on
  `targeted_trace_scratch_db`
- JSON and Markdown evidence artifacts must record both database mode and
  database name

Reasoning:

- the previous hinge-trace runner reset the same database later used by the
  duplicate audit and benchmark
- that made long-horizon duplicate percentages partly untrustworthy after any
  targeted live trace
- separating preserved proof DBs from scratch trace DBs fixes the evidence
  surface without changing write-path semantics

## 2026-04-15 - semantic duplicate benchmarks must survive corpus evolution

Decision:

- the duplicate benchmark must prefer semantic-fingerprint seeds over object-id
  seeds
- legacy reviewed case ids may remain as historical bootstrap hints, but they
  are not sufficient by themselves
- when prior semantic seeds and legacy bootstrap ids do not resolve, the
  benchmark may rebuild a bounded semantic-fingerprint seed set from the
  current preserved duplicate audit

Reasoning:

- repeated proof cycles change object ids and can legitimately change which
  rerun escapes exist in the current corpus
- a benchmark tied only to old object ids either crashes or silently goes empty
- semantic-fingerprint seeds keep the benchmark rerunnable while still making
  missing historical seeds explicit

## 2026-04-15 - decisive-field agreement may tolerate narrow field-local wording drift

Decision:

- deterministic recall and fast-attach may use decisive-field agreement that is
  stronger than exact string equality but still narrower than whole-object
  similarity
- this allowance is limited to field-local same-claim drift inside the payload
  fields that define the durable claim
- rule handling may treat the combined action-bearing field bundle as a same-
  claim signal when the content is materially the same but split across
  `recommendedAction`, `avoidAction`, and `neededCapability` differently

Reasoning:

- the duplicate audit showed that many remaining false-distinct reruns were not
  failing because the claim was absent, but because the same value/action/step
  content was phrased slightly differently inside the decisive field itself
- keeping equality literal-only still missed real same-claim restatements such
  as fact value drift from wrapper wording and rule action text split across
  adjacent fields
- allowing narrow field-local equivalence improves support attachment without
  turning broad object-level similarity into merge authority

## 2026-04-15 - broad retrieval requests stay on a deterministic-baseline guardrail

Decision:

- broad operator, workflow, reference, and architecture queries stay on a
  deterministic-baseline retrieval guardrail by default
- for those broad envelopes, the retrieval-request model step must not:
  - force canonical-class filters
  - force kind filters
  - shrink `desiredResultCount` below the envelope `maxResults`
  - invent abstract hint terms that are not grounded in the query text
- the model step is cutover-eligible only when retrieval-package review shows it
  is at least neutral against deterministic retrieval

Reasoning:

- the retrieval-package review originally showed `4 / 4` reviewed probes
  degrading under the model-shaped request lane
- the highest-leverage correction was not more provider work; it was preventing
  broad queries from being over-constrained below the deterministic baseline
- after the guardrail change, the same four probes became `4 / 4`
  `mostly_same_value_as_deterministic` and `0 / 4` degraded

## 2026-04-15 - deterministic fast-attach may prefer one active strong-match candidate over contained siblings

Decision:

- deterministic fast-attach may prefer one active retained candidate even when
  multiple strong same-claim candidates remain, but only when:
  - the chosen candidate is active
  - decisive payload fields still agree exactly
  - normalized scope, class, and kind still match
  - the overlap remains very high
  - every other strong same-claim candidate is already contained in a
    non-active lifecycle state

Reasoning:

- the duplicate benchmark and audit exposed a recurring shape where one active
  same-claim object already existed alongside contained `conflict_hold`
  siblings
- treating that shape as still ambiguous kept routing obvious reruns into the
  batch lane and let more duplicate active writes escape
- preferring the single active strong-match candidate in that contained-sibling
  shape is conservative because it does not create new merge authority across
  genuinely competing active objects

Status after the latest core-claim/delta pass:

- this earlier active-versus-contained preference is no longer the current
  fast-attach expansion shape
- the live lane now requires one unique dominant core-claim candidate plus
  `packaging_only_drift`
- contained-sibling preference without that unique dominance is no longer
  treated as deterministic-safe

## 2026-04-15 - deterministic fast-attach may expand to one dominant retained candidate

Decision:

- deterministic fast-attach is no longer limited to exactly one retained
  candidate
- fast-attach may also fire when multiple retained candidates remain but
  exactly one candidate has:
  - the same canonical class
  - the same kind
  - the same normalized scope
  - very high normalized-search overlap
  - exact agreement on the decisive non-subject payload fields for that kind
  - no same-slot supersession reason
- every other retained candidate must fail that stronger payload-agreement
  check

Reasoning:

- the duplicate-escape benchmark showed a large real false-distinct rate on
  reruns, but the misses were not random
- the common safe pattern was one dominant same-claim candidate plus weaker
  nearby objects
- expanding deterministic attach only for that dominant-candidate shape reduces
  duplicate growth without turning broad similarity into merge authority

## 2026-04-15 - retrieval-request modeling must justify itself against deterministic retrieval

Decision:

- retrieval-request modeling is not assumed to be beneficial just because it is
  model-owned
- proof must compare the deterministic pre-model candidate picture with the
  post-model interpreted request and final retrieval package
- when the model step over-constrains or degrades the retrieval package versus
  deterministic retrieval, that is a blocker

Reasoning:

- the qualitative retrieval-package review showed `4 / 4` current proof probes
  degrading under the model-interpreted request
- deterministic retrieval is currently carrying most of the useful signal
- cutover proof needs to know whether the model step is earning cost and
  complexity rather than treating it as architectural value by assumption

## 2026-04-15 - retrieval-request prompts must explicitly satisfy JSON-object provider requirements

Decision:

- retrieval-request prompts must explicitly mention JSON when using
  `response_format: { type: "json_object" }`
- retrieval-request prompts must specify the exact accepted top-level response
  schema
- retrieval-request prompts must reserve `skip` for clearly non-memory queries
  and prefer `retrieve` for documentation, workflow, architecture, operator,
  project, and reference questions

Reasoning:

- the live retrieval trace runner showed the first blocker was not retrieval
  ranking at all; it was a provider-side `400` because the prompt text did not
  explicitly mention JSON
- after that fix, the next blocker was parse-time because the prompt still
  allowed a different JSON shape
- once the prompt stated the exact schema and skip policy, the same nano lane
  began producing valid retrieval requests on the real populated corpus

## 2026-04-15 - pure support-only rebuild stability must be proven with a dedicated diff lane

Decision:

- support-only rebuild churn must be diagnosed with one explicit
  `attach_support` write, not inferred from broad source reruns
- the dedicated support-only diff lane is the authoritative diagnosis surface
  for pure attach-support stability
- proof-phase whole-source reruns may still be used for broader convergence
  testing, but not as the sole evidence for pure support-only churn

Reasoning:

- the broader proof runner still reported support-only projection and artifact
  churn after rerunning a whole source
- the dedicated diff runner then showed that a pure `attach_support` write left
  projection hashes, artifact hashes, and active slot/set membership unchanged
- that means the remaining churn blocker is in broader derived-surface behavior
  or proof-lane methodology, not in the attach-support write itself

## 2026-04-15 - collision gating may use fuller normalized search overlap before model adjudication

Decision:

- deterministic collision pruning may use fuller `normalizedSearchText`
  overlap instead of anchoring primarily on `normalizedSubject` or
  `normalizedTitle`
- scope, canonical class, and kind guards remain hard boundaries
- a deterministic fast-attach lane is allowed only when:
  - exactly one retained candidate remains
  - class, kind, and scope still match
  - normalized semantic text overlap is very high
  - no same-slot supersession case is present

Reasoning:

- hinge traces showed that raw candidate recall already existed, but
  deterministic pruning was dropping too many plausible same-claim candidates
  before model adjudication
- the fix needed to improve retention on close restatements without turning raw
  similarity into merge authority
- a narrow one-candidate fast-attach path reduces model cost on obvious
  near-restatements while leaving ambiguous cases in the model-owned lane

## 2026-04-15 - proof runners must contain live probe failures and emit evidence

Decision:

- clean-room proof runners must record downstream live probe failures as
  explicit artifact results instead of aborting the entire proof phase
- retrieval/context probe failures remain blockers, but they must appear as
  classified proof outcomes with owning seams and error text

Reasoning:

- the fresh proof rerun reached retrieval/context and then failed on live nano
  provider `400` responses
- aborting the phase hid already-completed ingestion, saturation, and runtime
  read-model evidence
- cutover readiness decisions require full-phase artifacts, even when later
  probes fail

## 2026-04-15 - prompt-only usefulness is judged on deliberate durable baskets, not incidental prompts alone

Decision:

- ordinary-turn usefulness must be judged on two distinct prompt lanes:
  - incidental real prompts from session history
  - deliberately durable prompts designed to express persistent guidance
- passing the deliberate durable basket is enough to keep expanding ordinary-turn
  proof even if incidental prompts remain sparse
- incidental prompt sparsity still blocks any claim that ordinary-turn capture is
  broadly solved

Reasoning:

- incidental prompts often mix planning, meta-instructions, and one-off control
  messages that are valid to omit
- a durable prompt basket is a better bar for whether prompt-only capture can
  persist stable user guidance through the shared two-pass lane
- the durable basket now captures stable claims often enough to justify further
  proof work, while the earlier session basket remains a weaker lane

## 2026-04-15 - ordinary-turn capture reuses the shared two-pass ingestion framework

Decision:

- ordinary-turn capture must use the same candidate-extraction plus
  canonicalization framework as document ingestion
- ordinary turns must not keep a separate degenerate single-pass path
- ordinary-turn tracing and proof must report the shared pass structure
  honestly:
  - `pass_1_candidate`
  - optional `pass_1_repair`
  - `pass_2_canonicalization`
  - optional `pass_2_repair`

Reasoning:

- the prior ordinary-turn path had drifted into calling canonicalization with
  no candidate set
- that made `ignore` the structurally expected result for prompt-only turns,
  which was a repo-owned bug rather than a provider limitation
- once the shared path was restored, prompt-only turns began producing real
  writes again on durable prompts and on at least one real prompt from the
  session basket

## 2026-04-15 - the document-ingestion operator surface is not a memory-slot plugin

Decision:

- expose clean-room document ingestion through the optional OpenClaw tool
  `model_memory_document_ingest`
- do not register `model-memory` as `kind: "memory"` for this operator surface
- keep the tool outside the active memory-slot selection mechanism

Reasoning:

- the goal of this surface is operator access to the clean-room runner/service,
  not silent replacement of the currently selected memory backend
- marking the plugin as `kind: "memory"` caused the loader to disable it when
  the slot remained on `memory-core`
- the operator/admin ingestion surface needs to coexist with the current slot
  posture while cutover is still deferred

## 2026-04-15 - aggressive cutover uses model-memory as primary and native no-memory as rollback

Decision:

- execute an aggressive full cutover from the legacy memory stack to
  `model-memory`
- do not preserve the legacy heuristic memory stack as the preferred rollback
  target
- rollback must disable `model-memory` and fall back to native no-memory
  behavior instead of restoring `memory-core` or QMD as semantic truth
- treat the current legacy memory stack as retirement debt, not a strategic
  coexistence path

Reasoning:

- the clean-room system is now materially stronger than the legacy memory stack
- the remaining issues are in the class of post-cutover monitoring and
  fast-follow fixes rather than architectural invalidation
- keeping the old system as the default fallback would preserve complexity we
  already intend to delete
- the safer long-term posture is:
  - one primary semantic authority
  - one explicit disablement path
  - no permanent dual-memory runtime

## 2026-04-15 - manual UI smoke should use the explicit operator tool contract

Decision:

- manual UI document-ingestion smoke should use the exact
  `model_memory_document_ingest` tool contract
- the canonical first manual UI smoke case is
  `docs/projects/model-memory/roadmap.md`
- the smoke payload should remain explicit and constrained:
  - `chunkSize = 1`
  - `maxConcurrency = 1`
  - `resume = true`
  - nano/nano models
  - explicit `runId` and `recordPath`

Reasoning:

- the operator surface is intended for explicit administrative ingestion, not a
  free-form autonomous background path
- the roadmap document is a clean high-signal manual UI smoke case because it
  already succeeds through the real tool surface
- recording the exact invocation contract reduces ambiguity when the user tests
  the UI manually

## 2026-04-15 - ordinary-turn proof must report the live lane honestly

Decision:

- ordinary-turn proof artifacts must report the actual live stage shape for the
  current lane
- proof artifacts must not relabel stages or collapse them into summary-only
  output
- when the lane changes, the evidence artifacts and readiness docs must be
  rerun and updated to match it

Reasoning:

- the first 10-prompt session proof initially mislabeled the live extraction
  stage
- stage visibility is only useful if it names the real pipeline that ran
- broader ordinary-turn proof decisions depend on knowing whether failures are
  transport, repair/canonicalization, or capture-usefulness issues

## 2026-04-14 - batch document ingestion is promoted to a first-class runner/service

Decision:

- batch document ingestion must no longer live only inside proof-script loops
- the clean-room system now owns a first-class runner/service with:
  - explicit source selection
  - sequential or bounded-concurrency queueing
  - durable run records
  - per-source failure containment
  - resumability by chunk
  - operator-visible status

Reasoning:

- the first-100 population wave proved the need for a reusable operational
  ingestion surface
- broader retrieval, context, rebuild, and cache proof should run on top of a
  stable operator path, not a throwaway script loop
- run records and resumability are operational concerns and should be explicit
  rather than hidden in proof helpers

## 2026-04-14 - heading-path refs are allowed as structural provenance helpers

Decision:

- prompt payloads may expose stable `headingPathRef` options for source windows
- model output may use `headingPathRef` in supporting spans or provenance
- local code must resolve refs back to exact heading arrays before validation
- stored runtime truth remains exact heading paths, not refs

Reasoning:

- recurring rejects in gateway and template docs were caused by long or
  deep heading arrays being replayed imperfectly
- short stable refs reduce structural transcription errors without moving
  semantic authority into local code
- the change is structural only and preserves strict provenance validation

## 2026-04-14 - audited proof admission now uses bounded semantic convergence

Decision:

- audited real-source proof admission no longer uses exact rerun candidate
  overlap or exact rerun object-set equality as the bar
- the current admission bar is:
  - structural validity
  - provenance quality
  - recurrence of the same core durable claims often enough to trust the case
  - bounded active-object growth across repeated runs
  - runtime cleanliness
  - honest source suitability

Reasoning:

- the accepted nano/nano lane does not deliver exact rerun identity stability
  on large real sources
- keeping exact overlap as the active bar would encode a known model
  limitation as a project blocker
- the claim-plus-support architecture exists specifically so some capture drift
  can be absorbed without turning every variation into a new active object
- the honest question is whether the system converges enough in aggregate to be
  trustworthy, not whether it replays the same object list exactly

## 2026-04-14 - nano and nano are the universal default model lane

Decision:

- the default pass 1 candidate-discovery model is
  `openrouter/openai/gpt-5.4-nano`
- the default pass 2 canonicalization model is
  `openrouter/openai/gpt-5.4-nano`
- `openrouter/openai/gpt-5-mini` is comparison-only and must never remain the
  silent default for any model-memory run lane

Reasoning:

- the current requirement is to keep the live default posture explicit,
  bounded, cheap, and consistent across ingestion, evidence, and proof runs
- `gpt-5-mini` may still be useful for explicit bounded comparisons, but those
  are experiments, not defaults
- the repo should not drift into mixed implicit defaults across scripts and docs

## 2026-04-14 - residual batched collision adjudication is good enough for now

Decision:

- keep the current deterministic-first plus batched-remainder collision path as
  the working baseline for broader ingestion proof
- do not keep blocking wider ingestion on further residual prompt tuning
- revisit residual close-case calibration later only if wider corpus runs show
  repeated attach-support misses or noisy distinct growth

Reasoning:

- the collision lane has already been reduced from one prompt per candidate to
  a small ambiguous remainder
- at least some real residual cases now resolve to `attach_support`
- the remaining question is no longer whether the residual prompt is perfect,
  but whether broader ingestion still shows material duplicate pollution or
  unresolved close-case drift

## 2026-04-14 - collision adjudication becomes deterministic-first and batched

Decision:

- collision recall must add a conservative deterministic gate before any
  model-owned collision adjudication runs
- obviously unrelated prior objects must be filtered out locally before they
  reach the adjudicator
- the unresolved remainder should be adjudicated in one batched model call per
  source write batch by default, not one prompt per object
- the collision lane should bias toward memory loss over junk when the remainder
  cannot be resolved safely

Reasoning:

- the AGENTS.md live trace showed that the current scorer still opened
  collision prompts for many clearly unrelated rule pairs
- that means the current cost is dominated by noisy candidate generation, not by
  true semantic ambiguity
- the claim-plus-support architecture can tolerate some missed support
  attachment better than it can tolerate duplicate-object junk and excessive
  collision-call churn
- batching the small ambiguous remainder preserves model-owned semantics while
  materially reducing write-path model volume

## 2026-04-13 - canonical project docs area is `docs/projects/`

Decision:

- create `docs/projects/` as the canonical repo-tracked top-level area for project workspaces
- create this project at `docs/projects/model-memory/`

Reasoning:

- the live repo did not already have a canonical project-docs area
- the project must be tracked in the main repo and linked from the central docs index
- this keeps clean-room project records separate from legacy memory docs

## 2026-04-13 - code location is `extensions/model-memory`

Decision:

- the clean-room implementation will live at `extensions/model-memory`

Reasoning:

- it stays parallel to the legacy memory package
- it remains visible in the main repo
- it avoids entangling the new architecture with legacy runtime modules

## 2026-04-13 - four-pillar architecture is adopted

Decision:

- the target architecture inside OpenClaw is:
  - harness
  - context engine
  - memory layer
  - usage/cache layer

Reasoning:

- the memory layer alone is not enough to support real runtime behavior
- the surrounding runtime layers must be specified explicitly without turning them into semantic truth

## 2026-04-13 - initial scope is document ingestion and ordinary-turn user capture only

Decision:

- v1 covers:
  - document ingestion
  - ordinary-turn user capture

Deferred:

- retrieval implementation
- live context injection integration
- advisory planning
- review tooling
- migration/cutover

## 2026-04-13 - ontology is canonical-class-first with minimal internal kinds

Decision:

- canonical classes remain:
  - `user`
  - `feedback`
  - `project`
  - `reference`
- internal kinds are exactly:
  - `preference`
  - `fact`
  - `rule`
  - `procedure`
  - `reference`

Reasoning:

- this is the smallest clean decomposition that still supports the required memory behavior
- it removes detector-era naming and category drift from runtime truth

## 2026-04-13 - activation, projection, context, and usage layers are derived layers

Decision:

- runtime read models, workspace projections, dynamic packs, context assembly, and usage/cache ledgers are all derived layers
- none of those layers may extend or replace the canonical semantic contract

Reasoning:

- this preserves one semantic source of truth
- it prevents the runtime stack from becoming a second hidden ontology

## 2026-04-13 - `ruleSubtype` is removed from v1

Decision:

- v1 does not include `ruleSubtype`

Reasoning:

- rule meaning is carried by canonical class, kind, payload, scope, and provenance
- a subtype field would likely become a new hidden family registry
- if a subtype is ever needed later, it must be justified by downstream behavior that cannot be derived from the base rule object

## 2026-04-13 - `rationaleCodes` is optional audit metadata only

Decision:

- `rationaleCodes` remains in the schema as optional audit metadata
- it must use closed generic codes only
- it is forbidden as runtime semantic authority

Forbidden uses:

- semantic interpretation
- canonical class or kind assignment
- dedupe
- supersession
- retrieval truth
- write policy
- review policy

Reasoning:

- the system needs traceability for handling decisions
- freeform or semantically meaningful rationale would recreate hidden memory scaffolding
- keeping it audit-only preserves observability without adding ontology sprawl

## 2026-04-13 - v1 runtime is standalone with optional shadow mode later

Decision:

- no live cutover or replacement in v1
- build standalone first
- optional shadow mode is specified for later implementation
- keep one package first and revisit splitting memory and context layers later if needed

## 2026-04-13 - v1 records `reviewMode` but overrides execution to auto-accept

Decision:

- `reviewMode` stays in the schema
- the model may emit any supported `reviewMode`
- v1 write execution overrides accepted objects to `auto_accept`
- the original suggested `reviewMode` may be persisted for audit and analysis

Reasoning:

- this preserves forward compatibility for stricter later policy
- it honors the current product decision to auto-accept valid captures in v1
- it avoids conflating schema design with current write-policy strictness

## 2026-04-13 - runtime projections are first-class downstream consumers

Decision:

- bootstrap file generation is part of the architecture
- generated bootstrap and project files remain downstream consumers of memory truth
- repo-tracked docs are not the default runtime output surface
- `.openclaw/model-memory/` is the canonical runtime-generated artifact root

Reasoning:

- projections are needed for practical runtime use
- treating them as derived artifacts avoids polluting semantic truth or turning repo docs into volatile cache surfaces

## 2026-04-13 - existing `MEMORY.md` and `USER.md` content must be ingested before replacement

Decision:

- current human-authored `MEMORY.md` and `USER.md` content must be audited and ingested where appropriate before generated projections replace them

Reasoning:

- the project must not erase existing memory content that is not yet in canonical storage
- migration of meaning must happen before projection replacement

## 2026-04-13 - storage uses the same server with a new logical database

Decision:

- reuse the same Supabase/Postgres server
- create a separate logical database for `model-memory`

Reasoning:

- strong isolation from legacy schema and data
- shared operational environment without schema-level cross-contamination

## 2026-04-13 - prompt contract may use placeholder examples only

Decision:

- prompt examples may use placeholder-only examples such as `<subject>` and `<value>`
- prompt examples may not contain concrete memory content

## 2026-04-13 - every model-owned contract is versioned

Decision:

- every model-owned step must record:
  - `contractName`
  - `contractVersion`
  - `modelId`

Reasoning:

- extraction is not the only place where model drift can affect behavior
- retrieval interpretation, reranking, and later session-summary generation must not become unversioned blind spots

## 2026-04-13 - proof policy uses adjudicated objects plus optional stored real model outputs

Decision:

- primary proof mode: adjudicated expected structured objects
- secondary optional proof mode: stored real model outputs

Reasoning:

- expected objects remain the main truth surface
- stored model outputs are useful as replay evidence but do not become the only semantic authority

## 2026-04-13 - live persistence uses package-local ordered SQL migrations

Decision:

- `model-memory` uses package-local ordered SQL migrations under `extensions/model-memory/migrations/`
- the live repository path uses Postgres-compatible SQL with `pg` at runtime and `pg-mem` in tests

Reasoning:

- the repo did not already provide a package-local migration convention for this clean-room package
- the package needs executable schema now without borrowing legacy memory infrastructure
- the same boundary keeps canonical truth and derived runtime state explicit and testable

## 2026-04-13 - the live logical database is `model_memory`

Decision:

- the shared Supabase/Postgres server now hosts the clean-room logical database
  as `model_memory`
- the initial package migration is applied there from
  `extensions/model-memory/migrations/0001_model_memory_init.sql`
- non-default environments may still override the connection explicitly, but
  `model_memory` is the canonical live target name for this project

Reasoning:

- this removes ambiguity from provisioning and runtime wiring
- it preserves the earlier decision to isolate the clean-room schema from the
  legacy memory database
- it keeps environment override behavior explicit instead of implicit

## 2026-04-13 - harness integration crosses through a narrow runtime bridge

Decision:

- harness integration uses a narrow runtime bridge rather than turning projections or reports into truth
- bootstrap files, context assembly, retrieval-pack inclusion, and usage normalization remain downstream consumers

Reasoning:

- the memory layer must remain the only semantic authority
- the harness still needs an explicit attachment point to consume projections, packs, and ledger state
- a narrow bridge reduces the chance of core runtime seams reintroducing ontology or compatibility drift

## 2026-04-13 - bounded semantic equivalence is allowed in proof, not in writes

Decision:

- proof may allow bounded semantic equivalence
- writes must use deterministic normalized identity
- v1 forbids similarity-threshold or embedding-only merge in the live write path
- v1 allows bounded model-owned collision adjudication only after exact
  identity and bounded candidate recall

Reasoning:

- proof needs some tolerance for model drift
- storage must stay stable and conservative
- threshold-only fuzzy merge in runtime would recreate a semantic forest

## 2026-04-14 - finalized daily continuity recovery is a secondary capture lane

Decision:

- keep the existing daily continuity source shape at `memory/YYYY-MM-DD.md`
- allow a recovery ingestion lane over finalized daily continuity files
- treat that lane as candidate recovery only, not as independent semantic proof

Reasoning:

- primary turn and document capture may legitimately miss durable memories on
  the first pass
- finalized daily continuity gives the system a second recovery opportunity
- derived summaries must not inflate evidence strength for memories already
  captured from primary sources

## 2026-04-14 - durable memories are claims with multiple support items

Decision:

- a durable memory object is no longer modeled as one write from one source
  window
- one memory object may accumulate multiple support items from multiple source
  windows
- support weighting must distinguish independent reinforcement from same-source
  reruns and derived daily recovery

Reasoning:

- wording drift across reruns should collapse into one durable claim where the
  underlying memory is the same
- support/provenance should absorb capture variation without bloating the active
  memory set
- same-source reruns must not inflate confidence

## 2026-04-14 - live duplicate handling uses retrieve plus adjudicate plus attach-or-create

Decision:

- exact normalized identity remains the first dedupe mechanism
- when exact identity does not resolve a write, the live path may use bounded
  hybrid recall to find plausible prior objects
- hybrid recall is candidate generation only
- a constrained model-owned collision adjudication step decides among:
  - `attach_support`
  - `supersedes`
  - `distinct`
  - `conflict_hold`

Reasoning:

- strict exact-identity-only dedupe is insufficient for near-duplicate capture
  drift
- similarity thresholds alone are too weak to act as merge authority
- bounded adjudication keeps semantics model-owned while leaving policy and
  activation deterministic

## 2026-04-14 - lifecycle state separates active memory from provisional capture

Decision:

- memory objects may carry lifecycle states including:
  - `provisional`
  - `active`
  - `superseded`
  - `expired`
  - `conflict_hold`
- default runtime read models and projections operate on active memory only
- provisional visibility outside operator or experimental surfaces is deferred

Reasoning:

- the system needs a place for recovered or uncertain candidates without
  polluting the active runtime set
- low-quality edge cases can be bounded by expiry and reinforcement policy
- no human review queue should be required for basic operation

## 2026-04-13 - retrieval is model-planned and object-native

Decision:

- retrieval is part of the clean-room architecture and is now specified even though implementation remains deferred
- retrieval queries are interpreted into a structured retrieval request by the model
- candidate recall is deterministic and object-native
- optional reranking or packing may use the model, but retrieval truth stays attached to stored semantic objects and provenance
- retrieval must not depend on:
  - legacy family/category vocabularies
  - fixed memory strings
  - exact rendered statements
  - compatibility projections as query truth

Reasoning:

- the system is not complete as a memory architecture without a read path
- retrieval must stay aligned with the same first-principles semantic contract as writes
- deterministic candidate recall avoids creating a new fuzzy semantic forest in the read path

## 2026-04-22 - Phase 2 graph, capsule, planner, synthesis, and privacy decisions

Decision:

- graph runtime uses an authority trust ladder, not a review-only model
- deterministic structural graph edges are automatically usable for read-time
  retrieval when backed by MMV2 events, explicit edges, ids, source refs,
  scope, status, or source lineage
- inferred graph edges start as low-authority probationary read-time edges with
  TTL, telemetry, decay, and promotion only after repeated useful retrieval
  evidence
- capsule artifacts will materialize under
  `/root/.openclaw/workspace/.openclaw/knowledge/capsules/` after the derived
  knowledge root is documented in workspace topology
- hierarchical retrieval defaults to deterministic single-pass and escalates to
  bounded multi-pass only for broad or multi-objective prompts
- heartbeat becomes the primary proactive planner surface and should surface
  skill, tool, and workflow opportunities alongside derived maintenance signals
- skill, tool, and workflow candidate discovery may be proactive, but
  promotion, installation, privileged enablement, and standing automation remain
  approval-gated
- privacy and prompt-injection hardening uses automatic safe defaults instead
  of waiting indefinitely for manual review
- stale projection and capsule artifacts are excluded from normal injection
  unless explicitly requested for inspection

Reasoning:

- review-only behavior would leave most useful graph and privacy decisions
  unactioned because manual review is unlikely to happen consistently
- automatic use is acceptable only where it is read-time, reversible,
  provenance-backed, and unable to mutate canonical MMV2 truth
- heartbeat is the right first operator surface for proactive behavior because
  it can batch low-friction decisions without requiring a dedicated UI
- capsules belong to the derived knowledge graph layer, but they must remain
  compiled artifacts rather than a second truth store

## 2026-04-13 - generated workspace projections own fenced zones only

Decision:

- generated projection output may write only inside explicit generated zones
- human-owned content outside those zones must remain untouched

Reasoning:

- projections are downstream runtime artifacts, not permission to overwrite project docs wholesale
- the generated-zone boundary keeps bootstrap projection practical without turning workspace files into unsafe cache surfaces

## 2026-04-19 - curated workspace MEMORY.md stays human-owned

Decision:

- workspace `MEMORY.md` is no longer a live generated-zone target
- curated `MEMORY.md` remains fully human-owned and `no_overwrite`

Reasoning:

- the mixed-purpose file had become structurally wrong for a continuity surface
- generated standing context and recall scaffolding were crowding out the
  actual human-curated durable memory
- continuity ownership is clearer and safer when the workspace file is not also
  acting as a generated cache surface

## 2026-04-19 - memory-md bootstrap semantics survive as a separate generated artifact

Decision:

- `memory-md` remains a valid projection target
- its rendered output is injected into bootstrap context through the generated
  artifact path recorded in `canonicalArtifactPath`
- it is not written back into workspace `MEMORY.md`

Reasoning:

- startup grounding still needs the bounded stable packet that `memory-md`
  provides
- separating the generated projection artifact from the curated workspace file
  preserves both ownership and bootstrap semantics
- the artifact path itself keeps provenance visible at runtime

## 2026-04-13 - v1 context engine delegates compaction

Decision:

- the `model-memory` context engine assembles context and records usage/cache state
- compaction remains delegated to the OpenClaw runtime in the current implementation stage

Reasoning:

- this keeps the clean-room package focused on assembly and derived artifacts first
- it avoids premature growth of a second summarization subsystem before persistence and harness integration are proven

## 2026-04-13 - retrieval packs are explicit derived artifacts

Decision:

- retrieval results may be materialized into retrieval packs
- retrieval packs are included in assembly only when explicitly requested
- retrieval packs are never semantic truth

Reasoning:

- retrieval is a read-path packaging layer, not a second semantic layer
- explicit inclusion prevents retrieval from silently becoming always-on hidden authority

## 2026-04-13 - shadow comparison is observational and object-native only

Decision:

- shadow mode compares `model-memory` and legacy outputs by canonical object identity and write outcomes only
- shadow mode must not backfill, repair, or redefine `model-memory` truth from legacy outputs

Reasoning:

- comparison is needed to understand divergence before cutover
- allowing comparison to become a repair path would immediately reintroduce legacy semantic authority

## 2026-04-13 - context engine assembly is layered and compaction delegates in phase 1

Decision:

- context assembly uses:
  - stable bootstrap projections
  - semi-stable memory packs
  - volatile live context
- Phase 3 context assembly must work without retrieval
- phase 1 compaction remains delegated to the OpenClaw runtime

Reasoning:

- layered assembly supports token discipline and prompt-cache stability
- making assembly valid before retrieval keeps the roadmap executable and avoids fake retrieval shortcuts
- delegating compaction keeps the first implementation smaller and more auditable

## 2026-04-13 - usage/cache observability stores counters plus segment hashes

Decision:

- the usage/cache layer stores provider-normalized counters plus segment-level prompt-shape hashes

Reasoning:

- counters show total cost
- segment hashes show which layer changed, which helps explain cache misses and token growth without making observability a full prompt-text archive

## 2026-04-25 - Phase 2 production rollout requires typed config seam

Decision:

- Phase 2 graph reads, `project_state` capsule retrieval, capsule context,
  hierarchical retrieval, maintenance surfacing, soft-source runtime ingestion,
  and non-user-prompt ingestion must be controlled by a typed rollout config
  before any production enablement
- the rollout config resolves capability modes into the production gate policy
  and controlled retrieval-pack options
- default runtime behavior remains disabled or shadow-only
- controlled production requires passing Slice 8 retrieval integration proof,
  Slice 9 comprehensive eval/no-dark-data proof, and UI runtime proof coverage

Reasoning:

- proof artifacts show that a capability can behave safely, but they are not a
  live rollout control plane
- a typed config seam keeps eval/operator enablement, controlled production,
  and default promotion separate
- preserving no-dark-data, source authority, freshness, conflict, and
  inspection-only checks at config resolution prevents invalid rollout settings
  from reaching retrieval/context assembly

## 2026-04-25 - controlled Phase 2 config requires live UI proof before default promotion

Decision:

- controlled Phase 2 retrieval configuration must be proven through a
  Tailscale-safe UI/operator proof before any default live promotion
- the proof may enable controlled config only in an explicit bounded eval path
- the proof must validate rollout config resolution, production gate decisions,
  read-only graph reads, `project_state` capsule retrieval, gated capsule
  context, default-off behavior, and no-dark-data status
- planner/proactivity remains deferred until controlled retrieval/context
  behavior has a separate green promotion decision

Reasoning:

- unit and proof harness coverage is necessary but not enough to prove the live
  operator path
- default promotion should be based on an operator-visible proof artifact, not
  on a code-level capability switch
- keeping the controlled config proof separate from default promotion preserves
  rollback clarity and prevents graph/capsule context from silently becoming
  production behavior

## 2026-04-25 - controlled production go-live requires scoped approval artifact

Decision:

- Phase 2 controlled production go-live requires an explicit validation report
  that reviews Slice 8, Slice 9, UI runtime coverage, and Slice 13 controlled
  config proof artifacts
- the first go-live approval may be scoped to live/operator sessions and
  projects, with capability-level approvals instead of broad default promotion
- graph reads, `project_state` capsule retrieval, and gated capsule context may
  be approved for the bounded scope when proof artifacts and live regression are
  clean
- hierarchical retrieval remains shadow-only until a separate controlled
  promotion proof approves it
- broad default promotion remains a separate decision after scoped production
  behavior has been observed

Reasoning:

- Slice 13 proved the controlled config path, but go-live needs a durable
  control-plane decision that binds proof artifacts to a rollout scope
- capability-level approval keeps rollback and partial approval explicit
- separating scoped production from broad default promotion prevents accidental
  context injection outside the intended operator/eval surface

## 2026-04-25 - scoped Phase 2 production rollout consumes approved go-live artifact

Decision:

- scoped Phase 2 production rollout must be enabled by a typed rollout profile
  derived from an approved go-live validation artifact
- the approved profile binds report id, rollout scope id, rollout config id,
  selected proof hashes, allowed sessions/projects/operators, capability modes,
  and rollback target modes
- live/runtime calls outside the approved scope continue to resolve to disabled
  or shadow-only behavior
- inside the approved scope, graph reads, `project_state` capsule retrieval, and
  gated capsule context may flow through controlled retrieval packs when the
  profile and production gates allow them
- hierarchical retrieval remains shadow-only, and broad default promotion
  remains a separate decision after scoped production observation is clean

Reasoning:

- the approved go-live artifact is the control-plane decision; the scoped
  rollout profile is the live-runtime mechanism that consumes it
- exact typed scope matching prevents accidental expansion from operator/eval
  proof into broad default behavior
- binding proof hashes and rollback modes into the profile keeps provenance and
  rollback auditable before any future default-promotion decision

## 2026-04-25 - proof-bound Phase 2 retrieval defaults

Decision:

- `runtime_graph_reads`, `project_state_capsule_retrieval`, and
  `project_state_capsule_context` may be promoted to default production only by
  a typed default-promotion decision bound to the approved go-live and scoped
  rollout observation artifacts
- promoted graph reads remain read-only retrieval support and are not semantic
  truth
- promoted `project_state` capsule retrieval and context must preserve source
  memory ids, source refs, source profile ids, authority tiers, content hashes,
  freshness/conflict markers, and proof hashes
- `MODEL_MEMORY_PHASE2_DEFAULT_PROMOTION_DISABLED` is the rollback kill switch
  for the promoted retrieval defaults
- hierarchical retrieval remains shadow-only and moves next to a separate
  controlled promotion proof substrate; planner/proactivity remains deferred

Reasoning:

- the scoped rollout proof established that the selected capabilities work
  inside an approved scope; default promotion needs a distinct proof-bound
  decision with rollback and ordinary-path observation
- keeping the hierarchical retrieval work as a next-build readiness substrate
  prevents fan-out from becoming default behavior before its own proof gate

## 2026-04-26 - controlled hierarchical retrieval requires live proof

Decision:

- `hierarchical_retrieval` may move from shadow-only to live controlled
  operator/eval scope only after a typed controlled-promotion proof validates the
  default-promoted graph/capsule/context inputs
- outside the approved scope, hierarchical retrieval remains shadow-only
- controlled hierarchical retrieval must emit bounded subquery plan, merge and
  dedupe reasons, selected/excluded ids, authority tiers, source profile ids,
  source memory ids, lane usage, rollback status, and no-dark-data status
- `MODEL_MEMORY_PHASE2_HIERARCHICAL_CONTROLLED_DISABLED` is the rollback switch
  for controlled hierarchical retrieval
- default promotion remains a separate decision after controlled live behavior
  is observed

Reasoning:

- hierarchical fan-out changes retrieval behavior materially, so live proof must
  demonstrate bounded planning and deterministic merge behavior before default
  promotion
- keeping the controlled proof separate from default promotion makes rollback
  and partial approval explicit

## 2026-04-26 - hierarchical retrieval default promotion is proof-bound

Decision:

- `hierarchical_retrieval` may become ordinary/default retrieval behavior only
  through a typed default-promotion decision bound to the controlled
  hierarchical proof artifact and the prior default graph/capsule/context
  promotion artifact
- default hierarchical retrieval must keep bounded subquery and merge budgets,
  preserve source memory ids/source refs/source profile ids/authority tiers, and
  expose deterministic merge/dedupe/exclusion telemetry
- exact recent evidence must continue to win over stale older evidence, and
  stale/conflicted/inspection-only material must remain excluded or visibly
  blocked
- `MODEL_MEMORY_PHASE2_HIERARCHICAL_DEFAULT_DISABLED` is the rollback switch
  that restores shadow/single-pass behavior
- planner/proactivity remains deferred

Reasoning:

- the controlled proof demonstrated that hierarchical retrieval can run inside
  approved operator/eval scope; default promotion needs a separate ordinary-path
  proof with rollback before fan-out can be treated as default retrieval
  behavior
- binding the decision to approved proof hashes prevents accidental promotion
  from unreviewed artifacts or partial evidence
