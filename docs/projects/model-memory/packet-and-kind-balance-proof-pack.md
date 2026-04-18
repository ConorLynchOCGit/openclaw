---
summary: "Explicit proof checklist for the packet-compiler rollout and kind-balance investigation."
title: "Packet And Kind Balance Proof Pack"
---

# Packet And Kind Balance Proof Pack

This file tracks the proof obligations for the current top-priority
`model-memory` work:

- packet compiler quality and packet-system unification
- `kind`-primary migration
- kind-balance repair, especially the missing active `rule` problem

These are linked. Packet quality cannot be judged honestly if the live corpus is
structurally skewed.

## Current evidence

Current packet evidence already exists in:

- [Model Driven Packet Assembly Evaluation](/projects/model-memory/specs/model-driven-packet-assembly-evaluation)
- [Model Memory Evidence](/projects/model-memory/evidence)

Current observed kind skew in the `MEMORY.md`-eligible basket:

- `fact: 241`
- `procedure: 5`
- `preference: 19`
- `rule: 0`

That is the key reason the missing active `rule` lane is now treated as a
top-priority implementation question rather than background cleanup.

## Proof items

| Item                                           | Current status      | Evidence path                                                                                                                                                                                                         | Validation path                                                                                                                       | Proof complete when                                                                                                     |
| ---------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Shared packet compiler spec landed             | `repo_documented`   | [Packet Compiler And Budgeting](/projects/model-memory/specs/packet-compiler-and-budgeting)                                                                                                                           | Review spec coverage across bootstrap, dynamic, and retrieval packs                                                                   | Packet rules are specified once and packet-specific behavior is expressed as policy rather than ad hoc duplicated logic |
| Retrieval pack covered by shared rails         | `repo_documented`   | [Retrieval And Context Injection](/projects/model-memory/specs/retrieval-context-injection), [Context Engine](/projects/model-memory/specs/context-engine)                                                            | Review the retrieval-pack sections added in the current tranche                                                                       | Retrieval packets have explicit budget, selection, synthesis, and provenance rules under the shared packet system       |
| `MEMORY.md` stronger-model capped experiment   | `evidence_present`  | `docs/projects/model-memory/evidence/memory-md-model-driven-experiment-2026-04-17-kind-quotas-v1-openai-stronger-openrouter-openai-gpt-5-4-packet.md`                                                                 | Compare packet quality against the retained nano and baseline packet artifacts plus the retained capped prompt/basket pair            | The experiment shows disciplined packet shape under the new capped prompt contract                                      |
| `kind`-primary migration is top priority       | `repo_documented`   | [Roadmap](/projects/model-memory/roadmap), [Phase 2 Execution Roadmap](/projects/model-memory/phase-2-execution-roadmap), [Kind Primary Schema Migration](/projects/model-memory/specs/kind-primary-schema-migration) | Review the current priority ordering in project docs                                                                                  | The project docs clearly place packet quality plus `kind`-primary migration ahead of broader Phase 2 feature work       |
| Missing active `rule` generation investigation | `open_top_priority` | [Kind Primary Schema Migration](/projects/model-memory/specs/kind-primary-schema-migration), [Prompt Contract Phase 2 Migration](/projects/model-memory/specs/prompt-contract-phase2-migration)                       | Re-run corpus-kind counting and trace extraction/adjudication paths to explain why `rule` stays at zero                               | There is an evidence-backed root cause and an implemented repair path for rule underproduction                          |
| Kind-balance packet effect                     | `open_top_priority` | current packet experiment artifacts plus live corpus skew                                                                                                                                                             | Re-run the packet experiment after the first kind-balance repair and compare section composition, token count, and qualitative output | Packet quality improves because the underlying basket contains a healthier kind mix, not just better compression        |

## Suggested proof commands

These are the current bounded proof paths for this lane:

```bash
pnpm exec oxfmt --check docs/projects/model-memory/specs/packet-compiler-and-budgeting.md
pnpm exec oxfmt --check docs/projects/model-memory/specs/model-driven-packet-assembly-evaluation.md
node scripts/check-doc-topology.mjs
```

Packet-quality review remains evidence-driven rather than test-only:

- inspect the generated packet artifact
- inspect the paired basket artifact
- inspect the prompt artifact used to generate it
- compare token shape and section balance across variants

## Relationship to the broader memory roadmap

This proof pack sits in front of the larger Phase 2 feature waves.

The next architectural waves should not outrun this proof lane because:

- graph and capsule outputs will only be useful if packet assembly is already
  disciplined
- retrieval quality will stay misleading if kind skew distorts what the packet
  compiler has available to work with
- `canonicalClass` demotion should be reflected in prompt contracts and packet
  shaping before denser derived artifacts are rolled out
