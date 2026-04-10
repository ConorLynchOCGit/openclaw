# Current Slice

## Active slice

Native OpenClaw file integration and landing-gate hardening

## Objective

Replace the remaining gap between canonical Postgres memory and native
OpenClaw file surfaces with real projection infrastructure, while also making
repo-wide landing tests honest on constrained hosts.

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
- operator-facing projection summary output alongside machine-readable audit
- daily operator-review integration for projection state
- host-cron scheduled projection refresh plus a hardened manual sync command

### Landing-gate hardening

- constrained full-repo safe mode for local low-memory hosts
- smaller full-repo unit batches
- serial top-level execution in constrained safe mode
- higher default worker heap budget in constrained safe mode
- planner output now makes the safe-mode decision visible

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

## What still waits until later

- project-local projection expansion beyond `MEMORY.md`
- broader specialized-agent coverage
- stronger agent-scoped DB memory semantics where metadata-first routing proves
  insufficient
- richer projection scheduling / orchestration beyond the current daily host
  cron plus manual sync path
- any schema changes, if later implementation proves they are truly required
