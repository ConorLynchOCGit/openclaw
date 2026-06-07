---
summary: "Verbatim proposal for NodeLifecycleRunner-owned prose worker prompt authoring, direct OpenClaw session injection, and worker-start optics."
title: "Node Worker Prompt Authoring And Session Optics"
---

# Node Worker Prompt Authoring And Session Optics

## Verbatim Proposal

**Goal**
Fix worker prompt authoring and worker-start optics while reducing the number of intermediate objects between scheduler-selected node and native OpenClaw agent execution.

The worker must receive the comprehensive prompt text directly as the first native OpenClaw session message. Artifacts are evidence mirrors, not execution inputs.

**Core Architecture**
The node-start path should be:

```text
SchedulerStageRunner selects node
-> NodeLifecycleRunner owns node-start transition
-> NodeLifecycleRunner assembles source from NodeExecutionSnapshot + RequirementMap + source prompt windows
-> model authors comprehensive prose worker prompt
-> runtime minimally validates prompt
-> runtime writes exact prompt through native OpenClaw session/message API
-> runtime verifies native session message id + hash
-> runtime persists prompt evidence and start receipt
-> worker begins from native session prompt
```

No required prompt-authoring tool. No JSON-shaped prompt output. No artifact packet the worker must hydrate before thinking.

**1. Remove Tool-Based Prompt Authoring**
Retire the production path where `authorNodeExecutionAssignment()` requires a native tool call to produce prompt prose.

Bad current shape:

```text
authorNodeExecutionAssignment()
-> executeModelToolTurn()
-> required node task prompt tool
-> fail if no accepted tool call
```

Correct shape:

```text
authorNodeExecutionPrompt()
-> canonical model turn with resultMode: "text"
-> model returns prose prompt
-> runtime validates/persists/writes prompt
```

Tools remain for real small-verb actions. Prompt prose should not be forced through a tool-call ceremony.

**2. Replace `NodeExecutionAssignment` If It Is Only A Pointer**
Audit `NodeExecutionAssignment`.

If it does nothing beyond pointing from node run to prompt hash/ref, delete or retire it from the live path.

Keep only these live concepts:

```text
NodeExecutionSnapshot = node identity, scope, requirements, refs
NodeExecutionRunRecord = run/session identity
node_agent_worker_prompt = exact authored prompt text
node_agent_start_receipt = native session write/start proof
```

Do not preserve `NodeExecutionAssignment` as a compatibility wrapper unless code review proves a live non-pointer purpose.

**3. One Canonical Model Turn API**
Do not create a parallel text transport subsystem.

Use one canonical API:

```ts
executeModelTurn({
  owner,
  phase,
  resultMode: "text" | "tools",
  ...
})
```

Prompt authoring uses:

```ts
owner: "node_lifecycle";
phase: "node_worker_prompt_authoring";
resultMode: "text";
```

Scheduler/context/validation/artifact tools use:

```ts
resultMode: "tools";
```

Shared diagnostics should include:

- owner
- phase
- result mode
- model ref
- provider path
- reasoning effort
- latency
- token usage when available
- response hash
- failure reason

**4. Direct Native OpenClaw Session Message**
The authored worker prompt must be appended through OpenClaw's native session/message API, the same way a normal user message would enter a session.

Do not treat direct session-file writes as the default if a native message API exists.

Required invariant:

```text
hash(native_session_initial_message_text) === hash(authored_worker_prompt)
```

Prefer proving:

```text
native session message id exists
message hash matches worker prompt hash
```

Typed failures:

- `node_agent_initial_prompt_write_failed`
- `node_agent_session_initial_prompt_missing`
- `node_agent_prompt_session_write_mismatch`
- `node_agent_session_message_id_missing`

**5. Persist Exact Worker Prompt As Evidence**
Persist:

`execution_platform.node_agent_worker_prompt`

This mirrors exactly what was written to the session. It is not a worker input packet.

Minimal fields:

- `artifactKind`
- `schemaVersion`
- `promptText`
- `promptHash`
- `promptByteCount` for fast readback
- `nodeRunId`
- `nodeId`
- `runtimeJobId`
- `sessionKey`
- `snapshotRef`
- `requirementRefs`
- `sourcePromptRefs`
- `modelRunRef`
- `reasonCodes`
- `rawPromptStored: false`
- `rawResponseStored: false`
- `rawProviderLogStored: false`
- `rawToolLogStored: false`
- `hiddenReasoningStored: false`

