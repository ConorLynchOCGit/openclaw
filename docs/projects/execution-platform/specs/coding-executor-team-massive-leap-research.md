---
summary: "Checkpointed research and architecture review for the next major capability leap in the OpenClaw coding executor team."
title: "Coding Executor Team Massive Leap Research"
---

# Coding Executor Team Massive Leap Research

Date: 2026-05-19

Status: active research checkpoint. This document records findings gathered
before the next implementation planning pass so context compaction does not
discard the architecture review.

## Local Architecture Snapshot

The current OpenClaw coding executor path is centered on:

- `StructuredModelIntentRouter` and live router providers for front-door
  intent/routing.
- `MissionContractLedger` for commitment truth.
- model-authored `CommitmentWorkPacket` and downstream handoff packets for
  worker-ready delegation.
- `GenericOrchestrationRuntime` as the workflow-agnostic execution spine.
- `RuntimeWorkGraphScheduler` as the durable graph scheduler.
- workflow definitions/plugins for executable workflow policy.
- `RuntimeToolKernel` and trace repository for side-effect/tool truth.
- `RuntimeExecutionSpan` for active progress/readback truth.
- `RuntimeRepairClassification` and retry gate for repair/retry truth.
- `RuntimeWorkerSupervisor` as job claim/lease/adapter infrastructure.
- `DynamicAgentTeamGraphRunner` as the still-large production coding-team
  runner/plugin extraction host.
- `NonCodexToolUsingWorkerLoop`, `EditTransactionEngine`,
  `ModelAgnosticFileEditWorkerAdapter`, and controller/author/applicator
  split for non-Codex implementation.
- validation/QA runtime tools, closeout finalization tools, Work Queue
  readback/projection, boundary replay checkpoints, and generated child item
  lifecycle.

## Local Strengths Already Built

- Runtime truth is DB/runtime-job based rather than Work Queue UI state.
- Work graph execution is durable and evidence-gated.
- Mission Ledger, evidence claims, closeout finalization, and completion
  review prevent process-completion false success.
- Context supply has moved toward prompt indexes, bounded excerpts,
  context scouts, context synthesis, and freshness snapshots.
- Scheduler graph creation has moved from one large JSON decision toward
  staged model/runtime tool protocol.
- Cost-aware capability policy and provider profiles exist.
- Non-Codex implementation no longer depends only on giant patch JSON; it has
  a runtime tool worker loop, edit transactions, validation repair, evidence
  claims, and provider slot policy.
- Work Queue readback now surfaces graph progress, spans, worker phases,
  validation, repair classification, closeout, child items, and generated
  diagnostic lifecycle.

## Obvious Local Gaps And Weaknesses

1. **No first-class Language Server Protocol layer yet.**
   OpenCode treats LSP as an architectural primitive. OpenClaw mostly relies
   on repo search, bounded file reads, symbol/test inspection helpers, and
   validation commands. It does not yet have a durable LSP service for
   diagnostics, definitions, references, hover/signature help, rename,
   code actions, or workspace symbol intelligence.

2. **Dynamic runner/plugin extraction is not fully collapsed.**
   `DynamicAgentTeamGraphRunner` remains a very large production coding path.
   Generic runtime exists, but coding-team logic is still partly concentrated
   in one large runner/adapter layer.

3. **Compatibility/proof/degraded debt still exists in source.**
   Local searches show references to legacy/fallback/proof/fixture paths in:
   `product-spec-planning-validation-repair-evidence`,
   Product/Spec proof review/readback helpers, workflow evidence profile
   generic fallback entries, product/spec runtime contract compatibility
   tests, generated proof diagnostics, old queued/bridge runners, and
   static/proof readback paths.

4. **Context scout is improved but not yet equivalent to code intelligence.**
   It can search/read/list/summarize bounded repo context, but does not yet
   have LSP-backed semantic navigation, dependency graph extraction, type
   diagnostics, import graph, call graph, or code action suggestions.

