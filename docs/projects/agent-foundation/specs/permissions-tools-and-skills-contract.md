---
summary: "Spec for the durable contract around agent permissions, tools, and skills."
title: "Permissions Tools And Skills Contract"
---

# Permissions Tools And Skills Contract

## Goal

Define the durable contract that each agent must expose for permissions, tools,
and skills.

## Required durable docs

- `Permissions.md`
- `Tools.md`
- `Skills.md`

## Required questions

Permissions:

- what can the agent do without escalation?
- what requires escalation?
- what is forbidden?

Tools:

- which tool families are allowed?
- which are disallowed?
- which require constrained usage patterns?

Skills:

- which skills are required?
- which are optional?
- which are forbidden?
- which skills or skill classes may auto-draft, auto-test, auto-canary, or
  auto-promote under the current autonomy policy?
- which skill risk tiers still require explicit approval before install or
  broader enablement?

## Success criteria

- agent operational authority becomes explicit
- skill and tool posture is reviewable
- permissions stop living only in implied prompt behavior
