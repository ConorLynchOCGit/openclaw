---
summary: "Eval and routing contract for skill decisioning, compliance, and safety across OpenClaw and Codex."
title: "Skill Evals And Routing"
---

# Skill Evals And Routing

## Objective

Define how the Skills Platform proves a skill should trigger and that the agent
actually follows the skill.

## Required eval families

- model-owned eval fixture generation from bounded evidence
- deterministic eval execution over declared fixtures
- decisioning evals
- avoid or negative evals
- ambiguous or cofire evals
- compliance evals
- workflow-contract evals
- prompt-injection evals
- sandbox and permission evals
- cross-runtime evals for OpenClaw and Codex
- regression fixtures generated from distilled OpenClaw and Codex sessions
- resolver/trigger evals over user-language trigger phrases
- check-resolvable-style health checks for reachability, overlap, gaps,
  orphaned packages, missing evals, missing E2E, and missing rollback metadata
- package E2E tests from user intent through runtime-visible behavior

## Core rules

- routing evals are evidence and guardrails, not semantic authority
- exact keyword routers must not become the sole runtime truth
- eval fixtures must use bounded redacted task episodes, not raw transcripts
- compliance tests must verify the agent read and followed `SKILL.md`
- failure in a relevant eval family blocks promotion for that risk tier
- model-owned eval generation may propose positive, negative, ambiguous,
  compliance, safety, and regression cases, but deterministic CI only executes
  declared fixtures and compares declared expected outputs/routes
- semantic questions such as ambiguous trigger meaning, skill usefulness,
  skill-vs-plan classification, and whether usage suggests improvement remain
  model-owned or operator-owned
- telemetry, scores, and pass counts may trigger review or block promotion, but
  they must not deterministically infer semantic skill quality or promotion
  worthiness

## Minimum proof for promotion

- intended trigger routes to the right skill
- unrelated prompts do not route to the skill
- ambiguous prompts are either resolved correctly or explicitly cofire-safe
- the agent reads `SKILL.md`
- the agent respects tool, sandbox, and permission boundaries
- the skill behaves consistently across declared runtime targets
- the package loads through the real loader or canary loader
- check-resolvable-style report shows no orphaned package, unresolved trigger,
  unreviewed overlap, missing required eval family, missing E2E, or missing
  rollback path for the target risk tier

## Resolver and reachability report

The eval harness must produce a structured report with:

- declared trigger phrases and expected skill ids
- unrelated/avoid prompts and expected no-route or alternate-route outcomes
- ambiguous/cofire prompts and expected clarification or safe cofire behavior
- loaded skill ids, package ids, paths, and hashes
- missing resolver/discovery metadata
- exact duplicate trigger strings
- model-reviewed semantic overlap findings
- orphaned packages and stale package references
- missing eval, E2E, canary, install, or rollback records

Deterministic report generation may find exact missing files and exact duplicate
declared triggers. Semantic overlap, gap, or route quality findings must be
model-reviewed or operator-reviewed before they become lifecycle decisions.