5. **Non-Codex worker loop is still OpenClaw-owned rather than provider-native.**
   It emulates tool-calling and edit transactions across providers. That is
   good for control, but it still lacks some native coding-harness affordances
   such as continuous terminal sessions, fine-grained IDE state, LSP events,
   and incremental patch/edit streaming.

6. **Model/tool contracts are improved but still numerous.**
   Router, Mission Ledger, packet authoring, context scout/synthesis,
   scheduler, validation, closeout, memory, proactivity, and Work Queue all
   have model-heavy boundaries. Each must keep the same invariant: model
   decides semantics; runtime owns schema, refs, storage, lifecycle, tools,
   budgets, and evidence.

7. **Parallelism is partly present but not yet mature across all phases.**
   Supersteps, provider capacity, context-scout fanout, and graph joins exist,
   but the system still needs broader parallel child execution, parallel
   packet/context/review lanes, and separate session/background conflict
   domains.

8. **Operator emissions are better but not yet Codex-like.**
   Span/readback exists, but the owner still needs richer live “what I am
   doing and why” updates from worker-internal loops, especially during long
   provider/model calls and implementation nodes.

## External Architecture Findings So Far

### Codex

Sources opened:

- OpenAI Codex product/help docs:
  https://help.openai.com/en/articles/11096431
- OpenAI Codex developer docs index and subagents/hooks docs:
  https://developers.openai.com/codex/
  https://developers.openai.com/codex/subagents
  https://developers.openai.com/codex/hooks
- OpenAI Codex CLI GitHub repository:
  https://github.com/openai/codex

Findings to continue validating:

- Codex emphasizes an agentic coding loop with shell/tool access, file edits,
  tests, repository instructions, MCP/tools, sandbox/approval policy, and
  observable progress.
- Codex subagents/hooks are explicit extension surfaces rather than ad hoc
  prompt-only delegation.
- OpenClaw has a richer workflow/evidence/Work Queue substrate than Codex,
  but Codex likely has stronger native coding-session ergonomics: terminal
  loop, edit loop, repo instructions, and compact operator progress.

### Claude Code

Sources opened:

- Claude Code tools reference:
  https://code.claude.com/docs/en/tools-reference
- Claude Code sub-agents docs:
  https://docs.claude.com/en/docs/claude-code/sub-agents

Findings to continue validating:

- Claude Code exposes a broad tool set and explicit sub-agent configuration.
- Claude Code has mature product concepts around subagents, hooks, MCP,
  slash commands/settings/permissions, and IDE integrations.
- OpenClaw has comparable or stronger runtime evidence gates, but likely
  lacks equivalent ergonomic surfaces for developer-customized hooks, local
  slash-command workflows, and IDE-native context.

### OpenCode

Sources opened/search targets:

- OpenCode docs and GitHub issue/discussion searches around LSP, agents,
  hooks, permissions, and server/client architecture.
- GitHub search target: `sst/opencode` LSP issues, including issue 3297.

Findings to continue validating:

- OpenCode appears to treat Language Server Protocol integration as a major
  differentiator. That likely gives it precise diagnostics, definitions,
  references, hover, and symbol-level repo understanding.
- OpenClaw does not yet have a comparable code-intelligence substrate.
  Adding LSP-backed context and validation should be a top candidate for the
  next “massive leap.”

## Working Hypothesis

The next major coding-team leap should not be another narrow proof fix. It
should combine:

1. LSP/code-intelligence service.
2. native-coding-harness parity audit versus Codex, Claude Code, and OpenCode.
3. dead/fallback/proof path retirement.
4. richer worker-internal progress streams.
5. stronger parallel execution and join semantics across context,
   implementation, validation, and review.
6. developer-extensibility surfaces: hooks, custom agents/roles, MCP/tool
   registry, skills/instructions, and per-workflow policy packs.

## Research Questions To Finish

The final report should refine and answer at least these categories:

