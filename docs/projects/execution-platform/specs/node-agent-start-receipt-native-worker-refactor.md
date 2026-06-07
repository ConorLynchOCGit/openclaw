# Node Agent Start Receipt Native Worker Refactor

Status: proposed
Date: 2026-06-06

This spec records the worker-node refactor proposal verbatim for the next
Execution Platform implementation pass.

## Updated Full Proposal

Goal: make executable node work start as a real OpenClaw-native coding-agent session, not as "Kimi plus tools plus a long prompt."

Architectural boundary:

- `NodeLifecycleRunner` owns start permission, prompt artifact selection, node snapshot, compact start receipt, and terminal `node_finish` acceptance.
- OpenClaw owns agent docs/bootstrap, active skills, tools, permissions, subagents, sessions, compaction, tool policy, and event trace.
- `execution-coding` Kimi owns local cognition: plan, scout delegation, synthesis, edit, validation, repair, and finish.
- Execution Platform must not recreate a worker harness, skill loader, tool registry, todo ledger, transcript system, crawler limiter, or subagent orchestration layer.

1. **Use One Compact `NodeAgentStartReceipt`**

   Collapse start contract/preflight/readback fragments into one compact runtime receipt.

   This should be a NodeLifecycleRunner event/receipt, not a new planning abstraction and not a copied config universe.

   It answers one operational question before model invocation: can this node agent start correctly?

   Required checks:
   - coherent worker prompt exists;
   - exact prompt artifact/hash is available;
   - exact submitted prompt will equal that artifact;
   - cwd/search root is `/root/services/openclaw-roles/live`;
   - Kimi model profile is selected for `execution-coding`;
   - Kimi reasoning/thinking is set to the highest supported setting for this node path;
   - `execution-node-workflow` is active, not merely catalog-visible;
   - `node_finish` is visible in the effective tool inventory;
   - `openclaw_resource_read` is visible;
   - `sessions_spawn`, `sessions_yield`, `update_plan`, and normal repo read/search/edit/validation tools are visible as appropriate;
   - allowed subagents include `execution-context-scout` and `execution-validation-scout`;
   - node snapshot/ref is available;
   - session path/lock is writable enough to start.

   Minimal durable shape:
   - `nodeRunId`
   - `sessionKey`
   - `promptRef`
   - `promptHash`
   - `submittedPromptHash`
   - `cwd`
   - `modelProvider`
   - `modelId`
   - `reasoningLevel`
   - `thinkingLevel`
   - `activeSkillNames`
   - `effectiveToolNames`
   - `allowedSubagentIds`
   - `snapshotRef`
   - `openClawSessionRef`
   - `openClawSystemPromptReportRef`
   - `openClawEffectiveToolInventoryRef`
   - `status`
   - `blockers`

   Store refs/hashes and small arrays of names only. Do not duplicate full prompt, tool schemas, bootstrap text, skill text, transcripts, child output, or provider logs.

2. **Enforce Kimi Highest Reasoning At Agent Profile Resolution**

   `execution-coding` Kimi must run with the highest supported reasoning/thinking setting on executable implementation nodes.

   Enforce this at OpenClaw agent profile/model resolution, not as an ad hoc worker-caller patch.

   Required behavior:
   - receipt records actual resolved model/provider and reasoning/thinking settings;
   - start blocks before model invocation if the resolved implementation-node profile is below the required level;
   - replay and live worker paths use the same profile resolution;
   - context/validation scouts can remain fast/low-reasoning Qwen agents.

   This prevents accidental low-reasoning worker runs while preserving Qwen speed for delegated mapping/validation.

3. **Required Skill Activation As One OpenClaw Active Block**

   `execution-node-workflow` must be loaded into active session context before Kimi's first turn.

   Use OpenClaw's existing bootstrap/system-prompt assembly and active-skill rendering. Do not create an Execution Platform skill loader.

   Required behavior:
   - required node skill body is present as one named active block;
   - active block participates in normal bootstrap/context truncation accounting;
   - Kimi does not need to discover/read the skill as the first fragile step;
   - if the skill body cannot be loaded, is missing, or is truncated beyond usefulness, start blocks before model invocation;
   - catalog-only skill visibility is insufficient for mandatory node procedure.

   Avoid duplicating `AGENTS.md`, `TOOLS.md`, and `SKILL.md` instructions into multiple parallel prompt sections. One active-skill source of truth.

4. **Keep Prompt And Skill Responsibilities Separate**

   The worker prompt says what this node must accomplish. The skill says how `execution-coding` operates.

   Prompt should include:
   - node objective;
   - assigned scope;
   - requirements/source material;
   - concrete success gates;
   - non-goals;
   - validation expectations;
   - terminal `node_finish` contract.

   Prompt should not duplicate the full workflow skill. As active skill loading becomes reliable, prune process boilerplate from prompts and keep only node-specific operating reminders.

