---
summary: "Canonical diagnosis and slice contract for the pre-Phase-2 code cleanup and refactor program."
title: "Pre-Phase-2 Code Cleanup Program"
---

# Pre-Phase-2 Code Cleanup Program

## Purpose

Define the repo-owned diagnosis and execution contract for the cleanup/refactor
lane that runs before new Phase 2 feature work accelerates.

This is not a broad “make the repo prettier” mandate.
It is a bounded stability and maintainability program intended to reduce
Phase-2 risk and future change cost.

## Official Codex Guidance Used Here

This program intentionally follows official OpenAI Codex guidance:

1. plan first for difficult tasks rather than jumping directly to code
2. keep durable repo behavior in `AGENTS.md`
3. prompt Codex as if writing a GitHub issue with exact files, constraints, and
   validation
4. keep tasks well scoped and reviewable instead of asking for a giant
   all-at-once refactor
5. preserve explicit validation artifacts and parity checks when refactoring

Primary references:

- <https://developers.openai.com/codex/learn/best-practices>
- <https://developers.openai.com/cookbook/examples/gpt-5/codex_prompting_guide>
- <https://developers.openai.com/cookbook/examples/codex/code_modernization>
- <https://openai.com/business/guides-and-resources/how-openai-uses-codex/>

## Diagnosis Contract

The diagnosis slice must:

1. generate a fresh artifact pack under
   `.artifacts/refactor-prephase2/<date>/diagnosis/`
2. inventory only production-code surfaces first
3. classify candidates into:
   - `legacy-retirement`
   - `oversized-orchestration`
   - `duplication-centralization`
   - `dead-code-or-unused-surface`
   - `public-api-compatibility-risk`
4. rank candidates using explicit rubric fields:
   - Phase-2 criticality
   - expected leverage
   - regression risk
   - public API risk
   - extraction difficulty
   - rollback ease
   - test coverage confidence
5. produce:
   - a ranked first-wave backlog
   - a `not-now` list
   - exact slice boundaries for the first implementation waves

Hard rules:

- do not treat all `fallback` or `compat` code as deletion candidates
- do not delete public/plugin-facing surfaces without an explicit compatibility
  review
- do not bundle diagnosis with broad code mutation
- do not reopen already-accepted model-memory authority decisions without fresh
  evidence

## Current Diagnosis Evidence

The first artifact-backed diagnosis run is at:

- `.artifacts/refactor-prephase2/2026-04-24/diagnosis/diagnosis-report.json`
- `.artifacts/refactor-prephase2/2026-04-24/diagnosis/diagnosis-summary.md`

Current ranked first wave from that artifact:

1. `RC-002` — Live runtime orchestration split
2. `RC-003` — Repository and shared ingestion pipeline extraction
3. `RC-001` — MMV2 legacy public/runtime boundary narrowing
4. `RC-005` — Model-memory helper centralization
5. `RC-004` — Proof/harness isolation

Execution status after the first implementation wave:

- `RC-001` landed: default MMV2 runtime/public seams are narrower and
  legacy/admin imports stay explicit
- `RC-002` landed: the live runtime is split under
  `src/agents/model-memory/live-runtime/`
- `RC-003` landed: the MMV2 repository and shared ingestion pipeline are split
  into responsibility-scoped helper modules while the public roots remain
  stable orchestration seams
- next planned slice: `RC-005`

## First-Wave Backlog

The current first-wave backlog is:

### RC-001 — MMV2 Legacy Boundary Narrowing

- surfaces:
  - `src/plugin-sdk/model-memory.ts`
  - `src/agents/model-memory.database.ts`
  - `extensions/model-memory/src/{index,runtime-api,legacy-admin-api,legacy-fallback-registry,storage-engine}.ts`
- class: `legacy-retirement`
- why now:
  the default MMV2 runtime boundary still crosses legacy admin/proof seams and
  explicit rollback toggles that should be harder to reach accidentally

### RC-002 — Live Runtime Orchestration Split

- surfaces:
  - `src/agents/model-memory.live-runtime.ts`
- class: `oversized-orchestration`
- why now:
  the live runtime currently mixes configuration, bootstrap, retrieval,
  dirty-state scheduling, ordinary-turn capture, and tool-result proof capture
  in one file

### RC-003 — Repository And Shared Pipeline Extraction

- surfaces:
  - `extensions/model-memory/src/db/mmv2-native-repository.ts`
  - `extensions/model-memory/src/ingestion/shared-pipeline.ts`
- class: `oversized-orchestration`
- why now:
  these files carry multiple independent responsibilities and are the main
  persistence/ingestion seams that future Phase 2 work will keep touching

### RC-004 — Proof/Harness Isolation

- surfaces:
  - `src/agents/model-memory.session-turn-proof.ts`
  - `extensions/model-memory/src/phase2-entry-validation.ts`
- class: `oversized-orchestration`
- why now:
  these harnesses are valuable but should be easier to understand and safer to
  extend without cross-coupling to hot-path runtime code

### RC-005 — Helper Centralization

- surfaces:
  - repeated parsing, status-mapping, JSON extraction, and closeout-shaping
    helpers across the model-memory runtime and validation stack
- class: `duplication-centralization`
- why now:
  Phase 2 work will otherwise continue paying repeated editing cost across too
  many files

## Not-Now List

The current `not-now` list is explicit, not forgotten:

1. `src/gateway/server-methods/chat.ts`
2. `ui/src/ui/views/chat.ts`
3. `ui/src/ui/app-render.ts`
4. `src/plugins/loader.ts`
5. `src/hooks/loader.ts`

These are real cleanup candidates, but they are secondary until the
Phase-2-critical model-memory/runtime backlog reaches diminishing returns.

## Slice Structure

### Slice 0 — Diagnosis

- create/update canonical maintenance docs
- generate artifact-backed ranked backlog
- seed debt register entries

### Slice 1 — MMV2 Legacy Boundary Narrowing

- narrow default runtime/public seams
- keep legacy admin/proof utilities explicit
- audit and reduce surviving rollback flags

### Slice 2 — Hot-Path Orchestration Extraction

- split the largest Phase-2-critical runtime/repository/pipeline files by
  concern without changing behavior

### Slice 3 — Shared Helper Centralization

- extract repeated parsing, mapping, and shaping helpers into small reusable
  modules

### Slice 4 — Secondary Surface Cleanup

- only after the first three slices are green
- pick off lower-priority gateway/UI/loader cleanup if leverage is still high

## Diminishing-Returns Stop Rule

Stop the cleanup program when all are true:

1. no `high` severity Phase-2-critical cleanup items remain
2. remaining work is mostly stylistic or compatibility retained on purpose
3. the next slice would not materially reduce Phase-2 risk or editing cost
4. the latest Phase-2 validation posture remains green

## Prompt Kit

### Diagnosis Prompt

Use a prompt shaped like a GitHub issue with these required sections:

- objective
- why this matters before Phase 2
- exact in-scope surfaces
- non-goals
- debt classes to inventory
- ranking rubric
- artifact output path
- validation and acceptance

### Implementation Slice Prompt

Each implementation slice prompt must include:

- exact files/surfaces
- required behavior contract
- explicit non-goals
- validation commands
- debt-register/doc updates
- final report fields

### Diminishing-Returns Prompt

Ask Codex to:

1. reread the cleanup ledger and latest diagnosis artifacts
2. classify each remaining item as `high leverage`, `nice to have`, or `stop`
3. recommend the next slice or stopping
4. justify the recommendation with exact remaining debt, not generic tidiness
