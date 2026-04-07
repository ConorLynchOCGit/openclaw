# Memory Spec Pack

## Purpose

This directory is the implementation-ready spec pack for the current memory
roadmap.

The current roadmap state is:

1. the six landed families are at practical parity
2. practical parity is enough to move forward
3. practical parity is not enough to justify broad family expansion
4. the next major phase is substrate flattening

Use this pack to execute flattening first, then resume later phases on top of
the flattened substrate.

## Read order for a fresh session

1. `/memory-system/memory-roadmap`
2. `/memory-system/STATUS`
3. `/memory-system/CURRENT_SLICE`
4. `/memory-system/feature-inventory`
5. `/memory-system/FAMILY_SUBSTRATE_FLATTENING_ANALYSIS`
6. `/memory-system/FLATTENING_EXECUTION_PLAN`
7. `/memory-system/specs/implementation-sequencing`
8. the specific flattening or family spec you are about to implement

## Spec index

### Flattening core specs

- `/memory-system/specs/family-definition-registry`
- `/memory-system/specs/unified-ingestion-resolver`
- `/memory-system/specs/unified-clustered-lifecycle`
- `/memory-system/specs/unified-correction-and-supersede`
- `/memory-system/specs/unified-phrase-pattern-engine`
- `/memory-system/specs/retrieval-feature-framework`
- `/memory-system/specs/behavior-profile-layer`
- `/memory-system/specs/registry-driven-proof-inspection`

### Cross-cutting architecture and sequencing

- `/memory-system/specs/architecture-fit-review`
- `/memory-system/specs/behavior-application`
- `/memory-system/specs/phrase-induction`
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

- do not add new families on top of the current branch-heavy substrate
- do not treat flattening as permission to erase real family-policy
  differences
- do not let future family work re-implement local capture, lifecycle,
  retrieval, application, or proof stacks when a flattening spec covers the
  seam already
- use `/memory-system/specs/cross-domain-memory-families` only after the
  flattening phase, reduced-profile self-improving capture, and learned
  advisory planning are stronger
- if two specs overlap, the flattening core specs control the shared
  substrate and the family specs control product-policy differences

## Current non-goals

This spec pack does not authorize:

- reduced-profile self-improving capture enablement in the current slice
- learned-guidance advisory planning in the current slice
- new cross-domain families in the current slice
- broad autonomous memory behavior
- automatic installation, procurement, or approval
- global semantic routing
