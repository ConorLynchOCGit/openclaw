#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { tsImport } from "tsx/esm/api";

const ROOT = process.cwd();
const ARTIFACT_ROOT = path.join(ROOT, ".artifacts/execution-platform");
const WORK_ITEM_ID = "openclaw-convergence.pre-product-spec-02-model-facing-staged-scheduler-tools";

function sha256(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function writeJson(name, value) {
  const file = path.join(ARTIFACT_ROOT, name);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  return file;
}

function buildLedger(normalizeMissionContractLedger) {
  return normalizeMissionContractLedger({
    missionId: "product-spec-failed-ledger-replay",
    ownerObjectiveSummary:
      "Implement Product/Spec Planning as a production workflow through staged scheduling before source edits.",
    value: {
      blockingCommitments: [
        {
          commitmentId: "workflow-registration",
          commitmentText:
            "Product/Spec Planning must be registered as a production workflow surface.",
          whyItMatters: "The owner needs an actual workflow, not a proof runner.",
          expectedEvidenceDescription: "Workflow/plugin registration refs and readback refs.",
          status: "pending",
          blocking: true,
          remainingWork: ["Find workflow registry and plugin surfaces before implementation."],
        },
        {
          commitmentId: "planning-lifecycle",
          commitmentText:
            "Planning Capsule lifecycle must support draft, review, revision, and compile readiness.",
          whyItMatters: "Planning output must be useful enough to drive future execution.",
          expectedEvidenceDescription:
            "Planning Capsule lifecycle refs and compile-readiness evidence.",
          status: "pending",
          blocking: true,
          remainingWork: ["Map capsule fields and lifecycle transitions before implementation."],
        },
        {
          commitmentId: "validation-readback",
          commitmentText:
            "Validation and Work Queue readback must show graph state and proof refs.",
          whyItMatters: "Owner-facing proof must be diagnosable during the run.",
          expectedEvidenceDescription:
            "Validation command refs, Work Queue child refs, and progress readback refs.",
          status: "pending",
          blocking: true,
          remainingWork: ["Identify focused tests and readback surfaces before source edits."],
        },
      ],
      explicitNonGoals: [
        "Do not deploy.",
        "Do not send outbound messages.",
        "Do not promote models.",
      ],
      missionGate: "clear_to_execute",
      missionGateRationale: null,
    },
  });
}

function acceptedPackets(ledger, normalizeModelAuthoredCommitmentWorkPackets) {
  const packets = normalizeModelAuthoredCommitmentWorkPackets({
    ledger,
    value: {
      commitmentWorkPackets: ledger.blockingCommitments.map((commitment) => ({
        commitmentId: commitment.commitmentId,
        commitmentMeaning: `${commitment.commitmentText} This packet must be concrete enough for context, implementation, validation, and review workers.`,
        ownerIntentSummary: ledger.ownerObjectiveSummary,
        whyItMatters: commitment.whyItMatters,
        workerObjective: `Advance ${commitment.commitmentId} with bounded runtime evidence and stop if repo context is missing.`,
        contextScoutObjective: `Find concrete repo files, registries, tests, and readback surfaces needed for ${commitment.commitmentId}.`,
        implementationObjective: `Use the context handoff for ${commitment.commitmentId} to make only scoped source edits after dependencies are satisfied.`,
        validationObjective: `Run focused validation that proves ${commitment.commitmentId} without relying on process completion.`,
        reviewObjective: `Review whether evidence for ${commitment.commitmentId} is sufficient and mapped to Mission Ledger claims.`,
        expectedEvidenceDescriptions: [commitment.expectedEvidenceDescription],
        expectedEvidenceKinds:
          commitment.commitmentId === "validation-readback"
            ? ["test_validation", "readback"]
            : ["source_change", "artifact", "readback"],
        acceptanceCriteria: [
          "Names concrete repo target refs before implementation.",
          "Maps produced evidence to this commitment id.",
          "Stores only bounded refs, hashes, and summaries.",
        ],
        remainingWork: commitment.remainingWork,
        relevantConstraints: [
          "Runtime owns executable graph schema and evidence refs.",
          "Models judge semantic sufficiency only.",
        ],
        explicitNonGoals: ["No deploy.", "No outbound send.", "No model promotion."],
        likelyRepoAreas: [
          "extensions/execution-platform/src/workflows/",
          "extensions/execution-platform/src/work-queue/",
          "extensions/execution-platform/src/codex-bridge/",
        ],
        requiredContextQuestions: [
          "Which files register this workflow or plugin?",
          "Which tests already cover this surface?",
          "Which readback/progress fields prove this commitment?",
        ],
        allowedContextRequestHints: [
          "Request bounded prompt excerpts only when packet detail is insufficient.",
        ],
        expectedContextScoutOutput: [
          "Concrete file refs and why they matter.",
          "Known tests and validation commands.",
          "Missing context blockers, if any.",
        ],
        expectedImplementationOutput: [
          "Changed-file refs or a needs_review reason.",
          "Validation refs or failure classification.",
        ],
        expectedValidationOutput: ["Command refs, exit status, and bounded failure summary."],
        expectedReviewReadbackOutput: ["Sufficiency review tied to commitment id."],
        requiredEvidenceClaimDescriptions: [commitment.expectedEvidenceDescription],
        stopIfMissing: [
          "Stop before implementation if context scout cannot identify concrete target files.",
        ],
        downstreamConsumer: "runtime_work_graph_scheduler",
      })),
    },
  });
  return packets.map((packet) => ({ ...packet, qualityStatus: "accepted" }));
}

function noOpExecutor(role) {
  return {
    async execute(input) {
      return {
        status: "needs_review",
        outputArtifactRefs: [`artifact://${role}/${input.node.nodeId}/not-run-in-lane`],
        reasonCodes: ["lane_test_should_not_execute_implementation"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      };
    },
  };
}

async function main() {
  console.error("[model-facing-staged-scheduler] loading runtime modules");
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
  const { normalizeModelAuthoredCommitmentWorkPackets, validateCommitmentWorkPacketsForScheduler } =
    await tsImport(
      path.join(ROOT, "extensions/execution-platform/src/workflows/mission-work-packets.ts"),
      import.meta.url,
    );
  const { registerSchedulerRuntimeTools } = await tsImport(
    path.join(ROOT, "extensions/execution-platform/src/workflows/scheduler-runtime-tools.ts"),
    import.meta.url,
  );
  console.error("[model-facing-staged-scheduler] runtime modules loaded");
  await mkdir(ARTIFACT_ROOT, { recursive: true });
  const runId = `model-facing-staged-scheduler-${Date.now()}`;
  console.error("[model-facing-staged-scheduler] opening database runtime");
  const runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: true });
  console.error("[model-facing-staged-scheduler] database runtime opened");
  try {
    const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient);
    const workQueue = new WorkQueueRepository(runtime.sqlClient, runtimeJobs);
    const graphs = new RuntimeWorkGraphRepository(runtime.sqlClient);
    const traces = new RuntimeToolTraceRepository(runtime.sqlClient);
    const registry = new RuntimeToolRegistry();
    registerSchedulerRuntimeTools({ registry, includeWorkerInvoke: true });
    const kernel = new RuntimeToolKernel({ registry, traces });

    const queueItems = await workQueue.readWorkQueue(400);
    console.error("[model-facing-staged-scheduler] work queue read");
    if (!queueItems.some((item) => item.workItemId === WORK_ITEM_ID)) {
      await workQueue.createWorkItem({
        workItemId: WORK_ITEM_ID,
        itemType: "pre_product_spec_hardening",
        title: "Model-Facing Staged Scheduler Tool Protocol",
        description:
          "Replace broad graph-decision JSON with model-facing staged scheduler tools and runtime-owned graph compilation.",
        metadata: {
          source: "model_facing_staged_scheduler_proof_bootstrap",
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
        },
        actorId: "system:model-facing-staged-scheduler-proof",
      });
    }

    const job = await runtimeJobs.enqueueJob({
      jobId: runId,
      jobType: "proof.model_facing_staged_scheduler",
      queueName: "execution-platform-proof",
      workItemId: WORK_ITEM_ID,
      payload: {
        proofKind: "model_facing_staged_scheduler",
        workItemId: WORK_ITEM_ID,
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
      },
      idempotencyScope: "model-facing-staged-scheduler-proof",
      idempotencyKey: WORK_ITEM_ID,
      maxAttempts: 1,
    });

    const graphId = `${runId}-graph`;
    await graphs.createGraph({
      graphId,
      workflowId: "agent_team.coding",
      rootRuntimeJobId: job.jobId,
      orchestratorModelRef: "openai-codex/gpt-5.5",
      graphStatus: "running",
    });

    const ledger = buildLedger(normalizeMissionContractLedger);
    const packets = acceptedPackets(ledger, normalizeModelAuthoredCommitmentWorkPackets);
    const packetValidation = validateCommitmentWorkPacketsForScheduler({ packets, ledger });
    const progressEvents = [];
    const decisions = [
      {
        decisionId: "model-facing-staged-decomposition",
        decisionKind: "add_nodes",
        rationaleForDecision:
          "Compile the failed Product/Spec Planning ledger into staged work units before any implementation runs.",
        stagedScheduler: {
          workBreakdownUnits: [
            {
              workUnitId: "context-map",
              title: "Context map",
              objective:
                "Identify workflow registration, planning lifecycle, tests, and readback files.",
              commitmentIds: ["workflow-registration", "planning-lifecycle", "validation-readback"],
              rationale: "Every implementation node needs grounded repo refs before edits.",
              expectedOutcome: "Context handoff with file refs, risks, and validation commands.",
              targetRefs: ["extensions/execution-platform/src/workflows/"],
            },
            {
              workUnitId: "scoped-workflow-edit",
              title: "Scoped workflow edit",
              objective:
                "Make the smallest source edit that advances workflow registration or readback after context succeeds.",
              commitmentIds: ["workflow-registration", "planning-lifecycle"],
              rationale: "Cheaper scoped implementation should be considered before broad Codex.",
              expectedOutcome: "Changed-file refs mapped to commitments.",
              targetRefs: ["extensions/execution-platform/src/workflows/"],
            },
            {
              workUnitId: "validation-readback",
              title: "Validation and readback",
              objective: "Run focused validation and verify Work Queue/readback evidence.",
              commitmentIds: ["validation-readback"],
              rationale: "Final proof needs runtime validation and owner-visible evidence.",
              expectedOutcome: "Validation refs and readback refs.",
              targetRefs: ["extensions/execution-platform/src/work-queue/"],
            },
          ],
          capabilitySelectionsForWorkUnits: [
            {
              workUnitId: "context-map",
              selectedCapabilityId: "context_scout",
              consideredCapabilityIds: ["context_scout", "implementation_complex"],
              utilityRationale:
                "Context scout reduces uncertainty and creates reusable handoff evidence.",
              costRationale: "Context scout is cheaper than implementation.",
              whyThisIsNotDuplicateWork: "No context handoff exists for this ledger.",
              stopOrEscalationCondition: "Stop if no concrete files are found.",
            },
            {
              workUnitId: "scoped-workflow-edit",
              selectedCapabilityId: "implementation_microtask",
              consideredCapabilityIds: ["implementation_microtask", "implementation_complex"],
              utilityRationale:
                "The work unit is scoped and can try a cheaper implementation lane first.",
              costRationale: "Kimi/non-Codex implementation is cheaper than broad Codex.",
              whyThisIsNotDuplicateWork: "No implementation evidence exists.",
              stopOrEscalationCondition: "Escalate to Codex only after scoped edit cannot proceed.",
            },
            {
              workUnitId: "validation-readback",
              selectedCapabilityId: "validation_run",
              consideredCapabilityIds: ["validation_run", "implementation_complex"],
              utilityRationale: "Validation runner produces direct proof refs.",
              costRationale: "Runtime validation is cheaper than a model implementation call.",
              whyThisIsNotDuplicateWork: "No validation evidence exists.",
              stopOrEscalationCondition: "Return failures to orchestrator for repair.",
            },
          ],
          nodeContractDrafts: [
            {
              workUnitId: "context-map",
              roleRationale: "Downstream workers need file refs and integration risks.",
              objective:
                "Inspect workflow registration, scheduler, Work Queue, and Product/Spec surfaces.",
              inputRefs: packets.map((packet) => packet.packetRef),
              expectedOutput: "Bounded context handoff with target files and blockers.",
              successCriteria: ["Names concrete target files.", "Identifies validation commands."],
              downstreamConsumer: "implementation_engineer",
              targetRefs: ["extensions/execution-platform/src/workflows/"],
            },
            {
              workUnitId: "scoped-workflow-edit",
              roleRationale: "Implementation can only run after context succeeds.",
              objective:
                "Patch a bounded workflow registration/readback surface using context handoff.",
              inputRefs: ["runtime-node://context_scout-context-map"],
              expectedOutput: "Changed-file refs and evidence claims.",
              successCriteria: ["Produces source-change refs.", "Does not store raw logs."],
              downstreamConsumer: "test_engineer",
              targetRefs: ["extensions/execution-platform/src/workflows/"],
            },
            {
              workUnitId: "validation-readback",
              roleRationale: "Validation and owner readback close the proof commitment.",
              objective: "Run focused tests and verify readback refs.",
              inputRefs: ["runtime-node://implementation-scoped-workflow-edit"],
              expectedOutput: "Validation refs and Work Queue readback refs.",
              successCriteria: ["Records command refs.", "Maps evidence to commitments."],
              downstreamConsumer: "reviewer",
              targetRefs: ["extensions/execution-platform/src/work-queue/"],
            },
          ],
          edgeOrParallelismDraft: {
            edges: [
              {
                fromWorkUnitId: "context-map",
                toWorkUnitId: "scoped-workflow-edit",
                edgeKind: "handoff",
              },
              {
                fromWorkUnitId: "scoped-workflow-edit",
                toWorkUnitId: "validation-readback",
                edgeKind: "handoff",
              },
            ],
          },
        },
        runAfterAdd: false,
        reasonCodes: ["model_facing_staged_scheduler_lane"],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        workQueueLifecycleMutated: false,
      },
      {
        decisionId: "lane-stop-before-implementation",
        decisionKind: "mark_needs_review",
        rationaleForDecision:
          "The lane proof intentionally stops after graph acceptance to prove decomposition without running implementation.",
        reasonCodes: ["lane_stopped_before_implementation_by_design"],
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
      },
      onProgress: async (event) => {
        progressEvents.push(event);
      },
    });

    console.error("[model-facing-staged-scheduler] running scheduler lane");
    const result = await scheduler.run(graphId);
    console.error("[model-facing-staged-scheduler] scheduler lane completed");
    const snapshot = await graphs.readGraphSnapshot(graphId);
    const invocations = await traces.listInvocations({ graphId, limit: 200 });
    const toolIds = invocations.map((invocation) => invocation.toolId);
    const expectedToolIds = [
      "scheduler.draft_work_breakdown",
      "scheduler.review_work_breakdown",
      "scheduler.shortlist_capabilities_for_work_units",
      "scheduler.select_capability_for_work_unit",
      "scheduler.define_node_contract",
      "scheduler.define_edges_or_parallelism",
      "scheduler.compile_staged_runtime_graph",
      "scheduler.review_compiled_graph",
      "scheduler.accept_staged_graph",
    ];
    const accepted =
      result.status === "needs_review" &&
      result.addedNodeIds.length === 3 &&
      result.executedNodeIds.length === 0 &&
      packetValidation.valid &&
      expectedToolIds.every((toolId) => toolIds.includes(toolId)) &&
      (snapshot?.edges.length ?? 0) >= 2 &&
      (snapshot?.nodes ?? []).every((node) => {
        const metadata = node.metadata && typeof node.metadata === "object" ? node.metadata : {};
        return (
          metadata.stagedSchedulerProtocolCompiled === true &&
          Array.isArray(metadata.expectedEvidence) &&
          metadata.expectedEvidenceSource ===
            "runtime_derived_from_capability_manifest_and_mission_ledger"
        );
      });

    const proof = {
      artifactKind: "model_facing_staged_scheduler_proof",
      runId,
      workItemId: WORK_ITEM_ID,
      runtimeJobId: job.jobId,
      graphId,
      accepted,
      result,
      packetValidation,
      nodeCount: snapshot?.nodes.length ?? 0,
      edgeCount: snapshot?.edges.length ?? 0,
      toolIds,
      progressEventCount: progressEvents.length,
      firstProgressEvents: progressEvents.slice(0, 20).map((event) => ({
        stage: event.stage,
        status: event.status,
        schedulerToolId: event.schedulerToolId,
        schedulerPhase: event.schedulerPhase,
        currentObjective: event.currentObjective,
        nextDecisionNeeded: event.nextDecisionNeeded,
        blockerSummary: event.blockerSummary ?? null,
      })),
      nodes: (snapshot?.nodes ?? []).map((node) => ({
        nodeId: node.nodeId,
        nodeKind: node.nodeKind,
        assignedRole: node.assignedRole,
        nodeStatus: node.nodeStatus,
        capabilityId:
          node.metadata && typeof node.metadata === "object" ? node.metadata.capabilityId : null,
        expectedEvidenceSource:
          node.metadata && typeof node.metadata === "object"
            ? node.metadata.expectedEvidenceSource
            : null,
        expectedEvidence:
          node.metadata && typeof node.metadata === "object" ? node.metadata.expectedEvidence : [],
      })),
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    };
    const proofPath = await writeJson("model-facing-staged-scheduler-proof.json", proof);
    const summary = {
      artifactKind: "model_facing_staged_scheduler_summary",
      runId,
      workItemId: WORK_ITEM_ID,
      status: accepted ? "passed" : "needs_review",
      runtimeJobId: job.jobId,
      graphId,
      addedNodeIds: result.addedNodeIds,
      executedNodeIds: result.executedNodeIds,
      canonicalStagedToolIds: expectedToolIds,
      modelFacingProtocol: "stagedScheduler",
      runtimeOwnsExecutableSchema: true,
      runtimeDerivedEvidence: true,
      fullImplementationDeferred: "lane_intentionally_stopped_before_implementation",
      nextWorkItemId: "openclaw-convergence.pre-product-spec-03-mission-packet-graph-lane",
      proofPath,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    };
    const summaryPath = await writeJson("model-facing-staged-scheduler-summary.json", summary);
    const closeout = await workQueue.completeWorkQueueItemFromCloseout({
      workItemId: WORK_ITEM_ID,
      runtimeJobId: job.jobId,
      closeoutRef: `closeout://${runId}/model-facing-staged-scheduler`,
      closeoutHash: `sha256:${sha256(summary)}`,
      validationRef: proofPath,
      graphRef: `runtime-work-graph://${graphId}`,
      ownerReadbackRef: summaryPath,
      artifactRefs: [proofPath, summaryPath],
      accepted,
      validationRequired: true,
      sourceEditRequired: false,
      actorId: "system:model-facing-staged-scheduler-proof",
      reasonCodes: [
        "model_facing_staged_scheduler_protocol_accepted",
        "runtime_derived_graph_schema_required",
        "failed_ledger_lane_stopped_before_implementation",
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
    const index = {
      artifactKind: "model_facing_staged_scheduler_artifact_index",
      runId,
      workItemId: WORK_ITEM_ID,
      artifacts: [proofPath, summaryPath],
      closeout,
      rawPromptStored: false,
      rawResponseStored: false,
      rawLogsStored: false,
    };
    const indexPath = await writeJson("model-facing-staged-scheduler-artifact-index.json", index);
    console.log(JSON.stringify({ accepted, proofPath, summaryPath, indexPath, closeout }, null, 2));
    if (!accepted) {
      process.exitCode = 1;
    }
  } finally {
    await runtime.pool.end();
  }
}

await main();
