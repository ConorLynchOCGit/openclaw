---
summary: "Pre-proof stabilization plan before the next Product/Spec Planning production proof."
title: "Pre-Product/Spec Proof Stabilization Plan"
---

# Pre-Product/Spec Proof Stabilization Plan

## Why This Plan Exists

The latest Product/Spec proofs advanced materially further than earlier runs:
Mission Ledger, packet authoring, graph creation, context scout execution,
context handoff, resource materialization, split-required transition, and
child task packet creation all executed. The proof still did not reach real
source edits.

The remaining blockers are not Product/Spec-specific feature gaps. They are
generic runtime stability gaps:

1. artifact bodies can still leak into metadata through adjacent production
   paths;
2. scheduler iterations can expand/reuse context graph shape instead of
   executing a ready frontier;
3. repeated reused-only graph decisions can look like progress;
4. Mission Ledger evaluation is called too often for context-only events;
5. operator readback still requires artifact archaeology to understand the
   active frontier.

This plan defines the pre-proof items that must run before the next full
Product/Spec proof.

## Pre-Proof Work Items

### 1. Runtime Artifact Contract Registry And Payload Boundary

Spec:
`docs/projects/execution-platform/specs/runtime-artifact-contract-registry-and-payload-boundary.md`

Build a typed artifact contract registry and migrate body-bearing packet,
context, resource, scheduler, and runtime result artifacts to payload-backed
storage. Add repo guards so registered body-bearing artifacts cannot be stored
as metadata in production code.

Success gate:

- registered artifact types reject metadata-body writes;
- payload-backed artifacts hydrate through contract refs;
- latest failed Product/Spec graph can write/read all packet/context/resource
  artifacts under metadata limits;
- no raw prompts/responses/logs/DB rows are stored.

### 2. Scheduler Frontier, No-Progress, And Evaluation Throttle

Spec:
`docs/projects/execution-platform/specs/scheduler-frontier-no-progress-and-evaluation-throttle.md`

Change scheduler order so ready executable frontier work runs before more
context/prerequisite graph expansion. Add no-progress signatures and halt
reused-only cycles. Batch Mission Ledger evaluation so context-only events do
not call global GPT-5.5 evaluation unless they include closure evidence.

Success gate:

- replay shows ready child frontier runs before new context prerequisite
  creation;
- repeated reused-only graph decisions halt with a root-cause diagnostic;
- context-only phases do not spam Mission Ledger evaluation;
- Work Queue/readback shows the frontier and blocker.

### 3. Operator Frontier Readback And Latest Run State

Spec:
`docs/projects/execution-platform/specs/operator-frontier-readback-and-latest-run-state.md`

Status: complete as of 2026-05-22.

Extend compact latest-run-state and Work Queue active graph readback so long
runs surface branch-level model/tool/node/phase/blocker/readiness/evidence and
next transition.

Success gate:

- latest-run-state is updated at every key boundary;
- multi-branch frontier state is visible without scanning artifacts;
- terminal blockers cannot be hidden by stale pending/retry state;
- token/wall-clock data is present or explicitly labeled unavailable.

Implementation evidence:

- `execution_platform.latest_run_state` is written from production scheduler
  progress.
- Work Queue active graph readback projects latest-run-state and agreement
  checks it against scheduler frontier state.
- proof:
  `.artifacts/execution-platform/operator-frontier-readback-latest-run-state/proof.json`

### 4. Large Graph Storage And Scheduler Lane

Spec:
`docs/projects/execution-platform/specs/large-graph-storage-and-scheduler-lane.md`

Status: complete as of 2026-05-22.

Use the contract registry and scheduler changes against a synthetic large
graph and the latest failed Product/Spec graph:

- 75-100 graph nodes;
- many context handoffs and implementation task packets;
- payload-backed storage for large bodies;
- bounded Work Queue/readback;
- repeated reused-only decision fixture;
- context-only Mission Ledger throttle fixture;
- one ready executable frontier branch.

Success gate:

- storage stays under metadata limits;
- scheduler executes the ready branch rather than expanding forever;
- no-progress guard trips when expected;
- readback shows current state in one compact artifact/read model.

Implementation evidence:

- resource materialization and node readiness bodies are registered
  payload-required artifact contracts;
- live `agent_team.scheduler_progress` has manifest-only contract coverage;
- scheduler bounds upstream context snapshot refs in graph metadata;
- provider-free proof:
  `.artifacts/execution-platform/large-graph-storage-scheduler-lane/proof.json`.

### 5. Mission Ledger Stability Diagnostics

This is a diagnostic lane, not a blocker unless it finds a functional
regression:

- run the same Product/Spec prompt twice through Mission Ledger and
  Commitment Work Packet authoring;
- compare commitment count, commitment substance, packet count, packet
  completeness, no-content retries, GPT rescue count, and token/wall-clock
  costs;
- fail only on material structural drift, missing blocking commitments, or
  packet authoring rescue dependence.

Success gate:

- packet/ledger variability is measured before the full proof;
- Qwen no-content and GPT rescue events are tracked as proof concerns;
- the run records whether variance is model/provider behavior or runtime
  boundary behavior.

Latest result, 2026-05-22:

- implementation is present in
  `extensions/execution-platform/src/workflows/mission-ledger-stability-diagnostics.ts`;
