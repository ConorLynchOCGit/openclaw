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

## Results before normalization

| Project               | Result        | Missing      |
| --------------------- | ------------- | ------------ |
| `workspace-topology`  | compliant     | none         |
| `agent-foundation`    | compliant     | none         |
| `deployment-topology` | non-compliant | all files    |
| `qa-program`          | non-compliant | all files    |
| `turborepo`           | compliant     | none         |
| `model-memory`        | non-compliant | `STARTUP.md` |

## Normalization performed in this sprint

- added `docs/projects/deployment-topology/` with the required project pack
- added `docs/projects/qa-program/` with the required project pack
- added `docs/projects/model-memory/STARTUP.md`

## Results after normalization

| Project               | Result    | Missing |
| --------------------- | --------- | ------- |
| `workspace-topology`  | compliant | none    |
| `agent-foundation`    | compliant | none    |
| `deployment-topology` | compliant | none    |
| `qa-program`          | compliant | none    |
| `turborepo`           | compliant | none    |
| `model-memory`        | compliant | none    |
