---
summary: "Roadmap for the clean-room model-memory project."
title: "Model Memory Roadmap"
---

# Model Memory Roadmap

## Principles

- MMV2-native SQL is the live semantic source of truth.
- Active live write hot paths use MMV2-native contracts by default.
- Read/retrieval/context hot paths route through the Memory Retrieval Runtime
  for accepted soak recall proof.
- Legacy-shaped storage and object contracts remain only as soak-window
  fallback/compatibility surfaces.
- Keep runtime truth object-native: durable memories, memory events, memory
  edges, ingest sources, and ingest segments.
- Keep context, projection, graph, capsule, planner, and cache layers derived
  rather than ontological.
- Preserve MMV2 evidence grounding, conflict durability, and first-class
  composites.
- Do not rebuild detector-era taxonomies or add compatibility categories as
  runtime truth.

## Progress snapshot

- 2026-05-17 Runtime Toolification Priority Update:
  - Model Memory toolification now follows the same boundary as the generic
    orchestration runtime: the model judges usefulness, durability, relevance,
    conflict, supersession, context-pack usefulness, compaction loss/risk, and
    proactivity quality; runtime owns schema, ids, refs, route budgets, MMV2
    writes, Work Queue candidate refs, cooldowns, idempotency, raw-storage
    rejection, authority, lifecycle separation, and tool traces.
  - the dedicated memory toolification item merges older memory runtime
    wiring, middleware adoption, compatibility hard-shutdown, dense capture
    benchmark, retrieval/context quality, compaction, and proactivity-to-Work
    Queue goals into one staged runtime-tool pass.
  - capture should run as prepare source window, draft candidates, classify
    durability, detect conflict/supersession, review raw-storage risk, compile
    write refs, commit memory ref, and review capture quality.
  - retrieval/context should run as draft intent, select sources, compile
    queries, fetch candidates, rank candidates, assemble context pack, review
    usefulness, and insert pack ref.
  - proactivity should run as extract opportunity candidates,
    dedupe/cooldown, adjudicate usefulness, project review-gated Work Queue
    candidates, and owner-review gate.
  - this item should run after the Product/Spec Planning proof unless memory
    becomes the immediate proof objective. Router/front-door, validation/QA,
    and closeout finalization now sit before Product/Spec because they are
    direct pre-proof failure risks.
- 2026-05-16 Runtime Toolification Integration:
  - the next Model Memory convergence work should move memory capture,
    retrieval, route-aware context packs, compaction, and proactivity onto
    Execution Platform runtime tools.
  - model-task and DB-operation refs become compatibility facades over
    canonical tool families instead of independent evidence layers.
  - Work Queue readback should cite memory tool invocation refs and bounded
    artifacts for capture/retrieval/context/proactivity evidence.
  - proactivity seeds, memory-review follow-ups, and memory proof diagnostics
    must use Execution Platform generated-item lifecycle semantics before they
    become Work Queue rows. Review-gated memory opportunities may become real
    owner work; proof diagnostics and unaccepted proposals must stay debug or
    proposal state.
- 2026-05-10 active queue rebase:
  - the Execution Platform convergence tracker preserves historical slices
    and uses an 18-item Active Execution Queue for remaining work.
- 2026-05-11 Skillifier Runtime Job Migration:
  - active-queue-08 is complete. Skillifier now has
    `workflow.skillifier` / `executor.skillifier`, `worker.skillifier.runtime`,
    bounded candidate/edit proposal artifacts, Closeout Capsule opportunity
    linkage, and Work Queue readback.
  - the next Model Memory adjacent target is active-queue-09:
    Proactivity Work Queue Quality Soak.
- 2026-05-09 dense live memory quality closure:
  - Work Queue runtime controls are ON for owner-only production after focused
    runtime-backed smoke.
  - Dense owner-style live UX capture benchmark passed model-authored review
    with 15+ durable memory candidates and no raw prompt/response storage.
  - Follow-up live UX prompts recalled newly captured memory and route-aware
    context policy.
  - Coding, web research, docs/skills, and QA/test workflow prompts ran
    through live UX/runtime with memory-aware context evidence.
  - The legacy retrieval overlay path is hard-disabled outside tests or an
    explicit compatibility env flag; production context insertion uses
    route-aware context packs.
- The canonical blocker list before Phase 2 is now
  [Pre-Phase-2 Gate Ledger](/projects/model-memory/pre-phase-2-gate-ledger).
- Final pre-Phase-2 hardening now adds executable shared-ingestion closeout
  reports, candidate/edge quarantine report helpers, retrieval miss reason
  telemetry, projection hash-invalid exclusion, expanded legacy/fallback
  registry coverage, and persisted-session skill hot-load status reporting.
- Mini remains the strict capture/ingest default. The wrong-pipe routing bug
  is fixed, and the remaining work on the strict mini lane is bounded runtime
  validation rather than auth/model rollback. Mini remains the required strict
  MMV2 admission default.
- Phase 0 is complete.
- Phase 1 is complete.
- Phase 2 entry gates are green, implementation is authorized, and the
  2026-04-25 feature-bucket/spec decision lock is the current planning
  authority before implementation slicing.
- Phase 3 is complete.
- Phase 4 is complete.
- Phase 5 is complete.
- Phase 6 is complete.
- Phase 7 storage cutover is complete:
  - MMV2-native durable SQL storage is live semantic truth
  - old five-kind canonical tables are retired from active truth
  - old DB state is archive-only
- Phase 8 hot-path cleanup is complete:
  - active write seams persist MMV2 live memory batches by default
  - runtime rebuild and the V0 read path consume MMV2 durable truth through
    native runtime records
  - V0 recall/projection assembly is not enough for clean-soak acceptance and
    must be replaced by the Memory Retrieval Runtime
  - legacy compatibility remains fallback-only for the soak window
