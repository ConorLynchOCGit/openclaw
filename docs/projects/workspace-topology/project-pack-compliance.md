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
| `agent-foundation`    | compliant | none    |
| `build-performance`   | compliant | none    |
| `channel-identity`    | compliant | none    |
| `deployment-topology` | compliant | none    |
| `github`              | compliant | none    |
| `intake-routing`      | compliant | none    |
| `live-app-patches`    | compliant | none    |
| `maintenance`         | compliant | none    |
| `model-memory`        | compliant | none    |
| `operator-experience` | compliant | none    |
| `ops`                 | compliant | none    |
| `qa-program`          | compliant | none    |
| `roles`               | compliant | none    |
| `skills-system`       | compliant | none    |
| `turborepo`           | compliant | none    |
| `web-stack`           | compliant | none    |
| `workflows`           | compliant | none    |
| `workspace-topology`  | compliant | none    |

## Notes

- nested workstreams such as `docs/projects/skills-system/skill-vetting/` are
  not separate top-level registry entries
- they may keep local packs when they stay owned by their parent project
- the 2026-04-24 topology reconciliation closed the last base-pack gap by
  adding `docs/projects/operator-experience/specs/index.md`
