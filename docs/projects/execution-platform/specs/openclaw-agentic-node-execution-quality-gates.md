---
summary: "Architecture review and success gates for making native OpenClaw node execution behave like a real agentic coding loop rather than a deterministic workflow with model calls."
title: "OpenClaw Agentic Node Execution Quality Gates"
---

# OpenClaw Agentic Node Execution Quality Gates

Date: 2026-06-05

Status: next major milestone for native OpenClaw node execution. This document
records the architectural review after the first Kimi native-agent node run
reached a repeating failure pattern. It complements
`openclaw-native-node-worker-agent-refactor.md` and
`native-session-launch-worker-bootstrap.md`, which define the native worker
and launch targets. This document defines the implementation milestone that
must close before the next live worker proof: model-authored node assignment,
native todo/plan, native subagent yield/resume, real source in parent context,
and deletion of the old task-brief/worker-loop paths.

## Current Failure Pattern

The native node execution substrate reached the configured `execution-coding`
agent and gave it a node-scoped task brief. The run still failed because the
actual agentic loop was not strong enough:

- The task brief was a context dump: requirements, source refs, and broad prompt
  sections, but not a coherent coding-agent prompt with goal, context,
  constraints, success gates, known unknowns, and required first moves.
- The Kimi parent did not start from a clear plan/todo ledger like Codex does.
- Kimi attempted to spawn `execution-context-scout`, which is directionally
  correct, but subagent start failed on a stale `/home/node/.openclaw/...`
  session path/permission boundary.
- After scout spawn failed, Kimi fell back to broad parent-side repo crawling.
  That is the wrong fallback because it produces context bloat and gives the
  slower reasoning model the work intended for the fast scout.
- The scout output was not proven visible in the parent context before editing.
- Tool availability had drift: some Execution Platform lifecycle/resource tools
  were injected as extra tools while config also treated them like normal native
  OpenClaw tools, causing unknown-tool warnings.
- The run showed the broader risk: we are using OpenClaw's agent runtime, but
  not yet enough of OpenClaw's native agent dynamics.

## External Agentic Coding Lessons

Use these as design constraints, not as another parallel architecture:

- OpenCode models agents as specialized primary agents and subagents with their
  own prompts, models, and permissions. Its built-in `Build` primary agent has
  broad edit/bash authority, while `Explore` is a fast read-only codebase
  exploration subagent and `Scout` is read-only external/dependency research.
  Primary agents can invoke subagents automatically based on descriptions, and
  OpenCode exposes parent/child session navigation.
  Source: <https://dev.opencode.ai/docs/agents/>
- OpenCode has first-class permission keys for read, edit, grep, bash, task,
  todo, web, LSP, skills, and external directories. The key design lesson is
  not "more tools"; it is that each agent has a coherent tool/permission
  profile for its job.
  Source: <https://dev.opencode.ai/docs/agents/>
- Claude Code custom subagents have isolated contexts and their own system
  prompts, tools, models, and permissions. A non-fork subagent starts from the
  delegation task plus its own prompt/docs, not the full parent context.
  Therefore delegation quality is an input-quality problem, not something a
  downstream gate can fix after the fact.
  Source: <https://code.claude.com/docs/en/sub-agents>
- Claude Code recommends subagents for verbose or self-contained work, and the
  main conversation when multiple phases share substantial context or need
  frequent iteration. That maps to our desired shape: Kimi remains the
  parent/synthesizer, Qwen scouts handle fast focused search/read/validation,
  and the parent receives compact real source windows before patching.
  Source: <https://code.claude.com/docs/en/sub-agents>
- Codex documentation frames the core prompt shape as goal, context,
  constraints, and done-when, and emphasizes durable repo guidance through
  `AGENTS.md`, appropriate reasoning level, tests, review, and subagents for
  parallel exploration.
  Sources: <https://developers.openai.com/codex/learn/best-practices>,
  <https://developers.openai.com/codex/subagents>

## Native OpenClaw Capabilities To Use

