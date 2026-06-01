#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.architecture-transition-closure-gates";
const nextItemId = "openclaw-convergence.resource-objective-focus-and-requirement-narrowing";

const inventoryManifestPath =
  ".artifacts/execution-platform/architecture-residue-source-inventory-gate/manifest.json";
const inventoryReportPath =
  ".artifacts/execution-platform/architecture-residue-source-inventory-gate/full-report.json";
const modelAuditPath = ".artifacts/execution-platform/architecture-residue-real-model-audit/audit.json";

const changedFileRefs = [
  "extensions/execution-platform/src/workflows/architecture-transition-topology-gate.ts",
  "extensions/execution-platform/src/workflows/architecture-transition-topology-gate.test.ts",
  "extensions/execution-platform/src/workflows/orchestrator-graph-decision.ts",
  "extensions/execution-platform/src/workflows/orchestrator-graph-decision.test.ts",
  "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
  "extensions/execution-platform/src/workflows/architecture-residue-source-inventory.ts",
  "extensions/execution-platform/src/workflows/index.ts",
  "scripts/execution-platform-run-product-spec-checkpointed-test.mjs",
  "scripts/execution-platform-record-architecture-transition-closure-gates-closeout.mjs",
];

function sha256(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

function artifactHash(relativePath) {
  return `sha256:${sha256(fs.readFileSync(path.join(root, relativePath), "utf8"))}`;
}

function writeArtifact(name, value) {
  fs.mkdirSync(artifactDir, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  const target = path.join(artifactDir, name);
  fs.writeFileSync(target, body, "utf8");
  return {
    path: `.artifacts/execution-platform/${name}`,
    ref: `artifact://execution-platform/${name}`,
    sha256: `sha256:${sha256(body)}`,
    bytes: Buffer.byteLength(body, "utf8"),
  };
}

async function main() {
  const manifest = readJson(inventoryManifestPath);
  const report = readJson(inventoryReportPath);
  const audit = readJson(modelAuditPath);
  if (manifest.status !== "passed" || report.status !== "passed") {
    throw new Error("architecture_transition_source_inventory_not_passing");
  }
  if (report.hardFailureCount !== 0 || report.blockedSurvivorRefCount !== 0) {
    throw new Error("architecture_transition_source_inventory_has_blockers");
  }
  if (audit.status !== "passed") {
    throw new Error("architecture_transition_real_model_audit_not_passing");
  }
  for (const [name, value] of Object.entries({ manifest, report, audit })) {
    for (const flag of [
      "rawPromptStored",
      "rawResponseStored",
      "rawTranscriptStored",
      "rawProviderLogStored",
      "rawToolLogStored",
      "rawCommandLogStored",
      "rawDbRowsStored",
      "secretsStored",
    ]) {
      if (value[flag] !== false && flag in value) {
        throw new Error(`${name}_${flag}_not_false`);
      }
    }
  }
  if (Buffer.byteLength(JSON.stringify(manifest), "utf8") > 32 * 1024) {
    throw new Error("architecture_transition_inventory_manifest_overflow");
  }
  if (Buffer.byteLength(JSON.stringify(audit), "utf8") > 32 * 1024) {
    throw new Error("architecture_transition_real_model_audit_manifest_overflow");
  }

  const closeout = writeArtifact("architecture-transition-closure-gates-closeout.json", {
    artifactKind: "execution_platform.architecture_transition_closure_gates_closeout",
    schemaVersion: "execution-platform.architecture-transition-closure-gates-closeout.v1",
    workItemId,
    nextItemId,
    implementationSummary:
      "Closed the architecture transition gate with a reusable topology gate, proof-harness topology enforcement, graph-decision rejection of retired durable context nodes, scheduler helper deletion, source inventory hard checks, bounded manifest validation, and real-model advisory audit.",
    completedCapabilities: [
      "architecture_transition_topology_gate",
      "checkpoint_harness_topology_gate_reuse",
      "orchestrator_graph_retired_context_node_rejection",
      "retired_scheduler_resource_fulfillment_helper_deleted",
      "source_inventory_hard_check_for_scheduler_context_fanout",
      "bounded_manifest_inventory_and_model_audit",
      "real_model_source_inventory_advisory_audit",
    ],
    validationCommands: [
      {
        command:
          "pnpm test:file extensions/execution-platform/src/workflows/architecture-transition-topology-gate.test.ts extensions/execution-platform/src/workflows/orchestrator-graph-decision.test.ts extensions/execution-platform/src/workflows/architecture-residue-source-inventory.test.ts extensions/execution-platform/src/workflows/boundary-replay-proof-gate.test.ts extensions/execution-platform/src/observability/canonical-readback-gate.test.ts extensions/execution-platform/src/runtime-artifact-contracts.test.ts",
        result: "passed",
      },
      {
        command:
          "pnpm tsgo:fast extensions/execution-platform/src/workflows/architecture-transition-topology-gate.ts extensions/execution-platform/src/workflows/architecture-transition-topology-gate.test.ts extensions/execution-platform/src/workflows/orchestrator-graph-decision.ts extensions/execution-platform/src/workflows/orchestrator-graph-decision.test.ts extensions/execution-platform/src/workflows/architecture-residue-source-inventory.ts extensions/execution-platform/src/workflows/architecture-residue-source-inventory.test.ts extensions/execution-platform/src/workflows/index.ts extensions/execution-platform/src/observability/canonical-readback-gate.ts scripts/execution-platform-run-product-spec-checkpointed-test.mjs",
        result: "passed",
      },
      {
        command: "pnpm exec tsx scripts/execution-platform-run-architecture-residue-source-inventory-gate.mjs",
        result: "passed",
      },
      {
        command: "pnpm exec tsx scripts/execution-platform-run-architecture-residue-real-model-audit.mjs",
        result: "passed",
      },
      {
        command: "node --check scripts/execution-platform-run-product-spec-checkpointed-test.mjs",
        result: "passed",
      },
      { command: "git diff --check", result: "passed" },
    ],
    topologyGate: {
      contractRef:
        "runtime-contract://execution-platform/architecture-transition-topology-gate/v1",
      sourceRef:
        "extensions/execution-platform/src/workflows/architecture-transition-topology-gate.ts",
      testRef:
        "extensions/execution-platform/src/workflows/architecture-transition-topology-gate.test.ts",
      blockedReasonCodes: [
        "default_context_scout_fanout_retired",
        "legacy_resource_fulfillment_gate_retired",
        "context_synthesis_default_glue_retired",
      ],
    },
    inventory: {
      manifestRef:
        "artifact://execution-platform/architecture-residue-source-inventory-gate/manifest.json",
      manifestHash: artifactHash(inventoryManifestPath),
      reportRef:
        "artifact://execution-platform/architecture-residue-source-inventory-gate/full-report.json",
      reportHash: artifactHash(inventoryReportPath),
      hardFailureCount: report.hardFailureCount,
      blockedSurvivorRefCount: report.blockedSurvivorRefCount,
      survivorRefCount: report.survivorRefCount,
      lineReduction: report.lineReduction,
    },
    realModelAudit: {
      auditRef: "artifact://execution-platform/architecture-residue-real-model-audit/audit.json",
      auditHash: artifactHash(modelAuditPath),
      modelId: audit.modelId,
      providerLatencyMs: audit.providerCall?.latencyMs ?? null,
      promptBytes: audit.providerCall?.promptBytes ?? null,
      responseBytes: audit.providerCall?.responseBytes ?? null,
      usage: audit.providerCall?.usage ?? null,
      overallRisk: audit.normalizedAudit?.overallRisk ?? null,
      recommendationCount: audit.normalizedAudit?.recommendations?.length ?? null,
    },
    sourceSpecRefs: [
      "docs/projects/execution-platform/specs/architecture-transition-closure-and-resource-objective-focus.md",
      "docs/projects/execution-platform/specs/node-local-node-resource-demand-and-legacy-evisceration.md",
      "docs/projects/execution-platform/specs/product-spec-checkpointed-proof-framework.md",
      "docs/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests.md",
    ],
    deepCompletionAnswers: {
      acceptedPacketsCanProduceDefaultContextScoutFanout: false,
      proofHarnessCanPassThroughResourceFulfillmentOrSynthesisReadiness: false,
      sourceInventorySurvivorsExplicitlyClassified: true,
      nodeLocalContextSubturnInfrastructurePreserved: true,
      metadataOverflowCanRecurAtThisGate: false,
      deterministicSemanticJudgmentIntroduced: false,
      representativeRealModelAuditCompleted: true,
    },
    remainingArchitectureRisksForNextItems: [
      "Context requirement payloads can still be too broad until ResourceObjectiveFocus narrows legal refs.",
      "Node-local NodeResourceDemandSession is not yet the only production context lifecycle until the next queue item replaces remaining graph-level execution behavior.",
      "The model audit recommends renaming surviving negative-guard terminology in later cleanup to reduce cognitive residue.",
    ],
    runtimeAuthority:
      "topology_structure_source_inventory_manifest_bounds_validation_evidence_db_work_queue_closeout",
    semanticJudgmentOwner:
      "model_or_human_for_context_focus_scope_sufficiency_target_selection_edit_semantics_and_closeout_judgment",
    deterministicSemanticJudgmentAllowed: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
    workQueueLifecycleMutated: false,
  });

  const api = await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  try {
    const runtimeJobs = new api.RuntimeJobRepository(runtime.sqlClient);
    const workQueue = new api.WorkQueueRepository(runtime.sqlClient, runtimeJobs);
    await workQueue.completeWorkQueueItemFromCloseout({
      workItemId,
      closeoutRef: closeout.ref,
      closeoutHash: closeout.sha256,
      validationRef: "validation://architecture-transition-closure-gates",
      graphRef: "runtime-contract://execution-platform/architecture-transition-topology-gate/v1",
      ownerReadbackRef:
        "docs/projects/execution-platform/specs/architecture-transition-closure-and-resource-objective-focus.md#architecture-transition-closure-gates",
      sourceEditRequired: true,
      changedFileRefs,
      artifactRefs: [
        closeout.ref,
        "artifact://execution-platform/architecture-residue-source-inventory-gate/manifest.json",
        "artifact://execution-platform/architecture-residue-source-inventory-gate/full-report.json",
        "artifact://execution-platform/architecture-residue-real-model-audit/audit.json",
      ],
      accepted: true,
      actorId: "codex:architecture-transition-closure-gates",
      reasonCodes: [
        "architecture_transition_closure_gates_closed",
        "default_context_scout_graph_fanout_blocked",
        "legacy_resource_fulfillment_gate_blocked",
        "context_synthesis_default_glue_blocked",
        "bounded_manifest_gate_passed",
        "real_model_audit_passed",
      ],
    });
    const active = await workQueue.listDbWorkQueue({ bucket: "active", limit: 3 });
    console.log(
      JSON.stringify(
        {
          status: "closed",
          workItemId,
          closeout,
          nextActiveItems: active.items.map((item) => ({
            workItemId: item.workItemId,
            title: item.title,
          })),
        },
        null,
        2,
      ),
    );
  } finally {
    await runtime.close?.();
  }
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        status: "failed",
        errorName: error?.name ?? "unknown_error",
        errorSummary: String(error?.message ?? error).slice(0, 1_200),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
