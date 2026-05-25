# Product/Spec Proof Failure Ledger - 2026-05-20

This ledger records the Product/Spec Planning proof failures that must survive
context compaction and handoff. It is runtime-evidence oriented and should be
updated before another expensive proof run.

## Run Identity - 2026-05-24 Top-Of-Pipe Proof

- Runtime job: `native-exec-a128a2cf543a12e1`
- Work item: `product-spec-checkpointed-e7a702b7768f-jqim5u`
- Prompt hash: `e7a702b7768f7862bcc31d7a4aabce233f121dccac4b505f84f7affeee4cfea0`
- Prompt length: `19947`
- Final proof status: `needs_review`
- Process state: proof command exited; no product-spec proof process remains
  running.
- Summary artifact:
  `.artifacts/execution-platform/product-spec-checkpointed-test-summary.json`
- Latest state artifact:
  `.artifacts/execution-platform/product-spec-checkpointed-test-latest.json`
- Follow-up fix artifact:
  `.artifacts/execution-platform/product-spec-proof-follow-up-fix-list.json`

### Wall Time And Token Evidence

- Proof wall clock recorded by harness: `698192ms`.
- Submit accepted in `82715ms`.
- Front-door router latency: `59124ms`.
- Route: `agent_team.coding`, `executor.agent_team`. This is expected for an
  implementation/proof prompt whose subject is Product/Spec Planning.
- Qwen/OpenRouter known usage: `183678` total tokens across events with usage,
  estimated cost `$0.06305728`.
- Qwen usage remains incomplete: `48` events missing provider usage.
- GPT-5.5/Codex app-server usage remains unavailable; the harness produced an
  estimate range of `59047` to `98421` tokens.

### Confirmed Successes

- The prompt reached the runtime through the gateway-equivalent submit path as
  a prompt-file ref; raw prompt/response/provider/tool logs were not stored.
- Source prompt context indexing passed.
- Mission Ledger created `14` blocking commitments and `1` nonblocking
  commitment, with clear owner-objective summary and concrete commitment ids.
- Commitment packet authoring completed `14/14` packets with:
  - `0` failed packets.
  - `0` fallback/GPT rescue packets.
  - `0` provider-error packets.
  - `5` long-latency packets.
- Packet review was skipped as intended for the model-review path, then
  nonblocking review notes were persisted.
- The scheduler used staged scheduler/runtime tools and accepted an initial
  context graph.
- The runtime created graph and Work Queue child sync events:
  - `3` `context_scout` nodes.
  - `1` `context_synthesis` node.
  - `3` `context_supplies` edges from scouts to synthesis.
  - `3` role invocations.
- Context scout outputs reached `accepted` sufficiency in the checkpoint
  readback, with verified file refs and context handoff refs.

### Confirmed Failures And Recurring Patterns

1. The proof still failed before implementation.
   - No implementation node ran.
   - No source edits landed.
   - No validation of Product/Spec implementation changes ran.
   - All `14` blocking Mission Ledger commitments remained open.

2. Context synthesis group expansion is now the blocking failure.
   - GPT-5.5 core synthesis completed.
   - The downstream Qwen group-expansion calls were blocked before provider
     invocation by structured-adapter preflight.
   - All `4/4` group expansion calls failed with
     `structured_adapter_preflight_blocked`.
   - Input sizes were `35638`, `45239`, `46421`, and `49620` bytes against a
     `32000` byte profile bound.
   - Requested timeout was `180000ms` against a `90000ms` profile bound.
   - This is not a Qwen no-content/provider failure. It is a runtime contract
     and payload-shaping failure. The `noContentReasonClass:
preflight_blocked` label is misleading if read as a provider no-content
     event.

3. Context synthesis remains a major gate before implementation.
   - The scheduler reintroduced a `context_synthesis` node after grouped
     context scouts.
   - In this run the synthesis node was model-authored/accepted by scheduler
     tooling, not replay glue, but it still created a hard pre-implementation
     dependency.
   - If the intended architecture is demand-driven implementation with context
     requests as needed, this run is still on the older "synthesis before any
     implementation" path.

4. Context scout grouping is broader than packet-scoped delegation.
   - The Mission Ledger/packet layer produced `14` packets.
   - The scheduler produced `3` grouped context scout nodes, not one scout per
     packet or per implementation task.
   - The grouped scouts were:
     - specs and prompt grounding;
     - runtime implementation grounding;
     - proof and validation grounding.
   - This may be a reasonable compression, but it should be explicit policy.
     If packet-scoped or work-node-scoped context is required, the scheduler is
     still drifting toward broad context groups.

5. Commitment packets are accepted, but their summary readback still looks
   broad.
   - Sample packet fields show broad `likelyRepoAreas` such as `scripts/`,
     `docs/projects/execution-platform/`,
     `extensions/execution-platform/src/codex-bridge/`, and
     `extensions/execution-platform/src/workflows/`.
   - Sample context questions are generic:
     "Which existing files, tests, and runtime surfaces constrain X?"
   - This did not block this run, but it is a recurring handoff-quality risk
     because broad packet guidance pushes later stages toward synthesis and
     large context bundles.

