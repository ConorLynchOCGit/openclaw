---
summary: "Current slice for the Skills System project."
title: "Skills System Current Slice"
---

# Current Slice

## Slice

`phase2-proactivity-user-facing-briefs`

## Goal

Repair the presentation boundary between internal proactivity ledger state and
human-facing decision surfaces before Milestone 4 skill eval work begins.

This slice establishes:

- one typed `UserFacingProactivityBrief` between rich ledger state and visible
  cards
- one shared primary-copy contract for chat cards, inbox rows, heartbeat
  context, and handoff
- one quality gate that rewrites or demotes noisy transformation titles and
  malformed reverse prompts
- one skill-candidate presentation model that distinguishes new skills,
  existing-skill enhancements, and merge/extend candidates from diagnostics
- one collapsed-detail rule for why-now, evidence, provenance, source refs,
  ids, timestamps, limitations, and presentation diagnostics

## Current outcome

- proactive ledgers remain rich internal state
- primary user-facing cards become concise decision briefs
- `why now` and provenance move behind details instead of competing with the
  next useful action
- skill cards explain the capability intent rather than echoing prompt
  fragments
- malformed reverse prompts become diagnostics or repair signals instead of
  user-facing clutter

## Current judgment

The acceptance gate for this slice is decision clarity, not card completeness.

The correct output is one canonical proactive item that preserves all provenance
and diagnostics internally while rendering one short, high-signal decision
surface in chat, inbox, heartbeat, and handoff.
