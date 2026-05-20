# Current Slice

## 2026-05-20 Product/Spec Proof Repair Pass

The active Product/Spec proof repair pass is complete through focused
validation. The next proof action is not a full prompt restart; it is a
boundary replay from context synthesis using the saved Product/Spec checkpoint.

What changed:

- latest-run-state checkpoint files now preserve operator-visible phase,
  blocker, next action, wall time, usage availability, and retry state through
  context compaction.
- packet review is blocking-defect driven; advisory packet thinness no longer
  burns GPT-5.5 in normal passes.
- context synthesis now has a manifest boundary, alias normalization for group
  guidance, and focused field repair before terminal needs_review.
- adapter needs_review is terminal diagnostic state in runtime jobs/readback,
  not a hidden retry-scheduled pending loop.

Validation passed:

- focused tests for context synthesis, dynamic runner, Work Queue readback,
  worker supervisor, latest-run-state, and scheduler.
- script syntax checks for the checkpointed proof and boundary replay harness.
- `pnpm tsgo:fast`.

Next step:
continue Product/Spec from the repaired post-synthesis graph boundary; the
context synthesis continuation now works and must not be restarted from the
front door unless a full UX proof is explicitly requested.

Replay result:

- The replay identified and fixed a lossy handoff between context synthesis
  and post-synthesis graph compilation. The model output was accepted with
  multiple implementation groups, but the scheduler consumed the truncated
  owner-facing metadata summary and compiled too few implementation nodes.
- Context synthesis now returns a dedicated
  `context_synthesis_graph_compile_handoff` contract for scheduler
  compilation. It is separate from artifact/readback metadata and must carry
  all implementation groups or stop as `needs_review`.
- The repaired replay from `after-parallel-context` accepted synthesis with 7
  groups and compiled all 7 groups into implementation nodes, followed by
  validation, review, readback, and closeout nodes. The replay stopped at the
  configured checkpoint before implementation execution.
- `max_iterations` checkpoint stops now terminalize graphs as `needs_review`
  rather than `failed`, preserving the distinction between a bounded replay
  stop and a hard runtime failure.

## 2026-05-19 Fallback And Compatibility Retirement

The current active coding-executor capability-leap item is complete through:

`openclaw-convergence.coding-leap-06-fallback-compat-retirement` -
Fallback And Compatibility Retirement.

Production workflow execution now has one gateway-facing dispatch boundary:
`ProductionWorkflowExecutionFactory`. Production chat/native run-once paths no
longer instantiate `WorkflowQueuedRunner` for non-agent-team jobs. Retired
generic workflow jobs fail closed with diagnostic runtime evidence that points
to the canonical workflow runtime engine. Agent-team jobs continue through the
scheduler-backed production adapter under the canonical public name
`CodingTeamRuntimeJobRunner`.

Public runtime API exports were tightened. Retired/proof-era surfaces are not
exported from `codex-bridge/index.ts`: `WorkflowQueuedRunner`,
`AgentTeamQueuedRunner`, legacy context scout pilot helpers, live pilot proof
entrypoints, and low-level Kimi patch-JSON adapter classes are direct
test/proof imports only. Proof scripts that still exercise diagnostic fixtures
were updated accordingly.

The generated Work Queue cleanup control path was rerun and passed. Stale
debug/proof child rows were backfilled as generated debug/proof diagnostics,
archived through `reconcileTerminalRuntimeProjections`, hidden from owner
active queue readback, and closed via accepted DB closeout evidence.

Validation:

- focused production factory/export/host route tests passed.
- router, Mission Ledger, work packet, scheduler, context scout, worker,
  validation, closeout, production factory, and export-hygiene model-boundary
  lane passed: 14 test files, 140 tests.
- `pnpm tsgo:fast` passed.
- live narrow model lane passed with `qwen/qwen3-coder-next` selecting
  code-intelligence runtime tools.

Next item:
`openclaw-convergence.active-queue-34` - Product/Spec Planning Workflow Plugin
Production Proof.

DB Work Queue closeout:

- closeout ref:
  `artifact://execution-platform/fallback-compat-retirement-closeout.json`
- closeout hash:
  `sha256:91c9312fcf43bd5f2f364bcb6f16f944a80758bcbbaaf86b67ed34e1ebdd4d30`
- queue status:
  `closed`

## 2026-05-19 Non-Codex Compound Coding Tools

The current active coding-executor capability-leap item is complete through:

`openclaw-convergence.coding-leap-05-non-codex-compound-tools` -
Non-Codex Compound Coding Tools.

The non-Codex worker loop now has first-class compound coding tools:
`coding.inspect_edit_validate`, `coding.add_test_and_validate`,
`coding.update_docs_and_cross_refs`, `coding.refactor_symbol_with_lsp`,
`coding.fix_type_errors`, and `coding.apply_small_patch_with_evidence`.
These tools run through Runtime Tool Kernel under the `coding.compound`
family and bounded repo-write authority. They are live in the
`agent_team.coding` runtime tool family set.

Compound tools do not bypass runtime truth. The model selects the compound
tool and semantic edit intent; runtime owns file refs, edit transaction,
validation execution, evidence refs, repair classification, and raw-storage
policy. Successful compound tools now satisfy worker changed-file,
validation, evidence, and closed-transaction gates. Missing edits, failed
patch application, failed validation, or missing LSP-style semantic backend
refs stop as `needs_review` with repair classification refs instead of
claiming implementation success.

Worker-internal progress and Work Queue active graph readback now surface
compound execution:

- selected compound tool id;
- compound sub-event count;
- compound sub-event phases;
- changed-file refs, validation refs, evidence refs, and edit transaction
  refs.

Focused validation:

- `pnpm test:file extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts extensions/execution-platform/src/codex-bridge/model-agnostic-tool-worker-loop.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts extensions/execution-platform/src/workflows/agent-team-coding-plugin.test.ts extensions/execution-platform/src/workflows/runtime-node-capability-registry.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
- `pnpm exec tsx -e "Promise.all([import('./extensions/execution-platform/src/work-queue/execution-read-model.ts'), import('./extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts'), import('./extensions/execution-platform/src/codex-bridge/model-agnostic-tool-worker-loop.ts')]).then(()=>console.log('compound-imports-ok'))"`
- `node --import tsx scripts/execution-platform-run-non-codex-compound-tool-model-lane-proof.mjs`

The required narrow model lane passed. `qwen/qwen3-coder-next` selected
`coding.inspect_edit_validate`, the runtime worker loop applied the scoped
edit, validation passed, evidence was claimed, the edit transaction closed,
and compound phase events were emitted. Bounded artifact:
`.artifacts/execution-platform/non-codex-compound-tool-model-lane-mpcy484e.json`
with hash
`sha256:01df2d0d4059454819d208de3fc9533396cd5ecd1ce92c4648303fcc66a1c1e7`.

Known validation limitation: `pnpm tsgo:fast` remains blocked by pre-existing
workflow-definition/evidence-profile type debt unrelated to this slice.

DB Work Queue closeout:

- closeout ref:
  `artifact://execution-platform/non-codex-compound-tools-closeout.json`
- closeout hash:
  `sha256:7b636ba5dc2df083dc8f6ca6ed9ce94abf6598442dcad3bc77632f6d42a4f464`
- queue status:
  `closed`

Next pre-Product/Spec item:
`openclaw-convergence.coding-leap-06-fallback-compat-retirement` -
Fallback And Compatibility Retirement.

Diagnosis update for that item:

- include a bounded refactor pass, not only deletion of old names;
- create one production workflow execution factory for gateway/chat/native
  run-once paths;
- collapse queued runners to migration/test shims or route production through
  the canonical scheduler-backed runtime only;
- remove retired/proof adapters from public runtime barrels or move them under
  explicit diagnostic/test-only exports;
- make degraded/system closeout diagnostic-only everywhere and prove it cannot
  satisfy success;
- isolate proof/replay harness lifecycle so debug scripts cannot masquerade as
  production execution or closeout;
- retire stale generated Product/Spec proof/helper rows through generated-item
  lifecycle policy and prevent them from remaining owner-visible active work;
- prove compatibility maps derive from canonical registries;
- fix workflow-definition/evidence-profile type drift so `pnpm tsgo:fast`
  becomes a required success gate for the next pass.

## 2026-05-19 Worker-Internal Streaming And Operator Readback

The current active coding-executor capability-leap item is complete through:

`openclaw-convergence.coding-leap-04-worker-streaming-readback` -
Worker-Internal Streaming And Operator Readback.

