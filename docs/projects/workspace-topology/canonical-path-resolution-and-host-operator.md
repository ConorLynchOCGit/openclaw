---
summary: "Canonical path resolver, safe search discipline, and scoped host-operator posture."
title: "Canonical Path Resolution and Host Operator"
---

# Canonical Path Resolution and Host Operator

## Problem

Main can see workspace summaries, curated imports, read-only host mirrors, generated artifacts, and the live repo. Without an explicit resolver it can create duplicate trees when a canonical source already exists elsewhere.

## Resolver contract

The `resolve_openclaw_path` tool resolves a requested path or topic into:

- `canonicalOwner`
- `canonicalPath`
- `writablePath`
- `readOnlyMirrorPaths`
- repo/workspace/import/artifact classification
- generated versus human-owned classification
- allowed edit surface
- required escalation

Before creating docs or editing implementation-owned files, Main should call the resolver. If the resolver returns `needs repo executor / host write bridge`, Main must stop or switch to an approved executor profile. It must not create a parallel workspace tree.

The resolver accepts explicit workspace scoping for ambiguous document paths:

- `scope: "live_repo"` means `docs/...` resolves under `/root/services/openclaw-roles/live`.
- `scope: "operator_workspace"` means `docs/...`, `projects/...`, and bare `projects` resolve under `/root/.openclaw/workspace`.
- Prefix forms such as `operator_workspace docs/projects` and `live_repo docs/agents/web-researcher` are accepted for agents that cannot pass structured scope arguments.

## Canonical examples

- `/root/services/openclaw-roles/live`: live product repo; writable only in repo-executor or host-operator mode.
- `/root/.openclaw/workspace`: canonical operator workspace; writable for human-owned workspace docs.
- `/root/services/openclaw-roles/live/docs/projects`: implementation-owned project docs in the product repo.
- `/root/services/openclaw-roles/live/docs/agents`: implementation-owned agent-pack docs, including Web Researcher.
- `/root/.openclaw/workspace/docs/projects`: operator workspace continuity/project docs.
- `/root/.openclaw/workspace/projects`: legacy/live operator workspace project docs still approved for scoped edits.
- `/root/.openclaw/workspace/imports/product_live/content`: read-only mirror of the live product repo; never an edit target.
- `/root/.openclaw/workspace/system/hostfs`: broad host visibility mirror; read-only and pruned by default.
- `.artifacts`: proof/output surface, not durable memory or canonical docs.
- `.openclaw-memory-ops`: report/evidence output, not durable memory or hand-edited source.
- `/root/.openclaw/workspace/.openclaw/model-memory/projections`: generated projection artifacts; update MMV2 truth/compiler inputs instead.

## Safe search discipline

Main must use index-first discovery:

- read `core/INDEX.md` and `core/WORKSPACE_STRUCTURE.md`
- read the relevant local `INDEX.md`
- use targeted `rg`
- avoid broad `find /root/.openclaw/workspace`
- avoid traversing read-only import mirrors unless the task explicitly asks for
  imported canonical-source inspection

Default prunes:

- `system/hostfs/proc/**`
- `system/hostfs/sys/**`
- `system/hostfs/dev/**`
- `imports/*/content/**` unless explicitly requested
- Docker/cache directories
- credential roots
- session JSONL unless explicitly requested
- `.artifacts/**`
- `.openclaw-memory-ops/**`

## Host-operator profile

Do not grant Main blanket host access. The safe model is a scoped host-operator profile:

- explicit writable target: `/root/services/openclaw-roles/live`
- scoped workspace-document access: `/root/.openclaw/workspace`
- audited `read`, `list`, `edit`, and allowlisted `exec`
- git identity/auth configured only for the live repo
- kill switch before tool construction
- path resolver required before writes

Ordinary Main remains workspace-first. Host-operator is a deliberate executor mode for trusted live-repo work, not a default chat capability.

### Implemented bridge

The `host_operator_repo` tool is the concrete scoped host-operator bridge. It currently exposes two explicit scopes:

- `live_repo`: maps canonical `/root/services/openclaw-roles/live/...` paths and read-only `imports/product_live/content/...` paths to the container mount.
- `operator_workspace`: maps canonical `/root/.openclaw/workspace/...` paths to the existing workspace mount.

The live repo scope maps to:

- `/home/node/.openclaw/host-operator/openclaw-live`

The operator workspace scope maps to:

- `/home/node/.openclaw/workspace`

The live repo bridge is mounted by `docker-compose.yml` as a repo-scoped bind. The workspace scope uses the existing workspace mount. All write/exec behavior remains kill-switch gated:

- `OPENCLAW_HOST_OPERATOR_ENABLED=true`: enables repo-scoped read/list/status access.
  The live compose default is `true` so Main can inspect canonical product repo files
  without relying on read-only import proof alone.
- `OPENCLAW_HOST_OPERATOR_WRITE_ENABLED=true`: enables exact-match edits
- `OPENCLAW_HOST_OPERATOR_EXEC_ENABLED=true`: enables allowlisted commands
- `OPENCLAW_HOST_OPERATOR_WORKSPACE_ROOT`: container workspace root
- `OPENCLAW_HOST_OPERATOR_CANONICAL_WORKSPACE_ROOT`: canonical host workspace root
- `OPENCLAW_HOST_OPERATOR_AUDIT_DIR`: JSONL audit output directory

