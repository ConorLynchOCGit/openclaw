# Product/Spec Proof Failure Ledger - 2026-05-20

This ledger records the Product/Spec Planning proof failures that must survive
context compaction and handoff. It is runtime-evidence oriented and should be
updated before another expensive proof run.

## Run Identity

- Runtime job: `native-exec-9569a0124c8e3bc0`
- Work item: `product-spec-checkpointed-4afa5f988c6b-dfv945`
- Prompt hash: `4afa5f988c6bf33b04047d87807d895c6a3df1147b4318a17e6dae9a1cb27a51`
- Prompt length: `16389`
- Final proof status: `needs_review`
- Process state: proof command exited; no product-spec proof process remains running.
- Runtime DB row caveat: job row remained `pending` / retry-scheduled after adapter result
  `needs_review`, which is confusing and must be reported as a lifecycle/readback defect.

## Wall Time And Token Evidence

- Total proof wall clock: about `14m55s` process time, `~11m34s` runtime event span.
- Submit accepted in `191.8s`.
- Front-door router model latency: `57.2s`.
- Mission Ledger: GPT-5.5 app-server call; usage unavailable from app-server.
- Packet fanout:
  - 15/15 Qwen packet calls completed.
  - Qwen packet author totals: `147,509` total tokens, `102,926` input,
    `44,583` output, estimated cost `$0.060669`.
  - Three Qwen packet calls hit `openrouter_no_content` at the 60s soft timeout,
    then succeeded on retry.
- Context scout plus packets Qwen total reached about `339,151` known total tokens,
  estimated cost `$0.115428`.
- GPT-5.5 app-server actual token usage remains unavailable. The telemetry patch now
  records byte-size estimates and explicit unavailable reasons, but not actual app-server
  usage.

## Confirmed Successes

- Source prompt reached the runtime as a prompt file ref; raw prompt was not stored.
- Mission Ledger was produced with 15 blocking commitments.
- Packet fanout was parallel and completed all 15 packets.
- Context scout graph shape was correct at this stage:
  - 15 `context_scout` nodes.
  - 1 `context_synthesis` global barrier.
  - 15 `context_supplies` edges into synthesis.
- Context scouts ran in parallel and produced 15 context handoff packets.
- Closeout refused false success because blocking commitments remained open.

## Confirmed Failures And Follow-Ups

1. Operator continuity failed across compaction.
   - The proof artifacts persisted, but there was no compact operator state file that
     immediately answered whether the run was still live, what phase it was in, wall time,
     token burn, current blocker, and exact next action.
   - Required fix: write and update a tiny `latest-run-state.json`/readback artifact on
     every checkpoint and terminal state.

2. Packet quality review fired during a normal pass.
   - This was supposed to be optional/rare.
   - Trigger reason was structural thinness such as `thin_remaining_work:*`.
   - The model review found only `needs_review_nonblocking` issues, mostly missing context
     snapshots before context scouting and clipped/count-mismatched criteria.
   - It cost about 3.5 minutes through GPT-5.5 and did not unblock anything.
   - Required fix: adaptive packet review must trigger only on blocking risk signals:
     missing packet, non-model-authored packet, parser/schema failure, explicit failed
     packet status, empty core handoff fields, or previous downstream failure. Thin
     enrichment fields should be nonblocking warnings, not a model review trigger.

3. Packet authoring did not implement the requested two-Qwen-call split.
   - The completed implementation used one Qwen semantic packet call plus runtime schema
     compilation.
   - The user explicitly requested two Qwen calls: semantic content first, then schema
     shaping/patch before runtime compile.
   - Required fix: either implement the explicit two-call experiment or document and
     justify why runtime-only schema compilation replaces the second model call.

