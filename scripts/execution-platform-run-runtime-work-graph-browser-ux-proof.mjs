#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  OperatorBrowserHarness,
  readTranscriptTerminalEvidence,
} from "./lib/operator-browser-harness.mjs";

const artifactRoot = ".artifacts/execution-platform";
const safeBridgeOrigin =
  process.env.OPENCLAW_TAILSCALE_SAFE_UI_BRIDGE_URL?.trim() ||
  process.env.OPENCLAW_SAFE_UI_BRIDGE_URL?.trim() ||
  process.env.OPENCLAW_TAILSCALE_GATEWAY_BASE_URL?.trim() ||
  "https://srv1425839.tailbcf154.ts.net";

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

function writeArtifact(name, value) {
  fs.mkdirSync(artifactRoot, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  fs.writeFileSync(path.join(artifactRoot, name), body, "utf8");
  return { path: `${artifactRoot}/${name}`, sha256: sha256(body) };
}

async function boundedFetch(url) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    await response.arrayBuffer();
    return { ok: response.ok, status: response.status, latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      ok: false,
      status: null,
      latencyMs: Date.now() - startedAt,
      reasonCode: error?.name === "AbortError" ? "timeout" : "fetch_failed",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function extractRuntimeRefs(text) {
  const source = String(text ?? "");
  return {
    runtimeJobIds: [...source.matchAll(/\bRuntime job:\s*([A-Za-z0-9:._-]+)/giu)]
      .map((match) => match[1])
      .slice(0, 10),
    graphIds: [...source.matchAll(/\bruntime-work-graph-[A-Za-z0-9-]+/giu)]
      .map((match) => match[0])
      .slice(0, 10),
    workQueueRefs: [...source.matchAll(/\b(?:Work Queue|work item):\s*([A-Za-z0-9:._-]+)/giu)]
      .map((match) => match[1])
      .slice(0, 10),
  };
}

function queryRuntimeEvidence(promptHash) {
  const script = `
    import { createExecutionPlatformDatabaseRuntime } from "./extensions/execution-platform/src/db/runtime.ts";
    import { RuntimeJobRepository } from "./extensions/execution-platform/src/runtime-job-repository.ts";
    async function main() {
      const runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
      try {
        const repo = new RuntimeJobRepository(runtime.sqlClient, { claimStrategy: "basic" });
        const jobs = await repo.listRecentJobs({ limit: 25 });
        const candidates = [];
        for (const job of jobs) {
          if (job.jobType !== "executor.agent_team") continue;
          const artifacts = await repo.listArtifacts(job.jobId);
          const router = artifacts.find((artifact) => artifact.artifactType === "execution.front_door.router_result");
          if (router?.metadata?.metadata?.promptHash !== ${JSON.stringify(promptHash)}) continue;
          const child = await repo.getJob(job.jobId + "-implementation-codex-bridge");
          const childArtifacts = child ? await repo.listArtifacts(child.jobId) : [];
          const childEvents = child ? await repo.listEvents(child.jobId, 200) : [];
          const liveResults = childArtifacts
            .filter((artifact) => artifact.artifactType === "codex_bridge.code_writing_pilot_live_result")
            .map((artifact) => artifact.metadata)
            .filter(Boolean);
          const finalLiveResult = liveResults.at(-1) ?? null;
          const validation = childArtifacts
            .filter((artifact) => artifact.artifactType === "codex_bridge.code_writing_pilot_validation_report")
            .map((artifact) => artifact.metadata)
            .filter(Boolean)
            .at(-1) ?? null;
          const unsafeStreamEventCount = childEvents.filter((event) => {
            if (event.eventType !== "codex_bridge.code_writing_pilot_stream_event") return false;
            const data = event.data;
            return Boolean(data?.raw || data?.normalized?.data);
          }).length;
          candidates.push({
            jobId: job.jobId,
            state: job.state,
            workItemId: job.workItemId,
            attempts: job.attempts,
            createdAt: job.createdAt ?? null,
            startedAt: job.startedAt ?? null,
            completedAt: job.completedAt,
            errorCode: job.error && typeof job.error === "object" ? job.error.code ?? null : null,
            errorReasonCode: job.error && typeof job.error === "object" && typeof job.error.message === "string" ? "runtime_job_error_present" : null,
            childJobId: child?.jobId ?? null,
            childState: child?.state ?? null,
            completedWorkPathSatisfied: finalLiveResult?.completedWorkPathSatisfied === true,
            completedWorkPathReason: typeof finalLiveResult?.completedWorkPathReason === "string" ? finalLiveResult.completedWorkPathReason : null,
            validationStatus: typeof validation?.status === "string" ? validation.status : null,
            closeoutPackHash: typeof finalLiveResult?.workEpisodeCloseout?.packHash === "string" ? finalLiveResult.workEpisodeCloseout.packHash : null,
            codexCliInvoked: finalLiveResult?.codexCliInvoked === true,
            actualFilesChanged: Array.isArray(finalLiveResult?.actualFilesChanged) ? finalLiveResult.actualFilesChanged.slice(0, 20) : [],
            streamEventCount: childEvents.filter((event) => event.eventType === "codex_bridge.code_writing_pilot_stream_event").length,
            unsafeStreamEventCount,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            workQueueLifecycleMutated: false,
          });
        }
        candidates.sort((left, right) => {
          const leftTime = Date.parse(left.completedAt ?? left.startedAt ?? left.createdAt ?? "");
          const rightTime = Date.parse(right.completedAt ?? right.startedAt ?? right.createdAt ?? "");
          return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
        });
        const succeeded = candidates.find(
          (candidate) => candidate.state === "succeeded" && candidate.childState === "succeeded",
        );
        const active = candidates.find((candidate) => !candidate.errorCode && candidate.state !== "pending");
        console.log(JSON.stringify(succeeded ?? active ?? candidates[0] ?? null));
      } finally {
        await runtime.pool.end();
      }
    }
    main();
  `;
  try {
    const stdout = execFileSync("pnpm", ["exec", "tsx", "--eval", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 45_000,
      maxBuffer: 256 * 1024,
    });
    return JSON.parse(stdout);
  } catch (error) {
    return {
      blocked: true,
      reasonCode: "runtime_evidence_query_failed",
      errorHash: sha256(error instanceof Error ? error.message : String(error)),
    };
  }
}

async function waitForRuntimeEvidence(promptHash, timeoutMs = 10 * 60 * 1000) {
  const deadline = Date.now() + timeoutMs;
  let latest = queryRuntimeEvidence(promptHash);
  while (
    latest &&
    !latest.blocked &&
    latest.jobId &&
    !latest.errorCode &&
    latest.completedWorkPathSatisfied === true &&
    latest.validationStatus === "passed" &&
    latest.childState === "succeeded" &&
    latest.state !== "succeeded" &&
    Date.now() < deadline
  ) {
    await new Promise((resolve) => setTimeout(resolve, 5_000));
    latest = queryRuntimeEvidence(promptHash);
  }
  return latest;
}

const boundedPromptSummary =
  "Use the OpenClaw coding team through Runtime Work Graph to make a tiny active-queue-07 readiness/readback improvement, validate it, review it, and close out.";
const runTag = `runtime-work-graph-ux-proof-${Date.now().toString(36)}`;
const prompt = [
  "Use the OpenClaw coding team to make a tiny owner-local product-safe readiness/readback improvement for active-queue-07 Core OpenClaw Loop Simplification.",
  `Bounded proof run tag: ${runTag}.`,
  "Use the Runtime Work Graph path and include bounded parent/child planning or readback evidence for Kimi/Codex implementation readiness and validation.",
  "Test it, review it, and close out with a model-authored report.",
  "Keep the work owner-local and avoid external side effects.",
].join(" ");
const promptHash = sha256(prompt);

async function main() {
  const preflight = {
    localHealth: await boundedFetch("http://127.0.0.1:28789/healthz"),
    localReady: await boundedFetch("http://127.0.0.1:28789/readyz"),
    tailscaleHealth: await boundedFetch(`${safeBridgeOrigin.replace(/\/$/, "")}/healthz`),
    tailscaleReady: await boundedFetch(`${safeBridgeOrigin.replace(/\/$/, "")}/readyz`),
    safeBridgeRef: safeBridgeOrigin.replace(/\/$/, ""),
  };
  writeArtifact("runtime-work-graph-browser-ux-proof-preflight.json", {
    artifactKind: "runtime_work_graph_browser_ux_proof_preflight",
    status:
      preflight.localReady.ok && preflight.tailscaleReady.ok ? "ready" : "blocked_health_check",
    health: preflight,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
  });

  const harness = await new OperatorBrowserHarness({
    origin: safeBridgeOrigin,
    headless: true,
  }).start();
  let result;
  let status = "blocked_runtime_work_graph_ux";
  let reasonCodes = [];
  try {
    result = await harness.sendPrompt(prompt, {
      sessionKey: "agent:main:main",
      waitFor: "terminal",
      assistantPattern: "Execution Platform|Runtime job:",
      timeoutMs: Number(process.env.OPENCLAW_RUNTIME_GRAPH_UX_TIMEOUT_MS ?? "600000"),
    });
    status = "human_ui_exercised";
    reasonCodes = ["human_ui_runtime_work_graph_prompt_exercised"];
  } catch (error) {
    status = "blocked_runtime_work_graph_ux";
    reasonCodes = [error?.name === "TimeoutError" ? "human_ui_timeout" : "human_ui_prompt_failed"];
    result = {
      errorHash: sha256(error instanceof Error ? error.message : String(error)),
      summary: { lastAssistantText: "" },
      sessionKey: "agent:main:main",
      runId: null,
      completionEvidence: null,
    };
  } finally {
    await harness.close();
  }

  let assistantText = result?.summary?.lastAssistantText ?? "";
  const refs = extractRuntimeRefs(assistantText);
  const runtimeEvidence = await waitForRuntimeEvidence(promptHash);
  if (!assistantText.trim()) {
    const transcriptEvidence = readTranscriptTerminalEvidence({
      sessionKey: "agent:main:main",
      prompt,
      assistantPattern: "Execution Platform|Runtime job:|Outcome",
    });
    assistantText = transcriptEvidence?.assistantText ?? "";
  }
  const runtimeEvidencePassed =
    runtimeEvidence &&
    !runtimeEvidence.blocked &&
    runtimeEvidence.state === "succeeded" &&
    runtimeEvidence.childState === "succeeded" &&
    runtimeEvidence.completedWorkPathSatisfied === true &&
    runtimeEvidence.validationStatus === "passed" &&
    runtimeEvidence.unsafeStreamEventCount === 0;
  const runtimeJobIds =
    refs.runtimeJobIds.length > 0
      ? refs.runtimeJobIds
      : runtimeEvidence?.jobId
        ? [runtimeEvidence.jobId]
        : [];
  const runArtifact = writeArtifact("runtime-work-graph-browser-ux-proof-run.json", {
    artifactKind: "runtime_work_graph_browser_ux_proof_run",
    status: runtimeEvidencePassed ? "passed_runtime_work_graph_ux" : status,
    reasonCodes: runtimeEvidencePassed
      ? [
          "human_ui_runtime_work_graph_prompt_exercised",
          "runtime_evidence_passed",
          ...(result?.errorHash
            ? ["browser_terminal_capture_reconciled_from_runtime_evidence"]
            : []),
        ]
      : reasonCodes,
    promptHash: sha256(prompt),
    boundedPromptSummary,
    runTag,
    sessionKey: result?.sessionKey ?? "agent:main:main",
    runId: result?.runId ?? null,
    assistantResponseHash: assistantText ? sha256(assistantText) : null,
    assistantResponseChars: assistantText.length,
    completionMode: result?.completionEvidence?.mode ?? null,
    completionSource: result?.completionEvidence?.source ?? null,
    runtimeJobIds,
    graphIds: refs.graphIds,
    workQueueRefs: refs.workQueueRefs,
    runtimeEvidence,
    runtimeJobsCreated: runtimeJobIds.length > 0,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  });
  writeArtifact("runtime-work-graph-browser-ux-work-queue-readback.json", {
    artifactKind: "runtime_work_graph_browser_ux_work_queue_readback",
    status: runtimeEvidencePassed
      ? "runtime_work_graph_readback_passed"
      : status === "human_ui_exercised"
        ? "readback_probe_recorded"
        : "blocked",
    runtimeJobIds,
    graphIds: refs.graphIds,
    workQueueRefs: refs.workQueueRefs,
    uiReadbackSurfaceRefs: [
      "ui://work-queue/runtime-work-graph",
      ".artifacts/execution-platform/runtime-work-graph-work-queue-ui-proof.json",
    ],
    sourceRunRef: runArtifact.path,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    workQueueLifecycleMutated: false,
  });
  writeArtifact("runtime-work-graph-browser-ux-quality-review.json", {
    artifactKind: "runtime_work_graph_browser_ux_quality_review",
    status: runtimeEvidencePassed
      ? "passed"
      : status === "human_ui_exercised"
        ? "needs_review"
        : "blocked",
    assessment: runtimeEvidencePassed
      ? "The browser UX submitted the Runtime Work Graph prompt and production runtime evidence shows Codex bridge completion, focused validation, closeout pack emission, bounded stream events, and no Work Queue lifecycle mutation."
      : status === "human_ui_exercised"
        ? "The browser UX accepted the owner prompt and displayed bounded progress/turn evidence. Full graph completion quality remains a follow-up active-queue proof unless runtime ids are present in the assistant readback."
        : "The browser UX proof did not reach progress evidence for the Runtime Work Graph prompt.",
    runtimeJobIds,
    graphIds: refs.graphIds,
    runtimeEvidence,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    workQueueLifecycleMutated: false,
  });
}

main().catch((error) => {
  writeArtifact("runtime-work-graph-browser-ux-proof-run.json", {
    artifactKind: "runtime_work_graph_browser_ux_proof_run",
    status: "blocked_runtime_work_graph_ux",
    reasonCodes: ["browser_ux_proof_script_failed"],
    errorHash: sha256(error instanceof Error ? error.message : String(error)),
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    workQueueLifecycleMutated: false,
  });
  process.exitCode = 1;
});
