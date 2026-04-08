# Current Slice

## Active slice

Reduced-profile self-improving capture reevaluation

## Objective

Use the hardened post-v6 substrate to decide whether reduced-profile
self-improving capture can now land without creating a second parallel memory
system.

- do not move directly to capture implementation by roadmap habit
- do use the landed hardening batch as the baseline truth for the reevaluation

## What just landed in pre-capture hardening batch v1

### Slice 1 — request-path cost hardening

- project semantic fallback lanes now reuse one query embedding, one workflow
  backfill pass, and one approved-project semantic search per request
- touched hot/semi-hot direct callers now use shared pooled database access
  instead of raw per-call `pg.Client` setup

### Slice 2 — application and token-efficiency hardening

- the durable-memory prompt section now renders as a compact policy-shaped
  summary instead of a long static family speech
- prompt guidance stays structural, but the ordinary-run token tax is lower

### Slice 3 — write-path action-stage decomposition

- candidate submit now runs through shared ordered stages for resolve-existing,
  duplicate guard, submit, and post-submit auto-promotion
- ordinary-turn auto-capture now dispatches capture handling through ordered
  shared decision stages
- proof coverage now includes executor-level stage threading

### Slice 4 — bounded carryover closeout

- proof-runner step execution now uses a shared step-runner table instead of a
  remaining central switch

## What just landed before this batch

### Flattening batch v6

- workflow-family mapping now derives from the registry instead of local helper
  switches
- phrase proof-family ownership now derives from the registry instead of local
  policy strings
- proof-family visibility for phrase artifacts and workflow capture mapping no
  longer require separate runtime policy sources

- `src/plugin-sdk/memory-family-policy.ts` now owns the shared family policy
  contract directly
- `memory-core` no longer reaches a middleware implementation file through the
  public SDK path
- `memory-middleware` now consumes the same shared contract through a local
  barrel instead of acting as the hidden source of truth

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

### Capture reevaluation baseline is now ready

- request-path cost hardening is landed
- application/token-efficiency hardening is landed
- write-path action-stage decomposition is landed
- bounded proof-step dispatch closeout is landed

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
  orchestration risks that made capture reevaluation premature until the new
  hardening tranche landed
- the hardening tranche is now landed, so the next honest work is the dedicated
  reduced-profile self-improving-capture proof and rollout decision, not blind
  enablement

## Decomposition rule for the hardening tranche

- do not scale by adding one helper per family
- do scale by decomposing into finite shared action stages
- keep family variance in registry policy and bounded adapters
- keep only genuinely structurally distinct paths special-cased

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

Those later phases still wait for the reevaluation outcome and any bounded
first capture tranche.

## The next main implementation sequence

The next main implementation sequence should now be:

- reduced-profile self-improving capture reevaluation
- bounded first capture tranche only if the reevaluation stays honest

Reason:

- the remaining core flattening blockers are now landed
- the pre-capture hardening tranche is now landed on top of that flatter
  substrate
- learned-guidance advisory planning and new families remain later than both
  the reevaluation and any later bounded capture tranche
