import type { IncomingMessage, ServerResponse } from "node:http";
import type { FrontDoorSourcePromptRef } from "../intent-front-door/request-compiler.ts";
import {
  NativeExecutionRpcService,
  type NativeExecutionRpcAuth,
} from "../intent-routing/native-execution-rpc.ts";
import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import type { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import {
  handleWorkQueueCancelExecutionEndpoint,
  handleWorkQueuePauseExecutionEndpoint,
  handleWorkQueueRedirectExecutionEndpoint,
  type WorkQueueExecutionControlEndpointAuth,
} from "../work-queue/execution-control-endpoints.ts";
import {
  buildWorkQueueExecutionReadModel,
  summarizeWorkQueueExecutionForUi,
} from "../work-queue/execution-read-model.ts";
import type { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import { ProductionWorkflowExecutionFactory } from "../workflows/production-workflow-execution-factory.ts";
import type { RuntimeWorkGraphRepository } from "../workflows/runtime-work-graph-repository.ts";
import {
  handleQueueRunnerRunOnceEndpoint,
  type QueueRunnerEndpointAuth,
  type QueueRunnerEndpointRequest,
} from "./queued-bridge-runner-endpoint.ts";

export type ExecutionPlatformHostRoute = {
  path: string;
  auth: "gateway";
  match: "exact";
  gatewayRuntimeScopeSurface: "trusted-operator";
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
};

export type ExecutionPlatformHostRouteDependencies = {
  runtimeJobs?: RuntimeJobRepository;
  runtimeWorkGraphs?: RuntimeWorkGraphRepository;
  runtimeToolKernel?: RuntimeToolKernel | null;
  workQueue?: WorkQueueRepository;
  nativeExecutionRpc?: NativeExecutionRpcService;
  queueRunnerEndpoint?: typeof handleQueueRunnerRunOnceEndpoint;
  agentTeamRuntimeRunOnce?: (input: {
    runtimeJobId: string;
    workerId: string;
    queueName?: string | null;
  }) => Promise<{
    claimed: boolean;
    completed: boolean;
    failed: boolean;
    status: string;
    runtimeJobId: string | null;
    teamRunId: string | null;
    workflowId: string | null;
    workerId: string;
    reasonCodes: string[];
  }>;
  nativeHttpAuth?: TrustedNativeExecutionHttpAuthContext;
};

type JsonRecord = Record<string, unknown>;
type NativeExecutionSourceRoute =
  | "ux"
  | "terminal"
  | "work_queue"
  | "agent_handoff"
  | "http"
  | "service";

export type TrustedNativeExecutionHttpAuthContext = {
  authenticated: boolean;
  actorId?: string | null;
  role?: NativeExecutionRpcAuth["role"];
  sessionId?: string | null;
  sourceRoute?: NativeExecutionSourceRoute | null;
};

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readPromptText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number.parseInt(value, 10)
        : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

async function readJsonBody(req: IncomingMessage, maxBytes = 64 * 1024): Promise<JsonRecord> {
  let body = "";
  for await (const chunk of req) {
    body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
    if (Buffer.byteLength(body, "utf8") > maxBytes) {
      throw new Error("request_body_too_large");
    }
  }
  if (body.trim().length === 0) {
    return {};
  }
  const parsed = JSON.parse(body) as unknown;
  if (!isRecord(parsed)) {
    throw new Error("json_object_body_required");
  }
  return parsed;
}

function authFromBody(body: JsonRecord): QueueRunnerEndpointAuth {
  const auth = isRecord(body.auth) ? body.auth : {};
  return {
    actorId: readString(auth.actorId) ?? "",
    role:
      auth.role === "admin" || auth.role === "service" || auth.role === "operator"
        ? auth.role
        : "operator",
    authenticated: readBoolean(auth.authenticated) ?? false,
  };
}

function readSourceRoute(value: unknown): NativeExecutionSourceRoute | undefined {
  return value === "ux" ||
    value === "terminal" ||
    value === "work_queue" ||
    value === "agent_handoff" ||
    value === "http" ||
    value === "service"
    ? value
    : undefined;
}

function readSourcePromptRef(
  value: unknown,
): Omit<FrontDoorSourcePromptRef, "promptHash" | "promptLength"> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!isRecord(value)) {
    throw new Error("source_prompt_ref_object_required");
  }
  const refKind = readString(value.refKind);
  if (refKind !== "gateway_chat_transcript" && refKind !== "native_submit") {
    throw new Error("source_prompt_ref_kind_invalid");
  }
  if (value.rawPromptStored !== false) {
    throw new Error("source_prompt_ref_raw_prompt_flag_required_false");
  }
  return {
    refKind,
    sessionKey: readString(value.sessionKey) ?? null,
    sessionId: readString(value.sessionId) ?? null,
    runId: readString(value.runId) ?? null,
    sourceRoute: readString(value.sourceRoute) ?? null,
    rawPromptStored: false,
  };
}

