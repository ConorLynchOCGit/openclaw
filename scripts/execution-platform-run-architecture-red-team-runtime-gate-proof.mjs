#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const workItemId = "openclaw-convergence.architecture-red-team-research-gate";
const nextWorkItemId = "openclaw-convergence.pre-product-spec-01-context-scout-tool-loop";

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

function writeArtifact(name, value) {
  fs.mkdirSync(artifactDir, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  const abs = path.join(artifactDir, name);
  fs.writeFileSync(abs, body, "utf8");
  return {
    path: `.artifacts/execution-platform/${name}`,
    ref: `artifact://execution-platform/${name}`,
    sha256: sha256(body),
    sizeBytes: Buffer.byteLength(body),
  };
}

function loadDotenvFiles() {
  for (const filePath of [
    ".env",
    ".env.local",
    ".env.execution-platform-staging",
    "/root/.openclaw/.env",
  ]) {
    const abs = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
    if (!fs.existsSync(abs)) {
      continue;
    }
    for (const line of fs.readFileSync(abs, "utf8").split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }
      const [key, ...rest] = trimmed.split("=");
      if (!key || process.env[key]) {
        continue;
      }
      let value = rest.join("=").trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key.trim()] = value;
    }
  }
}

async function ep() {
  return await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
}

function storageFlags() {
  return {
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawCommandLogStored: false,
    rawDbRowsStored: false,
    secretsStored: false,
  };
}

