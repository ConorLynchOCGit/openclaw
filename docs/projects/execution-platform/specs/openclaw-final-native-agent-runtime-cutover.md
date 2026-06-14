**Updated Proposal: Final Native Agent Runtime Cutover**

**Final Architecture Objective: RuntimeGeneration**

```text
 Yes. Push it one level further by deleting more nouns from the architecture.

  The final public model should be this:

  Gateway boot/reload
    -> builds RuntimeGeneration

  RuntimeJob
    -> durable queue/evidence row

  Envelope
    -> policy for how this run is owned

  AgentRuntime.run()
    -> executes against the already-built RuntimeGeneration

  Everything else becomes internal implementation detail.

  The sharper cut:

  There is no native admission system. There is no provider lease system. There is no proof preflight system. There is no native launch system.

  There is only:

  1. RuntimeGeneration
      - Built once at gateway boot/reload.
      - Owns config, roots, model catalog, provider runtimes, prompt registry, tool registry, transcript/artifact stores, LSP/edit/read/grep, compaction.
      - Immutable after creation.
      - If reload changes anything, gateway builds a new generation.

  2. RuntimeJob
      - Stores agentId, input, envelope, policyRef, runtimeGenerationId.
      - Stores lifecycle/evidence/events.
      - Does not store copied runtime capability.

  3. Envelope
      - chat
      - runtime_job
      - proof
      - child_agent
      - An envelope owns lifecycle policy only: locks, cancellation, transcript labeling, closeout, evidence rules.
      - It cannot build providers, tools, prompts, config, roots, or model state.
      - The only way to execute an agent.
      - It uses the resident RuntimeGeneration.
      - It never discovers config, provider auth, models, roots, tools, prompts, or workspace state.

  The deepest invariant becomes:

  > Runtime construction happens only during gateway boot/reload. Runtime execution may only reference an existing RuntimeGeneration.

  That means these should be banned after gateway readiness:

  - loadConfig
  - model catalog construction
  - provider discovery
  - Codex app-server startup
  - auth substrate discovery
  - tool catalog construction
  - prompt profile construction
  - workspace/root inference
  - session/transcript root inference
  - harness fallback selection
  - proof-specific runtime checks
  - snapshot/lease construction

  The only runtime APIs should be roughly:

  runtime.status()
  runtime.accept(request)
  runtime.run(acceptedRequest)
  runtime.reload()
  runtime.stop()

  And accept() should not build anything. It only checks whether the current RuntimeGeneration can accept the request.

  So the absolute simplification is:

  Boot builds the world.
  Jobs reference the world.
  Runtime runs against the world.
  Nothing rebuilds the world during execution.

  That is the furthest I’d push it without deleting RuntimeJob itself, which we still need as durable lifecycle/evidence truth.
```

This objective supersedes any earlier phrasing that treats native admission, provider lease, proof preflight, runtime snapshot, or native launch as a production execution system. Those concepts may exist only as temporary compatibility code while being removed or as internal implementation details of a resident `RuntimeGeneration`; they must not remain job-time world-building surfaces.

**Deepest Simplification Addendum: RuntimeGeneration + AcceptedRun + EnvelopePolicy**

The deepest target is not an invocation bag that mirrors old params.

The deepest target is:

```text
RuntimeJob
-> OpenClawAgentRuntime.run(acceptedRunId / acceptedRun)
-> AgentRuntimeCore.run(turn)
-> InteractionRuntime.run(turn)
```

Where `turn` is not copied launch state. It is a small resident-runtime view:

```ts
AgentTurn {
  generation: RuntimeGeneration
  acceptedRun: OpenClawAcceptedAgentRun
  envelope: EnvelopePolicy
  hooks: EnvelopeHooks
  abortSignal
}
```

Runtime modules read resident generation state by reference:

- `generation.profile(agentId)`
- `generation.roots`
- `generation.modelCatalog`
- `generation.providerRuntime`
- `generation.promptRegistry`
- `generation.toolRegistry`
- `generation.contextManager`
- `generation.transcriptStore`

No runtime module should receive copied config/model/provider/tool/root/auth fields as a per-run launch bundle.

This deletes:

1. `AgentRuntimeExecutionContext` as a broad mirror of old params.
2. `embeddedParamsFromAgentRuntimeInvocation()` from the live path.
3. `prepareNativeExecutionRun()` as an exported/native live-loop noun.
4. `RuntimeAgentExecutor` as a separate production layer. If it is only a pass-through, delete it rather than preserving it as an internal phase helper.
5. `InteractionRuntime` params/invocation compatibility as the primary execution input.
6. Legacy chat adaptation below the edge. The only allowed legacy adapter is:

```text
runEmbeddedPiAgent(params)
-> legacyParamsToAcceptedRun(params)
-> OpenClawAgentRuntime.run(...)
```

Strict `runtime_generation` rule:

For native execution, runtime code may only dereference resident generation state. It may not discover, infer, fallback, or materialize:

- config
- roots
- models
- auth
- provider transport
- tools
- prompt profiles
- transcript roots
- `models.json`

If any required resident fact is missing, fail as `invalid_runtime_generation`.

Bottom line:

> No params. No invocation bag. No launch context. No copied runtime world. Only `RuntimeGeneration + AcceptedRun + EnvelopePolicy`.

That is the final simplification target because it removes per-run assembly work and makes launch failures impossible below gateway boot/reload.

**Deepest Provider-Turn Ownership Addendum: RuntimeGeneration Capability + AgentTurn**

The current temporary direction of `turnDriver` is still not the deepest architecture. It is useful evidence that provider execution must be resident-runtime owned, but it must not become another public production noun.

The furthest simplification is:

```text
RuntimeGeneration
RuntimeJob
Envelope
AgentTurn
AgentRuntime.run()
EventSink
```

Everything else is a capability inside `RuntimeGeneration`, not a top-level architecture surface.

The clean target is:

```text
Gateway boot/reload
  -> builds RuntimeGeneration

RuntimeJob
  -> references runtimeGenerationId + agentId + input + envelope

AgentRuntime.run(AgentTurn)
  -> executes the whole turn using RuntimeGeneration capabilities
```

`RuntimeGeneration` contains:

- agent profile
- model profile
- provider capability
- tool capability
- transcript store
- artifact store
- compaction/context capability
- filesystem roots
- prompt profile
- safety/authority policy

But those must not become separate public orchestration layers.

The sharper invariant:

> A turn is the only execution unit. A generation is the only capability owner. Everything that can block must emit typed turn events.

So instead of:

```text
AgentRuntimeCore -> InteractionRuntime -> ProviderTransportRuntime -> Codex
```

the conceptual target is:

```text
AgentRuntime.run(turn)
  -> generation.provider(agentId).startTurn(turn)
  -> generation.tools(agentId)
  -> generation.transcripts
  -> generation.events
```

The Codex implementation can still live in its own file/module, but architecturally it is just the provider capability for that generation. It is not a lease, harness, driver, transport runtime, callback, or mini-runner.

Deepest cut:

Delete or demote these from the native live loop:

- `providerRuntimeLease`
- `ProviderRuntimeLease`
- `turnDriver`
- `providerClient`
- `runAttempt(params)`
- harness fallback
- provider readiness as separate metadata
- provider request optics as inferred status
- `before_attempt_backend` as a meaningful phase

Replace them with:

```ts
generation.capabilities.provider.runTurn({
  turn,
  attempt,
  emit,
  signal,
});
```

But do not expose `ProviderTransportRuntime` as another system. It is just a generation capability.

Final public model:

```text
RuntimeGeneration: the already-built world
RuntimeJob: durable lifecycle/evidence
Envelope: ownership policy
AgentTurn: one execution attempt
AgentRuntime.run(): the executor
EventSink: typed progress truth
```

Everything else is internal implementation.

Required typed provider-turn phases:

- `agent_turn_started`
- `provider_capability_entered`
- `provider_client_ready`
- `thread_binding_started`
- `thread_binding_ready`
- `provider_request_started`
- `model_stream_started`
- `tool_call_started`
- `tool_call_completed`
- `model_stream_completed`
- `agent_turn_completed`

Failure shape:

```text
agent_turn_failed
failedPhase = thread_binding_started | provider_request_started | model_stream_started | ...
errorCode
errorMessage
```

Runtime status must stop inferring progress from vague stages like `before_attempt_backend`. If a provider capability can wait, fail, block, retry, compact, call a provider, call a tool, launch a child, write transcript, or mutate source, it must run inside the `AgentTurn` lifecycle and emit typed phases through the same `EventSink`.

This covers the broader failure class:

```text
runtime says ready -> opaque helper does real work -> status goes blind
```

Likely surfaces covered by the same rule:

- provider startup
- auth refresh
- thread/session binding
- model request
- model stream
- tool execution
- child task launch
- compaction
- transcript append
- validation task launch
- node_finish / closeout

Final invariant:

> Runtime construction happens at gateway boot/reload. Runtime execution is one typed `AgentTurn`. Every blocking step emits typed phase events through the same event sink. Provider execution is a capability of the resident `RuntimeGeneration`, and the only thing running is an `AgentTurn`.

**OpenClaw-Native Envelope Correction: RuntimeJob Is Not A Provider System**

The deepest version is not:

```text
native RuntimeGeneration providerCapability
```

as a permanent architecture.

The deepest version is:

```text
OpenClaw AgentTurn core
  + two envelopes:
      chat envelope
      RuntimeJob envelope
```

Native execution should not own provider architecture. It should only supply durable noninteractive policy around the same OpenClaw agent execution primitive.

Final clean shape:

```text
Chat request
  -> chat envelope
  -> OpenClaw AgentTurn core
  -> OpenClaw model/auth/tools/transcript/provider mechanics

RuntimeJob
  -> runtime_job envelope
  -> OpenClaw AgentTurn core
  -> OpenClaw model/auth/tools/transcript/provider mechanics
```

The RuntimeJob envelope owns only:

- durable job lifecycle
- claim/lease/cancel
- typed status/events
- Work Queue evidence
- allowed-path/tool policy
- strict noninteractive policy
- closeout/evidence rules

It does not own:

- provider runtime selection
- provider lease
- provider capability as a permanent architecture
- harness fallback
- model auth semantics
- transcript mechanics
- provider request mechanics

Important correction:

`providerCapability` is a temporary bridge, not the destination.

The better destination is:

```text
RuntimeJob envelope supplies policy:
  providerFallback: "forbidden"
  providerSource: "configured_model_only"
  interactivity: "noninteractive"
  statusEventSink: "runtime_job"
  toolPolicy: <runtime-job tool policy>
  closeoutPolicy: "runtime_evidence"
```

Then OpenClaw's shared turn core uses existing provider/tool/model primitives under that policy.

So instead of deleting OpenClaw harness/provider code, delete the native-specific duplicate provider layer and enforce policy at the envelope boundary.

Use OpenClaw out-of-the-box systems wherever they already own the concern:

- chat/foreground interaction stays OpenClaw's normal chat path.
- model/provider/auth/tool primitives are reused where they are stable.
- native execution adds durable job lifecycle, envelope policy, Work Queue evidence, typed status/events, allowed-path/tool policy, closeout, and runtime evidence.
- native execution must not reimplement chat or fork provider semantics.

Keep shared:

- model config/catalog primitives
- auth primitives
- tool definitions/tool runtime primitives
- transcript/session primitives where they are stable
- provider client primitives where they are not chat-policy-specific
- typed event sink primitives

Do not share:

- user-facing chat transcript assumptions
- chat-specific provider retry/failover policy
- proof/runtime job lifecycle
- native job status/evidence closeout policy

`RuntimeGeneration` may remain as the internal gateway runtime version/readiness object. It must not become a separate native execution system. Its job is to reference the already-built OpenClaw runtime world and generation id, not to create a second provider architecture.

Simplest rule:

> If it is OpenClaw's normal agent execution machinery, keep and reuse it. If it exists because native orchestration built a parallel launch/provider/runtime layer, delete it.

This is the fewest-moving-parts version: RuntimeJob becomes a durable, noninteractive envelope over OpenClaw's existing agent runtime primitives, not a second agent/provider system.

**OpenClaw-Native Lifecycle Correction: RuntimeJob Reduces Existing Turn Facts**

The deepest post-turn lifecycle correction is not to invent a broad new `AgentTurnOutcome` or `EnvelopeEffects` protocol. That would risk becoming another parallel runtime language beside OpenClaw's existing agent machinery.

The most OpenClaw-native rule is:

> OpenClaw's normal agent turn produces the canonical turn event stream, tool result records, transcript/session writes, provider events, and runtime events. The RuntimeJob envelope observes those existing facts and reduces them into durable RuntimeJob state.

The public shape is:

```text
OpenClaw AgentTurn core
  -> normal provider/model/tool/session execution
  -> canonical turn event stream / tool result records / transcript writes

RuntimeJob envelope
  -> observes those existing records
  -> deterministic reducer
  -> RuntimeJob lifecycle/evidence/status transitions
```

The reducer is the single durable policy point:

```text
current RuntimeJob state
+ OpenClaw canonical turn records
+ RuntimeJob events/artifacts
+ envelope policy
= next RuntimeJob state / next action
```

`node_finish` is not a lifecycle authority. It is a normal tool-result fact:

```text
tool_call_completed(name=node_finish, payload=bounded_finish_request)
```

`start_execution_session` is not a lifecycle authority. It is a normal child-execution-request fact:

```text
tool_call_completed(name=start_execution_session, payload=child_runtime_job_id)
```

Provider failure is a provider event. Cancellation is an envelope signal. Model stream completion is a turn event. The RuntimeJob envelope consumes those facts and decides:

- turn completed + accepted `node_finish` fact -> terminal success / blocked / needs_review according to shared finish evidence;
- turn completed + blocking child execution fact -> wait/defer on child evidence, not proof-side guessing;
- turn completed + no required closeout fact -> terminal needs_review or one bounded repair turn if explicitly configured later;
- provider failed -> failed / retry policy;
- cancel observed -> canceled.

Hard invariant:

> After `agent_turn_completed`, the RuntimeJob envelope must synchronously reduce the existing OpenClaw turn facts. A job may not remain `running` unless the reducer explicitly produced a wait/continue action with evidence.

This deletes the implicit control chain:

```text
model maybe calls node_finish
-> tool maybe mutates job
-> worker keeps lease alive
-> proof guard guesses stuckness
```

and replaces it with:

```text
turn ended
-> reducer runs immediately
-> job transitions deterministically
```

Native execution must not add a separate effect bus unless an existing OpenClaw event/tool-result record cannot express the fact. The native-specific layer is limited to:

- RuntimeJob claim/lease/cancel;
- reducer policy over canonical OpenClaw turn facts;
- bounded evidence/status projection;
- Work Queue evidence linkage.

This is now a hard blocker before the next proof. The next proof must not rely on proof-side stale guards to decide post-turn lifecycle.

**Fast Cutover Plan: RuntimeJob Envelope Reducer**

This cutover is intentionally direct. Do not insert a compatibility lifecycle layer, a second effect protocol, or a proof-only watchdog.

1. Add the reducer at the RuntimeJob envelope boundary.
   - Put the reducer in the native runtime-job runner boundary, not inside provider code, tools, proof scripts, or Work Queue projections.
   - The reducer consumes existing RuntimeJob events/artifacts collected from OpenClaw turn/tool/provider facts.
   - The reducer emits one bounded `execution.turn.reduced` event with the decision, evidence refs, child-session refs, and safety flags.

2. Stop native RuntimeJob turns from using chat-style post-turn retry loops.
   - For `runtime_generation` execution, once the provider turn returns, `InteractionRuntime` must hand control back to the RuntimeJob envelope.
   - Native RuntimeJob turns must not keep retrying planning-only, reasoning-only, or empty-response chat recovery after a provider turn completed.
   - Those recovery loops can remain for foreground/chat if they are OpenClaw's normal UX behavior.

3. Treat `node_finish` as an observed finish fact.
   - `node_finish` still uses the normal OpenClaw tool path.
   - The tool records shared finish evidence.
   - The reducer consumes the accepted/rejected shared finish fact and maps it to adapter status.
   - The tool does not become the only durable lifecycle authority.

4. Treat `start_execution_session` as an observed child-execution fact.
   - The runtime-owned launcher records a parent RuntimeJob event when it starts a child session.
   - The reducer uses the existing shared evidence collector to see open/failed blocking children.
   - A blocking child fact produces an explicit wait/defer decision with evidence, not proof-side guessing.

5. Terminalize no-closeout completed turns immediately.
   - If the provider turn completed and the reducer sees no accepted finish and no open blocking child wait, the adapter returns `needs_review`.
   - The RuntimeJob must leave `running` through the supervisor's normal needs-review terminalization.
   - The proof guard must no longer be the first component to discover this state.

6. Add boundary tests.
   - A native RuntimeJob whose agent turn returns without `node_finish` is marked needs_review and records `execution.turn.reduced`.
   - The reducer consumes existing events/artifacts and does not require a new effect protocol.
   - Native `runtime_generation` turns do not use planning-only/empty-response retry loops as lifecycle control.

Completion evidence:

