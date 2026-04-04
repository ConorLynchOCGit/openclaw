# Memory System Roadmap

## Goal

Build the memory middleware system in controlled, reviewable slices.

## Current compact checkpoint

Use this section first when returning to the memory build after working on
other projects.

Current state:

- the first bounded production soak is complete and passed for its intended
  scope
- that soak proved:
  - read-only retrieval
  - bounded governance writes
  - bounded scheduler classes
  - runner ownership enforcement
  - bounded durable-growth behavior
- ordinary live-turn candidate capture was not the original soak target
- bounded ordinary live interaction -> candidate capture is now separately
  proven in production
- fresh production proof:
  - timestamp: `2026-04-04T02:43:36.765Z`
  - `eventId = c3c336fa-baac-4886-b8b1-a78a1e7abac4`
  - `memoryObjectId = 98833f6a-4305-48bf-8492-31f7b95f987d`
- initial soak expansion proof:
  - `chief` fresh session:
    - `eventId = b8e63c36-b2eb-4c97-b988-8b67b83d99c1`
    - `memoryObjectId = 57f45b20-84ac-4ca4-890d-e01456c41dff`
  - `main` fresh session:
    - `eventId = c9f3424a-33a9-422b-9326-318341180b0a`
    - `memoryObjectId = d0e3bb7d-c0ef-4524-bf9d-3cfbed55a6de`
- initial bounded soak behavior:
  - `memory_events +2`
  - `memory_objects +2`
  - `memory_reviews +0`
  - `background_jobs +0`
- current live focus:
  - bounded live interaction -> candidate capture soak and expansion
- broader automation still deferred:
  - self-improving capture
  - automatic Skill Vetter invocation
  - procurement or install automation
  - actual installation
  - contradiction execution
  - richer drift-remediation execution
  - memory-slot takeover

Fast re-entry reading order:

1. `docs/memory-system/STATUS.md`
2. `docs/memory-system/CURRENT_SLICE.md`
3. `docs/memory-system/PRODUCTION_SOAK_REPORT.md`
4. `docs/memory-system/memory-roadmap.md`
5. `docs/memory-system/DECISIONS.md`
6. `docs/memory-system/OPEN_QUESTIONS.md`

## Phase 0 — repo reconciliation and architecture grounding

### Goal

Map the proposed memory-system architecture onto the actual repo structure and conventions before implementation.

### Deliverables

- reconciliation report
- recommended final placement for plugin, skills, docs, migrations, tests, workspace mirrors
- identified conflicts with existing structure
- proposed path adjustments

### Exit criteria

- architecture is mapped to real repo structure
- no major pathing assumptions remain untested

---

## Phase 1 — docs pack and scaffolding

### Goal

Create the in-repo durable handoff and working structure.

### Deliverables

- `docs/memory-system/` doc pack
- memory-system section in `AGENTS.md`
- plugin folder scaffold
- internal skill folder scaffold

### Exit criteria

- Codex can start from repo docs instead of chat history

---

## Phase 2 — schema foundation

### Goal

Add Supabase/Postgres schema for context plane and knowledge plane.

### Deliverables

- schema migration v1
- core enums
- sessions/events/tool results
- durable memory tables
- procedures/policies/skill candidates
- background jobs/agent state

### Exit criteria

- database foundation exists and applies cleanly

---

## Phase 3 — plugin base and DB access layer

### Goal

Create the native plugin shell and central DB query layer.

### Deliverables

- plugin manifest
- typed DB query module
- service scaffolding
- tool registration skeleton

### Exit criteria

- plugin can build and connect to schema cleanly

---

## Phase 4 — core context-plane tools

### Goal

Implement session survival mechanisms first.

### Deliverables

- `tool_result_persist`
- `tool_result_rehydrate`
- `compaction_plan`
- `session_memory_get`
- `session_memory_update`

### Exit criteria

- oversized tool outputs can be persisted and previewed
- session memory can be updated and retrieved

---

## Phase 5 — typed memory tools

