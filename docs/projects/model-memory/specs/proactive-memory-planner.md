---
summary: "Phase 2 design for a proactive planner that refreshes derived memory artifacts and surfaces candidate improvements."
title: "Proactive Memory Planner"
---

# Proactive Memory Planner

## Status

This is an approved Phase 2 direction document.

The planner concept is approved with one explicit constraint:

- review cannot live only in a hidden queue

Any meaningful candidate must surface inside ordinary OpenClaw operator flow.

2026-04-22 MMV2 alignment:

- the planner may refresh derived artifacts, queue reviews, and emit bounded
  operational signals; it may not silently write durable semantic truth
- planner proposals that would change memory state must re-enter MMV2 capture,
  admission, reconciliation, and structural correction rules
- planner signals must follow no-dark-data policy: no raw prompts, full
  transcripts, raw tool logs, secrets, or proof/eval output in durable memory
- stale projection, capsule, graph, and retrieval-cache repairs are derived
  maintenance only

Remaining implementation details:

- final kill switches and config names for planner automatic derived work

2026-04-22 Phase 2 decision lock:

- heartbeat becomes the primary lightweight proactive memory maintenance loop
- the planner may automatically perform reversible derived maintenance,
  including projection refresh, capsule refresh, cache warmup, dirty marking,
  and telemetry rollups
- the planner must proactively surface skill, tool, and workflow opportunities
  to the operator when evidence thresholds are met
- planner recommendations are deduped by stable candidate id and expire when
  stale
- manual operator review is not the normal path for low-risk derived
  maintenance; review is reserved for durable semantic truth changes,
  privileged actions, skill/tool promotion, policy changes, and high-risk
  privacy/security cases
- maintenance mechanics are owned by
  [Memory Maintenance Loop](/projects/model-memory/specs/memory-maintenance-loop)

## Objective

Add a bounded planner that makes the memory system proactive in a controlled
way.

The proactive planner should notice when the system ought to:

- refresh a project or subject capsule
- rebuild a projection
- warm a retrieval or capsule cache
- surface contradictions or stale knowledge
- propose a skill or tool candidate
- propose a workflow candidate
- queue operator-visible review items

It must not become an unsandboxed autonomous actor.

## Core rule

The proactive planner may propose or refresh derived artifacts.

It must not silently promote durable behavior changes.

## Why this exists

The current memory system is mainly reactive:

- user asks
- retrieval runs
- context is assembled
- memory writes land

Phase 2 should add limited proactive behavior so the system can prepare useful
artifacts and surface reviewable opportunities before the user needs them.

## Allowed automatic actions

The first-pass planner may automatically do only reversible, derived work.

Allowed automatic actions:

- mark capsules dirty
- rebuild capsules
- rebuild projections
- warm caches
- queue retrieval warmups
- produce operator-facing candidate review items
- produce planner audit records

These are derived-state maintenance actions, not policy changes.

Heartbeat-driven planner ticks may run these actions without manual review when
the action is reversible, derived-only, and does not mutate MMV2 durable truth.

## Review-gated actions

The planner may propose but must not auto-promote:

- new hard runtime rules
- new durable user or project policies
- skill promotion
- tool promotion
- workflow promotion into a standing automation
- third-party skill install
- prompt mutation
- new privileged automation lanes

## Surfacing contract

Review cannot live in a hidden queue only.

Any candidate improvement requiring review must surface inside the normal
OpenClaw operating workflow.

Required surfaces:

- relevant turn when the candidate materially overlaps the active work
- heartbeat if pending review exists
- daily operator reporting

Heartbeat is the first-class proactive surface. It should not be a passive
`HEARTBEAT_OK` loop when planner work exists. It should compactly surface:

- skill candidates
- tool candidates
- workflow candidates
- stale capsule or projection repairs
- repeated retrieval misses
- blocked privacy or injection findings
- dirty graph/capsule/projection state
- overnight ingest or maintenance opportunities

Optional later surfaces:

- dedicated operator-review artifact pack
- explicit review inbox or admin surface

## Three surfacing lanes

Planner outputs should use three surfacing lanes.

### `must_surface`

This always appears in:

- heartbeat
- daily operator review

and may also appear in-turn if contextually relevant.

Examples:

- pending skill or tool candidate awaiting approval
- repeated contradiction on an active project
- stale capsule on a heavily used project
- candidate blocked by missing approval
- repeated retrieval failure on a high-use target

