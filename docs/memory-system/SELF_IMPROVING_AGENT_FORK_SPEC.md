# Self-Improving-Agent Fork Specification

## Purpose

This document defines the reduced-profile subset of
`self-improving-agent` that may be preserved if the repo later forks or adapts
the upstream skill.

It is not an installation record and it does not authorize runtime use today.

## Design goal

Preserve the useful learning-oriented parts of the skill while removing
anything that would let it act like:

- the system of record for memory
- a policy-writing surface
- a hook-driven autonomous workflow
- a skill-promotion authority

The reduced profile exists to support candidate-only outputs that can later
flow through the custom memory middleware plugin base and the same generalized
lesson clustering or review pipeline used by native capture.

## Allowed outputs

If the repo later forks or adapts the skill, it may emit only:

- candidate learnings
- correction capture suggestions
- procedure suggestions
- improvement notes

### Candidate learnings

Short candidate observations derived from repeated work, mistakes, or feedback.

### Correction capture suggestions

Suggestions that a correction or lesson learned should be reviewed and possibly
stored as feedback-oriented memory.

### Procedure suggestions

Draft suggestions that a repeated successful pattern may be worth validating as
an eventual procedure candidate.

### Improvement notes

Bounded notes about process or agent improvement that remain advisory until
reviewed.

## Forbidden outputs

The reduced profile must not emit or treat as authoritative:

- approved memory
- approved procedures
- approved policies
- installed skills
- autonomous follow-through tasks
- hook-driven reminders as default behavior

It must also not present its own outputs as if they were already reviewed,
approved, or durable.

## Allowed write targets

Before the plugin base exists:

- no repo-authoritative write targets are allowed

After the plugin base exists:

- candidate-only ingestion paths exposed by the custom memory middleware plugin
- any future review queue or candidate-capture interface explicitly created for
  this purpose

The reduced profile should not create a parallel review or approval queue.
Its outputs should merge into the same generalized lesson pipeline defined in:

- `docs/memory-system/specs/self-improving-capture-integration.md`

The intended target class is:

- candidate-memory capture
- feedback-candidate capture
- procedure-candidate suggestion intake
- improvement-note intake

## Forbidden write targets

The reduced profile must not write directly to:

- `AGENTS.md`
- `CLAUDE.md`
- `TOOLS.md`
- `SOUL.md`
- `MEMORY.md`
- policy files
- approval logs
- skill-installation directories
- `.learnings/` as a durable system of record
- any canonical database table or file outside an explicit candidate-only seam

## Required review gates

Every output from the reduced profile must pass through repo-native review
before promotion.

### Gate 1: candidate-only capture

The output enters the system only as candidate material.

### Gate 2: memory or procedure review

A repo-native reviewer, policy gate, or later middleware review tool must
decide whether the candidate is:

- rejected
- retained as candidate only
- promoted into reviewed memory
- promoted into a validated procedure path

### Gate 3: policy check

Any output that touches durable behavior, memory promotion, or downstream skill
promotion must remain subject to policy review.

### Gate 4: no direct installation authority

The reduced profile must never directly authorize:

- skill approval
- skill installation
- hook activation
- autonomous background behavior

## Mapping into the future plugin base

The reduced profile should map into the future plugin base through explicit
candidate-only interfaces.

### Candidate learnings

Map to:

- candidate memory capture

Intended future destination:

- `memory_capture` in candidate posture

### Correction capture suggestions

Map to:

- feedback-oriented candidate memory capture

Intended future destination:

- candidate memory plus later review

### Procedure suggestions

Map to:

- draft procedure-candidate intake

Intended future destination:

- `procedure_candidate_create` or equivalent candidate path

### Improvement notes

Map to:

- bounded candidate notes attached to session or project context

Intended future destination:

- candidate-only session or project improvement surfaces defined by the plugin
  base

## Required removals from upstream behavior

Any later fork or adaptation must remove or neutralize:

- direct `.learnings/` durability as the primary storage model
- direct promotion instructions into `AGENTS.md`, `TOOLS.md`, `SOUL.md`,
  `MEMORY.md`, or similar control files
- optional hook enablement as part of the default workflow
- skill-extraction workflows as a default or adjacent behavior
- instructions that imply the skill is the memory authority
- instructions that blur candidate suggestions and approved memory

## Required retained behavior

If the repo later adapts the skill, retain only the behavior that supports:

- candidate insight generation
- correction suggestion generation
- procedure-candidate suggestion generation
- improvement-note generation

All retained behavior must stay subordinate to repo-native review and policy
gates.

## Minimal reduced-profile contract

A later fork or adaptation should satisfy this contract:

1. reads only bounded evaluation inputs
2. emits only candidate outputs
3. performs no direct authoritative writes
4. activates no hooks by default
5. installs no other skills
6. changes no policy or control files
7. treats the custom memory middleware as the future system of record

## Recommendation for later implementation

If adoption is revisited after the plugin base exists:

- do not install the raw upstream skill
- implement a reduced-profile fork or adaptation only
- wire it only to candidate-only plugin-base seams
- keep it in limited-use posture until those seams and review gates are real

## Install state for this slice

`self-improving-agent` is **not installed** in this slice.

## Implementation notes

This spec is meant to be concrete enough for a later fork or adaptation slice.

Still pending:

- plugin base implementation
- any broader packaging decision beyond the now-implemented repo-native
  candidate-only ingestion interface
- final decision on exact reduced-profile packaging form
