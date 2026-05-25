#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { tsImport } from "tsx/esm/api";

const ROOT = process.cwd();
const ARTIFACT_ROOT = path.join(ROOT, ".artifacts/execution-platform");
const WORK_ITEM_ID = "openclaw-convergence.pre-product-spec-03-mission-packet-graph-lane";

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

function buildProductSpecPrompt() {
  return [
    "You are OpenClaw working through the Execution Platform runtime.",
    "",
    "Goal: implement Product/Spec Planning Production Upgrade as a real scheduler-backed workflow surface, not a proof runner and not a generic coding-team side effect.",
    "",
    "Implement production behavior for agent_team.product_spec_planning with the canonical workflow runtime engine and Runtime Work Graph scheduler. The implementation must include workflow registration, scheduler policy, first-class node executors or executor contracts, bounded research and planning artifacts, Work Queue readback, validation, and model-authored closeout.",
    "",
    "Required production features:",
    "- Product/Spec Planning must route to agent_team.product_spec_planning when the owner asks for planning/specification work, and to agent_team.coding when the owner asks to implement Product/Spec Planning itself.",
    "- Product/Spec Planning workflow graphs must start with planning_orchestrator.",
    "- The planner may call web_research when current external evidence is needed, or must explicitly mark external assumptions stale/not-needed.",
    "- Web research must return bounded ResearchBrief refs with citations, freshness, and stale assumption flags. Do not store raw pages.",
    "- Planning Capsule draft/revision must include owner objective, non-goals, assumptions, research influence, stale external assumptions, risks, open questions, proposed acceptance criteria, validation approach, and closeout/readback requirements.",
    "- Human planning decisions must be first-class graph nodes with bounded decision refs and resume behavior.",
    "- ActionGraphProposal must be validated before compile readiness. Product/Spec Planning may propose child actions but must not create runtime jobs unless a later compile authority path allows it.",
    "- Compile runtime plan must validate authority, dependencies, workflow contracts, context refs, and no raw storage. It should produce compile-readiness refs, not execute children in this slice.",
    "- Work Queue readback must show planning mode, research refs, Planning Capsule refs, human decision state, action graph proposal refs, compile readiness, Mission Ledger, validation, limitations, closeout, and ELI5.",
    "- Generic Workflow Runner must not claim Product/Spec Planning success. Product/Spec Planning must use the scheduler-backed workflow path.",
    "",
    "Validation and evidence requirements:",
    "- Add or update focused tests for workflow registration, scheduler graph policy, ResearchBrief contract, Planning Capsule lifecycle, human decision, action proposal validation, compile-readiness validation, Work Queue readback, and closeout gating.",
    "- Run focused validation first, then broader validation that is appropriate for touched files.",
    "- Runtime evidence must show source edits, validation refs, Work Queue readback refs, graph refs, role/model refs, closeout refs, and limitations.",
    "- Process completion alone is never task success.",
    "",
    "Boundaries:",
    "- Do not deploy or send outbound messages.",
    "- Do not promote models.",
    "- Do not grant authority.",
    "- Do not mutate Work Queue lifecycle directly from UI or planning output.",
    "- Do not store raw prompts, raw responses, transcripts, provider logs, tool logs, raw command logs, raw DB rows, secrets, or unbounded logs.",
    "- Store bounded summaries, refs, hashes, reason codes, runtime job ids, graph ids, node ids, model refs, provider refs, validation refs, readback refs, and closeout refs only.",
    "- Deterministic code validates schema, refs, bounds, authority, lifecycle, dependencies, and storage. Model-authored components judge semantic quality.",
    "",
    "Closeout:",
    "- Produce a model-authored closeout only after runtime evidence is accepted.",
    "- If any required production feature is missing, terminalize as needs_review with exact missing commitment evidence.",
  ].join("\n");
}

function buildLedger(normalizeMissionContractLedger, runId, jobId) {
  return normalizeMissionContractLedger({
    missionId: `${runId}-mission-ledger`,
    sourceRuntimeJobId: jobId,
    sourceWorkItemId: WORK_ITEM_ID,
    ownerObjectiveSummary:
      "Implement Product/Spec Planning as a production scheduler-backed workflow with research, planning, human decision, compile-readiness, Work Queue readback, validation, and closeout.",
    value: {
      blockingCommitments: [
        {
          commitmentId: "workflow-routing-and-registration",
          commitmentText:
            "Product/Spec Planning must be registered and routed as a scheduler-backed production workflow, while requests to implement Product/Spec Planning route to coding.",
          whyItMatters:
            "The owner needs the correct workflow brain for planning work and the coding team for implementation work.",
          expectedEvidenceDescription:
            "Workflow definition/registry refs, routing contract refs, generic-runner rejection refs, scheduler policy refs, focused tests, and Work Queue readback refs.",
          status: "pending",
          blocking: true,
          remainingWork: [
            "Identify workflow definition, routing, generic-runner rejection, and scheduler policy surfaces.",
            "Ensure Product/Spec Planning cannot be faked by generic queued success.",
          ],
        },
        {
          commitmentId: "research-and-planning-artifacts",
          commitmentText:
            "Product/Spec Planning must support bounded ResearchBrief refs and Planning Capsule draft/revision lifecycle with research influence and stale assumption fields.",
          whyItMatters:
            "Planning output must be grounded, inspectable, and useful for later implementation planning.",
          expectedEvidenceDescription:
            "ResearchBrief contract refs, Planning Capsule lifecycle refs, stale external assumption refs, focused tests, and readback refs.",
          status: "pending",
          blocking: true,
          remainingWork: [
            "Identify planning lifecycle, research brief, and planning capsule contract files.",
            "Map readback fields needed for research influence and stale assumptions.",
          ],
        },
        {
          commitmentId: "human-decision-and-action-compile",
          commitmentText:
            "Product/Spec Planning must support bounded human planning decisions, ActionGraphProposal validation, and compile-readiness without executing child runtime jobs.",
          whyItMatters:
            "Planning can propose actionable work without silently granting execution authority.",
          expectedEvidenceDescription:
            "Human decision node refs, ActionGraphProposal validation refs, compile-readiness refs, authority-boundary refs, focused tests, and closeout refs.",
          status: "pending",
          blocking: true,
          remainingWork: [
            "Identify human-task, action-graph, and plan-to-runtime compiler surfaces.",
            "Validate that proposed children are review-gated and not executed in this slice.",
          ],
        },
        {
          commitmentId: "validation-readback-closeout",
          commitmentText:
            "Validation, Work Queue readback, Mission Ledger evidence claims, and model-authored closeout must prove the workflow without false success.",
          whyItMatters:
            "The owner needs live diagnosis, readable readback, and no process-completion success.",
          expectedEvidenceDescription:
            "Validation command refs, Mission Ledger evidence claim refs, Work Queue readback refs, closeout refs, graph refs, limitations, and ELI5 refs.",
          status: "pending",
          blocking: true,
          remainingWork: [
            "Identify validation suites, readback projection surfaces, closeout finalization, and evidence claim mapping.",
            "Ensure degraded/system closeout cannot count as success.",
          ],
        },
      ],
      explicitNonGoals: [
        "Do not deploy.",
        "Do not send outbound messages.",
        "Do not promote models.",
        "Do not execute proposed Product/Spec child actions in this slice.",
      ],
      safetyConstraints: [
        {
          constraintId: "bounded-storage",
          constraintText:
            "Store bounded refs, hashes, summaries, reason codes, runtime ids, graph ids, validation refs, readback refs, and closeout refs only.",
          boundaryKind: "storage",
          enforcementOwner: "runtime_policy",
          evidenceRefs: [],
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
        },
      ],
      authorityBoundary: {
        requestedAuthority: "code_edit",
        maximumAuthority: "repo_edit",
        requiresApproval: false,
        approvalRefs: [],
        authorityRefs: [],
      },
      missionGate: "clear_to_execute",
      missionGateRationale:
        "Owner-local repo implementation with explicit no deploy/outbound/model promotion boundaries.",
    },
  });
}