Do not rebuild these in Execution Platform:

- agent registry/config with per-agent model, workspace, tools, skills,
  sandbox, and subagent allowlists.
- `sessions_spawn` for OpenClaw subagent runs.
- `sessions_yield` for yielding the parent turn while waiting for subagent
  results.
- `subagents` for child status/steer/kill.
- `agents_list` for discovering allowed subagents.
- subagent attachments for passing bounded source material.
- session store, subagent registry, lifecycle announce, and compaction.
- per-agent skills and canonical agent docs.
- OpenClaw tool policy and filesystem sandboxing.
- `update_plan` where available for visible task/todo state.

Execution Platform should add only lifecycle/evidence tools that OpenClaw does
not natively have, such as `node_finish` and bounded Execution Platform ref
hydration. Those must be integrated through the native tool transport, not as a
second tool universe.

## Native Capability Check For Each Proposal Item

Every implementation item below must be checked against OpenClaw-native
capabilities first. The rule is:

```text
If OpenClaw already has the primitive, wire into it.
If OpenClaw almost has it, extend the native OpenClaw primitive.
Only add Execution Platform code for graph lifecycle, bounded ref hydration,
typed node finish/evidence, or runtime proof/readback.
```

Do not add a parallel Execution Platform implementation of sessions, subagents,
agent registry, tool permissions, skills, filesystem policy, compaction, or
todo/task state unless code review proves no native OpenClaw surface exists.

| Proposal area                     | OpenClaw-native surface to use first                                                                                                                   | Execution Platform work allowed                                                                                                                                                                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model-authored node worker prompt | OpenClaw agent session prompt plus native model turn surface                                                                                           | Author one complete Markdown worker prompt under `NodeLifecycleRunner` ownership. Do not use a deterministic wrapper, context dump, scheduler-authored prompt, JSON-shaped tool call, or prompt-authoring tool ceremony.            |
| Visible node todo/plan            | Existing OpenClaw `update_plan` tool if it can be enabled for `execution-coding`; otherwise inspect native session/task tooling before adding anything | If no native persistent plan surface exists, add the smallest native OpenClaw tool extension, not an EP-only hidden ledger.                                                                                                         |
| Context scout delegation          | Native `sessions_spawn`, `sessions_yield`, `subagents`, `agents_list`, subagent registry                                                               | Make the parent prompt/skill require the native spawn/yield path and record EP readback refs. Do not revive EP scout loops.                                                                                                         |
| Subagent spawn path               | Native OpenClaw session store/path resolver, spawned workspace inheritance, agent config                                                               | Fix stale `/home/node` resolution in OpenClaw session/workspace resolution. Do not wrap it with an EP-specific child-session launcher.                                                                                              |
| Subagent input material           | Native `sessions_spawn.attachments` and task message                                                                                                   | Attach bounded prompt excerpts/task brief through native attachment support. EP only prepares bounded source artifacts/refs.                                                                                                        |
| Parent waits for child            | Native `sessions_yield`, subagent announce/registry/status                                                                                             | Require yield/wait and expose proof refs. Do not implement an EP polling loop unless it calls native subagent state.                                                                                                                |
| Child output visibility           | Native parent/child session linkage, subagent result announce, session transcripts                                                                     | Add proof/readback that the parent received and synthesized output before edit. Do not store raw child transcripts in EP artifacts.                                                                                                 |
| Failed scout spawn                | Native subagent spawn errors and session lifecycle events                                                                                              | Map failure into typed node blocker via `node_finish`/runner outcome. Do not allow broad parent crawl as fallback.                                                                                                                  |
| Lifecycle tools                   | Native OpenClaw tool transport and `extraTools` injection                                                                                              | Register or inject `node_finish` and bounded EP resource read cleanly so no unknown-tool warnings remain.                                                                                                                           |
| Permissions                       | Native OpenClaw agent config, tool policy, filesystem policy, workspace root, sandbox                                                                  | Configure execution agents and scouts with role-appropriate tools. Do not create a second EP path whitelist for repo discovery.                                                                                                     |
| Agent docs and skills             | Native OpenClaw agent docs and workspace skills                                                                                                        | Update `AGENTS.md`, `IDENTITY.md`, `TOOLS.md`, `BOOTSTRAP.md`, and skills. Do not duplicate the whole workflow in multiple docs.                                                                                                    |
| Parent input format               | Native agent prompt/session start                                                                                                                      | Replace task brief with one model-authored worker prompt artifact/ref. Do not reintroduce worker packets, start contracts, lexical anchors, discovery seeds, `NodeExecutionAssignment`, or deterministic source-material artifacts. |
| Subagent input format             | Native subagent task plus attachments                                                                                                                  | Shape the delegation prompt and attachments. Do not add a separate scout contract compiler.                                                                                                                                         |
| Command/output discipline         | Native tool permissions, exec/read tool wrappers, skills, sandbox policy                                                                               | Prefer native command policy and skill rules. EP may add proof gates that detect broad crawl, but not own shell execution.                                                                                                          |
| Validation delegation             | Native `sessions_spawn` to `execution-validation-scout`, native exec/read tools                                                                        | Let validation scout select/run/analyze when appropriate and return bounded results. EP maps accepted evidence refs.                                                                                                                |
| First-turn proof gate             | Native session transcript/events plus EP runtime readback                                                                                              | Verify first meaningful move from actual tool events. Do not simulate or infer from reason-code bags.                                                                                                                               |
| Middle-lane proof                 | Native OpenClaw agent/subagent session path                                                                                                            | Build proof around the real native path. No replay-only worker, fake tool loop, or JSON-shaped stand-in.                                                                                                                            |
| Runtime optics                    | Native session events, subagent registry, tool events, EP bounded artifacts                                                                            | Project native events into runtime readback refs. Do not persist raw transcripts or provider logs.                                                                                                                                  |
| Failed-run side effects           | Git/worktree state plus EP node finish/evidence acceptance                                                                                             | Treat edits as unaccepted until `node_finish` is accepted. Reconcile or revert through normal repo workflow; do not make runtime lifecycle from dirty files alone.                                                                  |
| Model role split                  | OpenClaw agent registry/config, per-agent model/reasoning defaults, subagent model config                                                              | Change agent config and skills. Do not return to scheduler/provider-slot worker orchestration.                                                                                                                                      |

