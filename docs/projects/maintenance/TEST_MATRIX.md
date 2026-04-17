---
summary: "Compact QA matrix for bounded maintenance sweeps."
title: "Maintenance Test Matrix"
---

# Maintenance Test Matrix

## Purpose

Define the compact QA inventory for maintenance sweeps, including profile,
approval class, pass/fail criteria, and stop conditions.

## Global sentinel checks

- repo status is understood before and after the packet
- runtime listeners and active containers match the documented live system
- path and ownership assumptions match the current deployment shape
- stale sentinels are diagnosed before being treated as regressions

## Test profiles

- `A — Docs / Structure`
  - doc placement, path references, project-pack compliance, ownership checks
- `B — Workflow / Config`
  - scripts, generated artifacts, cron payloads, non-delivery workflow behavior
- `C — Full Regression / Runtime-Sensitive`
  - runtime sentinels, ingress, UI/manual acceptance, controlled delivery when
    explicitly approved

## Risk / approval classes

- `safe automatic`
  - read-only status checks
  - path and reference checks
  - repo-structure checks
- `caution`
  - scripts that write expected artifacts
  - cron reruns that affect internal sessions
  - sync or update steps that should not deliver externally
- `manual approval`
  - Telegram delivery
  - any external outbound send
  - human UI/manual acceptance checks

## Surface inventory

- OpenClaw runtime
- webhook-gateway ingress
- host ops scripts and generated artifacts
- daily and weekly operator-review support lane
- weekly maintenance debt guard
- UI and session selector

## Pass / fail criteria

- runtime passes when the active runtime and readiness signals match the
  documented deployment
- workflow passes when expected artifacts are produced without unrelated repo
  dirtiness
- review-support passes when prep inputs refresh, review sessions run, and sync
  or delivery steps behave as intended
- maintenance passes when the bounded packet stays within scope and verifies the
  touched surface honestly

## Stop conditions

- required runtime evidence is missing
- a documented live endpoint behaves like a dead or stale path
- an intended non-delivery packet triggers delivery
- repo dirtiness appears outside the packet's allowed artifacts
- a stale sentinel and a real regression cannot yet be distinguished
