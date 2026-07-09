---
summary: "Active work spec for closing Codex-native Coding handoff, workbench behavior, helper-team adoption, and the successor American Atomics proof."
title: "OpenClaw Codex-Native Handoff Workbench Behavior Closure"
---

# OpenClaw Codex-Native Handoff Workbench Behavior Closure

Status: active

Supersedes for the active pass:

- [OpenClaw Codex App-Server Workbench Capability Parity](/projects/execution-platform/specs/openclaw-codex-app-server-workbench-capability-parity)

Retains as context:

- [OpenClaw Transcript Message Export For Codex-Native Coding Handoff](/projects/execution-platform/specs/openclaw-transcript-message-export-codex-handoff)
- [OpenClaw Maximal Codex-Native Coding Team Closure](/projects/execution-platform/specs/openclaw-maximal-codex-native-coding-team-closure)
- [OpenClaw Maximal Codex-Native Coding Runtime](/projects/execution-platform/specs/openclaw-maximal-codex-native-coding-runtime)

## Current Diagnosis

The Codex harness now starts, MCP can be attached, and Codex subagents can spawn,
but the actual execution contract still does not reliably make the Codex thread
behave like the intended Codex workbench.

The latest American Atomics run exposed a narrower and deeper failure class:

- Main had the full 29,791 char prompt, but Coding received a 7,844 char
  rewritten task.
- Coding launched through the Codex harness, but actual behavior remained mostly
  serial shell inspection.
- The `openclaw_repo_workbench` MCP was attached but unused.
- Native `multi_tool_use.parallel` behavior was not proven.
- Codex children could spawn, but delegation was late/light and children also
  used shell-heavy inspection.
- OpenClaw readback reported OpenClaw tool visibility and Codex tool visibility
  through different surfaces, which made `promptContext.tools.count: 0` look
  like Coding had no tools even though Codex tools were present.
- Codex child identity was mirrored too thinly.
- Build/promote proved infrastructure health, not actual Codex behavior.
- The proof prompt and Business Ops content lived across path surfaces that
  require explicit runtime-visible file discipline.

The deepest correction is not another runner, resolver, presenter, artifact
diagnostic, parser gate, or OpenClaw-side surrogate workbench. The correction is
to stop assuming that configured/visible capabilities are used correctly, and to
make the handoff and Codex workbench behavior line up with the substrate's
native path.

## Updated Proposal: Codex-Native Coding Handoff And Workbench Closure

### Objective

Make Main-routed Coding behave like a native Codex coding workbench while
keeping OpenClaw outside Coding as router, launcher, observer, mirror, and
receipt layer.

The target architecture is:

```text
Main
-> task(agentId:"coding")
-> OpenClaw child session / lineage / receipt wrapper
-> existing OpenClaw Codex harness
-> Codex app-server execution thread
-> Codex-native workbench and custom agents
-> OpenClaw mirrored readback
-> Main receipt
```

OpenClaw does not become Coding's workbench. Coding's actual work happens inside
the Codex execution thread.

### Core Principle

Stop treating "available + instructed" as "used correctly."

For every critical behavior, distinguish:

- Configured: the tool, agent, path, or file exists.
- Visible: the model and operator can see it clearly.
- Preferred: the local role contract makes it the natural choice.
- Observed: raw events prove it was actually used.
- Valuable: it improved output, latency, quality, or confidence.

Startup capability reports prove substrate only. Actual Codex rollout events
prove behavior.

These states are proof/report concepts only. Do not add durable runtime fields
such as `toolUseRequired`, `mcpUsed`, `planComplete`, `artifactValid`,
`qualityPassed`, `delegationCompliant`, or `behaviorProofStatus`.

## Architecture Rules

Use:

- existing OpenClaw `task(agentId:"coding")` routing;
- existing OpenClaw Codex harness/provider path;
- Codex app-server native execution threads;
- runtime-visible file artifacts for substantial handoff content;
- Codex-native read/edit/exec/apply_patch behavior;
- Codex custom agents where the task merits delegation;
- plugin-bundled, read-only Codex MCP tools for batched repo inspection where
  available;
