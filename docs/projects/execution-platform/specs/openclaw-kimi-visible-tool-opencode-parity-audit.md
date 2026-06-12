---
summary: "Running audit of Kimi-visible OpenClaw tool behavior against the local OpenCode implementation, including source readback, search, LSP, truncation, and compaction."
title: "OpenClaw Kimi-Visible Tool OpenCode Parity Audit"
---

# OpenClaw Kimi-Visible Tool OpenCode Parity Audit

Status: running audit with the 2026-06-11 priority proposal implemented in
code and focused tests; live Work Queue delta proof remains the final runtime
gate.

Purpose: record audited differences between Kimi-visible OpenClaw tools and the
local OpenCode implementation, plus their resolution status, so parity gaps do
not disappear during compaction or later proof turns.

Scope:

- Kimi-visible tools in the latest execution-coding proof lane:
  `apply_patch`, `edit`, `glob`, `grep`, `lsp`, `node_finish`,
  `openclaw_resource_read`, `read`, `read_todo`, `task`, `update_plan`.
- Tool-facing descriptions and tool ordering.
- Truncation and managed-output readback.
- Auto-compaction and replay readback.

Local OpenCode source:

- `.artifacts/opencode-dev/packages/opencode/src/tool/read.ts`
- `.artifacts/opencode-dev/packages/opencode/src/tool/read.txt`
- `.artifacts/opencode-dev/packages/opencode/src/tool/grep.ts`
- `.artifacts/opencode-dev/packages/opencode/src/tool/grep.txt`
- `.artifacts/opencode-dev/packages/opencode/src/tool/glob.ts`
- `.artifacts/opencode-dev/packages/opencode/src/tool/glob.txt`
- `.artifacts/opencode-dev/packages/opencode/src/tool/lsp.ts`
- `.artifacts/opencode-dev/packages/opencode/src/tool/lsp.txt`
- `.artifacts/opencode-dev/packages/opencode/src/tool/edit.ts`
- `.artifacts/opencode-dev/packages/opencode/src/tool/edit.txt`
- `.artifacts/opencode-dev/packages/opencode/src/tool/apply_patch.ts`
- `.artifacts/opencode-dev/packages/opencode/src/tool/apply_patch.txt`
- `.artifacts/opencode-dev/packages/opencode/src/tool/task.ts`
- `.artifacts/opencode-dev/packages/opencode/src/tool/task.txt`
- `.artifacts/opencode-dev/packages/opencode/src/tool/todo.ts`
- `.artifacts/opencode-dev/packages/opencode/src/tool/todowrite.txt`
- `.artifacts/opencode-dev/packages/opencode/src/tool/truncate.ts`
- `.artifacts/opencode-dev/packages/opencode/src/session/overflow.ts`
- `.artifacts/opencode-dev/packages/opencode/src/session/compaction.ts`
- `.artifacts/opencode-dev/packages/opencode/src/tool/registry.ts`

OpenClaw source under audit:

- `src/agents/pi-tools.read.ts`
- `src/agents/tools/repo-discovery-tools.ts`
- `src/agents/tools/lsp-tool.ts`
- `src/agents/openclaw-lsp-service.ts`
- `src/agents/pi-tools.host-edit.ts`
- `src/agents/apply-patch.ts`
- `src/agents/tools/native-task-tool.ts`
- `src/agents/tools/update-plan-tool.ts`
- `src/agents/tool-description-presets.ts`
- `src/agents/tools/openclaw-resource-read-tool.ts`
- `src/config/sessions/managed-output.ts`
- `src/config/sessions/working-context.ts`
- `src/agents/pi-embedded-runner/tool-result-truncation.ts`
- `src/agents/pi-embedded-runner/compact.ts`
- `src/agents/pi-embedded-runner/run.ts`
- `src/agents/pi-tools.ts`
- `docs/agents/execution-coding/Tools.md`
- `docs/agents/execution-coding/runtime/TOOLS.md`

## Resolution Status - 2026-06-11

This section records completion against the current priority proposal. Older
audit findings below are preserved for provenance; where this status table says
resolved, it supersedes the older "remaining difference" wording for that
surface unless a later live proof contradicts it.

| Audit Surface                                                                 | Status                                                                                | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 grep search-first/result-cap behavior                                      | Resolved in code and focused tests                                                    | `src/agents/tools/repo-discovery-tools.ts` now searches the requested scope before capping returned rows, preserving OpenClaw state/runtime exclusions while avoiding candidate-slice false non-answers. Focused validation passed: `pnpm test:file src/agents/tools/repo-discovery-tools.test.ts`.                                                                                                                                                                                                                                                                                                                  |
| P0 glob result-cap behavior                                                   | Resolved in code and focused tests                                                    | `glob` uses the same search/output-cap shape rather than exposing unpredictable candidate preselection as model-visible incompleteness. Focused validation passed: `pnpm test:file src/agents/tools/repo-discovery-tools.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                   |
| P0 repeated read coverage/correction leakage                                  | Resolved in code and focused tests                                                    | The execution read path no longer makes Kimi interact with source-window coverage or repeated path-only denial as the model-visible source path. Successful reads return OpenCode-style source-shaped content with bounded line windows and continuation metadata. Focused validation passed: `pnpm test:file src/agents/pi-tools.read.repo-canonical.test.ts`.                                                                                                                                                                                                                                                      |
| P0 read continuation command shape                                            | Resolved in code and focused tests                                                    | The live Work Queue delta proof confirmed the old continuation hint was present but insufficiently concrete: `(Showing lines 1370-2169 of 5496. Use offset=2170 to continue.)`. `read` now preserves source-shaped output and includes an exact next tool call such as `Exact next read: read({"path":"large.ts","offset":1781,"limit":2000})`; managed-output saved path reads use the same exact-call hint. Focused validation passed: `pnpm exec oxfmt --check src/agents/pi-tools.read.ts src/agents/pi-tools.read.repo-canonical.test.ts` and `pnpm test:file src/agents/pi-tools.read.repo-canonical.test.ts`. |
| P0 Kimi-specific implementation prompt overlay                                | Resolved in code and focused tests; live proof pending                                | Kimi execution-coding runs now receive a short provider/system-level implementation overlay, not another long workflow doc. It says the worker's job is accepted source edits, first turn should form a provisional patch hypothesis, context acquisition should only ground that hypothesis, large TypeScript structure should use `lsp documentSymbol` or file-scoped `grep`, and exact read-continuation calls should be followed. Focused validation passed: `pnpm test:file extensions/openrouter/index.test.ts extensions/moonshot/index.test.ts extensions/kimi-coding/implicit-provider.test.ts`.            |
| P0 Work Queue delta proof prompt discovery bias                               | Resolved in prompt artifact; live proof pending                                       | The active Work Queue delta proof prompt now starts with edit objective, expected source change, likely files/symbols, patch shape, validation signals, allowed scope, and first-turn patch hypothesis. Discovery language is subordinate to grounding a concrete edit.                                                                                                                                                                                                                                                                                                                                              |
| P0 edit-start proof optics                                                    | Resolved in code and focused tests; live proof pending                                | Native trace optics now include model activation time, first edit after model activation, visible patch-hypothesis evidence, source calls before first edit, and path-only reads after exact continuation hints. Focused validation passed: `pnpm test:file extensions/execution-platform/src/workflows/node-agent-session.test.ts`.                                                                                                                                                                                                                                                                                 |
| P0 managed-output normal read/grep readback                                   | Resolved in code and focused tests                                                    | Saved managed-output paths can be inspected through normal `read` and searched through normal `grep`, while `openclaw_resource_read` remains an escape hatch. Focused validation passed: `pnpm test:file src/agents/pi-tools.read.repo-canonical.test.ts src/config/sessions/managed-output.test.ts src/agents/tools/repo-discovery-tools.test.ts`.                                                                                                                                                                                                                                                                  |
| P0 model-visible source/search evidence instead of cache/ref/projection state | Resolved for read/grep/glob/managed-output paths in focused tests; live proof pending | Source tools now favor source-shaped or search-shaped output. Durable refs and details remain internal/secondary rather than replacing the code/search evidence Kimi needs to edit. Focused validation passed across read, discovery, managed-output, and truncation tests.                                                                                                                                                                                                                                                                                                                                          |
| P1 LSP visibility, ordering, and docs                                         | Resolved in code and focused tests                                                    | `lsp` is a visible execution-coding navigation tool, ordered intentionally with source navigation, documented in execution-coding tool surfaces, and verified in provider catalog receipt tests. Focused validation passed: `pnpm test:file src/agents/tools/lsp-tool.test.ts src/agents/pi-embedded-runner/run/attempt.test.ts`.                                                                                                                                                                                                                                                                                    |
| P1 unsupported LSP operations                                                 | Resolved for model-visible catalog                                                    | Unsupported `incomingCalls` and `outgoingCalls` are no longer advertised by the active `lsp` tool. Current OpenClaw LSP remains TypeScript/JavaScript-focused; a full OpenCode multi-language LSP server-registry port is a future capability project, not required for this Work Queue proof stabilization slice. Focused validation passed: `pnpm test:file src/agents/tools/lsp-tool.test.ts`.                                                                                                                                                                                                                    |
| P1 compaction continuation source-shaped repair context                       | Resolved in code and focused tests; live replay gate pending                          | Node-worker overflow/timeout compaction now appends source-shaped changed-file repair windows and evidence refs through `<compaction_repair_context>`. Focused validation passed: `pnpm test:file src/agents/pi-embedded-runner/run.overflow-compaction.loop.test.ts`.                                                                                                                                                                                                                                                                                                                                               |
| P1 provider-bound catalog receipts                                            | Resolved in code and focused tests                                                    | Provider request diagnostics record ordered tool names, description/schema hashes, mutation tools, LSP visibility/order, reasoning settings, parallel tool calls, tool choice, max tokens, and sampling settings without raw prompts or tool bodies. Focused validation passed: `pnpm test:file src/agents/pi-embedded-runner/run/attempt.test.ts`.                                                                                                                                                                                                                                                                  |
| P1 raw provider response normalization receipts                               | Resolved in code and focused tests                                                    | OpenAI/OpenRouter, Anthropic, and Google transports attach raw finish/tool/reasoning shape metadata; runner normalization receipts compare raw and normalized stop/tool/result linkage without storing raw responses or hidden reasoning; OpenAI completions and Anthropic message streams guard provider tool-stop signals that contain no actual tool-call block. Focused validation passed: `pnpm test:file src/agents/openai-transport-stream.test.ts src/agents/anthropic-transport-stream.test.ts src/agents/google-transport-stream.test.ts src/agents/pi-embedded-runner/run/attempt.test.ts`.               |
| P1 validation scout exec affordance                                           | Resolved in docs/tool text and focused tests                                          | Validation exec guidance exposes repo-native commands, discourages shell for file search/read/edit, suppresses irrelevant process/background guidance when process tools are unavailable, and points to captured output readback. Focused validation passed: `pnpm test:file src/agents/bash-tools.test.ts`.                                                                                                                                                                                                                                                                                                         |
| P1/P2 mutation tool affordance for Kimi                                       | Resolved for current policy and focused tests                                         | Kimi-style execution-coding node workers default to a single configured primary mutation tool (`edit`) rather than forcing both `edit` and `apply_patch`; policy can still expose patch mode deliberately. Focused validation passed: `pnpm test:file src/agents/pi-tools-agent-config.test.ts src/agents/pi-tools.node-authority-overlay.test.ts src/agents/pi-embedded-runner/run/attempt.test.ts`.                                                                                                                                                                                                                |
| P2 update_plan lightweight semantics                                          | Resolved in code and focused tests                                                    | `update_plan` remains durable but provider-visible output is compact and status-board-like; no scheduler gate, no phase machine, and no special `inProgress:` authority line. Focused validation passed: `pnpm test:file src/agents/openclaw-tools.update-plan.test.ts src/agents/tools/update-plan-tool.test.ts`.                                                                                                                                                                                                                                                                                                   |
| Formatting for touched implementation surfaces                                | Resolved                                                                              | `pnpm exec oxfmt --check src/agents/openai-transport-stream.ts src/agents/openai-transport-stream.test.ts src/agents/anthropic-transport-stream.ts src/agents/anthropic-transport-stream.test.ts src/agents/google-transport-stream.ts src/agents/google-transport-stream.test.ts src/agents/pi-embedded-runner/run/attempt.ts src/agents/pi-embedded-runner/run.ts src/agents/pi-embedded-runner/run.overflow-compaction.loop.test.ts` passed.                                                                                                                                                                      |

Remaining runtime proof gate:

- Run the Work Queue delta Kimi proof after rebuild/reload so runtime uses the
  current code/docs.
- Confirm the live provider request/response receipts show intended tool order,
  raw/normalized stop reasons, and tool-call/result linkage.
- Confirm no failure path is caused by source context being available only as
  metadata, refs, cache markers, coverage messages, or projection framing.

## Historical Kimi-Visible Tool Catalog From Pre-Resolution Proof

The following snapshot is preserved from the pre-resolution proof lane. The
resolution table above is the current implementation status.

Pre-resolution proof lane visible tools:

- `apply_patch`
- `edit`
- `glob`
- `grep`
- `lsp`
- `node_finish`
- `openclaw_resource_read`
- `read`
- `read_todo`
- `task`
- `update_plan`

Pre-resolution provider-turn optics from
`.openclaw/runtime/agents/execution-coding/sessions/nrun_9b93472db82ee63acf1b.jsonl`
confirmed:

- Kimi did receive `lsp`.
- Provider-visible order was:
  `apply_patch`, `edit`, `node_finish`, `update_plan`, `read_todo`, `task`,
  `openclaw_resource_read`, `read`, `grep`, `glob`, `lsp`.
- Mutating tools were visible: `apply_patch`, `edit`.
- `applyPatchVisible=true`.
- Tool-call/result id linkage was healthy for that proof:
  `toolCallIdLinkageOk=true`.
- Kimi made no `lsp` calls.
- The killed proof showed a serial acquisition shape:
  two parallel acquisition turns, then mostly one-tool grep/read turns.

This means the current LSP failure mode is not "tool absent." It is weaker:
`lsp` is technically present but low-salience and under-integrated compared to
the normal read/grep/glob path.

## OpenCode Model-Facing Tool Text Snapshot

From local OpenCode source:

- `read.txt` says default read returns up to 2,000 lines, `offset` is
  1-indexed, use `grep` for specific content in large files, use `glob` for
  uncertain file paths, line numbers are prefixed as `<line>: <content>`, call
  in parallel when multiple files are known, and avoid tiny repeated slices.
- `grep.txt` says grep is a fast regex content search that works with any
  codebase size, supports full regex syntax, returns paths and line numbers,
  supports `include`, and open-ended multi-round search should use `Task`.
- `glob.txt` says glob is fast file pattern matching that works with any
  codebase size, returns paths, and multiple speculative searches should be
  batched in one response.
- `lsp.txt` lists all operations and says LSP servers must be configured; it
  returns an error if no server is available.
- `edit.txt` says read before editing, preserve exact indentation after the
  line-number prefix, prefer editing existing files, exact oldString failures
  are explicit, and `replaceAll` is for repeated replacements.
- `task.txt` explicitly says not to use Task for specific file paths,
  specific class definitions, or code in one to three known files; use
  Read/Grep/Glob instead.
- `todowrite.txt` says todo is for distinct conceptual steps, not three tool
  calls for one conceptual step, and todo should be skipped when tracking adds
  no value.

OpenCode's base Anthropic prompt does still strongly encourage Task and Todo.
So the important remaining parity gap is not simply "OpenCode has less process
text." The larger gap is that OpenCode's source tools keep valid acquisition
requests source/search-shaped, while some OpenClaw paths still return
correction/ref/projection-shaped results.

## Historical Highest-Risk Differences Audited Before 2026-06-11 Resolution

### 1. `grep` is not OpenCode parity.

OpenCode behavior:

- `grep` is regex-native.
- It calls the search service over the requested cwd/path.
- It searches first, then caps returned match rows at 100.
- It does not pre-cap the candidate file list in a way that can miss the target
  file and return zero matches.
- Truncation means "more matches available", not "the search did not reach
  match confidence."

OpenClaw behavior:

- `grep` walks candidate files first with `walkFiles(... maxFiles ...)`.
- It searches only the candidate slice.
- If the target file is beyond that slice, it can return:
  `Search incomplete before match confidence.`
- That is technically bounded, but model-visible behavior looks like a valid
  search was denied.

Why this matters:

- The live proof showed Kimi repeating broad grep for the same symbol after
  receiving incomplete non-answers.
- This is a plausible direct cause of the context-acquisition loop.

Recommended parity fix:

- Replace OpenClaw grep internals with OpenCode's search-first/result-cap shape.
- Cap visible returned matches/results, not whether the relevant files are
  searched.
- Preserve OpenClaw stateRoot/runtime exclusions.
- Keep OpenClaw parameter names only if they reduce local friction, but copy the
  behavior.

### 2. `glob` has the same pre-walk class of difference.

OpenCode behavior:

- `glob` calls the search service with `limit: 100`.
- It returns matching paths and a simple truncation note.

OpenClaw behavior:

- `glob` uses the local `walkFiles` path and a candidate cap.
- It is less likely than grep to cause a false negative on the current proof,
  but it is the same architectural class.

Recommended parity fix:

- Route `glob` through the same search-service behavior class as OpenCode.
- Cap visible path results, not candidate discovery in a way that can hide
  relevant files unpredictably.

### 3. `read` is source-shaped and no longer exposes coverage/correction state.

OpenCode behavior:

- Default file read returns up to 2,000 lines from the start.
- It has a 50KB byte cap.
- Output is source-shaped:
  `<path>`, `<type>file</type>`, `<content>`, line-numbered source, continuation.
- An out-of-range offset errors clearly.
- It does not maintain or expose a model-visible "already read" coverage ledger.
- It does not replace a repeated path-only read with a correction instead of
  source.

OpenClaw behavior:

- Normal successful reads are now source-shaped and line-numbered.
- It uses the same 2,000-line and 50KB class of bound.
- It warms LSP in the background, like OpenCode.
- The model-visible repeated path-only large-file correction path has been
  removed.
- Repeated path-only large-file reads return the same source-shaped first page,
  matching OpenCode's source-first behavior.
- Continuation hints include both `Use offset=N` and an exact next call shape,
  for example `Exact next read: read({"path":"large.ts","offset":1781,"limit":2000})`.

Why this matters:

- The user explicitly called out that source tools must return actual source,
  not metadata, coverage, or denial text.
- The live proof showed Kimi saw the old source-shaped continuation line but
  still omitted `offset` later; the exact-call hint removes one schema-inference
  failure point.

Recommended parity fix:

- Completed: remove the model-visible repeated path-only correction.
- Completed: repeated path-only large-file reads return OpenCode-style bounded
  source again.
- Completed: keep coverage/caching semantics out of the source path.
- Completed: add exact `read({...})` continuation guidance while keeping source
  text primary.

Parameter-shape note:

- OpenCode `read` uses `filePath`.
- Current OpenClaw execution read uses `path`.
- This is not automatically a bug, and the user has explicitly said not to
  rename parameters only for surface parity when it creates OpenClaw friction.
  But it remains a possible Kimi affordance difference to watch when comparing
  call shape against OpenCode examples.

### 4. `lsp` is visible but not naturally discoverable.

OpenCode behavior:

- `lsp` is an optional tool behind an experimental flag.
- The tool description lists supported operations.
- The implementation uses a generic LSP service with server discovery/client
  lifecycle.
- Read warms LSP state.
- Edit/write/apply_patch touch files and return LSP diagnostics after mutation.

OpenClaw behavior:

- `lsp` is visible in the execution-coding tool catalog.
- Kimi did not call it in the latest proof.
- `lsp` is not listed in `docs/agents/execution-coding/Tools.md`.
- `lsp` is not listed in `docs/agents/execution-coding/runtime/TOOLS.md`.
- Execution parent tool ordering prioritizes mutation tools, node lifecycle,
  todo/task/resource, then `read`, `grep`, `glob`; `lsp` is missing from the
  explicit priority list and therefore falls through to construction order.
- OpenClaw LSP is TypeScript/JavaScript only, based on the TypeScript language
  service.
- `incomingCalls` and `outgoingCalls` are currently stubs returning empty
  arrays.
- `workspaceSymbol` scans a capped local file list and returns the first 100
  matching symbols.
- OpenCode emits raw JSON for LSP results. OpenClaw emits source-coordinate
  text for symbols/locations, which may be better model-facing output, but it
  is not a verbatim parity match.
- OpenCode `lsp` is experimental and optional. OpenClaw currently exposes it to
  Kimi in this lane without the equivalent canonical docs.

Why this matters:

- Exposed but undocumented tools are weak affordances.
- A tool the model can technically call but does not see in the durable tool
  docs is not functionally equivalent to OpenCode's normal tool surface.

Recommended parity fix:

- Either promote and document `lsp` as a normal execution-coding tool, or hide it.
- Add `lsp` to execution-coding tool docs and runtime tool docs.
- Add `lsp` to provider tool order near `grep`/`read`.
- If true parity is the target, port OpenCode's generic LSP server registry and
  client lifecycle rather than keeping only TypeScript language-service support.
- Until then, hide unsupported call-hierarchy operations or implement them.

### 5. Managed-output/truncation is still a special side channel.

OpenCode behavior:

- Oversized output is saved to a normal filesystem path under the truncation
  directory.
- The model-visible hint says the full output was saved to that path.
- The agent can use normal `Read` and `Grep` on that saved file.
- The default truncation limits are 2,000 lines and 50KB.
- If Task is available, the hint says to have the explore agent process the
  saved file with Grep and Read and not read the full file directly.
- If Task is unavailable, the hint says to use Grep to search the full content
  or Read with offset/limit to view specific sections.

OpenClaw behavior:

- Oversized output is persisted as a managed output record under stateRoot.
- The visible hint includes a real output path, but the first-class durable
  identity is an `openclaw-managed-output://...` ref.
