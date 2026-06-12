# Updated Proposal: OpenCode-Grade Native Tool Runtime

## Goal

Make OpenClaw's worker-agent lane reliable by upgrading the native tool/runtime contract across **all tools**: scouts, validators, and editors. The fix is not another prompt rule or schema choke. It is an OpenClaw-native tool-result, handoff, and working-ledger architecture modeled on OpenCode's proven behavior.

## Completion Tracking

Status values:

- `pending`: not yet implemented or not yet verified.
- `in_progress`: implementation work has started but completion evidence is not sufficient.
- `complete`: current repo/runtime evidence proves the item.

|   # | Item                                        | Status             | Evidence / Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --: | ------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ---------------------------- | -------------------------------------------- |
|   1 | One Native Tool-Result Pipeline             | complete           | Final audit confirmed the shared OpenClaw tool-result path: registered tools are normalized through `toToolDefinitions`, all embedded `tool_execution_end` events route through `handleToolExecutionEnd`, provider-visible transcript `toolResult` messages are subject to live/recovery truncation with managed-output persistence, native `task` results use delivery classification before parent visibility, and node-bound facts from `task`, `update_plan`, `read_todo`, `node_finish`, `openclaw_resource_read`, mutation tools, managed output, validation state, and plugin/custom tools flow through the same after-tool-call/event/readback surface. The pipeline normalizes facts and bounded output only; it does not judge semantic quality. Verified with static audits of `src/agents/pi-tool-definition-adapter.ts`, `src/agents/pi-embedded-subscribe.handlers.ts`, `src/agents/pi-embedded-subscribe.handlers.tools.ts`, `src/agents/pi-embedded-runner/tool-result-truncation.ts`, and `src/config/sessions/managed-output.ts`, plus `pnpm test:file src/agents/pi-tool-definition-adapter.after-tool-call.fires-once.test.ts`, `pnpm test:file src/agents/pi-embedded-subscribe.handlers.tools.test.ts -- -t "node-agent tool result trace | native task working context                                                                                                                  | managed-output refs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | change_set                                                                                                                                                                                                                             | working context"`, `pnpm test:file src/agents/pi-embedded-runner/tool-result-truncation.test.ts -- -t "managed storage                                                                                                                                                                                                                                                                                                                             | truncates oversized tool results                                                                                                                                                                          | readably truncates aggregate                          | allows persisted-session recovery                                                                                                      | combines oversized"`, and `pnpm test:file extensions/execution-platform/src/workflows/node-agent-session.test.ts -- -t "native OpenClaw session trace                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | managed output             | child-result delivery status | oversized child results"` on 2026-06-09.     |
|   2 | Shared Managed Output                       | complete           | Native managed-output persistence exists in `src/config/sessions/managed-output.ts`, with whole-output and streaming writers storing under `Location.stateRoot` as `managed-tool-output/<date>/...` and returning `openclaw-managed-output://...` refs. Foreground `exec` persists oversized previews on demand; background process sessions stream full output while keeping in-memory process state bounded; generic live transcript tool-result truncation now persists the full original tool result before replacing provider-visible history with a bounded preview plus managed-output ref; projected oversized native child task output now persists the full child result and returns compact managed-output metadata; managed-output refs project into the unified working ledger and node-session readback. Verified with `pnpm test:file src/config/sessions/managed-output.test.ts`, `pnpm test:file src/agents/bash-tools.exec-foreground-failures.test.ts -- -t "managed-output                                                                                                                                                                                                                                                                  | oversized                                                                                                                                    | timeout"`, `pnpm test:file src/agents/bash-tools.process.poll-timeout.test.ts -- -t "managed-output                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | poll exposes                                                                                                                                                                                                                           | timeout"`, `pnpm test:file src/agents/pi-embedded-subscribe.handlers.tools.test.ts -- -t "managed-output refs"`, `pnpm test:file src/agents/pi-embedded-runner/tool-result-truncation.test.ts -- -t "managed storage                                                                                                                                                                                                                               | readably truncates aggregate                                                                                                                                                                              | allows persisted-session recovery                     | combines oversized                                                                                                                     | resolves per-agent"`, and `pnpm test:file src/agents/pi-embedded-runner/run-child-session-runtime.test.ts -- -t "native child sessions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | provider response timeouts | bounded partial child output | oversized child task output"` on 2026-06-08. |
|   3 | Minimal Tool Output Schema                  | complete           | Native task result schema now uses `resultDeliveryStatus: full                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | projected                                                                                                                                    | rejected`, `resultTruncated`, `managedOutputRef`/bytes/hash, `workingContextEntryRef`, and typed `childStartFailureKind`as the compact control surface. The separate`resultOversized`task-result field is no longer emitted by current task results; the only remaining source reference is a legacy replay fallback in`isDeliveredNativeTaskToolResult`, and readback derives `childResultOversized`diagnostically from`resultDeliveryStatus === "projected"`or`resultTruncated`. Managed output, change sets, validation state, and task context use the unified working ledger instead of separate edit/validation/task ledgers. Verified with targeted `rg "resultOversized"`showing only the legacy fallback reader, plus`pnpm test:file src/agents/tools/native-task-tool.test.ts -- -t "projects structured oversized child output | projects unstructured oversized child output                                                                                                                                                                                           | uses the configured live guard cap"`, `pnpm test:file src/agents/pi-embedded-subscribe.handlers.tools.test.ts -- -t "persists delivered context scout results                                                                                                                                                                                                                                                                                      | managed-output refs"`, `pnpm test:file src/agents/pi-embedded-runner/run/attempt.test.ts -- -t "delivered native task results                                                                             | protects projected native task results                | decision footers"`, `pnpm test:file src/agents/pi-embedded-runner/run-child-session-runtime.test.ts -- -t "oversized child task output | bounded partial child output"`, and `git diff --check -- src/agents/session-runtime/native-task-types.ts src/agents/session-runtime/run-child-task-adapter.ts src/agents/tools/native-task-tool.ts src/agents/tools/native-task-tool.test.ts src/agents/pi-embedded-subscribe.handlers.tools.ts src/agents/pi-embedded-subscribe.handlers.tools.test.ts src/agents/pi-embedded-runner/run/attempt.ts src/agents/pi-embedded-runner/run/attempt.test.ts src/agents/pi-embedded-runner/run-child-session-runtime.test.ts src/agents/pi-embedded-runner/tool-result-truncation.ts src/agents/pi-embedded-runner/tool-result-truncation.test.ts src/agents/pi-embedded-runner/run.ts docs/projects/execution-platform/specs/openclaw-native-tool-runtime-opencode-parity.md` on 2026-06-08. |
|   4 | Agent-Pack-Owned Tool Budgets               | complete           | First-party execution agent role defaults are declared in `docs/agents/registry.yaml` as native `toolBudget` policy on each agent pack. `src/agents/agent-pack-registry.ts` parses the policy through the native registry path, including the sync registry loader used during tool construction, and `src/agents/pi-tools.ts` consumes that registry-owned `toolBudget` instead of a hardcoded execution-role switch. Explicit read/search limits can still opt up within existing caps. Verified with targeted `rg` showing no hardcoded role-budget switch in `pi-tools.ts`, `git diff --check -- src/agents/agent-pack-registry.ts src/agents/pi-tools.ts src/agents/agent-pack-registry.test.ts docs/agents/registry.yaml`, `pnpm test:file src/agents/agent-pack-registry.test.ts`, `pnpm test:file src/agents/pi-tools.create-openclaw-coding-tools.adds-claude-style-aliases-schemas-without-dropping-f.test.ts -- -t "applies first-party execution agent tool budgets"`, and `pnpm test:file src/agents/tools/repo-discovery-tools.test.ts` on 2026-06-08.                                                                                                                                                                                            |
|   5 | Read Tool Parity                            | complete           | `read` now has OpenCode-grade line-numbered provider-visible file output, structured file metadata (`type`, `lineStart`, `lineEnd`, `totalLines`, `returnedLines`, `truncatedBy`, `nextOffset`, `validOffsetRange`, `suggestedOffset`, `bytesRead`, `maxBytes`), bounded EOF continuation behavior, missing-path suggestions, and directory pagination metadata (`offset`, `limit`, `totalEntries`, `returnedEntries`, `nextOffset`, `validOffsetRange`). Verified with `pnpm test:file src/agents/pi-tools.create-openclaw-coding-tools.adds-claude-style-aliases-schemas-without-dropping-g.test.ts`, `pnpm test:file src/agents/pi-tools.read.repo-canonical.test.ts`, and `pnpm test:file src/agents/pi-tools.read.document-arbitration.test.ts` on 2026-06-08.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
|   6 | Truncated Reads Are Not Edit-Ready          | complete           | Native working-context admission now demotes read-continuation/cap-marked `context_window` entries to `discovery_hint`, marks `lineRangeComplete=false` and `truncatedSource=true`, and projects that status into the parent working-context prompt for exact follow-up reads. Verified with `pnpm test:file src/config/sessions/working-context.test.ts` and `pnpm test:file src/agents/pi-embedded-subscribe.handlers.tools.test.ts -- -t "working context"` on 2026-06-08.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
|   7 | List / Glob / Grep Parity                   | complete           | Implemented list pagination plus truncation guidance/metadata in `src/agents/tools/repo-discovery-tools.ts`; verified with `pnpm test:file src/agents/tools/repo-discovery-tools.test.ts` on 2026-06-08.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
|   8 | StateRoot Exclusion                         | complete           | Repo discovery tools now accept native `stateRoot` and derive ignored roots from it while retaining `.openclaw/runtime` as fallback; `createOpenClawCodingTools` passes the resolved state root. Verified with `pnpm test:file src/agents/tools/repo-discovery-tools.test.ts` and `pnpm test:file src/agents/pi-tools.node-authority-overlay.test.ts -- -t "exact bounded source windows"` on 2026-06-08.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
|   9 | Validation Exec Parity                      | complete           | Foreground `exec` results return bounded tail-preview output instead of injecting oversized raw aggregation, and details carry `timedOut`, `truncated`, `totalOutputChars`, `tail`, `exitSignal`, `failureKind`, `managedOutputRef`, `managedOutputBytes`, and `managedOutputHash` when full output is persisted. Background process sessions now stream full output to native managed output under `Location.stateRoot` while keeping registry `aggregated` output bounded, and `process poll` / `process log` / `process list` expose managed-output refs and status metadata. Timeout failures remain tool/runtime metadata, not bootstrap/provider failures. Verified with `pnpm test:file src/config/sessions/managed-output.test.ts`, `pnpm test:file src/agents/bash-tools.exec-foreground-failures.test.ts`, `pnpm test:file src/agents/bash-tools.process.poll-timeout.test.ts`, and `pnpm test:file src/agents/bash-tools.exec-runtime.test.ts -- -t "timeout                                                                                                                                                                                                                                                                                         | timed out                                                                                                                                    | shell failures"` on 2026-06-08.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
|  10 | Progress Lease, Not Dumb Loop Cap           | complete           | Native child task execution ignores model-provided `runTimeoutSeconds` and uses the max-safe timer sentinel for the overall child run, so healthy scout/validator work is completion/cancel driven instead of killed by short fixed task budgets. Subagent lanes now use a `request-idle` provider watchdog policy, so dead provider calls still time out at the default idle timeout even when the overall run cap is effectively unbounded; the watchdog still resets on stream chunks. If a scout/validator times out after producing bounded parent-visible output, the native task adapter now delivers a bounded partial child result with explicit parent guidance instead of discarding useful progress; if no useful child text exists, it remains a typed `child_provider_response_timeout`. Verified with `pnpm test:file src/agents/pi-embedded-runner/run/llm-idle-timeout.test.ts -- -t "request-idle                                                                                                                                                                                                                                                                                                                                             | resets timer                                                                                                                                 | throws on idle timeout"`, `pnpm test:file src/agents/pi-embedded-runner/run-child-session-runtime.test.ts -- -t "native child sessions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | provider response timeouts                                                                                                                                                                                                             | bounded partial child output"`, and `git diff --check -- src/agents/pi-embedded-runner/run/llm-idle-timeout.ts src/agents/pi-embedded-runner/run/llm-idle-timeout.test.ts src/agents/pi-embedded-runner/run/attempt.ts src/agents/session-runtime/run-child-task-adapter.ts src/agents/pi-embedded-runner/run-child-session-runtime.test.ts docs/projects/execution-platform/specs/openclaw-native-tool-runtime-opencode-parity.md` on 2026-06-08. |
|  11 | Editor Mutation Tools                       | complete           | Edit recovery returns compact changed-path, modified-path, bounded diff, first-changed-line, edit-count, and recovery metadata instead of an empty diff/details object; write returns changed-path/add-vs-modified/bytes/full-file-replacement metadata; apply_patch details expose changed/added/modified/deleted paths; node-agent projection consumes file-mutation tool-result metadata and persists compact `change_set` working-context entries without raw diff/text. Command/exec tool results are no longer treated as `change_set` merely because they are shell-mutating actions. Stale edit failures return scout re-grounding guidance without dumping current file contents. Native formatter/LSP diagnostics are not currently exposed on this mutation surface, so there is no duplicate diagnostics schema. Verified with `pnpm test:file src/agents/pi-tools.read.host-edit-recovery.test.ts`, `pnpm test:file src/agents/pi-tools.create-openclaw-coding-tools.adds-claude-style-aliases-schemas-without-dropping-f.test.ts -- -t "accepts canonical parameters                                                                                                                                                                              | applies first-party execution agent tool budgets"`, `pnpm test:file src/agents/apply-patch.test.ts -- -t "adds a file                        | updates and moves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | deletes a file"`, and `pnpm test:file src/agents/pi-embedded-subscribe.handlers.tools.test.ts -- -t "managed-output refs                                                                                                               | change_set                                                                                                                                                                                                                                                                                                                                                                                                                                         | working context"` on 2026-06-08.                                                                                                                                                                          |
|  12 | Stale Edit Re-Grounding                     | complete           | Exact-match/stale edit failures no longer append current file contents to the tool error. They return compact re-grounding guidance: do not retry from memory or ask for a full file; use `execution-context-scout` for an exact updated source window, then retry from that window. Successful mutation retries continue to clear prior edit failure state and remain replay-invalid. The native trace proof now covers the full loop shape: failed mutation, context-scout refresh with complete bounded windows/file graph, post-scout `update_plan` decision, and successful edit retry from refreshed context. Verified with `pnpm test:file src/agents/pi-tools.read.host-edit-recovery.test.ts`, `pnpm test:file src/agents/pi-embedded-subscribe.handlers.tools.test.ts -- -t "change_set                                                                                                                                                                                                                                                                                                                                                                                                                                                               | mutating failure recovery"`, and `pnpm test:file src/agents/pi-embedded-runner/run/attempt.test.ts -- -t "stale edit re-grounding            | decision footers"` on 2026-06-09.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
|  13 | Unified Working Ledger                      | complete           | `SessionWorkingContextEntryKind` now includes native `context_window`, `discovery_hint`, `file_graph`, `managed_output_ref`, `change_set`, and `validation_state` entries while retaining legacy kinds. Context-scout task results persist as `context_window`; validation-scout task results persist as `validation_state`; truncated/capped read outputs are demoted to `discovery_hint`; successful file mutations persist compact `change_set`; managed-output tool results persist compact `managed_output_ref`; file_graph entries carry verified/uncertain edge counts. Command/exec results no longer get admitted as `change_set` merely because they are mutating shell actions. Verified with `pnpm test:file src/config/sessions/working-context.test.ts`, `pnpm test:file src/agents/pi-embedded-subscribe.handlers.tools.test.ts -- -t "working context"`, `pnpm test:file src/agents/pi-embedded-subscribe.handlers.tools.test.ts -- -t "managed-output refs                                                                                                                                                                                                                                                                                     | change_set                                                                                                                                   | working context"`, `pnpm test:file src/agents/pi-embedded-runner/run/attempt.test.ts -- -t "decision footers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | native events"`, and `pnpm test:file extensions/execution-platform/src/workflows/node-agent-session.test.ts -- -t "native OpenClaw session trace                                                                                       | managed output                                                                                                                                                                                                                                                                                                                                                                                                                                     | child-result delivery status                                                                                                                                                                              | oversized child results"` on 2026-06-08.              |
|  14 | File Graph Rules                            | complete           | Native working-context admission now classifies file_graph lines mechanically: graph edge lines with explicit `evidence`, `line/window`, or `path:line` markers count as verified edges; graph edge lines without explicit evidence are retained as uncertain annotations and do not make `hasFileGraph` authoritative. Prompt projection surfaces `fileGraphVerifiedEdges` and `fileGraphUncertainAnnotations`, and task-result event projection exposes the same counts for readback. Verified with `pnpm test:file src/config/sessions/working-context.test.ts` and `pnpm test:file src/agents/pi-embedded-subscribe.handlers.tools.test.ts -- -t "working context"` on 2026-06-08.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
|  15 | Context Scout Output                        | complete           | The context-scout skill requires a mechanical source evidence packet: direct answer, `high_signal_refs`, exact `symbol_windows`, bounded `inline_context_windows`, compact evidence-backed `file_graph`, likely edit points, adjacent context, misses, exact `missing_windows` / follow-up searches, and risks/unknowns. The native `task` tool description reinforces bounded handoff and forbids full files/broad dumps. Kimi owns edit-readiness and lifecycle sufficiency decisions.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
|  16 | Scout Skill Tightening                      | complete           | `skills/execution-context-scout/SKILL.md` directs scouts to ignore full-file/full-document asks, search known refs/symbols first, return bounded sections, use `quick`/`medium`/`very thorough`, return exact `symbol_windows` and `missing_windows`, and avoid raw full files.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
|  17 | Kimi Skill Tightening                       | complete / revised | `skills/execution-node-workflow/SKILL.md` directs Kimi to ask for minimum viable mechanical source evidence, never request full files/full contents/large type blocks, decide edit readiness itself, use bounded parent `read`/`grep` for one exact known local lookup, delegate focused follow-up tasks when source location remains missing, and update todo when the visible plan or major progress state changes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
|  18 | Task Result Next-Action Hint                | complete / revised | Context and validation task results now include compact parent-visible next-action hints, not hard "next tool call must update_plan" footers. This follows the OpenCode code-level finding: Task returns context, the parent chooses the next action, and Todo is a planning habit rather than a deterministic post-task state machine. Verified focused assertions for `Parent next action` guidance and absence of `NEXT PARENT TOOL CALL` with `pnpm test:file src/agents/tools/native-task-tool.test.ts src/agents/pi-tools-agent-config.test.ts src/agents/pi-tools.node-authority-overlay.test.ts src/agents/agent-pack-registry.test.ts` on 2026-06-09.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
|  19 | No Hard Decision Choke                      | complete / revised | The hard post-task todo checkpoint is rejected. OpenClaw should not enforce a runtime next-tool gate here; it should shape the normal path with task/read/grep affordances, parent-visible next-action hints, durable todo habits, and proof optics. Current code removes `NEXT PARENT TOOL CALL` from native task result formatting and tests assert it is absent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
|  20 | Task / Child Handoff                        | complete           | Native `task` is now a thin facade over the OpenClaw session-runtime child runner: production `createNativeTaskTool` requires `runChildTask`; native task mode strips model-provided `runTimeoutSeconds` and does not pass child bootstrap policy from the model; child sessions are created with explicit child agent id, fresh `agent:<child>:subagent:<uuid>` keys and `native_task_*` session ids, parent `spawnedBy` linkage in the session store, child-specific active skill snapshots, required provider-context admission, child model/provider resolution, disabled gateway subagent binding, and bounded parent-visible result delivery. Delivered context-scout and validation-scout task results project into the unified working ledger before readback. Verified with `pnpm test:file src/agents/tools/native-task-tool.test.ts -- -t "requires a native child-session runtime                                                                                                                                                                                                                                                                                                                                                                   | uses the native child-session runner                                                                                                         | returns blocked-action guidance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | provider response timeouts"`, `pnpm test:file src/agents/pi-embedded-runner/run-child-session-runtime.test.ts -- -t "native child sessions                                                                                             | provider response timeouts                                                                                                                                                                                                                                                                                                                                                                                                                         | bounded partial child output"`, and `pnpm test:file src/agents/pi-embedded-subscribe.handlers.tools.test.ts -- -t "persists delivered context scout results                                               | persists validation scout results as validation state | projects oversized structured scout output"` on 2026-06-08.                                                                            |
|  21 | No Gateway Dependency For Worker Delegation | complete           | Node-worker native task mode fails closed unless an OpenClaw session-runtime `runChildTask` is present, and the production task tool constructor requires that native child runner. The native facade test proves it calls `runChildTask` instead of gateway spawn/wait, and the embedded child runtime test proves child runs execute with `allowGatewaySubagentBinding: false`, empty runtime plugins, fresh native session ids, and direct embedded runner params. Legacy gateway spawn/wait remains confined to the explicit test helper path. Verified with `pnpm test:file src/agents/tools/native-task-tool.test.ts -- -t "requires a native child-session runtime                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | uses the native child-session runner                                                                                                         | returns blocked-action guidance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | provider response timeouts"`, `pnpm test:file src/agents/pi-embedded-runner/run-child-session-runtime.test.ts -- -t "native child sessions                                                                                             | provider response timeouts                                                                                                                                                                                                                                                                                                                                                                                                                         | bounded partial child output"`, and `pnpm test:file src/agents/pi-tools.node-authority-overlay.test.ts -- -t "allows execution-coding parent reads only for exact bounded source windows"` on 2026-06-08. |
|  22 | openclaw_resource_read                      | complete           | `createExecutionPlatformResourceReadTool` rejects `file://`, absolute, dot-relative, home-relative, repo-source, and `.openclaw/runtime` managed-output filesystem path refs with scout guidance; verified with `pnpm test:file extensions/execution-platform/src/workflows/node-agent-session.test.ts -- -t "rejects local source file paths"` on 2026-06-08.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
|  23 | Prompt Source-Ref Validation                | complete           | Authored worker prompts block before launch when explicit repo source refs are missing, with `missingPromptSourceRefs` diagnostics and nearest candidates; verified with `pnpm test:file extensions/execution-platform/src/workflows/node-agent-session.test.ts -- -t "blocks authored worker prompts"` on 2026-06-08.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
|  24 | Failure Taxonomy                            | complete           | Native child bootstrap/admission failures now collapse to top-level `child_launch_blocked`, with doc/skill/tool/source specifics retained in `childBootstrapAdmission.reasonCodes`; stale top-level `child_provider_bootstrap_report_missing`, `child_provider_bootstrap_truncated`, `child_result_oversized`, `child_session_lock_failure`, and `node_agent_session_trace_child_result_oversized_not_delivered` names are absent from current source/tests. Task path uses `resultDeliveryStatus` plus `child_result_unshaped`, `child_provider_response_timeout`, and `child_session_lock_failed`; source/resource failures now expose `source_ref_missing` or `resource_ref_invalid`. Verified with targeted `rg`, `pnpm test:file src/agents/tools/native-task-tool.test.ts -- -t "child bootstrap admission                                                                                                                                                                                                                                                                                                                                                                                                                                                | provider response timeout                                                                                                                    | child runtime failures"`, `pnpm test:file src/agents/pi-embedded-runner/run/attempt.test.ts -- -t "native task                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | decision footers"`, `pnpm test:file src/agents/pi-embedded-runner/run-child-session-runtime.test.ts`, and `pnpm test:file extensions/execution-platform/src/workflows/node-agent-session.test.ts -- -t "blocks authored worker prompts | rejects local source file paths                                                                                                                                                                                                                                                                                                                                                                                                                    | does not hydrate runtime artifacts outside                                                                                                                                                                | oversized child results"` on 2026-06-08.              |
|  25 | Readback                                    | complete           | Node session readback projects native `childResultDeliveryStatus`, managed-output refs, managed-output working-context entry refs, working-context refs, child session/result refs, child bootstrap admission facts, normalized child-start/source/resource failure kinds, mutation change-set refs, validation-state refs, and terminal finish refs from native events. It emits `node_agent_session_trace_child_result_projected` / `node_agent_session_trace_child_result_rejected` instead of stale oversized-delivery reason codes, and `node_agent_session_trace_managed_output_observed` when managed output is present. The readback remains native-facts-only and does not judge synthesis quality. Verified with `pnpm test:file src/agents/pi-embedded-runner/run/attempt.test.ts -- -t "decision footers                                                                                                                                                                                                                                                                                                                                                                                                                                            | native events"`, `pnpm test:file extensions/execution-platform/src/workflows/node-agent-session.test.ts -- -t "native OpenClaw session trace | managed output                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | child-result delivery status                                                                                                                                                                                                           | oversized child results"`, and `pnpm test:file extensions/execution-platform/src/workflows/node-agent-session.test.ts -- -t "blocks authored worker prompts                                                                                                                                                                                                                                                                                        | rejects local source file paths                                                                                                                                                                           | does not hydrate runtime artifacts outside            | oversized child results"` on 2026-06-08.                                                                                               |
|  26 | OpenCode Parity Rule                        | complete           | This spec and `docs/projects/execution-platform/specs/openclaw-scout-editor-handoff-opencode-pattern.md` now record the OpenCode-first rule: inspect actual OpenCode implementation code before local invention, copy behavior where it fits, and keep OpenClaw-native naming when parameter spelling differs. Code-level review used local checkout `.artifacts/opencode-dev` at commit `537666149b5682f6f0d39d2d9f4059b3d339cc07`, covering `packages/opencode/src/tool/read.ts`, `grep.ts`, `glob.ts`, `task.ts`, `truncate.ts`, `tool/registry.ts`, `agent/subagent-permissions.ts`, and `session/todo.ts`. Implemented parity copies behavior, not surface spelling: bounded reads/discovery, offset/limit continuation, missing-path suggestions, global truncation/managed output, task child identity, filtered child catalog, permission inheritance, abort/cancel-shaped task wait, durable todo shape, and handoff semantics. Verified with targeted `rg` checks against the OpenCode checkout and the focused tests listed in this table on 2026-06-09.                                                                                                                                                                                             |
|  27 | Focused Success Gates                       | partial / revised  | Prior focused gates remain useful for the native tool pipeline, bounded read/search behavior, working ledger, failure taxonomy, and readback. The post-task handoff gate is revised by later live-proof evidence: task results should include parent-visible next-action hints without hard post-task todo gating, and execution-coding should have bounded parent `read`/`grep` for exact known local lookup. Focused tests for the revised task/catelog contract passed with `pnpm test:file src/agents/tools/native-task-tool.test.ts src/agents/pi-tools-agent-config.test.ts src/agents/pi-tools.node-authority-overlay.test.ts src/agents/agent-pack-registry.test.ts` on 2026-06-09. One rerun of the Work Queue delta proof remains before the gate can return to complete.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

