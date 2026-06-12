---
summary: "Proposal to migrate the temporary worker-node context pressure and compaction behavior into a native OpenClaw context runtime pressure subsystem."
title: "OpenClaw Native Context Runtime Pressure Refactor"
---

# OpenClaw Native Context Runtime Pressure Refactor

The proposal below is recorded verbatim.

## Implementation Status

Status: Complete.

Completion evidence:

- Native context runtime entrypoint added at `src/context-engine/runtime.ts`.
- Native pressure subsystem added under `src/context-engine/pressure/`.
- `run.ts` resolves `resolveContextRuntime(config)` once and uses `contextRuntime.pressure`.
- `attempt.ts` pre-submit pressure path calls `contextPressure.beforeSubmit(...)`.
- `run.ts` timeout, provider-overflow, and actual-usage paths call `contextPressure.recover(...)` or `contextPressure.afterTurn(...)`.
- Execution-node continuation packet construction moved behind `executionNodeContinuationStrategy`.
- Deterministic prune-before-summary moved behind `pruneToolOutputsForContextPressure(...)`.
- `installToolResultContextGuard` now uses shared native pressure budget logic.
- Public attempt result no longer exposes `preflightRecovery` or `promptErrorSource`; pre-submit pressure is returned as `contextPressureOutcome`, and provider-context admission is separated as `providerContextAdmissionBlock`.
- Temporary runner-local pre-submit helper files deleted:
  - `src/agents/pi-embedded-runner/run/preemptive-compaction.ts`
  - `src/agents/pi-embedded-runner/run/preemptive-compaction.types.ts`
  - `src/agents/pi-embedded-runner/run/preemptive-compaction.test.ts`
- Structural residue check passes for deleted temporary names:
  - no `preflightRecovery`
  - no `promptErrorSource`
  - no `shouldPreemptivelyCompactBeforePrompt`
  - no `PreemptiveCompactionRoute`
  - no `pruneToolOutputsBeforeCompaction`
  - no `buildNodeWorkerCompactionRepairContext`
  - no `actual-usage-compaction`
  - no `node_agent_context_accounting`
  - no public `triggerReason` except the test asserting canonical telemetry does not include it.
- `resolveContextRuntime` tolerates legacy/test engines without `info` and installs default context policy.
- Existing completed worker-node context-pressure behavior is preserved under focused tests.

Focused verification run:

```bash
pnpm test:file src/context-engine/pressure/context-pressure.test.ts src/agents/pi-embedded-runner/tool-result-context-guard.test.ts src/agents/pi-embedded-runner/tool-result-char-estimator.test.ts src/agents/pi-embedded-runner/real-session-compaction-harness.test.ts src/agents/pi-embedded-runner/run.overflow-compaction.loop.test.ts src/agents/pi-embedded-runner/run.timeout-triggered-compaction.test.ts src/agents/pi-embedded-runner/run/attempt.test.ts src/agents/pi-embedded-runner/run.incomplete-turn.test.ts src/agents/pi-embedded-runner/usage-reporting.test.ts
```

Result: passed.

Additional compatibility verification:

```bash
pnpm test:file src/agents/pi-embedded-runner.run-embedded-pi-agent.auth-profile-rotation.e2e.test.ts
```

Result: passed.

Completed item tracking:

| Item                                  | Status   | Evidence                                                                                                                                                                                                                                                       |
| ------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Native context runtime boundary    | Complete | `resolveContextRuntime(config)` added and exported; pressure resolves beside the context engine.                                                                                                                                                               |
| 2. Native layering                    | Complete | Runner observes lifecycle and delegates pressure decisions/recovery to `ContextRuntime.pressure`; compaction remains `ContextEngine.compact(...)`; pruning and continuation are separate pressure collaborators.                                               |
| 3. Completed worker-node fix absorbed | Complete | Actual-usage pressure, Kimi/OpenRouter emergency-only pre-submit behavior, timeout/provider overflow prune-before-summary, context accounting, execution-node continuation, and real-session harness coverage moved behind native pressure surfaces.           |
| 4. Thin pressure controller           | Complete | Pure modules split into `budget.ts`, `usage.ts`, `decisions.ts`, `recovery.ts`, `telemetry.ts`, `continuation.ts`, `controller.ts`, and `types.ts`.                                                                                                            |
| 5. Minimal public API                 | Complete | Pressure controller exposes only `beforeSubmit(...)`, `afterTurn(...)`, and `recover(...)`.                                                                                                                                                                    |
| 6. Trigger/action schema              | Complete | Native schema uses canonical triggers/actions; deleted runner-local route/trigger field names from source.                                                                                                                                                     |
| 7. Canonical decision contract        | Complete | `ContextPressureDecision` uses required `trigger`, `action`, `diagId`, `budget` with optional detail groups.                                                                                                                                                   |
| 8. Budget/usage/pressure shapes       | Complete | Budget, provider usage, estimate, pressure, prune, summary, continuation, diagnostics, and context breakdown are typed snapshots.                                                                                                                              |
| 9. Canonical outcome                  | Complete | `ContextPressureOutcome` is a discriminated union over `proceed`, `prune_retry`, `summary_retry`, `block`, and `fail`.                                                                                                                                         |
| 10. Legacy-to-native mapping          | Complete | Runtime no longer exposes `preflightRecovery`, `promptErrorSource`, old route fields, or old trigger-reason fields; provider admission is separate from pressure.                                                                                              |
| 11. One recovery flow                 | Complete | `recoverContextPressure(...)` runs budget/usage normalization, deterministic prune, summary fallback, continuation, and telemetry for timeout, provider overflow, actual usage, and manual callers.                                                            |
| 12. Pre-submit and post-turn          | Complete | `attempt.ts` calls `beforeSubmit(...)`; `run.ts` calls `afterTurn(...)` for actual usage.                                                                                                                                                                      |
| 13. Continuation strategy             | Complete | Default and execution-node strategies build constrained continuation packets without semantic ledger fields.                                                                                                                                                   |
| 14. Context policy ownership          | Complete | `ContextEngine.info.contextPolicy` defaults to `{ summarization: "engine", pressure: "openclaw" }`; missing legacy test-engine info is defaulted safely.                                                                                                       |
| 15. Unified telemetry                 | Complete | `openclaw:context-pressure-decision` event builder emits canonical `trigger/action/diagId/budget` plus optional groups; pre-submit persists through attempt trace, run-level recovery emits the same bounded event shape through the run debug telemetry sink. |
| 16. Transform guard                   | Complete | `installToolResultContextGuard` is a safety adapter over shared pressure budget logic.                                                                                                                                                                         |
| 17. Runner/attempt branch reduction   | Complete | Runner/attempt call native pressure surfaces; deleted bespoke pre-submit route helper and inline node-worker continuation builder.                                                                                                                             |
| 18. Preserve primitives               | Complete | Existing provider usage normalization, budget constants, tool-output truncation, managed output, transcript mutation, and `ContextEngine.compact(...)` are reused rather than duplicated.                                                                      |
| 19. Temporary solution retirement     | Complete | Temporary helper functions/files deleted; old telemetry construction removed from attempt pre-submit path.                                                                                                                                                     |
| 20. Migration parity                  | Complete | Behavior covered by native boundary tests and runner tests; no permanent legacy/native mode added.                                                                                                                                                             |
| 21. Public fields                     | Complete | Public pressure schema reduced to native decision/outcome fields; old top-level fields removed from attempt result.                                                                                                                                            |
| 22. Failure point reduction           | Complete | Pre-submit emergency estimate, provider overflow, actual usage, timeout high-usage, and manual recovery share the same pressure state machine.                                                                                                                 |
| 23. Structural deletion-safety checks | Complete | Source residue scan confirms temporary names are gone; runner callsites use `contextPressure.beforeSubmit`, `afterTurn`, and `recover`.                                                                                                                        |
| 24. Implementation order              | Complete | Steps 1 through 22 executed; focused tests run after migration and deletion.                                                                                                                                                                                   |
| 25. Tests proposed                    | Complete | Added native pressure tests and updated runner/guard/harness/e2e tests.                                                                                                                                                                                        |
| 26. Non-goals                         | Complete | No live proof run, no new model-visible instructions, no new semantic context ledger, no EP-specific compaction subsystem, no permanent legacy/native mode.                                                                                                    |
| 27. Success criteria                  | Complete | Native boundary exists, runner is caller not policy owner, pressure paths share prune-before-summary recovery, continuation is strategic, transform guard shares pressure logic, temporary implementation retired.                                             |

Core correction:

- Make context pressure and compaction part of OpenClaw's native context runtime, not execution-runner policy embedded across `run.ts`, `attempt.ts`, transform hooks, truncation helpers.
- Completed worker-node compaction fixes are temporary behavior slice. Refactor must absorb that behavior into native OpenClaw context runtime, rewire worker-node path to use it, prove parity, then retire/delete runner-local temporary solution.

