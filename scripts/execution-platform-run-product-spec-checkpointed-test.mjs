#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function hasTsxImport() {
  return process.execArgv.some((arg, index) => {
    if (arg === "--import" && process.execArgv[index + 1] === "tsx") {
      return true;
    }
    return arg === "--import=tsx";
  });
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage: node scripts/execution-platform-run-product-spec-checkpointed-test.mjs [prompt-file]

Runs the Product/Spec checkpointed proof through the live gateway.

Environment:
  OPENCLAW_LOCAL_GATEWAY_BASE                 Gateway base URL, default http://127.0.0.1:28789
  OPENCLAW_PRODUCT_SPEC_SUBMIT_TIMEOUT_MS    Submit timeout, default 600000
  OPENCLAW_PRODUCT_SPEC_CHECKPOINT_MAX_MS    Runtime polling timeout, default 5400000
  OPENCLAW_PRODUCT_SPEC_STOP_AFTER_GATE      Optional gate name to stop after

This command performs a real submit unless --help/-h is provided.`);
  process.exit(0);
}

if (!hasTsxImport()) {
  const result = spawnSync(
    process.execPath,
    [
      ...process.execArgv,
      "--import",
      "tsx",
      fileURLToPath(import.meta.url),
      ...process.argv.slice(2),
    ],
    {
      stdio: "inherit",
      env: {
        ...process.env,
        OPENCLAW_PRODUCT_SPEC_CHECKPOINT_TSX_REEXEC: "1",
      },
    },
  );
  if (result.error) {
    throw result.error;
  }
  process.exit(result.status ?? 1);
}

let readExecutionPlatformDatabaseConfigLite;
let buildLatestRunState;
let projectProofHarnessCanonicalGate;
let assertProofHarnessManifestBounds;
let loadConfig;
let runGatewayAgentTeamRuntimeJobOnce;
let getExecutionPlatformRuntime;
let evaluateArchitectureTransitionTopologyGate;

async function loadRuntimeModules() {
  if (readExecutionPlatformDatabaseConfigLite) {
    return;
  }
  ({ readExecutionPlatformDatabaseConfigLite } =
    await import("../extensions/execution-platform/src/db/runtime.ts"));
  ({ buildLatestRunState } =
    await import("../extensions/execution-platform/src/observability/latest-run-state.ts"));
  ({ projectProofHarnessCanonicalGate, assertProofHarnessManifestBounds } = await import(
    "../extensions/execution-platform/src/observability/proof-harness-canonical-gate.ts"
  ));
  ({ loadConfig } = await import("../src/config/config.ts"));
  ({ runGatewayAgentTeamRuntimeJobOnce } =
    await import("../src/gateway/execution-platform-agent-team-runner.ts"));
  ({ getExecutionPlatformRuntime } = await import("../src/gateway/execution-platform-http.ts"));
  ({ evaluateArchitectureTransitionTopologyGate } = await import(
    "../extensions/execution-platform/src/workflows/architecture-transition-topology-gate.ts"
  ));
}

const ARTIFACT_DIR = ".artifacts/execution-platform";
const DEFAULT_PROMPT_FILE =
  "docs/projects/execution-platform/prompts/product-spec-planning-workflow-plugin-production-proof-openclaw.md";
const LOCAL_BASE = process.env.OPENCLAW_LOCAL_GATEWAY_BASE ?? "http://127.0.0.1:28789";
const PROGRESS_INTERVAL_MS = Number(
  process.env.OPENCLAW_PRODUCT_SPEC_CHECKPOINT_INTERVAL_MS ?? 15_000,
);
const MAX_RUNTIME_MS = Number(process.env.OPENCLAW_PRODUCT_SPEC_CHECKPOINT_MAX_MS ?? 90 * 60_000);
const SUBMIT_TIMEOUT_MS = Number(process.env.OPENCLAW_PRODUCT_SPEC_SUBMIT_TIMEOUT_MS ?? 600_000);
const STOP_AFTER_GATE = (process.env.OPENCLAW_PRODUCT_SPEC_STOP_AFTER_GATE ?? "").trim();

function sha256(value) {
  return crypto
    .createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadEnvFile(filePath) {
  const text = await fs.readFile(filePath, "utf8").catch(() => "");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const index = trimmed.indexOf("=");
    if (index === -1) {
      continue;
    }
    const key = trimmed.slice(0, index).trim();
    if (process.env[key]) {
      continue;
    }
    process.env[key] = trimmed
      .slice(index + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
}

async function writeJson(name, value) {
  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  const target = path.join(ARTIFACT_DIR, name);
  const body = `${JSON.stringify(value, null, 2)}\n`;
  await fs.writeFile(target, body, "utf8");
  return {
    path: target,
    sha256: sha256(body),
    bytes: Buffer.byteLength(body, "utf8"),
  };
}

async function boundedFetchJson(url, options = {}) {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? 120_000;
  const requestOptions = { ...options };
  delete requestOptions.timeoutMs;
  try {
    const response = await fetch(url, {
      ...requestOptions,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    return {
      ok: response.ok,
      status: response.status,
      durationMs: Date.now() - startedAt,
      bodyHash: sha256(text),
      parsed,
      rawResponseStored: false,
    };
  } catch (error) {
    const cause =
      error && typeof error === "object" && "cause" in error && error.cause ? error.cause : null;
    return {
      ok: false,
      status: null,
      durationMs: Date.now() - startedAt,
      errorName: error?.name ?? "fetch_failed",
      errorMessageHash: sha256(error instanceof Error ? error.message : String(error)),
      errorCauseName:
        cause && typeof cause === "object" && "name" in cause ? String(cause.name) : null,
      errorCauseCode:
        cause && typeof cause === "object" && "code" in cause ? String(cause.code) : null,
      urlHash: sha256(url),
      method:
        typeof requestOptions.method === "string" ? requestOptions.method.toUpperCase() : "GET",
      timeoutMs,
      rawResponseStored: false,
    };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function positionalArgs(argv) {
  const flagsWithValues = new Set(["--runtime-job-id", "--clone-runtime-job-id", "--prompt-file"]);
  const positional = [];
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (flagsWithValues.has(arg)) {
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      continue;
    }
    positional.push(arg);
  }
  return positional;
}

async function submitPrompt(prompt, promptHash, sourcePromptRef) {
  const token = process.env.OPENCLAW_GATEWAY_TOKEN?.trim();
  if (!token) {
    return {
      accepted: false,
      ok: false,
      status: null,
      reasonCodes: ["OPENCLAW_GATEWAY_TOKEN_missing"],
      rawResponseStored: false,
    };
  }
  const workItemId = `product-spec-checkpointed-${promptHash.slice(0, 12)}-${Date.now()
    .toString(36)
    .slice(-6)}`;
  await writeJson("product-spec-checkpointed-test-submit-start.json", {
    artifactKind: "product_spec_checkpointed_test_submit_start",
    generatedAt: new Date().toISOString(),
    submitPath: `${LOCAL_BASE}/api/execution-platform/execution/submit`,
    sourceRoute: "ux",
    workItemId,
    promptHash,
    promptLength: prompt.length,
    timeoutMs: SUBMIT_TIMEOUT_MS,
    note: "This boundary goes through the running gateway submit path. Rebuild/reload state matters before a scheduler replay can start.",
    rawPromptStored: false,
    rawResponseStored: false,
  });
  process.stdout.write(
    `${JSON.stringify({
      event: "product_spec_submit_start",
      at: new Date().toISOString(),
      workItemId,
      promptHash,
      promptLength: prompt.length,
      timeoutMs: SUBMIT_TIMEOUT_MS,
    })}\n`,
  );
  const submit = await boundedFetchJson(`${LOCAL_BASE}/api/execution-platform/execution/submit`, {
    method: "POST",
    timeoutMs: SUBMIT_TIMEOUT_MS,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-openclaw-actor-id": "operator:primary",
      "x-openclaw-session-key": "agent:main:main",
      "x-openclaw-source-route": "ux",
    },
    body: JSON.stringify({
      prompt,
      workItemId,
      sourceRoute: "ux",
      sourcePromptRef,
      auth: {
        actorId: "operator:primary",
        authenticated: true,
        role: "operator",
        sessionId: "agent:main:main",
        sourceRoute: "ux",
      },
    }),
  });
  const result = {
    ...submit,
    workItemId,
    runtimeJobId:
      submit.parsed && typeof submit.parsed.runtimeJobId === "string"
        ? submit.parsed.runtimeJobId
        : null,
    workflowId:
      submit.parsed && typeof submit.parsed.workflowId === "string"
        ? submit.parsed.workflowId
        : null,
    jobType:
      submit.parsed && typeof submit.parsed.jobType === "string" ? submit.parsed.jobType : null,
    accepted: submit.parsed?.accepted === true,
    reasonCodes: Array.isArray(submit.parsed?.reasonCodes)
      ? submit.parsed.reasonCodes.filter((code) => typeof code === "string").slice(0, 60)
      : [],
  };
  await writeJson("product-spec-checkpointed-test-submit-result.json", {
    artifactKind: "product_spec_checkpointed_test_submit_result",
    generatedAt: new Date().toISOString(),
    workItemId,
    accepted: result.accepted,
    ok: result.ok,
    status: result.status,
    runtimeJobId: result.runtimeJobId,
    workflowId: result.workflowId,
    jobType: result.jobType,
    durationMs: result.durationMs,
    reasonCodes: result.reasonCodes,
    errorName: result.errorName ?? null,
    errorCauseCode: result.errorCauseCode ?? null,
    bodyHash: result.bodyHash ?? null,
    rawPromptStored: false,
    rawResponseStored: false,
  });
  process.stdout.write(
    `${JSON.stringify({
      event: "product_spec_submit_result",
      at: new Date().toISOString(),
      accepted: result.accepted,
      ok: result.ok,
      status: result.status,
      runtimeJobId: result.runtimeJobId,
      workflowId: result.workflowId,
      jobType: result.jobType,
      durationMs: result.durationMs,
      reasonCodes: result.reasonCodes,
      errorName: result.errorName ?? null,
      errorCauseCode: result.errorCauseCode ?? null,
    })}\n`,
  );
  return result;
}

async function collectSubmitLatencyDiagnostics({ runtime, submit, timing }) {
  if (!submit?.runtimeJobId) {
    return null;
  }
  const startedAt = Date.now();
  const artifacts = await runtime.runtimeJobs.listArtifacts(submit.runtimeJobId);
  const artifactByType = new Map(artifacts.map((artifact) => [artifact.artifactType, artifact]));
  const routerMetadata =
    artifactByType.get("execution.front_door.router_result")?.metadata?.metadata ?? {};
  const routingTelemetry =
    artifactByType.get("execution.front_door.routing_telemetry")?.metadata ?? {};
  const compiledRequest =
    artifactByType.get("execution.front_door.compiled_request")?.metadata ?? {};
  const diagnostics = {
    artifactKind: "product_spec_submit_latency_diagnostics",
    generatedAt: new Date().toISOString(),
    runtimeJobId: submit.runtimeJobId,
    workItemId: submit.workItemId ?? null,
    promptHash: timing.promptHash,
    promptLength: timing.promptLength,
    totalSubmitDurationMs: submit.durationMs ?? null,
    promptFileReadElapsedMs: timing.promptFileReadElapsedMs ?? null,
    sourcePromptWriteElapsedMs: timing.sourcePromptWriteElapsedMs ?? null,
    configLoadElapsedMs: timing.configLoadElapsedMs ?? null,
    runtimeInitElapsedMs: timing.runtimeInitElapsedMs ?? null,
    postSubmitArtifactReadElapsedMs: Date.now() - startedAt,
    frontDoorRouterLatencyMs:
      typeof routerMetadata.latencyMs === "number" ? routerMetadata.latencyMs : null,
    frontDoorProviderRef:
      typeof routerMetadata.providerRef === "string" ? routerMetadata.providerRef : null,
    frontDoorModelCandidateId:
      typeof routerMetadata.modelCandidateId === "string" ? routerMetadata.modelCandidateId : null,
    frontDoorProviderCallMade: routerMetadata.providerCallMade === true,
    frontDoorCompilerOutcome:
      typeof routingTelemetry.compilerOutcome === "string"
        ? routingTelemetry.compilerOutcome
        : null,
    frontDoorValidatorOutcome:
      typeof routingTelemetry.validatorOutcome === "string"
        ? routingTelemetry.validatorOutcome
        : null,
    frontDoorEscalationOutcome:
      typeof routingTelemetry.escalationOutcome === "string"
        ? routingTelemetry.escalationOutcome
        : null,
    compiledQueueName:
      typeof compiledRequest.queueName === "string" ? compiledRequest.queueName : null,
    compiledJobType: typeof compiledRequest.jobType === "string" ? compiledRequest.jobType : null,
    compiledWorkflowId:
      typeof compiledRequest.workflowId === "string" ? compiledRequest.workflowId : null,
    frontDoorArtifactTypes: artifacts
      .map((artifact) => artifact.artifactType)
      .filter((type) => type.startsWith("execution.front_door."))
      .toSorted(),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
  await writeJson("product-spec-submit-latency-diagnostics.json", diagnostics);
  process.stdout.write(
    `${JSON.stringify({
      event: "product_spec_submit_latency_diagnostics",
      at: new Date().toISOString(),
      runtimeJobId: submit.runtimeJobId,
      totalSubmitDurationMs: diagnostics.totalSubmitDurationMs,
      frontDoorRouterLatencyMs: diagnostics.frontDoorRouterLatencyMs,
      frontDoorProviderRef: diagnostics.frontDoorProviderRef,
      frontDoorModelCandidateId: diagnostics.frontDoorModelCandidateId,
      promptFileReadElapsedMs: diagnostics.promptFileReadElapsedMs,
      configLoadElapsedMs: diagnostics.configLoadElapsedMs,
      runtimeInitElapsedMs: diagnostics.runtimeInitElapsedMs,
      sourcePromptWriteElapsedMs: diagnostics.sourcePromptWriteElapsedMs,
      postSubmitArtifactReadElapsedMs: diagnostics.postSubmitArtifactReadElapsedMs,
    })}\n`,
  );
  return diagnostics;
}

function metadataOf(artifact) {
  return artifact?.metadata && typeof artifact.metadata === "object" ? artifact.metadata : {};
}

function boundedStringValue(value, max = 700) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function boundedStringArrayValue(value, max = 40) {
  return Array.isArray(value)
    ? [
        ...new Set(
          value
            .map((item) => boundedStringValue(item, 500))
            .filter((item) => typeof item === "string" && item.length > 0),
        ),
      ].slice(0, max)
    : [];
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function boundedBranchScopedFrontierStates(value, max = 40) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((branch) => ({
      branchId: boundedStringValue(branch.branchId, 180),
      nodeId: boundedStringValue(branch.nodeId, 260),
      nodeKind: boundedStringValue(branch.nodeKind, 180),
      workIntentRef: boundedStringValue(branch.workIntentRef ?? branch.workIntentId, 600),
      executionIntent: boundedStringValue(branch.executionIntent, 160),
      evidenceMode: boundedStringArrayValue(branch.evidenceMode, 12),
      capabilityId: boundedStringValue(branch.capabilityId, 240),
      executorKey: boundedStringValue(branch.executorKey, 240),
      workerRef: boundedStringValue(branch.workerRef, 240),
      modelRef: boundedStringValue(branch.modelRef, 240),
      contractRef: boundedStringValue(branch.contractRef, 600),
      readinessRef: boundedStringValue(branch.readinessRef ?? branch.readinessStateRef, 600),
      resourceRequirementRefs: boundedStringArrayValue(branch.resourceRequirementRefs, 20),
      nodeResourceDemandSessionRefs: boundedStringArrayValue(branch.nodeResourceDemandSessionRefs, 20),
      nodeResourceLedgerManifestRefs: boundedStringArrayValue(
        branch.nodeResourceLedgerManifestRefs,
        20,
      ),
      domainResourceSelectionRefs: boundedStringArrayValue(branch.domainResourceSelectionRefs, 20),
      actionGateStatus: boundedStringValue(branch.actionGateStatus, 160),
      actionGateMissingFields: boundedStringArrayValue(branch.actionGateMissingFields, 20),
      providerDiagnosticRefs: boundedStringArrayValue(branch.providerDiagnosticRefs, 20),
      providerDiagnosticStatus: boundedStringValue(branch.providerDiagnosticStatus, 160),
      resourcePacketRef: boundedStringValue(branch.resourcePacketRef, 600),
      nodeExecutionPacketRef: boundedStringValue(branch.nodeExecutionPacketRef, 600),
      status: boundedStringValue(branch.status, 160),
      phase: boundedStringValue(branch.phase, 160),
      blocker: objectValue(branch.blocker)
        ? {
            code: boundedStringValue(branch.blocker.code, 220),
            summary: boundedStringValue(branch.blocker.summary, 700),
            schemaPath: boundedStringValue(branch.blocker.schemaPath, 260),
            policyPath: boundedStringValue(branch.blocker.policyPath, 260),
            reasonCodes: boundedStringArrayValue(branch.blocker.reasonCodes, 40),
            missingFields: boundedStringArrayValue(branch.blocker.missingFields, 20),
          }
        : undefined,
      reasonCodes: boundedStringArrayValue(branch.reasonCodes, 40),
      missingFields: boundedStringArrayValue(branch.missingFields, 20),
      nextLegalTransitions: boundedStringArrayValue(branch.nextLegalTransitions, 20),
      consumerRefs: boundedStringArrayValue(branch.consumerRefs, 20),
      dependentConsumers: boundedStringArrayValue(branch.dependentConsumers, 20),
      successfulEvidenceRefs: boundedStringArrayValue(branch.successfulEvidenceRefs, 20),
      failedEvidenceRefs: boundedStringArrayValue(branch.failedEvidenceRefs, 20),
      rootCauseRef: boundedStringValue(branch.rootCauseRef, 600),
    }))
    .filter((branch) => branch.nodeId)
    .slice(0, max);
}

function artifactCounts(artifacts) {
  const counts = new Map();
  for (const artifact of artifacts) {
    counts.set(artifact.artifactType, (counts.get(artifact.artifactType) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([artifactType, count]) => ({ artifactType, count }))
    .toSorted((left, right) => left.artifactType.localeCompare(right.artifactType));
}

function latestArtifact(artifacts, artifactType) {
  return artifacts.findLast((artifact) => artifact.artifactType === artifactType) ?? null;
}

function summarizeSourcePromptIndex(artifact) {
  if (!artifact) {
    return null;
  }
  const metadata = metadataOf(artifact);
  return {
    artifactRef: artifact.uri,
    promptHash: typeof metadata.promptHash === "string" ? metadata.promptHash : null,
    promptLength: typeof metadata.promptLength === "number" ? metadata.promptLength : null,
    resolutionStatus:
      typeof metadata.resolutionStatus === "string" ? metadata.resolutionStatus : null,
    reasonCodes: Array.isArray(metadata.reasonCodes)
      ? metadata.reasonCodes.filter((item) => typeof item === "string").slice(0, 20)
      : [],
    sectionRefs: Array.isArray(metadata.sections)
      ? metadata.sections
          .filter((item) => item && typeof item === "object" && typeof item.sectionRef === "string")
          .map((item) => item.sectionRef)
          .slice(0, 20)
      : [],
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

function summarizeMissionLedger(artifact) {
  if (!artifact) {
    return null;
  }
  const metadata = metadataOf(artifact);
  const blockingCommitments = Array.isArray(metadata.blockingCommitments)
    ? metadata.blockingCommitments
    : [];
  const nonBlockingCommitments = Array.isArray(metadata.nonBlockingCommitments)
    ? metadata.nonBlockingCommitments
    : [];
  const commitments = [...blockingCommitments, ...nonBlockingCommitments]
    .filter((item) => item && typeof item === "object")
    .map((commitment) => ({
      commitmentId: typeof commitment.commitmentId === "string" ? commitment.commitmentId : null,
      commitmentText:
        typeof commitment.commitmentText === "string"
          ? commitment.commitmentText.slice(0, 900)
          : null,
      whyItMatters:
        typeof commitment.whyItMatters === "string" ? commitment.whyItMatters.slice(0, 600) : null,
      expectedEvidenceDescription:
        typeof commitment.expectedEvidenceDescription === "string"
          ? commitment.expectedEvidenceDescription.slice(0, 700)
          : null,
      status: typeof commitment.status === "string" ? commitment.status : null,
      blocking: commitment.blocking === true,
      remainingWork: Array.isArray(commitment.remainingWork)
        ? commitment.remainingWork.filter((item) => typeof item === "string").slice(0, 8)
        : [],
    }));
  return {
    artifactRef: artifact.uri,
    missionId: typeof metadata.missionId === "string" ? metadata.missionId : null,
    ledgerStatus: typeof metadata.ledgerStatus === "string" ? metadata.ledgerStatus : null,
    missionGate: typeof metadata.missionGate === "string" ? metadata.missionGate : null,
    ownerObjectiveSummary:
      typeof metadata.ownerObjectiveSummary === "string"
        ? metadata.ownerObjectiveSummary.slice(0, 1_500)
        : null,
    blockingCommitmentCount: blockingCommitments.length,
    nonBlockingCommitmentCount: nonBlockingCommitments.length,
    openBlockingCommitmentIds: commitments
      .filter(
        (commitment) =>
          commitment.blocking &&
          commitment.status !== "satisfied" &&
          commitment.status !== "impossible",
      )
      .map((commitment) => commitment.commitmentId)
      .filter(Boolean),
    commitments,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

function summarizeObligationGraph(artifact) {
  if (!artifact) {
    return null;
  }
  const metadata = metadataOf(artifact);
  return {
    artifactRef: artifact.uri,
    graphRef: typeof metadata.graphRef === "string" ? metadata.graphRef : artifact.uri,
    graphHash: typeof metadata.graphHash === "string" ? metadata.graphHash : null,
    missionId: typeof metadata.missionId === "string" ? metadata.missionId : null,
    obligationCount: typeof metadata.obligationCount === "number" ? metadata.obligationCount : null,
    executableCount: typeof metadata.executableCount === "number" ? metadata.executableCount : null,
    nonExecutableCount:
      typeof metadata.nonExecutableCount === "number" ? metadata.nonExecutableCount : null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function summarizeResourceSpecialist(artifact) {
  if (!artifact) {
    return null;
  }
  const metadata = metadataOf(artifact);
  const sufficiency =
    metadata.sufficiencyReview && typeof metadata.sufficiencyReview === "object"
      ? metadata.sufficiencyReview
      : {};
  const verifiedFileRefs = Array.isArray(metadata.verifiedFileRefs)
    ? metadata.verifiedFileRefs
        .map((item) =>
          typeof item === "string"
            ? item
            : item && typeof item === "object" && typeof item.fileRef === "string"
              ? item.fileRef
              : null,
        )
        .filter((item) => typeof item === "string")
        .slice(0, 20)
    : [];
  const sufficiencyStatus =
    typeof sufficiency.status === "string"
      ? sufficiency.status
      : typeof metadata.sufficiencyStatus === "string"
        ? metadata.sufficiencyStatus
        : null;
  const sufficientForImplementation =
    sufficiency.sufficientForImplementation === true ||
    ((sufficiencyStatus === "accepted" || sufficiencyStatus === "accepted_with_limitations") &&
      verifiedFileRefs.length > 0);
  return {
    artifactRef: artifact.uri,
    loopId: typeof metadata.loopId === "string" ? metadata.loopId : null,
    status: typeof metadata.status === "string" ? metadata.status : null,
    verifiedFileRefs,
    handoffPacketRef:
      typeof metadata.resourceHandoffPacketRef === "string"
        ? metadata.resourceHandoffPacketRef
        : null,
    sufficiencyStatus,
    sufficientForImplementation,
    missingInformation: Array.isArray(sufficiency.missingInformation)
      ? sufficiency.missingInformation.filter((item) => typeof item === "string").slice(0, 12)
      : [],
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

function summarizeSchedulerProgress(artifacts) {
  return artifacts
    .filter((artifact) => artifact.artifactType === "agent_team.scheduler_progress")
    .map((artifact) => {
      const metadata = metadataOf(artifact);
      return {
        artifactRef: artifact.uri,
        createdAt: artifact.createdAt.toISOString(),
        stage: typeof metadata.stage === "string" ? metadata.stage : null,
        status: typeof metadata.status === "string" ? metadata.status : null,
        currentPhase: typeof metadata.currentPhase === "string" ? metadata.currentPhase : null,
        schedulerPhase:
          typeof metadata.schedulerPhase === "string" ? metadata.schedulerPhase : null,
        schedulerToolId:
          typeof metadata.schedulerToolId === "string" ? metadata.schedulerToolId : null,
        nodeId: typeof metadata.nodeId === "string" ? metadata.nodeId : null,
        branchId: boundedStringValue(metadata.branchId, 260),
        graphId: boundedStringValue(metadata.graphId, 260),
        activeNodeKind: boundedStringValue(metadata.activeNodeKind ?? metadata.nodeKind, 180),
        executionIntent: boundedStringValue(metadata.executionIntent, 160),
        evidenceMode: boundedStringArrayValue(metadata.evidenceMode, 12),
        capabilityId: boundedStringValue(metadata.capabilityId ?? metadata.selectedCapabilityId, 240),
        executorKey: boundedStringValue(metadata.executorKey ?? metadata.selectedExecutorKey, 240),
        workerRef: boundedStringValue(metadata.workerRef, 240),
        workIntentRef: boundedStringValue(metadata.workIntentRef ?? metadata.workIntentId, 600),
        workIntentId: boundedStringValue(metadata.workIntentId ?? metadata.workUnitId, 260),
        nodeExecutionContractRef: boundedStringValue(metadata.nodeExecutionContractRef, 600),
        nodeReadinessStateRef: boundedStringValue(metadata.nodeReadinessStateRef, 600),
        nodeReadinessStatus: boundedStringValue(metadata.nodeReadinessStatus, 180),
        nodeReadinessPhase: boundedStringValue(metadata.nodeReadinessPhase, 180),
        nodeReadinessStale:
          typeof metadata.nodeReadinessStale === "boolean" ? metadata.nodeReadinessStale : null,
        readinessProjectionStatus: boundedStringValue(metadata.readinessProjectionStatus, 180),
        readinessProjectionDriftReasonCodes: boundedStringArrayValue(
          metadata.readinessProjectionDriftReasonCodes,
          40,
        ),
        readinessProjectionMissingFields: boundedStringArrayValue(
          metadata.readinessProjectionMissingFields,
          40,
        ),
        resourceRequirementRefs: boundedStringArrayValue(metadata.resourceRequirementRefs, 24),
        nodeResourceDemandSessionRefs: boundedStringArrayValue(metadata.nodeResourceDemandSessionRefs, 24),
        nodeResourceDemandStatus: boundedStringValue(metadata.nodeResourceDemandStatus, 180),
        nodeResourceLedgerManifestRefs: boundedStringArrayValue(
          metadata.nodeResourceLedgerManifestRefs,
          24,
        ),
        nodeResourceLedgerStatus: boundedStringValue(metadata.nodeResourceLedgerStatus, 180),
        domainResourceSelectionRefs: boundedStringArrayValue(metadata.domainResourceSelectionRefs, 24),
        domainResourceSelectionStatus: boundedStringValue(metadata.domainResourceSelectionStatus, 180),
        actionGateStatus: boundedStringValue(metadata.actionGateStatus, 180),
        actionGateMissingFields: boundedStringArrayValue(metadata.actionGateMissingFields, 24),
        resourcePacketRef: boundedStringValue(metadata.resourcePacketRef, 600),
        domainResourcePacketRef: boundedStringValue(metadata.domainResourcePacketRef, 600),
        nodeExecutionPacketRef: boundedStringValue(metadata.nodeExecutionPacketRef, 600),
        missingFields: boundedStringArrayValue(metadata.missingFields, 40),
        schemaPath: boundedStringValue(metadata.schemaPath ?? metadata.errorPath, 260),
        policyPath: boundedStringValue(metadata.policyPath, 260),
        nextDecisionNeeded: boundedStringValue(metadata.nextDecisionNeeded ?? metadata.nextAction, 260),
        schedulerFrontierState: objectValue(metadata.schedulerFrontierState),
        parallelFrontier: objectValue(metadata.parallelFrontier),
        frontierRootCauseArtifact: objectValue(metadata.frontierRootCauseArtifact),
        noProgressSignature: objectValue(metadata.noProgressSignature),
        schedulerModelCallEnvelope: objectValue(metadata.schedulerModelCallEnvelope),
        branchScopedFrontierStates: boundedBranchScopedFrontierStates(
          metadata.branchScopedFrontierStates,
          40,
        ),
        roleId: typeof metadata.roleId === "string" ? metadata.roleId : null,
        modelRef: typeof metadata.modelRef === "string" ? metadata.modelRef : null,
        providerPath: typeof metadata.providerPath === "string" ? metadata.providerPath : null,
        selectedCapabilityId:
          typeof metadata.selectedCapabilityId === "string" ? metadata.selectedCapabilityId : null,
        objective:
          typeof metadata.currentObjective === "string"
            ? metadata.currentObjective.slice(0, 500)
            : null,
        blockerSummary:
          typeof metadata.blockerSummary === "string"
            ? metadata.blockerSummary.slice(0, 500)
            : null,
        eli5Progress:
          typeof metadata.eli5Progress === "string" ? metadata.eli5Progress.slice(0, 500) : null,
        reasonCodes: Array.isArray(metadata.reasonCodes)
          ? metadata.reasonCodes.filter((item) => typeof item === "string").slice(0, 20)
          : [],
        modelRetryEvidence:
          metadata.modelRetryEvidence && typeof metadata.modelRetryEvidence === "object"
            ? metadata.modelRetryEvidence
            : null,
        modelProviderDiagnostics:
          metadata.modelProviderDiagnostics && typeof metadata.modelProviderDiagnostics === "object"
            ? metadata.modelProviderDiagnostics
            : null,
        modelCallSpanElapsedMs:
          typeof metadata.modelCallSpanElapsedMs === "number"
            ? metadata.modelCallSpanElapsedMs
            : null,
      };
    })
    .slice(-60);
}

function summarizeAllSchedulerProgressForTelemetry(artifacts) {
  return artifacts
    .filter((artifact) => artifact.artifactType === "agent_team.scheduler_progress")
    .map((artifact) => {
      const metadata = metadataOf(artifact);
      return {
        createdAt: artifact.createdAt.toISOString(),
        stage: typeof metadata.stage === "string" ? metadata.stage : null,
        currentPhase: typeof metadata.currentPhase === "string" ? metadata.currentPhase : null,
        schedulerPhase:
          typeof metadata.schedulerPhase === "string" ? metadata.schedulerPhase : null,
        roleId: typeof metadata.roleId === "string" ? metadata.roleId : null,
        nodeId: typeof metadata.nodeId === "string" ? metadata.nodeId : null,
        modelRef: typeof metadata.modelRef === "string" ? metadata.modelRef : null,
        providerPath: typeof metadata.providerPath === "string" ? metadata.providerPath : null,
        modelProviderDiagnostics:
          metadata.modelProviderDiagnostics && typeof metadata.modelProviderDiagnostics === "object"
            ? metadata.modelProviderDiagnostics
            : null,
        modelCallSpanElapsedMs:
          typeof metadata.modelCallSpanElapsedMs === "number"
            ? metadata.modelCallSpanElapsedMs
            : null,
      };
    });
}

function numberFromObject(value, keys) {
  if (!value || typeof value !== "object") {
    return null;
  }
  for (const key of keys) {
    const next = value[key];
    if (typeof next === "number" && Number.isFinite(next)) {
      return next;
    }
  }
  return null;
}

function usageFromDiagnostics(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const usage =
    value.usage && typeof value.usage === "object"
      ? value.usage
      : value.providerUsage && typeof value.providerUsage === "object"
        ? value.providerUsage
        : value;
  const inputTokens = numberFromObject(usage, [
    "inputTokenCount",
    "promptTokens",
    "prompt_tokens",
    "input_tokens",
  ]);
  const outputTokens = numberFromObject(usage, [
    "outputTokenCount",
    "completionTokens",
    "completion_tokens",
    "output_tokens",
  ]);
  const totalTokens =
    numberFromObject(usage, ["totalTokenCount", "totalTokens", "total_tokens"]) ??
    (inputTokens !== null || outputTokens !== null
      ? (inputTokens ?? 0) + (outputTokens ?? 0)
      : null);
  const estimatedCostUsd = numberFromObject(usage, ["estimatedCostUsd", "cost", "total_cost"]);
  if (
    inputTokens === null &&
    outputTokens === null &&
    totalTokens === null &&
    estimatedCostUsd === null
  ) {
    return null;
  }
  return { inputTokens, outputTokens, totalTokens, estimatedCostUsd };
}

function usageUnavailableReasonFromDiagnostics(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  return typeof value.usageUnavailableReason === "string" && value.usageUnavailableReason.trim()
    ? value.usageUnavailableReason.trim()
    : null;
}

function estimatedTokenRangeFromDiagnostics(value) {
  if (!value || typeof value !== "object") {
    return null;
  }
  const range = value.estimatedTokenRange;
  if (!range || typeof range !== "object") {
    return null;
  }
  const inputLow = numberFromObject(range, ["inputTokensLow", "inputLow", "promptTokensLow"]);
  const inputHigh = numberFromObject(range, ["inputTokensHigh", "inputHigh", "promptTokensHigh"]);
  const outputLow = numberFromObject(range, [
    "outputTokensLow",
    "outputLow",
    "completionTokensLow",
  ]);
  const outputHigh = numberFromObject(range, [
    "outputTokensHigh",
    "outputHigh",
    "completionTokensHigh",
  ]);
  const low =
    numberFromObject(range, ["low", "min", "lower"]) ??
    (inputLow !== null || outputLow !== null ? (inputLow ?? 0) + (outputLow ?? 0) : null);
  const high =
    numberFromObject(range, ["high", "max", "upper"]) ??
    (inputHigh !== null || outputHigh !== null ? (inputHigh ?? 0) + (outputHigh ?? 0) : null);
  if (low === null && high === null) {
    return null;
  }
  return { low, high, inputLow, inputHigh, outputLow, outputHigh };
}

function summarizePhaseWallClock(snapshot) {
  const progress =
    snapshot.telemetry?.allSchedulerProgress ?? snapshot.checkpoints.schedulerProgress ?? [];
  const phases = new Map();
  for (const event of progress) {
    const key =
      event.currentPhase ?? event.schedulerPhase ?? event.stage ?? event.roleId ?? "unknown_phase";
    const at = Date.parse(event.createdAt);
    if (!Number.isFinite(at)) {
      continue;
    }
    const existing = phases.get(key) ?? {
      phase: key,
      firstAt: at,
      lastAt: at,
      eventCount: 0,
      modelRefs: new Set(),
      stages: new Set(),
    };
    existing.firstAt = Math.min(existing.firstAt, at);
    existing.lastAt = Math.max(existing.lastAt, at);
    existing.eventCount += 1;
    if (event.modelRef) {
      existing.modelRefs.add(event.modelRef);
    }
    if (event.stage) {
      existing.stages.add(event.stage);
    }
    phases.set(key, existing);
  }
  return [...phases.values()]
    .map((phase) => ({
      phase: phase.phase,
      firstAt: new Date(phase.firstAt).toISOString(),
      lastAt: new Date(phase.lastAt).toISOString(),
      wallMs: Math.max(0, phase.lastAt - phase.firstAt),
      eventCount: phase.eventCount,
      modelRefs: [...phase.modelRefs].toSorted((a, b) => a.localeCompare(b)),
      stages: [...phase.stages].toSorted((a, b) => a.localeCompare(b)).slice(0, 12),
    }))
    .toSorted((a, b) => Date.parse(a.firstAt) - Date.parse(b.firstAt));
}

function summarizeModelTokenBurn(snapshot) {
  const progress =
    snapshot.telemetry?.allSchedulerProgress ?? snapshot.checkpoints.schedulerProgress ?? [];
  const byModel = new Map();
  const seenUsageKeys = new Set();
  let missingUsageEventCount = 0;
  for (const event of progress) {
    const modelRef = event.modelRef ?? event.modelProviderDiagnostics?.modelRef ?? null;
    if (!modelRef) {
      continue;
    }
    const usage = usageFromDiagnostics(event.modelProviderDiagnostics);
    const existing = byModel.get(modelRef) ?? {
      modelRef,
      callEventCount: 0,
      eventsWithUsage: 0,
      eventsMissingUsage: 0,
      actualUsageEventCount: 0,
      estimatedUsageEventCount: 0,
      unavailableUsageEventCount: 0,
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
      estimatedCostAvailable: false,
      latencyMs: 0,
      phases: new Set(),
      usageUnavailableReasons: new Map(),
      estimatedTokenRangeLow: 0,
      estimatedTokenRangeHigh: 0,
      estimatedTokenRangeAvailable: false,
    };
    existing.callEventCount += 1;
    const phase = event.currentPhase ?? event.schedulerPhase ?? event.stage;
    if (phase) {
      existing.phases.add(phase);
    }
    if (typeof event.modelProviderDiagnostics?.latencyMs === "number") {
      const latencyKey =
        event.modelProviderDiagnostics.modelCallSpanId ??
        event.modelProviderDiagnostics.outputHash ??
        event.modelCallSpanId ??
        `${event.createdAt}:${event.stage}:${event.currentPhase}:${modelRef}`;
      if (!seenUsageKeys.has(`latency:${latencyKey}`)) {
        existing.latencyMs += event.modelProviderDiagnostics.latencyMs;
        seenUsageKeys.add(`latency:${latencyKey}`);
      }
    } else if (typeof event.modelCallSpanElapsedMs === "number") {
      const latencyKey =
        event.modelCallSpanId ??
        event.modelCallSpanResponseHash ??
        `${event.createdAt}:${event.stage}:${event.currentPhase}:${modelRef}`;
      if (!seenUsageKeys.has(`latency:${latencyKey}`)) {
        existing.latencyMs += event.modelCallSpanElapsedMs;
        seenUsageKeys.add(`latency:${latencyKey}`);
      }
    }
    if (usage) {
      const usageKey =
        event.modelProviderDiagnostics?.modelCallSpanId ??
        event.modelProviderDiagnostics?.outputHash ??
        event.modelCallSpanId ??
        event.modelCallSpanResponseHash ??
        `${event.createdAt}:${event.stage}:${event.currentPhase}:${modelRef}`;
      if (seenUsageKeys.has(`usage:${usageKey}`)) {
        byModel.set(modelRef, existing);
        continue;
      }
      seenUsageKeys.add(`usage:${usageKey}`);
      existing.eventsWithUsage += 1;
      existing.actualUsageEventCount += 1;
      existing.inputTokens += usage.inputTokens ?? 0;
      existing.outputTokens += usage.outputTokens ?? 0;
      existing.totalTokens += usage.totalTokens ?? 0;
      if (typeof usage.estimatedCostUsd === "number") {
        existing.estimatedCostUsd += usage.estimatedCostUsd;
        existing.estimatedCostAvailable = true;
      }
    } else {
      existing.eventsMissingUsage += 1;
      missingUsageEventCount += 1;
      const missingReason =
        usageUnavailableReasonFromDiagnostics(event.modelProviderDiagnostics) ??
        "provider_usage_missing";
      existing.usageUnavailableReasons.set(
        missingReason,
        (existing.usageUnavailableReasons.get(missingReason) ?? 0) + 1,
      );
      const estimatedRange = estimatedTokenRangeFromDiagnostics(event.modelProviderDiagnostics);
      if (estimatedRange) {
        existing.estimatedUsageEventCount += 1;
        existing.estimatedTokenRangeLow += estimatedRange.low ?? 0;
        existing.estimatedTokenRangeHigh += estimatedRange.high ?? 0;
        existing.estimatedTokenRangeAvailable = true;
      } else {
        existing.unavailableUsageEventCount += 1;
      }
    }
    byModel.set(modelRef, existing);
  }
  return {
    byModel: [...byModel.values()]
      .map((entry) => ({
        modelRef: entry.modelRef,
        callEventCount: entry.callEventCount,
        eventsWithUsage: entry.eventsWithUsage,
        eventsMissingUsage: entry.eventsMissingUsage,
        usageKind:
          entry.actualUsageEventCount > 0
            ? entry.estimatedUsageEventCount > 0 || entry.unavailableUsageEventCount > 0
              ? "mixed_actual_estimated_or_unavailable"
              : "actual"
            : entry.estimatedUsageEventCount > 0
              ? "estimated"
              : "unavailable",
        actualUsageEventCount: entry.actualUsageEventCount,
        estimatedUsageEventCount: entry.estimatedUsageEventCount,
        unavailableUsageEventCount: entry.unavailableUsageEventCount,
        inputTokens: entry.inputTokens,
        outputTokens: entry.outputTokens,
        totalTokens: entry.totalTokens,
        estimatedCostUsd: entry.estimatedCostAvailable
          ? Number(entry.estimatedCostUsd.toFixed(8))
          : null,
        estimatedTokenRange: entry.estimatedTokenRangeAvailable
          ? {
              low: Math.round(entry.estimatedTokenRangeLow),
              high: Math.round(entry.estimatedTokenRangeHigh),
            }
          : null,
        usageUnavailableReasons: [...entry.usageUnavailableReasons.entries()]
          .map(([reason, count]) => ({ reason, count }))
          .toSorted((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
        latencyMs: entry.latencyMs,
        phases: [...entry.phases].toSorted((a, b) => a.localeCompare(b)).slice(0, 20),
      }))
      .toSorted((a, b) => b.totalTokens - a.totalTokens || a.modelRef.localeCompare(b.modelRef)),
    missingUsageEventCount,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function compactSchedulerProgressEvents(events, max = 80) {
  return Array.isArray(events)
    ? events.slice(-max).map((event) => ({
        createdAt: event.createdAt ?? null,
        stage: event.stage ?? null,
        status: event.status ?? null,
        currentPhase: event.currentPhase ?? null,
        schedulerPhase: event.schedulerPhase ?? null,
        nodeId: event.nodeId ?? null,
        roleId: event.roleId ?? null,
        selectedCapabilityId: event.selectedCapabilityId ?? null,
        activeToolId: event.schedulerToolId ?? event.activeToolId ?? null,
        modelRef: event.modelRef ?? event.modelProviderDiagnostics?.modelRef ?? null,
        providerPath: event.modelProviderDiagnostics?.providerPath ?? null,
        currentObjective: boundedStringValue(event.currentObjective, 360),
        nextDecisionNeeded: event.nextDecisionNeeded ?? null,
        reasonCodes: Array.isArray(event.reasonCodes) ? event.reasonCodes.slice(0, 16) : [],
        evidenceProducedRefs: Array.isArray(event.evidenceProducedRefs)
          ? event.evidenceProducedRefs.slice(0, 12)
          : [],
      }))
    : [];
}

function compactCanonicalProofGate(gate) {
  if (!gate || typeof gate !== "object") {
    return null;
  }
  const canonicalGate = gate.gate && typeof gate.gate === "object" ? gate.gate : {};
  return {
    firstOpenGate: gate.firstOpenGate ?? null,
    staleCheckpointGateRejected: gate.staleCheckpointGateRejected === true,
    topologyGateRejected: gate.topologyGateRejected === true,
    reasonCodes: Array.isArray(gate.reasonCodes) ? gate.reasonCodes.slice(0, 24) : [],
    gate: {
      gateKind: canonicalGate.gateKind ?? null,
      gateStatus: canonicalGate.gateStatus ?? null,
      sourceKind: canonicalGate.sourceKind ?? null,
      graphId: canonicalGate.graphId ?? null,
      nodeId: canonicalGate.nodeId ?? null,
      nodeKind: canonicalGate.nodeKind ?? null,
      workIntentRef: canonicalGate.workIntentRef ?? null,
      executionIntent: canonicalGate.executionIntent ?? null,
      capabilityId: canonicalGate.capabilityId ?? null,
      contractRef: canonicalGate.contractRef ?? null,
      readinessStateRef: canonicalGate.readinessStateRef ?? null,
      nodeExecutionPacketRef: canonicalGate.nodeExecutionPacketRef ?? null,
      nodeResourceDemandSessionRefs: Array.isArray(canonicalGate.nodeResourceDemandSessionRefs)
        ? canonicalGate.nodeResourceDemandSessionRefs.slice(0, 12)
        : [],
      nodeResourceLedgerManifestRefs: Array.isArray(
        canonicalGate.nodeResourceLedgerManifestRefs,
      )
        ? canonicalGate.nodeResourceLedgerManifestRefs.slice(0, 12)
        : [],
      domainResourceSelectionRefs: Array.isArray(canonicalGate.domainResourceSelectionRefs)
        ? canonicalGate.domainResourceSelectionRefs.slice(0, 12)
        : [],
      blockerCode: canonicalGate.blockerCode ?? null,
      blockerSummary: boundedStringValue(canonicalGate.blockerSummary, 700),
      missingFields: Array.isArray(canonicalGate.missingFields)
        ? canonicalGate.missingFields.slice(0, 20)
        : [],
      reasonCodes: Array.isArray(canonicalGate.reasonCodes)
        ? canonicalGate.reasonCodes.slice(0, 24)
        : [],
      nextLegalTransition: canonicalGate.nextLegalTransition ?? null,
    },
  };
}

function compactCheckpointGate(gate) {
  return {
    gateId: gate.gateId ?? null,
    status: gate.status ?? null,
    evidence:
      gate.gateId === "scheduler_graph"
        ? gate.evidence
        : gate.gateId === "architecture_transition_topology_invalid"
          ? {
              failed: gate.evidence?.architectureTransitionTopology?.failed === true,
              reasonCodes: Array.isArray(
                gate.evidence?.architectureTransitionTopology?.reasonCodes,
              )
                ? gate.evidence.architectureTransitionTopology.reasonCodes.slice(0, 24)
                : [],
            }
          : gate.gateId === "obligation_graph"
            ? {
                obligationCount: gate.evidence?.obligationCount ?? null,
                executableCount: gate.evidence?.executableCount ?? null,
                nonExecutableCount: gate.evidence?.nonExecutableCount ?? null,
              }
              : null,
  };
}

function compactProofSnapshot(snapshot) {
  const checkpoints = snapshot.checkpoints ?? {};
  return {
    runtimeJobId: snapshot.runtimeJobId ?? null,
    workItemId: snapshot.workItemId ?? null,
    generatedAt: snapshot.generatedAt ?? null,
    job: snapshot.job
      ? {
          state: snapshot.job.state ?? null,
          attempts: snapshot.job.attempts ?? null,
          startedAt: snapshot.job.startedAt ?? null,
          completedAt: snapshot.job.completedAt ?? null,
          failureReason: snapshot.job.failureReason ?? null,
        }
      : null,
    checkpoints: {
      firstOpenGate: checkpoints.firstOpenGate ?? null,
      hardFailures: Array.isArray(checkpoints.hardFailures)
        ? checkpoints.hardFailures.slice(0, 32)
        : [],
      needsReview: Array.isArray(checkpoints.needsReview)
        ? checkpoints.needsReview.slice(0, 32)
        : [],
      shouldStop: checkpoints.shouldStop === true,
      graph: checkpoints.graph ?? null,
      gates: Array.isArray(checkpoints.gates) ? checkpoints.gates.map(compactCheckpointGate) : [],
      canonicalProofGate: compactCanonicalProofGate(checkpoints.canonicalProofGate),
      schedulerProgress: compactSchedulerProgressEvents(checkpoints.schedulerProgress, 80),
    },
    telemetry: {
      artifactCounts: Array.isArray(snapshot.telemetry?.artifactCounts)
        ? snapshot.telemetry.artifactCounts.slice(0, 80)
        : [],
      allSchedulerProgress: compactSchedulerProgressEvents(
        snapshot.telemetry?.allSchedulerProgress,
        120,
      ),
    },
    packetFailureDiagnostics: snapshot.packetFailureDiagnostics
      ? {
          diagnosticPacketCount: snapshot.packetFailureDiagnostics.diagnosticPacketCount ?? null,
          concerningPacketCount: snapshot.packetFailureDiagnostics.concerningPacketCount ?? null,
          incompletePacketCount: snapshot.packetFailureDiagnostics.incompletePacketCount ?? null,
          retryPacketCount: snapshot.packetFailureDiagnostics.retryPacketCount ?? null,
          fallbackPacketCount: snapshot.packetFailureDiagnostics.fallbackPacketCount ?? null,
          providerErrorPacketCount:
            snapshot.packetFailureDiagnostics.providerErrorPacketCount ?? null,
          longLatencyPacketCount: snapshot.packetFailureDiagnostics.longLatencyPacketCount ?? null,
          toFixItems: Array.isArray(snapshot.packetFailureDiagnostics.toFixItems)
            ? snapshot.packetFailureDiagnostics.toFixItems.slice(0, 20)
            : [],
        }
      : null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  };
}

function graphSummary(snapshot) {
  if (!snapshot) {
    return null;
  }
  return {
    graphId: snapshot.graph.graphId,
    workflowId: snapshot.graph.workflowId,
    status: snapshot.graph.graphStatus,
    nodeCount: snapshot.nodes.length,
    edgeCount: snapshot.edges.length,
    roleInvocationCount: snapshot.roleInvocations.length,
    nodeKinds: [...new Set(snapshot.nodes.map((node) => node.nodeKind))].toSorted((a, b) =>
      a.localeCompare(b),
    ),
    activeNodes: snapshot.nodes
      .filter((node) => node.nodeStatus === "running" || node.nodeStatus === "waiting_for_human")
      .map((node) => ({
        nodeId: node.nodeId,
        nodeKind: node.nodeKind,
        assignedRole: node.assignedRole,
        modelOrWorkerRef: node.modelOrWorkerRef,
        objective:
          node.metadata && typeof node.metadata === "object"
            ? String(node.metadata.exactObjective ?? node.metadata.objective ?? "").slice(0, 500)
            : null,
      }))
      .slice(0, 12),
    edges: snapshot.edges
      .map((edge) => ({
        edgeId: edge.edgeId,
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
        edgeKind: edge.edgeKind,
      }))
      .slice(0, 40),
  };
}

function latestSchedulerProgressForStage(progress, stage) {
  return progress
    .filter((event) => event.stage === stage)
    .toReversed()
    .at(0);
}

function latestSchedulerToolEvent(progress, schedulerToolId) {
  return progress
    .filter((event) => event.schedulerToolId === schedulerToolId)
    .toReversed()
    .at(0);
}

function schedulerToolCompleted(progress, schedulerToolId) {
  const event = latestSchedulerToolEvent(progress, schedulerToolId);
  return event?.status === "succeeded" || event?.status === "completed";
}

function graphPersistenceStatus(progress) {
  return (
    latestSchedulerProgressForStage(progress, "scheduler_graph_node_persistence")?.status ?? null
  );
}

function graphPersistenceInProgress(progress) {
  return graphPersistenceStatus(progress) === "started";
}

function schedulerDecisionModelCallInProgress(progress) {
  const latestSchedulerDecisionCall = progress
    .filter((event) => event.stage === "scheduler_orchestrator_model_call")
    .toReversed()
    .at(0);
  if (!latestSchedulerDecisionCall) {
    return false;
  }
  if (
    latestSchedulerDecisionCall.status === "failed" ||
    latestSchedulerDecisionCall.status === "completed" ||
    latestSchedulerDecisionCall.currentPhase === "model_call_completed" ||
    latestSchedulerDecisionCall.currentPhase === "model_call_failed"
  ) {
    return false;
  }
  return (
    latestSchedulerDecisionCall.status === "started" &&
    (latestSchedulerDecisionCall.currentPhase === "model_call_started" ||
      latestSchedulerDecisionCall.currentPhase === "model_call_heartbeat")
  );
}

function schedulerDecisionOrGraphApplicationInProgress(progress) {
  const latestProgress = progress.toReversed().at(0);
  if (!latestProgress) {
    return false;
  }
  if (schedulerDecisionModelCallInProgress(progress)) {
    return true;
  }
  if (
    latestProgress.stage === "scheduler_orchestrator_model_call" &&
    latestProgress.currentPhase === "model_call_completed"
  ) {
    return true;
  }
  if (
    latestProgress.stage === "scheduler_expansion_admission" ||
    latestProgress.currentPhase === "expansion_admission_evaluated"
  ) {
    return true;
  }
  if (
    latestProgress.stage === "scheduler_graph_node_persistence" ||
    latestProgress.currentPhase === "graph_node_persistence_starting" ||
    latestProgress.currentPhase === "graph_node_write_started"
  ) {
    return true;
  }
  return false;
}

const CANONICAL_LIFECYCLE_GATE_KINDS = new Set([
  "work_intent_compile",
  "resource_requirement_compile",
  "resource_narrowing_required",
  "resource_scope_revision_required",
  "resource_scope_revision_blocked",
  "resource_ledger_ready",
  "resource_repair",
  "domain_resource_selection_required",
  "domain_resource_selection_blocked",
  "resource_materialization",
  "domain_action_gate_blocked",
  "worker_action_ready",
  "worker_execution",
  "post_action_validation",
  "evidence_closure",
  "review_validation",
  "closeout",
  "frontier_execution",
]);

const CANONICAL_TERMINAL_FAILURE_GATE_KINDS = new Set([
  "graph_compile_invalid",
  "terminal_failed",
  "terminal_needs_review",
]);

function canonicalProjectionLooksActionable(projection) {
  const gate = projection?.gate;
  if (!gate) {
    return false;
  }
  if (gate.gateKind !== "missing_runtime_state" || gate.sourceKind !== "missing") {
    return true;
  }
  return (
    Array.isArray(gate.reasonCodes) &&
    gate.reasonCodes.some((reasonCode) =>
      [
        "context_",
        "target_",
        "resource_",
        "write_",
        "worker_",
        "evidence_",
        "frontier_",
        "no_progress",
      ].some((prefix) => String(reasonCode).startsWith(prefix)),
    )
  );
}

function latestCanonicalProofGateProjection({ graphId, schedulerProgress, topologyGate }) {
  const latestProgress = schedulerProgress.at(-1) ?? {};
  const fallback = projectProofHarnessCanonicalGate({
    graphId,
    latestProgress,
    topologyGate,
  });
  if (fallback.topologyGateRejected || fallback.staleCheckpointGateRejected) {
    return fallback;
  }
  const candidates = schedulerProgress.toReversed().slice(0, 80);
  for (const progress of candidates) {
    const projection = projectProofHarnessCanonicalGate({
      graphId,
      latestProgress: progress,
      topologyGate,
    });
    if (canonicalProjectionLooksActionable(projection)) {
      return projection;
    }
  }
  return fallback;
}

function canonicalGateIsTerminalStop(projection) {
  const gate = projection?.gate;
  if (!gate) {
    return false;
  }
  if (CANONICAL_TERMINAL_FAILURE_GATE_KINDS.has(gate.gateKind)) {
    return true;
  }
  if (gate.sourceKind === "frontier_root_cause" || gate.sourceKind === "no_progress_signature") {
    return true;
  }
  return (
    Boolean(gate.blockerCode) &&
    !gate.nextLegalTransition &&
    !CANONICAL_LIFECYCLE_GATE_KINDS.has(gate.gateKind)
  );
}

function canonicalExecutionGateStatus(projection) {
  const gate = projection.gate;
  if (gate.gateStatus === "terminal") {
    return gate.gateKind === "terminal_succeeded" ? "passed" : "failed";
  }
  if (gate.gateStatus === "ready") {
    return "review_available_nonblocking";
  }
  if (gate.gateStatus === "running" || gate.gateStatus === "missing") {
    return "waiting";
  }
  if (canonicalGateIsTerminalStop(projection)) {
    return "failed";
  }
  if (CANONICAL_LIFECYCLE_GATE_KINDS.has(gate.gateKind)) {
    return "waiting";
  }
  return "failed";
}

function isWorkIntentDemandContextExpansionInProgress({ graph, schedulerProgress }) {
  if (!graph || graph.edgeCount !== 0 || !graph.nodeKinds.includes("work_intent")) {
    return false;
  }
  const acceptedWorkIntentRoots =
    schedulerToolCompleted(schedulerProgress, "scheduler.work_intent.accept_roots") ||
    schedulerProgress.some(
      (event) =>
        event.schedulerToolId === "scheduler.work_intent.accept_roots" &&
        (event.status === "succeeded" || event.status === "completed"),
    );
  if (!acceptedWorkIntentRoots) {
    return false;
  }
  const resourceRequirementsCompiled =
    schedulerToolCompleted(
      schedulerProgress,
      "scheduler.compile_resource_requirements_for_work_intents",
    ) ||
    schedulerProgress.some(
      (event) =>
        event.schedulerToolId === "scheduler.compile_resource_requirements_for_work_intents" &&
        (event.status === "succeeded" || event.status === "completed"),
    );
  const contextDispatchStarted =
    graph.nodeKinds.includes("resource_scout") ||
    schedulerProgress.some(
      (event) =>
        event.stage === "resource_broker" &&
        event.currentPhase === "resource_demand_specialist_subturn",
    );
  const postResourceLifecycleStarted = schedulerProgress.some((event) =>
    [
      "scheduler.resolve_work_intent_resource_requirements",
      "scheduler.accept_resources_for_work_intent",
      "scheduler.mark_read_only_work_intent_satisfied_from_resources",
      "scheduler.promote_resource_satisfied_work_intent_to_executable",
      "scheduler.request_resource_requirement_for_work_intent",
    ].includes(event.schedulerToolId),
  );
  return (
    resourceRequirementsCompiled ||
    contextDispatchStarted ||
    postResourceLifecycleStarted ||
    graph.nodeKinds.every((nodeKind) => nodeKind === "work_intent")
  );
}

function legacyArchitectureTransitionTopologyFailure({
  graph,
  schedulerProgress,
}) {
  return evaluateArchitectureTransitionTopologyGate({
    graph,
    schedulerProgress,
  });
}

function evaluateSchedulerGraphGate({ graph, resourceSpecialist, schedulerProgress }) {
  const persistenceStatus = graphPersistenceStatus(schedulerProgress);
  const graphPersistenceInProgress = persistenceStatus === "started";
  const graphPersistenceFailed = persistenceStatus === "failed";
  if (!graph || graph.nodeCount === 0) {
    return graphPersistenceInProgress ? "waiting" : graphPersistenceFailed ? "failed" : "waiting";
  }
  if (graphPersistenceInProgress) {
    return "waiting";
  }
  if (graphPersistenceFailed) {
    return "failed";
  }
  if (graph.edgeCount > 0) {
    return "review_available_nonblocking";
  }
  if (isWorkIntentDemandContextExpansionInProgress({ graph, schedulerProgress })) {
    return "waiting";
  }
  return "failed";
}

function gateStatusIsAcceptedForProgress(status) {
  return ["passed", "accepted_with_limitations", "review_available_nonblocking"].includes(status);
}

function evaluateCheckpoints({ submit, artifacts, snapshot }) {
  const sourcePrompt = summarizeSourcePromptIndex(
    latestArtifact(artifacts, "execution_platform.source_prompt_context_index"),
  );
  const mission = summarizeMissionLedger(
    latestArtifact(artifacts, "execution_platform.mission_contract_ledger"),
  );
  const obligationGraph = summarizeObligationGraph(
    latestArtifact(artifacts, "execution_platform.obligation_graph"),
  );
  const resourceSpecialist = summarizeResourceSpecialist(
    latestArtifact(artifacts, "execution_platform.resource_specialist_tool_loop"),
  );
  const schedulerProgress = summarizeSchedulerProgress(artifacts);
  const graph = graphSummary(snapshot);
  const legacyTopologyFailure = legacyArchitectureTransitionTopologyFailure({
    graph,
    schedulerProgress,
  });
  const canonicalProofGate = latestCanonicalProofGateProjection({
    graphId: graph?.graphId ?? null,
    schedulerProgress,
    topologyGate: legacyTopologyFailure,
  });
  const hardFailures = [];
  const needsReview = [];

  const payloadGate = {
    gateId: "payload_router",
    status:
      submit.accepted && submit.runtimeJobId && submit.workflowId === "agent_team.coding"
        ? "passed"
        : "failed",
    evidence: {
      accepted: submit.accepted,
      runtimeJobId: submit.runtimeJobId,
      workflowId: submit.workflowId,
      jobType: submit.jobType,
      reasonCodes: submit.reasonCodes,
    },
  };
  if (payloadGate.status === "failed") {
    hardFailures.push("payload_router_failed");
  }

  const sourcePromptGate = {
    gateId: "source_prompt_context",
    status: !sourcePrompt
      ? "waiting"
      : sourcePrompt.resolutionStatus === "resolved"
        ? "passed"
        : "failed",
    evidence: sourcePrompt,
  };
  if (sourcePromptGate.status === "failed") {
    hardFailures.push("source_prompt_context_unresolved");
  }

  const missionGate = {
    gateId: "mission_ledger",
    status: !mission
      ? "waiting"
      : mission.missionGate === "clear_to_execute" && mission.blockingCommitmentCount > 0
        ? "review_available_nonblocking"
        : "failed",
    evidence: mission,
  };
  if (missionGate.status === "failed") {
    hardFailures.push("mission_ledger_invalid");
  }
  if (missionGate.status === "review_available_nonblocking") {
    needsReview.push("mission_ledger_review_available_nonblocking");
  }

  const obligationGraphGate = {
    gateId: "obligation_graph",
    status: !obligationGraph
      ? "waiting"
      : (obligationGraph.obligationCount ?? 0) >= 1 &&
          (obligationGraph.executableCount ?? 0) >= 1
        ? "review_available_nonblocking"
        : "failed",
    evidence: obligationGraph,
  };
  if (obligationGraphGate.status === "failed") {
    hardFailures.push("obligation_graph_invalid");
  }
  if (obligationGraphGate.status === "review_available_nonblocking") {
    needsReview.push("obligation_graph_review_available_nonblocking");
  }

  const graphGateStatus = legacyTopologyFailure.failed
    ? "failed"
    : evaluateSchedulerGraphGate({ graph, resourceSpecialist, schedulerProgress });
  const graphGate = {
    gateId: legacyTopologyFailure.failed
      ? "architecture_transition_topology_invalid"
      : graphGateStatus === "failed"
        ? "graph_compile_invalid"
        : "scheduler_graph",
    status: graphGateStatus,
    evidence: legacyTopologyFailure.failed
      ? {
          graph,
          architectureTransitionTopology: legacyTopologyFailure,
          rawPromptStored: false,
          rawResponseStored: false,
        }
      : graph,
  };
  if (graphGate.status === "failed") {
    hardFailures.push("scheduler_graph_missing_edges_or_nodes");
  }
  if (graphGate.status === "review_available_nonblocking") {
    needsReview.push("scheduler_graph_review_available_nonblocking");
  }

  const schedulerDecisionOrGraphApplicationActive =
    schedulerDecisionOrGraphApplicationInProgress(schedulerProgress);
  const canonicalGateIsBlockedOnlyBecauseSchedulerDecisionIsRunning =
    schedulerDecisionOrGraphApplicationActive &&
    canonicalProofGate.gate.gateKind === "missing_runtime_state" &&
    canonicalProofGate.gate.sourceKind === "scheduler_frontier";
  const canonicalGateIsWaitingForSchedulerGraphProgress =
    graphGate.status === "waiting" &&
    canonicalProofGate.gate.gateKind === "missing_runtime_state" &&
    canonicalProofGate.gate.sourceKind === "scheduler_frontier" &&
    typeof canonicalProofGate.gate.nextLegalTransition === "string" &&
    canonicalProofGate.gate.nextLegalTransition.length > 0;
  const canonicalExecutionGate = {
    gateId: canonicalProofGate.firstOpenGate,
    status:
      canonicalProofGate.gate.gateKind === "missing_runtime_state" ||
      canonicalGateIsBlockedOnlyBecauseSchedulerDecisionIsRunning ||
      canonicalGateIsWaitingForSchedulerGraphProgress
      ? "waiting"
      : canonicalExecutionGateStatus(canonicalProofGate),
    evidence: canonicalProofGate,
  };
  if (canonicalProofGate.topologyGateRejected) {
    hardFailures.push("architecture_transition_topology_invalid");
  }
  if (canonicalProofGate.staleCheckpointGateRejected) {
    hardFailures.push("stale_checkpoint_gate_rejected");
  }
  const canonicalGateBlockedDuringGraphPersistence =
    canonicalExecutionGate.status === "failed" &&
    graphGate.status === "waiting" &&
    graphPersistenceInProgress(schedulerProgress);
  const canonicalGateIsLifecycleProgress =
    canonicalExecutionGate.status === "waiting" &&
    CANONICAL_LIFECYCLE_GATE_KINDS.has(canonicalProofGate.gate.gateKind);
  if (
    canonicalExecutionGate.status === "failed" &&
    !canonicalGateBlockedDuringGraphPersistence &&
    !canonicalGateIsLifecycleProgress &&
    !canonicalGateIsBlockedOnlyBecauseSchedulerDecisionIsRunning &&
    !canonicalGateIsWaitingForSchedulerGraphProgress &&
    canonicalProofGate.gate.gateKind !== "missing_runtime_state" &&
    !["terminal_failed", "terminal_needs_review"].includes(canonicalProofGate.gate.gateKind)
  ) {
    hardFailures.push(`canonical_gate_blocked:${canonicalProofGate.gate.gateKind}`);
  }

  const closeoutArtifact =
    latestArtifact(artifacts, "execution_platform.closeout_capsule") ??
    latestArtifact(artifacts, "agent_team.closeout_capsule") ??
    latestArtifact(artifacts, "execution.closeout_finalization_handoff") ??
    latestArtifact(artifacts, "execution.closeout_finalization_evidence_packet");
  const closeoutGate = {
    gateId: "closeout_readback",
    status: closeoutArtifact ? "review_available_nonblocking" : "waiting",
    evidence: closeoutArtifact
      ? {
          artifactRef: closeoutArtifact.uri,
          artifactType: closeoutArtifact.artifactType,
        }
      : null,
  };

  return {
    gates: [
      payloadGate,
      sourcePromptGate,
      missionGate,
      obligationGraphGate,
      graphGate,
      canonicalExecutionGate,
      closeoutGate,
    ],
    hardFailures: [...new Set(hardFailures)],
    needsReview: [...new Set(needsReview)],
    shouldStop: hardFailures.length > 0,
    firstOpenGate:
      [payloadGate, sourcePromptGate, missionGate, obligationGraphGate].find(
        (gate) => !gateStatusIsAcceptedForProgress(gate.status),
      )?.gateId ??
      (canonicalProofGate.gate.gateKind === "terminal_succeeded"
        ? closeoutGate.status === "waiting"
          ? closeoutGate.gateId
          : null
        : canonicalProofGate.firstOpenGate),
    canonicalProofGate,
    sourcePrompt,
    mission,
    resourceSpecialist,
    graph,
    schedulerProgress,
  };
}

async function collectSnapshot(runtime, submit) {
  const generatedAt = new Date().toISOString();
  const job = submit.runtimeJobId ? await runtime.runtimeJobs.getJob(submit.runtimeJobId) : null;
  const artifacts = submit.runtimeJobId
    ? await runtime.runtimeJobs.listArtifacts(submit.runtimeJobId)
    : [];
  const graphId =
    artifacts
      .map((artifact) => {
        const metadata = metadataOf(artifact);
        return typeof metadata.graphId === "string" ? metadata.graphId : null;
      })
      .find(Boolean) ?? null;
  const snapshot = graphId ? await runtime.runtimeWorkGraphs.readGraphSnapshot(graphId) : null;
  const checkpoints = evaluateCheckpoints({ submit, artifacts, snapshot });
  return {
    generatedAt,
    runtimeJobId: submit.runtimeJobId,
    workItemId: submit.workItemId,
    job: job
      ? {
          jobId: job.jobId,
          state: job.state,
          attempts: job.attempts,
          workerId: job.workerId,
          startedAt: job.startedAt?.toISOString() ?? null,
          completedAt: job.completedAt?.toISOString() ?? null,
        }
      : null,
    artifactCounts: artifactCounts(artifacts),
    checkpoints,
    telemetry: {
      schedulerProgressEventCount: artifacts.filter(
        (artifact) => artifact.artifactType === "agent_team.scheduler_progress",
      ).length,
      allSchedulerProgress: summarizeAllSchedulerProgressForTelemetry(artifacts),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function progressLine(snapshot) {
  const latest = snapshot.checkpoints.schedulerProgress.at(-1) ?? null;
  return {
    event: "product_spec_checkpoint_progress",
    at: snapshot.generatedAt,
    runtimeJobId: snapshot.runtimeJobId,
    jobState: snapshot.job?.state ?? null,
    firstOpenGate: snapshot.checkpoints.firstOpenGate,
    canonicalFirstOpenGate:
      snapshot.checkpoints.canonicalProofGate?.gate?.gateKind ?? snapshot.checkpoints.firstOpenGate,
    canonicalGateStatus: snapshot.checkpoints.canonicalProofGate?.gate?.gateStatus ?? null,
    canonicalGateReasonCodes: snapshot.checkpoints.canonicalProofGate?.reasonCodes ?? [],
    hardFailures: snapshot.checkpoints.hardFailures,
    needsReview: snapshot.checkpoints.needsReview,
    graphStatus: snapshot.checkpoints.graph?.status ?? null,
    nodeCount: snapshot.checkpoints.graph?.nodeCount ?? 0,
    edgeCount: snapshot.checkpoints.graph?.edgeCount ?? 0,
    latestStage: latest?.stage ?? null,
    latestPhase: latest?.currentPhase ?? latest?.schedulerPhase ?? null,
    latestObjective: latest?.objective ?? null,
    latestEli5: latest?.eli5Progress ?? null,
  };
}

async function writeLatestRunStateForSnapshot({
  snapshot,
  promptHash,
  promptLength,
  sourcePromptRef = null,
  startedAt,
  processRunning,
  terminalStatus = null,
  adapterTerminalStatus = null,
  retryState = null,
  recommendedOperatorAction = null,
}) {
  const latest = snapshot.checkpoints.schedulerProgress.at(-1) ?? null;
  const modelUsage = summarizeModelTokenBurn(snapshot);
  const state = buildLatestRunState({
    runtimeJobId: snapshot.runtimeJobId,
    workItemId: snapshot.workItemId,
    promptHash,
    promptRef:
      sourcePromptRef && typeof sourcePromptRef === "object"
        ? sourcePromptRef.refKind === "native_submit"
          ? `native-submit://${sourcePromptRef.runId ?? promptHash}`
          : null
        : null,
    promptLength,
    processRunning,
    terminalStatus,
    adapterTerminalStatus,
    retryState,
    runtimeJob: snapshot.job,
    graphId: snapshot.checkpoints.graph?.graphId ?? null,
    latestProgress: latest,
    latestReasonCodes: latest?.reasonCodes ?? [],
    latestArtifactRefs: latest?.artifactRefs ?? latest?.evidenceProducedRefs ?? [],
    totalWallMs: Date.now() - startedAt,
    phaseWallClock: summarizePhaseWallClock(snapshot),
    modelUsageByModel: modelUsage.byModel,
    missingUsageEventCount: modelUsage.missingUsageEventCount,
    usageUnavailableReasons: modelUsage.byModel.flatMap((entry) =>
      Array.isArray(entry.usageUnavailableReasons)
        ? entry.usageUnavailableReasons.map((reason) => ({
            modelRef: entry.modelRef,
            ...reason,
          }))
        : [],
    ),
    recommendedOperatorAction:
      recommendedOperatorAction ??
      (snapshot.checkpoints.hardFailures.length > 0
        ? `Stop and repair: ${snapshot.checkpoints.hardFailures.join(", ")}.`
        : snapshot.checkpoints.firstOpenGate
          ? `Continue monitoring; first open gate is ${snapshot.checkpoints.firstOpenGate}.`
          : "Continue monitoring until terminal closeout or needs_review."),
  });
  const latestRunStateManifestBounds = assertProofHarnessManifestBounds({
    name: "latest-run-state",
    value: state,
    maxBytes: 96_000,
  });
  await writeJson(
    "product-spec-proof-harness-manifest-bounds-latest-run-state.json",
    latestRunStateManifestBounds,
  );
  await writeJson("latest-run-state.json", state);
  if (snapshot.runtimeJobId) {
    await writeJson(`latest-run-state-${snapshot.runtimeJobId}.json`, state);
  }
  return state;
}