- diagnostic artifacts are registered as payload-required runtime contracts;
- the repeated checkpoint runner and closeout scripts are present;
- focused validation and scoped type validation passed;
- live proof:
  `.artifacts/execution-platform/mission-ledger-stability-diagnostics/proof.json`;
- verdict:
  `needs_review_structural_drift`;
- `safeToRunProductSpecProof: false`;
- Run A produced 10 blocking commitments and 10 packets;
- Run B produced 13 blocking commitments and 13 packets;
- provider variance included 3 Qwen no-content retries and 6 GPT rescue uses.

This is a successful diagnostic implementation but a failed preflight. The
next Product/Spec proof should not run until Mission Ledger/packet stability
is repaired or explicitly waived.

Implementation contract:

- `extensions/execution-platform/src/workflows/mission-ledger-stability-diagnostics.ts`
  is the canonical comparison module.
- The diagnostic consumes the same checkpoint artifacts produced by the
  Product/Spec proof harness stopped at `commitment_work_packets`; it does
  not require raw prompt, raw response, provider log, or DB row storage.
- Fingerprint/prose drift is reported as bounded structural drift, not used
  as a deterministic semantic judgment. The blocking gates are structural:
  changed mission gate, changed blocking commitment count, missing packet
  coverage, missing packet handoff fields, runtime boundary failure, or GPT
  rescue dependence.
- Provider no-content retries without GPT rescue are recorded as
  `stable_with_provider_variance` so the next proof can proceed with the
  provider concern visible instead of hidden.
- Diagnostic run, pair, and verdict artifacts are registered as
  payload-required runtime artifact contracts:
  `execution_platform.mission_ledger_stability_diagnostic_run`,
  `execution_platform.mission_ledger_stability_diagnostic_pair`, and
  `execution_platform.mission_ledger_stability_verdict`.
- `scripts/execution-platform-run-mission-ledger-stability-diagnostics.mjs`
  runs two live checkpointed Product/Spec passes through Mission Ledger and
  Commitment Work Packets, persists bounded run diagnostics, and writes
  `.artifacts/execution-platform/mission-ledger-stability-diagnostics/proof.json`.
- `scripts/execution-platform-record-mission-ledger-stability-diagnostics-closeout.mjs`
  closes or marks the Work Queue item `needs_review` from the verdict and
  annotates the Product/Spec proof item when it is safe to proceed.

### 6. Staged Mission Ledger Obligation Candidate Compiler

Spec:
`docs/projects/execution-platform/specs/staged-mission-ledger-obligation-candidate-compiler.md`

This is the repair item for the diagnostic failure above.

The Mission Ledger must stop being a single model-authored commitment universe
that can vary materially across identical runs. The new architecture is a
staged model/runtime compiler:

1. model extracts objective and constraints from the full prompt;
2. model extracts obligation candidates with source prompt anchors;
3. runtime compiles a candidate set and stable candidate refs from structural
   anchors;
4. model reviews the candidate set and authors merge/split/discard/add
   rationale;
5. runtime compiles canonical commitments and ids from anchors plus model
   review operations;
6. model/runtime gates accept the Mission Ledger;
7. packet authoring consumes canonical commitments only.

The boundary rule is strict:

- model decides meaning, sufficiency, blocking status, and merge/split
  rationale;
- runtime owns source anchors, ids, refs, schema, bounds, storage, lifecycle,
  and proof gates.

Runtime must not introduce keyword/regex/semantic taxonomy logic to decide
commitments. Stable ids are mechanical identifiers derived from prompt hash,
source anchors, and model review operations, not runtime semantic judgments.

Success gate:

- the same Product/Spec prompt can be run twice to the packet boundary with
  the same canonical blocking commitment count and stable source-anchor-backed
  commitment ids;
- packet count equals canonical commitment count;
- Qwen/fast-model packet authoring does not require GPT-5.5 rescue in a clean
  proof;
- provider no-content attempts are bounded and classified beyond the legacy
  `openrouter_no_content` label, including model/provider/profile,
  reasoning/response mode, input bytes, output budget, timeout state, native
  finish reason, choice count, content lengths, parsed length, retry number,
  concurrency slot, and bounded input bundle ref/hash;
- repeated no-content on the same packet input triggers a failed-packet replay
  lane before Product/Spec resumes;
- Work Queue/readback exposes candidate count, review operations, canonical
  commitments, packet counts, retry/rescue counts, and proof cleanliness;
- no raw prompts/provider logs/tool logs/command logs/DB rows are stored.

## Proof Ordering

The next full Product/Spec Planning proof should run only after items 1-4 are
implemented and lane-proven, item 5 has measured the current packet/ledger
variance, and item 6 has repaired the Mission Ledger/packet boundary with a
clean repeated-run preflight. Product/Spec should not resume on top of a
known unstable commitment universe.

## Natural Follow-Ons After Product/Spec

- Runtime artifact retention/pruning policy.
- Artifact contract coverage gate in the Toolification Truth Registry.
- Scheduler phase-budget governor.
- Cross-workflow no-progress proof lanes.
- Work Queue live frontier delta stream and branch-level controls.
- Model-cost governor for global GPT-5.5 calls.
- Large-workflow stress lanes for design, marketing, research, docs, and QA.

These follow-ons should be ranked after Product/Spec unless a pre-proof lane
shows the current implementation is still not safe enough to reach source
edits.
