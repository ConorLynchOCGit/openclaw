---
summary: "Near-final OpenClaw-native agentic orchestration architecture replacing rigid route/intake/scheduler small-verb workflows with native runtime jobs, sessions, events, handoffs, and shared evidence closure."
title: "OpenClaw Native Agentic Orchestration Architecture"
---

# OpenClaw Native Agentic Orchestration Architecture

## Summary

Replace the rigid prompt-intake -> small-verb routing -> RequirementMap -> small-verb scheduler -> worker-node lifecycle pipeline with a native OpenClaw agentic orchestration architecture.

The core correction is the same lesson learned from the successful worker-node run: do not force models through brittle phase protocols when the work requires semantic judgement. Give agents clean role prompts, real context, natural tools, native todo/progress tracking, and runtime-owned evidence closure.

The deterministic runtime should own only deterministic truth: authority, persistence, lifecycle, events, Work Queue projection, validation records, evidence attachment, token/context accounting, and terminal state. Agents should own judgement: intent interpretation, task-context acquisition, route choice through tool/handoff selection, plan shape, decomposition, implementation readiness, critique, repair strategy, and closeout narrative.

Do not build a new orchestration framework beside OpenClaw. Use OpenClaw-native agent profiles, sessions, handoffs/tasks, tools, todo/update_plan, events, prompt receipts, compaction, and evidence closure.

The architecture should be agent-native, not framework-native. The fewer new nouns we introduce, the less likely we are to rebuild the rigid runner under new labels.

The final target is:

```text
agents:main:main
  decides: answer now vs start/resume runtime execution

start_execution_session
  launches/resumes RuntimeJob + native session + one start/resume event

Native OpenClaw Session
  receives task message + refs
  owns agent loop, transcript, todo, tools, and handoffs
  decides tool/handoff/todo/edit/validate/critic/finish

Agent Registry
  provides visible specialist summaries derived from effective config/tool policy

Runtime Events
  record tool, handoff, mutation, validation, critique, and finish facts

Shared Finish Service
  checks linked events and open children
  auto-attaches evidence and terminalizes

Work Queue Read Model
  projects runtime job + session tree state
```

Agents choose paths. Runtime records truth. Work Queue reads back truth. No route object, no requirement map, no scheduler graph patch, no architecture packet, no editable work-order lifecycle unless evidence proves native OpenClaw primitives are insufficient.

Core anti-regression rules:

> If a concept can be represented as a native session message, todo item, tool call, runtime event, artifact ref, or Work Queue projection, do not create a new schema for it.

> The only durable orchestration state is runtime events plus native session state. Anything else must be a projection, artifact, or compatibility adapter.

> If the runtime needs ordering, blocking, or aggregation, express it as session-event relationships first. Do not introduce graph state until session-event relationships fail a proof.

Branching rule:

> Branches are native child sessions/handoffs before they are graph nodes. Only introduce durable graph state if native session parent/child events cannot support resume, oversight, and closeout.

## Core Architecture

`agents:main:main` remains the principal user-facing orchestrator, but it should not carry long-running execution state.

Target shape:

```text
agents:main:main
  -> answers directly, or calls native start/resume execution-session tool
  -> RuntimeJob + native session are created/resumed atomically
  -> native session receives normal task message with attached refs
  -> execution orchestration agent chooses tools/handoffs
  -> child sessions/handoffs represent branches when needed
  -> worker agents execute with native tools
  -> critic agents review at bounded boundaries when useful or required
  -> shared finish service auto-attaches evidence and checks open children
  -> agents:main:main reports the final outcome
```

RuntimeJob is for long-running, background, mutating, or multi-agent work. Ordinary chat/status answers stay in `agents:main:main`.

The “execution orchestrator” is an agent profile plus a native session, not a new subsystem, class, module, queue, scheduler, retry engine, persistence layer, or lifecycle owner.

The current deterministic stages become compatibility adapters, eval baselines, or internal services only if they survive a first-principles justification test.

Explicitly retire as canonical workflow brains:

- `RouterStageRunner` small-verb route protocol
- `IntakeStageRunner` as canonical semantic requirement author
- `RequirementMap` as the required pre-scheduler semantic product
- `SchedulerStageRunner` small-verb graph authoring
- `SchedulerGraphPatch` as the model-facing orchestration product
- phase-constrained model loops with tiny verb tools
- graph-control vocabulary that makes the model satisfy runtime-owned schema
- requirement hydration as an orchestration abstraction

Keep deterministic validators only for structural facts: schema validity, refs, hashes, authority, lifecycle legality, storage policy, evidence presence, Work Queue mutation safety, and open-child terminality at finish.

## Native Start/Resume Tool

Add one core native primitive:

```text
start_execution_session({ objective, refs, constraints?, validationSignal? })
```

This is a runtime/session launch tool, not a semantic compiler.

Visible input should stay exactly this small:

- `objective`
- `refs`
- `constraints?`
- `validationSignal?`

Do not add:

- `targetDomain`
- `workflowId`
- `executor`
- `requirements`
- `successCriteria`
- `route`
- semantic priority
- graph fields

