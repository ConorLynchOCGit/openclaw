#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { OperatorBrowserHarness } from "./lib/operator-browser-harness.mjs";

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
  const filePath = path.join(artifactRoot, name);
  fs.writeFileSync(filePath, body, "utf8");
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

function buildLongPrompt(runTag) {
  return [
    "You are OpenClaw running a real owner-local coding-team job through the live UX path.",
    "",
    `Runtime proof run id: ${runTag}.`,
    "",
    "Goal: implement the first production-safe Product/Spec Planning Worker Contract surface.",
    "",
    "This is a real coding task, not a proof runner. Route through agent_team.coding and complete the work through the OpenClaw Runtime Work Graph path.",
    "",
    "Current truth:",
    "",
    "- Runtime Work Graph exists.",
    "- Work Queue is projection/control/readback, not lifecycle truth.",
    "- Runtime jobs remain lifecycle truth.",
    "- Human operator task adapter exists.",
    "- Kimi standard implementation adapter exists but still needs live proof as a real implementation lane.",
    "- Codex parity implementation adapter exists for complex implementation and repair.",
    "- Dynamic validation repair loop exists and must be exercised in this job.",
    "- Work Queue readback must show what actually happened, not just process metadata.",
    "",
    "Task:",
    "",
    "Implement a Product/Spec Planning Worker Contract surface that supports product/spec planning jobs as a first-class workflow contract.",
    "",
    "The contract should distinguish at least these modes:",
    "",
    "- plan_only: produce a bounded product/spec plan only.",
    "- child_action_graph_proposal: produce bounded proposed child actions that can later be reviewed/compiled into runtime jobs.",
    "",
    "Implement the smallest production-safe version that is genuinely useful and wired into the existing Execution Platform patterns. If the basic surface already exists, make the smallest generally useful hardening, readback, test, or docs improvement that directly supports this Product/Spec Planning Worker Contract objective.",
    "",
    "Expected implementation areas may include:",
    "",
    "- extensions/execution-platform/src/workflows/",
    "- extensions/execution-platform/src/work-queue/",
    "- extensions/execution-platform/src/codex-bridge/",
    "- relevant tests beside touched files",
    "- relevant Execution Platform docs/specs if behavior changes",
    "",
    "Do not redesign the entire Work Queue in this slice. Keep the implementation scoped to Product/Spec Planning Worker Contract shape, readback, validation, and owner-visible evidence.",
    "",
    "Execution requirements:",
    "",
    "1. Orchestrator must run first.",
    "   - Use the real dynamic Runtime Work Graph path.",
    "   - Produce child nodes for context, implementation, validation/test, review, and closeout.",
    "   - Do not use static role artifacts as the source of truth.",
    "",
    "2. Kimi must attempt the first scoped standard implementation edit.",
    "   - Kimi should receive bounded task summary, approved file refs, context refs, and validation refs.",
    "   - Kimi must either produce a scoped file edit with validation evidence or return needs_review/escalate.",
    "   - If Kimi cannot complete cleanly, escalate to Codex parity implementation inside the same runtime job.",
    "   - Do not count Kimi as successful unless real changed-file evidence exists.",
    "",
    "3. Include one human/scope decision node.",
    "   - Ask the owner/operator decision as a bounded human task:",
    '     "Should Product/Spec Planning default to plan_only, or should it default to child_action_graph_proposal when the prompt asks for implementation planning?"',
    "   - For this run, use the bounded decision: child_action_graph_proposal.",
    "   - Resume the graph from that decision.",
    "   - The human decision must appear in Runtime Work Graph and Work Queue readback.",
    "",
    "4. Exercise validation repair in the same runtime job.",
    "   - Run focused validation.",
    "   - If validation fails, the test engineer must inspect bounded validation evidence.",
    "   - The implementation worker must repair inside the same runtime job.",
    "   - Validation must rerun after repair.",
    "   - Final success requires accepted validation evidence.",
    "   - Do not fail the whole job just because the first validation attempt fails.",
    "",
    "5. Produce real source changes.",
    "   - If this task requires code and no source files change, the runtime job must be needs_review or failed, never succeeded.",
    "   - Do not claim success from prose or process completion.",
    "",
    "6. Work Queue/readback must show:",
    "   - runtime job id",
    "   - graph id",
    "   - child nodes",
    "   - Kimi attempt and result",
    "   - Codex escalation or repair if used",
    "   - human decision node and resume ref",
    "   - role/model refs",
    "   - changed files",
    "   - validation attempts",
    "   - repair attempts",
    "   - final closeout",
    "   - limitations",
    "   - ELI5 progress",
    "",
    "Safety boundaries:",
    "",
    "- Do not deploy.",
    "- Do not send outbound messages.",
    "- Do not promote models.",
    "- Do not change gateway port, auth, pairing state, ACP endpoint, or unrelated env.",
    "- Do not mutate Work Queue lifecycle directly.",
    "- Do not store raw prompts, raw responses, raw transcripts, provider logs, tool logs, command logs, DB rows, secrets, or hidden reasoning.",
    "- Store only bounded summaries, hashes, refs, reason codes, runtime ids, model refs, artifact refs, validation refs, and closeout refs.",
    "- Deterministic code validates shape, refs, bounds, authority, storage, lifecycle, and budgets.",
    "- Model-authored roles judge product quality and implementation quality.",
    "",
    "Validation requirements:",
    "",
    "Run focused tests for the files you touch.",
    "",
    "At minimum, add or update tests proving:",
    "",
    "- Product/Spec Planning Worker Contract parses/validates.",
    "- plan_only and child_action_graph_proposal are distinct.",
    "- owner/human decision can choose the planning default.",
    "- Work Queue/readback exposes Product/Spec Planning mode and evidence refs.",
    "- no raw prompt/response/log storage is accepted.",
    "- Work Queue lifecycle is not mutated.",
    "",
    "Closeout requirements:",
    "",
    "Produce one final model-authored closeout report with:",
    "",
    "- what changed",
    "- files changed",
    "- workflow selected",
    "- roles/agents used",
    "- models used",
    "- Kimi result",
    "- Codex result if used",
    "- human decision result",
    "- validation/repair result",
    "- tests run",
    "- limitations",
    "- whether this is production-ready",
    "- ELI5 progress",
    "",
    "The final job should only succeed if runtime evidence supports the work product.",
  ].join("\n");
}

