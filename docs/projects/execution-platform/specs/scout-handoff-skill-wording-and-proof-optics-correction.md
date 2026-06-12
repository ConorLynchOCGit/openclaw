---
summary: "Verbatim proposal for correcting scout handoff skill wording, prompt wording, grep affordances, child progress behavior, and proof optics after the Work Queue delta worker run."
title: "Scout Handoff Skill Wording And Proof Optics Correction"
---

# Scout Handoff Skill Wording And Proof Optics Correction

Below is the combined proposal, merging the prior remaining-work plan with the actual skill-doc/run mismatch diagnosis. I’m only proposing work that is still needed or needs correction.

**Goal**
Make the next Kimi worker proof fail only for real task failure. It should not fail because scout instructions invite read-walking, the prompt asks for the wrong handoff shape, the runtime hides tool flow, or progress handling kills useful work.

**Execution Tracking**

Update this table whenever a section is completed or new evidence changes the status. Do not mark a section complete without current file/test/runtime evidence.

| Section                                                 | Status                                     | Current Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Rewrite Context Scout Wording To Mechanical Lookup   | Complete                                   | `skills/execution-context-scout/SKILL.md` and `docs/agents/execution-context-scout/runtime/AGENTS.md` now say the scout provides mechanical evidence only, must not decide edit readiness, and must return `symbol_windows`, bounded excerpts, file graph, misses, missing windows, and next searches. Targeted `rg` now finds `edit_start_recommendation`, `enough_for_minimal_edit`, and `can_start_editing` only inside negative prohibitions in scout docs.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2. Make Search-First Operational, Not Advisory          | Complete                                   | `skills/execution-context-scout/SKILL.md` and `docs/agents/execution-context-scout/runtime/AGENTS.md` now require known refs to be treated as grep scopes, require grep before read for known-file/symbol tasks, require offset/limit reads in large files, and tell scouts to return misses/missing windows instead of scrolling a large file after scoped misses.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 3. Fix Context Scout Tool Examples                      | Complete                                   | `docs/agents/execution-context-scout/runtime/TOOLS.md` now shows `grep(query:"buildWorkQueueExecutionReadModel", path:"extensions/execution-platform/src/work-queue/execution-read-model.ts")` followed by an offset/limit `read`, and explicitly says known files are grep scopes first.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 4. Fix Kimi Parent Delegation Wording                   | Complete                                   | `skills/execution-node-workflow/SKILL.md` and `docs/agents/execution-coding/runtime/AGENTS.md` now instruct Kimi to ask for exact `symbol_windows`, known refs/symbols to grep first, matched windows only, `missing_windows` when not found, and never ask scouts for entire/full files, full contents, broad dumps, or large type blocks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 5. Fix Active Proof Prompt                              | Complete                                   | `.artifacts/execution-platform/kimi-worker-loop-test/work-queue-frontier-delta-stream-node-prompt.md` now asks for a "mechanical source evidence packet", exact `symbol_windows`, grep-first known refs, no scout sufficiency judgment, and `missing_windows` / exact pivots instead of broad follow-up asks.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 6. Add Grep Tool Affordance Parity                      | Complete                                   | `src/agents/tools/repo-discovery-tools.ts` now adds `suggestedRead` per match, `suggestedReads` in details, parent-visible `suggested_read: read(...)` text, and a bounded `invalid_regex` diagnostic with literal-search retry guidance. Verified with `pnpm test:file src/agents/tools/repo-discovery-tools.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 7. Finish Child/Subagent Progress Behavior              | Complete                                   | Native progress lease now records ignored repeated progress, exposes no-progress and repeated-low-value timeout classifications through embedded attempt/run metadata, maps them to `child_no_progress_timeout` and `child_repeated_low_value_progress`, and marks bounded partial child output as `child_partial_context_returned`. Verified with `pnpm test:file src/agents/pi-embedded-runner/run/progress-lease-timeout.test.ts`, `pnpm test:file src/agents/pi-embedded-runner/run-child-session-runtime.test.ts -- -t "timeout\|partial\|low-value"`, and `pnpm test:file src/agents/tools/native-task-tool.test.ts -- -t "provider response timeouts\|partial child context"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 8. Add Native Proof Optics                              | Complete                                   | `src/agents/pi-embedded-runner/run/attempt.ts` now projects parent tool sequence, native task summaries, task id, child session id, child provider/model, scout tool-call counts by type, first scout tool calls, result delivery status, working-context refs, symbol/missing/inline/file-graph flags, and next parent action after scout/validation. Verified with `pnpm test:file src/agents/pi-embedded-runner/run/attempt.test.ts -- -t "decision footers"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 9. Add Scout-Handoff Quality Diagnostics                | Complete                                   | `src/agents/pi-embedded-runner/run/attempt.ts` now projects `contextScoutHandoffQualityDiagnostics` and `validationScoutHandoffQualityDiagnostics` containing `hasSymbolWindows`, `hasInlineContextWindows`, `hasFileGraph`, `hasMissingWindows`, `readCallCount`, `grepCallCount`, `startedWithRead`, `rawTopOfFileReadCount`, and `oversizedProjected`. Verified with `pnpm test:file src/agents/pi-embedded-runner/run/attempt.test.ts -- -t "decision footers"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 10. Clean Active Spec Wording                           | Complete / revised                         | Corrected active contradictory wording in `docs/projects/execution-platform/specs/openclaw-native-tool-runtime-opencode-parity.md`, `docs/projects/execution-platform/specs/openclaw-scout-editor-handoff-opencode-pattern.md`, `docs/projects/execution-platform/specs/native-task-worker-agent-refactor.md`, and the native `task` tool description in `src/agents/tools/native-task-tool.ts`. The current contract follows OpenCode: task results carry parent-visible next-action hints, not hard `NEXT PARENT TOOL CALL` / post-task todo gates; Kimi may use bounded parent `read`/`grep` for exact known local lookup. Verified with `pnpm test:file src/agents/tools/native-task-tool.test.ts src/agents/pi-tools-agent-config.test.ts src/agents/pi-tools.node-authority-overlay.test.ts src/agents/agent-pack-registry.test.ts` on 2026-06-09.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 11. Reload Runtime                                      | Complete after edit-anchor handoff edits   | `scripts/docker/reload-gateway-dist.sh` completed successfully on `2026-06-09T20:24:40Z`; post-reload health and ready probes passed; `sourceAssetsHash` and `containerSourceAssetsHash` both equal `bd2d8334bfbdd2e5e3f72d89dc58ca7a734f17c6c8f2bd2041318cc967f2d8bd`; `distHash` is `49e6406b6661e876a4625317bdd15574f577c36b0fd6582ae0ac131276f5fe97`; runtime dirty shape paths were empty; gateway pairing/auth state did not change.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 12. Rerun One Work Queue Delta Proof                    | Pending / revised                          | The latest `2026-06-09` Work Queue proof using `.artifacts/execution-platform/kimi-worker-loop-test/work-queue-frontier-delta-stream-node-prompt.md` launched node run `nrun_4a199b325fbd11364472`, admitted Kimi with `thinkingLevel:"medium"`, delegated to context scout session `native_task_9115ad3b-9032-42f9-af2c-62c1d59220fb`, and the scout ran with `thinkingLevel:"low"`. The task result reached parent context and Kimi eventually updated todo and called `edit`, but only after reconstructing source handles through a long parent source walk (`read` 18, `grep` 12). The generated partial Work Queue edit was reverted so the next proof starts clean. The next proof must use the lean OpenCode-shaped contract: no required active workflow skills, no special anchor field, scout returns line-numbered windows/file graph/excerpt-backed likely edit points, and Kimi edits once target files and patch shape are nameable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 13. Add Scout Reasoning And Anti-Churn Correction       | Complete after definitive child-launch fix | `src/agents/subagent-spawn-thinking.ts` honors the target child agent's own `thinkingDefault` before falling back to generic subagent defaults; `src/agents/subagent-spawn-plan.ts` now self-resolves the target agent config from the native registry when callers omit it; `src/agents/session-runtime/run-child.ts` now resolves child model/thinking before child session creation, persists the child plan into the session store, and fails execution scouts before runtime unless the child agent config declares a non-off native `thinkingDefault` and the resolved child plan matches it. `src/agents/pi-embedded-runner/run-child-session-runtime.test.ts` now proves native child task launch forwards `thinkLevel:"low"` and persists `thinkingLevel:"low"` in the context scout session entry, forwards/persists `thinkingLevel:"medium"` for validation scout, and fails before calling `runAgent` when the context scout lacks required thinking. `src/agents/openclaw-tools.subagents.sessions-spawn.model.test.ts` proves the shared plan self-resolves per-agent thinking defaults from the native agent registry. Active runtime config has `execution-context-scout` at `thinkingDefault:"low"` and `execution-validation-scout` at `thinkingDefault:"medium"`. `skills/execution-node-workflow/SKILL.md`, `docs/agents/execution-coding/runtime/AGENTS.md`, `skills/execution-context-scout/SKILL.md`, `docs/agents/execution-context-scout/runtime/AGENTS.md`, `docs/agents/execution-context-scout/runtime/TOOLS.md`, `.artifacts/execution-platform/kimi-worker-loop-test/work-queue-frontier-delta-stream-node-prompt.md`, and `src/agents/tools/native-task-tool.ts` require excerpt-backed likely edit points and tell Kimi to edit/block/move to a distinct target after one exact repair for the same edit question. Verified with `pnpm test:file src/agents/pi-embedded-runner/run-child-session-runtime.test.ts src/agents/openclaw-tools.subagents.sessions-spawn.model.test.ts src/agents/openclaw-tools.subagents.sessions-spawn-applies-thinking-default.test.ts` on 2026-06-09. |
| 14. Add OpenCode-Style Read/Grep Tool Reminders         | Superseded / narrowed                      | Parent `read`/`grep` result reminders were removed after live traces showed repeated micro-reminders reopened source-recovery decisions. Parent tools now return factual metadata only, while the parent operating contract lives in native agent docs and the native task handoff footer. Context scout `read`/`grep` reminders remain only to reinforce search-first bounded evidence and now mention `symbol_windows`, `file_graph`, `missing_windows`, and excerpt-backed `likely_edit_points`. Verified with `pnpm test:file src/agents/pi-tools.node-authority-overlay.test.ts src/agents/pi-tools-agent-config.test.ts` on 2026-06-09.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 15. Narrow Parent Grep To File-Local Exact Lookup       | Complete                                   | `src/agents/pi-tools.ts` now keeps parent `grep` available for OpenCode-style exact repair lookup, but requires `path` to one known workspace file, rejects missing path, repo-root/directory paths, `glob`, `file://`, runtime state, and outside-workspace paths. `src/agents/pi-tools.node-authority-overlay.test.ts` proves exact known-file grep succeeds and broad grep forms fail. Verified with `pnpm test:file src/agents/pi-tools.node-authority-overlay.test.ts src/agents/pi-tools-agent-config.test.ts` on 2026-06-09. Reloaded at `2026-06-09T14:21:21Z`; container `/app/dist/pi-tools-BPtBzWO3.js` contains the file-local parent grep description and `glob` rejection.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 16. Retire Edit-Anchor Handoff And Keep Node Todo Guard | Complete pending live proof                | The edit-anchor handoff was removed because OpenCode does not require a special anchor field and it risked becoming another excuse not to edit. `skills/execution-context-scout/SKILL.md`, `docs/agents/execution-context-scout/runtime/*`, durable context-scout docs, `skills/execution-node-workflow/SKILL.md`, `docs/agents/execution-coding/runtime/*`, durable execution-coding docs, `.artifacts/execution-platform/kimi-worker-loop-test/work-queue-frontier-delta-stream-node-prompt.md`, `src/agents/tools/native-task-tool.ts`, and `src/agents/pi-tools.ts` now use source windows, file graph, missing windows, and excerpt-backed likely edit points instead. `src/agents/tools/update-plan-tool.ts`, `src/agents/openclaw-tools.ts`, `src/agents/tools/update-plan-tool.test.ts`, and `src/agents/openclaw-tools.update-plan.test.ts` keep the execution-node-only guard requiring exactly one `in_progress` todo item.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

