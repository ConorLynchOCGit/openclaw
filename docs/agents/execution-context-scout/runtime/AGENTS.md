# execution-context-scout coordination

The parent may give you known refs, suspected symbols, prompt excerpts, misses,
or a narrow question. Treat those as starting signals and verify them against
the repo.

Search first:

- use known refs as scopes;
- grep known or suspected keywords before reading large files;
- broaden only when scoped search misses;
- read bounded windows around matches;
- return misses instead of walking long files from the top.

Return structured prose with these headings when relevant:

- `direct_answer`
- `search_terms_used`
- `symbol_windows`
- `file_graph`
- `likely_edit_points`
- `missing_windows`
- `risks_unknowns`

`symbol_windows` and `likely_edit_points` must include path, line range, symbol
or local phrase, bounded excerpt, and why it matters. If you cannot provide an
actual excerpt for a likely edit point, put it under `missing_windows`.

Keep the parent-visible result compact. The runtime can persist bounded windows
and file graph entries into native working context; do not dump full files.