1. **One Native Tool-Result Pipeline**

Every provider-visible tool should pass through one OpenClaw-native result pipeline.

Applies to:

- `read`
- `list`
- `glob`
- `grep`
- `task`
- `exec`
- `process/log`
- `edit`
- `write`
- `apply_patch` if exposed
- `openclaw_resource_read`
- `update_plan`
- `read_todo`
- `node_finish`
- plugin/custom tools

The pipeline owns:

- output size caps;
- truncation detection;
- managed-output persistence;
- bounded parent-visible text;
- structured metadata;
- continuation hints;
- failure classification;
- working-ledger admission.

It must not judge semantic quality. It only normalizes tool facts.

2. **Shared Managed Output**

Add one native managed-output service, OpenCode-style.

When output is too large:

- save full output under `Location.stateRoot`;
- return bounded preview;
- return `managedOutputRef`;
- include exact continuation guidance;
- never inject full raw output into model context;
- never ask Kimi to read managed-output files directly;
- route exact `openclaw-managed-output://...` readback through native
  `openclaw_resource_read`.

Retention should be native runtime policy, not EP lifecycle logic.

3. **Minimal Tool Output Schema**

Use one compact shape where possible:

- `status`
- `deliveryStatus: full | projected | rejected`
- `truncated`
- `managedOutputRef`
- `workingContextEntryRef`
- `metadata`

