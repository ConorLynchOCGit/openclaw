import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../../extensions/execution-platform/src/db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../../extensions/execution-platform/src/db/pg-test.ts";
import { NativeExecutionRpcService } from "../../extensions/execution-platform/src/intent-routing/native-execution-rpc.ts";
import { RuntimeJobRepository } from "../../extensions/execution-platform/src/runtime-job-repository.ts";
import { WorkQueueRepository } from "../../extensions/execution-platform/src/work-queue/work-queue-repository.ts";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import {
  handleExecutionPlatformHttpRequest,
  shouldHandleExecutionPlatformPath,
} from "./execution-platform-http.js";
import {
  AUTH_NONE,
  createResponse,
  sendRequest,
  withGatewayServer,
} from "./server-http.test-harness.js";

function jsonRequest(path: string, body: unknown): IncomingMessage {
  const req = Readable.from([JSON.stringify(body)]) as IncomingMessage;
  req.method = "POST";
  req.url = path;
  req.headers = { "content-type": "application/json" };
  req.socket = { remoteAddress: "127.0.0.1" } as IncomingMessage["socket"];
  return req;
}

describe("execution platform gateway HTTP routes", () => {
  const databases: Awaited<ReturnType<typeof createExecutionPlatformPgMemTestDatabase>>[] = [];

  afterEach(async () => {
    await Promise.all(databases.splice(0).map((database) => database.close()));
  });

  it("matches only native execution platform HTTP paths", () => {
    expect(shouldHandleExecutionPlatformPath("/api/execution-platform/execution/submit")).toBe(
      true,
    );
    expect(
      shouldHandleExecutionPlatformPath(
        "/api/execution-platform/work-queue/execution-control/pause",
      ),
    ).toBe(true);
    expect(shouldHandleExecutionPlatformPath("/api/execution-platform/queue-runner/run-once")).toBe(
      true,
    );
    expect(shouldHandleExecutionPlatformPath("/api/execution-platform")).toBe(false);
    expect(shouldHandleExecutionPlatformPath("/api/channels/test")).toBe(false);
  });

  it("handles native execution.submit with an injected runtime", async () => {
    const database = await createExecutionPlatformPgMemTestDatabase();
    databases.push(database);
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic" });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs);
    const nativeExecutionRpc = new NativeExecutionRpcService({ runtimeJobs, workQueue });
    const response = createResponse();

    await handleExecutionPlatformHttpRequest(
      jsonRequest("/api/execution-platform/execution/submit", {
        prompt: "Have the coding team add a small regression test and close it out.",
        auth: { actorId: "operator", authenticated: true, role: "operator" },
      }),
      response.res,
      {
        config: {} as OpenClawConfig,
        runtime: { runtimeJobs, workQueue, nativeExecutionRpc },
      },
    );

    expect(response.res.statusCode).toBe(200);
    const payload = JSON.parse(response.getBody()) as {
      accepted: boolean;
      workflowId: string;
      jobType: string;
      rawPromptStored: boolean;
    };
    expect(payload.accepted).toBe(true);
    expect(payload.workflowId).toBe("agent_team.coding");
    expect(payload.jobType).toBe("executor.agent_team");
    expect(payload.rawPromptStored).toBe(false);
  });

  it("derives native execution auth from the gateway HTTP auth context", async () => {
    const database = await createExecutionPlatformPgMemTestDatabase();
    databases.push(database);
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic" });
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs);
    const nativeExecutionRpc = new NativeExecutionRpcService({ runtimeJobs, workQueue });
    const response = createResponse();
    const req = jsonRequest("/api/execution-platform/execution/submit", {
      prompt: "Have the coding team add a small regression test and close it out.",
      workItemId: "native-http-auth-context-work-item",
    });
    req.headers["x-openclaw-actor-id"] = "operator-from-http";
    req.headers["x-openclaw-session-key"] = "agent:main:main";
    req.headers["x-openclaw-source-route"] = "ux";

    await handleExecutionPlatformHttpRequest(req, response.res, {
      config: {} as OpenClawConfig,
      runtime: { runtimeJobs, workQueue, nativeExecutionRpc },
      requestAuth: { authMethod: "token", trustDeclaredOperatorScopes: false },
    });

    expect(response.res.statusCode).toBe(200);
    const payload = JSON.parse(response.getBody()) as {
      accepted: boolean;
      runtimeJobId: string;
      rawPromptStored: boolean;
    };
    expect(payload.accepted).toBe(true);
    expect(payload.rawPromptStored).toBe(false);
    const job = await runtimeJobs.getJob(payload.runtimeJobId);
    expect(job?.payload).toMatchObject({
      operator: { actorId: "operator-from-http", sessionId: "agent:main:main" },
      rawPromptStored: false,
      rawResponseStored: false,
    });
  });

  it("stages execution platform paths in the gateway before the 404 fallback", async () => {
    await withGatewayServer({
      prefix: "execution-platform-http-stage",
      resolvedAuth: AUTH_NONE,
      run: async (server) => {
        const response = await sendRequest(server, {
          path: "/api/execution-platform/execution/status",
          method: "POST",
        });
        expect(response.res.statusCode).not.toBe(404);
      },
    });
  });
});
