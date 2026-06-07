---
summary: "Canonical 21-item contract for runner-owned continuous worker execution with real source exposure, implementation-controller judgment, and no pre-worker context readiness gate."
title: "Runner-Owned Worker Execution Session"
---

# Runner-Owned Worker Execution Session

Date: 2026-06-04

Status: governing implementation spec for the coding proof worker boundary.
This supersedes worker-start designs that require pre-worker context
materialization, Qwen-owned context/controller readiness, mandatory
`accept_window` ceremony, discovery seeds, lexical-anchor products,
JSON-shaped worker tool calls, or adapter-owned lifecycle repair.

## Architectural Goal

The worker node should behave like a continuous implementation agent while
remaining fully owned by `NodeLifecycleTransitionRunner`. A worker starts with
the assigned requirements, original prompt refs, authority bounds, accepted
scheduler graph state, and runner-projected native tools. It then iterates:

```text
prompt search/open
  -> repo search/open/refine
  -> edit plan with cited source refs
  -> forced atomic patch authoring
  -> validation
  -> search/open/refine again on validation failure
  -> repair plan / repair patch
  -> validation again
  -> evidence
```

The model owns semantic judgment inside the runner-visible tools: search terms,
what to read, when to refine, whether enough source exists to plan, what edit to
make, and how to respond to validation failure. Runtime owns mechanics: refs,
bounds, file reads, searches, patch application, validation command execution,
artifact storage, and authority checks. `NodeLifecycleTransitionRunner` owns the
session state, next legal envelope, model slot, visible domains, and typed
blockers for the node.

## Non-Negotiable Ownership Rules

1. `NodeLifecycleTransitionRunner` is the only owner of node-local lifecycle
   state, next legal worker turn, legal tools, visible domains, no-progress
   collapse, typed blockers, worker-start permission, validation repair,
   evidence closure, and escalation.
2. `RuntimeWorkGraphScheduler` persists accepted graph nodes/edges and records
   typed node results. It does not decide worker context sufficiency, repair
   missing context, reinterpret worker failures, or route node-local failures
   to global scheduling while node-local transitions remain legal.
3. The worker loop executes the runner-projected native tool turn and then runs
   the selected runtime tool mechanically. It does not maintain a competing
   model-slot or phase machine.
4. Helper compilers and validators may build or validate artifacts, but they
   cannot veto or reinterpret the runner's legal transition. When a helper
   cannot compile, the owning runner receives a typed blocker.
5. Replay and proof harnesses call the same runner/projection/worker path as
   production. They may stop at explicit proof gates, but they may not infer
   lifecycle from stale reason-code text or synthesize old readiness phases.

## The 21 Implementation Requirements

1. **Use existing ledger and phase records as runner-owned session state.**
   Do not introduce a parallel semantic session object if `NodeContextLedger`
   plus worker phase/tool events can carry the append-only session. The session
   facts are node id, assigned requirements, source prompt body ref,
   requirement source refs, repo authority refs, opened prompt windows, opened
   repo/test/symbol/caller windows, refined windows, context refs used by edit,
   patch, validation and evidence, edit plan, patch attempt, validation run,
   repair attempt, evidence claim, and typed blocker. Persist bounded source
   artifacts and manifest refs only.

2. **Make `WorkerTurnPlan` a transient runner envelope.** The runner emits a
   compact per-turn envelope containing model slot, model ref, reasoning policy,
   allowed native tools, visible domains, included source refs, max accepted tool
   calls, source-delta no-progress key, and typed terminal blockers. It must not
   duplicate full session state. Persist only bounded turn events when replay
   needs evidence.

3. **Remove worker-loop-owned model and phase inference.** The worker loop must
   not independently choose controller vs context vs patch vs validation-repair
   mode. Functions that previously inferred this from `toolResults` are legacy
   helpers only until deleted; production execution consumes the runner
   envelope.

4. **Use `implementation_controller` as the canonical worker model slot.** The
   slot is a role, not a hardcoded vendor. For the coding proof,
   `implementation_controller` is configured as `moonshotai/kimi-k2.6`. The
   implementation controller chooses among runner-exposed tools for search/read
   sufficiency, source refinement, edit planning, patch readiness, validation
   repair, and evidence sufficiency.

5. **Remove Qwen from the implementation path for the proof.** Qwen must not be
   the default context/controller model and must not decide edit readiness.
   Helper subturns may be reintroduced only after the single-controller
   implementation loop is proven, and only as runner-invoked mechanical helpers
   that cannot advance lifecycle.

6. **Use stronger reasoning for implementation judgment.** Implementation
   controller turns use `high` or `policy_owned` reasoning where provider
   support allows. If unsupported, fail typed as
   `worker_implementation_model_reasoning_mode_unsupported`. Do not silently
   downgrade to a no-reasoning controller.

7. **Fail typed if the implementation controller cannot use native tools.** If
   provider-native tool transport is unavailable, fail as
   `worker_implementation_model_tool_transport_unsupported`. No JSON-shaped
   fallback and no text-parser fallback are allowed in production worker model
   selection.

8. **Build source view fresh from session events.** Do not persist a
   `WorkerSourceView` abstraction. Each turn mechanically includes bounded
   readable source from latest opened prompt windows, latest opened
   repo/test/symbol/caller windows, windows cited in the previous turn, changed
   file windows, and validation failure windows. Older windows remain
   reopenable by ref plus short summaries.

9. **Put readable source into implementation-controller payloads.** Native
   worker turns include bounded line-numbered source bodies from recent
   opened/refined windows. Requirements and refs guide attention; they do not
   replace real source exposure.

