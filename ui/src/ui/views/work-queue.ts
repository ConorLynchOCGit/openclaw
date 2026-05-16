import { html, nothing, type TemplateResult } from "lit";
import type { WorkQueueFilter } from "../types.ts";
import type { WorkQueueObject } from "../work-queue.ts";

export type WorkQueueProps = {
  items: WorkQueueObject[];
  selectedObject: WorkQueueObject | null;
  filter: WorkQueueFilter;
  searchQuery: string;
  loading: boolean;
  error: string | null;
  pushMode?: "idle" | "subscribed" | "fallback_polling" | "gap_replaying";
  pushError?: string | null;
  eventCursor?: number | null;
  notifications: Array<{
    id: string;
    kind: "success" | "error";
    text: string;
    objectId?: string | null;
  }>;
  revisionDrafts: Record<string, string>;
  artifactBodies: Record<string, string>;
  onRefresh: () => Promise<unknown> | void;
  onSelectObject: (objectId: string | null) => void;
  onSetFilter: (filter: WorkQueueFilter) => void;
  onSetSearchQuery: (value: string) => void;
  onDismissNotification: (notificationId: string) => void;
  onUpdateRevisionDraft: (objectId: string, value: string) => void;
  onDraft: (object: WorkQueueObject) => Promise<unknown> | void;
  onFinalize: (objectId: string) => Promise<unknown> | void;
  onRequestRevision: (objectId: string) => Promise<unknown> | void;
  onRestore: (objectId: string) => Promise<unknown> | void;
  onMarkComplete: (objectId: string) => Promise<unknown> | void;
  onCopyCodexPrompt: (objectId: string) => Promise<unknown> | void;
  onDismiss: (queueItemId: string) => Promise<unknown> | void;
  onPauseExecution?: (object: WorkQueueObject) => Promise<unknown> | void;
  onRedirectExecution?: (object: WorkQueueObject) => Promise<unknown> | void;
  onCancelExecution?: (object: WorkQueueObject) => Promise<unknown> | void;
  onSubmitHumanTaskResponse?: (input: {
    object: WorkQueueObject;
    graphId: string;
    humanTaskId: string;
    boundedResponseRef: string;
  }) => Promise<unknown> | void;
};

const FILTERS: Array<{ id: WorkQueueFilter; label: string }> = [
  { id: "active", label: "All active" },
  { id: "build_plans", label: "Build plans" },
  { id: "skills", label: "Skills" },
  { id: "tooling", label: "Tooling" },
  { id: "user_review", label: "User review" },
  { id: "ready_to_execute", label: "Closed" },
  { id: "dismissed", label: "Archived" },
  { id: "diagnostics", label: "Diagnostics" },
];

const DEFAULT_VISIBLE_ITEMS = 10;

function groupLabelForFilter(filter: WorkQueueFilter, items: WorkQueueObject[]): string | null {
  switch (filter) {
    case "ready_to_execute":
      return "Closed";
    case "dismissed":
      return "Dismissed";
    case "diagnostics":
      return "Diagnostics";
    case "build_plans":
      return "Build Plans";
    case "skills":
      return "Skills";
    case "tooling":
      return "Tooling";
    case "user_review":
      return "User Review";
    default:
      return items.length > 0 ? null : "Active";
  }
}

function groupItems(
  filter: WorkQueueFilter,
  items: WorkQueueObject[],
): Array<{ label: string; items: WorkQueueObject[] }> {
  const singleLabel = groupLabelForFilter(filter, items);
  if (singleLabel) {
    return [{ label: singleLabel, items }];
  }
  const groups = new Map<string, WorkQueueObject[]>();
  for (const item of items) {
    const existing = groups.get(item.laneLabel) ?? [];
    existing.push(item);
    groups.set(item.laneLabel, existing);
  }
  return [...groups.entries()].map(([label, groupedItems]) => ({ label, items: groupedItems }));
}

function renderNotifications(props: WorkQueueProps) {
  if (props.notifications.length === 0) {
    return nothing;
  }
  return html`
    <div class="work-queue-notifications" aria-live="polite">
      ${props.notifications.map(
        (notification) => html`
          <div class="work-queue-notification work-queue-notification--${notification.kind}">
            <div class="work-queue-notification__text">${notification.text}</div>
            <button
              type="button"
              class="btn btn--ghost btn--sm"
              @click=${() => props.onDismissNotification(notification.id)}
            >
              Dismiss
            </button>
          </div>
        `,
      )}
    </div>
  `;
}

