#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const proofTargetWorkItemId = "openclaw-convergence.runtime-artifact-retention-pruning-policy";
const proofTargetTitle = "Runtime Artifact Retention And Pruning Policy";
const proofRunId =
  process.env.OPENCLAW_NATIVE_ORCHESTRATION_PROOF_RUN_ID?.trim() ||
  `native-orchestration-runtime-artifact-retention-${new Date()
    .toISOString()
    .replace(/[-:]/gu, "")
    .replace(/\.\d{3}Z$/u, "Z")}`;
const proofDir = path.join(root, ".artifacts/execution-platform/proof-runs", proofRunId);
const queueName = "native-execution";
const orchestratorAgentProfile = "execution-orchestrator";
const residentProofPollIntervalMs = Math.max(
  1_000,
  Number(process.env.OPENCLAW_NATIVE_ORCHESTRATION_PROOF_POLL_INTERVAL_MS ?? 5_000),
);
const residentProofPreProviderStaleMs = Math.max(
  15_000,
  Number(process.env.OPENCLAW_NATIVE_ORCHESTRATION_PROOF_PRE_PROVIDER_STALE_MS ?? 45_000),
);
const residentProofMaxRuntimeMs = Math.max(
  300_000,
  Number(process.env.OPENCLAW_NATIVE_ORCHESTRATION_PROOF_MAX_RUNTIME_MS ?? 1_800_000),
);
let residentGatewayBaseUrl = "";
let activeRuntimeJobId = null;
let shutdownStarted = false;

function normalizeGatewayBaseUrl(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "";
  }
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

function sha256Json(value) {
  return sha256(JSON.stringify(value));
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asString(value) {
  return typeof value === "string" ? value : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function nativeProofAuth() {
  return {
    actorId: "native-orchestration-proof",
    role: "operator",
    authenticated: true,
    sourceRoute: "service",
  };
}

function gatewayHeaders() {
  const token = (process.env.OPENCLAW_GATEWAY_TOKEN ?? "").trim();
  return {
    "content-type": "application/json",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    "x-openclaw-scopes": "operator.admin,operator.write,operator.read,operator.approvals",
    "x-openclaw-actor-id": "native-orchestration-proof",
    "x-openclaw-session-key": "agent:main:main",
    "x-openclaw-source-route": "service",
  };
}

function relativeToRoot(filePath) {
  const relative = path.relative(root, filePath);
  return relative && !relative.startsWith("..") ? relative : filePath;
}

function writeJson(name, value) {
  fs.mkdirSync(proofDir, { recursive: true });
  const body = `${JSON.stringify(
    {
      ...value,
      generatedAt: new Date().toISOString(),
    },
    null,
    2,
  )}\n`;
  const abs = path.join(proofDir, name);
  fs.writeFileSync(abs, body, "utf8");
  return {
    path: relativeToRoot(abs),
    ref: `artifact://execution-platform/proof-runs/${proofRunId}/${name}`,
    sha256: sha256(body),
  };
}

function loadDotenvFiles() {
  const loadedRefs = [];
  for (const filePath of [
    path.join(root, ".env"),
    path.join(root, ".env.local"),
    path.join(root, ".env.execution-platform-staging"),
    "/root/.openclaw/.env",
  ]) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    let loaded = false;
    for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && !process.env[key]) {
        process.env[key] = value;
        loaded = true;
      }
    }
    if (loaded) {
      loadedRefs.push(`dotenv://${relativeToRoot(filePath)}`);
    }
  }
  return loadedRefs;
}

function compactWorkQueueDetailResponse(detail) {
  if (!detail || !isRecord(detail)) {
    return null;
  }
  const item = isRecord(detail.item) ? detail.item : {};
  return {
    accepted: detail.accepted === true,
    workItemId: asString(item.workItemId),
    title: asString(item.title),
    itemType: asString(item.itemType),
    lifecycleState: asString(item.lifecycleState),
    queueStatus: asString(item.queueStatus),
    queueRank: typeof item.queueRank === "number" ? item.queueRank : null,
    runtimeJobIds: asArray(item.runtimeJobIds)
      .filter((value) => typeof value === "string")
      .slice(0, 40),
    artifactRefCount: asArray(item.artifactRefs).length,
    executionKeys: isRecord(item.execution)
      ? Object.keys(item.execution).toSorted().slice(0, 80)
      : [],
  };
}

