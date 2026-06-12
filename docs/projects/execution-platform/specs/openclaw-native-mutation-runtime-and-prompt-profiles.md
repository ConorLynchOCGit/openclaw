---
summary: "Combined proposal for a native OpenClaw mutation runtime and execution-worker prompt profile architecture."
title: "OpenClaw Native Mutation Runtime And Prompt Profiles"
---

# OpenClaw Native Mutation Runtime And Prompt Profiles

The proposal below is recorded verbatim.

**Combined Proposal: OpenClaw Native Mutation Runtime + Prompt Profiles**

Core correction: Kimi can now find context and reach mutation. The remaining blockers are two native architecture surfaces:

1. The mutation surface is too overloaded, accepts too many mixed shapes, and lets Kimi produce illegal hybrids like `oldString + startLine` without `newString`.
2. Execution workers still inherit too much general assistant prompt surface. They need a first-class OpenClaw prompt profile that preserves the Kimi acquisition/edit guidance but removes unrelated assistant noise.

The guiding principle:

One visible mutation tool, two obvious modes, one powerful backend. One native prompt builder, role-specific prompt profiles, no second prompt DSL.

---

## Part 1: OpenClaw Native Mutation Runtime

Core correction: Kimi can now find context and reach mutation. The blocker is the mutation surface: current `edit` is too overloaded, accepts too many mixed shapes, and lets Kimi produce illegal hybrids like `oldString + startLine` without `newString`.

Principle:

One visible mutation tool, two obvious modes, one powerful backend.

### 1. One Visible Tool: `edit`

Do not expose separate `patch`, `insert`, `replace_lines`, or `apply_patch` to Kimi execution-coding yet. Multiple mutation tools may create action hesitation.

Make `edit` the single first-class mutation tool with two visible shapes.

Exact replacement:

```json
{
  "filePath": "...",
  "oldString": "...",
  "newString": "...",
  "replaceAll": false
}
```

Multi-operation batch:

```json
{
  "operations": [
    {
      "type": "replace_lines",
      "filePath": "...",
      "startLine": 1220,
      "endLine": 1231,
      "text": "..."
    },
    {
      "type": "insert_after",
      "filePath": "...",
      "line": 5455,
      "text": "..."
    }
  ]
}
```

Supported operation types only:

- `replace`: exact `oldString` / `newString`;
- `replace_lines`: `startLine` / `endLine` / `text`;
- `insert_before`: `line` / `text`;
- `insert_after`: `line` / `text`.

No `mode`, no nested variants, no clever aliases in the visible schema.

### 2. Fields To Cut From Provider-Visible Schema

Do not advertise:

- `path`
- `oldText`
- `newText`
- `insertBeforeLine`
- `insertAfterLine`
- top-level `startLine` / `endLine`
- mixed `oldString + startLine`
- separate `patch` schema
- separate `apply_patch` for Kimi execution-coding

Accept some internally for compatibility, but the model should only see the clean contract.

### 3. Add `PatchTransactionService`

Create one native mutation backend underneath `edit`.

It owns:

- path authority checks;
- file loading;
- mutation normalization;
- exact-string replacement;
- line/range replacement;
- before/after insertion;
- unified patch parsing where needed;
- batch conflict detection;
- atomic application;
- diff generation;
- bounded formatting hooks where safe;
- bounded LSP diagnostics;
- mutation telemetry/events.

`pi-tools.host-edit` becomes a thin adapter. Legacy `apply_patch` routes through this service where possible instead of staying a separate behavior island.

### 4. Safe Dynamic Repair

The backend should repair safe attempts:

- `path -> filePath`;
- `oldText/newText -> oldString/newString`;
- stale nearby line numbers;
- indentation mismatch;
- trailing whitespace mismatch;
- line-ending mismatch;
- import insertion placement;
- no-op detection;
- exact-match failure with one unique nearby candidate;
- non-overlapping multi-edit ordering.

It must reject rather than guess when content is missing.

### 5. Invalid Mutation Feedback

Replace JSON-ish generic errors with executable corrections.

Observed failure response should become:

```text
Cannot apply edit: replacement text is missing.

You supplied oldString but no newString.
Use one of:

edit({filePath, oldString, newString})

edit({operations:[{type:"insert_after", filePath, line, text}]})

edit({operations:[{type:"replace_lines", filePath, startLine, endLine, text}]})
```

If repeated:

```text
Repeated invalid mutation shape. Do not call edit again with oldString only.
Provide newString or use edit({operations:[...]}).
```

