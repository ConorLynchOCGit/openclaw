---
summary: "Production architecture and work queue specification for the next major OpenClaw coding executor team capability leap."
title: "Coding Executor Team Capability Leap"
---

# Coding Executor Team Capability Leap

Date: 2026-05-19

Status: accepted planning specification. This spec expands
[Coding Executor Team Massive Leap Research](/projects/execution-platform/specs/coding-executor-team-massive-leap-research)
into implementable work queue slices.

## Goal

OpenClaw coding execution should behave like a production coding harness with
durable runtime truth, semantic code intelligence, explicit workflow evidence,
tool-visible worker loops, model/cost policy, and operator-grade progress.

It must not rely on:

- brittle model-authored runtime envelopes;
- generic broad implementation nodes as the default solution;
- hidden provider calls with weak readback;
- patch-only JSON as the implementation contract;
- proof-shaped delegation;
- degraded/system closeout as success;
- compatibility/fallback execution paths that can accidentally route live
  production jobs.

## External Baseline

The target is not to clone another product. The target is to close the
practical coding-harness gaps exposed by Codex, Claude Code, and OpenCode.

- Codex emphasizes an agentic coding loop with repo instructions, terminal and
  file tooling, tests, sandbox/approval policy, MCP, hooks, and subagents.
- Claude Code exposes a broad tool and subagent surface including task
  delegation, bash, file search/read/edit/multiedit/write tools, todo,
  web tools, MCP, hooks, settings, permissions, and custom subagents.
- OpenCode exposes agent modes/subagents and treats LSP as a coding-agent
  primitive. Its LSP docs state that diagnostics are used to provide feedback
  to the LLM and that language servers are mapped across many languages.

OpenClaw should preserve its stronger runtime truth/evidence architecture
while adding the missing coding-harness primitives.

## Governing Boundary

The invariant remains:

> Model decides semantic meaning, usefulness, sufficiency, and tradeoffs.
> Runtime owns schema, refs, bounds, persistence, authority, lifecycle, tool
> execution, retries, evidence, and closeout.

Every feature below must preserve this boundary.

## Pre-Product/Spec Work Queue Slices

These items should execute before the Product/Spec Planning production proof.

### 1. Code Intelligence Substrate

Work item:
`openclaw-convergence.coding-leap-01-code-intelligence-substrate`

Implementation status: completed 2026-05-19 as a first-class runtime
substrate. The initial production path is TypeScript/JavaScript structural
analysis with explicit `structural` semantic mode. LSP/TypeScript semantic
service attachment remains a future extension point and must not be reported
as available until configured and proven.

Closeout evidence:

- runtime module: `extensions/execution-platform/src/code-intelligence/`
- model usability harness:
  `scripts/execution-platform-run-code-intelligence-model-usability-proof.mjs`
- model proof artifact:
  `.artifacts/execution-platform/code-intelligence-model-usability-mpctudkn.json`
  hash
  `3ffc680535b33b9fe68ea7125b4b1648ef789679b941136df4c345e1eb4459c9`
- focused tests:
  `pnpm test:file extensions/execution-platform/src/code-intelligence/code-intelligence-service.test.ts extensions/execution-platform/src/code-intelligence/code-intelligence-runtime-tools.test.ts`

Problem:

OpenClaw still relies too heavily on repo search/read and model-produced
context. It lacks a first-class semantic code intelligence layer comparable to
OpenCode's LSP-backed diagnostics/navigation.

Production target:

Create a shared `CodeIntelligenceService` that combines:

- Language Server Protocol clients;
- Tree-sitter or equivalent fast structural parsing;
- lexical repo search;
- persistent code graph cache;
- test ownership discovery;
- bounded runtime artifacts and tool traces.

Runtime tools:

- `code.search_symbols`
- `code.get_definition`
- `code.get_references`
- `code.get_hover`
- `code.get_diagnostics`
- `code.get_document_symbols`
- `code.get_workspace_symbols`
- `code.get_call_hierarchy`
- `code.get_implementation`
- `code.plan_rename`
- `code.get_code_actions`
- `code.find_related_tests`
- `code.resolve_import_graph`
- `code.find_impact_radius`
- `code.summarize_file_structure`

Implementation details:

- Add a code-intelligence module under the Execution Platform extension.
- Define bounded contracts for each tool result. Raw LSP payloads are not
  stored in Work Queue metadata.
- Add language-server discovery/config contracts with automatic detection
  disabled unless configuration permits it.
- TypeScript/JavaScript should be the first production path because it covers
  the current OpenClaw repo.
- Tree-sitter/AST fallback may provide file structure before the LSP server is
  warm, but must be labeled as structural, not semantic.
