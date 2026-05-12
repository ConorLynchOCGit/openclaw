#!/usr/bin/env node
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(root, ".artifacts/execution-platform");
let executionPlatform;
let closeoutFixtures;

async function ep() {
  executionPlatform ??= await tsImport(
    path.join(root, "extensions/execution-platform/src/index.ts"),
    import.meta.url,
  );
  return executionPlatform;
}

async function fixtures() {
  closeoutFixtures ??= await tsImport(
    path.join(root, "extensions/execution-platform/src/workers/test-closeout-capsule-fixture.ts"),
    import.meta.url,
  );
  return closeoutFixtures;
}

function sha256(value) {
  return createHash("sha256")
    .update(String(value ?? ""), "utf8")
    .digest("hex");
}

function writeArtifact(name, value) {
  fs.mkdirSync(artifactDir, { recursive: true });
  const body = `${JSON.stringify({ ...value, generatedAt: new Date().toISOString() }, null, 2)}\n`;
  fs.writeFileSync(path.join(artifactDir, name), body);
  return { path: `.artifacts/execution-platform/${name}`, sha256: sha256(body) };
}

async function enqueue(repository, input) {
  await repository.enqueueJob({
    jobId: input.jobId,
    jobType: input.jobType,
    queueName: "slices-15-19-worker-adapters",
    maxAttempts: 1,
    payload: {
      workflowId: input.workflowId,
      objectiveSummary: "Bounded worker adapter proof for OpenClaw convergence slices 15-19.",
      rawPromptStored: false,
      rawResponseStored: false,
      workQueueLifecycleMutated: false,
    },
  });
}

async function runnerResult(input) {
  const { createModelAuthoredCloseoutCapsuleFixture } = await fixtures();
  const artifactRef = `runtime-job://${input.job.jobId}/${input.workflowId}/bounded-evidence`;
  const validationRef = `runtime-job://${input.job.jobId}/${input.workflowId}/validation`;
  return {
    status: "completed",
    summary: `${input.workflowId} worker completed bounded workflow evidence.`,
    workflowId: input.workflowId,
    runId: `run-${input.job.jobId}`,
    roleRefs: [`role://${input.roleId}`],
    modelRefs: [input.modelRef],
    modelRunRefs: [`model-run://${input.job.jobId}/${input.roleId}`],
    sourceRefs: input.citationRefs ?? [],
    citationRefs: input.citationRefs ?? [],
    validationRefs: [validationRef],
    reviewRefs: [`runtime-job://${input.job.jobId}/${input.workflowId}/review`],
    closeoutRefs: [`runtime-job://${input.job.jobId}/${input.workflowId}/closeout`],
    completedWorkEvidenceRefs: [artifactRef],
    artifactRefs: [artifactRef],
    closeoutCapsule: createModelAuthoredCloseoutCapsuleFixture({
      runtimeJobId: input.job.jobId,
      workflowId: input.workflowId,
      roleId: input.roleId,
      modelRef: input.modelRef,
      artifactRefs: [artifactRef],
      validationRefs: [validationRef],
      fileRefs: [`workflow://${input.workflowId}`],
      reportMarkdown: `${input.workflowId} produced bounded model-authored closeout evidence.`,
      eli5Progress: "OpenClaw ran the workflow worker and saved a clear closeout.",
    }),
    reasonCodes: [input.reasonCode],
    rawPromptStored: false,
    rawResponseStored: false,
    rawLogsStored: false,
    rawProviderLogStored: false,
    rawToolLogStored: false,
    workQueueLifecycleMutated: false,
  };
}