5. **One Effective Native Tool Inventory**

   `node_finish` and `openclaw_resource_read` must be registered through the same OpenClaw-native tool inventory path as the other tools.

   Remove the invisible tool-truth split where lifecycle/resource tools are late `extraTools` while diagnostics/tool catalogs come from another path.

   Required behavior:
   - effective tool inventory shown in start receipt is the same tool set passed to the provider;
   - `node_finish` appears as a normal native tool;
   - `openclaw_resource_read` appears as a normal native tool;
   - missing terminal/resource tools block start;
   - no diagnostics say a tool is unknown when the model can actually call it, or vice versa.

6. **First-Turn Node Contract**

   The active skill plus prompt must make the first worker moves unambiguous:
   - use active `execution-node-workflow`;
   - create/update native `update_plan`;
   - hydrate node snapshot/source refs with `openclaw_resource_read`;
   - delegate weak repo mapping to `execution-context-scout`;
   - call `sessions_yield` when waiting for scout output;
   - synthesize child output before editing, validation, or finish;
   - terminalize with `node_finish`.

   This is not a rigid phase machine. It is the entry contract for the dynamic Codex-like loop.

7. **Native Parent Crawl Guard Without Recreating Phases**

   Add a generic OpenClaw node-agent tool-policy/profile guard that discourages broad parent-side crawling before scout delegation.

   Avoid an EP-only "Kimi crawler limiter."

   The guard must not say "call scout before any search." It should only block broad parent-side mapping when the parent has no precise file/window.

   Behavior:
   - precise parent reads are allowed when a path/window is already known;
   - direct reads of explicit prompt-provided files are allowed;
   - direct reads of scout-returned windows are allowed;
   - broad parent `grep`/`glob`/many reads before scout delegation produce a corrective diagnostic or blocking tool result;
   - after scout delegation, parent reads can use precise windows from child output;
   - the guard detects broad mapping behavior from tool shape, not brittle counts:
     - wide path;
     - generic query;
     - no precise file target;
     - repeated exploratory reads;
     - no prior scout result;
   - the guard lives in OpenClaw tool policy, not scheduler or EP worker logic.

8. **Native Subagent Result Delivery Proof**

   Prove that `execution-context-scout` output enters the parent Kimi session context before Kimi resumes synthesis.

   Required proof:
   - parent calls `sessions_spawn`;
   - parent calls `sessions_yield`;
   - child session runs under `execution-context-scout`;
   - child output includes bounded inline source/test/config windows;
   - child result appears as a first-class parent session message/event;
   - parent next turn references or synthesizes child result before editing or finishing.

   If `sessions_yield`/native session delivery does not already guarantee this, fix the native OpenClaw session delivery path. Do not add EP polling loops unless OpenClaw has no native equivalent.

9. **Context Scout Output Must Contain Real Source**

   The scout must return real bounded source material, not refs only.

   Required scout output style:
   - direct answer;
   - bounded inline excerpts;
   - paths/line hints;
   - search trail;
   - likely edit points;
   - adjacent tests/config/callers where relevant;
   - next likely pivots;
   - risks/unknowns.

   Do not force a heavy schema packet if clear prose sections are enough. The requirement is real source in parent context, not object ceremony.

10. **Scout Agents Need Active Skills Too**

`execution-context-scout` and `execution-validation-scout` need their own active skill instructions, not only AGENTS.md advisory text.

Required behavior:

- context scout active skill is loaded before scout first turn;
- validation scout active skill is loaded before scout first turn;
- scout skills are concise and mode-specific;
- scout skills do not duplicate parent implementation instructions;
- missing scout skill blocks or makes that scout unavailable before Kimi sees it as callable.

11. **Validation Scout As Native First-Class Subagent**

`execution-validation-scout` should be available to Kimi for validation command selection, failure diagnosis, proof scope, and repair context.

Parent Kimi owns repair and `node_finish`.

Validation scout should not edit and must not call `node_finish`.

12. **OpenCode-Style Agent Mode Separation**

Preserve explicit mode separation:

- `execution-coding`: parent, edits, decisions, finish;
- `execution-context-scout`: search/read only, returns inline source;
- `execution-validation-scout`: read/exec only, diagnoses validation;
- future review/closeout agents stay separate.

Unavailable tools/subagents should be hidden from each mode.

Context scout should not receive edit tools. Validation scout should not receive edit or `node_finish`. Parent receives edit/finish authority.

13. **Tool/Permission Hiding**