function queryRuntimeEvidence(input) {
  const script = `
    import { createExecutionPlatformDatabaseRuntime } from "./extensions/execution-platform/src/db/runtime.ts";
    import { RuntimeJobRepository } from "./extensions/execution-platform/src/runtime-job-repository.ts";
    const promptHash = ${JSON.stringify(input.promptHash)};
    const startedAfter = Date.parse(${JSON.stringify(input.startedAfter)});
    function asRecord(value) {
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    }
    function artifactPromptHash(artifact) {
      const metadata = asRecord(artifact.metadata);
      return metadata.promptHash ?? asRecord(metadata.metadata).promptHash ?? null;
    }
    function latestByType(artifacts, type) {
      return artifacts.filter((artifact) => artifact.artifactType === type).at(-1) ?? null;
    }
    function summarizeParity(metadata) {
      const record = asRecord(metadata);
      const validation = asRecord(record.validation);
      const records = Array.isArray(validation.records) ? validation.records : [];
      return {
        status: record.status ?? null,
        modelRef: asRecord(record.modelSelection).modelRef ?? null,
        providerPath: asRecord(record.modelSelection).providerPath ?? null,
        executionMode: record.executionMode ?? null,
        leaseId: asRecord(record.lease).leaseId ?? null,
        changedFileRefs: Array.isArray(record.changedFileRefs) ? record.changedFileRefs.slice(0, 40) : [],
        diffChangedFileRefs: Array.isArray(asRecord(record.diff).changedFiles) ? asRecord(record.diff).changedFiles.map((file) => file.fileRef).slice(0, 40) : [],
        validationRecords: records.map((item) => ({
          commandRef: item.commandRef ?? null,
          status: item.status ?? null,
          exitCode: item.exitCode ?? null,
          durationMs: item.durationMs ?? null,
        })).slice(0, 12),
        reasonCodes: Array.isArray(record.reasonCodes) ? record.reasonCodes.slice(0, 40) : [],
        rawPromptStored: record.rawPromptStored ?? null,
        rawResponseStored: record.rawResponseStored ?? null,
        rawProviderLogStored: record.rawProviderLogStored ?? null,
        rawCommandLogsStored: record.rawCommandLogsStored ?? null,
      };
    }
    async function main() {
      const runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
      try {
        const repo = new RuntimeJobRepository(runtime.sqlClient, { claimStrategy: "basic" });
        const jobs = await repo.listRecentJobs({ jobTypes: ["executor.agent_team"], limit: 50 });
        const candidates = [];
        for (const job of jobs) {
          const createdAtMs = Date.parse(job.createdAt?.toISOString?.() ?? String(job.createdAt ?? ""));
          if (Number.isFinite(startedAfter) && Number.isFinite(createdAtMs) && createdAtMs + 120000 < startedAfter) {
            continue;
          }
          const artifacts = await repo.listArtifacts(job.jobId);
          const routerArtifact = artifacts.find((artifact) => artifact.artifactType === "execution.front_door.router_result");
          const matchesPromptHash = artifactPromptHash(routerArtifact) === promptHash;
          const sourcePromptMatch = artifacts.some((artifact) => {
            const metadata = asRecord(artifact.metadata);
            const source = asRecord(metadata.sourcePromptResolution);
            return source.promptHash === promptHash;
          });
          if (!matchesPromptHash && !sourcePromptMatch) {
            continue;
          }
          const events = await repo.listEvents(job.jobId, 500);
          const parityArtifact = latestByType(artifacts, "codex_parity.runtime_adapter_result");
          const taskGraph = latestByType(artifacts, "agent_team.coding_real_work_task_graph");
          const dynamicOrchestrator = latestByType(artifacts, "agent_team.dynamic_orchestrator_plan");
          const dynamicValidationRepair = latestByType(
            artifacts,
            "agent_team.dynamic_validation_repair_loop",
          );
          const kimiAttempt = latestByType(
            artifacts,
            "agent_team.kimi_standard_implementation_attempt",
          );
          const humanScopeDecision = latestByType(
            artifacts,
            "agent_team.human_scope_decision",
          );
          const dynamicProgress = artifacts
            .filter((artifact) => artifact.artifactType === "agent_team.dynamic_progress")
            .map((artifact) => asRecord(artifact.metadata));
          const runtimeEvidence = latestByType(artifacts, "agent_team.runtime_evidence");
          const roleReports = artifacts.filter((artifact) => artifact.artifactType === "agent_team.inline_role_report");
          const closeoutTiming = latestByType(artifacts, "agent_team.closeout_model_timing");
          const parity = parityArtifact ? summarizeParity(parityArtifact.metadata) : null;
          const evidenceMetadata = asRecord(runtimeEvidence?.metadata);
          candidates.push({
            jobId: job.jobId,
            state: job.state,
            workItemId: job.workItemId,
            createdAt: job.createdAt?.toISOString?.() ?? null,
            startedAt: job.startedAt?.toISOString?.() ?? null,
            completedAt: job.completedAt?.toISOString?.() ?? null,
            errorCode: asRecord(job.error).code ?? null,
            artifactTypes: [...new Set(artifacts.map((artifact) => artifact.artifactType))].sort(),
            eventTypes: [...new Set(events.map((event) => event.eventType))].sort(),
            parity,
            taskGraph: taskGraph ? {
              graphId: asRecord(taskGraph.metadata).graphId ?? null,
              nodeCount: Array.isArray(asRecord(taskGraph.metadata).nodes) ? asRecord(taskGraph.metadata).nodes.length : 0,
              roles: Array.isArray(asRecord(taskGraph.metadata).nodes)
                ? asRecord(taskGraph.metadata).nodes.map((node) => ({ roleId: node.roleId, modelId: node.modelId })).slice(0, 16)
                : [],
            } : null,
            dynamicTaskGraph: dynamicOrchestrator
              ? {
                  graphId: asRecord(dynamicOrchestrator.metadata).graphId ?? null,
                  nodeCount: Array.isArray(asRecord(asRecord(dynamicOrchestrator.metadata).plan).childTasks)
                    ? asRecord(asRecord(dynamicOrchestrator.metadata).plan).childTasks.length
                    : 0,
                  artifactType: "agent_team.dynamic_orchestrator_plan",
                }
              : null,
            runtimeEvidence: runtimeEvidence ? {
              teamRunId: evidenceMetadata.teamRunId ?? null,
              reviewState: evidenceMetadata.reviewState ?? null,
              validationState: evidenceMetadata.validationState ?? null,
              closeoutState: evidenceMetadata.closeoutState ?? null,
              roleExecutionEvidenceCount: Array.isArray(evidenceMetadata.roleExecutionEvidence) ? evidenceMetadata.roleExecutionEvidence.length : 0,
              dynamicGraphId: asRecord(evidenceMetadata.modelRoutingEvidence).graphId ?? null,
              staticSingleJobSequenceUsed:
                asRecord(evidenceMetadata.modelRoutingEvidence).staticSingleJobSequenceUsed ?? null,
              inlineRoleOnlyExecutionAllowed:
                asRecord(evidenceMetadata.modelRoutingEvidence).inlineRoleOnlyExecutionAllowed ?? null,
              transports: Array.isArray(evidenceMetadata.roleExecutionEvidence)
                ? [...new Set(evidenceMetadata.roleExecutionEvidence.map((item) => item.transportKind).filter(Boolean))].sort()
                : [],
              models: Array.isArray(evidenceMetadata.roster)
                ? evidenceMetadata.roster.map((item) => ({ roleId: item.roleId, modelId: item.modelId, status: item.status })).slice(0, 16)
                : [],
              artifactRefs: Array.isArray(evidenceMetadata.artifactRefs) ? evidenceMetadata.artifactRefs.slice(0, 40) : [],
            } : null,
            roleReportCount: roleReports.length,
            roleReportRoles: roleReports.map((artifact) => asRecord(artifact.metadata).roleId).filter(Boolean).slice(0, 16),
            dynamicOrchestrator: dynamicOrchestrator
              ? {
                  graphId: asRecord(dynamicOrchestrator.metadata).graphId ?? null,
                  modelRef: asRecord(dynamicOrchestrator.metadata).modelRef ?? null,
                  providerPath: asRecord(dynamicOrchestrator.metadata).providerPath ?? null,
                  deterministicValidation: asRecord(dynamicOrchestrator.metadata)
                    .deterministicValidation ?? null,
                }
              : null,
            dynamicValidationRepair: dynamicValidationRepair
              ? {
                  finalState: asRecord(dynamicValidationRepair.metadata).finalState ?? null,
                  repairAttemptCount:
                    asRecord(dynamicValidationRepair.metadata).repairAttemptCount ?? null,
                  validationRefs: Array.isArray(asRecord(dynamicValidationRepair.metadata).validationRefs)
                    ? asRecord(dynamicValidationRepair.metadata).validationRefs.slice(0, 12)
                    : [],
                }
              : null,
            kimiAttempt: kimiAttempt
              ? {
                  status: asRecord(kimiAttempt.metadata).status ?? null,
                  modelRef: asRecord(kimiAttempt.metadata).modelRef ?? null,
                  providerPath: asRecord(kimiAttempt.metadata).providerPath ?? null,
                  changedFileRefs: Array.isArray(asRecord(kimiAttempt.metadata).changedFileRefs)
                    ? asRecord(kimiAttempt.metadata).changedFileRefs.slice(0, 20)
                    : [],
                  reasonCodes: Array.isArray(asRecord(kimiAttempt.metadata).reasonCodes)
                    ? asRecord(kimiAttempt.metadata).reasonCodes.slice(0, 20)
                    : [],
                }
              : null,
            humanScopeDecision: humanScopeDecision
              ? {
                  present: true,
                  boundedDecisionRef:
                    asRecord(humanScopeDecision.metadata).boundedDecisionRef ?? null,
                }
              : null,
            dynamicProgress: {
              count: dynamicProgress.length,
              stages: dynamicProgress
                .map((item) => ({
                  stage: item.stage ?? null,
                  status: item.status ?? null,
                  roleId: item.roleId ?? null,
                }))
                .slice(-20),
            },
            closeoutTiming: closeoutTiming ? asRecord(closeoutTiming.metadata) : null,
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
            workQueueLifecycleMutated: false,
          });
        }
        candidates.sort((left, right) => Date.parse(right.createdAt ?? "") - Date.parse(left.createdAt ?? ""));
        console.log(JSON.stringify(candidates[0] ?? null));
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
      maxBuffer: 512 * 1024,
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

async function waitForRuntimeEvidence(input) {
  const deadline = Date.now() + input.timeoutMs;
  let latest = queryRuntimeEvidence(input);
  while (Date.now() < deadline) {
    if (latest?.blocked) {
      return latest;
    }
    if (
      latest?.jobId &&
      (["succeeded", "failed", "canceled", "timed_out"].includes(latest.state) || latest.errorCode)
    ) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    latest = queryRuntimeEvidence(input);
  }
  return latest ?? { blocked: true, reasonCode: "runtime_evidence_timeout" };
}

function evaluate(evidence) {
  const parity = evidence?.parity;
  const validationRecords = Array.isArray(parity?.validationRecords)
    ? parity.validationRecords
    : [];
  const changedFiles = Array.isArray(parity?.changedFileRefs) ? parity.changedFileRefs : [];
  const roleCount = evidence?.runtimeEvidence?.roleExecutionEvidenceCount ?? 0;
  const roleIds = Array.isArray(evidence?.runtimeEvidence?.models)
    ? evidence.runtimeEvidence.models.map((role) => role.roleId).filter(Boolean)
    : [];
  const repeatedRolePresent = roleIds.some((roleId, index) => roleIds.indexOf(roleId) !== index);
  const taskNodeCount = evidence?.taskGraph?.nodeCount ?? 0;
  const dynamicTaskNodeCount = evidence?.dynamicTaskGraph?.nodeCount ?? 0;
  const dynamicGraphPresent = Boolean(
    evidence?.dynamicOrchestrator?.graphId &&
    evidence?.runtimeEvidence?.dynamicGraphId &&
    evidence?.runtimeEvidence?.staticSingleJobSequenceUsed === false &&
    evidence?.runtimeEvidence?.inlineRoleOnlyExecutionAllowed === false,
  );
  const validationRepairAccepted = evidence?.dynamicValidationRepair?.finalState === "passed";
  const repairAttemptRecorded = (evidence?.dynamicValidationRepair?.repairAttemptCount ?? 0) >= 1;
  const kimiAttemptPresent = Boolean(evidence?.kimiAttempt?.modelRef);
  const humanScopeDecisionPresent = Boolean(evidence?.humanScopeDecision?.present);
  const dynamicProgressVisible = (evidence?.dynamicProgress?.count ?? 0) >= 5;
  const requiredValidationKnown =
    validationRecords.length > 0 &&
    validationRecords.every((record) => ["passed", "failed", "skipped"].includes(record.status));
  const validationPassed =
    validationRecords.length > 0 && validationRecords.every((record) => record.status === "passed");
  const passed =
    evidence?.state === "succeeded" &&
    parity?.status === "completed" &&
    parity?.executionMode === "direct_main_repo" &&
    changedFiles.length > 0 &&
    validationPassed &&
    roleCount >= 4 &&
    repeatedRolePresent &&
    (taskNodeCount >= 4 || dynamicTaskNodeCount >= 2 || dynamicGraphPresent) &&
    dynamicGraphPresent &&
    validationRepairAccepted &&
    repairAttemptRecorded &&
    kimiAttemptPresent &&
    humanScopeDecisionPresent &&
    dynamicProgressVisible &&
    evidence?.runtimeEvidence?.closeoutState === "present" &&
    parity.rawPromptStored === false &&
    parity.rawResponseStored === false &&
    parity.rawProviderLogStored === false &&
    parity.rawCommandLogsStored === false;
  const reasonCodes = [
    ...(evidence?.state === "succeeded" ? [] : ["runtime_job_not_succeeded"]),
    ...(parity?.status === "completed" ? [] : ["codex_parity_adapter_not_completed"]),
    ...(changedFiles.length > 0 ? [] : ["no_source_files_applied"]),
    ...(requiredValidationKnown ? [] : ["validation_states_not_known"]),
    ...(validationPassed ? [] : ["validation_not_all_passed"]),
    ...(roleCount >= 4 ? [] : ["insufficient_openclaw_role_evidence"]),
    ...(repeatedRolePresent ? [] : ["repeated_role_invocation_missing"]),
    ...(taskNodeCount >= 4 || dynamicTaskNodeCount >= 2 || dynamicGraphPresent
      ? []
      : ["task_graph_nodes_missing"]),
    ...(dynamicGraphPresent ? [] : ["dynamic_runtime_work_graph_missing"]),
    ...(validationRepairAccepted ? [] : ["validation_repair_loop_not_passed"]),
    ...(repairAttemptRecorded ? [] : ["validation_repair_attempt_missing"]),
    ...(kimiAttemptPresent ? [] : ["kimi_standard_implementation_attempt_missing"]),
    ...(humanScopeDecisionPresent ? [] : ["human_scope_decision_missing"]),
    ...(dynamicProgressVisible ? [] : ["dynamic_runtime_progress_missing"]),
    ...(evidence?.runtimeEvidence?.closeoutState === "present" ? [] : ["closeout_missing"]),
  ];
  return {
    passed,
    reasonCodes: passed ? ["codex_parity_live_ux_proof_passed"] : reasonCodes,
    changedFiles,
    validationRecords,
    roleCount,
    repeatedRolePresent,
    taskNodeCount,
    dynamicTaskNodeCount,
    dynamicProgressCount: evidence?.dynamicProgress?.count ?? 0,
    kimiAttemptPresent,
    humanScopeDecisionPresent,
    repairAttemptRecorded,
    dynamicProgressStages: Array.isArray(evidence?.dynamicProgress?.stages)
      ? evidence.dynamicProgress.stages.slice(-20)
      : [],
  };
}

async function main() {
  const runTag = `codex-parity-live-ux-${Date.now().toString(36)}`;
  const prompt = buildLongPrompt(runTag);
  const promptHash = sha256(prompt);
  const startedAt = new Date().toISOString();
  const preflight = {
    localHealth: await boundedFetch("http://127.0.0.1:28789/healthz"),
    localReady: await boundedFetch("http://127.0.0.1:28789/readyz"),
    tailscaleHealth: await boundedFetch(`${safeBridgeOrigin.replace(/\/$/, "")}/healthz`),
    tailscaleReady: await boundedFetch(`${safeBridgeOrigin.replace(/\/$/, "")}/readyz`),
    safeBridgeRef: safeBridgeOrigin.replace(/\/$/, ""),
    promptHash,
    promptLength: prompt.length,
    runTag,
  };
  writeArtifact("codex-parity-live-ux-proof-preflight.json", {
    artifactKind: "codex_parity_live_ux_proof_preflight",
    status: preflight.localReady.ok && preflight.tailscaleReady.ok ? "ready" : "blocked_health",
    preflight,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
  });
  const harness = await new OperatorBrowserHarness({
    origin: safeBridgeOrigin,
    headless: true,
  }).start();
  let browserResult = null;
  let browserStatus = "not_attempted";
  let browserReasonCodes = [];
  try {
    browserResult = await harness.sendPrompt(prompt, {
      sessionKey: "agent:main:main",
      waitFor: "progress",
      timeoutMs: Number(process.env.OPENCLAW_CODEX_PARITY_UX_PROGRESS_TIMEOUT_MS ?? "180000"),
    });
    browserStatus = "prompt_submitted";
    browserReasonCodes = ["browser_prompt_submitted"];
  } catch (error) {
    browserStatus = "browser_prompt_submission_needs_review";
    browserReasonCodes = [
      error?.name === "TimeoutError" ? "browser_progress_timeout" : "browser_prompt_failed",
    ];
    browserResult = { errorHash: sha256(error instanceof Error ? error.message : String(error)) };
  } finally {
    await harness.close();
  }
  const evidence = await waitForRuntimeEvidence({
    promptHash,
    startedAfter: startedAt,
    timeoutMs: Number(process.env.OPENCLAW_CODEX_PARITY_UX_RUNTIME_TIMEOUT_MS ?? "2700000"),
  });
  const review = evaluate(evidence);
  const runArtifact = writeArtifact("codex-parity-live-ux-proof-run.json", {
    artifactKind: "codex_parity_live_ux_proof_run",
    status: review.passed ? "passed" : "needs_review",
    reasonCodes: review.passed
      ? ["browser_prompt_submitted", "runtime_job_succeeded", "codex_parity_evidence_passed"]
      : [...browserReasonCodes, ...review.reasonCodes],
    runTag,
    promptHash,
    promptLength: prompt.length,
    browserStatus,
    browserRunId: browserResult?.runId ?? null,
    sessionKey: browserResult?.sessionKey ?? "agent:main:main",
    runtimeEvidence: evidence,
    qualityReview: review,
    runtimeJobsCreated: Boolean(evidence?.jobId),
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  });
  writeArtifact("codex-parity-live-ux-work-queue-readback.json", {
    artifactKind: "codex_parity_live_ux_work_queue_readback",
    status: review.passed ? "passed" : "needs_review",
    runtimeJobId: evidence?.jobId ?? null,
    workItemId: evidence?.workItemId ?? null,
    teamRunId: evidence?.runtimeEvidence?.teamRunId ?? null,
    taskGraph: evidence?.taskGraph ?? null,
    dynamicTaskGraph: evidence?.dynamicTaskGraph ?? null,
    roleModels: evidence?.runtimeEvidence?.models ?? [],
    transports: evidence?.runtimeEvidence?.transports ?? [],
    dynamicProgress: evidence?.dynamicProgress ?? null,
    kimiAttempt: evidence?.kimiAttempt ?? null,
    humanScopeDecision: evidence?.humanScopeDecision ?? null,
    validationRepair: evidence?.dynamicValidationRepair ?? null,
    changedFiles: review.changedFiles,
    validationRecords: review.validationRecords,
    sourceRunRef: runArtifact.path,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    workQueueLifecycleMutated: false,
  });
  writeArtifact("codex-parity-live-ux-quality-review.json", {
    artifactKind: "codex_parity_live_ux_quality_review",
    status: review.passed ? "passed" : "needs_review",
    assessment: review.passed
      ? "The live UX prompt created a production runtime coding-team job, invoked OpenClaw-visible role evidence, completed the Codex parity implementation adapter with applied source changes, passed focused validation, and produced closeout/readback evidence."
      : "The live UX prompt did not yet meet all strict Codex parity gates; inspect reason codes and runtime evidence before a broad soak.",
    reasonCodes: review.reasonCodes,
    runtimeJobId: evidence?.jobId ?? null,
    changedFiles: review.changedFiles,
    validationRecords: review.validationRecords,
    roleCount: review.roleCount,
    taskNodeCount: review.taskNodeCount,
    dynamicTaskNodeCount: review.dynamicTaskNodeCount,
    kimiAttemptPresent: review.kimiAttemptPresent,
    humanScopeDecisionPresent: review.humanScopeDecisionPresent,
    repairAttemptRecorded: review.repairAttemptRecorded,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    workQueueLifecycleMutated: false,
  });
  if (!review.passed) {
    process.exitCode = 2;
  }
}

await main().catch((error) => {
  writeArtifact("codex-parity-live-ux-proof-run.json", {
    artifactKind: "codex_parity_live_ux_proof_run",
    status: "blocked",
    reasonCodes: ["codex_parity_live_ux_script_failed"],
    errorHash: sha256(error instanceof Error ? error.message : String(error)),
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    workQueueLifecycleMutated: false,
  });
  process.exitCode = 1;
});