- What LSP capabilities matter most for coding agents in practice?
- How do Codex, Claude Code, and OpenCode represent tools, hooks, subagents,
  permissions, and progress?
- Which capabilities are native product features versus user-extensible MCP
  or plugin surfaces?
- Which features reduce schema choke and improve repair loops?
- How do leading harnesses manage context without overloading the model?
- How do they run tests, inspect diagnostics, and repair iteratively?
- What should OpenClaw build first to close the largest practical gap?

## Research Update

### High-Confidence External Deltas

1. **LSP/code intelligence is the largest obvious capability gap.**
   OpenCode exposes an experimental `lsp` tool with operations including
   definition, references, hover, document/workspace symbols,
   implementation, and call hierarchy. Claude Code's current tool reference
   also lists LSP for definitions, references, type errors, and warnings.
   Developer commentary around LSP + Tree-sitter repeatedly frames semantic
   code intelligence as the remedy for flat grep/read exploration.

2. **Hooks are a core harness surface, not a nice-to-have.**
   Codex hooks and Claude Code hooks both sit inside the agent lifecycle.
   They are used for prompt scanning, validation on stop, pre/post tool
   enforcement, notifications, memory/session summaries, and deterministic
   checks. OpenClaw has runtime gates and evidence profiles, but lacks a
   user-configurable hook surface for coding-team lifecycle events.

3. **Subagents are best for context isolation, read-heavy exploration,
   independent workstreams, and unbiased review.**
   Official Claude and Codex guidance both emphasize parallel subagents, but
   also warn about overhead. The recurring community lesson is that
   subagents should not be spawned just to prove delegation; they should
   protect the main context or parallelize truly independent work.

4. **Tool search / deferred tools matter at scale.**
   Claude Code exposes ToolSearch and custom/MCP tool loading patterns. This
   prevents every tool from bloating every prompt. OpenClaw has a runtime
   tool registry, but it does not yet look like a model-facing searchable
   tool catalog with capability-ranked tool discovery.

5. **Agent-facing compound tools reduce small-model failures.**
   Developer commentary around smaller coding models repeatedly reports that
   long chains of independent tool calls fail more often than compound tools
   that bundle inspect -> edit -> validate -> report. OpenClaw has runtime
   atomicity and edit transactions, but still often asks controllers to
   choose several low-level steps. The next design should add compound
   workflow tools for common safe patterns.

6. **Tree-sitter plus LSP is stronger than either alone.**
   Tree-sitter gives fast local structure and chunking before a language
   server warms up; LSP gives cross-file semantic facts and diagnostics once
   ready. OpenClaw should not replace grep/read. It should add a code
   intelligence layer where grep/read, Tree-sitter, LSP, and persistent graph
   context are complementary tools.

7. **Native coding harnesses expose richer developer/session surfaces.**
   Codex and Claude Code include terminal/IDE/cloud surfaces, background
   work, worktrees, hooks, MCP/plugins/skills, review modes, approval modes,
   and agent/subagent configuration. OpenClaw's runtime truth/evidence
   system is deeper, but its developer-facing harness surfaces are less
   mature.

### Candidate Massive-Leap Items

1. Code Intelligence Substrate: LSP + Tree-sitter + persistent code graph.
2. Coding Harness Lifecycle Hooks: pre/post model call, pre/post tool,
   post-edit, post-validation, stop, closeout, compaction, human-interrupt.
3. Compound Coding Tools: safe inspect-edit-validate-report macros.
4. Tool Search And Capability-Ranked Tool Catalog.
5. Worktree/branch isolation for parallel implementation nodes.
6. Agent/subagent role configuration as first-class project files.
7. Worker-internal streaming progress and model-call phase telemetry.

## External Comparison Matrix

### Codex

Relevant external surfaces:

- agentic terminal/file/test loop;
- repository-local instructions;
- sandbox/approval policy;
- MCP integration;
- hooks;
- subagents;
- cloud/PR-oriented execution.

