---
summary: "Production architecture for non-Codex file-edit workers using runtime tools instead of giant JSON patch proposals."
title: "Non-Codex Tool Worker Runtime"
---

# Non-Codex Tool Worker Runtime

Date: 2026-05-18

Status: pre-Product/Spec blocker.

## Problem

The Product/Spec boundary replay reached real implementation nodes and invoked
the Kimi/non-Codex implementation lane, but the lane still depended on a large
model-authored JSON patch proposal. Kimi returned useful-looking natural
language/non-JSON output, and the adapter rejected it at the JSON parse
boundary before any runtime-owned inspect, edit, validate, repair, or evidence
steps could happen.

That is not Codex parity. Codex succeeds because the model works inside a tool
loop: inspect files, reason over concrete context, edit files through a
runtime-owned mechanism, run validation, inspect failure, repair, and emit
evidence. Asking a non-Codex model to author one giant schema object turns the
adapter into a parser choke point and misjudges the model before it has the
same working conditions.

## Design Principle

Use the same model/runtime boundary everywhere:

- Model decides objective understanding, semantic usefulness, edit intent,
  sufficiency, failure meaning, repair strategy, and escalation rationale.
- Runtime owns schemas, refs, file reads/writes, patch application, validation
  execution, persistence, bounds, authority, budgets, locks, lifecycle, and
  raw-storage policy.

Non-Codex implementation workers must not produce production file edits by
returning a giant JSON patch proposal. They must operate through a
model-agnostic runtime tool worker.

## Production Runtime

Introduce `NonCodexToolWorkerRuntime` as the production implementation lane for
Kimi and future non-Codex coding workers.

Inputs:

- `ImplementationTaskPacket v2`
- accepted Mission Ledger refs
- commitment work packet refs
- context scout/synthesis refs
- selected capability and cost-policy refs
- bounded source-prompt excerpt refs
- target and denied scope refs
- validation plan refs
- budget/timeout/cancellation policy refs

Outputs:

- runtime tool invocation refs
- changed-file refs
- validation refs
- failure classification refs when needed
- repair refs when needed
- evidence claims mapped to commitment ids
- bounded owner-facing progress events
- explicit escalation refs when the worker is not sufficiently capable

## Tool Surface

The non-Codex worker gets a narrow but real coding harness:

- `repo.search`: runtime-owned repository search over approved paths.
- `file.read`: bounded file snapshot by ref/path/symbol.
- `file.inspect_symbols`: symbol/import/export/test discovery for target files.
- `worker.request_context`: ask the scheduler/context layer for missing
  original prompt excerpts, repo context, upstream node output, or human
  clarification.
- `edit.plan`: model-authored edit plan with target files, intent, risk, and
  validation expectation.
- `edit.apply_patch`: runtime-owned patch application with conflict and scope
  validation.
- `validation.run`: runtime-owned validation command execution from approved
  command refs.
- `failure.classify`: model-authored failure classification mapped to
  commitments and repairability.
- `repair.plan`: model-authored bounded repair plan using validation failure
  evidence.
- `evidence.emit`: model-authored evidence claim summary; runtime validates
  refs, raw-storage flags, and commitment ids.
- `worker.escalate`: explicit escalation when context, authority, tool support,
  scope, or model capability is insufficient.

The model sees tool descriptions and results. It does not invent runtime-owned
node kinds, executor keys, file refs, evidence enums, or persistence payloads.

## Provider Modes

Native tool calling is preferred when the provider/model supports it.

For providers that do not support native tool calls, runtime may use a strict
single-tool-call envelope as an emulation transport:

```json
{
  "toolName": "file.read",
  "arguments": {
    "fileRef": "..."
  },
  "rationale": "..."
}
```

This envelope is only a transport for one next action, not a full patch or
completion object. The provider must pass qualification tests before the
runtime can select it for production implementation work.

## Worker Model Policy Slots

The non-Codex worker loop is no longer a single-model loop. Production
selection uses explicit model slots so cheap/fast models can control the
worker while patch generation remains assigned to the model currently proven
best for scoped source edits.

Canonical pre-Product/Spec policy:

- `controller`: `qwen/qwen3-coder-next`, OpenRouter, `reasoningMode: none`.
  Used for tool selection, validation command selection, continuation, and
  small bounded control decisions.
- `context_decision`: `qwen/qwen3-coder-next`, OpenRouter,
  `reasoningMode: none`. Used to request/search/read bounded context before
  edits.
- `patch`: `moonshotai/kimi-k2.6`, OpenRouter, `reasoningMode: none`. Used
  only when bounded snapshots/context are present and the next action should be
  `edit.plan`/`edit.apply_patch`.
