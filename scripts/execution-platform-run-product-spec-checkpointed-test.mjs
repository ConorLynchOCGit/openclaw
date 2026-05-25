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
let loadConfig;
let runGatewayAgentTeamRuntimeJobOnce;
let getExecutionPlatformRuntime;

async function loadRuntimeModules() {
  if (readExecutionPlatformDatabaseConfigLite) {
    return;
  }
  ({ readExecutionPlatformDatabaseConfigLite } =
    await import("../extensions/execution-platform/src/db/runtime.ts"));
  ({ buildLatestRunState } =
    await import("../extensions/execution-platform/src/observability/latest-run-state.ts"));
  ({ loadConfig } = await import("../src/config/config.ts"));
  ({ runGatewayAgentTeamRuntimeJobOnce } =
    await import("../src/gateway/execution-platform-agent-team-runner.ts"));
  ({ getExecutionPlatformRuntime } = await import("../src/gateway/execution-platform-http.ts"));
}

const ARTIFACT_DIR = ".artifacts/execution-platform";
const DEFAULT_PROMPT_FILE =
  "docs/projects/execution-platform/prompts/product-spec-planning-production-upgrade-openclaw.md";
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

function summarizeCommitmentPackets(packetArtifact, reviewArtifact) {
  if (!packetArtifact) {
    return null;
  }
  const metadata = metadataOf(packetArtifact);
  const manifest =
    metadata.commitmentWorkPacketManifest &&
    typeof metadata.commitmentWorkPacketManifest === "object"
      ? metadata.commitmentWorkPacketManifest
      : null;
  const packets = Array.isArray(metadata.commitmentWorkPackets)
    ? metadata.commitmentWorkPackets
    : Array.isArray(manifest?.packets)
      ? manifest.packets
      : [];
  const review = reviewArtifact ? metadataOf(reviewArtifact) : null;
  return {
    artifactRef: packetArtifact.uri,
    reviewRef: reviewArtifact?.uri ?? null,
    reviewStatus: typeof review?.status === "string" ? review.status : null,
    packetCount:
      typeof metadata.packetCount === "number"
        ? metadata.packetCount
        : typeof manifest?.packetCount === "number"
          ? manifest.packetCount
          : packets.length,
    packets: packets
      .filter((packet) => packet && typeof packet === "object")
      .map((packet) => ({
        packetRef: typeof packet.packetRef === "string" ? packet.packetRef : null,
        commitmentId: typeof packet.commitmentId === "string" ? packet.commitmentId : null,
        authoringSource: typeof packet.authoringSource === "string" ? packet.authoringSource : null,
        qualityStatus: typeof packet.qualityStatus === "string" ? packet.qualityStatus : null,
        workerObjective:
          typeof packet.workerObjective === "string" ? packet.workerObjective.slice(0, 700) : null,
        contextScoutObjective:
          typeof packet.contextScoutObjective === "string"
            ? packet.contextScoutObjective.slice(0, 700)
            : null,
        implementationObjective:
          typeof packet.implementationObjective === "string"
            ? packet.implementationObjective.slice(0, 700)
            : null,
        validationObjective:
          typeof packet.validationObjective === "string"
            ? packet.validationObjective.slice(0, 500)
            : null,
        likelyRepoAreas: Array.isArray(packet.likelyRepoAreas)
          ? packet.likelyRepoAreas.filter((item) => typeof item === "string").slice(0, 12)
          : [],
        requiredContextQuestions: Array.isArray(packet.requiredContextQuestions)
          ? packet.requiredContextQuestions.filter((item) => typeof item === "string").slice(0, 12)
          : typeof packet.requiredContextQuestionCount === "number" &&
              packet.requiredContextQuestionCount > 0
            ? [`bounded-question-count:${packet.requiredContextQuestionCount}`]
            : [],
        stopIfMissing: Array.isArray(packet.stopIfMissing)
          ? packet.stopIfMissing.filter((item) => typeof item === "string").slice(0, 8)
          : [],
      })),
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

function isSchedulerReadyPacketReviewStatus(status) {
  return (
    status === "accepted" ||
    status === "accepted_with_limitations" ||
    status === "needs_review_nonblocking"
  );
}

function isSchedulerReadyPacketQualityStatus(status) {
  return status === "accepted" || status === "accepted_with_limitations";
}

function summarizeContextScout(artifact) {
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
      typeof metadata.contextHandoffPacketRef === "string"
        ? metadata.contextHandoffPacketRef
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
        packetAuthorFanout:
          metadata.packetAuthorFanout && typeof metadata.packetAuthorFanout === "object"
            ? metadata.packetAuthorFanout
            : null,
        packetAuthorProfile:
          metadata.packetAuthorProfile && typeof metadata.packetAuthorProfile === "object"
            ? metadata.packetAuthorProfile
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

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}

function nodeCommitmentIds(node) {
  const metadata = node.metadata && typeof node.metadata === "object" ? node.metadata : {};
  return [
    ...arrayOfStrings(metadata.commitmentIdsAdvanced),
    ...arrayOfStrings(metadata.commitmentIds),
    ...arrayOfStrings(metadata.targetCommitmentIds),
  ];
}

function isImplementationContextTargetNode(node) {
  return [
    "implementation",
    "test_authoring",
    "docs_update",
    "architecture_spec",
    "planning_capsule",
    "action_graph_compile",
    "compiler",
  ].includes(node.nodeKind);
}

function incomingAcceptedContextSupplyNodes(snapshot, nodeId) {
  const incoming = snapshot.edges.filter(
    (edge) => edge.toNodeId === nodeId && edge.edgeKind === "context_supplies",
  );
  return incoming
    .map((edge) => snapshot.nodes.find((node) => node.nodeId === edge.fromNodeId))
    .filter(
      (node) =>
        node &&
        ["context_scout", "web_research"].includes(node.nodeKind) &&
        node.nodeStatus === "succeeded" &&
        arrayOfStrings(node.outputArtifactRefs).length > 0,
    );
}

function packetContextSupplyCoverage(snapshot, packetSummary) {
  const packets = packetSummary?.packets ?? [];
  if (!snapshot || packets.length <= 1) {
    return {
      required: false,
      packetCount: packets.length,
      acceptedPacketCount: 0,
      missingPacketCount: 0,
      pendingPacketCount: 0,
      allAccepted: true,
      missingCommitmentIds: [],
      pendingCommitmentIds: [],
      acceptedCommitmentIds: [],
      dedicatedContextNodeCount: 0,
      broadContextNodeCount: snapshot
        ? snapshot.nodes.filter((node) => ["context_scout", "web_research"].includes(node.nodeKind))
            .length
        : 0,
      rawPromptStored: false,
      rawResponseStored: false,
    };
  }
  const targetNodes = snapshot.nodes.filter(isImplementationContextTargetNode);
  if (targetNodes.length > 0) {
    const acceptedTargetNodeIds = [];
    const missingTargetNodeIds = [];
    const pendingTargetNodeIds = [];
    const acceptedCommitmentIds = new Set();
    const pendingCommitmentIds = new Set();
    const missingCommitmentIds = new Set();
    const dedicatedContextNodeIds = new Set();
    for (const node of targetNodes) {
      const incomingAccepted = incomingAcceptedContextSupplyNodes(snapshot, node.nodeId);
      const commitmentIds = nodeCommitmentIds(node);
      if (incomingAccepted.length > 0) {
        acceptedTargetNodeIds.push(node.nodeId);
        for (const contextNode of incomingAccepted) {
          dedicatedContextNodeIds.add(contextNode.nodeId);
        }
        for (const commitmentId of commitmentIds) {
          acceptedCommitmentIds.add(commitmentId);
        }
        continue;
      }
      const hasIncomingContextEdge = snapshot.edges.some(
        (edge) => edge.toNodeId === node.nodeId && edge.edgeKind === "context_supplies",
      );
      if (hasIncomingContextEdge) {
        pendingTargetNodeIds.push(node.nodeId);
        for (const commitmentId of commitmentIds) {
          pendingCommitmentIds.add(commitmentId);
        }
      } else {
        missingTargetNodeIds.push(node.nodeId);
        for (const commitmentId of commitmentIds) {
          missingCommitmentIds.add(commitmentId);
        }
      }
    }
    return {
      required: true,
      coverageMode: "node_scoped_context_supply",
      packetCount: packets.length,
      targetNodeCount: targetNodes.length,
      acceptedTargetNodeCount: acceptedTargetNodeIds.length,
      missingTargetNodeCount: missingTargetNodeIds.length,
      pendingTargetNodeCount: pendingTargetNodeIds.length,
      acceptedPacketCount: acceptedCommitmentIds.size,
      missingPacketCount: missingCommitmentIds.size,
      pendingPacketCount: pendingCommitmentIds.size,
      allAccepted: acceptedTargetNodeIds.length === targetNodes.length,
      missingCommitmentIds: [...missingCommitmentIds].toSorted((left, right) =>
        left.localeCompare(right),
      ),
      pendingCommitmentIds: [...pendingCommitmentIds].toSorted((left, right) =>
        left.localeCompare(right),
      ),
      acceptedCommitmentIds: [...acceptedCommitmentIds].toSorted((left, right) =>
        left.localeCompare(right),
      ),
      acceptedTargetNodeIds,
      missingTargetNodeIds,
      pendingTargetNodeIds,
      dedicatedContextNodeCount: dedicatedContextNodeIds.size,
      broadContextNodeCount: 0,
      rawPromptStored: false,
      rawResponseStored: false,
    };
  }
  const contextNodes = snapshot.nodes.filter((node) =>
    ["context_scout", "web_research"].includes(node.nodeKind),
  );
  const acceptedCommitmentIds = [];
  const missingCommitmentIds = [];
  const pendingCommitmentIds = [];
  const dedicatedNodeIds = new Set();
  const broadNodeIds = new Set();
  for (const packet of packets) {
    const matching = contextNodes.filter((node) => {
      const commitmentIds = nodeCommitmentIds(node);
      const dedicated =
        arrayOfStrings(node.inputHandoffRefs).includes(packet.packetRef) &&
        commitmentIds.includes(packet.commitmentId) &&
        commitmentIds.length <= 1;
      if (
        arrayOfStrings(node.inputHandoffRefs).includes(packet.packetRef) &&
        commitmentIds.includes(packet.commitmentId) &&
        commitmentIds.length > 1
      ) {
        broadNodeIds.add(node.nodeId);
      }
      return dedicated;
    });
    for (const node of matching) {
      dedicatedNodeIds.add(node.nodeId);
    }
    if (matching.length === 0) {
      missingCommitmentIds.push(packet.commitmentId);
      continue;
    }
    if (
      matching.some(
        (node) =>
          node.nodeStatus === "succeeded" && arrayOfStrings(node.outputArtifactRefs).length > 0,
      )
    ) {
      acceptedCommitmentIds.push(packet.commitmentId);
    } else {
      pendingCommitmentIds.push(packet.commitmentId);
    }
  }
  return {
    required: true,
    packetCount: packets.length,
    acceptedPacketCount: acceptedCommitmentIds.length,
    missingPacketCount: missingCommitmentIds.length,
    pendingPacketCount: pendingCommitmentIds.length,
    allAccepted: acceptedCommitmentIds.length === packets.length,
    missingCommitmentIds,
    pendingCommitmentIds,
    acceptedCommitmentIds,
    dedicatedContextNodeCount: dedicatedNodeIds.size,
    broadContextNodeCount: broadNodeIds.size,
    rawPromptStored: false,
    rawResponseStored: false,
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

function contextSynthesisReadinessSatisfied(schedulerProgress) {
  return schedulerProgress.some((event) => {
    if (
      event.stage !== "scheduler_node_context_freshness" ||
      event.currentPhase !== "context_freshness_satisfied"
    ) {
      return false;
    }
    if (event.roleId !== "context_synthesis" && event.activeNodeKind !== "context_synthesis") {
      return false;
    }
    return (event.reasonCodes ?? []).some(
      (reasonCode) =>
        reasonCode === "scheduler_node_context_freshness_satisfied_by_node_scoped_supply" ||
        reasonCode === "context_freshness_satisfied" ||
        String(reasonCode).startsWith("node_scoped_context_snapshot_count:"),
    );
  });
}

function graphPersistenceStatus(progress) {
  return (
    latestSchedulerProgressForStage(progress, "scheduler_graph_node_persistence")?.status ?? null
  );
}

function isProgressiveContextFirstGraph({ graph, contextScout, schedulerProgress }) {
  if (!graph || graph.nodeCount !== 1 || graph.edgeCount !== 0) {
    return false;
  }
  const acceptedGraph = latestSchedulerToolEvent(
    schedulerProgress,
    "scheduler.accept_staged_graph",
  );
  const acceptedGraphCompleted =
    acceptedGraph?.status === "succeeded" || acceptedGraph?.status === "completed";
  const firstNode = graph.activeNodes.at(0);
  const hasContextScoutNode = graph.nodeKinds.includes("context_scout");
  const contextScoutAccepted =
    (contextScout?.sufficiencyStatus === "accepted" ||
      contextScout?.sufficiencyStatus === "accepted_with_limitations") &&
    contextScout.sufficientForImplementation === true &&
    contextScout.verifiedFileRefs.length > 0;
  const contextScoutCompleted = schedulerProgress.some(
    (event) =>
      event.roleId === "context_scout" &&
      event.status === "completed" &&
      (event.reasonCodes.includes("context_scout_scheduler_node_completed") ||
        event.reasonCodes.includes("context_scout_tool_loop_recorded")),
  );
  return (
    (acceptedGraphCompleted || contextScoutCompleted) &&
    hasContextScoutNode &&
    (firstNode?.nodeKind === "context_scout" ||
      !contextScout ||
      contextScoutAccepted ||
      contextScoutCompleted)
  );
}

function isParallelContextScoutFrontierGraph({ graph, schedulerProgress }) {
  if (!graph || graph.nodeCount < 2 || graph.edgeCount !== 0) {
    return false;
  }
  const onlyContextScoutNodes =
    graph.nodeKinds.length === 1 && graph.nodeKinds.includes("context_scout");
  if (!onlyContextScoutNodes) {
    return false;
  }
  const acceptedGraph =
    schedulerToolCompleted(schedulerProgress, "scheduler.accept_staged_graph") ||
    schedulerProgress.some((event) => event.currentPhase === "decomposition_accepted");
  const parallelStructureDeclared =
    schedulerToolCompleted(schedulerProgress, "scheduler.define_edges_or_parallelism") ||
    schedulerProgress.some((event) =>
      (event.reasonCodes ?? []).some((reasonCode) => String(reasonCode).includes("parallel")),
    );
  const contextFrontierOpened = schedulerProgress.some(
    (event) =>
      event.nodeId &&
      event.roleId === "context_scout" &&
      (event.currentPhase === "executable" ||
        event.currentPhase === "node_started" ||
        event.currentPhase === "worker_runtime_tool_call_started" ||
        event.currentPhase === "primary_role_output" ||
        event.currentPhase === "primary_role_output_in_progress" ||
        event.currentPhase === "primary_role_output_completed" ||
        event.currentPhase === "node_completed"),
  );
  return (acceptedGraph && parallelStructureDeclared) || contextFrontierOpened;
}

function evaluateSchedulerGraphGate({ graph, contextScout, schedulerProgress }) {
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
  if (isProgressiveContextFirstGraph({ graph, contextScout, schedulerProgress })) {
    return "review_available_nonblocking";
  }
  if (isParallelContextScoutFrontierGraph({ graph, schedulerProgress })) {
    return "review_available_nonblocking";
  }
  if (graph.nodeCount === 1 && graph.nodeKinds.includes("context_scout") && !contextScout) {
    return "review_available_nonblocking";
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
  const packets = summarizeCommitmentPackets(
    latestArtifact(artifacts, "execution_platform.commitment_work_packets"),
    latestArtifact(artifacts, "execution_platform.commitment_packet_quality_review"),
  );
  const contextScout = summarizeContextScout(
    latestArtifact(artifacts, "execution_platform.context_scout_tool_loop"),
  );
  const schedulerProgress = summarizeSchedulerProgress(artifacts);
  const packetAcceptanceProgress = schedulerProgress.findLast(
    (event) =>
      event.stage === "commitment_packet_authoring" &&
      event.currentPhase === "commitment_packets_accepted" &&
      event.reasonCodes.includes("model_authored_commitment_packets_accepted"),
  );
  const graph = graphSummary(snapshot);
  const contextCoverage = packetContextSupplyCoverage(snapshot, packets);
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

  const packetSummaryLooksReady =
    packets &&
    packets.packetCount >= (mission?.blockingCommitmentCount ?? 1) &&
    packets.packets.every(
      (packet) =>
        packet.authoringSource === "model_authored" &&
        isSchedulerReadyPacketQualityStatus(packet.qualityStatus) &&
        packet.likelyRepoAreas.length > 0 &&
        packet.requiredContextQuestions.length > 0,
    );
  const packetGate = {
    gateId: "commitment_work_packets",
    status: !packets
      ? "waiting"
      : packetAcceptanceProgress ||
          (isSchedulerReadyPacketReviewStatus(packets.reviewStatus) && packetSummaryLooksReady)
        ? packets.reviewStatus === "accepted_with_limitations" ||
          packets.reviewStatus === "needs_review_nonblocking"
          ? "accepted_with_limitations"
          : "review_available_nonblocking"
        : packets.reviewStatus && !isSchedulerReadyPacketReviewStatus(packets.reviewStatus)
          ? "failed"
          : "waiting",
    evidence: packets,
  };
  if (packetGate.status === "failed") {
    hardFailures.push("commitment_work_packets_not_grade_a_shape");
  }
  if (
    packetGate.status === "review_available_nonblocking" ||
    packetGate.status === "accepted_with_limitations"
  ) {
    needsReview.push("commitment_packets_review_available_nonblocking");
  }

  const implementationStarted =
    graph?.activeNodes.some((node) => node.nodeKind === "implementation") === true ||
    schedulerProgress.some(
      (event) =>
        event.stage === "node_execution" &&
        (event.roleId === "implementation_engineer" ||
          event.selectedCapabilityId?.includes("implementation")),
    );
  const contextSynthesisExecutionStarted = schedulerProgress.some((event) => {
    if (event.roleId !== "context_synthesis" && event.activeNodeKind !== "context_synthesis") {
      return false;
    }
    if (event.schedulerToolId === "scheduler.context_synthesis.create") {
      return false;
    }
    return (
      String(event.stage ?? "").includes("context_synthesis") ||
      String(event.currentPhase ?? "").includes("context_synthesis") ||
      String(event.schedulerPhase ?? "").includes("context_synthesis")
    );
  });
  const synthesisReadinessSatisfied = contextSynthesisReadinessSatisfied(schedulerProgress);
  const contextGate = {
    gateId: "context_supply",
    status:
      contextCoverage.required && contextCoverage.allAccepted
        ? "needs_model_quality_review"
        : contextCoverage.required &&
            contextCoverage.pendingPacketCount > 0 &&
            !contextSynthesisExecutionStarted &&
            !implementationStarted
          ? "waiting"
          : contextCoverage.required &&
              contextCoverage.missingPacketCount > 0 &&
              !contextSynthesisExecutionStarted &&
              !implementationStarted
            ? "waiting"
            : contextCoverage.required &&
                (contextSynthesisExecutionStarted || implementationStarted) &&
                !contextCoverage.allAccepted
              ? contextSynthesisExecutionStarted &&
                synthesisReadinessSatisfied &&
                !implementationStarted
                ? "review_available_nonblocking"
                : "failed"
              : !contextScout
                ? implementationStarted
                  ? "failed"
                  : "waiting"
                : (contextScout.sufficiencyStatus === "accepted" ||
                      contextScout.sufficiencyStatus === "accepted_with_limitations") &&
                    contextScout.sufficientForImplementation &&
                    contextScout.verifiedFileRefs.length > 0
                  ? contextScout.sufficiencyStatus === "accepted_with_limitations"
                    ? "accepted_with_limitations"
                    : "review_available_nonblocking"
                  : "failed",
    evidence: {
      contextScout,
      packetContextSupplyCoverage: contextCoverage,
      contextSynthesisReadinessSatisfied: synthesisReadinessSatisfied,
      rawPromptStored: false,
      rawResponseStored: false,
    },
  };
  if (contextGate.status === "failed") {
    hardFailures.push(
      contextCoverage.required && contextSynthesisExecutionStarted && !contextCoverage.allAccepted
        ? "context_synthesis_started_without_required_context_handoffs"
        : contextCoverage.required && implementationStarted && !contextCoverage.allAccepted
          ? "implementation_started_without_node_scoped_context_handoffs"
          : implementationStarted && !contextScout
            ? "implementation_started_before_context_scout"
            : "context_scout_not_accepted",
    );
  }
  if (
    contextGate.status === "review_available_nonblocking" ||
    contextGate.status === "accepted_with_limitations"
  ) {
    needsReview.push("context_scout_review_available_nonblocking");
  }

  const graphGate = {
    gateId: "scheduler_graph",
    status: evaluateSchedulerGraphGate({ graph, contextScout, schedulerProgress }),
    evidence: graph,
  };
  if (graphGate.status === "failed") {
    hardFailures.push("scheduler_graph_missing_edges_or_nodes");
  }
  if (graphGate.status === "review_available_nonblocking") {
    needsReview.push("scheduler_graph_review_available_nonblocking");
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
      packetGate,
      contextGate,
      graphGate,
      closeoutGate,
    ],
    hardFailures: [...new Set(hardFailures)],
    needsReview: [...new Set(needsReview)],
    shouldStop: hardFailures.length > 0,
    firstOpenGate:
      [
        payloadGate,
        sourcePromptGate,
        missionGate,
        packetGate,
        contextGate,
        graphGate,
        closeoutGate,
      ].find((gate) => !gateStatusIsAcceptedForProgress(gate.status))?.gateId ?? null,
    sourcePrompt,
    mission,
    packets,
    contextScout,
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
  const packetFanout = await latestPacketAuthorFanoutFromArtifacts(runtime, artifacts);
  const packetFailureDiagnostics = commitmentPacketFailureDiagnosticsForRun({
    generatedAt,
    runtimeJobId: submit.runtimeJobId,
    workItemId: submit.workItemId,
    fanout: packetFanout?.fanout ?? null,
    sourceArtifactRef: packetFanout?.artifactRef ?? null,
  });
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
    packetFailureDiagnostics,
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
  const latestPacketFanout = latestPacketAuthorFanout(snapshot);
  const packetDiagnostics =
    snapshot.packetFailureDiagnostics ?? commitmentPacketFailureDiagnostics(snapshot);
  return {
    event: "product_spec_checkpoint_progress",
    at: snapshot.generatedAt,
    runtimeJobId: snapshot.runtimeJobId,
    jobState: snapshot.job?.state ?? null,
    firstOpenGate: snapshot.checkpoints.firstOpenGate,
    hardFailures: snapshot.checkpoints.hardFailures,
    needsReview: snapshot.checkpoints.needsReview,
    graphStatus: snapshot.checkpoints.graph?.status ?? null,
    nodeCount: snapshot.checkpoints.graph?.nodeCount ?? 0,
    edgeCount: snapshot.checkpoints.graph?.edgeCount ?? 0,
    latestStage: latest?.stage ?? null,
    latestPhase: latest?.currentPhase ?? latest?.schedulerPhase ?? null,
    latestObjective: latest?.objective ?? null,
    latestEli5: latest?.eli5Progress ?? null,
    packetFanout: latestPacketFanout
      ? {
          totalCount:
            typeof latestPacketFanout.totalCount === "number"
              ? latestPacketFanout.totalCount
              : null,
          failedCount:
            typeof latestPacketFanout.failedCount === "number"
              ? latestPacketFanout.failedCount
              : null,
          pendingCount:
            typeof latestPacketFanout.pendingCount === "number"
              ? latestPacketFanout.pendingCount
              : null,
          runningCount:
            typeof latestPacketFanout.runningCount === "number"
              ? latestPacketFanout.runningCount
              : null,
          completedCount:
            typeof latestPacketFanout.completedCount === "number"
              ? latestPacketFanout.completedCount
              : null,
          needsReviewCount:
            typeof latestPacketFanout.needsReviewCount === "number"
              ? latestPacketFanout.needsReviewCount
              : null,
        }
      : null,
    commitmentPacketDiagnostics: packetDiagnostics
      ? {
          diagnosticPacketCount: packetDiagnostics.diagnosticPacketCount,
          concerningPacketCount: packetDiagnostics.concerningPacketCount,
          incompletePacketCount: packetDiagnostics.incompletePacketCount,
          retryPacketCount: packetDiagnostics.retryPacketCount,
          fallbackPacketCount: packetDiagnostics.fallbackPacketCount,
          providerErrorPacketCount: packetDiagnostics.providerErrorPacketCount,
          longLatencyPacketCount: packetDiagnostics.longLatencyPacketCount,
          toFixCount: packetDiagnostics.toFixItems.length,
        }
      : null,
  };
}

function latestPacketAuthorFanout(snapshot) {
  return (
    snapshot.checkpoints.schedulerProgress.findLast((progress) => progress.packetAuthorFanout)
      ?.packetAuthorFanout ?? null
  );
}

async function latestPacketAuthorFanoutFromArtifacts(runtime, artifacts) {
  const diagnosticArtifact =
    artifacts
      .filter(
        (artifact) =>
          artifact.artifactType === "execution_platform.commitment_packet_fanout_diagnostics",
      )
      .toSorted((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
      .at(-1) ?? null;
  if (diagnosticArtifact) {
    const hydrated = await runtime.runtimeJobs.hydrateRuntimeArtifactByContract(diagnosticArtifact);
    if (hydrated.status === "payload_hydrated" && hydrated.body) {
      return {
        fanout: hydrated.body,
        artifactRef: diagnosticArtifact.uri,
        createdAt: diagnosticArtifact.createdAt.toISOString(),
      };
    }
  }
  return (
    artifacts
      .filter((artifact) => artifact.artifactType === "agent_team.scheduler_progress")
      .map((artifact) => {
        const metadata = metadataOf(artifact);
        return metadata.packetAuthorFanout && typeof metadata.packetAuthorFanout === "object"
          ? {
              fanout: metadata.packetAuthorFanout,
              artifactRef:
                typeof metadata.packetAuthorFanout.diagnosticArtifactRef === "string"
                  ? metadata.packetAuthorFanout.diagnosticArtifactRef
                  : artifact.uri,
              createdAt: artifact.createdAt.toISOString(),
            }
          : null;
      })
      .findLast((packetFanout) => packetFanout !== null) ?? null
  );
}

function packetDiagnosticUsage(diagnostics) {
  const usage = usageFromDiagnostics(diagnostics);
  if (!usage) {
    return null;
  }
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    estimatedCostUsd:
      typeof usage.estimatedCostUsd === "number" ? Number(usage.estimatedCostUsd.toFixed(8)) : null,
  };
}

function normalizeReasonCodes(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim()).slice(0, 80)
    : [];
}

function packetFailureClasses(packet) {
  const latest =
    packet.latestDiagnostics && typeof packet.latestDiagnostics === "object"
      ? packet.latestDiagnostics
      : {};
  const providerDiagnostics =
    latest.providerDiagnostics && typeof latest.providerDiagnostics === "object"
      ? latest.providerDiagnostics
      : {};
  const retryEvidence =
    latest.retryEvidence && typeof latest.retryEvidence === "object" ? latest.retryEvidence : {};
  const retryReasonCodes = normalizeReasonCodes(retryEvidence.retryReasonCodes);
  const classes = [];
  const preflightBlocked =
    latest.noContentReasonClass === "preflight_blocked" ||
    (typeof latest.errorReasonCode === "string" && latest.errorReasonCode.includes("preflight"));
  if (packet.status !== "completed") {
    classes.push("packet_author_incomplete");
  }
  if (preflightBlocked) {
    classes.push("packet_author_preflight_blocked");
  }
  if (typeof latest.errorReasonCode === "string" && latest.errorReasonCode.trim()) {
    classes.push("packet_author_provider_error");
  }
  if (retryReasonCodes.length > 0) {
    classes.push("packet_author_retry_needed");
  }
  if (
    typeof latest.fallbackReasonCode === "string" ||
    typeof latest.fallbackFromModelRef === "string" ||
    normalizeReasonCodes(packet.reasonCodes).some((code) => code.includes("rescue"))
  ) {
    classes.push("packet_author_rescue_or_fallback");
  }
  if (
    !preflightBlocked &&
    (latest.outputContentLength === 0 ||
      providerDiagnostics.contentLength === 0 ||
      retryReasonCodes.some((code) => code.includes("no_content")) ||
      latest.errorReasonCode === "openrouter_no_content")
  ) {
    classes.push("packet_author_no_content_or_empty_output");
  }
  const timeoutMs =
    providerDiagnostics.requestProfileDiagnostics &&
    typeof providerDiagnostics.requestProfileDiagnostics === "object" &&
    typeof providerDiagnostics.requestProfileDiagnostics.timeoutMs === "number"
      ? providerDiagnostics.requestProfileDiagnostics.timeoutMs
      : null;
  if (
    typeof latest.latencyMs === "number" &&
    (latest.latencyMs >= 90_000 || (timeoutMs !== null && latest.latencyMs >= timeoutMs))
  ) {
    classes.push("packet_author_long_latency");
  }
  return [...new Set(classes)];
}

function summarizePacketDiagnostic(packet) {
  const latest =
    packet.latestDiagnostics && typeof packet.latestDiagnostics === "object"
      ? packet.latestDiagnostics
      : {};
  const providerDiagnostics =
    latest.providerDiagnostics && typeof latest.providerDiagnostics === "object"
      ? latest.providerDiagnostics
      : {};
  const requestProfileDiagnostics =
    providerDiagnostics.requestProfileDiagnostics &&
    typeof providerDiagnostics.requestProfileDiagnostics === "object"
      ? providerDiagnostics.requestProfileDiagnostics
      : {};
  const retryEvidence =
    latest.retryEvidence && typeof latest.retryEvidence === "object" ? latest.retryEvidence : {};
  const failureClasses = packetFailureClasses(packet);
  return {
    commitmentId: typeof packet.commitmentId === "string" ? packet.commitmentId : null,
    status: typeof packet.status === "string" ? packet.status : null,
    modelRef: typeof packet.modelRef === "string" ? packet.modelRef : null,
    modelCandidateId: typeof latest.modelCandidateId === "string" ? latest.modelCandidateId : null,
    providerPath:
      typeof packet.providerPath === "string"
        ? packet.providerPath
        : typeof latest.providerPath === "string"
          ? latest.providerPath
          : null,
    profileRef:
      typeof packet.profileRef === "string"
        ? packet.profileRef
        : typeof latest.requestProfileRef === "string"
          ? latest.requestProfileRef
          : null,
    reasonCodes: normalizeReasonCodes(packet.reasonCodes),
    failureClasses,
    concerning: failureClasses.length > 0,
    errorReasonCode: typeof latest.errorReasonCode === "string" ? latest.errorReasonCode : null,
    terminalLaneErrorReasonCode:
      typeof latest.terminalLaneErrorReasonCode === "string"
        ? latest.terminalLaneErrorReasonCode
        : null,
    noContentReasonClass:
      typeof latest.noContentReasonClass === "string" ? latest.noContentReasonClass : null,
    fallbackReasonCode:
      typeof latest.fallbackReasonCode === "string" ? latest.fallbackReasonCode : null,
    fallbackFromModelRef:
      typeof latest.fallbackFromModelRef === "string" ? latest.fallbackFromModelRef : null,
    retryReasonCodes: normalizeReasonCodes(retryEvidence.retryReasonCodes),
    retryAttemptCount:
      typeof retryEvidence.attemptCount === "number" ? retryEvidence.attemptCount : null,
    retryAttempts: Array.isArray(retryEvidence.attempts)
      ? retryEvidence.attempts
          .filter((attempt) => attempt && typeof attempt === "object")
          .map((attempt) => ({
            attempt: typeof attempt.attempt === "number" ? attempt.attempt : null,
            latencyMs: typeof attempt.latencyMs === "number" ? attempt.latencyMs : null,
            httpStatus: typeof attempt.httpStatus === "number" ? attempt.httpStatus : null,
            reasonCode: typeof attempt.reasonCode === "string" ? attempt.reasonCode : null,
            cooldownMs: typeof attempt.cooldownMs === "number" ? attempt.cooldownMs : null,
          }))
          .slice(0, 8)
      : [],
    latencyMs: typeof latest.latencyMs === "number" ? latest.latencyMs : null,
    inputByteLength:
      typeof latest.inputByteLength === "number"
        ? latest.inputByteLength
        : typeof requestProfileDiagnostics.promptByteLength === "number"
          ? requestProfileDiagnostics.promptByteLength
          : null,
    outputContentLength:
      typeof latest.outputContentLength === "number"
        ? latest.outputContentLength
        : typeof providerDiagnostics.contentLength === "number"
          ? providerDiagnostics.contentLength
          : null,
    finishReason:
      typeof latest.finishReason === "string"
        ? latest.finishReason
        : typeof providerDiagnostics.finishReason === "string"
          ? providerDiagnostics.finishReason
          : null,
    nativeFinishReason:
      typeof providerDiagnostics.nativeFinishReason === "string"
        ? providerDiagnostics.nativeFinishReason
        : null,
    responseFormatSent:
      typeof latest.responseFormatSent === "string" ? latest.responseFormatSent : null,
    reasoningModeSent:
      typeof latest.reasoningModeSent === "string" ? latest.reasoningModeSent : null,
    structuredAdapterPreflight:
      providerDiagnostics.structuredAdapterPreflight &&
      typeof providerDiagnostics.structuredAdapterPreflight === "object"
        ? providerDiagnostics.structuredAdapterPreflight
        : null,
    reasoningMode:
      typeof requestProfileDiagnostics.reasoningMode === "string"
        ? requestProfileDiagnostics.reasoningMode
        : null,
    reasoningTokenCount:
      typeof providerDiagnostics.reasoningTokenCount === "number"
        ? providerDiagnostics.reasoningTokenCount
        : null,
    maxTokens:
      typeof requestProfileDiagnostics.maxTokens === "number"
        ? requestProfileDiagnostics.maxTokens
        : null,
    timeoutMs:
      typeof requestProfileDiagnostics.timeoutMs === "number"
        ? requestProfileDiagnostics.timeoutMs
        : null,
    promptHash:
      typeof requestProfileDiagnostics.promptHash === "string"
        ? requestProfileDiagnostics.promptHash
        : null,
    outputHash: typeof latest.outputHash === "string" ? latest.outputHash : null,
    modelCallSpanId:
      typeof latest.modelCallSpanId === "string"
        ? latest.modelCallSpanId
        : typeof providerDiagnostics.modelCallSpanId === "string"
          ? providerDiagnostics.modelCallSpanId
          : null,
    usage: packetDiagnosticUsage(latest),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function buildPacketToFixItems(packetDiagnostics) {
  const toFixItems = [];
  const byClass = new Map();
  for (const packet of packetDiagnostics) {
    for (const failureClass of packet.failureClasses) {
      byClass.set(failureClass, (byClass.get(failureClass) ?? 0) + 1);
    }
  }
  const add = (condition, item) => {
    if (condition) {
      toFixItems.push(item);
    }
  };
  add(byClass.has("packet_author_incomplete"), {
    area: "commitment_packet_authoring",
    priority: "P0",
    issue: "One or more packet-author calls did not reach a terminal completed packet state.",
    recommendedFix:
      "Make packet fanout terminal accounting explicit: completed, retrying, rescued, blocked, or needs_review must be persisted before the phase can advance.",
    affectedCommitmentIds: packetDiagnostics
      .filter((packet) => packet.failureClasses.includes("packet_author_incomplete"))
      .map((packet) => packet.commitmentId)
      .filter(Boolean),
  });
  add(byClass.has("packet_author_no_content_or_empty_output"), {
    area: "commitment_packet_authoring",
    priority: "P0",
    issue:
      "Qwen/OpenRouter packet authoring returned no content or empty output for at least one commitment packet.",
    recommendedFix:
      "Diagnose the exact packet prompt shape, provider finish/native finish reason, output limit, timeout, and retry behavior. Prefer bounded semantic-content calls plus targeted normalization over GPT rescue as a normal path.",
    affectedCommitmentIds: packetDiagnostics
      .filter((packet) =>
        packet.failureClasses.includes("packet_author_no_content_or_empty_output"),
      )
      .map((packet) => packet.commitmentId)
      .filter(Boolean),
  });
  add(byClass.has("packet_author_preflight_blocked"), {
    area: "commitment_packet_authoring",
    priority: "P0",
    issue:
      "Structured adapter preflight blocked one or more packet-author calls before provider invocation.",
    recommendedFix:
      "Align call-site model-task bounds, requested timeouts, output limits, and input bundle size before rerunning; this is a runtime policy mismatch, not a model no-content event.",
    affectedCommitmentIds: packetDiagnostics
      .filter((packet) => packet.failureClasses.includes("packet_author_preflight_blocked"))
      .map((packet) => packet.commitmentId)
      .filter(Boolean),
  });
  add(byClass.has("packet_author_rescue_or_fallback"), {
    area: "commitment_packet_authoring",
    priority: "P1",
    issue: "Packet authoring used a rescue/fallback model.",
    recommendedFix:
      "Treat rescue as an incident unless explicitly accepted by operator policy. Compare rescued and primary packet inputs by hash/size/commitment class and improve the primary two-step packet path.",
    affectedCommitmentIds: packetDiagnostics
      .filter((packet) => packet.failureClasses.includes("packet_author_rescue_or_fallback"))
      .map((packet) => packet.commitmentId)
      .filter(Boolean),
  });
  add(byClass.has("packet_author_long_latency"), {
    area: "commitment_packet_authoring",
    priority: "P1",
    issue: "Packet authoring exceeded the expected latency budget.",
    recommendedFix:
      "Split model-owned semantic authoring from runtime-owned compilation/normalization, keep prompt context packs bounded by source refs rather than repeated full ledgers, and preserve per-packet latency budgets.",
    affectedCommitmentIds: packetDiagnostics
      .filter((packet) => packet.failureClasses.includes("packet_author_long_latency"))
      .map((packet) => packet.commitmentId)
      .filter(Boolean),
  });
  add(byClass.has("packet_author_provider_error"), {
    area: "commitment_packet_authoring",
    priority: "P1",
    issue: "Packet authoring surfaced provider-level errors.",
    recommendedFix:
      "Route provider failures through structured model-task degradation policy with exact provider status, retry evidence, and model/profile-specific cooldown instead of broad phase retries.",
    affectedCommitmentIds: packetDiagnostics
      .filter((packet) => packet.failureClasses.includes("packet_author_provider_error"))
      .map((packet) => packet.commitmentId)
      .filter(Boolean),
  });
  return toFixItems;
}

function commitmentPacketFailureDiagnosticsForRun({
  generatedAt,
  runtimeJobId,
  workItemId,
  fanout,
  sourceArtifactRef = null,
}) {
  if (!fanout || !Array.isArray(fanout.packetDiagnostics)) {
    return null;
  }
  const packetDiagnostics = fanout.packetDiagnostics
    .filter((packet) => packet && typeof packet === "object")
    .map(summarizePacketDiagnostic);
  const concerning = packetDiagnostics.filter((packet) => packet.concerning);
  return {
    artifactKind: "product_spec_commitment_packet_failure_diagnostics",
    generatedAt,
    runtimeJobId,
    workItemId,
    sourceArtifactRef,
    fanoutSummary: {
      totalCount: typeof fanout.totalCount === "number" ? fanout.totalCount : null,
      completedCount: typeof fanout.completedCount === "number" ? fanout.completedCount : null,
      failedCount: typeof fanout.failedCount === "number" ? fanout.failedCount : null,
      pendingCount: typeof fanout.pendingCount === "number" ? fanout.pendingCount : null,
      runningCount: typeof fanout.runningCount === "number" ? fanout.runningCount : null,
      needsReviewCount:
        typeof fanout.needsReviewCount === "number" ? fanout.needsReviewCount : null,
    },
    diagnosticPacketCount: packetDiagnostics.length,
    concerningPacketCount: concerning.length,
    incompletePacketCount: concerning.filter((packet) =>
      packet.failureClasses.includes("packet_author_incomplete"),
    ).length,
    retryPacketCount: concerning.filter((packet) =>
      packet.failureClasses.includes("packet_author_retry_needed"),
    ).length,
    fallbackPacketCount: concerning.filter((packet) =>
      packet.failureClasses.includes("packet_author_rescue_or_fallback"),
    ).length,
    providerErrorPacketCount: concerning.filter((packet) =>
      packet.failureClasses.includes("packet_author_provider_error"),
    ).length,
    longLatencyPacketCount: concerning.filter((packet) =>
      packet.failureClasses.includes("packet_author_long_latency"),
    ).length,
    packetDiagnostics,
    concerningPackets: concerning,
    toFixItems: buildPacketToFixItems(packetDiagnostics),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function commitmentPacketFailureDiagnostics(snapshot) {
  return commitmentPacketFailureDiagnosticsForRun({
    generatedAt: snapshot.generatedAt,
    runtimeJobId: snapshot.runtimeJobId,
    workItemId: snapshot.workItemId,
    fanout: latestPacketAuthorFanout(snapshot),
  });
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
  const fromCommitmentPackets = process.argv.includes("--from-commitment-packets");
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
          replayBoundary: fromCommitmentPackets
            ? "commitment_packet_authoring"
            : "fresh_graph_replay_from_original_prompt_and_prior_failure_evidence",
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
      replayBoundary: fromCommitmentPackets
        ? "commitment_packet_authoring"
        : "fresh_graph_replay_from_original_prompt_and_prior_failure_evidence",
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
        "existing_runtime_job_after_graph_creation_or_context_scout_boundary",
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
  const packetFailureDiagnostics =
    finalSnapshot.packetFailureDiagnostics ?? commitmentPacketFailureDiagnostics(finalSnapshot);
  if (packetFailureDiagnostics) {
    await writeJson(
      "product-spec-commitment-packet-failure-diagnostics.json",
      packetFailureDiagnostics,
    );
    await writeJson("product-spec-proof-follow-up-fix-list.json", {
      artifactKind: "product_spec_proof_follow_up_fix_list",
      generatedAt: new Date().toISOString(),
      runtimeJobId: finalSnapshot.runtimeJobId,
      workItemId: finalSnapshot.workItemId,
      sourceDiagnosticArtifact:
        ".artifacts/execution-platform/product-spec-commitment-packet-failure-diagnostics.json",
      commitmentPacketToFixItems: packetFailureDiagnostics.toFixItems,
      otherHardFailures: finalSnapshot.checkpoints.hardFailures,
      firstOpenGate: finalSnapshot.checkpoints.firstOpenGate,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
  }
  const summary = {
    artifactKind: "product_spec_checkpointed_test_summary",
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
    finalSnapshot,
    phaseWallClock: summarizePhaseWallClock(finalSnapshot),
    modelTokenBurnByModel: summarizeModelTokenBurn(finalSnapshot),
    commitmentPacketFailureDiagnostics: packetFailureDiagnostics
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
  await writeJson("product-spec-checkpointed-test-summary.json", summary);
  await writeJson("product-spec-checkpointed-test-artifact-index.json", {
    artifactKind: "product_spec_checkpointed_test_artifact_index",
    artifacts: [
      ".artifacts/execution-platform/product-spec-checkpointed-test-preflight.json",
      ".artifacts/execution-platform/product-spec-checkpointed-test-latest.json",
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