Do not add:

- separate result-oversized booleans;
- separate edit ledger;
- separate validation ledger;
- task-specific lock schemas;
- durable continuation-footer fields;
- semantic synthesis proof fields;
- EP-owned child-result ledger.

4. **Agent-Pack-Owned Tool Budgets**

Tool defaults should come from OpenClaw agent pack policy, not model args.

Context scout policy:

- smaller default read window than editor/general agents;
- explicit max read still allowed up to `2000` lines / `50KB`;
- map first, then exact windows;
- no full-file dumping;
- no stateRoot search unless diagnostic scope is explicit.

Validation scout policy:

- bounded read/search;
- exec tail preview;
- managed full output;
- validation-state projection.

Editor parent policy:

- no broad search/read/exec;
- only exact small read windows if enabled;
- mutation tools;
- todo;
- task;
- finish.

5. **Read Tool Parity**

Bring `read` to OpenCode-grade behavior.

Required behavior:

- line-numbered output;
- `lineStart`;
- `lineEnd`;
- `totalLines`;
- `returnedLines`;
- `truncated`;
- `truncatedBy`;
- `nextOffset`;
- `validOffsetRange`;
- `suggestedOffset`;
- `bytesRead`;
- `maxBytes`.

Missing paths should return "did you mean" suggestions from nearby paths.

