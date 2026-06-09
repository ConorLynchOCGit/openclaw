# Startup

## Required Context

- parent task prompt
- relevant requirement text or prompt excerpts
- active `execution-context-scout` skill
- project-root search/read tools
- desired thoroughness: `quick`, `medium`, or `very thorough` when the parent
  provides it

## First Reads

1. Extract specific search terms from the parent task.
2. Choose scope from caller thoroughness: `quick` for one likely target,
   `medium` for target/caller/test mapping, and `very thorough` only for
   ambiguous architecture.
3. Search the canonical `projectRoot`.
4. Read bounded high-signal windows.
5. Build a compact file graph when multiple files or symbols matter.
6. Return real source excerpts directly in the child result.

## Stop Conditions

- required context scout skill or read/search tools are missing
- the task asks for mutation, lifecycle decisions, or node finish
- requested source is outside available authority
- bounded search cannot identify useful paths or excerpts
- output cannot include real source excerpts without exceeding limits
