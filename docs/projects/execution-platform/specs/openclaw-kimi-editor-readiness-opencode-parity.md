---
summary: "Proposal for aligning Kimi parent editor navigation and edit-readiness with OpenCode-grade parent tool affordances."
title: "OpenClaw Kimi Editor Readiness OpenCode Parity"
---

# OpenClaw Kimi Editor Readiness OpenCode Parity

## Implementation Tracking

| Item                                                      | Status                      | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Make Parent Grep OpenCode-Grade                        | Complete                    | `src/agents/tools/repo-discovery-tools.ts` now treats grep queries as regex by default, supports `regex:false` literal fallback, preserves stateRoot/runtime exclusion, keeps capped results, groups output by path with line numbers, and returns invalid-regex retry guidance. Focused test passed: `pnpm test:file src/agents/tools/repo-discovery-tools.test.ts`.                                                                                                            |
| 2. Make Parent Read Less Loop-Inducing                    | Complete                    | `src/agents/pi-tools.ts` now lets execution-coding parent reads default to up to 2000 lines while preserving the native byte cap and runtime/path guards; `docs/agents/registry.yaml` sets execution-coding `readDefaultLineLimit: 2000` and `readMaxBytes: 51200`, while scout defaults remain smaller. Focused tests passed: `pnpm test:file src/agents/pi-tools.node-authority-overlay.test.ts` and `pnpm test:file src/agents/agent-pack-registry.test.ts`.                  |
| 3. Fix Kimi Prompt Baseline                               | Complete                    | `.artifacts/execution-platform/kimi-worker-loop-test/work-queue-frontier-delta-stream-node-prompt.md` now lists bounded parent `read`, `grep`, and `glob` for exact editor navigation and describes the concrete read cap/byte-cap behavior.                                                                                                                                                                                                                                     |
| 4. Tighten Kimi Edit-Readiness                            | Complete                    | `skills/execution-node-workflow/SKILL.md`, `docs/agents/execution-coding/runtime/AGENTS.md`, `docs/agents/execution-coding/runtime/BOOTSTRAP.md`, `docs/agents/execution-coding/Startup.md`, and the proof prompt now instruct Kimi to edit when it can name target files, patch shape, and validation intent, and to avoid repeated source recovery for the same target.                                                                                                        |
| 5. Use Stronger `<system-reminder>` Hints, Not Hard Gates | Complete                    | `src/agents/tools/native-task-tool.ts` now emits parent-visible `<system-reminder>` guidance for context/validation task results and failures without adding durable event semantics or a hard post-task gate. Focused test passed: `pnpm test:file src/agents/tools/native-task-tool.test.ts`.                                                                                                                                                                                  |
| 6. Make Edit More Prominent                               | Complete                    | `src/agents/pi-tools.ts` appends execution-node parent edit guidance to the native mutation tool description: read before editing, match exact line-numbered source content without prefixes, prefer existing files, add surrounding context for non-unique old strings, and edit once target file/patch shape are clear. Focused test passed: `pnpm test:file src/agents/pi-tools.node-authority-overlay.test.ts`.                                                              |
| 7. Do Not Add A Heavy Exploration Skill Yet               | Complete / tightened        | No new required parent exploration skill was added. Execution node roles now use native agent docs and tool descriptions as the active operating contract; `execution-node-workflow`, `execution-context-scout`, and `execution-validation-scout` remain optional reference skills only and are not required bootstrap context for these workers.                                                                                                                                |
| 8. Relax Scout Perfection Requirement                     | Complete                    | `skills/execution-context-scout/SKILL.md` and matching context-scout docs keep the scout contract mechanical: windows, file graph, misses, missing windows, and useful evidence only; the scout must not decide edit readiness or make the packet edit-perfect by over-reading.                                                                                                                                                                                                  |
| 9. Retire Edit-Anchor Handoff                             | Complete pending live proof | The edit-anchor experiment is retired because it created another possible reason for Kimi to defer editing. Active docs, optional execution skills, native `task` text, context-scout tool reminders, and the Work Queue proof prompt now ask for line-numbered source windows, file graph, missing windows, and likely edit points paired with actual excerpts. Kimi should edit when target files and patch shape are nameable; it should not wait for a special anchor field. |
| 10. Enforce Active Todo For Node Sessions                 | Complete pending live proof | `src/agents/tools/update-plan-tool.ts` now supports a `requireInProgress` mode, and `src/agents/openclaw-tools.ts` enables it only for `agent:execution-coding:node:*` sessions. Node-bound Kimi can no longer submit an all-pending or all-completed plan while work is active; ordinary update_plan use remains unchanged. Verified with `src/agents/tools/update-plan-tool.test.ts` and `src/agents/openclaw-tools.update-plan.test.ts`.                                      |
| Other OpenCode Gaps To Close                              | Complete                    | Task descriptions now explicitly discourage subagents for specific file/class/small-file lookup; parent `read`/`grep`/`glob` are described as normal bounded editor tools; todo remains a planning habit rather than a post-task state machine; tool reminders are guidance, not deterministic chokes; the proof prompt is more action-oriented around exact local lookup, edit, validation, and finish.                                                                         |
| Failure Points We Created                                 | Mitigated                   | Literal grep false negatives, too-small parent read windows, “narrow once more” deferral wording, prompt/catalog mismatch, and scout-perfection dependency were addressed in the tool code, skills, canonical docs, and proof prompt listed above.                                                                                                                                                                                                                               |

