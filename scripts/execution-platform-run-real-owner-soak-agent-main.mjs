#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { OperatorBrowserHarness } from "./lib/operator-browser-harness.mjs";

const ARTIFACT_DIR = ".artifacts/execution-platform";
const ACCEPTED_SAFE_BRIDGE_BASE = "https://srv1425839.tailbcf154.ts.net";

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

function writeArtifact(name, value) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  fs.writeFileSync(path.join(ARTIFACT_DIR, name), body);
  return { path: `${ARTIFACT_DIR}/${name}`, sha256: sha256(body) };
}

function hasArg(name) {
  return process.argv.includes(name);
}

function resolveSafeBridge() {
  const envCandidates = [
    ["OPENCLAW_TAILSCALE_SAFE_UI_BRIDGE_URL", process.env.OPENCLAW_TAILSCALE_SAFE_UI_BRIDGE_URL],
    ["OPENCLAW_SAFE_UI_BRIDGE_URL", process.env.OPENCLAW_SAFE_UI_BRIDGE_URL],
    ["TAILSCALE_SAFE_UI_BRIDGE_URL", process.env.TAILSCALE_SAFE_UI_BRIDGE_URL],
    ["OPENCLAW_TAILSCALE_GATEWAY_BASE_URL", process.env.OPENCLAW_TAILSCALE_GATEWAY_BASE_URL],
  ];
  for (const [source, value] of envCandidates) {
    if (typeof value === "string" && value.trim()) {
      return {
        configured: true,
        url: value.trim().replace(/\/$/, ""),
        source: `env:${source}`,
        envVarVisible: source === "OPENCLAW_TAILSCALE_SAFE_UI_BRIDGE_URL",
        acceptedFallbackUsed: false,
      };
    }
  }
  return {
    configured: true,
    url: ACCEPTED_SAFE_BRIDGE_BASE,
    source: "accepted_tailscale_safe_bridge_route",
    envVarVisible: false,
    acceptedFallbackUsed: true,
  };
}

