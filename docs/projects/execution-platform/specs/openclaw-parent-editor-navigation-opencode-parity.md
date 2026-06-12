---
summary: "Proposal to reconcile execution-coding parent editor navigation with OpenCode's Read/Grep/Glob and Task handoff pattern."
title: "OpenClaw Parent Editor Navigation OpenCode Parity"
---

# OpenClaw Parent Editor Navigation OpenCode Parity

## Completion Tracking

| Item                           | Status   | Completion note                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Correct parent policy       | Complete | `execution-coding` native-task parent catalog now includes bounded `read`, `grep`, and `glob` while still excluding `list`, `exec`, process tools, raw shell, broad artifacts, fuzzy discovery, managed-output browsing, scheduler internals, and lifecycle internals.                                                                                                                                                                                                                                                                       |
| 2. Parent grep                 | Complete | Parent `grep` now allows exact symbol/phrase search in known files or directories, including directory-scoped searches, while rejecting runtime state and outside-workspace paths.                                                                                                                                                                                                                                                                                                                                                           |
| 3. Parent read                 | Complete | Parent `read` now permits omitted offset/limit and applies a small bounded default window while preserving the max-window guard and runtime/outside-workspace rejection.                                                                                                                                                                                                                                                                                                                                                                     |
| 4. Parent glob                 | Complete | Parent `glob` is provider-visible for bounded filename/pattern lookup and is blocked from runtime state or outside-workspace paths.                                                                                                                                                                                                                                                                                                                                                                                                          |
| 5. Scout role                  | Complete | Context scout skill and canonical docs now define scouts as mechanical evidence providers for open-ended mapping, not edit-sufficiency judges or edit-perfect packet chokepoints.                                                                                                                                                                                                                                                                                                                                                            |
| 6. Kimi skill wording          | Complete | Kimi skill and canonical docs now match the OpenCode-style split: Task for complex/open-ended exploration; bounded Read/Grep/Glob for exact local editor navigation; edit once enough source is visible for the next safe edit.                                                                                                                                                                                                                                                                                                              |
| 7. Working context ledger      | Complete | Native working context now persists parent `read`/`grep`/`glob` navigation as `search_result` entries alongside scout search/read context, file graph, change sets, and validation state.                                                                                                                                                                                                                                                                                                                                                    |
| 8. Unified bounded tool output | Complete | All provider-visible tool-result messages now route through the central `tool-result-truncation` guard, which uses the shared live max-char resolver and persists full oversized output to native managed tool-output storage before capping transcript-visible text. Parent navigation, repo discovery, EOF/missing-path read handling, `exec` managed-output previews, process output refs, and task child-result `full/projected/rejected` delivery remain locally shaped for model usability but are also protected by the shared guard. |
| 9. System reminder hints       | Complete | Parent Read/Grep/Glob, context scout read/grep, task result handoff, task failure handoff, and exec managed-output messages now provide OpenCode-style parent/scout guidance without storing prompt-control wording as durable event semantics.                                                                                                                                                                                                                                                                                              |
| 10. Validation scout           | Partial  | Validation scout skill/docs already prefer native search/read and bounded validation output. Remaining parity depends on the all-tool bounded-output path and the next validation proof.                                                                                                                                                                                                                                                                                                                                                     |
| 11. Permissions and catalog    | Complete | Catalog-first filtering preserves explicit child identity, scout restrictions, parent finish authority, and the new bounded parent navigation surface.                                                                                                                                                                                                                                                                                                                                                                                       |
| 12. Stale run terminalization  | Complete | Replay live/latest state now records `processPid`; startup can terminalize stale `running` state when the stored process is gone, and the explicit clear-only path terminalized the prior no-pid stale proof as `aborted` with shared plus run-scoped terminal artifacts.                                                                                                                                                                                                                                                                    |

## Focused Validation

Current focused validation for completed items:

- `pnpm test:file src/agents/pi-tools.node-authority-overlay.test.ts`
- `pnpm test:file src/agents/pi-tools-agent-config.test.ts`
- `pnpm test:file src/agents/pi-embedded-subscribe.handlers.tools.test.ts`
- `node --check scripts/execution-platform-run-product-spec-boundary-replay.mjs`
- `node scripts/execution-platform-run-product-spec-boundary-replay.mjs --runtime-job-id job-kimi-worker-prompt-only-20260608T041518Z --clear-stale-live-state-only --terminalize-legacy-stale-live-state`
- `pnpm test:file src/agents/session-tool-result-guard.test.ts`
- `pnpm test:file src/agents/pi-embedded-runner/tool-result-truncation.test.ts`
- `pnpm test:file src/agents/pi-embedded-subscribe.handlers.tools.test.ts`
- `pnpm test:file src/agents/tools/native-task-tool.test.ts`
- `pnpm test:file src/agents/bash-tools.exec-foreground-failures.test.ts`
- `node scripts/execution-platform-run-product-spec-boundary-replay.mjs --runtime-job-id job-kimi-worker-prompt-only-20260608T041518Z --execute-workers --boundary after-graph-selection --max-parallel-node-executions 1 --max-iterations 1 --target-node-id node-kimi-worker-product-spec-native-policy-proof --reset-node-to-planned node-kimi-worker-product-spec-native-policy-proof --worker-prompt-file .artifacts/execution-platform/kimi-worker-loop-test/work-queue-frontier-delta-stream-node-prompt.md --proof-run-id product-spec-boundary-replay-parent-editor-nav-opencode-parity-<timestamp>`

## Proposal

**Goal**

Reconcile OpenClaw worker behavior with the OpenCode editing loop:

- Kimi remains the editor/owner.
- Scouts remain useful for open-ended mapping and validation support.
- Kimi gets enough bounded direct navigation to make edits without depending on perfect scout packets.
- Tool output is bounded everywhere.
- OpenClaw-native working context remains the persistence layer, not a new deterministic choke.

**1. Correct The Parent Policy**

Replace:

> Kimi has no acquisition tools.

With:

> Kimi has no broad crawling tools. Kimi does have bounded editor-navigation tools.

Kimi should receive:

- `read`
- `grep`
- `glob`
- `task`
- `update_plan`
- one mutation surface, usually `edit`
- `openclaw_resource_read` for exact refs only
- `node_finish`

Kimi should still not receive:

- `exec`
- process tools
- raw shell
- broad artifact discovery
- fuzzy resource search
- managed-output browsing
- lifecycle/scheduler internals

This matches OpenCode’s model: parent editor can use `Read/Grep/Glob` for narrow lookup; subagents handle complex/open-ended work.

**2. Parent Grep**

Allow directory-scoped grep for exact symbols/phrases.

Current failure mode:

- Kimi tried `grep` on `extensions/execution-platform/src/work-queue`.
- We blocked it because it was a directory.
- OpenCode would allow this and cap the result.

Required behavior:

- `grep(query, path)` accepts file or directory paths.
- `path` may be a known directory from prompt, scout result, working context, file graph, or previous tool result.
- Results are capped, OpenCode-style, around 100 matches.
- Output includes file paths, line numbers, matching lines, total count, truncated flag, and narrowing hint.
- If results are broad, return bounded results plus a reminder to narrow or delegate to scout.
- Do not hard-fail directory grep just because the path is a directory.
- Still reject runtime state, secrets, `.openclaw/runtime`, `node_modules`, `.git`, generated caches, and outside-workspace paths unless explicitly diagnostic.

**3. Parent Read**

Allow parent read without explicit `offset` and `limit`.

Required behavior:

- `read(path)` returns a bounded default window.
- Output is line-numbered.
- Output includes:
  - path
  - type
  - returned line range
  - total lines when known
  - whether truncated
  - next valid offset
  - EOF message
  - valid offset range when offset is beyond EOF
- Missing path errors include “Did you mean” suggestions from nearby files.
- Lines over a max length are truncated.
- Byte cap remains enforced.
- Max window remains bounded; large reads are not full-file dumps.
- Parent may use `read` for known files and exact local context, not repo exploration.

Prefer OpenCode behavior here: helpful bounded output beats blocked tool calls.

**4. Parent Glob**

Restore/add parent `glob` for filename lookup.

Required behavior:

- Capped results, around 100 paths.
- Optional path scope.
- Clear truncation message: “showing first N; use a more specific path or pattern.”
- Use for filename/pattern lookup.
- Do not use for repeated open-ended exploration; that remains scout territory.
- Exclude state/runtime/generated directories by default.

This gives Kimi a normal editor affordance without restoring broad crawling.

**5. Scout Role**

Keep scouts, but reduce pressure on scout output.

Scouts should own:

- open-ended mapping
- caller/test discovery
- architecture ambiguity
- broad subsystem exploration
- validation context support
- source windows that are genuinely useful to hand back

Scouts should not be required to produce a perfect edit packet every time.

Context scout output should remain useful:

- direct answer
- paths
- search terms
- bounded source windows
- file graph when multiple files matter
- misses
- risks
- exact follow-up suggestions

But this should be a quality target, not a hard schema choke.

Kimi can repair small gaps using direct `Read/Grep/Glob`.

**6. Kimi Skill Wording**

Simplify toward OpenCode:

- Use `task` for complex/open-ended exploration.
- Use `grep` for specific symbols/phrases.
- Use `glob` for filename lookup.
- Use `read` when a file path is known.
- Edit once enough source is visible for the next safe edit.
- Do not wait for complete node-wide certainty before making a minimal useful edit.
- Do not chain scouts for exact lookup that parent tools can resolve.

Remove or soften wording that pushes Kimi into:

- “ensure all context before editing”
- repeated scout repairs
- rigid one-lookup state machines
- treating missing line windows as automatic blocker

**7. Working Context Ledger**

Keep the unified OpenClaw-native working context, but make it assistive.

Persist compact entries from:

- scout source windows
- parent `read` windows
- parent `grep` hits
- parent `glob` results
- file graph
- mutation change sets
- validation state

Do not create separate ledgers.

Working context should help after compaction, but source truth remains current files and native tool outputs.

**8. Unified Bounded Tool Output**

All tools must route through one native bounded-output/truncation path.

Applies to:

- `read`
- `grep`
- `glob`
- `list`
- `exec`
- validation command output
- task result projection
- plugin/MCP-style tools if present

Required behavior:

- model-visible output capped by lines and bytes
- full oversized output stored in managed tool-output storage
- output includes managed-output ref/path only as runtime metadata
- parent/scout gets a clear instruction for how to inspect bounded sections
- no child session should produce hundreds of KB of parent-relevant transcript material

This copies OpenCode’s central truncation model.

**9. System Reminder Hints**

Use `<system-reminder>`-style guidance, not hard deterministic gates.

Examples:

After broad/truncated grep:

```text
<system-reminder>
This grep result is broad. Narrow with a more specific symbol/path or delegate open-ended exploration to execution-context-scout.
</system-reminder>
```

After task result:

```text
<system-reminder>
Use direct Read/Grep/Glob for exact local lookup. Use Task only for open-ended exploration. If enough source is visible, edit now.
</system-reminder>
```

After managed output:

```text
<system-reminder>
Do not read the full managed output into context. Use Grep/Read with bounded windows or delegate focused inspection.
</system-reminder>
```

Do not persist this wording as event semantics.

**10. Validation Scout**

Keep validation exec delegated.

Validation scout gets:

- `read`
- `grep`
- `glob`
- `list`
- `exec`

Validation scout should:

- use native search/read tools for file inspection
- avoid shell for `grep`, `cat`, `find`, `sed`, etc. when native tools work
- choose focused validation commands
- bound stdout/stderr
- store full logs in managed output
- return compact validation state
- diagnose failures from source/test windows

Kimi owns repair and `node_finish`.

**11. Permissions And Catalog**

Preserve what is already aligned with OpenCode:

- explicit child identity
- filtered task catalog
- child sessions inherit relevant parent/session denies
- scouts cannot edit/write/finish
- scouts cannot mutate parent todo
- validation scout has exec; context scout does not
- Kimi has lifecycle finish; scouts do not

Do not reintroduce gateway/task fallback paths for worker delegation.

**12. Stale Run Terminalization**

Before the next proof:

- clear or terminalize the killed run’s stale live-state
- mark externally killed proof as `cancelled` or `aborted`
- write a bounded terminal artifact even on SIGTERM/SIGINT
- make replay startup detect missing process + stale `running` state and reset safely

This is proof hygiene, but it matters because stale state pollutes diagnosis.

**Success Gates**

Next proof should show:

- Kimi launches with correct prompt/bootstrap/skill.
- Context scout launches with correct model and thinking.
- Scout result reaches parent.
- Kimi can use parent directory-scoped grep for exact terms.
- Kimi can use parent read without explicit offset/limit and receives bounded line-numbered output.
- Kimi can use parent glob for filename lookup.
- Tool outputs stay bounded; no 400KB scout transcript class.
- Kimi edits after scout plus bounded local navigation.
- Mutation emits compact change set into working context.
- Validation scout runs focused validation with bounded output.
- Kimi repairs or finishes with `node_finish`.
- Killed/stopped proof runs terminalize cleanly.

**Implementation Order**

1. Terminalize/clear stale killed-run state.
2. Patch parent `grep` policy to allow directory-scoped exact search with caps.
3. Patch parent `read` policy to allow bounded default reads and metadata.
4. Add/restore parent `glob`.
5. Route all tool outputs through unified bounded/truncation service.
6. Simplify Kimi and scout skill wording toward OpenCode’s tool-use split.
7. Ensure working context records parent navigation entries, not only scout packets.
8. Run focused tests for read/grep/glob/tool-output behavior.
9. Rerun the Work Queue delta Kimi proof.