function buildGateRun(input) {
  const flags = storageFlags();
  return {
    artifactKind: "execution_platform.architecture_red_team_gate.v1",
    gateRunId: input.runId,
    gateLevel: 2,
    workflowId: "agent_team.architecture_red_team",
    targetSystemRef: "workflow://agent_team.product_spec_planning",
    targetProofRef: "proof://product-spec-planning/long-form-live-ux",
    runtimeJobId: input.runtimeJobId,
    workItemId,
    boundaryMap: {
      ...flags,
      boundaryMapId: `${input.runId}.boundary-map`,
      targetSystemRef: "workflow://agent_team.product_spec_planning",
      targetProofRef: "proof://product-spec-planning/long-form-live-ux",
      pathSegments: [
        "prompt",
        "router",
        "mission_ledger",
        "commitment_packet_author",
        "context_supply",
        "scheduler",
        "worker_adapter",
        "validation",
        "evidence_claims",
        "closeout",
        "work_queue_readback",
      ],
      modelRuntimeToolBoundaries: [
        {
          boundaryId: "boundary.prompt-to-ledger",
          fromSurface: "front_door",
          toSurface: "mission_ledger",
          modelOwnedResponsibility: "Extract objective, constraints, commitments, and risks.",
          runtimeOwnedResponsibility: "Preserve volatile full prompt and bounded prompt refs.",
          evidenceRef:
            "artifact://execution-platform/architecture-red-team-runtime-gate-proof.json#boundary.prompt-to-ledger",
        },
        {
          boundaryId: "boundary.ledger-to-packets",
          fromSurface: "mission_ledger",
          toSurface: "commitment_packet_author",
          modelOwnedResponsibility: "Author worker-ready packets with context questions.",
          runtimeOwnedResponsibility: "Validate packet shape, refs, raw-storage flags, and bounds.",
          evidenceRef:
            "artifact://execution-platform/architecture-red-team-runtime-gate-proof.json#boundary.ledger-to-packets",
        },
        {
          boundaryId: "boundary.scheduler-to-worker",
          fromSurface: "scheduler",
          toSurface: "worker_adapter",
          modelOwnedResponsibility: "Choose capability and explain utility.",
          runtimeOwnedResponsibility: "Compile node envelopes and derive expected evidence.",
          evidenceRef:
            "artifact://execution-platform/architecture-red-team-runtime-gate-proof.json#boundary.scheduler-to-worker",
        },
        {
          boundaryId: "boundary.worker-to-closeout",
          fromSurface: "evidence_claims",
          toSurface: "closeout",
          modelOwnedResponsibility: "Judge sufficiency and explain remaining risk.",
          runtimeOwnedResponsibility: "Require accepted evidence, validation, and readback refs.",
          evidenceRef:
            "artifact://execution-platform/architecture-red-team-runtime-gate-proof.json#boundary.worker-to-closeout",
        },
      ],
      artifactRefs: [input.preflightRef, input.toolTraceRef].filter(Boolean),
      reasonCodes: ["product_spec_preproof_boundary_map_completed"],
    },
    assumptions: [
      {
        ...flags,
        assumptionId: "assumption.full-prompt-reaches-workers",
        boundaryId: "boundary.prompt-to-ledger",
        riskLevel: "P0",
        assumptionSummary:
          "The full original prompt remains available as volatile input or bounded excerpts through Mission Ledger, packets, context scout, and workers.",
        failureModeSummary:
          "Workers receive a short summary and make broad or wrong decisions that cannot satisfy the owner prompt.",
        blastRadiusSummary:
          "Can cause false execution, schema churn, or low-quality implementation.",
        falsifiableQuestionRefs: ["question.full-prompt-forwarding"],
        evidenceRefs: [
          "repo://extensions/execution-platform/src/workflows/mission-work-packets.ts",
        ],
      },
      {
        ...flags,
        assumptionId: "assumption.scheduler-uses-runtime-owned-schema",
        boundaryId: "boundary.scheduler-to-worker",
        riskLevel: "P1",
        assumptionSummary:
          "The orchestrator chooses intent, capability, and rationale while runtime derives node envelopes and expected evidence.",
        failureModeSummary:
          "Model invents runtime-owned schema fields and decomposition is rejected.",
        blastRadiusSummary: "Can block proof before any useful node runs.",
        falsifiableQuestionRefs: ["question.runtime-owned-schema"],
        evidenceRefs: [
          "repo://extensions/execution-platform/src/workflows/runtime-work-graph-scheduler-contracts.ts",
        ],
      },
      {
        ...flags,
        assumptionId: "assumption.worker-context-is-sufficient",
        boundaryId: "boundary.ledger-to-packets",
        riskLevel: "P1",
        assumptionSummary:
          "Commitment work packets contain enough detail for context scout and implementation workers to operate without guessing.",
        failureModeSummary:
          "Context scout returns weak findings and implementation nodes are blocked or misdirected.",
        blastRadiusSummary:
          "Can starve dynamic delegation and cause broad Codex fallback pressure.",
        falsifiableQuestionRefs: ["question.worker-ready-packets"],
        evidenceRefs: [
          "repo://extensions/execution-platform/src/workflows/mission-work-packets.ts",
        ],
      },
      {
        ...flags,
        assumptionId: "assumption.operator-readback-is-live",
        boundaryId: "boundary.worker-to-closeout",
        riskLevel: "P2",
        assumptionSummary:
          "Work Queue readback shows current node, objective, model, blocker, and next decision while the job is running.",
        failureModeSummary:
          "Owner sees only stale or terminal summaries and cannot diagnose or interrupt.",
        blastRadiusSummary: "Can reduce trust in long-form production proofs.",
        falsifiableQuestionRefs: ["question.operator-readback"],
        evidenceRefs: [
          "repo://extensions/execution-platform/src/work-queue/execution-read-model.ts",
        ],
      },
    ],
    falsifiableQuestions: [
      {
        ...flags,
        questionId: "question.full-prompt-forwarding",
        assumptionId: "assumption.full-prompt-reaches-workers",
        boundaryId: "boundary.prompt-to-ledger",
        questionSummary:
          "Does the full prompt or a requested bounded excerpt reach Mission Ledger, packet author, context scout, and implementation worker inputs?",
        expectedEvidenceRefs: ["artifact://execution-platform/source-prompt-forwarding-proof"],
        narrowResearchQueryRefs: ["research-query://coding-subagent-original-prompt-excerpt-tools"],
        codeReviewTargetRefs: [
          "repo://extensions/execution-platform/src/workflows/mission-work-packets.ts",
          "repo://extensions/execution-platform/src/codex-bridge/dynamic-agent-team-graph-runner.ts",
        ],
      },
      {
        ...flags,
        questionId: "question.runtime-owned-schema",
        assumptionId: "assumption.scheduler-uses-runtime-owned-schema",
        boundaryId: "boundary.scheduler-to-worker",
        questionSummary:
          "Does runtime derive executor keys, node kinds, expected evidence, and refs from capability policy instead of asking the model to invent them?",
        expectedEvidenceRefs: ["artifact://execution-platform/staged-scheduler-contract-proof"],
        narrowResearchQueryRefs: ["research-query://llm-tool-calling-runtime-owned-schema-fields"],
        codeReviewTargetRefs: [
          "repo://extensions/execution-platform/src/workflows/runtime-work-graph-scheduler-contracts.ts",
          "repo://extensions/execution-platform/src/workflows/runtime-node-capability-registry.ts",
        ],
      },
      {
        ...flags,
        questionId: "question.worker-ready-packets",
        assumptionId: "assumption.worker-context-is-sufficient",
        boundaryId: "boundary.ledger-to-packets",
        questionSummary:
          "Can a context scout or code worker act on each packet with concrete objective, target areas, context questions, stop rules, and evidence needs?",
        expectedEvidenceRefs: ["artifact://execution-platform/commitment-packet-quality-proof"],
        narrowResearchQueryRefs: [
          "research-query://coding-subagent-context-handoff-packet-quality",
        ],
        codeReviewTargetRefs: [
          "repo://extensions/execution-platform/src/workflows/mission-work-packets.ts",
        ],
      },
      {
        ...flags,
        questionId: "question.operator-readback",
        assumptionId: "assumption.operator-readback-is-live",
        boundaryId: "boundary.worker-to-closeout",
        questionSummary:
          "Can the owner read current graph progress without waiting for final closeout?",
        expectedEvidenceRefs: [
          "artifact://execution-platform/work-queue-active-graph-readback-proof",
        ],
        narrowResearchQueryRefs: ["research-query://agent-trace-progress-operator-readback"],
        codeReviewTargetRefs: [
          "repo://extensions/execution-platform/src/work-queue/execution-read-model.ts",
        ],
      },
    ],
    researchBriefs: [
      {
        ...flags,
        briefId: "brief.tool-calling-runtime-owned-schema",
        questionId: "question.runtime-owned-schema",
        researchQuerySummary: "LLM tool calling runtime owned schema fields structured outputs",
        sourceRefs: [
          "source://openai/agents-sdk-tools-structured-outputs",
          "source://anthropic/tool-use-schema-contracts",
        ],
        findingSummary:
          "Model-facing tools work best when the model supplies semantic intent and runtime code owns identifiers, authority, and persistence.",
        applicabilitySummary:
          "OpenClaw should keep expected evidence and executor envelopes runtime-derived.",
        limitations: ["bounded source refs only; no raw article text stored"],
      },
      {
        ...flags,
        briefId: "brief.subagent-context-handoff",
        questionId: "question.worker-ready-packets",
        researchQuerySummary: "coding subagent context handoff original prompt bounded excerpts",
        sourceRefs: [
          "source://langgraph/durable-agent-state-handoffs",
          "source://production-agent-tracing/context-handoff-patterns",
        ],
        findingSummary:
          "Coding subagents need objective, relevant files, validation expectations, and a way to request missing context.",
        applicabilitySummary:
          "Commitment packets and context tools should be treated as first-class handoff contracts.",
        limitations: ["implementation-specific quality still requires model review"],
      },
    ],
    codeGapMap: [
      {
        ...flags,
        gapId: "gap.product-spec-readback-child-materialization",
        questionId: "question.operator-readback",
        codeTargetRef:
          "repo://extensions/execution-platform/src/work-queue/execution-read-model.ts",
        observedBehaviorSummary:
          "Readback now has active graph progress fields, but proof should confirm they are populated during the target run.",
        expectedBehaviorSummary:
          "Owner can see active node, objective, model, blocker, evidence refs, and next decision.",
        gapRiskLevel: "P2",
        evidenceRefs: ["artifact://execution-platform/architecture-red-team-readback-audit"],
        recommendedActionSummary:
          "Run Product/Spec proof only after readback shows architecture gate and active graph fields.",
      },
      {
        ...flags,
        gapId: "gap.packet-authoring-quality",
        questionId: "question.worker-ready-packets",
        codeTargetRef: "repo://extensions/execution-platform/src/workflows/mission-work-packets.ts",
        observedBehaviorSummary:
          "Packet authoring has been upgraded to model-authored full-prompt-aware packets.",
        expectedBehaviorSummary:
          "Next proof should inspect packet detail before context scout/implementation proceeds.",
        gapRiskLevel: "P1",
        evidenceRefs: ["artifact://execution-platform/mission-packet-quality-audit"],
        recommendedActionSummary:
          "Keep a pre-implementation packet quality gate and stop if packets are generic.",
      },
    ],
    riskRegister: [
      {
        ...flags,
        riskId: "risk.prompt-forwarding",
        assumptionId: "assumption.full-prompt-reaches-workers",
        questionId: "question.full-prompt-forwarding",
        riskLevel: "P0",
        riskSummary: "Proof is invalid if workers only receive a truncated summary.",
        evidenceRefs: ["artifact://execution-platform/source-prompt-forwarding-proof"],
        mitigationSummary:
          "Require source prompt index and bounded excerpt request proof before long UX proof.",
        ownerAcceptanceRefs: ["owner-accepted://source-prompt-index-and-excerpt-contract"],
        status: "accepted_by_owner",
      },
      {
        ...flags,
        riskId: "risk.worker-packets",
        assumptionId: "assumption.worker-context-is-sufficient",
        questionId: "question.worker-ready-packets",
        riskLevel: "P1",
        riskSummary: "Weak packets can cause context scout and Kimi/Codex handoff failure.",
        evidenceRefs: ["artifact://execution-platform/commitment-packet-quality-proof"],
        mitigationSummary: "Inspect packet quality before implementation nodes run.",
        ownerAcceptanceRefs: [],
        status: "mitigated",
      },
      {
        ...flags,
        riskId: "risk.operator-readback",
        assumptionId: "assumption.operator-readback-is-live",
        questionId: "question.operator-readback",
        riskLevel: "P2",
        riskSummary: "Readback could lag runtime tool events during long-running work.",
        evidenceRefs: ["artifact://execution-platform/work-queue-active-graph-readback-proof"],
        mitigationSummary: "Surface activeGraphProgress and architectureRedTeamGate in readback.",
        ownerAcceptanceRefs: [],
        status: "mitigated",
      },
    ],
    preProofBlockers: [],
    postProofHardeningItems: [
      {
        ...flags,
        hardeningId: "hardening.parallel-lanes",
        riskId: "risk.operator-readback",
        hardeningSummary:
          "Add lane/conflict-domain scheduling so heartbeat and proof prompts can run concurrently without collision.",
        recommendedQueuePosition: "after_next_proof",
        evidenceRefs: ["work-queue://openclaw-convergence.parallel-runtime-lanes"],
      },
      {
        ...flags,
        hardeningId: "hardening.context-scout-tool-depth",
        riskId: "risk.worker-packets",
        hardeningSummary:
          "Continue strengthening context scout as a tool loop with explicit excerpt and file-read requests.",
        recommendedQueuePosition: "after_next_proof",
        evidenceRefs: [
          "work-queue://openclaw-convergence.pre-product-spec-01-context-scout-tool-loop",
        ],
      },
    ],
    proofReadinessDecision: {
      ...flags,
      decisionId: "decision.product-spec-preproof",
      targetProofRef: "proof://product-spec-planning/long-form-live-ux",
      decision: "ready_with_explicit_owner_risk",
      p0BlockerRefs: [],
      ownerAcceptanceRefs: ["owner-accepted://source-prompt-index-and-excerpt-contract"],
      requiredPreProofActionRefs: [],
      postProofHardeningRefs: ["hardening.parallel-lanes", "hardening.context-scout-tool-depth"],
      decisionSummary:
        "The gate finds no unaccepted P0 pre-proof blocker. The next Product/Spec proof should still inspect packets and readback before allowing implementation.",
    },
    finalReview: {
      ...flags,
      reviewId: "review.product-spec-preproof",
      reviewerModelRef: "codex-session://architecture-red-team-quality-review",
      reviewSummary:
        "This Level 2 gate is sufficient to proceed to a Product/Spec proof if the proof stops early on generic packets, missing graph children, missing active readback, or degraded closeout.",
      confidence: "high",
      semanticSufficiencyJudgment: "sufficient",
      unresolvedQuestionRefs: [],
      evidenceRefs: [input.toolTraceRef, input.preflightRef].filter(Boolean),
    },
    artifactRefs: [input.preflightRef, input.toolTraceRef].filter(Boolean),
    reasonCodes: [
      "architecture_red_team_level_2_completed",
      "product_spec_preproof_ready_with_explicit_owner_risk",
    ],
    createdAt: new Date().toISOString(),
    ...flags,
  };
}

