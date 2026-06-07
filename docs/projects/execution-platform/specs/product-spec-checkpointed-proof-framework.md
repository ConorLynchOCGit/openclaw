---
summary: "Checkpointed proof framework for Product/Spec Planning and Product/Spec-targeted coding proofs on the current RequirementMap, SchedulerGraphPatch, and OpenClaw-native node execution spine."
title: "Product/Spec Checkpointed Proof Framework"
---

# Product/Spec Checkpointed Proof Framework

This proof framework evaluates Product/Spec Planning and Product/Spec-targeted
coding runs on the current generic runtime spine:

```text
RouterStageRunner
  -> IntakeStageRunner
      -> SourcePromptArtifact
      -> RequirementMap
  -> SchedulerStageRunner
      -> SchedulerGraphPatch
  -> RuntimeGraphRepository
      -> RuntimeGraphNode / RuntimeGraphEdge
  -> NodeLifecycleTransitionRunner
      -> NodeExecutionSnapshot
      -> runNodeAgentSession
      -> OpenClaw native agent session
      -> node.finish
  -> validation / review / closeout / readback
```

Older proof ladders based on Mission Ledger, Commitment Work Packets,
WorkIntentGraph, resource focus, node resource demand, resource materialization,
context handoff packets, worker packet readiness, Kimi/Qwen bespoke worker
loops, or default context synthesis are retired for the fresh production path.
They may be historical evidence or explicit negative tests only.

## Proof Families

### Coding Vertical Proof

Executor workflow:

```text
agent_team.coding
```

Target subject:

```text
agent_team.product_spec_planning
```

This proof shows that the coding vertical can implement Product/Spec Planning
framework code through OpenClaw's runtime instead of Codex manually editing the
repo outside the platform.

The run must reach an implementation-bearing runtime node and prove:

- RequirementMap preserves the owner's real implementation requirements.
- SchedulerGraphPatch creates coherent implementation, validation, review, and
  closeout nodes.
- RuntimeGraph persists graph nodes and edges from the patch.
- NodeLifecycleTransitionRunner prepares a NodeExecutionSnapshot.
- OpenClaw native agent session starts through `runNodeAgentSession`.
- agent reads the node snapshot and source prompt refs through
  `openclaw.resource.read`.
- agent uses normal OpenClaw repo tools, skills, and subagents as needed.
- agent edits or precisely blocks.
- agent validates or precisely blocks.
- agent terminalizes through `node.finish`.
- runtime/readback consumes the typed result.

### Product/Spec Workflow Proof

Executor workflow:

```text
agent_team.product_spec_planning
```

This proof shows that Product/Spec Planning can produce planning artifacts and
compile-readiness evidence without executing proposed child work.

The run must prove:

- correct routing to Product/Spec Planning as executor.
- RequirementMap intake over the full prompt.
- SchedulerGraphPatch graph creation for planning, optional research,
  planning capsule, optional human decision, action graph compile, validation,
  review, and closeout.
- OpenClaw-native node sessions for executable planning nodes.
- PlanningIntentRecord / ResearchBrief when needed / PlanningCapsule /
  ActionGraphProposal / CompileRuntimePlanResult / ProductSpecPlanningCloseout.
- no child runtime-job execution.
- no child Work Queue lifecycle mutation.
- no implementation success claim for proposed child work.

## Checkpoint Ladder

Each checkpoint is runner-owned. The proof harness may project checkpoint
state and stop at supported boundaries, but it must not own lifecycle, repair,
or semantic authoring.

### 1. Payload And Router

Required evidence:

- prompt hash and prompt length match the submitted prompt artifact.
- full prompt reaches runtime as volatile input and bounded source prompt
  artifact refs.
- executor workflow and target subject refs are split correctly.
- Product/Spec Planning is executor only for planning/spec/capsule/action graph
  proposal work.
- Product/Spec Planning is target subject only when the owner asks to
  implement/test/harden/wire Product/Spec Planning code.
- router uses provider-native tools and the shared tool transport.
- safety/authority constraints travel as constraints; they do not become
  regex route blockers.

Stop conditions:

- prompt truncation.
- wrong executor workflow.
- route ambiguity for a clear execute request.
- live submit and replay payload divergence.