Avoid derived/noisy fields:

- `promptLen`
- `assignmentPromptLen`
- `instructionsLen`
- `taskTextLen`

**6. Do Not Persist Separate Source-Material Artifact On Success**
Avoid normal-path object sprawl.

Prompt source material is reconstructable from:

- `NodeExecutionSnapshot`
- RequirementMap artifacts
- source prompt windows
- source prompt body ref

Success path stores:

- node snapshot
- node run record
- worker prompt artifact
- start receipt

Failure path stores prompt-authoring diagnostic material.

**7. Persist Failure Diagnostic Only When Needed**
On prompt-authoring failure, persist:

`execution_platform.node_prompt_authoring_failure_diagnostic`

Bounded fields:

- `nodeRunId`
- `nodeId`
- `runtimeJobId`
- `sessionKey`
- `snapshotRef`
- `requirementRefs`
- `sourcePromptRefs`
- `sourcePromptBodyRefs`
- `sourceMaterialHash`
- `sourceMaterialByteCount`
- bounded source material preview
- model/provider/reasoning
- result mode
- response hash if available
- rejected/accepted tool counts only if an obsolete/wrong tool path was accidentally used
- blocker kind
- reason codes
- raw storage flags

This artifact exists for diagnosis, not worker execution.

**8. Prompt Authoring Input Must Frame Scope Correctly**
A prose prompt author sees the full original prompt, so the source framing must be explicit.

The authoring input must say:

- assigned requirements are binding scope
- full original prompt is source context
- do not assign unowned requirements
- do not turn full prompt context into full mission ownership
- worker may inspect full prompt for refs, keywords, constraints, and domain terms
- worker owns only assigned requirements
- if requirements conflict with full prompt context, block/escalate instead of broadening scope

This is model-authored prompt creation, but scope framing is runner-owned input design.

**9. Comprehensive Worker Prompt Content**
The final authored worker prompt must include inline:

- node goal
- assigned role
- scoped responsibility
- assigned requirements
- requirement refs
- relevant original prompt excerpts
- full original prompt source material or sufficiently large prompt context
- all explicit file refs from the original prompt where available
- constraints
- non-goals
- done-when / success gates
- expected evidence
- first required move
- native `update_plan` requirement
- Codex-like loop instruction:
  `inspect prompt/source -> derive search terms -> scout repo -> edit -> validate -> search/edit/validate again`
- context scout delegation rule when repo mapping is weak
- validation scout delegation rule when validation is non-trivial
- instruction that Qwen/context subagents return actual source/code/test windows inline to parent session
- terminal `node.finish` rule
- blocker/escalation rules

The worker prompt must be a comprehensive directive, not a context dump.

**10. Minimal Runtime Validation**
Runtime validation should catch unusable prompts only.

Required checks:

- non-empty prompt
- under configured byte limit
- includes node id or node run id
- includes assigned requirement refs or titles
- includes source prompt refs/body ref
- includes first move
- includes native planning instruction
- includes context/search/edit/validate loop instruction
- includes terminal `node.finish`

Do not require exact headings or exact phrasing.

Typed failure:

`node_worker_prompt_structurally_invalid`

**11. Prompt Quality Review Is Diagnostic-Only**
Add nonblocking prompt quality diagnostics, not a gate.

Diagnostic flags may include:

- prompt looks like context dump
- missing first move
- missing validation expectation
- missing context-scout delegation guidance
- source context too thin
- possible over-scope
- missing explicit file refs

Do not block on these initially. We need to inspect real authored prompts before hardening quality acceptance.

**12. Start Receipt Must Prove Native Session Write**
Update node agent start receipt to include:

- worker prompt artifact ref
- worker prompt hash
- prompt byte count
- native session key
- native session message id
- native session initial message hash
- prompt/session hash match status
- session transcript ref or file path where applicable
- agent id/profile
- model/provider/reasoning
- snapshot ref
- start status
- blocker kind if blocked

This is the bridge between EP runtime evidence and OpenClaw native session truth.

