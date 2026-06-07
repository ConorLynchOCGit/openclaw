---
summary: "Verbatim proposal for refactoring executable-node workers into OpenClaw-native agent sessions with NodeLifecycleRunner lifecycle ownership."
title: "OpenClaw-Native Node Worker Agent Refactor"
---

# OpenClaw-Native Node Worker Agent Refactor

This spec records the verbatim execution proposal for the next executable-node
worker refactor pass.

```text
You are working in /root/services/openclaw-roles/live.

Goal: refactor the Execution Platform executable-node worker path so node execution runs through a real OpenClaw-native agent operating model, not through an Execution Platform-specific worker harness pretending to be an agent.

This is not a narrow patch. Do not add stopgaps, compatibility paths, fallback worker loops, duplicate telemetry systems, JSON-shaped worker tools, or Execution Platform-specific agent/subagent/skill machinery when OpenClaw already has native surfaces.

Architectural priority:
- fewer moving parts
- fewer ownership conflicts
- fewer abstractions
- fewer failure points
- stronger agent behavior
- direct use of real source material
- native OpenClaw agent/tool/session/subagent/skill infrastructure wherever possible

Core ownership rule:
- NodeLifecycleRunner owns graph-node lifecycle: start permission, snapshot creation, prompt-authoring ownership as node-start preparation, terminal node acceptance, evidence acceptance, escalation projection, lifecycle readback.
- OpenClaw owns agent runtime: agent identity, bootstrap, skills, tools, permissions, subagents, sessions, compaction, tool events.
- execution-coding owns local node cognition: plan, prompt/source inspection, search/delegation, synthesis, edit, validation, repair, finish.
- Readback projects native OpenClaw session facts plus NodeLifecycleRunner state. It must not become a lifecycle owner or infer lifecycle from reason-code bags.

Do not make Execution Platform simulate an agent framework.

Target flow:

NodeLifecycleRunner
  -> builds NodeExecutionSnapshot
  -> authors coherent model-authored prose node prompt as node-start material
  -> runs minimal node-agent preflight
  -> starts OpenClaw execution-coding agent
      cwd/project root: /root/services/openclaw-roles/live
      native permission access to required external OpenClaw docs/artifacts
      required native skills active through OpenClaw bootstrap
      native tools visible
      native subagents visible
      coherent model-authored prose node prompt injected as first user message
  -> OpenClaw agent runtime handles:
      native plan/todo
      skill context
      context scout subagents
      validation scout subagents
      tool calls
      compaction
      session events
  -> execution-coding calls node_finish
  -> NodeLifecycleRunner accepts/rejects node_finish

Do not run broad live proof unless explicitly requested after this pass.

Runtime contracts should stay minimal. Do not create a schema forest.

Canonical runtime contracts:

1. NodeStartContract
   NodeLifecycleRunner prepares:
   - node execution snapshot ref
   - coherent worker prompt artifact/ref
   - resolved agent id
   - cwd/project root
   - required tool names
   - required subagent ids
   - required skills
   - assigned requirement refs/text
   - source prompt refs/excerpts needed to write and understand the prompt
   - expected evidence/validation finish contract

   NodeStartContract is node-start material only. It does not own lifecycle and does not become a second worker packet abstraction.

2. OpenClawAgentLaunch
   OpenClaw launches the real agent with native bootstrap, permissions, tools, skills, sessions, subagents, compaction, model config, and session event handling.

   Execution Platform must not reimplement an agent runtime under this boundary.

3. NodeAgentSessionTrace
   Read-only projection of native OpenClaw session facts:
   - prompt submitted
   - active skills/bootstrap
   - visible tools
   - visible subagents
   - cwd/search root
   - plan/todo events
   - tool calls/results
   - subagent spawn/result events
   - compaction/overflow events
   - node_finish call/result

   This is diagnostic/readback only. It does not own lifecycle.

4. NodeFinishReceipt
   The only terminal handoff back to NodeLifecycleRunner.

   node_finish is mandatory and terminal. Assistant text, inferred success, or final prose cannot complete a node.

1. Replace Lightweight Node Bootstrap With Native OpenClaw Agent Bootstrap

Current failure class:
- executable node sessions can start without the execution-coding operating context active.
- Lightweight/default bootstrap strips useful agent identity/docs before the model can use them.
- The worker can begin with no real awareness of its identity, skill workflow, subagents, finish obligation, or expected coding loop.

Fix:
- Remove lightweight bootstrap from executable node sessions.
- Do not introduce an Execution Platform-only bootstrap mode if OpenClaw has a general agent bootstrap/profile mechanism.
- Use OpenClaw's native agent bootstrap/profile/config path so execution-coding receives its operating context before the first model turn.
- Keep cwd/project root as the repo root for coding work:
  /root/services/openclaw-roles/live
- Keep OpenClaw docs/artifacts accessible through native permission/external-directory/resource mechanisms, not by making /root the default search universe.
- Exclude unrelated global memory, heartbeat clutter, root-level noise, stale run artifacts, and broad /root workspace sludge from execution-coding node sessions.
- Required worker identity/docs/skills must be present before the first worker model call.
- Do not treat "the model can read AGENTS.md if it searches for it" as sufficient bootstrap.
- Do not let the session start "mostly configured."

Required preflight:
- If execution-coding bootstrap material cannot be loaded, block before model invocation with a typed node-agent preflight blocker.
- Missing bootstrap is not a model failure.
- Missing bootstrap is not scheduler repair.
- Missing bootstrap is a node-agent launch/preflight failure owned by NodeLifecycleRunner/OpenClaw launch boundary.

Typed blockers:
- node_agent_bootstrap_missing
- node_agent_identity_missing
- node_agent_required_skill_context_missing
- node_agent_profile_unresolvable
- node_agent_session_bootstrap_failed

Tests:
- executable node sessions do not use lightweight/default-empty bootstrap.
- execution-coding node sessions include their operating context before first model turn.
- cron/lightweight behavior remains lightweight outside node execution.
- missing execution-coding bootstrap blocks preflight with a typed diagnostic.
- readback reports missing bootstrap as missing bootstrap, not generic missing_runtime_state.
- no node execution test accepts a worker model call before required bootstrap context exists.

2. Make Required Skills A Native OpenClaw Surface

Current failure class:
- skill use is prompt-advisory.
- The model is told to read a SKILL.md file, but nothing guarantees the skill is loaded, visible, or followed.
- A worker may never activate execution-node-workflow and then behave like a generic coding chat.
- Context and validation subagents may exist but not have their required operating instructions active.

Fix:
- Make required skills activate through one canonical OpenClaw-native mechanism.
- For this pass, required skills must be loaded through OpenClaw agent bootstrap as runtime-required context.
- Do not block this worker repair on a complete OpenCode-style general skill-tool rebuild if OpenClaw does not already have that tool surface.
- Final target remains native skill loading comparable to OpenCode's skill({ name }) behavior.
- If OpenClaw already has a native skill loading/tool surface, use it.
- If OpenClaw does not have one, implement a shared OpenClaw-native skill surface as a follow-up only if needed for broader OpenCode parity.
- Do not implement an Execution Platform-only skill loader.
- Do not keep parallel live paths such as:
  - maybe read SKILL.md with read
  - system-prompt preload
  - EP-specific skill injection
  - hand-written worker prompt process instructions duplicating the skill
- Required node skills must be active before first worker model turn.
- Required skills should be visible in diagnostics/readback as active session context.

Required behavior:
- execution-node-workflow is active for every execution-coding node run.
- execution-context-scout skill is active for execution-context-scout subagent sessions.
- execution-validation-scout skill is active for execution-validation-scout subagent sessions.
- the model does not need broad filesystem search to discover its own procedure.
- missing required skill is a typed preflight blocker.
- skill activation is one native path, not advisory text plus fallback.
- the generated worker prompt should not contain a large duplicate copy of generic workflow process already supplied by the active skill.

Typed blockers:
- node_agent_required_skill_missing
- node_agent_required_skill_not_loaded
- node_agent_skill_context_not_visible
- node_agent_skill_bootstrap_failed

Tests:
- required skill is loaded/active in effective node session context.
- missing required skill blocks before model invocation.
- no executable node proceeds with only advisory skill text.
- readback lists active required skill names.
- execution-coding cannot start if execution-node-workflow is absent.
- scout subagents cannot start without their own scout skills.
- generated prompt remains task-specific and does not bloat itself with full generic skill procedure.

3. Enable Native Subagent Binding For Node Sessions

Current failure class:
- execution-coding can be configured with scout subagents, but node session wiring can fail to expose subagent tools/binding.
- Kimi may do all searching/reading/testing itself instead of delegating fast search/validation loops to Qwen subagents.
- sessions_spawn/sessions_yield may not be visible, allowed, or bound to the configured child agents.
- Visible but unusable child tools/subagents create wasted calls and confusion.

Fix:
- Pass native OpenClaw subagent binding through the node session start path.
- Use OpenClaw-native sessions_spawn/sessions_yield/subagents/agents_list mechanics.
- Do not create EP-specific child-agent orchestration.
- Ensure allowed subagents are visible through the native tool description/catalog.
- Ensure disallowed subagents/tools are hidden or unavailable, not visible-but-rejected.
- Do not let NodeLifecycleRunner spawn ordinary context/validation scouts; the parent agent delegates within its session.
- Do not add a scheduler-owned scout phase.
- Parent execution-coding remains the node-local decision owner.

Allowed child agents for this path:
- execution-context-scout
- execution-validation-scout

Hard rule:
- execution-coding parent owns node decisions, edits, repair, and node_finish.
- scouts are delegated search/read/diagnosis helpers only.
- scouts never own node lifecycle.
- scouts never call node_finish.
- scouts do not edit files.
- scouts do not decide completion.
- parent resumes and synthesizes child output before patching or finishing.

Native tool visibility:
- sessions_spawn visible when allowed.
- sessions_yield visible/nonterminal when appropriate.
- agents_list/subagent catalog reflects allowed child agents.
- disallowed agents are not presented to the worker as possible choices.

Tests:
- execution-coding can spawn execution-context-scout.
- execution-coding can spawn execution-validation-scout.
- disallowed subagents are unavailable or hidden.
- sessions_yield is nonterminal.
- parent can resume after child completion.
- execution-context-scout cannot call node_finish.
- execution-validation-scout cannot call node_finish.
- child agents cannot edit unless explicitly allowed for a future role.
- missing native subagent binding blocks preflight instead of causing silent parent-only behavior.

4. Prove Child Results Enter Parent Context Before Parent Synthesis

Current risk:
- subagent spawn may succeed, but parent Kimi may not actually receive the child result in its active context.
- Child output may be stored as an artifact, session event, or detached transcript that the parent never sees.
- Parent may patch or finish before consuming the scout result.
- This recreates the "two brain" problem: Qwen finds useful context, but Kimi edits blind.

Fix:
- Prove the OpenClaw-native child completion/result path puts the child result into the parent session context before parent resumes synthesis.
- If the existing native subagent result flow announces somewhere outside the active parent context, wire the native parent-session delivery path correctly.
- Do not patch this with EP polling loops unless OpenClaw has no native equivalent.
- Do not store scout result only as a detached artifact.
- Parent's next model turn after child completion must include or be able to directly see the child result.
- Parent plan/todo should update after consuming child result.
- Parent should not patch/finish before reading required child result when the plan says child context is needed.

Success gate:
- parent session transcript shows child result.
- parent next turn can read/synthesize that result.
- parent does not edit or finish before consuming required child output.
- child output contains usable source/context, not just "see artifact ref."
- readback can show child completion and parent consumption status.

Tests:
- spawn context scout -> child completes -> parent context contains child output.
- parent updates plan after child output.
- parent patch/finish before unread child result is treated as invalid or blocked.
- readback distinguishes:
  - child spawned
  - child completed
  - child result delivered to parent
  - parent consumed child result
- child result delivery failure is typed, not generic worker failure.

5. Use Repo Root As CWD/Search Root, Native Permissions For External Access

Current failure class:
- making /root the default workspace/search root gives access but destroys search quality and causes truncation/false negatives.
- Broad /root grep/list searches waste tokens, hide repo hits under unrelated noise, and cause context overflow.
- Narrowing worker authority to scheduler-known refs is also wrong because workers must discover files dynamically.
- The right split is repo-root default search plus native permission/resource access for external OpenClaw docs/artifacts.

Fix:
- cwd/default project root for execution-coding must be:
  /root/services/openclaw-roles/live
- Native filesystem/external-directory permissions grant access to OpenClaw docs/artifacts outside the repo when explicitly needed.
- EP refs use openclaw_resource_read.
- Do not teach every tool a custom EP root taxonomy if OpenClaw native workspace + permission semantics can handle this.
- Do not make /root the default search universe.
- Do not use snapshot repo refs as a read/search whitelist for coding nodes.
- Do not block ordinary repo discovery because scheduler did not predict every file.
- Broad /root discovery should be rejected, warned, constrained, or require explicit intent.

Required behavior:
- grep/glob/list/read default to repo root for coding.
- broad /root grep/list is constrained.
- explicit OpenClaw docs/artifact access still works.
- repo search no longer produces broad root truncation false negatives.
- worker can still read/edit discovered repo files.
- worker can still read OpenClaw docs/artifacts when the prompt or tool refs require them.
- context scout also defaults repo search to repo root.
- validation scout also defaults validation commands to repo root.

Tests:
- first node repo search defaults to repo root.
- broad /root grep/list is constrained.
- explicit OpenClaw docs/artifact access still works.
- root-level truncation false-negative regression is covered.
- worker can read repo files not pre-listed in scheduler refs.
- worker can access required external OpenClaw docs/artifacts through native permission/resource path.
- no test requires /root as the default coding search root.

6. Keep Worker Prompt Model-Authored, Prose, And Low-Ceremony

Current failure class:
- artifact dumps and schema-heavy prompts produce weak worker behavior.
- deterministic prompt wrappers have repeatedly generated generic or incoherent work orders.
- The worker can receive requirements and refs but no coherent assignment.
- If the prompt reads like a research task or metadata dump, Kimi behaves randomly or broadly.
- If the prompt makes the agent inspect opaque refs before it understands the work, we reintroduce failure points.

Fix:
- The worker prompt should be a comprehensive model-authored prose instruction prompt.
- NodeLifecycleRunner owns prompt authoring as part of node-start preparation.
- Prompt authoring uses a plain model call that outputs prose only.
- The prompt writer has no tools, no lifecycle authority, and no persistent abstraction beyond the final prompt artifact.
- Do not give prompt authoring a tool surface.
- Do not make prompt authoring a staged tool workflow.
- Do not make prompt authoring JSON-shaped.
- Do not add heavy schema/gate requirements around prompt writing.
- Use a regular model call to transform available node/source material into one direct worker prompt.
- Keep deterministic checks skeletal only.
- The prompt should be primary. NodeExecutionSnapshot is provenance/expansion.
- If the agent must read the snapshot before understanding the task, the design has failed.

Prompt writer input:
- node objective
- assigned node requirements
- full original prompt body
- relevant original prompt excerpts
- all explicit file refs from the original prompt
- scheduler graph context needed to understand neighboring work
- requirement text and requirement roles
- constraints
- non-goals
- success gates
- validation expectations
- known refs
- source prompt context needed to infer search terms
- cwd/search root facts
- available subagent facts
- node_finish expectation

The prompt should include:
- node objective
- scoped assignment
- assigned requirement text
- relevant original prompt excerpts
- explicit file refs from the original prompt when relevant
- source prompt context needed to infer search terms
- constraints
- non-goals
- success gates
- validation expectations
- known refs
- first useful move
- blocker/escalation rules
- node_finish expectation
- a clear statement that the worker owns only this node's assigned requirements, not the entire original prompt
- enough source material to generate useful initial search terms without first opening opaque refs
- enough direct task framing that the worker knows whether it is implementing, validating, reviewing, or closing out

The prompt should not include:
- large generic process instructions already supplied by active skill
- raw JSON artifact dumps
- redundant metadata that does not help execution
- hidden assumptions that the agent must go inspect opaque refs before it understands the work
- every field from NodeExecutionSnapshot
- scheduler internals irrelevant to the worker
- repeated instructions that belong in execution-node-workflow
- huge unbounded original prompt dumps when bounded relevant excerpts plus explicit refs are sufficient

Skeletal checks only:
- non-empty
- objective present
- assigned requirements present
- constraints/non-goals present when available
- validation/finish rules present
- not JSON/artifact dump
- prompt artifact exists
- exact prompt submitted to worker equals persisted artifact

Tests:
- generated prompt artifact exists.
- exact prompt submitted to model is persisted.
- submitted prompt equals prompt artifact.
- readback can display the prompt.
- prompt is coherent prose.
- prompt is not JSON.
- prompt is not a raw artifact dump.
- prompt does not duplicate full generic skill procedure.
- prompt includes all explicit file refs from the original prompt when relevant.
- prompt clearly limits the worker to its assigned node scope.
- prompt gives enough initial signal to start repo search or delegate context scout.

7. Use Native Tool Registration, Not Invisible ExtraTools

Current failure class:
- node_finish/openclaw_resource_read can be injected late while diagnostics say they are unknown or unavailable.
- Tool visibility can disagree with tool availability.
- The model may see a tool in one path but inventory/preflight/readback says the tool is absent.
- Split tool truth causes false failures and debugging blind spots.

Fix:
- Register node_finish and openclaw_resource_read through the same native OpenClaw tool inventory/registration path used for other tools, or make extra tool registration visible to the same effective inventory before model start.
- Tool diagnostics must reflect runtime truth.
- Do not keep split tool truth where the model might have a tool but inventory says it does not.
- Unavailable tools must be hidden, not shown and rejected later.
- Missing required terminal/resource tools should block preflight before model invocation.
- The effective tool catalog seen by the model, preflight, and readback must agree.

Required worker-visible tools:
- file read/list/search through native OpenClaw surfaces
- edit/patch
- exec/test where allowed
- native plan/todo surface
- sessions_spawn / sessions_yield where allowed
- node_finish
- openclaw_resource_read if EP ref hydration is needed

Tests:
- node_finish appears in effective tool catalog.
- openclaw_resource_read appears in effective tool catalog.
- diagnostics do not report them unknown when available.
- missing terminal/resource tools block preflight.
- model-visible catalog and preflight catalog agree.
- disallowed tools are hidden or absent, not visible-but-denied.
- scout agents do not see node_finish.
- validation scout does not see edit tools if not allowed.

8. Native Todo/Plan Durability

Current risk:
- OpenCode has todowrite/todoread as an explicit coding-session control surface.
- OpenClaw update_plan may be enough, but only if it is visible and durable enough through compaction/resume.
- The Kimi worker currently lacks the visible running todo list behavior that Codex sessions naturally provide.
- Without a plan surface, the worker can drift, forget assigned requirements, or fail to coordinate scout/edit/validation loops.

Fix:
- Confirm whether update_plan is the canonical OpenClaw native plan/todo surface for coding agents.
- If yes, strengthen/verify it as session-native state.
- If a stronger native todo/task surface exists, use that.
- Do not create an Execution Platform todo ledger.
- Plan/todo state must be visible in readback and resilient enough across compaction/resume.
- The parent execution-coding agent should create a plan before broad work.
- The plan should update after scout output, edit decisions, validation results, repairs, and finish.
- Plan/todo state should be part of parent session state, not an EP sidecar abstraction.

Tests:
- first substantive worker turn creates native plan/todo.
- plan updates after scout, edit, validation, repair, and finish.
- plan survives or is reconstructed correctly after compaction/resume.
- readback shows plan progression.
- plan/todo events come from native OpenClaw session events.
- no EP-specific todo ledger is introduced.
- worker missing plan/todo when required is diagnosable.

9. Parent/Scout Dynamic Loop

Required behavior:
- no rigid context phase.
- no monolithic edit phase.
- no monolithic validation phase.
- context, edit, validation, and repair interleave dynamically.
- This should resemble the Codex/OpenCode loop: inspect enough context, edit narrowly, validate, discover more, repair, validate again.

Loop:
- parent reads coherent assignment.
- parent creates native plan/todo.
- parent inspects prompt/source context.
- if target mapping is weak, parent spawns Qwen context scout.
- scout returns inline windows.
- parent synthesizes scout output.
- parent edits or asks for more context.
- parent validates or spawns validation scout.
- failures trigger more search/read/edit/validate.
- parent can delegate repeatedly as new terms emerge.
- parent finishes with node_finish.

Delegation rule:
- Kimi directly reads only when it already has a precise path/window or a narrow known target.
- When mapping is weak, Kimi delegates to Qwen context scout before broad parent-side crawling.
- Qwen context scout is the normal fast path for search/read mapping.
- This is not rigid lifecycle phasing. It is an agent operating rule.
- The parent skill should state the hard default: if target files are not obvious after reading the worker prompt, spawn context scout before broad repo search.

Tests:
- weak target mapping leads to context scout delegation.
- precise known file allows direct parent read.
- parent can delegate repeatedly as new terms emerge.
- validation failure can trigger more context search.
- node_finish remains mandatory and terminal.
- parent does not broad-crawl the repo when scout delegation is the obvious first move.
- parent synthesizes scout output before editing.
- parent can search/edit/validate/repair in multiple cycles within one node session.
- no scheduler or NodeLifecycleRunner cognitive microphase is introduced for keyword/context acceptance.

10. Context Scout Must Return Real Source, Not Refs Only

Current failure class:
- abstractions and refs alone repeatedly fail.
- Parent needs real source text in active context.
- Bounded source refs, requirement ids, and artifact refs are useful navigation aids, but they are not enough for Kimi to edit correctly.
- If scout output is refs-only, Kimi still has to do the hard search/read work itself.

Fix:
- context scout result must include bounded inline context windows containing actual relevant source/test/config/doc excerpts.
- refs alone are insufficient unless parent explicitly asked only for refs.
- child output must be delivered into parent context before parent acts.
- The result shape should be prose with clear sections, not a large strict packet schema.
- Avoid big fixed object contracts if readable, structured prose is enough.
- Direct source material is the core product of the scout.

Scout output should include:
- direct answer
- bounded excerpts
- paths/line hints
- search trail
- next likely pivots
- search terms used and why
- high-signal refs
- likely edit points
- adjacent callers/imports/tests/configs
- misses
- risks/unknowns

Preferred shape:
- Direct answer
- Bounded excerpts
- Paths/line hints
- Search trail
- Next likely pivots
- Risks/unknowns

Do not require:
- large schema-heavy context packets
- opaque context ids without source text
- selected refs as the only useful output
- deterministic context sufficiency gates

Tests:
- context scout output contains bounded inline source excerpts.
- parent transcript includes child inline windows.
- parent acts on child inline context before patching/finishing.
- refs-only result is insufficient for edit-ready context.
- context scout output can be prose with sections, not strict JSON.
- readback can show scout result ref and compact status without duplicating full transcript.
- parent can request another scout pass when excerpts reveal new search terms.

11. Validation Scout As Native First-Class Subagent

Fix:
- validation scout must be a real OpenClaw subagent available to execution-coding.
- Use it for validation selection, failure diagnosis, proof scope, and repair context.
- Parent owns repair decisions and node_finish.
- Validation scout is a node-local helper, not a scheduler repair mechanism.
- Validation failure should cause local search/edit/validate repair inside the parent session when possible.
- Validation scout should not decide mission-level closeout or global review.

Validation scout output:
- validation question
- commands considered
- commands run
- exit status
- bounded output excerpts
- likely cause
- source/test refs
- repair context
- residual risk

Required behavior:
- parent can spawn validation scout after edit or when uncertain how to validate.
- validation scout can run/read validation evidence within permission bounds.
- validation scout cannot edit unless explicitly changed in a future role.
- validation scout cannot call node_finish.
- parent receives validation result in active context.
- parent synthesizes validation result before repair/finish.
- validation repair remains node-local, not scheduler-owned.

Tests:
- parent can spawn validation scout.
- validation scout cannot call node_finish.
- parent receives validation result in active context.
- parent synthesizes validation result before repair/finish.
- validation repair remains node-local, not scheduler-owned.
- validation scout command output is bounded.
- validation scout failure is typed and visible.
- parent can continue after validation scout result.

12. Agent Mode Taxonomy Aligned With OpenCode

OpenCode-style gap:
- agent modes are explicit: build, plan, general, explore/scout, review-like subagents.
- OpenClaw execution agents should reflect this instead of one overloaded worker identity.
- Current pass should not overbuild future agents, but should avoid architecture that prevents them.

Target taxonomy:
- execution-coding: build-like primary node owner for implementation nodes.
- execution-context-scout: explore-like read-only search/context agent.
- execution-validation-scout: read/exec validation diagnosis agent.
- future execution-review: high-reasoning review node agent.
- future execution-closeout: evidence/closure node agent.

This pass should implement/repair only what is required for:
- execution-coding
- execution-context-scout
- execution-validation-scout

This pass should not implement future review/closeout agents unless required by current tests. Keep config and contracts compatible with those future agents.

Tests/inventory:
- current execution-coding/context/validation modes are distinct in config and permissions.
- scout agents are not given edit/node_finish authority.
- implementation worker is not asked to perform review/closeout lifecycle as a substitute for future node roles.
- future review/closeout can be added without changing NodeLifecycleRunner ownership.
- no scheduler-owned workaround is introduced for missing future agents.

13. Code Intelligence / LSP Without Blocking Core Worker Fix

Fix:
- inspect existing OpenClaw LSP/code-intelligence support.
- If native LSP/code-intelligence tools are available, wire them into execution-coding and/or scouts.
- If LSP is absent/unstable, do not block the core worker loop.
- Do not create new LSP tools in this pass unless there is a trivial native OpenClaw surface.
- The failure being solved here is not lack of LSP. It is agent setup, prompt, skills, subagent handoff, cwd/search root, and optics.
- Code intelligence should improve quality, not become another dependency gate.

Useful operations if natively available:
- symbol search
- document symbols
- workspace symbols
- go to definition
- find references
- find callers
- diagnostics
- call hierarchy
- find tests

Required fallback:
- grep/glob/read/scout delegation remains functional.
- LSP absence is diagnostic, not fatal.
- Do not make LSP a required proof blocker for this pass.

Tests:
- context scout can use code-intelligence tools when available.
- LSP absence does not block worker execution.
- grep/glob/read fallback still works.
- no new EP-specific LSP transport is created unless explicitly justified by missing OpenClaw native surface.

14. Compaction And Overflow Handling

Current failure class:
- parent Kimi broad-crawled, read huge files, and overflowed context.
- Context overflow occurred after many tool messages without compacting useful state.
- Broad root search/read amplified context pressure.
- The parent can receive too much low-value output and lose the node objective.

Fix root causes:
- correct repo-root cwd/search root.
- delegate weak mapping to scout.
- bound large reads.
- do not feed broad tool-result sludge back into parent.
- preserve active node state during compaction.
- ensure scout returns bounded excerpts, not huge files.
- ensure parent tool use is narrow unless it has precise targets.
- use OpenClaw-native compaction/session management where available.

Compaction must preserve:
- node objective
- assigned requirements
- current plan
- known files
- child scout outputs
- changed files
- validation state
- unresolved blockers
- node_finish obligation
- relevant prompt excerpts
- current search trail/pivots

Tests:
- large parent read/search behavior is bounded.
- context overflow emits typed diagnostics.
- compaction preserves node execution state.
- compaction failure is typed and visible.
- broad repo/root search does not flood parent with unbounded output.
- child scout output remains bounded.
- parent resumes after compaction with objective/plan/finish obligation intact.

15. Runtime Optics Through Native OpenClaw Events

Current failure class:
- worker input/tool/skill/subagent visibility is weak.
- diagnostics appear too late or not at all.
- We cannot reliably tell what the worker prompt was, what tools were visible, whether skills were active, whether subagents were visible, or what the worker did.

Fix:
- use OpenClaw native session/tool events as truth.
- do not build a parallel EP event system.
- persist a compact node-agent preflight artifact before first model call.
- project native session facts into EP readback.
- readback should link to native session/tool artifacts instead of duplicating them.
- Store refs plus compact status, not a second transcript or tool log.
- Do not store raw transcripts, raw provider prompts, hidden reasoning, or unbounded command output in EP artifacts.

Preflight artifact should be compact:
- session identity
- node/run identity
- model/provider/reasoning
- cwd/search root
- loaded agent docs/required skills
- effective tool names
- allowed subagents
- prompt ref/hash
- blocker list if anything missing

Keep preflight strictly "can this agent run correctly?":
- prompt exists
- cwd is repo root
- required skill context active
- required tools visible
- required subagents visible
- node_finish visible
- OpenClaw session path exists

Avoid copying large derivable fields. Project from native OpenClaw inventory where possible.

Readback must distinguish:
- missing bootstrap
- missing skill
- missing tool
- missing subagent binding
- child result not delivered
- wrong search root
- weak/missing prompt
- context overflow
- node_finish missing
- scout result unread
- validation result unread
- tool catalog mismatch
- session path unwritable
- model/profile unresolved

Tests:
- preflight artifact exists before first model call.
- failure before model call has typed diagnostics.
- readback projects native facts without owning lifecycle.
- no generic missing_runtime_state when a typed worker issue exists.
- prompt ref/hash shown.
- active skills shown.
- effective tools shown.
- child session links shown.
- parent consumption of child output shown.
- readback stores refs/status, not duplicated transcripts/logs.

16. Native Permission Model

Fix:
- use OpenClaw native tool permission/allowlist system for execution-coding and scouts.
- Do not maintain a second EP authority gate for normal repo discovery.
- NodeLifecycleRunner may define lifecycle authority and snapshot provenance.
- OpenClaw tool permissions govern file/tool access.
- Repo root should be the worktree.
- OpenClaw docs/artifacts should be allowed via native external-directory/resource access.
- Denied tools/subagents should be hidden from model descriptions, matching OpenCode behavior.
- Do not show Kimi tools it cannot use.

Permissions:
- execution-coding:
  - read
  - search/list/glob/grep through native path
  - edit/apply_patch
  - exec/test
  - update_plan or native todo
  - sessions_spawn
  - sessions_yield
  - openclaw_resource_read
  - node_finish
- execution-context-scout:
  - read/search only
  - no edit
  - no node_finish
- execution-validation-scout:
  - read/search/exec for validation
  - no edit
  - no node_finish
- future review/closeout agents:
  - their own permission modes later

Tests:
- execution-coding has required tools.
- context scout is read/search only.
- validation scout is read/exec only.
- subagents cannot finish nodes.
- parent can finish nodes.
- denied tools/subagents are hidden or absent.
- permission failures are typed and visible.
- no EP-specific permission overlay blocks normal repo discovery.

17. Keep Scheduler And Node Lifecycle Boundaries Clean

Do not let this pass reintroduce scheduler ownership of node-local work.

Scheduler owns:
- graph structure
- node ordering
- validation/review/closeout node placement
- dependencies

NodeLifecycleRunner owns:
- node start
- snapshot
- prompt authoring ownership as node-start material
- terminal acceptance
- evidence/lifecycle projection
- escalation projection

OpenClaw agent owns:
- local execution cognition and tool loop

Do not add scheduler repair paths for:
- worker context search
- worker edit failure
- worker validation failure
- worker subagent failure
- missing worker prompt context after node start
- keyword generation
- context sufficiency
- scout result interpretation
- local validation repair

These must resolve inside node session or finish with typed blocker/escalation.

Do not add NodeLifecycleRunner cognitive microphases for:
- keyword plan accepted
- context scout accepted
- source window accepted
- edit readiness accepted
- validation repair plan accepted

NodeLifecycleRunner can accept terminal node outcome and evidence. It does not micromanage the agent's internal loop.

Tests:
- scheduler does not repair node-local worker failures.
- node-local failures return through node_finish or typed node blocker.
- no scheduler path reopens context/materialization gates.
- readback remains projection only.
- no reason-code lifecycle inference is added.

18. Retire Stale Worker-Path Code And Zombie Tests

Inventory and remove or quarantine:
- EP-specific worker tool loops competing with OpenClaw native tools.
- JSON-shaped worker tools in executable node path.
- optional skill-read expectations as the only activation path.
- old context_decision/context phase compatibility vocabulary in live worker path.
- tests expecting parent broad-search instead of subagent delegation.
- tests accepting refs-only scout output when edit-ready context is needed.
- tests accepting missing node_finish/openclaw_resource_read diagnostics.
- tests accepting context dumps as worker prompts.
- tests requiring scheduler repair of node-local context/edit/validation failure.
- replay-only fake worker paths.
- non-agent worker harness assumptions.
- stale prompt/task-brief tests.
- stale proofs that expect no native subagent behavior.
- stale tests that make skill activation advisory-only.
- stale tests that accept visible-but-unavailable tools.

Do not delete unrelated non-worker Execution Platform responsibilities from shared files unless proven unused.

Deletion rule:
- If old code is live and competes with the native OpenClaw agent path, remove it.
- If old code is only historical documentation, leave it only when clearly marked historical.
- If old tests would force the old architecture back into place, delete or rewrite them.
- Do not keep compatibility paths "just in case."

Tests/inventory:
- production executable node path imports no old worker harness.
- no live path uses JSON-shaped worker tool calls.
- no live path requires context_decision compatibility.
- no live path accepts refs-only scout output as edit-ready.
- no live path launches a worker without active skills.
- no live path completes without node_finish.
- inventory gate fails for retired live worker terms where feasible.

19. Focused Proof Scope

Do not run broad live proof unless requested.

After implementation, run focused Execution Platform tests proving:
- native execution-coding bootstrap
- required skill activation before first model turn
- child result delivery into parent context
- prompt persistence/submission
- repo-root search behavior
- scout inline context handoff
- validation scout availability
- node_finish inventory/mandatory completion
- readback diagnostics
- compaction state preservation if touched
- no old worker path in production executable-node execution

Focused proof sequence:
1. prompt-authoring narrow proof:
   - use real scheduler/node artifacts
   - generate worker prompt
   - inspect quality
   - prove artifact equals submitted prompt

2. node preflight proof:
   - verify cwd repo root
   - verify required skills active
   - verify required tools visible
   - verify required subagents visible
   - verify node_finish visible
   - verify OpenClaw session path writable

3. subagent handoff proof:
   - parent spawns execution-context-scout
   - scout returns bounded source excerpts
   - parent sees scout result in active context
   - parent updates plan after scout result

4. validation scout proof:
   - parent spawns execution-validation-scout
   - validation scout returns bounded validation evidence
   - parent sees validation result
   - parent can repair or finish based on result

5. worker loop proof:
   - Kimi receives coherent prompt
   - Kimi creates plan/todo
   - Kimi delegates scout when mapping is weak
   - Kimi synthesizes source excerpts
   - Kimi edits
   - Kimi validates
   - Kimi repairs if needed
   - Kimi calls node_finish

Do not run:
- broad repo test suites outside Execution Platform scope
- broad live proof unless explicitly requested
- full product proof until focused node execution proofs show the worker path is healthy

At the end, produce an itemized report from fresh code review, not memory.

For each item above:
- complete / partial / not complete
- files changed
- tests changed
- verification command and result
- remaining caveats
- why anything remains incomplete

Explicitly answer:
- Does execution-coding now run as a real OpenClaw-native agent?
- Are identity/docs/required skills active before the first model turn?
- Is skill activation one native path, not advisory text plus fallback?
- Is the worker prompt coherent prose, not an artifact dump?
- Is prompt authoring owned by NodeLifecycleRunner as node-start preparation?
- Does Kimi get enough input to start correctly?
- Does Kimi default to repo-root search instead of /root?
- Can Kimi spawn Qwen context scout?
- Does scout output put real code blocks into Kimi context?
- Is child output visible to Kimi before parent resumes synthesis?
- Does Kimi update a native plan/todo?
- Can Kimi spawn validation scout?
- Is node_finish present, known to inventory, and mandatory?
- Are hidden/unavailable tools actually hidden from the model?
- Are tool/session optics strong enough to diagnose next failure without guessing?
- Did readback remain a projection rather than a lifecycle owner?
- Did we avoid building a parallel EP agent/skill/subagent framework?
- Did we delete stale tests/proofs that would preserve the old worker path?
- Did we avoid broad live proof unless explicitly requested?

Final architectural assessment to preserve during implementation:
- fewer EP-specific constructs
- prompt as direct worker instruction
- skill/bootstrap as OpenClaw agent runtime
- subagents as native OpenClaw sessions
- readback as projection only
- NodeLifecycleRunner owns lifecycle only, not agent behavior
- execution-coding owns local cognition
- Qwen scouts accelerate search/validation without becoming lifecycle owners
- real source material reaches the deciding model
- no compatibility worker harness survives on the live executable-node path

The biggest implementation risk is overbuilding diagnostics or proof machinery until it becomes a parallel worker harness. Bias hard toward removing EP glue and letting OpenClaw's agent runtime be the agent runtime.
```
