---
summary: "First-class execution intent and evidence mode contracts for routing graph nodes to the right executor without semantic heuristics."
title: "Execution Intent, Evidence Mode, And Worker Dispatch"
---

# Execution Intent, Evidence Mode, And Worker Dispatch

Date: 2026-05-23

Status: P0 pre-Product/Spec proof blocker discovered by the
after-resource-materialization worker smoke.

Work Queue item:
`openclaw-convergence.execution-intent-evidence-mode-worker-dispatch`.

## Failure Evidence

The latest Product/Spec replay reached `after-resource-materialization` and
selected a materialized child node:

- runtime job: `native-exec-e968a6a61f5d5293`
- graph id: `product-spec-replay-b56cc1b6440c2443`
- selected node:
  `g-85ca9e70df-g-85ca9e70-implementation-source-grounding-a0264b3b23:task:1`
- replay result: `needs_review`
- key reason codes:
  - `node_readiness_split_required_parent_satisfied_by_child_task`
  - `worker_repo_read_files_line_ranges_completed`
  - `non_codex_worker_pre_plan_context_budget_exhausted`
  - `non_codex_tool_worker_changed_file_refs_missing`

The worker did not fail to edit a good implementation packet. The selected
task was source grounding:

- objective: read specs/status/source refs before edits or proof execution;
- acceptance: no code changes before the group completes;
- validation refs: none;
- target commitment: `source-specs-read-first`;
- file-change intents: verify, ensure, confirm, validate.

Runtime had enough payload-backed refs to hydrate and execute the node, but it
did not have a first-class way to distinguish a read-only evidence node from a
file-edit implementation node. The proof harness then invoked a file-edit
worker and expected changed-file evidence.

## First-Principles Diagnosis

Capability ids and node kinds are not enough to decide executor behavior.
`implementation_microtask` currently implies "send this to a file-edit worker"
even when the actual work unit is read-only source grounding. That creates a
schema/runtime mismatch:

- the model semantically intended a source-grounding step;
- runtime compiled it as an executable implementation packet;
- the worker obeyed the read-only shape and produced no edits;
- the harness classified missing changed-file refs as worker failure.

The fix must not inspect prose for words such as "verify" or "confirm." That
would reintroduce the semantic-forest failure class. The model must explicitly
author the semantic intent, and runtime must validate only structural
compatibility.

## Governing Rule

Every runnable graph node and every domain resource packet must carry:

- model-authored `executionIntent`;
- runtime-compiled `evidenceMode`;
- capability/executor compatibility derived from the capability manifest;
- readiness policy derived from workflow evidence profile and resource kind.

The model decides what kind of work the node is meant to do. Runtime owns
schema, ids, refs, executor keys, storage, lifecycle, authority, locks,
readiness, validation, and closeout.

For complex coding workflows, `executionIntent` is first authored on the
non-runnable `WorkIntent` contract. Executable nodes inherit that intent only
after runtime validates capability compatibility and materializes the
resources required by that intent.

## ExecutionIntent

`executionIntent` is semantic and model-authored. It is not derived from
keywords or file paths.

Initial canonical values:

- `source_grounding`: inspect/read/source-map work; no file edits expected.
- `context_supply`: gather or repair context for a consumer node.
- `resource_materialization`: compile or hydrate domain resources.
- `source_edit`: produce bounded source or docs edits.
- `validation`: run or plan validation and classify failures.
- `review`: inspect evidence, diffs, or decisions.
- `docs`: produce documentation/readback artifacts, possibly with file edits
  if paired with an edit evidence mode.
- `readback`: produce owner-facing status/readback.
- `closeout`: produce finalization capsule/evidence packet.
- `human_decision`: request or resume owner/human decision.

Workflow plugins may add domain-specific intent aliases only through a
registry entry. Alias normalization is explicit and tested; runtime must not
guess.

## EvidenceMode

`evidenceMode` is runtime-compiled from `executionIntent`, capability profile,
workflow evidence profile, and Mission Ledger commitment requirements.

Initial canonical values:

- `read_only_evidence`: refs, notes, summaries, decisions, or context handoff
  without file mutation.
- `changed_file_evidence`: changed-file refs are expected.
- `validation_evidence`: command/tool validation refs are expected.
- `review_evidence`: review result refs are expected.
- `context_handoff_evidence`: accepted context packet/handoff refs are
  expected.
- `planning_artifact_evidence`: planning capsule/action graph/compile refs are
  expected.
- `human_decision_evidence`: human decision refs are expected.
- `closeout_evidence`: model-authored closeout/finalization refs are expected.

Runtime may derive multiple modes for a node. A node requiring
`changed_file_evidence` cannot be clean-successful without changed-file refs.
A node with only `read_only_evidence` cannot be dispatched to a file-edit
worker as an edit-required task.

## Compatibility Matrix

Runtime validates the matrix structurally:

