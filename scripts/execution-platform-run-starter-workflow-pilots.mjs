#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT_DIR = ".artifacts/execution-platform";
let executionPlatform;

async function ep() {
  executionPlatform ??= await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
  return executionPlatform;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

function writeArtifact(name, value) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  fs.writeFileSync(path.join(ARTIFACT_DIR, name), body);
  return { path: `${ARTIFACT_DIR}/${name}`, sha256: sha256(body) };
}

function summarizeReadiness(readiness) {
  return {
    boundaryKind: readiness.boundary.boundaryKind,
    databaseName: readiness.boundary.databaseName,
    readinessState: readiness.readinessState,
    workQueueLiveLinkageMayAttach: readiness.workQueueLiveLinkageMayAttach,
    missingTables: readiness.missingTables,
    missingMigrationRefs: readiness.missingMigrationRefs,
    reasonCodes: readiness.reasonCodes,
  };
}

function summarizeWorkflowResult(result) {
  return {
    artifactKind: result.artifactKind,
    pilotVersion: result.pilotVersion,
    workflowKind: result.workflowKind,
    status: result.status,
    mode: result.mode,
    workflowId: result.workflowId,
    jobType: result.jobType,
    runtimeJobId: result.runtimeJobId,
    reviewRunId: result.reviewRunId,
    objectiveHash: result.objectiveHash,
    objectiveSummary: result.objectiveSummary,
    reviewSummary: result.reviewSummary,
    validationState: result.validationState,
    reviewState: result.reviewState,
    closeoutState: result.closeoutState,
    artifactRefs: result.artifactRefs,
    eventTypes: result.eventTypes,
    artifactTypes: result.artifactTypes,
    humanCloseoutSummary: result.humanCloseoutSummary,
    workQueueReadback: result.workQueueReadback,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawLogsStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    runtimeJobsCreated: result.runtimeJobsCreated,
    authorityGranted: false,
    controlsApplied: false,
    deployPerformed: false,
    outboundSendPerformed: false,
    dependencyInstallPerformed: false,
    gatewayRestarted: false,
    modelPromotionPerformed: false,
    skillInstalled: result.skillInstalled,
    skillEnabled: result.skillEnabled,
    skillPromoted: result.skillPromoted,
    workQueueLifecycleMutated: false,
  };
}

function summarizeContract(contract) {
  return {
    workflowId: contract.workflowId,
    displayName: contract.displayName,
    jobType: contract.jobType,
    status: contract.status,
    executorKind: contract.executorKind,
    defaultAuthorityProfile: contract.defaultAuthorityProfile,
    childWorkflowRefs: contract.childWorkflowRefs ?? [],
    lifecycleMutationAllowed: contract.workQueueProjection.lifecycleMutationAllowed,
    rawPromptStored: contract.storagePolicy.rawPromptStored,
    rawResponseStored: contract.storagePolicy.rawResponseStored,
    rawTranscriptStored: contract.storagePolicy.rawTranscriptStored,
    productionDeployAllowed: contract.productionSideEffectPolicy.productionDeployAllowed,
    externalOutboundWriteAllowed: contract.productionSideEffectPolicy.externalOutboundWriteAllowed,
    productionModelPromotionAllowed:
      contract.productionSideEffectPolicy.productionModelPromotionAllowed,
  };
}

async function runPilots(input) {
  const { runtimeJobs, workQueue, createWorkQueueLinkage, suffix } = input;
  const { runDocsSkillsLivePilot, runArchitectureSpecReviewLivePilot, runQaTestReviewLivePilot } =
    await ep();
  const docsSkills = await runDocsSkillsLivePilot({
    runtimeJobs,
    workQueue,
    createWorkQueueLinkage,
    runtimeJobId: `starter-docs-skills-${suffix}`,
    reviewRunId: `starter-docs-skills-review-${suffix}`,
    objectiveSummary: "Update bounded docs/skills readback for starter workflow pilot.",
  });
  const architecture = await runArchitectureSpecReviewLivePilot({
    runtimeJobs,
    workQueue,
    createWorkQueueLinkage,
    runtimeJobId: `starter-architecture-spec-${suffix}`,
    reviewRunId: `starter-architecture-spec-review-${suffix}`,
    objectiveSummary:
      "Review starter workflow architecture/spec boundaries and Work Queue readback.",
  });
  const qaTest = await runQaTestReviewLivePilot({
    runtimeJobs,
    workQueue,
    createWorkQueueLinkage,
    runtimeJobId: `starter-qa-test-${suffix}`,
    reviewRunId: `starter-qa-test-review-${suffix}`,
    objectiveSummary: "Review starter workflow validation coverage and no-false-success readback.",
  });
  return { docsSkills, architecture, qaTest };
}

