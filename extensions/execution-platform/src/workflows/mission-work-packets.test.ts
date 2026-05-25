import { describe, expect, it } from "vitest";
import { createContextSnapshotRef } from "./context-snapshot.ts";
import type { MissionContractLedger } from "./mission-contract-ledger.ts";
import {
  applyCommitmentPacketQualityReview,
  buildCommitmentPacketFanoutDiagnosticsArtifact,
  buildContextHandoffPacket,
  buildImplementationTaskPacket,
  compileCommitmentWorkPackets,
  normalizeCommitmentPacketQualityReview,
  normalizeModelAuthoredCommitmentWorkPackets,
  summarizeCommitmentPacketFanoutForProgress,
  summarizeCommitmentPacketQualityReviewForArtifact,
  summarizeCommitmentWorkPacketsForArtifact,
  summarizeCommitmentWorkPacketsForProgress,
  validateCommitmentWorkPacketsForScheduler,
  validateImplementationTaskPacketForWorker,
} from "./mission-work-packets.ts";
import { compilePostContextImplementationTaskPackets } from "./post-context-implementation-task-compiler.ts";

const workflowIndexSnapshot = {
  fileRef: "extensions/execution-platform/src/workflows/index.ts",
  snapshotRef: "repo-snapshot://workflow-index",
  contentHash: "sha256:workflow-index",
  byteCount: 420,
  sourceKind: "repo_file" as const,
  freshnessStatus: "fresh" as const,
  rawContentStored: false as const,
};