On failure, include `candidateOperations` when possible:

```json
[
  {
    "type": "replace_lines",
    "filePath": "...",
    "startLine": 1220,
    "endLine": 1231
  }
]
```

### 6. Guardrails

Reject:

- ambiguous exact matches;
- overlapping operations;
- missing replacement text;
- huge deletion-heavy edits;
- edits crossing unrelated exported type/function boundaries unless explicitly supplied as coherent operations;
- stale anchors with multiple plausible targets;
- `replaceAll` without clear intent.

Line operations must resolve against the same original file snapshot, then apply through a planner or descending line order.

### 7. Unified Output

All successful mutations return:

```text
Edit applied successfully.

Diff:
+N -M, first changed line X
<small diff hunk>

LSP diagnostics:
none
```

Or:

```text
Edit applied successfully.

LSP diagnostics, next repair targets:
- file.ts:123:9 ERROR message
```

Keep heavy metadata out of model-visible text.

### 8. Atomic Multi-Location Edits

`operations[]` must support coherent vertical batches:

- type/interface update;
- producer/wiring update;
- summary/consumer update;
- focused test update.

Apply all operations or none. Return one combined diff and diagnostics.

### 9. Native OpenClaw Wiring

Wire this as core runtime:

- tool-catalog exposes one mutation tool: `edit`;
- authority overlay enforces allowed paths;
- session runtime records `mutation_attempted`, `mutation_applied`, `mutation_rejected`, `diagnostics_reported`;
- context pressure sees concise diffs, not full old/new payload dumps;
- LSP diagnostics attach in the backend;
- proof-specific mutation logic disappears.

### 10. Deferred Additions

Do not expose `preview` initially. Agents should edit, not preview-loop.

Defer `add_import` unless imports remain a major failure after this slice.

Later, validation diagnostics can emit ready repair operations, but that is a second slice.

### 11. Mutation Tests

Add focused tests for:

- `edit({filePath, oldString})` returns missing replacement correction;
- repeated invalid edit shape emits stronger correction;
- alias normalization works internally;
- `operations[].insert_after` applies correctly;
- `operations[].insert_before` applies correctly;
- `operations[].replace_lines` applies correctly;
- `operations[].replace` applies correctly;
- stale line range repairs when unique;
- ambiguous exact match returns candidate ranges;
- multi-operation transaction is atomic;
- overlapping operations are rejected;
- risky deletion-heavy edit is rejected;
- successful mutation returns concise diff and LSP diagnostics;
- diagnostics timeout returns diagnostics unavailable, not edit failure.

### 12. Mutation Proof Gate

Before rerun:

- revert proof edit in `execution-read-model.ts`;
- rebuild/reload;
- run the same Work Queue delta proof.

Track:

- first model activation;
- first edit call;
- exact replacement vs `operations[]`;
- invalid mutation count;
- repeated invalid mutation count;
- first successful multi-operation edit;
- validation start;
- terminal outcome.

Success criterion: Kimi does not loop on malformed edit. It either lands a valid exact replacement, lands an atomic `operations[]` edit, or receives a short correction that pushes it to a valid mutation shape.

---

## Part 2: OpenClaw Native Prompt Profiles

Core correction: fix the system prompt architecture natively, not with another Kimi-only patch. Execution workers should not inherit the general assistant prompt surface. They need a first-class OpenClaw prompt profile that preserves the Kimi acquisition/edit guidance but removes unrelated assistant noise.

The profile system must live inside the existing OpenClaw prompt pipeline. Do not create a second prompt renderer or a new prompt DSL.

### 1. Add Native `promptProfile`

Keep existing `promptMode` for size/transport behavior:

- `full`
- `minimal`
- `none`

Add `promptProfile` for role behavior:

- `general_assistant`
- `execution_worker`
- `execution_context_scout`
- `execution_validation_scout`
- `compaction`

Resolve `promptProfile` from agent pack registry/config, not from ad hoc runner conditionals or only from `agentId === "execution-coding"`.

Public schema should stay small:

```ts
promptMode?: "full" | "minimal" | "none"
promptProfile?: "general_assistant" | "execution_worker" | "execution_context_scout" | "execution_validation_scout" | "compaction"
```

Everything else should be internal:

- section IDs;
- profile section policies;
- provider section overrides;
- receipt byte accounting.

Do not expose arbitrary per-agent section arrays or include/exclude lists.

### 2. Make `buildAgentSystemPrompt` Profile-Aware

Do not create a second prompt renderer.

