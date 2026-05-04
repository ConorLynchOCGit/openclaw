import { describe, expect, it } from "vitest";
import {
  REQUIRED_LIVE_EXECUTION_SKILL_DOCS,
  ROLE_DOC_REQUIREMENT_IDS,
  listModelLanePolicies,
  listRequiredReadinessGates,
  listRequiredSkillDocRequirements,
  listRoleDocRequirements,
  produceMissingGateReport,
  produceReadinessReport,
  validateAlternativeModelQualificationPlan,
  validateCandidateAuthorityForSlice8B,
  validateGateEvidenceMetadata,
  validateSupervisorProtocolEvidence,
  validateTrustHandoffEvidence,
  validateWorkQueueOversightEvidence,
  type AlternativeModelQualificationPlan,
  type ReadinessEvidence,
  type SupervisorProtocolEvidence,
  type TrustHandoffEvidence,
  type WorkQueueOversightEvidence,
} from "./index.ts";

function acceptedGate(gateId: ReadinessEvidence["gateId"]): ReadinessEvidence {
  const fields = listRequiredReadinessGates().find(
    (gate) => gate.gateId === gateId,
  )!.requiredEvidenceFields;
  return {
    gateId,
    accepted: true,
    evidenceRef: `doc://${gateId}`,
    acceptedBy: "user",
    acceptedAt: "2026-05-02T00:00:00.000Z",
    details: Object.fromEntries(fields.map((field) => [field, !field.endsWith("Implemented")])),
  };
}

function allGateEvidence(): ReadinessEvidence[] {
  return listRequiredReadinessGates().map((gate) => acceptedGate(gate.gateId));
}

function supervisorEvidence(
  overrides: Partial<SupervisorProtocolEvidence> = {},
): SupervisorProtocolEvidence {
  return {
    restartResumeHandshake: true,
    idempotentEventReplay: true,
    heartbeat: true,
    streamEventDelivery: true,
    artifactPointers: true,
    cancellation: true,
    pauseRedirect: true,
    rebuildSemantics: true,
    autobailoutHandoff: true,
    failureTaxonomy: true,
    liveDaemonImplemented: false,
    ...overrides,
  };
}

function trustEvidence(overrides: Partial<TrustHandoffEvidence> = {}): TrustHandoffEvidence {
  return {
    explicitUserAcceptance: true,
    repoScope: ["/root/services/openclaw-roles/live"],
    commandShellBoundaries: true,
    rebuildBoundaries: true,
    bailoutBoundaries: true,
    maxAttemptsAndStopConditions: true,
    auditArtifactsRequired: true,
    rollbackPath: true,
    livePermissionGrant: false,
    ...overrides,
  };
}

function workQueueEvidence(
  overrides: Partial<WorkQueueOversightEvidence> = {},
): WorkQueueOversightEvidence {
  return {
    finalizedPromptsBecomeCandidates: true,
    streamAttachesToItemRunStep: true,
    runningRequiresRuntimeEvidence: true,
    completedRequiresRuntimeEvidence: true,
    executorCompletedDistinctFromValidationPassed: true,
    completedWorkArtifactPlacement: true,
    noFakeDisabledExecutionUi: true,
    pauseRedirectCancelServerBackedFutureOnly: true,
    ...overrides,
  };
}

function alternativeModelPlan(
  overrides: Partial<AlternativeModelQualificationPlan> = {},
): AlternativeModelQualificationPlan {
  return {
    frontierGptRequiredForOrchestrationAndStrongCoding: true,
    cheaperCandidatesShadowOnly: true,
    candidateFamilies: ["DeepSeek", "Qwen", "MiniMax", "OpenRouter-hosted candidates"],
    roleSpecificQualificationMatrix: true,
    manufacturedSoakFloodFixtureStrategy: {
      minimumFixtureCount: 250,
      includesAdversarialFixtures: true,
      includesHistoricalOpenClawTasks: true,
    },
    frontierBaselineComparison: true,
    qualitativeRubric: ["instruction fidelity", "scope control", "architecture judgment"],
    structuralRubric: ["schema validity", "tests present", "artifact completeness"],
    immediateDisqualificationRules: ["fabricates validation", "edits outside scope"],
    promotionReviewGate: true,
    demotionRollbackCriteria: true,
    liveProviderCallsMade: false,
    livePromotionGranted: false,
    ...overrides,
  };
}