function renderListItem(props: WorkQueueProps, item: WorkQueueObject) {
  const selected = props.selectedObject?.id === item.id;
  const displayTitle =
    item.queuePosition === null ? item.title : `${item.queuePosition}. ${item.title}`;
  return html`
    <button
      type="button"
      class="work-queue-list-item ${selected ? "work-queue-list-item--selected" : ""}"
      @click=${() => props.onSelectObject(item.id)}
    >
      <div class="work-queue-list-item__top">
        ${item.queuePosition === null
          ? nothing
          : html`<span class="work-queue-chip">#${item.queuePosition}</span>`}
        <span class="work-queue-chip">${item.laneLabel}</span>
        <span class="work-queue-chip work-queue-chip--priority">${item.priorityBand}</span>
      </div>
      <div class="work-queue-list-item__title">${displayTitle}</div>
      <div class="work-queue-list-item__summary">${item.summary}</div>
      <div class="work-queue-list-item__meta">
        <span>${item.statusLabel}</span>
        <span>${item.objectClassLabel}</span>
      </div>
    </button>
  `;
}

function renderArtifactSection(props: WorkQueueProps, item: WorkQueueObject) {
  const artifact = item.artifact;
  const artifactBody = props.artifactBodies[item.id] ?? artifact.body;
  if (artifact.kind === "none") {
    return html`
      <section class="work-queue-detail-section">
        <h3>Draft artifact</h3>
        <p>No draft artifact exists yet.</p>
      </section>
    `;
  }
  return html`
    <section class="work-queue-detail-section">
      <div class="work-queue-detail-section__header">
        <h3>${artifact.kind === "skill" ? "Skill draft" : "Build plan"}</h3>
        <span class="work-queue-detail-section__meta">${artifact.versionLabel}</span>
      </div>
      ${artifact.path ? html`<div class="work-queue-detail-path">${artifact.path}</div>` : nothing}
      ${artifact.summary
        ? html`<p class="work-queue-detail-summary">${artifact.summary}</p>`
        : nothing}
      ${artifactBody
        ? html`<pre class="work-queue-artifact-body"><code>${artifactBody}</code></pre>`
        : html`<p class="work-queue-detail-summary">
            Full artifact text will load from the durable draft path.
          </p>`}
    </section>
  `;
}

function renderOpenQuestions(item: WorkQueueObject) {
  if (item.artifact.openQuestions.length === 0) {
    return nothing;
  }
  return html`
    <section class="work-queue-detail-section">
      <h3>Open questions</h3>
      <ul class="work-queue-question-list">
        ${item.artifact.openQuestions.map((question) => html`<li>${question}</li>`)}
      </ul>
    </section>
  `;
}

function renderFailureStatus(item: WorkQueueObject) {
  if (item.visibleStatus !== "failed") {
    return nothing;
  }
  return html`
    <section class="work-queue-detail-section work-queue-detail-section--failure">
      <h3>Action failed</h3>
      <p>
        This work item remains visible because the failure came from an item-level action. Review
        the bounded status below, then retry from this detail view when safe.
      </p>
      ${item.diagnostics.length > 0
        ? html`
            <ul class="work-queue-history-list">
              ${item.diagnostics.slice(0, 4).map((entry) => html`<li>${entry}</li>`)}
            </ul>
          `
        : nothing}
    </section>
  `;
}

function renderConvergenceSliceTracker(item: WorkQueueObject) {
  const slice = item.convergenceSlice;
  if (!slice) {
    return nothing;
  }
  return html`
    <section class="work-queue-detail-section" aria-label="Convergence slice tracker">
      <div class="work-queue-detail-section__header">
        <h3>Convergence slice</h3>
        <span class="work-queue-detail-section__meta">${slice.planningStatus}</span>
      </div>
      <div class="work-queue-evidence-grid">
        <div>
          <strong>Technical id</strong>
          <div>${slice.sliceId}</div>
        </div>
        <div>
          <strong>Track</strong>
          <div>${slice.track}</div>
        </div>
        <div>
          <strong>Wave</strong>
          <div>${slice.wave}</div>
        </div>
        <div>
          <strong>Owner area</strong>
          <div>${slice.ownerSystemArea}</div>
        </div>
        <div>
          <strong>Priority</strong>
          <div>${slice.priority}</div>
        </div>
        <div>
          <strong>Dependencies</strong>
          <div>${slice.dependsOnSliceIds.join(", ") || "None"}</div>
        </div>
        <div>
          <strong>Blockers</strong>
          <div>${slice.blockerReasonCodes.join(", ") || "None"}</div>
        </div>
        <div>
          <strong>Runtime refs</strong>
          <div>${slice.runtimeJobRefs.length} refs</div>
        </div>
        <div>
          <strong>Work Queue lifecycle</strong>
          <div>${slice.runtimeState.lifecycleState}</div>
        </div>
        <div>
          <strong>Lifecycle source</strong>
          <div>${slice.runtimeState.lifecycleTruthSource}</div>
        </div>
      </div>
      <p class="work-queue-detail-summary">${slice.nextAction ?? "No next action recorded."}</p>
      <p class="work-queue-detail-summary">
        Planning status is tracker metadata, not execution lifecycle. Work Queue lifecycle mutation
        is not allowed.
      </p>
      <details class="work-queue-detail-section">
        <summary>Slice refs</summary>
        <div class="work-queue-evidence-grid">
          <div>
            <strong>Docs</strong>
            <div>${slice.sourceDocRefs.slice(0, 6).join(", ") || "None"}</div>
          </div>
          <div>
            <strong>Artifacts</strong>
            <div>${slice.artifactRefs.slice(0, 6).join(", ") || "None"}</div>
          </div>
        </div>
      </details>
    </section>
  `;
}

function renderEvidence(item: WorkQueueObject) {
  return html`
    <details class="work-queue-detail-section">
      <summary>Evidence</summary>
      <div class="work-queue-evidence-grid">
        <div>
          <strong>Source refs</strong>
          <div>${item.sourceRefs.join(", ") || "None"}</div>
        </div>
        ${item.stableTechnicalId
          ? html`
              <div>
                <strong>Technical id</strong>
                <div>${item.stableTechnicalId}</div>
              </div>
            `
          : nothing}
        <div>
          <strong>Authority tiers</strong>
          <div>${item.authorityTiers.join(", ") || "None"}</div>
        </div>
        <div>
          <strong>Proof hashes</strong>
          <div>${item.proofHashes.slice(0, 4).join(", ") || "None"}</div>
        </div>
        ${item.evidenceSummary
          ? html`
              <div>
                <strong>Evidence summary</strong>
                <div>${item.evidenceSummary}</div>
              </div>
            `
          : nothing}
      </div>
    </details>
  `;
}

function renderHistory(item: WorkQueueObject) {
  return html`
    <details class="work-queue-detail-section">
      <summary>History</summary>
      <ul class="work-queue-history-list">
        <li>Current status: ${item.statusLabel}</li>
        <li>Last updated: ${item.queueItem.updatedAt}</li>
        ${item.queueItem.handoffMessageAnchor
          ? html`<li>Chat handoff anchor: ${item.queueItem.handoffMessageAnchor}</li>`
          : nothing}
        ${item.queueItem.resolvedByChatMessageId
          ? html`<li>Resolved by chat message: ${item.queueItem.resolvedByChatMessageId}</li>`
          : nothing}
      </ul>
    </details>
  `;
}

function runtimeGraphImplementationReadinessSummary(
  runtimeGraph: NonNullable<NonNullable<WorkQueueObject["execution"]>["runtimeGraph"]>,
): string {
  const approvedParentPlanCount = runtimeGraph.approvedPlanRefs?.length ?? 0;
  const codingChildren = runtimeGraph.childActions.filter((child) => child.actionKind === "coding");
  const codingChildrenWithReadback = codingChildren.filter(
    (child) =>
      Boolean(child.runtimeJobId) || Boolean(child.graphNodeRef) || child.evidenceRefs.length > 0,
  );
  const codingDependencyCount = runtimeGraph.dependencyEdges.filter(
    (edge) =>
      codingChildren.some((child) => child.workItemId === edge.workItemId) ||
      codingChildren.some((child) => child.workItemId === edge.dependsOnWorkItemId),
  ).length;
  const codingChildrenWithValidationReadback = codingChildren.filter((child) =>
    child.evidenceRefs.some((ref) => isValidationLikeRef(ref)),
  );
  const modelRolesWithArtifacts = runtimeGraph.roleInvocations.filter(
    (role) => role.producedArtifactRefs.length > 0,
  );
  const humanTasksWithReadback = runtimeGraph.humanTasks.filter(
    (task) => Boolean(task.resumeTokenRef) || task.blockingGraphNodeRefs.length > 0,
  );
  const modelEvidenceSummary = modelRolesWithArtifacts
    .slice(0, 3)
    .map((role) => `${role.roleId} via ${role.modelRef}`)
    .join(", ");
  const planningRole = modelRolesWithArtifacts.find((role) => role.roleId === "orchestrator");
  const implementationRole = modelRolesWithArtifacts.find(
    (role) => role.roleId === "implementation_engineer",
  );
  const kimiImplementationRoles = modelRolesWithArtifacts.filter(
    (role) =>
      role.roleId === "implementation_engineer" && role.modelRef.toLowerCase().includes("kimi"),
  );
  const codexImplementationRoles = modelRolesWithArtifacts.filter(
    (role) =>
      role.roleId === "implementation_engineer" &&
      !role.modelRef.toLowerCase().includes("kimi") &&
      role.modelRef.toLowerCase().includes("codex"),
  );
  const readinessParts = [
    `${approvedParentPlanCount} approved parent plan ${approvedParentPlanCount === 1 ? "ref" : "refs"}`,
    `${codingChildrenWithReadback.length}/${codingChildren.length} coding child actions carry runtime/readback links`,
    `${codingDependencyCount} parent/child dependencies recorded`,
  ];
  if (codingChildren.length > 0) {
    readinessParts.push(
      `${codingChildrenWithValidationReadback.length}/${codingChildren.length} coding child actions expose bounded validation readback`,
    );
  }
  if (runtimeGraph.humanTasks.length > 0) {
    readinessParts.push(
      `${humanTasksWithReadback.length}/${runtimeGraph.humanTasks.length} owner/human task readbacks carry resume or blocker linkage`,
    );
  }
  readinessParts.push(
    `${modelRolesWithArtifacts.length}/${runtimeGraph.roleInvocations.length} model roles emitted bounded artifact evidence${modelEvidenceSummary ? ` (${modelEvidenceSummary})` : ""}`,
  );
  readinessParts.push(
    kimiImplementationRoles.length > 0
      ? `Kimi standard implementation lane recorded (${kimiImplementationRoles.length} invocation${kimiImplementationRoles.length === 1 ? "" : "s"})`
      : "Kimi standard implementation lane not yet recorded",
  );
  if (codexImplementationRoles.length > 0) {
    readinessParts.push(
      `Codex follow-up lane recorded (${codexImplementationRoles.length} invocation${codexImplementationRoles.length === 1 ? "" : "s"})`,
    );
  }
  if (planningRole && implementationRole) {
    readinessParts.push(
      `planning/implementation handoff visible (${planningRole.roleId} via ${planningRole.modelRef} -> ${implementationRole.roleId} via ${implementationRole.modelRef})`,
    );
  }
  const readinessSummary = `${readinessParts.join("; ")}.`;
  const legacyReadbackSummary = runtimeGraphLegacyImplementationReadinessSummary(readinessSummary);
  return legacyReadbackSummary === readinessSummary
    ? readinessSummary
    : `${legacyReadbackSummary} ${readinessSummary}`;
}

function runtimeGraphLegacyImplementationReadinessSummary(summary: string): string {
  return summary
    .replace(/; Kimi standard implementation lane recorded \(\d+ invocations?\)/u, "")
    .replace(/; Kimi standard implementation lane not yet recorded/u, "")
    .replace(/; Codex follow-up lane recorded \(\d+ invocations?\)/u, "")
    .replace(/;\s+; /u, "; ")
    .replace(/\s+/gu, " ")
    .trim();
}

function isValidationLikeRef(value: string): boolean {
  return value.startsWith("validation://") || /^pnpm test:file\b/u.test(value);
}

const VALIDATION_REPAIR_REASON_CODE_LABELS: Record<string, string> = {
  invalid_no_op_repair_for_failed_validation_corrected:
    "corrected no-op repair linked to passed rerun evidence",
};

function validationRepairReasonCodeSummary(reasonCodes: string[]): string {
  if (reasonCodes.length === 0) {
    return "";
  }
  const summaryCodes = reasonCodes
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .slice(0, 2)
    .map((code) => VALIDATION_REPAIR_REASON_CODE_LABELS[code] ?? code);
  return summaryCodes.length > 0 ? ` [${summaryCodes.join(", ")}]` : "";
}

function runtimeGraphChildReadbackRef(
  child: NonNullable<
    NonNullable<WorkQueueObject["execution"]>["runtimeGraph"]
  >["childActions"][number],
): string {
  return (
    child.runtimeJobId ??
    child.evidenceRefs.find((ref) => isValidationLikeRef(ref)) ??
    child.evidenceRefs[0] ??
    child.graphNodeRef ??
    "not linked"
  );
}

function runtimeGraphValidationReadbackSummary(
  runtimeGraph: NonNullable<NonNullable<WorkQueueObject["execution"]>["runtimeGraph"]>,
): string {
  if (runtimeGraph.validationRepairLoops.length === 0) {
    return "No validation readback recorded.";
  }
  const recentLoops = runtimeGraph.validationRepairLoops
    .slice(0, 2)
    .map((entry) => {
      const reasonCodes = validationRepairReasonCodeSummary(entry.reasonCodes);
      return entry.repairNodeRef
        ? `${entry.status}: ${entry.validationRef} -> ${entry.repairNodeRef}${reasonCodes}`
        : `${entry.status}: ${entry.validationRef}${reasonCodes}`;
    })
    .join(" | ");
  return `${runtimeGraph.validationRepairLoops.length} loop(s) recorded; ${recentLoops}`;
}

function runtimeGraphParentChildReadbackSummary(
  runtimeGraph: NonNullable<NonNullable<WorkQueueObject["execution"]>["runtimeGraph"]>,
): string {
  const parentPlanRef =
    runtimeGraph.approvedPlanRefs?.[0] ?? "No approved parent plan ref recorded";
  const childReadbacks = runtimeGraph.childActions
    .filter((child) => Boolean(child.runtimeJobId) || child.evidenceRefs.length > 0)
    .slice(0, 3)
    .map((child) => {
      const readbackRef = runtimeGraphChildReadbackRef(child);
      return `${child.title ?? child.workItemId} (${child.assignedWorkflow}) -> ${readbackRef}`;
    });
  return childReadbacks.length > 0
    ? `${parentPlanRef} -> ${childReadbacks.join(" | ")}`
    : `${parentPlanRef} -> no child readback links recorded`;
}

type ExecutionSummary = NonNullable<WorkQueueObject["execution"]>;

function planningCapsuleCompileReadiness(execution: ExecutionSummary): string {
  if (execution.ownerProgressReadback?.currentStage) {
    const stage = execution.ownerProgressReadback.currentStage;
    if (/compile/u.test(stage)) {
      return `owner stage indicates compile readiness work (${stage})`;
    }
  }
  const compilerOutcome = execution.workflow?.routing?.compilerOutcome;
  if (compilerOutcome) {
    return compilerOutcome;
  }
  if (
    execution.runtimeGraph?.childActions.some((child) =>
      child.assignedWorkflow.includes("planning"),
    )
  ) {
    return "planning graph present; compile readiness pending";
  }
  return "compile readiness not recorded";
}

function planningSeedRecord(seed: unknown): Record<string, unknown> | null {
  return seed && typeof seed === "object" ? (seed as Record<string, unknown>) : null;
}

function boundedSeedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function planningSeedEvidenceRef(seed: unknown): string | null {
  const record = planningSeedRecord(seed);
  if (!record || !Array.isArray(record.evidenceRefs)) {
    return null;
  }
  const firstRef = record.evidenceRefs.find((value) => typeof value === "string");
  return typeof firstRef === "string" ? firstRef : null;
}

function planningSeedCoverageSummary(seeds: unknown[]): string {
  if (seeds.length === 0) {
    return "0 total";
  }
  const highConfidenceCount = seeds.filter((seed) => {
    const record = planningSeedRecord(seed);
    return (boundedSeedString(record?.confidence) ?? "").toLowerCase().includes("high");
  }).length;
  return `${seeds.length} total (high=${highConfidenceCount})`;
}

function boundedUnknownStringArray(value: unknown, limit = 12): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string").slice(0, limit)
    : [];
}

function planningCapsuleIntakeReadback(execution: ExecutionSummary) {
  const runtimeGraph = execution.runtimeGraph;
  const ownerReadbackRecord = planningSeedRecord(
    (execution as Record<string, unknown>).ownerReadback,
  );
  const ownerPlanningWorkflowRefs = boundedUnknownStringArray(
    ownerReadbackRecord?.planningWorkflowRefs,
    12,
  );
  const ownerChildActionProposalRefs = boundedUnknownStringArray(
    ownerReadbackRecord?.childActionProposalRefs,
    12,
  );
  const ownerHumanDecisionRefs = boundedUnknownStringArray(
    ownerReadbackRecord?.humanDecisionRefs,
    12,
  );
  const opportunitySeeds = Array.isArray(execution.closeoutCapsule?.opportunitySeeds)
    ? execution.closeoutCapsule.opportunitySeeds
    : [];
  const seedCoverageSummary = planningSeedCoverageSummary(opportunitySeeds);
  const closeoutCapsuleRuntimeRef =
    execution.closeoutCapsule?.factualRefs?.runtimeJobId && execution.closeoutCapsule?.capsuleId
      ? `runtime-job://${execution.closeoutCapsule.factualRefs.runtimeJobId}/closeout-capsule/${execution.closeoutCapsule.capsuleId}`
      : null;
  const primarySeed = opportunitySeeds[0],
    seedRecord = planningSeedRecord(primarySeed),
    seedRationale = boundedSeedString(seedRecord?.rationale),
    seedRecommendedStep = boundedSeedString(primarySeed?.recommendedNextStep),
    seedEvidenceRef = planningSeedEvidenceRef(primarySeed),
    seedConfidence = boundedSeedString(primarySeed?.confidence);
  const seedKind = boundedSeedString(seedRecord?.kind);
  const seedTitle = boundedSeedString(seedRecord?.title);
  const seedIdentity = [seedKind, seedTitle]
    .filter((value): value is string => Boolean(value))
    .join(": ");
  const seedNarrative = [
    seedIdentity ? `seed=${seedIdentity}` : null,
    seedRationale,
    seedRecommendedStep,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" | ");
  const opportunitySeedRationale =
    (seedNarrative || null) ??
    runtimeGraph?.ownerObjectiveSummary ??
    execution.closeoutCapsule?.humanReport?.reportMarkdown ??
    "not recorded";
  const opportunitySeedRationaleSummary =
    seedConfidence && seedEvidenceRef
      ? `${opportunitySeedRationale} (confidence=${seedConfidence}; seed_ref=${seedEvidenceRef})`
      : seedConfidence
        ? `${opportunitySeedRationale} (confidence=${seedConfidence})`
        : seedEvidenceRef
          ? `${opportunitySeedRationale} (seed_ref=${seedEvidenceRef})`
          : opportunitySeedRationale;
  const qualityReviewState = [
    `workflow=${execution.reviewStatus}`,
    `owner=${execution.ownerProgressReadback?.state ?? "unknown"}`,
    `quality=${execution.closeoutCapsule?.structuredSummary?.qualityAssessment ?? "unknown"}`,
    `validation=${execution.ownerProgressReadback?.validationEvidenceState ?? execution.validationStatus ?? "unknown"}`,
    `closeout=${execution.ownerProgressReadback?.closeoutEvidenceState ?? execution.closeoutStatus ?? "unknown"}`,
    `planning_owner=${boundedSeedString(ownerReadbackRecord?.state) ?? "unknown"}`,
    `seeds=${seedCoverageSummary}`,
  ].join("; ");
  const planningRefPattern = /(?:planning|plan|child-action|runtime-work-graph|version)/iu;
  const planningCapsuleRef =
    uniqueRefs(
      [
        ...(runtimeGraph?.approvedPlanRefs ?? []),
        ...(runtimeGraph?.artifactRefs ?? []).filter((ref) => planningRefPattern.test(ref)),
        ...ownerPlanningWorkflowRefs,
        ...ownerChildActionProposalRefs,
        ...ownerHumanDecisionRefs.filter((ref) => planningRefPattern.test(ref)),
        closeoutCapsuleRuntimeRef,
        runtimeGraph?.graphId ? `runtime-graph://${runtimeGraph.graphId}` : null,
        execution.workflow?.artifactRefs.find((ref) => planningRefPattern.test(ref)) ?? null,
        execution.artifactRefs.find((ref) => planningRefPattern.test(ref)) ?? null,
      ],
      12,
    ).join(" | ") || "not recorded";
  const proposedChildActions =
    runtimeGraph?.childActions.slice(0, 3).map((child) => {
      const childRef =
        child.runtimeJobId ?? child.graphNodeRef ?? child.evidenceRefs[0] ?? "not linked";
      return `${child.title ?? child.workItemId} (${child.assignedWorkflow} -> ${childRef})`;
    }) ??
    runtimeGraph?.roleInvocations.slice(0, 3).map((role) => {
      const roleRef = role.modelRunRef ?? role.producedArtifactRefs[0] ?? "not linked";
      return `${role.roleId} (${role.modelRef} -> ${roleRef})`;
    }) ??
    [];
  const implementationAttempts =
    runtimeGraph?.roleInvocations.filter((role) => role.roleId === "implementation_engineer") ?? [];
  const implementationAttemptSummary =
    implementationAttempts.length > 0
      ? `${implementationAttempts.length} attempt(s): ${implementationAttempts.map((role) => role.modelRef).join(", ")}; statuses=${implementationAttempts.map((role) => `${role.modelRef}:${role.status}`).join(", ")}${implementationAttempts.some((role) => role.modelRef.toLowerCase().includes("kimi")) ? `; kimi=${implementationAttempts.filter((role) => role.modelRef.toLowerCase().includes("kimi")).length}` : ""}${implementationAttempts.some((role) => role.modelRef.toLowerCase().includes("codex")) ? `; codex=${implementationAttempts.filter((role) => role.modelRef.toLowerCase().includes("codex")).length}` : ""}`
      : "no implementation worker attempt recorded";
  const validationRepairSummary =
    runtimeGraph && runtimeGraph.validationRepairLoops.length > 0
      ? runtimeGraph.validationRepairLoops
          .slice(0, 2)
          .map((entry) => {
            const reasonCodes = validationRepairReasonCodeSummary(entry.reasonCodes);
            if (entry.repairNodeRef) {
              return `${entry.status}: ${entry.validationRef} -> ${entry.repairNodeRef}${reasonCodes}`;
            }
            return `${entry.status}: ${entry.validationRef}${reasonCodes}`;
          })
          .join(" | ")
      : `${execution.validationStatus} (no validation/repair loop refs)`;
  const finalCloseoutRef =
    runtimeGraph?.finalCloseoutRef ??
    runtimeGraph?.closeoutRef ??
    closeoutCapsuleRuntimeRef ??
    execution.closeoutCapsule?.capsuleId ??
    execution.closeoutStatus;
  const finalCloseout = `${finalCloseoutRef ?? "not recorded"} (state=${execution.closeoutStatus})`;
  const eli5Progress =
    execution.ownerProgressReadback?.eli5Progress ??
    runtimeGraph?.eli5Progress ??
    execution.closeoutCapsule?.humanReport?.eli5Progress ??
    "unknown";
  return {
    opportunitySeedRationale: opportunitySeedRationaleSummary,
    opportunitySeedCoverage: seedCoverageSummary,
    qualityReviewState,
    planningCapsuleRef,
    proposedChildActions,
    compileReadiness: planningCapsuleCompileReadiness(execution),
    implementationAttemptSummary,
    validationRepairSummary,
    finalCloseout,
    eli5Progress,
  };
}

