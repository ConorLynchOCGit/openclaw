---
summary: "Autonomy ladder and lifecycle policy for skill candidates, drafts, canaries, and promotions."
title: "Skill Lifecycle And Autonomy Policy"
---

# Skill Lifecycle And Autonomy Policy

## Objective

Define how far the system may move a skill candidate forward without blocking on
human review.

The core product decision is explicit:

- the user should not be required to review every low-risk skill candidate
- low-risk instruction-only skills may later auto-promote in bounded scopes
- medium-risk and high-risk skill changes remain approval-gated

## Lifecycle states

- `detected`
- `drafted`
- `tested`
- `vetting_failed`
- `canarying`
- `promoted_limited`
- `promoted_broad`
- `superseded`
- `rejected`
- `disabled`
- `rolled_back`

## Autonomy ladder

### Level 0 - Observe only

- Allowed actions: detect candidate, store bounded evidence summary, link to
  proactivity.
- Blocked actions: draft, install, canary, or modify a skill.
- Required evidence: deterministic candidate id and bounded recurrence signal.
- Required tests/evals: none yet.
- Rollback expectation: remove or supersede the candidate record.
- User approval: not required.

### Level 1 - Auto-draft candidate skill

- Allowed actions: create package draft, generate `SKILL.md`, metadata, test
  stubs, eval stubs, provenance, and rollback report on a branch or isolated
  path.
- Blocked actions: enable or install the skill.
- Required evidence: candidate record plus bounded source references and merge
  rationale.
- Required tests/evals: scaffold-level validation.
- Rollback expectation: delete or revert the draft artifact.
- User approval: not required for low-risk drafts; required for higher-risk
  scoped generation if the draft would touch protected content.

### Level 2 - Auto-test and auto-vet

- Allowed actions: run scanner, conformance checks, decisioning evals,
  compliance tests, and packaging checks.
- Blocked actions: broad enablement.
- Required evidence: draft package plus declared risk tier.
- Required tests/evals: tier-appropriate unit, routing, compliance, and safety
  checks.
- Rollback expectation: clear test artifacts and preserve results as bounded
  evidence only.
- User approval: not required for low-risk and medium-risk testing.

### Level 3 - Auto-canary or shadow mode

- Allowed actions: enable a skill in a bounded shadow or canary scope.
- Blocked actions: broad default rollout.
- Required evidence: passing tests/evals/vetting for the declared risk tier.
- Required tests/evals: canary gate and limited-scope discovery verification.
- Rollback expectation: automatic disable or demotion on failure.
- User approval: not required for low-risk limited-scope canaries; required for
  higher-risk canaries.

### Level 4 - Auto-promote low-risk limited-scope skills

- Allowed actions: enable a low-risk skill in a limited scope after passing
  tests, vetting, and canary.
- Blocked actions: broad/global enablement, executable/networked skills.
- Required evidence: green canary, install target, rollback plan, provenance.
- Required tests/evals: full low-risk suite.
- Rollback expectation: disable path and revert path must be immediate.
- User approval: not required for low-risk limited-scope promotion.

### Level 5 - Auto-maintain existing low-risk skills

- Allowed actions: add eval fixtures from failures, prune stale candidate
  duplicates, repair metadata drift, disable failed low-risk canaries, and
  propose supersession.
- Blocked actions: risky code execution or high-risk promotion.
- Required evidence: prior active skill version and bounded maintenance reason.
- Required tests/evals: maintenance validation plus regression guard.
- Rollback expectation: revert maintenance commit or restore previous version.
- User approval: not required for low-risk maintenance.

### Level 6 - Human approval required

- Allowed actions: escalate with complete evidence and rollback plan.
- Blocked actions: autonomous promotion or enablement.
- Required evidence: risk tier, vetting, tests/evals, install scope, rollback,
  and provenance.
- Required tests/evals: all tier-required checks complete.
- Rollback expectation: explicit operator-visible revert or disable path.
- User approval: required.

## Always gated regardless of level

- high-risk installation
- executable skills with scripts beyond declared low-risk boundaries
- skills with network access
- skills with credential or env access
- broad runtime enablement
- outbound sends
- runtime code edits outside a later explicitly approved skill-generation slice