- OpenClaw session/task/readback as observation and receipt surfaces only;
- raw Codex events for proof evidence;
- GBrain only as upstream context or downstream pointer memory, not Coding
  runtime truth.

Do not add or revive:

- presenter;
- runner;
- alternate launcher;
- artifact diagnostic or artifact control layer;
- parser gate;
- fake `multi_tool_use.parallel`;
- OpenClaw dynamic tools inside Coding;
- OpenClaw `sessions_spawn`, `sessions_yield`, `task`, or `sessions_history`
  inside Coding;
- OpenClaw-side calls to Codex `fs/*`, `command/*`, or MCP tools as a surrogate
  workbench;
- Firecrawl inside Coding;
- resolver layer;
- Run Insights replacement;
- durable `inputRefs` schema unless existing file/ref surfaces prove
  insufficient;
- `validation_run_many` in the current repo workbench MCP pass;
- source-tree sync/copy workflow;
- broad filesystem topology migration in this pass.

Allowed proof/readback data:

- runtime-visible source file path;
- artifact chars/digest;
- Codex thread id;
- plugin refs;
- attached MCP server names;
- loaded custom agent names;
- observed tool-call counts;
- observed Codex child roles/objectives/statuses;
- final refs;
- proof report classification.

## 1. Main Handoff Must Transfer Artifacts, Not Rewrite Them

Failure:

Main compiled and submitted the full American Atomics prompt, but the Coding
task payload was materially shorter. Main still acted as semantic handoff
author.

Deep diagnosis:

Handoff text is not artifact transfer. A model parent cannot be trusted to
preserve artifact scope while "helpfully" creating a task packet. If Coding must
operate from a full artifact, the artifact must be passed as a stable file/ref
or exact attached content, not re-authored by Main.

Deep fix:

Use runtime-visible files for substantial implementation packets.

Required behavior:

- Main passes a short route note plus exact runtime-visible file path, chars,
  and digest.
- Main does not include a summary as the operative scope.
- Coding's first step is to read the full file, report observed chars/digest,
  and treat that file as the scope authority.
- If Coding cannot read the file, it must report blocked rather than continue
  from Main's summary.
- Main returns a receipt after Coding completes. Main does not rewrite Coding's
  artifact.

Acceptance:

- Coding receives the exact file path and reads the full file.
- Coding's closeout records input file path, observed chars, and digest.
- Coding output scope matches the file, not a compressed task summary.
- No new `inputRefs` product schema is introduced unless existing file/ref
  surfaces cannot carry this.

## 2. Main Cross-Agent Context Footgun

Failure:

Main first used `context:"fork"` for a cross-agent Coding spawn, then retried
with `context:"isolated"`.

Deep diagnosis:

The task affordance still exposes a footgun. Cross-agent context is a runtime
contract, but the model can choose the wrong value.

Deep fix:

Make cross-agent Coding handoff mechanically isolated through the task/tool
contract or prompt compiler. Context should come from explicit files/refs, not
forked session state.

Acceptance:

- Main-routed `agentId:"coding"` tasks use isolated context.
- A focused test covers cross-agent Coding task construction.
- No fallback path silently starts Coding with forked context.

## 3. Runtime-Visible Proof Inputs

Failure:

The proof content was easy to reference through source/root paths even when the
live agent needed runtime-visible workspace paths.

Deep diagnosis:

Proof inputs are not reproducible if they live only as host/source-path
artifacts. Runtime agents must see ordinary workspace files.

Deep fix:

Proof prompts and implementation packets must be available under the live
runtime workspace path:

```text
/home/node/.openclaw/workspace/docs/projects/execution-platform/prompts/...
```

Model-facing instructions should use workspace-relative paths:

```text
docs/projects/execution-platform/prompts/...
```

They should not use:

- `/root/services/...`
- `/srv/openclaw-next/...`

Acceptance:

- Proof prompt exists as a runtime-visible workspace file before launch.
- The Main prompt uses workspace-relative path and digest/chars.
- Coding reads the file directly.
- No global remount, symlink, or source-topology migration occurs in this pass.

