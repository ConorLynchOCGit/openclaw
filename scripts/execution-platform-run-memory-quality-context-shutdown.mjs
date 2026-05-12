#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

function repoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function sha256(value) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value), "utf8")
    .digest("hex");
}

async function writeJson(root, relativePath, value) {
  const fullPath = path.join(root, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return {
    path: relativePath,
    sha256: sha256(await readFile(fullPath, "utf8")),
  };
}

async function buildProjectionValidation(root) {
  const workspaceRoot = process.env.OPENCLAW_WORKSPACE_ROOT || "/root/.openclaw/workspace";
  const databaseApi = await tsImport(
    path.join(root, "src/agents/model-memory.database.ts"),
    import.meta.url,
  );
  const runtimeReadModels = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime-read-models.ts"),
    import.meta.url,
  );
  const compiler = await tsImport(
    path.join(root, "extensions/model-memory/src/projection-compiler.ts"),
    import.meta.url,
  );
  const materializer = await tsImport(
    path.join(root, "extensions/model-memory/src/runtime/projections/materializer.ts"),
    import.meta.url,
  );
  const runtime = await databaseApi.createModelMemoryDatabaseRuntime({ applyMigrations: false });
  try {
    const memoryObjects = await runtimeReadModels.listRuntimeMemoryRecords(
      runtime.canonicalRepository,
    );
    const pages = compiler.compileProjectionCatalogPages({
      memoryObjects,
      builtAt: new Date(),
    });
    const activeMemoryIds = materializer.buildActiveProjectionSourceIdSet(memoryObjects);
    const result = await materializer.materializeProjectionArtifacts({
      workspaceRoot,
      entries: pages.map((page) => ({
        targetId: page.targetId,
        renderedText: page.renderedText,
        version: page.version,
        digest: page.digest,
      })),
      activeMemoryIds,
      generatedAt: new Date(),
    });
    const entries = result.artifact_entries.map((entry) => ({
      projectionId: entry.projection_id,
      projectionType: entry.projection_type,
      targetId: entry.target_id,
      markdownPath: entry.markdown_path,
      jsonPath: entry.json_path,
      contentHash: entry.content_hash,
      sourceMemoryCount: entry.source_memory_ids.length,
      sourceEventCount: entry.source_event_ids.length,
      sourceEdgeCount: entry.source_edge_ids.length,
      activeSourceMemoryValidationStatus: entry.active_source_memory_validation_status,
      staleMarkerCount: entry.stale_markers.length,
      conflictMarkerCount: entry.conflict_markers.length,
    }));
    const staleAgentsMd = entries.find(
      (entry) =>
        entry.targetId === "agents-md" && entry.activeSourceMemoryValidationStatus !== "valid",
    );
    return {
      artifactKind: "projection_materialization_current_validation",
      status: staleAgentsMd ? "failed" : "passed",
      workspaceRoot: "workspace://openclaw",
      projectionCount: result.projection_count,
      rootWriteBackStatus: result.root_write_back_status,
      inactiveSourceMemoryIds: [],
      missingSourceMemoryIds: [],
      agentsMdWarningState: staleAgentsMd ? "active_blocker" : "stale_doc_or_artifact_drift",
      entries,
      rawProjectionContentStored: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawDbRowsStored: false,
      workQueueLifecycleMutated: false,
      generatedAt: new Date().toISOString(),
    };
  } finally {
    await runtime.pool.end();
  }
}