Offset beyond EOF should return a useful bounded EOF result, not a generic error-shaped failure.

Directory reads should support:

- `offset`;
- `limit`;
- `totalEntries`;
- `nextOffset`;
- `truncated`.

6. **Truncated Reads Are Not Edit-Ready**

If a read is byte-truncated or line-truncated:

- do not admit it as an edit-ready `context_window`;
- admit it as `discovery_hint` or `managed_output_ref`;
- mark `lineRangeComplete: false`;
- require an exact follow-up read before scout can cite it as a source window.

This prevents hallucinated confidence from huge partial reads.

7. **List / Glob / Grep Parity**

Keep bounded discovery behavior, but add OpenCode-style guidance.

`glob`:

- cap visible results;
- include `count`;
- include `truncated`;
- tell agent to narrow pattern/path when truncated.

`grep`:

- cap matches;
- include total known matches when available;
- include searched file count;
- include truncation reason;
- include narrow-next guidance.

`list`:

- add pagination;
- include total entries;
- include hidden/truncated counts.

All discovery tools must honor `Location.stateRoot`, not hardcoded `.openclaw/runtime`.

8. **StateRoot Exclusion**

Repo discovery must exclude runtime state through resolved native `Location`.

Default excluded roots:

- stateRoot;
- `.git`;
- `node_modules`;
- `dist`;
- generated artifacts;
- caches;
- session transcripts;
- managed-output storage.

