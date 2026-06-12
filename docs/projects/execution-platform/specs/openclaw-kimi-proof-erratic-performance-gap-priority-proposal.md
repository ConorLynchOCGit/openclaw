---
summary: "Ranked proposal for closing remaining OpenCode parity gaps behind Kimi proof variance."
title: "OpenClaw Kimi Proof Erratic Performance Gap Priority Proposal"
---

**Implementation Status - 2026-06-11**

Status: implemented for the focused code/test layer; live Work Queue delta proof
success remains the final runtime gate.

| Proposal Item                                                             | Status                                                                              | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Replace grep/glob internals with OpenCode-shaped behavior              | Complete in code and focused tests                                                  | `src/agents/tools/repo-discovery-tools.ts` now uses search-first/result-cap behavior for repo discovery instead of treating candidate-file preselection as search confidence. Broad grep/glob caps model-visible results rather than skipping potentially relevant files before search. Focused validation passed: `pnpm test:file src/agents/tools/repo-discovery-tools.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 2. Make managed outputs normal readable/searchable artifacts              | Complete in code and focused tests                                                  | Managed-output saved paths now route through normal source tools: `read` can hydrate saved managed output as line-windowed source-shaped content, and `grep` can search saved managed output paths without making the model use a special ref side channel. Focused validation passed: `pnpm test:file src/agents/pi-tools.read.repo-canonical.test.ts src/config/sessions/managed-output.test.ts src/agents/tools/repo-discovery-tools.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 3. Make compaction continuation source-shaped                             | Complete in code and focused tests; live replay gate pending                        | Node-worker overflow/timeout compaction now appends `<compaction_repair_context>` containing changed files, evidence refs, and source-shaped repair windows around changed/error lines instead of only refs or truncation markers. Focused validation passed: `pnpm test:file src/agents/pi-embedded-runner/run.overflow-compaction.loop.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 4. Add provider-bound catalog receipts                                    | Complete in code and focused tests                                                  | Provider request diagnostics now include a redacted provider-bound tool catalog receipt with ordered tool names, description/schema hashes, mutation tools, and LSP visibility/order. Focused validation passed: `pnpm test:file src/agents/pi-embedded-runner/run/attempt.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 5. Simplify Kimi mutation affordance                                      | Complete in code and focused tests                                                  | Execution-coding native task parent now exposes the configured primary mutation tool by default for Kimi-style node workers, with `edit` as the default primary mutation surface and `apply_patch` no longer forced beside it unless policy asks for it. Focused validation passed: `pnpm test:file src/agents/pi-tools-agent-config.test.ts src/agents/pi-tools.node-authority-overlay.test.ts src/agents/pi-embedded-runner/run/attempt.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 6. Finish LSP as a first-class navigation tool                            | Complete in code and focused tests for the active TypeScript/JavaScript LSP surface | `lsp` is visible to execution-coding, ordered intentionally near source navigation, documented in execution-coding tool surfaces, and no longer advertises unsupported `incomingCalls` / `outgoingCalls`. Current implementation is OpenClaw-native TypeScript/JavaScript code intelligence, not a full multi-language OpenCode LSP server-registry port. Focused validation passed: `pnpm test:file src/agents/tools/lsp-tool.test.ts src/agents/pi-embedded-runner/run/attempt.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 7. Make validation exec OpenCode-grade                                    | Complete in docs/tool text and focused tests                                        | Validation scout exec guidance now exposes the repo-native command menu, discourages shell for file search/read/edit, suppresses irrelevant process/background wording when process tools are unavailable, and points scouts toward focused repo validation before improvised `tsc` flag archaeology. Focused validation passed: `pnpm test:file src/agents/bash-tools.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 8. Add raw Kimi response normalization receipts                           | Complete in code and focused tests                                                  | OpenAI/OpenRouter, Anthropic, and Google transport streams now attach redacted provider response diagnostics (`rawFinishReason`, `rawToolCallChunkCount`, `rawReasoningFieldPresent`). Runner normalization receipts compare raw and normalized stop/tool/result linkage without storing raw prompts, tool bodies, raw responses, or hidden reasoning. OpenAI completions and Anthropic message streams now guard `toolUse` normalization when the provider reports a tool stop but no actual tool-call block exists. Focused validation passed: `pnpm test:file src/agents/openai-transport-stream.test.ts src/agents/anthropic-transport-stream.test.ts src/agents/google-transport-stream.test.ts src/agents/pi-embedded-runner/run/attempt.test.ts`.                                                                                                                                                                                                                                                                                                |
| 9. Keep todo lightweight                                                  | Complete in code and focused tests                                                  | `update_plan` remains a lightweight durable progress board: no scheduler gate, no phase machine, no special top-level `inProgress:` authority line, and provider-visible output stays compact. Focused validation passed: `pnpm test:file src/agents/openclaw-tools.update-plan.test.ts src/agents/tools/update-plan-tool.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 10. Make read continuation unambiguous for Kimi                           | Complete in code and focused tests                                                  | The live Work Queue delta proof showed the old source-shaped read continuation hint was present but too weak: `Use offset=2170 to continue`. `read` now keeps the same source-shaped output and adds an exact model-visible next call, for example `Exact next read: read({"path":"large.ts","offset":1781,"limit":2000})`, including managed-output saved paths. Focused validation passed: `pnpm exec oxfmt --check src/agents/pi-tools.read.ts src/agents/pi-tools.read.repo-canonical.test.ts` and `pnpm test:file src/agents/pi-tools.read.repo-canonical.test.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 11. Add Kimi implementation-worker prompt and edit-objective proof prompt | Complete in code and focused tests; live proof pending                              | Kimi execution-coding runs now receive a short provider/system-level implementation overlay equivalent in role to OpenCode `kimi.txt`: make accepted source edits, start with a patch hypothesis, acquire only needed context, use LSP/file-scoped grep for large TypeScript files, and follow exact read-continuation calls. The Work Queue delta proof prompt now starts with expected source change, likely files/symbols, validation signals, allowed scope, and first-turn patch hypothesis instructions rather than discovery framing. Native trace optics now record model activation time, first edit after model activation, visible patch-hypothesis evidence, source calls before first edit, and path-only reads after exact continuation hints. Focused validation passed: `pnpm test:file extensions/openrouter/index.test.ts extensions/moonshot/index.test.ts extensions/kimi-coding/implicit-provider.test.ts src/agents/pi-tools.read.repo-canonical.test.ts extensions/execution-platform/src/workflows/node-agent-session.test.ts`. |

**Focused Validation Run - 2026-06-11**

Passed:

`pnpm test:file src/agents/openai-transport-stream.test.ts src/agents/anthropic-transport-stream.test.ts src/agents/google-transport-stream.test.ts src/agents/pi-embedded-runner/run/attempt.test.ts src/agents/pi-embedded-runner/run.overflow-compaction.loop.test.ts src/agents/tools/repo-discovery-tools.test.ts src/agents/pi-tools.read.repo-canonical.test.ts src/config/sessions/managed-output.test.ts src/agents/bash-tools.test.ts src/agents/tools/lsp-tool.test.ts src/agents/pi-tools-agent-config.test.ts src/agents/pi-tools.node-authority-overlay.test.ts src/agents/openclaw-tools.update-plan.test.ts src/agents/tools/update-plan-tool.test.ts`

Additional focused read-continuation validation passed after the live proof
showed Kimi omitting `offset` despite the old continuation line:

`pnpm exec oxfmt --check src/agents/pi-tools.read.ts src/agents/pi-tools.read.repo-canonical.test.ts`

`pnpm test:file src/agents/pi-tools.read.repo-canonical.test.ts`

Additional focused Kimi implementation-prompt and proof-optic validation passed:

`pnpm test:file extensions/openrouter/index.test.ts extensions/moonshot/index.test.ts extensions/kimi-coding/implicit-provider.test.ts src/agents/pi-tools.read.repo-canonical.test.ts`

`pnpm test:file extensions/execution-platform/src/workflows/node-agent-session.test.ts`

Formatting check passed:

`pnpm exec oxfmt --check src/agents/openai-transport-stream.ts src/agents/openai-transport-stream.test.ts src/agents/anthropic-transport-stream.ts src/agents/anthropic-transport-stream.test.ts src/agents/google-transport-stream.ts src/agents/google-transport-stream.test.ts src/agents/pi-embedded-runner/run/attempt.ts src/agents/pi-embedded-runner/run.ts src/agents/pi-embedded-runner/run.overflow-compaction.loop.test.ts`

**Remaining Runtime Proof Gate**

The proposal is implemented at the code/focused-test layer. The remaining
end-to-end evidence is a live Work Queue delta proof showing:

- broad grep finds real matches before output cap;
- managed outputs can be read and grepped through normal source tools in the live worker session;
- read continuations in the live worker session include the exact next `read({...})` call shape, not only prose saying `Use offset=N`;
- compaction hands Kimi exact repair windows, not only refs/truncation markers;
- provider-bound request/response receipts show the intended tool catalog, stop reasons, and tool-call/result linkage;
- first edit occurs without context overflow;
- validation scout uses repo-native commands first;
- first model activation, first visible patch hypothesis, source calls before first edit, first edit after model activation, and path-only read repeats after exact continuation hints are visible in native trace optics;
- no failure is diagnosable as "the agent had context only as metadata or refs."

**Bottom Line**

The erratic proof performance is most likely coming from model-visible tool parity gaps, not from Kimi “not knowing how to code.” OpenCode’s loop works because tools return direct, usable evidence; bounds happen after useful work; compaction/truncation preserve readable artifacts; and the parent editor has a simple, obvious mutation path.

Our biggest remaining problem is that Kimi sometimes takes a legitimate navigation action and receives an ambiguous non-answer, metadata, refs, or truncated replay instead of usable source. That makes it rationally continue searching.

**Ranked Gaps**

1. **Grep/glob internals still differ from OpenCode**
   Priority: P0
   Impact: Very high
   Current problem: our grep pre-caps candidate files before searching, so a valid broad grep can return “search incomplete” with no matches. OpenCode searches scope first, then caps returned matches.
   Expected gain: biggest reduction in repeated grep/search loops.

2. **Managed-output and compaction readback are not OpenCode-native enough**
   Priority: P0
   Impact: Very high
   Current problem: OpenCode saves oversized output as a normal readable/searchable artifact. Our path still exposes refs, truncation framing, or replay markers that can make Kimi think it does not have source.
   Expected gain: major reduction in post-compaction and large-output context loops.

3. **Provider-visible tool catalog is still not proven at the exact Kimi request boundary**
   Priority: P0/P1
   Impact: High
   Current problem: tests prove internal catalog shape, but we still need redacted provider-bound receipts: ordered tool names, description hashes, schema hashes, mutation tools, LSP position.
   Expected gain: eliminates blind spots where config says one thing and Kimi sees another.

4. **Mutation tool choice differs from OpenCode**
   Priority: P1
   Impact: High
   Current problem: OpenCode does not generally expose every mutation path to every model. For non-GPT-like models, it tends toward `edit`/`write`, while our Kimi parent sees both `apply_patch` and `edit`, with `apply_patch` often prominent.
   Expected gain: cleaner edit-start behavior and less mutation-choice hesitation.

5. **Validation exec behavior is weaker than OpenCode shell behavior**
   Priority: P1
   Impact: Medium-high
   Current problem: validation scout still gets a generic exec surface. OpenCode’s shell guidance is explicit: don’t use shell for file search/read/edit, use workdir, avoid output-shrinking commands when full output is saved, and keep commands focused.
   Expected gain: fewer post-edit validation loops and fewer ad hoc TypeScript command failures.

6. **Raw Kimi/OpenRouter normalization is under-instrumented**
   Priority: P1/P2
   Impact: Medium, but could be very high if a hidden adapter bug exists
   Current problem: we do not yet have a shape-only raw-to-normalized receipt proving stop reason, tool calls, tool IDs, reasoning fields, and tool-result linkage at the exact provider boundary.
   Expected gain: catches hidden “model tried to finish but runtime treated it as tool use” or malformed tool-call issues.

7. **Todo/update_plan remains more workflow-shaped than OpenCode**
   Priority: P2
   Impact: Medium-low now
   Current problem: we reduced its authority, but it can still reflect acquisition-shaped work. It is probably no longer the root cause, but it can amplify a context loop.
   Expected gain: marginal compared with tool parity, but still worth keeping todo status-only.

**Proposal**

1. **Replace grep/glob internals with OpenCode-shaped behavior**
   Search the requested scope first, then cap returned matches. Do not cap candidate files before search confidence. Preserve state/runtime exclusions, but make broad grep a real search, not a partial candidate walk. For incomplete results, say incomplete only when the search itself truly did not complete, not because target files were skipped by preselection.

2. **Make managed outputs normal readable/searchable artifacts**
   If a tool says full output was preserved, the agent must be able to use normal `read` and `grep` against it. Keep `openclaw_resource_read` as an escape hatch, but do not make it the primary way Kimi rehydrates context. Copy OpenCode’s behavior: saved output should feel like a file.

3. **Make compaction continuation source-shaped**
   After compaction, the model should see exact changed files, failing diagnostics, and repair windows. Do not replay large old tool outputs as opaque truncation markers when the next action depends on source. Metadata and refs can remain durable, but the model-visible continuation must include usable code windows.

4. **Add provider-bound catalog receipts**
   For every Kimi run, record redacted diagnostics: model, reasoning settings, parallel tool calls, ordered tool names, description byte counts/hashes, schema byte counts/hashes, mutation tools, and LSP visibility/order. No prompt bodies or tool bodies. This tells us what Kimi actually saw.

5. **Simplify Kimi mutation affordance**
   For Kimi execution-coding, make `edit` the primary mutation tool. Either hide `apply_patch` unless patch mode is explicitly needed, or order `edit` before `apply_patch` for Kimi/non-GPT profiles. Keep `apply_patch` available for models or tasks where patch-native behavior is proven useful.

6. **Finish LSP as a first-class navigation tool**
   Ensure `lsp` is in the provider-visible catalog near source navigation tools. Keep output simple: symbol, kind, path, line/column range, container. No semantic graph framing. Large TypeScript navigation should go through LSP or file-scoped grep, not line-window walking.

7. **Make validation exec OpenCode-grade**
   Put the validation command menu in the `exec` tool description for validation scouts, not only in docs. Suppress process/background wording unless process tools are visible. Explicitly discourage shell for file search/read/edit. Prefer repo-native test commands before improvised `tsc` archaeology.

8. **Add raw Kimi response normalization receipts**
   Log shape only: raw finish reason, normalized stop reason, raw tool-call chunk count, normalized tool-call count, tool-call IDs, tool-result linkage, JSON-looking tool-call text, and reasoning field presence. Add a guard for `toolUse` stop reason without actual tool calls.

9. **Keep todo lightweight**
   Do not make todo a scheduler, gate, or phase machine. No special `inProgress:` authority line. Todo tracks conceptual deliverables only. Do not spend the next major slice here unless proof evidence shows it is still a primary trap.

**Success Gates**

- Broad grep finds real matches before output cap, instead of returning incomplete zero-match non-answers.
- Managed outputs can be read and grepped through normal source tools.
- After compaction, Kimi receives exact repair windows, not only refs/truncation markers.
- Provider-bound receipt proves Kimi sees `edit`, `read`, `grep`, `glob`, `lsp`, `task`, `update_plan`, and `node_finish` in the intended order.
- First edit occurs without context overflow.
- Validation scout uses repo-native commands first.
- No proof failure is diagnosable as “the agent had context only as metadata or refs.”

**Do Not Do Next**

Do not add more prompt nudges, hard decision gates, schema choke points, source-window coverage abstractions, or smaller read windows. The next long-running goal should be OpenCode parity in tool behavior and model-visible context shape.
