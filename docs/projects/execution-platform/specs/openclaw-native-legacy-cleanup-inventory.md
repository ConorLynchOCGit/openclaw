---
summary: "Durable cleanup and retirement inventory for native agentic orchestration, runtime-core extraction, run-once leaks, legacy deterministic front-door paths, and Product/Spec replay retirement."
title: "OpenClaw Native Legacy Cleanup Inventory"
---

# OpenClaw Native Legacy Cleanup Inventory

## Purpose

This inventory tracks the cleanup and deletion work required to make the native agentic orchestration architecture actually clean rather than merely patched.

The governing architecture specs are:

- [OpenClaw Native Agentic Orchestration Architecture](/projects/execution-platform/specs/openclaw-native-agentic-orchestration-architecture)
- [OpenClaw Native Agent Runtime Core And Envelopes](/projects/execution-platform/specs/openclaw-native-agent-runtime-core-and-envelopes)

The current answer to "are we architecturally clean now?" is:

> No. The architecture is materially cleaner, but not clean. We have removed the worst in-agent child run-once recursion from the native execution worker path and started the four-root path contract plus normalized `AgentRunRequest`. We still have runtime-core extraction, run-once compatibility, resident supervisor finalization, path leakage, proof acceptance, and deterministic legacy deletion work remaining.

Current cutover stance:

> Normal gateway/native execution must create native execution sessions and dispatch through the resident native worker supervisor. Legacy route/intake/scheduler, run-once, and replay surfaces may exist only as explicitly named compatibility/debug surfaces with deletion triggers. They must not be patched into a second canonical execution system.

## 2026-06-14 Foreground/Embedded Runtime Residue Inventory

This section is the current cleanup inventory for the remaining `runEmbeddedPiAgent(params)` / `RunEmbeddedPiAgentParams` / embedded-attempt residue.

The target is not to polish compatibility. The target is to race migrations first, then delete the old architecture ruthlessly.

Final invariant:

```text
Gateway boot/reload builds RuntimeGeneration.
Every execution envelope produces an accepted run / AgentTurn.
AgentRuntimeCore and InteractionRuntime run against the accepted turn and resident generation.
No live code constructs or forwards RunEmbeddedPiAgentParams.
No live code mocks or imports deleted embedded-attempt paths.
```

### Current Scan Snapshot

Current scan command:

```sh
rg -n "runEmbeddedPiAgent|RunEmbeddedPiAgentParams|agentRuntimeInvocationFromEmbeddedParams|AgentRuntimeInvocation|AgentRuntimeExecutionContext" src extensions
```

Current residue scope:

- 89 `src` / `extensions` files still contain one of the old embedded-param seams, including tests and docs-like harnesses.
- The non-test live residue is not one problem. It splits into foreground chat, background utility agents, plugin runtime API facades, extension-owned agent calls, legacy Execution Platform debug/old worker code, and core transitional runtime types.
- The first micro-cut is complete: `src/agents/agent-run-request.ts` no longer imports `RunEmbeddedPiAgentParams` just to borrow thinking/reasoning/trigger types. It now owns `AgentRunTrigger` and imports `ThinkLevel` / `ReasoningLevel` directly from `auto-reply/thinking`.
- The second micro-cut is complete: `src/agents/context-manager-runtime.ts` no longer imports `RunEmbeddedPiAgentParams` just to type compaction/context-pressure inputs. It now owns the narrow `ContextManagerRunParams` type containing only the fields context management actually consumes.
- The third micro-cut is complete: `src/agents/pi-embedded-runner/run/auth-controller.ts` no longer imports `RunEmbeddedPiAgentParams` just to borrow the optional config type. It imports `OpenClawConfig` directly.
- The fourth micro-cut is complete: `src/agents/interaction-runtime.ts` no longer imports `RunEmbeddedPiAgentParams` for native child task launch. Child launch uses the native `NativeChildSessionAgentRunParams` shape and passes it to the explicit legacy adapter only at the adapter call.
- The fifth micro-cut is complete: `src/agents/agent-runtime-invocation.ts` no longer imports or type-indexes `RunEmbeddedPiAgentParams`. The old wrapper can pass its object structurally, but the shared invocation/input type is now explicit native runtime surface, not a type alias for the legacy param bundle.
- The sixth cut is complete: `extensions/execution-platform/src/workflows/index.ts` no longer exports `./node-agent-session.ts`. The old node-agent-session implementation may remain until proof-gated deletion, but it is no longer part of the canonical workflows barrel.
- The seventh ruthless deletion is complete: `src/gateway/execution-platform-agent-team-runner.ts` and `src/gateway/execution-platform-agent-team-runner.test.ts` were deleted. Normal gateway/native execution had already been cut over to resident native execution session runtime jobs; the old agent-team runner was no longer production routing and only survived through tests/inventory.
- The eighth ruthless deletion is complete: `extensions/execution-platform/src/workflows/node-agent-session.ts` and `extensions/execution-platform/src/workflows/node-agent-session.test.ts` were deleted. The only live pieces were extracted into narrow current-owner files: `node-execution-snapshot.ts` for snapshot/storage metadata and `node-finish-tool.ts` for the native `node_finish` tool.
- The ninth ruthless deletion is complete: `extensions/execution-platform/src/workflows/architecture-residue-source-inventory.ts`, its test, and the two runnable architecture-residue inventory/model-audit scripts were deleted. This source scanner was auditing deleted legacy runner paths and had become stale deterministic cleanup machinery rather than a live runtime boundary. The obsolete architecture-residue source-inventory and model-audit runtime artifact contracts were also removed because their runnable producers are gone.
- The tenth ruthless deletion is complete: `extensions/execution-platform/src/workflows/production-workflow-execution-factory.ts` and its test were deleted. It was an unreferenced legacy replay/migration run-once layer with only local tests keeping it alive. Normal native execution already starts through resident start/status/control and the resident native worker supervisor.
- The protected-core correction is complete: core OpenClaw agent runtime tests under `src/agents/pi-embedded-runner*.test.ts` are not deletion targets just because they mention old names. They were kept/restored and migrated to mock `src/agents/interaction-attempt-runtime/attempt.ts` / `runInteractionAttempt` instead of the deleted `pi-embedded-runner/run/attempt.ts` shim. Cleanup must delete old execution-platform/native-launch architecture, not out-of-box chat/provider runtime coverage.
- The eleventh ruthless deletion is complete: `extensions/execution-platform/src/workflows/product-spec-proof-substrate.ts`, `extensions/execution-platform/src/workflows/boundary-replay-proof-gate.ts`, their tests, and `scripts/execution-platform-run-proof-framework-executor-subject-split-real-model-proof.mjs` were deleted. This was the old Product/Spec proof-admission island, not Product/Spec planning domain functionality.
- The first ruthless deletion is complete: `scripts/execution-platform-run-product-spec-boundary-replay.mjs`, `scripts/execution-platform-run-product-spec-checkpointed-test.mjs`, and `src/scripts/execution-platform-boundary-replay-terminalization.test.ts` were deleted. These scripts were old proof machinery, not the native orchestration proof path, and kept the old runner world artificially alive.
- The second ruthless deletion is complete: one-off Product/Spec replay/checkpointed closeout recorder scripts that only preserved old proof-script evidence were deleted. Deleted files: `scripts/execution-platform-record-product-spec-proof-substrate-scrub-closeout.mjs`, `scripts/execution-platform-record-proof-framework-executor-subject-split-closeout.mjs`, `scripts/execution-platform-record-proof-hardening-01-closeout.mjs`, `scripts/execution-platform-record-runtime-artifact-payload-store-closeout.mjs`, `scripts/execution-platform-record-supervision-model-call-progress-closeout.mjs`, `scripts/execution-platform-record-readback-replay-boundary-closeout.mjs`, and `scripts/execution-platform-record-architecture-transition-closure-gates-closeout.mjs`.
- The third ruthless deletion is complete: the remaining executable old replay queue/closeout mutation scripts were deleted. Deleted files: `scripts/execution-platform-record-product-spec-proof-substrate-scrub-queue.mjs` and `scripts/execution-platform-record-boundary-replay-checkpoints-closeout.mjs`.
- Remaining cleanup should not proceed as symbol renaming. Migrate live call clusters to explicit envelopes, then delete the old embedded-param files and compatibility exports.