**1. Rewrite Context Scout Wording To Mechanical Lookup**
Current issue: `execution-context-scout` still says “edit-start windows” while also saying the scout must not decide edit readiness.

Fix:

- Remove “edit-start” language from context scout skill and runtime docs.
- Replace with “mechanical source evidence packet.”
- Scout must not say or imply:
  - `enough_for_minimal_edit`
  - `can_start_editing`
  - `edit_start_recommendation`
  - “this is enough to edit”
- Scout output should contain only:
  - exact symbols/phrases searched;
  - exact paths;
  - exact line windows;
  - bounded excerpts;
  - file graph;
  - likely edit points as mechanical evidence;
  - missing windows;
  - next exact searches.
- Kimi owns edit-readiness.

**2. Make Search-First Operational, Not Advisory**
Current issue: docs say “search first,” but scouts still read from line 1 and continue walking large files.

Fix skill wording to say:

- For known-file/symbol tasks, the first tool call should be `grep` scoped to the known file/path, unless the task is explicitly about imports/top-of-file context.
- A known file path is a search scope, not permission to read from line 1.
- If exact symbol grep misses, search variants/synonyms/import names.
- If scoped searches miss, return `missing_windows`; do not scroll through the file hoping to find it.
- Use `read` only after grep/list/glob identifies a window.
- Use `offset` and `limit` for every source read when the target file is large.

