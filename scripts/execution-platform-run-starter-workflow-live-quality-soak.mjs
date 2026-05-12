#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";
import { z } from "zod";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
const now = () => new Date();
let executionPlatform;
let modelMemory;

const WORK_PRODUCT_SCHEMA_VERSION = "execution-platform.starter-workflow-work-product.v1";

const WorkProductSchema = z
  .object({
    workflowId: z.string().min(3).max(160),
    roleId: z.string().min(1).max(120),
    workProductMarkdown: z.string().min(80).max(5000),
    evidenceSummary: z.string().min(40).max(1200),
    validationSummary: z.string().min(20).max(1000),
    qualitySelfAssessment: z.string().min(20).max(1000),
    limitations: z.array(z.string().min(1).max(500)).max(8),
    artifactTitle: z.string().min(1).max(160),
    sourceRefsUsed: z.array(z.string().min(1).max(260)).max(10),
    recommendedNextStep: z.string().min(1).max(800),
    eli5Progress: z.string().min(20).max(1000),
    rawPromptStored: z.literal(false),
    rawResponseStored: z.literal(false),
    rawProviderLogStored: z.literal(false),
    rawToolLogStored: z.literal(false),
    rawResearchPageStored: z.literal(false),
    authorityGranted: z.literal(false),
    controlsApplied: z.literal(false),
    deployPerformed: z.literal(false),
    outboundSendPerformed: z.literal(false),
    dependencyInstallPerformed: z.literal(false),
    modelPromotionPerformed: z.literal(false),
    workQueueLifecycleMutated: z.literal(false),
  })
  .strict();

const WorkProductContentSchema = WorkProductSchema.omit({
  rawPromptStored: true,
  rawResponseStored: true,
  rawProviderLogStored: true,
  rawToolLogStored: true,
  rawResearchPageStored: true,
  authorityGranted: true,
  controlsApplied: true,
  deployPerformed: true,
  outboundSendPerformed: true,
  dependencyInstallPerformed: true,
  modelPromotionPerformed: true,
  workQueueLifecycleMutated: true,
});

const WORK_PRODUCT_CONTENT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "workflowId",
    "roleId",
    "workProductMarkdown",
    "evidenceSummary",
    "validationSummary",
    "qualitySelfAssessment",
    "limitations",
    "artifactTitle",
    "sourceRefsUsed",
    "recommendedNextStep",
    "eli5Progress",
  ],
  properties: {
    workflowId: { type: "string", minLength: 3, maxLength: 160 },
    roleId: { type: "string", minLength: 1, maxLength: 120 },
    workProductMarkdown: { type: "string", minLength: 80, maxLength: 5000 },
    evidenceSummary: { type: "string", minLength: 40, maxLength: 1200 },
    validationSummary: { type: "string", minLength: 20, maxLength: 1000 },
    qualitySelfAssessment: { type: "string", minLength: 20, maxLength: 1000 },
    limitations: { type: "array", items: { type: "string", maxLength: 500 }, maxItems: 8 },
    artifactTitle: { type: "string", minLength: 1, maxLength: 160 },
    sourceRefsUsed: { type: "array", items: { type: "string", maxLength: 260 }, maxItems: 10 },
    recommendedNextStep: { type: "string", minLength: 1, maxLength: 800 },
    eli5Progress: { type: "string", minLength: 20, maxLength: 1000 },
  },
};

function hasArg(name) {
  return process.argv.includes(name);
}

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

