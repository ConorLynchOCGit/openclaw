---
summary: "Verbatim proposal to remove execution-coding context abstractions, align edit/LSP affordances with OpenCode, and keep Kimi operating on source, coordinates, diffs, diagnostics, and validation."
title: "OpenClaw Kimi Source-Shaped Execution OpenCode Parity"
---

# OpenClaw Kimi Source-Shaped Execution OpenCode Parity

## Implementation Tracking

- [x] Remove working-context/file_graph model-visible paths from execution-coding.
- [x] Remove `openclaw_resource_read` from execution-coding.
- [x] Simplify task result projection so parent-visible handoff text is source-shaped and metadata-light.
- [x] Normalize edit tool interface toward OpenCode shape.
- [x] Tighten edit feedback and LSP diagnostics.
- [x] Make LSP output patch-coordinate oriented.
- [x] Preserve useful LSP hierarchy while keeping one-based source coordinates.
- [x] Cap `workspaceSymbol` closer to OpenCode and make `documentSymbol` query mode exact-match-first.
- [x] Update Kimi system prompt with symbol-query guidance and the large path-only read warning.
- [x] Rebuild/reload after code/doc changes.
- [x] Live proof tracking is intentionally skipped for this implementation pass by operator instruction.

Validation evidence:

- Focused tests passed with `pnpm test:file src/agents/tools/lsp-tool.test.ts src/agents/pi-tools.read.host-edit-recovery.test.ts src/agents/tools/native-task-tool.test.ts src/agents/system-prompt-contribution.test.ts src/agents/agent-pack-registry.test.ts src/agents/pi-tools-agent-config.test.ts src/agents/pi-tools.node-authority-overlay.test.ts src/agents/pi-embedded-subscribe.handlers.tools.test.ts src/agents/pi-embedded-runner/run/attempt.test.ts`.
- Gateway dist reload succeeded with approved LSP runtime dependency sync. Evidence is the latest succeeded JSON artifact under `.artifacts/docker-gateway-reload/`.

**Updated Proposal**

**Core Direction**

Move execution-coding closer to OpenCode by removing model-visible context abstractions and making the agent operate on:

- source-shaped `read` output
- grep matches with line context
- LSP symbol coordinates
- edit diffs
- concise LSP diagnostics
- validation output

No context ledger, no file graph, no working-context refs, no “you already have context via metadata.”

The guiding principle: Kimi should see code, coordinates, diffs, diagnostics, and validation results. It should not have to reason about OpenClaw-specific context storage abstractions while trying to edit.

**OpenCode LSP Comparison**

OpenCode’s LSP tool is raw and minimally mediated.

For `documentSymbol`, OpenCode calls `textDocument/documentSymbol` and returns:

```ts
output: result.length === 0
  ? `No results found for ${args.operation}`
  : JSON.stringify(result, null, 2);
```

OpenCode does not add a `documentSymbol` model-facing cap in the tool. The number of results is whatever the LSP server returns, unless generic tool-output truncation later truncates/saves the output.

OpenCode’s raw `documentSymbol` output can include:

- `name`
- `detail`
- `kind` as numeric LSP `SymbolKind`
- `range`
- `selectionRange`
- `children`, when the server returns nested document symbols

Important difference: OpenCode preserves nested symbol hierarchy. If the language server returns a tree, the model can see that tree.

For `workspaceSymbol`, OpenCode is capped in the LSP service:

```ts
result.filter((x) => kinds.includes(x.kind)).slice(0, 10);
```

That means roughly 10 workspace symbols per LSP client/server, filtered to classes, functions, methods, interfaces, variables, constants, structs, and enums.

For `definition`, `references`, `implementation`, `hover`, and call hierarchy, OpenCode returns raw result arrays. It does not reshape them into a custom OpenCode summary.

Our LSP output is more tailored but also more opinionated:

- normalizes `kind` into strings like `function`, `interface`, `variable`
- converts LSP zero-based positions into one-based `read`/editor positions
- flattens nested document symbols into rows with `containerName`
- caps `documentSymbol` default output at 80 symbols
- caps `documentSymbol` query output at 40 symbols
- caps `workspaceSymbol` visible output at 80 symbols
- adds `resultCount`, `shownCount`, `omittedCount`
- adds ready `read(...)` calls

That gives useful coordinates, but it also loses hierarchy and can feel telemetry-shaped. In the previous proof, huge files produced results like roughly `1,728` symbols for `execution-read-model.ts` and `1,047` symbols for `work-queue-repository.ts`. Our tool reported counts and omitted most symbols; OpenCode would preserve the raw shape until generic truncation.

The best path is not copying raw JSON blindly. The better OpenClaw-native shape is a hybrid: preserve enough hierarchy, show exact matches first, show containing symbols and immediate children, keep one clear read action, reduce count metadata noise, and make LSP feel like a patch locator.

**1. Remove Working Context And File Graph From Execution**

Do not hide it from Kimi. Remove it from this path.

Concrete removals:

- Remove `openclaw-session-working-context://...` support from execution-coding model-visible tools.
- Remove `file_graph`, `change_set`, `validation_state`, `workingContextRef`, `workingContextEntryRef` from parent-visible task/tool outputs.
- Remove working-context prompt rehydration from execution attempts.
- Remove scout/task projection that says refs/file graph are usable evidence.
- Remove docs telling execution-coding to use working-context refs.
- Keep ordinary managed-output only where required for truncation, but make it read like OpenCode: normal readable output with line windows/search, not semantic ledger state.