**3. Fix Context Scout Tool Examples**
Current issue: `docs/agents/execution-context-scout/runtime/TOOLS.md` still shows `read(path:"high/signal/file.ts")`, which matches the bad live behavior.

Replace examples with:

```text
grep(query:"buildWorkQueueExecutionReadModel", path:"extensions/execution-platform/src/work-queue/execution-read-model.ts")
read(path:"extensions/execution-platform/src/work-queue/execution-read-model.ts", offset:5265, limit:80)
```

Also update examples to show:

- grep exact symbol in known file;
- grep related symbol if exact misses;
- read only matched window;
- return `missing_windows` if no match.

**4. Fix Kimi Parent Delegation Wording**
Current issue: Kimi generated prompts like “entire file if small” and multi-file exact-window requests. That invited scout file-walking.

Fix parent skill/template wording:

- Never ask scouts for “entire file,” “full file,” “full contents,” or large type blocks.
- Ask for exact `symbol_windows`.
- Parent task prompt should say:
  - search these known refs first;
  - grep these symbols/phrases first;
  - return matched windows only;
  - return `missing_windows` if not found.
- If Kimi needs a type, it should ask for the exact field/type lines around the named symbol, not the whole type definition.

**5. Fix Active Proof Prompt**
Current issue: `.artifacts/execution-platform/kimi-worker-loop-test/work-queue-frontier-delta-stream-node-prompt.md` still says “minimum edit-start package.”