function compactGatewayJson(value) {
  if (!isRecord(value)) {
    return {
      valueType: Array.isArray(value) ? "array" : typeof value,
      sha256: sha256Json(value),
    };
  }
  const runtimeJob = isRecord(value.runtimeJob) ? value.runtimeJob : null;
  return {
    keys: Object.keys(value).toSorted().slice(0, 80),
    accepted: value.accepted === true,
    status: asString(value.status),
    statusCode: typeof value.statusCode === "number" ? value.statusCode : null,
    runtimeJobId: asString(value.runtimeJobId) ?? asString(runtimeJob?.jobId),
    jobType: asString(value.jobType) ?? asString(runtimeJob?.jobType),
    runtimeJobState: asString(runtimeJob?.state),
    claimed: typeof value.claimed === "boolean" ? value.claimed : null,
    completed: typeof value.completed === "boolean" ? value.completed : null,
    failed: typeof value.failed === "boolean" ? value.failed : null,
    reasonCodes: asArray(value.reasonCodes)
      .filter((entry) => typeof entry === "string")
      .slice(0, 30),
    sha256: sha256Json(value),
  };
}

function compactLiveStatus(value) {
  const live = isRecord(value?.live) ? value.live : {};
  const diagnostics = isRecord(live.diagnostics) ? live.diagnostics : {};
  const latestMeaningfulEvent = isRecord(live.latestMeaningfulEvent)
    ? live.latestMeaningfulEvent
    : null;
  return {
    runtimeJobId: asString(live.runtimeJobId) ?? asString(value?.runtimeJobId),
    runtimeJobState: asString(live.runtimeJobState) ?? asString(value?.runtimeJobState),
    currentPhase: asString(live.currentPhase),
    latestLaunchPhase: asString(live.latestLaunchPhase),
    latestStageLabel: asString(diagnostics.latestStageLabel),
    modelActivitySeen: live.modelActivitySeen === true,
    providerRequestSeen: live.providerRequestSeen === true,
    agentLaunchSeen: live.agentLaunchSeen === true,
    toolActivitySeen: live.toolActivitySeen === true,
    mutationSeen: live.mutationSeen === true,
    validationSeen: live.validationSeen === true,
    finishSeen: live.finishSeen === true,
    latestMeaningfulEventAgeMs:
      typeof live.latestMeaningfulEventAgeMs === "number" ? live.latestMeaningfulEventAgeMs : null,
    latestMeaningfulEventType: asString(latestMeaningfulEvent?.eventType),
    latestMeaningfulEventTime: asString(latestMeaningfulEvent?.eventTime),
    eventCounts: isRecord(live.eventCounts) ? live.eventCounts : {},
    launchStages: asArray(live.launchStages)
      .filter(isRecord)
      .map((stage) => ({
        stage: asString(stage.stage),
        phase: asString(stage.phase),
        elapsedMs: typeof stage.elapsedMs === "number" ? stage.elapsedMs : null,
        executorElapsedMs:
          typeof stage.executorElapsedMs === "number" ? stage.executorElapsedMs : null,
        executionClass: asString(stage.executionClass),
        schedulerClass: asString(stage.schedulerClass),
        schedulingMode: asString(stage.schedulingMode),
        eventTime: asString(stage.eventTime),
      }))
      .slice(-40),
    latestEvents: asArray(live.latestEvents)
      .filter(isRecord)
      .map((event) => ({
        eventType: asString(event.eventType),
        eventTime: asString(event.eventTime),
        stage: asString(event.stage),
        currentPhase: asString(event.currentPhase),
        elapsedMs: typeof event.elapsedMs === "number" ? event.elapsedMs : null,
        executorElapsedMs:
          typeof event.executorElapsedMs === "number" ? event.executorElapsedMs : null,
        executionClass: asString(event.executionClass),
        schedulerClass: asString(event.schedulerClass),
        schedulingMode: asString(event.schedulingMode),
        agentId: asString(event.agentId),
        provider: asString(event.provider),
        model: asString(event.model),
        toolName: asString(event.toolName),
        status: asString(event.status),
        errorCode: asString(event.errorCode),
        errorName: asString(event.errorName),
        errorMessage: asString(event.errorMessage),
      }))
      .slice(-20),
  };
}