Allowed tool actions:

- `status`: reports mount/kill-switch state and writes an audit record
- `list`: lists bounded directory entries inside the repo mount
- `read`: reads bounded file content inside the repo mount
- `edit`: exact-match replacements only, write kill switch required
- `mkdir`: creates approved directories, write kill switch required
- `create_file`: creates a new bounded file, write kill switch required
- `write_file_if_hash_matches`: replaces an existing bounded file only when
  its current SHA-256 matches the caller-provided hash
- `copy_from_workspace`: copies approved operator-workspace draft files into
  approved live-repo destinations
- `move_from_workspace`: copies approved operator-workspace draft files into
  approved live-repo destinations, then removes the workspace draft source
- `install_skill`: installs an operator-provided canonical skill under
  `.agents/skills/<skill-name>/`
- `delete_empty_probe_file` and `delete_if_hash_matches`: bounded cleanup
  helpers for explicit probes or exact-hash files only
- `exec`: allowlisted commands only, exec kill switch required

Workspace write access is intentionally narrower than workspace read access. The host-operator tool may edit:

- `core/**`
- `docs/**`, including `docs/projects/**`
- `projects/**`, including legacy/live project workspaces
- `runbooks/**`
- `memory/**`
- `AGENTS.md`
- `HEARTBEAT.md`
- `IDENTITY.md`
- `TOOLS.md`

The host-operator tool does not edit these human-owned root files by default:

- `USER.md`
- `MEMORY.md`
- `SOUL.md`
- `BOOTSTRAP.md`

The workspace scope blocks noisy or sensitive roots by default:

- `.openclaw/**`
- `.git/**`
- `system/hostfs/**`
- `imports/runtime_state/**`
- `state/**`
- `checkpoints/**`
- `audits/**`

This gives Main direct canonical document access for operator/project work without granting broad host filesystem access or turning memory compatibility files into generic write targets.

Live repo write access is also allowlisted when
`OPENCLAW_HOST_OPERATOR_WRITE_ENABLED=true`. Approved live-repo write roots are:

- `docs/agents/**`
- `docs/projects/**`
- `.agents/skills/**`
- `skills/**`

Blocked live-repo write roots include:

- `.git/**`
- `.env*`
- `.openclaw/**`
- `.artifacts/**`
- `.openclaw-memory-ops/**`
- `node_modules/**`
- `dist/**`
- `state/**`
- `checkpoints/**`
- `audits/**`
- `imports/**`
- credential and secret roots

Main should still not write `/root/services/openclaw-roles/live/...` directly.
For canonical product repo writes it should resolve the target and use the
`live_repo` host-operator bridge rooted at
`/home/node/.openclaw/host-operator/openclaw-live`.

Canonical skill installation is an explicit host-operator action, not an
automatic behavior. It only writes operator-provided bounded content under
`.agents/skills/<skill-name>/`, validates the skill slug and `SKILL.md`
frontmatter name, blocks obvious secrets/raw transcripts/raw tool logs, and
audits content hashes. External skills still require vetting before the
operator asks Main to install them.

Accepted install shape:

```json
{
  "action": "install_skill",
  "scope": "live_repo",
  "skillName": "example-skill",
  "content": "---\nname: example-skill\ndescription: ...\n---\n# Example Skill\n...",
  "validateOnly": false
}
```

The alternate `files` shape is also accepted when `SKILL.md` is supplied as a
bounded support file. Validation errors should name the missing field or
frontmatter mismatch directly. Tool failure logs must never include full
`content` or support-file bodies; they log safe parameter keys, action/scope,
safe path/skill name, error class, and content byte counts only.

Physical write permission for the container `node` user must be granted only on
approved live-repo surfaces, for example via ACLs or group ownership on:

- `/root/services/openclaw-roles/live/docs/agents`
- `/root/services/openclaw-roles/live/docs/projects`
- `/root/services/openclaw-roles/live/.agents/skills`
- `/root/services/openclaw-roles/live/skills`

Main should use:

- `live_repo` for implementation-owned docs, source, tests, scripts, `.agents/skills/**`, and product agent packs.
- `operator_workspace` for continuity docs, workspace project planning, roadmap/status/current-slice docs, daily notes, and workspace runbooks.

The current allowlist is intentionally narrow: `git status/diff/log/remote/show`,
`rg`, `pwd`, `ls`, `pnpm tsgo`, `pnpm build`, and `pnpm vitest run ...`.
This is enough for direct repo inspection and validation without opening arbitrary
shell access.

## Rollback

Set `OPENCLAW_HOST_OPERATOR_ENABLED=false` and recreate the gateway. Main then falls
back to ordinary workspace mode and the resolver returns `needs repo executor / host
write bridge` for product repo reads/edits. For stronger rollback, remove the
`/home/node/.openclaw/host-operator/openclaw-live` compose mount and recreate
`openclaw-gateway`.
