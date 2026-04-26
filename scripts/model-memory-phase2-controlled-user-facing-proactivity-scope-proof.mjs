#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";
import {
  DEFAULT_MAIN_SESSION_ALIAS,
  DEFAULT_TAILNET_ORIGIN,
  OperatorBrowserHarness,
} from "./lib/operator-browser-harness.mjs";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function timestampId() {
  return new Date().toISOString().replace(/[-:.]/g, "").replace(/Z$/u, "Z");
}

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""))
    .digest("hex");
}

function assistantText(turn) {
  const transcriptText = turn?.completionEvidence?.transcript?.assistantText;
  if (typeof transcriptText === "string" && transcriptText.trim().length > 0) {
    return transcriptText;
  }
  return turn?.summary?.lastAssistantText ?? "";
}

function assertNoProhibitedContent(value) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const parts of [
    ["raw", "-", "prompt", "-", "marker"],
    ["raw", "-", "transcript", "-", "marker"],
    ["raw", "-", "tool", "-", "log", "-", "marker"],
    ["secret", "-", "marker"],
    ["private", "-", "phrase", "-", "marker"],
  ]) {
    if (serialized.includes(parts.join(""))) {
      throw new Error(
        `controlled user-facing proactivity scope proof contains prohibited marker: ${parts.join(
          "",
        )}`,
      );
    }
  }
}

async function waitForVisibleDelivery(harness, expectedText, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastTail = "";
  while (Date.now() <= deadline) {
    const snapshot = await harness.snapshotChat();
    lastTail = snapshot.transcriptTailText ?? snapshot.bodyTextSnippet ?? "";
    const transcriptText = (snapshot.transcriptGroups ?? [])
      .map((group) => group.text ?? "")
      .join("\n");
    if (transcriptText.includes(expectedText) || lastTail.includes(expectedText)) {
      return { observed: true, textSha256: sha256(expectedText) };
    }
    await delay(500);
  }
  throw new Error(
    `timed out waiting for scoped proactive delivery text; tail=${lastTail.slice(0, 160)}`,
  );
}

async function injectThroughAuthenticatedBrowser(harness, params) {
  return await harness.page.evaluate(async ({ sessionKey, message, label }) => {
    const probe = window.__OPENCLAW_OPERATOR_PROMPT_PROBE__;
    const socket = probe?.sockets?.find((candidate) => candidate.readyState === WebSocket.OPEN);
    if (!socket) {
      throw new Error("missing authenticated operator websocket");
    }
    const pending = new Map();
    const sendRequest = (method, requestParams) =>
      new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        const timeout = window.setTimeout(() => {
          pending.delete(id);
          reject(new Error(`gateway request timeout: ${method}`));
        }, 30_000);
        pending.set(id, {
          resolve(value) {
            window.clearTimeout(timeout);
            resolve(value);
          },
          reject(error) {
            window.clearTimeout(timeout);
            reject(error);
          },
        });
        socket.send(JSON.stringify({ type: "req", id, method, params: requestParams }));
      });
    const onMessage = (event) => {
      let frame = null;
      try {
        frame = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (frame?.type !== "res" || typeof frame.id !== "string") {
        return;
      }
      const match = pending.get(frame.id);
      if (!match) {
        return;
      }
      pending.delete(frame.id);
      if (frame.ok === true) {
        match.resolve(frame.payload ?? frame.result);
      } else {
        match.reject(new Error(frame.error?.message || "gateway request failed"));
      }
    };
    socket.addEventListener("message", onMessage);
    try {
      const result = await sendRequest("chat.inject", { sessionKey, message, label });
      await new Promise((resolve) => window.setTimeout(resolve, 500));
      return {
        ok: typeof result?.messageId === "string",
        messageId: typeof result?.messageId === "string" ? result.messageId : null,
      };
    } finally {
      socket.removeEventListener("message", onMessage);
    }
  }, params);
}

