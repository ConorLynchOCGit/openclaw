# OpenClaw Fork Source Runtime Unification

Goal: make this a single forked OpenClaw implementation, with one editable source tree and one runtime state home. The editor should be able to inspect and modify the full OpenClaw architecture through the repo. Runtime Home should remain live deployment state, not a second implementation root.

This work is now a blocking prerequisite for the active native task worker-agent refactor. It must be completed before any outstanding implementation items from the 65-item worker-agent refactor plan continue, except for read-only inventory or preservation work needed to execute this unification safely.

Treat this spec as Phase 0 of the active worker-agent goal. Phase 0 is not complete until the source/runtime unification work and the split-filesystem workaround repair pass are both complete. Only then may the remaining items from the 65-item worker-agent refactor resume.

Reason: the current split filesystem/source-runtime architecture is upstream of the remaining worker-agent work. Continuing the worker-agent refactor first would risk preserving workarounds around the wrong roots, wrong skill/doc locations, wrong runtime materialization assumptions, and wrong agent search/edit boundaries.

Target model:

```text
Forked OpenClaw repo
  source of truth for behavior

Runtime Home
  live state, generated/materialized files, local overrides, secrets, sessions, logs, artifacts
```

## 1. Forked OpenClaw Implementation Repo

Use a fork of the original OpenClaw repo as the writable implementation source.

The fork repo owns:

- core OpenClaw source
- Execution Platform source
- native tools
- agent definitions
- canonical agent docs
- first-party skills
- config schemas/defaults/templates
- runtime manifests
- specs/docs
- fixtures/tests
- materialization/admission logic

The original OpenClaw repo should be an upstream reference, not a second local source root. If we are deeply changing OpenClaw, fork/monorepo is the correct architecture.

## 2. One Source Tree, One Runtime Home

Correct mental model:

```text
repo = OpenClaw implementation
runtime home = active OpenClaw deployment state
```

Incorrect model to eliminate:

```text
repo = our custom work
runtime home = real OpenClaw
```

If a file defines OpenClaw behavior, it belongs in the repo. Runtime Home may contain a live/materialized copy, but that copy is not authoritative unless explicitly reconciled back.

## 3. Use Native Path Resolution, Add Only `projectRoot`

Do not create a large parallel `OpenClawLocation` abstraction if native OpenClaw path handling can own it.

Extend native path/config resolution with the missing concept:

```text
OPENCLAW_HOME / OPENCLAW_STATE_DIR / OPENCLAW_CONFIG_PATH = runtime state
projectRoot = implementation workspace
```

The key fix is separating `projectRoot` from `workspace/state`, not inventing a new EP path system.

## 4. Runtime File Classes

Runtime Home should not be treated as one broad editable bucket. Classify runtime paths:

```text
source_materialized  generated/admitted from repo source
local_override       active local config override
secret_auth          never exposed to ordinary agents
session_state        runtime state, no normal edit
log_cache            diagnostic read only, no edit
generated_artifact   read by ref, no normal edit
hot_patch            direct runtime change requiring reconciliation
```

This is cleaner than "runtime editable or not editable."

## 5. Repo-Owned Agent Docs

Execution agent docs should be repo-owned source, not authored only under Runtime Home.

Target source locations:

```text
docs/agents/execution-coding/runtime/
docs/agents/execution-context-scout/runtime/
docs/agents/execution-validation-scout/runtime/
```

Runtime copies under `.openclaw/agents/...` are materializations. If edited directly, they become drift.

## 6. Repo-Owned Or Managed First-Party Skills

First-party execution skills should not exist only under workspace runtime paths.

Target source locations:

```text
skills/execution-node-workflow/SKILL.md
skills/execution-context-scout/SKILL.md
skills/execution-validation-scout/SKILL.md
```

Use OpenClaw's native skill loader or managed skill roots. Do not depend on current workspace location as the only way required skills load.

## 7. Config Source Vs Active Config

Be precise: the repo does not own live secrets or machine-specific config. The repo owns config source:

