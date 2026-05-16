/* @vitest-environment jsdom */

import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import {
  buildDbWorkQueueObjects,
  buildWorkQueueObjects,
  filterWorkQueueObjects,
} from "../work-queue.ts";
import { renderWorkQueue, type WorkQueueProps } from "./work-queue.ts";

type WorkQueueObject = WorkQueueProps["items"][number];
type WorkQueueFilter = WorkQueueProps["filter"];

function makeObject(id: string, overrides: Partial<WorkQueueObject> = {}): WorkQueueObject {
  return {
    id,
    queueItemId: `queue-${id}`,
    queuePosition: null,
    stableTechnicalId: `queue-${id}`,
    opportunityId: id,
    lane: "build_plans",
    objectClass: "proactive_plan",
    title: `Work item ${id}`,
    summary: `Summary ${id}`,
    recommendedNextStep: `Next step ${id}`,
    visibleStatus: "drafted",
    priorityBand: "High",
    manualPriority: "none",
    statusLabel: "Drafted",
    laneLabel: "Build Plans",
    objectClassLabel: "Build plan",
    detailSummary: `Detail summary ${id}`,
    evidenceSummary: `Evidence ${id}`,
    sourceRefs: [`chat://session/${id}`],
    authorityTiers: ["tool_grounded"],
    proofHashes: [`proof-${id}`],
    diagnostics: [],
    artifact: {
      kind: "plan",
      title: `Plan ${id}`,
      body: `Objective\n- ship ${id}\n\nQuestion?\n`,
      summary: `Artifact summary ${id}`,
      codexPrompt: null,
      path: null,
      versionLabel: "Plan draft v1",
      updatedAt: "2026-05-01T00:00:00.000Z",
      openQuestions: ["Should we tighten the scope?"],
    },
    execution: null,
    convergenceSlice: null,
    queueItem: {
      queueItemId: `queue-${id}`,
      candidateId: `candidate-${id}`,
      workItemId: `work-${id}`,
      workItemKind: "planning_request",
      workItemStatus: "planned",
      primaryAction: null,
      secondaryActions: [],
      ctaExplanation: "Review the bounded draft.",
      handoffStatus: "idle",
      handoffError: null,
      handoffMessageAnchor: null,
      plannedArtifact: {
        status: "compiled",
        title: `Plan ${id}`,
        requestSummary: `Request ${id}`,
        compiledPlan: `Compiled plan ${id}`,
        generatedAt: "2026-05-01T00:00:00.000Z",
        updatedAt: "2026-05-01T00:00:00.000Z",
      },
      messageClass: "operator_approved_suggestion_available",
      boundedDisplayText: `Display ${id}`,
      messagePreview: `Preview ${id}`,
      suggestedAction: `Suggested ${id}`,
      candidateSummary: `Candidate ${id}`,
      expectedUserValue: `Expected value ${id}`,
      planTitle: `Plan title ${id}`,
      problem: `Problem ${id}`,
      proposedMessage: `Message ${id}`,
      userBenefit: `Benefit ${id}`,
      evidenceSummary: `Evidence ${id}`,
      confidence: "high",
      blockedIfMissing: [],
      userFacingBrief: {
        title: `Title ${id}`,
        kindLabel: "Follow-up",
        oneLinePurpose: `Purpose ${id}`,
        recommendedNextStep: `Recommended ${id}`,
        primaryActionLabel: "Review",
        detailSummary: `Detail ${id}`,
        hiddenDiagnostics: { provenanceRefs: [], limitations: [] },
        quality: { status: "pass", reasons: [] },
      },
      resolvedByChatMessageId: null,
      supersededByOpportunityId: null,
      dismissalCooldownUntil: null,
      layer: "actionable",
      attentionRequired: true,
      sendStatus: "idle",
      sendError: null,
      sentMessageAnchor: null,
      status: "pending_review",
      eligibleScope: {
        environment: "live",
        userId: "user",
        recipientId: "user",
        projectId: "openclaw",
        sessionKey: "main",
        operatorId: "operator",
        allowedMessageClasses: ["operator_approved_suggestion_available"],
        proofPrerequisiteIds: [],
        proofPrerequisiteHashes: [],
      },
      sourceRefs: [`chat://session/${id}`],
      sourceProfileIds: ["manual_note"],
      authorityTiers: ["tool_grounded"],
      contentHashes: [`content-${id}`],
      proofHashes: [`proof-${id}`],
      noDarkDataStatus: "pass",
      staleLabels: [],
      conflictLabels: [],
      blockedReasonCodes: [],
      generatedAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
    },
    inboxItem: null,
    ...overrides,
  };
}

function createProps(overrides: Partial<WorkQueueProps> = {}): WorkQueueProps {
  return {
    items: [],
    selectedObject: null,
    filter: "active",
    searchQuery: "",
    loading: false,
    error: null,
    notifications: [],
    revisionDrafts: {},
    artifactBodies: {},
    onRefresh: () => undefined,
    onSelectObject: () => undefined,
    onSetFilter: () => undefined,
    onSetSearchQuery: () => undefined,
    onDismissNotification: () => undefined,
    onUpdateRevisionDraft: () => undefined,
    onDraft: () => undefined,
    onFinalize: () => undefined,
    onRequestRevision: () => undefined,
    onRestore: () => undefined,
    onMarkComplete: () => undefined,
    onCopyCodexPrompt: () => undefined,
    onDismiss: () => undefined,
    onPauseExecution: undefined,
    onRedirectExecution: undefined,
    onCancelExecution: undefined,
    ...overrides,
  };
}

function normalizedText(container: Element): string {
  return container.textContent?.replace(/\s+/gu, " ").trim() ?? "";
}

