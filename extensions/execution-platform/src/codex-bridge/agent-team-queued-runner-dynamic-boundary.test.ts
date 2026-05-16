import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { createModelAuthoredCloseoutCapsuleFixture } from "../workers/test-closeout-capsule-fixture.ts";
import { RuntimeWorkGraphRepository } from "../workflows/runtime-work-graph-repository.ts";
import { AgentTeamQueuedRunner } from "./agent-team-queued-runner.ts";
import { AGENT_TEAM_JOB_TYPE } from "./agent-team-runtime-evidence.ts";
import { closeoutCapsuleToLegacyHumanSummary } from "./closeout-capsule.ts";

describe("agent-team dynamic graph boundary", () => {
  it("does not fall back to the static single-job sequence when live coding-team execution is configured", async () => {
    const database = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(database.sql);
      const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic" });
      const runtimeWorkGraphs = new RuntimeWorkGraphRepository(database.sql);
      await runtimeJobs.enqueueJob({
        jobId: "dynamic-boundary-job",
        jobType: AGENT_TEAM_JOB_TYPE,
        queueName: "agent-team",
        payload: {
          workflowId: "agent_team.coding",
          objectiveSummary: "Make a bounded source edit through the dynamic graph path.",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });

      const result = await new AgentTeamQueuedRunner({
        runtimeJobs,
        runtimeWorkGraphs,
        workerId: "dynamic-boundary-worker",
        queueName: "agent-team",
        roleModelClient: {
          async callRole() {
            throw new Error("static_role_model_client_should_not_run");
          },
        },
        implementationBridge: {
          async run() {
            throw new Error("static_implementation_bridge_should_not_run");
          },
        },
        closeoutReporter: {
          async createCapsule(input) {
            const capsule = createModelAuthoredCloseoutCapsuleFixture({
              runtimeJobId: "dynamic-boundary-job",
              teamRunId: input.factualRefs.teamRunId ?? null,
              workflowId: "agent_team.coding",
            });
            return {
              source: "model" as const,
              capsule,
              legacyHumanSummary: closeoutCapsuleToLegacyHumanSummary(capsule),
              reasonCodes: ["fixture_model_closeout_created"],
              rawPromptStored: false as const,
              rawResponseStored: false as const,
              rawProviderLogStored: false as const,
            };
          },
        },
      }).runOnce();

      expect(result.failed).toBe(true);
      expect(result.failure?.message).toMatch(/dynamic_runtime_work_graph_required/u);
      expect(result.failure?.message).toMatch(/scheduler tool kernel/u);
    } finally {
      await database.close();
    }
  });
});
