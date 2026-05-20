import {
  createWorkflowPermissionReadback,
  type WorkflowPermissionReadback,
} from "../authority/workflow-permission-readback.ts";
import { latestAgentTeamFailureRecovery } from "../codex-bridge/agent-team-failure-recovery.ts";
import {
  latestAgentTeamResultReviewArtifact,
  type AgentTeamHumanCloseoutSummary,
} from "../codex-bridge/agent-team-result-review.ts";
import {
  latestAgentTeamRuntimeEvidence,
  type AgentTeamRuntimeEvidence,
} from "../codex-bridge/agent-team-runtime-evidence.ts";
import { latestAgentTeamStreamSummary } from "../codex-bridge/agent-team-stream-evidence.ts";
import { GENERIC_WORKFLOW_RUNNER_RETIREMENT_ARTIFACT_TYPE } from "../codex-bridge/workflow-queued-runner.ts";
import { latestModelRunAccountingSummary } from "../model-routing/model-run-accounting.ts";
import type { ProviderReliabilitySummary } from "../model-routing/provider-reliability-summary.ts";
import {
  runtimeExecutionSpanReadback,
  type RuntimeExecutionSpanReadback,
} from "../observability/runtime-execution-span.ts";
import type {
  JsonValue,
  RuntimeJob,
  RuntimeJobArtifact,
  RuntimeJobEvent,
  RuntimeJobRepository,
} from "../runtime-job-repository.ts";
import { ARCHITECTURE_RED_TEAM_GATE_ARTIFACT_TYPE } from "../workflows/architecture-red-team-gate.ts";
import { GENERIC_ORCHESTRATION_RUNTIME_RESULT_ARTIFACT_TYPE } from "../workflows/generic-orchestration-runtime.ts";
import { MISSION_CONTRACT_LEDGER_ARTIFACT_TYPE } from "../workflows/mission-contract-ledger.ts";
import {
  latestWebResearchRuntimeEvidence,
  type WebResearchRuntimeEvidence,
} from "../workflows/web-research-runtime-evidence.ts";
import { WORKFLOW_COMPLETION_REVIEW_ARTIFACT_TYPE } from "../workflows/workflow-completion-review.ts";
import { WORKFLOW_DEFINITION_RESOLUTION_ARTIFACT_TYPE } from "../workflows/workflow-definition.ts";
import { WORKFLOW_EVIDENCE_PROFILE_EVALUATION_ARTIFACT_TYPE } from "../workflows/workflow-evidence-profile.ts";
import { WORKFLOW_PLUGIN_RESOLUTION_ARTIFACT_TYPE } from "../workflows/workflow-plugin.ts";
import { projectDbPrimaryWorkQueueItem } from "./db-primary-work-queue-projection.ts";
import { summarizeProductSpecPlanningValidationRepairEvidence } from "./product-spec-planning-validation-repair-evidence.ts";
import {
  PRODUCT_SPEC_PLANNING_WORKER_CONTRACT_ARTIFACT_TYPE as PRODUCT_SPEC_PLANNING_WORKER_CONTRACT_ARTIFACT_TYPE_CANONICAL,
  normalizeProductSpecPlanningMode,
  validateProductSpecPlanningActionGraphProposal,
  validateProductSpecPlanningWorkerContract,
} from "./product-spec-planning-worker-contract.ts";
import type { WorkItemTruth, WorkRun } from "./types.ts";
import type { WorkQueueRepository } from "./work-queue-repository.ts";

export type WorkQueueExecutionReadModel = {
  artifactKind: "work_queue_execution_read_model";
  workItemId: string;
  convergenceSlice: ReturnType<typeof projectDbPrimaryWorkQueueItem>;
  linkedRuntimeJobIds: string[];
  runtimeJobs: Array<{
    runtimeJobId: string;
    runtimeJobState: RuntimeJob["state"];
    executorKind: string;
    activeSessionId: string | null;
    streamSummary: {
      eventCount: number;
      latestSummary: string | null;
    };
    latestHeartbeat: string | null;
    staleHeartbeat: boolean;
    processStatus: string | null;
    validationStatus: string | null;
    closeoutStatus: string | null;
    fileScopeStatus: string | null;
    sourceEditStatus: string | null;
    changedFileRefs: string[];
    completedWorkReasonCode: string | null;
    controlCommandState: string | null;
    rebuildRecoveryState: string | null;
    authorityStatuses: Array<{
      artifactType: string;
      status: string;
      profileId: string | null;
    }>;
    workflow: {
      route: string | null;
      workflowId: string | null;
      executorWorkflowId: string | null;
      subjectWorkflowIds: string[];
      targetSubjectRefs: JsonValue[];
      requestedCapabilities: string[];
      constraints: JsonValue[];
      workflowDisplayName: string | null;
      jobType: string;
      executorId: string | null;
      authorityProfile: string | null;
      approvalState: string;
      workflowStatus: string;
      validationState: string;
      reviewState: string;
      closeoutState: string;
      blockerReasonCodes: string[];
      controlAvailability: string[];
      artifactRefs: string[];
      routing: WorkQueueFrontDoorRoutingProjection;
      extension: JsonValue;
      lifecycleState: RuntimeJob["state"];
      workQueueLifecycleMutationAllowed: false;
    };
    worker: {
      artifactKind: "work_queue_worker_runtime_projection";
      state: "present" | "unknown" | "needs_review";
      workerAdapterId: string | null;
      workerAdapterStatus: string | null;
      workerContractState: string | null;
      workerContractAccepted: boolean | null;
      workerId: string | null;
      leaseId: string | null;
      claimState: "claimed" | "unclaimed" | "terminal_unclaimed";
      supervisorState: string;
      evidenceMode: "runtime_artifacts" | "static_injected" | "unknown";
      artifactRefs: string[];
      reasonCodes: string[];
      workQueueLifecycleMutationAllowed: false;
    };
    runtimeControl: {
      artifactKind: "work_queue_runtime_control_projection";
      state: "present" | "rejected" | "unknown";
      latestControlId: string | null;
      latestControlKind: string | null;
      latestControlStatus: string | null;
      targetValidated: boolean | null;
      appliedLiveControl: false;
      artifactRefs: string[];
      reasonCodes: string[];
      workQueueLifecycleMutationAllowed: false;
    };
    permissionReadback: WorkflowPermissionReadback | null;
    ownerReadback: {
      artifactKind: "work_queue_owner_runtime_readback";
      state: "ready" | "needs_review" | "missing";
      humanReportSummary: string | null;
      eli5Progress: string | null;
      planningMode: WorkQueueProductSpecPlanningMode | null;
      planningOutputKind: WorkQueueProductSpecPlanningOutputKind | null;
      planningWorkflowRefs: string[];
      planningCapsuleRefs: string[];
      researchBriefRefs: string[];
      researchInfluenceRefs: string[];
      staleExternalAssumptionFlags: string[];
      childActionProposalRefs: string[];
      actionGraphProposalRefs: string[];
      compileReadinessState:
        | "not_requested"
        | "needs_validation"
        | "blocked"
        | "compile_ready"
        | null;
      compileBlockedReasonCodes: string[];
      humanDecisionRefs: string[];
      humanDecisionRequestRefs: string[];
      humanDecisionState: "present" | "pending" | "not_required";
      planningDecisionState: "pending" | "accepted" | "rejected" | "not_required" | "unknown";
      humanDecisionOptions: Array<{
        optionId: string;
        optionSummary: string;
        tradeoffSummary: string | null;
        afterSelectionSummary: string | null;
        decisionRef: string | null;
      }>;
      humanDecisionResponseShape: string | null;
      humanDecisionDeadlineExpiresAt: string | null;
      humanDecisionBlockingGraphRefs: string[];
      humanDecisionResumeRefs: string[];
      humanDecisionBoundedResponseRefs: string[];
      validationRefs: string[];
      childProposalSummaries: Array<{
        actionId: string;
        title: string | null;
        assignedWorkflow: string | null;
        assignedRoleOrOwner: string | null;
        dependencyCount: number;
        authorityBoundary: string | null;
        compileReadinessState: string | null;
        validationExpectations: string[];
      }>;
      planningEvidenceSummary: {
        artifactKind: "product_spec_planning_owner_evidence_summary";
        changedFileRefs: string[];
        runtimeWorkflowMappingRefs: string[];
        workflowRegistrationEvidenceRefs: string[];
        executableNodeMappingEvidenceRefs: string[];
        orchestratorFirstEvidenceRefs: string[];
        planningCapsuleLifecycleState:
          | "missing"
          | "draft_present"
          | "revision_present"
          | "final_accepted";
        planningCapsuleLifecycleRefs: string[];
        actionGraphCompileReadinessState:
          | "not_requested"
          | "needs_validation"
          | "blocked"
          | "compile_ready"
          | null;
        actionGraphCompileReadinessRefs: string[];
        actionGraphProposalCompileValidationRefs: string[];
        compileBlockedReasonCodes: string[];
        commitmentEvidenceClaimRefs: string[];
        childActionsExecuted: boolean;
        runtimeJobsCreated: boolean;
        boundedEvidenceState: "bounded" | "needs_review" | "missing";
        rawStorageEvidenceRefs: string[];
        reasonCodes: string[];
      };
      taskSuccess: string | null;
      qualityAssessment: string | null;
      workflowFitAssessment: string | null;
      agentModelFitAssessment: string | null;
      limitations: string[];
      missionContract: {
        state: "present" | "missing" | "needs_review";
        ledgerStatus: string | null;
        openBlockingCommitmentCount: number;
        blockingCommitments: Array<{
          commitmentId: string;
          status: string;
          commitmentText: string;
          whyItMatters: string;
          expectedEvidenceDescription: string;
          acceptedEvidenceRefs: string[];
          evidenceClaimRefs: string[];
          evidenceMap: {
            sourceChangeRefs: string[];
            workflowWiringRefs: string[];
            contractRefs: string[];
            testRefs: string[];
            documentationRefs: string[];
            validationRefs: string[];
            liveProofRefs: string[];
            reviewRefs: string[];
            otherEvidenceRefs: string[];
          };
          changedFileRefs: string[];
          validationRefs: string[];
          remainingWork: string[];
        }>;
        artifactRefs: string[];
        boundedEvidenceState: "bounded" | "needs_review" | "missing";
        rawStorageEvidenceRefs: string[];
        reasonCodes: string[];
      };
      opportunitySeedCount: number;
      capsuleId: string | null;
      capsuleHash: string | null;
      reasonCodes: string[];
      rawPromptStored: false;
      rawResponseStored: false;
      rawLogsStored: false;
      workQueueLifecycleMutationAllowed: false;
    };
    ownerProgressReadback: {
      artifactKind: "work_queue_owner_progress_readback";
      state: "ready" | "needs_review" | "missing";
      headline: string;
      currentStage: string;
      activeWorker: string | null;
      activeModelRef: string | null;
      runtimeLifecycleState: RuntimeJob["state"];
      validationEvidenceState: "passed" | "failed" | "missing" | "unverified" | "skipped";
      closeoutEvidenceState: "accepted" | "needs_review" | "missing";
      changedFileState: "present" | "missing" | "not_required" | "unknown";
      humanDecisionState: "present" | "pending" | "not_required" | "unknown";
      eli5Progress: string;
      limitations: string[];
      nextAction: string;
      diagnosticReasonCodes: string[];
      appServerProgress: {
        state: "present" | "missing";
        eventCount: number;
        activePhase: string | null;
        lastMethod: string | null;
        lastItemType: string | null;
        lastItemStatus: string | null;
        threadRefs: string[];
        turnRefs: string[];
        fileRefs: string[];
        commandRefs: string[];
        abortOrInterruptState: string | null;
        latestEventAt: string | null;
        rawPromptStored: false;
        rawResponseStored: false;
        rawProviderLogStored: false;
        rawToolLogStored: false;
      };
      activeGraphProgress: {
        state: "present" | "missing";
        graphId: string | null;
        activeNodeId: string | null;
        activeNodeKind: string | null;
        roleId: string | null;
        modelRef: string | null;
        objective: string | null;
        whySelected: string | null;
        targetRefs: string[];
        inputHandoffRefs: string[];
        expectedOutput: string | null;
        currentPhase: string | null;
        validationState: string | null;
        evidenceProducedRefs: string[];
        evidenceClaimRefs: string[];
        genericNodeExecutionResultRefs: string[];
        evidenceClaims: Array<{
          evidenceClaimId: string;
          commitmentId: string;
          evidenceKind: string;
          evidenceRef: string;
          claimSummary: string;
          producedByNodeId: string;
          producedByCapabilityId: string | null;
          producedByExecutorKey: string | null;
          validationRefs: string[];
          changedFileRefs: string[];
          limitations: string[];
        }>;
        acceptedCommitmentIds: string[];
        rejectedCommitmentIds: string[];
        openCommitmentIds: string[];
        nextDecisionNeeded: string | null;
        blockerSummary: string | null;
        finalizationState: string | null;
        latestToolEventKind: string | null;
        eli5Progress: string | null;
        budget: {
          policyRef: string | null;
          budgetClass: string | null;
          runtimeToolTimeoutMs: number | null;
          modelCallTimeoutMs: number | null;
          workerLoopTurnTimeoutMs: number | null;
          validationCommandTimeoutMs: number | null;
          progressEmissionIntervalMs: number | null;
          staleProgressAfterMs: number | null;
          leaseTimeoutMs: number | null;
          leaseHeartbeatMs: number | null;
          elapsedMs: number | null;
          budgetRemainingMs: number | null;
          heartbeatState: string | null;
        };
        sourcePrompt: {
          promptHash: string | null;
          promptLength: number | null;
          resolutionStatus: string | null;
          sectionRefs: string[];
          excerptRequestRefs: string[];
          excerptProvidedRefs: string[];
          excerptDeniedRefs: string[];
        };
        contextFreshness: {
          state: "fresh" | "stale" | "missing" | "rejected" | "unknown";
          refreshAction: string | null;
          contextSnapshotRefs: string[];
          staleContextSnapshotRefs: string[];
          missingContextSnapshotRefs: string[];
          rejectedContextSnapshotRefs: string[];
          sourcePromptHash: string | null;
          repoRevision: string | null;
          worktreeFingerprint: string | null;
          freshnessSummary: string | null;
          blockingContextReason: string | null;
        };
        contextScout: {
          qualityState: string | null;
          verifiedFileRefs: string[];
          handoffPacketRefs: string[];
          toolLoopRefs: string[];
          runtimeToolInvocationRefs: string[];
          rejectedRefs: string[];
          sufficiencySummary: string | null;
          synthesisReadiness: string | null;
          synthesisBlockers: string[];
          repoAnalysisFindingCount: number | null;
          symbolRefs: string[];
          testRefs: string[];
          handoffSummaryForSynthesis: string | null;
          openBlockers: string[];
        };
        contextSynthesis: {
          state: "present" | "missing" | "needs_review" | "accepted";
          synthesisRef: string | null;
          status: string | null;
          implementationGroupCount: number | null;
          dependencyCount: number | null;
          parallelGroupCount: number | null;
          blockerCount: number | null;
          validationLaneCount: number | null;
          reviewLaneCount: number | null;
          workerFitSummary: string | null;
          graphCompileInputSummary: string | null;
          implementationGroupIds: string[];
          targetRefs: string[];
          validationLanes: string[];
          reviewLanes: string[];
          semanticCodeIntelligenceRefs: string[];
          contextSnapshotRefs: string[];
          nextDecision: string | null;
          eli5: string | null;
          rawPromptStored: false;
          rawResponseStored: false;
          rawProviderLogStored: false;
          rawToolLogStored: false;
        };
        codeIntelligence: {
          state: "present" | "missing" | "needs_review";
          semanticMode: string | null;
          backendId: string | null;
          backendState: string | null;
          backendHealthRef: string | null;
          workspaceSnapshotRef: string | null;
          semanticConfidence: string | null;
          fallbackUsed: boolean | null;
          fallbackReasonCodes: string[];
          diagnosticVersionRef: string | null;
          projectConfigRefs: string[];
          limitations: string[];
          backendLatencyMs: number | null;
          resultCounts: Record<string, number | null>;
          activeToolId: string | null;
          runtimeToolInvocationRefs: string[];
          resultRefs: string[];
          symbolRefs: string[];
          diagnosticRefs: string[];
          relatedTestRefs: string[];
          impactRefs: string[];
          staleRefBlockers: string[];
          latestSummary: string | null;
          reasonCodes: string[];
          rawPromptStored: false;
          rawResponseStored: false;
          rawProviderLogStored: false;
          rawToolLogStored: false;
        };
        commitmentWorkPackets: Array<{
          packetRef: string;
          commitmentId: string;
          authoringSource: string;
          qualityStatus: string;
          workerObjective: string | null;
          contextScoutObjective: string | null;
          implementationObjective: string | null;
          acceptanceCriteriaCount: number | null;
          acceptanceCriteria: string[];
          expectedEvidenceKinds: string[];
          likelyRepoAreas: string[];
          requiredContextQuestions: string[];
          downstreamConsumer: string | null;
        }>;
        costAwareDecision: {
          selectedCapabilityId: string | null;
          selectedProviderCapabilityProfileId: string | null;
          workerRef: string | null;
          roleClass: string | null;
          costClass: string | null;
          latencyClass: string | null;
          contextCapacity: string | null;
          productionSelectable: boolean | null;
          productionSelectionRequiresQualification: boolean | null;
          selectedModelQualificationProfileId: string | null;
          qualificationEvidenceRefs: string[];
          utilityRationale: string | null;
          costRationale: string | null;
          whyCheaperOptionsWereInsufficient: string | null;
          consideredCapabilityIds: string[];
          consideredProviderCapabilityProfileIds: string[];
        };
        schedulerToolTrace: {
          schedulerPhase: string | null;
          latestToolId: string | null;
          invocationRefs: string[];
        };
        parallelFrontier: {
          state: "present" | "missing";
          currentSuperstep: number | null;
          maxParallelNodeExecutions: number | null;
          dependencyLayerCount: number | null;
          readyNodeIds: string[];
          selectedNodeIds: string[];
          runningNodeIds: string[];
          completedNodeIds: string[];
          blockedNodeIds: string[];
          failedNodeIds: string[];
          needsReviewNodeIds: string[];
          waitingForHumanNodeIds: string[];
          skippedReasonCodes: string[];
          conflictDomains: Array<{ nodeId: string; keys: string[] }>;
          providerConcurrencyBudgets: Array<{
            key: string;
            limit: number | null;
            runnableNodeIds: string[];
            selectedNodeIds: string[];
            skippedNodeIds: string[];
          }>;
          joinReadyNodeIds: string[];
          contextSynthesisRefs: string[];
          implementationGroupCount: number | null;
        };
        modelCallProgress: {
          state: "present" | "missing";
          spanId: string | null;
          phase: string | null;
          modelRef: string | null;
          providerPath: string | null;
          roleId: string | null;
          nodeId: string | null;
          objective: string | null;
          inputHash: string | null;
          responseHash: string | null;
          elapsedMs: number | null;
          timeoutMs: number | null;
          heartbeatCount: number | null;
          responseShapeSummary: JsonValue | null;
          providerDiagnostics: JsonValue | null;
          providerUsage: JsonValue | null;
          usageUnavailableReason: string | null;
          reasonCodes: string[];
          rawPromptStored: false;
          rawResponseStored: false;
          rawProviderLogStored: false;
        };
        spanProgress: RuntimeExecutionSpanReadback;
        repairClassification: {
          state: "present" | "missing";
          classificationRef: string | null;
          failureClass: string | null;
          failedBoundaryKind: string | null;
          repairStrategy: string | null;
          selectedRepairBoundary: string | null;
          failedSpanRefs: string[];
          failedRuntimeToolInvocationRefs: string[];
          failedCommitmentIds: string[];
          failedFieldPaths: string[];
          reasonCodes: string[];
          expectedNextAction: string | null;
          semanticReviewRequired: boolean | null;
          rawPromptStored: false;
          rawResponseStored: false;
          rawProviderLogStored: false;
          rawToolLogStored: false;
          rawCommandLogStored: false;
          rawDbRowsStored: false;
          secretsStored: false;
          workQueueLifecycleMutated: false;
        };
        postSynthesisGraphQuality: {
          state: string | null;
          presentRoleObligations: string[];
          missingRoleObligations: string[];
          broadCodexShare: number | null;
          premiumShare: number | null;
        };
        workerToolTrace: {
          latestWorkerToolId: string | null;
          workerToolIds: string[];
          invocationRefs: string[];
          changedFileRefs: string[];
          validationRefs: string[];
          contextRequestRefs: string[];
          editStepIds: string[];
          evidenceClaimRefs: string[];
          editTransactionRefs: string[];
          workerPhaseRefs: string[];
          editTransactionPhase: string | null;
          editTransactionStatus: string | null;
          editTransactionRepairCount: number | null;
        };
        workerInternal: {
          state: "present" | "missing" | "needs_review";
          phase: string | null;
          phaseStatus: string | null;
          objective: string | null;
          whySelected: string | null;
          roleId: string | null;
          modelRef: string | null;
          providerPath: string | null;
          workerRef: string | null;
          capabilityId: string | null;
          selectedToolId: string | null;
          toolStatus: string | null;
          compoundToolId: string | null;
          compoundSubEventCount: number | null;
          compoundSubEventPhases: string[];
          toolInvocationRefs: string[];
          targetRefs: string[];
          inputPacketRefs: string[];
          contextRefs: string[];
          contextSynthesisRefs: string[];
          codeIntelligenceRefs: string[];
          currentValidationCommandRef: string | null;
          currentValidationCommandSummary: string | null;
          currentValidationCommandStatus: string | null;
          editTransactionRefs: string[];
          editTransactionPhase: string | null;
          editTransactionStatus: string | null;
          editTransactionRepairCount: number | null;
          changedFileRefs: string[];
          validationRefs: string[];
          evidenceRefs: string[];
          evidenceClaimRefs: string[];
          outputHash: string | null;
          outputContentLength: number | null;
          providerLatencyMs: number | null;
          providerTimeoutMs: number | null;
          providerFinishReason: string | null;
          providerTokenCount: number | null;
          providerUsage: JsonValue | null;
          usageUnavailableReason: string | null;
          providerDiagnostics: JsonValue | null;
          repairClassificationRef: string | null;
          repairFailureClass: string | null;
          blockerSummary: string | null;
          nextDecision: string | null;
          eli5: string | null;
          reasonCodes: string[];
          rawPromptStored: false;
          rawResponseStored: false;
          rawProviderLogStored: false;
          rawToolLogStored: false;
          rawCommandLogStored: false;
          rawDbRowsStored: false;
        };
        validationQa: {
          state: "present" | "missing" | "needs_review";
          taskPacketRefs: string[];
          planRefs: string[];
          commandRefs: string[];
          commandSummaries: string[];
          currentCommandRef: string | null;
          currentCommandSummary: string | null;
          currentCommandStatus: string | null;
          resultRefs: string[];
          failureRefs: string[];
          repairPlanRefs: string[];
          repairNodeRefs: string[];
          repairHandoffRefs: string[];
          coverageReviewRefs: string[];
          qaReviewRefs: string[];
          evidencePacketRefs: string[];
          toolInvocationRefs: string[];
          blockingCommitmentIds: string[];
          latestSummary: string | null;
          rawCommandLogsStored: false;
        };
        closeoutFinalization: {
          state: "accepted" | "needs_review" | "missing";
          evidencePacketRefs: string[];
          handoffRefs: string[];
          toolInvocationRefs: string[];
          acceptRefs: string[];
          rejectRefs: string[];
          missingReasonCodes: string[];
          maximalitySummary: string | null;
          limitationsSummary: string | null;
          eli5: string | null;
          recommendedNextAction: string | null;
          rawPromptStored: false;
          rawResponseStored: false;
          rawLogsStored: false;
        };
        boundaryReplay: {
          state: "present" | "missing";
          latestCheckpointKind: string | null;
          checkpointRefs: string[];
          graphCheckpointRefs: string[];
          planRefs: string[];
          replayStartPolicy: string | null;
          replaySafetyStatus: string | null;
          replayFreshnessStatus: string | null;
          replayContinuationMode: string | null;
          exactContinuationAction: string | null;
          exactContinuationMode: string | null;
          latestAcceptedCheckpointRef: string | null;
          skippedUpstreamCheckpointKinds: string[];
          resumeFromArtifactRefs: string[];
          invalidReasonCodes: string[];
          acceptedCheckpointRefs: string[];
          staleCheckpointRefs: string[];
          rejectedCheckpointRefs: string[];
          latestSummary: string | null;
          reasonCodes: string[];
          rawPromptStored: false;
          rawResponseStored: false;
          rawProviderLogStored: false;
          rawToolLogStored: false;
        };
        latestProgressEventRefs: string[];
        rawPromptStored: false;
        rawResponseStored: false;
        rawProviderLogStored: false;
        rawToolLogStored: false;
      };
      terminalAdapterOutcome: {
        status: string | null;
        errorCode: string | null;
        retryScheduled: boolean | null;
        reasonCodes: string[];
        summary: string | null;
        artifactRefs: string[];
        evidenceRefs: string[];
      };
      rawPromptStored: false;
      rawResponseStored: false;
      rawLogsStored: false;
      workQueueLifecycleMutationAllowed: false;
    };
    agentTeam: {
      agentTeamRunId: string | null;
      currentTeamState: string;
      activeRole: string | null;
      completedRoles: string[];
      pendingRoles: string[];
      blockedRoles: string[];
      needsReviewRoles: string[];
      latestHandoff: string | null;
      handoffCount: number;
      validationState: string;
      reviewState: string;
      closeoutState: string;
      authorityStatus: string;
      permissionEvidence: AgentTeamRuntimeEvidence["permissionEvidence"] | null;
      modelReadiness: Array<{
        modelId: string;
        status: string;
      }>;
      teamStreamSummary: {
        eventCount: number;
        latestSummary: string | null;
        blockerReasonCodes: string[];
      };
      modelAccountingSummary: {
        runCount: number;
        totalLatencyMs: number;
        totalTokenCount: number | null;
        estimatedCostUsd: number | null;
        providerUsageComplete: boolean;
        costSource?: string;
      };
      providerReliabilitySummary: {
        perModel: ProviderReliabilitySummary["perModel"];
        sourceArtifactRefs: string[];
      };
      taskGraph: {
        graphId: string | null;
        state: "present" | "missing" | "unknown";
        requiredSourceEdit: boolean | null;
        nodeCount: number;
        edgeCount: number;
        repeatedRoleInvocationCount: number;
        activeWorker: string | null;
        lastWorker: string | null;
        currentStage: string | null;
        repairAttemptCount: number;
        humanDecisionPresent: boolean;
        closeoutState: string;
        finalState: string;
        artifactRef: string | null;
        nodes: Array<{
          nodeId: string;
          stage: string;
          roleId: string | null;
          status: string;
          modelRef: string | null;
          providerPath: string | null;
          transportKind: string | null;
          artifactRefs: string[];
          validationRefs: string[];
          reasonCodes: string[];
        }>;
        kimiImplementation: {
          state: "present" | "missing" | "unknown";
          status: string | null;
          modelRef: string | null;
          modelRunRef: string | null;
          changedFileRefs: string[];
          validationRefs: string[];
          editTransactionRefs: string[];
          editTransactions: Array<{
            transactionRef: string;
            status: string | null;
            phase: string | null;
            changedFileRefs: string[];
            validationRefs: string[];
            repairAttemptCount: number | null;
            evidenceClaimRefs: string[];
            reasonCodes: string[];
          }>;
          repairClassificationRefs: string[];
          repairClassifications: Array<{
            classificationRef: string;
            failureClass: string | null;
            failedBoundaryKind: string | null;
            repairStrategy: string | null;
            selectedRepairBoundary: string | null;
            expectedNextAction: string | null;
            failedCommitmentIds: string[];
            reasonCodes: string[];
          }>;
          workerPhaseRefs: string[];
          workerPhases: Array<{
            phaseRef: string;
            phase: string | null;
            status: string | null;
            modelSlot: string | null;
            modelRef: string | null;
            toolId: string | null;
            toolInvocationRef: string | null;
            transactionRef: string | null;
            summary: string | null;
            blockerSummary: string | null;
            nextAction: string | null;
            reasonCodes: string[];
          }>;
          attemptCount: number;
          rejectionStages: string[];
          escalationRecommended: boolean;
          modelPolicySlots: Array<{
            slot: string;
            modelRef: string;
            providerPath: string;
            reasoningMode: string;
            responseFormatMode: string;
          }>;
          providerCapabilitySlotGate: {
            status: string | null;
            selectedControllerModelRef: string | null;
            selectedPatchModelRef: string | null;
            kimiControllerBlocked: boolean;
            kimiPatchAuthorAllowed: boolean;
            reasonCodes: string[];
          } | null;
          artifactRef: string | null;
          reasonCodes: string[];
        };
        reasonCodes: string[];
      };
      securityReviewState: string;
      failureRecoveryState: string;
      roleReports: Array<{
        roleId: string;
        modelId: string;
        status: string;
        whatRoleDid: string;
        transportKind?: string | null;
        modelRunRef?: string | null;
        producedArtifactRefs?: string[];
        roleCloseoutState?: string;
      }>;
      closeoutQuality: {
        state: "accepted" | "needs_review" | "missing";
        goalSatisfaction: string | null;
        limitations: string[];
        requiredFixes: string[];
      };
      closeoutCapsule: JsonValue | null;
      humanCloseoutSummary: AgentTeamHumanCloseoutSummary | null;
      blockers: string[];
      artifactRefs: string[];
      lifecycleTruthSource: "runtime_job_artifacts";
      workQueueLifecycleMutationAllowed: false;
    };
    webResearch: WorkQueueWebResearchProjection;
    skillifier: WorkQueueSkillifierProjection;
    middleware: WorkQueueRuntimeMiddlewareProjection;
    reviewStatus: string | null;
    completedWorkStatus: "satisfied" | "unsatisfied" | "unknown";
    needsReviewStatus: "needs_review" | "reviewed" | "not_required" | "unknown";
    humanCloseoutSummary: JsonValue | null;
    closeoutCapsule: JsonValue | null;
    artifactRefs: string[];
  }>;
  runtimeGraph: WorkQueueRuntimeGraphReadback | null;
  lifecycleTruthSource: "work_queue_repository";
  executionTruthSource: "execution_platform_runtime_jobs";
  uiMutationAllowed: false;
};

type WorkQueueExecutionRuntimeJobReadModel = WorkQueueExecutionReadModel["runtimeJobs"][number];

