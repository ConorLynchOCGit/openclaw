---
summary: "Eval and routing contract for skill decisioning, compliance, and safety across OpenClaw and Codex."
title: "Skill Evals And Routing"
---

# Skill Evals And Routing

## Objective

Define how the Skills Platform proves a skill should trigger and that the agent
actually follows the skill.

## Required eval families

- decisioning evals
- avoid or negative evals
- ambiguous or cofire evals
- compliance evals
- workflow-contract evals
- prompt-injection evals
- sandbox and permission evals
- cross-runtime evals for OpenClaw and Codex
- regression fixtures generated from distilled OpenClaw and Codex sessions

## Core rules

- routing evals are evidence and guardrails, not semantic authority
- exact keyword routers must not become the sole runtime truth
- eval fixtures must use bounded redacted task episodes, not raw transcripts
- compliance tests must verify the agent read and followed `SKILL.md`
- failure in a relevant eval family blocks promotion for that risk tier

## Minimum proof for promotion

- intended trigger routes to the right skill
- unrelated prompts do not route to the skill
- ambiguous prompts are either resolved correctly or explicitly cofire-safe
- the agent reads `SKILL.md`
- the agent respects tool, sandbox, and permission boundaries
- the skill behaves consistently across declared runtime targets