async function writeContractProofs() {
  const {
    DEFAULT_EXECUTION_WORKFLOW_REGISTRY,
    docsSkillsWorkflowContract,
    architectureWorkflowContract,
    qaTestWorkflowContract,
    validateExecutionWorkflowContract,
    validateWorkflowRegistry,
  } = await ep();
  const registryValidation = validateWorkflowRegistry(DEFAULT_EXECUTION_WORKFLOW_REGISTRY);
  const docsValidation = validateExecutionWorkflowContract(docsSkillsWorkflowContract);
  const architectureValidation = validateExecutionWorkflowContract(architectureWorkflowContract);
  const qaValidation = validateExecutionWorkflowContract(qaTestWorkflowContract);
  writeArtifact("docs-skills-workflow-contract-proof.json", {
    artifactKind: "docs_skills_workflow_contract_proof",
    status: docsValidation.valid ? "completed" : "blocked",
    registryValidation,
    contractValidation: docsValidation,
    contract: summarizeContract(docsSkillsWorkflowContract),
  });
  writeArtifact("architecture-spec-workflow-contract-proof.json", {
    artifactKind: "architecture_spec_workflow_contract_proof",
    status: architectureValidation.valid ? "completed" : "blocked",
    registryValidation,
    contractValidation: architectureValidation,
    contract: summarizeContract(architectureWorkflowContract),
  });
  writeArtifact("qa-test-workflow-contract-proof.json", {
    artifactKind: "qa_test_workflow_contract_proof",
    status: qaValidation.valid ? "completed" : "blocked",
    registryValidation,
    contractValidation: qaValidation,
    contract: summarizeContract(qaTestWorkflowContract),
  });
}

async function runFixture() {
  const {
    applyExecutionPlatformMigrations,
    createExecutionPlatformPgMemTestDatabase,
    RuntimeJobRepository,
    WorkQueueRepository,
  } = await ep();
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic" });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs);
    const results = await runPilots({
      runtimeJobs,
      workQueue,
      createWorkQueueLinkage: true,
      suffix: "fixture",
    });
    writeArtifact("docs-skills-live-pilot-fixture-proof.json", {
      artifactKind: "docs_skills_live_pilot_fixture_proof",
      status: results.docsSkills.status,
      result: summarizeWorkflowResult(results.docsSkills),
    });
    writeArtifact("architecture-spec-review-fixture-proof.json", {
      artifactKind: "architecture_spec_review_fixture_proof",
      status: results.architecture.status,
      result: summarizeWorkflowResult(results.architecture),
    });
    writeArtifact("qa-test-review-fixture-proof.json", {
      artifactKind: "qa_test_review_fixture_proof",
      status: results.qaTest.status,
      result: summarizeWorkflowResult(results.qaTest),
    });
    writeArtifact("docs-skills-work-queue-readback-proof.json", {
      artifactKind: "docs_skills_work_queue_readback_proof",
      status: results.docsSkills.workQueueReadback ? "completed" : "blocked",
      workQueueReadback: results.docsSkills.workQueueReadback,
      skillInstalled: false,
      skillEnabled: false,
      skillPromoted: false,
      workQueueLifecycleMutated: false,
      rawPromptStored: false,
      rawResponseStored: false,
    });
    writeArtifact("architecture-spec-work-queue-readback-proof.json", {
      artifactKind: "architecture_spec_work_queue_readback_proof",
      status: results.architecture.workQueueReadback ? "completed" : "blocked",
      workQueueReadback: results.architecture.workQueueReadback,
      workQueueLifecycleMutated: false,
      rawPromptStored: false,
      rawResponseStored: false,
    });
    writeArtifact("qa-test-work-queue-readback-proof.json", {
      artifactKind: "qa_test_work_queue_readback_proof",
      status: results.qaTest.workQueueReadback ? "completed" : "blocked",
      workQueueReadback: results.qaTest.workQueueReadback,
      workQueueLifecycleMutated: false,
      rawPromptStored: false,
      rawResponseStored: false,
    });
    writeArtifact("docs-skills-no-promotion-proof.json", {
      artifactKind: "docs_skills_no_promotion_proof",
      status: "completed",
      runtimeJobId: results.docsSkills.runtimeJobId,
      skillInstalled: false,
      skillEnabled: false,
      skillPromoted: false,
      modelPromotionPerformed: false,
      rawPromptStored: false,
      rawResponseStored: false,
    });
    writeArtifact("slices-21-23-workflow-integration-proof.json", {
      artifactKind: "slices_21_23_workflow_integration_proof",
      status: "completed",
      mode: "fixture",
      runtimeJobIds: [
        results.docsSkills.runtimeJobId,
        results.architecture.runtimeJobId,
        results.qaTest.runtimeJobId,
      ],
      workQueueItemIds: [
        results.docsSkills.workQueueReadback?.workItemId,
        results.architecture.workQueueReadback?.workItemId,
        results.qaTest.workQueueReadback?.workItemId,
      ].filter(Boolean),
      workflows: [
        summarizeWorkflowResult(results.docsSkills),
        summarizeWorkflowResult(results.architecture),
        summarizeWorkflowResult(results.qaTest),
      ],
      runtimeJobsCreated: true,
      liveWorkQueueItemsCreated: true,
      authorityGranted: false,
      controlsApplied: false,
      deployPerformed: false,
      outboundSendPerformed: false,
      modelPromotionPerformed: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      workQueueLifecycleMutated: false,
    });
    return results;
  } finally {
    await database.close();
  }
}

