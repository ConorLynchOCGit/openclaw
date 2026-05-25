# Model Contract Compiler Consolidation

Run this as a Codex implementation pass, not as a proof-shaped OpenClaw submission.

## Objective

Implement `openclaw-convergence.model-contract-compiler-consolidation` as a production-grade compiler consolidation pass. This item was retained as a post-proof residual in metadata, but it is currently active in the DB queue; execute it now so schema-boundary drift does not re-enter the Product/Spec proof path.

## Architecture Principle

Model decides semantic meaning, usefulness, sufficiency, and rationale.

Runtime owns schema, ids, refs, envelopes, lifecycle, storage flags, authority, manifest fields, capability-derived executor data, validation command execution, persistence, and repair shape.

Do not add semantic substring classifiers, Product/Spec-specific generic checks, compatibility fallbacks, or proof-only success paths.

## Scope

1. Inventory production model contract boundaries:
   - router/front door
   - Mission Ledger
   - commitment packet authoring
   - context scout and context repair
   - staged scheduler graph protocol
   - capability selection
   - resource materialization
   - worker/file-edit loop
   - validation/QA
   - review/readback
   - closeout/finalization

2. Promote `model-decision-contracts` from small helper module into the canonical model contract compiler vocabulary:
   - boundary definitions
   - model-authored semantic fields
   - runtime-owned fields
   - accepted structural aliases
   - field-specific repair packets
   - raw-storage flag rejection
   - provider-diagnostic preservation hooks
   - structural-only compile diagnostics

3. Remove duplicate runtime-owned field checks from scheduler/orchestrator where practical:
   - staged scheduler tool protocol must use the compiler-owned runtime-field violation collector.
   - graph node kind, executor key, worker ref, required metadata schema ref, runtime node ids, expected evidence enums, storage refs, lifecycle state, and authority grants must be runtime-owned.

4. Make repair output field-specific:
   - include failed decision id when available;
   - include exact path;
   - include expected type or instruction such as `omit runtime-owned field`;
   - include why the field is required or forbidden;
   - preserve accepted fields;
   - never ask for wholesale regeneration when a focused structural repair is sufficient.

5. Keep runtime-owned schema compilation deterministic but non-semantic:
   - runtime can validate shape, manifest membership, bounds, and refs;
   - runtime must not infer evidence kind from artifact name;
   - runtime must not decide semantic sufficiency from keywords.

6. Add focused regression tests:
   - compiler inventory contains all major production model boundaries;
   - runtime-owned fields are rejected in nested model payloads;
   - raw-storage flags are rejected recursively;
   - field-specific repair packet includes exact path, expected type, valid alternatives, and preserve fields;
   - orchestrator staged scheduler runtime-owned checks are compiler-backed;
   - no Product/Spec substring changes compiler behavior;
   - typed evidence claims are required at source and are not inferred from refs.

7. Update docs/status if needed:
   - record the compiler consolidation boundary and any remaining residuals;
   - do not overclaim live Product/Spec proof success.

## Validation

Run focused tests covering the compiler and orchestrator boundary. Run the compatibility/no-semantic-cheats tests if the pass touches scheduler, packet, router, context scout, or worker adapter boundaries. Run a scoped TypeScript lane for changed files.

## Deep Completion Review

After implementation, perform a code-review pass and ask:

Did we maximally execute and implement this queue item? Are the model contract compiler definitions canonical production objects, wired into production scheduler/orchestrator boundaries, protected against runtime-owned schema invention, raw-storage leakage, evidence-kind inference, and semantic-cheat drift? Is there any way to improve, harden, optimize, sharpen, extend, or otherwise make it stronger before the Product/Spec proof? Are there compatibility, fallback, duplicate parser, or proof-only paths that can still produce production success without compiler evaluation?

If the answer is not an unqualified yes, implement the missing hardening, rerun focused validation, update docs/artifacts/Work Queue, and repeat the review.
