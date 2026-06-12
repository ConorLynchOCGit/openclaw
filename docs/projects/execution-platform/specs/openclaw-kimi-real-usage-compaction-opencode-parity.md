# OpenClaw Kimi Real-Usage Compaction OpenCode Parity

Yes. I agree with your framing. The current guard is not just conservative; for this workload it is actively misleading. At ~553K persisted chars, rough context is ~138K tokens, and even the guard’s own pre-compaction live context should not have forced compaction against a 262K model.

**Proposal: Fix Context Accounting And Compaction**

Core correction: stop treating estimated serialized session size as truth. Copy OpenCode’s shape: use provider token accounting when available, trigger compaction from actual usage or real provider overflow, and make compaction/pruning cheap and deterministic before invoking any summarizer.

**1. Replace The Guard Estimator With Real Usage**

OpenCode’s overflow logic is the model:

- use assistant token usage;
- compute `count = total || input + output + cache.read + cache.write`;
- compare against usable context;
- reserve output space with a fixed buffer / max output allowance.

Reference:
[overflow.ts](/root/services/openclaw-roles/live/.artifacts/opencode-dev/packages/opencode/src/session/overflow.ts:1)

OpenClaw should:

- Ensure OpenRouter/Kimi requests capture streaming usage where supported.
- Normalize usage into `input`, `output`, `cacheRead`, `cacheWrite`, `total`.
- Store usage as runtime telemetry, not model-visible context.
- Trigger compaction from actual provider usage once a turn completes.
- On provider context-overflow error, compact/retry.
- Stop firing pre-submit compaction solely from the current `tool-result-context-guard` estimate.

If no real usage is available for a provider, use a fallback estimate only as a last-resort warning or emergency preflight, not as the primary compaction trigger for Kimi/OpenRouter.

**2. Fix Effective Context Budget**

For Kimi K2.6 the budget must resolve to `262144`, not the fallback `200000`.

The guard currently uses:

`params.model.contextWindow ?? params.model.maxTokens ?? DEFAULT_CONTEXT_TOKENS`

That must be replaced with the already-resolved runtime context budget (`ctxInfo.tokens` / `contextTokenBudget`) everywhere the guard, truncation, and compaction make context decisions.

Add diagnostics on every compaction decision:

- model/provider
- resolved context window
- reserved output tokens
- usable context tokens
- actual last provider input tokens
- actual total tokens
- fallback estimate if used
- trigger reason: `actual_usage`, `provider_overflow`, `manual`, `emergency_estimate`

**3. Stop Counting Useless Context**

Provider/model replay should contain only model-useful content:

- source-shaped read output
- grep results with line context
- LSP coordinates
- edit diffs
- concise diagnostics
- validation output
- minimal task/continuation text

Strip from provider-visible replay and compaction input:

- tool `details`
- provider diagnostics
- tool catalog receipts
- custom event JSON
- internal telemetry
- large process-state summaries
- duplicated full node prompt after compaction

Keep these in artifact/session telemetry if needed, but do not let them affect context pressure.

**4. Remove Tool Result Double Weighting**

The current estimator treats tool result text as `2 chars/token`, while ordinary text is `4 chars/token`. That effectively double-weights source code.

For source-shaped read/grep output, use normal text accounting. Better: once real provider usage is wired, the estimator should not be authoritative at all.

**5. Copy OpenCode-Style Prune Before Summarize**

Before LLM compaction, run deterministic pruning/truncation:

- preserve the latest useful turns;
- preserve recent tool outputs up to a bounded budget;
- clear older tool result bodies;
- save full oversized outputs to durable readable files if needed;
- replace old outputs with short “saved to path” markers.

OpenCode references:

- `PRUNE_MINIMUM = 20000`
- `PRUNE_PROTECT = 40000`
- `TOOL_OUTPUT_MAX_CHARS = 2000`
- `DEFAULT_TAIL_TURNS = 2`
- preserved recent token budget `2000..8000`

Reference:
[compaction.ts](/root/services/openclaw-roles/live/.artifacts/opencode-dev/packages/opencode/src/session/compaction.ts:34)

**6. Make Compaction Fast**

For worker proof overflow, use this order:

1. deterministic old-tool-output prune;
2. retry if now under budget;
3. only then invoke LLM summarization;
4. hard timeout compaction;
5. terminalize cleanly if compaction fails.

The hot path should usually avoid LLM summarization entirely when the pressure is caused by source/tool outputs.

Target: deterministic prune under seconds; full compaction under 30s. The observed ~6m52s is unacceptable.

**7. Make Compaction Continuation Edit-Oriented**

After compaction, do not reinsert the full 10KB node prompt and do not summarize the active state as “re-reading ranges.”

Continuation should be compact:

- objective
- target files
- known patch shape
- exact current source windows or line ranges
- changed files/diffs if any
- validation signal
- next action: edit or repair

Avoid phase language that reopens acquisition.

**8. Test With Real Old Sessions**

