import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { createModelAuthoredCloseoutCapsuleFixture } from "./test-closeout-capsule-fixture.ts";
import {
  evaluateWorkerCloseoutCapsule,
  recordWorkerCloseoutCapsule,
} from "./worker-closeout-capsule.ts";

describe("worker closeout capsule placement", () => {
  it("accepts bounded model-authored closeout as clean success evidence", () => {
    const capsule = createModelAuthoredCloseoutCapsuleFixture({
      runtimeJobId: "job-closeout",
    });

    expect(evaluateWorkerCloseoutCapsule({ capsule })).toMatchObject({
      acceptedForCleanSuccess: true,
      humanReportSource: "model",
      taskSuccess: "satisfied",
      reasonCodes: ["model_authored_closeout_capsule_clean"],
    });
  });

  it("rejects missing, degraded, unsatisfied, and side-effect-claiming closeouts", () => {
    expect(evaluateWorkerCloseoutCapsule({ capsule: null })).toMatchObject({
      acceptedForCleanSuccess: false,
      reasonCodes: ["model_authored_closeout_capsule_missing"],
    });
    expect(
      evaluateWorkerCloseoutCapsule({
        capsule: createModelAuthoredCloseoutCapsuleFixture({
          runtimeJobId: "job-degraded",
          humanReportSource: "degraded_system_fallback",
        }),
      }),
    ).toMatchObject({
      acceptedForCleanSuccess: false,
      reasonCodes: expect.arrayContaining(["closeout_capsule_human_report_not_model_authored"]),
    });
    expect(
      evaluateWorkerCloseoutCapsule({
        capsule: createModelAuthoredCloseoutCapsuleFixture({
          runtimeJobId: "job-unsatisfied",
          taskSuccess: "needs_review",
        }),
      }),
    ).toMatchObject({
      acceptedForCleanSuccess: false,
      reasonCodes: expect.arrayContaining(["closeout_capsule_task_success_not_satisfied"]),
    });
    expect(
      evaluateWorkerCloseoutCapsule({
        capsule: {
          ...createModelAuthoredCloseoutCapsuleFixture({
            runtimeJobId: "job-authority",
          }),
          safetyFlags: {
            ...createModelAuthoredCloseoutCapsuleFixture({
              runtimeJobId: "job-authority",
            }).safetyFlags,
            authorityGrantedByCloseout: true,
          },
        } as never,
      }),
    ).toMatchObject({
      acceptedForCleanSuccess: false,
      reasonCodes: expect.arrayContaining([
        "closeout_capsule_schema_invalid",
        "closeout_capsule_claims_authority_grant",
      ]),
    });
  });

  it("records capsule and evaluation as runtime artifacts at the worker boundary", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const repository = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      await repository.enqueueJob({
        jobId: "job-record-closeout",
        jobType: "executor.agent_team",
      });
      const capsule = createModelAuthoredCloseoutCapsuleFixture({
        runtimeJobId: "job-record-closeout",
      });

      const evaluation = await recordWorkerCloseoutCapsule({
        runtimeJobs: repository,
        capsule,
      });

      expect(evaluation.acceptedForCleanSuccess).toBe(true);
      const artifacts = await repository.listArtifacts("job-record-closeout");
      expect(artifacts.map((artifact) => artifact.artifactType)).toEqual(
        expect.arrayContaining([
          "execution_platform.closeout_capsule",
          "runtime_worker.closeout_capsule_evaluation",
        ]),
      );
      expect(JSON.stringify(artifacts)).not.toContain('"rawPromptStored":true');
    } finally {
      await db.close();
    }
  });
});
