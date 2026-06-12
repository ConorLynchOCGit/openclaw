**Spec-Ready Proposal: OpenCode-Shaped Scout-To-Editor Handoff**

**Core Principle**

Use OpenCode's proven shape wherever it fits:

- `task` is the model-facing delegation facade.
- `sessions.runChild` is the OpenClaw-native child-session primitive.
- Agents are ordinary native OpenClaw agents, not EP-specific machinery.
- Permissions, tools, todo, truncation, context persistence, and child result delivery belong to OpenClaw runtime.
- Our only real extension beyond OpenCode is the unified OpenClaw working ledger: bounded context windows, file graph, compact change sets, and validation state.

OpenCode sources used: [task.ts](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/tool/task.ts), [task.txt](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/tool/task.txt), [subagent-permissions.ts](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/agent/subagent-permissions.ts), [registry.ts](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/tool/registry.ts), [agent.ts](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/agent/agent.ts), [explore.txt](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/agent/prompt/explore.txt), [read.ts](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/tool/read.ts), [read.txt](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/tool/read.txt), [truncate.ts](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/tool/truncate.ts), [message-v2.ts](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/message-v2.ts), [todo.ts](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/session/todo.ts), [todowrite.txt](https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/tool/todowrite.txt).

**OpenCode-First Failure Rule**

If this goal hits a worker, scout, task, tool, timeout, truncation, handoff, permission, todo, bootstrap, or validation failure, inspect the actual OpenCode repo code first at the exact implementation level before designing a local fix.

Required process:

- find the corresponding OpenCode tool/runtime/session code, not only docs or prompts;
- compare OpenCode's concrete behavior against OpenClaw's concrete behavior;
- copy OpenCode's behavior directly when it fits the OpenClaw architecture;
- copy behavior and runtime semantics, not surface names, when OpenClaw already has a clear native name;
- only diverge when OpenClaw has a stronger native requirement, and document the reason in this spec;
- prefer OpenCode defaults over OpenClaw local inventions when both are plausible;
- do not add deterministic guards, schemas, ledgers, prompt wrappers, or EP orchestration if OpenCode solves the same failure through native tool/runtime behavior;
- update this spec and the implementation tracking table whenever an OpenCode gap is closed.

Naming decision:

- Copy OpenCode behavior, not surface spelling.
- Do not add OpenCode parameter-name aliases when OpenClaw already has native names.
- Do not rename OpenClaw-native fields just to match OpenCode.
- The OpenCode-relevant pieces to copy are timeout behavior, bounded tools, truncation, permission/task shape, child-session behavior, and handoff semantics.
- Avoid repeating the rejected alias path: adding `subagent_type`, `prompt`, `description`, or `task_id` aliases to OpenClaw `task` adds friction without copying meaningful runtime behavior.

Resolved decision, 2026-06-08:

- Remove the task parameter alias change and the matching spec item/test.
- Do not reintroduce OpenCode-compatible task parameter aliases as a future cleanup item.
- If OpenCode and OpenClaw differ only in parameter spelling, keep OpenClaw's native spelling.
- Copy the behavior that matters: timeout behavior, bounded tools, truncation, permission/task shape, child-session behavior, and handoff semantics.

Current OpenCode code-level findings to preserve as implementation guidance:

- OpenCode `Read`, `Grep`, and `Glob` are bounded and abortable, but they do not impose arbitrary short per-tool wall-clock timeouts.
- OpenCode `Read` bounds by default line limit, 50 KB byte cap, line-length truncation, offset/limit continuation, directory pagination, and missing-path suggestions.
- OpenCode `Grep` and `Glob` bound result count and line length, and rely on abort signals rather than local wall-clock kill timers.
- OpenCode `Task` requires explicit subagent identity, filters unavailable subagents from the task catalog, creates/resumes child sessions, attaches child sessions to the parent, and derives child permissions from parent/session rules.
- OpenCode foreground `Task` wait is cancellation/abort driven; it does not default child exploration to a 120 second kill timer.
- OpenCode truncation is global tool-runtime behavior: full oversized output is saved, bounded preview is returned, and agents are instructed to inspect saved output with `Task`, `Grep`, and `Read` offset/limit instead of reading the full output.

