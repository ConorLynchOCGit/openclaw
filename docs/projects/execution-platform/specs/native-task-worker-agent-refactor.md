---
summary: "Work plan for replacing the executable-node worker harness with native OpenClaw task, bootstrap, skill, tool, todo, and scout semantics."
title: "Native Task Worker Agent Refactor"
---

# Native Task Worker Agent Refactor

Status: proposed work plan.

This spec records the current proposed refactor for executable node work in the
Execution Platform. It is intentionally detailed: the purpose is to prevent
session-context drift and to keep the implementation aligned to the desired
OpenClaw-native agent architecture.

Current completion audit:
`docs/projects/execution-platform/specs/native-task-worker-agent-refactor-completion-matrix.md`

## Active Goal Ordering Gate

The OpenClaw fork/source-runtime unification work documented in
`docs/projects/execution-platform/specs/openclaw-fork-source-runtime-unification.md`
is now a blocking prerequisite for this spec.

Complete that source/runtime unification work before continuing any outstanding
implementation items from this 65-item worker-agent refactor plan, except for
read-only inventory or preservation work that is directly required to execute
the unification safely.

This is a hard active-goal sequencing rule. Treat the source/runtime
unification spec as Phase 0 for this goal. Do not resume remaining 65-item
worker-agent implementation work until Phase 0 is complete, including the
split-filesystem workaround repair pass described in that spec.

Reason: the current split filesystem/source-runtime architecture is upstream of
the remaining worker-agent design. Continuing this plan before unification risks
hardening workarounds around the wrong roots, wrong skill/doc locations, wrong
runtime materialization assumptions, and wrong agent search/edit boundaries.

The unification work must also include a repair pass for split-filesystem
workarounds that become invalid once first-party OpenClaw behavior is moved
back into the fork repo as source of truth.

That Phase 0 repair pass also covers duplicated active runtime skills and
agent-doc materializations. For example, a direct runtime workspace skill copy
such as `/root/.openclaw/workspace/skills/execution-node-workflow/SKILL.md`
must not remain stale relative to the repo source copy while executable-node
sessions admit required skill context from runtime paths. Runtime copies must
be regenerated from repo source, hash-aligned, or reported as explicit
hot-patch drift with reconciliation status before the remaining worker-agent
items resume.

This ordering supersedes the former idea that `/root/.openclaw` versus
`/home/node/.openclaw` cleanup could wait until after the native worker-agent
path. That cleanup is now part of the blocking prerequisite because the split
filesystem is upstream of prompt, skill, agent-doc, session, file-graph,
resource-read, and readback correctness.

## Goal

Make executable node work behave like a real OpenClaw-native coding-agent
session:

- Kimi owns synthesis, edit decisions, repair decisions, evidence selection,
  and `node_finish`.
- Qwen context scouts own source acquisition.
- Qwen validation scouts own validation command selection, execution, and
  diagnosis.
- OpenClaw owns agents, native task, sessions, skills, durable todo,
  permissions, context epochs, compaction, managed tool output, native tool
  registry, child result delivery, and event trace.
- Execution Platform owns node lifecycle receipts/readback only.

Do not build an Execution Platform worker harness that simulates an agent
framework.

Goal-level success gate: the existing native working context must serve as the
unified node working ledger for executable-node sessions. Context windows,
`file_graph`, compact `change_set` entries, and compact `validation_state`
entries all live in one session-owned OpenClaw surface. Do not create separate
Execution Platform edit ledgers or validation ledgers.

Implementation success requires extending that existing native working-context
surface for the full node working ledger rather than creating new edit,
validation, or context-specific ledger surfaces. The proof must show context
windows, `file_graph`, compact `change_set` entries, and compact
`validation_state` entries are all persisted and read back from the same
session-owned OpenClaw surface.

## Core Ownership

- `NodeLifecycleRunner` owns node start, snapshot creation, prompt authoring as
  node-start preparation, compact launch projection, terminal `node_finish`
  acceptance/rejection, evidence acceptance, escalation projection, and
  lifecycle readback.
- OpenClaw owns agent runtime: identity, bootstrap/context epoch, native task
  delegation, tool registry, permissions, skills, todo, compaction, managed
  output, session events, child sessions, and child result delivery.
- `execution-coding` owns node-local cognition: todo, delegation decisions,
  synthesis, edit decisions, repair decisions, evidence selection, and
  `node_finish`.
- Scouts own delegated bounded work. They never own lifecycle.
- Readback projects native facts. It does not infer lifecycle from reason-code
  bags, fabricate trace refs, or become a semantic judge.

## Work Plan

### 1. Kimi Parent Role

`execution-coding` is the node owner, not a crawler.

It owns:

- node-local todo planning;
- deciding when to delegate;
- synthesizing scout output;
- selecting edits;
- stating validation intent;
- interpreting validation results;
- choosing repairs;
- selecting evidence;
- calling `node_finish`.

It does not own:

- broad repo search;
- broad prompt search;
- broad file reads;
- test command selection;
- test execution;
- log diagnosis;
- managed-output filesystem inspection. Exact `openclaw-managed-output://...`
  refs may be hydrated through native `openclaw_resource_read`.

### 2. Remove Parent Acquisition Tools

In executable-node sessions, Kimi must not see direct acquisition/execution
tools:

- no `read`;
- no `list`;
- no `glob`;
- no `grep`;
- no fuzzy resource search;
- no broad artifact discovery;
- no direct managed-output file read;
- no `exec`;
- no `process`.

Do not rely on blocked tool calls as normal behavior. These tools should be
absent from Kimi's provider-visible catalog.

### 3. Fix Current Catalog Drift

Current config still exposes parent acquisition/execution tools to
`execution-coding`. That must be corrected at the native effective tool
registry layer, not patched with more guards.

Preflight must fail if Kimi's provider-visible executable-node catalog includes
any forbidden tool.

Forbidden parent catalog entries include:

- `read`;
- `list`;
- `glob`;
- `grep`;
- `exec`;
- `process`;
- `resolve_openclaw_resource`;
- broad resource discovery;
- raw `sessions_spawn`;
- raw `sessions_yield`;
- generic `agents_list`;
- generic `subagents`.