- `validation_repair`: `qwen/qwen3-coder-next`, OpenRouter,
  `reasoningMode: none`. Used to classify validation failures, choose rerun vs
  targeted repair vs escalation, and preserve prior runtime progress.
- `evidence`: `qwen/qwen3-coder-next`, OpenRouter, `reasoningMode: none`.
  Used to emit commitment-linked evidence claims from runtime-owned changed
  file refs and validation refs.
- `escalation`: `qwen/qwen3-coder-next`, OpenRouter, `reasoningMode: none`.
  Used to produce bounded escalation diagnostics when the worker lacks
  context, authority, capability, or budget.

Kimi patch/worker turns must not use `reasoningMode: omit`. Current benchmark
evidence showed `omit` can burn output budget and return no parseable content,
while `reasoningMode: none` produced valid patch-tool JSON quickly. Router and
context-scout defaults must not be promoted to Qwen solely from this worker
evidence; they require separate per-stage latency and valid-output gates.

Update, 2026-05-19: production non-Codex worker execution now evaluates a
provider-capability slot gate before the first model call. Qwen is the default
qualified controller/context-decision/validation-repair/evidence/escalation
slot for the worker loop. Kimi is production-qualified only for the bounded
patch-author slot with `reasoningMode: none`; Kimi controller use and Kimi
patch-author use with omitted reasoning both block before provider calls.
Worker results and Work Queue readback include model slot policy and the
provider-capability gate state.

Update, 2026-05-19: scheduler selection now goes through registry-derived
Provider Capability Profiles. Non-Codex source-edit profiles must be
production-selectable, workflow/phase valid, and qualification-backed before
they can create production nodes. Runtime derives worker ref, tool authority,
budget, expected evidence, and selected qualification profile; the model
selects only capability/profile fit and rationale.

## Qualification Gate

Every non-Codex provider/model profile must be qualified for each production
worker capability before scheduler selection.

Qualification proves the model can:

1. choose an inspect/search/read tool from a concrete task packet.
2. request missing context instead of guessing.
3. produce an edit plan for a bounded target.
4. use runtime patch application successfully.
5. read validation failure and propose a bounded repair.
6. emit evidence claims tied to commitment ids.
7. escalate clearly when the task exceeds capability, authority, context, or
   budget.
8. complete without raw prompt, raw response, raw log, or secret storage.

Unqualified profiles may be used only in lane tests or diagnostic probes. They
cannot satisfy production implementation evidence or clean workflow success.

## Scheduler Integration

Capability policy must select non-Codex tool workers only through qualified
worker refs.

For multi-commitment missions:

- broad Codex implementation remains integration/escalation, not the default
  first implementation lane.
- non-Codex workers receive scoped implementation units with concrete context
  packets and validation refs.
- if the non-Codex worker requests more context, the scheduler must route that
  request through context supply rather than forcing implementation.
- if the non-Codex worker fails structurally once, the runtime attempts a
  field-specific/tool-specific repair if the provider is qualified for that
  repair class.
- if the worker cannot proceed, it escalates with bounded reason codes and
  preserved partial evidence.

## Runtime Loop

Production loop:

1. Compile the worker task packet from scheduler node contract and context
   synthesis.
2. Validate provider qualification for the requested capability and scope.
3. Start a runtime tool worker span with budget, cancellation, heartbeat, and
   owner-facing progress.
4. Let the model choose the next tool action.
5. Execute the tool in runtime.
6. Persist bounded tool result refs and progress events.
7. Continue until evidence is emitted, repair budget is exhausted, escalation
   occurs, cancellation occurs, or timeout occurs.
8. Return a node result with commitment evidence claims, limitations, changed
   files, validation refs, and next-action recommendation.

No production success path may bypass this loop through a single JSON patch
proposal.

Update, 2026-05-19: file mutation inside this loop is now transaction-owned.
The production loop starts an `EditTransactionEngine` instance for each scoped
implementation task. Runtime edit tools record the transaction ref, snapshots,
apply result, validation refs, repair attempts, evidence refs, rollback refs,
and raw-storage flags. The worker may still author edit intent and bounded
patch content, but clean completion requires a closed edit transaction plus
validation and commitment evidence. Natural-language claims, giant patch JSON,
or changed-file refs without a transaction are not production success
evidence.

Canonical transaction tool surface:

- `edit_transaction.start`
- `edit_transaction.read_file`
- `edit_transaction.plan`
- `edit_transaction.apply_patch`
- `edit_transaction.validate`
- `edit_transaction.repair`
- `edit_transaction.emit_evidence`
- `edit_transaction.rollback`
- `edit_transaction.close`