- Code intelligence refs must include repo/worktree identity, file hash or
  revision, timestamp, tool id, and staleness policy.
- Tool calls must run through Runtime Tool Kernel and RuntimeExecutionSpan.

Consumers:

- context scout;
- context synthesis;
- scheduler graph planning;
- implementation workers;
- validation/QA;
- reviewer;
- closeout/completion review.

Success gates:

- A context scout can identify relevant files, symbols, tests, and diagnostics
  from verified refs.
- A worker can request semantic context without restarting the whole workflow.
- LSP startup/failure is visible as bounded runtime evidence and does not
  masquerade as model failure.
- Work Queue readback shows code-intelligence tool refs and current semantic
  blocker.
- Tests cover successful lookup, missing LSP, stale file refs, bounded storage,
  and raw-storage false flags.

### 2. Context Scout Over Code Intelligence

Work item:
`openclaw-convergence.coding-leap-02-context-scout-code-intelligence`

Problem:

Context scout has improved, but it is still too close to "model reads/searches
files and returns JSON." It needs to become a structured tool loop over the
code intelligence substrate.

Production target:

Context scout should run one scout per independent Commitment Work Packet,
parallelized where conflict domains allow. Each scout should use prompt
excerpts, packet details, repo search, code-intelligence tools, bounded reads,
and related-test discovery.

Tool sequence:

1. `context.plan_context_request`
2. `context.request_prompt_excerpt`
3. `code.search_symbols` / `repo.search`
4. `code.get_definition`
5. `code.get_references`
6. `code.get_diagnostics`
7. `repo.read_bounded_file`
8. `code.find_related_tests`
9. `context.write_context_packet`
10. `context.review_context_packet_sufficiency`

Context packet contract:

- commitment id and packet id;
- prompt excerpt refs;
- relevant file refs;
- relevant symbol refs;
- diagnostic refs;
- related-test refs;
- implementation risks;
- likely edit surfaces;
- missing context questions;
- stop-if-missing rules;
- downstream worker instructions;
- evidence claims;
- limitations.

Acceptance policy:

- Runtime validates refs, bounds, staleness, and storage flags.
- Model judges whether the handoff is useful.
- Runtime-supplied verified refs alone cannot be clean success. That state is
  `accepted_with_limitations` or `needs_review_nonblocking`.
- Blocking missing context must route to a context repair/re-scout boundary,
  not to implementation.

Success gates:

- For a multi-commitment Product/Spec-class prompt, scouts fan out in parallel
  and produce one accepted or accepted-with-limitations packet per commitment.
- A weak packet does not poison the whole graph silently; the blocking reason
  is visible and replayable.
- Context scout output is qualitatively usable by a human engineer without
  guessing the repo area.

Implementation status as of 2026-05-19:

- The production context scout node executor now invokes code intelligence
  through the Runtime Tool Kernel before model handoff generation:
  `code.search_symbols`, `code.get_document_symbols`, `code.get_diagnostics`,
  `code.find_related_tests`, and `code.find_impact_radius`.
- `ContextHandoffPacket` and `ContextScoutToolLoopRun` now carry bounded
  code-intelligence result refs, runtime tool invocation refs, symbol refs,
  diagnostic refs, related-test refs, impact refs, semantic modes, and
  semantic limitations.
- Context scout repo-analysis findings include code-intelligence,
  diagnostic-surface, and impact-radius findings with raw-storage flags false.
- Parallel context scout replay results preserve code-intelligence refs per
  commitment so synthesis and scheduler handoff can inspect them without
  rerunning the scout.
- Structural-mode results remain explicit limitations; the LSP semantic backend
  remains the next queue item and is not represented as already complete.

### 2A. Code Intelligence Semantic Backend And LSP Parity

Work item:
`openclaw-convergence.coding-leap-02b-code-intelligence-lsp-semantic-backend`

Position:

This item should run after `Context Scout Over Code Intelligence` and before
`Context Synthesis Barrier And Scheduler Handoff`. Context scout is the first
real production consumer of the current structural code-intelligence substrate.
If that pass proves structural mode is insufficient, the failure evidence
should feed directly into this item. If the scout pass is strong, this item
still remains a pre-Product/Spec hardening item because downstream synthesis,
implementation, validation, refactor, and review quality will depend on true
semantic diagnostics/navigation.

Problem:

The current Code Intelligence Substrate is model-usable and Runtime Tool
Kernel wired, but it is explicit TypeScript/JavaScript structural mode. It can
find symbols, definitions, references, imports, related tests, and structural
diagnostics, but it cannot yet claim full semantic parity with coding
harnesses that rely on LSP-backed language intelligence.

The remaining gap is not a cosmetic label. Without semantic backend support,
OpenClaw can still miss:

- type-aware definitions and references;
- project-aware diagnostics;
- hover/type information;
- implementation/interface relationships;
- rename safety;
- code actions and quick fixes;
- workspace symbol ranking from a language server;
- stale diagnostic invalidation after edits;
- semantic readiness state for operator readback.

Production target:

Promote Code Intelligence from structural-only TS/JS support to a
semantic-backed service with LSP parity for the current OpenClaw repo, while
preserving structural mode as an explicitly labeled degraded mode and never
misrepresenting fallback output as semantic success.

The target is a canonical `CodeIntelligenceSemanticBackend` layer that can
host language-service adapters behind the existing Runtime Tool Kernel
`code.*` surface.

Architecture:

1. Backend registry
   - Add a `CodeIntelligenceBackendRegistry`.
   - Register available backends by language/workspace:
     - `typescript_language_service` for TS/JS;
     - `lsp_client` for future language servers;
     - `structural_parser` as explicit fallback/degraded mode.
   - Each backend declares:
     - backend id;
     - supported extensions/languages;
     - semantic mode;
     - startup requirements;
     - tool coverage;
     - cache keys;
     - health state;
     - warmup state;
     - stale-ref policy;
     - known limitations.

2. TypeScript/JavaScript semantic backend
   - Use TypeScript compiler/language-service APIs available in the repo
     runtime to implement TS/JS semantics first.
   - Build a bounded project snapshot from repo files, tsconfig where present,
     and file hashes.
   - Implement:
     - definition;
     - references;
     - quick info/hover;
     - semantic/syntactic diagnostics;
     - document symbols where available;
     - workspace symbols or indexed symbol search;
     - implementation candidates;
     - rename location planning;
     - code action discovery where supported.
   - Record when a result is compiler/language-service-backed vs structural.

3. LSP lifecycle manager
   - Define the LSP lifecycle contract even if the first production backend
     uses TypeScript language-service APIs directly.
   - Add explicit lifecycle states:
     - `not_configured`;
     - `configured`;
     - `warming`;
     - `ready`;
     - `degraded_structural`;
     - `failed`;
     - `stale`.
   - Add bounded health evidence:
     - server/backend ref;
     - workspace root ref;
     - language id;
     - startup latency;
     - last successful request;
     - last failure class;
     - stale reason;
     - restart count;
     - raw-storage false flags.
   - Automatic external language-server process spawning must be explicitly
     configured. Absence of a configured LSP must be visible as
     `not_configured`, not silently treated as success.

4. Unified result envelope
   - Keep the existing `code.*` tool ids. Do not create parallel semantic tool
     names that force model callers to choose between duplicate APIs.
   - Add result fields:
     - `semanticMode`: `lsp_semantic`, `typescript_semantic`, or `structural`;
     - `backendId`;
     - `backendHealthRef`;
     - `workspaceSnapshotRef`;
     - `semanticConfidence`;
     - `fallbackUsed`;
     - `fallbackReasonCodes`;
     - `staleRefBlockers`;
     - `diagnosticVersionRef`;
     - `projectConfigRefs`;
     - `limitations`.
   - Runtime validates schema, refs, bounds, and raw-storage flags.
   - Models judge usefulness and sufficiency.

5. Cache and invalidation
   - Persist bounded code-intelligence cache metadata keyed by:
     - repo/worktree identity;
     - tsconfig/project config hash;
     - file path;
     - file hash;
     - backend id;
     - tool id;
     - semantic mode;
     - request hash.
   - Do not store raw language-server payloads or raw file contents in Work
     Queue metadata.
   - Invalidate semantic results when:
     - target file hash changes;
     - project config hash changes;
     - workspace fingerprint changes;
     - backend health transitions to stale/failed;
     - diagnostic version changes after edits.

6. Runtime tools and trace integration
   - Existing `code.*` runtime tools continue to run through Runtime Tool
     Kernel and RuntimeExecutionSpan.
   - Add a `code.backend_status` or equivalent internal/runtime-visible tool
     only if the existing `code.*` tools cannot expose backend health cleanly.
     If added, it must be a read-only Runtime Tool Kernel tool with bounded
     storage.
   - Every semantic-backed request emits:
     - backend selected;
     - fallback state;
     - latency;
     - result counts;
     - stale blockers;
     - diagnostic refs;
     - Work Queue readback fields.

7. Work Queue readback
   - Extend `activeGraphProgress.codeIntelligence` to show:
     - backend id;
     - backend state;
     - semantic mode;
     - fallback used;
     - LSP/semantic warmup state;
     - latest semantic blocker;
     - diagnostic version;
     - stale blockers;
     - semantic result refs;
     - structural fallback refs;
     - current tool request;
     - ELI5 summary.
   - Owner readback must make it obvious whether a context scout is blocked by
     missing semantic backend readiness, using structural fallback, or using
     real semantic output.