If internal proof artifacts still need evidence refs, they should use transcript events, changed files, validation artifacts, and managed-output refs. Not a semantic context ledger.

**2. Remove `openclaw_resource_read` From Execution-Coding**

For Kimi execution workers, remove it entirely unless we can make it purely OpenCode-style managed-output readback.

Current problem: its description says it hydrates managed-output plus working-context refs and returns bounded prompt-ready context windows/file graph/change set/validation state. That is exactly the abstraction layer we want gone.

Replacement:

- `read` reads source files.
- `grep` searches source files and managed-output saved paths if needed.
- managed-output readback should be through normal source-shaped read/search semantics, not `openclaw_resource_read`.

**3. Strip Task Projection Metadata**

Task results should be plain handoff text. No projected working context framing.

Bad shape:

- `workingContextEntryRef`
- `file_graph`
- `projected`
- `refs usable as evidence`

Better shape:

```text
Task result, truncated to parent-visible budget.
Exact source windows below are usable for editing.

<source windows / findings>
```

If no exact source exists, say that plainly.

**4. Make Edit OpenCode-Style**

There is still a gap. OpenCode exposes one clear edit shape:

- `filePath`
- `oldString`
- `newString`
- `replaceAll`

Our edit surface is too broad and Kimi is getting confused by aliases and mixed modes.

Proposal:

- Make OpenCode-compatible `filePath + oldString + newString` the primary visible schema.
- Keep line/range and multi-edit internally or as secondary, but do not make them the dominant model-facing path.
- Accept common Kimi variants robustly: `oldText/newText`, `path/filePath`, `edits[]`.
- Error messages should normalize back to the canonical shape:

```text
Use edit({filePath, oldString, newString}).
```

- Keep surgical edit guards.
- Keep multi-location edits, but phrase as “multiple exact replacements” rather than a separate editing paradigm.

**5. Edit Feedback**

OpenCode edit feedback is simple: success, diff metadata, LSP diagnostics.

Our model-visible edit result should be:

```text
Edit applied successfully.

Diff:
+N -M, first changed line X
<small diff hunk>

LSP diagnostics:
none
```

Or:

```text
LSP diagnostics, next repair targets:
- path:line:col ERROR message
```

Avoid dumping heavy diagnostic metadata into model-visible text. Cap diagnostics, group by file, and make the next repair line obvious.

**6. LSP Output**

Make LSP patch-coordinate oriented.

For exact query matches:

```text
LSP documentSymbol query="buildWorkQueueExecutionReadModel"
1 exact match

extensions/.../execution-read-model.ts
symbol: buildWorkQueueExecutionReadModel
kind: function
range: 5267-5460
read: read({"path":"...","offset":5267,"limit":220})
```

For multiple matches:

```text
LSP documentSymbol query="WorkQueueEvent"
exact matches: 3
shown: 3

extensions/.../work-queue-events.ts
symbol: WorkQueueEvent
kind: type
range: 10-44
read: read({"path":"...","offset":10,"limit":60})

extensions/.../execution-read-model.ts
symbol: WorkQueueEventDeltaReadback
kind: type
range: 120-150
read: read({"path":"...","offset":120,"limit":60})
```

For broad document outlines:

- Preserve a small hierarchy rather than fully flattening.
- Show top-level exported symbols first.
- For each top-level symbol, show a tiny bounded child list when useful.
- Avoid dumping 80 flat rows if the file is huge.
- Include exact `read(...)` calls for likely patchable symbols.

For broad results:

```text
Too many symbols. Use a more specific query from the task names/types.
Good queries: WorkQueueExecutionReadModel, buildWorkQueueExecutionReadModel, summarizeWorkQueueExecutionForUi
```

No generic “full output saved, use grep/read” for LSP. LSP is a locator, not source.

Specific LSP changes:

- Preserve hierarchy for `documentSymbol` where the server provides `children`.
- Keep one-based positions because they align with `read`.
- Keep string symbol kinds because they are easier for the model than numeric LSP kinds.
- Reduce visible `resultCount/shownCount/omittedCount` noise unless useful.
- For `workspaceSymbol`, cap closer to OpenCode: 10-20 visible results unless the query is exact.
- For `documentSymbol` query mode, exact symbol matches first, then containing symbol, then immediate children.
- For no exact match, show the closest query suggestions or say no symbol match plainly.
- Make every useful symbol result include a ready `read(...)` call.

**7. System Prompt Additions**

Add symbol-query guidance:

```text
Derive LSP queries from task names, file names, exported types, functions, interfaces, test names, and likely PascalCase/camelCase symbols. For large TypeScript files, use lsp documentSymbol with a specific query before reading structure.
```

Add the read warning, scoped to large path-only reads:

```text
Path-only read of a large file floods context and jeopardizes your core mission: making accepted edits. Use it at most once for an initial peek. After that, use lsp/query, file-scoped grep, or read with explicit offset and limit.
```

**Implementation Order**

1. Remove working-context/file_graph model-visible paths.
2. Remove `openclaw_resource_read` from execution-coding.
3. Simplify task result projection.
4. Normalize edit tool interface toward OpenCode shape.
5. Tighten edit feedback and LSP diagnostics.
6. Make LSP output patch-coordinate oriented.
7. Preserve useful LSP hierarchy while keeping one-based source coordinates.
8. Cap `workspaceSymbol` closer to OpenCode and make `documentSymbol` query mode exact-match-first.
9. Update Kimi system prompt with symbol-query and large-read warning.
10. Rebuild/reload.
11. Run one proof and track: first LSP, first edit, edit failures by schema vs exact-match vs guard, validation path.
