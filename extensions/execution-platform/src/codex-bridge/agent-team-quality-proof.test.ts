import { describe, expect, it } from "vitest";
import {
  evaluateSingleJobCodingTeamQualityProof,
  SINGLE_JOB_CODING_TEAM_QUALITY_GATE_ID,
  type AgentTeamRoleExecutionEvidence,
  validationRefsFromResult,
} from "./agent-team-quality-proof.ts";
import { buildCloseoutCapsuleReadback } from "./closeout-capsule-readback.ts";
import { closeoutCapsuleToLegacyHumanSummary, type CloseoutCapsule } from "./closeout-capsule.ts";

const requiredRoles = [
  "orchestrator",
  "context_scout",
  "implementation_engineer",
  "test_engineer",
  "security_privacy_reviewer",
  "reviewer",
  "docs_skills_writer",
  "observability_scribe",
] as const;

function roleEvidence(roleId: (typeof requiredRoles)[number]): AgentTeamRoleExecutionEvidence {
  return {
    roleId,
    agentId: roleId,
    modelRef:
      roleId === "context_scout" || roleId === "security_privacy_reviewer"
        ? "deepseek/deepseek-v4-pro"
        : `model://${roleId}`,
    providerPath: roleId === "orchestrator" ? "codex_app_server" : "openrouter",
    transportKind:
      roleId === "orchestrator" || roleId === "implementation_engineer"
        ? "codex_app_server"
        : "live_model",
    modelRunRef: `model-run://${roleId}`,
    responseHash: `hash-${roleId}`,
    startedAt: "2026-05-09T08:00:00.000Z",
    completedAt: "2026-05-09T08:00:01.000Z",
    latencyMs: 1000,
    assignedTaskSummary: `Do ${roleId} work`,
    producedArtifactRefs:
      roleId === "implementation_engineer"
        ? [
            "runtime-job://job/codex-bridge/code-writing-pilot-live/run-1/codex_bridge.code_writing_pilot_live_result",
          ]
        : [`runtime-job://job/agent-team/${roleId}`],
    inlineRoleReportRef: `runtime-job://job/agent-team/inline-role-report/${roleId}`,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

function capsule() {
  return {
    roleCloseouts: requiredRoles.map((roleId) => ({
      roleId,
      modelRef:
        roleId === "context_scout" || roleId === "security_privacy_reviewer"
          ? "deepseek/deepseek-v4-pro"
          : `model://${roleId}`,
      modelRunRef: `model-run://${roleId}`,
      source: "model",
      actuallyDid: `${roleId} completed concrete bounded work`,
      whatIActuallyDid: `${roleId} completed concrete bounded work`,
      evidenceRefs: [`runtime-job://job/agent-team/${roleId}`],
      filesOrArtifactsTouched: [`extensions/execution-platform/src/${roleId}.ts`],
      validationIPerformed: `${roleId} validation`,
      confidence: "high",
      limitations: [`${roleId} bounded limitation`],
    })),
  };
}

describe("single-job coding-team quality proof evaluation", () => {
  it("accepts complete live role execution and model-authored role closeouts", () => {
    const result = evaluateSingleJobCodingTeamQualityProof({
      roleExecutionEvidence: requiredRoles.map(roleEvidence),
      closeoutCapsule: capsule(),
      changedFileRefs: ["extensions/execution-platform/src/work-queue/execution-read-model.ts"],
      validationRefs: ["pnpm test:file work-queue"],
      reviewAccepted: true,
      securityAccepted: true,
    });

    expect(result).toMatchObject({
      accepted: true,
      v4ProScopedRolesCompleted: true,
      implementationBridgeCompleted: true,
      completedRoleCount: requiredRoles.length,
      roleCloseoutCount: requiredRoles.length,
      targetScopeRequiresSkillifierRuntimeEvidence: false,
      skillifierRuntimeEvidencePresent: false,
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
    });
    expect(SINGLE_JOB_CODING_TEAM_QUALITY_GATE_ID).toBe(
      "single_job_coding_team_end_to_end_quality_proof",
    );
  });

  it("blocks injected evidence, missing role closeouts, and missing V4 Pro scoped roles", () => {
    const result = evaluateSingleJobCodingTeamQualityProof({
      roleExecutionEvidence: [
        {
          ...roleEvidence("implementation_engineer"),
          transportKind: "injected",
        },
      ],
      closeoutCapsule: { roleCloseouts: [] },
      changedFileRefs: [],
      validationRefs: [],
      reviewAccepted: false,
      securityAccepted: false,
    });

    expect(result.accepted).toBe(false);
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "role_execution_evidence_invalid:implementation_engineer",
        "role_closeout_missing:implementation_engineer",
        "v4_pro_scoped_roles_not_completed",
        "implementation_changed_file_refs_missing",
        "validation_refs_missing",
        "review_acceptance_missing",
        "security_privacy_acceptance_missing",
      ]),
    );
  });

  it("blocks duplicated generic role closeouts", () => {
    const duplicated = {
      roleCloseouts: requiredRoles.map((roleId) => ({
        roleId,
        modelRef: `model://${roleId}`,
        modelRunRef: "same-run",
        source: "model",
        actuallyDid: "same concrete work",
        whatIActuallyDid: "same concrete work",
        evidenceRefs: ["same-ref"],
        filesOrArtifactsTouched: ["same-file"],
        validationIPerformed: "same validation",
        confidence: "medium",
        limitations: ["same limitation"],
      })),
    };

    const result = evaluateSingleJobCodingTeamQualityProof({
      roleExecutionEvidence: requiredRoles.map(roleEvidence),
      closeoutCapsule: duplicated,
      changedFileRefs: ["file"],
      validationRefs: ["test"],
      reviewAccepted: true,
      securityAccepted: true,
    });

    expect(result.accepted).toBe(false);
    expect(result.reasonCodes).toContain("role_closeouts_generic_or_duplicate");
  });

  it("blocks implementation roles that only have live model evidence and static changed-file refs", () => {
    const result = evaluateSingleJobCodingTeamQualityProof({
      roleExecutionEvidence: requiredRoles.map((roleId) =>
        roleId === "implementation_engineer"
          ? {
              ...roleEvidence(roleId),
              transportKind: "live_model",
              producedArtifactRefs: [
                "runtime-job://job/agent-team/inline-role-report/implementation_engineer",
              ],
            }
          : roleEvidence(roleId),
      ),
      closeoutCapsule: capsule(),
      changedFileRefs: ["extensions/execution-platform/src/work-queue/execution-read-model.ts"],
      validationRefs: ["pnpm test:file work-queue"],
      reviewAccepted: true,
      securityAccepted: true,
    });

    expect(result.accepted).toBe(false);
    expect(result.implementationBridgeCompleted).toBe(false);
    expect(result.reasonCodes).toContain(
      "implementation_codex_file_editing_bridge_evidence_missing",
    );
  });

  it("requires bounded skillifier runtime evidence for active-queue-08 scope", () => {
    const blocked = evaluateSingleJobCodingTeamQualityProof({
      roleExecutionEvidence: requiredRoles.map(roleEvidence),
      closeoutCapsule: capsule(),
      changedFileRefs: ["extensions/execution-platform/src/work-queue/execution-read-model.ts"],
      validationRefs: ["pnpm test:file ui/src/ui/views/work-queue.test.ts"],
      reviewAccepted: true,
      securityAccepted: true,
      objectiveSummary: "Complete active-queue-08 Skillifier Runtime Job Migration.",
      runtimeResult: {
        workflowId: "agent_team.coding",
        artifactRefs: ["runtime-job://job/agent-team/implementation"],
      },
    });

    expect(blocked.accepted).toBe(false);
    expect(blocked.targetScopeRequiresSkillifierRuntimeEvidence).toBe(true);
    expect(blocked.skillifierRuntimeEvidencePresent).toBe(false);
    expect(blocked.reasonCodes).toContain("skillifier_runtime_evidence_missing_for_target_scope");

    const accepted = evaluateSingleJobCodingTeamQualityProof({
      roleExecutionEvidence: requiredRoles.map(roleEvidence),
      closeoutCapsule: capsule(),
      changedFileRefs: ["extensions/execution-platform/src/work-queue/execution-read-model.ts"],
      validationRefs: ["pnpm test:file ui/src/ui/views/work-queue.test.ts"],
      reviewAccepted: true,
      securityAccepted: true,
      objectiveSummary: "Complete active-queue-08 Skillifier Runtime Job Migration.",
      runtimeResult: {
        workflowId: "workflow.skillifier",
        candidateId: "skill-candidate-08",
        candidateType: "skill_edit",
        targetSkillRef: "skill://work-queue-ux-review",
        artifactRefs: ["runtime-job://job/model-task/skillifier"],
        middleware: {
          modelTask: {
            contractId: "skillifier.structured_json",
            artifactRefs: ["runtime-job://job/model-task/skillifier"],
          },
        },
      },
      artifactRefs: [
        "runtime-job://job/db-operation/skillifier-candidate",
        "review://skillifier-runtime-08",
      ],
    });

    expect(accepted.accepted).toBe(true);
    expect(accepted.targetScopeRequiresSkillifierRuntimeEvidence).toBe(true);
    expect(accepted.skillifierRuntimeEvidencePresent).toBe(true);
  });

  it("accepts nested workflow extension skillifier evidence for active-queue-08 scope", () => {
    const accepted = evaluateSingleJobCodingTeamQualityProof({
      roleExecutionEvidence: requiredRoles.map(roleEvidence),
      closeoutCapsule: capsule(),
      changedFileRefs: ["extensions/execution-platform/src/work-queue/execution-read-model.ts"],
      validationRefs: ["pnpm test:file ui/src/ui/views/work-queue.test.ts"],
      reviewAccepted: true,
      securityAccepted: true,
      objectiveSummary: "Complete active-queue-08 Skillifier Runtime Job Migration.",
      runtimeResult: {
        workflow: {
          extension: {
            extensionKind: "workflow.skillifier",
            skillifier: {
              candidateId: "skill-candidate-nested-08",
              candidateType: "new_skill",
              opportunitySeedRef: "opportunity-seed://closeout/nested-08",
              targetSkillPath: "skills/nested-skill/SKILL.md",
              modelTaskRefs: ["runtime-job://job/model-task/skillifier"],
              dbOperationRefs: ["runtime-job://job/db-operation/skillifier-candidate"],
              reviewRefs: ["review://skillifier-runtime-nested-08"],
            },
          },
        },
      },
    });

    expect(accepted.accepted).toBe(true);
    expect(accepted.targetScopeRequiresSkillifierRuntimeEvidence).toBe(true);
    expect(accepted.skillifierRuntimeEvidencePresent).toBe(true);
  });

  it("projects owner-facing role readbacks from model-authored closeout details", () => {
    const summary = closeoutCapsuleToLegacyHumanSummary({
      artifactKind: "execution_platform_closeout_capsule",
      schemaVersion: "execution-platform.closeout-capsule.v1",
      capsuleId: "closeout-capsule-readback-proof",
      createdAt: "2026-05-10T00:00:00.000Z",
      modelRef: "openai-codex/gpt-5.4",
      humanReport: {
        source: "model",
        reportMarkdown: "The lead report explains the implementation, review, and QA result.",
        eli5Progress: "The owner can see who did what and how it was checked.",
        limitations: ["No gateway reload or deployment was performed."],
      },
      structuredSummary: {
        taskSuccess: "satisfied",
        qualityAssessment: "The readback projection carries the role details owners need.",
        workflowFitAssessment: "The coding-team proof path is the right surface.",
        agentModelFitAssessment: "Role and model refs remain visible.",
        missingWork: [],
        validationSummary:
          "pnpm test:file extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.test.ts",
        riskSummary: "Runtime lifecycle was not mutated.",
        opportunitySeedIds: ["seed-1"],
      },
      roleCloseouts: [
        {
          roleId: "test_engineer",
          agentId: "test_engineer",
          modelRef: "model://test-engineer",
          modelRunRef: "model-run://test-engineer/readback-proof",
          source: "model",
          askedToDo: "Add focused tests for role closeout readback.",
          actuallyDid: "Added a regression that checks role-level closeout projection.",
          whatIWasAskedToDo: "Add focused tests for role closeout readback.",
          whatIActuallyDid: "Added a regression that checks role-level closeout projection.",
          eli5Progress: "QA checked that each role gets a readable receipt.",
          evidenceRefs: ["runtime-job://job-1/agent-team/test_engineer"],
          filesOrArtifactsTouched: [
            "extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.test.ts",
          ],
          validationIPerformed:
            "pnpm test:file extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.test.ts",
          worked: ["role readback fields are present"],
          failedOrWeak: ["live owner UI was intentionally not reloaded"],
          wouldImproveNext: ["run a managed soak after this bounded patch"],
          opportunitySeeds: [],
          confidence: "high",
          limitations: ["bounded unit-level proof only"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawTranscriptStored: false,
          rawProviderLogStored: false,
          rawToolLogStored: false,
        },
      ],
      opportunitySeeds: [
        {
          seedId: "seed-1",
          kind: "no_op",
          title: "No follow-up required for this proof",
          rationale: "The focused regression covers the projection.",
          recommendedNextStep: "Review the closeout readback in the Work Queue detail.",
          evidenceRefs: ["runtime-job://job-1/agent-team/test_engineer"],
          confidence: "medium",
        },
      ],
      factualRefs: {
        runtimeJobId: "job-1",
        teamRunId: "team-1",
        workflowId: "agent_team.coding",
        status: "completed",
        roles: [
          {
            roleId: "test_engineer",
            agentId: "test_engineer",
            modelRef: "model://test-engineer",
            status: "completed",
          },
        ],
        fileRefs: ["extensions/execution-platform/src/codex-bridge/closeout-capsule.ts"],
        artifactRefs: ["runtime-job://job-1/closeout-capsule/readback-proof"],
        validationRefs: [
          "pnpm test:file extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.test.ts",
        ],
        runtimeEventRefs: ["runtime-job://job-1/events"],
      },
      safetyFlags: {
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawCommandLogStored: false,
        workQueueLifecycleMutatedDirectly: false,
        authorityGrantedByCloseout: false,
        runtimeJobCreatedByCloseout: false,
      },
    } satisfies CloseoutCapsule);

    expect(summary.roleReadbacks).toEqual([
      expect.objectContaining({
        roleId: "test_engineer",
        roleRef: "role://test_engineer",
        modelRef: "model://test-engineer",
        modelRunRef: "model-run://test-engineer/readback-proof",
        status: "completed",
        source: "model",
        modelAuthoredCloseout: "Added a regression that checks role-level closeout projection.",
        whatRoleDid: "Added a regression that checks role-level closeout projection.",
        eli5Progress: "QA checked that each role gets a readable receipt.",
      }),
    ]);
    expect(summary.roleReadbacks[0]?.filesOrArtifactsTouched).toContain(
      "extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.test.ts",
    );
    expect(summary.roleReadbacks[0]?.validationEvidence).toContain(
      "pnpm test:file extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.test.ts",
    );
    expect(JSON.stringify(summary.roleReadbacks)).not.toMatch(/rawPrompt|rawResponse|providerLog/u);

    const ownerReadback = buildCloseoutCapsuleReadback({
      roleReadbacks: summary.roleReadbacks,
      leadReport: summary.whatChanged,
    });

    expect(ownerReadback).toContain("### role://test_engineer");
    expect(ownerReadback).toContain(
      "Role ref: role://test_engineer | Model ref: model://test-engineer | Model run ref: model-run://test-engineer/readback-proof",
    );
    expect(ownerReadback).toContain("Role status: completed | Closeout source: model");
    expect(ownerReadback).toContain(
      "What this role was asked to do:\n- Add focused tests for role closeout readback.",
    );
    expect(ownerReadback).toContain(
      "Model-authored closeout:\nAdded a regression that checks role-level closeout projection.",
    );
    expect(ownerReadback).toContain(
      "What this role did:\n- Added a regression that checks role-level closeout projection.",
    );
    expect(ownerReadback).toContain("Limitations:\n- bounded unit-level proof only");
    expect(ownerReadback).toContain(
      "Files/artifacts touched:\n- extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.test.ts",
    );
    expect(ownerReadback).toContain(
      "Evidence refs:\n- runtime-job://job-1/agent-team/test_engineer",
    );
    expect(ownerReadback).toContain(
      "Validation evidence:\n- pnpm test:file extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.test.ts",
    );
    expect(ownerReadback).toContain(
      "ELI5 progress:\n- QA checked that each role gets a readable receipt.",
    );
    expect(ownerReadback).not.toMatch(/rawPrompt|rawResponse|providerLog/u);
  });

  it("extracts validation refs from bounded validation evidence and runtime graph readback", () => {
    expect(
      validationRefsFromResult({
        validationRefs: [
          "pnpm test:file extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.test.ts",
        ],
        validationEvidence: [
          { command: "pnpm test:file ui/src/ui/views/work-queue.test.ts" },
          { validationRef: "validation://focused-readback" },
        ],
        runtimeGraph: {
          childActions: [
            {
              evidenceRefs: ["validation://child-readback", "repo://ignored"],
            },
          ],
          validationRepairLoops: [
            {
              validationRef: "validation://focused-readback",
              status: "passed_after_repair",
            },
            {
              validationRef: "validation://runtime-work-graph",
              status: "passed",
            },
          ],
        },
      }),
    ).toEqual([
      "pnpm test:file extensions/execution-platform/src/codex-bridge/agent-team-quality-proof.test.ts",
      "pnpm test:file ui/src/ui/views/work-queue.test.ts",
      "validation://focused-readback",
      "validation://child-readback",
      "validation://runtime-work-graph",
    ]);
  });
});
