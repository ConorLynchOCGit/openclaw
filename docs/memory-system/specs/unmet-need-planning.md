# Unmet-Need Planning

## Purpose / user problem

When the same capability gap appears repeatedly, the system should remember the
need and surface it as recommendation-only planning instead of silently
forgetting it or jumping to installation.

## Why this belongs in the memory system

Repeated unmet needs are durable planning information and belong in the memory
system, but only as bounded recommendation artifacts.

## Non-goals

- automatic procurement
- automatic approval
- automatic installation
- direct capability self-expansion

## Architecture fit

This feature should feed into the already-built skill/procurement governance
surfaces rather than inventing a separate planning pipeline.

## Domain model / concepts

Initial bounded categories:

- missing capability
- repeated tool absence
- repeated workflow need that suggests a plugin/tool candidate

## Bounded scope for first implementation

Recommendation-only.

No execution.

## Exact input / output behavior

Inputs:

- repeated unmet-need signals across bounded contexts

Outputs:

- candidate recommendation artifact
- or existing governance-family record when the evidence is strong enough and
  the workflow already supports it

## Candidate vs approved behavior

- do not create a passive manual candidate queue for unmet-need signals
- start with repeated-evidence aggregation, not durable user-invisible backlog
- once the unmet-need threshold is hit, use `prompt_now` before creating a
  durable recommendation artifact unless an existing governance workflow already
  requires immediate explicit operator action
- no procurement/approval-related state mutation without explicit user/operator
  confirmation

## Provenance / metadata requirements

Record:

- unmet-need category
- repeated evidence count
- affected workflow/context
- why a recommendation was suggested

## Retrieval / application behavior

These artifacts should surface to operators or planning workflows, not silently
change user-facing behavior.

The expected resolution path is:

1. repeated unmet-need signals accumulate evidence
2. when the threshold is hit, the system prompts with a bounded decision such
   as:
   - "This capability gap has come up several times. Should I record it as a
     recommendation?"
3. if confirmed, create the durable recommendation artifact
4. if declined, suppress or cool down the suggestion for a bounded time window

## Ambiguity / abstain / clarify rules

- one isolated complaint should not become a durable unmet-need artifact
- require repeated or strong evidence

## User repair / supersede / forgetting implications

Users or operators should be able to mark a recommendation stale or resolved.

## Observability / metrics / audit requirements

Track:

- unmet-need artifact volume
- repeated-evidence thresholds hit
- recommendation review outcomes

## Evaluation / proof requirements

- prove that repeated unmet needs create recommendation-only artifacts
- prove no automatic install/procurement occurs
- prove repeated unmet-need signals do not become dead background candidates

## Rollout posture

- off-production first
- production only after the recommendation artifacts remain clearly separate
  from execution

## Risks / failure modes

- single noisy complaint becomes a durable recommendation
- recommendation artifacts leak into direct execution
- duplicate unmet-need artifacts proliferate

## Open questions

- should unmet-need planning reuse `skill_candidates` directly in v1, or first
  materialize as a lighter-weight upstream candidate artifact?