Runtime diagnostics require an explicit diagnostic task scope.

9. **Validation Exec Parity**

Validation scout exec/process/log tools should copy OpenCode's shell contract:

- timeout is tool metadata, not bootstrap failure;
- abort is classified separately;
- output streams bounded progress;
- final result returns tail preview;
- full output goes to managed output;
- result includes exit code/status;
- result includes timeout/aborted/truncated flags;
- result includes `managedOutputRef` when applicable.

Late provider/tool timeout after progress should classify as:

- `child_provider_response_timeout`

not:

- bootstrap/docs failure.

10. **Progress Lease, Not Dumb Loop Cap**

Do not kill useful work because a fixed loop count elapsed.

Use:

- provider request timeout for dead calls;
- progress lease that resets on tool/model progress;
- partial result return when useful progress exists;
- typed timeout when no progress occurs.

This applies especially to scouts and validators.

11. **Editor Mutation Tools**

Editor mutation tools should match OpenCode-grade behavior.

Required:

- per-file mutation lock;
- exact replacement;
- clear multiple-match failure;
- clear missing-match failure;
- line-ending normalization;
- BOM preservation where relevant;
- diff metadata;
- changed path metadata;
- formatter/LSP diagnostics where available;
- compact `change_set` event into working ledger.

`write` should be for new files or explicit full-file replacement only.