async function main() {
  const root = repoRoot();
  const stamp = timestampId();
  const outputDir = path.join(
    root,
    ".artifacts/model-memory/phase2-controlled-user-facing-proactivity-scope-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-CONTROLLED-USER-FACING-PROACTIVITY-SCOPE-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_CONTROLLED_USER_FACING_SCOPE_SESSION ??
    DEFAULT_MAIN_SESSION_ALIAS;
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;

  const { buildPhase2ProactiveMessageExpandedOperatorDefaultReport } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-proactive-message-expanded-operator-default.ts",
    ),
    import.meta.url,
  );
  const { buildPhase2ProactiveDeliveryHealthReport } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-proactive-delivery-observability.ts",
    ),
    import.meta.url,
  );
  const {
    assertPhase2ControlledUserFacingProactivityScopeDelivered,
    buildPhase2ControlledUserFacingProactivityScopeReport,
    writePhase2ControlledUserFacingProactivityScopeArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-controlled-user-facing-proactivity-scope.ts",
    ),
    import.meta.url,
  );

  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let proofTurn;
  try {
    await harness.ensureAuthenticated(sessionKey);
    proofTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 controlled user-facing proactivity scope proof.",
        `Proof marker: ${marker}-SCOPE.`,
        "Validate real user-facing scoped proactive delivery; no broad/default proactivity.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );

    const expandedOperatorDefaultReport =
      await buildPhase2ProactiveMessageExpandedOperatorDefaultReport({
        proofMarker: `${marker}-EXPANDED-DEFAULT`,
        now: new Date(),
      });
    const observabilityReport = await buildPhase2ProactiveDeliveryHealthReport({
      proofMarker: `${marker}-OBSERVABILITY`,
      now: new Date(),
      expandedOperatorDefaultReport,
    });
    const approvedScope = {
      environment: "live",
      rolloutMode: "controlled_user_scope",
      sessionKey,
      projectId: "openclaw",
      userId: "phase2-approved-user",
      recipientId: "phase2-approved-recipient",
      operatorId: "phase2-operator",
      allowedMessageClasses: [
        "operator_approved_suggestion_available",
        "operator_approved_follow_up_available",
      ],
    };
    const adapter = {
      kind: "gateway_chat_inject",
      async deliver(input) {
        const result = await injectThroughAuthenticatedBrowser(harness, {
          sessionKey: input.sessionKey,
          message: input.boundedDisplayText,
          label: input.label,
        });
        return {
          ok: typeof result?.messageId === "string",
          adapterKind: "gateway_chat_inject",
          delivered: typeof result?.messageId === "string",
          messageId: typeof result?.messageId === "string" ? result.messageId : undefined,
          observableInOperatorUi: true,
          resultHash: sha256(JSON.stringify(result ?? {})),
          reasonCodes:
            typeof result?.messageId === "string"
              ? ["gateway_chat_inject_delivered"]
              : ["gateway_chat_inject_failed"],
        };
      },
    };
    const firstClassReport = await buildPhase2ControlledUserFacingProactivityScopeReport({
      proofMarker: `${marker}-FIRST-CLASS`,
      now: new Date(),
      expandedOperatorDefaultReport,
      observabilityReport,
      approvedScope,
      requestScope: approvedScope,
      explicitSendApproval: true,
      messageClass: "operator_approved_suggestion_available",
      adapter,
    });
    const firstVisible = await waitForVisibleDelivery(
      harness,
      "An approved operator suggestion is available.",
    );
    const secondClassReport = await buildPhase2ControlledUserFacingProactivityScopeReport({
      proofMarker: `${marker}-SECOND-CLASS`,
      now: new Date(),
      expandedOperatorDefaultReport,
      observabilityReport,
      approvedScope,
      requestScope: approvedScope,
      explicitSendApproval: true,
      messageClass: "operator_approved_follow_up_available",
      adapter,
    });
    const secondVisible = await waitForVisibleDelivery(
      harness,
      "An approved follow-up suggestion is available.",
    );
    const outsideScopeReport = await buildPhase2ControlledUserFacingProactivityScopeReport({
      proofMarker: `${marker}-OUTSIDE-SCOPE`,
      now: new Date(),
      expandedOperatorDefaultReport,
      observabilityReport,
      approvedScope,
      requestScope: { ...approvedScope, sessionKey: "outside-scope-session" },
      explicitSendApproval: true,
      messageClass: "operator_approved_suggestion_available",
      adapter,
    });
    if (outsideScopeReport.decision !== "blocked_scope") {
      throw new Error(`outside scope proof failed: ${outsideScopeReport.decision}`);
    }
    const rollbackReport = await buildPhase2ControlledUserFacingProactivityScopeReport({
      proofMarker: `${marker}-ROLLBACK`,
      now: new Date(),
      expandedOperatorDefaultReport,
      observabilityReport,
      approvedScope,
      requestScope: approvedScope,
      explicitSendApproval: true,
      messageClass: "operator_approved_follow_up_available",
      env: { MODEL_MEMORY_PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_SCOPE_DISABLED: "1" },
      adapter,
    });
    if (rollbackReport.decision !== "blocked_rollback") {
      throw new Error(`rollback proof failed: ${rollbackReport.decision}`);
    }
    assertPhase2ControlledUserFacingProactivityScopeDelivered(firstClassReport);
    assertPhase2ControlledUserFacingProactivityScopeDelivered(secondClassReport);

    const report = await buildPhase2ControlledUserFacingProactivityScopeReport({
      proofMarker: `${marker}-FINAL`,
      now: new Date(),
      expandedOperatorDefaultReport,
      observabilityReport,
      approvedScope,
      requestScope: approvedScope,
      explicitSendApproval: true,
      messageClass: "operator_approved_follow_up_available",
      adapter,
      uiEvidence: {
        sessionKey,
        proofMarker: marker,
        insideScopeDeliveryId: secondClassReport.deliveryEvidence.deliveryId,
        outsideScopeReportId: outsideScopeReport.reportId,
        rollbackReportId: rollbackReport.reportId,
        terminalEvidence: Boolean(assistantText(proofTurn).trim()),
        observedDeliveryTextSha256: sha256(
          `${firstVisible.textSha256}:${secondVisible.textSha256}`,
        ),
      },
    });
    assertPhase2ControlledUserFacingProactivityScopeDelivered(report);
    assertNoProhibitedContent(report);

    const artifact = await writePhase2ControlledUserFacingProactivityScopeArtifact({
      report,
      artifactDir: outputDir,
    });
    console.log(
      JSON.stringify(
        {
          ok: true,
          decision: report.decision,
          reportId: report.reportId,
          marker,
          messageClass: report.messageClass,
          deliveryId: report.deliveryEvidence.deliveryId,
          expandedOperatorDefaultReportId: report.telemetry.expandedOperatorDefaultReportId,
          observabilityReportId: report.telemetry.observabilityReportId,
          observabilityStatus: report.telemetry.observabilityStatus,
          scopeMatched: report.telemetry.scopeMatched,
          firstClassDecision: firstClassReport.decision,
          secondClassDecision: secondClassReport.decision,
          outsideScopeDecision: outsideScopeReport.decision,
          rollbackDecision: rollbackReport.decision,
          broadDefaultProactivityEnabled: report.telemetry.broadDefaultProactivityEnabled,
          autonomousSendingEnabled: report.telemetry.autonomousSendingEnabled,
          noDarkDataStatus: report.noDarkDataStatus,
          jsonPath: artifact.jsonPath,
          markdownPath: artifact.markdownPath,
          contentHash: artifact.contentHash,
        },
        null,
        2,
      ),
    );
  } finally {
    await harness.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
