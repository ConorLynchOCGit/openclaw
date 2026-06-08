---
summary: "Registry-first worker bootstrap plan: executable node workers launch as normal native OpenClaw sessions from one implementation source tree, with Runtime Home state-only and Execution Platform projecting session launch and node_finish into node lifecycle."
title: "Native Session Launch Worker Bootstrap"
---

# Native Session Launch Worker Bootstrap

Status: implemented for the active native worker-launch path; remains the
governing architecture for future worker-launch behavior.

This spec records the cleaned-up worker-bootstrap architecture for executable
node sessions. It supersedes worker-start designs that depend on
Execution Platform-owned bootstrap proof models, source/runtime
materialization as launch authority, runtime-materialized first-party
agent docs or skills, path/name admission matching, or late extra-tool
injection.

This spec also makes the source/runtime unification rule a foundation for
native worker bootstrap, not an adjacent cleanup concern. Native launch cannot
be reliable while first-party OpenClaw implementation files are split across
two semi-authoritative homes.

## Active Goal Ordering

Phase 0 for this spec is source/runtime file-structure unification. Phase 0 is
the first priority and a hard predicate for every other numbered item in this
spec.

No native launch/bootstrap item below should be marked complete until Phase 0
proves that first-party OpenClaw implementation files have exactly one source
authority and Runtime Home cannot drift into a second implementation root.

This means worker-launch work must not proceed by adding more source-backed
resolvers, path aliases, materialization gates, runtime-copy comparisons, or
provider-path workarounds. Those are compensating layers. The first move is to
make the file structure itself correct.

Phase 0 success requires:

- one OpenClaw implementation source tree is the source of truth for source
  code, agent docs, skills, native tools, schemas, specs, tests, config
  defaults/templates, and native registry source;
- the implementation source tree and Runtime Home physically sit under one
  top-level OpenClaw root;
- the selected target for this build is:

  ```text
  /root/services/openclaw-roles/live/
    src/
    docs/
    skills/
    .openclaw/runtime/   # state-only Runtime Home, gitignored
  ```

- Runtime Home remains state-only for sessions, auth, secrets, logs, caches,
  generated artifacts, local overrides, and traces;
- Runtime Home state is inventoried and cleaned before relocation, because
  relocating unclassified generated ballast preserves the same failure mode
  under a new path;
- stale/generated Runtime Home ballast is intentionally retained, archived, or
  removed by class before the move;
- Runtime Home cleanup is a required Phase 0 step, not an optional
  after-the-move chore. The current Runtime Home has been observed at roughly
  232G-247G, with the dominant growth source in generated session compaction
  checkpoint snapshots. Do not blindly move that state into repo-local runtime;
  first classify it, prune approved generated ballast, and leave an auditable
  retention decision for any large retained class;
- session/checkpoint/cache/artifact growth has guards so Runtime Home cannot
  quietly grow back into a huge opaque pile of state;
- compaction checkpoint snapshots are governed by native session maintenance:
  generated checkpoint files pruned out of checkpoint metadata are deleted,
  unreferenced checkpoint snapshots are eligible for disk-budget cleanup, and
  retained checkpoint count defaults to a small bounded value;
- the checkpoint guard is native session maintenance, not a new Runtime Home
  cleanup subsystem. The native compaction path caps retained checkpoint
  snapshots per session, deletes generated snapshots when metadata prunes them,
  and lets the session disk-budget sweep reclaim unreferenced checkpoint files;
- the cleanup pass must include a dry-run inventory before destructive action.
  The inventory must separately report sessions, compaction checkpoints,
  host-operator/runtime clones, browser caches, generated artifacts, auth,
  secrets, logs, model-memory state, and workspace state;
- destructive cleanup requires an explicit operator decision unless the file is
  already governed by a live native retention policy being executed in its
  normal maintenance path;
- `/root/.openclaw` and `/home/node/.openclaw` are compatibility links/shims
  to the same repo-local Runtime Home, not independent runtime homes;
- active Runtime Home first-party agent docs and first-party skill files are
  source-backed rather than independent writable copies;
- execution agents can still use runtime `agentDir` for auth/model/session
  state without treating that directory as implementation source;
- stale runtime first-party docs/skills cannot diverge from repo source;
- `.openclaw/` remains gitignored so runtime state cannot enter source
  control;
- focused topology tests prove the above before worker bootstrap gates resume.

### Phase 0 Runtime Cleanup Finding

Runtime Home cleanup is required before physical relocation. The first
inventory pass found the failure class this topology change is meant to remove:
Runtime Home is carrying large generated state that is not implementation
source and should not be moved blindly.

Observed Runtime Home state:

- `/root/.openclaw` is a real directory.
- `/home/node/.openclaw` is a symlink to `/root/.openclaw`.
- repo-local `.openclaw/runtime` is the target Runtime Home and does not become
  authoritative until the move/link step is completed.
- Runtime Home size is roughly 232G allocated on the root filesystem.
- Docker image/build-cache storage is outside Runtime Home and is not the cause
  of this Runtime Home size.
- Actual image/media files inside Runtime Home are small and are not the
  dominant ballast class.
- `/root/.openclaw/agents/main/sessions` is the dominant state class.
- That sessions directory contains hundreds of generated
  `*.checkpoint.*.jsonl` compaction checkpoint snapshots, with individual
  checkpoint files around 500MiB.
- Current checkpoint inventory:
  - 930 generated checkpoint snapshot files;
  - 211.12GiB total checkpoint snapshot bytes;
  - 25 checkpoint files referenced by current session metadata;
  - 12.21GiB referenced checkpoint bytes;
  - 905 unreferenced generated checkpoint files;
  - 198.90GiB unreferenced checkpoint bytes;
  - retaining only the newest five referenced checkpoint snapshots would keep
    roughly 2.48GiB and make roughly 9.74GiB of currently referenced checkpoint
    snapshots additionally prunable;
  - total checkpoint-only pre-move reclaim opportunity is roughly 208.64GiB
    before considering any other Runtime Home state class.
- The old runtime-host tree under
  `/root/.openclaw/host-operator/openclaw-live` is a separate large state class
  and must be classified before relocation. It contains generated/deployment
  surfaces such as `node_modules`, `.artifacts`, `.git`, and `dist`; it is not
  source authority for this refactor.