Work Queue readback now treats transaction refs as owner-facing implementation
evidence. It must show transaction phase/status, touched files, validation
refs, repair count, evidence refs, and rollback/discard state where present.

Update, 2026-05-19: production non-Codex worker execution is now split into
controller, author, applicator, validation/repair, evidence, and escalation
phases. The production file-edit adapter enables strict phase authority:
controller/context slots can select work or request context but cannot apply
edits; patch-author slots author bounded edit plans/content; runtime
applicator phases apply through `EditTransactionEngine`; validation repair
slots classify and repair failure; evidence slots claim commitment evidence
from runtime-owned change/validation refs. Worker results and Work Queue
readback include worker phase refs/records so the operator can see whether the
worker is deciding, authoring, applying, validating, repairing, claiming
evidence, or escalating.

Update, 2026-05-19 repair hardening: worker-internal retry is now covered by
the canonical runtime repair-classification invariant. The non-Codex worker
does not privately loop on validation failure, stale patch context, provider
no-content, timeout, or diagnostic-only repair turns. It records a bounded
`RuntimeRepairClassification`, evaluates the shared retry gate, and carries
classification refs/summaries in both worker results and Work Queue readback.

Update, 2026-05-19 compound tools: the worker loop now supports production
compound coding tools for common scoped edits:

- `coding.inspect_edit_validate`
- `coding.add_test_and_validate`
- `coding.update_docs_and_cross_refs`
- `coding.refactor_symbol_with_lsp`
- `coding.fix_type_errors`
- `coding.apply_small_patch_with_evidence`

These are not shortcuts around runtime truth. Each compound operation is a
single model-selected runtime tool call whose executor records internal
sub-events for inspect, plan, apply, validate, repair classification,
evidence, and close. Clean completion still requires changed-file refs,
validation refs, evidence claims, and a closed edit transaction. Missing
bounded edits, failed patch application, missing semantic backend refs for
LSP-style refactors, or failed validation become `needs_review` with repair
classification evidence.

Work Queue readback surfaces the compound tool id and sub-event phases from
worker-internal progress, so operators can see that the worker is inside a
compound inspect/edit/validate/evidence operation rather than a silent model
call.

## Failure Semantics

- malformed tool action: one action-specific repair, then `needs_review`.
- missing context: `worker.request_context`, not implementation failure.
- patch conflict: runtime reports conflict evidence; model may repair once.
- validation failure: failure classification and repair plan become scheduler
  evidence.
- provider no-content/timeout: profile diagnostic evidence plus escalation or
  needs-review; do not blame the task semantics.
- unqualified provider: scheduler must choose another qualified worker or
  escalate to Codex with cost rationale.

## Work Queue Readback

Work Queue active graph readback must show:

- current worker/model/provider
- current tool step
- objective and commitment ids
- target files/refs
- context refs supplied and context requested
- edit plan summary
- patch apply result
- validation command and state
- failure/repair state
- evidence claim refs
- escalation reason
- ELI5 owner summary

The owner should see what the worker is doing while it is doing it, not only a
terminal JSON parse failure.

## Migration And Retirement

The existing Kimi/non-Codex giant patch proposal path becomes test/compat only.
It may remain as a diagnostic fixture while the new runtime lands, but:

- it cannot be selected by production scheduler capabilities.
- it cannot produce clean implementation evidence.
- it cannot satisfy Mission Ledger commitments.
- it cannot produce production Work Queue closeout.
- it must be hard-disabled from non-proof live `agent_team.coding`.

After qualification and Product/Spec replay pass through the new runtime, the
legacy proposal path should be deleted or left only as an explicitly named
parser-choke regression fixture.

## Pre-Proof Gate

Product/Spec Planning proof is paused until this item is complete.

Pass gates:

1. Kimi/non-Codex workers run through `NonCodexToolWorkerRuntime`, not a giant
   JSON patch object.
2. At least one provider profile is qualified for a real scoped source edit.
3. Runtime applies the edit through file tools and validates it.
4. Validation failure can return to the worker for repair without restarting
   the whole proof.
5. Evidence claims map changed files and validation refs to commitments.
6. Work Queue readback surfaces worker tool progress.
7. Production scheduler refuses unqualified non-Codex worker refs.
8. Broad Codex escalation requires recorded cheaper-worker unsuitability.
9. The Product/Spec boundary replay can restart from an accepted graph frontier
   and run the implementation node through the new runtime.