function uniqueRefs(values: Array<string | null | undefined>, maxItems = 10): string[] {
  const refs = new Set<string>();
  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) {
      continue;
    }
    refs.add(normalized);
    if (refs.size >= maxItems) {
      break;
    }
  }
  return [...refs];
}

function allUniqueRefs(values: Array<string | null | undefined>): string[] {
  return uniqueRefs(values, 1_000);
}

function refsMatching(refs: string[], pattern: RegExp, maxItems = 10): string[] {
  return uniqueRefs(
    refs.filter((ref) => pattern.test(ref)),
    maxItems,
  );
}

function cappedRefSummary(input: {
  shownCount: number;
  totalCount: number;
  cap: number;
  label: string;
}): string {
  const hiddenCount = Math.max(0, input.totalCount - input.shownCount);
  const base = `${input.shownCount}/${input.totalCount} ${input.label} shown (cap ${input.cap})`;
  return hiddenCount > 0 ? `${base}; ${hiddenCount} hidden` : base;
}

function skillifierOpportunitySeedQuality(
  opportunitySeedRef: string | null,
  opportunityState: string | null | undefined,
): string {
  if (!opportunitySeedRef) {
    return "missing seed ref";
  }
  switch (opportunityState) {
    case "accepted":
      return "linked and accepted";
    case "needs_review":
      return "linked and needs review";
    case "blocked":
      return "linked but blocked";
    case "stale":
      return "linked but stale";
    case "duplicate_suppressed":
      return "linked and duplicate suppressed";
    case "reviewed":
    case "captured":
      return `linked (${opportunityState})`;
    default:
      return "linked (state unknown)";
  }
}

function skillifierCloseoutCapsuleQuality(
  closeoutCapsuleRef: string | null,
  closeoutCapsuleHash: string | null,
): string {
  if (!closeoutCapsuleRef) {
    return "missing capsule ref";
  }
  return closeoutCapsuleHash ? "ref + hash linked" : "ref linked; hash missing";
}

function skillifierOpportunityStateSupportsFollowOnSoak(
  opportunityState: string | null | undefined,
): boolean {
  return opportunityState === "accepted" || opportunityState === "reviewed";
}

function skillifierProactivityGateSummary(input: {
  opportunityState: string | null | undefined;
  opportunitySeedRef: string | null;
  closeoutCapsuleRefCount: number;
  roleModelRefCount: number;
  validationRefCount: number;
  reviewRefCount: number;
}): string {
  return [
    skillifierOpportunityStateSupportsFollowOnSoak(input.opportunityState)
      ? `opportunity_state=${input.opportunityState ?? "unknown"} ready`
      : `opportunity_state=${input.opportunityState ?? "unknown"} needs_review`,
    input.opportunitySeedRef ? "seed_ref linked" : "seed_ref missing",
    input.closeoutCapsuleRefCount > 0
      ? "closeout_capsule_ref linked"
      : "closeout_capsule_ref missing",
    input.roleModelRefCount > 0 ? "role_model_refs linked" : "role_model_refs missing",
    input.validationRefCount > 0 || input.reviewRefCount > 0
      ? "validation_evidence linked"
      : "validation_evidence missing",
  ].join("; ");
}

function skillifierFollowOnSoakChecklist(input: {
  opportunityState: string | null | undefined;
  opportunitySeedRef: string | null;
  closeoutCapsuleRefCount: number;
  roleModelRefCount: number;
  validationEvidenceRefCount: number;
  closeoutCapsuleCoverageSummary: string;
  roleModelCoverageSummary: string;
  validationCoverageSummary: string;
}) {
  const opportunityState = input.opportunityState ?? "unknown";
  const seedReady =
    Boolean(input.opportunitySeedRef) &&
    skillifierOpportunityStateSupportsFollowOnSoak(input.opportunityState);
  const closeoutReady = input.closeoutCapsuleRefCount > 0;
  const roleModelReady = input.roleModelRefCount > 0;
  const validationReady = input.validationEvidenceRefCount > 0;
  const checks = [
    {
      checkId: "opportunity_seed_quality",
      status: seedReady ? "ready" : "needs_review",
      summary: seedReady
        ? `seed ref linked with opportunity state ${opportunityState}`
        : `seed ref missing or opportunity state ${opportunityState} not follow-on ready`,
    },
    {
      checkId: "closeout_capsule_refs",
      status: closeoutReady ? "ready" : "needs_review",
      summary: closeoutReady
        ? input.closeoutCapsuleCoverageSummary
        : "closeout capsule refs missing",
    },
    {
      checkId: "role_model_refs",
      status: roleModelReady ? "ready" : "needs_review",
      summary: roleModelReady ? input.roleModelCoverageSummary : "role/model refs missing",
    },
    {
      checkId: "bounded_validation_evidence",
      status: validationReady ? "ready" : "needs_review",
      summary: validationReady
        ? input.validationCoverageSummary
        : "bounded validation evidence missing",
    },
  ] as const;
  return {
    state: checks.every((check) => check.status === "ready") ? "ready" : "needs_review",
    checks,
  };
}