Build a compaction test harness that loads actual session JSONL files, including this run:

`nrun_377bd8ba1abdebf8fb81.jsonl`

Test cases:

- 553K-char pre-compaction session should not compact under Kimi 262K if actual usage/normalized estimate is below threshold.
- Provider-visible context excludes `details`, custom diagnostics, and catalog receipts.
- Deterministic prune reduces old tool output without losing latest source windows.
- Compaction does not duplicate the full node prompt.
- Compaction continuation says edit/repair target, not “continue reading.”
- Compaction latency is measured and bounded.
- Provider usage capture works for OpenRouter/Kimi streaming.
- Missing usage falls back safely but does not prematurely compact large-context models.

**9. Proof Optics**

Next proof should log:

- actual provider input tokens per turn
- context window and usable tokens
- compaction trigger reason
- source chars vs non-source chars
- stripped `details` chars
- compaction duration
- prune-only vs LLM-summary path
- first edit wallclock from model activation
- source calls before first edit

Bottom line: stop using the current guard as truth. It overestimates, counts non-useful material, and triggers a slow compaction path that re-biases the worker toward context acquisition. Copy OpenCode’s actual model: real usage first, deterministic prune second, LLM summary only when necessary.

## Implementation Status

Status date: 2026-06-11.

Live proof status: not run. The explicit instruction for this implementation pass was to complete the spec and not run a live proof.

### 1. Replace The Guard Estimator With Real Usage

Status: Complete.

Implemented evidence:

- `src/agents/pi-embedded-runner/run.ts` now triggers post-turn compaction from normalized actual provider usage when `actualPromptTokens` reaches the usable context budget.
- The actual-usage trigger logs provider/model, resolved context window, reserved output tokens, usable context tokens, actual prompt tokens, actual total tokens, source/locator chars, non-source visible chars, and stripped details chars.
- `src/agents/pi-embedded-runner/run/attempt.ts` now prefers actual-usage compaction for OpenRouter/Kimi/streaming-usage providers by putting pre-submit fallback estimates in `emergency_only` mode.
- Providers without real usage still use fallback estimates, but the fallback estimate is no longer authoritative for Kimi/OpenRouter except for emergency-sized estimates.

Verification:

- `pnpm test:file src/agents/pi-embedded-runner/run/preemptive-compaction.test.ts`
- `pnpm test:file src/agents/pi-embedded-runner/run.overflow-compaction.loop.test.ts src/agents/pi-embedded-runner/run/attempt.test.ts src/agents/pi-embedded-runner/real-session-compaction-harness.test.ts`

### 2. Fix Effective Context Budget

Status: Complete.

Implemented evidence:

- `src/agents/pi-embedded-runner/run/attempt.ts` installs the tool-result context guard with the resolved `params.contextTokenBudget ?? DEFAULT_CONTEXT_TOKENS`, not `params.model.contextWindow ?? params.model.maxTokens ?? DEFAULT_CONTEXT_TOKENS`.
- Preflight compaction and truncation decisions use the resolved `contextTokenBudget`.
- The real-session harness proves the recorded Kimi session does not pre-submit compact under a resolved `262_144` budget.
- Compaction decision diagnostics include context window, reserve tokens, usable context tokens, estimate trigger reason, and actual usage fields where available.

Verification:

- `pnpm test:file src/agents/pi-embedded-runner/real-session-compaction-harness.test.ts`
- `pnpm test:file src/agents/pi-embedded-runner/run/preemptive-compaction.test.ts`
- `pnpm test:file src/agents/pi-embedded-runner/run/attempt.test.ts`

### 3. Stop Counting Useless Context

Status: Complete.

Implemented evidence:

- `src/agents/pi-embedded-runner/tool-result-char-estimator.ts` estimates tool-result pressure from provider-visible content only.
- Tool `details` are excluded from token-pressure estimates.
- `estimateProviderVisibleContextBreakdown` records stripped details chars as telemetry without making details provider-visible.
- The real-session harness strips `details` and verifies compaction input preserves source-shaped tool text.

Verification:

- `pnpm test:file src/agents/pi-embedded-runner/tool-result-char-estimator.test.ts`
- `pnpm test:file src/agents/pi-embedded-runner/tool-result-context-guard.test.ts`
- `pnpm test:file src/agents/pi-embedded-runner/real-session-compaction-harness.test.ts`

### 4. Remove Tool Result Double Weighting

Status: Complete.

Implemented evidence:

- `TOOL_RESULT_CHARS_PER_TOKEN_ESTIMATE` now equals `CHARS_PER_TOKEN_ESTIMATE`.
- Tool-result text is counted like ordinary provider-visible text.
- Hidden `details` no longer change pre-prompt token estimates.

Verification:

- `pnpm test:file src/agents/pi-embedded-runner/tool-result-char-estimator.test.ts`
- `pnpm test:file src/agents/pi-embedded-runner/run/preemptive-compaction.test.ts`
- `pnpm test:file src/agents/pi-embedded-runner/tool-result-context-guard.test.ts`

