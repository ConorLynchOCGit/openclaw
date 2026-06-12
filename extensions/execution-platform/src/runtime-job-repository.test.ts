import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "./db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "./db/pg-test.ts";
import {
  RUNTIME_JOB_ARTIFACT_PAYLOAD_STORAGE_KIND,
  RuntimeJobRepository,
  type RuntimeJobRepositoryOptions,
} from "./runtime-job-repository.ts";

async function withRepository<T>(
  work: (input: { repository: RuntimeJobRepository; setNow: (next: Date) => void }) => Promise<T>,
  options: Pick<
    RuntimeJobRepositoryOptions,
    "maxArtifactSizeBytes" | "maxArtifactMetadataBytes"
  > = {},
): Promise<T> {
  const database = await createExecutionPlatformPgMemTestDatabase();
  let now = new Date("2026-05-02T00:00:00.000Z");
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const repository = new RuntimeJobRepository(database.sql, {
      claimStrategy: "basic",
      now: () => now,
      maxArtifactSizeBytes: options.maxArtifactSizeBytes ?? 100,
      maxArtifactMetadataBytes: options.maxArtifactMetadataBytes ?? 80,
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

  it("lists bounded artifact windows without hydrating every artifact row", async () => {
    await withRepository(async ({ repository, setNow }) => {
      await repository.enqueueJob({ jobId: "job-artifact-window", jobType: "demo.echo" });

      for (let index = 0; index < 5; index += 1) {
        setNow(new Date(`2026-05-02T00:00:0${index}.000Z`));
        await repository.attachArtifact({
          jobId: "job-artifact-window",
          artifactType: `artifact-${index}`,
          storageKind: "object-store",
          uri: `artifact://job-artifact-window/${index}`,
          sizeBytes: 10,
        });
      }

      await expect(
        repository
          .listArtifacts("job-artifact-window", { limit: 2 })
          .then((artifacts) => artifacts.map((artifact) => artifact.artifactType)),
      ).resolves.toEqual(["artifact-0", "artifact-1"]);
      await expect(
        repository
          .listArtifacts("job-artifact-window", { limit: 2, order: "desc" })
          .then((artifacts) => artifacts.map((artifact) => artifact.artifactType)),
      ).resolves.toEqual(["artifact-3", "artifact-4"]);
    });
  });

  it("stores large JSON payload artifacts behind bounded manifests", async () => {
    await withRepository(
      async ({ repository }) => {
        await repository.enqueueJob({ jobId: "job-payload-artifact", jobType: "demo.echo" });

        const fullBody = {
          artifactKind: "execution_platform.node_execution_snapshot",
          snapshotRef: "runtime-job://job-payload-artifact/node-execution-snapshot/node-1",
          content: "node execution snapshot body ".repeat(400),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        };
        const artifact = await repository.attachRuntimeArtifactByContract({
          jobId: "job-payload-artifact",
          artifactType: "execution_platform.node_execution_snapshot",
          uri: "runtime-job://job-payload-artifact/node-execution-snapshot/node-1",
          body: fullBody,
          boundedSummary: "Node execution snapshot payload.",
          targetCommitmentIds: ["c-001"],
          targetNodeIds: ["node-1"],
          readinessStatus: "ready",
          reasonCodes: ["node_execution_snapshot_persisted_as_payload"],
        });

        expect(artifact).toMatchObject({
          jobId: "job-payload-artifact",
          artifactType: "execution_platform.node_execution_snapshot",
          storageKind: RUNTIME_JOB_ARTIFACT_PAYLOAD_STORAGE_KIND,
          uri: "runtime-job://job-payload-artifact/node-execution-snapshot/node-1",
        });
        expect(JSON.stringify(artifact.metadata)).not.toContain("node execution snapshot body");
        expect(artifact.metadata).toMatchObject({
          artifactKind: "runtime_job_artifact_payload_manifest",
          payloadRef: expect.stringContaining("runtime-artifact-payload://"),
          boundedSummary: "Node execution snapshot payload.",
          targetCommitmentIds: ["c-001"],
          targetNodeIds: ["node-1"],
          rawPromptStored: false,
          rawResponseStored: false,
        });

        const hydrated = await repository.hydrateJsonPayloadArtifact(artifact);
        expect(hydrated?.body).toEqual(fullBody);
        expect(hydrated?.sizeBytes).toBeGreaterThan(1_000);

        const artifacts = await repository.listArtifacts("job-payload-artifact");
        expect(artifacts).toHaveLength(1);
        expect(artifacts[0]?.metadata).toMatchObject({
          storageKind: RUNTIME_JOB_ARTIFACT_PAYLOAD_STORAGE_KIND,
          hydrationToolId: "artifact.payload.get_json",
        });
        const events = await repository.listEvents("job-payload-artifact", 20);
        expect(events.map((event) => event.eventType)).toContain("job.artifact_contract_attached");
        expect(
          events.find((event) => event.eventType === "job.artifact_contract_attached")?.data,
        ).toMatchObject({
          artifactType: "execution_platform.node_execution_snapshot",
          contractId: "runtime-artifact.node-execution-snapshot.v1",
          storagePolicy: "payload_required",
          hydrateToolId: "artifact.payload.get_json",
          rawPromptStored: false,
          rawResponseStored: false,
        });
      },
      { maxArtifactSizeBytes: 64 * 1024, maxArtifactMetadataBytes: 8 * 1024 },
    );
  });

  it("requires the contract attach path for registered body-bearing artifact types", async () => {
    await withRepository(
      async ({ repository }) => {
        await repository.enqueueJob({ jobId: "job-contract-required", jobType: "demo.echo" });

        await expect(
          repository.attachArtifact({
            jobId: "job-contract-required",
            artifactType: "execution_platform.node_execution_snapshot",
            storageKind: "metadata",
            uri: "runtime-job://job-contract-required/node-execution-snapshot/node-001",
            contentType: "application/json",
            metadata: {
              artifactKind: "execution_platform.node_execution_snapshot",
              nodeExecutionSnapshot: { snapshotRef: "snapshot://node-001" },
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
          }),
        ).rejects.toThrow("runtime artifact contract requires payload storage");

        await expect(
          repository.attachJsonPayloadArtifact({
            jobId: "job-contract-required",
            artifactType: "execution_platform.node_execution_snapshot",
            uri: "runtime-job://job-contract-required/node-execution-snapshot/node-001",
            body: {
              artifactKind: "execution_platform.node_execution_snapshot",
              nodeId: "node-001",
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
              rawToolLogStored: false,
            },
          }),
        ).rejects.toThrow("runtime artifact contract attach API required");
      },
      { maxArtifactSizeBytes: 8 * 1024, maxArtifactMetadataBytes: 8 * 1024 },
    );
  });

  it("rejects inline readiness bodies in scheduler progress manifests", async () => {
    await withRepository(
      async ({ repository }) => {
        await repository.enqueueJob({
          jobId: "job-scheduler-progress-manifest",
          jobType: "demo.echo",
        });

        await expect(
          repository.attachArtifact({
            jobId: "job-scheduler-progress-manifest",
            artifactType: "agent_team.scheduler_progress",
            storageKind: "metadata",
            uri: "runtime-job://job-scheduler-progress-manifest/scheduler-progress/bad",
            contentType: "application/json",
            metadata: {
              stage: "node_readiness",
              status: "running",
              nodeId: "implementation-1",
              nodeReadinessState: {
                artifactKind: "node_readiness_state",
                stateRef: "node-readiness://job-scheduler-progress-manifest/implementation-1",
                readinessStatus: "ready",
                fileSnapshots: [{ path: "src/a.ts", content: "body" }],
                rawPromptStored: false,
                rawResponseStored: false,
              },
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
          }),
        ).rejects.toThrow(
          "runtime artifact metadata manifest violation at metadata.nodeReadinessState",
        );

        await expect(
          repository.attachArtifact({
            jobId: "job-scheduler-progress-manifest",
            artifactType: "agent_team.scheduler_progress",
            storageKind: "metadata",
            uri: "runtime-job://job-scheduler-progress-manifest/scheduler-progress/good",
            contentType: "application/json",
            metadata: {
              stage: "node_readiness",
              status: "running",
              nodeId: "implementation-1",
              nodeReadinessStateStoredInline: false,
              nodeReadinessStateRef:
                "node-readiness://job-scheduler-progress-manifest/implementation-1",
              nodeReadinessStatus: "ready",
              nodeReadinessPhase: "implementation_ready",
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
          }),
        ).resolves.toMatchObject({
          artifactType: "agent_team.scheduler_progress",
          storageKind: "metadata",
        });
      },
      { maxArtifactSizeBytes: 8 * 1024, maxArtifactMetadataBytes: 8 * 1024 },
    );
  });

  it("keeps node worker prompt and node execution snapshot bodies in payload storage", async () => {
    await withRepository(
      async ({ repository }) => {
        await repository.enqueueJob({ jobId: "job-resource-contracts", jobType: "demo.echo" });

        const workerPromptBody = {
          artifactKind: "execution_platform.node_agent_worker_prompt",
          promptRef: "node-agent-worker-prompt://job-resource-contracts/implementation-1",
          nodeRunId: "node-run-1",
          snapshotRef: "node-execution-snapshot://job-resource-contracts/implementation-1",
          promptText:
            "Patch the assigned source, validate the touched behavior, and finish with node_finish.",
          promptHash: "sha256:worker-prompt-hash",
          modelRunRef: "model-run://node-worker-prompt/1",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        };
        const snapshotBody = {
          artifactKind: "execution_platform.node_execution_snapshot",
          snapshotRef: "node-execution-snapshot://job-resource-contracts/implementation-1",
          nodeId: "implementation-1",
          nodeRunId: "node-run-1",
          sessionKey: "agent:execution-coding:node:node-run-1",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        };

        const workerPromptArtifact = await repository.attachRuntimeArtifactByContract({
          jobId: "job-resource-contracts",
          artifactType: "execution_platform.node_agent_worker_prompt",
          uri: workerPromptBody.promptRef,
          body: workerPromptBody,
          boundedSummary: "Model-authored node worker prompt.",
          targetNodeIds: ["implementation-1"],
          readinessStatus: "ready",
        });
        const snapshotArtifact = await repository.attachRuntimeArtifactByContract({
          jobId: "job-resource-contracts",
          artifactType: "execution_platform.node_execution_snapshot",
          uri: snapshotBody.snapshotRef,
          body: snapshotBody,
          boundedSummary: "Node execution snapshot for implementation-1.",
          targetNodeIds: ["implementation-1"],
          readinessStatus: "ready",
        });

        expect(JSON.stringify(workerPromptArtifact.metadata)).not.toContain("worker-prompt-hash");
        expect(workerPromptArtifact.metadata).toMatchObject({
          artifactKind: "runtime_job_artifact_payload_manifest",
          extension: {
            runtimeArtifactContract: {
              contractId: "runtime-artifact.node-agent-worker-prompt.v1",
            },
          },
        });
        expect(snapshotArtifact.metadata).toMatchObject({
          extension: {
            runtimeArtifactContract: {
              contractId: "runtime-artifact.node-execution-snapshot.v1",
            },
          },
        });
        await expect(
          repository.attachJsonPayloadArtifact({
            jobId: "job-resource-contracts",
            artifactType: "execution_platform.node_execution_snapshot",
            uri: "runtime-job://job-resource-contracts/node-execution-snapshot/direct",
            body: snapshotBody,
          }),
        ).rejects.toThrow("runtime artifact contract attach API required");
      },
      { maxArtifactSizeBytes: 128 * 1024, maxArtifactMetadataBytes: 8 * 1024 },
    );
  });

  it("hydrates payload-backed registered artifacts through the contract API", async () => {
    await withRepository(
      async ({ repository }) => {
        await repository.enqueueJob({ jobId: "job-contract-hydrate", jobType: "demo.echo" });
        const body = {
          artifactKind: "execution_platform.node_agent_session_trace",
          traceRef: "node-agent-session-trace://job-contract-hydrate/node-run-1",
          nodeRunId: "node-run-1",
          sessionKey: "agent:execution-coding:node:node-run-1",
          observedToolNames: ["update_plan", "sessions_spawn"],
          traceEventRefs: ["session-event://node-run-1/update-plan"],
          observations: ["Plan created before scout spawn."],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        };

        const artifact = await repository.attachRuntimeArtifactByContract({
          jobId: "job-contract-hydrate",
          artifactType: "execution_platform.node_agent_session_trace",
          uri: body.traceRef,
          body,
          boundedSummary: "Node agent trace with bounded native tool observations.",
        });

        expect(JSON.stringify(artifact.metadata)).not.toContain("Plan created before scout spawn.");
        expect(artifact.metadata).toMatchObject({
          artifactKind: "runtime_job_artifact_payload_manifest",
          extension: {
            runtimeArtifactContract: {
              contractId: "runtime-artifact.node-agent-session-trace.v1",
              storagePolicy: "payload_required",
            },
          },
        });

        const hydrated = await repository.hydrateRuntimeArtifactByContract(artifact);
        expect(hydrated).toMatchObject({
          status: "payload_hydrated",
          legacyHydrated: false,
          body,
          reasonCodes: expect.arrayContaining([
            "runtime_artifact_contract_payload_hydrated",
            "runtime_artifact_contract:runtime-artifact.node-agent-session-trace.v1",
          ]),
        });
      },
      { maxArtifactSizeBytes: 16 * 1024, maxArtifactMetadataBytes: 8 * 1024 },
    );
  });

  it("keeps unregistered legacy metadata bodies out of payload hydration", async () => {
    await withRepository(
      async ({ repository }) => {
        await repository.enqueueJob({ jobId: "job-contract-legacy", jobType: "demo.echo" });
        const legacy = await repository.attachArtifact({
          jobId: "job-contract-legacy",
          artifactType: "legacy.execution_platform.node_execution_packet",
          storageKind: "metadata",
          uri: "runtime-job://job-contract-legacy/legacy-node-execution-packet/node-001",
          metadata: { note: "unregistered fixture" },
        });
        expect((await repository.hydrateRuntimeArtifactByContract(legacy)).status).toBe(
          "metadata_manifest_only",
        );
      },
      { maxArtifactSizeBytes: 8 * 1024, maxArtifactMetadataBytes: 8 * 1024 },
    );
  });

  it("prevents caller metadata from overriding canonical payload manifest fields", async () => {
    await withRepository(
      async ({ repository }) => {
        await repository.enqueueJob({
          jobId: "job-payload-manifest-override",
          jobType: "demo.echo",
        });

        const artifact = await repository.attachRuntimeArtifactByContract({
          jobId: "job-payload-manifest-override",
          artifactType: "execution_platform.node_execution_snapshot",
          uri: "runtime-job://job-payload-manifest-override/node-execution-snapshot/node-1",
          body: {
            artifactKind: "execution_platform.node_execution_snapshot",
            rawPromptStored: false,
          },
          metadata: {
            payloadRef: "runtime-artifact-payload://wrong",
            rawPromptStored: false,
            note: "bounded extension",
          },
        });

        expect(artifact.metadata).toMatchObject({
          artifactKind: "runtime_job_artifact_payload_manifest",
          rawPromptStored: false,
          extension: {
            payloadRef: "runtime-artifact-payload://wrong",
            rawPromptStored: false,
            note: "bounded extension",
          },
        });
        expect((artifact.metadata as Record<string, unknown>).payloadRef).not.toBe(
          "runtime-artifact-payload://wrong",
        );
      },
      { maxArtifactSizeBytes: 8 * 1024, maxArtifactMetadataBytes: 8 * 1024 },
    );
  });

  it("rejects payload bodies or manifest extensions that claim raw storage", async () => {
    await withRepository(
      async ({ repository }) => {
        await repository.enqueueJob({ jobId: "job-payload-raw-flags", jobType: "demo.echo" });

        await expect(
          repository.attachRuntimeArtifactByContract({
            jobId: "job-payload-raw-flags",
            artifactType: "execution_platform.node_execution_snapshot",
            uri: "runtime-job://job-payload-raw-flags/node-execution-snapshot/body",
            body: {
              artifactKind: "execution_platform.node_execution_snapshot",
              rawPromptStored: true,
            },
          }),
        ).rejects.toThrow("artifact payload.rawPromptStored must be false");

        await expect(
          repository.attachRuntimeArtifactByContract({
            jobId: "job-payload-raw-flags",
            artifactType: "execution_platform.node_execution_snapshot",
            uri: "runtime-job://job-payload-raw-flags/node-execution-snapshot/extension",
            body: {
              artifactKind: "execution_platform.node_execution_snapshot",
              rawPromptStored: false,
            },
            metadata: { rawProviderLogStored: true },
          }),
        ).rejects.toThrow("artifact payload manifest extension.rawProviderLogStored must be false");
      },
      { maxArtifactSizeBytes: 8 * 1024, maxArtifactMetadataBytes: 8 * 1024 },
    );
  });

  it("rejects payload bodies over the payload size limit without relaxing metadata limits", async () => {
    await withRepository(
      async ({ repository }) => {
        await repository.enqueueJob({ jobId: "job-payload-too-large", jobType: "demo.echo" });

        await expect(
          repository.attachRuntimeArtifactByContract({
            jobId: "job-payload-too-large",
            artifactType: "execution_platform.node_agent_worker_prompt",
            uri: "runtime-job://job-payload-too-large/node-agent-worker-prompt/task",
            body: {
              promptRef: "runtime-job://job-payload-too-large/node-agent-worker-prompt/task",
              content: "x".repeat(5_000),
            },
          }),
        ).rejects.toThrow("artifact payload sizeBytes exceeds 1024");
      },
      { maxArtifactSizeBytes: 1_024, maxArtifactMetadataBytes: 8 * 1024 },
    );
  });

  it("stores and hydrates JSON payload parts without embedding part bodies in artifact metadata", async () => {
    await withRepository(
      async ({ repository }) => {
        await repository.enqueueJob({ jobId: "job-payload-parts", jobType: "demo.echo" });

        const payloadParts = await repository.putJsonPayloadParts({
          jobId: "job-payload-parts",
          artifactType: "execution_platform.file_snapshot_bundle",
          boundedSummary: "Two file snapshot parts.",
          parts: [
            { fileRef: "src/a.ts", body: "a".repeat(700), rawPromptStored: false },
            { fileRef: "src/b.ts", body: "b".repeat(700), rawPromptStored: false },
          ],
        });

        expect(payloadParts.parts).toHaveLength(2);
        expect(payloadParts.totalSizeBytes).toBeGreaterThan(1_000);
        expect(payloadParts.root.body).toMatchObject({
          artifactKind: "runtime_job_artifact_payload_parts_root",
          partCount: 2,
          partRefs: payloadParts.partRefs,
          rawPromptStored: false,
          rawResponseStored: false,
        });

        const hydrated = await repository.hydrateJsonPayloadParts(payloadParts.root.payloadRef);
        expect(hydrated?.parts.map((part) => part.body)).toEqual([
          { fileRef: "src/a.ts", body: "a".repeat(700), rawPromptStored: false },
          { fileRef: "src/b.ts", body: "b".repeat(700), rawPromptStored: false },
        ]);
      },
      { maxArtifactSizeBytes: 8 * 1024, maxArtifactMetadataBytes: 8 * 1024 },
    );
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