Current live residue by owner:

| Owner cluster                                | Files currently carrying old seam                                                                                                                                                                                                                                                                                                                       | Current residue                                                                                                                              | Migration target                                                                                                                                                                                            | Delete/prune trigger                                                                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Public/plugin API facades                    | `src/extensionAPI.ts`, `src/plugins/runtime/types-core.ts`, `src/plugins/runtime/runtime-agent.ts`, `src/plugins/runtime/runtime-embedded-pi.runtime.ts`, `src/agents/pi-embedded-runtime.types.ts`                                                                                                                                                     | Public or plugin-injected `runEmbeddedPiAgent` surface keeps old host-side param semantics alive for trusted plugins/extensions.             | Replace with one runtime-owned agent envelope API that accepts an accepted run / `AgentTurn`-shaped request, or with focused non-agent provider utilities where tools/transcript/compaction are not needed. | No trusted plugin or extension imports/calls `runEmbeddedPiAgent`; extension API no longer exports it; plugin runtime no longer defines it.                              |
| Foreground chat / command execution          | `src/agents/command/attempt-execution.ts`, `src/auto-reply/reply/agent-runner-execution.ts`, `src/auto-reply/reply/agent-runner-memory.ts`, `src/auto-reply/reply/followup-runner.ts`, `src/agents/command/delivery.ts`, `src/agents/command/session-store.ts`                                                                                          | User-facing chat still calls old embedded runner or types its results from the old runner.                                                   | Chat envelope over `OpenClawAgentRuntime` / `AgentTurn`; command queue stays outside runtime execution; result typing moves to envelope/core result type.                                                   | Chat path has no direct `runEmbeddedPiAgent` import and no type-only return references to `pi-embedded`.                                                                 |
| Background/utility agents                    | `src/hooks/llm-slug-generator.ts`, `src/cron/isolated-agent/run-executor.ts`, `src/cron/isolated-agent/run-embedded.runtime.ts`, `src/commands/models/list.probe.ts`                                                                                                                                                                                    | Background jobs and probes still create old param bundles and can rediscover runtime state outside the resident generation.                  | Background envelope over resident runtime when tools/transcript/session state are required; direct provider/model utility when the job is just a one-shot model call.                                       | Utility/background call sites no longer import `runEmbeddedPiAgent`; probes do not launch full agents to validate provider availability unless that is the proof target. |
| Extension-owned agent calls                  | `extensions/active-memory/index.ts`, `extensions/llm-task/src/llm-task-tool.ts`, `extensions/voice-call/src/response-generator.ts`                                                                                                                                                                                                                      | Extension code calls `api.runtime.agent.runEmbeddedPiAgent`, preserving plugin-facing param bundles.                                         | Extension APIs call the new runtime-owned envelope or narrower provider utility. Active-memory and voice-call must preserve privacy/tool restrictions while losing embedded-param semantics.                | Extension code has no `runEmbeddedPiAgent` calls and tests mock the envelope/provider boundary, not old params.                                                          |
| Legacy Execution Platform debug / old worker | `src/gateway/execution-platform-agent-team-runner.ts`, `extensions/execution-platform/src/workflows/node-agent-session.ts`                                                                                                                                                                                                                              | Old worker/debug path still imports `RunEmbeddedPiAgentParams`, `runEmbeddedPiAgent`, and `agentRuntimeInvocationFromEmbeddedParams`.        | Proof-gated deletion, not renovation, unless a piece must migrate evidence into native start/status/control.                                                                                                | Representative native proof passes and old agent-team/node-agent-session code is deleted or reduced to audit-only fixtures.                                              |
| Core transitional runtime                    | `src/agents/agent-runtime-core.ts`, `src/agents/interaction-runtime.ts`, `src/agents/context-manager-runtime.ts`, `src/agents/agent-runtime-invocation.ts`, `src/agents/pi-embedded-runner/run.ts`, `src/agents/pi-embedded-runner/run/params.ts`, `src/agents/pi-embedded-runner/run/types.ts`, `src/agents/pi-embedded-runner/run/auth-controller.ts` | Core still supports `AgentRuntimeInvocation` / `AgentRuntimeExecutionContext` and old `RunEmbeddedPiAgentParams` where legacy callers enter. | `AgentRuntimeCore.run(turn)` only; `InteractionRuntime.run(turn)` only; context/auth/session helpers take narrow `AgentTurn` / prepared-context inputs; legacy wrapper deleted.                             | No runtime import of `AgentRuntimeInvocation`, `AgentRuntimeExecutionContext`, `agentRuntimeInvocationFromEmbeddedParams`, or `RunEmbeddedPiAgentParams`.                |
| Test/harness residue                         | `src/agents/pi-embedded-runner/*.test.ts`, `src/agents/pi-embedded-runner/run.*.test.ts`, `src/cron/isolated-agent*test*`, `src/auto-reply/*harness*`, extension tests                                                                                                                                                                                  | Tests mock or assert old internal seams, so they can keep obsolete behavior alive.                                                           | Re-home important behavior under `OpenClawAgentRuntime`, `AgentRuntimeCore`, `InteractionRuntime`, `ContextManager`, `ProviderClientRuntime`, or envelope tests; delete duplicate old API tests.            | Old runner tests are deleted or moved to current-owner directories; no test imports deleted attempt/backend paths.                                                       |

Current migration rule:

1. Migrate live production clusters first.
2. Delete old public/plugin API facades as soon as their extension callers move.
3. Delete old core transitional types only after all live callers stop speaking embedded params.
4. Delete or move tests in the same pass as the code they protect; do not rename old runner tests as a standalone activity.
5. Keep docs only when they describe the current runtime generation/envelope architecture or intentionally record deleted historical residue.

### Completed Micro-Cuts