10. **Delete `accept_window` from production worker lifecycle.** Context
    acceptance is inferred from use in `worker.edit.plan.contextWindowRefs`,
    `worker.patch.author_edit.editPlanRef` and cited context refs,
    `worker.validation.run.contextWindowRefs`, and
    `worker.evidence.claim.contextWindowRefs`. Runtime records context-use
    receipts mechanically from those calls.

11. **Expose edit planning immediately after opened or refined source.** After
    `worker.context.open` or `worker.context.refine_window`, the next runner
    envelope may expose `worker.edit.plan`, `worker.context.search`,
    `worker.context.open`, `worker.context.refine_window`, and `worker.block`.
    The implementation controller decides whether to plan or continue searching.
    Runtime enforces authority and structure only.

12. **Keep patch authoring as an atomic envelope.** After accepted edit plan,
    runner exposes only `worker.patch.author_edit` and `worker.block`. Patch
    authoring requires edit plan ref, cited context refs, and authorized target
    refs. No richer patch-phase state is added unless future proof evidence
    shows it is necessary.

13. **Make worker execution interleaved.** The runner permits prompt
    search/open, repo search/open, edit plan, patch, validation, search/read
    after validation failure, repair planning through the same `worker.edit.plan`
    tool, repair patch, validation rerun, and evidence in one node-local loop.
    It must not require a monolithic context phase before all editing.

14. **Infer repair mode from runner state.** Do not require model-authored
    `planKind`. If latest validation failed, `worker.edit.plan` is interpreted as
    repair planning. This keeps the tool smaller without reducing capability.

15. **Shrink worker-start contract.** Required start data is node id, assigned
    requirement ids/text, source prompt body ref, requirement source refs, and
    repo authority refs. Validation intent/command refs and expected output are
    optional. Target refs, preselected context refs, snapshots, materialized
    packets, context-readiness claims, and duplicate evidence expectations are
    not start requirements.

16. **Runner owns visible domains.** The runner controls whether the worker sees
    `prompt`, `repo`, `tests`, `symbols`, `callers`, `validation`, and
    `evidence`. Early turns normally expose `prompt` and `repo`; after repo
    hits/opened windows the runner may add `tests`, `symbols`, and `callers`;
    after validation failure it may add `validation`, `repo`, `tests`, `symbols`,
    and `callers`. The model chooses search terms, refs, and windows.

17. **Use structural gates only.** Runtime may require readable source after a
    source open, edit plan context refs, patch edit plan ref, authorized patch
    targets, validation refs or changed refs, and evidence refs tied to changed
    files, validation, and requirements. Runtime must not judge semantic
    relevance, keyword quality, or context sufficiency.

18. **Use source-delta-aware no-progress collapse.** Collapse only when the same
    legal tools, same opened refs, same cited refs, same selected tool pattern,
    and no new search/open/refine/edit/validation/evidence output repeat. Do not
    collapse because the broad state remains `context` or `worker_running`.

19. **Upgrade worker observability.** Each worker turn event records active
    model slot, model ref, reasoning mode, allowed tools, selected tools, visible
    domains, readable source refs included, readable payload byte counts, context
    refs cited, edit plan refs, patch refs, validation refs, next runner state,
    and typed blocker if blocked. Replay must prove whether the implementation
    controller saw actual source before patch.

20. **Delete conflicting tests and old assumptions.** Remove or rewrite tests
    and code expectations that preserve Qwen default context/controller
    ownership, mandatory `accept_window`, hidden source windows until patch
    phase, worker-side lifecycle/model-slot inference, pre-worker context
    sufficiency claims, JSON-shaped worker tool fallbacks, and deterministic
    context quality gates.

21. **Replay proof gate.** The proof gate, run separately after implementation,
    starts from scheduler to worker handoff and must show assigned requirements
    and prompt refs present, prompt source opens, repo search runs from
    model-authored terms, repo windows open, the next implementation-controller
    turn includes readable source bodies, the implementation controller plans
    edits citing source refs or continues source-based search, patch authoring
    runs, validation runs, validation failure can trigger search/read/repair, and
    evidence is emitted or a precise typed blocker is recorded.

## Minimal Worker Start Contract

The durable worker start contract should contain only fields downstream code
cannot derive from graph/runtime state:

- node id and graph/runtime ids;
- assigned requirement ids/text refs;
- source prompt body ref;
- requirement source refs;
- repo authority refs;
- optional validation intent or command refs;
- optional expected output.

Retired start requirements include target refs, preselected context refs,
snapshots, materialized packets, context readiness claims, duplicate evidence
expectations when requirements already carry evidence mode, discovery seeds,
lexical anchors, fixed context packets, and precomputed target windows.

## Minimal Production Worker Tool Surface

Production implementation-controller turns should use these tools unless a
future proof demonstrates a concrete need for more:

- `worker.context.search`
- `worker.context.open`
- `worker.context.refine_window`
- `worker.edit.plan`
- `worker.patch.author_edit`
- `worker.validation.run`
- `worker.evidence.claim`
- `worker.block`

Validation repair planning uses `worker.edit.plan` when the runner state
contains a failed validation. Escalation is represented as
`worker.block({ blockerKind: "high_capability_required" })`. The model does not
need separate repair/escalation tools for the first proof path.

## Completion Gate For Implementation Passes

This work is not complete until code review shows:

- runner envelopes, not worker-loop inference, select the model slot and legal
  tools;
- implementation-controller turns are configured to Kimi for the proof path;
- Qwen is not the default worker context/controller in the proof path;
- readable source windows are included in implementation-controller payloads;
- `accept_window` is not production-visible or required;
- edit planning can follow opened/refined source directly;
- patch authoring remains atomic;
- worker start does not require target refs, snapshots, or materialized context;
- no production worker JSON-shaped fallback survives;
- focused tests cover source inclusion, no accept-window gate, Kimi
  implementation-controller selection, structural gates, and no-progress
  behavior.
