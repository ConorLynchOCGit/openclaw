import { createHash } from "node:crypto";
import { buildPhase2PersonalAutoSendProductUxReport } from "../../../extensions/model-memory/src/runtime/phase2-personal-autosend-product-ux.js";
import { buildPhase2ProactivityInboxReport } from "../../../extensions/model-memory/src/runtime/phase2-proactivity-inbox.js";
import { buildPhase2ProactivityUxRemediationReport } from "../../../extensions/model-memory/src/runtime/phase2-proactivity-ux-remediation.js";
import {
  buildModelMemoryProactivityRuntimeState,
  createSkillifierDraftForCandidate,
  recordPersistedProactivityChatActivity,
  recordPersistedProactivityLiveEvent,
  updatePersistedProactivityLifecycleOverride,
} from "../../infra/model-memory-proactivity-runtime.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
      const state = await buildModelMemoryProactivityRuntimeState({
        sessionKey,
        projectId,
        operatorId,
        userId,
        recipientId,
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
        draftPath: result.report.draft.skillDirectoryPath,
        reportPath: result.report.draft.reportFilePath,
        provenanceReportPath: result.report.draft.provenanceReportPath,
        rollbackPlanPath: result.report.draft.rollbackPlanPath,
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
      const operatorId = resolveOperatorId(params, client?.connect?.device?.id);
      const projectId =
        readString(params.projectId) ?? process.env.OPENCLAW_PROJECT_ID ?? "openclaw";
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
