---
summary: "Stable decisions for the agent-foundation project."
title: "Agent Foundation Decisions"
---

# Agent Foundation Decisions

## 2026-04-16 - use `docs/agents/` for durable agent workspaces

Decision:

- durable human-owned agent docs live under `docs/agents/`
- machine-readable runtime definitions stay under `.agents/`

Reasoning:

- prose governance and runtime config should not live in the same surface
- this keeps agent docs auditable and readable while preserving `.agents/` as
  the operational surface

## 2026-04-16 - required agent base pack excludes `Workflows.md`

Decision:

- the required agent pack is:
  - `index.md`
  - `Identity.md`
  - `Startup.md`
  - `Permissions.md`
  - `Tools.md`
  - `Skills.md`
  - `Status.md`
- `Workflows.md` is not required by default
- `Decisions.md`, `Examples.md`, `Interfaces.md`, and `Workflows.md` are
  optional

Reasoning:

- repeatable executable workflows should usually become skills
- forcing both workflow docs and skill docs as parallel first-class systems
  would create avoidable overlap and drift
- requiring per-agent `Memory.md`, `roadmap.md`, or `Decisions.md` by default
  would create filler in agents that do not yet own those surfaces

## 2026-04-16 - agent identity docs require deeper research and richer buildouts

Decision:

- `Identity.md` must be deeper than a trivial role label
- this project includes explicit research on how to structure identity docs for
  agent-specific utility, constraints, and collaboration behavior

Reasoning:

- agent usefulness depends heavily on clear role identity and boundaries
- shallow descriptions do not provide enough durable guidance

## 2026-04-16 - reconcile the live runtime agent set before full pack population

Decision:

- the agent registry must reflect the actual live runtime agents before the
  later `docs/agents/` population slice begins
- configured live agents with missing dedicated workspaces are treated as
  runtime drift, not as implicitly retired agents

Reasoning:

- the old bootstrap-only registry shape was materially out of sync with the
  actual VPS runtime
- durable agent packs should be built on the real live inventory, not on a
  stale placeholder set

## 2026-04-16 - fold retained role-library adaptations into agent-foundation

Decision:

- the retained subset of the old `projects/roles/` surface now lives under
  `docs/projects/agent-foundation/`
- it stays as design lineage and routing rationale, not as a second runtime
  registry

Reasoning:

- the mapped live agents already exist
- the runtime-source truth should stay under `docs/agents/`
- the role-library material is still useful context, but it does not justify a
  second standalone project workspace anymore

## 2026-04-19 - browsing specialists require a runtime prompt-injection contract

Decision:

- `web-researcher` must treat page content as untrusted input rather than
  instruction authority
- the defense must exist in both durable docs and the live runtime
  prompt/tool seam

Reasoning:

- docs-only guidance would not actually constrain live role behavior
- browsing is the clearest lane where hostile content can try to steer tools,
  exfiltrate privileged context, or push unsafe operational steps