4. Context synthesis failed before implementation.
   - GPT-5.5 core context synthesis completed, but did not provide
     `groupPlanningGuidance`.
   - Runtime emitted `context_synthesis_group_planning_guidance_missing` and
     `context_synthesis_expansion_not_attempted`.
   - Scheduler moved to needs_review and never reached implementation/Kimi.
   - Required fix: context synthesis core output must be accepted through a staged contract:
     semantic dependency summary first, then model or runtime repair/extraction into
     group guidance. Missing group guidance should run a focused repair/extraction turn
     using accepted scouts and packets, not terminalize the whole run.

5. Context synthesis input was extremely large.
   - Core GPT-5.5 synthesis input was about `223,350` bytes.
   - This likely contributes to latency and schema drift.
   - Required fix: feed synthesis a compact, purpose-built synthesis input bundle:
     per-packet objective, accepted context summary, file refs, blockers, and worker-fit
     hints, not bloated packet/scout artifacts.

6. Context scouts were accepted with limitations.
   - Most scout loops show `context_scout_tool_loop_accepted_with_limitations` and
     `context_scout_runtime_verified_fallback_used`.
   - This is better than prior failure, but it means the handoff quality still relies
     partly on runtime verified refs rather than fully model-authored scout substance.
   - Required fix: continue context scout toolification and surface handoff quality in
     synthesis readiness, while not blocking implementation on harmless limitations.

7. Model usage telemetry is still incomplete.
   - Qwen/OpenRouter usage is captured.
   - Codex app-server/GPT-5.5 actual token usage is not captured; only estimates and
     unavailable reasons are present.
   - Required fix: either extract actual usage from the app-server response stream/API
     if available, or make estimates first-class and clearly labeled in Work Queue
     readback.

8. Submit/front-door latency remains unacceptable.
   - Submit accepted in `191.8s`; front-door router latency alone was `57.2s`.
   - Required fix: profile submit path with phase timers, distinguish model latency from
     gateway/readback/config overhead, and optimize without changing routing semantics.

9. Lifecycle/readback state is confusing after terminal needs_review.
   - Runtime job row showed `pending`/retry-scheduled while adapter result was
     `needs_review` and proof command had exited.
   - Required fix: owner-facing readback must surface terminal adapter outcome and retry
     state distinctly: "process exited needs_review; retry scheduled/not running now."

10. `tsx -e` top-level-await keeps breaking diagnostics.
    - This is not the proof blocker, but it repeatedly wastes operator time.
    - Required fix: add a safe diagnostic wrapper script or use an approved async
      wrapper helper so common runtime artifact pulls do not fail on top-level await.

11. Implementation/Kimi was not exercised in this proof.
    - The Kimi phase-authority and telemetry patch compiled, but this run stopped before
      any implementation node, so those changes are not live-proven.
    - Required fix: after synthesis is repaired, resume from the context-synthesis or
      graph-compile checkpoint and prove implementation lanes with walltime/token
      reporting.

12. Need review markers are too broad/stale in the harness.
    - The checkpoint summary listed mission ledger, packet, context scout, and scheduler
      graph qualitative review requirements even after usable intermediate artifacts
      existed.
    - Required fix: distinguish "qualitative review artifact exists/nonblocking" from
      "blocking proof gate failed" in the proof harness and Work Queue readback.

## Immediate Fix Order Before Next Proof

1. Persist compact run state on every checkpoint and terminal event.
2. Fix packet-review adaptive policy so nonblocking thin fields do not call GPT-5.5.
3. Add focused context-synthesis repair/extraction for missing `groupPlanningGuidance`.
4. Compact context-synthesis inputs and make group guidance a staged tool boundary.
5. Fix lifecycle/readback status for terminal `needs_review` plus retry-scheduled rows.
6. Rerun from the context-synthesis boundary, not from prompt submit, to prove the fix.
7. Only after that passes, run the full Product/Spec proof again.

## 2026-05-20 Repair Pass Status

Implemented as first-class production-path repairs, not prompt-only changes:

- Added compact latest-run-state artifacts for checkpoint and terminal proof
  states. The artifact is bounded and compaction-safe: current phase, node,
  model/provider, blocker, next action, wall time, token/usage availability,
  retry state, and raw-storage flags.
