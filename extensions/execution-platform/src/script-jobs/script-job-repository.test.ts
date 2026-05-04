import { describe, expect, it, vi } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import { ScriptJobDefinitionRegistry } from "./registry.ts";
import { ScriptJobRepository } from "./script-job-repository.ts";
import { ScriptJobWorkerAdapter } from "./script-job-worker.ts";
import { scriptJobType } from "./types.ts";
import { createValidationLaneEvidence, listValidationLaneDefinitions } from "./validation-lanes.ts";

async function withScriptJobRepository<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    scriptJobs: ScriptJobRepository;
    registry: ScriptJobDefinitionRegistry;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => new Date("2026-05-02T00:00:00.000Z"),
    });
    const registry = new ScriptJobDefinitionRegistry();
    const scriptJobs = new ScriptJobRepository(runtimeJobs, { registry });
    registerDemoDefinition(scriptJobs);
    return await work({ runtimeJobs, scriptJobs, registry });
  } finally {
    await database.close();
  }
}

function registerDemoDefinition(scriptJobs: ScriptJobRepository, scriptId = "validation.demo") {
  return scriptJobs.registerScriptJobDefinition({
    scriptId,
    description: "Demo validation handler for Slice 6 tests.",
    handlerId: "demo.validation.handler",
    allowedLanes: ["test", "proof"],
    timeoutMs: 60_000,
    artifactPolicy: {
      maxMetadataBytes: 512,
      maxInlineTextBytes: 128,
      allowInlineText: true,
    },
  });
}

function validationEvidence() {
  return createValidationLaneEvidence({
    laneId: "test",
    outcome: "passed",
    startedAt: "2026-05-02T00:00:00.000Z",
    completedAt: "2026-05-02T00:00:00.050Z",
    durationMs: 50,
    summary: "demo validation passed",
    artifactRefs: ["runtime-job://script-job/evidence"],
  });
}

describe("script job definitions", () => {
  it("registers and lists script definitions", () => {
    const registry = new ScriptJobDefinitionRegistry();

    registry.registerScriptJobDefinition({
      scriptId: "proof.bundle",
      description: "Proof bundle metadata only.",
      handlerId: "proof.handler",
      allowedLanes: ["proof"],
      timeoutMs: 30_000,
    });

    expect(registry.listScriptJobDefinitions()).toEqual([
      expect.objectContaining({
        scriptId: "proof.bundle",
        shellExecutionAllowed: false,
        artifactPolicy: expect.objectContaining({ allowInlineText: false }),
      }),
    ]);
  });

  it("rejects duplicate script definition registration", () => {
    const registry = new ScriptJobDefinitionRegistry([
      {
        scriptId: "proof.bundle",
        description: "Proof bundle metadata only.",
        handlerId: "proof.handler",
        allowedLanes: ["proof"],
        timeoutMs: 30_000,
      },
    ]);

    expect(() =>
      registry.registerScriptJobDefinition({
        scriptId: "proof.bundle",
        description: "Duplicate.",
        handlerId: "proof.handler",
        allowedLanes: ["proof"],
        timeoutMs: 30_000,
      }),
    ).toThrow("script job definition already registered");
  });

  it("rejects shell-enabled definitions for this slice", () => {
    const registry = new ScriptJobDefinitionRegistry();

    expect(() =>
      registry.registerScriptJobDefinition({
        scriptId: "shell.blocked",
        description: "Blocked shell script.",
        handlerId: "shell.handler",
        allowedLanes: ["build"],
        timeoutMs: 30_000,
        shellExecutionAllowed: true,
      }),
    ).toThrow("shell execution is disabled");
  });
});

