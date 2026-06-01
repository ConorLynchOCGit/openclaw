#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.proof-hardening-07-adversarial-entry-suite";
const nextItemId = "openclaw-convergence.active-queue-34";
const proofArtifactPath =
  ".artifacts/execution-platform/proof-hardening-07-adversarial-entry-suite-proof.json";
const proofHardeningSpecRef =
  "docs/projects/execution-platform/specs/product-spec-proof-hardening-worker-boundary-suite.md";
const contractSpineSpecRef =
  "docs/projects/execution-platform/specs/execution-contract-spine-resource-requirements-and-frontier-state.md";

const changedFileRefs = [
  "extensions/execution-platform/src/codex-bridge/adversarial-proof-entry-suite.ts",
  "extensions/execution-platform/src/codex-bridge/adversarial-proof-entry-suite.test.ts",
  "extensions/execution-platform/src/codex-bridge/index.ts",
  "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts",
  "extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts",
  "extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
  "scripts/execution-platform-run-proof-hardening-07-adversarial-entry-suite.mjs",
  "scripts/execution-platform-record-proof-hardening-07-closeout.mjs",
  proofHardeningSpecRef,
  contractSpineSpecRef,
  "docs/projects/execution-platform/specs/index.md",
  "docs/projects/execution-platform/CURRENT_SLICE.md",
  "docs/projects/execution-platform/STATUS.md",
  "docs/projects/execution-platform/roadmap.md",
];

const validationCommands = [
  {
    command:
      "pnpm test:file extensions/execution-platform/src/codex-bridge/adversarial-proof-entry-suite.test.ts",
    result: "passed",
    testFilesPassed: 1,
    testsPassed: 1,
  },
  {
    command: "node scripts/execution-platform-run-proof-hardening-07-adversarial-entry-suite.mjs",
    result: "passed",
  },
  {
    command:
      "pnpm test:file extensions/execution-platform/src/workflows/scheduler-runtime-tools.test.ts",
    result: "passed",
    testFilesPassed: 1,
    testsPassed: 14,
  },
  {
    command: "pnpm test:file extensions/execution-platform/src/workflows/no-semantic-cheats.test.ts",
    result: "passed",
    testFilesPassed: 1,
    testsPassed: 20,
  },
  {
    command:
      "pnpm test:file extensions/execution-platform/src/workflows/context-repair-requirement.test.ts extensions/execution-platform/src/workflows/resource-selection.test.ts extensions/execution-platform/src/workflows/readiness-recompute-authority.test.ts extensions/execution-platform/src/workflows/action-review-artifacts.test.ts extensions/execution-platform/src/codex-bridge/worker-smoke-matrix.test.ts",
    result: "passed",
  },
  {
    command:
      "pnpm tsgo:fast -- proof-hardening-07 touched TypeScript files",
    result: "passed",
  },
  {
    command:
      "node --check scripts/execution-platform-run-proof-hardening-07-adversarial-entry-suite.mjs && node --check scripts/execution-platform-record-proof-hardening-07-closeout.mjs",
    result: "passed",
  },
  {
    command: "git diff --check",
    result: "passed",
  },
];

