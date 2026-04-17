---
summary: "Inventory and classification of roadmap-like surfaces that still carry project intent."
title: "Roadmap Surface Inventory"
---

# Roadmap Surface Inventory

This inventory tracks roadmap-like surfaces outside canonical project workspaces
and records where each one belongs in the revised topology.

## Classification legend

- `existing_project_workspace_target`
- `new_project_workspace_required`
- `system_level_control_doc`
- `roadmap_idea_holding_area`
- `archive_history`

## Inventory

| Surface                                             | Carries                                                   | Classification                   | Target                                                                                                  | Notes                                                               |
| --------------------------------------------------- | --------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `VISION.md`                                         | product direction, priorities, non-goals                  | `system_level_control_doc`       | stays in place; roadmap detail extracted to `docs/system/roadmap-ideas.md` and `docs/system/roadmap.md` | Vision remains global control prose, not a project workspace        |
| `CONTRIBUTING.md` current focus                     | current focus and maintainer-growth signals               | `system_level_control_doc`       | stays in place; roadmap detail extracted to `docs/system/roadmap-ideas.md` and `docs/system/roadmap.md` | Contributor guidance stays public and high-level                    |
| `docs/refactor/qa.md`                               | QA program architecture and refactor history              | `new_project_workspace_required` | `docs/projects/qa-program/`                                                                             | Detailed program content now deserves a canonical project workspace |
| `qa/frontier-harness-plan.md`                       | QA harness tuning and execution sequencing                | `new_project_workspace_required` | `docs/projects/qa-program/`                                                                             | Operational QA program plan, not just a loose idea                  |
| `qa/new-scenarios-2026-04.md`                       | scenario expansion backlog with concrete candidates       | `new_project_workspace_required` | `docs/projects/qa-program/`                                                                             | Project-level backlog detail                                        |
| loose product priorities extracted from `VISION.md` | future product themes without bounded execution shape yet | `roadmap_idea_holding_area`      | `docs/system/roadmap-ideas.md`                                                                          | Preserve detail without spawning weak projects                      |
| maintainer funnel signals in `CONTRIBUTING.md`      | internal process direction                                | `roadmap_idea_holding_area`      | `docs/system/roadmap-ideas.md`                                                                          | Not an active project workspace today                               |

## Resulting actions in this slice

1. Create `docs/system/roadmap-ideas.md`
2. Create `docs/projects/qa-program/`
3. Reduce `docs/system/roadmap.md` to a pointer/control index
4. Rewrite migrated QA planning docs so they point to the canonical project
   workspace instead of remaining parallel planning roots

## Search sweep note

A broader repo search was also used to detect extra `roadmap`, `current focus`,
and `future work` references outside `docs/projects/` and `docs/system/`.

The additional hits were either:

- public product docs
- code or test strings
- example content
- non-project operational docs

They were intentionally not promoted into this inventory because they do not
currently carry internal project-intent ownership.
