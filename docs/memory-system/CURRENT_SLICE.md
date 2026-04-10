# Current Slice

## Active slice

Long-prompt ordinary-turn memory-capture expansion

## Objective

Allow one long prompt to surface many more valid memory candidates without
turning ordinary chat into memory spam, while keeping immediate acceptance
bounded and preventing lower-ranked valid candidates from starving forever.

## What is now landed

### Native memory projection tranche

- projection-surface inventory hardening
- approved-only destination eligibility
- deterministic generated-zone compiler scaffolding
- shared `USER.md`, `TOOLS.md`, and compact `MEMORY.md` projections
- canonical `memory/YYYY-MM-DD.md` continuity compiled from raw dated leaves
- project-local `projects/<slug>/MEMORY.md` projections plus top-level digest
  pointers
- projection audit / omission / drift reporting
- explicit circularity protection in native file indexing
- metadata-first shared/project/agent scope classification
- first specialized-agent projection tranche for real specialized workspaces
- explicit allowlisted project rollout for real workspace project folders
- project-local projections now target real allowlisted `projects/<slug>/INDEX.md`
  docs by default, with `MEMORY.md` only as a compatibility fallback
- operator-facing projection summary output alongside machine-readable audit
- daily operator-review integration for projection state
- host-cron scheduled projection refresh plus a hardened manual sync command
- broader specialized-agent rollout for `x-manager` and `web-researcher`
- metadata-first project precedence for project-scoped agent memory
- stale-aware host-side projection orchestration and status reporting
- no schema change was required for the broader native-file tranche

### Landing-gate hardening

- constrained full-repo safe mode for local low-memory hosts
- smaller full-repo unit batches
- serial top-level execution in constrained safe mode
- higher default worker heap budget in constrained safe mode
- planner output now makes the safe-mode decision visible

### Long-prompt memory-capture expansion tranche

- ordinary-turn auto-capture now scans a larger bounded segment pool for long
  prompts instead of the old fixed 12-segment ceiling
- capture now builds and ranks a bounded candidate pool before deciding what
  gets immediate acceptance
- immediate acceptance is still bounded, but now uses posture-aware total caps
  plus per-family caps
- lower-ranked valid candidates now persist as deferred overflow evidence
  instead of being dropped on the floor
- repeated prompts can promote deferred overflow candidates instead of
  resubmitting only the strongest already-approved candidates forever
- explicit multi-preference and multi-fact packets can enter a stronger bulk
  posture while ordinary shorter prompts stay on the tighter default posture
- no schema change was required for the deferred-overflow tranche

## What is live but still bounded

- Postgres remains canonical durable memory
- native files remain one-way projections plus human-authored control surfaces
- shared top-level `MEMORY.md` stays compact and pointer-oriented
- project-local rollout starts from an explicit workspace allowlist rather than
  every project folder
- specialized per-agent projections stay narrow and only target justified
  workspaces
- raw daily leaves remain continuity inputs; the exact-day file is a compiled
  continuity view, not canonical durable memory
- scheduled projection refresh is daily host cron plus manual sync, not per-turn
  mutation
- stale-aware refresh is host-side and bounded; it is not native runtime cron
  and not per-turn mutation
- ordinary-turn immediate acceptance is still intentionally bounded even in
  bulk posture
- deferred overflow is now durable evidence, but it is still a bounded queue
  rather than an unbounded write path
- repeated prompts can promote deferred overflow candidates, but this is still
  confirmation-based and not broad autonomous approval

## What still waits until later

- truthful alias expansion for project records that still do not map to a real
  workspace folder
- broader specialized-agent coverage only if later real workspaces justify it
- any schema changes only if future evidence proves metadata-first routing is
  insufficient
- richer deferred-overflow promotion policy if later rollout shows that
  confirmation-only promotion is still too conservative