function skillifierRuntimeViewModel(item: WorkQueueObject) {
  const execution = item.execution;
  const skillifier = execution?.skillifier;
  const workflowSkillifier = execution?.workflow?.extension?.skillifier ?? null;
  if (!execution || (!skillifier && !workflowSkillifier)) {
    return null;
  }
  const artifactRefs = [
    ...execution.artifactRefs,
    ...(execution.workflow?.artifactRefs ?? []),
    ...(execution.middleware?.modelTask.artifactRefs ?? []),
    ...(execution.middleware?.dbOperation.artifactRefs ?? []),
  ];
  const factualRefs = execution.closeoutCapsule?.factualRefs;
  const closeoutCapsuleRuntimeRef =
    artifactRefs.find((ref) => ref.includes("/closeout-capsule/")) ??
    (factualRefs?.runtimeJobId && execution.closeoutCapsule?.capsuleId
      ? `runtime-job://${factualRefs.runtimeJobId}/closeout-capsule/${execution.closeoutCapsule.capsuleId}`
      : null);
  const opportunity =
    skillifier?.opportunity ??
    workflowSkillifier?.opportunity ??
    (skillifier?.opportunitySeedRef || workflowSkillifier?.opportunitySeedRef
      ? {
          state: "captured",
          capsuleRefs: uniqueRefs([
            skillifier?.closeoutCapsuleRef,
            workflowSkillifier?.closeoutCapsuleRef,
            closeoutCapsuleRuntimeRef,
          ]),
          artifactRefs: uniqueRefs([
            ...(skillifier?.reviewRefs ?? []),
            ...(workflowSkillifier?.reviewRefs ?? []),
          ]),
          modelTaskRefs: uniqueRefs([
            ...(skillifier?.modelTaskRefs ?? []),
            ...(workflowSkillifier?.modelTaskRefs ?? []),
          ]),
          dbOperationRefs: uniqueRefs([
            ...(skillifier?.dbOperationRefs ?? []),
            ...(workflowSkillifier?.dbOperationRefs ?? []),
          ]),
          reviewRefs: uniqueRefs([
            ...(skillifier?.reviewRefs ?? []),
            ...(workflowSkillifier?.reviewRefs ?? []),
          ]),
          reasonCodes: [],
          eli5Status: "OpenClaw captured the opportunity and stored only bounded breadcrumbs.",
          limitations: [],
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutationAllowed: false,
        }
      : null);
  const runtimeJobId =
    skillifier?.runtimeJobId ?? workflowSkillifier?.runtimeJobId ?? execution.runtimeJobId ?? null;
  const outcomeState =
    skillifier?.outcomeState ??
    workflowSkillifier?.outcomeState ??
    execution.reviewStatus ??
    execution.runtimeJobState;
  const opportunitySeedRef =
    skillifier?.opportunitySeedRef ?? workflowSkillifier?.opportunitySeedRef ?? null;
  const opportunityState = opportunity?.state ?? outcomeState;
  const closeoutCapsuleRef =
    skillifier?.closeoutCapsuleRef ??
    workflowSkillifier?.closeoutCapsuleRef ??
    closeoutCapsuleRuntimeRef ??
    execution.closeoutCapsule?.capsuleId ??
    null;
  const closeoutCapsuleHash =
    skillifier?.closeoutCapsuleHash ?? workflowSkillifier?.closeoutCapsuleHash ?? null;
  const modelRefs = uniqueRefs([
    ...(skillifier?.modelRefs ?? []),
    ...(workflowSkillifier?.modelRefs ?? []),
    execution.closeoutCapsule?.modelRef,
  ]);
  const modelTaskRefs = uniqueRefs([
    ...(skillifier?.modelTaskRefs ?? []),
    ...(workflowSkillifier?.modelTaskRefs ?? []),
    ...(execution.middleware?.modelTask.artifactRefs ?? []),
  ]);
  const dbOperationRefs = uniqueRefs([
    ...(skillifier?.dbOperationRefs ?? []),
    ...(workflowSkillifier?.dbOperationRefs ?? []),
    ...(execution.middleware?.dbOperation.artifactRefs ?? []),
  ]);
  const directValidationRefs = [
    ...(skillifier?.validationRefs ?? []),
    ...(workflowSkillifier?.validationRefs ?? []),
  ];
  const artifactValidationRefs = refsMatching(
    [...artifactRefs, ...(factualRefs?.validationRefs ?? [])],
    /(?:^validation:\/\/|\/validation(?:\/|$)|model-task\/validation(?:\/|$)|^pnpm test:file\b)/u,
  );
  const validationRefs =
    directValidationRefs.length > 0 ? uniqueRefs(directValidationRefs) : artifactValidationRefs;
  const reviewRefs =
    (skillifier?.reviewRefs?.length ?? 0) > 0 || (workflowSkillifier?.reviewRefs?.length ?? 0) > 0
      ? uniqueRefs([...(skillifier?.reviewRefs ?? []), ...(workflowSkillifier?.reviewRefs ?? [])])
      : refsMatching(artifactRefs, /(?:^review:\/\/|\/review(?:\/|$)|result_review)/u);
  const roleModelRefs = uniqueRefs(
    [
      ...(execution.runtimeGraph?.roleInvocations.map(
        (role) => `${role.roleId}:${role.modelRef}`,
      ) ?? []),
      ...(execution.agentTeam?.roleReports?.map((role) => `${role.roleId}:${role.modelId}`) ?? []),
      ...modelRefs.map((modelRef) => `skillifier:${modelRef}`),
    ],
    8,
  );
  const validationEvidenceRefs = uniqueRefs(
    [...validationRefs, ...(opportunity?.modelTaskRefs ?? []), ...(opportunity?.reviewRefs ?? [])],
    10,
  );
  const closeoutCapsuleRefs = uniqueRefs(
    [closeoutCapsuleRef, ...(opportunity?.capsuleRefs ?? [])],
    10,
  );
  const readinessState =
    skillifierOpportunityStateSupportsFollowOnSoak(opportunityState) &&
    opportunitySeedRef &&
    closeoutCapsuleRef &&
    roleModelRefs.length > 0 &&
    validationEvidenceRefs.length > 0
      ? "ready_for_follow_on_soak"
      : "needs_review";
  const closeoutCapsuleCoverageSummary = cappedRefSummary({
    shownCount: closeoutCapsuleRefs.length,
    totalCount: allUniqueRefs([closeoutCapsuleRef, ...(opportunity?.capsuleRefs ?? [])]).length,
    cap: 10,
    label: "closeout capsule refs",
  });
  const roleModelCoverageSummary = cappedRefSummary({
    shownCount: roleModelRefs.length,
    totalCount: allUniqueRefs([
      ...(execution.runtimeGraph?.roleInvocations.map(
        (role) => `${role.roleId}:${role.modelRef}`,
      ) ?? []),
      ...(execution.agentTeam?.roleReports?.map((role) => `${role.roleId}:${role.modelId}`) ?? []),
      ...(skillifier?.modelRefs ?? []).map((modelRef) => `skillifier:${modelRef}`),
      ...(workflowSkillifier?.modelRefs ?? []).map((modelRef) => `skillifier:${modelRef}`),
      ...(execution.closeoutCapsule?.modelRef
        ? [`skillifier:${execution.closeoutCapsule.modelRef}`]
        : []),
    ]).length,
    cap: 8,
    label: "role/model refs",
  });
  const validationCoverageSummary = cappedRefSummary({
    shownCount: validationEvidenceRefs.length,
    totalCount: allUniqueRefs([
      ...(directValidationRefs.length > 0 ? directValidationRefs : artifactValidationRefs),
      ...(opportunity?.modelTaskRefs ?? []),
      ...(opportunity?.reviewRefs ?? []),
    ]).length,
    cap: 10,
    label: "bounded validation refs",
  });
  const validationEvidenceSummary =
    validationEvidenceRefs.length > 0
      ? `bounded refs present (${validationRefs.length} validation, ${reviewRefs.length} review, ${validationCoverageSummary})`
      : "missing bounded refs";
  const proactivityGateSummary = skillifierProactivityGateSummary({
    opportunityState,
    opportunitySeedRef,
    closeoutCapsuleRefCount: closeoutCapsuleRefs.length,
    roleModelRefCount: roleModelRefs.length,
    validationRefCount: validationRefs.length,
    reviewRefCount: reviewRefs.length,
  });
  const followOnSoakChecklist = skillifierFollowOnSoakChecklist({
    opportunityState,
    opportunitySeedRef,
    closeoutCapsuleRefCount: closeoutCapsuleRefs.length,
    roleModelRefCount: roleModelRefs.length,
    validationEvidenceRefCount: validationEvidenceRefs.length,
    closeoutCapsuleCoverageSummary,
    roleModelCoverageSummary,
    validationCoverageSummary,
  });
  const boundedEvidenceDigest = [
    `seed_quality=${skillifierOpportunitySeedQuality(opportunitySeedRef, opportunityState)}`,
    `closeout_capsule_refs=${closeoutCapsuleRefs.length}`,
    `role_model_refs=${roleModelRefs.length}`,
    `validation_refs=${validationRefs.length}`,
    `review_refs=${reviewRefs.length}`,
    `bounded_validation_evidence=${validationEvidenceRefs.length > 0 ? "linked" : "missing"}`,
  ].join("; ");
  const soakEvidenceSummary = `${readinessState}: ${proactivityGateSummary}; follow_on_soak_checklist=${followOnSoakChecklist.state}; closeout capsule refs ${closeoutCapsuleRefs.length}/10 shown, role/model refs ${roleModelRefs.length}/8 shown, bounded validation refs ${validationEvidenceRefs.length}/10 shown.`;
  const evidenceSnapshotSummary = [
    `seed=${opportunitySeedRef ?? "missing"}`,
    `closeout=${closeoutCapsuleRefs[0] ?? "missing"}`,
    `role_model=${roleModelRefs[0] ?? "missing"}`,
    `validation=${validationEvidenceRefs[0] ?? "missing"}`,
  ].join("; ");
  return {
    runtimeJobId,
    opportunity,
    outcomeState,
    candidateType: skillifier?.candidateType ?? workflowSkillifier?.candidateType ?? null,
    candidateId: skillifier?.candidateId ?? workflowSkillifier?.candidateId ?? null,
    opportunitySeedRef,
    closeoutCapsuleRef,
    closeoutCapsuleHash,
    targetSkillRef: skillifier?.targetSkillRef ?? workflowSkillifier?.targetSkillRef ?? null,
    targetSkillPath: skillifier?.targetSkillPath ?? workflowSkillifier?.targetSkillPath ?? null,
    candidateApplied:
      skillifier?.candidateApplied === true || workflowSkillifier?.candidateApplied === true,
    modelRefs,
    modelTaskRefs,
    dbOperationRefs,
    validationRefs,
    reviewRefs,
    limitations: uniqueRefs([
      ...(skillifier?.limitations ?? []),
      ...(workflowSkillifier?.limitations ?? []),
      ...(execution.humanCloseoutSummary?.limitations ?? []),
      ...(execution.closeoutCapsule?.humanReport?.limitations ?? []),
    ]),
    eli5Progress:
      skillifier?.eli5Progress ??
      workflowSkillifier?.eli5Progress ??
      execution.humanCloseoutSummary?.eli5Progress ??
      execution.closeoutCapsule?.humanReport?.eli5Progress ??
      null,
    nextAction:
      skillifier?.nextAction ?? workflowSkillifier?.nextAction ?? item.recommendedNextStep ?? null,
    readbackQuality: {
      readinessState,
      opportunitySeedQuality: skillifierOpportunitySeedQuality(
        opportunitySeedRef,
        opportunityState,
      ),
      closeoutCapsuleQuality: skillifierCloseoutCapsuleQuality(
        closeoutCapsuleRef,
        closeoutCapsuleHash,
      ),
      closeoutCapsuleCoverageSummary,
      closeoutCapsuleRefs,
      roleModelCoverageSummary,
      validationCoverageSummary,
      roleModelRefs,
      validationEvidenceSummary,
      proactivityGateSummary,
      followOnSoakChecklistState: followOnSoakChecklist.state,
      followOnSoakChecklist: followOnSoakChecklist.checks,
      soakEvidenceSummary,
      boundedEvidenceDigest,
      evidenceSnapshotSummary,
    },
  };
}

