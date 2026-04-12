# Host Structure First-Principles Refactor Diagnosis

Date: 2026-04-12

## Purpose

Evaluate the current host, repo, workspace, import, and runtime layout from
first principles, then define the target structure that would make the host
easier to navigate, easier to operate, and harder to misunderstand.

This document is intentionally critical. The point is not to justify the
current structure. The point is to identify where the current structure reflects
history more than design.

## Exact Evidence Reviewed

Filesystem and repo roots reviewed:

- `/root/services/openclaw-upgrade-2026.3.24`
- `/root/services/openclaw`
- `/root/openclaw-config`
- `/root/openclaw-workspace`
- `/root/.openclaw/workspace`
- `/root/.openclaw`

Workspace and import entrypoints reviewed:

- `/root/.openclaw/workspace/AGENTS.md`
- `/root/.openclaw/workspace/projects/INDEX.md`
- `/root/.openclaw/workspace/projects/memory/INDEX.md`
- `/root/.openclaw/workspace/imports/IMPORTS_INDEX.md`
- `/root/.openclaw/workspace/imports/engineering_repo/INDEX.md`
- `/root/.openclaw/workspace/imports/live_openclaw_stack/INDEX.md`
- `/root/.openclaw/workspace/imports/runtime_state/INDEX.md`
- `/root/.openclaw/workspace/core/WORKSPACE_STRUCTURE.md`

Other structure evidence reviewed:

- `/root/openclaw-config/README.md`
- `/root/openclaw-workspace/AGENTS.md`
- `/root/openclaw-workspace/BOOTSTRAP.md`
- `/root/openclaw-workspace/BOOT.md`
- `/root/services/openclaw/docker-compose.yml`
- `/root/services/openclaw/README.md`
- `/root/.openclaw/openclaw.json`

Repo/state evidence reviewed:

- git remotes and git status for:
  - `/root/openclaw-workspace`
  - `/root/.openclaw/workspace`
  - `/root/openclaw-config`
- top-level directory listings for the roots above
- container/image-related root files in:
  - `/root/services/openclaw-upgrade-2026.3.24`
  - `/root/services/openclaw`

## Current-State Structure Summary

### 1. The host currently has two different workspace roots

There are two separate git roots that both present themselves as "the
workspace":

- `/root/openclaw-workspace`
- `/root/.openclaw/workspace`

They are not the same checkout:

- `/root/openclaw-workspace` is clean, smaller, and bootstrap-oriented
- `/root/.openclaw/workspace` contains the richer active structure:
  - `core/`
  - `imports/`
  - `projects/`
  - `runbooks/`
  - `archives/`
  - `audits/`
  - `system/`

The active runtime workspace docs explicitly say the canonical shared workspace
root is `/root/.openclaw/workspace`, but the existence of `/root/openclaw-workspace`
creates a second human-facing interpretation of "the workspace".

That is a real design problem, not just a cosmetic naming problem.

### 2. The product code exists in at least two full repo checkouts

There are two full OpenClaw repo roots on the host:

- `/root/services/openclaw`
- `/root/services/openclaw-upgrade-2026.3.24`

Both point at the same upstream remotes. Both contain product source, Docker
build surfaces, and deployment-adjacent files.

Current role split appears to be:

- `/root/services/openclaw`
  - live stack / compose root
- `/root/services/openclaw-upgrade-2026.3.24`
  - engineering checkout / deeper implementation work

That role split is understandable, but the physical representation is still
heavy and ambiguous because both are full checkouts of the same repo.

### 3. Runtime state and operator workspace are tightly interleaved

The runtime state root is `/root/.openclaw`.

That root contains:

- gateway/runtime config
- sessions
- agent workspaces
- the active shared workspace

This is convenient, but it mixes:

- mutable runtime state
- operator-facing workspace navigation
- curated import routing

into one broad state root.

That is survivable, but not first-principles clean.

### 4. The import model is strong, but it sits on top of a confusing base layout

The curated import layer is one of the cleanest parts of the current system.

The live workspace defines stable read-only aliases for:

- live stack repo
- engineering repo
- runtime state
- webhook gateway
- agent workspaces
- backups
- n8n data

This is good.

The problem is that the import layer is compensating for ambiguity below it:

- multiple product checkouts
- multiple workspace roots
- runtime state doubling as a workspace host

The import layer is cleaner than the underlying host layout.

### 5. Project tracking and implementation truth are conceptually improving, but the host layout still obscures the model

The live workspace is already moving in the right direction:

- `projects/` is the project/re-entry layer
- curated imports point to repo-canonical implementation truth
- workspace docs explicitly describe continuity vs implementation boundaries

That part is directionally correct.

The structural problem is that an operator still has to know historical facts
like:

