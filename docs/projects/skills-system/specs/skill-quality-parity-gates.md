---
summary: "Acceptance gates required for OpenClaw skills to meet or exceed Gbrain and Hermes skill-system capability."
title: "Skill Quality Parity Gates"
---

# Skill Quality Parity Gates

## Objective

Make parity with mature skill systems an explicit Phase 2 acceptance target.

OpenClaw should not merely surface skill ideas. By the end of the Phase 2
skills buildout, it should meet or exceed the practical quality bar represented
by:

- Gbrain's `skillify` and `check-resolvable` style checklist: skill contract,
  tests, integration tests, LLM evals, resolver triggers, resolver evals,
  reachability/overlap checks, E2E proof, and filing/ownership coverage
- Hermes' learning-loop shape: observe repeated work, distill reusable skills,
  reuse them automatically when relevant, refine them from feedback, and keep
  install/edit behavior visible and controllable

This spec does not authorize broad autonomous installation, outbound sending,
or autonomous action execution. It defines the gates that must exist before
later milestones may safely enable higher autonomy.

## Standing architecture rule

Skill lifecycle judgment remains model-owned or operator-owned.

Deterministic code may enforce ids, refs, hashes, schemas, caps, package shape,
destination permissions, resolver file reachability, exact trigger-fixture
execution, canary scope, rollback metadata, install paths, and safety scans.

Deterministic code must not decide:

- whether evidence is skill-worthy
- whether a candidate is a new skill, an existing-skill enhancement, a
  proactive plan, a merge, or a demotion
- whether a skill is semantically useful enough to promote
- whether usage feedback semantically proves improvement or retirement
- visible card copy or skill proposal copy

Those decisions come from bounded model review, eval results, explicit
operator approval, or approved low-risk autonomy policy.

## Required parity gates

### 1. Skill eval generation and execution

Every promoted skill must have tier-appropriate evals:

- positive trigger cases
- negative avoid cases
- ambiguous/cofire cases
- compliance cases proving the agent read and followed `SKILL.md`
- model-output quality cases when the skill calls a model
- safety, sandbox, permission, privacy, and prompt-injection cases
- regression cases distilled from real OpenClaw and Codex failures

Model-owned eval generation may propose fixtures from bounded source packets.
Deterministic code may run the fixtures and report pass/fail. Failing required
eval families block canary or promotion for the relevant risk tier.

### 2. Resolver and trigger tests

Every installed or canaried skill must prove it is reachable through the
runtime's actual resolver/loader path.

Required checks:

- user-language trigger phrases route to the intended skill
- unrelated prompts do not route to the skill
- ambiguous prompts are cofire-safe or ask for clarification
- skill descriptions and metadata are precise enough for progressive
  disclosure
- loaded skill context does not require the operator to remember internal
  slash commands or jargon

The model may judge ambiguous semantic fit. Deterministic trigger tests may
only execute declared fixtures and compare declared expected routes.

### 3. Check-resolvable-style reachability and overlap

OpenClaw needs a skills-tree health check analogous to
`check-resolvable`.

The check must report:

- orphaned skills or packages
- missing resolver/discovery metadata
- duplicate or overlapping trigger coverage
- gaps where common user intents have no skill candidate
- stale package references
- missing owner/project filing
- missing eval, vetting, canary, rollback, or install records
- integrity drift from the reviewed package hash where enforced

Overlap and gap findings that require semantic judgment must be model-reviewed
or operator-reviewed. Deterministic code may detect exact missing files, ids,
hashes, refs, declared fixtures, and duplicated explicit trigger strings.

### 4. Package E2E tests

Every promoted package must pass at least one end-to-end test from user intent
to observed result in each declared runtime scope.

Required evidence:

- package loads through the real runtime loader
- resolver selects or considers it through the real route
- the agent reads the intended `SKILL.md`
- the expected output artifact or behavior occurs
- safety and permission boundaries are honored
- no unrelated skill is silently preferred
- rollback/disable path is available after the E2E

For draft packages, the E2E may run in fixture or shadow mode. For installed
packages, it must run in the target runtime or a faithful canary runtime.

### 5. Install, canary, and rollback lifecycle

Every skill package must have one canonical lifecycle record connecting:

- candidate id
- package id
- version id
- source refs and hashes
- eval report ids
- vetting report ids
- install target ids and paths
- canary scope
- current enabled state
- rollback and disable instructions

Low-risk skills may later auto-canary or auto-promote only inside the approved
autonomy ladder. Medium-risk and high-risk skills require explicit approval.
Failed canaries must automatically disable, demote, or block wider promotion.

### 6. Usage-based self-improvement loop

OpenClaw must close the loop from usage back into skill maintenance without
turning telemetry into deterministic semantic truth.

Allowed loop:

1. observe bounded usage, failure, correction, and outcome evidence
2. model-review whether the evidence suggests improvement, merge, retirement,
   new eval fixtures, or no action
3. draft bounded patch/eval/candidate artifacts
4. run tests, evals, vetting, canary, and E2E
5. promote only through approved autonomy or explicit operator approval
6. keep rollback and provenance attached

Telemetry can trigger review by structural cadence or explicit events. It
cannot deterministically infer usefulness, quality, promotion, retirement, or
skill-worthiness.

### 7. Approval-gated promotion and cross-runtime install

OpenClaw must support one source-of-truth package with adapters for OpenClaw
and Codex while preserving approval boundaries.

Required checks:

- package is discoverable in each declared runtime
- runtime-specific metadata is isolated from the shared contract
- no unsafe wrapper is added just to satisfy a runtime
- install paths and hashes are recorded
- broad or global enablement requires explicit approval
- Codex and OpenClaw installs preserve provenance and rollback
- cross-runtime drift creates a repair candidate, not silent divergence

## Milestone placement

Milestone 4 must establish the first enforceable parity gate:

- eval generation and execution
- resolver/trigger tests
- check-resolvable-style reachability and overlap report
- draft package E2E for review-only packages

Later milestones complete the runtime lifecycle:

- Milestone 5: risk, vetting, provenance, and policy integration
- Milestone 6: auto-draft and auto-test loops
- Milestone 7: canary and shadow mode
- Milestone 8: low-risk limited-scope promotion
- Milestone 9: cross-runtime install
- Milestone 10: usage-based self-improvement and maintenance

Milestone 11 Skills Studio is a visibility/control surface over this lifecycle,
not a substitute for the gates.

## Completion bar

OpenClaw can claim parity readiness only when a representative generated skill
can move through this chain:

1. model-reviewed candidate from bounded evidence
2. bounded draft package
3. generated evals and trigger fixtures
4. check-resolvable-style health report
5. package E2E in shadow/canary
6. vetting and risk report
7. limited install/canary with rollback
8. usage evidence captured after use
9. model-reviewed improvement or no-action decision
10. approved or autonomy-valid promotion across declared runtime targets

Until then, OpenClaw has candidate discovery and draft generation, not full
Gbrain/Hermes-class skill lifecycle capability.

## External reference points

- Gbrain skillify/check-resolvable quality bar:
  `https://github.com/garrytan/gbrain/blob/master/skills/skillify/SKILL.md`
- Gbrain project-level skillpack/read-write architecture:
  `https://github.com/garrytan/gbrain/blob/master/README.md`
- Hermes learning loop:
  `https://hermes-agent.ai/features/learning-loop`
- Hermes custom skills guide:
  `https://hermes-agent.ai/how-to/create-hermes-skills`
