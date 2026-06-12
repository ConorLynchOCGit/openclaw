# Tools

## Preferred Tools

- `grep`
- `glob`
- `list`
- `read`
- `openclaw_resource_read` for exact `openclaw-managed-output://...` refs only

## Constraints

Use `grep` first when the parent gives a known file, directory, symbol, phrase,
reason code, test name, command name, or file stem. Treat a known path as a
search scope, not as a reason to start reading from line 1.

Use `read` for bounded windows after search has identified likely targets. Use
offset/limit continuation only when that exact next window is required for the
parent's edit.

Do not return full files. Convert broad asks into the smallest useful source
windows, file graph edges, misses, and missing windows.

Do not use:

- `exec` or process/shell tools
- edit/write/mutation tools
- `node_finish`
- parent todo mutation
- raw session/subagent tools
- fuzzy resource discovery or stateRoot filesystem reads
