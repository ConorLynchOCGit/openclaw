# Main Session Mounted-File Visibility Diagnosis

Date: 2026-04-11

## Purpose

Narrow diagnosis of why Main session often misses or misreads facts that live
in files mounted into the main workspace, especially when those facts are
owned by the mounted engineering repo rather than the workspace's own memory
or project-summary surfaces.

This pass also records the workspace normalization decision for the memory
program so workspace tracking and repo-canonical implementation truth are no
longer mixed implicitly.

## Evidence Reviewed

Workspace routing and visibility surfaces:

- `/root/.openclaw/workspace/AGENTS.md`
- `/root/.openclaw/workspace/core/INDEX.md`
- `/root/.openclaw/workspace/core/WORKSPACE_STRUCTURE.md`
- `/root/.openclaw/workspace/system/HOSTFS_INDEX.md`
- `/root/.openclaw/workspace/imports/IMPORTS_INDEX.md`
- `/root/.openclaw/workspace/imports/engineering_repo/INDEX.md`
- `/root/.openclaw/workspace/projects/INDEX.md`
- `/root/.openclaw/workspace/projects/maintenance/INDEX.md`
- `/root/.openclaw/workspace/memory/INDEX.md`

Repo-canonical memory docs:

- `docs/memory-system/README.md`
- `docs/memory-system/STATUS.md`
- `docs/memory-system/CURRENT_SLICE.md`
- `docs/memory-system/memory-roadmap.md`

Recent Main session logs:

- `/root/.openclaw/agents/main/sessions/a4cbd5af-0d03-40ea-a879-12635821327a.jsonl`
- `/root/.openclaw/agents/main/sessions/7867cd4f-521a-4dc4-ba0c-388027b012df.jsonl`
- `/root/.openclaw/agents/main/sessions/59c5ae7d-bee3-4738-97f4-e56f172475d6.jsonl`
- `/root/.openclaw/agents/main/sessions/88ba98c7-7d38-4621-ad50-f20f2ebbd62e.jsonl`
- `/root/.openclaw/agents/main/sessions/215a7772-5243-4882-b750-439110824f4b.jsonl`

## Concrete Log Evidence

### Case 1: Wrong answer until the user explicitly said to inspect mounted files

Session:

- `/root/.openclaw/agents/main/sessions/a4cbd5af-0d03-40ea-a879-12635821327a.jsonl`

Observed sequence:

1. User asked: `Where would it fit in the 4 canonical memory classes we set?`
2. The turn carried a bootstrap truncation warning saying project context was
   partial and relevant files should be read directly.
3. Main called `memory_search`.
4. `memory_search` returned no results.
5. Main tried to read `/home/node/.openclaw/workspace/memory/2026-04-11.md`.
6. That read failed with `ENOENT`.
7. Main then read `/home/node/.openclaw/workspace/MEMORY.md`.
8. Main still did not escalate to the curated engineering repo import even
   though the question was about canonical memory classes owned by the repo
   memory-system docs.

Why this matters:

- The mounted repo was not invisible.
- Main simply did not route to it.
- Main preferred workspace memory continuity files over mounted
  implementation-truth docs.

### Case 2: Even after the user said "look at the mounted memory project files", Main still did not route to the curated import

Same session:

- `/root/.openclaw/agents/main/sessions/a4cbd5af-0d03-40ea-a879-12635821327a.jsonl`

Observed sequence:

1. User corrected Main:
   `If you look at the mounted memory project files, you will see there is a different set of 4 canonical memory classes.`
2. Main called `memory_search` again with a query about mounted memory project
   files.
3. `memory_search` again returned no results.
4. Main then searched `/home/node/.openclaw/workspace` and `/app`, not the
   curated engineering repo import path.
5. The first grep attempt hung.
6. The follow-up attempt failed because `python` was not present in that
   environment.
7. Main still did not switch to `imports/engineering_repo/...`.

Why this matters:

- The failure mode is not only "didn't think to search."
- Even after an explicit mounted-file instruction, Main used poor search roots.
- The routing failure is therefore stronger than a simple one-off oversight.

### Case 3: Workspace-memory fallback happens after missing-file reads

Sessions:

- `/root/.openclaw/agents/main/sessions/59c5ae7d-bee3-4738-97f4-e56f172475d6.jsonl`
- `/root/.openclaw/agents/main/sessions/215a7772-5243-4882-b750-439110824f4b.jsonl`

Observed pattern:

- Main attempted reads like:
  - `/home/node/.openclaw/workspace/MEMORY.md`
  - `/home/node/.openclaw/workspace/memory/2026-04-08.md`
  - `/home/node/.openclaw/workspace/memory/2026-04-03.md`
- Those reads sometimes failed with `ENOENT`.
- Main then continued from workspace memory surfaces or memory-search results
  rather than escalating to mounted canonical sources.

Why this matters:

- Missing workspace memory leaves are not treated as a reason to switch source
  domains.
- That encourages stale or incomplete workspace context to dominate when a
  mounted repo actually owns the answer.

### Case 4: Partial-ingestion risk is real, even when the tooling exposes it honestly

Session:

- `/root/.openclaw/agents/main/sessions/88ba98c7-7d38-4621-ad50-f20f2ebbd62e.jsonl`