- The accepted baselines are now:
  - `SOAKQUAR-2026-04-21` for the clean MMV2 retrieval-runtime soak
  - `.artifacts/model-memory/runtime-boundary/2026-04-21-hook-projection-proof/`
    for projection materialization and production hook probe evidence
- The active roadmap is now the pre-Phase-2 execution lane: docs baseline,
  closeout parity, persistence isolation proof, retrieval diagnostics, MMV2
  read cleanup, traceability, DB baselines, recovery/restore proof, and the
  final Phase-2 entry validation pack.
- The 2026-04-22 deep document ingest is paused at
  `checkpoints/model-memory/model-memory-deep-pass-2026-04-22b.json` for
  provider/funnel hardening; resume only after provider credit/preflight,
  checkpoint state, failed-source class selection, and candidate-level
  quarantine/persistence gates are clean.
- The ordinary-turn proof-runner blocker from single-batch candidate-id
  prefixing is fixed, and ordinary-turn proof coverage now spans 11
  adjudicated cases without semantic forests, fuzzy supersession, or
  topic-specific parser fixtures.
- The current-runtime partial-corpus proof is complete against the already
  ingested corpus slice:
  - retrieval selected all expected sampled durable document memories without
    same-session transcript or root workspace memory-file dependency
  - rich projection catalog pages now materialize for all ten v1 projection
    types as compiled artifacts
  - capture seam runtime evidence is fresh for all currently eligible
    production-verified seams
  - the current-runtime soak is not clean because ordinary-turn durable
    capture hit DB connection/statement timeouts and created no new memory
    rows for the durable capture prompts
- Mechanical capture/ingest hardening is now live-proven for pre-Phase-2:
  Passes 1-6 persist safe runtime-state capture jobs and dirty-state
  snapshots/events, defer rebuilds, keep rebuild locking fail-fast by default,
  scope reconciliation, add DB priority lanes and pool-pressure backoff, batch
  live persistence with deferred invalid candidate/edge reports, preflight
  actual strict-schema provider contracts with safe provider/model scorecards,
  and now provide real live cache-aware mini/nano plus large-document
  compression reports.
- Pass 7 has live approved-payload proof at
  `.artifacts/model-memory/memmech-proof/2026-04-23-live/`: capture jobs emit
  `capture_written`, the approved project fact exists as durable workspace
  state, no-store/privacy/temp prompts create no active rows, dirty-state and
  pool telemetry are visible, strict-schema preflight runs actual contracts,
  and root `USER.md` / `MEMORY.md` hashes stay unchanged.
- The 2026-04-25 Phase 2 planning pass locked the high-level bucket set and
  added/updated specs for:
  - [Soft-Source Ingestion And Authority](/projects/model-memory/specs/soft-source-ingestion-and-authority)
  - [Memory Maintenance Loop](/projects/model-memory/specs/memory-maintenance-loop)
  - [Derived Artifact Core](/projects/model-memory/specs/derived-artifact-core)
  - authority-aware retrieval, graph, capsule, planner, skill/tool, cache, and
    privacy behavior

## Current top priorities

0. finish runtime convergence items surfaced on 2026-05-09:
   - remove or fully disable the final compatibility-only bootstrap retrieval
     overlay after accepted quality evidence
   - migrate skillifier/proactivity work into runtime jobs after the live
     memory-policy/context-pack wiring pass
   - run memory-aware workflow quality soaks for coding, research,
     docs/skills, QA/test, and architecture/spec
1. keep capture seam proof fresh for the active seams:
   `message:preprocessed`, `ContextEngine.ingest`,
   `ContextEngine.ingestBatch`, `tool_result_persist`, `after_tool_call`,
   `agent_end`, `ContextEngine.afterTurn`, `agent:bootstrap`, and
   `memory_file_import`
2. keep `message:received` and `message:transcribed` fallback-only unless the
   primary preprocessed seam fails or the media/voice path has no normalized
   later event
3. keep Memory Ops Safe Level 1 limited to operational job/artifact/scheduler
   actions; semantic truth changes continue to require operator approval
4. use Codex-auth mini for strict-schema capture/ingest work by default; nano
   may be used only through explicit low-risk or benchmark lanes until it has a
   proven strict-schema route and evidence-quality parity
5. populate MMV2 with the curated 2026-04 deep document-ingest corpus and
   verify source/segment/memory/event evidence; resume from checkpoint during
   the overnight ingest window, not during build-focused hardening
6. quarantine legacy captured-object write compatibility behind explicit
   fallback/rollback flags
7. harden Retrieval Runtime/projection relevance:
   - prefer fresh projection digests backed by active MMV2 ids
   - emit stale/superseded/deleted/conflicted/inactive exclusions
   - emit retrieval miss diagnostics when durable memories existed but were
     excluded
   - keep all ranking read-time only
8. finish quarantine/removal of fallback compatibility after the clean
   retrieval-runtime soak
9. continue ordinary-turn MMV2 evaluation coverage where needed; the current
   scripted matrix covers preference, directive, project fact, structural
   correction, temp/privacy rejects, workspace scope, duplicate prevention,
   source-ref merge, scoped conflict, and no-fuzzy source-ref conflict
10. stabilize file-pack/provider variance
11. keep live memory activity-feed visibility bounded:
    retrieval/capture lifecycle ids, counts, and statuses may appear in the
    main feed, but raw prompts, transcripts, and tool logs must not
12. maintain the repo-local and Codex global `model-memory-deep-ingest` skill
    as the standard entry point for future ingest resume/monitor/pause work
13. proceed to Phase 2 derived features:

- soft-source authority and source profiles
- corpus system
- Memory Maintenance Loop
- hybrid retrieval
- graph runtime
- graph knowledge
- project-state capsules
- shared derived-artifact core for projections, capsules, graph reports, and
  context artifacts
- proactive planner
- skills/tools
- skill/tool synthesis
- cache/projection policy
- operator UX/observability
- privacy and prompt-injection hardening

