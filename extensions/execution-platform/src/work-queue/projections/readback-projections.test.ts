import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  RUNTIME_JOB_ARTIFACT_PAYLOAD_MANIFEST_SCHEMA_VERSION,
  RUNTIME_JOB_ARTIFACT_PAYLOAD_STORAGE_KIND,
  type RuntimeJobArtifact,
  type RuntimeJobEvent,
} from "../../runtime-job-repository.ts";
import { activeGraphProgressReadback } from "./active-graph-progress.ts";
import { runtimeArtifactPayloadManifestSummary } from "./runtime-artifact-manifest.ts";

const event = (
  eventType: string,
  data: RuntimeJobEvent["data"],
  eventId = `${eventType}-1`,
): RuntimeJobEvent => ({
  eventId,
  jobId: "job-projection",
  eventType,
  eventTime: new Date("2026-05-24T00:00:00.000Z"),
  workerId: null,
  leaseId: null,
  data,
});

const artifact = (
  artifactType: string,
  metadata: RuntimeJobArtifact["metadata"],
  uri = `runtime-job://job-projection/${artifactType}`,
  storageKind = "metadata",
): RuntimeJobArtifact => ({
  artifactId: `${artifactType}-artifact`,
  jobId: "job-projection",
  artifactType,
  storageKind,
  uri,
  contentType: "application/json",
  sizeBytes: 123,
  sha256: "sha256:test",
  metadata,
  createdAt: new Date("2026-05-24T00:00:00.000Z"),
});