## 4. Capability Availability Is Not Capability Use

Failure:

The Codex workbench MCP was attached, but the rollout showed no
`repo_search_many`, `repo_read_many`, `repo_glob_many`, or `git_inspect_many`
calls.

Deep diagnosis:

MCP presence is not behavior. Shell has gravity. Codex defaults and local docs
still make `rg`, `sed`, `git diff`, and shell inspection the easiest path. A new
MCP added as optional guidance will lose to the familiar path unless it becomes
the natural habit for the right work.

Deep fix:

Make batched repo workbench use the preferred habit for independent repo
inspection, while preserving normal shell use for one-off commands.

Required behavior:

- Coding and relevant Codex child-agent docs say:
  - use `repo_search_many` for multiple independent searches;
  - use `repo_read_many` for multiple independent file/range reads;
  - use `repo_glob_many` for multiple pattern checks;
  - use `git_inspect_many` for status/diff/changed-file inspection;
  - use shell for precise one-off commands, validation commands, and cases
    where the MCP is unavailable or unsuitable.
- Coding closeout records whether the workbench was available and whether it was
  used or skipped.
- Skips are allowed, but must be explicit when the task involved broad repo
  inspection.

Acceptance:

- Raw Codex events show MCP use in a proof that requires broad independent repo
  inspection, or the closeout records a real unavailability reason.
- The system does not add `mcpUsed` or `toolUseRequired` runtime fields.

## 5. Repo Workbench MCP Scope

Failure:

The repo workbench MCP was implemented for read/search/git inspection but did
not cover all prior throughput ambitions.

Deep diagnosis:

The most dangerous expansion is turning the repo workbench into a validation
runner. Codex already has command execution. A validation batch tool is likely
to become a hidden runner/choke if added prematurely.

Deep fix:

Keep the MCP read-only for this pass:

- `repo_search_many`
- `repo_read_many`
- `repo_glob_many`
- `git_inspect_many`

Reject for this pass:

- `validation_run_many`

Acceptance:

- MCP exposes only read/search/glob/git inspection tools.
- It enforces repo-root confinement, caps, and timeouts.
- It does not edit, patch, run arbitrary shell commands, route, retry, validate
  completion, or control execution.

## 6. Native Parallel Tool Calls

Failure:

Native `multi_tool_use.parallel` behavior was not proven. Raw rollout showed
sequential command events.

Deep diagnosis:

`multi_tool_use.parallel` is a model/harness batching convention, not a normal
MCP tool. Cloning the name is not the capability. The capability requires model
conditioning, provider/API support, and a harness/tool broker that expands
parallel calls.

Deep fix:

Use native proof order:

1. Inspect generated app-server schema and model/provider capability reporting.
2. Run a tiny harness-launched turn asking for independent reads/searches.
3. Inspect raw events for multiple concrete tool calls from one model step or
   provider-level parallel tool-call evidence.
4. If present, wire native settings and prompt style.
5. If absent, do not fake it. Use Codex subagents for task-level parallelism and
   repo workbench MCP for batched repo inspection.

Acceptance:

- Proof report says `nativeParallelToolCalls: proven` or
  `nativeParallelToolCalls: not_proven`.
- No fake `multi_tool_use.parallel` MCP exists.
- If native parallel is not proven, the proof uses batched MCP and helper agents
  as the available throughput path.

## 7. Delegation Must Be Early When Scope Merits It

Failure:

Coding spawned `project_explorer` and `code_reviewer`, but only lightly and
after substantial parent inspection. Children also used shell-heavy inspection.

Deep diagnosis:

Delegation is available but not structurally early. The parent still treats
helpers as optional late review rather than a first planning choice for broad
tasks.

Deep fix:

Add an early Codex team-shape decision to Coding and child-agent instructions.

Rules:

- For broad implementation tasks touching multiple surfaces, Coding should
  decide before broad parent inspection whether to use:
  - `project_explorer`;
  - `docs_researcher`;
  - `codex_reviewer`;
  - `code_reviewer`;
  - other configured helpers if materially distinct.