Operational hardening note, 2026-04-23:

- runtime dirty-state writeability, capture failure classification, bounded
  tool-result operational facts, host-operator skill-install UX, and
  skill-status introspection are now part of the pre-Phase-2 stability gate
- large-document ingest should run in `auto` strategy mode: direct rigid
  capture for small docs and section-map candidate hints above the threshold,
  with validated hints only narrowing rigid MMV2 admission
- section-map strategy remains default-safe only after the multi-document
  benchmark stays evidence-clean; the 2026-04-23 five-doc audit produced
  useful candidates but still had evidence failures on two docs, so the next
  narrow fix is adaptive stricter-evidence retry for failing sections before
  broad default-safe declaration

These are ordered. Do not wire unverified capture seams, reintroduce semantic
forests, use fuzzy write-path correction, or jump to graph/capsule/planner work
before bounded capture and retrieval/projection hardening have targeted proof.

Packet compiler quality and `kind`-primary cleanup remain relevant, but they
are no longer the sole active roadmap owner. They now sit inside the broader
Phase 2 preparation lane after MMV2-native retrieval, capture, and ops
instrumentation are safe.

## Current Authority

Current implementation authority is:

- MMV2-native durable SQL tables:
  - `model_memory.ingest_sources`
  - `model_memory.ingest_segments`
  - `model_memory.durable_memories`
  - `model_memory.memory_events`
  - `model_memory.memory_edges`
- MMV2 live recording batches and native repository persistence
- native runtime records derived directly from MMV2 durable truth

Historical v1 spec material remains useful for design provenance, but it is not
the current live authority where it conflicts with MMV2-native durable truth.

## Next Engineering Sequence

1. Post-landing verification for the committed bounded tool-result
   proof/capture and projection materialization lanes.
2. Curated deep document-ingest substrate population.
3. Legacy captured-object write compatibility quarantine.
4. ContextEngine production verification for `ingest` / `ingestBatch`.
5. Retrieval/projection relevance, exclusion telemetry, and miss diagnostics:
   - [Memory Retrieval Runtime](/projects/model-memory/specs/memory-retrieval-runtime)
6. Soak-window compatibility quarantine/removal plan.
7. Ordinary-turn MMV2 evaluation coverage.
8. File-pack/provider variance stabilization.
9. Remaining verified primary memory capture seam expansion:
   - [Memory Capture Seams](/projects/model-memory/specs/memory-capture-seams)
10. Live memory activity feed:
    - bounded visible retrieval/capture status in the main feed
    - no raw prompt, transcript, or tool-log persistence
11. Deep-ingest skill maintenance:
    - repo-local OpenClaw skill
    - Codex global skill
    - MMV2 runner/checkpoint workflow
12. Closed-loop memory ops instrumentation:

- [Memory Ops Closed Loop](/projects/model-memory/specs/memory-ops-closed-loop)

13. Mechanical capture/ingest completion:

- [Capture And Ingest Mechanical Hardening](/projects/model-memory/specs/capture-ingest-mechanical-hardening)

14. Phase 2 soft-source authority and maintenance substrate:

- [Soft-Source Ingestion And Authority](/projects/model-memory/specs/soft-source-ingestion-and-authority)
- [Memory Maintenance Loop](/projects/model-memory/specs/memory-maintenance-loop)

15. Phase 2 graph runtime:

- [Graph Derived Runtime Model](/projects/model-memory/specs/graph-derived-runtime-model)

16. First project-state capsule:
    - [Subject Capsules And Dense Ingestion](/projects/model-memory/specs/subject-capsules-and-dense-ingestion)
17. Shared derived-artifact core and projection/capsule separation:

- [Derived Artifact Core](/projects/model-memory/specs/derived-artifact-core)

18. Hierarchical retrieval:

- [Post-Cutover Hierarchical Retrieval](/projects/model-memory/specs/post-cutover-hierarchical-retrieval)

19. Proactive planner:

- [Proactive Memory Planner](/projects/model-memory/specs/proactive-memory-planner)

20. Skill/tool synthesis:

- [Skill And Tool Synthesis](/projects/model-memory/specs/skill-and-tool-synthesis)

21. Cache/projection policy:

- [Cache And Projection Policy](/projects/model-memory/specs/cache-and-projection-policy)

## Phase 0: Specs and scaffolding

Goals:

- create canonical project docs area
- write the full spec pack
- lock decisions before implementation
- define database and runtime boundaries

Exit criteria:

- project index exists
- roadmap, status, decisions, and current slice exist
- spec index exists
- all v1 specs are written and cross-linked

## Phase 1: Core runtime

Goals:

- create `extensions/model-memory`
- define schema and runtime types
- implement source adapters
- implement model semantic interpreter
- implement validation
- implement deterministic identity and write policy
- implement storage for the new logical database

Exit criteria:

- document ingestion and ordinary-turn user capture work end-to-end in isolation
- writes are deterministic
- no legacy memory runtime dependency exists

## Phase 2: Runtime read models and projections

Goals:

- implement `active_memory_slots` and `active_memory_sets`
- implement `session_context_state`
- implement `context_artifacts`
- implement projection compiler for the separate `memory-md` bootstrap
  artifact plus generated `USER.md` and `AGENTS.md` sections
- audit and ingest existing human-authored `MEMORY.md` and `USER.md` content before replacement

Exit criteria:

- runtime read models are deterministic
- projection compiler is deterministic
- generated bootstrap surfaces are derived from canonical memory objects
- canonical generated artifacts live under `.openclaw/model-memory/`
- no repo-tracked docs are treated as volatile runtime cache

The immediate follow-on priority inside this already-landed phase is no longer
simple deterministic projection tuning.

It is:

- shared packet compiler rollout
- `MEMORY.md` packet quality repair as the first proof lane
- retrieval-pack budgeting and packing rules
- prompt-contract migration toward `kind` primary
- explicit investigation into why active `rule` generation is absent in the
  live corpus

