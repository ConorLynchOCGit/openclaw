# Post-v3 Architecture Review

## Executive verdict

The current substrate is not flat enough to move on after one more narrow
slice.

Flattening batches v1-v3 delivered real shared substrate improvements, but the
current roadmap pack was still too optimistic. Several major control-plane
seams remain only partially flattened, and they should be addressed before the
repo starts reduced-profile self-improving capture or resumes adding families.

## What flattening genuinely achieved

The first three flattening batches did remove real duplication:

- six-family registry is live
- workflow-family transcript and tool ingestion now share one resolver
- multiple memory-object families share one clustered lifecycle inspection
- bounded correction / supersede planning is shared across several families
- workflow lessons and response style share one phrase-pattern engine
- approved-memory retrieval feature composition is shared across several
  families
- reviewable-candidate retrieval and part of validated-procedure retrieval now
  reuse shared framework pieces
- prompt-section no longer owns all family posture inline
- proofing is less split than before

That progress is real. It should not be downplayed.

## Why the previous confidence was too optimistic

The earlier docs over-read partial bridges as if they had already become final
control planes.

Most importantly:

- behavior-profile was treated as if it were the application layer, but it is
  still mostly a prompt helper
- proofing was treated as if it were fully registry-driven, but it is still
  registry-plus-switch
- retrieval flattening was treated as if it had flattened the retrieval system,
  when it had mainly flattened score composition
- the remaining work was framed as one narrow closeout slice, which understates
  how many major seams are still not done

## Real product-policy differences versus accidental duplication

### Real product-policy differences

- procedures remain `suggestion_first` and direct-use only on clear ask
- project facts remain explicit, scoped, and stricter than generic guidance
- response style remains bounded and not broad personality memory
- unmet needs remain recommendation-only
- semantic routing remains hybrid-first and family-gated
- phrase induction remains family-eligible, not universal

### Accidental duplication

- separate transcript and tool-side family resolution stacks
- prompt text still acting as part of the application policy engine
- retrieval intent and suppression split across heuristics, SQL, and post-query
  reshaping
- semantic routing living as a hardcoded sidecar subsystem
- proofing still scaling through switches more than adapters
- registry fields existing without being the authoritative runtime control plane
- procedures keeping too much historical subsystem shape rather than only the
  differences that are actually product-policy differences

## Remaining major branch-heavy seams

### 1. Ingestion is still not one control plane

Workflow lessons, project rules, and unmet needs share a resolver.
Response style, project facts, and recurring procedures still keep separate
transcript and tool-side resolution paths.

### 2. Behavior-profile is not yet real application selection

The current behavior-profile layer improves prompt hygiene, but it still does
not own selected/suppressed memory decisions as structured runtime output.

### 3. Retrieval flattening stopped too early

Score composition got flatter.

The wider retrieval system still does not have one control plane for:

- normalized query intent
- family suppression
- approved / candidate / validated-procedure planning
- semantic fallback eligibility

### 4. Semantic routing is still a sidecar subsystem

Registry policy exists, but runtime semantic routing still depends heavily on
hardcoded lesson-key and family-specific sidecar paths.

### 5. Recurring procedures still retain too much subsystem shape

Some procedure differences are real.
Too much of the current procedure substrate still reflects historical
implementation structure rather than only justified product-policy differences.

### 6. Correction policy is not yet fully declarative

Several correction paths are cleaner than before, but the substrate still
contains legacy stringly/runtime-coupled gating that should not be the basis
for later self-improving capture.

### 7. Proofing is still not fully adapter-driven

Proof-family definitions exist, but proof-runner still depends on switches and
shared helper selection more than on a true adapter substrate.

### 8. Registry authority is overstated

The registry is live and useful, but it is not yet authoritative enough to be
described as the full substrate control plane.

### 9. Memory-family contract boundaries still need cleanup

The cross-boundary family-policy exposure is serviceable for the bundled plugin
set, but it is not the clean contract this substrate should eventually lean on.

## What must be fixed before reduced-profile self-improving capture

1. full ingestion control-plane flattening
2. real application-selection / behavior-planning layer
3. retrieval + semantic-routing control-plane flattening
4. recurring-procedure staged substrate redesign
5. correction-policy cleanup

## What must be fixed before adding new families

6. proof-runner adapterization
7. registry authority cleanup
8. memory-family contract / boundary cleanup

## What should be fixed soon but is not strictly blocking

- improve unit seams around retrieval intent, application selection, and
  semantic fallback
- reduce duplicated SQL expression scaffolding between approved and candidate
  read surfaces
- replace remaining stringly control-flow with closed policy enums or adapter
  registration

## What can wait until later

- deeper retrieval SQL normalization once the retrieval/routing control plane is
  flatter
- tighter artifact / read-model convergence if procedure and memory-object
  storage still feel too separate after the staged redesign

## Which docs/specs were overstating completeness

The pre-replan optimism gap was strongest in:

- `/memory-system/CURRENT_SLICE`
- `/memory-system/STATUS`
- `/memory-system/memory-roadmap`
- `/memory-system/FLATTENING_EXECUTION_PLAN`
- `/memory-system/specs/behavior-profile-layer`
- `/memory-system/specs/registry-driven-proof-inspection`
- `/memory-system/specs/retrieval-feature-framework`
- `/memory-system/specs/unified-ingestion-resolver`
- `/memory-system/specs/unified-correction-and-supersede`

Those docs now need to describe the landed work as partial bridges where that
is the honest state.

## Recommended next sequence

### Blockers before reduced-profile self-improving capture

1. full ingestion control-plane flattening
2. real application-selection / behavior-planning layer
3. retrieval + semantic-routing control-plane flattening
4. recurring-procedure staged substrate redesign
5. correction-policy cleanup

### Blockers before new families

6. proof-runner adapterization
7. registry authority cleanup
8. memory-family contract / boundary cleanup

### Should-fix-soon support work

9. memory testability hardening
10. retrieval SQL scaffolding reduction
11. stringly-control-flow cleanup

## Bottom line

The repo should keep flattening before it moves to reduced-profile
self-improving capture or new families.

The honest path is not one more narrow cleanup slice. It is a broader
post-v3 substrate push with multiple control-plane and authority-cleanup slices
planned explicitly in advance.