- Changed adaptive CommitmentWorkPacket review so advisory-only thinness no
  longer triggers GPT-5.5 quality review. Blocking defects still trigger
  model review: missing packet, deterministic fallback packet, empty worker
  handoff objectives, missing context questions, stop rules, expected outputs,
  or downstream packet/handoff failures.
- Added `context_synthesis_input_manifest` as the synthesis boundary input.
  The runtime assembles refs plus existing model-authored packet/scout briefs;
  it does not deterministically summarize arbitrary prompt/context prose. If
  the manifest exceeds budget, the run stops as needs_review with split/model
  selection instructions instead of silently truncating.
- Added context synthesis alias normalization and focused repair for missing
  group guidance. Accepted aliases include `groupPlanningGuidance`,
  `recommendedImplementationGroups`, `implementationGroups`, `workGroups`,
  and `groups`; missing guidance triggers a bounded field-specific repair
  rather than rerunning the full synthesis call or terminalizing immediately.
- Fixed terminal adapter `needs_review` lifecycle/readback. The worker
  supervisor now marks adapter needs_review as terminal diagnostic state with
  `retryScheduled:false`; Work Queue owner progress exposes
  `terminalAdapterOutcome` separately from the DB `failed` state required by
  the current runtime job state enum.
- Tightened proof harness gate semantics so nonblocking review availability
  does not look like a blocking proof failure.
- Extended model usage summaries to distinguish actual, estimated, mixed, and
  unavailable usage. GPT-5.5 app-server actual usage remains unavailable when
  the provider surface does not return it, but the proof artifact now labels
  that explicitly instead of implying zero or silently omitting it.

Focused validation:

- `pnpm test:file extensions/execution-platform/src/workflows/context-synthesis.test.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.test.ts extensions/execution-platform/src/work-queue/execution-read-model.test.ts extensions/execution-platform/src/workers/runtime-worker-supervisor.test.ts extensions/execution-platform/src/observability/latest-run-state.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts`
- `node --check scripts/execution-platform-run-product-spec-checkpointed-test.mjs`
- `node --check scripts/execution-platform-run-product-spec-boundary-replay.mjs`
- `pnpm tsgo:fast`

Remaining proof action:

- Replay from the context-synthesis boundary using the recorded Product/Spec
  checkpoint before rerunning the full prompt. That replay must prove the
  manifest, alias/focused repair path, synthesis normalization, and scheduler
  continuation without redoing router, Mission Ledger, packet fanout, or
  context scout work.

## 2026-05-20 Boundary Replay Handoff Finding

The context-synthesis replay proved the manifest and focused repair path, but
also exposed a second boundary bug before implementation execution:

- GPT-5.5 synthesis produced an accepted implementation-group map.
- The owner-facing artifact metadata summary was bounded for storage and could
  truncate the `implementationGroups` array.
- The post-synthesis graph compiler consumed that truncated summary as if it
  were the executable handoff.
- Result: the runtime could report the full implementation group count while
  compiling a smaller implementation graph.

This was not planned batching. There were no continuation fields such as
`batchIndex`, `remainingGroupIds`, or a scheduler plan to return for later
groups. It was a contract mix-up between readback metadata and executable
scheduler input.

Implemented repair:

- Added `context_synthesis_graph_compile_handoff` as a scheduler-owned
  compile contract separate from owner-facing artifact metadata.
- The handoff carries all implementation groups required for graph compilation
  within bounded storage rules, or fails closed as `needs_review`.
- Runtime graph compilation now prefers that compile handoff and refuses to
  compile a partial graph when reported group count and included group count
  diverge.
- Boundary replay and production runner both return the compile handoff in
  node result metadata.

Validation:

- Focused tests prove owner-facing metadata truncation does not reduce graph
  compile group count.
- `pnpm tsgo:fast` passed.
- Replay from `after-parallel-context` accepted synthesis with 7 groups and
  compiled all 7 into implementation nodes plus validation, review, readback,
  and closeout support nodes.