Update it to require:

- “mechanical source evidence packet”
- `symbol_windows`
- grep known refs first
- no sufficiency/edit-readiness judgment from scout
- missing exact windows instead of broad follow-up asks

**6. Add Grep Tool Affordance Parity**
The scout should not need perfect prompt discipline to do the obvious thing.

Add grep improvements:

- return path, line number, matched text, and suggested read window;
- add `suggestedRead: { path, offset, limit }` in details if tool result schema supports it;
- invalid regex should return a bounded diagnostic with suggested literal search, not a dead-end failure;
- cap noisy grep results with clear narrowing guidance.

**7. Finish Child/Subagent Progress Behavior**
Parent progress lease exists. Remaining work is child/scout behavior.

Add/prove:

- subagent lanes use progress lease semantics;
- repeated identical low-value tool progress does not keep lease alive forever;
- useful progress resets lease;
- no-progress returns typed failure;
- repeated low-value read-walk can return partial bounded context.

Typed outcomes:

- `child_no_progress_timeout`
- `child_repeated_low_value_progress`
- `child_partial_context_returned`
- `child_provider_response_timeout`

**8. Add Native Proof Optics**
We need readback without JSONL spelunking.

Add concise proof/readback projection:

- parent tool sequence;
- task id and child session id;
- scout model;
- scout tool calls by type/count;
- first N scout tool calls;
- result delivery status;
- projected/oversized status;
- working-context refs;
- whether result had `symbol_windows`, `inline_context_windows`, `file_graph`, `missing_windows`;
- next parent action after each scout result.

