---
summary: "General requirement capture, evidence gating, and completion validation discipline for OpenClaw tasks"
read_when:
  - Designing or reviewing multi-step operator tasks
  - Validating whether a task result is actually complete
  - Hardening prompt execution quality across task types
title: "Task Execution Discipline"
---

# Task execution discipline

Use this contract for any structured OpenClaw task where missing one requirement would materially change whether the work is complete.

This is general infrastructure, not a roadmap-only workflow.

## Core rule

Do not treat a fluent answer as proof that the task is complete.

For multi-step or high-stakes work, keep these separate:

1. required work
2. required evidence
3. requested deliverables
4. remaining gaps or blockers

## Requirement capture

Before acting on a long or structured prompt, extract a short checklist of:

- hard requirements
- required reading or inspection
- required deliverables

Optional nice-to-haves should be kept separate so they do not dilute the mandatory scope.

## Evidence gating

When a task requires reading, inspection, or validation before acting, record evidence status for each required item.

Use these statuses:

- `complete`
- `partial`
- `blocked`

Interpretation:

- `complete`
  - the source or check was fully covered for the purpose that matters
- `partial`
  - the source was only partly covered, capped, truncated, or otherwise insufficient
- `blocked`
  - the source or check could not be completed

If a required evidence item remains `partial` or `blocked`, do not claim the task is complete.

## Reading rule

- Prefer `read` for workspace-visible files that fit under the adaptive ceiling.
- If `read` is capped or truncated, continue with paging.
- Use `document_read` when proof-grade coverage is required or when the file exceeds the adaptive ceiling.
- A required read is not complete until the evidence is actually complete for the task.

## Completion validation

Before the final response, validate:

- every hard requirement
- every required evidence item
- every requested deliverable

If any required item is still missing, say so explicitly.

Do not smooth over incomplete work with confident prose.

## Operator-visible reporting

For structured tasks, the final response should make these visible:

- what was required
- what evidence was gathered
- what was completed
- what remains uncertain, unmet, or blocked

Good reporting can be concise. It does not need to be verbose to be explicit.

## Dry-run test questions

Use these to test whether a task result is trustworthy:

1. Did the agent separate mandatory requirements from optional material?
2. Did it show evidence for required reading or validation?
3. Did it distinguish complete from partial evidence?
4. Did it check deliverables against the requested list before claiming success?
5. Did it call out remaining gaps directly instead of smoothing them over?