### 4. Keep Parent Tool Surface Minimal

Kimi gets only:

- native durable todo;
- native task;
- one native mutation surface selected by OpenClaw registry;
- exact-ref `openclaw_resource_read` as an exception path;
- `node_finish`.

No raw `sessions_spawn`.
No raw `sessions_yield`.
No generic `agents_list`.
No generic subagent catalog.
No direct search/read/exec tools.

### 5. Native task Fully Replaces Raw Session Controls

Use a native OpenClaw `task` tool, OpenCode-style, backed by native sessions.

`task` owns:

- child session creation;
- foreground child execution;
- wait/yield behavior;
- child completion;
- result delivery into parent context;
- continuation id handling;
- native session events.

Kimi should call one delegation tool, not reason about raw session mechanics.

If foreground waiting reaches a checkpoint while the child is still pending,
`task` must return a native continuation id for the same child session/run
instead of reporting a terminal child failure or encouraging duplicate scout
work. Kimi's next action should update todo and call `task` again with the same
agent id plus that continuation id, unless the node is explicitly blocked or
the child result is no longer needed.

### 6. Native task Shape

For executable-node Kimi, `task` requires:

- explicit child agent id/type;
- detailed child task prompt;
- fresh child context by default;
- optional continuation id only for resuming the same child task;
- foreground execution in first lane;
- no default-to-parent;
- no ACP/thread/runtime clutter;
- no background mode in first lane;
- tool description listing only allowed scouts.

A continuation id must never create a new child session. It can only wait on
the same child task. A continuation id whose child session identity does not
match the requested child agent id must fail before waiting.

Allowed child ids:

- `execution-context-scout`;
- `execution-validation-scout`.

### 7. Hide Raw Session Mechanics From Kimi

Raw OpenClaw session mechanics can remain internal, but Kimi should not see
them.

Kimi should not decide:

- whether to spawn or yield;
- which session key shape to use;
- how to wait;
- how to resume;
- how child output is injected.

OpenClaw handles this through `task`.

### 8. Foreground Scout Calls First

First lane:

```text
Kimi calls task
  -> OpenClaw creates child session
  -> child runs
  -> child completes
  -> OpenClaw injects task result into parent context
  -> Kimi resumes with result visible
```

Background scouts come later only after foreground delivery and readback are
stable.

### 9. Require Explicit Child Agent Identity

Missing child id fails before child session creation.

Invalid child id fails before child session creation.

Silent default-to-parent is forbidden.

A context-scout request must never create:

```text
agent:execution-coding:subagent:*
```

It must create:

```text
agent:execution-context-scout:subagent:*
```

Validation must create:

```text
agent:execution-validation-scout:subagent:*
```

This is now a confirmed failure class from the latest run: a context-scout
request produced an `execution-coding` child session. That must be impossible in
the native task path.

### 10. Allowed Scouts Only

Kimi's task catalog lists only:

- `execution-context-scout`;
- `execution-validation-scout`.

Do not expose future review/closeout/general/planning agents in this lane.

### 11. Use Native Sessions, Not EP Child Orchestration

Do not build:

- EP child-agent runner;
- EP subagent lifecycle manager;
- EP child polling loop;
- EP child-result ledger;
- EP task wrapper over OpenClaw;
- EP session-yield protocol around native sessions.

Fix native OpenClaw task/session/result delivery instead.

### 12. Fresh Child Context By Default

Each scout task starts with fresh context unless Kimi passes an explicit
continuation id.

Continuation id means:

- resume this same child task;
- do not create arbitrary context carryover;
- do not share unrelated scout state.

### 13. Parallel Scout Delegation

Kimi may spawn multiple independent scout tasks in one provider turn through
native parallel task calls.

Examples:

- one scout investigates plugin registration;
- one scout investigates validation gates;
- one scout investigates UI/readback code.

Kimi then synthesizes returned child results before editing.

### 14. Do Not Duplicate Delegated Work

Once Kimi delegates a scout task, Kimi must not duplicate that scout's work.

It should:

- wait for the result; or
- work only on non-overlapping synthesis/edit work if enough context already
  exists.

### 15. Catalog-First Control

Provider-visible catalog filtering is the control plane.

Unavailable tools/subagents must be hidden, not visible-but-blocked.

Defensive runtime rejection may remain, but success must come from effective
catalog filtering.

Preflight fails if Kimi's effective catalog includes forbidden tools.

### 16. Native Permission Rules

Use OpenClaw native permissions/effective registry.

Required permissions:

- Kimi: todo, task, mutation, exact resource read, finish.
- Context scout: read/search only.
- Validation scout: read/search/exec only.
- Scouts cannot edit/write/finish.
- Scouts cannot mutate parent todo.
- Execution scouts are leaf workers for native task sessions. Their
  provider-visible child prompt must not advertise raw `sessions_spawn`,
  nested subagent orchestration, or unavailable child-delegation tools.
- Child sessions inherit relevant parent/session denies and child-agent
  permissions.

### 17. Context Scout Owns Search/Read

`execution-context-scout` owns all repo/prompt/source/test/config/doc
search/read work for executable nodes.

It gets:

- `list`;
- `glob`;
- `grep`;
- `read`;
- optional native LSP;
- optional non-mutating discovery `exec` only if later proven necessary.

It must not get:

- mutation tools;
- `node_finish`;
- parent todo mutation;
- lifecycle authority.

### 18. Context Scout Output Is Real-Source-First

Scout output must include edit-ready real source, not refs-only summaries.

Required output sections:

- direct answer;
- bounded source/doc/test/config excerpts;
- exact paths;
- line hints or windows;
- compact `file_graph` for multi-file work, including high-signal files/symbols
  and edges for imports, callers, registrations, tests, configs, proof scripts,
  runtime entrypoints, and unknown relationships;
- search terms used and why;
- misses;
- likely edit points;
- adjacent tests/config/callers;
- next likely pivots;
- risks/unknowns.

Use structured prose. Do not force a heavy JSON packet.

