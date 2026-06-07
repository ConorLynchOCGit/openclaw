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
- fork-transition migration receipt path
- dirty-worktree reconciliation path
- runtime file classes
- execution-agent materializations
- execution-skill materializations
- active config requirements
- split-filesystem workaround repair success gates

The clean model is one OpenClaw implementation root plus one runtime state
area.

The implementation root owns source code, skills, native tools, schemas, and
specs. The runtime state area owns sessions, auth, secrets, logs, caches,
generated artifacts, and local overrides.

Those can physically live under one top-level directory if runtime state is
isolated and ignored, for example:

```text
/root/openclaw/
  repo/                  # versioned source truth
  runtime/               # gitignored state home
```

or:

```text
/root/services/openclaw-roles/live/
  src/
  docs/
  skills/
  .openclaw/runtime/     # gitignored state home
```

The bad version is:

```text
repo = our custom implementation
runtime home = another semi-authoritative OpenClaw implementation
```

That creates stale docs, stale skills, wrong bootstrap paths,
`/root` vs `/home/node` drift, and duplicate admission/materialization logic.

The source/runtime answer is to collapse to one implementation source tree.
Runtime Home remains only state. If Runtime Home physically sits inside the
repo, that is acceptable only when it is clearly state-only, gitignored, and
cannot override first-party packs except through explicit local override
semantics.

This registry is the topology foundation underneath
`docs/projects/execution-platform/specs/native-session-launch-worker-bootstrap.md`.
It does not replace native session launch. It ensures native session launch
consumes source-backed registry entries rather than stale runtime copies.

Runtime cleanup is part of Phase 0. The current Runtime Home is too large to
move blindly into the repo-local runtime target. The inventory found generated
session compaction checkpoint snapshots as the dominant ballast class, plus a
large legacy/runtime-host tree that must be classified before relocation.
Cleanup must happen before the physical move:

- classify Runtime Home state by class;
- preserve auth, secrets, local overrides, and current session state;
- prune generated checkpoint snapshots only through native session maintenance
  or after explicit operator approval;
- classify the old runtime-host tree as retained state, archive candidate, or
  deletion candidate;
- keep growth guards in native session maintenance so Runtime Home cannot
  silently regrow into another opaque 200G+ pile.

After `origin` is migrated to the OpenClaw fork, the fork-transition readiness
record is a static migration/topology receipt. It should not be treated as a
live dirty-worktree gate that must be refreshed after every ordinary patch.
Current dirty-state truth comes from `git status --porcelain=v1` or from an
explicitly regenerated dirty-worktree reconciliation inventory.

The dirty-worktree reconciliation record is a bounded on-demand migration aid.
It stores path/status/category/action inventory only; source contents, provider
logs, command logs, transcripts, hidden reasoning, secrets, and unbounded
runtime outputs stay out of the record.

Current recovery status:

- the runtime alias target has moved to repo-local `.openclaw/runtime`;
- `/root/.openclaw` and `/home/node/.openclaw` are compatibility symlinks to
  that repo-local runtime;
- the repo-local Runtime Home now physically sits under the implementation
  root at `/root/services/openclaw-roles/live/.openclaw/runtime`;
- `findmnt -R` reports no nested mounts under that Runtime Home;
- a bounded source-signature scan under Runtime Home returns zero source
  checkout indicators;
- repo-local Runtime Home is about 1.3M after the checkpoint prune and source
  bind-mount cleanup, not the prior hundreds-of-GB generated checkpoint pile;
- active `.env` and `openclaw.json` have been restored from validated recovery
  candidates, backed up outside Runtime Home, and proven through disk config
  load, live `config.get`, Execution Platform DB readiness, and Work Queue
  list readback;
- the stale retired `plugins.entries.memory-middleware` config entry has been
  removed from active config and from the recovery candidate, with redacted
  proof at
  `.openclaw/runtime/recovery/openclaw.memory-middleware-warning-cleanup.latest.redacted.json`;
- `.openclaw/runtime/host-operator/openclaw-live` was a bind mount of the repo
  source into Runtime Home, not a normal duplicate copy; it was explicitly
  unmounted and removed as an empty mountpoint;
- `.openclaw/runtime/workspace/imports/product_live/content` was also a bind
  mount of the repo source into Runtime Home; it was explicitly unmounted and
  removed as an empty mountpoint;
- source-mount cleanup evidence is preserved at
  `.openclaw/runtime/recovery/duplicate-runtime-bind-mount-unmount.latest.redacted.json`,
  `.openclaw/runtime/recovery/duplicate-runtime-empty-mountpoint-rmdir.latest.redacted.json`,
  `.openclaw/runtime/recovery/workspace-import-product-live-unmount.latest.redacted.json`,
  and
  `.openclaw/runtime/recovery/runtime-home-source-mount-removal-postflight.latest.redacted.json`;
- recovered environment material proves model/provider and model-memory/n8n
  credentials can be recovered;
- the first recovered running-container DB pointer reached model-memory rows
  but not the Work Queue truth database;
- a redacted Codex-log recovery scan first found a model-memory DB pointer
  candidate with Work Queue rows, and a deeper scan found a stronger dedicated
  `execution_platform` DB pointer candidate with hash prefix
  `ef6d35b30b3aa959`;
- the dedicated candidate is now preserved as
  `.openclaw/runtime/recovery/execution-platform-db.latest.env`, with redacted
  proof at
  `.openclaw/runtime/recovery/execution-platform-db.latest.redacted.json`;
- that dedicated recovered candidate contains nonzero Execution Platform Work
  Queue tables and rows, resolves as
  `env:EXECUTION_PLATFORM_DATABASE_URL`, and passes focused read-only
  readiness with no missing required tables or migrations;
- redacted readiness proof is preserved at
  `.openclaw/runtime/recovery/execution-platform-db.dedicated-readiness.latest.redacted.json`;
- non-active restart candidates now exist at
  `.openclaw/runtime/recovery/env.rebuild-candidate.latest.env` and
  `.openclaw/runtime/recovery/openclaw.rebuild-candidate.latest.json`;
- the live gateway Work Queue list route still returns active
  `execution_platform_work_queue_db` items, but Docker env inspection does not
  expose `EXECUTION_PLATFORM_DATABASE_URL` or `MODEL_MEMORY_DATABASE_URL`;
- gateway `config.get` now returns a valid restored disk snapshot with zero
  issues, and the active Execution Platform DB pointer is restored through
  `env.vars.EXECUTION_PLATFORM_DATABASE_URL`;
- redacted active-config readiness proof is preserved at
  `.openclaw/runtime/recovery/active-config-recovery-readiness.latest.redacted.json`;
- duplicate Runtime Home implementation checkout inventory is preserved at
  `.openclaw/runtime/recovery/duplicate-runtime-checkout-inventory.latest.redacted.json`;
- therefore Phase 0's file-structure predicate is complete for the current
  topology: the implementation source tree is the only first-party source
  authority, Runtime Home is state-only, and worker launch/bootstrap work can
  resume without adding more split-filesystem workarounds.
