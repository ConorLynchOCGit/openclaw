import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildPhase2PersonalAutoSendProductUxReport,
  buildPhase2ProactivityInboxReport,
  buildPhase2ProactivityUxRemediationReport,
  type Phase2OpportunityPlannedArtifact,
} from "../../../extensions/model-memory/runtime-api.js";
import {
  buildModelMemoryProactivityRuntimeState,
  createSkillifierDraftForCandidate,
  readPersistedModelMemoryProactivityProjection,
  recordPersistedProactivityChatActivity,
  recordPersistedProactivityLiveEvent,
  updatePersistedProactivityLifecycleOverride,
} from "../../infra/model-memory-proactivity-runtime.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readNonNegativeNumber(value: unknown): number | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number.parseInt(value, 10)
        : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function readBooleanParam(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "0") {
      return false;
    }
  }
  return undefined;
}

function resolveOperatorId(params: Record<string, unknown>, clientId: string | undefined): string {
  return readString(params.operatorId) ?? clientId ?? process.env.USER ?? "local-openclaw-operator";
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function boundedSummary(value: unknown): string {
  const summary = readString(value) ?? "A bounded OpenClaw runtime event is ready for review.";
  return summary.replace(/\s+/gu, " ").slice(0, 480).trim();
}

function boundedMultilineSummary(value: unknown): string {
  const raw = readString(value) ?? "A bounded OpenClaw chat activity is ready for review.";
  return raw
    .replace(/\r\n/gu, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/gu, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 480)
    .trim();
}

function boundedMultilineSummaryOrUndefined(value: unknown): string | undefined {
  const raw = readString(value);
  if (!raw) {
    return undefined;
  }
  return boundedMultilineSummary(raw);
}

async function readSkillDraftArtifactText(draftPath: string): Promise<string> {
  const stat = await fs.stat(draftPath);
  const skillFilePath = stat.isDirectory() ? path.join(draftPath, "SKILL.md") : draftPath;
  return await fs.readFile(skillFilePath, "utf8");
}

function readPlannedArtifact(value: unknown): Phase2OpportunityPlannedArtifact | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const status = readString(record.status);
  if (status !== "requested" && status !== "compiled" && status !== "failed") {
    return undefined;
  }
  const title = boundedSummary(record.title);
  const requestSummary = boundedMultilineSummary(record.requestSummary);
  const compiledPlan = boundedMultilineSummaryOrUndefined(record.compiledPlan);
  const reviewStatus = readString(record.reviewStatus);
  const sourceRunId = readString(record.sourceRunId);
  const sourceMessageId = readString(record.sourceMessageId);
  const contentHash = readString(record.contentHash);
  return {
    status,
    ...(reviewStatus === "pending_review" ||
    reviewStatus === "recommendation_finalized" ||
    reviewStatus === "revision_requested"
      ? { reviewStatus }
      : {}),
    title,
    requestSummary,
    ...(compiledPlan ? { compiledPlan } : {}),
    ...(sourceRunId ? { sourceRunId } : {}),
    ...(sourceMessageId ? { sourceMessageId } : {}),
    generatedAt: readString(record.generatedAt) ?? new Date().toISOString(),
    updatedAt: readString(record.updatedAt) ?? new Date().toISOString(),
    ...(contentHash ? { contentHash } : {}),
  };
}

function emptyProjectionQueue(sessionKey: string, projectId: string) {
  return {
    queueId: `phase2-proactivity-read-projection-empty:${sha256({ sessionKey, projectId }).slice(
      0,
      12,
    )}`,
    surface: "chat" as const,
    items: [],
    generatedAt: new Date().toISOString(),
  };
}

