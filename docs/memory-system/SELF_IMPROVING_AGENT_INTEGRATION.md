# Self-Improving-Agent Integration

## Purpose

This document defines how `self-improving-agent` should fit into the
memory-system architecture for this repo.

It is an integration plan and guardrail document, not an installation record or
runtime implementation file.

## Intended role

`self-improving-agent` is the first intended external learning-oriented skill
for this effort.

Its intended job is to accelerate bounded learning-oriented analysis around:

- candidate learnings
- correction capture
- procedure suggestions
- improvement notes

It is not the system of record for memory.

## What job it is intended to do

`self-improving-agent` is intended to help with:

- proposing candidate learnings from observed work
- surfacing likely corrections from repeated mistakes or validated feedback
- suggesting procedure drafts from repeated successful patterns
- generating improvement notes for later review

These outputs are advisory inputs into the memory-system promotion pipeline.

## What job it is not allowed to do

`self-improving-agent` must not:

- become the canonical durable memory store
- replace `extensions/memory-core`
- replace `extensions/memory-lancedb`
- replace the planned custom middleware under `extensions/memory-middleware`
- overwrite policy memory directly
- bypass review, vetting, or approval gates
- introduce broad autonomous follow-through
- install or activate other skills on its own

## Relationship to the memory architecture

### Candidate memory

`self-improving-agent` may help propose candidate learnings that later become:

- candidate memory
- feedback-oriented candidate memory
- procedure-adjacent notes

It should not directly mark those objects as approved durable memory.

### Feedback memory

`self-improving-agent` may help identify:

- validated corrections
- repeated mistakes
- possible feedback capture opportunities

It should not directly rewrite feedback memory or treat its own interpretation
as final truth.

### Procedure distillation

`self-improving-agent` may suggest:

- candidate procedures
- refinement notes for procedures
- repeated-success patterns worth validating

It should not directly promote procedure suggestions into validated procedures
or skill candidates without the normal review path.

## Intended outputs

The intended outputs from `self-improving-agent` in this architecture are:

### Candidate learnings

Structured candidate observations that may later be reviewed into durable
memory.

### Correction capture

Suggested corrections or lessons learned that may later be reviewed as feedback
memory.

### Procedure suggestions

Draft procedure candidates derived from repeated or high-signal work patterns.

### Improvement notes

Bounded notes about where the agent or workflow could improve without claiming
durable approval by itself.

## Why it is an accelerator instead of the canonical memory substrate

`self-improving-agent` is an accelerator because:

- it helps generate candidate insights faster
- it is useful for suggestion and distillation
- it does not provide the repo's authoritative provenance, policy, or review
  model

The canonical memory substrate remains:

- the existing repo memory architecture today
- the planned custom middleware plus structured backend later

That distinction matters because:

- provenance must remain inspectable
- policy gating must remain explicit
- durable memory approval must remain reviewable
- external skill output must remain subordinate to repo-native control

## Guardrails

### No direct policy overwrite

`self-improving-agent` must not directly overwrite policy memory or redefine
approval rules.

### No sole durable memory store

`self-improving-agent` must not become the only long-term store for learnings,
procedures, or corrections.

### No bypass of vetting or review

Its outputs must go through the normal review and promotion path before they are
treated as approved durable knowledge or reusable behavior.

### No broad autonomous behavior

It must not be used to introduce broad autonomous improvement loops, automatic
skill procurement, or open-ended self-modification.

### No memory-slot takeover

It must not claim the exclusive `memory` plugin slot or replace the current
repo-native memory backends by default.

## Expected integration posture

If integrated later, `self-improving-agent` should sit in a bounded supporting
role:

1. observe or receive bounded inputs
2. generate candidate learnings or suggestions
3. hand those suggestions into repo-native review flow
4. allow human or policy-gated promotion decisions

This means its outputs should feed:

- candidate memory capture
- feedback review
- procedure drafting
- improvement-note tracking

After the generalized-learning pivot, reduced-profile outputs should also feed
the same normalized lesson clustering and auto-review pipeline used by
repo-native capture rather than a separate review system.

They should not directly feed:

- approved policy changes
- autonomous execution expansion
- direct normal-use approval of external skills

## Interaction with procurement governance

`self-improving-agent` remains subject to the procurement workflow in
`docs/memory-system/SKILL_PROCUREMENT.md`.

That means:

- Skill Vetter remains mandatory before normal approval
- installation is still separate from documentation
- any actual enablement must respect lifecycle state and install blockers

## Current execution posture

In the current repo state, `self-improving-agent` is documented only.

This slice does not:

- install `self-improving-agent`
- approve it for limited use
- approve it for normal use
- connect it to runtime flows

## Implementation notes

Defined in this slice:

- allowed role for `self-improving-agent`
- prohibited role for `self-improving-agent`
- expected outputs
- guardrails against memory-substrate takeover

Still pending:

- actual vetting record for `self-improving-agent`
- any installation path
- any limited-use approval
- any runtime integration
