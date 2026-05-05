/* @vitest-environment jsdom */

import { render } from "lit";
import { describe, expect, it, vi } from "vitest";
import type { WorkQueueFilter } from "../types.ts";
import type { WorkQueueObject } from "../work-queue.ts";
import { buildWorkQueueObjects, filterWorkQueueObjects } from "../work-queue.ts";
import { renderWorkQueue, type WorkQueueProps } from "./work-queue.ts";

function makeObject(id: string, overrides: Partial<WorkQueueObject> = {}): WorkQueueObject {
  return {
    id,
    queueItemId: `queue-${id}`,
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

describe("work queue view", () => {
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

  it("renders finalized items under Ready to Execute", () => {
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

    expect(container.textContent).toContain("Ready to Execute");
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
          lifecycleState: "running",
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
    expect(container.textContent).toContain("rebuild-authority-v2: succeeded");
    expect(container.textContent).toContain("execution_platform_runtime_jobs");
    expect(container.textContent).toMatch(/UI lifecycle mutation is\s+not available/u);
    expect(container.textContent).not.toContain("Run execution");
    expect(container.textContent).toContain("Execution controls are read-only");
  });

  it("renders server-backed execution control buttons only when callbacks exist", () => {
    const item = makeObject("execution-controls", {
      execution: {
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
      .find((button) => button.textContent?.includes("Ready to execute"))
      ?.click();
    expect(onSetFilter).toHaveBeenCalledWith("ready_to_execute");
  });
});