function emptyProjectionInboxDigest(sessionKey: string, projectId: string) {
  const generatedAt = new Date().toISOString();
  return {
    digestId: `phase2-proactivity-inbox-empty:${sha256({ sessionKey, projectId }).slice(0, 12)}`,
    filters: ["actionable", "pending", "planned", "dismissed", "diagnostics"],
    items: [],
    counts: {
      actionable: 0,
      pending: 0,
      planned: 0,
      sent: 0,
      snoozed: 0,
      dismissed: 0,
      blocked: 0,
      autosend_trial: 0,
      diagnostics: 0,
    },
    layerCounts: {
      actionable: 0,
      history: 0,
      diagnostic: 0,
    },
    generatedAt,
  };
}

function readSourceKind(value: unknown) {
  const kind = readString(value);
  if (
    kind === "assistant_turn" ||
    kind === "planning_output" ||
    kind === "user_turn" ||
    kind === "system_followup"
  ) {
    return kind;
  }
  return "assistant_turn";
}

function readSignalKind(value: unknown) {
  const kind = readString(value);
  if (
    kind === "active_work_state" ||
    kind === "unresolved_question" ||
    kind === "recent_failure" ||
    kind === "repeated_friction" ||
    kind === "incomplete_follow_up" ||
    kind === "stale_decision" ||
    kind === "maintenance_candidate" ||
    kind === "project_state_capsule" ||
    kind === "recent_memory_update" ||
    kind === "session_event"
  ) {
    return kind;
  }
  return "session_event";
}

function readSourceType(value: unknown) {
  const type = readString(value);
  if (
    type === "ordinary_turn_capture" ||
    type === "session_runtime_event" ||
    type === "task_or_queue_state" ||
    type === "maintenance_loop_output" ||
    type === "project_state_capsule" ||
    type === "derived_memory_artifact" ||
    type === "operator_feedback_event" ||
    type === "gateway_delivery_or_error_event"
  ) {
    return type;
  }
  return "session_runtime_event";
}

function readReviewStatus(value: unknown) {
  const status = readString(value);
  if (
    status === "pending_review" ||
    status === "recommendation_finalized" ||
    status === "revision_requested"
  ) {
    return status;
  }
  return undefined;
}