- [x] `src/gateway/native-execution-session-runtime-job.ts` owns `reduceNativeExecutionTurn(...)` at the RuntimeJob envelope boundary.
- [x] `runNativeExecutionSessionRuntimeJob(...)` invokes `OpenClawAgentRuntime.runAcceptedNativeExecution(...)`, then immediately reduces the completed turn before returning the worker adapter result.
- [x] `node_finish` remains a normal OpenClaw tool path through shared finish evidence; the reducer observes the finish fact and maps it to completed, blocked, or needs_review.
- [x] Blocking child execution is observed through shared evidence and reduced to an explicit `deferred` wait decision with bounded child-session refs.
- [x] A completed provider turn with no accepted finish and no blocking child wait reduces to `needs_review_no_required_closeout`, records `execution.turn.reduced`, and returns `needs_review`.
- [x] `RuntimeWorkerSupervisor` terminalizes `needs_review` through `markJobNeedsReview(...)`, releases the lease, and records `job.needs_review`.
- [x] Focused tests passed: `pnpm test:file src/gateway/native-execution-session-runtime-job.test.ts extensions/execution-platform/src/workers/runtime-worker-supervisor.test.ts extensions/execution-platform/src/workflows/native-cutover-inventory.test.ts`.
- [x] Live rerun `native-orchestration-post-turn-reducer-20260614T211012Z` proved the next deeper post-turn failure: the provider/model/tool path reached `agent_turn_completed`, but AgentRuntimeCore did not return to the RuntimeJob reducer because runtime envelope completion telemetry was still awaited after the provider turn.
- [x] `AgentRuntimeCore` now emits runtime envelope events as non-blocking diagnostic telemetry, so a slow or hanging `onRuntimeEvent` sink cannot keep a completed OpenClaw turn from returning to the RuntimeJob lifecycle reducer.
- [x] Focused regression passed: `pnpm test:file src/agents/agent-runtime-core.test.ts src/gateway/native-execution-session-runtime-job.test.ts extensions/execution-platform/src/workers/runtime-worker-supervisor.test.ts extensions/execution-platform/src/workflows/native-cutover-inventory.test.ts`.
- [x] Live rerun `native-orchestration-runtime-event-nonblocking-20260614T212225Z` proved one deeper post-turn blocker: after `agent_turn_completed`, `InteractionRuntime` still performed chat-style actual-usage context-pressure maintenance and awaited auth-profile success bookkeeping before returning to the RuntimeJob envelope.
- [x] `InteractionRuntime` now gates actual-usage context-pressure maintenance out of `runtime_generation` RuntimeJob turns and runs auth-profile success bookkeeping as non-blocking best-effort work for those turns. Foreground/chat keeps the normal awaited behavior.
- [x] Boundary inventory now asserts RuntimeJob turns keep `runtimeJobEnvelopeOwnsPostTurnReduction`, skip actual-usage maintenance via `!runtimeJobEnvelopeOwnsPostTurnReduction`, and use `void markSuccessfulAuthProfileUse().catch(...)`.

7. Validate with focused tests and fast typecheck.
   - Run the native runner/reducer tests.
   - Run the native cutover inventory test.
   - Run `pnpm tsgo:fast`.

**Hard Blockers Before Next Proof: OpenClaw-Native Envelope Cut**

No proof may run until all blockers below are satisfied and backed by boundary tests or direct runtime evidence.

1. Native run state contains no copied provider runtime lease.
   - Remove `providerRuntimeLease` from native invocation/prepared context/interaction runtime.
   - Remove `ProviderRuntimeLease` as executable architecture.
   - Remove `provider_runtime_lease_consumed`.
   - Remove provider lease recheck as a native runtime phase.
   - Provider readiness may exist only as internal gateway/runtime construction state, not as copied RuntimeJob or turn state.

2. Native execution has no provider-client fallback path.
   - `AgentRuntimeCore` must not import or call `provider-client-runtime.ts`.
   - `InteractionRuntime` must not call `runAgentProviderAttempt` as a native fallback.
   - For `runtime_generation` execution, missing OpenClaw provider primitive / bridge capability fails as `invalid_runtime_generation`.

3. Native execution has no harness or PI fallback.
   - Native runtime/core/start/worker/proof paths must not import or call `runAgentHarnessAttemptWithFallback`.
   - Native runtime/core/start/worker/proof paths must not import or call harness selection.
   - Native runtime/core/start/worker/proof paths must not create or select the built-in PI harness as fallback.
   - PI/harness fallback remains allowed only behind the existing OpenClaw foreground/chat boundary until it is proven safe to delete or migrate.

4. Native execution has no synthetic Codex API-key fallback.
   - The native `runtime_job` envelope must never pass `apiKey: "codex-app-server"` into generic provider auth as executable truth.
   - Codex app-server is reached only through the OpenClaw provider primitive or the temporary bridge that calls that primitive directly.
   - If Codex cannot run under the configured model/auth state, the failure is provider/auth/runtime readiness with a bounded code, not "No API key found."

5. Native execution has no native-only provider selection maze.
   - No job-time provider lease.
   - No job-time harness registry lookup.
   - No job-time provider/auth/model reinterpretation.
   - No job-time fallback from Codex app-server to PI/generic provider execution.

6. Typed provider phases come from the shared turn core/event sink.
   - Provider/client/thread/request/model/tool phases must be emitted through the `AgentTurn` event sink.
   - Status must project those typed phases directly.
   - Status must not infer provider progress from vague stages like `before_attempt_backend`.

7. OpenClaw chat/foreground stays out-of-the-box.
   - Do not replace or rewrite normal chat provider behavior as part of this proof cut.
   - Preserve tests that prove OpenClaw chat and model interactions still use their existing supported path.
   - Delete native-specific duplicate glue, not protected OpenClaw platform behavior.

8. Delete tests tied only to removed native lease/fallback behavior.
   - Do not keep tests around for architecture being removed.
   - Keep only tests that protect the existing OpenClaw foreground/chat path or the new RuntimeJob envelope boundary.

9. Boundary inventory must enforce the blockers.
   - The inventory test must reject native runtime/core/start/worker/proof imports or calls to `provider-client-runtime.ts`, harness fallback, PI fallback, synthetic Codex API-key fallback, provider lease consumption, and job-time provider selection.
   - The same test may explicitly allow those old mechanisms only in the foreground/chat compatibility boundary until later cleanup.

10. Next proof is blocked until the native live loop is this small:

```text
RuntimeJob
  -> runtime_job envelope policy
  -> OpenClaw AgentTurn core / temporary direct bridge
  -> OpenClaw model/auth/tools/transcript/provider mechanics
  -> RuntimeJob typed events/evidence
```

**Fast High-Risk Cutover Plan: Delete Native Provider Maze Before Proof**

This cut should optimize for time and token efficiency by deleting native-specific provider maze code rather than renaming or polishing it.

1. Run one reachability inventory, not a broad audit.
   - Search only for native live-loop references to `providerRuntimeLease`, `ProviderRuntimeLease`, `provider-client-runtime`, `runAgentProviderAttempt`, `runAgentHarnessAttemptWithFallback`, `selectAgentHarness`, `createPiAgentHarness`, `codex-app-server` synthetic API-key handling, and `before_attempt_backend`.
   - Classify each hit as `native_live_loop`, `foreground_chat`, `test_for_deleted_native_behavior`, or `post_proof_legacy_debt`.

2. Delete native copied lease state in one pass.
   - Remove lease fields from native accepted run/invocation/prepared context.
   - Remove lease-consumed events and recheck phases.
   - Keep readiness only inside gateway/runtime construction or the temporary bridge.

3. Hard-cut native provider fallback.
   - Remove `provider-client-runtime.ts` imports from `AgentRuntimeCore`, `InteractionRuntime`, native worker, start service, native RPC, and proof paths.
   - Make missing provider primitive / temporary bridge an immediate `invalid_runtime_generation`.
   - Do not add another fallback.

4. Fence existing OpenClaw foreground behavior.
   - Leave chat/foreground harness/provider code alone unless it is only native glue.
   - Add or keep an explicit boundary comment/test that chat may use the existing OpenClaw path and native may not.

5. Update tests by deletion, not compatibility.
   - Delete or rewrite tests that assert native provider lease/selection behavior.
   - Move native tests to the envelope boundary and typed event sink.
   - Preserve OpenClaw chat/provider tests.

6. Validate with the smallest useful gate set.
   - Run the native cutover inventory test.
   - Run the Codex app-server typed phase test.
   - Run the runtime-home test only if touched.
   - Run `pnpm tsgo:fast`.

7. Reload with the fastest valid path.
   - Use fast dist reload when container/env/compose did not change.
   - Use full rebuild/recreate only when container env, mounts, package install, or compose changed.

8. Attempt proof only after blockers pass.
   - Proof should test scheduling, the RuntimeJob envelope, typed provider phases, and model activity.
   - Proof must not be used to discover config/model/provider/launch assembly defects.

**Fast Cutover Plan**

1. **Create the resident runtime boundary**
   - Add `OpenClawAgentRuntime` / `RuntimeGeneration`.
   - Gateway boot/reload builds it once.
   - Move config, roots, model catalog, provider runtimes, prompt/tool registries, transcript/artifact roots, LSP/edit/read/grep, and compaction ownership into that generation.

2. **Collapse admission into `runtime.accept()`**
   - Delete production meaning of `NativeAdmissionService` as a world builder.
   - `accept()` only checks the existing generation can run `{agentId, input, envelope, policyRef}`.
   - It returns an accepted request with `runtimeGenerationId`, not a snapshot or provider lease.

3. **Shrink RuntimeJob payload**
   - Store only `agentId`, `input`, `envelope`, `policyRef`, `runtimeGenerationId`, lifecycle/evidence ids.
   - Remove embedded admission snapshots, provider leases, model/tool/prompt copied state.

4. **Make the worker dumb**
   - Worker claims RuntimeJob.
   - Worker verifies referenced `runtimeGenerationId` exists/is current enough.
   - Worker calls `OpenClawAgentRuntime.run(jobRequest)`.
   - Worker cannot load config, discover models, start Codex, infer roots, build prompts, build tools, or select harness fallback.

5. **Move Codex/app-server ownership to generation build**
   - Provider runtime readiness is internal resident state.
   - Codex app-server starts/reconciles at gateway runtime generation creation, not admission/proof/worker launch.
   - No provider lease copied into jobs.

6. **Delete proof preflight as runtime assembly**
   - Proof uses production start/status/control only.
   - `native-readyz` becomes `runtime.status()`.
   - Proof cannot import source runtime code, mutate model sidecars, or run its own config/provider checks.

7. **Unify envelopes**
   - Chat, runtime_job, proof, and child_agent all call the same runtime.
   - Envelopes own only lifecycle policy: locks, cancellation, transcript labeling, closeout, evidence.
   - Envelopes cannot build runtime capability.

8. **Add hard inventory gates**
   - Ban post-readiness `loadConfig`, model catalog build, provider discovery, Codex startup, root inference, tool/prompt construction, harness fallback, snapshot/lease construction in worker/start/proof paths.
   - These tests become the guardrail that prevents the old maze from reappearing.

9. **Then rebuild and proof**
   - Run focused boundary tests.
   - Run `pnpm tsgo:fast`.
   - Reload gateway.
   - Start proof only after `runtime.status()` shows a ready generation.
   - Proof target: scheduling and agent behavior, not launch assembly.

This is the direct cut: boot builds the world, jobs reference the world, runtime runs against the world. No compatibility-heavy parallel launch path.

Core objective: make `AgentRuntimeCore` the actual shared engine that runs an agent turn, not an adapter around embedded-runner internals. Native execution must run through resident RuntimeJob supervision and the shared core. Production run-once must disappear from normal execution.

The single cut should be architectural, not behavioral: move behavior first, change ownership/import direction, avoid semantic rewrites in the same pass, and simplify only after tests and proof pass.

No new abstraction is allowed unless it removes an existing owner.

**Implementation Status**