function writeArtifact(name, value) {
  fs.mkdirSync(artifactDir, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: now().toISOString() }, null, 2)}\n`;
  fs.writeFileSync(path.join(artifactDir, name), body);
  return { path: `.artifacts/execution-platform/${name}`, sha256: sha256(body) };
}

async function ep() {
  executionPlatform ??= await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
  return executionPlatform;
}

async function mm() {
  modelMemory ??= {
    ...(await tsImport(
      path.join(root, "extensions/model-memory/src/mmv2/codex-app-server-json-executor.ts"),
      import.meta.url,
    )),
    ...(await tsImport(
      path.join(root, "extensions/model-memory/src/model-execution.ts"),
      import.meta.url,
    )),
  };
  return modelMemory;
}

function summarizeReadiness(readiness) {
  return {
    boundaryKind: readiness.boundary.boundaryKind,
    databaseName: readiness.boundary.databaseName,
    readinessState: readiness.readinessState,
    workQueueLiveLinkageMayAttach: readiness.workQueueLiveLinkageMayAttach,
    missingTables: readiness.missingTables,
    missingMigrationRefs: readiness.missingMigrationRefs,
    reasonCodes: readiness.reasonCodes,
  };
}

async function createRuntime() {
  const {
    applyExecutionPlatformMigrations,
    createExecutionPlatformPgMemTestDatabase,
    createExecutionPlatformDatabaseRuntime,
    inspectExecutionPlatformDbReadiness,
    resolveExecutionPlatformDbBoundaryContract,
    evaluateWorkQueueLiveLinkageGate,
    RuntimeJobRepository,
    WorkQueueRepository,
  } = await ep();

  if (hasArg("--live-runtime")) {
    const runtime = await createExecutionPlatformDatabaseRuntime({ applyMigrations: false });
    const boundary = resolveExecutionPlatformDbBoundaryContract({ resolution: runtime.resolution });
    const readiness = await inspectExecutionPlatformDbReadiness({
      sql: runtime.sqlClient,
      boundary,
    });
    const gate = evaluateWorkQueueLiveLinkageGate({ readiness });
    if (!gate.enabled) {
      return { kind: "blocked", runtime, readiness, gate };
    }
    const runtimeJobs = new RuntimeJobRepository(runtime.sqlClient, { claimStrategy: "basic" });
    const workQueue = new WorkQueueRepository(runtime.sqlClient, runtimeJobs);
    return { kind: "live", runtime, runtimeJobs, workQueue, readiness, gate };
  }

  const database = await createExecutionPlatformPgMemTestDatabase();
  await applyExecutionPlatformMigrations(database.sql);
  const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic" });
  const workQueue = new WorkQueueRepository(database.sql, runtimeJobs);
  return { kind: "pgmem", runtime: database, runtimeJobs, workQueue, readiness: null, gate: null };
}

function workflowSpecs(exports) {
  return [
    {
      key: "webResearch",
      artifactName: "starter-web-research-live-quality-proof.json",
      workflowId: exports.webResearchWorkflowContract.workflowId,
      jobType: exports.webResearchWorkflowContract.jobType,
      adapterId: exports.WEB_RESEARCH_WORKER_ADAPTER_ID,
      roleId: "web_researcher",
      queueName: "starter-workflow-quality",
      title: "Starter web research live quality proof",
      objectiveSummary:
        "Research current official structured-output guidance and identify one safe Intent Front Door validation improvement.",
      boundedPromptSummary:
        "Use the web research worker for current official structured-output guidance with bounded citations only.",
      createAdapter({ runtimeJobs, executor, reporter, sourceEvidence }) {
        return new exports.WebResearchWorkerAdapter({
          runtimeJobs,
          runner: modelBackedRunner({
            runtimeJobs,
            executor,
            reporter,
            workflowId: exports.webResearchWorkflowContract.workflowId,
            roleId: "web_researcher",
            adapterId: exports.WEB_RESEARCH_WORKER_ADAPTER_ID,
            objectiveSummary:
              "Research current official structured-output guidance and identify one safe Intent Front Door validation improvement.",
            sourceEvidence,
            citationRequired: true,
            artifactType: "web_research.live_quality_work_product",
          }),
        });
      },
    },
    {
      key: "researchToCoding",
      artifactName: "starter-research-to-coding-live-quality-proof.json",
      workflowId: exports.RESEARCH_TO_CODING_HANDOFF_WORKFLOW_ID,
      jobType: exports.RESEARCH_TO_CODING_HANDOFF_JOB_TYPE,
      adapterId: exports.RESEARCH_TO_CODING_HANDOFF_WORKER_ADAPTER_ID,
      roleId: "handoff_coordinator",
      queueName: "starter-workflow-quality",
      title: "Starter research-to-coding handoff live quality proof",
      objectiveSummary:
        "Use bounded research refs to plan the smallest safe validation/readback improvement before coding.",
      boundedPromptSummary:
        "Research first, then hand off bounded source refs to coding context without authority leakage.",
      createAdapter({ runtimeJobs, executor, reporter, sourceEvidence }) {
        return new exports.ResearchToCodingHandoffWorkerAdapter({
          runtimeJobs,
          runner: modelBackedRunner({
            runtimeJobs,
            executor,
            reporter,
            workflowId: exports.RESEARCH_TO_CODING_HANDOFF_WORKFLOW_ID,
            roleId: "handoff_coordinator",
            adapterId: exports.RESEARCH_TO_CODING_HANDOFF_WORKER_ADAPTER_ID,
            objectiveSummary:
              "Use bounded research refs to plan the smallest safe validation/readback improvement before coding.",
            sourceEvidence,
            artifactType: "research_to_coding.live_quality_handoff",
            extraArtifactRefSuffix: "handoff",
          }),
        });
      },
    },
    {
      key: "docsSkills",
      artifactName: "starter-docs-skills-live-quality-proof.json",
      workflowId: exports.docsSkillsWorkflowContract.workflowId,
      jobType: exports.docsSkillsWorkflowContract.jobType,
      adapterId: exports.DOCS_SKILLS_WORKER_ADAPTER_ID,
      roleId: "docs_skills_writer",
      queueName: "starter-workflow-quality",
      title: "Starter docs/skills live quality proof",
      objectiveSummary:
        "Draft a bounded docs/runbook artifact for running starter workflow quality soaks safely.",
      boundedPromptSummary:
        "Use docs/skills worker to produce bounded quality-soak docs with no skill install or promotion.",
      createAdapter({ runtimeJobs, executor, reporter, sourceEvidence }) {
        return new exports.DocsSkillsWorkerAdapter({
          runtimeJobs,
          runner: modelBackedRunner({
            runtimeJobs,
            executor,
            reporter,
            workflowId: exports.docsSkillsWorkflowContract.workflowId,
            roleId: "docs_skills_writer",
            adapterId: exports.DOCS_SKILLS_WORKER_ADAPTER_ID,
            objectiveSummary:
              "Draft a bounded docs/runbook artifact for running starter workflow quality soaks safely.",
            sourceEvidence,
            artifactType: "docs_skills.live_quality_work_product",
          }),
        });
      },
    },
    {
      key: "qaTest",
      artifactName: "starter-qa-test-live-quality-proof.json",
      workflowId: exports.qaTestWorkflowContract.workflowId,
      jobType: exports.qaTestWorkflowContract.jobType,
      adapterId: exports.QA_TEST_WORKER_ADAPTER_ID,
      roleId: "qa_test_reviewer",
      queueName: "starter-workflow-quality",
      title: "Starter QA/test live quality proof",
      objectiveSummary:
        "Review starter workflow quality gates and identify the smallest useful validation improvement.",
      boundedPromptSummary:
        "Use QA/test worker for independent validation review without false success.",
      createAdapter({ runtimeJobs, executor, reporter, sourceEvidence }) {
        return new exports.QaTestWorkerAdapter({
          runtimeJobs,
          runner: modelBackedRunner({
            runtimeJobs,
            executor,
            reporter,
            workflowId: exports.qaTestWorkflowContract.workflowId,
            roleId: "qa_test_reviewer",
            adapterId: exports.QA_TEST_WORKER_ADAPTER_ID,
            objectiveSummary:
              "Review starter workflow quality gates and identify the smallest useful validation improvement.",
            sourceEvidence,
            artifactType: "qa_test.live_quality_work_product",
          }),
        });
      },
    },
    {
      key: "architectureSpec",
      artifactName: "starter-architecture-spec-live-quality-proof.json",
      workflowId: exports.architectureWorkflowContract.workflowId,
      jobType: exports.architectureWorkflowContract.jobType,
      adapterId: exports.ARCHITECTURE_SPEC_WORKER_ADAPTER_ID,
      roleId: "technical_spec_writer",
      queueName: "starter-workflow-quality",
      title: "Starter architecture/spec live quality proof",
      objectiveSummary:
        "Write a concise architecture note for moving non-coding workflows from fixture proof to live quality soak.",
      boundedPromptSummary:
        "Use architecture/spec worker for workflow adapter, closeout, readback, and lifecycle-truth boundaries.",
      createAdapter({ runtimeJobs, executor, reporter, sourceEvidence }) {
        return new exports.ArchitectureSpecWorkerAdapter({
          runtimeJobs,
          runner: modelBackedRunner({
            runtimeJobs,
            executor,
            reporter,
            workflowId: exports.architectureWorkflowContract.workflowId,
            roleId: "technical_spec_writer",
            adapterId: exports.ARCHITECTURE_SPEC_WORKER_ADAPTER_ID,
            objectiveSummary:
              "Write a concise architecture note for moving non-coding workflows from fixture proof to live quality soak.",
            sourceEvidence,
            artifactType: "architecture_spec.live_quality_work_product",
          }),
        });
      },
    },
  ];
}

async function fetchBoundedSourceEvidence() {
  const sources = [
    {
      url: "https://platform.openai.com/docs/guides/structured-outputs",
      sourceRef: "official-openai-docs://structured-outputs",
      titleSummary: "OpenAI structured outputs guide",
      sourceKind: "official_docs",
    },
    {
      url: "https://raw.githubusercontent.com/openai/openai-cookbook/main/examples/Structured_Outputs_Intro.ipynb",
      sourceRef: "official-openai-cookbook://structured-outputs-intro",
      titleSummary: "OpenAI Cookbook Structured Outputs intro",
      sourceKind: "official_cookbook",
    },
  ];
  const startedAt = Date.now();
  const sourceSummaries = [];
  for (const source of sources) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(source.url, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          accept: "text/html,text/plain,application/json;q=0.9,*/*;q=0.8",
          "user-agent": "OpenClaw-StarterWorkflowQualitySoak/1.0 bounded-readonly",
        },
      });
      const body = await response.text();
      sourceSummaries.push({
        sourceRef: source.sourceRef,
        sourceKind: source.sourceKind,
        urlHash: sha256(source.url),
        contentHash: sha256(body),
        titleSummary: source.titleSummary,
        citationSummary: `${source.titleSummary} was fetched read-only; HTTP ${response.status}; raw body discarded after hashing.`,
        boundedFindings:
          response.ok && source.sourceRef.includes("cookbook")
            ? [
                "The OpenAI Cookbook source is scoped to Structured Outputs and schema-shaped model output.",
                "The workflow should use this source as support for strict JSON schema contracts, required fields, and rejecting unexpected structure.",
                "The raw source body is not stored; only this bounded source summary, source ref, URL hash, and content hash are retained.",
              ]
            : [
                "Primary documentation source was checked read-only but was not available to this non-browser fetch.",
                "Use fallback official OpenAI source refs when available; do not store the challenged raw page body.",
              ],
        retrievedAt: now().toISOString(),
        latencyMs: Date.now() - startedAt,
        fetchStatus: response.ok ? "available" : "unavailable",
        rawResearchPageStored: false,
      });
    } catch (error) {
      sourceSummaries.push({
        sourceRef: source.sourceRef,
        sourceKind: source.sourceKind,
        urlHash: sha256(source.url),
        contentHash: null,
        titleSummary: source.titleSummary,
        citationSummary: `${source.titleSummary} fetch failed with bounded reason ${error instanceof Error ? error.name : "unknown_error"}.`,
        boundedFindings: [
          "Source fetch failed; this entry is evidence of source availability status only.",
        ],
        retrievedAt: now().toISOString(),
        latencyMs: Date.now() - startedAt,
        fetchStatus: "unavailable",
        rawResearchPageStored: false,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
  const available = sourceSummaries.filter((summary) => summary.fetchStatus === "available");
  const usableSummaries = available.length > 0 ? available : sourceSummaries;
  return {
    status: available.length > 0 ? "fetched" : "degraded_source_unavailable",
    sourceRefs: usableSummaries.map((summary) => summary.sourceRef),
    citationRefs: usableSummaries.map(
      (summary) => `citation://${sha256(summary.sourceRef).slice(0, 16)}`,
    ),
    sourceSummaries: usableSummaries,
    blockedSourceSummaries: sourceSummaries.filter(
      (summary) => summary.fetchStatus !== "available",
    ),
    rawResearchPageStored: false,
  };
}