6. The generated follow-up fix list missed the actual hard blocker.
   - `product-spec-proof-follow-up-fix-list.json` only recorded packet latency
     as a P1 fix.
   - It did not record the context-synthesis preflight-blocked failure as a
     hard follow-up even though that terminalized the proof before
     implementation.
   - The harness therefore still under-reports the failure that matters most.

7. Gate/readback semantics are still too soft.
   - Gate summary shows several `review_available_nonblocking` statuses and no
     `hardFailures`, even though the run terminalized `needs_review`.
   - `firstOpenGate` is `null`.
   - Owner-facing diagnosis must separate "nonblocking qualitative review
     available" from "proof cannot proceed because synthesis expansion
     preflight blocked every group".

8. Front-door and scheduler latency remain recurring costs.
   - Submit took `82.7s`; front-door routing alone took `59.1s`.
   - Packet fanout took about `178.9s`; `5` packets exceeded expected latency.
   - GPT-5.5 scheduler and context-synthesis phases still dominate wall clock,
     and app-server token usage is still estimate-only.

### Required Fixes Before Another Full Top-Of-Pipe Proof

1. Fix context-synthesis group expansion payload construction.
   - Group expansion inputs must be compiled from bounded resource refs,
     summaries, and per-group context packets, not large repeated prompt,
     packet, scout, and synthesis payloads.
   - The compiler must fail before scheduling the model call if a group bundle
     exceeds the selected model profile, and the failure must be surfaced as a
     synthesis payload compiler bug, not a Qwen no-content event.

2. Align model-task policy with call-site requests.
   - The context-synthesis group-expansion call requested `180000ms`, but the
     selected structured adapter profile allows `90000ms`.
   - Either the call site must request the policy timeout, or the profile must
     explicitly allow the higher timeout with evidence. The current mismatch is
     deterministic and should not require another full proof to reproduce.

3. Upgrade the failure-list compiler.
   - Terminal synthesis failures must be emitted as P0/P1 follow-up items with
     node id, stage, failed group ids, schema/preflight paths, input byte
     counts, profile bounds, and recommended boundary to replay.
   - Packet latency should not be the only recorded fix when the actual proof
     terminalized later.

4. Decide and enforce the context policy.
   - If the desired architecture is packet/work-node-scoped demand-driven
     context, the scheduler should not force a global synthesis barrier before
     implementation.
   - If synthesis is intentionally required, it must have first-class compact
     inputs and group expansion lanes that are guaranteed inside model-task
     profile bounds.

5. Improve packet handoff specificity without returning to over-strict packet
   review.
   - Accepted packet summaries should expose concrete target surfaces and
     context questions when possible.
   - Generic broad questions should be allowed only if the downstream context
     broker can immediately refine them against repo facts.

6. Preserve this run as the next replay source.
   - The next targeted lane should start at the context-synthesis expansion
     boundary for runtime job `native-exec-a128a2cf543a12e1`.
   - Do not rerun router, Mission Ledger, or packet authoring until the
     context-synthesis payload/profile mismatch is fixed in isolation.

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

## 2026-05-21 Checkpointed Proof Failure - Parallel Frontier And Resource Packet Boundary

Run identity:

- Runtime job: `native-exec-68321aa82d7d6146`
- Work item: `product-spec-checkpointed-64c74c8c5ece-fc8awb`
- Prompt hash:
  `64c74c8c5ecee1ac51099bccb895f3fe4f225778614692015ec2b4450d364922`
- Prompt length: `17694`
- Final proof status: `needs_review`
- Proof process wall time: `926s`
- Runtime run result: `failed`
- Runtime job row after failure: `pending`, attempt `1`, retry scheduled.

Important successes:

- Prompt submit used the gateway UX submit route and produced an
  `agent_team.coding` runtime job for the Product/Spec implementation subject.
- Source prompt context index was resolved from the native submit file; raw
  prompt was not stored.
- Mission Ledger produced 13 blocking commitments and reached
  `missionGate: clear_to_execute`.
- Commitment packet fanout completed 13/13 packets with adaptive packet review
  skipped as intended. The packet review artifact is nonblocking.
- Scheduler accepted a concrete runtime graph with implementation, validation,
  observability/readback, reviewer, closeout, and context scout nodes.
- Work Queue child materialization happened for graph nodes.
- Parallel frontier selection worked far enough to select three ready nodes and
  run independent context-scout nodes in parallel.

Measured wall-time and usage:

- Submit accepted in `150.483s`.
- Front-door router latency was `67.513s` using
  `openai-codex/gpt-5.5`.
- Runtime event wall time was about `769.346s`.
- Qwen/OpenRouter known actual usage reached `165,685` tokens
  (`115,657` input, `50,028` output), estimated cost `$0.06117807`.
- GPT-5.5 app-server actual usage remained unavailable; latest-run-state
  estimated a range of `73,139` to `121,920` tokens from bounded byte-size
  evidence and labeled the usage as estimated.

Confirmed failure chain:

1. Qwen packet authoring remained flaky.
   - Six Qwen packet calls hit `openrouter_no_content`.
   - Most succeeded on the second Qwen attempt.
   - `staged-scheduler-transition-readiness` exhausted both Qwen attempts and
     required GPT-5.5 rescue.
   - This did not block the run, but it remains a stability and latency defect.

2. Context scout accepted weak handoffs as implementation-usable.
   - Context scout tool loops returned `accepted_with_limitations`.
   - Reason codes included `context_scout_runtime_verified_fallback_used` and
     `context_scout_tool_first_verified_context_used`.
   - Missing information explicitly said runtime-supplied verified refs were
     used and could not count as clean scout success.
   - Despite that, `sufficientForImplementation` remained true and the
     scheduler treated the handoff as usable enough to evaluate the
     implementation node.
   - The existing structured fields
     `hasNonRuntimeContextSource` and `runtimeOnlyContextDetected` exist on the
     schema but were not populated or used as the canonical implementation gate.

3. Context scout resource targeting was too broad and off-subject.
   - Context-scout execution packets repeatedly surfaced generic toolification
     files such as model-agnostic worker loops, model call runtime tools, and
     intent-front-door tests.
   - They did not reliably locate Product/Spec planning workflow definition,
     plugin registration, evidence profile, closeout policy, completion review,
     or readback implementation surfaces.
   - This produced large verified/candidate ref sets that later fed the
     implementation resource compiler.

4. Post-repair context nodes were added without consumer edges.
   - After an accepted context scout, the scheduler added two additional
     context-scout nodes for Product/Spec workflow registry and readback/runtime
     flow.
   - The accepted add-nodes decision persisted two nodes and zero edges.
   - Those context-acquisition nodes were not wired as blocking dependencies of
     the implementation node or a context-synthesis/resource barrier.
   - The next parallel frontier therefore selected the implementation node
     alongside the new context-scout nodes.

5. Implementation resource materialization threw instead of returning a
   structured needs-review result.
   - The implementation node reached `resources_required`.
   - The implementation-context compiler produced more than the schema allows:
     `resolvedTargetFileRefs` exceeded the schema max of 100.
   - The compiler internally builds `resolvedTargetFileRefs` with a 120-item
     cap, then parses it through a schema capped at 100.
   - The resulting Zod `too_big` error escaped the executor path as an exception
     instead of becoming a bounded `split_required`, `context_repair_required`,
     or `needs_review` node result.

6. Parallel frontier failure isolation was incomplete.
   - The scheduler runs selected frontier nodes with `Promise.all`.
   - A thrown exception in one branch rejected the whole frontier and surfaced
     as `worker_adapter_threw:unclassified`.
   - Sibling context-scout branches continued emitting events after the adapter
     failure path had already started, which risks confusing Work Queue
     lifecycle/readback and child item state.
   - The runtime did not preserve the implementation branch failure as a
     node-level repair classification while allowing completed siblings to
     settle cleanly.

Required general fixes before the next expensive proof:

1. Make resource materialization safe and scheduler-owned.
   - `compileImplementationContextSnapshotPacket` must never throw a schema
     parse error for overlarge runtime-generated arrays.
   - It must use one canonical bound policy for file refs, snapshots, task
     packets, and readback summaries.
   - Oversized target sets should become `split_required` with sharded
     implementation task packets, or `context_repair_required` if targets are
     ungrounded. They must not crash the worker adapter.

2. Make accepted-with-limitations context semantically explicit.
   - Runtime-owned context sufficiency must use structured reason/limitation
     codes, not string matching against prose.
   - Any `context_scout_runtime_verified_fallback_used`,
     `context_scout_tool_first_verified_context_used`, runtime-only context, or
     blocking limitation must prevent implementation execution unless a
     separate model-authored nonblocking-limitation acceptance exists for the
     exact downstream implementation group.

3. Add consumer edges or a barrier for all context repair/acquisition nodes.
   - If the scheduler adds context nodes after detecting a context gap, runtime
     must wire them to their downstream consumer, a context-synthesis node, or a
     resource-materialization barrier.
   - A context node with zero edges is only valid if it is explicitly
     diagnostic and cannot unlock implementation.

4. Isolate parallel frontier branch failures.
   - Replace uncaught `Promise.all` behavior with branch-level try/catch or
     `Promise.allSettled`.
   - Each branch must settle as a node result: succeeded, needs_review,
     blocked, or failed with repair classification.
   - Completed sibling branch evidence must be preserved and failed branch
     diagnostics must be returned to the orchestrator without collapsing the
     runtime job into an unclassified adapter throw.

5. Upgrade failure telemetry.
   - Adapter exceptions must include the full bounded schema path list and
     affected node id in scheduler progress/readback.
   - Latest-run-state should surface the exact failed branch, node id,
     lifecycle state, and field path, not only `worker_adapter_threw`.

6. Re-run from the nearest replay boundary.
   - First run a targeted replay from the parallel-frontier/resource
     materialization boundary using the captured job artifacts.
   - Only rerun the full Product/Spec proof once the isolated replay proves
     context limitations block correctly, resource packets split instead of
     throwing, and parallel frontier branch failures are repairable node
     outcomes.