If the caller thinks it needs those, they belong in plain text objective/constraints or attached refs.

Refs are opaque attached context pointers with type/kind/source. They should point to things like:

- Work Queue item
- doc
- prompt
- run
- file
- artifact
- URL

The agent decides meaning.

Runtime should validate ref shape and authority only:

- kind
- uri/ref
- source
- access allowed

Runtime should not validate semantic meaning.

The tool should:

- create or resume `RuntimeJob`
- create or resume native session
- link runtime job and session atomically
- attach refs
- write exactly one start/resume event plus session metadata unless existing infrastructure already requires more
- launch/resume the native session
- return session/run readback

It must not:

- classify route
- extract requirements
- hydrate requirements
- schedule graph nodes
- choose executor semantically
- infer acceptance criteria
- create graph patches
- mutate Work Queue lifecycle without runtime evidence

Atomic launch invariant:

One call creates the job/session link, attaches refs, writes the start/resume event, and launches or resumes the native session. Avoid separate start artifact, launch receipt, work-order receipt, and session manifest unless existing infrastructure already emits them. If these happen as separate semantic steps, drift returns.

Start/resume idempotency:

`start_execution_session` needs an idempotency key or deterministic resume behavior so retried calls do not create duplicate RuntimeJobs or sessions. This is runtime plumbing, not semantic schema.

## Task Message And Todo

Do not introduce a new work-order object by default.

Execution starts from a normal native session task message plus attached refs.

Task-message guidance:

- objective
- source refs
- constraints
- validation signal
- optional open questions / blockers

Runtime may record a compact receipt for audit or recovery only if native session metadata/events do not already provide it. It should not validate semantic fields or create an editable task-message lifecycle unless native session messages/events prove insufficient.

Do not require or persist as first-class fields:

- lifecycle state
- graph patch fields
- evidence contracts
- worker packet metadata
- role graph refs
- transport policy refs
- phase ids
- small-verb tool history
- duplicated source bodies
- deterministic reason-code bags
- architecture packet refs
- target domain
- requested outcome
- requirement lists
- hydrated requirement records

Use native `todo` / `update_plan` as the session-local progress board. It may track conceptual deliverables and current next steps.

Hard line:

`todo/update_plan` is progress only. It must not be used as requirement truth, acceptance criteria, coverage map, scheduler state, lifecycle authority, or evidence closure.

If the agent needs more task context, it should acquire it through normal source-shaped tools and record progress in todo if useful. Do not preserve a separate requirement-hydration phase.

## Runtime Job, Session, And Work Queue Relationship

Avoid a triple-state problem:

```text
RuntimeJob
NativeSession
WorkQueueItem
```

The clean relationship is:

- `RuntimeJob` owns lifecycle.
- Native session owns agent transcript/events/todo/tool loop.
- Work Queue projects both.
- Shared finish service terminalizes the runtime job.
- Work Queue does not independently infer lifecycle.

Hard invariant:

Every execution session must have exactly one owning `RuntimeJob`, or one parent `RuntimeJob` with child session ids. No orphan execution sessions for runtime work. No Work Queue item should point to a session without runtime job evidence.

## Runtime Events

Event linkage is the load-bearing piece of this architecture.

Every runtime event emitted during execution must carry:

- `runtimeJobId`
- `sessionId`
- `eventKind`
- `parentSessionId?`
- `childSessionId?`
- `timestamp`

This is a hard runtime event-envelope requirement, not best effort.

Runtime events should record:

- tool calls/results
- handoffs
- child session creation/completion
- mutation events
- validation events
- critic events
- artifact events
- finish attempts/results
- control commands
- waiting-for-human pauses/resumes

## Shared Finish Service

Do not make closeout a model-authored document.

Do not create unrelated closure paths.

Use one runtime-owned evidence closure service underneath scoped visible tools:

- `node_finish` for worker nodes
- `execution_finish` or equivalent only if orchestration sessions need a role-scoped visible finish tool

Both should share:

- evidence attachment
- validation evidence lookup
- mutation event lookup
- review/critic ref attachment
- linked child-session terminality checks
- terminalization rules
- repeated failure handling

If possible, keep one visible finish tool with role-scoped wording. If `node_finish` is too node-specific for orchestration sessions, add a thin alias only at the tool-catalog layer, not a separate closure system.

Explicitly prohibit:

- separate finish validators
- separate evidence attachment paths
- separate terminal state machines
- model-owned evidence ref choreography

Visible close action should be close to:

```text
finish({ status, summary })
```

The model supplies:

- intended status
- concise summary
- optional blocker or needs-review explanation

Runtime auto-attaches:

- changed files from mutation events / git diff for the run
- validation evidence from validation agents/scouts
- diagnostics and artifact refs
- node/session/run refs
- review/critic refs
- Work Queue projection refs

Shared finish must also check linked child sessions. It should not accept while child work is still dangling unless those children are terminal, canceled, or explicitly ignored with evidence.

