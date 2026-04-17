---
summary: "Evidence-backed list of non-testing work that still matters before or during the next agent-focused slice."
title: "Pre-Agent Prerequisites Audit"
---

# Pre-Agent Prerequisites Audit

This audit separates genuine remaining non-testing prerequisite work from older
concerns that were correct earlier in the rescue program but now need
reclassification.

## Summary

- no deployment-specific non-testing blocker remains before the next
  agent-focused slice
- the earlier topology concern about a missing compose build path is resolved
- the earlier per-agent durable-pack and bootstrap-seeding concerns are still
  relevant, but they belong to the next agent-focused slice rather than being
  prerequisites before it
- stronger topology enforcement beyond the current registries, checks, and
  compose build path remains useful hardening, but it is not a blocker before
  agent work starts

## Items

| Item                                                  | Current evidence                                                                                                                                                                                                                                                  | Current relevance                     | Recommended timing                                                  | Blocks agent work | Rationale                                                                                                                                      |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `github-digest-source-wiring`                         | the public Funnel endpoint now returns `401 invalid_signature` for a bad HMAC and `200 {"ok":true,"source":"github-webhook"}` for a correctly signed canonical `openclaw/openclaw` delivery; that delivery now persists in `inbound_events` as of `2026-04-17`.   | resolved in this slice                | none                                                                | no                | the live source path is repaired and proven; the next organic repo event is now monitoring confirmation rather than a pre-agent prerequisite   |
| `compatibility-source-migration-into-per-agent-packs` | `docs/agents/` now exists with bounded runtime-source packs for `main`, `builder`, `researcher`, `web-researcher`, `writer`, and `x-manager`. `docs/projects/agent-foundation/CURRENT_SLICE.md` explicitly says richer durable-pack population is the next slice. | still relevant                        | during the next agent-focused slice                                 | no                | this is no longer a hidden deployment gap; it is the defined content-expansion work for the agent slice itself                                 |
| `bootstrap-template-pre-render-seeding`               | runtime-source packs now materialize correctly into the live workspaces, and bootstrap truncation was addressed, but authored pack content still depends on the current runtime materialization path rather than a fuller pre-rendered seed set                   | still relevant                        | early in the next agent-focused slice                               | no                | this is a design and ergonomics decision for richer agent-pack population, not a prerequisite for starting that work                           |
| `topology-enforcement-beyond-checks`                  | registries and topology checks pass, repo-vs-container adoption is now audited, and `docker-compose.yml` now has real `build:` stanzas. Hard prevention beyond those controls does not yet exist.                                                                 | still relevant but reduced in urgency | later hardening after the next agent slice unless new drift appears | no                | the highest-risk recurrence path was reduced by the compose build fix, so stronger prevention is now hardening rather than a pre-agent blocker |
| `workspace-topology-status-sync`                      | `docs/projects/workspace-topology/STATUS.md` had stale statements about `docs/agents/` and durable packs before this slice updated it.                                                                                                                            | resolved in this slice                | none                                                                | no                | this was a doc-truth problem, not an architectural blocker                                                                                     |
| `compose-build-path-gap`                              | the live repo now has `build:` stanzas in `docker-compose.yml`, and the runtime was rebuilt and recreated from that path in this slice.                                                                                                                           | resolved in this slice                | none                                                                | no                | the rollout-path gap is no longer a prerequisite because the fix is already live                                                               |

## Current Boundary

The richer durable-pack population work should now move into
[Agent Foundation](/projects/agent-foundation) instead of being held back by
older topology assumptions.

The remaining items here are planning and hardening lanes, not pre-agent
blockers.
