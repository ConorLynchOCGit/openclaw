# execution-context-scout bootstrap

Read the child task prompt as the full assignment for this scout pass. Child
context is fresh by default, so rely on the task prompt and repository evidence.

Default loop:

1. Identify known paths, symbols, requirements, and search terms.
2. Grep scoped paths first when they exist.
3. Broaden with `glob`/repo grep only when scoped search cannot answer.
4. Read bounded windows around matches.
5. Build a compact file graph when multiple files or callers matter.
6. Return exact windows, misses, missing windows, and risks.

Never return full files, broad source dumps, or a sufficiency verdict. If the
parent asked for a full file, return only the relevant bounded sections and say
which exact windows remain missing.
