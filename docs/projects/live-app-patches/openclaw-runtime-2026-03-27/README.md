# OpenClaw Runtime Phase 10 Durability Capture

Purpose: patch-only durability for the live OpenClaw runtime/config changes that made the Phase 10 `builder` dry run real.

Source path:

- `/root/.openclaw/openclaw.json`

Preserved artifact:

- `openclaw.json.phase10-builder-runtime.patch`

Why this change was needed:

- `builder` needed a real bounded worker tool policy so it could write its proof file inside a dedicated workspace.
- `main` needed cross-agent session visibility to verify the already-completed isolated `builder` run inside OpenClaw itself.
- The top-level allowlist was kept narrow: only `main` and `builder` were enabled for this proof path.

What the patch captures:

- `builder` tool policy for bounded implementation / verification work
- top-level `tools.agentToAgent` allowlist limited to `main` and `builder`
- top-level `tools.sessions.visibility=all` so `main` can inspect the isolated `builder` proof session

Why patch-only durability is used:

- the source of truth remains the live runtime config at `/root/.openclaw/openclaw.json`
- this bundle preserves only the minimum reapply delta without creating a second canonical runtime config copy in the workspace repo

Reapply guidance:

1. Confirm the target runtime still uses `/root/.openclaw/openclaw.json`.
2. Reapply the patch hunks to the live config.
3. Ensure `/root/.openclaw/agent-workspaces/builder` exists and is writable by the runtime user.
4. Restart the OpenClaw gateway.
5. Rerun the Phase 10 builder dry run and main verification if the runtime or agent list changed.
