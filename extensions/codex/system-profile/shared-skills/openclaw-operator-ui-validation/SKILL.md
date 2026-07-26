---
name: openclaw-operator-ui-validation
description: Use when an OpenClaw change affects an operator-facing web workflow and must be verified through real browser interaction, visual evidence, responsive layouts, accessibility, and runtime-backed state.
---

# OpenClaw Operator UI Validation

Source inspection and component tests do not prove an operator workflow.
Validate the real surfaced behavior against the live or explicitly approved
test runtime.

## Procedure

1. Identify the operator journey, state prerequisites, and expected runtime
   owner for each visible value.
2. Exercise the workflow in a real browser using the source-owned
   `control-ui-e2e` procedure.
3. Verify loading, empty, success, failure, blocked, and stale states that the
   change can reach.
4. Check desktop and mobile framing, text containment, keyboard flow, focus,
   labels, contrast, and non-overlap.
5. Capture screenshots only where they prove a specific visual or state
   claim; inspect them rather than treating capture as success.
6. Correlate visible state with native runtime/session/task/readback evidence.
7. Report untested states and environment limits explicitly.

Do not create a second UI test runner, mock runtime authority, or UI-only
success state. Use the repository's existing Playwright and Control UI test
surfaces.