type WorkQueueRuntimeGraphReadback = {
  graphId: string;
  parentWorkItemId: string | null;
  ownerObjectiveSummary: string | null;
  approvedPlanRefs: string[];
  planningStatusIsLifecycleState: false;
  childActions: Array<{
    workItemId: string;
    title: string | null;
    actionKind: string;
    assignedRole: string;
    assignedWorkflow: string;
    runtimeJobId: string | null;
    graphNodeRef: string | null;
    blockerReasonCodes: string[];
    evidenceRefs: string[];
  }>;
  dependencyEdges: Array<{
    workItemId: string;
    dependsOnWorkItemId: string;
    dependencyType: string;
  }>;
  roleInvocations: Array<{
    roleId: string;
    modelRef: string;
    providerPath: string | null;
    transportKind: string | null;
    modelRunRef: string | null;
    status: string;
    latencyMs: number | null;
    producedArtifactRefs: string[];
  }>;
  humanTasks: Array<{
    humanTaskId: string;
    state: string;
    ownerOperatorId: string | null;
    resumeTokenRef: string | null;
    blockingGraphNodeRefs: string[];
  }>;
  validationRepairLoops: Array<{
    validationRef: string;
    repairNodeRef: string | null;
    status: string;
    reasonCodes: string[];
  }>;
  closeoutRef: string | null;
  finalCloseoutRef: string | null;
  limitations: string[];
  eli5Progress: string | null;
  artifactRefs: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutationAllowed: false;
};

export type WorkQueueWebResearchProjection = {
  artifactKind: "work_queue_web_research_projection";
  state: "present" | "unknown" | "needs_review" | "failed";
  workflowId: string | null;
  researchRunId: string | null;
  queryHash: string | null;
  boundedQuerySummary: string | null;
  boundedAnswerSummary: string | null;
  sourceCount: number;
  citationCount: number;
  citationRefs: string[];
  validationState: string;
  reviewState: string;
  closeoutState: string;
  artifactRefs: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawTranscriptStored: false;
  rawPageStored: false;
  rawProviderLogStored: false;
  rawToolLogStored: false;
  externalWritePerformed: false;
  workQueueLifecycleMutationAllowed: false;
};

export type WorkQueueRuntimeMiddlewareProjection = {
  artifactKind: "work_queue_runtime_middleware_projection";
  modelTask: {
    state: "present" | "unknown" | "failed";
    contractId: string | null;
    validationState: string;
    providerCallMade: boolean | null;
    runtimeToolInvocationRefs: string[];
    artifactRefs: string[];
  };
  scriptJob: {
    state: "present" | "unknown" | "failed";
    scriptId: string | null;
    lane: string | null;
    exitCode: number | null;
    shellExecutionAllowed: false;
    runtimeToolInvocationRefs: string[];
    artifactRefs: string[];
  };
  dbOperation: {
    state: "present" | "unknown" | "failed";
    operationName: string | null;
    operationKind: string | null;
    lane: string | null;
    decision: string | null;
    runtimeToolInvocationRefs: string[];
    rawRowsStored: false;
    artifactRefs: string[];
  };
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  rawDbRowsStored: false;
  authorityGranted: false;
  workQueueLifecycleMutationAllowed: false;
};

export type WorkQueueSkillifierProjection = {
  artifactKind: "work_queue_skillifier_projection";
  state: "present" | "unknown" | "needs_review" | "failed";
  runtimeJobId: string | null;
  workflowId: string | null;
  opportunity: WorkQueueProactivityOpportunityProjection | null;
  opportunitySeedRefs: string[];
  closeoutCapsuleRefs: string[];
  candidateId: string | null;
  candidateType: string | null;
  reviewState: string | null;
  targetSkillRefs: string[];
  modelRefs: string[];
  modelTaskRefs: string[];
  dbOperationRefs: string[];
  validationRefs: string[];
  reviewRefs: string[];
  candidateArtifactRefs: string[];
  closeoutRefs: string[];
  limitations: string[];
  eli5Progress: string | null;
  nextAction: string | null;
  skillFileEdited: false;
  lifecycleTruthSource: "runtime_job";
  artifactRefs: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawProviderLogStored: false;
  rawDbRowsStored: false;
  workQueueLifecycleMutationAllowed: false;
};

export type WorkQueueProactivityOpportunityProjection = {
  artifactKind: "work_queue_proactivity_opportunity_projection";
  state:
    | "captured"
    | "reviewed"
    | "accepted"
    | "duplicate_suppressed"
    | "stale"
    | "blocked"
    | "needs_review"
    | "unknown";
  capsuleRefs: string[];
  artifactRefs: string[];
  modelTaskRefs: string[];
  dbOperationRefs: string[];
  reviewRefs: string[];
  reasonCodes: string[];
  eli5Status: string | null;
  limitations: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutationAllowed: false;
};

export type WorkQueueFrontDoorRoutingProjection = {
  artifactKind: "work_queue_front_door_routing_projection";
  state:
    | "accepted"
    | "clarification_required"
    | "approval_required"
    | "blocked"
    | "needs_review"
    | "chat_or_status"
    | "plan_only"
    | "unknown";
  routeDecisionId: string | null;
  route: string | null;
  responseMode: string | null;
  executeNow: boolean | null;
  confidence: number | null;
  workflowId: string | null;
  jobType: string | null;
  routerModelRef: string | null;
  routerConfigVersion: string | null;
  routerSchemaVersion: string | null;
  workflowRegistryVersion: string | null;
  authoritySnapshotVersion: string | null;
  escalationOutcome: string | null;
  validatorOutcome: string | null;
  actionSemanticsOutcome: string | null;
  clarificationOutcome: string | null;
  clarificationRef: {
    clarificationId: string | null;
    targetRefs: string[];
    questionSummary: string | null;
    allowedAnswerShape: string | null;
  } | null;
  compilerOutcome: string | null;
  multiIntentPlanOutcome: string | null;
  childWorkflowHandoffCount: number;
  artifactRefs: string[];
  reasonCodes: string[];
  rawPromptStored: false;
  rawResponseStored: false;
  rawLogsStored: false;
  workQueueLifecycleMutationAllowed: false;
};

const PRODUCT_SPEC_PLANNING_WORKER_CONTRACT_ARTIFACT_TYPE =
  PRODUCT_SPEC_PLANNING_WORKER_CONTRACT_ARTIFACT_TYPE_CANONICAL;

export const WORK_QUEUE_PRODUCT_SPEC_PLANNING_MODES = [
  "plan_only",
  "child_action_graph_proposal",
  "compile_ready",
] as const;

export type WorkQueueProductSpecPlanningMode =
  (typeof WORK_QUEUE_PRODUCT_SPEC_PLANNING_MODES)[number];

export const WORK_QUEUE_PRODUCT_SPEC_PLANNING_OUTPUT_KINDS = [
  "plan_only_output",
  "child_action_graph_proposal_output",
  "compile_ready_output",
] as const;

export type WorkQueueProductSpecPlanningOutputKind =
  (typeof WORK_QUEUE_PRODUCT_SPEC_PLANNING_OUTPUT_KINDS)[number];

function asRecord(value: unknown): Record<string, unknown> | null {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArrayValue(value: unknown, limit = 20): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, limit)
    : [];
}

function arrayValue(value: unknown, limit = 20): unknown[] {
  return Array.isArray(value) ? value.slice(0, limit) : [];
}

function isSourceChangeEvidenceRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  return (
    normalized.startsWith("repo://") ||
    normalized.startsWith("diff://") ||
    normalized.startsWith("main-repo-change://") ||
    normalized.includes("/diff/") ||
    normalized.includes("/source-edit/") ||
    normalized.includes("/changed-file/")
  );
}

function isValidationEvidenceRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  return (
    normalized.startsWith("validation://") ||
    normalized.includes("/validation/") ||
    normalized.endsWith("/validation")
  );
}

function isWorkflowWiringEvidenceRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  if (
    isSourceChangeEvidenceRef(ref) ||
    isValidationEvidenceRef(ref) ||
    isReviewEvidenceRef(ref) ||
    isTestEvidenceRef(ref) ||
    isDocumentationEvidenceRef(ref) ||
    isLiveProofEvidenceRef(ref) ||
    isContractEvidenceRef(ref)
  ) {
    return false;
  }
  return (
    normalized.includes("workflow") ||
    normalized.includes("runtime-work-graph") ||
    normalized.includes("scheduler") ||
    normalized.includes("capability") ||
    normalized.includes("registry") ||
    normalized.includes("front-door") ||
    normalized.includes("router") ||
    normalized.includes("compile-runtime-plan")
  );
}

function isContractEvidenceRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  return (
    normalized.includes("contract") ||
    normalized.includes("research-brief") ||
    normalized.includes("planning-capsule") ||
    normalized.includes("human-decision") ||
    normalized.includes("action-graph") ||
    normalized.includes("closeout")
  );
}

function isTestEvidenceRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  return (
    normalized.includes(".test.") ||
    normalized.startsWith("test://") ||
    normalized.includes("test:file") ||
    normalized.includes("vitest") ||
    normalized.includes("pnpm test")
  );
}

function isDocumentationEvidenceRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  return (
    normalized.startsWith("docs://") ||
    normalized.includes("/docs/") ||
    normalized.includes("specs/") ||
    normalized.includes("status.md") ||
    normalized.includes("current_slice.md") ||
    normalized.includes("decisions.md") ||
    normalized.includes("roadmap.md") ||
    normalized.includes("runbook")
  );
}

function isLiveProofEvidenceRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  return (
    normalized.includes("live-proof") ||
    normalized.includes("live_ux") ||
    normalized.includes("live-ux") ||
    normalized.includes("ux-proof") ||
    normalized.includes("runtime-proof")
  );
}

function isReviewEvidenceRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  return normalized.startsWith("review://") || normalized.includes("/review/");
}

function isProductSpecWorkflowRegistrationEvidenceRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  if (normalized === "workflow://agent_team.product_spec_planning") {
    return true;
  }
  return (
    normalized.includes("agent_team.product_spec_planning") &&
    (normalized.includes("workflow-definition") ||
      normalized.includes("workflow_definition") ||
      normalized.includes("workflow-plugin") ||
      normalized.includes("workflow_plugin") ||
      normalized.includes("workflow-registry") ||
      normalized.includes("workflow_registry"))
  );
}

function isProductSpecExecutableNodeMappingEvidenceRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  return (
    normalized.includes("runtime-node-capability") ||
    normalized.includes("runtime_node_capability") ||
    normalized.includes("capability-registry") ||
    normalized.includes("capability_registry") ||
    normalized.includes("executor-coverage") ||
    normalized.includes("executor_coverage") ||
    normalized.includes("executor-mapping") ||
    normalized.includes("executor_mapping") ||
    normalized.includes("node-mapping") ||
    normalized.includes("node_mapping") ||
    normalized.includes("runtime-workflow-graph-engine") ||
    normalized.includes("runtime_workflow_graph_engine")
  );
}

function isProductSpecOrchestratorFirstEvidenceRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  if (isProductSpecExecutableNodeMappingEvidenceRef(ref)) {
    return false;
  }
  return (
    normalized.includes("planning_orchestrator") ||
    normalized.includes("planning-orchestrator") ||
    normalized.includes("orchestrator-first") ||
    normalized.includes("orchestrator_first") ||
    normalized.includes("first-node")
  );
}

function isProductSpecActionGraphCompileEvidenceRef(ref: string): boolean {
  const normalized = ref.trim().toLowerCase();
  return (
    normalized.includes("action-graph") ||
    normalized.includes("action_graph") ||
    normalized.includes("compile-runtime-plan") ||
    normalized.includes("compile_runtime_plan") ||
    normalized.includes("compile-readiness") ||
    normalized.includes("compile_readiness") ||
    normalized.includes("proposal/compile")
  );
}

function isRawStorageEvidenceRef(ref: string): boolean {
  return /raw[-_ ]?(page|content|prompt|response|transcript|log|db[-_ ]?row)|provider[-_ ]?log|tool[-_ ]?log|command[-_ ]?log|hidden[-_ ]?reasoning|secret/iu.test(
    ref,
  );
}

function commitmentEvidenceMap(acceptedEvidenceRefs: string[]) {
  const sourceChangeRefs = acceptedEvidenceRefs.filter(isSourceChangeEvidenceRef).slice(0, 8);
  const workflowWiringRefs = acceptedEvidenceRefs.filter(isWorkflowWiringEvidenceRef).slice(0, 8);
  const contractRefs = acceptedEvidenceRefs.filter(isContractEvidenceRef).slice(0, 8);
  const testRefs = acceptedEvidenceRefs.filter(isTestEvidenceRef).slice(0, 8);
  const documentationRefs = acceptedEvidenceRefs.filter(isDocumentationEvidenceRef).slice(0, 8);
  const validationRefs = acceptedEvidenceRefs.filter(isValidationEvidenceRef).slice(0, 8);
  const liveProofRefs = acceptedEvidenceRefs.filter(isLiveProofEvidenceRef).slice(0, 8);
  const reviewRefs = acceptedEvidenceRefs.filter(isReviewEvidenceRef).slice(0, 8);
  const classified = new Set([
    ...sourceChangeRefs,
    ...workflowWiringRefs,
    ...contractRefs,
    ...testRefs,
    ...documentationRefs,
    ...validationRefs,
    ...liveProofRefs,
    ...reviewRefs,
  ]);
  return {
    sourceChangeRefs,
    workflowWiringRefs,
    contractRefs,
    testRefs,
    documentationRefs,
    validationRefs,
    liveProofRefs,
    reviewRefs,
    otherEvidenceRefs: acceptedEvidenceRefs.filter((ref) => !classified.has(ref)).slice(0, 8),
  };
}

function productSpecPlanningCapsuleLifecycleState(input: {
  refs: string[];
  records: Record<string, unknown>[];
}): "missing" | "draft_present" | "revision_present" | "final_accepted" {
  if (input.refs.length === 0 && input.records.length === 0) {
    return "missing";
  }
  if (
    input.records.some(
      (record) =>
        stringValue(record.lifecycleState) === "final_accepted" ||
        record.accepted === true ||
        (record.modelAuthored === true &&
          stringValue(record.compileReadinessState) === "compile_ready"),
    )
  ) {
    return "final_accepted";
  }
  if (
    input.records.some((record) => {
      const version = record.capsuleVersion;
      return (
        Boolean(stringValue(record.previousCapsuleRef)) ||
        (typeof version === "number" && version > 1)
      );
    })
  ) {
    return "revision_present";
  }
  return "draft_present";
}

function actionGraphRecord(truth: WorkItemTruth): Record<string, unknown> | null {
  return asRecord(asRecord(truth.item.metadata)?.actionGraph);
}

function runtimeGraphIdFromTruths(
  parentTruth: WorkItemTruth,
  childTruths: WorkItemTruth[],
): string | null {
  const parentGraphRef = stringValue(parentTruth.item.graphRef);
  if (parentGraphRef) {
    return parentGraphRef;
  }
  for (const childTruth of childTruths) {
    const graphId = stringValue(actionGraphRecord(childTruth)?.graphId);
    if (graphId) {
      return graphId;
    }
  }
  return null;
}

function buildRuntimeGraphReadback(
  parentTruth: WorkItemTruth,
  childTruths: WorkItemTruth[],
): WorkQueueRuntimeGraphReadback | null {
  const graphId = runtimeGraphIdFromTruths(parentTruth, childTruths);
  if (!graphId && childTruths.length === 0) {
    return null;
  }
  const graphChildren = childTruths
    .map((truth) => ({ truth, actionGraph: actionGraphRecord(truth) }))
    .filter((entry): entry is { truth: WorkItemTruth; actionGraph: Record<string, unknown> } =>
      Boolean(entry.actionGraph),
    )
    .slice(0, 200);
  if (!graphId || graphChildren.length === 0) {
    return null;
  }
  const childActions = graphChildren.map(({ truth, actionGraph }) => {
    const evidenceRefs = boundedUniqueStringValues(
      [
        ...stringArrayValue(actionGraph.evidenceRefs, 20),
        ...truth.artifacts.map((artifact) => artifact.uri),
      ],
      20,
    );
    return {
      workItemId: truth.item.workItemId,
      title: truth.item.title,
      actionKind:
        stringValue(actionGraph.actionKind) ??
        stringValue(actionGraph.nodeKind) ??
        truth.item.itemType,
      assignedRole:
        stringValue(actionGraph.assignedRole) ?? truth.assignments[0]?.role ?? "unknown_role",
      assignedWorkflow:
        stringValue(actionGraph.assignedWorkflow) ??
        truth.assignments[0]?.assigneeId ??
        "unknown_workflow",
      runtimeJobId:
        stringValue(actionGraph.runtimeJobId) ??
        truth.runs.find((run) => run.runtimeJobId)?.runtimeJobId ??
        null,
      graphNodeRef: stringValue(actionGraph.graphNodeRef),
      blockerReasonCodes: stringArrayValue(actionGraph.blockerReasonCodes, 20),
      evidenceRefs,
    };
  });
  const dependencyEdges = graphChildren.flatMap(({ truth }) =>
    truth.dependencies.slice(0, 50).map((dependency) => ({
      workItemId: dependency.workItemId,
      dependsOnWorkItemId: dependency.dependsOnWorkItemId,
      dependencyType: dependency.dependencyType,
    })),
  );
  const roleInvocations = graphChildren
    .filter(({ actionGraph }) => stringValue(actionGraph.nodeKind) !== "human_task")
    .map(({ truth, actionGraph }) => ({
      roleId: stringValue(actionGraph.assignedRole) ?? truth.assignments[0]?.role ?? "unknown_role",
      modelRef:
        stringValue(actionGraph.modelRef) ??
        stringValue(actionGraph.assignedWorkflow) ??
        truth.assignments[0]?.assigneeId ??
        "unknown_model",
      providerPath: stringValue(actionGraph.providerPath),
      transportKind: stringValue(actionGraph.transportKind),
      modelRunRef: stringValue(actionGraph.modelRunRef),
      status: truth.item.queueStatus ?? "unknown",
      latencyMs: numberValue(actionGraph.latencyMs),
      producedArtifactRefs: boundedUniqueStringValues(
        [
          ...stringArrayValue(actionGraph.evidenceRefs, 20),
          ...truth.artifacts.map((artifact) => artifact.uri),
        ],
        20,
      ),
    }));
  const humanTasks = graphChildren
    .filter(({ actionGraph }) => {
      const humanTaskId = stringValue(actionGraph.humanTaskId);
      const nodeKind = stringValue(actionGraph.nodeKind);
      return Boolean(humanTaskId) || nodeKind === "human_task";
    })
    .map(({ truth, actionGraph }) => ({
      humanTaskId:
        stringValue(actionGraph.humanTaskId) ??
        stringValue(actionGraph.graphNodeRef) ??
        truth.item.workItemId,
      state: truth.item.queueStatus ?? "unknown",
      ownerOperatorId: stringValue(actionGraph.ownerOperatorId),
      resumeTokenRef: stringValue(actionGraph.resumeTokenRef),
      blockingGraphNodeRefs: stringArrayValue(actionGraph.blockingGraphNodeRefs, 20),
    }));
  const repairNodeRef =
    graphChildren
      .map(({ actionGraph }) =>
        stringValue(actionGraph.nodeKind)?.includes("repair")
          ? stringValue(actionGraph.graphNodeRef)
          : null,
      )
      .find((ref): ref is string => Boolean(ref)) ?? null;
  const validationRepairLoops = graphChildren
    .filter(({ actionGraph }) => {
      const nodeKind = stringValue(actionGraph.nodeKind) ?? "";
      return nodeKind.includes("validation") || nodeKind.includes("repair");
    })
    .slice(0, 50)
    .map(({ truth, actionGraph }) => ({
      validationRef:
        stringValue(actionGraph.graphNodeRef) ??
        stringArrayValue(actionGraph.evidenceRefs, 1)[0] ??
        truth.item.workItemId,
      repairNodeRef,
      status: truth.item.queueStatus ?? "unknown",
      reasonCodes: stringArrayValue(actionGraph.blockerReasonCodes, 20),
    }));
  const artifactRefs = boundedUniqueStringValues(
    [
      ...parentTruth.artifacts.map((artifact) => artifact.uri),
      ...graphChildren.flatMap(({ truth }) => truth.artifacts.map((artifact) => artifact.uri)),
      ...childActions.flatMap((child) => child.evidenceRefs),
    ],
    50,
  );
  return {
    graphId,
    parentWorkItemId: parentTruth.item.workItemId,
    ownerObjectiveSummary:
      parentTruth.item.description ?? parentTruth.currentVersion?.title ?? null,
    approvedPlanRefs: boundedUniqueStringValues(
      [
        stringValue(parentTruth.item.graphRef),
        ...parentTruth.artifacts.map((artifact) => artifact.uri),
      ],
      10,
    ),
    planningStatusIsLifecycleState: false,
    childActions,
    dependencyEdges,
    roleInvocations,
    humanTasks,
    validationRepairLoops,
    closeoutRef: parentTruth.item.closeoutCapsuleRef ?? null,
    finalCloseoutRef: parentTruth.item.closedByCloseoutRef ?? null,
    limitations: [],
    eli5Progress:
      childActions.length > 0
        ? "The Work Queue is showing the parent item, child graph nodes, role work, human tasks, validation or repair loops, and closeout refs from DB-backed runtime evidence."
        : null,
    artifactRefs,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutationAllowed: false,
  };
}

function firstBoundedString(
  records: Array<Record<string, unknown> | null>,
  keys: string[],
): string | null {
  for (const record of records) {
    for (const key of keys) {
      const value = stringValue(record?.[key]);
      if (value) {
        return value.slice(0, 260);
      }
    }
  }
  return null;
}

function firstBoolean(
  records: Array<Record<string, unknown> | null>,
  keys: string[],
): boolean | null {
  for (const record of records) {
    for (const key of keys) {
      const value = booleanValue(record?.[key]);
      if (value !== null) {
        return value;
      }
    }
  }
  return null;
}

function metadataStatus(artifact: RuntimeJobArtifact | undefined, keys: string[]): string | null {
  const record = asRecord(artifact?.metadata);
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "boolean") {
      return value ? "satisfied" : "unsatisfied";
    }
  }
  return null;
}

function latestArtifact(
  artifacts: RuntimeJobArtifact[],
  type: string,
): RuntimeJobArtifact | undefined {
  return artifacts.findLast((artifact) => artifact.artifactType === type);
}

function authorityStatusArtifacts(artifacts: RuntimeJobArtifact[]): Array<{
  artifactType: string;
  status: string;
  profileId: string | null;
}> {
  return artifacts
    .filter(
      (artifact) =>
        artifact.artifactType.includes("authority") ||
        artifact.artifactType.includes("approval") ||
        artifact.artifactType.includes("acp_bridge") ||
        artifact.artifactType.includes("model_candidate") ||
        artifact.artifactType.includes("_pilot") ||
        artifact.artifactType === "codex_bridge.rebuild_command_result" ||
        artifact.artifactType === "codex_bridge.model_promotion_decision",
    )
    .map((artifact) => {
      const record = asRecord(artifact.metadata);
      return {
        artifactType: artifact.artifactType,
        status: stringValue(record?.status) ?? (record?.valid === true ? "valid" : "recorded"),
        profileId: stringValue(record?.profileId),
      };
    })
    .slice(0, 20);
}

function productionAuthorityCockpitArtifacts(artifacts: RuntimeJobArtifact[]): JsonValue {
  return artifacts
    .filter(
      (artifact) =>
        artifact.artifactType.includes("production_authority") ||
        artifact.artifactType.includes("production_deploy") ||
        artifact.artifactType.includes("external_outbound_write") ||
        artifact.artifactType.includes("production_model_promotion") ||
        artifact.artifactType.includes("default_on"),
    )
    .map((artifact) => {
      const record = asRecord(artifact.metadata);
      return {
        artifactType: artifact.artifactType,
        authorityId: stringValue(record?.authorityId),
        state: stringValue(record?.state) ?? stringValue(record?.status),
        target: stringValue(record?.target) ?? stringValue(record?.requestedTarget),
        killSwitchStatus: record?.killSwitchActive === true ? "active" : "inactive_or_unknown",
        rollbackStatus:
          record?.rollbackAvailable === true || record?.rollbackAvailable === "true"
            ? "available"
            : "unknown",
        auditRefs: Array.isArray(record?.auditRefs)
          ? record.auditRefs.filter((item): item is string => typeof item === "string").slice(0, 10)
          : [],
        uri: artifact.uri,
      };
    })
    .slice(0, 20);
}

function frontDoorRoutingState(input: {
  routerOutput: Record<string, unknown> | null;
  validationRecord: Record<string, unknown> | null;
  actionSemanticsRecord: Record<string, unknown> | null;
  clarificationRecord: Record<string, unknown> | null;
  compiledRecord: Record<string, unknown> | null;
  hasFrontDoorEvidence: boolean;
}): WorkQueueFrontDoorRoutingProjection["state"] {
  if (!input.hasFrontDoorEvidence) {
    return "unknown";
  }
  const route = stringValue(input.routerOutput?.route);
  const validationOutcome = stringValue(input.validationRecord?.outcome);
  const actionOutcome = stringValue(input.actionSemanticsRecord?.outcome);
  const clarificationOutcome = stringValue(input.clarificationRecord?.outcome);
  const compiledKind = stringValue(input.compiledRecord?.artifactKind);
  if (route === "clarification_required" || clarificationOutcome === "clarification_required") {
    return "clarification_required";
  }
  if (validationOutcome === "approval_required" || actionOutcome === "approval_required") {
    return "approval_required";
  }
  if (validationOutcome === "blocked" || actionOutcome === "blocked" || route === "blocked") {
    return "blocked";
  }
  if (
    validationOutcome === "needs_review" ||
    actionOutcome === "needs_review" ||
    route === "needs_review"
  ) {
    return "needs_review";
  }
  if (route === "chat_response" || route === "status_response") {
    return "chat_or_status";
  }
  if (route === "plan_only" || compiledKind === "front_door_compiled_plan_only") {
    return "plan_only";
  }
  if (
    validationOutcome === "accepted" &&
    compiledKind === "front_door_compiled_runtime_job_request"
  ) {
    return "accepted";
  }
  return "unknown";
}

export function projectFrontDoorRoutingState(
  artifacts: RuntimeJobArtifact[],
): WorkQueueFrontDoorRoutingProjection {
  const router = latestArtifact(artifacts, "execution.front_door.router_result");
  const escalation = latestArtifact(artifacts, "execution.front_door.escalation");
  const validation = latestArtifact(artifacts, "execution.front_door.validation");
  const actionSemantics = latestArtifact(artifacts, "execution.front_door.action_semantics");
  const clarification = latestArtifact(artifacts, "execution.front_door.clarification_gate");
  const compiled = latestArtifact(artifacts, "execution.front_door.compiled_request");
  const multiIntentPlan = latestArtifact(artifacts, "execution.front_door.multi_intent_plan");
  const childHandoffs = latestArtifact(artifacts, "execution.front_door.child_handoffs");
  const telemetry = latestArtifact(artifacts, "execution.front_door.routing_telemetry");
  const routerRecord = asRecord(router?.metadata);
  const routerOutput = asRecord(routerRecord?.output);
  const routerMetadata = asRecord(routerRecord?.metadata);
  const escalationRecord = asRecord(escalation?.metadata);
  const validationRecord = asRecord(validation?.metadata);
  const actionSemanticsRecord = asRecord(actionSemantics?.metadata);
  const clarificationRecord = asRecord(clarification?.metadata);
  const clarificationArtifact = asRecord(clarificationRecord?.clarification);
  const compiledRecord = asRecord(compiled?.metadata);
  const multiIntentPlanRecord = asRecord(multiIntentPlan?.metadata);
  const telemetryRecord = asRecord(telemetry?.metadata);
  const artifactRefs = [
    router,
    escalation,
    validation,
    actionSemantics,
    clarification,
    compiled,
    multiIntentPlan,
    childHandoffs,
    telemetry,
  ]
    .filter((artifact): artifact is RuntimeJobArtifact => Boolean(artifact))
    .map((artifact) => artifact.uri)
    .slice(0, 20);
  const hasFrontDoorEvidence = artifactRefs.length > 0;
  const reasonCodes = [
    ...stringArrayValue(routerMetadata?.reasonCodes),
    ...stringArrayValue(escalationRecord?.reasonCodes),
    ...stringArrayValue(validationRecord?.reasonCodes),
    ...stringArrayValue(actionSemanticsRecord?.reasonCodes),
    ...stringArrayValue(clarificationRecord?.reasonCodes),
    ...stringArrayValue(compiledRecord?.reasonCodes),
    ...stringArrayValue(multiIntentPlanRecord?.reasonCodes),
    ...stringArrayValue(telemetryRecord?.reasonCodes),
    ...(hasFrontDoorEvidence ? [] : ["front_door_routing_evidence_missing"]),
  ].slice(0, 30);
  return {
    artifactKind: "work_queue_front_door_routing_projection",
    state: frontDoorRoutingState({
      routerOutput,
      validationRecord,
      actionSemanticsRecord,
      clarificationRecord,
      compiledRecord,
      hasFrontDoorEvidence,
    }),
    routeDecisionId: stringValue(telemetryRecord?.routeDecisionId),
    route: stringValue(routerOutput?.route) ?? stringValue(telemetryRecord?.route),
    responseMode:
      stringValue(routerOutput?.responseMode) ?? stringValue(telemetryRecord?.responseMode),
    executeNow: booleanValue(routerOutput?.executeNow) ?? booleanValue(telemetryRecord?.executeNow),
    confidence: numberValue(routerOutput?.confidence) ?? numberValue(telemetryRecord?.confidence),
    workflowId: stringValue(routerOutput?.workflowId) ?? stringValue(telemetryRecord?.workflowId),
    jobType: stringValue(routerOutput?.jobType) ?? stringValue(telemetryRecord?.jobType),
    routerModelRef:
      stringValue(routerMetadata?.modelCandidateId) ??
      stringValue(routerMetadata?.routerModelPolicyRef) ??
      stringValue(telemetryRecord?.modelCandidateRef),
    routerConfigVersion:
      stringValue(routerMetadata?.routerConfigVersion) ??
      stringValue(telemetryRecord?.routerConfigVersion),
    routerSchemaVersion:
      stringValue(routerMetadata?.schemaVersion) ??
      stringValue(telemetryRecord?.routerSchemaVersion),
    workflowRegistryVersion:
      stringValue(routerMetadata?.workflowRegistryVersion) ??
      stringValue(telemetryRecord?.workflowRegistryVersion),
    authoritySnapshotVersion:
      stringValue(telemetryRecord?.authoritySnapshotVersion) ??
      stringValue(validationRecord?.authoritySnapshotVersion),
    escalationOutcome:
      stringValue(escalationRecord?.outcome) ?? stringValue(telemetryRecord?.escalationOutcome),
    validatorOutcome:
      stringValue(validationRecord?.outcome) ?? stringValue(telemetryRecord?.validatorOutcome),
    actionSemanticsOutcome:
      stringValue(actionSemanticsRecord?.outcome) ??
      stringValue(telemetryRecord?.actionSemanticsOutcome),
    clarificationOutcome:
      stringValue(clarificationRecord?.outcome) ??
      stringValue(telemetryRecord?.clarificationOutcome),
    clarificationRef: clarificationArtifact
      ? {
          clarificationId: stringValue(clarificationArtifact.clarificationId),
          targetRefs: stringArrayValue(clarificationArtifact.targetRefs, 10),
          questionSummary: stringValue(clarificationArtifact.questionSummary),
          allowedAnswerShape: stringValue(clarificationArtifact.allowedAnswerShape),
        }
      : null,
    compilerOutcome:
      stringValue(compiledRecord?.artifactKind) ?? stringValue(telemetryRecord?.compilerOutcome),
    multiIntentPlanOutcome:
      stringValue(multiIntentPlanRecord?.outcome) ??
      stringValue(telemetryRecord?.multiIntentPlanOutcome),
    childWorkflowHandoffCount: Array.isArray(childHandoffs?.metadata)
      ? childHandoffs.metadata.length
      : Number.isFinite(telemetryRecord?.childWorkflowHandoffCount)
        ? Number(telemetryRecord?.childWorkflowHandoffCount)
        : 0,
    artifactRefs,
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutationAllowed: false,
  };
}