If evidence exists and child-session state is closed, closure accepts. If evidence is missing or child work is dangling, closure rejects once with an executable correction. Repeated evidence-shape or dangling-child failures terminalize as `needs_review`, not an agent loop.

Hard prerequisite:

Shared finish can only auto-attach evidence if mutation, validation, handoff, critic, and artifact events are reliably linked to the owning `RuntimeJob`/session. Do not compensate for missing event linkage by asking the model to provide refs.

## Agent Roles

### Principal Orchestrator: `agents:main:main`

Responsibilities:

- converse with the user
- decide whether to answer directly, start execution, resume execution, or ask for clarification
- inspect current run / Work Queue / execution status through native tools
- start or resume execution orchestration sessions through native start/resume tool
- report final outcomes

Non-responsibilities:

- long-running execution
- direct file mutation
- hidden scheduling
- Work Queue lifecycle mutation without runtime evidence

### Execution Orchestration Agent

A dedicated long-running OpenClaw native session launched for a runtime job, using the execution-orchestrator profile.

It is not a special subsystem. It must not grow its own persistence, queue, scheduler, retry logic, or lifecycle state.

Responsibilities:

- start from the native task message
- inspect task context through normal tools
- route work to worker, critic, or domain specialist as needed
- decide whether planning is needed before coding
- choose direct worker vs specialist vs critic
- synthesize agent outputs
- finish through the shared finish service

Tools should be high-level and natural:

- inspect Work Queue item
- inspect active/latest run
- read linked docs
- search bounded project docs
- hand off / call planning, coding, design, research, validation, or critic agents
- finish through shared runtime evidence closure

Avoid small semantic verbs like “record candidate,” “merge requirement,” “patch work unit,” “select executor workflow,” “hydrate requirement,” or “create/update work order.”

The execution orchestration agent must not own scheduling state. It chooses next action in a normal agent loop, while persisted run state stays in native session/runtime events.

Routing should be tool choice, not a route record. The route is visible in the trace because the agent called a coding worker, planning specialist, critic, etc. Persist route rationale as a normal event if useful, but do not make it required schema.

### Domain Specialists

Examples:

- coding lead
- planning lead
- design lead
- research lead
- validation lead

Do not create a standing hierarchy of domain leads by default. That can become bureaucracy.

Default path should be:

```text
execution orchestration agent -> worker or critic
```

Use a domain specialist only when the tool boundary, prompt boundary, policy boundary, or domain expertise materially changes.

Domain specialist summaries should be derived from the effective agent registry/config/tool policy at launch time, not stale docs and not a parallel manifest.

Each registry summary should stay small:

- name
- purpose
- tool boundary
- authority boundary
- good-fit tasks

Domain specialists may plan, decompose, critique, and delegate. They must not own lifecycle, persistence, terminal state, or Work Queue mutation.

### Worker Agents

The proven pattern remains:

- strong role-specific prompt profile
- clean tool affordances
- source-shaped context
- native todo/progress tracking
- real mutation tools
- validation tools
- terminal finish/closure through runtime

Coding worker stays closest to the successful Kimi worker shape.

### Critic Agents

Critics are non-mutating agents.

They should be callable specialists/tools, not mandatory workflow phases.

They review:

- routing adequacy
- task-message/work-order quality
- plan shape
- architecture fit
- technical debt risks
- schema/moving-part reduction opportunities
- validation sufficiency
- closeout quality

They emit bounded critique as ordinary task/session output with one first-line decision token:

- `ACCEPT`
- `REVISE`
- `BLOCK`

Do not create a bespoke `CritiqueArtifact`.

Critics do not create infinite recursive planning. Use one critique pass, one revision pass, then accept/block/escalate.

Critique must be actionable only. A critic objection must name a concrete risk, missing evidence, simpler design, or violated rule that changes the next action. No abstract “consider X” feedback in required paths.

Risk policy may require critique for large/risky work, but the runtime should not become a critique scheduler.

Default critique triggers:

- user asks for critique/review
- multi-file or architecture-sensitive coding work
- new subsystem or lifecycle ownership change
- validation fails after repair
- before accepting high-risk closeout

No mandatory critique phase for every run.

## Prompt Profiles

Prompt profiles should not sprawl.

New agent profiles require at least one of:

- distinct tool set
- distinct authority boundary
- stable recurring role

Deletion rule:

> If two profiles differ only by wording, merge them and pass task-specific instructions in the user/task message.

The execution-orchestrator profile should be short:

- identity
- authority boundary
- routing/handoff principle
- finish rule

Task-specific instructions belong in the task message. Tool behavior belongs in tool descriptions.

Otherwise use existing execution-orchestrator, critic, or worker profiles with different task messages.

## Task-Context Acquisition

Remove “requirement hydration” as a named abstraction.

The execution orchestration agent should acquire task context only until the native session has enough to proceed:

- objective
- source refs
- constraints
- validation signal
- optional open questions/blockers

It should not do broad document crawling. It should use source-shaped docs/search/read tools and stop once the task message plus session state is sufficient for the next action.

This is not a requirements phase. It is normal agent context acquisition.

If task context is insufficient, the orchestration agent can:

- ask a focused clarification;
- inspect a bounded Work Queue/docs/source ref;
- call a planning/research specialist for a concise handoff;
- proceed to coding if enough implementation context exists.

Native todo/update_plan tracks progress during this process. It does not justify keeping `RequirementMap`, requirement hydration, or a new requirement abstraction.

## Branching And Multi-Branch Work

Removing scheduler graphs is intentional, but complex work still needs durable branch visibility.

Native answer:

- child sessions/handoffs are the branches;
- runtime events record parent/child relationships;
- Work Queue/readback projects branch status from session/runtime events;
- shared finish service checks and attaches evidence across linked child sessions.

Every child session relation is one of:

- `blocking`
- `background`

This is event metadata, not graph state.

`blocking` children must be terminal, canceled, or explicitly ignored with evidence before parent finish can accept. `background` children may continue after parent closeout only if the finish summary and runtime events make that explicit.

Do not reintroduce graph patches unless native session parent/child events cannot support resume, oversight, and closeout.

## Flexible Progress Budgets And Safety Rails

Do not use arbitrary fixed budgets that choke active progress.

Runtime still needs deterministic safety rails for runaway sessions and fanout, but budgets should be progress-sensitive.

Track:

- active child count
- total child count
- wallclock
- token/spend usage
- repeated repair attempts
- repeated no-progress tool/action patterns
- time since last meaningful progress event
- validation/repair cycle count

Meaningful progress events include:

- accepted mutation
- accepted validation result
- useful child result
- critic accept/revise/block that changes next action
- resolved blocker
- narrowed target/source context
- finish attempt with missing evidence correction
- user steering/clarification

Budget behavior:

- warn or ask for review when spend/time/fanout grows without meaningful progress;
- allow continuation when meaningful progress is occurring;
- escalate to `needs_review` when no-progress repeats after bounded warnings;
- do not terminate solely because a fixed step count elapsed while the session is actively making real progress;
- do not allow unbounded child-session fanout without progress-sensitive review.

These are safety rails, not semantic scheduling.

## Pause, Cancel, Redirect, And Human Clarification

Control commands must operate on the `RuntimeJob`-owned session tree.

Pause:

- pauses the parent session and relevant blocking children;
- preserves session/event state.

Cancel:

- cancels or marks ignored child sessions according to relation and evidence;
- terminalizes through runtime evidence, not model prose.

Redirect:

- appends a steering message to the correct native session;
- does not create a new route object;
- records a runtime control event.

Human clarification:

If the orchestration agent needs clarification, it should pause the RuntimeJob as `waiting_for_human` and surface a focused question through `agents:main:main` / Work Queue readback. It should not continue speculative planning forever.

## Required User Flows

### “Execute the next Work Queue item”

Flow:

```text
main
  -> eligible Work Queue read model returns bounded eligible items
  -> native start/resume tool creates/resumes RuntimeJob + session atomically
  -> agent inspects eligible item details and linked refs
  -> native task message guides execution
  -> route directly to coding/design/planning if sufficient
  -> otherwise ask planning/research specialist for concise missing context
  -> worker execution
  -> validation/review/closeout
```

Runtime should provide deterministic eligibility filters for:

- queue state
- blocked state
- rank
- lifecycle legality
- stale-run exclusion
- already-running item exclusion

The eligible Work Queue read model should return eligible items and reason codes for excluded items. It should not rank semantically, choose executor, or infer requirements. Avoid an opaque “next = X” unless rank/state make selection deterministic.

The agent can choose among eligible items or ask clarification, but queue eligibility itself is not a semantic free-for-all.

The system may pull task context from:

- Work Queue item details
- linked docs
- project specs
- recent run state
- relevant architecture-rule context

It should not create a hydrated requirement set.

### Large Prompt With Requirements

Flow:

```text
main
  -> native start/resume tool
  -> execution orchestration session
  -> start from prompt-backed native task message
  -> critic checks scope/architecture risk if nontrivial
  -> route to worker or planning specialist
  -> execute
```

No requirement-map small-verb extraction unless explicitly used as a temporary compatibility adapter.

### Undocumented Feature Request

Flow:

```text
main
  -> native start/resume tool
  -> execution orchestration session
  -> determine whether implementation is grounded enough
  -> if yes: coding worker
  -> if no: planning/product-spec specialist first
  -> critic boundary if architecture-sensitive
  -> coding worker
```

The orchestration agent should not require a Work Queue item to exist before useful work can begin.

### Coding Plus Design

Flow options:

- design specialist first, then coding
- coding begins with design critic in parallel
- design review after implementation
- human clarification only when design intent is materially ambiguous

The orchestration agent chooses based on whether design blocks implementation.

### Existing Run / Repair

Flow:

```text
main
  -> inspect active/latest execution session
  -> native start/resume tool resumes RuntimeJob + session
  -> repair through existing worker/session evidence
```

Do not create a fresh graph or duplicate execution when a resumable session exists.

## Planning Handoff Text

Planning output must not poison implementation.

Planning specialists should not hand workers a giant plan or planning transcript.

