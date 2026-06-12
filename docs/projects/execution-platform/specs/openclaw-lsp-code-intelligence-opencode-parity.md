---
summary: "Proposal to copy OpenCode's LSP/code-intelligence path so OpenClaw worker agents use symbols, references, diagnostics, and source-shaped navigation instead of manually walking large files."
title: "OpenClaw LSP Code Intelligence OpenCode Parity"
---

# OpenClaw LSP Code Intelligence OpenCode Parity

**Full Proposal**

**Completion Tracking**

- [x] Add OpenCode-style `lsp` tool. Evidence: `src/agents/tools/lsp-tool.ts` exposes `documentSymbol`, `workspaceSymbol`, `goToDefinition`, `findReferences`, `hover`, `goToImplementation`, `prepareCallHierarchy`, `incomingCalls`, and `outgoingCalls` with source-coordinate output; `src/agents/tools/lsp-tool.test.ts` proves `documentSymbol` and `workspaceSymbol`.
- [x] Add native LSP service layer. Evidence: `src/agents/openclaw-lsp-service.ts` adds a native TypeScript/JavaScript language-service backend with server registry/status, lazy client lifecycle, `touchFile`, `diagnostics`, `diagnosticsForFile`, `documentSymbol`, `workspaceSymbol`, `definition`, `references`, `implementation`, `hover`, and soft failure for unsupported file types.
- [x] Wire LSP into mutation tools. Evidence: `src/agents/pi-tools.host-edit.ts` wires post-mutation LSP diagnostics into `edit` and `write`; `src/agents/apply-patch.ts` wires post-mutation LSP diagnostics into `apply_patch`; `src/agents/pi-tools.read.host-edit-recovery.test.ts` proves model-visible LSP diagnostics after edit.
- [x] Have `read` warm LSP state. Evidence: `src/agents/pi-tools.read.ts` calls `lspService.touchFile()` after successful source reads without changing read output; `src/agents/pi-tools.read.repo-canonical.test.ts` proves the warm-up path.
- [x] Improve file-scoped `grep` for exact navigation. Evidence: `src/agents/tools/repo-discovery-tools.ts` returns bounded context lines around file-scoped matches; `src/agents/tools/repo-discovery-tools.test.ts` proves file-scoped grep source excerpts.
- [x] Optional cheap symbol range hints in `read`. Decision: not enabled yet because the proposal makes this optional and the required `read` behavior says not to add LSP metadata to read output; `read` now warms LSP so later symbol/diagnostic calls are cheap without adding another model-visible abstraction.
- [x] Prevent repeated structure walking without chokers. Evidence: no new deterministic blocker was added; `lsp` and file-scoped grep now provide the intended alternative to sequential adjacent reads.
- [x] Expose parallel calls clearly. Evidence: `src/agents/pi-tools.read.ts` adds “Call this tool in parallel when you know multiple independent files to read.” to the read description; no `source_context_batch` path was reintroduced.
- [x] Tool descriptions. Evidence: `src/agents/pi-tools.read.ts` and `src/agents/tools/lsp-tool.ts` both include the large-file symbol/type navigation instruction to use `lsp documentSymbol` / `workspaceSymbol` or file-scoped grep before sequential reads.
- [x] Focused tests. Evidence: `pnpm test:file src/agents/tools/lsp-tool.test.ts src/agents/pi-tools.read.repo-canonical.test.ts src/agents/pi-tools.read.host-edit-recovery.test.ts src/agents/tools/repo-discovery-tools.test.ts src/agents/pi-tools-agent-config.test.ts` passed.
- [x] Targeted static check for new LSP files. Evidence: `pnpm exec tsc --ignoreConfig --noEmit --pretty false --module NodeNext --moduleResolution NodeNext --target ES2022 --lib ES2023 --skipLibCheck src/agents/openclaw-lsp-service.ts src/agents/tools/lsp-tool.ts` passed.
- [ ] Live Work Queue proof with model-active wallclock metrics. Deferred by explicit goal scope: this implementation pass excludes only the live proof.

Validation note: full-repo `tsc --noEmit` was attempted with the default heap and then `NODE_OPTIONS=--max-old-space-size=8192`; the default run hit Node heap limits, and the higher-heap run still reports unrelated existing type debt outside this LSP parity slice. The focused tests and targeted LSP compile above are the verification evidence for this slice.

Core correction: copy OpenCode’s code-intelligence path, not another prompt/process layer. The agent should not manually walk a 5,000-line TypeScript file to find symbols. It should ask the runtime for symbols/references, then use normal `read` for exact source windows.

The last run’s main issue was clear: Kimi used `read` as a crude structure browser. It tried to find type/function boundaries by walking adjacent line windows. We should give it OpenCode-grade code navigation affordances while keeping model-visible output as source coordinates and source text, not ledgers or summaries.

1. **Add OpenCode-Style `lsp` Tool**

Port the logic from:

- `.artifacts/opencode-dev/packages/opencode/src/tool/lsp.ts`
- `.artifacts/opencode-dev/packages/opencode/src/tool/lsp.txt`
- `.artifacts/opencode-dev/packages/opencode/src/lsp/*`

Minimum exposed operations for `execution-coding`:

- `documentSymbol`
- `workspaceSymbol`
- `goToDefinition`
- `findReferences`
- `hover`

Nice-to-add if cheap:

- `goToImplementation`
- `prepareCallHierarchy`
- `incomingCalls`
- `outgoingCalls`

OpenClaw-native shape:

```ts
lsp({
  operation: "documentSymbol" | "workspaceSymbol" | "goToDefinition" | "findReferences" | "hover",
  filePath: string,
  line?: number,
  character?: number,
  query?: string
})
```

Model-visible output should be simple and source-navigation-oriented:

- symbol name
- kind
- path
- start line/column
- end line/column
- container name if available

No hidden ledger framing. No “semantic graph.” Just coordinates the agent can use with `read`.

2. **Add Native LSP Service Layer**

Port OpenCode’s service logic as closely as possible:

- LSP server discovery/registry
- client lifecycle
- `touchFile(file, diagnosticsMode)`
- `diagnostics()`
- `documentSymbol(uri)`
- `workspaceSymbol(query)`
- `definition(position)`
- `references(position)`
- soft failure when no LSP server exists

For OpenClaw, wire this as an agent runtime service, not an EP-only helper. The tool should be available to ordinary coding agents and node-bound execution agents through normal tool catalog policy.

3. **Wire LSP Into `edit`, `write`, And `apply_patch`**

Copy OpenCode’s post-mutation behavior:

- after `edit` / `write` / `apply_patch`, call `lsp.touchFile(filePath, "document")`
- collect diagnostics
- append model-visible diagnostics only for relevant file errors
- include diff metadata
- return normal success plus diagnostic block if needed

Current OpenClaw only has TypeScript parser syntax diagnostics. That is useful but weaker than OpenCode. The next version should return real LSP errors, like:

```text
Edit applied successfully.

LSP errors detected in this file, please fix:
<diagnostics file="...">
ERROR [123:9] ...
</diagnostics>
```

4. **Have `read` Warm LSP State**

Copy OpenCode’s read behavior:

- after a successful source read, call `lsp.touchFile(filepath)` in the background
- do not block read on LSP failure
- do not add LSP metadata to read output
- keep read output source-shaped

This keeps the model-facing read tool clean while making later diagnostics/symbol calls faster and more reliable.

5. **Improve File-Scoped `grep` For Exact Navigation**

For file-scoped grep, return line numbers plus a small source excerpt by default, not just match hits.

If the model greps a known file for a symbol, it should usually get enough to choose a `read` offset without performing repeated adjacent reads.

Keep this bounded and source-shaped:

- path
- matched line number
- 1-3 context lines around the match
- match count / truncation status

6. **Optional Cheap Symbol Range Hints In `read`**

Add “symbol range hints” to `read` output only when cheap and LSP is already warmed.

Example:

```text
enclosingSymbol: WorkQueueExecutionReadModel lines 54-1320
```

Rules:

- no workflow instruction
- no ledger
- no semantic graph
- no hidden context abstraction
- only factual coordinates

This should be optional and should not block `read`.

7. **Prevent Repeated Structure Walking Without Reintroducing Chokers**

We already fixed repeated path-only top reads. The next similar problem is sequential adjacent reads like:

- `40-160`
- `160-240`
- `240-360`

Do not block these yet. LSP should make them unnecessary. If the pattern persists after LSP, add a factual correction:

```text
This looks like structure navigation. Use lsp documentSymbol for symbol ranges.
```

But only add that after proving LSP alone is insufficient.

8. **Expose Parallel Calls Clearly**

OpenCode’s read docs explicitly say to call the tool in parallel when multiple files are known. Our Kimi run did some parallel reads, which is good.

Keep reinforcing this in tool descriptions, not through a new batch abstraction:

```text
Call this tool in parallel when you know multiple independent files to read.
```

Do not reintroduce `source_context_batch`.

9. **Tool Descriptions**

Keep this minimal. Add one sentence to `read` / `lsp` descriptions:

```text
For large-file symbol or type navigation, use lsp documentSymbol/workspaceSymbol or file-scoped grep before sequential reads.
```

Do not add repeated read footers. Do not add another workflow skill.

10. **Proof Optics**

Next proof should track:

- first `lsp` call timestamp
- first edit timestamp
- source calls before first edit
- whether context overflow happens before mutation
- whether LSP diagnostics appear after edit
- whether Kimi stops sequentially reading adjacent windows

Success gate:

- Kimi uses `lsp` or file-scoped grep instead of walking `execution-read-model.ts` in chunks.
- First mutation happens before context overflow.
- Edit result includes diff and LSP diagnostics or explicit “no LSP diagnostics.”
- Work Queue target files are either cleanly finished or reverted after failed proof.

**Implementation Order**

1. Port OpenCode LSP diagnostic formatting.
2. Port/adapt OpenCode LSP service and minimal server registry.
3. Add OpenClaw `lsp` tool with `documentSymbol` and `workspaceSymbol` first.
4. Wire `read` to warm LSP.
5. Wire `edit`, `write`, `apply_patch` to post-mutation LSP diagnostics.
6. Improve file-scoped `grep` to include small source excerpts.
7. Optionally add cheap enclosing-symbol hints to `read` if LSP state is available.
8. Add focused tests.
9. Rerun the Work Queue delta proof with model-active wallclock metrics.

Bottom line: LSP first, then file-scoped grep excerpts, then optional enclosing-symbol hints. Avoid batch/context-ledger abstractions. The agent needs source coordinates and source text, not more metadata surfaces.