The `file_graph` travels in the same native task result as the bounded source
windows. It is not an Execution Platform artifact, not a separate graph table,
not a second lifecycle ledger, and not a refs-only hydration step. OpenClaw
admits the delivered native task result into two native surfaces: parent-visible
context for the next provider turn, and the session-owned persistent native
working-context ledger with compact refs/flags/hashes. The same bounded source
windows that Kimi sees in context must be represented in that native
working-context ledger so compaction, resume, and readback can prove the source
material survived beyond the immediate tool result. Readback can then observe
whether bounded source windows and `file_graph` were delivered without copying
full child output into an Execution Platform store.
OpenClaw may promote the scout-authored `file_graph` section inside that native
session working context so it survives bounded context rehydration ahead of
large source windows, but it must not compile a separate deterministic semantic
graph or create an Execution Platform-owned graph store. The promoted graph is
still the scout's prose, plus native working-context refs and hashes.

### 19. Managed Tool Output Handling

If scout/tool output is too large:

- bounded excerpts enter parent context;
- full output goes to native managed tool-output storage;
- Kimi must not read managed output directly;
- Kimi delegates another scout task to inspect managed output.

Managed output is a native OpenClaw storage/compaction concern, not an EP
artifact protocol.

Native task must never hand Kimi a mechanically truncated source window and
pretend it is valid edit context. Parent-visible child output is valid only
when it is the scout's exact bounded answer and fits the live parent-visible
tool-result budget. The native task parent-visible cap must be derived below
the same live tool-result guard used by the runner, with headroom, so the
generic session guard cannot later shorten a "successful" scout result before
Kimi sees it. If the child answer is too large, native task returns a typed
oversized-result diagnostic, marks the child result as not delivered, and
instructs Kimi to delegate a narrower follow-up scout task. Editing from a
runtime-truncated child result is forbidden.

Compaction and pre-prompt recovery must preserve the same invariant. If a
native task result has already delivered bounded source context into the parent
session and the parent has not yet had a synthesis turn, OpenClaw must not
summarize or tool-truncate that result as an overflow recovery step. The
runtime should either rehydrate the unconsumed source context through native
session/context-engine working context or stop before the provider call with a
typed `native_task_result_awaiting_parent_context` diagnostic. The long-term
shape is native session working context owned by OpenClaw, not an Execution
Platform ledger, manual readback step, or refs-only artifact protocol.

The proof gate for context scout delivery must therefore check native session
facts:

- parent-visible delivery occurred before Kimi's next synthesis/edit turn;
- persistent native working-context ledger entries were written for the parent
  session;
- the working-context entry came from native `task`;
- bounded source/context windows were present in parent-visible context;
- the same bounded source/context windows were represented in the persistent
  native working-context ledger with concrete refs/hashes/byte counts;
- `file_graph` was present when context scout mapped multi-file work;
- native working context preserved a bounded promoted `file_graph` section with
  a concrete text hash/byte count when present;
- readback projects refs/flags from native session/task events rather than
  judging graph quality or copying full child output.
- context-engine `assemble` can rehydrate current session working context as a
  bounded provider-visible system prompt addition;
- the context-engine tool-loop hook refreshes that bounded working-context
  section after native task results are admitted, before the parent model's
  next synthesis turn;
- the working-context prompt section is marker-replaced, not appended
  repeatedly, so refreshes do not bloat the system prompt.

### 20. Validation Scout Owns Validation Exec

`execution-validation-scout` owns validation command selection, execution, and
diagnosis.

It gets:

- `read`;
- `list`;
- `glob`;
- `grep`;
- optional native LSP;
- `exec`.

It must not get:

- mutation tools;
- `node_finish`;
- parent todo mutation;
- lifecycle authority.

### 21. Validation Scout Output

Validation scout returns:

- validation question/scope;
- commands considered;
- commands run;
- exit status;
- bounded output excerpts;
- likely cause if failed;
- source/test refs;
- repair context;
- residual risk.

Kimi owns repair and final `node_finish`.

### 22. Validation Scout Required For Non-Trivial Validation

If validation requires commands, proof replay, log diagnosis, test selection,
or validation-scope reasoning, Kimi delegates to validation scout.

Kimi should not regain `exec`.

### 23. Kimi Owns Validation Intent, Scout Owns Commands

Kimi should tell validation scout what must be proven.

Validation scout chooses:

- commands;
- test scope;
- output windows;
- failure diagnosis.

This prevents generic test-running while preserving scout ownership of
execution.

### 23A. Minimum Viable Edit Loop

The worker loop should be tighter than a vague "search, edit, validate"
instruction, but it must not become a rigid Execution Platform phase runner.
The loop is a native OpenClaw agent behavior driven by session todo, native
`task`, native working context, the scout-authored `file_graph`, the native
mutation tool, validation scout results, and `node_finish`.

The central question after each context scout result is:

```text
Do I have enough concrete source context to make the next useful edit now?
```

This is deliberately narrower than:

```text
Do I fully understand the whole node?
```

The parent Kimi agent does not need enough context for every edit required by
the final success gate before starting. It needs enough context to make the
next minimum viable edit safely:

- the target file/window is known;
- the relevant source excerpt is in parent-visible context;
- adjacent type/helper/caller/config/test context is sufficient for that edit;
- the intended behavior change is clear from the node prompt/todo item;
- a validation question can be stated for the edit.

If those conditions are not true, Kimi should delegate another focused
`execution-context-scout` task instead of broad parent-side crawling or
guessing.

#### Native Loop Shape

1. Kimi reads the model-authored worker prompt and creates native durable todo.
2. Kimi delegates source mapping to `execution-context-scout` when target
   mapping is weak.
3. Context scout returns bounded inline source windows into the parent-visible
   native task result, plus `file_graph` when multiple files/symbols matter.
4. OpenClaw admits the scout result into parent-visible native working context
   and writes the same bounded source windows plus `file_graph` into the
   persistent native working-context ledger for compaction, resume, and
   readback.
5. The native `task` tool appends a compact fixed continuation footer to the
   parent-visible tool result. This is not a new model-authored prompt, not a
   scheduler phase, and not an Execution Platform decision tool. It is part of
   normal OpenClaw tool-result delivery and says: parent decision required,
   update todo, then choose enough for minimal edit, need more context, or
   blocked.