12. **Stale Edit Re-Grounding**

When edit/apply fails because source is stale:

- Kimi must not broad-read;
- task context scout for exact updated window;
- scout returns complete bounded source window;
- retry mutation from refreshed context.

13. **Unified Working Ledger**

Use one OpenClaw-native session working ledger.

Typed entries:

- `context_window`;
- `discovery_hint`;
- `file_graph`;
- `change_set`;
- `validation_state`;
- `managed_output_ref`.

No separate ledgers.

The ledger helps orientation. It is not truth over source files.

14. **File Graph Rules**

`file_graph` must be evidence-backed.

Edges may come from:

- grep hits;
- imports/exports;
- exact read windows;
- LSP references;
- changed files;
- validation/test refs.

Model-authored graph claims can be stored only as uncertain annotations, not authoritative edges.

15. **Context Scout Output**

Context scout returns a mechanical source evidence packet, not everything relevant
and not an edit-readiness judgment.

Required sections:

- direct answer;
- exact files touched;
- exact `symbol_windows`;
- bounded source windows;
- file graph edges;
- likely edit points;
- exact missing follow-up asks;
- risks/unknowns.

Use structured prose, not brittle JSON.
Kimi owns edit-readiness and lifecycle sufficiency decisions.

16. **Scout Skill Tightening**