## Phase 3: Context engine and usage/cache ledger

Goals:

- implement context engine assembly
- make context assembly work without retrieval first
- delegate compaction to the OpenClaw runtime in phase 1
- implement usage and cache ledger
- record stable, semi-stable, and volatile prompt-shape hashes

Exit criteria:

- context assembly uses derived packs and projections
- context assembly is valid before retrieval exists
- cache and token behavior is inspectable by run and by segment
- subagent-visible rule strategy is defined in the projection layer

## Phase 4: Proof and benchmark

Goals:

- object-native proof harness
- adjudicated corpus
- replay of stored real model outputs where helpful
- calibration and drift monitoring

Exit criteria:

- no exact-string benchmark scoring
- no shared semantic fixture world
- object-native proof passes for v1 scope

## Phase 5: Retrieval and context injection

Goals:

- implement object-native retrieval
- implement deterministic candidate recall
- implement optional reranking and packing seam
- implement retrieval-enhanced context packaging for downstream consumers

Exit criteria:

- retrieval operates over stored semantic objects
- no keyword or exact-string retrieval authority exists
- retrieval benchmarks are object-native

## Phase 6: Shadow mode

Goals:

- optional shadow ingestion from live surfaces
- no user-visible behavior change
- telemetry and false-positive review
- operator inspection, calibration, and readiness reporting

Exit criteria:

- shadow outputs can be compared safely against expectations
- drift and false-positive rates are understood
- live shadow adapters remain observational only
- readiness gates exist for later cutover planning

## Completed implementation slices

### Slice 11: Live database schema and repositories

Completed:

- accepted canonical and runtime-context schema turned into executable SQL migrations
- in-memory storage replaced on the implemented live paths by database-backed repositories and stores
- deterministic write semantics preserved on the database path

### Slice 12: Real model execution boundaries

Completed:

- executor-backed semantic extraction boundary added
- executor-backed retrieval-request interpretation boundary added
- prompt contracts remain structural and placeholder-only

### Slice 13: Live ingestion services and rebuild orchestration

Completed:

- document and ordinary-turn services now persist canonical source data and writes
- deterministic rebuild orchestration now refreshes slots, sets, context artifacts, and projection versions
- controlled replay/admin service surface now exists

### Slice 14: Harness integration

Completed:

- harness-facing bridge now maps projection outputs into OpenClaw bootstrap-file surfaces
- context engine now accepts explicit retrieval-pack gating through the harness boundary
- usage normalization from the harness is now cross-wired into the model-memory ledger

### Slice 15: Operational hardening and shadow rollout

Completed:

- live shadow adapters now exist for document and ordinary-turn surfaces
- operator inspection and calibration reporting surfaces now exist
- readiness-gate evaluation now exists without any cutover behavior

### Slice 16: Stabilization and ingestion operatorization

Completed:

- transient per-window interpreter failures are now contained instead of
  aborting whole document sources
- stage retries now cover transient timeout and invalid-JSON interpreter
  failures conservatively
- heading-path refs now reduce structural provenance transcription errors while
  preserving exact-path validation
- runner-local config sanitation now removes stale `brave`, `browser`, and
  `firecrawl` plugin-entry noise from model-memory runs while leaving
  `memory-middleware` as explicit retirement debt
- a first-class document-ingestion runner/service now exists with durable run
  records, failure containment, resumability, and operator-visible status

### Slice 17: Operator tool surface and prompt-turn proof

Completed:

- the clean-room document-ingestion runner/service is now exposed through the
  optional OpenClaw operator/admin tool `model_memory_document_ingest`
- the tool surface delegates to the real runner/service and does not own a
  parallel ingestion path
- the tool surface is intentionally not a memory-slot plugin:
  - `model-memory` no longer registers as `kind: "memory"`
  - the active memory slot remains unchanged
- live tool smoke completed on `AGENTS.md` and `docs/help/testing.md` with
  `20` persisted claims and `0` rejected windows
- session-turn proof artifacts now exist for 10 real prompts from this session
  on explicit nano/nano
- that prompt-only turn basket established a useful negative result:
  - transport and model execution succeeded on all 10 prompts
  - the ordinary-turn lane had been structurally broken, then was corrected to
    reuse the same shared two-pass ingestion framework as document ingestion

### Slice 18: Unified bounded adjudication

Completed:

- unresolved duplicate handling now uses one bounded adjudication lane instead
  of splitting zero-candidate fallback from retained-candidate handling
- retained structural candidates are now the primary escalation input
- raw-text retrieval remains fallback-only when retained candidates are empty
- final write routing after bounded adjudication now stays local:
  - `yes + non_additive => attach_support`
  - `yes + additive => local supersede/distinct`
  - `ambiguous => local conflict_hold`
  - `no => distinct`
- the current evidence result is mixed:
- the lane is clean and strong on the labeled basket
- current-corpus duplicate quality is still not cutover-clean

### Slice 19: Aggressive cutover execution

Completed:

- the live runtime now wires `model-memory` into:
  - bootstrap/context injection
  - assistant-turn capture
- `model-memory` now has a direct enable/disable switch for rollout safety
- the target production config posture is now supported directly:
  - `plugins.slots.memory = "none"`
  - `agents.defaults.memorySearch.enabled = false`
- gateway startup now warms `model-memory` live mode and skips legacy QMD
  startup when `model-memory` is enabled
- status and doctor now report the cutover posture rather than only
  `memory-core`
- the next step is operational, not architectural:
  - production config flip
  - 72-hour observability window
  - daily sampled review
  - rollback to native no-memory mode if needed

### Slice 18: Zero-candidate recovery

Completed:

- a bounded zero-candidate recovery lane now exists in the live write path
- the lane activates only after the normal deterministic path retained zero
  candidates
