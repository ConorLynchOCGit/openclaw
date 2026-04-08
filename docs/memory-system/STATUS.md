# Status

## Current status snapshot

The memory system completed practical parity across the six landed families and
then landed flattening batches v1-v6 plus substrate support batch v1.

That is now enough to say the remaining core flattening work is landed.

The substrate is materially flatter in:

- ingestion
- prompt-facing application planning
- hybrid retrieval/routing behavior
- recurring-procedure staging
- declarative correction policy
- proof dispatch
- registry authority
- memory-family boundary ownership

Flattening is no longer blocked on the old registry/boundary pair.

That does not mean every later improvement is done. It means the remaining
work is now later bounded follow-up, not the old core flattening sequence.

## What is live now

Live families:

- response style
- project facts
- recurring procedures
- workflow lessons
- project rules
- unmet needs

Live substrate properties:

- approved durable memory objects and validated procedures
- approved-only hybrid retrieval
- bounded clustered hold / approve / reject behavior where appropriate
- explicit correction / supersede paths where appropriate
- bounded reviewed phrase induction where justified
- six-family registry
- shared ingestion control plane across all six families
- shared memory-object lifecycle inspection for several families
- shared bounded correction / supersede substrate for several families
- shared phrase-pattern substrate for workflow lessons and response style
- shared retrieval feature composition for multiple approved-memory families
- shared reviewable-candidate retrieval feature composition
- shared validated-procedure subject-match feature composition
- stronger unit seams for retrieval intent, prompt-facing application planning,
  and semantic fallback eligibility
- shared hybrid SQL scaffolding for approved and reviewable-candidate
  memory-object search
- typed correction-promotion policy inside the correction engine
- prompt-facing application selection with selected items, suppressed items, and
  rendering hints
- shared hybrid retrieval-control decisions for query hints, project-family
  shaping, and semantic fallback family routing
- registry-owned workflow-family mapping and phrase-proof-family ownership
- plugin-sdk-owned shared memory-family policy contract consumed by both
  `memory-core` and `memory-middleware`
- shared approved-vs-reviewable-candidate read scaffolding for hybrid, get,
  list, and basic memory-object reads

## What is live but still only partially flattened

- application-selection layer
- retrieval + semantic-routing control plane
- unified clustered lifecycle
- unified phrase-pattern engine
- retrieval feature framework

These are all real landed substrate improvements.

They are also still partial in at least one important way:

- application selection is not yet the final retrieval-fed per-memory-item
  substrate
- later artifact / read-model convergence may still be warranted if procedures
  and memory objects still feel too separate under later pressure

## What batch v6 just improved

Flattening batch v6 landed the remaining core flattening work plus one bounded
retrieval cleanup slice:

1. registry authority cleanup
2. memory-family contract / boundary cleanup
3. deeper retrieval SQL normalization

Those improvements are real.

They removed or reduced:

- duplicate workflow-family mapping helpers outside the registry
- phrase proof-family ownership living outside the registry
- the public SDK middleware re-export boundary smell around family policy
- repeated approved-vs-reviewable-candidate `get` / `list` / `basic` query
  scaffolding
- another layer of accidental duplication around simple memory-object
  read-surface selection

They did not replace:

- the final retrieval-fed per-memory-item application substrate
- optional later artifact/read-model convergence work
- the need to reevaluate reduced-profile self-improving capture honestly before
  enabling it

## What happens next

The next major phase is no longer core flattening.

The post-v6 deep review changed the next move again.

The next major move should now be:

- request-path cost hardening
- application/token-efficiency hardening
- write-path action-stage decomposition

Why:

- the remaining core flattening blockers are now landed
- the post-v6 deep review found that the request path is still too expensive,
  the durable-memory application layer is still too prompt-heavy, and the main
  write-path orchestrators are still too monolithic for self-improving capture
- learned-guidance advisory planning and new families still remain later than
  that hardening tranche and any later capture reevaluation

Later bounded cleanup can still remain:

- artifact / read-model convergence if later self-improving or new-family
  pressure shows the current procedure-versus-memory-object split is still too
  awkward

## Why future expansion still remains later

The old flattening blockers are now cleared.

Future expansion still waits on later phases, not because flattening is still
unfinished, but because rollout sequencing still matters.

Still not next:

- reduced-profile self-improving capture
- learned-guidance advisory planning
- major cross-domain family expansion

The reason is now sequencing and proof posture:

- reduced-profile self-improving capture should be reevaluated first on the
  stronger substrate only after the new hardening tranche rather than turned on
  by roadmap habit
- learned-guidance advisory planning still waits for reduced-profile
  self-improving capture proof
- new families remain later than both of those phases

## What remains intentionally different

- procedures remain `suggestion_first` and direct-use only on clear ask
- project facts remain explicit, scoped, and stricter than generic guidance
- response style remains bounded and not broad personality memory
- unmet needs remain recommendation-only
- semantic routing remains hybrid-first and family-gated
- phrase induction remains family-eligible, not universal

## Not live yet

Still not live:

- reduced-profile self-improving capture on top of the now-stronger substrate
- learned-guidance advisory planning
- new cross-domain families beyond the current six

## What the post-v6 deep review changed

The review did not reopen core flattening.

It did change the next-step truth:

- reduced-profile self-improving capture should not proceed next
- the next honest work is hardening the request path, application/token
  efficiency, and write-path action-stage structure before capture reevaluation
- the flattening landings were real, but they were not proof that hot-path
  cost and scale risk were already acceptable

## How the hardening tranche scales

The accepted design rule for this tranche is:

- do not decompose into one helper per family
- do decompose into finite shared action stages
- move family variance into registry policy and bounded adapters
- keep only genuinely structurally distinct paths special-cased

## Read next

- `/memory-system/CURRENT_SLICE`
- `/memory-system/NEXT_SUBSTRATE_PUSH_PLAN`
- `/memory-system/FLATTENING_EXECUTION_PLAN`
- `/memory-system/memory-roadmap`
