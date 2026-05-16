#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_TAILNET_ORIGIN,
  OperatorBrowserHarness,
  readGatewayToken,
} from "./lib/operator-browser-harness.mjs";

const artifactRoot = ".artifacts/execution-platform";
const safeBridgeOrigin =
  process.env.OPENCLAW_TAILSCALE_SAFE_UI_BRIDGE_URL?.trim() ||
  process.env.OPENCLAW_SAFE_UI_BRIDGE_URL?.trim() ||
  process.env.OPENCLAW_TAILSCALE_GATEWAY_BASE_URL?.trim() ||
  DEFAULT_TAILNET_ORIGIN;
const localBase = "http://127.0.0.1:28789";

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
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { textHash: sha256(text), textLength: text.length };
    }
    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - startedAt,
      body,
    };
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

async function postJson(pathname, body) {
  const token = readGatewayToken();
  return boundedFetch(`${localBase}${pathname}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-openclaw-source-route": "ux-proof",
      "x-openclaw-session-key": "agent:main:main",
      "x-openclaw-actor-id": "control-ui-operator",
    },
    body: JSON.stringify(body),
  });
}

async function seedRuntimeDb() {
  const {
    createExecutionPlatformDatabaseRuntime,
    HumanOperatorTaskAdapter,
    RuntimeJobRepository,
    RuntimeWorkGraphRepository,
    WorkQueueRepository,
  } = await import("../dist/extensions/execution-platform/runtime-api.js");
  const runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
  const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient, {
    claimStrategy: "basic",
  });
  const workQueue = new WorkQueueRepository(runtime.sqlClient, runtimeJobs);
  const runtimeWorkGraphs = new RuntimeWorkGraphRepository(runtime.sqlClient);
  const runId = `db-runtime-ui-live-proof-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const activeParentId = `${runId}-active-parent`;
  const closedParentId = `${runId}-closed-parent`;
  const runtimeJob = await runtimeJobs.enqueueJob({
    jobId: `${runId}-runtime-job`,
    jobType: "executor.agent_team",
    workItemId: activeParentId,
    payload: {
      workflowId: "agent_team.coding",
      boundedSummary: "Work Queue DB runtime UI live proof job.",
      rawPromptStored: false,
      rawResponseStored: false,
    },
  });
  await workQueue.createWorkItem({
    workItemId: activeParentId,
    itemType: "execution_workflow",
    title: "DB Runtime UI Proof Active Parent",
    description: "Active parent with a parallel coding child and human task.",
    metadata: { proofRunId: runId, rawPromptStored: false, rawResponseStored: false },
  });
  await workQueue.createWorkRun({
    workItemId: activeParentId,
    executorKind: "runtime_job",
    runtimeJobId: runtimeJob.jobId,
    runState: "running",
    metadata: { proofRunId: runId, workQueueLifecycleMutated: false },
  });
  await workQueue.createWorkItem({
    workItemId: closedParentId,
    itemType: "execution_workflow",
    title: "DB Runtime UI Proof Closed Parent",
    description: "Closed parent with completed dynamic children and closeout refs.",
    metadata: { proofRunId: runId, rawPromptStored: false, rawResponseStored: false },
  });

  const graph = await runtimeWorkGraphs.createGraph({
    graphId: `${runId}-graph`,
    parentWorkItemId: activeParentId,
    rootRuntimeJobId: runtimeJob.jobId,
    workflowId: "agent_team.coding",
    orchestratorModelRef: "openai-codex/gpt-5.5",
    graphStatus: "running",
    metadata: { proofRunId: runId, dynamicChildSpawnProof: true },
  });
  await workQueue.syncRuntimeGraphNodeToWorkQueue({
    parentWorkItemId: activeParentId,
    graphId: graph.graphId,
    nodeId: "parallel-coding-child",
    nodeKind: "implementation",
    assignedRole: "implementation_engineer",
    assignedWorkflow: "agent_team.coding",
    queueStatus: "active",
    runtimeJobId: runtimeJob.jobId,
    evidenceRefs: [`runtime-work-graph://${graph.graphId}/node/parallel-coding-child`],
  });
  await workQueue.syncRuntimeGraphNodeToWorkQueue({
    parentWorkItemId: activeParentId,
    graphId: graph.graphId,
    nodeId: "parallel-review-child",
    nodeKind: "review",
    assignedRole: "reviewer",
    assignedWorkflow: "agent_team.coding",
    queueStatus: "closed",
    runtimeJobId: runtimeJob.jobId,
    evidenceRefs: [`runtime-work-graph://${graph.graphId}/node/parallel-review-child`],
  });
  const human = await new HumanOperatorTaskAdapter(runtimeWorkGraphs).createTask({
    graphId: graph.graphId,
    operatorId: "owner:local",
    promptSummary: "Approve bounded queue proof resume.",
    requiredResponseShape: { type: "object", required: ["decision"] },
    blockingNodeRefs: [`runtime-work-graph://${graph.graphId}/node/parallel-coding-child`],
  });
  await workQueue.syncRuntimeGraphNodeToWorkQueue({
    parentWorkItemId: activeParentId,
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

  const closedGraph = await runtimeWorkGraphs.createGraph({
    graphId: `${runId}-closed-graph`,
    parentWorkItemId: closedParentId,
    workflowId: "agent_team.product_spec_planning",
    orchestratorModelRef: "openai-codex/gpt-5.5",
    graphStatus: "succeeded",
    finalCloseoutRef: `closeout://${runId}/closed-parent`,
    metadata: { proofRunId: runId },
  });
  await workQueue.syncRuntimeGraphNodeToWorkQueue({
    parentWorkItemId: closedParentId,
    graphId: closedGraph.graphId,
    nodeId: "closed-child-a",
    nodeKind: "implementation",
    assignedRole: "implementation_engineer",
    assignedWorkflow: "agent_team.product_spec_planning",
    queueStatus: "closed",
    evidenceRefs: [`validation://${runId}/closed-child-a`],
  });
  await workQueue.syncRuntimeGraphNodeToWorkQueue({
    parentWorkItemId: closedParentId,
    graphId: closedGraph.graphId,
    nodeId: "closed-child-b",
    nodeKind: "closeout",
    assignedRole: "observability_scribe",
    assignedWorkflow: "agent_team.product_spec_planning",
    queueStatus: "closed",
    evidenceRefs: [`closeout://${runId}/closed-child-b`],
  });
  await workQueue.completeWorkQueueItemFromCloseout({
    workItemId: closedParentId,
    closeoutRef: `closeout://${runId}/closed-parent`,
    closeoutHash: sha256(`${runId}:closed-parent`),
    validationRef: `validation://${runId}/closed-parent`,
    graphRef: `runtime-work-graph://${closedGraph.graphId}`,
    ownerReadbackRef: `readback://${runId}/closed-parent`,
    validationRequired: true,
    sourceEditRequired: false,
    accepted: true,
    reasonCodes: ["db_runtime_ui_live_proof_closed_parent"],
  });
  await workQueue.rollupParentWorkQueueStatus({
    parentWorkItemId: closedParentId,
    finalCloseoutRef: `closeout://${runId}/closed-parent`,
  });

  await runtime.pool.end();
  return {
    runId,
    activeParentId,
    closedParentId,
    runtimeJobId: runtimeJob.jobId,
    graphId: graph.graphId,
    humanTaskId: human.humanTask.humanTaskId,
    humanNodeId: human.node.nodeId,
  };
}

async function proveBrowserReadback(seed) {
  const harness = await new OperatorBrowserHarness({
    origin: safeBridgeOrigin,
    headless: true,
  }).start();
  try {
    await harness.ensureAuthenticated("agent:main:main");
    const token = readGatewayToken();
    const url = new URL(`${safeBridgeOrigin.replace(/\/$/, "")}/work-queue`);
    url.hash = `token=${encodeURIComponent(token)}`;
    await harness.page.goto(url.toString(), { waitUntil: "domcontentloaded" });
    const search = harness.page
      .locator('input[type="search"][placeholder="Search active work"]')
      .first();
    await search.waitFor({ state: "visible", timeout: 30_000 });
    await search.fill("DB Runtime UI Proof");
    await harness.page.waitForFunction(
      ({ activeTitle }) => document.body.textContent?.includes(activeTitle),
      { activeTitle: "DB Runtime UI Proof Active Parent" },
      { timeout: 45_000 },
    );
    const bodyText = await harness.page.locator("body").innerText({ timeout: 10_000 });
    return {
      url: url.toString().replace(/#token=.*/u, "#token=<redacted>"),
      sawActiveParent: bodyText.includes("DB Runtime UI Proof Active Parent"),
      sawClosedFilter: bodyText.includes("Closed"),
      sawRuntimeReadbackRefresh: bodyText.includes("Refresh runtime readback"),
      sawReasonCodeDumpAsPrimary: bodyText.trim().startsWith("Execution Platform needs review."),
      bodyTextHash: sha256(bodyText),
      bodyTextLength: bodyText.length,
      proofRunId: seed.runId,
    };
  } finally {
    await harness.close();
  }
}

async function main() {
  const preflight = {
    localHealth: await boundedFetch(`${localBase}/healthz`),
    localReady: await boundedFetch(`${localBase}/readyz`),
    tailscaleHealth: await boundedFetch(`${safeBridgeOrigin.replace(/\/$/, "")}/healthz`),
    tailscaleReady: await boundedFetch(`${safeBridgeOrigin.replace(/\/$/, "")}/readyz`),
    safeBridgeRef: safeBridgeOrigin.replace(/\/$/, ""),
  };
  writeArtifact("work-queue-db-runtime-ui-live-proof-preflight.json", {
    artifactKind: "work_queue_db_runtime_ui_live_proof_preflight",
    status: preflight.localReady.ok && preflight.tailscaleReady.ok ? "ready" : "blocked_health",
    preflight,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
  });
  const seed = await seedRuntimeDb();
  const listBefore = await postJson("/api/execution-platform/work-queue/list", {
    bucket: "all",
    searchQuery: "DB Runtime UI Proof",
    limit: 20,
  });
  const detailBefore = await postJson("/api/execution-platform/work-queue/detail", {
    workItemId: seed.activeParentId,
  });
  const humanResume = await postJson("/api/execution-platform/work-queue/human-response", {
    parentWorkItemId: seed.activeParentId,
    graphId: seed.graphId,
    humanTaskId: seed.humanTaskId,
    boundedResponseRef: `owner-decision://${seed.runId}/ui-proof-resume`,
  });
  const deltaAfterResume = await postJson("/api/execution-platform/work-queue/delta", {
    bucket: "all",
    updatedSince: new Date(Date.now() - 5 * 60_000).toISOString(),
    searchQuery: "DB Runtime UI Proof",
    limit: 20,
  });
  const browserReadback = await proveBrowserReadback(seed);
  const passed =
    listBefore.ok &&
    detailBefore.ok &&
    humanResume.ok &&
    deltaAfterResume.ok &&
    browserReadback.sawActiveParent &&
    browserReadback.sawClosedFilter &&
    browserReadback.sawRuntimeReadbackRefresh &&
    !browserReadback.sawReasonCodeDumpAsPrimary;
  writeArtifact("work-queue-db-runtime-ui-live-proof-summary.json", {
    artifactKind: "work_queue_db_runtime_ui_live_proof_summary",
    status: passed ? "passed" : "needs_review",
    reasonCodes: passed
      ? ["work_queue_db_runtime_ui_live_proof_passed"]
      : [
          ...(listBefore.ok ? [] : ["db_list_route_failed"]),
          ...(detailBefore.ok ? [] : ["db_detail_route_failed"]),
          ...(humanResume.ok ? [] : ["human_resume_route_failed"]),
          ...(deltaAfterResume.ok ? [] : ["delta_route_failed"]),
          ...(browserReadback.sawActiveParent ? [] : ["browser_active_parent_missing"]),
          ...(browserReadback.sawClosedFilter ? [] : ["browser_closed_filter_missing"]),
          ...(browserReadback.sawRuntimeReadbackRefresh
            ? []
            : ["browser_runtime_readback_missing"]),
          ...(browserReadback.sawReasonCodeDumpAsPrimary
            ? ["reason_code_dump_primary_output"]
            : []),
        ],
    seed,
    routeProof: {
      listStatus: listBefore.status,
      listItemCount: Array.isArray(listBefore.body?.items) ? listBefore.body.items.length : null,
      detailStatus: detailBefore.status,
      humanResumeStatus: humanResume.status,
      deltaStatus: deltaAfterResume.status,
      deltaItemCount: Array.isArray(deltaAfterResume.body?.items)
        ? deltaAfterResume.body.items.length
        : null,
    },
    browserReadback,
    runtimeJobsCreated: true,
    authorityGranted: false,
    controlsApplied: false,
    workQueueLifecycleMutated: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawDbRowsStored: false,
  });
  if (!passed) {
    process.exitCode = 2;
  }
}

await main().catch((error) => {
  writeArtifact("work-queue-db-runtime-ui-live-proof-summary.json", {
    artifactKind: "work_queue_db_runtime_ui_live_proof_summary",
    status: "blocked",
    reasonCodes: ["work_queue_db_runtime_ui_live_proof_script_failed"],
    errorHash: sha256(error instanceof Error ? error.message : String(error)),
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    workQueueLifecycleMutated: false,
  });
  process.exitCode = 1;
});