- **Completed:** Provider lease/registry deletion for native RuntimeGeneration construction. The native path no longer has `ProviderRuntimeLease`, `prepareProviderRuntimeLease`, `provider-runtime/registry.ts`, `provider-runtime/types.ts`, `provider-runtime/lease.ts`, `extensions/codex/src/provider-runtime-adapter.ts`, or lease-specific tests. `OpenClawAgentRuntime.build()` now builds the executable `providerCapability` directly through `createAgentRuntimeProviderCapability(...)`; Codex readiness/model-list smoke is an internal capability construction fact, not a copied lease or job-time provider-selection surface.
- **Completed:** Leaf runtime contracts and envelope-prepared child capability. Public `RuntimeGeneration`, `RuntimeGenerationAgentProfile`, `OpenClawAcceptedAgentRun`, `OpenClawRuntimeEnvelope`, and provider-capability contracts now live in `src/agents/openclaw-agent-runtime-contracts.ts`, a type-only leaf contract module. `openclaw-agent-runtime.ts` is now implementation/builder code depending inward on that contract. `agent-turn.ts`, `agent-runtime-invocation.ts`, gateway native start/runtime-job code, and tests import the contracts directly. `InteractionRuntime` no longer imports or constructs `DefaultAgentRuntimeCore`, no longer imports `createNativeRunChildTask`, and no longer resolves child execution policy; `AgentRuntimeCore` prepares the child-task capability at the envelope/core boundary and passes it through the turn context. Boundary inventory now asserts those import and ownership rules.
- **Completed in boundary-test form:** OpenClaw-native envelope pre-proof gate. `providerCapability` remains a temporary bridge only, not the destination. Native RuntimeJob execution no longer carries copied provider leases through invocation/prepared context/interaction params, `src/agents/provider-client-runtime.ts` was deleted, `AgentRuntimeCore` no longer imports or falls back to `runAgentProviderAttempt`, native accepted-run metadata no longer stores `providerRuntimeId`, `InteractionRuntime` no longer emits `provider_runtime_lease_consumed` or `before_attempt_backend`, provider auth phases are now `provider_auth_rechecked` / `provider_auth_recheck_failed`, and harness/PI fallback remains fenced to the existing OpenClaw foreground path. Boundary inventory now asserts those native live-loop blockers. Focused validation passed for `extensions/execution-platform/src/workflows/native-cutover-inventory.test.ts`, `src/agents/harness/selection.test.ts`, `src/agents/pi-embedded-runner/run/auth-controller.test.ts`, `src/gateway/native-execution-start-service.test.ts`, `extensions/codex/src/app-server/run-attempt.test.ts`, `extensions/execution-platform/src/intent-routing/native-execution-rpc.test.ts`, and `pnpm tsgo:fast`.
- **Completed:** Section 4, `RuntimeAgentExecutor` deletion. RuntimeJob claim/lease stays in the resident supervisor and native execution now calls `OpenClawAgentRuntime.runAcceptedNativeExecution() -> AgentRuntimeCore` directly. The pass-through `RuntimeAgentExecutor` file and dedicated test have been deleted instead of preserved as another wrapper.
- **Completed:** Section 7, embedded runner compatibility shell narrowed. The legacy `runEmbeddedPiAgent` wrapper now calls `DefaultAgentRuntimeCore` directly through the explicit legacy adapter. The redundant `runEmbeddedPiAgentCore` wrapper was deleted. The wrapper no longer routes through `RuntimeAgentExecutor`.
- **Completed:** Section 6, full `agentRuntimeCore` param-bundle retirement. `AgentRuntimeCore` now passes a prepared runtime context directly as the interaction-runtime argument; `RunEmbeddedPiAgentParams` no longer carries an `agentRuntimeCore` field. The prepared runtime context is now a native `AgentRuntimeCore` contract in `src/agents/agent-runtime-prepared-context.ts`, not a type derived from embedded-runner params.
- **Completed in boundary-test form:** Resident AgentTurn cutover. `OpenClawAgentRuntime.runAcceptedNativeExecution()` now builds an `AgentTurn` from `{ generation, acceptedRun, envelope, abortSignal }` and calls `DefaultAgentRuntimeCore` directly. `AgentRuntimeCoreRunInput` accepts the native turn, `AgentRuntimeCore` no longer imports or names `RunEmbeddedPiAgentParams`, and `OpenClawAgentRuntime` no longer exposes `prepareNativeExecutionRun()`, `AgentRuntimeExecutionContext`, `RuntimeAgentExecutor`, or `RunEmbeddedPiAgentParams`. Legacy foreground/debug callers adapt embedded params at explicit wrapper edges through `agentRuntimeInvocationFromEmbeddedParams`. The dead reverse adapter `embeddedParamsFromAgentRuntimeInvocation()` was deleted. `InteractionRuntime` now consumes the prepared runtime invocation directly. The remaining `RunEmbeddedPiAgentParams` usage is isolated to live legacy foreground/child-adapter compatibility, pending deletion when those envelopes move to `AgentTurn`.
- **Completed:** Section 10, resident native worker dispatch extraction. `execution-platform-http.ts` no longer defines `ResidentNativeExecutionWorkerSupervisor` or imports/calls `runGatewayNativeExecutionSessionRuntimeJob`; the resident supervisor service owns queue wake, claim loop, child scheduling, dispatch failure events, and drain.
- **Completed in boundary-test form:** Section 10 production native runner extraction. `src/gateway/native-execution-session-runtime-job.ts` now owns the production native execution session runtime-job runner, native child scheduling, node_finish/shared-finish closure, native launch timing events, and native agent runtime event classification. `ResidentNativeExecutionWorkerSupervisor` imports `runNativeExecutionSessionRuntimeJob` from that production module and no longer imports `execution-platform-agent-team-runner.ts`. The older agent-team runner remains only as legacy/debug compatibility pending proof-gated deletion.
- **Completed:** Section 11, production run-once ownership removal for the old `*Once` names. The old `runGatewayNativeExecutionSessionRuntimeJobOnce`, `runGatewayAgentTeamRuntimeJobOnce`, and `handleExecutionPlatformQueueRunnerHostRoute` production surfaces are absent; remaining helpers are explicitly debug/compat named.
- **Completed in boundary-test form:** Section 11 native runtime-job non-debug export removal. `execution-platform-agent-team-runner.ts` no longer exports `runGatewayNativeExecutionSessionRuntimeJob`; the remaining native runner in that legacy file is private to `runGatewayNativeExecutionSessionRuntimeJobLegacyDebugCompat` until the proof-gated deletion pass removes the old file surface entirely.
- **Completed in boundary-test form:** Section 2 import direction for `AgentRuntimeCore` and production HTTP. `AgentRuntimeCore` no longer imports `pi-embedded-runner/run.ts` or calls `runEmbeddedPiAgentCore`; production HTTP no longer imports the native job runner/run-once.
- **Completed in boundary-test form:** Section 5 / Section 8 caller-owned `InteractionRuntime` scheduling. `InteractionRuntime` no longer imports the foreground command queue, no longer resolves session/global lanes, and no longer emits fake session/global lane stages. Foreground command-lane behavior is isolated to the legacy `runEmbeddedPiAgent` wrapper.
- **Completed in boundary-test form:** Section 6 `agentRuntimeCore` primary fallback removal inside `InteractionRuntime`. The interaction turn now requires a prepared runtime context argument from `AgentRuntimeCore`; it no longer falls back to `params.agentRuntimeCore`. Legacy child task launches re-enter through `DefaultAgentRuntimeCore` directly so children receive their own core-prepared runtime context without the deleted executor wrapper.
- **Completed in boundary-test form:** Section 8 SessionRuntime session identity repair. Read-only session-key backfill now lives in `src/agents/session-runtime/session-key.ts` and is applied by `AgentRuntimeCore` transcript preparation; `InteractionRuntime` no longer imports session-key resolution helpers or repairs session identity before provider/tool execution.
- **Completed in boundary-test form:** Section 8 SessionRuntime attempt session ownership. Session lock acquisition, native child parent-lock handoff binding, session file repair, transcript policy resolution, session prewarm, guarded `SessionManager.open`, context-engine bootstrap, and `prepareSessionManagerForRun` now live in `src/agents/session-runtime/attempt-session.ts`. The PI attempt implementation calls `acquireAttemptSessionLockRuntime` and `openAttemptSessionTranscriptRuntime` instead of acquiring locks or opening/preparing the session manager inline.
- **Completed in boundary-test form:** Section 5 RunEnvironment ownership. Workspace resolution, runtime plugin admission, model fallback eligibility, and models.json admission now live in `src/agents/run-environment.ts` and are applied by `AgentRuntimeCore` before the interaction turn. `InteractionRuntime` consumes the prepared `runEnvironment` instead of calling `resolveRunWorkspaceDir`, `ensureRuntimePluginsLoaded`, or `ensureOpenClawModelsJson`.
- **Completed in boundary-test form:** Section 5 RunEnvironment pre-model latency cut. `RunEnvironment` now skips runtime plugin registry loading unless the caller explicitly requests gateway subagent binding or concrete runtime plugin IDs. Launch timing records expose `runtimePluginsLoaded` and `runtimePluginsStatus` so a future pre-model stall can prove whether plugin loading ran or was intentionally skipped.
- **Completed in boundary-test form:** Section 5 ContextManager runtime ownership. `AgentRuntimeCore` prepares the context-pressure runtime and `InteractionRuntime` requires that prepared runtime; it no longer imports or falls back to `resolveContextRuntime` during provider/tool execution.
- **Completed in boundary-test form:** Section 5 ContextManager pre-submit ownership. `src/agents/context-manager-runtime.ts` now owns `runBeforeSubmitContextPressure`, context-breakdown conversion, pre-submit tool-result reduction estimation, live tool-result truncation, native-task preservation blocking, node-worker compaction continuation instructions, and compaction repair-window source readback. The PI attempt implementation calls this ContextManager operation instead of directly calling `contextPressure.beforeSubmit`, `createContextPressureController`, `shouldPreferActualUsageCompaction`, `estimateToolResultReductionPotential`, or provider-visible context breakdown conversion inline. `InteractionRuntime` reuses ContextManager-owned compaction continuation and repair-window helpers instead of carrying duplicate source-window/readback logic.
- **Completed in boundary-test form:** Section 5 ContextManager after-turn lifecycle ownership. `src/agents/context-manager-runtime.ts` now owns `buildAttemptContextRuntimeContext` and `finalizeAttemptContextManagerTurn`, including the `finalizeAttemptContextEngineTurn` call and `runContextEngineMaintenance` callback wiring. The PI attempt implementation calls these ContextManager operations instead of building after-turn runtime context or wiring context-engine maintenance directly.
- **Completed in boundary-test form:** Section 5 ContextManager actual-usage pressure ownership. `src/agents/context-manager-runtime.ts` now owns `runActualUsageContextPressure`, including provider-visible context breakdown estimation, `contextPressure.afterTurn`, actual-usage pruning, continuation source-window readback, summary hooks, compaction maintenance, and model-facing diagnostic logging for the actual-usage path. `InteractionRuntime` calls this ContextManager operation instead of directly owning the actual-usage `afterTurn` route.
- **Completed in boundary-test form:** Section 5 ContextManager timeout-recovery ownership. `src/agents/context-manager-runtime.ts` now owns `runTimeoutHighUsageContextPressure`, including `contextPressure.recover` for `timeout_high_usage`, timeout compaction runtime-context construction, deterministic pruning, continuation source-window readback, summary hooks, post-compaction side effects, and retry/fallthrough logging. `InteractionRuntime` calls this ContextManager operation instead of directly owning the timeout-high-usage recovery route.
- **Completed in boundary-test form:** Section 5 ContextManager provider-overflow and fallback truncation ownership. `src/agents/context-manager-runtime.ts` now owns `runProviderOverflowContextPressure` and `runOverflowToolResultFallbackTruncation`, including `contextPressure.recover` for `provider_overflow`, overflow compaction runtime-context construction, deterministic pruning, continuation source-window readback, summary hooks, post-compaction truncation, context-engine maintenance, oversized tool-result detection, fallback truncation, retry/fallthrough logging, and truncation-attempt state. `InteractionRuntime` now calls ContextManager operations and inventory tests assert it has no direct `contextPressure.recover`, `buildEmbeddedCompactionRuntimeContext`, `runContextEngineMaintenance`, `truncateOversizedToolResultsInSession`, `sessionLikelyHasOversizedToolResults`, `pruneToolOutputsForContextPressure`, `executionNodeContinuationStrategy`, or `readCompactionRepairWindow` ownership.
- **Completed in boundary-test form:** Section 5 ModelAuthRuntime ownership. Hook model selection, admitted auth/model registry handling, effective runtime model/context-window calculation, auth profile candidate setup, and model-auth launch timing now live in `src/agents/model-auth-runtime.ts` and are applied by `AgentRuntimeCore` before the interaction turn. `InteractionRuntime` consumes `modelAuthRuntime` instead of calling `discoverAuthStorage`, `discoverModels`, `resolveModelAsync`, `resolveHookModelSelection`, `resolveEffectiveRuntimeModel`, `ensureAuthProfileStore`, `resolveAuthProfileOrder`, or `resolveAuthProfileEligibility`.
- **Completed in boundary-test form:** Section 5 ModelAuthRuntime admitted-runtime latency cut. When native execution admits both `authStorage` and `modelRegistry`, `ModelAuthRuntime` treats that runtime as authoritative: it resolves the model by direct registry lookup, skips provider dynamic runtime discovery, and skips auth-profile store loading unless an explicit profile lock requires profile-store validation. Direct harness evidence showed admitted `prepareModelAuthRuntime` completing in roughly 3ms after the cut.
- **Completed in boundary-test form:** RuntimeGeneration accepted-run start boundary. `NativeExecutionStartService` now owns only resident-runtime readiness, `runtime.accept()` preflight, and accepted-run enqueue. `NativeAdmissionService`, `NativeExecutionAdmittedRuntimeSnapshot`, `commitAdmittedNativeExecutionJob`, admitted snapshot artifacts/events, and the `native-execution-admission.ts` module have been removed from the production start path. Native session payloads now persist `artifactKind: "openclaw.accepted_agent_run"`, `runtimeGenerationId`, `agentId`, `envelope`, `policyRef`, and the executable `runRequest`; they do not persist admission snapshots, provider leases, or copied runtime capability.
- **Completed in boundary-test form:** Proof preflight retirement and runtime-generation acceptance. The native proof harness uses production `native-readyz`, `start-session`, `status`, `apply-control`, and `closeout`; it no longer calls `/execution/preflight` or performs proof-side runtime assembly. `NativeExecutionRpcService.preflightSession` remains an accept-only status surface when injected, returning `artifactKind: "native_execution_preflight_session_result"` with `runtimeGenerationId` and bounded error/reason fields, not snapshot/model/provider-lease projections.
- **Completed in boundary-test form:** Accepted child-session lineage. Native child launches call `input.agentRuntime.acceptNativeExecutionSession()` and `commitAcceptedNativeExecutionJob()` with `envelope: "child_agent"` and parent runtime/session metadata. Child sessions reference the same resident RuntimeGeneration instead of deriving child admission snapshots or persisting admission evidence.
- **Completed in boundary-test form:** Admitted model catalog registry-first lookup. `AdmittedModelCatalogService` now checks the full provider/model alias candidate set against the admitted registry before calling dynamic `resolveModelAsync`, so `openai-codex/gpt-5.5 -> codex/gpt-5.5` registry hits do not perform dynamic provider lookup. Focused validation passed for `src/agents/admitted-model-catalog-runtime.test.ts` and `pnpm tsgo:fast`.
- **Completed in boundary-test form:** Native-readyz / native doctor readiness. `NativeExecutionStartService.readiness()` now provides a read-only native readiness/doctor projection with runtime uid/gid, config path/hash, catalog readiness hash, runtime roots, agent model checks, and config/agent/runtime/transcript/artifact asset access checks. The readiness path uses registry-only model checks with `allowDynamicLookup: false`, records `nativeDoctorReadOnly: true`, `providerCatalogRefreshed: false`, and `runtimeJobCreated: false`, and is exposed through `NativeExecutionRpcService.nativeReady` plus `/api/execution-platform/execution/native-readyz`. The resident proof harness now calls native-readyz before admission preflight/start-session and fails before enqueue if readiness is not accepted. Focused validation passed for native RPC, production host routes, native cutover inventory, and `pnpm tsgo:fast`.
- **Completed in boundary-test form:** Provider-time auth lease/recheck. `createEmbeddedRunAuthController` now exposes `recheckProviderAuthLease()`, which verifies the currently selected provider/model auth state immediately before the provider attempt, refreshes expired runtime auth when the existing source credential allows it, fails pre-provider with bounded `AUTH_UNAVAILABLE` or `AUTH_EXPIRED` errors, and returns only redacted credential-source classes such as `env`, `auth_profile`, and `runtime_auth`. `InteractionRuntime` now calls this recheck before `providerClient.runAttempt` and emits bounded success/failure launch timing without raw credential material. Focused validation passed for `src/agents/pi-embedded-runner/run/auth-controller.test.ts`, `src/agents/model-auth-runtime.test.ts`, ``extensions/execution-platform/src/workflows/native-cutover-inventory.test.ts`, and `pnpm tsgo:fast`.
- **Completed in boundary-test form:** Provider runtime readiness is resident generation state, not job payload state. Provider runtime adapters and the Codex app-server readiness path remain internal generation-build implementation details. `OpenClawAgentRuntime.build()` prepares the provider runtime state while building the immutable RuntimeGeneration, and execution jobs reference the generation by id. Native RPC/status/proof projections no longer expose provider-runtime lease payloads or snapshot ids; `modelActivitySeen` remains tied to actual provider/model activity, not bootstrap.
- **Completed in boundary-test form:** Runtime-owned provider subprocess home. The live proof failure `codex app-server exited: code=1` with sqlite unable to open `/home/node/.openclaw/external-auth/codex/state_5.sqlite` proved that provider executable state was still outside RuntimeGeneration ownership. The active cut now makes OpenClaw own one writable runtime home, exposes `OPENCLAW_RUNTIME_HOME=/home/node/.openclaw/runtime`, runs Codex with `CODEX_HOME=/home/node/.openclaw/runtime/providers/codex`, sets provider subprocess `HOME`, `XDG_STATE_HOME`, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, and `TMPDIR` under the same runtime home, removes root-owned `/home/node/.openclaw/external-auth/codex` mounts from compose, and adds `scripts/docker/reconcile-runtime-home.sh` so rebuild/reload import only minimal Codex source state into the OpenClaw-owned provider home and repair ownership before gateway launch. Boundary tests now assert compose, Codex app-server config, stdio transport, reload, rebuild, and runtime-home helpers all use the OpenClaw-owned provider home. Focused validation passed for `extensions/codex/src/app-server/config.test.ts`, `extensions/codex/src/app-server/run-attempt.test.ts`, `extensions/codex/src/commands.test.ts`, `src/agents/openclaw-runtime-home.test.ts`, `extensions/execution-platform/src/workflows/native-cutover-inventory.test.ts`, and `pnpm tsgo:fast`.
- **Completed in boundary-test form:** Single accepted native job start record. `NativeExecutionStartService.start()` now routes through `commitAcceptedNativeExecutionJob()`, which builds the native session payload with `runtimeGenerationId`, derives executable native idempotency from the accepted run key plus generation id, rejects idempotency collisions that point at a different generation, records `execution.session.started`, and stores the executable `runRequest` directly in the job payload. Native child launches use the same accepted-job path. Production `NativeExecutionStartService.start()`, native child launch, and native front-door submit no longer call `startNativeExecutionSession()` for production enqueue.
- **Completed in boundary-test form:** Native RPC accepted-start boundary. `NativeExecutionRpcService.submit()` and `NativeExecutionRpcService.startSession()` require the injected `startExecutionSession` dependency; without it, they fail closed with `native_execution_start_session_not_configured` instead of falling back to the compatibility helper. Gateway composition wires this dependency to `NativeExecutionStartService.start()`. RPC tests inject the start dependency explicitly when they expect execution and include a fail-closed construction test for the missing dependency.
- **Completed in boundary-test form:** Worker accepted payload preservation and invalid-state handling. `NativeExecutionSessionWorkerAdapter` preserves `runtimeGenerationId`, `agentId`, `envelope`, `policyRef`, and `runRequest` during payload normalization and rejects payloads without a resident runtime generation id as `needs_review` with `native_execution_session_worker_runtime_generation_missing`, avoiding retry loops for a job state that provider launch cannot repair.
- **Completed in boundary-test form:** RuntimeGeneration `models.json` authority retirement. `src/agents/admitted-model-catalog-runtime.ts` remains the in-memory catalog builder for the resident generation and refuses to treat an unmarked compatibility registry as native runtime authority. `OpenClawAgentRuntime.build()` owns admitted in-memory catalog construction with `modelRegistryAuthority: "admitted_catalog"` and `allowDynamicLookup:false`; start service and worker paths no longer build admitted model catalogs or read stale sidecar model catalogs as authority. Focused validation passed for `src/agents/admitted-model-catalog-runtime.test.ts`, `src/agents/model-auth-runtime.test.ts`, `src/gateway/native-execution-start-service.test.ts`, `extensions/execution-platform/src/workflows/native-cutover-inventory.test.ts`, and `pnpm tsgo:fast`.
- **Completed in boundary-test form:** RuntimeGeneration provider capability and typed provider-turn phases. The temporary `turnDriver` implementation was deleted and replaced by `src/agents/runtime-provider-capability.ts`, an internal RuntimeGeneration provider capability. `RuntimeGenerationAgentProfile` now carries `providerCapability`, `AgentRuntimeCore` prepares `providerCapability.runTurn(...)`, and `InteractionRuntime` calls the capability with an `AgentTurn` event emitter instead of using a provider-client callback as the native execution mechanism. Codex app-server execution now emits typed phases for `provider_client_starting`, `provider_client_ready`, `thread_binding_started`, `thread_binding_ready`, `provider_request_started`, `model_stream_started`, `tool_call_started`, `tool_call_completed`, `tool_call_failed`, `model_stream_completed`, and `agent_turn_failed`; the RuntimeGeneration capability emits `provider_capability_entered` and `agent_turn_completed`. Native status projection now maps these phases to `provider_preparing`, `provider_request`, `model_active`, `tool_active`, `after_provider_turn`, and `terminal`, so the live proof no longer has to infer provider progress from vague `before_attempt_backend` staleness. Boundary inventory tests now assert `runtime-turn-driver.ts` is absent, provider capability has no harness registry selection, native core/profile use `providerCapability`, and Codex/status both expose the typed provider-turn phases. Focused validation passed for `extensions/execution-platform/src/workflows/native-cutover-inventory.test.ts`, `extensions/codex/src/app-server/run-attempt.test.ts`, `src/agents/openclaw-runtime-home.test.ts`, and `pnpm tsgo:fast`.
- **Completed in boundary-test form:** OpenClaw-native RuntimeJob envelope reducer. The spec now makes the post-turn lifecycle rule explicit: OpenClaw turn/tool/provider/session facts remain the canonical facts, and the RuntimeJob envelope reduces those facts into durable job state immediately after `agent_turn_completed`. `src/gateway/native-execution-session-runtime-job.ts` now records child-start facts, collects shared finish/child evidence, emits bounded `execution.turn.reduced` events, maps accepted `node_finish` evidence to terminal status, maps blocking child evidence to explicit defer/wait, and maps completed turns with no required closeout to `needs_review` instead of leaving the job running under lease renewal. `src/agents/interaction-runtime.ts` now hands native `runtime_generation` turns back to the envelope after provider return instead of using chat-style planning-only/reasoning-only/empty-response retry loops as lifecycle control. Boundary tests assert the reducer, child/finish fact consumption, spec blocker, and no-closeout terminalization behavior. Focused validation passed for `extensions/execution-platform/src/workflows/native-cutover-inventory.test.ts`, `src/gateway/native-execution-session-runtime-job.test.ts`, `pnpm tsgo:fast`, and `git diff --check`.
- **Completed in boundary-test form:** RuntimeGeneration catalog latency correction. Catalog/runtime model resolution now happens during `OpenClawAgentRuntime.build()` for the resident generation. `NativeExecutionStartService.readiness()` projects `agentRuntime.status()` instead of rebuilding the admitted model catalog once per agent or falling through to dynamic provider lookup during readiness. Focused validation passed for `src/agents/admitted-model-catalog-runtime.test.ts`, `src/agents/model-auth-runtime.test.ts`, `src/gateway/native-execution-start-service.test.ts`, `extensions/execution-platform/src/workflows/native-cutover-inventory.test.ts`, and `pnpm tsgo:fast`.
- **Completed in boundary-test form:** Native-readyz execution-scope and configured-model materialization. `NativeExecutionStartService.readiness()` now scopes native readiness checks to execution-platform agent-pack entries instead of every generic configured agent, so stale/missing general assistant runtime dirs do not block native execution proofs. `createAdmittedModelCatalogRuntime()` now materializes configured model refs from `agents.defaults.models`, default primary/fallback refs, and per-agent primary/fallback refs into the admitted in-memory model catalog with deterministic provider defaults for Codex and OpenRouter. This admits configured OpenRouter worker/scout refs such as Kimi and Qwen without treating per-agent `models.json` or network dynamic lookup as authority. Focused validation passed for `src/agents/admitted-model-catalog-runtime.test.ts`, `src/agents/model-auth-runtime.test.ts`, `src/gateway/native-execution-start-service.test.ts`, `extensions/execution-platform/src/workflows/native-cutover-inventory.test.ts`, and `pnpm tsgo:fast`.
- **Completed in boundary-test form:** Native admitted-catalog implicit provider discovery retirement. `createAdmittedModelCatalogRuntime()` now calls the models plan with `discoverImplicitProviders: false`; native admission/readiness are driven by explicit config providers plus configured model refs, not slow plugin/provider discovery. This prevents native-readyz and native admission from becoming a provider catalog refresh path while preserving GPT 5.5 and OpenRouter worker/scout refs through the configured-ref materializer. Focused validation passed for `src/agents/admitted-model-catalog-runtime.test.ts`, `src/agents/model-auth-runtime.test.ts`, `src/gateway/native-execution-start-service.test.ts`, `extensions/execution-platform/src/workflows/native-cutover-inventory.test.ts`, and `pnpm tsgo:fast`.
- **Completed in boundary-test form:** Native-readyz runtime-root creatability check. `NativeExecutionStartService.readiness()` now treats missing transcript/artifact runtime roots as ready when the nearest existing parent directory is writable by the gateway user, returning bounded `exists:false` / `creatable:true` diagnostics. Native-readyz no longer fails simply because runtime-owned transcript/artifact directories have not been created before the first native execution job, while still failing on non-creatable or permission-denied runtime roots. Focused validation passed for `src/agents/admitted-model-catalog-runtime.test.ts`, `src/agents/model-auth-runtime.test.ts`, `src/gateway/native-execution-start-service.test.ts`, `extensions/execution-platform/src/workflows/native-cutover-inventory.test.ts`, and `pnpm tsgo:fast`.
- **Completed in boundary-test form:** Section 5 ProviderClient ownership. `InteractionRuntime` no longer imports `runEmbeddedAttemptWithBackend` and no longer falls back to the embedded backend attempt implementation. The interaction loop now requires the `AgentRuntimeCore` prepared `providerClient.runAttempt` and fails immediately if the core does not supply it. The provider-attempt entrypoint now lives in `src/agents/provider-client-runtime.ts` as `runAgentProviderAttempt`; the old `src/agents/pi-embedded-runner/run/backend.ts` wrapper has been deleted. The prepared provider client adapter label is now `interaction_attempt_runtime`, not `embedded_attempt_backend`.
- **Completed in boundary-test form:** Section 5 native InteractionAttemptRuntime ownership. The actual prompt/tool/provider attempt implementation body now lives in `src/agents/interaction-attempt-runtime/attempt.ts` and exports `runInteractionAttempt` as the primary implementation. The `runEmbeddedAttempt` alias was deleted. `src/agents/pi-agent-attempt-runtime.ts`, `src/agents/pi-agent-attempt-runtime/attempt.ts`, and `src/agents/pi-embedded-runner/run/attempt.ts` were deleted instead of preserved as compatibility shims. Tests and helpers now target the canonical interaction-attempt runtime path. `src/agents/harness/builtin-pi.ts` calls `runInteractionAttempt` directly and labels the fallback as `OpenClaw built-in interaction runtime`; `id: "pi"` remains only as compatibility policy vocabulary pending deletion/renaming.
- **Completed in boundary-test form:** Section 5 ToolRuntime ownership. OpenClaw tool construction, provider schema normalization, MCP bundle materialization, LSP bundle materialization, node-agent native task filtering, allowed tool-name collection, and provider tool-schema diagnostics now live in `src/agents/attempt-tool-runtime.ts` as `buildAttemptToolRuntime`. The PI attempt implementation calls that runtime operation instead of constructing/admitting/materializing tools inline.
- **Completed in boundary-test form:** Section 5 PromptService ownership. System prompt composition, prompt-profile resolution, provider prompt contribution, provider prompt transform, runtime prompt facts, prompt override creation, and provider-context prompt report construction now live in `src/agents/attempt-prompt-runtime.ts` as `buildAttemptPromptRuntime`. The PI attempt implementation consumes the prepared prompt runtime instead of building/reporting/transformation of the system prompt inline.
- **Completed in boundary-test form:** Section 5 InteractionRuntime extraction. The provider/tool interaction loop now lives at `src/agents/interaction-runtime.ts` as a core runtime module. The primary export is `runInteractionRuntime`. The `runEmbeddedPiAgentInteractionRuntime` compatibility alias and old `src/agents/pi-embedded-runner/interaction-runtime.ts` re-export were deleted. `AgentRuntimeCore` lazy-loads `./interaction-runtime.js` and calls `runInteractionRuntime`, not the old embedded-runner path or embedded-named export.
- **Completed in boundary-test form:** Section 5 / Section 7 heavy module-load cut. `AgentRuntimeCore` no longer imports `runEmbeddedPiAgentInteractionRuntime` or `runEmbeddedAttemptWithBackend` at module load. The interaction runtime and backend attempt implementation are lazy-loaded only when the core reaches the actual interaction/backend path.
- **Completed in boundary-test form:** Section 12 / Section 13 run-environment progress optics. `AgentRuntimeCore` emits `run_environment_preparing` and `run_environment_prepared` phases with bounded environment fields, so pre-model stalls in workspace/plugin/models setup are visible as core-owned progress instead of hidden interaction-runtime latency.
- **Completed in boundary-test form:** Section 12 status projection recognizes the caller-owned scheduler and interaction-runtime entry stages instead of depending on legacy lane stages for native progress optics.
- **Completed in boundary-test form:** Section 12 / Section 13 core phase evidence. `agent-runtime-core` phase events are now classified into bounded `execution.launch.timing` runtime events with typed phase data and no raw prompt/provider/tool payloads, so pre-model stalls can be localized to core phases such as `prepare_run`, `before_submit`, `run_interaction_turn`, `after_provider_turn`, and `finishing`.
- **Completed in boundary-test form:** Section 13 runtime-core schema reduction. `AgentRuntimeCoreServiceOwnership` no longer exposes migration-era `wrapped`, `not_extracted`, or `embedded_runner` ownership states. The pass-through `RuntimeAgentExecutor` layer and its `runtimeCoreWrappedServiceIds` / `runtimeCoreNotExtractedServiceIds` optics were deleted rather than preserved. The default runtime core now presents `runtimeCoreId: "agent_runtime_core"` and the provider-attempt adapter presents `adapter: "interaction_attempt_runtime"`; `EmbeddedAgentRuntimeCore` remains only as a compatibility export alias for older imports/tests.
- **Completed in boundary-test form:** Section 14 proof harness and native RPC start/status/control boundary. The native proof script uses resident gateway `/execution/start-session`, `/execution/status`, `/execution/apply-control`, and `/execution/closeout`; inventory tests reject proof/native RPC imports or calls to embedded runner, gateway run-once, queue-runner run-once, and production workflow factories.
- **Completed:** Legacy `ProductionWorkflowExecutionFactory` deletion. `extensions/execution-platform/src/workflows/production-workflow-execution-factory.ts` and its dedicated test were deleted after reachability showed no non-test production imports. The old replay/migration run-once layer is no longer available as a compatibility execution surface.
- **Completed:** Protected core runtime test correction. Core OpenClaw embedded-runner tests were kept/restored and migrated off the deleted `pi-embedded-runner/run/attempt.ts` shim by mocking the current `interaction-attempt-runtime/attempt.ts` / `runInteractionAttempt` boundary. Cleanup now explicitly distinguishes old execution-platform/native-launch architecture deletion from protected out-of-box chat/provider runtime coverage.
- **Completed:** Old Product/Spec proof-admission island deletion. `product-spec-proof-substrate.ts`, `boundary-replay-proof-gate.ts`, their tests, and `scripts/execution-platform-run-proof-framework-executor-subject-split-real-model-proof.mjs` were deleted after reachability showed they only supported the retired proof/replay path. Product/Spec planning domain functionality remains out of scope for this deletion.
- **Validated:** Post-deletion proof-readiness gates pass after the Product/Spec proof-admission island deletion and proof-script metadata cleanup. `pnpm tsgo:fast` passes; `pnpm test:file extensions/execution-platform/src/workflows/native-cutover-inventory.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/runtime-artifact-contracts.test.ts` passes with 39 tests; `pnpm test:file src/gateway/native-execution-start-service.test.ts src/gateway/resident-native-execution-worker-supervisor.test.ts extensions/execution-platform/src/workers/native-execution-session-worker-adapter.test.ts extensions/execution-platform/src/intent-routing/native-execution-rpc.test.ts` passes with 34 tests. The native proof artifact no longer emits stale `oldProductSpecReplay` retirement metadata.
- **Validated:** Focused runtime cutover suite passes for `extensions/execution-platform/src/workflows/native-cutover-inventory.test.ts`, `src/gateway/resident-native-execution-worker-supervisor.test.ts`, `src/gateway/native-execution-start-service.test.ts`, and `extensions/execution-platform/src/workers/native-execution-session-worker-adapter.test.ts`. `pnpm tsgo:fast` passes after the latest AgentTurn, direct-core native execution, ContextManager, production native runner extraction, and runtime-core schema reduction cuts.
- **Validated:** The accepted-start boundary suite passes for `extensions/execution-platform/src/intent-routing/native-execution-rpc.test.ts`, `extensions/execution-platform/src/workflows/native-cutover-inventory.test.ts`, `src/gateway/native-execution-start-service.test.ts`, `extensions/execution-platform/src/workflows/native-agentic-orchestration.test.ts`, and `extensions/execution-platform/src/workers/native-execution-session-worker-adapter.test.ts`. `pnpm tsgo:fast` also passes after the RPC fail-closed and accepted-job commit cut.
- **Validated:** The interaction-attempt ownership suite passes for `extensions/execution-platform/src/workflows/native-cutover-inventory.test.ts` and `pnpm tsgo:fast` passes after moving the provider-turn implementation under `interaction-attempt-runtime`, converting PI attempt files to shims, cleaning the built-in harness label, and changing runtime receipts to `agent_runtime_core` / `interaction_attempt_runtime`.
- **Validated:** The accepted-agent-run executable payload suite passes for `src/gateway/native-execution-start-service.test.ts`, `extensions/execution-platform/src/workers/native-execution-session-worker-adapter.test.ts`, `extensions/execution-platform/src/intent-routing/native-execution-rpc.test.ts`, `extensions/execution-platform/src/workflows/native-cutover-inventory.test.ts`, and `pnpm tsgo:fast` after changing the native execution job artifact/job type to `openclaw.accepted_agent_run`, preserving `runRequest` in the committed job payload, and asserting the executable request carries agent, prompt, tool policy, model profile, workspace roots, transcript path, and runtime-generation metadata.
- **Validated:** Live rebuild/reload completed after the RuntimeGeneration/provider-capability cutover. `scripts/docker/rebuild-gateway.sh` reconciled the OpenClaw-owned runtime home, rebuilt/recreated the gateway container, and `/healthz` returned `{"ok":true,"status":"live"}`.
- **Validated mechanically, not accepted as full proof:** Native orchestration proof run `native-orchestration-20260614T194650Z` reached the resident runtime path and real model activity: `native-readyz` accepted, `start-session` accepted, the RuntimeJob was claimed/running, `providerRequestSeen:true`, `modelActivitySeen:true`, and the live status reached `model_stream_started` about 5.3s after start. The run then reached `after_provider_turn` / `agent_turn_completed` and stayed `running` with lease renewals, proving the remaining failure is post-turn RuntimeJob lifecycle reduction rather than pre-model launch/provider latency. The proof was manually interrupted and the cleanup cancel landed; the RuntimeJob state is `canceled`. The full proof checkbox remains open until the RuntimeJob envelope deterministically terminalizes after the completed turn.
- **Completed in focused-test form:** RuntimeJob envelope reducer cutover. `runNativeExecutionSessionRuntimeJob(...)` now invokes the resident OpenClaw runtime turn, then reduces existing OpenClaw/shared finish evidence into a deterministic RuntimeJob adapter result before lease renewal can become lifecycle authority. A completed turn without accepted `node_finish` and without a blocking child wait records `execution.turn.reduced`, returns `needs_review`, and is terminalized through `RuntimeWorkerSupervisor.markJobNeedsReview(...)`; blocking child evidence reduces to `deferred`; accepted finish evidence maps to the shared finish status. Focused validation passed for `src/gateway/native-execution-session-runtime-job.test.ts`, `extensions/execution-platform/src/workers/runtime-worker-supervisor.test.ts`, and `extensions/execution-platform/src/workflows/native-cutover-inventory.test.ts`.
- **Completed in focused-test form:** Runtime event sink decoupling after provider completion. Live proof rerun `native-orchestration-post-turn-reducer-20260614T211012Z` reached provider/model/tool activity and `agent_turn_completed`, then kept renewing because the core awaited runtime envelope telemetry before returning to the RuntimeJob reducer. `AgentRuntimeCore` now treats `onRuntimeEvent` as non-blocking diagnostic evidence. `src/agents/agent-runtime-core.test.ts` proves a completed native RuntimeJob turn returns even when the runtime event sink never resolves.
- **Completed in boundary-test form:** RuntimeJob post-turn InteractionRuntime maintenance cut. Live proof rerun `native-orchestration-runtime-event-nonblocking-20260614T212225Z` reached provider/model activity and `agent_turn_completed`, then showed the remaining blocker was still inside `InteractionRuntime` after provider return. RuntimeJob turns now bypass actual-usage context-pressure maintenance before reducer handoff, and auth-profile success bookkeeping is non-blocking for `runtime_generation` runs. Normal OpenClaw foreground/chat behavior remains unchanged.
- **Validated mechanically, not accepted as full proof:** Native orchestration proof rerun `native-orchestration-interaction-return-20260614T212936Z` reached `providerRequestSeen:true` / `modelActivitySeen:true` in about 4.5s, completed the provider/model turn, recorded `execution.turn.reduced`, and terminalized through `job.needs_review` instead of renewing indefinitely. The remaining non-accepted condition is now orchestrator closeout behavior: the model did not produce the required `node_finish`/closeout effect, so the RuntimeJob envelope correctly reduced the turn to `needs_review_no_required_closeout`. This is not a launch, pre-provider, Codex auth, lane, or post-turn handoff hang.
- **Completed:** Obsolete native launch helper deletion. `startNativeExecutionSession(...)`, `createNativeExecutionSessionStartTool(...)`, and the `resumeRuntimeJobId` / `resumeRequestId` compatibility schema fields were removed from the production native orchestration module. Tests that existed only to prove the deleted helper/tool/resume behavior were deleted. Current RPC/control/finish/readback tests now seed through an explicit accepted-run test fixture that calls the production `commitAcceptedNativeExecutionJob(...)` boundary, so tests do not resurrect the old launch helper. Boundary inventory rejects the deleted helper, tool adapter, and resume fields. Focused validation passed for `extensions/execution-platform/src/workflows/native-agentic-orchestration.test.ts`, `extensions/execution-platform/src/workflows/native-execution-control.test.ts`, `extensions/execution-platform/src/workflows/shared-execution-finish-service.test.ts`, `extensions/execution-platform/src/work-queue/execution-read-model.test.ts`, `extensions/execution-platform/src/intent-routing/native-execution-rpc.test.ts`, `src/gateway/execution-platform-http.test.ts`, `extensions/execution-platform/src/workflows/native-cutover-inventory.test.ts`, and `pnpm tsgo:fast`.
- **Completed:** Legacy queued bridge / run-once supervisor island deletion. The old `QueuedBridgeRunner`, `runQueuedBridgeRunnerCommand`, queue-runner endpoint handler, fake-completion `ProductionSupervisor`, always-on supervisor boundary proof, production-supervisor design, old queued-bridge/autonomy production scripts, and their obsolete tests were deleted. `extensions/execution-platform/src/codex-bridge/index.ts` no longer exports those surfaces. Boundary inventory now rejects the deleted files and public exports. This deletes execution-platform launch/supervisor compatibility code only; OpenClaw's normal chat/foreground provider/harness wiring remains intact.
- **Completed:** Legacy coding-team run-once runner deletion. `extensions/execution-platform/src/codex-bridge/coding-team-runtime-job-runner.ts` and its direct dynamic-boundary test were deleted, the codex-bridge barrel no longer exports `CodingTeamRuntimeJobRunner`, and stale validation-command strings were repointed to the current native cutover inventory gate. The remaining resident execution owner is the RuntimeJob supervisor/native session runtime job path, not the old agent-team run-once runner.
- **Completed:** Legacy dynamic graph node-runner deletion. `extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts`, its coding-team scheduler adapter, their tests, stale dynamic-runner closeout/proof scripts, and the retired package proof commands were deleted. `extensions/execution-platform/src/codex-bridge/index.ts` no longer exports `DynamicAgentTeamGraphRunner`, `CodexDynamicJsonClient`, or `buildCodingTeamSchedulerExecutorMap`. Runtime-tool adoption metadata and runtime-artifact contract tests no longer name the deleted bridge shim as a production entrypoint. This removes the bridge-era node runner from the current architecture instead of preserving it as a wrapper around the generic scheduler island.
- **Completed:** Stale scheduler-era script cleanup. One-off closeout/proof scripts that referenced deleted dynamic runner or old `RuntimeWorkGraphScheduler` proof paths were deleted, the missing `proof:execution-platform:generic-workflow-runner-retirement` package command was removed, and current scripts no longer point operators at missing generic-retirement proof files.
- **Completed:** Current capability manifest WorkIntent leakage removal. `runtime-node-capability-registry.ts`, `capability-manifest-domain-lifecycle.ts`, and `scheduler-stage-runner.ts` no longer expose `canRunAsWorkIntent` or `work_intent` as active capability lifecycle vocabulary. Current capability summaries now use `canRunAsRuntimeNode` / `runtime_node`, and `SchedulerStageRunner` owns its own `SchedulerStageSnapshotSummary` contract instead of importing the old runtime-work-graph scheduler contract.
- **Completed:** Old scheduler/generic-runner public export removal. `extensions/execution-platform/src/workflows/index.ts` no longer exports `runtime-work-graph-scheduler`, its scheduler contracts, expansion controller, non-Codex task decomposition policy, cost-aware capability policy, `generic-orchestration-runtime`, `generic-orchestration-runtime-execution`, or `generic-runtime-spine` as canonical workflow APIs. The current public orchestration surface is runtime graph persistence, workflow/plugin definitions, and `NodeLifecycleTransitionRunner`; the retired scheduler graph patch/stage-runner APIs are not public workflow APIs.
- **Completed:** Old persisted graph/replay compatibility deletion. The proof-only persisted graph compatibility is not required for real work. `RuntimeWorkGraphScheduler`, its scheduler contracts/test, `runtime-work-graph-superstep`, `runtime-work-graph-expansion-controller`, cost-aware capability policy, non-Codex task decomposition policy, generic orchestration runtime/execution/spine, generic workflow runner retirement contract, boundary replay registry/checkpoint services, boundary replay readback projection, and their dedicated tests were deleted. `WorkflowPlugin`, workflow plugin registry, workflow graph engine, workflow definition registry, and current plugin tests now consume the leaf `workflow-node-execution-contracts.ts` instead of importing the deleted scheduler island.
- **Completed:** WorkIntent/readback compatibility deletion. `work_intent` is no longer a runtime graph node kind, node lifecycle gate special case, capability manifest vocabulary, model-task boundary, or canonical proof-gate transition. `active-graph-progress`, `latest-run-state`, `canonical-readback-gate`, `proof-harness-canonical-gate`, `execution-read-model`, runtime artifact contracts, and readback projection tests no longer project `boundaryReplay`, `staleCheckpointKind`, `checkpoint_boundary`, `stale_checkpoint_fallback`, generic runtime artifacts, or generic runner retirement artifacts. Boundary and no-semantic-cheats tests now assert the deleted surfaces remain absent.
- **Validated:** Launch cleanup deletion suite passed after the old scheduler/generic-runner/replay deletion. `pnpm exec oxlint extensions/execution-platform/src src/gateway/server-methods/chat.ts src/gateway/execution-platform-http.test.ts scripts/lib/tsgo-fast-target-config.test.mjs` passed with 0 errors/warnings; `pnpm test:file extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/workflows/execution-platform-boundary-guardrails.test.ts extensions/execution-platform/src/workflows/runtime-work-graph.test.ts extensions/execution-platform/src/observability/canonical-readback-gate.test.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/runtime-tool-call/runtime-tool-call.test.ts extensions/execution-platform/src/work-queue/projections/readback-projections.test.ts` passed with 125 tests; `pnpm tsgo:fast` passed after falling back to full-repo verification because `package.json` changed.
- **Completed:** Product/Spec, RequirementMap, and scheduler-stage cleanup beyond the first launch deletion. The retired Product/Spec planning docs/prompts/specs, work-queue readbacks, workflow plugin, proof scripts, and package proof commands were deleted. `RequirementMap` and its handoff refs were removed from the active router/front-door request contract, native handoff metadata, UX replay parity payload, runtime artifact contract surface, model-task policy, canonical readback gate, and workflow phase requirements. `SchedulerStageRunner`, `SchedulerGraphPatch`, scheduler graph admission/runtime-tool modules, planning-small-verb surface, and their tests were deleted instead of preserved as proof-era compatibility. Runtime graph tests and model-decision tests now use `graph_compile_plan` / runtime-graph compile vocabulary instead of `scheduler_graph_patch`. The remaining `ProductSpec`, `RequirementMap`, `SchedulerGraphPatch`, `runtime-work-graph-scheduler`, and `generic-workflow-runner-retirement` string hits are negative guard assertions that prove deleted files/payloads stay absent.
- **Completed:** Runtime-tool adoption registry cleanup after scheduler deletion. The `scheduler-toolification`, `runtime-work-graph-node-execution`, and `scheduler-decisions` compatibility aliases were removed rather than re-created. Adoption-boundary tests now assert the generic workflow runner retirement surface remains absent and validate current router/work-queue/kernel surfaces. This keeps the current runtime-tool registry from reanimating deleted scheduler/node-runner architecture.
- **Protected:** OpenClaw out-of-box chat/provider/tool wiring and current coding-worker tools were not deleted in this cleanup. The deletion was limited to execution-platform proof/replay/scheduler/Product-Spec/RequirementMap compatibility surfaces. Current edit, LSP/read/grep/tool runtime, Codex bridge edit evidence, foreground chat/provider path, workflow plugin registry, runtime graph persistence, Work Queue projection, and `NodeLifecycleTransitionRunner` surfaces remain intact unless a later reachability pass proves a specific file is our dead glue rather than OpenClaw or current coding-worker machinery.
- **Validated:** Post-cleanup focused validation passed after the Product/Spec/RequirementMap/scheduler-stage deletion: `pnpm tsgo:fast` passed; `pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/runtime-tool-call/runtime-tool-adoption-boundary.test.ts extensions/execution-platform/src/runtime-tool-call/runtime-tool-call.test.ts` passed with 55 tests; earlier impacted cleanup suite passed for model-decision compiler, workflow definition registry, canonical/proof readback gates, model-task classification, front-door request/compiler/protocol/parity, runtime artifact contracts, runtime graph, architecture transition topology, runtime-tool adoption, and execution read model after stale expectations were removed.
- **In progress:** Sections 1, 3, 5, 8, 9, 12, 13, 15, 16, and 17 remain active until the cohesive runtime modules fully own session/environment/context mechanics and full typed lifecycle/status/proof gates are implemented and verified.
- **In progress:** RuntimeGeneration full live proof remains active until proof/live execution demonstrates GPT 5.5 xhigh plus OpenRouter worker/scout execution through the resident generation and accepted-job path and the orchestrator produces the required closeout effect. Boundary tests, typecheck, rebuild/reload, mechanical model-path proof, launch cleanup, focused post-turn reducer tests, runtime-event nonblocking regression, InteractionRuntime post-turn maintenance gate, and mechanical terminalization proof are green; full proof acceptance is now pending on orchestrator closeout behavior rather than launch/post-turn lifecycle.

**Deep Runtime-State Ownership Decision: Provider State Is Runtime-Owned**

The 2026-06-14 proof-readiness failure exposed the remaining deep architecture error after the RuntimeGeneration launch cutover:

```text
native-readyz: not ready
reason: codex app-server exited: code=1 signal=null
Codex sqlite state: unable to open database file
old executable root: /home/node/.openclaw/external-auth/codex
```

This is not a need for another readiness check. It proves the invariant was still false:

> Boot builds the world. Jobs reference the world. Runtime runs against the world.

The missing cut:

> Gateway boot/reload owns executable runtime state. RuntimeGeneration references it. Execution never discovers or repairs it.

The final provider-state rule:

> External provider state can be imported or migrated, but it must never be the live executable state root.

The simplest durable target:

1. OpenClaw owns one writable runtime home.
2. Provider subprocess state lives under that runtime home.
3. RuntimeGeneration references provider state; it does not copy or materialize a per-job provider world.
4. Codex app-server always runs with `CODEX_HOME=<OpenClaw runtime home>/providers/codex`.
5. Codex app-server also receives `HOME`, `XDG_STATE_HOME`, `XDG_CONFIG_HOME`, `XDG_CACHE_HOME`, and `TMPDIR` under the same OpenClaw runtime home.
6. `/root/.codex` or other host/root Codex state may be an import source, but never the directory the gateway’s Codex process executes against.
7. No job, proof, worker, admission path, or provider adapter decides filesystem ownership.
8. Reload/rebuild owns tiny runtime-home reconciliation before gateway launch.
9. `native-readyz` reports existing runtime-generation state; it must not be the first place that starts, repairs, or discovers Codex executable state.
10. No provider process may execute against externally mounted mutable state.

The active implementation binds this to:

- `src/agents/openclaw-runtime-home.ts`
- `scripts/docker/reconcile-runtime-home.sh`
- `docker-compose.yml`
- `extensions/codex/src/app-server/config.ts`
- `extensions/codex/src/app-server/transport-stdio.ts`

The old root-owned executable state path `/home/node/.openclaw/external-auth/codex` is retired from the live container shape for Codex app-server execution. It may remain only as historical host data or an import source until final host cleanup.

**Current Failure Addendum: Native Admission / RuntimeJob Split-Brain**

The 2026-06-13 native orchestration proof exposed a deeper architecture problem in the admission/start boundary.

The observed failure chain:

1. `native-readyz` originally timed out because readiness rebuilt model/catalog runtime too broadly and fell through toward dynamic provider lookup. This was corrected by using one cached admitted in-memory catalog runtime per config snapshot and `allowDynamicLookup:false`.
2. `native-readyz` then returned `not_ready` because the check scoped itself to every generic configured agent, missing generic agent dirs, configured OpenRouter worker/scout refs, and first-run transcript/artifact directories. This was corrected by scoping readiness to execution-platform agent-pack entries, materializing configured model refs into the admitted catalog, and treating missing transcript/artifact roots as acceptable when the nearest existing parent is writable.
3. After those fixes, native-readyz passed in roughly 460ms, admission preflight passed, and `/execution/start-session` returned an accepted RuntimeJob quickly.
4. The resident worker then failed before provider/model activity with `admission_snapshot_missing`.
5. Runtime events showed the job had `execution.session.started`, `job.artifact_attached`, and `execution.admission.committed`, but the worker still reported `native execution job has no committed admission snapshot`.
6. Code inspection showed the likely cause: `NativeExecutionStartService.start()` correctly passes `runtime.admission` into `startNativeExecutionSession()`, and `startNativeExecutionSession()` includes that snapshot in the payload only when it creates a new payload. But `RuntimeJobRepository.enqueueJob()` deduplicates with `ON CONFLICT (idempotency_scope, idempotency_key) DO NOTHING` and returns the existing row unchanged.
7. Therefore a repeated proof/start can reuse an older RuntimeJob created before admission was embedded in the payload. The start service then attaches new admission artifact/event evidence after enqueue, but the executable job payload remains the stale old payload. The worker reads the payload, not the artifact/event manifest, and correctly fails.

This is not just a bug. It proves the current admission design still has split-brain surfaces:

- executable admission snapshot in RuntimeJob payload;
- bounded admission snapshot artifact metadata;
- bounded `execution.admission.committed` event metadata;
- idempotency state in `RuntimeJobRepository`;
- low-level native session helper owning enqueue and default objective-hash idempotency;
- start service owning admission and post-enqueue evidence repair.

The existing “Snapshot/job recovery beyond payload embedding” slice is incomplete. It repairs missing artifact/event evidence from the snapshot embedded in the job payload. It does not and should not try to reconstruct an executable snapshot payload from bounded artifact/event metadata. The latest proof shows the inverse failure: artifact/event evidence exists, but executable payload admission is missing.

Deep correction:

> Admission must be part of the RuntimeJob executable start record, not a copied sidecar threaded through helper layers.

The new hard rule:

> A native RuntimeJob is dispatchable only when the job record the worker claims contains the exact committed executable admission snapshot or an immutable reference to that exact snapshot. Artifact/event evidence is audit projection, not executable authority.

**Current Failure Addendum: Related Runtime Admission Failures**

The same proof lane also exposed or reconfirmed these architecture failures:

1. Host/runtime path split is too easy to hit. The gateway truth is `/home/node/.openclaw` inside the container, while operator shell work can accidentally touch `/root/.openclaw`. Runtime launch should never depend on operator memory about host/container roots.
2. `models.json` acted like a mutable shadow catalog. Code catalog had GPT 5.5, but admitted runtime could reuse stale or unreadable sidecar state. Native admission must use one admitted model catalog service; `models.json` is compatibility output only.
3. Config schema validation caught bad fields only at gateway restart. Native proof should run fast exact runtime config/schema/model-ref preflight before restart/proof.
4. Pre-provider failure projection was too opaque. Status said an agent/core phase failed but hid actionable safe causes until deeper event inspection.
5. File ownership across host/container is a hidden failure mode. Runtime assets must be checked as the actual gateway user before launch.
6. Gateway startup remains too heavy for iteration. Proof-critical native readiness must be split from full chat/history/sidecar readiness.
7. Objective-hash idempotency is too broad for executable native proofs. Repeated proof runs with the same objective can collide with stale old jobs even after the admitted runtime world changes.

**Deep Architectural Solution: Admitted Native Job Start Record**

Replace “admission snapshot copied into a helper payload plus sidecar evidence” with one native production start operation:

```text
NativeExecutionStartService.start(request)
  -> NativeAdmissionService.commit(request)
  -> commitAdmittedNativeExecutionJob(snapshot, request, envelopeRequestId)
  -> derive bounded artifact/event evidence from the committed job payload
  -> ResidentNativeExecutionWorkerSupervisor claims only dispatchable admitted jobs
