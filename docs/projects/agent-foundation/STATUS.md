---
summary: "Current status for the agent-foundation project."
title: "Agent Foundation Status"
---

# Agent Foundation Status

## Overall

State: `live_agent_packs_populated_and_runtime_aligned`

The durable agent layer is no longer just a future slice. The live runtime
agent set is now mirrored by a real durable pack system under `docs/agents/`,
with registry alignment and an explicit browsing-safety hardening pass for
`web-researcher`.

## Confirmed current state

- the live VPS runtime currently includes seven configured agents:
  - `main`
  - `chief`
  - `builder`
  - `researcher`
  - `web-researcher`
  - `writer`
  - `x-manager`
- each live agent now has a durable base pack under `docs/agents/<agent-id>/`
- `docs/agents/registry.yaml` is now the durable machine-checkable map for the
  live set
- `chief` is no longer an undocumented live agent; it now has an explicit pack
  while intentionally sharing the main runtime compatibility source surface
- `.agents/` remains the machine/runtime root rather than carrying durable role
  meaning by itself
- repeatable executable workflows remain skill-first by policy rather than
  spawning a second workflow-doc system
- `web-researcher` now has an explicit prompt-injection defense contract in
  both durable docs and the runtime prompt/tool seam
- `web-researcher` now also has a layered defense posture rather than a prompt
  warning only:
  - external page content is classified as untrusted external content
  - runtime fetch results now surface suspicion outcomes for blocked,
    suspicious, or escalate-for-review content
  - the durable design now lives in:
    - [Web Researcher Prompt Injection Defense](/projects/agent-foundation/web-researcher-prompt-injection-defense)
    - [Web Researcher Layered Defense](/projects/agent-foundation/web-researcher-layered-defense)
- first-pass pack population is no longer the only quality bar:
  - the core agent packs now have a dedicated improvement rubric in
    [Agent Pack Quality Rubric](/projects/agent-foundation/agent-pack-quality-rubric)
- `researcher` remains configured but uninitialized, and that is now recorded
  explicitly in both the durable inventory and registry

## Immediate next move

Keep the new pack system honest and maintained, then:

1. keep the registry and the durable packs in lock-step through
   `scripts/check-agent-packs.mjs`
2. keep runtime compatibility files aligned without collapsing durable meaning
   back into `.agents/`
3. decide whether `researcher` should be initialized or retired explicitly
4. extend agent-specific examples/interfaces only where they carry real durable
   value
5. keep the `web-researcher` browsing defense aligned with the real live
   browsing toolset
6. keep improving high-authority packs against the new quality rubric rather
   than treating file existence as sufficient