| Surface                                                                                                                 | Completed cut                                                                                                                                                                                                                    | Guard                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/agents/agent-run-request.ts` old type dependency                                                                   | removed `RunEmbeddedPiAgentParams` import; native `AgentRunRequest` now owns `AgentRunTrigger` and uses direct `ThinkLevel` / `ReasoningLevel` types                                                                             | `rg "RunEmbeddedPiAgentParams" src/agents/agent-run-request.ts` should return no matches                                                                                                                                                                                               |
| `src/agents/context-manager-runtime.ts` old type dependency                                                             | removed `RunEmbeddedPiAgentParams` import; ContextManager now owns narrow `ContextManagerRunParams` for compaction/context-pressure callers                                                                                      | `rg "RunEmbeddedPiAgentParams                                                                                                                                                                                                                                                          | pi-embedded-runner/run/params" src/agents/context-manager-runtime.ts` should return no matches                                                                                                                                   |
| `src/agents/pi-embedded-runner/run/auth-controller.ts` old type dependency                                              | removed `RunEmbeddedPiAgentParams` import; auth controller now types config as `OpenClawConfig` directly                                                                                                                         | `rg "RunEmbeddedPiAgentParams                                                                                                                                                                                                                                                          | ./params.js" src/agents/pi-embedded-runner/run/auth-controller.ts` should return no matches                                                                                                                                      |
| `src/agents/interaction-runtime.ts` old type dependency                                                                 | removed `RunEmbeddedPiAgentParams` import from native child task launch; the child run path uses native child-session run params and crosses the legacy adapter only at `agentRuntimeInvocationFromEmbeddedParams`               | `rg "RunEmbeddedPiAgentParams                                                                                                                                                                                                                                                          | pi-embedded-runner/run/params" src/agents/interaction-runtime.ts` should return no matches                                                                                                                                       |
| `src/agents/agent-runtime-invocation.ts` old type dependency                                                            | removed `RunEmbeddedPiAgentParams` import and all type-indexing off the legacy param bundle; shared invocation now exposes explicit native fields plus `AgentRuntimeInvocationInputParams` for structural old-wrapper entry only | `rg "RunEmbeddedPiAgentParams                                                                                                                                                                                                                                                          | pi-embedded-runner/run/params" src/agents/agent-runtime-invocation.ts` should return no matches                                                                                                                                  |
| `extensions/execution-platform/src/workflows/index.ts` old worker exposure                                              | removed canonical barrel export for `node-agent-session.ts`; legacy file is no longer exported as a default workflow surface                                                                                                     | inventory test asserts `./node-agent-session.ts` is absent from workflow index                                                                                                                                                                                                         |
| `src/gateway/execution-platform-agent-team-runner.ts` old gateway runner island                                         | deleted old agent-team/native-session debug runner and its dedicated test; stale allowlists now assert absence instead of preserving it                                                                                          | inventory/no-semantic/import/artifact tests no longer treat the file as production code                                                                                                                                                                                                |
| `extensions/execution-platform/src/workflows/node-agent-session.ts` old node-session runner island                      | deleted old node-session runner and its dedicated test; extracted live snapshot/storage metadata into `node-execution-snapshot.ts` and live finish tool into `node-finish-tool.ts`                                               | inventory/no-semantic tests assert old file absence and new narrow files presence                                                                                                                                                                                                      |
| `extensions/execution-platform/src/workflows/architecture-residue-source-inventory.ts` stale deterministic residue gate | deleted stale source inventory, test, and runnable scripts; removed its source-inventory and model-audit runtime artifact contract entries                                                                                       | native cutover inventory and focused absence guards own current cleanup checks                                                                                                                                                                                                         |
| Product/Spec replay scripts                                                                                             | deleted old replay/checkpointed proof scripts and the script-specific terminalization test                                                                                                                                       | `test ! -f scripts/execution-platform-run-product-spec-boundary-replay.mjs && test ! -f scripts/execution-platform-run-product-spec-checkpointed-test.mjs && test ! -f src/scripts/execution-platform-boundary-replay-terminalization.test.ts`                                         |
| Product/Spec replay closeout recorders                                                                                  | deleted one-off old closeout recorder scripts tied to replay/checkpointed proof evidence                                                                                                                                         | `rg -l "execution-platform-run-product-spec-boundary-replay                                                                                                                                                                                                                            | execution-platform-run-product-spec-checkpointed-test" scripts` should return only intentionally retained non-closeout migration/audit scripts, preferably none                                                                  |
| Product/Spec replay queue/closeout mutation scripts                                                                     | deleted the remaining old runnable replay queue/closeout scripts that could mutate Work Queue state outside the native runtime proof path                                                                                        | `test ! -f scripts/execution-platform-record-product-spec-proof-substrate-scrub-queue.mjs && test ! -f scripts/execution-platform-record-boundary-replay-checkpoints-closeout.mjs`                                                                                                     |
| Protected core test seam migration                                                                                      | restored/kept core OpenClaw embedded-runner behavior tests and migrated their mocks from deleted `run/attempt.js` / `runEmbeddedAttempt` to current `interaction-attempt-runtime/attempt.js` / `runInteractionAttempt`           | `rg "pi-embedded-runner/run/attempt\\.js                                                                                                                                                                                                                                               | runEmbeddedAttempt" src/agents/model-fallback.run-embedded.e2e.test.ts src/agents/pi-embedded-runner.e2e.test.ts src/agents/pi-embedded-runner.run-embedded-pi-agent.auth-profile-rotation.e2e.test.ts` should return no matches |
| Product/Spec proof-admission island                                                                                     | deleted old Product/Spec proof substrate, boundary replay proof gate, their tests, and the proof-framework executor-subject-split real-model proof script                                                                        | `test ! -f extensions/execution-platform/src/workflows/product-spec-proof-substrate.ts && test ! -f extensions/execution-platform/src/workflows/boundary-replay-proof-gate.ts && test ! -f scripts/execution-platform-run-proof-framework-executor-subject-split-real-model-proof.mjs` |

### Already Deleted, Keep Deleted

These surfaces have no legitimate future role. Any reintroduction is a regression.

| Surface                                                                                      | Current disposition                                                      | Guard                                                      |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `src/agents/runtime-agent-executor.ts`                                                       | deleted; pass-through executor removed                                   | inventory test asserts file absence                        |
| `src/agents/runtime-agent-executor.test.ts`                                                  | deleted with implementation                                              | do not add a replacement for a deleted layer               |
| `src/agents/pi-agent-attempt-runtime.ts`                                                     | deleted; old attempt owner removed                                       | inventory test asserts file absence                        |
| `src/agents/pi-agent-attempt-runtime/attempt.ts`                                             | deleted; shim removed                                                    | inventory test asserts file absence                        |
| `src/agents/pi-embedded-runner/interaction-runtime.ts`                                       | deleted; one-line interaction alias removed                              | inventory test asserts file absence                        |
| `src/agents/pi-embedded-runner/run/attempt.ts`                                               | deleted; attempt shim removed                                            | inventory test asserts file absence                        |
| `src/agents/pi-embedded-runner/run/backend.ts`                                               | deleted; provider client now owns attempt dispatch                       | inventory test asserts file absence                        |
| `extensions/execution-platform/src/workflows/production-workflow-execution-factory.ts`       | deleted; old replay/migration run-once layer removed                     | inventory test asserts file absence                        |
| `extensions/execution-platform/src/workflows/product-spec-proof-substrate.ts`                | deleted; old Product/Spec proof-admission substrate removed              | inventory test asserts file absence                        |
| `extensions/execution-platform/src/workflows/boundary-replay-proof-gate.ts`                  | deleted; old replay proof-admission gate removed                         | inventory test asserts file absence                        |
| `scripts/execution-platform-run-proof-framework-executor-subject-split-real-model-proof.mjs` | deleted; old proof-framework executor-subject-split proof script removed | absence guard keeps it out                                 |
| `embeddedParamsFromAgentRuntimeInvocation()`                                                 | deleted; reverse adapter removed                                         | search/inventory test should keep it absent                |
| `runEmbeddedPiAgentCore()`                                                                   | deleted; redundant foreground wrapper removed                            | search/inventory test should keep it absent                |
| `runEmbeddedPiAgentInteractionRuntime()`                                                     | deleted; interaction runtime has one primary export                      | search/inventory test should keep it absent                |
| `runEmbeddedAttempt` export alias                                                            | deleted; `runInteractionAttempt` is canonical                            | search/inventory test should keep executable export absent |

### Production Callers To Migrate Before Deleting `runEmbeddedPiAgent`

These are the remaining non-test direct callers found by repo scan. They should be migrated in clusters, not one at a time.

| Cluster                                              | Current files                                                                                                                                                                         | Migration target                                                                                                                                                                        | Delete after migration                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Foreground chat / command execution                  | `src/agents/command/attempt-execution.ts`, `src/auto-reply/reply/agent-runner-execution.ts`, `src/auto-reply/reply/agent-runner-memory.ts`, `src/auto-reply/reply/followup-runner.ts` | chat envelope builds an accepted run / `AgentTurn`; foreground command queue remains outside runtime core                                                                               | direct `runEmbeddedPiAgent(...)` calls, chat-owned param bundles |
| Auto-reply test harness plumbing                     | `src/auto-reply/reply.test-harness.ts`, `src/auto-reply/reply.triggers.trigger-handling.test-harness.ts`                                                                              | mock the chat envelope or `OpenClawAgentRuntime`, not `runEmbeddedPiAgent`                                                                                                              | mock surfaces named `runEmbeddedPiAgent`                         |
| Utility/background one-shot agents                   | `src/hooks/llm-slug-generator.ts`, `extensions/llm-task/src/llm-task-tool.ts`, `src/cron/isolated-agent/run-executor.ts`, `src/commands/models/list.probe.ts`                         | background envelope over `OpenClawAgentRuntime` if they need tools/transcript; otherwise direct provider utility if they only need a one-shot model call                                | direct `runEmbeddedPiAgent(...)` calls                           |
| Extension-owned agent surfaces                       | `extensions/active-memory/index.ts`, `extensions/voice-call/src/response-generator.ts`                                                                                                | extension API calls a runtime-owned agent envelope; extension should not carry embedded param semantics                                                                                 | `params.api.runtime.agent.runEmbeddedPiAgent` facade             |
| Legacy execution-platform debug / old worker surface | `src/gateway/execution-platform-agent-team-runner.ts`, `extensions/execution-platform/src/workflows/node-agent-session.ts`                                                            | delete with old deterministic/legacy execution system after native proof, or migrate any still-required path to native RuntimeJob + `OpenClawAgentRuntime.runAcceptedNativeExecution()` | `RunEmbeddedPiAgentParams` types and old embedded worker input   |

Migration rule:

- If a caller needs normal user-facing chat semantics, migrate to a `chat` envelope.
- If a caller needs a scheduled/background model run, migrate to a `background` or `runtime_job` envelope.
- If a caller is an old execution-platform debug/proof path, delete it after representative native proof instead of renovating it.
- If a caller does not actually need agent tools, transcript, compaction, or session state, replace it with a narrow provider/model utility call instead of wrapping it in a fake agent run.

### Core/Internal Surfaces To Delete After Caller Migration

These are not durable architecture. They exist only because live callers still speak old param-bundle language.

| Surface                                                       | Why it remains                                                                                        | Deletion trigger                                                                                       |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/agents/pi-embedded-runner/run.ts`                        | foreground command-lane wrapper for old chat/utility callers                                          | all callers use explicit envelopes over `OpenClawAgentRuntime`                                         |
| `src/agents/pi-embedded-runner/run/params.ts`                 | giant old param bundle                                                                                | no production code imports `RunEmbeddedPiAgentParams`                                                  |
| `src/agents/pi-embedded-runtime.types.ts`                     | type facade for old embedded runtime API                                                              | extension APIs stop exposing `runEmbeddedPiAgent`                                                      |
| `src/agents/agent-runtime-invocation.ts`                      | transitional adapter from embedded params to core input                                               | `AgentRuntimeCore` accepts only `AgentTurn`; no caller uses `agentRuntimeInvocationFromEmbeddedParams` |
| `AgentRuntimeInvocation` / `AgentRuntimeExecutionContext`     | mirror of old embedded params inside the core                                                         | `InteractionRuntime` accepts `AgentTurn` directly                                                      |
| `agentRuntimeInvocationFromEmbeddedParams(...)`               | forward adapter for old param bundle                                                                  | no live caller uses `RunEmbeddedPiAgentParams`                                                         |
| `src/agents/interaction-runtime.ts` child launch adapter call | child task launch still adapts child native params through `agentRuntimeInvocationFromEmbeddedParams` | child launch produces an accepted child `AgentTurn` directly                                           |

