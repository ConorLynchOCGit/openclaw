---
summary: "Running tally of live Kimi Work Queue proof failures, misses, and likely next fixes, kept durable so compaction does not erase current evidence."
title: "OpenClaw Kimi Proof Running Failure Tally"
---

# OpenClaw Kimi Proof Running Failure Tally

## Status

Live running tally started during
`product-spec-boundary-replay-work-queue-delta-coherent-edit-batch-20260611T160551Z`.

This document is intentionally operational. Update it as proof evidence changes.
It is not a final architecture spec.

## Current Live Proof

- Proof run id:
  `product-spec-boundary-replay-work-queue-delta-coherent-edit-batch-20260611T160551Z`
- Node run id: `nrun_7e80cb837b541eaeb4eb`
- Parent session:
  `.openclaw/runtime/agents/execution-coding/sessions/nrun_7e80cb837b541eaeb4eb.jsonl`
- Active validation scout session observed:
  `.openclaw/runtime/agents/execution-validation-scout/sessions/native_task_e7c4213c-f3f2-41d4-847d-fc4bb4a03556.jsonl`
- First model activation baseline: `2026-06-11T16:07:37Z`
- First assistant tool action: `2026-06-11T16:07:46.978Z`
- First LSP call: `2026-06-11T16:08:15.393Z`
- First edit call: `2026-06-11T16:11:41.602Z`
- First validation task call: `2026-06-11T16:23:19.583Z`
- Final observed parent session timestamp: `2026-06-11T16:30:03.548Z`
- Final proof artifact:
  `.artifacts/execution-platform/proof-runs/product-spec-boundary-replay-work-queue-delta-coherent-edit-batch-20260611T160551Z/product-spec-boundary-replay-error.json`
- Final proof status: failed with
  `ReplayProcessExitedWithoutTerminalState`.

## Final Outcome For This Run

The proof process is no longer running. It exited without the worker writing a
normal `product-spec-boundary-replay-result.json` or ordinary worker terminal
error. The harness wrote a bounded process-level error artifact with:

- `errorName`: `ReplayProcessExitedWithoutTerminalState`
- `reasonCodes`: `boundary_replay_process_exited_without_terminal_state`
- previous replay state: `single_node_worker_replay_started` / `running`
- live-state status: `failed`

This means terminal proof hygiene is still not healthy enough: the wrapper
created an error artifact, but the worker lane did not finish cleanly through
`node_finish`/result semantics.

## What Improved

1. **Context acquisition is massively improved**

   Kimi used `lsp` early, formed a concrete patch plan, and reached the first
   edit at about `+4m04s` from first model activation. This is a different
   class of behavior from earlier endless read/grep acquisition loops.

2. **The system prompt and LSP affordance are working**

   The worker identified target files, target symbols, patch shape, and
   validation intent. It used `lsp documentSymbol` on the large TypeScript file
   instead of only walking the file by reads.

3. **The worker is willing to make a vertical edit**

   It attempted type wiring, builder input wiring, event-store projection
   population, summary return wiring, and a helper insertion. The issue is no
   longer primarily "Kimi will not edit."

## Current Failure Basket

### 1. Edit Is Still Fundamentally Weak

Observed failures:

- exact `oldText` did not match;
- exact `oldText` was non-unique;
- no-op replacement produced identical content;
- model attempted a plausible multi-edit shape, but one nested edit used keys
  outside the accepted set, causing the whole edit call to fail;
- helper insertion first used `oldText: ""`, which failed, then succeeded only
  after the model learned to anchor against a following function declaration;
- repeated repair reads and edit attempts inflated context after editing had
  already started.
- after validation, the model tried to add an import in
  `execution-read-model.test.ts` using empty `oldText` in several shapes:
  nested `edits`, `replaceAll: false`, and top-level `oldString`/`newString`;
  none landed, and the test file remained unchanged.

Likely root cause:

The edit tool is still too dependent on fragile exact-string anchoring. Kimi
often knows the target line/range and patch intent, but must guess the exact
unique old text shape. That creates trial-and-error and makes larger coherent
edits feel risky.