1. Native context runtime boundary:
   - Do NOT create `src/agents/pi-embedded-runner/context-pressure/`.
   - Create:
     ```
     src/context-engine/runtime.ts
     src/context-engine/pressure/
       controller.ts
       budget.ts
       usage.ts
       decisions.ts
       recovery.ts
       continuation.ts
       telemetry.ts
       types.ts
       index.ts
     ```
   - Preferred entrypoint:
     ```ts
     const contextRuntime = await resolveContextRuntime(config);
     // contextRuntime = { engine, pressure }
     ```
   - `resolveContextRuntime(config)` wraps existing `resolveContextEngine(config)` so pressure is initialized alongside engine.

2. Native layering:
   - Runner lifecycle owns provider turn start/end and retries.
   - `ContextRuntime.pressure` owns pressure classification and recovery policy.
   - `ContextEngine` owns assembly, afterTurn maintenance, LLM summarization compaction.
   - Tool-output pruning owns deterministic transcript reduction.
   - Managed output owns persisted heavy bodies.
   - Continuation strategy owns agent/node-specific post-compaction context.
   - Telemetry sink owns runtime/proof event construction.
   - Native flow:
     ```
     Runner lifecycle
       -> ContextRuntime.pressure
           -> ProviderUsageAccounting
           -> ContextBudgetResolver
           -> ToolOutputPruner
           -> ContinuationStrategy
           -> ContextRuntime.engine.compact(...)
           -> TelemetrySink
     ```

3. Completed worker-node fix is temporary:
   - Migrate these behaviors into native subsystem:
     - actual-usage compaction trigger
     - emergency-only estimate behavior for Kimi/OpenRouter
     - prune-before-summary on timeout recovery
     - prune-before-summary on provider overflow recovery
     - prune-before-summary on actual-usage pressure
     - source/non-source/detail context accounting
     - edit-oriented node-worker continuation
     - real-session compaction harness coverage
   - Final state: behavior remains, no longer worker-node fixes; lives as OpenClaw-native context runtime behavior; temporary runner-local implementation deleted.

4. Keep pressure controller thin:
   - Split pure modules:
     - `budget.ts`: context window/reserve/usable tokens
     - `usage.ts`: provider usage/fallback estimates
     - `decisions.ts`: classify pressure and choose action
     - `recovery.ts`: prune-summary-retry sequence
     - `telemetry.ts`: event payloads
     - `continuation.ts`: continuation through strategy
     - `controller.ts`: coordinate only

5. Minimal public API:
   - Expose only:
     ```ts
     beforeSubmit(...)
     afterTurn(...)
     recover(...)
     ```
   - `recover` receives trigger:
     ```ts
     recover({ trigger: "provider_overflow" | "timeout_high_usage" | "actual_usage" | "manual", ... })
     ```
   - Do NOT expose `prepareCompactionInput(...)` publicly unless another real caller needs it.

6. Trigger/action schema:
   - Collapse scattered fields:
     - `route`, `triggerReason`, `reason`, `reasonCodes`, `preflightRecovery`, `promptErrorSource`, `compactionTarget`, `toolResultReducibleChars`, `effectiveReserveTokens`, `promptBudgetBeforeReserve`
   - Canonical trigger:
     ```ts
     "actual_usage" |
       "provider_overflow" |
       "timeout_high_usage" |
       "preflight_emergency_estimate" |
       "manual";
     ```
   - Canonical action:
     ```ts
     "proceed" | "prune_retry" | "summary_retry" | "block" | "fail";
     ```
   - Use `proceed` instead of `submit`; `fail` instead of `terminal_failure` unless compatibility requires longer label.
   - Do not add more action variants unless proven distinct.

7. Canonical decision contract:

   ```ts
   type ContextPressureDecision = {
     trigger: ContextPressureTrigger;
     action: ContextPressureAction;
     diagId: string;
     budget: ContextBudgetSnapshot;
     usage?: ProviderUsageSnapshot;
     estimate?: EstimateSnapshot;
     pressure?: PressureSnapshot;
     prune?: PruneSnapshot;
     summary?: SummarySnapshot;
     continuation?: ContinuationSnapshot;
     diagnostics?: DiagnosticsSnapshot;
   };
   ```

   - Required only: `trigger`, `action`, `diagId`, `budget`.
   - Everything else optional; avoid dummy/null-heavy telemetry.
   - No public `telemetry` field in decision.

