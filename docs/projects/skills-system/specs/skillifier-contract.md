---
summary: "Contract for the OpenClaw Skillifier scaffold, check, and package builder."
title: "Skillifier Contract"
---

# Skillifier Contract

## Objective

Define the future OpenClaw Skillifier inspired by GBrain and adapted to
OpenClaw/Codex cross-runtime needs.

## Outputs

The Skillifier should eventually produce:

- `SKILL.md`
- optional deterministic scripts
- optional references
- optional assets or templates
- OpenClaw metadata
- Codex compatibility metadata
- eval fixtures
- routing and decisioning fixtures
- compliance tests
- vetting report
- install plan
- rollback plan
- provenance report

## Properly skilled checklist

A skill is "properly skilled" only when all required items for its risk tier
exist:

- skill contract exists
- trigger and use cases are defined
- anti-patterns are defined
- safety boundaries are defined
- deterministic logic is script-backed where appropriate
- tests exist for deterministic logic
- evals exist for model judgment
- routing and decisioning cases exist
- compliance test verifies the agent reads `SKILL.md`
- vetting passes for the risk tier
- cross-runtime packaging is valid
- proactivity linkage exists
- rollback plan exists

## Design rules

- keep `SKILL.md` concise and push detailed material into references when needed
- do not generate unsafe wrappers merely to satisfy cross-runtime packaging
- do not package raw session content into examples
- make provenance and rollback first-class outputs, not afterthoughts
- preserve one source-of-truth package even when adapters differ by runtime
