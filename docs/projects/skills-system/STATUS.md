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
- the current runtime proof is now explicit:
  - host `clawhub` available
  - runtime-container `openclaw` available
  - host `openclaw` absent
  - runtime-container `clawhub` absent
- bounded proof now exists for:
  - `clawhub search "task-progress-stream"`
  - quarantine acquisition of `task-progress-stream` into
    `/tmp/openclaw-skill-vetting/...`
  - native `openclaw skills search "task-progress-stream"` inside the runtime
    container
- skill-vetting report initialization now writes to the writable operator
  workspace reports tree by default:
  `/root/.openclaw/workspace/docs/projects/skills-system/skill-vetting/reports/`
- canonical skill installation through `host_operator_repo install_skill` has a
  documented shape, validate-only mode, clearer validation errors, and safe
  redacted failure logging
- `openclaw agents skills-status --agent <id> --json` reports discovered
  installed skills and explicitly marks warm-session loaded-state proof as
  unavailable when it cannot be inspected
- ClawHub search output is treated as remote marketplace discovery; local
  `skills info` works after install, and CLI help now says that directly

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
