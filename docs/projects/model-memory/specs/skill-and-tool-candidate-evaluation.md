---
summary: "Evaluation and approval contract for internal and third-party skill or tool candidates."
title: "Skill And Tool Candidate Evaluation"
---

# Skill And Tool Candidate Evaluation

## Objective

Define how internal and third-party skill, tool, and workflow candidates are
judged before promotion.

Candidate discovery may be proactive. The planner may create and surface
candidate artifacts when repeated evidence crosses threshold, especially through
heartbeat and locally relevant turns. Promotion remains approval-gated.

## Required checks

### Internal candidates

- representative replay
- contract validation
- safety and permission review
- source authority review
- operator approval

### Workflow candidates

- repeated successful workflow evidence
- bounded reusable procedure or automation boundary
- no raw prompt, transcript, or tool-log dependency
- rollback or disable posture for any automation proposal
- operator approval before standing automation

Phase 2 creates workflow, skill, or tool candidates after either:

- three similar successful traces
- one explicit operator ask plus one successful manual run

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

The candidate is fit for direct installation after approval.

### `inspire`

The candidate should not be installed directly.

Instead the next artifact should be:

- a repo-owned project spec or candidate draft

### `reject`

The candidate should not proceed through that path.

## Promotion note

Under the current skills posture, approved install should be treated as live
availability rather than staged quarantine.

Internal candidates promote repo-local or workspace-local first. Global Codex
skill promotion requires a second explicit approval.

Workflow automation approval should be treated the same way: if approved and
enabled, it is real behavior. Therefore the review artifact must clearly state
the trigger, scope, disable path, and evidence before approval.
