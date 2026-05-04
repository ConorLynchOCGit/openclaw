import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "./db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "./db/pg-test.ts";
import { RuntimeJobRepository } from "./runtime-job-repository.ts";
import { RuntimeJobWorker } from "./runtime-job-worker.ts";

describe("runtime job worker", () => {
  it("runs registered demo handlers without wiring live executors", async () => {
    const database = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(database.sql);
      const repository = new RuntimeJobRepository(database.sql, {
        claimStrategy: "basic",
        now: () => new Date("2026-05-02T00:00:00.000Z"),
      });
      await repository.enqueueJob({
        jobId: "job-worker",
        jobType: "demo.echo",
        payload: { message: "hello" },
      });
      const worker = new RuntimeJobWorker({
        repository,
        workerId: "worker-demo",
        handlers: {
          "demo.echo": async (job) => ({
            result: { echoed: job.payload },
          }),
        },
      });

      const processed = await worker.runUntilIdle();

      expect(processed).toEqual([
        expect.objectContaining({
          jobId: "job-worker",
          state: "succeeded",
          result: { echoed: { message: "hello" } },
        }),
      ]);
    } finally {
      await database.close();
    }
  });
});