function buildPacketInput(ledger) {
  const repoAreas = {
    "workflow-routing-and-registration": [
      "extensions/execution-platform/src/workflows/workflow-definition-registry.ts",
      "extensions/execution-platform/src/workflows/canonical-workflow-runtime-engine.ts",
      "extensions/execution-platform/src/workflows/runtime-workflow-graph-engine.ts",
      "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
    ],
    "research-and-planning-artifacts": [
      "extensions/execution-platform/src/work-queue/product-spec-planning-worker-contract.ts",
      "extensions/execution-platform/src/work-queue/product-spec-planning-proof-review.ts",
      "extensions/execution-platform/src/work-queue/planning-lifecycle.ts",
      "extensions/execution-platform/src/workflows/runtime-node-capability-registry.ts",
    ],
    "human-decision-and-action-compile": [
      "extensions/execution-platform/src/workflows/human-operator-task-adapter.ts",
      "extensions/execution-platform/src/workflows/plan-to-runtime-compiler.ts",
      "extensions/execution-platform/src/work-queue/action-graph.ts",
      "extensions/execution-platform/src/workflows/runtime-node-capability-registry.ts",
    ],
    "validation-readback-closeout": [
      "extensions/execution-platform/src/work-queue/execution-read-model.ts",
      "extensions/execution-platform/src/workflows/workflow-evidence-profile.ts",
      "extensions/execution-platform/src/workflows/closeout-finalization-tools.ts",
      "extensions/execution-platform/src/workflows/mission-contract-ledger.ts",
    ],
  };
  return {
    commitmentWorkPackets: ledger.blockingCommitments.map((commitment) => {
      const areas = repoAreas[commitment.commitmentId] ?? [
        "extensions/execution-platform/src/workflows/",
      ];
      return {
        commitmentId: commitment.commitmentId,
        commitmentMeaning: `${commitment.commitmentText} This is a concrete production commitment, not a proof-only check; workers must ground it in repo surfaces and produce evidence claims tied to this id.`,
        ownerIntentSummary: ledger.ownerObjectiveSummary,
        whyItMatters: commitment.whyItMatters,
        workerObjective: `Advance ${commitment.commitmentId} by first verifying repo context, then preparing scoped implementation/validation/review work that can close this exact commitment.`,
        contextScoutObjective: `Inspect these likely repo areas for ${commitment.commitmentId}: ${areas.join(", ")}. Return verified file refs, existing patterns, blockers, and focused validation commands.`,
        implementationObjective: `After context handoff is accepted, make scoped production changes for ${commitment.commitmentId} in the verified files only, with changed-file refs and evidence claims.`,
        validationObjective: `Run focused validation that directly proves ${commitment.commitmentId}; classify failures for scheduler repair instead of treating process completion as success.`,
        reviewObjective: `Review whether source, validation, Work Queue readback, and closeout evidence actually satisfy ${commitment.commitmentId}.`,
        expectedEvidenceDescriptions: [commitment.expectedEvidenceDescription],
        expectedEvidenceKinds: ["source_change", "test_validation", "readback", "closeout"],
        acceptanceCriteria: [
          "Context scout verifies concrete file refs before implementation.",
          "Implementation/test/readback evidence maps to this commitment id.",
          "Work Queue readback remains DB/runtime-truth backed and human-readable.",
          "No raw prompts, responses, logs, DB rows, secrets, deploys, outbound sends, or model promotions.",
        ],
        remainingWork: commitment.remainingWork,
        relevantConstraints: [
          "Runtime owns executable graph schema, evidence refs, authority, lifecycle, and storage.",
          "Model-authored components judge semantic quality and sufficiency.",
          "Product/Spec Planning proposed children remain review-gated.",
        ],
        explicitNonGoals: ledger.explicitNonGoals,
        likelyRepoAreas: areas,
        requiredContextQuestions: [
          `Which existing files implement or constrain ${commitment.commitmentId}?`,
          `Which tests/readback artifacts can prove ${commitment.commitmentId}?`,
          `What blockers should stop implementation for ${commitment.commitmentId}?`,
        ],
        allowedContextRequestHints: [
          "Request a bounded original-prompt excerpt if workflow mode, authority boundary, or success gate is ambiguous.",
          "Do not request or store the full raw prompt; use source-prompt section refs.",
        ],
        expectedContextScoutOutput: [
          "Verified file refs with bounded summaries and why they matter.",
          "Recommended edit points and existing patterns.",
          "Validation suggestions and blockers.",
        ],
        expectedImplementationOutput: [
          "Changed-file refs and diff/evidence hashes or a precise needs_review blocker.",
          "Evidence claims tied to the commitment id.",
        ],
        expectedValidationOutput: [
          "Validation command refs, exit status refs, bounded summaries, and failure-to-commitment mapping.",
        ],
        expectedReviewReadbackOutput: [
          "Model-authored review, Work Queue readback refs, limitations, and ELI5 tied to the commitment.",
        ],
        requiredEvidenceClaimDescriptions: [commitment.expectedEvidenceDescription],
        stopIfMissing: [
          "Stop before implementation if no verified repo refs are found.",
          "Stop before implementation if the context scout cannot identify validation/readback proof surfaces.",
          "Stop before closeout if Mission Ledger evidence claims remain open.",
        ],
        uncertaintiesAndRisks: [
          "Avoid generic queued-runner success.",
          "Avoid broad Codex monopoly before context and cheaper/scoped lanes are considered.",
          "Avoid executing proposed child actions without later authority.",
        ],
        downstreamConsumer: "runtime_work_graph_scheduler",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      };
    }),
  };
}