function renderExecutionTruth(props: WorkQueueProps, item: WorkQueueObject) {
  const execution = item.execution;
  if (!execution) {
    return nothing;
  }
  const skillifier = skillifierRuntimeViewModel(item);
  const planningCapsuleIntake = planningCapsuleIntakeReadback(execution);
  const hasRuntimeJob = Boolean(execution.runtimeJobId);
  const serverBackedControlsAvailable =
    props.onPauseExecution && props.onRedirectExecution && props.onCancelExecution;
  const serverBackedControlsEnabled = Boolean(serverBackedControlsAvailable && hasRuntimeJob);
  const routing = execution.workflow?.routing ?? null;
  return html`
    <section class="work-queue-detail-section" aria-label="Execution truth">
      <div class="work-queue-detail-section__header">
        <h3>Execution truth</h3>
        <span class="work-queue-detail-section__meta">${execution.runtimeJobState}</span>
      </div>
      <div class="work-queue-evidence-grid">
        <div>
          <strong>Runtime job</strong>
          <div>${execution.runtimeJobId ?? "None"}</div>
        </div>
        <div>
          <strong>Executor</strong>
          <div>${execution.executorKind}</div>
        </div>
        <div>
          <strong>Session</strong>
          <div>${execution.sessionId ?? "None"}</div>
        </div>
        <div>
          <strong>Stream</strong>
          <div>${execution.streamSummary}</div>
        </div>
        <div>
          <strong>Heartbeat</strong>
          <div>${execution.heartbeatStatus}</div>
        </div>
        <div>
          <strong>Process</strong>
          <div>${execution.processStatus}</div>
        </div>
        <div>
          <strong>Validation</strong>
          <div>${execution.validationStatus}</div>
        </div>
        <div>
          <strong>Closeout</strong>
          <div>${execution.closeoutStatus}</div>
        </div>
        <div>
          <strong>Review</strong>
          <div>${execution.reviewStatus}</div>
        </div>
        <div>
          <strong>File scope</strong>
          <div>${execution.fileScopeStatus}</div>
        </div>
        <div>
          <strong>Controls</strong>
          <div>${execution.controlState}</div>
        </div>
        <div>
          <strong>Rebuild</strong>
          <div>${execution.rebuildState}</div>
        </div>
        <div>
          <strong>Authority</strong>
          <div>
            ${execution.authorityStatuses && execution.authorityStatuses.length > 0
              ? execution.authorityStatuses
                  .slice(0, 3)
                  .map(
                    (authority) =>
                      `${authority.profileId ?? authority.artifactType}: ${authority.status}`,
                  )
                  .join(", ")
              : "runtime-backed"}
          </div>
        </div>
        ${execution.workflow
          ? html`
              <div>
                <strong>Workflow</strong>
                <div>
                  ${execution.workflow.workflowDisplayName ??
                  execution.workflow.workflowId ??
                  "unknown"}
                </div>
              </div>
              <div>
                <strong>Route</strong>
                <div>${execution.workflow.route ?? "unknown"}</div>
              </div>
              <div>
                <strong>Workflow status</strong>
                <div>${execution.workflow.workflowStatus}</div>
              </div>
              <div>
                <strong>Workflow blockers</strong>
                <div>${execution.workflow.blockerReasonCodes.join(", ") || "None"}</div>
              </div>
              ${routing
                ? html`
                    <div>
                      <strong>Route state</strong>
                      <div>${routing.state}</div>
                    </div>
                    <div>
                      <strong>Route validation</strong>
                      <div>${routing.validatorOutcome ?? "unknown"}</div>
                    </div>
                    <div>
                      <strong>Route response</strong>
                      <div>${routing.responseMode ?? "unknown"}</div>
                    </div>
                    <div>
                      <strong>Router model</strong>
                      <div>${routing.routerModelRef ?? "unknown"}</div>
                    </div>
                    <div>
                      <strong>Router schema</strong>
                      <div>${routing.routerSchemaVersion ?? "unknown"}</div>
                    </div>
                    <div>
                      <strong>Clarification</strong>
                      <div>
                        ${routing.clarificationRef?.questionSummary ??
                        routing.clarificationOutcome ??
                        "none"}
                      </div>
                    </div>
                    <div>
                      <strong>Compiler</strong>
                      <div>${routing.compilerOutcome ?? "unknown"}</div>
                    </div>
                    <div>
                      <strong>Route artifacts</strong>
                      <div>${routing.artifactRefs.length} refs</div>
                    </div>
                    <div>
                      <strong>Child handoffs</strong>
                      <div>${routing.childWorkflowHandoffCount}</div>
                    </div>
                    <div>
                      <strong>Route reasons</strong>
                      <div>${routing.reasonCodes.slice(0, 4).join(", ") || "None"}</div>
                    </div>
                  `
                : nothing}
            `
          : nothing}
        <div>
          <strong>Lifecycle source</strong>
          <div>${execution.lifecycleTruthSource}</div>
        </div>
        <div>
          <strong>Execution source</strong>
          <div>${execution.executionTruthSource}</div>
        </div>
      </div>
      <p class="work-queue-detail-summary">
        Execution state comes from server/runtime truth. UI lifecycle mutation is
        ${execution.uiMutationAllowed ? "available" : "not available"}. Controls are runtime-backed
        and never mark lifecycle directly.
      </p>
      ${execution.ownerProgressReadback
        ? html`
            <div class="work-queue-detail-section__subsection">
              <div class="work-queue-detail-section__header">
                <h4>Owner progress</h4>
                <span class="work-queue-detail-section__meta">
                  ${execution.ownerProgressReadback.state}
                </span>
              </div>
              <p class="work-queue-detail-summary">${execution.ownerProgressReadback.headline}</p>
              <div class="work-queue-evidence-grid">
                <div>
                  <strong>Stage</strong>
                  <div>${execution.ownerProgressReadback.currentStage}</div>
                </div>
                <div>
                  <strong>Worker</strong>
                  <div>${execution.ownerProgressReadback.activeWorker ?? "None"}</div>
                </div>
                <div>
                  <strong>Model</strong>
                  <div>${execution.ownerProgressReadback.activeModelRef ?? "Unknown"}</div>
                </div>
                <div>
                  <strong>Validation evidence</strong>
                  <div>${execution.ownerProgressReadback.validationEvidenceState}</div>
                </div>
                <div>
                  <strong>Changed files</strong>
                  <div>${execution.ownerProgressReadback.changedFileState}</div>
                </div>
                <div>
                  <strong>Closeout evidence</strong>
                  <div>${execution.ownerProgressReadback.closeoutEvidenceState}</div>
                </div>
              </div>
              <p class="work-queue-detail-summary">
                ${execution.ownerProgressReadback.eli5Progress}
              </p>
              <p class="work-queue-detail-summary">
                Next: ${execution.ownerProgressReadback.nextAction}
              </p>
              ${execution.ownerProgressReadback.activeGraphProgress?.state === "present"
                ? html`
                    <div class="work-queue-detail-section__subsection">
                      <div class="work-queue-detail-section__header">
                        <h4>Runtime graph progress</h4>
                        <span class="work-queue-detail-section__meta">
                          ${execution.ownerProgressReadback.activeGraphProgress.currentPhase ??
                          "active"}
                        </span>
                      </div>
                      <div class="work-queue-evidence-grid">
                        <div>
                          <strong>Active node</strong>
                          <div>
                            ${execution.ownerProgressReadback.activeGraphProgress.activeNodeId ??
                            "Unknown"}
                          </div>
                        </div>
                        <div>
                          <strong>Role</strong>
                          <div>
                            ${execution.ownerProgressReadback.activeGraphProgress.roleId ??
                            "Unknown"}
                          </div>
                        </div>
                        <div>
                          <strong>Model</strong>
                          <div>
                            ${execution.ownerProgressReadback.activeGraphProgress.modelRef ??
                            "Unknown"}
                          </div>
                        </div>
                        <div>
                          <strong>Tool event</strong>
                          <div>
                            ${execution.ownerProgressReadback.activeGraphProgress
                              .latestToolEventKind ??
                            execution.ownerProgressReadback.activeGraphProgress.schedulerToolTrace
                              .latestToolId ??
                            execution.ownerProgressReadback.activeGraphProgress.workerToolTrace
                              .latestWorkerToolId ??
                            "None"}
                          </div>
                        </div>
                        <div>
                          <strong>Validation</strong>
                          <div>
                            ${execution.ownerProgressReadback.activeGraphProgress.validationState ??
                            "Unknown"}
                          </div>
                        </div>
                        <div>
                          <strong>Open commitments</strong>
                          <div>
                            ${execution.ownerProgressReadback.activeGraphProgress.openCommitmentIds
                              .length}
                          </div>
                        </div>
                      </div>
                      <p class="work-queue-detail-summary">
                        ${execution.ownerProgressReadback.activeGraphProgress.objective ??
                        "No current objective recorded."}
                      </p>
                      <p class="work-queue-detail-summary">
                        Why:
                        ${execution.ownerProgressReadback.activeGraphProgress.whySelected ??
                        "No selection rationale recorded."}
                      </p>
                      ${execution.ownerProgressReadback.activeGraphProgress.evidenceClaimRefs
                        .length > 0
                        ? html`
                            <p class="work-queue-detail-summary">
                              Evidence claims:
                              ${execution.ownerProgressReadback.activeGraphProgress.evidenceClaimRefs
                                .slice(0, 5)
                                .join(", ")}
                            </p>
                          `
                        : nothing}
                      ${execution.ownerProgressReadback.activeGraphProgress.workerToolTrace
                        .workerToolIds.length > 0
                        ? html`
                            <p class="work-queue-detail-summary">
                              Worker tools:
                              ${execution.ownerProgressReadback.activeGraphProgress.workerToolTrace.workerToolIds
                                .slice(0, 6)
                                .join(", ")}
                            </p>
                          `
                        : nothing}
                    </div>
                  `
                : nothing}
            </div>
          `
        : nothing}
      ${execution.humanCloseoutSummary && !execution.agentTeam?.humanCloseoutSummary
        ? html`
            <div class="work-queue-detail-section__subsection">
              <h4>Human closeout</h4>
              <div class="work-queue-evidence-grid">
                <div>
                  <strong>What changed</strong>
                  <div>${execution.humanCloseoutSummary.whatChanged ?? "unknown"}</div>
                </div>
                <div>
                  <strong>Result</strong>
                  <div>${execution.humanCloseoutSummary.result ?? "unknown"}</div>
                </div>
                <div>
                  <strong>Validation</strong>
                  <div>${execution.humanCloseoutSummary.testsRun?.join(", ") || "None"}</div>
                </div>
                <div>
                  <strong>ELI5 progress</strong>
                  <div>${execution.humanCloseoutSummary.eli5Progress ?? "unknown"}</div>
                </div>
              </div>
            </div>
          `
        : nothing}
      ${execution.closeoutCapsule?.humanReport
        ? html`
            <div class="work-queue-detail-section__subsection">
              <h4>Closeout Capsule</h4>
              <div class="work-queue-evidence-grid">
                <div>
                  <strong>Source</strong>
                  <div>${execution.closeoutCapsule.humanReport.source ?? "unknown"}</div>
                </div>
                <div>
                  <strong>Task success</strong>
                  <div>
                    ${execution.closeoutCapsule.structuredSummary?.taskSuccess ?? "unknown"}
                  </div>
                </div>
                <div>
                  <strong>ELI5 progress</strong>
                  <div>${execution.closeoutCapsule.humanReport.eli5Progress ?? "unknown"}</div>
                </div>
                <div>
                  <strong>Opportunity seeds</strong>
                  <div>
                    ${execution.closeoutCapsule.opportunitySeeds
                      ?.slice(0, 5)
                      .map((seed) => seed.title ?? seed.kind ?? "seed")
                      .join(", ") || "None"}
                  </div>
                </div>
              </div>
              <pre class="work-queue-detail-prewrap">
${execution.closeoutCapsule.humanReport.reportMarkdown ?? ""}</pre
              >
            </div>
          `
        : nothing}
      ${execution.runtimeGraph || execution.closeoutCapsule?.opportunitySeeds?.length
        ? html`
            <div class="work-queue-detail-section__subsection">
              <h4>Planning Capsule intake</h4>
              <div class="work-queue-evidence-grid">
                <div>
                  <strong>Opportunity seed rationale</strong>
                  <div>${planningCapsuleIntake.opportunitySeedRationale}</div>
                </div>
                <div>
                  <strong>Opportunity seed coverage</strong>
                  <div>${planningCapsuleIntake.opportunitySeedCoverage}</div>
                </div>
                <div>
                  <strong>Quality review state</strong>
                  <div>${planningCapsuleIntake.qualityReviewState}</div>
                </div>
                <div>
                  <strong>Planning Capsule ref</strong>
                  <div>${planningCapsuleIntake.planningCapsuleRef}</div>
                </div>
                <div>
                  <strong>Proposed child actions</strong>
                  <div>${planningCapsuleIntake.proposedChildActions.join(" | ") || "None"}</div>
                </div>
                <div>
                  <strong>Compile readiness</strong>
                  <div>${planningCapsuleIntake.compileReadiness}</div>
                </div>
                <div>
                  <strong>Implementation attempts</strong>
                  <div>${planningCapsuleIntake.implementationAttemptSummary}</div>
                </div>
                <div>
                  <strong>Validation/repair evidence</strong>
                  <div>${planningCapsuleIntake.validationRepairSummary}</div>
                </div>
                <div>
                  <strong>Final closeout</strong>
                  <div>${planningCapsuleIntake.finalCloseout}</div>
                </div>
                <div>
                  <strong>ELI5 progress</strong>
                  <div>${planningCapsuleIntake.eli5Progress}</div>
                </div>
              </div>
            </div>
          `
        : nothing}
      ${skillifier
        ? html`
            <div class="work-queue-detail-section__subsection">
              <h4>Skillifier runtime</h4>
              <div class="work-queue-evidence-grid">
                <div>
                  <strong>Runtime job</strong>
                  <div>${skillifier.runtimeJobId ?? "unknown"}</div>
                </div>
                <div>
                  <strong>Opportunity state</strong>
                  <div>${skillifier.opportunity?.state ?? "unknown"}</div>
                </div>
                <div>
                  <strong>Outcome</strong>
                  <div>${skillifier.outcomeState ?? "unknown"}</div>
                </div>
                <div>
                  <strong>Candidate</strong>
                  <div>
                    ${skillifier.candidateType ?? "unknown"} /
                    ${skillifier.candidateId ?? "unknown"}
                  </div>
                </div>
                <div>
                  <strong>Opportunity seed</strong>
                  <div>${skillifier.opportunitySeedRef ?? "unknown"}</div>
                </div>
                <div>
                  <strong>Opportunity seed quality</strong>
                  <div>${skillifier.readbackQuality.opportunitySeedQuality}</div>
                </div>
                <div>
                  <strong>Closeout Capsule</strong>
                  <div>
                    ${skillifier.closeoutCapsuleRef ?? "unknown"}${skillifier.closeoutCapsuleHash
                      ? ` / ${skillifier.closeoutCapsuleHash}`
                      : ""}
                  </div>
                </div>
                <div>
                  <strong>Closeout capsule quality</strong>
                  <div>${skillifier.readbackQuality.closeoutCapsuleQuality}</div>
                </div>
                <div>
                  <strong>Target skill</strong>
                  <div>
                    ${skillifier.targetSkillRef ?? skillifier.targetSkillPath ?? "proposal_only"}
                  </div>
                </div>
                <div>
                  <strong>Applied change</strong>
                  <div>${skillifier.candidateApplied ? "yes" : "proposal only"}</div>
                </div>
                <div>
                  <strong>Readback readiness state</strong>
                  <div>${skillifier.readbackQuality.readinessState}</div>
                </div>
                <div>
                  <strong>Proactivity soak gate</strong>
                  <div>${skillifier.readbackQuality.proactivityGateSummary}</div>
                </div>
                <div>
                  <strong>Follow-on soak checklist</strong>
                  <div>${skillifier.readbackQuality.followOnSoakChecklistState}</div>
                </div>
                <div>
                  <strong>Soak evidence summary</strong>
                  <div>${skillifier.readbackQuality.soakEvidenceSummary}</div>
                </div>
                <div>
                  <strong>Bounded evidence digest</strong>
                  <div>${skillifier.readbackQuality.boundedEvidenceDigest}</div>
                </div>
                <div>
                  <strong>Evidence snapshot</strong>
                  <div>${skillifier.readbackQuality.evidenceSnapshotSummary}</div>
                </div>
                <div>
                  <strong>Role/model refs</strong>
                  <div>
                    ${skillifier.readbackQuality.roleModelCoverageSummary}:
                    ${skillifier.readbackQuality.roleModelRefs.join(", ") || "None"}
                  </div>
                </div>
                <div>
                  <strong>Validation evidence</strong>
                  <div>
                    ${skillifier.readbackQuality.validationEvidenceSummary}; refs
                    ${skillifier.validationRefs.length} validation, ${skillifier.reviewRefs.length}
                    review
                  </div>
                </div>
                <div>
                  <strong>Readback gaps</strong>
                  <div>
                    ${[
                      skillifier.opportunitySeedRef ? null : "opportunity seed ref missing",
                      skillifier.closeoutCapsuleRef ? null : "closeout capsule ref missing",
                      skillifier.readbackQuality.closeoutCapsuleRefs.length > 0
                        ? null
                        : "closeout capsule refs missing",
                      skillifier.readbackQuality.roleModelRefs.length > 0
                        ? null
                        : "role/model refs missing",
                      skillifier.validationRefs.length > 0 || skillifier.reviewRefs.length > 0
                        ? null
                        : "bounded validation evidence missing",
                    ]
                      .filter((value): value is string => Boolean(value))
                      .join("; ") || "none"}
                  </div>
                </div>
                <div>
                  <strong>Soak checklist details</strong>
                  <div>
                    ${skillifier.readbackQuality.followOnSoakChecklist
                      .map((check) => `${check.checkId}:${check.status} (${check.summary})`)
                      .join(" | ")}
                  </div>
                </div>
                <div>
                  <strong>Model refs</strong>
                  <div>${skillifier.modelRefs.join(", ") || "None"}</div>
                </div>
                <div>
                  <strong>Model-task refs</strong>
                  <div>${skillifier.modelTaskRefs.join(", ") || "None"}</div>
                </div>
                <div>
                  <strong>DB-operation refs</strong>
                  <div>${skillifier.dbOperationRefs.join(", ") || "None"}</div>
                </div>
                <div>
                  <strong>Validation refs</strong>
                  <div>${skillifier.validationRefs.join(", ") || "None"}</div>
                </div>
                <div>
                  <strong>Review refs</strong>
                  <div>${skillifier.reviewRefs.join(", ") || "None"}</div>
                </div>
                <div>
                  <strong>Opportunity reasons</strong>
                  <div>${skillifier.opportunity?.reasonCodes.join(", ") || "None"}</div>
                </div>
                <div>
                  <strong>Opportunity artifacts</strong>
                  <div>${skillifier.opportunity?.artifactRefs.join(", ") || "None"}</div>
                </div>
                <div>
                  <strong>Closeout capsule refs</strong>
                  <div>
                    ${skillifier.readbackQuality.closeoutCapsuleCoverageSummary}:
                    ${skillifier.readbackQuality.closeoutCapsuleRefs.join(", ") || "None"}
                  </div>
                </div>
                <div>
                  <strong>ELI5 progress</strong>
                  <div>
                    ${skillifier.opportunity?.eli5Status ?? skillifier.eli5Progress ?? "unknown"}
                  </div>
                </div>
                <div>
                  <strong>Next action</strong>
                  <div>${skillifier.nextAction ?? "unknown"}</div>
                </div>
              </div>
              ${[...(skillifier.opportunity?.limitations ?? []), ...skillifier.limitations].length
                ? html`
                    <div class="work-queue-detail-section__subsection">
                      <h4>Limitations</h4>
                      <ul class="work-queue-history-list">
                        ${uniqueRefs([
                          ...(skillifier.opportunity?.limitations ?? []),
                          ...skillifier.limitations,
                        ]).map((limitation) => html`<li>${limitation}</li>`)}
                      </ul>
                    </div>
                  `
                : nothing}
              <p class="work-queue-detail-summary">
                Skillifier runtime state is bounded owner-facing readback only. Runtime jobs remain
                lifecycle truth, and proposal state is distinct from an applied skill file change.
              </p>
            </div>
          `
        : nothing}
      ${execution.runtimeGraph
        ? html`
            <div class="work-queue-detail-section__subsection">
              <h4>Runtime Work Graph</h4>
              <div class="work-queue-evidence-grid">
                <div>
                  <strong>Graph</strong>
                  <div>${execution.runtimeGraph.graphId}</div>
                </div>
                <div>
                  <strong>Parent item</strong>
                  <div>${execution.runtimeGraph.parentWorkItemId ?? "unknown"}</div>
                </div>
                <div>
                  <strong>Owner objective</strong>
                  <div>${execution.runtimeGraph.ownerObjectiveSummary ?? "not recorded"}</div>
                </div>
                <div>
                  <strong>Children</strong>
                  <div>${execution.runtimeGraph.childActions.length}</div>
                </div>
                <div>
                  <strong>Dependencies</strong>
                  <div>${execution.runtimeGraph.dependencyEdges.length}</div>
                </div>
                <div>
                  <strong>Role calls</strong>
                  <div>${execution.runtimeGraph.roleInvocations.length}</div>
                </div>
                <div>
                  <strong>Human tasks</strong>
                  <div>${execution.runtimeGraph.humanTasks.length}</div>
                </div>
                <div>
                  <strong>Validation/repair</strong>
                  <div>${execution.runtimeGraph.validationRepairLoops.length}</div>
                </div>
                <div>
                  <strong>Closeout</strong>
                  <div>
                    ${execution.runtimeGraph.finalCloseoutRef ??
                    execution.runtimeGraph.closeoutRef ??
                    "missing"}
                  </div>
                </div>
                <div>
                  <strong>Approved plans</strong>
                  <div>
                    ${execution.runtimeGraph.approvedPlanRefs?.slice(0, 3).join(", ") || "None"}
                  </div>
                </div>
                <div>
                  <strong>Parent/child readback</strong>
                  <div>${runtimeGraphParentChildReadbackSummary(execution.runtimeGraph)}</div>
                </div>
                <div>
                  <strong>ELI5 progress</strong>
                  <div>${execution.runtimeGraph.eli5Progress ?? "unknown"}</div>
                </div>
                <div>
                  <strong>Implementation readiness</strong>
                  <div>${runtimeGraphImplementationReadinessSummary(execution.runtimeGraph)}</div>
                </div>
                <div>
                  <strong>Validation readback</strong>
                  <div>${runtimeGraphValidationReadbackSummary(execution.runtimeGraph)}</div>
                </div>
                <div>
                  <strong>Lifecycle owner</strong>
                  <div>
                    ${execution.runtimeGraph.planningStatusIsLifecycleState
                      ? "incorrect"
                      : "runtime jobs"}
                  </div>
                </div>
              </div>
              <div class="work-queue-detail-section__subsection">
                <h4>Child actions</h4>
                <ul class="work-queue-history-list">
                  ${execution.runtimeGraph.childActions.slice(0, 10).map(
                    (child) => html`
                      <li>
                        <strong>${child.title ?? child.workItemId}</strong>
                        <div>${child.actionKind} - ${child.assignedRole}</div>
                        <div>${child.assignedWorkflow}</div>
                        <div>Runtime: ${child.runtimeJobId ?? "not linked"}</div>
                        <div>Graph node: ${child.graphNodeRef ?? "not linked"}</div>
                        <div>Evidence: ${child.evidenceRefs.slice(0, 2).join(", ") || "None"}</div>
                        <div>Blockers: ${child.blockerReasonCodes.join(", ") || "None"}</div>
                      </li>
                    `,
                  )}
                </ul>
              </div>
              <div class="work-queue-detail-section__subsection">
                <h4>Role invocations</h4>
                <ul class="work-queue-history-list">
                  ${execution.runtimeGraph.roleInvocations.slice(0, 10).map(
                    (role) => html`
                      <li>
                        <strong>${role.roleId}</strong>
                        <div>${role.modelRef} - ${role.status}</div>
                        <div>
                          ${role.providerPath ?? "unknown"} / ${role.transportKind ?? "unknown"}
                        </div>
                        <div>${role.modelRunRef ?? "no model run ref"}</div>
                        <div>
                          Artifacts: ${role.producedArtifactRefs.slice(0, 2).join(", ") || "None"}
                        </div>
                      </li>
                    `,
                  )}
                </ul>
              </div>
              <div class="work-queue-detail-section__subsection">
                <h4>Validation/repair details</h4>
                <ul class="work-queue-history-list">
                  ${execution.runtimeGraph.validationRepairLoops.slice(0, 5).map(
                    (entry) => html`
                      <li>
                        <strong>${entry.validationRef}</strong>
                        <div>${entry.status}</div>
                        <div>Repair node: ${entry.repairNodeRef ?? "not linked"}</div>
                        <div>Reasons: ${entry.reasonCodes.join(", ") || "None"}</div>
                      </li>
                    `,
                  )}
                </ul>
              </div>
              <div class="work-queue-detail-section__subsection">
                <h4>Human tasks</h4>
                <ul class="work-queue-history-list">
                  ${execution.runtimeGraph.humanTasks.slice(0, 5).map(
                    (task) => html`
                      <li>
                        <strong>${task.humanTaskId}</strong>
                        <div>${task.state}</div>
                        <div>${task.resumeTokenRef ?? "no resume ref"}</div>
                        ${props.onSubmitHumanTaskResponse &&
                        (task.state === "waiting" || task.state === "pending")
                          ? html`
                              <button
                                type="button"
                                class="btn btn--secondary btn--sm"
                                @click=${() =>
                                  props.onSubmitHumanTaskResponse?.({
                                    object: item,
                                    graphId: execution.runtimeGraph!.graphId,
                                    humanTaskId: task.humanTaskId,
                                    boundedResponseRef: `owner-decision://work-queue/${task.humanTaskId}/ui-resume`,
                                  })}
                              >
                                Resume with owner decision
                              </button>
                            `
                          : nothing}
                      </li>
                    `,
                  )}
                </ul>
              </div>
              <p class="work-queue-detail-summary">
                Runtime Work Graph state is owner-facing projection/readback. Runtime jobs remain
                lifecycle truth and Work Queue lifecycle mutation is not allowed here.
              </p>
            </div>
          `
        : nothing}
      ${serverBackedControlsAvailable
        ? html`
            <div class="work-queue-action-row" aria-label="Server-backed execution controls">
              <button
                class="btn btn--secondary btn--sm"
                ?disabled=${!serverBackedControlsEnabled}
                @click=${() => props.onPauseExecution?.(item)}
              >
                Pause
              </button>
              <button
                class="btn btn--secondary btn--sm"
                ?disabled=${!serverBackedControlsEnabled}
                @click=${() => props.onRedirectExecution?.(item)}
              >
                Redirect
              </button>
              <button
                class="btn btn--secondary btn--sm"
                ?disabled=${!serverBackedControlsEnabled}
                @click=${() => props.onCancelExecution?.(item)}
              >
                Cancel
              </button>
            </div>
            ${serverBackedControlsEnabled
              ? nothing
              : html`
                  <p class="work-queue-detail-summary">
                    Unsafe controls are disabled until a runtime job is available.
                  </p>
                `}
          `
        : html`
            <p class="work-queue-detail-summary">
              Execution controls are read-only until server-backed control actions are supplied.
            </p>
          `}
      ${execution.artifactRefs.length > 0
        ? html`
            <ul class="work-queue-history-list">
              ${execution.artifactRefs.slice(0, 4).map((ref) => html`<li>${ref}</li>`)}
            </ul>
          `
        : nothing}
      ${execution.agentTeam
        ? html`
            <section class="work-queue-detail-section" aria-label="Agent team state">
              <div class="work-queue-detail-section__header">
                <h3>Agent team</h3>
                <span class="work-queue-detail-section__meta">
                  ${execution.agentTeam.currentTeamState}
                </span>
              </div>
              <div class="work-queue-evidence-grid">
                <div>
                  <strong>Run</strong>
                  <div>${execution.agentTeam.agentTeamRunId ?? "None"}</div>
                </div>
                <div>
                  <strong>Active role</strong>
                  <div>${execution.agentTeam.activeRole ?? "None"}</div>
                </div>
                <div>
                  <strong>Completed roles</strong>
                  <div>${execution.agentTeam.completedRoles.join(", ") || "None"}</div>
                </div>
                <div>
                  <strong>Pending roles</strong>
                  <div>${execution.agentTeam.pendingRoles.join(", ") || "None"}</div>
                </div>
                <div>
                  <strong>Needs review</strong>
                  <div>${execution.agentTeam.needsReviewRoles.join(", ") || "None"}</div>
                </div>
                <div>
                  <strong>Latest handoff</strong>
                  <div>${execution.agentTeam.latestHandoff ?? "None"}</div>
                </div>
                <div>
                  <strong>Validation</strong>
                  <div>${execution.agentTeam.validationState}</div>
                </div>
                <div>
                  <strong>Review</strong>
                  <div>${execution.agentTeam.reviewState}</div>
                </div>
                <div>
                  <strong>Security review</strong>
                  <div>${execution.agentTeam.securityReviewState ?? "unknown"}</div>
                </div>
                <div>
                  <strong>Closeout</strong>
                  <div>${execution.agentTeam.closeoutState}</div>
                </div>
                <div>
                  <strong>Authority</strong>
                  <div>${execution.agentTeam.authorityStatus}</div>
                </div>
                <div>
                  <strong>Model readiness</strong>
                  <div>
                    ${execution.agentTeam.modelReadiness
                      .map((model) => `${model.modelId}: ${model.status}`)
                      .join(", ") || "None"}
                  </div>
                </div>
                <div>
                  <strong>Team stream</strong>
                  <div>
                    ${execution.agentTeam.teamStreamSummary
                      ? `${execution.agentTeam.teamStreamSummary.eventCount} events, latest ${execution.agentTeam.teamStreamSummary.latestSummary ?? "none"}`
                      : "0 events"}
                  </div>
                </div>
                <div>
                  <strong>Cost/latency</strong>
                  <div>
                    ${execution.agentTeam.modelAccountingSummary
                      ? `${execution.agentTeam.modelAccountingSummary.runCount} runs, ${execution.agentTeam.modelAccountingSummary.totalLatencyMs}ms, cost ${execution.agentTeam.modelAccountingSummary.estimatedCostUsd ?? "unknown"} (${execution.agentTeam.modelAccountingSummary.costSource ?? "unknown"})`
                      : "unknown"}
                  </div>
                </div>
                <div>
                  <strong>Provider reliability</strong>
                  <div>
                    ${execution.agentTeam.providerReliabilitySummary?.perModel.length
                      ? execution.agentTeam.providerReliabilitySummary.perModel
                          .slice(0, 3)
                          .map(
                            (model) =>
                              `${model.modelId}: ${model.successCount}/${model.callCount} ok, retries ${model.retryCount}, rate limits ${model.rateLimitCount}, readiness ${model.readiness}`,
                          )
                          .join("; ")
                      : "unknown"}
                  </div>
                </div>
                <div>
                  <strong>Recovery</strong>
                  <div>${execution.agentTeam.failureRecoveryState ?? "none"}</div>
                </div>
                <div>
                  <strong>Closeout quality</strong>
                  <div>
                    ${execution.agentTeam.closeoutQuality
                      ? `${execution.agentTeam.closeoutQuality.state} (${execution.agentTeam.closeoutQuality.goalSatisfaction ?? "unknown"})`
                      : "unknown"}
                  </div>
                </div>
                <div>
                  <strong>Blockers</strong>
                  <div>${execution.agentTeam.blockers?.join(", ") || "None"}</div>
                </div>
              </div>
              ${execution.agentTeam.roleReports?.length
                ? html`
                    <div class="work-queue-detail-section__subsection">
                      <h4>Role work</h4>
                      <ul class="work-queue-history-list">
                        ${execution.agentTeam.roleReports.slice(0, 8).map(
                          (role) => html`
                            <li>
                              <strong>${role.roleId}</strong>
                              <div>${role.modelId} - ${role.status}</div>
                              <div>${role.whatRoleDid}</div>
                            </li>
                          `,
                        )}
                      </ul>
                    </div>
                  `
                : nothing}
              ${execution.agentTeam.humanCloseoutSummary
                ? html`
                    <div class="work-queue-detail-section__subsection">
                      <h4>Human closeout</h4>
                      <div class="work-queue-evidence-grid">
                        <div>
                          <strong>What changed</strong>
                          <div>${execution.agentTeam.humanCloseoutSummary.whatChanged}</div>
                        </div>
                        <div>
                          <strong>Validation</strong>
                          <div>
                            ${execution.agentTeam.humanCloseoutSummary.testsRun.join(", ") ||
                            "None"}
                          </div>
                        </div>
                        <div>
                          <strong>Result</strong>
                          <div>${execution.agentTeam.humanCloseoutSummary.result}</div>
                        </div>
                        <div>
                          <strong>ELI5 progress</strong>
                          <div>${execution.agentTeam.humanCloseoutSummary.eli5Progress}</div>
                        </div>
                      </div>
                    </div>
                  `
                : nothing}
              ${execution.agentTeam.closeoutCapsule?.humanReport
                ? html`
                    <div class="work-queue-detail-section__subsection">
                      <h4>Closeout Capsule</h4>
                      <div class="work-queue-evidence-grid">
                        <div>
                          <strong>Source</strong>
                          <div>
                            ${execution.agentTeam.closeoutCapsule.humanReport.source ?? "unknown"}
                          </div>
                        </div>
                        <div>
                          <strong>Quality</strong>
                          <div>
                            ${execution.agentTeam.closeoutCapsule.structuredSummary
                              ?.qualityAssessment ?? "unknown"}
                          </div>
                        </div>
                        <div>
                          <strong>Workflow fit</strong>
                          <div>
                            ${execution.agentTeam.closeoutCapsule.structuredSummary
                              ?.workflowFitAssessment ?? "unknown"}
                          </div>
                        </div>
                        <div>
                          <strong>Opportunities</strong>
                          <div>
                            ${execution.agentTeam.closeoutCapsule.opportunitySeeds
                              ?.slice(0, 5)
                              .map((seed) => seed.title ?? seed.kind ?? "seed")
                              .join(", ") || "None"}
                          </div>
                        </div>
                      </div>
                      <pre class="work-queue-detail-prewrap">
${execution.agentTeam.closeoutCapsule.humanReport.reportMarkdown ?? ""}</pre
                      >
                    </div>
                  `
                : nothing}
              <p class="work-queue-detail-summary">
                Agent-team state is projected from server/runtime truth and does not mutate Work
                Queue lifecycle.
              </p>
            </section>
          `
        : nothing}
    </section>
  `;
}

