---
summary: "Current live proof matrix for native OpenClaw skills search, ClawHub, and quarantine acquisition."
title: "Skill Vetting Runtime Surface Proof"
---

# Skill Vetting Runtime Surface Proof

This document records the current live proof for the search and quarantine
surfaces used by Skill Vetting.

## Observed surfaces

| Surface                  | Command                                                                                             | Result                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| host shell               | `command -v openclaw`                                                                               | missing                                                                 |
| host shell               | `command -v clawhub`                                                                                | `/usr/bin/clawhub`                                                      |
| host shell               | `clawhub search "task-progress-stream"`                                                             | returns live marketplace results                                        |
| host shell               | `skills/skill-vetting/scripts/quarantine_clawhub_skill.sh task-progress-stream`                     | quarantine acquisition succeeds under `/tmp/openclaw-skill-vetting/...` |
| runtime container        | `docker exec openclaw-runtime command -v openclaw`                                                  | `/usr/local/bin/openclaw`                                               |
| runtime container        | `docker exec openclaw-runtime openclaw skills search "task-progress-stream"`                        | returns live marketplace results                                        |
| runtime container import | `test -d /home/node/.openclaw/workspace/imports/product_live/content/docs/projects/skills-system`   | canonical repo docs present through import mount                        |
| runtime container import | `test -f /home/node/.openclaw/workspace/imports/product_live/content/skills/skill-vetting/SKILL.md` | bundled skill source present through import mount                       |
| runtime container        | `docker exec openclaw-runtime command -v clawhub`                                                   | missing                                                                 |

## Current live judgment

The search and acquisition lane is split across surfaces:

- native trusted `openclaw` search is currently proven inside the runtime
  container
- `clawhub` search and quarantine acquisition are currently proven on the host
  shell
- the runtime container does not currently expose `clawhub`

## Additional runtime drift observed

At review time, the running `openclaw-runtime` container did not yet contain:

- `/app/docs/projects/skills-system/`
- `/app/skills/skill-vetting/SKILL.md`

while it did contain:

- `/app/skills/clawhub/SKILL.md`

That is repo-to-runtime drift, not a documentation assumption.

## Current rollout blocker

Attempted runtime image refreshes in this sprint did not complete cleanly.

Observed behavior:

- `docker compose build openclaw-gateway`
- `docker build -t openclaw:local .`

both advanced through the TypeScript and UI build phases, then stalled in the
`runtime-assets` finalize stage after `pnpm prune --prod` and
`node scripts/postinstall-bundled-plugins.mjs`.

The direct consequences were:

- `openclaw-runtime` stayed healthy
- `openclaw:local` did not advance to a fresh image ID
- `/app/docs/projects/skills-system/` remained absent
- `/app/skills/skill-vetting/SKILL.md` remained absent

Current honest posture:

- canonical repo surfaces are proven via the runtime import mount
- native `openclaw skills search` is proven inside the runtime container
- baked `/app` image freshness for the new `skills-system` docs and
  `skill-vetting` skill remains blocked on the runtime-image build path

## Consequence for Skill Vetting

The correct current posture is:

- native search proof may come from the runtime container
- quarantine review acquisition currently uses host `clawhub`
- reports must record the actual surface used rather than pretending one
  uniform runtime exists
