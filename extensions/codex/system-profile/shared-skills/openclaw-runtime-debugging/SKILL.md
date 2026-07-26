---
name: openclaw-runtime-debugging
description: Use when an OpenClaw or Codex runtime path behaves differently across source, build, container, provider, config, session, tool, or readback boundaries and the first divergent boundary must be isolated.
---

# OpenClaw Runtime Debugging

Debug the first divergent boundary. Do not compensate at a later layer before
the earlier contract is understood.

## Procedure

1. Reproduce with the same source commit, candidate, provider/model profile,
   runtime config, role, workspace, and task shape as the failing path.
2. Draw the shortest ownership chain: request, dispatch, runtime selection,
   thread start, tool/config loading, execution event, artifact, and readback.
3. Compare expected and observed values at each boundary; stop at the first
   divergence.
4. Separate source truth, deployed runtime truth, persisted state, and
   presentation/readback.
5. Patch the owner of the divergent value. Avoid wrappers, fallback execution,
   duplicated config, broad file sync, or display-layer compensation.
6. Prove the fix with a focused test and the smallest live check needed for
   that boundary.

For source-specific commands and diagnostics, use the globally available
`openclaw-debugging` source skill. Keep host `/root` and `/srv` paths out of
model-facing live-agent instructions; use workspace-visible paths.