function workflowProjection(
  job: RuntimeJob,
  artifacts: RuntimeJobArtifact[],
): WorkQueueExecutionRuntimeJobReadModel["workflow"] {
  const payload = asRecord(job.payload);
  const compiled = latestArtifact(artifacts, "execution.workflow_request_compiled");
  const compiledRecord = asRecord(compiled?.metadata);
  const validation = latestArtifact(artifacts, "execution.intent_validation");
  const validationRecord = asRecord(validation?.metadata);
  const route = latestArtifact(artifacts, "execution.intent_router_decision");
  const routeRecord = asRecord(route?.metadata);
  const routeDecision = asRecord(routeRecord?.routeDecision);
  const frontDoorRouting = projectFrontDoorRoutingState(artifacts);
  const workerContractState = latestArtifact(artifacts, "execution.worker_contract_state");
  const workerContractRecord = asRecord(workerContractState?.metadata);
  const workflowDefinition = latestArtifact(
    artifacts,
    WORKFLOW_DEFINITION_RESOLUTION_ARTIFACT_TYPE,
  );
  const workflowDefinitionRecord = asRecord(workflowDefinition?.metadata);
  const workflowPlugin = latestArtifact(artifacts, WORKFLOW_PLUGIN_RESOLUTION_ARTIFACT_TYPE);
  const workflowPluginRecord = asRecord(workflowPlugin?.metadata);
  const architectureRedTeamGate = latestArtifact(
    artifacts,
    ARCHITECTURE_RED_TEAM_GATE_ARTIFACT_TYPE,
  );
  const architectureRedTeamGateRecord = asRecord(architectureRedTeamGate?.metadata);
  const architectureProofDecision = asRecord(architectureRedTeamGateRecord?.proofReadinessDecision);
  const architectureFinalReview = asRecord(architectureRedTeamGateRecord?.finalReview);
  const genericRunnerRetirement = latestArtifact(
    artifacts,
    GENERIC_WORKFLOW_RUNNER_RETIREMENT_ARTIFACT_TYPE,
  );
  const genericRunnerRetirementRecord = asRecord(genericRunnerRetirement?.metadata);
  const workflowEngineReadiness = latestArtifact(
    artifacts,
    "execution.runtime_workflow_graph_engine_readiness",
  );
  const workflowEngineRecord = asRecord(workflowEngineReadiness?.metadata);
  const genericOrchestrationRuntime = latestArtifact(
    artifacts,
    GENERIC_ORCHESTRATION_RUNTIME_RESULT_ARTIFACT_TYPE,
  );
  const genericOrchestrationRuntimeRecord = asRecord(genericOrchestrationRuntime?.metadata);
  const completionReview = latestArtifact(artifacts, WORKFLOW_COMPLETION_REVIEW_ARTIFACT_TYPE);
  const completionReviewRecord = asRecord(completionReview?.metadata);
  const completionReviewGate = latestArtifact(
    artifacts,
    "execution.workflow_completion_review_gate",
  );
  const completionReviewGateRecord = asRecord(completionReviewGate?.metadata);
  const workflowEvidenceProfile = latestArtifact(
    artifacts,
    WORKFLOW_EVIDENCE_PROFILE_EVALUATION_ARTIFACT_TYPE,
  );
  const workflowEvidenceProfileRecord = asRecord(workflowEvidenceProfile?.metadata);
  const workflowId = stringValue(compiledRecord?.workflowId) ?? stringValue(payload?.workflowId);
  const executorWorkflowId =
    stringValue(compiledRecord?.executorWorkflowId) ??
    stringValue(payload?.executorWorkflowId) ??
    workflowId;
  const subjectWorkflowIds = boundedUniqueStringValues(
    [
      ...stringArrayValue(compiledRecord?.subjectWorkflowIds, 20),
      ...stringArrayValue(payload?.subjectWorkflowIds, 20),
    ],
    20,
  );
  const targetSubjectRefs = [
    ...arrayValue(compiledRecord?.targetSubjectRefs, 20),
    ...arrayValue(payload?.targetSubjectRefs, 20),
  ].slice(0, 20) as JsonValue[];
  const requestedCapabilities = boundedUniqueStringValues(
    [
      ...stringArrayValue(compiledRecord?.requestedCapabilities, 20),
      ...stringArrayValue(payload?.requestedCapabilities, 20),
    ],
    20,
  );
  const constraints = [
    ...arrayValue(compiledRecord?.constraints, 30),
    ...arrayValue(payload?.constraints, 30),
  ].slice(0, 30) as JsonValue[];
  const workflowDisplayName =
    stringValue(asRecord(compiledRecord?.runtimeJobCreateRequest)?.workflowDisplayName) ??
    stringValue(payload?.workflowDisplayName);
  const skillifierPayload = asRecord(payload?.skillifier);
  const skillifierResult = asRecord(asRecord(job.result)?.skillifier);
  const skillifierRecords = [skillifierResult, asRecord(job.result), skillifierPayload, payload];
  const skillifierExtension =
    [
      stringValue(payload?.workflowId),
      stringValue(asRecord(job.result)?.workflowId),
      job.jobType,
    ].some((value) => value?.includes("skillifier") ?? false) ||
    [stringValue(payload?.contractId), stringValue(asRecord(job.result)?.contractId)].includes(
      "skillifier.structured_json",
    ) ||
    firstBoundedString(skillifierRecords, [
      "candidateId",
      "candidateType",
      "targetSkillRef",
      "targetSkillPath",
      "opportunitySeedRef",
      "closeoutCapsuleRef",
    ])
      ? {
          runtimeJobId: firstBoundedString(skillifierRecords, ["runtimeJobId"]) ?? job.jobId,
          opportunitySeedRef: firstBoundedString(skillifierRecords, [
            "opportunitySeedRef",
            "sourceOpportunityRef",
          ]),
          closeoutCapsuleRef: firstBoundedString(skillifierRecords, ["closeoutCapsuleRef"]),
          closeoutCapsuleHash: firstBoundedString(skillifierRecords, ["closeoutCapsuleHash"]),
          candidateId: firstBoundedString(skillifierRecords, ["candidateId"]),
          candidateType: firstBoundedString(skillifierRecords, ["candidateType"]),
          outcomeState: firstBoundedString(skillifierRecords, ["outcomeState", "status"]),
          targetSkillRef: firstBoundedString(skillifierRecords, ["targetSkillRef"]),
          targetSkillPath: firstBoundedString(skillifierRecords, ["targetSkillPath"]),
          candidateApplied: firstBoolean(skillifierRecords, ["candidateApplied"]) ?? false,
          modelRefs: boundedUniqueStringValues(
            skillifierRecords.flatMap((record) => stringArrayValue(record?.modelRefs, 10)),
            10,
          ),
          modelTaskRefs: boundedUniqueStringValues(
            skillifierRecords.flatMap((record) => stringArrayValue(record?.modelTaskRefs, 10)),
            10,
          ),
          dbOperationRefs: boundedUniqueStringValues(
            skillifierRecords.flatMap((record) => stringArrayValue(record?.dbOperationRefs, 10)),
            10,
          ),
          validationRefs: boundedUniqueStringValues(
            skillifierRecords.flatMap((record) => stringArrayValue(record?.validationRefs, 10)),
            10,
          ),
          reviewRefs: boundedUniqueStringValues(
            skillifierRecords.flatMap((record) => stringArrayValue(record?.reviewRefs, 10)),
            10,
          ),
          artifactRefs: boundedUniqueStringValues(
            skillifierRecords.flatMap((record) => stringArrayValue(record?.artifactRefs, 10)),
            10,
          ),
          limitations: boundedUniqueStringValues(
            skillifierRecords.flatMap((record) => stringArrayValue(record?.limitations, 10)),
            10,
          ),
          eli5Progress: firstBoundedString(skillifierRecords, ["eli5Progress"]),
          nextAction: firstBoundedString(skillifierRecords, ["nextAction"]),
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutationAllowed: false,
        }
      : null;
  const profileAccepted = workflowEvidenceProfileRecord?.accepted === true;
  const profileReasonCodes = stringArrayValue(workflowEvidenceProfileRecord?.reasonCodes, 20);
  const profileMissingEvidenceClasses = stringArrayValue(
    workflowEvidenceProfileRecord?.missingEvidenceClasses,
    20,
  );
  const blockerReasonCodes = Array.isArray(validationRecord?.reasonCodes)
    ? validationRecord.reasonCodes.filter((item): item is string => typeof item === "string")
    : workflowId
      ? []
      : ["workflow_evidence_missing"];
  const workflowProfileBlockers =
    workflowEvidenceProfile && !profileAccepted
      ? [
          "workflow_evidence_profile_not_accepted",
          ...profileMissingEvidenceClasses.map(
            (evidenceClass) => `workflow_evidence_missing:${evidenceClass}`,
          ),
          ...profileReasonCodes,
        ].slice(0, 20)
      : [];
  const workflowDefinitionBlockers =
    workflowDefinitionRecord?.productionEnabled === false ||
    workflowDefinitionRecord?.compatibilityOnly === true ||
    stringValue(workflowDefinitionRecord?.workflowDefinitionStatus) === "blocked"
      ? [
          "workflow_definition_not_production_ready",
          ...stringArrayValue(workflowDefinitionRecord?.reasonCodes, 10),
        ]
      : [];
  const workflowEngineBlockers =
    workflowEngineReadiness && workflowEngineRecord?.ready !== true
      ? [
          "runtime_workflow_graph_engine_not_ready",
          ...stringArrayValue(workflowEngineRecord?.reasonCodes, 10),
        ]
      : [];
  const genericOrchestrationRuntimeBlockers =
    genericOrchestrationRuntime && genericOrchestrationRuntimeRecord?.status !== "succeeded"
      ? [
          "generic_orchestration_runtime_not_succeeded",
          ...stringArrayValue(genericOrchestrationRuntimeRecord?.reasonCodes, 12),
        ]
      : [];
  const workflowPluginBlockers =
    workflowPlugin &&
    (workflowPluginRecord?.productionEnabled !== true ||
      stringValue(workflowPluginRecord?.status) !== "production_ready")
      ? [
          "workflow_plugin_not_production_ready",
          ...stringArrayValue(workflowPluginRecord?.reasonCodes, 10),
        ]
      : [];
  const completionReviewBlockers =
    completionReviewGate && completionReviewGateRecord?.accepted !== true
      ? [
          "workflow_completion_review_not_accepted",
          ...stringArrayValue(completionReviewGateRecord?.reasonCodes, 10),
        ]
      : [];
  const genericRunnerRetirementBlockers = genericRunnerRetirement
    ? [
        "generic_workflow_runner_retired",
        ...stringArrayValue(genericRunnerRetirementRecord?.reasonCodes, 12),
      ]
    : [];
  return {
    route: frontDoorRouting.route ?? stringValue(routeDecision?.route),
    workflowId,
    executorWorkflowId,
    subjectWorkflowIds,
    targetSubjectRefs,
    requestedCapabilities,
    constraints,
    workflowDisplayName,
    jobType: job.jobType,
    executorId: executorWorkflowId ? `workflow-executor:${executorWorkflowId}` : null,
    authorityProfile:
      stringValue(compiledRecord?.authorityProfile) ?? stringValue(payload?.authorityProfile),
    approvalState:
      stringValue(validationRecord?.approvalKind) ??
      (validationRecord?.requiresApproval === true ? "approval_required" : "not_required"),
    workflowStatus:
      stringValue(validationRecord?.outcome) ??
      (job.state === "succeeded" ? "completed" : job.state),
    validationState: stringValue(validationRecord?.outcome) ?? "unknown",
    reviewState: artifacts.some(
      (artifact) =>
        artifact.artifactType.includes("review_evidence") ||
        artifact.artifactType.includes("result_review"),
    )
      ? "reviewed"
      : workflowId
        ? "required"
        : "unknown",
    closeoutState: artifacts.some(
      (artifact) =>
        artifact.artifactType.includes("work_episode") ||
        artifact.artifactType.includes("human_closeout") ||
        artifact.artifactType.includes("closeout_summary"),
    )
      ? "present"
      : workflowId
        ? "required"
        : "unknown",
    blockerReasonCodes: boundedUniqueStringValues(
      [
        ...blockerReasonCodes,
        ...workflowProfileBlockers,
        ...workflowDefinitionBlockers,
        ...workflowPluginBlockers,
        ...workflowEngineBlockers,
        ...genericOrchestrationRuntimeBlockers,
        ...completionReviewBlockers,
        ...genericRunnerRetirementBlockers,
      ],
      30,
    ),
    controlAvailability: workflowId
      ? ["pause", "redirect", "cancel", "retry", "mark_needs_review", "view_closeout"]
      : [],
    artifactRefs: artifacts
      .filter((artifact) => artifact.artifactType.startsWith("execution."))
      .map((artifact) => artifact.uri)
      .slice(0, 20),
    routing: frontDoorRouting,
    extension: workflowId
      ? {
          extensionKind: workflowId,
          executorWorkflowId,
          subjectWorkflowIds,
          targetSubjectRefs,
          requestedCapabilities,
          constraints,
          childWorkflowRequests: Array.isArray(payload?.childWorkflowRequests)
            ? payload.childWorkflowRequests.slice(0, 10)
            : [],
          workerContractState: workerContractState
            ? {
                contractState: stringValue(workerContractRecord?.contractState),
                workerAdapterId: stringValue(workerContractRecord?.workerAdapterId),
                accepted: workerContractRecord?.accepted === true,
                reasonCodes: stringArrayValue(workerContractRecord?.reasonCodes, 20),
                artifactRef: workerContractState.uri,
              }
            : null,
          productionAuthorityCockpit: productionAuthorityCockpitArtifacts(artifacts),
          workflowEvidenceProfile: workflowEvidenceProfile
            ? {
                profileId: stringValue(workflowEvidenceProfileRecord?.profileId),
                status: stringValue(workflowEvidenceProfileRecord?.status),
                accepted: profileAccepted,
                requiredEvidenceClasses: stringArrayValue(
                  workflowEvidenceProfileRecord?.requiredEvidenceClasses,
                  20,
                ),
                acceptedEvidenceClasses: stringArrayValue(
                  workflowEvidenceProfileRecord?.acceptedEvidenceClasses,
                  20,
                ),
                missingEvidenceClasses: profileMissingEvidenceClasses,
                reasonCodes: profileReasonCodes,
                artifactRef: workflowEvidenceProfile.uri,
                deepCompletionReviewRequired:
                  workflowEvidenceProfileRecord?.deepCompletionReviewRequired === true,
                ownerReadbackRequired:
                  workflowEvidenceProfileRecord?.ownerReadbackRequired === true,
              }
            : null,
          genericWorkflowRunnerRetirement: genericRunnerRetirement
            ? {
                status: stringValue(genericRunnerRetirementRecord?.status),
                workflowId: stringValue(genericRunnerRetirementRecord?.workflowId),
                definitionId: stringValue(genericRunnerRetirementRecord?.definitionId),
                definitionStatus: stringValue(genericRunnerRetirementRecord?.definitionStatus),
                productionEnabled: genericRunnerRetirementRecord?.productionEnabled === true,
                schedulerBacked: genericRunnerRetirementRecord?.schedulerBacked === true,
                pluginRegistered: genericRunnerRetirementRecord?.pluginRegistered === true,
                genericProductionSuccessAllowed:
                  genericRunnerRetirementRecord?.genericProductionSuccessAllowed === true,
                canonicalWorkflowEngineRequired:
                  genericRunnerRetirementRecord?.canonicalWorkflowEngineRequired === true,
                workflowQueuedRunnerRole: stringValue(
                  genericRunnerRetirementRecord?.workflowQueuedRunnerRole,
                ),
                ownerSummary: stringValue(genericRunnerRetirementRecord?.ownerSummary),
                reasonCodes: stringArrayValue(genericRunnerRetirementRecord?.reasonCodes, 20),
                artifactRef: genericRunnerRetirement.uri,
              }
            : null,
          workflowDefinition: workflowDefinition
            ? {
                definitionId: stringValue(workflowDefinitionRecord?.definitionId),
                workflowId: stringValue(workflowDefinitionRecord?.workflowId),
                status: stringValue(workflowDefinitionRecord?.workflowDefinitionStatus),
                productionEnabled: workflowDefinitionRecord?.productionEnabled === true,
                schedulerBacked: workflowDefinitionRecord?.schedulerBacked === true,
                compatibilityOnly: workflowDefinitionRecord?.compatibilityOnly === true,
                evidenceProfileId: stringValue(workflowDefinitionRecord?.evidenceProfileId),
                orchestrationPolicyRef: stringValue(
                  workflowDefinitionRecord?.orchestrationPolicyRef,
                ),
                requiredPhases: stringArrayValue(workflowDefinitionRecord?.requiredPhases, 30),
                requiredRoleClasses: stringArrayValue(
                  workflowDefinitionRecord?.requiredRoleClasses,
                  30,
                ),
                contextNeedCount:
                  typeof workflowDefinitionRecord?.contextNeedCount === "number"
                    ? workflowDefinitionRecord.contextNeedCount
                    : null,
                completionReviewRequired:
                  workflowDefinitionRecord?.completionReviewRequired === true,
                engineMode: stringValue(workflowDefinitionRecord?.engineMode),
                artifactRef: workflowDefinition.uri,
                reasonCodes: stringArrayValue(workflowDefinitionRecord?.reasonCodes, 20),
              }
            : null,
          workflowPlugin: workflowPlugin
            ? {
                pluginId: stringValue(workflowPluginRecord?.pluginId),
                workflowId: stringValue(workflowPluginRecord?.workflowId),
                definitionId: stringValue(workflowPluginRecord?.definitionId),
                status: stringValue(workflowPluginRecord?.status),
                productionEnabled: workflowPluginRecord?.productionEnabled === true,
                executorKeys: stringArrayValue(workflowPluginRecord?.executorKeys, 40),
                runtimeToolFamilies: stringArrayValue(
                  workflowPluginRecord?.runtimeToolFamilies,
                  20,
                ),
                evidenceProfileId: stringValue(workflowPluginRecord?.evidenceProfileId),
                orchestrationPolicyRef: stringValue(workflowPluginRecord?.orchestrationPolicyRef),
                requiredPhases: stringArrayValue(workflowPluginRecord?.requiredPhases, 30),
                requiredRoleClasses: stringArrayValue(
                  workflowPluginRecord?.requiredRoleClasses,
                  30,
                ),
                contextNeedCount:
                  typeof workflowPluginRecord?.contextNeedCount === "number"
                    ? workflowPluginRecord.contextNeedCount
                    : null,
                roleCoverageProfileId: stringValue(workflowPluginRecord?.roleCoverageProfileId),
                completionReviewRequired: workflowPluginRecord?.completionReviewRequired === true,
                stagedSchedulerProtocolRequired:
                  workflowPluginRecord?.stagedSchedulerProtocolRequired === true,
                stagedGraphAcceptanceRequired:
                  workflowPluginRecord?.stagedGraphAcceptanceRequired === true,
                runtimeDerivedNodeEnvelopeRequired:
                  workflowPluginRecord?.runtimeDerivedNodeEnvelopeRequired === true,
                runtimeDerivedExpectedEvidenceRequired:
                  workflowPluginRecord?.runtimeDerivedExpectedEvidenceRequired === true,
                modelAuthoredStructureReviewRequired:
                  workflowPluginRecord?.modelAuthoredStructureReviewRequired === true,
                firstNodeApprovalRequired: workflowPluginRecord?.firstNodeApprovalRequired === true,
                directImplementationFirstMovePolicy: stringValue(
                  workflowPluginRecord?.directImplementationFirstMovePolicy,
                ),
                degradedCloseoutSuccessAllowed:
                  workflowPluginRecord?.degradedCloseoutSuccessAllowed === true,
                reasonCodes: stringArrayValue(workflowPluginRecord?.reasonCodes, 20),
                artifactRef: workflowPlugin.uri,
              }
            : null,
          architectureRedTeamGate: architectureRedTeamGate
            ? {
                gateRunId: stringValue(architectureRedTeamGateRecord?.gateRunId),
                gateLevel:
                  typeof architectureRedTeamGateRecord?.gateLevel === "number"
                    ? architectureRedTeamGateRecord.gateLevel
                    : null,
                targetSystemRef: stringValue(architectureRedTeamGateRecord?.targetSystemRef),
                targetProofRef: stringValue(architectureRedTeamGateRecord?.targetProofRef),
                assumptionCount: Array.isArray(architectureRedTeamGateRecord?.assumptions)
                  ? architectureRedTeamGateRecord.assumptions.length
                  : null,
                questionCount: Array.isArray(architectureRedTeamGateRecord?.falsifiableQuestions)
                  ? architectureRedTeamGateRecord.falsifiableQuestions.length
                  : null,
                p0BlockerCount: Array.isArray(architectureRedTeamGateRecord?.preProofBlockers)
                  ? architectureRedTeamGateRecord.preProofBlockers.length
                  : null,
                proofReadinessDecision: stringValue(architectureProofDecision?.decision),
                finalReviewSummary: stringValue(architectureFinalReview?.reviewSummary),
                artifactRef: architectureRedTeamGate.uri,
                reasonCodes: stringArrayValue(architectureRedTeamGateRecord?.reasonCodes, 20),
              }
            : null,
          runtimeWorkflowEngine: workflowEngineReadiness
            ? {
                engineId: stringValue(workflowEngineRecord?.engineId),
                ready: workflowEngineRecord?.ready === true,
                definitionId: stringValue(workflowEngineRecord?.definitionId),
                pluginId: stringValue(workflowEngineRecord?.pluginId),
                pluginReady: workflowEngineRecord?.pluginReady === true,
                missingExecutorKeys: stringArrayValue(
                  workflowEngineRecord?.missingExecutorKeys,
                  20,
                ),
                missingPluginExecutorKeys: stringArrayValue(
                  workflowEngineRecord?.missingPluginExecutorKeys,
                  20,
                ),
                missingRuntimeToolFamilies: stringArrayValue(
                  workflowEngineRecord?.missingRuntimeToolFamilies,
                  20,
                ),
                reasonCodes: stringArrayValue(workflowEngineRecord?.reasonCodes, 20),
                artifactRef: workflowEngineReadiness.uri,
              }
            : null,
          genericOrchestrationRuntime: genericOrchestrationRuntime
            ? {
                engineId: stringValue(genericOrchestrationRuntimeRecord?.engineId),
                status: stringValue(genericOrchestrationRuntimeRecord?.status),
                schedulerStatus: stringValue(genericOrchestrationRuntimeRecord?.schedulerStatus),
                graphId: stringValue(genericOrchestrationRuntimeRecord?.graphId),
                executedNodeIds: stringArrayValue(
                  genericOrchestrationRuntimeRecord?.executedNodeIds,
                  30,
                ),
                addedNodeIds: stringArrayValue(genericOrchestrationRuntimeRecord?.addedNodeIds, 30),
                decisionRefs: stringArrayValue(genericOrchestrationRuntimeRecord?.decisionRefs, 30),
                reasonCodes: stringArrayValue(genericOrchestrationRuntimeRecord?.reasonCodes, 30),
                artifactRef: genericOrchestrationRuntime.uri,
              }
            : null,
          completionReview: completionReview
            ? {
                reviewId: stringValue(completionReviewRecord?.reviewId),
                outcome: stringValue(completionReviewRecord?.outcome),
                confidence: stringValue(completionReviewRecord?.confidence),
                humanReadableAssessment: stringValue(
                  completionReviewRecord?.humanReadableAssessment,
                ),
                recommendedImmediateNextAction: stringValue(
                  completionReviewRecord?.recommendedImmediateNextAction,
                ),
                missingHardening: stringArrayValue(completionReviewRecord?.missingHardening, 20),
                compatibilityFallbackConcerns: stringArrayValue(
                  completionReviewRecord?.compatibilityFallbackConcerns,
                  20,
                ),
                proofShapedConcerns: stringArrayValue(
                  completionReviewRecord?.proofShapedConcerns,
                  20,
                ),
                evidenceRefs: stringArrayValue(completionReviewRecord?.evidenceRefs, 20),
                artifactRef: completionReview.uri,
              }
            : null,
          completionReviewGate: completionReviewGate
            ? {
                accepted: completionReviewGateRecord?.accepted === true,
                outcome: stringValue(completionReviewGateRecord?.outcome),
                reasonCodes: stringArrayValue(completionReviewGateRecord?.reasonCodes, 20),
                missingEvidenceRefs: stringArrayValue(
                  completionReviewGateRecord?.missingEvidenceRefs,
                  20,
                ),
                completionReviewRef: stringValue(completionReviewGateRecord?.completionReviewRef),
                artifactRef: completionReviewGate.uri,
              }
            : null,
          skillifier: skillifierExtension,
        }
      : {},
    lifecycleState: job.state,
    workQueueLifecycleMutationAllowed: false,
  };
}

function workerRuntimeProjection(
  job: RuntimeJob,
  artifacts: RuntimeJobArtifact[],
  events: RuntimeJobEvent[],
): WorkQueueExecutionRuntimeJobReadModel["worker"] {
  const adapterResult = latestArtifact(artifacts, "runtime_worker.adapter_result");
  const adapterRecord = asRecord(adapterResult?.metadata);
  const workerContractState = latestArtifact(artifacts, "execution.worker_contract_state");
  const workerContractRecord = asRecord(workerContractState?.metadata);
  const heartbeat = events.findLast(
    (event) => event.eventType === "runtime_worker.supervisor_heartbeat",
  );
  const artifactRefs = [adapterResult, workerContractState]
    .filter((artifact): artifact is RuntimeJobArtifact => Boolean(artifact))
    .map((artifact) => artifact.uri)
    .slice(0, 10);
  const workerAdapterId =
    stringValue(adapterRecord?.adapterId) ?? stringValue(workerContractRecord?.workerAdapterId);
  const state =
    workerAdapterId || workerContractState
      ? "present"
      : job.state === "succeeded"
        ? "needs_review"
        : "unknown";
  const reasonCodes = [
    ...stringArrayValue(adapterRecord?.reasonCodes, 20),
    ...stringArrayValue(workerContractRecord?.reasonCodes, 20),
    ...(state === "needs_review" ? ["worker_runtime_evidence_missing_for_completed_job"] : []),
    ...(state === "unknown" ? ["worker_runtime_evidence_unknown"] : []),
  ].slice(0, 30);
  return {
    artifactKind: "work_queue_worker_runtime_projection",
    state,
    workerAdapterId,
    workerAdapterStatus: stringValue(adapterRecord?.status),
    workerContractState: stringValue(workerContractRecord?.contractState),
    workerContractAccepted:
      typeof workerContractRecord?.accepted === "boolean" ? workerContractRecord.accepted : null,
    workerId: job.workerId,
    leaseId: job.leaseId,
    claimState:
      job.workerId || job.leaseId
        ? "claimed"
        : job.state === "succeeded" ||
            job.state === "failed" ||
            job.state === "canceled" ||
            job.state === "timed_out"
          ? "terminal_unclaimed"
          : "unclaimed",
    supervisorState: heartbeat ? "heartbeat_recorded" : "not_observed",
    evidenceMode:
      stringValue(adapterRecord?.proofMode) === "static_injected" ||
      stringValue(workerContractRecord?.proofMode) === "static_injected"
        ? "static_injected"
        : artifactRefs.length > 0
          ? "runtime_artifacts"
          : "unknown",
    artifactRefs,
    reasonCodes,
    workQueueLifecycleMutationAllowed: false,
  };
}

function runtimeControlProjection(
  artifacts: RuntimeJobArtifact[],
): WorkQueueExecutionRuntimeJobReadModel["runtimeControl"] {
  const controlArtifacts = artifacts.filter(
    (artifact) =>
      artifact.artifactType === "runtime_worker.control_request" ||
      artifact.artifactType === "work_queue.execution_action" ||
      artifact.artifactType === "codex_bridge.control_command_history",
  );
  const latest = controlArtifacts.at(-1);
  const record = asRecord(latest?.metadata);
  const accepted = record?.accepted === true || record?.status === "accepted";
  const rejected = record?.accepted === false || record?.status === "rejected";
  return {
    artifactKind: "work_queue_runtime_control_projection",
    state: accepted ? "present" : rejected ? "rejected" : latest ? "present" : "unknown",
    latestControlId: stringValue(record?.controlId) ?? stringValue(record?.actionId),
    latestControlKind:
      stringValue(record?.controlKind) ??
      stringValue(record?.actionKind) ??
      stringValue(record?.commandKind),
    latestControlStatus: stringValue(record?.status),
    targetValidated:
      typeof record?.targetValidated === "boolean"
        ? record.targetValidated
        : typeof record?.runtimeBacked === "boolean"
          ? record.runtimeBacked
          : null,
    appliedLiveControl: false,
    artifactRefs: controlArtifacts.map((artifact) => artifact.uri).slice(0, 10),
    reasonCodes: [
      ...stringArrayValue(record?.reasonCodes, 20),
      ...(latest ? [] : ["runtime_control_evidence_missing"]),
    ],
    workQueueLifecycleMutationAllowed: false,
  };
}

function permissionReadbackProjection(
  job: RuntimeJob,
  teamEvidence: AgentTeamRuntimeEvidence | null,
): WorkflowPermissionReadback | null {
  if (teamEvidence?.permissionEvidence) {
    return teamEvidence.permissionEvidence;
  }
  const payload = asRecord(job.payload);
  const workflowId = stringValue(payload?.workflowId);
  if (!workflowId) {
    return null;
  }
  return createWorkflowPermissionReadback({
    workflowId,
    authorityProfile: stringValue(payload?.authorityProfile) ?? "unknown_or_unproven",
  });
}

function planningModeFromDecisionRef(
  decisionRef: string | null,
): WorkQueueProductSpecPlanningMode | null {
  const normalized = decisionRef?.trim().toLowerCase() ?? "";
  if (!normalized) {
    return null;
  }
  if (normalized.startsWith("owner-decision://product-spec-planning/default-plan-only")) {
    return "plan_only";
  }
  if (
    normalized.startsWith(
      "owner-decision://product-spec-planning/default-child-action-graph-proposal",
    ) ||
    normalized.startsWith(
      "owner-decision://product-spec-planning/default-child-action-graph-proposals",
    )
  ) {
    return "child_action_graph_proposal";
  }
  if (normalized.startsWith("owner-decision://product-spec-planning/default-compile-ready")) {
    return "compile_ready";
  }
  return null;
}

