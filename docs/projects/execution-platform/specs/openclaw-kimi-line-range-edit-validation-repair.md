---
summary: "Proposal for the next Kimi proof repair slice: edit precision, validation command discipline, post-compaction repair context, and remaining context locator improvements."
title: "OpenClaw Kimi Line Range Edit And Validation Repair"
---

# OpenClaw Kimi Line Range Edit And Validation Repair

Implementation status: completed for the non-live implementation slice. The live proof rerun remains intentionally not run because the active instruction for this goal is "Do not run a live proof."

Implementation tracking

- [x] Revert proof edits in `extensions/execution-platform/src/work-queue/execution-read-model.ts` before the next proof.
  - Evidence: `git diff -- extensions/execution-platform/src/work-queue/execution-read-model.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/work-queue/work-queue-repository.ts` produced no diff.
- [x] Add line/range-native edit and insertion operations.
  - Evidence: `src/agents/pi-tools.params.ts` accepts `startLine`, `endLine`, `insertBeforeLine`, `insertAfterLine`, and `expectedOldText`; `src/agents/pi-tools.host-edit.ts` materializes those shapes into exact replacements.
  - Test: `pnpm test:file src/agents/pi-tools.read.host-edit-recovery.test.ts`
- [x] Make multi-location edit batches atomic and natural.
  - Evidence: `src/agents/pi-tools.host-edit.ts` supports per-edit paths, validates overlap for line/range operations, applies multi-file batches through `writeFile`, and rolls back earlier writes if a later write fails.
  - Test: `pnpm test:file src/agents/pi-tools.read.host-edit-recovery.test.ts`
- [x] Return candidate line ranges and ready repair calls on edit failures.
  - Evidence: `src/agents/pi-tools.host-edit.ts` returns candidate line ranges and a ready range edit shape when exact replacement text is missing, ambiguous, or mismatched.
  - Test: `pnpm test:file src/agents/pi-tools.read.host-edit-recovery.test.ts`
- [x] Give validation scout a repo-native command menu and block normal-lane ad hoc `tsc` discovery.
  - Evidence: validation scout docs/tool descriptions list focused `pnpm test:file` commands, and `src/agents/bash-tools.exec.ts` rejects raw TypeScript compile discovery for `execution-validation-scout`.
  - Test: `pnpm test:file src/agents/bash-tools.test.ts -- -t "validation scouts"`
- [x] Improve edit repair compaction/readback.
  - Evidence: mutation tool-result events carry `diffByteCount`, `firstChangedLine`, and `diagnosticSummaries`; change-set working context persists compact diagnostics; node-worker compaction repair context emits `<changed_hunks>` and `<diagnostics>` blocks.
  - Tests:
    - `pnpm test:file src/agents/pi-embedded-subscribe.handlers.tools.test.ts -- -t "persists successful mutations as compact change_set working context"`
    - `pnpm test:file src/agents/pi-embedded-runner/run.overflow-compaction.loop.test.ts -- -t "adds source-shaped changed-file repair windows"`
- [x] Tighten LSP query ranking and file-scoped grep excerpts.
  - Evidence: `src/agents/tools/lsp-tool.ts` ranks direct documentSymbol name matches first, adds containing symbols, limits nested children, and renders exact `read({...})` next actions; `src/agents/tools/repo-discovery-tools.ts` returns small source excerpts for file-scoped grep matches.
  - Tests:
    - `pnpm test:file src/agents/tools/lsp-tool.test.ts`
    - `pnpm test:file src/agents/tools/repo-discovery-tools.test.ts -- -t "adds small source excerpts"`
- [x] Keep edit schema/provider affordance aligned with the new line/range shapes.
  - Evidence: provider-visible edit schema includes line/range and insertion properties and the invalid-shape diagnostic includes a corrected example.
  - Test: `pnpm test:file src/agents/pi-tools.create-openclaw-coding-tools.adds-claude-style-aliases-schemas-without-dropping-f.test.ts`
- [x] Record the same Work Queue delta proof rerun as intentionally not run under this goal.
  - Not run by instruction: the active goal explicitly says "Do not run a live proof."