describe("Work Queue readback projection modules", () => {
  it("projects active graph progress from compact refs without raw provider bodies", () => {
    const projection = activeGraphProgressReadback(
      [
        event(
          "agent_team.scheduler_progress",
          {
            graphId: "graph-1",
            nodeId: "node-1",
            activeNodeKind: "implementation_scoped",
            roleId: "implementation",
            modelRef: "qwen/qwen3-coder-next",
            currentObjective: "Apply a scoped patch.",
            currentPhase: "worker.patch",
            blockerSummary: "target snapshot missing",
            schedulerToolInvocationRefs: ["runtime-tool://tool-1"],
            workerInternalInputPacketRefs: ["node-execution-packet://node-1"],
            workerInternalToolStatus: "running",
            workerInternalOutputHash: "sha256:worker-output",
            workerInternalProviderLatencyMs: 2500,
            workerInternalProviderUsage: { inputTokens: 10, outputTokens: 20 },
            modelCallSpanId: "span-1",
            modelCallPhase: "implementation_patch",
            modelCallSpanElapsedMs: 2500,
            modelProviderDiagnostics: {
              usage: { inputTokens: 10, outputTokens: 20 },
              responseBody: "must-not-be-special-cased-or-exposed",
            },
            parallelFrontier: {
              selectedNodeIds: ["node-1"],
              branchResults: [
                {
                  branchId: "branch-1",
                  nodeId: "node-1",
                  status: "blocked_resource",
                  errorPath: "nodeReadinessState.snapshotStatus",
                  blockerSummary: "target snapshot missing",
                  readinessStateRef: "runtime-job://job-projection/readiness/node-1",
                },
              ],
            },
            reasonCodes: ["target_snapshot_missing"],
          },
          "scheduler-progress-1",
        ),
        event(
          "execution.boundary_replay_plan",
          {
            planRef:
              "runtime-job://job-projection/boundary-replay-plan/after_resource_materialization/plan-1",
            exactContinuationAction: "Resume from after_resource_materialization.",
            registryVersion: "boundary-replay.v1",
          },
          "boundary-plan-1",
        ),
        event(
          "execution.boundary_replay_checkpoint",
          {
            checkpointKind: "after_resource_materialization",
            checkpointRef:
              "runtime-job://job-projection/boundary-replay/after_resource_materialization/checkpoint-1",
            graphCheckpointRef: "runtime-work-graph://checkpoint/after_resource_materialization/1",
          },
          "boundary-checkpoint-1",
        ),
      ],
      [
        artifact("execution_platform.latest_run_state", {
          generatedAt: "2026-05-24T00:00:00.000Z",
          runtimeJob: { state: "running" },
          activeFrontier: {
            graphId: "graph-1",
            selectedNodeIds: ["node-1"],
            blockedNodeIds: ["node-1"],
            nextTransition: "materialize_resources",
            branchStates: [
              {
                branchId: "branch-1",
                nodeId: "node-1",
                status: "blocked_resource",
                blockerSummary: "target snapshot missing",
                errorPath: "nodeReadinessState.snapshotStatus",
                readinessStateRef: "runtime-job://job-projection/readiness/node-1",
                reasonCodes: ["target_snapshot_missing"],
              },
            ],
          },
          boundaryReplay: {
            checkpointRefs: [
              "runtime-job://job-projection/boundary-replay/after_resource_materialization/checkpoint-1",
            ],
            currentReplayBoundary: "after_resource_materialization",
            nextReplayBoundary: "before_worker_invocation",
            allowedNextTransitions: ["continue_from_checkpoint"],
          },
        }),
      ],
    );

    expect(projection.state).toBe("present");
    expect(projection.activeNodeId).toBe("node-1");
    expect(projection.workerInternal).toMatchObject({
      state: "present",
      modelRef: "qwen/qwen3-coder-next",
      inputPacketRefs: ["node-execution-packet://node-1"],
      outputHash: "sha256:worker-output",
      providerLatencyMs: 2500,
    });
    expect(projection.modelCallProgress).toMatchObject({
      state: "present",
      spanId: "span-1",
      elapsedMs: 2500,
    });
    expect(projection.parallelFrontier.branchResults[0]).toMatchObject({
      branchId: "branch-1",
      errorPath: "nodeReadinessState.snapshotStatus",
      readinessStateRef: "runtime-job://job-projection/readiness/node-1",
    });
    expect(projection.boundaryReplay).toMatchObject({
      state: "present",
      currentReplayBoundary: "after_resource_materialization",
      nextReplayBoundary: "before_worker_invocation",
      exactContinuationAction: "Resume from after_resource_materialization.",
    });
    expect(JSON.stringify(projection)).not.toContain("must-not-be-special-cased-or-exposed");
    expect(projection.rawPromptStored).toBe(false);
    expect(projection.workerInternal.rawProviderLogStored).toBe(false);
  });

  it("projects runtime artifact payload manifests as refs and counts only", () => {
    const summary = runtimeArtifactPayloadManifestSummary([
      artifact(
        "execution_platform.node_execution_packet",
        {
          artifactKind: "runtime_job_artifact_payload_manifest",
          schemaVersion: RUNTIME_JOB_ARTIFACT_PAYLOAD_MANIFEST_SCHEMA_VERSION,
          jobId: "job-projection",
          artifactType: "execution_platform.node_execution_packet",
          artifactRef: "runtime-job://job-projection/node-packet/1",
          payloadRef: "runtime-payload://job-projection/node-packet/1",
          storageKind: RUNTIME_JOB_ARTIFACT_PAYLOAD_STORAGE_KIND,
          contentType: "application/json",
          byteCount: 1234,
          sha256: "sha256:payload",
          partCount: 1,
          partRefs: [],
          boundedSummary: "node packet manifest",
          targetCommitmentIds: ["C1"],
          targetNodeIds: ["node-1"],
          resourcePacketKind: "coding.node_execution_packet",
          readinessStatus: "ready",
          reasonCodes: [],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
        "runtime-job://job-projection/node-packet/1",
        RUNTIME_JOB_ARTIFACT_PAYLOAD_STORAGE_KIND,
      ),
    ]);

    expect(summary).toMatchObject({
      manifestCount: 1,
      payloadRefs: ["runtime-payload://job-projection/node-packet/1"],
      artifactRefs: ["runtime-job://job-projection/node-packet/1"],
      totalPayloadBytes: 123,
      hydrationToolId: "artifact.payload.get_json",
      rawPromptStored: false,
    });
  });

  it("keeps execution-read-model as a projection assembler instead of owning active graph projection", () => {
    const source = readFileSync(
      "extensions/execution-platform/src/work-queue/execution-read-model.ts",
      "utf8",
    );

    expect(source).toContain(
      'import { activeGraphProgressReadback } from "./projections/active-graph-progress.ts";',
    );
    expect(source).not.toContain("function activeGraphProgressReadback(");
    expect(source).not.toContain("function runtimeArtifactPayloadManifestSummary(");
  });
});
