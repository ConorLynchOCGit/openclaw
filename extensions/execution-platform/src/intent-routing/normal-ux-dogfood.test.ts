import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { WorkQueueRepository } from "../work-queue/work-queue-repository.ts";
import {
  createNormalUxDogfoodScenarios,
  runNormalUxPromptToWorkflowDogfood,
} from "./normal-ux-dogfood.ts";

describe("normal UX prompt-to-workflow dogfood", () => {
  async function withRuntime<T>(
    work: (input: {
      runtimeJobs: RuntimeJobRepository;
      workQueue: WorkQueueRepository;
    }) => Promise<T>,
  ): Promise<T> {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const workQueue = new WorkQueueRepository(db.sql, runtimeJobs);
      return await work({ runtimeJobs, workQueue });
    } finally {
      await db.close();
    }
  }

  it("routes normal UX prompt classes through bounded front-door fixtures", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const result = await runNormalUxPromptToWorkflowDogfood({ runtimeJobs, workQueue });

      expect(result.status).toBe("completed");
      expect(result.scenarioCount).toBe(createNormalUxDogfoodScenarios().length);
      expect(result.normalChatPreserved).toBe(true);
      expect(result.planOnlyPreserved).toBe(true);
      expect(result.executionRouted).toBe(true);
      expect(result.slashBypassed).toBe(true);
      expect(result.noFalseExecution).toBe(true);
      expect(result.runtimeJobIds.length).toBeGreaterThan(0);
      expect(result.authorityGranted).toBe(false);
      expect(result.deployPerformed).toBe(false);
      expect(result.outboundSendPerformed).toBe(false);
      expect(result.workQueueLifecycleMutated).toBe(false);
      expect(result.rawPromptStored).toBe(false);
      expect(result.rawResponseStored).toBe(false);
      expect(result.rawProviderLogStored).toBe(false);
    });
  });

  it("keeps chat, plan-only, negation, conditionals, and slash from creating runtime jobs", async () => {
    await withRuntime(async ({ runtimeJobs, workQueue }) => {
      const result = await runNormalUxPromptToWorkflowDogfood({ runtimeJobs, workQueue });
      const nonExecution = result.results.filter((scenario) =>
        [
          "normal_chat",
          "plan_only",
          "negated_outbound",
          "conditional_deploy",
          "slash_protocol",
        ].includes(scenario.scenarioId),
      );

      expect(nonExecution.every((scenario) => !scenario.runtimeJobCreated)).toBe(true);
      expect(
        result.results.find((scenario) => scenario.scenarioId === "slash_protocol"),
      ).toMatchObject({
        protocolBypassed: true,
        runtimeJobCreated: false,
      });
      expect(
        result.results.find((scenario) => scenario.scenarioId === "coding_team"),
      ).toMatchObject({
        route: "workflow_execution",
        runtimeJobCreated: true,
      });
      expect(await runtimeJobs.listRecentJobs()).toHaveLength(result.runtimeJobIds.length);
    });
  });
});
