#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.proof-hardening-03-context-repair-requirements";
const nextItemId = "openclaw-convergence.proof-hardening-04-readiness-child-upsert";
const proofHardeningSpecRef =
  "docs/projects/execution-platform/specs/product-spec-proof-hardening-worker-boundary-suite.md";
const contractSpineSpecRef =
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md";

const changedFileRefs = [
  "extensions/execution-platform/src/workflows/context-repair-requirement.ts",
  "extensions/execution-platform/src/workflows/context-repair-requirement.test.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
  "extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts",
  "extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
  "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
  "extensions/execution-platform/src/runtime-artifact-contracts.ts",
  "extensions/execution-platform/src/runtime-artifact-contracts.test.ts",
  "extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
  "extensions/execution-platform/src/workflows/index.ts",
  proofHardeningSpecRef,
  contractSpineSpecRef,
  "docs/projects/execution-platform/CURRENT_SLICE.md",
  "docs/projects/execution-platform/STATUS.md",
  "scripts/execution-platform-record-proof-hardening-03-closeout.mjs",
];

const validationRefs = [
  "validation://proof-hardening-03/context-repair-requirement-tests-pass",
  "validation://proof-hardening-03/context-scout-execution-packet-tests-pass",
  "validation://proof-hardening-03/scheduler-runtime-tools-tests-pass",
  "validation://proof-hardening-03/runtime-artifact-contracts-tests-pass",
  "validation://proof-hardening-03/no-semantic-cheats-tests-pass",
  "validation://proof-hardening-03/runtime-work-graph-scheduler-tests-pass",
  "validation://proof-hardening-03/scoped-tsgo-fast-pass",
  "validation://proof-hardening-03/git-diff-check-pass",
];