Focused validation run for this implementation slice:

- `pnpm test:file src/agents/pi-tools.read.host-edit-recovery.test.ts` passed: 21 tests.
- `pnpm test:file src/agents/pi-tools.create-openclaw-coding-tools.adds-claude-style-aliases-schemas-without-dropping-f.test.ts` passed: 7 tests.
- `pnpm test:file src/agents/tools/lsp-tool.test.ts` passed: 8 tests.
- `pnpm test:file src/agents/bash-tools.test.ts -- -t "validation scouts"` passed: 2 tests, 29 skipped.
- `pnpm test:file src/agents/pi-embedded-runner/run.overflow-compaction.loop.test.ts -- -t "adds source-shaped changed-file repair windows"` passed: 1 test, 17 skipped.
- `pnpm test:file src/agents/tools/repo-discovery-tools.test.ts -- -t "adds small source excerpts"` passed: 1 test, 14 skipped.
- `pnpm test:file src/agents/pi-embedded-subscribe.handlers.tools.test.ts -- -t "persists successful mutations as compact change_set working context"` passed: 1 test, 33 skipped.

Completion notes

- The implementation slice is complete through focused non-live validation.
- Live-proof behavior criteria such as "first edit remains near the current improved range" and "proof terminalizes through normal result/error semantics" require the intentionally skipped proof rerun. They are therefore not claimed as proven by this non-live goal.
- A broad `pnpm exec tsc --noEmit --pretty false --incremental false` probe was attempted during implementation and aborted with `SIGABRT`; it did not emit actionable diagnostics and is not counted as validation evidence.

Proof outcome

- Proof run: product-spec-boundary-replay-work-queue-delta-coherent-edit-batch-20260611T160551Z
- Node run: nrun_7e80cb837b541eaeb4eb
- First model activation baseline: 16:07:37Z
- First LSP: +38s
- Concrete patch plan: about +2m43s
- First edit call: about +4m04s
- First validation task: about +15m42s
- Final observed parent activity: about +22m26s
- Final artifact: .artifacts/execution-platform/proof-runs/product-spec-boundary-replay-work-queue-delta-coherent-edit-batch-20260611T160551Z/product-spec-boundary-replay-error.json

- Error: ReplayProcessExitedWithoutTerminalState

Core read

Context acquisition is much better. Kimi used LSP early, formed a valid patch shape, edited early, and continued into a real vertical implementation attempt. The remaining main blocker is now edit precision. The tool forces fragile exact-string anchoring, so the worker burns turns on missing/non-unique/no-op replacements instead of applying line/range patches.

Validation also still has a split failure:

- Exact validation commands work well: focused pnpm test:file ... -- -t "event" passed, and work-queue-events.test.ts passed.
- Open-ended validation command discovery is bad: it invented invalid tsc shapes and produced a false .ts import-extension diagnosis.

I recorded the durable running tally here and indexed it:
services/openclaw-roles/live/docs/projects/execution-platform/specs/openclaw-kimi-proof-running-failure-tally.md

Top next fixes from the tally:

1. Add line/range-native edit and insertion operations.
2. Make multi-location edit batches atomic and natural.
3. Return candidate line ranges/ready repair calls on edit failures.
4. Give validation scout a repo-native command menu and stop ad hoc tsc archaeology.
5. Improve edit repair compaction/readback so replay does not hide needed source/edit state.

Original proof diff landed only in extensions/execution-platform/src/work-queue/execution-read-model.ts at about +118; the test-file edit attempts did not land. Those proof edits have now been reverted for the next clean proof.

1. Tighten LSP query output
   documentSymbol query mode still returns too many container-child matches. It should return exact symbol matches first, then the containing symbol, then maybe a tiny bounded set of nested children. This would reduce extra reads after LSP.

2. Make LSP result more directly actionable
   Each returned symbol should include a ready exact read call:
   read({ path, offset: startLine, limit: N })
   It does this somewhat now, but we should make that the dominant visible output.

3. Improve file-scoped grep as a locator
   For file-scoped grep, return line numbers plus a small surrounding excerpt by default. If Kimi greps a known file for a symbol, it should usually have enough to read or edit without another locator step.

