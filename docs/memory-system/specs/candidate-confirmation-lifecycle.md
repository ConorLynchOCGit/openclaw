# Candidate Confirmation Lifecycle

## Purpose / user problem

If `candidate_only` means "someone might review this later," the system will
either accumulate dead candidate rows or depend on manual review that will not
happen consistently.

This spec defines a candidate-with-confirmation model so uncertain-but-plausible
memory signals can be held safely, confirmed later, promoted when justified,
and discarded when they never become trustworthy.

## Why this belongs in the memory system

The memory system needs a middle path between:

- immediate durable writes for low-risk, high-confidence events
- ignoring every event that is not already strong enough

Without this lifecycle, broader semantic detection will either feel too timid
or create an unusable candidate graveyard.

## Non-goals

- replacing the existing candidate/review/promotion substrate
- letting candidate artifacts shape normal behavior by default
- broad automatic approval of risky memory classes
- keeping candidates forever

## Architecture fit

This spec sits between:

- ambiguity policy
- bounded canonicalization
- existing candidate ingress/review/promotion flows

It should use:

- the shared typed canonical subject registry inside `memory-middleware`
- existing candidate storage and provenance metadata
- existing approved-memory promotion paths where already supported

It must not bypass:

- candidate ingress
- bounded promotion rules
- class-specific auto-promotion limits
- user repair and supersede flows

## Domain model / concepts

### No dead candidate rule

No candidate-producing family may rely on an indefinite background review pile
as its normal resolution path.

Every candidate-producing family must define one of these bounded resolution
modes:

1. `auto_confirm`
   - later evidence can confirm and, where class policy allows, promote
2. `prompt_now`
   - the system should ask the user/operator for a decision while the context is
     fresh
3. `expire_or_reject`
   - if neither of the above happens safely, the candidate should expire or be
     rejected rather than lingering forever

Different families may use different modes, but no family may leave
unresolved candidates sitting in the background indefinitely.

### Candidate intent

A `candidate_only` outcome means:

- the system sees a plausible durable signal
- the signal is not strong enough for immediate stronger action
- the system should watch for confirming or contradicting evidence later

### Candidate lifecycle states

The first implementation should treat candidates as moving through a bounded
lifecycle such as:

1. `pending_confirmation`
2. `confirmed_for_promotion`
3. `conflicted`
4. `expired`
5. `promoted`

These do not need to be separate top-level table families in v1 if equivalent
state can be represented in existing candidate metadata and review state.

### Confirmation evidence

Confirmation evidence means later turns that:

- map to the same canonical subject
- are semantically compatible with the original candidate
- increase confidence that the signal is truly durable

### Contradiction evidence

Contradiction evidence means later turns that:

- map to the same canonical subject
- conflict with the candidate's normalized value
- or show the original interpretation was wrong or too broad

## Bounded scope for first implementation

Apply this lifecycle first to low-risk bounded families only:

1. durable response-style requirement
2. user correction for already-supported bounded subjects
3. broader bounded named project facts where the field is supported and
   candidate-only posture already exists
4. repeated bounded workflow-improvement tool gotchas where the lesson is
   guidance-only and the subject set is explicitly allowlisted

Do not apply automatic candidate confirmation to:

- recommendation/procurement planning in v1
- broad procedures in v1 unless explicitly specified later

For workflow-improvement memory in v1:

- allow automatic candidate confirmation only for the first bounded
  repeated-tool-gotcha slice
- do not generalize that policy yet to broader workflow lessons, repeated API
  workarounds, or environment constraints

## Exact input / output behavior

### Candidate creation

When ambiguity policy chooses `candidate_only`, the system should store:

- canonical subject
- normalized value
- confidence band
- evidence snippet
- confirmation status
- evidence count
- contradiction count
- first-seen timestamp
- last-seen timestamp
- expiration window metadata

### Later confirmation

When later evidence maps to the same canonical subject and compatible value,
the system should:

- increment evidence count
- update last-seen timestamp
- mark the candidate as confirmed when the class-specific threshold is met

### Later contradiction

When later evidence conflicts with the candidate, the system should:

- increment contradiction count
- prevent promotion while the contradiction remains unresolved
- mark the candidate as conflicted when conflict is strong enough

### Expiration

If a candidate does not receive sufficient confirming evidence within its
window, the system should:

- mark it expired
- prevent it from silently lingering forever

Expiration should be soft in v1:

- preserve the audit trail
- stop treating the candidate as active for confirmation purposes

### Promotion on confirmation

Only classes that are already approved for low-risk auto-promotion may promote
from confirmed candidate to approved memory without human review.

All other classes may:

- remain candidate-only after confirmation
- or route into an existing review/promotion surface later

## Candidate vs approved behavior

- candidates do not shape normal behavior by default
- confirmation does not automatically imply approval for every class
- confirmed low-risk candidates may auto-promote only where the class spec
  already permits it
- risky classes remain candidate/review-first even after repeated evidence

## Provenance / metadata requirements

Track at minimum:

- candidate lifecycle status
- canonical subject key
- normalized value
- originating evidence
- supporting evidence count
- contradiction count
- confirmation threshold used
- expiration window used
- whether promotion was:
  - automatic under an allowed low-risk class
  - still blocked pending review

## Retrieval / application behavior

Unapproved candidates should not shape normal reply behavior in v1.

The lifecycle exists to improve later promotion quality, not to create a soft
shadow behavior layer.

Confirmed-but-unapproved candidates may be surfaced only in explicit operator
or debugging contexts, not as normal user-facing behavior.

## Ambiguity / abstain / clarify rules

This spec depends on `/memory-system/specs/ambiguity-and-clarification`.

The locked v1 posture is:

- conservative durable writes
- candidate-with-confirmation for plausible middle-confidence signals
- sparse clarify
- ignore weak ambiguous signals

Clarify should be used only when:

- a short question would materially avoid a wrong durable memory
- and asking now is less disruptive than waiting for later evidence

## User repair / supersede / forgetting implications

Later user correction should be allowed to:

- confirm a candidate more strongly
- supersede a candidate before promotion
- invalidate a candidate entirely
- explicitly mark a candidate as not durable / do not remember

Repair should take precedence over passive confirmation counts.

## Observability / metrics / audit requirements

Track:

- candidate creation rate
- confirmation rate
- conflict rate
- expiration rate
- auto-promotion rate from confirmed candidates
- false-positive rate after confirmation
- average time-to-confirmation by family

## Evaluation / proof requirements

Before adoption of this lifecycle:

- prove repeated compatible evidence upgrades candidates correctly
- prove contradictions block promotion
- prove weak candidates expire instead of accumulating forever
- prove unapproved candidates do not shape behavior
- prove class-specific promotion limits still hold

## Rollout posture

- off-production first
- production only after:
  - class-specific thresholds are documented
  - observability exists
  - expiration is implemented
  - contradiction handling is implemented

Each family-specific spec must also declare:

- which candidate resolution mode it uses
- what triggers prompt-now behavior, if any
- when unresolved candidates expire or are rejected

## Risks / failure modes

- confirmation thresholds are too loose and promote bad memory
- thresholds are too strict and candidates never resolve
- expired candidates accumulate as inactive clutter without cleanup policy
- contradiction handling is too weak and stale candidates survive
- candidates become a hidden soft-memory layer through accidental behavior use

## Open questions

- should the first class-specific thresholds be count-based only, or count plus
  time separation?
- how aggressively should expired candidates be cleaned up from default
  operator views while preserving auditability?