- raw text similarity is now used as a recovery substrate only, with local
  class/kind/scope guards still owning final write safety
- a labeled-basket evaluation runner now exists and records rescue rate,
  false-merge rate, and ambiguity rate before relying on the lane as live-write
  evidence
- current-corpus reruns now show that the lane is locally valuable, but not
  yet sufficient to clear long-horizon duplicate pressure for cutover

### Slice 18: Downstream blocker diagnosis

Completed:

- retrieval-request tracing now exists as a dedicated clean-room runner with
  exact provider/request/parse classification
- retrieval prompt-contract bugs were fixed:
  - the prompt now explicitly mentions JSON for `json_object` requests
  - the prompt now requires the exact retrieval-request schema
  - the prompt now reserves `skip` for clearly non-memory queries
- retrieval is now proven on the current populated corpus:
  - all four proof probes return valid retrieval requests
  - all four probes return active-only results
  - retrieval packs are now persisted and included in context runs
- a dedicated support-only rebuild diff runner now proves that pure
  `attach_support` writes do not churn projections, artifacts, or active
  slot/set membership

Still blocking after Slice 18:

- context assembly still over-packs and prunes on every proof probe
- proof-phase artifact churn still mixes retrieval-pack growth with rebuild
  stability reporting
- semi-stable cache hashes still churn across repeated runs
- long-horizon duplicate pressure remains above the cutover bar
  - after restoring the shared path, the 10-prompt basket improved from `0`
    writes to `1` active write
  - a dedicated durable-prompt stage trace now proves prompt-only turns can
    persist real memory on the live lane with `4` active writes from one
    deliberately durable prompt
  - broader ordinary-turn proof is now blocked on capture usefulness and
    calibration, not on operator access, model-call observability, or a dead
    write path

### Slice 19: Downstream quality and duplicate benchmark

Completed:

- real duplicate escapes are now audited case by case instead of inferred from
  raw object counts alone:
  - evidence:
    - [Duplicate Escape Audit](/projects/model-memory/evidence/duplicate-escape-audit)
    - [Duplicate Escape Benchmark](/projects/model-memory/evidence/duplicate-escape-benchmark)
- the benchmark now records a bounded adjudicated rerun sample and corroborating
  duplicate-cluster sample:
  - rerun false-distinct rate in the adjudicated sample: `0.5`
  - rerun attach-support miss rate in the adjudicated sample: `0.5`
  - rerun false-supersede rate in the adjudicated sample: `1.0`
- deterministic fast-attach now expands conservatively from the audited
  patterns:
  - one-candidate near-restatements still fast-attach
  - one dominant retained candidate may now fast-attach when decisive payload
    fields agree exactly and the remaining candidates fail that stronger check
- downstream proof was rerun again on the current corpus only after the
  benchmark-driven attach expansion
- rebuild/projection stability is now separated cleanly from transient
  retrieval-pack artifact growth:
  - stable projection hashes hold
  - stable artifact hashes hold
  - retrieval-pack growth remains visible as transient proof-run output rather
    than canonical instability
- the qualitative retrieval-package review now explicitly compares deterministic
  retrieval versus the model-interpreted retrieval-request lane:
  - evidence:
    - [Retrieval Package Review](/projects/model-memory/evidence/retrieval-package-review)
  - current judgment:
    - deterministic retrieval is carrying most of the useful signal
    - the retrieval-request model step is no longer degrading the four reviewed
      probes
    - the model lane is now neutral rather than additive

After the retrieval-quality and dedupe sprint:

- broad operator/reference/workflow/architecture queries now stay on a
  deterministic-baseline guardrail so the model step cannot collapse them into
  one-result, over-constrained requests
- the latest retrieval-package review is now `4 / 4`
  `mostly_same_value_as_deterministic` and `0 / 4` degraded
- the latest current-corpus proof rerun now shows:
  - all four proof probes return `selectedCount = 5`
  - all four proof probes remain active-only
  - context probe token estimates are bounded at `1309`
  - projection and stable artifact hashes remain stable
  - stable, semi-stable, and volatile cache hashes all remain stable on the
    unchanged and support-only checks
- the blocker is now concentrated in long-horizon duplicate pressure rather
  than retrieval transport, retrieval quality, rebuild stability, or cache
  contract noise
- the duplicate audit worsened on the latest proof rerun:
  - rerun escape cases: `249`
  - duplicate cluster cases: `50`
  - duplicate active-object count in proof: `50`

Still blocking after Slice 19:

- long-horizon duplicate pressure is still above the cutover bar
- repeated reruns still create too many new active siblings instead of turning
  enough true same-claim cases into support
- cutover planning is still not justified
- a deliberate durable-prompt basket has now advanced prompt-only proof beyond
  the earlier one-off durable trace:
  - evidence artifacts now exist for a 10-prompt durable basket on nano/nano
  - all `10 / 10` prompts completed
  - `14` captured claims were produced
  - `13` active writes were persisted
  - `1` write was conservatively contained as `non_durable_ignored`
  - the lane now captures deliberately durable instructions often enough to
    keep expanding proof
  - incidental real prompts remain the weaker lane and still need broader proof
- a manual UI smoke pack now exists:
  - six prompt-only manual UI probes are recorded with expected memory types
    and operator checks
  - the exact roadmap document-ingestion UI smoke payload is recorded there
- one large real session prompt now also has an isolated granular trace:
  - `prompt-004-batched-residual-spec`
  - result: `2` captured claims and `2` active writes
  - this indicates the first session-history basket likely understated
    prompt-only usefulness for richer durable prompts
- the OpenClaw operator tool surface has now also been smoke-verified on
  `docs/projects/model-memory/roadmap.md` itself:
  - tool: `model_memory_document_ingest`
  - latest rerun result: `1 / 1` docs completed, `6` captured claims, `0` ignored windows,
    `0` rejected windows
  - the prior `tools.web.fetch.firecrawl` startup validation warning was
    cleared on the rerun; only the intentional stale `memory-middleware`
    warning remains

