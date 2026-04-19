---
summary: "Current live inventory of real OpenClaw agents, their runtime surfaces, and the durable-pack gap before this sprint."
title: "Current Agent Inventory"
---

# Current Agent Inventory

This inventory is based on the live runtime, not the older bootstrap-only
agent assumptions.

Primary evidence:

- `docker exec openclaw-runtime openclaw agents list --json`
- `docs/system/registries/agents.yaml`
- `docs/agents/**`
- `.agents/skills/**`

## Summary counts

- exact current live agent count: `7`
- `active_system_agent`: `2`
- `active_operator_agent`: `4`
- `experimental_agent`: `1`
- `legacy_or_unclear`: `0`
- agents missing a complete durable base pack before this sprint: `7`
- agents missing full durable/runtime alignment before this sprint: `7`

## Live inventory

| id               | display name     | classification          | runtime workspace                                      | runtime surface                         | current durable state before sprint | notes                                            |
| ---------------- | ---------------- | ----------------------- | ------------------------------------------------------ | --------------------------------------- | ----------------------------------- | ------------------------------------------------ |
| `main`           | `OpenClaw`       | `active_system_agent`   | `/home/node/.openclaw/workspace`                       | shared default operator lane            | only sparse runtime-source foothold | canonical shared workspace agent                 |
| `chief`          | `OpenClaw`       | `active_system_agent`   | `/home/node/.openclaw/workspace`                       | Telegram-bound route entry              | no dedicated durable pack           | distinct configured agent sharing main workspace |
| `builder`        | `Builder`        | `active_operator_agent` | `/home/node/.openclaw/agent-workspaces/builder`        | specialist implementation lane          | only sparse runtime-source foothold | live and initialized                             |
| `researcher`     | `Researcher`     | `experimental_agent`    | `/home/node/.openclaw/agent-workspaces/researcher`     | general research specialist             | only sparse runtime-source foothold | configured but uninitialized session store       |
| `web-researcher` | `Web Researcher` | `active_operator_agent` | `/home/node/.openclaw/agent-workspaces/web-researcher` | bounded public-web retrieval specialist | only sparse runtime-source foothold | now needs explicit injection-defense contract    |
| `writer`         | `Writer`         | `active_operator_agent` | `/home/node/.openclaw/agent-workspaces/writer`         | publication-ready writing specialist    | only sparse runtime-source foothold | live and initialized                             |
| `x-manager`      | `X Manager`      | `active_operator_agent` | `/home/node/.openclaw/agent-workspaces/x-manager`      | X drafting and approval packaging       | only sparse runtime-source foothold | live and initialized                             |

## Runtime skill surfaces currently in repo

Repo-owned skills currently live under two roots:

- role-maintainer / maintainer-only skill root: `.agents/skills/**`
- general bundled / operator skill root: `skills/**`

Important current truth:

- `.agents/skills/**` currently contains maintainer and QA-specialized skills
- `skills/**` currently contains the broader repo-owned operator skill library,
  including `clawhub`, `model-memory-deep-ingest`, and `skill-vetting`

## Exact durable gap before this sprint

Before this sprint:

- `docs/agents/` existed, but only six agents had top-level folders
- those six folders were runtime-source footholds, not complete durable packs
- `chief` existed live in the runtime but had no dedicated durable pack
- no live agent had the now-required durable base pack of:
  - `index.md`
  - `Identity.md`
  - `Startup.md`
  - `Tools.md`
  - `Permissions.md`
  - `Skills.md`
  - `Status.md`

## Alignment gap before this sprint

Before this sprint, the durable/runtime misalignment took three forms:

1. live runtime agent existed but no dedicated durable pack existed
2. durable runtime-source foothold existed but the richer durable pack was
   missing
3. runtime behavior and durable safety boundary were still implicit, especially
   for `web-researcher`

## Immediate implication

The repo could no longer treat agent work as a template-only or future-only
lane. The live runtime already had seven agents, so the durable layer needed to
become explicit and machine-checkable in this sprint.
