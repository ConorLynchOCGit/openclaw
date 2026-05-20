# Work Queue Runtime Projection Truth

- Date: 2026-05-14
- Decision: `db_is_canonical_work_queue_status_truth`
- Reason: `source_code_tracker_status_required_manual_edits_and_caused_drift`

## 2026-05-14 DB-Primary Status Correction

Execution Platform DB is now canonical truth for Work Queue item status,
active/closed buckets, and active queue numbering.

Removed live truth sources:

- source-code convergence tracker status.
- source-code active/remaining queue numbering.
- source-code close/complete state.
- source-code bootstrap/audit fallback for live Work Queue truth.

The source tracker file and test were deleted:

- `extensions/execution-platform/src/work-queue/convergence-slice-tracker.ts`
- `extensions/execution-platform/src/work-queue/convergence-slice-tracker.test.ts`

Canonical DB fields now include:

- `queue_status`
- `queue_rank`
- `closed_at`
- `closed_by_runtime_job_id`
- `closed_by_closeout_ref`
- `closeout_capsule_ref`
- `validation_ref`
- `graph_ref`
- `owner_readback_ref`

## Generated Item Lifecycle Addendum

DB-primary Work Queue truth also requires generated item semantics. Source code
or proof scripts may seed initial planning items, but generated runtime/proof
children must be classified before they enter active queue readback.

Generated items must carry:

- `originKind`
- `terminalPolicy`
- `parentWorkItemId`
- `owningRuntimeJobId`
- graph/node refs when available
- retention policy
- raw-storage flags

Default active/closed buckets are owner-facing. They should not show
`proof_diagnostic`, `middleware_fixture`, or `debug_only` generated rows. Those
rows remain available through debug/admin readback and proof artifacts.

See `work-queue-generated-item-lifecycle.md`.

Runtime/server transition API:

- `WorkQueueRepository.completeWorkQueueItemFromCloseout(...)`

Accepted bounded closeout evidence can close a Work Queue planning item.
Missing required validation, missing required changed-file evidence, provider
unavailability, or closeout timeout must produce `needs_review`/blocked
status, not complete.

Runtime job lifecycle remains separate. Work Queue closeout transitions do
not mutate runtime job lifecycle.

## 2026-05-14 Queue Reconciliation

The canonical convergence Work Queue now retires active-queue items 09 through
18 as completed planning items after the successful long-form UX/runtime proof
`native-exec-43dbdaace0a64337`.

Second update on 2026-05-14: active-queue-19, active-queue-20, and
active-queue-23 are now retired as completed planning items.

The next active item is `openclaw-convergence.active-queue-21`
(`remaining-queue-01`): **Worker Tool Loops And Non-Codex File-Edit Worker /
Kimi Implementation Lane Hardening**.

New single-pass active items added after the retired parity block:

1. Work Queue Runtime Truth Completion.
2. Owner Progress And Readback UX Upgrade.
3. Worker Tool Loops And Non-Codex File-Edit Worker / Kimi Implementation Lane
   Hardening.
4. Dynamic Team Graph Expansion.
5. Closeout Robustness Matrix.
6. Workflow Breadth Production Upgrade.
7. Prompt Context And Memory Runtime Scaling.
8. Runtime Resilience And Recovery.
9. Smarter Model Policy And Role Routing.
10. Multi-Prompt Real Work Soak.
11. Long Multi-Action Project Soak.
12. Final Codex-Surpass Gate.

These are Work Queue planning/readback items. They do not mutate runtime job
lifecycle state and do not imply live execution success until backed by
runtime jobs, validation refs, artifacts, and Closeout Capsules.

Completed in the Work Queue truth/readback/closeout pass:

- Work Queue Runtime Truth Completion: live seed/update now uses bounded
  planning snapshots and skips unchanged metadata, versions, and dependencies.
- Owner Progress And Readback UX Upgrade: execution readback and UI expose
  owner progress with stage, worker/model, validation, changed-file,
  closeout, human-decision, limitations, next action, and ELI5 state.
- Closeout Robustness Matrix: closeout acceptance distinguishes runtime
  evidence validation from model-authored human report quality, and covers
  success, failure, repair, partial, human-decision, provider, and timeout
  outcomes.

Canonical Work Queue projection now treats execution-platform DB/runtime records as the only live source for active and closed queue state.

- `sourceTrackerMode` is `db_primary_no_source_tracker`.
- Active and closed positions are derived from current `work_items` + runtime-linked truth at read time.
- Closeout projection artifacts (`execution_platform.closeout_projection_readback`) may enrich queue readback metadata but cannot mutate lifecycle.
- Active and closed queue ordering is deterministic when `updatedAt` ties occur:
  projection order falls back to `workItemId` and does not depend on input/traversal order.
- Closeout projection metadata application is deterministic when artifact timestamps tie:
  artifact order falls back to `artifactId`.
- `runtimeJobIds` and `runtimeJobRefs` are derived from both run linkage and bounded runtime artifact refs/metadata, so runtime evidence survives partial run-link drift.
- Parent and child refs, runtime job refs, validation refs, and graph refs remain bounded projection fields.
- Follow-up child refs are bounded (up to 50) and self-child refs are rejected with `closeout_readback_self_child_ref_rejected`.
- Accepted closeout follow-up child refs now back-link known child items to the parent work item in the runtime projection readback.
- Closeout priority notes are accepted as bounded metadata and projected as `priorityNote` (160 char cap)
  and closeout/runtime graph/validation/human-decision runtime refs are folded into
  `runtimeJobIds` + `runtimeJobRefs` during projection updates.
  so owner-facing queue readback can carry explicit runtime ordering guidance without mutating lifecycle state.
- If a follow-up child ref is not yet present in runtime projection truth, the parent readback records
  `closeout_readback_follow_up_child_ref_missing` and a bounded limitation that child creation/readback
  is still pending runtime truth.
- Closeout projection metadata must target the same work item as its artifact row; mismatches are rejected with `closeout_projection_work_item_id_mismatch`.
- `assignedHumanIds` now projects only human-type assignees (`user`, `human`, `owner`, `operator`) while preserving role assignments separately.
- Task-graph readback prefers dynamic runtime graph ids/refs and bounded dynamic node counts over thin static seed graph summaries when both are present.
- Task-graph readback now includes Kimi standard implementation evidence:
  model/run refs, attempt count, parser rejection stages, changed-file refs,
  validation refs, and escalation recommendation. This prevents a failed Kimi
  role report from being mistaken for implementation success.
- Product/spec planning worker contract validation now enforces bounded owner
  default coherence: conflicting human decision defaults are rejected, and the
  selected planning mode must match the single bounded owner default mode when
  that default is present.
- Convergence tracker seed/update uses bounded planning snapshots instead of
  loading full WorkItemTruth histories. It does not create a new version or
  dependency when the desired projection already matches live DB truth.
- Convergence slice runtime substates now project validation evidence,
  closeout evidence, owner readback, and projection freshness separately from
  planning status and runtime lifecycle state.
- Owner progress readback is a first-class execution read-model artifact
  derived from runtime evidence. It is not execution truth and does not
  mutate lifecycle, but it gives the owner a readable status surface.
- Closeout robustness keeps the model-authored human report as the source of
  closeout assessment while deterministic code validates evidence refs,
  bounds, storage flags, and runtime anchors.
- Repository write-time validation rejects `lifecycleMutationAllowed=true` for closeout projection metadata.
- Work Queue lifecycle mutation remains blocked by default in projection/readback output.
