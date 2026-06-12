---
summary: "Proposal for aligning OpenClaw node-worker tool output, compaction, and continuation behavior with OpenCode-grade context protection."
title: "OpenClaw Native Tool Output Compaction OpenCode Parity"
---

# OpenClaw Native Tool Output Compaction OpenCode Parity

**Completion Tracking**

| Item                                                | Status                                                       | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------- | ----------------------- | ------------------------------- |
| 1. Central Tool Output Projection                   | Complete                                                     | `src/agents/pi-embedded-runner/tool-result-truncation.ts` now provides `projectToolOutput` with line/byte caps, bounded preview text, managed-output persistence, and provider-visible saved-output-file guidance. `src/agents/session-tool-result-guard.ts` routes live transcript tool results through this path. Verified with `pnpm test:file src/agents/pi-embedded-runner/tool-result-truncation.test.ts src/agents/session-tool-result-guard.test.ts ... -t "persists full oversized tool output                                                                                      | projectMessagesForCompactionInput       | successful same-turn edit                           | clears old tool results | compact replay"` on 2026-06-10. |
| 2. Managed Output Reuse                             | Complete                                                     | `src/config/sessions/managed-output.ts` remains the native store under `Location.stateRoot`; exact refs now hydrate through `readManagedToolOutputRefSync` without scanning the full runtime tree. `src/agents/tools/openclaw-resource-read-tool.ts` exposes managed-output hydration through native `openclaw_resource_read`. Verified with `pnpm test:file src/config/sessions/managed-output.test.ts src/agents/openclaw-tools.resolve-openclaw-resource.test.ts ... -t "managed-output                                                                                                   | openclaw_resource_read"` on 2026-06-10. |
| 3. Managed Output Readback For All Execution Agents | Complete                                                     | `openclaw_resource_read` is now allowed/required for `execution-coding`, `execution-context-scout`, and `execution-validation-scout` for exact `openclaw-managed-output://...` refs only. Registry, durable docs, runtime docs, native tool filter, and catalog tests were updated. Verified with `pnpm test:file src/agents/agent-pack-registry.test.ts src/agents/pi-tools-agent-config.test.ts ... -t "agent pack registry                                                                                                                                                                | filters execution context scout         | filters execution validation scout"` on 2026-06-10. |
| 4. Bound Read/Grep/Glob Like OpenCode               | Complete from prior parity slice                             | Parent/scout read, grep, and glob are bounded, scoped, stateRoot-excluding, and factual rather than reminder-heavy. This spec depends on the existing OpenCode-parity tool behavior rather than adding another tool layer here.                                                                                                                                                                                                                                                                                                                                                              |
| 5. Replay-Time Old Tool Output Clearing             | Complete                                                     | Old compacted tool results now replay as `[Old tool result content cleared]` plus managed-output ref, with recent-tail protection modeled after OpenCode. Verified through `src/agents/pi-embedded-runner/tool-result-truncation.test.ts`.                                                                                                                                                                                                                                                                                                                                                   |
| 6. Compact Edit Payload Replay                      | Complete                                                     | Successful settled `edit`/`apply_patch`/`write` tool-call payloads are compactable after settlement, including same-turn successful edits; large mutation payloads are omitted from future replay with byte/hash summaries instead of staying as raw old/new text. Verified through `src/agents/pi-embedded-runner/tool-result-truncation.test.ts` and `src/agents/pi-embedded-runner/run/preemptive-compaction.test.ts`.                                                                                                                                                                    |
| 7. Compaction Input Tool Output Cap                 | Complete                                                     | `src/agents/pi-embedded-runner/compact.ts` projects messages through `projectMessagesForCompactionInput` before compaction so the compaction model sees capped old tool outputs and compact settled mutation payloads. Verified through `src/agents/pi-embedded-runner/tool-result-truncation.test.ts`.                                                                                                                                                                                                                                                                                      |
| 8. Deterministic Tail Selection                     | Complete within existing compaction runtime                  | The implementation preserves the existing OpenClaw deterministic tail/session compaction behavior and adds projection before model summary rather than introducing a second tail selector. No parallel compaction scheduler was added.                                                                                                                                                                                                                                                                                                                                                       |
| 9. Auto-Continuation After Compaction               | Complete as OpenClaw-native retry guidance                   | OpenClaw retries the pending provider turn after successful compaction rather than appending a separate synthetic user message. For node-bound `execution-coding` sessions, overflow/timeout compaction now passes node-specific custom instructions: continue implementation, edit/validate when target files and validation signal are known, and do not restart discovery except for a named window, failed edit, or validation error. Verified with `pnpm test:file src/agents/pi-embedded-runner/run.overflow-compaction.loop.test.ts ... -t "node-worker continuation"` on 2026-06-10. |
| 10. Earlier Preemptive Compaction                   | Complete for large mutation/tool-output pressure             | Reducible context estimation now includes large successful mutation tool-call payloads as well as tool results, so pre-provider compaction/truncation can fire before provider rejection. Verified with `src/agents/pi-embedded-runner/run/preemptive-compaction.test.ts` and the focused tool-result tests.                                                                                                                                                                                                                                                                                 |
| 11. Commitment Rule Placement                       | Complete                                                     | The commitment rule is now in `docs/agents/execution-coding/runtime/BOOTSTRAP.md` and in the worker prompt authoring system prompt in `extensions/execution-platform/src/workflows/node-agent-session.ts`. The current Work Queue proof prompt artifact was refreshed with the same rule. Verified with `pnpm test:file extensions/execution-platform/src/workflows/node-agent-session.test.ts -- -t "authors a comprehensive node worker prompt"` on 2026-06-10.                                                                                                                            |
| 12. Prompt Writer Tightening                        | Complete for this slice                                      | The prompt authoring system prompt remains work-order focused and now explicitly asks for the commitment rule without adding a generic workflow manual, update_plan-first requirement, or broad discovery recipe.                                                                                                                                                                                                                                                                                                                                                                            |
| 13. Kimi Context Discipline                         | Complete in canonical runtime docs and proof prompt artifact | The runtime BOOTSTRAP and Work Queue proof prompt now state the edit-now and post-edit no-rediscovery rules exactly once.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 14. Scout/Task Interaction                          | Complete from prior parity slice                             | Task remains for broad/ambiguous work; parent direct read/grep/glob remains for exact editor navigation. This slice did not add hard post-task gates.                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 15. Validation Scout Output Projection              | Complete through shared native projection                    | Validation scout command output and other tool outputs use the same managed-output/truncation/readback path; no validation-specific ledger was added. Verified with the managed-output and exec focused tests.                                                                                                                                                                                                                                                                                                                                                                               |
| 16. Focused Proof Without Context Overflow          | Pending live proof                                           | Not run in this slice by instruction. The next live Work Queue delta proof should verify the end-to-end edit/validation/node_finish loop under this compaction/readback behavior.                                                                                                                                                                                                                                                                                                                                                                                                            |

