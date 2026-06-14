---
summary: "Refined native OpenClaw agent runtime architecture: one shared runtime core with typed execution envelopes."
title: "OpenClaw Native Agent Runtime Core And Envelopes"
---

# OpenClaw Native Agent Runtime Core And Envelopes

This document is a durable, verbatim record of the runtime-core/envelope proposal produced during the native agentic orchestration refactor.

Yes. This is the right first-principles architecture, with one tightening: `AgentRuntimeCore` should be the shared engine, but it should orchestrate shared services rather than becoming another god object. The execution envelopes own lifecycle policy; the runtime core owns agent mechanics.

**Updated Proposal: OpenClaw Native Agent Runtime Core And Typed Execution Envelopes**

**Core Direction**

OpenClaw should have one shared agent runtime core and multiple typed execution envelopes.

Final shape:

```text
Envelope -> AgentRunExecutor -> AgentRuntimeCore -> Provider / Tools / Transcript
```

Native execution:

```text
RuntimeJob
-> NativeExecutionWorkerSupervisor
-> AgentRunExecutor
-> AgentRuntimeCore
-> node_finish / artifacts / RuntimeJob terminal state
```

Chat:

```text
HTTP/chat
-> CommandQueue
-> AgentRunExecutor
-> AgentRuntimeCore
-> user transcript / chat response
```

Proof:

```text
Proof harness
-> native RPC start
-> native RPC status
-> native RPC control
-> assertions
```

The final form is not parallel chat agents and execution agents. It is one shared agent engine, with typed envelopes that own lifecycle policy.

**Architectural Correction**

The execution orchestrator should remain an OpenClaw-native agent profile/session surface, not a new deterministic workflow brain.

But the shared runtime pieces are valid infrastructure:

- `AgentRunExecutor`
- `AgentRuntimeCore`
- `PromptService`
- `ToolRuntime`
- `TranscriptStore`
- `ContextPressure/CompactionService`
- `ModelAuthService`
- `ProviderClient`
- `RuntimeEventSink`

Those are not orchestration products. They are the common machinery every envelope uses.

The old mistake was duplicating agent mechanics across chat, proof, native runtime, and worker paths. The correction is not "no runtime infrastructure." The correction is "one runtime infrastructure, many thin envelopes."

**AgentRuntimeCore Responsibilities**

`AgentRuntimeCore` should run an agent turn. It should not know whether the turn came from chat, native execution, proof, cron, or a child task.

It should orchestrate shared services for:

- model/provider request lifecycle
- prompt composition
- tool catalog construction
- tool execution
- context accounting and compaction
- auth/model resolution
- transcript append/read primitives
- cancellation observation
- LSP/edit/read/grep behavior
- bounded runtime events

It should not:

- discover workspace/session paths
- decide scheduler queues
- infer session storage conventions
- mutate `RuntimeJob` state directly
- know whether it is running chat/native/proof/cron
- own Work Queue lifecycle
- own proof assertions
- own foreground command serialization

**Envelope Responsibilities**

Envelopes supply lifecycle policy and storage roots. They do not reimplement agent mechanics.

The chat envelope owns:

- interactive UX
- command-lane serialization
- user-visible session history
- foreground transcript conventions

The native execution envelope owns:

- `RuntimeJob` lifecycle
- claims, leases, cancel, terminal state
- runtime-owned transcript path
- evidence artifacts
- node/session closeout
- Work Queue linkage

The proof envelope owns:

- start
- status
- control
- artifact assertions

It must not execute the job itself.

Future cron/background envelopes own:

- schedule trigger
- schedule policy
- retry policy

They must not fork provider/tool/prompt/session logic.

**AgentRunRequest Schema**

A normalized `AgentRunRequest` should stay small:

```ts
{
  (agentId,
    input,
    promptProfile,
    toolPolicy,
    modelProfile,
    workspace,
    transcript,
    eventSink,
    abortSignal,
    metadata);
}
```

Everything else should be derived by shared services.

Do not add:

- route
- workflow id
- requirement map
- semantic priority
- graph patch fields
- target domain
- executor hint
- success criteria schema
- scheduler graph controls
- evidence ref choreography

