# Project Memory Expansion

## Purpose / user problem

Users should be able to tell OpenClaw a small set of durable project facts and
later get the right answer without repeating them.

## Why this belongs in the memory system

Project facts are durable, scoped, and highly useful for later assistance.

## Non-goals

- speculative project summarization
- implicit inference of project facts from broad context
- open-ended project knowledge graphs in v1

## Architecture fit

This feature should extend the existing named-project fact and correction
pipeline.

It should continue using:

- explicit project scope
- bounded field normalization
- project memory kind
- correction supersede for supported fields

## Domain model / concepts

Initial bounded field set:

- default branch
- staging branch
- repository URL
- deployment URL
- primary package manager
- primary environment name

## Bounded scope for first implementation

Only support explicit named-project statements and corrections for the above
fields.

Current live tranche:

- `default_branch`
- `staging_branch`
- `primary_package_manager`
- `primary_environment_name`
- `repository_url`
- `deployment_url`

## Exact input / output behavior

Inputs:

- explicit named project facts
- explicit named project fact corrections

Outputs:

- candidate or approved `project` memory according to field risk and review
  posture

## Candidate vs approved behavior

- low-risk fields should resolve through the candidate-confirmation lifecycle
  rather than human review backlog
- medium-risk fields should use explicit prompt-now confirmation when the
  decision matters and the target is clear
- ambiguous or unsupported fields should expire or be rejected rather than
  lingering indefinitely

Current live resolution split:

- `candidate_confirmation` after repeated explicit evidence:
  - `default_branch`
  - `staging_branch`
  - `primary_package_manager`
  - `primary_environment_name`
  - `repository_url`
  - `deployment_url`

The first live URL tranche uses the same bounded confirmation lifecycle as the
earlier explicit project-fact fields because:

- the input remains fully explicit
- the field set remains narrowly typed
- later confirmation is still required before approval
- project-scoped duplicate and lifecycle inspection now keep identical field
  keys from leaking across projects

There is still no manual-review backlog target for these fields. If a field is
not confirmed, it should stay unapproved and later expire rather than linger.

## Provenance / metadata requirements

Record:

- project scope
- normalized field key
- normalized value
- explicit/correction origin
- capture seam

## Retrieval / application behavior

Later direct project questions should retrieve:

- the right field
- for the right named project
- with project-scoped precedence over global adjacent memory

Current live retrieval posture:

- hybrid retrieval remains the default
- direct repository/deployment URL asks now use the same field-aware hybrid
  ranking posture as the first project-fact tranche
- project-fact lifecycle inspection and duplicate suppression stay
  project-scoped for supported fields

## Ambiguity / abstain / clarify rules

- do not infer the project name
- do not infer the field from fuzzy narrative text
- clarify when a turn mentions multiple projects or multiple plausible fields

## User repair / supersede / forgetting implications

Supported fields should support explicit correction and supersede.

## Observability / metrics / audit requirements

Track:

- field-specific capture volume
- approval rate by field
- correction/supersede rate by field

## Evaluation / proof requirements

- prove each bounded field on at least one live proof before calling it live
- prove fresh-session retrieval for approved fields
- prove auto-confirmed and prompt-confirmed fields both resolve without dead
  candidate backlog

## Rollout posture

- off-production first
- production acceptance field-by-field

## Risks / failure modes

- wrong project scoping
- adjacent-field confusion
- overpromoting facts that should remain candidate-only

## Open questions

- should later URL-like fields stay on the same confirmation path, or should a
  stricter confirmation mode appear only if a clearly riskier field class is
  added?
