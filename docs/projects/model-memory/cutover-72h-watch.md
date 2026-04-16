---
summary: "Operational watch and sampled-review procedure for the first 72 hours after the model-memory cutover."
title: "Model Memory 72 Hour Watch"
---

# Model Memory 72 Hour Watch

## Day 0 state

Production cutover was executed on `2026-04-15` UTC with the live runtime in
this posture:

- `plugins.entries.model-memory.enabled = true`
- `plugins.entries.model-memory.config.live.enabled = true`
- `plugins.entries.model-memory.config.database.url` configured
- `plugins.slots.memory = "none"`
- `agents.defaults.memorySearch.enabled = false`

Verified day-0 runtime state:

- `openclaw status` shows:
  - `Model memory = enabled`
  - `db = postgres`
  - `capture = on`
  - `context = on`
  - `legacy slot = off`
  - `legacy search = off`
- gateway/runtime was rebuilt and restarted on the live Docker Compose path
- startup logs no longer show the earlier `model-memory` migration warmup
  failure

Day-0 verification artifact:

- [Cutover Day 0 Verification](/projects/model-memory/evidence/post-cutover/day-0-cutover-verification)

## Watch cadence

### Immediate checks

Run now, then again after any restart:

```bash
node dist/index.js status
node dist/index.js status --json
docker logs --tail 200 openclaw-runtime
```

### Hourly on day 0

Run once per hour until the first 24 hours complete:

```bash
node dist/index.js status --json
docker logs --since 1h openclaw-runtime
```

### Daily on days 1 through 3

Refresh the durable evidence surfaces once per day:

```bash
node --import tsx scripts/model-memory-duplicate-audit.ts
node --import tsx scripts/model-memory-duplicate-review.ts
node --import tsx scripts/model-memory-duplicate-benchmark.ts
MODEL_MEMORY_PROOF_SKIP_RESET=1 MODEL_MEMORY_PROOF_SKIP_INGESTION=1 node --import tsx scripts/model-memory-proof-phase.ts
```

## Signals to watch

### Runtime posture

Source:

- `node dist/index.js status --json`

Must remain true:

- `modelMemoryRuntime.enabled = true`
- `modelMemoryRuntime.databaseConfigured = true`
- `modelMemoryRuntime.captureWritesEnabled = true`
- `modelMemoryRuntime.contextInjectionEnabled = true`
- `modelMemoryRuntime.legacyMemorySlotDisabled = true`
- `modelMemoryRuntime.legacyMemorySearchDisabled = true`
- `memoryPlugin.enabled = false`

Investigate immediately if any one of those flips.

Disable immediately if:

- `modelMemoryRuntime.enabled = false` unexpectedly
- `memoryPlugin.enabled = true`
- legacy slot/search turns back on

### Write-path failures

Source:

- `docker logs --since 1h openclaw-runtime`

Investigate immediately if logs show repeated:

- `model-memory live runtime warmup failed`
- database connection failures
- write/capture failures
- retrieval/context assembly failures

Disable immediately if:

- the same `model-memory` write-path failure repeats `5+` times in one hour
- capture or context assembly fails after a restart and does not recover

### Attach, hold, and ambiguity outcomes

Source:

- `docs/projects/model-memory/evidence/duplicate-escape-audit.json`
- `docs/projects/model-memory/evidence/duplicate-escape-review.json`

Watch:

- `attach_support`
- `conflict_hold`
- ambiguous adjudication outcomes
- cross-kind same-core outcomes

Investigate if:

- `attach_support` stays at `0` for a full day
- `conflict_hold` rises day-over-day
- cross-kind same-core cases repeat in the same shape

Disable if:

- sampled review finds `2+` `unsafe_merge_risk` cases in one 20-case basket

### Fresh active-object growth and duplicate pressure

Source:

- `docs/projects/model-memory/evidence/proof-phase-report.json`

Watch:

- fresh active-object growth
- duplicate active-object candidates
- retrieval/context health

Investigate if:

- duplicate active-object candidates rise by `10+` day-over-day
- fresh active objects continue growing faster than support growth for two
  consecutive daily runs
- retrieval/context flips from green to failing or unstable

Disable if:

- duplicate active-object pressure compounds across two consecutive days and
  daily sampled review confirms the new growth is mostly duplicate escape

## Daily 20-case sampled review

Run once per day for day 1, day 2, and day 3.

### Basket construction

1. Refresh:

```bash
node --import tsx scripts/model-memory-duplicate-audit.ts
node --import tsx scripts/model-memory-duplicate-review.ts
```

2. Use all cases from:

- `docs/projects/model-memory/evidence/duplicate-escape-review.json`

3. If that review basket contains fewer than `20` cases, top it up from:

- `docs/projects/model-memory/evidence/duplicate-escape-audit.json`

Use the highest-similarity cases not already sampled, preferring:

- cross-kind same-core candidates
- recent `conflict_hold` cases
- recent likely duplicate escapes

4. Save the completed daily review to:

- `docs/projects/model-memory/evidence/post-cutover/day-1-sampled-review.md`
- `docs/projects/model-memory/evidence/post-cutover/day-2-sampled-review.md`
- `docs/projects/model-memory/evidence/post-cutover/day-3-sampled-review.md`

### Labels

Each reviewed case must receive exactly one label:

- `clear_duplicate_should_attach`
- `clear_distinct_should_stay_distinct`
- `true_ambiguity`
- `unsafe_merge_risk`
- `followup_needed_cross_kind`

### Escalation

- `hotfix`
  - runtime failure
  - rollback trigger
  - `unsafe_merge_risk`
  - one repeated same-shape regression with clear production impact
- `next_day_fix`
  - clear duplicate under-attachment
  - rising `conflict_hold`
  - repeated cross-kind ambiguity
  - growing duplicate pressure without unsafe merge evidence
- `backlog`
  - isolated edge case
  - review-only quality improvement
  - low-frequency ambiguity without operational impact

## Disablement action

If disablement is required:

1. Set `plugins.entries.model-memory.config.live.enabled = false`.
2. Keep `plugins.slots.memory = "none"`.
3. Keep `agents.defaults.memorySearch.enabled = false`.
4. Restart the gateway/runtime.
5. Verify `openclaw status` shows `Model memory` disabled and legacy memory
   still off.

This rollback target is native no-memory mode. Do not restore the legacy memory
stack.