`buildAgentSystemPrompt` should own both:

- `promptMode`
- `promptProfile`

Implement prompt rendering as section-driven composition inside the existing builder.

Example internal section IDs:

- `identity`
- `tooling`
- `tool_call_style`
- `execution_contract`
- `safety`
- `skills`
- `workspace`
- `project_context`
- `runtime`
- `messaging`
- `web`
- `docs`
- `canvas`
- `voice`
- `self_update`
- `silent_replies`

Each profile maps to a small fixed section policy. Do not let arbitrary agent config define bespoke section lists.

### 3. Add `execution_worker` Section Policy

Execution workers should include:

- `identity`
- `execution_contract`
- `tooling`
- `tool_call_style`
- compact `safety`
- `workspace`
- `project_context`
- `runtime`

Execution workers should omit:

- messaging
- docs links
- OpenClaw CLI quick reference
- silent replies
- canvas
- voice
- web browsing/research routing
- self-update
- proactive channel behavior
- broad model aliases unless explicitly needed

These sections may remain useful for the principal orchestrator/general assistant, but they are distracting noise for node workers.

### 4. Make Kimi Worker Guidance Primary

Current `stablePrefix` is too coarse and should not remain the long-term architecture. It solved the immediate run, but it is still a prepend layered into a broader assistant prompt.

For Kimi execution workers, the provider contribution should become the first identity/behavior section, not a block inserted after generic OpenClaw sections.

Extend existing provider contribution `sectionOverrides` rather than adding a large new provider schema. Add only the section IDs we need:

- `identity`
- `execution_contract`
- `tool_call_style`

Avoid separate fields such as `providerNotes` unless later evidence proves they are needed.

Keep provider contribution cache-stable where possible.

### 5. Preserve Acquisition Guidance In System Prompt

Do not remove the guidance that solved acquisition.

Keep this guidance in the canonical `execution_worker` system prompt contract:

- Your only goal is accepted source edits for this node, then `node_finish`.
- Start with a provisional patch hypothesis: target files, target symbols, patch shape, and validation signal.
- Use source tools only to ground that hypothesis enough to edit.
- For large TypeScript files, derive LSP queries from task names, file names, exported types, functions, interfaces, tests, and PascalCase/camelCase symbols.
- Use `lsp documentSymbol`, `workspaceSymbol`, or file-scoped `grep` before walking read windows.
- Path-only read of a large file floods context and jeopardizes completion. Use it at most once.
- After that, use LSP/query, file-scoped grep, or read with explicit `offset` and `limit`.
- When target files, symbols, patch shape, and validation signal are known, make the largest currently grounded coherent vertical edit batch.
- If only part is grounded, edit that part now and let validation drive repair.
- Local uncertainty is not a blocker. Validation and edit failures are how the worker discovers the next missing fact.

This should be one coherent high-priority execution contract, not scattered across many docs and prompt surfaces.

### 6. Keep Safety, But Compress It

Execution workers should not get the full general assistant safety/web/messaging bundle.

They still need compact execution safety:

- stay inside allowed paths;
- do not mutate Work Queue lifecycle unless explicitly authorized and evidence-backed;
- do not store or expose secrets;
- do not store raw prompts, raw provider logs, raw tool logs, raw command logs, or unbounded logs;
- respect authority overlay and tool policy;
- finish only through `node_finish`.

### 7. Reduce Duplication Gradually

Do not immediately remove the acquisition guidance everywhere and risk regression.

First:

- move the authoritative version into the `execution_worker` contract;
- keep tool descriptions aligned;
- leave runtime docs as durable fallback.

After proof confirms no acquisition regression:

- remove repeated LSP/read/grep strategy from node prompt templates;
- shorten runtime `BOOTSTRAP.md`;
- keep `IDENTITY.md` as role/ownership only;
- keep `AGENTS.md` as coordination boundaries only;
- keep `TOOLS.md` as tool map and tool-specific affordances only.

### 8. Keep Tool Inventory Factual

For execution workers, system prompt tool inventory should be short and factual:

- visible tool name;
- one-line purpose.

Do not include broad tool philosophy in the inventory.

Full behavior remains in the actual tool descriptions.

### 9. Keep Skills On Demand

Execution workers should not receive always-active workflow skills.

Keep the OpenCode-aligned model:

- skill list may be visible if allowed;
- skill bodies are loaded only through the skill/tool surface;
- no active workflow skill for execution-coding.

### 10. Preserve OpenClaw-Native Node Surfaces

Do not remove OpenClaw-native execution concepts.

