---
summary: "Proposal for progress-lease worker runtime behavior and search-first scout handoff."
title: "Progress Lease And Search-First Worker Proof"
---

# Progress Lease And Search-First Worker Proof

Recorded verbatim from the 2026-06-09 worker proof diagnosis.

Yes. The timeout behavior is wrong at the run-control level. A worker or scout should not die because a wall clock expired while it is still making real progress. We still need provider/network stall protection, but that should be a no-progress lease, not a static black-and-white execution cap.

**Next Work Proposal**

**Goal**
Make the next worker proof fail only for real task failure, not because the runtime encourages inefficient source lookup or kills an agent that is actively progressing.

**Completion Tracking**

| Item                                                         | Status                            | Current Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Replace static run timeout with progress lease            | In progress                       | Parent embedded runner now uses `createProgressLeaseTimeout`, resets on assistant/tool/agent progress, and does not reset on repeated identical progress signatures. Focused test `progress-lease-timeout.test.ts` passes. Native child task launch already ignores model-selected run caps and uses the max-safe sentinel, but child no-progress partial-result behavior remains to be proven in live runtime.                                                                                                                                                                          |
| 2. Fix context scout bias: search first, read windows second | Complete                          | `skills/execution-context-scout/SKILL.md` and `docs/agents/execution-context-scout/runtime/AGENTS.md` now require mechanical search-first lookup, known refs as search scope, bounded reads after grep, `symbol_windows`, and no edit-readiness judgment.                                                                                                                                                                                                                                                                                                                                |
| 3. Update Kimi parent skill                                  | Complete                          | `skills/execution-node-workflow/SKILL.md` and `docs/agents/execution-coding/runtime/AGENTS.md` now make Kimi own edit-readiness decisions from scout evidence, ask exact follow-ups when line windows are missing, and avoid parent broad-read fallback.                                                                                                                                                                                                                                                                                                                                 |
| 4. Improve tool affordances without chokepoints              | Complete for source/tool contract | `src/agents/pi-tools.read.ts` now tells models to grep first for symbol/call-site/policy lookup; existing read behavior provides scout-specific 160-line/16KB defaults, EOF metadata, valid offset ranges, missing-path suggestions, line metadata, and byte caps. Focused read-tool tests pass.                                                                                                                                                                                                                                                                                         |
| 5. Validation scout parity                                   | Complete                          | `skills/execution-validation-scout/SKILL.md` and `docs/agents/execution-validation-scout/runtime/AGENTS.md` now require search-first validation lookup, matched-window reads, bounded output, exact missing context, and no lifecycle completion judgment.                                                                                                                                                                                                                                                                                                                               |
| 6. Repair current partial Kimi work before next proof        | Complete                          | The proof-touched Work Queue files have no remaining diff: `execution-read-model.ts`, `execution-read-model.test.ts`, and `work-queue-repository.ts` are clean against HEAD.                                                                                                                                                                                                                                                                                                                                                                                                             |
| 7. Run focused tests on touched files                        | Complete for current source slice | Passed: `node scripts/run-vitest.mjs run --config test/vitest/vitest.agents-pi.config.ts src/agents/pi-embedded-runner/run/progress-lease-timeout.test.ts`; passed: `node scripts/run-vitest.mjs run --config test/vitest/vitest.full-agentic.config.ts src/agents/pi-tools.create-openclaw-coding-tools.adds-claude-style-aliases-schemas-without-dropping-f.test.ts src/agents/pi-tools.create-openclaw-coding-tools.adds-claude-style-aliases-schemas-without-dropping-g.test.ts`; `node --import tsx -e "await import('./src/agents/pi-embedded-runner/run/attempt.ts')"` succeeded. |
| 8. Reload runtime docs/skills/code                           | Pending                           | Not done in this slice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 9. Run one proof with the Work Queue delta prompt            | Pending                           | Not done in this slice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

The next round should address three things together:

1. Scout search behavior.
2. Parent/scout handoff quality.
3. Progress-based runtime continuation instead of static timeout death.

**1. Replace Static Run Timeout With Progress Lease**

Current behavior:

- Parent ran for ~20 minutes.
- It was still making progress.
- Runtime killed/surfaced the run as timeout.
- No validation, no `node_finish`.

Proposed behavior:

- Parent and child sessions get a progress lease.
- The lease resets on meaningful progress.
- The run only times out when there is no meaningful progress for the lease window.
- A long-running but productive worker keeps going.

Meaningful progress should include:

- model response chunk/completion;
- tool call emitted;
- tool result received;
- edit/mutation success or failure;
- todo/update_plan change;
- task child start;
- task child result;
- working ledger write;
- validation command start/result;
- node_finish call;
- provider retry/failover event, if bounded and advancing state.

What should not reset progress:

- repeated identical failed calls;
- repeated broad-read rejections with same args;
- idle provider wait;
- session lock wait with no state change;
- re-reading same window without new evidence;
- gateway reconnect churn unrelated to worker state.

Subagent behavior:

