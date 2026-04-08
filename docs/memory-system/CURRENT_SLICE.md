# Current Slice

## Active slice

Registry authority cleanup

## Objective

Land the next remaining substrate authority slice after flattening batch v5:

- registry authority cleanup

## What just landed in flattening batch v5

### Slice 13 — recurring-procedure staged substrate redesign

- recurring procedures now advance through one explicit staged substrate:
  candidate review, draft promotion, validation, embedding, and optional
  validated-procedure supersede
- transcript-side auto-capture and tool-side candidate submission now reuse the
  same staged procedure transition helper
- procedure lifecycle inspection now feeds one staged inspection surface instead
  of forcing callers to reconstruct candidate-versus-validated posture locally

### Slice 14 — correction-policy cleanup

- correction planning now has explicit execution kinds for:
  - held correction
  - approved-memory supersede
  - validated-procedure supersede
- correction target kind and target-required posture now come from family policy
- procedure correction now fits the staged procedure substrate without being
  forced through the memory-object supersede path

### Slice 15 — proof-runner adapterization

- proof-runner lifecycle dispatch now resolves through registered lifecycle
  adapters instead of a central inspection-mode switch
- proof artifact extraction now resolves through registered artifact adapters
  instead of a central artifact-mode switch
- proof definitions for the six main families now derive from the family
  registry instead of living in a second duplicated proof-definition map

## What batch v5 actually removed or reduced

- duplicate procedure stage progression across transcript capture and tool
  submission
- caller-coupled procedure correction decisions that depended on old
  memory-object assumptions
- the central proof-runner lifecycle dispatch switch
- the central proof-runner artifact extraction switch
- the duplicated proof-definition entries for the six main memory families

## What batch v5 did not replace

- registry authority is still not fully honest
- memory-family contract / boundary cleanup is still ahead
- application selection is now structural at the prompt-facing layer, but not
  yet the final retrieval-fed per-memory-item substrate
- deeper retrieval normalization and later artifact/read-model convergence still
  remain optional follow-up work

## What remains major substrate work

### Remaining major slices before moving on

1. registry authority cleanup
2. memory-family contract / boundary cleanup

### Could fix later

- more aggressive normalization of retrieval SQL generation once the retrieval
  control plane is stronger
- better artifact / read-model convergence if procedure and memory-object
  storage still feel too separate after the staged redesign

## What is now live but still partial

- recurring-procedure staged substrate
  - live for shared staged transition handling across transcript and tool flows
  - later artifact/read-model convergence may still be warranted
- correction-policy substrate
  - live for declarative execution kind and target kind across the six families
  - later registry authority cleanup still remains
- application-selection layer
  - live for prompt-facing family posture selection and suppression
  - not yet the final retrieval-fed per-memory-item application substrate
- retrieval + semantic-routing control plane
  - live for hybrid query intent, project-family shaping, and semantic fallback
    family routing
  - not yet the end-state for all later retrieval normalization work
- proof adapter substrate
  - live for lifecycle and artifact dispatch
  - registry authority cleanup still remains

## Must remain intentionally different

- procedures remain `suggestion_first` and direct-use only on clear ask
- project facts remain explicit, scoped, and stricter than generic guidance
- response style remains bounded and not broad personality memory
- unmet needs remain recommendation-only
- semantic routing remains hybrid-first and family-gated
- phrase induction remains family-eligible, not universal

## Explicitly not next

Still not next:

- reduced-profile self-improving capture integration
- learned-guidance advisory planning
- new cross-domain families

Those phases still wait for the remaining substrate work above.

## The next main implementation slice

The next main implementation slice should now be:

- registry authority cleanup

Reason:

- more runtime policy now genuinely flows through shared substrates, but the
  registry still is not yet authoritative enough to be called the honest
  control plane
- proof definitions for phrase surfaces still remain outside the main family
  registry path
- memory-family expansion and later learned pressure should not lean on a
  registry that still leaves policy duplicated elsewhere
