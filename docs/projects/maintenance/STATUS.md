---
summary: "Current status for the maintenance workspace."
title: "Maintenance Status"
---

# Maintenance Status

## Overall

State: `active`

The maintenance lane now has a canonical project workspace because the live
weekly maintenance guard depends on explicit control inputs.

## Confirmed current state

- the weekly maintenance guard is live in OpenClaw-native cron
- the debt register and QA matrix are the main durable control inputs for that
  job
- those control inputs previously survived only in the legacy workspace
- the canonical repo now owns the active maintenance control surface

## Immediate next move

- keep the debt register current
- keep the QA matrix aligned with the real maintenance packet bar
- treat broad refactor pressure as an explicit follow-on, not implicit cleanup
