---
summary: "Curated deep document-ingestion corpus for the 2026-04 pre-test model-memory substrate buildout."
title: "Deep Document Ingest Targets 2026-04"
---

# Deep Document Ingest Targets 2026-04

## Objective

Define the canonical deep document-ingestion corpus for the pre-test
`model-memory` substrate buildout.

This pass is intentionally broader than the earlier first-100 population wave,
but it stays curated:

- canonical repo-owned sources only
- restored and imported functionality first
- operator/runtime/system surfaces ahead of broad product noise
- durable authored docs ahead of generated evidence artifacts
- a narrow code seam only where runtime explanation and later retrieval testing
  genuinely benefit from it

## Prior baseline anchor

Recovered baseline source:

- `docs/projects/model-memory/document-ingestion-inventory.md`

Exact prior baseline facts:

- total eligible sources under the accepted ordering logic: `221`
- first broader execution wave attempted: `100`
- completed: `98`
- failed: `2`

What the prior baseline covered well:

- Tier 1 dense single-document pilots
- Tier 2 in-repo curated packs such as `docs/help/`, `docs/gateway/`, and
  `docs/reference/templates/`
- Tier 3 selected `extensions/model-memory/` code-and-doc surfaces

What the prior baseline did not yet cover well enough for the upcoming soak:

- the eight canonized project workspaces after the rescue migration
- the rescued deployment-topology runbooks and recovery docs
- the canonized agent runtime-source packs
- the newer workspace-topology and agent-foundation ownership material
- the new deployment and GitHub-lane repair docs
- the current bootstrap, runtime inventory, and registry surfaces

## Inclusion rules

- prefer durable canonical docs over archive, backup, host-only, or generated
  surfaces
- keep the corpus centered on restored/imported functionality and the memory
  architecture that now needs to be tested against it
- keep operator flow and runtime explanation value high enough that later
  retrieval prompts can cross projects, agents, deployment, and memory seams
- include a bounded implementation seam from `extensions/model-memory/` and
  `extensions/memory-core/` because the upcoming soak needs runtime explanation
  and arbitration visibility, not only authored docs

## Explicit exclusions

- `docs/projects/model-memory/evidence/**`
  - excluded because these are prior run artifacts, traces, and reports; they
    are useful for audits but too noisy and too self-referential for the new
    default substrate
- retired `memory-middleware` surfaces
  - excluded because the lane is retired and should not be reintroduced through
    ingestion
- backups, archives, import mirrors, and host-only residue
  - excluded because this pass is about canonical repo-owned truth
- generated build outputs, temp state, lock outputs, and other non-authored
  artifacts
  - excluded because they add noise without improving later retrieval or
    operator-flow tests
- broad `docs/channels/**`, `docs/concepts/**`, and the wider plugin doc tree
  beyond the selected plugin-runtime subset
  - excluded in this pass to keep the substrate concentrated on the rescued and
    imported surfaces rather than flooding the memory layer with the entire
    product reference set before the soak

## Category summary

