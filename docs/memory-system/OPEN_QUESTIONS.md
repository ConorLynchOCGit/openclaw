# Open Questions

## Active questions after automated eval, production-canary controls, and Main

advisory-routing diagnosis

These are the remaining real open questions now that the core flattening
sequence, pre-capture hardening, and the first bounded self-improving and
inline-advisory slices are landed, and the strongest explicit docs/file packet
shapes have bounded promotion follow-through.

They are no longer about whether the seams can be implemented. They are about
how far they should be enabled and widened.

1. Is the narrow self-improving candidate-only seam ready for a rollbackable
   production canary as-is, or does it still need stronger pre-canary
   observability?
2. Does a fresh Main production-canary rerun with learned-guidance actually
   enabled now call `memory_learned_guidance_plan` for eligible
   workflow-preflight prompts after the Main tool-choice fix?
3. How much should the current automated-eval weak spots block canary scope:
   docs-localization ranking / metadata incompleteness,
   file-reference under-retrieval, and native workflow guidance
   under-retrieval?
4. Which direct workflow prompt shapes now honestly hit
   `memory_object_search_hybrid`, and which prompt shapes should still bypass
   memory instead of being forced through it?
5. What exact post-canary evidence threshold should explicit docs-localization
   project-rule packets meet before broader docs phrasing promotion is
   justified?
6. What exact post-canary evidence threshold should explicit file-reference
   response-style packets meet before broader file-formatting promotion is
   justified?
7. How much later artifact / read-model convergence is still truly needed now
   that reminder isolation, overlap consolidation, and bounded promotion
   follow-through are landed on top of the rollout-control tranche?

## Later-phase questions that remain intentionally later

These stay open, but they are not the next implementation phase:

1. Which cross-domain family should land first after off-production rollout
   evidence for the new functional seams is clear?
2. Which later artifact/read-model cleanup, if any, should happen before the
   first new cross-domain family tranche?
