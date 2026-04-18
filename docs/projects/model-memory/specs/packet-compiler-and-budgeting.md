---
summary: "Shared packet-compiler architecture, budgeting rails, and audit contract for memory and context packets."
title: "Packet Compiler And Budgeting"
---

# Packet Compiler And Budgeting

## Objective

Define one reusable compiler system for all bounded memory and context packets.

The `MEMORY.md` packet experiments established that packet quality depends more
on:

- source-basket shaping
- packet-purpose-aware synthesis
- section caps
- explicit dropped-item accounting

than on late trimming alone.

That lesson now applies to every packet type the context engine assembles.

## Core rule

Packet generation is one shared system.

Different packet families may use different policies, but they should not each
invent their own:

- ranking logic
- budget logic
- provenance format
- dropped-item reporting
- audit behavior

## Scope

This compiler architecture covers at minimum:

- workspace bootstrap packets:
  - `MEMORY.md`
  - `USER.md`
  - generated `AGENTS.md` sections
- runtime context artifacts:
  - `user_memory_pack`
  - `project_memory_pack`
  - `procedure_memory_pack`
  - `session_summary_pack`
  - `retrieval_pack`
- later capsule-backed or graph-backed packet surfaces that are injected into
  context assembly as bounded packet artifacts

## Packet families

### Bootstrap packets

Purpose:

- shape behavior before task reasoning starts
- remain stable enough for repeated inclusion
- justify repeated token cost

Examples:

- `MEMORY.md`
- `USER.md`
- generated `AGENTS.md` critical-rule sections

### Dynamic context packets

Purpose:

- inject semi-stable scope-specific memory during run assembly
- support project, procedure, and user memory without making bootstrap files
  carry all detail

Examples:

- `user_memory_pack`
- `project_memory_pack`
- `procedure_memory_pack`
- `session_summary_pack`

### Retrieval packets

Purpose:

- package one bounded query-specific retrieval result for turn-time use
- remain subordinate to object-native retrieval truth

Example:

- `retrieval_pack`

## Shared compiler rails

Every packet compile must declare:

- `packetClass`
- `packetId`
- `purpose`
- `scopeKey`
- `targetAudience`
- `budgetPolicy`
- `selectionPolicy`
- `renderPolicy`
- `compilerMode`
- `compilerVersion`

### `packetClass`

Closed first-pass classes:

- `bootstrap_file`
- `dynamic_memory_pack`
- `retrieval_pack`
- `session_summary_pack`
- `projection_packet`

### `compilerMode`

Allowed first-pass modes:

- `deterministic_render`
- `model_assisted_render`

The render mode can vary by packet, but the audit contract must remain the
same.

### `budgetPolicy`

Each packet must declare:

- `targetTokens`
- `softCeilingTokens`
- `hardCeilingTokens`
- `sectionCaps`
- `maxSourceItems`

Late context trimming may still happen, but it is a fallback. The packet
compiler is expected to keep the packet bounded before context assembly sees
it.

### `selectionPolicy`

Each packet must declare:

- eligible lifecycle states
- eligible kinds
- eligible classes when still needed
- scope rules
- ranking features
- recency behavior
- tie-break behavior
- overflow behavior

### `renderPolicy`

Each packet must declare:

- required output shape
- section ordering
- compression rules
- synthesis rules
- whether overlap should merge or stay separate
- whether uncertainty can appear in the packet text

## Compile pipeline

### 1. Candidate resolution

Resolve an eligible source basket from canonical memory objects and any allowed
runtime read models.

The compiler must record:

- source ids considered
- candidate count
- reasons items were filtered out before ranking

### 2. Ranked basket shaping

The compiler should shape a basket before rendering.

This is where packet quality is won or lost.

Required controls:

- ranking by packet purpose
- kind balance when relevant
- scope-aware priority
- section-aware quota reservation
- overflow rules

The `MEMORY.md` experiment proved that packet shaping must happen before
rendering. A renderer should not receive a random overfull pile and be expected
to fix it late.

### 3. Packet rendering

The renderer converts the shaped basket into the final packet text or structured
artifact.

First-pass render rules:

