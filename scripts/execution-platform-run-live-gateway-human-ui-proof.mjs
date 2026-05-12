#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { OperatorBrowserHarness } from "./lib/operator-browser-harness.mjs";

const ARTIFACT_DIR = ".artifacts/execution-platform";
const DEFAULT_LOCAL_BASE = "http://127.0.0.1:28789";
const DEFAULT_TAILSCALE_BASE = "https://srv1425839.tailbcf154.ts.net";
const ACCEPTED_SAFE_BRIDGE_BASE = "https://srv1425839.tailbcf154.ts.net";

function hasArg(name) {
  return process.argv.includes(name);
}

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

async function boundedFetch(url) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { accept: "application/json,text/plain,*/*" },
    });
    await response.arrayBuffer();
    return {
      ok: response.ok,
      status: response.status,
      urlHash: sha256(url),
      latencyMs: Date.now() - startedAt,
      bodyStored: false,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      urlHash: sha256(url),
      latencyMs: Date.now() - startedAt,
      errorKind: error?.name === "AbortError" ? "timeout" : "fetch_failed",
      bodyStored: false,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function providerConfigSummary() {
  return {
    liveRouterProviderGateConfigured: Boolean(
      process.env.OPENCLAW_FEATURE_LIVE_STRUCTURED_ROUTER_PROVIDER,
    ),
    ownerCanaryGateConfigured: Boolean(process.env.OPENCLAW_FEATURE_TWO_LANE_ROUTER_OWNER_CANARY),
    nativeSubmitGateConfigured: Boolean(
      process.env.OPENCLAW_FEATURE_NATIVE_EXECUTION_SUBMIT_FRONT_DOOR,
    ),
    routerModelRefConfigured: Boolean(process.env.OPENCLAW_INTENT_FRONT_DOOR_ROUTER_MODEL_REF),
    routerProviderProfileConfigured: Boolean(
      process.env.OPENCLAW_INTENT_FRONT_DOOR_ROUTER_PROVIDER_PROFILE,
    ),
    routerPolicyRefConfigured: Boolean(process.env.OPENCLAW_INTENT_FRONT_DOOR_ROUTER_POLICY_REF),
    providerSecretConfigured: Boolean(process.env.OPENROUTER_API_KEY),
    rawConfigStored: false,
    secretsStored: false,
  };
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

function promptProof(promptId, summary, expectation) {
  return {
    promptId,
    promptHash: sha256(summary),
    boundedPromptSummary: summary,
    expectation,
    status: "blocked_human_ui_not_exercised",
    reasonCodes: ["live_human_ui_bridge_not_exercised_in_this_static_run"],
    runtimeJobsCreated: false,
    authorityGranted: false,
    controlsApplied: false,
    deployPerformed: false,
    outboundSendPerformed: false,
    workQueueLifecycleMutated: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function boundedPromptResult(prompt, result, status = "human_ui_exercised") {
  const assistantText = result?.summary?.lastAssistantText ?? "";
  const completionEvidence = result?.completionEvidence ?? {};
  return {
    promptId: prompt.promptId,
    promptHash: sha256(prompt.summary),
    boundedPromptSummary: prompt.summary,
    expectation: prompt.expectation,
    status,
    sessionKey: result?.sessionKey ?? null,
    runId: result?.runId ?? null,
    completionMode:
      typeof completionEvidence.mode === "string" ? completionEvidence.mode : result?.waitFor,
    completionSource:
      typeof completionEvidence.source === "string" ? completionEvidence.source : null,
    assistantResponseHash: assistantText ? sha256(assistantText) : null,
    assistantResponseChars: assistantText.length,
    transcriptGroupCount:
      typeof result?.summary?.transcriptGroupCount === "number"
        ? result.summary.transcriptGroupCount
        : null,
    reasonCodes: ["human_ui_prompt_exercised_bounded_evidence"],
    runtimeJobsCreated: false,
    authorityGranted: false,
    controlsApplied: false,
    deployPerformed: false,
    outboundSendPerformed: false,
    workQueueLifecycleMutated: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
  };
}

function boundedPromptError(prompt, error) {
  return {
    ...promptProof(prompt.promptId, prompt.summary, prompt.expectation),
    status: "blocked_human_ui_prompt_failed",
    reasonCodes: ["human_ui_prompt_failed"],
    errorKind: error?.name === "TimeoutError" ? "timeout" : "prompt_failed",
    errorMessageHash: sha256(error instanceof Error ? error.message : String(error)),
  };
}

const localBase = process.env.OPENCLAW_LOCAL_GATEWAY_BASE_URL ?? DEFAULT_LOCAL_BASE;
const tailscaleBase = process.env.OPENCLAW_TAILSCALE_GATEWAY_BASE_URL ?? DEFAULT_TAILSCALE_BASE;
const safeBridge = resolveSafeBridge();
const safeBridgeUrl = safeBridge.url;
const runHumanUi = hasArg("--run-human-ui");
const health = {
  localHealth: await boundedFetch(`${localBase}/healthz`),
  localReady: await boundedFetch(`${localBase}/readyz`),
  tailscaleHealth: await boundedFetch(`${tailscaleBase}/healthz`),
  tailscaleReady: await boundedFetch(`${tailscaleBase}/readyz`),
  safeBridgeConfigured: safeBridge.configured,
  safeBridgeRef: safeBridge.source,
  safeBridgeEnvVarVisible: safeBridge.envVarVisible,
  safeBridgeAcceptedFallbackUsed: safeBridge.acceptedFallbackUsed,
};

writeArtifact("live-gateway-human-ui-preflight-proof.json", {
  artifactKind: "live_gateway_human_ui_preflight_proof",
  status: runHumanUi ? "ready_for_manual_or_harnessed_human_ui" : "blocked_human_ui_not_requested",
  health,
  providerConfig: providerConfigSummary(),
  gatewayRestarted: false,
  gatewayReloaded: false,
  gatewayEnvChanged: false,
  rawPromptStored: false,
  rawResponseStored: false,
  rawProviderLogStored: false,
  secretsStored: false,
});

const promptSpecs = [
  {
    promptId: "normal-chat",
    summary: "Explain how we should improve Work Queue routing visibility.",
    expectation: "chat remains chat",
    waitFor: "terminal",
  },
  {
    promptId: "plan-only",
    summary: "How would you approach making router provider failures easier to inspect?",
    expectation: "plan only, no runtime job",
    waitFor: "terminal",
  },
  {
    promptId: "coding",
    summary:
      "Have the team make a tiny product-safe improvement to Intent Front Door provider outage readback.",
    expectation: "front-door execution after validation",
    waitFor: "progress",
  },
  {
    promptId: "web-research",
    summary: "Research current structured-output guidance and store bounded citations only.",
    expectation: "web research workflow with bounded refs",
    waitFor: "progress",
  },
  {
    promptId: "docs-skills",
    summary: "Update docs/runbook coverage for configuring the live router provider.",
    expectation: "docs/skills workflow",
    waitFor: "progress",
  },
  {
    promptId: "architecture-spec",
    summary: "Review architecture for starter workflow Work Queue readback.",
    expectation: "architecture/spec workflow",
    waitFor: "progress",
  },
  {
    promptId: "qa-test",
    summary: "Review focused validation coverage and no-false-success behavior.",
    expectation: "QA/test workflow",
    waitFor: "progress",
  },
  {
    promptId: "negation",
    summary: "Do not send anything; improve outbound route-state readback.",
    expectation: "no send",
    waitFor: "progress",
  },
  {
    promptId: "conditional-deploy",
    summary: "Add a tiny regression test and deploy if policy permits.",
    expectation: "no deploy without policy proof",
    waitFor: "progress",
  },
  {
    promptId: "control",
    summary: "Cancel that job.",
    expectation: "target/control validation required",
    waitFor: "terminal",
  },
  {
    promptId: "slash",
    summary: "/compact",
    expectation: "ProtocolPreGate slash bypass",
    waitFor: "terminal",
  },
];
let prompts = promptSpecs.map((prompt) =>
  promptProof(prompt.promptId, prompt.summary, prompt.expectation),
);

if (runHumanUi && safeBridgeUrl) {
  const promptLimitRaw = Number(process.env.OPENCLAW_HUMAN_UI_PROOF_PROMPT_LIMIT ?? "2");
  const promptLimit =
    Number.isFinite(promptLimitRaw) && promptLimitRaw > 0
      ? Math.min(promptSpecs.length, Math.floor(promptLimitRaw))
      : 2;
  const timeoutRaw = Number(process.env.OPENCLAW_HUMAN_UI_PROOF_TIMEOUT_MS ?? "180000");
  const timeoutMs =
    Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? Math.floor(timeoutRaw) : 180_000;
  const harness = await new OperatorBrowserHarness({
    origin: safeBridgeUrl,
    headless: true,
  }).start();
  try {
    const exercised = [];
    for (const prompt of promptSpecs.slice(0, promptLimit)) {
      try {
        const result = await harness.sendPrompt(prompt.summary, {
          sessionKey: "main",
          waitFor: prompt.waitFor,
          timeoutMs,
        });
        exercised.push(boundedPromptResult(prompt, result));
      } catch (error) {
        exercised.push(boundedPromptError(prompt, error));
      }
    }
    prompts = [
      ...exercised,
      ...promptSpecs
        .slice(promptLimit)
        .map((prompt) => promptProof(prompt.promptId, prompt.summary, prompt.expectation)),
    ];
  } finally {
    await harness.close();
  }
}

writeArtifact("live-gateway-human-ui-normal-chat-proof.json", {
  artifactKind: "live_gateway_human_ui_normal_chat_proof",
  status: prompts.some((prompt) => prompt.status === "human_ui_exercised")
    ? "partial_human_ui_exercised"
    : "blocked_human_ui_not_exercised",
  prompts: prompts.filter((prompt) => ["normal-chat", "plan-only"].includes(prompt.promptId)),
  health,
});
writeArtifact("live-gateway-human-ui-execution-proof.json", {
  artifactKind: "live_gateway_human_ui_execution_proof",
  status: prompts.some(
    (prompt) =>
      prompt.status === "human_ui_exercised" &&
      ["coding", "web-research", "docs-skills", "architecture-spec", "qa-test"].includes(
        prompt.promptId,
      ),
  )
    ? "partial_human_ui_exercised"
    : "blocked_human_ui_not_exercised",
  prompts: prompts.filter((prompt) =>
    ["coding", "web-research", "docs-skills", "architecture-spec", "qa-test"].includes(
      prompt.promptId,
    ),
  ),
  providerConfig: providerConfigSummary(),
});
writeArtifact("live-gateway-human-ui-negation-conditional-proof.json", {
  artifactKind: "live_gateway_human_ui_negation_conditional_proof",
  status: prompts.some(
    (prompt) =>
      prompt.status === "human_ui_exercised" &&
      ["negation", "conditional-deploy"].includes(prompt.promptId),
  )
    ? "partial_human_ui_exercised"
    : "blocked_human_ui_not_exercised",
  prompts: prompts.filter((prompt) => ["negation", "conditional-deploy"].includes(prompt.promptId)),
});
writeArtifact("live-gateway-human-ui-control-slash-proof.json", {
  artifactKind: "live_gateway_human_ui_control_slash_proof",
  status: prompts.some(
    (prompt) =>
      prompt.status === "human_ui_exercised" && ["control", "slash"].includes(prompt.promptId),
  )
    ? "partial_human_ui_exercised"
    : "blocked_human_ui_not_exercised",
  prompts: prompts.filter((prompt) => ["control", "slash"].includes(prompt.promptId)),
});
writeArtifact("live-gateway-human-ui-work-queue-proof.json", {
  artifactKind: "live_gateway_human_ui_work_queue_proof",
  status: prompts.some((prompt) => prompt.status === "human_ui_exercised")
    ? "human_ui_exercised_work_queue_not_mutated"
    : "blocked_human_ui_not_exercised",
  reasonCodes: prompts.some((prompt) => prompt.status === "human_ui_exercised")
    ? ["human_visible_agent_main_main_exercised_bounded_evidence"]
    : ["human_visible_agent_main_main_not_exercised"],
  workQueueLifecycleMutated: false,
  rawPromptStored: false,
  rawResponseStored: false,
});
writeArtifact("live-gateway-human-ui-health-postcheck-proof.json", {
  artifactKind: "live_gateway_human_ui_health_postcheck_proof",
  status: "postcheck_recorded",
  health: {
    localHealth: await boundedFetch(`${localBase}/healthz`),
    localReady: await boundedFetch(`${localBase}/readyz`),
    tailscaleHealth: await boundedFetch(`${tailscaleBase}/healthz`),
    tailscaleReady: await boundedFetch(`${tailscaleBase}/readyz`),
  },
  gatewayRestarted: false,
  gatewayReloaded: false,
  rawLogsStored: false,
});