**13. Readback Must Expose Worker Prompt Optics**
Latest-run-state and canonical readback should expose:

- `nodeExecutionSnapshotRef`
- `nodeWorkerPromptRef`
- `nodeWorkerPromptHash`
- `nodeWorkerPromptByteCount`
- `nodeWorkerPromptStatus`
- `nodeAgentSessionKey`
- `nodeAgentSessionMessageId`
- `nodeAgentSessionTranscriptRef`
- `nodeAgentInitialMessageHash`
- `nodeAgentPromptSessionHashMatch`
- `nodeAgentStartReceiptRef`
- `nodeAgentStartStatus`
- `nodeAgentStartBlockerKind`
- prompt authoring model/provider/reasoning
- prompt authoring latency
- prompt quality diagnostic status if present

Prompt authoring failure must surface as:

`node_worker_prompt_authoring_failed`

not generic `missing_runtime_state`.

**14. Session Transcript Visibility**
After session start, there must be a discoverable OpenClaw-native session transcript or message ref.

Typed failures:

- `node_agent_session_transcript_missing`
- `node_agent_session_message_missing`
- `node_agent_first_worker_action_missing`

Operator readback should answer:

- did the session start?
- where is the session transcript/message?
- what prompt was sent?
- does prompt hash match session first message?
- has the worker produced a visible plan/tool/action event?

**15. Failure Ownership**
NodeLifecycleRunner owns prompt authoring and session-start failures.

Scheduler receives only typed node result states:

- `node_prompt_authoring_blocked`
- `node_prompt_session_write_blocked`
- `node_agent_session_started`
- `node_agent_session_failed`
- `node_finish_received`

Scheduler must not:

- author replacement prompts
- create duplicate implementation nodes
- reinterpret prompt authoring through generic repair
- hide failures under reason-code bags

**16. Remove Extra Moving Parts**
Delete or retire from the live path:

- required prompt-authoring native tool
- JSON-shaped prompt output expectations
- `NodeExecutionAssignment` if only a pointer
- prompt-authoring tool tests
- worker-start success claims without session prompt proof
- readback inference from generic reason-code bags at this boundary
- scheduler prompt-authoring repair paths
- compatibility/fallback prompt authoring production paths

**17. Tests**
Focused tests should prove:

- prose prompt authoring succeeds without tool calls
- zero accepted tool calls is irrelevant for prompt authoring
- obsolete prompt-authoring tool path is not live
- `NodeExecutionAssignment` is deleted/retired unless a live non-pointer purpose remains
- prompt text is written through native OpenClaw session/message API
- native session message id exists
- session initial message hash equals authored prompt hash
- worker never receives only artifact refs or packet as assignment input
- prompt artifact is payload-backed and rehydratable
- failure diagnostic appears only on failure
- start receipt exposes prompt/session hash proof
- readback exposes prompt/source/session optics
- prompt authoring failure is a NodeLifecycleRunner blocker
- scheduler does not repair or duplicate prompt-authoring failures

**18. Proof Acceptance For This Boundary**
Next proof from scheduler-to-worker handoff must show:

- node selected
- node snapshot persisted
- prompt source material reconstructed
- prose prompt authored
- prompt persisted as `node_agent_worker_prompt`
- exact prompt written to OpenClaw native session
- native session message id exists
- session transcript/message is discoverable
- prompt hash matches session first message hash
- worker first action is visible
- worker receives real prompt text, not packet/ref-only assignment

**Final Architecture**
The final shape:

```text
SchedulerStageRunner selects node
-> NodeLifecycleRunner owns node-start transition
-> NodeLifecycleRunner assembles source from snapshot + RequirementMap + prompt windows
-> model authors comprehensive prose prompt through canonical resultMode:text
-> runtime minimally validates prompt
-> runtime writes exact prompt through OpenClaw native session/message API
-> runtime verifies native message id/hash
-> runtime persists worker prompt evidence and start receipt
-> readback projects prompt/session optics
-> worker creates native update_plan
-> worker runs dynamic context/search/edit/validate loop
-> node.finish
```

This keeps the worker close to real source and direct instructions, removes the failed tool-call ceremony, avoids creating an artifact abstraction between worker and assignment, removes pointer-only assignment objects if they are unnecessary, and restores operator optics at the exact boundary where we lost them.