### Goal

Implement durable knowledge capture and retrieval.

### Deliverables

- `memory_capture`
- `memory_query`
- `memory_link`
- `memory_review`
- `memory_policy_check`

### Exit criteria

- typed memory can be captured, linked, reviewed, queried, and policy-checked

---

## Phase 6 — procedure and promotion tools

### Goal

Build the event-to-procedure-to-skill pipeline.

### Deliverables

- `procedure_candidate_create`
- `procedure_validate`
- `skill_candidate_create`
- `skill_candidate_review`
- promotion scoring implementation

### Exit criteria

- validated procedures and skill candidates can be tracked properly

---

## Phase 7 — security and retrieval layer

### Goal

Add RLS/security model and hybrid retrieval substrate.

### Deliverables

- membership/auth helper tables
- RLS policies
- views/RPC design
- FTS/trigram support
- pgvector embedding table
- hybrid retrieval functions

### Exit criteria

- retrieval is secure, typed, and hybrid

---

## Phase 8 — internal skills

### Goal

Teach the model how to use the plugin correctly.

### Deliverables

- `memory-middleware`
- `procedure-distiller`
- `policy-check`
- `session-memory-updater`
- `skill-procurement`

### Exit criteria

- model behavior is guided by in-repo skills, not just tool availability

---

## Phase 9 — tests and hardening

### Goal

Make the system trustworthy and reviewable.

### Deliverables

- unit tests
- integration tests
- validation workflow
- update docs for implemented behavior

### Exit criteria

- main flows are tested and docs reflect reality

---

## Phase 10 — third-party skill onboarding

### Goal

Carefully add vetted third-party capabilities.

### Intended order

1. Skill Vetter
2. self-improving-agent
3. Proactive Agent (later, gated)

### Exit criteria

- no third-party skill bypasses policy and vetting

---

## Phase 10.5 — production soak closeout and bounded live interaction capture

### Goal

Close the first bounded production soak as passed for its intended scope,
compact the validated state, and move to the next slice:
live interaction -> bounded candidate capture.

### Deliverables

- compact soak closeout summary
- explicit statement that the first bounded production soak passed for:
  - read-only retrieval
  - bounded governance writes
  - bounded scheduler classes
  - runner ownership enforcement
  - bounded durable-growth observation
- explicit statement that ordinary live agent-turn capture was not the target of
  the completed soak
- next active slice definition for ordinary live interaction ->
  bounded candidate capture
- proof plan requiring one real live turn to create the expected candidate,
  event, and object rows while review and promotion remain manual

### Exit criteria

- the first bounded production soak is recorded as passed for its intended
  scope
- the compacted state preserves the current approved live boundary without
  broadening automation
- the next active slice is live interaction -> bounded candidate capture
- reduced-profile self-improving capture and broader automation expansion stay
  deferred until after that slice

---

## Phase 10.6 — bounded live interaction capture soak and next-slice selection

### Goal

Use the now-proven ordinary live interaction -> candidate-capture path as the
basis for the next bounded production soak, then choose the next coherent live
memory chunk without jumping to broad autonomous behavior.

### Deliverables

- repeated live proofs that ordinary real interactions create bounded
  candidate, event, and object rows
- row-quality review for the new live interaction-derived entries
- observed volume review against actual live interaction volume
- compact state updates that keep re-entry context cheap
- recommendation for the next coherent bounded live chunk after candidate
  capture proves stable enough

### Exit criteria

- ordinary live interactions repeatedly create the expected candidate memory
  rows on the approved live boundary
- the produced rows look structurally correct and interpretable
- review and promotion remain manual throughout the soak
- the next larger bounded live slice is chosen explicitly
- broader automation expansion remains deferred until this slice is stable

---

## Ongoing requirements

After every slice:

- update `STATUS.md`
- update `DECISIONS.md`
- update `OPEN_QUESTIONS.md`
- adjust `CURRENT_SLICE.md` only when the next slice is explicitly chosen
