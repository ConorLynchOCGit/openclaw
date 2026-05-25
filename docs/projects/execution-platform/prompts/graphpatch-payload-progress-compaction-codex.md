# GraphPatch Payload Store And Progress Compaction

Implement `openclaw-convergence.graphpatch-payload-progress-compaction` from
`docs/projects/execution-platform/specs/demand-driven-frontier-orchestration-and-context-broker.md`.

This is a production runtime implementation pass, not a proof-shaped patch.
The latest Product/Spec replay failed before implementation because
`agent_team.scheduler_progress` metadata attempted to store a 114KB body
against the 64KB runtime artifact manifest contract. Fix the architecture
generically.

## Required Outcomes

1. Add a canonical payload-backed `RuntimeGraphPatch` contract.
   - Store large graph mutation bodies in the runtime artifact payload store.
   - Include node adds, edge adds, node updates, readiness updates, Work Queue
     child refs, evidence refs, branch refs, scheduler iteration, superstep,
     reason codes, and raw-storage flags set false.
   - Attach manifests only through the runtime artifact contract registry.

2. Make scheduler progress manifest-only.
   - `agent_team.scheduler_progress` metadata must include graph patch refs,
     counts, hashes, bounded node/branch samples, latest readiness refs,
     latest model/tool span refs, next transition, elapsed/token summaries,
     and ELI5.
   - It must not include full node arrays, edge arrays, task packets, context
     packets, implementation packets, file snapshots, validation bodies, raw
     prompt/response/provider/tool/command logs, DB rows, secrets, or
     transcripts.
   - Add a focused guard that fails tests if progress metadata embeds known
     body-bearing fields.

3. Wire GraphPatch refs into production scheduler progress.
   - The dynamic coding-team graph runner and Runtime Work Graph scheduler
     should emit compact progress while preserving enough refs for readback,
     replay, and diagnostics.
   - Existing latest-run-state should carry graph patch refs/counts instead
     of duplicated graph bodies when available.

4. Add Work Queue readback support.
   - Owner readback must show latest graph patch ref, patch kind, node/edge
     counts, affected node samples, current phase, blocker, and next
     transition without scanning thousands of artifacts.

5. Add replay/proof coverage.
   - Add a provider-free lane or focused tests using a large graph shape and
     the latest Product/Spec failure shape proving progress metadata stays
     bounded.
   - Prove full graph bodies hydrate from payload refs.
   - Prove body-bearing progress writes are rejected.

6. Preserve architectural boundaries.
   - Do not raise metadata limits.
   - Do not truncate semantic bodies to make metadata pass.
   - Do not create a Product/Spec-specific bypass.
   - Do not store raw prompts, raw responses, provider logs, tool logs,
     command logs, DB rows, secrets, or transcripts.

## Deep Completion Question

After implementation and validation, review the touched code and ask:

Did we maximally implement GraphPatch payload storage and scheduler progress
compaction as first-class production runtime behavior? Is `agent_team.scheduler_progress`
manifest-only everywhere production can write it? Are graph bodies stored and
hydrated by canonical payload refs? Does Work Queue/latest-run-state readback
surface useful graph patch state without artifact archaeology? Are there any
fallback, compatibility, proof-only, Product/Spec-specific, body-in-metadata,
raw-storage, stale-readback, or unbounded progress paths still capable of
causing production success or failure ambiguity?

If the answer is not an unqualified yes, patch the missing piece, rerun
focused validation, update docs/artifacts/Work Queue evidence, and repeat the
review.
