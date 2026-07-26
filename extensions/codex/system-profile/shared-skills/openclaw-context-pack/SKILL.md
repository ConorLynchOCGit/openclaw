---
name: openclaw-context-pack
description: Use when a Codex explorer, researcher, planner, implementer, or reviewer must hand bounded repository evidence to another Codex agent without transferring raw search output or forcing duplicate inspection.
---

# OpenClaw Context Pack

Return the smallest evidence packet that lets the receiving agent make its
next decision. A context pack is a handoff artifact, not a transcript summary,
task runner, or substitute for source inspection.

## Procedure

1. State the decision or implementation question the pack supports.
2. Gather only evidence that can change architecture, scope, order, risk,
   validation, or acceptance.
3. Classify each finding as `source`, `runtime`, `documentation`, or
   `inference`. Never present an inference as inspected fact.
4. Include exact workspace-relative file/symbol/test refs for source claims.
5. Record contradictions, unknowns, and confidence limits.
6. Stop when the receiver can act without repeating broad discovery. Put
   optional follow-ups under `Inspect Next`.
7. For implementation packets, include the relevant governing module/ranges
   and digest, accepted decisions, write scope, sibling interfaces, focused
   tests, and the exact result packet expected. Do not hand the child a
   monolithic artifact when bounded ranges are already settled.

## Pack Shape

```text
## Bottom Line
## Decision Supported
## Findings
- Evidence class:
  Ref:
  Concrete detail:
  Implementation implication:
  Confidence / limitation:
## Constraints
## Risks / Contradictions
## Inspect Next
## Stop Rationale
```

Do not include raw logs, unbounded command output, whole transcripts, or copied
files. If a claim drives implementation or review, the receiving agent should
inspect the exact ref or explicitly downgrade it.