### Test And Mock Residue

Current test residue is not harmless. It keeps old seams mentally alive and can hide runtime-boundary regressions.

| Residue                                                          | Current files                                                                                                                                                                                             | Target                                                                                                                                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Deep provider-attempt mocks with old names                       | `src/agents/pi-embedded-runner.e2e.test.ts`, `src/agents/model-fallback.run-embedded.e2e.test.ts`, `src/agents/pi-embedded-runner.run-embedded-pi-agent.auth-profile-rotation.e2e.test.ts`                | rename mocks to `runInteractionAttemptMock` or move seam higher to `ProviderClientRuntime` / `AgentRuntimeCore` where the test does not specifically need attempt internals |
| Attempt tests under old directory names                          | `src/agents/pi-embedded-runner/run/attempt.*.test.ts`                                                                                                                                                     | move to `src/agents/interaction-attempt-runtime/` or a runtime-module test directory; keep only tests that prove current behavior                                           |
| Overflow fixtures with old field names                           | `src/agents/pi-embedded-runner/run.overflow-compaction.fixture.ts`, `src/agents/pi-embedded-runner/run.overflow-compaction.test.ts`, `src/agents/pi-embedded-runner/run.overflow-compaction.loop.test.ts` | rename to interaction/provider-attempt terminology or move to ContextManager tests                                                                                          |
| Test descriptions that say `runEmbeddedAttempt`                  | spawn workspace, memory flush, cache TTL, timeout, context-engine, bootstrap tests                                                                                                                        | rename descriptions when files move; do not spend time renaming if the file will be deleted/replaced in the same cut                                                        |
| Tests that call `runEmbeddedPiAgent(...)` as the unit under test | many `src/agents/pi-embedded-runner/*.test.ts` files                                                                                                                                                      | migrate representative behavior tests to `OpenClawAgentRuntime` / `AgentRuntimeCore` / envelope tests, then delete duplicate old runner tests                               |

Test migration rule:

- Do not keep a test only to preserve old API behavior.
- If the behavior matters, re-home the test at the current owner.
- If the behavior is covered by native runtime tests or core module tests, delete the old runner test.
- Do not rename old files as a standalone activity; move or delete them in the same pass.
- Do not delete protected core OpenClaw chat/provider runtime tests merely to increase line deletion counts. Migrate their seams to current runtime owners first, then delete only duplicate old-API tests when equivalent coverage exists.