- no invention
- no hidden source promotion
- no silent conflict erasure
- merge overlap only when semantics genuinely align
- preserve operationally critical procedures and rules

### 4. Budget verification

After rendering, the compiler must record:

- estimated output tokens
- whether section caps were respected
- whether hard ceilings were exceeded

If the hard ceiling is exceeded, the compile is not successful.

### 5. Provenance and dropped-item accounting

Every packet build must record:

- included source ids by section
- dropped source ids
- drop reason per source id
- packet hash
- compiler version
- build timestamp

`droppedMemoryIds = []` is only valid when:

- no candidates were filtered after final basket shaping, and
- the packet shrinkage came from synthesis, not omission

That distinction must be auditable.

## Section caps

Section caps are a first-class packet control, not an ad hoc prompt trick.

Examples:

- `MEMORY.md`
  - bounded standing-context bullets
  - bounded current-priority bullets
  - bounded active-procedure bullets
- `retrieval_pack`
  - bounded result count
  - bounded per-result summary size
  - bounded provenance summary size

Section caps should live in packet policy, not be rediscovered case by case.

## Ranking and shaping rules

Shared ranking inputs may include:

- explicit packet purpose
- scope affinity
- recency
- confidence
- durability
- operational criticality
- repeated retrieval/use frequency
- kind quotas
- section quotas

### Kind balance

Kind balance is now a packet-quality concern, not only an ingestion concern.

If the live corpus is skewed or one kind is absent, the compiler must not
pretend balance exists. It must record the shortage explicitly.

For example:

- if `rule` inventory is zero, the packet should record that no active rule
  candidates were available rather than silently behaving as if preferences are
  a substitute

## Compression and synthesis

Allowed synthesis:

- merge overlapping facts into one concise bullet
- merge equivalent preferences into one standing rule
- compress near-duplicate procedures into one bounded operational procedure

Disallowed synthesis:

- inventing a missing rule
- converting a preference into a rule without source support
- erasing provenance by collapsing materially distinct objects

## Retrieval-pack policy

`retrieval_pack` must use the same shared rails.

It is not exempt just because it is turn-time and ephemeral.

Required retrieval-pack policy fields:

- query envelope id or request id
- result-count cap
- per-result text budget
- total packet ceiling
- provenance format
- allowed kinds/classes
- packing reason codes

The retrieval system decides which objects are relevant.

The packet compiler decides how those objects are packed into a bounded turn
artifact.

## Relation to the context engine

The context engine should consume packet outputs, not improvise its own packet
logic.

That means:

- bootstrap packets are compiled before bootstrap injection
- dynamic packs are compiled before assemble-time inclusion
- retrieval results are packed before assemble-time insertion

The context engine may order or trim packet artifacts, but it should not become
a second packet compiler.

## Relation to late trimming

Late context trimming remains a runtime safeguard.

It is not the main quality strategy.

The desired order is:

1. build a bounded packet intentionally
2. assemble bounded packets into context
3. trim only if aggregate context still exceeds the model window

## Audit artifacts

Every compile should be able to emit an audit record containing:

- `packetClass`
- `packetId`
- `scopeKey`
- `compilerMode`
- `compilerVersion`
- `budgetPolicyVersion`
- `sourceBasketCount`
- `includedSourceIds`
- `droppedSourceIds`
- `dropReasons`
- `estimatedOutputTokens`
- `sectionSummary`
- `qualityNotes`

## Quality review path

The packet compiler must support a review lane where:

- the source basket is preserved
- the prompts or deterministic policy are preserved
- the rendered packet is preserved
- a stronger model or human reviewer can assess quality

This is how the `MEMORY.md` experiment should generalize to other packet types.

## Current evidence

Current evidence from the `MEMORY.md` lane:

- basket shaping matters
- section caps matter
- output-shape constraints matter
- kind quota without strong caps is not enough
- compression can reduce token count without dropping ids, but that must remain
  auditable

That evidence makes `memory-md` the first proof lane for the generalized packet
compiler, not a special one-off case.

## Non-goals

This spec does not:

- authorize hidden semantic rewriting
- make packet text the semantic source of truth
- let packet-specific prompts drift without shared audit rails
- replace retrieval or projection architecture with packet heuristics
