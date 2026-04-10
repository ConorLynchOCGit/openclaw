# Current Slice

## Active slice

Memory soak period and evidence collection

## Objective

Hold new scheduled memory feature expansion for the next few days while
collecting enough operational evidence to decide what the next memory tranche
should actually be.

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

## What the soak period is for

- verify whether the currently landed capture, retrieval, projection, and
  operator surfaces are behaving well under real usage
- record enough evidence to judge which future memory features are actually
  worth building next
- avoid pretending the remaining roadmap items are already scheduled next
  phases before soak evidence exists

## What evidence should be collected during soak

- long-prompt capture counts:
  - candidate-plan counts
  - `default` vs `bulk` posture usage
  - immediate acceptance counts
  - deferred overflow counts
  - per-family immediate distribution
- repeated-prompt follow-through:
  - deferred overflow promotions
  - duplicate suppression behavior
  - observed starvation cases, if any
- retrieval/application outcomes:
  - when the right memory was used
  - when a useful memory was missed
  - when the wrong memory shape dominated
- operator burden:
  - false-positive candidates
  - low-value captures
  - missing observability or confusing logs
- performance:
  - capture-heavy prompt cost
  - any obvious DB/query or memory-tool hot spots

## What tracking exists today

Directly instrumented today:

- durable soak lifecycle telemetry now writes bounded JSONL event history under
  `.local/memory-soak/events/YYYY-MM-DD.jsonl`
- durable soak summary artifacts now write:
  - `.local/memory-soak/latest-summary.json`
  - `.local/memory-soak/latest-summary.md`
  - `.local/memory-soak/history/summary-<timestamp>.json`
  - `.local/memory-soak/history/summary-<timestamp>.md`
- ordinary-turn soak events now capture:
  - candidate-plan counts
  - `default` vs `bulk` posture
  - accepted capture counts
  - deferred overflow counts
  - duplicate suppression and missing-attribution suppression
  - corpus-ingestion demand signals from long prompt shape
- retrieval/application soak events now capture:
  - hybrid retrieval result counts
  - approved vs candidate vs validated distribution
  - family and scope distribution
  - specificity override and wrong-shape dominance proxies
  - filtered-by-scope and suppressed-conflict counts from learned guidance
- review/promotion soak events now capture:
  - candidate review outcomes
  - deferred-overflow promotions
  - memory vs procedure promotion paths
- projection runs already report:
  - selected vs omitted items
  - unmatched project mappings
  - drift / generated-zone repair visibility
  - destination char-budget usage
- projection/orchestration soak events now capture:
  - native sync run posture and scopes
  - projection changed/omitted/skipped/unmatched counts
  - session-memory density and compaction-pressure demand signals
- operator-facing soak inspection now exists through:
  - `pnpm memory:soak:report`
  - `pnpm memory:native:sync --format summary`
  - the concise daily-brief line emitted from the soak summary

## What is still partial or proxy-based

Still not fully automatic or not fully certain:

- final answer use for generic hybrid retrieval remains proxy-only unless the
  application seam is explicit
- “missed useful memory” is still measured through truthful proxies such as
  no-guidance-despite-retrieval and stronger-scope-below-top retrievals
- alias/entity/relation problems are measured as demand signals, not through a
  separate graph layer
- corpus-ingestion demand is measured from prompt/session/compaction signals,
  not from an actual bulk-ingestion pipeline

So the soak period now has durable end-to-end evidence for the main deeper
questions around capture, retrieval, application, scope, review burden, and
future corpus-ingestion demand, while still keeping a few higher-judgment
questions explicitly proxy-based.

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
- remaining future memory work is now intentionally unscheduled until the soak
  evidence says what is worth doing next

## What still waits until later

- all remaining future memory work now lives in the unscheduled potential
  actions block in `docs/memory-system/memory-roadmap.md`
- nothing in that block should be treated as a scheduled next phase until the
  soak period is complete
- after soak, and after any soak-found defects are fixed, the first candidate
  to schedule should be a separate corpus-ingestion-and-compilation capability
  for larger sources such as papers, repos, or research packs
- that corpus-ingestion capability is not an extension of the current bounded
  one-sentence conversational memory path
- fuller agent-scoped memory should be revisited during the upcoming
  multiagent architecture, delegation, and workflow tranche rather than
  scheduled ahead of it
