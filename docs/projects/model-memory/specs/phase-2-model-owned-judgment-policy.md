---
summary: "Standing Phase 2 policy for model-owned semantic judgment and deterministic structural guardrails."
title: "Phase 2 Model-Owned Judgment Policy"
---

# Phase 2 Model-Owned Judgment Policy

## Objective

Make the pre-Milestone-4 deterministic-judgment cleanup a standing Phase 2
architecture rule, not a one-time debt pass.

Every remaining Phase 2 bucket must preserve the same boundary:

- deterministic code owns structure, safety, provenance, limits, and transport
- models or operators own meaning, usefulness, semantic relevance, skill shape,
  proactivity value, and final inclusion decisions

## Allowed deterministic ownership

Deterministic code may own:

- ids, hashes, refs, explicit keys, source windows, and provenance
- schemas, caps, redaction, safety, no-dark-data, and blocked states
- source authority, persistence boundaries, lifecycle status, and cooldowns
- exact duplicate detection and explicit-key dedupe
- structural packet/window assembly by source, recency, session, scope, class,
  file, document, source ref, or bounded window
- deterministic retrieval recall by lexical search, vector/embedding recall,
  graph/projection cues, recency, source lineage, explicit refs, scopes, and
  classes
- structural pack/capsule/projection assembly from already-adjudicated inputs
- post-model validation of schema, ids, refs, evidence quote anchoring, caps,
  safety, provenance, and allowed output classes
- operational failure taxonomy and route isolation

## Model-owned or operator-owned judgment

The following must not be decided by deterministic code:

- memory-worthiness
- semantic admission as durable truth
- correction, supersession, or collision truth beyond exact explicit refs
- semantic duplicate or same-entity identity
- topic, subject, workflow, or pattern membership
- semantic graph edges or semantic graph node merging
- candidate quality or usefulness
- skill/proactivity classification
- skill-vs-plan-vs-existing-enhancement choice
- surfacing value and priority
- visible title, purpose, next-step, or decision copy
- final context-pack, capsule, or context-injection inclusion
- whether a workflow is reusable enough to become a skill
- whether usage feedback proves a skill should be refined, promoted, retired,
  or merged

When a model step is unavailable, invalid, ungrounded, or unsafe after bounded
repair, the result is pending review, quarantine, blocked, demoted, or absent.
The replacement must not be a deterministic semantic fallback.

## Bucket application

### MMV2 capture and ingestion

Capture routing, extraction, admission, reconciliation, correction, and
collision adjudication are semantic model-owned steps. Deterministic ingestion
may segment documents, long prompts, daily notes, OpenClaw turns, and Codex
sessions into contiguous bounded windows, but it must not choose "interesting"
chunks or reject schema/code-like text before model review.

### Graph

The structural runtime graph may be deterministic for source lineage,
artifact refs, memory ids, document refs, project refs, lifecycle state, and
explicit relationships. Topic/entity/subject/workflow/pattern nodes and
semantic edges require model or operator adjudication. Retrieval may use
validated graph nodes and edges as recall signals, but final context inclusion
remains model-owned.

### Capsules and projections

Capsule/projection materialization may be deterministic only when it compiles
from already-adjudicated memories, graph edges, refs, and lifecycle state.
Choosing which semantic material belongs in a capsule, resolving conflicts, or
writing visible synthesis copy is model-owned or operator-owned.

### Retrieval and context

Hybrid deterministic recall is intentionally preserved. Lexical/vector/graph
recall can gather candidates, but final semantic inclusion into context packs,
capsules, and context injection is model-owned. If the inclusion model is
unavailable, context injection must be blocked, pending, or explicitly marked
uncertain rather than falling back to deterministic rank/score inclusion.

### Planner, proactivity, and cards

Planner and proactivity code may keep structural lifecycle, cadence, cooldown,
source, budget, and no-dark-data controls. Model review decides candidate
value, proactive-plan classification, skill opportunity classification, merge
or demotion, and visible copy. Card title, purpose, next step, and primary
decision framing must be model-authored or operator-authored.

### Skills and tool synthesis

Skill and tool synthesis may use structural triggers such as session boundary,
heartbeat, explicit operator request, validation failure, repeated exact refs,
or usage-count cadence to call a reviewer. The reviewer model decides whether
the evidence represents a reusable skill, existing-skill enhancement, proactive
plan, tool candidate, merge, demotion, or no candidate.

## Validation requirements

Each remaining Phase 2 bucket must carry tests or proof artifacts that show:

- the model-owned step is invoked when semantic judgment is needed
- deterministic code validates only structure, refs, safety, provenance, and
  caps after model output
- invalid or unavailable model output blocks, demotes, quarantines, or leaves
  pending
- deterministic fallback cannot create a semantic decision
- packet construction preserves contiguous source context and does not prune
  for interestingness or usefulness
- proof artifacts separate source packet, model output, post-model validation,
  and final write/surface/inclusion result

## No-cheat rule

Renaming judgment fields, moving heuristics into helpers, preserving behavior
behind compatibility flags, or reclassifying live semantic behavior as
plumbing does not satisfy this policy. If a deterministic path decides
meaning, value, semantic relevance, skill shape, or visible copy, it must be
removed, changed to model/operator review, or blocked pending review.