They should produce concise implementation-ready handoff text:

- objective
- target surfaces
- constraints
- validation signal
- open questions/blockers

The worker should receive useful context, not planning transcript sludge.

Planning specialists produce advice or concise handoff, not a graph, phase list, requirement map, or worker packet. The execution orchestration agent decides the next handoff/tool call.

Keep this as prose guidance, not a required JSON shape. Do not validate semantic fields.

Planning/research specialists need the same worker lesson: concise handoff, source-shaped evidence, no transcript dump, no requirement lists. If they cannot make the next action clearer, they should return blocked or ask a focused question.

## Validation, Review, And Critic Child Expectations

Do not create semantic evidence-contract documents.

Use runtime event type expectations:

- validation child sessions must emit command/result evidence events;
- critic child sessions must emit ordinary task/session output with first-line `ACCEPT`, `REVISE`, or `BLOCK`;
- review child sessions must emit concise findings or accept output;
- all child events must carry runtime job/session linkage.

Finish service can then inspect predictable event types without asking the model to provide hidden refs.

## Higher-Reasoning And Recursive Critique

Use boundary critique, not always-on critique.

Critique points:

1. After initial task message when risk triggers fire
2. After decomposition or plan, before expensive execution
3. Before risky implementation begins
4. After worker validation
5. Before final closeout acceptance for high-risk work

Coding critique should check:

- no deterministic semantic judgement
- no semantic forests
- no edge-case solution that harms general performance
- no duplicate canonical systems
- no unnecessary schema fields
- no extra lifecycle owner
- no split ownership with tool transport
- no hidden context abstractions
- no evidence closure delegated to the model
- architecture-specific decisions from memory/context are respected

Critique input should include compact relevant architecture context, not broad memory dumps.

## Architecture Rules Context

Remove `ArchitectureContractPacket` as a named architecture object.

Use native bounded memory/docs/context retrieval that returns source-linked excerpts.

The orchestrator or critic can ask for:

```text
relevant architecture rules for this subsystem
```

The returned excerpt should include:

- rule title
- rule text
- source refs
- affected subsystem when known
- short “what this prevents” note when helpful

Examples:

- `IntakeRunner owns this lifecycle; do not split ownership with tool transport`
- `No deterministic semantic judgement`
- `No semantic forests`
- `Runtime owns evidence closure`
- `Work Queue is projection/control, not lifecycle truth`

Rules are selected based on domain and touched subsystem. They should be small, source-linked, and model-visible.

Do not inject broad memory or long historical notes into execution context.

## Runtime Ownership

Runtime owns:

- authority and permission checks
- ref shape/authority validation
- tool execution
- session creation/resume
- event persistence
- event envelope/linkage enforcement
- artifact persistence
- Work Queue projection
- lifecycle transitions
- cancellation / pause / resume / redirect event handling
- compaction and token accounting
- validation artifact capture
- mutation events
- evidence attachment
- terminal status
- deterministic Work Queue eligibility filtering
- linked child-session terminality checks at finish
- progress-sensitive safety rails

Runtime does not own:

- semantic requirement interpretation
- plan quality judgement
- route rationale
- architecture critique
- implementation sufficiency judgement
- closeout prose

## Launch And Runtime Overhead Cleanup

Native orchestration proofs must not preserve the old pattern where a standalone script becomes a second execution host.

The resident gateway/native runtime is the canonical execution host. Proof scripts should become thin clients over the native gateway/RPC/control surface:

- submit or resume native execution work;
- poll runtime jobs, events, artifacts, and closeout;
- cancel through the runtime control path when interrupted;
- write bounded proof summaries from runtime truth.

Proof scripts should not own:

- source-runtime startup;
- cold `tsx` import chains as the normal proof path;
- cold `loadConfig()` as the normal proof path;
- native session construction as a parallel execution path;
- execution loops;
- runtime shutdown semantics;
- direct repository lifecycle mutation outside the runtime control APIs.

Keep an in-process source-runner fallback only for development/offline debugging, and label it explicitly as `cold_source_runtime_fallback` in proof artifacts. Fallback latency must not be used as production native-launch latency.

Production native launch must not rediscover config per job. The gateway already owns the effective config snapshot. Native execution run-once code should receive the resident gateway launch context and reuse it.

Initial launch context can be:

```text
NativeExecutionLaunchContext = {
  config,
  runtimeJobs,
  workQueue,
}
```

The cleaner long-term shape is:

```text
NativeExecutionLaunchContext = {
  config,
  runtime,
  registries,
  modelRuntimeCache,
  artifactPolicy,
}
```

Do not expose that context as a broad public schema. It is an internal OpenClaw runtime dependency bundle, not a model-facing object.

`runGatewayNativeExecutionSessionRuntimeJobOnce` must not call `loadConfig()` in the hot path when invoked from resident gateway execution. A fallback loader is acceptable only for legacy tests or explicitly labeled source-runner fallback.