## Next Major Milestone: Native Agentic Node Execution

This milestone replaces the current worker-start task brief and half-native
agent loop with a real OpenClaw-native coding-agent run. The boundary is:

```text
NodeLifecycleRunner
  -> NodeExecutionSnapshot
  -> model-authored worker prompt artifact/ref
  -> OpenClaw execution-coding session
      -> native todo/plan
      -> sessions_spawn context scout
      -> sessions_yield / receive child result
      -> synthesize real source windows
      -> edit
      -> validate
      -> repeat scout/search/edit/validate
      -> node_finish
  -> NodeLifecycleRunner accepts terminal outcome
```

The extra model call for node prompt authoring is intentional. Earlier
deterministic wrappers and context dumps failed because they left the worker
with source material but no coherent directive. Prompt authoring is the right
model-owned boundary. The safeguard is not a deterministic fallback; it is a
single native tool turn, typed blockers on failure, and no separate prompt
lifecycle.

## Implementation Items

1. **Replace `initialTaskBrief` With A Model-Authored Worker Prompt**

   Delete deterministic task brief as production worker input.

   The only production node-start prompt artifact should be the exact
   model-authored worker prompt text attached to the node execution snapshot
   and written directly as the first native OpenClaw session message.

   Do not persist a `NodeExecutionAssignment` wrapper. It became a pointer-only
   moving part between the scheduler-selected node and the real OpenClaw
   session prompt.

   Persist `execution_platform.node_agent_worker_prompt` as evidence with:
   - `promptRef`
   - `nodeRunId`
   - `nodeId`
   - `runtimeJobId`
   - `sessionKey`
   - `snapshotRef`
   - `requirementRefs`
   - `sourcePromptRefs`
   - `promptText`
   - `promptHash`
   - `promptByteCount`
   - `promptAuthorModelRunRef`
   - `artifactPolicyRef`

   Do not persist separate durable concepts for:
   - `initialTaskBrief`
   - `NodeAgentPromptSourceMaterial`
   - `NodeAgentAuthoredTaskPrompt`
   - deterministic source-material packet
   - worker start contract prompt body

   Those can exist only as transient function-local inputs while authoring the
   worker prompt.

   The actual prompt sent to `execution-coding` must be a comprehensive,
   model-authored Markdown work order. It should read like a complete agent
   assignment with enough operator intent, source material, constraints,
   success gates, first moves, delegation expectations, and finish rules for the
   agent to execute without guessing. The worker prompt artifact is evidence
   of the exact session input; it is not a packet the worker must hydrate.

