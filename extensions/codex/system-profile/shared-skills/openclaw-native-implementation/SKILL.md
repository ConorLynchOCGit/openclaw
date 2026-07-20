---
name: openclaw-native-implementation
description: Use when implementing or reviewing OpenClaw, Codex-harness, GBrain, Workboard, task, session, agent, plugin, or runtime changes where native ownership, minimal moving parts, and truthful completion matter.
---

# OpenClaw Native Implementation

Implement at the existing native owner. Treat source, runtime, and artifact
evidence as distinct; do not let docs or model prose substitute for deployed
behavior.

## Native-Fit Pass

1. Identify the current owner, callers, persistence, readback, and tests.
2. Reuse existing config, plugin, task, session, Workboard, GBrain, or Codex
   extension points before adding a new abstraction.
3. Reject parallel runners, schedulers, routers, task stores, parser gates,
   artifact controllers, or quality state when an existing owner suffices.
4. Keep OpenClaw outside Codex implementation: OpenClaw routes, launches,
   observes, mirrors, and receipts; the Codex thread inspects, edits, validates,
   delegates, and reviews.
5. Keep patches bounded to the actual owner and update focused tests that would
   fail if the behavior regressed.
6. Inspect the final diff and obtain the smallest relevant purpose-agent
   review for meaningful risk.

Completion language must match the actual diff, validation, review, and repo
closeout. Report partial work as partial.
