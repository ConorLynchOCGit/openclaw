**Updated Full Proposal**

Goal: fix worker scout delegation by making `task` OpenClaw-native child-session execution: sessions launching sessions through the native runtime, with no loopback gateway dependency, no EP child runner, no recursive parent-stack execution, no extra state system, and no prompt-control text stored as durable event semantics.

**Evidence Boundary**

Do not rework the already-proven parent launch path in this slice. The proof showed parent bootstrap, prompt hash, Kimi `xhigh`, canonical docs, required skill admission, narrow parent tool catalog, durable todo, and explicit `task(agentId: execution-context-scout)` all worked.

The unresolved failure is child delegation: `task` timed out through gateway RPC while scout session-store stale locks were being cleaned up.

**Current Progress**

- Complete for focused factory-unit scope: node-worker `task` now requires a native child-session runner at production tool construction. A production caller cannot construct `task` without `runChildTask`.
- Complete for focused factory-unit scope: legacy gateway spawn/wait support is isolated behind `createLegacyGatewayNativeTaskToolForTest`; it is not a production task factory option.
- Complete for focused launch-storage scope: child launch metadata carries parent session key, parent tool call id, and nodeRunId through native `session.launch` projection fields. `src/config/sessions/launch.test.ts` proves those fields persist on child `session.launch`; `src/agents/pi-embedded-runner/run-child-session-runtime.test.ts` proves native child runtime forwards the parent session key, parent tool call id, and nodeRunId into the child run that emits launch.
- Complete for focused tool-unit scope: context, validation, and failure continuation footers are emitted in parent-visible tool result text, and the failure footer tells Kimi not to probe gateway status or `file://` paths through `openclaw_resource_read`.
- Complete for focused runtime-unit scope: `child_session_lock_failed` is now the runtime/test/spec failure spelling, with no active runtime occurrence of `child_session_lock_failure`.
- Complete for focused native-task routing scope: worker child execution now goes through a neutral session-runtime primitive, `createNativeRunChildSession` in `src/agents/session-runtime/run-child.ts`, plus a task-facing adapter in `src/agents/session-runtime/run-child-task-adapter.ts`. The core primitive no longer imports `native-task-tool`, `RunEmbeddedPiAgentParams`, or `EmbeddedPiRunResult`; it returns a neutral child-session result and the adapter formats it for the `task` tool. Focused runtime proof covers child session identity, parent linkage, subagent lane selection, parent runner queue preservation, required child docs/skill/tool admission, and parent-visible bounded result. Focused tool-surface proof covers `createOpenClawTools` constructing the same native `task` facade with a supplied `runChildTask`, and confirms that path does not call gateway transport. There is no separate production gateway/UI `task` endpoint in this slice; legacy `sessions_spawn` remains a distinct async/thread/ACP subagent surface and is not reclassified as the node-worker foreground `task`.
- Complete for focused factory-unit scope: production `createNativeTaskTool` now requires `runChildTask`, and no production option named `allowLegacyGatewayTaskRuntimeForTests` remains.
- Complete for focused session-runtime/attempt wiring scope: native child task parent lock handoff now releases the parent session write lock before `runChildTask`, reacquires parent append access after child completion, and maps release/reacquire failures to `child_session_lock_failed`. `attempt.ts` no longer wraps `runChildTask` directly; it asks `bindRunChildTaskToParentSessionLockHandoff` in session-runtime for the lock-bound child runner. Focused proof covers release-before-child, reacquire-after-child, typed lock-failure behavior, and the session-runtime binding helper.
- Complete for focused runtime-contract scope: child sessions carry `lane: subagent` plus the parent runner's native queue function into the child run, so the child run uses OpenClaw runner queue/lane execution rather than a task-owned gateway loopback or standalone runner.
- Complete for focused run-loop scope: node-bound native worker runs now require caller-admitted `authStorage` and `modelRegistry`; `runEmbeddedPiAgent` fails closed before the attempt if a node-native worker would otherwise perform worker-local provider discovery. The Execution Platform node runner admits and passes those model runtime objects before `runNodeAgentSession`, and native child runtime propagates the same admitted objects into child sessions.
- Complete for focused child-start lock scope: session-store updates now accept explicit lock timeout/stale thresholds, and native child session creation applies a bounded store-lock timeout/stale threshold derived from the child task timeout. This prevents child-start store-lock waits from outliving the task request envelope.
- Complete for focused native-tool facade scope: the model-facing `task` tool no longer passes `requiredProviderContextAdmission` or `requiredBootstrapAdmissionSources` into native child runtime. The runtime adapter derives child docs, skills, required tools, forbidden tools, and provider-context admission from the child agent pack before launching the child.
- Focused verification passed: `pnpm test:file src/agents/tools/native-task-tool.test.ts src/agents/pi-embedded-runner/run-child-session-runtime.test.ts src/agents/session-runtime/parent-lock-handoff.test.ts src/config/sessions/store.lock.test.ts`.
- Focused launch-linkage verification passed: `pnpm test:file src/config/sessions/launch.test.ts src/agents/pi-embedded-runner/run-child-session-runtime.test.ts`.
- Focused model-runtime admission verification passed: `pnpm test:file src/agents/pi-embedded-runner/run.attempt-param-forwarding.test.ts` and `pnpm test:file src/gateway/execution-platform-agent-team-runner.test.ts`.
- Focused native task routing verification passed: `pnpm test:file src/agents/openclaw-tools.native-task.test.ts` and `pnpm test:file src/agents/openclaw-tools.sessions.test.ts`.
- Not complete: live child-result proof, full live stale-lock proof, live non-recursive runtime queue proof beyond focused contract evidence, live proof that node-worker startup no longer emits the `model_registry_discovered` cold-path timing event, and canonical worker proof rerun.