| Category                            | Count | Inclusion rationale                                                                                          | Expected importance                                                                       |
| ----------------------------------- | ----: | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| repo instruction anchor             |     1 | Preserve the same dense repo-operating instruction surface used in the original Tier 1 pilots                | contextual grounding, system behavior explanation                                         |
| system docs and registries          |    19 | Canonical system control plane for projects, agents, deployment, and runtime inventory                       | contextual grounding, operator flow, system behavior explanation                          |
| agent-foundation project docs       |    16 | Canonical durable pack ownership and specialist-agent contract surfaces                                      | contextual grounding, projection influence, system behavior explanation                   |
| deployment-topology project docs    |    36 | Canonical live deployment, recovery, runbook, scheduled-program, and topology-repair truth                   | direct retrieval, contextual grounding, operator flow, system behavior explanation        |
| intake-routing project docs         |     9 | Restored intake contract and routing boundaries                                                              | direct retrieval, contextual grounding, operator flow                                     |
| maintenance project docs            |    10 | Canonical weekly maintenance guard inputs and operator controls                                              | direct retrieval, operator flow, system behavior explanation                              |
| model-memory durable docs and specs |    46 | Canonical architecture, cutover, proof, and operational memory design surfaces                               | direct retrieval, contextual grounding, projection influence, system behavior explanation |
| qa-program project docs             |    10 | Canonical QA planning and scenario architecture                                                              | direct retrieval, operator flow, system behavior explanation                              |
| turborepo project docs              |    12 | Canonical build, gate, and workspace-task guidance now folded into project ownership                         | direct retrieval, contextual grounding, system behavior explanation                       |
| workspace-topology project docs     |    20 | Canonical topology, bootstrap, registry, and pack-materialization rules                                      | direct retrieval, contextual grounding, projection influence, system behavior explanation |
| agent runtime-source packs          |    44 | Canonical specialist and main runtime-source packs for bootstrap, identity, and bounded behavior             | contextual grounding, projection influence, operator flow                                 |
| help docs                           |     9 | User/operator procedural reference surfaces with strong retrieval value                                      | direct retrieval, operator flow                                                           |
| bootstrap templates                 |    13 | Shared authored compatibility and bootstrap-template surfaces                                                | contextual grounding, projection influence, system behavior explanation                   |
| gateway docs                        |    34 | Runtime, readiness, networking, secrets, and API behavior surfaces needed for restored-functionality testing | direct retrieval, contextual grounding, operator flow, system behavior explanation        |
| plugin architecture docs            |     8 | Narrow plugin-runtime and architecture subset needed for restored browsing/plugin behavior tests             | direct retrieval, system behavior explanation                                             |
| runtime implementation seams        |    17 | Bounded source-code seam for ingestion, capture, retrieval, projection, cache, and runtime-provider behavior | system behavior explanation, contextual grounding, projection influence                   |

Total curated targets: `304`

## Target files

### Category 1 - Repo instruction anchor (`1`)

Importance defaults:

- contextual grounding
- system behavior explanation

Files:

- `AGENTS.md`

### Category 2 - System docs and registries (`19`)

Importance defaults:

- contextual grounding
- operator flow
- system behavior explanation

Files:

- `docs/system/agents.md`
- `docs/system/build-plan.md`
- `docs/system/decisions.md`
- `docs/system/deployment.md`
- `docs/system/index.md`
- `docs/system/memory.md`
- `docs/system/policies/durable-generated-ownership.md`
- `docs/system/projects.md`
- `docs/system/registries/agents.md`
- `docs/system/registries/agents.yaml`
- `docs/system/registries/bootstrap-files.md`
- `docs/system/registries/bootstrap-files.yaml`
- `docs/system/registries/index.md`
- `docs/system/registries/projects.md`
- `docs/system/registries/projects.yaml`
- `docs/system/registries/runtime-inventory.md`
- `docs/system/registries/runtime-inventory.yaml`
- `docs/system/roadmap-ideas.md`
- `docs/system/roadmap.md`

### Category 3 - Agent Foundation project docs (`16`)

Importance defaults:

- contextual grounding
- projection influence
- system behavior explanation

Files:

- `docs/projects/agent-foundation/CURRENT_SLICE.md`
- `docs/projects/agent-foundation/DECISIONS.md`
- `docs/projects/agent-foundation/STARTUP.md`
- `docs/projects/agent-foundation/STATUS.md`
- `docs/projects/agent-foundation/compatibility-source-migration-plan.md`
- `docs/projects/agent-foundation/exhaustive-agent-pack-diff.md`
- `docs/projects/agent-foundation/index.md`
- `docs/projects/agent-foundation/current-agent-inventory.md`
- `docs/projects/agent-foundation/roadmap.md`
- `docs/projects/agent-foundation/specs/agent-durable-pack.md`
- `docs/projects/agent-foundation/specs/agent-registry-alignment.md`
- `docs/projects/agent-foundation/specs/identity-design-research.md`
- `docs/projects/agent-foundation/specs/index.md`
- `docs/projects/agent-foundation/specs/permissions-tools-and-skills-contract.md`
- `docs/projects/agent-foundation/specs/role-library-adaptations.md`
- `docs/projects/agent-foundation/specs/workflows-and-skills-policy.md`

