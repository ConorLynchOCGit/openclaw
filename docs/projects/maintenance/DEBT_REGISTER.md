---
summary: "Active bounded maintenance debt inventory used by the weekly maintenance guard."
title: "Maintenance Debt Register"
---

# Maintenance Debt Register

## Purpose

Track open bounded maintenance follow-ups without turning maintenance into a
parallel roadmap.

## Fields

- `id`
- `category`
- `status`
- `risk`
- `owner_or_surface`
- `description`
- `next_action`
- `notes`

## Status values

- `open`
- `planned`
- `in_progress`
- `blocked`
- `deferred`
- `closed`

## Category values

- `content-alignment`
- `ui`
- `delivery`
- `ownership`
- `retention`
- `runbook`
- `qa-sentinel`
- `repo-hygiene`

## Current open items

### MD-013

- `id`: `MD-013`
- `category`: `repo-hygiene`
- `status`: `open`
- `risk`: `low`
- `owner_or_surface`: `CLI session routing`
- `description`: CLI-originated direct Main sessions still derive a
  non-canonical `unknown` channel token because the CLI does not carry a real
  source transport channel.
- `next_action`: decide whether CLI-originated direct sessions should keep the
  current `unknown` token or move to an explicit synthetic token such as `cli`,
  then apply the narrow session-key update only if that convention is accepted.
- `notes`: this is an ergonomics debt item, not the earlier canonical-Main
  precedence bug.

## Historical note

Closed legacy maintenance items remain valid historical evidence in the legacy
workspace and archive surfaces, but this canonical register tracks the live
open debt that still matters operationally.