Expanded Proposal
The core correction is: Kimi should not be a crawler, but it must be a normal editor. OpenCode works because the parent editor has reliable bounded navigation tools and
uses subagents for complex exploration, not for every missing line.

1. Make Parent Grep OpenCode-Grade

- Treat grep input as regex by default, matching OpenCode’s pattern behavior.
- Keep our OpenClaw names if useful; do not rename just for parity.
- Allow file and directory scope when the query is concrete.
- Cap output at a fixed bounded match count, grouped by path with line numbers.
- Add clear invalid-regex fallback guidance: retry literal or escape pattern.
- Preserve stateRoot/runtime exclusions.
- Stop false negatives like describe\\(|it\\( returning no matches.

OpenCode reference: Grep is regex-native, scoped by path/include, and capped at 100 results:
https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/tool/grep.ts

2. Make Parent Read Less Loop-Inducing

- Keep bounded output, line numbers, total lines, next offset, EOF metadata, and missing-path suggestions.
- Add OpenCode-style guidance: use grep for specific content, avoid tiny repeated slices, read a larger bounded window when local context is needed.
- For Kimi parent, allow explicit larger bounded windows when editing needs surrounding context. Too-small windows cause sequential reads.
- Keep scout defaults smaller than parent defaults; scout should not dump source, but Kimi needs enough to edit.

OpenCode reference: Read supports bounded reads, offsets, total line reporting, missing-path suggestions, and reminders:
https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/tool/read.ts

3. Fix Kimi Prompt Baseline

- The prompt baseline must list bounded read, grep, and glob, not only read.
- Remove any wording that implies Kimi should avoid normal exact editor navigation.
- Keep the real boundary: no broad crawling, no runtime-state browsing, no shell search, no source acquisition as a primary role.

4. Tighten Kimi Edit-Readiness

- After scout result plus one local lookup episode, Kimi must choose:
  - edit now;
  - one named missing token/window lookup;
  - finish blocked;
  - move to a genuinely distinct todo/symbol.

- If Kimi can name target files, the patch shape, and validation intent, the next action should be edit.
- Remove “keep gathering context” style language unless tied to a specific missing symbol/window.

5. Use Stronger <system-reminder> Hints, Not Hard Gates

- Keep task result events clean.
- Put guidance in parent-visible tool output.
- Current footer gives “narrow once more” too much weight.
- Replace with something closer to:

  <system-reminder>
  If you can name the target files and patch shape, edit now. Use read/grep/glob only for one named missing token or source window. Do not continue source recovery for the
  same edit target.
  </system-reminder>

6. Make Edit More Prominent

- Update parent edit tool description to mirror OpenCode:
  - read before editing;
  - use exact strings from line-numbered output;
  - prefer editing existing files;
  - if oldString is not unique, use more surrounding context;
  - after enough local source is visible, use edit.

- Ensure edit appears near read/grep/glob in the provider catalog if ordering is controllable.

OpenCode reference: https://github.com/anomalyco/opencode/blob/dev/packages/opencode/src/tool/edit.txt

7. Do Not Add A Heavy Exploration Skill Yet

- OpenCode does not solve this with a separate exploration skill for the parent.
- A new required skill adds bootstrap weight and another failure surface.
- If we add anything, make it tiny and tool-triggered: “editor-navigation/edit-readiness reminder.”
- Prefer fixing tool affordances, prompt wording, and task footer first.

8. Relax Scout Perfection Requirement

- Scout should return useful mechanical evidence: windows, file graph, missing windows, likely edit points.
- It does not need to produce a perfect edit packet.
- Kimi must be able to patch from good-enough scout output plus direct bounded navigation.
- Keep improving scout output, but do not make it a chokepoint.

Other OpenCode Gaps To Close

- Task description should more explicitly discourage subagents for specific file/class/small-file lookup, as OpenCode does.
- Parent grep/read/glob should be normal editor tools, not psychologically framed as exception paths.
- Todo should remain a habit, not a post-task state machine.
- Tool reminders should help, not create a deterministic choke.
- Parent prompt should be shorter and more action-oriented: understand, search/read locally when exact, edit, validate.

Failure Points We Created

- Over-strict parent/scout split made Kimi dependent on near-perfect scout output.
- Literal grep default caused false negatives and extra reads.
- “Narrow once more” footer wording gave Kimi a safe deferral path.
- Prompt baseline contradicted actual tool catalog by omitting grep/glob.
- Read limits may be too small for editor context, causing source-window churn.

Final Shape
Kimi is an editor with bounded navigation. Scouts handle open-ended exploration. Tooling prevents broad crawling through caps, stateRoot exclusions, and reminders, not by
denying Kimi the exact source navigation needed to edit.