function ledger(): MissionContractLedger {
  return {
    artifactKind: "mission_contract_ledger",
    schemaVersion: "execution-platform.mission-contract-ledger.v1",
    missionId: "mission-product-spec",
    sourceRuntimeJobId: "runtime-1",
    sourceWorkItemId: "work-1",
    ownerObjectiveSummary:
      "Implement Product/Spec Planning as a scheduler-backed workflow with research, planning capsule, compile, readback, and closeout.",
    blockingCommitments: [
      {
        commitmentId: "planning-workflow",
        commitmentText: "Wire Product/Spec Planning into the workflow registry and scheduler.",
        whyItMatters: "The owner needs a real workflow, not a proof runner.",
        expectedEvidenceDescription:
          "Source edits, focused tests, Work Queue readback, and model-authored closeout evidence.",
        acceptedEvidenceRefs: [],
        rejectedEvidenceRefs: [],
        status: "pending",
        rationale: null,
        remainingWork: ["Add workflow registration", "Add scheduler executor coverage"],
        blocking: true,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    ],
    nonBlockingCommitments: [],
    explicitNonGoals: ["Do not deploy or send outbound messages."],
    safetyConstraints: [
      {
        constraintId: "bounded-storage",
        constraintText: "Store bounded refs and summaries only.",
        boundaryKind: "storage",
        enforcementOwner: "runtime_policy",
        evidenceRefs: [],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    ],
    prohibitedDirectiveCandidates: [],
    authorityBoundary: {
      requestedAuthority: "code_edit",
      maximumAuthority: "repo_edit",
      requiresApproval: false,
      approvalRefs: [],
      authorityRefs: [],
      rawPromptStored: false,
      rawResponseStored: false,
    },
    storagePolicy: {
      rawPromptStorageAllowed: false,
      rawResponseStorageAllowed: false,
      rawTranscriptStorageAllowed: false,
      rawProviderLogStorageAllowed: false,
      rawToolLogStorageAllowed: false,
      rawDbRowStorageAllowed: false,
      secretsStorageAllowed: false,
      boundedRefsOnly: true,
    },
    lifecycleBoundary: {
      workQueueLifecycleMutationAllowed: false,
      authorityGrantAllowed: false,
      deployAllowed: false,
      outboundSendAllowed: false,
      modelPromotionAllowed: false,
      runtimeJobLifecycleOwner: "runtime_jobs",
    },
    missionGate: "clear_to_execute",
    missionGateRationale: null,
    revisionProposals: [],
    ledgerStatus: "pending",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  };
}

describe("mission work packets", () => {
  it("compiles Mission Ledger commitments into child-ready work packets without raw storage", () => {
    const [packet] = compileCommitmentWorkPackets({
      ledger: ledger(),
      likelyRepoAreasByCommitmentId: {
        "planning-workflow": ["extensions/execution-platform/src/workflows/"],
      },
    });

    expect(packet).toMatchObject({
      packetKind: "commitment_work_packet",
      commitmentId: "planning-workflow",
      authoringSource: "deterministic_fallback",
      qualityStatus: "unreviewed",
      expectedEvidenceKinds: ["mission_commitment_evidence"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
    expect(packet?.acceptanceCriteria.join(" ")).toContain("Product/Spec Planning");
    expect(packet?.likelyRepoAreas).toEqual(["extensions/execution-platform/src/workflows/"]);
    expect(packet?.allowedContextRequestHints.join(" ")).toContain("bounded original-prompt");
    expect(packet?.stopIfMissing.join(" ")).toContain("Stop before implementation");
    expect(packet?.requiredEvidenceClaimDescriptions.join(" ")).toContain("Source edits");
    expect(
      validateCommitmentWorkPacketsForScheduler({ packets: [packet!], ledger: ledger() }).valid,
    ).toBe(false);
  });

  it("accepts model-authored packets only after model quality review", () => {
    const authored = normalizeModelAuthoredCommitmentWorkPackets({
      ledger: ledger(),
      value: {
        commitmentWorkPackets: [
          {
            commitmentId: "planning-workflow",
            commitmentMeaning:
              "Product/Spec Planning must become a production workflow surface instead of proof-only code.",
            ownerIntentSummary:
              "Owner wants Product/Spec Planning as a production scheduler-backed workflow.",
            whyItMatters: "It is the near-term proof item for planning workflows.",
            workerObjective:
              "Implement the Product/Spec Planning workflow registry, scheduler plugin, readback, tests, and closeout wiring.",
            contextScoutObjective:
              "Find workflow registry, scheduler plugin, Work Queue readback, and planning capsule surfaces.",
            implementationObjective:
              "Wire Product/Spec Planning through scheduler-backed workflow execution and remove generic runner fallback.",
            validationObjective:
              "Run focused workflow registry, scheduler, readback, and planning capsule tests.",
            reviewObjective:
              "Review source edits, tests, Work Queue readback, and closeout against the owner prompt.",
            expectedEvidenceDescriptions: [
              "Source edits, focused tests, readback artifact refs, and model-authored closeout.",
            ],
            expectedEvidenceKinds: ["source_change", "test_validation", "readback", "closeout"],
            acceptanceCriteria: [
              "Product/Spec Planning is registered as a canonical workflow.",
              "Scheduler-backed execution replaces generic queued success.",
            ],
            remainingWork: ["Add workflow plugin", "Add focused tests"],
            relevantConstraints: ["No deploy or outbound send"],
            explicitNonGoals: ["No proof-only runner success"],
            likelyRepoAreas: [
              "extensions/execution-platform/src/workflows/",
              "extensions/execution-platform/src/work-queue/",
            ],
            requiredContextQuestions: [
              "Which registry files define canonical workflow plugins?",
              "Which Work Queue readback code surfaces workflow graph state?",
            ],
            allowedContextRequestHints: [
              "Request bounded owner-prompt excerpts if workflow mode or proof gates are ambiguous.",
            ],
            expectedContextScoutOutput: ["Verified file refs and implementation constraints."],
            expectedImplementationOutput: ["Source edits to workflow and readback files."],
            expectedValidationOutput: ["Focused test refs and status."],
            expectedReviewReadbackOutput: ["Human-readable readback and closeout evidence."],
            requiredEvidenceClaimDescriptions: [
              "Evidence must map source edits, tests, and readback to the workflow-production commitment.",
            ],
            stopIfMissing: [
              "Stop before implementation if no workflow registry or scheduler files are verified.",
            ],
            uncertaintiesAndRisks: ["Avoid generic runner fallback."],
            downstreamConsumer: "runtime_work_graph_scheduler",
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        ],
      },
    });
    expect(
      validateCommitmentWorkPacketsForScheduler({ packets: authored, ledger: ledger() }).valid,
    ).toBe(false);

    const review = normalizeCommitmentPacketQualityReview({
      missionId: ledger().missionId,
      packets: authored,
      value: {
        status: "accepted",
        packetReviews: [
          {
            commitmentId: "planning-workflow",
            status: "accepted",
            specificEnoughForContextScout: true,
            specificEnoughForImplementation: true,
            specificEnoughForValidation: true,
            specificEnoughForReview: true,
            preservesOwnerIntent: true,
            blockingRepairRequired: false,
            missingInformation: [],
            repairInstructions: [],
          },
        ],
        reviewerSummary: "Packet is worker-ready.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    const accepted = applyCommitmentPacketQualityReview({ packets: authored, review });
    const validation = validateCommitmentWorkPacketsForScheduler({
      packets: accepted,
      ledger: ledger(),
    });
    expect(validation).toEqual({ valid: true, reasonCodes: [] });
    expect(accepted[0]?.authoringSource).toBe("model_authored");
    expect(accepted[0]?.qualityStatus).toBe("accepted");
    expect(accepted[0]?.packetQualityReviewRefs[0]).toContain(
      "runtime-work-graph://commitment-packet-quality-review",
    );
  });

  it("requires fresh context snapshots before implementation workers are ready", () => {
    const freshContext = createContextSnapshotRef({
      sourceRef: "runtime-job://job/context-synthesis/synthesis-1",
      sourceKind: "context_synthesis",
      sourcePromptHash: "prompt-a",
      commitmentIds: ["planning-workflow"],
      scopeSummary: "Accepted context synthesis for the implementation task.",
    });
    const packet = buildImplementationTaskPacket({
      exactEditObjective: "Edit the workflow registry.",
      taskSummary: "Use the accepted context synthesis and bounded target file.",
      targetCommitmentIds: ["planning-workflow"],
      targetFileRefs: ["extensions/execution-platform/src/workflows/index.ts"],
      targetFileSnapshots: [workflowIndexSnapshot],
      allowedFileRefs: ["extensions/execution-platform/src/workflows/index.ts"],
      contextSynthesisRefs: ["runtime-job://job/context-synthesis/synthesis-1"],
      validationCommandRefs: [
        "pnpm test:file extensions/execution-platform/src/workflows/index.test.ts",
      ],
      requiredContextSnapshotRefs: [freshContext],
      providedContextSnapshotRefs: [freshContext],
    });

    expect(validateImplementationTaskPacketForWorker(packet)).toMatchObject({
      valid: true,
      status: "ready",
    });

    const staleContext = {
      ...freshContext,
      freshnessStatus: "stale" as const,
      refreshRequired: true,
      refreshAction: "rerun_context_synthesis" as const,
      reasonCodes: ["context_snapshot_stale"],
    };
    const stalePacket = buildImplementationTaskPacket({
      exactEditObjective: "Edit the workflow registry.",
      taskSummary: "Use the accepted context synthesis and bounded target file.",
      targetCommitmentIds: ["planning-workflow"],
      targetFileRefs: ["extensions/execution-platform/src/workflows/index.ts"],
      targetFileSnapshots: [workflowIndexSnapshot],
      allowedFileRefs: ["extensions/execution-platform/src/workflows/index.ts"],
      contextSynthesisRefs: ["runtime-job://job/context-synthesis/synthesis-1"],
      validationCommandRefs: [
        "pnpm test:file extensions/execution-platform/src/workflows/index.test.ts",
      ],
      requiredContextSnapshotRefs: [staleContext],
      providedContextSnapshotRefs: [staleContext],
    });

    const validation = validateImplementationTaskPacketForWorker(stalePacket);
    expect(validation.status).toBe("needs_context");
    expect(validation.reasonCodes).toContain("implementation_task_packet_context_stale");
  });

  it("does not force a repair call for nonblocking packet review notes", () => {
    const authored = normalizeModelAuthoredCommitmentWorkPackets({
      ledger: ledger(),
      value: {
        commitmentWorkPackets: [
          {
            commitmentId: "planning-workflow",
            commitmentMeaning:
              "Product/Spec Planning must become a production workflow surface instead of proof-only code.",
            workerObjective:
              "Implement workflow registry, scheduler plugin, readback, tests, and closeout wiring.",
            contextScoutObjective:
              "Find workflow registry, scheduler plugin, Work Queue readback, and planning capsule surfaces.",
            implementationObjective:
              "Wire Product/Spec Planning through scheduler-backed workflow execution.",
            validationObjective: "Run focused workflow registry, scheduler, and readback tests.",
            reviewObjective:
              "Review source edits, tests, readback, and closeout against the prompt.",
            acceptanceCriteria: ["Product/Spec Planning is registered as a canonical workflow."],
            likelyRepoAreas: ["extensions/execution-platform/src/workflows/"],
            requiredContextQuestions: ["Which registry files define canonical workflow plugins?"],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        ],
      },
    });
    const review = normalizeCommitmentPacketQualityReview({
      missionId: ledger().missionId,
      packets: authored,
      value: {
        status: "needs_repair",
        packetReviews: [
          {
            commitmentId: "planning-workflow",
            status: "needs_repair",
            specificEnoughForContextScout: true,
            specificEnoughForImplementation: true,
            specificEnoughForValidation: true,
            specificEnoughForReview: true,
            preservesOwnerIntent: true,
            blockingRepairRequired: false,
            missingInformation: ["Context scout should verify exact registry file names."],
            repairInstructions: ["No blocking packet rewrite needed."],
          },
        ],
        reviewerSummary:
          "Packet is actionable; exact file names can be discovered by context scout.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });

    const accepted = applyCommitmentPacketQualityReview({ packets: authored, review });

    expect(review.status).toBe("needs_review_nonblocking");
    expect(accepted[0]?.qualityStatus).toBe("accepted_with_limitations");
    expect(
      validateCommitmentWorkPacketsForScheduler({ packets: accepted, ledger: ledger() }).valid,
    ).toBe(true);
  });

  it("does not treat an omitted blockingRepairRequired field as blocking when readiness flags pass", () => {
    const authored = normalizeModelAuthoredCommitmentWorkPackets({
      ledger: ledger(),
      value: {
        commitmentWorkPackets: [
          {
            commitmentId: "planning-workflow",
            commitmentMeaning:
              "Product/Spec Planning must become a production workflow surface instead of proof-only code.",
            workerObjective:
              "Implement workflow registry, scheduler plugin, readback, tests, and closeout wiring.",
            contextScoutObjective:
              "Find workflow registry, scheduler plugin, Work Queue readback, and planning capsule surfaces.",
            implementationObjective:
              "Wire Product/Spec Planning through scheduler-backed workflow execution.",
            validationObjective: "Run focused workflow registry, scheduler, and readback tests.",
            reviewObjective:
              "Review source edits, tests, readback, and closeout against the prompt.",
            acceptanceCriteria: ["Product/Spec Planning is registered as a canonical workflow."],
            likelyRepoAreas: ["extensions/execution-platform/src/workflows/"],
            requiredContextQuestions: ["Which registry files define canonical workflow plugins?"],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        ],
      },
    });
    const review = normalizeCommitmentPacketQualityReview({
      missionId: ledger().missionId,
      packets: authored,
      value: {
        status: "needs_repair",
        packetReviews: [
          {
            commitmentId: "planning-workflow",
            status: "needs_repair",
            specificEnoughForContextScout: true,
            specificEnoughForImplementation: true,
            specificEnoughForValidation: true,
            specificEnoughForReview: true,
            preservesOwnerIntent: true,
            missingInformation: ["Exact test file can be discovered by context scout."],
            repairInstructions: ["Proceed without blocking packet rewrite."],
          },
        ],
        reviewerSummary:
          "Packet is good enough to start; remaining detail is normal context-scout work.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    const accepted = applyCommitmentPacketQualityReview({ packets: authored, review });

    expect(review.status).toBe("needs_review_nonblocking");
    expect(review.packetReviews[0]?.blockingRepairRequired).toBe(false);
    expect(accepted[0]?.qualityStatus).toBe("accepted_with_limitations");
    expect(
      validateCommitmentWorkPacketsForScheduler({ packets: accepted, ledger: ledger() }).valid,
    ).toBe(true);
  });

  it("still blocks repair when omitted blockingRepairRequired has failing readiness flags", () => {
    const authored = normalizeModelAuthoredCommitmentWorkPackets({
      ledger: ledger(),
      value: {
        commitmentWorkPackets: [
          {
            commitmentId: "planning-workflow",
            commitmentMeaning:
              "Product/Spec Planning must become a production workflow surface instead of proof-only code.",
            workerObjective:
              "Implement workflow registry, scheduler plugin, readback, tests, and closeout wiring.",
            contextScoutObjective:
              "Find workflow registry, scheduler plugin, Work Queue readback, and planning capsule surfaces.",
            implementationObjective:
              "Wire Product/Spec Planning through scheduler-backed workflow execution.",
            validationObjective: "Run focused workflow registry, scheduler, and readback tests.",
            reviewObjective:
              "Review source edits, tests, readback, and closeout against the prompt.",
            acceptanceCriteria: ["Product/Spec Planning is registered as a canonical workflow."],
            likelyRepoAreas: ["extensions/execution-platform/src/workflows/"],
            requiredContextQuestions: ["Which registry files define canonical workflow plugins?"],
            rawPromptStored: false,
            rawResponseStored: false,
            rawProviderLogStored: false,
          },
        ],
      },
    });
    const review = normalizeCommitmentPacketQualityReview({
      missionId: ledger().missionId,
      packets: authored,
      value: {
        status: "needs_repair",
        packetReviews: [
          {
            commitmentId: "planning-workflow",
            status: "needs_repair",
            specificEnoughForContextScout: false,
            specificEnoughForImplementation: true,
            specificEnoughForValidation: true,
            specificEnoughForReview: true,
            preservesOwnerIntent: true,
            missingInformation: ["No context scout objective was actionable."],
            repairInstructions: ["Add concrete context scout questions and stop conditions."],
          },
        ],
        reviewerSummary: "Packet needs blocking repair before context scout can start.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    const reviewed = applyCommitmentPacketQualityReview({ packets: authored, review });

    expect(review.status).toBe("needs_repair_blocking");
    expect(review.packetReviews[0]?.blockingRepairRequired).toBe(true);
    expect(reviewed[0]?.qualityStatus).toBe("needs_review");
    expect(
      validateCommitmentWorkPacketsForScheduler({ packets: reviewed, ledger: ledger() }).valid,
    ).toBe(false);
  });

  it("accepts a single direct model-authored packet object as a structural alias", () => {
    const [authored] = normalizeModelAuthoredCommitmentWorkPackets({
      ledger: ledger(),
      value: {
        commitmentId: "planning-workflow",
        commitmentMeaning:
          "Product/Spec Planning must become a production workflow surface instead of proof-only code.",
        workerObjective:
          "Implement workflow registry, scheduler plugin, readback, tests, and closeout wiring.",
        contextScoutObjective:
          "Find workflow registry, scheduler plugin, Work Queue readback, and planning capsule surfaces.",
        implementationObjective:
          "Wire Product/Spec Planning through scheduler-backed workflow execution.",
        validationObjective: "Run focused workflow registry, scheduler, and readback tests.",
        reviewObjective: "Review source edits, tests, readback, and closeout against the prompt.",
        acceptanceCriteria: [
          "Product/Spec Planning is registered as a canonical workflow.",
          "Scheduler-backed execution replaces generic queued success.",
        ],
        likelyRepoAreas: ["extensions/execution-platform/src/workflows/"],
        requiredContextQuestions: ["Which registry files define canonical workflow plugins?"],
        expectedContextScoutOutput: ["Verified file refs and implementation constraints."],
        expectedImplementationOutput: ["Source edits to workflow and readback files."],
        expectedValidationOutput: ["Focused test refs and status."],
        expectedReviewReadbackOutput: ["Human-readable readback and closeout evidence."],
        requiredEvidenceClaimDescriptions: [
          "Evidence must map source edits, tests, and readback to the workflow-production commitment.",
        ],
        stopIfMissing: ["Stop if no workflow registry or scheduler files are verified."],
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });

    expect(authored).toMatchObject({
      commitmentId: "planning-workflow",
      authoringSource: "model_authored",
      downstreamConsumer: "runtime_work_graph_scheduler",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
  });

  it("normalizes scalar model-authored list fields as one-item lists", () => {
    const [authored] = normalizeModelAuthoredCommitmentWorkPackets({
      ledger: ledger(),
      value: {
        commitmentId: "planning-workflow",
        commitmentMeaning:
          "Product/Spec Planning must become a production workflow surface instead of proof-only code.",
        workerObjective:
          "Implement workflow registry, scheduler plugin, readback, tests, and closeout wiring.",
        contextScoutObjective:
          "Find workflow registry, scheduler plugin, Work Queue readback, and planning capsule surfaces.",
        implementationObjective:
          "Wire Product/Spec Planning through scheduler-backed workflow execution.",
        validationObjective: "Run focused workflow registry, scheduler, and readback tests.",
        reviewObjective: "Review source edits, tests, readback, and closeout against the prompt.",
        acceptanceCriteria: "Product/Spec Planning is registered as a canonical workflow.",
        requiredContextQuestions: "Which registry files define canonical workflow plugins?",
        expectedContextScoutOutput: "Verified file refs and implementation constraints.",
        expectedImplementationOutput: "Source edits to workflow and readback files.",
        expectedValidationOutput: "Focused test refs and status.",
        requiredEvidenceClaimDescriptions:
          "Evidence must map source edits, tests, and readback to the workflow-production commitment.",
        stopIfMissing: "Stop if no workflow registry or scheduler files are verified.",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });

    expect(authored?.acceptanceCriteria).toEqual([
      "Product/Spec Planning is registered as a canonical workflow.",
    ]);
    expect(authored?.expectedImplementationOutput).toEqual([
      "Source edits to workflow and readback files.",
    ]);
    expect(authored?.expectedValidationOutput).toEqual(["Focused test refs and status."]);
  });

  it("builds context handoff and implementation packets with exact targets and criteria", () => {
    const context = buildContextHandoffPacket({
      sourceNodeId: "context-1",
      targetCommitmentIds: ["planning-workflow"],
      relevantFileRefs: ["extensions/execution-platform/src/workflows/index.ts"],
      recommendedEditPoints: ["Register product/spec planning workflow plugin."],
      existingPatterns: ["Scheduler-backed workflow plugins use WorkflowDefinition."],
      risks: ["Avoid generic queued runner fallback."],
      validationSuggestions: ["pnpm test:file workflow-definition-registry.test.ts"],
      handoffSummaryForImplementation:
        "Product/Spec Planning needs first-class scheduler plugin registration.",
    });
    const implementation = buildImplementationTaskPacket({
      microtaskId: "impl-1",
      microtaskTitle: "Register planning workflow",
      exactEditObjective: "Add Product/Spec Planning workflow registration.",
      taskSummary: "Use the context handoff to wire the workflow into the registry.",
      whyThisWorkerWasSelected:
        "Kimi is the cheapest sufficiently capable lane for this scoped registry edit.",
      expectedOutput: "Changed-file refs, validation refs, and evidence claims.",
      targetCommitmentIds: ["planning-workflow"],
      targetFileRefs: ["extensions/execution-platform/src/workflows/index.ts"],
      targetFileSnapshots: [workflowIndexSnapshot],
      allowedFileRefs: ["extensions/execution-platform/src/workflows/index.ts"],
      deniedFileRefs: ["extensions/execution-platform/src/workflows/legacy-runner.ts"],
      contextPacketRefs: [context.packetRef],
      sourcePromptExcerptRefs: ["source-prompt://runtime-1/section/requirements"],
      contextSynthesisRefs: ["context-synthesis://runtime-1/synthesis"],
      priorNodeOutputRefs: ["runtime-work-graph://node/context-1/generic-node-result"],
      validationCommandRefs: ["pnpm test:file workflow-definition-registry.test.ts"],
      acceptanceCriteria: ["Workflow is registered", "No fallback runner path"],
      expectedEvidenceClaimKinds: ["source_change", "test_validation"],
      stopIfMissingOrEscalate: [
        "Request bounded context if registry target refs are not enough.",
        "Escalate after bounded repair if the edit exceeds scoped Kimi limits.",
      ],
      budgetPolicyRefs: [
        "runtime-task-budget://agent_team.coding/implementation_microtask/standard",
      ],
    });

    expect(context.packetRef).toContain("runtime-work-graph://context-handoff-packet/");
    expect(implementation.contextPacketRefs).toEqual([context.packetRef]);
    expect(implementation.whyThisWorkerWasSelected).toContain("cheapest sufficiently capable");
    expect(implementation.deniedFileRefs).toEqual([
      "extensions/execution-platform/src/workflows/legacy-runner.ts",
    ]);
    expect(implementation.sourcePromptExcerptRefs).toEqual([
      "source-prompt://runtime-1/section/requirements",
    ]);
    expect(implementation.contextSynthesisRefs).toEqual([
      "context-synthesis://runtime-1/synthesis",
    ]);
    expect(implementation.expectedEvidenceClaimKinds).toEqual(["source_change", "test_validation"]);
    expect(implementation.targetFileRefs).toEqual([
      "extensions/execution-platform/src/workflows/index.ts",
    ]);
    expect(implementation.rawPromptStored).toBe(false);
    expect(implementation.rawToolLogStored).toBe(false);
    expect(validateImplementationTaskPacketForWorker(implementation)).toMatchObject({
      valid: true,
      status: "ready",
      reasonCodes: [],
    });
  });

  it("classifies implementation task packets before invoking non-Codex workers", () => {
    const noContext = buildImplementationTaskPacket({
      microtaskId: "impl-no-context",
      exactEditObjective: "Add a bounded helper.",
      taskSummary: "Scoped implementation task.",
      targetFileRefs: ["extensions/execution-platform/src/workflows/index.ts"],
      allowedFileRefs: ["extensions/execution-platform/src/workflows/index.ts"],
      acceptanceCriteria: ["helper exists"],
    });
    expect(validateImplementationTaskPacketForWorker(noContext)).toMatchObject({
      valid: true,
      status: "needs_context",
      reasonCodes: expect.arrayContaining([
        "implementation_task_packet_validation_refs_missing",
        "implementation_task_packet_commitment_mapping_missing",
        "implementation_task_packet_target_snapshot_missing",
        "implementation_task_packet_target_snapshots_or_new_file_intent_missing",
        "implementation_task_packet_context_request_required",
      ]),
    });

    const missingScope = {
      ...buildImplementationTaskPacket({
        microtaskId: "impl-missing-scope",
        exactEditObjective: "Add a bounded helper.",
        taskSummary: "Scoped implementation task.",
        allowedFileRefs: [],
        acceptanceCriteria: ["helper exists"],
      }),
      exactEditObjective: "",
      acceptanceCriteria: [],
    };
    expect(validateImplementationTaskPacketForWorker(missingScope)).toMatchObject({
      valid: false,
      status: "invalid",
      reasonCodes: expect.arrayContaining([
        "implementation_task_packet_objective_missing",
        "implementation_task_packet_target_scope_missing",
        "implementation_task_packet_acceptance_criteria_missing",
      ]),
    });
  });

  it("blocks read-only implementation packets before file-edit worker invocation", () => {
    const readOnly = buildImplementationTaskPacket({
      microtaskId: "impl-read-only",
      executionIntent: "source_grounding",
      evidenceMode: ["read_only_evidence"],
      exactEditObjective: "Inspect workflow files and produce bounded grounding notes.",
      taskSummary: "This is evidence-gathering work and must not enter the file-edit lane.",
      targetCommitmentIds: ["planning-workflow"],
      targetFileRefs: ["extensions/execution-platform/src/workflows/index.ts"],
      targetFileSnapshots: [workflowIndexSnapshot],
      allowedFileRefs: ["extensions/execution-platform/src/workflows/index.ts"],
      contextPacketRefs: ["context-handoff://impl-read-only"],
      sourceContextHandoffRefs: ["context-handoff://impl-read-only"],
      validationCommandRefs: ["pnpm test:file workflow-definition-registry.test.ts"],
      acceptanceCriteria: ["Grounding notes identify source surfaces."],
      evidenceClaimExpectations: ["Read-only evidence supports later implementation."],
    });

    expect(validateImplementationTaskPacketForWorker(readOnly)).toMatchObject({
      valid: false,
      status: "invalid",
      reasonCodes: expect.arrayContaining([
        "implementation_task_packet_execution_intent_not_source_edit",
        "implementation_task_packet_changed_file_evidence_mode_missing",
      ]),
    });
  });

  it("compiles post-context implementation task packets from concrete file snapshots", () => {
    const result = compilePostContextImplementationTaskPackets({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "impl-1",
      workUnitId: "work-unit-1",
      nodeTitle: "Register workflow",
      executionIntent: "source_edit",
      evidenceMode: ["changed_file_evidence", "validation_evidence"],
      exactEditObjective: "Register Product/Spec Planning in the workflow registry.",
      taskSummary:
        "Use accepted context handoff and concrete file snapshot to perform the registry edit.",
      targetCommitmentIds: ["planning-workflow"],
      targetFileRefs: ["extensions/execution-platform/src/workflows/index.ts"],
      readableFileRefs: ["extensions/execution-platform/src/workflows/index.ts"],
      missingFileRefs: [],
      targetFileSnapshots: [workflowIndexSnapshot],
      allowedFileRefs: ["extensions/execution-platform/src/workflows/index.ts"],
      contextPacketRefs: ["runtime-work-graph://context-handoff-packet/context-1"],
      sourcePromptExcerptRefs: ["source-prompt://runtime-1/section/requirements"],
      contextSynthesisRefs: ["context-synthesis://runtime-1/synthesis"],
      priorNodeOutputRefs: ["runtime-work-graph://node/context-1/generic-node-result"],
      validationCommandRefs: ["pnpm test:file workflow-definition-registry.test.ts"],
      acceptanceCriteria: ["Workflow is registered", "No fallback runner path"],
    });

    expect(result.status).toBe("accepted");
    expect(result.packets).toHaveLength(1);
    expect(result.packets[0]).toMatchObject({
      schemaVersion: "execution-platform.implementation-task-packet.v3",
      targetFileSnapshots: [workflowIndexSnapshot],
      allowedEditScope: ["extensions/execution-platform/src/workflows/index.ts"],
      mustReadRefs: ["extensions/execution-platform/src/workflows/index.ts"],
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
    expect(validateImplementationTaskPacketForWorker(result.packets[0]!)).toMatchObject({
      valid: true,
      status: "ready",
    });
  });

  it("does not require file-change intent coverage for read-only context snapshots outside targetFileRefs", () => {
    const readOnlyContextSnapshot = {
      ...workflowIndexSnapshot,
      fileRef: "extensions/execution-platform/src/workflows/context-only.ts",
      snapshotRef: "repo-snapshot://context-only",
      contentHash: "sha256:context-only",
    };
    const result = compilePostContextImplementationTaskPackets({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "impl-read-context",
      workUnitId: "work-unit-1",
      nodeTitle: "Register workflow",
      executionIntent: "source_edit",
      evidenceMode: ["changed_file_evidence", "validation_evidence"],
      exactEditObjective: "Register Product/Spec Planning in the workflow registry.",
      taskSummary:
        "Use one editable target snapshot plus an additional read-only context snapshot.",
      targetCommitmentIds: ["planning-workflow"],
      targetFileRefs: ["extensions/execution-platform/src/workflows/index.ts"],
      readableFileRefs: [
        "extensions/execution-platform/src/workflows/index.ts",
        "extensions/execution-platform/src/workflows/context-only.ts",
      ],
      missingFileRefs: [],
      targetFileSnapshots: [workflowIndexSnapshot, readOnlyContextSnapshot],
      fileChangeIntents: [
        {
          fileRef: "extensions/execution-platform/src/workflows/index.ts",
          symbolOrRegion: "workflow registry",
          intendedChange: "Register the production Product/Spec workflow.",
          whyThisFile: "The workflow registry is the concrete editable target.",
        },
      ],
      allowedFileRefs: ["extensions/execution-platform/src/workflows/"],
      contextPacketRefs: ["runtime-work-graph://context-handoff-packet/context-1"],
      sourcePromptExcerptRefs: ["source-prompt://runtime-1/section/requirements"],
      contextSynthesisRefs: ["context-synthesis://runtime-1/synthesis"],
      priorNodeOutputRefs: ["runtime-work-graph://node/context-1/generic-node-result"],
      validationCommandRefs: ["pnpm test:file workflow-definition-registry.test.ts"],
      acceptanceCriteria: ["Workflow is registered"],
    });

    expect(result.status).toBe("accepted");
    expect(result.reasonCodes).not.toContain(
      "post_context_task_file_change_intent_coverage_missing",
    );
    expect(result.packets[0]?.targetFileRefs).toEqual([
      "extensions/execution-platform/src/workflows/index.ts",
    ]);
    expect(result.packets[0]?.targetFileSnapshots).toEqual([workflowIndexSnapshot]);
  });

  it("requires explicit source-edit execution intent before compiling implementation tasks", () => {
    const result = compilePostContextImplementationTaskPackets({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "impl-missing-intent",
      exactEditObjective: "Register Product/Spec Planning in the workflow registry.",
      taskSummary: "Attempt implementation without an execution intent from the scheduler.",
      targetCommitmentIds: ["planning-workflow"],
      targetFileRefs: ["extensions/execution-platform/src/workflows/index.ts"],
      readableFileRefs: ["extensions/execution-platform/src/workflows/index.ts"],
      missingFileRefs: [],
      targetFileSnapshots: [workflowIndexSnapshot],
      allowedFileRefs: ["extensions/execution-platform/src/workflows/index.ts"],
      contextPacketRefs: ["runtime-work-graph://context-handoff-packet/context-1"],
      sourcePromptExcerptRefs: [],
      contextSynthesisRefs: [],
      priorNodeOutputRefs: [],
      validationCommandRefs: ["pnpm test:file workflow-definition-registry.test.ts"],
      acceptanceCriteria: ["Workflow is registered"],
    });

    expect(result.status).toBe("context_repair_required");
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "post_context_task_execution_intent_missing",
        "post_context_task_changed_file_evidence_mode_missing",
      ]),
    );
    expect(result.packets).toEqual([]);
  });

  it("blocks implementation when post-context target snapshots are missing", () => {
    const result = compilePostContextImplementationTaskPackets({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "impl-1",
      executionIntent: "source_edit",
      evidenceMode: ["changed_file_evidence", "validation_evidence"],
      exactEditObjective: "Register Product/Spec Planning in the workflow registry.",
      taskSummary: "Attempt implementation without readable target snapshots.",
      targetCommitmentIds: ["planning-workflow"],
      targetFileRefs: ["extensions/execution-platform/src/workflows/index.ts"],
      readableFileRefs: [],
      missingFileRefs: ["extensions/execution-platform/src/workflows/index.ts"],
      targetFileSnapshots: [],
      allowedFileRefs: ["extensions/execution-platform/src/workflows/index.ts"],
      contextPacketRefs: ["runtime-work-graph://context-handoff-packet/context-1"],
      sourcePromptExcerptRefs: [],
      contextSynthesisRefs: [],
      priorNodeOutputRefs: [],
      validationCommandRefs: ["pnpm test:file workflow-definition-registry.test.ts"],
      acceptanceCriteria: ["Workflow is registered"],
    });

    expect(result.status).toBe("context_repair_required");
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "post_context_task_readable_file_snapshots_missing",
        "post_context_task_missing_target_refs_block_execution",
      ]),
    );
    expect(result.packets).toEqual([]);
  });

  it("requires scheduler split when one broad implementation node spans too many files", () => {
    const fileRefs = Array.from(
      { length: 7 },
      (_value, index) => `extensions/execution-platform/src/workflows/file-${index}.ts`,
    );
    const result = compilePostContextImplementationTaskPackets({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      nodeId: "impl-broad",
      executionIntent: "source_edit",
      evidenceMode: ["changed_file_evidence", "validation_evidence"],
      exactEditObjective: "Update several workflow files.",
      taskSummary: "The implementation group is too broad for one non-Codex worker node.",
      targetCommitmentIds: ["planning-workflow"],
      targetFileRefs: fileRefs,
      readableFileRefs: fileRefs,
      missingFileRefs: [],
      targetFileSnapshots: fileRefs.map((fileRef, index) => ({
        ...workflowIndexSnapshot,
        fileRef,
        snapshotRef: `repo-snapshot://file-${index}`,
        contentHash: `sha256:file-${index}`,
      })),
      fileChangeIntents: fileRefs.map((fileRef, index) => ({
        fileRef,
        symbolOrRegion: `file-${index} export`,
        intendedChange: `Apply the scoped workflow update for file ${index}.`,
        whyThisFile: "The context handoff identified this file as a concrete edit target.",
      })),
      allowedFileRefs: fileRefs,
      contextPacketRefs: ["runtime-work-graph://context-handoff-packet/context-1"],
      sourcePromptExcerptRefs: [],
      contextSynthesisRefs: [],
      priorNodeOutputRefs: [],
      validationCommandRefs: ["pnpm test:file workflow-definition-registry.test.ts"],
      acceptanceCriteria: ["Workflow files are updated"],
    });

    expect(result.status).toBe("split_required");
    expect(result.packets.length).toBeGreaterThan(1);
    expect(result.reasonCodes).toContain(
      "post_context_task_split_required_for_file_resolved_microtasks",
    );
  });

  it("keeps progress packet summaries bounded for large Mission Ledgers", () => {
    const acceptedPacket = compileCommitmentWorkPackets({ ledger: ledger() })[0]!;
    const packets = Array.from({ length: 17 }, (_value, index) => ({
      ...acceptedPacket,
      packetId: `packet-${index}`,
      packetRef: `runtime-work-graph://commitment-work-packet/packet-${index}`,
      commitmentId: `commitment-${index}`,
      commitmentMeaning: "Detailed commitment meaning. ".repeat(40),
      workerObjective: "Detailed worker objective. ".repeat(40),
      contextScoutObjective: "Detailed context scout objective. ".repeat(40),
      implementationObjective: "Detailed implementation objective. ".repeat(40),
      validationObjective: "Detailed validation objective. ".repeat(30),
      likelyRepoAreas: Array.from(
        { length: 12 },
        (_area, areaIndex) => `extensions/execution-platform/src/area-${areaIndex}`,
      ),
      requiredContextQuestions: Array.from(
        { length: 8 },
        (_question, questionIndex) => `Which files matter for question ${questionIndex}?`,
      ),
      stopIfMissing: Array.from(
        { length: 8 },
        (_stop, stopIndex) => `Stop if missing context ${stopIndex}.`,
      ),
    }));

    const progressSummary = summarizeCommitmentWorkPacketsForProgress(packets);
    const progressEncoded = JSON.stringify(progressSummary);
    const artifactSummary = summarizeCommitmentWorkPacketsForArtifact(packets);
    const artifactEncoded = JSON.stringify(artifactSummary);

    expect(progressEncoded.length).toBeLessThan(20_000);
    expect(artifactEncoded.length).toBeLessThan(64_000);
    expect(progressSummary).toMatchObject({
      packetCount: 17,
      truncated: true,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
    expect(artifactSummary).toMatchObject({
      packetCount: 17,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
  });

  it("keeps packet fanout progress manifest-only while diagnostics hydrate from payload", () => {
    const states = Array.from({ length: 50 }, (_value, index) => ({
      commitmentId: `commitment-${index}`,
      objective: "Detailed objective. ".repeat(20),
      status: index < 45 ? "completed" : index < 48 ? "running" : "failed",
      modelRef: "qwen/qwen3-coder-next",
      providerPath: "openrouter",
      profileRef: "openrouter.qwen.packet-author",
      reasonCodes: index >= 48 ? ["openrouter_no_content"] : [],
      latestDiagnostics: {
        latencyMs: index >= 48 ? 150_000 : 2_000,
        timeoutMs: 150_000,
        outputContentLength: index >= 48 ? 0 : 2_000,
        noContentDiagnostic:
          index >= 48
            ? {
                classifiedReason: "timeout_adjacent_empty_content",
                retryEligibility: "retry_same_bounded_input",
              }
            : null,
        inputBundleRef: `runtime-job://job/input/${index}`,
        inputBundleHash: `sha256:${index}`,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    }));

    const diagnostics = buildCommitmentPacketFanoutDiagnosticsArtifact({
      missionId: "mission-1",
      runtimeJobId: "job-1",
      generatedAt: "2026-05-23T00:00:00.000Z",
      states,
      profile: {
        modelRef: "qwen/qwen3-coder-next",
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });
    const manifest = summarizeCommitmentPacketFanoutForProgress({
      diagnostics,
      diagnosticArtifactRef: "runtime-job://job/packet-fanout/1",
      diagnosticArtifactHash: "sha256:fanout",
    }) as Record<string, unknown>;

    expect(JSON.stringify(manifest).length).toBeLessThan(6_000);
    expect(manifest).not.toHaveProperty("packetDiagnostics");
    expect(manifest).toMatchObject({
      totalCount: 50,
      completedCount: 45,
      failedCount: 2,
      longLatencyCount: 2,
      diagnosticArtifactRef: "runtime-job://job/packet-fanout/1",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
    expect(JSON.stringify(diagnostics)).toContain("packetDiagnostics");
  });

  it("keeps packet quality review artifacts bounded for large repair reviews", () => {
    const packet = compileCommitmentWorkPackets({ ledger: ledger() })[0]!;
    const review = normalizeCommitmentPacketQualityReview({
      missionId: ledger().missionId,
      packets: [packet],
      value: {
        status: "needs_repair_blocking",
        packetReviews: Array.from({ length: 40 }, (_value, index) => ({
          packetRef: `runtime-work-graph://commitment-work-packet/${index}`,
          commitmentId: "planning-workflow",
          status: "needs_repair_blocking",
          specificEnoughForContextScout: false,
          specificEnoughForImplementation: false,
          specificEnoughForValidation: false,
          specificEnoughForReview: false,
          preservesOwnerIntent: true,
          blockingRepairRequired: true,
          missingInformation: Array.from({ length: 8 }, () =>
            "Detailed missing information from quality review. ".repeat(20),
          ),
          repairInstructions: Array.from({ length: 8 }, () =>
            "Detailed repair instruction from quality review. ".repeat(20),
          ),
        })),
        reviewerSummary: "Detailed reviewer summary. ".repeat(100),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
      },
    });

    const artifactSummary = summarizeCommitmentPacketQualityReviewForArtifact(review);
    const artifactEncoded = JSON.stringify(artifactSummary);

    expect(artifactEncoded.length).toBeLessThan(64_000);
    expect(artifactSummary).toMatchObject({
      status: "needs_repair_blocking",
      packetReviewCount: 40,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
    });
  });

  it("keeps implementation packets out of worker-ready status when context refresh blocks implementation", () => {
    const missingContext = createContextSnapshotRef({
      sourceRef: "runtime-job://job/context-synthesis/missing",
      sourceKind: "context_synthesis",
      sourcePromptHash: "prompt-a",
      commitmentIds: ["planning-workflow"],
      scopeSummary: "Missing context synthesis for implementation.",
      freshnessStatus: "missing",
      refreshRequired: true,
      refreshAction: "block_implementation",
      reasonCodes: ["context_snapshot_missing"],
    });
    const packet = buildImplementationTaskPacket({
      runtimeJobId: "runtime-1",
      workflowId: "agent_team.coding",
      graphId: "graph-1",
      sourceGraphNodeId: "node-context-blocked",
      microtaskId: "node-context-blocked:task-1",
      exactEditObjective: "Do not run implementation with missing context snapshots.",
      taskSummary: "Context freshness is runtime-owned and must block execution when missing.",
      targetCommitmentIds: ["planning-workflow"],
      targetFileRefs: [workflowIndexSnapshot.fileRef],
      targetFileSnapshots: [workflowIndexSnapshot],
      allowedFileRefs: [workflowIndexSnapshot.fileRef],
      allowedEditScope: [workflowIndexSnapshot.fileRef],
      mustReadRefs: [workflowIndexSnapshot.fileRef],
      contextPacketRefs: ["context-handoff://node-context-blocked"],
      sourceContextHandoffRefs: ["context-handoff://node-context-blocked"],
      validationDiscoveryPlan: ["Run focused workflow registry tests."],
      acceptanceCriteria: ["Implementation must not start while context refresh blocks it."],
      evidenceClaimExpectations: ["Runtime blocks execution before edits."],
      requiredContextSnapshotRefs: [missingContext],
      providedContextSnapshotRefs: [missingContext],
    });

    const validation = validateImplementationTaskPacketForWorker(packet);

    expect(validation.status).toBe("needs_context");
    expect(validation.reasonCodes).toEqual(
      expect.arrayContaining([
        "implementation_task_packet_missing_context_snapshot_refs",
        "implementation_task_packet_context_refresh_action_block_implementation",
        "implementation_task_packet_context_missing",
      ]),
    );
  });

  it("normalizes legacy no-contract context snapshot sentinel without blocking execution", () => {
    const packet = {
      ...buildImplementationTaskPacket({
        runtimeJobId: "runtime-1",
        workflowId: "agent_team.coding",
        graphId: "graph-1",
        sourceGraphNodeId: "node-legacy-context-sentinel",
        microtaskId: "node-legacy-context-sentinel:task-1",
        exactEditObjective:
          "Run a packet whose legacy replay artifact has no context snapshot contract.",
        taskSummary:
          "Older checkpoint artifacts encoded absence of a context snapshot contract as a missing sentinel.",
        targetCommitmentIds: ["planning-workflow"],
        targetFileRefs: [workflowIndexSnapshot.fileRef],
        targetFileSnapshots: [workflowIndexSnapshot],
        allowedFileRefs: [workflowIndexSnapshot.fileRef],
        allowedEditScope: [workflowIndexSnapshot.fileRef],
        mustReadRefs: [workflowIndexSnapshot.fileRef],
        contextPacketRefs: ["context-handoff://node-legacy-context-sentinel"],
        sourceContextHandoffRefs: ["context-handoff://node-legacy-context-sentinel"],
        validationDiscoveryPlan: ["Run focused workflow registry tests."],
        acceptanceCriteria: ["Legacy no-contract sentinel must not become a false blocker."],
        evidenceClaimExpectations: ["Runtime normalized an old checkpoint version structurally."],
      }),
      missingContextSnapshotRefs: ["context-snapshot://missing/context"],
      contextFreshnessStatus: "missing" as const,
      contextRefreshAction: "block_implementation" as const,
    };

    const validation = validateImplementationTaskPacketForWorker(packet);

    expect(validation.status).toBe("ready");
    expect(validation.reasonCodes).toContain(
      "implementation_task_packet_legacy_context_snapshot_no_contract_normalized",
    );
    expect(validation.reasonCodes).not.toContain(
      "implementation_task_packet_missing_context_snapshot_refs",
    );
    expect(validation.reasonCodes).not.toContain(
      "implementation_task_packet_context_refresh_action_block_implementation",
    );
  });
});