OpenCode behavior-pressure mechanisms:

- Tool descriptions carry most workflow guidance. `task.txt` tells the parent when not to delegate, `read.txt` explains bounded offset/limit reads, `explore.txt` defines the scout role, and `todowrite.txt` defines todo discipline.
- Provider-visible catalogs are filtered before the model sees tools or subagents. Unavailable subagents are omitted from the task description instead of being visible-but-blocked.
- `Task` enforces explicit child identity, creates or resumes the child session, attaches it to the parent through `parentID`, and derives child permissions from the parent session and agent policy.
- Child results are returned as a tagged model-visible envelope: `<task id="..." state="completed|running|error">`, optional `<summary>`, and `<task_result>` or `<task_error>`.
- Tool output truncation is centralized. Oversized output is saved, a bounded preview is returned, and the model is told how to inspect the saved output without loading everything into context.
- Todo is session-owned, ordered, status-bearing, and evented. The todo prompt pushes exactly one active item and completion only after verification.
- Model-visible replay converts completed tool parts back into provider tool results and truncates old tool output. There is no separate deterministic "decision prompt" after task results.

Important reconciliation:

- OpenCode does not enforce a hard post-task "next tool must be todo" gate. It pushes that behavior through task result text, todo guidance, and normal tool-loop continuation.
- OpenClaw should not add a hard semantic decision choke unless the OpenCode-shaped path repeatedly fails after exact bounded parent read, scout skill, task envelope, and truncation fixes.
- If a hard gate is ever added, it must be node-bound policy only, not a general OpenClaw agent rule.

**1. Native Task Contract**

Adopt OpenCode's task behavior almost directly while preserving OpenClaw-native field names.

Model-facing tool params:

```ts
{
  label?: string;           // short task label; same semantic role as OpenCode description
  task: string;             // detailed child task prompt; same semantic role as OpenCode prompt
  agentId: string;          // explicit child agent id; same semantic role as OpenCode subagent_type
  continuationId?: string;  // continuation of same child session only; same semantic role as OpenCode task_id
}
```

For node-worker first lane:

- `agentId` required.
- Missing or unknown subagent fails before child creation.
- Fresh child context by default.
- `continuationId` resumes only the same child task.
- `background` excluded for now.
- Description lists only allowed scouts.
- Parent does not see raw `sessions_spawn` or `sessions_yield`.

Task result shape should also follow OpenCode's tagged output style:

```xml
<task id="agent:execution-context-scout:subagent:..." state="completed">
  <summary>context scout completed</summary>
  <task_result>
    ...bounded child result...
    Parent next action: choose the next useful step from the delivered source
    evidence. Edit, use bounded read/grep for one exact lookup, ask one scoped
    follow-up, validate, update todo when the plan changes, or block.
  </task_result>
</task>
```

For errors:

```xml
<task id="..." state="error">
  <task_error>
    ...typed failure...
    Parent next action: finish blocked unless current context is already enough
    to proceed safely. Do not probe gateway-status or file:// refs. Update todo
    when this changes the visible plan.
  </task_error>
</task>
```

The hint is parent-visible task-result text, not durable event semantics and not
a hard post-task todo gate.

**2. Native Child Runtime**

`task` is only a facade. It calls:

```ts
sessions.runChild({
  parentSessionKey,
  parentToolCallId,
  agentId,
  prompt,
  continuationTaskId?,
  nodeRunId?,
  location
})
```

`sessions.runChild` owns:

- child session creation/resume;
- parent-child linkage;
- child agent pack resolution;
- child launch admission;
- child model/provider selection;
- child permission derivation;
- parent lock handoff;
- child session lane execution;
- result append into parent context;
- working ledger projection;
- task result formatting metadata.

