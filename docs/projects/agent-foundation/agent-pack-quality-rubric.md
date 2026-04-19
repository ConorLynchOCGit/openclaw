---
summary: "Operational quality rubric for core agent packs beyond file-existence checks."
title: "Agent Pack Quality Rubric"
---

# Agent Pack Quality Rubric

## Purpose

Agent packs now exist. This rubric raises the bar above mere structural
completeness.

## Minimum quality dimensions

### Verification contract

The pack states how the agent should prove its own work before claiming
completion.

### Evidence hierarchy

The pack states what sources are authoritative, preferred, supporting, or
insufficient.

### Tool routing

The pack explains which tools to use first, which to avoid, and what should
trigger escalation.

### Good output / bad output

The pack defines what acceptable deliverables look like and what failure modes
must be avoided.

### Re-entry safety

The pack tells the agent what to reload when re-entering a session or picking
up interrupted work.

### Escalation thresholds

The pack defines which actions are allowed, risky, or forbidden.

## Priority roles for this rubric

- `main`
- `builder`
- `researcher`
- `web-researcher`
