---
name: openclaw-gbrain-native-architecture-review
description: Use when reviewing OpenClaw/GBrain planning, orchestration, memory, agent, tool, source-collector, runtime, task/session, or proof architecture for native fit, ownership, failure points, and unnecessary parallel systems.
---

# OpenClaw GBrain Native Architecture Review

Use this skill when a plan or implementation touches OpenClaw or GBrain
architecture, agent orchestration, source collectors, memory writeback,
runtime truth, task/session projection, build/deploy behavior, or proof design.

## Positive Patterns

Strong architecture:

- uses native OpenClaw run/session/subagent events as runtime truth;
- uses native `task` for foreground manager-style source/reviewer delegation,
  with sibling `task` calls for independent parallel lanes;
- reserves raw `sessions_spawn`/`sessions_yield` for explicit async/background
  or persistent session work instead of normal foreground planning scouts;
- treats child completion output as evidence leads and preserves native result
  pointers rather than building a parallel synchronization or proof harness;
- keeps source-shaped agents separate from use-case skills;
- keeps GBrain as durable memory, not a parallel doc dump;
- writes final memory after synthesis/review and verifies readback;
- uses GBrain native page/timeline/search/extract/dream/autopilot paths;
- uses source-code inspection before runtime claims;
- minimizes schema where model judgment should carry semantics;
- keeps tasks/sessions/readbacks as projections, not competing truth;
- keeps Codex harness restricted to coding or explicit Codex-runtime agents;
- proves through regular runtime, not separate harnesses.

## Negative Patterns

Block or require revisions when architecture:

- creates a custom proof harness instead of regular runtime;
- adds a parallel execution substrate, memory system, route truth, or task
  state;
- treats task/session/transcript projections as execution authority;
- manually creates graph links instead of using GBrain-native page content and
  extraction;
- uses polling loops where native completion/yield exists;
- hides full child results behind truncated progress summaries when native
  result text, session refs, or artifact refs exist;
- lets source agents mutate outside their lane;
- duplicates model/runtime truth in config, session, transcript, and controller;
- leaks Codex app-server/harness into non-coding agents;
- uses deterministic schemas to choke useful model output;
- introduces a new plugin/tool/workflow when a native OpenClaw/GBrain surface
  already exists.
- creates runtime quality states for planning concepts that should remain
  artifact/reviewer reasoning, such as `source_route_passed`,
  `reviewer_delta_complete`, or `context_pack_valid`;
- replaces native `task` manager-style delegation with a custom fanout queue,
  proof runner, or lifecycle wrapper for ordinary planning scouts;
- makes GBrain summary the final plan artifact instead of linking a full
  `plans/<slug>` record.

## Review Moves

Ask:

- What is the native OpenClaw/GBrain primitive for this?
- Where is the authoritative truth?
- Which fields are projections and can be deleted or demoted?
- What moving part can be removed without losing functionality?
- Is this source-shaped, skill-shaped, or agent-shaped?
- What proof through regular runtime would show this works?
- Which proposed moving part can be deleted while preserving functionality?
- Is this a docs/skills/template/eval need rather than a runtime need?

## Output

Return:

```markdown
## Verdict

## Native Fit

## Architecture Findings

- Severity:
  Issue:
  Native alternative:
  Required change:

## Moving Parts To Remove

## Proof Required
```
