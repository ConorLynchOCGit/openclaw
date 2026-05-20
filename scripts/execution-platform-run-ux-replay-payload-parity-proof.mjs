#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { tsImport } from "tsx/esm/api";

const ROOT = process.cwd();
const ARTIFACT_ROOT = path.join(ROOT, ".artifacts/execution-platform");
const WORK_ITEM_ID = "openclaw-convergence.pre-product-spec-04-ux-replay-payload-parity";

function phase(message) {
  process.stderr.write(`[ux-replay-payload-parity] ${message}\n`);
}

function sha256(value) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
}

async function writeJson(name, value) {
  const file = path.join(ARTIFACT_ROOT, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

function buildLongProductSpecPrompt() {
  const sections = [
    "# Product/Spec Planning Production Upgrade",
    "",
    "You are OpenClaw running through the Execution Platform runtime. Implement Product/Spec Planning as a first-class production workflow surface, not a proof runner, not generic queued success, and not a coding-team side effect.",
    "",
    "Core deliverables:",
    "- Register agent_team.product_spec_planning as a scheduler-backed workflow.",
    "- Add planning_orchestrator, optional web_research, Planning Capsule draft/revision, human planning decision, ActionGraphProposal validation, compile-readiness, planning closeout, Work Queue readback, validation, and model-authored closeout.",
    "- When the owner asks to implement Product/Spec Planning itself, route to coding with Product/Spec Planning as subject. When the owner asks for planning/specification work, route to Product/Spec Planning.",
    "- No raw prompts, raw responses, raw transcripts, raw provider logs, raw tool logs, raw command logs, raw DB rows, secrets, deploys, outbound sends, model promotions, or authority grants.",
    "",
    "The prompt intentionally includes shell-looking and template-looking examples that must survive prompt-file submission without shell or JavaScript interpolation:",
    "```ts",
    "const example = `literal ${notInterpolated}`;",
    'const json = { mode: "plan-only", rawPromptStored: false };',
    "```",
    "```sh",
    "echo '$PATH should not expand here' && echo \"$(no-command-substitution)\"",
    "```",
    "",
    "Success gates:",
    "- Full prompt hash and length reach router, Mission Ledger, packet author, scheduler handoff, and worker path refs.",
    "- Mission Ledger commitments are worker-ready through model-authored CommitmentWorkPackets.",
    "- Graph scheduling decomposes before implementation.",
    "- Work Queue readback shows route, Mission Ledger refs, graph refs, active progress, validation, closeout, limitations, and ELI5.",
    "- Process completion alone is never success.",
    "",
  ];
  const repeated = Array.from({ length: 24 }, (_, index) =>
    [
      `## Commitment ${index + 1}`,
      "Implement one production-grade slice of Product/Spec Planning with exact runtime evidence.",
      "The worker must receive enough context to act without guessing, and must stop if context is missing.",
      "Evidence must map to commitment ids and include validation/readback refs.",
      "Constraints remain safety boundaries, not primary requested actions: do not deploy, send outbound messages, promote models, or store raw logs.",
    ].join("\n"),
  );
  return [...sections, ...repeated].join("\n\n");
}

function fixedFrontDoorProvider(output) {
  return {
    async route() {
      return {
        output,
        providerRef: "fixture://ux-replay-parity-structured-front-door",
        modelCandidateId: "fixture-router",
        providerCallMade: false,
        reasonCodes: ["fixture_structured_router_for_payload_parity"],
      };
    },
  };
}

function runtimeJobPayloadHash(payload) {
  return sha256({
    workflowId: payload.workflowId,
    executorWorkflowId: payload.executorWorkflowId,
    subjectWorkflowIds: payload.subjectWorkflowIds ?? [],
    targetSubjectRefs: payload.targetSubjectRefs ?? [],
    requestedCapabilities: payload.requestedCapabilities ?? [],
    promptHash: payload.promptHash,
    promptSummary: payload.promptSummary,
    sourcePromptRef: payload.sourcePromptRef,
    rawPromptStored: false,
    rawResponseStored: false,
  });
}

function envelopeFromSubmit(input) {
  const compiled = input.submit.frontDoorCompiledRequest;
  const job = input.job;
  const payload = job.payload;
  const promptHash = compiled.promptHash;
  const promptLength = compiled.sourcePromptRef?.promptLength ?? input.promptLength;
  const sourcePromptRef = compiled.sourcePromptRef
    ? `${compiled.sourcePromptRef.refKind}://${compiled.sourcePromptRef.sessionKey ?? "unknown"}/${compiled.sourcePromptRef.runId ?? input.runId}`
    : `source-prompt://${promptHash.slice(0, 16)}/missing`;
  const sourcePromptContextIndexRef = `source-prompt-context://${promptHash.slice(0, 16)}/index`;
  const missionLedgerInputRef = `mission-ledger-input://${promptHash.slice(0, 16)}/${input.runId}`;
  const commitmentPacketInputRef = `commitment-work-packet-input://${promptHash.slice(0, 16)}/${input.runId}`;
  const schedulerHandoffRef = `scheduler-handoff://${job.jobId}/decomposition`;
  return input.buildUxReplayPayloadParityEnvelope({
    submissionSurface: input.submissionSurface,
    diagnosticOnly: input.diagnosticOnly,
    ownerPrompt: {
      promptHash,
      promptLength,
      sourcePromptRef,
      promptFileRef: input.promptFileRef,
      sourcePromptContextIndexRef,
      sourcePromptResolutionStatus: "resolved",
      rawPromptStored: false,
    },
    chatRefs: input.chatRefs,
    routeRefs: {
      routeSelected: compiled.frontDoorRoute ?? "workflow_execution",
      workflowId: compiled.workflowId,
      executorWorkflowId: compiled.executorWorkflowId,
      jobType: compiled.jobType,
      responseMode: "create_runtime_job",
      executeNow: true,
      routerDecisionRef: `runtime-job://${job.jobId}/execution/front-door/router-result`,
      routerToolProtocolRef: compiled.routerToolProtocolRef,
      routerToolInvocationRefs: compiled.routerToolInvocationRefs,
      requestCompilerRef: `runtime-job://${job.jobId}/execution/front-door/compiled-request`,
      missionLedgerHandoffRef: compiled.missionLedgerHandoffRef,
    },
    executionRefs: {
      runtimeJobId: job.jobId,
      runtimeJobPayloadHash: runtimeJobPayloadHash(payload),
      queueName: job.queueName,
      workItemId: job.workItemId,
      idempotencyScope: job.idempotencyScope,
      idempotencyKeyHash: sha256(job.idempotencyKey),
      graphId: null,
    },
    missionLedgerRefs: {
      missionLedgerInputRef,
      missionLedgerPromptHash: promptHash,
      missionLedgerRef: null,
      commitmentPacketInputRef,
      commitmentPacketRef: null,
    },
    schedulerRefs: {
      workflowDefinitionRef: `workflow-definition://${compiled.workflowId}`,
      capabilityManifestRef: "runtime-node-capability-manifest://default",
      schedulerHandoffRefs: [schedulerHandoffRef],
      graphCompilerRefs: [`graph-compiler://${job.jobId}/compile`],
      acceptedGraphRef: null,
    },
    safetyStorageFlags: {
      rawPromptStored: false,
      rawResponseStored: false,
      rawTranscriptStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawCommandLogStored: false,
      rawDbRowsStored: false,
      secretsStored: false,
      deployRequested: false,
      outboundSendRequested: false,
      modelPromotionRequested: false,
      authorityGranted: false,
      controlsApplied: false,
      workQueueLifecycleMutated: false,
      runtimeLifecycleMutated: false,
    },
    reasonCodes: input.reasonCodes,
  });
}

async function main() {
  phase("starting proof harness");
  await mkdir(ARTIFACT_ROOT, { recursive: true });
  const runId = `ux-replay-payload-parity-${Date.now()}`;
  const prompt = buildLongProductSpecPrompt();
  const promptHash = sha256(prompt);
  const promptFilePath = path.join(os.tmpdir(), `${runId}.prompt.txt`);
  await writeFile(promptFilePath, prompt, "utf8");

  phase("loading runtime modules");
  const { resolvePromptInput } = await import(
    pathToFileURL(path.join(ROOT, "scripts/operator-prompt-harness.mjs")).href
  );
  const { createExecutionPlatformDatabaseRuntime } = await tsImport(
    path.join(ROOT, "extensions/execution-platform/src/db/runtime.ts"),
    import.meta.url,
  );
  const { RuntimeJobRepository } = await tsImport(
    path.join(ROOT, "extensions/execution-platform/src/runtime-job-repository.ts"),
    import.meta.url,
  );
  const { WorkQueueRepository } = await tsImport(
    path.join(ROOT, "extensions/execution-platform/src/work-queue/work-queue-repository.ts"),
    import.meta.url,
  );
  const { NativeExecutionRpcService } = await tsImport(
    path.join(ROOT, "extensions/execution-platform/src/intent-routing/native-execution-rpc.ts"),
    import.meta.url,
  );
  const { createBaseCanonicalRouterOutput, createCanonicalRouterAction } = await tsImport(
    path.join(ROOT, "extensions/execution-platform/src/intent-front-door/index.ts"),
    import.meta.url,
  );
  const { buildSourcePromptContextIndex, summarizeSourcePromptContextIndex } = await tsImport(
    path.join(ROOT, "extensions/execution-platform/src/workflows/source-prompt-context.ts"),
    import.meta.url,
  );
  const {
    buildUxReplayPayloadParityEnvelope,
    compareUxReplayPayloadParity,
    validateUxReplayPayloadProofEligibility,
    summarizeUxReplayPayloadParityEnvelope,
  } = await tsImport(
    path.join(
      ROOT,
      "extensions/execution-platform/src/intent-front-door/ux-replay-payload-parity.ts",
    ),
    import.meta.url,
  );

  try {
    phase("reading prompt file");
    const promptFromFile = resolvePromptInput({ promptFile: promptFilePath });
    if (promptFromFile !== prompt) {
      throw new Error("prompt_file_readback_mismatch");
    }

    phase("opening execution platform database runtime");
    const runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: true });
    try {
      phase(`database opened from ${runtime.resolution.source}`);
      const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient);
      const workQueue = new WorkQueueRepository(runtime.sqlClient, runtimeJobs);
      phase("checking work queue item");
      if (!(await workQueue.readWorkItemTruth(WORK_ITEM_ID))) {
        await workQueue.createWorkItem({
          workItemId: WORK_ITEM_ID,
          itemType: "pre_product_spec_hardening",
          title: "UX/Replay Payload Parity Gate",
          description:
            "Prove replay/direct paths are production-proof eligible only when they clone UX prompt-file payload semantics.",
          metadata: {
            source: "ux_replay_payload_parity_bootstrap",
            rawPromptStored: false,
            rawResponseStored: false,
            rawLogsStored: false,
          },
          actorId: "system:ux-replay-payload-parity",
        });
      }

      const output = createBaseCanonicalRouterOutput({
        route: "workflow_execution",
        responseMode: "create_runtime_job",
        executeNow: true,
        workflowId: "agent_team.coding",
        executorWorkflowId: "agent_team.coding",
        subjectWorkflowIds: ["agent_team.product_spec_planning"],
        targetSubjectRefs: [
          {
            targetKind: "workflow",
            targetRef: "agent_team.product_spec_planning",
            confidence: 0.96,
          },
        ],
        requestedCapabilities: ["code_edit", "test", "review", "closeout"],
        jobType: "executor.agent_team",
        confidence: 0.96,
        objectiveSummary: "Implement Product/Spec Planning production workflow.",
        requestedActions: [
          createCanonicalRouterAction(
            "code_edit",
            "Implement Product/Spec Planning production workflow.",
            0.96,
          ),
          createCanonicalRouterAction("test", "Run focused validation.", 0.94),
          createCanonicalRouterAction("review", "Review runtime evidence.", 0.94),
          createCanonicalRouterAction("closeout", "Emit model-authored closeout.", 0.94),
        ],
        requestedAuthority: "local_yolo",
        sideEffectClass: "code_edit",
        riskClass: "medium",
      });
      const rpc = new NativeExecutionRpcService({
        runtimeJobs,
        workQueue,
        structuredRouterProvider: fixedFrontDoorProvider(output),
      });

      phase("submitting UX-compatible prompt-file payload through NativeExecutionRpcService");
      const uxSubmit = await rpc.submit({
        prompt: promptFromFile,
        auth: {
          actorId: "operator",
          authenticated: true,
          role: "operator",
          sessionId: "session:ux-replay-parity",
          sourceRoute: "ux",
        },
        workItemId: WORK_ITEM_ID,
        sourceRoute: "ux",
        sourcePromptRef: {
          refKind: "gateway_chat_transcript",
          sessionKey: "agent:main:main",
          sessionId: "session:ux-replay-parity",
          runId,
          sourceRoute: "ux",
          rawPromptStored: false,
        },
      });
      if (!uxSubmit.accepted || !uxSubmit.runtimeJobId) {
        throw new Error(`ux_submit_failed:${uxSubmit.reasonCodes.join(",")}`);
      }
      phase(`runtime job accepted: ${uxSubmit.runtimeJobId}`);
      const uxJob = await runtimeJobs.getJob(uxSubmit.runtimeJobId);
      if (!uxJob) {
        throw new Error("ux_runtime_job_missing");
      }
      const sourcePromptIndex = buildSourcePromptContextIndex({
        promptText: promptFromFile,
        resolution: {
          status: "resolved",
          reasonCodes: ["prompt_file_source_resolved_for_parity"],
          promptHash,
          promptLength: promptFromFile.length,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      });
      const sourcePromptProof = {
        artifactKind: "ux_replay_payload_parity_source_prompt_proof",
        runId,
        promptHash,
        promptLength: promptFromFile.length,
        promptFileRef: `prompt-file://${promptHash.slice(0, 16)}`,
        promptFileBytesRead: Buffer.byteLength(promptFromFile, "utf8"),
        promptFileDeletedAfterRead: true,
        sourcePromptContextIndex: summarizeSourcePromptContextIndex(sourcePromptIndex),
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawLogsStored: false,
      };
      const sourcePromptProofPath = await writeJson(
        "ux-replay-payload-parity-source-prompt-proof.json",
        sourcePromptProof,
      );

      phase("building parity envelopes");
      const uxEnvelope = envelopeFromSubmit({
        submit: uxSubmit,
        job: uxJob,
        promptLength: promptFromFile.length,
        promptFileRef: `prompt-file://${promptHash.slice(0, 16)}`,
        submissionSurface: "ux_prompt_file",
        diagnosticOnly: false,
        chatRefs: {
          sessionRef: "gateway-session://session:ux-replay-parity",
          conversationRef: "gateway-conversation://agent:main:main",
          turnRef: `gateway-turn://${runId}`,
          ownerTurnInFlightRef: `owner-turn://${runId}`,
        },
        runId,
        buildUxReplayPayloadParityEnvelope,
        reasonCodes: ["ux_prompt_file_payload_envelope_built"],
      });

      const replayEnvelope = buildUxReplayPayloadParityEnvelope({
        ...uxEnvelope,
        submissionSurface: "replay",
        chatRefs: {
          sessionRef: "replay-session://local",
          conversationRef: "replay-conversation://local",
          turnRef: `replay-turn://${runId}`,
          ownerTurnInFlightRef: null,
        },
        executionRefs: {
          ...uxEnvelope.executionRefs,
          runtimeJobId: `${uxJob.jobId}:replay-clone`,
          runtimeJobPayloadHash: "0".repeat(64),
        },
        routeRefs: {
          ...uxEnvelope.routeRefs,
          routerDecisionRef: `${uxEnvelope.routeRefs.routerDecisionRef}:replay-clone`,
          requestCompilerRef: `${uxEnvelope.routeRefs.requestCompilerRef}:replay-clone`,
        },
        diagnosticOnly: false,
        reasonCodes: ["replay_payload_cloned_from_ux_prompt_file_envelope"],
      });
      const diagnosticNativeEnvelope = buildUxReplayPayloadParityEnvelope({
        ...uxEnvelope,
        submissionSurface: "direct_native",
        diagnosticOnly: true,
        reasonCodes: ["direct_native_diagnostic_payload_not_proof"],
      });
      const comparison = compareUxReplayPayloadParity({
        expected: uxEnvelope,
        actual: replayEnvelope,
      });
      const diagnosticEligibility =
        validateUxReplayPayloadProofEligibility(diagnosticNativeEnvelope);

      phase("attaching runtime parity evidence");
      await runtimeJobs.attachArtifact({
        jobId: uxJob.jobId,
        artifactType: "execution.ux_replay_payload_parity.envelope",
        storageKind: "metadata",
        uri: `runtime-job://${uxJob.jobId}/execution/ux-replay-payload-parity/envelope`,
        contentType: "application/json",
        metadata: summarizeUxReplayPayloadParityEnvelope(uxEnvelope),
      });
      await runtimeJobs.recordEvent({
        jobId: uxJob.jobId,
        eventType: "execution.ux_replay_payload_parity.accepted",
        data: {
          parityAccepted: comparison.accepted,
          parityHash: uxEnvelope.parityHash,
          promptHash,
          promptLength: promptFromFile.length,
          sourcePromptContextIndexRef: uxEnvelope.ownerPrompt.sourcePromptContextIndexRef,
          missionLedgerInputRef: uxEnvelope.missionLedgerRefs.missionLedgerInputRef,
          schedulerHandoffRefs: uxEnvelope.schedulerRefs.schedulerHandoffRefs,
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
        },
      });

      const liveEnvelopePath = await writeJson("ux-replay-payload-parity-live-envelope.json", {
        ...summarizeUxReplayPayloadParityEnvelope(uxEnvelope),
        proofEligibility: validateUxReplayPayloadProofEligibility(uxEnvelope),
      });
      const replayEnvelopePath = await writeJson("ux-replay-payload-parity-replay-envelope.json", {
        ...summarizeUxReplayPayloadParityEnvelope(replayEnvelope),
        proofEligibility: validateUxReplayPayloadProofEligibility(replayEnvelope),
      });
      const comparisonPath = await writeJson(
        "ux-replay-payload-parity-comparison.json",
        comparison,
      );
      const qualityReview = {
        artifactKind: "ux_replay_payload_parity_quality_review",
        runId,
        accepted: comparison.accepted && !diagnosticEligibility.accepted,
        reviewType: "bounded_code_review_and_runtime_evidence_review",
        findings: [
          "The long prompt was read from a prompt file without JavaScript or shell interpolation.",
          "The UX-compatible runtime job carried the same prompt hash, prompt length, source prompt ref, router refs, Mission Ledger handoff ref, scheduler handoff refs, and bounded storage flags used by replay.",
          "A direct native diagnostic envelope was explicitly not proof eligible.",
          "No Product/Spec implementation work was executed in this gate.",
        ],
        limitations: [
          "This gate proves payload parity and proof eligibility, not Product/Spec Planning workflow quality.",
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawLogsStored: false,
      };
      const qualityReviewPath = await writeJson(
        "ux-replay-payload-parity-quality-review.json",
        qualityReview,
      );
      const summary = {
        artifactKind: "ux_replay_payload_parity_summary",
        runId,
        workItemId: WORK_ITEM_ID,
        status: qualityReview.accepted ? "passed" : "needs_review",
        runtimeJobId: uxJob.jobId,
        promptHash,
        promptLength: promptFromFile.length,
        parityAccepted: comparison.accepted,
        diagnosticNativeProofEligible: diagnosticEligibility.accepted,
        uxEnvelopeParityHash: uxEnvelope.parityHash,
        replayEnvelopeParityHash: replayEnvelope.parityHash,
        productSpecImplementationExecuted: false,
        nextWorkItemId: "openclaw-convergence.pre-product-spec-05-long-task-budget-progress-smoke",
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawLogsStored: false,
      };
      const summaryPath = await writeJson("ux-replay-payload-parity-summary.json", summary);
      const closeoutRef = `closeout://${runId}/ux-replay-payload-parity`;
      phase("recording closeout projection readback");
      await workQueue.recordCloseoutProjectionReadback({
        workItemId: WORK_ITEM_ID,
        closeoutRef,
        accepted: true,
        validationRefs: [comparisonPath],
        graphRefs: ["ux-replay-payload-parity://no-graph-intentionally"],
        limitations: [
          "This gate proves payload parity and proof eligibility, not Product/Spec Planning workflow quality.",
        ],
        priorityNote: "Long-Task Budget And Progress Smoke remains the next pre-proof blocker.",
        eli5Progress:
          "OpenClaw proved replay can only count when it carries the same prompt-file runtime refs as the UX path.",
        nextStep: "Run Long-Task Budget And Progress Smoke.",
        lifecycleMutationAllowed: false,
      });
      phase("closing work queue item through runtime closeout API");
      const closeout = await workQueue.completeWorkQueueItemFromCloseout({
        workItemId: WORK_ITEM_ID,
        runtimeJobId: uxJob.jobId,
        closeoutRef,
        closeoutHash: `sha256:${sha256(summary)}`,
        validationRef: comparisonPath,
        graphRef: "ux-replay-payload-parity://no-graph-intentionally",
        ownerReadbackRef: summaryPath,
        artifactRefs: [
          liveEnvelopePath,
          replayEnvelopePath,
          comparisonPath,
          sourcePromptProofPath,
          qualityReviewPath,
          summaryPath,
        ],
        accepted: qualityReview.accepted,
        validationRequired: true,
        sourceEditRequired: false,
        actorId: "system:ux-replay-payload-parity",
        reasonCodes: [
          qualityReview.accepted
            ? "ux_replay_payload_parity_gate_accepted"
            : "ux_replay_payload_parity_gate_needs_review",
          ...comparison.reasonCodes.slice(0, 15),
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawLogsStored: false,
        rawDbRowsStored: false,
        authorityGranted: false,
        controlsApplied: false,
        runtimeLifecycleMutated: false,
        modelPromotionPerformed: false,
      });
      phase("building canonical work queue readback");
      const readback = await workQueue.projectCanonicalRuntimeQueue(200);
      const workQueueReadbackPath = await writeJson(
        "ux-replay-payload-parity-work-queue-readback.json",
        {
          artifactKind: "ux_replay_payload_parity_work_queue_readback",
          workItemId: WORK_ITEM_ID,
          closeout,
          queueItem:
            [...(readback.active ?? []), ...(readback.closed ?? [])].find(
              (item) => item.workItemId === WORK_ITEM_ID,
            ) ?? null,
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
        },
      );
      const runIndex = {
        artifactKind: "ux_replay_payload_parity_run_index",
        runId,
        workItemId: WORK_ITEM_ID,
        runtimeJobId: uxJob.jobId,
        accepted: qualityReview.accepted && closeout.closed,
        artifactRefs: [
          liveEnvelopePath,
          replayEnvelopePath,
          comparisonPath,
          sourcePromptProofPath,
          workQueueReadbackPath,
          qualityReviewPath,
          summaryPath,
        ],
        rawPromptStored: false,
        rawResponseStored: false,
        rawTranscriptStored: false,
        rawLogsStored: false,
      };
      const runIndexPath = await writeJson("ux-replay-payload-parity-run-index.json", runIndex);
      const artifactIndexPath = await writeJson("ux-replay-payload-parity-artifact-index.json", {
        ...runIndex,
        artifactKind: "ux_replay_payload_parity_artifact_index",
        artifactRefs: [...runIndex.artifactRefs, runIndexPath],
        closeout,
      });
      console.log(
        JSON.stringify(
          {
            accepted: runIndex.accepted,
            runId,
            runtimeJobId: uxJob.jobId,
            workItemId: WORK_ITEM_ID,
            summaryPath,
            artifactIndexPath,
            reasonCodes: closeout.reasonCodes,
          },
          null,
          2,
        ),
      );
    } finally {
      phase("closing database runtime");
      await runtime.pool.end();
    }
  } finally {
    await rm(promptFilePath, { force: true });
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
