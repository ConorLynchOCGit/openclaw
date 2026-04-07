# Memory Spec Pack

## Purpose

This directory contains the implementation-ready spec pack for the remaining
memory-system work.

Use these docs when the roadmap says a family still needs design or when a
partially built family still needs a deliberate productionization plan.

## Read order for a fresh session

1. `/memory-system/README`
2. `/memory-system/ARCHITECTURE`
3. `/memory-system/memory-roadmap`
4. `/memory-system/feature-inventory`
5. `/memory-system/specs/README`
6. `/memory-system/specs/implementation-sequencing`
7. the specific feature spec you are about to implement

## Spec index

### Cross-cutting architecture and planning

- `/memory-system/specs/semantic-event-detector`
- `/memory-system/specs/semantic-retrieval-routing`
- `/memory-system/specs/ambiguity-and-clarification`
- `/memory-system/specs/candidate-confirmation-lifecycle`
- `/memory-system/specs/phrase-induction`
- `/memory-system/specs/generalized-lesson-learning`
- `/memory-system/specs/behavior-application`
- `/memory-system/specs/user-repair-and-memory-control`
- `/memory-system/specs/messy-language-eval`
- `/memory-system/specs/governance-surface-productionization`
- `/memory-system/specs/implementation-sequencing`
- `/memory-system/specs/delivery-enablements`
- `/memory-system/specs/premortem`
- `/memory-system/specs/architecture-fit-review`

### User-visible feature families

- `/memory-system/specs/response-style-profile`
- `/memory-system/specs/recurring-procedure-memory`
- `/memory-system/specs/workflow-improvement-memory`
- `/memory-system/specs/project-memory-expansion`
- `/memory-system/specs/unmet-need-planning`

## Rules for using this spec pack

- do not treat these docs as permission to skip the existing plugin/runtime
  boundaries
- do not confuse “already built” with “ready for normal production use”
- use `/memory-system/feature-inventory` to determine whether a family needs:
  - implementation
  - productionization
  - or no new spec work at all
- if two specs overlap, resolve the overlap in
  `/memory-system/specs/architecture-fit-review` before starting code

## Current non-goals

This spec pack does not authorize:

- broad autonomous memory behavior
- automatic Skill Vetter invocation
- autonomous procurement
- autonomous approval
- actual installation
- production-first experimentation
