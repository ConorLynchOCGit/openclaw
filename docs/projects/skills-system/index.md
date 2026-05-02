---
summary: "Canonical project workspace for the OpenClaw skills platform, lifecycle policy, marketplace posture, and automation safety boundaries."
title: "Skills System"
---

# Skills System

`skills-system` is the canonical project workspace for how OpenClaw discovers,
loads, vets, installs, evolves, and governs skills over time.

This project owns:

- bundled vs workspace vs marketplace skill boundaries
- skill-system safety posture and review rules
- formal Skill Vetting workflow and quarantine review policy
- the connection between ClawHub, operator review, and install decisions
- skill candidate detection and ledger contracts
- Skillifier lifecycle and "properly skilled" quality bar
- Gbrain/Hermes-class skill parity gates: evals, resolver tests,
  check-resolvable-style reachability, E2E, canary, rollback, usage-based
  self-improvement, approval-gated promotion, and cross-runtime install
- cross-runtime OpenClaw and Codex packaging rules
- destination-specific write and promotion authority
- autonomy, canary, rollback, and low-risk auto-promotion policy
- proactivity-integrated surfacing for skill opportunities and maintenance

It does not own:

- broader agent-pack identity design
- general tool/runtime architecture outside skill-specific behavior

Those stay with [Agent Foundation](/projects/agent-foundation) and other
project owners.

## Project docs

1. [Startup](/projects/skills-system/STARTUP)
2. [Status](/projects/skills-system/STATUS)
3. [Current Slice](/projects/skills-system/CURRENT_SLICE)
4. [Decisions](/projects/skills-system/DECISIONS)
5. [Roadmap](/projects/skills-system/roadmap)
6. [Phase 2 Skills Platform Roadmap](/projects/skills-system/phase-2-skills-platform-roadmap)
7. [Spec Index](/projects/skills-system/specs)
8. [Skill Vetting](/projects/skills-system/skill-vetting)

## Current focus

The current slice widens the project from simple loading/vetting into a full
skills lifecycle platform:

- skills are lifecycle-managed capabilities, not just folders under `skills/`
- skill candidates are proactivity-integrated opportunities, not a parallel
  inbox
- model-owned judgment remains the boundary for skill-worthiness,
  skill-vs-plan classification, promotion recommendations, usage-based
  improvement, and visible card copy
- low-risk skill work should eventually auto-draft, auto-test, canary, and in
  some cases auto-promote within bounded scopes
- medium-risk and high-risk behavior stays approval-gated
- Codex and OpenClaw should share one source-of-truth skill package with
  runtime-specific adapters

## Relationship to other projects

- [Workspace Topology](/projects/workspace-topology) owns the project/register
  rules this project follows.
- [Agent Foundation](/projects/agent-foundation) owns broader agent-pack and
  skill-allowlist behavior.
- [Model Memory](/projects/model-memory) owns the proactivity substrate that
  surfaces skill candidates and stores bounded evidence.
- [Deployment Topology](/projects/deployment-topology) owns runtime availability
  and host/container capability drift for bundled skills.