function modelBackedRunner(input) {
  return {
    async run({ job }) {
      const workStarted = Date.now();
      const workProduct = await createWorkProduct({
        executor: input.executor,
        workflowId: input.workflowId,
        roleId: input.roleId,
        objectiveSummary: input.objectiveSummary,
        sourceEvidence: input.sourceEvidence,
      });
      const artifactRef = `runtime-job://${job.jobId}/${input.workflowId}/${input.extraArtifactRefSuffix ?? "work-product"}`;
      const validationRef = `runtime-job://${job.jobId}/${input.workflowId}/validation/live-quality`;
      const reviewRef = `runtime-job://${job.jobId}/${input.workflowId}/review/live-quality`;
      const modelRunRef = `model-run://${job.jobId}/${input.roleId}/${workProduct.responseHash.slice(0, 16)}`;
      const workProductMetadata = {
        artifactKind: "starter_workflow_live_work_product",
        schemaVersion: WORK_PRODUCT_SCHEMA_VERSION,
        workflowId: input.workflowId,
        roleId: input.roleId,
        modelRef: workProduct.modelRef,
        modelRunRef,
        responseHash: workProduct.responseHash,
        repairUsed: workProduct.repairUsed,
        latencyMs: Date.now() - workStarted,
        workProduct: workProduct.output,
        sourceRefs: input.sourceEvidence.sourceRefs,
        citationRefs: input.sourceEvidence.citationRefs,
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        rawResearchPageStored: false,
        workQueueLifecycleMutated: false,
      };
      await input.runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: input.artifactType,
        storageKind: "metadata",
        uri: artifactRef,
        contentType: "application/json",
        sha256: sha256(JSON.stringify(workProductMetadata)),
        sizeBytes: Buffer.byteLength(JSON.stringify(workProductMetadata), "utf8"),
        metadata: workProductMetadata,
      });
      await input.runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "starter_workflow.live_quality_validation",
        storageKind: "metadata",
        uri: validationRef,
        contentType: "application/json",
        metadata: {
          artifactKind: "starter_workflow_live_quality_validation",
          workflowId: input.workflowId,
          validationSummary: workProduct.output.validationSummary,
          reviewSummary: workProduct.output.qualitySelfAssessment,
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutated: false,
        },
      });
      await input.runtimeJobs.attachArtifact({
        jobId: job.jobId,
        artifactType: "starter_workflow.live_quality_review",
        storageKind: "metadata",
        uri: reviewRef,
        contentType: "application/json",
        metadata: {
          artifactKind: "starter_workflow_live_quality_review",
          workflowId: input.workflowId,
          reviewSummary: workProduct.output.qualitySelfAssessment,
          evidenceRefs: [artifactRef, validationRef],
          rawPromptStored: false,
          rawResponseStored: false,
          rawLogsStored: false,
          workQueueLifecycleMutated: false,
        },
      });
      const closeout = await input.reporter.createCapsule({
        factualRefs: {
          runtimeJobId: job.jobId,
          teamRunId: null,
          workflowId: input.workflowId,
          status: "completed",
          roles: [
            {
              roleId: input.roleId,
              agentId: input.roleId,
              modelRef: workProduct.modelRef,
              status: "completed",
            },
          ],
          fileRefs: [],
          artifactRefs: [artifactRef],
          validationRefs: [validationRef, reviewRef],
          runtimeEventRefs: [`runtime-job://${job.jobId}/events`],
        },
        objectiveSummary: input.objectiveSummary,
        boundedRoleEvidence: [
          {
            roleId: input.roleId,
            agentId: input.roleId,
            modelRef: workProduct.modelRef,
            modelRunRef,
            askedToDo: input.objectiveSummary,
            evidenceSummary: workProduct.output.evidenceSummary,
            artifactRefs: [artifactRef],
            validationRefs: [validationRef],
            limitations: workProduct.output.limitations,
          },
        ],
        boundedResultEvidence: {
          completed: true,
          needsReview: false,
          failed: false,
          findings: [workProduct.output.qualitySelfAssessment],
          requiredFixes: [],
          limitations: workProduct.output.limitations,
        },
      });
      return {
        status: "completed",
        summary: workProduct.output.evidenceSummary,
        workflowId: input.workflowId,
        runId: `run-${job.jobId}`,
        roleRefs: [`role://${input.roleId}`],
        modelRefs: [workProduct.modelRef, closeout.capsule.modelRef ?? "openai-codex/gpt-5.4"],
        modelRunRefs: [modelRunRef],
        sourceRefs: input.sourceEvidence.sourceRefs,
        citationRefs: input.citationRequired
          ? input.sourceEvidence.citationRefs
          : input.sourceEvidence.citationRefs.slice(0, 5),
        validationRefs: [validationRef],
        reviewRefs: [reviewRef],
        closeoutRefs: [`runtime-job://${job.jobId}/closeout-capsule/${closeout.capsule.capsuleId}`],
        completedWorkEvidenceRefs: [artifactRef],
        artifactRefs: [
          artifactRef,
          ...(input.workflowId === "workflow.research_to_coding_handoff"
            ? [`runtime-job://${job.jobId}/workflow/handoff`]
            : []),
        ],
        closeoutCapsule: closeout.capsule,
        reasonCodes: [
          "live_model_work_product_recorded",
          ...(workProduct.repairUsed ? ["model_output_repair_used"] : []),
          `${input.workflowId.replace(/[.-]/gu, "_")}_live_quality_completed`,
        ],
        result: {
          workflowId: input.workflowId,
          roleId: input.roleId,
          modelRef: workProduct.modelRef,
          modelRunRef,
          artifactRef,
          validationRef,
          reviewRef,
          closeoutCapsuleId: closeout.capsule.capsuleId,
          rawPromptStored: false,
          rawResponseStored: false,
          workQueueLifecycleMutated: false,
        },
        rawPromptStored: false,
        rawResponseStored: false,
        rawLogsStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        workQueueLifecycleMutated: false,
      };
    },
  };
}