```

The low-level session helper may keep pure functions for:

- normalizing visible start input;
- building the session payload object;
- building the task message;
- recording session-start/resume events.

It must not be the production owner of admitted RuntimeJob enqueue/idempotency.

Concrete rules:

1. `NativeExecutionStartService` owns production native start.
2. `NativeAdmissionService.commit()` returns the executable admitted snapshot and its stable hash.
3. `NativeExecutionStartService` constructs the RuntimeJob payload directly from the request plus snapshot.
4. The native executable idempotency key must include the admitted executable world identity: caller/envelope request id plus admission snapshot hash, or an equivalent stable admitted-world hash.
5. Do not default production native execution idempotency to objective-only request hash. Objective-only hashes are too broad and can collide across proof attempts, config/catalog changes, and admission-shape changes.
6. If the caller supplies an idempotency key, treat it as the envelope request key, not the executable job key. The executable job key is derived from that envelope key plus the admitted snapshot hash.
7. If no caller/envelope idempotency key exists, generate a bounded start attempt id at the envelope boundary and return it. Do not silently derive global job identity from objective text alone.
8. On idempotency conflict, load the existing job and validate that its payload admission id/hash exactly matches the committed snapshot for this start. Return `already_started` only if it matches.
9. If the existing job payload is missing admission or has a different admission id/hash, do not silently reuse it. Either create a new admitted job key or fail before dispatch with `NATIVE_ADMISSION_IDEMPOTENCY_CONFLICT`.
10. A job with missing executable admission payload is invalid runtime state. The worker must terminalize it as `failed` or `needs_review` with safe error projection, not retry it three times as though provider launch might succeed.
11. Artifact/event admission evidence is derived from the executable job payload. If artifact/event evidence is missing, it may be repaired from the payload.
12. If payload admission is missing, artifact/event evidence must not be treated as sufficient executable authority unless a future durable full-snapshot store exists and the job references it immutably.
13. The current artifact/event manifests remain audit/status projection only. They should stay bounded and should not become another hidden executable state store.
14. Child native launches derive child snapshot id/hash from parent admitted snapshot lineage and include that child admitted-world hash in child job idempotency. No second child launch admission path.
15. `RuntimeJobRepository` remains generic persistence. It should not decide admission policy. The admission-aware start operation lives in `NativeExecutionStartService` or a narrow `NativeExecutionJobCommitter` owned by that service.
16. `RuntimeJobRepository.enqueueJob()` generic dedupe behavior may stay unchanged for non-native jobs, but native production start must wrap it with admission-payload compatibility checks.
17. `nativeAdmissionSnapshotFromPayload()` should become a strict executable contract check, not a best-effort convenience. Its failure means the job is not dispatchable.
18. Native status should report `invalid_runtime_state` when a native job is pending/running/failed without executable admission in the claimed job payload.
19. Proof start should carry the proof run id as the envelope request id/idempotency key so every proof run can create its own admitted execution unless explicitly resuming a known RuntimeJob.
20. Repeated HTTP/API retries for the same start request should dedupe only inside the same envelope request id and admitted snapshot hash.

This solution removes the deepest failure point by making there be one executable authority at worker claim time:

```text
RuntimeJob.payload.admission  OR  RuntimeJob.payload.admissionRef -> immutable full snapshot store
```

For this cutover, the simplest implementation is `RuntimeJob.payload.admission` as the executable authority, with artifact/event metadata as derived evidence. A future separate snapshot store is only justified if it removes payload size or lifecycle problems; it must still be referenced immutably from the job record.

Required tests:

- starting a native session embeds executable admission in the returned RuntimeJob payload;
- retrying the same envelope request with the same admission hash returns `already_started`;
- retrying with the same objective but a different admission hash does not reuse the stale old job payload;
- an idempotency conflict with missing payload admission fails before dispatch with a safe bounded error;
- worker treats missing payload admission as invalid runtime state and does not retry provider launch;
- artifact/event evidence is repaired from payload when missing;
- artifact/event evidence alone is not treated as executable authority;
- proof harness uses proof run id as envelope idempotency;
- child launches derive child idempotency from child snapshot hash;
- native status surfaces missing-admission invalid state directly.

Required implementation order:

1. Add native admitted-job commit helper owned by `NativeExecutionStartService`.
2. Derive executable native idempotency from envelope request id plus admission snapshot hash.
3. Stop production `NativeExecutionStartService.start()` from relying on objective-hash default idempotency inside `startNativeExecutionSession()`.
4. Keep low-level native session helper pure or compatibility-only for payload/message/event construction.
5. Add payload compatibility check on any idempotent native enqueue result.
6. Change worker missing-admission handling to terminal invalid runtime state, not retryable launch failure.
7. Change proof harness to pass proof run id as envelope idempotency.
8. Add focused tests above.
9. Rebuild/reload.
10. Rerun the native orchestration proof.

Implementation decisions made during the first repair cut:

- `NativeExecutionSessionWorkerAdapter` must preserve `payload.admission` when normalizing a native execution session payload. A generic payload parser must never strip executable runtime state.
- `NativeExecutionSessionWorkerAdapter` now rejects a native session payload without admission before runner invocation with `needs_review` and `native_execution_session_worker_admission_snapshot_missing`. Missing admission is invalid runtime state, not a provider-launch retry.
- `startNativeExecutionSession()` now derives native idempotency from the envelope idempotency key plus a stable admitted-world hash when `runtime.admission` is present.
- The admitted-world hash intentionally excludes volatile random snapshot ids and root snapshot ids for root snapshots, so an HTTP retry that rebuilds the same admitted world can still dedupe.
- A pre-admission job using the same envelope idempotency key is not reused by a later admitted start. The admitted start gets a different executable idempotency key.
- If an admitted start hits an idempotent existing row, the returned job payload admission must hash to the same admitted-world hash. Otherwise the start path fails before dispatch with an admission idempotency conflict.
- `NativeExecutionRpcService.submit()` must call the injected `startExecutionSession` dependency when starting the native front-door job, not call `startNativeExecutionSession()` directly. Production front-door start must route through `NativeExecutionStartService.start()` when the gateway wires that dependency.
- `startNativeExecutionSession()` remains available for tests/debug/compatibility and pure session payload/message/event behavior, but production admitted native start should be owned by `NativeExecutionStartService`.

Additional native boundary decisions to preserve verbatim:

> The deeper simplification is to make “native execution” a single admitted job lifecycle, not a workflow helper plus an admission overlay plus an RPC fallback.
> I see four further cuts that reduce moving parts: make native RPC require the admitted start service, make the worker adapter require a real admission shape,
> move session payload/event helpers under the admitted-start boundary, and turn startNativeExecutionSession into compatibility/test-only until deletion. I’ve
> started the first cut and I’m validating it now.

> Yes. The right direction is: native RPC should be an OpenClaw service boundary that is always composed with the native start service by the gateway, not a
> self-sufficient mini-runner with fallback execution. The failing tests are now exposing old unit-test assumptions: they instantiate RPC without the admitted
> start service and expected it to execute anyway. I’m going to update those tests to inject a start dependency explicitly, and keep production fail-closed.

**Target Final Architecture: One Native Admitted Job Start**

The final architecture must remove the split between “session helper starts a job” and “admission service attaches admitted evidence.” There should be one production native start owner:

```text
NativeExecutionStartService
  -> NativeAdmissionService
  -> NativeExecutionJobCommitter
  -> RuntimeJobRepository
  -> ResidentNativeExecutionWorkerSupervisor
  -> OpenClawAgentRuntime
  -> AgentRuntimeCore
