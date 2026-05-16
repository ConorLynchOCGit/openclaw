import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../../extensions/execution-platform/src/db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../../extensions/execution-platform/src/db/pg-test.ts";
import {
  createBaseCanonicalRouterOutput,
  createCanonicalRouterAction,
  type CanonicalRouterOutput,
  type StructuredModelIntentRouterProvider,
} from "../../extensions/execution-platform/src/intent-front-door/index.ts";
import { NativeExecutionRpcService } from "../../extensions/execution-platform/src/intent-routing/native-execution-rpc.ts";
import { RuntimeJobRepository } from "../../extensions/execution-platform/src/runtime-job-repository.ts";
import { RuntimeToolKernel } from "../../extensions/execution-platform/src/runtime-tool-call/runtime-tool-kernel.ts";
import { RuntimeToolRegistry } from "../../extensions/execution-platform/src/runtime-tool-call/runtime-tool-registry.ts";
import { RuntimeToolTraceRepository } from "../../extensions/execution-platform/src/runtime-tool-call/runtime-tool-trace-repository.ts";
import { WorkQueueEventStore } from "../../extensions/execution-platform/src/work-queue/work-queue-event-store.ts";
import { WorkQueueRepository } from "../../extensions/execution-platform/src/work-queue/work-queue-repository.ts";
import { RuntimeWorkGraphRepository } from "../../extensions/execution-platform/src/workflows/runtime-work-graph-repository.ts";
import { registerSchedulerRuntimeTools } from "../../extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import {
  createGatewayStructuredRouterProvider,
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

function fixedFrontDoorProvider(
  output: CanonicalRouterOutput,
): StructuredModelIntentRouterProvider {
  return {
    async route() {
      return {
        output,
        providerRef: "fixture://gateway-front-door",
        modelCandidateId: "fixture-router",
        providerCallMade: false,
        reasonCodes: ["fixture_gateway_structured_router"],
      };
    },
  };
}

function createTestRuntimeToolKernel(
  sql: ConstructorParameters<typeof RuntimeToolTraceRepository>[0],
) {
  const registry = new RuntimeToolRegistry();
  registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });
  return new RuntimeToolKernel({
    registry,
    traces: new RuntimeToolTraceRepository(sql),
  });
}

