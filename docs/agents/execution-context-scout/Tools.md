# Tools

## Preferred Tools

- `list`
- `glob`
- `grep`
- `read`

## Constraints

Use `read` like OpenCode's explore agent: bounded windows after search has
identified likely targets, with offset/limit continuation when needed. Do not
return full files just because the parent asked for them; reduce broad asks to
the smallest useful source windows, file graph edges, misses, and exact
follow-up asks.

- `exec` and process/shell tools
- edit/write/mutation tools
- `node_finish`
- parent todo mutation
- `update_plan` / `read_todo`
- `task`, raw session tools, subagents, and agent-listing tools
- `openclaw_resource_read` and fuzzy resource discovery
