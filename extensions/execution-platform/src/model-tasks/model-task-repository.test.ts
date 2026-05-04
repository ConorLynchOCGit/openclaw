import { describe, expect, it, vi } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  createDefaultModelTaskContractRegistry,
  INITIAL_MODEL_TASK_CONTRACTS,
} from "./contracts.ts";
import { classifyModelTaskFallback } from "./fallback.ts";
import { ModelTaskRepository } from "./model-task-repository.ts";
import { ModelTaskContractRegistry } from "./registry.ts";
import { modelTaskJobType } from "./types.ts";

async function withModelTaskRepository<T>(
  work: (input: {
    runtimeJobs: RuntimeJobRepository;
    modelTasks: ModelTaskRepository;
    registry: ModelTaskContractRegistry;
  }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => new Date("2026-05-02T00:00:00.000Z"),
    });
    const registry = createDefaultModelTaskContractRegistry();
    const modelTasks = new ModelTaskRepository(runtimeJobs, { registry });
    return await work({ runtimeJobs, modelTasks, registry });
  } finally {
    await database.close();
  }
}

function validInput() {
  return {
    task: "classify candidate",
    input: { candidate: "use concise answers" },
    constraints: ["return structured JSON"],
  };
}

function validOutput() {
  return {
    result: { label: "preference", confidenceScore: 0.9 },
    confidence: "high",
    evidence: ["matched bounded preference statement"],
  };
}