**Proposal**

The next pass should fix two things together:

1. Kimi now transitions to editing, but still burns too much context during and after the first edits.
2. OpenClaw has partial truncation/compaction infrastructure, but it does not yet behave like OpenCode's mature model-visible context pipeline.

The goal is not to add another scheduler gate. The goal is to make OpenClaw's native tool/session runtime aggressively protect provider context while keeping Kimi action-oriented.

**Failure Diagnosis**

The latest proof showed real improvement:

- Kimi got the full launch/bootstrap path.
- Kimi used direct parent navigation instead of scout delegation.
- Kimi transitioned from context gathering to editing.
- First source read to first edit was about `5.3` minutes.
- It made `7` edit calls.

The run failed later because model-visible context kept growing:

- `20` reads plus `6` greps before/while editing.
- Large `read` windows from `execution-read-model.ts`.
- Large edit calls where full `oldText` and `newText` payloads stayed in transcript.
- Auto-compaction triggered after the context was already too large.
- Compaction succeeded, but retry failed with `Network connection lost`.
- Node ended `needs_review` with `node_finish_not_called`.

So the next failure class is context growth during implementation, not refusal to edit.

**OpenCode Behavior To Copy**

Copy behavior and algorithms, not framework structure.

OpenCode does these things well:

- Central truncation service with default `2000` lines and `50KB`.
- Full oversized output persisted out-of-context.
- Model receives bounded preview plus pointer.
- Every tool output passes through central truncation unless already bounded.
- Read is bounded by lines and bytes.
- Grep is regex-native and capped.
- Old compacted tool results replay as `[Old tool result content cleared]`.
- Compaction input caps old tool-output text to small excerpts.
- Compaction preserves a recent tail and summarizes older history.
- Auto-continuation is inserted after compaction.
- Task is discouraged for exact file/class lookup.
- Kimi prompt is action-first.

