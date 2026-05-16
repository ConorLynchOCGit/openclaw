#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { tsImport } from "tsx/esm/api";
import { readGatewayToken } from "./lib/operator-browser-harness.mjs";

const artifactRoot = ".artifacts/execution-platform";
const localBase = process.env.OPENCLAW_GATEWAY_LOCAL_BASE_URL?.trim() || "http://127.0.0.1:28789";
const wsUrl = localBase.replace(/^http:/u, "ws:").replace(/^https:/u, "wss:");

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

function writeArtifact(name, value) {
  fs.mkdirSync(artifactRoot, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  const filePath = path.join(artifactRoot, name);
  fs.writeFileSync(filePath, body, "utf8");
  return { path: `${artifactRoot}/${name}`, sha256: sha256(body) };
}

async function boundedFetch(url, options = {}) {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { textHash: sha256(text), textLength: text.length };
    }
    return { ok: response.ok, status: response.status, latencyMs: Date.now() - startedAt, body };
  } catch (error) {
    return {
      ok: false,
      status: null,
      latencyMs: Date.now() - startedAt,
      reasonCode: error?.name === "AbortError" ? "timeout" : "fetch_failed",
      errorHash: sha256(error instanceof Error ? error.message : String(error)),
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForEventCount(events, predicate, minimumCount, timeoutMs = 60_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const matching = events.filter(predicate);
    if (matching.length >= minimumCount) {
      return matching;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return events.filter(predicate);
}

async function waitForGatewayReady(timeoutMs = 90_000) {
  const startedAt = Date.now();
  let localHealth = await boundedFetch(`${localBase}/healthz`);
  let localReady = await boundedFetch(`${localBase}/readyz`);
  while (Date.now() - startedAt < timeoutMs && !(localHealth.ok && localReady.ok)) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    localHealth = await boundedFetch(`${localBase}/healthz`);
    localReady = await boundedFetch(`${localBase}/readyz`);
  }
  return { localHealth, localReady };
}

async function createGatewayClient(input) {
  const { GatewayClient } = await tsImport("../src/gateway/client.ts", import.meta.url);
  const { deviceIdentity, token, clientPlatform, scopes, events, clientVersion } = input;
  let helloPayload = null;
  const client = await new Promise((resolve, reject) => {
    const gatewayClient = new GatewayClient({
      url: wsUrl,
      token,
      deviceIdentity,
      clientName: "gateway-client",
      clientVersion,
      platform: clientPlatform,
      mode: "backend",
      role: "operator",
      scopes,
      caps: ["tool-events"],
      requestTimeoutMs: 20_000,
      onHelloOk: (hello) => {
        helloPayload = hello;
        resolve(gatewayClient);
      },
      onConnectError: reject,
      onEvent: (event) => {
        events.push({ ...event, receivedAt: new Date().toISOString(), subscriber: clientVersion });
      },
    });
    gatewayClient.start();
    setTimeout(() => reject(new Error("gateway_hello_timeout")), 20_000).unref?.();
  });
  return { client, helloPayload };
}

async function ensureGatewayPairing() {
  const { loadOrCreateDeviceIdentity, publicKeyRawBase64UrlFromPem } = await tsImport(
    "../src/infra/device-identity.ts",
    import.meta.url,
  );
  const { approveDevicePairing, getPairedDevice, requestDevicePairing } = await tsImport(
    "../src/infra/device-pairing.ts",
    import.meta.url,
  );
  const deviceIdentity = loadOrCreateDeviceIdentity();
  const publicKey = publicKeyRawBase64UrlFromPem(deviceIdentity.publicKeyPem);
  const clientName = "gateway-client";
  const clientMode = "backend";
  const clientPlatform = process.platform;
  const scopes = ["operator.admin"];
  const paired = await getPairedDevice(deviceIdentity.deviceId);
  const pairedScopes = Array.isArray(paired?.approvedScopes)
    ? paired.approvedScopes
    : Array.isArray(paired?.scopes)
      ? paired.scopes
      : [];
  const pairingCurrent =
    paired?.publicKey === publicKey &&
    paired?.clientId === clientName &&
    paired?.clientMode === clientMode &&
    scopes.every((scope) => pairedScopes.includes(scope));
  if (!pairingCurrent) {
    const pairing = await requestDevicePairing({
      deviceId: deviceIdentity.deviceId,
      publicKey,
      displayName: "work queue parallel event stream proof",
      platform: clientPlatform,
      clientId: clientName,
      clientMode,
      role: "operator",
      scopes,
      silent: true,
    });
    const approved = await approveDevicePairing(pairing.request.requestId, {
      callerScopes: scopes,
    });
    if (approved?.status !== "approved") {
      throw new Error(
        `gateway_pairing_approval_failed:${approved?.status ?? "missing-approval-result"}`,
      );
    }
  }
  return { deviceIdentity, clientPlatform, scopes };
}

async function createBaseGraph() {
  const {
    createExecutionPlatformDatabaseRuntime,
    HumanOperatorTaskAdapter,
    RuntimeJobRepository,
    RuntimeWorkGraphRepository,
    WorkQueueEventStore,
    WorkQueueRepository,
  } = await import("../dist/extensions/execution-platform/runtime-api.js");
  const runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: true });
  const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient, { claimStrategy: "basic" });
  const eventStore = new WorkQueueEventStore(runtime.sqlClient);
  const workQueue = new WorkQueueRepository(runtime.sqlClient, runtimeJobs, { eventStore });
  const runtimeWorkGraphs = new RuntimeWorkGraphRepository(runtime.sqlClient);
  const runId = `parallel-event-stream-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const parentWorkItemId = `${runId}-parent`;
  const runtimeJob = await runtimeJobs.enqueueJob({
    jobId: `${runId}-runtime-job`,
    jobType: "executor.agent_team",
    workItemId: parentWorkItemId,
    payload: {
      workflowId: "agent_team.coding",
      boundedSummary: "Parallel Work Queue event stream stress proof.",
      rawPromptStored: false,
      rawResponseStored: false,
    },
    leaseTimeoutMs: 120_000,
    runTimeoutMs: 600_000,
  });
  await workQueue.createWorkItem({
    workItemId: parentWorkItemId,
    itemType: "execution_workflow",
    title: `Parallel Event Stream Stress Parent ${runId}`,
    description:
      "Controlled live-equivalent parent proving DB outbox push, replay, graph progress, human task resume, and closed rollup.",
    metadata: { proofRunId: runId, rawPromptStored: false, rawResponseStored: false },
  });
  await workQueue.createWorkRun({
    workItemId: parentWorkItemId,
    executorKind: "runtime_job",
    runtimeJobId: runtimeJob.jobId,
    runState: "running",
    metadata: { proofRunId: runId, workQueueLifecycleMutated: false },
  });
  const graph = await runtimeWorkGraphs.createGraph({
    graphId: `${runId}-graph`,
    parentWorkItemId,
    rootRuntimeJobId: runtimeJob.jobId,
    workflowId: "agent_team.coding",
    orchestratorModelRef: "openai-codex/gpt-5.5",
    graphStatus: "running",
    metadata: { proofRunId: runId, parallelEventStreamStressProof: true },
  });
  const humanTaskAdapter = new HumanOperatorTaskAdapter(runtimeWorkGraphs);

  return {
    runtime,
    runtimeJobs,
    workQueue,
    runtimeWorkGraphs,
    humanTaskAdapter,
    runId,
    parentWorkItemId,
    graphId: graph.graphId,
    runtimeJobId: runtimeJob.jobId,
  };
}

async function emitParallelGraphWave(base) {
  const nodeResults = [];
  const closeoutRef = `closeout-capsule://${base.graphId}/parallel-event-stream`;
  for (let index = 0; index < 8; index += 1) {
    const nodeId = `implementation-${index}`;
    nodeResults.push(
      await base.workQueue.syncRuntimeGraphNodeToWorkQueue({
        parentWorkItemId: base.parentWorkItemId,
        graphId: base.graphId,
        nodeId,
        nodeKind: "implementation",
        assignedRole:
          index % 2 === 0 ? "kimi_implementation_engineer" : "codex_implementation_engineer",
        assignedWorkflow: "agent_team.coding",
        queueStatus: "active",
        runtimeJobId: base.runtimeJobId,
        title: `Parallel implementation ${index} ${base.runId}`,
        evidenceRefs: [`runtime-work-graph://${base.graphId}/node/${nodeId}/started`],
      }),
    );
  }
  for (let index = 0; index < 4; index += 1) {
    const nodeId = `validation-${index}`;
    nodeResults.push(
      await base.workQueue.syncRuntimeGraphNodeToWorkQueue({
        parentWorkItemId: base.parentWorkItemId,
        graphId: base.graphId,
        nodeId,
        nodeKind: "validation",
        assignedRole: "test_engineer",
        assignedWorkflow: "qa.test",
        queueStatus: "active",
        runtimeJobId: base.runtimeJobId,
        title: `Parallel validation ${index} ${base.runId}`,
        evidenceRefs: [`runtime-work-graph://${base.graphId}/node/${nodeId}/started`],
      }),
    );
  }
  for (let index = 0; index < 4; index += 1) {
    const nodeId = `repair-${index}`;
    nodeResults.push(
      await base.workQueue.syncRuntimeGraphNodeToWorkQueue({
        parentWorkItemId: base.parentWorkItemId,
        graphId: base.graphId,
        nodeId,
        nodeKind: "repair",
        assignedRole: "implementation_engineer",
        assignedWorkflow: "agent_team.coding",
        queueStatus: "active",
        runtimeJobId: base.runtimeJobId,
        title: `Parallel repair ${index} ${base.runId}`,
        evidenceRefs: [`runtime-work-graph://${base.graphId}/node/${nodeId}/started`],
      }),
    );
  }
  const humanTasks = [];
  for (let index = 0; index < 4; index += 1) {
    const human = await base.humanTaskAdapter.createTask({
      graphId: base.graphId,
      operatorId: "owner:local",
      promptSummary: `Approve bounded parallel event stream decision ${index}.`,
      requiredResponseShape: { type: "object", required: ["decision"] },
      blockingNodeRefs: [`runtime-work-graph://${base.graphId}/node/implementation-${index}`],
    });
    humanTasks.push(human.humanTask);
    nodeResults.push(
      await base.workQueue.syncRuntimeGraphNodeToWorkQueue({
        parentWorkItemId: base.parentWorkItemId,
        graphId: base.graphId,
        nodeId: human.node.nodeId,
        nodeKind: "human_task",
        assignedRole: "human_operator",
        assignedWorkflow: "human/operator",
        queueStatus: "blocked",
        humanTaskId: human.humanTask.humanTaskId,
        runtimeJobId: base.runtimeJobId,
        title: `Human operator decision ${index} ${base.runId}`,
        evidenceRefs: [
          `runtime-work-graph://${base.graphId}/human-task/${human.humanTask.humanTaskId}`,
        ],
        blockerReasonCodes: ["human_operator_input_required"],
      }),
    );
  }
  nodeResults.push(
    await base.workQueue.syncRuntimeGraphNodeToWorkQueue({
      parentWorkItemId: base.parentWorkItemId,
      graphId: base.graphId,
      nodeId: "closeout-0",
      nodeKind: "closeout",
      assignedRole: "orchestrator",
      assignedWorkflow: "agent_team.coding",
      queueStatus: "active",
      runtimeJobId: base.runtimeJobId,
      title: `Parallel closeout ${base.runId}`,
      evidenceRefs: [`runtime-work-graph://${base.graphId}/node/closeout-0/started`],
    }),
  );

  for (let index = 0; index < 8; index += 1) {
    const nodeId = `implementation-${index}`;
    nodeResults.push(
      await base.workQueue.syncRuntimeGraphNodeToWorkQueue({
        parentWorkItemId: base.parentWorkItemId,
        graphId: base.graphId,
        nodeId,
        nodeKind: "implementation",
        assignedRole:
          index % 2 === 0 ? "kimi_implementation_engineer" : "codex_implementation_engineer",
        assignedWorkflow: "agent_team.coding",
        queueStatus: "closed",
        runtimeJobId: base.runtimeJobId,
        title: `Parallel implementation ${index} ${base.runId}`,
        evidenceRefs: [`artifact://parallel-event-stream/${base.runId}/implementation-${index}`],
      }),
    );
  }
  for (let index = 0; index < 4; index += 1) {
    const nodeId = `validation-${index}`;
    nodeResults.push(
      await base.workQueue.syncRuntimeGraphNodeToWorkQueue({
        parentWorkItemId: base.parentWorkItemId,
        graphId: base.graphId,
        nodeId,
        nodeKind: "validation",
        assignedRole: "test_engineer",
        assignedWorkflow: "qa.test",
        queueStatus: index === 0 ? "needs_review" : "closed",
        runtimeJobId: base.runtimeJobId,
        title: `Parallel validation ${index} ${base.runId}`,
        evidenceRefs: [`artifact://parallel-event-stream/${base.runId}/validation-${index}`],
        blockerReasonCodes: index === 0 ? ["intentional_validation_failure_for_replay"] : [],
      }),
    );
    if (index === 0) {
      nodeResults.push(
        await base.workQueue.syncRuntimeGraphNodeToWorkQueue({
          parentWorkItemId: base.parentWorkItemId,
          graphId: base.graphId,
          nodeId,
          nodeKind: "validation",
          assignedRole: "test_engineer",
          assignedWorkflow: "qa.test",
          queueStatus: "closed",
          runtimeJobId: base.runtimeJobId,
          title: `Parallel validation ${index} ${base.runId}`,
          evidenceRefs: [
            `artifact://parallel-event-stream/${base.runId}/validation-${index}-repaired`,
          ],
        }),
      );
    }
  }
  for (let index = 0; index < 4; index += 1) {
    const nodeId = `repair-${index}`;
    nodeResults.push(
      await base.workQueue.syncRuntimeGraphNodeToWorkQueue({
        parentWorkItemId: base.parentWorkItemId,
        graphId: base.graphId,
        nodeId,
        nodeKind: "repair",
        assignedRole: "implementation_engineer",
        assignedWorkflow: "agent_team.coding",
        queueStatus: "closed",
        runtimeJobId: base.runtimeJobId,
        title: `Parallel repair ${index} ${base.runId}`,
        evidenceRefs: [`artifact://parallel-event-stream/${base.runId}/repair-${index}`],
      }),
    );
  }
  nodeResults.push(
    await base.workQueue.syncRuntimeGraphNodeToWorkQueue({
      parentWorkItemId: base.parentWorkItemId,
      graphId: base.graphId,
      nodeId: "closeout-0",
      nodeKind: "closeout",
      assignedRole: "orchestrator",
      assignedWorkflow: "agent_team.coding",
      queueStatus: "closed",
      runtimeJobId: base.runtimeJobId,
      title: `Parallel closeout ${base.runId}`,
      evidenceRefs: [closeoutRef],
    }),
  );

  return { nodeResults, humanTasks, closeoutRef };
}