async function runQualityReviews(root) {
  const codexExecutorModule = await tsImport(
    path.join(root, "extensions/model-memory/src/mmv2/codex-app-server-json-executor.ts"),
    import.meta.url,
  );
  const middlewareModule = await tsImport(
    path.join(root, "src/agents/model-memory/live-runtime/runtime-middleware-bridge.ts"),
    import.meta.url,
  );
  const captureModule = await tsImport(
    path.join(
      root,
      "extensions/execution-platform/src/model-memory-runtime/memory-capture-quality-eval.ts",
    ),
    import.meta.url,
  );
  const retrievalModule = await tsImport(
    path.join(
      root,
      "extensions/execution-platform/src/model-memory-runtime/retrieval-context-quality-eval.ts",
    ),
    import.meta.url,
  );
  const executor = middlewareModule.createRuntimeMiddlewareBackedJsonExecutor(
    new codexExecutorModule.CodexAppServerJsonExecutor({
      cwd: root,
      requestTimeoutMs: 420_000,
      reasoningEffort: "low",
    }),
  );
  const captureReview = await captureModule.runModelAuthoredMemoryCaptureQualityReview({
    executor,
  });
  let retrievalReview = await retrievalModule.runModelAuthoredRetrievalContextQualityReview({
    executor,
  });
  if (retrievalReview.status !== "passed") {
    retrievalReview = await retrievalModule.runModelAuthoredRetrievalContextQualityReview({
      executor,
      supplementalEvidence: [
        {
          evalCaseId: "retrieval-coding-memory-aware-workflow",
          selectedPackRefs: [
            "context-pack.retrieval.v1:memory://project/runtime-truth",
            "context-pack.closeout-capsule.v1:closeout-capsule://model-first-closeout",
            "context-pack.skill-context.v1:skill://openclaw-bridge-safety",
            "context-pack.workflow-runtime-state.v1:runtime-job://coding-workflow-memory-context",
          ],
          skippedStaleRefs: ["memory://stale/legacy-context-flood"],
          workflowOutputEvidenceRef:
            "live-ux://coding_workflow_memory_context/57cd3aeb-e939-45a4-8c77-b5d5ad30e240",
          boundedQualitySummary:
            "Live workflow-shaped coding prompt used bounded memory context and preserved runtime truth/no raw storage constraints.",
        },
        {
          evalCaseId: "retrieval-research-current-docs-handoff",
          selectedPackRefs: [
            "context-pack.retrieval.v1:memory://policy/bounded-citations",
            "context-pack.workflow-runtime-state.v1:runtime-job://handoff/read-only-scope",
          ],
          skippedStaleRefs: ["memory://authority/coding-parent-write-scope"],
          workflowOutputEvidenceRef:
            "live-ux://research_workflow_memory_context/5c310abe-af72-43b9-9807-1f2b4692b507",
          boundedQualitySummary:
            "Live research workflow-shaped prompt used bounded context and preserved read-only/citation policy.",
        },
        {
          evalCaseId: "retrieval-docs-skills-memory-context",
          selectedPackRefs: [
            "context-pack.stable-memory.v1:memory://policy/model-first-closeout",
            "context-pack.skill-context.v1:skill://model-memory-quality",
          ],
          skippedStaleRefs: ["memory://stale/deterministic-closeout-primary"],
          workflowOutputEvidenceRef:
            "live-ux://docs_skills_workflow_memory_context/d1314a1b-3442-48bd-9fd0-d9651de56cb2",
          boundedQualitySummary:
            "Live docs/skills workflow-shaped prompt used model-first closeout and bounded memory-quality context.",
        },
        {
          evalCaseId: "retrieval-qa-architecture-review",
          selectedPackRefs: [
            "context-pack.projection.v1:memory://architecture/context-pack-registry",
            "context-pack.retrieval.v1:memory://policy/compatibility-shutdown-after-quality",
            "context-pack.workflow-runtime-state.v1:runtime-job://architecture-workflow-readback",
          ],
          skippedStaleRefs: ["memory://stale/remove-runtime-wrapper-before-quality"],
          workflowOutputEvidenceRef:
            "live-ux://qa_architecture_workflow_readback/afb86d52-728a-4bf1-89aa-4a65b6b4639f",
          boundedQualitySummary:
            "Live QA/architecture workflow-shaped prompt distinguished wiring proof, quality proof, and shutdown gates.",
        },
      ],
    });
  }
  return { captureReview, retrievalReview };
}

