---
summary: "Audit of required project base-pack compliance for registered project workspaces."
title: "Project Pack Compliance"
---

# Project Pack Compliance

This audit checks every currently registered project workspace against the
required base pack:

- `index.md`
- `STARTUP.md`
- `STATUS.md`
- `CURRENT_SLICE.md`
- `DECISIONS.md`
- `roadmap.md`
- `specs/index.md`

## Current registered-project results

| Project               | Result    | Missing |
| --------------------- | --------- | ------- |
| `workspace-topology`  | compliant | none    |
| `agent-foundation`    | compliant | none    |
| `model-memory`        | compliant | none    |
| `deployment-topology` | compliant | none    |
| `qa-program`          | compliant | none    |
| `maintenance`         | compliant | none    |
| `turborepo`           | compliant | none    |
| `intake-routing`      | compliant | none    |
| `skills-system`       | compliant | none    |

## Notes

- nested workstreams such as `docs/projects/skills-system/skill-vetting/` are
  not separate top-level registry entries
- they may keep local packs when they stay owned by their parent project