describe("model task middleware", () => {
  it("registers and lists the five initial structured JSON contracts", () => {
    const registry = createDefaultModelTaskContractRegistry();

    expect(registry.list().map((contract) => contract.id)).toEqual([
      "model_memory.structured_json",
      "outcome_pack_review.structured_json",
      "proactivity.structured_json",
      "retrieval.structured_json",
      "skillifier.structured_json",
    ]);
  });

  it("rejects duplicate contract registration", () => {
    const registry = new ModelTaskContractRegistry([INITIAL_MODEL_TASK_CONTRACTS[0]!]);

    expect(() => registry.register(INITIAL_MODEL_TASK_CONTRACTS[0]!)).toThrow(
      "model task contract already registered",
    );
  });

  it("rejects invalid task input and output by contract schema", () => {
    const registry = createDefaultModelTaskContractRegistry();

    expect(registry.validateInput("model_memory.structured_json", { input: {} })).toMatchObject({
      ok: false,
      schema: "input",
    });
    expect(
      registry.validateOutput("model_memory.structured_json", { confidence: "high" }),
    ).toMatchObject({
      ok: false,
      schema: "output",
    });
  });

  it("enqueues a model task as an idempotent runtime job", async () => {
    await withModelTaskRepository(async ({ modelTasks }) => {
      const first = await modelTasks.enqueueModelTask({
        jobId: "model-task-job",
        contractId: "model_memory.structured_json",
        input: validInput(),
        idempotencyKey: "candidate-1",
      });
      const second = await modelTasks.enqueueModelTask({
        jobId: "duplicate-job",
        contractId: "model_memory.structured_json",
        input: validInput(),
        idempotencyKey: "candidate-1",
      });

      expect(first).toMatchObject({
        jobId: "model-task-job",
        jobType: modelTaskJobType("model_memory.structured_json"),
        idempotencyScope: "model_task:model_memory.structured_json",
      });
      expect(second.jobId).toBe(first.jobId);
    });
  });

  it("claims model task jobs with contract metadata", async () => {
    await withModelTaskRepository(async ({ modelTasks }) => {
      await modelTasks.enqueueModelTask({
        jobId: "claim-model-task",
        contractId: "retrieval.structured_json",
        input: validInput(),
      });

      const claimed = await modelTasks.claimModelTask({ workerId: "model-worker" });

      expect(claimed).toMatchObject({
        job: { jobId: "claim-model-task", state: "running" },
        contract: { id: "retrieval.structured_json" },
        task: { contractId: "retrieval.structured_json" },
      });
    });
  });

  it("completes a task only after output schema validation", async () => {
    await withModelTaskRepository(async ({ modelTasks }) => {
      await modelTasks.enqueueModelTask({
        jobId: "complete-model-task",
        contractId: "proactivity.structured_json",
        input: validInput(),
      });
      const claimed = await modelTasks.claimModelTask({ workerId: "model-worker" });

      const completed = await modelTasks.completeModelTask({
        jobId: "complete-model-task",
        leaseToken: claimed!.leaseToken,
        output: validOutput(),
        routeEvidence: {
          reason: "test supplied structured output; provider execution disabled",
        },
      });

      expect(completed).toMatchObject({
        state: "succeeded",
        result: {
          family: "model_task",
          contractId: "proactivity.structured_json",
          output: validOutput(),
        },
      });
    });
  });

  it("classifies invalid output as schema failure and fallback eligible", async () => {
    await withModelTaskRepository(async ({ modelTasks }) => {
      await modelTasks.enqueueModelTask({
        jobId: "invalid-output-task",
        contractId: "skillifier.structured_json",
        input: validInput(),
      });
      const claimed = await modelTasks.claimModelTask({ workerId: "model-worker" });

      const failed = await modelTasks.completeModelTask({
        jobId: "invalid-output-task",
        leaseToken: claimed!.leaseToken,
        output: { confidence: "high" },
      });
      const status = await modelTasks.readModelTaskStatus("invalid-output-task");

      expect(failed).toMatchObject({
        state: "pending",
        error: {
          code: "model_task_output_invalid",
          fallback: {
            failureKind: "schema_validation_failure",
            fallbackEligible: true,
            executeFallback: false,
          },
        },
      });
      expect(status.evidence.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ eventType: "model_task.output_invalid" }),
        ]),
      );
      expect(status.evidence.artifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ artifactType: "model_task.fallback_classification" }),
        ]),
      );
    });
  });

  it("classifies provider, timeout, rate-limit, and transport failures as fallback eligible", () => {
    for (const failureKind of [
      "provider_failure",
      "timeout",
      "rate_limit",
      "transport_error",
    ] as const) {
      expect(classifyModelTaskFallback({ failureKind })).toMatchObject({
        failureKind,
        fallbackEligible: true,
        executeFallback: false,
      });
    }
  });

  it("does not classify a valid-but-unwanted judgment as fallback eligible", () => {
    expect(
      classifyModelTaskFallback({
        failureKind: "valid_judgment_rejected",
        evidence: { judgmentWasSchemaValid: true },
      }),
    ).toMatchObject({
      fallbackEligible: false,
      executeFallback: false,
    });
  });

  it("persists route metadata, validation evidence, and fallback evidence", async () => {
    await withModelTaskRepository(async ({ modelTasks }) => {
      await modelTasks.enqueueModelTask({
        jobId: "evidence-task",
        contractId: "outcome_pack_review.structured_json",
        input: validInput(),
        routeEvidence: {
          reason: "test route policy only; no provider call",
        },
      });
      const claimed = await modelTasks.claimModelTask({ workerId: "model-worker" });
      await modelTasks.failModelTask({
        jobId: "evidence-task",
        leaseToken: claimed!.leaseToken,
        failureKind: "rate_limit",
        message: "simulated 429",
        evidence: { statusCode: 429 },
      });

      const status = await modelTasks.readModelTaskStatus("evidence-task");

      expect(status.task?.routeEvidence.providerCallMade).toBe(false);
      expect(status.evidence.events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ eventType: "model_task.enqueued" }),
          expect.objectContaining({ eventType: "model_task.failure_classified" }),
        ]),
      );
      expect(status.evidence.artifacts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ artifactType: "model_task.route_evidence" }),
          expect.objectContaining({ artifactType: "model_task.fallback_classification" }),
        ]),
      );
    });
  });

  it("does not make provider calls while enqueuing, claiming, or completing model tasks", async () => {
    await withModelTaskRepository(async ({ modelTasks }) => {
      const providerCall = vi.fn();
      await modelTasks.enqueueModelTask({
        jobId: "no-provider-call",
        contractId: "model_memory.structured_json",
        input: validInput(),
      });
      const claimed = await modelTasks.claimModelTask({ workerId: "model-worker" });
      await modelTasks.completeModelTask({
        jobId: "no-provider-call",
        leaseToken: claimed!.leaseToken,
        output: validOutput(),
      });

      expect(providerCall).not.toHaveBeenCalled();
    });
  });
});