function codingWorkflowRoute(): CanonicalRouterOutput {
  return createBaseCanonicalRouterOutput({
    route: "workflow_execution",
    responseMode: "create_runtime_job",
    executeNow: true,
    workflowId: "agent_team.coding",
    jobType: "executor.agent_team",
    confidence: 0.95,
    objectiveSummary: "Run bounded coding workflow.",
    requestedActions: [
      createCanonicalRouterAction("code_edit", "bounded edit", 0.95),
      createCanonicalRouterAction("test", "focused tests", 0.95),
      createCanonicalRouterAction("review", "review result", 0.95),
      createCanonicalRouterAction("closeout", "closeout", 0.95),
    ],
    requestedAuthority: "local_yolo",
    sideEffectClass: "code_edit",
    riskClass: "medium",
  });
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

  it("does not register the live router provider when the registry flag is disabled", () => {
    const provider = createGatewayStructuredRouterProvider({
      env: {
        vars: {
          OPENCLAW_INTENT_FRONT_DOOR_ROUTER_PROVIDER_PROFILE: "provider://fixture",
          OPENCLAW_INTENT_FRONT_DOOR_ROUTER_MODEL_REF:
            "model-route://intent-front-door/router/fixture",
          OPENCLAW_INTENT_FRONT_DOOR_ROUTER_POLICY_REF: "router-policy://fixture",
          OPENROUTER_API_KEY: "fixture-key",
        },
      },
    } as OpenClawConfig);

    expect(provider).toBeNull();
  });

  it("does not register the live router provider when its kill switch is active", () => {
    const provider = createGatewayStructuredRouterProvider({
      env: {
        vars: {
          OPENCLAW_INTENT_FRONT_DOOR_LIVE_ROUTER_ENABLED: "1",
          OPENCLAW_INTENT_FRONT_DOOR_ROUTER_KILL_SWITCH_ACTIVE: "1",
          OPENCLAW_INTENT_FRONT_DOOR_ROUTER_PROVIDER_PROFILE: "provider://fixture",
          OPENCLAW_INTENT_FRONT_DOOR_ROUTER_MODEL_REF:
            "model-route://intent-front-door/router/fixture",
          OPENCLAW_INTENT_FRONT_DOOR_ROUTER_POLICY_REF: "router-policy://fixture",
          OPENROUTER_API_KEY: "fixture-key",
        },
      },
    } as OpenClawConfig);

    expect(provider).toBeNull();
  });

  it("can register the live router provider through owner-only registry gates", () => {
    const provider = createGatewayStructuredRouterProvider({
      env: {
        vars: {
          OPENCLAW_INTENT_FRONT_DOOR_LIVE_ROUTER_ENABLED: "1",
          OPENCLAW_TWO_LANE_ROUTER_OWNER_CANARY_ENABLED: "1",
          OPENCLAW_NATIVE_EXECUTION_SUBMIT_FRONT_DOOR_ENABLED: "1",
          OPENCLAW_INTENT_FRONT_DOOR_ROUTER_PROVIDER_PROFILE: "provider://fixture",
          OPENCLAW_INTENT_FRONT_DOOR_ROUTER_MODEL_REF:
            "model-route://intent-front-door/router/fixture",
          OPENCLAW_INTENT_FRONT_DOOR_ROUTER_POLICY_REF: "router-policy://fixture",
          OPENROUTER_API_KEY: "fixture-key",
        },
      },
    } as OpenClawConfig);

    expect(provider).not.toBeNull();
  });

  it("does not register the live router provider until owner and native submit gates are enabled", () => {
    const baseVars = {
      OPENCLAW_INTENT_FRONT_DOOR_LIVE_ROUTER_ENABLED: "1",
      OPENCLAW_INTENT_FRONT_DOOR_ROUTER_PROVIDER_PROFILE: "provider://fixture",
      OPENCLAW_INTENT_FRONT_DOOR_ROUTER_MODEL_REF: "model-route://intent-front-door/router/fixture",
      OPENCLAW_INTENT_FRONT_DOOR_ROUTER_POLICY_REF: "router-policy://fixture",
      OPENROUTER_API_KEY: "fixture-key",
    };
    const baseConfig = { env: { vars: baseVars } } as OpenClawConfig;

    expect(createGatewayStructuredRouterProvider(baseConfig)).toBeNull();
    expect(
      createGatewayStructuredRouterProvider({
        env: {
          vars: {
            ...baseVars,
            OPENCLAW_TWO_LANE_ROUTER_OWNER_CANARY_ENABLED: "1",
          },
        },
      } as OpenClawConfig),
    ).toBeNull();
    expect(
      createGatewayStructuredRouterProvider({
        env: {
          vars: {
            ...baseVars,
            OPENCLAW_TWO_LANE_ROUTER_OWNER_CANARY_ENABLED: "1",
            OPENCLAW_NATIVE_EXECUTION_SUBMIT_FRONT_DOOR_ENABLED: "1",
          },
        },
      } as OpenClawConfig),
    ).not.toBeNull();
  });

  it("handles native execution.submit with an injected runtime", async () => {
    const database = await createExecutionPlatformPgMemTestDatabase();
    databases.push(database);
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic" });
    const runtimeWorkGraphs = new RuntimeWorkGraphRepository(database.sql);
    const workQueueEvents = new WorkQueueEventStore(database.sql);
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, {
      eventStore: workQueueEvents,
    });
    const runtimeToolKernel = createTestRuntimeToolKernel(database.sql);
    const nativeExecutionRpc = new NativeExecutionRpcService({
      runtimeJobs,
      workQueue,
      structuredRouterProvider: fixedFrontDoorProvider(codingWorkflowRoute()),
    });
    const response = createResponse();

    await handleExecutionPlatformHttpRequest(
      jsonRequest("/api/execution-platform/execution/submit", {
        prompt: "Have the coding team add a small regression test and close it out.",
        auth: { actorId: "operator", authenticated: true, role: "operator" },
      }),
      response.res,
      {
        config: {} as OpenClawConfig,
        runtime: {
          runtimeJobs,
          runtimeWorkGraphs,
          runtimeToolKernel,
          workQueueEvents,
          workQueue,
          nativeExecutionRpc,
        },
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
    const runtimeWorkGraphs = new RuntimeWorkGraphRepository(database.sql);
    const workQueueEvents = new WorkQueueEventStore(database.sql);
    const workQueue = new WorkQueueRepository(database.sql, runtimeJobs, {
      eventStore: workQueueEvents,
    });
    const runtimeToolKernel = createTestRuntimeToolKernel(database.sql);
    const nativeExecutionRpc = new NativeExecutionRpcService({
      runtimeJobs,
      workQueue,
      structuredRouterProvider: fixedFrontDoorProvider(codingWorkflowRoute()),
    });
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
      runtime: {
        runtimeJobs,
        runtimeWorkGraphs,
        runtimeToolKernel,
        workQueueEvents,
        workQueue,
        nativeExecutionRpc,
      },
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
