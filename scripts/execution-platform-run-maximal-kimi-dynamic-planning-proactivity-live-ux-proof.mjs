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

function buildPrompt(runTag) {
  return [
    "You are OpenClaw running a real owner-local Runtime Work Graph job through the live UX path.",
    "",
    `Runtime proof run id: ${runTag}.`,
    "",
    "Goal: improve Work Queue planning/readback for Planning Capsule intake from Closeout Capsule opportunity seeds.",
    "",
    "This is real product work, not a proof runner. Use agent_team.coding and the production Runtime Work Graph path.",
    "",
    "Implement the smallest production-safe improvement that makes the owner-facing Work Queue detail better at showing:",
    "",
    "- opportunity seed rationale",
    "- quality review state",
    "- Planning Capsule version/ref",
    "- proposed child actions",
    "- compile readiness",
    "- implementation worker attempts",
    "- validation/repair evidence",
    "- final closeout",
    "- ELI5 progress",
    "",
    "Use existing local patterns. Do not invent a second queue store. DB Work Queue remains planning/readback/control; runtime jobs remain lifecycle truth.",
    "",
    "Execution requirements:",
    "",
    "1. Orchestrator must run first and create a Runtime Work Graph.",
    "2. Kimi must attempt the first scoped standard source edit through the model-agnostic file-edit worker adapter.",
    "3. If Kimi fails, the orchestrator must consume bounded diagnostics and retry, split, or escalate to Codex in the same runtime job.",
    "4. Validation must fail once or produce a bounded no-op repair decision; repair/escalation must stay in the same runtime job.",
    "5. At least one child node must be added after the initial orchestration.",
    "6. At least one role should be repeated if validation or context evidence requires it.",
    "7. Closeout must produce useful non-generic opportunity seeds.",
    "8. High-confidence accepted opportunity seeds must become review-gated DB Work Queue items and Planning Capsule intake.",
    "9. Work Queue readback must be human-readable and show graph, files, tests, roles/models, planning refs, limitations, closeout, and ELI5.",
    "",
    "Implementation scope may include:",
    "",
    "- extensions/execution-platform/src/codex-bridge/",
    "- extensions/execution-platform/src/work-queue/",
    "- extensions/execution-platform/src/model-memory-runtime/",
    "- ui/src/ui/views/work-queue.ts",
    "- focused tests beside touched files",
    "",
    "Do not deploy. Do not send outbound messages. Do not promote models. Do not change gateway port/auth/pairing/Tailscale identity. Do not store raw prompts, raw responses, transcripts, provider logs, tool logs, command logs, DB rows, secrets, or hidden reasoning.",
    "",
    "Success requires source edits when source edits are needed, focused validation, model-authored closeout, opportunity seed projection, Planning Capsule intake, and Work Queue readback evidence. Process completion alone is not success.",
  ].join("\n");
}