Likely next fixes:

- Add a line/range-native edit operation:
  `path`, `startLine`, `endLine`, `newText`, optional `expectedOldText`.
- Add insertion forms:
  `insertBeforeLine`, `insertAfterLine`, or equivalent anchored line insert.
- Keep exact-string replacement as compatibility behavior.
- Make multi-location batches natural:
  allow per-edit `path`, non-overlap validation, and atomic application.
- On non-unique `oldText`, return matching line ranges and a ready-to-use
  line/range repair shape.
- On missing `oldText`, return nearest candidate ranges when available.
- On no-op edits, return a direct correction instead of generic special-character
  language.
- Return per-edit diff hunks and line ranges, not only broad file stats.
- Make the model-visible success output say exactly which line ranges changed.

### 2. Edit Replay/Compaction Can Make Repair Worse

Observed failures:

- tool-result truncation fired repeatedly during edit repair;
- settled tool-call replay compacted at least one `newText` body into:
  `[newText omitted from settled tool-call replay; bytes=...; sha256=...]`;
- parent session showed duplicated historical assistant/tool material at the
  same timestamp after truncation;
- raw tool counts became inflated by replay/compaction entries;
- after compaction/replay, the worker resumed from a blocked/type-error state
  and started rereading source from the top.

Likely root cause:

Compaction protects context budget, but the repair loop needs source-shaped
current edit state, not hash-only edit payloads or duplicate replay artifacts.
The model needs to know what is actually in the file now and what edit ranges
were applied.

Likely next fixes:

- Persist applied edit summaries as source-shaped ranges:
  changed file, changed lines, compact hunk, diagnostic refs.
- Do not make the model recover from hash-only omitted edit payloads when the
  omitted text is required for repair.
- In continuation after compaction, include current changed files, current
  diagnostics, and exact repair line windows.
- Keep raw full edit payloads out of parent-visible context, but make the
  current file state readable through normal `read` with exact line ranges.
- Fix proof/tool optics so replay-compacted entries do not inflate ordinary
  tool-count metrics.

### 3. LSP Is Useful But Query Results Are Still Noisy

Observed failures:

- query mode found the target symbols, but also returned many child symbols
  because container-name matches counted as query matches;
- for `buildWorkQueueExecutionReadModel`, the exact function range was visible,
  but many nested variables followed;
- this did not block this run, but it can still push the worker toward extra
  reads.

Likely next fixes:

- In `documentSymbol` query mode, rank exact symbol-name matches first.
- Show target symbol and containing symbol ranges.
- Limit container-only child matches aggressively unless the query explicitly
  asks for nested symbols.
- For large files, show fewer, higher-confidence symbol windows with exact
  `read({ path, offset, limit })` actions.

### 4. Validation Scout Regressed Into Ad Hoc Command Search

Observed failures:

- validation scout tried invalid or low-value TypeScript commands:
  `npx tsc --noEmit --project tsconfig.json --extensions/...`,
  `npx tsc --noEmit --project tsconfig.json <file>`, and then full
  `npx tsc --noEmit --project tsconfig.json`;
- validation then moved into file walking and "temporary minimal tsconfig"
  language;
- validation ran path-only reads of large files;
- validation did not behave like a constrained repo-native diagnostic worker.
- validation eventually produced a misleading TS5097 `.ts` import-extension
  diagnosis because it ran TypeScript outside the repo's normal config shape;
- the parent correctly rejected that diagnosis because this repo intentionally
  uses `.ts` extensions with compatible config.

Observed good behavior:

- when the parent supplied an exact focused command, validation scout executed
  it directly with one `exec`;
- `pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts -- -t "event"`
  succeeded with 3 targeted tests passed and 78 skipped;
- `pnpm test:file extensions/execution-platform/src/work-queue/work-queue-events.test.ts`
  succeeded with 4 tests passed.

Likely root cause:

The validation scout still lacks a hard, model-visible, repo-native command
menu. It is doing discovery instead of executing an approved validation lane.
When it bypasses or distorts the repo config, it can generate false diagnostics
that make the parent repair the wrong problem.

The narrower conclusion is important: validation scout can execute correctly
when handed exact commands. The fragile path is command discovery, not exec
itself.

Likely next fixes:

- Give validation scout a short command menu in its agent prompt/tool guidance.
- Prefer repo-native commands such as focused `pnpm test:file ...` where
  available.
- For TypeScript-only diagnostics, use the established focused check command
  pattern from this repo rather than improvised `tsc -p <file>` variants.
- Forbid "tsc flag archaeology" unless an approved command fails with a clear
  command-discovery error.
- Make validation task output return exact file:line diagnostics and a repair
  target list, not broad narrative.
- Consider exposing an LSP-diagnostics tool path to validation so it can request
  current file diagnostics without inventing shell commands.
- Treat diagnostics from non-repo-native TypeScript command shapes as
  untrusted unless they reproduce through an approved command.

### 5. Parent/Validation Handoff Is Not Clean Enough

Observed failures:

- parent attempted `node_finish` with `status: "blocked"` after partial edit and
  diagnostics, but the proof process continued;
- validation session referenced in truncation text did not directly map to the
  actual `native_task_...jsonl` artifact inspected later;
- parent delegated validation with a reasonable task, but the child still had
  too much freedom to discover command shape.
- after validation returned the bad TS5097 diagnosis, the parent had to spend
  another turn rejecting it and requesting the focused test command.
- the parent later delegated exact focused test commands successfully, but the
  proof still exited without terminal worker state.

Likely next fixes:

- Clarify `node_finish` blocked semantics in live proof: either terminalize as
  bounded `needs_review` or return a precise correction if evidence is missing.
- Make task result/session refs easier to map from parent result to actual child
  session artifact.
- Pass validation command menu and expected diagnostic output shape directly in
  the validation scout's native agent configuration, not only in the parent task
  prose.
- Parent validation delegation should include exact command only when known, and
  the validation scout should execute that command before any command discovery.

### 6. Current Proof Worktree Is Dirty

Observed state:

- The proof has changed
  `extensions/execution-platform/src/work-queue/execution-read-model.ts`.
- Final observed diff in that file was around `+118` insertions.
- `execution-read-model.test.ts` was read and targeted for import/test edits,
  but no test-file diff landed.
- No `work-queue-repository.ts` diff landed in the final observed state.

Likely next action:

- After the live run terminalizes or is killed, inspect and revert the proof
  changes before the next proof attempt unless the user explicitly wants to
  preserve them.

## Current Priority Ranking

1. **Line/range-native edit tool with atomic multi-edit batches**

   Highest impact. Context acquisition is now good enough; mutation precision is
   the blocking surface.

2. **Edit failure repair output**

   The model needs line ranges and ready-to-use repair calls when exact text is
   missing, non-unique, or a no-op.

3. **Validation scout command menu**

   Validation is wasting turns and can still trigger broad context/tool churn.

4. **Compaction/readback for edit repair**

   Preserve current edit state and repair windows after truncation without
   hash-only payloads or replay-count distortion.

5. **LSP query result ranking**

   Useful but second-order after edit and validation; it should reduce remaining
   source reads in large files.

## Next Engineering Slice

1. Implement line/range edit and insertion operations in the existing edit tool.
2. Add per-edit path support and atomic non-overlap validation.
3. Update edit failure messages to return source-shaped candidate ranges and
   ready-to-use repair shapes.
4. Add validation scout repo-native command menu and forbid ad hoc TypeScript
   command discovery in the normal lane.
5. Improve compaction continuation for post-edit repair: changed files, changed
   hunks, current diagnostics, exact repair windows.
6. Tighten LSP query ranking to suppress container-only child floods.
7. Add proof optics:
   first edit, successful edit count, failed edit count by reason, no-op edits,
   line/range edits, validation command count, validation command categories,
   compaction events during edit repair.