function isRuntimeJobTerminal(state) {
  return (
    state === "succeeded" || state === "failed" || state === "canceled" || state === "timed_out"
  );
}

function shouldStopForPreProviderStale(live, elapsedMs) {
  if (live.modelActivitySeen || live.providerRequestSeen) {
    return false;
  }
  if (isRuntimeJobTerminal(live.runtimeJobState)) {
    return false;
  }
  const staleMs = live.latestMeaningfulEventAgeMs ?? elapsedMs;
  return staleMs >= residentProofPreProviderStaleMs;
}

async function pollResidentGatewayProofRun({ gatewayBaseUrl, runtimeJobId, proofTimings }) {
  const polls = [];
  const startedAtMs = Date.now();
  let lastPrintedPhase = null;
  let lastPrintedAtMs = 0;
  let finalStatus = null;
  while (true) {
    const statusStartedAt = Date.now();
    const status = await postGatewayJson(
      gatewayBaseUrl,
      "/api/execution-platform/execution/status",
      {
        auth: nativeProofAuth(),
        runtimeJobId,
      },
      { timeoutMs: 15_000 },
    );
    proofTimings.push({
      stage: "gateway_native_status_poll",
      elapsedMs: Date.now() - statusStartedAt,
      recordedAt: new Date().toISOString(),
    });
    const statusSummary = compactGatewayJson(status.json);
    const live = compactLiveStatus(status.json);
    finalStatus = { response: status, summary: statusSummary, live };
    const elapsedMs = Date.now() - startedAtMs;
    const poll = {
      recordedAt: new Date().toISOString(),
      elapsedMs,
      statusCode: status.statusCode,
      ok: status.ok,
      runtimeJobState: statusSummary.runtimeJobState ?? live.runtimeJobState,
      currentPhase: live.currentPhase,
      latestLaunchPhase: live.latestLaunchPhase,
      latestStageLabel: live.latestStageLabel,
      latestMeaningfulEventAgeMs: live.latestMeaningfulEventAgeMs,
      modelActivitySeen: live.modelActivitySeen,
      providerRequestSeen: live.providerRequestSeen,
      eventCounts: live.eventCounts,
    };
    polls.push(poll);
    if (
      poll.currentPhase !== lastPrintedPhase ||
      Date.now() - lastPrintedAtMs >= 15_000 ||
      isRuntimeJobTerminal(poll.runtimeJobState)
    ) {
      console.log(
        JSON.stringify({
          event: "native_orchestration_proof_live_status",
          proofRunId,
          runtimeJobId,
          ...poll,
        }),
      );
      lastPrintedPhase = poll.currentPhase;
      lastPrintedAtMs = Date.now();
    }
    if (isRuntimeJobTerminal(poll.runtimeJobState)) {
      return {
        status: "terminal",
        polls,
        finalStatus,
        reasonCodes: [`runtime_job_state:${poll.runtimeJobState}`],
      };
    }
    if (shouldStopForPreProviderStale(live, elapsedMs)) {
      const cancelStartedAt = Date.now();
      const cancel = await postGatewayJson(
        gatewayBaseUrl,
        "/api/execution-platform/execution/apply-control",
        {
          auth: nativeProofAuth(),
          actionKind: "cancel",
          actionId: `native-orchestration-proof-pre-provider-stale-${proofRunId}`,
          workItemId: proofTargetWorkItemId,
          runtimeJobId,
          metadata: {
            reason: "native_orchestration_proof_pre_provider_stale",
            currentPhase: live.currentPhase,
            latestLaunchPhase: live.latestLaunchPhase,
            latestStageLabel: live.latestStageLabel,
            latestMeaningfulEventAgeMs: live.latestMeaningfulEventAgeMs,
          },
        },
        { timeoutMs: 15_000 },
      );
      proofTimings.push({
        stage: "gateway_native_cancel_pre_provider_stale",
        elapsedMs: Date.now() - cancelStartedAt,
        recordedAt: new Date().toISOString(),
      });
      return {
        status: "pre_provider_stale",
        polls,
        finalStatus,
        cancel: compactGatewayJson(cancel.json),
        reasonCodes: [
          "native_orchestration_proof_pre_provider_stale",
          live.currentPhase ? `stuck_phase:${live.currentPhase}` : "stuck_phase:unknown",
        ],
      };
    }
    if (elapsedMs >= residentProofMaxRuntimeMs) {
      return {
        status: "max_runtime_elapsed",
        polls,
        finalStatus,
        reasonCodes: ["native_orchestration_proof_max_runtime_elapsed"],
      };
    }
    await sleep(residentProofPollIntervalMs);
  }
}