### Category 4 - Deployment Topology project docs (`36`)

Importance defaults:

- direct retrieval
- contextual grounding
- operator flow
- system behavior explanation

Files:

- `docs/projects/deployment-topology/CURRENT_SLICE.md`
- `docs/projects/deployment-topology/DECISIONS.md`
- `docs/projects/deployment-topology/STARTUP.md`
- `docs/projects/deployment-topology/STATUS.md`
- `docs/projects/deployment-topology/archive-retention-audit.md`
- `docs/projects/deployment-topology/exhaustive-host-automation-diff.md`
- `docs/projects/deployment-topology/exhaustive-live-patch-diff.md`
- `docs/projects/deployment-topology/exhaustive-project-surface-diff.md`
- `docs/projects/deployment-topology/exhaustive-recovery-evidence-sources.md`
- `docs/projects/deployment-topology/exhaustive-recovery-manifest.md`
- `docs/projects/deployment-topology/git-and-auth-workflow.md`
- `docs/projects/deployment-topology/github-automation.md`
- `docs/projects/deployment-topology/github-digest-source-repair.md`
- `docs/projects/deployment-topology/index.md`
- `docs/projects/deployment-topology/live-config-representation.md`
- `docs/projects/deployment-topology/missing-functionality-recovery-audit.md`
- `docs/projects/deployment-topology/missing-functionality-recovery-matrix.md`
- `docs/projects/deployment-topology/pnpm-and-build-hygiene.md`
- `docs/projects/deployment-topology/post-restoration-cleanup.md`
- `docs/projects/deployment-topology/pre-agent-prerequisites-audit.md`
- `docs/projects/deployment-topology/push-validation-human-checklist.md`
- `docs/projects/deployment-topology/repo-file-container-visibility-audit.md`
- `docs/projects/deployment-topology/repo-vs-container-project-adoption-audit.md`
- `docs/projects/deployment-topology/roadmap.md`
- `docs/projects/deployment-topology/runbooks/index.md`
- `docs/projects/deployment-topology/runbooks/maintenance-sweep.md`
- `docs/projects/deployment-topology/runbooks/openclaw-runtime-operations.md`
- `docs/projects/deployment-topology/runbooks/webhook-gateway-operations.md`
- `docs/projects/deployment-topology/runtime-consolidation.md`
- `docs/projects/deployment-topology/scheduled-programs.md`
- `docs/projects/deployment-topology/specs/git-and-auth-posture.md`
- `docs/projects/deployment-topology/specs/index.md`
- `docs/projects/deployment-topology/specs/pnpm-build-hygiene.md`
- `docs/projects/deployment-topology/specs/runtime-inventory.md`
- `docs/projects/deployment-topology/topology-enforcement-hardening-plan.md`
- `docs/projects/deployment-topology/tranche-1-patch-lineage.md`

### Category 5 - Intake Routing project docs (`9`)

Importance defaults:

- direct retrieval
- contextual grounding
- operator flow

Files:

- `docs/projects/intake-routing/CURRENT_SLICE.md`
- `docs/projects/intake-routing/DECISIONS.md`
- `docs/projects/intake-routing/STARTUP.md`
- `docs/projects/intake-routing/STATUS.md`
- `docs/projects/intake-routing/index.md`
- `docs/projects/intake-routing/roadmap.md`
- `docs/projects/intake-routing/specs/implementation-checklist.md`
- `docs/projects/intake-routing/specs/index.md`
- `docs/projects/intake-routing/specs/routing-contract.md`

