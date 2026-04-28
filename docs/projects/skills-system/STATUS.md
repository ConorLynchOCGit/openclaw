---
summary: "Current status for the Skills System project."
title: "Skills System Status"
---

# Skills System Status

## Overall

State: `phase2_skills_platform_specs_active`

The repo already has a canonical home for skill loading, ClawHub posture, and
Skill Vetting.

This slice upgrades that project into the contract owner for a broader Skills
Platform.

The current outcomes are:

- the skills project now explicitly owns lifecycle-managed capabilities rather
  than only installed skill folders
- the canonical policy is now being defined for:
  - skill candidate detection
  - Skillifier packaging
  - evals and routing coverage
  - vetting and risk classification
  - canary and rollback
  - low-risk auto-promotion
  - Codex/OpenClaw cross-runtime packaging
  - proactivity-integrated surfacing
- Skill Vetting remains the external-skill review workstream under this larger
  platform
- existing runtime/loading primitives remain the implementation substrate:
  - `SKILL.md` loading and precedence
  - agent allowlists
  - metadata gating
  - installer scan posture
  - ClawHub search/install/update
  - plugin-provided skills

## Current judgment

The biggest missing skill-system capability is still not “more skills.”

It is the lack of one explicit system for turning repeated work into safe,
reviewable, and sometimes automatable skill improvements.

The project now has the right project home to solve that with one coherent
contract instead of fragmented docs across vetting, proactivity, and local
skill creation.

## Remaining work after this slice

- implement the proactivity-backed skill candidate ledger
- build the Skillifier scaffold/check/report lane
- add decisioning/compliance evals
- integrate risk tiers, canarying, rollback, and low-risk auto-promotion
- add cross-runtime install and maintenance surfaces