function lifecycleChanged(before, after) {
  if (!before || !after) {
    return before !== after;
  }
  for (const key of ["lifecycleState", "queueStatus", "queueRank", "currentVersionId"]) {
    if (before[key] !== after[key]) {
      return true;
    }
  }
  return false;
}

function buildProofRequest() {
  const refs = [
    `work-queue://item/${proofTargetWorkItemId}`,
    "docs/projects/execution-platform/specs/runtime-artifact-contract-registry-and-payload-boundary.md",
    "docs/projects/execution-platform/specs/runtime-artifact-payload-store-and-bounded-manifests.md",
    "docs/projects/execution-platform/specs/observability-safety-and-artifacts.md",
    "extensions/execution-platform/src/runtime-artifact-contracts.ts",
    "extensions/execution-platform/src/runtime-job-repository.ts",
  ];
  const constraints = [
    "Use native execution sessions. The orchestrator may delegate implementation, validation, and critique through start_execution_session.",
    "Keep the work target on runtime artifact retention/pruning policy. Do not modify native orchestration, agent prompt/profile, scheduler, or proof-harness architecture unless a tiny support change is required by validation.",
    "Do not mutate Work Queue lifecycle for this item. The proof harness will compare lifecycle before and after.",
    "Do not store raw prompts, raw provider logs, raw tool logs, raw command logs, secrets, or unbounded logs.",
    "Prefer a small source change with focused tests over broad refactors.",
    "Finish through node_finish only after validation and critique evidence are present.",
  ];
  const validationSignal =
    "Run focused tests for runtime artifact contracts/repository surfaces, at minimum `pnpm test:file extensions/execution-platform/src/runtime-job-repository.test.ts extensions/execution-platform/src/runtime-artifact-contracts.test.ts`, plus any directly touched tests.";
  const objective = [
    `Implement Work Queue item ${proofTargetWorkItemId}: ${proofTargetTitle}.`,
    "",
    "The implementation target is runtime artifact retention/pruning policy by contract domain. Add or refine the source/runtime contract needed for payload-backed runtime artifacts to carry clear retention/pruning policy metadata and be validated/read back safely. Preserve the existing raw-storage safety flags.",
    "",
    "Expected outcome: a scoped implementation with focused tests that proves retention/pruning policy metadata is explicit, bounded, and does not delete or hide active execution evidence.",
    "",
    "This proof is about native orchestration behavior, but the implementation work is not about orchestration. Do not change orchestration mechanics as part of the target unless validation proves a tiny support fix is required.",
  ].join("\n");
  return {
    objective,
    refs,
    constraints,
    validationSignal,
  };
}