### 2. RequirementMap

Required evidence:

- SourcePromptArtifact exists and is bounded by ref/hash.
- IntakeStageRunner walks the whole prompt in bounded windows.
- RequirementMap exists and uses current v2 compact schema.
- requirements have text, role, and source refs.
- coverage records every planned prompt window as candidate-bearing or
  no-requirement.
- no Mission Ledger, ObligationGraph, DiscoveryBrief, lexical-anchor, or
  discovery-seed product is live pre-scheduler truth.
- native provider tools are used; JSON-shaped tool calls are not accepted on
  the production path.

Quality review:

- requirements should represent real owner deliverables, constraints,
  validation, review, closeout, and non-goals without preserving intake
  process instructions as implementation work.
- quality concerns may produce `needs_review`, but deterministic code must not
  pretend to judge semantic adequacy beyond coverage, refs, shape, and storage.

Stop conditions:

- missing RequirementMap.
- prompt coverage incomplete.
- no runnable or planning requirements for an execution prompt.
- persisted raw prompt, raw model output, raw provider log, raw tool log,
  hidden reasoning, or unbounded body.

### 3. SchedulerGraphPatch

Required evidence:

- SchedulerStageRunner consumes RequirementMap, not raw prompt fallback or
  Mission Ledger counts.
- SchedulerGraphPatch is accepted.
- graph has coherent node seeds, requirement coverage, and edges.
- validation, review, and closeout are explicit graph nodes by default.
- runtime derives node ids, node kinds, executor keys, worker refs, evidence
  modes, storage flags, authority flags, and obvious tail ordering.
- no WorkIntent graph-control nodes, WorkIntent promotion, full staged
  scheduler JSON drafts, scheduler submit tools, or model-authored runtime
  envelopes appear in the fresh path.

Stop conditions:

- no graph nodes.
- validation/review/closeout omitted without explicit typed policy reason.
- graph collapses into one vague implementation node when separable runtime
  work is required.
- model is asked to invent runtime-owned fields.
- scheduler failure is classified from reason-code bags instead of typed
  scheduler blockers.

### 4. RuntimeGraph Persistence

Required evidence:

- RuntimeGraphRepository persists nodes and edges from SchedulerGraphPatch.
- graph metadata remains bounded manifest/projection data.
- requirement refs and source prompt refs are inherited from RequirementMap.
- Work Queue/readback can project active graph progress without raw logs.

Stop conditions:

- graph persistence loses requirement coverage or source refs.
- graph metadata stores large packet bodies, raw prompt/model output, raw logs,
  secrets, or hidden reasoning.
- replay cannot identify the accepted graph checkpoint.

### 5. NodeLifecycleTransitionRunner

Required evidence:

- NodeLifecycleTransitionRunner projects current gate and next legal local
  transitions.
- scheduler does not decide node-local worker start, context sufficiency,
  validation repair, evidence closure, or escalation.
- NodeExecutionSnapshot is persisted before OpenClaw agent session start.
- snapshot includes node identity, attempt id, agent id, task refs,
  requirement refs, source prompt refs, authority refs, evidence contract ref,
  validation policy ref, storage policy, and replay metadata.
- snapshot does not duplicate raw prompt/source bodies or worker packet bodies.

Stop conditions:

- scheduler or replay opens an old pre-worker context/materialization gate.
- missing node-local preconditions become generic worker adapter failure.
- no NodeExecutionSnapshot exists for an executable node.

### 6. OpenClaw Native Node Session

Required evidence:

- `runNodeAgentSession` starts or resumes an OpenClaw agent session.
- session key follows `agent:<agentId>:node:<nodeRunId>`.
- configured agent resolves from OpenClaw config.
- `execution-node-workflow` skill is available.
- `node.finish` and `openclaw.resource.read` are allowed by tool policy.
- authority overlay narrows OpenClaw tools/fs/sandbox before tool exposure.
- agent reads the snapshot with `openclaw.resource.read`.
- agent hydrates requirement/source prompt refs as needed.
- agent uses normal OpenClaw tools and subagents for local work.
- subagent outputs, when used, are visible in the parent session before
  `node.finish`.
- terminal outcome is `node.finish`, not assistant prose.

Stop conditions:

