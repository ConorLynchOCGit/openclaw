import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { applyExecutionPlatformMigrations } from "../extensions/execution-platform/src/db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../extensions/execution-platform/src/db/pg-test.ts";
import {
  createBaseCanonicalRouterOutput,
  createCanonicalRouterAction,
} from "../extensions/execution-platform/src/intent-front-door/router-schema.ts";
import { NativeExecutionRpcService } from "../extensions/execution-platform/src/intent-routing/native-execution-rpc.ts";
import { RuntimeJobRepository } from "../extensions/execution-platform/src/runtime-job-repository.ts";

const ARTIFACT_DIR = ".artifacts/execution-platform";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sequenceFrontDoorProvider(outputs) {
  const requests = [];
  return {
    requests,
    async route(request) {
      requests.push({
        requestId: request.requestId,
        reasonCodes: request.reasonCodes,
        routerConfigVersion: request.routerConfigVersion,
        rawPromptStored: false,
        rawResponseStored: false,
      });
      const output = outputs[Math.min(requests.length - 1, outputs.length - 1)];
      return {
        output,
        providerRef: "fixture://structured-front-door/capability-subject-proof",
        modelCandidateId: "fixture-router",
        providerCallMade: false,
        reasonCodes: [`fixture_structured_router_call_${requests.length}`],
      };
    },
  };
}

async function main() {
  await mkdir(ARTIFACT_DIR, { recursive: true });
  const prompt =
    "Implement Product/Spec Planning Production Upgrade as a first-class production workflow in OpenClaw. Do not deploy, send outbound messages, promote models, store raw logs, or mutate Work Queue lifecycle directly.";
  const promptHash = sha256(prompt);
  const wrongExecutor = createBaseCanonicalRouterOutput({
    route: "workflow_execution",
    responseMode: "create_runtime_job",
    executeNow: true,
    executorWorkflowId: "agent_team.product_spec_planning",
    workflowId: "agent_team.product_spec_planning",
    jobType: "executor.workflow",
    confidence: 0.94,
    objectiveSummary: "Implement Product/Spec Planning Production Upgrade.",
    subjectWorkflowIds: ["agent_team.product_spec_planning"],
    targetSubjectRefs: [
      {
        targetKind: "workflow",
        targetRef: "workflow://agent_team.product_spec_planning",
        confidence: 0.96,
      },
    ],
    requestedCapabilities: ["code_edit", "test", "docs_update", "review", "closeout"],
    constraints: [
      { constraintKind: "deploy", objectSummary: "do not deploy", confidence: 0.99 },
      { constraintKind: "outbound_send", objectSummary: "do not send outbound", confidence: 0.99 },
      {
        constraintKind: "model_promotion",
        objectSummary: "do not promote models",
        confidence: 0.99,
      },
      { constraintKind: "raw_storage", objectSummary: "do not store raw logs", confidence: 0.99 },
    ],
    requestedActions: [
      createCanonicalRouterAction("code_edit", "implement the target workflow", 0.95),
      createCanonicalRouterAction("test", "validate the target workflow", 0.9),
      createCanonicalRouterAction("docs_update", "document the target workflow", 0.9),
      createCanonicalRouterAction("review", "review the implementation", 0.9),
      createCanonicalRouterAction("closeout", "close out the work", 0.9),
    ],
    negatedActions: [
      createCanonicalRouterAction("deploy", "do not deploy", 0.99),
      createCanonicalRouterAction("outbound_send", "do not send outbound", 0.99),
      createCanonicalRouterAction("model_promotion", "do not promote models", 0.99),
    ],
    requestedAuthority: "local_yolo",
    sideEffectClass: "code_edit",
    selectedExecutionReason:
      "Incorrect first pass: selected the target planning workflow as executor.",
    targetSubjectReason: "Product/Spec Planning is the workflow being upgraded.",
  });
  const repairedExecutor = createBaseCanonicalRouterOutput({
    ...wrongExecutor,
    executorWorkflowId: "agent_team.coding",
    workflowId: "agent_team.coding",
    jobType: "executor.agent_team",
    selectedExecutionReason:
      "The requested capabilities require a coding executor with source edit, test, docs, review, and closeout capability.",
    targetSubjectReason:
      "Product/Spec Planning remains the target subject because it is the workflow being upgraded.",
  });
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic" });
    const provider = sequenceFrontDoorProvider([wrongExecutor, repairedExecutor]);
    const service = new NativeExecutionRpcService({
      runtimeJobs,
      structuredRouterProvider: provider,
    });
    const result = await service.submit({
      prompt,
      auth: {
        actorId: "operator",
        authenticated: true,
        role: "operator",
        sessionId: "agent:main:main",
      },
    });
    const artifacts = result.runtimeJobId
      ? await runtimeJobs.listArtifacts(result.runtimeJobId)
      : [];
    const compiled = result.frontDoorCompiledRequest;
    const proof = {
      artifactKind: "capability_subject_routing_split_production_path_proof",
      generatedAt: new Date().toISOString(),
      promptHash,
      promptLength: prompt.length,
      rawPromptStored: false,
      rawResponseStored: false,
      providerCallMade: false,
      productionPathExercised: "NativeExecutionRpcService.submit",
      accepted: result.accepted,
      runtimeJobId: result.runtimeJobId ?? null,
      routerCallCount: provider.requests.length,
      repairAttempted: provider.requests.some((request) =>
        request.reasonCodes.includes("executor_capability_repair_attempted"),
      ),
      executorWorkflowId: compiled?.executorWorkflowId ?? null,
      workflowIdCompatibilityAlias: compiled?.workflowId ?? null,
      subjectWorkflowIds: compiled?.subjectWorkflowIds ?? [],
      targetSubjectRefs: compiled?.targetSubjectRefs ?? [],
      requestedCapabilities: compiled?.requestedCapabilities ?? [],
      constraints: compiled?.constraints ?? [],
      artifactTypes: artifacts.map((artifact) => artifact.artifactType).toSorted(),
      passed:
        result.accepted &&
        provider.requests.length === 2 &&
        compiled?.executorWorkflowId === "agent_team.coding" &&
        compiled?.workflowId === "agent_team.coding" &&
        Array.isArray(compiled?.subjectWorkflowIds) &&
        compiled.subjectWorkflowIds.includes("agent_team.product_spec_planning") &&
        Array.isArray(compiled?.targetSubjectRefs) &&
        compiled.targetSubjectRefs.some(
          (ref) => ref.targetRef === "workflow://agent_team.product_spec_planning",
        ) &&
        Array.isArray(compiled?.requestedCapabilities) &&
        compiled.requestedCapabilities.includes("code_edit") &&
        compiled.requestedCapabilities.includes("test") &&
        compiled.requestedCapabilities.includes("docs_update"),
      reasonCodes: result.accepted
        ? ["capability_subject_routing_split_proof_completed"]
        : result.reasonCodes,
      workQueueLifecycleMutated: false,
    };
    await writeFile(
      `${ARTIFACT_DIR}/capability-subject-production-path-proof-summary.json`,
      `${JSON.stringify(proof, null, 2)}\n`,
    );
    if (!proof.passed) {
      throw new Error(`capability subject proof failed: ${JSON.stringify(proof.reasonCodes)}`);
    }
    console.log(JSON.stringify(proof, null, 2));
  } finally {
    await database.close();
  }
}

await main();