### Fast Migration Order

The fastest low-waste order is:

1. **Test seam cleanup now.**
   - Finish moving mocks off deleted paths.
   - Rename or move deep attempt mocks only where those tests still matter.
   - Delete stale residue inventory entries that point at deleted files.
   - Add boundary assertions that deleted shim paths remain absent.

2. **Create one real foreground/background envelope path, not another adapter.**
   - The envelope takes the fields old chat/background callers actually need.
   - The envelope builds an accepted run / `AgentTurn` against the resident runtime.
   - The foreground command queue remains outside runtime execution.
   - No `RunEmbeddedPiAgentParams` shape crosses the envelope boundary.

3. **Batch-migrate foreground chat callers.**
   - Move `attempt-execution`, auto-reply execution, memory reply, and follow-up runner together.
   - Validate chat/model interaction behavior once for the cluster.

4. **Batch-migrate utility/background callers.**
   - Move slug generation, LLM task tool, isolated cron agent, model-list probe, active-memory, and voice-call together.
   - Where a caller does not need tools/transcript/compaction, replace with a narrow provider utility rather than an agent envelope.

5. **Retire execution-platform legacy/debug callers.**
   - After the representative native proof passes, delete the old agent-team runner/node-agent-session paths that still depend on `RunEmbeddedPiAgentParams`.
   - Do not renovate them unless needed to bridge data into native start/status/control.

6. **Delete the old param-bundle architecture.**
   - Delete `runEmbeddedPiAgent`.
   - Delete `RunEmbeddedPiAgentParams`.
   - Delete `agentRuntimeInvocationFromEmbeddedParams`.
   - Delete `AgentRuntimeInvocation` and `AgentRuntimeExecutionContext`.
   - Delete `pi-embedded-runtime.types.ts`.
   - Remove `pi-embedded-runner/run.ts` if no foreground shell remains.
   - Remove old runner tests that only prove deleted API behavior.

7. **Run hard absence gates.**
   - `rg "runEmbeddedPiAgent\\(" src extensions` should return no production callers.
   - `rg "RunEmbeddedPiAgentParams" src extensions` should return no production callers.
   - `rg "agentRuntimeInvocationFromEmbeddedParams|AgentRuntimeInvocation|AgentRuntimeExecutionContext" src extensions` should return no runtime callers.
   - `rg "pi-agent-attempt-runtime|pi-embedded-runner/interaction-runtime|pi-embedded-runner/run/attempt\\.ts|runtime-agent-executor" src extensions` should return only negative inventory assertions, not live code.

### Current Risk Assessment

This cleanup is not just aesthetic. The current residue creates concrete failure risks:

- old e2e tests can mock deep internals and miss provider/client/runtime-boundary changes;
- old foreground callers can keep discovering config/model/provider state outside resident `RuntimeGeneration`;
- old param bundles can reintroduce path/auth/tool/prompt fields that the final runtime is supposed to own;
- old child-launch adapters can rebuild runtime state instead of referencing an accepted child turn;
- old test names and fixtures make deleted architecture look alive, encouraging future repairs in the wrong place.

The strongest simplification remains:

> Migrate live foreground/background callers to `AgentTurn` envelopes first, then delete every old embedded-param symbol and file in one cleanup pass.

This document exists so cleanup does not become conversational residue or an unbounded backlog. It separates immediate leaks from proof-gated deletion.

## Cleanup State Vocabulary

- `active_before_next_proof`: must be fixed before the next representative native orchestration proof can be trusted.
- `transitional_allowed`: acceptable only as a short bridge while the native path is being proven.
- `proof_gated_delete`: delete or hard-disable only after representative native proofs pass and live callers are migrated.
- `retain_domain_surface`: do not delete; this is product/domain functionality, not the obsolete proof/runtime mechanism.
- `audit_required`: inventory is known incomplete enough that a code audit must precede deletion.

## Non-Negotiable Cleanup Principles

1. Do not leave two canonical execution systems.
2. Do not make proof harnesses execute jobs directly.
3. Do not preserve deterministic semantic runners as hidden fallbacks after native proofs pass.
4. Do not delete Product/Spec Planning domain functionality just because Product/Spec boundary replay is retired.
5. Do not patch old route/intake/scheduler systems into being "good enough" unless the patch is required to bridge into native session start/status/control.
6. Do not introduce new durable orchestration objects while deleting old ones.
7. Every retained compatibility surface needs an owner, reason, and deletion trigger.

## Cutover Deletion Schedule

This schedule exists because compatibility surfaces are not allowed to fade into permanent architecture.

