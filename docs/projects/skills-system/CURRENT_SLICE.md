---
summary: "Current slice for the Skills System project."
title: "Skills System Current Slice"
---

# Current Slice

## Slice

`phase2-skillifier-mvp-scaffold-check-report`

## Goal

Implement the first Skillifier runtime slice by turning canonical
`skill_candidate` records into bounded draft skill packages, reports, and
rollback-safe review artifacts.

This slice establishes:

- one first-class Skillifier draft flow that consumes canonical
  `skill_candidate` ids
- one bounded draft package contract with `SKILL.md`, metadata, provenance,
  rollback, and check reports
- one canonical `skillPackageId` linking candidate, package, and report state
- one destination-aware draft writer that uses allowed workspace-local skill
  paths only
- one shared surfacing contract so draft-ready state appears through the
  existing proactivity queue, inbox, heartbeat, and handoff surfaces

## Current outcome

- turns a live `skill_candidate` into a bounded draft package and review report
- keeps draft generation tied to canonical proactivity ids instead of a
  parallel skill queue
- keeps scaffold inputs distilled and bounded rather than persisting raw
  prompts, transcripts, or tool logs
- keeps destination authority strict: the draft lands only in allowed
  workspace-local draft targets, never by silent repo-main or global skill
  mutation
- keeps the generated draft non-promoted and review-only

## Current judgment

The acceptance gate for this slice is live usefulness and draft reviewability,
not package scaffolding alone.

The correct output is one canonical `skill_candidate` that can be skillified
into one bounded draft package with one stable `skillPackageId`, one
deterministic check/report result, and one clean draft-ready state that appears
through the existing proactivity workflow without auto-installing or promoting
the skill.
