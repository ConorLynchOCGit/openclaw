---
summary: "Proposal for reducing Kimi worker reasoning latency, proving provider request settings, preserving native evidence, and improving worker completion reliability."
title: "OpenClaw Kimi Worker Latency Evidence And Concurrency Hardening"
---

# OpenClaw Kimi Worker Latency Evidence And Concurrency Hardening

**Full Proposal**

Core correction: the worker loop is no longer mainly failing because Kimi refuses to edit. The latest proof edited, validated, and finished. The remaining failure class is runtime control: excessive reasoning latency, weak evidence wiring, late compaction, and split-brain finish acceptance.

1. **Redacted Provider Request Diagnostics**

Status: **Complete**. The node-agent runner now emits a redacted `node_agent_provider_request_diagnostics` event from the provider payload wrapper and projects the latest diagnostic into node-agent readback. Focused coverage: `pnpm test:file src/agents/pi-embedded-runner/run/attempt.test.ts`.

Add a native provider-attempt diagnostic event for Kimi and node-worker runs.

Record only:

- `provider`
- `model`
- `api`
- `reasoning`
- `reasoning_effort`
- `include_reasoning`
- `parallel_tool_calls`
- `tool_choice`
- `max_tokens`
- `temperature`
- `top_p`
- `stream`
- `attempt`
- `agentId`
- `nodeRunId`
- `sessionKey`

Do not record prompt text, tool definitions, tool arguments, tool results, raw provider responses, hidden reasoning, auth, or headers.

Purpose: prove what was actually sent to OpenRouter. Do not trust config intent or `thinking_level_change` session metadata. The success gate is a launch/readback artifact showing `moonshotai/kimi-k2.6`, explicit reasoning control, and `parallel_tool_calls: true`.

2. **Implementation Worker Thinking Policy**

Status: **Complete**. `execution-coding` OpenRouter Kimi launches now get explicit implementation-worker defaults of `parallel_tool_calls: true`, `reasoning: { effort: "none", exclude: true }`, and `thinking: { type: "disabled" }`, with runtime config matching that policy. Focused coverage: `pnpm test:file src/agents/pi-embedded-runner-extraparams-resolve.test.ts`.

Remove the hard `medium` minimum for `execution-coding` implementation nodes. That minimum is now a latency floor.

New policy:

- scheduler/planner: high reasoning
- implementation worker: `none`, `minimal`, or `low`
- context scout: `low` or `minimal`
- validation scout: `medium`

For Kimi specifically, do not let "off" mean omitted. Test explicit disable:

```json
{
  "reasoning": { "effort": "none", "exclude": true }
}
```

Also test whether OpenRouter passes through native Kimi shape:

```json
{
  "thinking": { "type": "disabled" }
}
```

Use the one that actually appears in redacted payload diagnostics and reduces reasoning latency. This belongs in agent-pack/runtime model policy, not prompt wording.

3. **Keep Role Thinking Separate**

Status: **Complete**. The runtime role config keeps implementation worker reasoning off, context scout thinking low, and validation scout thinking medium; the Kimi defaults are scoped to `execution-coding` only and do not globally weaken scout or validation roles. Focused coverage: `pnpm test:file src/agents/pi-embedded-runner-extraparams-resolve.test.ts`; runtime config parse verified with `.openclaw/runtime/openclaw.json`.

Do not globally weaken reasoning. Make reasoning level part of native launch policy by role and task class.

Execution roles:

- `execution-coding`: patch worker, not architect
- `execution-context-scout`: bounded evidence lookup
- `execution-validation-scout`: command selection and failure diagnosis
- scheduler/planner: decomposition and architecture

This prevents patch workers from paying scheduler-level reasoning cost while preserving quality where causal judgment is useful.

4. **Prove Parallel Tool Calls**

Status: **Complete**. The OpenRouter payload wrapper explicitly injects `parallel_tool_calls: true` for paid Kimi implementation workers, and node-agent trace now reports `parallelToolCallTurns`, `averageToolCallsPerTurn`, and `serialAcquisitionTurns`. Focused coverage: `pnpm test:file src/agents/pi-embedded-runner/run/attempt.test.ts` and `pnpm test:file src/agents/pi-embedded-runner-extraparams-resolve.test.ts`.

Set `parallel_tool_calls: true` explicitly for paid `openrouter/moonshotai/kimi-k2.6`.

Success gates:

- redacted provider payload shows `parallel_tool_calls: true`
- transcript shows multiple tool calls in a single assistant turn
- runtime executes independent read/grep/glob calls concurrently
- diagnostics report `parallelToolCallTurns`, `averageToolCallsPerTurn`, and `serialAcquisitionTurns`

Do not rely on Kimi choosing to batch often. Measure it.

5. **Native Batch Source Navigation**

Status: **Superseded/removed**. The batch source-navigation tool was removed
from the catalog/runtime surface after live proof evidence showed that batch,
coverage, and managed-output abstractions made Kimi feel like source context was
missing. The active OpenCode-parity path is to keep independent `read`, `grep`,
and `glob` calls source-shaped and bounded, and to rely on provider
`parallel_tool_calls` plus runtime concurrency rather than adding a second model
facing source-acquisition abstraction.

Do not reintroduce a batch lookup tool unless a future proof shows that normal
OpenCode-style source tools are insufficient.

Rules:

- internally reuse existing `read`, `grep`, and `glob` implementations
- preserve stateRoot/runtime exclusions
- preserve caps, line numbers, EOF metadata, and truncation refs
- only allow non-mutating source tools
- return grouped bounded results
- persist managed-output refs if output is large

Goal: reduce reasoning turns by letting Kimi ask for the implementation file, test window, repository anchor, and event-store anchor in one model turn.

6. **Make Edit Batching Obvious**

Status: **Complete**. The edit tool description now presents edit as the primary implementation mutation tool and explicitly supports multiple non-overlapping replacements in one call; stale exact-match recovery points to one bounded local read or exact grep plus bounded read, not broad rediscovery. Focused coverage: catalog/tool construction tests plus existing edit-path tests.

Keep mutation sequential and conflict-aware, but make the existing `edit` affordance clearer:

- one `edit` call may include multiple non-overlapping replacements
- use one edit call when several known changes are in the same file or independent files
- do not parallelize conflicting edits
- after one exact-string failure, use a bounded local read or stronger context string, not a broad rediscovery loop

This is tool-description and edit-result wording, not another scheduler gate.

7. **Fix `node_finish` Evidence**

Status: **Complete**. `node_finish(completed)` now auto-attaches native working-context evidence refs when available and synchronously rejects completion with `reason: "missing_required_evidence_refs"` when changed-file or validation evidence is missing. Focused coverage: `pnpm test:file extensions/execution-platform/src/workflows/node-agent-session.test.ts`.

Do not accept `completed` and then downgrade later.

Cleanest options:

- Auto-attach native evidence refs from the current session: changed files, edit refs, validation child result refs, working-context refs.
- Or reject `node_finish(status: completed)` synchronously if required evidence is missing.

Preferred behavior:

```json
{
  "accepted": false,
  "reason": "missing_required_evidence_refs",
  "required": ["changed_files", "validation_evidence"]
}
```

The model should get that immediately, not discover it through replay projection.

8. **Validation Scout Results Become Native Evidence**

Status: **Complete**. Validation scout task results are persisted as native working-context validation evidence with `validationEvidenceRef`, child session/run refs, task/result refs, status, and reason codes, and node finish/readback can consume those refs. Focused coverage: `pnpm test:file src/agents/pi-embedded-subscribe.handlers.tools.test.ts` and `pnpm test:file extensions/execution-platform/src/workflows/node-agent-session.test.ts`.

A validation scout result must create durable evidence refs usable by `node_finish`.

Minimum evidence object:

- `validationEvidenceRef`
- `agentId`
- `childSessionKey`
- `command`
- `exitCode`
- `status`
- `boundedOutputRef`
- `changedFileRefs` if known
- `reasonCodes`

The parent-visible task result can stay readable prose, but native finish/readback should consume refs.

9. **Earlier Compaction And Checkpointing**

Status: **Complete**. The runner now emits native preemptive checkpoint events and runs the existing bounded tool-result truncation path at the requested node boundaries: after first successful edit batch, before validation scout, after validation result, and before node_finish. The trace projects checkpoint counts, reasons, and truncation outcomes. Focused coverage: `pnpm test:file src/agents/pi-embedded-runner/run/attempt.test.ts` and `pnpm test:file src/agents/pi-embedded-subscribe.handlers.tools.test.ts`.

Do not wait for context overflow.

Trigger preemptive compaction/checkpointing:

- after first successful edit batch
- before validation scout
- after validation result
- before `node_finish` if transcript exceeds a threshold

Compaction must preserve:

- node objective
- changed files
- validation refs
- working-context refs
- managed-output refs
- latest todo state
- source windows needed for final repair

Success gate: proof finishes without overflow-triggered retry.

10. **Fix Session Lock Choreography**

Status: **Complete**. The existing native parent-lock handoff now includes provider-wait suspension: the runner suspends the parent session write lock around provider streams, reacquires it on stream result/iterator completion, and projects provider-wait lock handoff counts into node-agent trace. Focused coverage: `pnpm test:file src/agents/session-runtime/parent-lock-handoff.test.ts` and `pnpm test:file src/agents/pi-embedded-runner/run/attempt.test.ts`.

The parent session write lock must not be held through long provider/model waits.

Native session runtime should:

- append the outgoing model turn state
- release/suspend write lock during provider wait
- execute tool results through append transactions
- reacquire only for durable writes
- never hold a write lock for tens of minutes

Success gate: no forced release warning like the 37-minute lock release seen in the proof.

**Implementation Order**

1. Add redacted payload diagnostics.
2. Fix explicit Kimi reasoning disable/minimal policy and remove hard medium floor.
3. Prove `parallel_tool_calls: true`.
4. Add batch source-navigation tool.
5. Tighten edit batching description/result behavior.
6. Fix native validation evidence refs.
7. Fix `node_finish` evidence acceptance.
8. Add preemptive compaction checkpoints.
9. Fix session lock lifecycle.
10. Rerun the same Work Queue delta proof with latency/evidence optics.

Status: **Deferred by current goal instruction.** The implementation and focused tests above are complete; no new live proof was run because the active instruction for this goal is: "Do not run a new live proof."

**Acceptance**

The next proof should show:

- explicit Kimi reasoning setting in payload diagnostics
- `parallel_tool_calls: true`
- lower model-wait time before first edit
- fewer serial read/grep turns
- no context-overflow retry
- no long session-lock forced release
- validation evidence attached as refs
- `node_finish completed` accepted with evidence and replay ending `completed`, not `needs_review`