8. Budget/usage/pressure shapes:

   ```ts
   budget: { contextWindowTokens: number; reserveTokens: number; usableTokens: number }
   usage?: { source: "provider" | "estimate"; promptTokens?: number; totalTokens?: number; cacheRead?: number; cacheWrite?: number }
   pressure?: { overBudgetTokens?: number; emergency?: boolean }
   ```

9. Canonical outcome:

   ```ts
   type ContextPressureOutcome =
     | { action: "proceed" }
     | { action: "prune_retry"; prune: PruneResult }
     | { action: "summary_retry"; summary: CompactResult }
     | { action: "block"; reason: string }
     | { action: "fail"; error: Error };
   ```

10. Legacy-to-native mapping:

    ```
    route -> action
    triggerReason -> trigger
    preflightRecovery -> decision/outcome
    promptErrorSource -> diagnostics.source
    compactionTarget -> summary.target
    toolResultReducibleChars -> prune.reducibleChars
    effectiveReserveTokens -> budget.reserveTokens
    promptBudgetBeforeReserve -> budget.usableTokens
    ```

    - Remove entirely unless needed at compatibility boundary:
      - `telemetry` as decision field
      - `reasonCodes` except user-facing terminal errors
      - `compactionTarget` unless summarizer needs it
      - `promptErrorSource` in favor of `diagnostics.source`
      - `toolResultReducibleChars` unless nested under `prune`
      - `effectiveReserveTokens`
      - `promptBudgetBeforeReserve`

11. One recovery flow:

    ```ts
    recover({ trigger, session, provider, model, usage, contextEngine, continuationStrategy });
    ```

    Sequence:

    ```
    resolve budget and usage
    classify pressure
    try deterministic prune
    retry if prune succeeds
    invoke LLM summary only if prune cannot help
    retry if summary succeeds
    return terminal outcome if recovery fails
    record one telemetry event
    ```

    No special local branches in `run.ts`.

12. Pre-submit and post-turn:
    - `attempt.ts` calls:
      ```ts
      contextRuntime.pressure.beforeSubmit(...)
      ```
      and handles actions (`proceed`, `prune_retry`, `summary_retry`, `block`, `fail`).
    - `run.ts` calls:
      ```ts
      contextRuntime.pressure.afterTurn({ usage, session, provider, model, ... })
      ```
      to handle actual-usage pressure. Runner should not own bespoke actual-usage branch.

13. Continuation strategy:
    - Move packet construction behind:
      ```ts
      ContinuationStrategy.build(...)
      ```
    - Default:
      - compact objective
      - recent assistant state
      - no node-specific assumptions
    - Execution-node:
      - objective
      - changed files
      - changed hunks
      - diagnostics
      - exact repair windows
      - validation signal
      - next action: edit, repair, validate, finish
    - Constrained packet shape:
      ```ts
      type ContinuationPacket = {
        instructions?: string;
        sourceWindows?: SourceWindow[];
        changedFiles?: string[];
        diagnostics?: DiagnosticSummary[];
      };
      ```
    - No arbitrary `Record<string, unknown>`.
    - Strategy should not read repo directly from core pressure code; if it needs source windows pass a callback like `readSourceWindow(...)`.
    - Execution Platform can register/pass strategy but must not own compaction.

14. Context policy ownership:
    - `ContextEngine.info.ownsCompaction` is too blunt.
    - Avoid broad ownership matrix unless necessary.
    - Preferred minimal policy:
      ```ts
      contextEngine.info.contextPolicy = {
        summarization: "engine" | "openclaw"
        pressure: "openclaw" | "engine"
      }
      ```
    - Defaults:
      ```ts
      summarization: "engine";
      pressure: "openclaw";
      ```
    - If too much churn, keep current behavior and add only when needed.
    - Do not introduce broad capability matrix prematurely.

15. Unified telemetry:
    - One canonical event:
      ```ts
      openclaw: context - pressure - decision;
      ```
    - Required fields:
      ```ts
      {
        (eventType, trigger, action, diagId, budget);
      }
      ```
    - Optional fields:
      `usage?`, `estimate?`, `pressure?`, `contextBreakdown?`, `prune?`, `summary?`, `continuation?`, `diagnostics?`
    - Full optional shape:
      ```ts
      {
        eventType: "openclaw:context-pressure-decision",
        trigger,
        action,
        diagId,
        budget: { contextWindowTokens, reserveTokens, usableTokens },
        usage?: { source, promptTokens, totalTokens, cacheRead, cacheWrite },
        estimate?: { promptTokens, emergencyOnly },
        contextBreakdown?: { sourceOrLocatorChars, nonSourceVisibleChars, strippedDetailsChars },
        prune?: { attempted, truncatedCount, durationMs },
        summary?: { attempted, compacted, durationMs },
        continuation?: { strategy, sourceWindowCount, changedFileCount },
        diagnostics?: { source, message }
      }
      ```
    - Telemetry derived from decision/outcome, not mutable business logic.
    - No empty nested objects.