**1. Native Child-Session Primitive**

Use OpenClaw's native child-session/delegation primitive if one already exists. If it needs a public tool-facing shape, expose it as:

```ts
taskTool.execute(args, context) {
  return sessions.runChild({
    parentSessionKey: context.sessionKey,
    parentToolCallId: context.toolCallId,
    agentId: args.agentId,
    prompt: args.task,
    nodeRunId: context.nodeRunId,
    taskLabel: args.label
  })
}
```

Do not overcommit to the public name `sessions.task` if OpenClaw already has a native `sessions.spawn`, `sessions.runChild`, or task/delegation primitive. The invariant is what matters: one native session runtime launches parent and child sessions.

First pass supports foreground only. No background mode, no ACP/thread/runtime options, no broad metadata bag.

**2. Lock-Safe Flow**

The task path must be append-only around parent state:

1. Validate child policy.
2. Launch child with native `sessions.launch`, carrying parent linkage.
3. Release any parent session write lock before child execution.
4. Run child through native session runtime/queue.
5. Append bounded parent-visible `task.result` or typed `task.failed` to parent session log/tool-result stream.
6. Parent next turn consumes that result normally.

Never hold the parent session write lock while launching or running the child.

**3. Runtime Queue, Not Recursive Stack**

"In-process" means no loopback gateway. It does not mean recursively running the child inside the parent tool handler.

The child uses the same native session runtime/queue as any other agent session. This avoids provider reentrancy, global lane contention, parent/child lock deadlocks, and hidden recursive runtime behavior.

**4. Gateway Role**

For node workers, `task` calls the native child-session primitive directly. No loopback WebSocket, no gateway auth dependency, no gateway request timeout.

Final target: gateway/UI task endpoint also calls the same native primitive, but that can be follow-up. It should not block proving the worker repair. Gateway remains transport/auth only and passes no gateway-specific execution semantics.

**5. Child Launch Is The Start Receipt**

Every scout starts through `sessions.launch`.

Child `session.launch` records:

- child `agentId`;
- parent session key;
- parent tool call id;
- child session key;
- nodeRunId when node-bound;
- resolved location;
- source identity;
- workspace identity;
- provider/model/reasoning;
- required docs admitted;
- required skill admitted;
- provider-visible tool catalog;
- blockers;
- admission status.

Do not add `ChildLaunchAdmissionReceipt`.

Do not add `task.started` unless child `session.launch` cannot carry parent linkage. If `session.launch.metadata.parentSessionKey` and `parentToolCallId` can link parent to child, child `session.launch` is enough.

**6. Parent/Child Identity Policy**

`agentId` is required.

Allowed node child agents:

- `execution-context-scout`;
- `execution-validation-scout`.

Missing or invalid child id fails before launch.

Context scout must produce:

```text
agent:execution-context-scout:subagent:*
```

Never:

```text
agent:execution-coding:subagent:*
```

Validation scout must produce:

```text
agent:execution-validation-scout:subagent:*
```

**7. Session Store Locks**