async function createWorkProduct(input) {
  const { parseJsonModelOutput } = await mm();
  const response = await input.executor.execute({
    contract: {
      contractName: "starter_workflow_live_quality_work_product",
      contractVersion: WORK_PRODUCT_SCHEMA_VERSION,
      modelId: process.env.OPENCLAW_STARTER_WORKFLOW_MODEL_ID ?? "openai-codex/gpt-5.4",
    },
    systemPrompt: [
      "You are an OpenClaw workflow worker producing bounded task-specific work product.",
      "Return useful owner-facing work, not generic process text.",
      "Use only the supplied bounded objective and source refs.",
      "Bounded source summaries and bounded findings are valid evidence; do not require raw source pages.",
      "Do not claim file edits, tests, deploys, outbound sends, controls, authority grants, dependency installs, model promotion, or Work Queue lifecycle mutation unless those exact refs are supplied.",
      "Return only the substantive work-product fields. The runtime envelope owns storage and safety flags.",
      "Return strict JSON only. Do not include raw prompts, raw responses, transcripts, provider logs, raw web pages, secrets, or hidden reasoning.",
    ].join("\n"),
    userPrompt: JSON.stringify(
      {
        workflowId: input.workflowId,
        roleId: input.roleId,
        objectiveSummary: input.objectiveSummary,
        boundedSourceEvidence: input.sourceEvidence.sourceSummaries,
        runtimeWillAttachSafetyFlags: true,
      },
      null,
      2,
    ),
    responseFormat: "json",
    responseOptions: {
      maxOutputTokens: 5000,
      reasoningEffort: "low",
      verbosity: "low",
      transport: {
        type: "json_schema",
        name: "starter_workflow_live_quality_work_product",
        strict: true,
        schema: WORK_PRODUCT_CONTENT_JSON_SCHEMA,
      },
    },
  });
  const contract = {
    contractName: "starter_workflow_live_quality_work_product",
    contractVersion: WORK_PRODUCT_SCHEMA_VERSION,
    modelId: process.env.OPENCLAW_STARTER_WORKFLOW_MODEL_ID ?? "openai-codex/gpt-5.4",
  };
  let output;
  let repairUsed = false;
  try {
    output = withRuntimeSafetyFlags(
      parseJsonModelOutput(response, contract, WorkProductContentSchema),
    );
  } catch {
    repairUsed = true;
    const repaired = await input.executor.execute({
      contract,
      systemPrompt: [
        "Repair the prior model output into the exact starter workflow work-product schema.",
        "Preserve useful work, validation, limitations, and ELI5 progress.",
        "Return only the substantive work-product fields. The runtime envelope owns storage and safety flags.",
        "Return strict JSON only. Do not include raw prompts, raw responses, transcripts, provider logs, tool logs, raw web pages, secrets, or hidden reasoning.",
      ].join("\n"),
      userPrompt: JSON.stringify(
        {
          workflowId: input.workflowId,
          roleId: input.roleId,
          objectiveSummary: input.objectiveSummary,
          priorOutputVolatileNotStored: response.outputText,
          runtimeWillAttachSafetyFlags: true,
        },
        null,
        2,
      ),
      responseFormat: "json",
      responseOptions: {
        maxOutputTokens: 5000,
        reasoningEffort: "low",
        verbosity: "low",
        transport: {
          type: "json_schema",
          name: "starter_workflow_live_quality_work_product_repair",
          strict: true,
          schema: WORK_PRODUCT_CONTENT_JSON_SCHEMA,
        },
      },
    });
    output = withRuntimeSafetyFlags(
      parseJsonModelOutput(repaired, contract, WorkProductContentSchema),
    );
  }
  return {
    output,
    modelRef:
      response.resolvedModelId ??
      process.env.OPENCLAW_STARTER_WORKFLOW_MODEL_ID ??
      "openai-codex/gpt-5.4",
    responseHash: sha256(response.outputText),
    repairUsed,
  };
}