async function main() {
  const preflight = await waitForGatewayReady();
  if (!preflight.localHealth.ok || !preflight.localReady.ok) {
    writeArtifact("work-queue-parallel-event-stream-preflight.json", {
      artifactKind: "work_queue_parallel_event_stream_preflight",
      preflight,
      accepted: false,
      reasonCodes: ["gateway_health_not_ready"],
    });
    throw new Error("gateway_health_not_ready");
  }

  const token = readGatewayToken();
  const pairing = await ensureGatewayPairing();
  const base = await createBaseGraph();
  const parentEvents = [];
  const graphEvents = [];
  const parentClient = await createGatewayClient({
    token,
    events: parentEvents,
    clientVersion: "work-queue-parallel-parent-sub",
    ...pairing,
  });
  const graphClient = await createGatewayClient({
    token,
    events: graphEvents,
    clientVersion: "work-queue-parallel-graph-sub",
    ...pairing,
  });

  const parentSubscribe = await parentClient.client.request("work_queue.subscribe", {
    parentWorkItemId: base.parentWorkItemId,
  });
  const graphSubscribe = await graphClient.client.request("work_queue.subscribe", {
    graphId: base.graphId,
  });
  const latestBeforeWave = await base.workQueue
    .listDbWorkQueue({ bucket: "all", searchQuery: base.runId, limit: 20 })
    .then((result) => result.deltaCursor);
  const wave = await emitParallelGraphWave(base);

  const humanResponse = await boundedFetch(
    `${localBase}/api/execution-platform/work-queue/human-response`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-openclaw-source-route": "parallel-event-stream-proof",
        "x-openclaw-session-key": "agent:main:main",
        "x-openclaw-actor-id": "control-ui-operator",
      },
      body: JSON.stringify({
        parentWorkItemId: base.parentWorkItemId,
        graphId: base.graphId,
        humanTaskId: wave.humanTasks[0]?.humanTaskId,
        boundedResponseRef: `owner-decision://parallel-event-stream/${base.runId}/approved`,
      }),
    },
  );
  for (const humanTask of wave.humanTasks.slice(1)) {
    await base.workQueue.syncRuntimeGraphNodeToWorkQueue({
      parentWorkItemId: base.parentWorkItemId,
      graphId: base.graphId,
      nodeId: humanTask.nodeId,
      nodeKind: "human_task",
      assignedRole: "human_operator",
      assignedWorkflow: "human/operator",
      queueStatus: "closed",
      humanTaskId: humanTask.humanTaskId,
      runtimeJobId: base.runtimeJobId,
      title: `Human operator decision resumed ${base.runId}`,
      evidenceRefs: [
        `owner-decision://parallel-event-stream/${base.runId}/${humanTask.humanTaskId}`,
      ],
    });
  }
  const parentRollup = await base.workQueue.rollupParentWorkQueueStatus({
    parentWorkItemId: base.parentWorkItemId,
    finalCloseoutRef: wave.closeoutRef,
  });
  const closeoutTransition = await base.workQueue.completeWorkQueueItemFromCloseout({
    workItemId: base.parentWorkItemId,
    runtimeJobId: base.runtimeJobId,
    closeoutRef: wave.closeoutRef,
    validationRef: `artifact://parallel-event-stream/${base.runId}/validation-summary`,
    graphRef: `runtime-work-graph://${base.graphId}`,
    ownerReadbackRef: `work-queue-readback://${base.parentWorkItemId}`,
    validationRequired: true,
    sourceEditRequired: false,
    accepted: true,
    changedFileRefs: [],
    artifactRefs: [
      `runtime-work-graph://${base.graphId}`,
      `work-queue-readback://${base.parentWorkItemId}`,
    ],
  });

  const pushedParent = await waitForEventCount(
    parentEvents,
    (frame) =>
      frame.type === "event" &&
      frame.event === "work_queue.changed" &&
      frame.payload?.parentWorkItemId === base.parentWorkItemId,
    40,
  );
  const pushedGraph = await waitForEventCount(
    graphEvents,
    (frame) =>
      frame.type === "event" &&
      frame.event === "work_queue.changed" &&
      frame.payload?.graphId === base.graphId,
    40,
  );
  const allPushed = [...pushedParent, ...pushedGraph];
  const eventTypes = [
    ...new Set(allPushed.map((frame) => frame.payload?.eventType).filter(Boolean)),
  ].toSorted((left, right) => String(left).localeCompare(String(right)));
  const lastCursor = Math.max(
    0,
    ...allPushed.map((frame) =>
      typeof frame.payload?.cursor === "number" ? frame.payload.cursor : 0,
    ),
  );
  const replay = await parentClient.client.request("work_queue.events.replay", {
    afterCursor: Math.max(0, lastCursor - 25),
    parentWorkItemId: base.parentWorkItemId,
    limit: 200,
  });
  const list = await boundedFetch(`${localBase}/api/execution-platform/work-queue/list`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-openclaw-source-route": "parallel-event-stream-proof",
    },
    body: JSON.stringify({ bucket: "all", searchQuery: base.runId, limit: 50 }),
  });
  const detail = await boundedFetch(`${localBase}/api/execution-platform/work-queue/detail`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-openclaw-source-route": "parallel-event-stream-proof",
    },
    body: JSON.stringify({ workItemId: base.parentWorkItemId }),
  });
  const delta = await boundedFetch(`${localBase}/api/execution-platform/work-queue/delta`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-openclaw-source-route": "parallel-event-stream-proof",
    },
    body: JSON.stringify({ bucket: "all", updatedSince: latestBeforeWave, limit: 100 }),
  });

  await parentClient.client.stopAndWait({ timeoutMs: 5_000 });
  await graphClient.client.stopAndWait({ timeoutMs: 5_000 });

  const requiredEventTypes = [
    "work_queue.child_created",
    "work_queue.child_updated",
    "work_queue.active_worker_changed",
    "work_queue.role_invocation_started",
    "work_queue.role_invocation_completed",
    "work_queue.validation_failed",
    "work_queue.validation_passed",
    "work_queue.repair_started",
    "work_queue.repair_completed",
    "work_queue.human_task_blocked",
    "work_queue.human_task_resumed",
    "work_queue.closeout_started",
    "work_queue.closeout_accepted",
  ];
  const missingEventTypes = requiredEventTypes.filter(
    (eventType) => !eventTypes.includes(eventType),
  );
  const detailExecution = detail.body?.item?.execution ?? null;
  const runtimeGraph = detailExecution?.runtimeGraph ?? null;
  const summary = {
    artifactKind: "work_queue_parallel_event_stream_live_proof",
    preflight,
    gatewayConnected: Boolean(
      parentClient.helloPayload?.auth?.deviceToken && graphClient.helloPayload?.auth?.deviceToken,
    ),
    deviceIdentityPreserved: true,
    subscribers: {
      parentSubscribed: parentSubscribe?.subscribed === true,
      graphSubscribed: graphSubscribe?.subscribed === true,
      parentPushedEventCount: pushedParent.length,
      graphPushedEventCount: pushedGraph.length,
    },
    seed: {
      runId: base.runId,
      parentWorkItemId: base.parentWorkItemId,
      graphId: base.graphId,
      runtimeJobId: base.runtimeJobId,
      humanTaskCount: wave.humanTasks.length,
      nodeSyncCount: wave.nodeResults.length,
    },
    eventCoverage: {
      eventTypes,
      requiredEventTypes,
      missingEventTypes,
      requiredEventTypesCovered: missingEventTypes.length === 0,
      replayAccepted: Array.isArray(replay?.events),
      replayEventCount: Array.isArray(replay?.events) ? replay.events.length : 0,
      lastCursor,
    },
    readback: {
      listAccepted: list.ok && list.body?.accepted === true,
      listItemCount: Array.isArray(list.body?.items) ? list.body.items.length : 0,
      deltaAccepted: delta.ok && delta.body?.accepted === true,
      deltaItemCount: Array.isArray(delta.body?.items) ? delta.body.items.length : 0,
      detailAccepted: detail.ok && detail.body?.accepted === true,
      parentQueueStatus: detail.body?.item?.queueStatus ?? null,
      runtimeGraphChildCount: Array.isArray(runtimeGraph?.childActions)
        ? runtimeGraph.childActions.length
        : null,
      runtimeGraphRoleInvocationCount: Array.isArray(runtimeGraph?.roleInvocations)
        ? runtimeGraph.roleInvocations.length
        : null,
      runtimeGraphHumanTaskCount: Array.isArray(runtimeGraph?.humanTasks)
        ? runtimeGraph.humanTasks.length
        : null,
      runtimeGraphValidationRepairCount: Array.isArray(runtimeGraph?.validationRepairLoops)
        ? runtimeGraph.validationRepairLoops.length
        : null,
      ownerProgressState: detailExecution?.ownerProgressReadback?.state ?? null,
      closeoutStatus: detailExecution?.closeoutStatus ?? null,
    },
    transitions: {
      humanResponseAccepted: humanResponse.ok && humanResponse.body?.accepted === true,
      parentRollup,
      closeoutTransition,
    },
    realModelCallsMade: false,
    runtimeJobsCreated: true,
    authorityGranted: false,
    controlsApplied: false,
    workQueueLifecycleMutatedByUi: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    modelPromotionPerformed: false,
  };
  const artifactRef = writeArtifact("work-queue-parallel-event-stream-live-proof.json", summary);
  writeArtifact("work-queue-parallel-event-stream-stress-summary.json", {
    artifactKind: "work_queue_parallel_event_stream_stress_summary",
    summaryArtifactRef: artifactRef.path,
    summaryArtifactHash: artifactRef.sha256,
    passed:
      summary.gatewayConnected &&
      summary.subscribers.parentSubscribed &&
      summary.subscribers.graphSubscribed &&
      summary.subscribers.parentPushedEventCount >= 40 &&
      summary.subscribers.graphPushedEventCount >= 40 &&
      summary.eventCoverage.requiredEventTypesCovered &&
      summary.eventCoverage.replayAccepted &&
      summary.readback.listAccepted &&
      summary.readback.deltaAccepted &&
      summary.readback.detailAccepted &&
      summary.readback.parentQueueStatus === "closed" &&
      (summary.readback.runtimeGraphChildCount ?? 0) >= 20 &&
      summary.transitions.humanResponseAccepted,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  });
  if (
    !summary.gatewayConnected ||
    !summary.subscribers.parentSubscribed ||
    !summary.subscribers.graphSubscribed ||
    summary.subscribers.parentPushedEventCount < 40 ||
    summary.subscribers.graphPushedEventCount < 40 ||
    !summary.eventCoverage.requiredEventTypesCovered ||
    !summary.eventCoverage.replayAccepted ||
    !summary.readback.listAccepted ||
    !summary.readback.deltaAccepted ||
    !summary.readback.detailAccepted ||
    summary.readback.parentQueueStatus !== "closed" ||
    (summary.readback.runtimeGraphChildCount ?? 0) < 20 ||
    !summary.transitions.humanResponseAccepted
  ) {
    throw new Error("work_queue_parallel_event_stream_live_proof_failed");
  }
}

await main();