6. Kimi updates native todo/plan with a concise readiness decision:
   enough context for next edit, need more context, or blocked.
7. If more context is needed, Kimi delegates another focused context scout task
   using the newly discovered identifiers, missing graph edges, tests, callers,
   or prompt terms.
8. If enough context exists for a minimum viable edit, Kimi performs that edit
   through the single native mutation surface.
9. Kimi states the validation question for the edit and delegates validation to
   `execution-validation-scout` when validation is non-trivial.
10. Validation scout selects/runs focused validation and returns bounded
    pass/fail output, source/test refs, likely cause, repair context, and
    residual risk.
11. The native `task` tool appends the validation continuation footer to the
    parent-visible validation result: parent decision required, update todo,
    then choose node/todo complete, repair from current context, need more
    context, or blocked.
12. Kimi updates native todo/plan with a sufficiency decision:
    the todo/node success gate is satisfied, more edits can continue from
    current context, more context is required, or the node is blocked.
13. If the todo item is satisfied, Kimi marks that item complete and moves to
    the next incomplete todo item.
14. If all todo items and the node success gate are satisfied, Kimi calls
    `node_finish`.
15. If validation fails or sufficiency is unknown, Kimi either repairs from the
    validation result or delegates context scout for the missing source window,
    failing symbol, test, command, or graph edge.
16. The loop repeats until all todo items are complete, `node_finish` is called,
    or a typed blocker is produced.

#### Refinements To Avoid Brittle Failure Modes

- Do not add a new "readiness decision" tool, EP decision ledger, or strict JSON
  checkpoint schema. The decision is expressed through native todo/plan updates
  and native session events.
- Do not trigger a separate decision prompt after tool return. That adds
  another prompt authority layer, another injection point, and another place
  where Kimi can get detached from the actual task context. The decision
  checkpoint belongs in the native `task` result footer and the next ordinary
  parent model turn.
- Do not require Kimi to prove it understands the whole node before editing.
  That recreates monolithic context phase behavior.
- Do not let Kimi edit from refs-only output. The minimum viable edit decision
  requires bounded real source in parent-visible context.
- Do not let `file_graph` replace source windows. The graph helps Kimi decide
  what context is missing and how files touch, but edits are made from source
  excerpts.
- Do not make validation scout an approval gate for hypothetical patches.
  Kimi owns edit decisions. Validation scout validates actual changes, selects
  proof commands, and diagnoses failures. Before mutation, validation scout may
  help identify an appropriate validation strategy only when that is the
  parent question.
- Do not gate lifecycle on exact wording of Kimi's readiness/sufficiency
  decision. Proof should use native event ordering, todo transitions, delivered
  working context refs, mutation refs, validation task refs, and `node_finish`.
- Do not let a passing validation command automatically finish the node. Kimi
  must still decide whether the validated edit satisfies the current todo item
  or the node success gate.
- Do not let a failed validation command automatically force another context
  scout. Kimi should first decide whether the validation result contains enough
  repair context to continue.
- Do not reintroduce scheduler-owned repair. All context/edit/validation/repair
  iteration remains inside the OpenClaw node agent session unless Kimi finishes
  with a typed blocker.

The desired behavior is Codex-like incremental work: acquire enough context to
start, edit, validate, reassess against the current todo/success gate, then
continue with either more edits or more context. The difference is that source
acquisition and validation execution are delegated through native OpenClaw
`task`, while Kimi remains the node owner.

#### Unified Native Working Ledger

The existing OpenClaw native working context is the unified node working ledger
for executable-node sessions. Context windows, `file_graph`, compact
`change_set` entries, and compact `validation_state` entries live in this one
session-owned OpenClaw surface. Do not create separate Execution Platform edit
or validation ledgers.

Success gate: extend this one existing native working-context surface for
context, `file_graph`, compact changes, and validation state. Do not add a
second edit ledger, a second validation ledger, or an Execution Platform-owned
parallel ledger for any of those entries.

The ledger is orientation state, not source of truth. Actual files are source
of truth for edits. Native mutation tool refs and patch summaries describe edit
history. Validation scout task results, command refs/status, and bounded output
excerpts describe validation state. `node_finish` remains the lifecycle truth.
Agents use the unified ledger to recover quickly after compaction/resume, but
must still ground edits and validation decisions in real current files/source.

### 24. Native Durable Todo

Planning must be session-native and durable.

Required behavior:

- session-owned todo state;
- native todo tool updates it;
- native todo read/get tool exposes current item status for resume,
  compaction, and uncertainty recovery;
- updates emit native events;
- readback projects current/history;
- todo survives compaction/resume or is recoverable from session state;
- first substantive Kimi turn creates todo;
- todo updates after scout, edit, validation, repair, and finish.

Minimal todo fields:

- content;
- status;
- priority;
- position.

No EP todo ledger.

### 25. Todo Should Not Become Ceremony

Do not gate every step on exact todo phrasing.

Gate only:

- todo exists;
- todo updates around major transitions;
- todo is native session state;
- todo is visible in readback.

### 26. OpenCode Todo Shape

Adopt the OpenCode shape:

- `SessionTodo.update/get`;
- `todo.updated` event;
- native todo tool writes todo;
- `update_plan` is the native update/write surface;
- `read_todo` is the native read/get surface for the current session todo;
- UI/readback projects it.

Do not keep transient `update_plan` as sufficient if it is not durable session
state.

### 27. Scouts Cannot Mutate Parent Todo

Parent Kimi owns parent todo.

Scouts may have child-local notes if native sessions support it, but they must
not mutate parent todo.

### 28. Context Epoch Bootstrap

Agent startup is a native OpenClaw context-epoch problem, not prompt
concatenation.

Before first Kimi provider turn, baseline context contains:

- effective agent identity;
- active required skill;
- repo cwd/search root;
- provider-visible tool catalog;
- allowed task scouts;
- model/provider/reasoning;
- node prompt as native session input.

Missing baseline blocks start.

### 29. Replace EP Skill Prompt Glue With Native Skill Baseline

