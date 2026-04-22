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
