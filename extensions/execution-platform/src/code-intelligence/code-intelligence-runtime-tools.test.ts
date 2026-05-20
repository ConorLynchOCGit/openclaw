import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeToolKernel } from "../runtime-tool-call/runtime-tool-kernel.ts";
import { RuntimeToolRegistry } from "../runtime-tool-call/runtime-tool-registry.ts";
import { RuntimeToolTraceRepository } from "../runtime-tool-call/runtime-tool-trace-repository.ts";
import {
  registerSchedulerRuntimeTools,
  SCHEDULER_RUNTIME_TOOL_IDS,
} from "../workflows/scheduler-runtime-tools.ts";
import { isCodeIntelligenceRuntimeToolId } from "./code-intelligence-runtime-tools.ts";
import { createCodeIntelligenceService } from "./code-intelligence-service.ts";
import { CODE_INTELLIGENCE_RUNTIME_TOOL_IDS } from "./types.ts";

async function withFixture<T>(work: (rootDir: string) => Promise<T>): Promise<T> {
  const rootDir = await mkdtemp(path.join(tmpdir(), "openclaw-code-intelligence-tools-"));
  try {
    await writeFile(
      path.join(rootDir, "runtime.ts"),
      ["export class RuntimeThing {", "  run(): string {", '    return "ok";', "  }", "}"].join(
        "\n",
      ),
      "utf8",
    );
    return await work(rootDir);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
}

describe("code intelligence runtime tools", () => {
  it("registers as scheduler-discoverable runtime tools and records bounded trace evidence", async () => {
    await withFixture(async (rootDir) => {
      const database = await createExecutionPlatformPgMemTestDatabase();
      try {
        await applyExecutionPlatformMigrations(database.sql);
        const registry = new RuntimeToolRegistry();
        registerSchedulerRuntimeTools({
          registry,
          codeIntelligenceService: createCodeIntelligenceService({ rootDir }),
        });
        expect(SCHEDULER_RUNTIME_TOOL_IDS).toEqual(
          expect.arrayContaining([...CODE_INTELLIGENCE_RUNTIME_TOOL_IDS]),
        );
        expect(registry.require("code.search_symbols").definition).toMatchObject({
          toolFamily: "code_intelligence.query",
          authorityClass: "read_only",
          rawPromptStored: false,
        });

        const kernel = new RuntimeToolKernel({
          registry,
          traces: new RuntimeToolTraceRepository(database.sql),
        });
        const result = await kernel.invoke({
          toolId: "code.search_symbols",
          runtimeJobId: null,
          graphId: null,
          nodeId: null,
          roleRef: "context_scout",
          modelRef: "model://none",
          idempotencyScope: "code-intelligence-test",
          idempotencyKey: "search-runtime-thing",
          inputSummary: "Find RuntimeThing.",
          volatileInput: { query: "RuntimeThing" },
          rawPromptStored: false,
          rawResponseStored: false,
          rawTranscriptStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
          rawCommandLogStored: false,
          rawDbRowsStored: false,
          secretsStored: false,
        });

        expect(result.invocation.status).toBe("succeeded");
        expect(result.invocation.outputRef).toMatch(
          /^code-intelligence:\/\/code\.search_symbols\//u,
        );
        expect(result.invocation.metadata).toMatchObject({
          artifactKind: "code_intelligence_result",
          semanticMode: "typescript_semantic",
          backendId: "typescript_language_service",
          fallbackUsed: false,
          rawToolLogStored: false,
        });
      } finally {
        await database.close();
      }
    });
  });

  it("guards the runtime tool id set", () => {
    expect(isCodeIntelligenceRuntimeToolId("code.find_impact_radius")).toBe(true);
    expect(isCodeIntelligenceRuntimeToolId("worker.invoke")).toBe(false);
  });
});