Context scout skill should say:

- ignore parent requests for full files;
- return relevant bounded sections instead;
- search known refs/symbols first with grep;
- return exact `symbol_windows`, `inline_context_windows`, and `missing_windows`;
- ask/read exact follow-up windows;
- never return raw oversized content;
- identify missing source refs clearly.

17. **Kimi Skill Tightening**

Kimi skill should say:

- ask scouts for minimum viable mechanical source evidence;
- do not request full files, full contents, entire documents, or large type blocks;
- after scout return, decide:
  - start minimal edit;
  - ask exact follow-up;
  - ask map pass;
  - block.
- after validation, decide:
  - complete;
  - repair from current context;
  - ask one missing context window;
  - block.

18. **Task Result Next-Action Hint**

Keep compact continuation guidance in the parent-visible tool result.

Do not store it as durable event semantics.

Context task hint:

- The parent should choose the next useful action from the delivered source
  evidence: edit, bounded read/grep for one exact lookup, focused follow-up
  task, validation, typed blocker, or todo update when the visible plan
  changes.

Validation task hint:

- The parent should choose the next useful action from the delivered validation
  evidence: repair, bounded read/grep for one exact lookup, focused
  context/validation follow-up, node_finish, typed blocker, or todo update
  when the visible plan changes.

Do not require a hard "next tool call must be update_plan" checkpoint. OpenCode
uses task/read/grep affordances and todo habits rather than a deterministic
post-task todo state machine.

