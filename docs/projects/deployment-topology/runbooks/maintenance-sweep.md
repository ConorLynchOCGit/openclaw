---
summary: "Canonical runbook for bounded maintenance packets."
title: "Maintenance Sweep"
---

# Maintenance Sweep

## Purpose

Define the callable maintenance process for bounded cleanup, normalization,
verification, and closeout work.

## Standard sequence

1. `scan`
2. `plan`
3. `execute`
4. `verify`
5. `close`

## Rules

- one packet should have one primary purpose
- classify before acting
- keep destructive cleanup out of default maintenance packets
- do not broaden a maintenance packet into unrelated restoration work

## Risk classes

- `low`
  - docs, file placement, archive relocation, ordinary repo hygiene
- `medium`
  - script-path changes, cron payload updates, generated artifact intake
- `high`
  - runtime-sensitive behavior, delivery surfaces, public ingress, live state
    with user-facing impact

## Control inputs

- [Maintenance Debt Register](/projects/maintenance/DEBT_REGISTER)
- [Maintenance Test Matrix](/projects/maintenance/TEST_MATRIX)

## Output rule

Each packet should end with:

- exact scope touched
- exact verification run
- exact remaining debt or follow-up
