---
name: execution-node-workflow
description: Use when running an Execution Platform Runtime Work Graph node through an OpenClaw native agent session. Guides assignment prompt intake, native update_plan use, exact ref expansion when needed, native task delegation to scouts, edit/validation/repair, evidence discipline, and mandatory node_finish terminalization.
---

# Execution Node Workflow

Use this skill for every Execution Platform node session.

## Assignment And Snapshot Intake

Read the comprehensive model-authored node assignment prompt first. It is the
primary work order and scope boundary for the session. The node execution
snapshot ref is provenance and expansion material.

Create a visible native `update_plan` before broad work. The plan should cover
the immediate context/search/edit/validation/finish path and should be updated
after scout output, edits, validation, repair, and before `node_finish`.

Do not treat the snapshot or source refs as a mandatory first read when the
assignment prompt already contains enough node-specific task material. The
happy path is: understand the model-authored prompt, plan, delegate scout
context when repo mapping is weak, edit from real source windows, validate,
repair, and finish.

Use `openclaw_resource_read` only for exact Execution Platform refs
intentionally handed to this node when a specific missing fact is needed. That
can include node snapshots, requirements, bounded source-prompt windows, and
evidence artifacts. It is an expansion path, not fuzzy discovery and not a
replacement for the assignment prompt.

When exact expansion is needed, read only the missing facts that matter for the
next decision, such as:

- node id, node kind, attempt id, and node run id.
- requirement refs.
- source prompt refs.
- task refs.
- evidence contract ref.
- validation policy ref.
- validation command refs.

If the assignment prompt is missing or incoherent, or the snapshot is
needed but unavailable, finish with a typed blocker. Do not continue from
memory or guesswork.

## Source Prompt Context

The model-authored assignment prompt should already include the node objective,
assigned requirement text, relevant original-prompt excerpts, explicit refs,
constraints, non-goals, success gates, validation expectations, and terminal
`node_finish` expectations.

Treat requirements and source refs as expansion handles. If the assignment
prompt is too thin to produce concrete search signal, hydrate exact
`source-prompt://.../body/start-end` refs through `openclaw_resource_read`;
these are bounded windows from the operator prompt, not generic summaries.
Extract concrete search signal:

- product, workflow, plugin, package, class, function, and tool names.
- exact phrases from requirements.
- long-tail terms and variants.
- likely files, directories, tests, scripts, and docs.
- negative constraints and non-goals.
- validation expectations.

Avoid generic terms such as "implementation", "validation", "workflow", or
"scheduler" unless combined with specific adjacent terms from source material.

If target files are not already known from the assignment prompt and any
needed exact prompt/source expansion, do not begin with parent-owned repo
crawling. Use native `task` with `agentId:"execution-context-scout"` as the
first repo-mapping move and give it the requirement text, relevant prompt
excerpts, known refs, likely search terms, and source prompt body ref or
manifest when useful. Prompt refs, likely repo targets, and validation hints
may live in a separate source-prompt section from the assigned requirement
span, so the scout should inspect adjacent or broader prompt windows through
the body manifest when needed. Use the scout again whenever editing,
validation, or a failed patch reveals new search terms. The scout must return
actual inline prompt/code/test windows into this parent session. The parent
execution agent then decides whether those windows are enough to plan edits or
whether to ask the scout for another focused pass.

## Scout-Owned Repo Mapping

Repo search/read is scout-owned in executable-node mode.

The parent should derive task-specific search signal from real source prompt
text and hydrated requirement/source windows, then delegate search/read to
`execution-context-scout` through native `task`. Do not use parent-owned
repository acquisition, shell execution, raw session-control,
subagent-control, or agent-listing surfaces in executable-node mode.

The scout should start with the most specific terms. Then the parent/scout loop
iterates:

1. Search terms from prompt/source material.
2. Scout reads high-signal hits and returns bounded inline windows.
3. Extract additional identifiers from real files.
4. Parent synthesizes those identifiers and either edits or asks the scout for
   another focused pass.
5. Scout inspects callers, tests, imports, and adjacent files when requested.
6. Repeat until the parent has enough context to edit or a precise blocker.

## File, Test, And Caller Inspection

Before editing, ensure the parent session has real source context for:

- the target file or module.
- nearby helpers/types/contracts.
- relevant tests.
- callers and import sites when behavior could fan out.
- validation commands or proof scripts if provided.

Do not satisfy this by parent-side repo crawling. Use direct prompt text,
exact Execution Platform refs, or scout-returned bounded source windows. Use
native `task` for focused scout, test-mapping, and caller-mapping tasks when
that improves quality, and use `execution-context-scout` as the default fast
search/read loop when repo mapping is weak, target files are unknown,
callers/tests need exploration, or new keywords emerge during
editing/validation. Keep subagent outputs inside the parent session. Do not
finish until you have read and synthesized subagent output.