19. **No Hard Decision Choke Yet**

Do not add a deterministic next-tool gate unless the skill/footer fix fails again.

Hard gates become brittle. Prefer native tool clarity plus skills first.

20. **Task / Child Handoff**

Task remains a thin model-facing facade over native `sessions.runChild`.

Required behavior:

- explicit child agent id;
- fresh child context by default;
- continuation id only for same child task;
- parent/child session linkage;
- derived child permissions;
- filtered child catalog;
- child result delivered into parent-visible context;
- result projection into working ledger before parent resumes.

21. **No Gateway Dependency For Worker Delegation**

Node-bound worker scout delegation should not depend on gateway loopback, websocket health, or gateway auth state.

Gateway/UI can later call the same native child runtime, but worker task execution uses OpenClaw session runtime directly.

22. **openclaw_resource_read**

Make `openclaw_resource_read` exact-ref only.

Reject immediately with clear guidance for:

- `file://`;
- raw workspace paths;
- fuzzy names;
- managed-output filesystem paths;
- broad artifact discovery.

Message should direct Kimi to use context scout for source acquisition.

23. **Prompt Source-Ref Validation**

Before launch, validate prompt file refs.

If a prompt references missing repo paths:

- block before model start;
- return exact missing paths;
- include nearest suggestions;
- do not let scout mutate paths from memory.

This prevents stale prompt artifacts from creating impossible scout work.

24. **Failure Taxonomy**

Normalize failures:

- `child_launch_blocked`;
- `child_session_lock_failed`;
- `child_runtime_unavailable`;
- `child_provider_response_timeout`;
- `child_result_projected`;
- `child_result_unshaped`;
- `tool_output_managed`;
- `source_ref_missing`;
- `resource_ref_invalid`.

Do not use bootstrap failure names for late provider/tool failures.

25. **Readback**

Readback should project native facts only:

- tool calls;
- tool result delivery status;
- managed-output refs;
- working-ledger entries;
- child session ids;
- child result state;
- mutation change sets;
- validation states;
- finish status.

No semantic judgment about whether Kimi synthesized well.

26. **OpenCode Parity Rule**

When a tool failure appears, inspect OpenCode's actual implementation first.

Copy behavior where it fits:

- bounded output;
- continuation text;
- missing path suggestions;
- truncation service;
- shell tail/managed output;
- task permissions;
- filtered child catalog;
- todo status model;
- edit/write diff and diagnostics.

Copy behavior, not parameter names, if OpenClaw-native naming is cleaner.

27. **Focused Success Gates**

This refactor is complete when:

- all provider-visible tools pass through one native result pipeline;
- read/list/grep/glob return OpenCode-grade metadata and continuation hints;
- oversized output becomes managed output;
- truncated reads cannot become edit-ready context windows;
- stateRoot is excluded through native Location;
- context scout returns complete bounded windows or exact follow-up asks;
- validation scout returns compact validation state;
- editor mutations emit compact change sets;
- `openclaw_resource_read` rejects raw paths and `file://`;
- task results include parent-visible next-action hints without hard post-task
  todo gating;
- parent receives child result plus ledger refs before next action.

## Final Architecture Rule

OpenClaw owns tool contracts, task execution, permissions, working ledger, managed output, source/workspace/state location, and session events.

Execution Platform owns node lifecycle projection and `node_finish` acceptance only.

The cleanest fix is to make OpenClaw tools boringly reliable in the same way OpenCode tools are: bounded, self-describing, permission-aware, truncation-safe, and native to the session runtime.
