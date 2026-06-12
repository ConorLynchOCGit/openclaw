---
summary: "Proposal for making Kimi's first implementation edit a maximal currently-grounded coherent vertical batch, with compact LSP navigation, accurate edit feedback, and terminal proof hygiene."
title: "OpenClaw Kimi Coherent Vertical Edit Batch"
---

# OpenClaw Kimi Coherent Vertical Edit Batch

## Status

Implemented locally from the Work Queue delta Kimi live proof diagnosis on 2026-06-11.

## Diagnosis

1. **LSP is visible but not useful enough**

Kimi did call `lsp` immediately, so visibility is solved. But `documentSymbol` returned huge flat dumps:

- `execution-read-model.ts`: 1,728 symbols, about 51KB visible text, truncated.
- `work-queue-repository.ts`: 1,047 symbols, about 51KB visible text, truncated.

That is not a useful navigation surface. It buries target symbols and falls into generic managed-output text. For LSP output, the next action should be "rerun LSP with a query" or "read this exact symbol range," not "search saved output."

2. **Edit transition is still late**

Kimi had a clear patch shape around +10-11 minutes, but first accepted edit was around +14m38s from first model activation. The normalized run had roughly `35 read`, `8 grep`, and `3 lsp` calls before the accepted edit.

3. **First mutation was too timid**

Its plan was a coherent vertical slice: add delta readback field, build it from `WorkQueueEventStore`, wire it into read model/summary, then test. The edit only added an import and type field. That is scaffolding, not implementation.

4. **Edit feedback is misleading**

Actual diff was about 27 insertions. The edit tool told Kimi `+1220 -1193`. That can easily make the model cautious after a successful small edit.

5. **Provider/error terminalization failed**

Final normalized stop reason was `error`, but no terminal proof artifact was written. That is proof hygiene we still need to fix.

## Proposal

1. **Make LSP a compact navigator**

`documentSymbol` should return top-level/export outline first, sorted by line number, with name, kind, path, line range, `resultCount`, `shownCount`, and `omittedCount`. Nested properties should be omitted unless queried. Query mode should return matching symbols plus containers and exact `read({ path, offset, limit })` next actions.

2. **Give LSP tool-specific truncation**

Do not use generic "Full output saved; use Grep/Read" text for LSP. Say: rerun `lsp` with a narrower `query`, or read the returned symbol range.

3. **Change the edit-batch rule**

Replace "smallest coherent vertical edit" with:

> When target files, target symbols, patch shape, and validation signal are known, make the largest currently-grounded coherent vertical edit batch as early as possible. Prefer one non-overlapping batch that includes producer, wiring, and first consumer when those locations are visible. If only part is grounded, edit that part now and let validation drive the next repair.

4. **Local uncertainty must not block editing**

General rule:

> If the remaining uncertainty is local and validation can reveal it, edit now. Do not keep searching for complete architecture certainty.

5. **Fix edit diff stats**

Calculate model-visible additions/deletions from actual replacements where possible. Suppress misleading whole-file stats when they disagree wildly with replacement-local stats.

6. **Make multi-location edit natural**

The edit tool should explicitly encourage coherent non-overlapping batches when the patch shape is known. Kimi is trying to act like OpenCode here; the schema/description should make that path obvious.

7. **Make post-edit diagnostics repair-oriented**

LSP diagnostics after a successful edit should say "next repair target," not imply the edit was disastrous. Cap diagnostic text so useful file:line errors survive.

8. **Terminalize provider errors**

A final provider `stopReason:"error"` must write a bounded `needs_review` or `failed` proof artifact and clear live-state. No stale running state.

9. **Focused tests**

Only touched surfaces:

- compact LSP outline on huge files;
- LSP query returns target ranges;
- small edit reports small stats;
- provider error writes terminal artifact;
- stale-state terminalization still works.

## Core Correction

Make the first edit a maximal currently-grounded implementation batch, not a minimum scaffold. The agent should start early, but when it starts, it should do all visible coherent work in that slice.

## Implementation Tracking

- [x] Make `documentSymbol` return a compact top-level/export outline by default.
- [x] Add `documentSymbol` query-mode shaping with matching symbols, containers, and exact read next actions.
- [x] Replace generic managed-output truncation wording for LSP with LSP-specific next actions.
- [x] Update Kimi implementation prompt wording from "smallest" to "largest currently-grounded coherent vertical edit batch as early as possible."
- [x] Add the general local-uncertainty edit-now rule.
- [x] Fix edit diff stats to prefer replacement-local deltas and suppress misleading whole-file stats.
- [x] Make multi-location non-overlapping edit batches natural in edit tool model-facing text/schema.
- [x] Reframe post-edit diagnostics as next repair targets and cap diagnostic text.
- [x] Terminalize provider `stopReason:"error"` into bounded proof artifacts and cleared live-state.
- [x] Run focused tests for the touched surfaces only.

## Validation

Focused non-live tests:

- `pnpm test:file src/agents/tools/lsp-tool.test.ts src/agents/system-prompt-contribution.test.ts src/agents/pi-tools.read.host-edit-recovery.test.ts src/agents/session-tool-result-guard.test.ts src/scripts/execution-platform-boundary-replay-terminalization.test.ts`
- `pnpm exec tsc --ignoreConfig --noEmit --pretty false --module NodeNext --moduleResolution NodeNext --target ES2022 --lib ES2023 --skipLibCheck src/agents/tools/lsp-tool.ts src/agents/openclaw-lsp-service.ts src/agents/system-prompt-contribution.ts src/agents/pi-tools.host-edit.ts`
- `node --check scripts/execution-platform-run-product-spec-boundary-replay.mjs`
- `git diff --check -- src/agents/tools/lsp-tool.ts src/agents/openclaw-lsp-service.ts src/agents/system-prompt-contribution.ts src/agents/pi-tools.host-edit.ts scripts/execution-platform-run-product-spec-boundary-replay.mjs src/agents/tools/lsp-tool.test.ts src/agents/system-prompt-contribution.test.ts src/agents/pi-tools.read.host-edit-recovery.test.ts src/scripts/execution-platform-boundary-replay-terminalization.test.ts docs/projects/execution-platform/specs/openclaw-kimi-coherent-vertical-edit-batch.md`

No live proof run was performed for this implementation pass.