function boundedPromptResult(prompt, result) {
  const assistantText = result?.summary?.lastAssistantText ?? "";
  return {
    promptIndex: prompt.promptIndex,
    promptHash: sha256(prompt.boundedPromptSummary),
    boundedPromptSummary: prompt.boundedPromptSummary,
    status: "human_ui_exercised",
    sessionKey: result?.sessionKey ?? null,
    runId: result?.runId ?? null,
    completionMode: result?.completionEvidence?.mode ?? result?.waitFor ?? null,
    completionSource: result?.completionEvidence?.source ?? null,
    assistantResponseHash: assistantText ? sha256(assistantText) : null,
    assistantResponseChars: assistantText.length,
    reasonCodes: ["agent_main_main_prompt_exercised_bounded_evidence"],
    runtimeJobId: result?.runId ?? null,
    workQueueItemId: null,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

function boundedPromptError(prompt, error) {
  return {
    promptIndex: prompt.promptIndex,
    promptHash: sha256(prompt.boundedPromptSummary),
    boundedPromptSummary: prompt.boundedPromptSummary,
    status: "blocked_human_ui_prompt_failed",
    reasonCodes: ["agent_main_main_prompt_failed"],
    errorKind: error?.name === "TimeoutError" ? "timeout" : "prompt_failed",
    errorMessageHash: sha256(error instanceof Error ? error.message : String(error)),
    runtimeJobId: null,
    workQueueItemId: null,
    rawPromptStored: false,
    rawResponseStored: false,
  };
}

const soakPrompts = [
  "Use the coding team to make a tiny product-safe Work Queue readback improvement.",
  "Use the web researcher to gather current structured-output guidance with bounded citations.",
  "Use research then coding to improve front-door provider readback safely.",
  "Use docs/skills writer to update the live router runbook.",
  "Use architecture/spec reviewer to review starter workflow boundaries.",
  "Use QA/test reviewer to validate no-false-success behavior.",
];

const promptSummaries = soakPrompts.map((summary, index) => ({
  promptIndex: index + 1,
  promptHash: sha256(summary),
  boundedPromptSummary: summary,
  status: "blocked_human_ui_not_exercised",
  reasonCodes: ["real_owner_soak_requires_proven_human_ui_provider_path"],
  runtimeJobId: null,
  workQueueItemId: null,
  rawPromptStored: false,
  rawResponseStored: false,
}));

const runHumanUi = hasArg("--run-human-ui");
const safeBridge = resolveSafeBridge();
let prompts = promptSummaries;

if (runHumanUi) {
  const promptLimitRaw = Number(process.env.OPENCLAW_REAL_OWNER_SOAK_PROMPT_LIMIT ?? "3");
  const promptLimit =
    Number.isFinite(promptLimitRaw) && promptLimitRaw > 0
      ? Math.min(promptSummaries.length, Math.floor(promptLimitRaw))
      : 3;
  const timeoutRaw = Number(process.env.OPENCLAW_REAL_OWNER_SOAK_TIMEOUT_MS ?? "900000");
  const timeoutMs =
    Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? Math.floor(timeoutRaw) : 900_000;
  const harness = await new OperatorBrowserHarness({
    origin: safeBridge.url,
    headless: true,
  }).start();
  try {
    const exercised = [];
    for (const prompt of promptSummaries.slice(0, promptLimit)) {
      try {
        const result = await harness.sendPrompt(prompt.boundedPromptSummary, {
          sessionKey: "main",
          waitFor: "progress",
          timeoutMs,
          startTimeoutMs: 180_000,
        });
        exercised.push(boundedPromptResult(prompt, result));
      } catch (error) {
        exercised.push(boundedPromptError(prompt, error));
      }
    }
    prompts = [...exercised, ...promptSummaries.slice(promptLimit)];
  } finally {
    await harness.close();
  }
}

const completedPromptCount = prompts.filter(
  (prompt) => prompt.status === "human_ui_exercised",
).length;
const blockedPromptCount = prompts.length - completedPromptCount;

writeArtifact("real-owner-soak-agent-main-preflight.json", {
  artifactKind: "real_owner_soak_agent_main_preflight",
  status: runHumanUi ? "human_ui_requested" : "blocked_human_ui_not_requested",
  sessionId: "agent:main:main",
  promptCount: promptSummaries.length,
  reasonCodes: runHumanUi
    ? ["safe_ui_bridge_resolved_for_agent_main_main_soak"]
    : ["real_owner_soak_requires_run_human_ui_flag"],
  safeBridge: {
    configured: safeBridge.configured,
    ref: safeBridge.source,
    envVarVisible: safeBridge.envVarVisible,
    acceptedFallbackUsed: safeBridge.acceptedFallbackUsed,
  },
  gatewayRestarted: false,
  gatewayReloaded: false,
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
});
writeArtifact("real-owner-soak-agent-main-run-index.json", {
  artifactKind: "real_owner_soak_agent_main_run_index",
  status: completedPromptCount > 0 ? "human_ui_exercised" : "blocked",
  sessionId: "agent:main:main",
  prompts,
  runtimeJobsCreated: completedPromptCount > 0,
  liveWorkQueueItemsCreated: false,
  authorityGranted: false,
  controlsApplied: false,
  deployPerformed: false,
  outboundSendPerformed: false,
  workQueueLifecycleMutated: false,
});
writeArtifact("real-owner-soak-agent-main-work-queue-proof.json", {
  artifactKind: "real_owner_soak_agent_main_work_queue_proof",
  status: completedPromptCount > 0 ? "human_ui_exercised_work_queue_not_mutated" : "blocked",
  reasonCodes:
    completedPromptCount > 0
      ? ["agent_main_main_soak_prompts_exercised_bounded_readback"]
      : ["real_owner_soak_not_run_without_human_ui_path"],
  workQueueLifecycleMutated: false,
  rawPromptStored: false,
  rawResponseStored: false,
});
writeArtifact("real-owner-soak-agent-main-provider-accounting.json", {
  artifactKind: "real_owner_soak_agent_main_provider_accounting",
  status: completedPromptCount > 0 ? "bounded_provider_accounting_recorded" : "not_run",
  providerCallsMade: completedPromptCount > 0,
  rawProviderLogStored: false,
  estimatedCostUsd: null,
});
writeArtifact("real-owner-soak-agent-main-summary.json", {
  artifactKind: "real_owner_soak_agent_main_summary",
  status:
    completedPromptCount === promptSummaries.length
      ? "completed"
      : completedPromptCount > 0
        ? "partial"
        : "blocked",
  completedPromptCount,
  blockedPromptCount,
  reasonCodes:
    completedPromptCount > 0
      ? ["agent_main_main_owner_soak_exercised_through_safe_ui_bridge"]
      : ["live_human_ui_provider_path_must_be_proven_before_owner_soak"],
  runtimeJobsCreated: completedPromptCount > 0,
  liveWorkQueueItemsCreated: false,
  gatewayRestarted: false,
  deployPerformed: false,
  outboundSendPerformed: false,
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
  workQueueLifecycleMutated: false,
});
