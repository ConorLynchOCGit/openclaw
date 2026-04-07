# Current Slice

## Active slice

Post-v3 substrate replanning and architecture-spec overhaul

## Objective

Rewrite the roadmap and spec pack after the post-v3 architecture review so the
next implementation push starts from an honest and implementation-ready plan.

This slice exists because flattening batch v3 improved the substrate, but it
did not honestly finish flattening. The current docs were still overstating how
close the memory system was to self-improving capture.

## What the docs used to claim

The previous roadmap/status/current-slice pack claimed:

- one narrow flattening closeout slice remained
- behavior-profile was complete enough to count as the application layer
- proof inspection was complete enough to stop future proof-runner branching
- future work was mostly down to residual ingestion / procedure bridge cleanup

That framing is no longer accepted.

## What the accepted review says instead

The accepted post-v3 review concluded:

- the substrate is not flat enough to move on after one more narrow slice
- behavior-profile is still mostly a prompt helper, not a real
  application-selection layer
- ingestion is still only partially flattened
- retrieval flattening stopped too early at score composition
- semantic routing is still a separate hardcoded sidecar subsystem
- proof inspection is still registry-plus-switch rather than truly
  registry-driven
- recurring procedures still retain too much subsystem shape
- the registry is not yet authoritative enough to justify current confidence
- correction policy still carries legacy stringly/runtime-coupled gating
- the memory-family contract boundary is smellier than it should be

## What flattening genuinely achieved through batch v3

The first three implementation batches still matter and remain credited:

- six-family declarative registry is live
- workflow-family ingestion now shares one resolver across transcript and tool
  submission
- multiple memory-object families now share clustered lifecycle inspection
- bounded correction / supersede planning is shared across multiple families
- workflow lessons and response style share one phrase-pattern engine
- approved-memory retrieval feature composition is shared across more than one
  family
- reviewable-candidate retrieval and part of validated-procedure retrieval now
  reuse shared framework pieces
- prompt-section no longer carries all durable-memory posture inline
- proofing is less split than before

Those are real gains. They are not the same thing as a fully flattened
substrate.

## What remains major substrate work

### Blockers before reduced-profile self-improving capture

1. full ingestion control-plane flattening
2. real application-selection / behavior-planning layer
3. retrieval + semantic-routing control-plane flattening
4. recurring-procedure staged substrate redesign
5. correction-policy cleanup

### Blockers before adding new families

6. proof-runner adapterization
7. registry authority cleanup
8. memory-family contract / boundary cleanup

### Should fix soon

- improve unit seams around retrieval intent, application selection, and
  semantic fallback
- reduce duplicated SQL expression scaffolding between approved and candidate
  read surfaces
- replace remaining stringly control-flow with closed policy enums or adapter
  registration

### Could fix later

- more aggressive normalization of retrieval SQL generation once the
  control-plane rewrite is landed
- better artifact / read-model convergence if procedure and memory-object
  storage still feel too separate after the staged redesign

## What is partially landed rather than complete enough

- behavior-profile layer
  - partially landed as shared prompt-policy support
  - not yet a true application-selection planner
- registry-driven proof inspection
  - partially landed as proof-family definitions plus shared helpers
  - not yet a true adapter-driven proof substrate
- retrieval feature framework
  - partially landed as shared score composition
  - not yet the full retrieval/routing control plane
- unified ingestion resolver
  - partially landed for the workflow family cluster
  - not yet the single ingestion control plane for all six families
- unified correction / supersede
  - partially landed for several bounded paths
  - not yet fully declarative or free of stringly gating

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

Those phases now wait for the stronger substrate work listed above, not just
for one narrow closeout slice.

## The next implementation slice

The next implementation slice should now be:

- full ingestion control-plane flattening

Reason:

- it is still the largest duplicated control-plane seam
- it blocks cleaner application selection, retrieval/routing unification, and
  later self-improving capture integration
- it is broader than the old “remaining ingestion migration” framing and should
  be treated that way