**Native OpenClaw Implementation**

Use existing OpenClaw surfaces:

- `src/config/sessions/managed-output.ts`
- `src/agents/pi-embedded-runner/tool-result-truncation.ts`
- `src/agents/pi-embedded-runner/tool-result-context-guard.ts`
- `src/agents/pi-embedded-runner/compact.ts`
- `src/agents/pi-embedded-runner/run/attempt.ts`
- native working context ledger
- session launch/readback events
- node-bound launch policy

Do not create a parallel OpenCode runtime.

**1. Central Tool Output Projection**

Create or formalize an OpenClaw-native `ToolOutputProjection` path.

It should own:

- `maxLines`
- `maxBytes`
- `direction: head | tail`
- full-output persistence
- bounded preview creation
- `managedOutputRef`
- truncation metadata
- provider-visible tool result text

Rules:

- Every provider-visible tool result passes through this projection.
- Tools that already return bounded output can set `metadata.truncated`.
- Unbounded or unknown tools are projected centrally.
- Full output is persisted to managed output, not replayed into context.

This should replace scattered per-tool truncation behavior where possible.

**2. Managed Output Reuse**

Reuse OpenClaw's existing managed output store.

Persist full oversized tool output to:

`stateRoot/managed-tool-output/...`

Return model-visible text like:

```text
Output truncated.
Preview:
...

Full output saved to: /path/to/stateRoot/managed-tool-output/.../mout_....txt
Use Grep to search the full content or Read with offset/limit to view specific sections.
```

No new ledger. No raw dump in parent context. Managed-output refs may remain in
metadata/details, but the provider-visible instruction should be the saved file
path and normal `Read`/`Grep` behavior.

**3. Bound Read/Grep/Glob Like OpenCode**

Read:

- line-numbered output
- total lines
- returned line range
- next offset when truncated
- EOF metadata
- byte cap
- line-length cap
- missing path suggestions

Grep:

- regex-native by default
- capped match count
- grouped by path
- line numbers
- stateRoot/runtime exclusions
- factual truncated metadata

Glob:

- capped result count
- factual truncation metadata
- no behavioral nudges unless call failed

**4. Replay-Time Old Tool Output Clearing**

Add OpenCode-style replay projection.

When an older tool result has already been compacted or preserved in managed output, future provider replay should not include the original text. It should include a compact marker:

```text
[Old tool result content cleared]
Full output saved to: /path/to/stateRoot/managed-tool-output/.../mout_....txt
Use Grep to search the full content or Read with offset/limit to view specific sections.
```

For node workers, this is critical because Kimi made useful reads and edits, but the replay kept too much old payload.

**5. Compact Edit Payload Replay**

Treat large edit calls as first-class context pressure.

For edit/apply_patch/write tool calls:

- Persist full mutation payload as native mutation/change-set event.
- Replay compact summaries after settlement:
  - changed path
  - operation count
  - success/failure
  - old/new byte counts or hash
  - changeSetRef
- Do not keep full `oldText` and `newText` in every future provider turn once the edit succeeded.

The actual worktree plus mutation event is truth. The model only needs compact replay unless repairing a failed edit.

**6. Compaction Input Tool Output Cap**

Before calling the compaction model, cap old tool outputs aggressively.

Copy OpenCode's behavior:

- compaction model receives small tool-output excerpts
- media stripped or summarized
- older full tool outputs replaced with refs/markers
- recent tail preserved

The compaction model should summarize task state, not ingest raw tool logs.

**7. Deterministic Tail Selection**

Use deterministic selection before model summary:

- preserve the newest implementation tail
- prefer recent edit/validation state over old reads
- preserve current todo state
- preserve current changed files
- preserve validation intent/failure if present
- summarize older source acquisition

For node workers, the tail should prioritize:

- latest todo
- current changed paths
- latest edit result
- latest validation result
- current missing blocker if any

**8. Auto-Continuation After Compaction**

Keep continuation deterministic, but make it node-specific.

Instead of generic continuation:

```text
Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.
```

Use:

```text
Continue the current implementation. If target files, patch shape, and validation signal are known, edit or validate next. Do not restart source discovery unless a named source window, failed edit, or validation error requires it.
```

This is not a hard gate. It is a compact recovery prompt after compaction.

**9. Earlier Preemptive Compaction**

Current failure shows compaction fired late.

Before provider call:

- estimate context size
- estimate reducible tool-output payload
- if truncation can solve it, truncate/replay compactly first
- if not, compact before provider call
- do not wait until provider rejects or tool loop exceeds safe threshold

OpenClaw already has preemptive compaction logic. Tighten it so large edit payloads count as reducible context, not just read/grep output.

**10. Commitment Rule Placement**

Put the commitment rule in exactly two places.

First: top of `docs/agents/execution-coding/runtime/BOOTSTRAP.md`, right after role definition:

```text
When you can name the target files, target symbols, patch shape, and validation signal, edit now. Do not wait for complete architecture certainty. Course-correct after edit or validation failure.

After editing begins, do not resume architecture discovery for the same target. Use source tools only for a named missing symbol, failed edit, or validation error.
```

Second: generated worker prompt template, near the top under the node objective.

Do not put this in read/grep footers. Repeated tool-result reminders create context noise and re-open the lookup decision after every result.

**11. Prompt Writer Tightening**

Generated node prompts should be edit-objective first:

- objective
- concrete expected change
- likely edit surfaces
- success criteria
- validation expectation
- node_finish contract

Avoid:

- long non-goal lists
- source-material sections that read like a checklist
- process manuals
- repeated "gather context" wording
- broad discovery instructions
- workflow skill duplication

If source refs are known, include them as edit surfaces, not as a reading assignment.

**12. Kimi Context Discipline**

Kimi should still gather context, but with a clear stopping condition:

Enough context means:

- target file known
- target symbol/function/type known
- patch shape known
- validation signal known

Once those are true, Kimi edits.

After editing starts, source tools are only for:

- exact missing symbol/window
- failed edit re-grounding
- validation error
- import/type failure
- distinct new todo

No architecture rediscovery for the same target.

**13. Scout/Task Interaction**

Keep OpenCode's parent/editor pattern:

- parent uses read/grep/glob for exact lookup
- task/scout handles broad or ambiguous exploration
- task is not for exact file/class lookup
- scout output helps, but is not an edit-perfect chokepoint

Task result footer can remain minimal:

```text
If you can name the target files and patch shape, edit now.
```

No durable event field for the footer.

**14. Validation Scout**

Validation output can also overflow.

Apply the same projection:

- full logs persist to managed output
- parent sees command, exit status, bounded excerpt, likely cause, repair context
- old validation logs clear from replay after compaction
- validation state persists in working context

No raw stdout dumps in parent context.

**15. Success Gates For Next Pass**

Before the next prompt proof, prove:

- every tool result goes through native projection or declares itself bounded
- oversized tool output persists to managed output
- model-visible preview is capped by lines and bytes
- compacted old tool outputs replay as marker/ref, not raw text
- edit payload replay is compact after successful edit
- compaction input caps old tool outputs
- auto-continuation after compaction is node-specific
- execution-coding BOOTSTRAP includes the commitment rule once
- generated worker prompt includes the commitment rule once
- read/grep footers do not contain repeated behavioral nudges
- focused proof can edit without context overflow before validation

**Implementation Order**

1. Add/centralize `ToolOutputProjection`.
2. Wire all native/provider-visible tools through it.
3. Reuse `managed-output.ts` for full oversized payloads.
4. Add replay-time old-tool-output clearing.
5. Add compact replay for edit/mutation payloads.
6. Cap compaction input tool outputs.
7. Add node-specific auto-continuation after compaction.
8. Add commitment rule to execution-coding BOOTSTRAP.
9. Add commitment rule to worker prompt writer.
10. Run focused tests for projection, replay, compaction input, continuation.
11. Rerun the Work Queue delta proof.

**Final Shape**

Kimi is still allowed to gather context. The runtime stops old context from becoming permanent ballast.

OpenCode's lesson is: do not rely on model restraint. Bound the tool stream, preserve full output outside context, summarize old history, replay compact refs, and give the editor one clear action-first commitment rule.