### Slice 20: Evidence harness separation and duplicate hinge cleanup

Completed:

- proof runners now use explicit database modes:
  - `full_corpus_proof_db`
  - `targeted_trace_scratch_db`
- targeted collision hinge traces and other narrow live probes now run on a
  disposable scratch DB and write their DB mode into both JSON and Markdown
  artifacts
- full-corpus proof, duplicate audit, duplicate benchmark, and qualitative
  duplicate review now run on the preserved populated proof DB and also record
  DB mode plus database name in their artifacts
- the duplicate audit now classifies each rerun escape by:
  - `missClass`
  - `sameClaimConfidence`
  - `packagingDriftType`
- deterministic duplicate handling was tightened structurally rather than by
  lowering global thresholds:
  - dense rule recall may use a stronger concatenated action-bundle anchor
  - fact reruns may prefer the narrower same-value candidate over a broader
    wrapper candidate
  - wrapper-only or other non-additive deltas now count as same-claim-leaning
    evidence once decisive fields already agree
  - the batch lane now receives `candidateRankReason`,
    `dominantCandidateId`, and `sameClaimRisk`
- the duplicate benchmark now survives corpus evolution more honestly:
  - it still records missing legacy reviewed-case ids
  - it now rebuilds a bounded semantic-fingerprint seed set from the current
    preserved audit when no prior semantic seeds or legacy bootstrap ids
    resolve
- a dedicated qualitative duplicate-review runner now exists:
  - evidence:
    - [Duplicate Escape Review](/projects/model-memory/evidence/duplicate-escape-review)

Latest preserved-corpus results after Slice 20:

- proof corpus totals:
  - canonical objects persisted: `180`
  - support items persisted: `180`
  - active objects: `172`
  - duplicate active-object candidates: `2`
- duplicate audit:
  - rerun escape cases: `99`
  - duplicate cluster cases: `2`
  - miss classes:
    - `batch_attach_miss = 19`
    - `legit_distinct = 80`
- duplicate benchmark:
  - seed bootstrap mode: `current_audit_bootstrap`
  - semantic seeds: `10`
  - rerun reviewed cases: `8`
  - cluster corroboration cases: `2`
- qualitative duplicate review:
  - `clear_duplicate_should_attach = 0`
  - `clear_distinct_should_stay_distinct = 3`
  - `true_ambiguity = 2`
  - `needs_policy_change = 0`
- targeted hinge traces now stay diagnostically useful without poisoning the
  preserved proof corpus:
  - `AGENTS.md` still shows the worst remaining hinge shape:
    - `zero_candidate_skips = 30`
    - `attach_support = 0`
    - `admittedToBatch = 3`
  - `docs/gateway/configuration.md` remains improved but not perfect:
    - `attach_support = 2`
    - `conflict_hold = 3`
    - `zero_candidate_skips = 9`

Still blocking after Slice 20:

- dense rule recall in `AGENTS.md` remains too strict
- broader proof still reports support-only rebuild/cache churn
- cutover readiness remains `not_ready`
- the preserved audit says the obvious duplicate-miss picture is better than
  before, but the remaining `19` batch-attach misses are still too many to
  ignore

### Slice 21: Structural family recall and proof honesty

Completed:

- anti-ontology family recall is now specified as a clean-room direction:
  - no predefined tool taxonomy
  - no predefined operation-target taxonomy
  - no predefined constraint-class taxonomy
  - no semantic router
- family-level recall is now derived from decisive-field text and same-source
  neighborhoods instead:
  - rule: `yes_now`
  - fact: `yes_now`
  - procedure: `yes_now`
  - preference: `yes_now`
  - reference: `yes_later`
- the write path now uses decisive-field family fingerprints as recall aids
  before object-level choice
- same-source neighborhoods may keep plausible siblings alive for adjudication
  without turning source-locality into merge authority
- proof on the current corpus now labels support-only behavior honestly and no
  longer falls back to mixed reruns
- the isolated support-only rebuild diff remains
  `pure_support_only_stable`
- readiness moved to `ready_for_cutover_planning`, but not to cutover
  execution

### Slice 22: Final pre-cutover duplicate and proof pass

Completed:

- one more narrow AGENTS-only recall/batch pass was executed against the
  current surface
- the batch lane now carries clearer same-claim evidence:
  - `sameClaimConfidence`
  - `packagingDriftType`
  - explicit wrapper/field-packing guidance for rule ambiguity
- the proof runner can now exercise a real `pure_attach_support` lane on
  purpose using deterministic synthetic existing-object replay
- the broader proof lane now proves the same support-only stability the
  isolated diff already showed:
  - support-only projection churn = `false`
  - support-only stable artifact churn = `false`
  - support-only stable/semi-stable/volatile cache layers = `true`

Latest results after Slice 22:

- `AGENTS.md` remains the dominant cutover blocker on the current surface:
  - `zero_candidate_skips = 27`
  - `attach_support = 0`
  - `admitted_to_batch = 4`
- current-corpus proof totals now show long-horizon duplicate pressure is still
  too high for cutover:
  - active objects: `301 -> 363`
  - duplicate active-object candidates: `4`
  - saturation reruns:
    - run 1: `objectDelta=21`, `attach_support=12`, `distinct_write=20`
    - run 2: `objectDelta=24`, `attach_support=13`, `distinct_write=24`
    - run 3: `objectDelta=34`, `attach_support=6`, `distinct_write=34`
- duplicate audit on the preserved proof DB now shows:
  - rerun escape cases: `319`
  - replay paths:
    - `batched_adjudication = 168`
    - `distinct_write = 150`
  - miss classes:
    - `batch_attach_miss = 95`
    - `legit_distinct = 223`
