---
summary: "Proposal to replace OpenClaw's in-process TypeScript LSP fallback with an OpenCode-style external LSP manager for worker symbol navigation and diagnostics."
title: "OpenClaw External LSP Manager OpenCode Parity"
---

# OpenClaw External LSP Manager OpenCode Parity

**Proposal**

Build an OpenCode-style external LSP manager for OpenClaw execution workers, replacing the current in-process TypeScript language-service path for live worker navigation and diagnostics.

**Completion Tracking**

- [x] Add native LSP client layer. Evidence: `src/agents/openclaw-lsp-service.ts` now starts `typescript-language-server --stdio`, talks JSON-RPC with `vscode-jsonrpc`, performs initialize/initialized, sends `textDocument/didOpen` / `textDocument/didChange`, requests `documentSymbol`, `workspace/symbol`, `definition`, `references`, `implementation`, `hover`, and implements bounded diagnostics helpers.
- [x] Add LSP server registry. Evidence: `src/agents/openclaw-lsp-service.ts` adds TypeScript-first extension matching, nearest root detection from package/lockfile markers, broken-server tracking, and spawn dedupe keyed by `workspace root + server id`.
- [x] Add lifecycle management. Evidence: `src/agents/openclaw-lsp-service.ts` caches one client per root/server and exposes `shutdown()`; `src/agents/pi-embedded-runner/run/attempt.ts` creates a runner-owned native LSP service; `src/agents/pi-embedded-runner/run/attempt.subscription-cleanup.ts` shuts it down during attempt cleanup; `src/agents/pi-tools.ts` accepts a caller-owned service and uses AST-only fallback for unmanaged tool-factory calls.
- [x] Add diagnostics behavior like OpenCode. Evidence: `read` still warms files without blocking through `touchFile(file)`; `edit` / `write` / `apply_patch` still call `touchFile(file, "document")` and `diagnosticsForFile`; `src/agents/openclaw-lsp-service.ts` uses 3s LSP request timeouts, 5s document diagnostic wait, and 10s full diagnostic wait; model-visible diagnostics remain concise `<diagnostics>` blocks through existing formatter paths.
- [x] Add runtime dependencies. Evidence: `package.json` and `pnpm-lock.yaml` include `typescript-language-server` and `vscode-jsonrpc`; the service resolves `typescript-language-server/lib/cli.mjs` and repo-local `typescript/lib/tsserver.js`; no network download is required.
- [x] De-risk current heavy paths. Evidence: `src/agents/openclaw-lsp-service.ts` removes normal navigation dependence on `ensureWorkspaceScan()` and in-process TypeScript semantic diagnostics; `documentSymbol` falls back to cheap AST-only symbol extraction if the external LSP is unavailable.
- [x] Port/adapt OpenCode LSP logic into OpenClaw-native service files. Evidence: `src/agents/openclaw-lsp-service.ts` now carries OpenCode-shaped external client/root/server/diagnostic behavior behind the existing `OpenClawLspService` interface.
- [x] Add TypeScript server registry only. Evidence: the external manager currently registers only the TypeScript language server path and keeps broader language support out of scope.
- [x] Wire the existing `lsp` tool to the new service. Evidence: `src/agents/tools/lsp-tool.ts` continues to use `OpenClawLspService`, now backed by the external manager for runner-owned services.
- [x] Wire `read` to `touchFile(file)` without diagnostics. Evidence: `src/agents/pi-tools.read.ts` warm-up remains best-effort and source-output preserving; `src/agents/pi-tools.read.repo-canonical.test.ts` proves read output does not gain LSP metadata.
- [x] Wire `edit` / `write` / `apply_patch` to post-mutation document diagnostics. Evidence: existing mutation wiring in `src/agents/pi-tools.host-edit.ts` and `src/agents/apply-patch.ts` now uses the external service when runner-owned; `src/agents/pi-tools.read.host-edit-recovery.test.ts` proves model-visible diagnostics after edit.
- [x] Add tests for process reuse, timeout behavior, symbol calls, and edit diagnostics. Evidence: `src/agents/tools/lsp-tool.test.ts` proves symbol calls, no diagnostics for symbol-only navigation, one external TypeScript client reused per root, explicit shutdown, and bounded document diagnostics; `src/agents/pi-embedded-runner/run/attempt.subscription-cleanup.test.ts` proves cleanup shutdown; edit/read diagnostics tests prove adjacent tool behavior.
- [x] Rebuild runtime image or reload deps. Evidence: dependency installation updated `package.json`, `pnpm-lock.yaml`, and local `node_modules` for `typescript-language-server` and `vscode-jsonrpc`; `scripts/docker/reload-gateway-dist.sh --sync-lsp-runtime-deps` now permits the narrow approved LSP dependency sync without a full image rebuild, copies the already-installed `node_modules/typescript-language-server` and `node_modules/vscode-jsonrpc` package directories into live `/app/node_modules`, and verifies the live container resolves `typescript-language-server/lib/cli.mjs`, `vscode-jsonrpc`, and `typescript/lib/tsserver.js`; live gateway reload evidence `20260611T122012Z.json` passed post-health and post-ready; live gateway proof execution remains intentionally deferred.
- [ ] Rerun the Work Queue proof and track LSP call latency/memory. Deferred by explicit user scope: "execute on this except the live proof."