async function main() {
  const {
    applyExecutionPlatformMigrations,
    createExecutionPlatformPgMemTestDatabase,
    RuntimeJobRepository,
    RuntimeWorkerSupervisor,
    WebResearchWorkerAdapter,
    ResearchToCodingHandoffWorkerAdapter,
    DocsSkillsWorkerAdapter,
    QaTestWorkerAdapter,
    ArchitectureSpecWorkerAdapter,
    RESEARCH_TO_CODING_HANDOFF_JOB_TYPE,
    RESEARCH_TO_CODING_HANDOFF_WORKFLOW_ID,
    validateResearchToCodingWorkerHandoff,
    webResearchWorkflowContract,
    docsSkillsWorkflowContract,
    qaTestWorkflowContract,
    architectureWorkflowContract,
  } = await ep();

  const database = await createExecutionPlatformPgMemTestDatabase();
  try {
    await applyExecutionPlatformMigrations(database.sql);
    const runtimeJobs = new RuntimeJobRepository(database.sql, { claimStrategy: "basic" });
    const adapterProofs = [];
    const adapters = [
      new WebResearchWorkerAdapter({
        runtimeJobs,
        runner: {
          async run({ job }) {
            return runnerResult({
              job,
              workflowId: webResearchWorkflowContract.workflowId,
              roleId: "web_researcher",
              modelRef: "model://fixture-web-researcher",
              reasonCode: "web_research_worker_fixture_completed",
              citationRefs: [`runtime-job://${job.jobId}/web-research/citation-ref`],
            });
          },
        },
      }),
      new ResearchToCodingHandoffWorkerAdapter({
        runtimeJobs,
        runner: {
          async run({ job }) {
            const handoff = validateResearchToCodingWorkerHandoff({
              parentRuntimeJobId: job.jobId,
              childRuntimeJobId: `${job.jobId}-child-web-research`,
              childEvidenceRef: `runtime-job://${job.jobId}/child-web-research/evidence`,
            });
            return {
              ...(await runnerResult({
                job,
                workflowId: RESEARCH_TO_CODING_HANDOFF_WORKFLOW_ID,
                roleId: "handoff_coordinator",
                modelRef: "model://fixture-handoff-coordinator",
                reasonCode: "research_to_coding_handoff_fixture_completed",
              })),
              result: {
                handoffAccepted: handoff.accepted,
                handoffReasonCodes: handoff.reasonCodes,
                parentWorkflowId: "agent_team.coding",
                childWorkflowId: "single_agent.web_research",
                rawPromptStored: false,
                rawResponseStored: false,
                workQueueLifecycleMutated: false,
              },
            };
          },
        },
      }),
      new DocsSkillsWorkerAdapter({
        runtimeJobs,
        runner: {
          async run({ job }) {
            return runnerResult({
              job,
              workflowId: docsSkillsWorkflowContract.workflowId,
              roleId: "docs_skills_writer",
              modelRef: "model://fixture-docs-skills-writer",
              reasonCode: "docs_skills_worker_fixture_completed",
            });
          },
        },
      }),
      new QaTestWorkerAdapter({
        runtimeJobs,
        runner: {
          async run({ job }) {
            return runnerResult({
              job,
              workflowId: qaTestWorkflowContract.workflowId,
              roleId: "qa_test_reviewer",
              modelRef: "model://fixture-qa-test-reviewer",
              reasonCode: "qa_test_worker_fixture_completed",
            });
          },
        },
      }),
      new ArchitectureSpecWorkerAdapter({
        runtimeJobs,
        runner: {
          async run({ job }) {
            return runnerResult({
              job,
              workflowId: architectureWorkflowContract.workflowId,
              roleId: "technical_spec_writer",
              modelRef: "model://fixture-technical-spec-writer",
              reasonCode: "architecture_spec_worker_fixture_completed",
            });
          },
        },
      }),
    ];
    const jobs = [
      {
        slice: 15,
        jobId: "slice-15-web-research-worker-proof",
        jobType: webResearchWorkflowContract.jobType,
        workflowId: webResearchWorkflowContract.workflowId,
        artifactName: "slice-15-web-research-worker-adapter-proof.json",
      },
      {
        slice: 16,
        jobId: "slice-16-research-to-coding-handoff-proof",
        jobType: RESEARCH_TO_CODING_HANDOFF_JOB_TYPE,
        workflowId: RESEARCH_TO_CODING_HANDOFF_WORKFLOW_ID,
        artifactName: "slice-16-research-to-coding-handoff-worker-proof.json",
      },
      {
        slice: 17,
        jobId: "slice-17-docs-skills-worker-proof",
        jobType: docsSkillsWorkflowContract.jobType,
        workflowId: docsSkillsWorkflowContract.workflowId,
        artifactName: "slice-17-docs-skills-worker-adapter-proof.json",
      },
      {
        slice: 18,
        jobId: "slice-18-qa-test-worker-proof",
        jobType: qaTestWorkflowContract.jobType,
        workflowId: qaTestWorkflowContract.workflowId,
        artifactName: "slice-18-qa-test-worker-adapter-proof.json",
      },
      {
        slice: 19,
        jobId: "slice-19-architecture-spec-worker-proof",
        jobType: architectureWorkflowContract.jobType,
        workflowId: architectureWorkflowContract.workflowId,
        artifactName: "slice-19-architecture-spec-worker-adapter-proof.json",
      },
    ];
    for (const job of jobs) {
      await enqueue(runtimeJobs, job);
    }
    const runs = await new RuntimeWorkerSupervisor({
      repository: runtimeJobs,
      workerId: "slices-15-19-worker-supervisor",
      queueName: "slices-15-19-worker-adapters",
      adapters,
    }).runUntilIdle(10);
    for (const job of jobs) {
      const runtimeJob = await runtimeJobs.getJob(job.jobId);
      const artifacts = await runtimeJobs.listArtifacts(job.jobId);
      const result = {
        artifactKind: `slice_${job.slice}_worker_adapter_proof`,
        status: runtimeJob?.state === "succeeded" ? "completed" : "blocked",
        runtimeJobId: job.jobId,
        workflowId: job.workflowId,
        jobType: job.jobType,
        adapterResultStatus: runs.find((run) => run.runtimeJobId === job.jobId)?.status ?? null,
        artifactTypes: artifacts.map((artifact) => artifact.artifactType).slice(0, 30),
        artifactRefs: artifacts.map((artifact) => artifact.uri).slice(0, 30),
        rawPromptStored: false,
        rawResponseStored: false,
        rawProviderLogStored: false,
        rawToolLogStored: false,
        runtimeJobsCreated: true,
        authorityGranted: false,
        controlsApplied: false,
        deployPerformed: false,
        outboundSendPerformed: false,
        workQueueLifecycleMutated: false,
      };
      adapterProofs.push(writeArtifact(job.artifactName, result));
    }
    writeArtifact("slices-15-19-worker-adapter-integration-proof.json", {
      artifactKind: "slices_15_19_worker_adapter_integration_proof",
      status:
        runs.length === 5 && runs.every((run) => run.status === "completed")
          ? "completed"
          : "blocked",
      workerRunResults: runs,
      artifactProofRefs: adapterProofs,
      runtimeJobsCreated: true,
      authorityGranted: false,
      controlsApplied: false,
      deployPerformed: false,
      outboundSendPerformed: false,
      modelPromotionPerformed: false,
      rawPromptStored: false,
      rawResponseStored: false,
      rawProviderLogStored: false,
      rawToolLogStored: false,
      workQueueLifecycleMutated: false,
    });
  } finally {
    await database.close();
  }
}

await main();