The request should say who is running, what input they received, what profile/tool/model/workspace/transcript/event/cancel context applies. It should not become a second workflow object.

**Path Model**

Collapse caller-visible path concepts to four roots:

- `canonicalSourceRoot`
- `runtimeWorkspaceDir`
- `transcriptRoot`
- `artifactRoot`

No hidden convention that sessions live beside `agentDir`.

No native job should assume source-backed agent assets are writable. Native transcripts belong under runtime-owned state. Agent assets may be mounted read-only or root-owned.

Internal services can compute gateway-visible/readable/executable paths if needed, but those should not leak into ordinary agent runtime contracts or proof payloads.

**Scheduler And Executor**

The biggest remaining risk is creating a second scheduler while escaping the first one.

`AgentRunExecutor` must stay narrow:

- normalize/admit an `AgentRunRequest`
- acquire required locks
- observe cancellation
- call `AgentRuntimeCore`
- emit typed lifecycle phases
- return a bounded result

It must not become:

- a workflow engine
- a planner
- a scheduler graph
- a retry framework
- a RuntimeJob state machine

`RuntimeJob` remains lifecycle truth.

The native runtime worker/supervisor dispatches jobs. The command queue remains only for foreground chat serialization. Native execution should not use the global foreground command lane.

**Locks And Cancellation**

Native jobs can bypass the foreground command lane, but they still need native session/workspace locking.

Lock ordering should be explicit:

```text
claim RuntimeJob
-> acquire native session/workspace lock
-> launch agent
-> append transcript/runtime events transactionally
-> never hold DB/file transactions across provider waits
-> release lock correctly
```

Abort must be observed in:

- scheduler wait
- session/workspace lock wait
- model/auth preparation
- context runtime initialization
- provider request
- tool execution
- validation child tasks
- compaction
- finish/closeout

If any pre-model wait ignores cancellation, cancellation remains partly cosmetic.

**TranscriptStore**

Transcript handling should be one shared service.

The envelope passes transcript roots and policy. The core uses `TranscriptStore`.

Chat gets chat transcript roots. Native execution gets runtime-owned transcript roots. Proof gets no private transcript path logic.

This avoids duplicated assumptions like:

```text
sessions live beside agent assets
```

That convention already failed under native execution.

**Typed Events And Status**

Replace business logic around arbitrary stage strings with a small typed lifecycle.

Useful phases:

- `job_claimed`
- `scheduler_waiting`
- `scheduler_entered`
- `agent_bootstrap`
- `provider_preparing`
- `provider_request`
- `model_active`
- `tool_active`
- `compacting`
- `finishing`
- `terminal`

Display labels can be strings. Logic should use typed phases.

Status should be a projection of `RuntimeJob` events, not its own state machine.

Live status should stay compact:

- runtime job id
- runtime job state
- current phase
- latest launch phase
- model activity seen
- provider request seen
- latest meaningful event age
- bounded recent events
- raw-storage safety flags

Do not return raw prompts, raw provider logs, raw tool bodies, full job payloads, or proof-only internals.

**Proof Harness**

The proof harness should be start/status/control only.

Canonical proof path:

```text
native RPC start
native RPC status polling
native RPC control if needed
artifact assertions
```

No long-running HTTP execution. No source imports. No cold fallback. No `runOnce` as canonical proof execution.

Cold source scripts can remain only as explicit developer diagnostics, not as the proof path.

After native proof coverage is stable, retire/delete long-running `run-once` compatibility surfaces and migrate callers to resident native RPC start/status/control.

**Finish And Evidence Closure**

`node_finish` should be runtime-owned evidence closure, not model-owned ref choreography.

The model supplies:

- intent
- status
- summary
- maybe explicit notes

Runtime auto-attaches:

- changed files from mutation events/git diff
- validation evidence from validation scout task results
- diagnostics/artifact refs from the node run
- child session results
- runtime job refs
- node snapshot/state refs where needed

If evidence exists in the run, `node_finish` should attach it and accept.

If real evidence is missing, reject once with an executable correction.

