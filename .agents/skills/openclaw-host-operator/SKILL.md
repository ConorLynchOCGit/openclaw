---
name: openclaw-host-operator
description: Use when an OpenClaw agent needs to inspect or edit approved canonical live repo or operator workspace documents through the scoped host_operator_repo tool, resolve host/workspace paths, or explain host-operator permission mode. Requires no blanket host access.
---

# OpenClaw Host Operator

Use this skill when work depends on canonical OpenClaw paths that ordinary workspace mode cannot inspect or edit directly.

## Read First

- `docs/projects/workspace-topology/canonical-path-resolution-and-host-operator.md`
- `docs/projects/operator-experience/STATUS.md` if the task touches operator UX or permission-mode presentation

## Core Rule

Host-operator access is scoped, audited, traversal-blocked, and kill-switchable. It is not blanket host access.

## Workflow

1. Resolve the target first with `resolve_openclaw_path` when available.
2. Check host-operator state with `host_operator_repo` action `status`.
3. Use `scope: "live_repo"` for canonical product repo paths under `/root/services/openclaw-roles/live`.
4. Use `scope: "operator_workspace"` for approved workspace documents under `/root/.openclaw/workspace`.
5. Keep reads and lists targeted. Do not broad-scan the workspace or host mirrors.
6. For edits, require `OPENCLAW_HOST_OPERATOR_WRITE_ENABLED=true`.
7. For exec, require `OPENCLAW_HOST_OPERATOR_EXEC_ENABLED=true`; exec is only allowed in `live_repo` scope.
8. Preserve the audit id/path in your summary when host-operator tooling is used.

## Approved Workspace Write Surface

The operator workspace scope may edit:

- `core/**`
- `docs/**`
- `projects/**`
- `runbooks/**`
- `memory/**`
- `AGENTS.md`
- `HEARTBEAT.md`
- `IDENTITY.md`
- `TOOLS.md`

Protected from generic host-operator edits by default:

- `USER.md`
- `MEMORY.md`
- `SOUL.md`
- `BOOTSTRAP.md`

Blocked or pruned by default:

- `.openclaw/**`
- `.git/**`
- `system/hostfs/**`
- `imports/runtime_state/**`
- `state/**`
- `checkpoints/**`
- `audits/**`
- session JSONL
- secrets and credential roots

## Red Lines

- Do not use host-operator mode to bypass canonical ownership.
- Do not create duplicate doc trees when the resolver identifies an existing canonical source.
- Do not write root `USER.md` or `MEMORY.md` through this tool.
- Do not capture or persist raw prompts, full transcripts, raw tool logs, secrets, or private phrases.
- Do not request or grant broad host filesystem access.

## Reporting

When you use this skill, report:

- requested path
- resolved scope
- canonical path
- action taken
- audit id/path
- whether write or exec kill switches were enabled
- any blocked paths and why
