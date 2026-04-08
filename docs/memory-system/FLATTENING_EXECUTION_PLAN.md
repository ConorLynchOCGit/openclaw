# Flattening Execution Plan

## Why this plan changed after batches v3-v6

The accepted post-v3 architecture review was correct:

- flattening was not down to one narrow closeout slice

The repo then landed flattening batches v4-v6 plus substrate support batch v1.

That changes the execution posture again:

- the remaining core flattening slices are now landed
- later bounded cleanup may still exist, but it is no longer honest to describe
  it as the old core flattening sequence

## What is genuinely flattened already

### Landed shared substrate

1. family-definition registry
2. full ingestion control plane across all six families
3. shared clustered lifecycle inspection for several memory-object families
4. bounded correction / supersede planning for several families
5. shared phrase-pattern engine for workflow lessons and response style
6. approved-memory retrieval feature composition across several families
7. reviewable-candidate retrieval feature composition bridge
8. validated-procedure subject-match retrieval feature bridge
9. prompt-facing application selection with selected/suppressed family guidance
10. shared hybrid retrieval-control decisions for query hints, project-family
    shaping, and semantic fallback family routing
11. recurring-procedure staged substrate
12. declarative correction-policy execution kinds / target kinds
13. proof lifecycle/artifact adapters
14. stronger unit seams for retrieval intent, prompt-facing application
    planning, and semantic fallback
15. shared hybrid memory-object SQL scaffolding for approved and
    reviewable-candidate surfaces
16. typed correction-promotion policy inside the correction engine
17. registry-owned workflow-family mapping and phrase proof-family ownership
18. plugin-sdk-owned shared memory-family policy contract
19. shared approved-vs-reviewable-candidate `get` / `list` / `basic`
    memory-object read scaffolding

### What remains only partially flattened

- application selection is still prompt-facing rather than the final
  retrieval-fed per-memory-item substrate
- validated-procedure and memory-object artifact/read-model convergence may
  still deserve later cleanup if future pressure shows the split is still too
  awkward

## Completed execution sequence

### Slice 10 — full ingestion control-plane flattening

Landed:

- one ingestion control plane now serves all six families
- transcript and tool submission now reuse the same family resolution flow
- shared canonical match conversion replaced remaining transcript/tool
  duplication for response style, project facts, and recurring procedures

### Slice 11 — application-selection / behavior-planning layer

Landed:

- selected versus suppressed family guidance is now structural for the
  prompt-facing durable-memory layer
- rendering hints now feed prompt rendering downstream
- prompt rendering no longer acts as the practical durable-memory policy owner

Still partial:

- this is not yet the final retrieval-fed per-memory-item selection substrate

### Slice 12 — retrieval + semantic-routing control-plane flattening

Landed:

- normalized retrieval-control decisions now own hybrid query hints
- project-family shaping now reads the shared control decision
- semantic fallback family selection now reads the shared control decision
- the hybrid tool no longer unconditionally calls every semantic fallback lane

Still partial:

- later artifact/read-model convergence may still remain

### Slice 13 — recurring-procedure staged substrate redesign

Landed:

- preserve `suggestion_first`
- preserve clear-ask direct use
- reduce historical subsystem duplication in lifecycle, correction, retrieval,
  and proofing

### Slice 14 — correction-policy cleanup

Landed:

- remove remaining legacy gating
- declarative immediate-versus-held correction policy
- clearer procedure and unmet-need correction fit

### Slice 15 — proof-runner adapterization

Landed:

- registered lifecycle/artifact adapters
- eliminate the remaining registry-plus-switch proof structure

### Slice 16 — registry authority cleanup

Landed:

- registry policy now owns workflow-family mapping
- phrase proof-family ownership now derives from registry policy
- runtime seams no longer need local mapping helpers or local phrase proof
  family strings

### Slice 17 — memory-family contract / boundary cleanup

Landed:

- the public SDK family-policy path now owns the shared contract directly
- `memory-core` no longer crosses the boundary through a middleware
  implementation re-export
- `memory-middleware` now consumes the same shared contract through a local
  barrel

### Slice 18 — deeper retrieval SQL normalization

Landed, narrowly:

- approved-vs-reviewable-candidate `get` / `list` / `basic` memory-object
  reads now share one bounded scaffold
- validated-procedure query paths intentionally stayed separate because that
  remaining duplication reflects a distinct read model, not fake scaffold debt

## What comes next

The next major move is no longer flattening.

It should now be:

1. reduced-profile self-improving capture reevaluation
2. bounded reduced-profile self-improving capture first tranche if that
   reevaluation remains honest
3. learned-guidance advisory planning only after that
4. new families only after those phases

## What must remain unchanged while leaving flattening

- approved-only user-facing retrieval
- hybrid-first retrieval posture
- semantic routing remains family-gated
- procedures remain `suggestion_first` and direct-use only on clear ask
- project facts remain explicit, scoped, and stricter than guidance
- response style remains bounded
- reduced-profile self-improving capture remains disabled until its own phase
- learned-guidance advisory planning remains disabled
- no new families yet

## Deletion rule

For every later substrate seam:

1. land the shared replacement
2. prove parity
3. delete the old duplicated branch

The work is not complete if the repo merely adds another abstraction layer on
top of the old branches and leaves both alive.
