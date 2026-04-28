---
summary: "Current slice for the Skills System project."
title: "Skills System Current Slice"
---

# Current Slice

## Slice

`phase2-skills-platform-specs-and-autonomy-policy`

## Goal

Define the durable contract for the OpenClaw Skills Platform before runtime
implementation begins.

This slice establishes:

- one canonical lifecycle model for skill candidates, drafts, canaries, and
  promotions
- one autonomy ladder for low-risk versus high-risk skill automation
- one risk-tier policy for vetting, evals, install scope, and approval gates
- one proactivity-integrated surfacing contract for skill candidates
- one cross-runtime packaging contract for OpenClaw and Codex
- one rollback/version-control policy for automatic skill changes

## Current outcome

- broadens the project from loading/vetting into a lifecycle-managed skills
  platform
- upgrades the docs pack so later milestones can land without inventing new
  policy ad hoc
- encodes the product decision that low-risk skill work must not make the user
  a chokepoint for every candidate
- ties future skill candidates to the existing proactivity surfaces instead of
  creating a second review queue
- defines the milestone sequence for candidate ledger, Skillifier, evals,
  canarying, low-risk auto-promotion, and cross-runtime install

## Current judgment

The correct next move after this slice is to implement the skill candidate
ledger inside the existing proactivity system.

That is the leverage point that turns real Codex/OpenClaw work into bounded
skill opportunities, rather than expanding skill docs or marketplace installs
in isolation.