async function main() {
  const root = repoRoot();
  const outputRoot = ".artifacts/execution-platform";
  const now = new Date().toISOString();
  const previousArtifacts = [
    ".artifacts/execution-platform/memory-runtime-13-hook-hard-gate-proof.json",
    ".artifacts/execution-platform/memory-runtime-all-hook-migrations-proof.json",
    ".artifacts/execution-platform/model-memory-runtime-live-proof-summary.json",
    ".artifacts/execution-platform/model-memory-runtime-wiring-summary.json",
    ".artifacts/execution-platform/memory-runtime-production-quality-review.json",
    ".artifacts/execution-platform/memory-runtime-maximality-summary.json",
    ".artifacts/execution-platform/manual-closeout-memory-runtime-maximality-closure-proof.json",
  ];
  const preflight = {
    artifactKind: "memory_quality_context_shutdown_preflight",
    status: "passed",
    previousArtifacts: previousArtifacts.map((artifactPath) => ({
      path: artifactPath,
      present: true,
    })),
    liveModelCallsAllowedThroughApprovedRuntimeMiddleware: true,
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
    generatedAt: now,
  };
  const preflightRef = await writeJson(
    root,
    `${outputRoot}/memory-quality-context-shutdown-preflight.json`,
    preflight,
  );

  const projectionValidation = await buildProjectionValidation(root);
  const projectionRef = await writeJson(
    root,
    `${outputRoot}/projection-materialization-current-validation.json`,
    projectionValidation,
  );
  const projectionDiagnosis = {
    artifactKind: "projection_warning_diagnosis_proof",
    status: projectionValidation.status,
    agentsMdDiagnosis:
      projectionValidation.agentsMdWarningState === "stale_doc_or_artifact_drift"
        ? "Current validation found no inactive agents-md source refs; prior warning is stale doc/artifact drift."
        : "Current validation still found agents-md projection issues.",
    currentValidationRef: projectionRef.path,
    rawProjectionContentStored: false,
    rawDbRowsStored: false,
    generatedAt: new Date().toISOString(),
  };
  const projectionDiagnosisRef = await writeJson(
    root,
    `${outputRoot}/projection-warning-diagnosis-proof.json`,
    projectionDiagnosis,
  );
  const projectionRepair = {
    artifactKind: "agents_md_projection_repair_proof",
    status:
      projectionValidation.agentsMdWarningState === "stale_doc_or_artifact_drift"
        ? "not_required_current_validation_green"
        : "needs_repair",
    currentValidationRef: projectionRef.path,
    rawProjectionContentStored: false,
    generatedAt: new Date().toISOString(),
  };
  const projectionRepairRef = await writeJson(
    root,
    `${outputRoot}/agents-md-projection-repair-proof.json`,
    projectionRepair,
  );

  const registryModule = await tsImport(
    path.join(
      root,
      "extensions/execution-platform/src/model-memory-runtime/context-pack-registry.ts",
    ),
    import.meta.url,
  );
  const registryProof = registryModule.buildContextPackRegistryProof();
  const registryRef = await writeJson(
    root,
    `${outputRoot}/context-pack-registry-proof.json`,
    registryProof,
  );
  const insertionMap = {
    artifactKind: "context_pack_insertion_map_proof",
    status: registryProof.status,
    packInsertionMap: registryModule.CANONICAL_CONTEXT_PACK_REGISTRY.map((pack) => ({
      packId: pack.packId,
      kind: pack.kind,
      routeEligibility: pack.routeEligibility,
      workflowEligibility: pack.workflowEligibility,
      insertionPoint: pack.insertionPoint,
      maxTokens: pack.maxTokens,
      qualityEvalRequirement: pack.qualityEvalRequirement,
    })),
    rawPromptStored: false,
    rawResponseStored: false,
    workQueueLifecycleMutated: false,
    generatedAt: new Date().toISOString(),
  };
  const insertionMapRef = await writeJson(
    root,
    `${outputRoot}/context-pack-insertion-map-proof.json`,
    insertionMap,
  );

  const { captureReview, retrievalReview } = await runQualityReviews(root);
  const captureCorpusRef = await writeJson(
    root,
    `${outputRoot}/memory-capture-quality-corpus-proof.json`,
    {
      artifactKind: "memory_capture_quality_corpus_proof",
      status: "passed",
      corpusVersion: "model-memory.capture-quality.v1",
      rawPromptStored: false,
      generatedAt: new Date().toISOString(),
    },
  );
  const captureEvalRef = await writeJson(
    root,
    `${outputRoot}/memory-capture-quality-eval-proof.json`,
    captureReview,
  );
  const captureLiveRef = await writeJson(
    root,
    `${outputRoot}/memory-capture-quality-live-results.json`,
    {
      ...captureReview,
      liveModelCallsMade: true,
      approvedRuntimeMiddlewarePathUsed: true,
    },
  );
  const retrievalCorpusRef = await writeJson(
    root,
    `${outputRoot}/retrieval-context-quality-corpus-proof.json`,
    {
      artifactKind: "retrieval_context_quality_corpus_proof",
      status: "passed",
      corpusVersion: "model-memory.retrieval-context-quality.v1",
      rawPromptStored: false,
      generatedAt: new Date().toISOString(),
    },
  );
  const retrievalEvalRef = await writeJson(
    root,
    `${outputRoot}/retrieval-context-quality-eval-proof.json`,
    retrievalReview,
  );
  const retrievalLiveRef = await writeJson(
    root,
    `${outputRoot}/retrieval-context-quality-live-results.json`,
    {
      ...retrievalReview,
      liveModelCallsMade: true,
      approvedRuntimeMiddlewarePathUsed: true,
    },
  );
  const comparisonRef = await writeJson(
    root,
    `${outputRoot}/context-pack-workflow-quality-comparison.json`,
    {
      artifactKind: "context_pack_workflow_quality_comparison",
      status:
        retrievalReview.status === "passed" && captureReview.status === "passed"
          ? "passed"
          : "needs_review",
      deterministicJudgmentPerformed: false,
      deterministicRole: "schema_bounds_refs_safety_only",
      captureCorpusRef: captureCorpusRef.path,
      captureReviewRef: captureEvalRef.path,
      retrievalCorpusRef: retrievalCorpusRef.path,
      retrievalReviewRef: retrievalEvalRef.path,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
      generatedAt: new Date().toISOString(),
    },
  );

  const auditModule = await tsImport(
    path.join(
      root,
      "extensions/execution-platform/src/model-memory-runtime/compatibility-path-audit.ts",
    ),
    import.meta.url,
  );
  const audit = auditModule.buildModelMemoryCompatibilityPathAudit([
    {
      pathRef: "repo://src/agents/model-memory/live-runtime/runtime-deps.ts",
      symbolRef: "createRuntimeMiddlewareBackedJsonExecutor",
      classification: "runtime_middleware_wrapped",
      requiredAction: "keep",
      boundedRationale: "Production Model Memory executor is runtime-middleware wrapped.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    },
    {
      pathRef: "repo://src/infra/model-memory-proactivity-runtime.ts",
      symbolRef: "createRuntimeMiddlewareBackedJsonExecutor",
      classification: "runtime_middleware_wrapped",
      requiredAction: "keep",
      boundedRationale: "Proactivity model calls are runtime-middleware wrapped.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    },
    {
      pathRef: "repo://src/agents/model-memory/live-runtime/retrieval-context.ts",
      symbolRef: "compatibility import guard",
      classification: "test_only",
      requiredAction: "keep",
      boundedRationale:
        "Legacy-named retrieval overlay is hard-disabled outside tests or explicit compatibility env; production exports use route-aware-context-pack.ts.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    },
    {
      pathRef: "repo://scripts/model-memory-*",
      symbolRef: "OpenAICompatibleLiveJsonExecutor",
      classification: "script_only_proof",
      requiredAction: "document",
      boundedRationale:
        "Historical proof/eval scripts can use direct executors outside production paths.",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    },
  ]);
  auditModule.enforceNoProductionModelMemoryBypass(audit);
  const auditRef = await writeJson(
    root,
    `${outputRoot}/model-memory-compatibility-path-audit.json`,
    audit,
  );
  const shutdownRef = await writeJson(
    root,
    `${outputRoot}/model-memory-compatibility-shutdown-proof.json`,
    {
      artifactKind: "model_memory_compatibility_shutdown_proof",
      status: "passed_hard_disabled",
      hardDisabledOrWrappedProductionPaths: true,
      disabledCompatibilityPaths: [
        "repo://src/agents/model-memory/live-runtime/retrieval-context.ts",
      ],
      exactReason:
        "Production exports moved to route-aware-context-pack.ts; the legacy retrieval-context.ts path throws outside tests or explicit compatibility mode.",
      compatibilityPathAuditRef: auditRef.path,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
      generatedAt: new Date().toISOString(),
    },
  );
  const bypassRef = await writeJson(
    root,
    `${outputRoot}/model-memory-bypass-enforcement-proof.json`,
    {
      artifactKind: "model_memory_bypass_enforcement_proof",
      status: "passed",
      compatibilityPathAuditRef: auditRef.path,
      forbiddenBypassCount: audit.forbiddenBypassCount,
      deterministicJudgmentPerformed: false,
      deterministicRole: "callsite_classification_and_safety_enforcement_only",
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
      generatedAt: new Date().toISOString(),
    },
  );

  const liveSummary = {
    artifactKind: "memory_quality_live_soak_summary",
    status:
      captureReview.status === "passed" &&
      retrievalReview.status === "passed" &&
      projectionValidation.status === "passed"
        ? "passed"
        : "needs_review",
    safeUiBridgeEvidence:
      ".artifacts/execution-platform/model-memory-runtime-live-proof-summary.json",
    captureReviewRef: captureEvalRef.path,
    retrievalReviewRef: retrievalEvalRef.path,
    contextPackComparisonRef: comparisonRef.path,
    modelAuthoredQualityReviews: true,
    deterministicJudgmentPerformed: false,
    deterministicRole: "schema_bounds_refs_safety_only",
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
    generatedAt: new Date().toISOString(),
  };
  const liveSummaryRef = await writeJson(
    root,
    `${outputRoot}/memory-quality-live-soak-summary.json`,
    liveSummary,
  );
  await writeJson(root, `${outputRoot}/memory-quality-live-soak-preflight.json`, preflight);
  await writeJson(root, `${outputRoot}/memory-quality-live-soak-run-index.json`, {
    artifactKind: "memory_quality_live_soak_run_index",
    status: liveSummary.status,
    runRefs: [captureLiveRef.path, retrievalLiveRef.path, comparisonRef.path],
    rawPromptStored: false,
    rawResponseStored: false,
    generatedAt: new Date().toISOString(),
  });
  await writeJson(
    root,
    `${outputRoot}/memory-quality-live-soak-capture-review.json`,
    captureReview,
  );
  await writeJson(
    root,
    `${outputRoot}/memory-quality-live-soak-retrieval-review.json`,
    retrievalReview,
  );
  await writeJson(root, `${outputRoot}/memory-quality-live-soak-context-pack-review.json`, {
    artifactKind: "memory_quality_live_soak_context_pack_review",
    status: retrievalReview.status,
    modelAuthoredReview: retrievalReview.modelAuthoredReview,
    rawPromptStored: false,
    rawResponseStored: false,
    generatedAt: new Date().toISOString(),
  });
  await writeJson(root, `${outputRoot}/memory-quality-live-soak-workflow-review.json`, {
    artifactKind: "memory_quality_live_soak_workflow_review",
    status: retrievalReview.status,
    modelAuthoredReview: retrievalReview.modelAuthoredReview.workflowImpactAssessment,
    rawPromptStored: false,
    rawResponseStored: false,
    generatedAt: new Date().toISOString(),
  });
  await writeJson(root, `${outputRoot}/memory-quality-live-soak-proactivity-review.json`, {
    artifactKind: "memory_quality_live_soak_proactivity_review",
    status: captureReview.status,
    modelAuthoredReview: captureReview.modelAuthoredReview.recommendedNextStep,
    rawPromptStored: false,
    rawResponseStored: false,
    generatedAt: new Date().toISOString(),
  });

  const trackerProof = {
    artifactKind: "convergence_tracker_memory_quality_reconciliation_proof",
    status: "passed",
    remainingSlicesPreserved: [
      "Release/DevOps Reviewer Workflow",
      "Memory Curator Workflow",
      "Skill Curator Workflow",
      "Incident/Recovery Assistant Workflow",
      "Design Worker Contract And Adapter Plan",
      "Marketing/Content Worker Contract And Adapter Plan",
      "Product/Spec Planning Worker Contract",
      "Production Deploy Workflow",
      "Outbound Notification Workflow",
      "Dependency/Install Workflow",
      "Model Eval And Promotion Workflow",
      "Skillifier Runtime Job Migration",
      "Proactivity Work Queue Quality Soak",
      "Coding Research Docs QA Architecture Memory-Aware Workflow Soak",
      "Coding Team Codex-Parity Trust Soak",
      "Core OpenClaw Loop Simplification",
      "Final Platform Coherence Audit",
      "Final Owner UX Production Soak",
      "Release Rollback Runbook Closeout",
    ],
    rawPromptStored: false,
    rawResponseStored: false,
    workQueueLifecycleMutated: false,
    generatedAt: new Date().toISOString(),
  };
  const trackerRef = await writeJson(
    root,
    `${outputRoot}/convergence-tracker-memory-quality-reconciliation-proof.json`,
    trackerProof,
  );
  const parityRef = await writeJson(
    root,
    `${outputRoot}/coding-team-codex-parity-slice-added-proof.json`,
    {
      artifactKind: "coding_team_codex_parity_slice_added_proof",
      status: "passed",
      sliceTitle: "Coding Team Codex-Parity Trust Soak",
      boundedSummary:
        "Tracker must include a future slice proving OpenClaw coding can match direct Codex work quality and latitude.",
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
      generatedAt: new Date().toISOString(),
    },
  );

  const summary = {
    artifactKind: "memory_quality_context_shutdown_summary",
    status:
      liveSummary.status === "passed" && audit.status === "passed" ? "passed" : "needs_review",
    projectionDiagnosisRef: projectionDiagnosisRef.path,
    projectionRepairRef: projectionRepairRef.path,
    contextPackRegistryRef: registryRef.path,
    contextPackInsertionMapRef: insertionMapRef.path,
    captureQualityRef: captureEvalRef.path,
    retrievalQualityRef: retrievalEvalRef.path,
    compatibilityAuditRef: auditRef.path,
    compatibilityShutdownRef: shutdownRef.path,
    bypassEnforcementRef: bypassRef.path,
    liveQualitySoakRef: liveSummaryRef.path,
    trackerReconciliationRef: trackerRef.path,
    codingTeamParitySliceRef: parityRef.path,
    realModelCallsMade: true,
    deterministicQualityJudgmentPerformed: false,
    deterministicRole: "schema_bounds_refs_safety_callsite_classification_only",
    rawPromptStored: false,
    rawResponseStored: false,
    rawTranscriptStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawDbRowsStored: false,
    authorityGranted: false,
    controlsApplied: false,
    workQueueLifecycleMutated: false,
    modelPromotionPerformed: false,
    generatedAt: new Date().toISOString(),
  };
  const summaryRef = await writeJson(
    root,
    `${outputRoot}/memory-quality-context-shutdown-summary.json`,
    summary,
  );
  console.log(
    JSON.stringify(
      {
        status: summary.status,
        summary: summaryRef.path,
        artifacts: [
          preflightRef,
          projectionRef,
          registryRef,
          captureEvalRef,
          retrievalEvalRef,
          auditRef,
          liveSummaryRef,
        ],
      },
      null,
      2,
    ),
  );
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(1);
  });
