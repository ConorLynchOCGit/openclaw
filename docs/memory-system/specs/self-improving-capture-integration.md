# Self-Improving Capture Integration

## Purpose / user problem

The repo already has a reduced-profile self-improving capture seam, but it is
documented mostly as an adoption or forking question.

After the generalized-learning pivot, that is no longer enough.

This spec defines how reduced-profile self-improving capture should plug into
the same generalized candidate pipeline instead of becoming a parallel learning
system.

## Why this belongs in the memory system

Self-improving capture is only valuable if it increases candidate coverage
without fragmenting:

- canonicalization
- review logic
- retrieval rules
- provenance

This spec makes the self-improving seam an input source, not a separate memory
authority.

## Current live posture

Live today:

- a reduced-profile self-improving capture surface exists
- it is candidate-only by design
- it is now integrated into the shared candidate pipeline
- it is gated by `selfImprovingCapture.mode = candidate-only`
- it now has explicit rollout family-scope control through
  `selfImprovingCapture.allowedLessonFamilies`
- provenance distinguishes self-improving origin explicitly
- blocked replay and duplicate handling now run on the shared workflow
  improvement substrate
- structured rollout evaluation now exposes created, blocked,
  replay-blocked, disabled, and failed outcomes
- accepted candidates now carry rollout metadata for later review and audit

Not live today:

- production enablement by default
- broader family coverage beyond the bounded workflow-guidance lesson tranche
- any direct approval or action-taking path
- automatic widening beyond the current bounded rollout scope

## Non-goals

- raw upstream `self-improving-agent` installation
- direct approval from self-improving outputs
- direct writes to approved memory, control files, policies, or procedures
- self-improving-driven autonomy
- hook-first workflow adoption

## Relationship to the existing adoption docs

These docs remain authoritative for procurement and reduced-profile posture:

- `/memory-system/SELF_IMPROVING_AGENT_ADOPTION_PLAN`
- `/memory-system/SELF_IMPROVING_AGENT_FORK_SPEC`
- `/memory-system/SELF_IMPROVING_AGENT_INTEGRATION`

This spec adds the missing runtime architecture contract:

- how reduced-profile outputs enter the memory pipeline
- how they interact with native capture
- what must be true before activation

## Architecture fit

Reduced-profile self-improving capture must plug into:

- the same candidate-only ingress class
- the same canonicalizer
- the same duplicate and clustering logic
- the same auto-review or review rules

It must not introduce:

- a separate approval engine
- a separate retrieval layer
- a separate durable memory model

## Domain model

### Provenance

Every candidate created from this source must preserve explicit provenance such
as:

- `origin = self_improving_capture`
- adapter or profile id
- source session or evidence reference
- confidence or evidence metadata from the reduced-profile emitter

### Allowed candidate outputs

The first integrated version may propose only:

- supported workflow lessons
- generalized workflow lessons
- later approved extension targets explicitly added by spec

It must not start by spraying into every memory family.

### Native-versus-self-improving cluster

Self-improving candidates should merge into the same normalized cluster as
native semantic or deterministic candidates when they canonicalize to the same
lesson shape.

That means the system should be able to reason about one candidate cluster with
mixed evidence provenance rather than two unrelated review piles.

## Conflict handling

### Native capture wins on exact duplicate shape

If native capture and self-improving capture produce the same normalized
cluster:

- merge evidence
- preserve provenance
- do not create parallel candidate objects just because provenance differs

### Native rejection should block self-improving replay

If a native candidate or cluster was explicitly rejected for:

- blocked domain
- likely secret material
- obvious ambiguity
- invalid shape

the reduced-profile self-improving path should not immediately recreate the
same candidate again without materially different evidence.

### Self-improving contradiction

If a self-improving proposal conflicts with a stronger native-approved lesson,
prefer:

- rejecting the proposal
- or routing it into explicit supersede review

Do not let the self-improving origin silently override approved native lessons.

## Activation prerequisites