- qualitative duplicate review is no longer “rare misses only”:
  - `clear_duplicate_should_attach = 2`
  - `clear_distinct_should_stay_distinct = 3`
  - `true_ambiguity = 2`
  - `needs_policy_change = 0`

Still blocking after Slice 22:

- `AGENTS.md` is still dominated by deterministic gate loss on the current
  surface
- the batch lane still leaves some clear same-claim rule restatements as fresh
  writes
- duplicate misses are not yet rare enough in reviewed real cases
- cutover remains `not_ready`

### Slice 23: Core claim, delta, and parity tightening

Completed:

- a dedicated core-claim/delta measurement runner now exists:
  - evidence:
    - [Core Claim Delta Measurement](/projects/model-memory/evidence/core-claim-delta-measurement)
- the measured-safe deterministic attach shape is now implemented:
  - one dominant core-claim candidate
  - `packaging_only_drift`
  - no same-slot supersession reason
  - no rival with equal core-claim agreement
- structural same-claim evidence now flows into the batch lane:
  - dominant candidate id
  - core-claim match summary
  - blocking-field summary
  - delta class
  - packaging drift type
  - `sameClaimLeaning`
- duplicate review and benchmark now share one stratified sample basket instead
  of evaluating separate populations
- a small live-vs-replay parity runner now exists:
  - evidence:
    - [Live Vs Replay Parity](/projects/model-memory/evidence/live-vs-replay-parity)
- proof retrieval/context probes were expanded modestly without changing the
  retrieval architecture:
  - mixed work prompt
  - rule-heavy instruction
  - fact-heavy configuration

Latest results after Slice 23:

- measured core-claim/delta safety:
  - measured cases: `319`
  - misses blocked by packaging fields: `2`
  - misses blocked by core-claim fields: `93`
  - clear misses that would flip under
    `core-claim-only + packaging_only_drift`: `2`
  - legit-distinct controls that would become risky: `0`
- `AGENTS.md` improved materially on the scratch hinge trace:
  - prior baseline:
    - `zero_candidate_skips = 27`
    - `attach_support = 0`
    - `admitted_to_batch = 3`
  - current result:
    - `zero_candidate_skips = 11`
    - `attach_support = 1`
    - `admitted_to_batch = 2`
    - `conflict_hold = 2`
- the pass is not AGENTS-only:
  - `docs/help/testing.md`:
    - `zero_candidate_skips = 10`
    - `attach_support = 1`
    - `admitted_to_batch = 7`
    - `conflict_hold = 1`
  - `docs/gateway/configuration.md`:
    - `zero_candidate_skips = 12`
    - `attach_support = 0`
    - `admitted_to_batch = 8`
    - `conflict_hold = 8`
- preserved-corpus duplicate evidence still does not clear the cutover bar:
  - review:
    - `clear_duplicate_should_attach = 2`
    - `clear_distinct_should_stay_distinct = 4`
    - `true_ambiguity = 2`
    - `needs_policy_change = 1`
  - aligned benchmark:
    - `attachSupportMissRateOnReruns = 0.25`
    - `falseDistinctRateOnReruns = 0.25`
    - `trueDistinctRateOnReruns = 0.5`
- replay-versus-live parity is still not proven close:
  - sample size: `5`
  - `close = 0`
  - `unresolved_trace_match = 4`
  - `diverged_recall = 1`
- proof stays green on support-only stability and broader retrieval/context, but
  long-horizon duplicate pressure still fails:
  - active objects: `363 -> 441`
  - duplicate active-object candidates: `12`
  - saturation reruns:
    - run 1: `objectDelta=32`, `attach_support=11`, `distinct_write=31`
    - run 2: `objectDelta=26`, `attach_support=18`, `distinct_write=26`
    - run 3: `objectDelta=32`, `attach_support=9`, `distinct_write=31`

Still blocking after Slice 23:

- long-horizon duplicate pressure remains above the cutover bar
- preserved-corpus review still contains clear same-claim misses that should
  have attached support
- replay-versus-live audit parity is still not proven tightly enough
- the blocker is now best described as mixed recall-plus-choice rather than
  recall-only
- cutover remains `not_ready`

### Slice 24: Duplicate conversion and cutover decision

Completed:

- replay-versus-live parity now uses direct case identity instead of fuzzy
  token matching
- low-value fuzzy parity scoring was stripped out of the cutover-facing parity
  lane
- rule batch adjudication now receives stronger structural same-claim evidence:
  - family-recall summary
  - rule action-bundle summary
  - stronger wrapper-versus-constraint guidance
- fact-side structural delta handling now treats narrow same-value plus
  subject-only drift as `packaging_only_drift` when no broader-wrapper
  containment exists
- the shared preserved-corpus duplicate review and benchmark basket was
  enlarged to a more decision-worthy size
- the current corpus was rerun again on:
  - `AGENTS.md`
  - `docs/help/testing.md`
  - `docs/gateway/configuration.md`
  - preserved-corpus duplicate audit
  - preserved-corpus duplicate review
  - preserved-corpus duplicate benchmark
  - preserved-corpus proof phase

Latest results after Slice 24:

- `AGENTS.md` did not clear the bar:
  - prior result:
    - `zero_candidate_skips = 11`
    - `attach_support = 1`
  - latest result:
    - `zero_candidate_skips = 16`
    - `attach_support = 1`
    - `admitted_to_batch = 4`
    - `conflict_hold = 0`
- `docs/help/testing.md` still shows broader rule-side pressure:
  - `zero_candidate_skips = 16`
  - `attach_support = 1`
  - `admitted_to_batch = 10`
  - `conflict_hold = 0`
- `docs/gateway/configuration.md` improved materially on the latest pass:
  - `zero_candidate_skips = 5`
  - `attach_support = 4`
  - `admitted_to_batch = 12`
  - `conflict_hold = 1`
