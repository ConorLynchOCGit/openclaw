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

## Materialization target

`project_state` capsule artifacts should materialize under:

- `/root/.openclaw/workspace/.openclaw/knowledge/capsules/`

This is a derived knowledge artifact path, not canonical semantic storage.
Before implementation, workspace topology docs should record
`.openclaw/knowledge/` as the Phase 2 knowledge-artifact root.

Each materialized capsule should include:

- markdown page
- JSON digest
- manifest or index entry

File names should be content-hash-addressed and should not overwrite root
`USER.md` or `MEMORY.md`.

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

### Soft-source evidence

- cited researcher report claims
- cited assistant-answer claims
- tool-grounded facts
- lower-authority external references

Soft-source evidence must remain labeled and must not be merged into standing
rules or hard directives without authority promotion.

### Recent changes

- recent material changes derived from canonical objects and artifact churn

### Provenance summary

- source object ids
- graph neighborhoods
- supporting documents

## Required provenance fields

Every capsule digest should include:

- `source_memory_ids`
- `source_event_ids`
- `source_edge_ids`
- `content_hash`
- `built_at`
- `freshness`
- `stale_markers`
- `conflict_markers`
- `artifact_paths`
- `authority_tiers`
- `source_profile_ids`

Retrieval may use the capsule only when all required source memory ids are
active MMV2 ids or the request is explicitly inspection-oriented.

## Authority fields

Each section should preserve:

- authority band
- authority tier
- source profile id where available
- trust notes
- unresolved markers where needed

## Evaluation bar

`project_state` evaluation should prove:

- boundedness
- usefulness for operator review
- usefulness for project-oriented prompts
- authored-doc alignment
- contradiction visibility
- root `USER.md` / `MEMORY.md` no-write proof
