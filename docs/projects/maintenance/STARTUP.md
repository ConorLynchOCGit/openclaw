---
summary: "Startup brief for the maintenance workspace."
title: "Maintenance Startup"
---

# Maintenance Startup

## Mission

Keep recurring maintenance work bounded, auditable, and tied to explicit
control inputs rather than ad hoc cleanup.

## Starting truth

- the live deployment already runs a weekly maintenance guard in an isolated
  Chief session
- that live job has been depending on legacy workspace docs rather than
  canonical repo-owned maintenance inputs
- maintenance work should stay bounded and low-risk by default

## Project outcomes

This workspace should provide:

1. the debt register the live maintenance guard reads
2. the test matrix that constrains maintenance verification
3. the durable workspace-refactor critique that explains why broad cleanup
   should stay incremental

## Success criteria

- recurring maintenance no longer depends on legacy-only control docs
- debt and verification posture are easy to locate
- future maintenance packets can start from explicit canonical inputs

## Non-goals

- turning maintenance into a second roadmap system
- using maintenance as a catch-all for unrelated product work
- broad destructive cleanup under a maintenance label
