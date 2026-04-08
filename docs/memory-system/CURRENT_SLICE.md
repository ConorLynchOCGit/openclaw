# Current Slice

## Active slice

Post-v6 memory hardening before self-improving capture

## Objective

Start the first honest post-flattening phase after flattening batch v6:

- harden the remaining hot-path and orchestration weaknesses surfaced by the
  post-v6 deep architecture review
- do not move on to reduced-profile self-improving capture just because the
  flattening checklist is finished

## What just landed in flattening batch v6

### Slice 16 — registry authority cleanup

- workflow-family mapping now derives from the registry instead of local helper
  switches
- phrase proof-family ownership now derives from the registry instead of local
  policy strings
- proof-family visibility for phrase artifacts and workflow capture mapping no
  longer require separate runtime policy sources

### Slice 17 — memory-family contract / boundary cleanup

- `src/plugin-sdk/memory-family-policy.ts` now owns the shared family policy
  contract directly
- `memory-core` no longer reaches a middleware implementation file through the
  public SDK path
- `memory-middleware` now consumes the same shared contract through a local
  barrel instead of acting as the hidden source of truth

### Slice 18 — deeper retrieval SQL normalization

- approved and reviewable-candidate `get` / `list` / `basic` memory-object read
  surfaces now share one bounded read scaffold
- the batch explicitly did not flatten validated procedures into that helper,
  because those query paths still reflect a distinct read model rather than
  fake SQL duplication

## What batch v6 actually removed or reduced

- local workflow-family resolution switches outside the registry
- local phrase proof-family policy strings outside the registry
- the public SDK middleware re-export boundary smell around family policy
- another approved-vs-reviewable-candidate query scaffold in simple memory
  object reads

## What batch v6 did not replace

- application selection is now structural at the prompt-facing layer, but not
  yet the final retrieval-fed per-memory-item substrate
- later artifact/read-model convergence may still remain worthwhile if
  self-improving or future-family pressure exposes more procedure/read-model
  awkwardness
- reduced-profile self-improving capture still requires both a dedicated
  reevaluation and pre-capture hardening work

## What remains major substrate work

### Core flattening sequence

The remaining core flattening sequence is now landed.

### Must happen before capture reevaluation

- request-path cost hardening for database access and semantic fallback
- application/token-efficiency hardening for durable-memory prompt behavior
- orchestration/test hardening for transcript auto-capture, candidate submit,
  and proof execution

### Could still fix later

- better artifact / read-model convergence if procedure and memory-object
  storage still feel too separate after the staged redesign

## What is now live but still partial

- registry authority
  - live for workflow-family mapping and phrase proof-family ownership
  - adapters still remain the honest boundary for parser bodies and query bodies
- memory-family contract boundary
  - live for a plugin-sdk-owned shared family policy contract
  - later contract trimming may still happen, but the middleware re-export
    smell is gone
- application-selection layer
  - live for prompt-facing family posture selection and suppression
  - not yet the final retrieval-fed per-memory-item application substrate
- retrieval + semantic-routing control plane
  - live for hybrid query intent, project-family shaping, and semantic fallback
    family routing
  - later artifact/read-model convergence may still remain

## Why the next phase is not self-improving capture yet

- the flattening blockers are now gone
- the post-v6 deep review still found hot-path cost, prompt-weight, and
  orchestration risks that make capture reevaluation premature
- it does not remove the need for a dedicated reduced-profile
  self-improving-capture proof and rollout plan after those issues are hardened

## Must remain intentionally different

- procedures remain `suggestion_first` and direct-use only on clear ask
- project facts remain explicit, scoped, and stricter than generic guidance
- response style remains bounded and not broad personality memory
- unmet needs remain recommendation-only
- semantic routing remains hybrid-first and family-gated
- phrase induction remains family-eligible, not universal

## Explicitly not next

Still not next:

- reduced-profile self-improving capture reevaluation
- reduced-profile self-improving capture integration
- learned-guidance advisory planning
- new cross-domain families

Those phases still wait for the post-v6 hardening tranche above.

## The next main implementation slice

The next main implementation slice should now be:

- request-path cost hardening and application/token-efficiency hardening before
  reduced-profile self-improving capture reevaluation

Reason:

- the remaining core flattening blockers are now landed
- the post-v6 deep review found that the current request path and
  prompt/application shape are still too expensive and too indirect for
  self-improving capture pressure
- learned-guidance advisory planning and new families remain later than both
  the hardening tranche and any later capture reevaluation
