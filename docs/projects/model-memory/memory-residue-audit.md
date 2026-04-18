---
summary: "Concrete audit of model-memory evidence residue, legacy retirement debt, and remaining config/runtime cleanup."
title: "Memory Residue Audit"
---

# Memory Residue Audit

This audit classifies the current memory-related residue into four concrete
buckets and records what is safe to act on in this sprint.

## 1. Safe-to-delete experiment residue

These files are superseded packet-experiment intermediates. They are not the
canonical retained proof set once the representative comparison artifacts,
prompt contract, and source basket are kept.

| Path                                                                                                                                                                  | Why this is residue                                                                        | Action | Safe now | Preserve elsewhere first |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------ | -------- | ------------------------ |
| `docs/projects/model-memory/evidence/memory-md-model-driven-experiment-2026-04-17-baseline-openai-stronger-openrouter-openai-gpt-5-4-basket.json`                     | duplicate baseline source basket once the baseline packet is retained                      | delete | yes      | no                       |
| `docs/projects/model-memory/evidence/memory-md-model-driven-experiment-2026-04-17-baseline-openai-stronger-openrouter-openai-gpt-5-4-basket.md`                       | markdown mirror of the superseded baseline basket                                          | delete | yes      | no                       |
| `docs/projects/model-memory/evidence/memory-md-model-driven-experiment-2026-04-17-baseline-openai-stronger-openrouter-openai-gpt-5-4-frontier-review-prompt.md`       | ad hoc review prompt, not canonical proof                                                  | delete | yes      | no                       |
| `docs/projects/model-memory/evidence/memory-md-model-driven-experiment-2026-04-17-baseline-openai-stronger-openrouter-openai-gpt-5-4-output.json`                     | raw intermediate output once the rendered packet is retained                               | delete | yes      | no                       |
| `docs/projects/model-memory/evidence/memory-md-model-driven-experiment-2026-04-17-baseline-openai-stronger-openrouter-openai-gpt-5-4-prompts.json`                    | superseded prompt variant after the capped prompt contract was retained                    | delete | yes      | no                       |
| `docs/projects/model-memory/evidence/memory-md-model-driven-experiment-2026-04-17-basket.json`                                                                        | original nano basket scratch once the nano packet is retained                              | delete | yes      | no                       |
| `docs/projects/model-memory/evidence/memory-md-model-driven-experiment-2026-04-17-basket.md`                                                                          | markdown mirror of the original nano basket                                                | delete | yes      | no                       |
| `docs/projects/model-memory/evidence/memory-md-model-driven-experiment-2026-04-17-frontier-review-prompt.md`                                                          | ad hoc frontier-review helper, not canonical evidence                                      | delete | yes      | no                       |
| `docs/projects/model-memory/evidence/memory-md-model-driven-experiment-2026-04-17-prompts.json`                                                                       | superseded original prompt contract after the retained stronger-model contract             | delete | yes      | no                       |
| `docs/projects/model-memory/evidence/memory-md-model-driven-experiment-2026-04-17-nano-output.json`                                                                   | raw output intermediate once the nano packet is retained                                   | delete | yes      | no                       |
| `docs/projects/model-memory/evidence/memory-md-model-driven-experiment-2026-04-17-kind-quotas-v1-openai-stronger-openrouter-openai-gpt-5-4-basket.md`                 | markdown duplicate of the retained JSON basket                                             | delete | yes      | no                       |
| `docs/projects/model-memory/evidence/memory-md-model-driven-experiment-2026-04-17-kind-quotas-v1-openai-stronger-openrouter-openai-gpt-5-4-frontier-review-prompt.md` | review helper, not canonical evidence                                                      | delete | yes      | no                       |
| `docs/projects/model-memory/evidence/memory-md-model-driven-experiment-2026-04-17-kind-quotas-v1-openai-stronger-openrouter-openai-gpt-5-4-output.json`               | raw intermediate output once the rendered packet is retained                               | delete | yes      | no                       |
| `docs/projects/model-memory/evidence/memory-md-model-driven-experiment-2026-04-17-kind-quotas-v1-openrouter-openai-gpt-5-4-nano-basket.json`                          | superseded nano-with-kind-quotas basket scratch                                            | delete | yes      | no                       |
| `docs/projects/model-memory/evidence/memory-md-model-driven-experiment-2026-04-17-kind-quotas-v1-openrouter-openai-gpt-5-4-nano-basket.md`                            | markdown mirror of the same scratch basket                                                 | delete | yes      | no                       |
| `docs/projects/model-memory/evidence/memory-md-model-driven-experiment-2026-04-17-kind-quotas-v1-openrouter-openai-gpt-5-4-nano-frontier-review-prompt.md`            | review helper, not canonical evidence                                                      | delete | yes      | no                       |
| `docs/projects/model-memory/evidence/memory-md-model-driven-experiment-2026-04-17-kind-quotas-v1-openrouter-openai-gpt-5-4-nano-output.json`                          | raw intermediate output once the packet is retained or rejected                            | delete | yes      | no                       |
| `docs/projects/model-memory/evidence/memory-md-model-driven-experiment-2026-04-17-kind-quotas-v1-openrouter-openai-gpt-5-4-nano-packet.md`                            | superseded nano-with-kind-quotas packet after the final retained comparison set was chosen | delete | yes      | no                       |
| `docs/projects/model-memory/evidence/memory-md-model-driven-experiment-2026-04-17-kind-quotas-v1-openrouter-openai-gpt-5-4-nano-prompts.json`                         | superseded prompt artifact                                                                 | delete | yes      | no                       |

## 2. Evidence-to-keep canonical artifacts