2. **Make Prompt Authoring A Single Native Text Turn**

   Prompt authoring should be one bounded native model text turn with one
   output: the prose Markdown prompt.

   ```text
   executeModelTurn({ resultMode: "text", owner: "node_lifecycle" })
   ```

   Use the shared provider-tool transport's text result mode. Do not create an
   EP-only model client if OpenClaw already has the primitive, and do not force
   prose through tool calls.

   Rules:
   - no deterministic fallback prompt
   - no JSON-shaped output
   - no prompt-authoring tool requirement
   - no multi-phase prompt repair loop
   - no semantic quality-gate thrash
   - provider retry is allowed only for provider failure
   - if prompt authoring cannot produce a usable directive, block the node
     before worker start

   Typed blockers:
   - `node_worker_prompt_authoring_failed`
   - `node_worker_prompt_authoring_unavailable`
   - `node_worker_prompt_missing_source_material`

3. **Prompt Authoring Model Selection Comes From OpenClaw Config**

   The authoring model must be configurable through OpenClaw agent/model
   profile config.

   Do not hardcode EP model policy.

   The prompt authoring model needs enough reasoning to turn requirements plus
   the original prompt into a coherent worker directive. If Qwen is too generic
   here, use a stronger configured model for this one boundary.

4. **Worker Prompt Contract**

   The authored prompt must be a complete Markdown work order for
   `execution-coding`.

   It must not be a brief model note, a context dump, a deterministic wrapper,
   a JSON object, or a short “go do this” instruction. It must convert the
   assigned requirements plus the original operator prompt into one coherent
   directive that the coding agent can follow as its primary session prompt.

   It must include:
   - node goal
   - node kind
   - assigned requirements
   - statement that assigned requirements define executable scope
   - full original operator prompt as source material where available
   - all explicit file/path refs from the original prompt
   - relevant source prompt excerpts
   - constraints
   - non-goals
   - done-when/success gates
   - first required move
   - context/search/edit/validate loop instructions
   - context scout delegation rules
   - validation scout delegation rules
   - blocker/escalation rules
   - terminal `node_finish` rule

   Required scope language:

   ```text
   The full original prompt is source material for mining refs, terms, examples,
   constraints, and validation expectations. It does not expand this node beyond
   the assigned requirements.
   ```

5. **Prompt Length Policy**

   For proof-scale prompts, include the full original operator prompt in the
   worker prompt.

   For very large prompts:
   - include assigned requirements
   - include all assigned requirement source spans
   - include relevant prompt excerpts
   - include explicit operator file refs
   - include full prompt expansion refs
   - do not summarize away source material into abstract schema

   The worker should reason from real prompt source, not atomized summaries.

6. **Let OpenClaw Own Prompt/Session Storage**

   EP should persist bounded refs/hashes/manifests only.

   The actual executed prompt belongs naturally to the OpenClaw session
   substrate. EP should not become a raw-prompt archive.

   Persist:
   - prompt hash
   - prompt authoring model run ref
   - assignment ref
   - bounded source refs
   - artifact policy ref

   Do not persist:
   - raw full prompt body as EP runtime artifact
   - raw session transcript
   - raw provider log
   - hidden reasoning
   - unbounded command output

