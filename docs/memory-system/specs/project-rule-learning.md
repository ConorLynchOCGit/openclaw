# Project Rule Learning

## Purpose / user problem

Users need to teach OpenClaw durable project-specific operating guidance
without forcing that guidance into:

- a one-off project fact
- a new hand-registered project field
- or a workflow lesson that lost its explicit project identity

Examples:

- `For project Atlas, use generated audit IDs for audit events instead of client timestamps.`
- `For project Cedar Orbit, trust the harbor signoff proof report for rollout audits; raw container health is only liveness noise.`
- `For project Polaris, avoid local replay logs for deploy evidence.`

## Why this belongs in the memory system

These are durable project-scoped rules, but they are not speculative project
state and they are not ordinary workflow hints.

They belong on the same generalized supervised-learning pipeline as broader
workflow lessons so the system can:

- normalize them
- cluster them
- auto-review them
- retrieve them later as guidance

without inventing a separate bespoke approval stack.

## Non-goals

- speculative project summaries
- broad project state inference
- procurement, install, vetting, or approval automation
- autonomous remediation
- generic semantic routing for project rules in v1

## Current live posture

Live now:

- one bounded project-rule family is live on the generalized lesson pipeline
- named-project operating rules can be captured without expanding the
  project-fact field registry
- the detector normalizes:
  - `projectScope`
  - `subject`
  - `guidancePattern`
  - `recommendedAction` when present
  - `avoidAction` when present
  - `rationale` when present
- first compatible evidence enters `hold_for_more_evidence`
- two compatible evidence events can auto-promote through the existing
  review and promotion substrate
- stale held clusters can reject
- stronger conflicting project-rule clusters can supersede older approved
  project rules on the same scoped subject
- approved project rules retrieve through approved-only hybrid with explicit
  project-rule ranking boosts

Not live yet:

- semantic fallback for project rules
- broader generic project-rule families outside the first operating-guidance
  shape
- unmet-need planning artifacts
- proactive or autonomous follow-through

## Architecture fit

Project-rule learning is a sibling family to generalized workflow guidance.

It reuses:

- the existing `improvement` candidate kind
- `ordinary-turn-auto-capture`
- `candidate-submit`
- `workflow-improvement-lifecycle`
- approved-only hybrid retrieval

It must stay distinct from:

- named project facts in `/memory-system/specs/project-memory-expansion`
- generalized workflow guidance in
  `/memory-system/specs/workflow-improvement-memory`
- unmet-need planning in `/memory-system/specs/unmet-need-planning`

## Domain model

### Project rule

A project rule is a durable named-project operating rule that tells the system
what to use, avoid, or trust for a bounded project-scoped subject.

It is guidance-only.

It is not a fact field like `repository_url` or `runbook_url`.

### First live family

The first live family is:

- named-project operating guidance

Supported guidance patterns:

- `use_instead_of`
- `trust_for_scope`
- `avoid_only`

### Candidate shape

The first live candidate shape records:

- `lessonFamily = generalized_project_rule`
- `template = project_rule_guidance`
- `captureClass = project_rule_guidance`
- `reasonCode = project_rule_guidance_statement`
- `guidancePattern`
- `projectScope`
- normalized `projectScope`
- `subject`
- normalized `subject`
- `recommendedAction` when present
- normalized `recommendedAction` when present
- `avoidAction` when present
- normalized `avoidAction` when present
- optional `rationale`
- project-scoped cluster identity and subject identity

## Detection posture

Accept when:

- the user explicitly names a project
- the statement expresses durable operating guidance for that project
- normalization derives a stable project scope plus subject
- at least one meaningful recommended, avoided, or trusted action can be
  derived

Ignore when:

- the project is missing or ambiguous
- the text is just a one-off fact or project URL/config detail
- the text is vague venting rather than durable guidance
- the content drifts into blocked procurement, install, vetting, or approval
  domains
- the content appears to contain likely secret material

## Candidate vs approved behavior

First compatible evidence:

- creates or reuses one normalized held cluster
- `confirmationState = hold_for_more_evidence`

Later compatible evidence:

- may auto-promote through the same bounded machine review path already used by
  generalized workflow guidance

Resolution outcomes remain:

- `approve`
- `hold_for_more_evidence`
- `reject`
- `supersede_existing`

Normal path:

- machine auto-review
- not manual review

## Dedupe / contradiction / supersede

### Cluster identity

The first live project-rule cluster key should be project-scoped and include:

- normalized project scope
- guidance pattern
- normalized subject
- normalized recommended action when present
- normalized avoided action when present

`rationale` helps compatibility but does not split the cluster by itself.

### Compatible evidence

Evidence is compatible when:

- normalized project scope matches
- normalized subject matches
- guidance pattern matches
- normalized recommended action and avoided action match

### Contradiction

Contradiction exists when:

- the same normalized project scope and subject now point to a different
  recommended or trusted action
- or a new rule explicitly rejects the older preferred action

### Supersede

Supersede is allowed only when:

- the conflicting newer cluster has enough compatible evidence to approve
- the older approved rule targets the same project-scoped subject
- the newer cluster is clearly incompatible with the older approved rule

## Retrieval / application posture

Approved project rules retrieve through:

- `memory_object_search_hybrid`
- `scope = approved_only`
- `kind = project`

The first live ranking boosts include:

- normalized project-scope overlap
- normalized subject overlap
- normalized recommended-action overlap
- normalized avoid-action overlap
- guidance-pattern overlap

Application remains:

- guidance-only
- bounded to directly relevant named-project operating asks
- omitted on weak overlap

Project rules must not silently trigger tools, plans, or procedures.

## Relationship to named project facts

Named project facts remain the explicit typed answer path for stable fields
such as:

- repository URL
- deployment URL
- documentation URL
- runbook URL

Project rules answer a different class of question:

- how a named project should be operated
- what signal or source should be trusted
- what action should be preferred or avoided

The rule family must not be used as a backdoor to add arbitrary new project
fact fields.

## Ambiguity / abstain / clarify rules

- do not infer the project name
- do not infer a project rule from broad project narrative
- do not coerce a project fact into a project rule
- clarify only when multiple named projects or multiple incompatible actions
  are explicit and a short clarification is cheaper than guessing

## Repair / supersede / forgetting

Users or operators should be able to repair project rules conversationally.

Repairs should preserve:

- project scope
- subject targeting
- explicit supersede lineage where applicable

## Observability / audit requirements

Track:

- project-rule candidate volume
- hold vs approve vs reject vs supersede outcome rates
- duplicate-cluster reuse
- retrieval use rate for approved project rules

Metadata should preserve:

- project scope
- normalized project scope
- cluster key
- subject key
- guidance pattern
- applied review profile

## Proof requirements

The first project-rule slice had to prove:

1. a new named-project rule can be captured without a pre-registered project
   field
2. the rule normalizes into a reusable candidate shape
3. later compatible evidence auto-promotes it without manual review
4. approved-only hybrid retrieval can surface it through project-rule ranking
   boosts
5. vague adjacent project chatter stays ignored

## Rollout posture

- off-production first
- narrow production proof second
- keep project rules guidance-only
- keep semantic routing family-gated and off for project rules in v1

## Risks / failure modes

- project facts and project rules blur together
- generic rules overtake stronger typed project facts
- weak project chatter creates backlog noise
- project scope normalization leaks across similarly named projects

## Open questions

- when should project rules get phrase induction, if ever, instead of relying
  on hybrid overlap alone?
- what is the first justified semantic miss pattern that would warrant a
  bounded project-rule semantic fallback later?