function renderActionBar(props: WorkQueueProps, item: WorkQueueObject) {
  const revisionValue = props.revisionDrafts[item.id] ?? "";
  const dbBacked = item.sourceRefs.some((ref) => ref.startsWith("work-queue-db://"));
  if (dbBacked) {
    return html`
      <section class="work-queue-detail-section">
        <div class="work-queue-actions">
          <button type="button" class="btn btn--secondary" @click=${() => props.onRefresh()}>
            Refresh runtime readback
          </button>
        </div>
        <p class="work-queue-detail-summary">
          Actions for this item are driven by runtime jobs, Closeout Capsules, and human task resume
          nodes. Code edits are not required to update queue status.
        </p>
      </section>
    `;
  }
  return html`
    <section class="work-queue-detail-section">
      <div class="work-queue-actions">
        ${item.visibleStatus === "new"
          ? html`
              <button type="button" class="btn btn--primary" @click=${() => props.onDraft(item)}>
                ${item.lane === "skills" ? "Draft skill" : "Draft plan"}
              </button>
              <button
                type="button"
                class="btn btn--ghost"
                @click=${() => props.onDismiss(item.queueItemId)}
              >
                Dismiss
              </button>
            `
          : nothing}
        ${item.visibleStatus === "drafted" || item.visibleStatus === "needs_revision"
          ? html`
              <button
                type="button"
                class="btn btn--primary"
                @click=${() => props.onFinalize(item.id)}
              >
                Finalize
              </button>
              <button
                type="button"
                class="btn btn--ghost"
                @click=${() => props.onDismiss(item.queueItemId)}
              >
                Dismiss
              </button>
            `
          : nothing}
        ${item.visibleStatus === "finalized"
          ? html`
              <button
                type="button"
                class="btn btn--primary"
                @click=${() => props.onCopyCodexPrompt(item.id)}
              >
                Copy Codex prompt
              </button>
              <button
                type="button"
                class="btn btn--ghost"
                @click=${() => props.onMarkComplete(item.id)}
              >
                Mark complete
              </button>
            `
          : nothing}
        ${item.visibleStatus === "dismissed"
          ? html`
              <button
                type="button"
                class="btn btn--primary"
                @click=${() => props.onRestore(item.id)}
              >
                Restore
              </button>
            `
          : nothing}
      </div>
      ${item.visibleStatus === "drafted" ||
      item.visibleStatus === "needs_revision" ||
      item.visibleStatus === "finalized"
        ? html`
            <div class="work-queue-revision-editor">
              <label for="work-queue-revision-input-${item.id}">Revision request</label>
              <textarea
                id="work-queue-revision-input-${item.id}"
                .value=${revisionValue}
                placeholder="Add the changes, questions, or constraints you want reflected in the next draft."
                @input=${(event: Event) =>
                  props.onUpdateRevisionDraft(item.id, (event.target as HTMLTextAreaElement).value)}
              ></textarea>
              <div class="work-queue-actions">
                <button
                  type="button"
                  class="btn btn--secondary"
                  @click=${() => props.onRequestRevision(item.id)}
                >
                  Request revision
                </button>
              </div>
            </div>
          `
        : nothing}
      ${item.visibleStatus === "finalized" && item.artifact.codexPrompt
        ? html`
            <section class="work-queue-detail-section">
              <div class="work-queue-detail-section__header">
                <h3>Codex-ready prompt</h3>
              </div>
              <pre class="work-queue-artifact-body"><code>${item.artifact.codexPrompt}</code></pre>
            </section>
          `
        : nothing}
    </section>
  `;
}