function withRuntimeSafetyFlags(output) {
  return WorkProductSchema.parse({
    ...output,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawResearchPageStored: false,
    authorityGranted: false,
    controlsApplied: false,
    deployPerformed: false,
    outboundSendPerformed: false,
    dependencyInstallPerformed: false,
    modelPromotionPerformed: false,
    workQueueLifecycleMutated: false,
  });
}

async function enqueueWorkflow({ runtimeJobs, workQueue, spec, suffix }) {
  const workItemId = `starter-quality-${spec.key}-${suffix}`;
  const runtimeJobId = `starter-quality-${spec.key}-${suffix}`;
  await workQueue.createWorkItem({
    workItemId,
    itemType: "starter_workflow_live_quality",
    title: spec.title,
    description: spec.boundedPromptSummary,
    metadata: {
      workflowId: spec.workflowId,
      expectedWorkerAdapterId: spec.adapterId,
      promptHash: sha256(spec.boundedPromptSummary),
      boundedPromptSummary: spec.boundedPromptSummary,
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
    },
  });
  await runtimeJobs.enqueueJob({
    jobId: runtimeJobId,
    jobType: spec.jobType,
    queueName: spec.queueName,
    workItemId,
    payload: {
      workflowId: spec.workflowId,
      objectiveSummary: spec.objectiveSummary,
      promptHash: sha256(spec.boundedPromptSummary),
      boundedPromptSummary: spec.boundedPromptSummary,
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
    },
    idempotencyScope: "starter-workflow-live-quality",
    idempotencyKey: `${spec.key}:${suffix}`,
    parentWorkflowId: spec.workflowId,
    maxAttempts: 1,
    leaseTimeoutMs: 180_000,
    runTimeoutMs: 900_000,
  });
  await workQueue.createWorkRun({
    runId: `starter-quality-run-${spec.key}-${suffix}`,
    workItemId,
    executorKind: "runtime_job",
    runtimeJobId,
    metadata: {
      workflowId: spec.workflowId,
      expectedWorkerAdapterId: spec.adapterId,
      workQueueLifecycleMutationAllowed: false,
    },
  });
  return { runtimeJobId, workItemId };
}

