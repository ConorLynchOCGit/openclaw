# Memory Projection Destinations

## Purpose

Define which canonical memory kinds may project into which native OpenClaw file
surfaces and which surfaces must remain retrieval-only or human-authored.

## Destination principles

- use the smallest prompt-facing surface that matches the job
- do not pay global prompt budget for project-local detail
- do not project reference material into bootstrap by default
- do not project raw recalled text

## Canonical kind mapping

### `user`

Primary destinations:

- `USER.md`

Secondary destinations:

- `MEMORY.md` only for a tiny subset of universally relevant cross-project user
  context

Keep in DB only when:

- the item is low-priority
- the item is situational
- the item is not worth global bootstrap budget

Examples:

- naming preferences
- standing response preferences
- durable personal constraints
- persistent collaboration style expectations

### `feedback`

Primary destinations:

- `TOOLS.md`
- `USER.md` when the feedback is really a standing user preference rather than
  a tooling/workflow convention

Not a default destination:

- `AGENTS.md`
- `SOUL.md`

Why:

- `AGENTS.md` is policy, not a factual memory dump
- `SOUL.md` is human-authored in v1

Examples:

- use numbered steps when giving instructions
- keep replies concise
- use repo-root-relative file references
- follow a recurring verification pattern

### `project`

Primary destinations:

- project-local docs

Allowed top-level destination:

- `MEMORY.md` only as a compact active-project pointer surface

Do not use top-level bootstrap for:

- rich project detail
- project history
- project reference inventories

Examples of project-local outputs:

- project summary
- active constraints
- durable decisions
- current state pointers

### `reference`

Default posture:

- DB-only retrieval
- project-local reference docs when needed

Not a default bootstrap destination.

Promote only if:

- the reference has become a standing operational assumption
- the reference materially changes default behavior before retrieval starts

## Native file posture by file

### `AGENTS.md`

Receives:

- no factual memory projections in v1

Contains:

- memory operating system rules
- precedence
- projection policy
- writeback constraints

### `USER.md`

Receives:

- stable approved `user` memory
- a narrow subset of durable approved preference-like `feedback`

### `TOOLS.md`

Receives:

- durable approved workflow/tool preferences
- durable operating conventions that should shape default execution behavior

### `SOUL.md`

Receives:

- nothing from the compiler in v1

### `MEMORY.md`

Receives:

- cross-project executive digest
- compact strategic context
- active project pointers
- a very small set of universal durable facts that matter across most main
  sessions

### project-local memory files

Receives:

- approved `project` memory selected for that project
- project-scoped reference summaries when truly useful

### continuity files under `memory/`

Receives:

- no compiler projection from canonical durable memory in v1 except the daily
  continuity file

## Proposed v1 section shapes

### `USER.md`

- Stable identity and address preferences
- Standing response preferences
- Recurring constraints
- Known operating preferences
- Do-not-forget items

### `TOOLS.md`

- Tool-use preferences
- Workflow conventions
- Environment habits
- Common operator gotchas worth always knowing

### `MEMORY.md`

- Cross-project durable context
- Active project index
- Current strategic cautions
- Read-next pointers

## Excluded destination classes in v1

- `HEARTBEAT.md`
- `IDENTITY.md`
- `BOOTSTRAP.md`
- compiler-written factual sections in `AGENTS.md`
- compiler-written factual or behavioral sections in `SOUL.md`