- `openclaw_resource_read` can hydrate the ref with line-windowed source-shaped
  output.
- `openclaw_resource_read` can grep/search the ref.
- This is operationally stronger, but it is not the same model experience as
  normal Read/Grep over a path.
- OpenClaw's projection hint also says:
  `Full output saved to: ...`
  and
  `Use Grep to search the full content or Read with offset/limit to view specific sections.`
  But normal OpenClaw `read`/`grep` do not transparently route that saved path
  back to the managed-output record in all cases.
- `openclaw_resource_read` defaults managed-output readback to line windows and
  renders them as source-shaped `<path>`, `<type>file</type>`, `<content>`.

Remaining model-facing gap:

- `openclaw_resource_read` managed-output grep stores before/after context in
  details but the formatted model-visible text only prints the matching line.
- Normal OpenCode guidance keeps the readback path as ordinary source/search
  workflow.
- OpenClaw still exposes `openclaw-managed-output://...` refs as a first-class
  thing the model may need to reason about. OpenCode exposes a normal path.

Recommended parity fix:

- Make managed output readable/searchable through the normal `read` and `grep`
  paths when a saved output path is shown.
- Keep `openclaw-managed-output://...` as durable identity if needed, but do not
  require the model to think in a special ref side channel.
- Fix `openclaw_resource_read` search formatting to include requested context
  lines if the special tool remains available.
- Prefer making the saved output path work with normal `read` and `grep` before
  improving special-ref affordances.

### 6. Compaction has more moving parts than OpenCode.

OpenCode behavior:

- Context overflow uses a usable-context threshold.
- Compaction selects old history to summarize and preserves a recent tail.
- Tool output included in compaction prompt is capped at 2,000 characters.
- Old completed tool output can be pruned.
- Auto-continue after compaction is generic:
  `Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.`
- OpenCode compaction also has a plugin hook for
  `experimental.compaction.autocontinue`, but the model-visible continuation is
  still a generic one-sentence "continue or ask" prompt unless plugins change
  it.

OpenClaw behavior:

- Compaction goes through the embedded Pi runner, context engine, hooks,
  checkpoint capture, managed-output projection, replay sanitization, and
  overflow recovery.
- Tool output for compaction is capped and persisted to managed output.
- Large settled mutation tool-call args can be compacted out of replay.
- Old tool results can be replaced by:
  `[Old tool result content cleared]`
  plus a preview and saved output path.
- Node worker auto-compaction adds a custom implementation continuation:
  `Continue the current implementation. If target files, patch shape, and validation signal are known, edit or validate next. Do not restart source discovery unless a named source window, failed edit, or validation error requires it.`

Why this matters:

- Some of OpenClaw's extra machinery is useful, but it creates more model-visible
  shapes than OpenCode.
- If old exact source windows are replaced by markers/previews, Kimi may not
  believe it still has usable edit context.

Recommended parity fix:

- Keep compaction state and checkpoints internally, but make model-visible
  readback look like OpenCode: ordinary source/search snippets and normal saved
  files.
- Avoid old-result markers becoming the primary visible representation of source
  needed for repair.
- Prefer source-shaped continuation packs over ledger/projection language after
  compaction.
- Do not make old-result markers the only visible representation of source
  context that an edit/repair turn depends on.

### 7. `update_plan` is closer to OpenCode, but still more durable machinery.

OpenCode behavior:

- TodoWrite writes the submitted todo list.
- It returns a simple title/count and JSON output.
- It is a progress board, not a lifecycle controller.

OpenClaw behavior:

- `update_plan` now returns compact JSON and no longer emits a special
  `inProgress:` phase line.
- The description says todo is status only, not a workflow gate.
- It still persists refs/events/history in details and has OpenClaw-specific
  durable session machinery.

Recommendation:

- Do not spend more effort here before fixing source/search parity.
- Keep the provider-visible result thin and OpenCode-like.
- Keep watching first-todo shape, but do not treat todo as the primary blocker
  while grep/read still differ from OpenCode.

### 8. `edit` and `apply_patch` are stronger than OpenCode in some ways, but not identical.

OpenCode behavior:

- `edit` is exact string replacement plus a sequence of tolerant replacers:
  simple, line-trimmed, block-anchor, whitespace-normalized,
  indentation-flexible, escape-normalized, trimmed-boundary, context-aware, and
  multi-occurrence.
- It formats, publishes diff metadata, touches LSP, and returns diagnostics.
- `apply_patch` validates a patch envelope, applies it, formats, touches LSP,
  and returns diagnostics.
- OpenCode has a disproportionate-match guard: it refuses replacement when the
  matched span is much larger than `oldString`.

OpenClaw behavior:

- `edit` has exact replacement plus several tolerant recovery strategies.
- It has surgical safety checks for huge oldText, large net deletions, and
  dropped declarations.
- It returns diff summary, first changed line, TypeScript syntax diagnostics,
  and LSP diagnostics.
- `apply_patch` applies safe patches and returns LSP diagnostics.
- OpenClaw exposes both `apply_patch` and `edit` to Kimi. OpenCode's registry
  normally exposes either `apply_patch` for selected GPT models or `edit`/`write`
  for other models, not both.
- OpenClaw intentionally orders `apply_patch` and `edit` first for the
  execution parent. OpenCode builtin registration order is read/glob/grep/edit/
  write/task/todo/patch/lsp, with provider/model filtering later.

Recommendation:

- These differences are not the current leading blocker.
- Keep the OpenClaw safety improvements unless they produce false negatives.
- Ensure failed edits are truly `isError:true` and model-visible failure text is
  clear.
- Decide later whether exposing both `apply_patch` and `edit` is helping or
  creating decision friction for Kimi. Do not change this before source/search
  parity.

### 9. `task` is aligned in direction but remains OpenClaw-specific.

OpenCode behavior:

- `Task` requires explicit subagent identity.
- It creates/resumes child sessions attached to the parent.
- Child permissions are derived from parent/session rules.
- Task description says not to use Task for specific path/class/code lookup in
  a small known file set; use Read/Grep/Glob instead.

OpenClaw behavior:

- `task` now follows the same high-level shape: explicit child identity and
  first-party scout/validation roles.
- It is still routed through OpenClaw native child session runtime and working
  context projection.
- It has parent-visible result projection for child output.

Recommendation:

- Keep the OpenClaw native `sessions.runChild` direction.
- Avoid making child result projection replace exact source-shaped evidence.

### 10. `node_finish` is OpenClaw-specific, not an OpenCode parity target.

OpenCode behavior:

- There is no `node_finish` equivalent in the ordinary OpenCode coding loop.

OpenClaw behavior:

- `node_finish` is a native Execution Platform lifecycle handoff.
- The schema now exposes valid statuses directly:
  `completed`, `blocked`, `needs_escalation`.
- The model-visible description explicitly says not to use `ok`, `success`,
  `done`, `needs_review`, or `$success`.
- Invalid status calls return a structured result with valid status values and
  examples.
- Completed nodes require changed-file and validation evidence refs, and native
  working-context evidence can be auto-attached.

Recommendation:

- Keep `node_finish` as an OpenClaw-specific lifecycle tool.
- Treat parity as model-facing clarity, not OpenCode behavioral sameness.
- The current enum guidance is materially improved; do not prioritize it over
  `grep`, `glob`, `read`, managed-output readback, and compaction source
  visibility.

### 11. `source_context_batch` is not currently Kimi-visible.

Current finding:

- The latest execution-coding provider catalog did not include
  `source_context_batch`.
- Local tests and specs still mention it, but the current node-parent Kimi lane
  does not expose it.

Recommendation:

- Do not focus the next parity pass on `source_context_batch` unless it
  reappears in a live provider catalog.
- Keep the "no source batch abstraction" decision in place for the execution
  parent.

### 12. Tool descriptions no longer advertise repeated-read correction state.

OpenCode model-facing source tools:

- Keep `read`, `grep`, and `glob` short and capability-oriented.
- Mention Task only for open-ended or multi-round exploration.
- Do not say a repeated valid read will return a correction instead of source.

OpenClaw model-facing source tools:

- `read` now says successful bounded reads return actual line-numbered source,
  documents offset/limit, and no longer advertises repeated path-only
  correction text.
- `grep` says to pass `path` for a known file/directory and use `regex:false`
  for literal text.
- `task` has good OpenCode-style "do not use Task for known file/symbol lookup"
  wording.
- Canonical execution-coding tool docs currently omit `lsp`.

Recommendation:

- Completed: strip the repeated-path-only correction sentence from read and
  keep continuation source-shaped with exact next-call guidance.
- Keep file-scoped grep guidance only after grep behavior itself is fixed to
  search-first/result-cap semantics.
- Add `lsp` to execution-coding tool docs if it remains visible.

## Historical Running Recommendation Set Audited Before 2026-06-11 Resolution

Priority 0:

1. Replace OpenClaw `grep` internals with OpenCode's search-first/result-cap
   semantics. Do not pre-cap candidate files before search.
2. Completed: remove model-visible repeated path-only read denial from `read`.
3. Make managed-output saved paths usable through normal `read` and `grep`, or
   route those normal tools to managed-output records transparently.
4. Remove source-tool outputs and descriptions that make the model reason about
   cache/coverage/correction state instead of source/search evidence.

Priority 1:

5. Promote `lsp` into the execution-coding tool docs and explicit tool order, or
   hide it until it is documented.
6. Either port OpenCode's generic LSP service layer or clearly restrict/hide
   unsupported LSP operations.
7. Make compaction continuation source-shaped and ordinary-file-oriented when
   exact source context is needed.

Priority 2:

8. Keep `update_plan` thin; do not add new workflow authority.
9. Keep edit/apply_patch diagnostics and safety, but audit failure `isError`
   correctness.
10. Decide whether Kimi should see both `apply_patch` and `edit`, or one
    primary mutation tool, only after source/search parity is fixed.

## Historical Open Questions From The Pre-Resolution Audit

- Does OpenClaw provider tool schema order exactly match the best intended
  execution-parent order after provider normalization? Current observed order
  has `lsp` last.
- Does Kimi receive `lsp` with a description strong enough to call it naturally?
  Current evidence says "probably not" because it was visible but unused, and
  canonical docs omit it.
- Are `read`, `grep`, and `glob` schema field names creating avoidable friction
  versus the model's OpenCode-shaped expectations?
- Are compaction old-result markers appearing in the exact turn where Kimi needs
  repair source?
- Is OpenClaw's richer compaction/checkpoint machinery helping recovery enough
  to justify the additional model-visible shapes, or should model-visible
  compaction readback copy OpenCode more directly?

## Historical Surfaces Not Yet Fully Audited By The Pre-Resolution Audit

The current audit is intentionally focused on the tools visible to Kimi in the
latest execution-coding proof lane plus truncation and compaction. These
OpenCode surfaces are not fully audited yet:

- Provider adapter and message normalization: raw Kimi/OpenRouter response
  parsing, stop-reason mapping, tool-call block normalization, parallel tool
  call handling, and tool-result id preservation against OpenCode's provider
  pipeline.
- Full OpenCode search service internals behind `grep` and `glob`, including
  ripgrep/search backend behavior, ignore rules, paging, hidden-file policy,
  binary handling, and path/include normalization. The audit currently covers
  the public tool wrappers and the important search-first/result-cap shape.
- Full permission/runtime registry pipeline: OpenCode permission evaluation,
  tool filtering, plugin `tool.definition` transforms, doom-loop permission,
  plan/build mode distinction, and subagent permission inheritance beyond the
  Task/tool-level comparison.
- Shell/exec tools: not visible to the Kimi parent lane, but important for
  validation scout parity. OpenCode shell prompt/truncation behavior was only
  spot-checked through truncation references.
- `write` tool: OpenCode exposes write for non-apply_patch models; Kimi parent
  currently sees `edit` and `apply_patch`, not `write`, so write was not fully
  compared.
- Formatting pipeline: OpenCode format service integration after edit/write/
  apply_patch was observed, but the formatter implementation and language
  coverage were not audited against OpenClaw.
- Full LSP service internals: OpenCode's generic LSP registry/client lifecycle,
  server configuration, diagnostics aggregation, and language coverage were not
  exhaustively compared to OpenClaw's TypeScript-service implementation.
- Skill system: OpenCode skill discovery/loading/tool behavior was discussed in
  prior work, but this spec does not fully audit skills because the current
  execution-coding proof lane is not using always-active workflow skills.
- Agent/system prompt assembly: OpenCode's base Anthropic prompt and explore
  prompt were sampled, but the full prompt assembly path, project instruction
  loading, rules files, and plugin prompt transforms were not fully compared.
- Session persistence/event model: OpenCode session message parts, summaries,
  compaction parts, replay, and storage model were only reviewed where they
  affect compaction/truncation readback.
- UI/client behavior and approvals: OpenCode's CLI/UI rendering, permissions
  prompts, diff approval metadata, and LSP/diagnostic display were not audited
  except where model-visible output differs.

Recommended next audit slice:

1. Provider/message normalization parity for Kimi.
2. OpenCode search service internals versus OpenClaw grep/glob implementation.
3. Validation-scout exec/shell/tool-output parity.
4. Full LSP service and formatter parity.
5. Permission/tool-registry filtering and doom-loop behavior.

## Additional Surface Audit: Search Service Internals

Status: audited enough to confirm the grep/glob gap is deeper than tool text.

OpenCode surfaces reviewed:

- `.artifacts/opencode-dev/packages/opencode/src/tool/grep.ts`
- `.artifacts/opencode-dev/packages/opencode/src/tool/glob.ts`
- `.artifacts/opencode-dev/packages/core/src/filesystem/search.ts`
- `.artifacts/opencode-dev/packages/core/src/filesystem/ripgrep.ts`

OpenCode behavior:

- `grep` resolves the requested path into a cwd plus optional file list, then
  calls `Search.Service.search`.
- If a specific file is requested, OpenCode passes that file to ripgrep/search.
- If a directory or cwd is requested, OpenCode searches that root directly.
- Search service first tries the native FFF picker when available and scan-ready.
- FFF grep uses regex mode with `pageSize: limit` and a 1.5s time budget.
- If FFF is unavailable, not ready, or errors, OpenCode falls back to ripgrep.
- The ripgrep fallback runs `rg --json --hidden --glob=!.git/* --no-messages`
  over the requested file(s) or `.`.
