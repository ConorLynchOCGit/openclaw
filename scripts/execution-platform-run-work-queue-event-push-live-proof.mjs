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

async function waitForEvent(events, predicate, timeoutMs = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const found = events.find(predicate);
    if (found) {
      return found;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return null;
}

async function seedProofGraph() {
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
  const runId = `wq-event-push-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const parentWorkItemId = `${runId}-parent`;
  const runtimeJob = await runtimeJobs.enqueueJob({
    jobId: `${runId}-runtime-job`,
    jobType: "executor.agent_team",
    workItemId: parentWorkItemId,
    payload: {
      boundedSummary: "Work Queue event push live proof.",
      rawPromptStored: false,
      rawResponseStored: false,
    },
  });
  await workQueue.createWorkItem({
    workItemId: parentWorkItemId,
    itemType: "execution_workflow",
    title: "Work Queue Event Push Live Proof",
    description: "Parent item proving event push, dynamic child updates, human resume, and rollup.",
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
    metadata: { proofRunId: runId, parallelChildEventPushProof: true },
  });
  const human = await new HumanOperatorTaskAdapter(runtimeWorkGraphs).createTask({
    graphId: graph.graphId,
    operatorId: "owner:local",
    promptSummary: "Approve bounded event-push proof resume.",
    requiredResponseShape: { type: "object", required: ["decision"] },
    blockingNodeRefs: [`runtime-work-graph://${graph.graphId}/node/parallel-worker-a`],
  });
  await workQueue.syncRuntimeGraphNodeToWorkQueue({
    parentWorkItemId,
    graphId: graph.graphId,
    nodeId: "parallel-worker-a",
    nodeKind: "implementation",
    assignedRole: "implementation_engineer",
    assignedWorkflow: "agent_team.coding",
    queueStatus: "active",
    runtimeJobId: runtimeJob.jobId,
    evidenceRefs: [`runtime-work-graph://${graph.graphId}/node/parallel-worker-a`],
  });
  await workQueue.syncRuntimeGraphNodeToWorkQueue({
    parentWorkItemId,
    graphId: graph.graphId,
    nodeId: human.node.nodeId,
    nodeKind: "human_task",
    assignedRole: "human_operator",
    assignedWorkflow: "human/operator",
    queueStatus: "blocked",
    humanTaskId: human.humanTask.humanTaskId,
    evidenceRefs: [
      `runtime-work-graph://${graph.graphId}/human-task/${human.humanTask.humanTaskId}`,
    ],
    blockerReasonCodes: ["human_operator_input_required"],
  });
  return {
    runId,
    parentWorkItemId,
    graphId: graph.graphId,
    humanTaskId: human.humanTask.humanTaskId,
    runtimeJobId: runtimeJob.jobId,
  };
}

async function main() {
  const { GatewayClient } = await tsImport("../src/gateway/client.ts", import.meta.url);
  const { loadOrCreateDeviceIdentity, publicKeyRawBase64UrlFromPem } = await tsImport(
    "../src/infra/device-identity.ts",
    import.meta.url,
  );
  const { approveDevicePairing, getPairedDevice, requestDevicePairing } = await tsImport(
    "../src/infra/device-pairing.ts",
    import.meta.url,
  );
  const preflight = {
    localHealth: await boundedFetch(`${localBase}/healthz`),
    localReady: await boundedFetch(`${localBase}/readyz`),
  };
  const seed = await seedProofGraph();
  const token = readGatewayToken();
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
      displayName: "work queue event push proof",
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
  const events = [];
  let helloPayload = null;
  const client = await new Promise((resolve, reject) => {
    const gatewayClient = new GatewayClient({
      url: wsUrl,
      token,
      deviceIdentity,
      clientName,
      clientVersion: "work-queue-event-push-proof",
      platform: clientPlatform,
      mode: clientMode,
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
        events.push(event);
      },
    });
    gatewayClient.start();
    setTimeout(() => reject(new Error("gateway_hello_timeout")), 20_000).unref?.();
  });
  const subscribe = await client.request("work_queue.subscribe", {
    parentWorkItemId: seed.parentWorkItemId,
  });
  if (subscribe?.subscribed !== true) {
    throw new Error(`work_queue_subscribe_failed:${JSON.stringify(subscribe)}`);
  }

  const humanResponse = await boundedFetch(
    `${localBase}/api/execution-platform/work-queue/human-response`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-openclaw-source-route": "ux-proof",
        "x-openclaw-session-key": "agent:main:main",
        "x-openclaw-actor-id": "control-ui-operator",
      },
      body: JSON.stringify({
        parentWorkItemId: seed.parentWorkItemId,
        graphId: seed.graphId,
        humanTaskId: seed.humanTaskId,
        boundedResponseRef: `owner-decision://work-queue-event-push/${seed.runId}/approved`,
      }),
    },
  );
  const pushedEvent = await waitForEvent(
    events,
    (frame) =>
      frame.type === "event" &&
      frame.event === "work_queue.changed" &&
      frame.payload?.parentWorkItemId === seed.parentWorkItemId &&
      frame.payload?.eventType === "work_queue.human_task_resumed",
  );
  const lastCursor =
    typeof pushedEvent?.payload?.cursor === "number" ? pushedEvent.payload.cursor : 0;
  const replay = await client.request("work_queue.events.replay", {
    afterCursor: Math.max(0, lastCursor - 2),
    parentWorkItemId: seed.parentWorkItemId,
    limit: 20,
  });
  const list = await boundedFetch(`${localBase}/api/execution-platform/work-queue/list`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-openclaw-source-route": "ux-proof",
    },
    body: JSON.stringify({ bucket: "all", searchQuery: seed.runId, limit: 20 }),
  });
  await client.stopAndWait({ timeoutMs: 5_000 });

  const pushedEvents = events
    .filter((frame) => frame.event === "work_queue.changed")
    .map((frame) => ({
      eventType: frame.payload?.eventType ?? null,
      cursor: frame.payload?.cursor ?? null,
      workItemId: frame.payload?.workItemId ?? null,
      parentWorkItemId: frame.payload?.parentWorkItemId ?? null,
      rawPromptStored: frame.payload?.rawPromptStored ?? null,
      rawResponseStored: frame.payload?.rawResponseStored ?? null,
    }));
  const summary = {
    artifactKind: "work_queue_event_push_live_proof",
    preflight,
    seed,
    gatewayConnected: true,
    helloDeviceTokenIssued: Boolean(helloPayload?.auth?.deviceToken),
    subscribed: subscribe.subscribed === true,
    humanResponseAccepted: humanResponse.ok && humanResponse.body?.accepted === true,
    pushedEventReceived: Boolean(pushedEvent),
    pushedEvents,
    replayAccepted: Array.isArray(replay?.events),
    replayEventCount: Array.isArray(replay?.events) ? replay.events.length : 0,
    listAccepted: list.ok && list.body?.accepted === true,
    listItemCount: Array.isArray(list.body?.items) ? list.body.items.length : 0,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutated: false,
  };
  writeArtifact("work-queue-event-push-live-proof.json", summary);
  if (!summary.pushedEventReceived || !summary.replayAccepted || !summary.listAccepted) {
    throw new Error("work_queue_event_push_live_proof_failed");
  }
}

await main();