Validation evidence:

- `pnpm exec tsc --ignoreConfig --noEmit --pretty false --module NodeNext --moduleResolution NodeNext --target ES2022 --lib ES2023,DOM --skipLibCheck --allowImportingTsExtensions true src/agents/openclaw-lsp-service.ts src/agents/tools/lsp-tool.ts src/agents/tools/lsp-tool.test.ts src/agents/pi-embedded-runner/run/attempt.subscription-cleanup.test.ts`
- `pnpm test:file src/agents/pi-embedded-runner/run/attempt.subscription-cleanup.test.ts src/agents/tools/lsp-tool.test.ts src/agents/pi-tools.read.repo-canonical.test.ts src/agents/pi-tools.read.host-edit-recovery.test.ts src/agents/pi-tools-agent-config.test.ts`

Validation note: a broader `pnpm exec tsc --ignoreConfig ... src/agents/pi-tools.ts ...` command pulled in existing repo-wide extension/model-memory path-alias and `.ts` import debt unrelated to this LSP slice. The focused compile above covers the new LSP service/tool/test files directly, and the focused test lanes cover the touched integration seams.

**Goal**

Move LSP cost out of the OpenClaw worker process and into bounded external language-server processes, so symbol navigation and diagnostics do not OOM or wedge live proof runs.

**Core Requirement**

Replace the current in-process TypeScript language-service fallback with an OpenCode-style LSP manager:

- spawn real LSP server processes, e.g. `typescript-language-server --stdio`
- talk JSON-RPC over stdin/stdout
- keep clients cached by `workspace root + server id`
- open/change documents through LSP notifications
- request symbols/definitions/references/diagnostics through LSP requests
- use strict timeouts so diagnostics never wedge or OOM the worker process
- shut clients down with the runtime/session lifecycle

That is the architectural correction. The LSP cost moves out of the OpenClaw worker process and into bounded external language-server processes.

**Scope**

Implement TypeScript first. Do not build the full multi-language registry yet. Keep AST-only `documentSymbol` as a fallback if external LSP is unavailable.

**Concrete Work**

1. Add native LSP client layer:
   - JSON-RPC connection using `vscode-jsonrpc` or equivalent
   - initialize handshake
   - `textDocument/didOpen`
   - `textDocument/didChange`
   - `textDocument/documentSymbol`
   - `workspace/symbol`
   - `textDocument/definition`
   - `textDocument/references`
   - `textDocument/hover`
   - diagnostics request/wait helpers

2. Add LSP server registry:
   - TypeScript server first
   - root detection from lockfiles/package files
   - extension mapping
   - disabled/broken server tracking
   - spawn dedupe for concurrent calls

3. Add lifecycle management:
   - one client per `root + server`
   - reuse clients across tools in a worker run
   - stop clients on runtime/session cleanup
   - record status without dumping logs

4. Add diagnostics behavior like OpenCode:
   - `read` warms file by opening it, but does not block on diagnostics
   - `edit`/`write`/`apply_patch` touch file with `"document"` diagnostics
   - diagnostics wait has timeout, e.g. 3s request, 5s document wait, 10s full wait
   - model-visible output includes concise diagnostics block only when useful

5. Add runtime dependencies:
   - ensure `typescript-language-server` is available in the runtime image
   - ensure repo-local `typescript/lib/tsserver.js` resolves
   - avoid network download during live proof unless explicitly allowed

6. De-risk current heavy paths:
   - remove `ensureWorkspaceScan()` from normal LSP navigation
   - stop using in-process TS semantic diagnostics for live workers
   - keep AST-only `documentSymbol` as fallback if external LSP unavailable

**Implementation Order**

1. Port/adapt OpenCode's `lsp/client.ts`, `lsp/lsp.ts`, `lsp/server.ts`, and `lsp/diagnostic.ts` logic into OpenClaw-native service files.
2. Add TypeScript server registry only.
3. Wire the existing `lsp` tool to the new service.
4. Wire `read` to `touchFile(file)` without diagnostics.
5. Wire `edit`/`write`/`apply_patch` to post-mutation document diagnostics.
6. Add tests for process reuse, timeout behavior, symbol calls, and edit diagnostics.
7. Rebuild runtime image or reload deps.
8. Rerun the Work Queue proof and track LSP call latency/memory.

**Success Gates**

- `documentSymbol` and file navigation do not trigger in-process workspace semantic scans.
- LSP server process is reused across tool calls for the same root/server.
- LSP diagnostics after edit are bounded and timeout-safe.
- Worker process does not OOM from LSP activity.
- Work Queue proof shows LSP calls returning usable coordinates with acceptable latency.
- If external LSP is unavailable, OpenClaw falls back to cheap AST-only symbols rather than blocking or crashing.
