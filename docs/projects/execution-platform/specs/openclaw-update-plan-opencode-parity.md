---
summary: "Proposal to make OpenClaw update_plan behave like OpenCode's lightweight todo progress board while preserving node_finish lifecycle authority."
title: "OpenClaw Update Plan OpenCode Parity"
---

# OpenClaw Update Plan OpenCode Parity

## Completion Tracking

| Item                                                                | Status   | Evidence                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Simplify `update_plan` semantics.                                | Complete | `src/agents/tool-description-presets.ts` frames todo as a lightweight progress board and `src/agents/tools/update-plan-tool.test.ts` proves the provider-visible description says todo is status only, not workflow authority.                                                                          |
| 2. Remove source-activity examples from provider-visible todo text. | Complete | `src/agents/tool-description-presets.ts` removes the source-activity examples; focused `rg` found the removed examples only in this spec, unrelated sandbox safety text, or tests asserting absence.                                                                                                    |
| 3. Make `update_plan` result less authoritative.                    | Complete | `src/agents/tools/update-plan-tool.ts` now emits only a JSON-like todo list in model-visible content; counts, persistence refs, and event IDs remain in runtime details/events.                                                                                                                         |
| 4. Remove targeted correction for source-activity todos.            | Complete | Later OpenCode parity review showed the targeted `<system-reminder>` was still workflow authority. It was removed from `src/agents/tools/update-plan-tool.ts`; tests assert acquisition-shaped todo text remains plain status.                                                                          |
| 5. Add the commitment sentence in the right native surfaces.        | Complete | Exact sentence is present in `docs/agents/execution-coding/runtime/BOOTSTRAP.md`, `.artifacts/execution-platform/kimi-worker-loop-test/work-queue-frontier-delta-stream-node-prompt.md`, and `src/agents/pi-tools.ts`.                                                                                  |
| 6. Add sparse source-navigation reminder.                           | Complete | `src/agents/pi-tools.ts` emits a one-time parent reminder after repeated `read`/`grep`/`glob` calls without `edit`; node authority overlay tests cover the behavior.                                                                                                                                    |
| 7. Preserve OpenCode’s parent editor tool split.                    | Complete | Parent `read`, `grep`, `glob`, and `edit` remain available in node native task mode; node authority overlay tests verify parent navigation and mutation affordances.                                                                                                                                    |
| 8. Make `edit` more prominent and forceful.                         | Complete | `src/agents/pi-tools.ts` strengthens the native edit tool description with the exact commitment sentence and “edit before more lookup”; tests assert both.                                                                                                                                              |
| 9. Add proof optics, not hard caps.                                 | Complete | Existing native session trace now projects `editTransition` diagnostics for first-edit wall clock, tool/source counts, first todo shape, sparse reminder, source-lookup todo after repeated source calls, and `node_finish` lifecycle; focused native trace and execution-platform readback tests pass. |
| 10. Clean patch order.                                              | Complete | Changes landed in the requested order: update_plan text/result/correction, sparse source-navigation reminder, edit description, prompt/bootstrap sentence, focused tests, and spec status update.                                                                                                       |

**Comprehensive Proposal**

Core correction: make `update_plan` OpenCode-like. It should be a lightweight session progress board, not a workflow authority surface. Node lifecycle stays with `node_finish` and session runtime. Editing readiness stays with Kimi plus editor tools. Todo tracks deliverables; it does not grant permission to move between phases.

1. Simplify `update_plan` semantics.

- Keep session-owned durable todo.
- Keep statuses: `pending`, `in_progress`, `completed`.
- Do not enforce a model-visible phase contract such as exactly one `in_progress` item.
- Do not treat todo as a scheduler gate, phase machine, lifecycle state, or handoff controller.
- Do not imply a required sequence of read -> edit -> test -> finish.
- Do not make `update_plan` decide when Kimi may edit.

2. Remove source-activity examples from provider-visible todo text.

Current negative examples still inject the bad pattern: “read files,” “inspect source,” “search callers,” “understand current state,” “map integration points,” and “gather context.” Remove those from tool descriptions and schema text.

Use short, neutral wording: todo is status only, not a workflow gate. Avoid listing bad source behaviors. The failed run copied the forbidden shape anyway.

3. Make `update_plan` result less authoritative.

Current result surfaces a bad active phase:

```text
inProgress: Read existing work-queue read model and event substrate files
```

Change output to a thinner OpenCode-style JSON-like todo list:

```json
[
  {
    "content": "Implement event-delta readback projection",
    "status": "in_progress",
    "priority": "normal"
  }
]
```

Keep structured details for runtime/readback, but do not place counts, a special top-level `inProgress:` line, or phase-like status text in model-visible content.

4. Remove targeted correction for source-activity todos.

Do not reject the todo. Do not add a hard gate. Do not append a todo-specific `<system-reminder>`. If the model writes an acquisition-shaped todo, record it as submitted and let editor/tool affordances carry the edit commitment.

5. Add the commitment sentence in the right native surfaces.

Use exactly:

> If you have enough context to make even a small, medium-confidence edit, make that edit now; do not take another context-acquisition turn.

Place it in:

- `execution-coding` bootstrap;
- generated node prompt near the objective;
- edit tool description;
- sparse source-navigation reminder.

Do not put it in every `read`/`grep` result.

6. Add sparse source-navigation reminder.

After several parent `read`/`grep`/`glob` calls with no `edit`, show one reminder:

> You have taken several source-navigation turns without editing. If you can make even a small, medium-confidence edit, call `edit` now; do not take another context-acquisition turn.

This should be native OpenClaw tool-result behavior, not a scheduler gate. Prefer deriving it from session/tool event history already recorded by OpenClaw. Do not add a new ledger.

7. Preserve OpenCode’s parent editor tool split.

- Parent Kimi keeps bounded `read`, `grep`, `glob`, and `edit`.
- Do not shrink read windows.
- Do not remove parent navigation.
- `task` remains for open-ended exploration and validation.
- Scouts do not own todo unless explicitly configured.
- Todo does not become the child handoff controller.

8. Make `edit` more prominent and forceful.

`edit` should say:

- it is the primary implementation tool;
- use it as soon as target file, target symbol, and patch shape are visible;
- do not wait for complete architecture certainty;
- if old text is visible and locally bounded, edit before more lookup.

9. Add proof optics, not hard caps.

Track and report:

- bootstrap-to-first-edit wall clock;
- tool count before first edit;
- first todo shape;
- source-tool count before first edit;
- whether the active todo is still a reading/context todo after N source calls;
- whether sparse correction fired;
- whether lifecycle still ends via `node_finish`.

These are diagnostics and success gates, not arbitrary kill limits.

10. Clean patch order.

1. Patch `update_plan` description/schema text.
1. Patch `update_plan` model-visible result formatting.
1. Remove todo-specific context-acquisition correction text.
1. Add sparse source-navigation reminder using native session/tool event history.
1. Strengthen `edit` description.
1. Ensure prompt/bootstrap carry the one commitment sentence.
1. Run focused tests for `update_plan`, source-navigation reminder, and tool catalog text.
1. Rerun the live proof.

Functional target: copy OpenCode’s behavior, not just its surface shape. Todo is status, not authority. Kimi is an editor with bounded navigation. When enough context exists for even a medium-confidence edit, it edits.
