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
- reduced-profile self-improving capture and learned-guidance planning are
  ready to widen automatically

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

### Landed in flattening batch v5

1. recurring-procedure staged substrate redesign
2. correction-policy cleanup
3. proof-runner adapterization

### What this changed

- procedures now behave like a staged family instead of a quasi-separate
  product
- correction policy is now declarative enough for the current family set
- proofing no longer scales through central lifecycle/artifact switches

## Phase D — substrate authority and scale cleanup

This phase should land before the repo adds new memory families.

### Landed in flattening batch v6

1. registry authority cleanup
2. memory-family contract / boundary cleanup
3. deeper retrieval SQL normalization for approved-vs-reviewable-candidate
   simple memory-object reads

### What this changed

- the registry is now authoritative enough to be called the honest family
  policy control plane for the six current families
- memory-family policy now crosses the `memory-core` /
  `memory-middleware` / plugin-sdk boundary through a shared contract instead
  of a middleware implementation re-export
- the remaining approved-vs-reviewable-candidate `get` / `list` / `basic`
  memory-object SQL duplication is reduced

### What still remains later

- artifact / read-model convergence if later self-improving or family-expansion
  pressure shows the procedure-versus-memory-object split is still too awkward

## Phase E — post-flattening hardening before reduced-profile self-improving capture

This phase is now landed.

The post-v6 deep review changed the next-step truth.

It landed because the post-v6 deep review found that the current code still
needed:

- request-path cost hardening for database access and semantic fallback
- application/token-efficiency hardening for durable-memory prompt behavior
- write-path action-stage decomposition for transcript auto-capture, candidate
  submit, and proof execution
- one bounded proof-step dispatch closeout slice

The accepted decomposition rule for that work is:

- finite shared action stages instead of one helper per family
- family variance in registry policy and bounded adapters
- special cases only where the runtime structure is honestly distinct

That hardening is now strong enough that:

- request-path cost is acceptable under higher capture and retrieval pressure
- application policy is structurally selected and cheap enough to render
- proof and orchestration behavior are not hidden regression traps

## Phase F — reduced-profile self-improving capture reevaluation

This phase is now landed.

It proved that reduced-profile self-improving capture can land on the hardened
substrate strongly enough that:

- self-improving candidates enter the same family substrate
- provenance stays explicit
- application policy is structurally selected, not just prompt-described
- retrieval/routing policy does not have to be re-implemented per family
- proofing can scale without bespoke family branches

## Phase G — reduced-profile self-improving capture bounded first tranche

This phase is now landed as a bounded first tranche.

Current tranche shape:

- default-off through `selfImprovingCapture.mode = candidate-only`
- workflow-guidance-only
- candidate-only
- explicit provenance
- duplicate/replay handling on the shared substrate

## Phase H — learned-guidance advisory planning

This phase is now landed as a bounded inline-only advisory slice.

Current tranche shape:

- default-off through `learnedGuidanceAdvisoryPlanning.mode = inline-only`
- approved-only retrieval
- explicit application selection
- advisory-only inline suggestions
- conflict suppression instead of silent collapse

## Phase I — bounded rollout proof and reevaluation

This phase is now landed.

It added:

- explicit rollout family-scope control for self-improving capture
- explicit rollout family-scope control for learned-guidance advisory planning
- explicit default suggestion-budget control for inline advisory planning
- structured self-improving outcome signals for created, blocked,
  replay-blocked, disabled, and failed decisions
- structured advisory observability for surfaced, suppressed, filtered, and
  no-guidance decisions, including approximate prompt cost

It concluded:

- self-improving capture should stay narrow for now
- learned-guidance advisory planning should stay narrow for now
- the next missing truth is real bounded rollout evidence, not more missing
  substrate implementation

## Phase J — Main-session reminder isolation and memory consolidation

This phase is now landed.

It added:

- structural isolation for internal-only cron / exec reminder turns so they do
  not leak visible system payloads into Main chat
- a bounded project-rule semantic lane for explicit docs-localization policy
  phrasing
- a bounded generalized response-style lane for explicit file-reference
  preferences
- retrieval intent and ranking support for docs i18n rule questions and
  file-reference style questions

It concluded:

- the strongest explicit docs/file packet shapes are now good enough for
  bounded promotion follow-through
- vague shorthand packet shapes should stay narrow
- the next missing truth is still bounded off-production evidence, but now on
  top of a cleaner Main-session boundary and cleaner explicit packet shapes

## What comes next after Phase J

The next honest move is bounded promotion follow-through and off-production
rollout enablement for the narrow self-improving and inline-advisory seams plus
the stronger explicit docs/file packet shapes.

## Phase K — cross-domain family expansion

Cross-domain family expansion resumes only after:

1. substrate control-plane flattening
2. substrate authority / scale cleanup
3. reduced-profile self-improving capture
4. learned-guidance advisory planning
5. bounded rollout proof and reevaluation for those new functional seams
6. bounded promotion follow-through and off-production rollout evidence review

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