16. Transform guard:
    - `installToolResultContextGuard` becomes thin adapter over same pressure subsystem.
    - It can remain safety hook but should not maintain separate pressure policy.

17. Runner/attempt branch reduction:
    - `run.ts` should not contain bespoke branches for timeout/provider overflow/actual usage/node-worker continuation.
    - Example:
      ```ts
      const contextRuntime = await resolveContextRuntime(config)
      const result = await callProvider(...)
      const postTurn = await contextRuntime.pressure.afterTurn(...)
      if (postTurn.action !== "proceed") return handleContextPressure(postTurn)
      if (providerOverflow) return handleContextPressure(await contextRuntime.pressure.recover({ trigger: "provider_overflow", ... }))
      ```
    - `attempt.ts` should not decide estimate mode, emergency-only, or compaction route:
      ```ts
      const preSubmit = await contextRuntime.pressure.beforeSubmit(...)
      if (preSubmit.action !== "proceed") return handleContextPressure(preSubmit)
      ```

18. Preserve primitives:
    - Reuse existing provider usage normalization, context budget resolution, tool-output truncation/pruning, managed-output persistence, `ContextEngine.compact(...)`, session transcript mutation, node-agent trace evidence.
    - Boundary cleanup, not parallel implementation.

19. Temporary solution retirement:
    - Targets:
      - `pruneToolOutputsBeforeCompaction` in `run.ts`
      - actual-usage compaction branch in `run.ts`
      - node-worker continuation construction in `run.ts`
      - preflight estimate-mode branching in `attempt.ts`
      - direct `node_agent_context_accounting` event construction in `attempt.ts`
      - temporary route/trigger diagnostic duplication
      - transform-guard pressure logic not routed through native pressure
    - Steps:
      1. Inventory every runner-local temporary function added in compaction pass.
      2. Move behavior into native modules.
      3. Replace callsites with native calls.
      4. Add tests proving old behavior exists through native path.
      5. Remove temporary functions.
      6. Remove old route/trigger aliases.
      7. Remove redundant tests that only exercise deleted temporary surfaces.
      8. Keep behavior tests at native boundary.

20. Migration parity:
    - Use current behavior as fixtures, not inspiration.
    - Preferred:
      1. Capture current behavior as fixtures.
      2. Test native decisions against fixtures.
      3. Switch callsites.
      4. Delete legacy code same slice.
    - Do NOT keep reusable `legacyDecision` path.
    - Do NOT add permanent runtime mode:
      ```ts
      contextPressureMode: "legacy" | "native" | "shadow_compare";
      ```
    - If runtime shadow mode absolutely necessary, short-lived and test-enforced for deletion. Preferred: parity tests + same-slice deletion.

21. Public fields:
    - Reduce to:
      `trigger`, `action`, `diagId`, `budget`, optional `usage`, `estimate`, `pressure`, `prune`, `summary`, `continuation`, `diagnostics`.
    - Avoid top-level:
      `route`, `triggerReason`, `promptErrorSource`, `preflightRecovery`, `compactionTarget`, `toolResultReducibleChars`, `effectiveReserveTokens`, `promptBudgetBeforeReserve`, `reasonCodes` except user-facing terminal errors.

22. Failure point reduction:
    - One state machine:
      ```
      observe context state
      normalize budget + usage
      classify pressure
      choose action
      execute prune if useful
      execute summary only if needed
      retry or fail
      emit one event
      ```
    - Applies to pre-submit emergency estimate, provider overflow, actual usage threshold, timeout high-usage recovery, manual compaction.

23. Structural deletion-safety checks:
    - Prefer import-boundary tests over brittle string checks:
      - `run.ts` must not import low-level truncation/pressure helpers directly.
      - recovery goes through `contextRuntime.pressure`.
      - pre-submit pressure goes through `contextRuntime.pressure`.
      - no native code imports temporary runner-local compaction helpers.
    - Targeted string checks only for known temporary names:
      - no `actual-usage-compaction` branch remains directly in `run.ts`
      - no `pruneToolOutputsBeforeCompaction` function remains in `run.ts`
      - no `node_agent_context_accounting` constructed outside pressure telemetry
      - no Kimi/OpenRouter estimate-mode policy in `attempt.ts`
      - pressure events use canonical `trigger/action`.