function sha256(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function writeArtifact(name, value) {
  fs.mkdirSync(artifactDir, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  const abs = path.join(artifactDir, name);
  fs.writeFileSync(abs, body, "utf8");
  return {
    path: `.artifacts/execution-platform/${name}`,
    ref: `artifact://execution-platform/${name}`,
    sha256: `sha256:${sha256(body)}`,
  };
}

async function main() {
  const api = await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  const runtimeJobs = new api.RuntimeJobRepository(runtime.sqlClient);
  const workQueue = new api.WorkQueueRepository(runtime.sqlClient, runtimeJobs);

  const evidence = writeArtifact("proof-hardening-03-context-repair-requirements-closeout.json", {
    artifactKind: "execution_platform.proof_hardening_03_context_repair_requirements_closeout",
    workItemId,
    nextItemId,
    sourceSpecRefs: [proofHardeningSpecRef, contractSpineSpecRef],
    implementationSummary:
      "Context repair is now a payload-backed, consumer-aware runtime boundary. Runtime compiles ContextRepairRequirementPacket from typed failure evidence and model-authored/inherited semantic questions, derives the ContextBrokerRequest and ResourceRequirementPacket refs, requires production repair nodes to declare a consumer context_supplies edge, blocks execution without broker/requirement/edge authority, persists context repair requirement payload artifacts before scout execution, and keeps diagnostic-only repair visible but non-unlocking. Runtime validates structure, refs, lifecycle, consumer wiring, payload policy, and tool eligibility only; semantic usefulness and context sufficiency remain model/human judgment.",
    completedCapabilities: [
      "context_repair_requirement_packet",
      "context_repair_payload_artifact_contract",
      "context_repair_compile_requirement_tool",
      "context_repair_link_consumer_tool",
      "context_repair_mark_diagnostic_only_tool",
      "context_repair_block_without_requirement_tool",
      "scheduler_context_repair_requirement_metadata",
      "scheduler_context_repair_consumer_edge_gate",
      "context_scout_executor_repair_requirement_artifact",
      "blocked_repair_requirement_prevents_scout_packet_dispatch",
      "diagnostic_only_context_repair_non_unlocking",
      "neutral_context_repair_fixture",
    ],
    forbiddenPathsRetired: [
      "zero_edge_production_context_repair",
      "context_repair_without_resource_requirement_packet",
      "context_repair_without_context_broker_request",
      "context_repair_unlocks_undeclared_consumer",
      "diagnostic_context_repair_satisfies_readiness",
      "blocked_repair_requirement_feeds_scout_packet",
      "free_form_graph_repair_context_scout_bypass",
      "context_repair_product_spec_specific_logic",
    ],
    validationCommands: [
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/context-repair-requirement.test.ts",
        result: "passed",
        testFilesPassed: 1,
        testsPassed: 6,
      },
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/context-scout-execution-packet.test.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts extensions/execution-platform/src/runtime-artifact-contracts.test.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts",
        result: "passed",
        testFilesPassed: 4,
        testsPassed: 35,
      },
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.test.ts",
        result: "passed",
        testFilesPassed: 1,
        testsPassed: 97,
      },
      {
        command:
          "pnpm tsgo:fast -- extensions/execution-platform/src/workflows/context-repair-requirement.ts extensions/execution-platform/src/workflows/context-repair-requirement.test.ts extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts extensions/execution-platform/src/codex-bridge/context-scout-node-executor.ts extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts extensions/execution-platform/src/runtime-artifact-contracts.ts extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
        result: "passed",
      },
      {
        command: "git diff --check",
        result: "passed",
      },
    ],
    knownResiduals: [
      "The next proof-hardening item must recompute readiness and retire stale child nodes so old context/readiness artifacts cannot keep a superseded branch executable.",
      "Full Product/Spec proof remains intentionally blocked until all proof-hardening gates close; this item only closes the context repair requirement boundary.",
    ],
    changedFileRefs,
    validationRefs,
    semanticJudgmentOwner: "model_or_human",
    runtimeAuthority:
      "context_repair_schema_refs_payload_contract_consumer_edges_lifecycle_tool_authority",
    runtimeMustNotJudge: [
      "semantic_file_relevance",
      "context_sufficiency_quality",
      "edit_quality",
      "product_spec_special_meaning",
      "qualitative_complexity",
      "model_rationale_persuasiveness",
      "resource_usefulness",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    hiddenReasoningStored: false,
    workQueueLifecycleMutated: false,
  });

  const transition = await workQueue.completeWorkQueueItemFromCloseout({
    workItemId,
    closeoutRef: evidence.ref,
    closeoutHash: evidence.sha256,
    validationRef: validationRefs.join(","),
    graphRef: "runtime-contract://execution-platform/context-repair-requirements/v1",
    ownerReadbackRef: `${proofHardeningSpecRef}#3-context-repair-requirement-compiler`,
    sourceEditRequired: true,
    changedFileRefs,
    artifactRefs: [evidence.ref],
    accepted: true,
    actorId: "codex:proof-hardening-03-closeout",
    reasonCodes: [
      "proof_hardening_03_context_repair_requirements_implemented",
      "context_repair_requirement_packet_added",
      "context_repair_payload_artifact_contract_added",
      "context_repair_small_verbs_added",
      "scheduler_context_repair_consumer_gate_added",
      "executor_repair_requirement_artifact_added",
      "zero_edge_production_context_repair_blocked",
      "diagnostic_context_repair_non_unlocking",
      "neutral_fixture_passed",
      "focused_validation_passed",
      "scoped_type_validation_passed",
      "git_diff_check_passed",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogsStored: false,
    rawDbRowsStored: false,
    authorityGranted: false,
    controlsApplied: false,
    runtimeLifecycleMutated: false,
  });

  await runtime.sqlClient.query(
    `
      UPDATE execution_platform.work_items
      SET metadata = COALESCE(metadata, '{}'::jsonb) || $1::jsonb,
          updated_at = now()
      WHERE work_item_id = $2
    `,
    [
      JSON.stringify({
        previousPreProofItemClosed: workItemId,
        nextActiveReason:
          "Context repair requirements are closed; readiness recompute and stale-child upsert are the next pre-proof gate.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        rawDbRowsStored: false,
      }),
      nextItemId,
    ],
  );

  const rows = await runtime.sqlClient.query(
    `
      SELECT work_item_id, title, queue_status, queue_rank
      FROM execution_platform.work_items
      WHERE queue_status IN ('active','blocked','needs_review')
      ORDER BY queue_rank ASC NULLS LAST, work_item_id ASC
      LIMIT 10
    `,
  );

  console.log(
    JSON.stringify(
      {
        ok: transition.closed,
        transition,
        evidence,
        nextActiveItems: rows.rows,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
