import { describe, expect, it } from "vitest";
import {
  buildContextSynthesisInputManifest,
  contextSynthesisGroupGuidanceArray,
  normalizeContextSynthesisArtifact,
  summarizeContextSynthesisForGraphCompile,
  summarizeContextSynthesisInputManifestForArtifact,
  summarizeContextSynthesisArtifact,
  validateContextSynthesisArtifact,
} from "./context-synthesis.ts";

describe("context synthesis artifact", () => {
  const freshSnapshotRef = {
    artifactKind: "context_snapshot_ref" as const,
    schemaVersion: "execution-platform.context-snapshot-ref.v1" as const,
    snapshotRef: "context-snapshot://job/context/workflow-registration",
    sourceRef: "runtime-job://job/context/workflow-registration",
    sourceKind: "context_scout_handoff" as const,
    capturedAt: "2026-05-18T00:00:00.000Z",
    repoRevision: "test-revision",
    worktreeFingerprint: "test-fingerprint",
    sourcePromptHash: "sha256:prompt",
    sourcePayloadHash: "sha256:payload",
    runtimeJobId: "job",
    workflowId: "agent_team.coding",
    graphId: "graph",
    nodeId: "context_scout-workflow-registration",
    commitmentIds: ["workflow-registration"],
    targetRefs: ["extensions/execution-platform/src/workflows/product-spec-planning-plugin.ts"],
    scopeSummary: "Fresh context scout handoff snapshot for synthesis.",
    stalenessPolicy: "bounded test fixture remains fresh",
    expiresAt: null,
    maxAgeMs: null,
    freshnessStatus: "fresh" as const,
    refreshRequired: false,
    refreshAction: "none" as const,
    reasonCodes: ["test_context_snapshot_fresh"],
    rawPromptStored: false as const,
    rawResponseStored: false as const,
    rawProviderLogStored: false as const,
    rawToolLogStored: false as const,
    rawDbRowsStored: false as const,
  };

  it("normalizes a worker-ready synthesis without storing raw model content", () => {
    const artifact = normalizeContextSynthesisArtifact({
      value: {
        implementationReadiness: "ready",
        commitmentCoverage: [
          {
            commitmentId: "workflow-registration",
            covered: true,
            groupIds: ["runtime-workflow"],
            contextHandoffRefs: ["runtime-job://job/context/workflow-registration"],
          },
          {
            commitmentId: "readback-proof",
            covered: true,
            groupIds: ["runtime-workflow"],
            contextHandoffRefs: ["runtime-job://job/context/readback-proof"],
          },
        ],
        recommendedImplementationGroups: [
          {
            groupId: "runtime-workflow",
            title: "Runtime workflow registration and readback",
            objective:
              "Wire the Product/Spec Planning workflow registration and Work Queue readback.",
            commitmentIds: ["workflow-registration", "readback-proof"],
            inputHandoffRefs: [
              "runtime-job://job/context/workflow-registration",
              "runtime-job://job/context/readback-proof",
            ],
            targetRefs: ["extensions/execution-platform/src/workflows/"],
            fileOwnershipRefs: [
              "extensions/execution-platform/src/workflows/product-spec-planning-plugin.ts",
            ],
            recommendedCapabilityIds: ["implementation_microtask"],
            cheaperWorkerSuitability:
              "A scoped non-Codex worker can update the workflow/readback surface after synthesis.",
            downstreamConsumer: "validation",
            successCriteria: ["Registers workflow.", "Surfaces readback refs."],
            expectedOutput: "Changed workflow/readback refs and commitment evidence claims.",
            evidenceClaimExpectations: ["workflow-registration evidence", "readback evidence"],
            validationNeeds: ["Run workflow plugin/readback tests."],
            reviewNeeds: ["Review runtime registration and Work Queue readback."],
            integrationRequirements: ["Integrate workflow registry and readback projection."],
            workerFitRationale: "The grouped files share one runtime registration surface.",
          },
        ],
        dependencyMap: [],
        parallelismPlan: "Single grouped implementation is appropriate after context synthesis.",
        fileOwnershipProposals: [
          {
            groupId: "runtime-workflow",
            targetRefs: [
              "extensions/execution-platform/src/workflows/product-spec-planning-plugin.ts",
            ],
            ownershipRationale: "The workflow plugin owns runtime registration.",
          },
        ],
        likelyValidationLanes: ["workflow plugin tests", "Work Queue readback tests"],
        reviewLanes: ["runtime workflow registration review"],
        integrationRequirements: ["registry/readback integration"],
        workerFitSummary: "Use scoped implementation first; reserve Codex for integration repair.",
        validationStrategy: ["Run focused workflow/readback tests."],
        escalationTriggers: ["Escalate if registry wiring conflicts with workflow definitions."],
        evidenceClaimExpectations: ["mission commitment evidence refs"],
      },
      sourceRuntimeJobId: "job",
      sourceGraphId: "graph",
      workflowId: "agent_team.coding",
      sourceCommitmentIds: ["workflow-registration", "readback-proof"],
      sourcePacketRefs: ["runtime-job://job/packet/workflow-registration"],
      sourceContextHandoffRefs: [
        "runtime-job://job/context/workflow-registration",
        "runtime-job://job/context/readback-proof",
      ],
      createdAt: "2026-05-18T00:00:00.000Z",
    });

    expect(validateContextSynthesisArtifact(artifact)).toEqual({
      valid: true,
      reasonCodes: [],
    });
    expect(artifact.rawPromptStored).toBe(false);
    expect(artifact.rawResponseStored).toBe(false);
    expect(artifact.rawPromptStored).toBe(false);
    expect(artifact.rawResponseStored).toBe(false);
    expect(artifact.recommendedImplementationGroups[0]?.rawPromptStored).toBe(false);
    // Synthesis must include implementation groups, dependencies, risks, validation strategy, escalation triggers
    expect(artifact.recommendedImplementationGroups.length).toBeGreaterThan(0);
    expect(artifact.dependencyMap).toBeDefined();
    const summary = summarizeContextSynthesisArtifact(artifact) as {
      implementationReadiness: string;
      implementationGroupCount: number;
      implementationGroups: Array<{ successCriteria: string[] }>;
      rawPromptStored: false;
      rawResponseStored: false;
      synthesisHasNonRuntimeContextSource: boolean;
      synthesisQualityGatePassed: boolean;
    };
    expect(summary).toMatchObject({
      artifactKind: "context_synthesis",
      implementationReadiness: "ready",
      implementationGroupCount: 1,
      implementationGroups: [
        {
          groupId: "runtime-workflow",
          objective:
            "Wire the Product/Spec Planning workflow registration and Work Queue readback.",
          recommendedCapabilityIds: ["implementation_microtask"],
          fileOwnershipRefs: [
            "extensions/execution-platform/src/workflows/product-spec-planning-plugin.ts",
          ],
          cheaperWorkerSuitability:
            "A scoped non-Codex worker can update the workflow/readback surface after synthesis.",
          successCriteria: ["Registers workflow.", "Surfaces readback refs."],
          expectedOutput: "Changed workflow/readback refs and commitment evidence claims.",
          validationNeeds: ["Run workflow plugin/readback tests."],
          reviewNeeds: ["Review runtime registration and Work Queue readback."],
          workerFitRationale: "The grouped files share one runtime registration surface.",
        },
      ],
      likelyValidationLanes: ["workflow plugin tests", "Work Queue readback tests"],
      reviewLanes: ["runtime workflow registration review"],
      workerFitSummary: "Use scoped implementation first; reserve Codex for integration repair.",
      parallelismPlan: "Single grouped implementation is appropriate after context synthesis.",
      rawPromptStored: false,
    });
    // Scheduler gating: synthesis quality must be sufficient before implementation selection
    expect(summary.implementationReadiness).not.toBe("blocked");
    expect(summary.implementationGroupCount).toBeGreaterThan(0);
    expect(summary.implementationGroupCount).toBeLessThanOrEqual(12);
    expect(summary.implementationGroups[0]?.successCriteria.length).toBeGreaterThan(0);
    expect(summary.rawPromptStored).toBe(false);
    expect(summary.rawResponseStored).toBe(false);
  });

  it("derives compiler-owned expected output for otherwise complete groups", () => {
    const artifact = normalizeContextSynthesisArtifact({
      value: {
        implementationReadiness: "ready",
        commitmentCoverage: [
          {
            commitmentId: "workflow-registration",
            covered: true,
            groupIds: ["runtime-workflow"],
            contextHandoffRefs: ["runtime-job://job/context/workflow-registration"],
          },
        ],
        recommendedImplementationGroups: [
          {
            groupId: "runtime-workflow",
            title: "Runtime workflow registration",
            objective: "Wire Product/Spec Planning into the workflow definition registry.",
            commitmentIds: ["workflow-registration"],
            inputHandoffRefs: ["runtime-job://job/context/workflow-registration"],
            targetRefs: ["extensions/execution-platform/src/workflows/"],
            recommendedCapabilityIds: ["implementation_microtask"],
            cheaperWorkerSuitability: "A scoped worker can edit the registry and focused tests.",
            downstreamConsumer: "validation",
            successCriteria: ["Workflow is registered.", "Focused tests prove routing."],
            evidenceClaimExpectations: ["workflow registration evidence"],
            validationNeeds: ["Run workflow definition registry tests."],
            reviewNeeds: ["Review registry and readback wiring."],
            workerFitRationale: "This is a bounded registry wiring group.",
          },
        ],
        parallelismPlan: "Single group lane.",
        likelyValidationLanes: ["workflow registry tests"],
        reviewLanes: ["runtime workflow registration review"],
        workerFitSummary: "Scoped worker first, Codex only for integration repair.",
        validationStrategy: ["Run focused workflow registry tests."],
        escalationTriggers: ["Escalate if registry contracts drift."],
        evidenceClaimExpectations: ["mission commitment evidence refs"],
      },
      sourceRuntimeJobId: "job",
      sourceGraphId: "graph",
      workflowId: "agent_team.coding",
      sourceCommitmentIds: ["workflow-registration"],
      sourcePacketRefs: ["runtime-job://job/packet/workflow-registration"],
      sourceContextHandoffRefs: ["runtime-job://job/context/workflow-registration"],
      createdAt: "2026-05-18T00:00:00.000Z",
    });

    expect(validateContextSynthesisArtifact(artifact)).toEqual({
      valid: true,
      reasonCodes: [],
    });
    expect(artifact.recommendedImplementationGroups[0]?.expectedOutput).toContain(
      "Wire Product/Spec Planning",
    );
  });

  it("accepts groupPlanningGuidance as a model-authored implementation group alias", () => {
    const group = {
      groupId: "workflow-registration",
      title: "Workflow registration",
      objective: "Register Product/Spec Planning as a workflow plugin with scheduler evidence.",
      commitmentIds: ["workflow-registration"],
      inputHandoffRefs: ["runtime-job://job/context/workflow-registration"],
      targetRefs: ["extensions/execution-platform/src/workflows/"],
      recommendedCapabilityIds: ["implementation_microtask"],
      cheaperWorkerSuitability: "A scoped implementation worker can make this registry change.",
      downstreamConsumer: "validation",
      successCriteria: ["Plugin is registered.", "Registry tests pass."],
      expectedOutput: "Changed workflow registry files plus evidence refs.",
      evidenceClaimExpectations: ["workflow registration evidence"],
      validationNeeds: ["Run workflow registry tests."],
      reviewNeeds: ["Review workflow/plugin contract."],
      workerFitRationale: "The files are in one bounded registry surface.",
    };

    expect(contextSynthesisGroupGuidanceArray({ groupPlanningGuidance: [group] })).toEqual([group]);

    const artifact = normalizeContextSynthesisArtifact({
      value: {
        implementationReadiness: "ready",
        commitmentCoverage: [
          {
            commitmentId: "workflow-registration",
            covered: true,
            groupIds: ["workflow-registration"],
            contextHandoffRefs: ["runtime-job://job/context/workflow-registration"],
          },
        ],
        groupPlanningGuidance: [group],
        parallelismPlan: "Single independent group.",
        likelyValidationLanes: ["workflow registry tests"],
        reviewLanes: ["workflow registration review"],
        workerFitSummary: "Use scoped implementation first.",
        validationStrategy: ["Run focused workflow registry tests."],
        escalationTriggers: ["Escalate if workflow registry contracts conflict."],
        evidenceClaimExpectations: ["commitment evidence refs"],
      },
      sourceRuntimeJobId: "job",
      sourceGraphId: "graph",
      workflowId: "agent_team.coding",
      sourceCommitmentIds: ["workflow-registration"],
      sourcePacketRefs: ["runtime-job://job/packet/workflow-registration"],
      sourceContextHandoffRefs: ["runtime-job://job/context/workflow-registration"],
      createdAt: "2026-05-18T00:00:00.000Z",
    });

    expect(validateContextSynthesisArtifact(artifact)).toEqual({
      valid: true,
      reasonCodes: [],
    });
    expect(artifact.recommendedImplementationGroups[0]?.groupId).toBe("workflow-registration");
  });

  it("builds a bounded synthesis input manifest from refs and model-authored briefs without raw storage", () => {
    const manifest = buildContextSynthesisInputManifest({
      missionId: "mission",
      sourcePromptHash: "sha256:prompt",
      sourcePromptRef: "runtime-job://job/source-prompt/index",
      sourcePromptSectionRefs: ["runtime-job://job/source-prompt/section/requirements"],
      commitmentPackets: [
        {
          commitmentId: "workflow-registration",
          packetRef: "runtime-job://job/packet/workflow-registration",
          workerObjective: "Implement workflow registration with evidence.",
          contextScoutObjective: "Find workflow registry and tests.",
          implementationObjective: "Patch workflow registry and tests.",
          validationObjective: "Run focused workflow tests.",
          reviewObjective: "Review registry boundaries.",
          acceptanceCriteria: ["Registration exists.", "Tests pass."],
          remainingWork: ["Patch registry.", "Run tests."],
          requiredContextQuestions: ["Where is the workflow registry?"],
          likelyRepoAreas: ["extensions/execution-platform/src/workflows"],
          stopIfMissing: ["Stop if registry path is unknown."],
          expectedContextScoutOutput: ["Registry files and tests."],
          expectedImplementationOutput: ["Changed registry files."],
          expectedValidationOutput: ["Focused test refs."],
          requiredEvidenceClaimDescriptions: ["workflow registration evidence"],
          relevantConstraints: ["No raw logs."],
          explicitNonGoals: ["No UX proof."],
          downstreamConsumer: "scheduler",
        },
      ],
      contextScoutSummaries: [
        {
          nodeId: "context-scout-workflow-registration",
          commitmentIds: ["workflow-registration"],
          summary: "Workflow registry is under extensions/execution-platform/src/workflows.",
          handoffPacketRefs: ["runtime-job://job/context/workflow-registration"],
          verifiedFileRefs: [
            "extensions/execution-platform/src/workflows/workflow-plugin-registry.ts",
          ],
          toolLoopRefs: ["runtime-job://job/tool/context-scout"],
          contextSnapshotRefs: ["context-snapshot://job/workflow-registration"],
          symbolRefs: ["symbol://workflow-plugin-registry/registerWorkflowPlugin"],
          testRefs: [
            "extensions/execution-platform/src/workflows/workflow-plugin-registry.test.ts",
          ],
          blockers: [],
          limitations: [],
          synthesisReadiness: "ready",
        },
      ],
      sourceContextHandoffRefs: ["runtime-job://job/context/workflow-registration"],
      globalConstraints: ["Do not store raw provider logs.", "No full live UX proof."],
      maxInputBytes: 24_000,
    });

    expect(manifest.budget.budgetStatus).toBe("within_budget");
    expect(manifest.rawPromptStored).toBe(false);
    expect(manifest.rawResponseStored).toBe(false);
    expect(manifest.commitments[0]?.packetRef).toBe(
      "runtime-job://job/packet/workflow-registration",
    );
    expect(manifest.commitments[0]?.verifiedRepoRefs).toContain(
      "extensions/execution-platform/src/workflows/workflow-plugin-registry.ts",
    );
    expect(manifest.reasonCodes).toContain(
      "context_synthesis_input_manifest_model_authored_briefs_only",
    );
    const summary = summarizeContextSynthesisInputManifestForArtifact(manifest, {
      maxBriefChars: 120,
    });
    expect(Buffer.byteLength(JSON.stringify(summary), "utf8")).toBeLessThan(65_536);
    expect(summary.manifestHash).toMatch(/^sha256:/u);
    expect(summary.artifactKind).toBe("context_synthesis_input_manifest_summary");
    expect(summary.rawPromptStored).toBe(false);
    expect(summary.reasonCodes).toContain(
      "context_synthesis_input_manifest_full_value_not_stored_in_artifact_metadata",
    );
  });

  it("derives validation, review, evidence, and worker-fit fields from accepted packet summaries", () => {
    const artifact = normalizeContextSynthesisArtifact({
      value: {
        implementationReadiness: "ready",
        commitmentCoverage: [
          {
            commitmentId: "workflow-registration",
            covered: true,
            groupIds: ["runtime-workflow"],
            contextHandoffRefs: ["runtime-job://job/context/workflow-registration"],
          },
        ],
        recommendedImplementationGroups: [
          {
            groupId: "runtime-workflow",
            title: "Runtime workflow registration",
            objective: "Wire Product/Spec Planning into the workflow definition registry.",
            commitmentIds: ["workflow-registration"],
            inputHandoffRefs: ["runtime-job://job/context/workflow-registration"],
            targetRefs: ["extensions/execution-platform/src/workflows/"],
            recommendedCapabilityIds: ["implementation_microtask"],
            cheaperWorkerSuitability: "A scoped worker can edit the registry and focused tests.",
            successCriteria: ["Workflow is registered."],
          },
        ],
        parallelismPlan: "Single group has no dependency edges.",
      },
      sourceRuntimeJobId: "job",
      sourceGraphId: "graph",
      workflowId: "agent_team.coding",
      sourceCommitmentIds: ["workflow-registration"],
      sourcePacketRefs: ["runtime-job://job/packet/workflow-registration"],
      sourcePacketSummaries: [
        {
          commitmentId: "workflow-registration",
          validationObjective: "Run workflow definition registry tests.",
          expectedEvidenceDescription: "Workflow definition and plugin registration evidence.",
          acceptanceCriteria: ["Reviewer confirms registry wiring."],
        },
      ],
      sourceContextHandoffRefs: ["runtime-job://job/context/workflow-registration"],
      createdAt: "2026-05-18T00:00:00.000Z",
    });

    expect(validateContextSynthesisArtifact(artifact)).toEqual({
      valid: true,
      reasonCodes: [],
    });
    expect(artifact.validationStrategy).toContain("Run workflow definition registry tests.");
    expect(artifact.reviewLanes).toContain("Reviewer confirms registry wiring.");
    expect(artifact.workerFitSummary).toContain("workflow-registration");
    expect(artifact.evidenceClaimExpectations).toContain(
      "Workflow definition and plugin registration evidence.",
    );
  });

  it("keeps large synthesis summaries inside runtime artifact metadata bounds", () => {
    const longText =
      "Implement Product/Spec Planning with workflow registry, scheduler node support, Work Queue readback, human planning decisions, validation, closeout, and documentation. ";
    const commitmentIds = Array.from({ length: 9 }, (_, index) => `commitment-${index + 1}`);
    const artifact = normalizeContextSynthesisArtifact({
      value: {
        implementationReadiness: "ready",
        commitmentCoverage: commitmentIds.map((commitmentId, index) => ({
          commitmentId,
          covered: true,
          groupIds: [`group-${index + 1}`],
          contextHandoffRefs: [`runtime-job://job/context/${commitmentId}`],
          limitationSummary: longText.repeat(2),
        })),
        recommendedImplementationGroups: commitmentIds.map((commitmentId, index) => ({
          groupId: `group-${index + 1}`,
          title: `${commitmentId} implementation group ${longText}`,
          objective: longText.repeat(8),
          commitmentIds: [commitmentId],
          inputHandoffRefs: [`runtime-job://job/context/${commitmentId}`],
          targetRefs: [
            `extensions/execution-platform/src/workflows/${commitmentId}.ts`,
            `extensions/execution-platform/src/workflows/${commitmentId}.test.ts`,
          ],
          fileOwnershipRefs: [`extensions/execution-platform/src/workflows/${commitmentId}.ts`],
          recommendedCapabilityIds: ["implementation_microtask", "validation_test"],
          cheaperWorkerSuitability: longText.repeat(3),
          codexEscalationRationale: longText.repeat(3),
          downstreamConsumer: "validation",
          successCriteria: Array.from({ length: 10 }, () => longText),
          expectedOutput: longText.repeat(4),
          evidenceClaimExpectations: Array.from({ length: 10 }, () => longText),
          validationNeeds: Array.from({ length: 10 }, () => longText),
          reviewNeeds: Array.from({ length: 10 }, () => longText),
          stopIfMissing: Array.from({ length: 8 }, () => longText),
          riskRefs: Array.from({ length: 8 }, () => longText),
          integrationRequirements: Array.from({ length: 8 }, () => longText),
          dependsOnGroupIds: index === 0 ? [] : [`group-${index}`],
          parallelizableWithGroupIds: [`group-${((index + 1) % commitmentIds.length) + 1}`],
          workerFitRationale: longText.repeat(4),
        })),
        dependencyMap: commitmentIds.slice(1).map((commitmentId, index) => ({
          fromGroupId: `group-${index + 1}`,
          toGroupId: `group-${index + 2}`,
          dependencyKind: "handoff",
          rationale: `${commitmentId} ${longText.repeat(3)}`,
        })),
        parallelismPlan: longText.repeat(8),
        likelyValidationLanes: Array.from({ length: 18 }, () => longText),
        reviewLanes: Array.from({ length: 18 }, () => longText),
        integrationRequirements: Array.from({ length: 18 }, () => longText),
        workerFitSummary: longText.repeat(8),
        validationStrategy: Array.from({ length: 18 }, () => longText),
        escalationTriggers: Array.from({ length: 18 }, () => longText),
        evidenceClaimExpectations: Array.from({ length: 18 }, () => longText),
      },
      sourceRuntimeJobId: "job",
      sourceGraphId: "graph",
      workflowId: "agent_team.coding",
      sourceCommitmentIds: commitmentIds,
      sourcePacketRefs: commitmentIds.map(
        (commitmentId) => `runtime-job://job/packet/${commitmentId}`,
      ),
      sourceContextHandoffRefs: commitmentIds.map(
        (commitmentId) => `runtime-job://job/context/${commitmentId}`,
      ),
      createdAt: "2026-05-18T00:00:00.000Z",
    });

    const summary = summarizeContextSynthesisArtifact(artifact) as {
      implementationGroupCount: number;
      implementationGroups: unknown[];
      implementationGroupsTruncated: boolean;
      synthesisHash: string;
    };

    expect(summary.implementationGroupCount).toBe(9);
    expect(summary.implementationGroups.length).toBeLessThanOrEqual(4);
    expect(summary.implementationGroupsTruncated).toBe(true);
    expect(summary.synthesisHash).toMatch(/^sha256:/u);
    expect(Buffer.byteLength(JSON.stringify(summary), "utf8")).toBeLessThan(64 * 1024);

    const compileHandoff = summarizeContextSynthesisForGraphCompile(artifact);
    expect(compileHandoff.artifactKind).toBe("context_synthesis_graph_compile_handoff");
    expect(compileHandoff.implementationGroupCount).toBe(9);
    expect(compileHandoff.implementationGroupsIncludedCount).toBe(9);
    expect(compileHandoff.implementationGroups.length).toBe(9);
    expect(compileHandoff.compileHandoffComplete).toBe(true);
    expect(compileHandoff.reasonCodes).toContain(
      "context_synthesis_graph_compile_handoff_preserves_group_count",
    );
    expect(Buffer.byteLength(JSON.stringify(compileHandoff), "utf8")).toBeLessThan(64 * 1024);
  });

  it("preserves runtime-owned context snapshot refs when the model omits them", () => {
    const artifact = normalizeContextSynthesisArtifact({
      value: {
        implementationReadiness: "ready",
        commitmentCoverage: [
          {
            commitmentId: "workflow-registration",
            covered: true,
            groupIds: ["runtime-workflow"],
            contextHandoffRefs: ["runtime-job://job/context/workflow-registration"],
          },
        ],
        recommendedImplementationGroups: [
          {
            groupId: "runtime-workflow",
            objective: "Wire the workflow registration from accepted context.",
            commitmentIds: ["workflow-registration"],
            inputHandoffRefs: ["runtime-job://job/context/workflow-registration"],
            targetRefs: [
              "extensions/execution-platform/src/workflows/product-spec-planning-plugin.ts",
            ],
            recommendedCapabilityIds: ["implementation_microtask"],
            successCriteria: ["Registration is wired."],
            expectedOutput: "Changed workflow plugin registration.",
            evidenceClaimExpectations: ["workflow registration evidence"],
            validationNeeds: ["workflow plugin tests"],
            reviewNeeds: ["runtime registry review"],
            workerFitRationale: "Scoped static wiring can be delegated.",
          },
        ],
        parallelismPlan: "Single group has no dependency edges.",
        likelyValidationLanes: ["workflow plugin tests"],
        reviewLanes: ["runtime registry review"],
        workerFitSummary: "Use scoped implementation first.",
        evidenceClaimExpectations: ["workflow registration evidence"],
      },
      sourceRuntimeJobId: "job",
      sourceGraphId: "graph",
      workflowId: "agent_team.coding",
      sourceCommitmentIds: ["workflow-registration"],
      sourcePacketRefs: ["runtime-job://job/packet/workflow-registration"],
      sourceContextHandoffRefs: ["runtime-job://job/context/workflow-registration"],
      requiredContextSnapshotRefs: [freshSnapshotRef],
      providedContextSnapshotRefs: [freshSnapshotRef],
      createdAt: "2026-05-18T00:00:00.000Z",
    });

    expect(artifact.sourceContextSnapshotRefs).toEqual([freshSnapshotRef.snapshotRef]);
    expect(artifact.contextFreshnessStatus).toBe("fresh");
    expect(validateContextSynthesisArtifact(artifact)).toEqual({
      valid: true,
      reasonCodes: [],
    });
  });

  it("rejects ready synthesis that fails commitment and handoff coverage", () => {
    const artifact = normalizeContextSynthesisArtifact({
      value: {
        implementationReadiness: "ready",
        commitmentCoverage: [
          {
            commitmentId: "workflow-registration",
            covered: true,
            groupIds: ["runtime-workflow"],
            contextHandoffRefs: [],
          },
        ],
        recommendedImplementationGroups: [
          {
            groupId: "runtime-workflow",
            commitmentIds: [],
            inputHandoffRefs: [],
            objective: "",
            successCriteria: [],
          },
        ],
      },
      sourceGraphId: "graph",
      workflowId: "agent_team.coding",
      sourceCommitmentIds: ["workflow-registration", "readback-proof"],
      sourcePacketRefs: [],
      sourceContextHandoffRefs: ["runtime-job://job/context/workflow-registration"],
      createdAt: "2026-05-18T00:00:00.000Z",
    });

    expect(validateContextSynthesisArtifact(artifact).reasonCodes).toEqual(
      expect.arrayContaining([
        "context_synthesis_commitment_not_covered:readback-proof",
        "context_synthesis_group_commitments_missing:runtime-workflow",
        "context_synthesis_group_handoffs_missing:runtime-workflow",
        "context_synthesis_group_objective_missing:runtime-workflow",
        "context_synthesis_group_success_criteria_missing:runtime-workflow",
        "context_synthesis_dependency_or_parallelism_missing",
        "context_synthesis_validation_strategy_missing",
        "context_synthesis_review_lanes_missing",
        "context_synthesis_worker_fit_summary_missing",
      ]),
    );
  });

  it("accepts large parallel context fanout as bounded source refs", () => {
    const sourceContextHandoffRefs = Array.from(
      { length: 48 },
      (_, index) => `runtime-job://job/context/commitment-${index + 1}`,
    );
    const artifact = normalizeContextSynthesisArtifact({
      value: {
        implementationReadiness: "needs_more_context",
        limitations: ["Synthetic fanout fixture stops before ready validation."],
      },
      sourceGraphId: "graph",
      workflowId: "agent_team.coding",
      sourceCommitmentIds: ["workflow-registration"],
      sourcePacketRefs: [],
      sourceContextHandoffRefs,
      createdAt: "2026-05-18T00:00:00.000Z",
    });

    expect(artifact.sourceContextHandoffRefs).toHaveLength(48);
    expect(validateContextSynthesisArtifact(artifact)).toEqual({
      valid: true,
      reasonCodes: [],
    });
  });
});
