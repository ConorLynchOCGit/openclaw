---
summary: "Evaluation and approval contract for internal and third-party skill or tool candidates."
title: "Skill And Tool Candidate Evaluation"
---

# Skill And Tool Candidate Evaluation

## Objective

Define how internal and third-party skill, tool, and workflow candidates are
judged before promotion.

Candidate discovery may be proactive. Structural recurrence, explicit operator
asks, validation failures, or session/heartbeat boundaries may trigger bounded
model review. The planner may create and surface candidate artifacts only after
model/operator review decides that the bounded evidence supports a skill, tool,
workflow, existing-skill enhancement, proactive plan, merge, demotion, or no
candidate outcome.

Low-risk limited-scope skill automation may later auto-draft, auto-test,
auto-canary, and in some cases auto-promote after passing the required checks.
Medium-risk and high-risk changes remain approval-gated.

## Required checks

### Internal candidates

- representative replay
- contract validation
- skill eval generation and execution
- resolver/trigger tests
- check-resolvable-style reachability and overlap report
- package E2E
- safety and permission review
- source authority review
- canary/rollback proof where applicable
- tier-appropriate approval or autonomy decision

### Workflow candidates

- repeated successful workflow evidence
- bounded reusable procedure or automation boundary
- no raw prompt, transcript, or tool-log dependency
- rollback or disable posture for any automation proposal
- operator approval before standing automation

Phase 2 may trigger candidate review after either:

- structural recurrence across successful traces or failures
- one explicit operator ask plus one successful manual run

The model reviewer decides whether those traces are semantically similar and
reusable. Deterministic code must not use keyword/topic overlap, title
similarity, scores, or telemetry counts as final candidate authority.

### Third-party candidates

- `skill-vetter`
- bounded local evaluation
- install vs inspire vs reject recommendation
- operator approval

## Outcome contract

Allowed outcomes:

- `install`
- `inspire`
- `reject`

## Meaning

### `install`

The candidate is fit for direct installation after the required checks and any
needed approval for its risk tier and scope.

### `inspire`

The candidate should not be installed directly.

Instead the next artifact should be:

- a repo-owned project spec or candidate draft

### `reject`

The candidate should not proceed through that path.

## Promotion note

Internal candidates should promote through the autonomy ladder and risk policy
defined by the Skills System project.

That means:

- repo-local or workspace-local bounded scopes come before broad enablement
- low-risk limited-scope promotion may later proceed without human approval if
  tests, evals, resolver checks, check-resolvable-style report, package E2E,
  vetting, and canary are green
- broad or global enablement, including broad Codex rollout, stays explicitly
  approval-gated
- workflow automation should still declare trigger, scope, disable path, and
  evidence before any live enablement

## Usage-based self-improvement

Usage feedback, dismissals, successful runs, failed runs, operator corrections,
and validation failures may create bounded review packets. The model reviewer
may propose:

- add eval fixtures
- patch or clarify `SKILL.md`
- update trigger descriptions
- merge duplicate skills
- demote or retire unused/bad candidates
- keep current behavior with no action

Deterministic code may run the resulting gates and apply explicit approved
lifecycle state. It must not infer semantic usefulness or improvement directly
from feedback counts or usage metrics.
