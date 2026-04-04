import { describe, expect, it, vi } from "vitest";
import {
  createCandidateSubmissionPersistencePlan,
  createMemoryMiddlewareQueryLayer,
} from "./queries.js";

describe("memory middleware query layer", () => {
  it("reports an explicit not-configured result when no database URL exists", async () => {
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error() {}, debug() {} },
    });

    await expect(
      queries.submitCandidate({
        kind: "learning",
        content: "keep this",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      kind: "learning",
      reason: "memory middleware database URL is not configured",
    });

    await expect(queries.listCandidates({})).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.getCandidate({
        candidateId: "00000000-0000-0000-0000-000000000001",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.reviewCandidate({
        candidateId: "00000000-0000-0000-0000-000000000001",
        outcome: "accepted",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.planCandidatePromotion({
        candidateId: "00000000-0000-0000-0000-000000000001",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.promoteCandidateToMemory({
        candidateId: "00000000-0000-0000-0000-000000000001",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.promoteCandidateToProcedureDraft({
        candidateId: "00000000-0000-0000-0000-000000000001",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.planProcedureValidation({
        procedureId: "00000000-0000-0000-0000-000000000001",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.validateProcedure({
        procedureId: "00000000-0000-0000-0000-000000000001",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.planSkillCandidate({
        procedureId: "00000000-0000-0000-0000-000000000001",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.createSkillCandidate({
        procedureId: "00000000-0000-0000-0000-000000000001",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.planSkillCandidateProcurement({
        skillCandidateId: "00000000-0000-0000-0000-000000000001",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.createSkillCandidateProcurementRecord({
        skillCandidateId: "00000000-0000-0000-0000-000000000001",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.planSkillCandidateSkillVetterHandoff({
        skillCandidateId: "00000000-0000-0000-0000-000000000001",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.createSkillCandidateVettingResult({
        skillCandidateId: "00000000-0000-0000-0000-000000000001",
        decision: "defer",
        permissionsRisk: {
          level: "low",
          notes: ["none"],
          requiredChecks: ["manual review still required"],
        },
        suspiciousPatterns: {
          redFlags: [],
          unresolvedQuestions: ["confirm packaged entrypoint"],
        },
        operationalFit: {
          fit: "good",
          notes: ["roadmap-aligned"],
          acceleratorOnly: true,
          canonicalMemorySubstrate: false,
        },
        approvalRecommendation: {
          proposedLifecycleState: "under_review",
          installRecommendation: "do_not_install",
          blockers: ["manual review still open"],
        },
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.planSkillCandidateApproval({
        skillCandidateId: "00000000-0000-0000-0000-000000000001",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.approveSkillCandidate({
        skillCandidateId: "00000000-0000-0000-0000-000000000001",
        scope: "limited",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.planSkillCandidateInstallHandoff({
        skillCandidateId: "00000000-0000-0000-0000-000000000001",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.createSkillCandidateInstallRecord({
        skillCandidateId: "00000000-0000-0000-0000-000000000001",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.persistToolResult({
        sessionId: "00000000-0000-0000-0000-000000000001",
        toolName: "memory_object_search_hybrid",
        payloadText: "oversized result",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.getToolResult({
        toolResultId: "00000000-0000-0000-0000-000000000001",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.planToolResultMicrocompaction({
        sessionId: "00000000-0000-0000-0000-000000000001",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.executeToolResultMicrocompaction({
        sessionId: "00000000-0000-0000-0000-000000000001",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.getSessionMemory({
        sessionId: "00000000-0000-0000-0000-000000000001",
        agentId: "00000000-0000-0000-0000-000000000002",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.updateSessionMemory({
        sessionId: "00000000-0000-0000-0000-000000000001",
        agentId: "00000000-0000-0000-0000-000000000002",
        title: "Session memory",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.planCompaction({
        sessionId: "00000000-0000-0000-0000-000000000001",
        agentId: "00000000-0000-0000-0000-000000000002",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.executeSessionMemoryCompaction({
        sessionId: "00000000-0000-0000-0000-000000000001",
        agentId: "00000000-0000-0000-0000-000000000002",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.executeFullCompactionFallback({
        sessionId: "00000000-0000-0000-0000-000000000001",
        agentId: "00000000-0000-0000-0000-000000000002",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(queries.planConsolidation({})).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.executeConsolidation({
        approvedFindings: [
          {
            actionType: "duplicate_merge_review",
            affectedObjectIds: [
              "00000000-0000-0000-0000-000000000011",
              "00000000-0000-0000-0000-000000000012",
            ],
          },
        ],
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.executeDriftCheck({
        approvedFindings: [
          {
            actionType: "drift_check_review",
            affectedObjectIds: ["00000000-0000-0000-0000-000000000013"],
          },
        ],
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.getMemoryObject({
        objectId: "00000000-0000-0000-0000-000000000001",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(queries.listMemoryObjects({})).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.searchMemoryObjectsBasic({
        query: "bounded",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.searchMemoryObjectsHybrid({
        query: "bounded",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });

    await expect(
      queries.searchMemoryObjectsSemantic({
        embedding: [0.1, 0.2, 0.3],
        embeddingModel: "test-semantic",
        embeddingVersion: "v1",
      }),
    ).resolves.toEqual({
      accepted: false,
      status: "not_configured",
      reason: "memory middleware database URL is not configured",
    });
  });

  it("reports a clean failed result when the database is configured but unavailable", async () => {
    const debug = vi.fn();
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug },
    });

    const result = await queries.submitCandidate({
      kind: "correction",
      content: "Correct the stale fact.",
      sessionId: "session-1",
    });

    expect(result).toMatchObject({
      accepted: false,
      status: "failed",
      kind: "correction",
    });
    if (result.accepted) {
      throw new Error("expected configured-but-unavailable candidate submission to fail");
    }
    expect(result.reason).toContain("database is unavailable");
    expect(debug).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware candidate submission prepared"),
    );
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware candidate submission failed"),
    );
  });

  it("reports clean failed results for candidate queries when the database is configured but unavailable", async () => {
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug() {} },
    });

    const listResult = await queries.listCandidates({
      kind: "learning",
      limit: 5,
    });
    expect(listResult).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (listResult.accepted) {
      throw new Error("expected configured-but-unavailable candidate list to fail");
    }
    expect(listResult.reason).toContain("database is unavailable");

    const getResult = await queries.getCandidate({
      candidateId: "00000000-0000-0000-0000-000000000001",
    });
    expect(getResult).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (getResult.accepted) {
      throw new Error("expected configured-but-unavailable candidate get to fail");
    }
    expect(getResult.reason).toContain("database is unavailable");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware candidate list failed"),
    );
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware candidate get failed"),
    );
  });

  it("reports clean failed results for candidate reviews when the database is configured but unavailable", async () => {
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug() {} },
    });

    const result = await queries.reviewCandidate({
      candidateId: "00000000-0000-0000-0000-000000000001",
      outcome: "accepted",
    });
    expect(result).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (result.accepted) {
      throw new Error("expected configured-but-unavailable candidate review to fail");
    }
    expect(result.reason).toContain("database is unavailable");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware candidate review failed"),
    );
  });

  it("reports clean failed results for candidate promotion planning when the database is configured but unavailable", async () => {
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug() {} },
    });

    const result = await queries.planCandidatePromotion({
      candidateId: "00000000-0000-0000-0000-000000000001",
    });
    expect(result).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (result.accepted) {
      throw new Error("expected configured-but-unavailable candidate promotion planning to fail");
    }
    expect(result.reason).toContain("database is unavailable");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware candidate promotion plan failed"),
    );
  });

  it("reports clean failed results for candidate memory promotion when the database is configured but unavailable", async () => {
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug() {} },
    });

    const result = await queries.promoteCandidateToMemory({
      candidateId: "00000000-0000-0000-0000-000000000001",
    });
    expect(result).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (result.accepted) {
      throw new Error("expected configured-but-unavailable candidate memory promotion to fail");
    }
    expect(result.reason).toContain("database is unavailable");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware candidate memory promotion failed"),
    );
  });

  it("reports clean failed results for candidate procedure promotion when the database is configured but unavailable", async () => {
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug() {} },
    });

    const result = await queries.promoteCandidateToProcedureDraft({
      candidateId: "00000000-0000-0000-0000-000000000001",
    });
    expect(result).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (result.accepted) {
      throw new Error("expected configured-but-unavailable candidate procedure promotion to fail");
    }
    expect(result.reason).toContain("database is unavailable");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware candidate procedure promotion failed"),
    );
  });

  it("reports clean failed results for procedure validation planning when the database is configured but unavailable", async () => {
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug() {} },
    });

    const result = await queries.planProcedureValidation({
      procedureId: "00000000-0000-0000-0000-000000000001",
    });
    expect(result).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (result.accepted) {
      throw new Error("expected configured-but-unavailable procedure validation planning to fail");
    }
    expect(result.reason).toContain("database is unavailable");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware procedure validation plan failed"),
    );
  });

  it("reports clean failed results for procedure validation when the database is configured but unavailable", async () => {
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug() {} },
    });

    const result = await queries.validateProcedure({
      procedureId: "00000000-0000-0000-0000-000000000001",
    });
    expect(result).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (result.accepted) {
      throw new Error("expected configured-but-unavailable procedure validation to fail");
    }
    expect(result.reason).toContain("database is unavailable");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware procedure validation failed"),
    );
  });

  it("reports clean failed results for skill-candidate planning when the database is configured but unavailable", async () => {
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug() {} },
    });

    const result = await queries.planSkillCandidate({
      procedureId: "00000000-0000-0000-0000-000000000001",
    });
    expect(result).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (result.accepted) {
      throw new Error("expected configured-but-unavailable skill-candidate planning to fail");
    }
    expect(result.reason).toContain("database is unavailable");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware skill-candidate plan failed"),
    );
  });

  it("reports clean failed results for skill-candidate creation when the database is configured but unavailable", async () => {
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug() {} },
    });

    const result = await queries.createSkillCandidate({
      procedureId: "00000000-0000-0000-0000-000000000001",
    });
    expect(result).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (result.accepted) {
      throw new Error("expected configured-but-unavailable skill-candidate creation to fail");
    }
    expect(result.reason).toContain("database is unavailable");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware skill-candidate creation failed"),
    );
  });

  it("reports clean failed results for skill-candidate procurement planning when the database is configured but unavailable", async () => {
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug() {} },
    });

    const result = await queries.planSkillCandidateProcurement({
      skillCandidateId: "00000000-0000-0000-0000-000000000001",
    });
    expect(result).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (result.accepted) {
      throw new Error(
        "expected configured-but-unavailable skill-candidate procurement planning to fail",
      );
    }
    expect(result.reason).toContain("database is unavailable");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware skill-candidate procurement plan failed"),
    );
  });

  it("reports clean failed results for skill-candidate procurement-record creation when the database is configured but unavailable", async () => {
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug() {} },
    });

    const result = await queries.createSkillCandidateProcurementRecord({
      skillCandidateId: "00000000-0000-0000-0000-000000000001",
    });
    expect(result).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (result.accepted) {
      throw new Error(
        "expected configured-but-unavailable skill-candidate procurement record creation to fail",
      );
    }
    expect(result.reason).toContain("database is unavailable");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware skill-candidate procurement record failed"),
    );
  });

  it("reports clean failed results for skill-candidate Skill Vetter handoff planning when the database is configured but unavailable", async () => {
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug() {} },
    });

    const result = await queries.planSkillCandidateSkillVetterHandoff({
      skillCandidateId: "00000000-0000-0000-0000-000000000001",
    });
    expect(result).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (result.accepted) {
      throw new Error(
        "expected configured-but-unavailable skill-candidate Skill Vetter handoff planning to fail",
      );
    }
    expect(result.reason).toContain("database is unavailable");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware skill-candidate Skill Vetter handoff plan failed"),
    );
  });

  it("reports clean failed results for skill-candidate vetting-result creation when the database is configured but unavailable", async () => {
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug() {} },
    });

    const result = await queries.createSkillCandidateVettingResult({
      skillCandidateId: "00000000-0000-0000-0000-000000000001",
      decision: "defer",
      permissionsRisk: {
        level: "low",
        notes: ["none"],
        requiredChecks: ["manual review still required"],
      },
      suspiciousPatterns: {
        redFlags: [],
        unresolvedQuestions: ["confirm packaged entrypoint"],
      },
      operationalFit: {
        fit: "good",
        notes: ["roadmap-aligned"],
        acceleratorOnly: true,
        canonicalMemorySubstrate: false,
      },
      approvalRecommendation: {
        proposedLifecycleState: "under_review",
        installRecommendation: "do_not_install",
        blockers: ["manual review still open"],
      },
    });
    expect(result).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (result.accepted) {
      throw new Error(
        "expected configured-but-unavailable skill-candidate vetting-result creation to fail",
      );
    }
    expect(result.reason).toContain("database is unavailable");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware skill-candidate vetting result failed"),
    );
  });

  it("reports clean failed results for skill-candidate approval planning when the database is configured but unavailable", async () => {
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug() {} },
    });

    const result = await queries.planSkillCandidateApproval({
      skillCandidateId: "00000000-0000-0000-0000-000000000001",
    });
    expect(result).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (result.accepted) {
      throw new Error(
        "expected configured-but-unavailable skill-candidate approval planning to fail",
      );
    }
    expect(result.reason).toContain("database is unavailable");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware skill-candidate approval plan failed"),
    );
  });

  it("reports clean failed results for skill-candidate approval writes when the database is configured but unavailable", async () => {
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug() {} },
    });

    const result = await queries.approveSkillCandidate({
      skillCandidateId: "00000000-0000-0000-0000-000000000001",
      scope: "limited",
    });
    expect(result).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (result.accepted) {
      throw new Error("expected configured-but-unavailable skill-candidate approval to fail");
    }
    expect(result.reason).toContain("database is unavailable");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware skill-candidate approval failed"),
    );
  });

  it("reports clean failed results for skill-candidate install handoff planning when the database is configured but unavailable", async () => {
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug() {} },
    });

    const result = await queries.planSkillCandidateInstallHandoff({
      skillCandidateId: "00000000-0000-0000-0000-000000000001",
    });
    expect(result).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (result.accepted) {
      throw new Error(
        "expected configured-but-unavailable skill-candidate install handoff planning to fail",
      );
    }
    expect(result.reason).toContain("database is unavailable");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware skill-candidate install handoff failed"),
    );
  });

  it("reports clean failed results for memory object retrieval when the database is configured but unavailable", async () => {
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug() {} },
    });

    await expect(
      queries.getMemoryObject({
        objectId: "00000000-0000-0000-0000-000000000001",
      }),
    ).resolves.toMatchObject({
      accepted: false,
      status: "failed",
    });

    await expect(queries.listMemoryObjects({})).resolves.toMatchObject({
      accepted: false,
      status: "failed",
    });

    await expect(
      queries.searchMemoryObjectsBasic({
        query: "bounded",
      }),
    ).resolves.toMatchObject({
      accepted: false,
      status: "failed",
    });

    await expect(
      queries.searchMemoryObjectsHybrid({
        query: "bounded",
      }),
    ).resolves.toMatchObject({
      accepted: false,
      status: "failed",
    });

    await expect(
      queries.searchMemoryObjectsSemantic({
        embedding: [0.1, 0.2, 0.3],
        embeddingModel: "test-semantic",
        embeddingVersion: "v1",
      }),
    ).resolves.toMatchObject({
      accepted: false,
      status: "failed",
    });

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware memory object get failed"),
    );
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware memory object list failed"),
    );
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware memory object basic search failed"),
    );
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware memory object hybrid search failed"),
    );
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware memory object semantic search failed"),
    );
  });

  it("reports clean failed results for skill-candidate install-record creation when the database is configured but unavailable", async () => {
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug() {} },
    });

    const result = await queries.createSkillCandidateInstallRecord({
      skillCandidateId: "00000000-0000-0000-0000-000000000001",
    });
    expect(result).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (result.accepted) {
      throw new Error("expected configured-but-unavailable skill-candidate install record to fail");
    }
    expect(result.reason).toContain("database is unavailable");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware skill-candidate install record failed"),
    );
  });

  it("reports clean tool-result persistence and lookup failures when the database is configured but unavailable", async () => {
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug() {} },
    });

    const persistResult = await queries.persistToolResult({
      sessionId: "00000000-0000-0000-0000-000000000001",
      toolName: "memory_object_search_hybrid",
      payloadText: "oversized result",
      forcePersist: true,
    });
    expect(persistResult).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (persistResult.accepted) {
      throw new Error("expected configured-but-unavailable tool-result persistence to fail");
    }
    expect(persistResult.reason).toContain("database is unavailable");

    const getResult = await queries.getToolResult({
      toolResultId: "00000000-0000-0000-0000-000000000001",
    });
    expect(getResult).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (getResult.accepted) {
      throw new Error("expected configured-but-unavailable tool-result lookup to fail");
    }
    expect(getResult.reason).toContain("database is unavailable");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware tool result persistence failed"),
    );
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware tool result query failed"),
    );
  });

  it("reports clean tool-result microcompaction-planning failures when the database is configured but unavailable", async () => {
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug() {} },
    });

    const result = await queries.planToolResultMicrocompaction({
      sessionId: "00000000-0000-0000-0000-000000000001",
    });
    expect(result).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (result.accepted) {
      throw new Error(
        "expected configured-but-unavailable tool-result microcompaction planning to fail",
      );
    }
    expect(result.reason).toContain("database is unavailable");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware tool result microcompaction planning failed"),
    );
  });

  it("reports clean tool-result microcompaction-execution failures when the database is configured but unavailable", async () => {
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug() {} },
    });

    const result = await queries.executeToolResultMicrocompaction({
      sessionId: "00000000-0000-0000-0000-000000000001",
    });
    expect(result).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (result.accepted) {
      throw new Error(
        "expected configured-but-unavailable tool-result microcompaction execution to fail",
      );
    }
    expect(result.reason).toContain("database is unavailable");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware tool result microcompaction planning failed"),
    );
  });

  it("reports clean session-memory read and write failures when the database is configured but unavailable", async () => {
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug() {} },
    });

    const getResult = await queries.getSessionMemory({
      sessionId: "00000000-0000-0000-0000-000000000001",
      agentId: "00000000-0000-0000-0000-000000000002",
    });
    expect(getResult).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (getResult.accepted) {
      throw new Error("expected configured-but-unavailable session-memory get to fail");
    }
    expect(getResult.reason).toContain("database is unavailable");

    const updateResult = await queries.updateSessionMemory({
      sessionId: "00000000-0000-0000-0000-000000000001",
      agentId: "00000000-0000-0000-0000-000000000002",
      title: "Session memory",
    });
    expect(updateResult).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (updateResult.accepted) {
      throw new Error("expected configured-but-unavailable session-memory update to fail");
    }
    expect(updateResult.reason).toContain("database is unavailable");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware session-memory get failed"),
    );
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware session-memory update failed"),
    );
  });

  it("reports clean compaction-planning failures when the database is configured but unavailable", async () => {
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug() {} },
    });

    const result = await queries.planCompaction({
      sessionId: "00000000-0000-0000-0000-000000000001",
      agentId: "00000000-0000-0000-0000-000000000002",
      estimatedPromptTokens: 18000,
    });
    expect(result).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (result.accepted) {
      throw new Error("expected configured-but-unavailable compaction planning to fail");
    }
    expect(result.reason).toContain("database is unavailable");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware tool result microcompaction planning failed"),
    );
  });

  it("reports clean session-memory compaction-execution failures when the database is configured but unavailable", async () => {
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug() {} },
    });

    const result = await queries.executeSessionMemoryCompaction({
      sessionId: "00000000-0000-0000-0000-000000000001",
      agentId: "00000000-0000-0000-0000-000000000002",
      estimatedPromptTokens: 18000,
    });
    expect(result).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (result.accepted) {
      throw new Error(
        "expected configured-but-unavailable session-memory compaction execution to fail",
      );
    }
    expect(result.reason).toContain("database is unavailable");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware tool result microcompaction planning failed"),
    );
  });

  it("reports clean full-fallback compaction-execution failures when the database is configured but unavailable", async () => {
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug() {} },
    });

    const result = await queries.executeFullCompactionFallback({
      sessionId: "00000000-0000-0000-0000-000000000001",
      agentId: "00000000-0000-0000-0000-000000000002",
      estimatedPromptTokens: 18000,
    });
    expect(result).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (result.accepted) {
      throw new Error(
        "expected configured-but-unavailable full compaction fallback execution to fail",
      );
    }
    expect(result.reason).toContain("database is unavailable");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware tool result microcompaction planning failed"),
    );
  });

  it("reports clean consolidation-planning failures when the database is configured but unavailable", async () => {
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug() {} },
    });

    const result = await queries.planConsolidation({
      includeValidatedProcedures: true,
    });
    expect(result).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (result.accepted) {
      throw new Error("expected configured-but-unavailable consolidation planning to fail");
    }
    expect(result.reason).toContain("database is unavailable");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware consolidation plan failed"),
    );
  });

  it("reports clean consolidation-execution failures when the database is configured but unavailable", async () => {
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug() {} },
    });

    const result = await queries.executeConsolidation({
      approvedFindings: [
        {
          actionType: "duplicate_merge_review",
          affectedObjectIds: [
            "00000000-0000-0000-0000-000000000011",
            "00000000-0000-0000-0000-000000000012",
          ],
        },
      ],
    });
    expect(result).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (result.accepted) {
      throw new Error("expected configured-but-unavailable consolidation execution to fail");
    }
    expect(result.reason).toContain("database is unavailable");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware consolidation execution failed"),
    );
  });

  it("reports clean drift-check-execution failures when the database is configured but unavailable", async () => {
    const error = vi.fn();
    const queries = createMemoryMiddlewareQueryLayer({
      config: {
        driver: "postgres",
        url: "postgres://127.0.0.1:1/memory_middleware_test?connect_timeout=1",
        schema: "memory_middleware",
      },
      logger: { info() {}, warn() {}, error, debug() {} },
    });

    const result = await queries.executeDriftCheck({
      approvedFindings: [
        {
          actionType: "drift_check_review",
          affectedObjectIds: ["00000000-0000-0000-0000-000000000013"],
        },
      ],
    });
    expect(result).toMatchObject({
      accepted: false,
      status: "failed",
    });
    if (result.accepted) {
      throw new Error("expected configured-but-unavailable drift-check execution to fail");
    }
    expect(result.reason).toContain("database is unavailable");
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining("memory-middleware drift-check execution failed"),
    );
  });

  it("builds a candidate-only persistence plan that stays in candidate state", () => {
    expect(
      createCandidateSubmissionPersistencePlan({
        schema: "memory_middleware",
        input: {
          kind: "procedure",
          content: "Use the validated cleanup path.",
          projectId: "project-1",
          metadata: { source: "unit-test" },
        },
      }),
    ).toEqual({
      schema: "memory_middleware",
      event: {
        eventKind: "candidate_submission",
        eventName: "candidate_submission.procedure",
        projectId: "project-1",
        payload: {
          submissionKind: "procedure",
          content: "Use the validated cleanup path.",
          candidateMetadata: { source: "unit-test" },
        },
        metadata: {
          source: "candidate-only-ingress",
        },
      },
      memoryObject: {
        projectId: "project-1",
        memoryKind: "procedure",
        reviewState: "candidate",
        content: "Use the validated cleanup path.",
        metadata: {
          submissionKind: "procedure",
          candidateMetadata: { source: "unit-test" },
        },
      },
      memorySource: {
        sourceKind: "event",
        sourceTable: "memory_middleware.memory_events",
        metadata: {
          source: "candidate-only-ingress",
          submissionKind: "procedure",
        },
      },
    });
  });

  it("stores explicit user preference learning candidates as feedback memory", () => {
    expect(
      createCandidateSubmissionPersistencePlan({
        schema: "memory_middleware",
        input: {
          kind: "learning",
          content: "User preference: preferred atlas bloom is amber cedar dusk.",
          metadata: {
            category: "user_preference",
            source: "explicit_user_statement",
          },
        },
      }),
    ).toEqual({
      schema: "memory_middleware",
      event: {
        eventKind: "candidate_submission",
        eventName: "candidate_submission.learning",
        payload: {
          submissionKind: "learning",
          content: "User preference: preferred atlas bloom is amber cedar dusk.",
          candidateMetadata: {
            category: "user_preference",
            source: "explicit_user_statement",
          },
        },
        metadata: {
          source: "candidate-only-ingress",
        },
      },
      memoryObject: {
        memoryKind: "feedback",
        reviewState: "candidate",
        content: "User preference: preferred atlas bloom is amber cedar dusk.",
        metadata: {
          submissionKind: "learning",
          candidateMetadata: {
            category: "user_preference",
            source: "explicit_user_statement",
          },
        },
      },
      memorySource: {
        sourceKind: "event",
        sourceTable: "memory_middleware.memory_events",
        metadata: {
          source: "candidate-only-ingress",
          submissionKind: "learning",
        },
      },
    });
  });
});