7. **Native Todo/Plan Requirement**

   `execution-coding` must use native plan/todo before broad work.

   Current code review shows the native OpenClaw todo-like surface available on
   this path is `update_plan`: a structured, visible working-plan tool with
   `pending`, `in_progress`, and `completed` step states. There is not a
   separate durable OpenClaw task database/tool in this runtime path.

   First choice, and current required surface, is OpenClaw `update_plan`.

   If `update_plan` later proves insufficient for readback-safe plan state,
   extend OpenClaw's native plan/todo system. Do not add an EP todo ledger or a
   hidden second plan store.

   Required behavior:
   - first meaningful worker action creates plan
   - plan updates after scout result
   - plan updates after edit
   - plan updates after validation
   - plan updates before `node_finish`

   Failure if:
   - no plan appears
   - broad repo search happens before plan/source grounding
   - patching starts before plan/source grounding

8. **Tool And Permission Cleanup**

   Profile validation must require only actually callable native tools:
   - `update_plan`
   - `sessions_spawn`
   - `sessions_yield`
   - `subagents`
   - `agents_list`
   - `openclaw_resource_read`
   - `node_finish`
   - native read/search/list/grep/glob/LSP tools where available
   - edit/write/patch tools only if truly exposed
   - exec/process where allowed

   Unavailable tools must disappear from the model menu. Do not instruct the
   agent to ignore dead tools.

   Denied/unavailable subagents/tools should be hidden, matching OpenCode's
   task-permission behavior.

9. **Prefer Native Search Over Shell-Only Search**

   Audit and wire OpenClaw-native code search where available:
   - read
   - grep
   - glob
   - list
   - LSP symbols/references

   `exec rg` can remain allowed, but should be an escape hatch, not the primary
   scout interface when native tools exist.

   Current catalog audit found no GitHub tool that provides these local repo
   discovery commands. GitHub references in the catalog are provider/auth/test
   surfaces, not a worker-facing code-search tool. Therefore local repo
   discovery belongs in OpenClaw's native tool catalog directly:
   - `list` for bounded directory orientation.
   - `glob` for bounded file discovery.
   - `grep` for bounded text search with file/line hits.

   These tools must be ordinary OpenClaw tools, not Execution Platform-only
   worker verbs and not a GitHub-specific remote API surface. The context scout
   and validation scout should receive them through normal agent tool policy.
   `exec rg` remains available only as an escape hatch for search shapes the
   native tools cannot express.

10. **Context Scout Delegation As Default Mapping Path**

    When target files are unknown or repo mapping is weak:

    ```text
    execution-coding
      -> sessions_spawn execution-context-scout
      -> sessions_yield / native wait
      -> synthesize result
    ```

    No broad Kimi parent crawl as fallback.

    Scout spawn failure becomes typed blocker:
    - `context_scout_spawn_failed`
    - `node_agent_subagent_runtime_unavailable`

11. **Native Attachments For Subagent Input**

    Use `sessions_spawn.attachments` for scout input when useful.

    Context scout receives:
    - exact assigned requirement text
    - relevant original prompt excerpts
    - full prompt expansion refs
    - explicit file refs from original prompt
    - known hits/misses
    - search terms tried
    - exact context question
    - requested output: edit points, tests, callers, configs, risks

    Do not make scouts start from opaque refs only.

12. **Scout Output Must Include Real Source Windows**

    Scout output should be structured Markdown/prose, not brittle JSON.

    Required sections:
    - answer
    - search terms used and why
    - hits
    - misses
    - likely edit points
    - adjacent tests/callers/imports/configs
    - residual risks
    - actual bounded inline prompt/code/test windows

    Refs-only output is not acceptable when the parent needs source to act.

13. **Parent Must Synthesize Child Output Before Edit**

    Readback/proof must show:
    - child session started
    - child returned bounded inline windows
    - parent received output
    - parent updated plan or wrote synthesis using child output
    - only then did edit/patch happen

    This closes the two-brain failure.