- schema
- defaults
- templates
- profiles
- tool profiles
- agent profile definitions
- runtime manifest

Runtime Home owns active instance config:

- generated `openclaw.json`
- local overrides
- env/secrets
- auth profiles

Use native config includes/overlays if available. Avoid a separate custom config compiler unless OpenClaw's native config stack cannot express the required split.

## 8. Runtime Materialization

Runtime docs/skills/config copies should be generated or admitted from repo source through native OpenClaw mechanisms where possible.

Materialization should be boring:

```text
repo source + local overlay -> runtime copy
```

No second source graph. No duplicate truth.

## 9. One Drift/Provenance Record

Collapse materialization and hot-patch receipts into one minimal record:

```ts
type RuntimeSourceRecord = {
  runtimePath: string;
  sourcePath?: string;
  sourceCommit?: string;
  beforeHash?: string;
  afterHash: string;
  mode: "materialized" | "local_override" | "hot_patch" | "generated_state";
  reconciled: boolean;
};
```

This records source provenance and runtime drift without multiplying schemas.

Runtime Home stores the admitted execution-agent materialization record at:

```text
/root/.openclaw/source-runtime/materialization-records.json
```

That file records repo-owned execution agent docs and first-party execution
skills materialized under Runtime Home. It must contain only bounded
`RuntimeSourceRecord` provenance and validation issues, not raw prompts,
provider logs, transcripts, hidden reasoning, secrets, or unbounded runtime
outputs.

Runtime Home also stores the fork-transition migration receipt at:

```text
/root/.openclaw/source-runtime/fork-transition-readiness.json
```

That record makes the fork migration state explicit: whether the fork and
upstream remotes existed at migration proof time, whether `origin` already
points at the fork, and whether preservation artifacts verified. After `origin`
has migrated to the fork, this record is a static migration/topology receipt.
It must not remain a live dirty-worktree gate that must be refreshed after
every ordinary patch.

Current dirty-worktree truth comes from `git status --porcelain=v1` or from an
explicitly regenerated dirty-worktree reconciliation inventory. The migration
receipt may include bounded dirty-worktree summary fields captured during the
transition, but those fields are historical receipt data, not live readiness
truth.

Runtime Home also stores an on-demand dirty-worktree reconciliation inventory at:

```text
/root/.openclaw/source-runtime/dirty-worktree-reconciliation.json
```

That inventory records a generated `git status --porcelain=v1` path/status set
with deterministic migration-action labels. It exists to make migration or
preservation operations executable without treating all dirty work as one
opaque blocker. It is regenerated when explicitly needed for a transition or
repair operation; it is not a continuously valid live gate during normal
development. It may store paths, git status codes, deterministic categories,
and deterministic next-action labels. It must not store source file contents,
provider logs, command logs, transcripts, hidden reasoning, secrets, or
unbounded runtime output.

The deterministic migration actions are:

```text
include_in_phase0_fork_transition
  Source/runtime unification files that belong in the Phase 0 fork transition.

preserve_active_goal_work_before_switch
  Execution Platform runtime/docs work that belongs to the active worker-agent
  goal and must be preserved before switching canonical remotes.

preserve_openclaw_runtime_work_before_switch
  Native OpenClaw agent/session/config/tool runtime files that may affect the
  worker-agent refactor and must be preserved before switching canonical
  remotes.

preserve_adjacent_runtime_work_before_switch
  Adjacent runtime work, such as model-memory provider/session integration,
  that is not Phase 0 but must not be lost during the fork transition.

preserve_system_registry_before_switch
  System registry/index changes that shape runtime/source topology or agent
  registry discovery and must be preserved before switching canonical remotes.

preserve_agent_surface_before_switch
  Root and agent registry surfaces that may influence bootstrap/agent behavior
  and must be preserved before switching canonical remotes.

classify_before_switch
  Repo-other changes that require explicit classification before a canonical
  remote/root transition.
```

## 10. Runtime Hot Patches