Observed sequence:

- `document_read` returned chunked coverage metadata with
  `coverage.complete: false` and an explicit instruction to continue until
  `verify`.
- The tool correctly required a later `verify` call before full-coverage claims.

Why this matters:

- The reading layer already exposes partial-ingestion truth.
- If Main does not complete the required `document_read` flow, it can still
  reason from incomplete coverage.
- This is a secondary contributing risk, but it is not the primary failure
  shown in the mounted memory-class example.

## What The Evidence Shows

### Does Main session actually see mounted files by default?

Yes, in the architectural sense:

- the workspace has a canonical curated-import model
- the engineering repo is exposed through `imports/engineering_repo/content`
- workspace docs already describe that import layer as the preferred entry for
  repo-oriented tasks

But Main does not reliably use that visibility on its own.

### Is the issue visibility, reading, ingestion, or reasoning?

Primary issue:

- retrieval and discovery routing failure

Secondary issues:

- stale workspace-memory bias
- incomplete-read risk when chunked document ingestion is not fully completed

Not the main issue:

- literal mount absence

The current evidence supports:

1. Main can conceptually access mounted repo truth.
2. Main often does not route there unless the prompt strongly forces it.
3. When workspace memory files are already loaded, Main over-trusts them for
   repo-coupled factual questions.
4. Missing daily workspace memory files do not automatically trigger a switch
   to mounted canonical sources.

## Smallest Likely Cause Set

1. Workspace routing guidance was not explicit enough about source-of-truth
   precedence when workspace memory and mounted repo docs both speak to the
   same topic.
2. Memory-specific workspace navigation pointed structured memory work toward
   `projects/maintenance/` instead of a dedicated `projects/memory/` home,
   which made memory routing look more like generic maintenance context than a
   distinct program with repo-canonical docs.
3. Main overused workspace `MEMORY.md` and daily memory leaves as answer
   sources for code-coupled memory-system questions.
4. Chunked document ingestion remains a secondary failure multiplier when the
   model does not complete the full `document_read` loop.

## What Was Fixed In This Pass

Workspace normalization:

- added a dedicated workspace project home at
  `/root/.openclaw/workspace/projects/memory/INDEX.md`
- updated workspace project navigation so memory no longer routes through
  maintenance by default
- updated workspace memory navigation so structured memory-program work points
  to `projects/memory/INDEX.md`

Routing clarification:

- updated `/root/.openclaw/workspace/AGENTS.md` to say that mounted repo
  implementation truth outranks workspace memory/project-summary files for
  repo-coupled questions
- added an explicit memory-system routing hint that points Main to the
  engineering repo curated import for canonical memory classes and
  implementation facts
- updated `/root/.openclaw/workspace/imports/engineering_repo/INDEX.md` to
  make `docs/memory-system/` the start point for memory-system truth

## What Was Not Fixed In This Pass

- no runtime code change was made to force Main to choose curated imports
  automatically
- no change was made to memory search itself
- no change was made to the low-level file-read or `document_read` tool
  implementation
- no attempt was made to rewrite startup bootstrap injection or session-memory
  loading behavior

## Confidence

Moderate to high.

Why not absolute:

- the session logs show the routing failure clearly
- they do not independently prove every internal ranking reason behind the
  model's choice
- some failures could still include interpretation errors after reading
  partial context

## Recommended Next Fix Tranche

If the mounted-file problem persists after the routing/index clarification in
this pass, the next fix tranche should stay narrow and target one of these:

1. startup/routing prompt enforcement
   - make repo-canonical source escalation mandatory when:
     - bootstrap context is truncated
     - workspace daily memory read fails
     - the question is about repo-coupled implementation truth
2. mounted-source precedence logic
   - add an explicit source-of-truth rule to the Main-session retrieval path
     so workspace continuity files cannot outrank mounted canonical docs for
     implementation questions
3. chunked-read discipline
   - harden the Main-session guidance so chunked `document_read` flows must be
     completed and verified before answering long-doc questions

## Required Conclusion

### A. How memory should be normalized into the workspace project structure

Memory should have its own workspace project under `projects/memory/` for
tracking, re-entry, and cross-project coordination.

### B. What remains canonical in the engineering repo

The engineering repo remains the canonical implementation and architecture
truth for the memory system, especially `docs/memory-system/*` and related
repo audits.

### C. What recent Main session log evidence shows

Recent Main logs show Main repeatedly preferring workspace memory files and
workspace-local search roots even when the user explicitly asked for mounted
memory project files.

### D. Why mounted-file facts were missed or answered incorrectly

Mounted-file facts were missed mainly because Main routed to the wrong source
domain first and did not escalate to the curated engineering repo import when
workspace memory proved incomplete or wrong.

### E. Whether the issue is visibility, ingestion, or reasoning

Primarily visibility-through-routing failure, secondarily incomplete-ingestion
risk, and only then reasoning.

### F. What was fixed in this pass

Workspace memory normalization and source-of-truth routing guidance were
fixed. No runtime code path was changed.

### G. What remains for the next fix tranche

If the issue still reproduces, the next tranche should target explicit
source-of-truth escalation in Main-session startup/retrieval behavior and
stronger chunked-read completion discipline.
