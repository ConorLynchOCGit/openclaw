# Execution Platform Decisions

## 2026-05-15 Capability selection is cost-aware utility scheduling

Decision: Runtime Work Graph scheduling must treat worker/model selection as a
model-authored utility decision, not a "pick the strongest model" default.

Consequences:

- capability manifest v2 is the scheduling substrate for coding-team and
  future workflow graph nodes.
- every production add/run/retry/repair decision can be required to include
  selected capability, executor, target commitments, utility rationale, cost
  rationale, duplicate-work rationale, expected evidence, downstream consumer,
  and stop/escalation condition.
- premium Codex/GPT 5.5 lanes require a bounded explanation when cheaper
  same-role capabilities exist.
- deterministic code validates shape, refs, executor mapping, storage flags,
  authority, budgets, and commitment ids; it does not judge semantic quality.
- Work Queue readback must show the capability/cost rationale so the owner can
  see why a node was selected.
- broad Codex monopoly is no longer an acceptable default for complex
  multi-commitment work.

## 2026-05-15 Runtime tool calls are first-class runtime evidence

Decision: runtime tool calls are durable, typed Execution Platform operations
with bounded traces in the dedicated runtime DB.

Consequences:

- tool definitions, invocations, events, and artifact refs are persisted under
  `execution_platform`.
- Runtime Work Graph node execution can be traced as `worker.invoke`.
- future scheduler, worker, Mission Ledger, memory, closeout, and Work Queue
  readback passes must consume this kernel instead of creating parallel
  progress/evidence stores.
- raw prompts, responses, transcripts, provider logs, tool logs, command logs,
  raw DB rows, secrets, and unbounded logs remain prohibited.

Follow-up hardening decision: the kernel owns timeout/abort enforcement,
explicit cancellation, terminal idempotency, cursor pagination, and scoped trace
retention. Downstream schedulers and worker loops should call these kernel
primitives instead of implementing parallel timeout, cancel, pagination, or
trace-pruning behavior.

## 2026-05-15 Dedicated Execution Platform runtime database

Decision: live Execution Platform runtime and Work Queue state should use a
dedicated `execution_platform` database resolved from
`config.env.vars.EXECUTION_PLATFORM_DATABASE_URL`.

Consequences:

- Model Memory database reuse is no longer the live Execution Platform
  boundary.
- the old shared-runtime approval flag is not needed for this configuration.
- Work Queue planning/readback rows were copied into the dedicated database as
  bounded metadata and refs only.
- runtime jobs remain lifecycle truth and Work Queue remains
  projection/readback/control.
- gateway restart for this boundary must preserve port, auth, pairing, device
  identity, and ACP endpoint.

## 2026-05-15 Toolified Runtime Scheduling Before Product/Spec Proof

Decision: the next Product/Spec Planning live UX proof is blocked until the
runtime graph layer is toolified enough to make delegation, evidence, utility,
and progress first-class runtime operations.

Consequences:

- graph planning and graph execution are separate phases.
- complex work cannot run implementation before accepted decomposition.
- model-selected capabilities compile into canonical executable nodes.
- node selection must account for cost, quality, context distribution,
  specialization, parallelism, redundancy, and commitment evidence needs.
- Codex/GPT 5.5 cannot monopolize multi-commitment work unless the
  orchestrator records why cheaper/specialized nodes are unsuitable.
- Kimi is one implementation lane on the Non-Codex File-Edit Worker Loop, not
  a broad patch oracle or a separate proof-only worker path.
- Production non-Codex child work must be selected through qualified
  task-family metadata and evidence refs. Complex coding missions may not
  silently fall back to broad Codex implementation as their first move.
- Capability executor keys are execution-routing truth for scheduler nodes;
  generic node-kind/role fallbacks may not hide that a specialized executor is
  unavailable.
- node outputs must claim Mission Ledger commitments; generic artifacts do not
  imply closure.
- Work Queue readback must surface tool/app-server progress and active graph
  state.
- finalization must terminalize quickly as `needs_review` when worker evidence
  cannot be mapped to commitments.

## 2026-05-15 Product/Spec Planning Is Scheduler-First

Decision: `agent_team.product_spec_planning` is first-class but scheduler-backed only.

Consequences:

- generic workflow execution must reject Product/Spec Planning instead of producing fake contract artifacts
- Runtime Work Graph scheduler must require `planning_orchestrator` before Product/Spec Planning child nodes execute
- Product/Spec Planning can propose ActionGraphProposal and compile-readiness artifacts, but cannot create or execute child runtime jobs itself
- human planning input is bounded decision evidence and does not grant authority or mutate lifecycle
- Work Queue readback displays planning artifacts and graph state while runtime jobs remain lifecycle truth
- final success needs model-authored closeout plus accepted runtime evidence, not degraded/system-only closeout

## 2026-05-16 Mission Ledger Closure Is Claim-First

Decision: Mission Ledger commitments close from explicit node-authored
evidence claims, not from generic artifact refs or process completion.

Consequences:

- production scheduler nodes that advance Mission Ledger commitments must
  return `evidenceClaims` naming the commitment id, evidence ref, evidence
  kind, bounded summary, limitations, and raw-storage flags.
- deterministic code validates claim shape, known commitment ids, existing
  refs, storage flags, and impossible claim kinds; it does not judge semantic
  sufficiency.
- the model-authored Mission Ledger evaluator receives claimed evidence refs
  as the only acceptable closure candidates.
- malformed evaluator output gets one bounded repair pass; persistent failure
  moves the job to `needs_review` with diagnostic evidence.
- Work Queue owner readback must expose evidence-claim refs and active
  graph/tool progress so the owner can see what evidence is expected,
  produced, accepted, and still open.