- Delegation is not forced for trivial tasks.
- Parallel implementers are allowed if the task calls for it, but not multiple
  duplicate agents executing the same prompt blindly.
- Helper outputs should be consumed as implementation context packs; parent
  Coding should not redo broad helper inspection unless the helper is
  inadequate.

Acceptance:

- In a broad proof, helper delegation occurs before most parent inspection, or
  Coding records a defensible reason for solo execution.
- Raw events show `collabAgentToolCall` when the task merits helper delegation.
- Closeout records helper use/skips and parent reuse of helper context.

## 8. Codex Child Identity Readback

Failure:

OpenClaw readback showed Codex children too thinly. Operator inspection required
raw rollout archaeology to identify role/objective/final.

Deep diagnosis:

OpenClaw is observing Codex native children, but it is not mirroring enough
identity to make the child work understandable.

Deep fix:

Mirror Codex child threads into session detail as readback evidence only.

Fields:

- child thread id;
- role/name;
- objective;
- status;
- final ref if available;
- source: `codex-native`.

Do not add management state, scheduler controls, or quality verdict fields.

Acceptance:

- `sessions show` for Coding exposes Codex-native child role/objective/status.
- Raw rollout remains the evidence source for deep inspection.
- Readback does not route, retry, score, or enforce child behavior.

## 9. Separate OpenClaw Tool Plane From Codex Workbench Plane

Failure:

`promptContext.tools.count: 0` was technically correct for OpenClaw dynamic
tools, but misleading because Codex tools were present and active.

Deep diagnosis:

The readback surface collapses two tool planes:

- OpenClaw dynamic tools visible to OpenClaw agents;
- Codex-native tools visible inside the Codex execution thread.

Deep fix:

Report them separately.

Readback shape:

- `openclawDynamicTools`:
  - enabled/disabled;
  - count;
  - names.
- `codexNativeWorkbench`:
  - thread id;
  - code mode/config presence;
  - attached MCP servers;
  - custom agents;
  - observed item types;
  - native parallel status.

Acceptance:

- Operator can tell that OpenClaw tools are disabled while Codex tools are
  active.
- No OpenClaw dynamic tool is exposed inside Coding.
- No OpenClaw-side app-server method calls are used as a surrogate Coding
  workbench.

## 10. Startup Capability Versus Behavior Proof

Failure:

Startup capability report showed expected surfaces, but the run still behaved
as shell-heavy and did not use the workbench.

Deep diagnosis:

Startup reports prove configured/visible only. They do not prove preferred,
observed, or valuable.

Deep fix:

Add proof report sections that classify behavior using raw event evidence:

- configured;
- visible;
- preferred;
- observed;
- valuable.

This is proof/report language only.

Acceptance:

- Proof report cites raw event evidence for MCP calls, helper calls, command
  calls, patch calls, and final output.
- No durable product schema or runtime control state is added.

## 11. Coding Scope And Closeout Language

Failure:

Coding completed a bounded slice and said "slice complete," while the broader
proof still had unproven helper/parallel/workbench requirements.

Deep diagnosis:

Coding closeout speaks for implementation scope, not full proof acceptance.
Main receipts preserve child artifacts, but grading must remain external.

Deep fix:

Coding closeout must use precise completion labels:

- full requested implementation complete;
- bounded slice complete;
- partial implementation;
- validation not run;
- reviewer blocked;
- proof pending;
- deferred work.

Acceptance:

- Coding does not describe a docs/templates/config slice as public production
  readiness.
- Coding final says what was completed and what remains.
- Main receipt does not flatten blocked/reviewer failures.

## 12. Product Validation Versus Runtime Behavior Validation

Failure:

The product docs slice was materially useful, but runtime behavior requirements
were not satisfied.

Deep diagnosis:

Product output and agent-behavior proof are different proof classes.
Build/promote validates infrastructure. Product review validates content.
Raw rollout validates Codex behavior.

Deep fix:

Grade proof in separate lanes:

- Main routing/receipt;
- handoff artifact fidelity;
- Codex harness launch;
- Codex workbench attachment;
- Codex workbench adoption;
- helper-team adoption;
- child readback;
- implementation completeness;
- product quality;
- boundary preservation;
- cost/runtime efficiency;
- workspace closeout.

