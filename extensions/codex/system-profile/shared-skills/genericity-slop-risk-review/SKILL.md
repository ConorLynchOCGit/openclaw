---
name: genericity-slop-risk-review
description: Use when reviewing a plan, research brief, content strategy, workflow design, or agent-system proposal for generic advice, weak specificity, stale claims, AI-slop patterns, insufficient evidence, and failure to adapt to the actual user, system, brand, source context, or OpenClaw/GBrain environment.
---

# Genericity Slop Risk Review

Use this skill when reviewer needs to decide whether an artifact is genuinely
specific and useful, or merely competent-sounding generic output.

## Positive Patterns

Strong output:

- names the actual system, agents, tools, files, sources, and constraints;
- explains why each recommendation matters in this context;
- expands core ideas until they become executable;
- preserves concrete evidence, examples, source language, or file refs;
- distinguishes current truth from stale memory or assumptions;
- distinguishes net-new work from already implemented work;
- makes tradeoffs visible;
- gives acceptance gates that prove behavior, not just existence;
- says what not to conclude from weak evidence;
- avoids advice that could apply unchanged to any generic agent platform.

## Negative Patterns

Require revision when output:

- says "improve quality," "make it scalable," "use best practices," or
  similar generic phrases without concrete mechanisms;
- lists bullets that are not expanded into recommendations;
- ignores the user's explicit priorities or prior steering;
- summarizes evidence without showing how it changes decisions;
- uses source names as decoration instead of source-grounded reasoning;
- turns reviewer critique into a short acknowledgement rather than a rewrite;
- claims completion because something exists, not because behavior was proven;
- gives proof criteria too weak to catch the failure class;
- adds rigid workflow structure where model judgment should stay dynamic;
- solves the current edge case with language that will be brittle elsewhere.
- claims completion from edited docs/skills without runtime behavior proof;
- presents already implemented and working ideas as recommendations;
- gives a best-practice list instead of the delta from current implementation
  truth;
- fails to say whether a recommendation is build, harden, prove, delete,
  rework, or investigate;
- leaves qualitative review as a checklist instead of rewriting weak sections;
- adds deterministic states, parsers, or queues where agent reasoning and
  native OpenClaw task delegation should suffice;
- repeats historical phase language without implementing the current required
  templates, evals, review standards, and audit closure for the behavior being
  changed.

## Review Moves

Ask:

- Could this plan apply to any other agent system with names swapped?
- Which recommendation is most likely stale or unsupported?
- Which recommendation is already implemented and should be excluded or
  reframed?
- Which item is generic advice rather than a current-state delta?
- Which bullet needs expansion before an agent can execute it?
- What concrete evidence would make this sharper?
- Did the artifact preserve source-specific language, constraints, and traps?
- Did it add unnecessary deterministic structure?
- What would fail in a real proof even if this artifact sounds plausible?
- Which sections are still skeletal despite being present?
- What requirement is missing from the traceability matrix?
- For candidate brand territories, would replacing the company name still work;
  do all options collapse into one category trope; and are shared facts,
  candidate invention, approval status, public-company boundaries, behavioral
  voice, creative legs, and exact operator decisions explicit?

Review these qualitatively. Do not introduce a score gate, parser, or runtime
state machine.

## Output

Return:

```markdown
## Verdict

## Genericity / Slop Findings

- Issue:
  Why it is generic or weak:
  Required rewrite:

## Specificity That Should Be Preserved

## Missing Concrete Detail

## Stale Or Already Implemented Recommendations

## Rewrite Standard
```
