---
summary: "Proposal for breaking the Kimi worker context-acquisition loop with todo correction, mutation surface parity, provider-visible optics, and duplicate acquisition suppression."
title: "OpenClaw Worker Loop Breakers Mutation And Tool Optics"
---

# OpenClaw Worker Loop Breakers Mutation And Tool Optics

## Implementation Tracking

| Item                                          | Status   | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Improve source-acquisition todo detection. | Complete | `src/agents/tools/update-plan-tool.ts` and `src/agents/pi-embedded-runner/run/attempt.ts` now classify `explore`, `map`, `inspect`, `understand`, `review`, `read model`, `event store`, `repository`, `surface`, `substrate`, and `architecture` acquisition-shaped todos and return only the sparse correction. Covered by `src/agents/tools/update-plan-tool.test.ts`.                                                                         |
| 2. Expose `apply_patch` for execution-coding. | Complete | `src/agents/pi-tools.ts` now enables `apply_patch` for node-bound `execution-coding` parent sessions, restores it after legacy `write`-deny coupling, keeps `write`, `exec`, `process`, and raw session tools filtered, and adds parent patch guidance. Covered by `src/agents/pi-tools-agent-config.test.ts` and `src/agents/pi-tools.node-authority-overlay.test.ts`.                                                                           |
| 3. Add provider payload/tool-call optics.     | Complete | `src/agents/pi-embedded-runner/run/attempt.ts` now emits native `node_agent_provider_turn_optics` diagnostics with provider/model/thinking, provider-visible tools, mutating tools, schema hashes/bytes, stop reasons, tool calls, and matching tool-result IDs. Covered by `src/agents/pi-embedded-runner/run/attempt.test.ts`.                                                                                                                  |
| 4. Add duplicate acquisition suppression.     | Complete | `src/agents/pi-tools.ts` now suppresses repeated unchanged parent `read`, identical `grep`, and identical `glob` calls with compact factual results; `src/agents/pi-embedded-subscribe.handlers.tools.ts` and trace projection carry the suppression fields. Covered by `src/agents/pi-tools.node-authority-overlay.test.ts`, `src/agents/pi-embedded-subscribe.handlers.tools.test.ts`, and `src/agents/pi-embedded-runner/run/attempt.test.ts`. |
| 5. Track proof optics.                        | Complete | Native trace/readback now records first todo shape, mutating tools visible to provider, first duplicate acquisition suppression, source-tool count before first edit, `apply_patch` visibility, stop-reason/tool-result linkage, and node_finish status. Covered by `src/agents/pi-embedded-runner/run/attempt.test.ts`; next live proof remains intentionally not run in this edit/test slice.                                                   |

## Proposal Items (Verbatim)

1. **Improve source-acquisition todo detection**
   Expand the classifier to catch terms from the failed todo:
   `explore`, `map`, `inspect`, `understand`, `review`, `read model`, `event store`, `repository`, `surface`, `substrate`, `architecture`.

   If the active todo is acquisition-shaped, return one sparse correction:

   > Todo should track the edit deliverable, not source lookup. If you have enough context for even a small, medium-confidence edit, edit now.

   Do not reject the todo. Do not build a phase machine.

2. **Expose `apply_patch` for execution-coding**
   Allow `apply_patch` only for node-bound execution-coding parent sessions, with the same workspace/root authority as `edit`.

   Keep denied:
   - `write`
   - `exec`
   - `process`
   - raw session tools

   Tool guidance:
   - `edit`: exact replacements from visible source.
   - `apply_patch`: multi-hunk or larger structured edits when target file and patch shape are known.

3. **Add provider payload/tool-call optics**
   Emit native session diagnostics for each model turn:
   - `agentId`
   - `provider`
   - `model`
   - `thinkingLevel`
   - provider-visible `tools[]`
   - `mutatingTools[]`
   - tool schema hashes/byte counts
   - raw normalized `stopReason`
   - `hasNewToolCalls`
   - tool call IDs/names
   - matching tool result IDs

   This should live in native session events/readback, not an EP-owned ledger.

4. **Add duplicate acquisition suppression**
   For node-bound execution-coding parent sessions:

   If the model repeats:
   - `read(path)` with no offset/limit on same unchanged file;
   - identical `read(path, offset, limit)`;
   - identical `grep(query, path/glob/options)`;
   - identical `glob(pattern)`;

   then return compact factual output instead of replaying full content.

   Example:

   ```text
   already_read: true
   path: ...
   previousRange: 1-1371
   totalLines: 5496
   fileHash: ...
   previousToolResultRef: ...
   The same unchanged range was already returned. Use a new bounded range, grep a named symbol, edit now, or finish blocked with the missing fact.
   ```

   This is not a hard workflow gate. It only prevents repeated no-new-information context injection.

5. **Track proof optics**
   For the next proof, record:
   - first todo shape;
   - mutating tools visible to provider;
   - first duplicate acquisition suppressed;
   - source-tool count before first edit;
   - wall clock from model start to first edit;
   - whether `apply_patch` was visible;
   - whether stop reasons and tool result IDs stayed valid;
   - whether `node_finish` happened.