Worker-internal progress is now first-class owner readback, not only
node-level scheduler status. The non-Codex tool worker loop emits bounded
phase events for controller model turns, tool completions, validation,
repair, stale-context refresh, evidence handoff, provider no-content, and
timeout boundaries. Those events carry packet refs, context refs, synthesis
refs, code-intelligence refs, selected tool and status, validation command
refs/summaries, edit transaction state, output hash/content length, provider
latency, timeout, finish reason, token count, blocker, next decision, and ELI5
state.

The dynamic coding graph runner persists those events through scheduler
progress and RuntimeExecutionSpan/model-call summaries. Work Queue active
graph readback exposes a `workerInternal` section beside scheduler, model,
tool, and span progress so an operator can answer what the worker is doing,
why it was selected, which model/provider/tool is active, what context and
validation are in use, what evidence was produced, what is blocked, and what
decision comes next.

Focused validation:

- `pnpm test:file extensions/execution-platform/src/codex-bridge/model-agnostic-tool-worker-loop.test.ts extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
- `pnpm exec tsx -e "import('./extensions/execution-platform/src/codex-bridge/non-codex-tool-using-worker-loop.ts').then(()=>console.log('non-codex-worker-loop-import-ok'))"`
- `pnpm exec tsx -e "import('./extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts').then(()=>console.log('dynamic-runner-import-ok'))"`
- `pnpm exec tsx -e "import('./extensions/execution-platform/src/work-queue/execution-read-model.ts').then(()=>console.log('execution-read-model-import-ok'))"`
- `node --import tsx scripts/execution-platform-run-worker-streaming-readback-model-lane-proof.mjs`

The required narrow model lane passed with `qwen/qwen3-coder-next`: the model
read the bounded owner-facing worker progress packet and recovered the active
worker action, `moonshotai/kimi-k2.6` model/provider, selected worker tool,
evidence refs, validation refs, no-blocker state, and next decision. Bounded
artifact:
`.artifacts/execution-platform/worker-streaming-readback-model-lane-mpcwyonc.json`
with hash
`8a27bf1c05616ee69f92ff60e07f1ba1d54253b1a46255b183422ebc940d6178`.

Known validation limitation: `pnpm tsgo:fast` remains blocked by pre-existing
workflow-definition/evidence-profile type debt unrelated to this slice.

DB Work Queue closeout:

- closeout ref:
  `artifact://execution-platform/worker-streaming-readback-closeout.json`
- closeout hash:
  `sha256:721c930e122c9a88334d015887152500be7e35ebf2e5c82a63a55ead41724018`
- queue status:
  `closed`

Next pre-Product/Spec item:
`openclaw-convergence.coding-leap-05-non-codex-compound-tools` -
Non-Codex Compound Coding Tools.

## 2026-05-19 Context Synthesis Barrier And Scheduler Handoff

The current active coding-executor capability-leap item is now complete
through:

`openclaw-convergence.coding-leap-03-context-synthesis-scheduler-handoff` -
Context Synthesis Barrier And Scheduler Handoff.

Context synthesis is now a production scheduler handoff barrier rather than a
summary/ref placeholder. The synthesis artifact carries worker-ready
implementation groups, file ownership refs, cheaper-worker suitability, Codex
escalation rationale, expected output, evidence-claim expectations, validation
needs, review needs, stop-if-missing blockers, risks, integration
requirements, scout state summaries, semantic code-intelligence refs,
validation lanes, review lanes, worker-fit summary, and graph-compile
readiness.

Runtime owns refs and freshness. If the model omits source context snapshot
refs, `normalizeContextSynthesisArtifact` preserves the runtime-provided fresh
snapshot refs instead of letting the handoff lose context provenance. Ready
synthesis is rejected if it lacks worker-ready group detail, evidence
expectations, validation/review lanes, worker-fit rationale, dependency or
explicit parallelism, or fresh required context.

The dynamic graph runner now feeds the context synthesis model accepted scout
node summaries, context snapshot refs, semantic code-intelligence refs,
CommitmentWorkPackets, mission summary, and the full expected handoff shape.
Scheduler progress and Work Queue active graph readback expose synthesis
status, synthesis ref, group/dependency/parallel/blocker counts, worker-fit
summary, graph-compile input summary, implementation group ids, target refs,
validation lanes, review lanes, and semantic code-intelligence refs.

Focused validation:

- `pnpm test:file extensions/execution-platform/src/workflows/context-synthesis.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/codex-bridge/parallel-context-scout-boundary-replay.test.ts`
- `pnpm exec tsx -e "import('./extensions/execution-platform/src/workflows/context-synthesis.ts').then(()=>console.log('context-synthesis-import-ok'))"`
- `pnpm exec tsx -e "import('./extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts').then(()=>console.log('dynamic-agent-team-graph-runner-import-ok'))"`
- `node --import tsx scripts/execution-platform-run-context-synthesis-model-lane-proof.mjs`

The bounded model lane passed with `qwen/qwen3-coder-next` in one attempt.
The model produced a scheduler-ready synthesis artifact that normalized and
validated through the production contract without repair. Bounded artifact:
`.artifacts/execution-platform/context-synthesis-model-lane-mpcw7p7r.json`
with hash
`a4a1a9ac165fbf26db9499be5ac075fa5ba37643a0f588b56d05f24d1d1f41a8`.

Known validation limitation: `pnpm tsgo:fast` remains blocked by pre-existing
workflow-definition/evidence-profile type debt unrelated to this slice.

DB Work Queue closeout:

- closeout ref:
  `artifact://execution-platform/context-synthesis-scheduler-handoff-closeout.json`
- closeout hash:
  `sha256:f25757a9ab0dcb6fd1d5c3c7c908ddc1206b7a6868c119b0d564a995f76c6000`
- queue status:
  `closed`

Next pre-Product/Spec item:
`openclaw-convergence.coding-leap-04-worker-streaming-readback` -
Worker-Internal Streaming And Operator Readback.

## 2026-05-19 Code Intelligence Semantic Backend And LSP Parity

The current active coding-executor capability-leap item is now complete
through:

`openclaw-convergence.coding-leap-02b-code-intelligence-lsp-semantic-backend`

- Code Intelligence Semantic Backend And LSP Parity.

Execution Platform now has a canonical Code Intelligence backend registry.
The production TS/JS path uses TypeScript language-service APIs through
`typescript_language_service`; structural parsing remains available only as
explicit degraded mode. The model-facing `code.*` tool IDs did not fork.
Runtime-owned result envelopes now expose backend id, backend health ref,
workspace snapshot ref, semantic confidence, fallback state, diagnostic
version ref, project config refs, backend latency, result counts, and
limitations. `code.backend_status` reports bounded backend readiness without
asking the model to invent runtime schema.

Context scout, parallel context replay, and Work Queue active graph readback
now preserve semantic backend refs and limitations. Structural-only
code-intelligence evidence is accepted with limitations instead of being
treated as clean semantic success.

Focused validation:

- `pnpm test:file extensions/execution-platform/src/code-intelligence/code-intelligence-service.test.ts extensions/execution-platform/src/code-intelligence/code-intelligence-runtime-tools.test.ts extensions/execution-platform/src/workflows/context-scout-tool-loop.test.ts extensions/execution-platform/src/workflows/mission-work-packets.test.ts extensions/execution-platform/src/codex-bridge/parallel-context-scout-boundary-replay.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
- `pnpm exec tsx -e "import('./extensions/execution-platform/src/code-intelligence/code-intelligence-backends.ts').then(()=>console.log('semantic-backend-import-ok'))"`
- `pnpm exec tsx -e "import('./extensions/execution-platform/src/code-intelligence/code-intelligence-service.ts').then(()=>console.log('code-intelligence-service-import-ok'))"`
- `pnpm exec tsx -e "import('./extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts').then(()=>console.log('context-scout-node-executor-import-ok'))"`
- `node --import tsx scripts/execution-platform-run-code-intelligence-model-usability-proof.mjs`

The bounded model-usability lane passed with Qwen selecting semantic
definition, reference, and related-test tools. The proof required
`typescript_semantic` results from `typescript_language_service` with no
structural fallback. Bounded artifact:
`.artifacts/execution-platform/code-intelligence-model-usability-mpcv9txe.json`
with hash
`025bd658a39250c8eda9a1f346dd2c1a913c95da3eae397529e9b2960fc60317`.

Known validation limitation: `pnpm tsgo:fast` remains blocked by pre-existing
workflow-definition/evidence-profile type debt unrelated to this slice. The
semantic backend introduced no remaining type errors in that run.

DB Work Queue closeout:

- closeout ref:
  `artifact://execution-platform/code-intelligence-semantic-backend-closeout.json`
- closeout hash:
  `sha256:e695914d4ded2118358295547f414e519589c0b6d63039f7cc9369e52243c81e`
- queue status:
  `closed`