### Category 6 - Maintenance project docs (`10`)

Importance defaults:

- direct retrieval
- operator flow
- system behavior explanation

Files:

- `docs/projects/maintenance/CURRENT_SLICE.md`
- `docs/projects/maintenance/DEBT_REGISTER.md`
- `docs/projects/maintenance/DECISIONS.md`
- `docs/projects/maintenance/STARTUP.md`
- `docs/projects/maintenance/STATUS.md`
- `docs/projects/maintenance/TEST_MATRIX.md`
- `docs/projects/maintenance/WORKSPACE_REFACTOR_FOUNDATION.md`
- `docs/projects/maintenance/index.md`
- `docs/projects/maintenance/roadmap.md`
- `docs/projects/maintenance/specs/index.md`

### Category 7 - Model Memory durable docs and specs (`46`)

Importance defaults:

- direct retrieval
- contextual grounding
- projection influence
- system behavior explanation

Files:

- `docs/projects/model-memory/CURRENT_SLICE.md`
- `docs/projects/model-memory/DECISIONS.md`
- `docs/projects/model-memory/SPEC_CLOSURE_REVIEW.md`
- `docs/projects/model-memory/STARTUP.md`
- `docs/projects/model-memory/STATUS.md`
- `docs/projects/model-memory/bootstrap-input-audit.md`
- `docs/projects/model-memory/build-plan.md`
- `docs/projects/model-memory/cutover-72h-watch.md`
- `docs/projects/model-memory/cutover-checklist.md`
- `docs/projects/model-memory/cutover-plan.md`
- `docs/projects/model-memory/cutover-retirement-plan.md`
- `docs/projects/model-memory/cutover-thesis.md`
- `docs/projects/model-memory/document-ingestion-inventory.md`
- `docs/projects/model-memory/implementation-guardrails.md`
- `docs/projects/model-memory/implementation-slices-1-5-checklist.md`
- `docs/projects/model-memory/index.md`
- `docs/projects/model-memory/ops-reporting-lane.md`
- `docs/projects/model-memory/proof-corpus-plan.md`
- `docs/projects/model-memory/roadmap.md`
- `docs/projects/model-memory/specs/architecture-overview.md`
- `docs/projects/model-memory/specs/context-engine.md`
- `docs/projects/model-memory/specs/database-schema-v1.md`
- `docs/projects/model-memory/specs/document-ingestion-runner-service.md`
- `docs/projects/model-memory/specs/document-read-and-ingest-arbitration.md`
- `docs/projects/model-memory/specs/identity-dedupe-supersession.md`
- `docs/projects/model-memory/specs/index.md`
- `docs/projects/model-memory/specs/observability-calibration.md`
- `docs/projects/model-memory/specs/ontology-schema.md`
- `docs/projects/model-memory/specs/post-cutover-hierarchical-retrieval.md`
- `docs/projects/model-memory/specs/prompt-contract.md`
- `docs/projects/model-memory/specs/proof-benchmark.md`
- `docs/projects/model-memory/specs/retrieval-context-injection.md`
- `docs/projects/model-memory/specs/review-write-policy.md`
- `docs/projects/model-memory/specs/runtime-integration-shadow-mode.md`
- `docs/projects/model-memory/specs/runtime-read-models-and-artifacts.md`
- `docs/projects/model-memory/specs/source-adapters.md`
- `docs/projects/model-memory/specs/storage-database.md`
- `docs/projects/model-memory/specs/structural-family-recall.md`
- `docs/projects/model-memory/specs/usage-cache-ledger.md`
- `docs/projects/model-memory/specs/validation.md`
- `docs/projects/model-memory/specs/workspace-projections-bootstrap-files.md`
- `docs/projects/model-memory/validation-loop.md`
- `docs/projects/model-memory/vps-consolidation-and-test-diagnostic.md`
- `docs/projects/model-memory/vps-git-remote-and-auth-workflow.md`
- `docs/projects/model-memory/vps-pnpm-turbo-optimization-plan.md`
- `docs/projects/model-memory/vps-runtime-consolidation-plan.md`