export const modelMemoryProactivityHandlers: GatewayRequestHandlers = {
  "modelMemory.proactivity.recordChatActivity": async ({ params, respond }) => {
    const sessionKey = readString(params.sessionKey) ?? "main";
    const projectId = readString(params.projectId) ?? process.env.OPENCLAW_PROJECT_ID ?? "openclaw";
    const sourceKind = readSourceKind(params.sourceKind);
    const boundedText = boundedMultilineSummaryOrUndefined(params.boundedText);
    if (!boundedText && (sourceKind === "assistant_turn" || sourceKind === "planning_output")) {
      respond(true, {
        ok: true,
        skipped: true,
        reasonCode: "missing_bounded_text",
        sourceKind,
      });
      return;
    }
    const sourceMessageId =
      readString(params.sourceMessageId) ??
      `chat-message-${sha256({ sessionKey, projectId, sourceKind, boundedText: boundedText ?? null }).slice(0, 16)}`;
    const sourceRunId = readString(params.sourceRunId);
    const sourceId =
      readString(params.sourceId) ??
      `chat-activity-${sha256({ projectId, sessionKey, sourceKind, sourceMessageId }).slice(0, 16)}`;
    const sourceRef = `chat://${sessionKey}/${sourceKind}/${sourceMessageId}`;
    await recordPersistedProactivityChatActivity({
      sessionKey,
      projectId,
      sourceKind,
      sourceMessageId,
      sourceRunId,
      userPromptSummary: readString(params.userPromptSummary),
      boundedText: boundedText ?? boundedMultilineSummary(params.boundedText),
    });
    respond(true, {
      ok: true,
      sourceId,
      sourceMessageId,
      sourceKind,
      sourceRef,
    });
  },
  "modelMemory.proactivity.updateOpportunityState": async ({ params, respond }) => {
    const opportunityId = readString(params.opportunityId);
    const status = readString(params.status);
    if (!opportunityId || !status) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "invalid opportunity state update params"),
      );
      return;
    }
    const projectId = readString(params.projectId) ?? process.env.OPENCLAW_PROJECT_ID ?? "openclaw";
    const sessionKey = readString(params.sessionKey) ?? "main";
    await updatePersistedProactivityLifecycleOverride({
      sessionKey,
      projectId,
      override: {
        opportunityId,
        status: status as
          | "open"
          | "surfaced"
          | "draft_ready"
          | "planning_started"
          | "planned"
          | "in_progress"
          | "done"
          | "dismissed"
          | "snoozed"
          | "superseded",
        updatedAt: new Date().toISOString(),
        resolvedByChatMessageId: readString(params.resolvedByChatMessageId) ?? null,
        supersededByOpportunityId: readString(params.supersededByOpportunityId) ?? null,
        dismissalCooldownUntil: readString(params.dismissalCooldownUntil) ?? null,
        plannedArtifact: readPlannedArtifact(params.plannedArtifact) ?? null,
        reviewStatus: readReviewStatus(params.reviewStatus),
      },
    });
    respond(true, { ok: true, opportunityId, status });
  },
  "modelMemory.proactivity.recordLiveEvent": async ({ params, respond }) => {
    const sessionKey = readString(params.sessionKey) ?? "main";
    const projectId = readString(params.projectId) ?? process.env.OPENCLAW_PROJECT_ID ?? "openclaw";
    const summary = boundedSummary(params.boundedSummary);
    const sourceType = readSourceType(params.sourceType);
    const signalKind = readSignalKind(params.signalKind);
    const sourceId =
      readString(params.sourceId) ??
      `gateway-live-event-${sha256({ projectId, sessionKey, sourceType, signalKind, summary }).slice(0, 16)}`;
    const sourceRef = `gateway://model-memory/proactivity/live-event/${sourceId}`;
    await recordPersistedProactivityLiveEvent({
      event: {
        sourceId,
        sourceType: readSourceType(params.sourceType),
        signalKind: readSignalKind(params.signalKind),
        projectId,
        sessionKey,
        boundedSummary: summary,
        sourceRefs: [sourceRef],
        sourceProfileId:
          readSourceType(params.sourceType) === "ordinary_turn_capture"
            ? "explicit_user_turn"
            : "manual_note",
        authorityTier:
          readSourceType(params.sourceType) === "ordinary_turn_capture"
            ? "user_authoritative"
            : "tool_grounded",
        contentHash: sha256({ sourceId, projectId, sessionKey, sourceType, signalKind, summary }),
        proofHash: sha256({ sourceRef, sourceId, signalKind }),
        freshness: "recent",
        conflictState: "clear",
        inspectionOnly: false,
        noDarkDataStatus: "pass",
        limitations: ["bounded_runtime_event_summary_only"],
      },
    });
    respond(true, {
      ok: true,
      sourceId,
      sourceRef,
      signalKind,
      sourceType,
      projectId,
      sessionKey,
    });
  },
  "modelMemory.proactivity.queue": async ({ params, respond, client }) => {
    const sessionKey = readString(params.sessionKey) ?? "main";
    const operatorId = resolveOperatorId(params, client?.connect?.device?.id);
    const projectId = readString(params.projectId) ?? process.env.OPENCLAW_PROJECT_ID ?? "openclaw";
    try {
      const userId =
        readString(params.userId) ?? process.env.OPENCLAW_USER_ID ?? "local-openclaw-user";
      const recipientId =
        readString(params.recipientId) ??
        process.env.OPENCLAW_RECIPIENT_ID ??
        process.env.OPENCLAW_USER_ID ??
        "local-openclaw-recipient";
      const forceRuntimeUpdate = readBooleanParam(params.candidateReviewForceRun) === true;
      if (!forceRuntimeUpdate) {
        const projection = await readPersistedModelMemoryProactivityProjection({
          sessionKey,
          projectId,
        });
        const report = projection.projection?.productSurfacingReport ?? null;
        respond(true, {
          ok: true,
          readMode: "projection",
          projectionStatus: projection.decision,
          projectionGeneratedAt: projection.projection?.generatedAt ?? null,
          reportId: report?.reportId ?? projection.reportId,
          decision: report?.decision ?? projection.decision,
          config: report?.config ?? null,
          liveDetectionReport: null,
          extractionReport: null,
          growthLoopReport: null,
          skillCandidateReport: null,
          candidateReviewTriggerReport: null,
          candidateReviewReport: null,
          candidateReviewCodexAdapterReport: null,
          mergeAdjudicationReport: null,
          ledgerReport: null,
          draftReport: null,
          queue: report?.queue ?? emptyProjectionQueue(sessionKey, projectId),
          rollbackPlan: report?.rollbackPlan ?? null,
          telemetry: report?.telemetry ?? null,
          workEpisodeOutcomePackIndex: {
            count: projection.workEpisodeOutcomePackIndex.length,
            unreviewedEligibleCount: projection.workEpisodeOutcomePackIndex.filter(
              (entry) =>
                entry.reviewStatus === "unreviewed" && entry.eligibilityStatus === "eligible",
            ).length,
          },
        });
        return;
      }
      const state = await buildModelMemoryProactivityRuntimeState({
        sessionKey,
        projectId,
        operatorId,
        userId,
        recipientId,
        candidateReviewOverride: {
          cooldownMs: readNonNegativeNumber(params.candidateReviewCooldownMs),
          forceRun: true,
          codexSessionRoot: readString(params.candidateReviewCodexSessionRoot),
          codexHistoryPath: readString(params.candidateReviewCodexHistoryPath),
        },
      });
      const report = state.productSurfacingReport;
      respond(true, {
        ok: true,
        reportId: report.reportId,
        decision: report.decision,
        config: report.config,
        liveDetectionReport: {
          reportId: state.liveDetectionReport.reportId,
          decision: state.liveDetectionReport.decision,
          telemetry: state.liveDetectionReport.telemetry,
        },
        extractionReport: {
          reportId: state.extractionReport.reportId,
          decision: state.extractionReport.decision,
          candidateCount: state.extractionReport.telemetry.candidateCount,
        },
        growthLoopReport: {
          reportId: state.growthLoopReport.reportId,
          loopCount: state.growthLoopReport.telemetry.loopCount,
          reversePromptCount: state.growthLoopReport.telemetry.reversePromptCount,
          opportunityCount: state.growthLoopReport.telemetry.opportunityCount,
          maintenanceJobCount: state.growthLoopReport.telemetry.maintenanceJobCount,
          recoveredCount: state.growthLoopReport.telemetry.recoveredCount,
        },
        skillCandidateReport: {
          reportId: state.skillCandidateReport.reportId,
          decision: state.skillCandidateReport.decision,
          recordCount: state.skillCandidateReport.telemetry.recordCount,
          opportunityCount: state.skillCandidateReport.telemetry.opportunityCount,
        },
        candidateReviewTriggerReport: state.candidateReviewTriggerReport
          ? {
              source: state.candidateReviewTriggerReport.source,
              enabled: state.candidateReviewTriggerReport.enabled,
              modelId: state.candidateReviewTriggerReport.modelId,
              resolvedModelId: state.candidateReviewTriggerReport.resolvedModelId,
              reasoningEffort: state.candidateReviewTriggerReport.reasoningEffort,
              validationStatus: state.candidateReviewTriggerReport.validationStatus,
              reasonCodes: state.candidateReviewTriggerReport.reasonCodes,
              promptPersisted: state.candidateReviewTriggerReport.promptPersisted,
              rawResponsePersisted: state.candidateReviewTriggerReport.rawResponsePersisted,
              triggerDecision: state.candidateReviewTriggerDecision,
            }
          : null,
        candidateReviewReport: state.candidateReviewReport
          ? {
              source: state.candidateReviewReport.source,
              enabled: state.candidateReviewReport.enabled,
              modelId: state.candidateReviewReport.modelId,
              resolvedModelId: state.candidateReviewReport.resolvedModelId,
              reasoningEffort: state.candidateReviewReport.reasoningEffort,
              validationStatus: state.candidateReviewReport.validationStatus,
              reasonCodes: state.candidateReviewReport.reasonCodes,
              proposalCount: state.candidateReviewReport.proposalCount,
              surfacedProposalCount: state.candidateReviewReport.surfacedProposalCount,
              episodePacketHash: state.candidateReviewReport.episodePacketHash,
              episodePacketPath: state.candidateReviewReport.episodePacketPath,
              episodeTurnCount: state.candidateReviewReport.episodeTurnCount,
              codexAdapterStatus: state.candidateReviewReport.codexAdapterStatus,
              packetQuality: state.candidateReviewReport.packetQuality,
              rejectedProposalDiagnostics:
                state.candidateReviewReport.rejectedProposalDiagnostics ?? [],
              promptPersisted: state.candidateReviewReport.promptPersisted,
              rawResponsePersisted: state.candidateReviewReport.rawResponsePersisted,
              acceptedProposalKinds: [
                ...new Set(
                  (state.candidateReviewProposals ?? [])
                    .filter((proposal) => proposal.shouldSurface)
                    .map((proposal) => proposal.proposalKind),
                ),
              ],
              sourceRuntimes: [
                ...new Set(
                  state.candidateReviewReport.sourceRuntimes ??
                    (state.candidateReviewProposals ?? []).map(
                      (proposal) => proposal.sourceRuntime,
                    ),
                ),
              ],
            }
          : null,
        candidateReviewCodexAdapterReport: state.candidateReviewCodexAdapterReport
          ? {
              status: state.candidateReviewCodexAdapterReport.status,
              reasonCode: state.candidateReviewCodexAdapterReport.reasonCode,
              entryCount: state.candidateReviewCodexAdapterReport.entryCount,
              sourceRoot: state.candidateReviewCodexAdapterReport.sourceRoot,
              sessionRefs: state.candidateReviewCodexAdapterReport.sessionRefs,
              commandSummaryCount: state.candidateReviewCodexAdapterReport.commandSummaryCount,
              validationFailureCount:
                state.candidateReviewCodexAdapterReport.validationFailureCount,
            }
          : null,
        mergeAdjudicationReport: state.mergeAdjudicationReport
          ? {
              reportId: state.mergeAdjudicationReport.reportId,
              enabled: state.mergeAdjudicationReport.enabled,
              modelId: state.mergeAdjudicationReport.modelId,
              decision: state.mergeAdjudicationReport.decision,
              recallRowCount: state.mergeAdjudicationReport.recallRows.length,
              decisions: state.mergeAdjudicationReport.decisions.map((decision) => ({
                candidateOpportunityId: decision.candidateOpportunityId,
                decision: decision.decision,
                targetOpportunityId: decision.targetOpportunityId,
                rationale: decision.rationale,
                confidence: decision.confidence,
              })),
              lifecycleOverrideCount: state.mergeAdjudicationReport.lifecycleOverrides.length,
              reasonCodes: state.mergeAdjudicationReport.reasonCodes,
              promptPersisted: state.mergeAdjudicationReport.promptPersisted,
              rawResponsePersisted: state.mergeAdjudicationReport.rawResponsePersisted,
            }
          : null,
        ledgerReport: {
          reportId: state.ledgerReport.reportId,
          decision: state.ledgerReport.decision,
          entryCount: state.ledgerReport.telemetry.entryCount,
        },
        draftReport: {
          reportId: state.draftReport.reportId,
          decision: state.draftReport.decision,
          draftCount: state.draftReport.telemetry.draftCount,
        },
        queue: report.queue,
        rollbackPlan: report.rollbackPlan,
        telemetry: report.telemetry,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `model-memory proactivity queue unavailable: ${message}`,
        ),
      );
    }
  },
  "modelMemory.proactivity.skillifyCandidateDraft": async ({ params, respond, client }) => {
    const sessionKey = readString(params.sessionKey) ?? "main";
    const operatorId = resolveOperatorId(params, client?.connect?.device?.id);
    const projectId = readString(params.projectId) ?? process.env.OPENCLAW_PROJECT_ID ?? "openclaw";
    const skillCandidateId = readString(params.skillCandidateId);
    if (!skillCandidateId) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "model-memory skillifier draft requires skillCandidateId",
        ),
      );
      return;
    }
    try {
      const userId =
        readString(params.userId) ?? process.env.OPENCLAW_USER_ID ?? "local-openclaw-user";
      const recipientId =
        readString(params.recipientId) ??
        process.env.OPENCLAW_RECIPIENT_ID ??
        process.env.OPENCLAW_USER_ID ??
        "local-openclaw-recipient";
      const requestedTargetKind =
        readString(params.requestedTargetKind) === "workspace_agents_skills_dir"
          ? "workspace_agents_skills_dir"
          : readString(params.requestedTargetKind) === "workspace_skills_dir"
            ? "workspace_skills_dir"
            : undefined;
      const result = await createSkillifierDraftForCandidate({
        sessionKey,
        projectId,
        operatorId,
        userId,
        recipientId,
        skillCandidateId,
        requestedTargetKind,
      });
      respond(true, {
        ok: true,
        skillCandidateId,
        reportId: result.report.reportId,
        decision: result.report.decision,
        skillPackageId: result.report.skillPackageId,
        packageTitle: result.report.packageTitle,
        draftPath: result.report.draft.skillDirectoryPath,
        reportPath: result.report.draft.reportFilePath,
        provenanceReportPath: result.report.draft.provenanceReportPath,
        rollbackPlanPath: result.report.draft.rollbackPlanPath,
        reviewSummary: result.report.draft.reportSummary,
        nextReviewStep: result.report.draft.nextReviewStep,
        reviewOnly: true,
        installationEnabled: false,
        promotionEnabled: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `model-memory skillifier draft unavailable: ${message}`),
      );
    }
  },
  "modelMemory.proactivity.readArtifact": async ({ params, respond }) => {
    const sessionKey = readString(params.sessionKey) ?? "main";
    const projectId = readString(params.projectId) ?? process.env.OPENCLAW_PROJECT_ID ?? "openclaw";
    const queueItemId = readString(params.queueItemId);
    const artifactKind = readString(params.artifactKind);
    if (!queueItemId || (artifactKind !== "plan" && artifactKind !== "skill")) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "model-memory proactivity artifact read requires queueItemId and artifactKind",
        ),
      );
      return;
    }
    try {
      const projection = await readPersistedModelMemoryProactivityProjection({
        sessionKey,
        projectId,
      });
      const item = projection.projection?.productSurfacingReport.queue.items.find(
        (entry) => entry.queueItemId === queueItemId,
      );
      if (!item) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "artifact not found"));
        return;
      }
      if (artifactKind === "plan") {
        respond(true, {
          ok: true,
          artifactText:
            item.plannedArtifact?.compiledPlan ?? item.plannedArtifact?.requestSummary ?? "",
        });
        return;
      }
      if (!item.skillifierDraft?.draftPath) {
        respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "skill draft not found"));
        return;
      }
      const artifactText = await readSkillDraftArtifactText(item.skillifierDraft.draftPath);
      respond(true, { ok: true, artifactText });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `model-memory proactivity artifact read unavailable: ${message}`,
        ),
      );
    }
  },
  "modelMemory.proactivity.personalAutosendUx": async ({ params, respond }) => {
    try {
      const report = await buildPhase2PersonalAutoSendProductUxReport({
        env: process.env,
        userDisabled: params.userDisabled === true,
      });
      respond(true, {
        ok: true,
        reportId: report.reportId,
        decision: report.decision,
        settings: report.settings,
        telemetry: report.telemetry,
        rollbackPlan: report.rollbackPlan,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `model-memory personal autosend UX unavailable: ${message}`,
        ),
      );
    }
  },
  "modelMemory.proactivity.inbox": async ({ params, respond, client }) => {
    try {
      const sessionKey = readString(params.sessionKey) ?? "main";
      const projectId =
        readString(params.projectId) ?? process.env.OPENCLAW_PROJECT_ID ?? "openclaw";
      const forceRuntimeUpdate = readBooleanParam(params.candidateReviewForceRun) === true;
      if (!forceRuntimeUpdate) {
        const projection = await readPersistedModelMemoryProactivityProjection({
          sessionKey,
          projectId,
        });
        const report = projection.projection?.inboxReport ?? null;
        respond(true, {
          ok: true,
          readMode: "projection",
          projectionStatus: projection.decision,
          projectionGeneratedAt: projection.projection?.generatedAt ?? null,
          reportId: report?.reportId ?? projection.reportId,
          decision: report?.decision ?? projection.decision,
          state: report?.state ?? {
            stateId: `phase2-proactivity-inbox-empty-state:${sha256({
              sessionKey,
              projectId,
            }).slice(0, 12)}`,
            visibleInNormalUx: true,
            rollbackDisabled: false,
            sourceReportIds: [],
            sourceReportHashes: [],
          },
          digest: report?.digest ?? emptyProjectionInboxDigest(sessionKey, projectId),
          telemetry: report?.telemetry ?? null,
          rollbackPlan: report?.rollbackPlan ?? null,
        });
        return;
      }
      const operatorId = resolveOperatorId(params, client?.connect?.device?.id);
      const userId =
        readString(params.userId) ?? process.env.OPENCLAW_USER_ID ?? "local-openclaw-user";
      const recipientId =
        readString(params.recipientId) ??
        process.env.OPENCLAW_RECIPIENT_ID ??
        process.env.OPENCLAW_USER_ID ??
        "local-openclaw-recipient";
      const state = await buildModelMemoryProactivityRuntimeState({
        sessionKey,
        projectId,
        operatorId,
        userId,
        recipientId,
        candidateReviewOverride: {
          cooldownMs: readNonNegativeNumber(params.candidateReviewCooldownMs),
          forceRun: true,
          codexSessionRoot: readString(params.candidateReviewCodexSessionRoot),
          codexHistoryPath: readString(params.candidateReviewCodexHistoryPath),
        },
      });
      const report = await buildPhase2ProactivityInboxReport({
        env: process.env,
        productSurfacingReport: state.productSurfacingReport,
      });
      respond(true, {
        ok: true,
        reportId: report.reportId,
        decision: report.decision,
        state: report.state,
        digest: report.digest,
        telemetry: report.telemetry,
        rollbackPlan: report.rollbackPlan,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `model-memory proactivity inbox unavailable: ${message}`,
        ),
      );
    }
  },
  "modelMemory.proactivity.uxRemediation": async ({ respond }) => {
    try {
      const report = await buildPhase2ProactivityUxRemediationReport({ env: process.env });
      respond(true, {
        ok: true,
        reportId: report.reportId,
        decision: report.decision,
        entryPoint: report.entryPoint,
        drawer: report.drawer,
        telemetry: report.telemetry,
        rollbackPlan: report.rollbackPlan,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `model-memory proactivity UX remediation unavailable: ${message}`,
        ),
      );
    }
  },
};
