---
summary: "Canonical project workspace for the OpenClaw skill system, marketplace posture, and safety boundaries."
title: "Skills System"
---

# Skills System

`skills-system` is the canonical project workspace for how OpenClaw discovers,
loads, vets, installs, and governs skills over time.

This project owns:

- bundled vs workspace vs marketplace skill boundaries
- skill-system safety posture and review rules
- formal Skill Vetting workflow and quarantine review policy
- the connection between ClawHub, operator review, and install decisions

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
6. [Spec Index](/projects/skills-system/specs)
7. [Skill Vetting](/projects/skills-system/skill-vetting)

## Current focus

The current slice formalizes two previously fuzzy areas:

- the skill system now has a first-class canonical project home
- Skill Vetting is now treated as a durable system lane instead of an ad hoc
  operator habit
- Skill Vetting now also has an operator-facing artifact contract and a runtime
  proof matrix rather than only a thin checklist

## Relationship to other projects

- [Workspace Topology](/projects/workspace-topology) owns the project/register
  rules this project follows.
- [Agent Foundation](/projects/agent-foundation) owns broader agent-pack and
  skill-allowlist behavior.
- [Deployment Topology](/projects/deployment-topology) owns runtime availability
  and host/container capability drift for bundled skills.