### Category 8 - QA Program project docs (`10`)

Importance defaults:

- direct retrieval
- operator flow
- system behavior explanation

Files:

- `docs/projects/qa-program/CURRENT_SLICE.md`
- `docs/projects/qa-program/DECISIONS.md`
- `docs/projects/qa-program/STARTUP.md`
- `docs/projects/qa-program/STATUS.md`
- `docs/projects/qa-program/index.md`
- `docs/projects/qa-program/roadmap.md`
- `docs/projects/qa-program/specs/frontier-harness-tuning.md`
- `docs/projects/qa-program/specs/index.md`
- `docs/projects/qa-program/specs/scenario-expansion-round-2.md`
- `docs/projects/qa-program/specs/scenario-pack-architecture.md`

### Category 9 - Turborepo project docs (`12`)

Importance defaults:

- direct retrieval
- contextual grounding
- system behavior explanation

Files:

- `docs/projects/turborepo/CURRENT_SLICE.md`
- `docs/projects/turborepo/DECISIONS.md`
- `docs/projects/turborepo/STARTUP.md`
- `docs/projects/turborepo/STATUS.md`
- `docs/projects/turborepo/index.md`
- `docs/projects/turborepo/roadmap.md`
- `docs/projects/turborepo/specs/index.md`
- `docs/projects/turborepo/specs/landing-gate-mapping.md`
- `docs/projects/turborepo/specs/legacy-build-performance-surface.md`
- `docs/projects/turborepo/specs/root-gate-decomposition.md`
- `docs/projects/turborepo/specs/turbo-workspace-graph.md`
- `docs/projects/turborepo/specs/workspace-task-inventory.md`

### Category 10 - Workspace Topology project docs (`20`)

Importance defaults:

- direct retrieval
- contextual grounding
- projection influence
- system behavior explanation

Files:

- `docs/projects/workspace-topology/CURRENT_SLICE.md`
- `docs/projects/workspace-topology/DECISIONS.md`
- `docs/projects/workspace-topology/STARTUP.md`
- `docs/projects/workspace-topology/STATUS.md`
- `docs/projects/workspace-topology/bootstrap-pre-render-seeding-plan.md`
- `docs/projects/workspace-topology/index.md`
- `docs/projects/workspace-topology/memory-surface-inventory.md`
- `docs/projects/workspace-topology/project-pack-compliance.md`
- `docs/projects/workspace-topology/roadmap-pointer-gaps.md`
- `docs/projects/workspace-topology/roadmap-surface-inventory.md`
- `docs/projects/workspace-topology/roadmap.md`
- `docs/projects/workspace-topology/runtime-bootstrap-file-inventory.md`
- `docs/projects/workspace-topology/scattered-material-inventory.md`
- `docs/projects/workspace-topology/specs/bootstrap-file-canonical-mapping.md`
- `docs/projects/workspace-topology/specs/drift-enforcement.md`
- `docs/projects/workspace-topology/specs/durable-and-generated-ownership-contract.md`
- `docs/projects/workspace-topology/specs/index.md`
- `docs/projects/workspace-topology/specs/project-and-agent-registries.md`
- `docs/projects/workspace-topology/specs/scattered-material-classification-and-migration.md`
- `docs/projects/workspace-topology/specs/system-and-document-topology.md`

### Category 11 - Agent runtime-source packs (`44`)

Importance defaults:

- contextual grounding
- projection influence
- operator flow

Files:

- `docs/agents/builder/index.md`
- `docs/agents/builder/runtime/AGENTS.md`
- `docs/agents/builder/runtime/HEARTBEAT.md`
- `docs/agents/builder/runtime/IDENTITY.md`
- `docs/agents/builder/runtime/SOUL.md`
- `docs/agents/builder/runtime/TOOLS.md`
- `docs/agents/index.md`
- `docs/agents/main/index.md`
- `docs/agents/main/runtime/AGENTS.md`
- `docs/agents/main/runtime/IDENTITY.md`
- `docs/agents/main/runtime/SOUL.md`
- `docs/agents/main/runtime/TOOLS.md`
- `docs/agents/main/runtime/USER.md`
- `docs/agents/researcher/index.md`
- `docs/agents/researcher/runtime/AGENTS.md`
- `docs/agents/researcher/runtime/HEARTBEAT.md`
- `docs/agents/researcher/runtime/IDENTITY.md`
- `docs/agents/researcher/runtime/SOUL.md`
- `docs/agents/researcher/runtime/TOOLS.md`
- `docs/agents/web-researcher/index.md`
- `docs/agents/web-researcher/runtime/AGENTS.md`
- `docs/agents/web-researcher/runtime/BOOTSTRAP.md`
- `docs/agents/web-researcher/runtime/HEARTBEAT.md`
- `docs/agents/web-researcher/runtime/IDENTITY.md`
- `docs/agents/web-researcher/runtime/SOUL.md`
- `docs/agents/web-researcher/runtime/TOOLS.md`
- `docs/agents/web-researcher/runtime/USER.md`
- `docs/agents/writer/index.md`
- `docs/agents/writer/runtime/AGENTS.md`
- `docs/agents/writer/runtime/HEARTBEAT.md`
- `docs/agents/writer/runtime/IDENTITY.md`
- `docs/agents/writer/runtime/SOUL.md`
- `docs/agents/writer/runtime/TOOLS.md`
- `docs/agents/x-manager/index.md`
- `docs/agents/x-manager/runtime/AGENTS.md`
- `docs/agents/x-manager/runtime/HEARTBEAT.md`
- `docs/agents/x-manager/runtime/IDENTITY.md`
- `docs/agents/x-manager/runtime/SOUL.md`
- `docs/agents/x-manager/runtime/TOOLS.md`
- `docs/agents/x-manager/runtime/USER.md`
- `docs/agents/x-manager/runtime/context/accounts/american_atomics.md`
- `docs/agents/x-manager/runtime/context/accounts/conor_lynch_personal.md`
- `docs/agents/x-manager/runtime/context/approval_policy.md`
- `docs/agents/x-manager/runtime/context/platform_rules.md`

### Category 12 - Help docs (`9`)

Importance defaults:

- direct retrieval
- operator flow

Files:

- `docs/help/debugging.md`
- `docs/help/environment.md`
- `docs/help/faq.md`
- `docs/help/gpt54-codex-agentic-parity-maintainers.md`
- `docs/help/gpt54-codex-agentic-parity.md`
- `docs/help/index.md`
- `docs/help/scripts.md`
- `docs/help/testing.md`
- `docs/help/troubleshooting.md`

### Category 13 - Bootstrap templates (`13`)

Importance defaults:

- contextual grounding
- projection influence
- system behavior explanation

Files:

- `docs/reference/templates/AGENTS.dev.md`
- `docs/reference/templates/AGENTS.md`
- `docs/reference/templates/BOOT.md`
- `docs/reference/templates/BOOTSTRAP.md`
- `docs/reference/templates/HEARTBEAT.md`
- `docs/reference/templates/IDENTITY.dev.md`
- `docs/reference/templates/IDENTITY.md`
- `docs/reference/templates/SOUL.dev.md`
- `docs/reference/templates/SOUL.md`
- `docs/reference/templates/TOOLS.dev.md`
- `docs/reference/templates/TOOLS.md`
- `docs/reference/templates/USER.dev.md`
- `docs/reference/templates/USER.md`

### Category 14 - Gateway docs (`34`)

Importance defaults:

- direct retrieval
- contextual grounding
- operator flow
- system behavior explanation

Files:

- `docs/gateway/authentication.md`
- `docs/gateway/background-process.md`
- `docs/gateway/bonjour.md`
- `docs/gateway/bridge-protocol.md`
- `docs/gateway/cli-backends.md`
- `docs/gateway/configuration-examples.md`
- `docs/gateway/configuration-reference.md`
- `docs/gateway/configuration.md`
- `docs/gateway/discovery.md`
- `docs/gateway/doctor.md`
- `docs/gateway/gateway-lock.md`
- `docs/gateway/health.md`
- `docs/gateway/heartbeat.md`
- `docs/gateway/index.md`
- `docs/gateway/local-models.md`
- `docs/gateway/logging.md`
- `docs/gateway/multiple-gateways.md`
- `docs/gateway/network-model.md`
- `docs/gateway/openai-http-api.md`
- `docs/gateway/openresponses-http-api.md`
- `docs/gateway/openshell.md`
- `docs/gateway/pairing.md`
- `docs/gateway/protocol.md`
- `docs/gateway/remote-gateway-readme.md`
- `docs/gateway/remote.md`
- `docs/gateway/sandbox-vs-tool-policy-vs-elevated.md`
- `docs/gateway/sandboxing.md`
- `docs/gateway/secrets-plan-contract.md`
- `docs/gateway/secrets.md`
- `docs/gateway/security/index.md`
- `docs/gateway/tailscale.md`
- `docs/gateway/tools-invoke-http-api.md`
- `docs/gateway/troubleshooting.md`
- `docs/gateway/trusted-proxy-auth.md`

### Category 15 - Plugin architecture docs (`8`)

Importance defaults:

- direct retrieval
- system behavior explanation

Files:

- `docs/plugins/architecture.md`
- `docs/plugins/building-plugins.md`
- `docs/plugins/manifest.md`
- `docs/plugins/sdk-overview.md`
- `docs/plugins/sdk-entrypoints.md`
- `docs/plugins/sdk-runtime.md`
- `docs/plugins/sdk-provider-plugins.md`
- `docs/plugins/sdk-channel-plugins.md`

### Category 16 - Runtime implementation seams (`17`)

Importance defaults:

- system behavior explanation
- contextual grounding
- projection influence

Files:

- `extensions/model-memory/src/context-engine.ts`
- `extensions/model-memory/src/document-ingestion.ts`
- `extensions/model-memory/src/document-ingestion-tool.ts`
- `extensions/model-memory/src/live-document-ingestion-service.ts`
- `extensions/model-memory/src/live-ordinary-turn-capture-service.ts`
- `extensions/model-memory/src/ordinary-turn-capture.ts`
- `extensions/model-memory/src/operator-inspection.ts`
- `extensions/model-memory/src/projection-compiler.ts`
- `extensions/model-memory/src/readiness-gates.ts`
- `extensions/model-memory/src/retrieval-request-interpreter.ts`
- `extensions/model-memory/src/retrieval.ts`
- `extensions/model-memory/src/runtime-read-models.ts`
- `extensions/model-memory/src/usage-cache-ledger.ts`
- `extensions/memory-core/src/dreaming.ts`
- `extensions/memory-core/src/public-artifacts.ts`
- `extensions/memory-core/src/runtime-provider.ts`
- `extensions/memory-core/src/short-term-promotion.ts`

## Recommended execution posture

- use the canonical OpenClaw document-ingest operator surface
- keep `resume = true`
- keep the same `runId` and `recordPath` across reruns
- treat per-source failures as visible run-record outcomes, not silent skips
- rebuild runtime state during the pass so later retrieval and context tests are
  meaningful immediately after ingestion

## Expected use in the next phase

This corpus is intended to seed the DB before the next human validation phase,
which will test:

- document ingest
- prompt ingestion
- daily-summary ingestion
- retrieval
- context assembly
- projections
- cache behavior
- restored imported-functionality retrieval and explanation across the canonized
  project topology
