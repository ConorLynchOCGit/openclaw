---
name: execution-node-workflow
description: Use when running an Execution Platform Runtime Work Graph node through an OpenClaw native agent session. Guides assignment prompt intake, native update_plan use, exact prompt/source ref hydration, native task delegation to scouts, edit/validation/repair, evidence discipline, and mandatory node_finish terminalization.
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

Then open the node execution snapshot ref from the user message. Use
`openclaw_resource_read` for Execution Platform refs such as node snapshots,
requirements, source-prompt windows, and evidence artifacts.

Read:

- node id, node kind, attempt id, and node run id.
- requirement refs.
- source prompt refs.
- task refs.
- readable and writable authority refs.
- evidence contract ref.
- validation policy ref.
- validation command refs.

If the assignment prompt is missing or incoherent, or the snapshot is
unavailable, finish with a typed blocker. Do not continue from memory or
guesswork.

## Source Prompt Inspection

Requirements are compact pointers. The raw operator prompt/source material is
the source of truth.

Before asking a scout to map the repo, inspect the prompt/source refs associated with the node.
Hydrate exact `source-prompt://.../body/start-end` refs through
`openclaw_resource_read`; these are bounded windows from the operator prompt,
not generic summaries.
Extract concrete search signal:

- product, workflow, plugin, package, class, function, and tool names.
- exact phrases from requirements.
- long-tail terms and variants.
- likely files, directories, tests, scripts, and docs.
- negative constraints and non-goals.
- validation expectations.

Avoid generic terms such as "implementation", "validation", "workflow", or
"scheduler" unless combined with specific adjacent terms from source material.

If target files are not already known after hydrating the assigned
requirements and source-prompt ranges, do not begin with parent-owned repo
crawling. Use native `task` with `agentId:"execution-context-scout"` as the first repo-mapping move and
give it the hydrated requirement text, the relevant prompt excerpts, and the
source prompt body ref or manifest. Prompt refs, likely repo targets, and
validation hints may live in a separate source-prompt section from the assigned
requirement span, so the scout should inspect adjacent or broader prompt
windows through the body manifest when needed. Use the scout again whenever
editing, validation, or a failed patch reveals new search terms. The scout must
return actual inline prompt/code/test windows into this parent session. The
parent execution agent then decides whether those windows are enough to plan
edits or whether to ask the scout for another focused pass.

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
parent execution agent must use those excerpts and the graph directly, and ask
the scout for more context when it needs adjacent windows or missing edges.

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