- A native session disk-budget dry run against the real sessions directory
  proved the guard path can identify reclaimable session files without deleting
  auth, secrets, or local overrides. That budget dry run used a 50GiB max /
  30GiB high-water target and projected 1,286 removed files, zero removed store
  entries, and 182.11GiB reclaimed. That is proof of the guard, not the exact
  preferred pre-move cleanup operation.

Cleanup requirements:

- do not move the full Runtime Home until large generated state is classified;
- do not delete auth, secrets, current session state, or local overrides during
  cleanup;
- treat generated compaction checkpoint snapshots as session maintenance state,
  not implementation files;
- prune unreferenced generated checkpoint snapshots through the native session
  disk-budget/maintenance path where possible;
- prefer a surgical checkpoint-only cleanup for the pre-move purge: remove
  generated checkpoint snapshots that are unreferenced by session metadata, then
  trim the one over-retained checkpoint metadata set to the native cap and
  delete only those older generated checkpoint snapshots. Do not use a broad
  budget cleanup as the first destructive pre-move action unless explicitly
  approved, because it may also remove unrelated unreferenced session
  transcripts;
- cap future retained checkpoint snapshots per session through native compaction
  configuration;
- delete generated checkpoint files when checkpoint metadata prunes them;
- classify the old runtime-host tree before move as retained state, archive
  candidate, or deletion candidate;
- record the cleanup inventory and operator decision before physical
  relocation;
- after cleanup, move only the retained Runtime Home state into
  `.openclaw/runtime` and create compatibility links for `/root/.openclaw` and
  `/home/node/.openclaw`.

Growth guards required before relocation:

- `agents.defaults.compaction.maxCheckpointsPerSession` exists in config
  schema/help and defaults to a small retained count in the native compaction
  checkpoint path;
- generated checkpoint files pruned from session checkpoint metadata are
  deleted best-effort;
- unreferenced generated checkpoint snapshots are removable by native session
  disk-budget cleanup;
- `session.maintenance.maxDiskBytes` and `session.maintenance.highWaterBytes`
  remain the native per-agent sessions-directory disk-budget surface;
- Runtime Home source/materialization compatibility must not become another
  place where stale first-party implementation files can accumulate.

Safety requirements after the recovery incident:

- no destructive Runtime Home cleanup, move, prune, or archive command may run
  until a mount/link graph preflight proves the source, target, backup, and
  cleanup roots are not recursive aliases of each other;
- cleanup preflight must reject any path where Runtime Home contains a source
  checkout that itself contains `.openclaw/runtime`, or any equivalent loop
  through a bind mount, symlink, hardlink, or compatibility alias;
- cleanup commands must not use recursive traversal modes that follow links or
  mounted implementation trees unless the command has a bounded allowlist and
  the allowlist was generated from the preflight graph;
- preserved Runtime Home state, active config, `.env`, auth/model credential
  stores, and database pointers must be copied to a backup location outside the
  cleanup target and outside the Runtime Home/source loop before any destructive
  command is allowed;
- `openclaw.json`, `.env`, provider model credential registry, session index,
  model-memory DB pointer, and Execution Platform DB pointer must be proven
  restorable before cleanup proceeds;
- after cleanup, a postflight must prove that source files still exist, Runtime
  Home still has required state files or explicit recovery records, aliases
  resolve to the intended repo-local runtime, and no duplicate implementation
  tree remains under Runtime Home.

### Current Phase 0 Recovery Status

Status: complete for the file-structure/topology predicate. Native
launch/bootstrap items may resume from this prerequisite, but they still need
their own evidence before being marked complete.

Current evidence after the recovery and cleanup pass:

- `/root/.openclaw`, `/home/node/.openclaw`, and repo-local
  `.openclaw/runtime` all resolve to
  `/root/services/openclaw-roles/live/.openclaw/runtime`;
- the implementation source tree and Runtime Home now physically sit under the
  same top-level OpenClaw root:

  ```text
  /root/services/openclaw-roles/live/
    src/
    docs/
    skills/
    .openclaw/runtime/
  ```

- repo-local Runtime Home is about 1.3M, not the prior 232G-247G generated
  checkpoint pile;
- `findmnt -R /root/services/openclaw-roles/live/.openclaw/runtime` reports no
  nested mounts under Runtime Home;
- a bounded source-signature scan under `.openclaw/runtime` returns zero
  source checkout indicators for `package.json`, `pnpm-lock.yaml`,
  `turbo.json`, `tsconfig.json`, `src`, `extensions`, `docs`, and `skills`;
- the former `.openclaw/runtime/host-operator/openclaw-live` source exposure
  was proven to be a bind mount of `/root/services/openclaw-roles/live`, then
  explicitly unmounted and removed as an empty mountpoint;
- the former `.openclaw/runtime/workspace/imports/product_live/content` source
  exposure was also proven to be a bind mount of the repo source, then
  explicitly unmounted and removed as an empty mountpoint;
- unmount/cleanup proof is preserved at
  `.openclaw/runtime/recovery/duplicate-runtime-bind-mount-unmount.latest.redacted.json`,
  `.openclaw/runtime/recovery/duplicate-runtime-empty-mountpoint-rmdir.latest.redacted.json`,
  `.openclaw/runtime/recovery/workspace-import-product-live-unmount.latest.redacted.json`,
  and
  `.openclaw/runtime/recovery/runtime-home-source-mount-removal-postflight.latest.redacted.json`;
- active `.openclaw/runtime/.env` has been restored from the validated
  recovery candidate and remains mode `600`;
- active `.openclaw/runtime/openclaw.json` has been restored from the validated
  recovery candidate and remains mode `600`;
- the stale retired `plugins.entries.memory-middleware` entry was removed from
  active config and from the recovery candidate, with redacted cleanup proof at
  `.openclaw/runtime/recovery/openclaw.memory-middleware-warning-cleanup.latest.redacted.json`;
- active config now loads with zero plugin warnings while preserving
  `gateway.auth.mode: token` and
  `env.vars.EXECUTION_PLATFORM_DATABASE_URL`;
