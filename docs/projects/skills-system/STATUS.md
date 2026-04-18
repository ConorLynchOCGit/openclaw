---
summary: "Current status for the Skills System project."
title: "Skills System Status"
---

# Skills System Status

## Overall

State: `canonization_and_formal_skill_vetting_active`

The repo now has a first-class canonical project for the skill system.

The current outcomes are:

- a canonical project home now exists under `docs/projects/skills-system/`
- Skill Vetting now has a durable workstream under this project
- a bundled repo-owned `skill-vetting` skill now exists
- the bundled `clawhub` skill is being normalized around two distinct lanes:
  - native OpenClaw search/install/update when available
  - quarantine-only acquisition for third-party review
- the host now has `clawhub` available on `PATH`
- bounded proof now exists for:
  - `clawhub search "task-progress-stream"`
  - quarantine acquisition of `task-progress-stream` into
    `/tmp/openclaw-skill-vetting/...`

## Current judgment

The biggest missing skill-system capability was not “more skills.”

It was the lack of one explicit system lane for deciding whether an external
skill should be:

- installed
- treated as inspiration only
- or rejected

That gap is now being closed as a project, a workstream, and a repo-owned
skill surface.

## Remaining work after this slice

- richer operator-facing review artifacts
- stronger integration with future agent-pack and allowlist policy work