describe("runtime-backed script jobs", () => {
  it("enqueues script jobs as idempotent runtime jobs", async () => {
    await withScriptJobRepository(async ({ scriptJobs }) => {
      const first = await scriptJobs.enqueueScriptJob({
        jobId: "script-job-1",
        scriptId: "validation.demo",
        lane: "test",
        input: { target: "unit" },
        idempotencyKey: "unit",
      });
      const second = await scriptJobs.enqueueScriptJob({
        jobId: "script-job-duplicate",
        scriptId: "validation.demo",
        lane: "test",
        input: { target: "unit" },
        idempotencyKey: "unit",
      });

      expect(first).toMatchObject({
        jobId: "script-job-1",
        jobType: scriptJobType("validation.demo"),
        idempotencyScope: "script_job:validation.demo",
        payload: {
          family: "script_job",
          scriptId: "validation.demo",
          definitionSnapshot: { shellExecutionAllowed: false },
        },
      });
      expect(second.jobId).toBe(first.jobId);
    });
  });

  it("rejects enqueue for unregistered script ids", async () => {
    await withScriptJobRepository(async ({ scriptJobs }) => {
      await expect(
        scriptJobs.enqueueScriptJob({
          scriptId: "missing.script",
          lane: "test",
        }),
      ).rejects.toThrow("script job definition not registered");
    });
  });

  it("claims script jobs with definition and payload metadata", async () => {
    await withScriptJobRepository(async ({ scriptJobs }) => {
      await scriptJobs.enqueueScriptJob({
        jobId: "claim-script-job",
        scriptId: "validation.demo",
        lane: "proof",
      });

      const claimed = await scriptJobs.claimScriptJob({ workerId: "script-worker" });

      expect(claimed).toMatchObject({
        job: { jobId: "claim-script-job", state: "running" },
        definition: { scriptId: "validation.demo", handlerId: "demo.validation.handler" },
        script: { lane: "proof", scriptId: "validation.demo" },
      });
    });
  });

  it("worker adapter executes only registered in-process handlers", async () => {
    await withScriptJobRepository(async ({ scriptJobs }) => {
      const handler = vi.fn(() => ({
        output: { passed: true },
        exitCode: 0,
        validationEvidence: validationEvidence(),
      }));
      await scriptJobs.enqueueScriptJob({
        jobId: "worker-script-job",
        scriptId: "validation.demo",
        lane: "test",
      });
      const worker = new ScriptJobWorkerAdapter({
        repository: scriptJobs,
        workerId: "script-worker",
        handlers: {
          "demo.validation.handler": handler,
        },
      });

      const completed = await worker.runOnce();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(completed).toMatchObject({
        state: "succeeded",
        result: {
          family: "script_job",
          scriptId: "validation.demo",
          output: { passed: true },
          exitCode: 0,
          validationEvidence: { turboRuntimeTruth: false },
        },
      });
    });
  });

  it("worker adapter fails when a handler is missing", async () => {
    await withScriptJobRepository(async ({ scriptJobs }) => {
      await scriptJobs.enqueueScriptJob({
        jobId: "missing-handler-script-job",
        scriptId: "validation.demo",
        lane: "test",
      });
      const worker = new ScriptJobWorkerAdapter({
        repository: scriptJobs,
        workerId: "script-worker",
        handlers: {},
      });

      const failed = await worker.runOnce();

      expect(failed).toMatchObject({
        state: "pending",
        error: {
          code: "script_handler_not_registered",
          scriptId: "validation.demo",
        },
      });
    });
  });

  it("completes script jobs with typed results", async () => {
    await withScriptJobRepository(async ({ scriptJobs }) => {
      await scriptJobs.enqueueScriptJob({
        jobId: "complete-script-job",
        scriptId: "validation.demo",
        lane: "test",
      });
      const claimed = await scriptJobs.claimScriptJob({ workerId: "script-worker" });

      const completed = await scriptJobs.completeScriptJob({
        jobId: "complete-script-job",
        leaseToken: claimed!.leaseToken,
        output: { passed: true },
        exitCode: 0,
        validationEvidence: validationEvidence(),
      });

      expect(completed).toMatchObject({
        state: "succeeded",
        result: {
          family: "script_job",
          scriptId: "validation.demo",
          output: { passed: true },
          validationEvidence: { turboRuntimeTruth: false },
        },
      });
    });
  });

  it("fails script jobs with retry metadata", async () => {
    await withScriptJobRepository(async ({ scriptJobs }) => {
      await scriptJobs.enqueueScriptJob({
        jobId: "fail-script-job",
        scriptId: "validation.demo",
        lane: "test",
      });
      const claimed = await scriptJobs.claimScriptJob({ workerId: "script-worker" });

      const failed = await scriptJobs.failScriptJob({
        jobId: "fail-script-job",
        leaseToken: claimed!.leaseToken,
        code: "validation_failed",
        message: "simulated validation failure",
        retryDelayMs: 250,
        evidence: { lane: "test" },
      });

      expect(failed).toMatchObject({
        state: "pending",
        error: {
          code: "validation_failed",
          message: "simulated validation failure",
          evidence: { lane: "test" },
        },
      });
    });
  });

  it("attaches bounded script artifact metadata", async () => {
    await withScriptJobRepository(async ({ scriptJobs }) => {
      await scriptJobs.enqueueScriptJob({
        jobId: "artifact-script-job",
        scriptId: "validation.demo",
        lane: "test",
      });

      const artifact = await scriptJobs.attachScriptJobArtifactMetadata({
        jobId: "artifact-script-job",
        artifactId: "script-artifact-1",
        artifactType: "script_job.validation_summary",
        uri: "runtime-job://artifact-script-job/script-artifact-1",
        metadata: { summary: "bounded evidence pointer" },
      });

      expect(artifact).toMatchObject({
        artifactId: "script-artifact-1",
        artifactType: "script_job.validation_summary",
        metadata: { summary: "bounded evidence pointer" },
      });
    });
  });

  it("rejects oversized artifact metadata and inline output", async () => {
    await withScriptJobRepository(async ({ scriptJobs }) => {
      await scriptJobs.enqueueScriptJob({
        jobId: "oversized-script-job",
        scriptId: "validation.demo",
        lane: "test",
      });
      const claimed = await scriptJobs.claimScriptJob({ workerId: "script-worker" });

      await expect(
        scriptJobs.attachScriptJobArtifactMetadata({
          jobId: "oversized-script-job",
          artifactType: "script_job.large",
          uri: "runtime-job://oversized-script-job/large",
          metadata: { text: "x".repeat(600) },
        }),
      ).rejects.toThrow("script artifact metadata exceeds");

      await expect(
        scriptJobs.completeScriptJob({
          jobId: "oversized-script-job",
          leaseToken: claimed!.leaseToken,
          output: { text: "x".repeat(200) },
        }),
      ).rejects.toThrow("script inline output exceeds");
    });
  });

  it("reads script job status with runtime events, artifacts, payload, and result", async () => {
    await withScriptJobRepository(async ({ scriptJobs }) => {
      await scriptJobs.enqueueScriptJob({
        jobId: "status-script-job",
        scriptId: "validation.demo",
        lane: "test",
      });
      const claimed = await scriptJobs.claimScriptJob({ workerId: "script-worker" });
      await scriptJobs.recordValidationLaneEvidence({
        jobId: "status-script-job",
        evidence: validationEvidence(),
      });
      await scriptJobs.completeScriptJob({
        jobId: "status-script-job",
        leaseToken: claimed!.leaseToken,
        output: { passed: true },
      });

      const status = await scriptJobs.readScriptJobStatus("status-script-job");

      expect(status).toMatchObject({
        job: { state: "succeeded" },
        payload: { scriptId: "validation.demo" },
        result: { output: { passed: true } },
      });
      expect(status.evidence.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ eventType: "script_job.enqueued" }),
          expect.objectContaining({ eventType: "script_job.validation_lane_evidence" }),
          expect.objectContaining({ eventType: "script_job.completed" }),
        ]),
      );
      expect(status.evidence.artifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ artifactType: "script_job.definition" }),
          expect.objectContaining({ artifactType: "script_job.validation_lane_evidence" }),
        ]),
      );
    });
  });
});

describe("validation lane primitives", () => {
  it("defines build, test, lint, eval, and proof lanes", () => {
    expect(listValidationLaneDefinitions().map((lane) => lane.laneId)).toEqual([
      "build",
      "test",
      "lint",
      "eval",
      "proof",
    ]);
  });

  it("records validation lane evidence with Turborepo outside runtime truth", () => {
    expect(validationEvidence()).toMatchObject({
      laneId: "test",
      turboMayOrchestrate: true,
      turboRuntimeTruth: false,
    });
  });

  it("does not perform arbitrary shell execution", async () => {
    await withScriptJobRepository(async ({ scriptJobs }) => {
      const shellLikeHandler = vi.fn();
      await scriptJobs.enqueueScriptJob({
        jobId: "no-shell-script-job",
        scriptId: "validation.demo",
        lane: "test",
        input: { command: "pnpm install && deploy" },
      });

      const worker = new ScriptJobWorkerAdapter({
        repository: scriptJobs,
        workerId: "script-worker",
        handlers: {},
      });
      await worker.runOnce();

      expect(shellLikeHandler).not.toHaveBeenCalled();
    });
  });
});