- Ripgrep `--max-count` limits matches per file when `input.limit` is supplied;
  it does not preselect only the first N files and then stop searching.
- OpenCode then formats rows and caps visible returned matches at 100 in the
  tool wrapper.
- `glob` first tries FFF glob with `pageSize: 100`; if unavailable, it streams
  `rg --files` with the glob and takes `limit + 1` to determine truncation.
- OpenCode stores recent search hits for frecency/query tracking through
  `Search.open`, but that is not in the model-visible search result path.

OpenClaw surfaces reviewed:

- `src/agents/tools/repo-discovery-tools.ts`

OpenClaw behavior:

- `grep` resolves an exact file candidate when possible.
- If no exact file candidate exists, it calls `walkFiles` with `maxFiles`.
- It only searches the returned candidate file slice.
- If the target file is outside the candidate slice, `grep` may return
  `Search incomplete before match confidence` with zero matches.
- `glob` also calls `walkFiles` and then slices the result set for display.
- The cap is therefore partly on candidate discovery, not only on visible
  output.

Model-facing consequence:

- OpenCode makes a broad grep expensive but still semantically legitimate:
  the model gets matches, no matches, or a normal truncation note from a search
  over the requested root.
- OpenClaw can turn a legitimate broad grep into a non-answer when the candidate
  file preselection misses the relevant file.
- That non-answer is not equivalent to OpenCode truncation. It tells Kimi the
  search did not reach confidence, which can rationally trigger repeated search
  attempts instead of editing.

Parity recommendation:

- Replace OpenClaw `grep` with a search-first implementation:
  run a real content search over the requested root/path/include, then cap the
  returned match rows.
- Preserve `stateRoot`, `.git`, `node_modules`, dist/generated, and configured
  ignored-root exclusions, but implement those as search ignore rules rather
  than as a small candidate preselection slice.
- Replace OpenClaw `glob` with the same shape:
  run the glob over the requested root and cap returned visible paths.
- Keep OpenClaw parameter names if needed, but copy OpenCode's behavior:
  correctness bound on returned output, not on whether the search reaches the
  relevant files.
- After this change, broad grep should return either matches, no matches, or
  normal truncation. It should not return "incomplete before match confidence"
  solely because an internal file-candidate slice ended early.

## Additional Surface Audit: Provider And Message Normalization

Status: deeper request/response normalization audit recorded; raw
transport-specific response parsing still needs proof-level optics, but the main
code seams are now mapped.

OpenCode surfaces reviewed:

- `.artifacts/opencode-dev/packages/opencode/src/session/prompt/kimi.txt`
- `.artifacts/opencode-dev/packages/opencode/src/session/system.ts`
- `.artifacts/opencode-dev/packages/opencode/src/session/prompt.ts`
- `.artifacts/opencode-dev/packages/opencode/src/session/llm/ai-sdk.ts`
- `.artifacts/opencode-dev/packages/opencode/src/session/llm/request.ts`
- `.artifacts/opencode-dev/packages/opencode/src/session/llm/native-runtime.ts`
- `.artifacts/opencode-dev/packages/opencode/src/session/llm/native-request.ts`
- `.artifacts/opencode-dev/packages/opencode/src/session/message-v2.ts`
- `.artifacts/opencode-dev/packages/opencode/src/session/processor.ts`
- `.artifacts/opencode-dev/packages/opencode/src/provider/transform.ts`

OpenCode behavior:

- OpenCode has a Kimi-specific system prompt selected when the model API id
  includes `kimi`.
- That Kimi prompt strongly emphasizes action, tool use, parallel tool calls,
  and actual file edits through `write`/`edit`.
- OpenCode's session loop explicitly handles a provider pathology:
  some providers return `stop` even when the assistant message contains tool
  calls. The loop continues if tool parts exist and are not provider-executed
  or cleanup-marked interrupted orphans.
- Native runtime adapts session/AI-SDK-shaped messages into canonical
  `@opencode-ai/llm` request objects.
- Request preparation merges provider defaults, model options, agent options,
  and variant options, then lets plugins transform chat params and headers.
- Prepared tool definitions are sorted by tool name before provider request.
  OpenCode's registry order and final provider order are therefore not the same
  thing.
- Tool results are represented with preserved tool ids and names through
  `ToolResultPart.make`.
- `message-v2.ts` converts completed tool parts back into model-visible
  tool-result parts with the original `toolCallId`, input, output, attachments
  when supported, and provider metadata when the model has not changed.
- Pending/running tool calls are replayed as interrupted tool errors so providers
  do not receive dangling tool-use blocks.
- Native runtime dispatches non-provider-executed tool calls and streams the
  resulting tool events back into the same event stream.
- The AI SDK adapter tracks text, reasoning, tool names, step finish, finish,
  and provider metadata. It resets adapter state after final finish to avoid
  leaking counters or block IDs across follow-up streams.
- OpenCode's provider transform avoids reasoning variants for model ids that
  include `kimi`, `k2p`, `qwen`, `deepseek`, `minimax`, `glm`, and similar
  OpenAI-compatible reasoning families. For those, OpenCode generally relies on
  provider/model defaults unless explicit options are configured elsewhere.
- For OpenRouter, OpenCode sets `prompt_cache_key` from the session id.
- For OpenAI-compatible interleaved reasoning models, OpenCode moves reasoning
  content into provider options only when the model capability declares the
  required interleaved field and the provider package is not OpenRouter.

OpenClaw evidence reviewed:

- Latest execution-coding provider-turn optics in
  `.openclaw/runtime/agents/execution-coding/sessions/nrun_9b93472db82ee63acf1b.jsonl`
  recorded healthy linkage for that run:
  `toolCallIdLinkageOk=true`.
- The same optics recorded per-turn `stopReason`, `hasNewToolCalls`,
  matching tool-result ids, missing tool-result ids, visible tools, tool
  catalog hashes, and serial/parallel acquisition counts.
- That proof had a terminal provider error after acquisition, but the recorded
  tool-call/result linkage before that point was healthy.
- OpenClaw has redacted provider-request diagnostics:
  `node_agent_provider_request_diagnostics` records model, provider, API,
  reasoning, reasoning_effort, include_reasoning, parallel_tool_calls,
  tool_choice, max_tokens, temperature, top_p, and stream, while explicitly
  marking raw prompt/response/tool logs as not stored.
- OpenClaw has provider-turn optics:
  visible tools, mutation tools, per-assistant stop reason, tool call ids,
  matching/missing tool-result ids, parallel tool-call turns, and serial
  acquisition turns.
- OpenClaw replay sanitization is more elaborate:
  image sanitization, thinking-block policy, tool-call input redaction,
  tool-use/result pairing repair, OpenAI Responses downgrade logic, tool-call id
  sanitation, details stripping, compaction usage snapshots, provider replay
  hooks, and Google turn-order repair.
- OpenClaw transcript repair can synthesize missing tool results with an
  explicit error text and can drop duplicate/orphan tool results.
- OpenClaw extra params now inject Kimi implementation-worker defaults for
  `openrouter/moonshotai/kimi-k2.6`:
  `parallel_tool_calls=true`,
  `reasoning={ effort: "none", exclude: true }`,
  and `thinking={ type: "disabled" }`,
  unless overridden.
- OpenClaw has a separate child-scout thinking assertion path that can require
  low/medium thinking for scout agents and fail if the session thinking level
  does not match the launch policy.

Current differences and open risks:

- OpenCode has a dedicated Kimi system prompt. OpenClaw execution-coding uses
  OpenClaw agent docs/node prompt/tool descriptions instead. This is not
  automatically wrong, but it is a remaining model-facing difference.
- OpenCode's Kimi prompt says: when modifying code, use tools to make actual
  changes and do not merely describe them. OpenClaw has similar edit-first
  language, but it is split across agent docs, node prompt, and tool
  descriptions.
- OpenCode has an explicit loop condition for `stop` plus tool parts. OpenClaw
  optics show the last proof's tool/result ids were healthy, but the underlying
  OpenRouter/Kimi response parser and stop-reason mapping still need a raw
  transport-level audit.
- OpenCode's native runtime has one canonical request adapter boundary from
  AI-SDK-shaped session data to `@opencode-ai/llm`. OpenClaw has multiple
  provider/plugin/runner paths; this should be audited for accidental divergent
  Kimi handling.
- OpenCode avoids automatic reasoning variants for Kimi/Qwen-like ids, while
  OpenClaw intentionally injects Kimi implementation-worker reasoning-off
  controls and separately requires scout thinking. That policy may be correct,
  but it is not OpenCode parity and must be proven at provider-request level for
  each role.
- OpenCode emits ordinary tool results directly from its tool output, while
  OpenClaw strips `details` before replay and repairs transcript structure. This
  is necessary hygiene, but it is another place where source evidence can become
  less visible if the model-visible `content` is not already source-shaped.
- OpenCode uses `prompt_cache_key` for OpenRouter. The audited OpenClaw
  extra-param path did not show a direct default `prompt_cache_key` injection for
  OpenRouter; OpenClaw has other cache wrappers and Anthropic-family cache
  controls, but this remains a provider-option parity gap to verify.
- OpenCode sorts tools alphabetically at request prep. OpenClaw currently uses a
  curated visible order for execution-coding. This is a deliberate affordance
  difference; it should remain only if proofs show it helps Kimi mutate sooner.

Recommendation:

- Keep provider-turn optics as a permanent proof metric for Kimi worker runs.
- Keep redacted provider request diagnostics as a permanent proof metric.
- Add a redacted provider response normalization trace for
  Kimi/OpenRouter that records:
  model, raw finish reason, normalized stop reason, number of tool calls,
  tool-call ids, tool names, provider-executed flags, and whether final text and
  tool calls coexisted.
- Compare the response trace to provider-turn optics so a Kimi stop/tool-use
  parser regression is visible immediately.
- Add a proof assertion that source-shaped tool `content` survives replay
  sanitization and compaction for the active changed/error windows.
- Treat provider/message normalization as a separate P0/P1 audit lane after
  source/search tool parity, because the last proof showed healthy linkage but
  the transport risk remains high.
- Compare OpenClaw's Kimi-facing base prompt against OpenCode's `kimi.txt`
  after source/readback parity is fixed. Do not reintroduce long workflow
  prompts; if copied, copy the short action/tool-use commitments.

## Additional Surface Audit: Tool Registry, Permissions, And Loop Handling

Status: audited enough to identify model-facing registry differences and loop
handling differences.

OpenCode surfaces reviewed:

- `.artifacts/opencode-dev/packages/opencode/src/tool/registry.ts`
- `.artifacts/opencode-dev/packages/opencode/src/permission/index.ts`
- `.artifacts/opencode-dev/packages/core/src/v1/permission.ts`
- `.artifacts/opencode-dev/packages/opencode/src/agent/agent.ts`
- `.artifacts/opencode-dev/packages/opencode/src/agent/subagent-permissions.ts`
- `.artifacts/opencode-dev/packages/opencode/src/session/processor.ts`
- `.artifacts/opencode-dev/packages/opencode/src/cli/cmd/run/permission.shared.ts`

OpenCode behavior:

- Built-in registry order is:
  invalid, optional question, shell, read, glob, grep, edit, write, task,
  fetch, todo, search, skill, patch, optional lsp, optional plan.
- The model does not usually see both `apply_patch` and `edit`/`write`.
  OpenCode exposes `apply_patch` only for selected GPT models; otherwise it
  exposes `edit` and `write`.
- Task description is dynamically augmented with the filtered list of
  available non-primary agents and their descriptions.
- Permission filtering hides denied subagents from the Task description.
- Permission defaults allow most tools, ask for external directories, deny
  question/plan by default, and set `doom_loop: "ask"`.
- Subagents inherit parent/session denies and external-directory rules.
- Subagents are denied `todowrite` and `task` by default unless the subagent's
  own permission rules explicitly allow them.
- Doom-loop detection is implemented as a permission request after the same
  tool with identical input appears in the recent tool-part window.
- OpenCode's doom-loop UI says "Continue after repeated failures" and lets the
  operator decide whether to continue.

OpenClaw surfaces reviewed:

- `src/agents/pi-tools.ts`
- `src/agents/pi-tools.before-tool-call.ts`
- `src/agents/tool-loop-detection.ts`
- `src/agents/tools/native-task-tool.ts`
- `docs/agents/execution-coding/Tools.md`
- `docs/agents/execution-coding/runtime/TOOLS.md`

OpenClaw behavior:

- Execution-coding node parent filters tools to:
  `update_plan`, `read_todo`, `task`, `read`, `grep`, `glob`, `lsp`,
  `openclaw_resource_read`, `node_finish`, and mutation tools `edit` /
  `apply_patch`.
- Execution-coding node parent explicitly orders:
  `apply_patch`, `edit`, `write`, `node_finish`, `update_plan`, `read_todo`,
  `task`, `openclaw_resource_read`, `read`, `grep`, `glob`.
- `lsp` is allowed but is not present in that explicit priority map, so it falls
  through after the ordered tools.
- OpenClaw intentionally exposes both `apply_patch` and `edit` to Kimi in the
  latest proof lane.
- Native Task description includes the allowed child agent ids and matches the
  important OpenCode guidance: do not use Task for a specific file path,
  specific symbol/class lookup, or code search within one to three known files.
- OpenClaw has a configurable tool-loop detector with generic repeat,
  unknown-tool repeat, polling no-progress, ping-pong, and circuit-breaker
  classes.
- OpenClaw loop detection defaults to disabled unless config enables it.
- OpenClaw loop detection is exact-argument/result oriented. It does not
  understand overlapping source windows, broad-search non-answers, or
  "acquisition without mutation" as first-class loop classes.

Model-facing consequences:

- The latest proof proved mutation tools were visible, so this is not a
  read-only/plan-mode failure.
- OpenCode's mutation surface is narrower for most non-GPT models: `edit` and
  `write`, not `apply_patch` plus `edit`.
- OpenClaw's mutation-first order is helpful, but exposing both `apply_patch`
  and `edit` may still create decision friction for Kimi. This is lower
  priority than source/search parity because Kimi did eventually edit when
  source results were source-shaped.
- `lsp` being visible but last and absent from canonical tool docs makes it a
  weak affordance.
- OpenClaw's loop detector will not catch the main observed loop class:
  many legitimate-but-unhelpful acquisition calls with different args or
  overlapping ranges.

Parity recommendations:

- Keep explicit child identity and filtered allowed child ids in `task`; this
  already aligns with OpenCode.
- Either document/order `lsp` as a normal source-navigation tool or hide it.
- After source/search parity, run an experiment with one primary mutation
  surface for Kimi:
  either `edit` only, or `apply_patch` only, but not both.
- Do not rely on exact-repeat loop detection to solve acquisition loops.
  Source/search tool outputs should be valid and source-shaped first.
- If loop handling is needed later, add an OpenCode-like repeated-identical
  permission/decision surface only after the tool parity gaps are closed.
  Do not add it as another prompt gate before fixing grep/readback.

## Additional Surface Audit: Shell, Exec, And Validation Scout

Status: partial audit; enough to separate already-fixed validation docs from
remaining tool-runtime differences.

OpenCode surfaces reviewed:

- `.artifacts/opencode-dev/packages/opencode/src/tool/shell.ts`
- `.artifacts/opencode-dev/packages/opencode/src/tool/shell/prompt.ts`

OpenCode behavior:

- Shell tool id remains `bash` for compatibility, even when shell kind can vary.
- Shell command parsing uses tree-sitter for bash and PowerShell command
  structure.
- Shell permission metadata extracts command paths/patterns and external
  directory access from parsed command structure.
- Default timeout is two minutes unless runtime flags override it.
- The tool supports an optional timeout in milliseconds.
- Output is tailed to line/byte limits when too large.
- If output exceeds the configured line/byte limits, OpenCode writes the full
  output to a normal file and tells the agent:
  use `Read` with offset/limit to inspect sections or `Grep` to search the full
  content.
- Shell prompt explicitly says not to use shell-level truncation commands such
  as `head`, `tail`, pagination commands, or PowerShell `Select-Object` for
  limiting output because the full output is already captured to a file.
- Shell prompt encourages parallel shell calls in one model message when
  commands are independent, and a single chained command when commands must be
  sequential.

OpenClaw surfaces reviewed:

- `src/agents/bash-tools.exec.ts`
- `src/agents/bash-tools.descriptions.ts`
- `docs/agents/execution-validation-scout/runtime/TOOLS.md`
- `docs/agents/execution-validation-scout/runtime/BOOTSTRAP.md`
- `docs/agents/execution-validation-scout/Tools.md`

OpenClaw behavior:

- Parent execution-coding does not see exec; validation scout does.
- Validation scout canonical docs now include a repo-native command menu:
  `pnpm test:file <test-file>`,
  `pnpm test:file <test-file> -- -t <name>`,
  and named repo proof scripts.
- Validation scout docs explicitly forbid raw TypeScript flag archaeology and
  project-wide compiles as the first validation path.
- OpenClaw exec supports foreground/background continuation, process tool
  follow-up, approval analysis, safe-bin policy, host-env sanitization, and
  managed-output persistence.
- OpenClaw foreground exec preview cap is 50KB by characters, and if exceeded
  it persists full output as managed output.
- The model-visible exec truncation line says:
  `Full output saved to: <path>`
  and
  `Use Grep to search the full content or Read with offset/limit to view specific sections.`
- As with other managed outputs, the durable first-class identity may be an
  `openclaw-managed-output://...` ref instead of only a normal path.

Remaining differences:

- OpenCode exposes one shell tool with direct `bash` semantics. OpenClaw has
  `exec` plus `process`, background continuation, approvals, safe-bin policy,
  and managed-output plumbing. This is more capable but more complex.
- OpenCode shell guidance is explicit about output capture:
  do not use truncating shell commands because full output is saved and normal
  Read/Grep can inspect it. OpenClaw exec description is shorter and does not
  carry the same model-facing discipline.
- OpenCode's full-output path is normal-file first. OpenClaw's saved output is
  also path-backed, but model affordance still routes through managed-output
  refs in several places.
- Validation scout docs are now aligned with the intended repo-native command
  menu, so if a later proof repeats raw `tsc` archaeology, the next suspicion
  should be whether those docs were admitted into the child context or whether
  exec tool text overrode them.