- recovery activation was backed up outside Runtime Home at
  `/root/backups/openclaw-runtime-activation-20260607T221418Z`, with redacted
  activation proof linked from
  `.openclaw/runtime/recovery/active-config-recovery-activation.latest.redacted.json`;
- provider model credential state is still present in
  `.openclaw/runtime/agents/main/agent/models.json`;
- recovered environment material remains available at
  `.openclaw/runtime/recovery/env.latest.env`, but it is a recovery artifact,
  not the active `.env`;
- the first recovered running-container DB pointer reached model-memory rows
  but was not the Work Queue truth database;
- an initial redacted Codex-log recovery scan found a model-memory database
  pointer candidate with hash prefix `0a55e42f487c9406`;
- that initial candidate is preserved as historical recovery evidence, but it
  is no longer the preferred restart candidate because a deeper Codex-log scan
  found a dedicated `execution_platform` database pointer with hash prefix
  `ef6d35b30b3aa959`;
- the dedicated candidate is preserved only as a non-active recovery artifact
  at `.openclaw/runtime/recovery/execution-platform-db.latest.env`, with
  redacted proof at
  `.openclaw/runtime/recovery/execution-platform-db.latest.redacted.json`;
- the dedicated recovered candidate was probed read-only and contains
  `execution_platform.runtime_jobs`, `execution_platform.work_item_events`,
  `execution_platform.work_items`, and
  `execution_platform.work_queue_events`;
- the dedicated recovered candidate currently has 5,972 runtime jobs, 6,135
  work item events, 1,886 work items, and 8,920 work queue events;
- the dedicated candidate resolves through the Execution Platform database
  resolver as `env:EXECUTION_PLATFORM_DATABASE_URL`, database
  `execution_platform`, `reusedModelMemoryDatabase: false`,
  `dedicated_execution_platform_db`, and readiness `ready`;
- a focused read-only readiness probe against the candidate found no missing
  required Execution Platform tables, no missing migrations, and
  `workQueueLiveLinkageMayAttach: true`;
- redacted readiness proof is preserved at
  `.openclaw/runtime/recovery/execution-platform-db.dedicated-readiness.latest.redacted.json`;
- the live gateway Work Queue list route returns
  `execution_platform_work_queue_db` with active items, proving the recovered
  active Execution Platform DB pointer is usable;
- therefore Phase 0's file-structure predicate is no longer a blocker: Runtime
  Home is state-only in the current topology, and native launch/bootstrap work
  can resume without adding more split-filesystem workarounds.

## Goal

Make worker-agent launch indistinguishable from a normal native OpenClaw agent
launch, with only node metadata and node lifecycle tooling added.

Core invariant:

```text
Execution Platform asks OpenClaw to launch an agent.
OpenClaw native registry resolves the agent contract.
OpenClaw native session.launch proves what happened.
Execution Platform projects launch and finish results into node lifecycle.
```

Execution Platform must not maintain a parallel file/source/runtime/bootstrap
system.

## Foundational Source/Runtime Invariant

The native launch architecture depends on one OpenClaw implementation source
tree and one state-only Runtime Home.

The clean model is:

```text
one OpenClaw implementation root
  source code
  skills
  native tools
  schemas
  specs

one runtime state area
  sessions
  auth
  secrets
  logs
  caches
  generated artifacts
  local overrides
```

Those can physically live under one top-level directory if runtime state is
isolated and ignored, for example:

```text
/root/openclaw/
  repo/                  # versioned source truth
  runtime/               # gitignored state home
```

or even:

```text
/root/services/openclaw-roles/live/
  src/
  docs/
  skills/
  .openclaw/runtime/     # gitignored state home
```

The bad version is what this spec is eliminating:

```text
repo = our custom implementation
runtime home = another semi-authoritative OpenClaw implementation
```

That creates stale docs, stale skills, wrong bootstrap paths,
`/root` vs `/home/node` drift, and duplicate admission/materialization logic.

So the source/runtime answer is: collapse to one implementation source tree.
Runtime Home remains only state. If Runtime Home physically sits inside the
repo, that is acceptable only when it is clearly state-only, gitignored, and
cannot override first-party packs except through explicit local override
semantics.

This does not replace this native-session-launch bootstrap spec. It is the
foundation underneath it:

- source/runtime unification solves stale docs, stale skills,
  `/root` vs `/home/node`, duplicate OpenClaw homes, materialization drift,
  and agents not seeing the real implementation;
- native session launch bootstrap solves who owns agent launch, skill/doc
  admission, tool catalog truth, `node_finish`, child-agent availability, and
  thin Execution Platform readback.

Best architecture:

```text
one OpenClaw implementation source tree
  -> native OpenClaw registry resolves agents/skills/tools from source
  -> OpenClaw sessions.launch admits provider context
  -> Runtime Home stores state only
  -> Execution Platform projects launch + node_finish only
```

Bad options:

- put all runtime state into repo as versioned source: unsafe secrets/state/logs/session churn;
- put all repo source into Runtime Home: loses versioned source truth and makes deployment state the implementation;
- keep both as semi-authoritative: preserves the current failure pattern.

Best option: repo/source is the only implementation authority; Runtime Home is
state-only; native launch consumes source-backed registry entries.

Correct model:

```text
one OpenClaw implementation source tree
  source code
  agent docs
  skills
  native tools
  schemas
  specs
  tests
  config defaults/templates
  native registry source

one Runtime Home / state area
  sessions
  auth
  secrets
  logs
  caches
  generated artifacts
  local overrides
  traces
```

Incorrect model:

```text
repo = custom work
Runtime Home = another semi-authoritative OpenClaw implementation
```

The repository/source tree is the only implementation authority. Runtime Home
is deployment state. Runtime Home may physically live beside the source tree or
inside it as a clearly gitignored state directory, but it must not become a
second source of first-party behavior.

Do not solve the split by putting all runtime state into the repo as versioned
source. That creates secret/session/log/artifact churn and unsafe durability.

Do not solve the split by putting all source into Runtime Home. That turns
deployment state into implementation truth and loses normal source-control
authority.

The target is:

```text
source-backed native registry entries
  -> native session.launch admission
  -> provider context

Runtime Home
  -> state, logs, sessions, overrides, diagnostics
```

