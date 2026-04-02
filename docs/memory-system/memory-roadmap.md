# Memory System Roadmap

## Goal

Build the memory middleware system in controlled, reviewable slices.

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

## Ongoing requirements

After every slice:

- update `STATUS.md`
- update `DECISIONS.md`
- update `OPEN_QUESTIONS.md`
- adjust `CURRENT_SLICE.md` only when the next slice is explicitly chosen