14. **Treat `sessions_yield` As Nonterminal Node Execution**

    If the parent yields while waiting for a scout, `NodeLifecycleRunner` must
    not record `node_finish_not_called`.

    Required lifecycle:

    ```text
    OpenClaw parent session yielded for child result
      -> NodeLifecycleRunner records node_execution_waiting_on_subagent
      -> child result arrives through native OpenClaw session event
      -> same parent session resumes
      -> only terminal node_finish completes/blocks/escalates the node
    ```

    No EP polling loop if OpenClaw events already provide the state. EP can
    project native subagent/session state into readback, but it must not own
    child execution.

15. **Preserve Dynamic Codex-Like Loop**

    Do not make node execution rigid phases.

    The live loop is:

    ```text
    prompt/requirement inspection
    -> plan
    -> scout/search/read
    -> synthesize
    -> minimum useful edit
    -> narrow validation
    -> mine failures/new identifiers
    -> scout/search/read again
    -> repair/edit
    -> validate again
    -> repeat
    -> node_finish
    ```

    `NodeLifecycleRunner` owns lifecycle and terminal acceptance only. It does
    not own context sufficiency, keyword acceptance, edit planning, or
    validation repair microphases.

16. **Validation Scout As Native Subagent**

    For non-trivial validation, parent uses:

    ```text
    sessions_spawn execution-validation-scout
    ```

    Validation scout returns:
    - commands considered
    - commands run
    - pass/fail status
    - bounded output excerpt
    - likely cause
    - source/test/config refs
    - next repair context
    - residual risk

    Parent owns repair decision and terminal `node_finish`.

17. **Validation/Review/Closeout Use The Same Native Node Path**

    Validation, review, and closeout nodes should not be second-class gates.

    They use the same native OpenClaw node execution path with different
    prompt/skill emphasis.

    Do not build a separate validation/review/closeout harness unless it is
    simply another configured OpenClaw agent profile.

18. **Session Yield And Resume Proof**

    Prove this path explicitly:
    - parent spawns scout
    - parent yields/waits natively
    - child completes
    - child result auto-announces or lands in parent session
    - parent resumes same session
    - parent uses child output before edit

    No EP polling loop unless it is a projection over native subagent state.

19. **Runtime Optics**

    Readback should expose bounded event refs for:
    - worker prompt authored
    - worker prompt hash/ref
    - parent session key
    - first plan update
    - scout spawn
    - child session key
    - child result ref
    - parent synthesis
    - first edit
    - validation action
    - validation scout result
    - repair loop evidence
    - terminal `node_finish`
    - nonterminal waiting-on-subagent state when applicable

    No raw transcripts, raw provider logs, hidden reasoning, or unbounded
    command output.

20. **Storage Policy Simplification**

    Move repeated raw-storage booleans into one artifact policy.

    Persist:
    - refs
    - manifests
    - hashes
    - bounded summaries
    - event ids

    Send real source into live model context, but do not persist raw full
    prompt/transcript as EP runtime artifacts.

21. **Agent Docs And Skills Tightening Without Duplicated Control Planes**

    Update only execution-relevant docs/skills:
    - `execution-coding` identity/docs/tools
    - `execution-node-workflow` skill
    - `execution-context-scout` skill
    - `execution-validation-scout` skill

    Keep identity docs short and durable. Put repeatable behavior in skills.
    Avoid repeating the full workflow in `AGENTS.md`, `TOOLS.md`, and skill docs
    with drift-prone differences.

    Required content:
    - visible plan required
    - scout-first when mapping is weak
    - no broad parent crawl after failed scout spawn
    - scout output must include inline source windows
    - parent must synthesize child output before edit
    - `sessions_yield`/native wait is valid nonterminal behavior
    - validation repair loops search again
    - `node_finish` is terminal

