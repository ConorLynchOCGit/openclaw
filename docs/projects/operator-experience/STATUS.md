---
summary: "Current Operator Experience status."
title: "Operator Experience Status"
---

# Operator Experience Status

## Baseline

- Stable working-card and structured memory activity work has begun, and the first operator diagnostics panel is implemented in the chat view.
- Host-operator access exists as a scoped tool, and the chat view now has a visible host-operator mode badge/panel.
- Main must be able to inspect canonical live repo paths and approved canonical workspace documents without falling back to duplicate workspace trees.
- Host-operator write mode is now the intended route for operator-approved
  canonical agent-doc and skill work. Main should write approved live-repo
  surfaces through `host_operator_repo`, not raw `/root/services/...` paths.
- Cross-root operator artifacts now need explicit resource resolution and
  provenance, not just scoped file access. The active fix is to resolve
  generated/current/archive report surfaces through stable resource ids and
  aliases instead of broad workspace-first search.

## Landed First-Pass UI

- Working cards show phase, elapsed time, run id when available, cancel affordance, disabled retry reason, and copy diagnostic bundle.
- Queued prompt bubbles stay inline with queue position, timestamp, elapsed time, cancel, and edit-before-start when safe.
- Memory activity renders as structured tool-like cards/chips instead of assistant prose bubbles.
- Long assistant responses retain full markdown and render compact previews with expand/open/copy/export actions.
- Operator diagnostics panel exposes host mode, run-history summary, retrieval proof events, projection artifact events, engineering command cards, and a redacted diagnostic bundle.
- Diagnostic bundles include ids/counts/status and exclude raw prompts, full transcripts, raw tool logs, secrets, private phrases, and root memory-file content.

## Current Priorities

1. Wire real backend run-control support for retry/replay instead of disabled retry copy.
2. Replace first-pass in-chat run-history summary with a dedicated durable run-history page.
3. Add backend-backed retrieval proof and projection artifact APIs for richer explorer/browser views.
4. Connect host-operator badge to live tool-status telemetry instead of static configured mode.
5. Show live host-operator permission state as `read-only`, `write-enabled`,
   `exec-enabled`, or `blocked by filesystem ACL` using backend status
   telemetry.
6. Add UI proof artifacts and runtime pickup validation after the next gateway rebuild.

## Medium-Term Targets

- Durable run-history page.
- Retrieval proof explorer.
- Projection artifact browser.
- Permission-mode switcher.
- Canonical skill install flow that requires explicit operator instruction,
  shows target path and audit id, and never auto-installs external skills
  without vetting.
- Queue manager.
- Diff/test/build status cards.
