---
summary: "Ownership and safety boundary for bundled, local, and marketplace skills in OpenClaw."
title: "Skill System Ownership And Safety"
---

# Skill System Ownership And Safety

## Objective

Define who owns which parts of the OpenClaw skill system and how third-party
skills must cross the safety boundary.

This spec now covers the ownership boundary for lifecycle-managed skills, not
just installed skill folders.

## Ownership layers

### Bundled skills

Bundled skills live in repo-owned `skills/`.

They are:

- product-owned
- versioned with the repo
- part of normal code review

### Workspace or personal skills

Workspace and personal skills are operator-managed overlays.

They are:

- higher precedence than bundled skills
- local to a workspace or machine
- not automatically treated as reviewed just because they are present

### Marketplace skills

Marketplace skills are third-party by default unless explicitly maintained by
the same trusted product owner.

They must not bypass review just because they were discoverable through
ClawHub.

### Generated or synthesized skills

Generated skills are repo-owned or workspace-owned artifacts only after they
pass the required lifecycle checks for their risk tier.

They are:

- candidate-derived rather than operator-handwritten by default
- never treated as trusted merely because they were generated internally
- subject to the same vetting, eval, provenance, and rollback contracts as any
  other skill package for their autonomy level

## Safety posture

External skills are treated as untrusted until reviewed.

Generated skill drafts are treated as untrusted until they satisfy the
requirements of their risk tier and autonomy level.

Review must answer:

- what commands or tools the skill can trigger
- what binaries, env vars, or config it requires
- whether it writes outside its expected scope
- whether it contains ideas worth borrowing without direct installation
- whether it can be limited to a bounded canary scope
- whether rollback is immediate and operator-legible

## Install boundary

There are three valid outcomes for a reviewed skill:

- `install`
  - acceptable to install after review, with any stated conditions
- `inspire`
  - do not install directly; keep the design idea and implement natively or in
    a controlled follow-on project
- `reject`
  - do not install and do not borrow without separate explicit review

For internally generated skill candidates, later lifecycle states also include:

- `drafted`
- `tested`
- `canarying`
- `promoted_limited`
- `promoted_broad`
- `disabled`
- `rolled_back`

## Relationship to other projects

- [Agent Foundation](/projects/agent-foundation) owns how approved skills map
  into agent packs and allowlists
- [Model Memory](/projects/model-memory) owns the proactivity substrate that
  surfaces candidates and bounded evidence
- [Deployment Topology](/projects/deployment-topology) owns runtime availability
  and host/container binary posture
- [Skill Vetting](/projects/skills-system/skill-vetting) owns the concrete
  external review workflow
