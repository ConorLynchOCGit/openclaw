---
summary: "Proposed schema for the first Phase 2 capsule flavor: project_state."
title: "Project State Capsule Schema"
---

# Project State Capsule Schema

## Objective

Define the first capsule schema in enough detail that `project_state` can be
implemented and evaluated without inventing the artifact structure mid-flight.

## Capsule identity

Each `project_state` capsule should identify:

- `capsule_id`
- `capsule_type = project_state`
- `project_id`
- `build_version`
- `content_hash`
- `built_at`

## Suggested sections

### Identity

- project name
- project id
- current scope

### Current state

- short bounded summary
- active phase or slice
- current judgment or status

### Standing rules

- active rule objects
- operator-relevant constraints

### Procedures

- active procedures
- operational runbooks

### Facts

- stable project facts
- environment and topology facts where relevant

### References

- most important supporting docs
- external references where trusted and relevant

### Tools and skills

- tools or skills strongly tied to the project

### Contradictions and unresolveds

- conflicts
- provisional areas
- open questions

### Recent changes

- recent material changes derived from canonical objects and artifact churn

### Provenance summary

- source object ids
- graph neighborhoods
- supporting documents

## Authority fields

Each section should preserve:

- authority band
- trust notes
- unresolved markers where needed

## Evaluation bar

`project_state` evaluation should prove:

- boundedness
- usefulness for operator review
- usefulness for project-oriented prompts
- authored-doc alignment
- contradiction visibility
