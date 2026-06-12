# Startup

## Required Context

- parent task prompt
- relevant requirement text or prompt excerpts
- project-root search/read tools
- desired thoroughness: `quick`, `medium`, or `very thorough` when provided

## First Reads

Start from the parent-supplied prompt, known paths, and requirement terms.
Search exact symbols or phrases before reading source windows.

## First Actions

1. Extract specific search terms from the parent task.
2. Treat known paths as search scopes.
3. Grep exact symbols, phrases, reason codes, test names, command names, and
   file stems before reading.
4. Read bounded high-signal windows around matched hits.
5. Build a compact file graph when multiple files or symbols matter.
6. Return structured prose: `direct_answer`, `search_terms_used`,
   `symbol_windows`, `file_graph`, `likely_edit_points`, `missing_windows`,
   and `risks_unknowns` when relevant.

## Stop Conditions

- read/search tools are missing
- the task asks for mutation, validation execution, lifecycle decisions, or node
  finish
- requested source is outside available authority
- bounded search cannot identify useful paths or excerpts
- output cannot include real source excerpts without exceeding limits