function planningDecisionStateFromRecord(
  record: Record<string, unknown> | null,
): "pending" | "accepted" | "rejected" | "not_required" | "unknown" | null {
  const normalized = (
    stringValue(record?.decisionState) ??
    stringValue(record?.planningDecisionState) ??
    stringValue(record?.outcome) ??
    stringValue(record?.status) ??
    stringValue(record?.state)
  )
    ?.trim()
    .toLowerCase();
  if (!normalized) {
    return null;
  }
  if (["accepted", "approved", "selected", "resolved", "present"].includes(normalized)) {
    return "accepted";
  }
  if (["rejected", "declined", "denied", "canceled", "cancelled"].includes(normalized)) {
    return "rejected";
  }
  if (["pending", "waiting", "open", "requested", "waiting_for_human"].includes(normalized)) {
    return "pending";
  }
  if (["not_required", "not-required", "skipped", "none"].includes(normalized)) {
    return "not_required";
  }
  return "unknown";
}

function productSpecPlanningDecisionState(input: {
  humanDecisionRefs: string[];
  humanDecisionRequestRefs: string[];
  humanDecisionRecords: Record<string, unknown>[];
  humanDecisionRequestRecords: Record<string, unknown>[];
}): "pending" | "accepted" | "rejected" | "not_required" | "unknown" {
  const explicitStates = new Set(
    [...input.humanDecisionRecords, ...input.humanDecisionRequestRecords].flatMap((record) => {
      const state = planningDecisionStateFromRecord(record);
      return state ? [state] : [];
    }),
  );
  if (explicitStates.has("rejected")) {
    return "rejected";
  }
  if (explicitStates.has("accepted") || input.humanDecisionRefs.length > 0) {
    return "accepted";
  }
  if (explicitStates.has("pending") || input.humanDecisionRequestRefs.length > 0) {
    return "pending";
  }
  if (explicitStates.has("not_required")) {
    return "not_required";
  }
  if (explicitStates.has("unknown")) {
    return "unknown";
  }
  return "not_required";
}

function productSpecPlanningDecisionOptions(records: Record<string, unknown>[]): Array<{
  optionId: string;
  optionSummary: string;
  tradeoffSummary: string | null;
  afterSelectionSummary: string | null;
  decisionRef: string | null;
}> {
  return records
    .flatMap((record) => {
      const explicitOptions = arrayValue(record.decisionOptions ?? record.options, 8)
        .map(asRecord)
        .filter((option): option is Record<string, unknown> => Boolean(option))
        .map((option, index) => {
          const decisionRef = stringValue(option.decisionRef) ?? stringValue(option.ref);
          const optionSummary =
            stringValue(option.optionSummary) ??
            stringValue(option.summary) ??
            stringValue(option.label) ??
            stringValue(option.title) ??
            decisionRef ??
            `Option ${index + 1}`;
          return {
            optionId:
              stringValue(option.optionId) ?? stringValue(option.id) ?? `option-${index + 1}`,
            optionSummary: optionSummary.slice(0, 260),
            tradeoffSummary:
              (stringValue(option.tradeoffSummary) ?? stringValue(option.tradeoff))?.slice(
                0,
                500,
              ) ?? null,
            afterSelectionSummary:
              (
                stringValue(option.afterSelectionSummary) ??
                stringValue(option.whatHappensAfterSelection)
              )?.slice(0, 500) ?? null,
            decisionRef,
          };
        });
      if (explicitOptions.length > 0) {
        return explicitOptions;
      }
      const optionsAndTradeoffs = stringArrayValue(record.optionsAndTradeoffs, 8);
      const afterSelection = stringArrayValue(record.whatHappensAfterEachOption, 8);
      return optionsAndTradeoffs.map((optionAndTradeoff, index) => ({
        optionId: `option-${index + 1}`,
        optionSummary: optionAndTradeoff.slice(0, 260),
        tradeoffSummary: optionAndTradeoff.slice(0, 500),
        afterSelectionSummary: afterSelection[index]?.slice(0, 500) ?? null,
        decisionRef: null,
      }));
    })
    .slice(0, 8);
}

function ownerRuntimeReadback(
  capsuleArtifact: RuntimeJobArtifact | undefined,
  artifacts: RuntimeJobArtifact[] = [],
): WorkQueueExecutionRuntimeJobReadModel["ownerReadback"] {
  const capsule = asRecord(capsuleArtifact?.metadata);
  const humanReport = asRecord(capsule?.humanReport);
  const structuredSummary = asRecord(capsule?.structuredSummary);
  const factualRefs = asRecord(capsule?.factualRefs);
  const missionArtifact = latestArtifact(artifacts, MISSION_CONTRACT_LEDGER_ARTIFACT_TYPE);
  const capsuleMissionContract = asRecord(capsule?.missionContractLedger);
  const missionContract = capsuleMissionContract ?? asRecord(missionArtifact?.metadata);
  const missionBlockingCommitments = Array.isArray(missionContract?.blockingCommitments)
    ? missionContract.blockingCommitments
        .map((value) => asRecord(value))
        .filter(Boolean)
        .slice(0, 30)
    : [];
  const missionOpenBlockingCommitments = missionBlockingCommitments.filter((commitment) => {
    const status = stringValue(commitment?.status);
    return status !== "satisfied" && status !== "impossible";
  });
  const missionRawStorageEvidenceRefs = boundedUniqueStringValues(
    missionBlockingCommitments
      .flatMap((commitment) => stringArrayValue(commitment?.acceptedEvidenceRefs, 40))
      .filter(isRawStorageEvidenceRef),
    8,
  );
  const missionContractReadback = {
    state: missionContract
      ? missionOpenBlockingCommitments.length > 0
        ? ("needs_review" as const)
        : ("present" as const)
      : ("missing" as const),
    ledgerStatus: stringValue(missionContract?.ledgerStatus),
    openBlockingCommitmentCount: missionOpenBlockingCommitments.length,
    blockingCommitments: missionBlockingCommitments.map((commitment) => {
      const acceptedEvidenceRefs = stringArrayValue(commitment?.acceptedEvidenceRefs, 40);
      const evidenceMap = commitmentEvidenceMap(acceptedEvidenceRefs);
      return {
        commitmentId: stringValue(commitment?.commitmentId) ?? "unknown",
        status: stringValue(commitment?.status) ?? "unknown",
        commitmentText: stringValue(commitment?.commitmentText)?.slice(0, 600) ?? "",
        whyItMatters: stringValue(commitment?.whyItMatters)?.slice(0, 500) ?? "",
        expectedEvidenceDescription:
          stringValue(commitment?.expectedEvidenceDescription)?.slice(0, 700) ?? "",
        acceptedEvidenceRefs: acceptedEvidenceRefs.slice(0, 8),
        evidenceClaimRefs: acceptedEvidenceRefs.slice(0, 8),
        evidenceMap,
        changedFileRefs: evidenceMap.sourceChangeRefs,
        validationRefs: evidenceMap.validationRefs,
        remainingWork: stringArrayValue(commitment?.remainingWork, 8),
      };
    }),
    artifactRefs: missionArtifact ? [missionArtifact.uri] : [],
    boundedEvidenceState: missionContract
      ? missionRawStorageEvidenceRefs.length > 0
        ? ("needs_review" as const)
        : ("bounded" as const)
      : ("missing" as const),
    rawStorageEvidenceRefs: missionRawStorageEvidenceRefs,
    reasonCodes: boundedUniqueStringValues(
      [
        ...(missionContract
          ? missionOpenBlockingCommitments.length > 0
            ? [
                "mission_contract_blocking_commitments_open",
                ...missionOpenBlockingCommitments
                  .map((commitment) => stringValue(commitment?.commitmentId))
                  .filter((value): value is string => Boolean(value))
                  .map((id) => `mission_commitment_open:${id}`),
              ]
            : ["mission_contract_satisfied"]
          : ["mission_contract_missing"]),
        ...(missionRawStorageEvidenceRefs.length > 0
          ? ["mission_contract_raw_storage_evidence_ref_present"]
          : []),
      ],
      12,
    ),
  };
  const planningContractArtifact = latestArtifact(
    artifacts,
    PRODUCT_SPEC_PLANNING_WORKER_CONTRACT_ARTIFACT_TYPE,
  );
  const capsulePlanningContractRecord = asRecord(capsule?.productSpecPlanningContract);
  const artifactPlanningContractRecord = asRecord(planningContractArtifact?.metadata);
  const planningContract = capsulePlanningContractRecord ?? artifactPlanningContractRecord;
  const productSpecArtifactRecord = (
    artifact: RuntimeJobArtifact,
  ): Record<string, unknown> | null => asRecord(artifact.metadata);
  const productSpecArtifactKind = (artifact: RuntimeJobArtifact): string | null =>
    stringValue(productSpecArtifactRecord(artifact)?.artifactKind) ??
    (artifact.artifactType.startsWith("agent_team.product_spec_planning")
      ? artifact.artifactType.replace(/^agent_team\./u, "")
      : null);
  const productSpecArtifactsByKind = (artifactKind: string): RuntimeJobArtifact[] =>
    artifacts.filter((artifact) => productSpecArtifactKind(artifact) === artifactKind);
  const productSpecRecordsByKind = (artifactKind: string): Record<string, unknown>[] =>
    productSpecArtifactsByKind(artifactKind)
      .map(productSpecArtifactRecord)
      .filter((record): record is Record<string, unknown> => Boolean(record));
  const stringArraysFromRecords = (
    records: Record<string, unknown>[],
    key: string,
    limit = 20,
  ): string[] => records.flatMap((record) => stringArrayValue(record[key], limit));
  const planningCapsuleArtifacts = productSpecArtifactsByKind("product_spec_planning_capsule");
  const researchBriefArtifacts = productSpecArtifactsByKind("product_spec_planning_research_brief");
  const actionGraphProposalArtifacts = productSpecArtifactsByKind(
    "product_spec_planning_action_graph_proposal",
  );
  const humanDecisionRequestArtifacts = productSpecArtifactsByKind(
    "product_spec_planning_human_decision_request",
  );
  const planningCapsuleRecords = productSpecRecordsByKind("product_spec_planning_capsule");
  const researchBriefRecords = productSpecRecordsByKind("product_spec_planning_research_brief");
  const actionGraphProposalRecords = productSpecRecordsByKind(
    "product_spec_planning_action_graph_proposal",
  );
  const humanDecisionRequestRecords = productSpecRecordsByKind(
    "product_spec_planning_human_decision_request",
  );
  const planningModeCandidate = stringValue(planningContract?.planningMode);
  const planningOutputKindCandidate = stringValue(planningContract?.planningOutputKind);
  const planningMode = WORK_QUEUE_PRODUCT_SPEC_PLANNING_MODES.includes(
    planningModeCandidate as WorkQueueProductSpecPlanningMode,
  )
    ? (planningModeCandidate as WorkQueueProductSpecPlanningMode)
    : null;
  const planningOutputKind = WORK_QUEUE_PRODUCT_SPEC_PLANNING_OUTPUT_KINDS.includes(
    planningOutputKindCandidate as WorkQueueProductSpecPlanningOutputKind,
  )
    ? (planningOutputKindCandidate as WorkQueueProductSpecPlanningOutputKind)
    : null;
  const planningWorkflowRefs = boundedUniqueStringValues(
    stringArrayValue(planningContract?.workflowRefs, 12),
    12,
  );
  const childActionProposalRefs = boundedUniqueStringValues(
    stringArrayValue(planningContract?.childActionProposalRefs, 20),
    20,
  );
  const validationRefs = boundedUniqueStringValues(
    stringArrayValue(planningContract?.validationRefs, 20),
    20,
  );
  const runtimeValidationRefs = boundedUniqueStringValues(
    artifacts
      .filter(
        (artifact) =>
          artifact.artifactType === "agent_team.dynamic_validation" ||
          artifact.artifactType === "agent_team.dynamic_validation_repair_loop",
      )
      .map((artifact) => artifact.uri),
    20,
  );
  const validationRepairEvidence = summarizeProductSpecPlanningValidationRepairEvidence({
    validationRefs: runtimeValidationRefs,
    artifacts: artifacts
      .filter(
        (artifact) =>
          artifact.artifactType === "agent_team.dynamic_validation" ||
          artifact.artifactType === "agent_team.dynamic_validation_repair_loop",
      )
      .map((artifact) => ({
        artifactType: artifact.artifactType,
        uri: artifact.uri,
        metadata: asRecord(artifact.metadata),
      })),
  });
  const humanDecisionArtifacts = artifacts.filter(
    (artifact) => artifact.artifactType === "agent_team.human_scope_decision",
  );
  const humanDecisionRecords = humanDecisionArtifacts
    .map((artifact) => asRecord(artifact.metadata))
    .filter((record): record is Record<string, unknown> => Boolean(record));
  const humanDecisionRefs = boundedUniqueStringValues(
    [
      ...stringArrayValue(planningContract?.humanDecisionRefs, 12),
      ...humanDecisionArtifacts.flatMap((artifact) => {
        const decisionRef = stringValue(asRecord(artifact.metadata)?.boundedDecisionRef);
        return decisionRef ? [decisionRef, artifact.uri] : [artifact.uri];
      }),
    ],
    12,
  );
  const humanDecisionBoundedResponseRefs = boundedUniqueStringValues(
    stringArraysFromRecords(humanDecisionRequestRecords, "boundedResponseRefs", 12),
    12,
  );
  const humanDecisionResumeRefs = boundedUniqueStringValues(
    stringArraysFromRecords(humanDecisionRequestRecords, "resumeRefs", 12),
    12,
  );
  const humanDecisionBlockingGraphRefs = boundedUniqueStringValues(
    [
      ...stringArraysFromRecords(humanDecisionRequestRecords, "blockingGraphRefs", 20),
      ...stringArraysFromRecords(humanDecisionRequestRecords, "blockingGraphNodeRefs", 20),
    ],
    20,
  );
  const humanDecisionRequestRefs = boundedUniqueStringValues(
    [
      ...humanDecisionRequestArtifacts.map((artifact) => artifact.uri),
      ...stringArraysFromRecords(humanDecisionRequestRecords, "decisionRefs", 12),
      ...humanDecisionBoundedResponseRefs,
      ...humanDecisionResumeRefs,
    ],
    12,
  );
  const humanDecisionOptions = productSpecPlanningDecisionOptions(humanDecisionRequestRecords);
  const humanDecisionResponseShape = firstBoundedString(humanDecisionRequestRecords, [
    "requiredResponseShape",
    "allowedResponseShape",
    "responseShape",
  ]);
  const humanDecisionDeadlineExpiresAt = firstBoundedString(humanDecisionRequestRecords, [
    "deadlineExpiresAt",
    "expiresAt",
    "expirationRef",
  ]);
  const planningDecisionState = productSpecPlanningDecisionState({
    humanDecisionRefs,
    humanDecisionRequestRefs,
    humanDecisionRecords,
    humanDecisionRequestRecords,
  });
  const planningContractValidation = planningContract
    ? validateProductSpecPlanningWorkerContract({
        ...planningContract,
        rawPromptStored:
          planningContract.rawPromptStored === undefined ? false : planningContract.rawPromptStored,
        rawResponseStored:
          planningContract.rawResponseStored === undefined
            ? false
            : planningContract.rawResponseStored,
        rawLogsStored:
          planningContract.rawLogsStored === undefined ? false : planningContract.rawLogsStored,
        workQueueLifecycleMutationAllowed:
          planningContract.workQueueLifecycleMutationAllowed === undefined
            ? false
            : planningContract.workQueueLifecycleMutationAllowed,
      })
    : null;
  const acceptedPlanningContract = planningContractValidation?.accepted
    ? planningContractValidation.contract
    : null;
  const planningContractRejected = Boolean(planningContract) && !acceptedPlanningContract;
  const inferredPlanningModeFromDecision =
    [...humanDecisionRefs, ...humanDecisionRequestRefs]
      .map((ref) => planningModeFromDecisionRef(ref))
      .find((mode) => mode !== null) ?? null;
  const resolvedPlanningMode =
    acceptedPlanningContract?.planningMode ??
    planningMode ??
    normalizeProductSpecPlanningMode(stringValue(planningContract?.planningMode)) ??
    inferredPlanningModeFromDecision;
  const resolvedPlanningOutputKind =
    acceptedPlanningContract?.planningOutputKind ??
    planningOutputKind ??
    (resolvedPlanningMode === "plan_only"
      ? "plan_only_output"
      : resolvedPlanningMode === "child_action_graph_proposal"
        ? "child_action_graph_proposal_output"
        : resolvedPlanningMode === "compile_ready"
          ? "compile_ready_output"
          : null);
  const planningContractReasonCodes = boundedUniqueStringValues(
    planningContractRejected ? (planningContractValidation?.reasonCodes ?? []) : [],
    12,
  );
  const inferredModeReasonCodes =
    resolvedPlanningMode && !acceptedPlanningContract
      ? ["product_spec_planning_mode_inferred_without_accepted_contract"]
      : [];
  const resolvedPlanningWorkflowRefs = boundedUniqueStringValues(
    acceptedPlanningContract?.workflowRefs ?? planningWorkflowRefs,
    12,
  );
  const resolvedChildActionProposalRefs = boundedUniqueStringValues(
    acceptedPlanningContract?.childActionProposalRefs ?? childActionProposalRefs,
    20,
  );
  const planningCapsuleRefs = boundedUniqueStringValues(
    planningCapsuleArtifacts.map((artifact) => artifact.uri),
    20,
  );
  const researchBriefRefs = boundedUniqueStringValues(
    researchBriefArtifacts.map((artifact) => artifact.uri),
    20,
  );
  const researchInfluenceRefs = boundedUniqueStringValues(
    [
      ...stringArraysFromRecords(planningCapsuleRecords, "researchInfluenceRefs", 20),
      ...researchBriefArtifacts
        .filter(
          (artifact) => productSpecArtifactRecord(artifact)?.influencedPlanningCapsule === true,
        )
        .map((artifact) => artifact.uri),
    ],
    20,
  );
  const staleExternalAssumptionFlags = boundedUniqueStringValues(
    [
      ...stringArraysFromRecords(planningCapsuleRecords, "staleExternalAssumptionFlags", 12),
      ...stringArraysFromRecords(researchBriefRecords, "staleExternalAssumptionFlags", 12),
    ],
    12,
  );
  const actionGraphProposalRefs = boundedUniqueStringValues(
    [
      ...resolvedChildActionProposalRefs,
      ...actionGraphProposalArtifacts.map((artifact) => artifact.uri),
    ],
    20,
  );
  const childProposalSummaries = actionGraphProposalRecords
    .flatMap((record) =>
      Array.isArray(record.proposedChildActions) ? record.proposedChildActions : [],
    )
    .map((value) => asRecord(value))
    .filter((record): record is Record<string, unknown> => Boolean(record))
    .map((record) => ({
      actionId: stringValue(record.actionId) ?? "unknown",
      title: stringValue(record.title),
      assignedWorkflow: stringValue(record.assignedWorkflow),
      assignedRoleOrOwner: stringValue(record.assignedRoleOrOwner),
      dependencyCount: stringArrayValue(record.dependencies, 20).length,
      authorityBoundary: stringValue(record.authorityBoundary),
      compileReadinessState: stringValue(record.runtimeJobCompileReadiness),
      validationExpectations: stringArrayValue(record.validationExpectations, 12),
    }))
    .slice(0, 20);
  const compileReadinessCandidates = [
    ...actionGraphProposalRecords.map((record) => stringValue(record.compileReadinessState)),
    ...planningCapsuleRecords.map((record) => stringValue(record.compileReadinessState)),
    acceptedPlanningContract?.planningMode === "compile_ready" ? "compile_ready" : null,
    resolvedPlanningMode === "compile_ready" ? "compile_ready" : null,
  ];
  const compileReadinessState =
    compileReadinessCandidates.find(
      (
        candidate,
      ): candidate is "not_requested" | "needs_validation" | "blocked" | "compile_ready" =>
        candidate === "not_requested" ||
        candidate === "needs_validation" ||
        candidate === "blocked" ||
        candidate === "compile_ready",
    ) ?? null;
  const actionGraphProposalReviewRecords = actionGraphProposalRecords.filter(
    (record) =>
      stringValue(record.compileReadinessState) === "blocked" ||
      record.accepted === false ||
      record.valid === false ||
      stringArrayValue(record.reasonCodes, 20).length > 0 ||
      stringArrayValue(record.blockedReasonCodes, 20).length > 0 ||
      stringArrayValue(record.blockedReasons, 20).length > 0,
  );
  const reportedCompileBlockedReasonCodes = boundedUniqueStringValues(
    [
      ...stringArraysFromRecords(actionGraphProposalRecords, "blockedReasonCodes", 20),
      ...stringArraysFromRecords(actionGraphProposalRecords, "blockedReasons", 20),
      ...stringArraysFromRecords(actionGraphProposalRecords, "reasonCodes", 20),
      ...actionGraphProposalRecords.flatMap((record) =>
        arrayValue(record.proposedChildActions, 40).flatMap((value) => {
          const childAction = asRecord(value);
          return childAction
            ? [
                ...stringArrayValue(childAction.blockedReasonCodes, 12),
                ...stringArrayValue(childAction.blockedReasons, 12),
              ]
            : [];
        }),
      ),
    ],
    20,
  );
  const validatedCompileBlockedReasonCodes = boundedUniqueStringValues(
    actionGraphProposalReviewRecords.flatMap((record) => {
      const validation = validateProductSpecPlanningActionGraphProposal({
        ...record,
        rawPromptStored: record.rawPromptStored ?? false,
        rawResponseStored: record.rawResponseStored ?? false,
        rawLogsStored: record.rawLogsStored ?? false,
        workQueueLifecycleMutationAllowed: record.workQueueLifecycleMutationAllowed ?? false,
      });
      return validation.accepted ? [] : validation.reasonCodes;
    }),
    20,
  );
  const resolvedValidationRefs = boundedUniqueStringValues(
    [...(acceptedPlanningContract?.validationRefs ?? validationRefs), ...runtimeValidationRefs],
    20,
  );
  const planningCapsuleLifecycleState = productSpecPlanningCapsuleLifecycleState({
    refs: planningCapsuleRefs,
    records: planningCapsuleRecords,
  });
  const productSpecEvidenceRefs = boundedUniqueStringValues(
    [
      ...resolvedPlanningWorkflowRefs,
      ...planningCapsuleRefs,
      ...researchBriefRefs,
      ...researchInfluenceRefs,
      ...actionGraphProposalRefs,
      ...humanDecisionRefs,
      ...humanDecisionRequestRefs,
      ...resolvedValidationRefs,
    ],
    80,
  );
  const productSpecRawStorageEvidenceRefs = boundedUniqueStringValues(
    productSpecEvidenceRefs.filter(isRawStorageEvidenceRef),
    8,
  );
  const planningRawStorageEvidenceRefs = boundedUniqueStringValues(
    [...missionContractReadback.rawStorageEvidenceRefs, ...productSpecRawStorageEvidenceRefs],
    8,
  );
  const planningEvidenceBoundedState =
    planningRawStorageEvidenceRefs.length > 0
      ? ("needs_review" as const)
      : missionContractReadback.boundedEvidenceState === "needs_review"
        ? ("needs_review" as const)
        : productSpecEvidenceRefs.length > 0 ||
            missionContractReadback.boundedEvidenceState === "bounded"
          ? ("bounded" as const)
          : ("missing" as const);
  const childActionsExecuted = actionGraphProposalRecords.some(
    (record) => record.childActionsExecuted === true,
  );
  const runtimeJobsCreated = actionGraphProposalRecords.some(
    (record) => record.runtimeJobsCreated === true,
  );
  const compileBlockedReasonCodes = boundedUniqueStringValues(
    [
      ...(compileReadinessState === "blocked"
        ? ["product_spec_planning_compile_readiness_blocked"]
        : []),
      ...reportedCompileBlockedReasonCodes,
      ...validatedCompileBlockedReasonCodes,
      ...(childActionsExecuted ? ["product_spec_planning_proposed_child_actions_executed"] : []),
      ...(runtimeJobsCreated ? ["product_spec_planning_child_runtime_jobs_created"] : []),
      ...(planningRawStorageEvidenceRefs.length > 0
        ? ["product_spec_planning_raw_storage_evidence_ref_present"]
        : []),
    ],
    20,
  );
  const changedFileEvidenceRefs = boundedUniqueStringValues(
    missionContractReadback.blockingCommitments.flatMap((commitment) => commitment.changedFileRefs),
    20,
  );
  const missionAcceptedEvidenceRefs = boundedUniqueStringValues(
    missionBlockingCommitments.flatMap((commitment) =>
      stringArrayValue(commitment?.acceptedEvidenceRefs, 40),
    ),
    80,
  );
  const workflowRegistrationEvidenceRefs = boundedUniqueStringValues(
    [
      ...resolvedPlanningWorkflowRefs.filter(isProductSpecWorkflowRegistrationEvidenceRef),
      ...missionAcceptedEvidenceRefs.filter(isProductSpecWorkflowRegistrationEvidenceRef),
    ],
    20,
  );
  const executableNodeMappingEvidenceRefs = boundedUniqueStringValues(
    missionAcceptedEvidenceRefs.filter(isProductSpecExecutableNodeMappingEvidenceRef),
    20,
  );
  const orchestratorFirstEvidenceRefs = boundedUniqueStringValues(
    missionAcceptedEvidenceRefs.filter(isProductSpecOrchestratorFirstEvidenceRef),
    20,
  );
  const actionGraphCompileReadinessRefs = boundedUniqueStringValues(
    [...actionGraphProposalRefs, ...resolvedValidationRefs],
    20,
  );
  const actionGraphProposalCompileValidationRefs = boundedUniqueStringValues(
    [
      ...actionGraphCompileReadinessRefs,
      ...missionAcceptedEvidenceRefs.filter(isProductSpecActionGraphCompileEvidenceRef),
    ],
    20,
  );
  const commitmentEvidenceClaimRefs = boundedUniqueStringValues(missionAcceptedEvidenceRefs, 40);
  const planningEvidenceSummary = {
    artifactKind: "product_spec_planning_owner_evidence_summary" as const,
    changedFileRefs: changedFileEvidenceRefs,
    runtimeWorkflowMappingRefs: resolvedPlanningWorkflowRefs,
    workflowRegistrationEvidenceRefs,
    executableNodeMappingEvidenceRefs,
    orchestratorFirstEvidenceRefs,
    planningCapsuleLifecycleState,
    planningCapsuleLifecycleRefs: planningCapsuleRefs,
    actionGraphCompileReadinessState: compileReadinessState,
    actionGraphCompileReadinessRefs,
    actionGraphProposalCompileValidationRefs,
    compileBlockedReasonCodes,
    commitmentEvidenceClaimRefs,
    childActionsExecuted,
    runtimeJobsCreated,
    boundedEvidenceState: planningEvidenceBoundedState,
    rawStorageEvidenceRefs: planningRawStorageEvidenceRefs,
    reasonCodes: boundedUniqueStringValues(
      [
        planningEvidenceBoundedState === "needs_review"
          ? "product_spec_planning_bounded_evidence_needs_review"
          : planningEvidenceBoundedState === "bounded"
            ? "product_spec_planning_bounded_evidence_refs_only"
            : "product_spec_planning_bounded_evidence_missing",
        changedFileEvidenceRefs.length > 0
          ? "product_spec_planning_source_change_evidence_present"
          : "product_spec_planning_source_change_evidence_missing",
        resolvedPlanningWorkflowRefs.length > 0
          ? "product_spec_planning_runtime_workflow_mapping_present"
          : "product_spec_planning_runtime_workflow_mapping_missing",
        workflowRegistrationEvidenceRefs.length > 0
          ? "product_spec_planning_workflow_registration_evidence_present"
          : "product_spec_planning_workflow_registration_evidence_missing",
        executableNodeMappingEvidenceRefs.length > 0
          ? "product_spec_planning_executable_node_mapping_evidence_present"
          : "product_spec_planning_executable_node_mapping_evidence_missing",
        orchestratorFirstEvidenceRefs.length > 0
          ? "product_spec_planning_orchestrator_first_evidence_present"
          : "product_spec_planning_orchestrator_first_evidence_missing",
        `product_spec_planning_capsule_lifecycle:${planningCapsuleLifecycleState}`,
        compileReadinessState
          ? `product_spec_planning_compile_readiness:${compileReadinessState}`
          : "product_spec_planning_compile_readiness_missing",
        ...compileBlockedReasonCodes,
        actionGraphProposalCompileValidationRefs.length > 0
          ? "product_spec_planning_action_graph_compile_validation_evidence_present"
          : "product_spec_planning_action_graph_compile_validation_evidence_missing",
        commitmentEvidenceClaimRefs.length > 0
          ? "product_spec_planning_commitment_evidence_claim_refs_present"
          : "product_spec_planning_commitment_evidence_claim_refs_missing",
        childActionsExecuted
          ? "product_spec_planning_proposed_child_actions_executed"
          : "product_spec_planning_proposed_child_actions_not_executed",
        runtimeJobsCreated
          ? "product_spec_planning_child_runtime_jobs_created"
          : "product_spec_planning_child_runtime_jobs_not_created",
      ],
      12,
    ),
  };
  const planningEli5Progress =
    (acceptedPlanningContract?.eli5Progress ?? stringValue(planningContract?.eli5Progress))?.slice(
      0,
      1_000,
    ) ?? null;
  const limitations = boundedUniqueStringValues(
    [
      ...stringArrayValue(humanReport?.limitations, 10),
      ...(acceptedPlanningContract?.limitations ??
        stringArrayValue(planningContract?.limitations, 10)),
    ],
    10,
  );
  const hasModelReport = humanReport?.source === "model" && Boolean(humanReport?.reportMarkdown);
  const validationRepairMissingAfterFailure =
    validationRepairEvidence.hasFailureAttemptRef && !validationRepairEvidence.hasRepairAttemptRef;
  const planningBoundaryNeedsReview =
    compileBlockedReasonCodes.length > 0 || planningEvidenceBoundedState === "needs_review";
  const state =
    hasModelReport &&
    !planningContractRejected &&
    !validationRepairMissingAfterFailure &&
    !planningBoundaryNeedsReview
      ? "ready"
      : capsuleArtifact || planningContractArtifact
        ? "needs_review"
        : "missing";
  const modelHumanReportSummary = stringValue(humanReport?.reportMarkdown)?.slice(0, 1_000) ?? null;
  const inferredHumanReportSummary = modelHumanReportSummary
    ? null
    : [
        resolvedPlanningMode ? `Planning mode: ${resolvedPlanningMode}.` : null,
        stringValue(structuredSummary?.taskSuccess)
          ? `Task success: ${stringValue(structuredSummary?.taskSuccess)}.`
          : null,
        validationRepairEvidence.hasFailureAttemptRef
          ? validationRepairEvidence.hasRepairAttemptRef
            ? "Validation failure and repair evidence recorded in this runtime job."
            : "Validation failure evidence exists, but accepted repair evidence is still missing."
          : null,
        humanDecisionRefs.length > 0
          ? `${humanDecisionRefs.length} bounded human decision ref(s) recorded.`
          : null,
      ]
        .filter((value): value is string => Boolean(value))
        .join(" ")
        .slice(0, 1_000) || null;
  return {
    artifactKind: "work_queue_owner_runtime_readback",
    state,
    humanReportSummary: modelHumanReportSummary ?? inferredHumanReportSummary,
    eli5Progress: stringValue(humanReport?.eli5Progress)?.slice(0, 1_000) ?? planningEli5Progress,
    planningMode: resolvedPlanningMode,
    planningOutputKind: resolvedPlanningOutputKind,
    planningWorkflowRefs: resolvedPlanningWorkflowRefs,
    planningCapsuleRefs,
    researchBriefRefs,
    researchInfluenceRefs,
    staleExternalAssumptionFlags,
    childActionProposalRefs: resolvedChildActionProposalRefs,
    actionGraphProposalRefs,
    compileReadinessState,
    compileBlockedReasonCodes,
    humanDecisionRefs,
    humanDecisionRequestRefs,
    humanDecisionState:
      humanDecisionRefs.length > 0
        ? "present"
        : humanDecisionRequestRefs.length > 0
          ? "pending"
          : "not_required",
    planningDecisionState,
    humanDecisionOptions,
    humanDecisionResponseShape,
    humanDecisionDeadlineExpiresAt,
    humanDecisionBlockingGraphRefs,
    humanDecisionResumeRefs,
    humanDecisionBoundedResponseRefs,
    validationRefs: resolvedValidationRefs,
    childProposalSummaries,
    planningEvidenceSummary,
    taskSuccess: stringValue(structuredSummary?.taskSuccess),
    qualityAssessment: stringValue(structuredSummary?.qualityAssessment),
    workflowFitAssessment: stringValue(structuredSummary?.workflowFitAssessment),
    agentModelFitAssessment: stringValue(structuredSummary?.agentModelFitAssessment),
    limitations,
    missionContract: missionContractReadback,
    opportunitySeedCount: Array.isArray(capsule?.opportunitySeeds)
      ? capsule.opportunitySeeds.length
      : 0,
    capsuleId: stringValue(capsule?.capsuleId),
    capsuleHash: stringValue(factualRefs?.capsuleHash) ?? stringValue(capsule?.capsuleHash),
    reasonCodes:
      state === "ready"
        ? boundedUniqueStringValues(
            [
              "model_authored_closeout_capsule_readback_ready",
              ...validationRepairEvidence.reasonCodes,
            ],
            20,
          )
        : state === "needs_review"
          ? boundedUniqueStringValues(
              [
                "closeout_capsule_model_report_missing_or_degraded",
                ...planningContractReasonCodes,
                ...inferredModeReasonCodes,
                ...validationRepairEvidence.reasonCodes,
                ...compileBlockedReasonCodes,
              ],
              20,
            )
          : ["closeout_capsule_missing"],
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutationAllowed: false,
  };
}

