# Flattening Execution Plan

## Why this plan changed after batch v3

The first three flattening batches landed real shared substrate work.

They did not, however, honestly reduce the remaining work to one narrow
closeout slice.

The accepted post-v3 architecture review changed the execution posture from:

- one more flattening cleanup slice

to:

- multiple more control-plane and authority cleanup slices before
  self-improving capture

## What is genuinely flattened already

### Landed shared substrate

1. family-definition registry
2. workflow-family ingestion resolver
3. shared clustered lifecycle inspection for several memory-object families
4. bounded correction / supersede planning for several families
5. shared phrase-pattern engine for workflow lessons and response style
6. approved-memory retrieval feature composition across several families
7. reviewable-candidate retrieval feature composition bridge
8. validated-procedure subject-match retrieval feature bridge
9. shared prompt-support behavior-profile helper
10. less fragmented proof-family wiring

### What remains only partially flattened

- ingestion across all six families
- behavior/application selection
- retrieval and semantic routing
- recurring-procedure substrate shape
- correction-policy control plane
- proofing
- registry authority
- memory-family contract boundaries

## Remaining execution sequence

### Phase C — blockers before reduced-profile self-improving capture

1. full ingestion control-plane flattening
2. real application-selection / behavior-planning layer
3. retrieval + semantic-routing control-plane flattening
4. recurring-procedure staged substrate redesign
5. correction-policy cleanup

### Phase D — blockers before new families

6. proof-runner adapterization
7. registry authority cleanup
8. memory-family contract / boundary cleanup

### Should fix soon

9. memory testability hardening
10. retrieval SQL scaffolding reduction
11. stringly-control-flow cleanup

### Could fix later

12. deeper retrieval SQL normalization after control-plane unification
13. artifact / read-model convergence after the procedure redesign proves out

## Why this order is recommended

- ingestion is still the largest duplicated family-control seam
- application selection should not stay implied by prompt text or query
  reshaping
- retrieval/routing should flatten before new learned capture increases
  candidate pressure
- recurring procedures need a staged redesign before the substrate can be
  called broadly extensible
- correction policy should become declarative before the system creates more
  candidate pressure for itself
- proofing, registry authority, and boundary cleanup matter most before new
  families start leaning on the substrate

## Slice-by-slice contracts

### Slice 10 — full ingestion control-plane flattening

- one ingestion control plane for all six families
- one transcript/tool submission decision model
- family adapters for deterministic parsing, semantic parsing, phrase matching,
  correction normalization, and provenance
- deletion target: remaining duplicated response-style, project-fact, and
  recurring-procedure ingestion stacks

### Slice 11 — real application-selection / behavior-planning layer

- selected versus suppressed memory items
- explicit query-intent handoff from retrieval
- application modes enforced structurally rather than mainly by prompt prose
- prompt rendering becomes a downstream renderer

### Slice 12 — retrieval + semantic-routing control-plane flattening

- normalized retrieval intent
- shared feature computation
- unified approved / candidate / validated-procedure retrieval planning where
  honest
- semantic fallback becomes one registry-governed routing layer
- deletion target: query-intent reshaping and semantic sidecar routing sprawl

### Slice 13 — recurring-procedure staged substrate redesign

- preserve `suggestion_first`
- preserve clear-ask direct use
- reduce historical subsystem duplication in lifecycle, correction, retrieval,
  and proofing

### Slice 14 — correction-policy cleanup

- remove legacy stringly gating
- declarative immediate-versus-held correction policy
- clearer procedure and unmet-need correction fit

### Slice 15 — proof-runner adapterization

- registered lifecycle/artifact adapters
- eliminate the remaining registry-plus-switch proof structure

### Slice 16 — registry authority cleanup

- make registry policy actually authoritative
- remove duplicate proof-definition and workflow-family mapping surfaces
- align semantic-routing policy with runtime use

### Slice 17 — memory-family contract / boundary cleanup

- replace the current boundary smell around family-policy exposure
- define the stable core-owned/shared contract across memory-core,
  memory-middleware, and plugin-sdk

## Should-fix-soon slices

These should be planned close to the main substrate push and may land as
supporting slices or paired slices if the touched code overlaps honestly.

### Memory testability hardening

- stronger unit seams around retrieval intent, application selection, and
  semantic fallback
- lower dependence on full integration proof for every control-plane change

### Retrieval SQL scaffolding reduction

- reduce approved-versus-candidate SQL duplication where it is already honest
  to share
- do not over-normalize before the retrieval control-plane rewrite lands

### Stringly-control-flow cleanup

- replace profile strings and ad hoc decision strings with enums, adapters, or
  typed policy

## Likely slice count now

Honest estimate:

- minimum before self-improving capture: 5 major slices
- likely before new families: 8 major slices
- plus 2-3 supporting hardening slices if paired work does not cover them
  naturally

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