The earlier EP-owned `buildActiveRequiredSkillsPrompt` path is not the final
architecture and must not return as the executable-node required-skill
activation mechanism. The executable-node path should use the OpenClaw native
session skill snapshot/context-epoch surface for required active skills, not a
second Execution Platform prompt-concatenation system.

Target:

- required skills are native context-epoch sources;
- skill source refs/hashes are recorded in the native launch/context receipt;
- provider-first-turn proof shows skill context was admitted;
- EP does not inline skill text as its own separate bootstrap mechanism;
- current proof and readback derive required-skill admission from the native
  session `skillsSnapshot`/provider prompt report, not from local file
  existence, config intent, or an Execution Platform-only prompt artifact.

Short-term compatibility may exist only outside the executable-node native
worker path. The final executable-node path must not depend on EP-owned skill
prompt concatenation.

### 30. Parent And Child Sessions Need Separate Baselines

Do not reuse the parent baseline for scouts.

Each child session must have its own context epoch/baseline containing:

- child agent identity;
- child canonical docs;
- child skill;
- child permissions;
- child model/provider;
- child cwd/search root;
- child tool catalog;
- child task prompt.

### 31. Required Skills Active Before First Turn

Required skills are active baseline context, not advisory catalog entries.

Required:

- `execution-node-workflow` for Kimi;
- `execution-context-scout` for context scout;
- `execution-validation-scout` for validation scout.

Kimi should not need to call a skill to activate required workflow. Optional
skills can use a native skill surface later.

### 32. Prove Canonical Agent Docs Reach Provider

File existence is insufficient.

Proof must show provider-visible first-turn context includes the effective
agent's canonical docs or native projections of them:

- `IDENTITY.md`;
- `AGENTS.md`;
- `BOOTSTRAP.md`;
- `TOOLS.md` where relevant;
- required skill context.

This must be proven separately for:

- `execution-coding`;
- `execution-context-scout`;
- `execution-validation-scout`.

Proof should be compact and hash/ref based where possible, but it must
establish actual provider admission, not merely local file presence.

### 33. Prove Skill Context Reaches Provider

Proof must show:

- active skill context is in first provider turn;
- it belongs to the correct effective agent;
- it is not truncated beyond usefulness;
- context scout gets context-scout skill;
- validation scout gets validation-scout skill.

### 34. Bootstrap Truncation Must Be Diagnosed Explicitly

If bootstrap/context epoch is truncated, readback must report:

- what source was truncated;
- whether required identity docs survived;
- whether required skill context survived;
- whether tool catalog and allowed task scouts survived;
- whether node prompt remained intact.

A run must not silently proceed when required bootstrap material is missing or
truncated past usefulness.

### 35. Prompt/Skill Separation

Prompt says what to do. Skill says how to operate.

Prompt includes:

- node objective;
- assigned requirements;
- relevant original prompt excerpts;
- explicit file refs;
- success gates;
- non-goals;
- constraints;
- validation expectations;
- terminal `node_finish` contract.

Prompt must not duplicate the full workflow skill.

### 36. Prompt Is Native Session Input

The worker prompt and native session input should be the same thing.

Execution Platform may store:

- prompt hash;
- prompt ref;
- submitted prompt readback pointer.

Until OpenClaw exposes native session input as a bounded exact replay/readback
artifact, the worker-prompt artifact may serve as the submitted prompt
readback pointer. That artifact must be the same prompt submitted as the native
session input, proven by hash in the start receipt. It must not be a second
independently authored prompt, a raw transcript copy, a generic context dump,
or a divergent Execution Platform task brief.

Once native OpenClaw session input itself provides exact bounded replay,
Execution Platform should reduce this surface to refs/hashes/pointers and must
not keep a duplicate full prompt artifact.

### 37. openclaw_resource_read Is Exception Path

Happy-path Kimi should not need to hydrate opaque refs.

Worker prompt should inline enough task material to start.

`openclaw_resource_read` remains for explicit expansion refs only:

- node snapshot ref;
- source excerpt ref;
- other exact runtime refs intentionally handed to Kimi.

It is not a normal first move and not broad discovery.

### 38. Prompt Authoring Instructions

Prompt writer should instruct Kimi to:

- follow the already-active workflow skill;
- create durable todo;
- use native task for source mapping when target is weak;
- synthesize returned source windows;
- edit from scout-provided context;
- state validation intent;
- use native task for validation;
- repair from validation output;
- finish with `node_finish`.

It should not tell Kimi to "search the repo" broadly.

It should not tell Kimi to activate a required skill at runtime. Required skill
activation is preflight/bootstrap's job. The prompt may say "follow the active
`execution-node-workflow` skill."

### 39. Prompt Authoring Quality Control

Prompt authoring remains the biggest model-behavior risk.

Do not solve it with schema-heavy gates. Solve it with:

- correct input ordering;
- direct source material;
- assigned requirements;
- original prompt excerpts;
- explicit refs;
- clear node scope;
- clear success gates;
- plain prose output contract.

Skeletal checks only:

- non-empty;
- prose, not JSON;
- includes objective;
- includes assigned requirements;
- includes success/validation/finish expectations;
- does not duplicate full skill text;
- exact submitted prompt equals native session input.

### 40. Rich Scout Task Material

Kimi's child task prompt must include enough material for Qwen to work without
chasing opaque artifacts:

- node assignment;
- assigned requirement text;
- relevant original prompt excerpts;
- explicit file refs;
- constraints;
- non-goals;
- expected output;
- what useful context means;
- whether task is research or validation.

For context-scout tasks, useful context means both bounded real source windows
that Kimi can edit from directly and a compact file graph when multiple
files/symbols matter. The graph helps Kimi and the scout keep an enduring map
of relevant code relationships while the node iterates through search, edit,
validation, and repair.

The file graph must travel in the same native task result as the source
windows. It is not an Execution Platform ledger, a separate artifact the parent
must manually hydrate, or a refs-only substitute for real source.

Scout prompts must be self-contained because child context is fresh.

### 41. Exact-Ref openclaw_resource_read Only

`openclaw_resource_read` is exact-ref only:

- node snapshot ref;
- prompt/session input ref;
- source excerpt ref;
- explicitly handed runtime refs.

No fuzzy lookup.
No broad artifact discovery.
No managed-output browsing.

### 42. Mutation Tool Surface

Kimi should not receive multiple overlapping mutation tools by default.

OpenClaw's native registry should expose one appropriate mutation surface for
the model/provider, such as:

- `edit`; or
- `apply_patch`; or
- `write` only when new-file creation is justified.

Do not hardcode `edit` + `write` + `apply_patch`.

### 43. New-File Write Rule

New-file writes require scout-provided context establishing:

- intended path;
- local conventions;
- imports/exports;
- test expectations;
- adjacent patterns.

Without that, Kimi should delegate more context before writing.

### 44. Edit Conflict Re-Grounding Through Scout

If mutation fails because source is stale, exact match is missing, or file
changed:

- Kimi does not read directly;
- Kimi delegates context scout for updated window;
- scout returns fresh excerpt;
- Kimi retries mutation.

### 45. Child Result Delivery Proof

Proof must show:

- Kimi calls native task with `execution-context-scout`;
- child identity is correct;
- child returns bounded real source;
- parent receives result as native model-visible context/message/event;
- parent next provider turn contains the child result text or bounded native
  projection;
- parent acts after result delivery.

Detached event/ref only is insufficient.

### 46. Child Start Failure Must Be Typed And Actionable

If child session creation fails, readback must distinguish:

- invalid child id;
- missing child profile;
- wrong child identity selected;
- child docs missing;
- child skill missing;
- child tool catalog invalid;
- child workspace/cwd unavailable;
- session lock failure;
- filesystem permission failure;
- provider/model failure.

The latest run hit a child filesystem/session failure. That failure class must
become a typed native task/session diagnostic, not a generic worker block.
Node-agent session trace should carry compact `childStartFailures` entries from
native task events, including requested child agent id, child session key when
available, task ref, status, `childStartFailureKind`, and bounded error text.
Those entries are native session/task facts projected by readback; they are not
an Execution Platform child-result ledger.

`child tool catalog invalid` must be based on the child provider-visible
catalog admitted in the child session prompt report, not on intended config
alone. For this lane:

- `execution-context-scout` must see `read`, `list`, `glob`, and `grep`;
- `execution-context-scout` must not see mutation, validation exec,
  node-finish, parent todo, raw session, generic subagent, or native `task`
  tools;
- `execution-validation-scout` must see `read`, `list`, `glob`, `grep`, and
  `exec`;
- `execution-validation-scout` must not see mutation, node-finish, parent
  todo, raw session, generic subagent, or native `task` tools.

Missing required child tools or forbidden provider-visible child tools must
block child result delivery with `child_tool_catalog_invalid`.

### 47. Scout Result Trust Policy

Kimi may trust context scout source windows for edit planning.

Kimi may trust validation scout command/output as repair evidence.

Lifecycle acceptance still requires Kimi-owned `node_finish`.

### 48. Readback From Native Facts

Readback projects:

- effective tool catalog;
- active skills;
- canonical agent docs admitted;
- context epoch ref;
- todo state/history;
- exact submitted prompt/session input;
- parent tool calls;
- native task calls;
- child session ids;
- child result delivery;
- typed child start failures;
- bounded child excerpts;
- native working-context refs;
- bounded source-window delivery flags;
- `file_graph` delivery flags;
- managed output refs;
- compaction/overflow events;
- `node_finish` payload;
- terminal reason.

Readback does not judge whether synthesis was good.

### 49. No Semantic "Parent Synthesis Evidence" Gate

Do not require model-authored proof that Kimi synthesized child output.

Use event ordering instead:

- child result delivered before parent edit/finish;
- parent todo updated after child result;
- parent mutation touches paths from scout output;
- parent validation/finish occurs after delivered evidence.

Qualitative synthesis review can be diagnostic later, not lifecycle gate.

### 50. Reduce Inferential Trace Refs

If native event/ref exists, project it.

If not, report missing optics explicitly.

Do not fabricate refs from observed tool names.

Executable-node readback must not treat observed tool names or boolean-only
trace flags as proof of required optics. Required optics such as plan update,
context scout spawn, child result delivery, working context, parent synthesis,
edit, validation, and finish must come from concrete native refs, durable
session state, or NodeLifecycleRunner-owned finish state. Diagnostic booleans
may still report failures such as oversized child results or context
preservation blocks, but they must not satisfy required success optics.

### 51. Compact Node Start Receipt

Receipt proves only:

- session id;
- node id;
- native prompt/session-input ref/hash;
- context epoch ref/hash;
- canonical agent doc source refs/hashes admitted;
- required skill refs/hashes admitted;
- Kimi model/provider/reasoning;
- highest supported Kimi reasoning;
- effective Kimi tool names;
- allowed child agent names;
- blockers.

Do not duplicate:

- full transcripts;
- full catalogs;
- full prompts;
- child logs;
- full tool outputs.

### 52. Prefer Native Launch Receipt If Available

If OpenClaw can emit a native session launch/admission receipt, EP should
reference it and add only:

- node id;
- lifecycle blocker status;
- `node_finish` expectation.

Do not create a second durable truth object.

### 53. Permissions Derived Like OpenCode

Child permissions inherit relevant parent/session denies and apply child-agent
permissions.

Scouts must not regain edit/finish/todo via global config.

Permission derivation is native and centralized.

### 54. Canonical Location / Root

Use one native OpenClaw Location.

Node session should have:

- repo root as cwd/search root;
- OpenClaw docs/artifacts accessible through native external-directory/resource
  permissions;
- no `/root` as default search universe;
- no EP path-alias workaround;
- no split `/root` vs `/home/node` identity leak.

This addresses the repeated filesystem/root drift failure class.

### 55. Fix Current Filesystem Permission Drift

The current symlink reduces one class of path drift, but the latest child run
still failed on a permissioned
`/home/node/.openclaw/host-operator/openclaw-live/...` path.

Native location resolution must ensure:

- parent session cwd is the repo root;
- child session cwd is the same repo root unless explicitly overridden;
- OpenClaw home is canonical;
- session stores are writable by the runtime user;
- child sessions do not resolve stale host-operator paths;
- HEARTBEAT/bootstrap files outside the intended execution lane cannot block
  child startup unless they are required context sources.

### 56. LSP Is Opportunistic And Scout-Only

If OpenClaw has native LSP/code intelligence, expose it to scouts.

Useful operations:

- workspace symbols;
- document symbols;
- definitions;
- references;
- implementations;
- call hierarchy;
- diagnostics if available.

Do not build EP LSP.
Do not expose LSP to Kimi by default.
LSP absence is diagnostic, not fatal.

### 57. Align Agent Docs With The Architecture

The canonical docs for `execution-coding`, `execution-context-scout`, and
`execution-validation-scout` must not contradict the tool catalog.

Specifically, `execution-coding` docs/skill must stop instructing Kimi to:

- broad search;
- direct read before scout result;
- use raw `sessions_spawn`;
- use raw `sessions_yield`;
- rely on advisory skill activation;
- use `exec` for validation.

They should instruct Kimi to:

- use native durable todo;
- use native task for context scout when mapping is weak;
- synthesize scout result;
- mutate with the single native mutation tool;
- delegate validation to validation scout;
- finish with `node_finish`.

Scout docs should remain real-source-first and bounded.

### 58. Future Review/Closeout Modes

Keep architecture compatible with future:

- `execution-review`;
- `execution-closeout`.

Do not put review/closeout responsibilities into implementation Kimi.

### 59. Native Agent Step Budgets

Use native progress-aware step budgets, not wall-clock hacks and not fixed
kill switches.

Suggested shape:

- Kimi: high enough for a real edit/repair loop;
- context scout: bounded iterative search, with bounded output;
- validation scout: bounded command/diagnosis loop, with bounded output.

The budget is a native session diagnostic/checkpoint surface. It should detect
when a node is taking materially more work than expected for its complexity,
but it must not terminate a session merely because a fixed number of steps,
tool calls, or compactions was crossed while the session is still making
observable progress.

The contract should use checkpoint/expectation terminology, not `max*`
terminology, for these node-agent counters. A `maxToolCalls`,
`maxCompactions`, `maxIterations`, or equivalent field invites future code to
treat the value as a kill cap. The intended shape is an expected-progress
checkpoint: crossing it emits diagnostics and preserves the current todo,
working context, child/session state, and terminal obligation.

For scheduler wiring, new code should use `progressCheckpointIterations`.
Historical `maxIterations` compatibility, if retained temporarily, is only an
alias for that checkpoint and must not terminate a progressing loop.

Progress signals include:

- native todo updates;
- native task delegation;
- child result delivery;
- working-context ledger updates;
- `file_graph` updates;
- compact change-set events;
- validation-state events;
- repair attempts;
- `node_finish`.

Over-budget progress emits typed diagnostics plus current todo/session state.
Examples:

- completed node work that crosses the expected budget remains completed and
  records an over-budget nonterminal diagnostic;
- a parent yielding for an in-flight child after crossing the expected budget
  remains `waiting_on_subagent` and records that progress continues;
- a native `task` foreground wait checkpoint for an in-flight child returns a
  continuation id and does not count as a terminal child failure while the child
  can still complete;
- a session with no progress signal after budget crossing may finish blocked
  with a typed no-progress/stall diagnostic.

Do not use an arbitrary elapsed-time cap or fixed loop-iteration cap as the
success/failure boundary. Time and steps are evidence for diagnostics, not
proof that the node should be killed. Fixed caps may remain only as stale
process/lease safety boundaries or as explicit no-progress guards. They must
not stop a live node solely while it is still producing observable progress.

### 60. Focused Worker Proof

Focused proof verifies:

- prompt submitted exactly as native session input;
- Kimi highest-supported reasoning is not only present in config/start receipt
  but forwarded into the provider attempt as `thinkLevel: xhigh` and
  `reasoningLevel: stream`;
- OpenRouter Kimi payload shaping emits highest reasoning effort for the worker
  request rather than omitting reasoning at the stream layer;
- canonical Kimi docs reach provider;
- active Kimi skill context reaches provider;
- Kimi creates durable todo;
- Kimi's provider-visible catalog excludes acquisition/exec/session tools;
- Kimi uses native task;
- child id explicit;
- child session identity is correct;
- child session baseline is child-specific;
- child canonical docs reach provider;
- child skill reaches provider;
- context scout admission proves `execution-context-scout` canonical docs and
  `execution-context-scout` skill reached the context scout provider turn;
- validation scout admission proves `execution-validation-scout` canonical docs
  and `execution-validation-scout` skill reached the validation scout provider
  turn;
- validation scout admission blocks if it receives context-scout docs/skill, and
  context scout admission blocks if it receives validation-scout docs/skill;
- child tool catalog is correct;
- child result reaches parent model-visible context;
- scout returns real source;
- scout result includes bounded source windows in the parent-visible native
  task result;
- the same bounded source windows are represented in the persistent native
  working-context ledger with concrete refs/hashes/byte counts;
- scout result includes `file_graph` when multiple files/symbols matter;
- `file_graph` is represented in the persistent native working-context ledger
  when present;
- the existing native working context acts as the unified node working ledger:
  context windows, `file_graph`, compact change sets, and validation state all
  live in one session-owned OpenClaw surface;
- this is one unified OpenClaw-native working-context surface, not separate
  edit or validation ledgers: context windows, `file_graph`, compact
  `change_set` entries, and compact `validation_state` entries persist together
  as session-owned node working state;
- no separate Execution Platform edit ledger or validation ledger is created;
- mutation tool results persist compact `change_set` entries into the same
  native working context, with mutation refs/status and changed-file summaries
  rather than full patch text or file contents;
- validation task results persist compact `validation_state` entries into the
  same native working context, with validation refs/status and bounded result
  summaries rather than raw command logs;
- context scout task result includes compact parent-visible next-action
  guidance as part of native tool-result delivery, not as a separate prompt,
  scheduler phase, or hard post-task todo gate;
