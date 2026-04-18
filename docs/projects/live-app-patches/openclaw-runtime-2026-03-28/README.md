# OpenClaw Runtime Patch Bundle — 2026-03-28

Purpose:

- durable capture of the minimum runtime/config changes that made the first standalone `x-manager` proof real
- preserve the dedicated x-manager workspace seed used by the proof

Source paths:

- runtime config: `/root/.openclaw/openclaw.json`
- x-manager auth profile: `/root/.openclaw/agents/x-manager/agent/auth-profiles.json`
- x-manager workspace seed: `/root/.openclaw/agent-workspaces/x-manager`

Artifacts in this bundle:

- `openclaw.json.phase10-6-x-manager.patch`
- `x-manager.auth-profiles.json`
- `x-manager-workspace-seed/AGENTS.md`
- `x-manager-workspace-seed/context/platform_rules.md`
- `x-manager-workspace-seed/context/approval_policy.md`
- `x-manager-workspace-seed/context/accounts/conor_lynch_personal.md`
- `x-manager-workspace-seed/context/accounts/american_atomics.md`

Why this was needed:

- Phase 10.6 required a true standalone specialist runtime agent, not a writer alias
- the proof needed a dedicated xAI/OpenRouter model lane, dedicated workspace, dedicated memory/context seed, and a narrowed non-posting tool boundary
- these changes live in runtime state outside the workspace repo and therefore needed a durable workspace-side capture

Reapply guidance:

1. apply `openclaw.json.phase10-6-x-manager.patch` to the live runtime config
2. restore `x-manager.auth-profiles.json` to `/root/.openclaw/agents/x-manager/agent/auth-profiles.json`
3. restore the copied seed files into `/root/.openclaw/agent-workspaces/x-manager/`
4. ensure ownership allows the gateway runtime to write to the x-manager agent/workspace paths
5. restart the OpenClaw gateway and verify `openclaw models status --agent x-manager --json`
