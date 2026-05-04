import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "./db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "./db/pg-test.ts";
import { RuntimeJobRepository } from "./runtime-job-repository.ts";

async function withRepository<T>(
  work: (input: { repository: RuntimeJobRepository; setNow: (next: Date) => void }) => Promise<T>,
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  let now = new Date("2026-05-02T00:00:00.000Z");
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const repository = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => now,
      maxArtifactSizeBytes: 100,
      maxArtifactMetadataBytes: 80,
    });
    return await work({
      repository,
      setNow(next) {
        now = next;
      },
    });
  } finally {
    await database.close();
  }
}

describe("runtime job repository", () => {
  it("enqueues and reads back a job", async () => {
    await withRepository(async ({ repository }) => {
      const job = await repository.enqueueJob({
        jobId: "job-readback",
        jobType: "demo.echo",
        payload: { message: "hello" },
      });

      await expect(repository.getJob(job.jobId)).resolves.toMatchObject({
        jobId: "job-readback",
        jobType: "demo.echo",
        state: "pending",
        payload: { message: "hello" },
      });
    });
  });

  it("deduplicates enqueue by idempotency scope and key", async () => {
    await withRepository(async ({ repository }) => {
      const first = await repository.enqueueJob({
        jobId: "job-first",
        jobType: "demo.echo",
        idempotencyKey: "same-input",
      });
      const second = await repository.enqueueJob({
        jobId: "job-second",
        jobType: "demo.echo",
        idempotencyKey: "same-input",
      });

      expect(second.jobId).toBe(first.jobId);
    });
  });

  it("claims a pending job once across concurrent workers", async () => {
    await withRepository(async ({ repository }) => {
      await repository.enqueueJob({ jobId: "job-claim-once", jobType: "demo.echo" });

      const claims = await Promise.all([
        repository.claimNextJob({ workerId: "worker-a" }),
        repository.claimNextJob({ workerId: "worker-b" }),
      ]);

      expect(claims.filter(Boolean)).toHaveLength(1);
      expect(claims.find(Boolean)?.job).toMatchObject({
        jobId: "job-claim-once",
        state: "running",
        attempts: 1,
      });
    });
  });

  it("renews an active lease", async () => {
    await withRepository(async ({ repository, setNow }) => {
      await repository.enqueueJob({
        jobId: "job-renew",
        jobType: "demo.echo",
        leaseTimeoutMs: 10_000,
      });
      const claimed = await repository.claimNextJob({ workerId: "worker-a" });
      expect(claimed).toBeTruthy();

      setNow(new Date("2026-05-02T00:00:05.000Z"));
      const renewed = await repository.renewLease({
        leaseToken: claimed!.leaseToken,
        workerId: "worker-a",
      });

      expect(renewed?.leaseExpiresAt?.toISOString()).toBe("2026-05-02T00:00:15.000Z");
      await expect(repository.listEvents("job-renew")).resolves.toEqual(
        expect.arrayContaining([expect.objectContaining({ eventType: "job.lease_renewed" })]),
      );
    });
  });

  it("recovers expired leases back to pending", async () => {
    await withRepository(async ({ repository, setNow }) => {
      await repository.enqueueJob({
        jobId: "job-expired",
        jobType: "demo.echo",
        leaseTimeoutMs: 1_000,
        maxAttempts: 2,
      });
      await repository.claimNextJob({ workerId: "worker-a" });

      setNow(new Date("2026-05-02T00:00:02.000Z"));
      const recovered = await repository.recoverExpiredLeases();

      expect(recovered).toHaveLength(1);
      expect(recovered[0]).toMatchObject({ jobId: "job-expired", state: "pending" });
      await expect(repository.claimNextJob({ workerId: "worker-b" })).resolves.toMatchObject({
        job: { jobId: "job-expired", attempts: 2 },
      });
    });
  });

  it("retries failures until the attempt cap is reached", async () => {
    await withRepository(async ({ repository }) => {
      await repository.enqueueJob({
        jobId: "job-retry",
        jobType: "demo.echo",
        maxAttempts: 2,
      });
      const firstClaim = await repository.claimNextJob({ workerId: "worker-a" });
      const firstFailure = await repository.failJob({
        leaseToken: firstClaim!.leaseToken,
        error: { code: "first_failure" },
      });

      expect(firstFailure).toMatchObject({ state: "pending", attempts: 1 });

      const secondClaim = await repository.claimNextJob({ workerId: "worker-b" });
      const finalFailure = await repository.failJob({
        leaseToken: secondClaim!.leaseToken,
        error: { code: "second_failure" },
      });

      expect(finalFailure).toMatchObject({
        state: "failed",
        attempts: 2,
        error: { code: "second_failure" },
      });
    });
  });

  it("cancels a pending job", async () => {
    await withRepository(async ({ repository }) => {
      await repository.enqueueJob({ jobId: "job-cancel-pending", jobType: "demo.echo" });

      const canceled = await repository.cancelJob("job-cancel-pending", "user request");

      expect(canceled).toMatchObject({
        state: "canceled",
        cancellationReason: "user request",
      });
    });
  });

  it("cancels a running job and releases its lease", async () => {
    await withRepository(async ({ repository }) => {
      await repository.enqueueJob({ jobId: "job-cancel-running", jobType: "demo.echo" });
      const claimed = await repository.claimNextJob({ workerId: "worker-a" });

      const canceled = await repository.cancelJob("job-cancel-running", "operator stop");
      const renewAfterCancel = await repository.renewLease({
        leaseToken: claimed!.leaseToken,
        workerId: "worker-a",
      });

      expect(canceled).toMatchObject({ state: "canceled" });
      expect(renewAfterCancel).toBeNull();
    });
  });

  it("marks running jobs timed out", async () => {
    await withRepository(async ({ repository, setNow }) => {
      await repository.enqueueJob({
        jobId: "job-timeout",
        jobType: "demo.echo",
        runTimeoutMs: 1_000,
      });
      await repository.claimNextJob({ workerId: "worker-a" });

      setNow(new Date("2026-05-02T00:00:02.000Z"));
      const timedOut = await repository.markTimedOutJobs();

      expect(timedOut).toHaveLength(1);
      expect(timedOut[0]).toMatchObject({
        jobId: "job-timeout",
        state: "timed_out",
        error: { code: "job_timed_out" },
      });
    });
  });

  it("completes and finalizes a claimed job", async () => {
    await withRepository(async ({ repository }) => {
      await repository.enqueueJob({ jobId: "job-complete", jobType: "demo.echo" });
      const claimed = await repository.claimNextJob({ workerId: "worker-a" });

      const completed = await repository.completeJob({
        leaseToken: claimed!.leaseToken,
        result: { ok: true },
      });

      expect(completed).toMatchObject({
        state: "succeeded",
        result: { ok: true },
        workerId: null,
        leaseId: null,
      });
    });
  });

  it("persists lifecycle events", async () => {
    await withRepository(async ({ repository }) => {
      await repository.enqueueJob({ jobId: "job-events", jobType: "demo.echo" });
      await repository.recordEvent({
        jobId: "job-events",
        eventType: "job.note",
        data: { note: "inspection" },
      });

      await expect(repository.listEvents("job-events")).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ eventType: "job.enqueued" }),
          expect.objectContaining({ eventType: "job.note", data: { note: "inspection" } }),
        ]),
      );
    });
  });

  it("persists bounded artifact metadata", async () => {
    await withRepository(async ({ repository }) => {
      await repository.enqueueJob({ jobId: "job-artifact", jobType: "demo.echo" });

      const artifact = await repository.attachArtifact({
        jobId: "job-artifact",
        artifactType: "stdout",
        storageKind: "object-store",
        uri: "artifact://job-artifact/stdout",
        contentType: "text/plain",
        sizeBytes: 10,
        metadata: { redacted: false },
      });

      expect(artifact).toMatchObject({
        jobId: "job-artifact",
        artifactType: "stdout",
        storageKind: "object-store",
      });
      await expect(
        repository.attachArtifact({
          jobId: "job-artifact",
          artifactType: "large",
          storageKind: "object-store",
          uri: "artifact://job-artifact/large",
          sizeBytes: 101,
        }),
      ).rejects.toThrow("artifact sizeBytes exceeds 100");
      await expect(repository.listArtifacts("job-artifact")).resolves.toHaveLength(1);
    });
  });

  it("persists parent and future workflow linkage", async () => {
    await withRepository(async ({ repository }) => {
      await repository.enqueueJob({ jobId: "job-parent", jobType: "demo.parent" });
      const child = await repository.enqueueJob({
        jobId: "job-child",
        jobType: "demo.child",
        parentJobId: "job-parent",
        parentWorkflowId: "workflow-1",
        workItemId: "work-item-1",
      });

      expect(child).toMatchObject({
        parentJobId: "job-parent",
        parentWorkflowId: "workflow-1",
        workItemId: "work-item-1",
      });
    });
  });
});