- context scout result is delivered before the next parent edit/read/grep/task,
  todo update, validation, or block action;
- Kimi records native todo/plan readiness decisions when they change the
  visible plan, close/start a todo, or explain a blocker;
- the next parent action after context scout is one of edit, bounded
  read/grep for one exact local lookup, focused context task, validation, todo
  update, or typed `node_finish` blocker;
- when Kimi lacks enough context for the next useful edit, it delegates another
  focused context scout task rather than parent-side broad crawling;
- Kimi acts after result delivery;
- Kimi mutates files;
- Kimi can begin with a minimum viable edit before all node context is known,
  provided the edit has concrete source windows, relevant adjacent context, and
  a validation question;
- validation scout runs non-trivial validation;
- validation result reaches parent;
- validation scout task result includes compact parent-visible next-action
  guidance as part of native tool-result delivery, not as a separate prompt,
  scheduler phase, or hard post-task todo gate;
- validation result is delivered before parent repair/finish/follow-up context
  delegation;
- Kimi records a native todo/plan sufficiency decision after validation:
  current todo/node success gate satisfied, continue editing from current
  context, more context required, or typed blocker;
- the next parent action after validation is native todo decision plus one of
  repair, follow-up context task, validation retry, `node_finish`, or typed
  blocker;
- a passing validation command does not automatically finish the node unless
  Kimi also determines the current todo/node success gate is satisfied;
- if the validated edit satisfies only one todo item, Kimi marks that item
  complete and continues through remaining todo items;
- if validation fails or sufficiency is unknown, Kimi either repairs from
  validation context or delegates context scout for the missing source window,
  symbol, test, command, or file-graph edge;
- repair loop works if needed;
- stale edit re-grounds through scout if encountered;
- `node_finish` is called and accepted/rejected by `NodeLifecycleRunner`.
- the proof uses native event ordering and refs rather than a semantic
  "Kimi synthesized this correctly" artifact.

### 61. Focused Proof Must Use A Real Edit Fixture

Do not prove the worker loop only on a lane where everything already passes.

The proof fixture must require:

- context scout delegation;
- real source windows;
- at least one edit;
- focused validation;
- parent finish.

Otherwise we only prove planning and blocking behavior, not executable-node
work.

### 62. Minimal Durable Data Model

Keep only:

- compact `NodeAgentStartReceipt` or native launch receipt ref plus EP node
  lifecycle projection;
- native prompt/session input ref/hash;
- native context epoch/baseline ref;
- native todo state/events;
- native task/child result event refs;
- managed output refs when applicable;
- readback projection.

Do not add:

- EP todo ledger;
- EP task wrapper;
- EP subagent orchestration ledger;
- EP child-result ledger;
- heavy scout packet schema;
- duplicate transcript store;
- duplicated tool catalog snapshots;
- duplicate full prompt artifact after native session input itself provides
  exact bounded replay/readback;
- semantic synthesis gate schema.

### 63. Retire Compatibility Paths After Native Task Lands

Once native task is active for executable-node sessions, remove or quarantine:

- raw `sessions_spawn` from Kimi provider catalog;
- raw `sessions_yield` from Kimi provider catalog;
- parent crawl guard as normal control path;
- EP skill prompt injection as required-skill activation;
- trace refs fabricated from observed tool names;
- tests that accept `agent:execution-coding:subagent:*` for a context scout;
- tests that accept visible-but-blocked parent acquisition tools;
- tests that accept refs-only scout outputs;
- tests that prove worker success without edit when the fixture claims
  implementation.

Defensive guards may remain internally, but tests should prove catalog-first
native behavior.

### 64. Bootstrap Verification Is A First-Class Gate

Before another serious worker proof, prove:

- `execution-coding` provider first turn includes or references admitted
  `IDENTITY.md`, `AGENTS.md`, `BOOTSTRAP.md`, and required skill context;
- context scout provider first turn includes or references its own identity
  docs and skill;
- validation scout provider first turn includes or references its own identity
  docs and skill;
- no required bootstrap source is truncated past usefulness;
- tool catalogs in the provider call match the effective native registry;
- provider-visible structured tool entries from the admitted provider prompt
  report are the catalog truth when present;
- separate effective-tool metadata must never override provider-visible tool
  entries;
- mismatch between supplied effective-tool metadata and provider-visible tool
  entries is a typed start blocker;
- missing required parent tools in the provider-visible catalog block start;
- forbidden parent acquisition/exec/raw-session tools visible in the
  provider-visible catalog block start;
- missing required child scout tools in the child provider-visible catalog
  block child result delivery;
- forbidden child scout tools in the child provider-visible catalog block child
  result delivery;
- child session identity matches requested child id.

Do not treat file existence, config fields, or local snapshots as sufficient
proof.

### 65. Final Architecture Rule

Final shape:

```text
Execution Platform:
  NodeLifecycleRunner
  compact lifecycle launch projection
  node_finish acceptance
  readback projection

OpenClaw:
  native prompt/session input
  agents
  native task
  sessions
  skills
  tools
  permissions
  durable todo
  context epoch
  compaction
  managed output
  native events
```

The central simplification is:

Kimi operates one native task delegation surface, one durable todo surface, one
native mutation surface, exact resource reads only as an exception path, and
`node_finish`.

Everything else belongs to OpenClaw runtime or scout agents.

## Superseded Deferred Cleanup Note

This spec previously treated the apparent `/root/.openclaw` versus
`/home/node/.openclaw` split as a deferred cleanup after the native
worker-agent path. That is no longer the active plan.

The source/runtime unification spec at
`docs/projects/execution-platform/specs/openclaw-fork-source-runtime-unification.md`
must complete first. Its split-filesystem workaround repair item must also
complete before the remaining worker-agent items resume.

Reason: the split-root issue is not cosmetic. It affects which files are source
truth, which runtime files are materialized state, which skills and agent docs
load into sessions, which roots scouts search, which roots the parent can edit,
how task/session inheritance works, how `openclaw_resource_read` resolves
artifacts, how file graph state is generated, and how readback reports runtime
truth. Continuing the worker-agent refactor before this prerequisite is done
would preserve or deepen the wrong architecture.
