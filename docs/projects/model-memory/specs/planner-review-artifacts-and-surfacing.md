---
summary: "Detailed review artifact and surfacing contract for the proactive planner."
title: "Planner Review Artifacts And Surfacing"
---

# Planner Review Artifacts And Surfacing

## Objective

Define the concrete review artifact and surfacing contract that lets planner
outputs appear inside ordinary OpenClaw workflow instead of a hidden queue.

## Candidate artifact

Each candidate should include:

- `candidateId`
- `candidateType`
- `targetId`
- `projectId`
- `summary`
- `recommendedAction`
- `urgency`
- `relevanceSignals`
- `surfacingLane`
- `requiresApproval`
- `evidenceRefs`
- `createdAt`
- `lastSurfacedAt`
- `status`

## Surfacing lanes

- `must_surface`
- `context_surface`
- `background_only`

## Channel contract

### Turn

Show only when:

- the candidate overlaps the active work strongly enough
- or it is `must_surface`

### Heartbeat

Show:

- all pending `must_surface`
- summary counts for other pending classes

### Daily operator review

Show:

- grouped pending candidates
- top-ranked by urgency and age
- enough evidence to act

## Identity rule

The same `candidateId` must appear across turn, heartbeat, and daily review so
operator cognition is not wasted on duplicated but renamed items.
