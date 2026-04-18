---
summary: "Durable decisions for the Skills System project."
title: "Skills System Decisions"
---

# Skills System Decisions

## Accepted decisions

### 2026-04-18 - Skills System gets its own canonical project

Reason:

- skill loading, safety, marketplace acquisition, and review outputs had become
  bigger than a footnote in other projects

Decision:

- create `docs/projects/skills-system/` as the canonical project home

### 2026-04-18 - Skill Vetting remains a workstream under Skills System

Reason:

- it is substantial enough for its own durable pack
- it still belongs under the parent skill-system governance boundary

Decision:

- keep `skill-vetting` nested under `docs/projects/skills-system/`
- do not register it as a separate top-level project workspace

### 2026-04-18 - External skill acquisition must use quarantine first

Reason:

- `openclaw skills install` writes into the active workspace
- that is correct for trusted installs, but wrong for unreviewed third-party
  skill analysis

Decision:

- acquisition for vetting must land in quarantine
- review decides `install`, `inspire`, or `reject`

### 2026-04-18 - Search and acquisition are separate capabilities

Reason:

- search may be available through native OpenClaw surfaces even when quarantine
  acquisition tooling is not

Decision:

- allow search-only mode when native search exists
- fail closed on acquisition when quarantine-safe download tooling is absent