When delegating to `execution-context-scout`, ask it to return actual bounded
`inline_context_windows` containing the relevant code/test/config/doc excerpts,
not just file refs. When more than one file or symbol matters, also ask for a
compact `file_graph` that maps the relevant files/symbols and their imports,
callers, registrations, tests, configs, scripts, and runtime entrypoints. The
parent execution agent must use those excerpts and the graph directly. OpenClaw
native task delivery must put those bounded windows in parent-visible context
and persist the same bounded windows plus `file_graph` into the native
working-context ledger for compaction/resume/readback. Ask the scout for more
context when adjacent windows or graph edges are missing.

### Context Scout Task Template

Use native `task` with `agentId:"execution-context-scout"` when a focused
context pass will improve the node. Prefer this fast Qwen scout for
search/read/test/caller mapping so the Kimi parent can spend its reasoning on
edit strategy and synthesis. Include enough parent context for the scout to
start with signal, but keep lifecycle ownership in this parent session.

Task content should include:

- node kind and objective.
- exact requirement text or hydrated requirement excerpt.
- source prompt excerpts that created the requirement.
- source prompt body ref or body manifest entries, so the scout can search
  prompt refs/targets that may live outside the narrow requirement span.
- current known files, hits, misses, and search terms already tried.
- the specific context question to answer.
- whether the parent needs likely edit points, tests, callers, or config.

Require this in the child result:

- actual bounded `inline_context_windows`, not refs only.
- compact `file_graph` when multiple files/symbols matter.
- search terms used and why.
- misses and next searches.
- likely edit points.
- risks or unknowns.

After the child returns, synthesize the inline windows and file graph into your
plan. Do not patch or finish from a child result you have not read.

Raw session-control mechanics are internal OpenClaw runtime behavior, not
parent-facing executable-node tools. Use `task`; OpenClaw owns child session
creation, wait/yield behavior, and child-result delivery into the parent
session. After the result is visible, inspect the child output, update
`update_plan`, and continue the dynamic context/search/edit/validate loop.

## Minimum Viable Edit Checkpoint

After each context scout result, decide whether you have enough concrete source
context to make the next useful edit now. You do not need enough context for
the whole node before starting; you need enough for the next safe edit.

You have enough to start editing when:

- the target file/window is known.
- the relevant source excerpt is visible in this parent context.
- adjacent helper/type/caller/config/test context is sufficient for this edit.
- the intended behavior change is clear from the assignment or current todo.
- you can state the validation question for the edit.

Record the decision in native `update_plan`: enough for next edit, more
context needed, or blocked. If more context is needed, delegate another focused
`execution-context-scout` task using the newly discovered symbol, missing graph
edge, test, caller, command, or prompt term. Do not broad-crawl from the parent
and do not edit from refs-only output.

The native `task` result may end with a fixed parent-decision footer. Treat
that footer as part of normal OpenClaw tool-result delivery, not as a separate
prompt or scheduler phase. On the next parent turn, update todo with the
decision and then edit, delegate another focused context scout, or finish/block
with `node_finish`.

The OpenClaw native working context is the unified node working ledger for this
session. It may contain context scout windows, `file_graph`, compact
`change_set` entries, and compact `validation_state` entries. Use it to orient
quickly after compaction/resume, but keep source of truth boundaries clear:
actual files are truth for edits, validation scout command results are truth
for validation, and `node_finish` is truth for lifecycle completion.

## Edit Planning

Plan from concrete source context, not summaries.

The plan should identify:

- files to edit.
- behavior to change.
- tests/proofs to run.
- expected evidence refs.
- risks or blockers.

If more context is needed while planning, delegate another focused context
scout task.

## Patching

Patch only within writable authority.

Keep changes scoped to the node objective. Do not widen architecture or refactor
unrelated code unless the node explicitly requires it.

If a patch fails, delegate a focused context scout task for the current
file/window and retry from real file contents returned by the scout.

After each mutation attempt, treat the native mutation tool result as the source
for a compact `change_set` entry in the OpenClaw native working context. The
parent does not maintain a separate edit ledger. The useful durable facts are:

- mutation tool result ref.
- changed file paths.
- added/modified/deleted summary.
- related todo item when known.
- source context refs or scout windows used.
- whether the mutation succeeded or failed.
- stale-edit or re-grounding flag when mutation failed.
- timestamp/order from native session events.

Do not persist full patch text, full file contents, or a second semantic
explanation unless the native mutation tool already stores it. Actual current
files remain the source of truth for future edits.

## Validation

State the validation intent, then use native `task` with
`agentId:"execution-validation-scout"` for command selection, command
execution, and failure-output diagnosis whenever validation requires repo/test
inspection or commands.

Validation can include:

- targeted unit tests.
- affected integration tests.
- proof harness commands.
- lint/type checks for touched areas.
- command output refs.

The parent execution agent should not use parent-owned execution or repository
acquisition surfaces to run or inspect validation in executable-node mode. The
validation scout owns those tools. The parent owns the validation question,
repair decision, evidence selection, and terminal `node_finish`.

After each validation scout result, treat native task delivery as the source for
a compact `validation_state` entry in the OpenClaw native working context. The
parent does not maintain a separate validation ledger. The useful durable facts
are:

- validation scout task ref.
- validation question or scope.
- commands considered and commands run.
- exit status.
- bounded output excerpt refs or hashes.
- likely failure cause when failed.
- repair context refs or bounded windows.
- residual risk.
- timestamp/order from native session events.

Do not persist raw command logs, broad stdout dumps, or model-only quality
judgments as truth. The validation scout command result is truth for validation
evidence; current source files are truth for repair.

Do not call validation done from memory. Use command/tool evidence.

## Validation Failure Repair

Treat validation failure as part of the same node execution loop:

1. Delegate failure-output inspection and command/source diagnosis to
   `execution-validation-scout`.
2. If additional source context is needed, delegate a focused
   `execution-context-scout` pass for the failing symbol, test, file, or
   command window.
3. Synthesize scout-returned bounded excerpts in this parent session.
4. Patch again if appropriate.
5. Delegate validation again.
6. Repeat until completed, blocked, or escalation is needed.

Do not ask the scheduler to repair node-local validation failures.

When delegating to `execution-validation-scout`, ask it to include bounded failure
excerpts, exact commands considered/run, and source/test refs supporting its
diagnosis. The parent execution agent owns the repair decision and must
synthesize the scout result before patching or finishing.

### Validation Scout Task Template

Use native `task` with `agentId:"execution-validation-scout"` when validation
selection, validation cost, failure diagnosis, or proof scope is non-trivial.

Task content should include:

- node kind and objective.
- changed files or likely changed files.
- relevant requirement/evidence refs or hydrated text.
- validation policy refs or command hints if present.
- recent command output or failure excerpt if this is a repair turn.
- the exact validation question.

Require this in the child result:

- commands considered and why.
- commands run, exit status, and bounded output excerpt.
- what passed or failed.
- source/test/config/proof refs supporting the diagnosis.
- next repair context.
- residual risk.

After the child returns, decide whether to repair, validate again, escalate, or
finish. The child does not own that decision.

## Sufficiency Checkpoint

After validation, decide whether the validated edit satisfies the current todo
item or the whole node success gate.

- If the current todo item is satisfied but the node is not done, mark that
  todo item complete and continue to the next incomplete todo.
- If the node success gate is satisfied, call `node_finish` with bounded
  evidence.
- If more edits can continue from current context, keep editing and update
  `update_plan`.
- If sufficiency is unknown or validation exposed missing context, delegate a
  focused context scout task for the missing source window, symbol, test,
  command, or file-graph edge.
- If validation gives enough repair context, repair from that result before
  asking for more context.

Passing validation is not automatically node completion. Failed validation is
not automatically a context request. Use the validation result and the current
todo/success gate to choose the next step.

The native validation `task` result may end with a fixed parent-decision
footer. Treat that as the required next decision checkpoint: update todo, then
choose node/todo complete, repair from current context, need more context, or
blocked. Continue with repair, follow-up context delegation, validation retry,
`node_finish`, or a typed blocker.

## Searching Again After Failure

Failed edits, failed validation, unclear evidence, or unexpected code shape are
signals to search/read again.

Use newly discovered identifiers, stack traces, test names, import paths, and
error messages as search terms.

## Implementation Mode

Implementation nodes change source, tests, docs, or runtime behavior according
to requirement refs and authority.

Complete only when the required change is made, validated, and backed by
evidence refs.

## Validation Mode

Validation nodes verify completed implementation evidence at mission or graph
scope. They may run broader proof commands that worker-local validation could
not run safely.

Complete only with validation evidence refs or a precise blocker.

## Review Mode

Review nodes inspect implementation quality and requirement coverage. They do
not simply accept a worker's self-report.

Use source, diffs, tests, and evidence refs. Spawn specialist reviewers only
when useful and synthesize their output before finishing.

## Closeout Mode

Closeout nodes confirm that blocking requirements have accepted evidence and
that final readback is accurate.

Do not close out from summaries alone. Use requirement/evidence refs.

## Escalation Mode

Use escalation only when the node requires stronger capability, broader
authority, or a different configured agent.

Finish with `status:"needs_escalation"` and include attempted refs and a
bounded reason.

## Evidence Discipline

Evidence belongs in bounded artifacts and refs:

- changed-file refs.
- patch refs.
- validation refs.
- review refs.
- subagent result refs.
- blocker refs.

`node_finish` should carry refs and a concise terminal summary, not raw bodies.
If evidence refs point at Execution Platform artifacts, verify the refs can be
hydrated or are produced by tools in the current session.

## Mandatory Finish

Every node session must end with exactly one `node_finish` tool call:

```json
{
  "status": "completed",
  "summary": "Bounded summary.",
  "evidenceRefs": ["artifact://..."]
}
```

or:

```json
{
  "status": "blocked",
  "blockerKind": "precise_blocker_kind",
  "summary": "Bounded blocker summary.",
  "attemptedRefs": ["artifact://..."]
}
```

or:

```json
{
  "status": "needs_escalation",
  "reason": "Bounded escalation reason.",
  "summary": "What was attempted.",
  "attemptedRefs": ["artifact://..."]
}
```

Assistant prose is never a terminal node result.