describe("codex bridge readiness gates", () => {
  it("represents all required role docs in readiness metadata", () => {
    expect(
      listRoleDocRequirements()
        .map((requirement) => requirement.roleId)
        .toSorted(),
    ).toEqual([...ROLE_DOC_REQUIREMENT_IDS].toSorted());
    expect(listRoleDocRequirements()[0]?.requiredSections).toEqual(
      expect.arrayContaining([
        "purpose",
        "handoff contract",
        "examples of unacceptable output",
        "live-readiness checklist",
      ]),
    );
  });

  it("represents all required skill/doc drafts in readiness metadata", () => {
    expect(
      listRequiredSkillDocRequirements()
        .map((requirement) => requirement.skillDocId)
        .toSorted(),
    ).toEqual([...REQUIRED_LIVE_EXECUTION_SKILL_DOCS].toSorted());
    expect(listRequiredSkillDocRequirements()[0]?.requiredSections).toEqual(
      expect.arrayContaining([
        "trigger conditions",
        "validation checklist",
        "live activation risk",
      ]),
    );
  });

  it("fails readiness when a required gate is missing", () => {
    const evidence = allGateEvidence().filter((gate) => gate.gateId !== "trust_handoff_accepted");
    const report = produceReadinessReport({
      evidence,
      presentRoleDocIds: [...ROLE_DOC_REQUIREMENT_IDS],
      presentSkillDocIds: [...REQUIRED_LIVE_EXECUTION_SKILL_DOCS],
    });

    expect(report).toMatchObject({
      readyForLiveExecution: false,
      liveExecutionEnabled: false,
      allRequiredGateEvidencePresent: false,
      missingGates: ["trust_handoff_accepted"],
    });
    expect(produceMissingGateReport(report).missingGates).toEqual(["trust_handoff_accepted"]);
  });

  it("passes evidence completeness only when all gates and docs are present, but keeps live execution disabled", () => {
    const report = produceReadinessReport({
      evidence: allGateEvidence(),
      presentRoleDocIds: [...ROLE_DOC_REQUIREMENT_IDS],
      presentSkillDocIds: [...REQUIRED_LIVE_EXECUTION_SKILL_DOCS],
    });

    expect(report).toMatchObject({
      readyForLiveExecution: false,
      liveExecutionEnabled: false,
      allRequiredGateEvidencePresent: true,
      missingGates: [],
      missingRoleDocs: [],
      missingSkillDocs: [],
    });
    expect(report.reason).toContain("live execution remains disabled");
  });

  it("validates missing required gate evidence fields", () => {
    expect(
      validateGateEvidenceMetadata({
        evidence: {
          gateId: "supervisor_protocol_accepted",
          accepted: true,
          evidenceRef: "doc://supervisor",
          acceptedBy: "user",
          acceptedAt: "2026-05-02T00:00:00.000Z",
          details: { heartbeat: true },
        },
      }),
    ).toMatchObject({
      valid: false,
      missingEvidenceFields: expect.arrayContaining(["restartResumeHandshake", "artifactPointers"]),
    });
  });

  it("requires restart/resume, replay, heartbeat, cancellation, pause/redirect, rebuild, and artifact semantics in supervisor protocol", () => {
    expect(validateSupervisorProtocolEvidence(supervisorEvidence())).toMatchObject({
      valid: true,
      missing: [],
    });
    expect(
      validateSupervisorProtocolEvidence(supervisorEvidence({ pauseRedirect: false })),
    ).toEqual({
      valid: false,
      missing: ["pauseRedirect"],
    });
  });

  it("requires explicit trust acceptance, scopes, audit artifacts, and rollback path", () => {
    expect(validateTrustHandoffEvidence(trustEvidence())).toMatchObject({
      valid: true,
      missing: [],
    });
    expect(
      validateTrustHandoffEvidence(trustEvidence({ repoScope: [], rollbackPath: false })),
    ).toEqual({
      valid: false,
      missing: ["rollbackPath", "repoScope"],
    });
  });

  it("rejects fake Work Queue running or completed state without runtime evidence", () => {
    expect(validateWorkQueueOversightEvidence(workQueueEvidence())).toMatchObject({
      valid: true,
      rejectsFakeExecutionState: true,
    });
    expect(
      validateWorkQueueOversightEvidence(
        workQueueEvidence({ attemptedFakeRunningOrCompleted: true }),
      ),
    ).toMatchObject({
      valid: false,
      rejectsFakeExecutionState: false,
    });
  });

  it("keeps frontier orchestration and strong coding on frontier GPT-class models", () => {
    expect(listModelLanePolicies()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          laneId: "frontier_orchestrator",
          allowedFamilies: ["Frontier GPT"],
          frontierGptRequired: true,
        }),
        expect.objectContaining({
          laneId: "strong_coding",
          allowedFamilies: ["Frontier GPT"],
          frontierGptRequired: true,
        }),
      ]),
    );
  });

  it("keeps cheaper candidates shadow/soak-only without promotion evidence", () => {
    expect(
      validateCandidateAuthorityForSlice8B({
        provider: "deepseek",
        model: "deepseek-candidate",
        family: "DeepSeek",
        targetRoleId: "test_engineer",
      }),
    ).toMatchObject({
      shadowOrSoakOnly: true,
      liveAuthorityGranted: false,
    });
  });

  it("does not grant live authority even with role-specific promotion evidence", () => {
    expect(
      validateCandidateAuthorityForSlice8B({
        provider: "qwen",
        model: "qwen-candidate",
        family: "Qwen",
        targetRoleId: "test_engineer",
        promotedForRole: true,
      }),
    ).toMatchObject({
      liveAuthorityGranted: false,
      reasons: ["role_specific_promotion_evidence_is_metadata_only_in_slice_8b"],
    });
  });

  it("validates soak-flood and alternative model qualification plan shape", () => {
    expect(validateAlternativeModelQualificationPlan(alternativeModelPlan())).toMatchObject({
      valid: true,
      missing: [],
      liveAuthorityGranted: false,
    });
    expect(
      validateAlternativeModelQualificationPlan(
        alternativeModelPlan({
          manufacturedSoakFloodFixtureStrategy: {
            minimumFixtureCount: 0,
            includesAdversarialFixtures: false,
            includesHistoricalOpenClawTasks: true,
          },
        }),
      ),
    ).toMatchObject({
      valid: false,
      missing: expect.arrayContaining([
        "manufacturedSoakFloodFixtureStrategy.minimumFixtureCount",
        "manufacturedSoakFloodFixtureStrategy.includesAdversarialFixtures",
      ]),
    });
  });

  it("records that no live Codex, ACP, shell, provider, rebuild, scheduler, daemon, or subagent call is made", () => {
    const report = produceReadinessReport({
      evidence: allGateEvidence(),
      presentRoleDocIds: [...ROLE_DOC_REQUIREMENT_IDS],
      presentSkillDocIds: [...REQUIRED_LIVE_EXECUTION_SKILL_DOCS],
    });

    expect(report).toMatchObject({
      liveExecutionEnabled: false,
      readyForLiveExecution: false,
    });
    expect(validateAlternativeModelQualificationPlan(alternativeModelPlan())).toMatchObject({
      liveAuthorityGranted: false,
    });
    expect(validateSupervisorProtocolEvidence(supervisorEvidence())).toMatchObject({
      valid: true,
    });
    expect(supervisorEvidence().liveDaemonImplemented).toBe(false);
  });
});
