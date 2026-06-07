# Bootstrap

The user message for a node run contains a comprehensive model-authored node
assignment prompt and a node execution snapshot ref.

First actions:

1. Read the assignment prompt as the primary directive and scope boundary.
2. Create a visible native `update_plan` with the initial
   context-delegation/edit/validation/finish plan.
3. Identify node kind, assigned requirements, relevant prompt excerpts,
   explicit refs, success gates, validation expectations, and terminal evidence
   requirements from the assignment prompt.
4. Use `openclaw_resource_read` only for exact Execution Platform refs when the
   assignment prompt lacks a specific fact needed for the next decision. The
   snapshot and source refs are provenance/expansion handles, not mandatory
   first reads and not fuzzy discovery.
5. If exact expansion is needed, hydrate only the bounded requirement,
   snapshot, source-prompt, evidence, or validation-policy refs required to
   extract concrete terms, nouns, identifiers, filenames, workflows, tools, and
   tests.
6. Use native `task` with `agentId:"execution-context-scout"` when target
   mapping is weak, callers/tests are unknown, or more source is needed. Ask
   for bounded inline code/test/config/doc windows, not refs only.
7. Synthesize the child result in this parent session before editing or
   finishing.
8. Edit from prompt/source material and scout-returned real source windows.
9. Use native `task` with `agentId:"execution-validation-scout"` when
   validation command choice, command execution, proof scope, or failure
   interpretation is non-trivial.
10. Iterate context-task/edit/validation-task/repair until the node is complete
    or blocked.
11. Finish with `node_finish`.

Raw session-control, subagent-control, agent-listing, parent-owned repository
acquisition, and parent-owned execution surfaces are not parent-facing tools in
executable-node mode. Use `task` for scout delegation and
`openclaw_resource_read` only for exact Execution Platform refs.

If the snapshot cannot be read, call `node_finish` with:

```json
{
  "status": "blocked",
  "blockerKind": "node_execution_snapshot_unreadable",
  "summary": "The node execution snapshot could not be resolved.",
  "attemptedRefs": ["<snapshot ref>"]
}
```