If this topology is not true, worker bootstrap should treat it as an upstream
architecture blocker or migration prerequisite. Do not add more
Execution Platform-specific path aliases, materialization proofs, or
runtime-copy comparisons to compensate for two implementation roots.

## 1. Minimal Native Launch Contract

Execution Platform should call the normal native OpenClaw session launch API.

Target shape:

```ts
const launch = await openclaw.sessions.launch({
  agentId,
  prompt,
  metadata: { nodeRunId },
  ...(nodeWorkspaceOverride ? { cwd: nodeWorkspaceOverride } : {}),
});
```

If OpenClaw's existing native launch already carries prompt/cwd through another
native call shape, use that native shape instead. Do not invent an
Execution Platform-specific launch wrapper.

No Execution Platform-owned doc paths.

No Execution Platform-owned skill paths.

No Execution Platform-owned tool profile.

No Execution Platform-owned child-agent list.

No Execution Platform-owned bootstrap file list.

No Execution Platform-owned provider-context path matching.

No node-specific launch schema.

No Execution Platform-owned bootstrap/admission proof model.

## 2. Node Metadata Is Enough

`nodeRunId` belongs in native session metadata.

Do not create node-specific launch schemas or node-specific bootstrap models.

NodeLifecycleRunner maps native session events back to the node through:

```text
metadata.nodeRunId
```

## 3. Agent Pack Owns Operating Contract

Status: complete for the active launch contract. The execution-coding parent required skill list now resolves
from the native agent-pack registry `primarySkills` entry and is threaded
through start preflight, active skill loading, provider admission, and receipt
projection. The execution-coding expected child-agent set now resolves from
the native agent-pack registry `allowedChildAgents` entry and is threaded
through start preflight and native task-mode launch. Parent and scout
required/forbidden tool expectations now resolve from the native registry
`requiredTools` and `forbiddenTools` fields in the active path, and focused
registry/gateway tests prove those fields are parsed and enforced. Scout
required skill names now resolve from the scout pack `primarySkills` entries
in the active path. Parent and scout required bootstrap doc names now resolve
from native registry `requiredDocs` fields in the active path. The old
hardcoded parent/scout doc, skill, child-agent, required-tool, and
forbidden-tool fallback constants have been removed from the gateway and native
task helper paths; missing registry data now remains missing contract data
rather than being reconstructed by Execution Platform defaults. `node_finish`
and `openclaw_resource_read` are now admitted through the native runtime tool
and provider-effective catalog path for node sessions. The active gateway
start-preparation/provider-proof accumulator is now a local
`NodeAgentLaunchProofState` without artifact identity, not a durable
`NodeAgentStartReceipt`. Legacy `NodeAgentStartReceipt` contracts and readback
fields remain only to tolerate historical runs.
The real node-launch path now blocks before model invocation when the native
registry contract is missing or incomplete instead of silently reconstructing
execution-agent docs, skills, child agents, or tool expectations from fallback
constants.

OpenClaw native registry resolves:

```text
agentId -> agent pack / native agent config
```

The resolved native agent contract owns:

- required docs
- required skills
- tool profile
- permissions
- allowed child agents
- model/provider defaults if native registry supports them
- context budget requirements if native registry supports them
- node lifecycle tool availability when the agent is launched for node execution

Execution Platform does not separately know or enforce which docs, skills,
tools, permissions, or child agents belong to the agent.

## 4. `node_finish` Belongs In The Native Tool Profile

Status: complete for the active node-execution path. `node_finish` is no
longer attached as a late gateway `extraTools` artifact path. `runNodeAgentSession`
constructs the terminal lifecycle tool as a runner-owned native runtime tool,
then forwards it through `nativeRuntimeTools` into the normal OpenClaw tool
construction, policy filtering, native task catalog filtering, provider
effective-tool inventory, and `session.launch` provider-tool admission path.
`openclaw_resource_read` uses the same `nativeRuntimeTools` surface from the
node session executor. Focused tests prove native runtime tools are forwarded,
provider-effective catalogs include required node tools, forbidden parent
acquisition tools are hidden, and `node_finish` remains terminal lifecycle
evidence rather than an Execution Platform side channel.

`node_finish` availability belongs in the execution-coding agent pack/tool
profile for node sessions.

Execution Platform should not inject `node_finish` as a late extra tool after
launch.

OpenClaw makes `node_finish` provider-visible through the native effective tool
catalog. NodeLifecycleRunner still owns terminal acceptance/rejection when
`node_finish` is called.

## 5. Use Existing Native Registry Fields First

Do not create a second `agent.json` or Execution Platform-owned pack descriptor
if OpenClaw's existing native agent config already has fields for:

- tools
- permissions
- skills
- subagents / child agents
- docs / bootstrap files
- model defaults
- cwd defaults

Only add missing fields to the native OpenClaw registry/config surface.

A descriptor like this is useful only if native config lacks an equivalent:

```json
{
  "id": "execution-coding",
  "requiredDocs": ["IDENTITY.md", "AGENTS.md", "BOOTSTRAP.md", "TOOLS.md"],
  "requiredSkills": ["execution-node-workflow"],
  "toolProfile": "execution-coding",
  "allowedChildAgents": ["execution-context-scout", "execution-validation-scout"],
  "requiredTools": [
    "node_finish",
    "openclaw_resource_read",
    "edit",
    "update_plan",
    "read_todo",
    "task"
  ],
  "forbiddenTools": ["read", "list", "glob", "grep", "exec", "process"]
}
```

Scout packs use the same native shape with their own required skill and
narrower tool profile.

## 6. Native Registry, Not Execution Platform Registry

Do not create an Execution Platform registry for agent packs, docs, skills,
tools, or child agents.

There must be exactly one canonical native OpenClaw registry entry per
execution agent and per required skill.

No parallel source pack plus legacy docs path.

## 7. File Layout Is Registry-Resolved

File paths are implementation details of native registry resolution.

Acceptable source locations can include current implementation-source
locations or future native pack locations:

```text
docs/agents/execution-coding/runtime
docs/agents/execution-context-scout/runtime
docs/agents/execution-validation-scout/runtime

skills/execution-node-workflow/SKILL.md
skills/execution-context-scout/SKILL.md
skills/execution-validation-scout/SKILL.md
```