Parity recommendations:

- Keep validation scout's repo-native command menu; this has already been
  corrected and should not be re-proposed as new work.
- Add OpenCode-style exec output wording to the validation scout's exec tool
  description:
  full output is captured by the tool; do not use shell truncation commands;
  use normal read/grep on the saved output path or managed ref.
- Prefer making the saved output path work with normal `read`/`grep` before
  asking validation scouts to use `openclaw_resource_read` directly.
- Do not simplify away OpenClaw's approval/safe-bin/background machinery for
  validation scouts; those are OpenClaw-native safety features. The parity
  target is model-facing output/readback behavior, not removing authority
  controls.

## Additional Surface Audit: Write, Formatter, And LSP Service

Status: audited enough to confirm OpenClaw's current LSP is useful but not
OpenCode parity.

OpenCode surfaces reviewed:

- `.artifacts/opencode-dev/packages/opencode/src/tool/write.ts`
- `.artifacts/opencode-dev/packages/opencode/src/tool/write.txt`
- `.artifacts/opencode-dev/packages/opencode/src/format/index.ts`
- `.artifacts/opencode-dev/packages/opencode/src/format/formatter.ts`
- `.artifacts/opencode-dev/packages/opencode/src/lsp/lsp.ts`
- `.artifacts/opencode-dev/packages/opencode/src/lsp/server.ts`
- `.artifacts/opencode-dev/packages/opencode/src/lsp/diagnostic.ts`

OpenCode behavior:

- `write` overwrites or creates files, but its description says to use Read
  first for existing files and to prefer editing existing files.
- `write` asks for `edit` permission with diff metadata before mutation.
- After write, OpenCode runs the formatter service for the file extension.
- After write, OpenCode touches LSP with document diagnostics and appends LSP
  errors for the changed file and a small number of other project files.
- The formatter service is generic and configurable.
- Built-in formatters include `gofmt`, `mix`, `prettier`, `oxfmt`, `biome`,
  `zig`, `clang-format`, `ktlint`, `ruff`, `uv`, `rubocop`, `standardrb`, and
  more language-specific formatters.
- OpenCode LSP is generic server lifecycle infrastructure:
  server registry, root detection, client lifecycle, broken-server tracking,
  in-flight spawn dedupe, diagnostics, document symbols, workspace symbols,
  definitions, references, implementations, hover, and call hierarchy.
- OpenCode LSP server registry includes TypeScript, Deno, Vue, ESLint, Oxlint,
  and additional language servers depending on the local repo/config and
  runtime flags.
- LSP diagnostics are formatted as:
  `<diagnostics file="...">`
  `ERROR [line:col] message`
  with at most 20 errors per file.
- Workspace symbol results are capped in the LSP service to high-signal symbol
  kinds and a small result count.

OpenClaw surfaces reviewed:

- `src/agents/openclaw-lsp-service.ts`
- `src/agents/tools/lsp-tool.ts`
- `src/agents/pi-tools.host-edit.ts`
- `src/agents/apply-patch.ts`
- `src/agents/pi-tools.ts`

OpenClaw behavior:

- Execution-coding parent currently does not expose `write`.
- Execution-coding parent exposes both `edit` and `apply_patch`.
- OpenClaw edit/apply_patch now include diff-oriented feedback and LSP
  diagnostics when LSP service is available.
- OpenClaw read warms LSP state.
- OpenClaw `lsp` tool supports OpenCode operation names:
  `documentSymbol`, `workspaceSymbol`, `goToDefinition`, `findReferences`,
  `hover`, `goToImplementation`, `prepareCallHierarchy`, `incomingCalls`,
  `outgoingCalls`.
- OpenClaw `lsp` tool renders model-facing coordinate text instead of raw JSON.
- OpenClaw LSP service is TypeScript/JavaScript only, implemented through the
  TypeScript compiler/language service APIs.
- OpenClaw LSP service scans a capped workspace file list and excludes
  `.artifacts`, `.git`, `.next`, `.openclaw`, `.turbo`, coverage, dist, and
  `node_modules`.
- OpenClaw `incomingCalls` and `outgoingCalls` are currently not real OpenCode
  parity if they are stubbed or service-limited.

Remaining differences:

- OpenCode's LSP layer is a real multi-language LSP client/server subsystem.
  OpenClaw's current LSP layer is a TypeScript-focused approximation.
- OpenCode's formatter layer is broad and configurable. OpenClaw edit/apply
  patch diagnostics are stronger than before, but the formatter parity surface
  is not established across languages.
- OpenCode exposes `write` for non-apply_patch models; OpenClaw execution parent
  intentionally does not expose `write`.
- OpenCode model registry usually avoids exposing both `apply_patch` and
  `edit`/`write` together. OpenClaw exposes both `apply_patch` and `edit`.
- OpenClaw `lsp` is technically visible but not in execution-coding canonical
  tool docs and not in the execution parent priority order.

Model-facing consequence:

- Kimi can use `lsp`, but the active docs and tool ordering do not make LSP a
  first-class navigation habit.
- If Kimi ignores LSP, it falls back to read/grep for structure and may walk
  large files manually.
- If LSP is exposed, it should be trustworthy and documented. A partially
  implemented call hierarchy can teach the model that LSP is unreliable.

Parity recommendations:

- Decide whether `lsp` is a first-class execution-coding tool.
- If yes:
  add it to execution-coding `Tools.md`, runtime `TOOLS.md`, and explicit tool
  ordering near read/grep/glob.
- Hide unsupported LSP operations until implemented, or port the OpenCode LSP
  service architecture more directly.
- Port OpenCode's generic LSP server registry/client lifecycle if real parity is
  required. At minimum, document that current OpenClaw LSP is TypeScript/JS
  only.
- Keep OpenClaw's source-coordinate text output if it helps models. This is a
  deliberate OpenClaw-native improvement over raw JSON, not a source-acquisition
  abstraction.
- Keep `write` absent from execution-coding parent unless a concrete proof shows
  Kimi needs it. For the current Work Queue proof, edit/apply_patch are enough.
- Revisit exposing both `apply_patch` and `edit` only after read/grep/lsp
  affordances are fixed.

## Additional Surface Audit: Skills, Instructions, And Prompt Assembly

Status: audited enough to confirm the current no-active-workflow-skill direction
is aligned with OpenCode.

OpenCode surfaces reviewed:

- `.artifacts/opencode-dev/packages/opencode/src/session/system.ts`
- `.artifacts/opencode-dev/packages/opencode/src/session/instruction.ts`
- `.artifacts/opencode-dev/packages/opencode/src/session/prompt.ts`
- `.artifacts/opencode-dev/packages/opencode/src/session/llm/request.ts`
- `.artifacts/opencode-dev/packages/opencode/src/session/prompt/kimi.txt`
- `.artifacts/opencode-dev/packages/opencode/src/tool/skill.ts`
- `.artifacts/opencode-dev/packages/opencode/src/skill/index.ts`

OpenCode behavior:

- Provider/model prompt selection is centralized in `system.ts`.
- If the model api id includes `kimi`, OpenCode selects `prompt/kimi.txt`.
- `prompt/kimi.txt` is a provider/model system prompt, not the user task prompt
  or the specific work-order prompt that starts a coding run.
- The final LLM request preparation joins these pieces into the system string:
  agent-specific prompt if configured, otherwise provider/model prompt such as
  `kimi.txt`;
  dynamic system blocks from the prompt loop;
  optional user-level system text.
- The dynamic system blocks from the prompt loop are:
  environment,
  instruction files,
  optional skill catalog,
  and structured-output directive when the user requested JSON schema output.
- The environment block includes the exact model id, provider/model id, working
  directory, workspace root, git repo yes/no, platform, and current date.
- Instruction blocks are rendered as `Instructions from: <path-or-url>` followed
  by the instruction content.
- OpenCode's Kimi prompt is action-oriented:
  use tools, make actual file changes, parallelize independent tool calls, and
  use `write`/`edit` for modifications.
- Project/user instructions are loaded from `AGENTS.md`, optionally
  `CLAUDE.md`, deprecated `CONTEXT.md`, and configured instruction paths/URLs.
- Project instruction discovery picks the first project-level instruction file
  family found while walking upward, rather than stacking every possible
  workflow document.
- Read tool completions can cause nearby instruction files to be attached once
  per assistant message when relevant.
- Skills are discovered from global/project/configured skill roots.
- The system prompt lists available skills by name, description, and location
  when the `skill` permission is not denied.
- Full skill body is not loaded into baseline context. It is loaded only when
  the model calls the `skill` tool.
- OpenCode ships one built-in skill, `customize-opencode`, for editing
  OpenCode's own configuration. It is not a general coding workflow skill.
- `skill` tool output includes the full SKILL.md content, a base directory, and
  a sampled file list.
- Mid-run user messages that arrive after the last finished assistant message
  are rewritten into message text wrapped in `<system-reminder>`:
  the user sent the following message;
  please address it and continue with your tasks.
  This is message-side runtime steering, not part of the baseline system array.
- At the final configured step, OpenCode appends the `MAX_STEPS` text as an
  assistant message, not as a new system block.
- Prompt file attachments can be resolved into synthetic Read-tool context.
  When a file URI carries a line range, OpenCode maps it to read offset/limit.
  When a single source location is supplied, OpenCode can ask LSP for the
  containing symbol range and insert that read output.

OpenClaw surfaces reviewed:

- `src/agents/skills/workspace.ts`
- `.agents/registry.yaml`
- `docs/agents/registry.yaml`
- `docs/agents/execution-coding/runtime/BOOTSTRAP.md`
- `docs/agents/execution-coding/runtime/AGENTS.md`
- `docs/agents/execution-coding/runtime/IDENTITY.md`
- `docs/agents/execution-coding/runtime/TOOLS.md`
- `docs/agents/execution-coding/Tools.md`

OpenClaw behavior:

- `execution-coding`, `execution-context-scout`, and
  `execution-validation-scout` currently have `primarySkills: []` in the
  machine registry surfaces.
- OpenClaw's node prompt / proof prompt is the task work order. It is not the
  right parity target for OpenCode's `prompt/kimi.txt`.
- OpenClaw's closer parity surfaces for `prompt/kimi.txt` are:
  `buildAgentSystemPrompt` / `buildEmbeddedSystemPrompt`, provider-specific
  system prompt contributions, and the canonical execution-coding runtime docs.
- Execution-coding now relies on native runtime docs:
  `IDENTITY.md`, `BOOTSTRAP.md`, `AGENTS.md`, and `TOOLS.md`.
- Those runtime docs define the edit-first goal, bounded navigation, scout
  boundaries, validation repair behavior, todo behavior, and node_finish.
- OpenClaw's skills workspace is more elaborate than OpenCode's: bundled skills,
  managed skills, source filters, limits, path containment, symlink escape
  handling, active-required byte budgets, and prompt serialization.

Remaining differences:

- OpenCode has a short generic Kimi base prompt plus ordinary project
  instructions and tool descriptions.
- OpenClaw execution-coding has role-specific runtime docs that still include
  more workflow authority than OpenCode's base coding loop.
- Comparing OpenCode `kimi.txt` to a generated node proof prompt would be a
  category error. The node prompt should stay task/objective/scope focused;
  Kimi parity belongs in agent/system prompt surfaces and canonical agent docs.
- That extra workflow language may be justified by node lifecycle requirements,
  but it is still a possible source of exploration/todo inertia if it grows.
- OpenClaw's skill system is more powerful and more failure-prone than
  OpenCode's for this lane. The current `primarySkills: []` setting is correct
  for execution-coding until a concrete need appears.

Parity recommendations:

- Keep execution-coding and scouts off always-active workflow skills.
- Keep role docs short and specialized:
  identity = who owns the edit,
  bootstrap = launch contract and finish contract,
  tools = concise tool use,
  agents = child-agent boundary.
- Do not reintroduce `execution-node-workflow` as a required active skill.
- If OpenClaw needs a skill later, make it on-demand like OpenCode:
  named, description-triggered, loaded only through a skill tool, and not part
  of baseline context.
- Keep comparing OpenClaw's Kimi-facing base prompt against OpenCode's
  `kimi.txt`, but copy only short action/tool-use commitments. Do not copy the
  entire OpenCode prompt if it conflicts with node lifecycle requirements.
- Do not use the node prompt artifact as the edit surface for `kimi.txt`
  parity, except for task-specific objective wording. Use execution-coding
  canonical runtime docs and OpenClaw system prompt assembly instead.

## Additional Surface Audit: Truncation, Managed Output, And Compaction Readback

Status: deeper audit recorded; this remains one of the highest-risk surfaces
for "the agent thinks it does not have context."

OpenCode surfaces reviewed:

- `.artifacts/opencode-dev/packages/opencode/src/tool/truncate.ts`
- `.artifacts/opencode-dev/packages/opencode/src/session/overflow.ts`
- `.artifacts/opencode-dev/packages/opencode/src/session/compaction.ts`

OpenClaw surfaces reviewed:

- `src/agents/pi-embedded-runner/tool-result-truncation.ts`
- `src/agents/pi-embedded-runner/compact.ts`
- `src/agents/pi-embedded-runner/run.ts`
- `src/config/sessions/managed-output.ts`
- `src/agents/tools/openclaw-resource-read-tool.ts`

OpenCode behavior:

- Tool output truncation default is 2,000 lines and 50KB.
- Oversized output is written to a normal file under the truncation directory.
- Model-visible hint names that normal file path.
- If Task is available, the hint says to delegate exploration of that saved
  output to the explore agent using Grep and Read, and not to read the full file
  directly.
- If Task is unavailable, the hint says to use Grep or Read with offset/limit
  on the saved file.
- Compaction overflow uses a usable-context threshold.
- Compaction preserves a recent tail and summarizes older context.
- Tool output sent into the compaction prompt is capped at 2,000 characters.
- Old completed tool output can be pruned.
- Auto-continue after compaction is generic unless plugin hooks override it.

OpenClaw behavior:

- Tool output projection uses the same 2,000-line and 50KB class of limit.
- Oversized output is persisted under `stateRoot/managed-tool-output/...` with
  metadata, hash, output path, and `openclaw-managed-output://...` ref.
- Model-visible hints usually include the saved output path and say to use Grep
  or Read with offset/limit.
- `openclaw_resource_read` can hydrate managed-output refs by line windows and
  renders that line readback as source-shaped:
  `<path>`, `<type>file</type>`, line-numbered `<content>`, continuation.
- `openclaw_resource_read` can grep managed-output refs, but visible search
  formatting only shows matching lines; before/after context is captured in
  details, not rendered in the main text.
- Compaction routes through embedded runner state, context engine, hooks,
  checkpoint capture, managed-output projection, replay sanitization, and
  overflow retry logic.
- Old result content may be replaced by
  `[Old tool result content cleared]`.
- Node worker compaction continuation can inject a custom edit/validate-next
  message.

Remaining differences:

- OpenCode's saved-output affordance is ordinary:
  normal path plus normal Read/Grep.
- OpenClaw's saved-output affordance is partly special:
  normal-looking path plus managed-output ref plus `openclaw_resource_read`.
- OpenCode does not require the model to reason about durable output metadata,
  record ids, refs, hashes, or working-context resource types.
- OpenClaw's special ref surface is operationally useful but still a model
  affordance gap when the model needs normal source/search behavior.
- OpenClaw old-result clearing can remove exact source windows from replay and
  replace them with marker text. That can make Kimi restart acquisition after
  compaction.

Model-facing consequence:

- If the model sees a saved output path but normal `read`/`grep` cannot inspect
  it exactly like OpenCode, the hint is misleading.
- If the model sees `openclaw-managed-output://...`, it must choose a special
  tool and special params instead of using ordinary source navigation.
- If old source windows are replaced by markers, compaction can erase the very
  source evidence needed for repair unless the continuation pack rehydrates
  exact changed/error windows.

Parity recommendations:

- Make normal `read` and `grep` work on saved managed-output paths exactly as
  the hint says.
- Keep `openclaw-managed-output://...` as internal durable identity, but do not
  make it the only natural model path.
- Render managed-output grep context lines in the visible text when requested.
- Avoid old-result markers for source/tool results that are still needed for
  active edit or repair decisions. If they must be pruned, rehydrate exact
  source/error windows into the continuation.
- Keep OpenClaw compaction checkpoints and managed-output metadata internally.
  The model-facing readback should be ordinary source/search text and ordinary
  saved output paths.

## Additional Surface Audit: Session Replay, Approval, Plan Mode, And Todo

Status: audited enough to identify remaining behavioral differences that can
make OpenClaw feel more workflow-heavy than OpenCode.

OpenCode surfaces reviewed:

- `.artifacts/opencode-dev/packages/opencode/src/agent/agent.ts`
- `.artifacts/opencode-dev/packages/opencode/src/agent/subagent-permissions.ts`
- `.artifacts/opencode-dev/packages/opencode/src/session/prompt/plan-mode.txt`
- `.artifacts/opencode-dev/packages/opencode/src/session/prompt/build-switch.txt`
- `.artifacts/opencode-dev/packages/opencode/src/session/prompt/plan-reminder-anthropic.txt`
- `.artifacts/opencode-dev/packages/opencode/src/session/prompt/max-steps.txt`
- `.artifacts/opencode-dev/packages/opencode/src/tool/todo.ts`
- `.artifacts/opencode-dev/packages/opencode/src/tool/todowrite.txt`

OpenCode behavior:

- OpenCode has separate native primary agents for build and plan.
- `build` is the default primary agent and executes tools according to
  permissions.
- `plan` is explicitly read-only except for the plan file, with edit denied
  everywhere else.
- Plan-mode workflow text is injected only when plan mode is active.
- When switching from plan to build, OpenCode sends a short
  `<system-reminder>`:
  operational mode changed from plan to build;
  no longer read-only;
  permitted to make file changes, run shell commands, and use tools.
- The explore subagent is read/search oriented and denies most tools.
- Subagents inherit parent edit denies, parent session denies, and external
  directory rules.
- Subagents are denied `todowrite` and `task` by default unless their own
  permission rules explicitly allow them.
- `todowrite` is a thin progress board:
  it asks permission,
  writes the submitted list,
  returns a title like `N todos`,
  returns JSON output,
  and stores metadata.