function sha256(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
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
  const proof = readJson(proofArtifactPath);
  if (proof.pass !== true) {
    throw new Error("proof_hardening_07_adversarial_entry_suite_not_passing");
  }
  const api = await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  const runtimeJobs = new api.RuntimeJobRepository(runtime.sqlClient);
  const workQueue = new api.WorkQueueRepository(runtime.sqlClient, runtimeJobs);
  const proofHash = `sha256:${sha256(fs.readFileSync(path.join(root, proofArtifactPath), "utf8"))}`;

  const closeout = writeArtifact("proof-hardening-07-adversarial-entry-suite-closeout.json", {
    artifactKind: "execution_platform.proof_hardening_07_adversarial_entry_suite_closeout",
    schemaVersion: "execution-platform.proof-hardening-07-closeout.v1",
    workItemId,
    nextItemId,
    sourceSpecRefs: [proofHardeningSpecRef, contractSpineSpecRef],
    proofArtifactRef: `artifact://execution-platform/${path.basename(proofArtifactPath)}`,
    proofArtifactHash: proofHash,
    implementationSummary:
      "The adversarial proof-entry suite is now a first-class bounded proof surface. It exercises stale child replay, missing contract body, context repair without requirements, over-budget target selection, limitation waiver denial, rollback review hydration, sibling failure isolation, provider-route mismatch, semantic lexical traps, a neutral non-coding fixture, and capability-manifest default traps before the Product/Spec proof can run.",
    completedCapabilities: [
      "proof_entry_prepare_suite_tool",
      "proof_entry_prepare_case_tool",
      "proof_entry_inject_structural_fault_tool",
      "proof_entry_run_preflight_tool",
      "proof_entry_assert_safe_block_tool",
      "proof_entry_assert_no_provider_invocation_tool",
      "proof_entry_assert_no_executable_frontier_tool",
      "proof_entry_assert_no_authority_widening_tool",
      "proof_entry_assert_sibling_evidence_survived_tool",
      "proof_entry_assert_review_artifact_hydrates_tool",
      "proof_entry_record_case_result_tool",
      "proof_entry_record_suite_closeout_tool",
      "adversarial_proof_entry_suite_runner",
      "target_selection_budget_safe_block",
      "non_coding_domain_generality_sentinel",
      "capability_manifest_default_trap",
    ],
    proofSummary: {
      caseCount: proof.caseResults.length,
      passedCaseCount: proof.passedCaseCount,
      failedCaseCount: proof.failedCaseCount,
      caseIdsExercised: proof.caseIdsExercised,
      providerInvocationCount: proof.providerInvocationCount,
      workerInvocationCount: proof.workerInvocationCount,
      authoritySurfaceRetirementGate: proof.authoritySurfaceRetirementGate,
      generalitySentinel: proof.generalitySentinel,
      capabilityManifestConformance: proof.capabilityManifestConformance,
      proofToolInvocationRefs: proof.proofToolInvocationRefs,
      reasonCodes: proof.reasonCodes,
    },
    validationCommands,
    changedFileRefs,
    validationRefs: [
      "validation://proof-hardening-07/adversarial-entry-suite-tests-pass",
      "validation://proof-hardening-07/adversarial-entry-suite-proof-script-pass",
      "validation://proof-hardening-07/scheduler-runtime-tools-tests-pass",
      "validation://proof-hardening-07/no-semantic-cheats-tests-pass",
      "validation://proof-hardening-07/related-boundary-tests-pass",
      "validation://proof-hardening-07/scoped-tsgo-fast-pass",
      "validation://proof-hardening-07/node-check-scripts-pass",
      "validation://proof-hardening-07/git-diff-check-pass",
    ],
    semanticJudgmentOwner: "model_or_human",
    runtimeAuthority:
      "schema_refs_hashes_bounds_provider_routes_payload_presence_lifecycle_epochs_readiness_validation_manifest_conformance",
    runtimeMustNotJudge: [
      "semantic_file_relevance",
      "context_sufficiency_quality",
      "edit_quality",
      "product_spec_special_meaning",
      "qualitative_complexity",
      "model_rationale_persuasiveness",
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
    closeoutRef: closeout.ref,
    closeoutHash: closeout.sha256,
    validationRef: "validation://proof-hardening-07/adversarial-entry-suite-pass",
    graphRef: "runtime-contract://execution-platform/adversarial-proof-entry-suite/v1",
    ownerReadbackRef: `${proofHardeningSpecRef}#7-adversarial-proof-entry-suite`,
    sourceEditRequired: true,
    changedFileRefs,
    artifactRefs: [closeout.ref, `artifact://execution-platform/${path.basename(proofArtifactPath)}`],
    accepted: true,
    actorId: "codex:proof-hardening-07-closeout",
    reasonCodes: [
      "proof_hardening_07_adversarial_entry_suite_implemented",
      "adversarial_entry_all_cases_passed",
      "authority_surface_retirement_gate_passed",
      "generality_sentinel_passed",
      "capability_manifest_conformance_passed",
      "provider_invocation_count_zero",
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
          "All proof-hardening gates are closed; Product/Spec Planning proof is the next DB-ranked item.",
        safeToRunProductSpecProof: true,
        preProofReadinessRefs: [proofArtifactPath, closeout.path],
        adversarialProofEntrySuiteRef: proofArtifactPath,
        adversarialProofEntrySuiteCloseoutRef: closeout.path,
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
        closeout,
        nextActiveItems: rows.rows,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        rawDbRowsStored: false,
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
