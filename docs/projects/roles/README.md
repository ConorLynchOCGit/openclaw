# Role Specs

Purpose:

- adapt a small, priority subset of external role-library patterns into OpenClaw-native role specs
- map role behavior onto existing Phase 10 agents without creating new runtime agent types
- keep approval boundaries and workspace rules explicit before broader rollout

Source-library use:

- treat `agency-agents` as a source/template library, not a drop-in module
- pull only role structure, workflow shape, and deliverable ideas that fit the current OpenClaw runtime

First-slice roster:

- `Engineering Builder` -> mapped onto `builder`
- `Social Drafting Operator` -> mapped onto `writer`
- `Technical / Market Research Operator` -> mapped onto `researcher`
- derivative spec: `X / Twitter Thought-Leadership Operator (Grok-first)`

Minimum role-spec format:

- `Role name`
- `Mapped base agent`
- `Source inspiration`
- `Purpose`
- `Inputs`
- `Outputs`
- `Workspace scope`
- `Session mode`
- `Approval boundary`
- `Routing rule`
- `Dry-run proof expectation`

Current boundary:

- no outbound publishing
- no new runtime agent types
- no paid-media or design implementation in this first slice
- `researcher` remains a spec-only support role until its auth lane is brought into parity

Promotion path:

- Phase 10.5 proved derivative role adaptation on top of existing worker agents
- Phase 10.6 is the first planned promotion from derivative spec to standalone specialist agent, starting with `X / Twitter Manager`