After repeated evidence-shape failures, terminalize as `needs_review` rather than looping.

**Requirement Hydration**

Do not preserve `RequirementMap` just because it exists.

For execution, use:

- native session input
- refs
- todo/update_plan
- tool calls
- runtime events
- artifacts
- Work Queue projection

If the user says "execute the next work queue item," the orchestrator should fetch the item and relevant linked docs, then start/resume an execution session with a concise work message and refs.

If the user gives an undocumented feature request, the main/orchestrator can run a planning session first, then launch a coding session. That still does not require a durable RequirementMap abstraction.

Requirement hydration is only justified if it proves value beyond native session/todo/tool/event state. The default should be deletion/retirement.

**Critique And Higher Reasoning**

The system needs recursive critique, but it should be agentic, not deterministic.

Use native child sessions/handoffs for critique:

- architecture review before high-risk implementation
- plan review before launching workers
- implementation review before finish
- repair review after failed validation
- local-rule review when memory/context says a project-specific architectural decision is at risk

Critic context should include:

- project rules
- architecture decisions
- relevant memory/context packets
- current plan or diff
- known risk questions

Examples of critic prompts:

- Are there brittle spots?
- Are there too many moving parts?
- Can schema fields be reduced?
- Is this wired through native OpenClaw architecture?
- Are we creating another parallel system?
- Is there a simpler, more powerful design?

The critic should produce decision-oriented feedback, not another requirements layer.

**Backlog Audit**

Backlog reconciliation should be its own native agentic work item after representative proof.

Classify outstanding items as:

- `keep_ready`
- `rewrite`
- `merge`
- `retire`
- `blocked`
- `needs_human`

Inputs:

- Work Queue item text
- linked docs/specs
- current repo state
- current architecture decisions

Do not invent a heavy requirement abstraction for this. Output should be decision-oriented and source-backed.

**Launch And Runtime Overhead**

The final architecture must remove cold-start/proof-specific launch debt.

Resident gateway/runtime should own:

- config snapshot
- model registry snapshot
- auth/model resolution cache
- agent registry
- runtime worker supervisor

Native job launch should reuse resident state where safe.

Proof scripts should not import source or rebuild just to start a job. They should call resident RPC.

Readiness must check the actual native execution RPC surface, not just generic health. A "gateway healthy" response is not enough if the execution route is still unavailable.

**Deletion Plan**

After representative native proof passes and downstream callers are migrated:

- retire/delete product/spec replay as canonical proof path
- retire/delete deterministic prompt-intake/routing/scheduler brains as canonical execution paths
- retire/delete `RequirementMap` and `SchedulerGraphPatch` as model-facing workflow products
- retire/delete long-running `run-once` proof execution
- keep only thin compatibility adapters temporarily where migration requires them
- remove adapters once no callers remain

Do not leave tens of thousands of lines of old workflow code in place after the new path is accepted.

**Tests And Gates**

Focused tests should cover:

- `AgentRunRequest` normalization
- path root contract
- runtime transcript root separation
- native session transcript writability
- executor lifecycle events
- cancellation observation at pre-model waits
- resident RPC start/status/control
- proof harness cannot execute jobs directly
- status projection is bounded and event-derived
- `node_finish` auto-attaches runtime evidence
- missing evidence produces one executable correction
- repeated evidence-shape failures terminalize `needs_review`

Representative proof should track:

- start to provider wallclock
- first model activation
- first orchestrator decision
- first worker/session launch
- first tool call
- first mutation if coding is involved
- validation/finish timing
- terminal state
- evidence closure quality
- absence of cold source fallback
- absence of long-running route execution
- prompt/profile used
- transcript/artifact roots used

**Remaining Brittle Spots To Watch**

The most dangerous failure mode is rebuilding the same duplication under cleaner names.

Avoid:

- `AgentRunExecutor` becoming a workflow engine
- proof harness regaining execution authority
- native runtime forking prompt/tool/transcript logic
- path concepts leaking beyond the locator/envelope boundary
- status projection becoming a second state machine
- critique becoming deterministic gates everywhere
- requirement hydration returning under a new name
- compatibility adapters becoming permanent