async function summarizeWorkflow({
  runtimeJobs,
  workQueue,
  spec,
  runtimeJobId,
  workItemId,
  workerRun,
  qualityGate,
}) {
  const job = await runtimeJobs.getJob(runtimeJobId);
  const artifacts = await runtimeJobs.listArtifacts(runtimeJobId);
  const closeoutArtifact = artifacts.findLast(
    (artifact) => artifact.artifactType === "execution_platform.closeout_capsule",
  );
  const closeoutCapsule = closeoutArtifact?.metadata ?? null;
  const readback = await buildWorkQueueReadback({ workQueue, runtimeJobs, workItemId });
  const workProductArtifact = artifacts.find((artifact) =>
    artifact.artifactType.includes("live_quality"),
  );
  const workProduct = workProductArtifact?.metadata?.workProduct ?? null;
  return {
    artifactKind: "starter_workflow_live_quality_proof",
    status: qualityGate.acceptedForLiveQuality ? "passed" : qualityGate.status,
    workflowId: spec.workflowId,
    workerAdapterId: workerRun.adapterId,
    runtimeJobId,
    workItemId,
    runtimeState: job?.state ?? null,
    roleRefs: [`role://${spec.roleId}`],
    modelRefs: modelRefsFromArtifacts(artifacts),
    modelRunRefs: modelRunRefsFromArtifacts(artifacts),
    sourceRefs: sourceRefsFromArtifacts(artifacts),
    citationRefs: citationRefsFromArtifacts(artifacts),
    artifactRefs: artifacts.map((artifact) => artifact.uri).slice(0, 30),
    validationRefs: artifacts
      .map((artifact) => artifact.uri)
      .filter((uri) => uri.includes("validation"))
      .slice(0, 20),
    reviewRefs: artifacts
      .map((artifact) => artifact.uri)
      .filter((uri) => uri.includes("review"))
      .slice(0, 20),
    closeoutCapsuleId: closeoutCapsule?.capsuleId ?? null,
    closeoutCapsuleHash: closeoutArtifact?.sha256 ?? null,
    humanCloseoutSummary:
      typeof closeoutCapsule?.humanReport?.reportMarkdown === "string"
        ? closeoutCapsule.humanReport.reportMarkdown.slice(0, 1200)
        : null,
    eli5Progress:
      typeof closeoutCapsule?.humanReport?.eli5Progress === "string"
        ? closeoutCapsule.humanReport.eli5Progress.slice(0, 1000)
        : null,
    workProductSummary:
      workProduct && typeof workProduct === "object" && !Array.isArray(workProduct)
        ? {
            artifactTitle: workProduct.artifactTitle,
            evidenceSummary: workProduct.evidenceSummary,
            validationSummary: workProduct.validationSummary,
            qualitySelfAssessment: workProduct.qualitySelfAssessment,
            limitations: workProduct.limitations,
          }
        : null,
    workQueueReadback: readback,
    qualityGate,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawResearchPageStored: false,
    runtimeJobsCreated: true,
    authorityGranted: false,
    controlsApplied: false,
    deployPerformed: false,
    outboundSendPerformed: false,
    dependencyInstallPerformed: false,
    modelPromotionPerformed: false,
    workQueueLifecycleMutated: false,
  };
}