function makeSkillifierExecution(
  opportunityState: "accepted" | "duplicate_suppressed" | "stale" | "needs_review" = "accepted",
): NonNullable<WorkQueueObject["execution"]> {
  return {
    runtimeJobId: "skillifier-job-1",
    runtimeJobState: "succeeded",
    executorKind: "executor.skillifier",
    sessionId: "skillifier-session",
    streamSummary: "6 events",
    heartbeatStatus: "fresh",
    processStatus: "completed",
    validationStatus: "passed",
    closeoutStatus: "present",
    reviewStatus: opportunityState === "needs_review" ? "needs_review" : "reviewed",
    fileScopeStatus: "not_applicable",
    controlState: "none",
    rebuildState: "not_required",
    artifactRefs: [
      "runtime-job://skillifier-job-1/runtime-worker/adapter-result",
      "runtime-job://skillifier-job-1/skillifier/candidate/candidate-1",
      "runtime-job://skillifier-job-1/closeout-capsule/capsule-1",
    ],
    lifecycleTruthSource: "work_queue_repository",
    executionTruthSource: "execution_platform_runtime_jobs",
    uiMutationAllowed: false,
    skillifier: {
      runtimeJobId: "skillifier-job-1",
      opportunity: {
        state: opportunityState,
        capsuleRefs: ["closeout-capsule://capsule-1"],
        artifactRefs: ["runtime-job://skillifier-job-1/skillifier/candidate/candidate-1"],
        modelTaskRefs: ["runtime-job://skillifier-model-task/model-task/validation"],
        dbOperationRefs: ["runtime-job://skillifier-db-operation/db-operation/metadata"],
        reviewRefs: ["review://skillifier-candidate-quality"],
        reasonCodes: [`opportunity_state:${opportunityState}`],
        eli5Status: `ELI5 ${opportunityState}`,
        limitations: ["Owner review required before applying skill file"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutationAllowed: false,
      },
      opportunitySeedRef: "closeout-capsule://capsule-1/opportunity/seed-1",
      closeoutCapsuleRef: "closeout-capsule://capsule-1",
      closeoutCapsuleHash: "capsule-hash-1",
      candidateId: "candidate-1",
      candidateType: "new_skill",
      outcomeState: opportunityState,
      targetSkillRef: "skill://skillifier-runtime-review",
      candidateApplied: false,
      modelRefs: ["model://skillifier"],
      modelTaskRefs: ["runtime-job://skillifier-model-task/model-task/validation"],
      dbOperationRefs: ["runtime-job://skillifier-db-operation/db-operation/metadata"],
      validationRefs: ["validation://skillifier-candidate-schema"],
      reviewRefs: ["review://skillifier-candidate-quality"],
      limitations: ["Owner review required before applying skill file"],
      eli5Progress: "This fallback ELI5 text should not win over the opportunity summary.",
      nextAction: "Review candidate",
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      workQueueLifecycleMutationAllowed: false,
    },
  };
}

it("keeps queue filtering coverage alongside DOM rendering coverage", () => {
  const drafted = makeObject("fallback-drafted");
  const dismissed = makeObject("fallback-dismissed", {
    visibleStatus: "dismissed",
    lane: "dismissed",
    laneLabel: "Dismissed",
    statusLabel: "Dismissed",
  });

  const active = filterWorkQueueObjects([drafted, dismissed], "active" as WorkQueueFilter, "");

  expect(active).toHaveLength(1);
  expect(active[0]?.id).toBe("fallback-drafted");
  expect(active[0]?.lane).toBe("build_plans");
});

describe("work queue view", () => {
  it("renders live update, replay, and fallback polling states", () => {
    const container = document.createElement("div");

    render(renderWorkQueue(createProps({ pushMode: "subscribed", eventCursor: 42 })), container);
    expect(normalizedText(container)).toContain("Live updates connected");
    expect(normalizedText(container)).toContain("cursor 42");

    render(renderWorkQueue(createProps({ pushMode: "gap_replaying", eventCursor: 44 })), container);
    expect(normalizedText(container)).toContain("Replaying missed updates");
    expect(normalizedText(container)).toContain("cursor 44");

    render(
      renderWorkQueue(createProps({ pushMode: "fallback_polling", pushError: "stream-gap" })),
      container,
    );
    expect(normalizedText(container)).toContain("Live updates using bounded polling fallback");
    expect(normalizedText(container)).toContain("stream-gap");
  });

  it("renders active grouped items and hides dismissed/diagnostics by default", () => {
    const allItems = [
      makeObject("plan-a", { lane: "build_plans", laneLabel: "Build Plans" }),
      makeObject("skill-a", {
        lane: "skills",
        laneLabel: "Skills",
        objectClass: "new_skill_candidate",
        objectClassLabel: "New skill candidate",
        statusLabel: "Skill draft ready",
      }),
      makeObject("final-a", {
        visibleStatus: "finalized",
        statusLabel: "Ready to execute",
      }),
      makeObject("dismissed-a", {
        visibleStatus: "dismissed",
        lane: "dismissed",
        laneLabel: "Dismissed",
        statusLabel: "Dismissed",
      }),
      makeObject("diag-a", {
        visibleStatus: "failed",
        lane: "diagnostics",
        laneLabel: "Diagnostics",
        objectClass: "diagnostic",
        objectClassLabel: "Diagnostic",
      }),
    ];
    const activeItems = filterWorkQueueObjects(allItems, "active" as WorkQueueFilter, "");
    const container = document.createElement("div");
    render(
      renderWorkQueue(
        createProps({
          items: activeItems,
          selectedObject: activeItems[0] ?? null,
          filter: "active",
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("Build Plans");
    expect(container.textContent).toContain("Skills");
    expect(container.textContent).toContain("Work item plan-a");
    expect(container.textContent).toContain("Work item skill-a");
    expect(container.textContent).not.toContain("Work item dismissed-a");
    expect(container.textContent).not.toContain("Work item diag-a");
    expect(container.textContent).not.toContain("Work item final-a");
  });

  it("renders finalized items under the closed bucket", () => {
    const finalized = makeObject("finalized-a", {
      visibleStatus: "finalized",
      statusLabel: "Ready to execute",
      artifact: {
        kind: "plan",
        title: "Ready plan",
        body: "Final plan body",
        summary: "Final plan summary",
        codexPrompt: "Codex prompt body",
        path: null,
        versionLabel: "Plan draft v1",
        updatedAt: "2026-05-01T00:00:00.000Z",
        openQuestions: [],
      },
    });
    const items = filterWorkQueueObjects([finalized], "ready_to_execute", "");
    const container = document.createElement("div");
    render(
      renderWorkQueue(
        createProps({
          items,
          selectedObject: finalized,
          filter: "ready_to_execute",
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("Closed");
    expect(container.textContent).toContain("Copy Codex prompt");
    expect(container.textContent).toContain("Mark complete");
    expect(container.textContent).toContain("Codex-ready prompt");
  });

  it("shows full artifact, hidden evidence drawer by default, and revision UI for drafted items", () => {
    const drafted = makeObject("drafted-a");
    const container = document.createElement("div");
    render(
      renderWorkQueue(
        createProps({
          items: [drafted],
          selectedObject: drafted,
          filter: "active",
          revisionDrafts: { [drafted.id]: "Tighten the validation section." },
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("Build plan");
    expect(container.textContent).toContain("Objective");
    expect(container.textContent).toContain("Should we tighten the scope?");
    expect(container.textContent).toContain("Request revision");
    expect(container.textContent).toContain("Finalize");
    expect(container.textContent).not.toContain("Copy Codex prompt");
    const evidenceDetails = container.querySelectorAll("details")[0];
    expect(evidenceDetails.open).toBe(false);
  });

  it("renders read-only execution truth without lifecycle mutation controls", () => {
    const item = makeObject("execution-a", {
      execution: {
        runtimeJobId: "job-1",
        runtimeJobState: "running",
        executorKind: "executor.codex_bridge",
        sessionId: "session-123",
        streamSummary: "4 events, latest final response",
        heartbeatStatus: "fresh",
        processStatus: "completed",
        validationStatus: "passed",
        closeoutStatus: "present",
        reviewStatus: "human_review_required",
        fileScopeStatus: "satisfied",
        controlState: "applied",
        rebuildState: "not_required",
        authorityStatuses: [
          {
            artifactType: "codex_bridge.rebuild_authority_proof",
            profileId: "rebuild-authority-v2",
            status: "succeeded",
          },
        ],
        workflow: {
          route: "workflow_execution",
          workflowId: "agent_team.coding",
          workflowDisplayName: "Coding Agent Team",
          jobType: "executor.agent_team",
          executorId: "workflow-executor:agent_team.coding",
          authorityProfile: "local_yolo",
          approvalState: "not_required",
          workflowStatus: "accepted",
          validationState: "accepted",
          reviewState: "required",
          closeoutState: "required",
          blockerReasonCodes: [],
          controlAvailability: ["pause", "redirect", "cancel"],
          artifactRefs: ["runtime-job://job-1/execution/compiled-request"],
          routing: {
            state: "accepted",
            route: "workflow_execution",
            responseMode: "create_runtime_job",
            executeNow: true,
            confidence: 0.96,
            workflowId: "agent_team.coding",
            jobType: "executor.agent_team",
            routerModelRef: "fixture-router",
            routerConfigVersion: "router-config-v1",
            routerSchemaVersion: "intent-front-door.router-schema.v1",
            workflowRegistryVersion: "workflow-registry-v1",
            authoritySnapshotVersion: "authority-v1",
            escalationOutcome: "use_default_router",
            validatorOutcome: "accepted",
            actionSemanticsOutcome: "actions_allowed",
            clarificationOutcome: "pass_through",
            clarificationRef: null,
            compilerOutcome: "front_door_compiled_runtime_job_request",
            multiIntentPlanOutcome: null,
            childWorkflowHandoffCount: 0,
            artifactRefs: ["runtime-job://job-1/execution/front-door/router-result"],
            reasonCodes: ["intent_validation_accepted"],
            rawPromptStored: false,
            rawResponseStored: false,
            rawLogsStored: false,
            workQueueLifecycleMutationAllowed: false,
          },
          lifecycleState: "running",
          workQueueLifecycleMutationAllowed: false,
        },
        ownerProgressReadback: {
          state: "needs_review",
          headline: "Coding Agent Team is running; review 1 evidence gap.",
          currentStage: "validation",
          activeWorker: "test_engineer",
          activeModelRef: "openai-codex/gpt-5.4",
          runtimeLifecycleState: "running",
          validationEvidenceState: "unverified",
          closeoutEvidenceState: "needs_review",
          changedFileState: "present",
          humanDecisionState: "not_required",
          eli5Progress: "OpenClaw is checking the work before closeout.",
          limitations: ["Closeout is not accepted yet."],
          nextAction: "Review bounded runtime evidence.",
          diagnosticReasonCodes: ["accepted_closeout_evidence_missing"],
          activeGraphProgress: {
            state: "present",
            graphId: "graph-1",
            activeNodeId: "validation-node",
            activeNodeKind: "validation",
            roleId: "test_engineer",
            modelRef: "openai-codex/gpt-5.4",
            objective: "Run the focused validation and map it to a commitment.",
            whySelected: "Validation evidence is required before closeout.",
            targetRefs: [
              "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
            ],
            inputHandoffRefs: ["mission-contract://commitment/validation"],
            expectedOutput: "Validation evidence claim.",
            currentPhase: "node_completed",
            validationState: "passed",
            evidenceProducedRefs: ["validation://graph-1"],
            evidenceClaimRefs: ["validation://graph-1"],
            acceptedCommitmentIds: ["validation"],
            rejectedCommitmentIds: [],
            openCommitmentIds: ["closeout"],
            nextDecisionNeeded: "orchestrator_next_action_for_open_commitments",
            blockerSummary: "1 blocking commitment remains open.",
            finalizationState: null,
            latestToolEventKind: "worker.evidence.handoff",
            eli5Progress: "The test engineer proved one commitment with bounded evidence.",
            schedulerToolTrace: {
              schedulerPhase: "execution_in_progress",
              latestToolId: "worker.evidence.handoff",
              invocationRefs: ["runtime-tool://worker-evidence-handoff"],
            },
            workerToolTrace: {
              latestWorkerToolId: "worker.evidence.handoff",
              workerToolIds: ["worker.evidence.handoff"],
              invocationRefs: ["runtime-tool://worker-evidence-handoff"],
              changedFileRefs: [],
              validationRefs: ["validation://graph-1"],
              contextRequestRefs: [],
              editStepIds: [],
              evidenceClaimRefs: ["validation://graph-1"],
            },
            latestProgressEventRefs: ["runtime-event://progress-1"],
          },
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutationAllowed: false,
        },
        artifactRefs: ["runtime-job://job-1/artifact"],
        lifecycleTruthSource: "work_queue_repository",
        executionTruthSource: "execution_platform_runtime_jobs",
        uiMutationAllowed: false,
      },
    });
    const container = document.createElement("div");
    render(
      renderWorkQueue(
        createProps({
          items: [item],
          selectedObject: item,
          filter: "active",
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("Execution truth");
    expect(container.textContent).toContain("executor.codex_bridge");
    expect(container.textContent).toContain("Coding Agent Team");
    expect(container.textContent).toContain("workflow_execution");
    expect(container.textContent).toContain("Route state");
    expect(container.textContent).toContain("Route response");
    expect(container.textContent).toContain("fixture-router");
    expect(container.textContent).toContain("intent-front-door.router-schema.v1");
    expect(container.textContent).toContain("Route reasons");
    expect(container.textContent).toContain("front_door_compiled_runtime_job_request");
    expect(container.textContent).toContain("rebuild-authority-v2: succeeded");
    expect(container.textContent).toContain("execution_platform_runtime_jobs");
    expect(container.textContent).toContain("Controls are runtime-backed");
    expect(container.textContent).toContain("Owner progress");
    expect(container.textContent).toContain("Coding Agent Team is running");
    expect(container.textContent).toContain("test_engineer");
    expect(container.textContent).toContain("openai-codex/gpt-5.4");
    expect(container.textContent).toContain("Runtime graph progress");
    expect(container.textContent).toContain("validation-node");
    expect(container.textContent).toContain("worker.evidence.handoff");
    expect(container.textContent).toContain("Evidence claims");
    expect(container.textContent).toContain("validation://graph-1");
    expect(container.textContent).toContain("OpenClaw is checking the work before closeout.");
    expect(container.textContent).toMatch(/UI lifecycle mutation is\s+not available/u);
    expect(container.textContent).not.toContain("Run execution");
    expect(container.textContent).toContain("Execution controls are read-only");
  });
  it("falls back Planning Capsule child readback to role invocations", () => {
    const item = makeObject("planning-capsule-fallback", {
      execution: {
        runtimeJobId: "planning-capsule-fallback-job",
        runtimeJobState: "running",
        executorKind: "executor.agent_team",
        sessionId: "planning-capsule-fallback-session",
        streamSummary: "5 events",
        heartbeatStatus: "fresh",
        processStatus: "running",
        validationStatus: "unverified",
        closeoutStatus: "present",
        reviewStatus: "needs_review",
        fileScopeStatus: "satisfied",
        controlState: "none",
        rebuildState: "not_required",
        closeoutCapsule: {
          structuredSummary: { qualityAssessment: "bounded" },
          opportunitySeeds: [
            {
              kind: "proactive_plan",
              title: "Fallback seed",
              recommendedNextStep: "Draft fallback child actions.",
              confidence: "medium",
            },
          ],
        },
        runtimeGraph: {
          graphId: "graph-planning-capsule-fallback",
          planningStatusIsLifecycleState: false,
          childActions: [],
          dependencyEdges: [],
          roleInvocations: [
            {
              roleId: "implementation_engineer",
              modelRef: "moonshotai/kimi-k2.6",
              modelRunRef: "model-run://planning-capsule-fallback/attempt-1",
              status: "needs_review",
              producedArtifactRefs: [],
            },
          ],
          humanTasks: [],
          validationRepairLoops: [],
          limitations: [],
          artifactRefs: [
            "runtime-job://planning-capsule-fallback-job/runtime-work-graph/version/v2",
          ],
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutationAllowed: false,
        },
        artifactRefs: [],
        lifecycleTruthSource: "work_queue_repository",
        executionTruthSource: "execution_platform_runtime_jobs",
        uiMutationAllowed: false,
      },
    });
    const container = document.createElement("div");
    render(
      renderWorkQueue(createProps({ items: [item], selectedObject: item, filter: "active" })),
      container,
    );
    const text = normalizedText(container);
    expect(text).toContain(
      "seed=proactive_plan: Fallback seed | Draft fallback child actions. (confidence=medium)",
    );
    expect(text).toContain(
      "runtime-job://planning-capsule-fallback-job/runtime-work-graph/version/v2",
    );
    expect(text).toContain("seeds=1 total (high=0)");
  });
  it("uses owner-readback planning refs when runtime-graph planning refs are sparse", () => {
    const item = makeObject("planning-owner-ref-fallback", {
      execution: {
        runtimeJobId: "planning-owner-ref-job",
        runtimeJobState: "running",
        executorKind: "executor.agent_team",
        sessionId: "planning-owner-ref-session",
        streamSummary: "7 events",
        heartbeatStatus: "fresh",
        processStatus: "running",
        validationStatus: "unverified",
        closeoutStatus: "present",
        reviewStatus: "needs_review",
        fileScopeStatus: "satisfied",
        controlState: "none",
        rebuildState: "not_required",
        closeoutCapsule: {
          capsuleId: "capsule-owner-1",
          factualRefs: { runtimeJobId: "planning-owner-runtime" },
          structuredSummary: { qualityAssessment: "bounded" },
          opportunitySeeds: [
            {
              kind: "proactive_plan",
              title: "Owner planning seed",
              recommendedNextStep: "Link owner planning refs in intake readback.",
              confidence: "high",
            },
          ],
        },
        runtimeGraph: {
          graphId: "graph-planning-owner-ref",
          planningStatusIsLifecycleState: false,
          childActions: [],
          dependencyEdges: [],
          roleInvocations: [],
          humanTasks: [],
          validationRepairLoops: [],
          limitations: [],
          artifactRefs: [],
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutationAllowed: false,
        },
        ownerReadback: {
          state: "ready",
          planningWorkflowRefs: ["work-queue://planning-owner-ref-fallback/version/v7"],
          childActionProposalRefs: ["runtime-work-graph://planning-owner-ref/proposal/child-1"],
          humanDecisionRefs: ["owner-decision://planning-capsule/review-or-approve-action-graph"],
        },
        artifactRefs: [],
        lifecycleTruthSource: "work_queue_repository",
        executionTruthSource: "execution_platform_runtime_jobs",
        uiMutationAllowed: false,
      } as WorkQueueObject["execution"],
    });
    const container = document.createElement("div");
    render(
      renderWorkQueue(createProps({ items: [item], selectedObject: item, filter: "active" })),
      container,
    );
    const text = normalizedText(container);
    expect(text).toContain("work-queue://planning-owner-ref-fallback/version/v7");
    expect(text).toContain("runtime-work-graph://planning-owner-ref/proposal/child-1");
    expect(text).toContain(
      "runtime-job://planning-owner-runtime/closeout-capsule/capsule-owner-1 (state=present)",
    );
    expect(text).toContain("planning_owner=ready");
  });

  it("renders Planning Capsule intake readback details from runtime graph and closeout seeds", () => {
    const item = makeObject("planning-capsule-intake", {
      execution: {
        runtimeJobId: "planning-capsule-intake-job",
        runtimeJobState: "running",
        executorKind: "executor.agent_team",
        sessionId: "planning-capsule-session",
        streamSummary: "11 events",
        heartbeatStatus: "fresh",
        processStatus: "running",
        validationStatus: "failed",
        closeoutStatus: "present",
        reviewStatus: "needs_review",
        fileScopeStatus: "satisfied",
        controlState: "none",
        rebuildState: "not_required",
        ownerProgressReadback: {
          state: "needs_review",
          headline: "Planning Capsule intake needs owner review before compile.",
          currentStage: "compile_readiness_check",
          activeWorker: "orchestrator",
          activeModelRef: "openai-codex/gpt-5.5",
          runtimeLifecycleState: "running",
          validationEvidenceState: "failed",
          closeoutEvidenceState: "accepted",
          changedFileState: "present",
          humanDecisionState: "present",
          eli5Progress: "We turned the seed into a plan draft and checked it before compiling.",
          limitations: ["Owner approval is still required."],
          nextAction: "Review planning capsule and approve child graph.",
          diagnosticReasonCodes: ["validation_repair_needed"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutationAllowed: false,
        },
        closeoutCapsule: {
          humanReport: {
            source: "model",
            reportMarkdown: "Planning capsule intake closeout.",
            eli5Progress: "The system kept this as planning-only until review passes.",
          },
          structuredSummary: { qualityAssessment: "bounded" },
          opportunitySeeds: [
            {
              kind: "proactive_plan",
              title: "Improve Work Queue planning readback",
              recommendedNextStep:
                "Add readback that explains why this seed should become a child plan.",
              confidence: "high",
            },
          ],
        },
        runtimeGraph: {
          graphId: "graph-planning-capsule-intake",
          parentWorkItemId: "planning-capsule-intake-parent",
          ownerObjectiveSummary: "Improve Work Queue planning readback for closeout seeds.",
          approvedPlanRefs: ["work-queue://planning-capsule-intake/version/v3"],
          planningStatusIsLifecycleState: false,
          childActions: [
            {
              workItemId: "child-plan",
              title: "Draft action graph",
              actionKind: "planning",
              assignedRole: "orchestrator",
              assignedWorkflow: "agent_team.product_spec_planning",
              runtimeJobId: "child-job-planning",
              graphNodeRef: "graph-node://planning",
              blockerReasonCodes: [],
              evidenceRefs: ["runtime-job://child-job-planning"],
            },
          ],
          dependencyEdges: [],
          roleInvocations: [
            {
              roleId: "implementation_engineer",
              modelRef: "moonshotai/kimi-k2.6",
              status: "closed",
              producedArtifactRefs: ["runtime-job://child-job-planning"],
            },
            {
              roleId: "implementation_engineer",
              modelRef: "openai-codex/gpt-5.5",
              status: "closed",
              producedArtifactRefs: ["runtime-job://child-job-planning-repair"],
            },
          ],
          humanTasks: [],
          validationRepairLoops: [
            {
              validationRef: "validation://planning-capsule-intake",
              repairNodeRef: "repair://planning-capsule-intake",
              status: "failed",
              reasonCodes: ["validation_failed_once"],
            },
          ],
          closeoutRef: "runtime-job://planning-capsule-intake/closeout",
          finalCloseoutRef: "runtime-job://planning-capsule-intake/final-closeout",
          limitations: [],
          eli5Progress: "Planning capsule intake is review-gated before execution.",
          artifactRefs: [],
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutationAllowed: false,
        },
        artifactRefs: [],
        lifecycleTruthSource: "work_queue_repository",
        executionTruthSource: "execution_platform_runtime_jobs",
        uiMutationAllowed: false,
      } as WorkQueueObject["execution"],
    });
    const container = document.createElement("div");
    render(
      renderWorkQueue(createProps({ items: [item], selectedObject: item, filter: "active" })),
      container,
    );
    const text = normalizedText(container);
    expect(text).toContain("Planning Capsule intake");
    expect(text).toContain("Add readback that explains why this seed should become a child plan.");
    expect(text).toContain("workflow=needs_review; owner=needs_review; quality=bounded");
    expect(text).toContain("work-queue://planning-capsule-intake/version/v3");
    expect(text).toContain(
      "Draft action graph (agent_team.product_spec_planning -> child-job-planning)",
    );
    expect(text).toContain(
      "owner stage indicates compile readiness work (compile_readiness_check)",
    );
    expect(text).toContain("2 attempt(s): moonshotai/kimi-k2.6, openai-codex/gpt-5.5");
    expect(text).toContain(
      "failed: validation://planning-capsule-intake -> repair://planning-capsule-intake",
    );
    expect(text).toContain("runtime-job://planning-capsule-intake/final-closeout");
    expect(text).toContain("We turned the seed into a plan draft and checked it before compiling.");
  });

  it("renders compact accepted proactivity opportunity readback with bounded refs", () => {
    const execution = makeSkillifierExecution("accepted") as WorkQueueObject["execution"] & {
      skillifier: { opportunity: Record<string, unknown> };
    };
    execution.skillifier.opportunity.rawToolLog = "RAW_TOOL_LOG_SHOULD_NOT_RENDER";
    execution.skillifier.opportunity.reasonCodes = [
      "opportunity_seed_accepted",
      "runtime_job_created",
    ];
    execution.skillifier.opportunity.artifactRefs = [
      "runtime-job://skillifier-job-1/skillifier/candidate/candidate-1",
      "review://skillifier-candidate-quality",
    ];
    const item = makeObject("skillifier-accepted", {
      execution,
    });
    const container = document.createElement("div");
    render(
      renderWorkQueue(
        createProps({
          items: [item],
          selectedObject: item,
          filter: "active",
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("Skillifier runtime");
    expect(container.textContent).toContain("Opportunity state");
    expect(container.textContent).toContain("accepted");
    expect(container.textContent).toContain("opportunity_seed_accepted");
    expect(container.textContent).toContain(
      "runtime-job://skillifier-job-1/skillifier/candidate/candidate-1",
    );
    expect(container.textContent).toContain("closeout-capsule://capsule-1");
    expect(container.textContent).toContain("Readback readiness state");
    expect(container.textContent).toContain("ready_for_follow_on_soak");
    expect(container.textContent).toContain("Proactivity soak gate");
    expect(container.textContent).toContain(
      "opportunity_state=accepted ready; seed_ref linked; closeout_capsule_ref linked; role_model_refs linked; validation_evidence linked",
    );
    expect(container.textContent).toContain("Soak evidence summary");
    expect(container.textContent).toContain("follow_on_soak_checklist=ready");
    expect(container.textContent).toContain("Follow-on soak checklist");
    expect(container.textContent).toContain("Soak checklist details");
    expect(container.textContent).toContain("Bounded evidence digest");
    expect(container.textContent).toContain(
      "seed_quality=linked and accepted; closeout_capsule_refs=1; role_model_refs=1; validation_refs=1; review_refs=1; bounded_validation_evidence=linked",
    );
    expect(container.textContent).toContain("opportunity_seed_quality:ready");
    expect(container.textContent).toContain("bounded_validation_evidence:ready");
    expect(container.textContent).toContain("Opportunity seed quality");
    expect(container.textContent).toContain("linked and accepted");
    expect(container.textContent).toContain("Evidence snapshot");
    expect(container.textContent).toContain("seed=closeout-capsule://capsule-1/opportunity/seed-1");
    expect(container.textContent).toContain("closeout=closeout-capsule://capsule-1");
    expect(container.textContent).toContain("role_model=skillifier:model://skillifier");
    expect(container.textContent).toContain("validation=validation://skillifier-candidate-schema");
    expect(container.textContent).toContain("Closeout capsule quality");
    expect(container.textContent).toContain("ref + hash linked");
    expect(container.textContent).toContain("Closeout capsule refs");
    const text = normalizedText(container);
    expect(text).toContain(
      "1/1 closeout capsule refs shown (cap 10): closeout-capsule://capsule-1",
    );
    expect(container.textContent).toContain("Role/model refs");
    expect(text).toContain("1/1 role/model refs shown (cap 8): skillifier:model://skillifier");
    expect(container.textContent).toContain("skillifier:model://skillifier");
    expect(container.textContent).toContain("Validation evidence");
    expect(container.textContent).toContain("bounded refs present");
    expect(container.textContent).toContain("Readback gaps");
    expect(container.textContent).not.toContain("opportunity seed ref missing");
    expect(container.textContent).toContain("ELI5 accepted");
    expect(container.textContent).not.toContain("RAW_TOOL_LOG_SHOULD_NOT_RENDER");
  });

  it("reports capped hidden-ref counts for Skillifier soak readback coverage", () => {
    const execution = makeSkillifierExecution("accepted");
    const skillifier = execution.skillifier;
    expect(skillifier).toBeTruthy();
    expect(skillifier?.opportunity).toBeTruthy();
    skillifier!.modelRefs = Array.from(
      { length: 12 },
      (_unused, index) => `model://skillifier-${index}`,
    );
    skillifier!.validationRefs = Array.from(
      { length: 12 },
      (_unused, index) => `validation://skillifier-${index}`,
    );
    skillifier!.opportunity!.capsuleRefs = Array.from(
      { length: 12 },
      (_unused, index) => `closeout-capsule://capsule-${index}`,
    );
    const item = makeObject("skillifier-hidden-ref-coverage", {
      execution,
    });
    const container = document.createElement("div");
    render(
      renderWorkQueue(createProps({ items: [item], selectedObject: item, filter: "active" })),
      container,
    );

    const text = normalizedText(container);
    expect(text).toContain("10/12 closeout capsule refs shown (cap 10); 2 hidden");
    expect(text).toContain("8/12 role/model refs shown (cap 8); 4 hidden");
    expect(text).toContain("10/14 bounded validation refs shown (cap 10); 4 hidden");
  });

  it("renders duplicate-suppressed opportunity state distinctly", () => {
    const item = makeObject("skillifier-duplicate", {
      execution: makeSkillifierExecution("duplicate_suppressed"),
    });
    const container = document.createElement("div");
    render(
      renderWorkQueue(
        createProps({
          items: [item],
          selectedObject: item,
          filter: "active",
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("duplicate_suppressed");
    expect(container.textContent).toContain("opportunity_state:duplicate_suppressed");
  });

  it("renders stale opportunity state distinctly", () => {
    const item = makeObject("skillifier-stale", {
      execution: makeSkillifierExecution("stale"),
    });
    const container = document.createElement("div");
    render(
      renderWorkQueue(
        createProps({
          items: [item],
          selectedObject: item,
          filter: "active",
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("stale");
    expect(container.textContent).toContain("opportunity_state:stale");
    expect(container.textContent).toContain("Readback readiness state");
    expect(container.textContent).toContain("needs_review");
    expect(normalizedText(container)).toContain("opportunity_state=stale needs_review");
    expect(container.textContent).toContain("Follow-on soak checklist");
    expect(container.textContent).toContain("follow_on_soak_checklist=needs_review");
    expect(container.textContent).toContain("opportunity_seed_quality:needs_review");
  });

  it("renders needs-review opportunity state distinctly", () => {
    const item = makeObject("skillifier-needs-review", {
      execution: makeSkillifierExecution("needs_review"),
    });
    const container = document.createElement("div");
    render(
      renderWorkQueue(
        createProps({
          items: [item],
          selectedObject: item,
          filter: "active",
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("needs_review");
    expect(container.textContent).toContain("opportunity_state:needs_review");
  });

  it("renders server-backed execution control buttons only when callbacks exist", () => {
    const item = makeObject("execution-controls", {
      execution: {
        runtimeJobId: "job-controls",
        runtimeJobState: "running",
        executorKind: "executor.codex_bridge",
        sessionId: "session-controls",
        streamSummary: "running",
        heartbeatStatus: "fresh",
        processStatus: "running",
        validationStatus: "unknown",
        closeoutStatus: "missing",
        reviewStatus: "unknown",
        fileScopeStatus: "unknown",
        controlState: "pending",
        rebuildState: "not_required",
        artifactRefs: [],
        lifecycleTruthSource: "work_queue_repository",
        executionTruthSource: "execution_platform_runtime_jobs",
        uiMutationAllowed: false,
      },
    });
    const onPauseExecution = vi.fn();
    const onRedirectExecution = vi.fn();
    const onCancelExecution = vi.fn();
    const container = document.createElement("div");
    render(
      renderWorkQueue(
        createProps({
          items: [item],
          selectedObject: item,
          filter: "active",
          onPauseExecution,
          onRedirectExecution,
          onCancelExecution,
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("Pause");
    expect(container.textContent).toContain("Redirect");
    expect(container.textContent).toContain("Cancel");
    const buttons = [...container.querySelectorAll("button")].filter((button) =>
      ["Pause", "Redirect", "Cancel"].includes(button.textContent?.trim() ?? ""),
    );
    buttons[0]?.click();
    buttons[1]?.click();
    buttons[2]?.click();
    expect(onPauseExecution).toHaveBeenCalledWith(item);
    expect(onRedirectExecution).toHaveBeenCalledWith(item);
    expect(onCancelExecution).toHaveBeenCalledWith(item);
  });

  it("disables unsafe execution controls when no runtime job is available", () => {
    const item = makeObject("execution-controls-disabled", {
      execution: {
        runtimeJobId: null,
        runtimeJobState: "unknown",
        executorKind: "executor.agent_team",
        sessionId: null,
        streamSummary: "no runtime job",
        heartbeatStatus: "unknown",
        processStatus: "unknown",
        validationStatus: "unknown",
        closeoutStatus: "unknown",
        reviewStatus: "unknown",
        fileScopeStatus: "unknown",
        controlState: "unavailable",
        rebuildState: "unknown",
        artifactRefs: [],
        lifecycleTruthSource: "work_queue_repository",
        executionTruthSource: "execution_platform_runtime_jobs",
        uiMutationAllowed: false,
      },
    });
    const container = document.createElement("div");
    render(
      renderWorkQueue(
        createProps({
          items: [item],
          selectedObject: item,
          filter: "active",
          onPauseExecution: vi.fn(),
          onRedirectExecution: vi.fn(),
          onCancelExecution: vi.fn(),
        }),
      ),
      container,
    );

    const buttons = [...container.querySelectorAll("button")].filter((button) =>
      ["Pause", "Redirect", "Cancel"].includes(button.textContent?.trim() ?? ""),
    );
    expect(buttons.every((button) => button.hasAttribute("disabled"))).toBe(true);
    expect(container.textContent).toContain("Unsafe controls are disabled");
  });

  it("renders agent-team execution state from runtime truth", () => {
    const item = makeObject("agent-team-execution", {
      execution: {
        runtimeJobState: "succeeded",
        executorKind: "executor.agent_team",
        sessionId: "team-session",
        streamSummary: "14 events",
        heartbeatStatus: "fresh",
        processStatus: "completed",
        validationStatus: "passed",
        closeoutStatus: "present",
        reviewStatus: "reviewed",
        fileScopeStatus: "not_applicable",
        controlState: "none",
        rebuildState: "not_required",
        artifactRefs: ["runtime-job://job-1/agent-team/runtime-evidence"],
        lifecycleTruthSource: "work_queue_repository",
        executionTruthSource: "execution_platform_runtime_jobs",
        uiMutationAllowed: false,
        agentTeam: {
          agentTeamRunId: "team-run-1",
          currentTeamState: "completed",
          activeRole: "observability_scribe",
          completedRoles: ["context_scout", "implementation_engineer", "test_engineer"],
          pendingRoles: [],
          blockedRoles: [],
          needsReviewRoles: ["context_scout"],
          latestHandoff: "handoff-1",
          validationState: "passed",
          reviewState: "reviewed",
          securityReviewState: "local_codex_review",
          closeoutState: "present",
          authorityStatus: "allowed",
          modelReadiness: [
            { modelId: "moonshotai/kimi-k2.6", status: "allowed" },
            { modelId: "deepseek/deepseek-v4-pro", status: "needs_review" },
          ],
          teamStreamSummary: {
            eventCount: 14,
            latestSummary: "closeout requirement recorded",
            blockerReasonCodes: [],
          },
          modelAccountingSummary: {
            runCount: 6,
            totalLatencyMs: 1200,
            totalTokenCount: 4200,
            estimatedCostUsd: 0.02,
            providerUsageComplete: true,
            costSource: "provider_reported",
          },
          providerReliabilitySummary: {
            perModel: [
              {
                modelId: "deepseek/deepseek-v4-pro",
                provider: "openrouter",
                callCount: 1,
                successCount: 1,
                needsReviewCount: 0,
                rateLimitCount: 0,
                noContentCount: 0,
                retryCount: 1,
                averageLatencyMs: 900,
                maxLatencyMs: 900,
                usageComplete: true,
                costSource: "provider_reported",
                latestReasonCodes: [],
                readiness: "qualified",
              },
            ],
            sourceArtifactRefs: ["runtime-job://job-1/agent-team/provider-reliability"],
          },
          failureRecoveryState: "repaired",
          blockers: [],
          artifactRefs: ["runtime-job://job-1/agent-team/stream-summary"],
        },
      },
    });
    const container = document.createElement("div");
    render(
      renderWorkQueue(
        createProps({
          items: [item],
          selectedObject: item,
          filter: "active",
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("Agent team");
    expect(container.textContent).toContain("team-run-1");
    expect(container.textContent).toContain("observability_scribe");
    expect(container.textContent).toContain("deepseek/deepseek-v4-pro: needs_review");
    expect(container.textContent).toContain("14 events");
    expect(container.textContent).toContain("6 runs");
    expect(container.textContent).toContain("Provider reliability");
    expect(container.textContent).toContain("retries 1");
    expect(container.textContent).toContain(
      "Agent-team state is projected from server/runtime truth",
    );
  });

  it("renders Skillifier runtime readback as bounded proposal state", () => {
    const item = makeObject("skillifier-runtime", {
      execution: {
        runtimeJobId: "job-skillifier-1",
        runtimeJobState: "needs_review",
        executorKind: "workflow_worker",
        sessionId: null,
        streamSummary: "skillifier closeout recorded",
        heartbeatStatus: "fresh",
        processStatus: "completed",
        validationStatus: "passed",
        closeoutStatus: "present",
        reviewStatus: "needs_review",
        fileScopeStatus: "proposal_only",
        controlState: "none",
        rebuildState: "not_required",
        artifactRefs: ["runtime-job://job-skillifier-1/readback"],
        lifecycleTruthSource: "work_queue_repository",
        executionTruthSource: "execution_platform_runtime_jobs",
        uiMutationAllowed: false,
        workflow: {
          route: "workflow_execution",
          workflowId: "workflow.skillifier",
          workflowDisplayName: "Skillifier Runtime",
          jobType: "workflow.skillifier",
          executorId: "workflow-executor:workflow.skillifier",
          authorityProfile: "local_review_only",
          approvalState: "not_required",
          workflowStatus: "needs_review",
          validationState: "passed",
          reviewState: "needs_review",
          closeoutState: "present",
          blockerReasonCodes: [],
          controlAvailability: ["view_closeout"],
          artifactRefs: ["runtime-job://job-skillifier-1/execution/compiled-request"],
          routing: null,
          lifecycleState: "needs_review",
          workQueueLifecycleMutationAllowed: false,
        },
        skillifier: {
          runtimeJobId: "job-skillifier-1",
          opportunitySeedRef: "opportunity-seed://closeout/seed-1",
          closeoutCapsuleRef: "closeout-capsule://capsule-1",
          closeoutCapsuleHash: "capsule-hash-1",
          candidateId: "skill-candidate-1",
          candidateType: "skill_edit",
          outcomeState: "needs_review",
          targetSkillRef: "skill://work-queue-ux-review",
          targetSkillPath: "skills/work-queue-ux-review/SKILL.md",
          candidateApplied: false,
          modelRefs: ["openai/gpt-5.4", "model-task://skillifier.structured_json"],
          modelTaskRefs: ["runtime-job://job-skillifier-1/model-task/skillifier"],
          dbOperationRefs: ["runtime-job://job-skillifier-1/db-operation/skillifier-candidate"],
          validationRefs: ["validation://skillifier-runtime-1"],
          reviewRefs: ["review://skillifier-runtime-1"],
          limitations: [
            "Skill file apply remains review-gated.",
            "Only bounded candidate data is stored.",
          ],
          eli5Progress:
            "OpenClaw reviewed a closeout clue, drafted a safe skill update proposal, and stopped before applying it.",
          nextAction: "Review the candidate proposal and decide whether to apply it.",
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutationAllowed: false,
        },
      },
    });
    const container = document.createElement("div");

    render(
      renderWorkQueue(
        createProps({
          items: [item],
          selectedObject: item,
          filter: "active",
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("Skillifier runtime");
    const text = normalizedText(container);
    expect(text).toContain("skill_edit / skill-candidate-1");
    expect(container.textContent).toContain("opportunity-seed://closeout/seed-1");
    expect(text).toContain("closeout-capsule://capsule-1 / capsule-hash-1");
    expect(container.textContent).toContain("skill://work-queue-ux-review");
    expect(container.textContent).toContain("proposal only");
    expect(container.textContent).toContain("runtime-job://job-skillifier-1/model-task/skillifier");
    expect(container.textContent).toContain(
      "runtime-job://job-skillifier-1/db-operation/skillifier-candidate",
    );
    expect(container.textContent).toContain("validation://skillifier-runtime-1");
    expect(container.textContent).toContain("review://skillifier-runtime-1");
    expect(container.textContent).toContain("Proactivity soak gate");
    expect(container.textContent).toContain("Soak evidence summary");
    expect(container.textContent).toContain(
      "needs_review: opportunity_state=captured needs_review; seed_ref linked; closeout_capsule_ref linked; role_model_refs linked; validation_evidence linked",
    );
    expect(text).toContain(
      "bounded refs present (1 validation, 1 review, 3/3 bounded validation refs shown (cap 10)); refs 1 validation, 1 review",
    );
    expect(container.textContent).toContain(
      "Review the candidate proposal and decide whether to apply it.",
    );
    expect(container.textContent).toContain(
      "Skillifier runtime state is bounded owner-facing readback only.",
    );
  });

  it("fills sparse Skillifier runtime fields from bounded execution evidence", () => {
    const item = makeObject("skillifier-runtime-fallbacks", {
      recommendedNextStep: "Review the bounded candidate before any skill file apply.",
      execution: {
        runtimeJobId: "job-skillifier-2",
        runtimeJobState: "needs_review",
        executorKind: "workflow_worker",
        sessionId: null,
        streamSummary: "skillifier worker completed with review gate",
        heartbeatStatus: "fresh",
        processStatus: "completed",
        validationStatus: "passed",
        closeoutStatus: "present",
        reviewStatus: "needs_review",
        fileScopeStatus: "proposal_only",
        controlState: "none",
        rebuildState: "not_required",
        artifactRefs: [
          "runtime-job://job-skillifier-2/closeout-capsule/capsule-2",
          "runtime-job://job-skillifier-2/model-task/validation",
          "runtime-job://job-skillifier-2/review/security-review",
        ],
        lifecycleTruthSource: "work_queue_repository",
        executionTruthSource: "execution_platform_runtime_jobs",
        uiMutationAllowed: false,
        workflow: {
          route: "workflow_execution",
          workflowId: "workflow.skillifier",
          workflowDisplayName: "Skillifier Runtime",
          jobType: "workflow.skillifier",
          executorId: "workflow-executor:workflow.skillifier",
          authorityProfile: "local_review_only",
          approvalState: "not_required",
          workflowStatus: "needs_review",
          validationState: "passed",
          reviewState: "needs_review",
          closeoutState: "present",
          blockerReasonCodes: [],
          controlAvailability: ["view_closeout"],
          artifactRefs: ["runtime-job://job-skillifier-2/execution/compiled-request"],
          routing: null,
          lifecycleState: "needs_review",
          workQueueLifecycleMutationAllowed: false,
        },
        skillifier: {
          runtimeJobId: "job-skillifier-2",
          candidateId: "skill-candidate-2",
          candidateType: "new_skill",
          targetSkillPath: "skills/new-skill/SKILL.md",
          candidateApplied: false,
          modelRefs: [],
          modelTaskRefs: [],
          dbOperationRefs: [],
          validationRefs: [],
          reviewRefs: [],
          limitations: [],
          eli5Progress: null,
          nextAction: null,
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutationAllowed: false,
        },
        middleware: {
          modelTask: {
            state: "present",
            contractId: "skillifier.structured_json",
            validationState: "passed",
            providerCallMade: true,
            artifactRefs: [
              "runtime-job://job-skillifier-2/model-task/skillifier",
              "runtime-job://job-skillifier-2/model-task/validation",
            ],
          },
          scriptJob: {
            state: "unknown",
            scriptId: null,
            lane: null,
            exitCode: null,
            shellExecutionAllowed: false,
            artifactRefs: [],
          },
          dbOperation: {
            state: "present",
            operationName: "skillifier_candidate_projection",
            operationKind: "projection_write",
            lane: "skillifier",
            decision: "accepted",
            rawRowsStored: false,
            artifactRefs: ["runtime-job://job-skillifier-2/db-operation/skillifier-candidate"],
          },
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          rawDbRowsStored: false,
          authorityGranted: false,
          workQueueLifecycleMutationAllowed: false,
        },
        closeoutCapsule: {
          capsuleId: "capsule-2",
          modelRef: "openai/gpt-5.4",
          factualRefs: {
            runtimeJobId: "job-skillifier-2",
            validationRefs: ["pnpm test:file ui/src/ui/views/work-queue.test.ts"],
          },
          humanReport: {
            source: "model",
            reportMarkdown: "Bounded Skillifier closeout.",
            eli5Progress: "OpenClaw drafted a safe skill proposal and stopped at the review gate.",
            limitations: ["Review approval is still required before any file apply."],
          },
          structuredSummary: {
            taskSuccess: "needs_review",
            qualityAssessment: "bounded",
            workflowFitAssessment: "fit",
            agentModelFitAssessment: "fit",
            missingWork: ["owner review"],
          },
          opportunitySeeds: [
            {
              kind: "existing_skill_edit",
              title: "Refine the bounded skill candidate",
              recommendedNextStep: "Review the candidate.",
              confidence: "medium",
            },
          ],
        },
      },
    });
    const container = document.createElement("div");

    render(
      renderWorkQueue(
        createProps({
          items: [item],
          selectedObject: item,
          filter: "active",
        }),
      ),
      container,
    );

    const text = normalizedText(container);
    expect(text).toContain("new_skill / skill-candidate-2");
    expect(container.textContent).toContain(
      "runtime-job://job-skillifier-2/closeout-capsule/capsule-2",
    );
    expect(container.textContent).toContain("openai/gpt-5.4");
    expect(container.textContent).toContain("runtime-job://job-skillifier-2/model-task/skillifier");
    expect(container.textContent).toContain(
      "runtime-job://job-skillifier-2/db-operation/skillifier-candidate",
    );
    expect(container.textContent).toContain("runtime-job://job-skillifier-2/model-task/validation");
    expect(container.textContent).toContain("pnpm test:file ui/src/ui/views/work-queue.test.ts");
    expect(container.textContent).toContain(
      "runtime-job://job-skillifier-2/review/security-review",
    );
    expect(container.textContent).toContain(
      "OpenClaw drafted a safe skill proposal and stopped at the review gate.",
    );
    expect(container.textContent).toContain(
      "Review approval is still required before any file apply.",
    );
    expect(container.textContent).toContain(
      "Review the bounded candidate before any skill file apply.",
    );
    expect(container.textContent).toContain("Readback readiness state");
    expect(container.textContent).toContain("needs_review");
    expect(container.textContent).toContain("Opportunity seed quality");
    expect(container.textContent).toContain("Evidence snapshot");
    expect(container.textContent).toContain("seed=missing");
    expect(container.textContent).toContain(
      "closeout=runtime-job://job-skillifier-2/closeout-capsule/capsule-2",
    );
    expect(container.textContent).toContain("role_model=skillifier:openai/gpt-5.4");
    expect(container.textContent).toContain(
      "validation=runtime-job://job-skillifier-2/model-task/validation",
    );
    expect(container.textContent).toContain("missing seed ref");
    expect(container.textContent).toContain("Readback gaps");
    expect(container.textContent).toContain("opportunity seed ref missing");
    expect(container.textContent).toContain("Closeout capsule quality");
    expect(container.textContent).toContain("ref linked; hash missing");
    expect(container.textContent).toContain("Closeout capsule refs");
    expect(container.textContent).toContain(
      "runtime-job://job-skillifier-2/closeout-capsule/capsule-2",
    );
    expect(text).toContain(
      "1/1 closeout capsule refs shown (cap 10): runtime-job://job-skillifier-2/closeout-capsule/capsule-2",
    );
    expect(container.textContent).toContain("Validation evidence");
    expect(text).toContain(
      "bounded refs present (2 validation, 1 review, 2/2 bounded validation refs shown (cap 10)); refs 2 validation, 1 review",
    );
    expect(container.textContent).toContain("Proactivity soak gate");
    expect(container.textContent).toContain("Soak evidence summary");
    expect(container.textContent).toContain("Bounded evidence digest");
    expect(container.textContent).toContain(
      "seed_quality=missing seed ref; closeout_capsule_refs=1; role_model_refs=1; validation_refs=2; review_refs=1; bounded_validation_evidence=linked",
    );
    expect(container.textContent).toContain(
      "needs_review: opportunity_state=needs_review needs_review; seed_ref missing; closeout_capsule_ref linked; role_model_refs linked; validation_evidence linked",
    );
    expect(container.textContent).toContain("bounded validation refs 2");
  });

  it("uses nested workflow extension Skillifier evidence when direct readback is sparse", () => {
    const item = makeObject("skillifier-runtime-extension", {
      execution: {
        runtimeJobId: "job-skillifier-3",
        runtimeJobState: "needs_review",
        executorKind: "workflow_worker",
        sessionId: null,
        streamSummary: "skillifier runtime completed with proposal-only outcome",
        heartbeatStatus: "fresh",
        processStatus: "completed",
        validationStatus: "passed",
        closeoutStatus: "present",
        reviewStatus: "needs_review",
        fileScopeStatus: "proposal_only",
        controlState: "none",
        rebuildState: "not_required",
        artifactRefs: ["runtime-job://job-skillifier-3/readback"],
        lifecycleTruthSource: "work_queue_repository",
        executionTruthSource: "execution_platform_runtime_jobs",
        uiMutationAllowed: false,
        workflow: {
          route: "workflow_execution",
          workflowId: "workflow.skillifier",
          workflowDisplayName: "Skillifier Runtime",
          jobType: "workflow.skillifier",
          executorId: "workflow-executor:workflow.skillifier",
          authorityProfile: "local_review_only",
          approvalState: "not_required",
          workflowStatus: "needs_review",
          validationState: "passed",
          reviewState: "needs_review",
          closeoutState: "present",
          blockerReasonCodes: [],
          controlAvailability: ["view_closeout"],
          artifactRefs: ["runtime-job://job-skillifier-3/execution/compiled-request"],
          routing: null,
          extension: {
            extensionKind: "workflow.skillifier",
            skillifier: {
              runtimeJobId: "job-skillifier-3",
              opportunitySeedRef: "opportunity-seed://closeout/seed-3",
              closeoutCapsuleRef: "closeout-capsule://capsule-3",
              candidateId: "skill-candidate-3",
              candidateType: "new_skill",
              outcomeState: "needs_review",
              targetSkillPath: "skills/new-runtime-skill/SKILL.md",
              candidateApplied: false,
              modelRefs: ["openai/gpt-5.4"],
              modelTaskRefs: ["runtime-job://job-skillifier-3/model-task/skillifier"],
              dbOperationRefs: ["runtime-job://job-skillifier-3/db-operation/skillifier-candidate"],
              validationRefs: ["validation://skillifier-runtime-3"],
              reviewRefs: ["review://skillifier-runtime-3"],
              limitations: ["Bounded candidate is review-gated before any skill file apply."],
              eli5Progress:
                "OpenClaw found a useful skill idea, wrote down the safe draft details, and stopped.",
              nextAction: "Review the nested Skillifier proposal before any apply step.",
            },
          },
          lifecycleState: "needs_review",
          workQueueLifecycleMutationAllowed: false,
        },
        skillifier: {
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutationAllowed: false,
        },
      },
    });
    const container = document.createElement("div");

    render(
      renderWorkQueue(
        createProps({
          items: [item],
          selectedObject: item,
          filter: "active",
        }),
      ),
      container,
    );

    const text = normalizedText(container);
    expect(text).toContain("new_skill / skill-candidate-3");
    expect(container.textContent).toContain("opportunity-seed://closeout/seed-3");
    expect(container.textContent).toContain("closeout-capsule://capsule-3");
    expect(container.textContent).toContain("skills/new-runtime-skill/SKILL.md");
    expect(container.textContent).toContain("runtime-job://job-skillifier-3/model-task/skillifier");
    expect(container.textContent).toContain(
      "runtime-job://job-skillifier-3/db-operation/skillifier-candidate",
    );
    expect(container.textContent).toContain("validation://skillifier-runtime-3");
    expect(container.textContent).toContain("review://skillifier-runtime-3");
    expect(container.textContent).toContain(
      "Review the nested Skillifier proposal before any apply step.",
    );
  });

  it("renders Runtime Work Graph owner readback without lifecycle ownership", () => {
    const item = makeObject("runtime-work-graph", {
      execution: {
        runtimeJobId: "job-graph-root",
        runtimeJobState: "succeeded",
        executorKind: "executor.runtime_work_graph",
        sessionId: "runtime-work-graph-session",
        streamSummary: "graph completed",
        heartbeatStatus: "fresh",
        processStatus: "completed",
        validationStatus: "passed",
        closeoutStatus: "present",
        reviewStatus: "reviewed",
        fileScopeStatus: "satisfied",
        controlState: "none",
        rebuildState: "not_required",
        artifactRefs: ["runtime-job://job-graph-root/runtime-work-graph/readback"],
        lifecycleTruthSource: "work_queue_repository",
        executionTruthSource: "execution_platform_runtime_jobs",
        uiMutationAllowed: false,
        runtimeGraph: {
          graphId: "runtime-work-graph-1",
          parentWorkItemId: "parent-1",
          ownerObjectiveSummary:
            "Prove Kimi and Codex implementation readiness with bounded parent/child readback evidence.",
          approvedPlanRefs: ["artifact://approved-plan/kimi-codex-readiness"],
          planningStatusIsLifecycleState: false,
          childActions: [
            {
              workItemId: "child-implementation",
              title: "Implementation",
              actionKind: "coding",
              assignedRole: "implementation_engineer",
              assignedWorkflow: "agent_team.coding",
              runtimeJobId: null,
              graphNodeRef: "graph://implementation",
              blockerReasonCodes: [],
              evidenceRefs: [
                "repo://extensions/execution-platform/src/workflows/runtime.ts",
                "validation://kimi-codex-readiness",
              ],
            },
            {
              workItemId: "child-human",
              title: "Owner decision",
              actionKind: "human_operator",
              assignedRole: "owner",
              assignedWorkflow: "human/operator",
              runtimeJobId: null,
              graphNodeRef: "graph://human",
              blockerReasonCodes: [],
              evidenceRefs: ["human-task://task-1"],
            },
          ],
          dependencyEdges: [
            {
              workItemId: "child-human",
              dependsOnWorkItemId: "child-implementation",
              dependencyType: "action_depends_on",
            },
          ],
          roleInvocations: [
            {
              roleId: "orchestrator",
              modelRef: "openai-codex/gpt-5.5",
              providerPath: "codex_app_server",
              transportKind: "codex_app_server",
              modelRunRef: "model-run://orchestrator",
              status: "completed",
              latencyMs: 70000,
              producedArtifactRefs: ["runtime-work-graph://plan"],
            },
            {
              roleId: "implementation_engineer",
              modelRef: "moonshotai/kimi-k2.6",
              providerPath: "openrouter",
              transportKind: "live_model",
              modelRunRef: "openrouter://kimi",
              status: "completed",
              latencyMs: 62000,
              producedArtifactRefs: ["repo://file"],
            },
          ],
          humanTasks: [
            {
              humanTaskId: "human-task-1",
              state: "resumed",
              ownerOperatorId: "owner",
              resumeTokenRef: "resume://task-1",
              blockingGraphNodeRefs: ["graph://human"],
            },
          ],
          validationRepairLoops: [
            {
              validationRef: "validation://focused-test",
              repairNodeRef: "graph://repair",
              status: "passed_after_repair",
              reasonCodes: ["validation_failed_then_repaired"],
            },
          ],
          finalCloseoutRef: "closeout://capsule",
          limitations: [],
          eli5Progress:
            "OpenClaw split the project into child tasks, ran model roles, paused for the owner, tested, repaired, and closed out.",
          artifactRefs: ["runtime-work-graph://readback"],
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutationAllowed: false,
        },
      },
    });
    const container = document.createElement("div");

    render(
      renderWorkQueue(
        createProps({
          items: [item],
          selectedObject: item,
          filter: "active",
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("Runtime Work Graph");
    expect(container.textContent).toContain("runtime-work-graph-1");
    expect(container.textContent).toContain(
      "Prove Kimi and Codex implementation readiness with bounded parent/child readback evidence.",
    );
    expect(container.textContent).toContain("artifact://approved-plan/kimi-codex-readiness");
    expect(container.textContent).toContain("Implementation readiness");
    expect(container.textContent).toContain(
      "1 approved parent plan ref; 1/1 coding child actions carry runtime/readback links; 1 parent/child dependencies recorded; 1/1 coding child actions expose bounded validation readback; 1/1 owner/human task readbacks carry resume or blocker linkage; 2/2 model roles emitted bounded artifact evidence (orchestrator via openai-codex/gpt-5.5, implementation_engineer via moonshotai/kimi-k2.6); planning/implementation handoff visible (orchestrator via openai-codex/gpt-5.5 -> implementation_engineer via moonshotai/kimi-k2.6).",
    );
    expect(container.textContent).toContain("Parent/child readback");
    expect(container.textContent).toContain(
      "artifact://approved-plan/kimi-codex-readiness -> Implementation (agent_team.coding) -> validation://kimi-codex-readiness | Owner decision (human/operator) -> human-task://task-1",
    );
    expect(container.textContent).toContain("Implementation");
    expect(container.textContent).toContain("agent_team.coding");
    expect(container.textContent).toContain("validation://kimi-codex-readiness");
    expect(container.textContent).toContain(
      "repo://extensions/execution-platform/src/workflows/runtime.ts",
    );
    expect(container.textContent).toContain("Role invocations");
    expect(container.textContent).toContain("openai-codex/gpt-5.5");
    expect(container.textContent).toContain("moonshotai/kimi-k2.6");
    expect(container.textContent).toContain("Artifacts: runtime-work-graph://plan");
    expect(container.textContent).toContain("Artifacts: repo://file");
    expect(container.textContent).toContain("Human tasks");
    expect(container.textContent).toContain("human-task-1");
    expect(container.textContent).toContain("Validation/repair");
    expect(container.textContent).toContain("Validation readback");
    expect(container.textContent).toContain(
      "1 loop(s) recorded; passed_after_repair: validation://focused-test -> graph://repair",
    );
    expect(container.textContent).toContain("Validation/repair details");
    expect(container.textContent).toContain("validation://focused-test");
    expect(container.textContent).toContain("passed_after_repair");
    expect(container.textContent).toContain("runtime jobs");
    expect(container.textContent).toContain("Work Queue lifecycle mutation is not allowed");
    expect(container.textContent).not.toContain("raw prompt");
  });

  it("renders convergence slice planning separately from runtime lifecycle", () => {
    const item = makeObject("convergence-slice", {
      title: "Work Queue Canonical Slice Tracker",
      convergenceSlice: {
        sliceId: "openclaw-convergence.slice-02",
        title: "Work Queue Canonical Slice Tracker",
        track: "openclaw-platform-convergence",
        wave: "wave-1-foundation",
        planningStatus: "in_progress",
        priority: 2,
        dependsOnSliceIds: ["openclaw-convergence.slice-01"],
        sourceDocRefs: ["docs/projects/execution-platform/roadmap.md"],
        artifactRefs: [
          ".artifacts/execution-platform/work-queue-canonical-slice-tracker-preflight.json",
        ],
        runtimeJobRefs: [],
        blockerReasonCodes: [],
        nextAction: "Finish tracker readback and closeout.",
        ownerSystemArea: "work-queue",
        runtimeState: {
          lifecycleState: "draft",
          runCount: 0,
          runtimeJobIds: [],
          lifecycleTruthSource: "work_queue_repository",
          planningStatusIsLifecycleState: false,
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawLogsStored: false,
        workQueueLifecycleMutationAllowed: false,
      },
    });
    const container = document.createElement("div");

    render(
      renderWorkQueue(
        createProps({
          items: [item],
          selectedObject: item,
          filter: "active",
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("Convergence slice");
    expect(container.textContent).toContain("openclaw-convergence.slice-02");
    expect(container.textContent).toContain("in_progress");
    expect(container.textContent).toContain("Planning status is tracker metadata");
    expect(container.textContent).toContain("Work Queue lifecycle");
    expect(container.textContent).toContain("draft");
    expect(container.textContent).not.toContain("raw prompt");
  });

  it("does not show stale draft CTAs for auto-drafted plan or skill items", () => {
    const plan = makeObject("auto-plan", {
      visibleStatus: "drafted",
      statusLabel: "Drafted",
      artifact: {
        kind: "plan",
        title: "Auto Plan",
        body: "Full auto-drafted plan body",
        summary: "Auto plan summary",
        codexPrompt: null,
        path: null,
        versionLabel: "Plan draft v1",
        updatedAt: "2026-05-01T00:00:00.000Z",
        openQuestions: ["Should validation stay focused?"],
      },
    });
    const skill = makeObject("auto-skill", {
      lane: "skills",
      laneLabel: "Skills",
      objectClass: "existing_skill_enhancement",
      objectClassLabel: "Existing skill enhancement",
      title: "Improve Candidate Review Validation",
      statusLabel: "Skill draft ready",
      artifact: {
        kind: "skill",
        title: "Improve Candidate Review Validation",
        body: "## Purpose\nImprove candidate review validation.\n\n## Success Checks\n- Review passes.",
        summary: "Skill draft summary",
        codexPrompt: null,
        path: "/tmp/skill-draft",
        versionLabel: "Draft v1",
        updatedAt: "2026-05-01T00:00:00.000Z",
        openQuestions: ["Should this merge into an existing skill?"],
      },
    });
    const container = document.createElement("div");

    render(
      renderWorkQueue(
        createProps({
          items: [plan, skill],
          selectedObject: skill,
          filter: "active",
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("Skill draft ready");
    expect(container.textContent).toContain("Improve Candidate Review Validation");
    expect(container.textContent).not.toContain("Draft skill");
    expect(container.textContent).not.toContain("Draft plan");
    expect(container.textContent).toContain("Request revision");
    expect(container.textContent).toContain("Finalize");
  });

  it("maps auto-drafted existing skill enhancements into the Skills lane without a Draft CTA", () => {
    const base = makeObject("enhancement-a");
    const [item] = buildWorkQueueObjects({
      queue: [
        {
          ...base.queueItem,
          opportunityClass: "skill_candidate",
          draftReady: true,
          plannedArtifact: null,
          skillifierDraft: {
            skillPackageId: "skill-package-enhancement-a",
            skillifierReportId: "skillifier-report-enhancement-a",
            decision: "draft_ready",
            packageTitle: "Work Queue UX Review Outcome Pack Gate",
            draftPath: "/tmp/work-queue-ux-review--draft",
            reviewSummary:
              "Review-only enhancement draft for the existing Work Queue UX Review skill.",
            nextReviewStep:
              "Review the enhancement draft and decide whether to revise or finalize.",
          },
          userFacingBrief: {
            ...base.queueItem.userFacingBrief!,
            skillPresentationKind: "existing_skill_enhancement",
            kindLabel: "Improve skill",
            title: "Improve Work Queue UX Review",
          },
        },
      ],
      digest: null,
    });
    const container = document.createElement("div");

    render(
      renderWorkQueue(
        createProps({
          items: [item],
          selectedObject: item,
          filter: "active",
        }),
      ),
      container,
    );

    expect(item).toMatchObject({
      lane: "skills",
      objectClass: "existing_skill_enhancement",
      visibleStatus: "drafted",
      statusLabel: "Skill draft ready",
    });
    expect(container.textContent).toContain("Existing skill enhancement");
    expect(container.textContent).toContain("Skill draft ready");
    expect(container.textContent).toContain(
      "Review-only enhancement draft for the existing Work Queue UX Review skill.",
    );
    expect(container.textContent).not.toContain("Draft skill");
  });

  it("keeps user-action draft failures visible with bounded retry context", () => {
    const failed = makeObject("failed-draft", {
      visibleStatus: "failed",
      statusLabel: "Failed",
      diagnostics: ["Draft generation failed: destination policy blocked the workspace path."],
      queueItem: {
        ...makeObject("failed-draft").queueItem,
        handoffStatus: "failed",
        handoffError: "Draft generation failed: destination policy blocked the workspace path.",
        plannedArtifact: {
          status: "failed",
          title: "Failed draft",
          requestSummary: "Draft request failed before artifact generation.",
          generatedAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      },
      artifact: {
        kind: "plan",
        title: "Failed draft",
        body: "Draft request failed before artifact generation.",
        summary: "The user-triggered draft failed and remains attached to this item.",
        codexPrompt: null,
        path: null,
        versionLabel: "Plan request v1",
        updatedAt: "2026-05-01T00:00:00.000Z",
        openQuestions: [],
      },
    });
    const container = document.createElement("div");

    render(
      renderWorkQueue(
        createProps({
          items: [failed],
          selectedObject: failed,
          filter: "active",
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("Action failed");
    expect(container.textContent).toContain("destination policy blocked");
    expect(container.textContent).toContain("retry from this detail view");
    expect(failed.lane).not.toBe("diagnostics");
  });

  it("renders show more as view-only pagination for long lists", () => {
    const items = Array.from({ length: 11 }, (_, index) =>
      makeObject(`overflow-${index + 1}`, {
        title: `Overflow ${index + 1}`,
      }),
    );
    const container = document.createElement("div");
    render(
      renderWorkQueue(
        createProps({
          items,
          selectedObject: items[0] ?? null,
        }),
      ),
      container,
    );

    expect(container.textContent).toContain("Show more (1)");
    expect(container.textContent).toContain("Overflow 10");
    expect(
      container.querySelectorAll(".work-queue-list > .work-queue-list-group .work-queue-list-item"),
    ).toHaveLength(10);
    expect(container.querySelectorAll(".work-queue-show-more .work-queue-list-item")).toHaveLength(
      1,
    );
    const details = container.querySelector(".work-queue-show-more") as HTMLDetailsElement;
    expect(details.open).toBe(false);
  });

  it("uses callbacks for list selection and filter changes", () => {
    const onSelectObject = vi.fn();
    const onSetFilter = vi.fn();
    const item = makeObject("callback-a");
    const container = document.createElement("div");
    render(
      renderWorkQueue(
        createProps({
          items: [item],
          selectedObject: item,
          onSelectObject,
          onSetFilter,
        }),
      ),
      container,
    );

    (container.querySelector(".work-queue-list-item") as HTMLButtonElement).click();
    expect(onSelectObject).toHaveBeenCalledWith(item.id);
    Array.from(container.querySelectorAll<HTMLButtonElement>(".work-queue-filter"))
      .find((button) => button.textContent?.includes("Closed"))
      ?.click();
    expect(onSetFilter).toHaveBeenCalledWith("ready_to_execute");
  });

  it("renders DB-backed runtime queue items as read-only active/closed projection", () => {
    const [active, closed] = buildDbWorkQueueObjects({
      items: [
        {
          workItemId: "db-active-item",
          itemType: "execution_workflow",
          title: "DB active item",
          description: "Active DB item",
          lifecycleState: "running",
          queueStatus: "active",
          queuePosition: 1,
          queueRank: 1,
          closedAt: null,
          updatedAt: "2026-05-14T10:00:00.000Z",
          runtimeJobIds: ["runtime-active"],
          graphRef: "runtime-work-graph://graph-active",
          validationRef: null,
          closeoutCapsuleRef: null,
          ownerReadbackRef: null,
          convergenceSlice: null,
        },
        {
          workItemId: "db-closed-item",
          itemType: "execution_workflow",
          title: "DB closed item",
          description: "Closed DB item",
          lifecycleState: "succeeded",
          queueStatus: "closed",
          queuePosition: 1,
          queueRank: null,
          closedAt: "2026-05-14T10:05:00.000Z",
          updatedAt: "2026-05-14T10:05:00.000Z",
          runtimeJobIds: ["runtime-closed"],
          graphRef: "runtime-work-graph://graph-closed",
          validationRef: "validation://closed",
          closeoutCapsuleRef: "closeout://closed",
          ownerReadbackRef: "readback://closed",
          convergenceSlice: null,
        },
      ],
      details: {},
    });
    const activeItems = filterWorkQueueObjects([active, closed], "active", "");
    const closedItems = filterWorkQueueObjects([active, closed], "ready_to_execute", "");
    const container = document.createElement("div");

    render(
      renderWorkQueue(
        createProps({
          items: activeItems,
          selectedObject: active,
          filter: "active",
        }),
      ),
      container,
    );

    expect(activeItems.map((item) => item.id)).toEqual(["db-active-item"]);
    expect(closedItems.map((item) => item.id)).toEqual(["db-closed-item"]);
    expect(container.textContent).toContain("DB active item");
    expect(container.textContent).toContain("1. DB active item");
    expect(container.textContent).toContain("#1");
    expect(container.textContent).toContain("Refresh runtime readback");
    expect(container.textContent).not.toContain("Draft plan");
    expect(container.textContent).not.toContain("Finalize");
  });

  it("renders DB queue position and title as the owner-facing identity", () => {
    const [item] = buildDbWorkQueueObjects({
      items: [
        {
          workItemId: "openclaw-convergence.active-queue-45",
          itemType: "execution_workflow",
          title: "Release rollback runbook closeout",
          description: "Close the release and rollback runbook work.",
          lifecycleState: "running",
          queueStatus: "active",
          queuePosition: 1,
          queueRank: 1,
          closedAt: null,
          updatedAt: "2026-05-14T10:00:00.000Z",
          runtimeJobIds: [],
          graphRef: null,
          validationRef: null,
          closeoutCapsuleRef: null,
          ownerReadbackRef: null,
          convergenceSlice: null,
        },
      ],
      details: {},
    });
    const container = document.createElement("div");

    render(
      renderWorkQueue(
        createProps({
          items: [item],
          selectedObject: item,
          filter: "active",
        }),
      ),
      container,
    );

    expect(container.querySelector(".work-queue-list-item__title")?.textContent).toContain(
      "1. Release rollback runbook closeout",
    );
    expect(container.querySelector(".work-queue-detail h2")?.textContent).toContain(
      "1. Release rollback runbook closeout",
    );
    expect(container.textContent).toContain("Technical id");
    expect(container.textContent).toContain("openclaw-convergence.active-queue-45");
  });
});
