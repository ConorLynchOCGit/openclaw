---
summary: "Spec for registries that make project and agent topology machine-checkable."
title: "Project And Agent Registries"
---

# Project And Agent Registries

## Goal

Define machine-checkable registries for projects and agents.

## Required registries

- `docs/system/registries/projects.yaml`
- `docs/system/registries/agents.yaml`

## Project registry minimum fields

- `id`
- `title`
- `status`
- `workspacePath`
- `roadmapPath`
- `indexPath`
- `ownerClass`
- `priority`

## Agent registry minimum fields

- `id`
- `title`
- `status`
- `docsPath`
- `runtimeConfigPath`
- `primarySkills`
- `toolPolicyClass`
- `permissionClass`

## Allowed status values

- `active`
- `queued`
- `dormant`
- `archived`
- `superseded`

## Success criteria

- projects and agents can be audited deterministically
- required pack compliance can be checked automatically
- roadmap and pointer docs can resolve to real registered entities
