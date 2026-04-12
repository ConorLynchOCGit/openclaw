# Main Session Mounted-File Fix Report

Date: 2026-04-11

## Purpose

Record the implementation follow-through after
`audits/main_session_mounted_file_visibility_diagnosis_2026-04-11.md`.

This report now sits underneath the broader scalable follow-up model recorded
in `audits/main_session_source_resolution_model_2026-04-11.md`.

This pass did not change canonical memory ownership. It hardened source
selection, bootstrap behavior, and long-doc read guidance so Main session is
less likely to answer repo-coupled implementation questions from stale or
partial workspace context.

## Fixes Landed

### 1. Source-of-truth routing classification

Files:

- `src/config/sessions/types.ts`
- `src/agents/main-memory-routing.ts`
- `src/agents/main-memory-routing.test.ts`

What changed:

- added a dedicated `source_truth_lookup` prompt class and intent signal
- matched phrases such as:
  - mounted repo or project files
  - curated import
  - repo-canonical
  - source-of-truth
  - canonical memory classes
  - memory-system architecture/spec/roadmap
- disabled memory-tool pinning for those turns by returning:
  - `selectedTarget: "none"`
  - `reasonCode: "source_truth_lookup_no_memory_pin"`

Why it matters:

- Main no longer treats repo-coupled implementation questions as normal
  workspace-memory lookup prompts.

### 2. System-prompt source-of-truth precedence

Files:

- `src/agents/system-prompt.ts`
- `src/agents/system-prompt.test.ts`

What changed:

- added a dedicated `## Source of Truth` section to the Main system prompt
- made mounted and canonical implementation docs outrank workspace
  `MEMORY.md`, `memory/*.md`, and `projects/*` for repo-coupled questions
- explicitly told Main to escalate when:
  - the question is about canonical classes, architecture, specs, or roadmaps
  - Project Context was truncated
  - relevant workspace memory context is missing
- strengthened long-doc guidance to require continued reads until
  `document_read(action=verify)` confirms full coverage when exact canonical
  wording matters

Why it matters:

- the system prompt now states the precedence rule directly instead of
  expecting the model to infer it from workspace structure alone.

### 3. Memory prompt exception for canonical docs

Files:

- `extensions/memory-core/src/prompt-section.ts`
- `extensions/memory-core/src/prompt-section.test.ts`

What changed:

- narrowed the recall instruction to workspace continuity questions
- added an explicit exception for mounted repo/project files and canonical
  implementation sources
- told Main not to answer from stale memory alone when `memory_search`
  returns nothing or daily memory files are missing

Why it matters:

- the memory extension prompt no longer quietly biases Main toward workspace
  memory for implementation-truth questions.

### 4. Bootstrap truncation soft-overflow fix

Files:

- `src/agents/pi-embedded-helpers/bootstrap.ts`
- `src/agents/pi-embedded-helpers.buildbootstrapcontextfiles.test.ts`

What changed:

- added a narrow soft-overflow allowance for files that exceed the per-file
  bootstrap cap only slightly and still fit under the remaining total budget
- this specifically prevents near-limit files such as `MEMORY.md` from being
  clipped just because they are slightly above the default per-file threshold

Why it matters:

- the previously observed `MEMORY.md` truncation pattern was driven by a small
  overage against the per-file cap, not by a genuinely huge bootstrap payload.

### 5. Turn-local runner note for high-risk cases

Files:

- `src/agents/pi-embedded-runner/run/attempt.prompt-helpers.ts`
- `src/agents/pi-embedded-runner/run/attempt.prompt-helpers.test.ts`
- `src/agents/pi-embedded-runner/run/attempt.ts`

What changed:

- added a turn-local workspace note when:
  - the turn is classified as `source_truth_lookup`
  - bootstrap context for the run was truncated
- the note tells Main to prefer authoritative files under
  `imports/*/content/...` over workspace memory summaries for canonical
  implementation questions

Why it matters:

- this adds a direct runtime nudge on the exact turns that were failing in the
  logs, without globally bloating unrelated turns.

## What Was Validated

Targeted tests:

- `pnpm test -- src/agents/main-memory-routing.test.ts src/agents/system-prompt.test.ts src/agents/pi-embedded-helpers.buildbootstrapcontextfiles.test.ts src/agents/pi-embedded-runner/run/attempt.prompt-helpers.test.ts extensions/memory-core/src/prompt-section.test.ts`
- `pnpm check:types`

Regression targets covered:

- mounted canonical-doc question classified as source-truth lookup
- mounted canonical-doc question avoids memory-tool pinning
- system prompt includes explicit source-of-truth escalation
- memory prompt includes canonical-doc exception
- slight `MEMORY.md` bootstrap overflow no longer truncates
- runner note appears for source-truth and truncation cases

## What This Does Not Claim

- this does not prove Main will never answer a mounted-file question badly
- this does not change the low-level `document_read` implementation
- this does not replace authoritative-file reading with a new summary layer
- this does not make workspace memory canonical for repo-coupled facts

## Remaining Risks

1. If a canonical mounted document is very long and Main still stops after an
   incomplete chunked read, interpretation can remain wrong.
2. If a user question does not resemble the current source-truth lookup
   patterns, the new classification will not fire.
3. Workspace continuity files can still be useful context, so correctness
   still depends on Main following the precedence rule rather than treating all
   workspace memory as irrelevant.

## Recommended Next Tranche If Failures Persist

1. Add one or two more narrow source-truth lookup patterns based on future
   missed-question logs, not speculation.
2. Add a stronger runtime refusal/fallback rule when a canonical long-doc read
   was started but not fully verified.
3. Add one integration-style regression test built from the exact logged
   mounted-memory-class failure transcript if a reproducible harness exists.