This is diagnostic telemetry, not a semantic quality gate.

**9. Add Scout-Handoff Quality Diagnostics**
Do not hard-block on semantic quality, but record structural handoff quality:

- `hasSymbolWindows`
- `hasInlineContextWindows`
- `hasFileGraph`
- `hasMissingWindows`
- `readCallCount`
- `grepCallCount`
- `startedWithRead`
- `rawTopOfFileReadCount`
- `oversizedProjected`

This will make Qwen read-walk regressions obvious.

**10. Clean Active Spec Wording**
Only update active specs and prompt artifacts that still say:

- `edit_start_recommendation`
- “minimum edit-start package”
- scout decides sufficiency
- full/entire file as a valid scout ask

Mark older contradictory specs superseded if needed. Do not churn the whole doc tree.

**11. Reload Runtime**
After doc/skill/prompt/tool changes:

- reload runtime docs/skills/code;
- confirm active runtime copies match source;
- confirm Kimi and scout bootstrap receive the updated docs/skills.

**12. Rerun One Work Queue Delta Proof**
Use the same Work Queue prompt after correction.

Success criteria:

- Kimi launches with full prompt/docs/skill.
- Kimi creates durable todo.
- Initial scout uses grep/search before read.
- Scout returns `symbol_windows`, bounded excerpts, and file graph.
- No scout returns sufficiency/edit-readiness judgment.
- Kimi keeps todo current when the scout result changes visible plan/progress,
  closes or starts a todo, or explains a blocker.
- Kimi edits after one or two scout passes.
- No broad parent reads; bounded parent `read`/`grep` is allowed only for one
  exact known local lookup from prompt, scout result, working context, file
  graph, or changed-file list.
- Validation scout runs focused validation.
- Kimi calls `node_finish`.
- Readback shows parent/scout flow without manual JSONL diagnosis.

**13. Add Scout Reasoning And Anti-Churn Correction**
Current issue: the latest proof showed task delivery and bounded lookup working, but Kimi still churned on source recovery. The first scout packet did not provide enough actual line-windowed source for likely edit points, and Kimi treated remaining uncertainty as permission for repeated scouts and parent reads instead of making a smallest safe edit or blocking.

Fix:

- The context scout must still provide mechanical evidence only; it must not decide edit readiness.
- Every likely edit point must be paired with an actual bounded source/test excerpt and a line/window hint.
- If the scout can name a likely edit point but cannot return its actual window, it must put that item under `missing_windows` with the exact grep/read ask.
- Kimi may use one bounded parent `read` or `grep` for one exact known local lookup.
- Kimi may delegate one exact scout repair for the same edit target.
- After one exact parent lookup or one exact scout repair for the same edit target, Kimi should make the smallest safe edit from current windows, finish blocked with the missing source/window, or move to a genuinely distinct todo/symbol.
- Kimi should not chain context scouts for the same question unless an edit or validation failure introduces a new concrete signal.
- Context scout should receive a modest thinking budget for map/unknown-architecture work. Validation scout should receive medium thinking for command selection and failure diagnosis.
- The native child launch must honor the target child agent's own `thinkingDefault`; this is normal OpenClaw agent config, not a new Execution Platform schema.

Acceptance evidence:

- `src/agents/subagent-spawn-thinking.ts` reads `targetAgentConfig.thinkingDefault`.
- `src/agents/subagent-spawn-plan.ts` self-resolves `targetAgentConfig` from the native agent registry when callers omit it.
- `src/agents/session-runtime/run-child.ts` applies `initialSessionPatch` to the child session entry before child runtime start.
- `src/agents/session-runtime/run-child.ts` fails execution scouts before runtime unless their native agent config declares a non-off `thinkingDefault`.
- `src/agents/session-runtime/run-child.ts` fails execution scouts before runtime if the resolved child plan does not match that native `thinkingDefault`.
- `src/agents/pi-embedded-runner/run-child-session-runtime.test.ts` proves native child task launch forwards the context scout `thinkLevel` and persists `thinkingLevel:"low"` in the child session entry.
- active runtime config shows `execution-context-scout` with `thinkingDefault:"low"` and `execution-validation-scout` with `thinkingDefault:"medium"`.
- host/container docs and skills hash-match after reload.
- the native task tool parent-visible result includes the same-edit-target anti-churn hint.

