---
summary: "Contract for the OpenClaw Skillifier scaffold, check, and package builder."
title: "Skillifier Contract"
---

# Skillifier Contract

## Objective

Define the OpenClaw Skillifier contract inspired by GBrain and adapted to
OpenClaw/Codex cross-runtime needs.

Milestone 3 runtime focus:

- consume canonical `skill_candidate` records
- generate bounded draft packages only
- produce deterministic draft checks and reports
- preserve one canonical `skillPackageId`
- respect destination capability authority
- stay non-installing and non-promoting

## Milestone 3 draft package contract

Each Skillifier MVP draft must produce:

- one canonical `skillPackageId`
- one draft package path
- one generated `SKILL.md`
- one package metadata file
- one provenance report
- one rollback plan
- one deterministic check report
- optional placeholder support files only when explicitly justified by the
  bounded candidate evidence

The originating `skillCandidateId` and linked `proactivityOpportunityId` must
remain attached to the draft package and report artifacts.

## Outputs

The Skillifier should eventually produce:

- `SKILL.md`
- optional deterministic scripts
- optional references
- optional assets or templates
- OpenClaw metadata
- Codex compatibility metadata
- eval fixtures
- routing and decisioning fixtures
- compliance tests
- vetting report
- install plan
- rollback plan
- provenance report

Milestone 3 required outputs are narrower:

- `SKILL.md`
- package metadata
- provenance report
- rollback plan
- deterministic check report

Milestone 3 does not require executable scripts, eval fixtures, routing
fixtures, or production install metadata unless a later milestone adds them.

## Milestone 3 `SKILL.md` scaffold rules

Generated `SKILL.md` must stay bounded and reviewable.

Required sections:

- title
- purpose
- when to use
- when not to use
- safety boundaries
- expected inputs
- expected outputs
- workflow outline
- success checks
- open questions
- provenance summary

The scaffold must not fabricate deep implementation details that are not
supported by the bounded candidate evidence.

The scaffold must not include raw transcript snippets or raw tool logs.

## Properly skilled checklist

A skill is "properly skilled" only when all required items for its risk tier
exist:

- skill contract exists
- trigger and use cases are defined
- anti-patterns are defined
- safety boundaries are defined
- deterministic logic is script-backed where appropriate
- tests exist for deterministic logic
- evals exist for model judgment
- routing and decisioning cases exist
- compliance test verifies the agent reads `SKILL.md`
- vetting passes for the risk tier
- cross-runtime packaging is valid
- proactivity linkage exists
- rollback plan exists

## Design rules

- keep `SKILL.md` concise and push detailed material into references when needed
- do not generate unsafe wrappers merely to satisfy cross-runtime packaging
- do not package raw session content into examples
- make provenance and rollback first-class outputs, not afterthoughts
- preserve one source-of-truth package even when adapters differ by runtime
- keep Milestone 3 packages in review-only posture: non-promoted, bounded, and
  destination-compliant
