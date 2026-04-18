---
summary: "Current status for the Skill Vetting workstream."
title: "Skill Vetting Status"
---

# Skill Vetting Status

## Overall

State: `formalized_quarantine_review_with_operator_artifacts`

The system now has a durable review lane for external skills.

Current delivered outputs:

- canonical docs under `docs/projects/skills-system/skill-vetting/`
- a bundled repo-owned `skills/skill-vetting/` skill
- explicit search/acquisition separation
- explicit quarantine contract
- explicit install / inspire / reject outcomes
- explicit operator-facing report contract
- runtime surface proof matrix
- canonical example report artifact
- local proof that:
  - `clawhub search "task-progress-stream"` returns live marketplace results
  - `skills/skill-vetting/scripts/quarantine_clawhub_skill.sh task-progress-stream`
    acquires into `/tmp/openclaw-skill-vetting/...`
  - `docker exec openclaw-runtime openclaw skills search "task-progress-stream"`
    returns live marketplace results

## Current risk posture

External skills remain untrusted by default.

The current review lane is conservative on purpose:

- search may be available without acquisition
- acquisition may be available without installation approval
- installation is never the first step

## Immediate next proof needs

- verify runtime search availability on the intended host surfaces
- verify quarantine acquisition on the intended host surfaces
- resolve the current runtime-image rebuild blocker so the running container
  also carries baked `/app/docs/projects/skills-system` docs and
  `/app/skills/skill-vetting/SKILL.md`, not only the canonical repo import
  mount