Acceptance:

- A good product output can still fail workbench behavior.
- A good harness launch can still fail product output.
- Grading does not collapse these into one "pass."

## 13. Workspace Closeout

Failure:

Proof work produced useful docs changes, root-owned artifacts, and dirty
workspace state without immediate closeout.

Deep diagnosis:

Proof mutation is not inherently wrong, but it must end in an explicit state.

Deep fix:

Every mutating proof ends with one of:

- committed;
- reverted;
- left pending with named owner/status.

Artifact capture should be service-user written where possible or root-local and
normalized before build. Do not repair ownership mid-promotion.

Acceptance:

- Source repo and home repo state are explicitly reported after proof.
- Dirty state is not ambiguous.
- Proof artifacts are bounded evidence, not raw transcript dumps.

## 14. Source Topology Constraint For This Pass

Failure:

Prior attempts caused source-tree and filesystem cascades by treating active
trees as interchangeable.

Deep diagnosis:

The deeper source-topology decision is not proven enough for drive-by changes.

Deep fix for this pass:

- Do not symlink, delete, remount, or permission-change
  `/root/services/openclaw-roles/live`.
- Do not make `/srv` canonical by fiat.
- Do not copy/sync whole files between source trees.
- Use the currently active build source only where the controller already uses
  it.
- Keep proof inputs as runtime-visible workspace files.
- Record source-topology audit as a separate follow-up after the Codex harness
  proof.

Acceptance:

- No global filesystem topology migration occurs in this pass.
- Proof can run from runtime-visible files without a topology migration.

## New Proof Prompt

The active successor proof prompt is:

[American Atomics Content Production Predicates Workbench Proof](/projects/execution-platform/prompts/american-atomics-content-production-predicates-workbench-proof-20260709)

Source path:

```text
docs/projects/execution-platform/prompts/american-atomics-content-production-predicates-workbench-proof-20260709.md
```

Runtime-facing path for Main/Coding:

```text
docs/projects/execution-platform/prompts/american-atomics-content-production-predicates-workbench-proof-20260709.md
```

This prompt is built from the unexhausted pieces of the preserved 29k Planning
artifact:

- source claim library;
- audience/channel map;
- content brief;
- content variant lab;
- creative direction brief;
- design asset request sheet;
- content review route;
- measurement baseline;
- production-readiness predicate register.

The prompt deliberately does not re-ask for the already-created first-leg files:

- asset-intake ledger;
- brand-intelligence foundation;
- distinctive brand assets;
- approval-safe content foundation.

Those files are treated as existing inputs to extend and cross-link.

## How The New Prompt Tests This Work

The new prompt tests the updated architecture directly:

1. Handoff fidelity:
   - Main must route with a runtime-visible file path.
   - Coding must read the full prompt file and report observed chars/digest.
   - Coding must not operate from Main's summary.

2. Workbench adoption:
   - The task requires broad multi-file/template inspection.
   - Coding should use `openclaw_repo_workbench` MCP tools when attached.
   - If the MCP is unavailable or unsuitable, Coding must say exactly why.

3. Helper-team adoption:
   - The task is broad enough to merit `project_explorer` and
     `codex_reviewer`/`code_reviewer`.
   - Coding should use helpers early or record a real unavailability reason.

4. Product completeness:
   - The work requires nine reusable templates and nine American Atomics
     instantiations.
   - Completion cannot be satisfied by existence-only verification.

5. Boundary preservation:
   - The package remains internal docs/templates/config only.
   - No public copy, official brand assets, legal policy, approved claims,
     external writes, or accepted-truth GBrain writeback.

6. Readback visibility:
   - Proof grading must capture raw Codex events, MCP calls, helper calls, final
     refs, and child identity readback.

## Execution Order

1. Ensure the new proof prompt exists in the runtime-visible workspace before
   launch.
2. Patch Main/Coding handoff guidance so substantial Coding packets are passed
   as file path plus chars/digest, not task prose.
