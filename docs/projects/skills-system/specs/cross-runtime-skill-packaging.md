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
- trigger/resolver verification must prove the package is reachable in each
  declared runtime by user-language trigger fixtures
- package E2E must prove the package can run or be considered in each declared
  runtime/canary target without silently preferring an unrelated skill
- rollback or disable path must be recorded per runtime target
- provenance must be preserved across adapters
- destination writes must respect the
  [Skill Destination Capability Matrix](/projects/skills-system/specs/skill-destination-capability-matrix)
- cross-runtime install is approval-gated unless a later low-risk autonomy
  policy explicitly authorizes the exact target scope
- runtime-specific drift creates a model-reviewed repair or compatibility
  candidate; deterministic code must not fork semantic skill behavior just to
  make one runtime pass

Milestone 3 draft rule:

- the first generated package is a bounded draft package only
- Milestone 3 writes only to allowed workspace-local draft targets
- Codex packaging and broader cross-runtime install remain later milestones
- draft package metadata must record why the selected target was allowed and
  why broader runtime targets were not used

## Non-goals

- no forked skill logic by runtime unless a real compatibility boundary exists
- no silent divergence between the OpenClaw and Codex versions of the same
  skill
- no broad cross-runtime install without eval, resolver, E2E, canary, rollback,
  destination-authority, and approval/autonomy gates
