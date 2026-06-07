---
summary: "Machine-readable source/runtime topology manifest for the OpenClaw fork unification prerequisite."
title: "Source Runtime Unification Registry"
---

# Source Runtime Unification Registry

The canonical machine-readable registry lives at
`docs/system/registries/source-runtime-unification.yaml`.

It records the Phase 0 source/runtime model for the active Execution Platform
worker-agent refactor:

- canonical `projectRoot`
- canonical `executionPlatformDocsRoot`
- canonical `runtimeHome`
- runtime aliases
- runtime source-record path
- fork-transition readiness path
- dirty-worktree reconciliation path
- runtime file classes
- execution-agent materializations
- execution-skill materializations
- active config requirements
- split-filesystem workaround repair success gates

The dirty-worktree reconciliation record is a bounded migration aid. It stores
path/status/category/action inventory only; source contents, provider logs,
command logs, transcripts, hidden reasoning, secrets, and unbounded runtime
outputs stay out of the record.