async function postGatewayJson(baseUrl, routePath, body, options = {}) {
  const timeoutMs = Math.max(1_000, options.timeoutMs ?? 30_000);
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(new Error(`gateway request timed out after ${timeoutMs}ms`));
  }, timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${routePath}`, {
      method: "POST",
      headers: gatewayHeaders(),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { parseError: true, bodyHash: sha256(text), bodyLength: text.length };
    }
    return {
      ok: response.ok,
      statusCode: response.status,
      json,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function handleProofProcessSignal(signal) {
  if (shutdownStarted) {
    return;
  }
  shutdownStarted = true;
  try {
    if (residentGatewayBaseUrl && activeRuntimeJobId) {
      await postGatewayJson(
        residentGatewayBaseUrl,
        "/api/execution-platform/execution/apply-control",
        {
          auth: nativeProofAuth(),
          actionKind: "cancel",
          actionId: `native-orchestration-proof-${signal.toLowerCase()}`,
          workItemId: proofTargetWorkItemId,
          runtimeJobId: activeRuntimeJobId,
          metadata: {
            reason: `operator_stopped_native_orchestration_proof:${signal}`,
          },
        },
      );
    }
  } catch {
    // Signal cleanup must still write the local terminal artifact.
  }
  const artifact = writeJson("native-orchestration-proof-error.json", {
    artifactKind: "openclaw.native_orchestration_proof_error",
    proofRunId,
    proofSourceKind: "resident_gateway_native_rpc",
    proofTarget: {
      workItemId: proofTargetWorkItemId,
      title: proofTargetTitle,
      nonRecursiveTarget: true,
    },
    accepted: false,
    interruptedBySignal: signal,
    activeRuntimeJobId,
    reasonCodes: ["native_orchestration_proof_interrupted_by_operator"],
    safety: {
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      secretsStored: false,
    },
  });
  console.error(
    JSON.stringify({
      event: "native_orchestration_proof_interrupted",
      proofRunId,
      signal,
      runtimeJobId: activeRuntimeJobId,
      artifact: artifact.path,
    }),
  );
  process.exit(signal === "SIGINT" ? 130 : 143);
}

process.once("SIGINT", () => {
  void handleProofProcessSignal("SIGINT");
});
process.once("SIGTERM", () => {
  void handleProofProcessSignal("SIGTERM");
});

async function runResidentGatewayProof(runStartedAt, loadedDotenvRefs, gatewayBaseUrl) {
  const request = buildProofRequest();
  const requestHash = sha256Json({
    objective: request.objective,
    refs: request.refs,
    constraints: request.constraints,
    validationSignal: request.validationSignal,
  });
  const proofTimings = [];
  const markTiming = (stage, startedAtMs) => {
    proofTimings.push({
      stage,
      elapsedMs: Date.now() - startedAtMs,
      recordedAt: new Date().toISOString(),
    });
  };

  const beforeStartedAt = Date.now();
  const workItemBeforeResponse = await postGatewayJson(
    gatewayBaseUrl,
    "/api/execution-platform/work-queue/detail",
    {
      auth: nativeProofAuth(),
      workItemId: proofTargetWorkItemId,
    },
  );
  markTiming("gateway_work_queue_before_detail", beforeStartedAt);
  const workItemBefore = compactWorkQueueDetailResponse(workItemBeforeResponse.json);
  if (!workItemBeforeResponse.ok || !workItemBefore) {
    throw new Error(`resident_gateway_work_item_before_missing:${proofTargetWorkItemId}`);
  }

  const nativeReadyStartedAt = Date.now();
  const nativeReady = await postGatewayJson(
    gatewayBaseUrl,
    "/api/execution-platform/execution/native-readyz",
    {
      auth: nativeProofAuth(),
      sourceRoute: "service",
    },
  );
  markTiming("gateway_native_readyz", nativeReadyStartedAt);
  const nativeReadyBody = isRecord(nativeReady.json) ? nativeReady.json : {};
  console.log(
    JSON.stringify({
      event: "native_orchestration_proof_resident_native_readyz",
      proofRunId,
      statusCode: nativeReady.statusCode,
      accepted: nativeReadyBody.accepted === true,
      status: asString(nativeReadyBody.status),
      configSnapshotId: asString(nativeReadyBody.configSnapshotId),
      catalogSnapshotId: asString(nativeReadyBody.catalogSnapshotId),
      requestHash,
    }),
  );
  if (!nativeReady.ok || nativeReadyBody.accepted !== true) {
    const artifact = writeJson("native-orchestration-proof-error.json", {
      artifactKind: "openclaw.native_orchestration_proof_error",
      proofRunId,
      proofSourceKind: "resident_gateway_native_rpc",
      status: "failed",
      reasonCodes: [
        "native_orchestration_proof_native_readyz_failed",
        ...asArray(nativeReadyBody.reasonCodes)
          .filter((value) => typeof value === "string")
          .slice(0, 20),
      ],
      requestHash,
      nativeReady: compactGatewayJson(nativeReady.json),
      nativeReadyStatus: {
        status: asString(nativeReadyBody.status),
        configSnapshotId: asString(nativeReadyBody.configSnapshotId),
        catalogSnapshotId: asString(nativeReadyBody.catalogSnapshotId),
        runtimeRoots: isRecord(nativeReadyBody.runtimeRoots) ? nativeReadyBody.runtimeRoots : null,
        agentCheckCount: asArray(nativeReadyBody.agentChecks).length,
        assetCheckCount: asArray(nativeReadyBody.assetChecks).length,
      },
      workItemBefore,
      proofTimings,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      secretsStored: false,
    });
    throw new Error(`native_orchestration_proof_native_readyz_failed:${artifact.path}`);
  }

  const startSessionStartedAt = Date.now();
  const startSession = await postGatewayJson(
    gatewayBaseUrl,
    "/api/execution-platform/execution/start-session",
    {
      auth: nativeProofAuth(),
      objective: request.objective,
      refs: request.refs,
      constraints: request.constraints,
      validationSignal: request.validationSignal,
      workItemId: proofTargetWorkItemId,
      queueName,
      agentProfile: orchestratorAgentProfile,
      idempotencyScope: "openclaw.native-orchestration-proof",
      idempotencyKey: proofRunId,
      sourceRoute: "service",
    },
  );
  markTiming("gateway_native_start_session", startSessionStartedAt);
  const startSessionBody = isRecord(startSession.json) ? startSession.json : {};
  const runtimeJobId = asString(startSessionBody.runtimeJobId);
  activeRuntimeJobId = runtimeJobId;
  console.log(
    JSON.stringify({
      event: "native_orchestration_proof_resident_start_session",
      proofRunId,
      runtimeJobId,
      statusCode: startSession.statusCode,
      accepted: startSessionBody.accepted === true,
      requestHash,
    }),
  );
  if (!startSession.ok || startSessionBody.accepted !== true || !runtimeJobId) {
    const artifact = writeJson("native-orchestration-proof-error.json", {
      artifactKind: "openclaw.native_orchestration_proof_error",
      proofRunId,
      proofSourceKind: "resident_gateway_native_rpc",
      proofTarget: {
        workItemId: proofTargetWorkItemId,
        title: proofTargetTitle,
        nonRecursiveTarget: true,
      },
      accepted: false,
      runStartedAt: runStartedAt.toISOString(),
      runCompletedAt: new Date().toISOString(),
      loadedDotenvRefs,
      request: {
        objectiveHash: sha256(request.objective),
        requestHash,
        refCount: request.refs.length,
        refs: request.refs,
        constraintCount: request.constraints.length,
        validationSignalHash: sha256(request.validationSignal),
      },
      proofHost: {
        mode: "resident_gateway_native_rpc",
        gatewayBaseUrlConfigured: true,
        coldSourceRuntimeFallback: false,
      },
      proofTimings,
      startSession: compactGatewayJson(startSession.json),
      workQueue: {
        before: workItemBefore,
        after: null,
        lifecycleMutated: false,
      },
      reasonCodes: ["resident_gateway_native_start_session_rejected"],
      safety: {
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        secretsStored: false,
      },
    });
    console.error(
      JSON.stringify({
        event: "native_orchestration_proof_start_session_rejected",
        proofRunId,
        runtimeJobId,
        artifact: artifact.path,
      }),
    );
    process.exitCode = 1;
    return;
  }

  const launchSummary = compactGatewayJson(startSessionBody.launch ?? null);

  const watchResult = await pollResidentGatewayProofRun({
    gatewayBaseUrl,
    runtimeJobId,
    proofTimings,
  });
  const status = watchResult.finalStatus?.response ?? {
    ok: false,
    statusCode: 0,
    json: null,
  };

  const closeoutStartedAt = Date.now();
  const closeout = await postGatewayJson(
    gatewayBaseUrl,
    "/api/execution-platform/execution/closeout",
    {
      auth: nativeProofAuth(),
      runtimeJobId,
    },
    { timeoutMs: 15_000 },
  );
  markTiming("gateway_native_closeout", closeoutStartedAt);

  const afterStartedAt = Date.now();
  const workItemAfterResponse = await postGatewayJson(
    gatewayBaseUrl,
    "/api/execution-platform/work-queue/detail",
    {
      auth: nativeProofAuth(),
      workItemId: proofTargetWorkItemId,
    },
  );
  markTiming("gateway_work_queue_after_detail", afterStartedAt);
  const workItemAfter = compactWorkQueueDetailResponse(workItemAfterResponse.json);
  const workQueueLifecycleMutated = lifecycleChanged(workItemBefore, workItemAfter);
  const statusSummary = watchResult.finalStatus?.summary ?? compactGatewayJson(status.json);
  const accepted =
    startSession.ok &&
    watchResult.status === "terminal" &&
    statusSummary.runtimeJobState === "succeeded" &&
    !workQueueLifecycleMutated;

  const terminalArtifact = writeJson(
    accepted ? "native-orchestration-proof-result.json" : "native-orchestration-proof-error.json",
    {
      artifactKind: accepted
        ? "openclaw.native_orchestration_proof_result"
        : "openclaw.native_orchestration_proof_error",
      proofRunId,
      proofSourceKind: "resident_gateway_native_rpc",
      proofTarget: {
        workItemId: proofTargetWorkItemId,
        title: proofTargetTitle,
        nonRecursiveTarget: true,
      },
      accepted,
      runStartedAt: runStartedAt.toISOString(),
      runCompletedAt: new Date().toISOString(),
      loadedDotenvRefs,
      request: {
        objectiveHash: sha256(request.objective),
        requestHash,
        refCount: request.refs.length,
        refs: request.refs,
        constraintCount: request.constraints.length,
        validationSignalHash: sha256(request.validationSignal),
      },
      proofHost: {
        mode: "resident_gateway_native_rpc",
        gatewayBaseUrlConfigured: true,
        coldSourceRuntimeFallback: false,
      },
      proofTimings,
      startSession: compactGatewayJson(startSession.json),
      launch: launchSummary,
      status: statusSummary,
      liveStatus: watchResult.finalStatus?.live ?? null,
      livePolls: watchResult.polls.slice(-120),
      watchResult: {
        status: watchResult.status,
        reasonCodes: watchResult.reasonCodes,
        cancel: watchResult.cancel ?? null,
      },
      closeout: compactGatewayJson(closeout.json),
      workQueue: {
        before: workItemBefore,
        after: workItemAfter,
        lifecycleMutated: workQueueLifecycleMutated,
      },
      safety: {
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        secretsStored: false,
        workQueueLifecycleMutated,
      },
      reasonCodes: accepted
        ? ["native_orchestration_proof_completed"]
        : [
            ...watchResult.reasonCodes,
            launchSummary.status ? `native_launch_status:${launchSummary.status}` : null,
            statusSummary.runtimeJobState
              ? `runtime_job_state:${statusSummary.runtimeJobState}`
              : "runtime_job_missing",
            workQueueLifecycleMutated ? "work_queue_lifecycle_mutated" : null,
          ].filter(Boolean),
    },
  );
  console.log(
    JSON.stringify({
      event: accepted
        ? "native_orchestration_proof_completed"
        : "native_orchestration_proof_needs_review",
      proofRunId,
      runtimeJobId,
      launchStatus: launchSummary.status,
      finalJobState: statusSummary.runtimeJobState,
      artifact: terminalArtifact.path,
      accepted,
    }),
  );
  if (!accepted) {
    process.exitCode = 1;
  }
}

async function main() {
  const runStartedAt = new Date();
  const loadedDotenvRefs = loadDotenvFiles();
  residentGatewayBaseUrl = normalizeGatewayBaseUrl(
    process.env.OPENCLAW_NATIVE_ORCHESTRATION_PROOF_GATEWAY_URL ||
      process.env.OPENCLAW_GATEWAY_URL ||
      (process.env.OPENCLAW_GATEWAY_PORT
        ? `http://127.0.0.1:${process.env.OPENCLAW_GATEWAY_PORT}`
        : ""),
  );
  if (residentGatewayBaseUrl) {
    await runResidentGatewayProof(runStartedAt, loadedDotenvRefs, residentGatewayBaseUrl);
    return;
  }
  const artifact = writeJson("native-orchestration-proof-error.json", {
    artifactKind: "openclaw.native_orchestration_proof_error",
    proofRunId,
    proofSourceKind: "resident_gateway_required",
    proofTarget: {
      workItemId: proofTargetWorkItemId,
      title: proofTargetTitle,
      nonRecursiveTarget: true,
    },
    accepted: false,
    runStartedAt: runStartedAt.toISOString(),
    runCompletedAt: new Date().toISOString(),
    loadedDotenvRefs,
    proofHost: {
      mode: "resident_gateway_required",
      gatewayBaseUrlConfigured: false,
      coldSourceRuntimeFallback: false,
    },
    reasonCodes: ["resident_gateway_url_required_for_native_orchestration_proof"],
    safety: {
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      secretsStored: false,
    },
  });
  console.error(
    JSON.stringify({
      event: "native_orchestration_proof_resident_gateway_required",
      proofRunId,
      artifact: artifact.path,
    }),
  );
  process.exitCode = 1;
}

await main();