- OpenCode TodoWrite has statuses `pending`, `in_progress`, `completed`, and
  `cancelled`.
- TodoWrite says to use todo for conceptual work, not for "3 tool calls for a
  single conceptual step."
- TodoWrite can be skipped when tracking adds no organizational value.
- Max-steps handling disables tools and asks for a text-only summary of work
  done, remaining tasks, and recommendations.

OpenClaw surfaces reviewed:

- `src/agents/tools/update-plan-tool.ts`
- `src/agents/tool-description-presets.ts`
- `docs/agents/execution-coding/runtime/BOOTSTRAP.md`
- `docs/agents/execution-coding/runtime/AGENTS.md`
- `docs/agents/execution-coding/runtime/TOOLS.md`
- `docs/agents/execution-coding/Tools.md`
- `src/agents/session-runtime/run-child.ts`
- `src/agents/session-runtime/run-child-task-adapter.ts`

OpenClaw behavior:

- Execution-coding is a node-bound implementation agent rather than a generic
  build primary agent.
- OpenClaw currently keeps plan/todo semantics in runtime docs, not in a
  separate plan-mode system reminder.
- `update_plan` is now lightweight:
  description says todo is status only, not a workflow gate;
  output is plain JSON item list;
  there is no top-level `inProgress:` echo.
- `update_plan` supports statuses `pending`, `in_progress`, and `completed`;
  it does not expose `cancelled`.
- `update_plan` has optional priority `low`, `normal`, `high`.
- Execution-coding runtime docs still say to use `update_plan` early for
  non-trivial node work and keep exactly one item in progress.
- Execution-coding runtime docs include a commitment rule, test-after-edit rule,
  repair-mode rule, scout boundary, and node_finish finish contract.
- Context and validation scouts are instructed not to mutate parent todo.
- Native task child prompt prepends `[Subagent Context]` and `[Subagent Task]`.
- Native task projection can still produce parent-visible partial/timeout text
  around child output when child progress times out.

Remaining differences:

- OpenCode isolates heavy planning workflow behind explicit plan mode and then
  sends a build-switch reminder that file changes are permitted.
- OpenClaw node workers always start in an execution lane, so any planning or
  exploration language in baseline runtime docs is more likely to bias the
  model away from mutation.
- OpenCode TodoWrite itself is generic; OpenClaw todo guidance is partially
  node-specific through execution-coding docs.
- OpenCode todo allows `cancelled`; OpenClaw update_plan does not. This is not
  necessarily blocking, but it means stale subtasks must be rewritten or marked
  completed/pending rather than cancelled.
- OpenCode subagents are automatically denied todo/task unless explicitly
  allowed. OpenClaw docs and policy say scouts should not mutate todo, but this
  should remain a catalog/permission proof item, not just documentation.
- OpenCode's max-step stop is a clean text-only handoff. OpenClaw's node proof
  failures can pass through node lifecycle states such as needs_review and
  node_finish_not_called, which are richer but also more moving parts.

Model-facing consequence:

- If OpenClaw runtime docs reintroduce "inspect/read/search before edit" language,
  there is no later build-switch reminder to cancel that bias. The worker is
  already in build mode.
- Todo should remain status, not authority. The current tool result shape is now
  close to OpenCode, but baseline docs must stay lean or they can recreate a
  todo-driven reading phase.
- Scout no-todo/no-task policy should be enforced through the actual child tool
  catalog so child sessions cannot accidentally create competing progress state.

Parity recommendations:

- Keep `update_plan` result JSON-only and non-authoritative.
- Keep node prompt task/objective focused; do not put plan-mode-like workflow
  phases in it.
- Keep execution-coding runtime docs short enough that the first durable rule is
  "this is an implementation worker; produce accepted edits."
- Add or keep a proof optic that child scout tool catalogs do not include
  `update_plan`, `read_todo`, `task`, or mutation tools.
- Consider adding `cancelled` only if Kimi needs a clean way to retire stale
  todos without rewriting the whole board. Do not add it just for schema parity.
- Do not copy OpenCode's plan-mode text into node workers. It belongs only in an
  explicit OpenClaw planning mode, not in execution-coding.

## Additional Surface Audit: Fresh Tool-Description Recheck

Status: rechecked after the earlier parity edits; several tool-facing gaps are
still current.

OpenCode model-facing tool text rechecked:

- `.artifacts/opencode-dev/packages/opencode/src/tool/read.txt`
- `.artifacts/opencode-dev/packages/opencode/src/tool/grep.txt`
- `.artifacts/opencode-dev/packages/opencode/src/tool/glob.txt`
- `.artifacts/opencode-dev/packages/opencode/src/tool/edit.txt`
- `.artifacts/opencode-dev/packages/opencode/src/tool/write.txt`
- `.artifacts/opencode-dev/packages/opencode/src/tool/task.txt`
- `.artifacts/opencode-dev/packages/opencode/src/tool/lsp.txt`
- `.artifacts/opencode-dev/packages/opencode/src/tool/todowrite.txt`

OpenClaw model-facing tool text rechecked:

- `src/agents/pi-tools.read.ts`
- `src/agents/tools/repo-discovery-tools.ts`
- `src/agents/tools/lsp-tool.ts`
- `src/agents/pi-tools.host-edit.ts`
- `src/agents/tools/native-task-tool.ts`
- `src/agents/tools/openclaw-resource-read-tool.ts`
- `src/agents/pi-tools.ts`
- `docs/agents/execution-coding/runtime/TOOLS.md`
- `docs/agents/execution-coding/Tools.md`

Current confirmed gaps:

- OpenCode `read.txt` says read returns up to 2,000 lines from the start by
  default, offset is 1-indexed, use grep for specific content, use glob for
  filenames, line numbers prefix each line, long lines truncate, parallel reads
  are recommended, and avoid tiny repeated slices.
- OpenClaw `read` now says successful bounded reads return line-numbered source,
  documents `offset`, and no longer advertises repeated path-only correction.
  Continuation output includes an exact next call shape in addition to
  `Use offset=N`.
- OpenCode `grep.txt` is regex-native, file-pattern scoped, returns file paths
  and line numbers, and says open-ended multi-round search belongs in Task.
- OpenClaw `grep` text is close, but internals still use bounded workspace file
  walking before search. The text can look OpenCode-like while behavior still
  differs.
- OpenCode `glob.txt` says any-codebase-size glob matching and encourages
  speculative parallel searches.
- OpenClaw `glob` text is concise, but internals still use `walkFiles` with
  preselection and hidden-count guidance.
- OpenCode `lsp.txt` is ordinary and direct: supported operations, required
  file/line/character params, workspaceSymbol query, server unavailable error.
- OpenClaw `lsp` tool text is actually stronger for symbol navigation and says
  results are source coordinates. However, execution-coding canonical tool docs
  still omit `lsp`, and explicit execution-parent tool order still has no `lsp`
  priority entry.
- OpenCode `edit.txt` is simple exact-replacement guidance: read first, match
  content after line-number prefix, prefer editing existing files, exact failure
  modes, replaceAll for all occurrences.
- OpenClaw `edit` is more forceful and more complex:
  primary implementation mutation tool,
  edit as soon as target file/symbol/patch shape are visible,
  keep oldText surgical,
  avoid unrelated declarations,
  and use apply_patch for multi-hunk or structural rewrites.
  This is intentional but more model-facing policy than OpenCode.
- OpenCode usually exposes `write` with read-first and avoid-new-docs guidance.
  OpenClaw execution-coding parent does not expose `write`; it exposes `edit`
  and `apply_patch`.
- OpenCode `task.txt` says not to use Task for specific paths/classes or
  one-to-three-file code search, and to provide complete child context.
- OpenClaw `task` now matches this direction and includes allowed child agents,
  validation-scout command guidance, and parent-owned node_finish. It is more
  OpenClaw-specific, but the core misuse prevention matches OpenCode.
- OpenCode TodoWrite is generic. OpenClaw `update_plan` tool text is now generic
  and lightweight, but execution-coding runtime docs still carry node-specific
  todo discipline.
- OpenClaw still has execution-role read/grep reminder wrappers for scouts:
  context scout read/grep results get reminder text about search-first,
  mechanical handoff headings, and no top-of-file walking. Execution-coding
  parent reminders are disabled in native task parent mode.

Model-facing consequence:

- The previous non-OpenCode read behavior advertised directly in the tool
  description has been removed. Repeated path-only reads return source-shaped
  output, and continuation hints now include the exact next `read({...})` call.
- `lsp` is available but not canonically blessed in the execution-coding docs, so
  Kimi has little reason to prefer it over read/grep for large-file structure.
- Tool text alone is no longer the largest gap for grep/glob; internals still
  decide whether broad search reaches the target file.
- OpenClaw edit guidance is intentionally more assertive than OpenCode. Keep it
  only if it improves edit-start behavior after read/search parity is fixed.

Parity recommendations:

- Completed: remove the repeated path-only correction sentence and behavior from
  `read`. Return the OpenCode-style bounded source window every time, with exact
  next-call continuation guidance.
- Replace grep/glob internals before spending more time on grep/glob wording.
- Either promote `lsp` fully:
  add it to execution-coding canonical tool docs and explicit provider ordering;
  or hide it until the worker should rely on it.
- Keep `task` text as-is for now; it is one of the closer OpenCode-aligned
  surfaces.
- Keep `update_plan` result lightweight; audit only the surrounding
  execution-coding docs if todo again becomes phase-like.
- Revisit whether Kimi should see both `edit` and `apply_patch` only after the
  source/search readback issues are closed.

## Additional Surface Audit: Completeness Pass Across OpenCode Text And Runtime Surfaces

Status: audited for unaccounted model-facing surfaces. Most major surfaces are
now represented in this spec.

OpenCode text surfaces enumerated:

- Agent prompts:
  `agent/prompt/compaction.txt`,
  `agent/prompt/explore.txt`,
  `agent/prompt/summary.txt`,
  `agent/prompt/title.txt`.
- Agent generator prompt:
  `agent/generate.txt`.
- Session provider/base prompts:
  `session/prompt/anthropic.txt`,
  `session/prompt/beast.txt`,
  `session/prompt/codex.txt`,
  `session/prompt/copilot-gpt-5.txt`,
  `session/prompt/default.txt`,
  `session/prompt/gemini.txt`,
  `session/prompt/gpt.txt`,
  `session/prompt/kimi.txt`,
  `session/prompt/trinity.txt`.
- Session reminders:
  `session/prompt/build-switch.txt`,
  `session/prompt/max-steps.txt`,
  `session/prompt/plan-mode.txt`,
  `session/prompt/plan-reminder-anthropic.txt`,
  `session/prompt/plan.txt`.
- Tool descriptions:
  `tool/apply_patch.txt`,
  `tool/edit.txt`,
  `tool/glob.txt`,
  `tool/grep.txt`,
  `tool/lsp.txt`,
  `tool/plan-enter.txt`,
  `tool/plan-exit.txt`,
  `tool/question.txt`,
  `tool/read.txt`,
  `tool/shell/shell.txt`,
  `tool/skill.txt`,
  `tool/task.txt`,
  `tool/todowrite.txt`,
  `tool/webfetch.txt`,
  `tool/websearch.txt`,
  `tool/write.txt`.
- Command templates:
  `command/template/initialize.txt`,
  `command/template/review.txt`.

Surfaces relevant to the execution-coding Kimi proof:

- `session/prompt/kimi.txt` is relevant.
- Dynamic environment/instruction/skill system blocks are relevant.
- `read`, `grep`, `glob`, `edit`, `task`, `todo`, `lsp`, and truncation/
  compaction surfaces are relevant.
- `agent/prompt/explore.txt` is relevant by analogy to
  `execution-context-scout`.
- `agent/prompt/compaction.txt` is relevant by analogy to OpenClaw compaction.
- `plan-mode`, `plan-reminder`, `plan-enter`, `plan-exit`, and `question` are
  not normal execution-coding surfaces unless OpenClaw introduces an explicit
  planning lane.
- `shell`, `webfetch`, and `websearch` are not parent execution-coding surfaces
  for this proof, but shell is relevant to validation scout parity.
- `write` is not currently Kimi-visible in OpenClaw execution-coding, but remains
  relevant if we later choose OpenCode's `edit`/`write` pair instead of
  `edit`/`apply_patch`.

Additional OpenCode runtime behavior found:

- The AI SDK path uses `experimental_repairToolCall`.
- If a failed tool call has a lowercased name that matches a prepared tool,
  OpenCode rewrites the tool name to that lowercased name.
- Otherwise OpenCode routes the malformed call to the `invalid` tool with a JSON
  payload containing the original tool name and error message.
- The prompt loop explicitly keeps running when a provider returns a non-tool
  finish reason but the assistant message contains real tool parts.
- Permission/question rejection marks the processor blocked depending on
  `continue_loop_on_deny`.

OpenClaw counterpart notes:

- OpenClaw has its own tool-call name normalization and replay repair logic in
  `run/attempt.tool-call-normalization.ts` and `session-transcript-repair.ts`.
- OpenClaw has redacted provider-turn optics that record missing tool-result ids
  and visible tool lists.
- OpenClaw does not expose an OpenCode-style `invalid` tool in the execution
  parent catalog; malformed tool calls are handled through normalization,
  unknown-tool handling, or provider/runtime errors.
- OpenClaw has no explicit plan/build primary-agent split for node workers.
  Execution-coding is always the build/implementation lane.

Remaining completeness gaps:

- Raw provider response parsing has not been fully audited down to every
  OpenRouter/Moonshot/Kimi chunk shape. The code seams are mapped, but a redacted
  live response-normalization trace is still the proof.
- OpenCode command templates and agent generator prompts are not used in normal
  coding runs; they are lower relevance and do not need OpenClaw parity for the
  current proof.
- OpenCode web tools are not parent execution-coding tools; they can be deferred.
- Shell/exec parity is mostly a validation-scout concern and should stay
  separate from parent source-navigation parity.

Parity recommendations:

- Keep the audit focused on surfaces that actually enter execution-coding or its
  scouts.
- Add a malformed-tool-call proof item:
  Kimi tool names with extra spaces/case differences should either normalize to a
  valid tool or return a concise model-visible correction, not silently loop.
- Add a stop-reason proof item:
  if normalized stop reason is `toolUse`, there must be new tool calls; if
  provider finish is `stop` with tool calls, the loop must continue.
- Do not copy OpenCode plan-mode or question surfaces into node workers.
- Treat OpenCode `explore.txt` as the scout parity target, not as parent Kimi
  workflow text.

## Additional Surface Audit: Tool Wrapper, Replay, And Compaction Path

Status: recorded immediately after fresh code reads of the local OpenCode repo
and OpenClaw counterparts.

OpenCode common tool wrapper behavior:

- OpenCode applies generic truncation in the common `Tool.define` wrapper in
  `.artifacts/opencode-dev/packages/opencode/src/tool/tool.ts`.
- Each tool returns ordinary `{ title, metadata, output }`.
- If the tool result metadata does not already declare truncation, the wrapper
  runs `truncate.output(result.output, {}, agent)`.
- The truncation wrapper writes oversized output to a normal filesystem path and
  changes only the model-visible output plus metadata:
  `metadata.truncated` and, when truncated, `metadata.outputPath`.
- This means every ordinary tool gets the same saved-file affordance by default
  instead of having per-tool bespoke truncation behavior.

OpenCode truncation model-facing behavior:

- Default limits are `MAX_LINES = 2000` and `MAX_BYTES = 50 * 1024`.
- Output is returned unchanged if it fits.
- If it does not fit, OpenCode keeps a head or tail preview, writes the full
  output to a normal file under the tool-output directory, and tells the model:
  `The tool call succeeded but the output was truncated. Full output saved to:
<file>`.
- If the agent has Task permission, the hint says to use the Task tool to have
  the explore agent process that saved file with Grep and Read, and not to read
  the full file itself.
- If the agent does not have Task permission, the hint says to use Grep to
  search the full content or Read with offset/limit to view specific sections.
- The important parity point is not the exact wording. It is that the saved
  output is a normal readable/searchable path and the model does not need to
  reason about a special durable-output protocol first.

OpenCode tool registry behavior:

- Built-in registry constructs tools in this order:
  `invalid`, optional `question`, `shell`, `read`, `glob`, `grep`, `edit`,
  `write`, `task`, `webfetch`, `todo`, `websearch`, `skill`, `apply_patch`,
  optional `lsp`, optional `plan`.
- `ToolRegistry.tools` filters model-specific mutation surfaces:
  GPT-style models use `apply_patch`; other models use `edit` and `write`.
- OpenCode does not normally expose `edit`, `write`, and `apply_patch` all as
  equally attractive mutation paths for every model.
- Task description is dynamically extended with the permission-filtered list of
  available subagents.
- Plugins may transform tool definitions before provider request.
- The AI SDK request path later sorts final tools alphabetically before sending
  them to the provider, so registry order and provider-visible order are not the
  same thing.

OpenCode malformed tool-call handling:

- OpenCode has an `invalid` tool in the registry, but it is hidden from active
  tools in the AI SDK request.
- The AI SDK path uses `experimental_repairToolCall`.
- If a failed tool call lowercases to a valid prepared tool name, OpenCode
  rewrites the call to that lowercase tool name.
- Otherwise OpenCode rewrites the failed call to the `invalid` tool with JSON
  input containing the original tool name and error message.
- The `invalid` tool returns concise model-visible text:
  `The arguments provided to the tool are invalid: <error>`.
- OpenClaw has name normalization and transcript repair, but the current audit
  has not proven the same model-visible correction path for malformed Kimi tool
  calls with extra spaces, case drift, or schema-mismatched arguments.

OpenCode session tool execution path:

- `SessionTools.resolve` builds AI SDK tools from the filtered registry.
- Tool execution records metadata and triggers plugin hooks before and after
  execution.
- Tool outputs are completed through the session processor using the original
  `toolCallId`.
- MCP/resource outputs are flattened into text and attachments, then passed
  through the same generic truncation service.
- This keeps model-visible tool result semantics uniform:
  normal output when small, normal saved-output path when large.

OpenCode provider-message replay behavior:

- `MessageV2.toModelMessagesEffect` converts session parts into AI SDK model
  messages.
- Completed tool parts become `tool-<name>` parts with:
  original `toolCallId`,
  original input,
  output,
  attachments when supported,
  and provider metadata when same-model replay allows it.
- Pending or running tool calls are replayed as interrupted tool errors instead
  of leaving dangling tool-use blocks.
- Compacted old tool results become `[Old tool result content cleared]`.
- Tool output sent into compaction can be capped with
  `[Tool output truncated for compaction: omitted <n> chars]`.
- The important parity point is that normal un-compacted tool output is replayed
  as the original tool output. It is not replaced by cache/coverage/ledger
  metadata.

OpenCode compaction behavior:

- OpenCode compaction is generic, not node-worker-specific.
- It selects older conversation head plus a recent tail budget.
- The compaction model receives model messages produced through the same message
  conversion path, with tool output capped at 2,000 characters for compaction.
- The compaction prompt asks for an anchored summary with exact paths,
  commands, errors, identifiers, next steps, and relevant files.
- If auto-compaction succeeds and auto-continue is enabled, the continuation
  user message says:
  `Continue if you have next steps, or stop and ask for clarification if you are
unsure how to proceed.`
- On overflow replay, OpenCode can replay the prior user message after
  compaction.
- OpenCode does not insert node-specific edit/validate instructions through
  compaction unless a plugin overrides the generic hook.

OpenClaw counterpart behavior:

- OpenClaw has `projectToolOutput` with the same headline limits:
  2,000 lines and 50KB.
- OpenClaw persists oversized output under `stateRoot/managed-tool-output` with
  a normal `outputPath`, metadata, hash, and an
  `openclaw-managed-output://...` ref.
- OpenClaw model-visible truncation text includes:
  `Full output saved to: <path>`
  and says to use Grep or Read with offset/limit.
- OpenClaw also exposes `openclaw_resource_read` for exact managed-output and
  working-context refs.
- `openclaw_resource_read` can line-read managed output and render
  source-shaped text with `<path>`, `<type>file</type>`, line-numbered
  `<content>`, total lines, and continuation.
- `openclaw_resource_read` can grep managed-output refs.
- OpenClaw has richer replay and compaction machinery:
  replay-history sanitization,
  transcript pair repair,
  managed-output projection,
  old tool-result clearing,
  mutation tool-call input compaction,
  preemptive compaction checkpoints,
  node-worker continuation packs,
  and provider-specific history transforms.
- Those mechanisms are more capable, but they create more places where
  source-shaped context can become marker-shaped, ref-shaped, or
  ledger-shaped.

Remaining parity gaps from this pass:

- Normal `read` and `grep` over the saved managed-output path must be proven.
  If the model sees `Full output saved to: <path>`, that path should behave like
  an ordinary OpenCode saved-output file through normal source/search tools.
- `openclaw_resource_read` is useful as an exact-ref escape hatch, but it should
  not be the only reliable way to inspect saved tool output.
- Old tool-result markers should not replace source/error windows needed for
  active editing or repair unless the continuation also rehydrates those exact
  windows as normal source-shaped text.
- Mutation tool-call input compaction is good for context budgets, but it should
  not hide the diff shape from the agent before validation/repair is complete.
- OpenClaw should add a proof item for malformed Kimi tool calls:
  extra-space names, case drift, and invalid schemas should normalize or return
  a concise model-visible correction.
- OpenClaw should add a proof item for stop-reason consistency:
  a provider `stop` with real tool calls must continue, and a normalized
  `toolUse`/tool-call finish must have new tool calls.
- OpenClaw should treat the common wrapper model as the target:
  ordinary tool output first, generic truncation second, normal saved path
  readback third, durable refs as internal support rather than model-facing
  primary workflow.

Recommended reconciliation:

- Keep OpenClaw's managed-output refs and checkpoints internally.
- Make the model-facing path match OpenCode:
  ordinary source/search output when small;
  ordinary saved file path when large;
  normal `read`/`grep` work on that path;
  no required metadata/ledger/ref reasoning for basic readback.
- Prefer one common truncation/readback wrapper for all tools rather than
  per-tool special cases.
- Audit each existing tool for whether it bypasses the common truncation path or
  returns JSON/metadata when it should return source/search text.
- Preserve OpenClaw node-specific continuation only when it adds essential
  execution state, and keep that continuation source-shaped around changed
  files, failing diagnostics, and repair windows.

## Sequential Audit Item 1: Raw Kimi/OpenRouter Response Normalization

Status: audited code seams; not fully proven by a live raw-normalization receipt.

Scope:

- OpenCode raw-provider response normalization and tool-call event processing.
- OpenClaw Kimi/OpenRouter request diagnostics, stream wrappers, normalized
  provider-turn optics, and Pi agent-loop tool-call execution.
- Whether a Kimi/OpenRouter stream can be proven to preserve structured tool
  calls, stop reasons, and tool-call IDs from raw provider response through the
  normalized assistant message and tool-result append path.

OpenCode behavior from local source:

- OpenCode's AI SDK adapter is a single, auditable stream-normalization path.
  `.artifacts/opencode-dev/packages/opencode/src/session/llm/ai-sdk.ts`
  consumes AI SDK `fullStream` events and emits OpenCode LLM events.
- `finishReason(value)` accepts only known finish reasons and otherwise maps to
  `unknown`.
- `finish-step` and `finish` events become `LLMEvent.stepFinish` and
  `LLMEvent.finish` with the normalized finish reason.
- `tool-call` events preserve `toolCallId`, `toolName`, and parsed input.
- `tool-input-start`, `tool-input-delta`, and `tool-input-end` preserve the
  tool-call ID and track the associated tool name.
- `tool-result` events use the same `toolCallId` and the remembered tool name.
- `tool-error` events use the same `toolCallId` and the remembered tool name.
- `.artifacts/opencode-dev/packages/opencode/src/session/llm.ts` configures
  `experimental_repairToolCall`:
  - lowercased tool names are repaired when a lowercased name exists;
  - otherwise the call is routed to an `invalid` tool with the original tool
    name and repair error.
- `.artifacts/opencode-dev/packages/opencode/src/session/processor.ts` consumes
  the normalized LLM events, appends tool parts/results/errors, marks lingering
  tool calls aborted during cleanup, and records the finish reason on the
  assistant message.

OpenClaw behavior from local source:

- `src/agents/pi-embedded-runner/run/attempt.ts` records redacted provider
  request diagnostics before the provider call. The diagnostics include model,
  provider, reasoning, `reasoning_effort`, `include_reasoning`,
  `parallel_tool_calls`, `tool_choice`, `max_tokens`, `temperature`, `top_p`,
  stream state, and tool catalog counts. It explicitly records that raw prompts,
  raw provider responses, raw provider logs, and raw tool logs are not stored.
- `src/agents/pi-embedded-runner/run/attempt.ts` also records post-normalization
  provider-turn optics:
  - provider-visible tool names;
  - mutating tools;
  - whether apply_patch is visible;
  - assistant stop reasons;
  - whether each assistant turn has new tool calls;
  - tool-call IDs;
  - matching tool-result IDs;
  - missing tool-result IDs;
  - parallel tool-call turns;
  - serial acquisition turns.
- `src/agents/pi-embedded-runner/proxy-stream-wrappers.ts` patches
  OpenRouter/Kimi request payloads, including reasoning fields. This is a
  request-side wrapper, not a response-normalization proof.
- `src/agents/pi-embedded-runner/moonshot-thinking-stream-wrappers.ts` patches
  Moonshot thinking payloads and tool-choice compatibility. This is also a
  request-side wrapper, not a response-normalization proof.
- `src/agents/pi-embedded-runner/run/incomplete-turn.ts` contains liveness and
  retry handling for incomplete assistant turns, including reasoning-only,
  planning-only, empty-response, tool-only, and short approval/blocked cases.
  This operates after normalized messages exist.
- The installed `@mariozechner/pi-agent-core` loop executes tools based on
  actual normalized assistant content blocks of type `toolCall`, not only on
  the assistant stop reason. That reduces one class of stop-reason-only bug:
  if a provider stop reason is odd but normalized tool-call blocks exist, the
  loop can still execute the tools.
- The installed Pi provider/parser implementation is the real raw response
  boundary for Kimi/OpenRouter, but OpenClaw's current durable optics prove the
  normalized message shape, not the raw provider chunk shape.

Remaining gap:

- OpenClaw currently proves request shape and normalized turn shape, but it does
  not emit a redacted raw-to-normalized receipt at the Kimi/OpenRouter adapter
  boundary.
- Therefore the live proof can show that Kimi eventually produced normalized
  tool calls, but it cannot conclusively prove the absence of these failure
  modes:
  - raw provider `tool_calls` existed but normalized tool-call blocks were lost;
  - raw provider finish reason was `stop` with real tool calls and the turn was
    treated as final text;
  - normalized `toolUse`/tool-call finish had no new tool calls;
  - Kimi emitted JSON-looking tool calls as assistant text rather than structured
    tool calls;
  - tool-call IDs were changed between assistant tool call and tool result;
  - Kimi reasoning/thinking fields were present or missing in a way that changed
    tool-call parsing, without exposing hidden reasoning content.

Recommendation:

- Add a Kimi/OpenRouter normalization receipt at the stream-adapter boundary.
- The receipt must be redacted and shape-only. It should not store prompt text,
  tool bodies, tool arguments, raw response text, hidden reasoning, or raw
  provider logs.
- Suggested receipt fields:
  - provider;
  - model;
  - route;
  - raw finish reason / stop reason value;
  - normalized stop reason;
  - count of raw structured tool-call chunks;
  - count of final raw structured tool calls;
  - count of normalized assistant `toolCall` blocks;
  - count of assistant text blocks;
  - whether assistant text appears to contain JSON-looking tool calls;
  - whether any tool-call IDs were preserved exactly;
  - hashed/redacted tool-call IDs for linkage proof;
  - whether every normalized tool call received a matching tool result;
  - whether reasoning/thinking fields were present as fields, without content.
- Add fail-fast diagnostics for impossible states:
  - normalized `toolUse` without normalized tool calls;
  - raw structured tool calls with zero normalized tool calls;
  - normalized tool calls whose result IDs do not match;
  - text-only JSON-looking tool calls when structured tools were available.
- Keep OpenCode's repair principle:
  obvious tool-name casing/spacing errors should either normalize safely or
  produce a concise model-visible correction, not silently disappear.

## Sequential Audit Item 2: Managed-Output Saved-Path Read/Grep Parity

Status: audited; parity is partial.

Scope:

- Whether OpenClaw managed output behaves like OpenCode truncated output from
  the agent's perspective.
- Specifically: when the model sees `Full output saved to: <path>`, can it use
  ordinary `read` and `grep` on that path as OpenCode instructs, or must it use
  `openclaw_resource_read` and managed-output refs?

OpenCode behavior from local source:

- `.artifacts/opencode-dev/packages/opencode/src/tool/truncate.ts` writes the
  full text to `TRUNCATION_DIR` using `Truncate.write`.
- `Truncate.output` returns a preview plus:
  - `Full output saved to: ${file}`;
  - if Task is available: use Task/explore agent to process the saved file with
    Grep and Read;
  - otherwise: use Grep to search the full content or Read with offset/limit to
    view specific sections.
- The saved output is a normal file path.
- `.artifacts/opencode-dev/packages/opencode/src/tool/read.ts` accepts absolute
  file paths, checks permissions/external-directory policy, then returns
  source-shaped output:
  `<path>`, `<type>file</type>`, `<content>`, line-numbered source, and
  continuation.
- `.artifacts/opencode-dev/packages/opencode/src/tool/grep.ts` accepts a path,
  resolves it, and searches either that file or that directory through the
  normal search service. It returns grouped path/line matches.
- OpenCode's model-facing path is therefore simple:
  large output -> saved normal file path -> normal Read/Grep.

OpenClaw behavior from local source:

- `src/agents/pi-embedded-runner/tool-result-truncation.ts` persists oversized
  tool output under `stateRoot/managed-tool-output/...` and returns:
  `Full output saved to: <outputPath>`;
  `Use Grep to search the full content or Read with offset/limit to view
specific sections.`
- `src/config/sessions/managed-output.ts` also records a native
  `openclaw-managed-output://...` ref, metadata path, output path, hash, tool
  name, session key, and tool-call ID.
- `src/agents/tools/openclaw-resource-read-tool.ts` can hydrate those refs:
  - line-oriented managed-output reads return source-shaped text with `<path>`,
    `<type>file</type>`, `<content>`, line numbers, total lines, and next
    offset;
  - byte-oriented managed-output reads are available for byte continuation;
  - `query` searches the full managed output by regex or literal search.
- `openclaw_resource_read` therefore provides a working exact-ref readback
  path.
- Ordinary OpenClaw repo discovery tools are not equivalent to OpenCode's saved
  path workflow:
  - `src/agents/tools/repo-discovery-tools.ts` scopes list/glob/grep to
    `workspaceRoot`;
  - it intentionally excludes `stateRoot` and `.openclaw/runtime`;
  - normal `grep` cannot search arbitrary absolute saved-output paths outside
    `workspaceRoot`;
  - normal `glob`/`list` cannot inspect runtime state.
- `src/agents/pi-tools.ts` has a node-parent guard exception for
  `.openclaw/runtime/managed-tool-output/*.txt`:
  - `read` and `grep` may inspect that specific workspace-runtime managed-output
    file path;
  - other runtime state remains blocked.
- That exception only gives OpenCode-like behavior when the saved output is
  physically under the workspace `.openclaw/runtime/managed-tool-output`.
- When `Location.stateRoot` is outside the editable workspace, the ordinary
  `read`/`grep` path does not behave like OpenCode's saved-output file path.

Remaining gap:

- OpenClaw tells the model to use `Read`/`Grep` on `Full output saved to:
<outputPath>`, but normal `read`/`grep` are not guaranteed to work on that
  path across native Location topologies.
- The reliable path is currently `openclaw_resource_read` with
  `openclaw-managed-output://...`, which is more abstract than OpenCode.
- This can make Kimi believe it has a saved file path but fail to use ordinary
  editor/navigation tools on it, especially when `stateRoot` is external.

Recommendation:

- Preserve `openclaw-managed-output://...` internally for authority, provenance,
  and exact refs.
- Also make managed-output saved files available through normal read/grep
  semantics in all topologies:
  - either expose managed output as a virtual readable/searchable file namespace
    accepted by normal `read` and `grep`;
  - or place a session-scoped readable mirror/symlink under an allowed
    workspace-visible managed-output directory;
  - or teach normal `read`/`grep` to recognize saved managed-output paths that
    are proven by managed-output metadata and route them through the same
    bounded line/search internals.
- The model-facing truncation message should be honest about the supported
  workflow:
  - if ordinary `read`/`grep` on `outputPath` are supported, keep the OpenCode
    wording;
  - if not, include the managed-output ref and say exactly that
    `openclaw_resource_read` can read or search it.
- Best end state:
  - model sees ordinary source/search affordances;
  - runtime enforces managed-output authority behind the scenes;
  - the agent does not need to reason about stateRoot, metadata files, or
    special ref semantics for basic readback.

## Sequential Audit Item 3: Grep/Glob Internals Parity

Status: audited; core grep/glob internals are still not OpenCode-parity.

Scope:

- OpenCode grep/glob implementation and model-facing affordances.
- OpenClaw grep/glob/list implementation and model-facing affordances.
- Whether broad grep can legitimately miss a target file because of
  candidate-file preselection.

OpenCode behavior from local source:

- `.artifacts/opencode-dev/packages/opencode/src/tool/grep.ts`:
  - parameter `pattern` is a regex pattern;
  - optional `path` scopes the directory or file to search;
  - optional `include` filters files by pattern;
  - if `path` points to a file, OpenCode passes `file: [relativeFile]` to the
    search service;
  - otherwise it calls `Search.search({ cwd, pattern, glob, file, signal })`;
  - it maps returned matches to absolute paths, line numbers, and matching
    lines;
  - it caps displayed rows at 100;
  - if more rows exist, output says `more matches available` and recommends a
    more specific path or pattern.
- `.artifacts/opencode-dev/packages/opencode/src/tool/glob.ts`:
  - calls `Search.glob({ cwd, pattern, limit: 100 })`;
  - returns matching file paths;
  - says results are truncated when more than 100 files exist.
- `.artifacts/opencode-dev/packages/core/src/filesystem/search.ts`:
  - uses an FFF picker when available;
  - for grep, calls `pick.grep(..., { mode: "regex", pageSize: limit,
timeBudgetMs: 1500 })`;
  - falls back to ripgrep if FFF is unavailable, not ready, or fails;
  - remembers recent query/file results for search relevance;
  - for glob, uses FFF glob with `pageSize: limit` or ripgrep file listing with
    `Stream.take(limit + 1)`.
- `.artifacts/opencode-dev/packages/core/src/filesystem/ripgrep.ts`:
  - grep args are `rg --json --hidden --glob=!.git/* --no-messages`;
  - `--max-count` is set from the tool limit;
  - file filters are passed directly to ripgrep;
  - file listing uses `rg --files --hidden --glob=!.git/*`.

OpenCode model-facing descriptions:

- `grep.txt` says grep is a fast content search tool that works with any
  codebase size, searches file contents using regular expressions, supports
  full regex syntax, supports `include`, returns file paths and line numbers,
  and should be used to find files containing specific patterns.
- `grep.txt` also says open-ended search that may require multiple rounds of
  globbing and grepping should use Task.
- `glob.txt` says glob is fast file pattern matching that works with any
  codebase size, returns matching file paths, and should be used for file-name
  patterns.
- `glob.txt` explicitly reminds the model it can call multiple tools in one
  response and that speculative parallel searches are often better.

OpenClaw behavior from local source:

- `src/agents/tools/repo-discovery-tools.ts` implements custom grep/glob/list.
- OpenClaw grep:
  - parameter `query` is regex by default, with `regex:false` for literal
    search;
  - optional `path` scopes to a workspace-relative file or directory;
  - optional `glob` filters candidate files;
  - it first calls `walkFiles` to build a candidate file list, capped by
    `defaultMaxFiles`;
  - only after candidate files are selected does it read files and match lines;
  - if the candidate list truncates before the matching file is reached,
    OpenClaw can return:
    `Search incomplete before match confidence.`
    with no matches.
