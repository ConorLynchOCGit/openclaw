---
summary: "Phase 2 design for turning the usage/cache ledger into bounded cache and projection policy."
title: "Cache And Projection Policy"
---

# Cache And Projection Policy

## Status

This is a Phase 2 design document.

It is approved as direction, but it remains downstream of the first graph and
capsule work.

2026-04-22 MMV2 alignment:

- cache/projection policy operates over derived projection versions,
  materialized artifacts, retrieval packs, context artifacts, graph/capsule
  artifacts, and usage telemetry
- policy may mark derived artifacts stale, schedule rebuilds, and adjust
  read-time priority; it may not mutate canonical MMV2 durable truth
- projection digests are retrieval-eligible only when backed by active MMV2
  source memory ids with fresh content hashes and no disqualifying conflict or
  stale markers
- root `USER.md` and `MEMORY.md` remain human-owned inputs, not generated
  projection targets

Open decisions before implementation:

- freshness TTLs for project/page/procedure/source/entity projection families
- cache invalidation fan-out from memory events and edges
- operator visibility for stale-but-injected or excluded projection digests

## Objective

Turn the existing usage and cache ledger into a bounded policy layer that
improves:

- latency and prompt-cache stability
- retrieval and context quality
- operator cost control

without allowing the cache layer to become semantic authority.

## Core rule

Cache and projection policy is operational only.

It must not redefine memory truth.

## Why this exists

The current system already records:

- stable, semi-stable, and volatile segment hashes
- usage counters
- cache counters

That is enough observability to move from passive measurement to bounded policy.

Phase 2 should use that information to decide:

- which capsules are worth precompiling
- which retrieval packs are worth warming
- which projections are causing churn
- which segments repeatedly break prompt-cache stability

The packet compiler is now a first-class input to this policy layer.

Policy should observe:

- which packet classes repeatedly overflow
- which packet sections churn most
- which packet shaping rules preserve stable-prefix reuse best
- which packet families degrade quality when budgets are too tight

## Priority goals

Phase 2 should optimize for all three goals:

- latency
- retrieval and context quality
- operator cost control

No one goal should silently dominate the others without operator visibility.

## Policy inputs

The policy layer should consume:

- usage and cache ledger
- projection versions
- capsule hit frequency
- retrieval traces
- graph neighborhood access patterns
- document-ingest and planner signals
- operator review cadence and artifact usage

## Policy outputs

Suggested policy outputs:

- projection rebuild priority
- capsule precompile priority
- retrieval warmup priority
- stable-prefix protection hints
- segment trim priority suggestions
- cache invalidation scopes
- operator-visible cost hot spots
- packet budget tuning candidates
- packet section-cap tuning candidates
- packet family escalation candidates for stronger compile modes

## Stable-prefix preservation

The system should explicitly optimize for stable-prefix reuse.

Policy should prefer:

- stable bootstrap projections
- semi-stable capsule packs
- bounded retrieval packs
- minimal churn in high-reuse segments

The policy should identify when specific segments are causing avoidable cache
misses and route that to:

- projection redesign
- capsule redesign
- planner refresh timing
- trim-order tuning

## Capsule caching

Capsules are a natural cache unit.

Policy should decide:

- which projects or subjects deserve eagerly refreshed capsules
- which deserve only on-demand build
- how long a capsule remains reusable before refresh
- when a changed graph neighborhood actually requires rebuild

## Retrieval warmups

The policy layer may schedule retrieval warmups for:

- frequently queried targets
- operator review lanes
- heartbeat surfaces
- commonly reused reference targets

Warmups should remain bounded and cancelable.

## Projection policy

The policy layer should help decide:

- which projections are core stable prefix
- which projections belong in semi-stable packs
- which projections should remain volatile
- which projections are too expensive or too noisy to keep rebuilding

That includes deciding when:

- a deterministic packet renderer is sufficient
- a model-assisted packet renderer is justified
- packet section caps need adjustment
- packet family-specific shaping policies need review

This should feed directly into context-engine layering.

## Cost and latency posture

If tradeoffs are needed, the policy layer should make them inspectable rather
than implicit.

Examples:

- a capsule may save tokens but cost more build time
- a retrieval warmup may reduce latency but increase background spend
- a broader stable pack may improve quality but reduce cache reuse

Those tradeoffs should show up in policy and operator reporting.

## Privacy and trust rollout

The policy layer should record privacy and trust metadata in the first pass, but
enforcement should stay phased.

First-pass uses:

- auditability
- operator reporting
- future policy hooks
- limited pack-selection hints

Second-pass uses may include:

- redaction before model use
- exclusion from shared caches
- stricter egress limits
- projection suppression for restricted artifacts

This phased rollout is deliberate so unstable metadata does not distort the base
system before we validate it.

## Interaction with hierarchical retrieval

Hierarchical retrieval will need policy support.

The policy layer should help answer:

- when to use capsule-first retrieval
- when atomic retrieval is enough
- when multi-pass retrieval is worth the cost
- how many subqueries should be allowed for a given workload

## Operator surfaces

Policy should surface operator-facing signals such as:

- most volatile projections
- highest-churn segments
- best cache wins
- most expensive repeated retrievals
- high-value capsule candidates

These should be suitable for heartbeat and daily operator review consumption.

## Dependencies

This policy layer is downstream of:

- graph runtime
- capsules
- planner signals
- usage and cache ledger

It should not be treated as the first Phase 2 implementation slice.

## Non-goals

This spec does not authorize:

- cache entries as semantic truth
- hidden automatic prompt restructuring without auditability
- cost optimization that silently degrades correctness
- privacy metadata becoming hard authority before a second-pass enforcement
  review

## Rollout

1. keep the ledger observational but add policy reports
2. enable capsule and projection prioritization
3. enable bounded warmups
4. tune stable-prefix protection based on evidence
5. only later activate stronger privacy-aware cache enforcement