function queryRuntimeEvidence(input) {
  const script = `
    import { createExecutionPlatformDatabaseRuntime } from "./extensions/execution-platform/src/db/runtime.ts";
    import { RuntimeJobRepository } from "./extensions/execution-platform/src/runtime-job-repository.ts";
    function asRecord(value) {
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    }
    function artifactPromptHash(artifact) {
      const metadata = asRecord(artifact.metadata);
      const source = asRecord(metadata.sourcePromptResolution);
      return metadata.promptHash ?? asRecord(metadata.metadata).promptHash ?? source.promptHash ?? null;
    }
    function latestByType(artifacts, type) {
      return artifacts.filter((artifact) => artifact.artifactType === type).at(-1) ?? null;
    }
    async function main() {
      const promptHash = ${JSON.stringify(input.promptHash)};
      const runtimeJobId = ${JSON.stringify(input.runtimeJobId ?? null)};
      const startedAfter = Date.parse(${JSON.stringify(input.startedAfter)});
      const runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
      try {
        const repo = new RuntimeJobRepository(runtime.sqlClient, { claimStrategy: "basic" });
        const jobs = runtimeJobId
          ? [await repo.getJob(runtimeJobId)].filter(Boolean)
          : await repo.listRecentJobs({ jobTypes: ["executor.agent_team"], limit: 80 });
        const candidates = [];
        for (const job of jobs) {
          const createdAtMs = Date.parse(job.createdAt?.toISOString?.() ?? String(job.createdAt ?? ""));
          if (!runtimeJobId && Number.isFinite(startedAfter) && Number.isFinite(createdAtMs) && createdAtMs + 120000 < startedAfter) {
            continue;
          }
          const artifacts = await repo.listArtifacts(job.jobId);
          if (!runtimeJobId && !artifacts.some((artifact) => artifactPromptHash(artifact) === promptHash)) {
            continue;
          }
          const events = await repo.listEvents(job.jobId, 500);
        const dynamicOrchestrator = latestByType(artifacts, "agent_team.dynamic_orchestrator_plan");
        const childWorkOrders = artifacts.filter(
          (artifact) => artifact.artifactType === "agent_team.child_work_order",
        );
        const delegationReviews = artifacts.filter(
          (artifact) => artifact.artifactType === "agent_team.orchestrator_delegation_review",
        );
        const dynamicRoleInvocations = artifacts.filter(
          (artifact) => artifact.artifactType === "agent_team.dynamic_role_invocation",
        );
        const validationRepair = latestByType(artifacts, "agent_team.dynamic_validation_repair_loop");
        const kimiAttempt = latestByType(artifacts, "agent_team.kimi_standard_implementation_attempt");
        const humanDecision = latestByType(artifacts, "agent_team.human_scope_decision");
        const closeout = latestByType(artifacts, "execution_platform.closeout_capsule");
        const projection = latestByType(artifacts, "execution_platform.closeout_opportunity_projection");
        const runtimeEvidence = latestByType(artifacts, "agent_team.runtime_evidence");
        const parity = latestByType(artifacts, "codex_parity.runtime_adapter_result");
        const progress = artifacts
          .filter((artifact) => artifact.artifactType === "agent_team.dynamic_progress")
          .map((artifact) => asRecord(artifact.metadata));
        const evidence = asRecord(runtimeEvidence?.metadata);
        const humanDecisionRecord = asRecord(humanDecision?.metadata);
        const createdHumanDecision = asRecord(humanDecisionRecord.created);
        const createdHumanTask = asRecord(createdHumanDecision.humanTask);
        const projectionRecord = asRecord(projection?.metadata);
        const closeoutRecord = asRecord(closeout?.metadata);
        const parityRecord = asRecord(parity?.metadata);
        const validation = asRecord(parityRecord.validation);
        const records = Array.isArray(validation.records) ? validation.records : [];
        candidates.push({
          jobId: job.jobId,
          state: job.state,
          workItemId: job.workItemId,
          createdAt: job.createdAt?.toISOString?.() ?? null,
          completedAt: job.completedAt?.toISOString?.() ?? null,
          artifactTypes: [...new Set(artifacts.map((artifact) => artifact.artifactType))].sort(),
          eventTypes: [...new Set(events.map((event) => event.eventType))].sort(),
          dynamicOrchestrator: dynamicOrchestrator
            ? {
                graphId: asRecord(dynamicOrchestrator.metadata).graphId ?? null,
                childTaskCount: Array.isArray(asRecord(asRecord(dynamicOrchestrator.metadata).plan).childTasks)
                  ? asRecord(asRecord(dynamicOrchestrator.metadata).plan).childTasks.length
                  : 0,
              }
            : null,
          childWorkOrders: childWorkOrders.map((artifact) => {
            const metadata = asRecord(artifact.metadata);
            const workOrder = asRecord(metadata.workOrder);
            const validation = asRecord(metadata.deterministicValidation);
            return {
              workOrderId: typeof workOrder.workOrderId === "string" ? workOrder.workOrderId : null,
              roleId: typeof workOrder.roleId === "string" ? workOrder.roleId : null,
              targetRefCount: Array.isArray(workOrder.targetRefs) ? workOrder.targetRefs.length : 0,
              acceptanceCriteriaCount: Array.isArray(workOrder.acceptanceCriteria)
                ? workOrder.acceptanceCriteria.length
                : 0,
              validShape: validation.valid === true,
              semanticQualityJudgedByDeterministicCode:
                validation.semanticQualityJudgedByDeterministicCode === true,
            };
          }),
          delegationReviews: delegationReviews.map((artifact) => {
            const metadata = asRecord(artifact.metadata);
            const review = asRecord(metadata.review);
            const assessment = asRecord(review.assessment);
            const validation = asRecord(metadata.deterministicValidation);
            return {
              reviewedWorkOrderId:
                typeof review.reviewedWorkOrderId === "string" ? review.reviewedWorkOrderId : null,
              reviewedRoleId:
                typeof review.reviewedRoleId === "string" ? review.reviewedRoleId : null,
              nextAction:
                typeof assessment.nextAction === "string" ? assessment.nextAction : null,
              validShape: validation.valid === true,
              semanticQualityJudgedByDeterministicCode:
                validation.semanticQualityJudgedByDeterministicCode === true,
            };
          }),
          contextScoutInvocations: dynamicRoleInvocations
            .map((artifact) => asRecord(artifact.metadata))
            .filter((metadata) => metadata.roleId === "context_scout")
            .map((metadata) => {
              const shape = asRecord(metadata.contextScoutShape);
              const output = asRecord(metadata.contextScoutOutput);
              return {
                nodeId: typeof metadata.nodeId === "string" ? metadata.nodeId : null,
                contextScoutShapeValid: shape.valid === true,
                semanticQualityJudgedByDeterministicCode:
                  shape.semanticQualityJudgedByDeterministicCode === true,
                relevantFileCount: Array.isArray(output.relevantFiles)
                  ? output.relevantFiles.length
                  : 0,
              };
            }),
          runtimeEvidence: runtimeEvidence
            ? {
                roleEvidenceCount: Array.isArray(evidence.roleExecutionEvidence)
                  ? evidence.roleExecutionEvidence.length
                  : 0,
                closeoutState: evidence.closeoutState ?? null,
                validationState: evidence.validationState ?? null,
                graphId: asRecord(evidence.modelRoutingEvidence).graphId ?? null,
                staticSingleJobSequenceUsed:
                  asRecord(evidence.modelRoutingEvidence).staticSingleJobSequenceUsed ?? null,
              }
            : null,
          kimiAttempt: kimiAttempt
            ? {
                status: asRecord(kimiAttempt.metadata).status ?? null,
                modelRef: asRecord(kimiAttempt.metadata).modelRef ?? null,
                changedFileRefs: Array.isArray(asRecord(kimiAttempt.metadata).changedFileRefs)
                  ? asRecord(kimiAttempt.metadata).changedFileRefs.slice(0, 20)
                  : [],
                genericAdapterUsed:
                  asRecord(asRecord(kimiAttempt.metadata).genericFileEditResult).adapterSchemaVersion ===
                  "openclaw.file-edit-worker-adapter.v1",
                reasonCodes: Array.isArray(asRecord(kimiAttempt.metadata).reasonCodes)
                  ? asRecord(kimiAttempt.metadata).reasonCodes.slice(0, 20)
                  : [],
              }
            : null,
          humanDecision: humanDecision
            ? {
                waitingForOwnerPrompt: humanDecisionRecord.waitingForOwnerPrompt === true,
                humanTaskId:
                  typeof createdHumanTask.humanTaskId === "string"
                    ? createdHumanTask.humanTaskId
                    : null,
                graphId:
                  typeof createdHumanTask.graphId === "string" ? createdHumanTask.graphId : null,
                instruction:
                  typeof humanDecisionRecord.instruction === "string"
                    ? humanDecisionRecord.instruction.slice(0, 240)
                    : null,
                decisionTitle:
                  typeof humanDecisionRecord.decisionTitle === "string"
                    ? humanDecisionRecord.decisionTitle.slice(0, 120)
                    : null,
                decisionSummary:
                  typeof humanDecisionRecord.decisionSummary === "string"
                    ? humanDecisionRecord.decisionSummary.slice(0, 500)
                    : null,
                options: Array.isArray(humanDecisionRecord.options)
                  ? humanDecisionRecord.options.slice(0, 4)
                  : [],
                resumed: Boolean(humanDecisionRecord.resumed || humanDecisionRecord.resumedFromOwnerPrompt),
              }
            : null,
          parity: parity
            ? {
                status: parityRecord.status ?? null,
                changedFileRefs: Array.isArray(parityRecord.changedFileRefs)
                  ? parityRecord.changedFileRefs.slice(0, 30)
                  : [],
                validationRecords: records.map((record) => ({
                  commandRef: record.commandRef ?? null,
                  status: record.status ?? null,
                  exitCode: record.exitCode ?? null,
                })),
              }
            : null,
          validationRepair: validationRepair
            ? {
                finalState: asRecord(validationRepair.metadata).finalState ?? null,
                repairAttemptCount: asRecord(validationRepair.metadata).repairAttemptCount ?? null,
                validationRefs: Array.isArray(asRecord(validationRepair.metadata).validationRefs)
                  ? asRecord(validationRepair.metadata).validationRefs.slice(0, 12)
                  : [],
              }
            : null,
          closeout: closeout
            ? {
                capsuleId: closeoutRecord.capsuleId ?? null,
                seedCount: Array.isArray(closeoutRecord.opportunitySeeds)
                  ? closeoutRecord.opportunitySeeds.length
                  : 0,
                highConfidenceSeedCount: Array.isArray(closeoutRecord.opportunitySeeds)
                  ? closeoutRecord.opportunitySeeds.filter((seed) => seed?.confidence === "high" && seed?.kind !== "no_op").length
                  : 0,
              }
            : null,
          opportunityProjection: projection
            ? {
                status: projectionRecord.status ?? null,
                createdWorkItemIds: Array.isArray(projectionRecord.createdWorkItemIds)
                  ? projectionRecord.createdWorkItemIds.slice(0, 20)
                  : [],
                planningCapsuleRefs: Array.isArray(projectionRecord.planningCapsuleRefs)
                  ? projectionRecord.planningCapsuleRefs.slice(0, 20)
                  : [],
                reasonCodes: Array.isArray(projectionRecord.reasonCodes)
                  ? projectionRecord.reasonCodes.slice(0, 20)
                  : [],
              }
            : null,
          progressCount: progress.length,
          progressStages: progress.map((item) => ({ stage: item.stage, status: item.status })).slice(-24),
          waitingForHumanDecision:
            job.state === "pending" && humanDecisionRecord.waitingForOwnerPrompt === true,
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
    main().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  `;
  try {
    const stdout = execFileSync("pnpm", ["exec", "tsx", "--eval", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 60_000,
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
    if (latest?.waitingForHumanDecision) {
      return latest;
    }
    if (latest?.jobId && ["succeeded", "failed", "canceled", "timed_out"].includes(latest.state)) {
      return latest;
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    latest = queryRuntimeEvidence(input);
  }
  return latest ?? { blocked: true, reasonCode: "runtime_evidence_timeout" };
}

function evaluate(evidence) {
  const changedFiles = evidence?.parity?.changedFileRefs ?? [];
  const validationRecords = evidence?.parity?.validationRecords ?? [];
  const validationPassed =
    validationRecords.length > 0 && validationRecords.every((record) => record.status === "passed");
  const planningRefs = evidence?.opportunityProjection?.planningCapsuleRefs ?? [];
  const createdSeeds = evidence?.opportunityProjection?.createdWorkItemIds ?? [];
  const childWorkOrders = evidence?.childWorkOrders ?? [];
  const delegationReviews = evidence?.delegationReviews ?? [];
  const contextScoutInvocations = evidence?.contextScoutInvocations ?? [];
  const validChildWorkOrders =
    childWorkOrders.length > 0 &&
    childWorkOrders.every(
      (workOrder) =>
        workOrder.validShape === true &&
        workOrder.semanticQualityJudgedByDeterministicCode === false &&
        workOrder.targetRefCount > 0 &&
        workOrder.acceptanceCriteriaCount > 0,
    );
  const validDelegationReviews =
    delegationReviews.length > 0 &&
    delegationReviews.every(
      (review) =>
        review.validShape === true &&
        review.semanticQualityJudgedByDeterministicCode === false &&
        review.reviewedWorkOrderId &&
        review.reviewedRoleId &&
        review.nextAction,
    );
  const contextScoutShapeOnly =
    contextScoutInvocations.length > 0 &&
    contextScoutInvocations.every(
      (invocation) =>
        invocation.contextScoutShapeValid === true &&
        invocation.semanticQualityJudgedByDeterministicCode === false,
    );
  const passed =
    evidence?.state === "succeeded" &&
    evidence?.dynamicOrchestrator?.graphId &&
    evidence?.runtimeEvidence?.staticSingleJobSequenceUsed === false &&
    validChildWorkOrders &&
    validDelegationReviews &&
    contextScoutShapeOnly &&
    evidence?.kimiAttempt?.modelRef &&
    evidence?.kimiAttempt?.genericAdapterUsed === true &&
    changedFiles.length > 0 &&
    validationPassed &&
    evidence?.validationRepair?.finalState === "passed" &&
    evidence?.closeout?.seedCount > 0 &&
    createdSeeds.length > 0 &&
    planningRefs.length > 0 &&
    evidence?.progressCount >= 6;
  return {
    passed: Boolean(passed),
    reasonCodes: [
      ...(evidence?.state === "succeeded" ? [] : ["runtime_job_not_succeeded"]),
      ...(evidence?.dynamicOrchestrator?.graphId ? [] : ["dynamic_orchestrator_missing"]),
      ...(evidence?.runtimeEvidence?.staticSingleJobSequenceUsed === false
        ? []
        : ["static_single_job_sequence_not_disabled"]),
      ...(validChildWorkOrders ? [] : ["child_work_order_evidence_missing_or_invalid"]),
      ...(validDelegationReviews
        ? []
        : ["orchestrator_delegation_review_evidence_missing_or_invalid"]),
      ...(contextScoutShapeOnly ? [] : ["context_scout_shape_only_contract_not_evidenced"]),
      ...(evidence?.kimiAttempt?.modelRef ? [] : ["kimi_attempt_missing"]),
      ...(evidence?.kimiAttempt?.genericAdapterUsed === true
        ? []
        : ["generic_file_edit_adapter_not_evidenced"]),
      ...(changedFiles.length > 0 ? [] : ["changed_file_evidence_missing"]),
      ...(validationPassed ? [] : ["validation_not_passed"]),
      ...(evidence?.validationRepair?.finalState === "passed"
        ? []
        : ["validation_repair_loop_not_passed"]),
      ...(evidence?.closeout?.seedCount > 0 ? [] : ["closeout_opportunity_seeds_missing"]),
      ...(createdSeeds.length > 0 ? [] : ["opportunity_work_items_not_created"]),
      ...(planningRefs.length > 0 ? [] : ["planning_capsule_intake_not_created"]),
      ...(evidence?.progressCount >= 6 ? [] : ["dynamic_progress_insufficient"]),
    ],
    changedFiles,
    validationRecords,
    childWorkOrders,
    delegationReviews,
    contextScoutInvocations,
    createdOpportunityWorkItemIds: createdSeeds,
    planningCapsuleRefs: planningRefs,
  };
}

async function main() {
  const monitorRuntimeJobId = process.env.OPENCLAW_MAXIMAL_KIMI_MONITOR_RUNTIME_JOB_ID?.trim();
  const runTag =
    process.env.OPENCLAW_MAXIMAL_KIMI_MONITOR_RUN_TAG?.trim() ||
    `maximal-kimi-dynamic-planning-${Date.now().toString(36)}`;
  const prompt = monitorRuntimeJobId ? "" : buildPrompt(runTag);
  const promptHash =
    process.env.OPENCLAW_MAXIMAL_KIMI_MONITOR_PROMPT_HASH?.trim() ||
    (prompt ? sha256(prompt) : null);
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
    monitorRuntimeJobId: monitorRuntimeJobId || null,
  };
  writeArtifact("maximal-kimi-dynamic-planning-proactivity-live-ux-preflight.json", {
    artifactKind: "maximal_kimi_dynamic_planning_proactivity_live_ux_preflight",
    status: preflight.localReady.ok && preflight.tailscaleReady.ok ? "ready" : "blocked_health",
    preflight,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
  });

  let browserResult = null;
  let browserStatus = monitorRuntimeJobId ? "monitor_only" : "not_attempted";
  let browserReasonCodes = [];
  if (!monitorRuntimeJobId) {
    const harness = await new OperatorBrowserHarness({
      origin: safeBridgeOrigin,
      headless: true,
    }).start();
    try {
      browserResult = await harness.sendPrompt(prompt, {
        sessionKey: "agent:main:main",
        waitFor: "progress",
        timeoutMs: Number(process.env.OPENCLAW_MAXIMAL_KIMI_UX_PROGRESS_TIMEOUT_MS ?? "180000"),
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
  }
  const evidence = await waitForRuntimeEvidence({
    promptHash,
    runtimeJobId: monitorRuntimeJobId || null,
    startedAfter: startedAt,
    timeoutMs: Number(process.env.OPENCLAW_MAXIMAL_KIMI_RUNTIME_TIMEOUT_MS ?? "2700000"),
  });
  const review = evaluate(evidence);
  const waitingForOwnerDecision = Boolean(evidence?.waitingForHumanDecision);
  if (waitingForOwnerDecision) {
    const humanTaskId = evidence?.humanDecision?.humanTaskId ?? null;
    const runtimeJobId = evidence?.jobId ?? null;
    writeArtifact("maximal-kimi-dynamic-planning-proactivity-human-decision-request.json", {
      artifactKind: "maximal_kimi_dynamic_planning_proactivity_human_decision_request",
      status: "waiting_for_owner_prompt",
      runtimeJobId,
      humanTaskId,
      graphId: evidence?.humanDecision?.graphId ?? null,
      recommendedDecision: "child_action_graph_proposal",
      ownerReplyTemplate:
        runtimeJobId && humanTaskId
          ? `Runtime job: ${runtimeJobId}\nHuman task: ${humanTaskId}\nDecision: child_action_graph_proposal`
          : null,
      naturalLanguageReply: "Choose child action graph proposals.",
      decisionTitle: evidence?.humanDecision?.decisionTitle ?? null,
      decisionSummary: evidence?.humanDecision?.decisionSummary ?? null,
      options: evidence?.humanDecision?.options ?? [],
      instruction:
        "Submit the naturalLanguageReply in the real OpenClaw UX to resume the paused runtime job. The runtime refs are included only as fallback diagnostic refs.",
      promptHash,
      runTag,
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    });
  }
  const runArtifact = writeArtifact(
    "maximal-kimi-dynamic-planning-proactivity-live-ux-run-index.json",
    {
      artifactKind: "maximal_kimi_dynamic_planning_proactivity_live_ux_run_index",
      status: review.passed
        ? "passed"
        : waitingForOwnerDecision
          ? "waiting_for_owner_prompt"
          : "needs_review",
      reasonCodes: review.passed
        ? ["maximal_kimi_dynamic_planning_proactivity_live_ux_passed"]
        : waitingForOwnerDecision
          ? ["waiting_for_owner_human_scope_decision"]
          : [...browserReasonCodes, ...review.reasonCodes],
      runTag,
      promptHash,
      promptLength: prompt.length,
      browserStatus,
      browserRunId: browserResult?.runId ?? null,
      sessionKey: browserResult?.sessionKey ?? "agent:main:main",
      runtimeEvidence: evidence,
      qualityReview: review,
      waitingForOwnerDecision,
      runtimeJobsCreated: Boolean(evidence?.jobId),
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    },
  );
  writeArtifact("maximal-kimi-dynamic-planning-proactivity-live-ux-work-queue-readback.json", {
    artifactKind: "maximal_kimi_dynamic_planning_proactivity_live_ux_work_queue_readback",
    status: review.passed
      ? "passed"
      : waitingForOwnerDecision
        ? "waiting_for_owner_prompt"
        : "needs_review",
    runtimeJobId: evidence?.jobId ?? null,
    workItemId: evidence?.workItemId ?? null,
    dynamicOrchestrator: evidence?.dynamicOrchestrator ?? null,
    runtimeEvidence: evidence?.runtimeEvidence ?? null,
    childWorkOrders: evidence?.childWorkOrders ?? [],
    delegationReviews: evidence?.delegationReviews ?? [],
    contextScoutInvocations: evidence?.contextScoutInvocations ?? [],
    kimiAttempt: evidence?.kimiAttempt ?? null,
    humanDecision: evidence?.humanDecision ?? null,
    validationRepair: evidence?.validationRepair ?? null,
    closeout: evidence?.closeout ?? null,
    opportunityProjection: evidence?.opportunityProjection ?? null,
    progressStages: evidence?.progressStages ?? [],
    sourceRunRef: runArtifact.path,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    workQueueLifecycleMutated: false,
  });
  writeArtifact("maximal-kimi-dynamic-planning-proactivity-live-ux-quality-review.json", {
    artifactKind: "maximal_kimi_dynamic_planning_proactivity_live_ux_quality_review",
    status: review.passed
      ? "passed"
      : waitingForOwnerDecision
        ? "waiting_for_owner_prompt"
        : "needs_review",
    assessment: review.passed
      ? "The live UX run proved Kimi via the generic file-edit adapter, dynamic graph execution, validation repair, closeout opportunity projection, and Planning Capsule intake."
      : waitingForOwnerDecision
        ? "The live UX run reached the required real human decision pause. The owner must submit the bounded decision in OpenClaw before final quality review can pass."
        : "The live UX run did not satisfy all strict gates; inspect reason codes and runtime evidence.",
    reasonCodes: review.reasonCodes,
    changedFiles: review.changedFiles,
    validationRecords: review.validationRecords,
    childWorkOrders: review.childWorkOrders,
    delegationReviews: review.delegationReviews,
    contextScoutInvocations: review.contextScoutInvocations,
    createdOpportunityWorkItemIds: review.createdOpportunityWorkItemIds,
    planningCapsuleRefs: review.planningCapsuleRefs,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    workQueueLifecycleMutated: false,
  });
  writeArtifact("maximal-kimi-dynamic-planning-proactivity-live-ux-summary.json", {
    artifactKind: "maximal_kimi_dynamic_planning_proactivity_live_ux_summary",
    status: review.passed
      ? "passed"
      : waitingForOwnerDecision
        ? "waiting_for_owner_prompt"
        : "needs_review",
    reasonCodes: waitingForOwnerDecision
      ? ["waiting_for_owner_human_scope_decision"]
      : review.reasonCodes,
    artifactRefs: [
      ".artifacts/execution-platform/maximal-kimi-dynamic-planning-proactivity-live-ux-preflight.json",
      ".artifacts/execution-platform/maximal-kimi-dynamic-planning-proactivity-live-ux-run-index.json",
      ".artifacts/execution-platform/maximal-kimi-dynamic-planning-proactivity-live-ux-work-queue-readback.json",
      ".artifacts/execution-platform/maximal-kimi-dynamic-planning-proactivity-live-ux-quality-review.json",
    ],
    eli5Progress:
      "We sent a real OpenClaw prompt through the browser and checked whether the coding team used Kimi, dynamic graph repair, closeout seeds, and Planning Capsule intake.",
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    workQueueLifecycleMutated: false,
  });
  if (!review.passed && !waitingForOwnerDecision) {
    process.exitCode = 2;
  }
}

await main().catch((error) => {
  writeArtifact("maximal-kimi-dynamic-planning-proactivity-live-ux-run-index.json", {
    artifactKind: "maximal_kimi_dynamic_planning_proactivity_live_ux_run_index",
    status: "blocked",
    reasonCodes: ["maximal_kimi_dynamic_planning_proactivity_live_ux_script_failed"],
    errorHash: sha256(error instanceof Error ? error.message : String(error)),
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    workQueueLifecycleMutated: false,
  });
  process.exitCode = 1;
});