**Current Required Completion Gaps**

These items are explicitly in scope for the native agentic orchestration goal. They are not optional cleanup and should not be treated as follow-up work unless a representative proof forces a sequencing change.

Durable cleanup inventory:

- [OpenClaw Native Legacy Cleanup Inventory](/projects/execution-platform/specs/openclaw-native-legacy-cleanup-inventory)

1. `AgentRuntimeCore` shared-service boundary is implemented for the native execution path.

   `RuntimeAgentExecutor` delegates through `AgentRuntimeCore`, and `EmbeddedAgentRuntimeCore` uses `runEmbeddedPiAgentCore` only as the current backend adapter. The core now prepares explicit shared services before the backend runs: prompt service, tool runtime policy, transcript store, workspace roots, context-pressure/compaction runtime, model/auth admission state, provider-client adapter, and runtime event sink. The prepared service bundle is passed into the embedded backend through `RunEmbeddedPiAgentParams.agentRuntimeCore`, and the backend consumes it for workspace selection, context runtime reuse, tool policy, transcript identity, model/auth reuse, provider-client attempt execution, provider-client ownership telemetry, and bounded runtime events.

   Current descriptor expectation:
   - `embedded_agent_core` is owned by `agent_runtime_core`;
   - `prompt_service`, `tool_runtime`, `transcript_store`, `context_pressure`, `model_auth`, `provider_client`, and `runtime_event_sink` are owned by `agent_runtime_core`;
   - `runEmbeddedPiAgentCore` remains the backend adapter, not the owner of native runtime service policy;
   - runtime-core events must not store raw prompts, raw responses, raw provider logs, or raw tool logs.

   Completion evidence:
   - `src/agents/agent-runtime-core.ts` defines explicit service interfaces/classes for `AgentPromptService`, `AgentToolRuntimeService`, `AgentTranscriptStoreService`, `AgentWorkspaceService`, `AgentContextPressureService`, `AgentModelAuthService`, `AgentProviderClientService`, and `AgentRuntimeEventSinkService`;
   - `src/agents/pi-embedded-runner/run/params.ts` carries the prepared `agentRuntimeCore` service bundle;
   - `src/agents/pi-embedded-runner/run.ts` consumes the service bundle and emits `agent_runtime_core_services_applied`;
   - provider attempt execution goes through the core-supplied `providerClient.runAttempt` function instead of an unowned embedded-runner provider call;
   - caller-owned/native runs use `runEmbeddedPiAgentCore` for native child task launches instead of the foreground queued wrapper;
   - `src/agents/runtime-agent-executor.test.ts` proves the service bundle reaches the embedded backend with prompt profile, tool policy, transcript/workspace roots, context owner, model/auth admission flags, provider-client adapter, and bounded runtime-core event output;
   - focused validation passed with `pnpm test:file src/agents/runtime-agent-executor.test.ts src/gateway/execution-platform-agent-team-runner.test.ts extensions/execution-platform/src/workers/native-execution-session-worker-adapter.test.ts extensions/execution-platform/src/workers/worker-adapter.integration.test.ts`;
   - fast typecheck passed with `pnpm tsgo:fast`.

   Required continuing invariants:
   - keep `AgentRunExecutor` as the envelope-facing executor/admission/cancellation layer;
   - keep foreground chat as a queued wrapper over the same core;
   - keep native execution as a RuntimeJob-owned envelope over the same core.

2. Native in-agent child launch no longer calls `runGatewayNativeExecutionSessionRuntimeJobOnce`, but the run-once compatibility wrapper still exists.

   The major in-agent child run-once leak is removed. It still needs proof coverage, and the compatibility wrapper remains a post-proof cleanup target.

   Required completion state:
   - keep synchronous child `runGatewayNativeExecutionSessionRuntimeJobOnce` removed from the in-agent `start_execution_session` callback;
   - route child launch through resident native execution scheduling;
   - return scheduled RuntimeJob/session readback to the parent agent;
   - do not make the parent model/tool call wait for the child job to run inline;
   - preserve blocking-child terminality through shared finish/runtime evidence checks rather than synchronous nested execution.

