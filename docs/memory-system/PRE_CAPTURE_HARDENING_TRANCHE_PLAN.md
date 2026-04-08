# Pre-Capture Hardening Tranche Plan

## Starting state

- flattening batch v6 is landed
- the post-v6 deep architecture review is landed
- core flattening is complete for the current six-family set
- reduced-profile self-improving capture should not proceed next

## What the post-v6 review concluded

The review concluded that the current substrate is materially flatter than it
was before, but still too expensive and too indirect in three important ways:

1. request-path cost is too high
2. durable-memory application shaping is still too prompt-heavy
3. the main write-path orchestrators are still too branch-heavy

## Why the repo should not move to self-improving capture yet

Flattening being landed did not prove that:

- request-path cost is acceptable under higher capture pressure
- prompt/application behavior is cheap enough to scale
- write-path control surfaces are safe enough to absorb more complexity

The review found that all three still need hardening first.

## The exact three hardening slices

### 1. Request-path cost hardening

Focus:

- pooled/shared DB access across hot and semi-hot paths
- semantic fallback hot-path reduction
- request-time deduplication such as embedding reuse
- bounded repeated retrieval/routing work collapse where the action is the same

Primary de-risking goal:

- prevent normal-turn latency and compute from degrading under later capture
  pressure

### 2. Application and token-efficiency hardening

Focus:

- making application selection more query-aware and retrieval-fed
- reducing broad static durable-memory prompt narration
- adding explicit token-budget discipline

Primary de-risking goal:

- prevent memory growth from turning into prompt bloat and static prompt tax

### 3. Write-path action-stage decomposition

Focus:

- decomposing transcript auto-capture, candidate submit, and proof-adjacent
  write control around finite shared action stages
- moving family variance into registry policy and bounded adapters
- strengthening proof coverage where shared stage behavior becomes more central

Primary de-risking goal:

- prevent future family growth and capture growth from turning the main write
  surfaces back into giant family branch piles

## Why these are not more core flattening slices

These slices are not reopening the old flattening sequence.

Core flattening already landed:

- ingestion
- application-selection bridge
- retrieval/routing control decisions
- recurring-procedure staging
- correction-policy cleanup
- proof adapterization
- registry authority cleanup
- memory-family contract cleanup

The hardening tranche is about:

- cost
- scale
- prompt efficiency
- safer write-path structure

It is post-flattening hardening, not a claim that flattening failed.

## Why action-stage decomposition is preferred over family-per-helper decomposition

Family count is theoretically unbounded.

Action-stage count is finite.

That means the scalable target is:

- shared stages like classify, inspect, decide posture, write, review,
  promote, validate, supersede, and emit proof/telemetry
- policy saying how each family moves through those stages
- bounded adapters only where the runtime structure is honestly distinct

The scalable target is not one permanent helper tree per future family.

## What remains intentionally family-specific

These differences remain real and should stay explicit:

- procedures remain `suggestion_first` and direct-use only on clear ask
- project facts remain explicit, scoped, and stricter than generic guidance
- response style remains bounded and not broad personality memory
- unmet needs remain recommendation-only
- semantic routing remains hybrid-first and family-gated
- phrase induction remains family-eligible, not universal
- validated procedures and phrase-pattern artifacts remain structurally
  distinct where the runtime shape is honestly different

## What these slices should de-risk

- hot-path latency
- ordinary-turn compute cost
- prompt token bloat
- write-path regression risk
- future family scaling pressure
- proofability of shared write/control stages

## What they should not try to replace

They should not try to replace:

- the accepted family policy differences
- the already-landed core flattening work
- future reduced-profile self-improving capture design decisions
- later learned-guidance advisory planning
- later new-family expansion

## What should happen after these slices if they land successfully

If all three slices land honestly:

1. reevaluate reduced-profile self-improving capture on the hardened substrate
2. if that reevaluation remains positive, land the smallest honest bounded
   first tranche
3. only after that, move to learned-guidance advisory planning
4. only later, resume new-family expansion