- the "real" workspace is under `.openclaw/workspace`
- the other workspace repo is not the live canonical workspace
- the engineering repo is a curated import inside the workspace
- the live stack repo is a different checkout of the same product repo

That is too much hidden context for a system that claims to be discoverable.

## What The Current Structure Is Doing Wrong

### 1. It has two human-facing workspace roots

This is the largest structural flaw.

If a system has two plausible answers to "where is the workspace?", it does not
have one canonical workspace.

The current system effectively has:

- a bootstrap/template-style workspace repo
- a richer live runtime workspace repo

Both are real. Both are git repos. Both are called workspace.

That is not acceptable as a first-principles design.

### 2. It duplicates product-repo ownership instead of modeling role explicitly

The host has two full OpenClaw checkouts because there are two roles:

- live/deploy
- engineering/change

That role distinction is valid.

The problem is that the host encodes it as two separate full repo roots with
historical names instead of a clean role model.

That creates confusion around:

- which checkout is authoritative for what
- where image/build truth lives
- where compose truth lives
- what should be mounted into the workspace

### 3. Runtime state is too close to navigation structure

The active workspace living inside `/root/.openclaw` means the operator-facing
navigation layer is physically nested under runtime state.

That has costs:

- it blurs "state" vs "workspace"
- it makes backup/sync intent less obvious
- it encourages generated/runtime material and curated/operator material to mix

### 4. The current structure still requires tribal knowledge

An operator has to know things like:

- use the live workspace, not the smaller workspace repo
- use curated imports instead of raw hostfs
- use the engineering checkout for canonical implementation truth
- use the live stack repo for compose/runtime wiring

Those are reasonable rules individually.

The problem is that the filesystem layout does not make those rules obvious.

### 5. The names reflect history more than function

Examples:

- `openclaw-upgrade-2026.3.24` is a historical working name, not a canonical
  role name
- `openclaw-workspace` and `.openclaw/workspace` are both plausible canonical
  names for the same conceptual layer
- `live_openclaw_stack` vs `engineering_repo` are clearer than the raw host
  roots, which is a sign the import layer is doing interpretive work the host
  should not require

## First-Principles Target Structure

If this host were designed from scratch today, it should be organized around
explicit roles, not historical artifacts.

### 1. One canonical operator workspace root

There should be exactly one human-facing workspace root.

That root should contain:

- operator docs
- re-entry indexes
- project tracking
- audits
- runbooks
- curated import indexes
- workspace-local scripts

Recommended model:

- keep exactly one canonical live workspace root
- demote any template/bootstrap workspace repo out of the default navigation path

The current live runtime workspace already behaves like the canonical one, so
the cleanest target is:

- canonical workspace: one root only
- template/bootstrap workspace: optional separate seed/template, not a peer canonical root

### 2. One runtime-state root

Runtime state should be its own root, clearly separate from operator navigation.

It should contain:

- config
- credentials
- sessions
- logs
- caches
- generated agent state

It should not also be the place where humans conceptually "go to the workspace"
unless there is a very good reason.

First-principles model:

- workspace root and runtime-state root are distinct concepts
- if they live near each other physically, the naming must still make the
  difference explicit

### 3. One product repo, with role-specific views instead of duplicate anonymous checkouts

The host should model product roles explicitly.

There are two legitimate roles:

- engineering worktree
- live/deploy worktree

From scratch, I would not model that as two unrelated full clones.

I would use one canonical product repo with explicit role-specific worktrees, or
one product repo plus one clearly named deploy view.

Preferred target:

- `repos/openclaw/dev`
- `repos/openclaw/live`

or equivalent explicit role naming.

That preserves isolation while removing the "which full clone is which?" tax.

### 4. One explicit ops/config repo, if it still earns its keep

A separate config/disaster-recovery repo is reasonable if it owns:

- sanitized structural config
- infra rebuild notes
- other non-secret operator recovery material

That repo should not quietly become a second workspace, a second runtime root,
or a shadow project index.

Its role should remain narrow and explicit:

- DR/ops config only

### 5. Curated imports should remain, but point into a simpler underlying model

The curated import layer is good and should stay.

But its targets should become cleaner:

- canonical workspace root
- product repo role views
- runtime-state root
- ops/config repo
- auxiliary service repos

Imports should expose stable named surfaces, not compensate for a structurally
confusing filesystem.

### 6. Project tracking should live in one place only

Project tracking should live in the canonical workspace project tree.

Implementation truth should live in the owning repo.

That boundary is already directionally correct and should be retained:

- workspace = coordination, re-entry, cross-project routing
- owning repo = canonical implementation truth

### 7. Deployment and image ownership should be explicit

The system currently has Docker build surfaces in the product repo and live
compose wiring in the live checkout. That is workable, but the host-level role
needs to be explicit.