24. Implementation order from latest proposal:
    1. Inventory temporary runner-local behavior from completed compaction pass.
    2. Add `src/context-engine/runtime.ts` with `resolveContextRuntime(config)` wrapping `resolveContextEngine(config)`.
    3. Add `src/context-engine/pressure/types.ts`.
    4. Add `budget.ts`.
    5. Add `usage.ts`.
    6. Add `decisions.ts`.
    7. Add `telemetry.ts`.
    8. Add `continuation.ts` with constrained packet.
    9. Add dependency interfaces in `types.ts`; do not add adapters until multiple real callsites.
    10. Add `recovery.ts`.
    11. Add `controller.ts`.
    12. Add migration parity tests using captured fixtures.
    13. Replace `attempt.ts` pre-submit path with native `beforeSubmit`.
    14. Replace `run.ts` timeout/provider-overflow/actual-usage paths with native `recover`.
    15. Replace node-worker continuation inline logic with strategy.
    16. Convert `installToolResultContextGuard` to shared pressure/budget logic.
    17. Add minimal `contextEngine.info.contextPolicy` only if needed, preferring `{ summarization: "engine", pressure: "openclaw" }`.
    18. Run focused tests proving behavior parity.
    19. Delete temporary runner-local functions and duplicated telemetry construction same slice.
    20. Remove compatibility aliases once no callsites depend.
    21. Add structural deletion-safety tests.
    22. Keep behavior tests at native boundary.

25. Tests proposed:
    - `resolveContextRuntime(config)` returns both `engine` and `pressure`.
    - pre-submit emergency estimate same as current Kimi/OpenRouter path.
    - provider overflow uses prune before summary.
    - timeout high-usage uses prune before summary.
    - actual-usage pressure uses provider tokens not serialized estimate.
    - execution-node continuation includes changed files/diagnostics/repair windows.
    - default continuation avoids execution-node fields.
    - continuation packet rejects arbitrary semantic ledger fields.
    - telemetry emits one canonical event with optional fields.
    - telemetry derived from decision/outcome, not mutable.
    - context policy defaults to OpenClaw pressure ownership.
    - migration parity proves native decisions equivalent to current temporary behavior.
    - structural deletion checks prove runner-local branches gone.

26. Non-goals:
    - Do not change compaction behavior just to refactor.
    - Do not add new model-visible instructions.
    - Do not move provider retry/submission policy into `ContextEngine`.
    - Do not create another semantic context ledger.
    - Do not create EP-specific compaction subsystem.
    - Do not duplicate managed-output/truncation primitives.
    - Do not keep both legacy/native paths permanently.
    - Do not preserve old field names in native subsystem.
    - Do not add runtime shadow/legacy mode unless absolutely necessary.
    - Do not add adapter directory before multiple real callsites.
    - Do not expose `prepareCompactionInput(...)` publicly unless another real caller needs it.
    - Do not add broad ownership matrix unless necessary.
    - Do not run live proof as part of refactor unless explicitly requested.

27. Success criteria:
    - Context pressure lives inside native context runtime boundary.
    - `resolveContextRuntime(config)` initializes engine + pressure.
    - `run.ts`/`attempt.ts` become callers, not policy owners.
    - Every pressure path uses same prune-before-summary state machine.
    - Every pressure path emits same canonical telemetry.
    - `ContextEngine` remains pluggable without owning pressure policy by default.
    - Execution-node continuation is strategy, not inline runner logic.
    - Continuation packet constrained and does not recreate context ledger.
    - Transform guard uses shared pressure logic.
    - Public schema reduced to `trigger`, `action`, `diagId`, `budget`, optional detail groups.
    - Existing completed worker-node compaction behavior unchanged under focused tests.
    - Temporary runner-local implementation retired and deleted same slice.
    - Structural checks prove temporary implementation did not become permanent.

28. Bottom line:

    ```
    ContextRuntime
      - engine: assemble / afterTurn / compact
      - pressure: budget / usage / decide / recover

    Runner
      - observes lifecycle
      - calls pressure
      - applies outcome

    Execution Platform
      - supplies continuation strategy
      - consumes telemetry
    ```

    Behavior just built remains, but stops being worker-node patch; becomes native OpenClaw context runtime behavior; temporary runner-local solution deleted.