Execution Platform does not own child orchestration.

**3. Permission Derivation**

Copy OpenCode's key rule set:

- inherit parent agent edit-deny rules;
- inherit parent session deny rules;
- inherit parent session external-directory rules;
- default deny child todo mutation unless child explicitly permits it;
- default deny recursive task unless child explicitly permits it.

For our agents:

```text
execution-coding:
  allow: todo, task, exact bounded read, mutation, exact resource read, node_finish
  deny: list, glob, grep, exec, process

execution-context-scout:
  allow: read, list, glob, grep, optional lsp
  deny: edit, write, node_finish, parent todo, recursive task

execution-validation-scout:
  allow: read, list, glob, grep, exec, optional lsp
  deny: edit, write, node_finish, parent todo, recursive task
```

**4. Context Scout Role**

Context scout should be OpenCode `explore` adapted to OpenClaw:

- file search specialist;
- uses glob/list for file matching;
- uses grep for text/code search;
- uses read only after exact path/window is known;
- adapts to requested thoroughness;
- never edits;
- never returns full files;
- if parent asks for full files, scout ignores that part and returns relevant bounded sections.

Caller must specify thoroughness:

```text
quick:
  find the likely file(s), return 1-2 windows.

medium:
  map target files, callers, tests/config, return 1-3 windows.

very thorough:
  explore competing paths/naming conventions, return map plus the best windows.
```

For Kimi worker lane, default is `medium`. Use `quick` for exact follow-ups. Use `very thorough` only when architecture is ambiguous.

**5. Context Ask Format**

Kimi's scout prompt should not be broad. It should include:

```text
Goal:
  What the node needs to change.

Known refs:
  Exact paths/symbols/requirements already known.

Question:
  What context is missing.

Thoroughness:
  quick | medium | very thorough

Return:
  mechanical source evidence: exact symbol windows, bounded excerpts, file graph,
  misses, and missing windows, not full files.

Useful result means:
  enough mechanical evidence for Kimi to either decide to start a bounded edit or
  ask one exact follow-up.

Do not:
  return full files;
  inspect runtime state unless explicitly diagnostic;
  mutate files;
  run validation unless this is validation scout.
```

**6. Scout-To-Parent Handoff**

Scout result should be structured prose with stable headings:

```text
Direct Answer

Working Context Persisted
  context windows: <refs>
  file graph: <ref>

File Graph
  A -> B: reason
  A -> test C: reason

Inline Context Windows
  path:
  lines:
  why relevant:
  bounded excerpt:

Likely Edit Points
  path/symbol:
  expected change:

Missing Context
  exact follow-up ask, if any:

Risks / Unknowns
```

This gives Kimi enough structure without creating a brittle JSON packet.

**7. Kimi Edit-Start Decision**

Kimi asks for more only when the returned result fails one of these checks:

Start editing if the scout returned:

- exact target file/path;
- target symbol or policy surface;
- local caller/config/test context;
- enough excerpt text to apply an edit;
- no unresolved competing architecture.

Ask one exact follow-up if missing only:

- one caller window;
- one test/config window;
- one symbol definition;
- one import/export convention;
- one stale edit refresh window.

Ask a map pass if:

- multiple candidate systems remain plausible;
- scout cannot identify the real owner file;
- product/spec policy path is split across several unknown modules.

Block if:

- prompt source refs are missing;
- required files do not exist;
- scout reports stale canonical docs;
- launch/bootstrap/tool constraints prevent source acquisition.

Kimi's todo update after scout should record one of:

```text
Decision: start minimal edit
Decision: ask exact follow-up: <one ask>
Decision: ask map pass: <scope>
Decision: blocked: <reason>
```

**8. Working Ledger**

Keep one OpenClaw-native session working ledger.

Do not create separate ledgers for context, file graph, edits, and validation.

Entries:

```ts
context_window:
  path
  lineStart?
  lineEnd?
  excerptHash
  sourceToolCallId
  scoutSessionId
  whyRelevant

file_graph:
  nodes: path[]
  edges: { from, to, relation, reason }[]
  sourceToolCallId
  scoutSessionId

change_set:
  mutationToolCallId
  changedFiles
  summary
  relatedTodo?
  contextRefsUsed
  success
  staleEditRegrounding?

validation_state:
  validationTaskId
  question
  commandsRun
  exitStatus
  outputExcerptRefs
  likelyCause
  repairContextRef?
  residualRisk
```

The ledger is orientation state, not source truth. Real files and native events remain authoritative.

**9. Bounded Read And Missing Path Behavior**

Adopt OpenCode's read behavior:

- default bounded line limit;
- byte cap;
- offset/limit continuation;
- line-numbered output;
- directory listing pagination;
- missing path suggestions from same directory.

For our specific failures:

- if `docs/projects/.../openclaw-native-node-execution.md` is missing, scout-side read should report nearby candidates;
- prompt authoring should still block stale refs before worker launch;
- the scout should not mutate path prefixes after entering `specs/`.

Parent exact-read reconciliation with OpenCode:

- Kimi may use `read` only for exact bounded source windows.
- Exact means the path and window are already known from the prompt, a scout result, native working context, file graph, or changed-file list.
- The call must include `path`, `offset`, and `limit`.
- The window must be small enough for edit confirmation, not discovery. Current parent limit is 300 lines.
- Parent `read` must reject directories, `file://`, runtime state, managed-output browsing, broad files, and paths outside the workspace.
- Kimi must still use `execution-context-scout` for discovery, search, path finding, caller/test mapping, and broad source acquisition.

This keeps OpenCode's important distinction: do not use `Task` for a specific file path or a known 2-3 file local inspection, but do use `Task` for open-ended exploration.

**10. Managed Output / Truncation**

Adopt OpenCode's truncation semantics:

- full oversized output goes to native managed storage;
- parent gets bounded preview;
- if parent has task, preview tells parent to delegate a scout to inspect the saved output;
- parent must not read full managed output directly;
- scout can inspect saved output through grep/read offset/limit.

For our worker lane:

```text
resultDeliveryStatus:
  full | projected | rejected

workingContextEntryRef:
  present when projected/persisted
```

Avoid making `resultOversized` or raw byte-count fields control-plane truth. If retained, they are display/debug metadata only. The control-plane delivery field is:

```text
resultDeliveryStatus:
  full | projected | rejected
```

Do not add a separate output ledger or broad failure taxonomy unless needed.

**11. openclaw_resource_read**

This tool should not be a file reader.

If Kimi passes `file://...`, return:

```text
resource_read_file_path_not_allowed:
openclaw_resource_read accepts only exact OpenClaw runtime refs intentionally handed to you.
For source files, delegate execution-context-scout and ask for bounded context windows.
```

Allowed refs only:

- node snapshot ref;
- prompt/session input ref;
- source excerpt ref;
- working ledger entry ref;
- explicit runtime ref.

No fuzzy lookup. No file paths. No managed-output browsing.

**12. Prompt Artifact Source Validation**

Before worker launch, validate every declared or intentional repo source ref in the prompt artifact.

If missing:

```text
prompt_source_ref_missing:
  path
  nearestCandidates[]
  sourceSection
```

Worker launch blocks for proof prompts with stale declared source refs. This is input hygiene, not semantic judging.

Do not turn this into a prose-path choke. Ordinary path-like text in explanatory prose should be handled by bounded read/search behavior and missing-path suggestions unless it is explicitly presented as a source ref the worker must rely on.

**13. Todo**

Use OpenCode's todo lesson:

- session-owned;
- ordered;
- status-bearing;
- evented;
- exactly one active/in-progress item while work remains;
- completed only after required verification;
- blocked/partial work stays active with follow-up.

Status values:

```text
pending
in_progress
completed
cancelled
```