- agent profile missing.
- required skill or tools missing.
- session fails before first OpenClaw agent turn.
- agent finishes without `node.finish`.
- replay simulates worker execution instead of hydrating recorded session
  events or stopping with `agent_session_replay_unavailable`.

### 7. Worker / Planning Execution

For coding nodes, required evidence:

- agent reads source prompt refs and requirement refs before repo search.
- agent derives repo search terms from real source material.
- agent searches and reads relevant files.
- agent edits within authority or precisely blocks.
- agent validates or precisely blocks.
- agent iterates search/read/edit/validation when failures reveal new context.

For Product/Spec planning nodes, required evidence:

- agent reads source prompt refs and requirement refs before artifact authoring.
- planning artifacts cite bounded source refs.
- ActionGraphProposal remains proposal-only.
- CompileRuntimePlanResult proves promotability, not child execution.

Stop conditions:

- agent works only from summaries and never hydrates source prompt refs.
- agent invents repo targets or planning facts without reading source refs.
- source edits or planning artifacts do not map to requirement refs.

### 8. Validation, Review, And Closeout

Required evidence:

- validation node runs after relevant implementation/source/planning nodes.
- review node evaluates implementation/planning quality and requirement
  coverage; it does not merely accept worker self-report.
- closeout node evaluates accepted evidence over RequirementMap coverage.
- model-authored closeout and completion review exist.
- readback exposes graph/node/session/evidence state from runtime artifacts.

Stop conditions:

- validation/review/closeout are passive coverage flags when mission-level
  proof work is required.
- closeout relies on Mission Ledger as hidden current truth.
- degraded/system closeout counts as success.
- open blocking requirements remain without typed blocker.

## Replay Contract

Replay may only:

- hydrate accepted checkpoints.
- resume through the same runtime boundary where supported.
- hydrate recorded NodeExecutionSnapshot, OpenClaw session events, and
  `node.finish`.
- stop with typed `agent_session_replay_unavailable` when live agent replay is
  unsupported.

Replay may not:

- reauthor RequirementMap semantics.
- create a proof-only graph.
- simulate worker execution.
- infer lifecycle from reason-code bags.
- accept stale shared latest artifacts as closure truth.
- resurrect old materialization or context-synthesis boundaries.

## Failure Attribution

Classify failures as:

- `input_starvation`: upstream product omitted source/detail the next runner
  needed.
- `contract_choke`: parser/schema/compiler rejected useful model intent.
- `step_overload`: one model/tool turn was assigned too much.
- `local_execution_failure`: current node had good inputs but failed.
- `observability_gap`: runtime may have done work but readback cannot explain
  it.
- `model_policy_mismatch`: selected model/profile/tool policy was wrong for
  the phase.
- `runtime_transition_failure`: runner-owned transition failed to persist or
  advance.
- `agent_session_failure`: OpenClaw agent session failed, omitted required
  tool use, or lacked authority/tool/skill policy.
- `readback_or_projection_failure`: runtime truth exists but owner-facing
  readback is stale or misleading.

Do not repair the symptom until upstream handoffs have been inspected.

## Proof Command

Run the checkpointed proof with the canonical prompt:

```bash
node --import tsx scripts/execution-platform-run-product-spec-checkpointed-test.mjs \
  --prompt-file docs/projects/execution-platform/prompts/product-spec-planning-workflow-plugin-production-proof-openclaw.md
```

Record walltime by phase. Record measured token/cost usage where providers
return it; otherwise label usage as unavailable or estimated without mixing it
with measured values.

## Completion Report

The report must include:

- proof family: coding vertical or Product/Spec workflow.
- prompt file and hash.
- route/executor/target-subject.
- RequirementMap coverage and quality notes.
- SchedulerGraphPatch graph quality.
- RuntimeGraph node/edge summary.
- NodeExecutionSnapshot refs.
- OpenClaw agent session refs.
- `openclaw.resource.read` evidence.
- repo/source read/edit/validation evidence for coding nodes, or planning
  artifact evidence for Product/Spec nodes.
- `node.finish` refs/status.
- validation/review/closeout status.
- Work Queue/readback status.
- walltime by phase.
- token/cost usage availability.
- exact blocker and architectural diagnosis if failed.