```

Ownership:

- `NativeExecutionStartService` owns production native start/preflight.
- `NativeAdmissionService` owns construction, validation, stable admitted-world hashing, parent/child lineage, and state transitions for admitted snapshots.
- `NativeExecutionJobCommitter` owns admitted RuntimeJob creation/reuse compatibility: payload construction, idempotency, start event, admission artifact/event derivation, and executable-admission validation.
- `RuntimeJobRepository` remains generic persistence only. It does not know native admission policy.
- `NativeExecutionSessionWorkerAdapter` validates and passes through executable admission. It must not sanitize away admitted runtime state.
- `ResidentNativeExecutionWorkerSupervisor` owns claiming and dispatch only. It does not discover model/path/config truth.
- `OpenClawAgentRuntime` owns accepted-run-to-turn entry.
- `AgentRuntimeCore` consumes the admitted agent profile and runtime roots. It does not rediscover launch truth.

Final production flow:

1. Request enters native start/preflight.
2. `NativeAdmissionService.commit()` constructs the executable admitted world:
   - runtime roots;
   - model identity;
   - admitted request parameters;
   - auth class;
   - prompt profile/hash;
   - tool policy/hash;
   - authority scope;
   - lineage;
   - raw-storage safety flags.
3. `NativeExecutionJobCommitter.commitAdmittedJob()` creates or reuses a RuntimeJob only when the existing job has a compatible admitted-world hash.
4. RuntimeJob payload contains the executable admission snapshot, or an immutable `admissionRef` if a future full-snapshot store replaces embedding.
5. Admission artifact/event evidence is derived from the executable job payload/ref.
6. Worker claims only jobs with executable admission.
7. Worker marks missing/incompatible admission as invalid runtime state / needs review, not retryable provider failure.
8. Agent runtime consumes the snapshot and runs. No model/path/config rediscovery occurs in the hot launch path.

Final anti-patterns to remove:

- production code calling `startNativeExecutionSession()` for admitted job enqueue;
- objective-hash idempotency as executable native job identity;
- artifact/event evidence acting as executable admission authority;
- generic payload normalization dropping executable runtime fields;
- proof/front-door/child launch using different native start paths;
- RuntimeJob repository deciding admission policy;
- worker retrying missing-admission jobs as if provider launch might recover;
- `models.json`, per-agent dirs, config reload, plugin lookup, or host/container path guesses participating in worker launch.

Final helper boundaries:

- `startNativeExecutionSession()` may remain only as compatibility/debug or be reduced to pure exported helpers:
  - `normalizeStartExecutionSessionVisibleInput`
  - `buildNativeExecutionSessionPayload`
  - `buildNativeExecutionTaskMessage`
  - `buildRuntimeExecutionEventData`
  - `recordNativeExecutionSessionStartedEvent`
  - resume-event helpers if still needed
- It must not be the production admitted RuntimeJob enqueue owner.
- If keeping the function temporarily, production inventory tests must prove `NativeExecutionStartService.start()` and native front-door submit do not call it for admitted job enqueue.

**Deep Simplification Decisions: One Admitted Agent Run**

Newest architectural simplification decision:

> Simplest. Most elegant. Fewest moving parts. Fewest failure points. Wired tightest to the out of the box OpenClaw systems.

The deeper simplification is to stop treating this as a “native execution session workflow” and make it a generic admitted agent run.

The cleanest final shape:

```text
Gateway / Orchestrator / Child Agent
  -> NativeExecutionStartService
  -> NativeAdmissionService
  -> RuntimeJob<AdmittedAgentRun>
  -> Resident RuntimeWorkerSupervisor
  -> AgentRunWorkerAdapter
  -> OpenClawAgentRuntime
  -> AgentRuntimeCore