OpenClaw may also support `blocked`, but if we want to stay closer to OpenCode, represent blocked as an `in_progress` item plus a blocker follow-up.

**14. Validation Handoff**

Kimi delegates validation with:

```text
Validation question:
  What must be proven.

Changed files:
  From change_set entries.

Context refs:
  Relevant context_window/file_graph refs.

Scope:
  focused command/test target preferred.

Return:
  commands considered;
  commands run;
  exit status;
  bounded output;
  likely cause;
  repair context;
  residual risk.
```

Validation scout persists `validation_state` in the same working ledger.

Kimi then decides:

```text
todo/node complete
repair from current context
ask exact context follow-up
blocked
```

**15. Success Gates**

Proof should show:

- prompt source refs validated before launch;
- parent tool catalog includes exact bounded `read`;
- parent tool catalog excludes list/glob/grep/exec/process;
- parent broad/directory/runtime reads are rejected;
- parent exact small source-window read succeeds;
- Kimi creates durable todo;
- Kimi calls task with explicit scout id;
- child identity is correct;
- child permissions are inherited and narrowed;
- scout uses bounded reads/search;
- missing path suggestions work;
- runtime state root is excluded from repo discovery;
- scout persists context windows;
- scout persists file graph;
- task result reaches parent context;
- task result includes parent-visible decision checkpoint;
- Kimi updates todo with a decision after task result;
- Kimi either starts minimal edit, asks one exact follow-up, asks map pass, or blocks;
- mutation creates change_set;
- validation scout creates validation_state;
- Kimi finishes only after validation or explicit blocker.

**16. First Implementation Slice**

Implement in this order:

1. Prompt source-ref validation.
2. `openclaw_resource_read` `file://` rejection.
3. Scout-side missing-path suggestions.
4. Context scout skill update using OpenCode `explore` shape.
5. Kimi skill update for minimum viable edit context.
6. Task result decision checkpoint wording.
7. Working ledger projection for scout result refs and file graph.
8. Parent exact bounded read, with discovery/search still scout-owned.
9. Focused proof: scout result -> todo decision -> minimal edit or exact follow-up.

**17. Implementation Tracking**

Update this section whenever an item is completed or new evidence changes the
status. Do not mark an item complete without current file/test/runtime evidence.

First implementation slice status:

| Item                                                                               | Status                      | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------- | ----------------------------------- |
| 0. OpenCode-first failure triage and gap-closing rule                              | Complete                    | This spec now requires every worker/scout/task/tool/timeout/truncation/handoff failure to be checked against the actual OpenCode implementation code first, with OpenCode behavior copied when it fits. Local OpenCode dev checkout used for code-level review: `.artifacts/opencode-dev` at commit `0a7cb20e662e115438f56831d09ea96efff171cf`.                                                                                                                                                                                                                                                                                                                                                              |
| 1. Prompt source-ref validation                                                    | Complete                    | Authored worker prompts now block before launch when they contain explicit missing repo source paths, with `missingPromptSourceRefs` diagnostics and nearby candidates; focused test passed: `pnpm test:file extensions/execution-platform/src/workflows/node-agent-session.test.ts -- -t "blocks authored worker prompts that reference missing repo source paths"`.                                                                                                                                                                                                                                                                                                                                        |
| 2. `openclaw_resource_read` `file://` rejection                                    | Complete                    | `createExecutionPlatformResourceReadTool` now rejects `file://`, absolute, dot-relative, home-relative, and repo-source path refs with `resource_read_file_path_not_allowed`; focused test passed: `pnpm test:file extensions/execution-platform/src/workflows/node-agent-session.test.ts -- -t "rejects local source file paths"`.                                                                                                                                                                                                                                                                                                                                                                          |
| 3. Scout-side missing-path suggestions                                             | Complete                    | `createOpenClawReadTool` now appends same-directory "Did you mean" suggestions for missing read paths; focused test passed: `pnpm test:file src/agents/pi-tools.read.repo-canonical.test.ts -- -t "adds nearby path suggestions"`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 4. Context scout skill update using OpenCode `explore` shape                       | Complete                    | `skills/execution-context-scout/SKILL.md` now includes `quick`/`medium`/`very thorough`, search-first known-ref behavior, bounded-window behavior for full-file asks, exact `symbol_windows`, and no scout-owned edit-readiness recommendation.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 5. Kimi skill update for minimum viable edit context                               | Complete                    | `skills/execution-node-workflow/SKILL.md` now makes Kimi own edit-readiness decisions from scout mechanical evidence and maps start minimal edit, ask exact follow-up, ask map pass, or block to the next todo/task/edit/block action.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 6. Task result next-action hint wording                                            | Complete / revised          | Context and validation scout task results now include parent-visible next-action hints, not hard "next tool call must update_plan" footers. This matches the later OpenCode code-level finding: Task returns context, the parent chooses the next action, and todo remains a planning habit rather than a deterministic post-task state machine. Verified focused assertions for `Parent next action` guidance and absence of `NEXT PARENT TOOL CALL` with `pnpm test:file src/agents/tools/native-task-tool.test.ts src/agents/pi-tools-agent-config.test.ts src/agents/pi-tools.node-authority-overlay.test.ts src/agents/agent-pack-registry.test.ts` on 2026-06-09.                                      |
| 7. Working ledger projection for scout result refs and file graph                  | Complete                    | Native working context persists delivered context scout results, validation state, compact change sets, and projected oversized structured scout output; focused tests passed: `pnpm test:file src/agents/pi-embedded-subscribe.handlers.tools.test.ts -- -t "persists delivered context scout results"`, `pnpm test:file src/agents/pi-embedded-subscribe.handlers.tools.test.ts -- -t "persists validation scout results as validation state"`, `pnpm test:file src/agents/pi-embedded-subscribe.handlers.tools.test.ts -- -t "persists successful mutations as compact change_set"`, and `pnpm test:file src/config/sessions/working-context.test.ts -- -t "projects oversized structured scout output"`. |
| 8. Focused proof: scout result -> todo decision -> minimal edit or exact follow-up | Partial / failed live proof | Replay run `product-spec-boundary-replay-mq5js0pm-66e6c38b0fc7` with node run `nrun_c6f9871dce7b65160a59` proved byte-counted prompt-file launch, native durable todo creation, explicit `task` call to `execution-context-scout`, child session `native_task_5a19bc29-9a75-4d0b-b53d-36656743c0c4`, and parent-visible completed task result. It did not prove the gate because the scout over-read broad runtime/source files, the wrapper became CPU-bound after the oversized scout/tool context, and the run was stopped before Kimi resumed to make the required todo decision plus minimal edit/exact follow-up/block action.                                                                         |
| 9. OpenCode-style scout task timeout behavior                                      | Complete / revised          | Native node-worker task no longer exposes `runTimeoutSeconds` as a model-facing control and native child execution ignores stray explicit caps. The embedded runner still receives the max-safe timer sentinel because Node timers need a finite value, but healthy scout work is completion/cancel driven rather than killed by 60s/120s task budgets. Real provider transport/request failures remain classified as `child_provider_response_timeout`. Focused evidence updated in this pass: `src/agents/tools/native-task-tool.test.ts`, `src/agents/session-runtime/run-child.ts`, and `src/agents/pi-embedded-runner/run-child-session-runtime.test.ts`.                                               |
| 10. OpenCode-style read/search bounds                                              | Complete                    | Scout-side read now uses OpenCode-aligned 2000-line / 50 KB default page bounds and offset continuation; glob and grep cap to 100 results, and grep line excerpts allow 2000 chars. Focused tests passed: `pnpm test:file src/agents/pi-tools.create-openclaw-coding-tools.adds-claude-style-aliases-schemas-without-dropping-g.test.ts -- -t "bounds implicit read output                                                                                                                                                                                                                                                                                                                                   | adds capped continuation guidance"`and`pnpm test:file src/agents/tools/repo-discovery-tools.test.ts -- -t "caps glob and grep outputs | greps text"`.                         |
| 11. OpenCode-style live tool-output truncation cap                                 | Complete                    | Live tool-result truncation now defaults to 50 KB-equivalent (`50 * 1024` chars) instead of 16k chars, preserving more scout context before truncation while keeping per-agent overrides. Focused test passed: `pnpm test:file src/agents/pi-embedded-runner/tool-result-truncation.test.ts -- -t "exports the live cap                                                                                                                                                                                                                                                                                                                                                                                      | caps 128K contexts                                                                                                                    | supports a higher configured hard cap | resolves per-agent tool-result cap overrides | truncates oversized tool results"`. |
| 12. OpenCode-compatible task parameter names                                       | Not adopted                 | Deliberately not copied. OpenClaw already has native names (`agentId`, `task`, `label`, `continuationId`), and adding alias names increases tool-surface friction without copying meaningful OpenCode runtime behavior. Keep copying OpenCode task semantics instead: explicit child identity, filtered catalog, fresh child context, permission inheritance, native child sessions, bounded/truncated output, and abort/cancel-driven foreground wait.                                                                                                                                                                                                                                                      |
| 13. Parent exact bounded read                                                      | Complete                    | OpenCode comparison showed the parent should not delegate for a known specific file/window. Implementation now exposes `read` to `execution-coding` only in native task mode and guards it to exact bounded source windows: path, offset, limit, max 300 lines, inside workspace, no `file://`, no directories, and no `.openclaw/runtime`. Focused tests passed: `pnpm test:file src/agents/pi-tools.node-authority-overlay.test.ts` and `pnpm test:file src/agents/pi-embedded-runner/run/attempt.test.ts -- -t "filterEffectiveToolsForNodeAgentNativeTaskMode"`.                                                                                                                                         |
| 14. OpenCode-style task result envelope                                            | Complete / revised          | Native task parent-visible output uses an OpenCode-style `<task>` envelope with `<task_result>` / `<task_error>` and keeps compact next-action guidance inside model-visible tool-result text, not durable event semantics. The guidance should steer toward edit, bounded read/grep, focused follow-up task, validation, node_finish, typed blocker, or todo update when the visible plan changes; it must not impose a hard post-task todo gate.                                                                                                                                                                                                                                                           |
| 15. OpenCode handoff comparison                                                    | Complete                    | Code-level review covered OpenCode task, read, truncation, registry, message replay, todo, explore prompt, task prompt, read prompt, and subagent permission derivation. Decision: copy mechanical runtime/tool behavior; do not copy parameter spelling; avoid hard semantic decision gates unless live proof requires them after this softer path.                                                                                                                                                                                                                                                                                                                                                         |
| 16. Oversized unstructured child result projection                                 | Complete                    | To avoid a schema choke, oversized unstructured child output now returns a bounded parent-visible preview with guidance instead of failing the task as `child_result_unshaped`. Structured output still projects higher-signal sections when available. Focused test passed: `pnpm test:file src/agents/tools/native-task-tool.test.ts -- -t "projects unstructured oversized child output"`.                                                                                                                                                                                                                                                                                                                |

Known test command correction:

- Direct `pnpm exec vitest run ...` is intentionally blocked by the repo
  config for root multi-project local runs. Use `pnpm test:file <path> -- -t
"<case>"` for focused evidence.

**Final Architecture Rule**

Do not solve this with a schema choke or EP orchestration.

The clean version is:

```text
OpenClaw native task
  -> sessions.runChild
  -> native child agent
  -> bounded tools
  -> managed truncation
  -> working ledger
  -> parent-visible result
  -> Kimi todo decision
  -> edit / exact follow-up / map pass / blocked
```

This gives Kimi enough context to start writing without letting it become a crawler, and gives scouts enough structure to return useful bounded context without forcing a brittle packet format.