or:

```text
sourceRoot/.openclaw/agents/<agentId>
sourceRoot/.openclaw/skills/<skillName>
```

The invariant is one native registry authority, not one mandatory directory
spelling.

The registry must resolve from the implementation source tree, not from a
runtime-materialized copy. A runtime copy can be a generated compatibility
surface, but it cannot be a launch source.

## 8. Workspace Root Is Execution CWD, Not Agent Identity

`workspaceRoot` / `cwd` means the editable repo root/search root for the worker
session.

It is not agent identity.

It is not the source of first-party agent docs.

It is not the source of required skills.

Agent pack resolution is independent of the work repo path.

If native OpenClaw launch already has default cwd/project resolution,
Execution Platform should omit cwd unless it needs to select a specific node
worktree.

Every explicit path parameter is another drift point.

## 9. Runtime Home Is State-Only

`openclawHome` owns:

- sessions
- auth
- secrets
- model state
- local machine config
- logs
- artifacts
- caches
- receipts
- traces

It is not the canonical source for first-party execution docs, skills, tools,
permissions, schemas, specs, or worker identity.

Runtime Home may be a sibling of the source tree or a gitignored directory
under the source tree. Its physical location is less important than the
authority boundary: state belongs there, implementation does not.

Local runtime overrides can affect active deployment behavior only through
explicit native override semantics. They must not silently replace source-backed
first-party agent packs, docs, skills, tools, or permissions.

## 10. Runtime Materialized Docs/Skills Are Not Worker Bootstrap Inputs

Status: complete for parent and native task child worker-bootstrap doc/skill
source authority. Parent `execution-coding` docs and the active required
`execution-node-workflow` skill are source-backed for worker bootstrap and
provider admission. Native task child scout docs and active scout skills now
use the same source-backed provider-context admission contract before child
model invocation, without adding a second child-bootstrap registry.

Worker sessions must not read runtime-materialized first-party docs or skills.

Runtime-materialized copies may remain temporarily for UI or compatibility, but
they are not launch authority.

Worker bootstrap is:

```text
source-backed native registry -> source-backed pack/config -> native context assembler -> provider context
```

not:

```text
repo docs -> runtime materialized copy -> provider bootstrap
```

and not:

```text
runtime copy -> provider bootstrap because it happens to be the active file
```

Implementation checkpoint:

- `src/agents/agent-pack-registry.ts` is the OpenClaw-native source-backed
  agent-pack registry reader for this lane.
- Execution-platform agent docs resolve from `docs/agents/registry.yaml`
  entries, not from the source-runtime materialization manifest.
- `execution-coding` bootstrap reads
  `docs/agents/execution-coding/runtime/{IDENTITY.md,AGENTS.md,BOOTSTRAP.md,TOOLS.md}`.
- Mutable workspace bootstrap hooks and workspace-root compatibility
  canonicalization are skipped for source-backed execution-agent docs.
- Runtime Home agent directories remain valid state/auth/session locations,
  but are not accepted as first-party execution-agent doc source for provider
  admission.
- `src/agents/system-prompt-report.ts` supports exact required skill source
  admission through `skillSources`, including location, source ref, and source
  hash.
- `src/gateway/execution-platform-agent-team-runner.ts` derives the expected
  required skill source from `buildRequiredActiveSkillSnapshot` and passes that
  native skill-context source into the provider-context admission gate before
  the model call.
- `src/gateway/execution-platform-agent-team-runner.ts` resolves the parent
  required skill names from `docs/agents/registry.yaml` `primarySkills` for
  `execution-coding`, then uses the same registry-derived list for start
  preflight, active skill loading, provider-context admission, and receipt
  projection.
- `src/agents/agent-pack-registry.ts` parses `primarySkills` from
  `docs/agents/registry.yaml`; focused registry tests prove
  `execution-coding` declares `execution-node-workflow` there.
- `docs/agents/registry.yaml` declares `execution-coding.allowedChildAgents`
  as `execution-context-scout` and `execution-validation-scout`.
- `src/agents/agent-pack-registry.ts` parses `allowedChildAgents`, and
  `src/gateway/execution-platform-agent-team-runner.ts` resolves that list for
  start preflight and `nodeAgentNativeTaskMode.allowedAgentIds`.
- Runtime OpenClaw config/effective tool policy remains the permission gate:
  the registry declares the execution-coding pack contract, while native
  config proves those child agents are actually visible/allowed.
- Gateway receipt projection now follows the native admission decision for
  required skill admission instead of independently treating a non-empty skill
  block as sufficient.
- A stale Runtime Home `execution-node-workflow` skill with the right name is
  rejected when the node launch expects the repo/source-backed skill source.
- Native task child bootstrap admission resolves child scout docs from the
  source-backed agent registry and child scout skills from the native active
  skill snapshot.
- `task` passes the child source-backed `requiredProviderContextAdmission`
  contract into `spawnSubagentDirect`, and `spawnSubagentDirect` forwards it
  through the gateway `agent` launch request so the existing embedded-runner
  provider-context admission can block before the child provider turn.
- Post-run child bootstrap readback uses the same resolved child source
  contract for projection, so launch preflight and readback do not drift.
- A stale Runtime Home child scout doc/skill report is rejected when native
  task child admission expects source-backed child docs/skills.
- Focused tests:
  - `pnpm test:file src/agents/tools/native-task-tool.test.ts src/agents/subagent-spawn.workspace.test.ts src/agents/pi-embedded-runner/run.attempt-param-forwarding.test.ts src/agents/system-prompt-report.test.ts src/gateway/execution-platform-agent-team-runner.test.ts src/agents/bootstrap-files.test.ts src/agents/agent-pack-registry.test.ts`

## 11. Compatibility Materialization Sunset Is Operational

Status: complete for worker-bootstrap design. Node-start source/runtime
materialization is no longer launch authority, is not represented in worker
launch critical fields, and has no non-test worker-start call site.
The remaining materialization module is compatibility/migration tooling only;
it is not worker design.

Compatibility materialization belongs in migration cleanup docs, not the worker
design.

