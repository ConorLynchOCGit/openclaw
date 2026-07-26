---
name: openclaw-implementation-critique
description: Use before implementing or closing OpenClaw coding work to enforce native-first, code-health, architecture, and proof critique.
---

# OpenClaw Implementation Critique

Use this skill for OpenClaw implementation planning, architecture critique,
source edits, and closeout review.

## Procedure

1. State the proposed fix in one sentence.
2. Classify the fix on the native ladder:
   `config -> workspace prompt -> skill -> bundled plugin/tool -> extension point -> source patch -> new subsystem`.
3. Identify the simpler option with fewer moving parts.
4. Identify the deeper architectural issue, if any: ownership, lifecycle,
   routing, execution truth, data model, state boundary, dependency boundary, or
   operator workflow.
5. Check code health:
   - design fit;
   - correctness and edge cases;
   - complexity and over-generalization;
   - coupling and source of truth;
   - testability and failure proof;
   - security, privacy, and least authority;
   - operability and observability;
   - reversibility and rollback;
   - dependency and config hygiene;
   - documentation and naming.
6. Reject shallow fixes that add semantic labels, post-processing, memory-like
   layers, or duplicate state instead of fixing ownership, lifecycle, routing,
   execution truth, or native wiring.
7. Name the evidence that will prove the fix.

## Decision Rule

Choose the smallest option that:

- satisfies the acceptance check;
- uses native OpenClaw behavior where possible;
- avoids a parallel source of truth;
- survives a fresh container/image replacement;
- can be reviewed and reverted;
- improves or preserves long-term code health.

Do not add a new subsystem unless every native rung above it is ruled out with
evidence.

## Stop Conditions

Stop and redesign when the proposed fix:

- makes the system harder to understand without clear payoff;
- fixes a symptom while preserving a broken architecture boundary;
- uses a new dependency where local/native code already solves the problem;
- adds speculative generality;
- hides runtime truth behind UI-only status;
- touches promotion, rollback, cleanup, Docker socket, secrets, or old runtime
  paths without explicit authority.

## Required Output

Return this compact block:

```text
Native fit:
Simpler option considered:
Root-cause check:
Quality checks:
Moving parts added:
Proof:
```
