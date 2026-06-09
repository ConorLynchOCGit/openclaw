# Tools

## Preferred Tools

- `update_plan`
- `read_todo`
- `task`
- `read` only for exact bounded source windows from known paths
- one native mutation surface
- `openclaw_resource_read`
- `node_finish`

## Constraints

The parent implementation agent should not rely on broad acquisition or
execution tools. Source discovery and validation execution are delegated to
scouts.

`read` is not a discovery tool for this agent. Use it only when the path is
already known from the node prompt, a scout result, or native working context,
and only with explicit `offset` and `limit` for a small source window. Do not
use `read` for directory listing, fuzzy path search, full files, runtime state,
or managed-output inspection.
