import type { IncomingMessage, ServerResponse } from "node:http";
import {
  createExecutionPlatformDatabaseRuntime,
  createExecutionPlatformHostRoutes,
  NativeExecutionRpcService,
  RuntimeJobRepository,
  WorkQueueRepository,
} from "../../extensions/execution-platform/runtime-api.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import type { AuthorizedGatewayHttpRequest } from "./http-utils.js";

type ExecutionPlatformRouteRuntime = {
  runtimeJobs: RuntimeJobRepository;
  workQueue: WorkQueueRepository;
  nativeExecutionRpc: NativeExecutionRpcService;
};

let runtimePromise: Promise<ExecutionPlatformRouteRuntime> | null = null;

function writeJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function headerValue(req: IncomingMessage, name: string): string | undefined {
  const raw = req.headers[name.toLowerCase()];
  return Array.isArray(raw) ? raw[0] : raw;
}

function boundedHeader(req: IncomingMessage, name: string): string | null {
  const raw = headerValue(req, name)?.trim();
  if (!raw || raw.length > 160) {
    return null;
  }
  return raw;
}

function resolveNativeHttpAuthContext(
  req: IncomingMessage,
  requestAuth?: AuthorizedGatewayHttpRequest | null,
) {
  if (!requestAuth) {
    return undefined;
  }
  return {
    authenticated: true,
    actorId:
      boundedHeader(req, "x-openclaw-actor-id") ??
      boundedHeader(req, "x-openclaw-operator-id") ??
      "gateway-http-operator",
    role: "operator" as const,
    sessionId:
      boundedHeader(req, "x-openclaw-session-id") ??
      boundedHeader(req, "x-openclaw-session-key") ??
      null,
    sourceRoute:
      boundedHeader(req, "x-openclaw-source-route") === "ux"
        ? ("ux" as const)
        : boundedHeader(req, "x-openclaw-source-route") === "terminal"
          ? ("terminal" as const)
          : boundedHeader(req, "x-openclaw-source-route") === "work_queue"
            ? ("work_queue" as const)
            : ("http" as const),
  };
}

export function shouldHandleExecutionPlatformPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/execution-platform/execution/") ||
    pathname.startsWith("/api/execution-platform/work-queue/execution-control/") ||
    pathname === "/api/execution-platform/queue-runner/run-once"
  );
}

export async function getExecutionPlatformRuntime(
  config: OpenClawConfig,
): Promise<ExecutionPlatformRouteRuntime> {
  runtimePromise ??= (async () => {
    const database = await createExecutionPlatformDatabaseRuntime({
      config,
      applyMigrations: true,
    });
    const runtimeJobs = new RuntimeJobRepository(database.sqlClient, { claimStrategy: "basic" });
    const workQueue = new WorkQueueRepository(database.sqlClient, runtimeJobs);
    const nativeExecutionRpc = new NativeExecutionRpcService({ runtimeJobs, workQueue });
    return { runtimeJobs, workQueue, nativeExecutionRpc };
  })();
  return runtimePromise;
}

export async function handleExecutionPlatformHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  params: {
    config: OpenClawConfig;
    runtime?: ExecutionPlatformRouteRuntime;
    requestAuth?: AuthorizedGatewayHttpRequest | null;
  },
): Promise<boolean> {
  const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
  if (!shouldHandleExecutionPlatformPath(pathname)) {
    return false;
  }
  try {
    const runtime = params.runtime ?? (await getExecutionPlatformRuntime(params.config));
    const route = createExecutionPlatformHostRoutes({
      runtimeJobs: runtime.runtimeJobs,
      nativeExecutionRpc: runtime.nativeExecutionRpc,
      nativeHttpAuth: resolveNativeHttpAuthContext(req, params.requestAuth),
    }).find((route) => route.path === pathname);
    if (!route) {
      writeJson(res, 404, { error: "execution_platform_route_not_registered" });
      return true;
    }
    return route.handler(req, res);
  } catch (error) {
    writeJson(res, 503, {
      error: "execution_platform_runtime_unavailable",
      reason: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
}