Next pre-Product/Spec item:
`openclaw-convergence.coding-leap-03-context-synthesis-scheduler-handoff` -
Context Synthesis Barrier And Scheduler Handoff.

## 2026-05-19 Context Scout Over Code Intelligence

The current active coding-executor capability-leap item is now complete
through:

`openclaw-convergence.coding-leap-02-context-scout-code-intelligence` -
Context Scout Over Code Intelligence.

Production context scout nodes now consume the Code Intelligence Substrate
directly through Runtime Tool Kernel. Before asking the context scout model to
author the handoff, the executor records bounded `code.search_symbols`,
`code.get_document_symbols`, `code.get_diagnostics`,
`code.find_related_tests`, and `code.find_impact_radius` tool calls. The
handoff packet and tool-loop artifact carry code-intelligence result refs,
runtime tool invocation refs, symbol refs, diagnostic refs, related-test refs,
impact refs, semantic mode, and structural-mode limitations.

The context scout repo-analysis contract now has first-class
code-intelligence, diagnostic-surface, and impact-radius finding kinds. Weak
runtime-only context remains blocked or limited; structural code intelligence
does not masquerade as LSP semantic parity.

Focused validation:

- `pnpm test:file extensions/execution-platform/src/workflows/context-scout-tool-loop.test.ts extensions/execution-platform/src/workflows/mission-work-packets.test.ts extensions/execution-platform/src/codex-bridge/parallel-context-scout-boundary-replay.test.ts extensions/execution-platform/src/code-intelligence/code-intelligence-service.test.ts extensions/execution-platform/src/code-intelligence/code-intelligence-runtime-tools.test.ts`
- `pnpm exec tsx -e "import('./extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts').then(()=>console.log('context-scout-node-executor-import-ok'))"`

Known validation limitation: `pnpm tsgo:fast` remains blocked by pre-existing
workflow-definition/evidence-profile type debt unrelated to this slice.

Next pre-Product/Spec item:
`openclaw-convergence.coding-leap-02b-code-intelligence-lsp-semantic-backend`

- Code Intelligence Semantic Backend And LSP Parity.

## 2026-05-19 Code Intelligence Substrate

The current active coding-executor capability-leap item is now complete
through:

`openclaw-convergence.coding-leap-01-code-intelligence-substrate` - Code
Intelligence Substrate.

Execution Platform now has a first-class `code-intelligence` module with a
shared `CodeIntelligenceService`, bounded TS/JS structural code analysis, and
Runtime Tool Kernel-backed tools for symbol search, definitions, references,
hover, diagnostics, document/workspace symbols, call hierarchy,
implementations, rename planning, code actions, related tests, import graph,
impact radius, and file-structure summaries.

The scheduler runtime tool registry now exposes the `code.*` tool family as
read-only runtime tools, and the coding workflow definition/plugin advertise
`code_intelligence.query` as a production tool family. Work Queue active graph
readback now has a `codeIntelligence` section for tool refs, semantic mode,
result refs, symbol/diagnostic/test/impact refs, stale blockers, summaries,
and raw-storage false flags.

Focused proof:

- `pnpm test:file extensions/execution-platform/src/code-intelligence/code-intelligence-service.test.ts extensions/execution-platform/src/code-intelligence/code-intelligence-runtime-tools.test.ts`
- `node --import tsx scripts/execution-platform-run-code-intelligence-model-usability-proof.mjs`

The live model usability proof passed with Qwen selecting
`code.get_definition`, `code.get_references`, and `code.find_related_tests`,
executing those selections through Runtime Tool Kernel, and judging the
bounded outputs usable. Bounded artifact:
`.artifacts/execution-platform/code-intelligence-model-usability-mpctudkn.json`
with hash
`3ffc680535b33b9fe68ea7125b4b1648ef789679b941136df4c345e1eb4459c9`.

Known validation limitation: `pnpm tsgo:fast` remains blocked by pre-existing
workflow-definition/evidence-profile type debt unrelated to the
code-intelligence substrate.

Next pre-Product/Spec item:
`openclaw-convergence.coding-leap-02-context-scout-code-intelligence` -
Context Scout Over Code Intelligence.

Planned semantic-code-intelligence gap closure:
`openclaw-convergence.coding-leap-02b-code-intelligence-lsp-semantic-backend`

- Code Intelligence Semantic Backend And LSP Parity. This is now queued after
  the context scout consumer pass and before context synthesis/scheduler handoff
  so structural-mode scout evidence can calibrate the semantic backend while the
  downstream graph does not become dependent on weak code context.

## 2026-05-19 Coding Executor Team Capability Leap Planning

The external-baseline coding executor review is now documented in:

- [Coding Executor Team Massive Leap Research](/projects/execution-platform/specs/coding-executor-team-massive-leap-research)
- [Coding Executor Team Capability Leap](/projects/execution-platform/specs/coding-executor-team-capability-leap)

Decision: Product/Spec Planning remains the near-term proof target, but the
next proof should not run until the following capability-leap blockers are
complete and DB Work Queue active ranks reflect that order:

1. Code Intelligence Substrate.
2. Context Scout Over Code Intelligence.
3. Code Intelligence Semantic Backend And LSP Parity.
4. Context Synthesis Barrier And Scheduler Handoff.
5. Worker-Internal Streaming And Operator Readback.
6. Non-Codex Compound Coding Tools.
7. Fallback And Compatibility Retirement.
8. Product/Spec Planning Production Upgrade Proof.

This is a shift from proof-specific repair to coding-harness parity work. The
goal is to close structural gaps against mature coding harnesses while
preserving OpenClaw's runtime truth, evidence, Work Queue, and closeout
architecture.

## 2026-05-19 Span-Level Observability And Readback

The current active pre-Product/Spec native-leap item is now complete through:

`openclaw-convergence.native-leap-11-span-observability-readback` -
Span-Level Observability And Readback.

Runtime execution now has a canonical bounded `RuntimeExecutionSpan` contract
for model calls, runtime tools, worker phases, scheduler decisions, graph
nodes, validation commands, edit transactions, repair attempts, boundary
replay checkpoints, context scout/synthesis, closeout finalization,
supervisor lease/adapter work, Work Queue projection, and human-task style
runtime phases. Scheduler-backed coding-team progress emits span refs beside
the existing scheduler progress artifacts, Runtime Tool Kernel traces carry
execution span metadata, and RuntimeWorkerSupervisor records supervisor and
adapter spans.

Work Queue active graph readback now exposes `spanProgress`: active span,
recent spans, stale spans, blocked spans, current model/tool/worker, current
objective, input/output/evidence refs, blocker, next action, and ELI5 state.
Closeout finalization evidence packets now require runtime execution span refs
before clean finalization can be accepted, so observability is production
evidence rather than only UI decoration.

`openclaw-convergence.native-leap-12-repair-classification-before-retry` -
Repair Classification Before Retry is now implemented.

Runtime repair now has a bounded `RuntimeRepairClassification` contract tied
to graph/node/runtime-job/span/tool/commitment refs. Scheduler node failures,
context freshness blocks, invalid evidence claims, and needs-review outcomes
record canonical repair classification through the scheduler runtime tool path
before retry, repair, escalation, or upstream replay can proceed. Needs-review
node retries are rejected unless the target node has an accepted repair
classification ref and the classification strategy allows retry. Work Queue
active graph readback now exposes latest repair class, failed boundary,
strategy, selected repair boundary, affected commitments, field paths, reason
codes, and next action.

Follow-up hardening completed in this slice extends the same invariant inside
the non-Codex tool worker loop. Worker-internal validation repair, stale patch
freshness refresh, diagnostic-only repair turns, provider no-content, and
provider timeout now record canonical repair classification before retry or
escalation. The shared retry gate rejects missing/terminal/mismatched
classifications, and Kimi/non-Codex Work Queue readback surfaces the
worker-internal classification refs and summaries beside phases and edit
transactions.

Next pre-Product/Spec item:
`openclaw-convergence.active-queue-34` - Product/Spec Planning Workflow Plugin
Production Proof.

## 2026-05-19 First-Class Validation And Test Worker

The current active pre-Product/Spec native-leap item is now complete through:

`openclaw-convergence.native-leap-10-first-class-validation-test-worker` -
First-Class Validation And Test Worker.

Validation is now represented as a first-class scheduler node and runtime
tool-worker surface rather than a hidden post-edit command afterthought.
`ValidationTaskPacket` v2 carries workflow id, Mission Ledger refs,
Commitment Work Packet refs, context snapshot refs, approved runtime command
definitions, target/changed file refs, evidence expectations, failure mapping
expectations, repair handoff expectations, and raw-storage false flags.

