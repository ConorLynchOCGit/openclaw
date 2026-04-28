---
summary: "Phase 2 event, heartbeat, and daily maintenance loop for derived memory health and reviewable candidates."
title: "Memory Maintenance Loop"
---

# Memory Maintenance Loop

## Status

Status: `phase_2_decision_locked`.

This spec defines the Phase 2 maintenance loop. It is operator-facing
maintenance, not autonomous semantic self-improvement.

## Objective

Keep derived memory artifacts fresh, make soft-source consolidation useful, and
surface actionable memory-health candidates without silently mutating MMV2
durable truth.

The user-facing concept is "Memory Maintenance Loop." Dream-style narrative
reports may exist later, but the implementation contract is maintenance.

## Cadence

Phase 2 v1 maintenance runs through three triggers:

- after ingest or capture batches
- heartbeat summaries
- daily sweep

Event-triggered work should update dirty markers, refresh lightweight derived
state when safe, and create review candidates. Heartbeat should surface
actionable deltas. The daily sweep should consolidate stale or repeated
findings.

The loop also serves as a bounded ambient proactivity generator:

- refresh growth-loop state
- refresh outcome follow-ups
- refresh reverse-prompt candidates
- refresh delight/surprise candidates
- refresh self-healing diagnostics and repair packets
- refresh bounded compaction-recovery / working-state artifacts

## Allowed Automatic Actions

The loop may automatically perform reversible derived work:

- mark graph, capsule, projection, or cache targets dirty
- rebuild projections and capsules
- queue retrieval warmups
- warm cache entries under budget
- roll up retrieval, authority, and source-health telemetry
- create soft-source consolidation candidates
- create bounded review artifacts
- rotate or prune runtime-state artifacts under retention policy

These actions do not mutate canonical MMV2 semantic truth.

Bounded autonomous internal maintenance work may run in isolated/background
paths when it only produces internal artifacts for planning, investigation,
follow-up, repair, or continuity.

## Review-Gated Actions

The loop may propose but must not auto-promote:

- durable user or project policies
- hard runtime rules
- prompt mutation
- skill or tool promotion
- third-party skill installation
- standing workflow automation
- privileged automation lanes
- semantic memory deletion, supersession, or repair

## Outputs

Normal outputs are bounded and auditable:

- maintenance reports
- review candidates
- derived refresh records
- soft-source consolidation artifacts
- privacy or prompt-injection safety summaries
- source-profile and authority-health summaries

Reports must use safe ids, hashes, counts, reason codes, artifact paths, and
source refs. They must not include raw prompts, full transcripts, raw tool logs,
secrets, private phrases, or hostile imperative text.

## Candidate Lifecycle

Review candidates use:

- stable id
- candidate type
- status
- source refs
- urgency
- surfacing lane
- expiry
- pinned flag

Default lifecycle:

- active for `30` days
- archived for `90` days after active expiry
- renewed by recurrence or explicit pinning
- pinned review items do not expire while pinned

## Surfacing

The loop surfaces actionable deltas, not every event.

Required surfaces:

- bounded activity-feed summaries
- heartbeat summaries
- daily operator review summaries
- links to artifacts or review records

Turn-level surfacing is reserved for highly relevant, compact, actionable
one-liners.

## Safety Boundaries

- Canonical semantic truth remains MMV2 durable memories, events, edges, ingest
  sources, and ingest segments.
- Maintenance output is runtime state or artifact state.
- No hidden review queue may be the only review path.
- Lack of review never promotes risky or low-authority items.

## Live Usefulness Gate

Maintenance-loop output is useful only when it creates bounded review work from
real runtime evidence. Heartbeat and daily review must not treat static
bundled/default planner candidates as primary actionable items. Static fallback
items may appear in diagnostics only.

When maintenance produces a proactive opportunity, it must preserve source refs,
source profile ids, authority tiers, content/proof hashes, freshness/conflict
state, and no-dark-data status. The opportunity must name a specific problem,
why it matters now, the smallest safe next step, and expected user value.

The same standard applies to future Skills, tool, and workflow candidates before
any rollout scaffolding, default promotion, or automation controls are added.

The maintenance loop is also a valid generator/follow-up seam for the
generator-first proactivity reset:

- it may contribute bounded evidence for autonomous internal drafts attached to
  top heartbeat opportunities
- it may reopen unfinished or stale opportunities when explicit bounded
  follow-up conditions are met
- it may help retire obsolete opportunities when later maintenance/docs state
  proves the original opportunity was resolved or superseded
- it may maintain persistent growth-loop state and compaction-recovery state so
  proactivity survives refresh/restart and context loss better
- it may emit self-healing candidates when repeated proactivity/runtime
  failures recur

It still must not execute actions, edit files, send outbound messages, or
persist raw prompts, full transcripts, raw tool logs, secrets, or private
phrases.

The same no-dark-data rule applies to persisted proactivity activity records
derived from authoritative transcript/session capture: only bounded summaries,
deterministic ids, source refs, timestamps, and provenance metadata may be
stored for ambient proactivity reuse.

## Related Specs

- [Memory Ops Closed Loop](/projects/model-memory/specs/memory-ops-closed-loop)
- [Proactive Memory Planner](/projects/model-memory/specs/proactive-memory-planner)
- [Planner Review Artifacts And Surfacing](/projects/model-memory/specs/planner-review-artifacts-and-surfacing)
- [Soft-Source Ingestion And Authority](/projects/model-memory/specs/soft-source-ingestion-and-authority)
