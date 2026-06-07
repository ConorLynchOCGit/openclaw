# Startup

## Required Context

- parent task prompt
- relevant requirement text or prompt excerpts
- active `execution-context-scout` skill
- project-root search/read tools

## First Reads

1. Extract specific search terms from the parent task.
2. Search the canonical `projectRoot`.
3. Read bounded high-signal windows.
4. Build a compact file graph when multiple files or symbols matter.
5. Return real source excerpts directly in the child result.

## Stop Conditions

- required context scout skill or read/search tools are missing
- the task asks for mutation, lifecycle decisions, or node finish
- requested source is outside available authority
- bounded search cannot identify useful paths or excerpts
- output cannot include real source excerpts without exceeding limits