OpenClaw comparison:

- OpenClaw is stronger on explicit runtime truth, Mission Ledger evidence,
  Work Queue readback, and closeout gating.
- OpenClaw is weaker on native coding-session ergonomics: continuous terminal
  state, fast patch/edit loops, repo instruction familiarity, and
  human-readable progress at every worker-internal step.

### Claude Code

Relevant external surfaces:

- broad built-in tool set: task/subagent, bash, glob/grep/read/edit/multiedit,
  write, notebook edit, web fetch/search, todo, and MCP tools;
- custom subagents with independent prompts/tools/context windows;
- hooks;
- permissions/settings;
- IDE-oriented usage.

OpenClaw comparison:

- OpenClaw has a more explicit workflow/evidence/control plane.
- OpenClaw does not yet expose an equally mature user-configurable developer
  surface for project-local hooks, commands, agent definitions, and permission
  profiles.

### OpenCode

Relevant external surfaces:

- primary agents and subagents with mode-specific tool permissions;
- Plan/Build distinction;
- custom tools, MCP, ACP, plugins, SDK/server;
- first-class LSP integration.

OpenClaw comparison:

- The major missing primitive is language-server-backed code intelligence.
  OpenCode uses LSP diagnostics to provide feedback to the LLM and ships
  built-in language server mappings for many languages. OpenClaw currently
  approximates this with search/read/list/test validation rather than
  semantic diagnostics, definitions, references, hover, symbols, rename,
  code actions, implementation lookup, or call hierarchy.

## Twenty Key Questions And Current Answers

1. **Do coding agents need LSP, or is grep/read enough?**
   LSP should be first-class. Grep/read is necessary but insufficient for
   semantic navigation, diagnostics, references, and safe refactors.

2. **Should context scout own code intelligence?**
   No. Context scout should call a shared Code Intelligence service. LSP,
   Tree-sitter, repo search, import graph, and test discovery should be
   reusable by scout, scheduler, workers, validation, and review.

3. **Should every worker receive the full original prompt?**
   Workers should have access to bounded original-prompt excerpts and prompt
   index refs. They should not depend only on summaries.

4. **Are commitment packets enough by themselves?**
   They are necessary but not sufficient. Packets need prompt refs, context
   questions, target areas, stop-if-missing rules, validation expectations,
   and context-request tools.

5. **When do subagents help?**
   They help when they isolate context, perform independent exploration,
   run parallel workstreams, or provide independent review. They waste tokens
   when spawned vaguely or sequentially.

6. **How should subagent reuse be handled?**
   Track file overlap, staleness, directory scope, and prior outputs. Reuse or
   resume existing agents/sessions when structural overlap is high.

7. **How should OpenClaw prevent Codex monopoly?**
   Capability policy must price context-distribution value, role
   specialization, parallelism, and evidence needs, not only expected quality.

8. **Where does schema choke still come from?**
   It comes from asking models to author runtime-owned envelopes. Keep
   semantic choices model-authored and compile schema, refs, evidence classes,
   budgets, and executors in runtime.

9. **Should Kimi/non-Codex workers use provider-native tools?**
   Prefer native structured tool calling where provider support is strong;
   preserve the OpenClaw tool kernel as canonical trace/authority even when
   provider-native calls are used.

10. **What should a robust non-Codex coding harness include?**
    Inspect, prompt-excerpt request, code-intelligence tools, edit transaction,
    validation, failure classification, repair, evidence claim, and streaming
    phase telemetry.

11. **What is missing for large refactors?**
    LSP references/rename/code actions, Tree-sitter structure, dependency and
    call graph, worktree isolation, integration nodes, and conflict-aware merge
    review.

12. **How should validation work?**
    Validation should combine targeted tests, static checks, LSP diagnostics,
    type/lint output, and model-authored failure-to-commitment mapping.

