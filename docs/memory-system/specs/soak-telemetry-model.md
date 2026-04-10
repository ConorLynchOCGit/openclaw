# Soak Telemetry Model

## Purpose

This spec defines the durable telemetry model for the memory-system soak
period.

The goal is to make post-soak decisions evidence-based without introducing a
second memory substrate or a disconnected observability architecture.

Telemetry attaches only to real memory lifecycle points that already exist:

- capture
- deferred overflow
- retrieval
- application
- review
- projection
- orchestration

## Storage posture

Telemetry is not canonical memory.

It is stored as repo-local soak artifacts under `.local/memory-soak/`:

- `events/YYYY-MM-DD.jsonl`
- `latest-summary.json`
- `latest-summary.md`
- `history/summary-<timestamp>.json`
- `history/summary-<timestamp>.md`

The event stream is append-only and bounded by per-event payload limits.
Summaries are compiler-style derived artifacts built from the event stream.

## Event model

Each event records:

- `schemaVersion`
- `recordedAt`
- `category`
- `action`
- `source`
- event-specific payload

Closed event categories:

- `capture`
- `retrieval`
- `application`
- `review`
- `projection`
- `orchestration`

## Event inventory

### Capture

Owned by:

- `ordinary-turn-auto-capture.ts`
- `candidate-ingress.ts`

Actions:

- `turn_summary`
- `candidate_submission`
- `candidate_duplicate_suppressed`
- `candidate_submission_rejected`
- `candidate_submission_failed`

Key fields:

- family
- scope
- capture class
- posture
- submission mode (`immediate` or `deferred_overflow`)
- candidate-pool rank and size when available
- duplicate suppression reason when applicable
- long-prompt / source-heavy / brief-request demand-signal flags when present

### Retrieval

Owned by:

- `memory-object-search-hybrid.ts`

Actions:

- `hybrid_search`

Key fields:

- requested scope/kind/project
- returned record count
- approved/candidate/validated distribution
- family distribution
- scope distribution
- bounded top-record summary
- same-subject collision counts
- contradiction / temporal ambiguity proxy counts
- specificity-overridden-by-ranking proxy flags

### Application

Owned by:

- `memory-learned-guidance-plan.ts`

Actions:

- `learned_guidance_plan`

Key fields:

- planner outcome
- suggestion count
- suppressed conflict count
- filtered-out-by-scope count
- selected suggestion scope/family/state distribution
- wrong-shape-dominance proxy counts

### Review

Owned by:

- `candidate-review.ts`
- `candidate-promotion.ts`

Actions:

- `candidate_review`
- `candidate_promotion`

Key fields:

- candidate family/scope when enrichable
- review outcome
- memory-state change
- promotion target
- deferred-overflow lineage flag when recoverable

### Projection

Owned by:

- `memory-native-sync.ts`

Actions:

- `native_sync_projection`

Key fields:

- changed target count
- selected/omitted/skipped/unmatched counts
- recovered partial-block count
- scope selection
- write vs dry-run posture

### Orchestration

Owned by:

- `memory-native-sync.ts`

Actions:

- `native_sync_run`

Key fields:

- invocation mode
- scope selection
- write vs dry-run posture
- daily date target
- whether soak summary artifacts were refreshed

## Summary/report model

The durable report must provide:

- machine-readable aggregate totals
- human-readable operator summary
- concise daily-brief excerpt

The report aggregates:

- capture volume and deferred-overflow follow-through
- retrieval family/scope/state distributions
- application outcomes and conflict suppression
- review burden and promotion outcomes
- projection/orchestration activity
- relation/alias/contradiction demand signals
- corpus-ingestion / compiled-knowledge demand signals
- explicit attention flags
- explicit known blind spots

## Definitions

### What counts as retrieved

A memory is counted as retrieved when a retrieval surface actually returns it in
the result set of a live memory tool or planner call.

Examples:

- a record returned by `memory_object_search_hybrid`
- a workflow-guidance record returned into learned-guidance planning

Not counted:

- memories that merely exist in storage
- memories inferred by later analysis but never returned by a retrieval surface

### What counts as applied

A memory is counted as applied only when a memory-aware application surface
selects it for output or planning.

Current direct application surface:

- learned-guidance planning suggestions

Current proxy-only area:

- generic hybrid search results returned to the model

For generic search, the system can currently say “retrieved and surfaced to the
model,” not definitively “used in the final answer.”

### What counts as missed useful memory

This cannot be measured definitively yet.

Current truthful proxies are:

- retrieval returned zero useful records for a targeted memory-aware ask
- retrieval returned records but application yielded zero eligible suggestions
- scope filtering suppressed otherwise relevant records
- operator-observed cases recorded outside the automatic event stream

### What counts as wrong memory shape dominated

A proxy event where:

- retrieved records were dominated by a family different from the requested or
  planner-implied family, or
- learned-guidance planning retrieved records but produced no eligible
  suggestions because the retrieved shape was not usable, or
- broader-scope records outranked more specific records for the same subject

### What counts as scope conflict

A scope conflict is recorded when the same subject cluster appears across
multiple scopes in one retrieval/application event and those records carry
competing guidance or different factual payloads.

### What counts as review burden

Review burden is the sum of:

- candidate creation volume
- deferred-overflow candidate volume
- candidate-review volume and outcomes
- duplicate-suppression churn
- promotion follow-through volume

The system should distinguish useful review work from noisy churn.

## Blind spots

The telemetry model still cannot fully determine:

- whether the model truly used a generic search result in its final answer
- whether a memory existed but was semantically “the right one” if no retrieval
  call was made
- whether a relation/alias issue is definitely an ontology problem rather than
  just a retrieval-query problem
- whether compaction-time source-dense summaries justify corpus ingestion
  without using bounded demand-signal proxies

Those blind spots must remain explicit in operator summaries and docs.