- If a scout is making progress, do not hard-kill it.
- If it is looping inefficiently but producing usable evidence, return partial bounded result plus continuation hint.
- If it stalls with no progress, return typed failure:
  - `child_provider_response_timeout`
  - `child_no_progress_timeout`
  - `child_repeated_tool_failure`
  - `child_result_unshaped`

Parent behavior:

- If parent is making progress, keep the session alive.
- If parent stalls, surface a checkpoint result and let it call `node_finish blocked`, not silently die.
- Provider request timeouts are still needed for hung HTTP calls, but they should be per-provider-call stall protection, not an arbitrary whole-node kill.

**2. Fix Context Scout Bias: Search First, Read Windows Second**

The scout is using `read` like a scroll mechanism. That is the core lookup defect.

New scout contract:

- Scout is mechanical search/windowing only.
- Scout does not decide sufficiency or edit readiness.
- Scout searches known refs first.
- Scout searches known keywords first.
- Scout uses suspected keywords second.
- Scout searches broader repo only if known refs do not resolve the target.
- Scout reads only matched windows after search.
- Known file path means "search scope," not "start reading from line 1."

For call-site/symbol tasks, the expected sequence is:

1. `grep` exact symbol in known files.
2. If missing, `grep` related symbols/imports/types in known files.
3. If still missing, repo-wide `grep`.
4. `read` bounded windows around matches.
5. Return symbol windows and missing-window asks.

Scout output should be:

- symbol/name;
- exact path;
- exact line window;
- why this window matters;
- local callers/imports/tests if found;
- file_graph edges;
- missing exact windows, if any.

No `enough_for_minimal_edit`. No "can start editing." Kimi owns that.

**3. Update Kimi Parent Skill**

Kimi's weakness is not high-level reasoning. It made a good architecture correction when it avoided threading `workQueueEventStore` through 29 call sites. The weakness is what it does when scout handoff lacks exact windows.

New parent rubric:

- If scout returns exact windows for the next minimal edit: edit.
- If scout returns files but not line windows: ask scout for exact symbol windows.
- If scout returns summary without symbols: treat scout handoff as incomplete.
- If Kimi needs location discovery: delegate mechanical scout lookup, do not broad-read.
- Parent `read` is only for exact small windows once offset/limit are known.
- Kimi decides edit readiness; scout only supplies evidence.

Keep the broad parent-read guard. It is doing its job.

**4. Improve Tool Affordances Without Adding Chokepoints**

Avoid hard deterministic stages unless repeated failures force it. First make the normal path easier.

Tool description/read behavior should steer models:

- `read(path)` on large files should say: "For symbols/call sites, use grep first."
- Scout read defaults should be smaller than 2,000 lines.
- EOF should return total lines and valid range, not an error-shaped dead end.
- Search results should make exact follow-up reads obvious.
- Managed/truncated output should preserve useful windows and refs.

This is OpenCode-aligned: bounded tools, clear continuation, specialized subagent, not a rigid workflow engine.

**5. Validation Scout Parity**

The same problems can recur in validation.

Validation scout contract should be:

- read/search current files only as needed;
- prefer focused test discovery over broad command guessing;
- run narrow validation first;
- return command, exit status, bounded output, likely cause, repair windows;
- do not decide lifecycle completion;
- do not dump raw logs.

If validation fails outside known context, it should request/return the exact missing source window rather than broad diagnosing.

**6. Repair Current Partial Kimi Work Before Next Proof**

Current proof left partial edits. Before another live proof:

- inspect the Kimi diff;
- decide what to keep;
- fix or remove incomplete test changes;
- verify whether `listEvents(limit: 20)` returns latest/recent or first 20;
- add focused tests for the event-delta projection;
- run only touched focused tests.

Do not rerun the full gate suite here.

**7. Next Proof Success Gates**

The next proof should pass these gates:

- parent launch admits full prompt/docs/skill;
- parent creates durable todo;
- context scout uses search-first behavior for symbol/call-site lookup;
- scout returns exact symbol windows, not sufficiency judgment;
- Kimi edits from returned windows;
- progress lease keeps parent/scout alive while meaningful progress continues;
- no static timeout kills an active session;
- validation scout runs focused validation;
- Kimi calls `node_finish`;
- readback shows todo, context handoff, edits, validation, and finish.

**Clean Implementation Order**

1. Add progress-lease semantics for parent and child runs.
2. Update context scout skill/docs to mechanical search-only.
3. Update Kimi skill/docs for exact-window decision rubric.
4. Tune read/search tool descriptions and large-file affordances.
5. Apply same bounded/search-first expectations to validation scout.
6. Repair current partial Work Queue delta edit.
7. Run focused tests on touched files.
8. Reload runtime docs/skills/code.
9. Run one proof with the Work Queue delta prompt.

The key architectural rule: do not add a new deterministic workflow cage. Make the OpenClaw-native tool/task/skill surface naturally produce the right behavior, and use deterministic logic only for permissions, progress/stall detection, bounded output, and runtime truth.
