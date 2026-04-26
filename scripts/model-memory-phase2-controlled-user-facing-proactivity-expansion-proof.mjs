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
        `controlled user-facing proactivity expansion proof contains prohibited marker: ${parts.join(
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
      return {
        observed: true,
        textSha256: sha256(expectedText),
      };
    }
    await delay(500);
  }
  throw new Error(
    `timed out waiting for controlled proactive expansion delivery text; tail=${lastTail.slice(
      0,
      160,
    )}`,
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
    ".artifacts/model-memory/phase2-controlled-user-facing-proactivity-expansion-proof",
    stamp,
  );
  await mkdir(outputDir, { recursive: true });

  const marker = `PHASE2-CONTROLLED-USER-FACING-PROACTIVITY-EXPANSION-${stamp}`;
  const sessionKey =
    process.env.MODEL_MEMORY_PHASE2_PROACTIVITY_EXPANSION_SESSION ?? DEFAULT_MAIN_SESSION_ALIAS;
  const operatorId = process.env.MODEL_MEMORY_PHASE2_PLANNER_OPERATOR_ID ?? "phase2-operator";
  const projectId = process.env.MODEL_MEMORY_PHASE2_PLANNER_PROJECT_ID ?? "openclaw";
  const origin = process.env.OPENCLAW_TAILNET_ORIGIN || DEFAULT_TAILNET_ORIGIN;

  const { buildPhase2ControlledUserFacingProactivityReport } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-controlled-user-facing-proactivity.ts",
    ),
    import.meta.url,
  );
  const { buildPhase2LiveProactiveMessageDeliveryReport } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-live-proactive-message-delivery.ts",
    ),
    import.meta.url,
  );
  const { buildPhase2ProactiveMessageOperatorDefaultReport } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-proactive-message-operator-default.ts",
    ),
    import.meta.url,
  );
  const {
    assertPhase2ControlledUserFacingProactivityExpansionProven,
    buildPhase2ControlledUserFacingProactivityExpansionReport,
    writePhase2ControlledUserFacingProactivityExpansionArtifact,
  } = await tsImport(
    path.join(
      root,
      "extensions/model-memory/src/runtime/phase2-controlled-user-facing-proactivity-expansion.ts",
    ),
    import.meta.url,
  );
  const harness = await new OperatorBrowserHarness({ headless: true, origin }).start();
  let proofTurn;
  try {
    await harness.ensureAuthenticated(sessionKey);
    proofTurn = await harness.sendPrompt(
      [
        "Operator Phase 2 controlled user-facing proactivity expansion proof.",
        `Proof marker: ${marker}-CONTROLLED-EXPANSION.`,
        "Verify both approved message classes require approval and bounded delivery.",
      ].join("\n"),
      { sessionKey, waitFor: "terminal", timeoutMs: 180_000 },
    );

    const approvedScope = { sessionKey, operatorId, projectId };
    const requestScope = { sessionKey, operatorId, projectId, purpose: "operator_eval" };
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

    const controlledReport = await buildPhase2ControlledUserFacingProactivityReport({
      proofMarker: `${marker}-CONTROLLED`,
      now: new Date(),
      approvedScope,
      requestScope,
      explicitSendApproval: true,
    });
    const liveDeliveryReport = await buildPhase2LiveProactiveMessageDeliveryReport({
      proofMarker: `${marker}-LIVE-DELIVERY`,
      now: new Date(),
      controlledReport,
      adapter,
    });
    await waitForVisibleDelivery(harness, "An approved operator suggestion is available.");
    const operatorDefaultReport = await buildPhase2ProactiveMessageOperatorDefaultReport({
      proofMarker: `${marker}-OPERATOR-DEFAULT`,
      now: new Date(),
      controlledUserFacingProactivityReport: controlledReport,
      liveDeliveryReport,
    });

    const firstClassReport = await buildPhase2ControlledUserFacingProactivityExpansionReport({
      proofMarker: `${marker}-FIRST-CLASS`,
      now: new Date(),
      approvedScope,
      requestScope,
      operatorDefaultReport,
      explicitSendApproval: true,
      messageClass: "operator_approved_suggestion_available",
      adapter,
    });
    const firstVisible = await waitForVisibleDelivery(
      harness,
      "An approved operator suggestion is available.",
    );
    if (!firstVisible.observed || !firstClassReport.deliveryResult.delivered) {
      throw new Error("first approved message class delivery was not observed");
    }

    const blockedClassReport = await buildPhase2ControlledUserFacingProactivityExpansionReport({
      proofMarker: `${marker}-BLOCKED-CLASS`,
      now: new Date(),
      approvedScope,
      requestScope,
      operatorDefaultReport,
      explicitSendApproval: true,
      messageClass: "external_instruction_message",
      adapter,
    });
    if (blockedClassReport.decision !== "blocked_message_class") {
      throw new Error(`blocked class expansion proof failed: ${blockedClassReport.decision}`);
    }

    const rollbackReport = await buildPhase2ControlledUserFacingProactivityExpansionReport({
      proofMarker: `${marker}-ROLLBACK`,
      now: new Date(),
      approvedScope,
      requestScope,
      operatorDefaultReport,
      explicitSendApproval: true,
      messageClass: "operator_approved_follow_up_available",
      adapter,
      env: { MODEL_MEMORY_PHASE2_CONTROLLED_USER_FACING_PROACTIVITY_EXPANSION_DISABLED: "1" },
    });
    if (rollbackReport.decision !== "blocked_rollback") {
      throw new Error(`rollback expansion proof failed: ${rollbackReport.decision}`);
    }

    const secondClassReport = await buildPhase2ControlledUserFacingProactivityExpansionReport({
      proofMarker: `${marker}-SECOND-CLASS`,
      now: new Date(),
      approvedScope,
      requestScope,
      operatorDefaultReport,
      explicitSendApproval: true,
      messageClass: "operator_approved_follow_up_available",
      adapter,
      uiEvidence: {
        sessionKey,
        proofMarker: marker,
        firstClassDeliveryId: firstClassReport.deliveryResult.deliveryId,
        secondClassDeliveryId: null,
        terminalEvidence: Boolean(assistantText(proofTurn).trim()),
      },
    });
    const secondVisible = await waitForVisibleDelivery(
      harness,
      "An approved follow-up suggestion is available.",
    );
    secondClassReport.uiEvidence = {
      sessionKey,
      proofMarker: marker,
      firstClassDeliveryId: firstClassReport.deliveryResult.deliveryId,
      secondClassDeliveryId: secondClassReport.deliveryResult.deliveryId,
      observedDeliveryTextSha256: secondVisible.textSha256,
      terminalEvidence: Boolean(assistantText(proofTurn).trim()),
    };
    assertPhase2ControlledUserFacingProactivityExpansionProven(secondClassReport);
    assertNoProhibitedContent(secondClassReport);

    const artifact = await writePhase2ControlledUserFacingProactivityExpansionArtifact({
      report: secondClassReport,
      artifactDir: outputDir,
    });
    console.log(
      JSON.stringify(
        {
          ok: true,
          decision: secondClassReport.decision,
          reportId: secondClassReport.reportId,
          marker,
          operatorDefaultReportId: operatorDefaultReport.reportId,
          firstClassDecision: firstClassReport.decision,
          firstClassDeliveryId: firstClassReport.deliveryResult.deliveryId,
          secondClassDecision: secondClassReport.decision,
          secondClassDeliveryId: secondClassReport.deliveryResult.deliveryId,
          controlledOnlySecondClass: secondClassReport.telemetry.controlledOnlySecondClass,
          blockedClassDecision: blockedClassReport.decision,
          rollbackDecision: rollbackReport.decision,
          broadDefaultProactivityEnabled:
            secondClassReport.telemetry.broadDefaultProactivityEnabled,
          autonomousSendingEnabled: secondClassReport.telemetry.autonomousSendingEnabled,
          noDarkDataStatus: secondClassReport.noDarkDataStatus,
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