**14. Add OpenCode-Style Read/Grep Tool Reminders**
Current issue: active execution skills are loaded at bootstrap, but the live proof drifted at the exact read/grep handoff moment. Kimi and Qwen could see the general role contract, yet still used the allowed tools in a locally bad way.

Do not add a tool-triggered skill activation system.

Reason:

- Required execution skills are already active session context before the first provider turn.
- Search/read tool calls are too late to activate a skill for the call that has already been chosen.
- Loading skills from tools would duplicate bootstrap, add context churn, and create another source of drift.
- OpenCode does not solve this by activating skills from Read/Grep. It uses tool descriptions before the call and `<system-reminder>`-style tool-result instructions after the call.

Fix:

- Put tool-use guidance in the execution parent/scout `read` and `grep` tool descriptions so it is visible before tool choice.
- Add a compact `<system-reminder>` to execution parent/scout `read` and `grep` results so the next model action is re-anchored at the exact handoff point.
- Parent reminder:
  - this is one bounded repair lookup;
  - edit, ask one exact missing window, finish blocked, or move to a distinct todo;
  - do not continue sequential read/grep walking for the same edit target.
- Context scout grep reminder:
  - use `suggested_read` windows for matched symbols;
  - search variants if scoped search misses;
  - return `missing_windows`;
  - do not switch to top-of-file read walking.
- Context scout read reminder:
  - final handoff must use literal headings `symbol_windows`, `file_graph`, `missing_windows`, and `likely_edit_points`;
  - a `likely_edit_points` item is valid only when paired with an actual line-window excerpt.
- Validation scout reminder:
  - answer the focused validation question;
  - return commands considered/run, exit status, bounded output excerpts, diagnosis, repair context, and residual risk;
  - do not mutate files.

Acceptance evidence:

- `src/agents/pi-tools.ts` wraps execution role `read`/`grep` tools with role-specific description/result reminders.
- `src/agents/pi-tools.node-authority-overlay.test.ts` proves parent exact read results include the anti-sequential-walk reminder.
- `src/agents/pi-tools-agent-config.test.ts` proves context scout read/grep descriptions and results include search-first and literal handoff reminders.
- `pnpm test:file src/agents/pi-tools.node-authority-overlay.test.ts src/agents/pi-tools-agent-config.test.ts` passes.

**15. Narrow Parent Grep To File-Local Exact Lookup**
Current issue: keeping parent `grep` matches OpenCode's successful editor pattern, but broad parent grep recreates the crawler loophole. Kimi should be able to repair one exact missing window without spawning another scout; it should not be able to search the repo.

Fix:

- Keep parent `grep` in execution-node native-task mode.
- Require `query`.
- Require `path`.
- `path` must resolve to one known workspace file.
- Reject repo-root grep.
- Reject directory grep.
- Reject `glob`.
- Reject `file://`.
- Reject OpenClaw Runtime Home/state paths.
- Reject paths outside the workspace root.
- Keep the tool description explicit: parent `grep` is one file-local exact lookup from a known source path, not discovery.

Acceptance evidence:

- `src/agents/pi-tools.ts` enforces the parent grep guard beside the exact parent read guard.
- `src/agents/pi-tools.node-authority-overlay.test.ts` proves exact known-file grep is allowed.
- `src/agents/pi-tools.node-authority-overlay.test.ts` proves repo-root/no-path/glob grep is rejected.
- `pnpm test:file src/agents/pi-tools.node-authority-overlay.test.ts src/agents/pi-tools-agent-config.test.ts` passes.

**Core Architectural Rule**
Do not add another deterministic workflow cage. Fix the native OpenClaw skill/tool/task surface so the normal path becomes the right path: scout does mechanical lookup, Kimi decides and edits, validation scout validates, runtime records progress and optics.