8. Consumers
   - Context scout should prefer semantic-backed results when available but
     should be allowed to proceed with structural results only when the model
     explicitly accepts the limitation.
   - Context synthesis should include semantic coverage and fallback
     limitations in worker-fit decisions.
   - Implementation workers should receive semantic refs for definitions,
     references, diagnostics, related tests, impact radius, and rename plans.
   - Validation/QA should use semantic diagnostics after edits when available.
   - Reviewer and closeout should surface whether semantic coverage was
     available, degraded, or missing.

9. Model usability proof
   - Run a model-facing proof where the model receives the actual `code.*`
     tool catalog and asks for semantic-backed evidence.
   - The proof must show the model can:
     - distinguish semantic vs structural mode from bounded results;
     - choose semantic tools for a concrete coding objective;
     - identify when structural fallback is insufficient;
     - produce a useful context/implementation handoff from semantic refs.

Success gates:

- TS/JS semantic backend returns `typescript_semantic` for at least
  definition, references, hover/quick info, diagnostics, related tests, import
  graph, and impact radius where TypeScript APIs support it.
- Structural fallback remains available but is explicitly labeled and cannot
  satisfy a semantic-required gate without model-authored limitation
  acceptance.
- Backend health, warmup, stale, and failure states are visible in Runtime
  Tool Kernel traces, RuntimeExecutionSpan, and Work Queue readback.
- Context scout can use semantic refs in a replay/lane proof and produce a
  better bounded handoff than structural-only mode.
- Validation/QA can request semantic diagnostics after an edit transaction.
- Tests cover:
  - semantic backend success;
  - backend unavailable;
  - structural fallback labeling;
  - stale file invalidation;
  - diagnostics after file change;
  - bounded storage/no raw LSP payloads;
  - Work Queue readback fields;
  - model usability proof.

Non-goals:

- Do not implement a broad multi-language LSP fleet in this pass. TS/JS is the
  production path because it covers OpenClaw.
- Do not auto-install or auto-spawn arbitrary language servers without explicit
  configuration.
- Do not add a second model-facing code-intelligence API parallel to the
  canonical `code.*` tools.
- Do not let structural fallback masquerade as semantic success.

Open risks:

- TypeScript language-service API integration may be enough for TS/JS parity
  before a separate JSON-RPC LSP client is necessary. The implementation pass
  should evaluate that from first principles and choose the simpler production
  backend if it satisfies the success gates.
- Semantic indexing can become expensive on large workspaces. Cache metadata
  and invalidation must be bounded from the start.
- Some semantic features, especially code actions and rename planning, may
  require stricter project config and file snapshot discipline than current
  structural mode.

Implementation status, 2026-05-19:

- The canonical backend registry is implemented.
- `typescript_language_service` is the production TS/JS semantic backend for
  OpenClaw. It uses TypeScript language-service APIs directly rather than a
  separate JSON-RPC language-server process because that satisfies the current
  repo's semantic success gates with less runtime lifecycle risk.
- `structural_parser` remains explicit degraded mode. Structural-only
  code-intelligence evidence is no longer clean context success; consumers
  must surface limitations.
- `code.backend_status` is implemented as a read-only Runtime Tool
  Kernel-visible backend status request.
- The canonical model-facing `code.*` tool IDs remain unchanged. Runtime owns
  backend/schema construction and adds semantic metadata to the unified result
  envelope.
- Work Queue readback surfaces backend health, semantic/fallback state,
  diagnostic/project refs, latency, and result-count metadata.
- The bounded model-usability lane passed with Qwen selecting semantic
  definition, reference, and related-test tools, all backed by
  `typescript_language_service` with no structural fallback.

Remaining non-blocking follow-up:

- A true external JSON-RPC LSP fleet remains a later extension if OpenClaw
  needs multi-language semantic coverage beyond TS/JS. It is not required for
  the current Product/Spec proof path because OpenClaw's execution-platform
  code is TypeScript/JavaScript and the TypeScript language service supplies
  the needed semantic parity without pretending external LSP readiness.

### 3. Context Synthesis Barrier And Scheduler Handoff

Work item:
`openclaw-convergence.coding-leap-03-context-synthesis-scheduler-handoff`

Problem:

The scheduler has previously received only a synthesis artifact ref or short
summary, starving it at the exact point where it must form implementation
groups, dependencies, and worker-fit choices.

Production target:

Make context synthesis a required barrier after context scout fanout and before
implementation graph selection for complex coding jobs.

Synthesis must produce:

- implementation groups;
- dependency graph;
- parallelism candidates;
- file ownership proposals;
- worker-fit recommendations;
- likely validation lanes;
- review lanes;
- integration/merge requirements;
- unresolved context risks;
- evidence expectations by commitment.

Runtime behavior:

- The scheduler receives the full bounded synthesis packet, not just a ref.
- Runtime persists a synthesis checkpoint that can resume graph planning
  without rerunning packet authoring/scouts.
- For complex jobs, final graph validation is not applied to the intermediate
  scout fanout graph before synthesis; scout fanout + synthesis join is valid
  intermediate structure.
- If synthesis is missing or weak, implementation nodes are blocked before
  provider invocation.

Success gates:

- Graph selection after synthesis has enough detail to choose between Codex,
  non-Codex workers, validation, review, docs, and readback nodes.
- Scheduler readback shows the synthesis-derived groups and why each next node
  was chosen.
- Boundary replay can restart after context synthesis.

Implementation status, 2026-05-19:

- Implemented as a production context synthesis contract in
  `extensions/execution-platform/src/workflows/context-synthesis.ts`.
- The synthesis artifact now includes worker-ready implementation groups,
  file ownership, cheaper-worker suitability, Codex escalation rationale,
  expected output, evidence-claim expectations, validation needs, review
  needs, stop-if-missing blockers, risk refs, integration requirements,
  semantic code-intelligence refs, scout state summaries, validation lanes,
  review lanes, worker-fit summary, and scheduler handoff readiness.
- Runtime preserves source context snapshot refs from runtime-owned
  `ContextSnapshotRef` inputs when the model omits those refs. The model owns
  synthesis judgment; runtime owns refs, freshness, storage flags, and bounds.
- The dynamic coding-team graph runner passes accepted scout summaries,
  fresh snapshot refs, semantic code-intelligence refs, CommitmentWorkPackets,
  and the full expected synthesis shape into the synthesis model call.
- Scheduler progress and Work Queue readback expose active context synthesis
  status, synthesis ref, group/dependency/parallel/blocker counts,
  worker-fit summary, graph-compile input summary, implementation group ids,
  target refs, validation lanes, review lanes, and semantic code-intelligence
  refs.
- The bounded model lane
  `scripts/execution-platform-run-context-synthesis-model-lane-proof.mjs`
  passed with `qwen/qwen3-coder-next` in one attempt. Proof artifact:
  `.artifacts/execution-platform/context-synthesis-model-lane-mpcw7p7r.json`.

### 4. Worker-Internal Streaming And Operator Readback

Work item:
`openclaw-convergence.coding-leap-04-worker-streaming-readback`

Problem:

Node-level progress is insufficient. Long provider calls and worker-internal
loops still leave the owner without enough information about what is happening.

Production target:

Every long model/tool/worker step emits bounded span progress:

- phase;
- active objective;
- role/model/provider;
- target refs;
- selected tool;
- input packet/context refs;
- current validation command;
- retry/repair state;
- provider latency/token/finish diagnostics where available;
- output hash/content-length summary;
- blocker;
- next decision.

Required surfaces:

- RuntimeExecutionSpan;
- Runtime Tool Kernel trace;
- RuntimeWorkerSupervisor;
- Non-Codex worker loop;
- Codex bridge adapter;
- scheduler decision tools;
- validation/QA tools;
- Work Queue active graph readback;
- final chat/readback summaries.

Success gates:

- During a long implementation step, readback can answer "what is it doing,
  why, with which model/tool, and what is blocking?"
- Provider no-content, timeout, and schema repair are visible before final
  failure.
- Spans are bounded and contain no raw prompts, raw responses, raw transcripts,
  raw logs, raw DB rows, or secrets.

Implementation status as of 2026-05-19:

- `ModelAgnosticWorkerPhaseEvent` carries the worker-internal streaming
  contract for packet/context/synthesis/code-intelligence refs, selected tool
  and status, validation command, edit transaction state, output hash/content
  length, provider latency/timeout/finish/token diagnostics, blocker, next
  decision, and raw-storage false flags.
- the non-Codex tool worker loop emits those fields from controller model
  turns, tool execution, validation, repair, stale-context refresh, evidence
  handoff, provider no-content, and timeout paths.
- the dynamic coding graph runner persists worker-internal fields into
  scheduler progress metadata and RuntimeExecutionSpan/model-call summaries
  without storing raw prompts, responses, provider logs, tool logs, command
  logs, DB rows, or secrets.
- Work Queue active graph readback exposes a first-class `workerInternal`
  block that remains available for active and linked closed runtime jobs.
- focused regression coverage proves closed work-item runtime readback keeps
  worker-internal model/tool/context/validation/evidence state visible.
