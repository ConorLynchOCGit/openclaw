# Main Session Source-Resolution Model

Date: 2026-04-11

## Purpose

Record the shift from tactical mounted-source exceptions toward a reusable
source-resolution model for Main-session turns.

This model does not create a second memory system. It decides which source
class should be authoritative before Main answers:

- workspace continuity
- repo-coupled canonical implementation truth
- or mixed

## Model

### Question Kind

Main now classifies source posture into a closed set:

- `continuity`
- `implementation`
- `mixed`
- `unclassified`

### Domains

A compact canonical-domain registry now exists for repo-coupled questions:

- `memory_system`
- `plugin_sdk`
- `gateway_protocol`

Each domain defines:

- workspace coordination entrypoints
- canonical mounted entrypoints
- whether exact answers require canonical coverage verification

### Source Candidates

The source-resolution report now works with a closed candidate set:

- `workspace_continuity`
- `workspace_project`
- `mounted_curated_import`
- `repo_canonical_doc`

### Precedence

- `continuity`:
  - authority: workspace continuity
  - support: workspace project/index surfaces
- `implementation`:
  - authority: canonical repo docs
  - support: curated mounted import path
- `mixed`:
  - authority: canonical repo docs for implementation facts
  - support: workspace continuity and workspace project surfaces for context

## Coverage-Gated Answer Policy

Canonical implementation questions now use a generic coverage rule:

- if canonical verification is required and coverage is `unread` or `partial`
  then exact-answer posture is blocked
- Main must keep reading until verified or explicitly disclose incomplete
  coverage
- only `verified` canonical coverage unlocks confident exact-answer posture for
  those questions

This pass makes that policy explicit and durable in routing/provenance. It
does not yet add post-tool telemetry that proves the model actually completed
`document_read(action=verify)` in every live turn.

## Provenance Reporting

Main routing diagnostics now record:

- question kind
- domain
- candidate source classes
- authoritative source
- supporting sources
- workspace entrypoints
- canonical entrypoints
- coverage requirement
- coverage state
- escalation reasons

## Bootstrap Prioritization

Bootstrap context now uses explicit tiers:

- `must_survive`
  - routing-critical and identity-critical bootstrap files
- `useful`
  - helpful but lower-priority context
- `bulk`
  - large continuity payloads such as `MEMORY.md`

This means routing-critical guidance survives before bulky continuity context
does when the bootstrap budget is tight.

## What This Tranche Proved

Targeted tests now cover:

- continuity question -> workspace continuity authority
- implementation question -> canonical repo authority
- mixed question -> canonical authority with workspace support
- partial canonical coverage -> no confident exact-answer posture
- bootstrap prioritization -> must-survive files win before bulk files
- provenance report carries source-resolution state

## What Remains Deferred

1. Post-read runtime telemetry that upgrades canonical coverage from `unread`
   or `partial` to `verified` automatically based on actual `document_read`
   completion.
2. Broader domain expansion beyond the compact initial registry.
3. Higher-level end-to-end replay harnesses that assert the model against live
   transcript replays instead of helper-level targeted tests.