### 5. Copy OpenCode-Style Prune Before Summarize

Status: Complete.

Implemented evidence:

- `src/agents/pi-embedded-runner/run.ts` now calls deterministic tool-output pruning before LLM compaction for timeout recovery, provider overflow recovery, and actual-usage pressure.
- If prune rewrites the oversized tool outputs, the run retries without invoking LLM summarization.
- If prune finds no rewrite, the run falls through to the existing LLM compaction path.
- The prune path uses the same native bounded-output/truncation machinery and logs prune duration, context window, max chars, truncated count, and reason.

Verification:

- `pnpm test:file src/agents/pi-embedded-runner/run.overflow-compaction.loop.test.ts`
- `pnpm test:file src/agents/pi-embedded-runner/tool-result-truncation.test.ts`

### 6. Make Compaction Fast

Status: Complete.

Implemented evidence:

- Worker overflow recovery now uses the required order: deterministic prune, retry if prune succeeds, LLM summarization only when prune cannot help.
- Timeout recovery uses the same prune-first path.
- Actual-usage pressure uses the same prune-first path.
- LLM compaction failures on the actual-usage path are caught and logged so a successful model turn does not become a new crash path.
- Prune logs include `durationMs`; existing compaction logs keep LLM compaction duration diagnostics.

Verification:

- `pnpm test:file src/agents/pi-embedded-runner/run.overflow-compaction.loop.test.ts`
- `pnpm test:file src/agents/pi-embedded-runner/run/attempt.test.ts`

### 7. Make Compaction Continuation Edit-Oriented

Status: Complete.

Implemented evidence:

- `src/agents/pi-embedded-runner/run.ts` adds the node-worker continuation instruction:

  `Continue the current implementation. If target files, patch shape, and validation signal are known, edit or validate next. Do not restart source discovery unless a named source window, failed edit, or validation error requires it.`

- Node-worker compaction builds repair context from the node-agent session trace:
  - changed files;
  - changed hunks;
  - diagnostics;
  - refs;
  - source-shaped repair windows around changed/error lines.
- Timeout, overflow, and actual-usage compaction paths pass this edit-oriented custom instruction/repair context into compaction.

Verification:

- `pnpm test:file src/agents/pi-embedded-runner/run.overflow-compaction.loop.test.ts`

### 8. Test With Real Old Sessions

Status: Complete.

Implemented evidence:

- Added `src/agents/pi-embedded-runner/real-session-compaction-harness.test.ts`.
- The harness loads `.openclaw/runtime/agents/execution-coding/sessions/nrun_377bd8ba1abdebf8fb81.jsonl` when present.
- It verifies the recorded Kimi session does not pre-submit compact under a `262_144` token budget in `emergency_only` mode.
- It verifies provider-visible context excludes `details`, custom metadata stays out of the replay path, and source-shaped tool text survives compaction input projection.

Verification:

- `pnpm test:file src/agents/pi-embedded-runner/real-session-compaction-harness.test.ts`

### 9. Proof Optics

Status: Complete for implementation. Live proof intentionally not run.

Implemented evidence:

- `src/agents/pi-embedded-runner/run.ts` logs actual provider input tokens per turn on the actual-usage compaction trigger.
- `src/agents/pi-embedded-runner/run.ts` logs context window, usable tokens, compaction trigger reason, compaction/prune duration, prune-only vs LLM-summary path, source/locator chars, non-source visible chars, and stripped details chars.
- `src/agents/pi-embedded-runner/run/attempt.ts` appends `node_agent_context_accounting` trace events with:
  - provider/model;
  - resolved context window;
  - reserve and usable context tokens;
  - estimated prompt tokens;
  - route and trigger reason;
  - whether actual-usage compaction is preferred;
  - source/locator chars;
  - non-source visible chars;
  - stripped details chars.
- Existing node-agent edit-transition diagnostics already record first edit wallclock from model activation and source calls before first edit.

Verification:

- `pnpm test:file src/agents/pi-embedded-runner/tool-result-char-estimator.test.ts`
- `pnpm test:file src/agents/pi-embedded-runner/run/preemptive-compaction.test.ts`
- `pnpm test:file src/agents/pi-embedded-runner/run.overflow-compaction.loop.test.ts src/agents/pi-embedded-runner/run/attempt.test.ts src/agents/pi-embedded-runner/real-session-compaction-harness.test.ts`

## Verification Commands

Completed:

```bash
pnpm test:file src/agents/pi-embedded-runner/tool-result-char-estimator.test.ts src/agents/pi-embedded-runner/run/preemptive-compaction.test.ts src/agents/pi-embedded-runner/tool-result-context-guard.test.ts src/agents/pi-embedded-runner/tool-result-truncation.test.ts
pnpm test:file src/agents/pi-embedded-runner/run.overflow-compaction.loop.test.ts src/agents/pi-embedded-runner/run/attempt.test.ts src/agents/pi-embedded-runner/real-session-compaction-harness.test.ts
```
