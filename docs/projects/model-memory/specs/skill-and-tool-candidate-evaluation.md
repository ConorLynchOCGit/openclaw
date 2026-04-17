---
summary: "Evaluation and approval contract for internal and third-party skill or tool candidates."
title: "Skill And Tool Candidate Evaluation"
---

# Skill And Tool Candidate Evaluation

## Objective

Define how internal and third-party skill or tool candidates are judged before
promotion.

## Required checks

### Internal candidates

- representative replay
- contract validation
- safety and permission review
- operator approval

### Third-party candidates

- `skill-vetter`
- bounded local evaluation
- install vs inspire vs reject recommendation
- operator approval

## Outcome contract

Allowed outcomes:

- `install`
- `inspire`
- `reject`

## Meaning

### `install`

The candidate is fit for direct installation after approval.

### `inspire`

The candidate should not be installed directly.

Instead the next artifact should be:

- a repo-owned project spec or candidate draft

### `reject`

The candidate should not proceed through that path.

## Promotion note

Under the current skills posture, approved install should be treated as live
availability rather than staged quarantine.