The validation/QA runtime tool surface now includes
`validation.select_commands` beside plan, command execution, result summary,
failure classification, failure-to-commitment mapping, repair plan, coverage
review, evidence acceptance, and QA sufficiency review. `validation.run_command`
requires both an approved command ref and the runtime-owned approved command
definition; arbitrary shell-shaped strings no longer become approved
validation commands.

Production scheduler validation nodes emit owner-facing progress before
planning, command selection, each command run, each command result, failure
classification, repair handoff, evidence packet creation, and boundary
checkpoint recording. Failed validation produces same-job repair node/edge
handoffs instead of terminalizing when repairable. Work Queue readback surfaces
validation command refs/summaries, current command status, result refs,
failure refs, repair plans, repair nodes, repair handoffs, accepted evidence
packet refs, blocking commitment ids, and ELI5 progress.

Next pre-Product/Spec native-leap item:
`openclaw-convergence.native-leap-11-span-observability-readback` -
Span-Level Observability And Readback.

## 2026-05-19 Production Boundary Replay

The current active pre-Product/Spec native-leap item is now complete through:

`openclaw-convergence.native-leap-09-production-boundary-replay` -
Production Boundary Replay.

Boundary replay checkpoints now carry boundary input/output hashes,
repo/worktree/authority identity fields, and an identity binding hash.
Replay planning uses the latest checkpoint per required boundary, rejects
stale or identity-mismatched latest checkpoints even when older accepted
evidence exists, and produces an explicit production continuation contract
through `GenericOrchestrationRuntime.runSchedulerGraph` and
`RuntimeWorkGraphScheduler.run`. Work Queue readback surfaces the exact
continuation action, continuation mode, latest accepted checkpoint ref,
skipped upstream boundaries, resume artifact refs, and invalid replay reason
codes.

Next pre-Product/Spec native-leap item:
`openclaw-convergence.native-leap-10-first-class-validation-test-worker` -
First-Class Validation And Test Worker.

## 2026-05-19 Safe Parallelism And Supersteps

The current active pre-Product/Spec native-leap item is now complete through:

`openclaw-convergence.native-leap-07-safe-parallelism-supersteps` - Safe
Parallelism And Supersteps.

Runtime Work Graph supersteps now treat provider/model capacity as a counted
runtime budget instead of a hard conflict mutex. File write scopes, validation
resources, runtime job refs, Work Queue refs, human decisions, explicit
no-parallel refs, and graph dependencies remain hard conflict locks. Provider
profiles/classes can now allow bounded parallel peer nodes through
`providerConcurrencyLimit`, while Work Queue readback surfaces provider budget
keys, limits, runnable nodes, selected nodes, and skipped nodes alongside the
parallel frontier, dependency layers, conflicts, joins, and completed/blocked
branches.

Next pre-Product/Spec native-leap item:
`openclaw-convergence.native-leap-09-production-boundary-replay` - Production
Boundary Replay.

## 2026-05-19 Repo-Analysis Context Scout

The current active pre-Product/Spec native-leap item is now complete through:

`openclaw-convergence.native-leap-06-repo-analysis-context-scout` -
Repo-Analysis Context Scout.

Context scout is now a repo-analysis tool-loop surface instead of a thin JSON
role response plus grounding parser. Production context scout paths emit
canonical runtime tool refs for repo search, bounded file listing/reading,
symbol inspection, related-test discovery, context handoff, limitations,
evidence claims, and context requests. Context handoff packets carry
commitment packet refs, source-prompt excerpt refs, symbol refs, test refs,
synthesis handoff summaries, and bounded context evidence refs. Tool-loop
artifacts carry model-authored repo findings plus synthesis readiness/blocker
state. Parallel context-scout boundary replay now materializes the isolated
fanout/barrier graph shape with one scout per packet, a synthesis barrier node,
and `context_supplies` edges before synthesis readiness is evaluated.

Next pre-Product/Spec native-leap item:
`openclaw-convergence.native-leap-07-safe-parallelism-supersteps` - Safe
Parallelism And Supersteps.

## 2026-05-19 Context Freshness And Snapshot Discipline

The current active pre-Product/Spec native-leap item is now complete through:

`openclaw-convergence.native-leap-05-context-freshness-snapshot-discipline` -
Context Freshness And Snapshot Discipline.

Runtime context is now carried as bounded `ContextSnapshotRef` metadata across
source prompt indexes/excerpts, Commitment Work Packets, context scout
handoffs, context synthesis artifacts, boundary replay checkpoints, scheduler
nodes, and Work Queue readback. Production workflow plugins require fresh
context snapshots before worker execution. The scheduler blocks implementation,
validation, repair, review, docs/planning, and closeout-style worker nodes
before provider invocation when required snapshots are missing, stale,
rejected, or unknown, and emits owner-readable context freshness progress
instead of misclassifying the failure as a model/worker failure.

Next pre-Product/Spec native-leap item:
`openclaw-convergence.native-leap-06-repo-analysis-context-scout` -
Repo-Analysis Context Scout.

## 2026-05-19 Provider Capability Profiles

The current active pre-Product/Spec native-leap item is now complete through:

`openclaw-convergence.native-leap-04-provider-capability-profiles` -
Provider Capability Profiles.

Provider Capability Profiles are now runtime-derived production truth from the
Runtime Node Capability Manifest. Cost-aware scheduler decisions select a
capability/profile id and provide semantic rationale; runtime derives node
kind, executor key, worker ref, tool authority, qualification requirements,
evidence kinds, budget/profile readback, and storage flags. Diagnostic or
contract-only profiles cannot be selected for production nodes, and
Work Queue readback surfaces profile id, worker ref, role class, cost/latency,
context capacity, qualification state, considered profile ids, and Codex
escalation rationale.

Next pre-Product/Spec native-leap item:
`openclaw-convergence.native-leap-05-context-freshness-snapshot-discipline` -
Context Freshness And Snapshot Discipline.

## 2026-05-19 Worker Controller Author Applicator Split

The current active pre-Product/Spec native-leap item is now complete through:

`openclaw-convergence.native-leap-03-worker-controller-author-applicator-split`

- Worker Controller / Author / Applicator Split.

Production non-Codex file-edit workers now carry controller, author,
applicator, validation/repair, evidence, and escalation phase refs. The
production file-edit adapter runs with strict phase authority: controller and
context slots cannot apply source edits directly, patch-author turns author
bounded edit intent/content, runtime applicator phases apply through
`EditTransactionEngine`, and Work Queue readback can surface phase refs beside
transaction refs.

Next pre-Product/Spec native-leap item:
`openclaw-convergence.native-leap-04-provider-capability-profiles` - Provider
Capability Profiles.

## 2026-05-19 Edit Transaction Engine

The current active pre-Product/Spec native-leap item is now complete through:

`openclaw-convergence.native-leap-02-edit-transaction-engine` - Edit
Transaction Engine.

The non-Codex worker loop no longer treats changed-file refs alone as
production success. Source edits now require an accepted runtime-owned edit
transaction that carries scope, snapshots, apply results, validation refs,
repair count, evidence refs, rollback refs, and raw-storage false flags.
File-edit adapter diagnostics, scheduler progress, and Work Queue readback
surface the transaction state.

Next pre-Product/Spec native-leap item:
`openclaw-convergence.native-leap-03-worker-controller-author-applicator-split`

- Worker Controller / Author / Applicator Split.

## 2026-05-18 Non-Codex Tool Worker Runtime Pre-Proof Blocker

The current active pre-Product/Spec blocker is now:

`openclaw-convergence.non-codex-tool-worker-runtime` - Non-Codex Tool Worker
Runtime And Patch-JSON Retirement.

The Product/Spec boundary replay reached real implementation nodes and invoked
the Kimi/non-Codex lane, but the lane still depended on a giant JSON patch
proposal. That is a parser choke point, not a Codex-parity worker loop.

The next implementation pass must make non-Codex workers use a production
runtime tool loop for inspect, context request, edit plan, patch application,
validation, failure classification, repair, evidence emission, and escalation.
The old patch-JSON proposal path must become test/compat only and cannot
produce production success.

Model-policy update: the non-Codex worker loop now uses explicit slots instead
of one Kimi model for every turn. Qwen3-Coder-Next is the cheap controller,
context-decision, validation-repair, evidence, and escalation lane. Kimi K2.6
is the patch lane with `reasoningMode: none`. Kimi patch/worker paths must not
use `reasoningMode: omit`; router/context-scout Qwen defaults still require
separate stage latency and valid-output gates before promotion.

Source-of-truth spec:
[Non-Codex Tool Worker Runtime](/projects/execution-platform/specs/non-codex-tool-worker-runtime).

## 2026-05-18 Native Agentic Coding Harness Convergence

The current active pre-Product/Spec block is now complete through:

1. `openclaw-convergence.native-harness-05-boundary-replay-checkpoints`