async function buildWorkQueueReadback({ workQueue, runtimeJobs, workItemId }) {
  const { buildWorkQueueExecutionReadModel, summarizeWorkQueueExecutionForUi } = await ep();
  const model = await buildWorkQueueExecutionReadModel({ workQueue, runtimeJobs, workItemId });
  return summarizeWorkQueueExecutionForUi(model);
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function metadataRecords(artifacts) {
  return artifacts.map((artifact) => asRecord(artifact.metadata));
}

function modelRefsFromArtifacts(artifacts) {
  return [
    ...new Set(
      metadataRecords(artifacts)
        .flatMap((metadata) => [metadata.modelRef, metadata.workProduct?.modelRef])
        .filter((value) => typeof value === "string"),
    ),
  ].slice(0, 20);
}

function modelRunRefsFromArtifacts(artifacts) {
  return [
    ...new Set(
      metadataRecords(artifacts)
        .flatMap((metadata) => [metadata.modelRunRef, metadata.workProduct?.modelRunRef])
        .filter((value) => typeof value === "string"),
    ),
  ].slice(0, 20);
}

function sourceRefsFromArtifacts(artifacts) {
  return [
    ...new Set(
      metadataRecords(artifacts)
        .flatMap((metadata) => metadata.sourceRefs ?? [])
        .filter((value) => typeof value === "string"),
    ),
  ].slice(0, 20);
}

function citationRefsFromArtifacts(artifacts) {
  return [
    ...new Set(
      metadataRecords(artifacts)
        .flatMap((metadata) => metadata.citationRefs ?? [])
        .filter((value) => typeof value === "string"),
    ),
  ].slice(0, 20);
}

async function runOne({
  runtimeJobs,
  workQueue,
  executor,
  reporter,
  sourceEvidence,
  spec,
  suffix,
}) {
  const exports = await ep();
  const { runtimeJobId, workItemId } = await enqueueWorkflow({
    runtimeJobs,
    workQueue,
    spec,
    suffix,
  });
  const adapter = spec.createAdapter({ runtimeJobs, executor, reporter, sourceEvidence });
  const workerRun = await new exports.RuntimeWorkerSupervisor({
    repository: runtimeJobs,
    workerId: `starter-quality-worker-${spec.key}`,
    queueName: spec.queueName,
    adapters: [adapter],
    leaseRenewalIntervalMs: 10_000,
    leaseRenewalExtendByMs: 180_000,
  }).runOnce({ runtimeJobId });
  const artifacts = await runtimeJobs.listArtifacts(runtimeJobId);
  const job = await runtimeJobs.getJob(runtimeJobId);
  const qualityInput = {
    workflowId: spec.workflowId,
    workerAdapterId: workerRun.adapterId,
    expectedWorkerAdapterId: spec.adapterId,
    runtimeJobId,
    runtimeState: job?.state ?? null,
    roleRefs: [`role://${spec.roleId}`],
    modelRefs: modelRefsFromArtifacts(artifacts),
    modelRunRefs: modelRunRefsFromArtifacts(artifacts),
    artifactRefs: artifacts.map((artifact) => artifact.uri).slice(0, 30),
    sourceRefs: sourceRefsFromArtifacts(artifacts),
    citationRefs: citationRefsFromArtifacts(artifacts),
    validationRefs: artifacts
      .map((artifact) => artifact.uri)
      .filter((uri) => uri.includes("validation")),
    reviewRefs: artifacts.map((artifact) => artifact.uri).filter((uri) => uri.includes("review")),
    closeoutCapsule:
      artifacts.findLast(
        (artifact) => artifact.artifactType === "execution_platform.closeout_capsule",
      )?.metadata ?? null,
    workQueueReadbackPresent: Boolean(
      await buildWorkQueueReadback({ workQueue, runtimeJobs, workItemId }),
    ),
    workQueueReadbackSummary: `work-item:${workItemId}`,
    limitations: [],
    reasonCodes: workerRun.reasonCodes,
    fixtureEvidenceUsed: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawResearchPageStored: false,
    authorityGranted: false,
    controlsApplied: false,
    deployPerformed: false,
    outboundSendPerformed: false,
    dependencyInstallPerformed: false,
    modelPromotionPerformed: false,
    workQueueLifecycleMutated: false,
  };
  const qualityGate = exports.evaluateStarterWorkflowQualityGate(qualityInput);
  const proof = await summarizeWorkflow({
    runtimeJobs,
    workQueue,
    spec,
    runtimeJobId,
    workItemId,
    workerRun,
    qualityGate,
  });
  writeArtifact(spec.artifactName, proof);
  return proof;
}

async function main() {
  const exports = await ep();
  const { CodexAppServerJsonExecutor } = await mm();
  const runtime = await createRuntime();
  writeArtifact("starter-workflow-live-quality-soak-preflight.json", {
    artifactKind: "starter_workflow_live_quality_soak_preflight",
    status: runtime.kind === "blocked" ? "blocked_runtime_boundary" : "completed",
    runtimeKind: runtime.kind,
    readiness: runtime.readiness ? summarizeReadiness(runtime.readiness) : null,
    gate: runtime.gate ?? null,
    priorArtifacts: [
      ".artifacts/execution-platform/slices-15-19-worker-adapter-summary.json",
      ".artifacts/execution-platform/slices-15-19-worker-adapter-integration-proof.json",
      ".artifacts/execution-platform/manual-closeout-slices-15-19-worker-adapter-proof.json",
    ].map((artifactPath) => ({
      path: artifactPath,
      exists: fs.existsSync(path.join(root, artifactPath)),
    })),
    liveModelCallsAllowed: true,
    liveProviderPath: "codex_app_server_json_executor",
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  });
  if (runtime.kind === "blocked") {
    writeArtifact("starter-workflow-live-quality-soak-summary.json", {
      artifactKind: "starter_workflow_live_quality_soak_summary",
      status: "blocked_runtime_boundary",
      blocker: runtime.gate,
      readiness: summarizeReadiness(runtime.readiness),
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      workQueueLifecycleMutated: false,
    });
    await runtime.runtime?.pool?.end?.();
    return;
  }

  const executor = new CodexAppServerJsonExecutor({
    cwd: root,
    requestTimeoutMs: Number(process.env.OPENCLAW_STARTER_WORKFLOW_MODEL_TIMEOUT_MS ?? 360_000),
    reasoningEffort: "low",
  });
  const reporter = new exports.ModelCloseoutCapsuleReporter({
    executor,
    modelId: process.env.OPENCLAW_STARTER_WORKFLOW_CLOSEOUT_MODEL_ID ?? "openai-codex/gpt-5.4",
    reasoningEffort: "low",
    maxOutputTokens: 8000,
    closeoutTimeoutMs: 180_000,
    opportunitySeedRepairTimeoutMs: 60_000,
  });
  const sourceEvidence = await fetchBoundedSourceEvidence();
  const suffix = `${Date.now()}`;
  const specs = workflowSpecs(exports);
  const selected = hasArg("--shakedown-only") ? specs.slice(0, 1) : specs;
  const results = [];
  try {
    for (const spec of selected) {
      const result = await runOne({
        runtimeJobs: runtime.runtimeJobs,
        workQueue: runtime.workQueue,
        executor,
        reporter,
        sourceEvidence,
        spec,
        suffix,
      });
      results.push(result);
      if (spec.key === "webResearch") {
        writeArtifact("starter-web-research-shakedown-proof.json", {
          artifactKind: "starter_web_research_shakedown_proof",
          status: result.status,
          result,
          rawPromptStored: false,
          rawResponseStored: false,
          rawProviderLogStored: false,
          rawResearchPageStored: false,
          workQueueLifecycleMutated: false,
        });
      }
    }
  } finally {
    await runtime.runtime?.pool?.end?.();
    await runtime.runtime?.close?.();
  }
  const passed = results.filter((result) => result.qualityGate.acceptedForLiveQuality).length;
  const status = passed === selected.length ? "passed" : "needs_review";
  writeArtifact("starter-workflow-live-quality-soak-index.json", {
    artifactKind: "starter_workflow_live_quality_soak_index",
    status,
    runtimeKind: runtime.kind,
    workflowCount: selected.length,
    passed,
    resultRefs: results.map((result) => ({
      workflowId: result.workflowId,
      runtimeJobId: result.runtimeJobId,
      artifactPath: `.artifacts/execution-platform/${selected.find((spec) => spec.workflowId === result.workflowId)?.artifactName}`,
      status: result.status,
      reasonCodes: result.qualityGate.reasonCodes,
    })),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawResearchPageStored: false,
    workQueueLifecycleMutated: false,
  });
  writeArtifact("starter-workflow-live-quality-soak-work-queue-proof.json", {
    artifactKind: "starter_workflow_live_quality_soak_work_queue_proof",
    status,
    readbackPresentCount: results.filter((result) => Boolean(result.workQueueReadback)).length,
    workflowReadbacks: results.map((result) => ({
      workflowId: result.workflowId,
      runtimeJobId: result.runtimeJobId,
      workItemId: result.workItemId,
      hasReadback: Boolean(result.workQueueReadback),
      qualityGateStatus: result.qualityGate.status,
    })),
    workQueueLifecycleMutated: false,
    rawPromptStored: false,
    rawResponseStored: false,
  });
  writeArtifact("starter-workflow-live-quality-assessment.json", {
    artifactKind: "starter_workflow_live_quality_assessment",
    status,
    assessments: results.map((result) => ({
      workflowId: result.workflowId,
      adapterUsed: result.workerAdapterId,
      modelsUsed: result.modelRefs,
      rolesUsed: result.roleRefs,
      qualityResult: result.qualityGate.status,
      workProductSummary: result.workProductSummary,
      closeoutSummary: result.humanCloseoutSummary,
      eli5Progress: result.eli5Progress,
      limitations: result.workProductSummary?.limitations ?? [],
    })),
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    workQueueLifecycleMutated: false,
  });
  writeArtifact("starter-workflow-live-quality-soak-summary.json", {
    artifactKind: "starter_workflow_live_quality_soak_summary",
    status,
    runtimeKind: runtime.kind,
    workflowCount: selected.length,
    passed,
    failedOrNeedsReview: selected.length - passed,
    workflowResults: results.map((result) => ({
      workflowId: result.workflowId,
      status: result.status,
      runtimeJobId: result.runtimeJobId,
      workerAdapterId: result.workerAdapterId,
      reasonCodes: result.qualityGate.reasonCodes,
      modelRefs: result.modelRefs,
    })),
    realModelCallsMade: true,
    providerPath: "codex_app_server_json_executor",
    runtimeJobsCreated: true,
    authorityGranted: false,
    controlsApplied: false,
    deployPerformed: false,
    outboundSendPerformed: false,
    dependencyInstallPerformed: false,
    modelPromotionPerformed: false,
    rawPromptStored: false,
    rawResponseStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    rawResearchPageStored: false,
    workQueueLifecycleMutated: false,
  });
}

await main();
process.exit(0);
