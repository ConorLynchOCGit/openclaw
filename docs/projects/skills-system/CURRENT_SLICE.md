---
summary: "Current slice for the Skills System project."
title: "Skills System Current Slice"
---

# Current Slice

## Slice

`skill-vetting-canonization-and-clawhub-normalization`

## Goal

Turn external-skill review from an ad hoc behavior into a canonical system lane
with:

- one project home
- one durable vetting workflow
- one repo-owned skill surface
- one explicit quarantine contract

## Current outcome

- created the canonical `skills-system` project workspace
- created the `skill-vetting` workstream under that project
- created a bundled `skills/skill-vetting/SKILL.md`
- normalized ClawHub usage around:
  - search and workspace installs when the runtime supports them
  - quarantine-only acquisition for third-party review
- added explicit operator-facing reporting and runtime-surface proof so the
  vetting lane can produce durable artifacts instead of only chat prose
- updated project discovery and registry surfaces so the new project is
  topology-visible

## Current judgment

This slice is about making skill review durable and explicit before a broader
agent/skill expansion pass.

The correct next move after this slice is not “install more marketplace
skills.” It is to prove the new review lane and keep the search/acquisition
path honest on the live runtime surfaces.