Agent launch should use lightweight bootstrap for native execution workers/orchestrators when their prompt profiles are self-contained. Lightweight/default bootstrap must avoid reading source-backed agent docs before filtering them out. If the result is intentionally empty, return empty before file I/O.

Launch observability must separate latency classes:

- harness startup time;
- gateway submit time;
- runtime job claim time;
- native launch time;
- config/context reuse time;
- agent-pack registry load time;
- model runtime discovery time;
- embedded agent bootstrap time;
- provider request wait time;
- first model action time;
- first tool/edit/validation time.

Do not blend standalone harness cold-start with model-active wallclock or production launch latency.

Runtime launch/provider diagnostics should be persisted as bounded runtime events only:

- launch timing;
- agent launch;
- provider request diagnostics;
- provider wait/lock handoff;
- first model action when available;
- terminal state.

These events must not store raw prompts, raw provider bodies, raw tool schemas, raw command logs, secrets, or unbounded payloads.

Proof artifacts should summarize runtime truth. They should not replay the world. Keep:

- proof id;
- job id/session id;
- selected work item;
- proof source kind;
- timing phases;
- terminal state;
- changed files;
- validation evidence refs;
- bounded event summary;
- safety flags.

Avoid duplicating large event arrays unless explicitly bounded/truncated.

Hard anti-regression:

> Do not create a `ProofRuntime`, proof-specific execution host, proof-specific config loader, or proof-specific orchestrator. Use resident gateway/native RPC, RuntimeJob events/artifacts, and runtime control.

## Tooling Principles

Carry forward the worker-node lessons:

- tools return real context, not ledger-shaped abstractions
- model-facing output is source-shaped, diff-shaped, diagnostic-shaped, or status-shaped
- avoid metadata-heavy refs unless they are directly readable through normal tools
- no broad hidden context ledgers as the agent’s supposed source of truth
- no tiny semantic verb forests
- no duplicate overlapping tools for the same action
- tool descriptions must be clear, concrete, and behavior-shaping
- agents should use normal handoff/task tools, not execution-platform-only delegation protocols
- native todo/update_plan tracks progress, not lifecycle or requirements

## Work Queue Projection

Work Queue remains projection/control only.

Projection should include compact session-tree truth, not just parent state:

- parent runtime job status
- parent session status
- active child count
- blocking child count
- background child count
- failed child count
- completed child count
- current blocker, if any
- waiting-for-human question, if any
- latest meaningful progress summary
- finish/evidence status

This prevents operators losing visibility into why work is blocked without creating new lifecycle ownership.

## Closeout And Evaluation

Closeout should be runtime-owned evidence attachment plus model-authored summary.

Final status requires:

- runtime evidence attachment
- validation evidence or explicit validation blocker
- review/critic evidence when required
- changed-file evidence for implementation work
- explicit needs-review/blocked reason if incomplete
- no dangling required child sessions

Evaluation should run on traces, not just final artifacts.

Focus trace/eval questions on known failure modes:

- did the orchestration agent choose the right next tool/agent?
- did it acquire task context from the right source?
- did it ask unnecessary clarification?
- did it route to planning when coding was enough?
- did it skip planning when planning was required?
- did critique catch architecture drift?
- did workers receive enough context?
- did workers edit early enough?
- did validation run through approved commands?
- did closeout attach evidence automatically?
- did Work Queue projection reflect runtime truth?
- did runtime/session/Work Queue state drift?
- did planning handoff stay concise?
- did context acquisition become broad crawling?
- did child sessions finish or get explicitly closed/ignored before parent finish?
- did progress-sensitive safety rails avoid both runaway work and premature choking?

Avoid building a general eval platform inside this refactor.

## What To Remove Or Retire

Retire from the canonical path:

- deterministic route/intake/scheduler small-verb loops as meaning owners
- `RequirementMap` as mandatory semantic intermediary
- requirement hydration as a named abstraction
- `SchedulerGraphPatch` as model-facing orchestration product
- phase-specific model tool protocols for semantic judgement
- model-authored runtime schema ceremony
- duplicate graph-control objects
- Work Queue lifecycle inference from model prose
- evidence refs the model must invent
- broad memory/context projection as hidden agent truth
- standing domain-lead hierarchy as default routing structure
- mandatory critique phases
- route decision object as a required persisted schema
- editable work-order lifecycle
- named architecture packet schema
- create/update work-order small verbs
- parallel capability-card manifest
- separate closure backend
- bespoke `CritiqueArtifact`
- branch object / graph patch as default branch representation
- fixed arbitrary budget gates that terminate active progress

Compatibility rule:

Old route/intake/scheduler paths may only launch the new native session path or replay old proofs. They cannot receive new feature work except deletion/migration. Do not patch them into being “good enough” unless the fix is necessary to bridge into the new path.

Current transition enforcement:

The legacy structured front-door execution path must remain behind an explicitly named compatibility gate, `legacy_front_door_execution_compatibility`, in addition to any older router/native-submit rollout gates. Normal chat should route through the main agent/orchestrator path unless this compatibility gate is intentionally enabled for migration or replay.

Retirement gate:

After the new path passes the proof families, block new runtime calls into old runners except replay/migration.

