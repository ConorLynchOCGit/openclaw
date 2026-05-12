import { describe, expect, it } from "vitest";
import { applyExecutionPlatformMigrations } from "../db/migrations.ts";
import { createExecutionPlatformPgMemTestDatabase } from "../db/pg-test.ts";
import { RuntimeJobRepository } from "../runtime-job-repository.ts";
import {
  createRoutingTelemetryRecord,
  InMemoryRoutingTelemetryStore,
  NoopRoutingTelemetryStore,
  RuntimeArtifactRoutingTelemetryStore,
  type RoutingTelemetryRecord,
} from "./routing-telemetry-store.ts";

function baseRecord(overrides: Partial<RoutingTelemetryRecord> = {}): RoutingTelemetryRecord {
  return {
    artifactKind: "intent_front_door_routing_telemetry_record",
    routeDecisionId: "route-decision-1",
    promptHash: "sha256:prompt",
    promptSummary: "Bounded prompt summary.",
    route: "workflow_execution",
    workflowId: "agent_team.coding",
    jobType: "executor.agent_team",
    responseMode: "create_runtime_job",
    executeNow: true,
    confidence: 0.96,
    modelCandidateRef: "model://router-fixture",
    routerConfigVersion: "router-config-v1",
    routerSchemaVersion: "router-schema-v1",
    workflowRegistryVersion: "workflow-registry-v1",
    authoritySnapshotVersion: "authority-v1",
    authSessionVersion: "auth-v1",
    conversationContextVersion: "context-v1",
    validatorOutcome: "accepted",
    escalationOutcome: "use_default_router",
    clarificationOutcome: "pass_through",
    actionSemanticsOutcome: "actions_allowed",
    compilerOutcome: "front_door_compiled_runtime_job_request",
    outcome: "accepted",
    correctionSignal: null,
    reasonCodes: ["bounded_route_telemetry"],
    artifactRefs: ["runtime-job://job-1/execution/front-door/router-result"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    ...overrides,
  };
}

describe("RoutingTelemetryStore", () => {
  it("stores bounded telemetry records idempotently in memory", async () => {
    const store = new InMemoryRoutingTelemetryStore();
    const first = await store.write(baseRecord());
    const second = await store.write(baseRecord());

    expect(first.stored).toBe(true);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(store.list()).toHaveLength(1);
    expect(store.read("route-decision-1")?.rawPromptStored).toBe(false);
    expect(store.read("route-decision-1")?.rawResponseStored).toBe(false);
  });

  it("rejects raw prompt, response, and provider log storage flags", () => {
    expect(() =>
      createRoutingTelemetryRecord({
        ...baseRecord(),
        rawPromptStored: true as false,
      }),
    ).toThrow(/raw prompt/u);
    expect(() =>
      createRoutingTelemetryRecord({
        ...baseRecord(),
        rawProviderLogStored: true as false,
      }),
    ).toThrow(/provider logs/u);
  });

  it("supports no-op sink without creating jobs or authority", async () => {
    const result = await new NoopRoutingTelemetryStore().write(baseRecord());

    expect(result.stored).toBe(false);
    expect(result.runtimeJobCreated).toBe(false);
    expect(result.authorityGranted).toBe(false);
    expect(result.workQueueLifecycleMutationAllowed).toBe(false);
  });

  it("writes metadata-only runtime artifacts idempotently", async () => {
    const db = await createExecutionPlatformPgMemTestDatabase();
    try {
      await applyExecutionPlatformMigrations(db.sql);
      const runtimeJobs = new RuntimeJobRepository(db.sql, { claimStrategy: "basic" });
      const job = await runtimeJobs.enqueueJob({
        jobId: "routing-telemetry-job",
        jobType: "executor.agent_team",
        payload: { rawPromptStored: false },
      });
      const store = new RuntimeArtifactRoutingTelemetryStore(runtimeJobs, job.jobId);

      const first = await store.write(baseRecord());
      const second = await store.write(baseRecord());
      const artifacts = await runtimeJobs.listArtifacts(job.jobId);

      expect(first.sink).toBe("runtime_artifact");
      expect(second.duplicate).toBe(true);
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0]?.artifactType).toBe("execution.front_door.routing_telemetry");
      expect(JSON.stringify(artifacts[0]?.metadata)).not.toContain("raw provider log");
    } finally {
      await db.close();
    }
  });

  it("records bounded correction signal refs only", () => {
    const record = createRoutingTelemetryRecord(
      baseRecord({
        correctionSignal: {
          correctionId: "correction-1",
          priorRouteDecisionId: "route-decision-1",
          correctionCategory: "wrong_workflow",
          boundedSummary: "Operator corrected the route target.",
          rawPromptStored: false,
          rawResponseStored: false,
        },
      }),
    );

    expect(record.correctionSignal?.boundedSummary).toContain("Operator corrected");
    expect(record.correctionSignal?.rawPromptStored).toBe(false);
  });
});