async function main() {
  await loadRuntimeModules();
  const runtimeJobFlagIndex = process.argv.indexOf("--runtime-job-id");
  const runtimeJobIdArg =
    runtimeJobFlagIndex >= 0 ? process.argv[runtimeJobFlagIndex + 1]?.trim() : null;
  if (runtimeJobFlagIndex >= 0 && !runtimeJobIdArg) {
    throw new Error("runtime_job_id_flag_missing_value");
  }
  const cloneRuntimeJobFlagIndex = process.argv.indexOf("--clone-runtime-job-id");
  const cloneRuntimeJobIdArg =
    cloneRuntimeJobFlagIndex >= 0 ? process.argv[cloneRuntimeJobFlagIndex + 1]?.trim() : null;
  const fromMissionLedger = process.argv.includes("--from-mission-ledger");
  const fromObligationGraph = process.argv.includes("--from-obligation-graph");
  const replayBoundary = fromObligationGraph
    ? "obligation_graph"
    : fromMissionLedger
      ? "mission_ledger"
      : "fresh_graph_replay_from_original_prompt_and_prior_failure_evidence";
  if (cloneRuntimeJobFlagIndex >= 0 && !cloneRuntimeJobIdArg) {
    throw new Error("clone_runtime_job_id_flag_missing_value");
  }
  if (runtimeJobIdArg && cloneRuntimeJobIdArg) {
    throw new Error("runtime_job_id_and_clone_runtime_job_id_are_mutually_exclusive");
  }
  const promptFileFlagIndex = process.argv.indexOf("--prompt-file");
  const promptFileArg =
    promptFileFlagIndex >= 0
      ? process.argv[promptFileFlagIndex + 1]
      : positionalArgs(process.argv)[0];
  if (promptFileFlagIndex >= 0 && !promptFileArg) {
    throw new Error("prompt_file_flag_missing_value");
  }
  const promptFile = promptFileArg ?? DEFAULT_PROMPT_FILE;
  if (!(await fileExists(promptFile))) {
    throw new Error(`canonical_product_spec_prompt_missing:${promptFile}`);
  }
  await loadEnvFile(".env");
  await loadEnvFile(".env.execution-platform-staging");
  const promptReadStartedAt = Date.now();
  const prompt = await fs.readFile(promptFile, "utf8");
  const promptFileReadElapsedMs = Date.now() - promptReadStartedAt;
  const promptHash = sha256(prompt);
  const preflight = {
    artifactKind: "product_spec_checkpointed_test_preflight",
    generatedAt: new Date().toISOString(),
    promptFileHash: sha256(promptFile),
    promptHash,
    promptLength: prompt.length,
    promptFileReadElapsedMs,
    checkpointFrameworkRef:
      "docs/projects/execution-platform/specs/product-spec-checkpointed-proof-framework.md",
    maxRuntimeMs: MAX_RUNTIME_MS,
    progressIntervalMs: PROGRESS_INTERVAL_MS,
    submitTimeoutMs: SUBMIT_TIMEOUT_MS,
    rawPromptStored: false,
    rawResponseStored: false,
  };
  await writeJson("product-spec-checkpointed-test-preflight.json", preflight);

  const configLoadStartedAt = Date.now();
  const liteConfig = readExecutionPlatformDatabaseConfigLite();
  const config = liteConfig ?? loadConfig();
  const configLoadElapsedMs = Date.now() - configLoadStartedAt;
  await writeJson("product-spec-checkpointed-test-runtime-config.json", {
    artifactKind: "product_spec_checkpointed_test_runtime_config",
    generatedAt: new Date().toISOString(),
    configLoadMode: liteConfig ? "execution_platform_database_lite" : "full_openclaw_config",
    configLoadElapsedMs,
    rawConfigStored: false,
    secretsStored: false,
  });
  const runtimeInitStartedAt = Date.now();
  const runtime = await getExecutionPlatformRuntime(config);
  const runtimeInitElapsedMs = Date.now() - runtimeInitStartedAt;
  const existingJob = runtimeJobIdArg ? await runtime.runtimeJobs.getJob(runtimeJobIdArg) : null;
  if (runtimeJobIdArg && !existingJob) {
    throw new Error(`runtime_job_not_found:${runtimeJobIdArg}`);
  }
  const cloneSourceJob = cloneRuntimeJobIdArg
    ? await runtime.runtimeJobs.getJob(cloneRuntimeJobIdArg)
    : null;
  if (cloneRuntimeJobIdArg && !cloneSourceJob) {
    throw new Error(`clone_runtime_job_not_found:${cloneRuntimeJobIdArg}`);
  }
  const cloneSourceArtifacts = cloneSourceJob
    ? await runtime.runtimeJobs.listArtifacts(cloneSourceJob.jobId)
    : [];
  const cloneGraphId =
    cloneSourceArtifacts
      .map((artifact) => {
        const metadata = metadataOf(artifact);
        return typeof metadata.graphId === "string" ? metadata.graphId : null;
      })
      .find(Boolean) ?? null;
  const cloneTeamRunId = cloneSourceJob
    ? `team-run-${cloneSourceJob.jobId}-checkpoint-replay-${Date.now().toString(36)}`
    : null;
  const sourceRunId = `product-spec-checkpointed-${Date.now()}`;
  const sourcePromptDir = "/root/.openclaw/agents/main/sessions";
  const sourcePromptFile = path.join(sourcePromptDir, `${sourceRunId}.prompt.txt`);
  const sourcePromptWriteStartedAt = Date.now();
  if (!existingJob) {
    await fs.mkdir(sourcePromptDir, { recursive: true });
    await fs.writeFile(sourcePromptFile, prompt, "utf8");
  }
  const sourcePromptWriteElapsedMs = Date.now() - sourcePromptWriteStartedAt;
  const sourcePromptRef = {
    refKind: "native_submit",
    promptHash,
    promptLength: prompt.length,
    sessionKey: "agent:main:main",
    sessionId: "agent:main:main",
    runId: sourceRunId,
    sourceRoute: "ux",
    rawPromptStored: false,
  };
  let submit = null;
  if (existingJob) {
    submit = {
      accepted: true,
      ok: true,
      status: 200,
      runtimeJobId: existingJob.jobId,
      workItemId: existingJob.workItemId,
      workflowId:
        typeof existingJob.payload.workflowId === "string"
          ? existingJob.payload.workflowId
          : "agent_team.coding",
      jobType: existingJob.jobType,
      reasonCodes: ["product_spec_checkpoint_replay_existing_runtime_job"],
      rawResponseStored: false,
    };
  } else if (cloneSourceJob) {
    const sourcePayload =
      cloneSourceJob.payload &&
      typeof cloneSourceJob.payload === "object" &&
      !Array.isArray(cloneSourceJob.payload)
        ? cloneSourceJob.payload
        : {};
    const clonedJob = await runtime.runtimeJobs.enqueueJob({
      jobId: `product-spec-replay-${Date.now().toString(36)}`,
      jobType: cloneSourceJob.jobType,
      queueName: cloneSourceJob.queueName,
      priority: Math.max(cloneSourceJob.priority, 0),
      payload: {
        ...sourcePayload,
        teamRunId: cloneTeamRunId,
        sourcePromptRef,
        checkpointReplay: {
          sourceRuntimeJobId: cloneSourceJob.jobId,
          sourceGraphId: cloneGraphId,
          replayBoundary,
          rawPromptStored: false,
          rawResponseStored: false,
        },
        rawPromptStored: false,
        rawResponseStored: false,
      },
      idempotencyScope: "product-spec-checkpoint-replay",
      idempotencyKey: `${cloneSourceJob.jobId}:${promptHash}:${Date.now()}`,
      parentJobId: cloneSourceJob.jobId,
      parentWorkflowId:
        typeof sourcePayload.workflowId === "string" ? sourcePayload.workflowId : null,
      workItemId: cloneSourceJob.workItemId,
      maxAttempts: 1,
      leaseTimeoutMs: cloneSourceJob.leaseTimeoutMs,
      runTimeoutMs: cloneSourceJob.runTimeoutMs,
    });
    submit = {
      accepted: true,
      ok: true,
      status: 200,
      runtimeJobId: clonedJob.jobId,
      workItemId: clonedJob.workItemId,
      workflowId:
        typeof clonedJob.payload.workflowId === "string"
          ? clonedJob.payload.workflowId
          : "agent_team.coding",
      jobType: clonedJob.jobType,
      reasonCodes: ["product_spec_checkpoint_clone_runtime_job_enqueued"],
      rawResponseStored: false,
    };
    await writeJson("product-spec-checkpointed-test-replay-clone.json", {
      artifactKind: "product_spec_checkpointed_test_replay_clone",
      generatedAt: new Date().toISOString(),
      sourceRuntimeJobId: cloneSourceJob.jobId,
      clonedRuntimeJobId: clonedJob.jobId,
      sourceGraphId: cloneGraphId,
      cloneTeamRunId,
      promptHash,
      promptLength: prompt.length,
      replayBoundary,
      note: "Clone mode creates a fresh pending runtime job and fresh teamRunId while preserving the source graph/job refs as bounded replay evidence. This avoids reusing terminal graph state while exercising the same worker path.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  } else {
    submit = await submitPrompt(prompt, promptHash, sourcePromptRef);
  }
  if (!existingJob && !cloneSourceJob && submit?.runtimeJobId) {
    await collectSubmitLatencyDiagnostics({
      runtime,
      submit,
      timing: {
        promptHash,
        promptLength: prompt.length,
        promptFileReadElapsedMs,
        sourcePromptWriteElapsedMs,
        configLoadElapsedMs,
        runtimeInitElapsedMs,
      },
    });
  }
  let runResult = null;
  let runError = null;
  let stoppedEarly = false;
  let workerDrainTimedOut = false;
  const startedAt = Date.now();

  if (!submit.accepted || !submit.runtimeJobId) {
    const summary = {
      artifactKind: "product_spec_checkpointed_test_summary",
      status: "submit_failed",
      promptHash,
      promptLength: prompt.length,
      submit,
      rawPromptStored: false,
      rawResponseStored: false,
    };
    await writeJson("product-spec-checkpointed-test-summary.json", summary);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    process.exitCode = 1;
    if (!existingJob) {
      await fs.rm(sourcePromptFile, { force: true });
    }
    return;
  }
  if (existingJob) {
    const beforeReplaySnapshot = await collectSnapshot(runtime, submit);
    await writeJson("product-spec-checkpointed-test-replay-start.json", {
      artifactKind: "product_spec_checkpointed_test_replay_start",
      generatedAt: new Date().toISOString(),
      runtimeJobId: existingJob.jobId,
      jobState: existingJob.state,
      workItemId: existingJob.workItemId,
      promptHash,
      promptLength: prompt.length,
      checkpointReplayBoundary:
        "existing_runtime_job_after_graph_creation_or_resource_scout_boundary",
      graph: beforeReplaySnapshot.checkpoints.graph,
      latestProgress: beforeReplaySnapshot.checkpoints.schedulerProgress.at(-1) ?? null,
      note: "Replay reuses persisted runtime job/graph state and runs the same gateway worker path. It does not resubmit the prompt or rerun router front-door work.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
    if (existingJob.state === "running") {
      await runtime.runtimeJobs.recoverExpiredLeases();
    }
  }

  const runPromise = runGatewayAgentTeamRuntimeJobOnce({
    runtimeJobs: runtime.runtimeJobs,
    runtimeWorkGraphs: runtime.runtimeWorkGraphs,
    runtimeToolKernel: runtime.runtimeToolKernel,
    workQueue: runtime.workQueue,
    runtimeJobId: submit.runtimeJobId,
    workerId: "product-spec-checkpointed-test-worker",
    queueName: "agent-team",
  })
    .then((result) => {
      runResult = result;
    })
    .catch((error) => {
      runError = error;
    });

  for (;;) {
    await sleep(PROGRESS_INTERVAL_MS);
    const snapshot = await collectSnapshot(runtime, submit);
    await writeJson("product-spec-checkpointed-test-latest.json", {
      artifactKind: "product_spec_checkpointed_test_latest",
      ...snapshot,
    });
    await writeLatestRunStateForSnapshot({
      snapshot,
      promptHash,
      promptLength: prompt.length,
      sourcePromptRef,
      startedAt,
      processRunning: !runResult && !runError,
    });
    process.stdout.write(`${JSON.stringify(progressLine(snapshot))}\n`);
    if (STOP_AFTER_GATE) {
      const targetGate = snapshot.checkpoints.gates.find((gate) => gate.gateId === STOP_AFTER_GATE);
      if (targetGate && gateStatusIsAcceptedForProgress(targetGate.status)) {
        stoppedEarly = true;
        await runtime.runtimeJobs.cancelJob(
          submit.runtimeJobId,
          `checkpoint_stop:stop_after_gate:${STOP_AFTER_GATE}`,
        );
        break;
      }
    }
    if (snapshot.checkpoints.shouldStop) {
      stoppedEarly = true;
      await runtime.runtimeJobs.cancelJob(
        submit.runtimeJobId,
        `checkpoint_stop:${snapshot.checkpoints.hardFailures.join(",")}`,
      );
      break;
    }
    if (runResult || runError) {
      break;
    }
    if (Date.now() - startedAt > MAX_RUNTIME_MS) {
      stoppedEarly = true;
      await runtime.runtimeJobs.cancelJob(submit.runtimeJobId, "checkpoint_stop:max_runtime_ms");
      break;
    }
  }

  if (stoppedEarly) {
    const drained = await Promise.race([
      runPromise.then(() => true).catch(() => true),
      sleep(30_000).then(() => false),
    ]);
    workerDrainTimedOut = !drained;
  } else {
    await runPromise;
  }

  const finalSnapshot = await collectSnapshot(runtime, submit);
  const status = stoppedEarly
    ? "stopped_at_checkpoint"
    : runError
      ? "runner_error"
      : runResult?.completed
        ? "completed_needs_quality_review"
        : "needs_review";
  await writeLatestRunStateForSnapshot({
    snapshot: finalSnapshot,
    promptHash,
    promptLength: prompt.length,
    sourcePromptRef,
    startedAt,
    processRunning: false,
    terminalStatus: status,
    adapterTerminalStatus:
      runResult && typeof runResult.status === "string"
        ? runResult.status
        : runResult?.completed
          ? "completed"
          : runError
            ? "runner_error"
            : "needs_review",
    retryState:
      finalSnapshot.job?.state === "pending" && status !== "completed_needs_quality_review"
        ? "retry_scheduled_or_terminal_needs_review_pending"
        : null,
    recommendedOperatorAction:
      status === "completed_needs_quality_review"
        ? "Review source-grounded evidence before closure."
        : "Inspect latest blocker and replay from the nearest accepted boundary after patching.",
  });
  const packetFailureDiagnostics = finalSnapshot.packetFailureDiagnostics ?? null;
  if (packetFailureDiagnostics) {
    await writeJson(
      "product-spec-obligation-graph-failure-diagnostics.json",
      packetFailureDiagnostics,
    );
    await writeJson("product-spec-proof-follow-up-fix-list.json", {
      artifactKind: "product_spec_proof_follow_up_fix_list",
      generatedAt: new Date().toISOString(),
      runtimeJobId: finalSnapshot.runtimeJobId,
      workItemId: finalSnapshot.workItemId,
      sourceDiagnosticArtifact:
        ".artifacts/execution-platform/product-spec-obligation-graph-failure-diagnostics.json",
      obligationGraphToFixItems: packetFailureDiagnostics.toFixItems,
      otherHardFailures: finalSnapshot.checkpoints.hardFailures,
      firstOpenGate: finalSnapshot.checkpoints.firstOpenGate,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  }
  const finalSnapshotArtifact = await writeJson(
    `product-spec-checkpointed-test-final-snapshot-${submit.runtimeJobId}.json`,
    {
      artifactKind: "product_spec_checkpointed_test_final_snapshot",
      generatedAt: new Date().toISOString(),
      runtimeJobId: finalSnapshot.runtimeJobId,
      workItemId: finalSnapshot.workItemId,
      snapshot: finalSnapshot,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
    },
  );
  const summary = {
    artifactKind: "product_spec_checkpointed_test_summary",
    schemaVersion: "execution-platform.product-spec-checkpointed-test-summary-manifest.v1",
    generatedAt: new Date().toISOString(),
    status,
    promptHash,
    promptLength: prompt.length,
    submit: {
      accepted: submit.accepted,
      runtimeJobId: submit.runtimeJobId,
      workItemId: submit.workItemId,
      workflowId: submit.workflowId,
      jobType: submit.jobType,
      reasonCodes: submit.reasonCodes,
      rawResponseStored: false,
    },
    runResult,
    workerDrainTimedOut,
    runError: runError
      ? {
          name: runError.name ?? "unknown_error",
          messageHash: sha256(runError.message ?? String(runError)),
        }
      : null,
    finalSnapshotRef: finalSnapshotArtifact.path,
    finalSnapshotHash: finalSnapshotArtifact.sha256,
    finalSnapshotBytes: finalSnapshotArtifact.bytes,
    finalSnapshotManifest: compactProofSnapshot(finalSnapshot),
    phaseWallClock: summarizePhaseWallClock(finalSnapshot),
    modelTokenBurnByModel: summarizeModelTokenBurn(finalSnapshot),
    obligationGraphFailureDiagnostics: packetFailureDiagnostics
      ? {
          diagnosticPacketCount: packetFailureDiagnostics.diagnosticPacketCount,
          concerningPacketCount: packetFailureDiagnostics.concerningPacketCount,
          incompletePacketCount: packetFailureDiagnostics.incompletePacketCount,
          retryPacketCount: packetFailureDiagnostics.retryPacketCount,
          fallbackPacketCount: packetFailureDiagnostics.fallbackPacketCount,
          providerErrorPacketCount: packetFailureDiagnostics.providerErrorPacketCount,
          longLatencyPacketCount: packetFailureDiagnostics.longLatencyPacketCount,
          toFixItems: packetFailureDiagnostics.toFixItems,
        }
      : null,
    proofWallClockMs: Date.now() - startedAt,
    stoppedEarly,
    modelCallsMade: true,
    gatewaySubmitPathUsed: true,
    codexCliInvokedManually: false,
    acpUsed: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  };
  const finalSummaryManifestBounds = assertProofHarnessManifestBounds({
    name: "product-spec-checkpointed-test-summary",
    value: summary,
    maxBytes: 256_000,
  });
  await writeJson(
    "product-spec-proof-harness-manifest-bounds-final-summary.json",
    finalSummaryManifestBounds,
  );
  await writeJson("product-spec-checkpointed-test-summary.json", summary);
  await writeJson("product-spec-checkpointed-test-artifact-index.json", {
    artifactKind: "product_spec_checkpointed_test_artifact_index",
    artifacts: [
      ".artifacts/execution-platform/product-spec-checkpointed-test-preflight.json",
      ".artifacts/execution-platform/product-spec-checkpointed-test-latest.json",
      finalSnapshotArtifact.path,
      ".artifacts/execution-platform/product-spec-checkpointed-test-summary.json",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
  });
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (status !== "completed_needs_quality_review") {
    process.exitCode = 1;
  }
  if (!existingJob) {
    await fs.rm(sourcePromptFile, { force: true });
  }
  if (workerDrainTimedOut) {
    process.exit(1);
  }
  process.exit(process.exitCode ?? 0);
}

await main().catch(async (error) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const summary = {
    artifactKind: "product_spec_checkpointed_test_summary",
    status: "script_failed",
    errorName: error?.name ?? "unknown_error",
    errorMessage: errorMessage.slice(0, 500),
    errorMessageHash: sha256(errorMessage),
    rawPromptStored: false,
    rawResponseStored: false,
  };
  await writeJson("product-spec-checkpointed-test-summary.json", summary);
  process.stderr.write(`${JSON.stringify(summary, null, 2)}\n`);
  process.exit(1);
});