Post-proof deletion mandate:

After implementation and representative proofs for the native agentic system pass, aggressively delete the old route/intake/scheduler system rather than leaving tens of thousands of lines of dead workflow code in the repo. Compatibility is a temporary bridge, not a permanent second platform. The old deterministic brains should not remain available as prompt/process poison that can infect new orchestration behavior.

Keep as internal compatibility only where needed during transition:

- existing runtime graph repository
- existing node/session launch infrastructure
- existing Work Queue projection
- existing evidence/artifact persistence
- existing deterministic validators

## Implementation Strategy

1. Add native `start_execution_session({ objective, refs, constraints?, validationSignal? })`.
2. Ensure `start_execution_session` keeps only objective, refs, constraints, and validation signal as visible inputs.
3. Add ref shape/authority validation without semantic ref interpretation.
4. Add idempotency key or deterministic resume behavior to prevent duplicate RuntimeJobs/sessions on retry.
5. Ensure the start/resume tool atomically creates/resumes `RuntimeJob`, creates/resumes native session, links them, attaches refs, records one start/resume event, launches/resumes the session, and returns readback.
6. Keep `start_execution_session` dumb: no route, no workflow selection, no semantic validation, no decomposition, no requirement extraction.
7. Define runtime event envelope enforcement with `runtimeJobId`, `sessionId`, `eventKind`, optional parent/child session ids, and timestamp.
8. Define the shared finish service used by `node_finish` and orchestration finish.
9. Add `execution_finish` only if orchestration sessions need a scoped visible finish tool separate from `node_finish`.
10. Ensure mutation, validation, handoff, critic, and artifact events reliably link to owning `RuntimeJob`/session before relying on auto-attached finish evidence.
11. Add child session relation metadata: `blocking` or `background`.
12. Add linked child-session terminality checks to shared finish.
13. Add progress-sensitive safety rails for fanout, wallclock, spend/tokens, repair attempts, no-progress patterns, validation/repair loops, and time since meaningful progress.
14. Add pause/cancel/redirect handling over RuntimeJob-owned session trees.
15. Add waiting-for-human clarification behavior and readback.
16. Add an execution-orchestrator prompt profile.
17. Keep execution-orchestrator prompt short: identity, authority boundary, routing/handoff principle, finish rule.
18. Add critic and optional domain-specialist prompt profiles only when they have distinct tool sets, authority boundaries, or stable recurring roles.
19. Add high-level native tools for Work Queue/docs/run inspection.
20. Add eligible Work Queue read model for “execute next item” flows.
21. Add Work Queue projection of compact session-tree truth.
22. Do not add create/update work-order or requirement-hydration small verbs unless native session messages/events prove insufficient.
23. Wire `agents:main:main` to start/resume execution orchestration sessions through the native start/resume tool.
24. Make execution orchestration route by native handoff/task calls, not small-verb route phases.
25. Represent branches as child sessions/handoffs with parent/child runtime events before considering graph nodes.
26. Add compact architecture-rule retrieval for critics and architecture-sensitive plans.
27. Add boundary critic specialist calls with one-pass critique/revision limits and default risk triggers.
28. Route coding work to the proven worker-node agent path.
29. Ensure planning/research specialists output concise implementation-ready handoff text, not giant plans/transcripts.
30. Replace model-owned closeout ref choreography with shared finish service.
31. Ensure `RuntimeJob`, native session, and Work Queue have one stable lifecycle/projection relationship.
32. Add trace/eval harnesses for routing, task-context acquisition, branching, critique, worker success, safety rails, control commands, and closeout.
33. Mark old route/intake/scheduler runners as compatibility adapters, not canonical ownership.
34. After proof acceptance, block new runtime calls into old runners except replay/migration.
35. Delete compatibility layers only after the new path passes representative coding Work Queue, large prompt, undocumented feature, multi-branch, and repair/resume proofs.
36. Make resident gateway/native RPC the canonical proof execution host.
37. Convert standalone native proof scripts into thin clients over resident gateway/native RPC/control readback.
38. Keep any in-process source-runner proof path only as a labeled `cold_source_runtime_fallback`.
39. Pass resident gateway config/runtime launch context into native execution run-once code instead of calling `loadConfig()` per job.
40. Ensure lightweight/default native bootstrap can return an empty bootstrap set before source-backed agent doc file I/O.
41. Persist bounded launch/provider timing events for native sessions without raw prompt/provider/tool/command payloads.
42. Add phase-separated timing in proof artifacts so harness startup, gateway submit, runtime claim, native launch, provider wait, first model action, first tool/edit, and validation latency are not conflated.

## Test And Proof Plan

Add proof families for:

- direct small coding request
- large prompt coding request
- “execute next Work Queue item”
- Work Queue item with linked docs context
- undocumented feature requiring planning before coding
- coding plus design/review
- multi-branch work represented as child sessions/handoffs
- architecture-sensitive implementation requiring critic
- active run resume
- failed validation repair
- closeout with evidence present
- closeout with evidence missing
- closeout blocked by dangling child session
- critic catches known architecture-rule violation
- critic output remains ordinary task/session output, not bespoke artifact
- critic decision line uses `ACCEPT`, `REVISE`, or `BLOCK`
- orchestration agent avoids unnecessary planning
- orchestration agent asks clarification only when materially required
- orchestration agent pauses as waiting_for_human instead of speculative planning when clarification is needed
- route is visible through tool choice/trace rather than required route schema
- runtime job and session relationship does not drift
- shared finish backend is used by worker and orchestration finish paths
- finish auto-attachment works from linked mutation/validation/handoff/critic/artifact events
- deterministic Work Queue eligibility prevents stale/blocked/running item selection
- Work Queue read model does not choose executor or infer requirements
- Work Queue projection shows compact child session truth
- planning handoff text remains concise and worker-ready
- native todo/update_plan does not become lifecycle or requirement truth
- runtime events always carry required event envelope fields
- refs are authority-checked without semantic interpretation
- start/resume idempotency prevents duplicate RuntimeJobs/sessions
- pause/cancel/redirect operate on RuntimeJob-owned session tree
- progress-sensitive safety rails permit continuation during meaningful progress
- progress-sensitive safety rails escalate repeated no-progress
- old route/intake/scheduler paths only bridge into new native session path or replay old proofs
- old route/intake/scheduler paths reject new runtime calls after retirement gate
- resident gateway/native RPC is the canonical proof execution host
- standalone proof scripts are thin clients or explicitly labeled `cold_source_runtime_fallback`
- native run-once code reuses resident gateway config/runtime launch context and does not cold-load config per job
- lightweight/default native bootstrap does not read source-backed agent docs before returning an intentionally empty bootstrap set
- proof artifacts separate harness startup, gateway submit, runtime claim, native launch, provider wait, first model action, first tool/edit, and validation timing
- launch/provider runtime events remain bounded and never include raw prompts, raw provider bodies, raw tool schemas, raw command logs, secrets, or unbounded payloads

Acceptance criteria:

- native start/resume tool can create or resume RuntimeJob + session atomically
- `start_execution_session` has only objective, refs, constraints, and validation signal as visible semantic inputs
- the canonical path does not require `RequirementMap` or `SchedulerGraphPatch`
- no model has to satisfy small semantic verb protocols
- no requirement-hydration abstraction exists in the canonical path
- main agent does not carry long-running execution state
- execution orchestration uses native sessions/handoffs/tools/todo
- domain specialists are optional registry-derived summaries, not a standing hierarchy
- critic is bounded, actionable, ordinary task/session output, and cannot loop indefinitely
- runtime owns evidence attachment and terminal close
- parent finish cannot accept with dangling required child sessions
- Work Queue remains projection/control only
- coding worker behavior does not regress from the successful agentic run
- traces expose route, handoff, critique, worker, validation, and closure decisions
- no fixed arbitrary budget gate terminates active progress
- progress-sensitive safety rails still prevent runaway no-progress/fanout
- no new route object, architecture packet schema, editable work-order lifecycle, requirement-hydration phase, parallel capability-card manifest, separate closure backend, bespoke critique artifact, branch object, or durable orchestration object beyond runtime events/native session state is introduced without proof that native OpenClaw primitives are insufficient
- no further live native orchestration proof runs until the resident gateway/native runtime path owns proof execution, the standalone source-runner path is removed from the normal proof path or labeled as fallback, and the runtime can prove phase-separated launch timing
- no native execution hot path calls `loadConfig()` when a resident gateway config snapshot is available
- native execution lightweight/default bootstrap avoids source-backed doc file I/O when the effective bootstrap file set is intentionally empty
- launch/provider diagnostics are visible as runtime events soon enough to distinguish pre-provider launch overhead from provider/model latency
- proof artifacts summarize bounded runtime truth rather than dumping large event arrays or raw execution payloads

## First Implementation Step

When shifting from planning to implementation, the first implementation step is to document this entire proposal verbatim in a durable technical spec.

Requirements for that first step:

- record the complete proposal verbatim;
- do not omit any detail from this plan;
- place the spec in the durable project specs area;
- index it from the relevant project index;
- make no functional code edits before the spec exists and is indexed;
- return with the spec URL/path before any further edits.

## Assumptions

- The successful Kimi worker run is valid evidence that native agentic execution is superior to rigid worker harnesses for coding.
- We are optimizing for final or near-final architecture, not an incremental v1 around legacy runners.
- Existing deterministic components may be reused only when they serve runtime truth, not when they own semantic judgement.
- Native todo/update_plan is sufficient for session-local progress tracking and is not a reason to keep requirement abstractions.
- Native child sessions/handoffs are sufficient for branch visibility unless proofs show resume, oversight, or closeout cannot work without durable graph state.
- Flexible progress-sensitive budgets are required because arbitrary fixed budgets have repeatedly choked useful active progress.
- Coding is the first proof domain because it has objective validation and a now-proven worker pattern.
- Other domains should follow the same architecture through domain profiles and registry-derived specialist summaries, not separate workflow brains.
