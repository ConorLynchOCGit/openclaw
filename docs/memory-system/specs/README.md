# Memory Spec Pack

## Purpose

This directory is the implementation-ready spec pack for the current memory
roadmap.

The current roadmap state is:

1. the six landed families are at practical parity
2. flattening batches v1-v3 delivered real substrate progress
3. the substrate is still not flat enough for reduced-profile self-improving
   capture or new families
4. multi-memory per-turn capture is now landed on the current substrate
5. the next major work is mandatory rigid-surface replacement plus
   canonicalization around 4 durable memory kinds
6. the canonical-core tranche of that canonicalization work is now landed in
   code, and the generic ingestion/retrieval contracts are now landed too, but
   planner/runtime cutover and family-heavy retirement are not

## Read order for a fresh session

1. `/memory-system/memory-roadmap`
2. `/memory-system/STATUS`
3. `/memory-system/CURRENT_SLICE`
4. `/memory-system/POST_V3_ARCHITECTURE_REVIEW`
5. `/memory-system/NEXT_SUBSTRATE_PUSH_PLAN`
6. `/memory-system/feature-inventory`
7. `/memory-system/FLATTENING_EXECUTION_PLAN`
8. `/memory-system/specs/implementation-sequencing`
9. `/memory-system/archive/specs/canonical-four-kind-memory-migration`
10. the specific substrate or family spec you are about to implement

## Spec index

### Landed-or-partially-landed flattening specs

- `/memory-system/specs/family-definition-registry`
- `/memory-system/specs/unified-ingestion-resolver`
- `/memory-system/specs/unified-clustered-lifecycle`
- `/memory-system/specs/unified-correction-and-supersede`
- `/memory-system/specs/unified-phrase-pattern-engine`
- `/memory-system/specs/retrieval-feature-framework`
- `/memory-system/specs/behavior-profile-layer`
- `/memory-system/specs/registry-driven-proof-inspection`

These remain important, but several now describe partial bridges rather than
“done enough” substrate.

### New post-v3 substrate specs

- `/memory-system/specs/full-ingestion-control-plane`
- `/memory-system/specs/application-selection-layer`
- `/memory-system/specs/retrieval-and-routing-control-plane`
- `/memory-system/specs/recurring-procedure-staged-substrate`
- `/memory-system/specs/correction-policy-cleanup`
- `/memory-system/specs/proof-runner-adapterization`
- `/memory-system/specs/registry-authority-cleanup`
- `/memory-system/specs/memory-family-contract-boundary`
- `/memory-system/specs/memory-testability-hardening`
- `/memory-system/specs/retrieval-sql-scaffolding-reduction`
- `/memory-system/specs/stringly-control-flow-cleanup`

### Cross-cutting architecture and sequencing

- `/memory-system/specs/architecture-fit-review`
- `/memory-system/specs/behavior-application`
- `/memory-system/archive/specs/canonical-four-kind-memory-migration`
- `/memory-system/specs/native-openclaw-memory-integration`
- `/memory-system/specs/source-of-truth-and-precedence`
- `/memory-system/specs/memory-projection-destinations`
- `/memory-system/specs/projection-compiler-and-file-ownership`
- `/memory-system/specs/per-agent-and-per-project-memory-integration`
- `/memory-system/specs/native-memory-governance-and-rollout`
- `/memory-system/specs/semantic-retrieval-routing`
- `/memory-system/specs/implementation-sequencing`
- `/memory-system/specs/cross-domain-memory-families`

### Existing family specs

- `/memory-system/specs/response-style-profile`
- `/memory-system/specs/project-memory-expansion`
- `/memory-system/specs/recurring-procedure-memory`
- `/memory-system/specs/generalized-lesson-learning`
- `/memory-system/specs/generalized-lesson-auto-review`
- `/memory-system/specs/generalized-lesson-retrieval-and-application`
- `/memory-system/specs/project-rule-learning`
- `/memory-system/specs/unmet-need-planning`

### Later phases, not current execution targets

- `/memory-system/specs/self-improving-capture-integration`
- `/memory-system/specs/learned-guidance-advisory-planning`

## Rules for using this spec pack

- do not add new families on top of the still-partial substrate
- do not treat multi-memory capture as proof that the family-heavy shape is now
  acceptable long-term
- do not treat the canonical-core tranche as proof that generic ingestion,
  retrieval, or planner migration is already done
- do not treat a shared helper as proof that the duplicated system is gone
- do not treat prompt text as the lasting source of application policy
- do not let semantic routing remain a hidden sidecar if the slice claims to
  flatten retrieval/routing
- do not let future family work re-implement local capture, retrieval,
  application, or proof stacks when a shared spec covers the seam already
- use `/memory-system/specs/cross-domain-memory-families` only after the
  stronger substrate work, reduced-profile self-improving capture, and learned
  advisory planning are ready

## Current non-goals

This spec pack still does not authorize:

- reduced-profile self-improving capture enablement in the current slice
- learned-guidance advisory planning in the current slice
- new cross-domain families in the current slice
- broad autonomous memory behavior
- automatic installation, procurement, or approval
- global semantic routing

## Native OpenClaw file integration specs

Use this cluster when the slice is about integrating the canonical DB memory
substrate with native OpenClaw file surfaces rather than changing the
underlying middleware ontology itself.

- `/memory-system/specs/native-openclaw-memory-integration`
- `/memory-system/specs/source-of-truth-and-precedence`
- `/memory-system/specs/memory-projection-destinations`
- `/memory-system/specs/projection-compiler-and-file-ownership`
- `/memory-system/specs/per-agent-and-per-project-memory-integration`
- `/memory-system/specs/native-memory-governance-and-rollout`

These specs intentionally stay documentation-first until an implementation pass
is explicitly authorized.