These files remain part of the canonical retained proof and should stay.

| Path or surface                                                                                                                                          | Why it stays                                                      | Action            | Safe now | Preserve elsewhere first |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------- | -------- | ------------------------ |
| `docs/projects/model-memory/evidence/index.md`                                                                                                           | retained-evidence index for this directory                        | keep and maintain | yes      | no                       |
| `docs/projects/model-memory/evidence/memory-md-model-driven-experiment-2026-04-17-nano-packet.md`                                                        | first cheap-model packet comparison point                         | keep              | yes      | no                       |
| `docs/projects/model-memory/evidence/memory-md-model-driven-experiment-2026-04-17-baseline-openai-stronger-openrouter-openai-gpt-5-4-packet.md`          | stronger-model baseline packet comparison point                   | keep              | yes      | no                       |
| `docs/projects/model-memory/evidence/memory-md-model-driven-experiment-2026-04-17-kind-quotas-v1-openai-stronger-openrouter-openai-gpt-5-4-basket.json`  | retained source basket for the capped stronger-model experiment   | keep              | yes      | no                       |
| `docs/projects/model-memory/evidence/memory-md-model-driven-experiment-2026-04-17-kind-quotas-v1-openai-stronger-openrouter-openai-gpt-5-4-prompts.json` | retained prompt contract for the capped stronger-model experiment | keep              | yes      | no                       |
| `docs/projects/model-memory/evidence/memory-md-model-driven-experiment-2026-04-17-kind-quotas-v1-openai-stronger-openrouter-openai-gpt-5-4-packet.md`    | current retained capped stronger-model packet                     | keep              | yes      | no                       |
| `docs/projects/model-memory/specs/model-driven-packet-assembly-evaluation.md`                                                                            | defines the packet experiment contract                            | keep              | yes      | no                       |
| `docs/projects/model-memory/packet-and-kind-balance-proof-pack.md`                                                                                       | tracks current packet/kind proof obligations                      | keep              | yes      | no                       |
| `scripts/model-memory-model-driven-packet-experiment.mjs`                                                                                                | reproducer and evidence-generation runner                         | keep              | yes      | no                       |
| `docs/projects/model-memory/evidence/post-cutover/**`                                                                                                    | production cutover verification trail                             | keep              | yes      | no                       |

## 3. Legacy-memory retirement debt still open

These surfaces are still open retirement debt and should be tracked, not
deleted blindly in this sprint.

| Path or surface                                                             | Why it remains open                                                                     | Action                                         | Safe now | Preserve elsewhere first |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------- | -------- | ------------------------ |
| `src/memory/`                                                               | large legacy runtime surface still present in repo                                      | retire later through cutover plan              | no       | yes                      |
| `extensions/memory-core/`                                                   | legacy bundled plugin still present and user explicitly said not to weaken it mid-slice | retire later after bounded deletion tranche    | no       | yes                      |
| `extensions/memory-lancedb/`                                                | legacy bundled memory plugin still present                                              | retire later after explicit deletion slice     | no       | yes                      |
| `src/agents/tools/memory-tool.ts`                                           | legacy tool surface still in repo                                                       | retire later with runtime/read-path review     | no       | yes                      |
| `src/agents/memory-search.ts`                                               | legacy retrieval seam still present                                                     | retire later with cutover deletion tranche     | no       | yes                      |
| `src/cli/memory-cli.ts`                                                     | legacy CLI surface still present                                                        | retire later with CLI deprecation removal      | no       | yes                      |
| `src/gateway/server-startup-memory.ts`                                      | startup seam remains, but legacy QMD/plugin fallback was removed in this sprint         | continue retirement with status/doctor cleanup | yes      | no                       |
| `docs/concepts/memory.md`, `docs/cli/memory.md`, `docs/automation/hooks.md` | legacy docs still need rewrite/removal in the final retirement tranche                  | retire later                                   | no       | yes                      |

## 4. Config/runtime residue still needing cleanup

These are not safe experiment deletions. They are open runtime/config cleanup
items that should stay visible as debt.

| Surface                                                             | Why it is residue                                                                                  | Action                                                            | Safe now | Preserve elsewhere first |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | -------- | ------------------------ |
| `plugins.slots.memory` compatibility handling                       | legacy config seam remains as a retired compatibility surface even though live cutover uses `none` | keep documented as retirement debt until deletion tranche         | no       | yes                      |
| `agents.defaults.memorySearch.*` compatibility handling             | legacy search config remains as a retired compatibility seam                                       | keep documented as retirement debt until deletion tranche         | no       | yes                      |
| workspace `MEMORY.md` / `memory/*.md` coexistence during transition | still part of continuity and daily-summary testing, not fully retired                              | keep until explicit post-soak retirement cut                      | no       | yes                      |
| built-in `clawhub` skill depending on missing host binary           | capability exists in repo but can be unavailable at runtime without local tooling                  | fix skill posture now; keep runtime availability under validation | yes      | no                       |

## Cleanup executed in this sprint

This sprint is authorized to:

- delete the safe packet-experiment intermediates listed in section 1
- keep and normalize the retained experiment artifacts listed in section 2
- record the still-open retirement and config/runtime debt from sections 3 and 4
- preserve the `session-memory` hook as a continuity producer and keep docs
  clear that it is not the semantic memory authority
- rewrite the highest-signal legacy docs to point at model-memory
- remove the gateway startup fallback to legacy QMD/plugin memory

This sprint is not authorized to:

- delete the legacy memory runtime itself
- remove transition-era continuity surfaces that are still part of live testing
- erase historical cutover proof artifacts
