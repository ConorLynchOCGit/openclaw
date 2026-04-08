# Full Ingestion Control Plane

## Purpose

Define and now record the landing of one ingestion control plane for all six
landed families so transcript capture and tool-side candidate submission stop
carrying separate family resolution systems.

## Landed status

This slice is now live.

The repo now has:

- one shared ingestion substrate for all six landed families
- one transcript/tool submission decision flow
- shared canonical match conversion across transcript and tool callers
- shared family-resolution entry points for:
  - deterministic parsing
  - semantic parsing
  - approved phrase matching where eligible
  - correction-intent normalization
  - provenance emission

## What landed structurally

The shared control plane now serves:

- `extensions/memory-middleware/src/ordinary-turn-auto-capture.ts`
- `extensions/memory-middleware/src/tools/candidate-submit.ts`
- `extensions/memory-middleware/src/memory-ingestion-resolver.ts`

The workflow-family cluster remains on the same resolver, but response style,
project facts, and recurring procedures now route through that same substrate
instead of keeping separate transcript/tool resolution stacks.

## What remains intentionally family-specific

- response-style forget semantics
- project-fact stricter truth posture
- recurring-procedure clear named-checklist recognition
- workflow-family lesson-family mapping where still meaningful
- phrase eligibility
- different review modes where justified

## What this slice deleted or reduced

- separate response-style transcript/tool parsing stacks
- separate project-fact transcript/tool parsing stacks
- separate recurring-procedure transcript/tool parsing stacks
- duplicated canonical match conversion between transcript and tool callers

## What this slice did not replace

- recurring-procedure staged substrate redesign
- correction-policy cleanup
- proof / registry / boundary cleanup

## Proof status

This slice now proves:

1. transcript and tool submission for the same family share the same canonical
   ingestion decision path
2. deterministic parsing, phrase matching, semantic parsing, and correction
   normalization preserve behavior
3. false-positive protection still holds for:
   - response style
   - project facts
   - recurring procedures

## Non-goals

- broadening capture scope
- enabling new families
- enabling self-improving capture