function renderDetail(props: WorkQueueProps) {
  const item = props.selectedObject;
  if (!item) {
    return html`
      <section class="work-queue-detail work-queue-detail--empty">
        <h2>Select a work item</h2>
        <p>Open a plan, skill, or review task to see the full artifact and next steps.</p>
      </section>
    `;
  }
  const displayTitle =
    item.queuePosition === null ? item.title : `${item.queuePosition}. ${item.title}`;
  return html`
    <section class="work-queue-detail">
      <header class="work-queue-detail__header">
        <div class="work-queue-detail__eyebrow">${item.laneLabel} · ${item.objectClassLabel}</div>
        <h2>${displayTitle}</h2>
        <div class="work-queue-detail__meta">
          <span class="work-queue-chip">${item.statusLabel}</span>
          <span class="work-queue-chip work-queue-chip--priority">${item.priorityBand}</span>
        </div>
        <p class="work-queue-detail__summary">${item.summary}</p>
        <div class="work-queue-detail__next-step">
          <strong>Recommended next step</strong>
          <div>${item.recommendedNextStep}</div>
        </div>
      </header>
      ${renderFailureStatus(item)} ${renderArtifactSection(props, item)}
      ${renderOpenQuestions(item)} ${renderActionBar(props, item)}
      ${renderConvergenceSliceTracker(item)} ${renderEvidence(item)}
      ${renderExecutionTruth(props, item)} ${renderHistory(item)}
    </section>
  `;
}

