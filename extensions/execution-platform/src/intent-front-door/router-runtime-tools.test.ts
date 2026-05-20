import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import { RuntimeToolRegistry } from "../runtime-tool-call/runtime-tool-registry.ts";
import { RuntimeToolTraceRepository } from "../runtime-tool-call/runtime-tool-trace-repository.ts";
import {
  invokeRouterFrontDoorRuntimeTool,
  registerRouterFrontDoorRuntimeTools,
  ROUTER_FRONT_DOOR_RUNTIME_TOOL_IDS,
} from "./router-runtime-tools.ts";

describe("router front-door runtime tools", () => {
  it("registers every staged router tool as executable front-door protocol", () => {
    const registry = new RuntimeToolRegistry();
    registerRouterFrontDoorRuntimeTools({ registry });

    for (const toolId of ROUTER_FRONT_DOOR_RUNTIME_TOOL_IDS) {
      const registered = registry.require(toolId);
      expect(registered.definition).toMatchObject({
        toolId,
        toolVersion: "v1",
        toolFamily: "router.front_door",
        enabled: true,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        secretsStored: false,
      });
      expect(registered.executor).toBeDefined();
    }
  });

  it("records pre-job front-door tool traces without requiring a runtime graph", async () => {
    const database = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(database.sql);
      const registry = new RuntimeToolRegistry();
      registerRouterFrontDoorRuntimeTools({ registry });
      const traces = new RuntimeToolTraceRepository(database.sql);
      const kernel = new RuntimeToolKernel({ registry, traces });

      const result = await invokeRouterFrontDoorRuntimeTool({
        kernel,
        toolId: "router.classify_owner_turn_intent",
        runtimeJobId: null,
        requestId: "front-door-before-runtime-job",
        idempotencyKey: "front-door-before-runtime-job:classify",
        inputHash: "prompt-hash",
        inputSummary: "Classify a long owner prompt before the runtime work graph exists.",
        metadata: {
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });

      const invocation = await traces.readInvocation(result.invocationRef.split("/").at(-1) ?? "");
      expect(result.status).toBe("succeeded");
      expect(invocation).toMatchObject({
        runtimeJobId: null,
        graphId: null,
        nodeId: null,
        toolId: "router.classify_owner_turn_intent",
        rawPromptStored: false,
        rawResponseStored: false,
      });
      expect(invocation?.metadata).toMatchObject({
        requestId: "front-door-before-runtime-job",
        frontDoorScopeRef: "router-front-door:front-door-before-runtime-job",
      });
    } finally {
      await database.close();
    }
  });
});
