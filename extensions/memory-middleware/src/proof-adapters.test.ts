import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoryMiddlewareConfig } from "./config.js";
import { inspectProjectFactLifecycle } from "./project-fact-lifecycle.js";
import {
  buildProofLifecycleArtifacts,
  resolveProofArtifactAdapter,
  resolveProofLifecycleAdapter,
} from "./proof-adapters.js";
import { inspectRecurringProcedureLifecycle } from "./recurring-procedure-lifecycle.js";

vi.mock("./project-fact-lifecycle.js", () => ({
  inspectProjectFactLifecycle: vi.fn(),
}));

vi.mock("./recurring-procedure-lifecycle.js", () => ({
  inspectRecurringProcedureLifecycle: vi.fn(),
}));

const TEST_MEMORY_CONFIG: MemoryMiddlewareConfig = {
  database: { driver: "postgres", url: "postgres://proof", schema: "memory_middleware" },
  candidateIngress: { mode: "disabled" },
  memoryObjectQuery: { mode: "disabled" },
  backgroundJobs: {
    inspectionMode: "disabled",
    advisorySchedulingMode: "disabled",
    executeSchedulingMode: "disabled",
    advisoryJobClasses: [],
    executeJobClasses: [],
  },
};

describe("proof adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches project-fact proof inspection through the registered lifecycle adapter", async () => {
    vi.mocked(inspectProjectFactLifecycle).mockResolvedValue({
      matchingApprovedObjectId: "approved-fact-1",
      pendingCandidate: {
        id: "candidate-fact-1",
        sourceEventId: "event-fact-1",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
        expiresAt: "2026-04-04T00:00:00.000Z",
        confirmationState: "pending_confirmation",
      },
      activeApprovedSubjectObjectIds: ["approved-fact-1"],
      pendingSubjectCandidateIds: ["candidate-fact-1"],
      activeApprovedSubjectEntries: [],
      pendingSubjectCandidates: [],
    });

    const adapter = resolveProofLifecycleAdapter("project_fact_lifecycle");
    const inspection = await adapter.inspect({
      config: TEST_MEMORY_CONFIG,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      expectation: {
        key: "project-fact-key-1",
        subjectKey: "project-fact-subject-1",
        projectId: "project-1",
      },
    });

    expect(inspectProjectFactLifecycle).toHaveBeenCalledWith({
      config: TEST_MEMORY_CONFIG,
      key: "project-fact-key-1",
      subjectKey: "project-fact-subject-1",
      projectId: "project-1",
      logger: expect.any(Object),
    });
    expect(inspection).toMatchObject({
      matchingApprovedObjectId: "approved-fact-1",
    });
  });

  it("dispatches recurring-procedure proof inspection and validated-procedure artifacts through adapters", async () => {
    vi.mocked(inspectRecurringProcedureLifecycle).mockResolvedValue({
      matchingValidatedProcedureId: "validated-procedure-1",
      pendingCandidate: {
        id: "candidate-procedure-1",
        sourceEventId: "event-procedure-1",
        createdAt: "2026-04-01T00:00:00.000Z",
        updatedAt: "2026-04-01T00:00:00.000Z",
        expiresAt: "2026-04-04T00:00:00.000Z",
        confirmationState: "pending_confirmation",
      },
      activeValidatedSubjectProcedureIds: ["validated-procedure-1"],
      pendingSubjectCandidateIds: ["candidate-procedure-1"],
    });

    const lifecycleAdapter = resolveProofLifecycleAdapter("recurring_procedure_lifecycle");
    const inspection = await lifecycleAdapter.inspect({
      config: TEST_MEMORY_CONFIG,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      expectation: {
        key: "procedure-key-1",
        subjectKey: "procedure-subject-1",
      },
    });

    expect(inspectRecurringProcedureLifecycle).toHaveBeenCalledWith({
      config: TEST_MEMORY_CONFIG,
      key: "procedure-key-1",
      subjectKey: "procedure-subject-1",
      logger: expect.any(Object),
    });
    expect(
      buildProofLifecycleArtifacts({
        artifactMode: "validated_procedure",
        inspection: inspection!,
      }),
    ).toEqual({
      candidateId: "candidate-procedure-1",
      candidateEventId: "event-procedure-1",
      validatedProcedureId: "validated-procedure-1",
    });
  });

  it("resolves artifact adapters for multiple proof surfaces without central switches", () => {
    expect(resolveProofArtifactAdapter("approved_memory_object").artifactMode).toBe(
      "approved_memory_object",
    );
    expect(resolveProofArtifactAdapter("phrase_pattern").artifactMode).toBe("phrase_pattern");
    expect(resolveProofArtifactAdapter("validated_procedure").artifactMode).toBe(
      "validated_procedure",
    );
  });
});