4. Fix post-compaction context reacquisition
   After edit/validation compaction, the model resumed by rereading and repairing awkwardly. Continuation should include current changed files, changed hunks, exact diagnostics, and repair windows. That is not initial acquisition, but it prevents re-acquisition after repair begins.

5. Validation context acquisition needs a command menu
   Validation scout still does bad "discover the right command" behavior. Exact commands work. Open-ended command discovery does not. That is a validation-acquisition issue, not a parent source-acquisition issue.

Combined Proposal

The proof showed a real phase change: context acquisition is no longer the dominant blocker. Kimi used LSP early, formed a valid patch shape, entered editing early, and continued into a real vertical implementation attempt. The next repair slice should preserve that gain and focus on the surfaces still causing churn: edit precision, validation command discipline, post-compaction repair context, and a few remaining locator affordances.

Primary fixes:

1. Add line/range-native edit and insertion operations.

   Support:
   - path
   - startLine
   - endLine
   - newText
   - optional expectedOldText
   - insertion before/after a line

   This lets Kimi patch the line ranges it just read instead of guessing an exact globally unique oldText.

2. Make multi-location edit batches atomic and natural.

   Support per-edit path, validate non-overlap, and apply the whole batch atomically. Kimi is trying to make OpenCode-style coherent batches; the tool should accept that shape directly.

3. Return candidate line ranges and ready repair calls on edit failures.

   For failed exact-string edits:
   - missing oldText: return nearest candidate ranges when available;
   - non-unique oldText: return all matching line ranges;
   - no-op edit: say it was identical and show the current line/range;
   - invalid schema: return the accepted shape plus a direct corrected example.

4. Give validation scout a repo-native command menu.

   Validation scout should not do tsc flag archaeology. It should prefer exact known commands, especially pnpm test:file ..., and treat non-repo-native TypeScript diagnostics as untrusted unless reproduced by an approved command.

5. Improve edit repair compaction/readback.

   After edit/validation compaction, continuation should preserve:
   - current changed files;
   - changed hunks;
   - exact diagnostics;
   - exact repair line windows.

   Do not make the model recover from hash-only omitted edit payloads when the omitted text matters for repair.

Remaining context improvements:

1. Tighten LSP query output.

   documentSymbol query mode still returns too many container-child matches. It should return exact symbol matches first, then containing symbols, then only a tiny bounded set of nested children.

2. Make LSP results more directly actionable.

   Each returned symbol should prominently include an exact read call:

   read({ path, offset: startLine, limit: N })

   That should be the dominant visible next action.

3. Improve file-scoped grep as a locator.

   For file-scoped grep, return line numbers plus a small source excerpt by default. If Kimi greps a known file for a symbol, it should usually have enough to read or edit without another locator step.

4. Fix post-compaction context reacquisition.

   The model resumed awkwardly after edit/validation compaction. This is not initial acquisition, but it creates re-acquisition after repair begins. Continuation should be source-shaped and repair-targeted.

5. Keep validation context acquisition exact.

   Exact commands work. Discovery does not. Validation should receive or know the approved command menu and execute the most direct command before any exploration.

Implementation order:

1. Revert proof edits in execution-read-model.ts before the next proof.
2. Implement line/range edit and insertion support.
3. Add atomic multi-path/multi-location edit batching.
4. Upgrade edit failure output with candidate ranges and ready repair calls.
5. Add validation scout command menu and block normal-lane ad hoc `tsc` discovery.
6. Improve compaction continuation for edit repair state.
7. Tighten LSP query ranking and file-scoped grep excerpts.
8. Rerun the same Work Queue delta proof.

Success criteria:

- First edit remains near the current improved range, not back to 10+ minutes.
- Failed exact-string edits drop sharply.
- Kimi uses line/range or insertion edits for source it just read.
- Multi-location vertical edit batches land atomically.
- Validation scout uses exact approved commands, not improvised `tsc`.
- Compaction does not force rereading from top-of-file or hash-only recovery.
- Proof terminalizes through normal result/error semantics, not `ReplayProcessExitedWithoutTerminalState`.