function readApprovalRefs(value: unknown) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value
    .filter(isRecord)
    .map((approval) => ({
      approvalId: readString(approval.approvalId) ?? "",
      approvalKind: readString(approval.approvalKind) ?? "",
      workflowId: readString(approval.workflowId),
      expiresAt: readString(approval.expiresAt) ?? "",
      revoked: readBoolean(approval.revoked),
    }))
    .filter((approval) => approval.approvalId && approval.approvalKind && approval.expiresAt)
    .slice(0, 20);
}

function nativeAuthFromBody(
  body: JsonRecord,
  trustedHttpAuth?: TrustedNativeExecutionHttpAuthContext,
): NativeExecutionRpcAuth {
  const auth = authFromBody(body);
  const bodyAuth = isRecord(body.auth) ? body.auth : {};
  return {
    actorId:
      auth.actorId ||
      readString(body.actorId) ||
      readString(body.operatorActorId) ||
      readString(trustedHttpAuth?.actorId) ||
      "gateway-http-operator",
    authenticated: auth.authenticated || trustedHttpAuth?.authenticated === true,
    role: auth.role ?? trustedHttpAuth?.role ?? "operator",
    sessionId:
      readString(bodyAuth.sessionId) ??
      readString(body.sessionId) ??
      readString(trustedHttpAuth?.sessionId) ??
      null,
    sourceRoute:
      readSourceRoute(bodyAuth.sourceRoute) ??
      readSourceRoute(body.sourceRoute) ??
      trustedHttpAuth?.sourceRoute ??
      "http",
  };
}

function writeJson(res: ServerResponse, statusCode: number, payload: JsonValue): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", JSON_CONTENT_TYPE);
  res.end(JSON.stringify(payload));
}

function unsafeBody(value: unknown): boolean {
  return /raw-transcript-marker|raw-prompt-marker|secret-marker|\bsk-[a-z0-9_-]{12,}/iu.test(
    JSON.stringify(value),
  );
}

