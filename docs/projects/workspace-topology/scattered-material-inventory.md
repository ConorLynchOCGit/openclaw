---
summary: "Classification of project-like material that still lives outside canonical roots."
title: "Scattered Material Inventory"
---

# Scattered Material Inventory

This inventory covers project-like or topology-relevant material that still
lives outside canonical roots.

It does not try to reclassify ordinary public product docs.

## Classification rules

- `system_control_doc`
- `project_workspace_doc`
- `agent_workspace_doc`
- `qa_asset`
- `public_product_doc`
- `package_local_doc`
- `archive_candidate`
- `leave_in_place`

## Classified inventory

| Path                          | Classification          | Action                 | Notes                                                                                                      |
| ----------------------------- | ----------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------- |
| `VISION.md`                   | `system_control_doc`    | leave in place         | High-level product vision. Keep at repo root and cross-link from `docs/system/roadmap.md` later if needed. |
| `CONTRIBUTING.md`             | `system_control_doc`    | leave in place         | Public contributor guidance. Roadmap intent now points to canonical internal roadmap surfaces.             |
| `docs.acp.md`                 | `system_control_doc`    | leave in place         | Root-level control/protocol surface. Not a project workspace.                                              |
| `qa/README.md`                | `qa_asset`              | leave in place         | Canonical QA asset root explainer.                                                                         |
| `qa/scenarios.md`             | `qa_asset`              | leave in place         | QA pack compatibility surface.                                                                             |
| `qa/frontier-harness-plan.md` | `project_workspace_doc` | migrated to QA Program | Canonical project home is now `docs/projects/qa-program/`.                                                 |
| `qa/new-scenarios-2026-04.md` | `project_workspace_doc` | migrated to QA Program | Canonical project home is now `docs/projects/qa-program/`.                                                 |
| `docs/refactor/qa.md`         | `project_workspace_doc` | migrated to QA Program | Canonical project home is now `docs/projects/qa-program/`.                                                 |
| `.agents/maintainers.md`      | `agent_workspace_doc`   | leave in place         | Machine/runtime-adjacent maintainer guidance, not a `docs/agents/` durable pack.                           |
| `AGENTS.md`                   | `package_local_doc`     | leave in place         | Repo-local operating contract.                                                                             |
| `docs/AGENTS.md`              | `package_local_doc`     | leave in place         | Docs-tree local operating contract.                                                                        |
| `extensions/AGENTS.md`        | `package_local_doc`     | leave in place         | Extensions-tree local operating contract.                                                                  |
| `scripts/AGENTS.md`           | `package_local_doc`     | leave in place         | Scripts-tree local operating contract.                                                                     |
| `ui/AGENTS.md`                | `package_local_doc`     | leave in place         | UI-tree local operating contract.                                                                          |

## Immediate migration candidates

These are the first obvious candidates for future extraction into canonical
project workspaces:

1. deployment-topology extraction if that work grows beyond narrow policy and
   inventory follow-ups

## Explicit non-goals for this sprint

- moving public product docs into project workspaces
- moving QA executable assets out of `qa/`
- populating `docs/agents/` durable packs
