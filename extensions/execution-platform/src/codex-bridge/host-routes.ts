import type { IncomingMessage, ServerResponse } from "node:http";
import type { JsonValue, RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  handleWorkQueueCancelExecutionEndpoint,
  handleWorkQueuePauseExecutionEndpoint,
  handleWorkQueueRedirectExecutionEndpoint,
  type WorkQueueExecutionControlEndpointAuth,
} from "../work-queue/execution-control-endpoints.ts";
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
  queueRunnerEndpoint?: typeof handleQueueRunnerRunOnceEndpoint;
};

type JsonRecord = Record<string, unknown>;

const JSON_CONTENT_TYPE = "application/json; charset=utf-8";

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
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

export function createExecutionPlatformHostRoutes(dependencies: {
  runtimeJobs: RuntimeJobRepository;
}): ExecutionPlatformHostRoute[] {
  return [
    {
      path: "/api/execution-platform/queue-runner/run-once",
      auth: "gateway",
      match: "exact",
      gatewayRuntimeScopeSurface: "trusted-operator",
      handler: (req, res) =>
        handleExecutionPlatformQueueRunnerHostRoute(req, res, {
          runtimeJobs: dependencies.runtimeJobs,
        }),
    },
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
