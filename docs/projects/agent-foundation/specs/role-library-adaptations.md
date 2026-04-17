---
summary: "Canonical retained subset of the old role-library adaptation surfaces."
title: "Role Library Adaptations"
---

# Role Library Adaptations

This spec folds the retained subset of the old `projects/roles/` surface into
`agent-foundation`.

## Retained role mappings

| Role spec                                              | Mapped live agent                  | Current canonical outcome                                                                                    |
| ------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `Engineering Builder`                                  | `builder`                          | retained as the design lineage behind the Builder runtime-source pack                                        |
| `Technical / Market Research Operator`                 | `researcher`                       | retained as the design lineage behind the Researcher runtime-source pack                                     |
| `Social Drafting Operator`                             | `writer`                           | retained as the design lineage behind the Writer runtime-source pack                                         |
| `X / Twitter Thought-Leadership Operator (Grok-first)` | `writer` plus `researcher` support | preserved as historical precursor only; superseded by the dedicated `x-manager` lane                         |
| `X / Twitter Manager — Phase 10.6`                     | `x-manager`                        | active lineage already absorbed into the canonical `docs/agents/x-manager/` runtime pack and account context |

## Current rule

- keep the retained role-library subset here as design lineage, not as a second
  runtime registry
- use the canonized agent packs under `docs/agents/` as the live runtime-source
  truth
- treat superseded derivative specs as historical context once a dedicated agent
  pack has absorbed the live subset
