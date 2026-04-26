import { buildPhase2PersonalAutoSendProductUxReport } from "../../../extensions/model-memory/src/runtime/phase2-personal-autosend-product-ux.js";
import { buildPhase2ProactivityInboxReport } from "../../../extensions/model-memory/src/runtime/phase2-proactivity-inbox.js";
import { buildPhase2ProductProactivitySurfacingReport } from "../../../extensions/model-memory/src/runtime/phase2-product-proactivity-surfacing.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function resolveOperatorId(params: Record<string, unknown>, clientId: string | undefined): string {
  return readString(params.operatorId) ?? clientId ?? process.env.USER ?? "local-openclaw-operator";
}

export const modelMemoryProactivityHandlers: GatewayRequestHandlers = {
  "modelMemory.proactivity.queue": async ({ params, respond, client }) => {
    const sessionKey = readString(params.sessionKey) ?? "main";
    const operatorId = resolveOperatorId(params, client?.connect?.device?.id);
    try {
      const report = await buildPhase2ProductProactivitySurfacingReport({
        eligibilityScope: {
          userId:
            readString(params.userId) ?? process.env.OPENCLAW_USER_ID ?? "local-openclaw-user",
          recipientId:
            readString(params.recipientId) ??
            process.env.OPENCLAW_RECIPIENT_ID ??
            process.env.OPENCLAW_USER_ID ??
            "local-openclaw-recipient",
          projectId: readString(params.projectId) ?? process.env.OPENCLAW_PROJECT_ID ?? "openclaw",
          sessionKey,
          operatorId,
        },
        env: process.env,
      });
      respond(true, {
        ok: true,
        reportId: report.reportId,
        decision: report.decision,
        config: report.config,
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
  "modelMemory.proactivity.inbox": async ({ respond }) => {
    try {
      const report = await buildPhase2ProactivityInboxReport({ env: process.env });
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
};