These items were added after Product/Spec replay diagnostics showed that the
runtime can accept context synthesis and a post-synthesis graph, but still
collapse into one broad foundation implementation node with weak process
supervision visibility. The source-of-truth spec is
[Native Agentic Coding Harness Convergence](/projects/execution-platform/specs/native-agentic-coding-harness-convergence).

Product/Spec Planning remains the near-term proof target, but it should not be
counted complete until the native harness can supervise model calls, compile
post-synthesis work into parallel dependency layers, run non-Codex workers as
native tool loops, execute validation as a real repair/evidence lane, and
resume from checkpointed replay boundaries without parallel proof-only code.

Completed in this slice:
`openclaw-convergence.native-harness-01-supervision-model-call-progress`.
Dynamic scheduler/model calls now emit bounded model-call progress spans,
RuntimeWorkerSupervisor records adapter start/completion/failure events, Work
Queue readback shows active model-call span state, and Product/Spec boundary
replay closes its Codex app-server client after replay model calls.

Completed in this slice:
`openclaw-convergence.native-harness-02-post-synthesis-parallel-supersteps`.
The scheduler now runs dependency-ready graph frontiers as bounded runtime
supersteps, applies conflict-domain locks, preserves completed sibling
branches during repair, rejects broad Codex post-synthesis chokepoints, defers
production coding closeout while executable graph nodes remain, and projects
parallel-frontier state into Work Queue readback.

Completed in this slice:
`openclaw-convergence.native-harness-03-non-codex-worker-convergence`.
The Kimi/non-Codex implementation lane now receives a canonical
`ImplementationTaskPacket v2` with worker rationale, expected output, bounded
target/denied scope, context handoff refs, source-prompt excerpt refs,
context-synthesis refs, prior node output refs, validation refs, evidence
claim kinds, stop/escalation rules, and budget policy refs. The production
coding runner passes this packet into the model-agnostic file-edit worker
adapter, the non-Codex tool loop validates worker readiness before provider
calls, missing context becomes an explicit context request path, and Work
Queue progress now surfaces non-Codex context requests, edit step ids, worker
tool refs, validation refs, changed-file refs, and evidence claim refs.

Completed in this slice:
`openclaw-convergence.native-harness-04-validation-executor-repair`.
Validation nodes now build canonical `ValidationTaskPacket` handoffs before
running commands, reject invalid validation packets before false success,
execute validation/QA through runtime tools, record bounded failure
classification and failure-to-commitment mapping refs, materialize same-job
repair graph nodes plus `validation_failed`/`repair_requested` edges, and
surface validation task/repair state in Work Queue readback.

Completed in this slice:
`openclaw-convergence.native-harness-05-boundary-replay-checkpoints`.
The dynamic coding runner now records bounded replay checkpoints at router,
Mission Ledger, packet author/review, context scout, context synthesis, graph
compile, worker execution, validation repair, review/readback, closeout, and
Work Queue readback boundaries. Checkpoints are idempotent, bind prompt/payload
hashes, graph/job/workflow identity, accepted/rejected/stale artifact refs,
continuation mode, safety/freshness policy, and raw-storage false flags. Replay
plans require the requested boundary plus required upstream checkpoints before
allowing continuation. Work Queue active graph readback surfaces boundary
checkpoint refs, graph checkpoint refs, replay plans, policy/freshness/safety
state, accepted/stale/rejected refs, and owner-readable summaries. The
production coding scheduler now also passes workflow `maxParallelNodeExecutions`
through to the Runtime Work Graph scheduler and can terminalize success from
runtime-owned graph completion when Mission Ledger commitments are satisfied
and model-authored closeout node evidence exists.

Next near-term proof target after the non-Codex tool worker blocker:
`openclaw-convergence.active-queue-34` - Product/Spec Planning Production
Upgrade via OpenClaw.

## 2026-05-17 Long-Task Budget And Progress Smoke Completion

Completed active DB Work Queue item:
`openclaw-convergence.pre-product-spec-05-long-task-budget-progress-smoke`.

Runtime evidence:

- workflow class: Product/Spec Planning-class scheduler smoke, no
  Product/Spec implementation executed.
- runtime job: `long-task-budget-progress-smoke-1779062209361-job`
- graph: `long-task-budget-progress-smoke-1779062209361-graph`
- Work Queue transition: `closed`
- budget policy:
  `runtime-task-budget://agent_team.product_spec_planning/planning_orchestrator/long_running`
- runtime tool timeout: `3600000` ms.
- active readback phase: `worker_model_call_waiting`.
- heartbeat state: `worker_waiting`.
- timeout proof invocation:
  `runtime-tool://runtime-tool-ef1f791f-0295-485e-8b3b-04ee9f1d584b`
- summary artifact:
  `.artifacts/execution-platform/long-task-budget-progress-smoke-summary.json`
- artifact index:
  `.artifacts/execution-platform/long-task-budget-progress-smoke-artifact-index.json`

The smoke proves that Product/Spec-class long-running work no longer collapses
to a 120-second tool window. Runtime task budget policy is derived from
workflow/capability/node context, passed into scheduler `worker.invoke`
runtime tool calls, and surfaced in Work Queue active graph readback with
timeout, progress, stale-progress, lease, heartbeat, elapsed, remaining, and
heartbeat-state fields.

The proof also exercised controlled timeout/abort behavior through the Runtime
Tool-Call Kernel. Timeout evidence is recorded as a bounded failed tool
invocation with `runtime_tool_timeout`; it does not become process success or
hide behind a generic worker failure.

No Product/Spec implementation ran in this pass. No real model calls were
made. No raw prompt/response/log/DB row storage was used. No deploy, outbound
send, model promotion, authority grant, gateway rebuild/reload, gateway env
change, or UI Work Queue lifecycle mutation occurred.

The next active DB Work Queue item is now:

`openclaw-convergence.active-queue-34`

- Product/Spec Planning Production Upgrade via OpenClaw.

## 2026-05-17 Context Scout Tool Loop Runtime Completion

Completed active DB Work Queue item:
`openclaw-convergence.pre-product-spec-01-context-scout-tool-loop`.

Runtime evidence:

- workflow: `agent_team.coding`
- runtime job: `context-scout-tool-loop-1779050661524`
- Work Queue transition: `closed`
- proof artifact:
  `.artifacts/execution-platform/context-scout-tool-loop-validation-proof.json`
- summary artifact:
  `.artifacts/execution-platform/context-scout-tool-loop-summary.json`

Product/Spec Planning remains the near-term proof target, but the full proof
should follow the remaining P0 pre-proof items from
[Pre-Product/Spec Assumption Audit](/projects/execution-platform/specs/pre-product-spec-assumption-audit).

Next active DB Work Queue item:
`openclaw-convergence.pre-product-spec-02-model-facing-staged-scheduler-tools`

- Model-Facing Staged Scheduler Tool Protocol.

## Closeout Finalization Toolchain

Completed active DB Work Queue item:
`openclaw-convergence.toolification-19-closeout-finalization-tools`.

Closeout finalization is now a first-class Runtime Tool-Call Kernel operation.
The live gateway registers closeout finalization tools for evidence packet
collection, Mission Ledger completion review, workflow evidence profile
review, validation/QA evidence review, tool trace coverage review, Work Queue
readback review, maximality review, finalization handoff compilation, accept
finalization, and reject finalization.

Completed changes:

- closeout finalization runtime tool family added: `closeout.finalize`.
- production dynamic coding-team success now requires an accepted closeout
  finalization evidence packet before `cleanSuccessAccepted` can be true.
- the evidence packet binds Mission Ledger refs, workflow profile refs,
  validation/QA refs, runtime tool refs, Work Queue readback refs,
  model-authored Closeout Capsule refs, completion-review refs, open
  commitment state, and raw-storage/authority/lifecycle flags.
- degraded/system closeout, bare `create_closeout`, and process completion
  are diagnostic-only and cannot satisfy clean production success.
- Work Queue active graph readback surfaces closeout finalization state,
  evidence packet refs, handoff refs, tool invocation refs, accept/reject
  refs, missing reason codes, maximality summary, limitations, ELI5, and
  recommended next action.
- runtime toolification truth registry marks
  `closeout-finalization-toolchain` as `production_primary`.

Validation:

- `pnpm test:file extensions/execution-platform/src/codex-bridge/closeout-finalization-runtime-tools.test.ts`
- `pnpm test:file extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts`
- `pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts`
- `pnpm test:file extensions/execution-platform/src/runtime-tool-call/runtime-tool-adoption-boundary.test.ts`
- `pnpm test:file extensions/execution-platform/src/workflows/validation-qa-runtime-tools.test.ts`
- `pnpm tsgo:full`

