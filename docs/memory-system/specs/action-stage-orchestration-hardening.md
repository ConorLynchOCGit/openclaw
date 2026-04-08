# Action-Stage Orchestration Hardening

## Landed status

Landed in pre-capture hardening batch v1, plus one bounded carryover closeout
for proof-step dispatch.

What landed:

- shared ordered resolution and post-submit stages in `candidate-submit`
- ordered capture-decision stages in `ordinary-turn-auto-capture`
- explicit shared write-stage helpers with focused tests
- stronger executor-level proof coverage
- bounded proof-step dispatch table closeout

What did not land:

- one helper tree per family
- a total subsystem rewrite
- flattening procedures or phrase artifacts into generic memory-object behavior

## Purpose

Define the third post-v6 hardening slice that should land before any
reduced-profile self-improving capture reevaluation.

This slice exists to make the current write/control surfaces scale through a
finite set of shared action stages rather than through one growing branch pile
per family.

## Why this slice is next

The post-v6 deep review concluded that the substrate is flatter than before,
but the two biggest write-path orchestrators are still too large and too
branch-heavy:

- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.ts`

If more family count or more capture pressure arrives before those surfaces are
re-shaped, the repo is likely to accumulate another layer of accidental
parallelism.

## Runtime seams in scope

Primary likely touch points:

- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.ts`
- `extensions/memory-middleware/src/proof-runner.ts`
- registry/policy/adapters that feed those surfaces
- write-path lifecycle/review/promotion helpers already shared across families

Secondary likely touch points:

- targeted proof and orchestration tests
- bounded metadata/helper seams that still live inline in the big control files

## Target architecture shape

The target shape is:

- finite shared action stages for the common write/control work
- family variance expressed in registry policy and bounded adapters
- only genuinely structurally distinct paths kept special-cased

Representative shared action stages:

1. classify candidate or correction intent
2. inspect existing lifecycle state
3. decide duplicate, review, hold, reject, or correction posture
4. persist candidate or candidate metadata
5. review
6. promote or validate
7. supersede where policy allows it
8. trigger semantic or phrase side effects where policy allows it
9. emit proof or telemetry artifacts

This slice explicitly rejects a family-per-helper design as the main scaling
model.

## Why action-stage decomposition scales better than family-per-helper decomposition

Family count is theoretically unbounded. Action-stage count is finite.

That means the scalable target is:

- a shared pipeline of a limited number of stages
- policy saying how each family moves through those stages
- bounded adapters only where a family is structurally different

The scalable target is not:

- one permanent runner file per family
- one permanent orchestration branch per family
- one new helper tree every time a future family is added

## What remains intentionally family-specific

These differences must remain explicit:

- procedures retain validated-procedure staging and `suggestion_first`
  application posture
- project facts retain explicit project scope and stricter truth posture
- response style remains bounded reply-shaping
- unmet needs remain recommendation-only
- phrase-pattern artifacts remain distinct from ordinary memory objects

Those are policy differences, not failures of decomposition.

## Success criteria

This slice is successful only if:

1. the largest write/control files lose real branch-heavy ownership of shared
   stages
2. the replacement is built around finite shared stages rather than family
   helper sprawl
3. family variance is pushed into registry policy or bounded adapters where
   honest
4. proof-runner executor coverage is stronger for the shared stages that now
   matter more
5. current family behavior remains intact
6. the result is easier to extend for future families without reintroducing a
   new family-per-control-plane model

## Non-goals

This slice is not:

- one helper per family as the main scaling model
- a total subsystem rewrite
- a collapse of procedures or phrase artifacts into generic memory objects
- self-improving capture itself

## Risks

Main risks:

- decomposition that only moves the same branches into more files
- over-flattening real procedure or phrase-artifact differences
- proving the structure only at helper level while leaving executor paths
  under-tested

## Validation expectations

At minimum this slice should prove:

- shared stages are real runtime seams, not just renamed branches
- family-specific differences still behave the same
- proof-runner executor coverage is materially stronger where shared stage
  changes affect proof behavior
- typed/runtime checks remain green

## What this slice unlocks next

This slice should make later reduced-profile self-improving capture
reevaluation safer because added memory pressure would land on a smaller number
of shared stages instead of on two giant family-heavy orchestration files.