22. **Native Compaction/Session Continuity**

    Long Kimi parent sessions plus scout outputs can bloat context.

    Use OpenClaw-native compaction/session continuity where available. Do not
    add EP summarization of agent cognition.

    Proof should verify compaction does not erase:
    - assigned requirements
    - current plan/todo
    - child scout outputs needed for edit/repair
    - node_finish obligation

23. **First-Turn Proof Gate**

    Narrow proof starts one implementation node and verifies first meaningful
    worker action is one of:
    - `update_plan` plus context scout spawn
    - `update_plan` plus explicit known-target rationale
    - typed blocker

    Failure if:
    - no plan
    - broad crawl starts first
    - patching starts before source context
    - scout spawn fails and parent silently continues weaker
    - parent yield is misclassified as `node_finish_not_called`

24. **Middle-Lane Proof Gate**

    Before full replay, prove:

    ```text
    RequirementMap handoff
    -> Scheduler creates implementation node
    -> NodeLifecycleRunner authors `node_agent_worker_prompt`
    -> execution-coding starts
    -> update_plan
    -> context scout spawn
    -> sessions_yield / child result
    -> scout returns inline windows
    -> parent resumes
    -> parent synthesizes
    -> edit
    -> validation
    -> repair/search if needed
    -> node_finish
    ```

    This proof must validate agent dynamics, not just session startup.

25. **Delete Old Paths And Zombie Tests**

    Delete or rewrite anything preserving:
    - deterministic task brief as worker input
    - refs-only scout sufficiency
    - scheduler-authored worker prompt
    - EP-owned context scout lifecycle phase
    - old worker packet/start-contract behavior
    - JSON-shaped worker tool calls where native OpenClaw tools exist
    - unavailable tools visible in worker menu
    - parent yield classified as terminal missing finish

    Inventory gates:
    - no production `initialTaskBrief`
    - no production `buildNodeAgentInitialTaskBrief`
    - no scheduler worker-prompt authoring
    - no EP scout lifecycle owner
    - no missing `update_plan` from execution-coding profile
    - no unavailable tools visible to worker model
    - no `sessions_yield` terminalized as `node_finish_not_called`

26. **No New EP Agent Architecture**

    Allowed EP additions:
    - model-authored worker prompt artifact/ref under `NodeLifecycleRunner`
    - bounded EP ref hydration
    - `node_finish`
    - lifecycle/evidence acceptance
    - readback projection

    Forbidden additions:
    - EP todo ledger
    - EP subagent runner
    - EP context scout state machine
    - deterministic keyword/file-ref compiler
    - scheduler worker-prompt phase
    - compatibility fallback worker loop
    - EP summarizer for agent cognition

27. **Model Role Split Stays Native OpenClaw Config**

    Keep current intended split:

    ```text
    execution-coding parent: Kimi
    execution-context-scout: Qwen
    execution-validation-scout: Qwen
    ```

    If Kimi remains poor as controller, change OpenClaw agent config/model
    assignment, not EP orchestration.

28. **OpenCode Parity Gaps To Close**

    Explicitly close these gaps at the OpenClaw layer:
    - primary coding agent with broad edit/exec authority
    - read-only exploration subagent
    - read/exec validation subagent
    - native todo/plan tool equivalent to OpenCode todo behavior
    - task/subagent permissions
    - denied tools hidden from model
    - native codebase exploration tools
    - native session/subagent continuity
    - native compaction/readback projection where available
    - clear primary/subagent mode semantics

## Design Principle

The elegant version is not more deterministic gates. It is a cleaner native
agent session that behaves like Codex's real working loop: discover enough
context to make a useful move, edit, validate narrowly, use the result to
search/read more, edit again, and continue until the node can finish with
evidence or a typed blocker. Context discovery is not a one-time phase before
editing, and validation is not only a terminal phase after editing.

Runtime owns lifecycle and evidence. OpenClaw owns agents, tools, permissions,
sessions, skills, subagents, planning/todo, compaction, and context management.
The parent coding agent must see real source material before patching.
Subagents must be native, visible, and useful, not detached artifacts or hidden
context turns.