### `context_surface`

This appears in-turn only when the current session overlaps the candidate
strongly enough.

Examples:

- current turn is about the same project
- current turn is about the same tool, skill, or workflow lane
- current run touched the same docs or artifacts
- current agent role overlaps the candidate scope

### `background_only`

This stays out of the turn but can still appear in heartbeat or daily summaries
if it remains pending.

## Relevance and urgency

The planner should compute relevance and urgency separately.

### Relevance inputs

- current project id
- current subject cluster
- current workflow or tool lane
- current agent role
- recent touched artifacts

### Urgency inputs

- severity or risk
- recurrence count
- age since first detection
- whether it blocks an active lane
- whether the operator explicitly asked for the capability

### Default routing

- high urgency -> `must_surface`
- moderate urgency plus high overlap -> `context_surface`
- everything else -> `background_only`

The purpose of this split is to avoid the failure mode where an over-strict
relevance filter causes nothing important to surface.

## Trigger types

Suggested planner triggers:

- after document-ingest batches
- after prompt-turn ingestion batches
- after daily summary ingestion
- after projection rebuilds
- on heartbeat cadence
- on daily operator-review cadence
- when repeated retrieval misses or low-quality retrieval events occur
- when duplicate contradictions or unresolved supports cluster on one target

## Candidate classes

Suggested candidate classes:

- `capsule_refresh`
- `projection_refresh`
- `cache_refresh`
- `retrieval_warmup`
- `contradiction_review`
- `skill_candidate`
- `tool_candidate`
- `workflow_candidate`
- `policy_candidate`
- `source_authority_review`
- `soft_source_consolidation`

These are planner artifacts, not canonical memories.

## Planner inputs

The planner should consume:

- canonical memory objects
- graph runtime state
- capsules
- retrieval traces
- cache and usage ledger
- projection versions
- duplicate and contradiction signals
- operator artifacts
- runtime inventories

## Planner outputs

The planner should emit bounded structured outputs with:

- candidate id
- candidate type
- affected target and scope
- rationale codes
- supporting evidence references
- urgency
- relevance descriptors
- recommended action
- review requirement
- surfacing lane
- target surfacing channels

The planner must not emit freeform hidden instructions that later stages treat
as authority.

## Relationship to ingestion

The planner does not replace ingestion.

It operates after ingestion and after derived rebuild signals.

The planner is a control layer for maintenance and improvement opportunities,
not a second semantic write path.

## Relationship to skill and tool synthesis

The planner should be the orchestrator that notices repeated success patterns
and surfaces them as candidate skill or tool synthesis opportunities.

It should not directly compile and install those skills by itself.

Skill, tool, and workflow opportunities should be surfaced proactively rather
than waiting for the operator to ask for them. The default channel is heartbeat
for persistent candidates, with turn-level surfacing when the candidate is
directly relevant to the current work.

## Privacy, trust, and prompt injection

Phase 2 should let the planner observe:

- visibility
- trust tier
- sensitivity
- egress policy

But first-pass planner behavior should treat these as cautionary signals, not
yet as strong routing authority except where the source is explicitly marked as
disallowed for model use.

The planner must never allow untrusted external text to directly become a
privileged action recommendation.

Untrusted inputs may influence planner candidates only after:

- structured extraction
- provenance binding
- trust classification
- bounded planner reasoning

Even then, the result is a reviewable candidate, not an automatic promotion.

## Non-goals

This spec does not authorize:

- autonomous system prompt rewriting
- autonomous installation of third-party skills
- autonomous enablement of tools or privileged automations
- planner-owned canonical writes
- invisible review queues

## Rollout

1. emit planner records only
2. surface pending review through heartbeat and operator review
3. make heartbeat a real planner tick with bounded derived maintenance and
   candidate surfacing
4. add in-turn `context_surface` behavior
5. enable reversible auto-refresh actions
6. add candidate classes one by one
7. only later consider stronger automation after proof and operator feedback
8. use the maintenance loop for event, heartbeat, and daily cadence

## Related specs

- [Planner Review Artifacts And Surfacing](/projects/model-memory/specs/planner-review-artifacts-and-surfacing)
- [Skill And Tool Synthesis](/projects/model-memory/specs/skill-and-tool-synthesis)
- [Cache And Projection Policy](/projects/model-memory/specs/cache-and-projection-policy)
