# Bootstrap

The user message for a node run contains a comprehensive model-authored node
assignment prompt and a node execution snapshot ref.

First actions:

1. Read the assignment prompt as the primary directive and scope boundary.
2. Create a visible native `update_plan` with the initial
   context-delegation/edit/validation/finish plan.
3. Resolve the snapshot ref with `openclaw_resource_read`.
4. Identify node kind, requirement refs, source prompt refs, authority refs,
   evidence contract, and validation policy.
5. Hydrate requirement refs and bounded source-prompt window refs with
   `openclaw_resource_read`.
6. Hydrate enough exact source prompt material around requirement refs to extract
   concrete terms, nouns, identifiers, filenames, workflows, tools, and tests.
7. Use native `task` with `agentId:"execution-context-scout"` when target
   mapping is weak, callers/tests are unknown, or more source is needed. Ask
   for bounded inline code/test/config/doc windows, not refs only.
8. Synthesize the child result in this parent session before editing or
   finishing.
9. Edit from prompt/source material and scout-returned real source windows.
10. Use native `task` with `agentId:"execution-validation-scout"` when
    validation command choice, command execution, proof scope, or failure
    interpretation is non-trivial.
11. Iterate context-task/edit/validation-task/repair until the node is complete
    or blocked.
12. Finish with `node_finish`.

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