Fix locks globally in the session store primitive, not task-specific code.

Requirements:

- stale lock detection before parent or child launch admission;
- bounded acquisition;
- owner metadata;
- typed lock failures;
- no stale cleanup can outlive the caller's admission window;
- no silent wait until generic timeout.

Top-level lock failures:

- `session_lock_failure`;
- `session_store_unavailable`;
- `session_lock_stale_owner`;
- `session_lock_timeout`.

Task maps child-start lock issues to `child_session_lock_failed` with detailed cause fields.

**8. Failure Taxonomy**

Keep top-level task failures compact:

- `child_agent_rejected`;
- `child_launch_blocked`;
- `child_runtime_failed`;
- `child_result_delivery_failed`;
- `child_session_lock_failed`.

Put detailed causes underneath. Do not make every cause a lifecycle-level status.

Each failure includes:

- retryable;
- child session key if any;
- launch ref if any;
- cause;
- next valid parent action in the tool result details, not as durable event prompt text.

First pass: retryable only when lock acquisition explicitly reports stale-lock cleanup succeeded and retry is safe.

**9. Native Events**

No separate task event store.

Task result/failure entries live in the normal native session event log/tool-result stream.

First pass durable events:

- child `session.launch`;
- parent-visible `task.result`;
- parent-visible `task.failed`.

Avoid `task.progress` in first pass.

Avoid `task.started` if child `session.launch` carries parent linkage.

`task.result` durable event/details carry:

- task id or parent tool call id;
- child session key;
- child agent id;
- result text hash;
- bounded parent-visible result excerpt;
- managed output refs if oversized.

`task.failed` durable event/details carry:

- task id or parent tool call id;
- compact failure kind;
- retryable boolean;
- child session key if created;
- child launch ref if available;
- machine-readable cause.

**10. Parent-Visible Result Delivery**

No EP result injection.

Child completion appends a native parent-visible `task.result` message/tool result into the parent session stream. The parent's next model turn naturally sees the result.

Detached refs alone are insufficient.

The parent-visible result includes the continuation footer. The durable event should keep pure machine facts; the footer belongs in the tool result text/details shown to the parent model.

**11. Working Context Projection**

Task does not own working-context interpretation.

Native task emits child result/failure. A deterministic OpenClaw working-context projector may mechanically extract declared bounded windows, file_graph sections, change_set refs, and validation_state refs from native session/tool events.

The projector must not judge quality or infer whether Kimi understood the child output.

**12. Continuation Footer Placement**

Continuation footers must reach the parent model, but should not become durable event semantics.

Context scout parent-visible tool result footer:

```text
Parent decision required: update todo, then choose one: enough for minimal edit / need more context / blocked.
```

Validation scout parent-visible tool result footer:

```text
Parent decision required: update todo, then choose one: node/todo complete / repair from current context / need more context / blocked.
```

Failure parent-visible tool result footer:

```text
Parent decision required: update todo, then finish with node_finish blocked unless you already have enough source context to proceed safely. Do not probe gateway-status. Do not use openclaw_resource_read for file:// paths.
```

The native event stores the result/failure facts. The tool result shown to Kimi carries the deterministic continuation direction.

**13. Skill Update**

Update `execution-node-workflow` to mirror the native contract:

- use `task` for scout delegation;
- retry only when `task.failed.retryable === true`;
- after non-retryable task failure, update todo and `node_finish` blocked;
- do not probe gateway status;
- do not use `openclaw_resource_read` for local file paths;
- do not fall back to parent repo crawling.

**14. Exact Resource Read**

`openclaw_resource_read` remains exact-ref only:

- node snapshots;
- prompt/session refs;
- source excerpt refs;
- evidence refs.

It is not file read, fuzzy search, gateway status, artifact search, or managed-output browsing.

**15. Model Resolution**

Remove the remaining ~40s `model_registry_discovered` cold path below worker launch.

`sessions.launch` resolves provider/model/reasoning once. The run loop consumes that accepted launch model. If missing, launch blocks. Provider discovery is admin/cache refresh, not node worker startup.

**16. Location**

Child task launch inherits parent location unless native policy explicitly overrides:

- `sourceRoot`: first-party packs/skills/tools;
- `workspaceRoot`: editable repo/worktree;
- `stateRoot`: runtime state.

For node-bound execution, sourceRoot and workspaceRoot should resolve to the same repo identity unless explicitly allowed. Runtime Home remains state-only.

