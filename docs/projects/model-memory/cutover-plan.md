---
summary: "Aggressive full cutover plan from legacy memory to model-memory."
title: "Model Memory Cutover Plan"
---

# Model Memory Cutover Plan

## Decision

Cut over aggressively from the legacy memory stack to `model-memory`.

This is not a dual-run product plan.

After cutover:

- `model-memory` is the primary memory authority
- the old memory stack is disabled on the active runtime path
- rollback goes to native no-memory behavior, not back to the old heuristic
  memory stack

The repo is no longer spending pre-cutover time trying to make duplicate logic
perfect. The remaining issues are now treated as post-cutover monitoring and
fast-follow fix work.

## Implementation status

The cutover-enabling runtime seams are now landed in the repo:

- live harness bootstrap/context injection now accepts a `model-memory`
  overlay
- assistant-turn capture now writes through the live `model-memory` path
- `model-memory` now has a real plugin config schema for:
  - `plugins.entries.model-memory.config.live.*`
  - `plugins.entries.model-memory.config.database.*`
- gateway startup now warms `model-memory` live mode and skips legacy QMD
  startup when `model-memory` is enabled
- status and doctor now report the cutover posture directly

That work is now complete.

The production flip was executed on `2026-04-15` UTC. The repo is now in the
72-hour stabilization window, not in pre-flip planning.

## Current-state inventory

### Active legacy runtime seams

The current production-shaped memory path still points at the legacy stack.

Primary active seams:

- `src/plugins/slots.ts`
  - default `plugins.slots.memory = "memory-core"`
- `src/commands/status.scan.ts`
  - only reports memory status when the active slot is `memory-core`
- `src/agents/tools/memory-tool.ts`
  - exposes `memory_search` and `memory_get` through the legacy manager
- `src/agents/memory-search.ts`
  - resolves legacy `agents.defaults.memorySearch.*` config
- `src/memory/index.ts`
  - manager entrypoint for legacy memory search
- `src/gateway/server-startup-memory.ts`
  - gateway startup arms the legacy QMD backend
- `extensions/memory-core/index.ts`
  - current bundled `kind: "memory"` plugin
- `docs/concepts/memory.md`
  - documents workspace markdown memory plus QMD/sqlite indexing as canonical
- `docs/cli/memory.md`
  - documents `openclaw memory ...` as the active memory CLI

### Legacy config and operator seams still in play

- `plugins.slots.memory`
- `plugins.entries.memory-core.*`
- `plugins.entries.memory-lancedb.*`
- `agents.defaults.memorySearch.*`
- `memory.backend`
- `memory.qmd.*`
- `openclaw memory ...`
- `status` / `doctor` memory reporting tied to the legacy plugin

### Current model-memory seams

`model-memory` is present, but it is not yet the active memory runtime.

Current seams:

- `extensions/model-memory/index.ts`
  - operator/admin tool surface only
- `extensions/model-memory/openclaw.plugin.json`
  - not a `kind: "memory"` plugin
- `src/agents/model-memory.integration.ts`
  - harness/context integration helper exists, but is not live-wired
- `extensions/model-memory/src/*`
  - clean-room storage, retrieval, context, projection, and write policy
- `src/agents/model-memory.*`
  - proof, audit, benchmark, review, parity, and other evidence runners

### Existing observability seams

- `src/agents/model-memory.proof-phase.ts`
  - long-horizon pressure, retrieval/context health, stable-surface checks
- `src/agents/model-memory.duplicate-audit.ts`
  - duplicate escape audit
- `src/agents/model-memory.duplicate-review.ts`
  - qualitative review basket
- `src/agents/model-memory.duplicate-benchmark.ts`
  - review-aligned quantitative basket
- `extensions/model-memory/src/operator-inspection.ts`
  - recent captures, write decisions, projection versions, retrieval requests,
    and context runs
- `docs/projects/model-memory/evidence/*`
  - current durable truth surfaces

## Target end state

### Runtime posture

After cutover:

- `model-memory` owns memory capture, retrieval, projection, and context
  assembly for the live runtime
- the legacy memory plugin slot is disabled for normal operation
- the legacy markdown/vector/QMD stack is not used for live truth

### Rollback posture

Rollback target:

- native out-of-the-box behavior with memory disabled

Not acceptable as rollback:

- restoring `memory-core`
- restoring `memory-lancedb`
- restoring `memory_search`/QMD as the semantic truth path

### Operator posture

Normal mode:

- `model-memory` enabled
- legacy memory slot disabled
- model-memory observability and sampled review active

Rollback mode:

- `model-memory` disabled
- legacy memory slot remains disabled
- agents operate without memory plugins

Emergency disablement mode:

- same as rollback mode
- use only when memory writes, retrieval, or duplicate pressure become
  operationally unsafe

## Architecture choice for cutover

The cutover should not force `model-memory` into the legacy memory-slot shape
as a temporary compatibility move.

Preferred architecture:

- wire `model-memory` directly into the live harness/runtime path
- keep one explicit `model-memory` enable/disable switch for rollout safety
- disable `plugins.slots.memory` rather than repointing it to a legacy-shaped
  replacement

Why:

- the memory-slot abstraction currently points at the old
  `memory_search`/`memory_get` stack
- `src/commands/status.scan.ts` and related surfaces still special-case
  `memory-core`
- forcing `model-memory` through that same compatibility shape would preserve
  the old control surface instead of retiring it

## Cutover sequence

### Phase 0 - pre-cutover implementation landing

Status:

- completed

Land the minimal runtime and operational seams needed for the cutover:

1. Add a real live-runtime enablement seam for `model-memory`.
2. Wire `model-memory` capture, retrieval, projection, and context integration
   into the live harness path.
3. Add a direct disablement switch for `model-memory`.
4. Update status/doctor/operator reporting so they can report `model-memory`
   rather than only `memory-core`.
5. Keep the legacy stack present in code, but not on the active path after the
   flip.

This is the only implementation preflight recommended before the cutover
execution itself.

### Phase 1 - deployment package

Ship one deployment containing:

- live `model-memory` runtime wiring
- explicit `model-memory` kill switch
- model-memory observability surfaces
- post-cutover sampled-review instructions
- legacy-memory disablement changes

Changes shipped in the same deploy:

- disable legacy slot default in production config:
  - `plugins.slots.memory = "none"`
- disable legacy memory search:
  - `agents.defaults.memorySearch.enabled = false`
- stop relying on:
  - `memory.backend`
  - `memory.qmd.*`
  - `extensions/memory-core`
  - `extensions/memory-lancedb`

### Phase 2 - cutover flip

Activate `model-memory` immediately after deploy using the explicit runtime
switch.

Required posture after the flip:

- `model-memory` on
- legacy memory slot off
- no dual semantic authority

### Phase 3 - immediate post-deploy verification

Within the first hour, verify all of:

- `model-memory` runtime is active
- recent capture/write counters move
- retrieval/context surfaces remain operational
- no write-path error spike
- at least some `attach_support` outcomes are observed on live traffic
- no unexpected growth in `conflict_hold`

### Phase 4 - stabilization window

Use a short explicit stabilization window:

- 72 hours

During that window:

- monitor operational signals continuously
- run daily sampled review
- make fast-follow fixes if needed
- if the cutover becomes operationally unsafe, disable `model-memory` and stay
  on native no-memory behavior while fixing forward

## Immediate post-cutover observability

### Signals to watch

Minimum watch surface:

- `attach_support`
- fresh active-object growth
- duplicate active-object candidates
- `conflict_hold`
- ambiguous adjudication outcomes
- cross-kind adjudication outcomes
- write-path failures
- retrieval/context probe health

### Source of each signal

- `attach_support`, write decisions, recent captures:
  - `extensions/model-memory/src/operator-inspection.ts`
- duplicate active-object pressure and long-horizon growth:
  - `src/agents/model-memory.proof-phase.ts`
- qualitative duplicate quality:
  - `src/agents/model-memory.duplicate-review.ts`
- review-aligned quantitative rate tracking:
  - `src/agents/model-memory.duplicate-benchmark.ts`
- escape classification:
  - `src/agents/model-memory.duplicate-audit.ts`

### Watch cadence

Immediate watch:

- first 15 minutes
- first hour
- end of day 1

Daily watch:

- days 1 through 3 after cutover

### Investigation triggers

Investigate immediately if any of the following are true:

- write-path errors are non-zero for more than 15 minutes
- `conflict_hold` rises sharply relative to recent `attach_support`
- duplicate active-object candidates rise materially day-over-day
- sampled review finds more than 2 clear duplicate escapes in a 20-case daily
  basket
- cross-kind same-core rejections cluster around one repeated shape

### Disablement triggers

Disable `model-memory` temporarily if any of the following are true:

- write-path failures are systemic rather than isolated
- sampled review shows repeated unsafe merges or repeated obvious duplicate
  escapes at a rate that is clearly worse than expected
- duplicate active-object pressure keeps compounding across two consecutive
  daily windows and the sample confirms the growth is real duplicate escape,
  not merely healthy new content

## Sampled review loop

### Daily review basket

For the first three days after cutover, review a bounded basket daily.

Target basket:

- 20 cases per day

Composition:

- 8 likely duplicate escapes
- 4 fresh active objects with strongest prior-neighbor similarity
- 4 `conflict_hold` or ambiguous adjudication cases
- 4 cross-kind same-core candidates, especially `fact` versus `rule`

### Labels to record

- `clear_duplicate_should_attach`
- `clear_distinct_should_stay_distinct`
- `true_ambiguity`
- `unsafe_merge_risk`
- `followup_needed_cross_kind`

### Escalation criteria

- more than 2 `clear_duplicate_should_attach` cases in one daily basket:
  next-day fix
- any `unsafe_merge_risk` cluster:
  hotfix or temporary disablement review
- repeated same-shape cross-kind misses:
  focused post-cutover calibration sprint

## Rollback and disablement

### Required rollback action

Rollback action must disable `model-memory` directly.

Rollback action must not:

- set `plugins.slots.memory = "memory-core"`
- restore QMD as primary memory
- re-enable legacy memory-search truth

### Disabled-mode behavior

When `model-memory` is disabled:

- no new model-memory capture writes
- no model-memory retrieval injection
- no model-memory context assembly
- legacy memory plugins remain disabled
- agents continue with normal conversation context only

This is acceptable degradation for emergency safety.

### Data safety

Rollback preserves:

- existing `model-memory` database state
- all evidence artifacts already generated

Rollback does not require:

- deleting model-memory data
- deleting legacy-memory data immediately

## Legacy retirement classification

### must_before_cutover

- add `model-memory` live-runtime enable/disable switch
- wire model-memory into the live harness/runtime path
- disable `plugins.slots.memory` in production config
- disable `agents.defaults.memorySearch.enabled` in production config
- update status/doctor reporting so cutover state is visible without relying on
  `memory-core`
- publish cutover checklist and sampled-review procedure

### immediately_after_cutover

- rewrite docs that still describe legacy markdown/QMD memory as canonical:
  - `docs/concepts/memory.md`
  - `docs/cli/memory.md`
- deprecate or hide operator commands that imply legacy memory is the live
  system
- deprecate plugin/config help that still presents `memory-core` as the default
  active slot
- freeze legacy memory code to emergency-fix only during the 72-hour window

### delete_after_stability_window

- `src/memory/`
- `extensions/memory-core/`
- `extensions/memory-lancedb/`
- `src/plugin-sdk/memory-core.ts`
- `src/plugin-sdk/memory-lancedb.ts`
- `src/agents/tools/memory-tool.ts`
- `src/agents/memory-search.ts`
- `src/gateway/server-startup-memory.ts`
- legacy memory docs and config help that no longer apply
- uninstall/reset logic that defaults the slot back to `memory-core`

## Go/no-go checklist

Proceed with cutover only when all are true:

1. Live-runtime `model-memory` wiring is landed.
2. Explicit `model-memory` disablement path is landed.
3. Production config disables the legacy memory slot.
4. Production config disables legacy memory search.
5. Status/doctor/operator surfaces can confirm cutover state.
6. Immediate post-deploy watch owners are assigned.
7. Daily sampled-review owners are assigned for the 72-hour window.
8. Fast-follow hotfix path is agreed.

## Readiness judgment

Judgment:

- `ready_to_execute_cutover_plan`

Reason:

- the main remaining work is operational cutover implementation and controlled
  rollout execution, not more pre-cutover duplicate research
- `model-memory` is materially stronger than the legacy system
- the legacy system is not worth preserving as the fallback target
- the repo now needs decisive transition execution with observability and
  forward-fix discipline