Direct runtime edits are allowed only as explicit operational/admin actions.

Rules:

- hash-check before write
- backup or before-hash recorded
- write receipt emitted
- reconciliation status tracked
- source-materialized files edited directly become drift
- secrets/auth/session/log/cache paths remain denied unless a dedicated diagnostic/admin path permits bounded access

Runtime hot patches should not quietly become source truth.

## 11. Agent Search/Edit Semantics

The default implementation root for coding/search/edit is `projectRoot`.

Agents should be able to inspect Runtime Home when the task needs runtime architecture/config/artifact evidence, but behavior-defining edits should land in the repo by default.

Normal rule:

```text
source architecture change -> repo edit
runtime evidence inspection -> runtime read
runtime operational change -> explicit admin/runtime write
```

## 12. Runtime Inspection

Runtime Home is inspectable when task-relevant. This is necessary for understanding live config, active agent docs, loaded skills, sessions, and artifacts.

But runtime inspection should be typed and bounded by file class. Broad runtime search should not silently replace repo search.

## 13. Runtime Editing Authority

Runtime editing is not off limits. It is explicit.

Allowed runtime-edit targets may include:

- local config override
- materialized agent doc/skill only as hot patch
- admin-maintained runtime manifest
- controlled workspace docs/artifacts

Denied by default:

- secrets
- auth profiles
- session state
- raw transcripts
- logs
- caches
- generated blobs

## 14. Demote Bind Mounts To Aliases

Bind mounts/imports can stay during migration, but they must stop being canonical roots.

Canonical paths:

```text
projectRoot: /root/services/openclaw-roles/live
runtimeHome: /root/.openclaw
```

Compatibility aliases such as `/home/node/.openclaw`, host-operator repo mounts, and workspace import paths should be recorded as aliases only.

## 15. Native OpenClaw Integration First

Wire through OpenClaw-native mechanisms wherever possible:

- native env/path resolution
- native config loader
- native skill loader
- native agent bootstrap
- native session state
- native tool registry
- native permission profiles
- native config write/backup/audit path

Do not create an Execution Platform-only root resolver, config system, skill loader, or runtime write framework unless the native surface is missing.

## 16. Upstream/Fork Policy

Target repo topology:

```text
origin   = writable fork
upstream = original OpenClaw repo, read-only
```

Current transition state:

```text
origin   = ConorLynchOCGit/openclaw, writable GitHub fork of openclaw/openclaw
upstream = openclaw/openclaw, read-only reference remote
```

The earlier transition-only `openclaw-fork` remote was redundant after `origin`
became the writable fork. Remove duplicate fork remotes once preservation is
recorded. The canonical writable fork remote is `origin`; `upstream` is the
read-only reference remote.

Policy:

- commit first-party OpenClaw changes to fork
- periodically merge/rebase from upstream
- keep integration/legacy remotes read-only unless explicitly needed
- document divergence from upstream when architectural changes are intentional

## 17. Safe Transition: Preserve First

Before structural migration:

- create a transition branch
- record current commit
- record remotes/worktrees
- save full tracked diff
- archive untracked files
- snapshot non-secret runtime agent docs
- snapshot non-secret runtime skills
- snapshot redacted runtime config shape
- do not delete or move current work until preservation exists

This is mandatory because the current tree contains substantial dirty work.

## 18. Migration Phases

Phase 1: preservation and inventory.

Phase 2: repo-owned source locations for agents, skills, config templates, manifests.

Phase 3: runtime materialization from repo source with `RuntimeSourceRecord`.

Phase 4: native config/path resolution adds `projectRoot`.

Phase 5: execution agents use `projectRoot` for implementation work and Runtime Home for state/materialization.

Phase 6: bind aliases become compatibility-only.

Phase 7: gates enforce no first-party behavior exists only in Runtime Home.

## 19. Inventory Gates

Fail when:

- first-party agent docs exist only under Runtime Home
- first-party skills exist only under Runtime Home
- first-party skills have duplicated active runtime copies that are stale
  relative to the repo source copy, including direct runtime workspace copies
  such as `/root/.openclaw/workspace/skills/execution-node-workflow/SKILL.md`
- execution agents use runtime workspace as implementation root
- runtime materialized files lack source provenance
- runtime hot patches lack reconciliation status
- `/home/node` appears as canonical instead of alias
- bind/import paths are treated as source truth
- active config points implementation work at a runtime/import alias

## 20. Focused Tests

Add focused tests for:

- native path resolver with `projectRoot`
- config source plus runtime override loading
- skill loading independent of runtime workspace
- active runtime skill copy drift detection, proving the repo source skill and
  any provider-admitted/runtime workspace copy are hash-aligned or explicitly
  recorded as hot-patch drift
- agent doc materialization
- `RuntimeSourceRecord` generation
- hot-patch drift detection
- alias canonicalization
- execution-agent project root selection
- runtime file-class permission behavior

## 21. Split-Filesystem Workaround Repair

This unification will likely break or invalidate workarounds built around the old split filesystem model. Add an explicit repair pass after source/runtime unification and before resuming outstanding worker-agent refactor items.

This repair pass is part of the blocking prerequisite, not a later cleanup. The old split-root workarounds must not be left in place as hidden dependencies that shape the remaining worker-agent implementation.

Repair scope:

- inventory code paths that special-case `/home/node/.openclaw`, `/root/.openclaw`, host-operator repo mounts, workspace import aliases, or runtime workspace-as-code-root behavior;
- classify each workaround as obsolete, still required as a compatibility alias, or required but needing conversion to native `projectRoot` plus runtime-state semantics;
- update execution-agent config, task/session spawn inheritance, skill loading, bootstrap materialization, resource reads, file graph generation, and readback optics to use the new source/runtime split;
- inventory duplicated active runtime skills and agent-doc materializations,
  including `/root/.openclaw/workspace/skills/execution-node-workflow/SKILL.md`,
  and either regenerate them from repo source through the native
  materialization path or record them as explicit hot-patch drift with
  reconciliation status;
- ensure provider-admitted required skill context for execution agents is
  loaded from the repo-owned source or a hash-aligned native materialization,
  not from an untracked stale runtime workspace copy;
- remove or quarantine split-filesystem tests that only preserve the old architecture;
- add regression tests proving workers, scouts, tools, skills, agent docs, file graph, and readback do not depend on the old split-root workaround paths;
- preserve operational compatibility aliases only where still necessary, and ensure they are never reported as canonical source roots.

Success gate:

- no first-party implementation behavior depends on runtime workspace/import aliases as source truth;
- remaining aliases are explicit compatibility surfaces;
- no duplicated active runtime skill or agent-doc copy can silently drift from
  repo source; stale runtime copies are either regenerated, hash-aligned, or
  reported as hot-patch drift before node-agent sessions start;
- execution-agent source work uses canonical `projectRoot`;
- runtime inspection/edit paths are typed by runtime file class;
- node start receipts report canonical `projectRoot`, Runtime Home, runtime
  aliases, and source/runtime manifest ref;
- active graph readback projects canonical source/runtime paths and alias status
  without ambiguity.

## 22. What Not To Do

Do not:

- make `/root` the workspace
- keep Runtime Home as a second source tree
- author first-party behavior only in `.openclaw`
- solve this with more bind aliases
- solve this with EP-specific path wrappers
- make agents reason manually about root aliases
- treat generated runtime copies as source truth
- commit secrets/auth/session state
- delete current work before snapshotting
- preserve stale split architecture because existing tests assume it

## Final Architecture Rule

```text
If it defines OpenClaw behavior, it belongs in the fork repo.
If it records live OpenClaw state, it belongs in Runtime Home.
If Runtime Home contains behavior-defining files, they are materialized from repo source or they are unreconciled drift.
```

The central simplification is one editable OpenClaw implementation plus one runtime instance. That gives the editor full architectural reach while removing the current split-brain filesystem.
