---
summary: "Repo-wide durable-versus-generated ownership contract for bounded projection and rewrite behavior."
title: "Durable Generated Ownership"
---

# Durable Generated Ownership

## Goal

Generalize the existing model-memory projection idea into a repo-wide contract.

## Ownership model

- durable content is human-owned
- generated content is machine-owned
- generated content must live in bounded generated zones by default, or in
  explicit runtime-owned generated artifact paths when a continuity file must
  stay fully human-owned
- whole-file replacement is not the default

## Default rule

For files under `docs/system/`, `docs/projects/`, and `docs/agents/`:

- everything is durable unless a bounded generated zone is explicitly declared
- a generator may rewrite only the exact generated zone it owns
- a generator may not rewrite adjacent durable content implicitly

## Generated-zone contract

The initial bounded marker shape is:

```md
<!-- OPENCLAW:GENERATED START <zone-id> -->

... machine-owned content ...

<!-- OPENCLAW:GENERATED END <zone-id> -->
```

Rules:

- `<zone-id>` must match on both markers
- generators may only rewrite content inside the matched zone
- missing or malformed markers mean no rewrite
- multiple generated zones may exist in one file
- durable text may surround generated zones freely

## Whole-file machine ownership

Whole-file machine ownership is allowed only when the path is explicitly
declared machine-owned, for example:

- generated artifact roots such as `docs/.generated/`
- future explicitly declared generated caches or reports

Human-authored durable docs are not implicit caches.

## Relation to model-memory

This policy generalizes the seed contract already recorded in:

- [Bootstrap Input Audit](/projects/model-memory/bootstrap-input-audit)
- [Workspace Projections Bootstrap Files](/projects/model-memory/specs/workspace-projections-bootstrap-files)

That seed direction remains valid:

- create generated zones rather than overwriting whole files
- or use an explicit generated artifact path when the live contract forbids a
  mixed file
- ingest or preserve durable content before projection
- keep projection bounded and explicit

## Enforcement intent

Later enforcement should validate:

- generated markers are well-formed
- generated writers stay inside owned zones
- machine-owned whole-file paths are explicitly declared
