---
summary: "Source-of-truth package and adapter contract for OpenClaw and Codex skills."
title: "Cross-Runtime Skill Packaging"
---

# Cross-Runtime Skill Packaging

## Objective

Keep one source-of-truth skill package while making the result installable in
both OpenClaw and Codex.

## Install targets

- OpenClaw workspace skills
- OpenClaw shared skills
- OpenClaw plugin skills
- Codex `$CODEX_HOME/skills`
- optional Codex `agents/openai.yaml`

## Packaging rules

- the main `SKILL.md` body should stay aligned across runtimes
- runtime-specific metadata must stay isolated from the shared contract
- no unsafe wrappers should be introduced only to make a runtime accept the
  skill
- install path recording is mandatory
- compatibility checks must run per target runtime
- discovery verification must prove the installed package is visible in both
  runtimes
- provenance must be preserved across adapters
- destination writes must respect the
  [Skill Destination Capability Matrix](/projects/skills-system/specs/skill-destination-capability-matrix)

## Non-goals

- no forked skill logic by runtime unless a real compatibility boundary exists
- no silent divergence between the OpenClaw and Codex versions of the same
  skill