**17. Tool Catalogs**

Provider-visible tools are filtered before model invocation.

Kimi parent sees durable todo, task, one mutation surface, exact resource read, node_finish.

Context scout sees read/search, optional native LSP, no mutation, no node_finish.

Validation scout sees read/search/exec, optional native LSP, no mutation, no node_finish.

Unavailable tools are hidden, not visible-but-blocked.

**18. Readback**

Readback projects native facts only:

- parent `session.launch`;
- child `session.launch`;
- parent-visible `task.result`;
- parent-visible `task.failed`;
- todo state;
- working-context projection;
- prompt hash;
- tool catalog ref;
- node_finish status.

No reason-code lifecycle inference, no semantic synthesis gate, no duplicate transcript store.

**19. Schema Cuts**

Avoid adding:

- `ChildLaunchAdmissionReceipt`;
- `task.started` if child `session.launch` can carry parent linkage;
- task-specific lock schema;
- task child-result ledger;
- gateway-specific child-start schema;
- EP task wrapper schema;
- EP subagent orchestration state;
- duplicate launch receipts;
- broad task `mode`;
- broad task `metadata`;
- `task.progress` in first pass;
- broad retry taxonomy;
- task-owned working-context refs;
- separate task event store;
- durable prompt-control footer fields.

Keep only:

- parent `session.launch`;
- child `session.launch`;
- parent-visible `task.result`;
- parent-visible `task.failed`;
- `todo.updated`;
- working-context projection;
- `node_finish`.

**Approved Solution Set And Added Success Gates**

This section is now part of the goal success gates. The older partial shape, where native child execution lives as a runner-local closure and production `task` still contains a compatibility runtime shape, is not the final accepted architecture.

1. Promote child task execution into a native session-runtime primitive.

   Create one OpenClaw-owned primitive, conceptually `sessions.runChild`, used by worker `task` and later by gateway/UI. Move the current `createNativeChildTaskRunner` closure out of `run.ts` into the session runtime layer.

   Shape:

   ```ts
   sessions.runChild({
     parentSessionKey,
     parentToolCallId,
     agentId,
     prompt,
     nodeRunId,
     location,
     requiredProviderContextAdmission,
   });
   ```

   This removes the runner-specific closure and makes child sessions a normal OpenClaw capability.

   Success gate:
   - child task execution is provided by a native OpenClaw session-runtime primitive, not a closure embedded in `run.ts`;
   - worker `task` and future gateway/UI task routing can call the same primitive;
   - the primitive owns child session launch/run/result delivery boundaries.

2. Make parent lock handoff native runtime behavior.

   The parent attempt currently holds the session write lock through the whole model/tool loop. For native `task`, the runtime should:
   - append the parent tool-call request;
   - release or suspend the parent write lock before child launch/run;
   - run the child in its own session lane;
   - reacquire parent append access only to write `task.result` / `task.failed`;
   - resume parent model turn with that tool result visible.

   This should not live inside the tool implementation. The tool asks for delegation; session runtime owns lock choreography.

   Success gate:
   - parent session write lock is not held across child launch or child execution;
   - parent-visible task result/failure is appended only through native session append behavior;
   - lock handoff is implemented in session runtime, not by adding lifecycle authority to the tool.

3. Run child through queue/lane, not recursive stack.

   Child execution must use native session queue/lane execution. Do not run the child recursively in the parent tool call stack.

   Success gate:
   - child run is enqueued on a child/session lane;
   - focused proof shows child execution does not run recursively inside the parent tool handler;
   - provider reentrancy, global lane contention, and parent/child lock coupling are avoided.

4. Normalize lock failure taxonomy.

   Use:

   ```text
   child_session_lock_failed
   ```

   Replace current `child_session_lock_failure`. Keep detailed lock trace underneath. Do not add more top-level failure kinds unless they represent different parent actions.

   Success gate:
   - code, tests, readback, and spec all use `child_session_lock_failed`;
   - detailed cause/trace remains available underneath the compact failure kind;
   - no parallel spelling remains in active runtime paths.

5. Remove production legacy shape from `task` factory.

   Current `allowLegacyGatewayTaskRuntimeForTests` is acceptable short-term, but the cleaner final version is:
   - production `createNativeTaskTool` accepts only `runChildTask`;
   - tests that need legacy spawn/wait use a separate test helper or legacy factory;
   - no production option named `allowLegacyGatewayTaskRuntimeForTests` or equivalent.

   This reduces the chance that compatibility gets accidentally wired back into runtime.

   Success gate:
   - production task factory has one runtime shape: native child task execution;
   - legacy gateway spawn/wait support is outside production construction;
   - no production caller can accidentally enable gateway fallback.