13. **How should hooks fit OpenClaw?**
    Hooks should be typed lifecycle tools: pre-model, post-model, pre-tool,
    post-tool, post-edit, post-validation, stop, closeout, compaction, and
    human-interrupt.

14. **How should progress be emitted?**
    Every long model/tool/worker step should emit phase, objective, active
    refs, selected tool, blocker, retry state, validation state, and next
    decision. Node-level progress is not enough.

15. **How should memory enter execution?**
    Memory should feed execution through explicit context-pack refs with
    retrieval intent, source refs, rank rationale, freshness/staleness, and
    insertion sites. No hidden prompt stuffing.

16. **What should be parallelized first?**
    Packet authoring, context scout per packet, independent validation/review,
    and independent implementation groups in isolated worktrees.

17. **What must not be parallelized blindly?**
    Tightly coupled file edits, shared test/dev server work without isolated
    ports, and integration/closeout gates.

18. **How should OpenClaw handle worktrees and dev servers?**
    Each parallel implementation group should get an isolated worktree,
    dependency/cache strategy, port namespace, and integration handoff.

19. **How should extensibility work?**
    Project-local role definitions, hooks, tools, MCP servers, skills, and
    workflow policy packs should compile into the capability registry and
    workflow definitions.

20. **What should be pruned first?**
    Production access to generic queued runners, fallback-only workflow
    transports, degraded closeout success surfaces, proof/fixture readback in
    production modules, compatibility aliases, and inferred evidence ref
    closure.

## Recommended Massive-Leap Work Blocks

1. **Code Intelligence Substrate**
   Build an LSP + Tree-sitter + persistent code graph service. Expose tools for
   diagnostics, definitions, references, hover, workspace/document symbols,
   call hierarchy, implementation lookup, rename planning, code actions,
   dependency graph, and impact analysis.

2. **Coding Harness Lifecycle Hooks**
   Add project-configurable typed hooks for pre/post model calls, pre/post
   tools, post-edit, post-validation, stop, closeout, compaction, and
   human-interrupt. Hooks must emit runtime tool traces and cannot bypass
   Mission Ledger/evidence/closeout gates.

3. **Compound Coding Tools**
   Add higher-level tools that bundle inspect -> edit plan -> edit transaction
   -> validate -> failure classify -> evidence claim. These reduce small-model
   tool-planning burden without hiding traceability.

4. **Tool Search And Capability-Ranked Catalog**
   Make tool discovery model-facing and bounded. The model should request tools
   by capability/need; runtime should return ranked tool refs with budgets,
   authority, input contracts, and examples.

5. **Parallel Worktree Supersteps**
   Run independent implementation/review/validation groups concurrently in
   isolated worktrees with port isolation, merge/integration nodes, and
   conflict diagnostics.

6. **Agent/Role Configuration Surface**
   Move coding-role definitions into project/runtime config with model,
   capability, tool, budget, prompt, and permission profiles. Compile those
   definitions into workflow/capability registry entries.

7. **Worker-Internal Streaming Progress**
   Converge model-call and tool-loop emissions so the owner can see active
   objective, selected tool, file target, model/provider, validation command,
   blocker, retry reason, and next action during long calls.

8. **Fallback/Compatibility Retirement**
   Hard-disable or remove production access to old generic queued runners,
   fallback-only transports, compatibility aliases, degraded closeout success
   paths, static proof diagnostics, and legacy inferred evidence closure.

9. **Role/Model Benchmark Registry**
   Promote model choices only through bounded benchmark evidence:
   valid-output rate, latency, edit success, repair success, cost, context
   scout quality, validation quality, and closeout quality.

10. **Memory-To-Execution Context Packs**
    Make model memory a first-class context supply source with explicit
    retrieval, ranking, staleness, supersession/conflict checks, and packet
    insertion refs.
11. Compatibility/fallback/proof-path retirement audit.
12. Context-pack supply chain upgraded with code graph/LSP facts.
13. Independent reviewer/test/security agents with read-only and write
    scopes enforced by policy.