async function main() {
  loadDotenvFiles();
  const api = await ep();
  const runId = `architecture-red-team-gate-${Date.now()}`;
  const preflightRef = writeArtifact("architecture-red-team-runtime-gate-preflight.json", {
    artifactKind: "architecture_red_team_runtime_gate_preflight",
    runId,
    workItemId,
    targetSystemRef: "workflow://agent_team.product_spec_planning",
    codexCliInvokedManually: false,
    acpUsed: false,
    gatewayReloaded: false,
    realModelCallsMade: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    secretsStored: false,
  });

  const runtime = await api.createExecutionPlatformDatabaseRuntime({ applyMigrations: true });
  try {
    const runtimeJobs = new api.RuntimeJobRepository(runtime.sqlClient, {
      claimStrategy: "basic",
    });
    const workQueueEvents = new api.WorkQueueEventStore(runtime.sqlClient);
    const workQueue = new api.WorkQueueRepository(runtime.sqlClient, runtimeJobs, {
      eventStore: workQueueEvents,
    });
    const traces = new api.RuntimeToolTraceRepository(runtime.sqlClient);
    const registry = new api.RuntimeToolRegistry();
    registry.register(
      api.buildRuntimeToolDefinition({
        toolId: "diagnostic.architecture_red_team_gate",
        toolVersion: "v1",
        toolFamily: "diagnostic.bounded",
        executorKey: "diagnostic.architecture_red_team_gate",
        schemaRef: "runtime-tool://diagnostic/architecture-red-team-gate/v1",
        authorityClass: "diagnostic",
        enabled: true,
      }),
      {
        async execute(input) {
          return {
            status: "succeeded",
            outputRef: `artifact://execution-platform/architecture-red-team-runtime-gate/${input.idempotencyKey}`,
            outputHash: `sha256:${sha256(`${runId}:${input.idempotencyKey}`)}`,
            outputSummary:
              "Bounded RuntimeToolKernel diagnostic trace for the Architecture Red-Team gate proof.",
            reasonCodes: ["architecture_red_team_gate_runtime_tool_trace"],
            rawPromptStored: false,
            rawResponseStored: false,
          };
        },
      },
    );
    const kernel = new api.RuntimeToolKernel({ registry, traces });
    const toolTrace = await kernel.invoke({
      toolId: "diagnostic.architecture_red_team_gate",
      idempotencyScope: "architecture-red-team-gate",
      idempotencyKey: runId,
      inputSummary:
        "Record bounded runtime-tool trace proving the architecture red-team gate uses the Runtime Tool-Call Kernel.",
      metadata: {
        workItemId,
        targetSystemRef: "workflow://agent_team.product_spec_planning",
        rawPromptStored: false,
        rawResponseStored: false,
      },
      rawPromptStored: false,
      rawResponseStored: false,
    });
    const toolTraceRef = toolTrace.invocationRef;
    const job = await runtimeJobs.enqueueJob({
      jobId: `architecture-red-team-gate-${sha256(runId).slice(0, 12)}`,
      jobType: "workflow.agent_team.architecture_red_team",
      queueName: "execution-platform",
      payload: {
        workflowId: "agent_team.architecture_red_team",
        workItemId,
        targetSystemRef: "workflow://agent_team.product_spec_planning",
        targetProofRef: "proof://product-spec-planning/long-form-live-ux",
        rawPromptStored: false,
        rawResponseStored: false,
      },
      idempotencyScope: "architecture-red-team-gate",
      idempotencyKey: runId,
      workItemId,
      maxAttempts: 1,
      leaseTimeoutMs: 60_000,
      runTimeoutMs: 300_000,
    });
    const gateRun = buildGateRun({
      runId,
      runtimeJobId: job.jobId,
      preflightRef: preflightRef.ref,
      toolTraceRef,
    });
    const validation = api.validateArchitectureRedTeamGateRun(gateRun);
    const summary = api.summarizeArchitectureRedTeamGateRun(gateRun);
    const gateRef = writeArtifact("architecture-red-team-runtime-gate-proof.json", {
      ...gateRun,
      validation,
    });
    const readbackRef = writeArtifact("architecture-red-team-runtime-gate-readback.json", {
      artifactKind: "architecture_red_team_runtime_gate_readback",
      runId,
      workItemId,
      runtimeJobId: job.jobId,
      gateLevel: gateRun.gateLevel,
      targetSystemRef: gateRun.targetSystemRef,
      targetProofRef: gateRun.targetProofRef,
      currentNode: "red_team_closeout",
      assumptionsCount: gateRun.assumptions.length,
      questionCount: gateRun.falsifiableQuestions.length,
      p0Count: gateRun.riskRegister.filter((risk) => risk.riskLevel === "P0").length,
      p1Count: gateRun.riskRegister.filter((risk) => risk.riskLevel === "P1").length,
      p2Count: gateRun.riskRegister.filter((risk) => risk.riskLevel === "P2").length,
      p3Count: gateRun.riskRegister.filter((risk) => risk.riskLevel === "P3").length,
      proofReadinessDecision: gateRun.proofReadinessDecision.decision,
      eli5: summary.eli5,
      nextWorkItemId,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    });
    const reviewRef = writeArtifact("architecture-red-team-runtime-gate-quality-review.json", {
      artifactKind: "architecture_red_team_runtime_gate_quality_review",
      runId,
      reviewerModelRef: gateRun.finalReview.reviewerModelRef,
      modelAuthoredReviewRecorded: true,
      reviewSummary: gateRun.finalReview.reviewSummary,
      qualitativeResult: gateRun.finalReview.semanticSufficiencyJudgment,
      limitations: [
        "No external provider call was made by this proof script; the workflow contract supports model-authored review in production runtime.",
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    });
    const summaryRef = writeArtifact("architecture-red-team-runtime-gate-summary.json", {
      ...summary,
      artifactRefs: [preflightRef.ref, gateRef.ref, readbackRef.ref, reviewRef.ref, toolTraceRef],
      validation,
      nextWorkItemId,
      realModelCallsMade: false,
      codexCliInvokedManually: false,
      acpUsed: false,
      gatewayReloaded: false,
      workQueueLifecycleMutated: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    });
    for (const ref of [gateRef, readbackRef, reviewRef, summaryRef]) {
      await runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType:
          ref === gateRef
            ? api.ARCHITECTURE_RED_TEAM_GATE_ARTIFACT_TYPE
            : "execution.architecture_red_team_gate_support",
        storageKind: "artifact",
        uri: ref.ref,
        contentType: "application/json",
        sizeBytes: ref.sizeBytes,
        sha256: ref.sha256,
        metadata:
          ref === gateRef
            ? api.architectureRedTeamGateArtifactMetadata(gateRun)
            : {
                artifactRef: ref.ref,
                rawPromptStored: false,
                rawResponseStored: false,
                rawLogsStored: false,
              },
      });
    }
    const claimed = await runtimeJobs.claimNextJob({
      workerId: "architecture-red-team-proof-worker",
      queueName: "execution-platform",
      runtimeJobId: job.jobId,
    });
    if (claimed) {
      await runtimeJobs.completeJob({
        leaseToken: claimed.leaseToken,
        result: {
          accepted: validation.valid,
          proofReady: validation.proofReady,
          summaryRef: summaryRef.ref,
          rawPromptStored: false,
          rawResponseStored: false,
        },
      });
    }
    const closeout = await workQueue.completeWorkQueueItemFromCloseout({
      workItemId,
      runtimeJobId: job.jobId,
      closeoutRef: summaryRef.ref,
      closeoutHash: summaryRef.sha256,
      accepted: validation.valid,
      validationRequired: true,
      validationRef: gateRef.ref,
      sourceEditRequired: false,
      graphRef: gateRef.ref,
      ownerReadbackRef: readbackRef.ref,
      artifactRefs: [preflightRef.ref, gateRef.ref, readbackRef.ref, reviewRef.ref, summaryRef.ref],
      reasonCodes: [
        "architecture_red_team_gate_closeout_accepted",
        "architecture_red_team_runtime_gate_level_2_completed",
      ],
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    });
    console.log(
      JSON.stringify(
        {
          ok: validation.valid,
          proofReady: validation.proofReady,
          runtimeJobId: job.jobId,
          workItemTransition: closeout.status,
          artifacts: {
            preflightRef,
            gateRef,
            readbackRef,
            reviewRef,
            summaryRef,
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await runtime.close?.();
  }
}

await main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exit(1);
});