3. `RuntimeWorkerSupervisor` has resident dispatch names, accepted front-door submits now schedule native sessions, but run-once compatibility still exists.

   Better than blocking RPC, and better than making resident dispatch call the run-once compatibility entrypoint, but not yet the full resident supervisor loop final form. Accepted front-door execution submit now creates `openclaw.native_execution_session` jobs and schedules resident native execution instead of creating old `executor.agent_team` jobs that require `ProductionWorkflowExecutionFactory.runOnce(...)`.

   Current implementation state:
   - `NativeExecutionRpcService.submit(...)` converts accepted front-door execution decisions into native session objective/refs/constraints/validation signal.
   - Front-door workflow selection is retained as bounded routing context, not as a required legacy workflow runner.
   - Main chat front-door handoff reports scheduled native session status and no longer runs the workflow inline.
   - Source prompt/auth/front-door compile evidence remains in bounded front-door artifacts.
   - Native submit does not expose legacy worker-adapter readiness schema fields; those remain only in explicit legacy adapter fixtures/projections.
   - Legacy human-decision resume and old route/intake/scheduler compatibility surfaces still exist.

   Required completion state:
   - resident `NativeExecutionWorkerSupervisor` owns dispatch for native execution jobs;
   - HTTP/RPC only starts, polls, or controls;
   - proof harness only starts, polls, controls, and asserts;
   - `runOnce` remains only as a legacy/debug compatibility helper until callers are migrated;
   - production native execution does not rely on long-running route handlers or synchronous nested run-once calls.

4. Old deterministic route/intake/scheduler/product-spec replay paths still exist.

   They must be retired only after representative native proofs pass, but they are still architectural risk.

   Required completion state:
   - pass representative native orchestration proof first;
   - migrate required callers to native sessions/start-status-control;
   - retire product/spec replay as canonical proof path;
   - retire deterministic route/intake/scheduler brains as canonical execution paths;
   - delete dead compatibility code once no live caller depends on it.

5. Path model is improved but not fully collapsed everywhere.

   The four-root contract exists, but some code still consumes older `workspaceDir`, `agentDir`, source/runtime path concepts.

   Required completion state:
   - caller-visible native runtime path contract is only `canonicalSourceRoot`, `runtimeWorkspaceDir`, `transcriptRoot`, and `artifactRoot`;
   - older path details stay inside the locator/envelope adapter only;
   - native execution does not assume sessions live beside agent assets;
   - model-visible/status/proof payloads do not expose extra path concepts unless needed as bounded diagnostics.

6. Proof has not been rerun after the latest scheduling/path/request changes.

   The current state is type/test-clean for the slice, not live-proof accepted.

   Required completion state:
   - rebuild/reload the runtime when code changes require it;
   - run the representative native orchestration proof through resident gateway/native RPC;
   - prove start/status/control-only proof behavior;
   - prove first model activity and native launch optics;
   - prove terminal finish/evidence behavior;
   - record failure assessment and continue repair if proof fails.

**Completion Order For The Current Gap Set**

1. Prove the in-agent child `runGatewayNativeExecutionSessionRuntimeJobOnce` leak remains removed.
2. Promote resident native worker dispatch from wake/run-once containment toward a real resident supervisor loop.
3. Collapse remaining caller-visible path concepts into the four-root contract.
4. Keep `AgentRuntimeCore` shared-service ownership from regressing while the remaining native proof and deletion work proceeds.
5. Rerun the representative native orchestration proof through resident start/status/control.
6. After proof passes, retire product/spec replay and old deterministic route/intake/scheduler paths.
7. Delete legacy compatibility surfaces once callers are migrated and tests prove no live dependency remains.

**Best Final Form**

The final logical form is:

```text
One shared agent runtime core.
Typed envelopes own lifecycle.
Shared services own mechanics.
RuntimeJob owns durable native execution truth.
Native sessions own agent transcript/tool/todo behavior.
Status is an event projection.
Proof starts, polls, controls, and asserts.
```

That is the clean architecture. It prevents native execution from inheriting chat assumptions, while preventing native execution from becoming a second copy of the entire agent stack.
