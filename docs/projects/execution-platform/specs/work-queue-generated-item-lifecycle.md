# Work Queue Generated Item Lifecycle

## Purpose

Work Queue active and closed buckets are owner-facing planning/readback state.
They must not be polluted by diagnostic proof rows, fixture middleware rows, or
temporary graph helper rows that were created only to prove a platform boundary.

This spec defines generated Work Queue item classes and their terminal policy.
It exists because proof children from middleware/toolification and Generic
Workflow Runner retirement runs were created as ordinary active queue items.
When those proof jobs intentionally failed, terminal runtime reconciliation kept
them as `needs_review`, which is correct for real owner work but wrong for
diagnostic proof children.

## First Principles

- runtime jobs remain lifecycle truth.
- Work Queue remains projection, readback, planning, and bounded control.
- generated child items are projections of graph/runtime/proof state; they are
  not automatically owner-planned work.
- proof diagnostics should remain inspectable as evidence, but they should not
  occupy the default active work queue.
- parent closeout/finalization must define what happens to generated children.
- deterministic runtime validates origin, refs, terminal policy, storage flags,
  and transitions; it does not judge proof/work quality.

## Generated Item Classes

Every generated item must carry bounded origin metadata:

- `originKind`
  - `runtime_graph_child`
  - `workflow_child_action`
  - `proof_diagnostic`
  - `middleware_fixture`
  - `closeout_followup`
- `createdBy`
  - runtime component, proof script, workflow id, or tool id
- `parentWorkItemId`
- `owningRuntimeJobId`
- `owningGraphId` / `owningNodeId` when graph-backed
- `terminalPolicy`
  - `close_with_parent`
  - `archive_with_parent`
  - `remain_actionable`
  - `debug_only`
- `retentionPolicy`
  - `owner_visible_until_terminal`
  - `debug_hidden_from_owner_queue`
  - `owner_actionable`
- `rawPromptStored: false`
- `rawResponseStored: false`
- `rawLogsStored: false`
- `rawDbRowsStored: false`

These fields are canonical validated metadata under `generatedItemLifecycle`.
If generated-item querying grows hot, they should become indexed DB columns.
The semantics must not depend on title text, item id prefixes, or proof-script
naming conventions.

## Creation Boundary

Production and proof code should not create generated children through raw
`createWorkItem(...)`.

Required creation APIs:

- `createGeneratedWorkItem(...)`
- `syncRuntimeGraphNodeToWorkQueue(...)`

Those APIs must set `originKind`, `terminalPolicy`, retention policy, parent
linkage, runtime job linkage where available, bounded evidence refs, and
raw-storage flags.

Proof scripts may create diagnostic Work Queue rows only through the proof
diagnostic helper. Prefer runtime tool traces/artifacts when a visible Work
Queue child is not needed.

## Terminal Policy

When a parent item reaches accepted closeout or an explicit terminal
needs-review state, generated children are reconciled by origin and terminal
policy:

- `proof_diagnostic` + `debug_only`: archive from owner active queue, preserve
  evidence in debug/admin readback.
- `middleware_fixture` + `debug_only`: archive from owner active queue after
  proof summary/closeout is recorded.
- `runtime_graph_child` + `close_with_parent`: close if its required evidence
  is accepted and the parent closes.
- `runtime_graph_child` + `archive_with_parent`: archive optional projection
  rows when the parent closes.
- `runtime_graph_child` + `remain_actionable`: keep open only when the parent
  closeout explicitly marks the child intentionally open.
- `human_task`: remain owner-visible while waiting; close/archive only after
  bounded response, expiry, cancellation, or parent terminal policy.
- `proactivity_seed`: remains review-gated owner work only after a planning
  capsule/intake accepts it. Unaccepted seeds stay diagnostic/proposal state.

Failed runtime jobs attached to proof diagnostics do not become owner-visible
`needs_review`. Failed runtime jobs attached to real owner-planned or
`remain_actionable` child work do become `needs_review`.

## Active Queue Filtering

The default owner active queue excludes:

- `proof_diagnostic`
- `middleware_fixture`
- generated items with `terminalPolicy: debug_only`
- archived generated children

Admin/debug readback may show those items with parent proof refs, runtime job
refs, terminal reconciliation reason codes, and artifact refs.

## Reconciliation Requirements

`reconcileTerminalRuntimeProjections(...)` must:

- distinguish generated proof diagnostics from real owner work.
- archive proof diagnostics when their runtime jobs fail, time out, or are
  canceled.
- archive stale proof diagnostics with no runtime job link when their parent is
  terminal or when their retention window expires.
- keep real failed owner work in `needs_review`.
- record bounded events for every generated-child transition.

`completeWorkQueueItemFromCloseout(...)` must:

- call generated-child reconciliation for the parent item.
- reject clean closeout if required generated children remain open without
  `remain_actionable` justification.
- include generated-child cleanup refs in closeout/readback artifacts.

## Current Cleanup Target

The immediate cleanup pass must retire these leaked generated rows through the
server/repository lifecycle, not manual status edits:

- middleware proof live-completion items:
  - model-task middleware live completion
  - script middleware live completion
  - DB operation middleware live completion
  - repeated script/DB proof children
- Generic Workflow Runner retirement proof children:
  - `product_spec_planning`
  - `docs_skills`
  - `coding_production_ready_wrong_job_type`
  - `unknown_workflow`
  - all repeated proof-attempt children

The cleanup artifact must prove no real owner-planned item was archived.

Implementation result: the cleanup pass archived 9 `middleware_fixture` /
`debug_only` rows and 20 `proof_diagnostic` / `debug_only` rows through
repository reconciliation. Default owner active queue readback now starts at
Product/Spec Planning Production Upgrade.

## Tests

Required regression tests:

- failed proof diagnostic child is archived/debug-only, not active
  `needs_review`.
- failed real runtime child remains owner-visible `needs_review`.
- parent accepted closeout finalizes generated children according to terminal
  policy.
- stale generated proof child without runtime link is archived after parent
  terminal state or retention expiry.
- default active queue excludes proof diagnostics and middleware fixtures.
- debug/admin readback can still inspect generated diagnostic children.
- proof scripts cannot create generated proof children without origin and
  terminal-policy metadata.
