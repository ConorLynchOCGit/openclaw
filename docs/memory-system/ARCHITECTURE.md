# Memory Middleware Architecture

## Objective

Build a memory and context system for OpenClaw that:

1. survives long sessions without context collapse
2. preserves durable operator knowledge across projects and agents
3. learns reusable procedures from successful work
4. supports proactive follow-through without uncontrolled autonomy
5. safely incorporates selected third-party skills through vetting

## Core design split

## 1. Context plane

This is not long-term memory. It is session survival.

### Responsibilities

- persist large tool outputs outside the prompt
- replace them with stable previews
- reduce context pressure before summarizing
- maintain structured session memory during work
- escalate to compaction only when necessary

### Main components

- tool-result persistence
- preview substitution
- microcompaction
- session memory updater
- full compaction fallback
- compaction event logging

### Principle

Cheapest context relief first:

1. persist oversized outputs
2. microcompact stale outputs
3. rely on maintained session memory
4. full compaction only as fallback

---

## 2. Knowledge plane

This is durable, typed memory.

### Memory types

- `user`
- `feedback`
- `project`
- `reference`
- `procedure`
- `policy`

### Principle

Do not store everything as one undifferentiated memory blob.

Different memory types serve different jobs:

- user memory shapes interaction
- feedback memory captures validated corrections
- project memory tracks active initiatives and durable facts
- reference memory points to systems, docs, paths, repos
- procedure memory captures reusable workflows
- policy memory constrains behavior and approvals

---

## 3. Promotion pipeline

The system should not jump straight from “interesting thing happened” to “install a skill.”

Promotion path:

1. event
2. candidate memory
3. approved memory
4. procedure draft
5. validated procedure
6. skill candidate
7. vetted skill
8. installed skill

### Principle

Reusable behavior should be earned through evidence, not improvised once and frozen permanently.

---

## 4. Security and trust model

### Backend trust

Supabase/Postgres is the canonical structured backend.

### File mirrors

Workspace files can mirror selected memory/procedure/policy artifacts for inspectability, but the database remains canonical for structured state.

### Access posture

- raw events/tool results/jobs should stay backend-only
- reviewed durable memory can be selectively exposed
- policy memory is highly restricted
- retrieval must respect permissions

---

## 5. Retrieval model

Retrieval should be hybrid and typed, not a single generic semantic search.

### Retrieval layers

1. metadata and exact matching
2. FTS/trigram keyword matching
3. vector similarity
4. provenance/graph reranking
5. policy-aware filtering

### Principle

Exact identifiers, file names, and policy keys need different retrieval behavior than fuzzy conceptual memory.

---

## 6. OpenClaw integration model

### Native plugin

Primary orchestrator:

- `openclaw-memory-middleware`

### Internal skills

Companion skills teach the model when and how to use the plugin tools:

- memory-middleware
- procedure-distiller
- policy-check
- session-memory-updater
- skill-procurement

### Why this split

- plugins provide capabilities
- skills teach usage patterns
- repo docs preserve durable architectural intent

---

## 7. Third-party skills posture

Third-party skills are allowed as accelerators, not as the canonical memory substrate.

### Intended external skills

- Skill Vetter
- self-improving-agent
- Proactive Agent (later, gated)

### Rule

No third-party skill should bypass:

- policy checks
- vetting
- explicit install review

---

## 8. Canonical backend model

The structured backend is expected to include:

- sessions
- events
- tool results
- compaction events
- memory objects
- memory links
- memory sources
- reviews
- policies
- procedures
- procedure runs
- skill candidates
- background jobs
- agent state
- later embeddings and retrieval RPCs

---

## 9. Current implementation philosophy

This is a large system. It must be built in bounded slices.

### Do not:

- build everything in one task
- rely on chat context as persistent memory
- install broad autonomy before policy gates
- let third-party plugins define core architecture

### Do:

- document architecture in repo
- reconcile with existing repo structure first
- update status/decisions/open questions after each slice
- treat each slice as a reviewable milestone