The worker refactor should simply stop using compatibility materialization.

Prove once that stale or absent runtime materialized copies do not affect worker
bootstrap, then remove that from recurring worker success gates.

Implementation checkpoint:

- `materializeSourceRuntimeBeforeBootstrapIfNeeded` is not called by the
  node-agent worker launch path.
- Worker launch projection does not carry materialization record/status fields.
- Source-backed parent and child provider-context admission rejects stale
  Runtime Home docs/skills even when names match.
- Compatibility materialization remains available only for operational
  migration cleanup surfaces outside worker launch.

Eventually:

- delete compatibility copies; or
- convert them to read-only generated UI surfaces; or
- keep them only behind explicit compatibility labeling.

## 12. Local Overrides Cannot Replace First-Party Packs

Runtime local overrides are allowed for:

- secrets
- auth
- local config
- environment-specific settings

They cannot replace required first-party execution docs, skills, tools,
permissions, or child-agent bindings in worker sessions.

## 13. One Native `session.launch` Event

Status: complete for the active launch path. Native session-owned `session.launch` state now exists and is
emitted from the embedded runner at the pre-provider admission seam, before
the model call. Native launch admission can now persist a launch-only
session-store entry even when no prior session entry exists, which lets
pre-model blocked admission be represented as native `session.launch` instead
of an Execution Platform start receipt. Node-agent trace/readback can project
the native launch ref. The redundant pre-session `NodeAgentStartReceipt`
artifact has been removed, native-session runs that return a session trace no
longer emit a post-session `NodeAgentStartReceipt` artifact, pre-session
start blockers are recorded as blocked native `session.launch`, prompt
authoring blockers keep only the prompt-authoring diagnostic, and native
session invocation failures are recorded as blocked native `session.launch`
with the worker-prompt artifact.

Do not create separate critical-path artifacts for:

- launch receipt
- bootstrap manifest
- admission receipt
- tool proof

OpenClaw emits one native bounded event/read model:

```text
session.launch
  admission.accepted | admission.blocked
  required_sources[]
  provider/tool catalog facts
  submitted_prompt_hash
  blockers[]
```

Execution Platform stores a pointer to this native event. The native event is
the artifact.

If OpenClaw does not already emit `session.launch`, implement that as a native
OpenClaw session event, not as an Execution Platform artifact.

Implementation checkpoint:

- `src/config/sessions/launch.ts` stores bounded session-owned launch state,
  with `session.launch` events, refs, admission status, blocker kind,
  provider/model/cwd, required source summaries, provider-visible tool names,
  allowed child agents, blockers, and reason codes. It now creates a bounded
  launch-only session entry by default when a native launch admission event is
  emitted before a session store entry exists.
- `src/agents/pi-embedded-runner/run/attempt.ts` emits this native launch
  event after provider-context/bootstrap/overflow prechecks have resolved and
  before `activeSession.prompt(...)` is called.
- A blocked pre-provider start can produce a launch-only native trace even if
  no tools or tasks ran.
- The native trace now carries a compact launch projection from the
  `session.launch` seam: launch ref, launch event ref, admission status,
  blocker kind, provider/model, cwd, reasoning/thinking, prompt hash match,
  and tool catalog ref.
- `extensions/execution-platform/src/workflows/node-agent-session.ts` projects
  `sessionLaunchRef`, `sessionLaunchEventRef`, and the compact launch
  projection from native trace facts.
- Work Queue active graph readback projects `sessionLaunchRef` and
  `sessionLaunchEventRef` from native launch/session trace facts before
  falling back to compatibility receipt metadata.
- Work Queue active graph readback projects launch admission status, blocker
  kind, and cwd from native launch/session trace facts before falling back to
  compatibility receipt metadata. A native accepted launch with no blocker no
  longer falls through to a stale legacy receipt blocker.
- The runner no longer writes a durable pre-session start receipt before
  native session invocation. Pre-session node-start blockers emit blocked
  native `session.launch` events. Prompt-authoring blockers do not emit a
  launch event because no launch input exists; they keep the bounded
  prompt-authoring diagnostic.
- Native session invocation failures no longer write a blocked terminal
  compatibility receipt. They emit a blocked native `session.launch` event and
  keep the worker-prompt artifact.
- Native-session runs that return a session trace no longer attach a
  post-session `NodeAgentStartReceipt` artifact, including post-session
  provider-proof blocker cases. Their launch evidence is the native
  `session.launch` projection carried by the node-agent session trace, plus
  bounded result metadata and reason codes.
- `NodeAgentStartReceipt` is no longer emitted as a durable gateway executor
  artifact. Gateway start-preparation/provider-proof state uses local
  launch-proof state without artifact identity; the exported
  `NodeAgentStartReceipt` contract remains legacy readback compatibility only.
- Focused tests:
  - `pnpm test:file src/config/sessions/launch.test.ts src/agents/pi-embedded-runner/run/attempt.test.ts extensions/execution-platform/src/workflows/node-agent-session.test.ts`
  - `pnpm test:file src/gateway/execution-platform-agent-team-runner.test.ts`
  - `pnpm test:file extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts`

## 14. Prompt Hash Handling

Execution Platform already has the worker prompt text when it calls launch.

OpenClaw emits the submitted prompt hash in `session.launch`.

Execution Platform may compare its local prompt hash against the native
submitted prompt hash at readback time or during launch-result projection.

Do not persist both `expectedPromptHash` and `submittedPromptHash` as separate
Execution Platform-owned truth fields.

Do not create a separate prompt-proof artifact if native `session.launch`
already records the submitted prompt hash.

## 15. Required Source Admission Is Native Diagnostic Detail

Required source admission entries can exist inside native OpenClaw launch
diagnostics:

```ts
{
  id: string;
  hash: string;
  bytes: number;
  truncated: boolean;
}
```

Do not include `kind` if the id already encodes `agent://` or `skill://`.

Execution Platform should not carry or validate the required source list as
lifecycle truth. It only projects the native launch event.

## 16. Required Source IDs Are Native Authority

Native OpenClaw may use stable IDs:

```text
agent://execution-coding/doc/IDENTITY.md
agent://execution-coding/doc/AGENTS.md
agent://execution-coding/doc/BOOTSTRAP.md
agent://execution-coding/doc/TOOLS.md

agent://execution-context-scout/doc/IDENTITY.md
agent://execution-context-scout/doc/AGENTS.md
agent://execution-context-scout/doc/BOOTSTRAP.md
agent://execution-context-scout/doc/TOOLS.md

agent://execution-validation-scout/doc/IDENTITY.md
agent://execution-validation-scout/doc/AGENTS.md
agent://execution-validation-scout/doc/BOOTSTRAP.md
agent://execution-validation-scout/doc/TOOLS.md

skill://execution-node-workflow/SKILL.md
skill://execution-context-scout/SKILL.md
skill://execution-validation-scout/SKILL.md
```

Paths are diagnostics only. IDs plus hashes are native authority.

Execution Platform should not know or persist this list as an Execution
Platform critical-path model.

## 17. Admission Uses IDs And Hashes Natively

Admission must not rely on:

- basename matching
- path normalization
- alias matching
- runtime file existence
- materialization records
- provider report path/name comparison
- Execution Platform canonical doc path lists

Admission succeeds only if the native context assembler selected required
source IDs and injected those exact sources into provider context.

This is native OpenClaw launch validity, not Execution Platform validation.

## 18. Required Context Is Non-Evictable

Required docs and active required skills get reserved context budget.

They cannot be displaced by:

- model memory overlays
- optional project context
- optional workspace files
- optional skill catalog
- verbose tool descriptions
- compatibility docs

If required context cannot fit, native launch blocks before provider
invocation.

This is an OpenClaw context-assembler invariant, not an Execution Platform
worker-runner responsibility.

## 19. Required Docs And Skills

Required docs for each execution agent:

```text
IDENTITY.md
AGENTS.md
BOOTSTRAP.md
TOOLS.md
```

Required skills are declared by the native agent pack/config, for example:

```text
execution-node-workflow
execution-context-scout
execution-validation-scout
```

Execution Platform should not separately know or enforce those skill names.

Implementation checkpoint:

- parent `execution-coding` required skill names now come from the native
  `docs/agents/registry.yaml` `primarySkills` entry;
- parent `execution-coding` expected child-agent ids now come from the native
  `docs/agents/registry.yaml` `allowedChildAgents` entry;
- parent `execution-coding` required bootstrap doc names now come from the
  native `docs/agents/registry.yaml` `requiredDocs` entry in the active path;
- parent `execution-coding` required and forbidden tool expectations now come
  from the native `docs/agents/registry.yaml` `requiredTools` and
  `forbiddenTools` entries in the active path;
- native task child scout required bootstrap doc names now come from each
  scout pack `requiredDocs` entry in the active path;
- scout required skill names now come from each scout pack `primarySkills`
  entry in the active path;
- scout required and forbidden tool expectations now come from each scout pack
  `requiredTools` and `forbiddenTools` entries in the active path;
- the old hardcoded parent skill fallback has been removed from the gateway
  launch-preparation and provider-admission helper path;
- the old hardcoded scout-agent fallback has been removed from the gateway
  launch-preparation path;
- the old hardcoded parent/scout tool expectation fallback lists have been
  removed from the gateway and native-task helper paths;
- the old hardcoded parent/scout doc-name fallback lists have been removed
  from the gateway and native-task helper paths;
- focused tests now pass explicit registry-derived doc, skill, child-agent,
  required-tool, and forbidden-tool contract data into helper paths that need
  those expectations, so the tests no longer normalize hidden EP defaults;
- real node launch now fails closed with
  `node_agent_registry_contract_incomplete` when the execution-coding pack or
  required scout pack contract is absent or lacks required docs, skills, child
  agents, required tools, or forbidden tools.

Missing, empty, or truncated required sources block before model invocation
through native launch admission.

## 20. Fail Closed Before Model Invocation

Native launch blocks if:

- workspace/cwd cannot be resolved when required for execution
- OpenClaw runtime state is unresolved
- agent registry entry is missing
- agent pack/config is missing
- required doc is missing
- required skill is missing
- source hash is unavailable
- required injected bytes are zero
- required source is truncated
- submitted prompt hash cannot be emitted
- tool profile does not match agent pack/config
- child-agent set does not match agent pack/config
- `node_finish` is not in the native effective tool catalog for node execution
- native `session.launch` event cannot be emitted

No "mostly configured" worker starts.

## 21. Tool Catalog Facts Stay Native

Status: complete for active launch/readback projection. Provider-visible tool
names are captured from the native effective tool inventory after native
runtime tools, native task filtering, scout filtering, and provider/tool-policy
filters have run. Native `session.launch` carries the compact tool-catalog
projection/ref, and Execution Platform readback projects that native fact
instead of computing a separate tool-catalog truth object.

Use native provider-visible tool catalog facts from `session.launch`.

Do not store standalone `toolCatalogHash` as Execution Platform-owned truth.

If OpenClaw has a `tool_catalog_ref`, keep it in the native event. Execution
Platform may display it on demand, but it should not become an
Execution Platform critical-path field.

## 22. Source-Runtime Manifest Becomes Topology Documentation

The source-runtime manifest may document:

- workspace/source location
- openclawHome/runtime location
- compatibility aliases
- runtime file classes
- legacy/materialized compatibility surfaces
- drift warnings

It must not be worker-start authority.

## 23. Hot Patches Are Admin-Only

Hot patches stay outside ordinary worker bootstrap and node execution.

Rules:

- record before hash
- record after hash
- classify path
- emit admin receipt
- reconcile behavior changes into source
- never promote runtime edits into source truth silently

## 24. Source Editing Authority

Execution agents inspect and edit source through `workspaceRoot` / cwd.

Runtime home inspection is only for bounded diagnostics:

- session traces
- artifacts
- local overrides
- logs
- state/debug evidence

Runtime home should not be needed to understand first-party OpenClaw behavior.

## 25. Readback Is Thin