export function renderWorkQueue(props: WorkQueueProps): TemplateResult {
  const visibleItems = props.items.slice(0, DEFAULT_VISIBLE_ITEMS);
  const overflowItems = props.items.slice(DEFAULT_VISIBLE_ITEMS);
  const visibleGroups = groupItems(props.filter, visibleItems);
  const overflowGroups = groupItems(props.filter, overflowItems);
  return html`
    <section class="work-queue-page" aria-label="Work Queue">
      ${renderNotifications(props)}
      <header class="work-queue-page__header">
        <div>
          <div class="page-title">Work Queue</div>
          <div class="page-sub">Review durable plans, skills, and manual execution handoffs.</div>
          <div class="work-queue-page__push-status">
            ${props.pushMode === "subscribed"
              ? "Live updates connected"
              : props.pushMode === "gap_replaying"
                ? "Replaying missed updates"
                : "Live updates using bounded polling fallback"}
            ${typeof props.eventCursor === "number"
              ? html` · cursor ${props.eventCursor}`
              : nothing}
            ${props.pushError ? html` · ${props.pushError}` : nothing}
          </div>
        </div>
        <div class="work-queue-page__controls">
          <input
            type="search"
            class="input"
            .value=${props.searchQuery}
            placeholder="Search active work"
            @input=${(event: Event) =>
              props.onSetSearchQuery((event.target as HTMLInputElement).value)}
          />
          <button type="button" class="btn btn--secondary" @click=${() => props.onRefresh()}>
            ${props.loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>
      <div class="work-queue-filters" aria-label="Work Queue filters">
        ${FILTERS.map(
          (filter) => html`
            <button
              type="button"
              class="work-queue-filter ${props.filter === filter.id
                ? "work-queue-filter--active"
                : ""}"
              @click=${() => props.onSetFilter(filter.id)}
            >
              ${filter.label}
            </button>
          `,
        )}
      </div>
      ${props.error ? html`<div class="callout danger">${props.error}</div>` : nothing}
      <div class="work-queue-shell">
        <section class="work-queue-list" aria-label="Work items">
          ${props.items.length === 0
            ? html`<div class="work-queue-empty">No work items match the current filter.</div>`
            : html`
                ${visibleGroups.map(
                  (group) => html`
                    <section class="work-queue-list-group" aria-label=${group.label}>
                      <h3 class="work-queue-list-group__title">${group.label}</h3>
                      ${group.items.map((item) => renderListItem(props, item))}
                    </section>
                  `,
                )}
                ${overflowItems.length > 0
                  ? html`
                      <details class="work-queue-show-more">
                        <summary>Show more (${overflowItems.length})</summary>
                        ${overflowGroups.map(
                          (group) => html`
                            <section class="work-queue-list-group" aria-label=${group.label}>
                              <h3 class="work-queue-list-group__title">${group.label}</h3>
                              ${group.items.map((item) => renderListItem(props, item))}
                            </section>
                          `,
                        )}
                      </details>
                    `
                  : nothing}
              `}
        </section>
        ${renderDetail(props)}
      </div>
    </section>
  `;
}