- the bounded model lane
  `scripts/execution-platform-run-worker-streaming-readback-model-lane-proof.mjs`
  passed with `qwen/qwen3-coder-next`, proving a model can use the readback to
  recover active worker state and next decision.

### 5. Non-Codex Compound Coding Tools

Work item:
`openclaw-convergence.coding-leap-05-non-codex-compound-tools`

Problem:

Small and cheaper coding models are fragile when forced to orchestrate many
low-level tool calls. They need higher-level but traceable compound tools.

Production target:

Add compound tools that wrap common safe coding sequences while emitting
sub-events:

- `coding.inspect_edit_validate`
- `coding.add_test_and_validate`
- `coding.update_docs_and_cross_refs`
- `coding.refactor_symbol_with_lsp`
- `coding.fix_type_errors`
- `coding.apply_small_patch_with_evidence`

Each compound tool must internally trace:

- inspected files/symbols;
- edit plan;
- edit transaction;
- changed file refs;
- validation command refs;
- validation result refs;
- repair classification;
- evidence claims;
- limitations/escalation.

Model/runtime boundary:

- Model selects compound tool and semantic objective.
- Runtime derives allowed files, validation commands, transaction ids, and
  evidence refs from context packet, capability profile, and workflow policy.
- Compound tools cannot hide failed validation or bypass evidence gates.

Success gates:

- Kimi/Qwen-style workers can complete scoped implementation tasks without
  brittle multi-step JSON choreography.
- Compound tool failure is classified at the right boundary and replayable.
- Work Queue readback shows the compound tool and its internal sub-events.

Implementation status, 2026-05-19:

Complete as a first-class non-Codex worker-loop capability. The runtime tool
registry now exposes the six `coding.*` compound tools under
`coding.compound` with bounded repo-write authority and raw-storage false
policy. The `agent_team.coding` workflow plugin declares the family as a
production runtime-tool dependency.

The production non-Codex worker loop accepts compound tool calls as regular
worker tools. A compound tool runs through the same runtime-owned edit
transaction engine as atomic edit tools: inspect target refs, record the edit
plan, apply bounded file edits, run validation, classify failure when needed,
emit commitment evidence, and close the transaction. Successful compound tools
count as changed-file, validation, evidence, and transaction progress; failed
compound tools return `needs_review` with repair classification refs instead
of faking implementation evidence.

Owner-facing readback now preserves compound execution state through
`ModelAgnosticWorkerPhaseEvent`, dynamic scheduler progress, and Work Queue
`activeGraphProgress.workerInternal`:

- `compoundToolId`
- `compoundSubEventCount`
- `compoundSubEventPhases`

Focused validation:

