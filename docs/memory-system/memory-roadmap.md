# Memory Roadmap

## Current roadmap summary

The memory program has reached practical parity across the six landed
families:

- response style
- project facts
- recurring procedures
- workflow lessons
- project rules
- unmet needs

Practical parity means:

- the major user-facing family gaps were reduced enough to proceed
- the six families now behave like one broader memory system at the product
  level

Practical parity does not mean:

- all six families share one identical product-policy posture
- the implementation substrate is already flat enough to scale cleanly
- reduced-profile self-improving capture is ready to land

That remains the central roadmap fact.

## Live baseline

The current live boundary includes:

- bounded response-style memory with bounded generic lanes and reviewed phrase
  patterns
- bounded project-fact memory with typed facts plus bounded generic reference
  facts
- bounded recurring procedures with validated-procedure retrieval and
  suggestion-first posture
- generalized workflow lessons with auto-review and approved-only retrieval
- generalized project rules with approved-only retrieval
- bounded unmet needs with recommendation-only retrieval

## Why flattening still comes before future expansion

The repo still should not move on to reduced-profile self-improving capture or
new families yet.

The reason is no longer “missing family features.” It is that the substrate is
still only partially flattened.

After the accepted post-v3 architecture review, the roadmap now treats the
remaining work as several more flatten/refactor tranches, not one narrow
cleanup slice.

## Phase A — existing-family parity

This phase is complete enough to proceed.

Conclusion:

- the six landed families are at practical parity
- practical parity was enough to enter flattening
- practical parity was not enough to justify broader family expansion

## Phase B — flattening batches v1-v4 plus support batch v1

This phase already landed meaningful shared substrate work.

### Landed through batch v1

- family-definition registry for the six landed families
- unified ingestion resolver for workflow lessons, project rules, and unmet
  needs across transcript and tool submission
- unified clustered lifecycle inspection for response style, project facts, and
  workflow improvements

### Landed through batch v2

- shared correction / supersede planning for bounded correction and workflow
  supersede paths
- shared phrase-pattern engine for workflow lessons and response style
- retrieval feature framework for approved-memory hybrid ranking across several
  families

### Landed through batch v3

- shared behavior-profile prompt-support layer
- registry-driven proof-family definitions plus shared proof helpers
- reviewable-candidate retrieval framework bridge
- validated-procedure subject-match retrieval framework bridge

### Landed through support batch v1

- stronger unit seams for retrieval intent, prompt-facing application planning,
  and semantic fallback eligibility
- shared hybrid SQL scaffolding for approved and reviewable-candidate
  memory-object search
- typed correction-promotion policy inside the correction engine

### Landed through batch v4

- one ingestion control plane now serves all six families
- prompt-facing application selection now emits selected items, suppressed
  items, and rendering hints
- hybrid retrieval/routing now reads shared control decisions for query hints,
  project-family shaping, and semantic fallback family routing

### What this phase achieved

- less family-specific duplication than before
- more shared substrate across capture, lifecycle, correction, phrase
  handling, retrieval, prompting, and proofing

### What this phase still did not finish

- recurring procedures still keep too much separate staged subsystem shape
- correction policy is still not fully declarative
- proofing is still not fully adapter-driven
- the registry is still not fully authoritative
- memory-family policy still crosses core/middleware/plugin seams awkwardly
- application selection is still prompt-facing rather than final
  retrieval-fed per-memory-item substrate

## Phase C — substrate control-plane flattening

This is now the real next roadmap phase.

It is broader than the previously documented “remaining flattening closeout.”

### Purpose

Finish the control-plane work that must exist before reduced-profile
self-improving capture can land on honest shared substrate.

### Blockers before reduced-profile self-improving capture

1. recurring-procedure staged substrate redesign
2. correction-policy cleanup

### Why these are blockers

- procedures should preserve real policy differences without keeping a quasi-
  separate subsystem
- correction policy should be declarative and auditable before the system can
  generate more candidates

## Phase D — substrate authority and scale cleanup

This phase should land before the repo adds new memory families.

### Blockers before new families

3. proof-runner adapterization
4. registry authority cleanup
5. memory-family contract / boundary cleanup

### Why these are blockers

- adding families should not require new proof-runner switches
- the registry should be authoritative before it becomes the expansion control
  plane
- memory-family policy should cross the `memory-core` /
  `memory-middleware` / plugin-sdk boundary cleanly

## Phase E — reduced-profile self-improving capture

This remains later.

It should begin only after phases C and the required parts of phase D are
landed strongly enough that:

- self-improving candidates enter the same family substrate
- provenance stays explicit
- application policy is structurally selected, not just prompt-described
- retrieval/routing policy does not have to be re-implemented per family
- proofing can scale without bespoke family branches

## Phase F — learned-guidance advisory planning

This remains later than both flattening and reduced-profile self-improving
capture.

It should build on:

- the stronger flattened substrate
- approved-only retrieval
- explicit application selection
- explicit provenance from self-improving-origin candidates where relevant

## Phase G — cross-domain family expansion

Cross-domain family expansion resumes only after:

1. substrate control-plane flattening
2. substrate authority / scale cleanup
3. reduced-profile self-improving capture
4. learned-guidance advisory planning

Recommended first tranche:

- decision + rationale
- observation / result / finding
- terminology / ontology / canonical definition
- entity profile

Recommended second tranche:

- risk / hazard / safety constraint
- metric / baseline / threshold
- hypothesis / open question
- audience / stakeholder model
- source trust / authority ranking
- exception / edge-case rule

## Should-fix-soon work

These items matter but do not necessarily need to block the first post-v3
substrate slice:

- improve unit seams around retrieval intent, application selection, and
  semantic fallback
- reduce duplicated SQL expression scaffolding between approved and candidate
  read surfaces
- replace remaining stringly control-flow with closed policy enums or adapter
  registration

## Could-fix-later work

- more aggressive normalization of retrieval SQL generation once the
  control-plane rewrite is stronger
- better artifact / read-model convergence if procedure and memory-object
  storage still feel too separate after the staged redesign

## Roadmap guardrails

- do not treat flattening progress as proof that the substrate is already
  complete enough
- do not treat practical parity as full capability identity
- do not enable reduced-profile self-improving capture during the
  docs/spec/architecture-planning slice
- do not add new families before the stronger substrate work is landed
- do not erase real family-policy differences while flattening