| Execution Intent           | Required Evidence Mode                                 | Valid Executor Class                     |
| -------------------------- | ------------------------------------------------------ | ---------------------------------------- |
| `source_grounding`         | `read_only_evidence`                                   | context/review/source-grounding executor |
| `context_supply`           | `context_handoff_evidence`                             | context scout/broker executor            |
| `resource_materialization` | resource/readiness refs                                | resource compiler                        |
| `source_edit`              | `changed_file_evidence` plus validation/readiness      | file-edit worker                         |
| `validation`               | `validation_evidence`                                  | validation executor                      |
| `review`                   | `review_evidence`                                      | reviewer executor                        |
| `docs`                     | read-only or changed-file evidence, explicit in packet | docs executor or file-edit worker        |
| `readback`                 | `read_only_evidence`                                   | readback/projection executor             |
| `closeout`                 | `closeout_evidence`                                    | closeout/finalization executor           |
| `human_decision`           | `human_decision_evidence`                              | human task executor                      |

If the model selects a broad implementation capability for a read-only intent,
runtime must reject the dispatch as `execution_intent_capability_conflict` and
ask for a field-specific repair: choose an appropriate capability or change
the intent with rationale. Runtime must not reinterpret it.

## Packet Contracts

`ImplementationTaskPacket` is only for work that can become executable source
or docs editing. It must carry:

- `executionIntent: "source_edit"` for file-edit workers, or a docs/edit
  variant explicitly mapped by the workflow plugin;
- `evidenceMode` including `changed_file_evidence`;
- file snapshots or explicit new-file intents;
- file-change intents or new-file intents;
- validation refs or validation discovery plan;
- evidence claim expectations.

Read-only source-grounding work must instead compile into a read-only
`NodeExecutionPacket` plus a domain resource packet such as
`source_grounding_resource_packet`. It can close a read-first commitment by
emitting `read_only_evidence` and mapped evidence claims, not changed-file
refs.

## Scheduler Requirements

The staged scheduler must ask the model for work-unit intent before
capability dispatch:

1. work unit title and target commitments;
2. `executionIntent`;
3. role rationale;
4. expected human-readable output;
5. success criteria;
6. downstream consumer;
7. whether changed-file evidence is required.

Runtime then:

- compiles canonical evidence modes;
- selects allowed capabilities from the manifest;
- rejects capability/intent/evidence conflicts with field-specific repair;
- creates the correct resource packet kind;
- updates `NodeReadinessState`;
- exposes intent/evidence mode in Work Queue readback.

## Proof Harness Requirements

The Product/Spec boundary replay worker smoke must not choose the first
materialized implementation-like node. It must choose a node that is
structurally edit-required:

- `executionIntent === "source_edit"`;
- `evidenceMode` includes `changed_file_evidence`;
- capability profile can edit source;
- `NodeReadinessState` is ready or ready-with-limitations with nonblocking
  waivers;
- target snapshots or new-file intents are present.

If no ready edit-required node exists, the proof fails with
`no_ready_edit_required_node`, not by sending a read-only task to Kimi/Qwen.

The harness should separately prove read-only nodes:

- source-grounding node receives read-only packet;
- source-grounding executor produces bounded evidence refs;
- evidence claims map to commitments;
- no changed-file refs are required;
- Work Queue readback shows read-only evidence mode.

## Owner Readback

Work Queue and latest-run-state must show for active/blocked nodes:

- node id and branch id;
- `executionIntent`;
- `evidenceMode`;
- selected capability and executor;
- whether the node is read-only or edit-required;
- current readiness state;
- blocker schema path and reason codes;
- produced evidence refs;
- next legal transition.

This prevents "it is technically live" opacity and lets the owner see whether
the system is grounding, editing, validating, reviewing, or closing out.

## Acceptance Criteria

The item is complete only when:

- `ImplementationTaskPacket`, `CodingResourcePacket`, and
  `NodeExecutionPacket` carry execution intent/evidence mode without raw
  prompt/response/log storage.
- Runtime blocks file-edit worker dispatch for read-only evidence modes.
- Runtime blocks source-edit dispatch that lacks changed-file evidence mode.
- Scheduler/replay readback surfaces intent/evidence mode.
- The latest after-resource replay no longer sends the source-grounding task
  to a file-edit worker.
- A focused unit test proves read-only source-grounding cannot satisfy an
  edit-required worker smoke.
- A focused unit test proves source-edit packets still execute when target
  snapshots, file-change intents, validation refs, and changed-file evidence
  mode are present.
- No Product/Spec-specific keyword heuristics are introduced.

## Product/Spec Sequencing

This item runs before the next full Product/Spec proof. After it passes:

1. replay from `after-resource-materialization` on the latest graph;
2. prove read-only source-grounding is routed/blocked correctly;
3. prove one edit-required node, when present, receives a hydrated packet;
4. only then resume the full Product/Spec proof.