function ownerProgressReadback(input: {
  job: RuntimeJob;
  artifacts: RuntimeJobArtifact[];
  events: RuntimeJobEvent[];
  ownerReadback: WorkQueueExecutionRuntimeJobReadModel["ownerReadback"];
  agentTeam: WorkQueueExecutionRuntimeJobReadModel["agentTeam"];
  changedFileRefs: string[];
  validationStatus: string | null;
  closeoutStatus: string | null;
  workflowId: string | null;
}): WorkQueueExecutionRuntimeJobReadModel["ownerProgressReadback"] {
  const latestRole = input.agentTeam.roleReports.at(-1);
  const activeModelRef =
    input.agentTeam.roleReports.find((role) => role.roleId === input.agentTeam.activeRole)
      ?.modelId ??
    latestRole?.modelId ??
    null;
  const validationArtifacts = input.artifacts.filter(
    (artifact) =>
      artifact.artifactType.includes("validation") || artifact.uri.includes("/validation/"),
  );
  const validationEvidenceState =
    input.validationStatus === "passed"
      ? "passed"
      : input.validationStatus === "failed"
        ? "failed"
        : validationArtifacts.some((artifact) => {
              const record = asRecord(artifact.metadata);
              return record?.skipped === true || record?.status === "skipped";
            })
          ? "skipped"
          : validationArtifacts.length > 0
            ? "unverified"
            : "missing";
  const closeoutEvidenceState =
    input.agentTeam.closeoutQuality.state === "accepted" || input.ownerReadback.state === "ready"
      ? "accepted"
      : input.closeoutStatus === "present" || input.ownerReadback.state === "needs_review"
        ? "needs_review"
        : "missing";
  const implementationRequired = input.agentTeam.taskGraph.requiredSourceEdit;
  const changedFileState =
    input.changedFileRefs.length > 0
      ? "present"
      : implementationRequired
        ? "missing"
        : implementationRequired === null
          ? "unknown"
          : "not_required";
  const humanDecisionState = input.agentTeam.taskGraph.humanDecisionPresent
    ? "present"
    : input.agentTeam.currentTeamState === "waiting_for_human"
      ? "pending"
      : "not_required";
  const needsReviewReasons = [
    ...(validationEvidenceState === "missing" && ["succeeded", "failed"].includes(input.job.state)
      ? ["runtime_validation_evidence_missing"]
      : []),
    ...(changedFileState === "missing" ? ["implementation_changed_file_evidence_missing"] : []),
    ...(closeoutEvidenceState !== "accepted" && ["succeeded", "failed"].includes(input.job.state)
      ? ["accepted_closeout_evidence_missing"]
      : []),
    ...input.agentTeam.blockers,
  ].slice(0, 20);
  const state =
    needsReviewReasons.length === 0 && input.job.state !== "pending"
      ? "ready"
      : input.job.state === "pending" && input.artifacts.length === 0
        ? "missing"
        : "needs_review";
  const currentStage =
    input.agentTeam.taskGraph.currentStage ??
    input.agentTeam.activeRole ??
    (input.job.state === "pending" ? "queued" : input.job.state);
  const headline =
    state === "ready"
      ? `${input.workflowId ?? input.job.jobType} is ${input.job.state} with accepted runtime evidence.`
      : `${input.workflowId ?? input.job.jobType} is ${input.job.state}; review ${needsReviewReasons.length || 1} evidence gap(s).`;
  const eli5Progress =
    input.ownerReadback.eli5Progress ??
    input.agentTeam.humanCloseoutSummary?.eli5Progress ??
    input.agentTeam.teamStreamSummary.latestSummary ??
    `OpenClaw is at ${currentStage} for this runtime job.`;
  const terminalAdapterOutcome = terminalAdapterOutcomeReadback(input.job);
  const nextAction =
    state === "ready"
      ? "Review the completed evidence and Closeout Capsule."
      : terminalAdapterOutcome.status === "needs_review"
        ? "Review the adapter needs_review diagnostics and bounded runtime evidence before retrying."
        : needsReviewReasons.includes("runtime_validation_evidence_missing")
          ? "Run or attach verified validation evidence before claiming success."
          : needsReviewReasons.includes("implementation_changed_file_evidence_missing")
            ? "Attach changed-file evidence or mark the implementation task needs_review."
            : "Review the diagnostic reason codes and bounded runtime evidence.";
  const appServerProgress = appServerProgressReadback(input.events);
  const activeGraphProgress = activeGraphProgressReadback(input.events);
  return {
    artifactKind: "work_queue_owner_progress_readback",
    state,
    headline,
    currentStage,
    activeWorker: input.agentTeam.activeRole ?? input.agentTeam.taskGraph.activeWorker,
    activeModelRef,
    runtimeLifecycleState: input.job.state,
    validationEvidenceState,
    closeoutEvidenceState,
    changedFileState,
    humanDecisionState,
    eli5Progress: eli5Progress.slice(0, 1_000),
    limitations: [
      ...new Set([...input.ownerReadback.limitations, ...input.agentTeam.blockers]),
    ].slice(0, 10),
    nextAction,
    diagnosticReasonCodes: needsReviewReasons,
    appServerProgress,
    activeGraphProgress,
    terminalAdapterOutcome,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutationAllowed: false,
  };
}

function terminalAdapterOutcomeReadback(
  job: RuntimeJob,
): WorkQueueExecutionRuntimeJobReadModel["ownerProgressReadback"]["terminalAdapterOutcome"] {
  const result = asRecord(job.result);
  const error = asRecord(job.error);
  const status =
    stringValue(result?.status) ??
    (job.state === "succeeded"
      ? "completed"
      : job.state === "failed"
        ? stringValue(error?.code) === "worker_adapter_needs_review"
          ? "needs_review"
          : "failed"
        : null);
  return {
    status,
    errorCode: stringValue(error?.code),
    retryScheduled: typeof error?.retryScheduled === "boolean" ? error.retryScheduled : null,
    reasonCodes: boundedUniqueStringValues(
      [...stringArrayValue(result?.reasonCodes, 30), ...stringArrayValue(error?.reasonCodes, 30)],
      30,
    ),
    summary: stringValue(error?.summary)?.slice(0, 700) ?? null,
    artifactRefs: stringArrayValue(result?.artifactRefs, 30),
    evidenceRefs: stringArrayValue(result?.completedWorkEvidenceRefs, 30),
  };
}

function eventDataRecord(event: RuntimeJobEvent | undefined): Record<string, unknown> {
  return asRecord(event?.data) ?? {};
}

function nestedProgressEvent(event: RuntimeJobEvent | undefined): Record<string, unknown> {
  return asRecord(eventDataRecord(event).event) ?? {};
}