The execution-worker profile should still support:

- node prompt as work order;
- `node_finish` terminal lifecycle;
- execution scouts for open-ended discovery;
- validation scouts for command/test diagnosis;
- focused evidence/changed-file reporting;
- authority overlay and allowed paths;
- provider request diagnostics;
- prompt receipts.

The goal is to remove unrelated assistant noise, not make OpenClaw pretend it is plain OpenCode.

### 11. Wire Through Existing OpenClaw Seams

Wire this through native OpenClaw prompt infrastructure:

- agent pack registry defines `promptProfile`;
- agent config resolution carries it;
- `buildEmbeddedSystemPrompt` passes it;
- `buildAgentSystemPrompt` renders it;
- source-runtime materialized agent docs remain context files;
- provider contribution plugs into known sections;
- prompt receipt records it.

Avoid ad hoc execution-runner-specific prompt surgery.

### 12. Add Section-Level Prompt Receipts

Prompt diagnostics should report:

- `promptProfile`
- `promptMode`
- included section IDs;
- section byte counts;
- generic assistant bytes;
- execution contract bytes;
- provider contribution bytes;
- Kimi execution contract present/missing;
- injected execution docs list;
- total system prompt bytes.

Do not store raw prompts.

For execution workers, generic assistant bytes should be zero or near-zero.

Compute `genericAssistantBytes` from section accounting. Do not make it a config field.

### 13. Add Prompt Tests

Add focused tests proving:

- execution worker prompt includes acquisition contract;
- execution worker prompt excludes messaging/web/canvas/self-update/silent replies;
- execution worker prompt excludes OpenClaw CLI quick reference and broad docs links;
- Kimi execution identity appears before generic OpenClaw assistant identity;
- provider contribution section override fills the expected section;
- section receipt reports zero or near-zero generic assistant bytes;
- source-runtime agent docs still inject as project context;
- general assistant profile remains unchanged.

### 14. Add Regression Optics For Proof

For the next proof, track:

- first model activation wallclock;
- first LSP call;
- first concrete patch hypothesis, if visible;
- first edit call;
- source calls before first edit;
- path-only reads of large files;
- repeated large-file reads;
- prompt byte composition;
- whether Kimi still receives the acquisition/commitment rules;
- whether unrelated general-assistant sections are absent.

### 15. Prompt Implementation Order

1. Add `promptProfile` type/config/registry resolution.
2. Extend `buildEmbeddedSystemPrompt` to pass `promptProfile`.
3. Extend `buildAgentSystemPrompt` to accept and render by `promptProfile`.
4. Implement fixed section policies.
5. Add `execution_worker` profile.
6. Extend provider contribution section overrides for `identity`, `execution_contract`, and `tool_call_style`.
7. Promote Kimi execution guidance into the execution-worker identity/contract position.
8. Exclude unrelated general assistant sections for execution workers.
9. Keep acquisition guidance in the execution-worker system prompt.
10. Add compact execution safety.
11. Add section-level prompt receipts.
12. Update execution-coding agent pack/config to use `execution_worker`.
13. Add focused prompt tests.
14. Rebuild/reload.
15. Run one proof and compare acquisition/edit behavior against recent runs.
16. Only after proof, trim duplicated node-prompt/runtime-doc language.
17. Delete the temporary Kimi `stablePrefix` path once the section-based profile fully owns it.

---

## Combined Implementation Order

1. Revert any proof edits in Work Queue files so the next proof starts clean.
2. Implement `PatchTransactionService`.
3. Refactor `edit` to expose one visible mutation tool with exact replacement and `operations[]`.
4. Route legacy mutation paths into the backend where safe.
5. Add unified concise mutation output and LSP diagnostics.
6. Add mutation tests.
7. Add native `promptProfile`.
8. Add `execution_worker` prompt profile and section policy.
9. Move Kimi execution guidance into the first-class execution worker identity/contract.
10. Remove unrelated general assistant sections from execution workers.
11. Add prompt receipts/tests.
12. Rebuild/reload.
13. Run the Work Queue delta proof.
14. Track mutation and prompt-profile metrics together.
15. Only after proof, trim duplicate prompt/runtime/node-template language and retire temporary `stablePrefix`.

Bottom line: make editing simpler and stronger first, then make execution-coding a first-class OpenClaw prompt profile. Keep the Kimi acquisition strategy that worked. Remove unrelated assistant surface. Keep mutation and prompt schemas small. Add structural receipts so we can prove what the model actually saw and how it mutated files.
