# Node Agent Start Receipt Native OpenClaw Start

**Updated Proposal**
Scope: remaining work only. This is the tightened node-start reliability refactor. It fixes stale config/session-lock/tool-policy failures while keeping native OpenClaw as the source of tool/config/skill/session truth.

**1. Fix Native OpenClaw Tool Policy Semantics**
Current flaw: explicit scout `tools.allow` is still capped by global `tools.profile: messaging`.

Implement general OpenClaw policy semantics:

- `agent.tools.profile` means the agent explicitly owns its profile.
- `agent.tools.allow` means the agent explicitly owns its allow surface.
- Global `tools.profile` applies only when the agent has no explicit local tool policy.
- Global `tools.deny` always wins.
- Provider deny always wins.
- `alsoAllow` remains an additive profile override, not a lifecycle concept.
- This belongs in OpenClaw policy resolution, not Execution Platform branching.

Expected result:

- `execution-context-scout` and `execution-validation-scout` can use explicitly allowed `read/list/glob/grep/exec`.
- Global messaging profile no longer silently blocks execution agents.

**2. Improve Native Tool Policy Explanation**
Extend native `resolveEffectiveToolPolicyAccess` output so Execution Platform does not reconstruct policy meaning.

Return per tool:

- `toolName`
- `allowed`
- `blockedBy`
- `effectiveProfileSource`: `agent | global | provider | none`
- `localPolicyExplicit`: boolean

The node-start receipt stores this native explanation. It does not invent its own policy interpretation.

**3. Avoid A New Preflight/Readiness Subsystem**
Do not create a broad `OpenClawNodeStartPreflight` lifecycle object.

Add a narrow composer function:

`prepareOpenClawNodeStart(...)`

It is called only from the `NodeLifecycleRunner` node-start path or its gateway adapter.

It does not:

- advance nodes
- schedule work
- start sessions
- decide lifecycle
- reinterpret graph state
- own config freshness policy
- own session lock cleanup
- create a second readiness lifecycle

It only composes native OpenClaw facts, records a bounded start receipt, and returns accepted/blocked facts to `NodeLifecycleRunner`.

**4. Rename Readiness Artifact To Start Receipt**
Avoid naming that suggests a second gate system.

Use:

`node_agent_start_receipt`

This is evidence of what native OpenClaw accepted or blocked at node start. It is not a readiness owner.

**5. Preserve Native OpenClaw Ownership**
Native OpenClaw utilities own native facts:

- config fingerprint/epoch: config runtime/source snapshot APIs
- effective tools: OpenClaw policy resolver
- skills/assets: OpenClaw agent/skill resolution
- sessions: OpenClaw session path/transcript utilities
- locks: OpenClaw session lock implementation

Execution Platform owns only:

- node attempt identity
- graph lifecycle projection
- bounded node-start receipt artifact
- adapter call into embedded OpenClaw session

**6. Correct Runtime Flow**
Target flow:

`SchedulerStageRunner -> executable node -> NodeLifecycleRunner.prepareAgentSessionStart -> prepareOpenClawNodeStart -> node_agent_start_receipt -> runEmbeddedPiAgent`

Rules:

- Scheduler does not inspect tools, skills, locks, config freshness, or agent assets.
- Replay does not reinterpret start facts.
- Gateway does not independently decide lifecycle.
- `prepareOpenClawNodeStart` supplies facts.
- `NodeLifecycleRunner` maps facts into accepted/blocker lifecycle projection.

**7. Collapse Split Start Checks Into The Node Start Adapter**
Fold these scattered checks into the single node-start adapter path:

- parent execution agent profile exists
- parent execution agent has required skill
- parent execution agent has required tools
- required scout agents exist
- required scout agents have required skills
- required scout agents have required tools
- agent docs/assets exist
- skill docs exist
- workspace paths are valid
- active config fingerprint/epoch is known
- session lock acquisition produced a typed outcome

Remove/delegate old split paths:

- profile resolver performing partial readiness itself
- scout readiness checker outside node-start adapter
- asset checker outside node-start adapter
- lock preflight outside native lock acquisition
- node session runner discovering missing profile/tools/assets late
- replay deriving blocked readiness from reason-code text
- scheduler seeing agent/tool/config details
- gateway late readiness checks after accepted start

**8. Keep NodeExecutionSnapshot Compact**
Do not add bulky start/config/tool fields to the core node snapshot.

Keep snapshot minimal:

- `nodeRunId`
- `sessionKey`
- `agentId`
- `attemptId`
- `requirementRefs`
- `sourcePromptRefs`
- `authorityRefs`

Do not add:

- `readinessRef`
- `configFingerprintRef`
- `startReceiptRef`
- full tool matrix
- raw config excerpts
- full asset diagnostics
- duplicate profile summaries
- large lock inspection payloads

Start receipt is linked through node attempt artifacts/readback, not embedded in every snapshot.

**9. Add Lean `node_agent_start_receipt` Artifact**
Record one bounded artifact per node start attempt.

Accepted receipt fields:

- status
- `nodeAttemptId`
- `nodeRunId`
- `sessionKey`
- active config path
- active runtime config fingerprint/epoch
- parent agent id
- scout agent ids
- accepted required tool names
- session file path
- actual lock acquisition outcome: `acquired`

Blocked receipt additionally includes:

- blocker kind
- blocked tools by agent, if any
- native blocking policy layer, if any
- native `effectiveProfileSource`, if relevant
- native `localPolicyExplicit`, if relevant
- missing skills/assets, if any
- workspace/path failure, if any
- lock owner PID/status, if blocked by lock
- typed lock acquisition outcome

Only include model/workspace details when blocked or diagnostically relevant.

Do not store:

- raw config
- raw prompts
- raw transcripts
- raw provider logs
- hidden reasoning
- large accepted-path tool matrices
- duplicate storage-policy flags already covered by artifact contract

**10. Make Config Freshness Proven Outside Node Lifecycle**
Current risk: `loadConfig()` pins a runtime snapshot, so edited source config and consumed runtime config can diverge.

Correction:

- Node start records active OpenClaw config fingerprint/epoch.
- Node start does not decide `blocked_config_stale`.
- Live submit/reload proof owns "is gateway using current config?"
- If live gateway source config and runtime snapshot differ, the live submit/reload proof blocks before node execution.
- Local replay records the local config fingerprint/epoch it used and does not require dist rebuild.

Config freshness is evidence at the runtime boundary, not another worker-start lifecycle gate.

**11. Wire Session Lock Handling Through Native OpenClaw Acquisition**
Do not build an EP-specific lock cleaner and do not split lock inspection from lock acquisition.

Improve native `acquireSessionWriteLock` or its immediate OpenClaw wrapper so inspect/reclaim/acquire happens in one operation and returns a typed acquisition trace.

Typed outcomes:

- no existing lock, acquired
- stale lock reclaimed, acquired
- dead PID reclaimed, acquired
- recycled PID reclaimed, acquired
- active lock owned by current resumable session
- active lock owned by unrelated live process
- unreclaimable lock
- acquisition timeout

This avoids a TOCTOU bug where preflight inspects one state and acquisition sees another.

**12. Map Lock Acquisition Outcomes Into Typed Lifecycle Blockers**
Before embedded OpenClaw agent start, use the native typed lock acquisition path.

Rules:

- reclaim dead/recycled/stale locks inside native acquisition
- retry acquisition only inside native acquisition
- if acquisition blocks, return typed blocker
- never surface lock contention as generic `runtime_tool_executor_threw`

Typed reason/blocker names:

- `node_agent_session_lock_active`
- `node_agent_session_lock_stale_reclaimed`
- `node_agent_session_lock_unreclaimable`
- `node_agent_session_lock_owner_live`
- `node_agent_session_lock_acquisition_timeout`

**13. Make `nodeAttemptId` The Only Retry Boundary**
Strict rule:

- `NodeLifecycleRunner` owns `nodeAttemptId`.
- `nodeRunId` and `sessionKey` derive from `nodeAttemptId`.
- resetting a node creates a fresh attempt.
- fresh attempt creates fresh nodeRun/session identity.
- no "metadata cleared enough" reset semantics.

**14. Add Runner-Owned Fresh Attempt Reset Primitive**
Boundary replay should not manually patch multiple metadata keys.

Add:

`resetNodeForFreshAttempt(...)`

It should:

- create fresh `nodeAttemptId`
- derive fresh `nodeRunId`
- derive fresh `sessionKey`
- clear old nodeRun/session metadata consistently
- clear stale snapshot refs
- mark stale prior attempt refs retired when needed
- preserve graph/node information unrelated to the attempt reset
- return a typed reset receipt

Replay calls this helper. Replay does not hand-patch lifecycle fields.

Boundary replay reset must guarantee:

- fresh `nodeAttemptId`
- fresh `nodeRunId`
- fresh `sessionKey`
- old `nodeRunId` metadata cleared
- old `nodeAgentSessionKey` metadata cleared
- stale snapshot refs cleared
- stale session lock/transcript state not reused unless explicitly resuming a yielded subagent state

**15. Tighten Resume Semantics**
Only reuse an existing node session when all are true:

- node is in `waiting_on_subagent`
- session yielded through `sessions_yield`
- child session is still unresolved
- nodeRunId/sessionKey match current snapshot
- native session acquisition reports the same resumable session path

Otherwise:

- allocate a fresh attempt/session
- do not reuse stale session identity
- do not bind new execution to old transcript/lock state

**16. Improve Readback And Diagnostics**
Readback should project:

- node lifecycle projection
- `node_agent_start_receipt`
- node session trace artifact

Typed root causes:

- `node_agent_tool_policy_insufficient`
- `node_agent_required_scout_tool_policy_insufficient`
- `node_agent_config_epoch_recorded`
- `node_agent_session_lock_active`
- `node_agent_session_lock_unreclaimable`
- `node_agent_session_lock_acquisition_timeout`
- `node_agent_skill_missing`
- `node_agent_asset_missing`
- `node_agent_workspace_boundary_invalid`

Readback should include bounded diagnostics:

- start receipt artifact ref
- agent id
- blocked tool
- blocking policy layer
- effective profile source
- whether local tool policy was explicit
- active config fingerprint/epoch
- session path
- lock owner PID/status when blocked
- lock acquisition outcome

Readback should not infer lifecycle from reason-code text or collapse these into:

- `missing_runtime_state`
- `runtime_tool_executor_threw`
- generic readiness failure

**17. Keep Replay As Projection Only**
Replay harness behavior:

- calls same scheduler/node lifecycle path as production
- consumes start receipt artifact
- prints start receipt summary
- never applies its own policy interpretation
- never fabricates worker readiness
- never suppresses lock/config/tool blockers
- may reset attempts only through `resetNodeForFreshAttempt(...)`

Replay-specific reset is permitted only as explicit attempt reset, not lifecycle ownership.

**18. Keep Gateway As Executor**
Gateway node agent runner should:

- receive accepted node start request
- record bounded assignment/start/session artifacts
- start OpenClaw embedded session
- return typed session result

Gateway should not:

- independently decide node lifecycle
- reinterpret start blockers
- perform separate profile policy logic
- silently continue after start preparation failed
- run late duplicate readiness checks after accepted start

**19. Preserve OpenCode-Style Worker Dynamics**
This refactor fixes startup reliability. It must not weaken the coding-team loop.

The start path must guarantee the worker has tools/skills/authority to:

- create/update visible todo plan
- spawn fast context scout early
- receive scout source/code windows in parent context
- synthesize scout output before patching
- edit after enough source context exists
- validate narrowly
- search again after validation/edit findings
- spawn validation scout when useful
- repair iteratively
- finish only through `node_finish`

Do not reintroduce rigid phases. Startup start receipt only proves the dynamic loop can run.

**20. Use Native OpenClaw Surfaces**
Use existing native architecture:

- config runtime snapshot
- config source snapshot
- policy resolver
- agent registry/config
- skill registry/docs
- session path resolver
- session transcript utilities
- session lock implementation
- subagent/session spawn surfaces

Avoid EP mirrors for:

- tool permissions
- agent docs
- skill lookup
- session lock cleanup
- config freshness
- transcript path resolution

**21. Add Inventory Gates**
Fail production/replay paths if alternate ownership remains for:

- scout tool policy readiness outside node-start adapter/native policy resolver
- node agent profile readiness outside node-start adapter/native agent resolver
- session lock cleanup outside native OpenClaw lock acquisition
- split lock inspection/preflight outside native acquisition
- replay-local tool policy interpretation
- scheduler-local agent/tool/config readiness
- gateway-local lifecycle decision after start preparation fails
- generic `runtime_tool_executor_threw` mapping for session lock contention
- replay hand-patching fresh attempt metadata instead of calling `resetNodeForFreshAttempt(...)`

**22. Focused Tests**
Required tests:

- explicit `agent.tools.allow` is not capped by global `tools.profile`
- explicit `agent.tools.profile` overrides global profile
- global deny wins over local allow
- provider deny wins over local allow
- native access explanation includes `effectiveProfileSource`
- native access explanation includes `localPolicyExplicit`
- execution scouts allow `read/list/glob/grep` under global `messaging`
- node-start adapter blocks missing parent skill
- adapter blocks missing scout skill
- adapter blocks missing scout tool
- adapter accepts current execution agent/scout config shape
- adapter records config fingerprint/epoch
- adapter records accepted required tool names
- adapter records blocked tool and blocking policy layer
- native lock acquisition returns stale/dead/recycled reclaim outcome
- native lock acquisition avoids separate inspect/acquire TOCTOU
- live unrelated PID lock becomes typed blocker
- lock contention is not mapped to generic runtime tool failure
- `resetNodeForFreshAttempt(...)` creates fresh nodeRun/session binding
- yielded subagent state resumes only with matching nodeRun/session binding
- replay consumes start receipt artifact instead of deriving readiness from reason codes

**23. Proof Gate**
After implementation, rerun from scheduler-to-worker boundary.

Pass conditions:

- `NodeLifecycleRunner` reaches node agent start.
- `node_agent_start_receipt` artifact is attached.
- scout agents are not blocked by global messaging profile.
- config fingerprint/epoch is visible in start receipt/readback.
- stale/dead locks are reclaimed by native acquisition or surfaced as typed blockers.
- worker worker prompt generation begins.
- any failure is downstream of actual OpenClaw agent execution, not startup/config/lock ambiguity.

**End State**
Minimal clean path:

`NodeLifecycleRunner -> prepareOpenClawNodeStart -> node_agent_start_receipt -> runEmbeddedPiAgent`

Native OpenClaw owns:

- effective tool policy
- config fingerprint/epoch
- skill/agent lookup
- session paths
- lock inspect/reclaim/acquire

Execution Platform owns:

- node attempt identity
- graph lifecycle projection
- bounded start receipt artifact
- OpenClaw session adapter

Gateway executes accepted session starts. Replay projects production facts. This removes stale config/session ambiguity, avoids a parallel EP agent runtime, avoids lock TOCTOU, and keeps the worker path close to native OpenClaw agent execution.