If a tool/subagent is denied, absent, or blocked by policy, remove it from the effective catalog instead of showing it and letting calls fail later.

This follows the OpenCode-style lesson: visible-but-unusable tools waste turns and confuse the model.

14. **Replace Prompt Override Acceptance With Production Node-Start Path**

The canonical prompt artifact is useful for development, but acceptance should not depend on a replay-only prompt override lane.

Required behavior:

- NodeLifecycleRunner selects or creates the prompt artifact;
- submitted prompt equals selected artifact;
- start receipt records both prompt hash and submitted prompt hash;
- prompt override may remain only as a development diagnostic path, not the acceptance proof path.

15. **Real Edit Proof Fixture**

The next proof lane must require a concrete edit.

Do not rely on a task where existing code/tests can pass and the model can choose evidence-only closeout.

Use an isolated native-node edit fixture where one small assertion is missing. This fixture should prove the worker loop, not Product/Spec correctness.

The proof must demonstrate:

- Kimi enters node mode;
- Kimi runs at highest reasoning;
- Kimi delegates initial mapping to Qwen scout;
- scout returns real source windows;
- Kimi edits;
- Kimi validates narrowly;
- Kimi can repair if validation fails;
- Kimi calls `node_finish`.

Do not bake Product/Spec-specific edge-case logic into production code.

16. **Worker Optics As Native Projections**

Persist compact optics from OpenClaw-native session facts. Do not build a second transcript or telemetry universe.

Required optics:

- exact prompt artifact/hash;
- exact submitted prompt/hash;
- model/provider/reasoning/thinking;
- active bootstrap/docs/skill refs and truncation status;
- effective tool names;
- allowed subagents;
- per-tool call trace refs;
- child session trace refs;
- child result delivery marker;
- parent synthesis marker;
- terminal reason.

Store refs/hashes/compact facts. Avoid copying full prompts, full transcripts, full tool logs, full child outputs, or provider logs unless they already exist as OpenClaw artifacts.

17. **Readback As Projection Only**

Readback should project:

- NodeLifecycleRunner state;
- `NodeAgentStartReceipt`;
- OpenClaw session events;
- effective tool inventory;
- child session/result delivery;
- `node_finish` artifact;
- terminal status/blocker.

It should not infer lifecycle from reason-code bags or become a lifecycle owner.

18. **Compaction Must Preserve Node State**

Use OpenClaw compaction, but make sure node sessions preserve the minimum state needed to continue:

- node objective;
- assigned requirements;
- active plan;
- known files;
- child scout outputs;
- changed files;
- validation state;
- unresolved blockers;
- `node_finish` obligation.

Context overflow should produce typed diagnostics. It should not silently erase node obligations or child results.

19. **Retire Non-Representative Worker Paths**

Delete or quarantine worker replay/test paths that start Kimi without:

- active required skill context;
- highest-reasoning Kimi profile;
- unified effective tool inventory;
- visible context/validation scouts;
- prompt persistence/submission equality;
- `node_finish` enforcement;
- native session event optics.

Do not preserve zombie tests that validate the old "generic model with JSON/task packet" worker shape.

20. **Focused Proof Scope**

Next proof should use the production node-start path and the recorded canonical prompt artifact as the selected prompt material:

`.artifacts/execution-platform/kimi-worker-loop-test/product-spec-plugin-gates-node-prompt.md`

But the proof acceptance is not "does this prompt sound good." It is:

- start receipt proves active skill/tool/subagent readiness;
- start receipt proves Kimi highest reasoning;
- Kimi starts in node mode;
- Kimi uses `update_plan`;
- Kimi hydrates relevant refs;
- Kimi delegates to `execution-context-scout` before broad parent crawl;
- child result with real source enters parent context;
- Kimi edits a real fixture gap;
- Kimi validates;
- Kimi calls `node_finish`;
- readback shows all of this without guessing.

21. **What Not To Build**

Do not add:

- EP skill loader;
- EP todo ledger;
- EP subagent orchestrator;
- EP transcript system;
- EP crawler limiter separate from OpenClaw tool policy;
- separate start contract plus preflight objects;
- separate prompt-readback/tool-readback/skill-readback artifacts;
- schema-heavy scout packets;
- prompt-quality gates beyond skeletal start checks;
- Product/Spec-specific runtime shortcuts;
- compatibility worker loops.

**Bottom Line**

The architecture should make it impossible for executable nodes to start as generic Kimi repo-crawling sessions. A node run should enter OpenClaw as `execution-coding` with highest-reasoning Kimi, active workflow skill, unified native tools, visible scouts with their own active skills, native plan state, correct repo root, real source handoff, and mandatory terminal `node_finish`.