- preserved-corpus duplicate evidence still failed the cutover bar:
  - duplicate audit:
    - rerun escape cases: `448`
    - `batch_attach_miss = 140`
    - `deterministic_attach_miss = 6`
    - `legit_distinct = 300`
  - shared qualitative review:
    - sample size: `16`
    - `clear_duplicate_should_attach = 6`
    - `clear_distinct_should_stay_distinct = 6`
    - `true_ambiguity = 4`
  - aligned benchmark:
    - `rerunSampleSize = 14`
    - `attachSupportMissRateOnReruns = 0.3077`
    - `falseDistinctRateOnReruns = 0.3077`
    - attach-support miss interval remains wide:
      - lower = `0.1268`
      - upper = `0.5763`
- direct parity is cleaner structurally but still unresolved:
  - sample size: `6`
  - `close = 0`
  - `diverged = 6`
  - all remaining divergence is localized to `trace_match`
- proof remained green on support-only stability and retrieval/context
  boundedness, but long-horizon duplicate pressure worsened again:
  - canonical objects persisted: `573`
  - support items persisted: `575`
  - active objects: `492`
  - duplicate active-object candidates: `17`
  - saturation reruns:
    - run 1: `objectDelta=14`, `attach_support=13`, `distinct_write=14`
    - run 2: `objectDelta=22`, `attach_support=5`, `distinct_write=22`
    - run 3: `objectDelta=27`, `attach_support=7`, `distinct_write=24`

Still blocking after Slice 24:

- long-horizon duplicate pressure still fails the cutover bar
- the shared preserved-corpus duplicate basket still contains too many clear
  should-attach misses
- replay-versus-live parity is still not proven close enough for a confident
  cutover call
- the blocker remains mixed:
  - deterministic gate loss is still real on dense rule sources
  - batch choice still leaves too many recovered same-claim cases unconverted
- historical judgment at that point was `not_ready_for_cutover`
- one more focused pass is only justified if it directly attacks:
  - exact live-versus-replay case replay
  - batch-heavy same-claim conversion
- broader complexity beyond that point likely has diminishing returns

### Slice 18: Write-path hinge correction and proof-phase hardening

Completed:

- deterministic collision pruning now relies more on full
  `normalizedSearchText` overlap and less on subject/title anchoring
- a conservative one-candidate fast-attach lane now skips model adjudication
  for very high-overlap near-restatements
- the residual batch adjudication prompt now prefers `attach_support` over
  `conflict_hold` for one-candidate paraphrases
- the representative hinge basket was rerun on:
  - `AGENTS.md`
  - `docs/help/testing.md`
  - `docs/gateway/configuration.md`
- observed hinge result:
  - `docs/gateway/configuration.md` improved materially:
    - `attach_support` rose from `1` to `6`
    - `conflict_hold` dropped from `7` to `0`
  - `docs/help/testing.md` improved from `1` to `3` attach-supports
  - `AGENTS.md` still under-attaches and remains the main hinge follow-up case
- the full proof phase now completes end-to-end on a fresh 100-source corpus
  and emits durable artifacts instead of aborting on retrieval probe failures
- the proof runner now records live retrieval/context provider failures as
  explicit probe errors
- historical cutover judgment at that point was `not_ready`
  - remaining blockers:
    - retrieval probe provider `400` failures on the nano lane
    - unproven context assembly because retrieval probes did not complete
    - support-only rebuild/projection churn
    - unproven cache stability

## Phase 7: Cutover, retirement, and deletion

Goals:

- execute migration from the legacy memory stack to `model-memory`
- retire all legacy runtime surfaces
- delete legacy code and deployed runtime state

Exit criteria:

- `model-memory` is the only active memory authority
- legacy memory plugins, runtime, hooks, and docs are removed
- legacy memory state is purged from deployed hosts after export/snapshot where needed

## Deferred

- advisory planning
- fuzzy consolidation workflow
- further residual batched collision-prompt calibration once wider ingestion
  proof shows whether close-case attach-support misses remain material
- package split between memory and context layers if later justified
- post-cutover hierarchical or multi-pass retrieval for long multi-objective
  prompts
  - keep current single-request retrieval as the cutover lane
  - add bounded query decomposition only after cutover
  - prove that multi-pass retrieval improves broad planning prompts without
    regressing short direct queries or blowing context budgets
- additional AGENTS rule-recall tuning once the preserved audit shows a stable
  dominant miss shape

## 2026-05-09 Memory Runtime Maximality Closure

Model Memory is now wired through the new Execution Platform runtime/middleware
paths for the 13 hook migration set. The primary production path is
model-task/DB-operation runtime evidence plus route-aware context-pack policy;
old direct paths are compatibility-only. The live Tailscale UX proof covered
ordinary chat recall, follow-up recall, hybrid retrieval, bounded context packs,
workflow-shaped memory context, opportunity seeds, Work Queue proactivity, and
a controlled over-budget automatic compaction proof.

Follow-up on 2026-05-09: memory capture and retrieval/context quality are now
assessed by model-authored reviews, not deterministic semantic scoring. Current
projection validation found no inactive `agents-md` source refs, so the prior
warning is stale doc/artifact drift. Canonical context packs are defined for
retrieval, projection, stable memory, tool-result summary, closeout capsule,
workflow runtime state, Work Queue readback, and skill context. The final
remaining production-adjacent memory compatibility item is the legacy
bootstrap retrieval overlay at
`src/agents/model-memory/live-runtime/retrieval-context.ts`, which is
compatibility-only until the explicit hard-shutdown slice removes or fully
disables it.

Next roadmap block:

1. Proactivity Work Queue Quality Soak.
2. Memory-aware workflow quality soak for coding, research, docs/skills,
   QA/test, and architecture/spec.
3. Model Memory Compatibility Hard Shutdown.
4. Memory Curator Workflow.
5. Skill Curator Workflow.
6. Final coherence audit and owner UX production soak.
