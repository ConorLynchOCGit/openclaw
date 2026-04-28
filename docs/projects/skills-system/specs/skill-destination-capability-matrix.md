---
summary: "Path-level read, write, install, promotion, and approval authority for OpenClaw and Codex skill destinations."
title: "Skill Destination Capability Matrix"
---

# Skill Destination Capability Matrix

## Objective

Define exact path-level destination authority for skill files.

This must be explicit, not inferred from general loader behavior.

The core rule is:

- OpenClaw must eventually be able to read all relevant skill destinations
- it must not automatically write all destinations by default
- write authority is destination-specific, risk-tier-specific, and rollback-safe

Milestone 1 defines the contract only.

Milestone 2 and Milestone 3 should enforce this matrix in code.

Milestone 3 enforcement scope:

- draft package generation may write only to the allowed workspace-local draft
  targets
- no automatic write path may target repo-bundled, machine-wide shared, plugin,
  or Codex-global skill roots in this milestone
- workspace-local draft packages must remain review-only and must not silently
  become promoted active skills

## Capability dimensions

Each destination must declare:

- readable
- writable
- installable
- auto-promotable
- requires host-operator
- requires repo branch or worktree
- requires explicit approval
- forbidden

## Destination matrix

| Destination                          | Readable | Writable | Installable | Auto-promotable | Requires host-operator | Requires repo branch/worktree | Requires explicit approval                 | Forbidden |
| ------------------------------------ | -------- | -------- | ----------- | --------------- | ---------------------- | ----------------------------- | ------------------------------------------ | --------- |
| `skills/<name>/`                     | yes      | bounded  | yes         | no direct       | no                     | yes                           | yes for direct promotion                   | no        |
| `<workspace>/skills/<name>/`         | yes      | yes      | yes         | yes, low-risk   | depends on runtime     | no                            | not for low-risk limited                   | no        |
| `<workspace>/.agents/skills/<name>/` | yes      | yes      | yes         | scoped only     | depends on runtime     | no                            | usually no for low-risk scoped experiments | no        |
| `~/.agents/skills/<name>/`           | yes      | bounded  | yes         | no, early       | often yes              | no                            | yes                                        | no        |
| `~/.openclaw/skills/<name>/`         | yes      | bounded  | yes         | no, early       | often yes              | no                            | yes                                        | no        |
| plugin skill directories             | yes      | bounded  | yes         | no, early       | yes in many cases      | usually yes                   | yes                                        | no        |
| Codex `$CODEX_HOME/skills/<name>/`   | yes      | bounded  | yes         | no direct       | depends on host layout | no                            | yes except later low-risk adapter policy   | no        |

## Default intended policy by destination

### `skills/<name>/`

- repo-owned bundled skill destination
- writable only through a repo branch or worktree flow
- never silently mutate `main`
- should remain version-controlled and code-reviewed
- direct auto-promotion into this path is out of scope for early milestones

### `<workspace>/skills/<name>/`

- best default target for low-risk auto-draft and limited promotion
- suitable for workspace-scoped skill drafts and bounded availability
- may later support low-risk auto-promotion after tests, vetting, and canary
- rollback should be immediate by removing or disabling the workspace-local
  package

### `<workspace>/.agents/skills/<name>/`

- intended for agent-local scoped experiments
- writable for narrow experiments and role-specific trials
- should not imply broader workspace or machine-wide availability
- useful for canary or shadow scopes when an agent-specific surface is desired

### `~/.agents/skills/<name>/`

- readable broadly across workspaces on the machine
- writes remain approval-gated until safe promotion is proven
- not an early auto-promotion target

### `~/.openclaw/skills/<name>/`

- readable broadly to all local agents
- writes remain approval-gated until safe promotion is proven
- not an early auto-promotion target

### Plugin skill directories

- approval-gated
- usually repo-owned
- not auto-written by early milestones
- should use plugin lifecycle and repo ownership rules rather than ad hoc file
  mutation

### Codex `$CODEX_HOME/skills/<name>/`

- writable only through the cross-runtime install adapter
- requires explicit capability checks
- should preserve one source-of-truth package with target-specific metadata
  adaptation only where required
- not a silent side effect of OpenClaw draft generation

## Authority rules

### Read authority

- broad read support is required across all relevant destinations for discovery,
  status, compatibility checks, and cross-runtime verification
- read support does not imply write or promotion authority

### Write authority

- write authority must be declared per destination and risk tier
- low-risk automatic writes should begin with workspace-scoped destinations
- machine-wide, plugin, repo-bundled, and Codex-global destinations remain
  narrower and more controlled

### Install authority

- installability means the destination is a valid target for a reviewed package
- it does not imply automatic promotion into that path

### Auto-promotion authority

- low-risk limited-scope auto-promotion should begin with
  `<workspace>/skills/<name>/`
- agent-local experiments may use `<workspace>/.agents/skills/<name>/`
- repo-bundled, plugin, machine-wide, and Codex-global destinations require
  stronger gates and generally explicit approval in early milestones

## Alignment with workspace topology

- policy, specs, reports, and decisions live under `docs/projects/skills-system`
- repo-owned runnable bundled skills live under `skills/`
- generated skill drafts and canary installs must use explicit bounded
  destinations rather than hiding inside project docs
- destination writes must respect the durable/generated ownership contract and
  avoid whole-file uncontrolled mutation of durable human-owned docs

## Non-goals

This matrix does not authorize:

- blanket write authority across all destinations
- silent repo-main mutation
- silent machine-wide or Codex-global promotion
- automatic plugin directory mutation in early milestones
