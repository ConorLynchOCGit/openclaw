---
summary: "Operator Experience decisions."
title: "Operator Experience Decisions"
---

# Operator Experience Decisions

## 2026-04-22: Create Operator Experience Project

Operator-facing chat/run UX needs a dedicated project instead of living only inside Model Memory or Workspace Topology.

Rationale:

- The pain cuts across chat rendering, run lifecycle, queueing, memory observability, diagnostics, permissions, and developer workflow.
- Model Memory should own memory semantics, not the full operator UI.
- Workspace Topology should own canonical path and permission mechanics, not chat/workflow UX.

## 2026-04-22: Host Access Remains Scoped

Main should not receive blanket host access. Host-operator access is scoped to approved roots, audited, traversal-blocked, and kill-switchable.

Approved scopes:

- `live_repo`: canonical live product repo bridge.
- `operator_workspace`: canonical operator workspace document roots through the existing workspace mount.

Root `USER.md` and `MEMORY.md` stay protected from generic host-operator edits by default.

## 2026-04-22: First-Pass Operator Panel Before Dedicated Pages

The near-term implementation uses a collapsible in-chat operator diagnostics panel before building separate durable pages.

Rationale:

- The main pain is immediate visibility during live turns.
- Existing chat/session/activity metadata can support useful first-pass run history, retrieval proof, projection, host-mode, and diagnostic visibility without migrations.
- Dedicated pages should follow once backend persistence and APIs are shaped, rather than blocking the immediate QoL fix.

Constraints:

- Diagnostic bundles remain redacted by default.
- Retrieval/projection views show ids, hashes, artifact paths, and reasons only where those are already available.
- Retry remains disabled with an explicit reason until durable replay support exists.

## 2026-04-24: Cross-Root Operator Artifacts Resolve Through Explicit Resources

Operator-facing generated artifacts that live outside the workspace-first
default search surface must resolve through explicit resource ids and aliases,
not broad fuzzy search.

Examples:

- `memory_ops.latest_report`
- `ops.generated_current.memory_ops_report_current`
- `ops.daily_operator_review.current_context`

Rationale:

- The current host-operator posture already gives scoped access to the live repo
  and operator workspace.
- The failure mode was discovery and provenance, not missing raw access.
- Default broad search intentionally prunes runtime artifact trees such as
  `.openclaw-memory-ops/**`.
- Operator UX is better when summary lines carry deterministic resource ids and
  provenance that can be handed to a resolver/tool directly.