```

The main cuts:

1. Replace `NativeExecutionSessionPayload` with `AdmittedAgentRun`.
   The RuntimeJob payload should directly carry:

   ```ts
   {
     artifactKind: "openclaw.admitted_agent_run",
     runRequest: AgentRunRequest,
     admission: NativeExecutionAdmittedRuntimeSnapshot,
     closeoutPolicy,
     lineage
   }
   ```

   That removes a translation layer where admission/session/request state can drift.

2. Demote “native execution session” to metadata.
   `openclaw.native_execution_session` should not be the core execution concept. It is really an admitted agent run with native lifecycle ownership. Keep session IDs and work item refs as metadata, not as a parallel workflow payload model.

3. Collapse preflight/start/readiness onto one admission path.
   Same resolver. Same model catalog. Same runtime roots. Same validation.

   ```text
   NativeAdmissionService.check(request)
   NativeAdmissionService.commit(request)
   ```

   `check` does not enqueue. `commit` enqueues. No separate logic path.

4. Remove caller-owned idempotency policy.
   Callers should pass a `requestId` if they have one. They should not choose `idempotencyScope`, `idempotencyKey`, or objective hashes. The start service derives executable identity from:

   ```text
   requestId + admittedWorldHash + parent lineage
   ```

   That eliminates a whole class of stale-job collisions.

5. Make the worker generic.
   `NativeExecutionSessionWorkerAdapter` can become `AgentRunWorkerAdapter`. It should accept only admitted agent-run jobs, validate executable admission, and call `OpenClawAgentRuntime.runAcceptedNativeExecution()`. No native-session-specific parsing.

6. Move session payload/event helpers under start-service ownership.
   `startNativeExecutionSession()` should stop being a compatibility helper with execution semantics. Its remaining useful pieces should move under the admitted start boundary or become pure test fixtures. Then delete it after proof-gated cleanup.

7. Finish removing legacy `RunEmbeddedPiAgentParams` from the core boundary.
   `AgentRuntimeCore` still takes `AgentRunRequest` plus legacy params. Final form should be one normalized request into the core. Legacy chat can adapt into that request before the core. The core should not live in two worlds.

8. Use OpenClaw native services, not native-execution-specific copies.
   Admission should consume the existing config service, agent pack registry, prompt profile system, tool catalog, transcript store, context manager, model auth runtime, and RuntimeJob repository. Native execution should provide lifecycle policy, not parallel mechanics.

The deepest simplification principle:

> One admitted agent-run record is the executable truth. Everything else is projection, status, or compatibility pending deletion.

That gives us fewer ways to fail: no workflow helper fallback, no sidecar catalog authority, no artifact/event executable split, no duplicated idempotency policy, no native-session payload translation, and no worker rediscovery of launch truth.

**Deep Simplification Decisions: Native Interaction Attempt Ownership**

The active provider/tool/prompt attempt implementation must not be owned by `pi-agent-attempt-runtime`. That old name preserves the wrong architectural identity.

Decision:

- The actual attempt implementation body moves under `src/agents/interaction-attempt-runtime/attempt.ts`.
- The primary implementation export is `runInteractionAttempt`.
- The `runEmbeddedAttempt` alias was deleted after legacy imports/tests were moved to `runInteractionAttempt`.
- `src/agents/pi-agent-attempt-runtime.ts` and `src/agents/pi-agent-attempt-runtime/attempt.ts` were deleted instead of kept as compatibility shims.
- `src/agents/pi-embedded-runner/run/attempt.ts` was deleted instead of kept as a compatibility shim.
- The built-in harness should call `runInteractionAttempt` directly. It may keep `id: "pi"` temporarily as compatibility policy vocabulary, but the executable attempt owner is interaction-attempt runtime.
- Runtime receipts should use `interaction_attempt_runtime`, not `interaction_attempt_runtime` or `embedded_attempt_backend`.
- The default runtime core should present as `agent_runtime_core`, not `agent_runtime_core`.

This is a naming/ownership cut, not a semantic rewrite. The provider/tool/prompt behavior should move nearly verbatim so validation proves the same behavior now lives under the native core boundary.

Target admitted job commit API:

```ts
type CommitAdmittedNativeExecutionJobInput = {
  runtimeJobs: RuntimeJobRepository;
  request: StartExecutionSessionVisibleInput;
  snapshot: NativeExecutionAdmittedRuntimeSnapshot;
  runtime: NativeExecutionSessionRuntimeOptions;
  envelopeIdempotencyKey: string;
  envelopeIdempotencyScope: string;
  now?: () => Date;
};

type CommitAdmittedNativeExecutionJobResult = {
  status: "started" | "already_started";
  runtimeJob: RuntimeJob;
  runtimeJobId: string;
  sessionId: string;
  agentProfile: string;
  taskMessage: NativeExecutionSessionTaskMessage;
  refs: NativeExecutionRef[];
  event: RuntimeJobEvent;
  admittedWorldHash: string;
};
```

Commit rules:

- Compute `admittedWorldHash` from stable admitted-world content, excluding random snapshot ids where appropriate.
- Derive executable job idempotency key from `envelopeIdempotencyKey + admittedWorldHash`.
- Enqueue payload containing executable admission.
- If conflict returns an existing row, validate existing payload admission hash equals `admittedWorldHash`.
- If validation fails, reject before dispatch.
- Record exactly one `execution.session.started` event for the executable job idempotency key.
- Attach/repair exactly one admitted-snapshot artifact and exactly one `execution.admission.committed` event derived from payload admission.
- Return existing job only when all executable-admission compatibility checks pass.

Status rules:

- `running` without executable admission is impossible.
- If encountered anyway, project `invalid_runtime_state`.
- Status should surface `runtimeSnapshotId`, `snapshotState`, `admittedWorldHash`, resolved model identity, request parameter summary, prompt/tool hashes, latest launch phase, and latest safe error.

Proof rules:

- Proof uses resident gateway/native RPC only.
- Proof supplies proof run id as envelope idempotency key.
- Proof never mutates config/model sidecars.
- Proof never imports source runner internals.
- Proof fails before enqueue if admission/preflight cannot construct the executable world.
- Proof succeeds only if model/provider activity is reached through the admitted job start path.

Deletion rules after proof:

- Delete or demote production `startNativeExecutionSession()` enqueue behavior.
- Delete native start bypasses in front-door submit and child launch.
- Delete legacy run-once/debug start paths after representative proof passes.
- Delete old deterministic product/spec replay and scheduler/intake surfaces after proof-gated cleanup.

**1. Final Runtime Shape**

Final dependency direction:

```text
Envelope
-> OpenClawAgentRuntime
-> AgentRuntimeCore
-> cohesive runtime modules
```

For native execution:

```text
RuntimeJob claim/lease: ResidentNativeExecutionWorkerSupervisor
Accepted-run entry: OpenClawAgentRuntime
Turn lifecycle: AgentRuntimeCore
Session/write lock: SessionRuntime
Provider/tool loop: InteractionRuntime
Context pressure: ContextManager
Status: RuntimeJob event projection
```

Equivalent flow:

```text
RuntimeJob
-> ResidentNativeExecutionWorkerSupervisor
-> OpenClawAgentRuntime
-> AgentRuntimeCore
-> RunEnvironment / SessionRuntime / InteractionRuntime / ContextManager / RuntimeEventSink
```

For chat:

```text
Chat/HTTP
-> foreground command policy
-> OpenClawAgentRuntime
-> AgentRuntimeCore
-> same cohesive runtime modules
```

There must be one shared agent engine with different envelope policies, not parallel chat/native agent systems.

**2. Hard Dependency Rules**

Enforce with import-boundary tests:

```text
AgentRuntimeCore must not import pi-embedded-runner/run.ts
AgentRuntimeCore must not call runEmbeddedPiAgentCore
runtime modules must not call runEmbeddedPiAgentCore
runtime modules must not import production run-once
legacy embedded wrapper may call AgentRuntimeCore
production HTTP must not import native job runner/run-once
native RPC must not synchronously execute jobs
proof harness must not import source runner internals
```

The dependency inversion is the point. If `AgentRuntimeCore` still delegates the actual turn to embedded-runner internals, the refactor is not complete.

**3. Make `AgentRuntimeCore` Own The Turn State Machine**

`AgentRuntimeCore` should be the turn orchestrator, not a giant file and not a metadata wrapper.

Explicit lifecycle:

1. `prepareRun`
2. `openSession`
3. `beforeSubmit`
4. `runInteractionTurn`
5. `afterProviderTurn`
6. `handleOverflowOrCompaction`
7. `finish`

`AgentRuntimeCore` owns sequencing, cancellation checks, typed events, and terminal result construction.

Runtime modules own mechanics.

**4. Delete Pass-Through Executors**

Do not keep a pass-through executor as another hidden scheduler. If a layer only forwards an accepted run into the runtime core, delete it and make the owning envelope call `OpenClawAgentRuntime` / `AgentRuntimeCore` directly.

Clean ownership split:

- `ResidentNativeExecutionWorkerSupervisor` owns RuntimeJob claim/lease.
- `OpenClawAgentRuntime` owns accepted-run-to-turn entry.
- `SessionRuntime` owns session/workspace write lock.
- `AgentRuntimeCore` sequences them.

**5. Use Cohesive Runtime Modules, Not A Service Mesh**

Do not split the turn into seven independently clever services on day one. Avoid turning the embedded-runner monolith into a service-mesh monolith.

Extract cohesive modules:

`RunEnvironment` owns:

- workspace roots
- config snapshot
- model/auth admission
- provider auth
- model resolution
- model fallback eligibility
- auth-profile cooldown handling
- provider/model diagnostic receipts
- runtime plugin admission where required
- sandbox/workspace runtime identity

`SessionRuntime` owns:

- session manager open/read/write
- transcript policy
- session file repair/prewarm
- session/workspace lock handling
- bounded custom event append
- transcript append/read primitives
- synthetic tool-result policy
- provider wait lock handoff
- no DB/write transaction held across provider waits

`InteractionRuntime` owns the tightly coupled prompt/tool/provider loop:

- bootstrap context
- prompt profile
- provider system prompt contribution
- system prompt build
- system prompt report/receipt
- prompt profile byte accounting
- provider-context admission checks
- OpenClaw tools
- native runtime tools
- LSP/MCP tools
- client tools
- tool schema normalization
- tool allow/required policy
- node/native tool filtering
- execution-scout tool filtering
- tool catalog summary/receipt
- SDK session creation
- provider stream function selection/wrapping
- extra params
- provider request/retry/attempt lifecycle
- provider error normalization
- usage normalization
- tool-loop execution

Prompt, tool catalog, SDK session creation, provider stream wrapping, and tool-loop execution are tightly coupled. Extract them together first as `InteractionRuntime`; split later only if real pressure appears.

Implementation rule for `InteractionRuntime`:

- move the existing provider/tool-loop behavior almost verbatim;
- preserve visible behavior;
- preserve result shape;
- preserve provider/tool-loop semantics;
- change ownership/import direction;
- do not introduce prompt/tool/provider semantic rewrites in the same pass.

`ContextManager` owns:

- token accounting
- context runtime
- context pressure estimation
- deterministic pruning
- overflow handling
- compaction
- continuation packet construction

Its lifecycle must be small:

- `beforeSubmit`
- `afterProviderTurn`
- `onOverflow`
- `buildContinuation`

No compaction policy should remain scattered across prompt prep, attempt retry, transcript replay, provider error handling, or proof-specific code.

`RuntimeEventSink` owns:

- typed bounded runtime events
- prompt/provider/tool diagnostics receipts
- no raw prompts
- no raw provider payloads
- no raw tool logs
- no raw tool bodies
- no hidden reasoning

Avoid ornamental wrappers. These modules must own executable behavior, not just prepare metadata and then hand control back to the embedded runner.

**6. Retire The `agentRuntimeCore` Param Bundle**

The former `agentRuntimeCore` param bundle was a bridge shim, not final architecture.

Retire it fully.

Do not keep passing ownership receipts into embedded-runner internals as the main integration method. The core should call cohesive runtime modules directly.

**7. Turn Embedded Runner Into Compatibility Shell**

After extraction:

- `runEmbeddedPiAgent` adapts old foreground params into a legacy invocation at the envelope edge.
- It calls `DefaultAgentRuntimeCore` directly.
- It does not rediscover model/auth.
- It does not rebuild prompts.
- It does not construct tools.
- It does not own transcript setup.
- It does not own compaction.
- It does not own provider attempt execution.
- It does not own retry/fallback state machine.

The embedded runner can remain temporarily only as a legacy adapter for old callers. It is no longer an execution owner.

**8. Runtime Lock Ownership**

Do not let scheduler, transcript code, and provider code acquire unrelated session/write locks.

Final rule:

- `ResidentNativeExecutionWorkerSupervisor` owns RuntimeJob claim/lease.
- `OpenClawAgentRuntime` owns accepted-run-to-turn entry.
- `SessionRuntime` owns session/workspace write lock.
- `SessionRuntime` writes through that lock.
- Provider waits must not hold DB transactions.
- Provider waits must not hold write locks.
- Tool waits must not hold DB transactions.
- Cancellation must be observed during:
  - scheduler wait
  - session lock wait
  - model/auth prep
  - context runtime prep
  - provider request
  - tool execution
  - compaction
  - validation child tasks

**9. Reduce Runtime Schemas**

Keep `AgentRunRequest` small:

- `agentId`
- `input`
- `promptProfile`
- `toolPolicy`
- `modelProfile`
- `workspace`
- `transcript`
- `abortSignal`
- `metadata`

Do not add nested module config objects to `AgentRunRequest`. The request describes the run; modules derive execution details.

Remove or retire as primary seams:

- `agentRuntimeCore` param bundle
- embedded-runner-specific prompt setup
- embedded-runner-specific tool setup
- duplicate model/auth discovery paths
- duplicate prompt-building paths
- duplicate tool-catalog construction paths
- multiple workspace/session root resolution paths
- string stage labels used as logic

Use one compact `AgentRuntimeEvent` envelope:

- `jobId`
- `sessionId`
- `runId`
- `phase`
- `component`
- `elapsedMs`
- `status`
- bounded `diagnostics`

Use `component`, not both `module` and `service`.

Never include raw prompt, raw provider payload, raw logs, raw tool body, hidden reasoning, or giant metadata.

**10. Finish Resident Native Worker Dispatch**

Move resident supervision fully out of HTTP.

Final shape:

```text
HTTP/native RPC
-> create RuntimeJob
-> resident supervisor wake
-> RuntimeJob claim/lease
-> OpenClawAgentRuntime
-> AgentRuntimeCore
```

Concrete requirements:

- `execution-platform-http.ts` must not define `ResidentNativeExecutionWorkerSupervisor`.
- `execution-platform-http.ts` must not import or call `runGatewayNativeExecutionSessionRuntimeJob`.
- `resident-native-execution-worker-supervisor.ts` owns:
  - queue wake
  - claim loop
  - child scheduling
  - dispatch failure events
  - drain
- HTTP only starts, polls, and controls jobs.
- Child native execution launch schedules another resident-supervisor job asynchronously; it must not synchronously recurse into run-once.

**11. Delete Production Run-Once Ownership**

Production code must not reference:

- `runGatewayNativeExecutionSessionRuntimeJobOnce`
- `runGatewayAgentTeamRuntimeJobOnce`
- `handleExecutionPlatformQueueRunnerHostRoute`

If a debug helper remains temporarily, it must be explicitly debug/compat named and unreachable from:

- production route matching
- native RPC
- front-door submit
- resident worker dispatch
- normal proof path

No HTTP long-running execution path.

Do not start by deleting every old file blindly. First make production execution impossible to route through old ownership. Then delete old code once the cut is proven.

**12. Typed Runtime Lifecycle**

Replace stringly launch-stage logic with typed phases:

- `job_claimed`
- `scheduler_entered`
- `agent_core_starting`
- `prepare_run`
- `open_session`
- `before_submit`
- `provider_request`
- `model_active`
- `tool_active`
- `after_provider_turn`
- `compacting`
- `finishing`
- `terminal`

Status is a projection of RuntimeJob events. It must not return raw prompts, raw provider payloads, raw logs, raw tool bodies, or workflow internals.

Use typed phases for logic. Display labels can be strings, but business logic should not depend on arbitrary stage strings.

Typed phases must remain observability and stale-progress signals, not a second workflow/routing system.

**13. Progress-Stale Rule**

A native job may run as long as meaningful progress continues.

If a running job has no meaningful phase progress inside the stale interval, terminalize with:

- exact stuck phase
- scheduler class
- session lock state
- queue/claim diagnostics
- bounded recent events

This is progress-based, not an arbitrary fixed budget.

**14. Proof Harness Shape**

Proof harness must only perform:

- `start`
- `status`
- `control`
- artifact assertions

It must not execute jobs directly. It must not import source runner internals. It must not use cold source run-once as canonical proof behavior.

Cold source scripts can remain only as explicit debugging tools until deletion.

**Updated Proposal: Native Runtime Admission Snapshot**

Core correction: native launch must consume one admitted runtime snapshot. It should not discover runtime truth through config files, generated `models.json`, per-agent folders, plugin fallbacks, proof guesses, container ownership side effects, worker-local model lookup, or hidden prompt/tool/provider parameter drift.

Final shape:

```text
NativeExecutionStartService.start(request)
  -> NativeAdmissionService.commit(request)
  -> RuntimeJob + AdmittedRuntimeSnapshot committed together
  -> RuntimeEventSink.emit(job_admitted)
  -> NativeExecutionWorkerSupervisor
  -> AgentRuntimeCore(snapshot.agents[agentId])