First-principles target:

- image build truth belongs to the product repo
- deployment wiring belongs to the live/deploy role
- image consumption should reference explicit role-owned artifacts, not rely on
  ambiguous duplicate full checkouts

## Recommended Target Layout

One clean model would look like this:

```text
/root/openclaw/
  workspace/                 # one canonical operator workspace root
  state/                     # runtime config, sessions, logs, credentials, caches
  repos/
    openclaw/
      dev/                   # engineering worktree
      live/                  # live/deploy worktree
    webhook-gateway/         # sibling service repo if still separate
    openclaw-config/         # optional DR/ops repo
  imports/                   # optional host-level mount descriptors if needed
```

Inside the canonical workspace:

```text
workspace/
  AGENTS.md
  MEMORY.md
  core/
  imports/                   # curated aliases into repos/state/services
  projects/
  runbooks/
  audits/
  archives/
  scripts/
```

Inside runtime state:

```text
state/
  openclaw.json
  credentials/
  sessions/
  agent-workspaces/
  caches/
  logs/
```

This is materially easier to explain than the current structure.

## Migration Delta: Current To Target

### Priority 1. Pick one canonical workspace root

Recommended move:

- keep the richer live workspace as canonical
- demote `/root/openclaw-workspace` to a template/bootstrap repo or remove it
  from the default operator path

Concrete normalization:

- stop presenting both roots as equivalent workspace surfaces
- if the bootstrap repo still matters, rename/reposition it to something like a
  template or seed workspace
- keep all active project/index/routing truth in one workspace only

### Priority 2. Normalize the product-repo role split

Recommended move:

- replace the concept of "two different full OpenClaw roots" with an explicit
  role model

Concrete normalization:

- adopt role-named worktrees or role-named repo roots
- make `dev` vs `live` explicit in the path names
- make curated imports point to those role names, not to historically named
  checkouts

### Priority 3. Separate workspace identity from runtime-state identity

Recommended move:

- stop making the operator-facing workspace concept depend on being nested under
  the runtime-state root

Concrete normalization options:

- physically separate workspace and state roots, or
- keep current physical placement temporarily but make naming and docs explicit
  that the workspace is a distinct conceptual root and the only canonical one

### Priority 4. Keep the curated import model, but simplify the import graph

Recommended move:

- retain curated imports
- update import targets and names after root normalization

Concrete normalization:

- one workspace import index
- one runtime-state import
- explicit repo-role imports such as `product_dev`, `product_live`, or similar
- auxiliary service imports only where they earn their keep

### Priority 5. Narrow the config repo to one job

Recommended move:

- keep `openclaw-config` only if it remains strictly DR/ops-oriented

Concrete normalization:

- keep sanitized config and rebuild notes there
- do not let it evolve into another workspace, project tree, or general-purpose
  docs repo

## What Should Remain Unchanged

These parts of the current model are already good enough to preserve:

### 1. Curated imports as the default high-signal navigation layer

This is the right idea and should remain.

### 2. The distinction between workspace coordination and repo-canonical implementation truth

This is also the right idea and should remain.

### 3. Read-only host visibility for broader discovery

The hostfs plus curated-import model is reasonable as long as curated imports
stay the default path.

### 4. A separate config/disaster-recovery repo, if it stays narrow

That role is defensible.

## What Should Explicitly Not Be Done

- Do not keep two human-facing canonical workspace roots.
- Do not keep relying on historical checkout names as functional role names.
- Do not move canonical implementation docs into the workspace project tree.
- Do not collapse runtime state, operator workspace, and product code into one
  giant root.
- Do not make raw hostfs traversal the normal operator path when curated imports
  already exist.
- Do not preserve duplicate product checkouts forever when the real difference
  is role.

## Highest-Value Next Normalization Moves

1. Canonicalize one workspace root and demote the other to template/seed status.
2. Rename or replace the duplicate OpenClaw repo checkouts with explicit role
   names or worktrees.
3. Make the workspace/state boundary explicit in both paths and docs.
4. Re-point curated imports after the role normalization so the import layer
   reflects function, not history.

## Bottom Line

The current host is not random, but it is historically accreted.

Its cleanest parts are:

- the curated import model
- the workspace-vs-implementation source-of-truth model

Its weakest parts are:

- two competing workspace roots
- duplicate full product checkouts encoding role indirectly
- runtime state and operator workspace living too close together

If this were designed from scratch today, it would have:

- one canonical workspace
- one runtime-state root
- one product repo with explicit live/dev role views
- one narrow config/DR repo
- one curated import layer reflecting those explicit roles

That is the structure that would actually remove navigation ambiguity instead of
teaching operators to memorize it.