- `pnpm test:file extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts extensions/execution-platform/src/codex-bridge/model-agnostic-tool-worker-loop.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/workflows/agent-team-coding-plugin.test.ts extensions/execution-platform/src/workflows/runtime-node-capability-registry.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
- `node --import tsx scripts/execution-platform-run-non-codex-compound-tool-model-lane-proof.mjs`

Model lane evidence:

- artifact:
  `.artifacts/execution-platform/non-codex-compound-tool-model-lane-mpcy484e.json`
- hash:
  `sha256:01df2d0d4059454819d208de3fc9533396cd5ecd1ce92c4648303fcc66a1c1e7`
- outcome: Qwen selected `coding.inspect_edit_validate`; runtime applied the
  scoped edit, ran validation, emitted evidence, closed the edit transaction,
  and surfaced compound phase events.

Remaining intentional boundary: compound tools are not a hidden semantic
compiler. The model still chooses the compound tool and edit intent; runtime
owns refs, bounds, transaction state, validation execution, evidence refs, and
raw-storage policy.

### 6. Fallback And Compatibility Retirement

Work item:
`openclaw-convergence.coding-leap-06-fallback-compat-retirement`

Implementation status, 2026-05-19: complete for the pre-Product/Spec proof
gate. Production chat/native run-once routes now use
`ProductionWorkflowExecutionFactory`; retired generic workflow jobs fail closed
with diagnostic runtime evidence; public runtime exports expose
`CodingTeamRuntimeJobRunner` rather than the legacy queued-runner class; proof
scripts use direct diagnostic imports; stale generated proof/helper Work Queue
rows are archived through generated-item lifecycle reconciliation; and
`pnpm tsgo:fast` plus narrow model-boundary tests pass.

Problem:

Production-adjacent fallback/proof/compatibility surfaces still exist and can
confuse routing, success semantics, and diagnostics.

Production target:

Audit and remove or hard-disable production access to:

- generic queued workflow runner production success;
- queued bridge runner production success;
- fallback-only workflow transports;
- generic workflow fallback evidence profiles;
- degraded closeout success;
- inferred evidence ref closure;
- static proof diagnostics in production readback;
- compatibility aliases in capability/node contracts;
- any Product/Spec proof helper that can masquerade as production execution.

Diagnosis update, 2026-05-19:

This item should also include a bounded high-impact refactor pass. The
diagnosis found several places where recently hardened systems are still
surrounded by old surfaces or duplicate contracts:

- `AgentTeamQueuedRunner` has been removed. The gateway-facing agent-team
  runtime class is `CodingTeamRuntimeJobRunner`, and it rejects static
  single-job proof requests instead of attempting a retired role sequence.
  The old context-scout pilot, coding-team live pilot, owner-work-batch proof,
  final/native pathway proofs, autonomy passes, low-level Kimi patch-JSON
  adapter, and Kimi microtask executor have been deleted.
- `WorkflowQueuedRunner` has been deleted along with its retirement proof and
  tests. Production chat/native routes must use canonical workflow-runtime
  dispatch; future tests must exercise the runtime graph engine rather than a
  queued-runner shim.
- `src/gateway/server-methods/chat.ts`,
  `src/gateway/execution-platform-agent-team-runner.ts`, and
  `extensions/execution-platform/src/codex-bridge/host-routes.ts` still expose
  both canonical and retired runner construction paths. Introduce one
  production workflow execution gateway/factory and route all production
  execution through it.
- `extensions/execution-platform/src/codex-bridge/index.ts` no longer exports
  retired or compatibility-era surfaces. Public runtime exports expose
  canonical production adapters only; deleted legacy proof surfaces must not be
  reintroduced through compatibility shims.
- Degraded/system closeout still exists as a broadly importable helper and is
  referenced by old runners. The pass should make degraded closeout a
  diagnostic-only artifact producer, not a production closeout source, and add
  an import/behavior regression proving production success cannot depend on it.
- Fallback-only workflow transports remain in workflow definitions. If they
  stay, they must be modeled as explicit diagnostic/escalation profiles with
  blocker evidence, not selectable production execution transports.
- Compatibility aliases in runtime tool adoption are now registry-derived, but
  the pass should prove the old `RUNTIME_TOOL_ADOPTION_BOUNDARY_MAP` cannot
  drift from the registry and cannot become a second source of truth again.
- Proof and replay harnesses are essential, but they should be black-box
  observers or debug-only generated Work Queue items. They must not update or
  close production Work Queue items except through accepted closeout/control
  APIs.
- The DB still shows old Product/Spec proof/generated child rows as active,
  blocked, or needs-review roadmap work. The pass should classify those by
  generated-item lifecycle, retire debug-only/proof remnants through the
  proper repository/control path, and add a regression preventing abandoned
  proof children from surviving parent terminalization as owner-visible active
  roadmap items.
- `pnpm tsgo:fast` is currently blocked by workflow-definition and
  workflow-evidence-profile type drift. That drift is now a production
  refactor target for this item because it hides real compatibility debt
  behind focused tests. The pass should converge `WorkflowDefinition`,
  `WorkflowRoleClass`, `RuntimeToolFamily`, product/spec workflow definitions,
  and evidence-profile artifact types so full TypeScript validation is not a
  standing exception.
- `DynamicAgentTeamGraphRunner` is still a very large integration class. Do
  not split it wholesale in this pass, but extract the production-path guard
  and retired-path rejection logic into a small canonical boundary module so
  future runner work does not reintroduce fallback branches.

Single-pass refactor targets:

1. Production execution factory:
   create one runtime-owned factory for workflow execution that chooses only
   canonical engines for production jobs and returns fail-closed diagnostics
   for retired paths.
2. Queued-runner collapse:
   keep both old queued-runner classes deleted. No production, migration,
   diagnostic, or test path may enter a static single-job role sequence or a
   generic queued workflow shim.
3. Public export hygiene:
   remove retired/proof adapters from the main runtime API barrel or move them
   under explicit diagnostic/test-only exports.
4. Degraded closeout retirement:
   centralize degraded closeout as diagnostic-only and prevent any production
   success, Work Queue closeout, or evidence-profile acceptance through it.
5. Workflow/type contract convergence:
   resolve workflow definition/evidence-profile type drift and make
   `pnpm tsgo:fast` a required success gate for this item.
6. Proof harness isolation:
   prove proof/replay scripts cannot masquerade as production execution or
   lifecycle closeout.
7. Generated proof-child cleanup:
   retire stale Product/Spec proof/helper rows through lifecycle policy and
   prove future generated debug/proof children cannot hang in active owner
   queues after parent terminalization.
8. Compatibility map derivation:
   prove all compatibility readback maps derive from canonical registries.

Allowed residuals:

- test fixtures;
- explicit proof harnesses that cannot create production success;
- migration readers marked diagnostic-only.

Success gates:

- There is one production coding-team execution path: generic orchestration
  runtime + workflow definition/plugin + scheduler + runtime tool kernel +
  evidence profile + model-authored closeout.
- Proof harnesses are test-only and cannot close production Work Queue items.
- Focused tests prove blocked legacy routes cannot produce success.
- `pnpm tsgo:fast` passes without carrying the workflow-definition/
  evidence-profile exception forward.
- Main production barrels and gateway factories no longer expose retired
  queued runners, patch-JSON worker adapters, or legacy proof pilots as
  ordinary production options.
- A regression test proves a Product/Spec-class prompt cannot route through
  generic queued workflow dispatch, static single-job role sequence, degraded
  closeout, inferred evidence closure, or proof-only lifecycle mutation.

### 7. Product/Spec Planning Production Upgrade Proof

Work item:
`openclaw-convergence.active-queue-34`

Proof target:

Run the full Product/Spec Planning Production Upgrade through OpenClaw after
items 1-6 pass.

Required proof evidence:

- full prompt reaches router, Mission Ledger, packet author, context scout,
  synthesis, scheduler, workers, validation, review, closeout, and readback as
  needed;
- Mission Ledger commitments are accurate and detailed enough;
- Commitment Work Packets are worker-ready;
- context scout fanout and synthesis produce accepted context;
- scheduler creates a valid graph from synthesis;
- graph nodes materialize Work Queue child items;
- node selection uses cost-aware capability policy without Codex monopoly;
- real source edits happen if implementation is required;
- validation/QA runs as first-class node/tool evidence;
- review/closeout is model-authored and evidence-gated;
- Work Queue readback shows active node, tool, model, blocker, files,
  validation, child items, closeout, limitations, and ELI5;
- no fallback runner/proof/degraded closeout path can claim success.

## Post-Proof Work Queue Slices

These items should follow the Product/Spec proof unless they become blockers.

### 8. Parallel Worktree Supersteps

Work item:
`openclaw-convergence.coding-leap-07-parallel-worktree-supersteps`

Add per-node worktrees or patch workspaces for independent implementation
groups. Each worktree must have file ownership, port namespace, validation
resources, merge candidate refs, conflict diagnostics, cleanup, and Work Queue
readback.

### 9. Runtime Lifecycle Hooks

Work item:
`openclaw-convergence.coding-leap-08-runtime-lifecycle-hooks`

Add typed project-configurable hooks for pre/post model call, pre/post tool,
pre/post edit, post-validation, stop, closeout, compaction, interrupt, retry,
and escalation. Hooks run through Runtime Tool Kernel and cannot bypass
workflow evidence/closeout gates.

### 10. Agent Role Configuration Surface

Work item:
`openclaw-convergence.coding-leap-09-agent-role-configuration`

Move role definitions into project/runtime config. Roles define model profile,
tools, permissions, ideal task size, context needs, evidence outputs, budgets,
and escalation rules. Runtime compiles them into workflow definitions and the
capability registry.

### 11. Tool Search And Capability Catalog

Work item:
`openclaw-convergence.coding-leap-10-tool-search-capability-catalog`

Expose a bounded model-facing tool discovery interface. Models request tools
by need/capability; runtime returns ranked tool refs with contracts, authority,
budget, examples, and reason codes.

### 12. Role/Model Benchmark Registry

Work item:
`openclaw-convergence.coding-leap-11-role-model-benchmark-registry`

Promote model/profile choices only with benchmark evidence: valid-output rate,
latency, cost, edit success, repair success, context quality, validation
quality, and closeout quality.

### 13. Memory-To-Execution Context Packs

Work item:
`openclaw-convergence.coding-leap-12-memory-execution-context-packs`

Feed model memory into execution through explicit context-pack refs:
retrieval intent, source selection, candidate fetch, ranking, context pack
assembly, usefulness review, freshness/staleness, supersession/conflict, and
insertion site.

## Product/Spec Proof Readiness Checklist

The Product/Spec proof is ready only when all pre-proof items pass these
global gates:

- no runtime-owned schema is model-authored;
- every worker receives enough context or can request it;
- context scout can use code intelligence;
- context synthesis is a required barrier for complex work;
- scheduler sees full synthesis detail;
- broad Codex use requires accepted cost/quality justification;
- non-Codex workers can use compound coding tools;
- implementation, validation, repair, review, closeout, and Work Queue
  readback all emit runtime spans;
- production success requires Mission Ledger evidence, validation evidence,
  workflow evidence profile acceptance, runtime tool traces, and
  model-authored closeout;
- legacy/fallback/proof paths cannot create production success.
