---
summary: "Current slice for model-memory."
title: "Model Memory Current Slice"
---

# Current Slice

## Slice

`mmv2-hardening-landing-and-paused-ingest`

## Goal

Use the accepted `SOAKQUAR-2026-04-21` clean soak, accepted runtime-boundary
proof, committed runtime-hardening landing at `ee0c093c1a`, and the
`SOAKLAND-2026-04-22` hardening proof as regression baselines. The active lane
keeps document ingest paused, lands fallback quarantine/retrieval/projection
hardening, and prepares the next overnight ingest continuation without
reintroducing semantic forests, fuzzy write-path correction, root
workspace-file write-back, or raw-data capture.

The accepted runtime-boundary proof rooted at
`.artifacts/model-memory/runtime-boundary/2026-04-21-hook-projection-proof/`
is now the baseline for projection materialization and production hook probe
evidence.

The active slice is no longer the old v1 cutover, five-kind storage, or
packet-only/kind-balance lane. Those records remain useful history, but the
current implementation authority is MMV2-native durable truth.

The 2026-04-22 document ingest is intentionally paused for an overnight pickup.
The checkpoint is
`checkpoints/model-memory/model-memory-deep-pass-2026-04-22b.json` with 100
attempted, 92 completed, 8 failed, 204 pending, and no running source at pause.
This pause is not a retrieval/projection hardening failure and must not be
worked around with semantic forests or topic heuristics.

The 2026-04-22 hardening landing proof is rooted at
`.artifacts/model-memory/soak-ui-validation/2026-04-22-hardening-land-soak/`.
The first correction attempt hit a live capture DB timeout and is recorded as a
runtime availability caveat. The affected item was rerun in isolation as
`SOAKLAND-2026-04-22-CORRECTION-RERUN`; it created correction memory
`7b3811fb-9613-5443-bc73-dd6799f893f1`, event
`9eb0cc1c-aa6a-54cc-8de4-4e7c8e42cb77`, and supersession edge
`0da10fcc-b5a7-5962-9d69-982d748755d6` to exact target memory
`231bd0a5-2f7c-5f65-af75-397668a2e960`.

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
- legacy compatibility remains only as soak-window fallback:
  - legacy-shaped captured-object write compatibility
  - legacy-style read projection compatibility at edges where still needed
  - storage engine fallback for rollback posture
- old v1 spec closure material is historical authority only
- MMV2 proof/file-pack artifacts remain evaluation-only and do not write to the
  live durable-memory DB

## Current Risks

- soak-window fallback code still exists and must be removed or further
  quarantined in small reversible slices
- ordinary-turn MMV2 evaluation coverage lags the live write-path reality
- retrieval relevance is acceptable for the clean soak but not yet globally
  optimized; future misses must stay observable through retrieval telemetry
- live retrieval/context lookup can still transiently time out under UI proof
  load; this should be treated as a runtime availability/diagnostics issue, not
  a reason to add topical write-path heuristics
- file-pack/provider variance still needs seeded stabilization and reporting
- several proposed capture hooks still need production-safe verification before
  any capture wiring
- closed-loop operational signals must avoid dark data and must not become
  parallel raw capture

## Current Work Queue

1. Keep `message:preprocessed` routing/telemetry-only until dedupe and
   no-raw-prompt guarantees are proven.
2. Treat `ContextEngine.ingest` and `ContextEngine.ingestBatch` hook evidence
   as production evidence only when it comes from real UI/gateway turns; do not
   fake production verification from direct internal calls.
3. Resume the curated 304-source document-ingest corpus later from checkpoint
   `checkpoints/model-memory/model-memory-deep-pass-2026-04-22b.json`; do not
   resume it during build-focused hardening work.
4. Continue hardening Retrieval Runtime relevance and telemetry without
   mutating truth:
   - prefer fresh projection digests backed by active MMV2 ids
   - record stale/superseded/deleted/conflicted/inactive exclusions
   - emit `memory_existed_but_excluded` diagnostics when candidates are found
     but not selected
   - emit empty-retrieval telemetry
   - keep lexical/RRF/vector-style ranking read-time only
5. Add remaining evaluation coverage for:
   - tool-result proof capture
   - projection-backed recall
   - stale/superseded exclusion
   - no raw-data persistence
   - duplicate ordinary-turn capture prevention
   - root `USER.md` / `MEMORY.md` no-write
6. Inventory and quarantine remaining fallback compatibility in small
   reversible slices:
   - no broad deletion without tests
   - no legacy semantic-family/collision behavior in default MMV2 hot paths
   - only explicit fallback flags with tests
7. Harden ordinary-turn MMV2 evaluation coverage:
   - durable preference
   - durable directive
   - durable project fact
   - structural correction target
   - temp/session-only reject
   - privacy/no-store reject
   - scope and evidence grounding
   - no topic parser or fuzzy write-path supersession regression
8. Run seeded file-pack/provider variance comparisons and separate:

- deterministic regression
- provider/model variance
- JSON-boundary failure
- comparator strictness issue
- real semantic regression

9. Implement the remaining capture seam expansion described in
   [Memory Capture Seams](/projects/model-memory/specs/memory-capture-seams).
   Live feed visibility is separate from capture wiring and must remain
   bounded operational telemetry only.
10. Implement the closed-loop ops instrumentation described in
    [Memory Ops Closed Loop](/projects/model-memory/specs/memory-ops-closed-loop).
11. Proceed to Phase 2 derived features in order:

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
