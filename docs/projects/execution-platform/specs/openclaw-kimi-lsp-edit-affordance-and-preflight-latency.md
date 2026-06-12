---
summary: "Proposal for tightening Kimi implementation-worker edit commitment, LSP navigation, edit-tool semantics, proof optics, and remaining preflight latency."
title: "OpenClaw Kimi LSP Edit Affordance And Preflight Latency"
---

# OpenClaw Kimi LSP Edit Affordance And Preflight Latency

## Status

Implemented locally from the Work Queue delta Kimi proof diagnosis on
2026-06-11. No live model proof was run for this implementation pass.

## Diagnosis

The system prompt change helped: Kimi did form a patch plan, edited production code, wrote tests, delegated validation, then began focused repair from validation errors. That is a major improvement over the old "never edits" loop.

Remaining failures:

1. **Edit start is still too late.**
   First edit landed at about `+613s` from first model activation. It still over-acquired before making the first reversible patch.

2. **No LSP calls at all.**
   `lsp` was visible, but Kimi used manual read/grep structure walking through large TypeScript files. The LSP path is not salient enough.

3. **Local uncertainty still delays edits.**
   It knew the builder, target function, return object, and patch shape, but still continued structure discovery. We need a general rule that local/reversible uncertainty is not a blocker.

4. **Edit error semantics are wrong.**
   Edit failures persisted with `details.status: "error"` but `isError:false`. That makes failed edits feel like normal tool context and weakens recovery behavior.

5. **Edit schema is still unnatural for Kimi/OpenCode parity.**
   OpenCode uses `filePath`, `oldString`, `newString`, `replaceAll`. We expose `path`, `edits[].oldText`, `edits[].newText`. Kimi did try multi-edit-with-path, but the failure message said "Missing required parameter: edits" even while receiving `edits=<array>`, likely because nested entries did not match our expected key names.

6. **Optics overcount after compaction.**
   Later counts included replay-compacted tool records. Metrics need to separate live tool calls from replayed compacted transcript entries, otherwise we will misread latency and behavior.

7. **Preflight latency remains.**
   Config loading is fixed, but `node_model_runtime_admitted` still took about 88s after bootstrap paths. The remaining target is model/auth admission caching, not embedded run startup.

## Proposal

1. Add the general reversible-edit rule to Kimi's implementation system prompt:

> When you can name a bounded patch shape and the remaining uncertainty is local and reversible, make the smallest validatable edit now. Do not wait for perfect conditions or complete architecture certainty. Validation and edit failure are the next source of truth.

Examples can follow: field wiring through an existing object, a small helper beside existing code, an optional parameter, a narrow repository accessor, a fixture adjustment, or one focused assertion.

2. Make LSP the default large-file structure path.

Add explicit wording:

> For large TypeScript files, use `lsp documentSymbol` or `workspaceSymbol` before sequential reads unless you already know the exact line window.

Also strengthen the `lsp` tool description and lightly update `read`: if the intent is symbol/type/function navigation in a large source file, use LSP first, then `read` exact returned ranges.

3. Fix edit error propagation.

Any tool result with `details.status === "error"` must persist as `isError:true` in the session transcript and replay path. This should be enforced at the generic tool-result normalization/persistence boundary, not only inside the edit wrapper.

4. Add OpenCode-compatible edit aliases.

Support:

- `filePath` as alias for `path`
- single replacement: `oldString/newString/replaceAll`
- batch replacement: `edits[].oldString/newString` and `edits[].oldText/newText`

If nested edits exist but keys are wrong, error should say exactly which nested keys are accepted, not "missing edits."

5. Improve edit precision affordance.

Keep current diff/LSP diagnostics, but make failure output more actionable:

- exact-string not found: one bounded read around target or switch to `oldString/newString` with more surrounding context
- multiple matches: include count and ask for more surrounding context or `replaceAll`
- failed edit must be an actual tool error

6. Fix proof metrics.

Track:

- first model activation
- first LSP call
- first edit
- live read/grep/edit counts excluding `replayCompacted`
- validation delegation time
- repair edit after validation

7. Reduce preflight latency.

Cache/admit the already accepted model/auth runtime at launch and pass that into node execution, so the node path does not rediscover auth/model registry before `node_model_runtime_admitted`. This is separate from agent behavior, but it is still a real wallclock cost.

## Implementation Tracking

- [x] Add the general reversible-edit rule to Kimi's implementation system prompt.
- [x] Make LSP the default large-file structure path in Kimi prompt, `lsp`, and `read` model-facing text.
- [x] Persist tool results with `details.status === "error"` as `isError:true` at the generic session tool-result boundary.
- [x] Add OpenCode-compatible edit aliases: `filePath`, top-level `oldString/newString/replaceAll`, and nested `edits[].oldString/newString`.
- [x] Improve edit precision affordance with actionable exact-match and multi-match guidance while preserving failed edits as actual tool errors.
- [x] Fix proof metrics for first model activation, first LSP call, first edit, live read/grep/edit counts excluding `replayCompacted`, validation delegation time, and repair edit after validation.
- [x] Reduce preflight latency by caching discovered agent model/auth runtime and passing the admitted runtime into node execution.

## Validation

Focused non-live tests:

- `pnpm test:file src/agents/system-prompt-contribution.test.ts src/agents/pi-tools.read.host-edit-recovery.test.ts src/agents/session-tool-result-guard.test.ts src/agents/pi-model-discovery.runtime-cache.test.ts src/agents/pi-embedded-runner/run/attempt.test.ts src/agents/pi-tools.create-openclaw-coding-tools.adds-claude-style-aliases-schemas-without-dropping-f.test.ts`
- `pnpm test:file src/agents/tools/lsp-tool.test.ts src/agents/pi-tools.read.repo-canonical.test.ts`
- `pnpm test:file src/gateway/execution-platform-agent-team-runner.test.ts src/agents/pi-embedded-subscribe.handlers.tools.test.ts`
- `git diff --check -- docs/projects/execution-platform/specs/openclaw-kimi-lsp-edit-affordance-and-preflight-latency.md src/agents/pi-tools.params.ts src/agents/pi-tools.host-edit.ts src/agents/session-tool-result-guard.ts src/agents/system-prompt-contribution.ts src/agents/tools/lsp-tool.ts src/agents/pi-tools.read.ts src/agents/pi-model-discovery.ts src/gateway/execution-platform-agent-team-runner.ts src/agents/pi-embedded-runner/run/attempt.ts src/agents/pi-embedded-subscribe.handlers.tools.ts src/agents/pi-tools.read.host-edit-recovery.test.ts src/agents/session-tool-result-guard.test.ts src/agents/system-prompt-contribution.test.ts src/agents/pi-model-discovery.runtime-cache.test.ts src/agents/pi-embedded-runner/run/attempt.test.ts src/agents/tools/lsp-tool.test.ts src/agents/pi-tools.create-openclaw-coding-tools.adds-claude-style-aliases-schemas-without-dropping-f.test.ts`