3. Ensure Main-routed Coding uses isolated context.
4. Update Coding and Codex custom-agent instructions so broad independent
   inspection prefers repo workbench MCP.
5. Keep repo workbench MCP read-only for this pass.
6. Ensure all intended Codex custom agents have aligned TOML/config/docs.
7. Add separate OpenClaw dynamic tool and Codex-native workbench readback.
8. Mirror Codex child role/objective/status/final-ref fields.
9. Add proof/report behavior classification from raw events.
10. Add focused tests for handoff path rendering and Coding prompt composition.
11. Add focused tests for tool-plane readback and Codex child readback.
12. Add a tiny native parallel raw-event probe and report proven/not-proven.
13. Build/promote only after focused checks pass.
14. Submit the new American Atomics predicate proof through normal Main gateway.
15. Grade every proof lane separately.
16. Close workspace state as committed, reverted, or pending.
17. Only after proof result is recorded, run the separate source-topology audit
    and recommend permanent topology.

## Required Tests And Checks

Focused checks before live proof:

- handoff compiler/path rendering:
  - host absolute paths are rejected from live-agent handoff text;
  - workspace-relative prompt paths are emitted;
  - chars/digest are included for substantial prompt files.
- Main cross-agent Coding task uses isolated context.
- Coding prompt contains no OpenClaw `sessions_spawn`, `sessions_yield`,
  `task`, or `sessions_history` inner-team guidance.
- Coding prompt includes Codex-native helper guidance.
- Coding prompt includes workbench preference for multi-search/multi-read/git
  inspection.
- Repo workbench MCP exposes only:
  - `repo_search_many`;
  - `repo_read_many`;
  - `repo_glob_many`;
  - `git_inspect_many`.
- No `validation_run_many` exists in this pass.
- Tool-plane readback separates OpenClaw dynamic tools from Codex native
  workbench.
- Codex child readback includes role/objective/status/final ref.
- Proof prompt exists at the runtime-visible path.

Live proof evidence to capture:

- Main submitted prompt and final receipt.
- Coding final artifact.
- Coding trajectory.
- Codex rollout JSONL for parent.
- Codex rollout JSONL for children.
- Thread-scoped capability report.
- MCP server status for active thread.
- Raw `mcpToolCall` evidence or explicit absence.
- Raw `collabAgentToolCall` evidence or explicit absence.
- Final diff.
- Validation output.
- Reviewer output.
- Workspace closeout state.

## Proof Grading

Grade each vector independently:

- Main routing and receipt.
- Full prompt/file handoff.
- Coding full-file consumption.
- Codex harness launch.
- Codex workbench attachment.
- Codex workbench adoption.
- Native parallel status.
- Helper-team adoption.
- Codex child readback.
- Product implementation completeness.
- Product quality.
- Scope/boundary preservation.
- Validation evidence.
- Review evidence.
- Cost/runtime efficiency.
- Workspace closeout.
- Absence of forbidden control surfaces.

## Pass Standard

This pass succeeds only if:

- Main does not compress or rewrite the proof prompt.
- Coding reads the runtime-visible prompt file directly.
- Coding implements the requested predicate package, not existence-only checks.
- Coding uses repo workbench MCP for broad independent inspection when attached,
  or records a real unavailability/suitability reason.
- Coding uses Codex helpers early when the task merits it, or records a real
  unavailability/suitability reason.
- OpenClaw readback separates OpenClaw tool plane from Codex workbench plane.
- OpenClaw readback exposes Codex child role/objective/status/final refs.
- Raw events support the proof claims.
- Coding closeout uses precise completion language.
- Product output remains internal/candidate/unapproved.
- No new runner, launcher, presenter, artifact diagnostic, parser gate, OpenClaw
  workbench bridge, fake parallel tool, or quality/completion state schema is
  introduced.

## Explicit Deferred Items

Deferred to the next pass unless the proof proves they are immediately
blocking:

- Permanent source-topology migration.
- `validation_run_many`.
- Global MCP required mode.
- Build/promote latency optimization.
- Broader plugin marketplace/install workflow.
- GBrain accepted writeback.
- Public content generation.
- Official design/brand asset generation.
