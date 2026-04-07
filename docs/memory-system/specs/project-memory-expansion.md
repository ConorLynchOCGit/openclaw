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

It now also includes the first bounded generic project-fact path for explicit
named-project reference facts that are still narrow enough to normalize,
cluster, auto-review, and retrieve without broadening into speculative
project summaries.

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
- `documentation_url`
- `runbook_url`

Current family-parity tranche:

- bounded generic named-project reference facts such as evidence dashboards
  and similarly explicit reference-like project anchors

## Exact input / output behavior

Inputs:

- explicit named project facts
- explicit named project fact corrections

Outputs:

- candidate or approved `project` memory according to field risk and review
  posture
- generic explicit named-project reference facts still remain `project`
  memory, but they use a bounded generic subject/value shape instead of a
  fixed field key

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
  - `documentation_url`
  - `runbook_url`
- `hold_for_more_evidence` after first explicit evidence, then bounded
  auto-review after later compatible evidence:
  - bounded generic named-project reference facts

The live URL tranches use the same bounded confirmation lifecycle as the
earlier explicit project-fact fields because:

- the input remains fully explicit
- the field set remains narrowly typed
- later confirmation is still required before approval
- project-scoped duplicate and lifecycle inspection now keep identical field
  keys from leaking across projects

There is still no manual-review backlog target for these fields. If a field is
not confirmed, it should stay unapproved and later expire rather than linger.

For the generic named-project reference tranche:

- the first compatible explicit statement creates a held cluster with:
  - normalized project scope
  - normalized subject
  - normalized value
  - project-scoped `subjectKey`
  - cluster `key`
- a later compatible evidence event can auto-promote through the same
  candidate review and promotion substrate using:
  - `project_fact_generalized_confirmation_v1`
  - `generalized_cluster_auto_review`
- stale held clusters should reject instead of lingering
- conflicting approved generic facts on the same subject require explicit
  correction phrasing rather than silently creating adjacent approved rows

## Provenance / metadata requirements

Record:

- project scope
- normalized field key for supported typed fields
- normalized subject label for the generic reference tranche
- normalized value
- fact family
- explicit/correction origin
- capture seam

## Retrieval / application behavior

Later direct project questions should retrieve:

- the right field
- for the right named project
- with project-scoped precedence over global adjacent memory

Current live retrieval posture:

- hybrid retrieval remains the default
- direct repository/deployment/documentation/runbook URL asks now use the same
  field-aware hybrid ranking posture as the first project-fact tranche
- direct asks about approved generic named-project reference facts now use
  approved-only hybrid retrieval with project-scope, subject, and value
  overlap boosts
- typed field matches should still outrank generic project-fact matches when a
  stronger typed answer exists
- project-fact lifecycle inspection and duplicate suppression stay
  project-scoped for supported typed and generic project facts

## Ambiguity / abstain / clarify rules

- do not infer the project name
- do not infer the field from fuzzy narrative text
- do not treat broad narrative project summaries as generic project facts
- clarify when a turn mentions multiple projects or multiple plausible fields

## User repair / supersede / forgetting implications

Supported fields should support explicit correction and supersede.

Supported generic named-project reference facts should also support explicit
correction and supersede on the same project-scoped subject.

## Observability / metrics / audit requirements

Track:

- field-specific capture volume
- approval rate by field
- correction/supersede rate by field
- generic project-fact cluster approval rate
- generic project-fact stale rejection rate

## Evaluation / proof requirements

- prove each bounded field on at least one live proof before calling it live
- prove fresh-session retrieval for approved fields
- prove auto-confirmed and prompt-confirmed fields both resolve without dead
  candidate backlog
- for the generic reference tranche, prove:
  - first evidence holds rather than dead-queues
  - second compatible evidence auto-promotes
  - later retrieval surfaces the approved generic project fact through
    approved-only hybrid
  - explicit correction supersedes the older approved generic fact
  - ambiguous nearby narrative still stays ignored

## Rollout posture

- off-production first
- production acceptance field-by-field
- bounded generic project-fact expansion should also remain subject-by-subject
  rather than open-ended generic project summarization

## Risks / failure modes

- wrong project scoping
- adjacent-field confusion
- overpromoting facts that should remain candidate-only
- allowing loose project labels to masquerade as durable project facts
- over-broad generic project summaries slipping into the generic fact lane

## Open questions

- should later non-URL project-fact classes still share the current
  confirmation posture, or should a stricter mode appear only when a clearly
  riskier field class is added?
- should recurring project-reference labels like `evidence dashboard`,
  `runbook board`, or `support channel` eventually receive reviewed phrase
  induction, or is hybrid plus bounded semantic capture sufficient for this
  family?