export async function handleExecutionPlatformQueueRunnerHostRoute(
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: ExecutionPlatformHostRouteDependencies = {},
): Promise<boolean> {
  if (req.method !== "POST") {
    writeJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  try {
    const body = await readJsonBody(req);
    if (unsafeBody(body)) {
      writeJson(res, 400, { error: "unsafe_request_content" });
      return true;
    }
    if (readBoolean(body.nativeWorkflowRunOnce) === true && dependencies.runtimeJobs) {
      if (readBoolean(body.gatewayWorkerRunOnceProofMode) !== true) {
        writeJson(res, 409, {
          accepted: false,
          nativeWorkflowRunOnce: true,
          blockingReasons: ["gateway_worker_run_once_disabled_by_enqueue_only_boundary"],
          reasonCodes: ["gateway_must_enqueue_runtime_jobs_not_execute_workers"],
          daemonStarted: false,
          schedulerStarted: false,
          workQueueLifecycleMutated: false,
        });
        return true;
      }
      const auth = authFromBody(body);
      if (!auth.authenticated || !auth.actorId) {
        writeJson(res, 401, { accepted: false, blockingReasons: ["operator_auth_required"] });
        return true;
      }
      const runtimeJobId = readString(body.runtimeJobId);
      const job = runtimeJobId ? await dependencies.runtimeJobs.getJob(runtimeJobId) : null;
      if (!job) {
        writeJson(res, 400, {
          accepted: false,
          blockingReasons: ["runtime_job_not_found"],
          runtimeJobId: runtimeJobId ?? null,
        });
        return true;
      }
      const queueName = readString(body.queueName);
      const workerId = readString(body.workerId) ?? `operator:${auth.actorId}`;
      if (job.jobType === "executor.agent_team" && !dependencies.agentTeamRuntimeRunOnce) {
        writeJson(res, 409, {
          accepted: false,
          nativeWorkflowRunOnce: true,
          blockingReasons: ["configured_agent_team_supervisor_required"],
          reasonCodes: ["agent_team_run_once_requires_configured_worker_supervisor"],
          runtimeJobId: job.jobId,
          daemonStarted: false,
          schedulerStarted: false,
          workQueueLifecycleMutated: false,
        });
        return true;
      }
      const runOnceResult = await new ProductionWorkflowExecutionFactory({
        runtimeJobs: dependencies.runtimeJobs,
        runtimeWorkGraphs: dependencies.runtimeWorkGraphs,
        runtimeToolKernel: dependencies.runtimeToolKernel ?? null,
        workQueue: dependencies.workQueue,
        agentTeamRuntimeRunOnce: dependencies.agentTeamRuntimeRunOnce,
      }).runOnce({
        runtimeJobId: job.jobId,
        workerId,
        queueName: queueName ?? "agent-team",
      });
      writeJson(res, runOnceResult.claimed ? 200 : 400, {
        accepted: runOnceResult.claimed,
        nativeWorkflowRunOnce: true,
        claimed: runOnceResult.claimed,
        completed: runOnceResult.completed,
        failed: runOnceResult.failed,
        runtimeJobId: runOnceResult.runtimeJobId,
        teamRunId: "teamRunId" in runOnceResult ? runOnceResult.teamRunId : null,
        workflowId: "workflowId" in runOnceResult ? runOnceResult.workflowId : null,
        reasonCodes:
          "reasonCodes" in runOnceResult && Array.isArray(runOnceResult.reasonCodes)
            ? runOnceResult.reasonCodes.slice(0, 20)
            : [],
        boundedProof: {
          workerId: runOnceResult.workerId,
          queueName: queueName ?? "agent-team",
          runtimeJobIdFilter: job.jobId,
          claimed: runOnceResult.claimed,
          completed: runOnceResult.completed,
          failed: runOnceResult.failed,
          daemonStarted: false,
          schedulerStarted: false,
          workQueueLifecycleMutated: false,
        },
        daemonStarted: false,
        schedulerStarted: false,
        workQueueLifecycleMutated: false,
      });
      return true;
    }
    const request: QueueRunnerEndpointRequest = {
      auth: authFromBody(body),
      workerId: readString(body.workerId),
      queueName: readString(body.queueName),
      runtimeJobId: readString(body.runtimeJobId),
      dryRun: readBoolean(body.dryRun),
      runtime: dependencies.runtimeJobs ? { runtimeJobs: dependencies.runtimeJobs } : undefined,
    };
    const result = await (dependencies.queueRunnerEndpoint ?? handleQueueRunnerRunOnceEndpoint)(
      request,
    );
    writeJson(res, result.accepted ? 200 : 401, result as unknown as JsonValue);
    return true;
  } catch (error) {
    writeJson(res, 400, {
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}

export async function handleExecutionPlatformWorkQueueControlHostRoute(
  commandKind: "pause" | "redirect" | "cancel",
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: { runtimeJobs: RuntimeJobRepository },
): Promise<boolean> {
  if (req.method !== "POST") {
    writeJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  try {
    const body = await readJsonBody(req);
    if (unsafeBody(body)) {
      writeJson(res, 400, { error: "unsafe_request_content" });
      return true;
    }
    const auth = authFromBody(body) as WorkQueueExecutionControlEndpointAuth;
    const request = {
      auth,
      runtimeJobs: dependencies.runtimeJobs,
      workItemId: readString(body.workItemId) ?? null,
      runtimeJobId: readString(body.runtimeJobId) ?? "",
      sessionId: readString(body.sessionId) ?? "",
      reason: readString(body.reason) ?? commandKind,
      redirectPrompt: isRecord(body.redirectPrompt) ? (body.redirectPrompt as never) : undefined,
      cancelRuntimeJob: readBoolean(body.cancelRuntimeJob),
    };
    const result =
      commandKind === "pause"
        ? await handleWorkQueuePauseExecutionEndpoint(request)
        : commandKind === "redirect"
          ? await handleWorkQueueRedirectExecutionEndpoint(request)
          : await handleWorkQueueCancelExecutionEndpoint(request);
    writeJson(res, result.accepted ? 200 : 401, result as unknown as JsonValue);
    return true;
  } catch (error) {
    writeJson(res, 400, {
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}

export async function handleExecutionPlatformNativeExecutionHostRoute(
  operation: "submit" | "status" | "apply-control" | "work-queue-projection" | "closeout",
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: {
    runtimeJobs: RuntimeJobRepository;
    nativeExecutionRpc?: NativeExecutionRpcService;
    nativeHttpAuth?: TrustedNativeExecutionHttpAuthContext;
  },
): Promise<boolean> {
  if (req.method !== "POST") {
    writeJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  try {
    const body = await readJsonBody(req);
    if (unsafeBody(body)) {
      writeJson(res, 400, { error: "unsafe_request_content" });
      return true;
    }
    const service =
      dependencies.nativeExecutionRpc ??
      new NativeExecutionRpcService({ runtimeJobs: dependencies.runtimeJobs });
    const auth = nativeAuthFromBody(body, dependencies.nativeHttpAuth);
    const runtimeJobId = readString(body.runtimeJobId) ?? "";
    const result =
      operation === "submit"
        ? await service.submit({
            prompt: readPromptText(body.prompt) ?? "",
            auth,
            workItemId: readString(body.workItemId) ?? null,
            approvalRefs: readApprovalRefs(body.approvalRefs),
            sourceRoute: auth.sourceRoute,
            sourcePromptRef: readSourcePromptRef(body.sourcePromptRef),
          })
        : operation === "status"
          ? await service.status(runtimeJobId)
          : operation === "apply-control"
            ? await service.applyControl({
                actionKind:
                  body.actionKind === "pause" ||
                  body.actionKind === "redirect" ||
                  body.actionKind === "cancel" ||
                  body.actionKind === "retry" ||
                  body.actionKind === "mark_needs_review" ||
                  body.actionKind === "view_closeout"
                    ? body.actionKind
                    : "view_closeout",
                actionId: readString(body.actionId) ?? "native-execution-control",
                workItemId: readString(body.workItemId) ?? "",
                runtimeJobId,
                auth,
                metadata: isRecord(body.metadata)
                  ? (body.metadata as Record<string, JsonValue>)
                  : undefined,
              })
            : operation === "work-queue-projection"
              ? await service.readWorkQueueProjection(readString(body.workItemId) ?? "")
              : await service.readCloseout(runtimeJobId);
    const accepted = !(
      typeof result === "object" &&
      result !== null &&
      "accepted" in result &&
      result.accepted === false
    );
    writeJson(res, accepted ? 200 : 400, result as JsonValue);
    return true;
  } catch (error) {
    writeJson(res, 400, {
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}

export async function handleExecutionPlatformDbWorkQueueHostRoute(
  operation: "list" | "detail" | "delta" | "human-response",
  req: IncomingMessage,
  res: ServerResponse,
  dependencies: {
    runtimeJobs: RuntimeJobRepository;
    workQueue?: WorkQueueRepository;
    runtimeWorkGraphs?: RuntimeWorkGraphRepository;
  },
): Promise<boolean> {
  if (req.method !== "POST") {
    writeJson(res, 405, { error: "method_not_allowed" });
    return true;
  }
  try {
    const body = await readJsonBody(req);
    if (unsafeBody(body)) {
      writeJson(res, 400, { error: "unsafe_request_content" });
      return true;
    }
    if (!dependencies.workQueue) {
      writeJson(res, 503, {
        accepted: false,
        reasonCodes: ["work_queue_repository_not_configured"],
      });
      return true;
    }
    if (operation === "list" || operation === "delta") {
      const bucket =
        body.bucket === "closed" || body.bucket === "all" || body.bucket === "active"
          ? body.bucket
          : "active";
      const result = await dependencies.workQueue.listDbWorkQueue({
        bucket,
        limit: readNumber(body.limit),
        cursor: readString(body.cursor) ?? null,
        searchQuery: readString(body.searchQuery) ?? null,
        updatedSince: operation === "delta" ? (readString(body.updatedSince) ?? null) : null,
      });
      writeJson(res, 200, {
        accepted: true,
        ...result,
      } as unknown as JsonValue);
      return true;
    }
    if (operation === "detail") {
      const workItemId = readString(body.workItemId) ?? "";
      if (!workItemId) {
        writeJson(res, 400, { accepted: false, reasonCodes: ["work_item_id_required"] });
        return true;
      }
      const truth = await dependencies.workQueue.readWorkItemTruth(workItemId, 5);
      if (!truth) {
        writeJson(res, 404, { accepted: false, reasonCodes: ["work_item_not_found"] });
        return true;
      }
      const executionModel = await buildWorkQueueExecutionReadModel({
        workQueue: dependencies.workQueue,
        runtimeJobs: dependencies.runtimeJobs,
        workItemId,
      });
      writeJson(res, 200, {
        accepted: true,
        artifactKind: "db_work_queue_detail_result",
        source: "execution_platform_work_queue_db",
        item: {
          workItemId: truth.item.workItemId,
          itemType: truth.item.itemType,
          title: truth.item.title,
          description: truth.item.description,
          lifecycleState: truth.item.lifecycleState,
          queueStatus: truth.item.queueStatus ?? "active",
          queueRank: truth.item.queueRank ?? null,
          closedAt: truth.item.closedAt?.toISOString() ?? null,
          updatedAt: truth.item.updatedAt.toISOString(),
          runtimeJobIds: executionModel.linkedRuntimeJobIds,
          graphRef: truth.item.graphRef ?? null,
          validationRef: truth.item.validationRef ?? null,
          closeoutCapsuleRef: truth.item.closeoutCapsuleRef ?? null,
          ownerReadbackRef: truth.item.ownerReadbackRef ?? null,
          assignmentCount: truth.assignments.length,
          dependencyCount: truth.dependencies.length,
          artifactRefs: truth.artifacts.map((artifact) => artifact.uri).slice(0, 40),
          eventCursor:
            truth.events[0]?.eventTime.toISOString() ?? truth.item.updatedAt.toISOString(),
          execution: summarizeWorkQueueExecutionForUi(executionModel),
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        rawDbRowsStored: false,
      } as unknown as JsonValue);
      return true;
    }
    if (operation === "human-response") {
      if (!dependencies.runtimeWorkGraphs) {
        writeJson(res, 503, {
          accepted: false,
          reasonCodes: ["runtime_work_graph_repository_not_configured"],
        });
        return true;
      }
      const graphId = readString(body.graphId) ?? "";
      const humanTaskId = readString(body.humanTaskId) ?? "";
      const parentWorkItemId = readString(body.parentWorkItemId) ?? "";
      const boundedResponseRef =
        readString(body.boundedResponseRef) ??
        `owner-decision://work-queue/${humanTaskId}/default-response`;
      if (!graphId || !humanTaskId) {
        writeJson(res, 400, {
          accepted: false,
          reasonCodes: ["human_response_missing_graph_or_task"],
        });
        return true;
      }
      const resumed = await dependencies.runtimeWorkGraphs.resumeHumanTask({
        humanTaskId,
        boundedResponseRef,
        decisionRefs: [boundedResponseRef],
      });
      await dependencies.runtimeWorkGraphs.addEdge({
        graphId,
        fromNodeId: resumed.nodeId,
        toNodeId: null,
        edgeKind: "human_resume",
        reasonCodes: ["human_operator_input_received"],
        artifactRefs: [boundedResponseRef],
      });
      if (resumed.nodeId) {
        await dependencies.runtimeWorkGraphs.updateNodeStatus({
          nodeId: resumed.nodeId,
          nodeStatus: "succeeded",
          outputArtifactRefs: [boundedResponseRef],
        });
      }
      if (dependencies.workQueue && parentWorkItemId && resumed.nodeId) {
        await dependencies.workQueue.syncRuntimeGraphNodeToWorkQueue({
          parentWorkItemId,
          graphId,
          nodeId: resumed.nodeId,
          nodeKind: "human_task",
          assignedRole: "human_operator",
          assignedWorkflow: "human/operator",
          queueStatus: "closed",
          title: "Human operator decision",
          humanTaskId,
          graphNodeRef: `runtime-work-graph://${graphId}/node/${resumed.nodeId}`,
          evidenceRefs: [boundedResponseRef],
          actorId: "control-ui-operator",
        });
        await dependencies.workQueue.rollupParentWorkQueueStatus({
          parentWorkItemId,
          actorId: "control-ui-operator",
        });
      }
      writeJson(res, 200, {
        accepted: true,
        artifactKind: "db_work_queue_human_response_result",
        graphId,
        humanTaskId,
        boundedResponseRef,
        taskStatus: resumed.taskStatus,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutated: false,
      } as unknown as JsonValue);
      return true;
    }
    writeJson(res, 400, { accepted: false, reasonCodes: ["unknown_work_queue_operation"] });
    return true;
  } catch (error) {
    writeJson(res, 400, {
      accepted: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}

export function createExecutionPlatformHostRoutes(
  dependencies: ExecutionPlatformHostRouteDependencies & {
    runtimeJobs: RuntimeJobRepository;
  },
): ExecutionPlatformHostRoute[] {
  return [
    {
      path: "/api/execution-platform/queue-runner/run-once",
      auth: "gateway",
      match: "exact",
      gatewayRuntimeScopeSurface: "trusted-operator",
      handler: (req, res) =>
        handleExecutionPlatformQueueRunnerHostRoute(req, res, {
          runtimeJobs: dependencies.runtimeJobs,
          runtimeWorkGraphs: dependencies.runtimeWorkGraphs,
          workQueue: dependencies.workQueue,
        }),
    },
    ...(
      [
        ["submit", "/api/execution-platform/execution/submit"],
        ["status", "/api/execution-platform/execution/status"],
        ["apply-control", "/api/execution-platform/execution/apply-control"],
        ["work-queue-projection", "/api/execution-platform/execution/work-queue-projection"],
        ["closeout", "/api/execution-platform/execution/closeout"],
      ] as const
    ).map(([operation, path]) => ({
      path,
      auth: "gateway" as const,
      match: "exact" as const,
      gatewayRuntimeScopeSurface: "trusted-operator" as const,
      handler: (req: IncomingMessage, res: ServerResponse) =>
        handleExecutionPlatformNativeExecutionHostRoute(operation, req, res, dependencies),
    })),
    ...(
      [
        ["list", "/api/execution-platform/work-queue/list"],
        ["detail", "/api/execution-platform/work-queue/detail"],
        ["delta", "/api/execution-platform/work-queue/delta"],
        ["human-response", "/api/execution-platform/work-queue/human-response"],
      ] as const
    ).map(([operation, path]) => ({
      path,
      auth: "gateway" as const,
      match: "exact" as const,
      gatewayRuntimeScopeSurface: "trusted-operator" as const,
      handler: (req: IncomingMessage, res: ServerResponse) =>
        handleExecutionPlatformDbWorkQueueHostRoute(operation, req, res, dependencies),
    })),
    ...(["pause", "redirect", "cancel"] as const).map((commandKind) => ({
      path: `/api/execution-platform/work-queue/execution-control/${commandKind}`,
      auth: "gateway" as const,
      match: "exact" as const,
      gatewayRuntimeScopeSurface: "trusted-operator" as const,
      handler: (req: IncomingMessage, res: ServerResponse) =>
        handleExecutionPlatformWorkQueueControlHostRoute(commandKind, req, res, dependencies),
    })),
  ];
}