- OpenClaw glob:
  - also calls the custom `walkFiles`;
  - returns the first `defaultMaxResults` matching files;
  - truncation is based on the custom traversal order and max-files cap.
- OpenClaw list:
  - lists one directory with offset/maxResults;
  - excludes the same default runtime/generated directories.
- OpenClaw excludes more roots/directories by default than OpenCode's ripgrep
  args:
  - `.artifacts`;
  - `.git`;
  - `.next`;
  - `.turbo`;
  - `coverage`;
  - `dist`;
  - `node_modules`;
  - `.openclaw/runtime`;
  - native `Location.stateRoot` when it is inside the workspace.
- OpenClaw skips symbolic links during custom walk.
- OpenClaw file-scoped grep adds two context lines by default when the path is
  an exact file candidate. That is useful, but it is an OpenClaw addition rather
  than OpenCode parity.

Core difference:

- OpenCode searches the requested scope through FFF/ripgrep, then caps returned
  matches/results.
- OpenClaw caps the candidate-file set before searching file contents.
- This is the exact failure class seen in live Kimi proofs:
  broad grep can be a legitimate action, but the tool returns an incomplete
  non-answer because the target file was outside the preselected candidate slice.
- The model then repeats broad grep or performs more reads because it got
  neither a useful match nor a true negative.

Remaining gaps:

- OpenClaw grep should not pre-cap candidate files in a way that can hide
  matches before search.
- OpenClaw glob should use a search engine/file-listing primitive with a result
  limit, not a custom alphabetical repo walk whose traversal order becomes part
  of model behavior.
- OpenClaw lacks OpenCode's FFF/ripgrep layered search service, recent-query
  tracking, and search warming.
- OpenClaw's broader default exclusions may be desirable for node safety, but
  they are not OpenCode parity and should be explicit policy, not accidental
  behavior hidden inside a custom search implementation.
- The `Search incomplete before match confidence` output is honest, but it is
  not OpenCode-like. OpenCode normally returns either visible matches,
  no matches from the search engine, or a simple truncation notice after matches.

Recommendation:

- Replace OpenClaw grep/glob internals with an OpenCode-shaped native search
  service:
  - prefer ripgrep/FFF-style search over a preselected candidate file list;
  - search the requested scope first;
  - cap output matches/results second;
  - preserve regex-by-default semantics;
  - support file-scoped search as a direct file argument;
  - support include/glob filters through the search engine;
  - preserve stateRoot/runtime exclusions by passing exclusion globs or by
    filtering search engine inputs without imposing a candidate cap.
- Keep OpenClaw's safety exclusions, but make them declarative search policy.
- Remove the broad-grep zero-match incomplete path caused by candidate
  preselection.
- Keep file-scoped context excerpts if they help Kimi, but do not let that
  obscure the primary parity rule: grep returns real path/line matches from the
  searched scope.
- Mirror OpenCode model-facing affordance more closely:
  grep/glob are fast normal navigation tools;
  Task is for open-ended multi-round exploration;
  multiple independent searches can be made in parallel.

## Sequential Audit Item 4: Provider-Visible Tool Schemas And Order

Status: audited; visibility is mostly proven, exact provider-visible parity is
not fully proven without reading the launch catalog ref.

Scope:

- OpenCode final tool registry, filtering, ordering, and schema/description
  transformation.
- OpenClaw final tool construction, filtering, ordering, provider-definition
  adapter, launch catalog summary, and provider-turn optics.
- Whether execution-coding can actually see mutation tools and LSP.

OpenCode behavior from local source:

- `.artifacts/opencode-dev/packages/opencode/src/tool/registry.ts` initializes
  built-in tools in this order:
  - invalid;
  - question when enabled;
  - shell;
  - read;
  - glob;
  - grep;
  - edit;
  - write;
  - task;
  - webfetch;
  - todo;
  - websearch;
  - skill;
  - apply_patch;
  - lsp only when `experimentalLspTool` is enabled;
  - plan only when plan mode is enabled in CLI.
- OpenCode filters tools by provider/model:
  - web search only for supported provider/routes;
  - apply_patch for selected GPT models;
  - edit/write hidden when apply_patch is selected for that model.
- OpenCode dynamically augments Task description with the permission-filtered
  subagent catalog.
- Plugin hooks can rewrite tool definition description/parameters before model
  exposure.
- `.artifacts/opencode-dev/packages/opencode/src/tool/tool.ts` wraps execution
  with schema decoding and generic truncation.
- OpenCode's provider path is comparatively direct: registry -> permissions /
  provider filtering -> tool definitions -> model.

OpenClaw behavior from local source:

- `src/agents/pi-tools.ts` starts from `@mariozechner/pi-coding-agent`
  coding tools, then adds OpenClaw repo discovery tools, LSP, apply_patch, exec,
  process, channel tools, OpenClaw native tools, native runtime tools, and
  extra tools.
- OpenClaw then applies many filtering/wrapping stages:
  - memory-flush filtering;
  - message-provider filtering;
  - model-provider filtering;
  - owner-only filtering;
  - profile/provider/global/agent/group/sandbox/subagent policies;
  - node authority overlay;
  - native task parent filtering;
  - exact-read guard for execution-coding node parents;
  - execution scout filtering;
  - parent crawl guard when applicable;
  - execution-role tool reminders for scouts/validators;
  - provider schema normalization;
  - before-tool-call hook wrapping;
  - abort wrapping;
  - deferred follow-up description patches;
  - document-ingest arbitration wrapping for read.
- `src/agents/pi-tool-definition-adapter.ts` converts final OpenClaw tools to
  provider tool definitions without reordering:
  - name;
  - label;
  - description;
  - parameters;
  - execute wrapper.
- The adapter normalizes nonstandard tool results and converts thrown tool
  errors into model-visible error results.
- `src/agents/pi-embedded-runner/tool-split.ts` always passes OpenClaw tools as
  custom tools so OpenClaw policy/filtering/sandbox behavior remains consistent.
- `src/agents/pi-embedded-runner/run/attempt.ts` records provider-turn optics:
  - provider-visible tool names in order;
  - alphabetically sorted visible names;
  - mutating tools;
  - whether apply_patch is visible;
  - catalog summary;
  - tool-call/result ID linkage.
- `session.launch` records `effectiveToolNames`, `toolCatalogRef`, and a
  `toolCatalogSummary`.
- `toolCatalogSummary` contains name, catalog index, description hash/bytes,
  and parameter hash/bytes, sorted by name while preserving each catalog index.
- It does not inline full provider-visible descriptions or schemas into the
  trace event.

Execution-coding tool visibility:

- `NODE_AGENT_NATIVE_TASK_ALWAYS_ALLOWED_TOOL_NAMES` includes:
  update_plan, read_todo, task, read, grep, glob, lsp,
  openclaw_resource_read, and node_finish.
- `NODE_AGENT_NATIVE_TASK_MUTATION_TOOL_NAMES` includes edit and apply_patch.
- Tests in `src/agents/pi-tools-agent-config.test.ts` assert that executable
  node parent mode includes:
  - task;
  - update_plan;
  - read_todo;
  - apply_patch;
  - edit;
  - read;
  - glob;
  - grep;
  - lsp;
  - openclaw_resource_read;
  - node_finish.
- Those tests also assert:
  - exec/process/write/raw sessions tools are absent for execution-coding
    parent mode;
  - apply_patch and edit appear before grep;
  - node_finish appears before read.
- `orderExecutionParentProviderTools` intentionally prioritizes execution parent
  tools:
  - apply_patch;
  - edit;
  - write;
  - node_finish;
  - update_plan;
  - read_todo;
  - task;
  - openclaw_resource_read;
  - read;
  - grep;
  - glob.

Remaining gaps:

- LSP is allowed and tested as present, but it is missing from
  `EXECUTION_PARENT_TOOL_ORDER_PRIORITY`. Therefore it falls after all
  prioritized execution-parent tools by original insertion order instead of
  being intentionally placed near read/grep.
- OpenCode's registry is simpler. OpenClaw's many filtering/wrapping stages are
  more powerful, but each is another place where the final model-visible
  catalog can diverge from intent.
- Provider-turn optics prove tool names/order and hashes, but not exact
  provider-visible descriptions/schemas inline. Exact parity requires resolving
  the `toolCatalogRef` or adding a redacted catalog snapshot.
- The catalog summary is sorted by name, so it is not by itself a provider-order
  proof unless `catalogIndex` is inspected.
- OpenClaw exposes both edit and apply_patch to execution-coding node parents.
  OpenCode often chooses either apply_patch or edit/write based on provider/model.
  OpenClaw's broader mutation surface is intentional, but it is not pure
  OpenCode parity.
- OpenCode repairs malformed tool names through `experimental_repairToolCall`
  and the invalid tool path. OpenClaw's provider adapter normalizes tool
  execution failures, but unknown/malformed provider tool names still need a
  raw-normalization proof from item 1.

Recommendation:

- Keep execution-coding mutation tools visible and early.
- Add `lsp` to `EXECUTION_PARENT_TOOL_ORDER_PRIORITY`, likely near read/grep:
  - either before read for large-file symbol navigation;
  - or between read and grep if preserving ordinary source read first is desired.
- Add a per-launch redacted provider-visible tool catalog receipt that includes:
  - ordered tool names;
  - description hashes and byte counts;
  - parameter hashes and byte counts;
  - mutation-tool names;
  - LSP visibility and catalog position;
  - schema/description source version if available.
- Keep full tool descriptions/schemas out of ordinary logs, but make them
  resolvable from `toolCatalogRef` for proof/debug.
- Continue using catalog-first permissions and explicit child identity. That
  part aligns with OpenCode's successful shape.
- Avoid adding more model-facing process text to compensate for catalog
  affordance. If a tool is important, make it visible, correctly ordered, and
  accurately described.

## Sequential Audit Item 5: Validation Scout Shell/Exec Parity

Scope:

- Compare OpenCode's shell tool implementation and prompt against OpenClaw's
  `exec` tool, validation-scout canonical docs, and validation-scout tool
  filtering.
- Focus on the failure class where validation scout burns many calls on ad hoc
  TypeScript command archaeology instead of using the repo-native validation
  lane.

OpenCode code read:

- `.artifacts/opencode-dev/packages/opencode/src/tool/shell.ts`
- `.artifacts/opencode-dev/packages/opencode/src/tool/shell/prompt.ts`
- `.artifacts/opencode-dev/packages/opencode/src/tool/shell/shell.txt`

OpenClaw code read:

- `src/agents/bash-tools.exec-runtime.ts`
- `src/agents/bash-tools.exec.ts`
- `src/agents/bash-tools.schemas.ts`
- `src/agents/bash-tools.descriptions.ts`
- `src/agents/pi-tools.ts`
- `src/agents/tools/native-task-tool.ts`
- `docs/agents/execution-validation-scout/runtime/BOOTSTRAP.md`
- `docs/agents/execution-validation-scout/runtime/AGENTS.md`
- `docs/agents/execution-validation-scout/runtime/TOOLS.md`

OpenCode behavior:

- The shell tool schema has:
  - `command`;
  - optional `timeout` in milliseconds;
  - optional `workdir`;
  - required `description`.
- The `workdir` parameter description explicitly says to use it instead of `cd`
  commands.
- The tool prompt says shell is for terminal operations such as git, npm, and
  docker.
- The tool prompt explicitly says not to use shell for file operations:
  - file search should use Glob;
  - content search should use Grep;
  - file reads should use Read;
  - file edits should use Edit;
  - file writes should use Write;
  - direct response text should be used instead of echo/printf for
    communication.
- The shell prompt says that if output exceeds configured line/byte limits, the
  full output is written to a file and the model should use Read with
  offset/limit or Grep on that file.
- The shell prompt explicitly says not to use `head`, `tail`, or other
  truncation commands to limit output because the full output is already
  captured.
- The prompt tells the model to make multiple shell calls in one message when
  commands are independent and can run in parallel.
- The prompt tells the model to chain dependent commands with `&&` and use `;`
  only when earlier failure does not matter.
- The implementation parses shell commands with tree-sitter, extracts command
  path/directory patterns, and asks for permissions on external directories and
  shell command patterns before execution.
- The implementation stores large shell output through the generic truncation
  service and returns model-visible output shaped like:
  - `...output truncated...`;
  - `Full output saved to: <path>`;
  - tail output.
- The saved output path is a normal readable path that the model can inspect
  with the same Read/Grep tools.

OpenClaw behavior:

- `execSchema` has:
  - `command`;
  - optional `workdir`;
  - optional `env`;
  - optional `yieldMs`;
  - optional `background`;
  - optional `timeout` in seconds;
  - optional `pty`;
  - optional `elevated`;
  - optional `host`;
  - optional `security`;
  - optional `ask`;
  - optional `node`.
- `describeExecTool` currently emphasizes:
  - shell commands with background continuation;
  - `yieldMs` / `background`;
  - continuing later via `process`;
  - automatic completion wake;
  - `pty=true` for TTY-required commands.
- The generic `exec` description does not currently include OpenCode's strong
  shell-policy text:
  - use dedicated read/grep/glob/edit/write tools instead of shell for file
    operations;
  - use `workdir` instead of `cd`;
  - do not use `head`/`tail`/manual truncation;
  - issue independent commands in parallel;
  - rely on saved full output for later Read/Grep.
- `buildExecOutputPreview` stores foreground output over 50 KB as managed output
  and returns tail preview plus `Full output saved to: <path>`.
- The foreground result details include `managedOutputRef`, `managedOutputPath`,
  `truncated`, `exitCode`, `durationMs`, and related execution metadata.
- This is semantically close to OpenCode's truncation behavior, but parity still
  depends on item 2: the saved path/ref must be readable/searchable through
  normal source-shaped affordances.
- `EXECUTION_VALIDATION_SCOUT_ALLOWED_TOOL_NAMES` includes:
  - read;
  - list;
  - glob;
  - grep;
  - exec;
  - openclaw_resource_read.
- It does not include `process`.
- Therefore the generic exec description's advice to continue via `process`
  can be misleading in validation-scout context if background execution is
  available but `process` is not visible.
- Validation scout canonical runtime docs now contain the repo-native command
  menu:
  - prefer `pnpm test:file <test-file>`;
  - use `pnpm test:file <test-file> -- -t <test name or symbol>` when one test
    is known;
  - use named repo proof scripts only when parent names the proof or changed
    files clearly belong to that proof lane;
  - do not improvise raw `tsc` flag combinations;
  - do not run project-wide TypeScript compiles unless a repo-native command
    failed and proves no focused command is available.
- The native task tool description also says validation scouts should prefer
  repo-native focused commands and should not perform raw `tsc` archaeology
  unless a repo command failed.

Remaining gaps:

- The validation command menu exists in agent docs and task description, but
  not in the `exec` tool description itself.
- OpenCode places most shell behavior guidance directly in the model-visible
  tool prompt. OpenClaw splits it between agent docs and a thinner generic exec
  tool prompt.
- OpenClaw's generic exec prompt emphasizes background/process continuation even
  for validation scout, while validation scout does not have `process` in its
  allowed catalog.
- OpenCode shell requires a `description` parameter; OpenClaw exec does not.
  That means OpenClaw has weaker model self-commitment before command
  execution.
- OpenCode tells the model not to use shell for file search/read/edit at the
  exact moment shell is selected. OpenClaw currently relies more on the general
  tool descriptions and agent docs for that behavior.
- OpenCode has a unified truncation message that points at a normal readable
  saved file. OpenClaw points at managed output/path/ref. That is acceptable
  only if managed output behaves like normal Read/Grep from the agent's point
  of view.
- OpenCode parses shell commands for permission extraction. OpenClaw has a
  strong exec approval/security system, but this audit did not prove equivalent
  tree-sitter command/path extraction for validation-specific command hygiene.

Recommendation:

- Make `exec` description profile-aware for `execution-validation-scout`.
- For validation scout, prepend the repo-native command menu directly to the
  `exec` tool description:
  - prefer `pnpm test:file <test-file>`;
  - use `pnpm test:file <test-file> -- -t <name>` for one known test/symbol;
  - use a named repo proof script only when the parent or changed files point
    to that lane;
  - do not use raw `tsc` flag archaeology before a repo-native command has
    failed.
- For validation scout, remove or suppress generic background/process wording
  unless `process` is also visible. The cleanest current shape is focused
  foreground validation commands only.
- Copy OpenCode's generic shell-tool behavioral text into OpenClaw's exec
  description for coding agents:
  - do not use exec for file search/read/edit/write when native tools can do it;
  - use `workdir` instead of `cd`;
  - do not use `head`/`tail`/manual truncation to manage output;
  - issue independent validation commands as parallel tool calls when safe;
  - use command chaining only when commands depend on each other.
- Consider adding an optional `description` field to OpenClaw exec, or at least
  a concise command-purpose instruction in the schema/tool description. This
  copies OpenCode's useful command-intent affordance without changing runtime
  authority.
- Keep hard deterministic command rejection light. If raw `tsc` archaeology
  repeats after the tool-description change, add a validation-scout-only
  correction result for first raw `tsc` before repo-native validation:
  `Use the repo-native focused command first unless it already failed.`
- Add proof optics for validation:
  - validation scout first exec command;
  - number of exec calls;
  - raw `tsc` command count before first repo-native command;
  - broad/project-wide compile count;
  - whether process is referenced while not visible;
  - whether truncated validation output is readable/searchable through ordinary
    managed-output readback.

## Sequential Audit Item 6: Compaction Replay In Live Proof

Scope:

- Compare OpenCode's compaction, overflow recovery, retained-tail, and
  model-visible continuation behavior against OpenClaw's embedded-runner
  compaction and replay path.
- Focus on the failure class where Kimi resumes after compaction and behaves as
  if it has lost exact source context or sees old tool output as unusable
  truncation markers.

OpenCode code read:

