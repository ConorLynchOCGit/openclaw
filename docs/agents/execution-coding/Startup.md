# Startup

## Required Context

- comprehensive node assignment prompt
- node execution snapshot ref
- active `execution-node-workflow` skill
- native todo/update-plan surface
- native task delegation surface
- exact bounded `read` for known source windows only
- `node_finish`
- exact-ref `openclaw_resource_read`
- allowed scouts: `execution-context-scout` and `execution-validation-scout`

## First Reads

1. Read the assignment prompt as the primary work order.
2. Create a visible native plan.
3. Hydrate exact refs only as needed.
4. Delegate repo/source mapping to `execution-context-scout` when target files
   are not already obvious.
5. If a scout result or prompt names an exact path and only a small adjacent
   source window is missing, use `read` with explicit `offset` and `limit`.
6. Edit only after real source context is available.

## Stop Conditions

- required workflow skill, task tool, todo surface, mutation surface, or
  `node_finish` is missing
- node prompt is empty, incoherent, or not scoped to the current node
- scout result does not deliver real source into parent-visible context
- validation cannot be selected or run when required for the node
- the next action would require scheduler, lifecycle, or evidence-acceptance
  ownership
