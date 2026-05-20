# Product/Spec Proof Latency And Parallelism Follow-Up

Date: 2026-05-18

Status: queued follow-up. This is intentionally not a blocker for the current
Product/Spec Planning proof unless proof execution shows latency itself is the
dominant failure.

## Problem

The Product/Spec proof funnel now has stronger boundaries, but several stages
still run slower than necessary:

- CommitmentWorkPacket authoring can be parallel per commitment once the
  Mission Ledger is accepted.
- Commitment packet quality review can run parallel per packet, then join into
  a single blocking/nonblocking repair decision.
- Context scout should run one scout per commitment packet or work packet in a
  bounded parallel group, then a single context synthesis barrier should join
  the outputs.
- Post-synthesis scheduler graph creation should avoid premium model calls for
  deterministic decisions such as "run exactly one synthesis barrier" and for
  runtime-owned graph/schema compilation.
- The latency/model-policy lane must review GPT-5.5 use across Mission
  Ledger, CommitmentWorkPacket authoring and review, context synthesis,
  scheduler graph selection, and repair. Premium calls should remain available
  for high-judgment work, but each stage should prove that GPT-5.5 is needed
  or route to the cheapest sufficiently capable model/worker.
- Worker implementation should split independent source, test, docs, readback,
  and validation work into parallel groups when target refs and locks do not
  overlap.
- Provider/model calls need per-provider concurrency caps, bounded progress
  events, retry-only-failed-branch behavior, and checkpoint refs so one failed
  branch does not force rerunning earlier expensive phases.

## Architecture Direction

The runtime should use a superstep model:

1. Determine all runnable nodes whose dependencies are satisfied.
2. Partition them by conflict domain:
   - file write scopes.
   - validation command/scope hashes.
   - provider/model concurrency caps as counted budgets, not mutex locks.
   - Work Queue/runtime lifecycle refs.
   - human decision refs.
3. Execute non-conflicting nodes concurrently through the Runtime Tool-Call
   Kernel.
4. Persist bounded node/tool/progress/evidence refs per branch.
5. Join only when downstream dependencies require it.
6. Retry or repair only failed branches when successful sibling evidence is
   still valid.

The model may propose parallelism and explain why branches are independent.
Runtime owns the actual concurrency decision, locks, leases, timeouts,
cancellation, and idempotency keys.

## Kimi And Non-Codex Worker Latency Implications

Non-Codex workers should benefit from parallelism only after the scheduler
splits work into file-scoped units. The selected work packet must include:

- exact objective.
- target refs and allowed refs.
- context handoff refs.
- acceptance criteria.
- validation command refs.
- stop/escalation condition.

Kimi and other non-Codex workers should not be asked to solve a broad
multi-commitment implementation node merely to prove they exist. They should
run in parallel on independent scoped work units when the context synthesis
artifact indicates the work can be split without shared write conflicts.

## Required Follow-Up Work

- Add scheduler runnable-set/superstep execution with bounded concurrency.
- Add file-scope and validation-scope locks.
- Add per-provider/model concurrency policy and backoff.
- Add a model-policy audit for GPT-5.5 usage across Mission Ledger, packet
  authoring/review, context synthesis, scheduler graph selection, and repair,
  including downgrade criteria, escalation criteria, and quality gates.
- Make packet authoring and packet review parallel by default for independent
  commitments.
- Make context scout fan out per commitment packet and join through exactly one
  context synthesis barrier.
- Let post-synthesis graph optimizer produce parallel groups, not only a linear
  implementation -> validation -> review -> readback -> closeout chain.
- Surface parallel group state in Work Queue readback: active nodes, blocked
  locks, provider waits, join readiness, failed branches, and retry/repair
  state.
- Add boundary replay checkpoints at packet authoring, packet review, context
  scout, context synthesis, post-synthesis graph compile, node selection,
  validation, review, readback, and closeout.

## Non-Goals

- Do not relax evidence, closeout, validation, or Mission Ledger gates to make
  latency look better.
- Do not store raw prompts, responses, transcripts, provider logs, command
  logs, or raw DB rows.
- Do not let deterministic code judge semantic quality. Runtime may decide
  dependency/conflict/concurrency legality; models judge usefulness and
  sufficiency.

## Proof Expectations

The follow-up pass should prove:

- packet author/review and context scout parallel phases reduce wall-clock time
  without reducing output quality.
- retry-only-failed-branch works from persisted checkpoint refs.
- Work Queue readback shows live parallel group state and current blockers.
- non-Codex workers can run multiple independent scoped tasks in parallel with
  file/validation locks.
- final success still requires accepted commitment evidence, validation,
  readback, and model-authored closeout.