| Surface                                                             | Current state        | Owner                              | Allowed use before deletion                                                                                               | Deletion trigger                                                                                                                                                          |
| ------------------------------------------------------------------- | -------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/execution-platform/queue-runner/run-once`                     | `debug_compat_only`  | Execution Platform runtime cleanup | Explicit legacy/debug host-route tests or migration only. It is not registered in the normal gateway route matcher.       | Representative native proof passes through resident start/status/control; no live caller requires run-once.                                                               |
| `runGatewayNativeExecutionSessionRuntimeJobOnce(...)`               | `debug_compat_only`  | Execution Platform runtime cleanup | Compatibility alias over native `runNext`/resident supervisor dispatch for old tests/migration only.                      | Proof harness and native RPC never call it; all tests use start/status/control or direct supervisor dispatch.                                                             |
| `runGatewayAgentTeamRuntimeJobOnce(...)`                            | `legacy_resume_only` | Execution Platform runtime cleanup | Existing legacy human-decision resume for old `executor.agent_team` jobs only. No new native execution path may call it.  | Legacy human-decision jobs are migrated or retired; native closeout/control covers the resume case.                                                                       |
| `ProductionWorkflowExecutionFactory.runOnce(...)`                   | `deleted`            | Execution Platform runtime cleanup | None. The old replay/migration run-once layer is gone.                                                                    | Already deleted; keep absence guarded.                                                                                                                                    |
| Product/Spec boundary replay scripts                                | `deleted`            | Execution Platform runtime cleanup | None. Historical references may remain only in old docs/audit records.                                                    | Completed: old replay/checkpointed scripts deleted.                                                                                                                       |
| Deterministic front-door router/intake/scheduler small-verb runners | `proof_gated_delete` | Execution Platform runtime cleanup | Explicit compatibility gate, migration, or audit only. No new feature work.                                               | Native main/orchestrator routing and child sessions prove equivalent or better coverage.                                                                                  |
| Front-door compiled/router artifacts                                | `audit_only`         | Execution Platform runtime cleanup | Bounded audit/debug evidence only. Native sessions must point model-facing refs at `execution.front_door.native_handoff`. | Artifact retention/pruning policy proves native handoff plus runtime events are sufficient; then prune old verbose artifacts or retain only minimal historical manifests. |

Any new call site into these surfaces must be treated as a regression unless it is labeled `compatibility`, `debug`, `replay`, or `migration` and includes its deletion trigger.

## Current Required Gap Set

These are the six active gaps already recorded in the runtime-core/envelope spec. They remain the top-level cleanup schedule.

1. `AgentRuntimeCore` boundary is introduced and observable, but full shared-core service extraction is not complete.

   Current status: `active_before_next_proof`

   Evidence:
   - `src/agents/agent-runtime-core.ts` introduces `AgentRuntimeCore`.
   - `RuntimeAgentExecutor` and the redundant embedded-core wrapper have been deleted.
   - `OpenClawAgentRuntime.runAcceptedNativeExecution()` builds `AgentTurn` for native RuntimeJobs.
   - `runEmbeddedPiAgent(params)` still adapts foreground/legacy callers through `agentRuntimeInvocationFromEmbeddedParams(...)`.
   - Provider/tool/transcript/context-pressure mechanics have been pulled into shared runtime modules, but foreground/legacy callers still enter through the old param bundle.
   - Runtime-core receipts must not store raw prompts, raw responses, raw provider logs, or raw tool logs.

   Required completion state:
   - finish the shared `AgentRuntimeCore` service boundary;
   - convert wrapped service IDs into owned shared services as each extraction lands;
   - keep `OpenClawAgentRuntime` as the envelope-facing accepted-run/runtime-generation entry;
   - move provider/tool/transcript/context-pressure mechanics behind shared services instead of leaving them as envelope-owned or runner-owned behavior;
   - keep foreground chat as a queued wrapper over the same core;
   - keep native execution as a RuntimeJob-owned envelope over the same core.

2. Native in-agent child launch still had a `runGatewayNativeExecutionSessionRuntimeJobOnce` call inside `execution-platform-agent-team-runner.ts`.

   Current status: mostly completed for the in-agent native child launch path; keep under audit until proof passes.

   Current implementation state:
   - `embeddedRunParams.nativeExecutionSession.startExecutionSession` now calls `startNativeExecutionSession(...)`, then uses `input.launchNativeExecutionSession(...)` when available.
   - It returns scheduled child readback with `runStatus`, `runCompleted: false`, and bounded `runReasonCodes`.
   - It no longer synchronously runs the child job inline from inside the parent agent tool call.

   Remaining audit:
   - Prove child blocking terminality through shared finish/runtime evidence rather than synchronous nested execution.
   - Prove the parent model/tool call does not wait for child execution inline.
   - Keep watching for other child-launch call sites that reintroduce synchronous run-once behavior.

3. `RuntimeWorkerSupervisor` is still effectively invoked through wake/run-once mechanics, but accepted front-door submits now schedule native sessions.

   Current status: `active_before_next_proof`

Current implementation state:

- `ResidentNativeExecutionWorkerSupervisor` exists in `src/gateway/execution-platform-http.ts`.
- It has `wake(...)` for specific child jobs and `wakeQueue(...)` for queue-draining top-level dispatch.
- It now calls `runGatewayNativeExecutionSessionRuntimeJob(...)`, which uses `RuntimeWorkerSupervisor.runNext(...)`.
- `NativeExecutionRpcService.submit(...)` now converts accepted front-door execution decisions into `openclaw.native_execution_session` jobs and schedules the resident native execution worker.
- Main chat front-door handoff now reports scheduled native session status instead of invoking `ProductionWorkflowExecutionFactory.runOnce(...)` inline.
- Normal gateway path matching no longer includes `/api/execution-platform/queue-runner/run-once`.
- `createExecutionPlatformHostRoutes(...)` registers the run-once route only when `enableLegacyQueueRunnerRunOnce` is explicitly true.
- `src/gateway/execution-platform-http.ts` no longer wires normal route dependencies for `agentTeamRuntimeRunOnce` or `nativeExecutionSessionRuntimeRunOnce`.
- `runGatewayNativeExecutionSessionRuntimeJobOnce(...)` remains as a compatibility wrapper.
- `RuntimeWorkerSupervisor.runOnce(...)` remains as a compatibility alias over `runNext(...)`.

  Required completion state:
  - resident `NativeExecutionWorkerSupervisor` owns dispatch for native execution jobs;
  - HTTP/RPC only starts, polls, or controls;
  - proof harness only starts, polls, controls, and asserts;
  - `runOnce` remains only as a legacy/debug compatibility helper until callers are migrated;
  - production native execution does not rely on long-running route handlers or synchronous nested run-once calls.

4. Old deterministic route/intake/scheduler/Product-Spec replay paths still exist.

   Current status: `proof_gated_delete`

   Required completion state:
   - pass representative native orchestration proof first;
   - migrate required callers to native sessions/start-status-control;
   - retire Product/Spec replay as canonical proof path;
   - retire deterministic route/intake/scheduler brains as canonical execution paths;
   - delete dead compatibility code once no live caller depends on it.

5. Path model is improved but not fully collapsed everywhere.

   Current status: `active_before_next_proof`

   Current implementation state:
   - `resolveRuntimeAgentWorkspaceRoots(...)` exists and returns `canonicalSourceRoot`, `runtimeWorkspaceDir`, `transcriptRoot`, and `artifactRoot`.
   - Native session file paths now route through runtime-owned transcript roots.
   - Some adapter code still consumes older `workspaceDir`, `agentDir`, source/runtime path concepts because lower-level embedded-runner params have not fully moved to the four-root contract.

   Required completion state:
   - caller-visible native runtime path contract is only `canonicalSourceRoot`, `runtimeWorkspaceDir`, `transcriptRoot`, and `artifactRoot`;
   - older path details stay inside the locator/envelope adapter only;
   - native execution does not assume sessions live beside agent assets;
   - model-visible/status/proof payloads do not expose extra path concepts unless needed as bounded diagnostics.

6. Proof has not been rerun after the latest scheduling/path/request changes.

   Current status: `active_before_next_proof`

   Required completion state:
   - rebuild/reload the runtime when code changes require it;
   - run the representative native orchestration proof through resident gateway/native RPC;
   - prove start/status/control-only proof behavior;
   - prove first model activity and native launch optics;
   - prove terminal finish/evidence behavior;
   - record failure assessment and continue repair if proof fails.

## Immediate Cleanup Inventory

### Runtime-Core Boundary

State: `active_before_next_proof`

Current files:

- `src/agents/pi-embedded-runner/run.ts`
- `src/agents/pi-embedded-runner/run/params.ts`
- `src/agents/agent-runtime-invocation.ts`
- `src/agents/interaction-runtime.ts`

Current problem:

- `AgentRuntimeCore` is the native runtime core, and pass-through executor/shim layers have been deleted.
- The remaining impurity is the old foreground/legacy param bundle.
- `runEmbeddedPiAgent(params)` still adapts legacy callers into `AgentRuntimeCore`.
- `agentRuntimeInvocationFromEmbeddedParams(...)` and `AgentRuntimeInvocation` mirror old params inside the runtime boundary.
- `InteractionRuntime` and `ContextManager` still carry some `RunEmbeddedPiAgentParams`-derived types for legacy child/foreground compatibility.

Target:

- Finish `AgentRuntimeCore` as a shared runtime service.
- Move foreground/chat/background callers to explicit envelopes that build accepted runs / `AgentTurn`.
- Make `InteractionRuntime` accept native turn/runtime input directly.
- Delete `RunEmbeddedPiAgentParams`, `agentRuntimeInvocationFromEmbeddedParams`, `AgentRuntimeInvocation`, and `AgentRuntimeExecutionContext`.
- Keep no pass-through executor or embedded-core compatibility layer.

Deletion trigger:

- All chat/native/proof/background execution wrappers call the same `OpenClawAgentRuntime` / `AgentRuntimeCore` boundary.
- Tests prove native and chat wrappers share core mechanics while keeping separate lifecycle policy.

### Resident Native Worker Dispatch

State: `active_before_next_proof`

Current files:

- `src/gateway/execution-platform-http.ts`
- `src/gateway/execution-platform-agent-team-runner.ts`
- `extensions/execution-platform/src/intent-routing/native-execution-rpc.ts`
- `scripts/execution-platform-run-native-orchestration-proof.mjs`

Current problem:

- `ResidentNativeExecutionWorkerSupervisor` exists and calls the native job runner entrypoint.
- The native job runner still uses a per-call `RuntimeWorkerSupervisor` instance rather than a long-lived typed worker service with explicit lifecycle.
- `/api/execution-platform/queue-runner/run-once` still exists as a route-level execution surface.
- Canonical proof must not depend on long-running route handlers or source-runner cold execution.

Target:

- Resident native worker supervisor owns job dispatch.
- Native RPC start only creates/wakes.
- Status/control endpoints only project/control runtime truth.
- Proof harness starts, polls, controls, and asserts only.
- `runOnce` is legacy/debug only.

Deletion trigger:

- Representative native orchestration proof passes through resident gateway/native RPC start/status/control.
- No production/native proof path calls the run-once route for normal execution.

### Chat Front-Door Compatibility Leak

State: mostly completed for normal native execution submit; keep under audit until proof passes.

Current file:

- `src/gateway/server-methods/chat.ts`

Previous problem:

- The chat path still imports `ProductionWorkflowExecutionFactory`.
- Around the current production execution handoff path, it constructs `ProductionWorkflowExecutionFactory` and passes `nativeExecutionSessionRuntimeRunOnce` that calls `runGatewayNativeExecutionSessionRuntimeJobOnce(...)`.
- That is a compatibility bridge from the old front-door workflow system into native execution. It is not the final main-orchestrator native start/status/control shape.

Current implementation state:

- Main chat execution routing no longer imports or constructs `ProductionWorkflowExecutionFactory` for accepted native execution submit.
- Accepted front-door submit now starts an `openclaw.native_execution_session` job, records front-door artifacts, schedules the resident native execution worker, and returns scheduled session readback.
- Native submit no longer exposes legacy worker-adapter readiness fields such as `workerContractState`, `workerAdapterId`, or `workerAdapterRegistry`; legacy adapter readiness remains only in explicit legacy worker-adapter fixtures/projections.
- Source prompt/auth/front-door compile evidence remains in bounded audit artifacts rather than being copied into the native session payload.
- Native session payloads now point model-facing refs at compact `execution.front_door.native_handoff`, not old compiled/router artifacts.
- The compact native handoff avoids legacy small-verb vocabulary and identifies old front-door artifacts only as audit evidence.
- Human-decision resume still uses the legacy agent-team runner for legacy jobs and remains a separate compatibility lane.

Target:

- Chat/main orchestrator should use the native start/resume session tool/RPC path.
- Long-running execution should be owned by RuntimeJob + resident native worker supervisor.
- Chat should report scheduled status and then read closeout/status, not run the workflow inline.
- Legacy human-decision resume and route/intake/scheduler compatibility lanes should be migrated or retired after representative native proofs pass.

Deletion trigger:

- Main chat execution routing no longer constructs `ProductionWorkflowExecutionFactory` for native execution.
- Compatibility gate remains only for explicit legacy replay/migration.

### Path Contract Collapse

State: `active_before_next_proof`

Current files:

- `src/agents/runtime-workspace-locator.ts`
- `src/agents/native-execution-session-paths.ts`
- `src/gateway/execution-platform-agent-team-runner.ts`
- `src/gateway/execution-platform-http.ts`
- `scripts/execution-platform-run-native-orchestration-proof.mjs`

Current problem:

- Four-root contract exists.
- Some adapter internals still pass `workspaceDir` and `agentDir` because `RunEmbeddedPiAgentParams` requires them.
- Model/status/proof-visible events should use the four-root contract unless a legacy/debug path is explicitly labeled.

Target:

- Public/native runtime path readback uses only:
  - `canonicalSourceRoot`
  - `runtimeWorkspaceDir`
  - `transcriptRoot`
  - `artifactRoot`
- Older names are adapter-internal only.
- Bounded diagnostics may mention resolution source, but should not become a second path contract.

Deletion trigger:

- Tests prove launch receipts/status/proof summaries expose only the four-root contract unless a legacy/debug path is explicitly labeled.

### Native Orchestration Proof Harness

State: `active_before_next_proof`

Current file:

- `scripts/execution-platform-run-native-orchestration-proof.mjs`

Current problem:

- The proof script is the intended new proof harness, but it must remain a thin client.
- It must not grow execution authority, cold imports, source-runner fallback, or workflow decisions.

Target:

- Start via resident gateway/native RPC.
- Poll status/readback via runtime events.
- Control via runtime control endpoint.
- Assert artifacts/terminal state.
- Label any fallback path as `cold_source_runtime_fallback`.

Deletion trigger:

- The proof artifact shows start/status/control-only behavior and phase-separated timing.

## Proof-Gated Deletion Inventory

These surfaces must not be kept as permanent parallel systems. They should be deleted or hard-disabled after representative native proofs pass and live callers are migrated.

### Product/Spec Boundary Replay As Canonical Proof Path

State: `proof_gated_delete`

Known files/scripts:

- `scripts/execution-platform-run-product-spec-boundary-replay.mjs`
- `scripts/execution-platform-run-product-spec-checkpointed-test.mjs`
- `extensions/execution-platform/src/workflows/boundary-replay-checkpoints.ts`
- `extensions/execution-platform/src/workflows/boundary-replay-registry.ts`
- `extensions/execution-platform/src/workflows/boundary-replay-proof-gate.ts`
- `extensions/execution-platform/src/workflows/product-spec-proof-substrate.ts`
- `extensions/execution-platform/src/work-queue/projections/boundary-replay-readback.ts`

Current problem:

- Product/Spec replay was useful as a deterministic proof harness, but it must not remain a parallel canonical path after native orchestration proof acceptance.

Target:

- Retire Product/Spec replay as canonical proof path.
- Keep only historical fixtures/artifacts needed for migration comparison.
- Delete replay execution paths once native proofs cover equivalent acceptance.

Do not delete:

- Product/Spec Planning domain/product surfaces that remain valid product functionality.
- Product/Spec workflow contract code that is still used by live domain workflows and is not part of the old deterministic proof harness.

### Deterministic Front-Door Router

State: `proof_gated_delete`

Known files:

- `extensions/execution-platform/src/intent-front-door/router-stage-runner.ts`
- `extensions/execution-platform/src/intent-front-door/structured-model-intent-router.ts`
- `extensions/execution-platform/src/intent-front-door/two-lane-structured-router-provider.ts`
- `extensions/execution-platform/src/intent-front-door/live-structured-router-provider.ts`
- `extensions/execution-platform/src/intent-front-door/router-runtime-tools.ts`
- `extensions/execution-platform/src/intent-front-door/router-tool-protocol.ts`
- related router eval/shadow/canary test files under `extensions/execution-platform/src/intent-front-door/`

Current problem:

- The deterministic/small-verb front door can remain as eval/history, but it must not be canonical runtime meaning ownership.

Target:

- Main agent/orchestrator decides answer-now vs native execution session.
- Old router remains behind explicit compatibility gate only until native proof and migration are complete.

Deletion trigger:

- `legacy_front_door_execution_compatibility` is disabled for normal chat.
- Native main-orchestrator routing has representative proof coverage.

### RequirementMap Intake

State: `proof_gated_delete`

Known files:

- `extensions/execution-platform/src/workflows/intake-stage-runner.ts`
- `extensions/execution-platform/src/workflows/requirement-map.ts`
- `extensions/execution-platform/src/workflows/intake-stage-runner.test.ts`
- `docs/projects/execution-platform/specs/requirement-map-intake-decomposition.md`

Current problem:

- `RequirementMap` is explicitly retired as a required semantic intermediary for native agentic orchestration.
- Native todo/update_plan and native session messages are sufficient unless proof shows otherwise.

Target:

- Delete or demote `RequirementMap` from canonical execution.
- Keep only migration/historical artifacts if required.

Deletion trigger:

- Native orchestration proof covers large prompt intake, Work Queue item execution, undocumented feature request, and repair/resume without `RequirementMap`.

### SchedulerGraphPatch / SchedulerStageRunner

State: `proof_gated_delete`

Known files:

- `extensions/execution-platform/src/workflows/scheduler-stage-runner.ts`
- `extensions/execution-platform/src/workflows/scheduler-graph-patch.ts`
- `extensions/execution-platform/src/workflows/scheduler-graph-admission.ts`
- `extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts`
- `extensions/execution-platform/src/workflows/scheduler-stage-runner.test.ts`
- `extensions/execution-platform/src/workflows/scheduler-graph-patch.test.ts`

Current problem:

- `SchedulerGraphPatch` is explicitly retired as the model-facing orchestration product.
- Runtime events/native child sessions should express branching and closeout before a durable scheduler graph is introduced.

Target:

- Retire model-facing graph patch authoring.
- Keep only runtime-truth graph infrastructure if it survives first-principles justification as a projection/adapter, not semantic planning authority.

Deletion trigger:

- Native child sessions/handoffs prove adequate for representative branching, oversight, resume, and closeout.

### Long-Running Run-Once Compatibility

State: `proof_gated_delete`

Known surfaces:

- `runGatewayNativeExecutionSessionRuntimeJobOnce(...)`
- `/api/execution-platform/queue-runner/run-once`
- old proof/control route flags around run-once behavior
- chat/workflow wrappers that call run-once for normal execution

Current problem:

- `runOnce` is useful as a legacy/debug bridge, but it cannot remain the canonical production execution model.
- New resident native dispatch should use `runGatewayNativeExecutionSessionRuntimeJob(...)`, `RuntimeWorkerSupervisor.runNext(...)`, and `RuntimeWorkerSupervisor.runJob(...)`.
- The old `runOnce` names are compatibility aliases only.

Target:

- Resident worker/supervisor owns dispatch.
- HTTP/RPC starts, polls, controls.
- Proof harness never executes jobs directly.

Deletion trigger:

- All normal native execution callers migrate to start/status/control and resident dispatch.
- Focused tests prove no normal path uses long-running run-once.

## Retain Domain Surface Inventory

These surfaces are not automatically deletion targets.

### Product/Spec Planning Domain Surface

State: `retain_domain_surface`

Known files:

- `extensions/execution-platform/src/workflows/product-spec-planning-plugin.ts`
- `extensions/execution-platform/src/workflows/product-spec-planning-workflow.ts`
- `docs/projects/execution-platform/product-spec-planning-production-workflow.md`
- Product/Spec Planning Work Queue readback/contract/review modules that represent actual product functionality.

Reason:

- Product/Spec Planning as a product/domain workflow can remain valid.
- What is being retired is the old deterministic proof/replay architecture and the route/intake/scheduler small-verb meaning path.

Required audit before deletion:

- Determine whether each Product/Spec file is domain functionality, historical proof infrastructure, or obsolete deterministic orchestration.

## Audit Required Inventory

These require a narrower code audit before deletion.

1. `extensions/execution-platform/src/workflows/runtime-work-graph-*`

   Reason:
   - Some graph code may be runtime infrastructure or projection, not necessarily old semantic scheduler authority.
   - Delete only the semantic model-facing graph-patch authoring path unless proof shows graph runtime is also obsolete.

2. `extensions/execution-platform/src/workflows/node-agent-session.ts`

   Reason:
   - Some worker-node session logic may still be valuable or already superseded by native runtime sessions.
   - Audit after `AgentRuntimeCore` extraction and native proof.

3. `src/gateway/server-methods/chat.ts`

   Reason:
   - Contains both normal chat behavior and legacy execution routing. Cleanup must avoid breaking ordinary chat.

4. Work Queue projections containing replay/product-spec references.

   Reason:
   - Some references are historical readback or migration evidence. Others may be active old-system readback. Classify before deletion.

## Required Cleanup Tests

Add or preserve tests proving:

1. Normal chat execution routing does not call `ProductionWorkflowExecutionFactory.runOnce` for native execution after migration.
2. Native RPC start returns scheduled job/session readback and does not execute jobs inline.
3. Resident supervisor dispatches native jobs and child native jobs without long-running HTTP execution.
4. Proof harness uses start/status/control only.
5. `OpenClawAgentRuntime` and foreground/background envelopes delegate to `AgentRuntimeCore`, with no `RuntimeAgentExecutor` or `runEmbeddedPiAgentCore` layer.
6. Runtime launch/status/proof payloads expose four-root path contract only.
7. `legacy_front_door_execution_compatibility` blocks old deterministic front-door execution by default after native proof acceptance.
8. Product/Spec replay cannot close native proof gates after retirement.
9. No normal runtime import path requires `RequirementMap` or `SchedulerGraphPatch`.

## Cleanup Order

1. Finish pre-proof active gaps:
   - finish `AgentRuntimeCore` shared-service extraction;
   - collapse caller-visible path concepts;
   - finish resident supervisor dispatch semantics;
   - migrate chat native execution away from `ProductionWorkflowExecutionFactory.runOnce`;
   - keep proof harness start/status/control-only.

2. Rebuild/reload and run representative native orchestration proof.

3. Fix proof-exposed runtime/tooling defects.

4. Run backlog reconciliation as a native agentic task.

5. Classify legacy deterministic files into:
   - keep as domain surface;
   - migrate;
   - retire;
   - delete;
   - historical fixture only.

6. Disable compatibility gates for normal execution.

7. Delete retired deterministic route/intake/scheduler/Product-Spec replay code.

8. Run no-dead-path tests and source inventory checks.

## Current Architectural Cleanliness Verdict

Current state: not clean yet.

Reason:

- We have a viable native direction and several important seams landed.
- We still have dual execution surfaces, compatibility run-once wrappers, old semantic runners, and incomplete path/core extraction.

Clean enough to proceed with implementation cleanup: yes.

Clean enough to declare final architecture complete: no.

Clean enough to delete old deterministic systems: no, not until representative native proofs pass.
