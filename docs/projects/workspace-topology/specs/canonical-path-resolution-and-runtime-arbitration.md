---
summary: "Canonical file-resolution contract for repo-owned versus workspace-owned paths, plus runtime arbitration and write-target ownership rules."
title: "Canonical Path Resolution And Runtime Arbitration"
---

# Canonical Path Resolution And Runtime Arbitration

## Goal

Eliminate the recurring class of failures where OpenClaw can technically see
repo-owned files inside the same container but still fails to operate on them
reliably because path resolution depends on the active workspace root and
prompt-level operator memory.

This spec defines:

- one canonical file-resolution contract
- runtime path arbitration in tool and execution layers
- explicit separation of read targets versus write targets

This is the next topology hardening item immediately after the current deep
document-ingest pass, because broader in-product orchestration will remain
fragile until path ownership is deterministic.

## Problem

The current deployment has three truths that are individually valid but not yet
aligned:

1. canonical repo-owned sources exist and are mounted in-container
2. the active agent workspace has its own root and writeable state
3. many tools still resolve user-facing relative paths against the workspace by
   default

That produces repeated drift:

- canonical repo-relative paths like `docs/projects/model-memory/...` can be
  treated as missing from a workspace turn even though they exist under the
  canonical repo import
- agents must remember to jump into `imports/product_live/content`
- runbooks can describe repo-relative artifact locations while runtime code
  writes to workspace-local paths instead
- read behavior and write behavior are mixed together implicitly instead of by
  policy

## Scope

This contract must cover at minimum:

- `read`
- document-ingest target resolution
- bootstrap-materialization
- operator-runbook execution paths

It should also be designed so the same contract can later apply to other
repo-coupled orchestration surfaces.

## Canonical resolution contract

### Path classes

Every path requested by runtime or tools must be classified into one of these
classes before it is opened or written.

#### 1. Repo-canonical read path

A path is repo-canonical when it refers to durable product-owned sources whose
canonical authority is the live repo import rather than the mutable workspace.

Initial repo-canonical prefixes:

- `docs/`
- `ops/`
- `scripts/`
- `extensions/`
- `skills/`

Initial repo-canonical top-level files:

- `AGENTS.md`
- `README.md`
- `docker-compose.yml`
- other top-level repo-owned files only when explicitly registered

Resolution rule:

- resolve against the canonical repo surface first
- if a same-looking workspace copy exists, it does not silently win by
  accident
- if no canonical repo match exists, report that precisely instead of falling
  back into unrelated workspace wandering

#### 2. Workspace-owned path

A path is workspace-owned when it refers to mutable operator state, generated
artifacts, continuity files, checkpoints, or live runtime coordination files
whose authority belongs to the workspace.

Initial workspace-owned examples:

- `memory/`
- `checkpoints/`
- runtime-generated evidence under workspace-owned paths
- task state
- session-side continuity artifacts
- explicit `.openclaw/` workspace-owned material

Resolution rule:

- resolve against the active workspace
- do not silently redirect these to the repo import

#### 3. Explicit external/import path

A path is explicit-import when the caller directly references a mounted import
surface such as `imports/product_live/content/...`.

Resolution rule:

- honor the explicit import path exactly
- do not remap it to a shorthand alias

### Conflict rule when both exist

If both a workspace path and a canonical repo path exist for a repo-canonical
request:

- the canonical repo path wins for reads by policy
- the workspace copy is treated as a compatibility mirror or stale shadow
  unless a later contract explicitly overrides that

This must be decided by code, not by prompt wording or agent memory.

## Runtime arbitration requirements

### Shared resolver

Add one shared runtime resolver in the file/tool layer that:

1. classifies the requested path
2. resolves it against the correct ownership surface
3. returns both:
   - the effective filesystem path
   - the owning logical source class

Minimum output contract:

- `inputPath`
- `resolvedPath`
- `ownershipClass`
- `resolutionSource`
- `fallbackUsed`

### Required initial integrations

The shared resolver must be used first by:

1. `read`
2. the document-ingest lane
3. bootstrap-materialization
4. operator-runbook execution paths that consume canonical repo docs

### Document-ingest priority patch

The first concrete runtime patch after the spec lands should be the
document-ingest lane.

Required behavior:

- repo-relative target-list file paths resolve through the shared resolver
- canonical repo-owned source files ingest without requiring the agent to
  manually prepend `imports/product_live/content`
- checkpoint and evidence writes use explicit write-target ownership rules

## Read-target versus write-target contract

### Read targets

Reads of canonical docs, specs, runbooks, operator scripts, and other durable
repo-owned sources should resolve to the canonical repo source.

Examples:

- `docs/projects/model-memory/deep-document-ingest-runbook.md`
- `docs/system/memory.md`
- `ops/github/GITHUB_DIGEST_QUERY.sql`
- `skills/model-memory-deep-ingest/SKILL.md`

### Write targets

Writes must never be inferred from the read source alone.

Generated artifacts, checkpoints, and session evidence must go to explicit
owned write locations.

Examples:

- workspace-owned checkpoint:
  - `checkpoints/model-memory/...`
- workspace-owned session evidence:
  - explicitly documented writable evidence directories
- repo-owned durable docs:
  - only when the task is a real repo edit, not a runtime byproduct

### Artifact-path rule

Runbooks and operator prompts must name artifact paths that already reflect the
intended write owner. Runtime code should not reinterpret them ad hoc.

If a repo-root relative artifact path is intended to be workspace-owned, that
must be explicit in the contract and in the implementation.

## Initial implementation plan

1. add a shared canonical path resolver in runtime/tool code
2. patch the document-ingest lane to use that resolver first
3. patch runbook/operator execution seams that consume repo-canonical docs
4. patch bootstrap-materialization to use the same ownership model where
   relevant
5. expose enough trace metadata that resolution decisions can be debugged
   without guesswork

## Required regression tests

Add coverage for:

1. repo-relative read from workspace context
2. document-ingest target-list execution using repo-relative canonical source
   paths
3. canonical artifact-path resolution
4. prompt/runbook-driven operator flows that consume repo-owned sources while
   writing to workspace-owned outputs

The test bar is not “file exists somewhere in the container.” The bar is that
the runtime chooses the right source and write owner deterministically.

## Acceptance criteria

- repo-canonical read requests no longer depend on the agent remembering import
  mount paths
- document-ingest can run from repo-relative target lists without path drift
- read targets and write targets are separated by policy
- checkpoint and evidence locations are explainable from ownership rules
- runtime behavior is enforced in code and tested, not left to prompts alone

## Priority

Execution priority after the current deep document-ingest pass:

1. finish or verify the deep document-ingest run
2. land canonical path resolution and runtime arbitration
3. then continue into broader internal orchestration and agent-work slices

This ordering is required because unresolved path ownership will otherwise keep
breaking higher-level orchestration even when the files are already mounted in
the same container.
