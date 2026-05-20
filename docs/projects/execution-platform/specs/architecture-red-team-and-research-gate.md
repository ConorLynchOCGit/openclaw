---
summary: "Reusable architecture red-team and research gate for OpenClaw and Codex proof readiness."
title: "Architecture Red-Team And Research Gate"
---

# Architecture Red-Team And Research Gate

Date: 2026-05-17

Status: source-of-truth architecture and workflow specification. This gate is
the general version of the pre-Product/Spec assumption audit.

## Purpose

The Architecture Red-Team And Research Gate prevents OpenClaw and Codex from
burning implementation/proof cycles on bad assumptions. It turns hidden
model/runtime/tool assumptions into falsifiable questions, compares them to
source code and narrow external research, and produces architecture-level
actions before proof runs.

This is not a replacement for tests. It is a proof-readiness gate.

## Trigger Levels

### Level 0: Inline Sanity Check

Use for ordinary low-risk coding. No artifact required.

### Level 1: Lightweight Assumption Scan

Use before medium slices, especially when changing scheduler, router, Work
Queue, memory, closeout, validation, worker adapters, model roles, or runtime
tool contracts.

### Level 2: Formal Red-Team Gate

Use before long-form live UX/runtime proofs, new production workflow proofs,
meaningful OpenClaw dogfood runs, or after two similar failures.

Outputs:

- Assumption Audit Matrix.
- Falsifiable Question Set.
- Narrow Research Brief.
- Code Gap Map.
- Pre-Proof Blocker List.
- Post-Proof Hardening List.
- Proof Readiness Decision.
- Work Queue update.
- Work Episode Outcome Pack.

### Level 3: Architecture Reset Review

Use after systemic repeated failure, before new team families, or before large
middleware/runtime/toolification/memory/proactivity refactors.

## Boundary Map

Map the relevant path into boundaries such as:

- owner prompt -> router/front door
- router/front door -> Mission Ledger
- Mission Ledger -> CommitmentWorkPackets
- CommitmentWorkPackets -> context supply chain
- context supply chain -> scheduler
- scheduler -> capability policy
- capability policy -> graph nodes
- graph nodes -> worker/tool adapters
- worker/tool adapters -> validation and QA
- validation and QA -> evidence claims
- evidence claims -> closeout/finalization
- closeout/finalization -> Work Queue readback
- Work Queue readback -> owner UX
- replay/direct harness -> live UX/runtime parity

## Assumption Classes

For each boundary, inspect:

- context sufficiency.
- model/runtime ownership.
- deterministic-vs-model judgment boundary.
- evidence-to-commitment mapping.
- false success risk.
- false block risk.
- execution parity.
- worker fitness.
- delegation value.
- operator visibility.
- repair/resume capability.
- compatibility leakage.

## Falsifiable Questions

Every assumption must become a question that can be answered from code,
runtime evidence, model review, or a bounded proof.

Example:

- Can the scheduler accept a decomposed graph from the same Mission Ledger
  without implementation running?
- Can the non-Codex worker request missing context before proposing a patch?
- Can Work Queue show active node, blocker, tool id, and next decision while a
  job is still running?

## Risk Classification

- P0: false success, false block, silent non-execution, unsafe authority, or
  repeated expensive proof failure.
- P1: context starvation, weak delegation, or poor work quality.
- P2: cost/model monopoly, bad scaling, or excessive retries.
- P3: degraded UX/readback/operator trust.

P0 risks block major proofs unless explicitly accepted.

## Narrow Research Protocol

Research must be tied to a concrete assumption. Good searches are narrow:

- "LLM tool call schema repair field-specific errors"
- "coding subagent context handoff original prompt"
- "durable graph execution pending writes checkpoint node failure"
- "agent trace child tool call progress production debugging"
- "LLM file edit agent validation repair loop patch proposal schema"

## OpenClaw Workflow Target

OpenClaw should implement this as:

`agent_team.architecture_red_team`

Implementation status: completed on 2026-05-17 as a production-ready,
scheduler-backed workflow definition/plugin with Runtime Tool-Call Kernel
trace evidence, workflow evidence profile coverage, Work Queue readback, and
accepted DB closeout evidence.

Required node classes:

- architecture mapper.
- assumption extractor.
- falsifiable-question author.
- narrow web researcher.
- code auditor.
- model-contract critic.
- runtime evidence critic.
- Work Queue planner.
- final recommendation reviewer.

The workflow may update Work Queue planning items and docs when explicitly
requested. It must not execute the target proof or implementation unless the
owner asks for that in a separate prompt.

## Cadence

- before every major live UX proof: Level 2.
- before every new workflow/team family: Level 3.
- before every model/runtime/tool contract change: Level 1.
- after two similar failures: Level 2.
- after three similar failures or architecture confusion: Level 3.
- ordinary coding: Level 0 only.

## Guardrails

- Do not turn the gate into deterministic semantic judgment.
- Do not add prompt-specific heuristics or semantic forests.
- Do not treat research as proof.
- Do not treat the gate as implementation success.
- Do not store raw prompts, raw transcripts, raw provider output, raw logs,
  secrets, or hidden reasoning.
- Do not mutate Work Queue lifecycle.
- Do not run the target proof from inside the red-team gate unless explicitly
  authorized by the owner.