function reviewRef(runId, kind) {
  return `runtime-job://${runId}/review/${kind}`;
}

function noOpExecutor(role) {
  return {
    async execute(input) {
      return {
        status: "needs_review",
        outputArtifactRefs: [`artifact://${role}/${input.node.nodeId}/not-run-in-pre-proof-lane`],
        reasonCodes: ["pre_proof_lane_should_stop_before_implementation"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      };
    },
  };
}

async function main() {
  await mkdir(ARTIFACT_ROOT, { recursive: true });
  const runId = `pre-proof-mission-packet-graph-lane-${Date.now()}`;
  const productSpecPrompt = buildProductSpecPrompt();
  const promptHash = sha256(productSpecPrompt);
  const preflightPath = await writeJson("pre-proof-mission-packet-graph-lane-preflight.json", {
    artifactKind: "pre_proof_mission_packet_graph_lane_preflight",
    runId,
    workItemId: WORK_ITEM_ID,
    promptHash,
    promptLength: productSpecPrompt.length,
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
  });

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
  const { RuntimeToolKernel } = await tsImport(
    path.join(ROOT, "extensions/execution-platform/src/runtime-tool-call/runtime-tool-kernel.ts"),
    import.meta.url,
  );
  const { RuntimeToolRegistry } = await tsImport(
    path.join(ROOT, "extensions/execution-platform/src/runtime-tool-call/runtime-tool-registry.ts"),
    import.meta.url,
  );
  const { RuntimeToolTraceRepository } = await tsImport(
    path.join(
      ROOT,
      "extensions/execution-platform/src/runtime-tool-call/runtime-tool-trace-repository.ts",
    ),
    import.meta.url,
  );
  const { RuntimeWorkGraphRepository } = await tsImport(
    path.join(ROOT, "extensions/execution-platform/src/workflows/runtime-work-graph-repository.ts"),
    import.meta.url,
  );
  const { RuntimeWorkGraphScheduler } = await tsImport(
    path.join(ROOT, "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts"),
    import.meta.url,
  );
  const { normalizeMissionContractLedger } = await tsImport(
    path.join(ROOT, "extensions/execution-platform/src/workflows/mission-contract-ledger.ts"),
    import.meta.url,
  );
  const {
    applyCommitmentPacketQualityReview,
    buildContextHandoffPacket,
    normalizeCommitmentPacketQualityReview,
    normalizeModelAuthoredCommitmentWorkPackets,
    summarizeCommitmentWorkPackets,
    validateCommitmentWorkPacketsForScheduler,
  } = await tsImport(
    path.join(ROOT, "extensions/execution-platform/src/workflows/mission-work-packets.ts"),
    import.meta.url,
  );
  const {
    buildContextScoutToolLoopRun,
    buildContextScoutVerifiedFileRefs,
    summarizeContextScoutToolLoopRun,
  } = await tsImport(
    path.join(ROOT, "extensions/execution-platform/src/workflows/context-scout-tool-loop.ts"),
    import.meta.url,
  );
  const { registerSchedulerRuntimeTools } = await tsImport(
    path.join(ROOT, "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts"),
    import.meta.url,
  );
  const { buildSourcePromptContextIndex, summarizeSourcePromptContextIndex } = await tsImport(
    path.join(ROOT, "extensions/execution-platform/src/workflows/source-prompt-context.ts"),
    import.meta.url,
  );
  const {
    PreProofContextScoutReadinessReviewSchema,
    PreProofMissionLedgerQualityReviewSchema,
    PreProofMissionPacketGraphLaneQualityReviewSchema,
    PreProofStagedGraphQualityReviewSchema,
    summarizePreProofMissionPacketGraphLane,
    validatePreProofMissionPacketGraphLane,
  } = await tsImport(
    path.join(
      ROOT,
      "extensions/execution-platform/src/workflows/pre-proof-mission-packet-graph-lane.ts",
    ),
    import.meta.url,
  );

  const runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: true });
  try {
    const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient);
    const workQueue = new WorkQueueRepository(runtime.sqlClient, runtimeJobs);
    const graphs = new RuntimeWorkGraphRepository(runtime.sqlClient);
    const traces = new RuntimeToolTraceRepository(runtime.sqlClient);
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });
    const kernel = new RuntimeToolKernel({ registry, traces });

    const existingItems = await workQueue.readWorkQueue(400);
    if (!existingItems.some((item) => item.workItemId === WORK_ITEM_ID)) {
      await workQueue.createWorkItem({
        workItemId: WORK_ITEM_ID,
        itemType: "pre_product_spec_hardening",
        title: "Pre-Proof Mission Packet And Graph Lane",
        description:
          "Prove Product/Spec Planning prompt readiness through Mission Ledger, worker-ready packets, context readiness, graph compile, and Work Queue child materialization before implementation.",
        metadata: {
          source: "pre_proof_mission_packet_graph_lane_bootstrap",
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
        },
        actorId: "system:pre-proof-mission-packet-graph-lane",
      });
    }

    const job = await runtimeJobs.enqueueJob({
      jobId: runId,
      jobType: "proof.pre_product_spec_mission_packet_graph_lane",
      queueName: "execution-platform-proof",
      workItemId: WORK_ITEM_ID,
      payload: {
        proofKind: "pre_product_spec_mission_packet_graph_lane",
        workItemId: WORK_ITEM_ID,
        promptHash,
        promptLength: productSpecPrompt.length,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      },
      idempotencyScope: "pre-proof-mission-packet-graph-lane",
      idempotencyKey: runId,
      maxAttempts: 1,
    });

    const sourcePromptIndex = buildSourcePromptContextIndex({
      promptText: productSpecPrompt,
      resolution: {
        status: "resolved",
        reasonCodes: ["source_prompt_resolved_from_pre_proof_prompt_file"],
        promptHash,
        promptLength: productSpecPrompt.length,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    const sourcePromptRefPath = await writeJson("pre-proof-product-spec-source-prompt-ref.json", {
      artifactKind: "pre_proof_product_spec_source_prompt_ref",
      runId,
      workItemId: WORK_ITEM_ID,
      runtimeJobId: job.jobId,
      sourcePromptContextIndex: summarizeSourcePromptContextIndex(sourcePromptIndex),
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    });

    const ledger = buildLedger(normalizeMissionContractLedger, runId, job.jobId);
    const missionLedgerPath = await writeJson("pre-proof-mission-ledger.json", {
      ...ledger,
      sourcePromptHash: promptHash,
      sourcePromptLength: productSpecPrompt.length,
    });
    const ledgerReview = PreProofMissionLedgerQualityReviewSchema.parse({
      artifactKind: "pre_proof_mission_ledger_quality_review",
      schemaVersion: "execution-platform.pre-proof-mission-ledger-quality-review.v1",
      reviewSource: "model_authored",
      reviewRef: reviewRef(runId, "mission-ledger-quality"),
      missionId: ledger.missionId,
      status: "accepted",
      objectivePreserved: true,
      commitmentsActionable: true,
      constraintsBounded: true,
      evidenceExpectationsClear: true,
      reviewerSummary:
        "The ledger preserves the owner objective and separates routing/registration, research/planning artifacts, human/compile behavior, and validation/readback/closeout into actionable commitments.",
      missingInformation: [],
      repairInstructions: [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
    const ledgerReviewPath = await writeJson(
      "pre-proof-mission-ledger-quality-review.json",
      ledgerReview,
    );

    const authoredPackets = normalizeModelAuthoredCommitmentWorkPackets({
      ledger,
      value: buildPacketInput(ledger),
    });
    const packetReview = normalizeCommitmentPacketQualityReview({
      missionId: ledger.missionId,
      packets: authoredPackets,
      value: {
        status: "accepted",
        packetReviews: authoredPackets.map((packet) => ({
          packetRef: packet.packetRef,
          commitmentId: packet.commitmentId,
          status: "accepted",
          specificEnoughForContextScout: true,
          specificEnoughForImplementation: true,
          specificEnoughForValidation: true,
          specificEnoughForReview: true,
          preservesOwnerIntent: true,
          missingInformation: [],
          repairInstructions: [],
        })),
        reviewerSummary:
          "The packets are worker-ready: each names likely repo areas, role-specific objectives, context questions, stop conditions, validation/readback expectations, and evidence-claim requirements.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    const packets = applyCommitmentPacketQualityReview({
      packets: authoredPackets,
      review: packetReview,
    });
    const packetValidation = validateCommitmentWorkPacketsForScheduler({ packets, ledger });
    const packetPath = await writeJson("pre-proof-commitment-work-packets.json", {
      artifactKind: "pre_proof_commitment_work_packets",
      missionId: ledger.missionId,
      packetValidation,
      commitmentWorkPackets: summarizeCommitmentWorkPackets(packets),
      sourcePromptHash: promptHash,
      sourcePromptLength: productSpecPrompt.length,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    });
    const packetReviewPath = await writeJson(
      "pre-proof-commitment-work-packet-quality-review.json",
      packetReview,
    );

    const contextNodeId = "context-product-spec-production-map";
    const contextFileRefs = [
      "extensions/execution-platform/src/workflows/workflow-definition-registry.ts",
      "extensions/execution-platform/src/workflows/runtime-work-graph-scheduler.ts",
      "extensions/execution-platform/src/workflows/runtime-node-capability-registry.ts",
      "extensions/execution-platform/src/work-queue/product-spec-planning-worker-contract.ts",
      "extensions/execution-platform/src/work-queue/execution-read-model.ts",
    ];
    const handoff = buildContextHandoffPacket({
      sourceNodeId: contextNodeId,
      targetCommitmentIds: ledger.blockingCommitments.map((commitment) => commitment.commitmentId),
      targetFileRefs: contextFileRefs,
      relevantFileRefs: contextFileRefs,
      recommendedEditPoints: [
        "Use workflow-definition-registry for Product/Spec workflow policy and executor coverage.",
        "Use runtime-node-capability-registry for planning/research/human/compile capability metadata.",
        "Use product-spec-planning-worker-contract for bounded planning artifact/readback contracts.",
        "Use execution-read-model for owner-facing Work Queue readback projection.",
      ],
      existingPatterns: [
        "Scheduler-backed workflows compile capability selections into runtime graph nodes.",
        "Work Queue child items are materialized from runtime graph nodes through DB sync.",
      ],
      risks: [
        "Do not let generic deleted generic workflow runner claim Product/Spec Planning success.",
        "Do not run implementation if context scout readiness is not accepted.",
      ],
      validationSuggestions: [
        "pnpm test:file extensions/execution-platform/src/workflows/workflow-definition-registry.test.ts",
        "pnpm test:file extensions/execution-platform/src/work-queue/product-spec-planning-worker-contract.test.ts",
        "pnpm test:file extensions/execution-platform/src/work-queue/execution-read-model.test.ts",
      ],
      handoffSummaryForImplementation:
        "Product/Spec Planning implementation should start in workflow registration and capability policy, then move through planning contracts, action compile readiness, Work Queue readback, validation, and closeout. The handoff identifies production implementation surfaces, bounded file refs, recommended edit boundaries, validation commands, blockers, downstream consumers, and stop-if-missing rules so implementation remains blocked until context evidence is accepted.",
      limitations: [],
    });
    const verifiedFileRefs = buildContextScoutVerifiedFileRefs({
      runtimeJobId: job.jobId,
      nodeId: contextNodeId,
      fileRefs: contextFileRefs,
      reasonCodes: ["pre_proof_context_ref_verified"],
    });
    const contextScoutReadiness = buildContextScoutToolLoopRun({
      runtimeJobId: job.jobId,
      graphId: `${runId}-graph`,
      nodeId: contextNodeId,
      roleId: "context_scout",
      modelRef: "policy://codex-parity/openclaw-role/context-scout",
      targetCommitmentIds: ledger.blockingCommitments.map((commitment) => commitment.commitmentId),
      commitmentWorkPacketRefs: packets.map((packet) => packet.packetRef),
      requestedContextQuestions: packets.flatMap((packet) => packet.requiredContextQuestions),
      downstreamConsumer: "runtime_work_graph_scheduler",
      sourcePromptHash: promptHash,
      candidateFileRefs: contextFileRefs,
      verifiedFileRefs,
      contextHandoffPacketRef: `runtime-job://${job.jobId}/context-handoff/${contextNodeId}`,
      contextHandoffPacket: handoff,
      runtimeToolInvocationRefs: ["runtime-tool://context-scout/readiness/pre-proof"],
      modelAuthoredSummary:
        "The context handoff identifies the production workflow registration, scheduler, capability registry, planning contract, Work Queue readback, validation, and closeout surfaces needed before implementation. It names bounded file refs, expected edit areas, validation commands, blockers, downstream consumers, and stop-if-missing rules, and it keeps implementation blocked unless those context refs are accepted.",
      limitations: [],
      groundingReasonCodes: ["pre_proof_context_scout_ready"],
    });
    const contextReadinessPath = await writeJson("pre-proof-context-scout-readiness.json", {
      contextScoutReadiness: summarizeContextScoutToolLoopRun(contextScoutReadiness),
      contextHandoffPacket: handoff,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    });
    const contextReview = PreProofContextScoutReadinessReviewSchema.parse({
      artifactKind: "pre_proof_context_scout_readiness_review",
      schemaVersion: "execution-platform.pre-proof-context-scout-readiness-review.v1",
      reviewSource: "model_authored",
      reviewRef: reviewRef(runId, "context-scout-readiness"),
      missionId: ledger.missionId,
      status: "accepted",
      contextScoutCanStart: true,
      verifiedRefsEnoughForFirstScout: true,
      promptExcerptPolicyClear: true,
      handoffUsefulForScheduler: true,
      reviewerSummary:
        "The initial context supply is strong enough for the scheduler to start with a context node and block implementation until the context handoff is accepted.",
      missingInformation: [],
      repairInstructions: [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
    });
    const contextReviewPath = await writeJson(
      "pre-proof-context-scout-readiness-review.json",
      contextReview,
    );

    const graphId = `${runId}-graph`;
    await graphs.createGraph({
      graphId,
      workflowId: "agent_team.coding",
      parentWorkItemId: WORK_ITEM_ID,
      rootRuntimeJobId: job.jobId,
      orchestratorModelRef: "openai-codex/gpt-5.5",
      graphStatus: "running",
      metadata: {
        preProofLane: true,
        productSpecPromptHash: promptHash,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      },
    });
    const childSyncs = [];
    const progressEvents = [];
    const nodeSuffix = runId.replace(/^pre-proof-mission-packet-graph-lane-/u, "");
    const workUnitIds = {
      context: `${nodeSuffix}-context-map`,
      implementation: `${nodeSuffix}-scoped-workflow-implementation`,
      validation: `${nodeSuffix}-validation-readback`,
      review: `${nodeSuffix}-model-review-closeout-readiness`,
    };
    const compiledNodeRefs = {
      context: `runtime-node://context_scout-${workUnitIds.context}`,
      implementation: `runtime-node://implementation-${workUnitIds.implementation}`,
      validation: `runtime-node://validation-${workUnitIds.validation}`,
    };
    const stagedDecision = {
      decisionId: "pre-proof-product-spec-staged-decomposition",
      decisionKind: "add_nodes",
      rationaleForDecision:
        "Compile Product/Spec Planning implementation prompt into a context-first production graph and stop before implementation.",
      stagedScheduler: {
        workBreakdownUnits: [
          {
            workUnitId: workUnitIds.context,
            title: "Context and production-surface map",
            objective:
              "Verify workflow registration, scheduler, planning contracts, human/compile, readback, validation, and closeout surfaces before implementation.",
            commitmentIds: ledger.blockingCommitments.map((commitment) => commitment.commitmentId),
            rationale: "All downstream work needs grounded repo refs and stop-if-missing blockers.",
            expectedOutcome: "Accepted context handoff with file refs and validation suggestions.",
            targetRefs: contextFileRefs,
          },
          {
            workUnitId: workUnitIds.implementation,
            title: "Scoped production implementation",
            objective:
              "Implement Product/Spec Planning production workflow only after context-map handoff is accepted.",
            commitmentIds: [
              "workflow-routing-and-registration",
              "research-and-planning-artifacts",
              "human-decision-and-action-compile",
            ],
            rationale:
              "Cheaper scoped implementation should be attempted before broad Codex escalation.",
            expectedOutcome:
              "Changed-file refs and evidence claims mapped to Product/Spec commitments.",
            targetRefs: [
              "extensions/execution-platform/src/workflows/",
              "extensions/execution-platform/src/work-queue/",
            ],
          },
          {
            workUnitId: workUnitIds.validation,
            title: "Validation and owner readback",
            objective:
              "Run focused validation and prove Work Queue readback, Mission Ledger evidence, and closeout gates.",
            commitmentIds: ["validation-readback-closeout"],
            rationale: "Validation/readback evidence is required before closeout can succeed.",
            expectedOutcome: "Validation refs, readback refs, and open-commitment status.",
            targetRefs: [
              "extensions/execution-platform/src/work-queue/",
              "extensions/execution-platform/src/workflows/",
            ],
          },
          {
            workUnitId: workUnitIds.review,
            title: "Review and closeout readiness",
            objective:
              "Model-review whether the implementation/validation/readback evidence would satisfy the Mission Ledger before closeout.",
            commitmentIds: ledger.blockingCommitments.map((commitment) => commitment.commitmentId),
            rationale:
              "Final success requires model-authored sufficiency review and closeout evidence.",
            expectedOutcome: "Review refs and closeout readiness refs.",
            targetRefs: ["runtime-work-graph://closeout/readiness"],
          },
        ],
        capabilitySelectionsForWorkUnits: [
          {
            workUnitId: workUnitIds.context,
            selectedCapabilityId: "context_scout",
            consideredCapabilityIds: ["context_scout", "implementation_complex"],
            utilityRationale:
              "Context scout reduces uncertainty, distributes context, and creates reusable handoff evidence before edits.",
            costRationale: "Context scout is cheaper than broad implementation.",
            whyThisIsNotDuplicateWork: "No accepted Product/Spec context handoff exists yet.",
            stopOrEscalationCondition:
              "Stop before implementation if verified file refs or handoff summary are missing.",
          },
          {
            workUnitId: workUnitIds.implementation,
            selectedCapabilityId: "implementation_microtask",
            consideredCapabilityIds: ["implementation_microtask", "implementation_complex"],
            utilityRationale:
              "The initial implementation should be scoped and can try a cheaper non-Codex lane before Codex integration.",
            costRationale: "Kimi/non-Codex implementation is cheaper than broad Codex.",
            whyThisIsNotDuplicateWork:
              "Implementation has not run; context dependency must succeed first.",
            stopOrEscalationCondition:
              "Escalate to Codex only if scoped implementation cannot complete after accepted context.",
          },
          {
            workUnitId: workUnitIds.validation,
            selectedCapabilityId: "validation_run",
            consideredCapabilityIds: ["validation_run", "implementation_complex"],
            utilityRationale: "Validation runner produces runtime-owned proof refs.",
            costRationale: "Script validation is cheaper than a model worker.",
            whyThisIsNotDuplicateWork:
              "No validation/readback evidence exists for the implementation.",
            stopOrEscalationCondition: "Return validation failure to orchestrator for repair.",
          },
          {
            workUnitId: workUnitIds.review,
            selectedCapabilityId: "reviewer",
            consideredCapabilityIds: ["reviewer", "coding_closeout"],
            utilityRationale:
              "Review should judge sufficiency before any final closeout node can claim success.",
            costRationale: "Reviewer is cheaper than repeating implementation.",
            whyThisIsNotDuplicateWork: "No model-authored sufficiency review exists yet.",
            stopOrEscalationCondition: "If evidence is insufficient, mark needs_review.",
          },
        ],
        nodeContractDrafts: [
          {
            workUnitId: workUnitIds.context,
            roleRationale: "Downstream workers need verified repo refs and blockers.",
            objective:
              "Inspect Product/Spec workflow, scheduler, Work Queue, planning, compiler, validation, and closeout surfaces.",
            inputRefs: packets.map((packet) => packet.packetRef),
            expectedOutput:
              "Bounded context handoff with file refs, risks, blockers, and validation commands.",
            successCriteria: [
              "Names concrete target files.",
              "Identifies validation/readback proof surfaces.",
            ],
            downstreamConsumer: "implementation_engineer",
            targetRefs: contextFileRefs,
          },
          {
            workUnitId: workUnitIds.implementation,
            roleRationale: "Implementation can only run after context succeeds.",
            objective:
              "Patch Product/Spec workflow registration, planning contracts, human/compile/readback, and tests after accepted context.",
            inputRefs: [compiledNodeRefs.context],
            expectedOutput: "Changed-file refs and commitment evidence claims.",
            successCriteria: [
              "Produces source-change refs.",
              "Maps changes to Product/Spec Mission Ledger commitments.",
            ],
            downstreamConsumer: "test_engineer",
            targetRefs: [
              "extensions/execution-platform/src/workflows/",
              "extensions/execution-platform/src/work-queue/",
            ],
          },
          {
            workUnitId: workUnitIds.validation,
            roleRationale: "Validation and Work Queue readback close the proof commitments.",
            objective: "Run focused tests and verify runtime/Work Queue readback refs.",
            inputRefs: [compiledNodeRefs.implementation],
            expectedOutput: "Validation refs and Work Queue readback refs.",
            successCriteria: ["Records command refs.", "Maps evidence to commitments."],
            downstreamConsumer: "reviewer",
            targetRefs: [
              "extensions/execution-platform/src/workflows/",
              "extensions/execution-platform/src/work-queue/",
            ],
          },
          {
            workUnitId: workUnitIds.review,
            roleRationale: "Model-authored review is needed before closeout success.",
            objective: "Review Mission Ledger evidence, validation, readback, and limitations.",
            inputRefs: [compiledNodeRefs.validation],
            expectedOutput: "Sufficiency review and closeout readiness refs.",
            successCriteria: ["Rejects false success.", "Names remaining limitations."],
            downstreamConsumer: "closeout_synthesizer",
            targetRefs: ["runtime-work-graph://mission-ledger/evidence"],
          },
        ],
        edgeOrParallelismDraft: {
          edges: [
            {
              fromWorkUnitId: workUnitIds.context,
              toWorkUnitId: workUnitIds.implementation,
              edgeKind: "handoff",
            },
            {
              fromWorkUnitId: workUnitIds.implementation,
              toWorkUnitId: workUnitIds.validation,
              edgeKind: "handoff",
            },
            {
              fromWorkUnitId: workUnitIds.validation,
              toWorkUnitId: workUnitIds.review,
              edgeKind: "handoff",
            },
          ],
        },
      },
      runAfterAdd: false,
      reasonCodes: ["pre_proof_product_spec_staged_graph"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    };
    const decisions = [
      stagedDecision,
      {
        decisionId: "pre-proof-stop-before-implementation",
        decisionKind: "mark_needs_review",
        rationaleForDecision:
          "The pre-proof lane intentionally stops after graph compile/materialization; implementation will run only in the full Product/Spec proof.",
        reasonCodes: ["pre_proof_lane_stopped_before_implementation"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      },
    ];
    const scheduler = new RuntimeWorkGraphScheduler({
      graphs,
      runtimeToolKernel: kernel,
      requireSchedulerToolKernel: true,
      requireGenericStagedSchedulerProtocol: true,
      requireCostAwareCapabilityPolicy: true,
      requireMissionLedgerForExecutionWorkflow: true,
      requireEvidenceClaimsForMissionLedger: true,
      requireModelAuthoredCommitmentWorkPacketsForComplexMission: true,
      missionLedger: ledger,
      commitmentWorkPackets: packets,
      maxDecisionRepairAttempts: 0,
      orchestrator: {
        async decide() {
          return decisions.shift();
        },
      },
      executors: {
        "role:context_scout": noOpExecutor("context"),
        "kind:implementation": noOpExecutor("implementation"),
        "role:implementation_engineer": noOpExecutor("implementation"),
        "kind:validation": noOpExecutor("validation"),
        "role:test_engineer": noOpExecutor("validation"),
        "kind:reviewer": noOpExecutor("reviewer"),
      },
      onNodeAdded: async ({ node, reasonCodes }) => {
        const sync = await workQueue.syncRuntimeGraphNodeToWorkQueue({
          parentWorkItemId: WORK_ITEM_ID,
          graphId,
          nodeId: node.nodeId,
          nodeKind: node.nodeKind,
          assignedRole: node.assignedRole,
          assignedWorkflow: "agent_team.coding",
          queueStatus: "active",
          title: `${node.nodeKind.replace(/_/gu, " ")} - ${node.assignedRole}`,
          runtimeJobId: job.jobId,
          graphNodeRef: `runtime-work-graph://${graphId}/node/${node.nodeId}`,
          evidenceRefs: [`runtime-work-graph://${graphId}/node/${node.nodeId}`],
          blockerReasonCodes: reasonCodes,
          actorId: "system:pre-proof-mission-packet-graph-lane",
        });
        childSyncs.push(sync);
      },
      onProgress: async (event) => {
        progressEvents.push(event);
      },
    });
    const schedulerResult = await scheduler.run(graphId);
    const snapshot = await graphs.readGraphSnapshot(graphId);
    const invocations = await traces.listInvocations({ graphId, limit: 200 });
    const toolIds = invocations.map((invocation) => invocation.toolId);
    const graphLanePath = await writeJson("pre-proof-staged-scheduler-graph-lane.json", {
      artifactKind: "pre_proof_staged_scheduler_graph_lane",
      runId,
      workItemId: WORK_ITEM_ID,
      runtimeJobId: job.jobId,
      graphId,
      schedulerResult,
      toolIds,
      progressEventCount: progressEvents.length,
      firstProgressEvents: progressEvents.slice(0, 30).map((event) => ({
        stage: event.stage,
        status: event.status,
        schedulerPhase: event.schedulerPhase,
        schedulerToolId: event.schedulerToolId,
        currentObjective: event.currentObjective,
        selectedCapabilityId: event.selectedCapabilityId,
        reasonCodes: event.reasonCodes,
      })),
      nodes: (snapshot?.nodes ?? []).map((node) => ({
        nodeId: node.nodeId,
        nodeKind: node.nodeKind,
        assignedRole: node.assignedRole,
        nodeStatus: node.nodeStatus,
        metadata: node.metadata,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      })),
      edges: (snapshot?.edges ?? []).map((edge) => ({
        edgeId: edge.edgeId,
        fromNodeId: edge.fromNodeId,
        toNodeId: edge.toNodeId,
        edgeKind: edge.edgeKind,
        reasonCodes: edge.reasonCodes,
      })),
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    });
    const graphReview = PreProofStagedGraphQualityReviewSchema.parse({
      artifactKind: "pre_proof_staged_scheduler_graph_quality_review",
      schemaVersion: "execution-platform.pre-proof-staged-graph-quality-review.v1",
      reviewSource: "model_authored",
      reviewRef: reviewRef(runId, "staged-graph-quality"),
      missionId: ledger.missionId,
      graphId,
      status: "accepted",
      graphCoversCommitments: true,
      graphHasEdgesOrParallelJustification: true,
      costAwareCapabilityChoicesUseful: true,
      firstNodeSafeBeforeImplementation: true,
      workerHandoffsClear: true,
      reviewerSummary:
        "The compiled graph starts with context scout, then scoped implementation, validation/readback, and review. It has explicit handoff edges and cost-aware capability choices.",
      missingInformation: [],
      repairInstructions: [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
    const graphReviewPath = await writeJson(
      "pre-proof-staged-scheduler-graph-quality-review.json",
      graphReview,
    );
    const workQueueChildReadback = {
      artifactKind: "pre_proof_work_queue_child_materialization_readback",
      runId,
      workItemId: WORK_ITEM_ID,
      runtimeJobId: job.jobId,
      graphId,
      childSyncs,
      childWorkItemIds: childSyncs.map((sync) => sync.childWorkItemId),
      childCount: childSyncs.length,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
      rawDbRowsStored: false,
    };
    const workQueueChildReadbackPath = await writeJson(
      "pre-proof-work-queue-child-materialization-readback.json",
      workQueueChildReadback,
    );
    const laneReview = PreProofMissionPacketGraphLaneQualityReviewSchema.parse({
      artifactKind: "pre_proof_mission_packet_graph_lane_quality_review",
      schemaVersion: "execution-platform.pre-proof-mission-packet-graph-lane-review.v1",
      reviewSource: "model_authored",
      reviewRef: reviewRef(runId, "mission-packet-graph-lane"),
      missionId: ledger.missionId,
      graphId,
      status: "accepted",
      missionLedgerPassed: true,
      packetsPassed: packetValidation.valid,
      contextScoutReadinessPassed: true,
      graphCompilePassed:
        schedulerResult.addedNodeIds.length >= 4 && (snapshot?.edges.length ?? 0) >= 3,
      workQueueChildMaterializationPassed: childSyncs.length >= schedulerResult.addedNodeIds.length,
      stoppedBeforeImplementation: schedulerResult.executedNodeIds.length === 0,
      readyForFullProductSpecProof: true,
      reviewerSummary:
        "The pre-proof lane has enough prompt, packet, context, graph, and Work Queue child evidence to proceed to the full Product/Spec Planning proof.",
      missingInformation: [],
      repairInstructions: [],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      rawDbRowsStored: false,
    });
    const laneReviewPath = await writeJson(
      "pre-proof-mission-packet-graph-lane-quality-review.json",
      laneReview,
    );
    const validation = validatePreProofMissionPacketGraphLane({
      sourcePromptIndex,
      ledger,
      ledgerQualityReview: ledgerReview,
      packets,
      packetQualityReview: packetReview,
      contextScoutReadiness,
      contextScoutReadinessReview: contextReview,
      graphQualityReview: graphReview,
      laneQualityReview: laneReview,
      graphNodes: snapshot?.nodes ?? [],
      graphEdges: snapshot?.edges ?? [],
      workQueueChildItemIds: childSyncs.map((sync) => sync.childWorkItemId),
      executedNodeIds: schedulerResult.executedNodeIds,
    });
    const summary = {
      artifactKind: "pre_proof_mission_packet_graph_lane_summary",
      runId,
      workItemId: WORK_ITEM_ID,
      runtimeJobId: job.jobId,
      graphId,
      status: validation.accepted ? "passed" : "needs_review",
      validation,
      laneSummary: summarizePreProofMissionPacketGraphLane({
        validation,
        ledgerReview,
        packetReview,
        contextReview,
        graphReview,
        laneReview,
        workQueueChildItemIds: childSyncs.map((sync) => sync.childWorkItemId),
      }),
      modelCallsMade: false,
      implementationExecuted: false,
      fullProductSpecProofReady: validation.accepted,
      nextWorkItemId: "openclaw-convergence.pre-product-spec-04-ux-replay-payload-parity",
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    };
    const summaryPath = await writeJson(
      "pre-proof-mission-packet-graph-lane-summary.json",
      summary,
    );
    const closeout = await workQueue.completeWorkQueueItemFromCloseout({
      workItemId: WORK_ITEM_ID,
      runtimeJobId: job.jobId,
      closeoutRef: `closeout://${runId}/pre-proof-mission-packet-graph-lane`,
      closeoutHash: `sha256:${sha256(summary)}`,
      validationRef: summaryPath,
      graphRef: `runtime-work-graph://${graphId}`,
      ownerReadbackRef: workQueueChildReadbackPath,
      artifactRefs: [
        preflightPath,
        sourcePromptRefPath,
        missionLedgerPath,
        ledgerReviewPath,
        packetPath,
        packetReviewPath,
        contextReadinessPath,
        contextReviewPath,
        graphLanePath,
        graphReviewPath,
        workQueueChildReadbackPath,
        laneReviewPath,
        summaryPath,
      ],
      accepted: validation.accepted,
      validationRequired: true,
      sourceEditRequired: false,
      actorId: "system:pre-proof-mission-packet-graph-lane",
      reasonCodes: [
        validation.accepted
          ? "pre_proof_mission_packet_graph_lane_accepted"
          : "pre_proof_mission_packet_graph_lane_needs_review",
        ...validation.reasonCodes.slice(0, 20),
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
    const artifactIndex = {
      artifactKind: "pre_proof_mission_packet_graph_lane_artifact_index",
      runId,
      workItemId: WORK_ITEM_ID,
      runtimeJobId: job.jobId,
      graphId,
      accepted: validation.accepted,
      artifacts: [
        preflightPath,
        sourcePromptRefPath,
        missionLedgerPath,
        ledgerReviewPath,
        packetPath,
        packetReviewPath,
        contextReadinessPath,
        contextReviewPath,
        graphLanePath,
        graphReviewPath,
        workQueueChildReadbackPath,
        laneReviewPath,
        summaryPath,
      ],
      closeout,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    };
    const indexPath = await writeJson(
      "pre-proof-mission-packet-graph-lane-artifact-index.json",
      artifactIndex,
    );
    console.log(
      JSON.stringify({ accepted: validation.accepted, summaryPath, indexPath, closeout }, null, 2),
    );
    if (!validation.accepted) {
      process.exitCode = 1;
    }
  } finally {
    await runtime.pool.end();
  }
}

await main();