6. Model discovery should be launch-admission only.

   Worker run should consume the model/provider/reasoning accepted by `session.launch`. If model registry discovery is missing or stale, launch should block or use a preloaded cache. No second broad discovery below worker launch.

   Success gate:
   - node worker startup skips the broad `model_registry_discovered` cold path after accepted launch;
   - missing/stale model registry state blocks at launch admission or uses a preloaded admitted cache;
   - run loop does not perform correctness-critical provider discovery below worker launch.

7. Gateway becomes a caller, not an execution path.

   Gateway/UI task endpoint should eventually call the same native `sessions.runChild`. Node workers must not depend on gateway transport, auth, WebSocket state, or gateway timeouts.

   Success gate:
   - worker `task` does not call gateway;
   - gateway/UI routing, when present, delegates to the same native session-runtime primitive;
   - gateway-specific timeout/auth failures cannot block node-worker child session startup.

Main architectural rule:

- `task` is a thin tool facade.
- Session launch, locks, child execution, events, and result delivery belong to OpenClaw session runtime.
- Execution Platform does not add a child runner, child ledger, gateway loopback dependency, or prompt-control event semantics.

**20. Implementation Order**

Cleanest implementation order:

1. Normalize `child_session_lock_failed`.
2. Extract `sessions.runChild` from `run.ts`.
3. Make `sessions.runChild` use queue/session lane execution.
4. Add parent lock handoff around native task execution.
5. Move legacy gateway task fallback into a test-only helper or legacy factory.
6. Remove worker model rediscovery cold path.
7. Run focused tests.
8. Rerun canonical worker proof.

Detailed implementation obligations within that order:

1. Identify OpenClaw's existing native child-session/delegation primitive, if any.
2. Expose the minimal `task` tool facade over that primitive, or add the minimal native `sessions.runChild` path if absent.
3. Wire worker `task` tool directly to native child-session execution.
4. Ensure parent lock is not held across child launch/run.
5. Run child through native runtime/queue, not recursive parent stack.
6. Fix session store lock acquisition globally.
7. Ensure child `session.launch` carries parent session key and parent tool call id.
8. Append bounded parent-visible `task.result`.
9. Append typed parent-visible `task.failed`.
10. Add deterministic continuation footers only to parent-visible tool result text/details.
11. Update `execution-node-workflow`.
12. Remove second model registry discovery path.
13. Run focused worker/task/session tests.
14. Rerun canonical worker proof.
15. Follow up by routing gateway task endpoint through the same native primitive.

**21. Focused Tests**

Prove:

- worker `task` does not call gateway;
- parent lock is not held across child execution;
- child does not run recursively in parent tool stack;
- child run is enqueued on a child/session lane;
- allowed-child policy works;
- missing/invalid child id fails before launch;
- child identity is correct;
- child `session.launch` admits docs/skill/tools;
- child `session.launch` links to parent session/tool call;
- stale locks produce `child_session_lock_failed` before timeout with detailed cause/trace;
- parent-visible `task.result` reaches next turn;
- parent-visible result includes continuation footer;
- durable event does not store prompt-control footer as semantic state;
- oversized output uses managed refs;
- failures carry retryable/cause/next action in tool result details;
- parent cannot see read/search/exec;
- scouts cannot edit/finish;
- launch model skips broad rediscovery;
- production task factory has no legacy gateway runtime option;
- worker task and gateway/UI task can route through the same native session-runtime primitive;
- canonical proof reaches child result delivery rather than `missing_baseline_child_agent_delegation`.

**Final Shape**

OpenClaw owns sessions, launch, native child-session execution, locks, skills, tools, permissions, todo, model resolution, native event log, and working-context projection.

Gateway owns transport/auth.

Execution Platform owns node lifecycle, prompt handoff, `node_finish` acceptance, and readback projection.

Kimi owns todo decisions, scout delegation, synthesis, edit, repair, and `node_finish`.

Scouts own bounded source acquisition and validation diagnosis.

The central simplification is native sessions launching native sessions, with pure durable events and parent-visible tool results carrying only the model-facing continuation guidance.