Next active DB Work Queue item:
`openclaw-convergence.active-queue-34` - Product/Spec Planning Production
Upgrade via OpenClaw.

## Generic Staged Scheduler Protocol

Completed active DB Work Queue item:
`openclaw-convergence.generic-staged-scheduler-protocol`.

The generic orchestration runtime now requires production workflow plugins and
live scheduler options to opt into the staged scheduler protocol before they
can create executable graph nodes. For production `agent_team.coding` and
`agent_team.product_spec_planning`, model output supplies staged intent
(`workBreakdownUnits`, `capabilitySelectionsForWorkUnits`,
`nodeContractDrafts`, and `edgeOrParallelismDraft`) while runtime compiles the
canonical node envelope, executor key, worker ref, qualification refs, and
expected evidence from the capability manifest and workflow policy.

Completed changes:

- production workflow plugin readiness now fails if staged scheduler protocol,
  staged graph acceptance, runtime-derived node envelopes, runtime-derived
  expected evidence, model-authored structure review, first-node approval, or
  simple-only direct implementation policy are missing.
- `GenericOrchestrationRuntime.runSchedulerGraph(...)` refuses production
  scheduler execution unless options explicitly require the generic staged
  protocol.
- `RuntimeWorkGraphScheduler` rejects production node creation that bypasses
  the staged compiler or asks models to author runtime-owned expected evidence.
- scheduler runtime tools now trace mission readiness, commitment packet
  readiness, capability shortlisting, node-result review, repair/escalation
  classification, closeout readiness, and completion readiness.
- Work Queue readback exposes staged scheduler policy fields on workflow
  plugin resolution metadata.
- the production dynamic coding-team path passes the staged protocol option
  into the generic runtime, and its production-path test fixture now uses
  staged intent instead of hand-authored executable node envelopes.

Validation:

- `pnpm test:file extensions/execution-platform/src/workflows/generic-orchestration-runtime.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/agent-team-coding-plugin.test.ts extensions/execution-platform/src/workflows/product-spec-planning-plugin.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts extensions/execution-platform/src/runtime-tool-call/runtime-tool-call.test.ts`
- `pnpm tsgo:full`
- `node scripts/run-oxlint.mjs extensions/execution-platform extensions/model-memory src/gateway src/auto-reply src/agents src/infra scripts ui/src/ui`
- `git diff --check`
- docs trailing whitespace check

Known validation note:

- Full-repo `pnpm format:check` is blocked by 40 unrelated formatting issues
  outside this pass. This pass did not bulk-format unrelated files.

Next active DB Work Queue item:
`openclaw-convergence.generic-node-executor-evidence-contract` - Generic Node
Executor And Evidence Claim Contract.

## Generic Orchestration Runtime Engine

Completed active DB Work Queue item:
`openclaw-convergence.generic-orchestration-runtime-engine`.

The scheduler-backed coding-team path now passes through a canonical
workflow-agnostic runtime boundary before running `RuntimeWorkGraphScheduler`.
The new `GenericOrchestrationRuntime` validates workflow definition/plugin
readiness, requires the Runtime Tool-Call Kernel for production workflows,
runs scheduler execution through `runSchedulerGraph(...)`, rejects scheduler
success without graph evidence, and records bounded
`execution.generic_orchestration_runtime_result` artifacts.

Owner readback now surfaces generic orchestration runtime status, scheduler
status, graph id, executed/added node ids, scheduler decision refs, and reason
codes. The lower-level Runtime Workflow Graph Engine remains the readiness
resolver inside this runtime, not a competing workflow path.

Validation:

- `pnpm test:file extensions/execution-platform/src/workflows/generic-orchestration-runtime.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts`
- `pnpm tsgo:full`

Next active DB Work Queue item:
`openclaw-convergence.generic-staged-scheduler-protocol` - Generic Staged
Scheduler Protocol.

## Product/Spec Pre-Proof Observability Hardening

Completed after the failed direct Product/Spec replay.

The Product/Spec proof is not yet rerun. Before rerun, the platform now fixes
the owner-visible gaps that made the prior run hard to diagnose:

- active graph progress preserves active-node objective/model/rationale even
  after Work Queue child sync events.
- Mission Ledger readback includes `whyItMatters` and expected evidence
  descriptions per commitment.
- commitment work-packet summaries are surfaced in active graph progress.
- role invocation progress carries bounded model, target, acceptance, and
  evidence refs.
- the direct replay harness streams periodic bounded progress and no longer
  waits until final summary.
- advanced router defaults use GPT 5.5 via Codex app-server policy.

Next step remains the Product/Spec Planning Production Upgrade proof through
the exact runtime path. Success still requires runtime graph execution,
source edits, validation, Mission Ledger commitment closure, and model-authored
closeout.

## Staged Scheduler Tool Protocol And Maximum Toolification Compiler

Completed pre-proof blocker:
`openclaw-convergence.staged-scheduler-tool-protocol`.

The production scheduler no longer asks the orchestrator to hand-author a full
executable graph envelope for complex work. The model supplies staged intent:
work units, capability selections, node contracts, and edge/parallelism
rationale. Runtime compiles canonical node kinds, executor keys, worker refs,
qualification refs, and expected evidence.

Completed changes:

- staged compiler support in `orchestrator-graph-decision.ts`.
- production scheduler tool traces for draft work breakdown, capability
  selection, node contracts, edge/parallelism, graph compilation, structure
  review, staged acceptance, and first-node approval.
- `agent_team.coding` orchestrator prompt updated away from runtime-owned
  schema fields and toward staged tool protocol fields.
- legacy production acceptance through `scheduler.decompose_mission` removed
  from the accepted complex decomposition path.
- Product/Spec lane proof accepted a planning-orchestrator-first graph with a
  web research handoff and no implementation execution.

Validation:

- `pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts extensions/execution-platform/src/workflows/orchestrator-graph-decision.test.ts`
- `pnpm tsgo:fast`

Next owner-visible item:

`openclaw-convergence.active-queue-34` - Product/Spec Planning Production
Upgrade via OpenClaw.

## Owner-Turn Heartbeat And Prompt Transport Hardening

Completed pre-proof blocker:
`openclaw-convergence.owner-turn-heartbeat-prompt-transport-hardening`.

The latest Product/Spec Planning UX resubmission is not counted as a proof:
it was accepted into the main chat lane but did not create runtime work before
a heartbeat/proactivity turn took over the session.

The generic fix is now in place:

- accepted owner `chat.send` turns register owner-turn activity immediately.
- heartbeat/proactivity skips the base session and isolated heartbeat sibling
  while owner work is active, even if command queues are momentarily empty.
- owner-turn records expire by TTL if a process crashes.
- OpenClaw UX prompt submission now has a file/stdin based transport script
  that handles long prompts, code fences, template-string backticks, shell
  quotes, and `${...}` examples as data instead of executable wrapper source.
- scheduler orchestrator instructions now align with the compiler contract:
  models choose capability/objective/rationale/commitment mapping; runtime
  derives node kind, executor key, evidence enums, and other runtime-owned
  fields.

Product/Spec Planning is no longer the immediate next owner-visible active
queue item. The most recent proof attempts showed that the scheduler still
asks for too much executable graph schema in one model decision. The new
pre-proof blocker is:

`openclaw-convergence.staged-scheduler-tool-protocol` - Staged Scheduler Tool
Protocol And Maximum Toolification Compiler.

That item must replace single-shot decomposition JSON with staged scheduler
tools before Product/Spec Planning is rerun.

Follow-up diagnosis completed:

- `scripts/openclaw-submit-prompt-via-ux.mjs --prompt-file` is the same
  browser/textarea/send-button UX path as manual input; it only changes the
  prompt byte source from shell/paste to UTF-8 file data.
- the next proof should run a short dispatch/hash smoke after rebuild before
  submitting the full Product/Spec prompt.
- a new post-proof architecture spec,
  `specs/runtime-parallelism-and-contract-boundaries.md`, records how to move
  from conservative owner-turn suppression to lane/conflict-domain scheduling,
  parallel child graph execution, Work Queue visibility, and model-contract
  compiler consolidation.
- those parallelism/contract items are now Work Queue follow-ups after
  Product/Spec Planning; they should not delay the next proof.

## Capability/Subject Routing Split

Completed pre-proof blocker:
`openclaw-convergence.capability-subject-routing-split`.

The Intent Front Door now separates executor workflow from target subject
workflow. Long prompts that ask the system to implement, wire, test, or
document a workflow surface should route to the executor that has those
capabilities, normally `agent_team.coding`, while carrying the target workflow
as `subjectWorkflowIds` / `targetSubjectRefs`.

This is a general structural contract, not a Product/Spec-specific prompt
heuristic:

- model output chooses executor, subject, capabilities, and constraints.
- deterministic validation checks workflow id conflicts and executor
  capability support.
- native submit can run one bounded repair for executor/capability mismatch.
- Work Queue readback shows the split for diagnostics.

Focused tests and the native submit proof passed. Product/Spec Planning remains
the next owner-visible active queue item.

## Canonical Workflow Runtime Refactor Path

The current execution focus is the pre-Product/Spec Planning architecture
cleanup needed to prevent another proof-shaped run:

1. Workflow Evidence Profiles And Tool Trace Readback Hardening. **Complete.**
2. Canonical Workflow Runtime Engine And Workflow Definition Registry. **Complete.**
3. Coding Team Plugin Extraction From Dynamic Runner. **Complete.**
4. Generic Workflow Runner Production Retirement. **Complete.**
5. Work Queue Generated Item Lifecycle And Proof Child Cleanup. **Complete.**
6. Capability/Subject Routing Split. **Complete.**
7. Staged Scheduler Tool Protocol And Maximum Toolification Compiler.
8. Product/Spec Planning Production Upgrade via OpenClaw.

Staged Scheduler Tool Protocol is now the next owner-visible active queue
item. Product/Spec Planning follows it. The target architecture is one
canonical workflow graph engine with workflow definitions/plugins. Graph nodes
are still executed by the individual agents/workers/tools/human adapters; the
engine schedules, records evidence, enforces Mission Ledger/closeout gates,
reconciles generated children, and updates Work Queue readback.

## Work Queue Generated Item Lifecycle

Completed DB Work Queue item:
`openclaw-convergence.work-queue-generated-item-lifecycle`.

This item landed before the Product/Spec Planning proof. It introduced
first-class generated-item origin and terminal policy so proof diagnostics,
middleware fixtures, and transient graph helper rows do not remain in the
owner active queue as stale `needs_review` work.

Cleanup result:

- 9 middleware proof live-completion items archived as `middleware_fixture`
  / `debug_only`.
- 20 Generic Workflow Runner retirement proof children archived as
  `proof_diagnostic` / `debug_only`.

The cleanup was repository/server driven and preserved bounded debug evidence.
The owner active queue now starts at
`openclaw-convergence.active-queue-34` Product/Spec Planning Production
Upgrade.

## Dedicated Runtime DB Boundary

Update on 2026-05-15: the live Execution Platform runtime/Work Queue substrate
has been moved off Model Memory reuse and onto a dedicated
`execution_platform` database.

- source: `config.env.vars.EXECUTION_PLATFORM_DATABASE_URL`
- boundary: `dedicated_execution_platform_db`
- readiness: `ready`
- Work Queue live linkage may attach
- gateway restarted after config change; local/Tailscale health passed

This closes the prior Model Memory fallback identity blocker. The next
execution focus remains the Runtime Toolification pre-proof queue.

## Runtime Toolification Pre-Proof Queue

The current execution focus is no longer another immediate Product/Spec
Planning proof. The next queue block hardens the runtime path that proof
depends on:

- runtime tool-call kernel and traces. **Complete.**
- cost-aware capability policy. **Complete.**
- scheduler toolification with split planning/execution. **Complete.**
- worker tool loops for Kimi/Codex. **Complete, with worker-loop v2 proof.**
- non-Codex large-task decomposition and file-edit qualification. **Complete.**
- Mission Ledger evidence claims and finalization handoff. **Complete.**
- Work Queue tool/event readback. **Complete.**
- Runtime Toolification Truth Registry And Adoption Gate. **Complete.**
- Model Call Toolification And Model Task Middleware Collapse. **Complete.**
- Script And DB Operation Toolification. **Complete.**
- Closeout Toolification And Legacy Retirement Soak. **Complete.**

Workflow Evidence Profiles And Tool Trace Readback Hardening and Canonical
Workflow Runtime Engine And Workflow Definition Registry are now complete.
The current next DB Work Queue item is Coding Team Plugin Extraction From
Dynamic Runner. Closeout generation is now a Runtime Tool-Call Kernel path;
degraded/system closeout is diagnostic-only and cannot satisfy clean
production success, and workflow success must pass an accepted workflow
evidence profile evaluation plus the workflow definition/completion-review
gates.

Runtime Tool-Call Kernel And Trace Store completed on 2026-05-15. The next
Cost-Aware Capability Policy completed on 2026-05-15. A follow-up kernel
hardening proof also passed: executor timeout/abort, explicit cancel, terminal
idempotency, cursor pagination, scoped retention pruning, and adoption boundary
mapping are now production kernel capabilities.

Scheduler Toolification And Split Planning/Execution completed on
2026-05-16. Runtime scheduler decisions now emit Runtime Tool-Call Kernel
traces for decomposition, graph node/edge creation, decomposition acceptance,
next-node selection, human/needs-review/closeout requests, and `worker.invoke`
node execution. The live gateway runtime constructs and passes the scheduler
tool kernel into `agent_team.coding`, and Work Queue active graph readback
shows scheduler tool phase, latest tool id, and invocation refs.

The proof run closed DB Work Queue item `openclaw-convergence.active-queue-22`
from accepted runtime closeout evidence. The next active DB Work Queue item is
Worker Tool Loops And Non-Codex File-Edit Worker / Kimi Implementation Lane
Hardening.

Worker Tool Loops And Non-Codex File-Edit Worker / Kimi Implementation Lane
Hardening completed on 2026-05-16. The non-Codex file-edit worker loop now
records first-class Runtime Tool-Call Kernel traces for file context
inspection, edit planning, patch proposal, patch application, validation,
repair/failure classification, escalation when needed, and final bounded
evidence handoff. The Kimi lane receives bounded file snapshots and
orchestrator-style microtask packets, retries with bounded failure feedback,
and rolls failed attempts back before repair so partial edits cannot leak into
the main worktree. A live OpenRouter/Kimi proof made scoped source edits,
passed focused validation, and closed DB Work Queue item
`openclaw-convergence.active-queue-21` from accepted closeout evidence.

The next active DB Work Queue item is Mission Ledger Evidence Claims And
Finalization Handoff.

Non-Codex Worker Loop v2 completed on 2026-05-16. The Kimi lane now supports
model-authored bounded context expansion requests, multi-step edit plans,
validation-driven repair after context expansion, and commitment-linked
evidence claims. A live OpenRouter/Kimi proof requested bounded context,
edited `kimi-live-source-edit-proof.ts` and its focused test, repaired after
a controlled validation failure in the same worker run, emitted runtime tool
traces for context/plan/patch/validation/repair/evidence, and closed DB Work
Queue item `openclaw-convergence.non-codex-worker-loop-v2` from accepted
runtime closeout evidence.

Model-Agnostic Non-Codex Worker Loop completed on 2026-05-16. The worker
substrate now has a generic specialization manifest and phase-event contract,
with Kimi as the first production implementation specialization. The live
OpenRouter/Kimi proof used repo search/read/test-inspection tools, emitted 15
bounded phase events, applied a fresh source edit, repaired after a controlled
validation failure, passed focused validation, and closed DB Work Queue item
`openclaw-convergence.non-codex-tool-using-worker` from accepted runtime
closeout evidence.

Model-Agnostic Worker Multi-Model Qualification completed on 2026-05-16. The
generic worker substrate now has a live qualification matrix instead of
implicit trust by model name. Kimi is production-qualified for
`small_source_edit`; DeepSeek v4 Flash is production-qualified for
`repo_context_scout` and `validation_failure_explanation`; DeepSeek v4 Pro is
only candidate for `test_writing_edit` until it produces real source-edit
evidence. Cost-aware scheduler decisions now require model qualification
profile/evidence refs for production model-agnostic worker selection. DB Work
Queue item `openclaw-convergence.model-agnostic-worker-qualification` closed
from accepted runtime closeout evidence.

Non-Codex Large-Task Decomposition And File-Edit Qualification completed on
2026-05-16. The scheduler now has a reusable non-Codex decomposition policy
that rejects broad Codex implementation as the first move for complex coding
missions, requires qualified task-family metadata/evidence for production
non-Codex selections, preserves qualification fields through the orchestrator
decision compiler, and uses capability executor keys so specialized nodes can
run through their actual executors instead of generic role fallbacks. The
dedicated-DB proof rejected an invalid broad Codex-first plan, repaired to a
four-node graph with context, Kimi implementation, validation explanation, and
review nodes, recorded three handoff edges, materialized four DB Work Queue
child items, and closed DB Work Queue item
`openclaw-convergence.non-codex-large-task-decomposition` from accepted
runtime closeout evidence.