```

Not:

```text
config + models.json + per-agent dirs + plugin fallback + proof script guesses
```

The deeper rule:

> Admission is construction of the executable world.

The final architecture should not be:

```text
validate -> enqueue -> rediscover while running
```

It should be:

```text
construct admitted world -> enqueue immutable world -> execute
```

No native execution job enters `running` unless the runtime world has already been admitted, persisted, and made immutable for that job.

**1. Three Public Native Launch Services**

Collapse the public service set to three:

- `NativeExecutionStartService`: start/preflight entrypoint.
- `NativeAdmissionService`: builds, loads, derives, and lifecycle-manages snapshots.
- `AdmittedModelCatalogService`: resolves model catalog snapshots.

Everything else is private implementation detail.

Do not expose `GatewayRuntimeSnapshotService` as a public subsystem. That invites another standalone launch surface. If a snapshot builder exists, keep it private inside admission.

**2. NativeExecutionStartService Owns Start**

Add `NativeExecutionStartService` as the only public start/preflight entrypoint.

It owns:

```ts
NativeExecutionStartService.preflight(request);
NativeExecutionStartService.start(request);
```

`start(request)` calls:

```text
NativeAdmissionService.commit(request)
RuntimeJobStore.commitAdmittedJob(snapshot, job)
RuntimeEventSink.emit(job_admitted)
```

inside one transaction or one recoverable unit.

This avoids overloading `RuntimeJobRepository` with admission policy while still preventing:

- snapshot committed but job creation failed;
- job created without snapshot;
- proof preflight validating one world while start enqueues another.

Hard rules:

- no RuntimeJob enqueue without a committed admission snapshot;
- no separate proof-only start logic;
- no start path that bypasses `NativeExecutionStartService`.

**3. RuntimeJobStore Atomicity / Recovery**

“Committed together” needs an implementation rule.

If the persistence layer can do one transaction across snapshot/job/artifacts, use it.

If not, use an outbox-style recoverable unit:

1. write snapshot as pending;
2. create job referencing snapshot;
3. mark snapshot admitted;
4. emit `job_admitted`;
5. if interrupted, recovery deletes or completes the pair.

There must never be a healthy executable job without a committed snapshot, and there must never be an orphan admitted snapshot that looks runnable.

**4. One Public Admission API**

Add `NativeAdmissionService` as the single launch admission owner.

Public API:

```ts
NativeAdmissionService.dryRun(request);
NativeAdmissionService.commit(request);
NativeAdmissionService.load(snapshotId);
NativeAdmissionService.deriveChild(parentSnapshotId, childRequest);
NativeAdmissionService.markSnapshotState(snapshotId, state);
```

Modes:

- `dryRun`: used by proof/preflight/status diagnostics.
- `commit`: used by start/enqueue.
- `load`: used by the worker to load the committed snapshot.
- `deriveChild`: used when an orchestrator launches child workers.
- `markSnapshotState`: used for lifecycle transitions.

`dryRun` and `commit` execute the same checks through the same code path. `commit` persists the admitted snapshot and returns its id. The worker consumes only that committed snapshot.

Hard rules:

- no native worker launch from an uncommitted dry-run result;
- no separate proof-only admission logic;
- no provider attempt without a loaded committed snapshot.

**5. AdmittedRuntimeSnapshot Shape**

Use one admitted launch object:

```ts
AdmittedRuntimeSnapshot {
  id,
  state,
  runtimeRoots,
  configSnapshotId,
  catalogSnapshotId,
  agents,
  auth,
  compatibility,
  diagnostics
}
```

`runtimeRoots`:

```ts
{
  (canonicalSourceRoot, runtimeWorkspaceDir, transcriptRoot, artifactRoot);
}
```

`agents` maps agent id to:

```ts
{
  (promptProfile, promptProfileHash, toolPolicy, toolPolicyHash, model, authorityScope);
}
```

`model`:

```ts
{
  requestedRef,
  canonicalRef,
  provider,
  transport,
  modelId,
  catalogSnapshotId,
  resolutionSource,
  request: {
    reasoning,
    reasoningEffort,
    thinking,
    maxTokens,
    temperature,
    parallelToolCalls,
    toolChoice,
    contextWindowTokens
  }
}
```

This avoids loose fields like `resolvedAgentModelRefs`, `promptProfile`, `toolPolicy`, `provider`, `runtimeProvider`, and hidden request knobs floating separately.

The snapshot also records:

- expected runtime uid/gid
- auth capability and provider identity
- worker/scheduler readiness
- compatibility artifact status if still required
- redacted proof-visible summary

Host/container path details should be diagnostic/status-only unless needed for audit. Do not spread host/container path pairs through job payloads.

Runtime truth should live in RuntimeJob persistence and bounded artifacts, not only under `.openclaw` as a file. Files can be compatibility/materialized views.

**6. Snapshot Lifecycle**

Add explicit snapshot states:

- `admitted`
- `consumed`
- `stale`
- `revoked`

Keep transitions simple. Operationally, the state should answer only:

- can start new job?
- can continue existing job?
- must terminate?

Rules:

- new jobs may use only `admitted` snapshots created for that start request;
- when a worker claims/starts the job, mark snapshot `consumed`;
- running jobs may continue with `consumed`;
- new jobs cannot use `stale` or `revoked`;
- config/catalog/root changes mark affected future snapshots stale, not already-running jobs;
- unrecoverable security/auth/runtime-root changes may revoke affected snapshots.

This prevents stale catalog/config confusion without creating another workflow system.

**7. Runtime Locator Inside Admission**

Add one authoritative runtime locator used inside admission. The operator/proof should never need to remember whether the gateway uses `/root/.openclaw` or `/home/node/.openclaw`.

Expose a cheap “native runtime doctor” diagnostic endpoint/command that reports only redacted facts:

- runtime roots
- config hash
- catalog hash
- gateway user uid/gid
- native-ready state
- required agent model refs
- whether required files are readable/writable by the gateway user

This check must run in the same runtime identity as the gateway/worker, not as host root.

The doctor is read-only diagnostics. It must not mutate catalogs, refresh auth, materialize compatibility files, decide admission, or create executable state.

**8. Readiness And Doctor Semantics**

Collapse readiness and doctor semantics around the same dependency view:

- `native-readyz`: machine health for automation.
- `native doctor`: human/operator diagnostics.

Both read from admission dependencies. Neither builds a job world. Only `NativeAdmissionService.commit` creates executable state.

**9. Single Admitted Model Catalog Owner**

Add `AdmittedModelCatalogService` as the one model boundary.

It owns:

- provider/plugin catalogs
- config overrides
- synthetic/ChatGPT auth availability
- OpenRouter dynamic lookup
- provider-family aliases
- exact model-ref validation for every agent profile
- one catalog snapshot id/hash

There should be only three model catalog concepts:

- source provider catalogs/plugins
- admitted runtime catalog snapshot
- compatibility `models.json` generated from the snapshot only

No separate model fallback resolver should be exposed to launch, proof, or worker code. No fourth per-agent mutable shadow truth.

**10. Explicit Catalog Refresh Policy**

Dynamic provider lookup must not happen unpredictably during model launch.

Policy:

- operator/admin refresh updates the admitted catalog;
- proof can request preflight refresh explicitly;
- hot launch uses existing admitted catalog snapshot only;
- if a requested model is absent, admission fails fast with a clear “catalog refresh required” or “model unavailable” error.

This prevents OpenRouter or provider discovery from becoming another pre-model latency trap.

`native-readyz` must not perform slow provider discovery on every health call. It should report whether the admitted catalog is present, fresh enough, and contains required agent model refs.

**11. Provider-Family Alias Rules**

`openai-codex/gpt-5.5 -> codex/gpt-5.5` should be a provider-family rule, not a one-off GPT 5.5 patch.

OpenRouter prefixed/unprefixed refs should use the same catalog owner:

- `openrouter/moonshotai/kimi-k2.6`
- `moonshotai/kimi-k2.6`

Resolution must be explicit in the model identity and safe to inspect.

**12. Provider Request Parameters Are Admitted**

The real executable model contract is not only provider/model id.

Admission must freeze:

- provider
- model
- auth class
- reasoning
- reasoning effort
- thinking flag/native thinking mode
- max tokens
- temperature
- parallel tool calls
- tool choice
- context window
- prompt profile
- prompt profile hash
- tool policy
- tool policy hash
- authority scope

If these stay outside admission, we can resolve the right model and still send the wrong request.

**13. Auth Snapshot Boundary**

The snapshot records:

- auth capability
- provider identity
- credential source class
- whether synthetic/ChatGPT auth is available

It must not store secrets.

At provider-call time, runtime performs a cheap auth lease/recheck against the same resolved provider.

Auth recheck semantics:

- check credential availability/expiry/class;
- do not refresh provider catalogs;
- do not mutate model admission;
- fail with `AUTH_UNAVAILABLE` or `AUTH_EXPIRED`.

This prevents long-running jobs from failing opaquely if auth expires after admission without reintroducing launch discovery.

**14. `models.json` Is Compatibility Only**

`models.json` must never be authority.

It should be:

- generated from the admitted catalog snapshot;
- materialized only when a compatibility layer still needs it;
- verified by reading it through the same compatibility reader;
- never hand-edited;
- never treated as a separate source of model truth.

Per-agent generated catalogs must not decide admission.

Compatibility must have explicit retirement/deletion gates. If a compatibility artifact remains able to affect production behavior indefinitely, it is still architecture debt.

**15. Admission Preflight**

Proof preflight calls:

```ts
NativeExecutionStartService.preflight(request);
```

which calls:

```ts
NativeAdmissionService.dryRun(request);
```

It validates:

- exact runtime config schema
- agent profiles
- model refs
- admitted provider request parameters
- prompt profile hash
- tool policy hash
- authority scope
- auth/synthetic auth capability
- readable runtime files as gateway user
- writable transcript/artifact dirs
- worker/scheduler readiness
- compatibility `models.json` materialization if still required

Bad config fields should fail here before restart/proof.

**16. Runtime Asset Ownership Check**

Admission verifies, as the actual gateway user:

- config readable
- agent dirs readable/writable as required
- compatibility model files readable if still used
- transcript dirs writable
- artifact dirs writable

No root-owned `0600` runtime files should silently break launch.

**17. Snapshot Invalidation Rules**

Define invalidation rules:

- config changes create a new config snapshot;
- provider plugin changes create a new catalog snapshot;
- prompt profile changes create a new prompt profile hash;
- tool policy changes create a new tool policy hash;
- provider request parameter changes create a new admitted agent profile;
- auth capability changes can invalidate future admission;
- runtime root changes invalidate future admission;
- already-running jobs continue using their committed snapshot unless explicitly canceled or marked unrecoverable.

Do not let “latest config” leak into an already-admitted job.

**18. Child Agent Admission**

Child agents must not bypass admission.

When the orchestrator launches workers, child tasks derive a child snapshot from the parent snapshot:

```text
parentSnapshot + childAgentProfile + childToolPolicy + childAuthorityScope -> childSnapshot
```

Child derivation should not rebuild the whole runtime world or re-trigger config/model/root discovery. It should resolve only child-specific agent/model/tool/prompt/authority policy against the parent’s admitted world.

Where possible, child snapshots should be deltas/references over the parent:

- parent snapshot id
- child agent id
- child model/tool/prompt override
- child authority scope

Do not full-copy a large snapshot for every child unless storage/audit requires it.

No second child-agent admission path.

**19. RuntimeJob Snapshot Contract**

`RuntimeJob` persists the committed snapshot id plus compact launch metadata. The worker loads the snapshot and does not rediscover model/config/path basics.

Hard rules:

- no provider attempt without resolved model identity;
- no worker-local model rediscovery during native execution;
- no runtime launch if compatibility files are unreadable by gateway user;
- no job state advances to `running` without a committed admitted snapshot.

**20. AgentRuntimeCore Boundary**

`AgentRuntimeCore` receives:

```ts
snapshot.agents[agentId];
```

plus the admitted runtime roots and compatibility/auth diagnostics it needs.

It should not:

- discover config paths;
- infer runtime roots;
- regenerate model catalogs;
- choose provider aliases ad hoc;
- read per-agent `models.json` as authority;
- mutate RuntimeJob admission state;
- pick request parameters outside the admitted model request;
- pick prompt/tool profile versions outside the admitted agent profile.

If it needs model/path/tool/prompt information, that must come from the snapshot or shared services fed by the snapshot.

**21. Pre-Provider Error Projection**

Runtime status must surface safe pre-provider failures directly:

- `errorName`
- `errorCode`
- `errorMessage`
- `failedPhase`
- `agentId`
- `provider`
- `model`
- `configRoot`
- `catalogSnapshotId`

The live summary should not hide actionable failure causes inside deep event artifacts.

Keep projection redacted and typed. Do not expose raw config, raw provider messages, prompts, logs, tool bodies, or secrets.

**22. Readiness Split**

Gateway readiness should be split:

- `livez`: process alive
- `native-readyz`: config, runtime job repo, native RPC, admitted catalog, admission service, asset permissions, and worker supervisor ready
- `full-readyz`: chat/history/UI/sidecars ready

Proof-critical native readiness should not wait on unrelated chat/history/sidecar startup.

`native-readyz` should be cached with dependency timestamps/hashes and must expose when it is stale. It should not perform slow provider discovery on every health call, and it must not claim ready if the admitted catalog is missing required agent models.

Hard rule:

- no proof launch unless `native-readyz` is green.

**23. Collapse Launch Moving Parts**

Collapse these into one admitted launch path:

- runtime locator
- config loader
- model catalog resolver
- auth resolver
- prompt profile resolver
- tool policy resolver
- authority-scope resolver
- provider request parameter resolver
- compatibility materializer
- asset permission checker
- worker readiness check

They produce one immutable result:

```text
AdmittedRuntimeSnapshot
```

Everything else consumes it.

**24. Schema Reduction**

Do not expose or persist:

- raw model catalog contents in job payloads
- raw config blocks
- per-agent generated catalog paths as authority
- proof-only launch flags
- duplicate `workspaceDir` / `projectRoot` / `agentDir` meanings where the four-root contract answers it
- host/container path pairs everywhere
- compatibility policy knobs as operator-facing launch state
- raw stage strings as logic contracts
- separate free-floating provider/runtimeProvider fields outside the resolved model object
- hidden provider request knobs outside `agents[agentId].model.request`
- loose prompt/tool profile fields outside `agents[agentId]`

Persist only:

- `runtimeSnapshotId`
- `configSnapshotId`
- `catalogSnapshotId`
- `runtimeRoots`
- resolved model identity object under `agents[agentId].model`
- admitted request parameters under `agents[agentId].model.request`
- prompt/tool profile ids and hashes under `agents[agentId]`
- authority scope under `agents[agentId]`
- snapshot state
- redacted admission diagnostics

**25. Proof Harness Contract**

Proof harness becomes:

- preflight
- start
- status
- control
- artifact assertions

It must not:

- import source runtime internals;
- run cold fallback execution;
- mutate runtime config files;
- hand-author compatibility model files;
- guess host/container paths.

Proof must exercise the resident gateway/native RPC path, not a parallel launch universe.

**26. Status Contract**

Status is a projection of RuntimeJob events plus admitted snapshot metadata.

Keep compact fields:

- runtime job id/state
- current phase
- latest launch phase
- model activity seen
- provider request seen
- latest meaningful event age
- bounded recent events
- latest safe error
- snapshot id/hash
- snapshot state
- resolved agent model identity
- admitted request parameter summary
- prompt profile hash
- tool policy hash
- raw-storage safety flags

Strict invariant:

> If a native status says `running`, then the status must include a committed snapshot id, resolved agent model identity, admitted request parameter summary, prompt profile hash, tool policy hash, and latest launch phase.

If any are absent, status reports `invalid_runtime_state`.

**27. Boundary Tests**

Add tests that fail if native execution calls:

- worker-local model discovery
- per-agent `models.json` as authority
- host-root path discovery
- proof-only runtime imports
- provider call without admitted model identity
- provider call without admitted request parameters
- prompt/tool profile selection outside admitted agent profile
- job enqueue without snapshot id
- native worker launch from dry-run admission
- child-agent launch outside admission
- native doctor mutates catalog/snapshot/files
- native-readyz refreshes provider catalogs
- native status reports `running` without snapshot id/model identity/request params/prompt hash/tool hash/latest launch phase

**28. Failure Invariants**

Add invariant checks:

- no RuntimeJob enqueue without committed admission snapshot
- no provider attempt without resolved model identity
- no provider attempt without admitted request parameters
- no native launch without readable/writable required assets
- no worker-local model rediscovery during native execution
- no proof launch unless `native-readyz` is green
- no terminal pre-provider failure without safe error projection
- no compatibility artifact acts as model authority
- no launch-time provider discovery on the hot path unless explicitly requested by admission refresh
- no “latest config” leakage into an already-admitted job
- no child launch without snapshot lineage
- no doctor/ready endpoint mutates runtime state

**29. Deeper Bad Assumptions To Correct**

The biggest bad assumption is that admission is a pre-launch check. It should be construction of the executable world. The job should not exist as executable until admission has created that world.

Second: launch is not allowed to discover its environment. Launch should consume an already-admitted world.

Third: filesystem side effects are not configuration authority. Runtime truth should be a typed admitted snapshot, not “whatever file happens to exist under an agent dir.”

Fourth: proofs are not execution systems. Proofs should start, poll, control, and assert. If proof imports source runtime code or patches runtime files, it is part of the problem.

Fifth: compatibility layers are not harmless if they keep influencing production. They need explicit retirement/deletion gates.

Sixth: repositories should not become policy engines. `RuntimeJobStore` persists admitted facts atomically/recoverably; `NativeExecutionStartService` and `NativeAdmissionService` decide admission.

Seventh: “model” does not mean only provider/model id. The real executable model contract is:

```text
provider + model + auth class + request parameters + prompt profile + tool policy + authority scope
```

Admission freezes the entire executable agent profile, not just runtime roots and model name.

**30. Success Gate**

**Direct RuntimeGeneration Provider Capability Addendum**

Newest architectural decision:

> The deepest fix is to stop treating “model exists” and “provider can run” as separate truths.

The observed bad shape:

```text
model catalog says codex/gpt-5.5 exists
-> synthetic apiKey placeholder admitted
-> runtime tries provider path
-> Codex app-server/token/account reality fails
```

Corrected final rule:

> RuntimeGeneration must contain an executable provider capability, or the generation is not ready for that agent/model.

Equivalently:

> A model ref is not runnable until the resident RuntimeGeneration has built the executable provider capability that will run the turn.

This supersedes the earlier provider-lease plan. Provider readiness is still required, but it is not copied into a job as a lease and it is not owned by native admission. The capability is built during RuntimeGeneration construction and then referenced by `AgentRuntime.run(...)`.

Refactor review:

1. Provider catalog and executable transport are still split.
   `extensions/codex/provider.ts` can list `gpt-5.5` and return synthetic auth, while the actual executable path is the Codex app-server client. Those cannot be separate truths for RuntimeJob execution.
2. Synthetic auth can still masquerade as executable auth.
   `apiKey: "codex-app-server"` is compatibility metadata. It must not be passed into a generic provider path as if it were a token.
3. Harness selection is still too dynamic for RuntimeGeneration execution.
   RuntimeGeneration execution must not select/fallback through harness policy. The executable capability already knows whether it is Codex app-server or generic OpenClaw provider execution. Codex must not fall through to PI/generic API-key execution.
4. Readiness is duplicated conceptually.
   Catalog readiness, model readiness, auth readiness, and provider transport readiness should collapse into RuntimeGeneration capability construction.
5. Status optics are too soft.
   `modelActivitySeen` is misleading if the provider request never started. Agent bootstrap, provider preparation, provider request, and model stream must be distinct.
6. File/module structure can be simpler.
   Provider construction should not live inside proof scripts, generic model config code, embedded-runner auth checks, or a separate provider-lease registry. It belongs in the resident RuntimeGeneration capability builder and is consumed by `AgentRuntimeCore`.

Unified file structure direction:

```text
src/agents/runtime-provider-capability.ts
  createAgentRuntimeProviderCapability(...)
  AgentRuntimeProviderCapabilityNotReadyError
  Codex app-server readiness/model-list smoke
  executable runTurn capability
