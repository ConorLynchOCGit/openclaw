# Flattening Execution Plan

## Why this plan changed after batches v3 and v4

The first four flattening batches plus the first support batch landed real
shared substrate work.

The accepted post-v3 architecture review was still correct:

- flattening was not down to one narrow closeout slice

Batch v4 then landed the next three main control-plane slices, which changes
the remaining execution posture again.

The remaining work is now smaller, but still real:

- procedure redesign
- correction-policy cleanup
- proof / registry / boundary cleanup

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
11. less fragmented proof-family wiring
12. stronger unit seams for retrieval intent, prompt-facing application
    planning, and semantic fallback
13. shared hybrid memory-object SQL scaffolding for approved and
    reviewable-candidate surfaces
14. typed correction-promotion policy inside the correction engine

### What remains only partially flattened

- recurring-procedure substrate shape
- correction-policy control plane
- proofing
- registry authority
- memory-family contract boundaries
- deeper retrieval normalization after the procedure redesign

## Remaining execution sequence

### Phase C — remaining blockers before reduced-profile self-improving capture

1. recurring-procedure staged substrate redesign
2. correction-policy cleanup

### Phase D — remaining blockers before new families

3. proof-runner adapterization
4. registry authority cleanup
5. memory-family contract / boundary cleanup

### Could fix later

6. deeper retrieval SQL normalization after the procedure redesign
7. artifact / read-model convergence after the procedure redesign proves out

## Why this remaining order is recommended

- procedures are the last major family-specific subsystem that still has too
  much historical shape
- correction policy should become declarative before learned capture increases
  candidate pressure
- proofing, registry authority, and boundary cleanup matter most before new
  families start leaning on the substrate

## Slice-by-slice status

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

- deeper retrieval normalization still remains after the procedure redesign

### Slice 13 — recurring-procedure staged substrate redesign

Next:

- preserve `suggestion_first`
- preserve clear-ask direct use
- reduce historical subsystem duplication in lifecycle, correction, retrieval,
  and proofing

### Slice 14 — correction-policy cleanup

Next:

- remove remaining legacy gating
- declarative immediate-versus-held correction policy
- clearer procedure and unmet-need correction fit

### Slice 15 — proof-runner adapterization

Next:

- registered lifecycle/artifact adapters
- eliminate the remaining registry-plus-switch proof structure

### Slice 16 — registry authority cleanup

Next:

- make registry policy actually authoritative
- remove duplicate proof-definition and workflow-family mapping surfaces
- align semantic-routing policy with runtime use

### Slice 17 — memory-family contract / boundary cleanup

Next:

- replace the current boundary smell around family-policy exposure
- define the stable core-owned/shared contract across memory-core,
  memory-middleware, and plugin-sdk

## Recently landed support work

These are already landed and remain relevant supporting improvements:

- retrieval-intent helpers now have direct unit coverage
- prompt-facing application planning is explicit and testable
- semantic fallback eligibility now has pure decision seams
- approved and candidate hybrid memory-object SQL shares one surface scaffold
- immediate bounded correction uses typed promotion policy inside the
  correction engine

## Likely remaining slice count

Honest estimate now:

- minimum before self-improving capture: 2 major slices
- likely before new families: 5 major slices
- plus later bounded hardening only if code reality still warrants it

## What must remain unchanged while executing this plan

- approved-only user-facing retrieval
- hybrid-first retrieval posture
- semantic routing remains family-gated
- procedures remain `suggestion_first` and direct-use only on clear ask
- project facts remain explicit, scoped, and stricter than guidance
- response style remains bounded
- reduced-profile self-improving capture remains disabled
- learned-guidance advisory planning remains disabled
- no new families yet

## Deletion rule

For every remaining substrate seam:

1. land the shared replacement
2. prove parity
3. delete the old duplicated branch

The work is not complete if the repo merely adds another abstraction layer on
top of the old branches and leaves both alive.