Status: complete for the active readback path. Readback now projects native `session.launch` refs from the
node-agent trace first. It also projects launch admission status, blocker kind,
and cwd from the compact native launch projection before falling back to
compatibility receipt metadata. The pre-session start receipt artifact has been
removed, and accepted native-session runs no longer emit a success-path start
receipt artifact. Native-session runs that return a session trace no longer
emit a post-session start receipt artifact at all. Pre-session start blockers
and invocation failures now record blocked native `session.launch` events
instead of compatibility start receipt artifacts. Legacy readback fields still
accept historical `NodeAgentStartReceipt` refs for old runs, but they are not
current worker-launch truth.

Execution Platform readback stores/projects only:

```text
nodeRunId
agentId
sessionId/sessionKey
sessionLaunchEventRef
nodeFinishRef
nodeFinishStatus
```

If a denormalized read model needs display fields, it may project them from
`session.launch`, but they must not become independently computed
Execution Platform truth:

```text
admissionStatus
blockerKind
promptHashMatch
```

Optional display-only details are fetched from native `session.launch` on
demand.

Readback must not re-run path matching or become a second admission engine.

## 26. Execution Platform-Critical Fields

Status: complete for active worker launch. `sessionLaunchRef` and `sessionLaunchEventRef` are now present
as native pointers, and readback now has native launch admission/cwd projection
through the node-agent session trace. Accepted native-session runs do not emit
a success-path start receipt artifact, and post-session provider-proof blockers
also avoid start receipt artifact emission once a native session trace exists.
Pre-session start blockers and invocation failures also avoid start receipt
artifact emission and use native blocked `session.launch` instead. The active
gateway proof state is no longer artifact-shaped; legacy readback fields still
tolerate historical receipt refs.

Keep only:

```text
nodeRunId
agentId
sessionId/sessionKey
sessionLaunchEventRef
nodeFinishRef
```

Everything else is native OpenClaw session/runtime fact.

Even `admissionStatus` and `blockerKind` should be treated as projection fields
from the native event, not Execution Platform-owned lifecycle truth.

## 27. Drop From Worker Critical Path

Status: complete for the active worker critical path. Compatibility materialization is out of the worker launch
critical path, native launch refs exist, and `node_finish`/`openclaw_resource_read`
now move through the native runtime tool path. The pre-session start receipt artifact is no
longer emitted. Readback now prefers native launch/session trace fields for
launch admission status, blocker kind, and cwd. Post-session native trace paths
no longer emit start receipt artifacts. Pre-session start blockers and
invocation failures now emit blocked native `session.launch` instead of start
receipt artifacts. The active gateway proof state is no longer artifact-shaped.
Remaining compatibility is legacy readback support for old
`NodeAgentStartReceipt` artifacts, not active worker launch design.

Drop:

```text
runtimeAliasPath
materialized doc records
materialized skill records
EP canonical doc path lists
basename/path admission fields
hot-patch drift fields
duplicate materialization gates
standalone toolCatalogHash without catalog ref
separate bootstrap/admission artifacts when session.launch already contains the facts
requiredProfile if agent pack already declares the tool profile
requiredToolProfile if agent pack already declares the tool profile
child-agent list from EP launch input if agent pack declares allowed child agents
sourceRoot/projectRoot duplication in the worker launch contract
EP knowledge of required skill names
EP knowledge of required source ids
expectedPromptHash as an EP-persisted critical field
submittedPromptHash as an EP-persisted critical field
toolCatalogRef as an EP-persisted critical field
agentPackId as an EP-persisted critical field
admissionStatus as independently computed EP truth
blockerKind as independently computed EP truth
recurring stale-runtime-copy gates after one-time migration proof
compatibility materialization as part of worker design
late EP extraTool injection for node_finish
EP bootstrap-internal validation
```

Current reduction:

- parent execution-coding required skill names are no longer owned by the
  gateway critical path when the native registry entry is present;
- parent execution-coding expected child-agent ids are no longer owned by the
  gateway critical path when the native registry entry is present;
- parent execution-coding required bootstrap doc names are no longer owned by
  the gateway critical path when the native registry entry is present;
- parent execution-coding required/forbidden tool expectations are no longer
  owned by the gateway critical path when the native registry entry is present;
- scout required bootstrap doc names, required skill names, and
  required/forbidden tool expectations are no longer owned by the gateway or
  native-task critical path when native scout registry entries are present;
- compatibility fallback doc/skill/tool constants for missing/minimal registry
  entries have been retired from the gateway and native-task helper paths;
- the real executor already treats missing/incomplete native registry contract
  fields as a typed pre-model blocker rather than using those fallback
  constants as launch authority.

## 28. Focused Launch Success Gates

Keep launch gates focused on the actual failure class:

- one implementation source tree is the native launch authority
- Runtime Home is state-only and cannot override first-party launch sources
- native launch receives source-backed docs/skills
- prompt is submitted byte-exact
- provider-visible tool catalog is correct
- `node_finish` is present through the native tool profile for node execution
- child agents are available through native registry/config
- native `session.launch` accepted/blocked status is emitted
- Execution Platform readback projects native launch result
- worker cannot start without exact native launch admission

Broader assertions about task delegation, context scout output, validation
scout behavior, file graph, working ledger, edit loop, repair loop, and
long-term agent behavior are separate worker-loop gates, not source/runtime
bootstrap gates.

## 29. NodeLifecycleRunner Logic

NodeLifecycleRunner logic becomes:

```text
if launch.blocked:
  node start blocked

if launch.accepted:
  node running

if node_finish received:
  accept/reject terminal state
```

OpenClaw owns all launch validity.

NodeLifecycleRunner owns lifecycle projection and terminal acceptance.

## 30. Final Ownership

```text
OpenClaw source repo:
  first-party behavior, agents, skills, tools, permissions, schemas, specs

OpenClaw runtime home:
  state, auth, sessions, logs, artifacts, local config, traces

OpenClaw native runtime:
  agent registry, skill registry, launch admission, provider bootstrap,
  tool catalog, permissions, child agents, session events

Execution Platform:
  node lifecycle, worker prompt handoff, node_finish acceptance,
  readback projection
```

The central simplification: a node worker launch is a normal native OpenClaw
agent launch with `metadata.nodeRunId` and node lifecycle tooling. OpenClaw
owns the agent contract and emits the native `session.launch` event. Execution
Platform stores a pointer to that event and projects launch/finish status into
node lifecycle.
