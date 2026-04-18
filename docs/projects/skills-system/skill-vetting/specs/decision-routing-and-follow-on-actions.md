---
summary: "Decision routing contract for install, inspire, and reject outcomes from Skill Vetting."
title: "Decision Routing And Follow-On Actions"
---

# Decision Routing And Follow-On Actions

Skill Vetting outcomes are not just labels. They route follow-on work.

## Outcome routes

### `install`

Use only when:

- review evidence is complete
- no blocking `high` or `critical` finding remains
- install conditions are explicit

Follow-on actions:

1. send outcome to future skill allowlist / policy work
2. record exact allowed runtime surfaces
3. record prerequisites for install
4. if the install is still deferred, say why

### `inspire`

Use when:

- the idea is useful
- the implementation is risky, non-native, too broad, or otherwise wrong for
  direct adoption

Follow-on actions:

1. produce a structured `borrow the idea, not the code` section
2. list the useful patterns worth carrying over
3. list the parts that must not be copied directly
4. set the next output to one of:
   - project spec
   - bounded implementation task
   - no follow-on

### `reject`

Use when:

- the implementation is not acceptable to install
- the idea is not worth borrowing, or the risk overwhelms the value

Follow-on actions:

1. record the blocking findings
2. record whether any idea should still be salvaged
3. link the outcome into operator reporting if the risk is meaningful enough to
   remember

## Risk-tier to outcome guidance

| Risk tier | Default route                                  |
| --------- | ---------------------------------------------- |
| `low`     | `install` only if conditions are explicit      |
| `medium`  | usually `install` with conditions or `inspire` |
| `high`    | usually `inspire` or `reject`                  |
| `extreme` | `reject`                                       |

## Operator review/reporting linkage

High-risk or policy-relevant outcomes should be suitable for later linkage
into:

- operator review notes
- future skill allowlist/policy work
- follow-on project/spec generation

The report must carry enough structure that those future integrations do not
need to reverse-engineer free-form prose.