```

Codex-specific transport mechanics remain with the Codex extension:

```text
extensions/codex/src/app-server/config.ts
extensions/codex/src/app-server/models.ts
extensions/codex/src/app-server/run-attempt.ts
```

Runtime path:

```text
Gateway boot/reload
  -> OpenClawAgentRuntime.build()
  -> RuntimeGeneration.profile(agentId).providerCapability
RuntimeJob
  -> OpenClawAgentRuntime.runAcceptedNativeExecution()
  -> AgentRuntimeCore
  -> providerCapability.runTurn(...)
```

No proof-specific provider checks. No extra shadow snapshot.

Provider capability construction contract:

```ts
createAgentRuntimeProviderCapability({
  provider,
  model,
  runtimeModel,
  catalogSnapshotId,
  authContext,
  runtimeRoots,
  toolPolicy,
  promptProfile,
  config,
  abortSignal
}) -> AgentRuntimeProviderCapability | throws AgentRuntimeProviderCapabilityNotReadyError
```

For Codex, capability construction uses the Codex app-server path. It validates ChatGPT/OAuth/account/app-server/model-list readiness there. It never treats `"codex-app-server"` as an API key.

Codex capability output on success:

```json
{
  "artifactKind": "openclaw.runtime_generation.provider_capability",
  "provider": "codex",
  "model": "gpt-5.5",
  "transportKind": "codex_app_server",
  "capabilityId": "codex_app_server",
  "fallbackAllowed": false
}
```

Failure:

```json
{
  "failedPhase": "provider_auth_or_transport_init",
  "provider": "codex",
  "model": "gpt-5.5",
  "transportKind": "codex_app_server",
  "errorCode": "CODEX_ACCOUNT_TOKEN_INVALID",
  "errorMessage": "Codex app-server ChatGPT auth is not usable"
}
```

No synthetic auth as executable truth:

- Keep `apiKey: "codex-app-server"` only if needed for catalog compatibility.
- It must not be executable credential material.
- If a provider needs a placeholder for catalog shape, mark it explicitly as a non-secret transport marker and executable false.
- If `providerCapability.transportKind === "codex_app_server"`, the generic API-key provider path must not receive synthetic apiKey material.

RuntimeGeneration profile carries the capability:

```json
{
  "providerCapability": {
    "provider": "codex",
    "model": "gpt-5.5",
    "transportKind": "codex_app_server",
    "capabilityId": "codex_app_server",
    "fallbackAllowed": false
  }
}
```

The RuntimeJob is dispatchable only if its referenced RuntimeGeneration includes a usable provider capability for the selected agent/profile.

Runtime consumes, does not rediscover:

```text
AgentRuntimeCore
  -> providerCapability.runTurn(...)
```

For native RuntimeGeneration jobs, provider execution must be capability-bound:

```text
providerCapability.capabilityId = "codex_app_server"
fallbackAllowed = false
```

So Codex cannot accidentally run through the generic PI/provider path with a fake token.

The existing dynamic harness selection can remain for OpenClaw foreground compatibility, but RuntimeGeneration execution must use the generation capability.

One status/error projection:

The same failure should appear in:

- preflight response
- RuntimeJob event
- live status summary
- proof artifact

No gateway-log archaeology.

Status should surface:

```json
{
  "failedPhase": "provider_auth_or_transport_init",
  "provider": "codex",
  "model": "gpt-5.5",
  "transportKind": "codex_app_server",
  "errorCode": "CODEX_ACCOUNT_TOKEN_INVALID",
  "errorMessage": "Codex app-server ChatGPT auth is not usable",
  "catalogSnapshotId": "...",
  "runtimeGenerationId": "..."
}
```

Fix misleading optics:

- `agentLaunchSeen`: agent runtime entered.
- `providerPreparingSeen`: provider capability/transport prep started.
- `providerRequestSeen`: actual provider request submitted.
- `modelActivitySeen`: actual provider/model stream or response began.

Do not set `modelActivitySeen` during bootstrap or pre-provider auth.

Native wiring:

- `OpenClawAgentRuntime.build()` owns provider capability preparation as part of RuntimeGeneration construction.
- `RuntimeGenerationAgentProfile` carries the executable `providerCapability`.
- `RuntimeJob.payload` carries the accepted run and `runtimeGenerationId`, not a copied provider lease or admitted snapshot.
- `RuntimeJob` events carry bounded provider phase/readiness evidence from the shared event sink.
- `AgentRuntimeCore` consumes the generation's provider capability through prepared runtime context.
- Proof harness remains start/status/control only.

Required implementation order:

1. [x] Delete `ProviderRuntimeAdapter` / `ProviderLease` registry from native RuntimeGeneration construction.
2. [x] Delete Codex provider-runtime adapter file and fold Codex readiness into provider capability construction.
3. [x] Make Codex capability validate app-server initialize/account/auth/model-list readiness with bounded timeout.
4. [x] Mark Codex synthetic auth as non-executable compatibility metadata.
5. [x] Keep accepted RuntimeJob payloads to accepted-run references, not provider leases/admitted snapshots.
6. [x] Make native preflight/accept fail before enqueue if RuntimeGeneration cannot accept the request.
7. [x] Make native worker reject accepted jobs whose referenced RuntimeGeneration/profile/capability is invalid.
8. [x] Make `AgentRuntimeCore` pass the generation capability into provider execution.
9. [x] Make provider execution call the generation capability directly for RuntimeGeneration jobs.
10. [x] Disable fallback to PI/generic path when the capability says `fallbackAllowed:false`.
11. [x] Surface provider readiness/turn errors in status/proof artifacts through typed provider phases.
12. [x] Rename/fix optics so `modelActivitySeen` means real provider/model activity.
13. [x] Add focused tests.
14. [x] Rebuild/reload.
15. [x] Rerun native proof through the launch/post-turn lifecycle path. Mechanical provider/model path rerun completed in `native-orchestration-20260614T194650Z`; post-turn reducer rerun `native-orchestration-interaction-return-20260614T212936Z` reached real provider/model activity, recorded `execution.turn.reduced`, and terminalized the RuntimeJob as `needs_review` instead of hanging after `agent_turn_completed`. Full accepted proof remains pending on orchestrator closeout behavior because the model turn did not produce the required `node_finish`/closeout effect.

Required tests:

- Codex catalog model exists but app-server auth fails -> RuntimeGeneration is not ready for that capability and no RuntimeJob enqueue occurs.
- Codex app-server readiness succeeds -> RuntimeGeneration profile includes usable `codex_app_server` provider capability.
- Synthetic `codex-app-server` marker is never passed as executable API key.
- Native RuntimeGeneration Codex job uses `providerCapability.runTurn(...)`.
- Native RuntimeGeneration Codex job does not fall back to PI when `fallbackAllowed:false`.
- Missing provider capability makes worker terminalize as invalid runtime state before provider launch.
- Provider readiness failure appears in preflight, status, event projection, and proof artifact.
- `modelActivitySeen` remains false until actual provider request/model stream begins.

Boundary-test evidence after the deletion cut:

- `extensions/execution-platform/src/workflows/native-cutover-inventory.test.ts` asserts `ProviderRuntimeLease`, `prepareProviderRuntimeLease`, `provider-runtime/registry.ts`, `provider-runtime/types.ts`, `provider-runtime/lease.ts`, `extensions/codex/src/provider-runtime-adapter.ts`, and lease-specific tests are absent.
- `src/agents/runtime-provider-capability.test.ts` proves Codex capability construction performs the executable app-server readiness/model-list smoke, fails with `AgentRuntimeProviderCapabilityNotReadyError` when ChatGPT/Codex auth is unusable, and leaves ordinary providers on the generic OpenClaw provider capability without Codex smoke.
- `src/agents/runtime-provider-capability.ts` owns direct capability construction and Codex app-server readiness/model-list smoke.
- `src/agents/openclaw-agent-runtime.ts` calls `createAgentRuntimeProviderCapability(...)` directly while building `RuntimeGenerationAgentProfile`.
- `AgentRuntimeCore` consumes `profile.providerCapability` and calls `providerCapability.runTurn(...)`.
- `InteractionRuntime` does not import provider lease, provider-client fallback, harness selection, or PI fallback for native RuntimeGeneration turns.

Bottom line: make provider executability part of resident RuntimeGeneration construction. Catalog identity, auth state, transport readiness, and executable run path become one generation capability. That removes the placeholder-token failure class and prevents native execution from rediscovering provider reality after the job already exists.

Before another proof is accepted:

- runtime generation readiness/acceptance passes in seconds
- accepted run is persisted on job start
- RuntimeJob and accepted run are committed together or through a recoverable outbox unit
- provider capability is produced by RuntimeGeneration before enqueue
- no RuntimeJob enqueues if the selected provider transport cannot produce a usable capability
- runtime summary shows exact roots and model snapshot
- status never says `running` without runtime generation id/model identity/request params/prompt hash/tool hash/latest launch phase
- `execution-orchestrator` resolves GPT 5.5 xhigh through ChatGPT/Codex auth
- `execution-orchestrator` binds GPT 5.5 xhigh to `codex_app_server` provider capability instead of a synthetic API key
- GPT 5.5 xhigh request parameters are admitted and visible in redacted status
- OpenRouter model lookup works through the same admitted catalog path
- Kimi worker reasoning/request parameters are admitted through the same path
- no job enqueues if model admission fails
- no job enqueues if provider capability construction fails
- pre-provider failures show safe actionable errors in status
- gateway native readiness is not blocked by unrelated sidecars
- proof reaches provider/model activity without host/container path guessing
- worker consumes the committed accepted run without model/path/request-param rediscovery
- worker consumes the RuntimeGeneration provider capability without provider/harness rediscovery
- child worker launch uses accepted-run lineage rather than a second admission path
- native doctor is read-only
- native-readyz does not refresh provider catalogs

Bottom line: launch must stop being discovery. RuntimeGeneration construction builds the complete executable runtime world, including roots, model identity, auth class, request parameters, prompt profile, tool policy, authority scope, and provider capability. `NativeExecutionStartService` commits only the accepted run with the RuntimeJob, and AgentRuntimeCore consumes the immutable resident generation.

**15. Deletion Gates**

Compatibility wrappers can survive forever if not gated.

Add deletion gates now:

- once native proof passes, old embedded-runner ownership moves to `delete_now`
- once native proof passes, run-once debug paths move to `delete_now`
- once mechanical proof reaches provider/model activity, obsolete launch compatibility helpers that are outside OpenClaw's normal chat/foreground path move to `delete_now`
- old compatibility paths must not be polished beyond what is required for the cutover

**16. Tests**

Add import-boundary tests proving:

- `AgentRuntimeCore` does not import `pi-embedded-runner/run.ts`
- `AgentRuntimeCore` does not call `runEmbeddedPiAgentCore`
- runtime modules do not call `runEmbeddedPiAgentCore`
- runtime modules do not import production run-once
- production HTTP does not import native job runner/run-once
- production HTTP does not define local resident supervisor
- production route matching does not expose queue-runner run-once
- native RPC/front-door submit do not synchronously execute jobs
- proof harness does not import source runner internals
- resident supervisor dispatches through `OpenClawAgentRuntime.runAcceptedNativeExecution()`

Add behavioral tests proving:

- `AgentRuntimeCore` invokes cohesive runtime modules directly
- `runEmbeddedPiAgent` delegates into `AgentRuntimeCore`
- native RuntimeJobs enter through `OpenClawAgentRuntime.runAcceptedNativeExecution()`
- resident supervisor loops queue claims until no job remains
- resident supervisor schedules child native jobs asynchronously
- dispatch failure writes bounded RuntimeJob event
- cancellation is observed before provider activity
- compaction flows through `ContextManager`
- status projects typed events only
- `InteractionRuntime` preserves visible result shape from the old runner path with mocked provider/tools/session

**17. Validation**

Run focused validation:

```bash
pnpm test:file src/gateway/resident-native-execution-worker-supervisor.test.ts src/gateway/execution-platform-http.test.ts
pnpm test:file extensions/execution-platform/src/workflows/native-cutover-inventory.test.ts
pnpm tsgo:fast
```

Then run one native proof and track:

- time to `agent_core_starting`
- time to `provider_request`
- first model activity
- first tool call
- terminal state
- absence of production run-once events

**Acceptance Definition**

This is done only when:

- `AgentRuntimeCore` is the thing that runs an agent turn.
- `AgentRuntimeCore` owns the turn state machine.
- Cohesive runtime modules own concrete mechanics.
- `InteractionRuntime` owns the provider/tool loop instead of embedded-runner internals.
- Embedded runner is compatibility shell only.
- Native execution never uses foreground command queue or production run-once.
- Resident supervisor is the only native production dispatch owner.
- HTTP only starts, polls, and controls.
- Proof harness only starts, polls, controls, and asserts.
- RuntimeJob remains lifecycle truth.
- Typed phases are observability/stale-progress signals, not a second workflow system.
- Tests enforce the architectural cut so old ownership cannot quietly return.
