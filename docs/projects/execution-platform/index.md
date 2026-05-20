---
summary: "Execution Platform project workspace."
title: "Execution Platform"
---

# Execution Platform

The Execution Platform owns OpenClaw runtime routing, workflow execution,
runtime jobs, Work Queue projection/readback/control, Runtime Tool Kernel,
workflow definitions, model/worker/tool traces, and closeout/finalization
gates.

## Current Focus

The current pre-proof focus is the final item in
[Coding Executor Team Capability Leap](/projects/execution-platform/specs/coding-executor-team-capability-leap):
Fallback And Compatibility Retirement plus the bounded canonical-path refactor.

Product/Spec Planning remains the next major live UX proof, but it follows this
retirement/refactor blocker because the latest hardening made the production
path stronger while leaving old runner exports, degraded closeout branches,
proof helpers, and workflow-definition/evidence-profile type drift close enough
to the live path to confuse validation and diagnostics.

2026-05-17 update: the context supply chain now indexes the full source
prompt into bounded refs, lets context scout request bounded excerpts, and
requires context handoff packets before context-dependent implementation.

2026-05-18 update: the Product/Spec replay accepted context synthesis and a
post-synthesis graph, but selected one broad foundation implementation node.
The active pre-proof block now converges Runtime Work Graph, Runtime Tool-Call
Kernel, RuntimeWorkerSupervisor, Work Queue events/readback/control, Context
Engine, provider stream wrappers, validation/QA tools, and closeout
finalization into one native agentic coding harness.

2026-05-18 later update: the next pre-proof blocker is
[Non-Codex Tool Worker Runtime](/projects/execution-platform/specs/non-codex-tool-worker-runtime).
The Kimi/non-Codex implementation lane must retire giant JSON patch proposals
from production success and use a runtime-owned tool loop before Product/Spec
proof resumes.

## Core Docs

- [Status](/projects/execution-platform/STATUS)
- [Current Slice](/projects/execution-platform/CURRENT_SLICE)
- [Roadmap](/projects/execution-platform/roadmap)
- [Decisions](/projects/execution-platform/DECISIONS)
- [Spec Index](/projects/execution-platform/specs)