Do not enable the reduced-profile self-improving seam until all of the
following are true:

1. the post-v3 substrate blockers before self-improving capture are landed:
   - full ingestion control-plane flattening
   - prompt-facing application-selection / behavior-planning layer
   - retrieval + semantic-routing control-plane flattening
2. the remaining post-v4 blockers before self-improving capture are landed:
   - recurring-procedure staged substrate redesign where relevant
   - correction-policy cleanup
3. generalized lesson normalization is stable
4. generalized lesson auto-review exists
5. candidate backlog-control rules are live
6. conflict handling against native capture is implemented
7. proof-runner support exists for this provenance path on the adapterized
   proof substrate
8. operator observability can distinguish self-improving-origin decisions
9. the post-v6 hardening tranche is landed strongly enough that:
   - request-path cost is acceptable under added capture pressure
   - durable-memory application selection is query-aware and token-budgeted
   - write-path control surfaces scale through finite shared action stages

## Candidate-only posture

The reduced-profile seam must remain candidate-only even after activation.

That means:

- no direct approval
- no direct phrase-pattern approval
- no direct procedure validation
- no direct planning or proactive execution

Its job is to broaden candidate discovery, not to expand authority.

## Retrieval and application posture

Self-improving origin must not change retrieval rules.

Only approved lessons may affect later retrieval/application, and only through
the same approved path used for native lessons.

If a self-improving-origin lesson is later approved, it should be
indistinguishable in retrieval behavior from a natively captured approved
lesson, except for audit provenance.

## Rollout guardrails

The first rollout must be:

- off-production first
- narrow to one lesson family
- candidate-only
- reversible
- metrics-backed

Production enablement should start with:

- one reduced-profile source
- one explicitly configured allowed lesson family set
- explicit disablement switch
- proof that duplicate and conflict handling work
- review-facing outcome and burden signals
- an explicit `off-production` or `production-canary` rollout target instead
  of treating mode alone as activation

Do not use this spec as permission to start reduced-profile self-improving
capture immediately after flattening. The stronger substrate work and the
post-v6 hardening tranche documented in the roadmap and sequencing docs are
hard prerequisites.

That prerequisite sequence is now landed, and the rollout-proof batch is also
landed.

The current accepted reevaluation result is still:

- stay narrow
- keep the seam default-off
- require an explicit `off-production` or `production-canary` rollout target
  before activation
- use automated eval first, then gather rollbackable production-canary evidence
  before widening
- do not widen vague shorthand packet shapes automatically just because
  stronger explicit natural wording now works

The repo should not widen this seam automatically just because the shared
substrate and the first rollout-proof signals now exist.

## Observability and audit

Track at minimum:

- self-improving-origin candidates created
- merge rate with native clusters
- rejection rate
- later approval rate
- contradiction rate
- repeated blocked replay rate
- review-burden signals for created-versus-blocked outcomes
- configured rollout family scope at the time of the decision
- duplicate-outcome classification for created candidates

Operators must be able to answer:

- how much useful coverage the self-improving source added
- whether it mainly produced duplicates
- whether it mainly produced noise
- whether the current rollout family scope is still too broad or too narrow

## Proof requirements

The first implementation slice for this spec must prove:

1. a reduced-profile self-improving proposal can enter the normal generalized
   candidate pipeline
2. duplicate clustering works across provenance types
3. blocked or already-rejected shapes do not replay endlessly
4. no direct approval or action-taking occurs
5. later approved retrieval still uses the normal approved path only

## Risks / failure modes

- self-improving output creates noisy duplicate clusters
- provenance gets lost during dedupe
- rejected shapes keep replaying
- teams treat self-improving as a second approval engine

## Open questions

- what off-production evidence threshold should justify widening beyond the
  current bounded workflow-guidance lesson scope?
- is the current structured rollout evaluation sufficient for reviewer burden
  judgment, or is one thinner review-facing surface still needed?
- how much of the next follow-through should start from explicit manual-UX
  packet shapes versus broader paraphrase capture?
