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

  it("stores large JSON payload artifacts behind bounded manifests", async () => {
    await withRepository(
      async ({ repository }) => {
        await repository.enqueueJob({ jobId: "job-payload-artifact", jobType: "demo.echo" });

        const fullBody = {
          artifactKind: "implementation_context_packet",
          packetRef: "runtime-job://job-payload-artifact/packet/context",
          content: "implementation packet body ".repeat(400),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        };
        const artifact = await repository.attachRuntimeArtifactByContract({
          jobId: "job-payload-artifact",
          artifactType: "execution_platform.implementation_context_packet",
          uri: "runtime-job://job-payload-artifact/packet/context",
          body: fullBody,
          boundedSummary: "Worker-ready implementation context packet.",
          targetCommitmentIds: ["c-001"],
          targetNodeIds: ["node-1"],
          resourcePacketKind: "implementation_context_packet",
          readinessStatus: "ready",
          reasonCodes: ["implementation_context_packet_persisted_as_payload"],
        });

        expect(artifact).toMatchObject({
          jobId: "job-payload-artifact",
          artifactType: "execution_platform.implementation_context_packet",
          storageKind: RUNTIME_JOB_ARTIFACT_PAYLOAD_STORAGE_KIND,
          uri: "runtime-job://job-payload-artifact/packet/context",
        });
        expect(JSON.stringify(artifact.metadata)).not.toContain("implementation packet body");
        expect(artifact.metadata).toMatchObject({
          artifactKind: "runtime_job_artifact_payload_manifest",
          payloadRef: expect.stringContaining("runtime-artifact-payload://"),
          boundedSummary: "Worker-ready implementation context packet.",
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
          artifactType: "execution_platform.implementation_context_packet",
          contractId: "runtime-artifact.implementation-context-packet.v1",
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
            artifactType: "execution_platform.commitment_work_packet",
            storageKind: "metadata",
            uri: "runtime-job://job-contract-required/packet/c-001",
            contentType: "application/json",
            metadata: {
              artifactKind: "execution_platform.commitment_work_packet",
              commitmentWorkPacket: { packetKind: "commitment_work_packet" },
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
          }),
        ).rejects.toThrow("runtime artifact contract requires payload storage");

        await expect(
          repository.attachJsonPayloadArtifact({
            jobId: "job-contract-required",
            artifactType: "execution_platform.commitment_work_packet",
            uri: "runtime-job://job-contract-required/packet/c-001",
            body: {
              packetKind: "commitment_work_packet",
              commitmentId: "c-001",
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

  it("keeps resource materialization and node readiness bodies in payload storage", async () => {
    await withRepository(
      async ({ repository }) => {
        await repository.enqueueJob({ jobId: "job-resource-contracts", jobType: "demo.echo" });

        const resourceBody = {
          artifactKind: "implementation_resource_materialization_result",
          status: "ready",
          inputCounts: { targetFileRefs: 90 },
          outputCounts: { targetFileSnapshots: 90, implementationTaskPackets: 35 },
          maxBounds: { targetFileSnapshots: 120 },
          targetFileSnapshots: Array.from({ length: 60 }, (_, index) => ({
            snapshotRef: `snapshot://${index}`,
            contentHash: `sha256:${index}`,
            contentPreview: "large file snapshot ".repeat(30),
          })),
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        };
        const readinessBody = {
          artifactKind: "node_readiness_state",
          stateRef: "node-readiness://job-resource-contracts/implementation-1",
          nodeId: "implementation-1",
          readinessStatus: "ready",
          phase: "implementation_ready",
          nextAllowedTransitions: ["execute_node"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        };

        const resourceArtifact = await repository.attachRuntimeArtifactByContract({
          jobId: "job-resource-contracts",
          artifactType: "execution_platform.implementation_resource_materialization_result",
          uri: "runtime-job://job-resource-contracts/resource-materialization/implementation-1",
          body: resourceBody,
          boundedSummary: "Large resource materialization result with payload-only snapshots.",
          targetNodeIds: ["implementation-1"],
          resourcePacketKind: "implementation_resource_materialization_result",
          readinessStatus: "ready",
        });
        const readinessArtifact = await repository.attachRuntimeArtifactByContract({
          jobId: "job-resource-contracts",
          artifactType: "execution_platform.node_readiness_state",
          uri: readinessBody.stateRef,
          body: readinessBody,
          boundedSummary: "Node readiness state for implementation-1.",
          targetNodeIds: ["implementation-1"],
          resourcePacketKind: "node_readiness_state",
          readinessStatus: "ready",
        });

        expect(JSON.stringify(resourceArtifact.metadata)).not.toContain("large file snapshot");
        expect(resourceArtifact.metadata).toMatchObject({
          artifactKind: "runtime_job_artifact_payload_manifest",
          extension: {
            runtimeArtifactContract: {
              contractId: "runtime-artifact.implementation-resource-materialization-result.v1",
            },
          },
        });
        expect(readinessArtifact.metadata).toMatchObject({
          extension: {
            runtimeArtifactContract: {
              contractId: "runtime-artifact.node-readiness-state.v1",
            },
          },
        });
        await expect(
          repository.attachJsonPayloadArtifact({
            jobId: "job-resource-contracts",
            artifactType: "execution_platform.node_readiness_state",
            uri: "runtime-job://job-resource-contracts/node-readiness/direct",
            body: readinessBody,
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
          packetKind: "context_handoff_packet",
          packetId: "handoff-1",
          sourceNodeId: "context-1",
          targetCommitmentIds: ["c-001"],
          handoffSummaryForImplementation: "Inspect the workflow plugin and readback surfaces.",
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        };

        const artifact = await repository.attachRuntimeArtifactByContract({
          jobId: "job-contract-hydrate",
          artifactType: "execution_platform.context_handoff_packet",
          uri: "runtime-job://job-contract-hydrate/context-handoff/handoff-1",
          body,
          boundedSummary: body.handoffSummaryForImplementation,
        });

        expect(JSON.stringify(artifact.metadata)).not.toContain(
          'context_handoff_packet","packetId',
        );
        expect(artifact.metadata).toMatchObject({
          artifactKind: "runtime_job_artifact_payload_manifest",
          extension: {
            runtimeArtifactContract: {
              contractId: "runtime-artifact.context-handoff-packet.v1",
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
            "runtime_artifact_contract:runtime-artifact.context-handoff-packet.v1",
          ]),
        });
      },
      { maxArtifactSizeBytes: 16 * 1024, maxArtifactMetadataBytes: 8 * 1024 },
    );
  });

  it("hydrates explicitly allowed legacy metadata bodies without making them clean storage", async () => {
    await withRepository(
      async ({ repository }) => {
        await repository.enqueueJob({ jobId: "job-contract-legacy", jobType: "demo.echo" });
        const legacy = await repository.attachArtifact({
          jobId: "job-contract-legacy",
          artifactType: "legacy.execution_platform.commitment_work_packet",
          storageKind: "metadata",
          uri: "runtime-job://job-contract-legacy/legacy-packet/c-001",
          metadata: { note: "unregistered fixture" },
        });
        expect((await repository.hydrateRuntimeArtifactByContract(legacy)).status).toBe(
          "metadata_manifest_only",
        );

        const registeredLegacy = {
          ...legacy,
          artifactType: "execution_platform.commitment_work_packet",
          metadata: {
            artifactKind: "execution_platform.commitment_work_packet",
            commitmentWorkPacket: {
              packetKind: "commitment_work_packet",
              commitmentId: "c-001",
              rawPromptStored: false,
              rawResponseStored: false,
              rawProviderLogStored: false,
            },
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        };
        const hydrated = await repository.hydrateRuntimeArtifactByContract(registeredLegacy);
        expect(hydrated.status).toBe("legacy_metadata_hydrated");
        expect(hydrated.legacyHydrated).toBe(true);
        expect(hydrated.reasonCodes).toContain("legacy_body_key:commitmentWorkPacket");
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
          artifactType: "execution_platform.node_execution_packet",
          uri: "runtime-job://job-payload-manifest-override/node-execution-packet/node-1",
          body: { packetKind: "node_execution_packet", rawPromptStored: false },
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
            artifactType: "execution_platform.node_execution_packet",
            uri: "runtime-job://job-payload-raw-flags/node-execution-packet/body",
            body: { packetKind: "node_execution_packet", rawPromptStored: true },
          }),
        ).rejects.toThrow("artifact payload.rawPromptStored must be false");

        await expect(
          repository.attachRuntimeArtifactByContract({
            jobId: "job-payload-raw-flags",
            artifactType: "execution_platform.node_execution_packet",
            uri: "runtime-job://job-payload-raw-flags/node-execution-packet/extension",
            body: { packetKind: "node_execution_packet", rawPromptStored: false },
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
            artifactType: "execution_platform.implementation_task_packet",
            uri: "runtime-job://job-payload-too-large/packet/task",
            body: {
              packetRef: "runtime-job://job-payload-too-large/packet/task",
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