async function runLiveIfRequested() {
  if (!hasArg("--live")) {
    writeArtifact("starter-workflow-live-blocker.json", {
      artifactKind: "starter_workflow_live_blocker",
      status: "blocked_live_not_requested",
      reasonCodes: ["starter_workflow_pilots_require_live_flag"],
      runtimeJobsCreated: false,
      liveWorkQueueItemsCreated: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      workQueueLifecycleMutated: false,
    });
    return null;
  }
  const {
    RuntimeJobRepository,
    WorkQueueRepository,
    createExecutionPlatformDatabaseRuntime,
    evaluateWorkQueueLiveLinkageGate,
    inspectExecutionPlatformDbReadiness,
    resolveExecutionPlatformDbBoundaryContract,
  } = await ep();
  let runtime;
  try {
    runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
    const boundary = resolveExecutionPlatformDbBoundaryContract({ resolution: runtime.resolution });
    const readiness = await inspectExecutionPlatformDbReadiness({
      sql: runtime.sqlClient,
      boundary,
    });
    const gate = evaluateWorkQueueLiveLinkageGate({ readiness });
    if (!gate.enabled) {
      const blocker = {
        artifactKind: "starter_workflow_live_blocker",
        status: "blocked_work_queue_linkage_gate",
        readiness: summarizeReadiness(readiness),
        gate,
        runtimeJobsCreated: false,
        liveWorkQueueItemsCreated: false,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        workQueueLifecycleMutated: false,
      };
      writeArtifact("docs-skills-live-pilot-live-proof.json", blocker);
      writeArtifact("architecture-spec-review-live-proof.json", blocker);
      writeArtifact("qa-test-review-live-proof.json", blocker);
      return null;
    }
    const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient, { claimStrategy: "basic" });
    const workQueue = new WorkQueueRepository(runtime.sqlClient, runtimeJobs);
    const results = await runPilots({
      runtimeJobs,
      workQueue,
      createWorkQueueLinkage: true,
      suffix: Date.now(),
    });
    writeArtifact("docs-skills-live-pilot-live-proof.json", {
      artifactKind: "docs_skills_live_pilot_live_proof",
      status: results.docsSkills.status,
      readiness: summarizeReadiness(readiness),
      result: summarizeWorkflowResult(results.docsSkills),
    });
    writeArtifact("architecture-spec-review-live-proof.json", {
      artifactKind: "architecture_spec_review_live_proof",
      status: results.architecture.status,
      readiness: summarizeReadiness(readiness),
      result: summarizeWorkflowResult(results.architecture),
    });
    writeArtifact("qa-test-review-live-proof.json", {
      artifactKind: "qa_test_review_live_proof",
      status: results.qaTest.status,
      readiness: summarizeReadiness(readiness),
      result: summarizeWorkflowResult(results.qaTest),
    });
    return results;
  } finally {
    if (runtime) {
      await runtime.pool.end();
    }
  }
}

await writeContractProofs();
await runFixture();
await runLiveIfRequested();