function appServerProgressReadback(
  events: RuntimeJobEvent[],
): WorkQueueExecutionRuntimeJobReadModel["ownerProgressReadback"]["appServerProgress"] {
  const progressEvents = events.filter(
    (event) =>
      event.eventType === "codex_parity.app_server_progress" ||
      event.eventType === "codex_parity.implementation_model_call_heartbeat" ||
      event.eventType === "codex_parity.implementation_model_call_started" ||
      event.eventType === "codex_parity.implementation_model_call_completed" ||
      event.eventType === "codex_parity.implementation_model_call_abort_requested",
  );
  const latest = progressEvents.at(-1);
  const latestData = eventDataRecord(latest);
  const latestNested = nestedProgressEvent(latest);
  const collect = (key: string, maxItems: number): string[] =>
    [
      ...new Set(
        progressEvents.flatMap((event) => {
          const data = eventDataRecord(event);
          const nested = nestedProgressEvent(event);
          const direct = stringValue(data[key]);
          const nestedSingle = stringValue(nested[key]);
          return [
            ...(direct ? [direct] : []),
            ...(nestedSingle ? [nestedSingle] : []),
            ...stringArrayValue(data[key], maxItems),
            ...stringArrayValue(nested[key], maxItems),
          ];
        }),
      ),
    ].slice(0, maxItems);
  const abortOrInterrupt = progressEvents.findLast(
    (event) =>
      event.eventType === "codex_parity.implementation_model_call_abort_requested" ||
      Boolean(stringValue(eventDataRecord(event).phase)?.includes("abort")) ||
      Boolean(stringValue(nestedProgressEvent(event).phase)?.includes("interrupt")),
  );
  return {
    state: progressEvents.length > 0 ? "present" : "missing",
    eventCount: progressEvents.length,
    activePhase:
      stringValue(latestNested.phase) ??
      stringValue(latestData.phase) ??
      (latest ? latest.eventType : null),
    lastMethod: stringValue(latestNested.method) ?? stringValue(latestData.method),
    lastItemType: stringValue(latestNested.itemType) ?? stringValue(latestData.itemType),
    lastItemStatus: stringValue(latestNested.status) ?? stringValue(latestData.status),
    threadRefs: collect("threadId", 6).map((ref) => `codex-thread://${ref}`),
    turnRefs: collect("turnId", 6).map((ref) => `codex-turn://${ref}`),
    fileRefs: collect("fileRefs", 20),
    commandRefs: collect("commandRefs", 20),
    abortOrInterruptState: abortOrInterrupt ? "requested" : null,
    latestEventAt: latest?.eventTime.toISOString() ?? null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function activeGraphProgressReadback(
  events: RuntimeJobEvent[],
): WorkQueueExecutionRuntimeJobReadModel["ownerProgressReadback"]["activeGraphProgress"] {
  const progressEvents = events.filter(
    (event) => event.eventType === "agent_team.scheduler_progress",
  );
  const terminal = progressEvents.findLast((event) => {
    const eventData = eventDataRecord(event);
    return Boolean(
      stringValue(eventData.finalizationState) ??
      (stringValue(eventData.currentPhase) === "scheduler_terminal" ? "scheduler_terminal" : null),
    );
  });
  const latest = terminal ?? progressEvents.at(-1);
  const data = eventDataRecord(latest);
  const latestNodeProgress = progressEvents.findLast((event) => {
    const record = eventDataRecord(event);
    return Boolean(
      stringValue(record.nodeId) &&
      (stringValue(record.currentObjective) ||
        stringValue(record.whyThisNodeWasChosen) ||
        stringValue(record.activeNodeKind) ||
        stringValue(record.modelRef) ||
        stringArrayValue(record.targetRefs, 1).length > 0),
    );
  });
  const nodeData = eventDataRecord(latestNodeProgress);
  const collect = (key: string, maxItems: number): string[] =>
    [
      ...new Set(
        progressEvents.flatMap((event) => {
          const value = eventDataRecord(event)[key];
          return [
            ...(typeof value === "string" && value ? [value] : []),
            ...stringArrayValue(value, maxItems),
          ];
        }),
      ),
    ].slice(0, maxItems);
  const latestStringArray = (key: string, maxItems: number): string[] =>
    stringArrayValue(data[key], maxItems);
  const collectedString = (key: string): string | null => {
    for (let index = progressEvents.length - 1; index >= 0; index -= 1) {
      const value = stringValue(eventDataRecord(progressEvents[index]!)[key]);
      if (value) {
        return value;
      }
    }
    return null;
  };
  const collectedNumber = (key: string): number | null => {
    for (let index = progressEvents.length - 1; index >= 0; index -= 1) {
      const value = numberValue(eventDataRecord(progressEvents[index]!)[key]);
      if (value !== null) {
        return value;
      }
    }
    return null;
  };
  const collectedBoolean = (key: string): boolean | null => {
    for (let index = progressEvents.length - 1; index >= 0; index -= 1) {
      const value = booleanValue(eventDataRecord(progressEvents[index]!)[key]);
      if (value !== null) {
        return value;
      }
    }
    return null;
  };
  const latestEvidenceClaims = Array.isArray(data.evidenceClaims)
    ? data.evidenceClaims
        .map((claim) => asRecord(claim))
        .filter((claim): claim is Record<string, unknown> => Boolean(claim))
        .map((claim) => ({
          evidenceClaimId: stringValue(claim.evidenceClaimId) ?? "",
          commitmentId: stringValue(claim.commitmentId) ?? "",
          evidenceKind: stringValue(claim.evidenceKind) ?? "unknown",
          evidenceRef: stringValue(claim.evidenceRef) ?? "",
          claimSummary: stringValue(claim.claimSummary) ?? "",
          producedByNodeId: stringValue(claim.producedByNodeId) ?? "",
          producedByCapabilityId: stringValue(claim.producedByCapabilityId),
          producedByExecutorKey: stringValue(claim.producedByExecutorKey),
          validationRefs: stringArrayValue(claim.validationRefs, 8),
          changedFileRefs: stringArrayValue(claim.changedFileRefs, 8),
          limitations: stringArrayValue(claim.limitations, 8),
        }))
        .filter((claim) => claim.evidenceClaimId.length > 0 && claim.evidenceRef.length > 0)
        .slice(0, 20)
    : [];
  const reasonCodes = collect("reasonCodes", 60);
  const workerToolIds = [
    ...new Set(
      [
        ...collect("workerToolIds", 40),
        ...collect("toolIds", 40),
        ...reasonCodes
          .map((code) => code.match(/^scheduler_tool_invoked:(worker\.[a-z0-9_.:-]+)$/u)?.[1])
          .filter((toolId): toolId is string => Boolean(toolId)),
      ].filter((toolId) => toolId.startsWith("worker.")),
    ),
  ].slice(0, 20);
  const latestWorkerToolId =
    typeof data.schedulerToolId === "string" && data.schedulerToolId.startsWith("worker.")
      ? data.schedulerToolId
      : (workerToolIds.at(-1) ?? null);
  const latestCommitmentPacketData = eventDataRecord(
    progressEvents.findLast((event) => {
      const record = eventDataRecord(event);
      return (
        stringValue(record.schedulerToolId) === "scheduler.draft_commitment_work_breakdown" &&
        Array.isArray(record.commitmentWorkPackets)
      );
    }),
  );
  const commitmentWorkPackets = Array.isArray(latestCommitmentPacketData.commitmentWorkPackets)
    ? latestCommitmentPacketData.commitmentWorkPackets
        .map((packet) => asRecord(packet))
        .filter((packet): packet is Record<string, unknown> => Boolean(packet))
        .map((packet) => ({
          packetRef: stringValue(packet.packetRef) ?? "",
          commitmentId: stringValue(packet.commitmentId) ?? "unknown",
          authoringSource: stringValue(packet.authoringSource) ?? "unknown",
          qualityStatus: stringValue(packet.qualityStatus) ?? "unknown",
          workerObjective: stringValue(packet.workerObjective),
          contextScoutObjective: stringValue(packet.contextScoutObjective),
          implementationObjective: stringValue(packet.implementationObjective),
          acceptanceCriteriaCount: numberValue(packet.acceptanceCriteriaCount),
          acceptanceCriteria: stringArrayValue(packet.acceptanceCriteria, 6),
          expectedEvidenceKinds: stringArrayValue(packet.expectedEvidenceKinds, 8),
          likelyRepoAreas: stringArrayValue(packet.likelyRepoAreas, 8),
          requiredContextQuestions: stringArrayValue(packet.requiredContextQuestions, 6),
          downstreamConsumer: stringValue(packet.downstreamConsumer),
        }))
        .filter((packet) => packet.packetRef.length > 0)
        .slice(0, 30)
    : [];
  const latestValidationQaData = eventDataRecord(
    progressEvents.findLast((event) => {
      const record = eventDataRecord(event);
      return (
        stringArrayValue(record.validationQaToolInvocationRefs, 1).length > 0 ||
        stringArrayValue(record.validationQaEvidencePacketRefs, 1).length > 0 ||
        stringValue(record.currentValidationCommandRef) ||
        stringArrayValue(record.validationCommandSummaries, 1).length > 0
      );
    }),
  );
  const latestValidationQaState = stringValue(latestValidationQaData.validationState);
  const validationQaToolInvocationRefs = collect("validationQaToolInvocationRefs", 30);
  const validationQaEvidencePacketRefs = collect("validationQaEvidencePacketRefs", 20);
  const latestCloseoutFinalizationData = eventDataRecord(
    progressEvents.findLast((event) => {
      const record = eventDataRecord(event);
      return (
        stringValue(record.closeoutFinalizationState) ||
        stringArrayValue(record.closeoutFinalizationEvidencePacketRefs, 1).length > 0 ||
        stringArrayValue(record.closeoutFinalizationToolInvocationRefs, 1).length > 0
      );
    }),
  );
  const closeoutFinalizationEvidencePacketRefs = collect(
    "closeoutFinalizationEvidencePacketRefs",
    20,
  );
  const closeoutFinalizationToolInvocationRefs = collect(
    "closeoutFinalizationToolInvocationRefs",
    30,
  );
  const closeoutFinalizationState =
    stringValue(latestCloseoutFinalizationData.closeoutFinalizationState) ??
    stringValue(data.closeoutFinalizationState);
  const boundaryCheckpointProgressEvents = progressEvents.filter((event) => {
    const record = eventDataRecord(event);
    return (
      stringValue(record.stage) === "boundary_replay_checkpoint" ||
      (stringValue(record.currentPhase) ?? "").startsWith("boundary_replay_")
    );
  });
  const boundaryCheckpointEvents = events.filter(
    (event) => event.eventType === "execution.boundary_replay_checkpoint",
  );
  const boundaryPlanEvents = events.filter(
    (event) => event.eventType === "execution.boundary_replay_plan",
  );
  const latestBoundaryData = eventDataRecord(
    boundaryCheckpointEvents.at(-1) ?? boundaryCheckpointProgressEvents.at(-1),
  );
  const latestBoundaryProgressData = eventDataRecord(boundaryCheckpointProgressEvents.at(-1));
  const latestBoundaryPlanData = eventDataRecord(boundaryPlanEvents.at(-1));
  const boundaryReplayCheckpointRefs = [
    ...new Set(
      [
        ...boundaryCheckpointProgressEvents.flatMap((event) =>
          stringArrayValue(eventDataRecord(event).artifactRefs, 20),
        ),
        ...boundaryCheckpointEvents
          .map((event) => stringValue(eventDataRecord(event).checkpointRef))
          .filter((ref): ref is string => Boolean(ref)),
      ].filter((ref) => ref.includes("/boundary-replay/")),
    ),
  ].slice(0, 40);
  const boundaryReplayGraphCheckpointRefs = [
    ...new Set(
      [
        ...boundaryCheckpointProgressEvents.flatMap((event) =>
          stringArrayValue(eventDataRecord(event).artifactRefs, 20),
        ),
        ...boundaryCheckpointEvents
          .map((event) => stringValue(eventDataRecord(event).graphCheckpointRef))
          .filter((ref): ref is string => Boolean(ref)),
      ].filter((ref) => ref.startsWith("runtime-work-graph://checkpoint/")),
    ),
  ].slice(0, 40);
  const boundaryReplayPlanRefs = [
    ...new Set(
      boundaryPlanEvents
        .map((event) => stringValue(eventDataRecord(event).planRef))
        .filter((ref): ref is string => Boolean(ref)),
    ),
  ].slice(0, 20);
  const latestBoundaryCheckpointKind =
    stringValue(latestBoundaryData.checkpointKind) ??
    (stringValue(latestBoundaryProgressData.currentPhase)?.startsWith("boundary_replay_")
      ? (stringValue(latestBoundaryProgressData.currentPhase)?.replace(/^boundary_replay_/u, "") ??
        null)
      : null);
  const latestModelCallData = eventDataRecord(
    progressEvents.findLast((event) => {
      const record = eventDataRecord(event);
      return Boolean(stringValue(record.modelCallSpanId));
    }),
  );
  const latestWorkerInternalData = eventDataRecord(
    progressEvents.findLast((event) => {
      const record = eventDataRecord(event);
      const phase = stringValue(record.currentPhase) ?? "";
      return (
        stringValue(record.stage) === "non_codex_worker_loop" ||
        phase.startsWith("worker.") ||
        stringArrayValue(record.workerPhaseRefs, 1).length > 0 ||
        stringArrayValue(record.workerInternalInputPacketRefs, 1).length > 0 ||
        stringValue(record.workerInternalToolStatus)
      );
    }),
  );
  const spanProgress = runtimeExecutionSpanReadback({
    events,
    maxRecentSpans: 16,
  });
  const latestRepairClassification = asRecord(
    eventDataRecord(
      progressEvents.findLast((event) => {
        const classification = asRecord(eventDataRecord(event).repairClassification);
        return Boolean(classification);
      }),
    ).repairClassification,
  );
  const latestParallelFrontierData = asRecord(
    eventDataRecord(
      progressEvents.findLast((event) => {
        const frontier = asRecord(eventDataRecord(event).parallelFrontier);
        return Boolean(frontier);
      }),
    ).parallelFrontier,
  );
  const frontierStringArray = (key: string, maxItems: number): string[] =>
    latestParallelFrontierData ? stringArrayValue(latestParallelFrontierData[key], maxItems) : [];
  const schedulerToolId = stringValue(data.schedulerToolId);
  const codeIntelligenceToolIds = [
    ...new Set(
      [
        ...collect("codeIntelligenceToolIds", 40),
        ...collect("codeIntelligenceToolId", 40),
        ...collect("toolIds", 40),
        stringValue(data.codeIntelligenceToolId),
        schedulerToolId?.startsWith("code.") ? schedulerToolId : null,
        ...reasonCodes
          .map((code) => code.match(/^scheduler_tool_invoked:(code\.[a-z0-9_.:-]+)$/u)?.[1])
          .filter((toolId): toolId is string => Boolean(toolId)),
      ].filter(
        (toolId): toolId is string => typeof toolId === "string" && toolId.startsWith("code."),
      ),
    ),
  ].slice(0, 20);
  const codeIntelligenceResultRefs = collect("codeIntelligenceResultRefs", 40);
  const codeIntelligenceDiagnosticRefs = collect("codeIntelligenceDiagnosticRefs", 40);
  const codeIntelligenceState =
    codeIntelligenceResultRefs.length > 0 ||
    collect("codeIntelligenceSymbolRefs", 1).length > 0 ||
    codeIntelligenceDiagnosticRefs.length > 0
      ? collect("codeIntelligenceNeedsReviewRefs", 1).length > 0
        ? "needs_review"
        : "present"
      : "missing";
  const frontierConflictDomains = Array.isArray(latestParallelFrontierData?.conflictDomains)
    ? latestParallelFrontierData.conflictDomains
        .map((domain) => asRecord(domain))
        .filter((domain): domain is Record<string, unknown> => Boolean(domain))
        .map((domain) => ({
          nodeId: stringValue(domain.nodeId) ?? "",
          keys: stringArrayValue(domain.keys, 12),
        }))
        .filter((domain) => domain.nodeId.length > 0)
        .slice(0, 30)
    : [];
  const frontierProviderConcurrencyBudgets = Array.isArray(
    latestParallelFrontierData?.providerConcurrencyBudgets,
  )
    ? latestParallelFrontierData.providerConcurrencyBudgets
        .map((budget) => asRecord(budget))
        .filter((budget): budget is Record<string, unknown> => Boolean(budget))
        .map((budget) => ({
          key: stringValue(budget.key) ?? "",
          limit: numberValue(budget.limit),
          runnableNodeIds: stringArrayValue(budget.runnableNodeIds, 40),
          selectedNodeIds: stringArrayValue(budget.selectedNodeIds, 40),
          skippedNodeIds: stringArrayValue(budget.skippedNodeIds, 40),
        }))
        .filter((budget) => budget.key.length > 0)
        .slice(0, 20)
    : [];
  return {
    state: latest ? "present" : "missing",
    graphId: stringValue(data.graphId) ?? stringValue(nodeData.graphId),
    activeNodeId: stringValue(nodeData.nodeId) ?? stringValue(data.nodeId),
    activeNodeKind: stringValue(nodeData.activeNodeKind) ?? stringValue(data.activeNodeKind),
    roleId: stringValue(nodeData.roleId) ?? stringValue(data.roleId),
    modelRef: stringValue(nodeData.modelRef) ?? stringValue(data.modelRef),
    objective: stringValue(nodeData.currentObjective) ?? stringValue(data.currentObjective),
    whySelected:
      stringValue(nodeData.whyThisNodeWasChosen) ?? stringValue(data.whyThisNodeWasChosen),
    targetRefs: collect("targetRefs", 12),
    inputHandoffRefs: collect("inputHandoffRefs", 12),
    expectedOutput: stringValue(nodeData.expectedOutput) ?? stringValue(data.expectedOutput),
    currentPhase: stringValue(data.currentPhase) ?? stringValue(data.stage),
    validationState: stringValue(data.validationState),
    evidenceProducedRefs: collect("evidenceProducedRefs", 12),
    evidenceClaimRefs: collect("evidenceClaimRefs", 20),
    genericNodeExecutionResultRefs: collect("genericNodeExecutionResultRefs", 20),
    evidenceClaims: latestEvidenceClaims,
    acceptedCommitmentIds: latestStringArray("acceptedCommitmentIds", 12),
    rejectedCommitmentIds: latestStringArray("rejectedCommitmentIds", 12),
    openCommitmentIds: latestStringArray("remainingOpenCommitmentIds", 12),
    nextDecisionNeeded: stringValue(data.nextDecisionNeeded),
    blockerSummary: stringValue(data.blockerSummary),
    finalizationState: stringValue(data.finalizationState),
    latestToolEventKind: stringValue(data.latestToolEventKind),
    eli5Progress: stringValue(data.eli5Progress),
    budget: {
      policyRef: stringValue(data.budgetPolicyRef) ?? stringValue(nodeData.budgetPolicyRef),
      budgetClass: stringValue(data.budgetClass) ?? stringValue(nodeData.budgetClass),
      runtimeToolTimeoutMs:
        numberValue(data.runtimeToolTimeoutMs) ?? numberValue(nodeData.runtimeToolTimeoutMs),
      modelCallTimeoutMs:
        numberValue(data.modelCallTimeoutMs) ?? numberValue(nodeData.modelCallTimeoutMs),
      workerLoopTurnTimeoutMs:
        numberValue(data.workerLoopTurnTimeoutMs) ?? numberValue(nodeData.workerLoopTurnTimeoutMs),
      validationCommandTimeoutMs:
        numberValue(data.validationCommandTimeoutMs) ??
        numberValue(nodeData.validationCommandTimeoutMs),
      progressEmissionIntervalMs:
        numberValue(data.progressEmissionIntervalMs) ??
        numberValue(nodeData.progressEmissionIntervalMs),
      staleProgressAfterMs:
        numberValue(data.staleProgressAfterMs) ?? numberValue(nodeData.staleProgressAfterMs),
      leaseTimeoutMs: numberValue(data.leaseTimeoutMs) ?? numberValue(nodeData.leaseTimeoutMs),
      leaseHeartbeatMs:
        numberValue(data.leaseHeartbeatMs) ?? numberValue(nodeData.leaseHeartbeatMs),
      elapsedMs: numberValue(data.elapsedMs) ?? numberValue(nodeData.elapsedMs),
      budgetRemainingMs:
        numberValue(data.budgetRemainingMs) ?? numberValue(nodeData.budgetRemainingMs),
      heartbeatState: stringValue(data.heartbeatState) ?? stringValue(nodeData.heartbeatState),
    },
    sourcePrompt: {
      promptHash: stringValue(data.sourcePromptHash),
      promptLength: numberValue(data.sourcePromptLength),
      resolutionStatus: stringValue(data.sourcePromptResolutionStatus),
      sectionRefs: collect("sourcePromptSectionRefs", 20),
      excerptRequestRefs: collect("sourcePromptExcerptRequestRefs", 20),
      excerptProvidedRefs: collect("sourcePromptExcerptProvidedRefs", 20),
      excerptDeniedRefs: collect("sourcePromptExcerptDeniedRefs", 20),
    },
    contextFreshness: {
      state:
        stringValue(data.contextFreshnessStatus) === "fresh" ||
        stringValue(data.contextFreshnessStatus) === "stale" ||
        stringValue(data.contextFreshnessStatus) === "missing" ||
        stringValue(data.contextFreshnessStatus) === "rejected" ||
        stringValue(data.contextFreshnessStatus) === "unknown"
          ? (stringValue(data.contextFreshnessStatus) as
              | "fresh"
              | "stale"
              | "missing"
              | "rejected"
              | "unknown")
          : collect("missingContextSnapshotRefs", 1).length > 0
            ? "missing"
            : collect("staleContextSnapshotRefs", 1).length > 0
              ? "stale"
              : collect("rejectedContextSnapshotRefs", 1).length > 0
                ? "rejected"
                : collect("contextSnapshotRefs", 1).length > 0
                  ? "fresh"
                  : "unknown",
      refreshAction: stringValue(data.contextRefreshAction),
      contextSnapshotRefs: collect("contextSnapshotRefs", 40),
      staleContextSnapshotRefs: collect("staleContextSnapshotRefs", 40),
      missingContextSnapshotRefs: collect("missingContextSnapshotRefs", 40),
      rejectedContextSnapshotRefs: collect("rejectedContextSnapshotRefs", 40),
      sourcePromptHash: stringValue(data.sourcePromptHash),
      repoRevision: stringValue(data.repoRevision),
      worktreeFingerprint: stringValue(data.worktreeFingerprint),
      freshnessSummary: stringValue(data.contextFreshnessSummary),
      blockingContextReason:
        stringValue(data.currentPhase) === "context_freshness_blocked"
          ? stringValue(data.blockerSummary)
          : null,
    },
    contextScout: {
      qualityState: stringValue(data.contextQualityState),
      verifiedFileRefs: collect("verifiedContextFileRefs", 30),
      handoffPacketRefs: collect("contextHandoffPacketRefs", 20),
      toolLoopRefs: collect("contextScoutToolLoopRefs", 20),
      runtimeToolInvocationRefs: collect("contextScoutRuntimeToolInvocationRefs", 40),
      rejectedRefs: collect("contextScoutRejectedRefs", 20),
      sufficiencySummary: stringValue(data.contextScoutSufficiencySummary),
      synthesisReadiness: stringValue(data.contextScoutSynthesisReadiness),
      synthesisBlockers: collect("contextScoutSynthesisBlockers", 20),
      repoAnalysisFindingCount: numberValue(data.contextScoutRepoAnalysisFindingCount),
      symbolRefs: collect("contextScoutSymbolRefs", 40),
      testRefs: collect("contextScoutTestRefs", 32),
      handoffSummaryForSynthesis: stringValue(data.contextScoutHandoffSummaryForSynthesis),
      openBlockers: collect("openContextBlockers", 12),
    },
    contextSynthesis: {
      state:
        collect("contextSynthesisRef", 1).length > 0 ||
        collect("contextSynthesisImplementationGroupIds", 1).length > 0
          ? collectedString("contextSynthesisStatus") === "accepted"
            ? "accepted"
            : collectedString("contextSynthesisStatus") === "needs_review"
              ? "needs_review"
              : "present"
          : "missing",
      synthesisRef: collectedString("contextSynthesisRef"),
      status: collectedString("contextSynthesisStatus"),
      implementationGroupCount: collectedNumber("contextSynthesisImplementationGroupCount"),
      dependencyCount: collectedNumber("contextSynthesisDependencyCount"),
      parallelGroupCount: collectedNumber("contextSynthesisParallelGroupCount"),
      blockerCount: collectedNumber("contextSynthesisBlockerCount"),
      validationLaneCount: collectedNumber("contextSynthesisValidationLaneCount"),
      reviewLaneCount: collectedNumber("contextSynthesisReviewLaneCount"),
      workerFitSummary: collectedString("contextSynthesisWorkerFitSummary"),
      graphCompileInputSummary: collectedString("contextSynthesisGraphCompileInputSummary"),
      implementationGroupIds: collect("contextSynthesisImplementationGroupIds", 40),
      targetRefs: collect("contextSynthesisTargetRefs", 40),
      validationLanes: collect("contextSynthesisValidationLanes", 20),
      reviewLanes: collect("contextSynthesisReviewLanes", 20),
      semanticCodeIntelligenceRefs: collect("contextSynthesisSemanticCodeIntelligenceRefs", 40),
      contextSnapshotRefs: collect("contextSnapshotRefs", 40),
      nextDecision:
        collectedString("contextSynthesisStatus") === "accepted"
          ? "compile_post_synthesis_graph"
          : collectedString("contextSynthesisStatus") === "needs_review"
            ? "repair_context_synthesis"
            : stringValue(data.nextDecisionNeeded),
      eli5:
        collectedString("contextSynthesisStatus") === "accepted"
          ? "Context synthesis accepted the scout handoffs and produced worker-ready implementation groups for scheduler graph compile."
          : collectedString("contextSynthesisStatus") === "needs_review"
            ? "Context synthesis needs repair before implementation can start."
            : null,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
    codeIntelligence: {
      state: codeIntelligenceState,
      semanticMode: collectedString("codeIntelligenceSemanticMode"),
      backendId: collectedString("codeIntelligenceBackendId"),
      backendState: collectedString("codeIntelligenceBackendState"),
      backendHealthRef: collectedString("codeIntelligenceBackendHealthRef"),
      workspaceSnapshotRef: collectedString("codeIntelligenceWorkspaceSnapshotRef"),
      semanticConfidence: collectedString("codeIntelligenceSemanticConfidence"),
      fallbackUsed: collectedBoolean("codeIntelligenceFallbackUsed"),
      fallbackReasonCodes: collect("codeIntelligenceFallbackReasonCodes", 20),
      diagnosticVersionRef: collectedString("codeIntelligenceDiagnosticVersionRef"),
      projectConfigRefs: collect("codeIntelligenceProjectConfigRefs", 20),
      limitations: collect("codeIntelligenceLimitations", 20),
      backendLatencyMs: collectedNumber("codeIntelligenceBackendLatencyMs"),
      resultCounts: {
        symbols: collectedNumber("codeIntelligenceSymbolCount"),
        locations: collectedNumber("codeIntelligenceLocationCount"),
        diagnostics: collectedNumber("codeIntelligenceDiagnosticCount"),
        importEdges: collectedNumber("codeIntelligenceImportEdgeCount"),
        relatedTests: collectedNumber("codeIntelligenceRelatedTestCount"),
        codeActions: collectedNumber("codeIntelligenceCodeActionCount"),
      },
      activeToolId: codeIntelligenceToolIds.at(-1) ?? null,
      runtimeToolInvocationRefs: collect("codeIntelligenceRuntimeToolInvocationRefs", 40),
      resultRefs: codeIntelligenceResultRefs,
      symbolRefs: collect("codeIntelligenceSymbolRefs", 40),
      diagnosticRefs: codeIntelligenceDiagnosticRefs,
      relatedTestRefs: collect("codeIntelligenceRelatedTestRefs", 40),
      impactRefs: collect("codeIntelligenceImpactRefs", 40),
      staleRefBlockers: collect("codeIntelligenceStaleRefBlockers", 20),
      latestSummary: collectedString("codeIntelligenceSummary"),
      reasonCodes: collect("codeIntelligenceReasonCodes", 20),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
    commitmentWorkPackets,
    costAwareDecision: {
      selectedCapabilityId:
        stringValue(nodeData.selectedCapabilityId) ?? stringValue(data.selectedCapabilityId),
      selectedProviderCapabilityProfileId:
        stringValue(nodeData.selectedProviderCapabilityProfileId) ??
        stringValue(data.selectedProviderCapabilityProfileId),
      workerRef: stringValue(nodeData.workerRef) ?? stringValue(data.workerRef),
      roleClass: stringValue(nodeData.capabilityRoleClass) ?? stringValue(data.capabilityRoleClass),
      costClass: stringValue(nodeData.capabilityCostClass) ?? stringValue(data.capabilityCostClass),
      latencyClass:
        stringValue(nodeData.capabilityLatencyClass) ?? stringValue(data.capabilityLatencyClass),
      contextCapacity:
        stringValue(nodeData.capabilityContextCapacity) ??
        stringValue(data.capabilityContextCapacity),
      productionSelectable:
        booleanValue(nodeData.providerProfileProductionSelectable) ??
        booleanValue(data.providerProfileProductionSelectable),
      productionSelectionRequiresQualification:
        booleanValue(nodeData.providerProfileRequiresQualification) ??
        booleanValue(data.providerProfileRequiresQualification),
      selectedModelQualificationProfileId:
        stringValue(nodeData.selectedModelQualificationProfileId) ??
        stringValue(data.selectedModelQualificationProfileId),
      qualificationEvidenceRefs: collect("qualificationEvidenceRefs", 12),
      utilityRationale:
        stringValue(nodeData.capabilityUtilityRationale) ??
        stringValue(data.capabilityUtilityRationale),
      costRationale:
        stringValue(nodeData.capabilityCostRationale) ?? stringValue(data.capabilityCostRationale),
      whyCheaperOptionsWereInsufficient: stringValue(data.whyCheaperOptionsWereInsufficient),
      consideredCapabilityIds: collect("consideredCapabilityIds", 12),
      consideredProviderCapabilityProfileIds: collect("consideredProviderCapabilityProfileIds", 12),
    },
    schedulerToolTrace: {
      schedulerPhase: stringValue(data.schedulerPhase),
      latestToolId: stringValue(data.schedulerToolId),
      invocationRefs: collect("schedulerToolInvocationRefs", 20),
    },
    parallelFrontier: {
      state: latestParallelFrontierData ? "present" : "missing",
      currentSuperstep: latestParallelFrontierData
        ? numberValue(latestParallelFrontierData.currentSuperstep)
        : null,
      maxParallelNodeExecutions: latestParallelFrontierData
        ? numberValue(latestParallelFrontierData.maxParallelNodeExecutions)
        : null,
      dependencyLayerCount: latestParallelFrontierData
        ? numberValue(latestParallelFrontierData.dependencyLayerCount)
        : null,
      readyNodeIds: frontierStringArray("readyNodeIds", 40),
      selectedNodeIds: frontierStringArray("selectedNodeIds", 40),
      runningNodeIds: frontierStringArray("runningNodeIds", 40),
      completedNodeIds: frontierStringArray("completedNodeIds", 40),
      blockedNodeIds: frontierStringArray("blockedNodeIds", 40),
      failedNodeIds: frontierStringArray("failedNodeIds", 40),
      needsReviewNodeIds: frontierStringArray("needsReviewNodeIds", 40),
      waitingForHumanNodeIds: frontierStringArray("waitingForHumanNodeIds", 40),
      skippedReasonCodes: frontierStringArray("skippedReasonCodes", 60),
      conflictDomains: frontierConflictDomains,
      providerConcurrencyBudgets: frontierProviderConcurrencyBudgets,
      joinReadyNodeIds: frontierStringArray("joinReadyNodeIds", 30),
      contextSynthesisRefs: frontierStringArray("contextSynthesisRefs", 12),
      implementationGroupCount: latestParallelFrontierData
        ? numberValue(latestParallelFrontierData.implementationGroupCount)
        : null,
    },
    modelCallProgress: {
      state: stringValue(latestModelCallData.modelCallSpanId) ? "present" : "missing",
      spanId: stringValue(latestModelCallData.modelCallSpanId),
      phase: stringValue(latestModelCallData.modelCallPhase),
      modelRef: stringValue(latestModelCallData.modelRef),
      providerPath: stringValue(latestModelCallData.providerPath),
      roleId: stringValue(latestModelCallData.roleId),
      nodeId: stringValue(latestModelCallData.nodeId),
      objective: stringValue(latestModelCallData.currentObjective),
      inputHash: stringValue(latestModelCallData.modelCallSpanInputHash),
      responseHash: stringValue(latestModelCallData.modelCallSpanResponseHash),
      elapsedMs: numberValue(latestModelCallData.modelCallSpanElapsedMs),
      timeoutMs: numberValue(latestModelCallData.modelCallSpanTimeoutMs),
      heartbeatCount: numberValue(latestModelCallData.modelCallSpanHeartbeatCount),
      responseShapeSummary:
        (asRecord(latestModelCallData.modelCallSpanResponseShapeSummary) as JsonValue | null) ??
        null,
      providerDiagnostics:
        (asRecord(latestModelCallData.modelProviderDiagnostics) as JsonValue | null) ?? null,
      providerUsage:
        (asRecord(
          asRecord(latestModelCallData.modelProviderDiagnostics)?.usage,
        ) as JsonValue | null) ??
        (asRecord(
          asRecord(latestModelCallData.modelProviderDiagnostics)?.providerUsage,
        ) as JsonValue | null) ??
        null,
      usageUnavailableReason: stringValue(
        asRecord(latestModelCallData.modelProviderDiagnostics)?.usageUnavailableReason,
      ),
      reasonCodes: stringArrayValue(latestModelCallData.reasonCodes, 12),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    },
    spanProgress,
    repairClassification: {
      state: latestRepairClassification ? "present" : "missing",
      classificationRef: stringValue(latestRepairClassification?.classificationRef),
      failureClass: stringValue(latestRepairClassification?.failureClass),
      failedBoundaryKind: stringValue(latestRepairClassification?.failedBoundaryKind),
      repairStrategy: stringValue(latestRepairClassification?.repairStrategy),
      selectedRepairBoundary: stringValue(latestRepairClassification?.selectedRepairBoundary),
      failedSpanRefs: latestRepairClassification
        ? stringArrayValue(latestRepairClassification.failedSpanRefs, 12)
        : [],
      failedRuntimeToolInvocationRefs: latestRepairClassification
        ? stringArrayValue(latestRepairClassification.failedRuntimeToolInvocationRefs, 12)
        : [],
      failedCommitmentIds: latestRepairClassification
        ? stringArrayValue(latestRepairClassification.failedCommitmentIds, 20)
        : [],
      failedFieldPaths: latestRepairClassification
        ? stringArrayValue(latestRepairClassification.failedFieldPaths, 20)
        : [],
      reasonCodes: latestRepairClassification
        ? stringArrayValue(latestRepairClassification.reasonCodes, 20)
        : [],
      expectedNextAction: stringValue(latestRepairClassification?.expectedNextAction),
      semanticReviewRequired:
        typeof latestRepairClassification?.semanticReviewRequired === "boolean"
          ? latestRepairClassification.semanticReviewRequired
          : null,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
      workQueueLifecycleMutated: false,
    },
    postSynthesisGraphQuality: {
      state: stringValue(data.postSynthesisGraphQualityState),
      presentRoleObligations: collect("postSynthesisPresentRoleObligations", 12),
      missingRoleObligations: collect("postSynthesisMissingRoleObligations", 12),
      broadCodexShare: numberValue(data.postSynthesisBroadCodexShare),
      premiumShare: numberValue(data.postSynthesisPremiumShare),
    },
    workerToolTrace: {
      latestWorkerToolId,
      workerToolIds,
      invocationRefs: [
        ...new Set([
          ...collect("schedulerToolInvocationRefs", 20),
          ...collect("artifactRefs", 20).filter((ref) => ref.startsWith("runtime-tool://")),
          ...collect("evidenceProducedRefs", 20).filter((ref) => ref.startsWith("runtime-tool://")),
        ]),
      ].slice(0, 20),
      changedFileRefs: collect("changedFileRefs", 20),
      validationRefs: collect("validationRefs", 20),
      contextRequestRefs: collect("contextRequestRefs", 20),
      editStepIds: collect("editStepIds", 20),
      evidenceClaimRefs: collect("evidenceClaimRefs", 20),
      editTransactionRefs: collect("editTransactionRefs", 20),
      workerPhaseRefs: collect("workerPhaseRefs", 30),
      editTransactionPhase: stringValue(data.editTransactionPhase),
      editTransactionStatus: stringValue(data.editTransactionStatus),
      editTransactionRepairCount: numberValue(data.editTransactionRepairCount),
    },
    workerInternal: {
      state:
        stringValue(latestWorkerInternalData.currentPhase) ||
        stringValue(latestWorkerInternalData.workerInternalToolStatus) ||
        stringArrayValue(latestWorkerInternalData.workerPhaseRefs, 1).length > 0
          ? stringValue(latestWorkerInternalData.status) === "needs_review" ||
            stringValue(latestWorkerInternalData.currentPhase)?.includes("needs_review")
            ? "needs_review"
            : "present"
          : "missing",
      phase: stringValue(latestWorkerInternalData.currentPhase),
      phaseStatus: stringValue(latestWorkerInternalData.status),
      objective: stringValue(latestWorkerInternalData.currentObjective),
      whySelected: stringValue(latestWorkerInternalData.whyThisNodeWasChosen),
      roleId: stringValue(latestWorkerInternalData.roleId),
      modelRef: stringValue(latestWorkerInternalData.modelRef),
      providerPath: stringValue(latestWorkerInternalData.providerPath),
      workerRef: stringValue(latestWorkerInternalData.workerRef),
      capabilityId:
        stringValue(latestWorkerInternalData.capabilityId) ??
        stringValue(latestWorkerInternalData.selectedCapabilityId),
      selectedToolId:
        stringValue(latestWorkerInternalData.schedulerToolId) ??
        stringValue(latestWorkerInternalData.latestToolEventKind) ??
        latestWorkerToolId,
      toolStatus: stringValue(latestWorkerInternalData.workerInternalToolStatus),
      compoundToolId: stringValue(latestWorkerInternalData.workerInternalCompoundToolId),
      compoundSubEventCount: numberValue(
        latestWorkerInternalData.workerInternalCompoundSubEventCount,
      ),
      compoundSubEventPhases: stringArrayValue(
        latestWorkerInternalData.workerInternalCompoundSubEventPhases,
        20,
      ),
      toolInvocationRefs: [
        ...new Set([
          ...stringArrayValue(latestWorkerInternalData.schedulerToolInvocationRefs, 20),
          ...stringArrayValue(latestWorkerInternalData.artifactRefs, 20).filter((ref) =>
            ref.startsWith("runtime-tool://"),
          ),
          ...stringArrayValue(latestWorkerInternalData.evidenceProducedRefs, 20).filter((ref) =>
            ref.startsWith("runtime-tool://"),
          ),
        ]),
      ].slice(0, 20),
      targetRefs: stringArrayValue(latestWorkerInternalData.targetRefs, 30),
      inputPacketRefs: stringArrayValue(latestWorkerInternalData.workerInternalInputPacketRefs, 20),
      contextRefs: [
        ...new Set([
          ...stringArrayValue(latestWorkerInternalData.workerInternalContextRefs, 30),
          ...stringArrayValue(latestWorkerInternalData.inputHandoffRefs, 30),
        ]),
      ].slice(0, 30),
      contextSynthesisRefs: stringArrayValue(
        latestWorkerInternalData.workerInternalContextSynthesisRefs,
        20,
      ),
      codeIntelligenceRefs: stringArrayValue(
        latestWorkerInternalData.workerInternalCodeIntelligenceRefs,
        20,
      ),
      currentValidationCommandRef: stringValue(
        latestWorkerInternalData.currentValidationCommandRef,
      ),
      currentValidationCommandSummary: stringValue(
        latestWorkerInternalData.currentValidationCommandSummary,
      ),
      currentValidationCommandStatus: stringValue(
        latestWorkerInternalData.currentValidationCommandStatus,
      ),
      editTransactionRefs: stringArrayValue(latestWorkerInternalData.editTransactionRefs, 20),
      editTransactionPhase: stringValue(latestWorkerInternalData.editTransactionPhase),
      editTransactionStatus: stringValue(latestWorkerInternalData.editTransactionStatus),
      editTransactionRepairCount: numberValue(latestWorkerInternalData.editTransactionRepairCount),
      changedFileRefs: stringArrayValue(latestWorkerInternalData.changedFileRefs, 20),
      validationRefs: stringArrayValue(latestWorkerInternalData.validationRefs, 20),
      evidenceRefs: stringArrayValue(latestWorkerInternalData.evidenceProducedRefs, 20),
      evidenceClaimRefs: stringArrayValue(latestWorkerInternalData.evidenceClaimRefs, 20),
      outputHash:
        stringValue(latestWorkerInternalData.workerInternalOutputHash) ??
        stringValue(latestWorkerInternalData.modelCallSpanResponseHash),
      outputContentLength: numberValue(latestWorkerInternalData.workerInternalOutputContentLength),
      providerLatencyMs:
        numberValue(latestWorkerInternalData.workerInternalProviderLatencyMs) ??
        numberValue(latestWorkerInternalData.modelCallSpanElapsedMs),
      providerTimeoutMs:
        numberValue(latestWorkerInternalData.workerInternalProviderTimeoutMs) ??
        numberValue(latestWorkerInternalData.modelCallSpanTimeoutMs),
      providerFinishReason: stringValue(
        latestWorkerInternalData.workerInternalProviderFinishReason,
      ),
      providerTokenCount: numberValue(latestWorkerInternalData.workerInternalProviderTokenCount),
      providerUsage:
        (asRecord(latestWorkerInternalData.workerInternalProviderUsage) as JsonValue | null) ??
        (asRecord(
          asRecord(latestWorkerInternalData.modelProviderDiagnostics)?.usage,
        ) as JsonValue | null) ??
        null,
      usageUnavailableReason:
        stringValue(latestWorkerInternalData.workerInternalUsageUnavailableReason) ??
        stringValue(
          asRecord(latestWorkerInternalData.modelProviderDiagnostics)?.usageUnavailableReason,
        ),
      providerDiagnostics:
        (asRecord(latestWorkerInternalData.modelProviderDiagnostics) as JsonValue | null) ?? null,
      repairClassificationRef: stringValue(
        asRecord(latestWorkerInternalData.repairClassification)?.classificationRef,
      ),
      repairFailureClass: stringValue(
        asRecord(latestWorkerInternalData.repairClassification)?.failureClass,
      ),
      blockerSummary: stringValue(latestWorkerInternalData.blockerSummary),
      nextDecision: stringValue(latestWorkerInternalData.nextDecisionNeeded),
      eli5: stringValue(latestWorkerInternalData.eli5Progress),
      reasonCodes: stringArrayValue(latestWorkerInternalData.reasonCodes, 30),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
    },
    validationQa: {
      state:
        validationQaToolInvocationRefs.length > 0 || validationQaEvidencePacketRefs.length > 0
          ? latestValidationQaState === "needs_review" ||
            latestValidationQaState === "failed" ||
            latestValidationQaState === "not_run"
            ? "needs_review"
            : "present"
          : "missing",
      taskPacketRefs: collect("validationTaskPacketRefs", 20),
      planRefs: collect("validationPlanRefs", 20),
      commandRefs: collect("validationCommandRefs", 20),
      commandSummaries: collect("validationCommandSummaries", 20),
      currentCommandRef: stringValue(latestValidationQaData.currentValidationCommandRef),
      currentCommandSummary: stringValue(latestValidationQaData.currentValidationCommandSummary),
      currentCommandStatus: stringValue(latestValidationQaData.currentValidationCommandStatus),
      resultRefs: collect("validationResultRefs", 20),
      failureRefs: collect("validationFailureRefs", 20),
      repairPlanRefs: collect("validationRepairPlanRefs", 20),
      repairNodeRefs: collect("validationRepairNodeRefs", 20),
      repairHandoffRefs: collect("validationRepairHandoffRefs", 20),
      coverageReviewRefs: collect("validationCoverageReviewRefs", 20),
      qaReviewRefs: collect("validationQaReviewRefs", 20),
      evidencePacketRefs: validationQaEvidencePacketRefs,
      toolInvocationRefs: validationQaToolInvocationRefs,
      blockingCommitmentIds: collect("validationBlockingCommitmentIds", 20),
      latestSummary:
        stringValue(latestValidationQaData.validationQaLatestSummary) ??
        stringValue(data.validationQaLatestSummary),
      rawCommandLogsStored: false,
    },
    closeoutFinalization: {
      state:
        closeoutFinalizationState === "accepted"
          ? "accepted"
          : closeoutFinalizationEvidencePacketRefs.length > 0 ||
              closeoutFinalizationToolInvocationRefs.length > 0
            ? "needs_review"
            : "missing",
      evidencePacketRefs: closeoutFinalizationEvidencePacketRefs,
      handoffRefs: collect("closeoutFinalizationHandoffRefs", 20),
      toolInvocationRefs: closeoutFinalizationToolInvocationRefs,
      acceptRefs: collect("closeoutFinalizationAcceptRefs", 20),
      rejectRefs: collect("closeoutFinalizationRejectRefs", 20),
      missingReasonCodes: collect("closeoutFinalizationMissingReasonCodes", 30),
      maximalitySummary:
        stringValue(latestCloseoutFinalizationData.closeoutFinalizationMaximalitySummary) ??
        stringValue(data.closeoutFinalizationMaximalitySummary),
      limitationsSummary:
        stringValue(latestCloseoutFinalizationData.closeoutFinalizationLimitationsSummary) ??
        stringValue(data.closeoutFinalizationLimitationsSummary),
      eli5:
        stringValue(latestCloseoutFinalizationData.closeoutFinalizationEli5) ??
        stringValue(data.closeoutFinalizationEli5),
      recommendedNextAction:
        stringValue(latestCloseoutFinalizationData.closeoutFinalizationRecommendedNextAction) ??
        stringValue(data.closeoutFinalizationRecommendedNextAction),
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    },
    boundaryReplay: {
      state:
        boundaryReplayCheckpointRefs.length > 0 || boundaryReplayPlanRefs.length > 0
          ? "present"
          : "missing",
      latestCheckpointKind: latestBoundaryCheckpointKind,
      checkpointRefs: boundaryReplayCheckpointRefs,
      graphCheckpointRefs: boundaryReplayGraphCheckpointRefs,
      planRefs: boundaryReplayPlanRefs,
      replayStartPolicy: stringValue(latestBoundaryData.replayStartPolicy),
      replaySafetyStatus: stringValue(latestBoundaryData.replaySafetyStatus),
      replayFreshnessStatus: stringValue(latestBoundaryData.replayFreshnessStatus),
      replayContinuationMode: stringValue(latestBoundaryData.replayContinuationMode),
      exactContinuationAction: stringValue(latestBoundaryPlanData.exactContinuationAction),
      exactContinuationMode: stringValue(latestBoundaryPlanData.exactContinuationMode),
      latestAcceptedCheckpointRef: stringValue(latestBoundaryPlanData.latestAcceptedCheckpointRef),
      skippedUpstreamCheckpointKinds: stringArrayValue(
        latestBoundaryPlanData.skippedUpstreamCheckpointKinds,
        20,
      ),
      resumeFromArtifactRefs: stringArrayValue(latestBoundaryPlanData.resumeFromArtifactRefs, 20),
      invalidReasonCodes: stringArrayValue(latestBoundaryPlanData.invalidReasonCodes, 40),
      acceptedCheckpointRefs: stringArrayValue(latestBoundaryPlanData.acceptedCheckpointRefs, 40),
      staleCheckpointRefs: stringArrayValue(latestBoundaryPlanData.staleCheckpointRefs, 40),
      rejectedCheckpointRefs: stringArrayValue(latestBoundaryPlanData.rejectedCheckpointRefs, 40),
      latestSummary:
        stringValue(latestBoundaryData.operatorReadbackSummary) ??
        stringValue(latestBoundaryProgressData.eli5Progress),
      reasonCodes: [
        ...new Set([
          ...stringArrayValue(latestBoundaryData.reasonCodes, 20),
          ...stringArrayValue(latestBoundaryProgressData.reasonCodes, 20),
          ...stringArrayValue(latestBoundaryPlanData.reasonCodes, 20),
        ]),
      ].slice(0, 40),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    },
    latestProgressEventRefs: progressEvents
      .slice(-6)
      .map((event) => `runtime-event://${event.eventId}`),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
  };
}

function modelReadinessFromTeamEvidence(
  evidence: AgentTeamRuntimeEvidence | null,
): Array<{ modelId: string; status: string }> {
  if (!evidence) {
    return [];
  }
  return evidence.roster
    .map((entry) => ({ modelId: entry.modelId, status: entry.status }))
    .slice(0, 20);
}

type AgentTeamDynamicGraphReadbackNode =
  WorkQueueExecutionRuntimeJobReadModel["agentTeam"]["taskGraph"]["nodes"][number];

function runtimeArtifactRecord(artifact: RuntimeJobArtifact): Record<string, unknown> {
  return asRecord(artifact.metadata) ?? {};
}

function progressNodeFromArtifact(artifact: RuntimeJobArtifact): AgentTeamDynamicGraphReadbackNode {
  const metadata = runtimeArtifactRecord(artifact);
  return {
    nodeId: stringValue(metadata.nodeId) ?? artifact.uri,
    stage: stringValue(metadata.stage) ?? "unknown",
    roleId: stringValue(metadata.roleId),
    status: stringValue(metadata.status) ?? "unknown",
    modelRef: stringValue(metadata.modelRef),
    providerPath: stringValue(metadata.providerPath),
    transportKind: stringValue(metadata.transportKind),
    artifactRefs: stringArrayValue(metadata.artifactRefs, 12),
    validationRefs: [],
    reasonCodes: stringArrayValue(metadata.reasonCodes, 12),
  };
}

function roleNodeFromArtifact(
  artifact: RuntimeJobArtifact,
): Partial<AgentTeamDynamicGraphReadbackNode> {
  const metadata = runtimeArtifactRecord(artifact);
  const closeout = asRecord(metadata.closeout);
  return {
    nodeId: stringValue(metadata.nodeId) ?? artifact.uri,
    roleId: stringValue(metadata.roleId) ?? stringValue(closeout?.roleId),
    modelRef: stringValue(closeout?.modelRef),
    providerPath: "openrouter",
    transportKind: "live_model",
    artifactRefs: [artifact.uri, ...stringArrayValue(closeout?.evidenceRefs, 8)].slice(0, 12),
    validationRefs: stringArrayValue(closeout?.evidenceRefs, 8).filter((ref) =>
      ref.includes("/validation/"),
    ),
  };
}

function buildDynamicGraphReadback(input: {
  artifacts: RuntimeJobArtifact[];
  evidence: AgentTeamRuntimeEvidence | null;
  dynamicTaskGraphNodes: unknown[];
}): {
  nodes: AgentTeamDynamicGraphReadbackNode[];
  nodeCount: number;
  edgeCount: number;
  repeatedRoleInvocationCount: number;
  activeWorker: string | null;
  lastWorker: string | null;
  currentStage: string | null;
  repairAttemptCount: number;
  humanDecisionPresent: boolean;
  closeoutState: string;
  finalState: string;
} {
  const roleByNode = new Map(
    input.artifacts
      .filter((artifact) => artifact.artifactType === "agent_team.dynamic_role_invocation")
      .map((artifact) => {
        const node = roleNodeFromArtifact(artifact);
        return [node.nodeId ?? artifact.uri, node] as const;
      }),
  );
  const progressNodes = input.artifacts
    .filter((artifact) => artifact.artifactType === "agent_team.dynamic_progress")
    .map((artifact) => {
      const node = progressNodeFromArtifact(artifact);
      const role = roleByNode.get(node.nodeId);
      return {
        ...node,
        ...role,
        stage: node.stage,
        status: node.status,
        roleId: node.roleId ?? role?.roleId ?? null,
        artifactRefs: [...node.artifactRefs, ...(role?.artifactRefs ?? [])].slice(0, 12),
        validationRefs: role?.validationRefs ?? [],
        reasonCodes: [...node.reasonCodes, ...(role?.reasonCodes ?? [])].slice(0, 12),
      };
    });
  const planNodes = input.dynamicTaskGraphNodes
    .map((node, index): AgentTeamDynamicGraphReadbackNode | null => {
      const record = asRecord(node);
      if (!record) {
        return null;
      }
      return {
        nodeId: stringValue(record.nodeId) ?? `planned-node-${index + 1}`,
        stage: stringValue(record.actionKind) ?? "planned",
        roleId: stringValue(record.assignedRole),
        status: "planned",
        modelRef: null,
        providerPath: null,
        transportKind: null,
        artifactRefs: [],
        validationRefs: [],
        reasonCodes: stringArrayValue(record.reasonCodes, 6),
      };
    })
    .filter((node): node is AgentTeamDynamicGraphReadbackNode => Boolean(node));
  const nodesByKey = new Map<string, AgentTeamDynamicGraphReadbackNode>();
  for (const node of [...planNodes, ...progressNodes]) {
    const key = `${node.stage}:${node.roleId ?? "none"}:${node.nodeId}`;
    nodesByKey.set(key, node);
  }
  const nodes = Array.from(nodesByKey.values()).slice(0, 60);
  const roleCounts = new Map<string, number>();
  for (const node of nodes) {
    if (node.roleId) {
      roleCounts.set(node.roleId, (roleCounts.get(node.roleId) ?? 0) + 1);
    }
  }
  const repeatedRoleInvocationCount = Array.from(roleCounts.values()).reduce(
    (sum, count) => sum + Math.max(0, count - 1),
    0,
  );
  const active = nodes.toReversed().find((node) => node.status === "started") ?? null;
  const lastNode = nodes.at(-1) ?? null;
  const repairMetadata = asRecord(
    input.artifacts.findLast(
      (artifact) => artifact.artifactType === "agent_team.dynamic_validation_repair_loop",
    )?.metadata,
  );
  const closeoutCompleted = nodes.some(
    (node) => node.stage === "closeout" && node.status === "completed",
  );
  const closeoutStarted = nodes.some(
    (node) => node.stage === "closeout" && node.status === "started",
  );
  return {
    nodes,
    nodeCount: Math.max(nodes.length, input.dynamicTaskGraphNodes.length),
    edgeCount: Math.max(0, nodes.length - 1),
    repeatedRoleInvocationCount,
    activeWorker: active?.roleId ?? active?.stage ?? null,
    lastWorker: lastNode?.roleId ?? lastNode?.stage ?? null,
    currentStage: active?.stage ?? lastNode?.stage ?? null,
    repairAttemptCount: numberValue(repairMetadata?.repairAttemptCount) ?? 0,
    humanDecisionPresent: input.artifacts.some(
      (artifact) => artifact.artifactType === "agent_team.human_scope_decision",
    ),
    closeoutState: closeoutCompleted ? "completed" : closeoutStarted ? "started" : "unknown",
    finalState:
      input.evidence?.validationState === "passed" && input.evidence.closeoutState === "present"
        ? "succeeded"
        : (input.evidence?.validationState ?? "unknown"),
  };
}

function latestKimiImplementationReadback(
  artifacts: RuntimeJobArtifact[],
): WorkQueueExecutionRuntimeJobReadModel["agentTeam"]["taskGraph"]["kimiImplementation"] {
  const artifact = artifacts.findLast(
    (item) => item.artifactType === "agent_team.kimi_standard_implementation_attempt",
  );
  const metadata = asRecord(artifact?.metadata);
  const diagnostics = Array.isArray(metadata?.attemptDiagnostics)
    ? metadata.attemptDiagnostics
    : [];
  const adapterDiagnostics = asRecord(metadata?.boundedAdapterDiagnostics);
  const sourceResult = asRecord(adapterDiagnostics?.sourceResult);
  const gate = asRecord(sourceResult?.providerCapabilitySlotGate);
  const gateRecord = gate ?? {};
  const gatePresent = Object.keys(gateRecord).length > 0;
  const modelPolicySlots = Array.isArray(sourceResult?.modelPolicySlots)
    ? sourceResult.modelPolicySlots
        .map(
          (
            slot,
          ): {
            slot: string;
            modelRef: string;
            providerPath: string;
            reasoningMode: string;
            responseFormatMode: string;
          } | null => {
            const record = asRecord(slot);
            const slotName = stringValue(record?.slot);
            const modelRef = stringValue(record?.modelRef);
            if (!slotName || !modelRef) {
              return null;
            }
            return {
              slot: slotName,
              modelRef,
              providerPath: stringValue(record?.providerPath) ?? "",
              reasoningMode: stringValue(record?.reasoningMode) ?? "",
              responseFormatMode: stringValue(record?.responseFormatMode) ?? "",
            };
          },
        )
        .filter((slot): slot is NonNullable<typeof slot> => slot !== null)
        .slice(0, 8)
    : [];
  const editTransactions = Array.isArray(sourceResult?.editTransactions)
    ? sourceResult.editTransactions
        .map(
          (
            item,
          ): {
            transactionRef: string;
            status: string | null;
            phase: string | null;
            changedFileRefs: string[];
            validationRefs: string[];
            repairAttemptCount: number | null;
            evidenceClaimRefs: string[];
            reasonCodes: string[];
          } | null => {
            const record = asRecord(item);
            const transactionRef = stringValue(record?.transactionRef);
            if (!transactionRef) {
              return null;
            }
            return {
              transactionRef,
              status: stringValue(record?.status),
              phase: stringValue(record?.phase),
              changedFileRefs: stringArrayValue(record?.changedFileRefs, 20),
              validationRefs: stringArrayValue(record?.validationRefs, 20),
              repairAttemptCount: numberValue(record?.repairAttemptCount),
              evidenceClaimRefs: stringArrayValue(record?.evidenceClaimRefs, 20),
              reasonCodes: stringArrayValue(record?.reasonCodes, 20),
            };
          },
        )
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .slice(0, 10)
    : [];
  const repairClassifications = Array.isArray(sourceResult?.repairClassifications)
    ? sourceResult.repairClassifications
        .map(
          (
            item,
          ): {
            classificationRef: string;
            failureClass: string | null;
            failedBoundaryKind: string | null;
            repairStrategy: string | null;
            selectedRepairBoundary: string | null;
            expectedNextAction: string | null;
            failedCommitmentIds: string[];
            reasonCodes: string[];
          } | null => {
            const record = asRecord(item);
            const classificationRef = stringValue(record?.classificationRef);
            if (!classificationRef) {
              return null;
            }
            return {
              classificationRef,
              failureClass: stringValue(record?.failureClass),
              failedBoundaryKind: stringValue(record?.failedBoundaryKind),
              repairStrategy: stringValue(record?.repairStrategy),
              selectedRepairBoundary: stringValue(record?.selectedRepairBoundary),
              expectedNextAction: stringValue(record?.expectedNextAction),
              failedCommitmentIds: stringArrayValue(record?.failedCommitmentIds, 20),
              reasonCodes: stringArrayValue(record?.reasonCodes, 20),
            };
          },
        )
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .slice(0, 20)
    : [];
  const workerPhases = Array.isArray(sourceResult?.workerPhases)
    ? sourceResult.workerPhases
        .map(
          (
            item,
          ): {
            phaseRef: string;
            phase: string | null;
            status: string | null;
            modelSlot: string | null;
            modelRef: string | null;
            toolId: string | null;
            toolInvocationRef: string | null;
            transactionRef: string | null;
            summary: string | null;
            blockerSummary: string | null;
            nextAction: string | null;
            reasonCodes: string[];
          } | null => {
            const record = asRecord(item);
            const phaseRef = stringValue(record?.phaseRef);
            if (!phaseRef) {
              return null;
            }
            return {
              phaseRef,
              phase: stringValue(record?.phase),
              status: stringValue(record?.status),
              modelSlot: stringValue(record?.modelSlot),
              modelRef: stringValue(record?.modelRef),
              toolId: stringValue(record?.toolId),
              toolInvocationRef: stringValue(record?.toolInvocationRef),
              transactionRef: stringValue(record?.transactionRef),
              summary: stringValue(record?.summary),
              blockerSummary: stringValue(record?.blockerSummary),
              nextAction: stringValue(record?.nextAction),
              reasonCodes: stringArrayValue(record?.reasonCodes, 20),
            };
          },
        )
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .slice(0, 20)
    : [];
  return {
    state: artifact ? "present" : "missing",
    status: stringValue(metadata?.status),
    modelRef: stringValue(metadata?.modelRef),
    modelRunRef: stringValue(metadata?.modelRunRef),
    changedFileRefs: stringArrayValue(metadata?.changedFileRefs, 20),
    validationRefs: stringArrayValue(metadata?.validationRefs, 20),
    editTransactionRefs: stringArrayValue(sourceResult?.editTransactionRefs, 20),
    editTransactions,
    repairClassificationRefs: stringArrayValue(sourceResult?.repairClassificationRefs, 30),
    repairClassifications,
    workerPhaseRefs: stringArrayValue(sourceResult?.workerPhaseRefs, 30),
    workerPhases,
    attemptCount: diagnostics.length,
    rejectionStages: boundedUniqueStringValues(
      diagnostics
        .map((item) => stringValue(asRecord(item)?.rejectionStage))
        .filter((value): value is string => Boolean(value)),
      12,
    ),
    escalationRecommended: booleanValue(metadata?.escalatedToCodexBridgeRecommended) ?? false,
    modelPolicySlots,
    providerCapabilitySlotGate: gatePresent
      ? {
          status: stringValue(gateRecord.status),
          selectedControllerModelRef: stringValue(gateRecord.selectedControllerModelRef),
          selectedPatchModelRef: stringValue(gateRecord.selectedPatchModelRef),
          kimiControllerBlocked: booleanValue(gateRecord.kimiControllerBlocked) ?? false,
          kimiPatchAuthorAllowed: booleanValue(gateRecord.kimiPatchAuthorAllowed) ?? false,
          reasonCodes: stringArrayValue(gateRecord.reasonCodes, 20),
        }
      : null,
    artifactRef: artifact?.uri ?? null,
    reasonCodes: stringArrayValue(metadata?.reasonCodes, 20),
  };
}

function webResearchProjection(
  evidence: WebResearchRuntimeEvidence | null,
  artifacts: RuntimeJobArtifact[],
): WorkQueueWebResearchProjection {
  const artifactRefs = artifacts
    .filter((artifact) => artifact.artifactType === "web_research.runtime_evidence")
    .map((artifact) => artifact.uri)
    .slice(0, 10);
  if (!evidence) {
    return {
      artifactKind: "work_queue_web_research_projection",
      state: "unknown",
      workflowId: null,
      researchRunId: null,
      queryHash: null,
      boundedQuerySummary: null,
      boundedAnswerSummary: null,
      sourceCount: 0,
      citationCount: 0,
      citationRefs: [],
      validationState: "unknown",
      reviewState: "unknown",
      closeoutState: "unknown",
      artifactRefs,
      reasonCodes: ["web_research_evidence_missing"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawPageStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      externalWritePerformed: false,
      workQueueLifecycleMutationAllowed: false,
    };
  }
  return {
    artifactKind: "work_queue_web_research_projection",
    state:
      evidence.validationState === "failed"
        ? "failed"
        : evidence.validationState === "needs_review" || evidence.reviewState === "needs_review"
          ? "needs_review"
          : "present",
    workflowId: evidence.workflowId,
    researchRunId: evidence.researchRunId,
    queryHash: evidence.queryHash,
    boundedQuerySummary: evidence.boundedQuerySummary,
    boundedAnswerSummary: evidence.boundedAnswerSummary,
    sourceCount: evidence.sources.length,
    citationCount: evidence.citationRefs.length,
    citationRefs: evidence.citationRefs.slice(0, 10),
    validationState: evidence.validationState,
    reviewState: evidence.reviewState,
    closeoutState: evidence.closeoutState,
    artifactRefs,
    reasonCodes: evidence.reasonCodes.slice(0, 20),
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawPageStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    externalWritePerformed: false,
    workQueueLifecycleMutationAllowed: false,
  };
}

function skillifierProjection(
  job: RuntimeJob,
  artifacts: RuntimeJobArtifact[],
): WorkQueueSkillifierProjection {
  const payload = asRecord(job.payload);
  const result = asRecord(job.result);
  const adapter = latestArtifact(artifacts, "runtime_worker.adapter_result");
  const adapterRecord = asRecord(adapter?.metadata);
  const candidate = latestArtifact(artifacts, "skillifier.runtime_candidate");
  const candidateRecord = asRecord(candidate?.metadata);
  const closeout = latestArtifact(artifacts, "execution_platform.closeout_capsule");
  const modelTaskRefs = boundedUniqueStringValues(
    [
      ...stringArrayValue(payload?.modelTaskRefs, 20),
      ...stringArrayValue(result?.modelTaskRefs, 20),
      ...stringArrayValue(candidateRecord?.modelTaskRefs, 20),
    ],
    20,
  );
  const dbOperationRefs = boundedUniqueStringValues(
    [
      ...stringArrayValue(payload?.dbOperationRefs, 20),
      ...stringArrayValue(result?.dbOperationRefs, 20),
      ...stringArrayValue(candidateRecord?.dbOperationRefs, 20),
    ],
    20,
  );
  const candidateArtifactRefs = [
    ...stringArrayValue(result?.candidateArtifactRefs, 20),
    ...(candidate ? [candidate.uri] : []),
  ].slice(0, 20);
  const opportunitySeedRefs = [
    ...stringArrayValue(payload?.opportunitySeedRefs, 20),
    ...stringArrayValue(result?.opportunitySeedRefs, 20),
  ].slice(0, 20);
  const closeoutCapsuleRefs = [
    ...stringArrayValue(payload?.closeoutCapsuleRefs, 20),
    ...stringArrayValue(result?.closeoutCapsuleRefs, 20),
  ].slice(0, 20);
  opportunitySeedRefs.push(...stringArrayValue(candidateRecord?.opportunitySeedRefs, 20));
  closeoutCapsuleRefs.push(...stringArrayValue(candidateRecord?.closeoutCapsuleRefs, 20));
  const candidateOpportunitySeedRef = stringValue(candidateRecord?.opportunitySeedRef);
  if (candidateOpportunitySeedRef) {
    opportunitySeedRefs.push(candidateOpportunitySeedRef);
  }
  const candidateSourceOpportunityRef = stringValue(candidateRecord?.sourceOpportunityRef);
  if (candidateSourceOpportunityRef) {
    opportunitySeedRefs.push(candidateSourceOpportunityRef);
  }
  const candidateCloseoutCapsuleRef = stringValue(candidateRecord?.closeoutCapsuleRef);
  if (candidateCloseoutCapsuleRef) {
    closeoutCapsuleRefs.push(candidateCloseoutCapsuleRef);
  }
  if (closeout) {
    closeoutCapsuleRefs.push(closeout.uri);
  }
  opportunitySeedRefs.splice(
    0,
    opportunitySeedRefs.length,
    ...boundedUniqueStringValues(opportunitySeedRefs, 20),
  );
  closeoutCapsuleRefs.splice(
    0,
    closeoutCapsuleRefs.length,
    ...boundedUniqueStringValues(closeoutCapsuleRefs, 20),
  );
  const candidateId = stringValue(candidateRecord?.candidateId) ?? stringValue(result?.candidateId);
  const candidateType =
    stringValue(candidateRecord?.candidateType) ?? stringValue(result?.candidateType);
  const reviewState = stringValue(candidateRecord?.reviewState) ?? stringValue(result?.reviewState);
  const validationRefs = [
    ...stringArrayValue(result?.validationRefs, 20),
    ...stringArrayValue(candidateRecord?.validationRefs, 20),
  ].slice(0, 20);
  const reviewRefs = [
    ...stringArrayValue(result?.reviewRefs, 20),
    ...stringArrayValue(candidateRecord?.reviewRefs, 20),
  ].slice(0, 20);
  const limitations = stringArrayValue(candidateRecord?.limitations, 10);
  const eli5Progress =
    stringValue(candidateRecord?.eli5Progress) ?? stringValue(result?.eli5Progress);
  const nextAction =
    stringValue(result?.nextAction) ??
    (reviewState === "candidate_ready"
      ? "Review and apply the Skillifier candidate through the approved skill-file boundary."
      : null);
  const hasSkillifierEvidence =
    payload?.workflowId === "workflow.skillifier" ||
    job.jobType === "executor.skillifier" ||
    Boolean(candidate);
  const reasonCodes = [
    ...stringArrayValue(adapterRecord?.reasonCodes, 20),
    ...stringArrayValue(candidateRecord?.reasonCodes, 20),
    ...(hasSkillifierEvidence ? [] : ["skillifier_evidence_missing"]),
  ].slice(0, 30);
  return {
    artifactKind: "work_queue_skillifier_projection",
    state: !hasSkillifierEvidence
      ? "unknown"
      : job.state === "failed"
        ? "failed"
        : reviewState === "needs_review"
          ? "needs_review"
          : "present",
    runtimeJobId: hasSkillifierEvidence ? job.jobId : null,
    workflowId: stringValue(payload?.workflowId),
    opportunity: buildProactivityOpportunityProjection({
      opportunitySeedRefs,
      capsuleRefs: closeoutCapsuleRefs,
      artifactRefs: candidateArtifactRefs,
      modelTaskRefs,
      dbOperationRefs,
      reviewRefs,
      reasonCodes,
      outcomeState: stringValue(result?.outcomeState) ?? stringValue(result?.status),
      reviewState,
      candidateId,
      limitations,
      eli5Status: eli5Progress,
      staleSignal:
        reasonCodes.some((value) => value.toLowerCase().includes("stale")) ||
        reviewState === "stale",
    }),
    opportunitySeedRefs,
    closeoutCapsuleRefs,
    candidateId,
    candidateType,
    reviewState,
    targetSkillRefs: [
      ...stringArrayValue(payload?.targetSkillRefs, 20),
      ...stringArrayValue(result?.targetSkillRefs, 20),
      ...(stringValue(candidateRecord?.targetSkillRef)
        ? [stringValue(candidateRecord?.targetSkillRef) as string]
        : []),
    ].slice(0, 20),
    modelRefs: [
      ...stringArrayValue(result?.modelRefs, 20),
      ...(stringValue(candidateRecord?.modelRef)
        ? [stringValue(candidateRecord?.modelRef) as string]
        : []),
    ].slice(0, 20),
    modelTaskRefs,
    dbOperationRefs,
    validationRefs,
    reviewRefs,
    candidateArtifactRefs,
    closeoutRefs: closeout ? [closeout.uri] : stringArrayValue(result?.closeoutRefs, 20),
    limitations,
    eli5Progress,
    nextAction,
    skillFileEdited: false,
    lifecycleTruthSource: "runtime_job",
    artifactRefs: [
      ...(adapter ? [adapter.uri] : []),
      ...(candidate ? [candidate.uri] : []),
      ...(closeout ? [closeout.uri] : []),
    ].slice(0, 20),
    reasonCodes,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawDbRowsStored: false,
    workQueueLifecycleMutationAllowed: false,
  };
}

function middlewareProjection(
  job: RuntimeJob,
  artifacts: RuntimeJobArtifact[],
): WorkQueueRuntimeMiddlewareProjection {
  const payload = asRecord(job.payload);
  const result = asRecord(job.result);
  const modelArtifacts = artifacts
    .filter((artifact) => artifact.artifactType.startsWith("model_task."))
    .map((artifact) => artifact.uri)
    .slice(0, 10);
  const modelRuntimeToolInvocationRefs = artifacts
    .filter((artifact) => artifact.artifactType === "model_task.runtime_tool_trace")
    .flatMap((artifact) => {
      const metadata = asRecord(artifact.metadata);
      return stringValue(metadata?.invocationRef)
        ? [stringValue(metadata?.invocationRef) as string]
        : [];
    })
    .slice(0, 10);
  const scriptArtifacts = artifacts
    .filter((artifact) => artifact.artifactType.startsWith("script_job."))
    .map((artifact) => artifact.uri)
    .slice(0, 10);
  const scriptRuntimeToolInvocationRefs = artifacts
    .filter((artifact) => artifact.artifactType === "script_job.runtime_tool_trace")
    .flatMap((artifact) => {
      const metadata = asRecord(artifact.metadata);
      return stringValue(metadata?.invocationRef)
        ? [stringValue(metadata?.invocationRef) as string]
        : [];
    })
    .slice(0, 10);
  const dbArtifacts = artifacts
    .filter((artifact) => artifact.artifactType.startsWith("db_operation."))
    .map((artifact) => artifact.uri)
    .slice(0, 10);
  const dbRuntimeToolInvocationRefs = artifacts
    .filter((artifact) => artifact.artifactType === "db_operation.runtime_tool_trace")
    .flatMap((artifact) => {
      const metadata = asRecord(artifact.metadata);
      return stringValue(metadata?.invocationRef)
        ? [stringValue(metadata?.invocationRef) as string]
        : [];
    })
    .slice(0, 10);
  const modelTaskPayload = payload?.family === "model_task" ? payload : null;
  const modelTaskResult = result?.family === "model_task" ? result : null;
  const scriptPayload = payload?.family === "script_job" ? payload : null;
  const scriptResult = result?.family === "script_job" ? result : null;
  const dbPayload = payload?.family === "db_operation" ? payload : null;
  const routeEvidence =
    asRecord(modelTaskResult?.routeEvidence) ?? asRecord(modelTaskPayload?.routeEvidence);
  const validation = asRecord(modelTaskResult?.validation);
  const outputValidation = asRecord(validation?.output);
  const classification = asRecord(dbPayload?.classification);
  return {
    artifactKind: "work_queue_runtime_middleware_projection",
    modelTask: {
      state: modelTaskPayload ? (job.state === "failed" ? "failed" : "present") : "unknown",
      contractId: stringValue(modelTaskPayload?.contractId),
      validationState:
        outputValidation?.ok === true
          ? "passed"
          : outputValidation?.ok === false
            ? "failed"
            : "unknown",
      providerCallMade: booleanValue(routeEvidence?.providerCallMade),
      runtimeToolInvocationRefs: modelRuntimeToolInvocationRefs,
      artifactRefs: modelArtifacts,
    },
    scriptJob: {
      state: scriptPayload ? (job.state === "failed" ? "failed" : "present") : "unknown",
      scriptId: stringValue(scriptPayload?.scriptId),
      lane: stringValue(scriptPayload?.lane),
      exitCode: numberValue(scriptResult?.exitCode),
      shellExecutionAllowed: false,
      runtimeToolInvocationRefs: scriptRuntimeToolInvocationRefs,
      artifactRefs: scriptArtifacts,
    },
    dbOperation: {
      state: dbPayload ? (job.state === "failed" ? "failed" : "present") : "unknown",
      operationName: stringValue(dbPayload?.operationName),
      operationKind: stringValue(dbPayload?.operationKind),
      lane: stringValue(dbPayload?.lane),
      decision: stringValue(classification?.decision),
      runtimeToolInvocationRefs: dbRuntimeToolInvocationRefs,
      rawRowsStored: false,
      artifactRefs: dbArtifacts,
    },
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    rawDbRowsStored: false,
    authorityGranted: false,
    workQueueLifecycleMutationAllowed: false,
  };
}

function agentTeamProjection(
  evidence: AgentTeamRuntimeEvidence | null,
  artifacts: RuntimeJobArtifact[],
): WorkQueueExecutionRuntimeJobReadModel["agentTeam"] {
  const completedRoles =
    evidence?.roleAssignments
      .filter((assignment) => assignment.status === "completed")
      .map((assignment) => assignment.roleId) ?? [];
  const needsReviewRoles =
    evidence?.roster
      .filter((entry) => entry.status === "needs_review")
      .map((entry) => entry.roleId) ?? [];
  const blockedRoles =
    evidence?.roster.filter((entry) => entry.status === "blocked").map((entry) => entry.roleId) ??
    [];
  const assignedRoles = new Set(evidence?.roleAssignments.map((assignment) => assignment.roleId));
  const pendingRoles =
    evidence?.roster
      .filter((entry) => !assignedRoles.has(entry.roleId) && entry.status === "allowed")
      .map((entry) => entry.roleId) ?? [];
  const latestHandoff = evidence?.handoffHistory.at(-1) ?? null;
  const extraArtifactRefs = artifacts
    .filter((artifact) => artifact.artifactType.startsWith("agent_team."))
    .map((artifact) => artifact.uri)
    .slice(0, 20);
  const streamSummary = latestAgentTeamStreamSummary(artifacts);
  const accountingSummary = latestModelRunAccountingSummary(artifacts);
  const providerReliability = artifacts.findLast(
    (artifact) => artifact.artifactType === "agent_team.provider_reliability_summary",
  );
  const providerReliabilityRecord =
    providerReliability?.metadata && typeof providerReliability.metadata === "object"
      ? (providerReliability.metadata as unknown as ProviderReliabilitySummary)
      : null;
  const recovery = latestAgentTeamFailureRecovery(artifacts);
  const securityReview = artifacts.findLast(
    (artifact) => artifact.artifactType === "agent_team.security_privacy_review",
  );
  const securityReviewRecord = asRecord(securityReview?.metadata);
  const resultReview = latestAgentTeamResultReviewArtifact(artifacts);
  const closeoutCapsuleArtifact = artifacts.findLast(
    (artifact) => artifact.artifactType === "execution_platform.closeout_capsule",
  );
  const taskGraphArtifact = artifacts.findLast(
    (artifact) => artifact.artifactType === "agent_team.coding_real_work_task_graph",
  );
  const taskGraphRecord = asRecord(taskGraphArtifact?.metadata);
  const dynamicTaskGraphArtifact = artifacts.findLast(
    (artifact) => artifact.artifactType === "agent_team.dynamic_orchestrator_plan",
  );
  const dynamicTaskGraphRecord = asRecord(dynamicTaskGraphArtifact?.metadata);
  const dynamicTaskGraphPlan = asRecord(dynamicTaskGraphRecord?.plan);
  const dynamicTaskGraphNodes = Array.isArray(dynamicTaskGraphPlan?.childTasks)
    ? dynamicTaskGraphPlan.childTasks
    : [];
  const dynamicGraphReadback = buildDynamicGraphReadback({
    artifacts,
    evidence,
    dynamicTaskGraphNodes,
  });
  const kimiImplementation = latestKimiImplementationReadback(artifacts);
  const dynamicTaskGraphReasonCodes = [
    ...stringArrayValue(dynamicTaskGraphRecord?.reasonCodes, 10),
    ...stringArrayValue(dynamicTaskGraphPlan?.reasonCodes, 10),
  ].slice(0, 20);
  const closeoutQualityState =
    resultReview?.accepted === true
      ? "accepted"
      : resultReview?.needsReview === true
        ? "needs_review"
        : resultReview
          ? "needs_review"
          : "missing";
  const roleExecutionByRole = new Map(
    (evidence?.roleExecutionEvidence ?? []).map((item) => [item.roleId, item]),
  );
  const roleCloseoutsByRole = new Map(
    closeoutCapsuleArtifact &&
      typeof closeoutCapsuleArtifact.metadata === "object" &&
      closeoutCapsuleArtifact.metadata !== null &&
      Array.isArray((closeoutCapsuleArtifact.metadata as { roleCloseouts?: unknown }).roleCloseouts)
      ? (
          closeoutCapsuleArtifact.metadata as { roleCloseouts: Array<Record<string, unknown>> }
        ).roleCloseouts
          .filter((item) => item && typeof item === "object")
          .map((item) => [stringValue(item.roleId) ?? "unknown", item] as const)
      : [],
  );
  const roleReports = (evidence?.roleAssignments ?? []).map((assignment) => {
    const roleExecution = roleExecutionByRole.get(assignment.roleId);
    const roleCloseout = roleCloseoutsByRole.get(assignment.roleId);
    return {
      roleId: assignment.roleId,
      modelId: assignment.modelId,
      status: assignment.status,
      whatRoleDid:
        stringValue(roleCloseout?.actuallyDid) ??
        stringValue(roleCloseout?.whatIActuallyDid) ??
        roleContributionSummary(assignment.roleId, assignment.status),
      transportKind: roleExecution?.transportKind ?? null,
      modelRunRef: roleExecution?.modelRunRef ?? stringValue(roleCloseout?.modelRunRef),
      producedArtifactRefs: roleExecution?.producedArtifactRefs.slice(0, 10) ?? [],
      roleCloseoutState: roleCloseout ? (stringValue(roleCloseout.source) ?? "present") : "missing",
    };
  });
  const blockers = [
    ...(streamSummary?.blockerReasonCodes ?? []),
    ...(recovery?.outcome === "needs_review" || recovery?.outcome === "blocked"
      ? [recovery.needsReviewReason ?? recovery.failureKind]
      : []),
    ...(evidence?.validationState === "failed" ? ["validation_failed"] : []),
    ...(evidence?.closeoutState !== "present" && evidence ? ["closeout_missing"] : []),
    ...(closeoutQualityState !== "accepted" && evidence
      ? ["task_specific_closeout_needs_review"]
      : []),
  ].slice(0, 20);
  return {
    agentTeamRunId: evidence?.teamRunId ?? null,
    currentTeamState:
      evidence?.validationState === "passed" && evidence.closeoutState === "present"
        ? "completed"
        : evidence
          ? evidence.handoffState
          : "unknown",
    activeRole: evidence?.activeRole ?? null,
    completedRoles,
    pendingRoles,
    blockedRoles,
    needsReviewRoles,
    latestHandoff: latestHandoff?.handoffId ?? null,
    handoffCount: evidence?.handoffHistory.length ?? 0,
    validationState: evidence?.validationState ?? "unknown",
    reviewState: evidence?.reviewState ?? "unknown",
    closeoutState: evidence?.closeoutState ?? "unknown",
    authorityStatus: evidence?.authorityStatus ?? "unknown",
    permissionEvidence: evidence?.permissionEvidence ?? null,
    modelReadiness: modelReadinessFromTeamEvidence(evidence),
    teamStreamSummary: {
      eventCount: streamSummary?.eventCount ?? 0,
      latestSummary: streamSummary?.latestSummary ?? null,
      blockerReasonCodes: streamSummary?.blockerReasonCodes ?? [],
    },
    modelAccountingSummary: {
      runCount: accountingSummary?.runCount ?? 0,
      totalLatencyMs: accountingSummary?.totalLatencyMs ?? 0,
      totalTokenCount: accountingSummary?.totalTokenCount ?? null,
      estimatedCostUsd: accountingSummary?.estimatedCostUsd ?? null,
      providerUsageComplete: accountingSummary?.providerUsageComplete ?? false,
      costSource: accountingSummary?.costSource,
    },
    providerReliabilitySummary: {
      perModel: providerReliabilityRecord?.perModel ?? [],
      sourceArtifactRefs: providerReliabilityRecord?.sourceArtifactRefs ?? [],
    },
    taskGraph: {
      graphId:
        stringValue(dynamicTaskGraphRecord?.graphId) ?? stringValue(taskGraphRecord?.graphId),
      state:
        taskGraphArtifact || dynamicTaskGraphArtifact
          ? "present"
          : evidence
            ? "missing"
            : "unknown",
      requiredSourceEdit:
        booleanValue(taskGraphRecord?.requiredSourceEdit) ??
        dynamicTaskGraphNodes.some((node) => asRecord(node)?.actionKind === "coding"),
      nodeCount: Math.max(
        dynamicGraphReadback.nodeCount,
        Array.isArray(taskGraphRecord?.nodes) ? taskGraphRecord.nodes.length : 0,
      ),
      edgeCount: dynamicGraphReadback.edgeCount,
      repeatedRoleInvocationCount: dynamicGraphReadback.repeatedRoleInvocationCount,
      activeWorker: dynamicGraphReadback.activeWorker,
      lastWorker: dynamicGraphReadback.lastWorker,
      currentStage: dynamicGraphReadback.currentStage,
      repairAttemptCount: dynamicGraphReadback.repairAttemptCount,
      humanDecisionPresent: dynamicGraphReadback.humanDecisionPresent,
      closeoutState:
        evidence?.closeoutState === "present" ? "present" : dynamicGraphReadback.closeoutState,
      finalState: dynamicGraphReadback.finalState,
      artifactRef: dynamicTaskGraphArtifact?.uri ?? taskGraphArtifact?.uri ?? null,
      nodes: dynamicGraphReadback.nodes,
      kimiImplementation,
      reasonCodes: taskGraphArtifact
        ? stringArrayValue(taskGraphRecord?.reasonCodes, 20)
        : dynamicTaskGraphReasonCodes,
    },
    securityReviewState:
      stringValue(securityReviewRecord?.reviewKind) ??
      (securityReview ? "present" : evidence ? "missing" : "unknown"),
    failureRecoveryState: recovery?.outcome ?? "none",
    roleReports,
    closeoutQuality: {
      state: closeoutQualityState,
      goalSatisfaction: resultReview?.goalSatisfaction ?? null,
      limitations: resultReview?.limitations ?? [],
      requiredFixes: resultReview?.requiredFixes ?? [],
    },
    closeoutCapsule: closeoutCapsuleArtifact?.metadata ?? null,
    humanCloseoutSummary: resultReview?.humanCloseoutSummary ?? null,
    blockers,
    artifactRefs: [...(evidence?.artifactRefs ?? []), ...extraArtifactRefs].slice(0, 30),
    lifecycleTruthSource: "runtime_job_artifacts",
    workQueueLifecycleMutationAllowed: false,
  };
}

function roleContributionSummary(roleId: string, status: string): string {
  const suffix = status === "completed" ? "completed its bounded lane" : `ended ${status}`;
  switch (roleId) {
    case "implementation_engineer":
      return `Implementation engineer ${suffix}: proposed or made bounded local work within workflow scope.`;
    case "test_engineer":
      return `Test engineer ${suffix}: checked focused validation evidence.`;
    case "reviewer":
      return `Reviewer ${suffix}: reviewed result evidence and limitations.`;
    case "context_scout":
      return `Context scout ${suffix}: identified bounded files, patterns, risks, and constraints.`;
    case "observability_scribe":
      return `Observability scribe ${suffix}: recorded closeout and readback evidence.`;
    case "guardrail_auditor":
      return `Guardrail auditor ${suffix}: checked safety and storage boundaries.`;
    default:
      return `${roleId} ${suffix}.`;
  }
}

function linkedRuntimeJobIds(truth: WorkItemTruth): string[] {
  const ids = new Set<string>();
  if (truth.item.closedByRuntimeJobId) {
    ids.add(truth.item.closedByRuntimeJobId);
  }
  const recentRuns = truth.runs.slice(-20);
  for (const run of recentRuns) {
    if (run.runtimeJobId) {
      ids.add(run.runtimeJobId);
    }
  }
  const recentSteps = truth.steps.slice(-40);
  for (const step of recentSteps) {
    if (step.runtimeJobId) {
      ids.add(step.runtimeJobId);
    }
  }
  return [...ids].toSorted();
}

function runForJob(truth: WorkItemTruth, runtimeJobId: string): WorkRun | undefined {
  return truth.runs.find((run) => run.runtimeJobId === runtimeJobId);
}

function isSkillifierWorkflow(
  workflowId: string | null | undefined,
  jobType: string | null | undefined,
  workflowExtension: JsonValue,
  modelTaskContractId: string | null | undefined,
): boolean {
  const extensionRecord =
    workflowExtension && typeof workflowExtension === "object" && !Array.isArray(workflowExtension)
      ? (workflowExtension as Record<string, JsonValue>)
      : null;
  const extensionKind = stringValue(extensionRecord?.extensionKind);
  return (
    Boolean(workflowId?.includes("skillifier")) ||
    Boolean(jobType?.includes("skillifier")) ||
    Boolean(extensionKind?.includes("skillifier")) ||
    modelTaskContractId === "skillifier.structured_json"
  );
}

function boundedUniqueStringValues(values: Array<string | null | undefined>, limit = 10): string[] {
  const refs = new Set<string>();
  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) {
      continue;
    }
    refs.add(normalized);
    if (refs.size >= limit) {
      break;
    }
  }
  return [...refs];
}

function uniqueStringCount(values: Array<string | null | undefined>): number {
  const refs = new Set<string>();
  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) {
      continue;
    }
    refs.add(normalized);
  }
  return refs.size;
}

function normalizeOpportunityStateToken(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function buildProactivityOpportunityProjection(input: {
  opportunitySeedRefs: string[];
  capsuleRefs: string[];
  artifactRefs: string[];
  modelTaskRefs: string[];
  dbOperationRefs: string[];
  reviewRefs: string[];
  reasonCodes: string[];
  outcomeState?: string | null;
  reviewState?: string | null;
  candidateId?: string | null;
  limitations?: string[];
  eli5Status?: string | null;
  staleSignal?: boolean;
}): WorkQueueProactivityOpportunityProjection | null {
  if (
    input.opportunitySeedRefs.length === 0 &&
    input.capsuleRefs.length === 0 &&
    input.artifactRefs.length === 0 &&
    input.modelTaskRefs.length === 0 &&
    input.dbOperationRefs.length === 0 &&
    input.reviewRefs.length === 0 &&
    input.reasonCodes.length === 0 &&
    !input.candidateId
  ) {
    return null;
  }
  const stateSignals = [
    normalizeOpportunityStateToken(input.outcomeState),
    normalizeOpportunityStateToken(input.reviewState),
    ...input.reasonCodes.map((value) => normalizeOpportunityStateToken(value)),
  ].filter(Boolean);
  const combinedSignals = stateSignals.join(" ");
  const state: WorkQueueProactivityOpportunityProjection["state"] = input.staleSignal
    ? "stale"
    : /\bduplicate\b|\bdedup/u.test(combinedSignals)
      ? "duplicate_suppressed"
      : /\bstale\b|\bexpired\b/u.test(combinedSignals)
        ? "stale"
        : /\bblocked\b/u.test(combinedSignals)
          ? "blocked"
          : /\bneeds_review\b|\bhuman_review\b|\breview_required\b/u.test(combinedSignals)
            ? "needs_review"
            : /\baccepted\b|\bapproved\b|\bcandidate_ready\b|\bsatisfied\b|\benqueued\b/u.test(
                  combinedSignals,
                ) || Boolean(input.candidateId && input.modelTaskRefs.length > 0)
              ? "accepted"
              : input.reviewRefs.length > 0 || Boolean(input.reviewState)
                ? "reviewed"
                : input.opportunitySeedRefs.length > 0 || input.capsuleRefs.length > 0
                  ? "captured"
                  : "unknown";
  const defaultEli5 =
    state === "accepted"
      ? "OpenClaw captured the opportunity and produced bounded follow-up evidence."
      : state === "reviewed"
        ? "OpenClaw captured the opportunity and left a bounded review trail."
        : state === "duplicate_suppressed"
          ? "OpenClaw saw the same opportunity again and reused the existing trail."
          : state === "stale"
            ? "OpenClaw found the opportunity, but the evidence is stale and needs a refresh."
            : state === "blocked"
              ? "OpenClaw captured the opportunity, but a guardrail blocked follow-up."
              : state === "needs_review"
                ? "OpenClaw captured the opportunity, but a human should review the next step."
                : state === "captured"
                  ? "OpenClaw captured the opportunity and stored only bounded breadcrumbs."
                  : "OpenClaw recorded bounded opportunity breadcrumbs.";
  return {
    artifactKind: "work_queue_proactivity_opportunity_projection",
    state,
    capsuleRefs: input.capsuleRefs.slice(0, 10),
    artifactRefs: input.artifactRefs.slice(0, 10),
    modelTaskRefs: input.modelTaskRefs.slice(0, 10),
    dbOperationRefs: input.dbOperationRefs.slice(0, 10),
    reviewRefs: input.reviewRefs.slice(0, 10),
    reasonCodes: input.reasonCodes.slice(0, 10),
    eli5Status: input.eli5Status?.slice(0, 240) ?? defaultEli5,
    limitations: (input.limitations ?? []).slice(0, 10),
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutationAllowed: false,
  };
}

function skillifierRuntimeReadback(
  latestRuntimeJob: WorkQueueExecutionReadModel["runtimeJobs"][number] | undefined,
): JsonValue | null {
  if (!latestRuntimeJob) {
    return null;
  }
  const workflowExtension = latestRuntimeJob.workflow.extension;
  const extensionRecord =
    workflowExtension && typeof workflowExtension === "object" && !Array.isArray(workflowExtension)
      ? (workflowExtension as Record<string, JsonValue>)
      : null;
  const extensionSkillifier = asRecord(extensionRecord?.skillifier);
  if (
    !isSkillifierWorkflow(
      latestRuntimeJob.workflow.workflowId,
      latestRuntimeJob.workflow.jobType,
      workflowExtension,
      latestRuntimeJob.middleware.modelTask.contractId,
    )
  ) {
    return null;
  }
  const humanCloseoutSummary =
    latestRuntimeJob.humanCloseoutSummary &&
    typeof latestRuntimeJob.humanCloseoutSummary === "object"
      ? (latestRuntimeJob.humanCloseoutSummary as Record<string, JsonValue>)
      : null;
  const closeoutCapsule =
    latestRuntimeJob.closeoutCapsule &&
    typeof latestRuntimeJob.closeoutCapsule === "object" &&
    !Array.isArray(latestRuntimeJob.closeoutCapsule)
      ? (latestRuntimeJob.closeoutCapsule as Record<string, JsonValue>)
      : null;
  const factualRefs = asRecord(closeoutCapsule?.factualRefs);
  const opportunitySeeds = Array.isArray(closeoutCapsule?.opportunitySeeds)
    ? closeoutCapsule.opportunitySeeds.map((entry) => asRecord(entry)).filter(Boolean)
    : [];
  const artifactRefs = latestRuntimeJob.artifactRefs;
  const closeoutCapsuleRefFromArtifacts = artifactRefs.find((ref) =>
    ref.includes("/closeout-capsule/"),
  );
  const reviewRefsFromArtifacts = artifactRefs.filter(
    (ref) =>
      ref.startsWith("review://") || ref.includes("/review/") || ref.includes("result_review"),
  );
  const validationRefsFromArtifacts = artifactRefs.filter(
    (ref) =>
      ref.startsWith("validation://") ||
      ref.includes("/validation/") ||
      ref.includes("model-task/validation"),
  );
  const fallbackCloseoutCapsuleRef =
    closeoutCapsuleRefFromArtifacts ??
    (stringValue(factualRefs?.runtimeJobId) && stringValue(closeoutCapsule?.capsuleId)
      ? `runtime-job://${stringValue(factualRefs?.runtimeJobId)}/closeout-capsule/${stringValue(closeoutCapsule?.capsuleId)}`
      : null);
  const opportunitySeedRefCandidates = [
    stringValue(extensionRecord?.opportunitySeedRef),
    stringValue(extensionSkillifier?.opportunitySeedRef),
    ...stringArrayValue(extensionRecord?.opportunitySeedRefs, 10),
    ...stringArrayValue(extensionSkillifier?.opportunitySeedRefs, 10),
    ...latestRuntimeJob.skillifier.opportunitySeedRefs,
    stringValue(extensionRecord?.sourceOpportunityRef),
    ...opportunitySeeds.map((seed) => stringValue(seed?.seedId)),
  ];
  const opportunitySeedRefs = boundedUniqueStringValues(opportunitySeedRefCandidates, 10);
  const opportunitySeedRef = opportunitySeedRefs[0] ?? null;
  const closeoutCapsuleRefCandidates = [
    stringValue(extensionRecord?.closeoutCapsuleRef),
    stringValue(extensionSkillifier?.closeoutCapsuleRef),
    ...stringArrayValue(extensionRecord?.closeoutCapsuleRefs, 10),
    ...stringArrayValue(extensionSkillifier?.closeoutCapsuleRefs, 10),
    ...latestRuntimeJob.skillifier.closeoutCapsuleRefs,
    fallbackCloseoutCapsuleRef,
    latestRuntimeJob.ownerReadback.capsuleId,
  ];
  const closeoutCapsuleRefs = boundedUniqueStringValues(closeoutCapsuleRefCandidates, 10);
  const closeoutCapsuleRef = closeoutCapsuleRefs[0] ?? null;
  const closeoutCapsuleHash =
    stringValue(extensionRecord?.closeoutCapsuleHash) ??
    stringValue(extensionSkillifier?.closeoutCapsuleHash) ??
    latestRuntimeJob.ownerReadback.capsuleHash;
  const candidateId =
    stringValue(extensionRecord?.candidateId) ?? stringValue(extensionSkillifier?.candidateId);
  const candidateType =
    stringValue(extensionRecord?.candidateType) ?? stringValue(extensionSkillifier?.candidateType);
  const outcomeState =
    stringValue(extensionRecord?.outcomeState) ??
    stringValue(extensionSkillifier?.outcomeState) ??
    latestRuntimeJob.ownerReadback.taskSuccess ??
    latestRuntimeJob.workflow.reviewState;
  const roleRefs = boundedUniqueStringValues(
    [
      ...stringArrayValue(extensionRecord?.roleRefs, 10),
      ...stringArrayValue(extensionSkillifier?.roleRefs, 10),
      ...latestRuntimeJob.agentTeam.roleReports.map((report) => `role://${report.roleId}`),
    ],
    10,
  );
  const roleModelRefs = latestRuntimeJob.agentTeam.roleReports
    .filter((report) => report.modelId.trim().length > 0)
    .map((report) => ({
      roleId: report.roleId,
      modelId: report.modelId,
      modelRunRef: report.modelRunRef ?? null,
      status: report.status,
    }))
    .slice(0, 10);
  const modelRefCandidates = [
    ...stringArrayValue(extensionRecord?.modelRefs, 10),
    ...stringArrayValue(extensionSkillifier?.modelRefs, 10),
    ...latestRuntimeJob.skillifier.modelRefs,
    ...latestRuntimeJob.agentTeam.roleReports.map((report) => report.modelId),
    stringValue(closeoutCapsule?.modelRef),
  ];
  const modelRefs = boundedUniqueStringValues(modelRefCandidates, 10);
  const modelTaskRefs = latestRuntimeJob.middleware.modelTask.artifactRefs.slice(0, 10);
  const dbOperationRefs = latestRuntimeJob.middleware.dbOperation.artifactRefs.slice(0, 10);
  const validationRefCandidates = [
    ...stringArrayValue(extensionRecord?.validationRefs, 10),
    ...stringArrayValue(extensionSkillifier?.validationRefs, 10),
    ...latestRuntimeJob.skillifier.validationRefs,
    ...stringArrayValue(factualRefs?.validationRefs, 10),
    ...validationRefsFromArtifacts,
    ...latestRuntimeJob.middleware.modelTask.artifactRefs.filter((ref) =>
      ref.includes("model-task/validation"),
    ),
  ];
  const validationRefs = boundedUniqueStringValues(validationRefCandidates, 10);
  const reviewRefCandidates = [
    ...stringArrayValue(extensionRecord?.reviewRefs, 10),
    ...stringArrayValue(extensionSkillifier?.reviewRefs, 10),
    ...latestRuntimeJob.skillifier.reviewRefs,
    ...reviewRefsFromArtifacts,
  ];
  const reviewRefs = boundedUniqueStringValues(reviewRefCandidates, 10);
  const closeoutCapsuleRefsWithHash = boundedUniqueStringValues(
    [
      ...closeoutCapsuleRefs,
      closeoutCapsuleHash && closeoutCapsuleRef
        ? `${closeoutCapsuleRef}#${closeoutCapsuleHash}`
        : null,
    ],
    10,
  );
  const limitations = [
    ...stringArrayValue(extensionRecord?.limitations, 10),
    ...stringArrayValue(extensionSkillifier?.limitations, 10),
    ...latestRuntimeJob.ownerReadback.limitations,
    ...stringArrayValue(humanCloseoutSummary?.limitations, 10),
  ].slice(0, 10);
  const eli5Progress =
    stringValue(extensionRecord?.eli5Progress) ??
    stringValue(extensionSkillifier?.eli5Progress) ??
    latestRuntimeJob.ownerReadback.eli5Progress ??
    stringValue(humanCloseoutSummary?.eli5Progress);
  const reasonCodes = boundedUniqueStringValues(
    [
      ...stringArrayValue(extensionRecord?.reasonCodes, 10),
      ...stringArrayValue(extensionSkillifier?.reasonCodes, 10),
      ...latestRuntimeJob.skillifier.reasonCodes,
      ...latestRuntimeJob.workflow.blockerReasonCodes,
      latestRuntimeJob.reviewStatus,
      latestRuntimeJob.runtimeJobState === "failed" ? "runtime_job_failed" : null,
    ],
    10,
  );
  return {
    runtimeJobId: latestRuntimeJob.runtimeJobId,
    opportunity:
      latestRuntimeJob.skillifier.opportunity ??
      buildProactivityOpportunityProjection({
        opportunitySeedRefs,
        capsuleRefs: closeoutCapsuleRefsWithHash,
        artifactRefs: latestRuntimeJob.skillifier.artifactRefs,
        modelTaskRefs,
        dbOperationRefs,
        reviewRefs,
        reasonCodes,
        outcomeState,
        reviewState: latestRuntimeJob.skillifier.reviewState,
        candidateId,
        limitations,
        eli5Status: eli5Progress,
        staleSignal: latestRuntimeJob.staleHeartbeat,
      }),
    opportunitySeedRef,
    opportunitySeedRefs,
    closeoutCapsuleRef,
    closeoutCapsuleRefs: closeoutCapsuleRefsWithHash,
    closeoutCapsuleHash,
    candidateId,
    candidateType,
    outcomeState,
    targetSkillRef:
      stringValue(extensionRecord?.targetSkillRef) ??
      stringValue(extensionSkillifier?.targetSkillRef),
    targetSkillPath:
      stringValue(extensionRecord?.targetSkillPath) ??
      stringValue(extensionSkillifier?.targetSkillPath),
    candidateApplied:
      booleanValue(extensionRecord?.candidateApplied) ??
      booleanValue(extensionSkillifier?.candidateApplied) ??
      false,
    modelRefs,
    roleRefs,
    roleModelRefs,
    modelTaskRefs,
    dbOperationRefs,
    validationRefs,
    reviewRefs,
    opportunitySeedQuality: {
      state:
        opportunitySeedRefs.length > 0 &&
        closeoutCapsuleRefsWithHash.length > 0 &&
        roleRefs.length > 0 &&
        modelRefs.length > 0 &&
        validationRefs.length > 0
          ? "ready"
          : opportunitySeedRefs.length === 0 &&
              closeoutCapsuleRefsWithHash.length === 0 &&
              roleRefs.length === 0 &&
              modelRefs.length === 0 &&
              validationRefs.length === 0
            ? "missing"
            : "partial",
      reasonCodes: boundedUniqueStringValues(
        [
          opportunitySeedRefs.length > 0 ? null : "opportunity_seed_refs_missing",
          closeoutCapsuleRefsWithHash.length > 0 ? null : "closeout_capsule_refs_missing",
          roleRefs.length > 0 ? null : "role_refs_missing",
          modelRefs.length > 0 ? null : "model_refs_missing",
          validationRefs.length > 0 ? null : "validation_refs_missing",
        ],
        10,
      ),
      seedRefCount: opportunitySeedRefs.length,
      closeoutCapsuleRefCount: closeoutCapsuleRefsWithHash.length,
      roleRefCount: roleRefs.length,
      modelRefCount: modelRefs.length,
      validationRefCount: validationRefs.length,
      boundedValidationEvidence:
        validationRefs.length > 0
          ? "present"
          : (latestRuntimeJob.workflow.validationState ?? "unknown"),
    },
    validationEvidence: {
      state:
        validationRefs.length > 0
          ? "present"
          : latestRuntimeJob.workflow.validationState === "failed"
            ? "failed"
            : latestRuntimeJob.workflow.validationState === "needs_review"
              ? "needs_review"
              : "missing",
      refs: validationRefs,
      refCount: validationRefs.length,
      refLimit: 10,
      truncated: uniqueStringCount(validationRefCandidates) > validationRefs.length,
      reviewRefCount: reviewRefs.length,
      reviewRefLimit: 10,
      reviewRefs,
      reviewRefsTruncated: uniqueStringCount(reviewRefCandidates) > reviewRefs.length,
    },
    limitations,
    eli5Progress,
    nextAction:
      stringValue(extensionRecord?.nextAction) ??
      stringValue(extensionSkillifier?.nextAction) ??
      stringValue(opportunitySeeds[0]?.recommendedNextStep) ??
      stringValue(humanCloseoutSummary?.nextStep) ??
      null,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    workQueueLifecycleMutationAllowed: false,
  };
}

export async function buildWorkQueueExecutionReadModel(input: {
  workQueue: WorkQueueRepository;
  runtimeJobs: RuntimeJobRepository;
  workItemId: string;
  now?: Date;
}): Promise<WorkQueueExecutionReadModel> {
  const truth = await input.workQueue.readWorkItemTruth(input.workItemId);
  if (!truth) {
    throw new Error(`work item not found: ${input.workItemId}`);
  }
  const runtimeGraphChildTruths = await input.workQueue.readRuntimeGraphChildTruths(
    input.workItemId,
    20,
  );
  const runtimeGraph = buildRuntimeGraphReadback(truth, runtimeGraphChildTruths);
  const now = input.now ?? new Date();
  const jobIds = linkedRuntimeJobIds(truth);
  const runtimeJobs: WorkQueueExecutionRuntimeJobReadModel[] = [];
  for (const runtimeJobId of jobIds) {
    const job = await input.runtimeJobs.getJob(runtimeJobId);
    if (!job) {
      continue;
    }
    const artifacts = await input.runtimeJobs.listArtifacts(runtimeJobId);
    const earlyEvents = await input.runtimeJobs.listEvents(runtimeJobId, 250);
    const recentEvents = await input.runtimeJobs.listRecentEvents(runtimeJobId, 250);
    const seenEventIds = new Set<string>();
    const events = [...earlyEvents, ...recentEvents].filter((event) => {
      if (seenEventIds.has(event.eventId)) {
        return false;
      }
      seenEventIds.add(event.eventId);
      return true;
    });
    const teamEvidence = latestAgentTeamRuntimeEvidence(artifacts);
    const webResearchEvidence = latestWebResearchRuntimeEvidence(artifacts);
    const streamEvents = events.filter((event) => event.eventType.includes("stream_event"));
    const heartbeat = events.findLast((event) => event.eventType.includes("heartbeat"));
    const latestStreamSummaryEvent = streamEvents.findLast((event) => {
      const data = asRecord(event.data);
      return Boolean(
        stringValue(asRecord(data?.normalized)?.summary) ?? stringValue(data?.summary),
      );
    });
    const latestStreamSummaryData = latestStreamSummaryEvent
      ? asRecord(latestStreamSummaryEvent.data)
      : null;
    const latestStreamSummary =
      latestStreamSummaryData === null
        ? null
        : (stringValue(asRecord(latestStreamSummaryData.normalized)?.summary) ??
          stringValue(latestStreamSummaryData.summary));
    const liveResult = latestArtifact(artifacts, "codex_bridge.code_writing_pilot_live_result");
    const validation = latestArtifact(
      artifacts,
      "codex_bridge.code_writing_pilot_validation_report",
    );
    const closeout =
      artifacts.find((artifact) => artifact.artifactType.includes("work_episode_outcome_pack")) ??
      artifacts.find((artifact) => artifact.artifactType.includes("work_episode"));
    const fileScope = latestArtifact(
      artifacts,
      "codex_bridge.code_writing_pilot_file_scope_report",
    );
    const control = latestArtifact(artifacts, "codex_bridge.control_command_history");
    const rebuild = latestArtifact(artifacts, "codex_bridge.rebuild_command_result");
    const review = latestArtifact(artifacts, "codex_bridge.result_review");
    const agentTeamResultReview = latestAgentTeamResultReviewArtifact(artifacts);
    const workflowHumanCloseout = latestArtifact(
      artifacts,
      "workflow_review.human_closeout_summary",
    );
    const closeoutCapsuleArtifact = latestArtifact(
      artifacts,
      "execution_platform.closeout_capsule",
    );
    const liveResultRecord = asRecord(liveResult?.metadata);
    const processRecord = asRecord(liveResultRecord?.processResult);
    const heartbeatAgeMs = heartbeat ? now.getTime() - heartbeat.eventTime.getTime() : null;
    const reviewRecord = asRecord(review?.metadata);
    const workflow = workflowProjection(job, artifacts);
    const ownerReadback = ownerRuntimeReadback(closeoutCapsuleArtifact, artifacts);
    const agentTeam = agentTeamProjection(teamEvidence, artifacts);
    const changedFileRefs = stringArrayValue(liveResultRecord?.actualFilesChanged, 40);
    const validationStatus = metadataStatus(validation, ["status"]);
    const closeoutStatus = closeout ? "present" : "missing";
    runtimeJobs.push({
      runtimeJobId,
      runtimeJobState: job.state,
      executorKind: runForJob(truth, runtimeJobId)?.executorKind ?? job.jobType,
      activeSessionId: stringValue(liveResultRecord?.sessionId),
      streamSummary: {
        eventCount: streamEvents.length,
        latestSummary: latestStreamSummary,
      },
      latestHeartbeat: heartbeat?.eventTime.toISOString() ?? null,
      staleHeartbeat: heartbeatAgeMs !== null && heartbeatAgeMs > 120_000,
      processStatus: stringValue(processRecord?.status),
      validationStatus,
      closeoutStatus,
      fileScopeStatus: metadataStatus(fileScope, ["fileScopeSatisfied"]),
      sourceEditStatus: stringValue(asRecord(liveResultRecord?.sourceEditRequirement)?.reasonCode),
      changedFileRefs,
      completedWorkReasonCode: stringValue(liveResultRecord?.completedWorkPathReason),
      controlCommandState: control ? "present" : null,
      rebuildRecoveryState: metadataStatus(rebuild, ["status"]),
      authorityStatuses: authorityStatusArtifacts(artifacts),
      workflow,
      worker: workerRuntimeProjection(job, artifacts, events),
      runtimeControl: runtimeControlProjection(artifacts),
      permissionReadback: permissionReadbackProjection(job, teamEvidence),
      ownerReadback,
      ownerProgressReadback: ownerProgressReadback({
        job,
        artifacts,
        events,
        ownerReadback,
        agentTeam,
        changedFileRefs,
        validationStatus,
        closeoutStatus,
        workflowId: workflow.workflowId,
      }),
      agentTeam,
      webResearch: webResearchProjection(webResearchEvidence, artifacts),
      skillifier: skillifierProjection(job, artifacts),
      middleware: middlewareProjection(job, artifacts),
      reviewStatus: stringValue(reviewRecord?.qualitativeFinding),
      completedWorkStatus:
        liveResultRecord?.completedWorkPathSatisfied === true
          ? "satisfied"
          : liveResultRecord?.completedWorkPathSatisfied === false
            ? "unsatisfied"
            : "unknown",
      needsReviewStatus:
        reviewRecord?.qualitativeFinding === "needs_review" ||
        reviewRecord?.qualitativeFinding === "human_review_required"
          ? "needs_review"
          : review
            ? "reviewed"
            : "unknown",
      humanCloseoutSummary:
        (agentTeamResultReview?.humanCloseoutSummary as unknown as JsonValue | undefined) ??
        workflowHumanCloseout?.metadata ??
        null,
      closeoutCapsule: closeoutCapsuleArtifact?.metadata ?? null,
      artifactRefs: artifacts.map((artifact) => artifact.uri).slice(0, 30),
    });
  }
  return {
    artifactKind: "work_queue_execution_read_model",
    workItemId: input.workItemId,
    convergenceSlice: projectDbPrimaryWorkQueueItem({ truth }),
    linkedRuntimeJobIds: jobIds,
    runtimeJobs,
    runtimeGraph,
    lifecycleTruthSource: "work_queue_repository",
    executionTruthSource: "execution_platform_runtime_jobs",
    uiMutationAllowed: false,
  };
}

export function summarizeWorkQueueExecutionForUi(model: WorkQueueExecutionReadModel): JsonValue {
  const latestRuntimeJob = model.runtimeJobs.at(-1);
  const workflowExtension = latestRuntimeJob?.workflow.extension;
  const workerContractState =
    workflowExtension && typeof workflowExtension === "object" && !Array.isArray(workflowExtension)
      ? (workflowExtension as Record<string, JsonValue>).workerContractState
      : null;

  return {
    workItemId: model.workItemId,
    convergenceSlice: model.convergenceSlice,
    runtimeJobCount: model.runtimeJobs.length,
    latestRuntimeJobId: latestRuntimeJob?.runtimeJobId ?? null,
    latestRuntimeJobState: latestRuntimeJob?.runtimeJobState ?? "unknown",
    closeoutStatus: latestRuntimeJob?.closeoutStatus ?? "unknown",
    validationStatus: latestRuntimeJob?.validationStatus ?? "unknown",
    reviewStatus: latestRuntimeJob?.reviewStatus ?? "unknown",
    controlCommandState: latestRuntimeJob?.controlCommandState ?? "unknown",
    authorityStatuses: latestRuntimeJob?.authorityStatuses ?? [],
    workflow: latestRuntimeJob?.workflow ?? null,
    worker: latestRuntimeJob?.worker ?? null,
    runtimeControl: latestRuntimeJob?.runtimeControl ?? null,
    permissionReadback: latestRuntimeJob?.permissionReadback ?? null,
    ownerReadback: latestRuntimeJob?.ownerReadback ?? null,
    ownerProgressReadback: latestRuntimeJob?.ownerProgressReadback ?? null,
    routing: latestRuntimeJob?.workflow.routing ?? null,
    agentTeam: latestRuntimeJob?.agentTeam ?? null,
    webResearch: latestRuntimeJob?.webResearch ?? null,
    middleware: latestRuntimeJob?.middleware ?? null,
    closeoutCapsule: latestRuntimeJob?.closeoutCapsule ?? null,
    humanCloseoutSummary: latestRuntimeJob?.humanCloseoutSummary ?? null,
    skillifier: skillifierRuntimeReadback(latestRuntimeJob),
    runtimeGraph: model.runtimeGraph,
    workerContractState: workerContractState ?? null,
    uiMutationAllowed: false,
    lifecycleTruthSource: model.lifecycleTruthSource,
    executionTruthSource: model.executionTruthSource,
  };
}