Mission Ledger Evidence Claims And Finalization Handoff and Work Queue
Tool/Event Readback completed on 2026-05-16. Scheduler node results now carry
commitment-linked evidence claims, production `agent_team.coding` requires
those claims for Mission Ledger evaluation, and Work Queue owner readback
renders runtime graph/tool progress from DB-backed scheduler events. The
dedicated-DB proof closed
`openclaw-convergence.toolification-05-mission-ledger-evidence-finalization`
and `openclaw-convergence.toolification-06-work-queue-tool-event-readback`
from accepted runtime closeout evidence.

Runtime Toolification Truth Registry And Adoption Gate completed on
2026-05-16. The registry now records toolification truth by surface, including
production-primary, queued, compatibility-only, blocked, and live-UX-proven
states. The adoption gate accepts only bounded evidence refs, runtime-tool
invocation refs, Work Queue readback refs, live UX refs when required, and
closeout refs. It rejected a deliberate Product/Spec Planning live-UX
overclaim until a real live proof exists. The hardening pass made the legacy
adoption boundary map registry-derived, made registry Work Queue readback
derive from canonical registry truth for the registry item, guarded direct
proof-script execution with an actionable `tsx` command, and made
toolification Work Queue closeout require accepted adoption-gate evidence.
DB Work Queue item
`openclaw-convergence.toolification-07-truth-registry-adoption-gate` remains
closed from accepted runtime closeout evidence.

Model Call Toolification And Model Task Middleware Collapse completed on
2026-05-16. Live model-task provider calls now execute as `model.call`
Runtime Tool-Call Kernel invocations. The model-task repository is the
contract/validation/readback facade; provider prompts are volatile executor
input, and the trace store persists only bounded refs, hashes, model/provider
refs, usage, status, and raw-storage flags. Work Queue readback now surfaces
model-task runtime tool invocation refs. DB Work Queue item
`openclaw-convergence.toolification-08-model-call-toolification` closed from
accepted adoption-gate evidence after a real Codex app-server JSON model call.
The post-completion hardening pass made the kernel mandatory for live
model-task completion, rejected provider-call success claims without
`model_task.runtime_tool_trace` evidence, kept fixture pilots provider-free,
and fixed proof cleanup so the shared Codex app-server executor is closed.

Script And DB Operation Toolification completed on 2026-05-16. Live script
jobs and DB operations now execute through `script.execute` and
`db_operation.execute` Runtime Tool-Call Kernel invocations. The script-job
and DB-operation repositories remain the contract/lifecycle/readback facades,
but clean production completion now requires runtime tool trace artifacts when
the live completion path marks trace evidence required. Work Queue middleware
readback surfaces script and DB operation runtime tool invocation refs. DB
Work Queue item `openclaw-convergence.toolification-09-script-db-toolification`
closed from accepted adoption-gate evidence after live dedicated-DB script and
DB operation proofs.

The follow-up hardening pass removed the risky ambiguity around old fixture
and lower-level worker paths:

- RuntimeWorkerSupervisor script/DB middleware adapters now run through
  `script.execute` and `db_operation.execute`.
- direct model-task supervisor completion without `model.call` trace evidence
  becomes `needs_review`.
- the in-process `ScriptJobWorkerAdapter` and script/DB middleware pilot
  helpers require explicit `proofOnly: true`; missing that guard fails fast.
- Model Memory runtime middleware bridge provider/DB evidence jobs now use
  `model.call` and `db_operation.execute` runtime tool traces.

Workflow Evidence Profiles And Tool Trace Readback Hardening completed on
2026-05-16.
Additional model qualification items remain for docs/spec edit, test-writing
edit, and frontend scoped edit lanes before those roles can be selected as
production file-edit workers.

Closeout Toolification And Legacy Retirement Soak completed on 2026-05-16.
`closeout.generate` now wraps the model-first Closeout Capsule reporter,
records bounded Runtime Tool-Call Kernel traces, and rejects degraded/system
closeout as clean success. The production gateway registers
`closeout.generate`, and the dynamic coding-team graph closeout executor uses
the tool when a Runtime Tool Kernel is present. DB Work Queue item
`openclaw-convergence.toolification-10-closeout-generate-toolification` closed
from accepted adoption-gate evidence after a real Codex app-server model
closeout.

Workflow Evidence Profiles And Tool Trace Readback Hardening completed on
2026-05-16. Workflow-specific evidence profiles are now production gates and
Work Queue readback objects. `agent_team.coding` success requires accepted
profile evidence; generic queued workflow dispatch cannot complete from
model-authored closeout alone; degraded/system closeout remains
diagnostic-only. The dedicated-DB proof closed
`openclaw-convergence.toolification-11-workflow-evidence-profiles-readback`
from accepted adoption-gate evidence.

The next DB Work Queue item is Canonical Workflow Runtime Engine And Workflow
Definition Registry.

## Product/Spec Planning Production Runtime Surface

This slice upgrades Product/Spec Planning from protected registry/proof wiring to production scheduler/readback behavior.

2026-05-17 update: Product/Spec Planning is now production-ready in the
canonical workflow definition registry and registered in the workflow plugin
registry as `workflow-plugin.agent_team.product_spec_planning.v1`. Runtime
Workflow Graph Engine readiness requires the plugin, scheduler executor keys,
and runtime-tool kernel; the generic workflow queued runner remains a rejection
shim for this workflow.

Scope in this repo pass:

- scheduler policy: Product/Spec Planning executable graph work starts with `planning_orchestrator`
- workflow plugin policy: Product/Spec Planning executor keys map planner,
  research, capsule, human decision, proposal, compiler, and closeout nodes to
  executable scheduler nodes
- contract policy: ResearchBriefs carry bounded source/citation/assumption/freshness/staleness evidence without raw storage
- readback policy: Work Queue owner readback shows capsule, research, human decision options plus pending/accepted/rejected/not-required state, action proposal, compile readiness, validation, bounded Mission Ledger evidence state, active graph/progress, limitations, ELI5 state, and explicit evidence buckets for workflow registration, executable node mapping, orchestrator-first proof, compile-readiness validation, and commitment evidence claim refs

## Context Supply Chain And Context Scout Tool Loop

2026-05-17 update: the scheduler-backed coding-team path now has a bounded
source-prompt context chain before implementation.

- source prompts are indexed into bounded section refs and summaries.
- context scout may request exact bounded prompt excerpts by section ref.
- excerpt provision/denial is traced through Runtime Tool-Call Kernel
  `source_prompt.*` tools.
- excerpt text is volatile child-worker input only; artifacts store hashes,
  refs, bounded summaries, and raw-storage flags.
- context scout output becomes a `ContextHandoffPacket` with verified file
  refs, recommended edit points, risks, validation suggestions, and
  implementation handoff summary.
- implementation nodes that require upstream context handoff stop as
  `needs_review` if the handoff packet is missing.
- Work Queue readback surfaces prompt hash/length/status, section refs,
  excerpt decisions, verified context file refs, context handoff refs, and
  context blockers.

The next Product/Spec Planning proof should stop before implementation if
Mission Ledger, CommitmentWorkPacket, source-prompt context, or
ContextHandoffPacket evidence is not strong enough for delegated workers.

## Generic Orchestration Substrate

2026-05-17 update: coding-team orchestration is no longer the only place that
defines the durable orchestration contract.

- `WorkflowDefinition` now carries a canonical `WorkflowOrchestrationPolicy`
  with required phases, role classes, context needs, source-prompt policy,
  capability utility policy, human decision policy, finalization/readback
  refs, and raw-storage flags.
- coding and Product/Spec Planning workflow plugins expose those policy refs,
  phases, role classes, and context needs to plugin resolution and Work Queue
  readback.
- web research, docs/skills, QA/test, architecture, design, and marketing are
  registered against the same contract. They remain migration-state workflows
  until executable scheduler plugins exist.
- scheduler node execution validates generic node-result shape and evidence
  claims before accepting node success.

This slice generalizes the Mission Ledger -> commitment packets -> context
supply -> staged scheduler -> node executors -> evidence claims ->
closeout/readback model for future workflows. It does not complete the
Product/Spec Planning workflow implementation proof by itself.

## Generic Orchestration Runtime Spec

2026-05-17 update: the next execution phase is now explicitly split into the
generic runtime spine before Product/Spec Planning proof.

Source-of-truth spec:

- `docs/projects/execution-platform/specs/generic-orchestration-runtime.md`

Active sequence:

1. Generic Orchestration Runtime Engine.
2. Generic Staged Scheduler Protocol.
3. Generic Node Executor And Evidence Claim Contract.
4. Product/Spec Planning Workflow Plugin Production Proof.
5. Starter Workflow Plugin Migration.
6. Future Team Workflow Readiness.

The next prompt should execute item 1. Product/Spec Planning should not run
again until items 1-3 are live, wired, tested, and closed.