- `.artifacts/opencode-dev/packages/opencode/src/session/compaction.ts`
- `.artifacts/opencode-dev/packages/opencode/src/session/message-v2.ts`
- `.artifacts/opencode-dev/packages/opencode/src/session/prompt.ts`
- `.artifacts/opencode-dev/packages/core/src/session/compaction.ts`
- `.artifacts/opencode-dev/packages/opencode/src/agent/prompt/compaction.txt`

OpenClaw code read:

- `src/agents/pi-embedded-runner/compact.ts`
- `src/agents/pi-embedded-runner/run.ts`
- `src/agents/pi-embedded-runner/run/attempt.ts`
- `src/agents/pi-embedded-runner/tool-result-context-guard.ts`
- `src/agents/pi-embedded-runner/tool-result-truncation.ts`
- `src/config/sessions/working-context.ts`

OpenCode behavior:

- OpenCode creates compaction as a normal session task when the last assistant
  turn indicates overflow or the model token state crosses the compaction
  threshold.
- The compaction service selects old conversation head for summarization and
  keeps a bounded recent tail.
- Defaults include:
  - `DEFAULT_TAIL_TURNS = 2`;
  - recent preserved token budget between 2,000 and 8,000 tokens;
  - `TOOL_OUTPUT_MAX_CHARS = 2,000` when converting old tool outputs for the
    compaction model.
- Compaction model input is old history plus a dedicated compaction prompt.
- Old tool results sent to the compaction model are truncated with a simple
  inline marker:
  `[Tool output truncated for compaction: omitted N chars]`.
- Tool parts already compacted are replayed as:
  `[Old tool result content cleared]`.
- The user-side compaction part becomes:
  `What did we do so far?`
  when converted to model messages.
- On successful auto-compaction, OpenCode can insert a synthetic continuation
  user message:
  `Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.`
- If the overflow involved large media attachments, it prepends a media-specific
  warning. Otherwise the continue message is generic.
- OpenCode then filters/reorders context so model consumption is:
  - compaction user message;
  - summary assistant message;
  - retained recent tail;
  - optional synthetic continue user message.
- OpenCode's compaction prompt says:
  - summarize only provided conversation history;
  - preserve exact file paths and identifiers when known;
  - do not answer the conversation itself;
  - do not mention summarizing or compacting.
- In the newer core session runner, compaction emits a compaction message with
  summary and recent context, then the run is retried after overflow through the
  normal LLM request path.

OpenClaw behavior:

- OpenClaw has a richer embedded-runner compaction path with:
  - replay sanitization;
  - provider-specific replay validation;
  - history limiting;
  - before/after compaction hooks;
  - compaction checkpoints;
  - post-compaction session-file truncation;
  - context-engine-owned compaction support;
  - timeout-triggered compaction;
  - preemptive checkpoint events around node-agent edit/validation/finish
    boundaries.
- Before compaction input, OpenClaw calls `projectMessagesForCompactionInput`.
- `projectMessagesForCompactionInput` caps tool-result messages to
  `COMPACTION_TOOL_OUTPUT_MAX_BYTES = 2,000` and persists the full original as
  managed output.
- The projected content includes:
  - preview;
  - `...N bytes truncated...`;
  - `Output truncated.`;
  - `Full output saved to: <managed output path>`;
  - `Use Grep to search the full content or Read with offset/limit to view specific sections.`
- OpenClaw also compacts settled mutation tool-call inputs so huge old edit
  payloads do not dominate compaction input.
- Live tool-result guard can truncate large tool results to notices like:
  `[... N more characters truncated]`.
- OpenClaw node-bound execution-coding auto-compaction appends custom
  continuation instructions:
  `Continue the current implementation. If target files, patch shape, and validation signal are known, edit or validate next. Do not restart source discovery unless a named source window, failed edit, or validation error requires it.`
- OpenClaw preemptive node-agent checkpoints record that they preserve:
  - node objective;
  - changed files;
  - validation refs;
  - working-context refs;
  - managed-output refs;
  - latest todo state;
  - source windows.
- OpenClaw working context projection now starts with:
  `Partial task result, truncated to parent-visible budget.`
  and says exact source windows below are usable for editing.

Remaining gaps:

- OpenCode's model-visible compaction recovery is simpler: summary plus retained
  recent tail plus a generic continue prompt. OpenClaw has more durable
  checkpoint/ref machinery, which is useful, but it creates more ways for the
  resumed model to see references or truncation markers instead of source.
- OpenClaw's compaction input projection points at managed-output paths/refs.
  This is safe only if item 2 is fully true: normal Read/Grep can hydrate/search
  that output in a source-shaped way.
- OpenClaw live proof previously showed replayed large tool results as
  clipped/truncated marker text. That can make Kimi infer that the source is too
  large or missing, even when the runtime has refs and working-context entries.
- OpenClaw preserves refs at checkpoint boundaries, but the model still needs a
  compact continuation state containing exact changed files, failing diagnostics,
  and source-shaped repair windows. A ref-only checkpoint is not enough.
- OpenClaw's custom node continuation instruction is more edit-directed than
  OpenCode's generic continue message. That may be helpful, but it is another
  model-facing policy surface. Keep it short and avoid making it a workflow
  manual.
- OpenCode truncates old tool output for compaction with a clear compaction-only
  marker. OpenClaw uses several truncation/projection messages across live tool
  guard, compaction input projection, working context, and managed output.
  These need to converge on one natural model-facing story:
  source text when source is needed, saved path/ref when full output is too
  large, and no ledger-shaped denial text.
- OpenCode's compaction keeps a recent tail verbatim. OpenClaw has preemptive
  checkpoints around important boundaries, but this audit did not prove that
  the retained tail always includes the exact post-edit or post-validation repair
  window Kimi needs after compaction.

Recommendation:

- Keep OpenClaw's native checkpoint and managed-output infrastructure, but make
  compaction replay model-visible state OpenCode-simple:
  - concise summary;
  - retained recent tail;
  - current task objective;
  - changed files;
  - failing diagnostics;
  - exact source-shaped repair windows when known.
- Do not expose checkpoint/ledger/ref framing as the primary continuation
  evidence. Refs can appear after usable source windows, not instead of them.
- Ensure every compaction continuation that follows an edit or validation result
  includes source-shaped state:
  - file path;
  - line range;
  - exact diagnostic or edit target;
  - current patch status.
- Keep the current node continuation sentence short if retained. Do not add
  repeated read/grep footers or workflow chapters to compensate for compaction.
- Make managed-output readback from item 2 a hard prerequisite for relying on
  compaction output paths/refs.
- Add a focused proof optic after compaction:
  - first model action after compaction;
  - whether it edits/validates or restarts discovery;
  - whether the post-compaction prompt contains actual changed-file/error
    windows;
  - whether old tool outputs appear only as compaction/truncation markers;
  - whether any model-visible message says or implies exact source is missing
    when it is available through retained tail or managed output.
- If Kimi still rehydrates badly after these changes, copy OpenCode's stronger
  simplification: make post-compaction continuation mostly summary plus retained
  tail, and move OpenClaw-specific checkpoint metadata out of provider-visible
  text unless explicitly read.

## Sequential Audit Item 7: Edit / Write / Apply Patch Choice

Scope:

- Compare OpenCode's mutation tool implementation, descriptions, tool selection,
  and model-facing mutation affordances against OpenClaw's execution-coding
  parent mutation catalog.
- Focus on whether Kimi is being shown the right mutation surface, whether edit
  results are precise enough, and whether our broader mutation set creates
  choice ambiguity.

OpenCode code read:

- `.artifacts/opencode-dev/packages/opencode/src/tool/edit.ts`
- `.artifacts/opencode-dev/packages/opencode/src/tool/edit.txt`
- `.artifacts/opencode-dev/packages/opencode/src/tool/write.ts`
- `.artifacts/opencode-dev/packages/opencode/src/tool/write.txt`
- `.artifacts/opencode-dev/packages/opencode/src/tool/apply_patch.ts`
- `.artifacts/opencode-dev/packages/opencode/src/tool/apply_patch.txt`
- `.artifacts/opencode-dev/packages/opencode/src/tool/registry.ts`
- `.artifacts/opencode-dev/packages/opencode/src/session/tools.ts`

OpenClaw code read:

- `src/agents/pi-tools.host-edit.ts`
- `src/agents/apply-patch.ts`
- `src/agents/pi-tools.ts`
- `src/agents/pi-tools-agent-config.test.ts`

OpenCode behavior:

- OpenCode initializes builtin tools in a stable order:
  - invalid;
  - question when enabled;
  - shell;
  - read;
  - glob;
  - grep;
  - edit;
  - write;
  - task;
  - fetch;
  - todo;
  - search;
  - skill;
  - apply_patch;
  - lsp when experimental flag is enabled;
  - plan when experimental plan mode is enabled.
- OpenCode does not always expose edit, write, and apply_patch together.
- Registry selection uses model ID:
  - if model ID includes `gpt-`, excludes `oss`, and excludes `gpt-4`, expose
    apply_patch;
  - otherwise expose edit and write;
  - hide apply_patch for the non-GPT branch.
- Therefore a Kimi-like non-GPT model would normally see edit/write, not
  apply_patch, under OpenCode's current registry logic.
- OpenCode edit schema is narrow:
  - `filePath`;
  - `oldString`;
  - `newString`;
  - optional `replaceAll`.
- OpenCode edit description is concise and operational:
  - use Read at least once before editing;
  - line-number prefixes are not part of oldString/newString;
  - prefer editing existing files;
  - do not write new files unless required;
  - oldString must be exact;
  - multiple matches require more surrounding context or replaceAll.
- OpenCode edit implementation:
  - resolves the file path;
  - checks external directory permission;
  - takes a per-file semaphore lock;
  - preserves BOM and line endings;
  - supports empty oldString only for creating a new file when the file does not
    exist;
  - rejects empty oldString for existing files and tells the model to use write
    for intentional full-file replacement;
  - creates a diff before asking for edit permission;
  - writes the file;
  - formats the file;
  - publishes filesystem/watch events;
  - creates a final diff;
  - computes additions/deletions;
  - updates tool metadata with diff, filediff, and diagnostics;
  - touches LSP;
  - reads LSP diagnostics;
  - returns `Edit applied successfully.` plus model-visible LSP errors when
    present.
- OpenCode edit uses tolerant replacement fallbacks:
  - direct/simple replacement;
  - line-trimmed replacement;
  - block-anchor replacement;
  - whitespace-normalized replacement;
  - indentation-flexible replacement;
  - escape-normalized replacement;
  - trimmed-boundary replacement;
  - context-aware replacement;
  - multi-occurrence handling for replaceAll.
- OpenCode also rejects disproportionate tolerant matches where the matched span
  is much larger than oldString.
- OpenCode write schema is narrow:
  - `filePath`;
  - `content`.
- OpenCode write:
  - reads existing content when present;
  - creates diff;
  - asks edit permission;
  - writes with directories;
  - formats;
  - publishes filesystem/watch events;
  - touches LSP;
  - returns LSP errors for current file and up to five other project files.
- OpenCode apply_patch schema is:
  - `patchText`.
- OpenCode apply_patch:
  - parses patch hunks;
  - validates file paths;
  - computes per-file diff metadata;
  - asks edit permission with combined diff and file list;
  - applies add/update/delete/move operations;
  - formats changed files;
  - publishes filesystem/watch events;
  - touches LSP for changed files;
  - returns `Success. Updated the following files:` plus LSP diagnostics per
    changed file.

OpenClaw behavior:

- Execution-coding node parent tests assert the visible catalog includes:
  - task;
  - update_plan;
  - read_todo;
  - apply_patch;
  - edit;
  - read;
  - glob;
  - grep;
  - lsp;
  - openclaw_resource_read;
  - node_finish.
- Execution-coding node parent tests assert the visible catalog does not include:
  - list;
  - exec;
  - process;
  - write;
  - sessions_spawn;
  - sessions_yield;
  - subagents;
  - agents_list.
- `NODE_AGENT_NATIVE_TASK_MUTATION_TOOL_NAMES` includes both edit and
  apply_patch.
- `nodeNativeTaskAlsoAllow` additionally forces `apply_patch` to be allowed for
  execution-coding node parent mode.
- `EXECUTION_PARENT_TOOL_ORDER_PRIORITY` prioritizes:
  - apply_patch;
  - edit;
  - write;
  - node_finish;
  - update_plan;
  - read_todo;
  - task;
  - openclaw_resource_read;
  - read;
  - grep;
  - glob.
- `lsp` is not currently in this priority map even though it is allowed.
- OpenClaw's wrapped edit description adds a strong implementation guidance
  paragraph:
  - edit is the primary implementation mutation tool;
  - use edit as soon as target file/symbol/patch shape are visible;
  - prefer small anchored replacements from visible read windows;
  - keep oldText surgical, usually 5-40 lines;
  - do not include unrelated exported declarations or whole sections;
  - one edit call may include multiple non-overlapping replacements;
  - use apply_patch for large multi-hunk or structural rewrites.
- OpenClaw execution-parent tool filtering adds another edit guidance paragraph
  to edit and patch guidance to apply_patch.
- OpenClaw edit schema differs from OpenCode:
  - OpenCode edit is one `filePath`, one `oldString`, one `newString`, optional
    `replaceAll`.
  - OpenClaw edit uses a path plus an `edits` array with `oldText` and
    `newText`.
- OpenClaw edit has copied much of OpenCode's tolerant matching behavior:
  - direct/simple replacement;
  - line-trimmed replacement;
  - block-anchor replacement;
  - whitespace-normalized replacement;
  - indentation-flexible replacement;
  - escape-normalized replacement;
  - trimmed-boundary replacement;
  - context-aware replacement.
- OpenClaw edit also rejects disproportionate matches.
- OpenClaw adds additional large-edit safety:
  - reject oldText spanning 80+ lines in a 1,000+ line file;
  - reject net deletion of 40+ lines;
  - reject dropping two or more exported/top-level declarations;
  - tell the model to use smaller anchored replacement or apply_patch for
    deliberate structural rewrite.
- OpenClaw edit returns model-visible feedback after mutation:
  - success text;
  - diff summary;
  - first changed line;
  - diff block capped at 12,000 chars;
  - TypeScript parser diagnostics;
  - LSP diagnostics when available;
  - details with changed/modified file paths, edit count, and diagnostics.
- OpenClaw edit marks error-like tool results as `isError: true` and can recover
  successful post-write failure by checking the file actually changed.
- OpenClaw edit mismatch guidance tells the model:
  - target file appears changed or oldText stale;
  - current file byte count;
  - do one bounded local read or one exact grep plus bounded read;
  - do not restart broad discovery.
- OpenClaw apply_patch:
  - uses parameter `input` instead of OpenCode's `patchText`;
  - parses the same Begin/End Patch style format;
  - resolves workspace-boundary paths;
  - applies add/update/delete/move;
  - records added/modified/deleted summary;
  - touches LSP for added/modified files;
  - returns success plus LSP diagnostics or explicit none/unavailable messages.
- OpenClaw execution-coding node parent does not expose write, even though
  OpenCode's non-GPT branch exposes edit and write. OpenClaw can still create
  files through apply_patch add-file hunks.

Remaining gaps:

- OpenCode's model-selection policy is clearer for mutation tools:
  - GPT-class models get apply_patch;
  - other models get edit/write.
    OpenClaw currently exposes both edit and apply_patch to Kimi execution parent.
- OpenClaw's broader mutation surface may be useful, but it is not strict
  OpenCode parity and may create choice ambiguity.
- OpenClaw hides write from execution-coding node parent. That reduces full-file
  replacement risk, but differs from OpenCode's non-GPT tool set.
- OpenClaw edit supports multiple replacements in one call. That can reduce
  turns, but it is more powerful than OpenCode's one-replacement edit and needs
  the large-edit guard to remain safe.
- OpenClaw apply_patch appears before edit in provider-visible order. OpenCode's
  non-GPT/Kimi branch would not show apply_patch at all; its GPT branch would
  show apply_patch and hide edit/write.
- LSP is allowed for execution parent but not intentionally ordered near the
  source-navigation/mutation tools.
- OpenCode write returns project diagnostics for up to five other files;
  OpenClaw edit mostly returns current-file diagnostics, while apply_patch
  returns per-changed-file diagnostics. This is close enough for edit precision,
  but write parity is not active because write is hidden from execution parent.
- OpenCode's edit/write descriptions are shorter and less process-heavy.
  OpenClaw's edit description is stronger and more targeted to the Kimi failure
  class, but it is no longer pure OpenCode text.

Recommendation:

- Decide intentionally whether Kimi execution-coding should follow strict
  OpenCode model-selection parity:
  - Option A: Kimi sees edit only as the primary mutation tool, with apply_patch
    hidden unless the node policy explicitly requests patch mode.
  - Option B: Kimi sees edit and apply_patch, but edit remains first and
    apply_patch is explicitly for deliberate multi-hunk structural rewrites.
- If the goal is maximum OpenCode parity, choose Option A for Kimi:
  - hide apply_patch from Kimi execution parent by default;
  - keep edit as the normal mutation tool;
  - consider exposing write only if new/full-file creation becomes a live
    blocker, otherwise keep apply_patch add-file as the safer creation path.
- If keeping both tools, move edit ahead of apply_patch for Kimi/non-GPT
  execution parent. Reserve apply_patch-first ordering for models/routes that
  are explicitly patch-native.
- Add `lsp` to `EXECUTION_PARENT_TOOL_ORDER_PRIORITY` near source navigation:
  - before read for large-file symbol navigation; or
  - between read and grep if preserving plain read first.
- Keep the OpenClaw edit safety additions. They are justified by the live
  failure where Kimi attempted a broad replacement that crossed unrelated type
  sections.
- Keep model-visible diff/LSP feedback after edit/apply_patch. That closes the
  important OpenCode parity gap where mutation tools reward precise edits and
  immediately show diagnostics.
- Do not add more workflow text to compensate for mutation uncertainty. Make
  the catalog shape do the work:
  - one primary mutation tool;
  - concise description;
  - strong result feedback;
  - LSP diagnostics.
- Add proof optics:
  - mutation tools visible and ordered;
  - first mutation tool chosen;
  - edit vs apply_patch usage by model/provider;
  - edit result diff summary present;
  - LSP diagnostic block present or explicitly none;
  - edit failure result has `isError: true`;
  - number of source calls after first edit failure.
